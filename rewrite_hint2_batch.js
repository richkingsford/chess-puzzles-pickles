#!/usr/bin/env node
'use strict';
/**
 * rewrite_hint2_batch.js
 *
 * Rewrites the first BATCH_SIZE failing hint 2s. Sentence 1 restates the
 * category principle ~30% more directly than hint 1. Sentence 2 highlights
 * the opportunity (what can be done) like a chessmaster nudging an 8-year-old.
 *
 * Usage: node rewrite_hint2_batch.js
 */

const fs   = require('fs');
const path = require('path');
const { Chess } = require('./game/node_modules/chess.js');

const DATASET_PATH = path.resolve(__dirname, 'game', 'public', 'puzzles.json');
const BATCH_SIZE   = 50;
const FILES        = 'abcdefgh';
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };

// ── board helpers ─────────────────────────────────────────────────────────────

function parseFen(url) {
  const m = 'lichess.org/analysis/';
  const i = String(url || '').indexOf(m);
  if (i === -1) return null;
  let f = url.slice(i + m.length).split('?')[0];
  if (f.startsWith('standard/')) f = f.slice(9);
  return decodeURIComponent(f).replace(/_/g, ' ').trim();
}

function splitMoves(a) {
  return String(a || '').split(',').map(s => s.trim()).filter(Boolean);
}

function oppositeColor(c) { return c === 'w' ? 'b' : 'w'; }
function pieceValue(code) { return PIECE_VALUES[String(code || '').toLowerCase()] || 1; }

function sqParts(sq) {
  return { fi: FILES.indexOf(String(sq || '')[0]), rank: Number(String(sq || '')[1]) };
}

function toSq(fi, rank) {
  if (fi < 0 || fi >= 8 || rank < 1 || rank > 8) return null;
  return `${FILES[fi]}${rank}`;
}

function findKingSq(game, color) {
  for (const row of game.board())
    for (const p of row)
      if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

function kingProfile(game, move) {
  const ec = oppositeColor(move.color);
  const ksq = findKingSq(game, ec);
  if (!ksq) return { blockedSides: [], safeCount: 0, kingSquare: null };
  const { fi, rank } = sqParts(ksq);
  const dirs = [
    { dx: -1, dy: -1, s: 'left' }, { dx: -1, dy: 0, s: 'left' }, { dx: -1, dy: 1, s: 'left' },
    { dx:  1, dy: -1, s: 'right' }, { dx:  1, dy: 0, s: 'right' }, { dx:  1, dy: 1, s: 'right' },
    { dx: 0, dy: ec === 'w' ?  1 : -1, s: 'forward' },
    { dx: 0, dy: ec === 'w' ? -1 :  1, s: 'back' },
  ];
  const tot = { left: 0, right: 0, forward: 0, back: 0 };
  const saf = { left: 0, right: 0, forward: 0, back: 0 };
  let safe = 0;
  dirs.forEach(({ dx, dy, s }) => {
    const sq = toSq(fi + dx, rank + dy);
    if (!sq) return;
    tot[s]++;
    const occ = game.get(sq);
    if (occ && occ.color === ec) return;
    if (game.isAttacked(sq, move.color)) return;
    saf[s]++; safe++;
  });
  const blocked = Object.keys(tot).filter(k => tot[k] > 0 && saf[k] === 0);
  return { blockedSides: blocked, safeCount: safe, kingSquare: ksq };
}

function defCount(game, move) {
  const ec = oppositeColor(move.color);
  const sq = move.flags?.includes('e')
    ? `${String(move.to)[0]}${String(move.from)[1]}`
    : move.to;
  return game.attackers(sq, ec).length;
}

function area(sq) {
  if (!sq) return 'the board';
  const { fi, rank } = sqParts(sq);
  const flank = fi <= 2 ? 'the left side' : fi >= 5 ? 'the right side' : 'the center';
  const band  = (rank <= 2 || rank >= 7) ? 'back row' : (rank <= 3 || rank >= 6) ? 'outer area' : 'middle';
  if (flank === 'the center' && band === 'back row') return 'the center back row';
  if (band === 'back row') return `${flank} back row`;
  if (band === 'middle') return `${flank} of the board`;
  return flank;
}

function kingArea(sq) {
  if (!sq) return 'the board';
  const { fi, rank } = sqParts(sq);
  const isBack = rank <= 2 || rank >= 7;
  if (isBack) {
    if (fi === 7) return 'the far right corner of the back row';
    if (fi === 0) return 'the far left corner of the back row';
    if (fi === 6) return 'the right side of the back row';
    if (fi === 1) return 'the left side of the back row';
    if (fi === 5) return 'just right of center on the back row';
    if (fi === 2) return 'just left of center on the back row';
    return 'the center of the back row';
  }
  return area(sq);
}

// ── deterministic seed / picker ───────────────────────────────────────────────

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick(arr, seed, variant = 0) {
  return arr[Math.abs((seed + variant) % arr.length)];
}

// ── Hint 2 principles — restatement ~30% more direct than hint 1 ──────────────

const PRINCIPLES2 = {
  'arabian-mate':       'An Arabian mate wins because a rook and knight together shut down a king cornered with no escape at all.',
  'bodens-mate':        "Boden's mate wins because two bishops crossing diagonals can cage a king with nowhere left to hide.",
  'anastasia-mate':     'An Anastasia mate wins because a rook and knight together pin the king against the side of the board and deliver checkmate.',
  'double-bishop-mate': 'A double-bishop mate wins because two bishops sealing both diagonals leave the king with no escape at all.',
  'dovetail-mate':      'A dovetail mate wins because the king is squeezed between its own pieces and cannot escape to either diagonal.',
  'hook-mate':          'A hook mate wins because a rook, knight, and pawn together seal every corner and deliver checkmate to a trapped king.',
  'smothered-mate':     'A smothered mate wins because the king is so buried by its own pieces that a knight can deliver checkmate with nowhere to run.',
  'back-rank-mate':     'A back-rank mate delivers checkmate because the king is locked on the home row with all exits sealed by friendly pieces.',
  'fork':               'A fork wins material because one move threatens two enemy pieces at the same time and only one of them can be saved.',
  'pin':                'A pin wins material because the pinned piece cannot safely move — something even more valuable is lined up right behind it.',
  'skewer':             'A skewer wins material because the front piece must move to safety, leaving the piece hiding behind it free to be captured.',
  'discovered-attack':  'A discovered attack wins because moving one piece reveals a much stronger attack from behind — two threats appear at once.',
  'deflection':         'A deflection wins because it forces a key defender to leave its post, and the target it was guarding becomes free.',
  'hanging-piece':      'A hanging piece is a free gift — it has no defender, so it can simply be captured for nothing in return.',
  'trapped-piece':      'A trapped piece cannot escape — it has no safe square to move to and can be captured in just a few moves.',
  'attraction':         'An attraction trick wins because it forces the enemy king onto a square where it walks into a deadly trap.',
  'clearance':          'A clearance move wins because getting one piece out of the way opens the path for a stronger piece to deliver a decisive blow.',
  'interference':       'An interference move wins because it cuts the link between two defending pieces so they can no longer protect each other.',
  'intermezzo':         'An intermezzo wins because the surprise in-between move creates a threat so urgent the enemy must deal with it first.',
  'double-check':       'A double check wins because the king is attacked by two pieces at once — it cannot block both, so it must run.',
  'x-ray-attack':       'An x-ray attack wins because it works right through an enemy piece to threaten something even more valuable hiding behind it.',
  'capturing-defender': 'Capturing the defender wins because once the protecting piece is gone, the target it was guarding can be taken for free.',
  'sacrifice':          'A sacrifice wins because what is given up is worth far less than what comes back — the material lost leads to a bigger gain.',
  'under-promotion':    'An under-promotion wins because promoting to a knight, rook, or bishop instead of a queen creates a trick the enemy cannot stop.',
  'en-passant':         'En passant captures the enemy pawn immediately after it moves two squares — the window to take it only lasts one move.',
  'castling':           'Castling at the right moment moves the king to safety and brings a powerful rook straight into the action.',
  'zugzwang':           'Zugzwang wins because the enemy must move and every option they have makes their position worse — they are stuck.',
  'advanced-pawn':      'An advanced pawn is dangerous because the enemy must use pieces to stop it, and if they fail it becomes a queen.',
  'promotion':          'Getting a pawn to the back row is a winning idea because the moment it promotes it becomes a queen — a huge jump in power.',
  'french-defense':     'The French Defense can backfire when cramped pieces leave a weakness that well-placed active play can strike immediately.',
  'ruy-lopez':          'The Ruy Lopez works because long-term pressure on defending pieces eventually creates a weakness that can be won.',
  'sicilian-defense':   'The Sicilian Defense creates tactical fights where the sharp imbalances can lead to a decisive blow for the better-prepared side.',
  'caro-kann-defense':  'The Caro-Kann Defense can be cracked when active piece play finds a weakness in the solid-looking structure.',
  'italian-game':       'The Italian Game works by aiming pieces at the enemy king corner early, creating attacking chances that are hard to stop.',
  'queens-gambit-declined': "The Queen's Gambit creates strong piece activity and central pressure that can be turned into a winning tactical shot.",
  'philidor-defense':   'The Philidor Defense often leaves pieces too passive, and active play can quickly turn that cramped position into an advantage.',
  'four-knights-defense': 'The Four Knights Defense creates active piece positions where a well-timed tactical strike can win material.',
  'kings-gambit-accepted': "The King's Gambit earns an attack by giving up a pawn — those open lines and lead in development can deliver a decisive blow.",
  'damiano-defense':    "The Damiano Defense's risky choices leave clear weaknesses that sharp play can quickly turn into a winning attack.",
  'vienna-game':        'The Vienna Game builds a strong center and then launches an attack that benefits from that central control.',
  'pawn-endgame':       'In a pawn endgame every tempo matters — the side that promotes first almost always wins the game.',
  'queen-endgame':      'In a queen endgame one accurate queen move can create a decisive threat because the queen controls so much of the board.',
  'knight-endgame':     "In a knight endgame the knight's surprising jumps can outmaneuver a king and decide the game in just a few moves.",
  'english-opening':    'The English Opening builds flexible control that can turn into a powerful tactical strike when the right moment arrives.',
  'scandinavian-defense': 'The Scandinavian Defense creates open play where actively developed pieces can seize a decisive tactical opportunity.',
  'scotch-game':        'The Scotch Game creates open and active positions early — the side with the better piece activity can win material fast.',
  'modern-defense':     'The Modern Defense waits for the big center to be built and then strikes at it — that counterattack can create a winning shot.',
  'pirc-defense':       'The Pirc Defense builds up counterplay patiently and then launches a decisive tactical blow at just the right moment.',
  'rapport-jobava-system': 'The Rapport-Jobava System develops pieces very fast and uses that early activity to create attacks that are hard to stop.',
  'queen-rook-endgame': 'In a queen and rook endgame the two most powerful pieces combine their force to create threats that are nearly impossible to defend.',
};

// ── opportunity clues: what can be DONE ──────────────────────────────────────

function kingOpportunityClues(profile) {
  const a = kingArea(profile.kingSquare);
  const n = profile.safeCount;
  const side = profile.blockedSides.find(s => s === 'right' || s === 'left') || profile.blockedSides[0];

  if (side === 'right') return [
    `Look for an open line into ${a} — the king there has the right side completely sealed with no escape.`,
    `The king on ${a} has the right side completely sealed — an open line in delivers checkmate.`,
    `Look for a checkmate window on ${a} — the right-side exits are all closed and the king cannot run.`,
    `There is a king on ${a} with the right escape completely cut off — aim a piece there to deliver checkmate.`,
    `Look for a mating strike aimed at ${a} where the king has nowhere to flee to the right.`,
    `The king on ${a} cannot escape right — point an open line at it and deliver checkmate.`,
    `Look for an open file or diagonal pointing at the king on ${a} — the right side is completely blocked.`,
    `A checkmate window is open on ${a} — the king there cannot run right and is sitting in a mating net.`,
    `Look for a straight line into ${a} — the king there cannot escape right and a checkmate is close.`,
    `The right-side escape is sealed for the king on ${a} — an open attacking line lands checkmate.`,
    `Look for a decisive strike into ${a} — the king's right-side escape is completely cut off.`,
    `Notice the king on ${a} with no right-side escape — find the open line that delivers checkmate.`,
  ];
  if (side === 'left') return [
    `Look for an open line into ${a} — the king there has the left side completely sealed with no escape.`,
    `The king on ${a} has the left side completely sealed — an open line in delivers checkmate.`,
    `Look for a checkmate window on ${a} — the left-side exits are all closed and the king cannot run.`,
    `There is a king on ${a} with the left escape completely cut off — aim a piece there to deliver checkmate.`,
    `Look for a mating strike aimed at ${a} where the king has nowhere to flee to the left.`,
    `The king on ${a} cannot escape left — point an open line at it and deliver checkmate.`,
    `Look for an open file or diagonal pointing at the king on ${a} — the left side is completely blocked.`,
    `A checkmate window is open on ${a} — the king there cannot run left and is sitting in a mating net.`,
    `Look for a straight line into ${a} — the king there cannot escape left and a checkmate is close.`,
    `The left-side escape is sealed for the king on ${a} — an open attacking line lands checkmate.`,
    `Look for a decisive strike into ${a} — the king's left-side escape is completely cut off.`,
    `Notice the king on ${a} with no left-side escape — find the open line that delivers checkmate.`,
  ];
  if (side === 'forward') return [
    `Look for an open line into ${a} — the king there cannot move forward and a checkmate can be played.`,
    `Look for a mating strike on ${a} — the forward escape is sealed and the king has nowhere to advance.`,
    `Look for a back-rank attack on ${a} — the king cannot step forward and a decisive blow is available.`,
    `Look for a checkmate window on ${a} where the forward path is completely blocked.`,
    `Look for an opportunity to deliver checkmate to the king on ${a} — the forward exits are all covered.`,
    `Look for a decisive blow aimed at ${a} — the king cannot advance and has no forward escape.`,
    `Look for a mating line that reaches the king on ${a} — the forward path is sealed shut.`,
    `Look for an open file or diagonal pointing at ${a} — the king there cannot move forward.`,
    `Look for a checkmate on ${a} — the forward squares are all covered and the king is stuck.`,
    `Look for a decisive strike into ${a} where the king has the forward escape completely sealed.`,
    `Look for a back-rank mating chance on ${a} — the king cannot step forward to escape.`,
    `Look for an opportunity to land a checkmate on ${a} — the forward path is gone.`,
  ];
  if (side === 'back') return [
    `Look for a mating attack on ${a} from the front — the king cannot retreat and is stuck.`,
    `Look for a checkmate window on ${a} — the backward escape is sealed and the king cannot fall back.`,
    `Look for a decisive blow from the front — the king on ${a} cannot retreat to safety.`,
    `Look for a mating line aimed at ${a} where the king's backward escape is completely cut off.`,
    `Look for an open line approaching ${a} from the front — the king cannot go back.`,
    `Look for a checkmate on ${a} — the rear exits are sealed and the king is pinned forward.`,
    `Look for a front-side mating blow on ${a} — the king has no backward escape available.`,
    `Look for a decisive attack on ${a} — the king is locked forward with the retreat sealed off.`,
    `Look for a mating opportunity from the front side — the king on ${a} cannot fall back.`,
    `Look for an open attacking line toward ${a} — the king's retreat is completely blocked.`,
    `Look for a checkmate window on ${a} where the king cannot escape backward.`,
    `Look for a decisive front-side strike — the king on ${a} has the retreat sealed tight.`,
  ];
  const safeWord = n === 0 ? 'no safe squares at all' : n === 1 ? 'only one safe square' : `only ${n} safe squares`;
  return [
    `Look for a checkmate window — the king on ${a} has ${safeWord} and cannot escape.`,
    `Look for a mating blow aimed at the king on ${a} — it has ${safeWord} to run to.`,
    `Look for an opportunity to deliver checkmate to the king on ${a} — it has ${safeWord}.`,
    `Look for a decisive attack on ${a} — the king is nearly surrounded with ${safeWord} left.`,
    `Look for a mating strike aimed at the nearly-trapped king on ${a} — it has ${safeWord}.`,
    `Look for a checkmate opportunity on ${a} — the king has ${safeWord} remaining.`,
    `Look for a decisive blow aimed at the king on ${a} — it is nearly out of room with ${safeWord}.`,
    `Look for a mating line that ends at ${a} — the king there has ${safeWord} to flee to.`,
  ];
}

function materialOpportunityClues(move, game) {
  const defenders = defCount(game, move);
  const pts = pieceValue(move.captured);
  const ec = oppositeColor(move.color);
  const kingA = area(findKingSq(game, ec));
  const targetA = area(move.to);
  const kSq = findKingSq(game, ec);
  const nearKing = kSq &&
    Math.abs(sqParts(move.to).fi - sqParts(kSq).fi) <= 2 &&
    Math.abs(sqParts(move.to).rank - sqParts(kSq).rank) <= 2;

  if (nearKing) {
    if (defenders === 0) return [
      `Look for the free ${pts}-point piece sitting right next to the enemy king on ${kingA} — it has no defender.`,
      `There is an unguarded ${pts}-point piece next to the enemy king on ${kingA} — take it for free.`,
      `The ${pts}-pointer next to the enemy king on ${kingA} has zero protection — step in and win it.`,
      `An undefended ${pts}-point piece sits beside the enemy king on ${kingA} — nobody is guarding it.`,
    ];
    return [
      `Look for the ${pts}-point piece near the enemy king on ${kingA} — it has only ${defenders === 1 ? 'one guard' : `${defenders} guards`} and can be overcome.`,
      `The ${pts}-pointer near the enemy king on ${kingA} is lightly protected — its ${defenders === 1 ? 'single defender' : `${defenders} defenders`} can be overcome.`,
      `Look for an opportunity to win the lightly-guarded ${pts}-point piece next to the enemy king on ${kingA}.`,
      `A ${pts}-point piece near the enemy king on ${kingA} has thin protection — challenge its ${defenders === 1 ? 'guard' : 'defenders'} and win it.`,
    ];
  }
  if (defenders === 0) return [
    `Look for the free ${pts}-point piece on ${targetA} — it has no defender and can be taken immediately.`,
    `There is a ${pts}-point piece on ${targetA} with no one protecting it — a completely free capture.`,
    `The ${pts}-pointer on ${targetA} is sitting unguarded — take it immediately for free.`,
    `An undefended ${pts}-point piece on ${targetA} has zero guards — it can simply be captured.`,
  ];
  if (defenders === 1) return [
    `Look for the ${pts}-point piece on ${targetA} and a way to challenge its only guard.`,
    `The ${pts}-pointer on ${targetA} has just one defender — remove or distract it and win the target.`,
    `Look for a way to remove the single defender of the ${pts}-pointer on ${targetA}.`,
    `One guard protects the ${pts}-point piece on ${targetA} — deal with that guard and win the target.`,
  ];
  return [
    `Look for the ${pts}-point piece on ${targetA} and a way to put pressure on all ${defenders} of its defenders.`,
    `The ${pts}-pointer on ${targetA} has ${defenders} defenders — but they can all be put under pressure at once.`,
    `Look for an opportunity to overload the ${defenders} defenders protecting the ${pts}-pointer on ${targetA}.`,
    `${defenders} pieces guard the ${pts}-pointer on ${targetA} — create a position where they are all overloaded.`,
  ];
}

function tacticOpportunityClues(category, move, game) {
  if (!move || !game) return [
    'Right now the key action is in the center of the board.',
    'That opportunity is on the left side of the board.',
    'In this position the right side holds the winning chance.',
    'Right now a chance to strike near the back row is available.',
  ];
  const targetA = area(move.to);
  const ec = oppositeColor(move.color);
  const kingA = area(findKingSq(game, ec));
  const capturedPts = move?.captured ? pieceValue(move.captured) : null;
  const capturedStr = capturedPts ? `a ${capturedPts}-point piece` : 'an enemy piece';

  const sets = {
    'fork': [
      `Look for a fork square near ${targetA} where one move attacks both enemy targets at the same time.`,
      `There is a fork square near ${targetA} — one move from there hits two enemy pieces at once.`,
      `Look for a square on ${targetA} from which one piece can threaten two enemy pieces at once.`,
      `A double-attack is available near ${targetA} — one move hits both targets and only one can be saved.`,
      `Look for a fork window near ${targetA} — a single square that puts both enemy pieces under attack.`,
      `Notice two enemy pieces near ${targetA} — one move can attack them both at the same time.`,
      `Look for a double-attack window near ${targetA} — two enemy pieces that can both be hit in one move.`,
      `One jumping move near ${targetA} hits two enemy targets simultaneously — only one can escape.`,
    ],
    'pin': [
      `Look for an opportunity to add pressure to the pinned piece on ${targetA} — it cannot safely move away.`,
      `Look for a way to attack the frozen piece on ${targetA} that is stuck because of what is behind it.`,
      `Look for an open line into ${targetA} that lets a piece pile pressure on the one that cannot escape.`,
      `Look for a move that attacks the pinned piece on ${targetA} — the pin means it cannot run.`,
      `Look for a chance to exploit the pin on ${targetA} by hitting the piece that is locked in place.`,
      `Look for a way to take advantage of the stuck piece on ${targetA} — it cannot safely step away.`,
    ],
    'skewer': [
      `Look for an open diagonal, file, or rank through ${targetA} that hits the front piece and wins the one behind it.`,
      `Look for a straight line through ${targetA} — attack the front piece and collect what is hiding behind it.`,
      `Look for a skewer line on ${targetA} where one attack hits the front piece and reaches the more valuable one behind.`,
      `Look for a long attacking line through ${targetA} that forces the front piece to move and wins what is behind.`,
      `Look for an open file or diagonal through ${targetA} that threatens both pieces on the same line.`,
      `Look for a chance to hit the front piece on ${targetA} and win the more valuable piece hiding right behind it.`,
    ],
    'discovered-attack': [
      `Look for a piece on ${targetA} that can be moved to reveal a powerful hidden attack from behind.`,
      `Look for a chance to move the piece on ${targetA} and uncover a much stronger attacker sitting behind it.`,
      `Look for a move that slides a piece away from ${targetA} and reveals a devastating attack from behind.`,
      `Look for an opportunity to step a piece away from ${targetA} and unleash the hidden attacker behind it.`,
      `Look for a piece on ${targetA} whose move will simultaneously create two threats at once.`,
      `Look for a move from ${targetA} that reveals a hidden attacking line and adds a second threat at the same time.`,
    ],
    'deflection': [
      `Look for a move that forces the overloaded defender near ${targetA} away from its post.`,
      `Look for a chance to chase the key defender near ${targetA} off its square and win what it was guarding.`,
      `Look for an opportunity to distract the defender near ${targetA} — it is doing two jobs and cannot do both.`,
      `Look for a forcing move that pulls the defender away from ${targetA} and leaves the target behind unguarded.`,
      `Look for a way to threaten the defender near ${targetA} so it must move and leave the real target exposed.`,
      `Look for the overloaded defender near ${targetA} that can be forced to abandon the target it is protecting.`,
    ],
    'attraction': [
      `Look for a move that lures the enemy king near ${targetA} onto a square where it can be trapped or forked.`,
      `Look for a chance to bait the enemy king near ${targetA} onto a dangerous square.`,
      `Look for an opportunity to attract the enemy king near ${targetA} forward — and then punish it.`,
      `Look for a sacrifice or forcing move that pulls the enemy king near ${targetA} onto bad ground.`,
      `Look for a way to lure the enemy king near ${targetA} to a square where it walks into a winning trap.`,
      `Look for a move that tempts the enemy king near ${targetA} to step forward and into danger.`,
    ],
    'clearance': [
      `Look for a piece on ${targetA} that can be moved away to open the path for a stronger piece behind it.`,
      `Look for a chance to clear ${targetA} — get one piece out of the way and a much stronger one delivers the blow.`,
      `Look for a move that clears the blocking piece on ${targetA} and opens a decisive line behind it.`,
      `Look for a piece on ${targetA} that is in the way of a stronger attacker — move it and the line opens.`,
      `Look for the clearance opportunity on ${targetA} — one piece steps aside and a winning attack follows.`,
      `Look for a way to vacate ${targetA} and let a stronger piece deliver the decisive blow.`,
    ],
    'interference': [
      `Look for a square between the two defenders near ${targetA} where one move cuts their connection.`,
      `Look for a chance to place a piece between the two defenders near ${targetA} and break their link.`,
      `Look for a move to ${targetA} that blocks the connection between two defending pieces and leaves the target exposed.`,
      `Look for an interposing move near ${targetA} that severs the link between the two defenders.`,
      `Look for a square near ${targetA} where a piece can be placed to disconnect two enemy defenders.`,
      `Look for an opportunity to cut the line between the two defenders near ${targetA} and leave the target free.`,
    ],
    'intermezzo': [
      `Look for a surprise forcing move near ${targetA} that demands an answer before anything else.`,
      `Look for an in-between move near ${targetA} that creates an urgent threat the opponent cannot ignore.`,
      `Look for a forcing shot near ${targetA} that must be dealt with immediately — before the opponent's plan continues.`,
      `Look for a surprising move near ${targetA} that creates a threat so strong it interrupts everything else.`,
      `Look for a zwischenzug near ${targetA} — a move that must be answered before anything else happens.`,
      `Look for a sudden forcing move near ${targetA} that changes what the opponent must do right now.`,
    ],
    'double-check': [
      `Look for a move near ${targetA} that delivers two checks at once to the enemy king on ${kingA}.`,
      `Look for a double-check opportunity near ${targetA} — a move that checks with two pieces simultaneously.`,
      `Look for a move from ${targetA} that delivers two simultaneous checks — the enemy king on ${kingA} must run.`,
      `Look for a chance to give a double check from ${targetA} to the enemy king on ${kingA} — it cannot block both.`,
      `Look for a jumping move near ${targetA} that gives two checks at once to the enemy king on ${kingA}.`,
      `Look for a move that delivers a double check — two pieces checking the enemy king on ${kingA} at the same time.`,
      `Look for a double-check from ${targetA} — two checks at once that force the enemy king on ${kingA} to flee.`,
      `Look for a move near ${targetA} that creates two simultaneous checks on the enemy king on ${kingA}.`,
      `Look for a chance to deliver two checks at once from near ${targetA} to the enemy king on ${kingA}.`,
      `Look for a double-checking move through ${targetA} — the enemy king on ${kingA} cannot block two attackers.`,
      `Look for a move from ${targetA} that gives a double check the enemy king on ${kingA} cannot escape.`,
      `Look for a two-check combination from ${targetA} that forces the enemy king on ${kingA} into the open.`,
    ],
    'x-ray-attack': [
      `Look for an open line through ${targetA} that reaches through one enemy piece to threaten something more valuable behind it.`,
      `Look for an x-ray line on ${targetA} — a straight line that hits the front piece and threatens the one behind it.`,
      `Look for a long diagonal or open file through ${targetA} that x-rays through one piece to threaten another.`,
      `Look for a line through ${targetA} where one attack goes through an enemy piece to hit something even more valuable behind.`,
      `Look for an x-ray opportunity — an open line through ${targetA} that creates two threats on the same diagonal or file.`,
      `Look for an attacking line through ${targetA} that works through one enemy piece to win the more valuable one hiding behind.`,
      `Look for an x-ray line from ${targetA} that goes through one piece all the way to the enemy king on ${kingA}.`,
      `Look for a long straight line from ${targetA} that x-rays through a piece to threaten the enemy king on ${kingA}.`,
      `Look for an open file or diagonal from ${targetA} that creates an x-ray threat reaching the enemy king on ${kingA}.`,
      `Look for an x-ray from ${targetA} — a line that attacks one piece and threatens the enemy king on ${kingA} behind it.`,
      `Look for a line through ${targetA} that simultaneously attacks a piece and x-rays to threaten the enemy king on ${kingA}.`,
      `Look for an x-ray line from ${targetA} that creates a double threat along the same line as the enemy king on ${kingA}.`,
    ],
    'capturing-defender': [
      `Look for the single defender on ${targetA} that is the only thing keeping a key target safe — and capture it.`,
      `Look for a chance to take the sole defender on ${targetA} and leave the target it was guarding completely free.`,
      `Look for the piece on ${targetA} that is carrying the entire defense — remove it and the real prize is free.`,
      `Look for an opportunity to capture the defending piece on ${targetA} and win the target behind it.`,
      `Look for the one defender on ${targetA} — take it away and a much more valuable target becomes free.`,
      `Look for a chance to remove the key defender on ${targetA} and capture the target it was protecting.`,
    ],
    'sacrifice': [
      `Look for an opportunity to give up material on ${targetA} and gain something much more valuable in return.`,
      `Look for a sacrificial move on ${targetA} — giving up something small to break open the position and gain much more.`,
      `Look for a chance to offer material on ${targetA} and win something far bigger in return.`,
      `Look for a sacrifice on ${targetA} that breaks through the defense and creates an unstoppable advantage.`,
      `Look for an opportunity to give up material near ${targetA} — the return will be worth much more.`,
      `Look for a bold sacrifice on ${targetA} that gives up something small and gains something decisive in return.`,
    ],
    'trapped-piece': [
      `Look for a way to cut off all the escape squares of the trapped piece on ${targetA}.`,
      `Look for the piece on ${targetA} that is running out of safe squares — and chase it down.`,
      `Look for an opportunity to box in the piece on ${targetA} so it has nowhere safe to go.`,
      `Look for a move that closes the last escape route for the trapped piece on ${targetA}.`,
      `Look for the piece on ${targetA} that has no safe square — and find the move that wins it.`,
      `Look for a chance to surround the piece on ${targetA} and leave it with no way out.`,
    ],
    'hanging-piece': [
      `Look for the completely undefended piece on ${targetA} — it can simply be captured for free.`,
      `There is a ${capturedStr} on ${targetA} with zero defenders — take it for free right now.`,
      `Look for a free capture on ${targetA} — a piece with no defender at all just sitting there.`,
      `The ${capturedStr} on ${targetA} has no protection — nobody is guarding it and it can be taken.`,
      `Look for an unguarded piece on ${targetA} that can be captured immediately with no cost.`,
      `An undefended piece on ${targetA} is free for the taking — zero protection, zero cost.`,
    ],
    'castling': [
      `Look for a direct attack on the king on ${targetA} — it never castled and is completely exposed.`,
      `Look for an opportunity to attack the uncastled king on ${targetA} that has no safe shelter.`,
      `Look for a way to strike the exposed king on ${targetA} — it skipped castling and is wide open.`,
      `Look for a line of attack aimed at the king on ${targetA} that never found safety.`,
      `Look for a direct attacking chance against the king on ${targetA} — no castling means no shelter.`,
      `Look for an aggressive move that targets the exposed king on ${targetA} sitting in the open.`,
    ],
    'zugzwang': [
      `Look for a move that puts the enemy in a position where every reply makes their situation worse.`,
      `Look for a waiting move that forces the enemy near ${targetA} to make a losing move.`,
      `Look for a move that creates a zugzwang — any enemy response near ${targetA} gives something away.`,
      `Look for a way to pass the move to the enemy near ${targetA} and force them into a losing reply.`,
      `Look for a quiet move near ${targetA} that leaves the enemy with no good option — every reply hurts them.`,
      `Look for a move that tightens the bind near ${targetA} so every enemy move gives something away.`,
    ],
    'advanced-pawn': [
      `Look for a pawn push on ${targetA} that brings the pawn one step closer to becoming a queen.`,
      `Look for a chance to advance the pawn on ${targetA} so the promotion threat becomes unstoppable.`,
      `Look for a way to push the advanced pawn on ${targetA} and create a promotion threat the enemy cannot stop.`,
      `Look for a pawn move on ${targetA} that threatens to promote — the enemy must react and will pay the price.`,
      `Look for an opportunity to advance the pawn on ${targetA} another step closer to the back row.`,
      `Look for a pawn push on ${targetA} that creates an unstoppable promotion threat.`,
    ],
    'promotion': [
      `Look for the chance to march the pawn on ${targetA} all the way to the back row and promote to a queen.`,
      `Look for a pawn promotion on ${targetA} — the pawn is at the last rank and becomes a queen.`,
      `Look for an opportunity to promote the pawn on ${targetA} — reaching the back row creates a queen.`,
      `Look for the promotion move on ${targetA} — the pawn promotes and the game is decided.`,
      `Look for a path to promote the pawn on ${targetA} to a queen and win the endgame.`,
      `Look for a promotion opportunity on ${targetA} — the pawn reaches the last rank and becomes a queen.`,
    ],
    'under-promotion': [
      `Look for a promotion on ${targetA} — but think carefully about which piece wins instead of a queen.`,
      `Look for a chance to promote the pawn on ${targetA} to something other than a queen.`,
      `Look for an under-promotion on ${targetA} — a knight, rook, or bishop instead of a queen sets up the winning trick.`,
      `Look for the promotion on ${targetA} and ask which piece creates the winning idea — it is not a queen.`,
      `Look for a promotion window on ${targetA} where promoting to an unexpected piece is the key.`,
      `Look for a chance to promote on ${targetA} — but the winning move is to choose something other than a queen.`,
    ],
    'en-passant': [
      `Look for the en passant capture — the pawn on ${targetA} just moved two squares and can be taken right now.`,
      `Look for an en passant window — the pawn that just arrived at ${targetA} by moving two squares can be captured.`,
      `Look for a chance to take the pawn on ${targetA} en passant — it just moved two squares and the window is open.`,
      `Look for the special en passant capture — the pawn on ${targetA} moved two squares and can be taken now.`,
      `Look for an en passant opportunity near ${targetA} — the enemy pawn just moved two squares and is vulnerable.`,
      `Look for the en passant capture on ${targetA} — it only works right now, before the next move is played.`,
    ],
  };

  const openingSets = {
    'french-defense': [
      `Look for the weakness that the French Defense structure has left on ${targetA} — it can be struck immediately.`,
      `Look for a tactical shot on ${targetA} where the cramped French Defense pieces have created a real target.`,
      `Look for an opportunity to hit the French Defense weakness on ${targetA} and win material or gain a decisive edge.`,
      `Look for a concrete attacking chance on ${targetA} — the French Defense structure has a crack right there.`,
      `Look for the French Defense vulnerability on ${targetA} and the move that exploits it immediately.`,
      `Look for a winning move on ${targetA} where the French Defense cramped setup has created a real opening.`,
      `Look for an immediate strike on ${targetA} — the French Defense tension has left a real target there.`,
      `Look for the opportunity the French Defense structure has created on ${targetA} — the time to act is now.`,
    ],
    'ruy-lopez': [
      `Look for the target on ${targetA} that the Ruy Lopez pressure has left with too little support.`,
      `Look for a concrete winning move on ${targetA} where the Ruy Lopez buildup has paid off.`,
      `Look for a chance to strike the Ruy Lopez weakness on ${targetA} and win material or a decisive advantage.`,
      `Look for the Ruy Lopez opportunity on ${targetA} — the long-term pressure has created a real target there.`,
      `Look for a tactical blow on ${targetA} — the Ruy Lopez squeeze has opened a window right there.`,
      `Look for a winning move on ${targetA} where the Ruy Lopez piece pressure has tipped into a concrete chance.`,
      `Look for a decisive strike on ${targetA} — the Ruy Lopez tension has left something there undefended.`,
      `Look for the Ruy Lopez payoff on ${targetA} — a concrete move that converts the pressure into material.`,
    ],
    'sicilian-defense': [
      `Look for the Sicilian Defense tactical opportunity on ${targetA} — a concrete winning move is available there.`,
      `Look for a sharp tactical shot on ${targetA} where the Sicilian Defense energy has created a real target.`,
      `Look for a winning move on ${targetA} — the Sicilian Defense sharp play has opened a real opportunity there.`,
      `Look for the decisive chance on ${targetA} that the Sicilian Defense complexity has produced.`,
      `Look for a concrete attack on ${targetA} where the Sicilian Defense open lines have created a real target.`,
      `Look for the Sicilian Defense opportunity on ${targetA} and the exact move that seizes it.`,
      `Look for a tactical blow on ${targetA} — the Sicilian Defense sharpness has created a real opening there.`,
      `Look for a winning shot on ${targetA} — the Sicilian Defense has left something there that can be hit.`,
    ],
    'caro-kann-defense': [
      `Look for the crack in the Caro-Kann Defense structure on ${targetA} — it can be exploited immediately.`,
      `Look for a tactical shot on ${targetA} where the Caro-Kann Defense setup has left a real weakness.`,
      `Look for a winning move on ${targetA} — the Caro-Kann Defense structure has a vulnerability right there.`,
      `Look for the Caro-Kann Defense weakness on ${targetA} and the move that wins material there.`,
      `Look for a concrete attack on ${targetA} where the Caro-Kann Defense solid-looking setup has cracked.`,
      `Look for an immediate opportunity on ${targetA} — the Caro-Kann Defense has left something there exploitable.`,
      `Look for a decisive shot on ${targetA} — the Caro-Kann Defense structure has created a real opening.`,
      `Look for the Caro-Kann Defense vulnerability on ${targetA} that can be struck right now.`,
    ],
    'italian-game': [
      `Look for the Italian Game attacking chance on ${targetA} — the fast development has created a real target there.`,
      `Look for a tactical blow on ${targetA} where the Italian Game bishop pressure has paid off.`,
      `Look for a winning move on ${targetA} — the Italian Game attacking setup has found a real opening there.`,
      `Look for the Italian Game opportunity on ${targetA} and the exact move that strikes decisively.`,
      `Look for a concrete attack on ${targetA} where the Italian Game speed of development has left something exposed.`,
      `Look for an immediate strike on ${targetA} — the Italian Game attacking pieces have created a real chance there.`,
      `Look for a decisive tactical shot on ${targetA} — the Italian Game has built up to this exact moment.`,
      `Look for the Italian Game target on ${targetA} and the move that wins it immediately.`,
    ],
    'queens-gambit-declined': [
      `Look for the Queen's Gambit opportunity on ${targetA} — the central pressure has created a real target there.`,
      `Look for a decisive move on ${targetA} where the Queen's Gambit piece activity has found a real opening.`,
      `Look for a winning shot on ${targetA} — the Queen's Gambit pressure has left something there undefended.`,
      `Look for the Queen's Gambit tactical chance on ${targetA} and the move that converts it to material.`,
      `Look for a concrete attack on ${targetA} where the Queen's Gambit central control has tipped into a real chance.`,
      `Look for an immediate opportunity on ${targetA} — the Queen's Gambit tension has found its outlet right there.`,
      `Look for a decisive tactical blow on ${targetA} — the Queen's Gambit activity has created a real target there.`,
      `Look for the Queen's Gambit payoff on ${targetA} — one accurate move wins material or decides the game.`,
    ],
    'philidor-defense': [
      `Look for the weakness on ${targetA} that the Philidor Defense's passive setup has created.`,
      `Look for a tactical shot on ${targetA} where the Philidor Defense passive pieces have left a real target.`,
      `Look for a winning move on ${targetA} — the Philidor Defense cramped structure has cracked right there.`,
      `Look for the Philidor Defense vulnerability on ${targetA} and the move that strikes it immediately.`,
      `Look for a concrete attacking chance on ${targetA} where the Philidor Defense passivity has created an opening.`,
      `Look for an immediate opportunity on ${targetA} — the Philidor Defense setup has left something there exposed.`,
      `Look for a decisive shot on ${targetA} — the Philidor Defense passive approach has created a real target there.`,
      `Look for the Philidor Defense weakness on ${targetA} that can be seized for a winning tactical blow.`,
    ],
    'four-knights-defense': [
      `Look for the Four Knights Defense tactical chance on ${targetA} — the active pieces have created a real opening.`,
      `Look for a winning shot on ${targetA} where the Four Knights Defense lively play has produced a real target.`,
      `Look for a decisive move on ${targetA} — the Four Knights Defense knight activity has created a real chance.`,
      `Look for the Four Knights Defense opportunity on ${targetA} and the move that wins material there.`,
      `Look for a concrete attack on ${targetA} where the Four Knights Defense active play has left something exposed.`,
      `Look for an immediate tactical shot on ${targetA} — the Four Knights Defense sharpness has created a real opening.`,
      `Look for a decisive chance on ${targetA} — the Four Knights Defense energy has built to this exact moment.`,
      `Look for the Four Knights Defense target on ${targetA} and the exact move that seizes it.`,
    ],
    'kings-gambit-accepted': [
      `Look for the King's Gambit attacking chance on ${targetA} — the open lines have built a real target there.`,
      `Look for a tactical blow on ${targetA} where the King's Gambit attack has found its target.`,
      `Look for a winning move on ${targetA} — the King's Gambit open files have created a real opportunity there.`,
      `Look for the King's Gambit payoff on ${targetA} — the pawn sacrifice has opened lines pointing right there.`,
      `Look for a concrete attack on ${targetA} where the King's Gambit development lead has created a real chance.`,
      `Look for an immediate strike on ${targetA} — the King's Gambit attacking energy has found its outlet there.`,
      `Look for a decisive tactical shot on ${targetA} — the King's Gambit has built up to this exact moment.`,
      `Look for the King's Gambit target on ${targetA} and the move that delivers the decisive blow.`,
    ],
    'damiano-defense': [
      `Look for the weakness on ${targetA} that the Damiano Defense's risky setup has created.`,
      `Look for a tactical shot on ${targetA} where the Damiano Defense shaky structure has left a real target.`,
      `Look for a winning move on ${targetA} — the Damiano Defense risky choices have created a real vulnerability there.`,
      `Look for the Damiano Defense weakness on ${targetA} and the move that strikes it immediately.`,
      `Look for a concrete attack on ${targetA} where the Damiano Defense has left something wide open.`,
      `Look for an immediate opportunity on ${targetA} — the Damiano Defense setup has created a real exploitable chance.`,
      `Look for a decisive shot on ${targetA} — the Damiano Defense's risky play has left a real target there.`,
      `Look for the Damiano Defense vulnerability on ${targetA} that can be seized for a winning blow.`,
    ],
    'vienna-game': [
      `Look for the Vienna Game attacking chance on ${targetA} — the central pressure has created a real target.`,
      `Look for a tactical blow on ${targetA} where the Vienna Game piece activity has found a real opening.`,
      `Look for a winning move on ${targetA} — the Vienna Game strong center has produced a real attacking chance.`,
      `Look for the Vienna Game opportunity on ${targetA} and the exact move that converts it to an advantage.`,
      `Look for a concrete attack on ${targetA} where the Vienna Game central control has tipped into a real chance.`,
      `Look for an immediate strike on ${targetA} — the Vienna Game attacking setup has found its focus there.`,
      `Look for a decisive tactical shot on ${targetA} — the Vienna Game has built up to this exact moment.`,
      `Look for the Vienna Game target on ${targetA} and the move that wins material or delivers a decisive blow.`,
    ],
    'pawn-endgame': [
      `Look for a pawn move on ${targetA} that creates a promotion threat the enemy cannot stop.`,
      `Look for the key pawn advance on ${targetA} that decides who promotes first in this endgame.`,
      `Look for an opportunity to push the pawn on ${targetA} one step closer to becoming a queen.`,
      `Look for a pawn move on ${targetA} that wins the race to promotion in this endgame.`,
      `Look for the decisive pawn advance on ${targetA} — one move there decides the whole endgame.`,
      `Look for a pawn push on ${targetA} that creates an unstoppable march to the back row.`,
      `Look for a move on ${targetA} that gives the pawn an unstoppable path to promotion.`,
      `Look for the critical pawn move on ${targetA} — getting this right decides the endgame.`,
    ],
    'queen-endgame': [
      `Look for a queen move to ${targetA} that creates a decisive threat the enemy cannot handle.`,
      `Look for an opportunity to move the queen to ${targetA} and create an unstoppable winning threat.`,
      `Look for a queen move that targets the weakness on ${targetA} and creates a decisive advantage.`,
      `Look for a queen move to ${targetA} — one accurate move with the queen decides the endgame.`,
      `Look for a chance to aim the queen at ${targetA} and create a threat that cannot be stopped.`,
      `Look for a decisive queen move toward ${targetA} that converts the advantage into a win.`,
      `Look for a queen move to ${targetA} that creates a mating threat or wins material decisively.`,
      `Look for the winning queen move toward ${targetA} — one accurate move ends the game.`,
    ],
    'english-opening': [
      `Look for the English Opening opportunity on ${targetA} — the flank control has created a real target there.`,
      `Look for a tactical shot on ${targetA} where the English Opening pressure has found its outlet.`,
      `Look for a winning move on ${targetA} — the English Opening flexible setup has created a real chance.`,
      `Look for the English Opening payoff on ${targetA} and the move that seizes the advantage there.`,
      `Look for a concrete attack on ${targetA} where the English Opening piece activity has built a real target.`,
      `Look for an immediate opportunity on ${targetA} — the English Opening pressure has peaked right there.`,
      `Look for a decisive shot on ${targetA} — the English Opening has created a real winning chance there.`,
      `Look for the English Opening target on ${targetA} and the move that converts it to a decisive advantage.`,
    ],
    'scandinavian-defense': [
      `Look for the Scandinavian Defense opportunity on ${targetA} — the active play has created a real target there.`,
      `Look for a tactical shot on ${targetA} where the Scandinavian Defense open play has found a real opening.`,
      `Look for a winning move on ${targetA} — the Scandinavian Defense has created a decisive chance right there.`,
      `Look for the Scandinavian Defense target on ${targetA} and the move that wins it immediately.`,
      `Look for a concrete attack on ${targetA} where the Scandinavian Defense active pieces have left something exposed.`,
      `Look for an immediate strike on ${targetA} — the Scandinavian Defense energy has found its focus right there.`,
      `Look for a decisive chance on ${targetA} — the Scandinavian Defense has built to this exact moment.`,
      `Look for the Scandinavian Defense vulnerability on ${targetA} that can be seized for a winning blow.`,
    ],
    'scotch-game': [
      `Look for the Scotch Game opportunity on ${targetA} — the open center has created a real target there.`,
      `Look for a tactical shot on ${targetA} where the Scotch Game central strike has found a real opening.`,
      `Look for a winning move on ${targetA} — the Scotch Game open lines have created a decisive chance there.`,
      `Look for the Scotch Game target on ${targetA} and the exact move that wins material or decides the game.`,
      `Look for a concrete attack on ${targetA} where the Scotch Game active piece play has built a real chance.`,
      `Look for an immediate strike on ${targetA} — the Scotch Game tactical sharpness has peaked right there.`,
      `Look for a decisive shot on ${targetA} — the Scotch Game has created a real winning opportunity there.`,
      `Look for the Scotch Game payoff on ${targetA} — one move there converts the opening advantage into material.`,
    ],
    'modern-defense': [
      `Look for the Modern Defense counter-attacking chance on ${targetA} — the counterplay has created a real target.`,
      `Look for a tactical shot on ${targetA} where the Modern Defense patient buildup has found its outlet.`,
      `Look for a winning move on ${targetA} — the Modern Defense counter-attack has created a real chance there.`,
      `Look for the Modern Defense opportunity on ${targetA} — the patient counter-play has peaked right there.`,
      `Look for a concrete attacking move on ${targetA} where the Modern Defense has created a real target.`,
      `Look for an immediate counter-strike on ${targetA} — the Modern Defense has built to this exact moment.`,
      `Look for a decisive chance on ${targetA} — the Modern Defense counter-play has found a real opening there.`,
      `Look for the Modern Defense target on ${targetA} and the move that seizes the decisive advantage.`,
    ],
    'pirc-defense': [
      `Look for the Pirc Defense counter-attacking chance on ${targetA} — the patient play has created a real opening.`,
      `Look for a tactical shot on ${targetA} where the Pirc Defense careful buildup has found its outlet.`,
      `Look for a winning move on ${targetA} — the Pirc Defense flexible setup has created a real chance there.`,
      `Look for the Pirc Defense opportunity on ${targetA} and the move that delivers the decisive blow.`,
      `Look for a concrete attack on ${targetA} where the Pirc Defense counter-play has created a real target.`,
      `Look for an immediate counter-strike on ${targetA} — the Pirc Defense has built to this exact moment.`,
      `Look for a decisive shot on ${targetA} — the Pirc Defense patient approach has created a real opening there.`,
      `Look for the Pirc Defense target on ${targetA} and the exact move that seizes the advantage.`,
    ],
    'rapport-jobava-system': [
      `Look for the Rapport-Jobava attacking chance on ${targetA} — the fast development has created a real target.`,
      `Look for a tactical blow on ${targetA} where the Rapport-Jobava aggressive setup has found its outlet.`,
      `Look for a winning move on ${targetA} — the Rapport-Jobava System has built a decisive chance right there.`,
      `Look for the Rapport-Jobava opportunity on ${targetA} and the move that delivers the winning blow.`,
      `Look for a concrete attack on ${targetA} where the Rapport-Jobava fast piece development has created a target.`,
      `Look for an immediate strike on ${targetA} — the Rapport-Jobava attacking energy has peaked right there.`,
      `Look for a decisive shot on ${targetA} — the Rapport-Jobava System has built to this exact attacking moment.`,
      `Look for the Rapport-Jobava target on ${targetA} and the exact move that converts the attack into material.`,
    ],
    'queen-rook-endgame': [
      `Look for a move that combines the queen and rook to create a decisive double threat on ${targetA}.`,
      `Look for a chance to use the queen and rook together to deliver a winning blow on ${targetA}.`,
      `Look for a queen-and-rook combination on ${targetA} that creates a threat the enemy cannot stop.`,
      `Look for an opportunity to coordinate the queen and rook on ${targetA} for a decisive double attack.`,
      `Look for a move that uses both the queen and rook to overwhelm the defense on ${targetA}.`,
      `Look for a queen-rook coordination on ${targetA} — a move that creates two threats at once.`,
      `Look for a way to aim the queen and rook at ${targetA} together and create an unstoppable threat.`,
      `Look for a decisive queen-and-rook move on ${targetA} that combines both pieces for a winning blow.`,
    ],
    'knight-endgame': [
      `Look for a surprising knight jump near ${targetA} that creates a decisive advantage the enemy cannot answer.`,
      `Look for a knight move to ${targetA} that outmaneuvers the enemy king and creates a winning threat.`,
      `Look for an unexpected knight jump near ${targetA} — knights move in odd ways and this one is decisive.`,
      `Look for a knight move near ${targetA} that forks, traps, or outmaneuvers the enemy king.`,
      `Look for a knight jump near ${targetA} that creates a threat the enemy king cannot handle.`,
      `Look for an opportunity to move the knight near ${targetA} to a square the enemy king cannot cover.`,
      `Look for a knight move near ${targetA} that creates an unstoppable advantage in this endgame.`,
      `Look for the decisive knight jump near ${targetA} — one move there wins the endgame.`,
    ],
  };

  return sets[category] || openingSets[category] || [
    `Look for a decisive move on ${targetA} — the winning opportunity is right there.`,
    `Look for a concrete winning chance on ${targetA} — one accurate move creates a decisive advantage.`,
    `Look for an opportunity to strike on ${targetA} and create a threat that cannot be answered.`,
    `Look for the key move on ${targetA} — it creates a winning advantage in one step.`,
    `Look for a winning shot on ${targetA} — the moment to act has arrived.`,
    `Look for an opportunity on ${targetA} — one move there changes everything.`,
    `Look for the winning chance on ${targetA} — a decisive move is available right now.`,
    `Look for a move on ${targetA} that creates an unstoppable advantage.`,
  ];
}

// ── PREFER_TACTIC_CLUES: pure tactics + endgame categories ───────────────────
// Opening categories (french-defense, ruy-lopez, etc.) are intentionally
// excluded so they fall through to board-aware materialOpportunityClues or
// boardTacticalClues — which describe actual board patterns instead of
// naming the opening structure generically.

const PREFER_TACTIC_CLUES = new Set([
  'fork','pin','skewer','discovered-attack','deflection','attraction','clearance',
  'interference','intermezzo','double-check','x-ray-attack','capturing-defender',
  'sacrifice','trapped-piece','hanging-piece','castling','zugzwang',
  'advanced-pawn','promotion','under-promotion','en-passant',
  'pawn-endgame','queen-endgame','knight-endgame','queen-rook-endgame',
]);

const MATE_CATEGORIES = new Set([
  'arabian-mate','bodens-mate','anastasia-mate','double-bishop-mate',
  'dovetail-mate','hook-mate','smothered-mate','back-rank-mate',
]);

// ── boardTacticalClues: board-aware clues for opening/generic categories ──────
// Describes VISUAL PATTERNS on this specific board without naming the opening.

function boardTacticalClues(move, game) {
  if (!move || !game) return [
    'Look for an undefended piece in the center that can be captured immediately.',
    'There is an unprotected piece in the center with no guard — take it for free.',
    'A free capture is sitting in the center — zero defenders.',
    'Two threats can be created in the center in one move — the enemy cannot answer both.',
  ];
  const targetA = area(move.to);
  const ec = oppositeColor(move.color);
  const kSq = findKingSq(game, ec);
  const kingA = area(kSq);
  const defenders = defCount(game, move);
  const kParts = kSq ? sqParts(kSq) : null;
  const tParts = sqParts(move.to);
  const nearKing = kSq && kParts &&
    Math.abs(tParts.fi - kParts.fi) <= 2 &&
    Math.abs(tParts.rank - kParts.rank) <= 2;
  const profile = kingProfile(game, move);

  if (profile.safeCount === 0) return kingOpportunityClues(profile);

  if (nearKing && profile.safeCount <= 2) return [
    `Look for a forcing move close to the enemy king on ${kingA} — the king has almost no safe escape.`,
    `The enemy king on ${kingA} has almost no safe squares left — a decisive blow is very close.`,
    `Look for a decisive attack aimed at the enemy king on ${kingA} — it has only ${profile.safeCount === 1 ? 'one safe square' : 'two safe squares'} left.`,
    `There is a nearly-trapped enemy king on ${kingA} — one forcing move closes the net.`,
    `Look for an open attacking line near the enemy king on ${kingA} — with so few escape squares it is nearly trapped.`,
    `The enemy king on ${kingA} is almost out of room — a mating blow is available right now.`,
    `Look for a mating net near the enemy king on ${kingA} — it is almost out of room to run.`,
    `A decisive attack near the enemy king on ${kingA} will stick — it has ${profile.safeCount === 1 ? 'only one square' : 'barely any room'} to run.`,
  ];

  if (nearKing) return [
    `Look for a forcing move near the enemy king on ${kingA} — a piece there is exposed and under pressure.`,
    `There is an exposed piece near the enemy king on ${kingA} — attack it and a decisive threat follows.`,
    `Look for an open attacking line aimed near the enemy king on ${kingA} — a decisive threat is available.`,
    `A piece close to the enemy king on ${kingA} is exposed — one forcing move creates a dangerous attack.`,
    `Look for a move that creates immediate pressure close to the enemy king on ${kingA}.`,
    `The enemy king on ${kingA} has limited cover nearby — a forcing move there starts a hard-to-stop attack.`,
    `Look for a piece close to the enemy king on ${kingA} that is exposed and can be attacked.`,
    `Notice a piece near the enemy king on ${kingA} sitting with thin protection — attack it.`,
  ];

  if (defenders === 0) return [
    `Look for a piece on ${targetA} with no one guarding it — a free capture is available right there.`,
    `There is an unguarded piece on ${targetA} with zero defenders — take it immediately.`,
    `The piece on ${targetA} has no protection at all — it is completely free to capture.`,
    `An undefended piece sits on ${targetA} — nobody is guarding it and it can simply be won.`,
    `Look for a free capture on ${targetA} — a piece sitting there with no guard at all.`,
    `Zero defenders protect the piece on ${targetA} — step in and take it for free.`,
  ];

  if (defenders === 1) return [
    `Look for a piece on ${targetA} with just one guard — find a way to challenge that single defender.`,
    `The piece on ${targetA} has only one defender — remove or distract that guard and win the target.`,
    `Look for a way to remove the one defender protecting the piece on ${targetA}.`,
    `There is a lightly-protected piece on ${targetA} — one guard stands between it and a free capture.`,
    `Only one piece guards the target on ${targetA} — deal with that guard and the target falls.`,
    `Look for the piece on ${targetA} with minimal protection — its single defender can be dealt with.`,
  ];

  return [
    `Look for a forcing move toward ${targetA} that creates a decisive threat the enemy cannot answer.`,
    `There is a double-attack window near ${targetA} — two threats at once and the enemy must give something up.`,
    `Look for a double attack near ${targetA} — hitting two targets at once wins material.`,
    `A forcing move near ${targetA} creates two problems the enemy cannot both solve.`,
    `Look for a move near ${targetA} that attacks two targets at once and wins material.`,
    `Notice the overloaded defenders near ${targetA} — two threats can be created in one move.`,
    `Two threats can be set up near ${targetA} in one move — the enemy cannot answer both.`,
    `Look for a move that targets ${targetA} and creates a threat the defense cannot handle.`,
  ];
}

function buildHint2(category, move, game, urlSeed, variant) {
  const principle2 = PRINCIPLES2[category];
  if (!principle2) return null;

  let clues;
  let posKey = move?.to || '';

  if (MATE_CATEGORIES.has(category) && game && move) {
    const profile = kingProfile(game, move);
    posKey = `${profile.kingSquare}:${profile.blockedSides.sort().join(',')}:${profile.safeCount}`;
    clues = kingOpportunityClues(profile);
  } else if (PREFER_TACTIC_CLUES.has(category) && move && game) {
    clues = tacticOpportunityClues(category, move, game);
  } else if (move?.captured && game) {
    clues = materialOpportunityClues(move, game);
  } else {
    clues = boardTacticalClues(move, game);
  }

  const combinedSeed = urlSeed ^ hash(posKey);
  const opportunityClue = pick(clues, combinedSeed, variant);
  return `${principle2} ${opportunityClue}`;
}

// ── validation (mirrors audit_hint2.js) ──────────────────────────────────────

const CATEGORY_KEYWORDS = {
  'arabian-mate': ['arabian'], 'bodens-mate': ['boden'], 'anastasia-mate': ['anastasia'],
  'double-bishop-mate': ['double-bishop','double bishop'], 'dovetail-mate': ['dovetail'],
  'hook-mate': ['hook'], 'smothered-mate': ['smothered'], 'back-rank-mate': ['back-rank','back rank','back row'],
  'fork': ['fork'], 'pin': ['pin'], 'skewer': ['skewer'],
  'discovered-attack': ['discover'], 'deflection': ['deflect'], 'hanging-piece': ['hanging','undefended','no defender'],
  'trapped-piece': ['trap'], 'attraction': ['attract','lure'], 'clearance': ['clearance','clear the'],
  'interference': ['interfer'], 'intermezzo': ['intermezzo','in-between'],
  'double-check': ['double check'], 'x-ray-attack': ['x-ray'],
  'capturing-defender': ['captur','remov','eliminat'], 'sacrifice': ['sacrific'],
  'under-promotion': ['under-promot','promote to'],
  'en-passant': ['en passant','en-passant'], 'castling': ['castl'],
  'zugzwang': ['zugzwang'], 'advanced-pawn': ['pawn','pass'], 'promotion': ['promot','queen'],
  'french-defense': ['french'], 'ruy-lopez': ['ruy lopez','ruy-lopez','spanish'],
  'sicilian-defense': ['sicilian'], 'caro-kann-defense': ['caro-kann','caro kann'],
  'italian-game': ['italian'], 'queens-gambit-declined': ["queen's gambit","queens gambit"],
  'philidor-defense': ['philidor'], 'four-knights-defense': ['four knight','four-knight'],
  'kings-gambit-accepted': ["king's gambit","kings gambit"],
  'damiano-defense': ['damiano'], 'vienna-game': ['vienna'],
  'pawn-endgame': ['pawn endgame','only pawns','pawns and kings'],
  'queen-endgame': ['queen endgame'],
  'knight-endgame': ['knight endgame'],
  'english-opening': ['english'],
  'scandinavian-defense': ['scandinavian'],
  'scotch-game': ['scotch'],
  'modern-defense': ['modern defense'],
  'pirc-defense': ['pirc'],
  'rapport-jobava-system': ['rapport','jobava'],
  'queen-rook-endgame': ['queen and rook','queen-rook'],
};

const VAGUE = [
  'force the issue','big clue','find the move','best move','right move','strong move here',
  'the opportunity is',
  'the opportunity the',
  'the time to act is now',
  'the time to strike is now',
  'has found its outlet',
  'material weaknesses matter when one target lacks steady support',
  'loose targets become vulnerable when their guards are stretched thin',
];


const OPENING_S2_BANNED = {
  'french-defense':         ['french'],
  'ruy-lopez':              ['ruy lopez', 'ruy-lopez', 'spanish'],
  'sicilian-defense':       ['sicilian'],
  'caro-kann-defense':      ['caro-kann', 'caro kann'],
  'italian-game':           ['italian'],
  'queens-gambit-declined': ["queen's gambit", 'queens gambit'],
  'philidor-defense':       ['philidor'],
  'four-knights-defense':   ['four knight', 'four-knight'],
  'kings-gambit-accepted':  ["king's gambit", 'kings gambit'],
  'damiano-defense':        ['damiano'],
  'vienna-game':            ['vienna'],
  'english-opening':        ['english opening'],
  'scandinavian-defense':   ['scandinavian'],
  'scotch-game':            ['scotch'],
  'modern-defense':         ['modern defense'],
  'pirc-defense':           ['pirc'],
  'rapport-jobava-system':  ['rapport', 'jobava'],
};

function getSentences(hint) {
  return String(hint || '').split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
}

function validate2(hint2, hint1, category, game, move) {
  const issues = [];
  const ss = getSentences(hint2);
  const lower = hint2.toLowerCase();

  if (/[\r\n]/.test(hint2)) issues.push('has-line-break');
  if (ss.length !== 2) issues.push(`wrong-sentence-count:${ss.length}`);
  if (/\b[a-h][1-8]\b/i.test(hint2)) issues.push('square-id');
  if (/[;:]/.test(hint2)) issues.push('dense-punctuation');
  if (VAGUE.some(v => lower.includes(v))) issues.push('vague-phrase');

  const kws = CATEGORY_KEYWORDS[category];
  if (kws && ss.length >= 1 && !kws.some(kw => ss[0].toLowerCase().includes(kw))) {
    issues.push('category-not-named');
  }


  if (ss.length >= 2) {
    const bannedS2Names = OPENING_S2_BANNED[category];
    if (bannedS2Names) {
      const s2lower = (ss[1] || '').toLowerCase();
      if (bannedS2Names.some(kw => s2lower.includes(kw.toLowerCase()))) {
        issues.push('opening-name-in-s2');
      }
    }
  }

  if (hint1 && ss.length >= 1) {
    const h1ss = getSentences(hint1);
    const h1s1 = (h1ss[0] || '').toLowerCase().trim();
    const h2s1 = (ss[0] || '').toLowerCase().trim();
    if (h1s1 && h2s1 && h1s1 === h2s1) issues.push('repeats-hint1');
  }

  if (move?.captured && game) {
    const actual = pieceValue(move.captured);
    for (const m of lower.matchAll(/(\d+)\s*point/g)) {
      if (parseInt(m[1], 10) !== actual) issues.push(`wrong-piece-value:${m[1]}vs${actual}`);
    }
  }

  if (game && move) {
    const sm = lower.match(/no safe (?:exit|escape|square)(?:\s+to(?:\s+the)?)?\s+(left|right|forward|back)/);
    if (sm) {
      const profile = kingProfile(game, move);
      if (!profile.blockedSides.includes(sm[1])) issues.push(`wrong-king-escape-side:${sm[1]}`);
    }
  }

  return issues;
}

// ── main ──────────────────────────────────────────────────────────────────────

function main() {
  const data = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));

  const rewriteAll = process.argv.includes('--rewrite-all');
  const batchArg = process.argv.indexOf('--batch');
  const batchNum = batchArg !== -1 ? parseInt(process.argv[batchArg + 1], 10) : 0;
  const batchOffset = batchNum * BATCH_SIZE;
  const allFailing = [];
  const categoryAreaClues = {};

  Object.entries(data).forEach(([cat, cd]) => {
    if (!cd?.puzzles) return;
    Object.entries(cd.puzzles).forEach(([url, puz]) => {
      if (!Array.isArray(puz?.moveHints)) return;
      const fen = parseFen(url);
      const moves = splitMoves(puz.answer);

      puz.moveHints.forEach((g, gi) => {
        if (!Array.isArray(g) || typeof g[1] !== 'string') return;
        const hint2 = g[1];
        const hint1 = g[0] || '';

        const sentences = getSentences(hint2);
        const s2 = sentences[1] || '';
        if (s2) {
          if (!categoryAreaClues[cat]) categoryAreaClues[cat] = new Map();
          categoryAreaClues[cat].set(s2, (categoryAreaClues[cat].get(s2) || 0) + 1);
        }

        let game = null, move = null;
        if (fen) {
          try {
            const replay = new Chess(fen);
            for (let i = 0; i < gi * 2; i++) replay.move(moves[i]);
            game = new Chess(replay.fen());
            const raw = replay.move(moves[gi * 2]);
            if (raw) move = raw;
          } catch {}
        }

        const issues = validate2(hint2, hint1, cat, game, move);
        const s2Count = categoryAreaClues[cat]?.get(s2) || 0;
        const isDuplicate = s2 && s2Count >= 3;

        if (rewriteAll || issues.length > 0 || isDuplicate) {
          allFailing.push({ cat, url, gi, fen, moves, currentHint2: hint2, hint1 });
        }
      });
    });
  });

  const batch = allFailing.slice(batchOffset, batchOffset + BATCH_SIZE);
  console.log(`\nFound ${allFailing.length} hint 2s queued. Processing batch ${batchNum} (${batchOffset}–${batchOffset + batch.length - 1}).\n`);

  let passCount = 0;
  let failCount = 0;
  const updates = [];

  batch.forEach(({ cat, url, gi, fen, moves, currentHint2, hint1 }) => {
    const seed = hash(`${cat}|${url}|${gi}|h2`);
    let game = null, move = null;

    if (fen) {
      try {
        const replay = new Chess(fen);
        for (let i = 0; i < gi * 2; i++) replay.move(moves[i]);
        game = new Chess(replay.fen());
        const raw = replay.move(moves[gi * 2]);
        if (raw) move = raw;
      } catch {}
    }

    const currentS2 = getSentences(currentHint2)[1] || '';
    if (currentS2 && categoryAreaClues[cat]) {
      const n = categoryAreaClues[cat].get(currentS2) || 0;
      if (n <= 1) categoryAreaClues[cat].delete(currentS2);
      else categoryAreaClues[cat].set(currentS2, n - 1);
    }

    let chosen = null;
    for (let variant = 0; variant < 24; variant++) {
      const candidate = buildHint2(cat, move, game, seed, variant);
      if (!candidate) break;

      const issues = validate2(candidate, hint1, cat, game, move);
      if (issues.length > 0) continue;

      const candidateS2 = getSentences(candidate)[1] || '';
      const existingCount = candidateS2 ? (categoryAreaClues[cat]?.get(candidateS2) || 0) : 0;
      if (existingCount >= 2) continue;

      chosen = candidate;
      break;
    }

    if (chosen) {
      const chosenS2 = getSentences(chosen)[1] || '';
      if (chosenS2) {
        if (!categoryAreaClues[cat]) categoryAreaClues[cat] = new Map();
        categoryAreaClues[cat].set(chosenS2, (categoryAreaClues[cat].get(chosenS2) || 0) + 1);
      }
      updates.push({ cat, url, gi, newHint2: chosen });
      passCount++;
    } else {
      console.log(`  SKIP  ${cat} gi=${gi} (no valid variant)`);
      failCount++;
      if (currentS2) {
        if (!categoryAreaClues[cat]) categoryAreaClues[cat] = new Map();
        categoryAreaClues[cat].set(currentS2, (categoryAreaClues[cat].get(currentS2) || 0) + 1);
      }
    }
  });

  updates.forEach(({ cat, url, gi, newHint2 }) => {
    data[cat].puzzles[url].moveHints[gi][1] = newHint2;
  });

  fs.writeFileSync(DATASET_PATH, JSON.stringify(data, null, 2));

  console.log(`\nResults:`);
  console.log(`  Updated : ${passCount} hint 2s`);
  console.log(`  Skipped : ${failCount} (no principle or no valid variant)`);
  console.log(`\nWrote to puzzles.json.\n`);

  if (updates.length >= 2) {
    const picks = [
      updates[Math.floor(updates.length * 0.2)],
      updates[Math.floor(updates.length * 0.7)],
    ];
    console.log('── Sample updated hint 2s ──────────────────────────────────────\n');
    picks.forEach(({ cat, url, gi, newHint2 }) => {
      console.log(`Category : ${cat}`);
      console.log(`Group    : ${gi}`);
      console.log(`Hint 2   : "${newHint2}"`);
      console.log('');
    });
  }
}

main();
