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
    const firstHintDirectiveRegex = /\b(?:find|play|try|start|begin|use|search|look for)\b/i;
    const abstractMaterialHintRegex = /\b(?:material weaknesses matter when one target lacks steady support|loose targets become vulnerable when their guards are stretched thin|a hanging target is vulnerable when nearby cover is unreliable)\b/i;
    const abstractKingHintRegex = /\b(?:trapped kings become vulnerable when escape routes are sealed|back-line shelter becomes fragile when flight squares disappear|a cramped king is vulnerable when nearby cover blocks escape|king safety becomes vulnerable when the shelter has loose cover|forcing threats matter when the king has little room|a king under thin cover is vulnerable to tempo pressure)\b/i;
    const abstractTacticalHintRegex = /\b(?:race positions become vulnerable when the defender is one step late|opening coordination is vulnerable when the back line is unsettled|king safety turns fragile when the center is still loose|endgame balance breaks when two weaknesses stretch one side|endgames turn fragile when one defender lacks a spare tempo|promotion races become vulnerable when the back line is late|unfinished development is vulnerable when central cover is thin|advanced passers become dangerous when the defense lacks time|a queening race turns fragile when the stopper is stretched|tactical weaknesses grow when loose cover surrounds a target|shared lines become fragile when defenders depend on one path|quiet positions become fragile when one area lacks steady support|weak coordination becomes vulnerable when defenders cannot share duties|limited exits become vulnerable when retreat squares disappear|pinned lines become vulnerable when a guard cannot freely leave|a front target becomes fragile when another target waits behind it|line control matters when a thin cover piece blocks pressure|hidden lines become vulnerable when only one blocker remains|a trapped unit is fragile when every escape path is watched|a tied defender becomes fragile when something valuable sits behind it|line pressure matters when one defender is stuck in place|poor mobility becomes a weakness when the edges close in|crowded targets become vulnerable when spacing disappears|fork patterns grow from targets that cannot both stay safe|clustered valuables become fragile when one tempo can touch both|stacked targets become vulnerable when the front one must move|skewer patterns appear when valuables share the same line|overloaded guards become vulnerable when one defender has too many jobs|a key guard turns fragile when several duties pull on it|defensive balance breaks when one guard protects too much)\b/i;
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

            if (source === 'moveHints' && index === 0) {
              const sentenceCount = hint
                .split(/[.!?]+/)
                .map((part) => part.trim())
                .filter(Boolean)
                .length;

              if (sentenceCount !== 2) {
                offenders.push({
                  category,
                  url,
                  source,
                  label,
                  hintNumber: index + 1,
                  reason: 'hint 1 must use two brief sentences',
                  hint
                });
              }

              if (firstHintDirectiveRegex.test(hint)) {
                offenders.push({
                  category,
                  url,
                  source,
                  label,
                  hintNumber: index + 1,
                  reason: 'hint 1 directs the player instead of naming a vulnerability',
                  hint
                });
              }

              if (abstractMaterialHintRegex.test(hint)) {
                offenders.push({
                  category,
                  url,
                  source,
                  label,
                  hintNumber: index + 1,
                  reason: 'hint 1 uses abstract material phrasing instead of defender count and target value',
                  hint
                });
              }

              if (abstractKingHintRegex.test(hint)) {
                offenders.push({
                  category,
                  url,
                  source,
                  label,
                  hintNumber: index + 1,
                  reason: 'hint 1 uses abstract king-safety phrasing instead of escape count and king area',
                  hint
                });
              }

              if (abstractTacticalHintRegex.test(hint)) {
                offenders.push({
                  category,
                  url,
                  source,
                  label,
                  hintNumber: index + 1,
                  reason: 'hint 1 uses abstract tactical phrasing instead of a concrete vulnerability clue',
                  hint
                });
              }
            }
          });
        });
      });
    });

    expect(offenders).toEqual([]);
  });
});
