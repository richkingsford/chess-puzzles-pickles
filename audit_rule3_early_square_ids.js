const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'game/public/puzzles.json';
const outputPath = process.argv[3] || 'hint_rule3_early_square_ids_audit.json';
const batchSize = Number(process.argv[4] || 500);

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

const SQUARE_ID_REGEX = /\b[a-h][1-8]\b/gi;

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

function getSquareIds(text) {
  return Array.from(String(text || '').matchAll(SQUARE_ID_REGEX)).map((match) => match[0]);
}

function addViolation(violations, row, hint, checkId, severity, message, evidence, extra = {}) {
  violations.push({
    ruleId: 'rule-3-early-hints-avoid-square-ids',
    checkId,
    severity,
    category: row.category,
    puzzleIndex: row.puzzleIndex,
    url: row.url,
    answer: row.answer,
    tags: row.tags,
    globalHintIndex: hint.globalHintIndex,
    hintIndex: hint.hintIndex,
    hintNumber: hint.hintIndex + 1,
    hintText: hint.text,
    message,
    evidence,
    ...extra
  });
}

function auditHint(row, hint) {
  const violations = [];
  const squareIds = getSquareIds(hint.text);

  if (!squareIds.length || hint.hintIndex > 1) {
    return violations;
  }

  if (hint.hintIndex === 0) {
    addViolation(
      violations,
      row,
      hint,
      'hint-1-square-id',
      'high',
      'Hint 1 should not include exact board coordinates.',
      `Detected square IDs: ${squareIds.join(', ')}.`,
      { squareIds }
    );
  }

  if (hint.hintIndex === 1) {
    addViolation(
      violations,
      row,
      hint,
      'hint-2-square-id',
      'medium',
      'Hint 2 should usually avoid exact board coordinates.',
      `Detected square IDs: ${squareIds.join(', ')}.`,
      { squareIds }
    );
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
  const hintCount = rows.reduce((sum, row) => sum + row.hints.length, 0);
  const totalBatches = Math.ceil(hintCount / batchSize);
  const batches = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const hintStart = batchIndex * batchSize;
    const hintEnd = Math.min(hintCount - 1, hintStart + batchSize - 1);
    const batchViolations = violations.filter((violation) => (
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
  const violations = rows.flatMap((row) => row.hints.flatMap((hint) => auditHint(row, hint)));
  const hintCount = rows.reduce((sum, row) => sum + row.hints.length, 0);
  const report = {
    inputFile: resolvedInput,
    outputFile: resolvedOutput,
    evaluatedAt: new Date().toISOString(),
    auditVersion: 1,
    rule: {
      id: 'rule-3-early-hints-avoid-square-ids',
      name: 'Early Hints Avoid Square IDs',
      description: 'Hint 1 should not include exact coordinates. Hint 2 should usually avoid them. Exact square IDs belong in later, more direct hints.'
    },
    batchSizeHints: batchSize,
    puzzleCount: rows.length,
    hintCount,
    violationCount: violations.length,
    summary: summarizeViolations(violations),
    batches: buildBatches(rows, violations)
  };

  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${violations.length} Rule 3 violations to ${resolvedOutput}`);
  console.log(JSON.stringify({
    puzzleCount: report.puzzleCount,
    hintCount: report.hintCount,
    violationCount: report.violationCount,
    summary: report.summary
  }, null, 2));
}

main();
