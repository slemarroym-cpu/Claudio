const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
//  CONFIGURACIÓN — ajusta aquí tus parámetros
// ═══════════════════════════════════════════════════════════
const CONFIG = {
  origin: { code: 'MEX', name: 'Mexico City' },
  destination: { code: 'BUD', name: 'Budapest' },
  searches: [
    // IDA jul 2 → VUELTA jul 24 (principal)
    { depart: '2027-07-02', return: '2027-07-24' },
    // Alternativas de ida
    { depart: '2027-07-01', return: '2027-07-24' },
    { depart: '2027-07-03', return: '2027-07-24' },
    // Alternativas de vuelta
    { depart: '2027-07-02', return: '2027-07-21' },
    { depart: '2027-07-02', return: '2027-07-27' },
    // Salida anticipada (para llegar sáb 3 o dom 4)
    { depart: '2027-06-30', return: '2027-07-24' },
  ],
  currency: 'USD',
  passengers: 1,
  outputDir: './flight-results',
  historyFile: './flight-results/price-history.json',
};

function buildGoogleFlightsURL(depart, ret, cabin) {
  const cabinCode = cabin === 'premium_economy' ? 2 : 1;
  const d = depart.replace(/-/g, '-');
  const r = ret.replace(/-/g, '-');
  return `https://www.google.com/travel/flights?q=round+trip+flights+from+${CONFIG.origin.code}+to+${CONFIG.destination.code}+departing+${d}+returning+${r}&curr=${CONFIG.currency}&hl=en&gl=us&travelClass=${cabinCode}`;
}

async function extractFlightData(page) {
  return page.evaluate(() => {
    const flights = [];

    // Google Flights uses aria-labels on list items with full flight info
    const ariaEls = document.querySelectorAll('[aria-label]');
    for (const el of ariaEls) {
      const label = el.getAttribute('aria-label') || '';
      // Flight result labels typically contain price, duration, stops, airline
      if (label.match(/\$[\d,]+/) && (label.includes('stop') || label.includes('Nonstop') || label.includes('escala') || label.includes('hr') || label.includes('min'))) {
        flights.push({ source: 'aria-label', text: label.substring(0, 500) });
      }
    }

    // Look for price elements (leaf nodes with $ amounts)
    const prices = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text.match(/^\$[\d,]+$/) || text.match(/^US\$[\d,]+$/) || text.match(/^MXN[\s$]*[\d,]+$/)) {
        prices.push(text);
      }
    }

    // Look for specific Google Flights result containers
    const resultItems = document.querySelectorAll('[data-resultid]');
    const structured = [];
    resultItems.forEach((item, i) => {
      if (i >= 15) return;
      const text = item.textContent.replace(/\s+/g, ' ').trim().substring(0, 400);
      structured.push(text);
    });

    // Best price elements (Google Flights often highlights the best)
    const bestPriceEls = document.querySelectorAll('[aria-label*="best"], [aria-label*="mejor"], [aria-label*="cheapest"]');
    const bestPrices = [];
    bestPriceEls.forEach(el => {
      bestPrices.push(el.textContent.replace(/\s+/g, ' ').trim().substring(0, 300));
    });

    // Page text for fallback parsing
    const bodyText = document.body?.innerText?.substring(0, 5000) || '';

    return {
      flights,
      prices: [...new Set(prices)],
      structured,
      bestPrices,
      bodySnippet: bodyText.substring(0, 2000),
      url: window.location.href,
    };
  });
}

function parseFlightInfo(ariaLabel) {
  const info = { raw: ariaLabel };

  // Extract price
  const priceMatch = ariaLabel.match(/\$([\d,]+)/);
  if (priceMatch) info.price = parseInt(priceMatch[1].replace(/,/g, ''));

  // Extract duration
  const durMatch = ariaLabel.match(/(\d+)\s*hr\s*(\d+)?\s*min/);
  if (durMatch) info.duration = `${durMatch[1]}h${durMatch[2] || '0'}m`;

  // Extract stops
  if (ariaLabel.match(/Nonstop|Sin escalas/i)) {
    info.stops = 0;
  } else {
    const stopMatch = ariaLabel.match(/(\d+)\s*stop/i) || ariaLabel.match(/(\d+)\s*escala/i);
    if (stopMatch) info.stops = parseInt(stopMatch[1]);
  }

  // Extract airline
  const airlinePatterns = [
    'Lufthansa', 'Turkish Airlines', 'KLM', 'Air France', 'Aeromexico',
    'Iberia', 'British Airways', 'American Airlines', 'United', 'Delta',
    'Air Canada', 'Swiss', 'Austrian', 'LOT', 'Finnair', 'SAS',
    'TAP', 'Condor', 'Eurowings',
  ];
  for (const airline of airlinePatterns) {
    if (ariaLabel.includes(airline)) {
      info.airline = airline;
      break;
    }
  }

  // Extract times
  const timeMatch = ariaLabel.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[-–]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (timeMatch) {
    info.departTime = timeMatch[1];
    info.arriveTime = timeMatch[2];
  }

  return info;
}

async function searchCabin(page, depart, ret, cabin, screenshotDir) {
  const url = buildGoogleFlightsURL(depart, ret, cabin);
  const label = `${depart} → ${ret} [${cabin}]`;
  console.log(`\n🔍 ${label}`);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(4000);

    // Dismiss cookie/consent dialogs
    for (const text of ['Accept all', 'Aceptar todo', 'Accept', 'Aceptar', 'I agree', 'Acepto']) {
      try {
        const btn = page.locator(`button:has-text("${text}")`).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          await page.waitForTimeout(1000);
          break;
        }
      } catch {}
    }

    // Wait for results to load
    await page.waitForTimeout(3000);

    // Screenshot
    const ssName = `${depart}_${ret}_${cabin}.png`;
    const ssPath = path.join(screenshotDir, ssName);
    await page.screenshot({ path: ssPath, fullPage: false });

    // Extract data
    const data = await extractFlightData(page);

    // Parse flight details from aria-labels
    const parsed = data.flights.map(f => parseFlightInfo(f.text));

    const result = {
      search: { depart, return: ret, cabin },
      url: data.url,
      screenshot: ssPath,
      flightsFound: parsed.length,
      flights: parsed.sort((a, b) => (a.price || 99999) - (b.price || 99999)),
      rawPrices: data.prices,
      bestPrices: data.bestPrices,
      structured: data.structured,
    };

    // Print summary
    if (parsed.length > 0) {
      const cheapest = parsed.find(f => f.price);
      if (cheapest) {
        console.log(`   ✅ ${parsed.length} vuelos encontrados — más barato: $${cheapest.price} USD (${cheapest.airline || 'N/A'}, ${cheapest.stops ?? '?'} escala(s), ${cheapest.duration || 'N/A'})`);
      } else {
        console.log(`   ⚠️  ${parsed.length} vuelos encontrados pero sin precios parseables`);
      }
    } else if (data.prices.length > 0) {
      console.log(`   💰 Precios en página: ${data.prices.slice(0, 5).join(', ')}`);
    } else if (data.structured.length > 0) {
      console.log(`   📋 ${data.structured.length} resultados encontrados (revisar screenshot)`);
    } else {
      console.log(`   ❌ No se encontraron resultados (revisar screenshot: ${ssName})`);
    }

    return result;

  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    return { search: { depart, return: ret, cabin }, error: e.message };
  }
}

function generateReport(allResults, timestamp) {
  const lines = [];
  lines.push(`\n${'═'.repeat(70)}`);
  lines.push(`  REPORTE DE VUELOS: MEX → BUD (Julio 2027)`);
  lines.push(`  Fecha de búsqueda: ${timestamp}`);
  lines.push(`${'═'.repeat(70)}\n`);

  const economyResults = allResults.filter(r => r.search?.cabin === 'economy' && r.flights?.length > 0);
  const premiumResults = allResults.filter(r => r.search?.cabin === 'premium_economy' && r.flights?.length > 0);

  // Economy summary
  lines.push('── ECONOMY ──────────────────────────────────────────────');
  if (economyResults.length > 0) {
    for (const result of economyResults) {
      lines.push(`\n  ${result.search.depart} → ${result.search.return}:`);
      const top5 = result.flights.filter(f => f.price).slice(0, 5);
      if (top5.length > 0) {
        for (const f of top5) {
          lines.push(`    $${f.price} USD | ${f.airline || 'N/A'} | ${f.stops ?? '?'} escala(s) | ${f.duration || 'N/A'} | ${f.departTime || ''}-${f.arriveTime || ''}`);
        }
      } else {
        lines.push(`    (precios no parseables — revisar screenshots)`);
      }
    }
  } else {
    lines.push('  No se encontraron resultados de economy.');
  }

  // Premium Economy summary
  lines.push('\n── PREMIUM ECONOMY ──────────────────────────────────────');
  if (premiumResults.length > 0) {
    for (const result of premiumResults) {
      lines.push(`\n  ${result.search.depart} → ${result.search.return}:`);
      const top5 = result.flights.filter(f => f.price).slice(0, 5);
      if (top5.length > 0) {
        for (const f of top5) {
          lines.push(`    $${f.price} USD | ${f.airline || 'N/A'} | ${f.stops ?? '?'} escala(s) | ${f.duration || 'N/A'}`);
        }
      }
    }
  } else {
    lines.push('  No se encontraron resultados de premium economy.');
  }

  // Comparison
  const allEconPrices = economyResults.flatMap(r => r.flights.filter(f => f.price).map(f => f.price));
  const allPremPrices = premiumResults.flatMap(r => r.flights.filter(f => f.price).map(f => f.price));
  const minEcon = allEconPrices.length > 0 ? Math.min(...allEconPrices) : null;
  const minPrem = allPremPrices.length > 0 ? Math.min(...allPremPrices) : null;

  lines.push('\n── RESUMEN ──────────────────────────────────────────────');
  if (minEcon) lines.push(`  💰 Mejor Economy:         $${minEcon} USD`);
  if (minPrem) lines.push(`  💰 Mejor Premium Economy: $${minPrem} USD`);
  if (minEcon && minPrem) {
    const diff = ((minPrem - minEcon) / minEcon * 100).toFixed(1);
    lines.push(`  📊 Diferencia PE vs E:    +${diff}%`);
    if (parseFloat(diff) < 25) {
      lines.push(`  🔔 ¡ALERTA! Premium Economy está a menos del 25% de diferencia — vale la pena considerar upgrade.`);
    }
  }
  if (minEcon && minEcon < 800) {
    lines.push(`  🔔 ¡ALERTA! Economy por debajo de $800 USD — precio atractivo.`);
  }

  lines.push(`\n${'═'.repeat(70)}\n`);
  return lines.join('\n');
}

function updateHistory(allResults, timestamp) {
  let history = [];
  try {
    if (fs.existsSync(CONFIG.historyFile)) {
      history = JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8'));
    }
  } catch {}

  const economyPrices = allResults
    .filter(r => r.search?.cabin === 'economy')
    .flatMap(r => (r.flights || []).filter(f => f.price).map(f => f.price));
  const premiumPrices = allResults
    .filter(r => r.search?.cabin === 'premium_economy')
    .flatMap(r => (r.flights || []).filter(f => f.price).map(f => f.price));

  const entry = {
    date: timestamp,
    economyMin: economyPrices.length > 0 ? Math.min(...economyPrices) : null,
    economyAvg: economyPrices.length > 0 ? Math.round(economyPrices.reduce((a, b) => a + b, 0) / economyPrices.length) : null,
    premiumEconMin: premiumPrices.length > 0 ? Math.min(...premiumPrices) : null,
    economyCount: economyPrices.length,
    premiumCount: premiumPrices.length,
  };

  history.push(entry);
  fs.writeFileSync(CONFIG.historyFile, JSON.stringify(history, null, 2));

  // Show price trend
  if (history.length > 1) {
    const prev = history[history.length - 2];
    if (prev.economyMin && entry.economyMin) {
      const change = entry.economyMin - prev.economyMin;
      const pct = ((change / prev.economyMin) * 100).toFixed(1);
      const arrow = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
      console.log(`\n${arrow} Tendencia Economy: $${prev.economyMin} → $${entry.economyMin} (${change > 0 ? '+' : ''}${pct}%)`);

      if (change < 0 && Math.abs(parseFloat(pct)) > 15) {
        console.log('🚨 ¡CAÍDA DE PRECIO MAYOR AL 15%! Considera comprar.');
      }
    }
  }

  return entry;
}

async function main() {
  const timestamp = new Date().toISOString().split('T')[0];
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Flight Search Agent: MEX → BUD (Julio 2027)       ║');
  console.log(`║  ${timestamp}                                       ║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  // Create output directory
  const screenshotDir = path.join(CONFIG.outputDir, timestamp);
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  const allResults = [];

  for (const search of CONFIG.searches) {
    // Economy
    const econResult = await searchCabin(page, search.depart, search.return, 'economy', screenshotDir);
    allResults.push(econResult);
    await page.waitForTimeout(2000 + Math.random() * 2000);

    // Premium Economy (only for primary search to reduce requests)
    if (search.depart === '2027-07-02' && search.return === '2027-07-24') {
      const premResult = await searchCabin(page, search.depart, search.return, 'premium_economy', screenshotDir);
      allResults.push(premResult);
      await page.waitForTimeout(2000 + Math.random() * 2000);
    }
  }

  await browser.close();

  // Generate and print report
  const report = generateReport(allResults, timestamp);
  console.log(report);

  // Save report to file
  const reportPath = path.join(screenshotDir, 'report.txt');
  fs.writeFileSync(reportPath, report);
  console.log(`📄 Reporte guardado en: ${reportPath}`);

  // Save raw data
  const dataPath = path.join(screenshotDir, 'raw-data.json');
  fs.writeFileSync(dataPath, JSON.stringify(allResults, null, 2));

  // Update price history
  updateHistory(allResults, timestamp);
  console.log(`📊 Historial actualizado en: ${CONFIG.historyFile}`);

  // Save screenshots summary
  console.log(`📸 Screenshots guardados en: ${screenshotDir}/`);
}

main().catch(e => {
  console.error('Error fatal:', e.message);
  process.exit(1);
});
