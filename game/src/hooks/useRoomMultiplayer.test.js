import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useRoomMultiplayer } from './useRoomMultiplayer';

const makeRoom = (overrides = {}) => ({
  code: 'ABCD',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  enemyHp: 240,
  enemyMaxHp: 240,
  status: 'fighting',
  lastAction: null,
  players: [
    {
      id: 'player-one',
      name: 'Player One',
      host: true,
      connected: true,
      characterId: 'character1',
      solved: 0,
      correctMoves: 0,
      mistakes: 0,
      hints: 0,
      damage: 0,
      joinedAt: Date.now()
    }
  ],
  ...overrides
});

const mockJsonResponse = (body, init = {}) => Promise.resolve(new Response(JSON.stringify(body), {
  status: init.status || 200,
  headers: {
    'content-type': 'application/json'
  }
}));

describe('useRoomMultiplayer', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('hosts a room through the Netlify room API', async () => {
    fetch.mockImplementation(() => mockJsonResponse({
      type: 'room_joined',
      playerId: 'player-one',
      roomCode: 'ABCD',
      room: makeRoom()
    }));

    const { result, unmount } = renderHook(() => useRoomMultiplayer());

    await act(async () => {
      await result.current.hostRoom();
    });

    expect(fetch.mock.calls[0][0]).toContain('/.netlify/functions/rooms');
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({
      method: 'POST'
    }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      type: 'host',
      characterId: 'character1'
    });
    expect(result.current.status).toBe('joined');
    expect(result.current.playerId).toBe('player-one');
    expect(result.current.room.code).toBe('ABCD');

    unmount();
  });

  test('sends progress updates through the room API after joining', async () => {
    fetch
      .mockImplementationOnce(() => mockJsonResponse({
        type: 'room_joined',
        playerId: 'player-one',
        roomCode: 'ABCD',
        room: makeRoom()
      }))
      .mockImplementationOnce(() => mockJsonResponse({
        type: 'room_snapshot',
        room: makeRoom({
          enemyHp: 236,
          lastAction: {
            kind: 'correct_move',
            playerId: 'player-one',
            amount: 4,
            at: Date.now()
          }
        })
      }));

    const { result, unmount } = renderHook(() => useRoomMultiplayer());

    await act(async () => {
      await result.current.hostRoom();
    });

    act(() => {
      result.current.recordCorrectMove();
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
      type: 'progress',
      code: 'ABCD',
      playerId: 'player-one',
      action: 'correct_move'
    });

    unmount();
  });

  test('rejects invalid room codes before calling the API', async () => {
    const { result, unmount } = renderHook(() => useRoomMultiplayer());

    await act(async () => {
      await result.current.joinRoom('no');
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Enter a 4-character room code.');

    unmount();
  });
});
