import { describe, expect, test } from 'vitest';
import {
  HINTS_PER_PLAYER_MOVE,
  auditMoveHintGroups,
  getHintsForAnswerMove,
  getPlayerAnswerMoves,
  getPlayerMoveCountFromAnswer,
  getPlayerMoveIndexForAnswerMove,
  getTotalHintRevealCount,
  hasStructuredMoveHints,
  revealNextHintForAnswerMove
} from './puzzleHints';

describe('puzzle hint model', () => {
  test('preserves legacy flat hints as puzzle-level hints', () => {
    const puzzle = {
      answer: 'e4, e5, Nf3',
      hints: ['Claim space.', 'Use the pawn.', 'Play the center break.']
    };

    expect(hasStructuredMoveHints(puzzle)).toBe(false);
    expect(getPlayerMoveCountFromAnswer(puzzle.answer)).toBe(2);
    expect(getPlayerAnswerMoves(puzzle.answer)).toEqual(['e4', 'Nf3']);
    expect(getHintsForAnswerMove(puzzle, 0)).toEqual(puzzle.hints);
    expect(getHintsForAnswerMove(puzzle, 2)).toEqual(puzzle.hints);
  });

  test('maps structured move hints to player moves, not opponent replies', () => {
    const puzzle = {
      answer: 'e4, e5, Nf3',
      moveHints: [
        ['First move hint 1.', 'First move hint 2.', 'First move hint 3.'],
        ['Second move hint 1.', 'Second move hint 2.', 'Second move hint 3.']
      ]
    };

    expect(hasStructuredMoveHints(puzzle)).toBe(true);
    expect(getPlayerMoveIndexForAnswerMove(0)).toBe(0);
    expect(getPlayerMoveIndexForAnswerMove(1)).toBe(0);
    expect(getPlayerMoveIndexForAnswerMove(2)).toBe(1);
    expect(getHintsForAnswerMove(puzzle, 0)[0]).toBe('First move hint 1.');
    expect(getHintsForAnswerMove(puzzle, 2)[0]).toBe('Second move hint 1.');
  });

  test('tracks reveal counts separately for each player move', () => {
    const puzzle = {
      answer: 'e4, e5, Nf3',
      moveHints: [
        ['First move hint 1.', 'First move hint 2.', 'First move hint 3.'],
        ['Second move hint 1.', 'Second move hint 2.', 'Second move hint 3.']
      ]
    };

    let counts = {};
    counts = revealNextHintForAnswerMove(counts, puzzle, 0);
    counts = revealNextHintForAnswerMove(counts, puzzle, 2);
    counts = revealNextHintForAnswerMove(counts, puzzle, 2);

    expect(counts).toEqual({ 0: 1, 1: 2 });
    expect(getTotalHintRevealCount(counts)).toBe(3);
  });

  test('audits structured groups only when moveHints exists', () => {
    expect(auditMoveHintGroups({ answer: 'e4', hints: ['Legacy hint.'] })).toEqual([]);

    const failures = auditMoveHintGroups({
      answer: 'e4, e5, Nf3',
      moveHints: [
        ['Only one hint.']
      ]
    });

    expect(failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'move-hint-group-count-mismatch' }),
        expect.objectContaining({
          code: 'move-hint-count-mismatch',
          expected: HINTS_PER_PLAYER_MOVE,
          actual: 1
        })
      ])
    );
  });

  test('audits current-move relevance for structured hints', () => {
    const failures = auditMoveHintGroups({
      answer: 'Qh5+, g6, Qxg6#',
      moveHints: [
        [
          'Start with your queen to force the issue.',
          'Find the best move.',
          'Play Qxg6#.'
        ],
        [
          'Start with your queen to force the issue.',
          'Find the best move.',
          'Play Qh5+.'
        ]
      ]
    });

    expect(failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'move-hint-final-move-mismatch',
          playerMoveIndex: 0,
          expectedSan: 'Qh5+'
        }),
        expect.objectContaining({
          code: 'move-hint-references-other-answer-move',
          playerMoveIndex: 0,
          actualSan: 'Qxg6#'
        }),
        expect.objectContaining({
          code: 'move-hint-too-vague',
          playerMoveIndex: 0
        }),
        expect.objectContaining({
          code: 'move-hint-first-names-piece',
          playerMoveIndex: 0,
          hintIndex: 0
        }),
        expect.objectContaining({
          code: 'move-hint-second-missing-piece-cue',
          playerMoveIndex: 0,
          hintIndex: 1
        }),
        expect.objectContaining({
          code: 'move-hint-second-missing-opportunity-cue',
          playerMoveIndex: 0,
          hintIndex: 1
        }),
        expect.objectContaining({
          code: 'move-hint-repeated-opening-pair',
          playerMoveIndex: 1,
          comparedWithPlayerMoveIndex: 0
        })
      ])
    );
  });
});
