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

  // Answer sequence
  const answerMoves = React.useMemo(() => {
    if (!puzzle) return [];
    return puzzle.answer.split(', ');
  }, [puzzle]);

  const playerColor = React.useMemo(() => {
    return game.turn() === 'w' ? 'white' : 'black';
  }, [game]);

  const onDrop = (sourceSquare, targetSquare) => {
    if (isPuzzleSolvedState || isFailed) return false;

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
        // Correct move - show instant feedback
        setMoveStatus('correct');

        if (currentMoveIndex === answerMoves.length - 1) {
          // Final move
          onSolved();
        } else {
          // Opponent moves automatically after a delay
          const nextIndex = currentMoveIndex + 1;
          setCurrentMoveIndex(nextIndex);

          setTimeout(() => {
            // Clear correct status before opponent moves
            setMoveStatus(null);

            const gameWithOpponent = new Chess(gameCopy.fen());
            const nextMoveSan = answerMoves[nextIndex];
            gameWithOpponent.move(nextMoveSan);
            setGame(gameWithOpponent);
            setCurrentMoveIndex(nextIndex + 1);
          }, 600);
        }
      } else {
        // Incorrect
        setMoveStatus('incorrect');
        setTimeout(() => {
          // FAIL-FAST RESET: Start the puzzle over
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
        <button onClick={onBack} className="p-2 hover:bg-slate-700 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="font-mono text-slate-300">
          {index + 1} / {total}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={downloadLogs} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white" title="Download Feedback Logs">
            <Download className="w-5 h-5" />
          </button>
          <button onClick={() => {
            const newGame = new Chess();
            if (initialFen) try { newGame.load(initialFen); } catch (e) { }
            setGame(newGame);
            setMoveStatus(null);
            setCurrentMoveIndex(0);
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
            orientation={playerColor}
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
          <button onClick={onPrev} disabled={index === 0} className="p-3 disabled:opacity-30 bg-slate-700 rounded-lg">
            <ChevronLeft />
          </button>

          <div className="text-center min-w-[120px]">
            {moveStatus === 'correct' ? (
              <div className="text-green-500 font-black text-xl animate-bounce">CORRECT!</div>
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

          <button onClick={onNext} disabled={index === total - 1} className="p-3 disabled:opacity-30 bg-slate-700 rounded-lg">
            <ChevronRight />
          </button>
        </div>

        {/* Hints */}
        <div className="space-y-2">
          {puzzle.hints.slice(0, hintsRevealed).map((hint, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="p-3 bg-slate-700/50 rounded-lg text-sm text-slate-200 border-l-4 border-yellow-500">
                <span className="font-bold text-yellow-500 mr-2">Hint {i + 1}:</span>
                {hint}
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

    return <CategoryList
      categories={Object.keys(puzzlesData)}
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
      />
    </ErrorBoundary>
  );
}
