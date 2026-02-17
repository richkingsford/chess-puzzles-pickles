import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { ChessgroundBoard } from './components/ChessgroundBoard';
import {
  Trophy, HelpCircle, ChevronLeft, ChevronRight,
  RotateCcw, ThumbsDown, AlertTriangle, XCircle,
  CheckCircle, ArrowLeft, Download, Trash2
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

const CategoryList = ({ categories, onSelect, solvedCounts, totalCounts }) => {
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
            {cat.replace(/-/g, ' ')}
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
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Settings</h2>
        <button
          onClick={() => window.downloadLogs()}
          className="w-full mb-3 bg-slate-800 p-3 rounded-lg flex items-center justify-center gap-2 text-sm text-slate-300 hover:bg-slate-700"
        >
          <Download className="w-4 h-4" /> Download Feedback Logs
        </button>
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
const normalizeTagTerm = (text) => String(text || '')
  .toLowerCase()
  .replace(/[^a-z\s-]/g, ' ')
  .replace(/[-\s]+/g, ' ')
  .trim();

const dictionaryTypeClass = (type) => {
  const key = String(type || '').toLowerCase();

  if (key.includes('tactic') || key.includes('mate-pattern')) {
    return 'text-sky-300 hover:text-sky-200';
  }
  if (key.includes('strategy') || key.includes('opening-principle')) {
    return 'text-emerald-300 hover:text-emerald-200';
  }
  if (key.includes('endgame') || key.includes('method')) {
    return 'text-purple-300 hover:text-purple-200';
  }
  if (key.includes('fundamental') || key.includes('board-concept') || key.includes('vocabulary')) {
    return 'text-amber-300 hover:text-amber-200';
  }

  return 'text-sky-300 hover:text-sky-200';
};

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
  const phraseMap = new Map();
  const tagMap = new Map();
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
      const tagKey = normalizeTagTerm(term);

      if (!phraseMap.has(phraseKey)) {
        phraseMap.set(phraseKey, entry);
      }

      if (tagKey && !tagMap.has(tagKey)) {
        tagMap.set(tagKey, entry);
      }

      maxWords = Math.max(maxWords, normalizedWords.length);

      normalizedWords.forEach((part) => {
        if (part.length >= 4 && !phraseMap.has(part)) {
          phraseMap.set(part, entry);
        }
      });
    });
  });

  return { phraseMap, tagMap, maxWords };
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
  const { phraseMap, maxWords } = dictionaryLookup;

  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    let found = null;

    for (let phraseLen = Math.min(maxWords, words.length - wordIndex); phraseLen >= 1; phraseLen -= 1) {
      const chunk = words.slice(wordIndex, wordIndex + phraseLen);
      const key = chunk.map((word) => word.normalized).join(' ');
      const entry = phraseMap.get(key);

      if (entry) {
        found = {
          entry,
          start: chunk[0].start,
          end: chunk[chunk.length - 1].end,
          wordCount: phraseLen
        };
        break;
      }
    }

    if (found) {
      matches.push(found);
      wordIndex += found.wordCount - 1;
    }
  }

  return matches;
};

const findDictionaryEntryForTag = (tag, dictionaryLookup) => {
  const normalizedTag = normalizeTagTerm(tag);

  if (!normalizedTag) {
    return null;
  }

  const exactMatch = dictionaryLookup.tagMap.get(normalizedTag);
  if (exactMatch) {
    return exactMatch;
  }

  const singularized = normalizedTag.replace(/\bpatterns\b/g, 'pattern').replace(/\bthemes\b/g, 'theme').trim();
  if (singularized && singularized !== normalizedTag) {
    const singularMatch = dictionaryLookup.tagMap.get(singularized);
    if (singularMatch) {
      return singularMatch;
    }
  }

  return null;
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
        className={`underline decoration-dotted underline-offset-2 ${dictionaryTypeClass(match.entry.type)}`}
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
  logFeedback,
  lastFeedbackType,
  downloadLogs,
  dictionaryEntries,
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
              gameWithOpponent.move(opponentReplySan);
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
    if (isFailed && answerMoves.length > 0) {
      // We need to find the from/to for the correct move.
      // We can use a temporary chess instance to parse the SAN.
      try {
        const tempGame = new Chess(game.fen());
        const move = tempGame.move(answerMoves[currentMoveIndex]);
        if (move) {
          return [[move.from, move.to]];
        }
      } catch (e) {
        console.error("Failed to parse answer move for arrow", e);
      }
    }
    return [];
  }, [isFailed, answerMoves, currentMoveIndex, game]);

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-800 shadow-md">
        <button data-testid="back-button" onClick={onBack} className="p-2 hover:bg-slate-700 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div data-testid="puzzle-index" className="font-mono text-slate-300">
          {index + 1} / {total}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={downloadLogs} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white" title="Download Feedback Logs">
            <Download className="w-5 h-5" />
          </button>
          <button data-testid="reset-button" onClick={() => {
            const newGame = new Chess();
            if (initialFen) try { newGame.load(initialFen); } catch (e) { }
            setGame(newGame);
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

        {Array.isArray(puzzle.tags) && puzzle.tags.length > 0 && (
          <div data-testid="tags-panel" className="w-full max-w-[400px] rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Tags</div>
            <div className="flex flex-wrap gap-2">
              {puzzle.tags.map((tag) => (
                <button
                  key={tag}
                  data-testid="tag-chip"
                  type="button"
                  onClick={() => {
                    const entry = findDictionaryEntryForTag(tag, dictionaryLookup);
                    if (entry) {
                      setActiveDictionaryEntry(entry);
                      return;
                    }

                    setActiveDictionaryEntry({
                      name: String(tag).replace(/-/g, ' '),
                      type: 'tag',
                      definition: 'This puzzle tag is recognized, but a dictionary definition is not available yet.',
                      aliases: []
                    });
                  }}
                  className="px-2 py-0.5 rounded-full border border-slate-600 bg-slate-700/60 text-[11px] text-slate-200 hover:bg-slate-700 transition-colors"
                  title={`Tap to learn: ${String(tag).replace(/-/g, ' ')}`}
                >
                  {String(tag).replace(/-/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        )}
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
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-[11px] text-slate-300">
            <span className="font-semibold text-slate-200 mr-2">Color key:</span>
            <span className="mr-2 text-sky-300">● Tactic</span>
            <span className="mr-2 text-emerald-300">● Strategy</span>
            <span className="mr-2 text-purple-300">● Endgame/Method</span>
            <span className="text-amber-300">● Basic word</span>
          </div>

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
              <div className="flex justify-start gap-2 px-1 relative">
                <button
                  onClick={() => logFeedback('too_generic', i)}
                  className="px-2 py-1 bg-slate-800 border border-slate-700 text-[10px] rounded-md hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Too Generic
                </button>
                <button
                  onClick={() => logFeedback('poorly_worded', i)}
                  className="px-2 py-1 bg-slate-800 border border-slate-700 text-[10px] rounded-md hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Poorly Worded
                </button>
                <button
                  onClick={() => logFeedback('irrelevant', i)}
                  className="px-2 py-1 bg-slate-800 border border-slate-700 text-[10px] rounded-md hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Irrelevant
                </button>
                <button
                  onClick={() => logFeedback('single_plural_confusion', i)}
                  className="px-2 py-1 bg-slate-800 border border-slate-700 text-[10px] rounded-md hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Single/Plural Confusion
                </button>

                {lastFeedbackType && (
                  <div className="absolute -top-6 left-0 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded shadow-lg animate-bounce pointer-events-none">
                    Feedback Captured!
                  </div>
                )}
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
    logFeedback,
    lastFeedbackType,
    resetAllProgress,
    downloadLogs
  } = usePuzzleGame();

  const [dictionaryData, setDictionaryData] = useState({ entries: [] });

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
  window.downloadLogs = downloadLogs;

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

    return <CategoryList
      categories={sortedCategories}
      onSelect={selectCategory}
      solvedCounts={solvedCounts}
      totalCounts={totalCounts}
    />;
  }

  return (
    <ErrorBoundary>
      <PuzzleView
        key={currentPuzzle.url}
        puzzle={currentPuzzle}
        initialFen={initialFen}
        orientation={puzzleOrientation}
        index={currentPuzzleIndex}
        total={totalPuzzles}
        onBack={() => selectCategory(null)}
        onNext={nextPuzzle}
        onPrev={prevPuzzle}
        onSolved={markSolved}
        onShowHint={showNextHint}
        hintsRevealed={hintsRevealed}
        isSolved={isSolved}
        isFailed={isFailed}
        logFeedback={logFeedback}
        lastFeedbackType={lastFeedbackType}
        downloadLogs={downloadLogs}
        dictionaryEntries={dictionaryData.entries || []}
      />
    </ErrorBoundary>
  );
}
