#!/usr/bin/env node
'use strict';
/**
 * audit_hint1.js
 *
 * Audits all hint 1s in puzzles.json against the rules in HINT_ARCHITECTURE_RULES.md.
 *
 * Full audit:   node audit_hint1.js
 * Single test:  node audit_hint1.js --hint "..." --category fork --url "..." --group 0
 */

const fs   = require('fs');
const path = require('path');
const { Chess } = require('./game/node_modules/chess.js');

const DATASET_PATH = path.resolve(__dirname, 'game', 'public', 'puzzles.json');
const FILES = 'abcdefgh';

// ── board helpers ─────────────────────────────────────────────────────────────

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };
function pieceValue(code) {
  return PIECE_VALUES[String(code || '').toLowerCase()] || 1;
}

function parseFenFromLichessUrl(url) {
  const marker = 'lichess.org/analysis/';
  const idx = String(url || '').indexOf(marker);
  if (idx === -1) return null;
  let fen = String(url).slice(idx + marker.length).split('?')[0];
  if (fen.startsWith('standard/')) fen = fen.slice('standard/'.length);
  return decodeURIComponent(fen).replace(/_/g, ' ').trim();
}

function splitMoves(answer) {
  return String(answer || '').split(',').map(m => m.trim()).filter(Boolean);
}

function oppositeColor(c) { return c === 'w' ? 'b' : 'w'; }

function toSquare(fi, rank) {
  if (fi < 0 || fi >= 8 || rank < 1 || rank > 8) return null;
  return `${FILES[fi]}${rank}`;
}

function findKingSquare(game, color) {
  for (const row of game.board()) {
    for (const piece of row) {
      if (piece && piece.type === 'k' && piece.color === color) return piece.square;
    }
  }
  return null;
}

function kingEscapeProfile(game, move) {
  const enemyColor = oppositeColor(move.color);
  const kingSquare = findKingSquare(game, enemyColor);
  if (!kingSquare) return { blockedSides: [], safeCount: 0, kingSquare: null };
  const fi   = FILES.indexOf(kingSquare[0]);
  const rank = Number(kingSquare[1]);
  const dirs = [
    { dx: -1, dy: -1, side: 'left'    }, { dx: -1, dy: 0, side: 'left'    }, { dx: -1, dy: 1, side: 'left'    },
    { dx:  1, dy: -1, side: 'right'   }, { dx:  1, dy: 0, side: 'right'   }, { dx:  1, dy: 1, side: 'right'   },
    { dx:  0, dy: enemyColor === 'w' ?  1 : -1, side: 'forward' },
    { dx:  0, dy: enemyColor === 'w' ? -1 :  1, side: 'back'    },
  ];
  const totals = { left: 0, right: 0, forward: 0, back: 0 };
  const safe   = { left: 0, right: 0, forward: 0, back: 0 };
  let safeCount = 0;
  dirs.forEach(({ dx, dy, side }) => {
    const sq = toSquare(fi + dx, rank + dy);
    if (!sq) return;
    totals[side]++;
    const occ = game.get(sq);
    if (occ && occ.color === enemyColor) return;   // blocked by own piece
    if (game.isAttacked(sq, move.color)) return;   // controlled by attacker
    safe[side]++; safeCount++;
  });
  const blockedSides = Object.keys(totals).filter(s => totals[s] > 0 && safe[s] === 0);
  return { blockedSides, safeCount, kingSquare };
}

// ── known vague/banned phrases (from puzzleHints.js VAGUE_MOVE_HINT_PATTERNS) ─

const VAGUE_PHRASES = [
  'force the issue', 'big clue', 'danger is visible', 'find the move',
  'best move', 'right move', 'strong move here', 'tactical idea',
  'material weaknesses matter when one target lacks steady support',
  'loose targets become vulnerable when their guards are stretched thin',
  'a hanging target is vulnerable when nearby cover is unreliable',
  'trapped kings become vulnerable when escape routes are sealed',
  'back-line shelter becomes fragile when flight squares disappear',
  'a cramped king is vulnerable when nearby cover blocks escape',
  'king safety becomes vulnerable when the shelter has loose cover',
  'forcing threats matter when the king has little room',
  'a king under thin cover is vulnerable to tempo pressure',
];

// ── category → required keyword(s) in sentence 1 ─────────────────────────────

const CATEGORY_KEYWORDS = {
  'back-rank-mate':     ['back-rank', 'back rank', 'back row'],
  'smothered-mate':     ['smothered'],
  'anastasia-mate':     ['anastasia'],
  'arabian-mate':       ['arabian'],
  'bodens-mate':        ['boden'],
  'double-bishop-mate': ['double-bishop', 'double bishop'],
  'dovetail-mate':      ['dovetail'],
  'hook-mate':          ['hook'],
  'fork':               ['fork'],
  'pin':                ['pin'],
  'skewer':             ['skewer'],
  'discovered-attack':  ['discover'],
  'deflection':         ['deflect'],
  'hanging-piece':      ['hanging', 'undefended', 'no defender'],
  'trapped-piece':      ['trap'],
  'attraction':         ['attract', 'lure'],
  'clearance':          ['clearance', 'clear the way'],
  'interference':       ['interfer'],
  'intermezzo':         ['intermezzo', 'zwischenzug', 'in-between'],
  'double-check':       ['double check', 'two checks'],
  'x-ray-attack':       ['x-ray'],
  'capturing-defender': ['captur', 'remov', 'eliminat'],
  'sacrifice':          ['sacrific'],
  'under-promotion':    ['under-promot', 'promote to'],
  'en-passant':         ['en passant', 'en-passant'],
  'castling':           ['castl'],
  'zugzwang':           ['zugzwang'],
  'advanced-pawn':      ['pawn', 'pass'],
  'promotion':          ['promot', 'queen'],
  'french-defense':     ['french'],
  'ruy-lopez':          ['ruy lopez', 'ruy-lopez', 'spanish'],
  'sicilian-defense':   ['sicilian'],
  'caro-kann-defense':  ['caro-kann', 'caro kann'],
  'italian-game':       ['italian'],
  'queens-gambit-declined': ["queen's gambit", 'queens gambit'],
  'philidor-defense':   ['philidor'],
  'four-knights-defense': ['four knight', 'four-knight'],
  'kings-gambit-accepted': ["king's gambit", 'kings gambit'],
  'damiano-defense':    ['damiano'],
  'vienna-game':        ['vienna'],
  'pawn-endgame':       ['pawn endgame', 'only pawns', 'pawns and kings'],
  'queen-endgame':      ['queen endgame'],
  'knight-endgame':     ['knight endgame'],
  'english-opening':    ['english'],
  'scandinavian-defense': ['scandinavian'],
  'scotch-game':        ['scotch'],
  'modern-defense':     ['modern defense'],
  'pirc-defense':       ['pirc'],
  'rapport-jobava-system': ['rapport', 'jobava'],
  'queen-rook-endgame': ['queen and rook', 'queen-rook'],
};

// ── sentence helpers ──────────────────────────────────────────────────────────

function getSentences(hint) {
  return String(hint || '').split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
}

// ── core check function ───────────────────────────────────────────────────────

/**
 * Run all hint-1 checks.
 * @param {string} hint         - The hint 1 text.
 * @param {object} ctx
 * @param {string} ctx.category - Puzzle category slug.
 * @param {object} [ctx.game]   - chess.js instance BEFORE the player move.
 * @param {object} [ctx.move]   - chess.js move object for the player move.
 * @returns {Array<{code, detail}>}
 */
function checkHint1(hint, { category, game, move }) {
  const failures = [];
  const sentences = getSentences(hint);
  const lower = String(hint).toLowerCase();

  // ── structural rules ──

  // No line breaks
  if (/[\r\n]/.test(hint)) {
    failures.push({ code: 'has-line-break', detail: 'hint contains a newline character' });
  }

  // Exactly 2 sentences
  if (sentences.length !== 2) {
    failures.push({ code: 'wrong-sentence-count', detail: `${sentences.length} sentence(s), expected exactly 2` });
  }

  // No square IDs
  const sqId = String(hint).match(/\b[a-h][1-8]\b/i);
  if (sqId) {
    failures.push({ code: 'square-id', detail: `contains "${sqId[0]}"` });
  }

  // No dense punctuation
  const punct = String(hint).match(/[;:]/);
  if (punct) {
    failures.push({ code: 'dense-punctuation', detail: `contains "${punct[0]}"` });
  }

  // No known vague/banned phrases
  const vagueHit = VAGUE_PHRASES.find(p => lower.includes(p.toLowerCase()));
  if (vagueHit) {
    failures.push({ code: 'vague-phrase', detail: `contains banned phrase: "${vagueHit}"` });
  }

  // ── bridge rule: sentence 2 must open with a connecting phrase ──

  const sentences2 = sentences[1] || '';
  if (sentences2 && !/^(Right now|That |In this )/.test(sentences2)) {
    failures.push({
      code: 'missing-bridge',
      detail: 'sentence 2 does not start with a connecting phrase (Right now / That / In this)',
    });
  }

  // ── category rule ──

  const keywords = CATEGORY_KEYWORDS[category];
  if (keywords && sentences.length >= 1) {
    const s1 = sentences[0].toLowerCase();
    if (!keywords.some(kw => s1.includes(kw.toLowerCase()))) {
      failures.push({
        code: 'category-not-named',
        detail: `sentence 1 must mention one of [${keywords.join(' / ')}]`,
      });
    }
  }

  // ── board-fact rules ──

  // Piece value accuracy (for capture moves)
  if (move?.captured) {
    const actualPts = pieceValue(move.captured);
    for (const m of lower.matchAll(/(\d+)\s*point/g)) {
      const mentioned = parseInt(m[1], 10);
      if (mentioned !== actualPts) {
        failures.push({
          code: 'wrong-piece-value',
          detail: `says "${mentioned} point" but the captured piece (${move.captured}) is worth ${actualPts}pt`,
        });
      }
    }
  }

  // King escape side accuracy
  if (game && move) {
    const sideMatch = lower.match(
      /no safe (?:exit|escape|square)(?:\s+to(?:\s+the)?)?\s+(left|right|forward|back)/
    );
    if (sideMatch) {
      const mentionedSide = sideMatch[1];
      const profile = kingEscapeProfile(game, move);
      if (!profile.blockedSides.includes(mentionedSide)) {
        failures.push({
          code: 'wrong-king-escape-side',
          detail: `says "${mentionedSide}" is blocked but actual blocked sides: [${profile.blockedSides.join(', ') || 'none'}]`,
        });
      }
    }
  }

  return failures;
}

// ── data collection ───────────────────────────────────────────────────────────

function collectEntries(data) {
  const entries = [];
  Object.entries(data).forEach(([category, catData]) => {
    if (!catData?.puzzles) return;
    Object.entries(catData.puzzles).forEach(([url, puzzle]) => {
      if (!Array.isArray(puzzle?.moveHints)) return;
      const fen = parseFenFromLichessUrl(url);
      if (!fen) return;
      const answerMoves = splitMoves(puzzle.answer);
      puzzle.moveHints.forEach((group, groupIndex) => {
        if (!Array.isArray(group)) return;
        const hint1 = group[0];
        if (typeof hint1 !== 'string') return;

        // replay board up to this player move
        let game = null;
        let move = null;
        try {
          const replay = new Chess(fen);
          const playerAnswerIdx = groupIndex * 2;
          for (let i = 0; i < playerAnswerIdx; i++) {
            if (!replay.move(answerMoves[i])) break;
          }
          game = new Chess(replay.fen());
          const raw = replay.move(answerMoves[playerAnswerIdx]);
          if (raw) move = raw;
        } catch { /* skip bad FEN / illegal moves */ }

        entries.push({ category, url, groupIndex, hint1, game, move });
      });
    });
  });
  return entries;
}

// ── full audit ────────────────────────────────────────────────────────────────

function runFullAudit(data) {
  const entries = collectEntries(data);

  // first pass: collect area-clue sentences per category for uniqueness check
  const categoryAreaClues = {};
  entries.forEach(({ category, hint1 }) => {
    const sentences = getSentences(hint1);
    const s2 = sentences[1] || '';
    if (!s2) return;
    if (!categoryAreaClues[category]) categoryAreaClues[category] = {};
    categoryAreaClues[category][s2] = (categoryAreaClues[category][s2] || 0) + 1;
  });

  let total = 0;
  const allFailures = [];
  const codeCount  = {};

  // second pass: run checks + uniqueness
  entries.forEach(({ category, url, groupIndex, hint1, game, move }) => {
    total++;
    const failures = checkHint1(hint1, { category, game, move });

    // uniqueness: flag if this area clue is shared by 3+ puzzles in the category
    const sentences = getSentences(hint1);
    const s2 = sentences[1] || '';
    const dupCount = categoryAreaClues[category]?.[s2] || 0;
    if (s2 && dupCount >= 3) {
      failures.push({
        code: 'duplicate-area-clue',
        detail: `sentence 2 is identical in ${dupCount} puzzles in "${category}"`,
      });
    }

    if (failures.length > 0) {
      allFailures.push({ category, url, groupIndex, hint1, failures });
      failures.forEach(f => { codeCount[f.code] = (codeCount[f.code] || 0) + 1; });
    }
  });

  // ── report ──

  console.log('\n=== HINT 1 AUDIT REPORT ===\n');
  console.log(`Total hint 1s checked:    ${total}`);
  console.log(`Failing at least one rule: ${allFailures.length} (${pct(allFailures.length, total)}%)`);
  console.log(`Passing all rules:         ${total - allFailures.length} (${pct(total - allFailures.length, total)}%)\n`);

  console.log('--- Failures by rule ---');
  Object.entries(codeCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, count]) => {
      console.log(`  ${pad(code, 28)}  ${count} hint(s)  (${pct(count, total)}%)`);
    });

  console.log('\n--- Examples (up to 2 per rule) ---');
  const shown = {};
  allFailures.forEach(({ category, url, groupIndex, hint1, failures }) => {
    failures.forEach(f => {
      if ((shown[f.code] || 0) >= 2) return;
      shown[f.code] = (shown[f.code] || 0) + 1;
      const n = shown[f.code];
      console.log(`\n  [${f.code}] #${n}`);
      console.log(`    category : ${category}`);
      console.log(`    group    : ${groupIndex}`);
      console.log(`    hint     : "${hint1}"`);
      console.log(`    problem  : ${f.detail}`);
    });
  });

  console.log('\n=== END REPORT ===\n');
}

// ── single-hint test ──────────────────────────────────────────────────────────

function runSingleTest({ hint, category, url, groupIndex, data }) {
  const fen = parseFenFromLichessUrl(url);
  let game = null;
  let move = null;
  if (fen) {
    const catData = data[category];
    const puzzle  = catData?.puzzles?.[url];
    const answerMoves = splitMoves(puzzle?.answer || '');
    try {
      const replay = new Chess(fen);
      const playerAnswerIdx = groupIndex * 2;
      for (let i = 0; i < playerAnswerIdx; i++) replay.move(answerMoves[i]);
      game = new Chess(replay.fen());
      const raw = replay.move(answerMoves[playerAnswerIdx]);
      if (raw) move = raw;
    } catch {}
  }

  const failures = checkHint1(hint, { category, game, move });

  console.log('\n=== SINGLE HINT 1 AUDIT ===\n');
  console.log(`Category : ${category}`);
  console.log(`Group    : ${groupIndex}`);
  console.log(`Hint     : "${hint}"\n`);

  if (failures.length === 0) {
    console.log('Result: PASS — all checks passed');
  } else {
    console.log(`Result: FAIL — ${failures.length} issue(s):`);
    failures.forEach(f => console.log(`  [${f.code}] ${f.detail}`));
  }
  console.log('\n=== END ===\n');
}

// ── helpers ───────────────────────────────────────────────────────────────────

function pct(n, total) { return total ? Math.round(n / total * 100) : 0; }
function pad(s, len)   { return String(s).padEnd(len); }

// ── entry point ───────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const data = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));

  const hintIdx     = args.indexOf('--hint');
  const categoryIdx = args.indexOf('--category');
  const urlIdx      = args.indexOf('--url');
  const groupIdx    = args.indexOf('--group');

  if (hintIdx !== -1) {
    runSingleTest({
      hint:       args[hintIdx + 1],
      category:   args[categoryIdx + 1] || '',
      url:        args[urlIdx + 1] || '',
      groupIndex: parseInt(args[groupIdx + 1] || '0', 10),
      data,
    });
  } else {
    runFullAudit(data);
  }
}

main();
