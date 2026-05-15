const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'game/public/puzzles.json';
const outputPath = process.argv[3] || 'hint_violation_audit.json';
const batchSize = Number(process.argv[4] || 500);

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

const SQUARE_ID_REGEX = /\b[a-h][1-8]\b/i;
const MOVE_NOTATION_REGEX = /\b(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8]=[QRBN][+#]?|[a-h][1-8][+#])\b/;
const SENTENCE_SPLIT_REGEX = /[.!?]+(?=\s|$)/g;

const PIECE_WORDS = new Set(['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']);
const DIRECT_ACTION_WORDS = new Set([
  'use', 'move', 'play', 'slide', 'capture', 'take', 'deliver',
  'promote', 'sacrifice', 'checkmate', 'mate', 'check'
]);
const GENERIC_PHRASES = [
  'good move',
  'find the move',
  'look carefully',
  'strong move here',
  'best move',
  'right move',
  'tactical idea'
];
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'to',
  'of', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'into', 'over',
  'under', 'through', 'around', 'up', 'down', 'out', 'off', 'as', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these',
  'those', 'it', 'its', 'your', 'their', 'our', 'own', 'can', 'will',
  'should', 'has', 'have', 'had', 'very', 'near', 'one', 'single'
]);

const CONCEPT_WORDS = [
  'king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'mate', 'checkmate',
  'check', 'capture', 'promotion', 'promote', 'fork', 'pin', 'skewer',
  'deflection', 'clearance', 'interference', 'sacrifice', 'zugzwang',
  'escape', 'defender', 'guard', 'battery', 'file', 'rank', 'diagonal',
  'back-rank', 'net', 'trap', 'trapped', 'overloaded', 'tempo', 'line',
  'square', 'weakness', 'support', 'supported', 'advanced', 'passed'
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

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[-/]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(text) {
  return normalizeText(text)
    .split(/\s+/)
    .filter(Boolean);
}

function getContentWords(text) {
  return getWords(text).filter((word) => !STOPWORDS.has(word) && word.length > 2);
}

function getConcepts(text) {
  const normalized = normalizeText(text);
  return CONCEPT_WORDS.filter((word) => normalized.includes(word.replace('-', ' ')));
}

function unique(values) {
  return Array.from(new Set(values));
}

function getSentenceCount(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 0;

  const matches = trimmed.match(SENTENCE_SPLIT_REGEX);
  return matches ? matches.length : 1;
}

function getDirectnessScore(text) {
  const words = getWords(text);
  const lower = normalizeText(text);
  let score = 0;

  if (MOVE_NOTATION_REGEX.test(text)) score += 3;
  if (SQUARE_ID_REGEX.test(text)) score += 2;
  if (words.some((word) => PIECE_WORDS.has(word))) score += 1;
  if (words.some((word) => DIRECT_ACTION_WORDS.has(word))) score += 1;
  if (lower.includes('use your') || lower.includes('with your')) score += 1;
  if (lower.includes('first move') || lower.includes('final blow')) score += 1;

  return score;
}

function firstMovePiece(answer) {
  const firstMove = String(answer || '').split(',')[0]?.trim() || '';
  const firstChar = firstMove[0];
  const pieceMap = {
    K: 'king',
    Q: 'queen',
    R: 'rook',
    B: 'bishop',
    N: 'knight'
  };

  return pieceMap[firstChar] || 'pawn';
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

function hasGenericPhrase(text) {
  const normalized = normalizeText(text);
  return GENERIC_PHRASES.find((phrase) => normalized.includes(phrase));
}

function addViolation(violations, row, hint, ruleId, severity, message, evidence, extra = {}) {
  violations.push({
    ruleId,
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
  const mover = firstMovePiece(row.answer);

  if (hints.length < 4) {
    addViolation(
      violations,
      row,
      null,
      'hint-count-too-low',
      'high',
      'Puzzle has fewer than the required 4 progression hints.',
      `Found ${hints.length} hints.`
    );
  }

  hints.forEach((hint) => {
    const text = hint.text;
    const hintNumber = hint.hintIndex + 1;
    const words = getWords(text);
    const wordCount = words.length;
    const sentenceCount = getSentenceCount(text);
    const directness = getDirectnessScore(text);
    const genericPhrase = hasGenericPhrase(text);

    if (!text.trim()) {
      addViolation(violations, row, hint, 'empty-hint', 'high', 'Hint is empty.', 'No hint text.');
      return;
    }

    if (sentenceCount > 1) {
      addViolation(
        violations,
        row,
        hint,
        'multi-sentence-hint',
        'medium',
        'Hint should be one sentence.',
        `Detected ${sentenceCount} sentence-ending punctuation marks.`
      );
    }

    if (wordCount > 18) {
      addViolation(
        violations,
        row,
        hint,
        'wordy-hint',
        'medium',
        'Hint is longer than the compact beginner-readable target.',
        `Detected ${wordCount} words; target is 18 or fewer.`
      );
    }

    if (genericPhrase) {
      addViolation(
        violations,
        row,
        hint,
        'generic-phrasing',
        'medium',
        'Hint uses generic phrasing instead of a concrete chess clue.',
        `Matched phrase: "${genericPhrase}".`
      );
    }

    if (hint.hintIndex === 0 && SQUARE_ID_REGEX.test(text)) {
      addViolation(
        violations,
        row,
        hint,
        'early-square-id',
        'high',
        'Hint 1 should not include exact square IDs.',
        `Matched square-like coordinate in: "${text}".`
      );
    }

    if (hint.hintIndex === 1 && SQUARE_ID_REGEX.test(text)) {
      addViolation(
        violations,
        row,
        hint,
        'early-square-id',
        'medium',
        'Hint 2 should usually avoid exact square IDs.',
        `Matched square-like coordinate in: "${text}".`
      );
    }

    if (hint.hintIndex <= 1 && MOVE_NOTATION_REGEX.test(text)) {
      addViolation(
        violations,
        row,
        hint,
        'early-move-notation',
        'high',
        'Early hints should not reveal move notation.',
        `Matched move-like notation in: "${text}".`
      );
    }

    if (hint.hintIndex === 0 && words.includes(mover)) {
      addViolation(
        violations,
        row,
        hint,
        'starter-piece-too-early',
        'medium',
        'Hint 1 should identify the weakness or pattern context, not the starting piece.',
        `First answer move appears to start with a ${mover}, and Hint 1 mentions "${mover}".`
      );
    }

    if (hint.hintIndex <= 1 && directness >= 4) {
      addViolation(
        violations,
        row,
        hint,
        'too-direct-too-early',
        'high',
        'Early hint is too direct for the subtle-to-obvious progression.',
        `Directness score ${directness}; early hints should stay contextual/conceptual.`
      );
    }
  });

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

  for (let leftIndex = 0; leftIndex < hints.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < hints.length; rightIndex += 1) {
      const left = hints[leftIndex];
      const right = hints[rightIndex];
      const leftWords = getContentWords(left.text);
      const rightWords = getContentWords(right.text);
      const overlapRatio = getOverlapRatio(leftWords, rightWords);
      const sharedConcepts = unique(getConcepts(left.text).filter((concept) => getConcepts(right.text).includes(concept)));
      const directnessGain = getDirectnessScore(right.text) - getDirectnessScore(left.text);

      if (
        sharedConcepts.length >= 2 &&
        overlapRatio >= 0.42 &&
        directnessGain <= 1
      ) {
        addViolation(
          violations,
          row,
          right,
          'redundant-hint-within-puzzle',
          'medium',
          'Hint appears to repeat concepts from an earlier hint without adding a clear new layer.',
          `Shared concepts: ${sharedConcepts.join(', ')}; content overlap: ${overlapRatio.toFixed(2)}.`,
          {
            comparedWithHintNumber: left.hintIndex + 1,
            comparedWithHintText: left.text,
            sharedConcepts,
            contentOverlapRatio: Number(overlapRatio.toFixed(2))
          }
        );
      }
    }
  }

  return violations;
}

function summarizeViolations(violations) {
  const byRule = {};
  const bySeverity = {};

  violations.forEach((violation) => {
    byRule[violation.ruleId] = (byRule[violation.ruleId] || 0) + 1;
    bySeverity[violation.severity] = (bySeverity[violation.severity] || 0) + 1;
  });

  return { byRule, bySeverity };
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
  const batches = buildBatches(rows, violations);
  const report = {
    inputFile: resolvedInput,
    outputFile: resolvedOutput,
    evaluatedAt: new Date().toISOString(),
    auditVersion: 1,
    batchSizeHints: batchSize,
    puzzleCount: rows.length,
    hintCount: totalHints,
    violationCount: violations.length,
    summary: summarizeViolations(violations),
    rules: {
      progression: 'Hints should move from board context to concept, starter piece, then near-direct move guidance.',
      onePoint: 'Each hint should be one compact sentence and communicate one instructional point.',
      earlySquareIds: 'Hints 1 and 2 should avoid exact board coordinates.',
      noRedundancyWithinPuzzle: 'Hints inside the same puzzle should each add new useful information.',
      dictionaryAlignment: 'Terms should align with dictionary.json; semantic checks still need batch review.'
    },
    caveat: 'This is a deterministic rule-based pass. Chess-content mismatch and subtle semantic redundancy should still be reviewed batch-by-batch.',
    batches
  };

  fs.writeFileSync(resolvedOutput, JSON.stringify(report, null, 2));

  console.log(`Wrote ${violations.length} violations across ${batches.length} batches to ${resolvedOutput}`);
  console.log(JSON.stringify({
    puzzleCount: report.puzzleCount,
    hintCount: report.hintCount,
    batchSizeHints: report.batchSizeHints,
    violationCount: report.violationCount,
    summary: report.summary
  }, null, 2));
}

main();
