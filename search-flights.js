const { chromium } = require('playwright');

const CONFIG = {
  origin: 'MEX',
  destination: 'BUD',
  outboundDates: ['2027-07-01', '2027-07-02', '2027-07-03'],
  returnDates: ['2027-07-21', '2027-07-24', '2027-07-27'],
  cabins: ['economy', 'premium_economy'],
  baselineEconomyUSD: 900,
  notifyThresholdUSD: 750,
  premiumEconDiffThreshold: 0.25,
};

async function searchGoogleFlights(page, departDate, returnDate, cabin) {
  const cabinParam = cabin === 'premium_economy' ? '3' : '1';
  // tfs param: 1 = economy, 3 = premium economy
  const url = `https://www.google.com/travel/flights?q=Flights+from+${CONFIG.origin}+to+${CONFIG.destination}+on+${departDate}+return+${returnDate}&curr=USD&tfs=CBQQAhopEgoyMDI3LTA3LTAyagwIAhIIL20vMGpzdzVyDAoCEggvbS8wOXY3MhopEgoyMDI3LTA3LTI0agwIAhIIL20vMDl2NzJyDAoCEggvbS8wanN3NXABSAF`;

  const directUrl = `https://www.google.com/travel/flights/search?tfs=CBMiRhIaEgoyMDI3LTA3LTAyKgJBTXIEQlVEcAFAARABGhISCjIwMjctMDctMjQqAkFNcgRCVURwAUABcAFCAhIDVVNEGAFSAggB`;

  const simpleUrl = `https://www.google.com/travel/flights`;

  await page.goto(simpleUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Accept cookies if prompted
  try {
    const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("Aceptar")');
    if (await acceptBtn.isVisible({ timeout: 3000 })) {
      await acceptBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch {}

  // Set round trip (default)

  // Clear and set origin
  try {
    const originInput = page.locator('[aria-label*="Where from"], [aria-label*="origen"], [placeholder*="Where from"]').first();
    await originInput.click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(CONFIG.origin, { delay: 100 });
    await page.waitForTimeout(1500);
    // Select first suggestion
    const suggestion = page.locator('[data-value] li, [role="option"]').first();
    if (await suggestion.isVisible({ timeout: 3000 })) {
      await suggestion.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('Origin input error:', e.message);
  }

  // Set destination
  try {
    const destInput = page.locator('[aria-label*="Where to"], [aria-label*="destino"], [placeholder*="Where to"]').first();
    await destInput.click();
    await page.waitForTimeout(500);
    await page.keyboard.type(CONFIG.destination, { delay: 100 });
    await page.waitForTimeout(1500);
    const suggestion = page.locator('[data-value] li, [role="option"]').first();
    if (await suggestion.isVisible({ timeout: 3000 })) {
      await suggestion.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('Destination input error:', e.message);
  }

  // Set departure date
  try {
    const dateInput = page.locator('[aria-label*="Departure"], [aria-label*="Salida"], [data-iso]').first();
    await dateInput.click();
    await page.waitForTimeout(1000);

    // Navigate to the right month and click the date
    // We need to find July 2027 in the calendar
    // For now, type the date directly
    await page.keyboard.type(departDate.replace(/-/g, '/'), { delay: 50 });
    await page.waitForTimeout(500);
  } catch (e) {
    console.log('Date input error:', e.message);
  }

  return null;
}

async function searchViaURL(page, departDate, returnDate, cabin) {
  const cabinCode = cabin === 'premium_economy' ? 2 : 1;

  // Google Flights URL format with parameters
  const url = `https://www.google.com/travel/flights/search?tfs=CBMiJhIKMgIKABIEQlVEcAEiChICCgASBE1FWHABBAE&d1=${departDate}&r1=${returnDate}&px=1&sc=${cabinCode}&curr=USD&hl=en`;

  console.log(`\n--- Searching: ${departDate} → ${returnDate} [${cabin}] ---`);
  console.log(`URL: ${url}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);

    // Take screenshot for debugging
    const screenshotName = `/tmp/claude-0/-home-user-Claudio/7979fb7b-c7c7-5221-b2eb-524b8da7509d/scratchpad/flight-${departDate}-${returnDate}-${cabin}.png`;
    await page.screenshot({ path: screenshotName, fullPage: false });
    console.log(`Screenshot saved: ${screenshotName}`);

    // Try to get page title and content
    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Look for flight results with various selectors
    const content = await page.evaluate(() => {
      const results = [];

      // Try to find price elements
      const priceElements = document.querySelectorAll('[data-price], [aria-label*="price"], [aria-label*="precio"]');
      priceElements.forEach(el => {
        results.push({ type: 'price-attr', text: el.textContent.trim().substring(0, 200), ariaLabel: el.getAttribute('aria-label')?.substring(0, 200) });
      });

      // Look for elements with dollar signs or currency
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = el.textContent?.trim();
        if (text && (text.match(/^\$[\d,]+$/) || text.match(/^US\$[\d,]+$/) || text.match(/^MXN\s*\$?[\d,]+$/))) {
          if (el.children.length === 0) { // leaf nodes only
            results.push({ type: 'currency', text: text.substring(0, 100) });
          }
        }
      }

      // Look for flight result list items
      const listItems = document.querySelectorAll('[data-resultid], li[class*="flight"], [class*="result"]');
      listItems.forEach((el, i) => {
        if (i < 10) {
          results.push({ type: 'result-item', text: el.textContent.trim().substring(0, 300) });
        }
      });

      // Get all aria-labels that mention flights or prices
      const ariaElements = document.querySelectorAll('[aria-label]');
      const flightLabels = [];
      ariaElements.forEach(el => {
        const label = el.getAttribute('aria-label');
        if (label && (label.includes('$') || label.includes('flight') || label.includes('vuelo') || label.includes('stop') || label.includes('escala') || label.includes('hr') || label.includes('hora'))) {
          flightLabels.push(label.substring(0, 400));
        }
      });

      return { results, flightLabels, bodyLength: document.body?.textContent?.length || 0 };
    });

    console.log(`Body text length: ${content.bodyLength}`);
    console.log(`Price elements found: ${content.results.length}`);
    console.log(`Flight aria-labels found: ${content.flightLabels.length}`);

    if (content.results.length > 0) {
      console.log('\nPrice elements:');
      content.results.slice(0, 15).forEach(r => console.log(`  [${r.type}] ${r.text} ${r.ariaLabel || ''}`));
    }

    if (content.flightLabels.length > 0) {
      console.log('\nFlight details (from aria-labels):');
      content.flightLabels.slice(0, 20).forEach(l => console.log(`  ${l}`));
    }

    return { departDate, returnDate, cabin, content };

  } catch (e) {
    console.log(`Error: ${e.message}`);
    return { departDate, returnDate, cabin, error: e.message };
  }
}

async function main() {
  console.log('=== Flight Search: MEX → BUD (July 2027) ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}\n`);

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  // Search key date combinations
  const searches = [
    // Primary: Jul 2 → Jul 24
    { depart: '2027-07-02', return: '2027-07-24', cabin: 'economy' },
    { depart: '2027-07-02', return: '2027-07-24', cabin: 'premium_economy' },
    // Alt outbound: Jul 1
    { depart: '2027-07-01', return: '2027-07-24', cabin: 'economy' },
    // Alt outbound: Jul 3
    { depart: '2027-07-03', return: '2027-07-24', cabin: 'economy' },
    // Alt return: Jul 21
    { depart: '2027-07-02', return: '2027-07-21', cabin: 'economy' },
    // Alt return: Jul 27
    { depart: '2027-07-02', return: '2027-07-27', cabin: 'economy' },
  ];

  const allResults = [];

  for (const search of searches) {
    const result = await searchViaURL(page, search.depart, search.return, search.cabin);
    allResults.push(result);
    await page.waitForTimeout(2000);
  }

  await browser.close();

  console.log('\n=== SEARCH COMPLETE ===');
  console.log(`Total searches: ${allResults.length}`);
  console.log(`Results with data: ${allResults.filter(r => r.content?.flightLabels?.length > 0).length}`);
}

main().catch(console.error);
