import { readFileSync } from 'fs';
import { describe, test, expect } from 'vitest';
import { auditPuzzlesData, formatAuditFailures } from './lib/puzzleAudit';

const loadJson = (relativePath) => JSON.parse(
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')
);

describe('Puzzle dataset audit', () => {
  test('every puzzle is player-ready and tag-clean', () => {
    const rootPuzzles = loadJson('../../puzzles.json');
    const audit = auditPuzzlesData(rootPuzzles);

    expect(audit.summary.totalPuzzles).toBeGreaterThan(0);

    if (audit.failures.length) {
      throw new Error(formatAuditFailures(audit.failures, 50));
    }
  });

  test('public puzzle payload stays in sync with the root dataset', () => {
    const rootPuzzles = loadJson('../../puzzles.json');
    const publicPuzzles = loadJson('../public/puzzles.json');

    expect(publicPuzzles).toEqual(rootPuzzles);
  });
});
