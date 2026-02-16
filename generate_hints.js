const fs = require('fs');

// Analyze the move notation to identify tactical patterns
function analyzeMoves(moveSequence) {
  if (!moveSequence) return { patterns: [] };
  
  const moves = moveSequence.split(',').map(m => m.trim());
  const patterns = [];
  const analysis = { patterns, moves };

  for (const move of moves) {
    // Check for checkmate notation
    if (move.includes('#')) {
      patterns.push('checkmate');
    }
    // Check for check notation  
    if (move.includes('+')) {
      patterns.push('check');
    }
    // Check for captures
    if (move.includes('x')) {
      patterns.push('capture');
    }
    // Check for promotions
    if (move.includes('=')) {
      patterns.push('promotion');
    }
    // Pawn moves (lowercase letters a-h)
    if (/^[a-h][1-8]|^[a-h]x/.test(move)) {
      patterns.push('pawn-move');
    }
    // Rook moves (R*)
    if (/^R/.test(move)) {
      patterns.push('rook-move');
    }
    // Knight moves (N*)
    if (/^N/.test(move)) {
      patterns.push('knight-move');
    }
    // Bishop moves (B*)
    if (/^B/.test(move)) {
      patterns.push('bishop-move');
    }
    // Queen moves (Q*)
    if (/^Q/.test(move)) {
      patterns.push('queen-move');
    }
    // King moves (K*)
    if (/^K/.test(move)) {
      patterns.push('king-move');
    }
    // Back rank (rank 8 or 1)
    if (/[18][\+#]?$/.test(move)) {
      patterns.push('back-rank');
    }
  }
  
  // Remove duplicates
  analysis.patterns = [...new Set(patterns)];
  return analysis;
}

// Generate hints based on the actual moves and tactical patterns
function generateHints(lichessUrl, moveSequence) {
  const analysis = analyzeMoves(moveSequence);
  const patterns = analysis.patterns;
  const moves = analysis.moves;
  const hints = [];

  // Extract FEN to analyze first move
  const match = lichessUrl.match(/\/analysis\/([^%]+)(?:%20|%|$)/);
  const fen = match ? decodeURIComponent(match[1]) : '';
  const firstMove = moves.length > 0 ? moves[0] : '';
  
  // Parse board for piece positions
  let pieceLocation = describePieceToMove(fen, firstMove);

  // Build hints based on what's actually in the solution
  
  // Hint 1: Overall tactical theme
  if (patterns.includes('checkmate')) {
    if (patterns.includes('back-rank')) {
      hints.push(`Look for how the opponent's king is trapped on the back rank with limited escape squares. Often a queen or rook can deliver the final blow once the king runs out of flight squares.`);
    } else if (patterns.includes('promotion')) {
      hints.push(`Notice that a passed pawn can race to promotion and deliver checkmate. Sometimes one move ahead is all you need—look for how a pawn advance with promotion creates an unstoppable threat.`);
    } else {
      hints.push(`Scan for squares around the opponent's king that are controlled but not solidly defended. A queen or rook moving to such a square with checkmate leaves no escape.`);
    }
  } else if (patterns.includes('capture') && patterns.includes('check')) {
    hints.push(`Look for forcing sequences where each move is check or captures material. Your opponent has limited options when you're giving check—use this to win material or deliver mate.`);
  } else if (patterns.includes('check')) {
    hints.push(`Checks are forcing moves that limit your opponent's replies. Look for a series of checks that either win material, restrict the king, or set up a mating net.`);
  } else {
    hints.push(`Look for quiet moves that create unstoppable threats. Sometimes the strongest move isn't flashy—it's one that limits your opponent's options so severely they're forced into a losing position.`);
  }

  // Hint 2: Piece-specific strategy
  if (patterns.includes('rook-move')) {
    if (patterns.includes('back-rank')) {
      hints.push(`Rooks on the back rank (7th or 8th) are often devastating. Can your rook invade on an open or semi-open file to deliver checkmate or trap the king?`);
    } else {
      hints.push(`Rooks own open files and dominate when they can attack multiple pieces or cut off the opponent's escape routes. Look for how your rook can reach the most active square.`);
    }
  } else if (patterns.includes('queen-move')) {
    hints.push(`Queens combine the power of rooks and bishops. Look for squares where your queen can give check, attack undefended pieces, or coordinate with another piece to create mate threats.`);
  } else if (patterns.includes('knight-move')) {
    hints.push(`Knights create unique tactical opportunities because they jump over pieces and attack in an "L" shape. Look for a knight fork (attacking two pieces) or a knight check that drives the king to a worse square.`);
  } else if (patterns.includes('bishop-move')) {
    hints.push(`Bishops control long diagonals. Look for a diagonal where your bishop can attack the opponent's king, undefended pieces, or cut off the king's escape.`);
  }
  
  // Hint 3: Combination/sequence advice
  if (moves.length > 1) {
    hints.push(`This is a multi-move combination. After your first move, look at what squares the opponent can access. Often the best move forces your opponent into a position where your next move is even stronger.`);
  } else if (patterns.includes('promotion')) {
    hints.push(`Pawn promotion is one of the most powerful endgame tactics. If you can push a passed pawn to the 7th or 8th rank, your opponent must deal with the promotion threat immediately.`);
  } else {
    hints.push(`Every piece on the board either attacks or defends something. Ask: which opponent piece is least defended? Which of my pieces can reach an important square on the next move?`);
  }

  // Hint 4: Blatant hint - which piece to move
  if (pieceLocation) {
    hints.push(`Try moving your ${pieceLocation}.`);
  } else {
    hints.push(`Focus on your most active attacking piece and look for how it can deliver a decisive blow.`);
  }

  return hints.length >= 4 ? hints.slice(0, 4) : hints;
}

// Helper to describe which piece should move
function describePieceToMove(fen, firstMove) {
  if (!fen || !firstMove) return null;
  
  const fenParts = fen.split(' ');
  const board = fenParts[0];
  const toMove = fenParts[1]; // 'w' or 'b'
  
  // Parse board to find piece positions
  const pieces = {};
  const ranks = board.split('/');
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const char of ranks[r]) {
      if (/\d/.test(char)) {
        file += parseInt(char);
      } else {
        const pos = String.fromCharCode(97 + file) + (8 - r); // a-h, 1-8
        pieces[pos] = char;
        file++;
      }
    }
  }

  // Determine which piece type is moving (first character of move, or infer from position)
  let movePieceType = firstMove[0];
  if (/^[a-h]/.test(firstMove)) {
    // Pawn move - starts with file letter
    movePieceType = 'p';
  } else if (/^[KQRBN]/.test(firstMove)) {
    movePieceType = firstMove[0];
  }

  const playerColor = toMove === 'w' ? 'white' : 'black';
  const searchFor = playerColor === 'white' ? movePieceType : movePieceType.toLowerCase();

  // Find all pieces of this type
  const positions = [];
  for (const pos in pieces) {
    if (pieces[pos] === searchFor) {
      positions.push(pos);
    }
  }

  if (positions.length === 0) return null;
  if (positions.length === 1) {
    return describePosition(searchFor, positions[0], toMove);
  }

  // Multiple pieces of same type - need to narrow down
  // For now, use file/rank heuristics
  if (positions.length > 1) {
    // Sort by file (a-h) and rank (1-8)
    positions.sort((a, b) => {
      const aFile = a.charCodeAt(0) - 97; // 0-7
      const bFile = b.charCodeAt(0) - 97;
      const aRank = parseInt(a[1]);
      const bRank = parseInt(b[1]);
      
      if (aFile !== bFile) return aFile - bFile;
      return aRank - bRank;
    });

    // Try to pick the most active one (usually extremes or center)
    // For white: rightmost or back rank pieces are often active
    // For black: leftmost or front rank pieces are often active
    let chosenPos;
    if (toMove === 'w') {
      // Prefer rightmost or most advanced
      chosenPos = positions[positions.length - 1];
    } else {
      // Prefer leftmost or most advanced (on board perspective)
      chosenPos = positions[0];
    }

    return describePosition(searchFor, chosenPos, toMove);
  }

  return null;
}

// Describe a piece's position using relative language
function describePosition(pieceType, pos, toMove) {
  const file = pos.charCodeAt(0) - 97; // 0 = a, 7 = h
  const rank = parseInt(pos[1]); // 1-8
  
  const pieceNames = {
    'p': 'pawn',
    'P': 'pawn',
    'n': 'knight',
    'N': 'knight',
    'b': 'bishop',
    'B': 'bishop',
    'r': 'rook',
    'R': 'rook',
    'q': 'queen',
    'Q': 'queen',
    'k': 'king',
    'K': 'king'
  };

  let pieceDesc = pieceNames[pieceType] || 'piece';
  let posDesc = '';

  // Determine position descriptors
  const isLeftSide = file < 3;
  const isRightSide = file > 4;
  const isCenter = file >= 3 && file <= 4;
  const isBackRank = (toMove === 'w' && rank === 1) || (toMove === 'b' && rank === 8);
  const isFrontRank = (toMove === 'w' && rank === 8) || (toMove === 'b' && rank === 1);
  const isAdvanced = (toMove === 'w' && rank >= 6) || (toMove === 'b' && rank <= 3);

  if (isBackRank) {
    posDesc = 'back-rank ';
  } else if (isFrontRank) {
    posDesc = 'front ';
  } else if (isAdvanced) {
    posDesc = 'advanced ';
  }

  if (isLeftSide) {
    posDesc += 'leftmost ';
  } else if (isRightSide) {
    posDesc += 'rightmost ';
  } else if (isCenter) {
    posDesc += 'center ';
  }

  return posDesc.trim() + ' ' + pieceDesc;
}

// Main script
(async () => {
  console.log('Reading puzzles.json...');
  
  if (!fs.existsSync('puzzles.json')) {
    console.error('Error: puzzles.json not found');
    process.exit(1);
  }

  const puzzles = JSON.parse(fs.readFileSync('puzzles.json', 'utf-8'));
  const puzzlesWithHints = {};
  let totalHinted = 0;

  // Process each page and its puzzles
  for (const pageName in puzzles) {
    const pageData = puzzles[pageName];
    const pageWithHints = {};

    for (const lichessUrl in pageData) {
      const answer = pageData[lichessUrl];
      const hints = generateHints(lichessUrl, answer);

      pageWithHints[lichessUrl] = {
        answer: answer,
        hints: hints
      };
      totalHinted++;
    }

    puzzlesWithHints[pageName] = pageWithHints;
  }

  // Write to output file
  const outputFile = 'puzzles_with_hints.json';
  fs.writeFileSync(outputFile, JSON.stringify(puzzlesWithHints, null, 2));
  
  console.log(`✓ Generated hints for ${totalHinted} puzzles`);
  console.log(`✓ Saved to ${outputFile}\n`);
  
  // Show samples
  const samples = [];
  let count = 0;
  for (const pageKey in puzzlesWithHints) {
    for (const puzzleUrl in puzzlesWithHints[pageKey]) {
      if (samples.length < 5) {
        samples.push({
          page: pageKey,
          url: puzzleUrl,
          puzzle: puzzlesWithHints[pageKey][puzzleUrl]
        });
      }
      count++;
    }
  }
  
  console.log('Sample puzzles with 4 hints (solution-specific):\n');
  samples.forEach((s, idx) => {
    console.log(`[${idx+1}] ${s.page}`);
    console.log(`Answer: ${s.puzzle.answer}`);
    console.log('Hints:');
    s.puzzle.hints.forEach((h, i) => console.log(`  ${i+1}. ${h}`));
    console.log('');
  });
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
