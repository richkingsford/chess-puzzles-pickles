import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeRoomCode, isValidRoomCode } from '../lib/roomCodes';
import { getOrCreatePlayerName } from '../lib/playerNames';

const CLIENT_ID_KEY = 'pickle-room-client-id';
const ATTACK_FLASH_MS = 520;

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

const getDefaultRoomServerUrl = () => {
  if (typeof window === 'undefined') {
    return 'ws://localhost:8787';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:8787`;
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
  const socketRef = useRef(null);
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

  const roomServerUrl = useMemo(
    () => import.meta.env.VITE_ROOM_SERVER_URL || getDefaultRoomServerUrl(),
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

  const handleMessage = useCallback((event) => {
    let message;

    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === 'room_joined') {
      setStatus('joined');
      setPlayerId(message.playerId);
      setError(null);
      return;
    }

    if (message.type === 'room_snapshot') {
      setStatus('joined');
      setError(null);
      handleSnapshot(message.room);
      return;
    }

    if (message.type === 'room_error') {
      setError(message.message || 'Room error.');
      setStatus(roomRef.current ? 'joined' : 'error');
    }
  }, [handleSnapshot]);

  const connect = useCallback(() => new Promise((resolve, reject) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      resolve(socketRef.current);
      return;
    }

    if (socketRef.current) {
      socketRef.current.close();
    }

    setStatus('connecting');
    setError(null);

    const socket = new WebSocket(roomServerUrl);
    socketRef.current = socket;

    const timeout = setTimeout(() => {
      reject(new Error('Room service did not respond.'));
      socket.close();
      setStatus('error');
      setError('Room service did not respond.');
    }, 4000);

    socket.onopen = () => {
      clearTimeout(timeout);
      resolve(socket);
    };

    socket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Room service unavailable.'));
      setStatus('error');
      setError('Room service unavailable.');
    };

    socket.onclose = () => {
      if (roomRef.current) {
        setRoom((currentRoom) => currentRoom
          ? {
              ...currentRoom,
              players: currentRoom.players.map((player) => (
                player.id === playerIdRef.current ? { ...player, connected: false } : player
              ))
            }
          : currentRoom);
      }
      setStatus((currentStatus) => (currentStatus === 'joined' ? 'idle' : currentStatus));
    };

    socket.onmessage = handleMessage;
  }), [handleMessage, roomServerUrl]);

  const send = useCallback((payload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  const hostRoom = useCallback(async () => {
    clientIdRef.current = clientIdRef.current || getClientId();
    const socket = await connect();

    socket.send(JSON.stringify({
      type: 'host',
      clientId: clientIdRef.current,
      name: localPlayerName,
      characterId: 'character1'
    }));
  }, [connect, localPlayerName]);

  const joinRoom = useCallback(async (code) => {
    const safeCode = normalizeRoomCode(code);

    if (!isValidRoomCode(safeCode)) {
      setStatus('error');
      setError('Enter a 4-character room code.');
      return;
    }

    clientIdRef.current = clientIdRef.current || getClientId();
    const socket = await connect();

    socket.send(JSON.stringify({
      type: 'join',
      code: safeCode,
      clientId: clientIdRef.current,
      name: localPlayerName,
      characterId: 'character2'
    }));
  }, [connect, localPlayerName]);

  const leaveRoom = useCallback(() => {
    send({ type: 'leave' });
    socketRef.current?.close();
    socketRef.current = null;
    roomRef.current = null;
    playerIdRef.current = null;
    clearTimeout(attackTimerRef.current);
    setRoom(null);
    setPlayerId(null);
    setStatus('idle');
    setError(null);
    setActiveAttackPlayerId(null);
    setEnemyHit(false);
  }, [send]);

  const sendProgress = useCallback((payload) => {
    if (!roomRef.current?.code || !playerIdRef.current) {
      return;
    }

    send({
      type: 'progress',
      ...payload
    });
  }, [send]);

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

  useEffect(() => () => {
    clearTimeout(attackTimerRef.current);
    socketRef.current?.close();
  }, []);

  return {
    status,
    room,
    roomUrl,
    roomServerUrl,
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
