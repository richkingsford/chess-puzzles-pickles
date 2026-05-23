#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const rootDir = __dirname;
const datasetPath = path.resolve(rootDir, 'game', 'public', 'puzzles.json');
const dictionaryPath = path.resolve(rootDir, 'dictionary.json');
const outputPath = path.resolve(rootDir, 'category_trim_candidates.json');

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to read JSON: ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

function splitAnswerMoves(answer) {
  return String(answer || '')
    .split(',')
    .map((move) => move.trim())
    .filter(Boolean);
}

function getPlayerMoveCount(answer) {
  return Math.ceil(splitAnswerMoves(answer).length / 2);
}

function summarize(values) {
  if (!values.length) {
    return { min: 0, max: 0, average: 0 };
  }

  const sum = values.reduce((total, value) => total + value, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    average: sum / values.length
  };
}

function getPuzzleTags(puzzleData) {
  return Array.isArray(puzzleData?.tags)
    ? puzzleData.tags.filter((tag) => typeof tag === 'string')
    : [];
}

function formatFloat(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function addReason(reasons, condition, label, points) {
  if (!condition) {
    return 0;
  }

  reasons.push(label);
  return points;
}

async function main() {
  const auditModulePath = path.resolve(rootDir, 'game', 'src', 'lib', 'puzzleAudit.js');
  const audit = await import(pathToFileURL(auditModulePath).href);
  const dataset = safeReadJson(datasetPath);
  const dictionary = safeReadJson(dictionaryPath);
  const dictionaryIndex = audit.buildTagDefinitionIndex(dictionary);
  const datasetAudit = audit.auditPuzzlesData(dataset, {
    minTagsPerPuzzle: audit.MIN_TAGS_PER_PUZZLE,
    tagDefinitionIndex: dictionaryIndex
  });
  const failuresByCategory = datasetAudit.failures.reduce((map, failure) => {
    const category = failure.category || 'unknown';
    if (!map[category]) {
      map[category] = {};
    }
    map[category][failure.code] = (map[category][failure.code] || 0) + 1;
    return map;
  }, {});

  const categories = Object.entries(dataset).map(([category, categoryData]) => {
    const puzzlesMap = audit.getCategoryPuzzlesMap(categoryData);
    const puzzleEntries = Object.entries(puzzlesMap);
    const tags = puzzleEntries.flatMap(([, puzzleData]) => getPuzzleTags(puzzleData));
    const normalizedTags = tags.map((tag) => audit.normalizeTagKey(audit.normalizeTag(tag)));
    const playerMoveCounts = puzzleEntries.map(([, puzzleData]) => getPlayerMoveCount(puzzleData?.answer));
    const playerMoveStats = summarize(playerMoveCounts);
    const categoryKey = audit.normalizeTagKey(category);
    const dataFailures = failuresByCategory[category] || {};
    const dataFailureCount = Object.values(dataFailures).reduce((sum, count) => sum + count, 0);
    const reasons = [];

    const missingType = typeof categoryData?.type !== 'string' || !categoryData.type.trim();
    const categoryInDictionary = dictionaryIndex.has(categoryKey);
    const genericCategoryName = audit.STRICTLY_GENERIC_TAGS.has(categoryKey);
    const nearGenericCategoryName = audit.NEAR_EDGE_GENERIC_TAGS.has(categoryKey);
    const genericTagCount = normalizedTags.filter((tag) => audit.STRICTLY_GENERIC_TAGS.has(tag)).length;
    const nearGenericTagCount = normalizedTags.filter((tag) => audit.NEAR_EDGE_GENERIC_TAGS.has(tag)).length;
    const undefinedTagCount = normalizedTags.filter((tag) => !dictionaryIndex.has(tag)).length;
    const tagCount = normalizedTags.length;
    const genericTagRate = tagCount ? (genericTagCount + nearGenericTagCount) / tagCount : 0;
    const undefinedTagRate = tagCount ? undefinedTagCount / tagCount : 0;
    const moveHintCost = playerMoveCounts.reduce((sum, count) => sum + (count * 3), 0);

    let trimScore = 0;
    trimScore += addReason(reasons, puzzleEntries.length < 10, 'small category', 2);
    trimScore += addReason(reasons, missingType, 'missing category type', 1);
    trimScore += addReason(reasons, !categoryInDictionary, 'category name not in dictionary', 2);
    trimScore += addReason(reasons, genericCategoryName, 'generic category name', 4);
    trimScore += addReason(reasons, nearGenericCategoryName, 'near-generic category name', 3);
    trimScore += addReason(reasons, genericTagRate >= 0.25, 'many generic tags', 2);
    trimScore += addReason(reasons, undefinedTagRate >= 0.25, 'many undefined tags', 2);
    trimScore += addReason(reasons, dataFailureCount > 0, 'existing data audit failures', 4);
    trimScore += addReason(reasons, playerMoveStats.average >= 3, 'high move-hint migration cost', 1);

    return {
      category,
      type: categoryData?.type || null,
      puzzleCount: puzzleEntries.length,
      moveHintCost,
      trimScore,
      reasons,
      categoryInDictionary,
      playerMoves: {
        min: playerMoveStats.min,
        max: playerMoveStats.max,
        average: formatFloat(playerMoveStats.average)
      },
      tagSignals: {
        tagCount,
        genericTagCount,
        nearGenericTagCount,
        undefinedTagCount,
        genericTagRate: formatFloat(genericTagRate),
        undefinedTagRate: formatFloat(undefinedTagRate)
      },
      dataFailures
    };
  });

  categories.sort((left, right) => (
    right.trimScore - left.trimScore ||
    left.puzzleCount - right.puzzleCount ||
    right.moveHintCost - left.moveHintCost ||
    left.category.localeCompare(right.category)
  ));

  const report = {
    generatedAt: new Date().toISOString(),
    dataset: path.relative(rootDir, datasetPath),
    dictionary: path.relative(rootDir, dictionaryPath),
    note: 'Editorial review list only. Do not delete categories automatically from this report.',
    summary: {
      categoryCount: categories.length,
      puzzleCount: categories.reduce((sum, row) => sum + row.puzzleCount, 0),
      totalMoveHintCost: categories.reduce((sum, row) => sum + row.moveHintCost, 0),
      existingDataFailureCount: datasetAudit.summary.failureCount,
      topTrimCandidates: categories.slice(0, 20).map((row) => row.category)
    },
    categories
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log('Category Trim Candidates');
  console.log(`- Wrote: ${path.relative(rootDir, outputPath)}`);
  console.log(`- Categories: ${report.summary.categoryCount}`);
  console.log(`- Puzzles: ${report.summary.puzzleCount}`);
  console.log(`- Existing data audit failures: ${report.summary.existingDataFailureCount}`);
  console.log(`- Total future move hints at 3/player move: ${report.summary.totalMoveHintCost}`);
  console.log('- Top candidates:');

  categories.slice(0, 15).forEach((row, index) => {
    console.log(
      `  ${index + 1}. ${row.category} ` +
      `(score ${row.trimScore}, puzzles ${row.puzzleCount}, move hints ${row.moveHintCost})` +
      `${row.reasons.length ? ` - ${row.reasons.join('; ')}` : ''}`
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
