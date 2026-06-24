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
  /\btactical idea\b/i,
  /\bmaterial weaknesses matter when one target lacks steady support\b/i,
  /\bloose targets become vulnerable when their guards are stretched thin\b/i,
  /\ba hanging target is vulnerable when nearby cover is unreliable\b/i,
  /\btrapped kings become vulnerable when escape routes are sealed\b/i,
  /\bback-line shelter becomes fragile when flight squares disappear\b/i,
  /\ba cramped king is vulnerable when nearby cover blocks escape\b/i,
  /\bking safety becomes vulnerable when the shelter has loose cover\b/i,
  /\bforcing threats matter when the king has little room\b/i,
  /\ba king under thin cover is vulnerable to tempo pressure\b/i,
  /\brace positions become vulnerable when the defender is one step late\b/i,
  /\bopening coordination is vulnerable when the back line is unsettled\b/i,
  /\bking safety turns fragile when the center is still loose\b/i,
  /\bendgame balance breaks when two weaknesses stretch one side\b/i,
  /\bendgames turn fragile when one defender lacks a spare tempo\b/i,
  /\bpromotion races become vulnerable when the back line is late\b/i,
  /\bunfinished development is vulnerable when central cover is thin\b/i,
  /\badvanced passers become dangerous when the defense lacks time\b/i,
  /\ba queening race turns fragile when the stopper is stretched\b/i,
  /\btactical weaknesses grow when loose cover surrounds a target\b/i,
  /\bshared lines become fragile when defenders depend on one path\b/i,
  /\bquiet positions become fragile when one area lacks steady support\b/i,
  /\bweak coordination becomes vulnerable when defenders cannot share duties\b/i,
  /\blimited exits become vulnerable when retreat squares disappear\b/i,
  /\bpinned lines become vulnerable when a guard cannot freely leave\b/i,
  /\ba front target becomes fragile when another target waits behind it\b/i,
  /\bline control matters when a thin cover piece blocks pressure\b/i,
  /\bhidden lines become vulnerable when only one blocker remains\b/i,
  /\ba trapped unit is fragile when every escape path is watched\b/i,
  /\ba tied defender becomes fragile when something valuable sits behind it\b/i,
  /\bline pressure matters when one defender is stuck in place\b/i,
  /\bpoor mobility becomes a weakness when the edges close in\b/i,
  /\bcrowded targets become vulnerable when spacing disappears\b/i,
  /\bfork patterns grow from targets that cannot both stay safe\b/i,
  /\bclustered valuables become fragile when one tempo can touch both\b/i,
  /\bstacked targets become vulnerable when the front one must move\b/i,
  /\bskewer patterns appear when valuables share the same line\b/i,
  /\boverloaded guards become vulnerable when one defender has too many jobs\b/i,
  /\ba key guard turns fragile when several duties pull on it\b/i,
  /\bdefensive balance breaks when one guard protects too much\b/i
];

const SQUARE_ID_PATTERN = /\b[a-h][1-8]\b/i;
const SECOND_HINT_OWN_SIDE_PATTERN = /\b(?:your|our|my)\b/i;
const SECOND_HINT_DIRECTIVE_PATTERN = /\b(?:find|play|move|try|start|begin|use|search|look for)\b/i;
const SECOND_HINT_PIECE_NAME_PATTERN = /\b(?:king|queen|rook|bishop|knight|pawn)\b/i;
const SECOND_HINT_SAN_PATTERN = /\b(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8]=[QRBN][+#]?)\b/;
const SECOND_HINT_MIGRATED_PATTERN = /\bthe (?:(?:next|later|finishing|follow-up) )?opportunity is\b/i;

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

const countSentences = (hint) => (
  String(hint || '')
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .length
);

const firstHintUsesSquareId = (hint) => SQUARE_ID_PATTERN.test(String(hint || ''));

const secondHintLooksMigrated = (hint) => SECOND_HINT_MIGRATED_PATTERN.test(String(hint || ''));

const secondHintUsesSquareId = (hint) => SQUARE_ID_PATTERN.test(String(hint || ''));

const secondHintNamesPiece = (hint) => SECOND_HINT_PIECE_NAME_PATTERN.test(String(hint || ''));

const secondHintPointsAtOwnSide = (hint) => SECOND_HINT_OWN_SIDE_PATTERN.test(String(hint || ''));

const secondHintDirectsPlayer = (hint) => SECOND_HINT_DIRECTIVE_PATTERN.test(String(hint || ''));

const secondHintUsesSan = (hint) => SECOND_HINT_SAN_PATTERN.test(String(hint || ''));

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

    if (typeof firstHint === 'string' && countSentences(firstHint) !== 2) {
      failures.push({
        code: 'move-hint-first-sentence-count',
        playerMoveIndex: group.playerMoveIndex,
        hintIndex: FIRST_HINT_INDEX,
        hintText: firstHint
      });
    }

    if (typeof firstHint === 'string' && firstHintUsesSquareId(firstHint)) {
      failures.push({
        code: 'move-hint-first-square-id',
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

    if (typeof secondHint === 'string' && secondHintLooksMigrated(secondHint)) {
      if (countSentences(secondHint) !== 2) {
        failures.push({
          code: 'move-hint-second-sentence-count',
          playerMoveIndex: group.playerMoveIndex,
          hintIndex: SECOND_HINT_INDEX,
          hintText: secondHint
        });
      }

      if (secondHintUsesSquareId(secondHint)) {
        failures.push({
          code: 'move-hint-second-square-id',
          playerMoveIndex: group.playerMoveIndex,
          hintIndex: SECOND_HINT_INDEX,
          hintText: secondHint
        });
      }

      if (secondHintUsesSan(secondHint)) {
        failures.push({
          code: 'move-hint-second-san-notation',
          playerMoveIndex: group.playerMoveIndex,
          hintIndex: SECOND_HINT_INDEX,
          hintText: secondHint
        });
      }

      if (secondHintNamesPiece(secondHint)) {
        failures.push({
          code: 'move-hint-second-piece-name',
          playerMoveIndex: group.playerMoveIndex,
          hintIndex: SECOND_HINT_INDEX,
          hintText: secondHint
        });
      }

      if (secondHintPointsAtOwnSide(secondHint)) {
        failures.push({
          code: 'move-hint-second-points-at-own-side',
          playerMoveIndex: group.playerMoveIndex,
          hintIndex: SECOND_HINT_INDEX,
          hintText: secondHint
        });
      }

      if (secondHintDirectsPlayer(secondHint)) {
        failures.push({
          code: 'move-hint-second-directs-player',
          playerMoveIndex: group.playerMoveIndex,
          hintIndex: SECOND_HINT_INDEX,
          hintText: secondHint
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
