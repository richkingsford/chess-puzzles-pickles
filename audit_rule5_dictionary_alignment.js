const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'game/public/puzzles.json';
const dictionaryPath = process.argv[3] || 'dictionary.json';
const outputPath = process.argv[4] || 'hint_rule5_dictionary_alignment_audit.json';
const batchSize = Number(process.argv[5] || 500);

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedDictionary = path.resolve(process.cwd(), dictionaryPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeTerm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(value) {
  return normalizeTerm(value).split(/\s+/).filter(Boolean);
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

function buildDictionaryIndex(dictionary) {
  const entries = Array.isArray(dictionary.entries) ? dictionary.entries : [];
  const termToEntry = new Map();
  const canonicalEntries = [];

  entries.forEach((entry) => {
    const name = String(entry.name || '').trim();
    if (!name) return;

    const terms = [name, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
      .map((term) => String(term || '').trim())
      .filter(Boolean);

    const normalizedTerms = terms.map(normalizeTerm).filter(Boolean);
    canonicalEntries.push({
      name,
      normalizedName: normalizeTerm(name),
      terms,
      normalizedTerms
    });

    normalizedTerms.forEach((term) => {
      if (!termToEntry.has(term)) {
        termToEntry.set(term, name);
      }
    });
  });

  return { termToEntry, canonicalEntries };
}

function findDictionaryMatch(term, index) {
  const normalized = normalizeTerm(term);
  if (!normalized) return null;
  return index.termToEntry.get(normalized) || null;
}

function suggestDictionaryTerms(term, index) {
  const words = new Set(getWords(term));
  if (!words.size) return [];

  const scored = index.canonicalEntries.map((entry) => {
    const entryWords = new Set(getWords(entry.name));
    let overlap = 0;
    words.forEach((word) => {
      if (entryWords.has(word)) overlap += 1;
    });

    const score = overlap / Math.max(words.size, entryWords.size || 1);
    return { name: entry.name, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, 5)
    .map((item) => item.name);
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

function extractKeyConcept(hintText) {
  const match = String(hintText || '').match(/^The key concept is\s+(.+?)\.$/i);
  return match ? match[1].trim() : null;
}

function addViolation(violations, row, hint, checkId, severity, message, evidence, extra = {}) {
  violations.push({
    ruleId: 'rule-5-dictionary-taxonomy-alignment',
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

function auditPuzzle(row, index) {
  const violations = [];
  const anchorHint = row.hints[0] || null;

  row.tags.forEach((tag) => {
    const match = findDictionaryMatch(tag, index);
    if (match) return;

    addViolation(
      violations,
      row,
      anchorHint,
      'tag-not-in-dictionary',
      'medium',
      'Puzzle tag does not resolve to a dictionary term or alias.',
      `Unresolved tag: "${tag}".`,
      {
        unresolvedTerm: tag,
        suggestions: suggestDictionaryTerms(tag, index)
      }
    );
  });

  row.hints.forEach((hint) => {
    const concept = extractKeyConcept(hint.text);
    if (!concept) return;

    const match = findDictionaryMatch(concept, index);
    if (match) return;

    addViolation(
      violations,
      row,
      hint,
      'hint-concept-not-in-dictionary',
      'high',
      'Explicit hint concept does not resolve to a dictionary term or alias.',
      `Unresolved concept: "${concept}".`,
      {
        unresolvedTerm: concept,
        suggestions: suggestDictionaryTerms(concept, index)
      }
    );
  });

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
    const batchViolations = violations.filter((violation) => {
      if (!Number.isInteger(violation.globalHintIndex)) return false;
      return violation.globalHintIndex >= hintStart && violation.globalHintIndex <= hintEnd;
    });
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

function summarizeUnresolvedTerms(violations) {
  const counts = new Map();

  violations.forEach((violation) => {
    const key = `${violation.checkId}::${violation.unresolvedTerm}`;
    const current = counts.get(key) || {
      checkId: violation.checkId,
      unresolvedTerm: violation.unresolvedTerm,
      count: 0,
      suggestions: violation.suggestions || []
    };
    current.count += 1;
    counts.set(key, current);
  });

  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count || left.unresolvedTerm.localeCompare(right.unresolvedTerm));
}

function main() {
  const data = readJson(resolvedInput);
  const dictionary = readJson(resolvedDictionary);
  const dictionaryIndex = buildDictionaryIndex(dictionary);
  const rows = flattenPuzzles(data);
  const violations = rows.flatMap((row) => auditPuzzle(row, dictionaryIndex));
  const hintCount = rows.reduce((sum, row) => sum + row.hints.length, 0);
  const report = {
    inputFile: resolvedInput,
    dictionaryFile: resolvedDictionary,
    outputFile: resolvedOutput,
    evaluatedAt: new Date().toISOString(),
    auditVersion: 1,
    rule: {
      id: 'rule-5-dictionary-taxonomy-alignment',
      name: 'Dictionary / Taxonomy Alignment',
      description: 'Tags and explicit hint learning concepts should use canonical terms or aliases from dictionary.json.'
    },
    subchecks: {
      tagNotInDictionary: 'Flags puzzle tags that do not resolve to dictionary names or aliases.',
      hintConceptNotInDictionary: 'Flags explicit "The key concept is ..." hint concepts that do not resolve to dictionary names or aliases.'
    },
    batchSizeHints: batchSize,
    puzzleCount: rows.length,
    hintCount,
    dictionaryTermCount: dictionaryIndex.canonicalEntries.length,
    violationCount: violations.length,
    summary: {
      ...summarizeViolations(violations),
      unresolvedTerms: summarizeUnresolvedTerms(violations)
    },
    batches: buildBatches(rows, violations)
  };

  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${violations.length} Rule 5 violations to ${resolvedOutput}`);
  console.log(JSON.stringify({
    puzzleCount: report.puzzleCount,
    hintCount: report.hintCount,
    dictionaryTermCount: report.dictionaryTermCount,
    violationCount: report.violationCount,
    byCheck: report.summary.byCheck,
    bySeverity: report.summary.bySeverity,
    topUnresolvedTerms: report.summary.unresolvedTerms.slice(0, 12)
  }, null, 2));
}

main();
