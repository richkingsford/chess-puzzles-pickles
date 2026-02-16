const { chromium } = require('playwright');
const fs = require('fs');

const difficulties = ['easiest', 'easy', 'medium', 'hard', 'hardest'];

async function scrapePage(url) {
  let browser;
  try {
    try {
      browser = await chromium.launch({ channel: 'chrome' });
    } catch (e1) {
      browser = await chromium.launch();
    }
  } catch (e) {
    return { lichessUrls: [], answers: [] };
  }

  try {
    const page = await browser.newPage();    
    await page.goto(url, { waitUntil: 'networkidle' });

    const data = await page.evaluate(() => {
      const lichessUrls = Array.from(document.querySelectorAll('a'))
        .map(a => a.href)
        .filter(href => href && href.includes('lichess.org/analysis/'));

      let answersText = '';
      const allDivs = Array.from(document.querySelectorAll('div'));
      for (const div of allDivs) {
        const text = div.innerText || '';
        if (/^Answers:\s*\n\d+\./.test(text.trim())) {
          answersText = text;
          break;
        }
      }

      const answers = [];
      if (answersText) {
        const lines = answersText.split('\n').map(s => s.trim()).filter(Boolean);
        for (let i = 1; i < lines.length; i++) {
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
  } catch (err) {
    try {
      if (browser) await browser.close();
    } catch (e) {}
    return { lichessUrls: [], answers: [] };
  }
}

(async () => {
  console.log('Scraping PIN puzzles across all difficulty levels...\n');
  const allPuzzles = {};
  let successCount = 0;

  for (const difficulty of difficulties) {
    const key = `pin/${difficulty}`;
    const url = `https://www.chessgo.in/puzzles/pin/${difficulty}`;
    
    process.stdout.write(`Scraping ${key}... `);
    
    const result = await scrapePage(url);
    
    if (result.lichessUrls.length > 0) {
      const pageMapping = {};
      for (let i = 0; i < Math.min(result.lichessUrls.length, 9); i++) {
        pageMapping[result.lichessUrls[i]] = result.answers[i] || null;
      }
      allPuzzles[key] = pageMapping;
      console.log(`✓ (${result.lichessUrls.length} puzzles)`);
      successCount++;
    } else {
      console.log(`✗ (no puzzles found)`);
    }
  }

  // Count total puzzles
  let totalPuzzles = 0;
  for (const key in allPuzzles) {
    totalPuzzles += Object.keys(allPuzzles[key]).length;
  }

  // Write results
  const outputFile = 'pins.json';
  fs.writeFileSync(outputFile, JSON.stringify(allPuzzles, null, 2));
  console.log(`\n✓ Saved to ${outputFile}`);
  console.log(`✓ Successful: ${successCount}/${difficulties.length} pages`);
  console.log(`✓ Total puzzles: ${totalPuzzles}`);
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
