import { getStore } from '@netlify/blobs';
import { createRoomCode, isValidRoomCode, normalizeRoomCode } from '../../src/lib/roomCodes.js';
import { getRandomPlayerName } from '../../src/lib/playerNames.js';

const ROOM_TTL_MS = 1000 * 60 * 30;
const PLAYER_STALE_MS = 1000 * 15;
const MAX_PLAYERS = 2;
const ENEMY_MAX_HP = 240;
const CORRECT_MOVE_DAMAGE = 4;
const STORE_NAME = 'pickle-rooms';

const now = () => Date.now();

const roomKey = (code) => `room-${code}`;

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: {
    'cache-control': 'no-store'
  }
});

const cleanText = (value, fallback) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18);
  return text || fallback;
};

const getOpenCharacterId = (room) => {
  const taken = new Set((room.players || []).map((player) => player.characterId));
  return taken.has('character1') ? 'character2' : 'character1';
};

const makeRoom = (code) => ({
  code,
  createdAt: now(),
  updatedAt: now(),
  enemyHp: ENEMY_MAX_HP,
  enemyMaxHp: ENEMY_MAX_HP,
  status: 'fighting',
  players: [],
  lastAction: null
});

const serializeRoom = (room) => {
  const currentTime = now();

  return {
    code: room.code,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    enemyHp: room.enemyHp,
    enemyMaxHp: room.enemyMaxHp,
    status: room.status,
    lastAction: room.lastAction,
    players: (room.players || []).map((player) => ({
      id: player.id,
      name: player.name,
      host: player.host,
      connected: Boolean(player.connected && currentTime - Number(player.lastSeenAt || 0) <= PLAYER_STALE_MS),
      characterId: player.characterId,
      solved: player.solved,
      correctMoves: player.correctMoves,
      mistakes: player.mistakes,
      hints: player.hints,
      damage: player.damage,
      joinedAt: player.joinedAt
    }))
  };
};

const getRoomsStore = () => getStore({ name: STORE_NAME, consistency: 'strong' });

const getRoomEntry = async (store, code) => (
  store.getWithMetadata(roomKey(code), {
    consistency: 'strong',
    type: 'json'
  })
);

const saveRoom = async (store, room, options = {}) => {
  room.updatedAt = now();

  return store.setJSON(roomKey(room.code), room, {
    ...options,
    metadata: {
      expiresAt: room.updatedAt + ROOM_TTL_MS
    }
  });
};

const addPlayerToRoom = (room, message, host = false) => {
  const currentTime = now();
  const clientId = cleanText(message.clientId, `player-${Math.random().toString(36).slice(2, 8)}`);
  const existingPlayer = room.players.find((player) => player.id === clientId);

  if (!existingPlayer && room.players.length >= MAX_PLAYERS) {
    const replaceableIndex = room.players.findIndex((player) => !player.connected);

    if (replaceableIndex === -1) {
      return {
        error: 'Room is full.'
      };
    }

    room.players.splice(replaceableIndex, 1);
  }

  const player = existingPlayer || {
    id: clientId,
    host,
    joinedAt: currentTime,
    characterId: message.characterId || getOpenCharacterId(room),
    solved: 0,
    correctMoves: 0,
    mistakes: 0,
    hints: 0,
    damage: 0
  };

  player.name = cleanText(message.name, getRandomPlayerName());
  player.connected = true;
  player.lastSeenAt = currentTime;
  player.host = Boolean(player.host || host);

  if (!existingPlayer) {
    room.players.push(player);
  }

  return { player };
};

const touchPlayer = (room, playerId) => {
  const player = room.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    return null;
  }

  player.connected = true;
  player.lastSeenAt = now();
  return player;
};

const markStalePlayers = (room) => {
  const cutoff = now() - PLAYER_STALE_MS;

  room.players.forEach((player) => {
    if (Number(player.lastSeenAt || 0) < cutoff) {
      player.connected = false;
    }
  });
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
  player.damage += safeAmount;
  room.lastAction = {
    kind,
    playerId: player.id,
    amount: safeAmount,
    at: now()
  };

  if (room.enemyHp <= 0) {
    room.status = 'defeated';
  }
};

const mutateRoom = async (code, mutator) => {
  const store = getRoomsStore();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const entry = await getRoomEntry(store, code);
    const room = entry?.data;

    if (!room || now() - Number(room.updatedAt || 0) > ROOM_TTL_MS) {
      return json({ type: 'room_error', message: 'Room not found.' }, 404);
    }

    markStalePlayers(room);
    const result = mutator(room);

    if (result?.error) {
      return json({ type: 'room_error', message: result.error }, result.status || 400);
    }

    const saved = await saveRoom(store, room, { onlyIfMatch: entry.etag });
    if (saved.modified) {
      return json(result?.body || {
        type: 'room_snapshot',
        room: serializeRoom(room)
      });
    }
  }

  return json({ type: 'room_error', message: 'Room changed too quickly. Try again.' }, 409);
};

const handleHost = async (message) => {
  const store = getRoomsStore();

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const code = createRoomCode();
    const room = makeRoom(code);
    const { player } = addPlayerToRoom(room, message, true);
    const saved = await saveRoom(store, room, { onlyIfNew: true });

    if (saved.modified) {
      return json({
        type: 'room_joined',
        roomCode: room.code,
        playerId: player.id,
        room: serializeRoom(room)
      });
    }
  }

  return json({ type: 'room_error', message: 'Could not create room.' }, 500);
};

const handleJoin = async (message) => {
  const code = normalizeRoomCode(message.code);

  if (!isValidRoomCode(code)) {
    return json({ type: 'room_error', message: 'Enter a 4-character room code.' }, 400);
  }

  return mutateRoom(code, (room) => {
    const result = addPlayerToRoom(room, message, false);

    if (result.error) {
      return result;
    }

    return {
      body: {
        type: 'room_joined',
        roomCode: room.code,
        playerId: result.player.id,
        room: serializeRoom(room)
      }
    };
  });
};

const handleSnapshot = async (message) => {
  const code = normalizeRoomCode(message.code);

  if (!isValidRoomCode(code)) {
    return json({ type: 'room_error', message: 'Room not found.' }, 404);
  }

  return mutateRoom(code, (room) => {
    const player = touchPlayer(room, cleanText(message.playerId || message.clientId, ''));

    if (!player) {
      return {
        error: 'Not in this room.',
        status: 403
      };
    }

    return null;
  });
};

const handleProgress = async (message) => {
  const code = normalizeRoomCode(message.code);

  if (!isValidRoomCode(code)) {
    return json({ type: 'room_error', message: 'Room not found.' }, 404);
  }

  return mutateRoom(code, (room) => {
    const player = touchPlayer(room, cleanText(message.playerId || message.clientId, ''));

    if (!player) {
      return {
        error: 'Not in this room.',
        status: 403
      };
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
    }

    if (message.action === 'hint') {
      player.hints += 1;
    }

    return null;
  });
};

const handleLeave = async (message) => {
  const code = normalizeRoomCode(message.code);

  if (!isValidRoomCode(code)) {
    return json({ type: 'room_left' });
  }

  return mutateRoom(code, (room) => {
    const player = room.players.find((candidate) => candidate.id === cleanText(message.playerId || message.clientId, ''));

    if (player) {
      player.connected = false;
      player.lastSeenAt = 0;
    }

    return {
      body: {
        type: 'room_left',
        room: serializeRoom(room)
      }
    };
  });
};

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    return json({
      ok: true,
      service: 'pickle-rooms'
    });
  }

  if (request.method !== 'POST') {
    return json({ type: 'room_error', message: 'Use POST.' }, 405);
  }

  let message;

  try {
    message = await request.json();
  } catch {
    return json({ type: 'room_error', message: 'Invalid room message.' }, 400);
  }

  if (message.type === 'host') {
    return handleHost(message);
  }

  if (message.type === 'join') {
    return handleJoin(message);
  }

  if (message.type === 'snapshot') {
    return handleSnapshot(message);
  }

  if (message.type === 'progress') {
    return handleProgress(message);
  }

  if (message.type === 'leave') {
    return handleLeave(message);
  }

  return json({ type: 'room_error', message: 'Unknown room action.' }, 400);
};
