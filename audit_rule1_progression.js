const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'game/public/puzzles.json';
const outputPath = process.argv[3] || 'hint_rule1_progression_audit.json';
const batchSize = Number(process.argv[4] || 500);

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

const MOVE_NOTATION_REGEX = /\b(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8]=[QRBN][+#]?|[a-h][1-8][+#])\b/;
const PIECE_WORDS = new Set(['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']);
const DIRECT_ACTION_WORDS = new Set([
  'use', 'move', 'play', 'slide', 'capture', 'take', 'deliver',
  'promote', 'sacrifice', 'checkmate', 'mate', 'check'
]);
const MOVE_TYPE_WORDS = [
  'mating move',
  'forcing check',
  'promotion move',
  'forcing capture',
  'quiet forcing move',
  'castling resource'
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[-/]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

function firstAnswerMove(answer) {
  return String(answer || '').split(',')[0]?.trim() || '';
}

function firstMovePiece(answer) {
  const move = firstAnswerMove(answer);
  const firstChar = move[0];
  const pieceMap = {
    K: 'king',
    Q: 'queen',
    R: 'rook',
    B: 'bishop',
    N: 'knight'
  };

  return pieceMap[firstChar] || 'pawn';
}

function getDirectnessScore(text) {
  const words = getWords(text);
  const lower = normalizeText(text);
  let score = 0;

  if (MOVE_NOTATION_REGEX.test(text)) score += 3;
  if (words.some((word) => PIECE_WORDS.has(word))) score += 1;
  if (words.some((word) => DIRECT_ACTION_WORDS.has(word))) score += 1;
  if (lower.includes('use your') || lower.includes('with your')) score += 1;
  if (lower.includes('first move') || lower.includes('final blow')) score += 1;

  return score;
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
        hints: hints.map((hint, hintIndex) => ({
          globalHintIndex: globalHintIndex++,
          hintIndex,
          text: String(hint || '')
        }))
      });

      puzzleIndex += 1;
    }
  }

  return rows;
}

function addViolation(violations, row, hint, checkId, severity, message, evidence, extra = {}) {
  violations.push({
    ruleId: 'rule-1-subtle-obvious-progression',
    checkId,
    severity,
    category: row.category,
    puzzleIndex: row.puzzleIndex,
    url: row.url,
    answer: row.answer,
    tags: row.tags,
    globalHintIndex: hint?.globalHintIndex ?? null,
    hintIndex: hint?.hintIndex ?? null,
    hintNumber: Number.isInteger(hint?.hintIndex) ? hint.hintIndex + 1 : null,
    hintText: hint?.text ?? null,
    message,
    evidence,
    ...extra
  });
}

function auditPuzzle(row) {
  const violations = [];
  const hints = row.hints;
  const starterPiece = firstMovePiece(row.answer);

  if (hints.length < 4) {
    addViolation(
      violations,
      row,
      null,
      'missing-required-stage',
      'high',
      'Rule 1 requires at least four staged hints.',
      `Found ${hints.length} hints.`
    );
    return violations;
  }

  const first = hints[0];
  const second = hints[1];
  const third = hints[2];
  const fourth = hints[3];

  if (getDirectnessScore(first.text) > 1) {
    addViolation(
      violations,
      row,
      first,
      'hint-1-too-direct',
      'high',
      'Hint 1 should identify only board weakness or pattern context.',
      `Directness score ${getDirectnessScore(first.text)}.`
    );
  }

  if (getWords(first.text).includes(starterPiece)) {
    addViolation(
      violations,
      row,
      first,
      'hint-1-names-starter-piece',
      'medium',
      'Hint 1 should not reveal the starting piece.',
      `First move starts with ${starterPiece}; Hint 1 mentions it.`
    );
  }

  if (MOVE_NOTATION_REGEX.test(first.text) || MOVE_NOTATION_REGEX.test(second.text)) {
    addViolation(
      violations,
      row,
      MOVE_NOTATION_REGEX.test(first.text) ? first : second,
      'early-move-notation',
      'high',
      'Hints 1 and 2 should not reveal move notation.',
      'Move notation appeared before the starter/direct stages.'
    );
  }

  if (getDirectnessScore(second.text) > 3) {
    addViolation(
      violations,
      row,
      second,
      'hint-2-too-direct',
      'high',
      'Hint 2 should name the concept, not reveal the move.',
      `Directness score ${getDirectnessScore(second.text)}.`
    );
  }

  if (!getWords(third.text).includes(starterPiece)) {
    addViolation(
      violations,
      row,
      third,
      'hint-3-missing-starter-piece',
      'medium',
      'Hint 3 should indicate which piece begins the plan.',
      `Expected starter piece: ${starterPiece}.`
    );
  }

  const normalizedFourth = normalizeText(fourth.text);
  if (!MOVE_TYPE_WORDS.some((moveType) => normalizedFourth.includes(moveType))) {
    addViolation(
      violations,
      row,
      fourth,
      'hint-4-missing-move-type',
      'medium',
      'Hint 4 should give a near-direct nudge about the first move type.',
      `Expected one of: ${MOVE_TYPE_WORDS.join(', ')}.`
    );
  }

  for (let index = 1; index < hints.length; index += 1) {
    const previous = hints[index - 1];
    const current = hints[index];
    const previousDirectness = getDirectnessScore(previous.text);
    const currentDirectness = getDirectnessScore(current.text);

    if (currentDirectness + 1 < previousDirectness) {
      addViolation(
        violations,
        row,
        current,
        'non-monotonic-progression',
        'medium',
        'Later hint appears less direct than the previous hint.',
        `Previous directness ${previousDirectness}; current directness ${currentDirectness}.`,
        {
          comparedWithHintNumber: previous.hintIndex + 1,
          comparedWithHintText: previous.text
        }
      );
    }
  }

  return violations;
}

function summarizeViolations(violations) {
  const byCheck = {};
  const bySeverity = {};

  violations.forEach((violation) => {
    byCheck[violation.checkId] = (byCheck[violation.checkId] || 0) + 1;
    bySeverity[violation.severity] = (bySeverity[violation.severity] || 0) + 1;
  });

  return { byCheck, bySeverity };
}

function buildBatches(rows, violations) {
  const batches = [];
  const totalHints = rows.reduce((sum, row) => sum + row.hints.length, 0);
  const totalBatches = Math.ceil(totalHints / batchSize);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const hintStart = batchIndex * batchSize;
    const hintEnd = Math.min(totalHints - 1, hintStart + batchSize - 1);
    const batchViolations = violations.filter((violation) => (
      Number.isInteger(violation.globalHintIndex) &&
      violation.globalHintIndex >= hintStart &&
      violation.globalHintIndex <= hintEnd
    ));
    const puzzleIndexes = new Set();

    rows.forEach((row) => {
      if (row.hints.some((hint) => hint.globalHintIndex >= hintStart && hint.globalHintIndex <= hintEnd)) {
        puzzleIndexes.add(row.puzzleIndex);
      }
    });

    batches.push({
      batchIndex,
      hintStart,
      hintEnd,
      hintCount: hintEnd >= hintStart ? hintEnd - hintStart + 1 : 0,
      puzzleCountTouched: puzzleIndexes.size,
      violationCount: batchViolations.length,
      summary: summarizeViolations(batchViolations),
      violations: batchViolations
    });
  }

  return batches;
}

function main() {
  const data = readJson(resolvedInput);
  const rows = flattenPuzzles(data);
  const violations = rows.flatMap(auditPuzzle);
  const totalHints = rows.reduce((sum, row) => sum + row.hints.length, 0);
  const report = {
    inputFile: resolvedInput,
    outputFile: resolvedOutput,
    evaluatedAt: new Date().toISOString(),
    auditVersion: 1,
    rule: {
      id: 'rule-1-subtle-obvious-progression',
      name: 'Subtle to Obvious Progression',
      description: 'Hints must reveal information in layers: board weakness/context, concept, starter piece, then near-direct first-move type.'
    },
    batchSizeHints: batchSize,
    puzzleCount: rows.length,
    hintCount: totalHints,
    violationCount: violations.length,
    summary: summarizeViolations(violations),
    batches: buildBatches(rows, violations)
  };

  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${violations.length} Rule 1 violations to ${resolvedOutput}`);
  console.log(JSON.stringify({
    puzzleCount: report.puzzleCount,
    hintCount: report.hintCount,
    violationCount: report.violationCount,
    summary: report.summary
  }, null, 2));
}

main();
