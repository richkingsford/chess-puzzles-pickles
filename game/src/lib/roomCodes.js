const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 4;
const ROOM_CODE_PATTERN = /^[A-Z0-9]{4}$/;

export const normalizeRoomCode = (code) => (
  String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH)
);

export const isValidRoomCode = (code) => ROOM_CODE_PATTERN.test(normalizeRoomCode(code));

export const createRoomCode = () => {
  let code = '';

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }

  return code;
};
