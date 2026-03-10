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
});
