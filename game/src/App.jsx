import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import QRCode from 'qrcode';
import { ChessgroundBoard } from './components/ChessgroundBoard';
import BattleScene from './components/BattleScene';
import {
  Trophy, HelpCircle, ChevronLeft, ChevronRight,
  RotateCcw, ArrowLeft, Trash2, BookOpen, Shuffle,
  Users, QrCode, Link as LinkIcon, LogOut, MoreVertical, Download, Filter
} from 'lucide-react';
import { usePuzzleGame } from './hooks/usePuzzleGame';
import { useBattleState } from './hooks/useBattleState';
import { useRoomMultiplayer } from './hooks/useRoomMultiplayer';
import { normalizeRoomCode } from './lib/roomCodes';
import { parsePuzzleUrl } from './lib/utils';
import {
  getHintRevealCountForAnswerMove,
  getHintsForAnswerMove,
  getPlayerMoveCountFromAnswer,
  getPlayerMoveNumberForAnswerMove,
  hasStructuredMoveHints
} from './lib/puzzleHints';

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

const CATEGORY_FEEDBACK_STORAGE_KEY = 'categoryFeedback';
const CATEGORY_FEEDBACK_FILE_NAME = 'chess-puzzles-feedback.json';
const HINT_FEEDBACK_TAGS = ['Confusing', 'Too Subtle', 'Too Blatant', 'ID Usage'];
const VISUAL_MOTIF_DICTIONARY_LOOKUP = {
  Forks: 'Fork'
};

const makeEmptyCategoryFeedback = () => ({
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: null,
  categories: {},
  hints: {}
});

const normalizeCategoryFeedback = (feedback) => {
  const fallback = makeEmptyCategoryFeedback();

  if (!feedback || typeof feedback !== 'object' || Array.isArray(feedback)) {
    return fallback;
  }

  const categories =
    feedback.categories &&
    typeof feedback.categories === 'object' &&
    !Array.isArray(feedback.categories)
      ? feedback.categories
      : {};
  const hints =
    feedback.hints &&
    typeof feedback.hints === 'object' &&
    !Array.isArray(feedback.hints)
      ? feedback.hints
      : {};

  return {
    ...fallback,
    ...feedback,
    version: 1,
    createdAt: typeof feedback.createdAt === 'string' ? feedback.createdAt : fallback.createdAt,
    updatedAt: typeof feedback.updatedAt === 'string' ? feedback.updatedAt : null,
    categories,
    hints
  };
};

const getVisibleHomeCategories = (categories, categoryFeedback) => {
  const feedbackCategories = normalizeCategoryFeedback(categoryFeedback).categories;

  return categories.filter((category) => !feedbackCategories[category]?.garbage);
};

const readStoredCategoryFeedback = () => {
  try {
    const storedFeedback = localStorage.getItem(CATEGORY_FEEDBACK_STORAGE_KEY);

    if (!storedFeedback) {
      return makeEmptyCategoryFeedback();
    }

    return normalizeCategoryFeedback(JSON.parse(storedFeedback));
  } catch {
    return makeEmptyCategoryFeedback();
  }
};

const writeStoredCategoryFeedback = (feedback) => {
  try {
    localStorage.setItem(CATEGORY_FEEDBACK_STORAGE_KEY, JSON.stringify(feedback));
  } catch (error) {
    console.error('Failed to save category feedback', error);
  }
};

const downloadJsonFile = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const makeHintFeedbackKey = ({ category, puzzleUrl, answerMoveIndex, hintIndex }) => (
  [category || 'unknown-category', puzzleUrl || 'unknown-puzzle', answerMoveIndex, hintIndex]
    .map((part) => encodeURIComponent(String(part)))
    .join('|')
);

const CATEGORY_TYPE_ORDER = ['Mate', 'Tactics', 'Opening', 'Defense', 'Endgame'];

const VISUAL_MOTIFS = [
  'Forks',
  // Existing
  'Undefended pieces',
  'Single-defender pieces',
  'Checkable king',
  // King-safety
  'Loose back-rank',
  'Weak squares around king',
  'Pinned defender of king-side square',
  // Piece-coordination
  'Battery alignment',
  'X-ray attack',
  'Discovered attack potential',
  // Pawn-structure
  'Loose pawn',
  'Backward pawn',
  'Passed pawn',
  'Pawn break available',
  // Square-control
  'Outpost square available',
  'Promotion square weakly defended',
  // Tactical-trigger
  'Pinned piece',
  'Overloaded defender',
  'Trapped piece',
  'Mate-in-1 threat available',
  // Development / initiative
  'Rook penetration threat',
  'Knight on rim',
  'Bishop blocked by own pawns',
];

const WIN_CONFETTI_PARTICLES = [
  { dx: -38, dy: -26, rotation: '-120deg', delay: '0ms', color: '#fbbf24' },
  { dx: -18, dy: -42, rotation: '-70deg', delay: '40ms', color: '#f59e0b' },
  { dx: 8, dy: -48, rotation: '50deg', delay: '10ms', color: '#fde68a' },
  { dx: 30, dy: -34, rotation: '110deg', delay: '60ms', color: '#fb7185' },
  { dx: 46, dy: -10, rotation: '140deg', delay: '20ms', color: '#f97316' },
  { dx: 34, dy: 22, rotation: '200deg', delay: '80ms', color: '#2dd4bf' },
  { dx: 10, dy: 42, rotation: '230deg', delay: '35ms', color: '#22c55e' },
  { dx: -14, dy: 36, rotation: '-220deg', delay: '70ms', color: '#38bdf8' },
  { dx: -34, dy: 18, rotation: '-180deg', delay: '25ms', color: '#f472b6' },
  { dx: 0, dy: 18, rotation: '260deg', delay: '50ms', color: '#a3e635' }
];

const MultiplayerPanel = ({
  multiplayer,
  onHostRoom,
  onJoinRoom,
  onLeaveRoom
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copyState, setCopyState] = useState('idle');
  const room = multiplayer.room;
  const players = room?.players || [];
  const isConnecting = multiplayer.status === 'connecting';

  useEffect(() => {
    let cancelled = false;

    if (!multiplayer.roomUrl) {
      return () => {
        cancelled = true;
      };
    }

    QRCode.toDataURL(multiplayer.roomUrl, {
      margin: 1,
      width: 168,
      color: {
        dark: '#0f172a',
        light: '#f8fafc'
      }
    }).then((dataUrl) => {
      if (!cancelled) {
        setQrDataUrl(dataUrl);
      }
    }).catch(() => {
      if (!cancelled) {
        setQrDataUrl('');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [multiplayer.roomUrl]);

  useEffect(() => {
    if (copyState !== 'copied') return undefined;
    const timer = setTimeout(() => setCopyState('idle'), 1400);
    return () => clearTimeout(timer);
  }, [copyState]);

  const handleSubmitJoin = (event) => {
    event.preventDefault();
    onJoinRoom(joinCode);
  };

  const handleCopyLink = async () => {
    if (!multiplayer.roomUrl) return;

    try {
      await navigator.clipboard.writeText(multiplayer.roomUrl);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  if (room) {
    return (
      <section data-testid="multiplayer-room-panel" className="rounded-xl border border-cyan-700/70 bg-cyan-950/25 p-3 text-slate-100 shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-200">
              <Users className="h-4 w-4" />
              Room
            </div>
            <div data-testid="room-code" className="mt-1 font-mono text-2xl font-black tracking-[0.24em] text-white">
              {room.code}
            </div>
          </div>
          <div className="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-xs font-bold text-cyan-100">
            {players.length}/2
          </div>
        </div>

        <div className="grid grid-cols-[auto_1fr] items-center gap-3">
          <div className="flex h-[116px] w-[116px] items-center justify-center rounded-lg border border-slate-600 bg-slate-100 p-1">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Room ${room.code} invite`}
                className="h-full w-full"
              />
            ) : (
              <QrCode className="h-12 w-12 text-slate-700" />
            )}
          </div>

          <div className="min-w-0 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="copy-room-link-button"
                onClick={handleCopyLink}
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
              >
                <LinkIcon className="h-4 w-4" />
                {copyState === 'copied' ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                data-testid="leave-room-button"
                onClick={onLeaveRoom}
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-700/60 bg-red-950/35 px-2 text-xs font-semibold text-red-100 hover:bg-red-900/45"
              >
                <LogOut className="h-4 w-4" />
                Leave
              </button>
            </div>

            <div className="space-y-1">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-xs ${
                    player.id === multiplayer.playerId
                      ? 'border-emerald-400/70 bg-emerald-400/10 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.18)]'
                      : 'border-slate-700 bg-slate-800/60 text-slate-200'
                  }`}
                >
                  <span className="truncate font-semibold">{player.name}</span>
                  <span className={player.connected ? 'text-cyan-200' : 'text-slate-500'}>
                    {player.connected ? 'Ready' : 'Away'}
                  </span>
                </div>
              ))}
              {players.length < 2 && (
                <div className="rounded-md border border-dashed border-slate-600 px-2 py-1.5 text-xs font-semibold text-slate-400">
                  Waiting
                </div>
              )}
            </div>
          </div>
        </div>

        {multiplayer.error && (
          <div data-testid="room-error" className="mt-2 text-xs font-semibold text-red-300">
            {multiplayer.error}
          </div>
        )}
      </section>
    );
  }

  return (
    <section data-testid="multiplayer-panel" className="rounded-xl border border-cyan-800 bg-cyan-950/20 p-3 text-slate-100 shadow-lg">
      <button
        type="button"
        data-testid="host-room-button"
        onClick={onHostRoom}
        disabled={isConnecting}
        className="mb-2 flex w-full min-h-11 items-center justify-center gap-2 rounded-lg border border-cyan-500/50 bg-cyan-500/20 px-3 text-sm font-bold text-cyan-100 transition-colors hover:bg-cyan-500/30 disabled:cursor-wait disabled:opacity-70"
      >
        <Users className="h-4 w-4" />
        {isConnecting ? 'Connecting' : 'Host Room'}
      </button>

      <form onSubmit={handleSubmitJoin} className="grid grid-cols-[1fr_auto] gap-2">
        <input
          data-testid="join-room-code-input"
          aria-label="Room code"
          value={joinCode}
          onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))}
          maxLength={4}
          placeholder="CODE"
          className="min-h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 font-mono text-sm font-bold uppercase tracking-[0.2em] text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
        />
        <button
          type="submit"
          data-testid="join-room-button"
          disabled={isConnecting || joinCode.length !== 4}
          className="min-h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Join
        </button>
      </form>

      {multiplayer.error && (
        <div data-testid="room-error" className="mt-2 text-xs font-semibold text-red-300">
          {multiplayer.error}
        </div>
      )}
    </section>
  );
};

const normalizeCategoryType = (value) => {
  const key = String(value || '').trim().toLowerCase();

  if (!key) return 'Tactics';
  if (['mate', 'mates', 'mating'].includes(key)) return 'Mate';
  if (['tactic', 'tactics'].includes(key)) return 'Tactics';
  if (['opening', 'openings'].includes(key)) return 'Opening';
  if (['defense', 'defenses', 'defence', 'defences'].includes(key)) return 'Defense';
  if (['endgame', 'endgames'].includes(key)) return 'Endgame';
  if (['misc', 'miscellaneous', 'other', 'others'].includes(key)) return 'Tactics';

  return key.charAt(0).toUpperCase() + key.slice(1);
};

const inferCategoryTypeFromName = (category) => {
  const key = String(category || '').toLowerCase();

  if (key.includes('mate')) return 'Mate';
  if (key.includes('defense')) return 'Defense';
  const endgameLike = new Set([
    'advanced-pawn',
    'under-promotion',
    'zugzwang'
  ]);

  if (key.includes('endgame') || endgameLike.has(key)) return 'Endgame';

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

  if (
    key === 'castling' ||
    key === 'ruy-lopez' ||
    openingLike.some((word) => key.includes(word)) ||
    namedOpeningAttacks.has(key)
  ) {
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
    'en-passant',
    'attacking-f2-f7',
    'hanging-piece',
    'trapped-piece',
    'exposed-king'
  ]);

  if (tacticalLike.has(key)) {
    return 'Tactics';
  }

  return 'Tactics';
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

const buildCategoryStats = (puzzlesData, solvedPuzzles) => {
  if (!puzzlesData) {
    return {
      solvedCounts: {},
      totalCounts: {},
      categoryTypeMap: {},
      sortedCategories: []
    };
  }

  const solvedCounts = {};
  const totalCounts = {};
  const categoryTypeMap = {};

  Object.keys(puzzlesData).forEach((cat) => {
    const categoryData = puzzlesData[cat];
    const puzzleMap = getCategoryPuzzlesMap(categoryData);
    const puzzleUrls = new Set(Object.keys(puzzleMap));
    totalCounts[cat] = Object.keys(puzzleMap).length;
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

  return {
    solvedCounts,
    totalCounts,
    categoryTypeMap,
    sortedCategories
  };
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
  isRandomModeActive,
  multiplayer,
  onHostRoom,
  onJoinRoom,
  onLeaveRoom,
  selectedHomeTab,
  onSelectHomeTab,
  categoryFeedback,
  onToggleCategoryGarbage,
  onDownloadFeedback
}) => {
  const [openCategoryMenu, setOpenCategoryMenu] = useState(null);
  const [isTypeFilterOpen, setIsTypeFilterOpen] = useState(false);
  const homeTabs = [
    { id: 'single', label: 'Single Player' },
    { id: 'multiplayer', label: '2 Player' }
  ];
  const feedbackCategories = categoryFeedback?.categories || {};
  const garbageCategoryCount = Object.values(feedbackCategories).filter((entry) => entry?.garbage).length;

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-3xl font-bold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500">
        Chess Puzzles
      </h1>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-700 bg-slate-900 p-1">
        {homeTabs.map((tab) => {
          const isActive = selectedHomeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`home-tab-${tab.id}`}
              onClick={() => onSelectHomeTab(tab.id)}
              className={`min-h-14 rounded-lg border px-2 text-base font-black transition-colors ${
                isActive
                  ? 'border-yellow-400 bg-yellow-400/15 text-yellow-100 shadow-[0_0_18px_rgba(250,204,21,0.12)]'
                  : 'border-transparent bg-slate-800/70 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {selectedHomeTab === 'multiplayer' ? (
        <MultiplayerPanel
          multiplayer={multiplayer}
          onHostRoom={onHostRoom}
          onJoinRoom={onJoinRoom}
          onLeaveRoom={onLeaveRoom}
        />
      ) : (
        <>
          <div className="relative flex items-stretch gap-2">
            <button
              type="button"
              data-testid="random-mode-button"
              onClick={onStartRandomMode}
              className={`min-h-12 flex-1 rounded-xl border p-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                isRandomModeActive
                  ? 'border-teal-500 bg-teal-500/20 text-teal-200'
                  : 'border-teal-700 bg-teal-900/30 text-teal-200 hover:bg-teal-900/40'
              }`}
            >
              <Shuffle className="w-4 h-4" />
              Random Mode
            </button>

            <button
              type="button"
              data-testid="category-filter-button"
              aria-label={`Filter categories by type${selectedType !== 'All' ? `: ${selectedType}` : ''}`}
              aria-haspopup="menu"
              aria-expanded={isTypeFilterOpen}
              title="Filter categories by type"
              onClick={() => setIsTypeFilterOpen((isOpen) => !isOpen)}
              className={`relative flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                selectedType !== 'All'
                  ? 'border-yellow-500/70 bg-yellow-500/15 text-yellow-200'
                  : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Filter className="h-4 w-4" />
              {selectedType !== 'All' && (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-yellow-300" />
              )}
            </button>

            {isTypeFilterOpen && (
              <div
                role="menu"
                data-testid="category-type-filters"
                className="absolute right-0 top-[calc(100%+0.375rem)] z-20 w-64 rounded-lg border border-slate-600 bg-slate-900 p-2 shadow-2xl"
              >
                <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Type
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {typeFilters.map((type) => {
                    const isActive = selectedType === type;
                    const count = typeCounts[type] || 0;

                    return (
                      <button
                        key={type}
                        type="button"
                        role="menuitem"
                        data-testid="type-filter-button"
                        onClick={() => {
                          onSelectType(type);
                          setIsTypeFilterOpen(false);
                        }}
                        className={`rounded-md border px-2 py-2 text-left text-xs font-medium transition-colors ${
                          isActive
                            ? 'border-yellow-500 bg-yellow-500/20 text-yellow-200'
                            : 'border-transparent text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        {type} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {categories.map(cat => {
            const isMarkedGarbage = Boolean(feedbackCategories[cat]?.garbage);

            return (
              <div
                key={cat}
                className="relative flex w-full items-stretch rounded-xl border border-slate-700 bg-slate-800 shadow-lg transition-colors group hover:bg-slate-700 active:bg-slate-600"
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenCategoryMenu(null);
                    onSelect(cat);
                  }}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4 text-left"
                >
                  <span className="min-w-0 truncate font-medium text-lg capitalize text-slate-200">
                    {formatCategoryLabel(cat)}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
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
                <div className="relative flex items-center border-l border-slate-700/70">
                  <button
                    type="button"
                    data-testid="category-options-button"
                    aria-label="Category options"
                    aria-haspopup="menu"
                    aria-expanded={openCategoryMenu === cat}
                    title={`Options for ${formatCategoryLabel(cat)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenCategoryMenu((current) => (current === cat ? null : cat));
                    }}
                    className="flex h-full min-h-14 w-10 items-center justify-center text-slate-500 transition-colors hover:bg-slate-700/80 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {openCategoryMenu === cat && (
                    <div
                      role="menu"
                      data-testid="category-options-menu"
                      className="absolute right-0 top-[calc(100%+0.25rem)] z-20 w-48 rounded-lg border border-slate-600 bg-slate-900 p-1 shadow-2xl"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        data-testid="mark-category-garbage"
                        onClick={() => {
                          onToggleCategoryGarbage(cat);
                          setOpenCategoryMenu(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800"
                      >
                        <Trash2 className={`h-4 w-4 ${isMarkedGarbage ? 'text-yellow-300' : 'text-slate-400'}`} />
                        {isMarkedGarbage ? 'Unmark garbage' : 'Mark as garbage'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

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
              type="button"
              data-testid="download-feedback-file"
              onClick={onDownloadFeedback}
              className="mb-4 w-full bg-slate-800 p-3 rounded-lg flex items-center justify-between gap-3 text-sm text-slate-200 hover:bg-slate-700 border border-slate-700"
            >
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4 text-teal-300" />
                Download feedback file
              </span>
              <span className="text-xs text-slate-400">{garbageCategoryCount} marked</span>
            </button>
            <button
              onClick={() => window.resetProgress()}
              className="w-full bg-red-900/20 p-3 rounded-lg flex items-center justify-center gap-2 text-sm text-red-400 hover:bg-red-900/30 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Reset All Progress
            </button>
          </div>
        </>
      )}
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
                key={entry.name}
                data-testid="dictionary-entry"
                className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 shadow-lg"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-100">{entry.name}</h2>
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
  hintRevealCountsByMove,
  isSolved: isPuzzleSolvedState,
  isFailed,
  dictionaryEntries,
  category,
  index,
  total,
  isRandomMode,
  isCompleted,
  completedAt,
  battle,
  activeVisualMotifs,
  onToggleVisualMotif,
  onSelectVisualMotif,
  showVisualMotifButton,
  multiplayer,
  feedbackData,
  onToggleHintFeedbackTag
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
  const [confettiBurst, setConfettiBurst] = useState(null);
  const [openHintFeedbackKey, setOpenHintFeedbackKey] = useState(null);
  const prevHintsRevealedRef = useRef(hintsRevealed);
  const puzzleStartedAtRef = useRef(0);
  const puzzleMistakesRef = useRef(0);
  const boardShellRef = useRef(null);
  const confettiTimerRef = useRef(null);
  const lastInteractionPointRef = useRef(null);
  const pendingOverlayAdvanceRef = useRef(null);

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

  const selectedVisualMotif = React.useMemo(
    () => VISUAL_MOTIFS.find((motif) => activeVisualMotifs.has(motif)) || '',
    [activeVisualMotifs]
  );

  const openMotifDefinition = React.useCallback((motif) => {
    const lookupTerm = VISUAL_MOTIF_DICTIONARY_LOOKUP[motif] || motif;
    const motifEntry = dictionaryLookup.exactTermMap.get(String(lookupTerm).toLowerCase());
    const motifDefinition = motifEntry?.definition || 'Definition unavailable.';
    if (motifEntry) {
      openDictionaryEntry(motifEntry, motif);
      return;
    }
    // Reuse the existing dictionary modal flow even if this term is missing from the fetched lookup.
    openDictionaryEntry({ name: motif, definition: motifDefinition, aliases: [] }, motif);
  }, [dictionaryLookup, openDictionaryEntry]);

  const handleAdvanceOverlay = React.useCallback(() => {
    if (!VISUAL_MOTIFS.length) return;
    const currentIndex = selectedVisualMotif ? VISUAL_MOTIFS.indexOf(selectedVisualMotif) : -1;
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % VISUAL_MOTIFS.length;

    pendingOverlayAdvanceRef.current = {
      attempts: 0,
      maxAttempts: VISUAL_MOTIFS.length - 1
    };

    onSelectVisualMotif(VISUAL_MOTIFS[nextIndex]);
  }, [onSelectVisualMotif, selectedVisualMotif]);

  const clearConfettiTimer = React.useCallback(() => {
    if (confettiTimerRef.current) {
      clearTimeout(confettiTimerRef.current);
      confettiTimerRef.current = null;
    }
  }, []);

  const getConfettiOrigin = React.useCallback(() => {
    if (
      Number.isFinite(lastInteractionPointRef.current?.x) &&
      Number.isFinite(lastInteractionPointRef.current?.y)
    ) {
      return lastInteractionPointRef.current;
    }

    const boardRect = boardShellRef.current?.getBoundingClientRect();
    if (boardRect) {
      return {
        x: boardRect.left + (boardRect.width / 2),
        y: boardRect.top + (boardRect.height / 2)
      };
    }

    return {
      x: (typeof window !== 'undefined' ? window.innerWidth : 0) / 2,
      y: (typeof window !== 'undefined' ? window.innerHeight : 0) / 2
    };
  }, []);

  const triggerWinConfetti = React.useCallback(() => {
    const origin = getConfettiOrigin();

    clearConfettiTimer();
    setConfettiBurst({
      id: Date.now(),
      x: origin.x,
      y: origin.y
    });

    confettiTimerRef.current = setTimeout(() => {
      setConfettiBurst(null);
      confettiTimerRef.current = null;
    }, 1100);
  }, [clearConfettiTimer, getConfettiOrigin]);

  const handleBoardInteraction = React.useCallback((point) => {
    if (!point) {
      return;
    }

    lastInteractionPointRef.current = point;
  }, []);

  // Answer sequence
  const answerMoves = React.useMemo(() => {
    if (!puzzle) return [];
    return String(puzzle.answer || '')
      .split(',')
      .map((move) => move.trim())
      .filter(Boolean);
  }, [puzzle]);

  const structuredMoveHints = hasStructuredMoveHints(puzzle);
  const hintAnswerMoveIndex = structuredMoveHints ? currentMoveIndex : 0;
  const currentMoveHints = React.useMemo(
    () => getHintsForAnswerMove(puzzle, hintAnswerMoveIndex),
    [puzzle, hintAnswerMoveIndex]
  );
  const currentMoveHintsRevealed = hintRevealCountsByMove
    ? getHintRevealCountForAnswerMove(hintRevealCountsByMove, hintAnswerMoveIndex)
    : hintsRevealed;
  const visibleCurrentMoveHints = currentMoveHints.slice(0, currentMoveHintsRevealed);
  const currentPlayerMoveNumber = getPlayerMoveNumberForAnswerMove(currentMoveIndex);
  const playerMoveCount = React.useMemo(
    () => getPlayerMoveCountFromAnswer(puzzle?.answer),
    [puzzle?.answer]
  );
  const latestHintText = currentMoveHintsRevealed > 0
    ? currentMoveHints[currentMoveHintsRevealed - 1]
    : null;
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

  useEffect(() => {
    setConfettiBurst(null);
    lastInteractionPointRef.current = null;
    clearConfettiTimer();
    prevHintsRevealedRef.current = 0;
    puzzleStartedAtRef.current = Date.now();
    puzzleMistakesRef.current = 0;
  }, [puzzle?.url, clearConfettiTimer]);

  // Track hint reveals and fire battle damage
  useEffect(() => {
    if (hintsRevealed > prevHintsRevealedRef.current && battle) {
      battle.onHintUsed(hintsRevealed);
    }
    if (hintsRevealed > prevHintsRevealedRef.current && multiplayer?.isInRoom) {
      multiplayer.recordHint();
    }
    prevHintsRevealedRef.current = hintsRevealed;
  }, [hintsRevealed, battle, multiplayer]);

  useEffect(() => () => {
    clearConfettiTimer();
  }, [clearConfettiTimer]);

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
          triggerWinConfetti();
          if (battle) battle.onCorrectMove();
          if (multiplayer?.isInRoom) {
            multiplayer.recordCorrectMove();
            multiplayer.recordPuzzleSolved({
              elapsedMs: Date.now() - puzzleStartedAtRef.current,
              hints: hintsRevealed,
              mistakes: puzzleMistakesRef.current
            });
          }
          onSolved();
          setAutoAdvanceCountdown(index < total - 1 ? 3 : 4);
        } else {
          if (battle) battle.onCorrectMove();
          if (multiplayer?.isInRoom) {
            multiplayer.recordCorrectMove();
          }
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
        puzzleMistakesRef.current += 1;
        if (multiplayer?.isInRoom) {
          multiplayer.recordMistake();
        }
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
      } else {
        onBack();
      }
      return;
    }

    const timer = setTimeout(() => {
      setAutoAdvanceCountdown((value) => (value === null ? null : value - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoAdvanceCountdown, index, total, onBack, onNext]);

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

  const isPlayersTurn = game.turn() === (orientation === 'white' ? 'w' : 'b');

  const { highlightedSquares, enemyHighlightedSquares, motifArrows } = React.useMemo(() => {
    const empty = { highlightedSquares: [], enemyHighlightedSquares: [], motifArrows: [] };
    if (!showVisualMotifButton || activeVisualMotifs.size === 0) return empty;

    const tempGame = new Chess(game.fen());
    const turn = tempGame.turn();
    const opponent = turn === 'w' ? 'b' : 'w';
    const legalMoves = tempGame.moves({ verbose: true });

    const ownPieceSquares = [];
    const enemyPieceSquares = [];

    const board = tempGame.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (!piece) continue;
        const square = String.fromCharCode(97 + file) + (8 - rank);
        if (piece.color === turn) {
          ownPieceSquares.push({ square, piece });
        } else {
          enemyPieceSquares.push({ square, piece });
        }
      }
    }

    // Compute own-side check dests
    const ownCheckDests = new Set();

    legalMoves.forEach((move) => {
      if (move.color !== turn || !move.to) return;
      try {
        const testGame = new Chess(game.fen());
        testGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
        if (testGame.inCheck()) ownCheckDests.add(move.to);
      } catch (e) { /* ignore */ }
    });

    // Compute opponent check dests by flipping turn
    const enemyCheckDests = new Set();

    // Build a FEN with the opponent to move by swapping the active color
    const fenParts = game.fen().split(' ');
    fenParts[1] = opponent;
    try {
      const oppGame = new Chess(fenParts.join(' '));
      const oppMoves = oppGame.moves({ verbose: true });
      oppMoves.forEach((move) => {
        if (!move.to) return;
        try {
          const testGame = new Chess(fenParts.join(' '));
          testGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
          if (testGame.inCheck()) enemyCheckDests.add(move.to);
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore invalid flipped FEN */ }

    const ownSet = new Map();
    const enemySet = new Map();
    const motifArrowMap = new Map();
    const getHighlightKey = (highlight) => (
      typeof highlight === 'string'
        ? highlight
        : `${highlight.square}|${highlight.type || ''}|${highlight.symbol || ''}`
    );
    const addAll = (set, arr) => arr.forEach((highlight) => {
      set.set(getHighlightKey(highlight), highlight);
    });
    const addMotifArrow = (arrow) => {
      if (!arrow?.orig || !arrow?.dest) return;
      motifArrowMap.set(`${arrow.orig}|${arrow.dest}|${arrow.brush || 'yellow'}`, arrow);
    };

    if (activeVisualMotifs.has('Undefended pieces')) {
      addAll(ownSet, ownPieceSquares.filter((p) => p.piece.type !== 'k' && !tempGame.isAttacked(p.square, turn)).map((p) => p.square));
      addAll(enemySet, enemyPieceSquares.filter((p) => p.piece.type !== 'k' && !tempGame.isAttacked(p.square, opponent)).map((p) => p.square));
    }

    if (activeVisualMotifs.has('Single-defender pieces')) {
      addAll(ownSet, ownPieceSquares.filter((p) => p.piece.type !== 'k' && tempGame.attackers(p.square, turn).length === 1).map((p) => p.square));
      addAll(enemySet, enemyPieceSquares.filter((p) => p.piece.type !== 'k' && tempGame.attackers(p.square, opponent).length === 1).map((p) => p.square));
    }

    // King-safety: Loose back-rank — no practical king escape and enemy heavy-piece check potential exists.
    if (activeVisualMotifs.has('Loose back-rank')) {
      const getLooseBackRank = (pieces, enemyPieces, color, enemyColor) => {
        const king = pieces.find((p) => p.piece.type === 'k');
        const homeRank = color === 'w' ? 1 : 8;
        if (!king || Number(king.square[1]) !== homeRank) return [];

        const kingFile = king.square.charCodeAt(0) - 97;
        const escapeRank = color === 'w' ? 2 : 7;
        const escapeSquares = [];
        const blockers = [];

        // Squares in front/around the king that typically provide back-rank luft.
        for (let df = -1; df <= 1; df++) {
          const f = kingFile + df;
          if (f < 0 || f > 7) continue;
          const sq = String.fromCharCode(97 + f) + escapeRank;
          escapeSquares.push(sq);
          const occupant = tempGame.get(sq);
          if (occupant && occupant.color === color) {
            blockers.push(sq);
          }
        }

        // Legal king-move check: if king can legally leave the back rank, this is not a true back-rank bind.
        const kingEscapeExists = (() => {
          const fenParts = tempGame.fen().split(' ');
          fenParts[1] = color;
          try {
            const sideGame = new Chess(fenParts.join(' '));
            const legalKingMoves = sideGame
              .moves({ verbose: true })
              .filter((move) => move.piece === 'k' && move.from === king.square);
            return legalKingMoves.some((move) => {
              if (Number(move.to[1]) !== homeRank) {
                const toSq = move.to;
                return !tempGame.isAttacked(toSq, enemyColor);
              }
              return false;
            });
          } catch (e) {
            return false;
          }
        })();

        if (kingEscapeExists) return [];

        const enemyHeavyPieces = enemyPieces.filter((p) => p.piece.type === 'r' || p.piece.type === 'q');
        if (!enemyHeavyPieces.length) return [];

        // Require concrete heavy-piece checking potential, not just a boxed king shape.
        const heavyCheckThreatSquares = (() => {
          const fenParts = tempGame.fen().split(' ');
          fenParts[1] = enemyColor;
          try {
            const enemyTurnGame = new Chess(fenParts.join(' '));
            const threatSquares = [];
            enemyTurnGame.moves({ verbose: true }).forEach((move) => {
              if (!['r', 'q'].includes(move.piece)) return;
              try {
                const testGame = new Chess(enemyTurnGame.fen());
                testGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
                if (testGame.isAttacked(king.square, enemyColor)) {
                  threatSquares.push(move.to);
                }
              } catch (e) {
                // Ignore illegal/transient simulations.
              }
            });
            return threatSquares;
          } catch (e) {
            return [];
          }
        })();

        if (!heavyCheckThreatSquares.length) return [];

        return [
          king.square,
          ...blockers,
          ...heavyCheckThreatSquares
        ];
      };

      addAll(ownSet, getLooseBackRank(ownPieceSquares, enemyPieceSquares, turn, opponent));
      addAll(enemySet, getLooseBackRank(enemyPieceSquares, ownPieceSquares, opponent, turn));
    }

    // King-safety: Weak squares around king — under-defended king-ring squares with concrete enemy access.
    if (activeVisualMotifs.has('Weak squares around king')) {
      const getWeakKingSquares = (pieces, friendlyColor, enemyColor) => {
        const king = pieces.find((p) => p.piece.type === 'k');
        if (!king) return [];

        const enemyAccessMap = (() => {
          const map = new Map();
          const fenParts = tempGame.fen().split(' ');
          fenParts[1] = enemyColor;
          try {
            const enemyTurnGame = new Chess(fenParts.join(' '));
            enemyTurnGame.moves({ verbose: true }).forEach((move) => {
              const key = move.to;
              if (!key) return;
              const forcingByNature = Boolean(move.captured) || move.piece !== 'p';
              let forcingByCheck = false;
              try {
                const t = new Chess(enemyTurnGame.fen());
                t.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
                forcingByCheck = t.isAttacked(king.square, enemyColor);
              } catch (e) {
                // Ignore transient simulation failures.
              }

              if (forcingByNature || forcingByCheck) {
                const existing = map.get(key) || [];
                existing.push(move.from);
                map.set(key, existing);
              }
            });
          } catch (e) {
            return new Map();
          }
          return map;
        })();

        const kFile = king.square.charCodeAt(0) - 97;
        const kRank = Number(king.square[1]);
        const weak = [];
        for (let df = -1; df <= 1; df++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (df === 0 && dr === 0) continue;
            const f = kFile + df;
            const r = kRank + dr;
            if (f < 0 || f > 7 || r < 1 || r > 8) continue;
            const sq = String.fromCharCode(97 + f) + r;

            const enemyAttackers = tempGame.attackers(sq, enemyColor);
            const friendlyAttackers = tempGame.attackers(sq, friendlyColor);
            if (!enemyAttackers.length) continue;

            // Require true under-defense, not just nominal attack.
            if (friendlyAttackers.length >= enemyAttackers.length) continue;

            const concreteEnemyAccess = enemyAccessMap.get(sq) || [];
            if (!concreteEnemyAccess.length) continue;

            weak.push(sq, ...concreteEnemyAccess.slice(0, 2));
          }
        }
        return weak;
      };
      addAll(ownSet, getWeakKingSquares(ownPieceSquares, turn, opponent));
      addAll(enemySet, getWeakKingSquares(enemyPieceSquares, opponent, turn));
    }

    // King-safety merged into Checkable king:
    // direct checking moves plus open-line slider pressure/check potential.
    if (activeVisualMotifs.has('Checkable king')) {
      addAll(ownSet, ownCheckDests);
      addAll(enemySet, enemyCheckDests);

      const getOpenLineSquares = (pieces, enemyPieces, color, enemyColor) => {
        const king = pieces.find((p) => p.piece.type === 'k');
        if (!king) return [];

        const sliderTypeByDir = [
          { df: 1, dr: 0, types: new Set(['r', 'q']) },
          { df: -1, dr: 0, types: new Set(['r', 'q']) },
          { df: 0, dr: 1, types: new Set(['r', 'q']) },
          { df: 0, dr: -1, types: new Set(['r', 'q']) },
          { df: 1, dr: 1, types: new Set(['b', 'q']) },
          { df: 1, dr: -1, types: new Set(['b', 'q']) },
          { df: -1, dr: 1, types: new Set(['b', 'q']) },
          { df: -1, dr: -1, types: new Set(['b', 'q']) }
        ];

        const kingFile = king.square.charCodeAt(0) - 97;
        const kingRank = Number(king.square[1]);
        const directPressureSquares = [];

        sliderTypeByDir.forEach(({ df, dr, types }) => {
          let f = kingFile + df;
          let r = kingRank + dr;
          const ray = [];

          while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
            const sq = String.fromCharCode(97 + f) + r;
            const occ = tempGame.get(sq);
            if (!occ) {
              ray.push(sq);
              f += df;
              r += dr;
              continue;
            }

            if (occ.color === enemyColor && types.has(occ.type)) {
              directPressureSquares.push(king.square, sq, ...ray.slice(0, 2));
            }
            break;
          }
        });

        const sliderCheckSquares = (() => {
          const fenParts = tempGame.fen().split(' ');
          fenParts[1] = enemyColor;
          try {
            const enemyTurnGame = new Chess(fenParts.join(' '));
            const threats = [];
            enemyTurnGame.moves({ verbose: true }).forEach((move) => {
              if (!['r', 'b', 'q'].includes(move.piece)) return;
              try {
                const testGame = new Chess(enemyTurnGame.fen());
                testGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
                if (testGame.isAttacked(king.square, enemyColor)) {
                  threats.push(move.to);
                }
              } catch (e) {
                // Ignore transient simulation failures.
              }
            });
            return threats;
          } catch (e) {
            return [];
          }
        })();

        if (!directPressureSquares.length && !sliderCheckSquares.length) {
          return [];
        }

        return [
          ...directPressureSquares,
          ...sliderCheckSquares
        ];
      };

      addAll(ownSet, getOpenLineSquares(ownPieceSquares, enemyPieceSquares, turn, opponent));
      addAll(enemySet, getOpenLineSquares(enemyPieceSquares, ownPieceSquares, opponent, turn));
    }

    // King-safety: Pinned defender of king-side square — piece that if moved would expose king to attack
    if (activeVisualMotifs.has('Pinned defender of king-side square')) {
      const getPinnedDefenders = (pieces, color, enemyColor) => {
        const results = [];
        for (const { square, piece } of pieces) {
          if (piece.type === 'k') continue;
          // Try removing the piece and see if king becomes attacked
          const fenCopy = tempGame.fen();
          try {
            const testGame = new Chess(fenCopy);
            // Place nothing on that square by removing the piece
            testGame.remove(square);
            const king = pieces.find((p) => p.piece.type === 'k');
            if (king && testGame.isAttacked(king.square, enemyColor)) {
              results.push(square);
            }
          } catch (e) { /* ignore */ }
        }
        return results;
      };
      addAll(ownSet, getPinnedDefenders(ownPieceSquares, turn, opponent));
      addAll(enemySet, getPinnedDefenders(enemyPieceSquares, opponent, turn));
    }

    // Piece-coordination: Battery alignment — aligned long-range pair with clear spacing and pressure toward enemy king.
    if (activeVisualMotifs.has('Battery alignment')) {
      const getBatterySquares = (pieces, enemyPieces, enemyColor) => {
        const results = [];
        const enemyKing = enemyPieces.find((p) => p.piece.type === 'k');
        if (!enemyKing) return results;

        const byType = {};
        pieces.forEach((p) => {
          byType[p.piece.type] = byType[p.piece.type] || [];
          byType[p.piece.type].push(p);
        });

        const queens = byType.q || [];
        const rooks = byType.r || [];
        const bishops = byType.b || [];

        const inBounds = (f, r) => f >= 0 && f <= 7 && r >= 1 && r <= 8;
        const sqToCoords = (sq) => ({ f: sq.charCodeAt(0) - 97, r: Number(sq[1]) });
        const step = (a, b) => {
          const df = b.f - a.f;
          const dr = b.r - a.r;
          if (df === 0 && dr === 0) return null;
          const sf = df === 0 ? 0 : (df > 0 ? 1 : -1);
          const sr = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
          if (!(df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr))) return null;
          return { sf, sr };
        };

        const clearBetween = (fromSq, toSq) => {
          const a = sqToCoords(fromSq);
          const b = sqToCoords(toSq);
          const d = step(a, b);
          if (!d) return false;
          let f = a.f + d.sf;
          let r = a.r + d.sr;
          while (f !== b.f || r !== b.r) {
            const sq = String.fromCharCode(97 + f) + r;
            if (tempGame.get(sq)) return false;
            f += d.sf;
            r += d.sr;
          }
          return true;
        };

        const linePressesKing = (backSq, frontSq) => {
          const back = sqToCoords(backSq);
          const front = sqToCoords(frontSq);
          const king = sqToCoords(enemyKing.square);
          const d = step(back, front);
          if (!d) return false;
          let f = front.f + d.sf;
          let r = front.r + d.sr;
          let enemyBlockers = 0;

          while (inBounds(f, r)) {
            const sq = String.fromCharCode(97 + f) + r;
            const occ = tempGame.get(sq);
            if (sq === enemyKing.square) {
              return enemyBlockers <= 1;
            }
            if (occ) {
              if (occ.color !== enemyColor) return false;
              enemyBlockers += 1;
              if (enemyBlockers > 1) return false;
            }
            f += d.sf;
            r += d.sr;
          }

          return false;
        };

        const pairs = [];
        queens.forEach((q) => bishops.forEach((b) => pairs.push([q, b])));
        for (let i = 0; i < rooks.length; i += 1) {
          for (let j = i + 1; j < rooks.length; j += 1) {
            pairs.push([rooks[i], rooks[j]]);
          }
        }
        queens.forEach((q) => rooks.forEach((r) => pairs.push([q, r])));

        pairs.forEach(([aPiece, bPiece]) => {
          const a = sqToCoords(aPiece.square);
          const b = sqToCoords(bPiece.square);
          const alignedOrth = a.f === b.f || a.r === b.r;
          const alignedDiag = Math.abs(a.f - b.f) === Math.abs(a.r - b.r);

          const orthoOnly = ['r', 'q'].includes(aPiece.piece.type) && ['r', 'q'].includes(bPiece.piece.type);
          const diagPair = (aPiece.piece.type === 'q' && bPiece.piece.type === 'b') || (aPiece.piece.type === 'b' && bPiece.piece.type === 'q');

          if ((orthoOnly && !alignedOrth) || (diagPair && !alignedDiag)) return;
          if (!clearBetween(aPiece.square, bPiece.square)) return;

          const forwardA = linePressesKing(aPiece.square, bPiece.square);
          const forwardB = linePressesKing(bPiece.square, aPiece.square);

          if (forwardA || forwardB) {
            results.push(aPiece.square, bPiece.square, enemyKing.square);
          }
        });

        return results;
      };

      addAll(ownSet, getBatterySquares(ownPieceSquares, enemyPieceSquares, opponent));
      addAll(enemySet, getBatterySquares(enemyPieceSquares, ownPieceSquares, turn));
    }

    // Piece-coordination: X-ray attack — sliding piece attacks through another piece to a target behind it
    if (activeVisualMotifs.has('X-ray attack')) {
      const getXraySquares = (pieces, enemyPieces) => {
        const results = [];
        const slidingDirs = { 'r': [[0,1],[0,-1],[1,0],[-1,0]], 'b': [[1,1],[1,-1],[-1,1],[-1,-1]], 'q': [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] };
        for (const { square, piece } of pieces) {
          const dirs = slidingDirs[piece.type];
          if (!dirs) continue;
          const sf = square.charCodeAt(0) - 97, sr = Number(square[1]);
          for (const [df, dr] of dirs) {
            let f = sf + df, r = sr + dr;
            let firstPiece = null;
            while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
              const sq = String.fromCharCode(97 + f) + r;
              const p = tempGame.get(sq);
              if (p) {
                if (!firstPiece) {
                  firstPiece = { sq, p };
                } else {
                  // Found second piece behind the first — x-ray if it's an enemy piece
                  if (p.color !== piece.color) {
                    results.push(square, firstPiece.sq, sq);
                  }
                  break;
                }
              }
              f += df;
              r += dr;
            }
          }
        }
        return results;
      };
      addAll(ownSet, getXraySquares(ownPieceSquares, enemyPieceSquares));
      addAll(enemySet, getXraySquares(enemyPieceSquares, ownPieceSquares));
    }

    // Piece-coordination: Discovered attack potential — piece can move to reveal an attack from a piece behind it
    if (activeVisualMotifs.has('Discovered attack potential')) {
      const getDiscoveredSquares = (pieces, color, enemyColor) => {
        const results = [];
        const slidingDirs = { 'r': [[0,1],[0,-1],[1,0],[-1,0]], 'b': [[1,1],[1,-1],[-1,1],[-1,-1]], 'q': [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] };
        // For each friendly sliding piece, look along its rays
        for (const { square: sliderSq, piece: slider } of pieces) {
          const dirs = slidingDirs[slider.type];
          if (!dirs) continue;
          const sf = sliderSq.charCodeAt(0) - 97, sr = Number(sliderSq[1]);
          for (const [df, dr] of dirs) {
            let f = sf + df, r = sr + dr;
            let blocker = null;
            while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
              const sq = String.fromCharCode(97 + f) + r;
              const p = tempGame.get(sq);
              if (p) {
                if (!blocker) {
                  // First piece in the way — potential blocker that can move to discover
                  if (p.color === color && p.type !== 'k') {
                    blocker = { sq, p };
                  } else {
                    break; // enemy piece or king blocks, no discovery
                  }
                } else {
                  // Second piece — if enemy, the blocker can discover an attack
                  if (p.color === enemyColor) {
                    results.push(blocker.sq);
                  }
                  break;
                }
              }
              f += df;
              r += dr;
            }
          }
        }
        return results;
      };
      addAll(ownSet, getDiscoveredSquares(ownPieceSquares, turn, opponent));
      addAll(enemySet, getDiscoveredSquares(enemyPieceSquares, opponent, turn));
    }

    // Piece-coordination: Forks - legal moves that create concrete forks on quality targets.
    if (activeVisualMotifs.has('Forks')) {
      const KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      const pieceValue = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
      const slidingAxes = {
        diagonal: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
        horizontal: [[1, 0], [-1, 0]],
        vertical: [[0, 1], [0, -1]]
      };

      const isQualityForkTargets = (targets) => (
        targets.length >= 2 &&
        targets.some((target) => target.value >= 5 || target.type === 'k')
      );

      const addForkPattern = (results, move, targets, brush) => {
        if (!isQualityForkTargets(targets)) return;

        const selectedTargets = [...targets]
          .sort((left, right) => right.value - left.value)
          .slice(0, 3);

        selectedTargets.forEach((target) => {
          results.push({
            orig: move.to,
            dest: target.square,
            brush
          });
        });
      };

      const getSlidingTargets = (boardState, fromSquare, enemyColor, dirs) => {
        const targets = [];
        const fromFile = fromSquare.charCodeAt(0) - 97;
        const fromRank = Number(fromSquare[1]);

        dirs.forEach(([df, dr]) => {
          let file = fromFile + df;
          let rank = fromRank + dr;

          while (file >= 0 && file <= 7 && rank >= 1 && rank <= 8) {
            const square = String.fromCharCode(97 + file) + rank;
            const occupant = boardState.get(square);

            if (!occupant) {
              file += df;
              rank += dr;
              continue;
            }

            if (occupant.color === enemyColor && occupant.type !== 'p') {
              targets.push({
                square,
                value: pieceValue[occupant.type] || 0,
                type: occupant.type
              });
            }
            break;
          }
        });

        return targets;
      };

      const getForkableArrows = (color, enemyColor, brush) => {
        const results = [];

        const fenParts = tempGame.fen().split(' ');
        fenParts[1] = color;

        try {
          const sideGame = new Chess(fenParts.join(' '));
          const legalForkMoves = sideGame
            .moves({ verbose: true })
            .filter((move) => ['n', 'b', 'r', 'q'].includes(move.piece));

          legalForkMoves.forEach((move) => {
            const testGame = new Chess(sideGame.fen());
            testGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });

            const friendlySupport = testGame.attackers(move.to, color).length;
            const enemyPressure = testGame.attackers(move.to, enemyColor).length;
            if (enemyPressure > friendlySupport + 1) return;

            if (move.piece === 'n') {
              const toFile = move.to.charCodeAt(0) - 97;
              const toRank = Number(move.to[1]);
              const attackedTargets = [];

              KNIGHT_OFFSETS.forEach(([df, dr]) => {
                const targetFile = toFile + df;
                const targetRank = toRank + dr;
                if (targetFile < 0 || targetFile > 7 || targetRank < 1 || targetRank > 8) return;
                const square = String.fromCharCode(97 + targetFile) + targetRank;
                const occupant = testGame.get(square);
                if (!occupant || occupant.color !== enemyColor || occupant.type === 'p') return;
                attackedTargets.push({ square, value: pieceValue[occupant.type] || 0, type: occupant.type });
              });

              addForkPattern(results, move, attackedTargets, brush);
              return;
            }

            const axisTargets = {};
            if (move.piece === 'b' || move.piece === 'q') {
              axisTargets.diagonal = getSlidingTargets(testGame, move.to, enemyColor, slidingAxes.diagonal);
              addForkPattern(results, move, axisTargets.diagonal, brush);
            }
            if (move.piece === 'r' || move.piece === 'q') {
              axisTargets.horizontal = getSlidingTargets(testGame, move.to, enemyColor, slidingAxes.horizontal);
              axisTargets.vertical = getSlidingTargets(testGame, move.to, enemyColor, slidingAxes.vertical);
              addForkPattern(results, move, axisTargets.horizontal, brush);
              addForkPattern(results, move, axisTargets.vertical, brush);
            }

            const groupedForkExists = Object.values(axisTargets).some(isQualityForkTargets);
            if (groupedForkExists) return;

            const mixedTargets = Object.values(axisTargets).flat();
            if (!isQualityForkTargets(mixedTargets)) return;

            addForkPattern(results, move, mixedTargets, brush);
          });
        } catch (e) {
          return [];
        }

        return results;
      };
      getForkableArrows(turn, opponent, 'yellow').forEach(addMotifArrow);
      getForkableArrows(opponent, turn, 'red').forEach(addMotifArrow);
    }

    // Pawn-structure: Loose pawn — pawn not defended by any friendly piece
    if (activeVisualMotifs.has('Loose pawn')) {
      addAll(ownSet, ownPieceSquares.filter((p) => p.piece.type === 'p' && !tempGame.isAttacked(p.square, turn)).map((p) => p.square));
      addAll(enemySet, enemyPieceSquares.filter((p) => p.piece.type === 'p' && !tempGame.isAttacked(p.square, opponent)).map((p) => p.square));
    }

    // Pawn-structure: Backward pawn — no adjacent pawn support, blocked/unsafe advance square, and enemy pawn pressure.
    if (activeVisualMotifs.has('Backward pawn')) {
      const getBackwardPawns = (pieces, color, enemyColor) => {
        const dir = color === 'w' ? 1 : -1;
        const pawns = pieces.filter((p) => p.piece.type === 'p');
        const results = [];

        const enemyPawnControls = (square) => tempGame
          .attackers(square, enemyColor)
          .filter((sq) => tempGame.get(sq)?.type === 'p');

        const friendlyPawnControls = (square) => tempGame
          .attackers(square, color)
          .filter((sq) => tempGame.get(sq)?.type === 'p');

        for (const p of pawns) {
          const f = p.square.charCodeAt(0) - 97;
          const r = Number(p.square[1]);

          // Backward-pawn candidates need to be away from start squares and not already near promotion.
          if ((color === 'w' && (r <= 2 || r >= 7)) || (color === 'b' && (r >= 7 || r <= 2))) continue;

          const frontR = r + dir;
          if (frontR < 1 || frontR > 8) continue;
          const frontSq = String.fromCharCode(97 + f) + frontR;

          const frontOccupant = tempGame.get(frontSq);
          if (frontOccupant?.color === color) continue;

          // A non-backward pawn normally has neighboring pawn support on the same/advanced rank.
          const hasAdjacentSupport = pawns.some((other) => {
            if (other.square === p.square) return false;
            const of = other.square.charCodeAt(0) - 97;
            const or = Number(other.square[1]);
            if (Math.abs(of - f) !== 1) return false;
            return color === 'w' ? or > r : or < r;
          });
          if (hasAdjacentSupport) continue;

          const enemyPawnPressure = enemyPawnControls(frontSq);
          if (!enemyPawnPressure.length) continue;

          const friendlyPawnSupport = friendlyPawnControls(frontSq);
          // If friendly pawn support is at least equal, it's likely not a true backward weakness.
          if (friendlyPawnSupport.length >= enemyPawnPressure.length) continue;

          // Strong backward signal: advance is blocked OR materially unsafe for pawn structure.
          const blockedAdvance = Boolean(frontOccupant);
          const unsafeAdvance = enemyPawnPressure.length > friendlyPawnSupport.length;
          if (!blockedAdvance && !unsafeAdvance) continue;

          results.push(p.square, frontSq, ...enemyPawnPressure.slice(0, 2));
        }
        return results;
      };
      addAll(ownSet, getBackwardPawns(ownPieceSquares, turn, opponent));
      addAll(enemySet, getBackwardPawns(enemyPieceSquares, opponent, turn));
    }

    // Pawn-structure: Passed pawn — pawn with no enemy pawns on same or adjacent files ahead of it
    if (activeVisualMotifs.has('Passed pawn')) {
      const getPassedPawns = (pieces, color, enemyPieces) => {
        const dir = color === 'w' ? 1 : -1;
        const pawns = pieces.filter((p) => p.piece.type === 'p');
        const enemyPawns = enemyPieces.filter((p) => p.piece.type === 'p');
        const results = [];
        for (const p of pawns) {
          const f = p.square.charCodeAt(0) - 97;
          const r = Number(p.square[1]);
          let passed = true;
          for (const ep of enemyPawns) {
            const ef = ep.square.charCodeAt(0) - 97;
            const er = Number(ep.square[1]);
            if (Math.abs(ef - f) > 1) continue;
            if (dir === 1 ? er > r : er < r) { passed = false; break; }
          }
          if (passed) results.push(p.square);
        }
        return results;
      };
      addAll(ownSet, getPassedPawns(ownPieceSquares, turn, enemyPieceSquares));
      addAll(enemySet, getPassedPawns(enemyPieceSquares, opponent, ownPieceSquares));
    }

    // Pawn-structure: Pawn break available — friendly pawn can capture an enemy pawn diagonally
    if (activeVisualMotifs.has('Pawn break available')) {
      const getLeverPawns = (pieces, color) => {
        const dir = color === 'w' ? 1 : -1;
        const results = [];
        for (const p of pieces) {
          if (p.piece.type !== 'p') continue;
          const f = p.square.charCodeAt(0) - 97;
          const r = Number(p.square[1]);
          const captureR = r + dir;
          if (captureR < 1 || captureR > 8) continue;
          for (const df of [-1, 1]) {
            const cf = f + df;
            if (cf < 0 || cf > 7) continue;
            const sq = String.fromCharCode(97 + cf) + captureR;
            const target = tempGame.get(sq);
            if (target && target.type === 'p' && target.color !== color) {
              results.push(p.square, sq);
            }
          }
        }
        return results;
      };
      addAll(ownSet, getLeverPawns(ownPieceSquares, turn));
      addAll(enemySet, getLeverPawns(enemyPieceSquares, opponent));
    }

    // Development / initiative: Rook penetration threat — legal rook infiltration into enemy camp with viable safety/pressure.
    if (activeVisualMotifs.has('Rook penetration threat')) {
      const getRookPenetrationSquares = (pieces, color, enemyColor) => {
        const results = [];

        const fenParts = tempGame.fen().split(' ');
        fenParts[1] = color;

        try {
          const sideGame = new Chess(fenParts.join(' '));
          const rookMoves = sideGame.moves({ verbose: true }).filter((move) => move.piece === 'r');

          rookMoves.forEach((move) => {
            const fromF = move.from.charCodeAt(0) - 97;
            const fromR = Number(move.from[1]);
            const toF = move.to.charCodeAt(0) - 97;
            const toR = Number(move.to[1]);

            // Penetration should move forward and reach enemy territory.
            const isForward = color === 'w' ? toR > fromR : toR < fromR;
            const inEnemyCamp = color === 'w' ? toR >= 6 : toR <= 3;
            if (!isForward || !inEnemyCamp) return;

            // Prefer open/semi-open files (no friendly pawns on the file).
            let hasFriendlyPawnOnFile = false;
            for (let rank = 1; rank <= 8; rank += 1) {
              const sq = String.fromCharCode(97 + toF) + rank;
              const occ = tempGame.get(sq);
              if (occ?.type === 'p' && occ.color === color) {
                hasFriendlyPawnOnFile = true;
                break;
              }
            }
            if (hasFriendlyPawnOnFile) return;

            // Validate that the destination is not tactically suicidal.
            const testGame = new Chess(sideGame.fen());
            testGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });

            const friendlyAttackers = testGame.attackers(move.to, color).length;
            const enemyAttackers = testGame.attackers(move.to, enemyColor).length;
            if (enemyAttackers > friendlyAttackers + 1) return;

            // Require immediate pressure after penetration (king line or attack on enemy piece).
            let createsPressure = false;
            const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
            for (const [df, dr] of dirs) {
              let f = toF + df;
              let r = toR + dr;
              while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
                const sq = String.fromCharCode(97 + f) + r;
                const occ = testGame.get(sq);
                if (!occ) {
                  f += df;
                  r += dr;
                  continue;
                }
                if (occ.color === enemyColor) {
                  createsPressure = true;
                }
                break;
              }
              if (createsPressure) break;
            }

            if (!createsPressure) return;

            results.push(move.from, move.to);
          });
        } catch (e) {
          return [];
        }

        return results;
      };
      addAll(ownSet, getRookPenetrationSquares(ownPieceSquares, turn, opponent));
      addAll(enemySet, getRookPenetrationSquares(enemyPieceSquares, opponent, turn));
    }

    // Development / initiative: Knight on rim — edge knight with concretely limited legal mobility.
    if (activeVisualMotifs.has('Knight on rim')) {
      const getKnightOnRimSquares = (pieces, color) => {
        const results = [];
        const knights = pieces.filter((p) => p.piece.type === 'n');
        if (!knights.length) return results;

        const fenParts = tempGame.fen().split(' ');
        fenParts[1] = color;

        try {
          const sideGame = new Chess(fenParts.join(' '));
          knights.forEach(({ square }) => {
            const file = square.charCodeAt(0) - 97;
            if (file !== 0 && file !== 7) return;

            const legalKnightMoves = sideGame
              .moves({ verbose: true })
              .filter((move) => move.piece === 'n' && move.from === square);

            const mobility = legalKnightMoves.length;
            const centralReach = legalKnightMoves.filter((move) => {
              const f = move.to.charCodeAt(0) - 97;
              const r = Number(move.to[1]);
              return f >= 2 && f <= 5 && r >= 3 && r <= 6;
            }).length;

            // Mark only when the rim knight is genuinely constrained.
            if (mobility <= 3 || centralReach === 0) {
              results.push(square, ...legalKnightMoves.slice(0, 2).map((move) => move.to));
            }
          });
        } catch (e) {
          return [];
        }

        return results;
      };

      addAll(ownSet, getKnightOnRimSquares(ownPieceSquares, turn));
      addAll(enemySet, getKnightOnRimSquares(enemyPieceSquares, opponent));
    }

    // Development / initiative: Bishop blocked by own pawns — own pawn chain restricts bishop mobility.
    if (activeVisualMotifs.has('Bishop blocked by own pawns')) {
      const getBlockedBishopSquares = (pieces, color) => {
        const results = [];
        const bishops = pieces.filter((p) => p.piece.type === 'b');
        if (!bishops.length) return results;

        const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

        bishops.forEach(({ square }) => {
          const file = square.charCodeAt(0) - 97;
          const rank = Number(square[1]);
          let mobility = 0;
          const ownPawnBlockers = [];

          dirs.forEach(([df, dr]) => {
            let f = file + df;
            let r = rank + dr;
            while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
              const sq = String.fromCharCode(97 + f) + r;
              const occ = tempGame.get(sq);
              if (!occ) {
                mobility += 1;
                f += df;
                r += dr;
                continue;
              }
              if (occ.color === color && occ.type === 'p') {
                ownPawnBlockers.push(sq);
              }
              break;
            }
          });

          const forwardDirs = color === 'w' ? [[-1, 1], [1, 1]] : [[-1, -1], [1, -1]];
          const immediateForwardPawnBlocks = forwardDirs.filter(([df, dr]) => {
            const f = file + df;
            const r = rank + dr;
            if (f < 0 || f > 7 || r < 1 || r > 8) return false;
            const sq = String.fromCharCode(97 + f) + r;
            const occ = tempGame.get(sq);
            return Boolean(occ && occ.color === color && occ.type === 'p');
          });

          // Strong blocked-bishop signal: low mobility and pawn-chain blockers in key diagonals.
          if (mobility <= 4 && ownPawnBlockers.length >= 2 && immediateForwardPawnBlocks.length >= 1) {
            results.push(square, ...ownPawnBlockers.slice(0, 2));
          }
        });

        return results;
      };

      addAll(ownSet, getBlockedBishopSquares(ownPieceSquares, turn));
      addAll(enemySet, getBlockedBishopSquares(enemyPieceSquares, opponent));
    }

    // Piece-placement: Outpost square available — enemy-territory square immune to pawn attack with occupation potential.
    if (activeVisualMotifs.has('Outpost square available')) {
      const getOutpostSquares = (pieces, color, enemyColor, enemyPieces) => {
        const results = [];
        const dir = color === 'w' ? 1 : -1;
        const startRank = color === 'w' ? 5 : 4;
        const endRank = color === 'w' ? 8 : 1;

        // Enemy pawn control squares: squares that enemy pawns attack
        const enemyPawnControls = new Set();
        enemyPieces.forEach(({ square, piece }) => {
          if (piece.type !== 'p') return;
          const file = square.charCodeAt(0) - 97;
          const rank = Number(square[1]);
          const pawnDir = enemyColor === 'w' ? 1 : -1;
          for (const df of [-1, 1]) {
            const cf = file + df;
            const cr = rank + pawnDir;
            if (cf < 0 || cf > 7 || cr < 1 || cr > 8) continue;
            enemyPawnControls.add(String.fromCharCode(97 + cf) + cr);
          }
        });

        // Scan for outpost squares: advanced, immune to pawns, can be occupied
        for (let rank = startRank; rank !== endRank + dir; rank += dir) {
          for (let file = 0; file < 8; file += 1) {
            const sq = String.fromCharCode(97 + file) + rank;

            // Skip if controlled by enemy pawn
            if (enemyPawnControls.has(sq)) continue;

            // Skip if occupied
            if (tempGame.get(sq)) continue;

            // Skip if friendly piece can't realistically occupy it
            const canOccupy = pieces.some((p) => {
              const pf = p.square.charCodeAt(0) - 97;
              const pr = Number(p.square[1]);
              if (p.piece.type === 'n') {
                // Knight can reach in principle
                const df = Math.abs(pf - file);
                const dr = Math.abs(pr - rank);
                return (df === 2 && dr === 1) || (df === 1 && dr === 2);
              }
              if (p.piece.type === 'b') {
                // Bishop on same color
                const sameColor = (pf + pr) % 2 === (file + rank) % 2;
                return sameColor;
              }
              if (p.piece.type === 'r' || p.piece.type === 'q') {
                // Rook/Queen can potentially reach
                return pf === file || pr === rank;
              }
              return false;
            });

            if (!canOccupy) continue;

            // Require it's truly a strong outpost: enemy pressure on it (makes occupation valuable).
            const enemyAttackers = tempGame.attackers(sq, enemyColor);
            const friendlyAttackers = tempGame.attackers(sq, color);
            if (enemyAttackers.length === 0) continue;
            if (friendlyAttackers.length < 1) continue;

            results.push(sq, ...friendlyAttackers.slice(0, 2));
          }
        }
        return results;
      };
      addAll(ownSet, getOutpostSquares(ownPieceSquares, turn, opponent, enemyPieceSquares));
      addAll(enemySet, getOutpostSquares(enemyPieceSquares, opponent, turn, ownPieceSquares));
    }

    // Pawn-structure: Promotion square weakly defended — target promotion rank square with inadequate defender coverage.
    if (activeVisualMotifs.has('Promotion square weakly defended')) {
      const getWeakPromotionSquares = (pieces, color, enemyColor, enemyPieces) => {
        const results = [];
        const promoteRank = color === 'w' ? 8 : 1;
        const advanceDir = color === 'w' ? 1 : -1;

        // Find friendly pawns that can push toward promotion
        const advancingPawns = pieces.filter((p) => {
          if (p.piece.type !== 'p') return false;
          const rank = Number(p.square[1]);
          if (color === 'w' && rank < 5) return false;
          if (color === 'b' && rank > 4) return false;
          return true;
        });

        if (!advancingPawns.length) return results;

        // For each promotion-rank square adjacent to advancing pawns
        const allPawnFiles = advancingPawns.map((p) => p.square.charCodeAt(0) - 97);
        const promotionCandidates = new Set();
        allPawnFiles.forEach((f) => {
          for (const df of [-1, 0, 1]) {
            const cf = f + df;
            if (cf < 0 || cf > 7) continue;
            const sq = String.fromCharCode(97 + cf) + promoteRank;
            promotionCandidates.add(sq);
          }
        });

        for (const sq of promotionCandidates) {
          // Skip if occupied by own piece
          const occ = tempGame.get(sq);
          if (occ && occ.color === color) continue;

          // Evaluate defense weakness
          const defenders = tempGame.attackers(sq, color).filter((attSq) => {
            const att = tempGame.get(attSq);
            // Exclude pawns as defenders on promotion rank (they're captured)
            return att.type !== 'p';
          });
          const attackers = tempGame.attackers(sq, enemyColor);

          // Weak if: significantly outnumbered or very few defenders and enemy pressure
          const isWeak =
            (defenders.length === 0 && attackers.length > 0) ||
            (defenders.length <= 1 && attackers.length >= 2);

          if (!isWeak) continue;

          results.push(sq, ...defenders.slice(0, 1), ...attackers.slice(0, 2));
        }
        return results;
      };
      addAll(ownSet, getWeakPromotionSquares(ownPieceSquares, turn, opponent, enemyPieceSquares));
      addAll(enemySet, getWeakPromotionSquares(enemyPieceSquares, opponent, turn, ownPieceSquares));
    }

    // Tactical: Pinned piece — piece that cannot move without exposing the king to check from an attacking line.
    if (activeVisualMotifs.has('Pinned piece')) {
      const getPinnedPieces = (pieces, color, enemyColor) => {
        const results = [];
        const king = pieces.find((p) => p.piece.type === 'k');
        if (!king) return results;

        // For each friendly piece, check if it's pinned
        for (const { square, piece } of pieces) {
          if (piece.type === 'k') continue;

          // Try removing the piece to see if king becomes attacked
          try {
            const testFen = tempGame.fen();
            const testGame = new Chess(testFen);
            testGame.remove(square);

            // Check if king is now attacked without this piece
            if (testGame.isAttacked(king.square, enemyColor)) {
              // Now verify it's a true pin: the attacking piece is behind it on a line
              const pinnerSquares = testGame.attackers(king.square, enemyColor);
              let hasPinner = false;

              for (const pinnerSq of pinnerSquares) {
                const pinner = testGame.get(pinnerSq);
                if (!pinner || !['r', 'b', 'q'].includes(pinner.type)) continue;

                // Check if the piece is actually blocking the pin
                const pf = pinnerSq.charCodeAt(0) - 97;
                const pr = Number(pinnerSq[1]);
                const sf = square.charCodeAt(0) - 97;
                const sr = Number(square[1]);
                const kf = king.square.charCodeAt(0) - 97;
                const kr = Number(king.square[1]);

                // Must be on same rank/file/diagonal
                if (pf === sf && sf === kf) {
                  hasPinner = true;
                  break;
                }
                if (pr === sr && sr === kr) {
                  hasPinner = true;
                  break;
                }
                if (Math.abs(pf - sf) === Math.abs(pr - sr) && Math.abs(sf - kf) === Math.abs(sr - kr)) {
                  const dfp = pf > sf ? 1 : pf < sf ? -1 : 0;
                  const drp = pr > sr ? 1 : pr < sr ? -1 : 0;
                  const dfs = sf > kf ? 1 : sf < kf ? -1 : 0;
                  const drs = sr > kr ? 1 : sr < kr ? -1 : 0;
                  if (dfp === dfs && drp === drs) {
                    hasPinner = true;
                    break;
                  }
                }
              }

              if (hasPinner) {
                results.push(square, king.square);
              }
            }
          } catch (e) {
            // Ignore errors in test positions
          }
        }
        return results;
      };
      addAll(ownSet, getPinnedPieces(ownPieceSquares, turn, opponent));
      addAll(enemySet, getPinnedPieces(enemyPieceSquares, opponent, turn));
    }

    // Tactical: Overloaded defender — piece defending multiple targets; removal would cause multiple hangs.
    if (activeVisualMotifs.has('Overloaded defender')) {
      const pieceValue = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

      const getOverloadedDefenders = (pieces, enemyPieces, color, enemyColor) => {
        const results = [];

        // For each friendly piece, check what it's defending
        for (const { square: defenderSq, piece: defender } of pieces) {
          if (defender.type === 'k') continue;

          const defendedTargets = [];
          const defenderValue = pieceValue[defender.type] || 0;

          // Find all pieces this defender is protecting
          for (const { square: targetSq, piece: target } of pieces) {
            if (targetSq === defenderSq) continue;
            if (target.type === 'k') continue;

            // Is this piece defending the target?
            const targetAttackers = tempGame.attackers(targetSq, color);
            if (!targetAttackers.includes(defenderSq)) continue;

            const targetValue = pieceValue[target.type] || 0;
            defendedTargets.push({ square: targetSq, value: targetValue, type: target.type });
          }

          // Require at least 2 defended targets
          if (defendedTargets.length < 2) continue;

          // Require at least one of them is valuable (worth more than a pawn or equal to the defender)
          const hasValuableTarget = defendedTargets.some((t) => t.value >= 3 || t.value >= defenderValue);
          if (!hasValuableTarget) continue;

          // Verify that removing the defender would create hangs
          let hangsAfterCapture = 0;
          for (const { square: targetSq } of defendedTargets) {
            const remainingDefenders = tempGame.attackers(targetSq, color).filter((sq) => sq !== defenderSq);
            const attackers = tempGame.attackers(targetSq, enemyColor);
            if (remainingDefenders.length < attackers.length) {
              hangsAfterCapture += 1;
            }
          }

          if (hangsAfterCapture >= 2) {
            results.push(defenderSq, ...defendedTargets.slice(0, 3).map((t) => t.square));
          }
        }
        return results;
      };
      addAll(ownSet, getOverloadedDefenders(ownPieceSquares, enemyPieceSquares, turn, opponent));
      addAll(enemySet, getOverloadedDefenders(enemyPieceSquares, ownPieceSquares, opponent, turn));
    }

    // Tactical: Trapped piece — piece with minimal/no legal moves in a restricted tactical position.
    if (activeVisualMotifs.has('Trapped piece')) {
      const getTrappedPieces = (pieces, color, enemyColor) => {
        const results = [];

        const fenParts = tempGame.fen().split(' ');
        fenParts[1] = color;

        try {
          const sideGame = new Chess(fenParts.join(' '));

          for (const { square, piece } of pieces) {
            if (piece.type === 'k' || piece.type === 'p') continue;

            const pieceMoves = sideGame.moves({ verbose: true }).filter((m) => m.from === square);
            if (pieceMoves.length > 1) continue;

            // Require the piece is under attack or has genuinely restricted mobility
            const attackers = tempGame.attackers(square, enemyColor);
            if (attackers.length === 0) continue;

            // Verify it's truly trapped: no good escape squares or would move into danger
            let hasEscapeSquare = false;
            for (const move of pieceMoves) {
              try {
                const testGame = new Chess(sideGame.fen());
                testGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
                const friendlyAttackers = testGame.attackers(move.to, color);
                const enemyAttackers = testGame.attackers(move.to, enemyColor);
                if (friendlyAttackers.length >= enemyAttackers.length) {
                  hasEscapeSquare = true;
                }
              } catch (e) {
                // Ignore
              }
            }

            if (!hasEscapeSquare) {
              results.push(square, ...attackers.slice(0, 2));
            }
          }
        } catch (e) {
          return [];
        }

        return results;
      };
      addAll(ownSet, getTrappedPieces(ownPieceSquares, turn, opponent));
      addAll(enemySet, getTrappedPieces(enemyPieceSquares, opponent, turn));
    }

    // Tactical: Mate-in-1 threat available — friendly move delivers immediate checkmate.
    if (activeVisualMotifs.has('Mate-in-1 threat available')) {
      const getMate1Squares = (color) => {
        const results = [];

        const fenParts = tempGame.fen().split(' ');
        fenParts[1] = color;

        try {
          const sideGame = new Chess(fenParts.join(' '));
          const allMoves = sideGame.moves({ verbose: true });

          for (const move of allMoves) {
            try {
              const testGame = new Chess(sideGame.fen());
              testGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });

              if (testGame.isCheckmate()) {
                results.push(move.from, move.to);
              }
            } catch (e) {
              // Ignore
            }
          }
        } catch (e) {
          return [];
        }

        return results;
      };
      addAll(ownSet, getMate1Squares(turn));
      addAll(enemySet, getMate1Squares(opponent));
    }

    return {
      highlightedSquares: Array.from(ownSet.values()),
      enemyHighlightedSquares: Array.from(enemySet.values()),
      motifArrows: Array.from(motifArrowMap.values())
    };
  }, [game, activeVisualMotifs, showVisualMotifButton]);

  useEffect(() => {
    if (!pendingOverlayAdvanceRef.current) return;

    const hasVisibleDots = (highlightedSquares.length + enemyHighlightedSquares.length + motifArrows.length) > 0;
    if (hasVisibleDots) {
      pendingOverlayAdvanceRef.current = null;
      return;
    }

    const advanceState = pendingOverlayAdvanceRef.current;
    if (advanceState.attempts >= advanceState.maxAttempts) {
      pendingOverlayAdvanceRef.current = null;
      return;
    }

    const currentIndex = selectedVisualMotif ? VISUAL_MOTIFS.indexOf(selectedVisualMotif) : -1;
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % VISUAL_MOTIFS.length;
    advanceState.attempts += 1;
    onSelectVisualMotif(VISUAL_MOTIFS[nextIndex]);
  }, [enemyHighlightedSquares.length, highlightedSquares.length, motifArrows.length, onSelectVisualMotif, selectedVisualMotif]);

  const boardArrows = React.useMemo(
    () => [...customArrows, ...motifArrows],
    [customArrows, motifArrows]
  );

  return (
    <div className="flex min-h-screen flex-col max-w-md mx-auto bg-slate-900">
      {/* Battle Scene */}
      {battle && (
        <div className="bg-slate-900 pt-2">
          <BattleScene
            playerHp={battle.playerHp}
            enemyHp={multiplayer?.isInRoom ? multiplayer.room.enemyHp : battle.enemyHp}
            maxHp={multiplayer?.isInRoom ? multiplayer.room.enemyMaxHp : battle.maxHp}
            playerHit={battle.playerHit}
            enemyHit={multiplayer?.isInRoom ? multiplayer.enemyHit : battle.enemyHit}
            playerAttacking={battle.playerAttacking}
            allies={multiplayer?.isInRoom ? multiplayer.room.players : null}
            localPlayerId={multiplayer?.playerId}
            activeAttackPlayerId={multiplayer?.activeAttackPlayerId}
            roomStatus={multiplayer?.room?.status}
            localPlayerName={multiplayer?.localPlayerName}
          />
        </div>
      )}

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
        <div ref={boardShellRef} className={`w-full aspect-square max-w-[420px] shadow-2xl rounded-lg overflow-hidden border-4 relative bg-[#302e2c] ${
          isPlayersTurn ? 'border-emerald-400/55 ring-2 ring-emerald-300/15' : 'border-slate-700'
        }`}>
          <ChessgroundBoard
            fen={game.fen()}
            orientation={orientation}
            onMove={onDrop}
            onInteraction={handleBoardInteraction}
            width="100%"
            height="100%"
            customArrows={boardArrows}
            movableColor={orientation}
            highlights={highlightedSquares}
            enemyHighlights={enemyHighlightedSquares}
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
            {isCompleted && (
              <div
                data-testid="completion-record"
                className="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                title="Completed"
                aria-label="Completed"
              >
                ✓
              </div>
            )}
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
                    {index < total - 1 ? 'Next' : 'Home'} in {autoAdvanceCountdown}...
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

          {showVisualMotifButton && (
            <div className="rounded-2xl border border-slate-700 bg-slate-800/80 p-3 space-y-1.5">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-slate-400">Opportunity Overlay</div>
                <button
                  type="button"
                  data-testid="visual-motif-next"
                  onClick={handleAdvanceOverlay}
                  aria-label="Next opportunity overlay"
                  title="Next opportunity overlay"
                  className="rounded-md border border-slate-600 bg-slate-700/80 p-1 text-slate-200 transition-colors hover:bg-slate-600/80 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  data-testid="visual-motif-dropdown"
                  value={selectedVisualMotif}
                  onChange={(event) => onSelectVisualMotif(event.target.value)}
                  className="flex-1 rounded-md border border-slate-600 bg-slate-800 px-2.5 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="">None</option>
                  {VISUAL_MOTIFS.map((motif) => (
                    <option key={`dropdown-${motif}`} value={motif}>{motif}</option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="visual-motif-dropdown-definition"
                  disabled={!selectedVisualMotif}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!selectedVisualMotif) return;
                    openMotifDefinition(selectedVisualMotif);
                  }}
                  aria-label={selectedVisualMotif ? `Open definition for ${selectedVisualMotif}` : 'Select a motif first'}
                  className="h-4 w-4 shrink-0 rounded-full bg-sky-500 text-white text-[10px] font-bold leading-none shadow-sm transition-colors hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  i
                </button>
              </div>
            </div>
          )}

          {visibleCurrentMoveHints.map((hint, i) => {
            const hintFeedbackKey = makeHintFeedbackKey({
              category,
              puzzleUrl: puzzle?.url,
              answerMoveIndex: hintAnswerMoveIndex,
              hintIndex: i
            });
            const selectedHintFeedbackTags = new Set(feedbackData?.hints?.[hintFeedbackKey]?.tags || []);

            return (
              <div key={`${currentPlayerMoveNumber}-${i}`} className="flex flex-col gap-2">
                <div className="relative p-3 pr-11 bg-slate-700/50 rounded-lg text-sm text-slate-200 border-l-4 border-yellow-500">
                  <button
                    type="button"
                    data-testid="hint-feedback-options-button"
                    aria-label="Hint feedback options"
                    aria-haspopup="menu"
                    aria-expanded={openHintFeedbackKey === hintFeedbackKey}
                    title="Hint feedback"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenHintFeedbackKey((current) => (
                        current === hintFeedbackKey ? null : hintFeedbackKey
                      ));
                    }}
                    className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-600/70 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  <span className="font-bold text-yellow-500 mr-2">
                    {structuredMoveHints ? `Move ${currentPlayerMoveNumber} Hint ${i + 1}:` : `Hint ${i + 1}:`}
                  </span>
                  <HintWithDictionary
                    hint={hint}
                    dictionaryLookup={dictionaryLookup}
                    onWordTap={(entry) => openDictionaryEntry(entry, entry?.name)}
                  />

                  {openHintFeedbackKey === hintFeedbackKey && (
                    <div
                      role="menu"
                      data-testid="hint-feedback-menu"
                      className="absolute right-1.5 bottom-10 z-20 max-h-[calc(100dvh-6rem)] w-44 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 p-1 shadow-2xl"
                    >
                      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Feedback
                      </div>
                      <div className="space-y-1">
                        {HINT_FEEDBACK_TAGS.map((tag) => {
                          const isSelected = selectedHintFeedbackTags.has(tag);

                          return (
                            <button
                              key={tag}
                              type="button"
                              role="menuitem"
                              data-testid="hint-feedback-tag"
                              aria-pressed={isSelected}
                              onClick={() => onToggleHintFeedbackTag({
                                category,
                                puzzleUrl: puzzle?.url,
                                puzzleAnswer: puzzle?.answer,
                                answerMoveIndex: hintAnswerMoveIndex,
                                moveNumber: currentPlayerMoveNumber,
                                hintIndex: i,
                                hintText: hint,
                                tag
                              })}
                              className={`w-full rounded-md px-3 py-2 text-left text-xs font-semibold transition-colors ${
                                isSelected
                                  ? 'bg-yellow-500/20 text-yellow-200'
                                  : 'text-slate-200 hover:bg-slate-800'
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!isPuzzleSolvedState && !isFailed && (
            <button
              onClick={() => onShowHint({ answerMoveIndex: hintAnswerMoveIndex })}
              className="w-full py-3 px-4 bg-yellow-600/20 text-yellow-400 rounded-lg hover:bg-yellow-600/30 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <HelpCircle className="w-5 h-5" />
              {currentMoveHintsRevealed < currentMoveHints.length
                ? `Reveal Hint${structuredMoveHints && playerMoveCount > 1 ? ` for Move ${currentPlayerMoveNumber}` : ''}`
                : "Show Answer (Give Up)"}
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

      {confettiBurst && (
        <div
          data-testid="win-confetti-burst"
          className="win-confetti-burst"
          style={{
            '--confetti-origin-x': `${confettiBurst.x}px`,
            '--confetti-origin-y': `${confettiBurst.y}px`
          }}
        >
          <div className="win-confetti-core" />
          {WIN_CONFETTI_PARTICLES.map((particle, particleIndex) => (
            <span
              key={`${confettiBurst.id}-${particleIndex}`}
              className="win-confetti-piece"
              style={{
                '--confetti-dx': `${particle.dx}px`,
                '--confetti-dy': `${particle.dy}px`,
                '--confetti-rotation': particle.rotation,
                '--confetti-delay': particle.delay,
                '--confetti-color': particle.color
              }}
            />
          ))}
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
    hintRevealCountsByMove,
    isSolved,
    isFailed,
    solvedPuzzles,
    isCurrentPuzzleCompleted,
    currentPuzzleCompletedAt,
    selectCategory,
    nextPuzzle,
    prevPuzzle,
    showNextHint,
    markSolved,
    resetAllProgress
  } = usePuzzleGame();

  const [dictionaryData, setDictionaryData] = useState({ entries: [] });
  const [categoryFeedback, setCategoryFeedback] = useState(readStoredCategoryFeedback);
  const [homeView, setHomeView] = useState('categories');
  const [homeTab, setHomeTab] = useState('single');
  const [selectedCategoryType, setSelectedCategoryType] = useState('All');
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [activeVisualMotifs, setActiveVisualMotifs] = useState(new Set());
  const [showVisualMotifButton, setShowVisualMotifButton] = useState(false);
  const battle = useBattleState();
  const multiplayer = useRoomMultiplayer();
  const multiplayerStartedRoomRef = useRef(null);
  const autoJoinRoomRef = useRef(null);

  const categoryStats = React.useMemo(
    () => buildCategoryStats(puzzlesData, solvedPuzzles),
    [puzzlesData, solvedPuzzles]
  );

  const visibleHomeCategories = React.useMemo(
    () => getVisibleHomeCategories(categoryStats.sortedCategories, categoryFeedback),
    [categoryFeedback, categoryStats.sortedCategories]
  );

  const handleToggleCategoryGarbage = React.useCallback((category) => {
    const markedAt = new Date().toISOString();

    setCategoryFeedback((previousFeedback) => {
      const normalizedFeedback = normalizeCategoryFeedback(previousFeedback);
      const existingEntry = normalizedFeedback.categories[category] || {};
      const isGarbage = !existingEntry.garbage;

      return {
        ...normalizedFeedback,
        updatedAt: markedAt,
        categories: {
          ...normalizedFeedback.categories,
          [category]: {
            ...existingEntry,
            category,
            label: formatCategoryLabel(category),
            type: categoryStats.categoryTypeMap[category] || null,
            puzzleCount: categoryStats.totalCounts[category] || 0,
            garbage: isGarbage,
            updatedAt: markedAt,
            events: [
              ...(Array.isArray(existingEntry.events) ? existingEntry.events : []),
              {
                type: isGarbage ? 'marked_garbage' : 'unmarked_garbage',
                createdAt: markedAt
              }
            ]
          }
        }
      };
    });
  }, [categoryStats.categoryTypeMap, categoryStats.totalCounts]);

  const handleToggleHintFeedbackTag = React.useCallback(({
    category,
    puzzleUrl,
    puzzleAnswer,
    answerMoveIndex,
    moveNumber,
    hintIndex,
    hintText,
    tag
  }) => {
    if (!HINT_FEEDBACK_TAGS.includes(tag)) {
      return;
    }

    const updatedAt = new Date().toISOString();
    const hintFeedbackKey = makeHintFeedbackKey({
      category,
      puzzleUrl,
      answerMoveIndex,
      hintIndex
    });

    setCategoryFeedback((previousFeedback) => {
      const normalizedFeedback = normalizeCategoryFeedback(previousFeedback);
      const existingEntry = normalizedFeedback.hints[hintFeedbackKey] || {};
      const existingTags = Array.isArray(existingEntry.tags) ? existingEntry.tags : [];
      const nextTagSet = new Set(existingTags);
      const isAdding = !nextTagSet.has(tag);

      if (isAdding) {
        nextTagSet.add(tag);
      } else {
        nextTagSet.delete(tag);
      }

      const nextTags = HINT_FEEDBACK_TAGS.filter((feedbackTag) => nextTagSet.has(feedbackTag));

      return {
        ...normalizedFeedback,
        updatedAt,
        hints: {
          ...normalizedFeedback.hints,
          [hintFeedbackKey]: {
            ...existingEntry,
            category,
            categoryLabel: formatCategoryLabel(category),
            puzzleUrl,
            puzzleAnswer,
            answerMoveIndex,
            moveNumber,
            hintIndex,
            hintNumber: hintIndex + 1,
            hintText,
            tags: nextTags,
            updatedAt,
            events: [
              ...(Array.isArray(existingEntry.events) ? existingEntry.events : []),
              {
                type: isAdding ? 'tag_added' : 'tag_removed',
                tag,
                createdAt: updatedAt
              }
            ]
          }
        }
      };
    });
  }, []);

  const handleDownloadFeedback = React.useCallback(() => {
    const normalizedFeedback = normalizeCategoryFeedback(categoryFeedback);

    downloadJsonFile(CATEGORY_FEEDBACK_FILE_NAME, {
      ...normalizedFeedback,
      exportedAt: new Date().toISOString(),
      source: {
        app: 'chess-puzzles-pickles',
        href: window.location.href,
        userAgent: navigator.userAgent
      }
    });
  }, [categoryFeedback]);

  const connectedRoomPlayerCount = React.useMemo(
    () => (multiplayer.room?.players || []).filter((player) => player.connected).length,
    [multiplayer.room?.players]
  );

  const startRandomPuzzleFromCategories = React.useCallback((categories) => {
    const selectableCategories = categories.filter((cat) => (categoryStats.totalCounts[cat] || 0) > 0);

    if (!selectableCategories.length) {
      return false;
    }

    const randomCategory = selectableCategories[Math.floor(Math.random() * selectableCategories.length)];
    const puzzleCount = categoryStats.totalCounts[randomCategory] || 0;
    const randomIndex = puzzleCount > 1 ? Math.floor(Math.random() * puzzleCount) : 0;

    setHomeView('categories');
    setIsRandomMode(true);
    setShowVisualMotifButton(true);
    setActiveVisualMotifs(new Set());
    battle.reset();
    selectCategory(randomCategory, randomIndex);
    return true;
  }, [battle, categoryStats.totalCounts, selectCategory]);

  useEffect(() => {
    fetch('/dictionary.json')
      .then((response) => response.json())
      .then((data) => setDictionaryData(data))
      .catch((error) => {
        console.error('Failed to load dictionary', error);
        setDictionaryData({ entries: [] });
      });
  }, []);

  useEffect(() => {
    writeStoredCategoryFeedback(categoryFeedback);
  }, [categoryFeedback]);

  // Expose for the internal components to access if needed (hacky but works for the settings menu)
  window.resetProgress = resetAllProgress;

  useEffect(() => {
    if (!puzzlesData || multiplayer.isInRoom || autoJoinRoomRef.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const roomCode = normalizeRoomCode(params.get('room'));
    if (!roomCode) {
      return;
    }

    setHomeTab('multiplayer');
    autoJoinRoomRef.current = roomCode;
    multiplayer.joinRoom(roomCode).catch((error) => {
      console.error('Failed to join room from link', error);
    });
  }, [multiplayer, puzzlesData]);

  useEffect(() => {
    if (!puzzlesData || !multiplayer.room?.code) {
      multiplayerStartedRoomRef.current = null;
      return;
    }

    setHomeTab('multiplayer');

    if (connectedRoomPlayerCount < 2) {
      return;
    }

    if (multiplayerStartedRoomRef.current === multiplayer.room.code) {
      return;
    }

    multiplayerStartedRoomRef.current = multiplayer.room.code;
    startRandomPuzzleFromCategories(visibleHomeCategories);
  }, [
    connectedRoomPlayerCount,
    multiplayer.room?.code,
    puzzlesData,
    startRandomPuzzleFromCategories,
    visibleHomeCategories
  ]);

  const handleHostRoom = React.useCallback(() => {
    setHomeTab('multiplayer');
    multiplayer.hostRoom().catch((error) => {
      console.error('Failed to host room', error);
    });
  }, [multiplayer]);

  const handleJoinRoom = React.useCallback((roomCode) => {
    setHomeTab('multiplayer');
    multiplayer.joinRoom(roomCode).catch((error) => {
      console.error('Failed to join room', error);
    });
  }, [multiplayer]);

  const handleLeaveRoom = React.useCallback(() => {
    multiplayer.leaveRoom();
    multiplayerStartedRoomRef.current = null;
    autoJoinRoomRef.current = null;
    setHomeTab('single');

    const params = new URLSearchParams(window.location.search);
    if (params.has('room')) {
      params.delete('room');
      const nextSearch = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);
    }
  }, [multiplayer]);

  const initialFen = React.useMemo(() => {
    if (!currentPuzzle) return null;
    return parsePuzzleUrl(currentPuzzle.url);
  }, [currentPuzzle]);

  const handleToggleVisualMotif = (motif) => setActiveVisualMotifs((prev) => {
    if (!motif) {
      return new Set();
    }
    if (prev.has(motif) && prev.size === 1) {
      return new Set();
    }
    return new Set([motif]);
  });

  const handleSelectVisualMotif = React.useCallback((motif) => {
    if (!motif) {
      setActiveVisualMotifs(new Set());
      return;
    }
    setActiveVisualMotifs(new Set([motif]));
  }, []);

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
    const { solvedCounts, totalCounts, categoryTypeMap } = categoryStats;
    const discoveredTypes = Array.from(new Set(
      visibleHomeCategories.map((category) => categoryTypeMap[category] || 'Tactics')
    ));
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
      All: visibleHomeCategories.length
    };

    visibleHomeCategories.forEach((category) => {
      const type = categoryTypeMap[category] || 'Tactics';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const visibleCategories = visibleHomeCategories.filter((category) => (
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
        setShowVisualMotifButton(false);
        battle.reset();
        selectCategory(category);
      }}
      onStartRandomMode={() => {
        startRandomPuzzleFromCategories(visibleCategories);
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
      multiplayer={multiplayer}
      onHostRoom={handleHostRoom}
      onJoinRoom={handleJoinRoom}
      onLeaveRoom={handleLeaveRoom}
      selectedHomeTab={homeTab}
      onSelectHomeTab={setHomeTab}
      categoryFeedback={categoryFeedback}
      onToggleCategoryGarbage={handleToggleCategoryGarbage}
      onDownloadFeedback={handleDownloadFeedback}
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
          setHomeTab(multiplayer.isInRoom ? 'multiplayer' : 'single');
          battle.reset();
          selectCategory(null);
        }}
        onNext={nextPuzzle}
        onPrev={prevPuzzle}
        onSolved={markSolved}
        onShowHint={showNextHint}
        hintsRevealed={hintsRevealed}
        hintRevealCountsByMove={hintRevealCountsByMove}
        isSolved={isSolved}
        isFailed={isFailed}
        dictionaryEntries={dictionaryData.entries || []}
        isRandomMode={isRandomMode}
        isCompleted={isCurrentPuzzleCompleted}
        completedAt={currentPuzzleCompletedAt}
        battle={battle}
        activeVisualMotifs={activeVisualMotifs}
        onToggleVisualMotif={handleToggleVisualMotif}
        onSelectVisualMotif={handleSelectVisualMotif}
        showVisualMotifButton={showVisualMotifButton}
        multiplayer={multiplayer}
        feedbackData={categoryFeedback}
        onToggleHintFeedbackTag={handleToggleHintFeedbackTag}
      />
    </ErrorBoundary>
  );
}

