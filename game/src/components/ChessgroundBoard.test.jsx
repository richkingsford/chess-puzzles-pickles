import { render, waitFor, cleanup } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

const { chessgroundFactory, chessgroundSet } = vi.hoisted(() => {
  const set = vi.fn();
  const factory = vi.fn(() => ({ set }));
  return {
    chessgroundFactory: factory,
    chessgroundSet: set
  };
});

vi.mock('chessground', () => ({
  Chessground: chessgroundFactory
}));

import { ChessgroundBoard } from './ChessgroundBoard';

describe('ChessgroundBoard', () => {
  beforeEach(() => {
    chessgroundFactory.mockClear();
    chessgroundSet.mockClear();

    global.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    cleanup();
    delete global.ResizeObserver;
  });

  test('passes the FEN side to move into Chessground turnColor for black puzzles', async () => {
    render(
      <ChessgroundBoard
        fen="6k1/3r1p1p/1B6/1P3Pp1/P2p4/4b1PP/4R2K/8 b - - 0 34"
        orientation="black"
        movableColor="black"
        onMove={() => {}}
        width="100%"
        height="100%"
      />
    );

    await waitFor(() => expect(chessgroundFactory).toHaveBeenCalledTimes(1));

    const [element, config] = chessgroundFactory.mock.calls[0];
    expect(element).toBeInstanceOf(HTMLDivElement);
    expect(config.orientation).toBe('black');
    expect(config.turnColor).toBe('black');
    expect(config.movable.color).toBe('black');
  });

  test('allows a swipe on an empty square while preserving touch events on a draggable piece', async () => {
    render(<ChessgroundBoard fen="4k3/8/8/8/8/8/4P3/4K3 w - - 0 1" orientation="white" movableColor="white" />);
    const [container] = chessgroundFactory.mock.calls[0];
    const board = document.createElement('cg-board');
    container.appendChild(board);
    board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800 });
    const boardTouch = vi.fn();
    board.addEventListener('touchstart', boardTouch);
    const touchAt = (x, y) => {
      const event = new Event('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }] });
      board.dispatchEvent(event);
      return event;
    };
    expect(touchAt(50, 350).defaultPrevented).toBe(false);
    expect(boardTouch).not.toHaveBeenCalled();
    touchAt(450, 650); // e2 pawn remains draggable
    expect(boardTouch).toHaveBeenCalledTimes(1);
  });

  test('allows scrolling over pieces once the puzzle is complete', () => {
    render(<ChessgroundBoard fen="4k3/8/8/8/8/8/4P3/4K3 w - - 0 1" orientation="white" movableColor="white" allowBoardScroll />);
    const [container] = chessgroundFactory.mock.calls[0];
    const board = document.createElement('cg-board');
    container.appendChild(board);
    board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800 });
    const boardTouch = vi.fn();
    board.addEventListener('touchstart', boardTouch);
    const event = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: [{ clientX: 450, clientY: 650 }] });
    board.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(boardTouch).not.toHaveBeenCalled();
  });

  test('passes typed overlay arrows through to Chessground', async () => {
    render(
      <ChessgroundBoard
        fen="8/8/8/8/8/8/8/4K3 w - - 0 1"
        orientation="white"
        movableColor="white"
        onMove={() => {}}
        width="100%"
        height="100%"
        customArrows={[
          ['e2', 'e4'],
          { orig: 'e4', dest: 'e8', brush: 'yellow' },
          { orig: 'e4', dest: 'a4', brush: 'red' }
        ]}
      />
    );

    await waitFor(() => expect(chessgroundFactory).toHaveBeenCalledTimes(1));

    const [, config] = chessgroundFactory.mock.calls[0];

    expect(config.drawable.shapes).toEqual([
      { orig: 'e2', dest: 'e4', brush: 'green' },
      { orig: 'e4', dest: 'e8', brush: 'yellow', modifiers: undefined },
      { orig: 'e4', dest: 'a4', brush: 'red', modifiers: undefined }
    ]);
  });
});
