const fs = require('fs');
const path = require('path');
const { Chess } = require('./game/node_modules/chess.js');

const PIECE_NAMES = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king'
};

function splitMoves(moveSequence) {
  if (!moveSequence) return [];
  return moveSequence
    .split(',')
    .map((move) => move.trim())
    .filter(Boolean);
}

function parseFenFromLichessUrl(url) {
  try {
    const marker = 'lichess.org/analysis/';
    const markerIndex = String(url || '').indexOf(marker);
    if (markerIndex === -1) return null;

    let fen = String(url).slice(markerIndex + marker.length).split('?')[0];
    if (fen.startsWith('standard/')) {
      fen = fen.slice('standard/'.length);
    }

    return decodeURIComponent(fen).replace(/_/g, ' ').trim();
  } catch {
    return null;
  }
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
    firstMoveHasCapture: firstMove.includes('x'),
    firstMoveHasCheck: firstMove.includes('+') || firstMove.includes('#'),
    firstMoveHasPromotion: firstMove.includes('='),
  };
}

function hashString(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickVariant(seed, list, salt = 0) {
  return list[(seed + salt) % list.length];
}

function pieceName(pieceCode) {
  return PIECE_NAMES[String(pieceCode || '').toLowerCase()] || 'piece';
}

function tacticText(tactic) {
  return String(tactic || '').replace(/-/g, ' ').trim().toLowerCase();
}

function forcingWord(analysis) {
  if (analysis.firstMoveHasCheck || analysis.hasCheck) return 'check';
  if (analysis.firstMoveHasCapture || analysis.hasCapture) return 'capture';
  if (analysis.firstMoveHasPromotion || analysis.hasPromotion) return 'promotion';
  return 'threat';
}

function inferTactic(pageName, analysis) {
  const key = (pageName || '').toLowerCase();

  if (key.includes('pin')) return 'pin';
  if (key.includes('fork')) return 'fork';
  if (key.includes('skewer')) return 'skewer';
  if (key.includes('discovered-attack')) return 'discovered attack';
  if (key.includes('double-check')) return 'double check';
  if (key.includes('x-ray-attack')) return 'x-ray attack';
  if (key.includes('deflection')) return 'deflection';
  if (key.includes('attraction')) return 'attraction';
  if (key.includes('interference')) return 'interference';
  if (key.includes('clearance')) return 'clearance';
  if (key.includes('capturing-defender')) return 'removal of defender';
  if (key.includes('hanging-piece')) return 'hanging piece';
  if (key.includes('trapped-piece')) return 'trapped piece';
  if (key.includes('zugzwang')) return 'zugzwang';
  if (key.includes('intermezzo')) return 'zwischenzug';
  if (key.includes('quiet-move')) return 'quiet move';
  if (key.includes('under-promotion')) return 'underpromotion';
  if (key.includes('sacrifice')) return 'sacrifice';
  if (key.includes('promotion') || key.includes('advanced-pawn')) return 'promotion tactic';

  if (key.includes('back-rank')) return 'back-rank mate';
  if (key.includes('smothered')) return 'smothered mate';
  if (key.includes('anastasia')) return 'Anastasia mate';
  if (key.includes('arabian')) return 'Arabian mate';
  if (key.includes('boden')) return 'Boden mate';
  if (key.includes('double-bishop')) return 'double bishop mate';
  if (key.includes('dovetail')) return 'dovetail mate';
  if (key.includes('hook')) return 'hook mate';
  if (key.includes('mate') || key.includes('one-move')) return 'mating net';

  if (key.includes('endgame') || key.includes('queen-endgame') || key.includes('pawn-endgame') || key.includes('knight-endgame')) {
    return 'endgame squeeze';
  }

  if (key.includes('opening') || key.includes('defense') || key.includes('gambit') || key.includes('game') || key.includes('system')) {
    return 'opening tactic';
  }

  if (key.includes('exposed-king') || key.includes('king-side-attack') || key.includes('queen-side-attack')) {
    return 'king attack';
  }

  if (analysis.hasPromotion) return 'promotion tactic';
  if (analysis.hasMate) return 'mating net';
  if (analysis.firstMoveHasCheck || analysis.hasCheck) return 'forcing check sequence';
  if (analysis.firstMoveHasCapture || analysis.hasCapture) return 'removal of defender';
  if (analysis.moveCount >= 3) return 'combination';

  return 'tactical idea';
}

function buildHintOne(tactic, analysis, seed) {
  const bank = {
    pin: [
      'Notice the enemy pieces lined up on one path, with one piece stuck as a bodyguard.',
      'A pin weakness is present because one enemy piece cannot move without losing something bigger.',
      'Look for a pinned defender: it is protecting a stronger piece behind it and cannot safely step away.'
    ],
    fork: [
      'Two enemy targets are close enough for a fork, so one jump can attack both together.',
      'A fork chance is here because the enemy pieces are crowded and cannot all be saved.',
      'See the fork vulnerability: one move can threaten two important targets at once.'
    ],
    skewer: [
      'A skewer weakness is visible because a valuable target sits in front of another target on one line.',
      'Notice the enemy pieces stacked in a line; this shape is vulnerable to a skewer.',
      'One enemy piece is shielding another on a line, and that creates a skewer chance.'
    ],
    'discovered attack': [
      'A discovered attack is ready because one blocker is hiding power from a teammate behind it.',
      'The line is loaded: move one blocker and a hidden attack appears at once.',
      'A hidden attacker is already aimed, so this position is vulnerable to a discovered attack.'
    ],
    'double check': [
      'King safety is fragile because a double check pattern can appear.',
      'A double check idea is available, and the king has too little shelter.',
      'The king can be hit from two directions at once, creating a double check weakness.'
    ],
    'x-ray attack': [
      'An x-ray attack is possible because pressure can pass through a front piece to a target behind it.',
      'One line carries hidden pressure through a blocker, creating an x-ray weakness.',
      'The enemy setup is vulnerable to x-ray pressure on a shared line.'
    ],
    deflection: [
      'A deflection tactic is available because one defender is busy protecting an important square.',
      'The defense depends on one key guard, so deflection can pull it away.',
      'A single defender is overloading itself, making this a deflection vulnerability.'
    ],
    attraction: [
      'Attraction is possible because one enemy piece can be pulled onto a bad square.',
      'A lure tactic is ready: this decoy can pull a key defender away.',
      'The enemy setup has a square that looks safe but is perfect for attraction.'
    ],
    interference: [
      'Interference is available because two enemy pieces rely on a shared line of defense.',
      'A block between defenders can break their teamwork, creating an interference tactic.',
      'The defense works only while one line stays open, and that line can be blocked.'
    ],
    clearance: [
      'A clearance idea is present because one square or line must be opened for the attack.',
      'A piece is in the way of a stronger plan, so clearance is the key vulnerability.',
      'The attack improves as soon as one line is cleared.'
    ],
    'removal of defender': [
      'A key defender is overloaded, so one exchange can break the whole shield.',
      'The defense depends on one guard, making removal of defender the main vulnerability.',
      'One defender is doing too many jobs, and that is the crack to target.'
    ],
    'hanging piece': [
      'An enemy piece is loose and can be won because it is not protected well enough.',
      'A hanging piece weakness is here: one target can be attacked with tempo.',
      'A loose enemy piece is vulnerable now and cannot be safely kept.'
    ],
    'trapped piece': [
      'An enemy piece has too few exits, creating a trapped piece opportunity.',
      'A trapped piece weakness is present because escape squares are shrinking.',
      'One enemy piece is boxed in and vulnerable to a trap.'
    ],
    zugzwang: [
      'The opponent has no happy move, which is the core zugzwang vulnerability.',
      'Any waiting move hurts the defense here, so zugzwang is near.',
      'The position is built for zugzwang because every legal move creates a new weakness.'
    ],
    zwischenzug: [
      'A zwischenzug chance is present because an in-between move can improve your result.',
      'Before the obvious recapture, an in-between tactic can gain more.',
      'The position allows a sneaky in-between move that changes everything.'
    ],
    'quiet move': [
      'A quiet move idea is strong because the direct move is not the best way to win.',
      'The biggest threat starts with a calm move, not an immediate hit.',
      'A quiet move can improve pressure while the enemy has no good fix.'
    ],
    underpromotion: [
      'Underpromotion is the vulnerability because promoting to the biggest piece is not best here.',
      'A special promotion choice is needed because the usual promotion can fail.',
      'This position rewards underpromotion to control key squares precisely.'
    ],
    'promotion tactic': [
      'A passed pawn is close to becoming a new piece, and the defense cannot fully stop that plan.',
      'Promotion danger is real because the pawn structure gives a clear race edge.',
      'A promotion tactic is available as the pawn race favors the attacker.'
    ],
    'mating net': [
      'The enemy king is running out of safe squares, so a mating net is forming.',
      'King safety is broken because escape squares are disappearing.',
      'A mating net vulnerability is present as the king has too few exits.'
    ],
    'back-rank mate': [
      'The king is boxed in on the back rank, which creates a classic mate weakness.',
      'A back-rank trap is visible because the king has no easy escape lane.',
      'Back-rank mate danger is near: the king is trapped behind its own pieces.'
    ],
    'king attack': [
      'The king is exposed and the nearby defenders are not coordinated.',
      'King safety is weak because key guard squares are under pressure.',
      'An attack is ready because the king has limited safe shelter.'
    ],
    'opening tactic': [
      'In this opening position, one side is underdeveloped and tactically vulnerable in the center.',
      'The opening setup has a coordination gap that can be punished immediately.',
      'A common opening weakness appears here: active pressure on an open file or diagonal beats slow development.'
    ],
    'endgame squeeze': [
      'In this endgame, one small weakness can be targeted until the defense collapses.',
      'Endgame pieces are stretched thin, creating a clear tactical target.',
      'This endgame has a fragile defender that can be overloaded.'
    ]
  };

  const fallback = [
    `The position has a tactical weakness that fits the ${tactic} idea.`,
    `A clear crack is visible, and the ${tactic} plan can exploit it.`,
    `This setup is vulnerable to a ${tactic} pattern.`
  ];

  return pickVariant(seed, bank[tactic] || fallback, 3);
}

function buildHintTwo(tactic, analysis, seed) {
  const forcing = forcingWord(analysis);

  const bank = {
    pin: [
      'Use the pin by adding pressure until the pinned piece cannot keep protecting the target behind it.',
      'To master pins, attack what the pinned piece guards, not just the pinned piece itself.',
      'Build the pin step by step so the defender is forced to break.'
    ],
    fork: [
      'Use the fork by finding one landing square that attacks two important targets at once.',
      'To master forks, choose the move that creates two threats and only one can be answered.',
      'A strong fork works when both targets matter and one must be lost.'
    ],
    skewer: [
      'Use the skewer by forcing the front piece to move, then winning the target behind it.',
      'To master skewers, attack through the front shield so the back piece becomes loose.',
      'Skewers work best when the front piece has to move first.'
    ],
    'discovered attack': [
      'Use the discovered attack by moving the blocker with tempo so the hidden line opens.',
      'To master discovered attacks, move one piece while the revealed attacker creates the real threat.',
      'Open the hidden line with a forcing move so the defense cannot reset.'
    ],
    'double check': [
      'In a double check, keep forcing moves so the king never gets a safe pause.',
      'Use the double check by shrinking king escapes one move at a time.',
      'Double check is strongest when every reply still faces a new forcing threat.'
    ],
    'x-ray attack': [
      'Use x-ray pressure by attacking through the front piece to the target behind it.',
      'To master x-ray attacks, keep the line active and force the blocker to fail.',
      'X-ray works when one line controls two targets in depth.'
    ],
    deflection: [
      'Use deflection by dragging the key defender away from its important job.',
      'To master deflection, force the guard to move and then hit what it was protecting.',
      'Deflection works when one defender is too important to replace.'
    ],
    attraction: [
      'Use attraction by luring the enemy piece onto a square where your tactic starts.',
      'To master attraction, offer bait that pulls the defender off the best square.',
      'A good attraction move places the enemy exactly where you want it.'
    ],
    interference: [
      'Use interference by placing a blocker between enemy defenders so they stop helping each other.',
      'To master interference, cut the defense line first, then strike the weak target.',
      'Interference works when one blocking move breaks two defensive jobs.'
    ],
    clearance: [
      'Use clearance by moving a blocker so your strongest line becomes active.',
      'To master clearance, open the lane first, then launch the main threat.',
      'Clearance works when one move unlocks a stronger follow-up.'
    ],
    'removal of defender': [
      'Use removal of defender by trading off the key guard, then hitting the unprotected target.',
      'To master this tactic, remove the bodyguard before trying to win the prize behind it.',
      'Take away the main defender and the rest of the position falls apart.'
    ],
    'hanging piece': [
      'Use this by attacking the loose piece with tempo so it cannot be saved cleanly.',
      'To master hanging-piece tactics, force a reply while keeping pressure on the loose target.',
      'Win loose pieces by choosing forcing moves that do two jobs at once.'
    ],
    'trapped piece': [
      'Use the trap by taking away escape squares until the piece has nowhere safe to go.',
      'To master trapped-piece ideas, lock the exits first and only then collect the piece.',
      'A trap works when each move removes one more escape.'
    ],
    zugzwang: [
      'Use zugzwang by keeping tension and making the opponent move first.',
      'To master zugzwang, improve your position while the opponent runs out of useful moves.',
      'In zugzwang, patience wins because every enemy move creates a new weakness.'
    ],
    zwischenzug: [
      'Use the in-between move before the obvious move to gain extra value.',
      'To master zwischenzug, ask if a stronger forcing move exists before recapturing.',
      'The in-between tactic works when one quick threat improves the whole sequence.'
    ],
    'quiet move': [
      'Use the quiet move to improve your position before delivering the tactical blow.',
      'To master quiet moves, create a hidden threat the opponent cannot fix in time.',
      'Quiet-move tactics win when patience builds an unstoppable follow-up.'
    ],
    underpromotion: [
      'Use underpromotion by choosing the promoted piece that controls the key squares best.',
      'To master underpromotion, pick function over power and choose the piece that fits the tactic.',
      'Underpromotion works when the special piece gives cleaner control than the usual choice.'
    ],
    sacrifice: [
      'Use sacrifice ideas by giving a piece to open lines and gain stronger threats.',
      'To master sacrifice play, trade material for king safety damage or winning tempo.',
      'A good sacrifice is planned: you give less and win more in the next moves.'
    ],
    'promotion tactic': [
      'Use the promotion idea by forcing the defense to react while the pawn keeps advancing.',
      'To master promotion tactics, clear blockers and keep the pawn moving with tempo.',
      'Promotion works when every enemy reply still allows pawn progress.'
    ],
    'mating net': [
      'Build the mating net by removing escape squares one by one with forcing moves.',
      'To master mating nets, keep the initiative and never release king pressure.',
      'A mating net works when each move takes away one more king exit.'
    ],
    'back-rank mate': [
      'Use back-rank pressure by keeping the king boxed in and attacking the final gate.',
      'To master back-rank mate, trap the king first and strike only when escape is gone.',
      'Back-rank mate appears when the king cannot step forward and must stay trapped.'
    ],
    'king attack': [
      'Use the king attack by chaining forcing moves so defenders cannot regroup.',
      'To master king attacks, remove key defenders before aiming at checkmate.',
      'Strong king attacks keep tempo and never let the defense breathe.'
    ],
    'opening tactic': [
      'Use this opening tactic by punishing slow development with forcing play.',
      'To master opening tactics, target uncoordinated pieces before they connect.',
      'Opening tactics work when activity and tempo beat material greed.'
    ],
    'endgame squeeze': [
      'Use the endgame squeeze by improving your piece activity before the final tactic.',
      'To master endgame tactics, attack the weakest pawn or defender again and again.',
      'Endgame squeezes win by fixing one weakness and then forcing it to break.'
    ]
  };

  const fallback = [
    `Use a forcing ${forcing} to make the ${tactic} idea work.`,
    `Build pressure with forcing moves until the ${tactic} pattern is clear.`,
    `Play forcing chess first; that is how this ${tactic} is solved.`
  ];

  return pickVariant(seed, bank[tactic] || fallback, 13);
}

function pieceSpecificHint(piece, tactic, analysis) {
  const templates = [
    `Now use your ${piece} to execute the ${tactic}.`,
    `Now let your ${piece} begin the ${tactic}.`,
    `Your ${piece} starts this ${tactic} now.`,
    `Use your ${piece} now to launch the ${tactic}.`,
    `The ${tactic} starts with your ${piece}.`,
    `Lead with your ${piece} to start the ${tactic}.`,
    `Begin this ${tactic} with your ${piece}.`,
    `Your ${piece} is the starter for this ${tactic}.`,
    `First move: your ${piece} begins the ${tactic}.`,
    `The opening move in this ${tactic} is with your ${piece}.`,
    `Start the ${tactic} by activating your ${piece}.`,
    `Use your ${piece} first to begin this ${tactic}.`
  ];

  if (piece === 'pawn') {
    if (analysis.hasPromotion || tactic === 'promotion tactic' || tactic === 'underpromotion') {
      return pickVariant(hashString(`${piece}|${tactic}|p1`), [
        `Now use your pawn to drive the ${tactic} to completion.`,
        `Your pawn leads this ${tactic}; keep it moving.`,
        `Start the ${tactic} with your pawn push now.`,
        `Your pawn move begins this ${tactic}.`,
        `Use your pawn now and finish the ${tactic}.`,
        `Lead with your pawn to begin this ${tactic}.`,
        `The ${tactic} begins with a pawn move.`,
        `First move: push your pawn for this ${tactic}.`
      ], 7);
    }
    return pickVariant(hashString(`${piece}|${tactic}|p2`), [
      `Now use your pawn to start the ${tactic} with tempo.`,
      `Your pawn starts this ${tactic} right now.`,
      `Begin the ${tactic} with your pawn move.`,
      `Use your pawn now to launch this ${tactic}.`,
      `The ${tactic} begins with your pawn push.`,
      `Lead with your pawn to start the ${tactic}.`,
      `First move is a pawn move in this ${tactic}.`,
      `Start this ${tactic} by moving your pawn.`
    ], 11);
  }

  return pickVariant(hashString(`${piece}|${tactic}|g`), templates, 5);
}

function obviousHint(piece, tactic) {
  const templates = [
    `Start with your ${piece}; that move makes the ${tactic} obvious.`,
    `Your first move is with your ${piece}; that reveals the ${tactic}.`,
    `Begin with your ${piece} to show the ${tactic}.`,
    `Play your ${piece} first, and the ${tactic} appears.`,
    `Use your ${piece} first; then the ${tactic} is clear.`
  ];

  return pickVariant(hashString(`${piece}|${tactic}|h4`), templates, 17);
}

function cleanHint(hint) {
  const replacements = [
    [/vulnerability/gi, 'weak spot'],
    [/immediately/gi, 'now'],
    [/tactically/gi, ''],
    [/critical/gi, 'key'],
    [/valuable/gi, 'strong'],
    [/defender/gi, 'guard'],
    [/defenders/gi, 'guards'],
    [/position is/gi, 'board is'],
    [/cannot/gi, "can't"],
    [/do not/gi, "don't"],
    [/while/gi, 'as'],
    [/unprotected/gi, 'loose'],
    [/at once/gi, 'now'],
    [/one by one/gi, 'step by step'],
    [/has too little shelter/gi, 'is exposed'],
    [/the position allows/gi, 'you can play'],
    [/the position has/gi, 'there is'],
    [/the board is/gi, 'board is']
  ];

  let out = String(hint || '');
  replacements.forEach(([pattern, value]) => {
    out = out.replace(pattern, value);
  });

  out = out
    .replace(/^To master [^,]+,\s*/i, '')
    .replace(/^In this opening position,\s*/i, '')
    .replace(/^In this endgame,\s*/i, '')
    .replace(/^In a double check,\s*/i, '')
    .replace(/^A common opening weakness appears here:\s*/i, '')
    .replace(/^The position is built for\s*/i, '')
    .replace(/^Notice\s+/i, 'See ')
    .replace(/^Look for\s+/i, 'Find ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = out.split(' ').filter(Boolean);
  if (words.length > 13) {
    out = `${words.slice(0, 13).join(' ')}.`;
  }

  out = out.replace(/\s+([.,!?;:])/g, '$1').replace(/\.{2,}/g, '.').trim();

  if (out.length) {
    out = out[0].toUpperCase() + out.slice(1);
    if (!/[.!?]$/.test(out)) {
      out += '.';
    }
  }

  return out;
}

function normalizeLoose(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hintMentionsTactic(hint, tactic) {
  const h = normalizeLoose(hint);
  const t = normalizeLoose(tactic).replace(/-/g, ' ');

  if (!t) return false;
  if (h.includes(t)) return true;

  const aliases = {
    'mating net': ['mate', 'mating net', 'checkmate'],
    'removal of defender': ['defender', 'guard', 'overloaded'],
    'promotion tactic': ['promotion', 'promote', 'pawn'],
    'double check': ['double check', 'two checks'],
    'x ray attack': ['x ray', 'x-ray'],
    'trapped piece': ['trapped', 'trap']
  };

  const options = aliases[t] || [t];
  return options.some((term) => h.includes(normalizeLoose(term)));
}

function lowerFirst(text) {
  const value = String(text || '').trim();
  if (!value) return value;
  return value[0].toLowerCase() + value.slice(1);
}

function foldTacticIntoHint(hint, tactic, mode) {
  if (hintMentionsTactic(hint, tactic)) {
    return hint;
  }

  const tacticTextValue = tacticText(tactic);
  const sentence = String(hint || '').replace(/[.!?]+$/g, '').trim();

  if (!sentence) {
    return cleanHint(`Think in terms of ${tacticTextValue}.`);
  }

  if (mode === 'subtle') {
    return cleanHint(`Look for the ${tacticTextValue} idea where ${lowerFirst(sentence)}.`);
  }

  return cleanHint(`Use the ${tacticTextValue} idea by ${lowerFirst(sentence)}.`);
}

function ensureTacticInSubtleHint(hint, tactic) {
  return foldTacticIntoHint(hint, tactic, 'subtle');
}

function ensureTacticInPlanHint(hint, tactic) {
  return foldTacticIntoHint(hint, tactic, 'plan');
}

function softenSubtleHint(hint) {
  return cleanHint(
    singlePoint(hint)
      .replace(/\b(?:your|the)\s+(pawn|knight|bishop|rook|queen|king)\b/gi, 'a piece')
      .replace(/^(Use|Play|Start|Begin)\b/i, 'Look')
  );
}

function singlePoint(hint) {
  const sentence = String(hint || '')
    .split(/[.!?]/)
    .map((part) => part.trim())
    .find(Boolean) || '';

  return cleanHint(sentence);
}

function stageOneHint(analysis, seed) {
  const bank = analysis.hasMate || analysis.hasCheck
    ? [
      'The king has too few safe squares.',
      'King safety is the weak spot.',
      'The king is short on shelter.'
    ]
    : analysis.hasPromotion
      ? [
        'A pawn is close to promotion.',
        'Promotion danger is the weak spot.',
        'The pawn race favors your side.'
      ]
      : analysis.hasCapture
        ? [
          'One enemy guard is overloaded.',
          'A loose piece is the weak spot.',
          'One defender is doing too much.'
        ]
        : [
          'One line can be opened.',
          'Piece coordination is the weak spot.',
          'A small tactical crack is present.'
        ];

  return singlePoint(pickVariant(seed, bank, 19));
}

function stageTwoHint(tactic, seed) {
  const text = tacticText(tactic);
  const bank = [
    `Think in terms of ${text}.`,
    `This plan is a ${text} idea.`,
    `Use the ${text} pattern here.`
  ];

  return singlePoint(pickVariant(seed, bank, 23));
}

function stageThreeHint(piece, seed) {
  const bank = [
    `Your ${piece} starts this plan.`,
    `The first move is with your ${piece}.`,
    `Begin with your ${piece}.`
  ];

  return singlePoint(pickVariant(seed, bank, 29));
}

function stageFourHint(piece, analysis, seed) {
  const bank = analysis.firstMoveHasCheck
    ? [
      `Start with a ${piece} move that gives check.`,
      `Your first move with the ${piece} gives check.`,
      `Play the ${piece} move that checks the king.`,
      `Lead with your ${piece} and give check first.`,
      `The first ${piece} move is a check.`,
      `Begin by checking with your ${piece}.`,
      `Open with a checking ${piece} move.`,
      `First action: check the king with your ${piece}.`
    ]
    : analysis.firstMoveHasCapture
      ? [
        `Start with a ${piece} capture.`,
        `Your first ${piece} move is a capture.`,
        `Play the ${piece} move that takes a piece.`,
        `Lead with your ${piece} capture first.`,
        `Open with a capture by your ${piece}.`,
        `First action: your ${piece} captures.`,
        `Begin by taking a piece with your ${piece}.`,
        `Start by capturing with your ${piece}.`
      ]
      : analysis.firstMoveHasPromotion
        ? [
          'Start with the pawn push toward promotion.',
          'Your first move pushes the pawn to promote.',
          'Play the pawn move that drives promotion.',
          'Open by pushing the pawn toward promotion.',
          'First action: advance the pawn to promote.',
          'Begin with the pawn move that threatens promotion.',
          'Start by driving your pawn toward promotion.',
          'Lead with a pawn push for promotion.'
        ]
        : [
          `Start with your ${piece} now.`,
          `Your first move is the ${piece} move.`,
          `Play the ${piece} first.`,
          `Lead with your ${piece} first move.`,
          `Open with your ${piece}.`,
          `First action is a ${piece} move.`,
          `Begin by moving your ${piece}.`,
          `Start this line with your ${piece}.`
        ];

  return singlePoint(pickVariant(seed, bank, 31));
}

function generateHints(pageName, lichessUrl, moveSequence) {
  const analysis = analyzeSequence(moveSequence);
  const tactic = inferTactic(pageName, analysis);
  const piece = analysis.primaryPiece;
  const seed = hashString(`${pageName}|${lichessUrl}|${moveSequence}`);

  const coreHints = [
    ensureTacticInSubtleHint(softenSubtleHint(buildHintOne(tactic, analysis, seed)), tactic),
    ensureTacticInPlanHint(singlePoint(buildHintTwo(tactic, analysis, seed)), tactic),
    cleanHint(singlePoint(pieceSpecificHint(piece, tactic, analysis))),
    cleanHint(singlePoint(stageFourHint(piece, analysis, seed)))
  ];

  return coreHints;
}

function isCheck(game) {
  return typeof game?.isCheck === 'function' ? game.isCheck() : false;
}

function isCheckmate(game) {
  return typeof game?.isCheckmate === 'function' ? game.isCheckmate() : false;
}

function tacticLabelForMove(pageName, tactic) {
  const key = normalizeTag(pageName);
  const normalizedTactic = normalizeTag(tactic);

  if (key.includes('back-rank')) return 'Back-rank pressure';
  if (key.includes('smothered')) return 'Smothered-mate pressure';
  if (key.includes('anastasia')) return 'Anastasia-mate pressure';
  if (key.includes('arabian')) return 'Arabian-mate pressure';
  if (key.includes('boden')) return 'Boden-mate pressure';
  if (key.includes('dovetail')) return 'Dovetail-mate pressure';
  if (key.includes('hook')) return 'Hook-mate pressure';
  if (key.includes('double-check')) return 'Double-check pressure';
  if (key.includes('x-ray')) return 'X-ray pressure';
  if (key.includes('capturing-defender')) return 'Defender-removal pressure';
  if (key.includes('hanging-piece')) return 'Loose-piece pressure';
  if (key.includes('trapped-piece')) return 'Trapped-piece pressure';
  if (key.includes('promotion') || key.includes('advanced-pawn')) return 'Promotion pressure';
  if (key.includes('endgame') || key.includes('equality')) return 'Endgame pressure';
  if (key.includes('opening') || key.includes('defense') || key.includes('gambit')) return 'Opening pressure';
  if (normalizedTactic) {
    return `${tacticText(tactic).replace(/\b\w/g, (letter) => letter.toUpperCase())} pressure`;
  }

  return 'Tactical pressure';
}

function isEndgameCategory(pageName, tactic) {
  const key = normalizeTag(pageName);
  return key.includes('endgame') || key.includes('equality') || normalizeTag(tactic).includes('zugzwang');
}

function getMoveFeature(context) {
  const flags = String(context.move.flags || '');
  if (context.move.promotion || context.san.includes('=')) return 'promotion';
  if (context.isMate) return 'mate';
  if (context.givesCheck) return 'check';
  if (flags.includes('k') || flags.includes('q') || /^O-O/.test(context.san)) return 'castling';
  if (context.move.captured) return 'capture';
  if (context.isEndgame) return 'endgame';
  return 'quiet';
}

function isSameFile(from, to) {
  return String(from || '')[0] === String(to || '')[0];
}

function isDiagonalMove(from, to) {
  const fileDelta = Math.abs(String(from || '').charCodeAt(0) - String(to || '').charCodeAt(0));
  const rankDelta = Math.abs(Number(String(from || '')[1]) - Number(String(to || '')[1]));
  return fileDelta > 0 && fileDelta === rankDelta;
}

function getMovePieceCue(context) {
  const flags = String(context.move.flags || '');
  const piece = String(context.move.piece || '').toLowerCase();

  if (context.move.promotion || context.san.includes('=')) {
    return 'passed-pawn choice';
  }

  if (flags.includes('k') || flags.includes('q') || /^O-O/.test(context.san)) {
    return 'castling resource';
  }

  if (piece === 'q') {
    return isDiagonalMove(context.move.from, context.move.to) ? 'queen diagonal' : 'queen line';
  }

  if (piece === 'r') {
    return isSameFile(context.move.from, context.move.to) ? 'rook file' : 'rook rank';
  }

  if (piece === 'b') return 'bishop diagonal';
  if (piece === 'n') return 'knight jump';
  if (piece === 'k') return 'king step';
  if (piece === 'p') return context.move.captured ? 'pawn lever' : 'pawn push';

  return 'piece route';
}

function buildSecondMoveHint(context, feature, seed) {
  const cue = getMovePieceCue(context);
  const captured = pieceName(context.move.captured);
  const captures = Boolean(context.move.captured);

  const opportunities = {
    mate: captures
      ? [
        'captures and shuts every king escape',
        'removes the guard and leaves the king boxed in',
        'lands with mate before the shelter can reopen'
      ]
      : [
        'shuts every king escape square',
        'leaves the king boxed in',
        'closes the last flight path'
      ],
    check: captures
      ? [
        'captures with check before the defense settles',
        `removes the loose ${captured} with check`,
        'wins tempo by checking and taking'
      ]
      : [
        'checks before the defense can settle',
        'keeps the king reacting with tempo',
        'forces the king to answer now'
      ],
    promotion: [
      'promotes and controls the key replies',
      'keeps the pawn race too fast to stop',
      'chooses the promotion that covers the reply'
    ],
    castling: [
      'tucks the king away and wakes the rook',
      'connects king safety with new rook pressure',
      'turns safety into a quick attacking resource'
    ],
    capture: [
      `removes the loose ${captured} with tempo`,
      `wins the vulnerable ${captured} before it escapes`,
      `takes the overloaded ${captured} out of the defense`
    ],
    endgame: [
      'wins tempo against the stretched defender',
      'turns the pawn race into a practical problem',
      'makes the defender choose between two weaknesses'
    ],
    quiet: [
      'creates a threat the defense cannot ignore',
      'adds pressure before the defense can settle',
      'sets up the forcing idea without giving tempo'
    ]
  };

  const opportunity = pickVariant(seed, opportunities[feature], 53);
  return cleanHint(`Find a ${cue} that ${opportunity}.`);
}

function buildMoveScopedHintPair(context, variantOffset = 0) {
  const seed = hashString([
    context.pageName,
    context.lichessUrl,
    context.answer,
    context.playerMoveIndex,
    context.san,
    context.beforeFen
  ].join('|'));
  const feature = getMoveFeature(context);

  const banks = {
    mate: [
      [
        'Mate-net pressure is current as escape routes are nearly gone.',
        'Find the forcing check that keeps every escape square under control.'
      ],
      [
        'Checkmate danger is sharper now as the shelter is collapsing.',
        'Search for the final checking idea that leaves the king boxed in.'
      ],
      [
        'A final checking pattern is close as safe exits are scarce.',
        'The right check must keep the king from finding any doorway.'
      ]
    ],
    check: [
      [
        'A forcing check is available now and should gain tempo.',
        'Find the checking idea that keeps the defense reacting this turn.'
      ],
      [
        'Current safety gaps make a checking resource more urgent right now.',
        'Search for the forcing check that improves the attack with tempo.'
      ],
      [
        'Immediate check pressure can keep the defense responding right now.',
        'The key is a check that does not let the defense settle.'
      ]
    ],
    promotion: [
      [
        'Promotion danger is urgent and the race can be decided now.',
        'Find the promotion choice that controls the important reply squares.'
      ],
      [
        'The current race is close to promotion and needs forcing play.',
        'Search for the pawn advance that keeps the defense too slow.'
      ],
      [
        'Promotion threats are growing and one precise choice matters now.',
        'The plan is to promote with tempo before the defense stabilizes.'
      ]
    ],
    castling: [
      [
        'Safety and coordination can improve with one forcing resource now.',
        'Find the castling resource that brings the pieces into coordination.'
      ],
      [
        'Castling can turn safety into active pressure right now quickly.',
        'Search for the king safety move that activates the rook too.'
      ],
      [
        'Development is unfinished and one resource improves safety with tempo.',
        'The plan is to tuck the king away and connect pressure.'
      ]
    ],
    capture: [
      [
        'A loose target can be won right now with tempo.',
        'Find the forcing capture that removes the loose target with tempo.'
      ],
      [
        'A vulnerable target is hanging as the defense is overloaded.',
        'Search for the capture that makes the overloaded defense fail.'
      ],
      [
        'The current opportunity is a forcing capture on a loose target.',
        'The key is taking the loose unit before it can escape.'
      ]
    ],
    endgame: [
      [
        'Endgame tempo is current and the race can swing now.',
        'Find the tempo resource that makes the defender choose badly.'
      ],
      [
        'A precise endgame resource can create two weaknesses right now.',
        'Search for the endgame tactic that turns one weakness decisive.'
      ],
      [
        'The defense lacks time, so the current tempo matters more.',
        'The key is improving pressure while the defender has no comfort.'
      ]
    ],
    quiet: [
      [
        'A quiet forcing resource can create a hard threat now.',
        'Find the quiet resource that creates pressure before the defense settles.'
      ],
      [
        'The current position has a tactical target hiding in plain sight.',
        'Search for the tempo move that makes the threat impossible to ignore.'
      ],
      [
        'A quiet pressure idea is current as the defense lacks coordination.',
        'The key idea improves pressure without giving the defense a pause.'
      ]
    ]
  };

  const firstHint = pickVariant(seed + variantOffset, banks[feature], 37)[0];
  return [
    cleanHint(firstHint),
    buildSecondMoveHint(context, feature, seed + variantOffset)
  ];
}

function sameHintPair(left, right) {
  if (!left || !right) return false;
  return normalizeLoose(left[0]) === normalizeLoose(right[0]) &&
    normalizeLoose(left[1]) === normalizeLoose(right[1]);
}

function fallbackMoveHints(pageName, lichessUrl, moveSequence) {
  const analysis = analyzeSequence(moveSequence);
  const tactic = inferTactic(pageName, analysis);
  const label = tacticLabelForMove(pageName, tactic);

  return splitMoves(moveSequence)
    .filter((_, index) => index % 2 === 0)
    .map((san, playerMoveIndex) => {
      const seed = hashString(`${pageName}|${lichessUrl}|${moveSequence}|${san}|${playerMoveIndex}`);
      const [first, second] = pickVariant(seed, [
        [
          `${label} is current as the defense has one loose detail.`,
          'Find the forcing resource that keeps the defense reacting this turn.'
        ],
        [
          'The current position has a tactical target hiding in plain sight.',
          'Search for the tempo idea that makes the threat impossible to ignore.'
        ],
        [
          'A fresh tactical clue is current as the defense lacks coordination.',
          'The key idea improves pressure without giving the defense a pause.'
        ]
      ], 41).map(cleanHint);

      return [first, second, `Play ${san}.`];
    });
}

function generateMoveHints(pageName, lichessUrl, moveSequence) {
  const fen = parseFenFromLichessUrl(lichessUrl);
  const answerMoves = splitMoves(moveSequence);

  if (!fen || !answerMoves.length) {
    return fallbackMoveHints(pageName, lichessUrl, moveSequence);
  }

  const fullAnalysis = analyzeSequence(moveSequence);
  const tactic = inferTactic(pageName, fullAnalysis);
  const tacticLabel = tacticLabelForMove(pageName, tactic);
  const moveHints = [];

  let game;
  try {
    game = new Chess(fen);
  } catch {
    return fallbackMoveHints(pageName, lichessUrl, moveSequence);
  }

  for (let answerMoveIndex = 0; answerMoveIndex < answerMoves.length; answerMoveIndex += 1) {
    const san = answerMoves[answerMoveIndex];
    const beforeFen = game.fen();
    let move;

    try {
      move = game.move(san);
    } catch {
      return fallbackMoveHints(pageName, lichessUrl, moveSequence);
    }

    if (!move) {
      return fallbackMoveHints(pageName, lichessUrl, moveSequence);
    }

    if (answerMoveIndex % 2 === 0) {
      const context = {
        pageName,
        lichessUrl,
        answer: moveSequence,
        playerMoveIndex: answerMoveIndex / 2,
        answerMoveIndex,
        san,
        move,
        beforeFen,
        tactic,
        tacticLabel,
        isMate: isCheckmate(game),
        givesCheck: isCheck(game),
        isEndgame: isEndgameCategory(pageName, tactic)
      };
      let hintPair = buildMoveScopedHintPair(context);

      for (let offset = 1; sameHintPair(hintPair, moveHints.at(-1)); offset += 1) {
        hintPair = buildMoveScopedHintPair(context, offset);
        if (offset > 4) break;
      }

      moveHints.push([
        ...hintPair,
        `Play ${san}.`
      ]);
    }
  }

  return moveHints;
}

function normalizeTag(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function inferTacticFamily(tactic) {
  const key = normalizeTag(tactic);

  if (key.includes('mate') || key === 'mating-net') return 'mate-patterns';
  if (key === 'promotion-tactic' || key === 'underpromotion') return 'promotion';
  if (key === 'fork' || key === 'pin' || key === 'skewer' || key === 'x-ray-attack') return 'alignment-and-double-attacks';
  if (key === 'deflection' || key === 'attraction' || key === 'interference' || key === 'clearance' || key === 'removal-of-defender') return 'deflection-and-line-control';
  if (key === 'discovered-attack' || key === 'double-check' || key === 'forcing-check-sequence') return 'forcing-attacks';
  if (key === 'hanging-piece' || key === 'trapped-piece') return 'piece-winning-tactics';
  if (key === 'zwischenzug' || key === 'quiet-move' || key === 'combination') return 'calculation-and-tempo';
  if (key === 'king-attack') return 'king-safety';
  if (key === 'opening-tactic') return 'opening-themes';
  if (key === 'endgame-squeeze' || key === 'zugzwang') return 'endgame-technique';
  if (key === 'tactical-idea') return 'general-tactics';

  return 'general-tactics';
}

function deriveTags(pageName, analysis, tactic) {
  const tags = new Set();
  const normalizedTactic = normalizeTag(tactic);
  const family = inferTacticFamily(tactic);
  const category = normalizeTag(String(pageName || '').replace('/all', ''));

  const add = (...values) => {
    values.forEach((value) => {
      const normalized = normalizeTag(value);
      if (normalized) tags.add(normalized);
    });
  };

  const categoryIncludes = (part) => category.includes(normalizeTag(part));

  const pageTagAliases = {
    'bodens-mate': ['boden-mate'],
    'double-bishop-mate': ['bishop-pair'],
    'capturing-defender': ['removal-of-defender'],
    'under-promotion': ['underpromotion'],
    'advanced-pawn': ['passed-pawn'],
    'queen-side-attack': ['line-opening', 'attacker', 'threat'],
    'king-side-attack': ['line-opening', 'attacker', 'threat'],
    'defensive-move': ['prophylaxis'],
    'quiet-move': ['quiet-move', 'prophylaxis'],
    intermezzo: ['zwischenzug'],
    'pawn-endgame': ['king-and-pawn-endgame', 'opposition', 'king-walk', 'passed-pawn'],
    'queen-endgame': ['queen-endgame', 'perpetual-check'],
    'queen-rook-endgame': ['rook-endgame', 'queen-endgame'],
    'bishop-endgame': ['minor-piece-endgame'],
    'knight-endgame': ['minor-piece-endgame'],
    'indian-defense': ['fianchetto'],
    'pirc-defense': ['fianchetto'],
    'modern-defense': ['fianchetto'],
    'promotion': ['connected-passed-pawns'],
    'queen-rook-endgame': ['rook-endgame', 'queen-endgame', 'lucena-position', 'philidor-position'],
    'pawn-endgame': ['king-and-pawn-endgame', 'opposition', 'king-walk', 'passed-pawn', 'outside-passed-pawn', 'connected-passed-pawns']
  };

  add(normalizedTactic, family);

  if (category) {
    add(category);
    add(...(pageTagAliases[category] || []));
  }

  if (categoryIncludes('opening') || categoryIncludes('defense') || categoryIncludes('gambit') || categoryIncludes('game') || categoryIncludes('system')) {
    add('development', 'center-control', 'center', 'castling', 'piece-activity', 'coordination', 'initiative', 'space-advantage');
  }

  if (categoryIncludes('mate') || analysis.hasMate) {
    add('checkmate', 'escape-square', 'king-safety');
  }

  if (categoryIncludes('endgame') || categoryIncludes('equality')) {
    add('king-walk', 'tempo', 'piece-activity');
  }

  if (categoryIncludes('exposed-king') || categoryIncludes('attack') || categoryIncludes('crushing') || categoryIncludes('advantage')) {
    add('attacker', 'threat', 'king-safety', 'line-opening');
  }

  if (categoryIncludes('pin') || categoryIncludes('skewer') || categoryIncludes('x-ray') || categoryIncludes('clearance') || categoryIncludes('interference')) {
    add('line', 'line-opening', 'file', 'diagonal');
  }

  if (categoryIncludes('promotion') || categoryIncludes('advanced-pawn') || categoryIncludes('pawn-endgame')) {
    add('passed-pawn', 'pawn-structure', 'connected-passed-pawns');
  }

  if (categoryIncludes('endgame')) {
    add('stalemate', 'fortress', 'triangulation');
  }

  if (categoryIncludes('bishop') || categoryIncludes('boden')) {
    add('long-diagonal');
  }

  if (categoryIncludes('middle-game') || categoryIncludes('opening')) {
    add('semi-open-file', 'outpost', 'weak-square');
  }

  if (categoryIncludes('attack') || categoryIncludes('double-check')) {
    add('battery', 'rook-lift');
  }

  if (categoryIncludes('middle-game')) {
    add('piece-activity', 'coordination', 'initiative', 'center-control');
  }

  if (categoryIncludes('castling')) {
    add('castling', 'king-safety');
  }

  if (normalizedTactic === 'discovered-attack' && analysis.hasCheck) {
    add('discovered-check');
  }

  if (normalizedTactic === 'sacrifice') {
    add('exchange-sacrifice');
  }

  if (normalizedTactic === 'removal-of-defender') {
    add('overloading');
  }

  if (normalizedTactic === 'fork' || normalizedTactic === 'pin' || normalizedTactic === 'skewer') {
    add('attacker', 'defender');
  }

  if (analysis.hasMate) add('mate', 'checkmate');
  if (analysis.hasCheck) add('check');
  if (analysis.hasCapture) add('capture', 'defender');
  if (analysis.hasPromotion) add('promotion', 'passed-pawn');
  if (analysis.moveCount <= 2) add('short-combo');
  if (analysis.moveCount >= 5) add('long-combo', 'combination');

  return Array.from(tags);
}

function getCategoryPuzzleMap(categoryData) {
  if (
    categoryData &&
    typeof categoryData === 'object' &&
    !Array.isArray(categoryData) &&
    categoryData.puzzles &&
    typeof categoryData.puzzles === 'object' &&
    !Array.isArray(categoryData.puzzles)
  ) {
    return categoryData.puzzles;
  }

  if (categoryData && typeof categoryData === 'object' && !Array.isArray(categoryData)) {
    const { type: _ignoredType, ...legacyPuzzleMap } = categoryData;
    return legacyPuzzleMap;
  }

  return {};
}

function getCategoryType(categoryData) {
  if (
    categoryData &&
    typeof categoryData === 'object' &&
    !Array.isArray(categoryData) &&
    typeof categoryData.type === 'string' &&
    categoryData.type.trim()
  ) {
    return categoryData.type.trim();
  }

  return 'Misc';
}

function getPuzzleAnswer(puzzleValue) {
  if (typeof puzzleValue === 'string') {
    return puzzleValue;
  }

  if (
    puzzleValue &&
    typeof puzzleValue === 'object' &&
    !Array.isArray(puzzleValue) &&
    typeof puzzleValue.answer === 'string'
  ) {
    return puzzleValue.answer;
  }

  return '';
}

(async () => {
  const inputPath = process.argv[2] || path.join('game', 'public', 'puzzles.json');
  const outputPath = process.argv[3] || inputPath;

  console.log(`Reading ${inputPath}...`);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: ${inputPath} not found`);
    process.exit(1);
  }

  const puzzles = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const puzzlesWithHints = {};
  let totalHinted = 0;

  for (const pageName of Object.keys(puzzles)) {
    const categoryData = puzzles[pageName];
    const pageType = getCategoryType(categoryData);
    const pageData = getCategoryPuzzleMap(categoryData);
    const pageWithHints = {};

    for (const lichessUrl of Object.keys(pageData)) {
      const existingPuzzle = (
        pageData[lichessUrl] &&
        typeof pageData[lichessUrl] === 'object' &&
        !Array.isArray(pageData[lichessUrl])
      )
        ? pageData[lichessUrl]
        : {};
      const answer = getPuzzleAnswer(pageData[lichessUrl]);
      const analysis = analyzeSequence(answer);
      const tactic = inferTactic(pageName, analysis);
      const tags = Array.isArray(existingPuzzle.tags)
        ? existingPuzzle.tags
        : deriveTags(pageName, analysis, tactic);
      const hints = Array.isArray(existingPuzzle.hints)
        ? existingPuzzle.hints
        : generateHints(pageName, lichessUrl, answer);
      const moveHints = generateMoveHints(pageName, lichessUrl, answer);

      pageWithHints[lichessUrl] = {
        ...existingPuzzle,
        answer,
        tags,
        hints,
        moveHints
      };

      totalHinted += 1;
    }

    puzzlesWithHints[pageName] = {
      type: pageType,
      puzzles: pageWithHints
    };
  }

  fs.writeFileSync(outputPath, JSON.stringify(puzzlesWithHints, null, 2));
  const outputFile = outputPath;

  console.log(`Generated hints for ${totalHinted} puzzles`);
  console.log(`Saved to ${outputFile}`);
})();
