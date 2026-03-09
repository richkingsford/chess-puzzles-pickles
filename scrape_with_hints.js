const { chromium } = require('playwright');
const fs = require('fs');

const difficulties = ['easiest', 'easy', 'medium', 'hard', 'hardest'];
const topics = [
  'pin', 'fork', 'skewer', 'discovered-attack', 'double-check',
  'sacrifice', 'trapped-piece', 'promotion', 'back-rank-mate',
  'mate-in-one-move', 'mate-in-two-moves'
];

// Simple piece naming helper
function describePiece(fen, pieceSquare) {
  // Parse board from FEN
  const boardPart = fen.split(' ')[0];
  const board = [];
  let currentRow = [];
  
  for (const char of boardPart) {
    if (char === '/') {
      board.push(currentRow);
      currentRow = [];
    } else if (/\d/.test(char)) {
      for (let i = 0; i < parseInt(char); i++) {
        currentRow.push('.');
      }
    } else {
      currentRow.push(char);
    }
  }
  if (currentRow.length > 0) board.push(currentRow);
  
  return fen;
}

// Generate strategic hints based on puzzle topic and answer
function generateHints(fenString, answer, topic) {
  const hints = [];
  
  const hintPatterns = {
    'pin': [
      "Look for a piece that is protecting something more valuable behind it. How can you exploit this weakness?",
      "Examine the alignment of pieces along files, ranks, and diagonals. Is there a piece using another as a shield?",
      "Consider moves that attack both a piece and what it defends. Which pieces are lined up in a way you could attack both at once?"
    ],
    'fork': [
      "Search for a single move that attacks two or more enemy pieces at once. Where can your piece land to threaten multiple targets?",
      "Identify which enemy pieces are undefended or poorly coordinated. Can you hit multiple weak targets with one move?",
      "Look for squares where one of your pieces would have the most attacking power. Which piece can create simultaneous threats?"
    ],
    'skewer': [
      "Look for two pieces lined up where one is more valuable than the other. How can you force the valuable one to move?",
      "Find an alignment where the less valuable piece could move away, exposing the more valuable piece behind it.",
      "Examine long-range pieces (bishops, rooks, queen). Are there enemy pieces lined up that you could exploit with a forcing move?"
    ],
    'discovered-attack': [
      "Consider what happens if you move one piece—does it uncover an attack from another piece behind it?",
      "Look for pieces that are blocking an attack or opened line. What if that blocking piece moves?",
      "Examine your pieces that are positioned behind enemy pieces. Moving them could reveal a powerful hidden threat."
    ],
    'double-check': [
      "Look for situations where moving one piece could give check while also uncovering another check from behind.",
      "The king is in trouble if two of your pieces attack it simultaneously. How can you create this situation?",
      "Find a move that serves two purposes: it checks the king directly AND uncovers another check from your piece behind."
    ],
    'sacrifice': [
      "Consider giving up material to create an unstoppable attack or win something more valuable.",
      "Look for opponent weaknesses that you can exploit if you remove your own piece. What becomes possible after the sacrifice?",
      "Examine whether losing a piece opens lines, creates checks, or puts the enemy king in danger. Is the trade worth it?"
    ],
    'trapped-piece': [
      "Find an enemy piece that has limited escape squares. How can you reduce its options further?",
      "Look for pieces with poor placement—those far from their pieces or hemmed in by the board edges.",
      "Consider moves that control key squares around an enemy piece, cutting off its escape routes."
    ],
    'promotion': [
      "Focus on pawns near the promotion rank. How can your pawn advance while the opponent can't stop it?",
      "Look for ways to clear the path for your pawn or create threats the opponent must respond to.",
      "Consider pawn breaks and tactics that force the opponent to deal with threats while your pawn advances."
    ],
    'back-rank-mate': [
      "Examine the back rank and identify pieces blocking escape squares. How can the king become trapped?",
      "Look for how your rook or queen could deliver checkmate on the back rank if the king has no escape squares.",
      "Consider what pieces are preventing the enemy king from escaping to the next rank. Can you use this restriction?"
    ],
    'mate': [
      "Map out the enemy king's escape squares. Which ones can you control or eliminate?",
      "Look for forcing moves (checks, threats) that limit the king's movement and set up checkmate.",
      "Consider how you can coordinate multiple pieces to surround and trap the enemy king."
    ]
  };
  
  // Get pattern-based hints
  const pattern = hintPatterns[topic] || hintPatterns['mate'];
  
  if (pattern) {
    // Select 3 hints from the pattern (or all if fewer than 3)
    const selected = pattern.slice(0, 3);
    hints.push(...selected);
  }
  
  return hints.length >= 3 ? hints.slice(0, 3) : hints;
}

async function scrapePage(url, topic) {
  let browser;
  try {
    try {
      browser = await chromium.launch({ channel: 'chrome' });
    } catch (e1) {
      browser = await chromium.launch();
    }
  } catch (e) {
    return { puzzles: [] };
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
    return { puzzles: data.lichessUrls.map((url, i) => ({ url, answer: data.answers[i] || null })) };
  } catch (err) {
    try {
      if (browser) await browser.close();
    } catch (e) {}
    return { puzzles: [] };
  }
}

(async () => {
  console.log('Scraping all puzzles with hints...\n');
  const allPuzzles = {};
  let totalCount = 0;

  for (const topic of topics) {
    allPuzzles[topic] = {};
    
    for (const difficulty of difficulties) {
      const url = `https://www.chessgo.in/puzzles/${topic}/${difficulty}`;
      process.stdout.write(`[${topics.indexOf(topic)+1}/${topics.length}] ${topic}/${difficulty}... `);
      
      const { puzzles } = await scrapePage(url, topic);
      
      if (puzzles.length > 0) {
        allPuzzles[topic][difficulty] = puzzles.map(p => {
          const fenMatch = p.url.match(/analysis\/([^%]+)/);
          const fen = fenMatch ? decodeURIComponent(fenMatch[1]) : '';
          const hints = generateHints(fen, p.answer, topic);
          
          return {
            lichess_url: p.url,
            answer: p.answer,
            hints: hints
          };
        });
        
        console.log(`✓ (${puzzles.length} puzzles)`);
        totalCount += puzzles.length;
      } else {
        console.log(`✗`);
      }
    }
  }

  // Write results
  const outputFile = 'game/public/puzzles.json';
  fs.writeFileSync(outputFile, JSON.stringify(allPuzzles, null, 2));
  
  console.log(`\n✓ Saved to ${outputFile}`);
  console.log(`✓ Total puzzles with hints: ${totalCount}`);
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
