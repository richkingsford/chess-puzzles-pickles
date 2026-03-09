import { readFileSync } from 'fs';
import { describe, test, expect } from 'vitest';
import { auditPuzzlesData, formatAuditFailures } from './lib/puzzleAudit';

const loadJson = (relativePath) => JSON.parse(
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')
);

describe('Puzzle dataset audit', () => {
  test('every puzzle is player-ready and tag-clean', () => {
    const publicPuzzles = loadJson('../public/puzzles.json');
    const audit = auditPuzzlesData(publicPuzzles);

    expect(audit.summary.totalPuzzles).toBeGreaterThan(0);

    if (audit.failures.length) {
      throw new Error(formatAuditFailures(audit.failures, 50));
    }
  });
});
