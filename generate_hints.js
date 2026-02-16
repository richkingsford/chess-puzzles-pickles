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

function inferTactic(pageName, analysis) {
  const key = (pageName || '').toLowerCase();

  if (key.includes('pin')) return 'pin';
  if (key.includes('fork')) return 'fork';
  if (key.includes('skewer')) return 'skewer';
  if (key.includes('discovered-attack')) return 'discovered attack';
  if (key.includes('double-check')) return 'double check';
  if (key.includes('back-rank')) return 'back-rank mate';
  if (key.includes('smothered')) return 'smothered mate';
  if (key.includes('anastasia')) return 'Anastasia mate';
  if (key.includes('arabian')) return 'Arabian mate';
  if (key.includes('boden')) return 'Boden mate';
  if (key.includes('double-bishop')) return 'double bishop mate';
  if (key.includes('dovetail')) return 'dovetail mate';
  if (key.includes('hook')) return 'hook mate';
  if (key.includes('promotion')) return 'promotion tactic';
  if (key.includes('sacrifice')) return 'sacrifice';
  if (key.includes('trapped-piece')) return 'trapped piece tactic';
  if (key.includes('mate')) return 'mating net';

  if (analysis.hasPromotion) return 'promotion tactic';
  if (analysis.hasMate) return 'mating net';
  if (analysis.firstMoveHasCheck || analysis.hasCheck) return 'forcing check sequence';
  if (analysis.firstMoveHasCapture || analysis.hasCapture) return 'removal of defender';
  if (analysis.moveCount >= 3) return 'combination';

  return 'tactical idea';
}

function vulnerabilityHint(tactic, analysis) {
  if (tactic === 'pin') {
    return 'A pinned defender is creating a vulnerability you can punish immediately.';
  }
  if (tactic === 'fork') {
    return 'Multiple targets are loose, so a fork opportunity is available now.';
  }
  if (tactic === 'skewer') {
    return 'A high-value target is exposed behind a weaker shield in one line.';
  }
  if (tactic === 'discovered attack') {
    return 'A blocked line is hiding pressure that can be revealed with tempo.';
  }
  if (tactic === 'double check') {
    return 'King safety is fragile, and a double check idea is available.';
  }
  if (tactic.includes('mate') || analysis.hasMate) {
    return `King safety is broken, and a ${tactic} pattern is ready.`;
  }
  if (tactic === 'promotion tactic' || analysis.hasPromotion) {
    return 'A passed pawn is close to promoting and cannot be contained safely.';
  }
  if (tactic === 'removal of defender' || analysis.hasCapture) {
    return 'A key defender is overloaded, so one exchange will collapse resistance.';
  }
  return `The position is unstable, and a ${tactic} opportunity is present.`;
}

function exploitHint(tactic, analysis) {
  if (tactic === 'pin') {
    return 'Exploit the pin by increasing pressure until the defender can no longer hold.';
  }
  if (tactic === 'fork') {
    return 'Exploit the fork idea by choosing the jump that attacks two critical targets.';
  }
  if (tactic === 'skewer') {
    return 'Exploit the skewer by forcing the front target to move first.';
  }
  if (tactic === 'discovered attack') {
    return 'Exploit the discovered attack by opening the hidden line with tempo.';
  }
  if (tactic === 'double check') {
    return 'Exploit the double check by removing all king escape routes in sequence.';
  }
  if (tactic.includes('mate') || analysis.hasMate) {
    return 'Exploit this by using forcing tempo so every reply worsens king safety.';
  }
  if (tactic === 'promotion tactic' || analysis.hasPromotion) {
    return 'Exploit this by forcing the defense to react while promotion threat grows.';
  }
  if (analysis.firstMoveHasCapture || analysis.hasCapture) {
    return 'Exploit this by removing the main defender before finishing the tactic.';
  }
  return `Exploit the ${tactic} by playing forcing moves before the defense can regroup.`;
}

function pieceSpecificHint(piece, tactic, analysis) {
  if (piece === 'pawn') {
    if (analysis.hasPromotion || tactic === 'promotion tactic') {
      return `Now use your pawn to drive the ${tactic} to completion.`;
    }
    return `Now use your pawn to start the ${tactic} with tempo.`;
  }

  return `Now use your ${piece} to execute the ${tactic}.`;
}

function obviousHint(piece, tactic) {
  return `Start with your ${piece}; that move makes the ${tactic} obvious.`;
}

function cleanHint(hint) {
  return hint.replace(/\s+/g, ' ').trim();
}

function generateHints(pageName, moveSequence) {
  const analysis = analyzeSequence(moveSequence);
  const tactic = inferTactic(pageName, analysis);
  const piece = analysis.primaryPiece;

  const hints = [
    vulnerabilityHint(tactic, analysis),
    exploitHint(tactic, analysis),
    pieceSpecificHint(piece, tactic, analysis),
    obviousHint(piece, tactic)
  ].map(cleanHint);

  return hints;
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
      const hints = generateHints(pageName, answer);

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
