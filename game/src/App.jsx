import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { ChessgroundBoard } from './components/ChessgroundBoard';
import {
  Trophy, HelpCircle, ChevronLeft, ChevronRight,
  RotateCcw, ArrowLeft, Trash2, BookOpen
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

const CategoryList = ({ categories, onSelect, solvedCounts, totalCounts, onOpenDictionary, dictionaryEntryCount }) => {
  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-3xl font-bold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500">
        Chess Puzzles
      </h1>

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

const normalizeWord = (word) => word.toLowerCase().replace(/[^a-z-]/g, '');
const DICTIONARY_MATCH_THRESHOLD = 0.7;

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
  const seen = new Set();
  let maxWords = 1;

  (dictionaryEntries || []).forEach((entry) => {
    const terms = [entry.name, ...(entry.aliases || [])];

    terms.forEach((term) => {
      const normalizedWords = String(term || '')
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

      maxWords = Math.max(maxWords, normalizedWords.length);
    });
  });

  return { phraseEntries, maxWords };
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

const extractHintWords = (hint) => {
  const words = [];
  const regex = /[A-Za-z-']+/g;
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
        if (
          phraseLen === 1 &&
          similarity < 1 &&
          !candidate.startsWith(phraseEntry.phrase) &&
          !phraseEntry.phrase.startsWith(candidate)
        ) {
          continue;
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

const HintWithDictionary = ({ hint, dictionaryLookup, onWordTap }) => {
  const text = String(hint || '');
  const matches = findDictionaryMatches(text, dictionaryLookup);

  if (!matches.length) {
    return <>{text}</>;
  }

  const rendered = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      rendered.push(
        <React.Fragment key={`plain-${index}`}>
          {text.slice(cursor, match.start)}
        </React.Fragment>
      );
    }

    rendered.push(
      <button
        key={`dict-${index}`}
        type="button"
        onClick={() => onWordTap(match.entry)}
        className="underline decoration-dotted underline-offset-2 text-slate-100 hover:text-white"
        title={`Tap to learn: ${match.entry.name}`}
      >
        {text.slice(match.start, match.end)}
      </button>
    );

    cursor = match.end;
  });

  if (cursor < text.length) {
    rendered.push(
      <React.Fragment key="plain-tail">
        {text.slice(cursor)}
      </React.Fragment>
    );
  }

  return (
    <>{rendered}</>
  );
};

const DictionaryPage = ({ entries, onBack }) => {
  const sortedEntries = React.useMemo(
    () => [...(entries || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [entries]
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
                <p className="mt-2 text-sm leading-relaxed text-slate-200">{entry.definition}</p>
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
  total
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
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(null);
  const [pendingOpponentMove, setPendingOpponentMove] = useState(null);
  const [lastMoveArrow, setLastMoveArrow] = useState(null);

  const dictionaryLookup = React.useMemo(
    () => buildDictionaryLookup(dictionaryEntries),
    [dictionaryEntries]
  );

  // Answer sequence
  const answerMoves = React.useMemo(() => {
    if (!puzzle) return [];
    return puzzle.answer.split(', ');
  }, [puzzle]);

  const onDrop = (sourceSquare, targetSquare) => {
    if (isPuzzleSolvedState || isFailed || moveStatus || autoAdvanceCountdown !== null || pendingOpponentMove) return false;

    // Tentative move - Use a clone to avoid state mutation
    try {
      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q'
      });

      if (move === null) return false;

      // Update the game state with the valid move
      setGame(gameCopy);

      // Check if correct
      const expectedMoveSan = answerMoves[currentMoveIndex];

      if (move.san === expectedMoveSan) {
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
        setTimeout(() => {
          const resetGame = new Chess();
          if (initialFen) {
            try {
              resetGame.load(initialFen);
            } catch (e) { }
          }
          setGame(resetGame);
          setLastMoveArrow(null);
          setCurrentMoveIndex(0);
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
  }, [isFailed, answerMoves, currentMoveIndex, game, lastMoveArrow]);

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-800 shadow-md">
        <button data-testid="back-button" onClick={onBack} className="p-2 hover:bg-slate-700 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2 min-w-0 px-2">
          <div
            data-testid="puzzle-category"
            className="max-w-[170px] truncate text-xs text-slate-400 capitalize"
            title={formatCategoryLabel(category)}
          >
            {formatCategoryLabel(category)}
          </div>
          <div data-testid="puzzle-index" className="font-mono text-slate-300 whitespace-nowrap">
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
                  onWordTap={setActiveDictionaryEntry}
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
        </div>



      </div>

      {activeDictionaryEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55" onClick={() => setActiveDictionaryEntry(null)}>
          <div
            className="w-full max-w-sm rounded-xl border border-slate-600 bg-slate-800 p-4 text-left shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-yellow-400">{activeDictionaryEntry.name}</h3>
                <p className={`inline-block mt-2 px-2 py-0.5 text-xs uppercase tracking-wider border rounded ${dictionaryTypeBadgeClass(activeDictionaryEntry.type)}`}>
                  {activeDictionaryEntry.type}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDictionaryEntry(null)}
                className="text-slate-400 hover:text-slate-200"
                aria-label="Close dictionary"
              >
                ✕
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-200 leading-relaxed">{activeDictionaryEntry.definition}</p>
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
    Object.keys(puzzlesData).forEach(cat => {
      totalCounts[cat] = Object.keys(puzzlesData[cat]).length;
      // Count how many keys in solvedPuzzles[cat] match keys in puzzlesData[cat]
      const solvedInCategory = solvedPuzzles[cat] || [];
      solvedCounts[cat] = solvedInCategory.length;
    });

    const sortedCategories = Object.keys(puzzlesData).sort((left, right) => {
      const leftComplete = (solvedCounts[left] || 0) >= (totalCounts[left] || 0) && (totalCounts[left] || 0) > 0;
      const rightComplete = (solvedCounts[right] || 0) >= (totalCounts[right] || 0) && (totalCounts[right] || 0) > 0;

      if (leftComplete === rightComplete) {
        return 0;
      }

      return leftComplete ? 1 : -1;
    });

    if (homeView === 'dictionary') {
      return (
        <DictionaryPage
          entries={dictionaryData.entries || []}
          onBack={() => setHomeView('categories')}
        />
      );
    }

    return <CategoryList
      categories={sortedCategories}
      onSelect={(category) => {
        setHomeView('categories');
        selectCategory(category);
      }}
      solvedCounts={solvedCounts}
      totalCounts={totalCounts}
      onOpenDictionary={() => setHomeView('dictionary')}
      dictionaryEntryCount={(dictionaryData.entries || []).length}
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
      />
    </ErrorBoundary>
  );
}
