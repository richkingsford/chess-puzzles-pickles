const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    try {
      browser = await chromium.launch({ channel: 'chrome' });
    } catch (e2) {
      // Fallback: fetch HTML and extract <title>
      try {
        const res = await fetch('https://example.com');
        const text = await res.text();
        const m = text.match(/<title>([^<]*)<\/title>/i);
        console.log(m ? m[1] : 'No title found');
        return;
      } catch (fetchErr) {
        console.error('Both Playwright launch attempts failed and fetch fallback failed:', fetchErr);
        process.exit(1);
      }
    }
  }

  const page = await browser.newPage();
  await page.goto('https://example.com');
  const title = await page.title();
  console.log(title);
  await browser.close();
})();

