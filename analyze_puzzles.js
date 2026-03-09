#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const URL_KEY_REGEX = /^https?:\/\/lichess\.org\/analysis\//i;

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Failed to read file: ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

function safeParseJson(text, filePath) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error(`Invalid JSON in ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

function parseTopLevelKeyOccurrences(raw) {
  const counts = new Map();
  let i = 0;
  let line = 1;
  let inString = false;
  let escaped = false;
  let depth = 0;

  const bump = (ch) => {
    if (ch === '\n') line += 1;
  };

  while (i < raw.length) {
    const ch = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      bump(ch);
      i += 1;
      continue;
    }

    if (ch === '"') {
      if (depth === 1) {
        // Candidate top-level key; parse it and verify the next token is ':'.
        const startLine = line;
        let j = i + 1;
        let keyEsc = false;
        let key = '';
        for (; j < raw.length; j += 1) {
          const kc = raw[j];
          if (keyEsc) {
            key += kc;
            keyEsc = false;
            continue;
          }
          if (kc === '\\') {
            keyEsc = true;
            continue;
          }
          if (kc === '"') {
            break;
          }
          key += kc;
        }
        if (j < raw.length) {
          let k = j + 1;
          while (k < raw.length && /\s/.test(raw[k])) k += 1;
          if (raw[k] === ':') {
            const existing = counts.get(key) || { count: 0, lines: [] };
            existing.count += 1;
            existing.lines.push(startLine);
            counts.set(key, existing);
          }
        }
      }
      inString = true;
      bump(ch);
      i += 1;
      continue;
    }

    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;

    bump(ch);
    i += 1;
  }

  return counts;
}

function normalizeCategoryName(category) {
  return String(category || '')
    .trim()
    .toLowerCase()
    .replace(/\/all$/i, '');
}

function parsePuzzleUrlToFen(url) {
  try {
    const marker = 'lichess.org/analysis/';
    const index = String(url || '').indexOf(marker);
    if (index === -1) return null;

    let fenAndParams = String(url).substring(index + marker.length);
    if (fenAndParams.startsWith('standard/')) {
      fenAndParams = fenAndParams.substring(9);
    }

    const queryIndex = fenAndParams.indexOf('?');
    if (queryIndex !== -1) {
      fenAndParams = fenAndParams.substring(0, queryIndex);
    }

    return decodeURIComponent(fenAndParams).replace(/_/g, ' ').trim();
  } catch (error) {
    return null;
  }
}

function extractCategoryPuzzles(categoryData) {
  if (!categoryData || typeof categoryData !== 'object' || Array.isArray(categoryData)) {
    return [];
  }

  if (
    categoryData.puzzles &&
    typeof categoryData.puzzles === 'object' &&
    !Array.isArray(categoryData.puzzles)
  ) {
    return Object.entries(categoryData.puzzles)
      .filter(([key]) => URL_KEY_REGEX.test(key));
  }

  return Object.entries(categoryData)
    .filter(([key]) => URL_KEY_REGEX.test(key));
}

function getPuzzleAnswer(puzzleValue) {
  if (typeof puzzleValue === 'string') {
    return puzzleValue.trim();
  }
  if (
    puzzleValue &&
    typeof puzzleValue === 'object' &&
    !Array.isArray(puzzleValue) &&
    typeof puzzleValue.answer === 'string'
  ) {
    return puzzleValue.answer.trim();
  }
  return '';
}

function getHintsCount(puzzleValue) {
  if (
    puzzleValue &&
    typeof puzzleValue === 'object' &&
    !Array.isArray(puzzleValue) &&
    Array.isArray(puzzleValue.hints)
  ) {
    return puzzleValue.hints.length;
  }
  return 0;
}

function getTagList(puzzleValue) {
  if (
    puzzleValue &&
    typeof puzzleValue === 'object' &&
    !Array.isArray(puzzleValue) &&
    Array.isArray(puzzleValue.tags)
  ) {
    return puzzleValue.tags.filter((tag) => typeof tag === 'string');
  }
  return [];
}

function getMoveCount(answer) {
  if (!answer) return 0;
  return String(answer)
    .split(',')
    .map((move) => move.trim())
    .filter(Boolean)
    .length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatFloat(num, digits = 2) {
  return Number.isFinite(num) ? num.toFixed(digits) : '0.00';
}

function topEntriesFromMap(map, topN = 10) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .slice(0, topN)
    .map(([key, count]) => ({ key, count }));
}

function buildReport(puzzlesData, rawText) {
  const categoryNames = Object.keys(puzzlesData);
  const categoryCounts = [];
  const typeCounts = new Map();

  const normalizedCategoryMap = new Map();
  const urlOccurrences = new Map();
  const fenOccurrences = new Map();
  const fenAnswerOccurrences = new Map();
  const tagCounts = new Map();

  const hintsPerPuzzle = [];
  const movesPerPuzzle = [];

  let totalPuzzles = 0;

  for (const category of categoryNames) {
    const categoryData = puzzlesData[category];
    const type =
      categoryData &&
      typeof categoryData === 'object' &&
      !Array.isArray(categoryData) &&
      typeof categoryData.type === 'string' &&
      categoryData.type.trim()
        ? categoryData.type.trim()
        : 'Unknown';

    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);

    const normalized = normalizeCategoryName(category);
    const existingNormalized = normalizedCategoryMap.get(normalized) || [];
    existingNormalized.push(category);
    normalizedCategoryMap.set(normalized, existingNormalized);

    const puzzles = extractCategoryPuzzles(categoryData);
    categoryCounts.push({ category, count: puzzles.length, type });
    totalPuzzles += puzzles.length;

    for (const [url, puzzleValue] of puzzles) {
      const answer = getPuzzleAnswer(puzzleValue);
      const hintsCount = getHintsCount(puzzleValue);
      const moveCount = getMoveCount(answer);
      const fen = parsePuzzleUrlToFen(url);

      const urlList = urlOccurrences.get(url) || [];
      urlList.push({ category, answer });
      urlOccurrences.set(url, urlList);

      if (fen) {
        const fenList = fenOccurrences.get(fen) || [];
        fenList.push({ category, url, answer });
        fenOccurrences.set(fen, fenList);

        const fenAnswerKey = `${fen}||${answer}`;
        const fenAnswerList = fenAnswerOccurrences.get(fenAnswerKey) || [];
        fenAnswerList.push({ category, url, answer });
        fenAnswerOccurrences.set(fenAnswerKey, fenAnswerList);
      }

      hintsPerPuzzle.push(hintsCount);
      movesPerPuzzle.push(moveCount);

      for (const tag of getTagList(puzzleValue)) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
  }

  const categoryValues = categoryCounts.map((entry) => entry.count);
  const totalCategories = categoryNames.length;
  const avgPuzzlesPerCategory = totalCategories ? totalPuzzles / totalCategories : 0;
  const minCount = categoryValues.length ? Math.min(...categoryValues) : 0;
  const maxCount = categoryValues.length ? Math.max(...categoryValues) : 0;
  const medianCount = median(categoryValues);

  const categoriesByCountDesc = [...categoryCounts].sort((left, right) => (
    right.count - left.count || left.category.localeCompare(right.category)
  ));
  const categoriesByCountAsc = [...categoriesByCountDesc].reverse();

  const exactCategoryKeyOccurrences = parseTopLevelKeyOccurrences(rawText);
  const duplicateCategoryKeysInRaw = [...exactCategoryKeyOccurrences.entries()]
    .filter(([, meta]) => meta.count > 1)
    .map(([category, meta]) => ({
      category,
      count: meta.count,
      lines: meta.lines
    }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));

  const normalizedDuplicateCategories = [...normalizedCategoryMap.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([normalized, list]) => ({
      normalized,
      categories: [...list].sort((a, b) => a.localeCompare(b))
    }))
    .sort((left, right) => left.normalized.localeCompare(right.normalized));

  const duplicateUrls = [...urlOccurrences.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([url, list]) => ({ url, count: list.length, occurrences: list }))
    .sort((left, right) => right.count - left.count || left.url.localeCompare(right.url));

  const duplicateFens = [...fenOccurrences.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([fen, list]) => ({ fen, count: list.length, occurrences: list }))
    .sort((left, right) => right.count - left.count || left.fen.localeCompare(right.fen));

  const duplicateFenAndAnswer = [...fenAnswerOccurrences.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, count: list.length, occurrences: list }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

  return {
    summary: {
      totalCategories,
      totalPuzzles,
      totalTypes: typeCounts.size,
      averagePuzzlesPerCategory: avgPuzzlesPerCategory,
      medianPuzzlesPerCategory: medianCount,
      minPuzzlesInCategory: minCount,
      maxPuzzlesInCategory: maxCount
    },
    categoryCounts,
    typeCounts: Object.fromEntries([...typeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    hints: {
      averageHintsPerPuzzle: hintsPerPuzzle.length
        ? hintsPerPuzzle.reduce((sum, value) => sum + value, 0) / hintsPerPuzzle.length
        : 0,
      medianHintsPerPuzzle: median(hintsPerPuzzle),
      minHintsPerPuzzle: hintsPerPuzzle.length ? Math.min(...hintsPerPuzzle) : 0,
      maxHintsPerPuzzle: hintsPerPuzzle.length ? Math.max(...hintsPerPuzzle) : 0
    },
    moves: {
      averageMovesPerPuzzle: movesPerPuzzle.length
        ? movesPerPuzzle.reduce((sum, value) => sum + value, 0) / movesPerPuzzle.length
        : 0,
      medianMovesPerPuzzle: median(movesPerPuzzle),
      minMovesPerPuzzle: movesPerPuzzle.length ? Math.min(...movesPerPuzzle) : 0,
      maxMovesPerPuzzle: movesPerPuzzle.length ? Math.max(...movesPerPuzzle) : 0
    },
    tags: {
      uniqueTags: tagCounts.size,
      topTags: topEntriesFromMap(tagCounts, 20)
    },
    topCategories: categoriesByCountDesc.slice(0, 15),
    smallestCategories: categoriesByCountAsc.slice(0, 15),
    duplicates: {
      categoryKeysInRaw: duplicateCategoryKeysInRaw,
      normalizedCategories: normalizedDuplicateCategories,
      puzzleUrls: duplicateUrls,
      puzzleFens: duplicateFens,
      puzzleFenAndAnswer: duplicateFenAndAnswer
    }
  };
}

function printTextReport(filePath, report) {
  const { summary, typeCounts, tags, topCategories, smallestCategories, duplicates, hints, moves } = report;

  console.log(`Puzzle Stats Report: ${filePath}`);
  console.log('');
  console.log('Summary');
  console.log(`- Categories: ${summary.totalCategories}`);
  console.log(`- Puzzles: ${summary.totalPuzzles}`);
  console.log(`- Category types: ${summary.totalTypes}`);
  console.log(`- Avg puzzles/category: ${formatFloat(summary.averagePuzzlesPerCategory)}`);
  console.log(`- Median puzzles/category: ${formatFloat(summary.medianPuzzlesPerCategory)}`);
  console.log(`- Min puzzles/category: ${summary.minPuzzlesInCategory}`);
  console.log(`- Max puzzles/category: ${summary.maxPuzzlesInCategory}`);
  console.log('');

  console.log('Hints');
  console.log(`- Avg hints/puzzle: ${formatFloat(hints.averageHintsPerPuzzle)}`);
  console.log(`- Median hints/puzzle: ${formatFloat(hints.medianHintsPerPuzzle)}`);
  console.log(`- Min hints/puzzle: ${hints.minHintsPerPuzzle}`);
  console.log(`- Max hints/puzzle: ${hints.maxHintsPerPuzzle}`);
  console.log('');

  console.log('Moves');
  console.log(`- Avg moves/puzzle: ${formatFloat(moves.averageMovesPerPuzzle)}`);
  console.log(`- Median moves/puzzle: ${formatFloat(moves.medianMovesPerPuzzle)}`);
  console.log(`- Min moves/puzzle: ${moves.minMovesPerPuzzle}`);
  console.log(`- Max moves/puzzle: ${moves.maxMovesPerPuzzle}`);
  console.log('');

  console.log('Type Counts');
  for (const [type, count] of Object.entries(typeCounts)) {
    console.log(`- ${type}: ${count}`);
  }
  console.log('');

  console.log('Largest Categories (Top 15)');
  for (const row of topCategories) {
    console.log(`- ${row.category}: ${row.count} (${row.type})`);
  }
  console.log('');

  console.log('Smallest Categories (Bottom 15)');
  for (const row of smallestCategories) {
    console.log(`- ${row.category}: ${row.count} (${row.type})`);
  }
  console.log('');

  console.log('Tag Stats');
  console.log(`- Unique tags: ${tags.uniqueTags}`);
  console.log('- Top tags:');
  for (const row of tags.topTags) {
    console.log(`  - ${row.key}: ${row.count}`);
  }
  console.log('');

  console.log('Duplicate Categories (Raw Top-Level Keys)');
  if (!duplicates.categoryKeysInRaw.length) {
    console.log('- None');
  } else {
    for (const row of duplicates.categoryKeysInRaw) {
      console.log(`- ${row.category}: ${row.count} occurrences (lines ${row.lines.join(', ')})`);
    }
  }
  console.log('');

  console.log('Duplicate Categories (Normalized, /all-insensitive)');
  if (!duplicates.normalizedCategories.length) {
    console.log('- None');
  } else {
    for (const row of duplicates.normalizedCategories) {
      console.log(`- ${row.normalized}: ${row.categories.join(', ')}`);
    }
  }
  console.log('');

  console.log('Duplicate Puzzle URLs');
  console.log(`- Duplicate URL groups: ${duplicates.puzzleUrls.length}`);
  if (duplicates.puzzleUrls.length) {
    for (const row of duplicates.puzzleUrls.slice(0, 25)) {
      const categories = [...new Set(row.occurrences.map((entry) => entry.category))].join(', ');
      console.log(`- ${row.count}x | ${categories} | ${row.url}`);
    }
    if (duplicates.puzzleUrls.length > 25) {
      console.log(`- ... ${duplicates.puzzleUrls.length - 25} more groups`);
    }
  }
  console.log('');

  console.log('Duplicate FEN + Answer');
  console.log(`- Duplicate FEN+answer groups: ${duplicates.puzzleFenAndAnswer.length}`);
  if (duplicates.puzzleFenAndAnswer.length) {
    for (const row of duplicates.puzzleFenAndAnswer.slice(0, 25)) {
      const categories = [...new Set(row.occurrences.map((entry) => entry.category))].join(', ');
      console.log(`- ${row.count}x | ${categories}`);
    }
    if (duplicates.puzzleFenAndAnswer.length > 25) {
      console.log(`- ... ${duplicates.puzzleFenAndAnswer.length - 25} more groups`);
    }
  }
  console.log('');

  console.log('Duplicate FEN (regardless of answer)');
  console.log(`- Duplicate FEN groups: ${duplicates.puzzleFens.length}`);
  if (duplicates.puzzleFens.length) {
    for (const row of duplicates.puzzleFens.slice(0, 25)) {
      const categories = [...new Set(row.occurrences.map((entry) => entry.category))].join(', ');
      console.log(`- ${row.count}x | ${categories}`);
    }
    if (duplicates.puzzleFens.length > 25) {
      console.log(`- ... ${duplicates.puzzleFens.length - 25} more groups`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((arg) => !arg.startsWith('--')) || 'game/public/puzzles.json';
  const asJson = args.includes('--json');
  const resolved = path.resolve(process.cwd(), fileArg);

  const rawText = safeRead(resolved);
  const parsed = safeParseJson(rawText, resolved);
  const report = buildReport(parsed, rawText);

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printTextReport(fileArg, report);
}

main();
