import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { vi } from 'vitest';

let hookState;
let user;

const markSolved = vi.fn();
const showNextHint = vi.fn();
const nextPuzzle = vi.fn();
const prevPuzzle = vi.fn();
const selectCategory = vi.fn();
const resetAllProgress = vi.fn();

const makePuzzle = (overrides = {}) => ({
  url: 'https://example.com/not-lichess-analysis',
  answer: 'e4',
  hints: ['Pin the guard first.'],
  tags: ['set-one', 'pin'],
  ...overrides
});

const makeHookState = (overrides = {}) => ({
  puzzlesData: {
    'set-one': {
      one: makePuzzle()
    },
    'set-two': {
      two: makePuzzle({ answer: 'e3' })
    }
  },
  loading: false,
  currentCategory: null,
  currentPuzzle: null,
  currentPuzzleIndex: 0,
  totalPuzzles: 1,
  hintsRevealed: 0,
  isSolved: false,
  isFailed: false,
  solvedPuzzles: {
    'set-one': [],
    'set-two': []
  },
  completedPuzzleRecords: {},
  isCurrentPuzzleCompleted: false,
  currentPuzzleCompletedAt: null,
  selectCategory,
  nextPuzzle,
  prevPuzzle,
  showNextHint,
  markSolved,
  resetAllProgress,
  ...overrides
});

vi.mock('./hooks/usePuzzleGame', () => ({
  usePuzzleGame: () => hookState
}));

vi.mock('./components/ChessgroundBoard', () => ({
  ChessgroundBoard: ({ onMove, onInteraction, fen, orientation, customArrows, movableColor }) => (
    <div
      data-testid="mock-board"
      data-fen={fen}
      data-orientation={orientation}
      data-arrows={JSON.stringify(customArrows || [])}
      data-movable-color={movableColor}
    >
      <button
        data-testid="move-correct"
        onClick={() => {
          onInteraction?.({ x: 120, y: 160 });
          onMove('e2', 'e4');
        }}
      >
        Move Correct
      </button>
      <button
        data-testid="move-wrong"
        onClick={() => {
          onInteraction?.({ x: 80, y: 140 });
          onMove('e2', 'e3');
        }}
      >
        Move Wrong
      </button>
    </div>
  )
}));

describe('App unit tests by area', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
    localStorage.clear();

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        entries: [
          {
            name: 'Pin',
            definition: 'A piece is stuck because moving it loses something more valuable.',
            aliases: ['pin tactic']
          },
          {
            name: 'Guard',
            definition: 'A piece protecting another piece or square.',
            aliases: ['defender']
          },
          {
            name: 'set-one',
            definition: 'Category tag used in tests.',
            aliases: ['set-two']
          }
        ]
      })
    });

    Object.defineProperty(window, 'resetProgress', { writable: true, value: undefined });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Homepage', () => {
    test('renders category list and keeps incomplete set before complete set', () => {
      hookState = makeHookState({
        solvedPuzzles: {
          'set-one': ['one'],
          'set-two': []
        }
      });

      render(<App />);

      const firstButton = screen.getByRole('button', { name: /set two/i });
      const secondButton = screen.getByRole('button', { name: /set one/i });

      expect(screen.getByRole('heading', { name: /Chess Puzzles/i })).toBeInTheDocument();
      expect(firstButton).toBeInTheDocument();
      expect(secondButton).toBeInTheDocument();
      expect(screen.getByTestId('open-dictionary-page')).toBeInTheDocument();
      expect(screen.queryByTestId('visual-motif-test-button')).not.toBeInTheDocument();
      expect(firstButton.compareDocumentPosition(secondButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    test('filters categories by puzzle type', async () => {
      hookState = makeHookState({
        puzzlesData: {
          'mate-set': {
            type: 'Mate',
            puzzles: {
              one: makePuzzle()
            }
          },
          'opening-set': {
            type: 'Opening',
            puzzles: {
              two: makePuzzle({ answer: 'e3' })
            }
          },
          'misc-set': {
            type: 'Misc',
            puzzles: {
              three: makePuzzle({ answer: 'd4' })
            }
          }
        },
        solvedPuzzles: {
          'mate-set': [],
          'opening-set': [],
          'misc-set': []
        }
      });

      render(<App />);

      expect(screen.getByRole('button', { name: /mate set/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /opening set/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /misc set/i })).toBeInTheDocument();
      expect(screen.queryByTestId('category-type-filters')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('category-filter-button'));
      expect(screen.getByRole('menuitem', { name: /Tactics \(1\)/i })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /Misc/i })).not.toBeInTheDocument();
      await user.click(screen.getByRole('menuitem', { name: /Mate \(1\)/i }));

      expect(screen.getByRole('button', { name: /mate set/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /opening set/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /misc set/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('category-type-filters')).not.toBeInTheDocument();
    });

    test('random mode button selects a random category and puzzle index', async () => {
      const randomSpy = vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0)   // room/player setup
        .mockReturnValueOnce(0)   // category pick
        .mockReturnValueOnce(0.9); // puzzle index pick

      hookState = makeHookState({
        puzzlesData: {
          'set-one': {
            one: makePuzzle(),
            two: makePuzzle({ answer: 'e5' })
          },
          'set-two': {
            three: makePuzzle({ answer: 'd4' })
          }
        },
        solvedPuzzles: {
          'set-one': [],
          'set-two': []
        }
      });

      render(<App />);

      await user.click(screen.getByTestId('random-mode-button'));

      expect(selectCategory).toHaveBeenCalledTimes(1);
      expect(selectCategory).toHaveBeenCalledWith('set-one', 1);
      randomSpy.mockRestore();
    });

    test('marks a category as garbage from the category overflow menu', async () => {
      hookState = makeHookState();

      render(<App />);

      await user.click(screen.getAllByTestId('category-options-button')[0]);
      await user.click(screen.getByTestId('mark-category-garbage'));

      await waitFor(() => {
        const feedback = JSON.parse(localStorage.getItem('categoryFeedback') || '{}');

        expect(feedback.categories['set-one']).toMatchObject({
          category: 'set-one',
          label: 'set one',
          garbage: true,
          puzzleCount: 1
        });
        expect(feedback.categories['set-one'].events[0].type).toBe('marked_garbage');
      });

      expect(screen.getByText('1 marked')).toBeInTheDocument();

      await user.click(screen.getAllByTestId('category-options-button')[0]);

      expect(screen.getByRole('menuitem', { name: /unmark garbage/i })).toBeInTheDocument();
    });

    test('downloads the stored category feedback as a json file', async () => {
      const createObjectURL = vi.fn(() => 'blob:feedback');
      const revokeObjectURL = vi.fn();
      const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: createObjectURL
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: revokeObjectURL
      });

      localStorage.setItem('categoryFeedback', JSON.stringify({
        version: 1,
        createdAt: '2026-05-23T00:00:00.000Z',
        updatedAt: '2026-05-23T00:01:00.000Z',
        categories: {
          'set-two': {
            category: 'set-two',
            label: 'set two',
            garbage: true
          }
        }
      }));
      hookState = makeHookState();

      render(<App />);

      await user.click(screen.getByTestId('download-feedback-file'));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:feedback');

      const feedbackBlob = createObjectURL.mock.calls[0][0];
      const feedbackText = await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(feedbackBlob);
      });
      const feedback = JSON.parse(feedbackText);

      expect(feedback.categories['set-two']).toMatchObject({
        category: 'set-two',
        garbage: true
      });
      expect(feedback.exportedAt).toEqual(expect.any(String));
      expect(feedback.source.app).toBe('chess-puzzles-pickles');
    });
  });

  describe('Board setup', () => {
    test('renders puzzle board with index and clear player-turn indicators', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ tags: ['set-one', 'pin'] }),
        totalPuzzles: 3,
        currentPuzzleIndex: 0
      });

      render(<App />);

      await waitFor(() => expect(screen.getByTestId('mock-board')).toBeInTheDocument());
      expect(screen.getByTestId('puzzle-category')).toHaveTextContent('set one');
      expect(screen.getByTestId('puzzle-index')).toHaveTextContent('1 / 3');
      expect(screen.getByTestId('tags-panel')).toBeInTheDocument();
      expect(screen.getByTestId('mock-board')).toHaveAttribute('data-movable-color', 'white');
      expect(screen.getByText('White to move')).toBeInTheDocument();
    });

    test('shows black-side indicators for black-to-move puzzles', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({
          url: 'https://lichess.org/analysis/rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR_b_KQkq_-_0_1',
          tags: ['set-one', 'pin']
        }),
        totalPuzzles: 1,
        currentPuzzleIndex: 0
      });

      render(<App />);

      await waitFor(() => expect(screen.getByTestId('mock-board')).toBeInTheDocument());
      expect(screen.getByTestId('mock-board')).toHaveAttribute('data-orientation', 'black');
      expect(screen.getByTestId('mock-board')).toHaveAttribute('data-movable-color', 'black');
      expect(screen.getByText('Black to move')).toBeInTheDocument();
    });

    test('shows a green checkmark for completed puzzles', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ tags: ['set-one', 'pin'] }),
        totalPuzzles: 1,
        isCurrentPuzzleCompleted: true,
        currentPuzzleCompletedAt: '2026-03-08T12:00:00.000Z'
      });

      render(<App />);

      await waitFor(() => expect(screen.getByTestId('mock-board')).toBeInTheDocument());
      const completionBadge = screen.getByTestId('completion-record');
      expect(completionBadge).toHaveTextContent('✓');
      expect(completionBadge).toHaveAttribute('aria-label', 'Completed');
    });

    test('masks category and tags in random mode until tapped', async () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

      hookState = makeHookState({
        currentCategory: null,
        puzzlesData: {
          'set-one': {
            one: makePuzzle({ tags: ['set-one', 'pin'] })
          }
        },
        solvedPuzzles: {
          'set-one': []
        }
      });

      const { rerender } = render(<App />);

      await user.click(screen.getByTestId('random-mode-button'));
      expect(selectCategory).toHaveBeenCalledWith('set-one', 0);

      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ tags: ['set-one', 'pin'] }),
        totalPuzzles: 1,
        currentPuzzleIndex: 0
      });

      rerender(<App />);

      expect(screen.getByTestId('puzzle-category-mask')).toBeInTheDocument();
      expect(screen.getByTestId('tags-mask-button')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('puzzle-category-mask'));
      expect(screen.getByTestId('puzzle-category')).toHaveTextContent('set one');

      fireEvent.click(screen.getByTestId('tags-mask-button'));
      expect(screen.getByRole('button', { name: 'set-one' })).toBeInTheDocument();

      randomSpy.mockRestore();
    });
  });

  describe('Moving board + correct/incorrect checks', () => {
    test('marks solved on correct move and shows countdown on final solve', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ answer: 'e4' }),
        totalPuzzles: 2,
        currentPuzzleIndex: 0
      });

      render(<App />);

      act(() => {
        fireEvent.click(screen.getByTestId('move-correct'));
      });

      expect(screen.getByText('CORRECT!')).toBeInTheDocument();
      expect(screen.getByTestId('next-countdown')).toHaveTextContent('Next in 3');
      expect(markSolved).toHaveBeenCalledTimes(1);

      const confettiBurst = screen.getByTestId('win-confetti-burst');
      expect(confettiBurst.style.getPropertyValue('--confetti-origin-x')).toBe('120px');
      expect(confettiBurst.style.getPropertyValue('--confetti-origin-y')).toBe('160px');

      await waitFor(() => expect(nextPuzzle).toHaveBeenCalledTimes(1), { timeout: 4500 });
    }, 8000);

    test('returns to the homepage after the last puzzle in a category is solved', async () => {
      vi.useFakeTimers();

      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ answer: 'e4' }),
        totalPuzzles: 1,
        currentPuzzleIndex: 0
      });

      render(<App />);

      act(() => {
        fireEvent.click(screen.getByTestId('move-correct'));
      });

      expect(screen.getByText('CORRECT!')).toBeInTheDocument();
      expect(screen.getByTestId('next-countdown')).toHaveTextContent('Home in 4');

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(nextPuzzle).not.toHaveBeenCalled();
      expect(selectCategory).toHaveBeenCalledWith(null);
    });

    test('shows incorrect state and gracefully resets board state', async () => {
      vi.useFakeTimers();
      user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ answer: 'e4' }),
        totalPuzzles: 1,
        currentPuzzleIndex: 0
      });

      render(<App />);

      const board = screen.getByTestId('mock-board');
      const initialFen = board.getAttribute('data-fen');

      act(() => {
        fireEvent.click(screen.getByTestId('move-wrong'));
      });
      expect(screen.getByText('TRY AGAIN')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1200);
      });

      expect(screen.queryByText('TRY AGAIN')).not.toBeInTheDocument();
      expect(screen.getByTestId('mock-board').getAttribute('data-fen')).toBe(initialFen);
    });

    test('accepts equivalent SAN when only check/mate suffix differs', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ answer: 'e4+' }),
        totalPuzzles: 1,
        currentPuzzleIndex: 0
      });

      render(<App />);

      act(() => {
        fireEvent.click(screen.getByTestId('move-correct'));
      });

      expect(markSolved).toHaveBeenCalledTimes(1);
      expect(screen.getByText('CORRECT!')).toBeInTheDocument();
    });

    test('does not draw a last-move arrow for player move only', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ answer: 'e4' }),
        totalPuzzles: 1,
        currentPuzzleIndex: 0
      });

      render(<App />);

      act(() => {
        fireEvent.click(screen.getByTestId('move-correct'));
      });

      const arrows = JSON.parse(screen.getByTestId('mock-board').getAttribute('data-arrows') || '[]');
      expect(arrows).toEqual([]);
    });

    test('does not show last-move arrow on initial puzzle load', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({
          url: 'https://lichess.org/analysis/rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR%20w%20KQkq%20-%200%201',
          answer: 'e4, e5, Nf3'
        }),
        totalPuzzles: 1,
        currentPuzzleIndex: 0
      });

      render(<App />);

      await waitFor(() => {
        const arrows = JSON.parse(screen.getByTestId('mock-board').getAttribute('data-arrows') || '[]');
        expect(arrows).toEqual([]);
      });
    });

    test('holds briefly after CORRECT on non-final step and shows opponent reply note', async () => {
      vi.useFakeTimers();
      user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ answer: 'e4, e5, Nf3' }),
        totalPuzzles: 1,
        currentPuzzleIndex: 0
      });

      render(<App />);

      act(() => {
        fireEvent.click(screen.getByTestId('move-correct'));
      });

      expect(screen.getByText('CORRECT!')).toBeInTheDocument();
      expect(screen.getByTestId('opponent-reply-note')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1100);
      });

      expect(screen.queryByTestId('opponent-reply-note')).not.toBeInTheDocument();
      const arrows = JSON.parse(screen.getByTestId('mock-board').getAttribute('data-arrows') || '[]');
      expect(arrows).toEqual([['e7', 'e5']]);
    });
  });

  describe('Hints', () => {
    test('reveals hint and forwards reveal action', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ hints: ['Pin the guard first.'] }),
        hintsRevealed: 0,
        totalPuzzles: 1
      });

      render(<App />);

      const revealButton = screen.getByRole('button', { name: /Reveal Hint|Show Answer/i });
      await user.click(revealButton);

      expect(showNextHint).toHaveBeenCalledTimes(1);
    });

    test('stores selected negative feedback tags for a revealed hint', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({
          answer: 'e4',
          hints: ['Pin the guard first.']
        }),
        hintsRevealed: 1,
        totalPuzzles: 1
      });

      render(<App />);

      await user.click(screen.getByTestId('hint-feedback-options-button'));

      expect(screen.getAllByTestId('hint-feedback-tag').map((button) => button.textContent)).toEqual([
        'Confusing',
        'Too Subtle',
        'Too Blatant',
        'ID Usage'
      ]);
      expect(screen.queryByRole('menuitem', { name: /other/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole('menuitem', { name: 'Too Subtle' }));
      await user.click(screen.getByRole('menuitem', { name: 'ID Usage' }));

      await waitFor(() => {
        const feedback = JSON.parse(localStorage.getItem('categoryFeedback') || '{}');
        const hintFeedback = Object.values(feedback.hints || {})[0];

        expect(hintFeedback).toMatchObject({
          category: 'set-one',
          puzzleUrl: 'https://example.com/not-lichess-analysis',
          hintText: 'Pin the guard first.',
          tags: ['Too Subtle', 'ID Usage']
        });
        expect(hintFeedback.events.map((event) => event.tag)).toEqual(['Too Subtle', 'ID Usage']);
      });
    });

    test('renders existing revealed hint text', () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ hints: ['Pin the guard first.'] }),
        hintsRevealed: 1,
        totalPuzzles: 1
      });

      render(<App />);

      expect(screen.getByText(/Hint 1:/i)).toBeInTheDocument();
      expect(screen.getByText(/Pin the guard first\./i)).toBeInTheDocument();
    });

    test('shows the revealed hint group for the current player move', async () => {
      vi.useFakeTimers();
      user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({
          answer: 'e4, e5, Nf3',
          moveHints: [
            ['First move setup.', 'First move piece.', 'First move action.'],
            ['Second move setup.', 'Second move piece.', 'Second move action.']
          ]
        }),
        hintsRevealed: 2,
        hintRevealCountsByMove: { 0: 1, 1: 1 },
        totalPuzzles: 1
      });

      render(<App />);

      expect(screen.getByText(/Move 1 Hint 1:/i)).toBeInTheDocument();
      expect(screen.getByText(/First move setup\./i)).toBeInTheDocument();
      expect(screen.queryByText(/Second move setup\./i)).not.toBeInTheDocument();

      act(() => {
        fireEvent.click(screen.getByTestId('move-correct'));
      });

      act(() => {
        vi.advanceTimersByTime(1100);
      });

      expect(screen.getByText(/Move 2 Hint 1:/i)).toBeInTheDocument();
      expect(screen.getByText(/Second move setup\./i)).toBeInTheDocument();
      expect(screen.queryByText(/First move setup\./i)).not.toBeInTheDocument();
    });

    test('draws an arrow when revealed hint includes move notation', () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({
          answer: 'e4',
          hints: ['Play the center break now (e4).']
        }),
        hintsRevealed: 1,
        totalPuzzles: 1
      });

      render(<App />);

      const arrows = JSON.parse(screen.getByTestId('mock-board').getAttribute('data-arrows') || '[]');
      expect(arrows).toEqual([['e2', 'e4']]);
    });
  });

  describe('Dictionary', () => {
    test('opens dictionary page from homepage and returns', async () => {
      hookState = makeHookState({
        currentCategory: null
      });

      render(<App />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      await user.click(screen.getByTestId('open-dictionary-page'));

      expect(screen.getByRole('heading', { name: /Dictionary/i })).toBeInTheDocument();
      expect(screen.getAllByTestId('dictionary-entry').length).toBeGreaterThan(0);
      expect(screen.getByText(/moving it loses something more valuable/i)).toBeInTheDocument();

      await user.click(screen.getByTestId('dictionary-back-button'));
      expect(screen.getByRole('heading', { name: /Chess Puzzles/i })).toBeInTheDocument();
    });

    test('does not show dictionary type labels on the page or modal', async () => {
      hookState = makeHookState({
        currentCategory: null
      });

      const { unmount } = render(<App />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      await user.click(screen.getByTestId('open-dictionary-page'));

      expect(screen.queryByText(/^tactic$/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^vocabulary$/i)).not.toBeInTheDocument();

      unmount();

      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ hints: ['Pin the guard now.'] }),
        hintsRevealed: 1,
        totalPuzzles: 1
      });

      render(<App />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: 'Pin' }));

      expect(screen.getByRole('heading', { name: 'Pin' })).toBeInTheDocument();
      expect(screen.queryByText(/^tactic$/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^vocabulary$/i)).not.toBeInTheDocument();
    });

    test('opens dictionary modal from hint term tap', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ hints: ['Pin the guard now.'] }),
        hintsRevealed: 1,
        totalPuzzles: 1
      });

      render(<App />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      const pinTap = screen.getByRole('button', { name: 'Pin' });
      fireEvent.click(pinTap);

      expect(screen.getByRole('heading', { name: 'Pin' })).toBeInTheDocument();
      expect(screen.getByText(/moving it loses something more valuable/i)).toBeInTheDocument();
    });

    test('opens dictionary modal from tag chip with exact term label', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ tags: ['set-one', 'pin'] }),
        hintsRevealed: 0,
        totalPuzzles: 1
      });

      render(<App />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: 'set-one' }));

      expect(screen.getByRole('heading', { name: 'set-one' })).toBeInTheDocument();
      expect(screen.getByText(/Category tag used in tests/i)).toBeInTheDocument();
    });

    test('links dictionary terms inside dictionary definitions', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          entries: [
            {
              name: 'Pin',
              definition: 'A pin can overload a guard and win material.',
              aliases: []
            },
            {
              name: 'Guard',
              definition: 'A piece that protects another piece or key square.',
              aliases: []
            }
          ]
        })
      });

      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ hints: ['Pin now.'] }),
        hintsRevealed: 1,
        totalPuzzles: 1
      });

      render(<App />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: 'Pin' }));
      fireEvent.click(screen.getByRole('button', { name: 'guard' }));

      expect(screen.getByRole('heading', { name: 'Guard' })).toBeInTheDocument();
      expect(screen.getByText(/protects another piece or key square/i)).toBeInTheDocument();
    });

    test('does not link weak partial matches while still linking strong phrase matches', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          entries: [
            {
              name: 'King Safety',
              definition: 'Keeping the king secure.'
            },
            {
              name: 'Center',
              definition: 'Central squares and influence.'
            },
            {
              name: 'Loose Piece',
              definition: 'A piece that is undefended.'
            }
          ]
        })
      });

      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ hints: ['Safety squares piece. King Safety matters.'] }),
        hintsRevealed: 1,
        totalPuzzles: 1
      });

      render(<App />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: 'King Safety' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Safety$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^squares$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^piece$/i })).not.toBeInTheDocument();
    });

    test('does not fuzzy-link active minor to King Walk while still linking active king', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          entries: [
            {
              name: 'King Walk',
              definition: 'King activation in the endgame.',
              aliases: ['active king']
            },
            {
              name: 'minor-piece',
              definition: 'Knight or bishop.',
              aliases: ['minor piece']
            }
          ]
        })
      });

      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ hints: ['Use your active minor piece first, then your active king.'] }),
        hintsRevealed: 1,
        totalPuzzles: 1
      });

      render(<App />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: 'active minor' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'minor piece' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'active king' })).toBeInTheDocument();
    });
  });
});
