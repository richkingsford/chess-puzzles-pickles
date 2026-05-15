const fs = require('fs');
const path = require('path');
const { Chess } = require('./game/node_modules/chess.js');

const args = process.argv.slice(2);
const inputPath = args[0] || 'game/public/puzzles.json';
const reportPath = args[1] || 'hint_between_piece_phrase_audit.json';
const batchSize = Number(args[2] || 500);
const applyIndex = args.indexOf('--apply');
const applyOutputPath = applyIndex >= 0 ? (args[applyIndex + 1] || inputPath) : null;

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedReport = path.resolve(process.cwd(), reportPath);
const resolvedApplyOutput = applyOutputPath
  ? path.resolve(process.cwd(), applyOutputPath)
  : null;

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
  q: 9,
  k: 100
};

const SLIDING_DIRECTIONS = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parsePuzzleUrl(url) {
  const marker = 'lichess.org/analysis/';
  const markerIndex = String(url || '').indexOf(marker);
  if (markerIndex === -1) return null;

  let fen = String(url).slice(markerIndex + marker.length);
  if (fen.startsWith('standard/')) {
    fen = fen.slice('standard/'.length);
  }

  const queryIndex = fen.indexOf('?');
  if (queryIndex !== -1) {
    fen = fen.slice(0, queryIndex);
  }

  return decodeURIComponent(fen).replace(/_/g, ' ').trim();
}

function getPuzzleMap(categoryData) {
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

function splitAnswerMoves(answer) {
  return String(answer || '')
    .split(',')
    .map((move) => move.trim())
    .filter(Boolean);
}

function squareToPoint(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return { file, rank };
}

function pointToSquare(file, rank) {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) {
    return null;
  }

  return `${String.fromCharCode(97 + file)}${rank + 1}`;
}

function getPiece(game, square) {
  return game.get(square);
}

function sign(value) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function sameDirection(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function getMoveDirection(from, to) {
  const start = squareToPoint(from);
  const end = squareToPoint(to);
  return [sign(end.rank - start.rank), sign(end.file - start.file)];
}

function getNextOccupiedAlong(game, from, direction) {
  const start = squareToPoint(from);
  let rank = start.rank + direction[0];
  let file = start.file + direction[1];

  while (rank >= 0 && rank <= 7 && file >= 0 && file <= 7) {
    const square = pointToSquare(file, rank);
    const piece = getPiece(game, square);

    if (piece) {
      return { square, piece };
    }

    rank += direction[0];
    file += direction[1];
  }

  return null;
}

function getFirstMove(fen, answer) {
  const firstSan = splitAnswerMoves(answer)[0];
  if (!firstSan || firstSan.includes('#')) {
    return null;
  }

  try {
    const replay = new Chess(fen);
    const move = replay.move(firstSan);
    return move ? { san: firstSan, move } : null;
  } catch (_error) {
    return null;
  }
}

function isTargetWorthCallingOut(piece) {
  return piece && piece.type !== 'k' && PIECE_VALUES[piece.type] >= 3;
}

function getLooseTargetDefenders(game, targetSquare, blockerSquare, targetColor) {
  if (typeof game.attackers !== 'function') {
    return [];
  }

  return game.attackers(targetSquare, targetColor).filter((square) => square !== blockerSquare);
}

function findBetweenPieceCandidate(row) {
  const fen = parsePuzzleUrl(row.url);
  if (!fen) {
    return { candidate: null, skippedReason: 'invalid-fen-url' };
  }

  let game;
  try {
    game = new Chess(fen);
  } catch (error) {
    return { candidate: null, skippedReason: 'invalid-fen', error: error.message };
  }

  const firstMove = getFirstMove(fen, row.answer);
  if (!firstMove) {
    return { candidate: null, skippedReason: 'no-playable-nonmate-first-move' };
  }

  const { san, move } = firstMove;
  const movingPiece = getPiece(game, move.from);
  const blocker = getPiece(game, move.to);

  if (!movingPiece || !blocker || !move.captured) {
    return { candidate: null, skippedReason: 'first-move-is-not-capture' };
  }

  if (!SLIDING_DIRECTIONS[movingPiece.type]) {
    return { candidate: null, skippedReason: 'first-move-piece-is-not-slider' };
  }

  if (movingPiece.color === blocker.color) {
    return { candidate: null, skippedReason: 'capture-target-not-opponent' };
  }

  const direction = getMoveDirection(move.from, move.to);
  const validDirection = SLIDING_DIRECTIONS[movingPiece.type].some((candidateDirection) => (
    sameDirection(candidateDirection, direction)
  ));

  if (!validDirection) {
    return { candidate: null, skippedReason: 'capture-not-on-slider-line' };
  }

  const target = getNextOccupiedAlong(game, move.to, direction);
  if (!target || target.piece.color !== blocker.color || !isTargetWorthCallingOut(target.piece)) {
    return { candidate: null, skippedReason: 'no-high-value-opponent-target-behind-blocker' };
  }

  const defenders = getLooseTargetDefenders(game, target.square, move.to, blocker.color);
  if (defenders.length > 0) {
    return {
      candidate: null,
      skippedReason: 'target-has-other-defenders',
      defenderSquares: defenders
    };
  }

  const sliderName = PIECE_NAMES[movingPiece.type];
  const blockerName = PIECE_NAMES[blocker.type];
  const targetName = PIECE_NAMES[target.piece.type];
  const standingBetweenHint = `The enemy ${blockerName} is the only thing standing between your ${sliderName} and their unprotected ${targetName}.`;
  const blockerCaptureHint = 'Make the forcing capture on that blocker.';

  return {
    candidate: {
      category: row.category,
      puzzleIndex: row.puzzleIndex,
      url: row.url,
      answer: row.answer,
      tags: row.tags,
      firstMove: san,
      slider: {
        square: move.from,
        piece: sliderName
      },
      blocker: {
        square: move.to,
        piece: blockerName
      },
      target: {
        square: target.square,
        piece: targetName
      },
      targetDefendersExcludingBlocker: defenders,
      currentHint3: row.hints[2] || null,
      currentHint4: row.hints[3] || null,
      proposedHint3: standingBetweenHint,
      proposedHint4: blockerCaptureHint,
      canApply: (
        row.hints.length >= 4 &&
        /^Start with your \w+ to force the issue\.$/i.test(row.hints[2] || '') &&
        /^Make the .+ with that \w+\.$/i.test(row.hints[3] || '')
      )
    }
  };
}

function flattenPuzzles(data) {
  const rows = [];
  let globalHintIndex = 0;
  let puzzleIndex = 0;

  for (const [category, categoryData] of Object.entries(data)) {
    const puzzles = getPuzzleMap(categoryData);

    for (const [url, puzzleData] of Object.entries(puzzles)) {
      const hints = Array.isArray(puzzleData?.hints) ? puzzleData.hints : [];

      rows.push({
        puzzleIndex,
        category,
        url,
        answer: String(puzzleData?.answer || ''),
        tags: Array.isArray(puzzleData?.tags) ? puzzleData.tags : [],
        puzzleData,
        hints,
        hintStart: globalHintIndex
      });

      globalHintIndex += hints.length;
      puzzleIndex += 1;
    }
  }

  return rows;
}

function summarize(candidates, skippedRows) {
  const byCategory = {};
  const bySlider = {};
  const byBlocker = {};
  const byTarget = {};
  const bySkippedReason = {};

  candidates.forEach((candidate) => {
    byCategory[candidate.category] = (byCategory[candidate.category] || 0) + 1;
    bySlider[candidate.slider.piece] = (bySlider[candidate.slider.piece] || 0) + 1;
    byBlocker[candidate.blocker.piece] = (byBlocker[candidate.blocker.piece] || 0) + 1;
    byTarget[candidate.target.piece] = (byTarget[candidate.target.piece] || 0) + 1;
  });

  skippedRows.forEach((row) => {
    bySkippedReason[row.skippedReason] = (bySkippedReason[row.skippedReason] || 0) + 1;
  });

  return { byCategory, bySlider, byBlocker, byTarget, bySkippedReason };
}

function buildBatches(rows, candidates) {
  const totalHints = rows.reduce((sum, row) => sum + row.hints.length, 0);
  const totalBatches = Math.ceil(totalHints / batchSize);
  const batches = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const hintStart = batchIndex * batchSize;
    const hintEnd = Math.min(totalHints - 1, hintStart + batchSize - 1);
    const batchCandidates = candidates.filter((candidate) => {
      const hint3GlobalIndex = rows[candidate.puzzleIndex]?.hintStart + 2;
      return hint3GlobalIndex >= hintStart && hint3GlobalIndex <= hintEnd;
    });

    batches.push({
      batchIndex,
      hintStart,
      hintEnd,
      hintCount: hintEnd >= hintStart ? hintEnd - hintStart + 1 : 0,
      candidateCount: batchCandidates.length,
      appliedCount: batchCandidates.filter((candidate) => candidate.applied).length,
      candidates: batchCandidates
    });
  }

  return batches;
}

function applyCandidates(candidates, rows) {
  candidates.forEach((candidate) => {
    if (!candidate.canApply) {
      candidate.applied = false;
      candidate.notAppliedReason = 'existing-hints-did-not-match-generic-template';
      return;
    }

    const row = rows[candidate.puzzleIndex];
    if (!row?.puzzleData || !Array.isArray(row.puzzleData.hints)) {
      candidate.applied = false;
      candidate.notAppliedReason = 'missing-hints-array';
      return;
    }

    row.puzzleData.hints[2] = candidate.proposedHint3;
    row.puzzleData.hints[3] = candidate.proposedHint4;
    candidate.applied = true;
    candidate.appliedHintNumbers = [3, 4];
  });
}

function main() {
  const data = readJson(resolvedInput);
  const rows = flattenPuzzles(data);
  const candidates = [];
  const skippedRows = [];

  rows.forEach((row) => {
    const result = findBetweenPieceCandidate(row);
    if (result.candidate) {
      candidates.push(result.candidate);
    } else {
      skippedRows.push({
        category: row.category,
        puzzleIndex: row.puzzleIndex,
        url: row.url,
        answer: row.answer,
        skippedReason: result.skippedReason,
        ...(result.defenderSquares ? { defenderSquares: result.defenderSquares } : {}),
        ...(result.error ? { error: result.error } : {})
      });
    }
  });

  if (resolvedApplyOutput) {
    applyCandidates(candidates, rows);
    fs.writeFileSync(resolvedApplyOutput, `${JSON.stringify(data, null, 2)}\n`);
  } else {
    candidates.forEach((candidate) => {
      candidate.applied = false;
    });
  }

  const report = {
    inputFile: resolvedInput,
    outputFile: resolvedReport,
    appliedOutputFile: resolvedApplyOutput,
    evaluatedAt: new Date().toISOString(),
    auditVersion: 1,
    phrasePattern: 'The enemy [blocker] is the only thing standing between your [slider] and their unprotected [target].',
    candidateDefinition: 'First move is a queen, rook, or bishop capture of an enemy blocker, with a higher-value loose enemy piece directly behind it on the same line.',
    batchSizeHints: batchSize,
    puzzleCount: rows.length,
    candidateCount: candidates.length,
    applicableCandidateCount: candidates.filter((candidate) => candidate.canApply).length,
    appliedCount: candidates.filter((candidate) => candidate.applied).length,
    summary: summarize(candidates, skippedRows),
    batches: buildBatches(rows, candidates),
    skippedRows
  };

  fs.writeFileSync(resolvedReport, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${candidates.length} between-piece phrase candidates to ${resolvedReport}`);
  console.log(JSON.stringify({
    puzzleCount: report.puzzleCount,
    candidateCount: report.candidateCount,
    applicableCandidateCount: report.applicableCandidateCount,
    appliedCount: report.appliedCount,
    summary: report.summary
  }, null, 2));
}

main();
