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

  test('first two hints stay subtle', () => {
    const publicPuzzles = loadJson('../public/puzzles.json');
    const squareIdRegex = /\b[a-h][1-8]\b/gi;
    const ownSideRegex = /\b(?:your|our|my)\b/i;
    const ownPieceSpoilerRegex = /\b(?:your|our|my)\s+(?:queen|rook|bishop|knight|pawn|king|piece|pieces)\b/i;
    const directMoveRegex = /\b(?:play|move|try)\s+[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]/i;
    const densePunctuationRegex = /[;:]/;
    const becauseRegex = /\bbecause\b/i;
    const minimumTeachingWords = 10;
    const offenders = [];

    Object.entries(publicPuzzles).forEach(([category, categoryData]) => {
      const puzzles = categoryData?.puzzles || categoryData || {};

      Object.entries(puzzles).forEach(([url, puzzleData]) => {
        const hintPairs = [];

        if (Array.isArray(puzzleData?.hints)) {
          hintPairs.push({
            source: 'hints',
            label: 'legacy',
            hints: puzzleData.hints.slice(0, 2)
          });
        }

        if (Array.isArray(puzzleData?.moveHints)) {
          puzzleData.moveHints.forEach((group, groupIndex) => {
            hintPairs.push({
              source: 'moveHints',
              label: `move ${groupIndex + 1}`,
              hints: Array.isArray(group) ? group.slice(0, 2) : []
            });
          });
        }

        hintPairs.forEach(({ source, label, hints }) => {
          [0, 1].forEach((index) => {
            const hint = hints[index];
            if (typeof hint !== 'string') {
              return;
            }

            const matches = [...hint.matchAll(squareIdRegex)].map((m) => m[0].toLowerCase());
            if (matches.length) {
              offenders.push({
                category,
                url,
                source,
                label,
                hintNumber: index + 1,
                squares: [...new Set(matches)],
                hint
              });
            }

            if (ownPieceSpoilerRegex.test(hint)) {
              offenders.push({
                category,
                url,
                source,
                label,
                hintNumber: index + 1,
                reason: 'hint names our moving piece',
                hint
              });
            }

            if (ownSideRegex.test(hint)) {
              offenders.push({
                category,
                url,
                source,
                label,
                hintNumber: index + 1,
                reason: 'hint points at our side instead of the board',
                hint
              });
            }

            if (directMoveRegex.test(hint)) {
              offenders.push({
                category,
                url,
                source,
                label,
                hintNumber: index + 1,
                reason: 'hint gives a direct move clue',
                hint
              });
            }

            if (hint.trim().split(/\s+/).length < minimumTeachingWords) {
              offenders.push({
                category,
                url,
                source,
                label,
                hintNumber: index + 1,
                reason: 'hint is too brief to teach the pattern',
                hint
              });
            }

            if (densePunctuationRegex.test(hint) || becauseRegex.test(hint)) {
              offenders.push({
                category,
                url,
                source,
                label,
                hintNumber: index + 1,
                reason: 'hint uses dense connective phrasing',
                hint
              });
            }
          });
        });
      });
    });

    expect(offenders).toEqual([]);
  });
});
