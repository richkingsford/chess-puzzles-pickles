import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { vi } from 'vitest';

let hookState;

const markSolved = vi.fn();
const showNextHint = vi.fn();
const nextPuzzle = vi.fn();
const prevPuzzle = vi.fn();
const selectCategory = vi.fn();
const logFeedback = vi.fn();
const resetAllProgress = vi.fn();
const downloadLogs = vi.fn();

const makePuzzle = (overrides = {}) => ({
  url: 'https://example.com/not-lichess-analysis',
  answer: 'e4',
  hints: ['Pin the guard first.'],
  tags: ['pin'],
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
  logFeedback,
  lastFeedbackType: null,
  resetAllProgress,
  downloadLogs,
  ...overrides
});

vi.mock('./hooks/usePuzzleGame', () => ({
  usePuzzleGame: () => hookState
}));

vi.mock('./components/ChessgroundBoard', () => ({
  ChessgroundBoard: ({ onMove, fen, orientation }) => (
    <div data-testid="mock-board" data-fen={fen} data-orientation={orientation}>
      <button data-testid="move-correct" onClick={() => onMove('e2', 'e4')}>Move Correct</button>
      <button data-testid="move-wrong" onClick={() => onMove('e2', 'e3')}>Move Wrong</button>
    </div>
  )
}));

describe('App unit tests by area', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

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
    Object.defineProperty(window, 'downloadLogs', { writable: true, value: undefined });
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
      expect(firstButton.compareDocumentPosition(secondButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('Board setup', () => {
    test('renders puzzle board with index, tags, and side-to-move status', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle(),
        totalPuzzles: 3,
        currentPuzzleIndex: 0
      });

      render(<App />);

      await waitFor(() => expect(screen.getByTestId('mock-board')).toBeInTheDocument());
      expect(screen.getByTestId('puzzle-index')).toHaveTextContent('1 / 3');
      expect(screen.getByTestId('tags-panel')).toBeInTheDocument();
      expect(screen.getByTestId('tag-chip')).toHaveTextContent('pin');
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

      await userEvent.click(screen.getByTestId('move-correct'));

      expect(screen.getByText('CORRECT!')).toBeInTheDocument();
      expect(screen.getByTestId('next-countdown')).toHaveTextContent('Next in 3');
      expect(markSolved).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(3200);
      });

      expect(nextPuzzle).toHaveBeenCalledTimes(1);
    });

    test('shows incorrect state and gracefully resets board state', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ answer: 'e4' }),
        totalPuzzles: 1,
        currentPuzzleIndex: 0
      });

      render(<App />);

      const board = screen.getByTestId('mock-board');
      const initialFen = board.getAttribute('data-fen');

      await userEvent.click(screen.getByTestId('move-wrong'));
      expect(screen.getByText('TRY AGAIN')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1200);
      });

      expect(screen.queryByText('TRY AGAIN')).not.toBeInTheDocument();
      expect(screen.getByTestId('mock-board').getAttribute('data-fen')).toBe(initialFen);
    });

    test('holds briefly after CORRECT on non-final step and shows opponent reply note', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ answer: 'e4, e5, Nf3' }),
        totalPuzzles: 1,
        currentPuzzleIndex: 0
      });

      render(<App />);

      await userEvent.click(screen.getByTestId('move-correct'));

      expect(screen.getByText('CORRECT!')).toBeInTheDocument();
      expect(screen.getByTestId('opponent-reply-note')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1100);
      });

      expect(screen.queryByTestId('opponent-reply-note')).not.toBeInTheDocument();
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
      await userEvent.click(revealButton);

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

  describe('Tags + Dictionary', () => {
    test('opens dictionary modal from tag chip', async () => {
      hookState = makeHookState({
        currentCategory: 'set-one',
        currentPuzzle: makePuzzle({ tags: ['pin'] }),
        hintsRevealed: 0,
        totalPuzzles: 1
      });

      render(<App />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      await userEvent.click(screen.getByTestId('tag-chip'));

      expect(screen.getByText('Pin')).toBeInTheDocument();
      expect(screen.getByText(/moving it loses something more valuable/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Close dictionary' }));
      expect(screen.queryByText('Pin')).not.toBeInTheDocument();
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

      expect(screen.getByText('Pin')).toBeInTheDocument();
      expect(screen.getByText(/moving it loses something more valuable/i)).toBeInTheDocument();
    });
  });
});
