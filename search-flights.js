const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
//  CONFIGURACIÓN — ajusta aquí tus parámetros
// ═══════════════════════════════════════════════════════════
const CONFIG = {
  origin: 'MEX',
  destination: 'BUD',
  searches: [
    // IDA jul 2 → VUELTA jul 24 (principal)
    { depart: '2027-07-02', return: '2027-07-24' },
    // Alternativas de ida
    { depart: '2027-07-01', return: '2027-07-24' },
    { depart: '2027-07-03', return: '2027-07-24' },
    // Alternativas de vuelta
    { depart: '2027-07-02', return: '2027-07-21' },
    { depart: '2027-07-02', return: '2027-07-27' },
    // Salida anticipada
    { depart: '2027-06-30', return: '2027-07-24' },
  ],
  premiumFor: { depart: '2027-07-02', return: '2027-07-24' },
  currency: 'USD',
  sundayLatestArrivalHour: 14,
  outputDir: './flight-results',
  historyFile: './flight-results/price-history.json',
};

// Pon HEADLESS=false para ver el navegador mientras busca
const HEADLESS = process.env.HEADLESS !== 'false';

function buildGoogleFlightsURL(depart, ret, cabin) {
  const cabinText = cabin === 'premium_economy' ? ' premium economy' : ' economy';
  const q = `Flights to ${CONFIG.destination} from ${CONFIG.origin} on ${depart} through ${ret}${cabinText}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${CONFIG.currency}&hl=en&gl=us`;
}

function to24h(time) {
  const m = (time || '').match(/(\d{1,2}):(\d{2})\s?([AP]M)/i);
  if (!m) return NaN;
  let h = parseInt(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return h + parseInt(m[2]) / 60;
}

function arrivalTag(f) {
  const m = (f.arriveDate || '').match(/(June|July) (\d+)/);
  if (!m) return '';
  const day = m[1] === 'June' ? 0 : parseInt(m[2]);
  if (day >= 5) return '❌ llega tarde';
  if (day === 4) return to24h(f.arriveTime) < CONFIG.sundayLatestArrivalHour ? '✅ dom 4 temprano' : '⚠️ dom 4 tarde';
  if (day === 3) return '✅ sáb 3';
  return 'llega antes del sáb';
}

// Google Flights describe cada vuelo así:
// "From 1,234 US dollars round trip total. 1 stop flight with Lufthansa. Leaves Mexico City
//  International Airport at 5:30 PM on Friday, July 2 and arrives at Budapest Ferenc Liszt
//  International Airport at 2:15 PM on Saturday, July 3. Total duration 15 hr 45 min.
//  Layover (1 of 1) is a 2 hr layover at Frankfurt Airport in Frankfurt. ..."
function parseFlightInfo(label) {
  const info = { raw: label };
  const price = label.match(/From ([\d,]+) US dollars/i);
  if (price) info.price = parseInt(price[1].replace(/,/g, ''));
  if (/Nonstop/i.test(label)) info.stops = 0;
  else {
    const s = label.match(/(\d+) stops? flight/i);
    if (s) info.stops = parseInt(s[1]);
  }
  const airline = label.match(/flight with ([^.]+)\./i);
  if (airline) info.airline = airline[1].trim();
  const dep = label.match(/Leaves .+? at (\d{1,2}:\d{2}\s?[AP]M) on (\w+, \w+ \d+)/i);
  if (dep) { info.departTime = dep[1]; info.departDate = dep[2]; }
  const arr = label.match(/arrives at .+? at (\d{1,2}:\d{2}\s?[AP]M) on (\w+, \w+ \d+)/i);
  if (arr) { info.arriveTime = arr[1]; info.arriveDate = arr[2]; }
  const dur = label.match(/Total duration (\d+) hr(?: (\d+) min)?/i);
  if (dur) info.duration = `${dur[1]}h${dur[2] || 0}m`;
  const layovers = [...label.matchAll(/layover at [^.]+? in ([^.]+?)\./gi)].map(m => m[1].trim());
  if (layovers.length) info.layovers = layovers;
  info.arrivalTag = arrivalTag(info);
  return info;
}

const MAX_ATTEMPTS = 3;

async function loadResults(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  for (const text of ['Accept all', 'Aceptar todo', 'I agree', 'Acepto']) {
    const btn = page.locator(`button:has-text("${text}")`).first();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click();
      break;
    }
  }

  // Esperar a que aparezcan los resultados o el error de Google
  await Promise.race([
    page.waitForSelector('[aria-label^="From "]', { timeout: 30000 }),
    page.getByText('something went wrong', { exact: false }).first().waitFor({ timeout: 30000 }),
  ]).catch(() => {});
  await page.waitForTimeout(2000);

  return page.evaluate(() => [...new Set(
    [...document.querySelectorAll('[aria-label]')]
      .map(e => e.getAttribute('aria-label'))
      .filter(l => /^From [\d,]+ US dollars/i.test(l))
  )]);
}

async function searchCabin(context, depart, ret, cabin, screenshotDir) {
  const url = buildGoogleFlightsURL(depart, ret, cabin);
  console.log(`\n🔍 ${depart} → ${ret} [${cabin}]`);
  const page = await context.newPage();

  try {
    let labels = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      labels = await loadResults(page, url);
      if (labels.length > 0) break;
      if (attempt < MAX_ATTEMPTS) {
        console.log(`   ↻ Google no mostró resultados, reintentando (${attempt + 1}/${MAX_ATTEMPTS})...`);
        await page.waitForTimeout(8000 + Math.random() * 7000);
      }
    }

    const ssPath = path.join(screenshotDir, `${depart}_${ret}_${cabin}.png`);
    await page.screenshot({ path: ssPath, fullPage: true });

    const flights = labels.map(parseFlightInfo)
      .filter(f => f.price)
      .sort((a, b) => a.price - b.price);

    if (flights.length > 0) {
      const f = flights[0];
      console.log(`   ✅ ${flights.length} vuelos — más barato: $${f.price} USD (${f.airline || 'N/A'}, ${f.stops ?? '?'} escala(s), ${f.duration || 'N/A'})`);
    } else {
      console.log(`   ❌ Sin resultados — revisa la captura: ${ssPath}`);
    }

    return { search: { depart, return: ret, cabin }, url, screenshot: ssPath, flights };
  } catch (e) {
    console.log(`   ❌ Error: ${e.message.split('\n')[0]}`);
    return { search: { depart, return: ret, cabin }, url, flights: [], error: e.message };
  } finally {
    await page.close();
  }
}

const pause = () => new Promise(r => setTimeout(r, 6000 + Math.random() * 6000));

function flightLine(f) {
  const stops = f.stops === 0 ? 'directo' : `${f.stops ?? '?'} escala(s)${f.layovers ? ' (' + f.layovers.join(', ') + ')' : ''}`;
  const arrival = f.arriveDate ? `llega ${f.arriveDate} ${f.arriveTime}` : '';
  return `    $${f.price} USD | ${f.airline || 'N/A'} | ${stops} | ${f.duration || 'N/A'} | ${arrival} ${f.arrivalTag || ''}`;
}

function usable(f) {
  return !/^(❌|⚠️)/.test(f.arrivalTag || '');
}

function generateReport(allResults, timestamp) {
  const lines = [];
  lines.push(`\n${'═'.repeat(70)}`);
  lines.push(`  REPORTE DE VUELOS REDONDOS: MEX → BUD (Julio 2027)`);
  lines.push(`  Fecha de búsqueda: ${timestamp}`);
  lines.push(`  Precios: total ida y vuelta por persona (Google Flights)`);
  lines.push(`${'═'.repeat(70)}`);

  for (const [cabin, title] of [['economy', 'ECONOMY'], ['premium_economy', 'PREMIUM ECONOMY']]) {
    lines.push(`\n── ${title} ${'─'.repeat(50 - title.length)}`);
    const results = allResults.filter(r => r.search.cabin === cabin);
    for (const r of results) {
      lines.push(`\n  Ida ${r.search.depart} → Vuelta ${r.search.return}:`);
      if (r.flights.length === 0) lines.push('    (sin resultados — revisa la captura)');
      r.flights.slice(0, 5).forEach(f => lines.push(flightLine(f)));
    }
  }

  const best = cabin => allResults
    .filter(r => r.search.cabin === cabin)
    .flatMap(r => r.flights.filter(usable).map(f => ({ ...f, search: r.search })))
    .sort((a, b) => a.price - b.price)[0];
  const e = best('economy');
  const p = best('premium_economy');

  lines.push('\n── RESUMEN (solo vuelos que llegan a tiempo) ──────────────');
  if (e) lines.push(`  💰 Mejor Economy:         $${e.price} USD — ${e.airline || 'N/A'}, ida ${e.search.depart} / vuelta ${e.search.return}`);
  if (p) lines.push(`  💰 Mejor Premium Economy: $${p.price} USD — ${p.airline || 'N/A'}, ida ${p.search.depart} / vuelta ${p.search.return}`);
  if (e && p) {
    const diff = (p.price - e.price) / e.price * 100;
    lines.push(`  📊 Diferencia PE vs E:    +${diff.toFixed(1)}%`);
    if (diff < 25) lines.push('  🔔 ¡ALERTA! Premium Economy está a menos del 25% de Economy.');
  }
  if (e && e.price < 800) lines.push('  🔔 ¡ALERTA! Economy por debajo de $800 USD.');
  lines.push(`\n${'═'.repeat(70)}\n`);

  return { text: lines.join('\n'), minEcon: e?.price ?? null, minPrem: p?.price ?? null };
}

function updateHistory(timestamp, minEcon, minPrem) {
  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8'));
  } catch {}

  const prev = [...history].reverse().find(h => h.economyMin);
  history.push({ date: timestamp, economyMin: minEcon, premiumEconMin: minPrem });
  fs.writeFileSync(CONFIG.historyFile, JSON.stringify(history, null, 2));

  if (prev && minEcon) {
    const pct = (minEcon - prev.economyMin) / prev.economyMin * 100;
    const arrow = pct > 0 ? '📈' : pct < 0 ? '📉' : '➡️';
    console.log(`${arrow} Tendencia Economy: $${prev.economyMin} (${prev.date}) → $${minEcon} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`);
    if (pct < -15) console.log('🚨 ¡CAÍDA DE PRECIO MAYOR AL 15%! Considera comprar.');
  }
}

async function main() {
  const timestamp = new Date().toISOString().split('T')[0];
  console.log(`Flight Search Agent: MEX → BUD (Julio 2027) — ${timestamp}`);

  const screenshotDir = path.join(CONFIG.outputDir, timestamp);
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
  const allResults = [];

  for (const s of CONFIG.searches) {
    allResults.push(await searchCabin(context, s.depart, s.return, 'economy', screenshotDir));
    await pause();
    if (s.depart === CONFIG.premiumFor.depart && s.return === CONFIG.premiumFor.return) {
      allResults.push(await searchCabin(context, s.depart, s.return, 'premium_economy', screenshotDir));
      await pause();
    }
  }

  await browser.close();

  const report = generateReport(allResults, timestamp);
  console.log(report.text);
  fs.writeFileSync(path.join(screenshotDir, 'report.txt'), report.text);
  fs.writeFileSync(path.join(screenshotDir, 'raw-data.json'), JSON.stringify(allResults, null, 2));
  updateHistory(timestamp, report.minEcon, report.minPrem);
  console.log(`📄 Reporte y capturas en: ${path.resolve(screenshotDir)}`);
}

main().catch(e => {
  console.error('Error fatal:', e.message);
  process.exit(1);
});
