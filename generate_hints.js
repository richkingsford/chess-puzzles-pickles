const fs = require('fs');

function splitMoves(moveSequence) {
  if (!moveSequence) return [];
  return moveSequence
    .split(',')
    .map((move) => move.trim())
    .filter(Boolean);
}

function getPrimaryPieceFromSan(san) {
  if (!san) return 'piece';
  if (san.startsWith('O-O')) return 'king';

  const first = san[0];
  if (first === 'K') return 'king';
  if (first === 'Q') return 'queen';
  if (first === 'R') return 'rook';
  if (first === 'B') return 'bishop';
  if (first === 'N') return 'knight';

  return 'pawn';
}

function analyzeSequence(moveSequence) {
  const moves = splitMoves(moveSequence);
  const firstMove = moves[0] || '';

  return {
    moves,
    firstMove,
    moveCount: moves.length,
    primaryPiece: getPrimaryPieceFromSan(firstMove),
    hasMate: moves.some((move) => move.includes('#')),
    hasCheck: moves.some((move) => move.includes('+') || move.includes('#')),
    hasCapture: moves.some((move) => move.includes('x')),
    hasPromotion: moves.some((move) => move.includes('=')),
    hasCastle: moves.some((move) => move.startsWith('O-O')),
    firstMoveHasCapture: firstMove.includes('x'),
    firstMoveHasCheck: firstMove.includes('+') || firstMove.includes('#'),
    firstMoveHasPromotion: firstMove.includes('='),
  };
}

function vulnerabilityHint(analysis) {
  if (analysis.firstMoveHasPromotion || analysis.hasPromotion) {
    return 'A pawn breakthrough is available and the opponent cannot safely stop promotion.';
  }

  if (analysis.hasMate) {
    return 'The opponent king has very limited safety, so a mating net is already within reach.';
  }

  if (analysis.firstMoveHasCheck || analysis.hasCheck) {
    return 'The opponent king is exposed, giving you immediate forcing chances.';
  }

  if (analysis.firstMoveHasCapture || analysis.hasCapture) {
    return 'A key defender is loose, so one tactical exchange can collapse the position.';
  }

  if (analysis.hasCastle) {
    return 'King safety and coordination are unbalanced, creating a tactical opening immediately.';
  }

  if (analysis.moveCount > 1) {
    return 'The position is tactically unstable, and one forcing start can trigger a winning sequence.';
  }

  return 'One important defender is overloaded, so the position is ready to break.';
}

function abstractExploitHint(analysis) {
  if (analysis.firstMoveHasPromotion || analysis.hasPromotion) {
    return 'Exploit this by using forcing tempo so promotion cannot be prevented.';
  }

  if (analysis.hasMate) {
    return 'Exploit this by chaining forcing threats until every king escape is removed.';
  }

  if (analysis.firstMoveHasCheck || analysis.hasCheck) {
    return 'Exploit this by prioritizing forcing tempo over quiet improvement.';
  }

  if (analysis.firstMoveHasCapture || analysis.hasCapture) {
    return 'Exploit this by removing the main defender before finishing the tactic.';
  }

  return 'Exploit this by starting with the move that gives the opponent the fewest useful replies.';
}

function pieceSpecificHint(analysis) {
  const piece = analysis.primaryPiece;

  if (piece === 'pawn') {
    if (analysis.firstMoveHasPromotion || analysis.hasPromotion) {
      return 'Use your pawn now to force promotion before counterplay appears.';
    }
    return 'Use your pawn now to start the tactic and keep the initiative.';
  }

  if (piece === 'queen') {
    if (analysis.firstMoveHasCheck || analysis.hasCheck || analysis.hasMate) {
      return 'Use your queen now to launch the forcing attack on the king.';
    }
    return 'Use your queen now to strike the loose defender and open the combination.';
  }

  if (piece === 'rook') {
    return 'Use your rook now to create the forcing line that wins next.';
  }

  if (piece === 'bishop') {
    return 'Use your bishop now to open the decisive diagonal tactic.';
  }

  if (piece === 'knight') {
    return 'Use your knight now to trigger the tactical sequence with tempo.';
  }

  if (piece === 'king') {
    return 'Use your king now to make the precise move that secures the tactic.';
  }

  return 'Use your active piece now to begin the winning sequence.';
}

function obviousHint(analysis) {
  const piece = analysis.primaryPiece;
  return `Start with your ${piece} now; that first move is the puzzle solution.`;
}

function generateHints(moveSequence) {
  const analysis = analyzeSequence(moveSequence);

  const hints = [
    vulnerabilityHint(analysis),
    abstractExploitHint(analysis),
    pieceSpecificHint(analysis),
    obviousHint(analysis)
  ];

  return hints.map((hint) => hint.replace(/\s+/g, ' ').trim());
}

(async () => {
  console.log('Reading puzzles.json...');

  if (!fs.existsSync('puzzles.json')) {
    console.error('Error: puzzles.json not found');
    process.exit(1);
  }

  const puzzles = JSON.parse(fs.readFileSync('puzzles.json', 'utf-8'));
  const puzzlesWithHints = {};
  let totalHinted = 0;

  for (const pageName of Object.keys(puzzles)) {
    const pageData = puzzles[pageName];
    const pageWithHints = {};

    for (const lichessUrl of Object.keys(pageData)) {
      const answer = pageData[lichessUrl];
      const hints = generateHints(answer);

      pageWithHints[lichessUrl] = {
        answer,
        hints
      };

      totalHinted += 1;
    }

    puzzlesWithHints[pageName] = pageWithHints;
  }

  const outputFile = 'puzzles_with_hints.json';
  fs.writeFileSync(outputFile, JSON.stringify(puzzlesWithHints, null, 2));

  console.log(`✓ Generated hints for ${totalHinted} puzzles`);
  console.log(`✓ Saved to ${outputFile}`);
})();
