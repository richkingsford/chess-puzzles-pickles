#!/usr/bin/env node
'use strict';
/**
 * rewrite_hint1_batch.js
 *
 * Rewrites the first BATCH_SIZE failing hint 1s using category-named principles
 * and board-specific area clues. Loops through template variants until every
 * generated hint passes all auditor checks, then writes back to puzzles.json.
 *
 * Usage: node rewrite_hint1_batch.js
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

function pieceValue(code) {
  return PIECE_VALUES[String(code || '').toLowerCase()] || 1;
}

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
    { dx: -1, dy: -1, s: 'left'    }, { dx: -1, dy: 0, s: 'left'    }, { dx: -1, dy: 1, s: 'left'    },
    { dx:  1, dy: -1, s: 'right'   }, { dx:  1, dy: 0, s: 'right'   }, { dx:  1, dy: 1, s: 'right'   },
    { dx:  0, dy: ec === 'w' ?  1 : -1, s: 'forward' },
    { dx:  0, dy: ec === 'w' ? -1 :  1, s: 'back'    },
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
  const sq = move.flags?.includes('e') // en passant
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

// more specific area description for king positions, using actual file
function kingArea(sq) {
  if (!sq) return 'the board';
  const { fi, rank } = sqParts(sq);
  const isBack = rank <= 2 || rank >= 7;
  if (isBack) {
    if (fi === 7 || fi === 0) return fi === 7 ? 'the far right corner of the back row' : 'the far left corner of the back row';
    if (fi === 6 || fi === 1) return fi === 6 ? 'the right side of the back row' : 'the left side of the back row';
    if (fi === 5 || fi === 2) return fi === 5 ? 'just right of center on the back row' : 'just left of center on the back row';
    return 'the center of the back row';
  }
  return area(sq);
}

// ── deterministic seed / variant picker ───────────────────────────────────────

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick(arr, seed, variant = 0) {
  // Use Math.abs to guard against signed-negative results from bitwise XOR
  return arr[Math.abs((seed + variant) % arr.length)];
}

// ── principle sentences (category-named, 8-year-old friendly) ─────────────────

const PRINCIPLES = {
  'arabian-mate':       'An Arabian mate uses a rook and knight together to trap the enemy king in a corner.',
  'bodens-mate':        "Boden's mate uses two bishops crossing each other to catch the enemy king in a diagonal trap.",
  'anastasia-mate':     'An Anastasia mate uses a rook and knight to pin the enemy king against the side of the board.',
  'double-bishop-mate': 'A double-bishop mate uses two bishops working together to seal off the king.',
  'dovetail-mate':      'A dovetail mate traps the king between its own pieces so it cannot escape to either diagonal.',
  'hook-mate':          'A hook mate corners the enemy king using a rook, knight, and pawn working together.',
  'smothered-mate':     'A smothered mate is when a knight delivers checkmate to a king that is blocked in by its own pieces.',
  'back-rank-mate':     'A back-rank mate traps the enemy king on its home row so it cannot escape.',
  'fork':               'A fork is when one piece attacks two of the enemy pieces at the same time — they can only save one.',
  'pin':                'A pin locks a piece in place because something more valuable is sitting behind it on the same line.',
  'skewer':             'A skewer attacks a valuable piece and then wins what is hiding behind it once it moves out of the way.',
  'discovered-attack':  'A discovered attack is when you move one piece to reveal a powerful hidden attack from another piece behind it.',
  'deflection':         'A deflection forces an important defending piece to move away from where it is needed most.',
  'hanging-piece':      'A hanging piece has no defender at all and can be captured for free.',
  'trapped-piece':      'A trapped piece has no safe square to move to and can be chased down and captured.',
  'attraction':         'An attraction trick lures the enemy king or a key piece onto a square where it can be punished.',
  'clearance':          'A clearance move gets a piece out of the way so a more powerful piece behind it can do its job.',
  'interference':       'An interference move cuts the connection between two enemy pieces so they cannot protect each other.',
  'intermezzo':         'An intermezzo is a surprise in-between move that must be dealt with immediately before anything else.',
  'double-check':       'A double check is when two pieces check the king at the same time — the only escape is to move the king.',
  'x-ray-attack':       'An x-ray attack works through an enemy piece on a line to hit a target hiding behind it.',
  'capturing-defender': 'Capturing the defender takes away the piece that is keeping a key target safe.',
  'sacrifice':          'A sacrifice gives up a piece on purpose to gain something much more important in return.',
  'under-promotion':    'An under-promotion promotes a pawn to a knight, rook, or bishop instead of a queen to set up a special trick.',
  'en-passant':         'En passant is a special pawn capture that is only possible right after the enemy pawn moves two squares forward.',
  'castling':           'Castling moves the king to safety and brings a rook into the game at the same time.',
  'zugzwang':           'Zugzwang is when any move the enemy makes actually makes their position worse — they would rather not move at all.',
  'advanced-pawn':      'An advanced pawn is so close to the back row that it is nearly ready to become a queen.',
  'promotion':          'Promoting a pawn means marching it all the way to the back row where it becomes a queen.',
  'french-defense':     'The French Defense is an opening where Black pushes a pawn forward to hold the center, but the cramped pieces can create unexpected weaknesses.',
  'ruy-lopez':          'The Ruy Lopez is an opening where White puts pressure on the knight defending the center, creating rich and lively tactical positions.',
  'sicilian-defense':   'The Sicilian Defense is an aggressive opening where Black immediately fights for the center, leading to sharp and complex tactics.',
  'caro-kann-defense':  'The Caro-Kann Defense is an opening where Black builds a solid center with careful pawn play, but active pieces can still find tactical tricks.',
  'italian-game':       'The Italian Game is an opening where White aims a bishop at the enemy king corner, often creating fast and sharp attacking chances.',
  'queens-gambit-declined': "The Queen's Gambit is an opening where White offers a pawn to control the center — the position is full of active piece play.",
  'philidor-defense':   'The Philidor Defense is an opening where Black supports the center with a pawn push, but the cramped position can quickly become tactical.',
  'four-knights-defense': 'The Four Knights Defense is an opening where both sides develop all their knights quickly, leading to active and lively positions.',
  'kings-gambit-accepted': "The King's Gambit is an exciting opening where White gives up a pawn early to gain fast development and powerful attacking chances.",
  'damiano-defense':    'The Damiano Defense is a risky opening choice that can quickly lead to dangerous tactics for the better-developed side.',
  'vienna-game':        'The Vienna Game is an opening where White builds a powerful center before launching a quick attack.',
  'pawn-endgame':       'A pawn endgame is when only pawns and kings are left — every pawn move matters because the first side to promote usually wins.',
  'queen-endgame':      'A queen endgame is when queens are the main pieces left — the queen is so powerful that even small advantages can decide the game.',
  'knight-endgame':     'A knight endgame is one of the trickiest endgames — knights move in odd shapes and can outmaneuver a king in surprising ways.',
  'english-opening':    'The English Opening is a flexible opening where White starts by controlling the center from the side, creating rich and complex positions.',
  'scandinavian-defense': 'The Scandinavian Defense is an aggressive opening where Black immediately challenges the center, leading to open and active play.',
  'scotch-game':        'The Scotch Game is an opening where White strikes at the center early, creating open and tactical positions from the very start.',
  'modern-defense':     'The Modern Defense is an opening where Black allows White to build a big center, then attacks it from the sides with pieces and pawns.',
  'pirc-defense':       'The Pirc Defense is a flexible opening where Black develops carefully before striking back at the center, creating tricky counterplay.',
  'rapport-jobava-system': 'The Rapport-Jobava System is an aggressive opening where White develops pieces quickly to launch an early and dangerous attack.',
  'queen-rook-endgame': 'A queen and rook endgame is when the two most powerful pieces work together — their combined force creates threats that are very hard to stop.',
};

// ── area clue template sets ───────────────────────────────────────────────────
// Each set has multiple variants. pick() selects deterministically by URL hash.

function kingClues(profile) {
  const a = kingArea(profile.kingSquare);
  const n = profile.safeCount;
  const side = profile.blockedSides.find(s => s === 'right' || s === 'left') || profile.blockedSides[0];

  if (side === 'right') return [
    `Right now the enemy king on ${a} has the right side completely cut off — that is the trap.`,
    `That home-row trap is set — the enemy king on ${a} has no safe escape to the right.`,
    `In this position the enemy king on ${a} is stuck with the right side completely blocked.`,
    `That is exactly the situation — the enemy king on ${a} has no safe square to the right.`,
    `Right now the enemy king on ${a} has zero safe squares on the right side.`,
    `That trapping condition is in place — the right side is sealed off for the enemy king on ${a}.`,
    `In this position there is no safe exit to the right for the enemy king sitting on ${a}.`,
    `That back-row squeeze is real — the enemy king on ${a} cannot escape to the right.`,
    `Right now the enemy king has been pushed to ${a} and the right escape route is sealed shut.`,
    `That right-side closure is complete — the enemy king on ${a} has no room to run that way.`,
    `In this position the enemy king on ${a} finds every right-side escape route closed off.`,
    `That right escape is gone — the enemy king on ${a} is sealed against the edge of the board.`,
  ];
  if (side === 'left') return [
    `Right now the enemy king on ${a} has the left side completely cut off — that is the trap.`,
    `That home-row trap is set — the enemy king on ${a} has no safe escape to the left.`,
    `In this position the enemy king on ${a} is stuck with the left side completely blocked.`,
    `That is exactly the situation — the enemy king on ${a} has no safe square to the left.`,
    `Right now the enemy king on ${a} has zero safe squares on the left side.`,
    `That trapping condition is in place — the left side is sealed off for the enemy king on ${a}.`,
    `In this position there is no safe exit to the left for the enemy king sitting on ${a}.`,
    `That back-row squeeze is real — the enemy king on ${a} cannot escape to the left.`,
    `Right now the enemy king has been pushed to ${a} and the left escape route is sealed shut.`,
    `That left-side closure is complete — the enemy king on ${a} has no room to run that way.`,
    `In this position the enemy king on ${a} finds every left-side escape route closed off.`,
    `That left escape is gone — the enemy king on ${a} is sealed against the edge of the board.`,
  ];
  if (side === 'forward') return [
    `Right now the enemy king on ${a} has no safe square in front of it — the forward path is sealed.`,
    `That trapping condition is set — the enemy king on ${a} cannot escape moving forward.`,
    `In this position the enemy king on ${a} is stuck with no safe way forward.`,
    `That is the key — the enemy king on ${a} has no safe square to move toward.`,
    `Right now the forward path is completely cut off for the enemy king on ${a}.`,
    `That trapping squeeze is in place — the enemy king on ${a} cannot step forward safely.`,
    `In this position there is no safe forward escape for the enemy king on ${a}.`,
    `That blocking condition is real — the enemy king on ${a} cannot move forward.`,
    `Right now the enemy king has been pushed to ${a} and every forward square is covered.`,
    `That forward closure is complete — the enemy king on ${a} cannot advance to safety.`,
    `In this position the enemy king on ${a} finds the forward path completely sealed off.`,
    `That forward escape is gone — the enemy king on ${a} is boxed in with nowhere to advance.`,
  ];
  if (side === 'back') return [
    `Right now the enemy king on ${a} has no safe way to retreat — the back is sealed off.`,
    `That trapping condition is set — the enemy king on ${a} cannot escape by going back.`,
    `In this position the enemy king on ${a} has no safe backward escape.`,
    `That is the key — the enemy king on ${a} cannot retreat to safety.`,
    `Right now the backward path is completely cut off for the enemy king on ${a}.`,
    `That trapping squeeze is in place — the enemy king on ${a} cannot step back safely.`,
    `In this position there is no safe retreat for the enemy king sitting on ${a}.`,
    `That blocking condition is real — the enemy king on ${a} cannot go back.`,
    `Right now the enemy king has been pushed to ${a} and every backward square is covered.`,
    `That rear closure is complete — the enemy king on ${a} cannot retreat to safety.`,
    `In this position the enemy king on ${a} finds every backward escape route sealed off.`,
    `That backward escape is gone — the enemy king on ${a} is pressed forward with nowhere to retreat.`,
  ];
  const safeWord = n === 0 ? 'no safe squares at all' : n === 1 ? 'only one safe square' : `only ${n} safe squares`;
  return [
    `Right now the enemy king on ${a} has ${safeWord} — that home-row trap is closing in.`,
    `That trapping setup is working — the enemy king on ${a} has ${safeWord} nearby.`,
    `In this position the enemy king on ${a} is almost completely surrounded with ${safeWord}.`,
    `That is the situation — the enemy king on ${a} has ${safeWord} to escape to.`,
    `Right now the enemy king on ${a} is nearly out of room with ${safeWord}.`,
    `That back-row squeeze is real — the enemy king on ${a} has ${safeWord} left.`,
    `In this position the cover around the enemy king on ${a} is razor thin.`,
    `That trapping condition is active — the enemy king on ${a} has almost nowhere to go.`,
  ];
}

function materialClues(move, game) {
  const defenders = defCount(game, move);
  const pts = pieceValue(move.captured);
  const ec = oppositeColor(move.color);
  const kingA = area(findKingSq(game, ec));
  const targetA = area(move.to);
  const nearKing = findKingSq(game, ec) &&
    Math.abs(sqParts(move.to).fi - sqParts(findKingSq(game, ec)).fi) <= 2 &&
    Math.abs(sqParts(move.to).rank - sqParts(findKingSq(game, ec)).rank) <= 2;

  if (nearKing) {
    if (defenders === 0) return [
      `Right now a ${pts}-point piece sitting right next to the enemy king on ${kingA} has no defender at all.`,
      `That unprotected piece is right there next to the enemy king on ${kingA} — ${pts} points with nobody guarding it.`,
      `In this position a ${pts}-point piece next to the enemy king on ${kingA} is completely unguarded.`,
      `That is exactly the situation — a ${pts}-pointer near the enemy king on ${kingA} has zero defenders.`,
    ];
    return [
      `Right now a ${pts}-point piece near the enemy king on ${kingA} has only ${defenders === 1 ? 'one guard' : `${defenders} guards`} — not enough.`,
      `That lightly-guarded piece is right next to the enemy king on ${kingA} — a ${pts}-pointer with thin protection.`,
      `In this position the ${pts}-point piece near the enemy king on ${kingA} is not as well protected as it looks.`,
      `That is the target — a ${pts}-pointer near the enemy king on ${kingA} with only ${defenders === 1 ? 'one defender' : `${defenders} defenders`}.`,
    ];
  }

  if (defenders === 0) return [
    `Right now on ${targetA} there is a ${pts}-point piece sitting completely unguarded.`,
    `That unprotected piece is right there on ${targetA} — ${pts} points with nobody guarding it.`,
    `In this position a ${pts}-point piece on ${targetA} has zero defenders looking after it.`,
    `That is exactly the situation — a free ${pts}-point piece on ${targetA} with no one protecting it.`,
  ];
  if (defenders === 1) return [
    `Right now a ${pts}-point piece on ${targetA} has just one guard keeping it safe — that is barely enough.`,
    `That lightly-guarded target is on ${targetA} — a ${pts}-pointer with only one piece protecting it.`,
    `In this position a ${pts}-point piece on ${targetA} has a single defender that can be challenged.`,
    `That is the weakness on ${targetA} — a ${pts}-point piece with just one guard to keep it safe.`,
  ];
  return [
    `Right now on ${targetA} a ${pts}-point piece has only ${defenders} defenders — and they can be put under pressure.`,
    `That target on ${targetA} looks protected but it is a ${pts}-pointer with only ${defenders} guards.`,
    `In this position a ${pts}-point piece on ${targetA} has ${defenders} defenders that can be challenged.`,
    `That is the target on ${targetA} — a ${pts}-pointer whose ${defenders} defenders can be overcome.`,
  ];
}

function tacticClues(category, move, game) {
  if (!move || !game) return [
    'The key area is in the center of the board.',
    'The key area is on the left side of the board.',
    'The key area is on the right side of the board.',
    'The key area is near the back row.',
  ];
  const targetA = area(move.to);
  const ec = oppositeColor(move.color);
  const kingA = area(findKingSq(game, ec));
  const capturedPts = move?.captured ? pieceValue(move.captured) : null;
  const capturedStr = capturedPts ? `a ${capturedPts}-point piece` : 'an enemy piece';

  const sets = {
    'fork': [
      `Right now two enemy pieces near ${targetA} are close enough together that one move attacks them both.`,
      `That forking moment is here — on ${targetA} two enemy pieces cannot both be saved.`,
      `In this position two enemy pieces near ${targetA} are grouped so closely that one move hits them both.`,
      `That is exactly what is happening near ${targetA} — two enemy targets that cannot both escape a single attack.`,
      `Right now near ${targetA} two enemy pieces are in striking range of a single move.`,
      `That double-target moment is on ${targetA} — only one of the two pieces can be saved.`,
      `In this position the two enemy targets near ${targetA} cannot both be protected from one attacking move.`,
      `That fork setup is in place — two enemy pieces near ${targetA} are sitting too close together.`,
    ],
    'pin': [
      `Right now on ${targetA} a piece is stuck — it cannot move without exposing something more valuable behind it.`,
      `That pin is already in place on ${targetA} — the piece is locked because something important is lined up behind it.`,
      `In this position on ${targetA} a piece cannot safely move because a more valuable piece is hiding behind it.`,
      `That is exactly the setup on ${targetA} — a piece pinned in place by something more important behind it.`,
      `Right now a piece on ${targetA} is trapped — moving it would give up something even more valuable behind it.`,
      `That pin is active on ${targetA} — the piece is stuck because of what is sitting behind it.`,
    ],
    'skewer': [
      `Right now on ${targetA} a valuable piece is at the front of a line with something even more valuable hiding behind it.`,
      `That skewer is set up on ${targetA} — the front piece must move, giving up what is behind it.`,
      `In this position on ${targetA} a valuable enemy piece is blocking something even more important behind it.`,
      `That is the setup on ${targetA} — two enemy pieces lined up with the more valuable one at the front.`,
      `Right now two enemy pieces near ${targetA} are on the same line with the bigger one blocking the smaller.`,
      `That skewer line runs through ${targetA} — hitting the front piece wins what is hiding behind it.`,
    ],
    'discovered-attack': [
      `Right now on ${targetA} a piece is sitting in front of a powerful hidden attacker — moving it reveals the danger.`,
      `That discovery setup is on ${targetA} — one piece is blocking an attack from something much stronger behind it.`,
      `In this position on ${targetA} moving one piece will uncover a devastating attack from behind.`,
      `That is exactly the setup — a piece on ${targetA} is the door in front of a powerful hidden attack.`,
      `Right now a piece on ${targetA} is masking a much stronger attack — moving it opens everything up.`,
      `That discovery is ready on ${targetA} — one move reveals a hidden attack the enemy cannot handle.`,
    ],
    'deflection': [
      `Right now on ${targetA} a key defender has two jobs it cannot do at the same time — it can be forced away.`,
      `That overloaded defender is on ${targetA} — protecting more than one thing at once, it can be chased off.`,
      `In this position on ${targetA} a single piece is the only guard of an important target and it can be deflected.`,
      `That is the key on ${targetA} — one defender is doing too much and can be made to abandon its post.`,
      `Right now a critical piece on ${targetA} is stretched too thin — it cannot handle another threat added to its duties.`,
      `That defender on ${targetA} is carrying two duties at once and cannot survive both.`,
    ],
    'attraction': [
      `Right now the enemy king near ${targetA} can be lured onto a square where it gets punished.`,
      `That attraction trick is set up — the enemy king near ${targetA} can be pulled into a deadly trap.`,
      `In this position a key enemy piece near ${targetA} can be forced onto a very bad square.`,
      `That is the idea near ${targetA} — lure the enemy king onto dangerous ground.`,
      `Right now near ${targetA} the enemy king can be baited onto a square where it is in serious trouble.`,
      `That luring move is available — the enemy king near ${targetA} can be attracted to a terrible square.`,
    ],
    'clearance': [
      `Right now on ${targetA} a piece is in the way of a much more powerful attack from behind — it needs to be cleared.`,
      `That clearance opportunity is on ${targetA} — one piece is blocking a stronger force that needs a clear path.`,
      `In this position on ${targetA} a piece is blocking an important line that needs to be opened.`,
      `That is the problem on ${targetA} — a piece is standing in the way of a much stronger piece behind it.`,
      `Right now a piece on ${targetA} is the only thing blocking a powerful attack from behind.`,
      `That clearance is needed on ${targetA} — moving one piece opens up a decisive attack from behind.`,
    ],
    'interference': [
      `Right now near ${targetA} two enemy defenders are linked — cutting that connection changes everything.`,
      `That interference move is available — near ${targetA} two defenders depend on each other and can be separated.`,
      `In this position near ${targetA} two enemy pieces are working together and their link can be blocked.`,
      `That is the key near ${targetA} — two defenders share a connection that can be cut with one move.`,
      `Right now two enemy defenders near ${targetA} protect each other — and that link can be severed.`,
      `That connection between the two defenders near ${targetA} can be broken with a well-placed move.`,
    ],
    'intermezzo': [
      `Right now near ${targetA} there is an urgent forcing threat that must be answered before anything else.`,
      `That in-between threat is sitting near ${targetA} — it is too forcing to be ignored.`,
      `In this position near ${targetA} a surprise forcing move must be played before the main plan continues.`,
      `That is the surprise near ${targetA} — a threat that demands an immediate answer.`,
      `Right now near ${targetA} a forcing move changes the whole picture before anything else happens.`,
      `That in-between surprise near ${targetA} cannot be ignored — it has to be dealt with right away.`,
    ],
    'double-check': [
      `Right now the enemy king on ${kingA} is in a position where two pieces can check it at once — it cannot block both.`,
      `That double check is ready — the enemy king on ${kingA} will face two attackers at the same time.`,
      `In this position the enemy king on ${kingA} can be hit by two checking pieces simultaneously.`,
      `That is exactly what is available — a double check on the enemy king sitting on ${kingA}.`,
      `Right now the enemy king on ${kingA} is set up to receive two checks at once with no good answer.`,
      `That double check is the key — the enemy king on ${kingA} cannot block two attackers at the same time.`,
      `Right now the enemy king on ${kingA} can be given two checks at once from around ${targetA}.`,
      `That double-check opportunity starts near ${targetA} and leaves the enemy king on ${kingA} with no answer.`,
      `In this position a double check from ${targetA} will hit the enemy king on ${kingA} from two directions.`,
      `That is the key — a piece near ${targetA} can deliver a double check the enemy king on ${kingA} cannot escape.`,
      `Right now near ${targetA} the right move delivers two simultaneous checks to the enemy king on ${kingA}.`,
      `That double check from ${targetA} will leave the enemy king on ${kingA} unable to block both attacks at once.`,
    ],
    'x-ray-attack': [
      `Right now on ${targetA} an x-ray line runs through one enemy piece to hit something more valuable behind it.`,
      `That x-ray attack is set up on ${targetA} — one piece is blocking a more important target hiding behind it.`,
      `In this position a line on ${targetA} goes through an enemy piece to threaten something precious behind it.`,
      `That is the x-ray idea on ${targetA} — hitting through one piece to reach something even more valuable.`,
      `Right now a line near ${targetA} passes through one enemy piece and strikes something important behind it.`,
      `That x-ray line is on ${targetA} — the attack works through an enemy piece to reach a more important target.`,
      `Right now an x-ray line from ${targetA} reaches all the way to the enemy king on ${kingA}.`,
      `That x-ray runs from ${targetA} through an enemy piece to threaten something precious near ${kingA}.`,
      `In this position the x-ray line through ${targetA} threatens the enemy king on ${kingA} as well.`,
      `That is the x-ray — a line through ${targetA} attacks both an enemy piece and threatens near ${kingA}.`,
      `Right now an x-ray from ${targetA} goes through one piece to hit something important near ${kingA}.`,
      `That x-ray line on ${targetA} reaches right through to threaten the enemy king on ${kingA}.`,
    ],
    'capturing-defender': [
      `Right now on ${targetA} ${capturedStr} is the only thing keeping a key target safe — and it can be taken.`,
      `That defender is right there on ${targetA} — ${capturedStr} is the only guard and it can be captured.`,
      `In this position removing ${capturedStr} on ${targetA} would leave a critical target completely unprotected.`,
      `That is the key: ${capturedStr} on ${targetA} is the sole defender, and it can be captured.`,
      `Right now ${capturedStr} on ${targetA} is carrying the entire defense — capture it and the target is free.`,
      `That single defender on ${targetA} is ${capturedStr} — take it away and the target has no one left.`,
    ],
    'sacrifice': [
      `Right now on ${targetA} giving up material there opens something far more important.`,
      `That sacrifice is available on ${targetA} — giving up a piece there gains something much bigger.`,
      `In this position offering a piece on ${targetA} will break through the enemy defense.`,
      `That is the key on ${targetA} — the material given away is worth less than what comes back.`,
      `Right now on ${targetA} a well-placed sacrifice opens the enemy position completely.`,
      `That sacrificial chance is on ${targetA} — what is given up is much smaller than what is gained.`,
    ],
    'trapped-piece': [
      `Right now an enemy piece on ${targetA} has no safe square to escape to — it is completely boxed in.`,
      `That trapped piece is on ${targetA} — it cannot find any safe square to move to.`,
      `In this position an enemy piece on ${targetA} is surrounded and has nowhere safe to go.`,
      `That is the situation on ${targetA} — a piece is trapped with no escape available.`,
      `Right now a piece on ${targetA} is stuck — every square it can reach is under attack.`,
      `That trapped condition is real on ${targetA} — the piece has no good square to flee to.`,
    ],
    'hanging-piece': [
      `Right now on ${targetA} ${capturedStr} is sitting completely unguarded.`,
      `That hanging piece is right there on ${targetA} — ${capturedStr} with nobody protecting it.`,
      `In this position ${capturedStr} on ${targetA} has zero defenders looking after it.`,
      `That is exactly the situation — ${capturedStr} on ${targetA} has no one guarding it at all.`,
      `Right now ${capturedStr} on ${targetA} is completely free to take — nobody is defending it.`,
      `That unprotected target is on ${targetA} — ${capturedStr} sitting there with no guard.`,
    ],
    'castling': [
      `Right now the enemy king on ${targetA} never castled and is stuck exposed in the open.`,
      `That is the problem — the enemy king on ${targetA} skipped castling and is now in real danger.`,
      `In this position the uncastled king on ${targetA} is exposed and open to attack.`,
      `That castling mistake is costing — the enemy king on ${targetA} has no safe shelter.`,
      `Right now the enemy king on ${targetA} is sitting in the open because it never found safety.`,
      `That exposed king on ${targetA} is the target — it never castled into safety.`,
    ],
    'zugzwang': [
      `Right now the enemy pieces near ${targetA} are in exactly that bind — any move they make gives something away.`,
      `That zugzwang pressure is real near ${targetA} — every possible enemy move hurts them.`,
      `In this position the enemy pieces near ${targetA} are so tied up that any move makes things worse.`,
      `That is exactly the situation near ${targetA} — the enemy would rather not move at all.`,
      `Right now near ${targetA} every enemy move is a bad one — that is the zugzwang at work.`,
      `That binding pressure is strongest near ${targetA} where every enemy move gives something away.`,
    ],
    'advanced-pawn': [
      `Right now a pawn on ${targetA} is already very close to the back row — nearly ready to become a queen.`,
      `That advanced pawn is on ${targetA} — so far forward that the opponent is struggling to stop it.`,
      `In this position the pawn on ${targetA} has raced ahead and is close to promoting.`,
      `That is the threat on ${targetA} — a pawn so advanced the enemy can barely slow it down.`,
      `Right now the pawn on ${targetA} is just a few steps from the back row and promotion.`,
      `That far-advanced pawn on ${targetA} is the key — it is nearly at the promotion square.`,
    ],
    'promotion': [
      `Right now a pawn on ${targetA} has made it all the way to the back row — it is ready to become a queen.`,
      `That promotion moment is here — a pawn on ${targetA} has reached the final rank.`,
      `In this position a pawn on ${targetA} is at the very last rank and about to promote.`,
      `That is the key moment — the pawn on ${targetA} has arrived at the back row.`,
      `Right now the pawn on ${targetA} is at the back row, one move from becoming a queen.`,
      `That promoting pawn is on ${targetA} — it has made it all the way to the last rank.`,
    ],
    'under-promotion': [
      `Right now a pawn on ${targetA} can reach the back row — but the right choice is not a queen.`,
      `That under-promotion is available on ${targetA} — promoting to a different piece sets up a special trick.`,
      `In this position the pawn on ${targetA} can promote, but the surprise is in which piece it becomes.`,
      `That is the trick on ${targetA} — a pawn can promote, and the best piece is not a queen.`,
      `Right now the pawn on ${targetA} is ready to promote — and choosing a different piece is the key.`,
      `That under-promotion on ${targetA} catches the enemy off guard — a queen is not what is needed here.`,
    ],
    'en-passant': [
      `Right now the enemy pawn that just arrived at ${targetA} moved two squares and is open to an en passant capture.`,
      `That en passant moment is right here — the pawn on ${targetA} just moved two squares and can be taken.`,
      `In this position the pawn on ${targetA} moved two squares forward and left itself open to en passant.`,
      `That is exactly when en passant works — the pawn on ${targetA} just moved two squares and can be captured.`,
      `Right now the pawn on ${targetA} just moved two squares and the en passant window is open.`,
      `That en passant chance is right here — the pawn just arrived at ${targetA} by moving two squares.`,
    ],
  };

  const openingSets = {
    'french-defense': [
      `Right now that tight French Defense structure has left a weakness on ${targetA} that can be seized.`,
      `That French Defense squeeze has created a concrete target on ${targetA} — the time to strike is now.`,
      `In this French Defense position ${targetA} is where the cramped pieces have created a real opening.`,
      `That is why ${targetA} is the key area — the French Defense structure has a vulnerability right there.`,
      `Right now the French Defense tension has reached a breaking point on ${targetA}.`,
      `That typical French Defense weakness has shown up on ${targetA} — it can be exploited right now.`,
      `In this position the French Defense pawn chain has left a target on ${targetA}.`,
      `That French Defense pressure has found its outlet on ${targetA} — the moment has arrived.`,
    ],
    'ruy-lopez': [
      `Right now the Ruy Lopez pressure has paid off — there is a target on ${targetA} with too little support.`,
      `That Ruy Lopez tension has created a concrete weakness on ${targetA} — it can be struck now.`,
      `In this Ruy Lopez position ${targetA} is where the long-term pressure has left a real target.`,
      `That is why ${targetA} is key — the Ruy Lopez pressure has left something vulnerable there.`,
      `Right now the Ruy Lopez build-up has reached a tipping point on ${targetA}.`,
      `That Ruy Lopez piece pressure has left something on ${targetA} without enough support.`,
      `In this position the Ruy Lopez attack has opened up a concrete chance on ${targetA}.`,
      `That Ruy Lopez squeeze has left a real target on ${targetA} — the moment to act has arrived.`,
    ],
    'sicilian-defense': [
      `Right now the sharp Sicilian Defense play has created a tactical opportunity on ${targetA}.`,
      `That Sicilian Defense energy has produced a real target on ${targetA} — this is the sharp moment.`,
      `In this Sicilian Defense position ${targetA} is where the aggressive play has left something exposed.`,
      `That is why ${targetA} is key — the Sicilian Defense dynamics have created a weakness there.`,
      `Right now the Sicilian Defense complexity has come to a head on ${targetA}.`,
      `That Sicilian Defense tension has found its focus on ${targetA} — a concrete target is waiting.`,
      `In this position the Sicilian Defense open lines have created a real threat on ${targetA}.`,
      `That sharp Sicilian Defense position has left something vulnerable on ${targetA} right now.`,
    ],
    'caro-kann-defense': [
      `Right now the Caro-Kann Defense structure has a weakness on ${targetA} that active play can exploit.`,
      `That solid Caro-Kann Defense setup has a crack on ${targetA} — the time to hit it is now.`,
      `In this Caro-Kann Defense position ${targetA} is where the active pieces have found a real target.`,
      `That is why ${targetA} is the key area — the Caro-Kann Defense structure has a vulnerability there.`,
      `Right now the Caro-Kann Defense position has a tactical trick hiding on ${targetA}.`,
      `That Caro-Kann Defense pawn setup has left a piece on ${targetA} in a tricky spot.`,
      `In this position the Caro-Kann Defense structure has created an opening on ${targetA}.`,
      `That Caro-Kann Defense solid foundation has a hidden weakness on ${targetA} right now.`,
    ],
    'italian-game': [
      `Right now the Italian Game bishop pressure has created a real target on ${targetA}.`,
      `That Italian Game attacking setup has found a weakness on ${targetA} where the defense has been stretched.`,
      `In this Italian Game position ${targetA} is where the fast piece development has left something exposed.`,
      `That is why ${targetA} is the key area — the Italian Game pressure has created a concrete target there.`,
      `Right now the Italian Game attacking pieces have found their target on ${targetA}.`,
      `That Italian Game bishop pressure has left something on ${targetA} without enough protection.`,
      `In this position the Italian Game open lines are pointing directly at a target on ${targetA}.`,
      `That Italian Game speed of development has left something vulnerable on ${targetA}.`,
    ],
    'queens-gambit-declined': [
      `Right now the Queen's Gambit pressure has created a concrete target on ${targetA}.`,
      `That Queen's Gambit piece activity has found a real weakness on ${targetA} — the moment to act is now.`,
      `In this Queen's Gambit position ${targetA} is where the central pressure has left something exposed.`,
      `That is why ${targetA} is key — the Queen's Gambit tension has created a vulnerability there.`,
      `Right now the Queen's Gambit central control has turned into a concrete target on ${targetA}.`,
      `That Queen's Gambit pressure has paid off — there is a real opening on ${targetA}.`,
      `In this position the Queen's Gambit piece play has left a target on ${targetA}.`,
      `That Queen's Gambit active play has found its outlet on ${targetA} right now.`,
    ],
    'philidor-defense': [
      `Right now the Philidor Defense's cramped structure has left a weakness on ${targetA}.`,
      `That Philidor Defense pawn setup has left a piece on ${targetA} in a dangerous spot.`,
      `In this Philidor Defense position ${targetA} is where the passive play has created a real target.`,
      `That is why ${targetA} is key — the Philidor Defense structure has a weakness right there.`,
      `Right now the Philidor Defense position has a tactical trick hiding on ${targetA}.`,
      `That Philidor Defense cramped setup has left something on ${targetA} without enough support.`,
      `In this position the Philidor Defense pawn structure has created a vulnerability on ${targetA}.`,
      `That Philidor Defense passive approach has left a real target sitting on ${targetA}.`,
    ],
    'four-knights-defense': [
      `Right now the Four Knights Defense active pieces have created a concrete target on ${targetA}.`,
      `That Four Knights Defense lively play has produced a real opening on ${targetA}.`,
      `In this Four Knights Defense position ${targetA} is where the active piece play has left something exposed.`,
      `That is why ${targetA} is the key area — the Four Knights Defense play has created a weakness there.`,
      `Right now the Four Knights Defense energy has found a tactical opportunity on ${targetA}.`,
      `That Four Knights Defense knight activity has created a target on ${targetA}.`,
      `In this position the Four Knights Defense active pieces have found a weakness on ${targetA}.`,
      `That Four Knights Defense sharp play has left something vulnerable on ${targetA} right now.`,
    ],
    'kings-gambit-accepted': [
      `Right now the King's Gambit energy has built up into a real attacking chance on ${targetA}.`,
      `That King's Gambit pawn sacrifice has paid off — the open lines are pointing at ${targetA}.`,
      `In this King's Gambit position ${targetA} is where the fast development has found a real target.`,
      `That is why ${targetA} is key — the King's Gambit attack has created a weakness there.`,
      `Right now the King's Gambit open files have focused the attack on ${targetA}.`,
      `That King's Gambit early sacrifice has created a real threat on ${targetA}.`,
      `In this position the King's Gambit attacking pieces have found their target on ${targetA}.`,
      `That King's Gambit pressure has turned into a concrete attacking chance on ${targetA}.`,
    ],
    'damiano-defense': [
      `Right now the Damiano Defense's risky play has left a real target on ${targetA}.`,
      `That Damiano Defense weakness has turned into a concrete vulnerability on ${targetA}.`,
      `In this Damiano Defense position ${targetA} is where the risky setup has left something exposed.`,
      `That is why ${targetA} is key — the Damiano Defense has created a real weakness there.`,
      `Right now the Damiano Defense's shaky structure has left a target on ${targetA}.`,
      `That Damiano Defense opening has left something on ${targetA} without enough protection.`,
      `In this position the Damiano Defense risky approach has created an opening on ${targetA}.`,
      `That Damiano Defense vulnerability on ${targetA} can be struck right now.`,
    ],
    'vienna-game': [
      `Right now the Vienna Game's central pressure has built into a real target on ${targetA}.`,
      `That Vienna Game attacking setup has found a weakness on ${targetA} — the time to strike is now.`,
      `In this Vienna Game position ${targetA} is where the central control has created a concrete target.`,
      `That is why ${targetA} is key — the Vienna Game pressure has left something vulnerable there.`,
      `Right now the Vienna Game center control has turned into a real attacking chance on ${targetA}.`,
      `That Vienna Game piece activity has created a target on ${targetA}.`,
      `In this position the Vienna Game aggressive setup has found a weakness on ${targetA}.`,
      `That Vienna Game pressure has paid off with a real target sitting on ${targetA}.`,
    ],
    'pawn-endgame': [
      `Right now the pawn on ${targetA} is the key to this endgame — that is where the winning move is.`,
      `That critical pawn moment is on ${targetA} — one move here decides who promotes first.`,
      `In this pawn endgame ${targetA} is where a single pawn move changes everything.`,
      `That is why ${targetA} matters most — in a pawn endgame every single move is the difference.`,
      `Right now the pawn on ${targetA} can make the decisive difference in this endgame.`,
      `That pawn on ${targetA} holds the answer — one move with it decides the whole game.`,
      `In this position the key pawn action is happening on ${targetA} right now.`,
      `That pawn endgame decision is on ${targetA} — get this right and the game is won.`,
    ],
    'queen-endgame': [
      `Right now the queen on ${targetA} is the most powerful piece on the board — that is where the game is decided.`,
      `That queen endgame tension is focused on ${targetA} — one accurate move with the queen decides everything.`,
      `In this queen endgame ${targetA} is where the powerful queen can deliver a decisive blow.`,
      `That is why ${targetA} is key — the queen's enormous range makes a target there very hard to defend.`,
      `Right now the queen's power is pointing at ${targetA} — that is where the winning idea lives.`,
      `That queen endgame precision is needed on ${targetA} — one exact move wins the game.`,
      `In this position the queen on ${targetA} creates a threat the enemy cannot handle.`,
      `That queen endgame moment is on ${targetA} — one accurate move here converts the advantage.`,
    ],
    'english-opening': [
      `Right now the English Opening's flank control has created a real target on ${targetA}.`,
      `That English Opening tension has found a concrete weakness on ${targetA} — the time to act is now.`,
      `In this English Opening position ${targetA} is where the flexible setup has left something exposed.`,
      `That is why ${targetA} is the key area — the English Opening has created a vulnerability there.`,
      `Right now the English Opening piece play has built up into a real chance on ${targetA}.`,
      `That English Opening pressure has paid off — there is a real target sitting on ${targetA}.`,
      `In this position the English Opening's central tension has left something vulnerable on ${targetA}.`,
      `That English Opening flexibility has found its outlet on ${targetA} right now.`,
    ],
    'scandinavian-defense': [
      `Right now the Scandinavian Defense's aggressive early challenge has created a target on ${targetA}.`,
      `That Scandinavian Defense tension has opened up a real weakness on ${targetA}.`,
      `In this Scandinavian Defense position ${targetA} is where the active play has left something exposed.`,
      `That is why ${targetA} is key — the Scandinavian Defense has created a vulnerability there.`,
      `Right now the Scandinavian Defense energy has found a concrete target on ${targetA}.`,
      `That Scandinavian Defense open play has left something on ${targetA} without enough support.`,
      `In this position the Scandinavian Defense active pieces have found a weakness on ${targetA}.`,
      `That Scandinavian Defense early center challenge has created a real chance on ${targetA}.`,
    ],
    'scotch-game': [
      `Right now the Scotch Game's early center strike has opened up a real target on ${targetA}.`,
      `That Scotch Game tension has created a concrete weakness on ${targetA} — the time to strike is now.`,
      `In this Scotch Game position ${targetA} is where the open center has left something exposed.`,
      `That is why ${targetA} is key — the Scotch Game's open lines have created a vulnerability there.`,
      `Right now the Scotch Game's active piece play has found a target on ${targetA}.`,
      `That Scotch Game early central action has left something on ${targetA} without enough support.`,
      `In this position the Scotch Game open lines are pointing directly at a target on ${targetA}.`,
      `That Scotch Game tactical sharpness has found its focus on ${targetA} right now.`,
    ],
    'modern-defense': [
      `Right now the Modern Defense's counter-attacking plan has created a real target on ${targetA}.`,
      `That Modern Defense tension has found a concrete weakness on ${targetA} — the moment to act is now.`,
      `In this Modern Defense position ${targetA} is where the big center has become vulnerable.`,
      `That is why ${targetA} is key — the Modern Defense counter-play has created a weakness there.`,
      `Right now the Modern Defense's side attack has found its outlet on ${targetA}.`,
      `That Modern Defense counter-strike has left something on ${targetA} open to attack.`,
      `In this position the Modern Defense's flexible setup has created a real chance on ${targetA}.`,
      `That Modern Defense counter-play has reached a critical point on ${targetA} right now.`,
    ],
    'pirc-defense': [
      `Right now the Pirc Defense's careful counter-play has created a real target on ${targetA}.`,
      `That Pirc Defense tension has found a concrete weakness on ${targetA} — the time to act is now.`,
      `In this Pirc Defense position ${targetA} is where the careful piece development has left something exposed.`,
      `That is why ${targetA} is key — the Pirc Defense counter-play has created a vulnerability there.`,
      `Right now the Pirc Defense's tricky counter-attacking setup has found a target on ${targetA}.`,
      `That Pirc Defense flexible approach has left something on ${targetA} open to a tactical shot.`,
      `In this position the Pirc Defense's patient play has created a real opening on ${targetA}.`,
      `That Pirc Defense counter-strike has found its focus on ${targetA} right now.`,
    ],
    'rapport-jobava-system': [
      `Right now the Rapport-Jobava System's aggressive development has created a real target on ${targetA}.`,
      `That Rapport-Jobava attacking setup has found a weakness on ${targetA} — the time to strike is now.`,
      `In this Rapport-Jobava position ${targetA} is where the fast piece development has left something exposed.`,
      `That is why ${targetA} is key — the Rapport-Jobava System's early attack has created a vulnerability there.`,
      `Right now the Rapport-Jobava System's quick pieces have built up a real attacking chance on ${targetA}.`,
      `That Rapport-Jobava aggressive setup has left something on ${targetA} without enough protection.`,
      `In this position the Rapport-Jobava System's attacking pieces have found a target on ${targetA}.`,
      `That Rapport-Jobava System pressure has paid off with a real threat on ${targetA} right now.`,
    ],
    'queen-rook-endgame': [
      `Right now the queen and rook on ${targetA} are combining their power to create a decisive threat.`,
      `That queen and rook coordination is focused on ${targetA} — together they create a threat the enemy cannot stop.`,
      `In this queen and rook endgame ${targetA} is where the combined power of both pieces creates a winning idea.`,
      `That is why ${targetA} is the key area — the queen and rook together are targeting a weakness there.`,
      `Right now the queen and rook are both pointing at ${targetA} — that combined force is impossible to defend.`,
      `That queen-rook teamwork has found its focus on ${targetA} where a decisive blow can be landed.`,
      `In this position the queen and rook are working together to create a winning threat on ${targetA}.`,
      `That queen and rook power is concentrated on ${targetA} — one accurate move delivers the winning blow.`,
    ],
    'knight-endgame': [
      `Right now the knight near ${targetA} can do something surprising that the enemy king cannot handle.`,
      `That tricky knight move is happening near ${targetA} — knights jump in unexpected directions.`,
      `In this knight endgame ${targetA} is where the knight's odd movement creates a decisive trick.`,
      `That is why ${targetA} is the key area — a knight move here outmaneuvers the enemy king.`,
      `Right now the knight near ${targetA} is in position to do something the enemy cannot answer.`,
      `That knight endgame trick is on ${targetA} — the knight's unusual movement makes it hard to stop.`,
      `In this position the knight near ${targetA} can reach a square the enemy king cannot cover.`,
      `That knight endgame moment is on ${targetA} — one jumping move changes the whole situation.`,
    ],
  };

  return sets[category] || openingSets[category] || [
    `Right now the key area to watch is ${targetA}.`,
    `That is where the action is — something important is happening on ${targetA}.`,
    `In this position ${targetA} holds the key to the next move.`,
    `Right now there is a weakness on ${targetA} that can be targeted immediately.`,
    `That is why ${targetA} is the most important area on the board right now.`,
    `In this position the tension has reached a breaking point on ${targetA}.`,
    `Right now something critical is happening on ${targetA}.`,
    `That moment has arrived — ${targetA} is where the key move will happen.`,
  ];
}

// ── build hint 1 ──────────────────────────────────────────────────────────────

// Categories with category-specific tactic clue templates — prefer tacticClues over materialClues
const PREFER_TACTIC_CLUES = new Set([
  'fork','pin','skewer','discovered-attack','deflection','attraction','clearance',
  'interference','intermezzo','double-check','x-ray-attack','capturing-defender',
  'sacrifice','trapped-piece','hanging-piece','castling','zugzwang',
  'advanced-pawn','promotion','under-promotion','en-passant',
  'french-defense','ruy-lopez','sicilian-defense','caro-kann-defense','italian-game',
  'queens-gambit-declined','philidor-defense','four-knights-defense',
  'kings-gambit-accepted','damiano-defense','vienna-game','pawn-endgame',
  'queen-endgame','knight-endgame',
  'english-opening','scandinavian-defense','scotch-game','modern-defense',
  'pirc-defense','rapport-jobava-system','queen-rook-endgame',
]);

function buildHint1(category, move, game, urlSeed, variant) {
  const principle = PRINCIPLES[category];
  if (!principle) return null;

  let clues;
  let posKey = move?.to || '';

  const isMateCategory = [
    'arabian-mate','bodens-mate','anastasia-mate','double-bishop-mate',
    'dovetail-mate','hook-mate','smothered-mate','back-rank-mate',
  ].includes(category);

  if (isMateCategory && game && move) {
    const profile = kingProfile(game, move);
    posKey = `${profile.kingSquare}:${profile.blockedSides.sort().join(',')}:${profile.safeCount}`;
    clues = kingClues(profile);
  } else if (PREFER_TACTIC_CLUES.has(category) && move && game) {
    // Use category-specific templates so sentence 2 connects to sentence 1
    clues = tacticClues(category, move, game);
  } else if (move?.captured && game) {
    // Fallback: material-based clue for categories without specific templates
    clues = materialClues(move, game);
  } else {
    clues = tacticClues(category, move, game);
  }

  // XOR url-seed with position-seed: same board features but different URLs → different variant picks
  const combinedSeed = urlSeed ^ hash(posKey);
  const areaClue = pick(clues, combinedSeed, variant);
  return `${principle} ${areaClue}`;
}

// ── validation (mirrors audit_hint1.js) ──────────────────────────────────────

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
  'rapport-jobava-system': ['rapport', 'jobava'],
  'queen-rook-endgame': ['queen and rook', 'queen-rook'],
};

const VAGUE = [
  'force the issue','big clue','find the move','best move','right move','strong move here',
  'material weaknesses matter when one target lacks steady support',
  'loose targets become vulnerable when their guards are stretched thin',
  'a hanging target is vulnerable when nearby cover is unreliable',
  'trapped kings become vulnerable when escape routes are sealed',
  'back-line shelter becomes fragile when flight squares disappear',
  'a cramped king is vulnerable when nearby cover blocks escape',
  'king safety becomes vulnerable when the shelter has loose cover',
  'forcing threats matter when the king has little room',
];

function getSentences(hint) {
  return String(hint || '').split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
}

function validate(hint, category, game, move) {
  const issues = [];
  const ss = getSentences(hint);
  const lower = hint.toLowerCase();

  if (/[\r\n]/.test(hint)) issues.push('has-line-break');
  if (ss.length !== 2) issues.push(`wrong-sentence-count:${ss.length}`);
  if (/\b[a-h][1-8]\b/i.test(hint)) issues.push('square-id');
  if (/[;:]/.test(hint)) issues.push('dense-punctuation');
  if (VAGUE.some(v => lower.includes(v))) issues.push('vague-phrase');

  const kws = CATEGORY_KEYWORDS[category];
  if (kws && ss.length >= 1 && !kws.some(kw => ss[0].toLowerCase().includes(kw))) {
    issues.push('category-not-named');
  }

  // Sentence 2 must open with a connecting bridge phrase
  if (ss.length >= 2 && !/^(Right now|That |In this )/.test(ss[1])) {
    issues.push('missing-bridge');
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

  // collect all failing entries
  const allFailing = [];
  const categoryAreaClues = {}; // track area clues already in data per category

  Object.entries(data).forEach(([cat, cd]) => {
    if (!cd?.puzzles) return;
    Object.entries(cd.puzzles).forEach(([url, puz]) => {
      if (!Array.isArray(puz?.moveHints)) return;
      const fen = parseFen(url);
      const moves = splitMoves(puz.answer);

      puz.moveHints.forEach((g, gi) => {
        if (!Array.isArray(g) || typeof g[0] !== 'string') return;
        const hint = g[0];

        // track existing area clues for uniqueness
        const sentences = getSentences(hint);
        const s2 = sentences[1] || '';
        if (s2) {
          if (!categoryAreaClues[cat]) categoryAreaClues[cat] = new Map();
          categoryAreaClues[cat].set(s2, (categoryAreaClues[cat].get(s2) || 0) + 1);
        }

        // check if this hint needs rewriting
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

        const issues = validate(hint, cat, game, move);
        const s2Count = categoryAreaClues[cat]?.get(s2) || 0;
        const isDuplicate = s2 && s2Count >= 3;

        if (issues.length > 0 || isDuplicate) {
          allFailing.push({ cat, url, gi, fen, moves, currentHint: hint });
        }
      });
    });
  });

  const batch = allFailing.slice(0, BATCH_SIZE);
  console.log(`\nFound ${allFailing.length} failing hint 1s. Processing first ${batch.length}.\n`);

  let passCount = 0;
  let failCount = 0;
  const updates = []; // {cat, url, gi, newHint}

  batch.forEach(({ cat, url, gi, fen, moves, currentHint }) => {
    const seed = hash(`${cat}|${url}|${gi}`);
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

    // Temporarily remove this hint's area clue from the global count so we
    // don't penalise the replacement for the text it is replacing.
    const currentS2 = getSentences(currentHint)[1] || '';
    if (currentS2 && categoryAreaClues[cat]) {
      const n = categoryAreaClues[cat].get(currentS2) || 0;
      if (n <= 1) categoryAreaClues[cat].delete(currentS2);
      else categoryAreaClues[cat].set(currentS2, n - 1);
    }

    // Try up to 24 template variants; skip any whose sentence 2 would create
    // a 3rd+ duplicate in this category across the whole dataset.
    let chosen = null;
    for (let variant = 0; variant < 24; variant++) {
      const candidate = buildHint1(cat, move, game, seed, variant);
      if (!candidate) break;

      const issues = validate(candidate, cat, game, move);
      if (issues.length > 0) continue;

      const candidateS2 = getSentences(candidate)[1] || '';
      const existingCount = candidateS2 ? (categoryAreaClues[cat]?.get(candidateS2) || 0) : 0;
      if (existingCount >= 2) continue; // would become a 3rd duplicate

      chosen = candidate;
      break;
    }

    if (chosen) {
      // Register this sentence 2 so later puzzles in the batch avoid it
      const chosenS2 = getSentences(chosen)[1] || '';
      if (chosenS2) {
        if (!categoryAreaClues[cat]) categoryAreaClues[cat] = new Map();
        categoryAreaClues[cat].set(chosenS2, (categoryAreaClues[cat].get(chosenS2) || 0) + 1);
      }
      updates.push({ cat, url, gi, newHint: chosen });
      passCount++;
    } else {
      console.log(`  SKIP  ${cat} ${gi} (no valid variant found)`);
      failCount++;
      // Restore the original count since we didn't replace it
      if (currentS2) {
        if (!categoryAreaClues[cat]) categoryAreaClues[cat] = new Map();
        categoryAreaClues[cat].set(currentS2, (categoryAreaClues[cat].get(currentS2) || 0) + 1);
      }
    }
  });

  // write updates to data
  updates.forEach(({ cat, url, gi, newHint }) => {
    data[cat].puzzles[url].moveHints[gi][0] = newHint;
  });

  fs.writeFileSync(DATASET_PATH, JSON.stringify(data, null, 2));

  console.log(`\nResults:`);
  console.log(`  Updated : ${passCount} hint 1s`);
  console.log(`  Skipped : ${failCount} (no principle or no valid variant)`);
  console.log(`\nWrote to puzzles.json.\n`);

  // show 2 random updated hints
  if (updates.length >= 2) {
    const picks = [
      updates[Math.floor(updates.length * 0.2)],
      updates[Math.floor(updates.length * 0.7)],
    ];
    console.log('── Sample updated hint 1s ──────────────────────────────────────\n');
    picks.forEach(({ cat, url, gi, newHint }) => {
      console.log(`Category : ${cat}`);
      console.log(`Group    : ${gi}`);
      console.log(`Hint 1   : "${newHint}"`);
      console.log('');
    });
  }
}

main();
