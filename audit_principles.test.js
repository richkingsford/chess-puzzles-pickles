const test = require('node:test');
const assert = require('node:assert/strict');
const { checkIndependentPrinciple, auditPrinciples } = require('./audit_principles');

test('rejects the screenshot even when followed by a useful board observation', () => {
  const failures = checkIndependentPrinciple('A defender can be drawn away from a safe post. A heavy defender shares a file with the king.');
  assert.equal(failures[0].code, 'principle-not-independent');
});
test('accepts the reviewed standalone attraction definition without a board clue', () => {
  assert.deepEqual(checkIndependentPrinciple('Attraction draws a piece onto a square where it becomes vulnerable.'), []);
});
test('unknown wording requires semantic review rather than passing keyword checks', () => {
  assert.equal(checkIndependentPrinciple('Attraction is a powerful tactic.')[0].code, 'principle-review-required');
});
test('a direct move is not a teaching principle', () => {
  assert.equal(checkIndependentPrinciple('Play Qh5+.')[0].code, 'principle-missing');
});
test('checks every hint level, including later player moves, without counting legacy copies', () => {
  const data = { attraction: { puzzles: { example: {
    hints: ['Unused legacy copy.'],
    moveHints: [
      ['A fork threatens two targets at once. A clue.', 'Attraction is powerful. A clue.', 'Play Qh5+.'],
      ['A defender can be drawn away from a safe post. A clue.', 'A fork threatens two targets at once. A clue.', 'Play Qh7#.']
    ]
  } } } };
  const result = auditPrinciples(data);
  assert.equal(result.checked, 6);
  assert.equal(result.failures.length, 4);
  assert.ok(result.failures.some((f) => f.move === 2 && f.hint === 1));
  assert.ok(result.failures.some((f) => f.hint === 3));
});
