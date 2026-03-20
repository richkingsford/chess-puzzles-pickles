import { Chess } from 'chess.js';
import { parsePuzzleUrl } from './utils.js';

export const PUZZLE_URL_REGEX = /^https?:\/\/lichess\.org\/analysis\//i;

export const GENERIC_TAGS = new Set([
  'check',
  'capture',
  'mate',
  'attack',
  'king-safety',
  'defense'
]);

export const STRICTLY_GENERIC_TAGS = new Set([
  ...GENERIC_TAGS,
  'mate-pattern',
  'win-material',
  'end-game'
]);

export const NEAR_EDGE_GENERIC_TAGS = new Set([
  'king-safety-issue',
  'weak-square-theme',
  'pawn-structure-shift',
  'tempo-gain-sequence',
  'piece-activity-swing',
  'initiative-pressure'
]);

export const MIN_TAGS_PER_PUZZLE = 3;

const CANONICAL_TAG_ALIASES = new Map([
  ['opening-tactic', 'opening-tactics'],
  ['king-side-attack', 'kingside-attack']
]);

export const getCategoryPuzzlesMap = (categoryData) => {
  if (!categoryData || typeof categoryData !== 'object' || Array.isArray(categoryData)) {
    return {};
  }

  if (
    categoryData.puzzles &&
    typeof categoryData.puzzles === 'object' &&
    !Array.isArray(categoryData.puzzles)
  ) {
    return categoryData.puzzles;
  }

  const { type: _ignoredType, ...legacyPuzzleMap } = categoryData;
  return legacyPuzzleMap;
};

export const getPuzzleAnswer = (puzzleData) => {
  if (typeof puzzleData === 'string') {
    return puzzleData;
  }

  if (
    puzzleData &&
    typeof puzzleData === 'object' &&
    !Array.isArray(puzzleData) &&
    typeof puzzleData.answer === 'string'
  ) {
    return puzzleData.answer;
  }

  return '';
};

export const splitAnswerMoves = (answer) => String(answer || '')
  .split(',')
  .map((move) => move.trim())
  .filter(Boolean);

export const normalizeTag = (tag) => {
  const normalized = String(tag || '').replace(/\/all$/i, '').trim();
  return CANONICAL_TAG_ALIASES.get(normalized) || normalized;
};

export const normalizeTagKey = (tag) => String(tag || '')
  .toLowerCase()
  .trim()
  .replace(/[\s_]+/g, '-')
  .replace(/-+/g, '-');

export const buildTagDefinitionIndex = (dictionaryData) => {
  const index = new Set();
  const entries = Array.isArray(dictionaryData?.entries) ? dictionaryData.entries : [];

  entries.forEach((entry) => {
    index.add(normalizeTagKey(entry?.name));

    const aliases = Array.isArray(entry?.aliases) ? entry.aliases : [];
    aliases.forEach((alias) => index.add(normalizeTagKey(alias)));
  });

  return index;
};

export const getAllPuzzleEntries = (puzzlesData) => {
  if (!puzzlesData || typeof puzzlesData !== 'object' || Array.isArray(puzzlesData)) {
    return [];
  }

  return Object.entries(puzzlesData).flatMap(([category, categoryData]) => (
    Object.entries(getCategoryPuzzlesMap(categoryData)).map(([url, puzzleData]) => ({
      category,
      url,
      puzzleData
    }))
  ));
};

const createFailure = (entry, code, details = {}) => ({
  category: entry.category,
  url: entry.url,
  code,
  ...details
});

export const auditPuzzleEntry = (entry, options = {}) => {
  const failures = [];

  if (!PUZZLE_URL_REGEX.test(entry.url)) {
    failures.push(createFailure(entry, 'invalid-url-key'));
    return { failures, sideToMove: null };
  }

  const fen = parsePuzzleUrl(entry.url);
  if (!fen) {
    failures.push(createFailure(entry, 'invalid-fen'));
    return { failures, sideToMove: null };
  }

  let game;
  try {
    game = new Chess(fen);
  } catch (error) {
    failures.push(createFailure(entry, 'invalid-fen', { message: error.message }));
    return { failures, sideToMove: null };
  }

  const sideToMove = game.turn();
  if (!game.moves({ verbose: true }).length) {
    failures.push(createFailure(entry, 'no-legal-start-moves'));
  }

  const answerMoves = splitAnswerMoves(getPuzzleAnswer(entry.puzzleData));
  if (!answerMoves.length) {
    failures.push(createFailure(entry, 'missing-answer'));
  } else {
    const replay = new Chess(fen);

    answerMoves.forEach((san, index) => {
      try {
        const move = replay.move(san);
        if (!move) {
          failures.push(createFailure(entry, 'invalid-answer-sequence', {
            moveIndex: index,
            san
          }));
        }
      } catch (error) {
        failures.push(createFailure(entry, 'invalid-answer-sequence', {
          moveIndex: index,
          san,
          message: error.message
        }));
      }
    });

    const firstSan = answerMoves[0];
    if (firstSan) {
      try {
        const sanProbe = new Chess(fen);
        const parsedMove = sanProbe.move(firstSan);

        if (!parsedMove) {
          failures.push(createFailure(entry, 'first-move-not-playable', { san: firstSan }));
        } else {
          const promotion = String(firstSan).match(/=([QRBN])/i)?.[1]?.toLowerCase();
          const dropProbe = new Chess(fen);
          const playedBySquares = dropProbe.move({
            from: parsedMove.from,
            to: parsedMove.to,
            ...(promotion ? { promotion } : {})
          });

          if (!playedBySquares) {
            failures.push(createFailure(entry, 'first-move-not-draggable', {
              san: firstSan,
              from: parsedMove.from,
              to: parsedMove.to
            }));
          }
        }
      } catch (error) {
        failures.push(createFailure(entry, 'first-move-not-playable', {
          san: firstSan,
          message: error.message
        }));
      }
    }
  }

  const tags = Array.isArray(entry.puzzleData?.tags)
    ? entry.puzzleData.tags.filter((tag) => typeof tag === 'string')
    : [];

  const minTags = Number.isInteger(options.minTagsPerPuzzle)
    ? options.minTagsPerPuzzle
    : MIN_TAGS_PER_PUZZLE;

  if (tags.length < minTags) {
    failures.push(createFailure(entry, 'insufficient-tags', {
      tagCount: tags.length,
      minTags
    }));
  }

  const tagDefinitionIndex = options.tagDefinitionIndex instanceof Set
    ? options.tagDefinitionIndex
    : null;

  const seenTags = new Set();

  tags.forEach((tag) => {
    if (/\/all$/i.test(tag)) {
      failures.push(createFailure(entry, 'tag-has-all-suffix', { tag }));
    }

    const canonicalTag = normalizeTag(tag);
    if (canonicalTag !== tag) {
      failures.push(createFailure(entry, 'tag-not-canonical', {
        tag,
        expected: canonicalTag
      }));
    }

    const normalizedKey = normalizeTagKey(canonicalTag);
    if (seenTags.has(normalizedKey)) {
      failures.push(createFailure(entry, 'duplicate-tag', { tag: canonicalTag }));
    } else {
      seenTags.add(normalizedKey);
    }

    if (STRICTLY_GENERIC_TAGS.has(normalizedKey)) {
      failures.push(createFailure(entry, 'generic-tag', { tag: canonicalTag }));
    }

    if (NEAR_EDGE_GENERIC_TAGS.has(normalizedKey)) {
      failures.push(createFailure(entry, 'near-generic-tag', { tag: canonicalTag }));
    }

    if (tagDefinitionIndex && !tagDefinitionIndex.has(normalizedKey)) {
      failures.push(createFailure(entry, 'undefined-tag', { tag: canonicalTag }));
    }
  });

  return { failures, sideToMove };
};

export const auditPuzzlesData = (puzzlesData, options = {}) => {
  const entries = getAllPuzzleEntries(puzzlesData);
  const failures = [];
  const sideToMoveCounts = { w: 0, b: 0 };
  const failureCounts = {};

  entries.forEach((entry) => {
    const result = auditPuzzleEntry(entry, options);

    if (result.sideToMove === 'w' || result.sideToMove === 'b') {
      sideToMoveCounts[result.sideToMove] += 1;
    }

    result.failures.forEach((failure) => {
      failures.push(failure);
      failureCounts[failure.code] = (failureCounts[failure.code] || 0) + 1;
    });
  });

  return {
    summary: {
      totalPuzzles: entries.length,
      validPuzzles: entries.length - failures.length,
      failureCount: failures.length,
      sideToMoveCounts,
      failureCounts
    },
    failures
  };
};

export const formatAuditFailure = (failure) => {
  const bits = [
    failure.code,
    failure.category,
    failure.url
  ];

  if (failure.tag) {
    bits.push(`tag=${failure.tag}`);
  }
  if (failure.expected) {
    bits.push(`expected=${failure.expected}`);
  }
  if (Number.isInteger(failure.moveIndex)) {
    bits.push(`moveIndex=${failure.moveIndex}`);
  }
  if (failure.san) {
    bits.push(`san=${failure.san}`);
  }
  if (failure.message) {
    bits.push(`message=${failure.message}`);
  }
  if (Number.isInteger(failure.tagCount)) {
    bits.push(`tagCount=${failure.tagCount}`);
  }
  if (Number.isInteger(failure.minTags)) {
    bits.push(`minTags=${failure.minTags}`);
  }

  return bits.join(' | ');
};

export const formatAuditFailures = (failures, limit = 20) => {
  const visible = failures.slice(0, limit).map(formatAuditFailure);
  const remainder = failures.length - visible.length;

  if (remainder > 0) {
    visible.push(`... ${remainder} more failures`);
  }

  return visible.join('\n');
};
