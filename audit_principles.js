#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const reviews = require('./audit/principle_reviews.json');
const firstSentence = (hint) => String(hint || '').split(/[.!?]+/)[0].trim();

/** Semantics need editorial judgment: unknown text requires review, never an automatic pass. */
function checkIndependentPrinciple(hint, catalog = reviews) {
  const sentence = firstSentence(hint);
  if (!sentence || /^(?:play|move|try|look|find|start|use)\b/i.test(sentence) || /\b[a-h][1-8]\b/i.test(sentence)) {
    return [{ code: 'principle-missing', detail: 'The first sentence must teach a general chess relationship, not give a move or board instruction.' }];
  }
  const verdict = catalog[sentence];
  if (verdict?.status === 'approved' && verdict.reason?.trim()) return [];
  if (verdict?.status === 'rejected') {
    return [{ code: 'principle-not-independent', detail: verdict.reason }];
  }
  return [{ code: 'principle-review-required', detail: 'Read the first sentence without the board or next sentence. Record an editorial review of what it teaches and why it is correct.' }];
}

function auditPrinciples(data) {
  const failures = [];
  let checked = 0;
  for (const [category, categoryData] of Object.entries(data)) {
    for (const [url, puzzle] of Object.entries(categoryData.puzzles || {})) {
      // Structured groups are canonical. Do not double-count legacy copies.
      const groups = Array.isArray(puzzle.moveHints) ? puzzle.moveHints : [puzzle.hints || []];
      groups.forEach((group, moveIndex) => group.forEach((hint, hintIndex) => {
        checked += 1;
        for (const failure of checkIndependentPrinciple(hint)) {
          failures.push({ category, url, move: moveIndex + 1, hint: hintIndex + 1, firstSentence: firstSentence(hint), ...failure });
        }
      }));
    }
  }
  return { checked, failures };
}

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, 'game/public/puzzles.json');
  const result = auditPrinciples(JSON.parse(fs.readFileSync(file, 'utf8')));
  const counts = {};
  for (const item of result.failures) counts[item.code] = (counts[item.code] || 0) + 1;
  console.log(JSON.stringify({ checked: result.checked, counts, examples: result.failures.slice(0, 10) }, null, 2));
  process.exitCode = result.failures.length ? 1 : 0;
}
module.exports = { firstSentence, checkIndependentPrinciple, auditPrinciples };
