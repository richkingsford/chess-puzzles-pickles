const { chromium } = require('playwright');

async function scrape(url) {
  let browser;
  try {
    try {
      browser = await chromium.launch({ channel: 'chrome' });
    } catch (e1) {
      browser = await chromium.launch();
    }
  } catch (e) {
    console.error('Browser launch failed:', e.message);
    process.exit(1);
  }

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

  const data = await page.evaluate(() => {
    // Get all Lichess analysis URLs
    const lichessUrls = Array.from(document.querySelectorAll('a'))
      .map(a => a.href)
      .filter(href => href && href.includes('lichess.org/analysis/'));

    // Find the div that starts with "Answers:" and contains numbered moves
    let answersText = '';
    const allDivs = Array.from(document.querySelectorAll('div'));
    for (const div of allDivs) {
      const text = div.innerText || '';
      // Look for a div that starts with "Answers:" and has numbered lines (1., 2., etc.)
      if (/^Answers:\s*\n\d+\./.test(text.trim())) {
        answersText = text;
        break;
      }
    }

    // Parse answers: each line is "N. answer_text"
    const answers = [];
    if (answersText) {
      const lines = answersText.split('\n').map(s => s.trim()).filter(Boolean);
      // Skip the "Answers:" header
      for (let i = 1; i < lines.length; i++) {
        // Match "N. answer_text" where N is a number
        const match = lines[i].match(/^\d+\.\s+(.+)$/);
        if (match) {
          answers.push(match[1]);
        }
      }
    }

    return { lichessUrls, answers };
  });

  await browser.close();
  return data;
}

(async () => {
  const url = process.argv[2] || 'https://www.chessgo.in/puzzles/pin/easiest';
  try {
    const { lichessUrls, answers } = await scrape(url);

    // Map each Lichess URL to its corresponding answer (up to 9)
    const count = Math.min(lichessUrls.length, 9);
    const mapping = {};
    for (let i = 0; i < count; i++) {
      mapping[lichessUrls[i]] = answers[i] || null;
    }

    console.log(JSON.stringify(mapping, null, 2));
  } catch (err) {
    console.error('Scrape failed:', err);
    process.exit(1);
  }
})();
