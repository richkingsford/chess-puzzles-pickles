export const HINTS_PER_PLAYER_MOVE = 3;
const FIRST_HINT_INDEX = 0;
const DIRECT_MOVE_HINT_INDEX = HINTS_PER_PLAYER_MOVE - 1;
const SECOND_HINT_INDEX = 1;

const VAGUE_MOVE_HINT_PATTERNS = [
  /\bforce the issue\b/i,
  /\bbig clue\b/i,
  /\bdanger is visible\b/i,
  /\bfind the move\b/i,
  /\bbest move\b/i,
  /\bright move\b/i,
  /\bstrong move here\b/i,
  /\btactical idea\b/i
];

const FIRST_HINT_PIECE_PATTERN = /\b(?:king|queen|rook|bishop|knight|pawn|piece|pieces)\b/i;

const PIECE_CUE_PATTERNS = {
  queen: /\bqueen\b/i,
  rook: /\b(?:rook|file|rank)\b/i,
  bishop: /\b(?:bishop|diagonal)\b/i,
  knight: /\b(?:knight|jump)\b/i,
  king: /\b(?:king|opposition|triangulation)\b/i,
  pawn: /\b(?:pawn|passed|lever|push|promotion|promote)\b/i,
  castle: /\b(?:castle|castling|king safety|rook)\b/i
};

const OPPORTUNITY_PATTERNS = {
  mate: /\b(?:mate|king|escape|boxed|flight|shelter)\b/i,
  check: /\b(?:check\w*|king|tempo|reacting|answer)\b/i,
  capture: /\b(?:captur\w*|tak\w*|removes|loose|vulnerable|target|guard|defender|wins)\b/i,
  promotion: /\b(?:promotion|promote|promotes|passed|pawn race|choice)\b/i,
  castle: /\b(?:castle|castling|king safety|rook|safety)\b/i,
  quiet: /\b(?:threat|pressure|tempo|resource|forcing|defense|pawn race|weakness|weaknesses|guard|problem)\b/i
};

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

export const getPlayerAnswerMoves = (answer) => (
  splitAnswerMoves(answer).filter((_, index) => index % 2 === 0)
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

const normalizeHintText = (text) => String(text || '')
  .toLowerCase()
  .replace(/[-/]/g, ' ')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stripSanSuffix = (san) => String(san || '').trim().replace(/[+#]+$/g, '');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hintContainsSanToken = (hint, san) => {
  if (!san) {
    return false;
  }

  const sanToken = escapeRegex(san);
  const tokenPattern = new RegExp(`(^|[^A-Za-z0-9=+#])${sanToken}(?=$|[^A-Za-z0-9=+#])`);
  return tokenPattern.test(String(hint || ''));
};

const hintMentionsSan = (hint, san) => {
  const expected = String(san || '').trim();
  const expectedWithoutSuffix = stripSanSuffix(expected);

  if (!expected) {
    return false;
  }

  return hintContainsSanToken(hint, expected) || (
    expectedWithoutSuffix.length >= 2 && hintContainsSanToken(hint, expectedWithoutSuffix)
  );
};

const isVagueMoveHint = (hint) => (
  VAGUE_MOVE_HINT_PATTERNS.some((pattern) => pattern.test(String(hint || '')))
);

const namesPieceInFirstHint = (hint) => FIRST_HINT_PIECE_PATTERN.test(String(hint || ''));

const getExpectedMovePieceCuePattern = (san) => {
  const move = String(san || '').trim();
  if (/^O-O/.test(move)) return PIECE_CUE_PATTERNS.castle;

  const first = move[0];
  if (first === 'Q') return PIECE_CUE_PATTERNS.queen;
  if (first === 'R') return PIECE_CUE_PATTERNS.rook;
  if (first === 'B') return PIECE_CUE_PATTERNS.bishop;
  if (first === 'N') return PIECE_CUE_PATTERNS.knight;
  if (first === 'K') return PIECE_CUE_PATTERNS.king;
  return PIECE_CUE_PATTERNS.pawn;
};

const getExpectedOpportunityPattern = (san) => {
  const move = String(san || '').trim();
  if (move.includes('=')) return OPPORTUNITY_PATTERNS.promotion;
  if (move.includes('#')) return OPPORTUNITY_PATTERNS.mate;
  if (move.includes('+')) return OPPORTUNITY_PATTERNS.check;
  if (/^O-O/.test(move)) return OPPORTUNITY_PATTERNS.castle;
  if (move.includes('x')) return OPPORTUNITY_PATTERNS.capture;
  return OPPORTUNITY_PATTERNS.quiet;
};

export const auditMoveHintGroups = (puzzle) => {
  if (!hasStructuredMoveHints(puzzle)) {
    return [];
  }

  const playerMoveCount = getPlayerMoveCountFromAnswer(puzzle?.answer);
  const playerAnswerMoves = getPlayerAnswerMoves(puzzle?.answer);
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

    const expectedSan = playerAnswerMoves[groupIndex];
    const firstHint = group.hints[FIRST_HINT_INDEX];
    const finalHint = group.hints[DIRECT_MOVE_HINT_INDEX];
    const secondHint = group.hints[SECOND_HINT_INDEX];

    if (typeof firstHint === 'string' && namesPieceInFirstHint(firstHint)) {
      failures.push({
        code: 'move-hint-first-names-piece',
        playerMoveIndex: group.playerMoveIndex,
        hintIndex: FIRST_HINT_INDEX,
        hintText: firstHint
      });
    }

    if (expectedSan && typeof finalHint === 'string' && !hintMentionsSan(finalHint, expectedSan)) {
      failures.push({
        code: 'move-hint-final-move-mismatch',
        playerMoveIndex: group.playerMoveIndex,
        hintIndex: DIRECT_MOVE_HINT_INDEX,
        hintText: finalHint,
        expectedSan
      });
    }

    if (expectedSan && typeof secondHint === 'string') {
      const pieceCuePattern = getExpectedMovePieceCuePattern(expectedSan);
      const opportunityPattern = getExpectedOpportunityPattern(expectedSan);

      if (!pieceCuePattern.test(secondHint)) {
        failures.push({
          code: 'move-hint-second-missing-piece-cue',
          playerMoveIndex: group.playerMoveIndex,
          hintIndex: SECOND_HINT_INDEX,
          hintText: secondHint,
          expectedSan
        });
      }

      if (!opportunityPattern.test(secondHint)) {
        failures.push({
          code: 'move-hint-second-missing-opportunity-cue',
          playerMoveIndex: group.playerMoveIndex,
          hintIndex: SECOND_HINT_INDEX,
          hintText: secondHint,
          expectedSan
        });
      }
    }

    group.hints.forEach((hint, hintIndex) => {
      const otherSan = playerAnswerMoves.find((candidate, candidateIndex) => (
        candidateIndex !== groupIndex &&
        stripSanSuffix(candidate) !== stripSanSuffix(expectedSan) &&
        hintMentionsSan(hint, candidate)
      ));

      if (otherSan) {
        failures.push({
          code: 'move-hint-references-other-answer-move',
          playerMoveIndex: group.playerMoveIndex,
          hintIndex,
          hintText: hint,
          expectedSan,
          actualSan: otherSan
        });
      }
    });

    group.hints.slice(0, DIRECT_MOVE_HINT_INDEX).forEach((hint, hintIndex) => {
      if (isVagueMoveHint(hint)) {
        failures.push({
          code: 'move-hint-too-vague',
          playerMoveIndex: group.playerMoveIndex,
          hintIndex,
          hintText: hint
        });
      }
    });

    const previousGroup = groups[groupIndex - 1];
    if (
      previousGroup &&
      normalizeHintText(previousGroup.hints[0]) === normalizeHintText(group.hints[0]) &&
      normalizeHintText(previousGroup.hints[1]) === normalizeHintText(group.hints[1])
    ) {
      failures.push({
        code: 'move-hint-repeated-opening-pair',
        playerMoveIndex: group.playerMoveIndex,
        hintIndex: 0,
        hintText: group.hints[0],
        comparedWithPlayerMoveIndex: previousGroup.playerMoveIndex
      });
    }
  });

  return failures;
};
