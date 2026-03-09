import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePuzzleGame } from './usePuzzleGame';

const puzzleOneUrl = 'https://lichess.org/analysis/rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR%20w%20KQkq%20-%200%201';
const puzzleTwoUrl = 'https://lichess.org/analysis/rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR%20w%20KQkq%20-%200%202';

const makePuzzlesPayload = () => ({
  'set-one': {
    type: 'Tactics',
    puzzles: {
      [puzzleOneUrl]: {
        answer: 'e4',
        tags: ['opening-tactic'],
        hints: ['Claim the center.']
      },
      [puzzleTwoUrl]: {
        answer: 'Nf3',
        tags: ['opening-tactic'],
        hints: ['Develop with tempo.']
      }
    }
  }
});

describe('usePuzzleGame', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => makePuzzlesPayload()
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('selectCategory starts on the next uncompleted puzzle by default', async () => {
    localStorage.setItem('solvedPuzzles', JSON.stringify({
      'set-one': [puzzleOneUrl]
    }));

    const { result } = renderHook(() => usePuzzleGame());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectCategory('set-one');
    });

    expect(result.current.currentCategory).toBe('set-one');
    expect(result.current.currentPuzzleIndex).toBe(1);
    expect(result.current.currentPuzzle.url).toBe(puzzleTwoUrl);
    expect(result.current.isCurrentPuzzleCompleted).toBe(false);
  });

  test('markSolved writes a completion record and keeps the legacy solved map in sync', async () => {
    const { result } = renderHook(() => usePuzzleGame());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectCategory('set-one', 0);
    });

    act(() => {
      result.current.markSolved();
    });

    await waitFor(() => {
      const completedRecords = JSON.parse(localStorage.getItem('completedPuzzleRecords') || '{}');
      const solvedMap = JSON.parse(localStorage.getItem('solvedPuzzles') || '{}');

      expect(result.current.isCurrentPuzzleCompleted).toBe(true);
      expect(typeof completedRecords[puzzleOneUrl]?.completedAt).toBe('string');
      expect(completedRecords[puzzleOneUrl]?.category).toBe('set-one');
      expect(solvedMap['set-one']).toContain(puzzleOneUrl);
    });
  });
});
