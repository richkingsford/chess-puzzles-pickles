#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Chess } = require('./game/node_modules/chess.js');

const DATASET_PATH = path.resolve(__dirname, 'game', 'public', 'puzzles.json');
const DEFAULT_BATCH_SIZE = 50;
const FILES = 'abcdefgh';

const PIECE_NAMES = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king'
};

const PIECE_VALUES = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9
};

const ABSTRACT_MATERIAL_PHRASES = [
  'Loose targets become vulnerable when their guards are stretched thin',
  'A hanging target is vulnerable when nearby cover is unreliable',
  'Material weaknesses matter when one target lacks steady support'
];

const ABSTRACT_KING_PHRASES = [
  'Trapped kings become vulnerable when escape routes are sealed',
  'Back-line shelter becomes fragile when flight squares disappear',
  'A cramped king is vulnerable when nearby cover blocks escape',
  'King safety becomes vulnerable when the shelter has loose cover',
  'Forcing threats matter when the king has little room',
  'A king under thin cover is vulnerable to tempo pressure'
];

const ABSTRACT_OTHER_PHRASES = [
  'Race positions become vulnerable when the defender is one step late',
  'Opening coordination is vulnerable when the back line is unsettled',
  'King safety turns fragile when the center is still loose',
  'Endgame balance breaks when two weaknesses stretch one side',
  'Endgames turn fragile when one defender lacks a spare tempo',
  'Promotion races become vulnerable when the back line is late',
  'Unfinished development is vulnerable when central cover is thin',
  'Advanced passers become dangerous when the defense lacks time',
  'A queening race turns fragile when the stopper is stretched',
  'Tactical weaknesses grow when loose cover surrounds a target',
  'Shared lines become fragile when defenders depend on one path',
  'Quiet positions become fragile when one area lacks steady support',
  'Weak coordination becomes vulnerable when defenders cannot share duties',
  'Limited exits become vulnerable when retreat squares disappear',
  'Pinned lines become vulnerable when a guard cannot freely leave',
  'A front target becomes fragile when another target waits behind it',
  'Line control matters when a thin cover piece blocks pressure',
  'Hidden lines become vulnerable when only one blocker remains',
  'A trapped unit is fragile when every escape path is watched',
  'A tied defender becomes fragile when something valuable sits behind it',
  'Line pressure matters when one defender is stuck in place',
  'Poor mobility becomes a weakness when the edges close in',
  'Crowded targets become vulnerable when spacing disappears',
  'Fork patterns grow from targets that cannot both stay safe',
  'Clustered valuables become fragile when one tempo can touch both',
  'Stacked targets become vulnerable when the front one must move',
  'Skewer patterns appear when valuables share the same line',
  'Overloaded guards become vulnerable when one defender has too many jobs',
  'A key guard turns fragile when several duties pull on it',
  'Defensive balance breaks when one guard protects too much'
];

function splitMoves(answer) {
  return String(answer || '')
    .split(',')
    .map((move) => move.trim())
    .filter(Boolean);
}

function parseFenFromLichessUrl(url) {
  const marker = 'lichess.org/analysis/';
  const markerIndex = String(url || '').indexOf(marker);
  if (markerIndex === -1) return null;

  let fen = String(url).slice(markerIndex + marker.length).split('?')[0];
  if (fen.startsWith('standard/')) {
    fen = fen.slice('standard/'.length);
  }

  return decodeURIComponent(fen).replace(/_/g, ' ').trim();
}

function normalizeTag(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function hashString(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pick(seed, options, salt = 0) {
  return options[(seed + salt) % options.length];
}

function isCheck(game) {
  return typeof game?.isCheck === 'function' ? game.isCheck() : false;
}

function isCheckmate(game) {
  return typeof game?.isCheckmate === 'function' ? game.isCheckmate() : false;
}

function oppositeColor(color) {
  return color === 'w' ? 'b' : 'w';
}

function pieceValue(pieceCode) {
  return PIECE_VALUES[String(pieceCode || '').toLowerCase()] || 1;
}

function isEndgameCategory(category) {
  const key = normalizeTag(category);
  return key.includes('endgame') || key.includes('equality') || key.includes('zugzwang');
}

function squareParts(square) {
  const fileIndex = FILES.indexOf(String(square || '')[0]);
  const rank = Number(String(square || '')[1]);
  return { fileIndex, rank };
}

function flankName(square) {
  const { fileIndex } = squareParts(square);
  if (fileIndex <= 2) return 'left flank';
  if (fileIndex >= 5) return 'right flank';
  return 'center files';
}

function rankBand(square) {
  const { rank } = squareParts(square);
  if (rank <= 2 || rank >= 7) return 'back line';
  if (rank <= 3 || rank >= 6) return 'outer ranks';
  return 'middle ranks';
}

function areaFromSquare(square) {
  if (!square || FILES.indexOf(String(square)[0]) === -1) {
    return 'central area';
  }

  const flank = flankName(square);
  const band = rankBand(square);

  if (flank === 'center files' && band === 'back line') return 'center back line';
  if (flank === 'center files' && band === 'outer ranks') return 'central outer ranks';
  if (flank === 'center files' && band === 'middle ranks') return 'center of the middle ranks';
  if (band === 'middle ranks') return `${flank} in the middle ranks`;
  return `${flank} ${band}`;
}

function findKingSquare(game, color) {
  const board = game.board();
  for (const row of board) {
    for (const piece of row) {
      if (piece && piece.type === 'k' && piece.color === color) {
        return piece.square;
      }
    }
  }

  return null;
}

function moveIsDiagonal(move) {
  const from = squareParts(move.from);
  const to = squareParts(move.to);
  return Math.abs(from.fileIndex - to.fileIndex) === Math.abs(from.rank - to.rank);
}

function moveIsStraight(move) {
  const from = squareParts(move.from);
  const to = squareParts(move.to);
  return from.fileIndex === to.fileIndex || from.rank === to.rank;
}

function getFeature(context) {
  const flags = String(context.move.flags || '');
  if (context.move.promotion || context.san.includes('=')) return 'promotion';
  if (context.isMate) return 'mate';
  if (context.givesCheck) return 'check';
  if (flags.includes('k') || flags.includes('q') || /^O-O/.test(context.san)) return 'castling';
  if (context.move.captured) return 'capture';
  if (isEndgameCategory(context.category)) return 'endgame';
  return 'quiet';
}

function getTacticFamily(category) {
  const key = normalizeTag(category);
  if (key.includes('back-rank') || key.includes('smothered') || key.includes('mate')) return 'mate';
  if (key.includes('pin')) return 'pin';
  if (key.includes('fork')) return 'fork';
  if (key.includes('skewer')) return 'skewer';
  if (key.includes('x-ray') || key.includes('discovered') || key.includes('clearance') || key.includes('interference')) return 'line';
  if (key.includes('deflection') || key.includes('capturing-defender') || key.includes('attraction')) return 'overload';
  if (key.includes('hanging-piece')) return 'loose';
  if (key.includes('trapped-piece')) return 'trapped';
  if (key.includes('promotion') || key.includes('advanced-pawn') || key.includes('under-promotion')) return 'promotion';
  if (key.includes('endgame') || key.includes('equality') || key.includes('zugzwang')) return 'endgame';
  if (key.includes('opening') || key.includes('defense') || key.includes('gambit')) return 'opening';
  return 'tactic';
}

function getLineArea(context) {
  const targetArea = areaFromSquare(context.move.to);
  if (moveIsDiagonal(context.move)) return `long diagonal near the ${targetArea}`;
  if (moveIsStraight(context.move)) return `open line through the ${targetArea}`;
  return `jumping zone around the ${targetArea}`;
}

function getCapturedSquare(context) {
  const flags = String(context.move.flags || '');
  if (flags.includes('e')) {
    return `${String(context.move.to || '')[0]}${String(context.move.from || '')[1]}`;
  }

  return context.move.to;
}

function getSquareDistance(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const a = squareParts(left);
  const b = squareParts(right);
  return Math.max(Math.abs(a.fileIndex - b.fileIndex), Math.abs(a.rank - b.rank));
}

function toSquare(fileIndex, rank) {
  if (fileIndex < 0 || fileIndex >= FILES.length || rank < 1 || rank > 8) return null;
  return `${FILES[fileIndex]}${rank}`;
}

function getKingEscapeProfile(context) {
  const enemyColor = oppositeColor(context.move.color);
  const kingSquare = findKingSquare(context.beforeGame, enemyColor);
  const king = squareParts(kingSquare);
  const directions = [
    { dx: -1, dy: -1, side: 'left' },
    { dx: -1, dy: 0, side: 'left' },
    { dx: -1, dy: 1, side: 'left' },
    { dx: 1, dy: -1, side: 'right' },
    { dx: 1, dy: 0, side: 'right' },
    { dx: 1, dy: 1, side: 'right' },
    { dx: 0, dy: enemyColor === 'w' ? 1 : -1, side: 'forward' },
    { dx: 0, dy: enemyColor === 'w' ? -1 : 1, side: 'back' }
  ];
  const sideTotals = { left: 0, right: 0, forward: 0, back: 0 };
  const sideSafe = { left: 0, right: 0, forward: 0, back: 0 };
  let safeCount = 0;

  directions.forEach(({ dx, dy, side }) => {
    const square = toSquare(king.fileIndex + dx, king.rank + dy);
    if (!square) return;

    sideTotals[side] += 1;
    const occupant = context.beforeGame.get(square);
    const blockedByOwnSide = occupant && occupant.color === enemyColor;
    const attacked = context.beforeGame.isAttacked(square, context.move.color);

    if (!blockedByOwnSide && !attacked) {
      safeCount += 1;
      sideSafe[side] += 1;
    }
  });

  const blockedSides = Object.keys(sideTotals).filter((side) => sideTotals[side] > 0 && sideSafe[side] === 0);

  return {
    kingSquare,
    safeCount,
    blockedSides
  };
}

function getTargetDefenderCount(context) {
  const targetColor = oppositeColor(context.move.color);
  const targetSquare = getCapturedSquare(context);
  return context.beforeGame.attackers(targetSquare, targetColor).length;
}

function defenderPhrase(count) {
  if (count === 0) return 'no defenders';
  if (count === 1) return '1 defender';
  return `${count} defenders`;
}

function buildMaterialPrinciple(context) {
  const defenders = getTargetDefenderCount(context);

  if (defenders <= 2) {
    return 'A piece is vulnerable to capture when it has 0-2 defenders.';
  }

  return 'A guarded target can still fall when its defenders are tied down.';
}

function buildMaterialAreaClue(context) {
  const targetSquare = getCapturedSquare(context);
  const targetColor = oppositeColor(context.move.color);
  const targetValue = pieceValue(context.move.captured);
  const targetArea = areaFromSquare(targetSquare);
  const defenders = getTargetDefenderCount(context);
  const enemyKingSquare = findKingSquare(context.beforeGame, targetColor);
  const kingRelation = getSquareDistance(targetSquare, enemyKingSquare) <= 2
    ? ' near the enemy king'
    : '';

  return `The vulnerability is the ${targetValue} point target${kingRelation} on the ${targetArea} with ${defenderPhrase(defenders)}.`;
}

function escapeCountPhrase(count) {
  if (count === 0) return 'no safe escape squares';
  if (count === 1) return 'only 1 safe escape square';
  return `only ${count} safe escape squares`;
}

function buildKingPrinciple(context) {
  const category = normalizeTag(context.category);
  const feature = getFeature(context);

  if (category.includes('back-rank')) {
    return 'Back-rank mate happens when a king is trapped along its home row.';
  }

  if (category.includes('smothered')) {
    return 'Smothered mate happens when a king is boxed in by its own cover.';
  }

  if (category.includes('anastasia')) {
    return 'Anastasia mate works when one escape side is sealed by nearby cover.';
  }

  if (category.includes('boden')) {
    return 'Boden mate works when crossing diagonals seal the king.';
  }

  if (category.includes('double-bishop')) {
    return 'Double-bishop mate works when paired diagonals seal the king.';
  }

  if (category.includes('dovetail')) {
    return 'Dovetail mate works when nearby cover blocks both diagonal escapes.';
  }

  if (category.includes('hook')) {
    return 'Hook mate works when the king is pinned behind its own cover.';
  }

  if (feature === 'mate') {
    return 'A mating net works when the king has too few safe escapes.';
  }

  return 'King safety fails when escape squares and cover are both limited.';
}

function buildKingAreaClue(context) {
  const profile = getKingEscapeProfile(context);
  const kingArea = areaFromSquare(profile.kingSquare);
  const side = profile.blockedSides.find((candidate) => candidate === 'right' || candidate === 'left') ||
    profile.blockedSides[0];

  if (side === 'right' || side === 'left') {
    return `The enemy king sits on the ${kingArea} with no safe exit to the ${side}.`;
  }

  if (side === 'forward') {
    return `The enemy king sits on the ${kingArea} with no safe forward escape.`;
  }

  if (side === 'back') {
    return `The enemy king sits on the ${kingArea} with no safe back escape.`;
  }

  if (profile.safeCount > 2) {
    return `The cover around the enemy king on the ${kingArea} is thin.`;
  }

  return `The enemy king sits on the ${kingArea} with ${escapeCountPhrase(profile.safeCount)} nearby.`;
}

function buildPromotionPrinciple(context) {
  const targetArea = areaFromSquare(context.move.to);
  if (rankBand(context.move.to) === 'back line') {
    return 'A late stopper is vulnerable when a race reaches the back line.';
  }

  return 'A late stopper is vulnerable when a passer is close to queening.';
}

function buildPromotionAreaClue(context) {
  const targetArea = areaFromSquare(context.move.to);
  return `The vulnerability is the race lane on the ${targetArea}.`;
}

function buildEndgamePrinciple() {
  return 'An endgame defender is vulnerable when it has no spare tempo.';
}

function buildEndgameAreaClue(context) {
  const targetArea = areaFromSquare(context.move.to);
  return `The stretched point is on the ${targetArea}.`;
}

function buildOpeningPrinciple() {
  return 'Opening tactics appear when development lags and central cover is thin.';
}

function buildOpeningAreaClue(context) {
  return 'The vulnerable area is the center and unsettled back line.';
}

function buildPinPrinciple() {
  return 'A defender is vulnerable when it is stuck in front of something valuable.';
}

function buildPinAreaClue(context) {
  const targetArea = areaFromSquare(context.move.to);
  return `The tied-down line runs through the ${targetArea}.`;
}

function buildForkPrinciple() {
  return 'Two valuable targets are vulnerable when they stand too close together.';
}

function buildForkAreaClue(context) {
  const targetArea = areaFromSquare(context.move.to);
  return `The crowded targets sit around the ${targetArea}.`;
}

function buildSkewerPrinciple() {
  return 'Stacked targets are vulnerable when one valuable target shields another.';
}

function buildSkewerAreaClue(context) {
  return `The stacked line is the ${getLineArea(context)}.`;
}

function buildLinePrinciple() {
  return 'A line with one blocker is vulnerable when the path behind it is loaded.';
}

function buildLineAreaClue(context) {
  return `The vulnerable path is the ${getLineArea(context)}.`;
}

function buildOverloadPrinciple() {
  return 'A defender is vulnerable when it has more jobs than it can handle.';
}

function buildOverloadAreaClue(context) {
  const targetArea = areaFromSquare(context.move.to);
  return `The overworked guard is near the ${targetArea}.`;
}

function buildTrappedPrinciple() {
  return 'A target is vulnerable when its escape paths are blocked.';
}

function buildTrappedAreaClue(context) {
  const targetArea = areaFromSquare(context.move.to);
  return `The escape problem is around the ${targetArea}.`;
}

function buildQuietPrinciple() {
  return 'A weak area is vulnerable when nearby support is thin.';
}

function buildQuietAreaClue(context) {
  const targetArea = areaFromSquare(context.move.to);
  return `The vulnerable support sits near the ${targetArea}.`;
}

function buildPrinciple(context, seed) {
  const feature = getFeature(context);
  const family = getTacticFamily(context.category);

  if (feature === 'mate' || family === 'mate') {
    return buildKingPrinciple(context);
  }

  if (feature === 'check') {
    return buildKingPrinciple(context);
  }

  if (feature === 'promotion' || family === 'promotion') {
    return buildPromotionPrinciple(context);
  }

  if (feature === 'capture' || family === 'loose') {
    return buildMaterialPrinciple(context);
  }

  if (family === 'pin') {
    return buildPinPrinciple();
  }

  if (family === 'fork') {
    return buildForkPrinciple();
  }

  if (family === 'skewer') {
    return buildSkewerPrinciple();
  }

  if (family === 'line') {
    return buildLinePrinciple();
  }

  if (family === 'overload') {
    return buildOverloadPrinciple();
  }

  if (family === 'trapped') {
    return buildTrappedPrinciple();
  }

  if (feature === 'castling' || family === 'opening') {
    return buildOpeningPrinciple();
  }

  if (feature === 'endgame' || family === 'endgame') {
    return buildEndgamePrinciple();
  }

  return buildQuietPrinciple();
}

function buildAreaClue(context, seed) {
  const feature = getFeature(context);
  const family = getTacticFamily(context.category);
  const enemyColor = oppositeColor(context.move.color);
  const enemyKingSquare = findKingSquare(context.beforeGame, enemyColor);
  const enemyKingArea = areaFromSquare(enemyKingSquare);
  const targetArea = areaFromSquare(context.move.to);
  const lineArea = getLineArea(context);

  if (feature === 'mate' || family === 'mate') {
    return buildKingAreaClue(context);
  }

  if (feature === 'check') {
    return buildKingAreaClue(context);
  }

  if (feature === 'promotion' || family === 'promotion') {
    return buildPromotionAreaClue(context);
  }

  if (feature === 'capture') {
    return buildMaterialAreaClue(context);
  }

  if (family === 'pin') {
    return buildPinAreaClue(context);
  }

  if (family === 'fork') {
    return buildForkAreaClue(context);
  }

  if (family === 'skewer') {
    return buildSkewerAreaClue(context);
  }

  if (family === 'line') {
    return buildLineAreaClue(context);
  }

  if (family === 'overload') {
    return buildOverloadAreaClue(context);
  }

  if (family === 'trapped') {
    return buildTrappedAreaClue(context);
  }

  if (feature === 'castling' || family === 'opening') {
    return buildOpeningAreaClue(context);
  }

  if (feature === 'endgame' || family === 'endgame') {
    return buildEndgameAreaClue(context);
  }

  return buildQuietAreaClue(context);
}

function cleanHint(hint) {
  return String(hint || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.!?])/g, '$1')
    .trim();
}

function sentenceCount(hint) {
  return String(hint || '')
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .length;
}

function validateHint(hint) {
  const failures = [];
  if (sentenceCount(hint) !== 2) failures.push('not two sentences');
  if (/\b[a-h][1-8]\b/i.test(hint)) failures.push('contains square id');
  if (ABSTRACT_MATERIAL_PHRASES.some((phrase) => hint.includes(phrase))) failures.push('uses abstract material phrasing');
  if (ABSTRACT_KING_PHRASES.some((phrase) => hint.includes(phrase))) failures.push('uses abstract king phrasing');
  if (ABSTRACT_OTHER_PHRASES.some((phrase) => hint.includes(phrase))) failures.push('uses abstract tactical phrasing');
  if (/[;:]/.test(hint)) failures.push('dense punctuation');
  return failures;
}

function isMaterialCaptureContext(context) {
  return Boolean(context.move.captured);
}

function buildHintOne(context) {
  const seed = hashString([
    context.category,
    context.url,
    context.answer,
    context.groupIndex,
    context.san,
    context.beforeFen
  ].join('|'));
  const hint = cleanHint(`${buildPrinciple(context, seed)} ${buildAreaClue(context, seed)}`);
  const failures = validateHint(hint);

  if (failures.length) {
    throw new Error(`Generated invalid hint for ${context.category} move ${context.groupIndex + 1}: ${failures.join(', ')}: ${hint}`);
  }

  return hint;
}

function collectEntries(data) {
  const entries = [];

  Object.entries(data).forEach(([category, categoryData]) => {
    const puzzles = categoryData?.puzzles || {};

    Object.entries(puzzles).forEach(([url, puzzle]) => {
      if (!Array.isArray(puzzle?.moveHints)) return;

      const fen = parseFenFromLichessUrl(url);
      const answerMoves = splitMoves(puzzle.answer);
      if (!fen || !answerMoves.length) {
        throw new Error(`Cannot parse puzzle answer or FEN for ${category}: ${url}`);
      }

      let game;
      try {
        game = new Chess(fen);
      } catch (error) {
        throw new Error(`Invalid FEN for ${category}: ${error.message}`);
      }

      let playerMoveIndex = 0;
      answerMoves.forEach((san, answerMoveIndex) => {
        const beforeFen = game.fen();
        const beforeGame = new Chess(beforeFen);
        const move = game.move(san);

        if (!move) {
          throw new Error(`Illegal answer move ${san} for ${category}: ${url}`);
        }

        if (answerMoveIndex % 2 !== 0) return;

        const group = puzzle.moveHints[playerMoveIndex];
        if (!Array.isArray(group)) {
          throw new Error(`Missing moveHints group ${playerMoveIndex + 1} for ${category}: ${url}`);
        }

        entries.push({
          globalIndex: entries.length,
          category,
          url,
          puzzle,
          group,
          groupIndex: playerMoveIndex,
          answer: puzzle.answer,
          san,
          beforeFen,
          beforeGame,
          move,
          givesCheck: isCheck(game),
          isMate: isCheckmate(game)
        });

        playerMoveIndex += 1;
      });
    });
  });

  return entries;
}

function readDataset() {
  return JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
}

function writeDataset(data) {
  fs.writeFileSync(DATASET_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const checkOnly = argv.includes('--check');
  const materialOnly = argv.includes('--material-only') || argv.includes('--captures-only');
  const abstractMaterialOnly = argv.includes('--abstract-material-only');
  const abstractKingOnly = argv.includes('--abstract-king-only');
  const abstractOtherOnly = argv.includes('--abstract-other-only');
  const kingFallbackOnly = argv.includes('--king-fallback-only');
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const start = Number(positional[0] || 0);
  const count = Number(positional[1] || DEFAULT_BATCH_SIZE);

  if (!Number.isInteger(start) || start < 0) {
    throw new Error('Start index must be a non-negative integer.');
  }

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('Batch count must be a positive integer.');
  }

  return { start, count, dryRun, checkOnly, materialOnly, abstractMaterialOnly, abstractKingOnly, abstractOtherOnly, kingFallbackOnly };
}

function pickRandomSamples(entries, sampleCount = 2) {
  const uniqueByHint = [];
  const seenHints = new Set();
  entries.forEach((entry) => {
    const hint = entry.group?.[0] || '';
    if (seenHints.has(hint)) return;
    seenHints.add(hint);
    uniqueByHint.push(entry);
  });
  const pool = uniqueByHint.length >= sampleCount ? uniqueByHint : [...entries];
  const samples = [];

  while (pool.length && samples.length < sampleCount) {
    const index = Math.floor(Math.random() * pool.length);
    const [entry] = pool.splice(index, 1);
    samples.push(entry);
  }

  return samples;
}

function main() {
  const { start, count, dryRun, checkOnly, materialOnly, abstractMaterialOnly, abstractKingOnly, abstractOtherOnly, kingFallbackOnly } = parseArgs(process.argv.slice(2));
  const data = readDataset();
  const allEntries = collectEntries(data);
  const entries = kingFallbackOnly
    ? allEntries.filter((entry) => (
      entry.group[0]?.includes('The vulnerability is around the enemy king') ||
      entry.group[0]?.includes('The cover around the enemy king on the  is thin') ||
      /\bonly [3-8] safe escape squares nearby\b/.test(entry.group[0] || '')
    ))
    : abstractKingOnly
    ? allEntries.filter((entry) => ABSTRACT_KING_PHRASES.some((phrase) => entry.group[0]?.includes(phrase)))
    : abstractOtherOnly
      ? allEntries.filter((entry) => ABSTRACT_OTHER_PHRASES.some((phrase) => entry.group[0]?.includes(phrase)))
    : abstractMaterialOnly
    ? allEntries.filter((entry) => ABSTRACT_MATERIAL_PHRASES.some((phrase) => entry.group[0]?.includes(phrase)))
    : materialOnly
      ? allEntries.filter(isMaterialCaptureContext)
      : allEntries;
  const total = entries.length;
  const totalBatches = Math.ceil(total / count);

  if (checkOnly) {
    const failures = [];
    entries.forEach((entry) => {
      const hint = entry.group[0];
      const hintFailures = validateHint(hint);
      if (hintFailures.length) {
        failures.push({
          index: entry.globalIndex + 1,
          category: entry.category,
          group: entry.groupIndex + 1,
          failures: hintFailures,
          hint
        });
      }
    });

    if (failures.length) {
      console.error(`Hint 1 check failed for ${failures.length} of ${total} entries.`);
      failures.slice(0, 20).forEach((failure) => {
        console.error(`#${failure.index} ${failure.category} move ${failure.group}: ${failure.failures.join(', ')} -> ${failure.hint}`);
      });
      process.exit(1);
    }

    console.log(`Hint 1 check passed for ${total} entries.`);
    return;
  }

  if (start >= total) {
    console.log(`No entries to process. Start ${start} is beyond ${total}.`);
    return;
  }

  const batch = entries.slice(start, start + count);
  let changed = 0;
  let unchanged = 0;

  batch.forEach((entry) => {
    const nextHint = buildHintOne(entry);
    if (entry.group[0] === nextHint) {
      unchanged += 1;
    } else {
      entry.group[0] = nextHint;
      changed += 1;
    }
  });

  if (!dryRun) {
    writeDataset(data);
  }

  const end = start + batch.length;
  const batchNumber = Math.floor(start / count) + 1;
  const remaining = Math.max(0, total - end);
  const samples = pickRandomSamples(batch);
  console.log(`${dryRun ? 'Dry run' : 'Updated'} batch ${batchNumber}/${totalBatches}.`);
  console.log(`Entries ${start + 1}-${end} of ${total}. Changed ${changed}, unchanged ${unchanged}. Remaining ${remaining}.`);
  samples.forEach((entry, sampleIndex) => {
    console.log(`Sample ${sampleIndex + 1}: ${entry.category} move ${entry.groupIndex + 1}: ${entry.group[0]}`);
  });
}

main();
