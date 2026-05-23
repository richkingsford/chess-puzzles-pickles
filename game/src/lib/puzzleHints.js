export const HINTS_PER_PLAYER_MOVE = 3;

export const splitAnswerMoves = (answer) => String(answer || '')
  .split(',')
  .map((move) => move.trim())
  .filter(Boolean);

const toSafeIndex = (value) => (
  Number.isInteger(value) && value >= 0 ? value : 0
);

export const getPlayerMoveIndexForAnswerMove = (answerMoveIndex = 0) => (
  Math.floor(toSafeIndex(answerMoveIndex) / 2)
);

export const getPlayerMoveNumberForAnswerMove = (answerMoveIndex = 0) => (
  getPlayerMoveIndexForAnswerMove(answerMoveIndex) + 1
);

export const getAnswerMoveIndexForPlayerMove = (playerMoveIndex = 0) => (
  toSafeIndex(playerMoveIndex) * 2
);

export const getPlayerMoveCountFromAnswer = (answer) => (
  Math.ceil(splitAnswerMoves(answer).length / 2)
);

export const hasStructuredMoveHints = (puzzle) => Array.isArray(puzzle?.moveHints);

const normalizeHints = (hints) => (
  Array.isArray(hints)
    ? hints.filter((hint) => typeof hint === 'string')
    : []
);

const normalizeMoveHintGroup = (group, fallbackPlayerMoveIndex) => {
  const hints = Array.isArray(group) ? group : normalizeHints(group?.hints);
  const playerMoveIndex =
    Number.isInteger(group?.playerMoveIndex) && group.playerMoveIndex >= 0
      ? group.playerMoveIndex
      : fallbackPlayerMoveIndex;
  const answerMoveIndex =
    Number.isInteger(group?.answerMoveIndex) && group.answerMoveIndex >= 0
      ? group.answerMoveIndex
      : getAnswerMoveIndexForPlayerMove(playerMoveIndex);

  return {
    playerMoveIndex,
    answerMoveIndex,
    hints: normalizeHints(hints)
  };
};

export const getMoveHintGroups = (puzzle) => {
  if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
    return [];
  }

  if (hasStructuredMoveHints(puzzle)) {
    return puzzle.moveHints.map((group, index) => normalizeMoveHintGroup(group, index));
  }

  const legacyHints = normalizeHints(puzzle.hints);
  return legacyHints.length
    ? [{ playerMoveIndex: 0, answerMoveIndex: 0, hints: legacyHints }]
    : [];
};

export const getHintsForPlayerMove = (puzzle, playerMoveIndex = 0) => {
  if (!hasStructuredMoveHints(puzzle)) {
    return getMoveHintGroups(puzzle)[0]?.hints || [];
  }

  const safePlayerMoveIndex = toSafeIndex(playerMoveIndex);
  const group = getMoveHintGroups(puzzle).find(
    (candidate) => candidate.playerMoveIndex === safePlayerMoveIndex
  );

  return group?.hints || [];
};

export const getHintsForAnswerMove = (puzzle, answerMoveIndex = 0) => (
  getHintsForPlayerMove(puzzle, getPlayerMoveIndexForAnswerMove(answerMoveIndex))
);

export const normalizeHintRevealCounts = (counts) => {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
    return {};
  }

  return Object.entries(counts).reduce((normalized, [key, value]) => {
    const numericKey = Number(key);
    const numericValue = Number(value);
    if (!Number.isInteger(numericKey) || numericKey < 0 || !Number.isFinite(numericValue) || numericValue <= 0) {
      return normalized;
    }

    normalized[String(numericKey)] = Math.floor(numericValue);
    return normalized;
  }, {});
};

export const getHintRevealCountForPlayerMove = (counts, playerMoveIndex = 0) => {
  const normalized = normalizeHintRevealCounts(counts);
  return normalized[String(toSafeIndex(playerMoveIndex))] || 0;
};

export const getHintRevealCountForAnswerMove = (counts, answerMoveIndex = 0) => (
  getHintRevealCountForPlayerMove(counts, getPlayerMoveIndexForAnswerMove(answerMoveIndex))
);

export const getTotalHintRevealCount = (counts) => (
  Object.values(normalizeHintRevealCounts(counts)).reduce((sum, count) => sum + count, 0)
);

export const revealNextHintForAnswerMove = (counts, puzzle, answerMoveIndex = 0) => {
  const playerMoveIndex = hasStructuredMoveHints(puzzle)
    ? getPlayerMoveIndexForAnswerMove(answerMoveIndex)
    : 0;
  const key = String(playerMoveIndex);
  const hints = getHintsForPlayerMove(puzzle, playerMoveIndex);
  const normalized = normalizeHintRevealCounts(counts);
  const currentCount = normalized[key] || 0;

  if (currentCount >= hints.length) {
    return normalized;
  }

  return {
    ...normalized,
    [key]: currentCount + 1
  };
};

export const auditMoveHintGroups = (puzzle) => {
  if (!hasStructuredMoveHints(puzzle)) {
    return [];
  }

  const playerMoveCount = getPlayerMoveCountFromAnswer(puzzle?.answer);
  const groups = getMoveHintGroups(puzzle);
  const failures = [];

  if (groups.length !== playerMoveCount) {
    failures.push({
      code: 'move-hint-group-count-mismatch',
      expected: playerMoveCount,
      actual: groups.length
    });
  }

  groups.forEach((group, groupIndex) => {
    if (group.playerMoveIndex !== groupIndex) {
      failures.push({
        code: 'move-hint-index-mismatch',
        expected: groupIndex,
        actual: group.playerMoveIndex
      });
    }

    if (group.answerMoveIndex !== getAnswerMoveIndexForPlayerMove(group.playerMoveIndex)) {
      failures.push({
        code: 'move-hint-answer-index-mismatch',
        playerMoveIndex: group.playerMoveIndex,
        expected: getAnswerMoveIndexForPlayerMove(group.playerMoveIndex),
        actual: group.answerMoveIndex
      });
    }

    if (group.hints.length !== HINTS_PER_PLAYER_MOVE) {
      failures.push({
        code: 'move-hint-count-mismatch',
        playerMoveIndex: group.playerMoveIndex,
        expected: HINTS_PER_PLAYER_MOVE,
        actual: group.hints.length
      });
    }
  });

  return failures;
};
