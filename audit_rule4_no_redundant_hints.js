const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'game/public/puzzles.json';
const outputPath = process.argv[3] || 'hint_rule4_no_redundant_hints_audit.json';
const batchSize = Number(process.argv[4] || 500);

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'to',
  'of', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'into', 'over',
  'under', 'through', 'around', 'up', 'down', 'out', 'off', 'as', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these',
  'those', 'it', 'its', 'your', 'their', 'our', 'own', 'can', 'will',
  'should', 'has', 'have', 'had', 'very', 'near', 'one', 'single',
  'key', 'concept', 'start', 'make', 'play', 'first', 'looks', 'issue'
]);

const CONCEPT_WORDS = [
  'king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'mate', 'mating',
  'checkmate', 'check', 'capture', 'promotion', 'promote', 'fork', 'pin',
  'skewer', 'deflection', 'clearance', 'interference', 'sacrifice',
  'zugzwang', 'escape', 'defender', 'guard', 'battery', 'file', 'rank',
  'diagonal', 'net', 'trap', 'trapped', 'overloaded', 'tempo', 'line',
  'square', 'weakness', 'support', 'supported', 'advanced', 'passed',
  'resource', 'tactic', 'forcing', 'move'
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

function getContentWords(text) {
  return getWords(text).filter((word) => !STOPWORDS.has(word) && word.length > 2);
}

function getConcepts(text) {
  const normalized = normalizeText(text);
  return CONCEPT_WORDS.filter((word) => normalized.includes(word));
}

function unique(values) {
  return Array.from(new Set(values));
}

function getOverlapRatio(leftWords, rightWords) {
  const left = new Set(leftWords);
  const right = new Set(rightWords);
  if (!left.size || !right.size) return 0;

  let overlap = 0;
  left.forEach((word) => {
    if (right.has(word)) overlap += 1;
  });

  return overlap / Math.min(left.size, right.size);
}

function getSpecificityScore(text) {
  const words = getWords(text);
  let score = 0;

  if (/\b[a-h][1-8]\b/i.test(text)) score += 2;
  if (/\b(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|[a-h][1-8]=[QRBN])/.test(text)) score += 3;
  if (words.some((word) => ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'].includes(word))) score += 1;
  if (words.some((word) => ['capture', 'check', 'mate', 'promote', 'sacrifice', 'forcing'].includes(word))) score += 1;

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
    ruleId: 'rule-4-no-redundant-hints-within-puzzle',
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

function auditPuzzle(row) {
  const violations = [];
  const hints = row.hints;

  for (let leftIndex = 0; leftIndex < hints.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < hints.length; rightIndex += 1) {
      const left = hints[leftIndex];
      const right = hints[rightIndex];
      const leftWords = getContentWords(left.text);
      const rightWords = getContentWords(right.text);
      const overlapRatio = getOverlapRatio(leftWords, rightWords);
      const leftConcepts = getConcepts(left.text);
      const rightConcepts = getConcepts(right.text);
      const sharedConcepts = unique(leftConcepts.filter((concept) => rightConcepts.includes(concept)));
      const specificityGain = getSpecificityScore(right.text) - getSpecificityScore(left.text);

      if (normalizeText(left.text) && normalizeText(left.text) === normalizeText(right.text)) {
        addViolation(
          violations,
          row,
          right,
          'duplicate-hint-text',
          'high',
          'Hint repeats an earlier hint exactly.',
          `Same normalized text as Hint ${left.hintIndex + 1}.`,
          {
            comparedWithHintNumber: left.hintIndex + 1,
            comparedWithHintText: left.text
          }
        );
        continue;
      }

      if (overlapRatio >= 0.7 && specificityGain <= 0) {
        addViolation(
          violations,
          row,
          right,
          'rephrased-same-advice',
          'high',
          'Hint appears to rephrase an earlier hint without adding specificity.',
          `Content overlap ${overlapRatio.toFixed(2)}; specificity gain ${specificityGain}.`,
          {
            comparedWithHintNumber: left.hintIndex + 1,
            comparedWithHintText: left.text,
            contentOverlapRatio: Number(overlapRatio.toFixed(2)),
            specificityGain
          }
        );
        continue;
      }

      if (sharedConcepts.length >= 2 && overlapRatio >= 0.45 && specificityGain <= 1) {
        addViolation(
          violations,
          row,
          right,
          'repeated-concepts-without-new-layer',
          'medium',
          'Hint repeats concepts from an earlier hint without a clear new layer.',
          `Shared concepts: ${sharedConcepts.join(', ')}; content overlap ${overlapRatio.toFixed(2)}; specificity gain ${specificityGain}.`,
          {
            comparedWithHintNumber: left.hintIndex + 1,
            comparedWithHintText: left.text,
            sharedConcepts,
            contentOverlapRatio: Number(overlapRatio.toFixed(2)),
            specificityGain
          }
        );
      }
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
  const violations = rows.flatMap(auditPuzzle);
  const hintCount = rows.reduce((sum, row) => sum + row.hints.length, 0);
  const report = {
    inputFile: resolvedInput,
    outputFile: resolvedOutput,
    evaluatedAt: new Date().toISOString(),
    auditVersion: 1,
    rule: {
      id: 'rule-4-no-redundant-hints-within-puzzle',
      name: 'No Redundant Hints Within a Puzzle',
      description: 'Hints in the same puzzle should each add new useful information instead of repeating the same concept, target, weakness, or advice.'
    },
    subchecks: {
      duplicateHintText: 'Flags exact repeated hint text within a puzzle.',
      rephrasedSameAdvice: 'Flags high lexical overlap without added specificity.',
      repeatedConceptsWithoutNewLayer: 'Flags repeated concepts with meaningful overlap and little specificity gain.'
    },
    batchSizeHints: batchSize,
    puzzleCount: rows.length,
    hintCount,
    violationCount: violations.length,
    summary: summarizeViolations(violations),
    batches: buildBatches(rows, violations)
  };

  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${violations.length} Rule 4 violations to ${resolvedOutput}`);
  console.log(JSON.stringify({
    puzzleCount: report.puzzleCount,
    hintCount: report.hintCount,
    violationCount: report.violationCount,
    summary: report.summary
  }, null, 2));
}

main();
