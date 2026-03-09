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
  const rootPath = path.resolve(__dirname, 'puzzles.json');
  const publicPath = path.resolve(__dirname, 'game', 'public', 'puzzles.json');
  const auditModulePath = path.resolve(__dirname, 'game', 'src', 'lib', 'puzzleAudit.js');
  const auditModule = await import(pathToFileURL(auditModulePath).href);

  const rootData = safeReadJson(rootPath);
  const publicData = safeReadJson(publicPath);
  const audit = auditModule.auditPuzzlesData(rootData);
  const datasetsMatch = JSON.stringify(rootData) === JSON.stringify(publicData);

  console.log('Puzzle Audit');
  console.log(`- Total puzzles: ${audit.summary.totalPuzzles}`);
  console.log(`- Failures: ${audit.summary.failureCount}`);
  console.log(`- White to move: ${audit.summary.sideToMoveCounts.w}`);
  console.log(`- Black to move: ${audit.summary.sideToMoveCounts.b}`);
  console.log(`- Root/public match: ${datasetsMatch ? 'yes' : 'no'}`);

  const failureEntries = Object.entries(audit.summary.failureCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

  if (failureEntries.length) {
    console.log('- Failure breakdown:');
    failureEntries.forEach(([code, count]) => {
      console.log(`  - ${code}: ${count}`);
    });
  }

  if (!datasetsMatch) {
    console.error('');
    console.error('Root puzzles.json and game/public/puzzles.json differ.');
  }

  if (audit.failures.length) {
    console.error('');
    console.error(auditModule.formatAuditFailures(audit.failures, 30));
  }

  if (!datasetsMatch || audit.failures.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
