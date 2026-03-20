import { readFileSync } from 'fs';
import { describe, test, expect } from 'vitest';
import {
  auditPuzzlesData,
  buildTagDefinitionIndex,
  formatAuditFailures,
  MIN_TAGS_PER_PUZZLE
} from './lib/puzzleAudit';

const loadJson = (relativePath) => JSON.parse(
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')
);

describe('Puzzle dataset audit', () => {
  test('every puzzle is player-ready and tag-clean', () => {
    const publicPuzzles = loadJson('../public/puzzles.json');
    const dictionary = loadJson('../../dictionary.json');
    const audit = auditPuzzlesData(publicPuzzles, {
      minTagsPerPuzzle: MIN_TAGS_PER_PUZZLE,
      tagDefinitionIndex: buildTagDefinitionIndex(dictionary)
    });

    expect(audit.summary.totalPuzzles).toBeGreaterThan(0);

    if (audit.failures.length) {
      throw new Error(formatAuditFailures(audit.failures, 50));
    }
  });

  test('hint 2 and hint 3 avoid square-ID notation', () => {
    const publicPuzzles = loadJson('../public/puzzles.json');
    const squareIdRegex = /\b[a-h][1-8]\b/gi;
    const offenders = [];

    Object.entries(publicPuzzles).forEach(([category, categoryData]) => {
      const puzzles = categoryData?.puzzles || {};

      Object.entries(puzzles).forEach(([url, puzzleData]) => {
        const hints = Array.isArray(puzzleData?.hints) ? puzzleData.hints : [];

        [1, 2].forEach((index) => {
          const hint = hints[index];
          if (typeof hint !== 'string') {
            return;
          }

          const matches = [...hint.matchAll(squareIdRegex)].map((m) => m[0].toLowerCase());
          if (matches.length) {
            offenders.push({
              category,
              url,
              hintNumber: index + 1,
              squares: [...new Set(matches)],
              hint
            });
          }
        });
      });
    });

    expect(offenders).toEqual([]);
  });
});
