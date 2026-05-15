const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'game/public/puzzles.json';
const outputPath = process.argv[3] || 'hint_rule6_clear_short_phrasing_audit.json';
const batchSize = Number(process.argv[4] || 500);

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

const SENTENCE_END_REGEX = /[.!?]+(?=\s|$)/g;
const DENSE_PUNCTUATION_REGEX = /[;:()]|--/;
const COMMA_HEAVY_REGEX = /(?:.*,){2,}/;
const DENSE_CONNECTOR_REGEX = /\b(?:although|because|however|therefore|whereas|unless|meanwhile|simultaneously|nevertheless)\b/i;
const GENERIC_FILLER_PHRASES = [
  'find the best move',
  'find the move',
  'look carefully',
  'good move',
  'strong move here',
  'best move',
  'right move',
  'tactical idea'
];

const STAGE_WORD_LIMITS = [
  12, // Hint 1: board weakness/context
  10, // Hint 2: concept
  16, // Hint 3: starter piece or concrete relationship
  16, // Hint 4: near-direct move type
  6 // Hint 5: final move reveal, when present
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

function countSentenceEndings(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 0;

  const matches = trimmed.match(SENTENCE_END_REGEX);
  return matches ? matches.length : 1;
}

function findGenericFiller(text) {
  const normalized = normalizeText(text);
  return GENERIC_FILLER_PHRASES.find((phrase) => normalized.includes(phrase));
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
    ruleId: 'rule-6-clear-short-phrasing',
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
  const text = hint.text;
  const words = getWords(text);
  const sentenceCount = countSentenceEndings(text);
  const wordLimit = STAGE_WORD_LIMITS[Math.min(hint.hintIndex, STAGE_WORD_LIMITS.length - 1)];
  const fillerPhrase = findGenericFiller(text);

  if (!text.trim()) {
    addViolation(
      violations,
      row,
      hint,
      'empty-hint',
      'high',
      'Hint is empty.',
      'No hint text was found.'
    );
    return violations;
  }

  if (words.length > wordLimit) {
    addViolation(
      violations,
      row,
      hint,
      'stage-word-limit',
      'medium',
      'Hint is longer than the scan-friendly target for its stage.',
      `Detected ${words.length} words; stage limit is ${wordLimit}.`,
      { wordCount: words.length, wordLimit }
    );
  }

  if (sentenceCount > 1) {
    addViolation(
      violations,
      row,
      hint,
      'multiple-sentences',
      'high',
      'Hint uses multiple sentences instead of one quick scan.',
      `Detected ${sentenceCount} sentence-ending marks.`
    );
  }

  if (DENSE_PUNCTUATION_REGEX.test(text)) {
    addViolation(
      violations,
      row,
      hint,
      'dense-punctuation',
      'medium',
      'Hint uses punctuation that often signals dense explanation.',
      'Detected a semicolon, colon, parenthetical, or dash-heavy phrase.'
    );
  }

  if (COMMA_HEAVY_REGEX.test(text)) {
    addViolation(
      violations,
      row,
      hint,
      'comma-heavy',
      'medium',
      'Hint appears comma-heavy and may be hard to scan during play.',
      'Detected two or more commas.'
    );
  }

  if (DENSE_CONNECTOR_REGEX.test(text)) {
    addViolation(
      violations,
      row,
      hint,
      'dense-connector',
      'medium',
      'Hint uses a dense explanatory connector.',
      'Detected a connector such as because, although, however, or therefore.'
    );
  }

  if (fillerPhrase) {
    addViolation(
      violations,
      row,
      hint,
      'generic-filler',
      'medium',
      'Hint uses generic filler instead of concrete guidance.',
      `Detected phrase: "${fillerPhrase}".`,
      { fillerPhrase }
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
  const totalHints = rows.reduce((sum, row) => sum + row.hints.length, 0);
  const totalBatches = Math.ceil(totalHints / batchSize);
  const batches = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const hintStart = batchIndex * batchSize;
    const hintEnd = Math.min(totalHints - 1, hintStart + batchSize - 1);
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
      id: 'rule-6-clear-short-phrasing',
      name: 'Clear, Short Phrasing',
      description: 'Hints should be beginner-readable, compact, and free of dense explanation.'
    },
    subchecks: {
      stageWordLimit: 'Flags hints above a scan-friendly word limit for their stage.',
      multipleSentences: 'Flags hints with more than one sentence-ending mark.',
      densePunctuation: 'Flags semicolons, colons, parentheticals, or dash-heavy phrasing.',
      commaHeavy: 'Flags hints with two or more commas.',
      denseConnector: 'Flags abstract explanatory connectors such as because, although, however, or therefore.',
      genericFiller: 'Flags generic filler phrases instead of concrete guidance.'
    },
    batchSizeHints: batchSize,
    puzzleCount: rows.length,
    hintCount,
    violationCount: violations.length,
    summary: summarizeViolations(violations),
    batches: buildBatches(rows, violations)
  };

  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${violations.length} Rule 6 violations to ${resolvedOutput}`);
  console.log(JSON.stringify({
    puzzleCount: report.puzzleCount,
    hintCount: report.hintCount,
    violationCount: report.violationCount,
    summary: report.summary
  }, null, 2));
}

main();
