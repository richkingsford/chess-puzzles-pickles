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
  ChessgroundBoard: ({ onMove, fen, orientation, customArrows }) => (
    <div
      data-testid="mock-board"
      data-fen={fen}
      data-orientation={orientation}
      data-arrows={JSON.stringify(customArrows || [])}
    >
      <button data-testid="move-correct" onClick={() => onMove('e2', 'e4')}>Move Correct</button>
      <button data-testid="move-wrong" onClick={() => onMove('e2', 'e3')}>Move Wrong</button>
    </div>
  )
}));

describe('App unit tests by area', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        entries: [
          {
            name: 'Pin',
            type: 'tactic',
            definition: 'A piece is stuck because moving it loses something more valuable.',
            aliases: ['pin tactic']
          },
          {
            name: 'Guard',
            type: 'vocabulary',
            definition: 'A piece protecting another piece or square.',
            aliases: ['defender']
          }
        ]
      })
    });

    Object.defineProperty(window, 'resetProgress', { writable: true, value: undefined });
  });

  afterEach(() => {
    vi.useRealTimers();
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
      expect(firstButton.compareDocumentPosition(secondButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('Board setup', () => {
    test('renders puzzle board with index and side-to-move status', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle(),
        totalPuzzles: 3,
        currentPuzzleIndex: 0
      });

      render(<App />);

      await waitFor(() => expect(screen.getByTestId('mock-board')).toBeInTheDocument());
      expect(screen.getByTestId('puzzle-category')).toHaveTextContent('set one');
      expect(screen.getByTestId('puzzle-index')).toHaveTextContent('1 / 3');
      expect(screen.queryByTestId('tags-panel')).not.toBeInTheDocument();
      expect(screen.getByText(/White to move|Black to move/)).toBeInTheDocument();
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

      await waitFor(() => expect(nextPuzzle).toHaveBeenCalledTimes(1), { timeout: 4500 });
    }, 8000);

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

    test('does not link weak partial matches while still linking strong phrase matches', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          entries: [
            {
              name: 'King Safety',
              type: 'strategy',
              definition: 'Keeping the king secure.'
            },
            {
              name: 'Center',
              type: 'board-concept',
              definition: 'Central squares and influence.'
            },
            {
              name: 'Loose Piece',
              type: 'vocabulary',
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
  });
});
