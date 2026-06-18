#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Chess } = require('./game/node_modules/chess.js');

const DATASET_PATH = path.resolve(__dirname, 'game', 'public', 'puzzles.json');
const DEFAULT_BATCH_SIZE = 100;
const FILES = 'abcdefgh';

const PIECE_VALUES = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9
};

const PIECE_NAME_REGEX = /\b(?:king|queen|rook|bishop|knight|pawn)\b/i;
const SQUARE_ID_REGEX = /\b[a-h][1-8]\b/i;
const DIRECTIVE_REGEX = /\b(?:find|play|move|try|start|begin|use|search|look for)\b/i;
const OWN_SIDE_REGEX = /\b(?:your|our|my)\b/i;

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

function oppositeColor(color) {
  return color === 'w' ? 'b' : 'w';
}

function isCheck(game) {
  return typeof game?.isCheck === 'function' ? game.isCheck() : false;
}

function isCheckmate(game) {
  return typeof game?.isCheckmate === 'function' ? game.isCheckmate() : false;
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

function findRoyalSquare(game, color) {
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

function getRouteShape(context) {
  const piece = String(context.move.piece || '').toLowerCase();
  if (context.move.promotion || context.san.includes('=')) return 'race lane';
  if (piece === 'n') return 'jumping route';
  if (piece === 'k') return 'short-step route';
  if (moveIsDiagonal(context.move)) return 'diagonal route';
  if (moveIsStraight(context.move)) return 'straight route';
  return 'clean route';
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

function isEndgameCategory(category) {
  const key = normalizeTag(category);
  return key.includes('endgame') || key.includes('equality') || key.includes('zugzwang');
}

function getTacticFamily(category) {
  const key = normalizeTag(category);
  if (key.includes('back-rank') || key.includes('smothered') || key.includes('mate')) return 'mate';
  if (key.includes('pin')) return 'pin';
  if (key.includes('fork')) return 'fork';
  if (key.includes('skewer')) return 'skewer';
  if (key.includes('double-check')) return 'double-check';
  if (key.includes('x-ray') || key.includes('discovered') || key.includes('clearance') || key.includes('interference')) return 'line';
  if (key.includes('attraction')) return 'attraction';
  if (key.includes('deflection') || key.includes('capturing-defender')) return 'deflection';
  if (key.includes('sacrifice')) return 'sacrifice';
  if (key.includes('intermezzo')) return 'intermezzo';
  if (key.includes('hanging-piece')) return 'loose';
  if (key.includes('trapped-piece')) return 'trapped';
  if (key.includes('promotion') || key.includes('advanced-pawn') || key.includes('under-promotion')) return 'promotion';
  if (key.includes('endgame') || key.includes('equality') || key.includes('zugzwang')) return 'endgame';
  if (key.includes('opening') || key.includes('defense') || key.includes('gambit')) return 'opening';
  return 'tactic';
}

function opportunityLead(context) {
  if (context.isMate && context.groupIndex > 0) return 'The finishing opportunity is';
  if (context.groupIndex === 1) return 'The next opportunity is';
  if (context.groupIndex > 1) return 'The later opportunity is';
  return 'The opportunity is';
}

function getMateOpportunitySentence(context) {
  const key = normalizeTag(context.category);
  const lead = opportunityLead(context);
  const pressure = context.isMate ? 'closing pressure' : 'forcing pressure';

  if (key.includes('back-rank')) {
    return `${lead} ${pressure} on a back-line royal target with no clean exit.`;
  }

  if (key.includes('smothered')) {
    return `${lead} ${pressure} on a boxed-in royal target with its escape cover jammed.`;
  }

  if (key.includes('anastasia')) {
    return `${lead} ${pressure} on an edge-bound royal target with the side door sealed.`;
  }

  if (key.includes('arabian')) {
    return `${lead} ${pressure} on a cornered royal target with frozen cover nearby.`;
  }

  if (key.includes('boden')) {
    return `${lead} crossing-line pressure on a boxed-in royal target.`;
  }

  if (key.includes('double-bishop')) {
    return `${lead} crossing diagonal pressure on a boxed-in royal target.`;
  }

  if (key.includes('dovetail')) {
    return `${lead} pressure on a royal target whose diagonal exits are jammed.`;
  }

  if (key.includes('hook')) {
    return `${lead} pressure on a royal target hooked against its own cover.`;
  }

  return `${lead} ${pressure} on a boxed-in royal target.`;
}

function getMateSeeingSentence(context) {
  const key = normalizeTag(context.category);
  const route = getRouteShape(context);
  const royalArea = areaFromSquare(findRoyalSquare(context.beforeGame, oppositeColor(context.move.color)));

  if (key.includes('back-rank')) {
    return `Compare the back-line exits, then trace the ${route} into the sealed area on the ${royalArea}.`;
  }

  if (key.includes('smothered')) {
    return `Check the jammed exits around the ${royalArea}, then trace the ${route} into the net.`;
  }

  if (key.includes('anastasia')) {
    return `Compare the side-door escape near the ${royalArea}, then trace the ${route} into the net.`;
  }

  if (key.includes('arabian')) {
    return `Compare the corner exits around the ${royalArea}, then trace the ${route} into the net.`;
  }

  if (key.includes('boden') || key.includes('double-bishop')) {
    return `Trace the crossing lines toward the sealed area on the ${royalArea}.`;
  }

  if (key.includes('dovetail')) {
    return `Compare the diagonal exits around the ${royalArea}, then trace the ${route} into the net.`;
  }

  if (key.includes('hook')) {
    return `Compare the hooked escape side around the ${royalArea}, then trace the ${route} into the net.`;
  }

  return `Trace the ${route} toward the sealed escape area on the ${royalArea}.`;
}

function getCapturedSquare(context) {
  const flags = String(context.move.flags || '');
  if (flags.includes('e')) {
    return `${String(context.move.to || '')[0]}${String(context.move.from || '')[1]}`;
  }

  return context.move.to;
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

function pieceValue(pieceCode) {
  return PIECE_VALUES[String(pieceCode || '').toLowerCase()] || 1;
}

function buildOpportunitySentence(context) {
  const feature = getFeature(context);
  const family = getTacticFamily(context.category);
  const lead = opportunityLead(context);
  const targetArea = areaFromSquare(getCapturedSquare(context));
  const capturedValue = pieceValue(context.move.captured);
  const defenderCount = context.move.captured ? getTargetDefenderCount(context) : null;

  if (feature === 'mate' || family === 'mate') {
    return getMateOpportunitySentence(context);
  }

  if (family === 'double-check') {
    return `${lead} layered pressure from two routes at once.`;
  }

  if (family === 'pin') {
    return `${lead} pressure on a tied-down guard near the ${targetArea}.`;
  }

  if (family === 'fork') {
    if (context.move.captured) {
      return `${lead} a double attack centered on the ${capturedValue} point target with ${defenderPhrase(defenderCount)}.`;
    }

    return `${lead} a double attack on crowded targets.`;
  }

  if (family === 'skewer') {
    return `${lead} line pressure through stacked targets near the ${targetArea}.`;
  }

  if (family === 'line') {
    return `${lead} a loaded line through a narrow gap near the ${targetArea}.`;
  }

  if (family === 'attraction') {
    return `${lead} a lure toward a bad landing zone.`;
  }

  if (family === 'deflection') {
    return `${lead} pressure on a guard with one duty too many.`;
  }

  if (family === 'sacrifice') {
    return `${lead} a forcing tradeoff that exposes a bigger weakness.`;
  }

  if (family === 'intermezzo') {
    return `${lead} an in-between tempo before the obvious reply settles.`;
  }

  if (family === 'overload') {
    return `${lead} pressure on an overloaded guard with too many jobs.`;
  }

  if (family === 'trapped') {
    return `${lead} to tighten the escape net around a trapped target.`;
  }

  if (feature === 'check') {
    return `${lead} tempo pressure against a royal target with limited cover.`;
  }

  if (feature === 'capture') {
    return `${lead} a capture on the ${capturedValue} point target with ${defenderPhrase(defenderCount)}.`;
  }

  if (feature === 'promotion' || family === 'promotion') {
    return `${lead} a race lane breakthrough before the stopper catches up.`;
  }

  if (feature === 'castling' || family === 'opening') {
    return `${lead} a safety reset while the center is still thin.`;
  }

  if (family === 'endgame' || feature === 'endgame') {
    return `${lead} an endgame tempo problem for the stretched defender.`;
  }

  if (family === 'loose') {
    return `${lead} a capture on the under-defended target near the ${targetArea}.`;
  }

  return `${lead} a quiet threat before the defense can untangle.`;
}

function buildSeeingSentence(context) {
  const feature = getFeature(context);
  const family = getTacticFamily(context.category);
  const route = getRouteShape(context);
  const targetArea = areaFromSquare(getCapturedSquare(context));
  const royalArea = areaFromSquare(findRoyalSquare(context.beforeGame, oppositeColor(context.move.color)));

  if (feature === 'mate' || family === 'mate') {
    return getMateSeeingSentence(context);
  }

  if (family === 'double-check') {
    return `Trace both pressure routes toward the royal area and compare the available exits.`;
  }

  if (family === 'pin') {
    return `Trace the ${route} through the tied-down line and test whether the guard can leave.`;
  }

  if (family === 'fork') {
    return `Count the targets near the ${targetArea} and notice the shared landing zone.`;
  }

  if (family === 'skewer') {
    return `Trace the ${route} through the front target and notice what sits behind it.`;
  }

  if (family === 'line') {
    return `Trace the ${route} and notice the blocker that keeps the line closed.`;
  }

  if (family === 'attraction') {
    return `Compare the landing area near the ${targetArea} with the duty that gets loosened.`;
  }

  if (family === 'deflection') {
    return `Count the jobs held by the guard near the ${targetArea} and notice which duty drops.`;
  }

  if (family === 'sacrifice') {
    return `Compare what gets pulled away near the ${targetArea} with the pressure left behind.`;
  }

  if (family === 'intermezzo') {
    return `Compare the urgent response near the ${targetArea} with the threat left hanging.`;
  }

  if (family === 'overload') {
    return `Count the jobs held by the guard near the ${targetArea}.`;
  }

  if (family === 'trapped') {
    return `Compare the escape paths around the ${targetArea} and notice which one is missing.`;
  }

  if (feature === 'check') {
    return `Trace the ${route} toward the royal area and compare the available exits.`;
  }

  if (feature === 'capture') {
    return `Count the defenders around the ${targetArea}, then trace the ${route} that reaches it.`;
  }

  if (feature === 'promotion' || family === 'promotion') {
    return `Compare the race lane on the ${areaFromSquare(context.move.to)} with the nearest stopper.`;
  }

  if (feature === 'castling' || family === 'opening') {
    return 'Compare the exposed center with the safer side and notice the new lane.';
  }

  if (family === 'endgame' || feature === 'endgame') {
    return `Compare the tempo race around the ${targetArea} and notice which side must give way.`;
  }

  return `Trace the pressure around the ${targetArea} and notice the reply that fails.`;
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

function validateHint2(hint) {
  const failures = [];
  if (sentenceCount(hint) !== 2) failures.push('not two sentences');
  if (SQUARE_ID_REGEX.test(hint)) failures.push('contains square id');
  if (PIECE_NAME_REGEX.test(hint)) failures.push('names a piece');
  if (OWN_SIDE_REGEX.test(hint)) failures.push('points at own side');
  if (DIRECTIVE_REGEX.test(hint)) failures.push('uses direct move phrasing');
  if (/[;:]/.test(hint)) failures.push('dense punctuation');
  if (/\bbecause\b/i.test(hint)) failures.push('uses because');
  return failures;
}

function buildHintTwo(context) {
  const hint = cleanHint(`${buildOpportunitySentence(context)} ${buildSeeingSentence(context)}`);
  const failures = validateHint2(hint);

  if (failures.length) {
    throw new Error(`Generated invalid hint 2 for ${context.category} move ${context.groupIndex + 1}: ${failures.join(', ')}: ${hint}`);
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
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const start = Number(positional[0] || 0);
  const count = Number(positional[1] || DEFAULT_BATCH_SIZE);

  if (!Number.isInteger(start) || start < 0) {
    throw new Error('Start index must be a non-negative integer.');
  }

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('Batch count must be a positive integer.');
  }

  return { start, count, dryRun, checkOnly };
}

function pickRandomSamples(entries, sampleCount = 2) {
  const uniqueByHint = [];
  const seenHints = new Set();
  entries.forEach((entry) => {
    const hint = entry.group?.[1] || '';
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
  const { start, count, dryRun, checkOnly } = parseArgs(process.argv.slice(2));
  const data = readDataset();
  const entries = collectEntries(data);
  const total = entries.length;
  const totalBatches = Math.ceil(total / count);

  if (checkOnly) {
    const failures = [];
    const batch = entries.slice(start, start + count);
    batch.forEach((entry) => {
      const hint = entry.group[1];
      const hintFailures = validateHint2(hint);
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
      console.error(`Hint 2 check failed for ${failures.length} of ${batch.length} checked entries.`);
      failures.slice(0, 20).forEach((failure) => {
        console.error(`#${failure.index} ${failure.category} move ${failure.group}: ${failure.failures.join(', ')} -> ${failure.hint}`);
      });
      process.exit(1);
    }

    const end = start + batch.length;
    console.log(`Hint 2 check passed for entries ${start + 1}-${end} of ${total}.`);
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
    const previousHint = entry.group[1];
    const nextHint = buildHintTwo(entry);
    entry.previousHint = previousHint;
    entry.nextHint = nextHint;

    if (previousHint === nextHint) {
      unchanged += 1;
    } else {
      entry.group[1] = nextHint;
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
    console.log(`Sample ${sampleIndex + 1}: ${entry.category} move ${entry.groupIndex + 1}`);
    console.log(`  Before: ${entry.previousHint}`);
    console.log(`  After: ${entry.nextHint}`);
  });
}

main();
