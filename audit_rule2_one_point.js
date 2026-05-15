const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'game/public/puzzles.json';
const outputPath = process.argv[3] || 'hint_rule2_one_point_audit.json';
const batchSize = Number(process.argv[4] || 500);

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

const MOVE_NOTATION_REGEX = /\b(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8]=[QRBN][+#]?|[a-h][1-8][+#])\b/g;
const SENTENCE_END_REGEX = /[.!?]+(?=\s|$)/g;
const CLAUSE_MARKER_REGEX = /(?:;|:|\band then\b|\bthen\b|\bfollowed by\b|\bafter\b|\bonce\b|\bbefore\b|\bwhile also\b|\bat the same time\b|\bsimultaneously\b|\ballowing\b)/i;
const FORCED_SEQUENCE_REGEX = /\b(?:must|forced to|has to)\b.+\b(?:and|then|allowing|followed by)\b/i;

const PIECE_WORDS = new Set(['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']);
const ACTION_WORDS = new Set([
  'use', 'move', 'play', 'slide', 'capture', 'take', 'deliver',
  'promote', 'sacrifice', 'check', 'mate', 'checkmate', 'block',
  'recapture', 'push', 'start', 'make'
]);
const TACTIC_WORDS = new Set([
  'mate', 'mating', 'net', 'fork', 'pin', 'skewer', 'deflection',
  'clearance', 'interference', 'sacrifice', 'promotion', 'zugzwang',
  'trap', 'battery', 'xray', 'x-ray', 'defender', 'overloaded',
  'discovered', 'attack', 'resource', 'tactic', 'concept'
]);
const MOVE_TYPE_PHRASES = [
  'mating move',
  'forcing check',
  'promotion move',
  'forcing capture',
  'quiet forcing move',
  'castling resource',
  'first move'
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

function getMoveNotationTokens(text) {
  return Array.from(String(text || '').matchAll(MOVE_NOTATION_REGEX)).map((match) => match[0]);
}

function countMatches(words, wordSet) {
  return words.filter((word) => wordSet.has(word)).length;
}

function hasMoveTypePhrase(text) {
  const normalized = normalizeText(text);
  return MOVE_TYPE_PHRASES.some((phrase) => normalized.includes(phrase));
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
    ruleId: 'rule-2-one-hint-one-point',
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
  const normalized = normalizeText(text);
  const sentenceCount = countSentenceEndings(text);
  const moveTokens = getMoveNotationTokens(text);
  const pieceWordCount = countMatches(words, PIECE_WORDS);
  const actionWordCount = countMatches(words, ACTION_WORDS);
  const tacticWordCount = countMatches(words, TACTIC_WORDS);
  const hasMoveType = hasMoveTypePhrase(text);

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

  if (sentenceCount > 1) {
    addViolation(
      violations,
      row,
      hint,
      'multiple-sentences',
      'high',
      'Rule 2 requires one sentence per hint.',
      `Detected ${sentenceCount} sentence-ending marks.`
    );
  }

  if (moveTokens.length > 1) {
    addViolation(
      violations,
      row,
      hint,
      'move-sequence-in-single-hint',
      'high',
      'Hint appears to describe a move sequence rather than one instructional point.',
      `Detected ${moveTokens.length} move-notation tokens: ${moveTokens.join(', ')}.`,
      { moveTokens }
    );
  }

  if (CLAUSE_MARKER_REGEX.test(text) && actionWordCount >= 2) {
    addViolation(
      violations,
      row,
      hint,
      'chained-instructions',
      'medium',
      'Hint appears to chain multiple instructions or phases.',
      `Detected clause marker with ${actionWordCount} action words.`
    );
  }

  if (FORCED_SEQUENCE_REGEX.test(text)) {
    addViolation(
      violations,
      row,
      hint,
      'forced-reply-sequence',
      'high',
      'Hint appears to include opponent response plus follow-up in one hint.',
      'Detected forced-reply wording such as "must" plus a continuation marker.'
    );
  }

  if (words.length > 18) {
    addViolation(
      violations,
      row,
      hint,
      'not-compact',
      'medium',
      'Hint is too wordy for the compact beginner-readable target.',
      `Detected ${words.length} words; target is 18 or fewer.`
    );
  }

  if (pieceWordCount > 0 && tacticWordCount > 0 && (hasMoveType || actionWordCount >= 2) && hint.hintIndex < 3) {
    addViolation(
      violations,
      row,
      hint,
      'overpacked-before-final-stage',
      'high',
      'Early hint combines piece selection, tactical concept, and move/action guidance.',
      `pieceWords=${pieceWordCount}, tacticWords=${tacticWordCount}, actionWords=${actionWordCount}, hasMoveType=${hasMoveType}.`
    );
  }

  if (tacticWordCount >= 3 && actionWordCount >= 2) {
    addViolation(
      violations,
      row,
      hint,
      'multi-concept-density',
      'medium',
      'Hint contains several tactical/action concepts and may be doing more than one job.',
      `tacticWords=${tacticWordCount}, actionWords=${actionWordCount}.`
    );
  }

  if (
    normalized.includes(' and ') &&
    actionWordCount >= 2 &&
    !normalized.startsWith('make the ') &&
    !normalized.startsWith('the key concept ')
  ) {
    addViolation(
      violations,
      row,
      hint,
      'and-joined-actions',
      'medium',
      'Hint may join two actions with "and" instead of presenting one point.',
      `Detected "and" with ${actionWordCount} action words.`
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
      id: 'rule-2-one-hint-one-point',
      name: 'One Hint = One Point',
      description: 'Each hint should be one compact sentence and communicate exactly one instructional point.'
    },
    subchecks: {
      multipleSentences: 'Flags hints with more than one sentence-ending mark.',
      moveSequenceInSingleHint: 'Flags hints with multiple SAN/move-notation tokens.',
      chainedInstructions: 'Flags clause markers plus multiple action words.',
      forcedReplySequence: 'Flags opponent-response plus continuation wording.',
      notCompact: 'Flags hints longer than 18 words.',
      overpackedBeforeFinalStage: 'Flags early hints combining piece, tactic, and move/action guidance.',
      multiConceptDensity: 'Flags hints dense with multiple tactical/action concepts.',
      andJoinedActions: 'Flags likely two-action hints joined by "and".'
    },
    batchSizeHints: batchSize,
    puzzleCount: rows.length,
    hintCount,
    violationCount: violations.length,
    summary: summarizeViolations(violations),
    batches: buildBatches(rows, violations)
  };

  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${violations.length} Rule 2 violations to ${resolvedOutput}`);
  console.log(JSON.stringify({
    puzzleCount: report.puzzleCount,
    hintCount: report.hintCount,
    violationCount: report.violationCount,
    summary: report.summary
  }, null, 2));
}

main();
