import { WebSocket, WebSocketServer } from 'ws';
import { createRoomCode, normalizeRoomCode, isValidRoomCode } from './src/lib/roomCodes.js';
import { getRandomPlayerName } from './src/lib/playerNames.js';

/* global process */

const PORT = Number(process.env.ROOM_PORT || 8787);
const ROOM_TTL_MS = 1000 * 60 * 30;
const MAX_PLAYERS = 2;
const ENEMY_MAX_HP = 240;
const CORRECT_MOVE_DAMAGE = 4;

const rooms = new Map();
const socketMeta = new WeakMap();

const now = () => Date.now();

const send = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

const cleanText = (value, fallback) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18);
  return text || fallback;
};

const getOpenCharacterId = (room) => {
  const taken = new Set(Array.from(room.players.values()).map((player) => player.characterId));
  return taken.has('character1') ? 'character2' : 'character1';
};

const makeRoom = () => {
  let code = createRoomCode();

  while (rooms.has(code)) {
    code = createRoomCode();
  }

  return {
    code,
    createdAt: now(),
    updatedAt: now(),
    enemyHp: ENEMY_MAX_HP,
    enemyMaxHp: ENEMY_MAX_HP,
    status: 'fighting',
    players: new Map(),
    lastAction: null
  };
};

const serializeRoom = (room) => ({
  code: room.code,
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
  enemyHp: room.enemyHp,
  enemyMaxHp: room.enemyMaxHp,
  status: room.status,
  lastAction: room.lastAction,
  players: Array.from(room.players.values()).map((player) => ({
    id: player.id,
    name: player.name,
    host: player.host,
    connected: player.connected,
    characterId: player.characterId,
    solved: player.solved,
    correctMoves: player.correctMoves,
    mistakes: player.mistakes,
    hints: player.hints,
    damage: player.damage,
    joinedAt: player.joinedAt
  }))
});

const broadcastRoom = (room) => {
  const snapshot = {
    type: 'room_snapshot',
    room: serializeRoom(room)
  };

  room.players.forEach((player) => {
    if (player.socket) {
      send(player.socket, snapshot);
    }
  });
};

const addPlayerToRoom = (room, socket, message, host = false) => {
  const clientId = cleanText(message.clientId, `player-${Math.random().toString(36).slice(2, 8)}`);
  const existingPlayer = room.players.get(clientId);

  if (!existingPlayer && room.players.size >= MAX_PLAYERS) {
    send(socket, {
      type: 'room_error',
      message: 'Room is full.'
    });
    return null;
  }

  const player = existingPlayer || {
    id: clientId,
    host,
    joinedAt: now(),
    characterId: message.characterId || getOpenCharacterId(room),
    solved: 0,
    correctMoves: 0,
    mistakes: 0,
    hints: 0,
    damage: 0
  };

  player.name = cleanText(message.name, getRandomPlayerName());
  player.connected = true;
  player.socket = socket;
  player.host = Boolean(player.host || host);

  room.players.set(player.id, player);
  room.updatedAt = now();
  socketMeta.set(socket, { roomCode: room.code, playerId: player.id });

  send(socket, {
    type: 'room_joined',
    roomCode: room.code,
    playerId: player.id
  });
  broadcastRoom(room);

  return player;
};

const computeSolveDamage = (message) => {
  const elapsedMs = Number(message.elapsedMs || 0);
  const hints = Math.max(0, Number(message.hints || 0));
  const mistakes = Math.max(0, Number(message.mistakes || 0));
  const seconds = elapsedMs > 0 ? elapsedMs / 1000 : 30;
  const speedBonus = Math.max(0, Math.round(14 - Math.min(14, seconds / 2)));
  const accuracyPenalty = (hints * 3) + (mistakes * 4);

  return Math.max(8, 22 + speedBonus - accuracyPenalty);
};

const applyDamage = (room, player, amount, kind) => {
  if (room.status === 'defeated') {
    return;
  }

  const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (safeAmount <= 0) {
    return;
  }

  room.enemyHp = Math.max(0, room.enemyHp - safeAmount);
  room.updatedAt = now();
  player.damage += safeAmount;
  room.lastAction = {
    kind,
    playerId: player.id,
    amount: safeAmount,
    at: room.updatedAt
  };

  if (room.enemyHp <= 0) {
    room.status = 'defeated';
  }
};

const handleProgress = (socket, message) => {
  const meta = socketMeta.get(socket);
  const room = meta ? rooms.get(meta.roomCode) : null;
  const player = room && meta ? room.players.get(meta.playerId) : null;

  if (!room || !player) {
    send(socket, {
      type: 'room_error',
      message: 'Not in a room.'
    });
    return;
  }

  if (message.action === 'correct_move') {
    player.correctMoves += 1;
    applyDamage(room, player, CORRECT_MOVE_DAMAGE, 'correct_move');
  }

  if (message.action === 'puzzle_solved') {
    player.solved += 1;
    applyDamage(room, player, computeSolveDamage(message), 'puzzle_solved');
  }

  if (message.action === 'mistake') {
    player.mistakes += 1;
    room.updatedAt = now();
  }

  if (message.action === 'hint') {
    player.hints += 1;
    room.updatedAt = now();
  }

  broadcastRoom(room);
};

const handleLeave = (socket) => {
  const meta = socketMeta.get(socket);
  if (!meta) return;

  const room = rooms.get(meta.roomCode);
  const player = room?.players.get(meta.playerId);

  if (player) {
    player.connected = false;
    player.socket = null;
    room.updatedAt = now();
    broadcastRoom(room);
  }

  socketMeta.delete(socket);
};

const cleanupRooms = () => {
  const cutoff = now() - ROOM_TTL_MS;

  rooms.forEach((room, code) => {
    const hasConnectedPlayer = Array.from(room.players.values()).some((player) => player.connected);
    if (!hasConnectedPlayer && room.updatedAt < cutoff) {
      rooms.delete(code);
    }
  });
};

setInterval(cleanupRooms, 1000 * 60).unref();

const server = new WebSocketServer({ port: PORT });

server.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let message;

    try {
      message = JSON.parse(String(raw));
    } catch {
      send(socket, {
        type: 'room_error',
        message: 'Invalid room message.'
      });
      return;
    }

    if (message.type === 'host') {
      const room = makeRoom();
      rooms.set(room.code, room);
      addPlayerToRoom(room, socket, message, true);
      return;
    }

    if (message.type === 'join') {
      const code = normalizeRoomCode(message.code);

      if (!isValidRoomCode(code) || !rooms.has(code)) {
        send(socket, {
          type: 'room_error',
          message: 'Room not found.'
        });
        return;
      }

      addPlayerToRoom(rooms.get(code), socket, message, false);
      return;
    }

    if (message.type === 'progress') {
      handleProgress(socket, message);
      return;
    }

    if (message.type === 'leave') {
      handleLeave(socket);
    }
  });

  socket.on('close', () => handleLeave(socket));
});

console.log(`Room service listening on ws://localhost:${PORT}`);
