import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeRoomCode, isValidRoomCode } from '../lib/roomCodes';
import { getOrCreatePlayerName } from '../lib/playerNames';

const CLIENT_ID_KEY = 'pickle-room-client-id';
const ATTACK_FLASH_MS = 520;
const POLL_INTERVAL_MS = 1500;
const ROOM_REQUEST_TIMEOUT_MS = 6000;

const getClientId = () => {
  try {
    const stored = sessionStorage.getItem(CLIENT_ID_KEY);
    if (stored) return stored;

    const generated = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    sessionStorage.setItem(CLIENT_ID_KEY, generated);
    return generated;
  } catch {
    return Math.random().toString(36).slice(2);
  }
};

const getDefaultRoomApiUrl = () => {
  if (typeof window === 'undefined') {
    return '/api/rooms';
  }

  return new URL('/api/rooms', window.location.origin).toString();
};

const getPublicAppBaseUrl = () => {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (typeof window === 'undefined') {
    return '';
  }

  return `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');
};

export const useRoomMultiplayer = () => {
  const [status, setStatus] = useState('idle');
  const [room, setRoom] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [error, setError] = useState(null);
  const [activeAttackPlayerId, setActiveAttackPlayerId] = useState(null);
  const [enemyHit, setEnemyHit] = useState(false);
  const [localPlayerName] = useState(() => getOrCreatePlayerName());
  const clientIdRef = useRef(null);
  const roomRef = useRef(null);
  const playerIdRef = useRef(null);
  const attackTimerRef = useRef(null);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  const roomApiUrl = useMemo(
    () => import.meta.env.VITE_ROOM_API_URL || getDefaultRoomApiUrl(),
    []
  );

  const roomUrl = useMemo(() => {
    if (!room?.code) {
      return '';
    }

    if (typeof window === 'undefined') {
      return '';
    }

    const url = new URL(getPublicAppBaseUrl() || window.location.href);
    url.searchParams.set('room', room.code);
    return url.toString();
  }, [room]);

  const handleSnapshot = useCallback((nextRoom) => {
    setRoom((previousRoom) => {
      const action = nextRoom?.lastAction;
      const previousAction = previousRoom?.lastAction;

      if (action?.at && action.at !== previousAction?.at && action.amount > 0) {
        setActiveAttackPlayerId(action.playerId);
        setEnemyHit(true);
        clearTimeout(attackTimerRef.current);
        attackTimerRef.current = setTimeout(() => {
          setActiveAttackPlayerId(null);
          setEnemyHit(false);
        }, ATTACK_FLASH_MS);
      }

      return nextRoom;
    });
  }, []);

  const applyRoomMessage = useCallback((message) => {
    if (message.type === 'room_joined') {
      setStatus('joined');
      setPlayerId(message.playerId);
      setError(null);
      if (message.room) {
        handleSnapshot(message.room);
      }
      return;
    }

    if (message.type === 'room_snapshot') {
      setStatus('joined');
      setError(null);
      handleSnapshot(message.room);
      return;
    }

    if (message.type === 'room_left') {
      return;
    }

    if (message.type === 'room_error') {
      setError(message.message || 'Room error.');
      setStatus(roomRef.current ? 'joined' : 'error');
    }
  }, [handleSnapshot]);

  const requestRoom = useCallback(async (payload, { silent = false } = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ROOM_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(roomApiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const message = await response.json().catch(() => ({
        type: 'room_error',
        message: 'Room service returned an invalid response.'
      }));

      if (!response.ok || message.type === 'room_error') {
        throw new Error(message.message || 'Room service unavailable.');
      }

      applyRoomMessage(message);
      return message;
    } catch (requestError) {
      if (!silent) {
        const message = requestError.name === 'AbortError'
          ? 'Room service did not respond.'
          : requestError.message || 'Room service unavailable.';
        setError(message);
        setStatus(roomRef.current ? 'joined' : 'error');
      }
      throw requestError;
    } finally {
      clearTimeout(timeout);
    }
  }, [applyRoomMessage, roomApiUrl]);

  const hostRoom = useCallback(async () => {
    clientIdRef.current = clientIdRef.current || getClientId();
    setStatus('connecting');
    setError(null);

    await requestRoom({
      type: 'host',
      clientId: clientIdRef.current,
      name: localPlayerName,
      characterId: 'character1'
    });
  }, [localPlayerName, requestRoom]);

  const joinRoom = useCallback(async (code) => {
    const safeCode = normalizeRoomCode(code);

    if (!isValidRoomCode(safeCode)) {
      setStatus('error');
      setError('Enter a 4-character room code.');
      return;
    }

    clientIdRef.current = clientIdRef.current || getClientId();
    setStatus('connecting');
    setError(null);

    await requestRoom({
      type: 'join',
      code: safeCode,
      clientId: clientIdRef.current,
      name: localPlayerName,
      characterId: 'character2'
    });
  }, [localPlayerName, requestRoom]);

  const leaveRoom = useCallback(() => {
    const code = roomRef.current?.code;
    const currentPlayerId = playerIdRef.current;

    if (code && currentPlayerId) {
      requestRoom({
        type: 'leave',
        code,
        playerId: currentPlayerId,
        clientId: clientIdRef.current
      }, { silent: true }).catch(() => {});
    }

    roomRef.current = null;
    playerIdRef.current = null;
    clearTimeout(attackTimerRef.current);
    setRoom(null);
    setPlayerId(null);
    setStatus('idle');
    setError(null);
    setActiveAttackPlayerId(null);
    setEnemyHit(false);
  }, [requestRoom]);

  const sendProgress = useCallback((payload) => {
    const code = roomRef.current?.code;
    const currentPlayerId = playerIdRef.current;

    if (!code || !currentPlayerId) {
      return;
    }

    requestRoom({
      type: 'progress',
      code,
      playerId: currentPlayerId,
      clientId: clientIdRef.current,
      ...payload
    }, { silent: true }).catch(() => {
      setError('Room sync hiccup. Still trying.');
    });
  }, [requestRoom]);

  const recordCorrectMove = useCallback(() => {
    sendProgress({ action: 'correct_move' });
  }, [sendProgress]);

  const recordPuzzleSolved = useCallback(({ elapsedMs, hints, mistakes }) => {
    sendProgress({
      action: 'puzzle_solved',
      elapsedMs,
      hints,
      mistakes
    });
  }, [sendProgress]);

  const recordMistake = useCallback(() => {
    sendProgress({ action: 'mistake' });
  }, [sendProgress]);

  const recordHint = useCallback(() => {
    sendProgress({ action: 'hint' });
  }, [sendProgress]);

  useEffect(() => {
    if (!room?.code || !playerId) {
      return undefined;
    }

    let isStopped = false;

    const pollRoom = async () => {
      try {
        await requestRoom({
          type: 'snapshot',
          code: room.code,
          playerId,
          clientId: clientIdRef.current
        }, { silent: true });
      } catch {
        if (!isStopped) {
          setError('Room sync hiccup. Still trying.');
        }
      }
    };

    const interval = setInterval(pollRoom, POLL_INTERVAL_MS);
    return () => {
      isStopped = true;
      clearInterval(interval);
    };
  }, [playerId, requestRoom, room?.code]);

  useEffect(() => () => {
    clearTimeout(attackTimerRef.current);
  }, []);

  return {
    status,
    room,
    roomUrl,
    roomServerUrl: roomApiUrl,
    roomApiUrl,
    playerId,
    localPlayerName,
    error,
    isInRoom: Boolean(room?.code && playerId),
    activeAttackPlayerId,
    enemyHit,
    hostRoom,
    joinRoom,
    leaveRoom,
    recordCorrectMove,
    recordPuzzleSolved,
    recordMistake,
    recordHint
  };
};
