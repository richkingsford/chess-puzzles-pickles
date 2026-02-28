import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { ChessgroundBoard } from './components/ChessgroundBoard';
import {
  Trophy, HelpCircle, ChevronLeft, ChevronRight,
  RotateCcw, ArrowLeft, Trash2, BookOpen, Shuffle
} from 'lucide-react';
import { usePuzzleGame } from './hooks/usePuzzleGame';
import { parsePuzzleUrl } from './lib/utils';

// --- Components ---

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-4 bg-red-900 border border-red-500 rounded text-red-100">
          <h2 className="font-bold mb-2">Something went wrong</h2>
          <pre className="text-xs overflow-auto">{this.state.error.toString()}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

const formatCategoryLabel = (category) => String(category || '').replace(/-/g, ' ');

const CATEGORY_TYPE_ORDER = ['Mate', 'Tactics', 'Opening', 'Defense', 'Endgame', 'Misc'];

const normalizeCategoryType = (value) => {
  const key = String(value || '').trim().toLowerCase();

  if (!key) return 'Misc';
  if (['mate', 'mates', 'mating'].includes(key)) return 'Mate';
  if (['tactic', 'tactics'].includes(key)) return 'Tactics';
  if (['opening', 'openings'].includes(key)) return 'Opening';
  if (['defense', 'defenses', 'defence', 'defences'].includes(key)) return 'Defense';
  if (['endgame', 'endgames'].includes(key)) return 'Endgame';
  if (['misc', 'miscellaneous', 'other', 'others'].includes(key)) return 'Misc';

  return key.charAt(0).toUpperCase() + key.slice(1);
};

const inferCategoryTypeFromName = (category) => {
  const key = String(category || '').toLowerCase();

  if (key.includes('mate')) return 'Mate';
  if (key.includes('defense')) return 'Defense';
  if (key.includes('endgame') || key === 'zugzwang') return 'Endgame';

  const openingLike = [
    'opening',
    'gambit',
    'game',
    'system'
  ];

  const namedOpeningAttacks = new Set([
    'torre-attack',
    'trompowsky-attack',
    'richter-veresov-attack',
    'nimzowitsch-larsen-attack',
    'grobs-attack',
    'kings-indian-attack'
  ]);

  if (key === 'ruy-lopez' || openingLike.some((word) => key.includes(word)) || namedOpeningAttacks.has(key)) {
    return 'Opening';
  }

  const tacticalLike = new Set([
    'pin',
    'fork',
    'skewer',
    'deflection',
    'discovery',
    'interference',
    'attraction',
    'clearance',
    'x-ray-attack',
    'double-check',
    'capturing-defender',
    'quiet-move',
    'sacrifice',
    'intermezzo',
    'hanging-piece',
    'trapped-piece',
    'exposed-king'
  ]);

  if (tacticalLike.has(key)) {
    return 'Tactics';
  }

  return 'Misc';
};

const getCategoryPuzzlesMap = (categoryData) => {
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

const getCategoryType = (category, categoryData) => {
  if (
    categoryData &&
    typeof categoryData === 'object' &&
    !Array.isArray(categoryData) &&
    categoryData.puzzles &&
    typeof categoryData.puzzles === 'object' &&
    !Array.isArray(categoryData.puzzles)
  ) {
    return normalizeCategoryType(categoryData.type);
  }

  return inferCategoryTypeFromName(category);
};

const CategoryList = ({
  categories,
  onSelect,
  solvedCounts,
  totalCounts,
  onOpenDictionary,
  dictionaryEntryCount,
  typeFilters,
  selectedType,
  onSelectType,
  typeCounts,
  onStartRandomMode,
  isRandomModeActive
}) => {
  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-3xl font-bold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500">
        Chess Puzzles
      </h1>

      <button
        type="button"
        data-testid="random-mode-button"
        onClick={onStartRandomMode}
        className={`w-full rounded-xl border p-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
          isRandomModeActive
            ? 'border-teal-500 bg-teal-500/20 text-teal-200'
            : 'border-teal-700 bg-teal-900/30 text-teal-200 hover:bg-teal-900/40'
        }`}
      >
        <Shuffle className="w-4 h-4" />
        Random Mode
      </button>

      <div data-testid="category-type-filters" className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Filter By Type
        </div>
        <div className="flex flex-wrap gap-2">
          {typeFilters.map((type) => {
            const isActive = selectedType === type;
            const count = typeCounts[type] || 0;

            return (
              <button
                key={type}
                type="button"
                data-testid="type-filter-button"
                onClick={() => onSelectType(type)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-yellow-500 bg-yellow-500/20 text-yellow-300'
                    : 'border-slate-600 bg-slate-700/70 text-slate-200 hover:bg-slate-600/80'
                }`}
              >
                {type} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {categories.map(cat => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className="w-full bg-slate-800 hover:bg-slate-700 active:bg-slate-600 transition-colors p-4 rounded-xl flex items-center justify-between border border-slate-700 shadow-lg group"
        >
          <span className="font-medium text-lg capitalize text-slate-200">
            {formatCategoryLabel(cat)}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">
              {solvedCounts[cat] || 0} / {totalCounts[cat]}
            </span>
            {solvedCounts[cat] === totalCounts[cat] && totalCounts[cat] > 0 ? (
              <Trophy className="w-5 h-5 text-yellow-400" />
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-slate-600 group-hover:border-slate-500" />
            )}
          </div>
        </button>
      ))}

      <div className="mt-8 pt-8 border-t border-slate-700">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Learn</h2>
        <button
          type="button"
          data-testid="open-dictionary-page"
          onClick={onOpenDictionary}
          className="w-full mb-4 bg-slate-800 p-3 rounded-lg flex items-center justify-between gap-3 text-sm text-slate-200 hover:bg-slate-700 border border-slate-700"
        >
          <span className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-yellow-400" />
            Dictionary
          </span>
          <span className="text-xs text-slate-400">{dictionaryEntryCount} entries</span>
        </button>

        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Settings</h2>
        <button
          onClick={() => window.resetProgress()}
          className="w-full bg-red-900/20 p-3 rounded-lg flex items-center justify-center gap-2 text-sm text-red-400 hover:bg-red-900/30 transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Reset All Progress
        </button>
      </div>
    </div>
  );
};

const normalizeWord = (word) => word.toLowerCase().replace(/[^a-z0-9-]/g, '');
const DICTIONARY_MATCH_THRESHOLD = 0.7;
const TOKEN_SIMILARITY_THRESHOLD = 0.88;
const SINGLE_WORD_MIN_LENGTH = 4;
const DICTIONARY_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'from', 'with',
  'into', 'onto', 'over', 'under', 'through', 'across', 'around',
  'up', 'down', 'out', 'off', 'as', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'this', 'that', 'these', 'those', 'it',
  'its', 'your', 'yours', 'our', 'ours', 'their', 'theirs', 'my', 'mine',
  'his', 'her', 'hers', 'them', 'they', 'you', 'we', 'he', 'she'
]);
const SAN_IN_TEXT_REGEX = /(?:\(|\b)(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8](?:=[QRBN])?[+#]?)(?:\)|\b)/g;
const UCI_IN_TEXT_REGEX = /\b([a-h][1-8][a-h][1-8][qrbn]?)\b/g;
const PROMOTION_SAN_REGEX = /=([QRBN])/i;

const dictionaryTypeBadgeClass = (type) => {
  const key = String(type || '').toLowerCase();

  if (key.includes('tactic') || key.includes('mate-pattern')) {
    return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
  }
  if (key.includes('strategy') || key.includes('opening-principle')) {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  }
  if (key.includes('endgame') || key.includes('method')) {
    return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
  }
  if (key.includes('fundamental') || key.includes('board-concept') || key.includes('vocabulary')) {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  }

  return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
};

const buildDictionaryLookup = (dictionaryEntries) => {
  const phraseEntries = [];
  const exactPhraseMap = new Map();
  const exactTermMap = new Map();
  const seen = new Set();
  let maxWords = 1;

  (dictionaryEntries || []).forEach((entry) => {
    const terms = [entry.name, ...(entry.aliases || [])];

    terms.forEach((term) => {
      const rawTerm = String(term || '').trim();
      if (rawTerm && !exactTermMap.has(rawTerm.toLowerCase())) {
        exactTermMap.set(rawTerm.toLowerCase(), entry);
      }

      const variants = [rawTerm];
      if (rawTerm.includes('-')) {
        variants.push(rawTerm.replace(/-/g, ' '));
      }

      variants.forEach((variant) => {
        const normalizedWords = String(variant || '')
          .split(/\s+/)
          .map(normalizeWord)
          .filter(Boolean);

        if (!normalizedWords.length) {
          return;
        }

        const phraseKey = normalizedWords.join(' ');
        const dedupeKey = `${phraseKey}::${entry.name}`;

        if (!seen.has(dedupeKey)) {
          phraseEntries.push({
            entry,
            phrase: phraseKey,
            wordCount: normalizedWords.length
          });
          seen.add(dedupeKey);
        }

        const existingEntries = exactPhraseMap.get(phraseKey) || [];
        if (!existingEntries.includes(entry)) {
          exactPhraseMap.set(phraseKey, [...existingEntries, entry]);
        }

        maxWords = Math.max(maxWords, normalizedWords.length);
      });
    });
  });

  return { phraseEntries, exactPhraseMap, maxWords, exactTermMap };
};

const levenshteinDistance = (left, right) => {
  const leftLen = left.length;
  const rightLen = right.length;
  const dp = Array.from({ length: leftLen + 1 }, () => Array(rightLen + 1).fill(0));

  for (let i = 0; i <= leftLen; i += 1) dp[i][0] = i;
  for (let j = 0; j <= rightLen; j += 1) dp[0][j] = j;

  for (let i = 1; i <= leftLen; i += 1) {
    for (let j = 1; j <= rightLen; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + substitutionCost
      );
    }
  }

  return dp[leftLen][rightLen];
};

const calculateSimilarity = (left, right) => {
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;

  const longest = Math.max(left.length, right.length);
  const distance = levenshteinDistance(left, right);
  return 1 - (distance / longest);
};

const normalizeSanForCompare = (san) => String(san || '')
  .replace(/[+#?!]/g, '')
  .replace(/\s+/g, '');

const stemWord = (word) => {
  const normalized = normalizeWord(word);
  if (normalized.length <= 3) return normalized;

  if (normalized.endsWith('ies') && normalized.length > 4) {
    return `${normalized.slice(0, -3)}y`;
  }
  if (normalized.endsWith('ing') && normalized.length > 5) {
    return normalized.slice(0, -3);
  }
  if (normalized.endsWith('edly') && normalized.length > 6) {
    return normalized.slice(0, -4);
  }
  if (normalized.endsWith('ly') && normalized.length > 4) {
    return normalized.slice(0, -2);
  }
  if (normalized.endsWith('ed') && normalized.length > 4) {
    return normalized.slice(0, -2);
  }
  if (normalized.endsWith('es') && normalized.length > 4) {
    return normalized.slice(0, -2);
  }
  if (normalized.endsWith('s') && normalized.length > 3) {
    return normalized.slice(0, -1);
  }

  return normalized;
};

const splitWords = (text) => String(text || '')
  .split(/\s+/)
  .map(normalizeWord)
  .filter(Boolean);

const removeStopWords = (words) => words.filter((word) => !DICTIONARY_STOPWORDS.has(word));

const tokenMatches = (left, right) => {
  const leftWord = normalizeWord(left);
  const rightWord = normalizeWord(right);

  if (!leftWord || !rightWord) return false;
  if (leftWord === rightWord) return true;

  const leftStem = stemWord(leftWord);
  const rightStem = stemWord(rightWord);
  if (leftStem && leftStem === rightStem && leftStem.length >= 3) {
    return true;
  }

  if (
    leftWord.length >= SINGLE_WORD_MIN_LENGTH &&
    rightWord.length >= SINGLE_WORD_MIN_LENGTH &&
    (leftWord.startsWith(rightWord) || rightWord.startsWith(leftWord))
  ) {
    return true;
  }

  return (
    Math.min(leftWord.length, rightWord.length) >= SINGLE_WORD_MIN_LENGTH &&
    calculateSimilarity(leftWord, rightWord) >= TOKEN_SIMILARITY_THRESHOLD
  );
};

const computeTokenOverlapScore = (candidateWordsRaw, phraseWordsRaw) => {
  const candidateWords = candidateWordsRaw.map(normalizeWord).filter(Boolean);
  const phraseWords = phraseWordsRaw.map(normalizeWord).filter(Boolean);
  const candidateCore = removeStopWords(candidateWords);
  const phraseCore = removeStopWords(phraseWords);

  const left = candidateCore.length ? candidateCore : candidateWords;
  const right = phraseCore.length ? phraseCore : phraseWords;

  if (!left.length || !right.length) {
    return { matched: 0, ratio: 0, leftCount: left.length, rightCount: right.length };
  }

  const consumed = new Set();
  let matched = 0;

  for (const token of left) {
    const idx = right.findIndex((candidate, i) => !consumed.has(i) && tokenMatches(token, candidate));
    if (idx !== -1) {
      consumed.add(idx);
      matched += 1;
    }
  }

  return {
    matched,
    ratio: matched / Math.max(left.length, right.length),
    leftCount: left.length,
    rightCount: right.length
  };
};

const extractHintWords = (hint) => {
  const words = [];
  const regex = /[A-Za-z0-9-']+/g;
  let match;

  while ((match = regex.exec(hint)) !== null) {
    words.push({
      raw: match[0],
      normalized: normalizeWord(match[0]),
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return words;
};

const findDictionaryMatches = (hint, dictionaryLookup) => {
  const words = extractHintWords(hint);
  const matches = [];
  const { phraseEntries, maxWords } = dictionaryLookup;

  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    let found = null;

    for (let phraseLen = Math.min(maxWords, words.length - wordIndex); phraseLen >= 1; phraseLen -= 1) {
      const chunk = words.slice(wordIndex, wordIndex + phraseLen);
      const candidate = chunk.map((word) => word.normalized).filter(Boolean).join(' ');
      const candidateWords = chunk.map((word) => word.normalized).filter(Boolean);

      if (!candidate) {
        continue;
      }

      for (const phraseEntry of phraseEntries) {
        if (phraseLen === 1 && phraseEntry.wordCount > 1) {
          continue;
        }

        if (Math.abs(phraseEntry.wordCount - phraseLen) > 1) {
          continue;
        }

        const similarity = calculateSimilarity(candidate, phraseEntry.phrase);

        if (similarity < DICTIONARY_MATCH_THRESHOLD) {
          continue;
        }

        // For single-word fuzzy matches, require a prefix relationship to avoid unrelated lookalikes.
        const phraseWords = splitWords(phraseEntry.phrase);
        const overlap = computeTokenOverlapScore(candidateWords, phraseWords);

        if (phraseLen === 1) {
          const candidateWord = candidateWords[0] || '';
          const phraseWord = phraseWords[0] || '';
          const isExact = candidateWord === phraseWord;
          const isRootMatch = tokenMatches(candidateWord, phraseWord);
          const minWordLength = Math.min(candidateWord.length, phraseWord.length);

          if (!isExact && (!isRootMatch || minWordLength < SINGLE_WORD_MIN_LENGTH)) {
            continue;
          }
        } else {
          const requiredRatio = Math.max(0.75, 1 - (Math.max(phraseLen, phraseEntry.wordCount) - 2) * 0.1);
          if (overlap.ratio < requiredRatio) {
            continue;
          }

          if (
            Math.min(overlap.leftCount, overlap.rightCount) >= 2 &&
            overlap.matched < 2
          ) {
            continue;
          }
        }

        if (
          !found ||
          similarity > found.similarity ||
          (similarity === found.similarity && phraseLen > found.wordCount)
        ) {
          found = {
            entry: phraseEntry.entry,
            start: chunk[0].start,
            end: chunk[chunk.length - 1].end,
            wordCount: phraseLen,
            similarity
          };
        }
      }
    }

    if (found) {
      matches.push(found);
      wordIndex += found.wordCount - 1;
    }
  }

  return matches;
};

const findDictionaryExactMatches = (text, dictionaryLookup, excludedEntry = null) => {
  const words = extractHintWords(text);
  const matches = [];
  const { exactPhraseMap, maxWords } = dictionaryLookup;

  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    let found = null;

    for (let phraseLen = Math.min(maxWords, words.length - wordIndex); phraseLen >= 1; phraseLen -= 1) {
      const chunk = words.slice(wordIndex, wordIndex + phraseLen);
      const candidate = chunk.map((word) => word.normalized).filter(Boolean).join(' ');

      if (!candidate) {
        continue;
      }

      const candidateEntries = exactPhraseMap.get(candidate) || [];
      const matchedEntry = candidateEntries.find((entry) => entry !== excludedEntry);

      if (!matchedEntry) {
        continue;
      }

      found = {
        entry: matchedEntry,
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
        wordCount: phraseLen
      };
      break;
    }

    if (found) {
      matches.push(found);
      wordIndex += found.wordCount - 1;
    }
  }

  return matches;
};

const DictionaryTextWithLinks = ({
  text,
  dictionaryLookup,
  onWordTap,
  exact = false,
  excludedEntry = null,
  plainClassName = '',
  linkedClassName = 'underline decoration-dotted underline-offset-2'
}) => {
  const content = String(text || '');
  const matches = React.useMemo(() => (
    exact
      ? findDictionaryExactMatches(content, dictionaryLookup, excludedEntry)
      : findDictionaryMatches(content, dictionaryLookup)
  ), [content, dictionaryLookup, exact, excludedEntry]);

  if (!matches.length) {
    return <span className={plainClassName}>{content}</span>;
  }

  const rendered = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      rendered.push(
        <React.Fragment key={`plain-${index}`}>
          <span className={plainClassName}>{content.slice(cursor, match.start)}</span>
        </React.Fragment>
      );
    }

    const linkedText = content.slice(match.start, match.end);
    if (onWordTap) {
      rendered.push(
        <button
          key={`dict-${index}`}
          type="button"
          onClick={() => onWordTap(match.entry)}
          className={linkedClassName}
          title={`Tap to learn: ${match.entry.name}`}
        >
          {linkedText}
        </button>
      );
    } else {
      rendered.push(
        <span key={`dict-${index}`} className={linkedClassName}>
          {linkedText}
        </span>
      );
    }

    cursor = match.end;
  });

  if (cursor < content.length) {
    rendered.push(
      <React.Fragment key="plain-tail">
        <span className={plainClassName}>{content.slice(cursor)}</span>
      </React.Fragment>
    );
  }

  return <>{rendered}</>;
};

const extractMoveTokensFromHint = (hintText) => {
  const text = String(hintText || '');
  const tokens = [];
  const seen = new Set();
  const sanRegex = new RegExp(SAN_IN_TEXT_REGEX.source, 'g');
  const uciRegex = new RegExp(UCI_IN_TEXT_REGEX.source, 'g');

  for (const match of text.matchAll(sanRegex)) {
    const token = String(match[1] || '').trim();
    if (!token || seen.has(`san:${token}`)) {
      continue;
    }

    seen.add(`san:${token}`);
    tokens.push({ type: 'san', token });
  }

  for (const match of text.matchAll(uciRegex)) {
    const token = String(match[1] || '').trim();
    if (!token || seen.has(`uci:${token}`)) {
      continue;
    }

    seen.add(`uci:${token}`);
    tokens.push({ type: 'uci', token });
  }

  return tokens;
};

const deriveArrowFromHintText = (fen, hintText) => {
  if (!fen || !hintText) {
    return null;
  }

  const candidates = extractMoveTokensFromHint(hintText);

  for (const candidate of candidates) {
    const probeGame = new Chess(fen);

    try {
      if (candidate.type === 'san') {
        const move = probeGame.move(candidate.token);
        if (move) {
          return [move.from, move.to];
        }
      } else if (candidate.type === 'uci') {
        const from = candidate.token.slice(0, 2);
        const to = candidate.token.slice(2, 4);
        const promotion = candidate.token.length > 4 ? candidate.token[4] : 'q';
        const move = probeGame.move({ from, to, promotion });
        if (move) {
          return [move.from, move.to];
        }
      }
    } catch (e) {
      // Ignore parse failures and try the next candidate token.
    }
  }

  return null;
};

const HintWithDictionary = ({ hint, dictionaryLookup, onWordTap }) => {
  return (
    <DictionaryTextWithLinks
      text={hint}
      dictionaryLookup={dictionaryLookup}
      onWordTap={onWordTap}
      exact={false}
      plainClassName="text-slate-200"
      linkedClassName="underline decoration-dotted underline-offset-2 text-slate-100 hover:text-white"
    />
  );
};

const DictionaryPage = ({ entries, onBack }) => {
  const sortedEntries = React.useMemo(
    () => [...(entries || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [entries]
  );
  const dictionaryLookup = React.useMemo(
    () => buildDictionaryLookup(sortedEntries),
    [sortedEntries]
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            data-testid="dictionary-back-button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </button>
          <div className="text-xs text-slate-400">{sortedEntries.length} entries</div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-800 to-slate-900 p-5 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-2">
              <BookOpen className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-yellow-300">Dictionary</h1>
              <p className="text-sm text-slate-400">Every chess term used by the app, with definitions.</p>
            </div>
          </div>
        </div>

        <div data-testid="dictionary-page" className="mt-5 space-y-3">
          {sortedEntries.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-300">
              Dictionary entries are not available right now.
            </div>
          ) : (
            sortedEntries.map((entry) => (
              <article
                key={`${entry.name}-${entry.type}`}
                data-testid="dictionary-entry"
                className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 shadow-lg"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-100">{entry.name}</h2>
                  <span className={`px-2 py-0.5 text-[11px] uppercase tracking-wider border rounded ${dictionaryTypeBadgeClass(entry.type)}`}>
                    {entry.type}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                  <DictionaryTextWithLinks
                    text={entry.definition}
                    dictionaryLookup={dictionaryLookup}
                    exact
                    excludedEntry={entry}
                    plainClassName="text-slate-200"
                    linkedClassName="underline decoration-dotted underline-offset-2 text-slate-100"
                  />
                </p>
                {!!entry.aliases?.length && (
                  <p className="mt-2 text-xs text-slate-400">
                    Also called: {entry.aliases.join(', ')}
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const PuzzleView = ({
  puzzle,
  initialFen,
  orientation,
  onBack,
  onNext,
  onPrev,
  onSolved,
  onShowHint,
  hintsRevealed,
  isSolved: isPuzzleSolvedState,
  isFailed,
  dictionaryEntries,
  category,
  index,
  total,
  isRandomMode
}) => {
  const [game, setGame] = useState(() => {
    const newGame = new Chess();
    if (initialFen) {
      try {
        newGame.load(initialFen);
      } catch (e) {
        console.error("Invalid FEN", initialFen);
      }
    }
    return newGame;
  });
  const [moveStatus, setMoveStatus] = useState(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [activeDictionaryEntry, setActiveDictionaryEntry] = useState(null);
  const [activeDictionaryLabel, setActiveDictionaryLabel] = useState(null);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(null);
  const [pendingOpponentMove, setPendingOpponentMove] = useState(null);
  const [lastMoveArrow, setLastMoveArrow] = useState(null);
  const [isCategoryMasked, setIsCategoryMasked] = useState(Boolean(isRandomMode));
  const [areTagsMasked, setAreTagsMasked] = useState(Boolean(isRandomMode));

  const dictionaryLookup = React.useMemo(
    () => buildDictionaryLookup(dictionaryEntries),
    [dictionaryEntries]
  );

  const openDictionaryEntry = React.useCallback((entry, label = null) => {
    if (!entry) {
      return;
    }
    setActiveDictionaryEntry(entry);
    setActiveDictionaryLabel(label || entry.name);
  }, []);

  const openDictionaryByExactTerm = React.useCallback((term) => {
    const entry = dictionaryLookup.exactTermMap.get(String(term || '').toLowerCase());
    if (!entry) {
      return;
    }
    openDictionaryEntry(entry, term);
  }, [dictionaryLookup, openDictionaryEntry]);

  // Answer sequence
  const answerMoves = React.useMemo(() => {
    if (!puzzle) return [];
    return puzzle.answer.split(', ');
  }, [puzzle]);

  const latestHintText = hintsRevealed > 0 ? puzzle.hints[hintsRevealed - 1] : null;
  const hintArrow = React.useMemo(
    () => deriveArrowFromHintText(game.fen(), latestHintText),
    [game, latestHintText]
  );

  useEffect(() => {
    const isJsdom =
      typeof navigator !== 'undefined' &&
      /jsdom/i.test(String(navigator.userAgent || ''));

    if (isJsdom) {
      return;
    }

    if (typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0);
    }
  }, [puzzle?.url, index]);

  useEffect(() => {
    const masked = Boolean(isRandomMode);
    setIsCategoryMasked(masked);
    setAreTagsMasked(masked);
  }, [isRandomMode, puzzle?.url, category]);

  const getPromotionPieceForMove = React.useCallback((gameState, sourceSquare, targetSquare, expectedMoveSan) => {
    const piece = gameState.get(sourceSquare);

    if (!piece || piece.type !== 'p') {
      return null;
    }

    const targetRank = String(targetSquare || '').slice(1);
    if (targetRank !== '1' && targetRank !== '8') {
      return null;
    }

    const expectedPromotion = String(expectedMoveSan || '').match(PROMOTION_SAN_REGEX)?.[1]?.toLowerCase();
    return expectedPromotion || 'q';
  }, []);

  const onDrop = (sourceSquare, targetSquare) => {
    if (isPuzzleSolvedState || isFailed || moveStatus || autoAdvanceCountdown !== null || pendingOpponentMove) return false;
    const playerColor = orientation === 'white' ? 'w' : 'b';
    const sourcePiece = game.get(sourceSquare);

    // Never allow moving the opponent's piece or moving when it's not the player's turn.
    if (!sourcePiece || sourcePiece.color !== playerColor || game.turn() !== playerColor) {
      return false;
    }

    // Tentative move - Use a clone to avoid state mutation
    try {
      const gameCopy = new Chess(game.fen());
      const expectedMoveSan = answerMoves[currentMoveIndex];
      const promotionPiece = getPromotionPieceForMove(gameCopy, sourceSquare, targetSquare, expectedMoveSan);
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        ...(promotionPiece ? { promotion: promotionPiece } : {})
      });

      if (move === null) return false;

      // Update the game state with the valid move
      setGame(gameCopy);

      // Check if correct
      if (normalizeSanForCompare(move.san) === normalizeSanForCompare(expectedMoveSan)) {
        setMoveStatus('correct');

        if (currentMoveIndex === answerMoves.length - 1) {
          setPendingOpponentMove(null);
          onSolved();
          if (index < total - 1) {
            setAutoAdvanceCountdown(3);
          }
        } else {
          const nextIndex = currentMoveIndex + 1;
          const opponentReplySan = answerMoves[nextIndex];
          setPendingOpponentMove(opponentReplySan || null);

          setTimeout(() => {
            setMoveStatus(null);

            const gameWithOpponent = new Chess(gameCopy.fen());
            if (opponentReplySan) {
              const opponentMove = gameWithOpponent.move(opponentReplySan);
              if (opponentMove) {
                setLastMoveArrow([opponentMove.from, opponentMove.to]);
              }
            }
            setGame(gameWithOpponent);
            setCurrentMoveIndex(nextIndex + 1);
            setPendingOpponentMove(null);
          }, 1000);
        }
      } else {
        setMoveStatus('incorrect');
        setPendingOpponentMove(null);
        const previousFen = game.fen();
        setTimeout(() => {
          const rewindGame = new Chess();
          try {
            rewindGame.load(previousFen);
            setGame(rewindGame);
          } catch (e) {
            if (initialFen) {
              try {
                rewindGame.load(initialFen);
                setGame(rewindGame);
                setCurrentMoveIndex(0);
              } catch (innerError) { }
            }
          }
          setMoveStatus(null);
        }, 1000);
      }
      return true;
    } catch (e) {
      console.error("Move error:", e);
      return false;
    }
  };

  useEffect(() => {
    if (autoAdvanceCountdown === null) {
      return;
    }

    if (autoAdvanceCountdown <= 0) {
      setAutoAdvanceCountdown(null);
      if (index < total - 1) {
        onNext();
      }
      return;
    }

    const timer = setTimeout(() => {
      setAutoAdvanceCountdown((value) => (value === null ? null : value - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoAdvanceCountdown, index, total, onNext]);

  useEffect(() => {
    const canPlaySanByDrop = (san) => {
      if (!san) return false;
      try {
        const sanProbe = new Chess(game.fen());
        const parsed = sanProbe.move(san);
        if (!parsed) return false;

        const dropProbe = new Chess(game.fen());
        return Boolean(dropProbe.move({
          from: parsed.from,
          to: parsed.to,
          promotion: 'q'
        }));
      } catch (e) {
        return false;
      }
    };

    window.__smokePuzzle = {
      getState: () => ({
        fen: game.fen(),
        moveStatus,
        currentMoveIndex,
        isSolved: isPuzzleSolvedState,
        isFailed,
        autoAdvanceCountdown,
        pendingOpponentMove,
        expectedSan: answerMoves[currentMoveIndex] || null,
        answerLength: answerMoves.length,
        index,
        total
      }),
      playExpectedMove: () => {
        const expectedSan = answerMoves[currentMoveIndex];
        if (!expectedSan) return false;
        try {
          const simulation = new Chess(game.fen());
          const expected = simulation.move(expectedSan);
          if (!expected) return false;
          return onDrop(expected.from, expected.to);
        } catch (e) {
          return false;
        }
      },
      canPlayExpected: () => {
        const expectedSan = answerMoves[currentMoveIndex];
        return canPlaySanByDrop(expectedSan);
      },
      canPlayIncorrect: () => {
        try {
          const simulation = new Chess(game.fen());
          const expectedSan = answerMoves[currentMoveIndex] || '';
          const legalMoves = simulation.moves({ verbose: true });
          return legalMoves.some((move) => move.san !== expectedSan && canPlaySanByDrop(move.san));
        } catch (e) {
          return false;
        }
      },
      playIncorrectMove: () => {
        try {
          const simulation = new Chess(game.fen());
          const expectedSan = answerMoves[currentMoveIndex] || '';
          const legalMoves = simulation.moves({ verbose: true });
          const wrongMove = legalMoves.find((move) => move.san !== expectedSan && canPlaySanByDrop(move.san));
          if (!wrongMove) return false;
          return onDrop(wrongMove.from, wrongMove.to);
        } catch (e) {
          return false;
        }
      }
    };

    return () => {
      if (window.__smokePuzzle) {
        delete window.__smokePuzzle;
      }
    };
  }, [game, moveStatus, currentMoveIndex, isPuzzleSolvedState, isFailed, autoAdvanceCountdown, pendingOpponentMove, answerMoves, index, total]);

  // Determine arrows to draw
  const customArrows = React.useMemo(() => {
    const arrows = [];

    if (hintArrow) {
      arrows.push(hintArrow);
    }

    if (lastMoveArrow) {
      arrows.push(lastMoveArrow);
    }

    if (isFailed && answerMoves.length > 0) {
      // We need to find the from/to for the correct move.
      // We can use a temporary chess instance to parse the SAN.
      try {
        const tempGame = new Chess(game.fen());
        const move = tempGame.move(answerMoves[currentMoveIndex]);
        if (move) {
          arrows.push([move.from, move.to]);
        }
      } catch (e) {
        console.error("Failed to parse answer move for arrow", e);
      }
    }
    return arrows;
  }, [isFailed, answerMoves, currentMoveIndex, game, hintArrow, lastMoveArrow]);

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-800 shadow-md">
        <button data-testid="back-button" onClick={onBack} className="p-2 hover:bg-slate-700 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2 min-w-0 px-2">
          {isCategoryMasked ? (
            <button
              type="button"
              data-testid="puzzle-category-mask"
              onClick={() => setIsCategoryMasked(false)}
              className="max-w-[170px] truncate rounded border border-slate-600 bg-slate-700/70 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-600/80"
              title="Tap to reveal category"
            >
              Tap To Reveal
            </button>
          ) : (
            <div
              data-testid="puzzle-category"
              className="max-w-[170px] truncate text-sm font-medium text-slate-300 capitalize"
              title={formatCategoryLabel(category)}
            >
              {formatCategoryLabel(category)}
            </div>
          )}
          <div data-testid="puzzle-index" className="text-sm font-medium text-slate-300 whitespace-nowrap">
            {index + 1} / {total}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button data-testid="reset-button" onClick={() => {
            const newGame = new Chess();
            if (initialFen) try { newGame.load(initialFen); } catch (e) { }
            setGame(newGame);
            setLastMoveArrow(null);
            setMoveStatus(null);
            setCurrentMoveIndex(0);
            setAutoAdvanceCountdown(null);
            setPendingOpponentMove(null);
          }} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white" title="Reset Puzzle">
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>


      {/* Board */}
      <div className="flex-grow flex items-center justify-center p-2 bg-slate-900/50 flex-col gap-8">
        <div className="w-full aspect-square max-w-[400px] shadow-2xl rounded-lg overflow-hidden border-4 border-slate-700 relative bg-[#302e2c]">
          <ChessgroundBoard
            fen={game.fen()}
            orientation={orientation}
            onMove={onDrop}
            width="100%"
            height="100%"
            customArrows={customArrows}
          />

          {/* No board overlays for cleaner UI */}
        </div>

      </div>

      {/* Controls & Hints */}
      <div className="p-4 bg-slate-800 space-y-4 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">

        <div className="flex justify-between items-center">
          <button data-testid="prev-button" onClick={onPrev} disabled={index === 0} className="p-3 disabled:opacity-30 bg-slate-700 rounded-lg">
            <ChevronLeft />
          </button>

          <div className="text-center min-w-[120px]">
            {moveStatus === 'correct' ? (
              <div>
                <div className="text-green-500 font-black text-xl animate-bounce">CORRECT!</div>
                {!!pendingOpponentMove && (
                  <div data-testid="opponent-reply-note" className="mt-1 text-xs font-semibold text-slate-300">
                    Opponent reply coming...
                  </div>
                )}
                {autoAdvanceCountdown !== null && (
                  <div data-testid="next-countdown" className="mt-1 text-xs font-semibold text-emerald-300 animate-pulse">
                    Next in {autoAdvanceCountdown}...
                  </div>
                )}
              </div>
            ) : moveStatus === 'incorrect' ? (
              <div className="text-red-500 font-black text-xl animate-pulse">TRY AGAIN</div>
            ) : isPuzzleSolvedState ? (
              <div className="text-green-400 font-bold text-xl flex items-center gap-2 justify-center">
                <Trophy className="w-6 h-6" /> Partnered!
              </div>
            ) : isFailed ? (
              <div className="text-red-400 font-bold text-lg">
                {puzzle.answer}
              </div>
            ) : (
              <div className="text-slate-400 text-sm">
                {game.turn() === 'w' ? "White to move" : "Black to move"}
              </div>
            )}
          </div>

          <button data-testid="next-button" onClick={onNext} disabled={index === total - 1} className="p-3 disabled:opacity-30 bg-slate-700 rounded-lg">
            <ChevronRight />
          </button>
        </div>

        {/* Hints */}
        <div className="space-y-2">

          {puzzle.hints.slice(0, hintsRevealed).map((hint, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="p-3 bg-slate-700/50 rounded-lg text-sm text-slate-200 border-l-4 border-yellow-500">
                <span className="font-bold text-yellow-500 mr-2">Hint {i + 1}:</span>
                <HintWithDictionary
                  hint={hint}
                  dictionaryLookup={dictionaryLookup}
                  onWordTap={(entry) => openDictionaryEntry(entry, entry?.name)}
                />
              </div>
            </div>
          ))}

          {!isPuzzleSolvedState && !isFailed && (
            <button
              onClick={onShowHint}
              className="w-full py-3 px-4 bg-yellow-600/20 text-yellow-400 rounded-lg hover:bg-yellow-600/30 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <HelpCircle className="w-5 h-5" />
              {hintsRevealed < puzzle.hints.length ? "Reveal Hint" : "Show Answer (Give Up)"}
            </button>
          )}

          {!!puzzle.tags?.length && (
            <div data-testid="tags-panel" className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Tags
              </div>
              {areTagsMasked ? (
                <button
                  type="button"
                  data-testid="tags-mask-button"
                  onClick={() => setAreTagsMasked(false)}
                  className="w-full rounded border border-slate-600 bg-slate-700/70 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600/80"
                >
                  Tap to reveal tags
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {puzzle.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      data-testid="tag-chip"
                      onClick={() => openDictionaryByExactTerm(tag)}
                      className="rounded-full border border-slate-600 bg-slate-700/70 px-2.5 py-1 text-xs text-slate-100 hover:bg-slate-600/80"
                      title={`Open dictionary: ${tag}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>



      </div>

      {activeDictionaryEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55"
          onClick={() => {
            setActiveDictionaryEntry(null);
            setActiveDictionaryLabel(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-600 bg-slate-800 p-4 text-left shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-yellow-400">{activeDictionaryLabel || activeDictionaryEntry.name}</h3>
                <p className={`inline-block mt-2 px-2 py-0.5 text-xs uppercase tracking-wider border rounded ${dictionaryTypeBadgeClass(activeDictionaryEntry.type)}`}>
                  {activeDictionaryEntry.type}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveDictionaryEntry(null);
                  setActiveDictionaryLabel(null);
                }}
                className="text-slate-400 hover:text-slate-200"
                aria-label="Close dictionary"
              >
                X
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-200 leading-relaxed">
              <DictionaryTextWithLinks
                text={activeDictionaryEntry.definition}
                dictionaryLookup={dictionaryLookup}
                exact
                excludedEntry={activeDictionaryEntry}
                onWordTap={(entry) => openDictionaryEntry(entry, entry?.name)}
                plainClassName="text-slate-200"
                linkedClassName="underline decoration-dotted underline-offset-2 text-slate-100 hover:text-white"
              />
            </p>
            {!!activeDictionaryEntry.aliases?.length && (
              <p className="mt-3 text-xs text-slate-400">
                Also called: {activeDictionaryEntry.aliases.join(', ')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


export default function App() {
  const {
    puzzlesData,
    loading,
    currentCategory,
    currentPuzzle,
    currentPuzzleIndex,
    totalPuzzles,
    hintsRevealed,
    isSolved,
    isFailed,
    solvedPuzzles,
    selectCategory,
    nextPuzzle,
    prevPuzzle,
    showNextHint,
    markSolved,
    resetAllProgress
  } = usePuzzleGame();

  const [dictionaryData, setDictionaryData] = useState({ entries: [] });
  const [homeView, setHomeView] = useState('categories');
  const [selectedCategoryType, setSelectedCategoryType] = useState('All');
  const [isRandomMode, setIsRandomMode] = useState(false);

  useEffect(() => {
    fetch('/dictionary.json')
      .then((response) => response.json())
      .then((data) => setDictionaryData(data))
      .catch((error) => {
        console.error('Failed to load dictionary', error);
        setDictionaryData({ entries: [] });
      });
  }, []);

  // Expose for the internal components to access if needed (hacky but works for the settings menu)
  window.resetProgress = resetAllProgress;

  const initialFen = React.useMemo(() => {
    if (!currentPuzzle) return null;
    return parsePuzzleUrl(currentPuzzle.url);
  }, [currentPuzzle]);

  const puzzleOrientation = React.useMemo(() => {
    const tempGame = new Chess();
    if (initialFen) {
      try {
        tempGame.load(initialFen);
      } catch (e) {
        console.error("Failed to parse initial FEN for orientation", e);
      }
    }
    return tempGame.turn() === 'w' ? 'white' : 'black';
  }, [initialFen]);

  const showLoader = loading || (currentCategory && !currentPuzzle);

  if (showLoader) {
    return <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-slate-100">Loading...</div>;
  }

  if (!puzzlesData) {
    return <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-red-400">Error loading puzzles.</div>;
  }

  if (!currentCategory) {
    // Calculate stats
    const solvedCounts = {};
    const totalCounts = {};
    const categoryTypeMap = {};

    Object.keys(puzzlesData).forEach((cat) => {
      const categoryData = puzzlesData[cat];
      const puzzleMap = getCategoryPuzzlesMap(categoryData);
      const puzzleUrls = new Set(Object.keys(puzzleMap));
      totalCounts[cat] = Object.keys(puzzleMap).length;
      // Count only solved URLs that still exist in this category's puzzle map.
      const solvedInCategory = solvedPuzzles[cat] || [];
      solvedCounts[cat] = solvedInCategory.filter((url) => puzzleUrls.has(url)).length;
      categoryTypeMap[cat] = getCategoryType(cat, categoryData);
    });

    const sortedCategories = Object.keys(puzzlesData).sort((left, right) => {
      const leftComplete = (solvedCounts[left] || 0) >= (totalCounts[left] || 0) && (totalCounts[left] || 0) > 0;
      const rightComplete = (solvedCounts[right] || 0) >= (totalCounts[right] || 0) && (totalCounts[right] || 0) > 0;

      if (leftComplete === rightComplete) {
        return left.localeCompare(right);
      }

      return leftComplete ? 1 : -1;
    });

    const discoveredTypes = Array.from(new Set(Object.values(categoryTypeMap)));
    const orderedTypes = discoveredTypes.sort((left, right) => {
      const leftIndex = CATEGORY_TYPE_ORDER.indexOf(left);
      const rightIndex = CATEGORY_TYPE_ORDER.indexOf(right);
      const safeLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const safeRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

      if (safeLeft === safeRight) {
        return left.localeCompare(right);
      }

      return safeLeft - safeRight;
    });

    const typeFilters = ['All', ...orderedTypes];
    const activeType = typeFilters.includes(selectedCategoryType) ? selectedCategoryType : 'All';

    const typeCounts = {
      All: sortedCategories.length
    };

    sortedCategories.forEach((category) => {
      const type = categoryTypeMap[category] || 'Misc';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const visibleCategories = sortedCategories.filter((category) => (
      activeType === 'All' || categoryTypeMap[category] === activeType
    ));

    if (homeView === 'dictionary') {
      return (
        <DictionaryPage
          entries={dictionaryData.entries || []}
          onBack={() => setHomeView('categories')}
        />
      );
    }

    return <CategoryList
      categories={visibleCategories}
      onSelect={(category) => {
        setHomeView('categories');
        setIsRandomMode(false);
        selectCategory(category);
      }}
      onStartRandomMode={() => {
        const selectableCategories = visibleCategories.filter((cat) => (totalCounts[cat] || 0) > 0);

        if (!selectableCategories.length) {
          return;
        }

        const randomCategory = selectableCategories[Math.floor(Math.random() * selectableCategories.length)];
        const puzzleCount = totalCounts[randomCategory] || 0;
        const randomIndex = puzzleCount > 1 ? Math.floor(Math.random() * puzzleCount) : 0;

        setHomeView('categories');
        setIsRandomMode(true);
        selectCategory(randomCategory, randomIndex);
      }}
      isRandomModeActive={isRandomMode}
      solvedCounts={solvedCounts}
      totalCounts={totalCounts}
      onOpenDictionary={() => setHomeView('dictionary')}
      dictionaryEntryCount={(dictionaryData.entries || []).length}
      typeFilters={typeFilters}
      selectedType={activeType}
      onSelectType={setSelectedCategoryType}
      typeCounts={typeCounts}
    />;
  }

  return (
    <ErrorBoundary>
      <PuzzleView
        key={currentPuzzle.url}
        puzzle={currentPuzzle}
        category={currentCategory}
        initialFen={initialFen}
        orientation={puzzleOrientation}
        index={currentPuzzleIndex}
        total={totalPuzzles}
        onBack={() => {
          setHomeView('categories');
          selectCategory(null);
        }}
        onNext={nextPuzzle}
        onPrev={prevPuzzle}
        onSolved={markSolved}
        onShowHint={showNextHint}
        hintsRevealed={hintsRevealed}
        isSolved={isSolved}
        isFailed={isFailed}
        dictionaryEntries={dictionaryData.entries || []}
        isRandomMode={isRandomMode}
      />
    </ErrorBoundary>
  );
}

