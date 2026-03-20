#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to read JSON: ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

async function main() {
  const datasetPath = path.resolve(__dirname, 'game', 'public', 'puzzles.json');
  const dictionaryPath = path.resolve(__dirname, 'dictionary.json');
  const auditModulePath = path.resolve(__dirname, 'game', 'src', 'lib', 'puzzleAudit.js');
  const auditModule = await import(pathToFileURL(auditModulePath).href);

  const dataset = safeReadJson(datasetPath);
  const dictionary = safeReadJson(dictionaryPath);
  const tagDefinitionIndex = auditModule.buildTagDefinitionIndex(dictionary);

  const audit = auditModule.auditPuzzlesData(dataset, {
    minTagsPerPuzzle: auditModule.MIN_TAGS_PER_PUZZLE,
    tagDefinitionIndex
  });

  const edgeProbeTags = [
    'check',
    'mate pattern',
    'win material',
    'end game',
    'king safety issue',
    'weak square theme',
    'pawn structure shift',
    'tempo gain sequence',
    'piece activity swing',
    'initiative pressure',
    'clearance-sacrifice',
    'deflection',
    'zwischenzug'
  ];

  const classifyTag = (tag) => {
    const key = auditModule.normalizeTagKey(tag);
    if (auditModule.STRICTLY_GENERIC_TAGS.has(key)) {
      return 'rejected: generic';
    }
    if (auditModule.NEAR_EDGE_GENERIC_TAGS.has(key)) {
      return 'rejected: near-edge generic';
    }
    return 'accepted: specific enough';
  };

  console.log('Puzzle Audit');
  console.log(`- Dataset: ${path.relative(__dirname, datasetPath)}`);
  console.log(`- Dictionary: ${path.relative(__dirname, dictionaryPath)}`);
  console.log(`- Total puzzles: ${audit.summary.totalPuzzles}`);
  console.log(`- Failures: ${audit.summary.failureCount}`);
  console.log(`- White to move: ${audit.summary.sideToMoveCounts.w}`);
  console.log(`- Black to move: ${audit.summary.sideToMoveCounts.b}`);
  console.log(`- Minimum tags required per puzzle: ${auditModule.MIN_TAGS_PER_PUZZLE}`);

  const failureEntries = Object.entries(audit.summary.failureCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

  if (failureEntries.length) {
    console.log('- Failure breakdown:');
    failureEntries.forEach(([code, count]) => {
      console.log(`  - ${code}: ${count}`);
    });
  }

  console.log('- Near-edge strictness probe:');
  edgeProbeTags.forEach((tag) => {
    console.log(`  - ${tag}: ${classifyTag(tag)}`);
  });

  if (audit.failures.length) {
    console.error('');
    console.error(auditModule.formatAuditFailures(audit.failures, 30));
  }

  if (audit.failures.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
