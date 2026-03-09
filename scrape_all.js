const { chromium } = require('playwright');
const fs = require('fs');

const difficulties = ['easiest', 'easy', 'medium', 'hard', 'hardest'];

// List of puzzle topics from the site
const topics = [
  'mate-in-one-move',
  'mate-in-two-moves',
  'mate-in-three-moves',
  'mate-in-four-moves',
  'mate-in-5-or-more-moves',
  'back-rank-mate',
  'smothered-mate',
  'anastasia-mate',
  'arabian-mate',
  'bodens-mate',
  'double-bishop-mate',
  'dovetail-mate',
  'hook-mate',
  'opening',
  'endgame',
  'promotion',
  'pin',
  'fork',
  'skewer',
  'discovered-attack',
  'double-check',
  'sacrifice',
  'trapped-piece'
];

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
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(8000);
    
    await page.goto(url, { waitUntil: 'domcontentloaded' });

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
  } catch (err) {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
    return { lichessUrls: [], answers: [] };
  }
}

(async () => {
  console.log('Starting crawler...');
  const allPuzzles = {};
  let successCount = 0;
  let totalCount = 0;

  for (const topic of topics) {
    for (const difficulty of difficulties) {
      totalCount++;
      const key = `${topic}/${difficulty}`;
      const url = `https://www.chessgo.in/puzzles/${topic}/${difficulty}`;
      
      process.stdout.write(`[${totalCount}] ${key}... `);
      
      const result = await scrapePage(url);
      
      if (result && result.lichessUrls.length > 0) {
        // Map up to 9 puzzles per page
        const pageMapping = {};
        for (let i = 0; i < Math.min(result.lichessUrls.length, 9); i++) {
          pageMapping[result.lichessUrls[i]] = result.answers[i] || null;
        }
        allPuzzles[key] = pageMapping;
        console.log(`✓ (${result.lichessUrls.length} puzzles)`);
        successCount++;
      } else {
        console.log(`✗ (no puzzles or page error)`);
      }
    }
  }

  // Count total puzzles
  let totalPuzzles = 0;
  for (const key in allPuzzles) {
    totalPuzzles += Object.keys(allPuzzles[key]).length;
  }

  // Write results to file
  const outputFile = 'game/public/puzzles.json';
  fs.writeFileSync(outputFile, JSON.stringify(allPuzzles, null, 2));
  console.log(`\n✓ Results saved to ${outputFile}`);
  console.log(`  Successful pages: ${successCount}/${totalCount}`);
  console.log(`  Total puzzles: ${totalPuzzles}`);
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
