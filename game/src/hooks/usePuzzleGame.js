import { useState, useEffect, useMemo } from 'react';
import { Chess } from 'chess.js';
import { getVersionedPublicAssetUrl, parsePuzzleUrl } from '../lib/utils';
import {
    getHintRevealCountForAnswerMove,
    getHintsForAnswerMove,
    getTotalHintRevealCount,
    hasStructuredMoveHints,
    revealNextHintForAnswerMove
} from '../lib/puzzleHints';

// Helper to load from local storage
const loadState = (key, defaultValue) => {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : defaultValue;
    } catch (e) {
        console.error("Failed to load state", e);
        return defaultValue;
    }
};

const normalizeCategoryKey = (category) => String(category || '').replace(/\/all$/i, '');
const PUZZLE_URL_REGEX = /^https?:\/\/lichess\.org\/analysis\//i;
const PROMOTION_SAN_REGEX = /=([QRBN])/i;

const parseAnswerMoves = (answer) => String(answer || '')
    .split(',')
    .map((move) => move.trim())
    .filter(Boolean);

const getPuzzleAnswer = (puzzleData) => {
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

const getPuzzleMeta = (url, data) => {
    if (typeof data === 'string') {
        return {
            url,
            answer: data,
            tags: [],
            hints: []
        };
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return {
            url,
            answer: '',
            tags: [],
            hints: []
        };
    }

    return {
        url,
        ...data
    };
};

const getCategoryPuzzleEntries = (categoryData) => (
    Object.entries(getCategoryPuzzlesMap(categoryData)).map(([url, data]) => getPuzzleMeta(url, data))
);

const isPuzzlePlayable = (url, puzzleData) => {
    const fen = parsePuzzleUrl(url);
    if (!fen) {
        return { playable: false, reason: 'invalid-fen' };
    }

    let replay;
    try {
        replay = new Chess(fen);
    } catch (error) {
        return { playable: false, reason: 'invalid-fen' };
    }

    const answerMoves = parseAnswerMoves(getPuzzleAnswer(puzzleData));
    if (!answerMoves.length) {
        return { playable: false, reason: 'invalid-answer' };
    }

    for (const san of answerMoves) {
        try {
            const move = replay.move(san);
            if (!move) {
                return { playable: false, reason: 'invalid-answer' };
            }
        } catch (error) {
            return { playable: false, reason: 'invalid-answer' };
        }
    }

    return { playable: true, reason: null };
};

const isPuzzleReadyForPlayer = (url, puzzleData) => {
    const fen = parsePuzzleUrl(url);
    if (!fen) {
        return false;
    }

    const answerMoves = parseAnswerMoves(getPuzzleAnswer(puzzleData));
    if (!answerMoves.length) {
        return false;
    }

    try {
        const game = new Chess(fen);
        if (!game.moves({ verbose: true }).length) {
            return false;
        }

        const expectedMoveSan = answerMoves[0];
        const sanProbe = new Chess(fen);
        const parsedMove = sanProbe.move(expectedMoveSan);
        if (!parsedMove) {
            return false;
        }

        const promotion = String(expectedMoveSan || '').match(PROMOTION_SAN_REGEX)?.[1]?.toLowerCase();
        const dropProbe = new Chess(fen);
        const playedMove = dropProbe.move({
            from: parsedMove.from,
            to: parsedMove.to,
            ...(promotion ? { promotion } : {})
        });

        return Boolean(playedMove);
    } catch (error) {
        return false;
    }
};

const normalizeSolvedPuzzles = (solvedPuzzles) => {
    if (!solvedPuzzles || typeof solvedPuzzles !== 'object' || Array.isArray(solvedPuzzles)) {
        return {};
    }

    const normalized = {};

    Object.entries(solvedPuzzles).forEach(([category, solvedUrls]) => {
        if (!Array.isArray(solvedUrls)) {
            return;
        }

        const normalizedCategory = normalizeCategoryKey(category);
        const existing = normalized[normalizedCategory] || [];
        normalized[normalizedCategory] = Array.from(new Set([...existing, ...solvedUrls]));
    });

    return normalized;
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

const normalizeCompletedPuzzleRecords = (records, legacySolvedPuzzles = {}) => {
    const normalized = {};

    if (records && typeof records === 'object' && !Array.isArray(records)) {
        Object.entries(records).forEach(([url, record]) => {
            if (!PUZZLE_URL_REGEX.test(url)) {
                return;
            }

            const completedAt =
                record && typeof record === 'object' && !Array.isArray(record) && typeof record.completedAt === 'string'
                    ? record.completedAt
                    : null;
            const category =
                record && typeof record === 'object' && !Array.isArray(record) && typeof record.category === 'string'
                    ? normalizeCategoryKey(record.category)
                    : null;

            normalized[url] = {
                category,
                completedAt
            };
        });
    }

    Object.entries(normalizeSolvedPuzzles(legacySolvedPuzzles)).forEach(([category, solvedUrls]) => {
        solvedUrls.forEach((url) => {
            if (!PUZZLE_URL_REGEX.test(url)) {
                return;
            }

            const existing = normalized[url];
            normalized[url] = {
                category: existing?.category || category,
                completedAt: existing?.completedAt || null
            };
        });
    });

    return normalized;
};

const getSolvedMapFromCompletionRecords = (records) => {
    if (!records || typeof records !== 'object' || Array.isArray(records)) {
        return {};
    }

    const solvedMap = {};

    Object.entries(records).forEach(([url, record]) => {
        if (!PUZZLE_URL_REGEX.test(url)) {
            return;
        }

        const category = normalizeCategoryKey(record?.category);
        if (!category) {
            return;
        }

        const existing = solvedMap[category] || [];
        if (!existing.includes(url)) {
            solvedMap[category] = [...existing, url];
        }
    });

    return solvedMap;
};

const findFirstMatchingIndex = (puzzles, matcher, startIndex = 0) => {
    if (!puzzles.length) {
        return 0;
    }

    const safeStartIndex = Number.isInteger(startIndex) && startIndex >= 0 ? startIndex : 0;

    for (let index = safeStartIndex; index < puzzles.length; index += 1) {
        if (matcher(puzzles[index], index)) {
            return index;
        }
    }

    for (let index = 0; index < safeStartIndex && index < puzzles.length; index += 1) {
        if (matcher(puzzles[index], index)) {
            return index;
        }
    }

    return -1;
};

const findPreferredStartIndex = (puzzles, solvedUrls = [], preferredIndex = null) => {
    if (!puzzles.length) {
        return 0;
    }

    const completed = new Set(solvedUrls);
    const hasPreferredIndex = Number.isInteger(preferredIndex) && preferredIndex >= 0;

    if (hasPreferredIndex && preferredIndex < puzzles.length && isPuzzleReadyForPlayer(puzzles[preferredIndex].url, puzzles[preferredIndex])) {
        return preferredIndex;
    }

    if (!hasPreferredIndex) {
        const nextUncompletedPlayable = findFirstMatchingIndex(
            puzzles,
            (puzzle) => !completed.has(puzzle.url) && isPuzzleReadyForPlayer(puzzle.url, puzzle)
        );

        if (nextUncompletedPlayable !== -1) {
            return nextUncompletedPlayable;
        }
    }

    const fallbackPlayable = findFirstMatchingIndex(
        puzzles,
        (puzzle) => isPuzzleReadyForPlayer(puzzle.url, puzzle),
        hasPreferredIndex ? preferredIndex : 0
    );

    if (fallbackPlayable !== -1) {
        return fallbackPlayable;
    }

    return hasPreferredIndex ? Math.min(preferredIndex, puzzles.length - 1) : 0;
};

const sanitizePuzzlesData = (rawData) => {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
        return { data: {}, stats: null };
    }

    const sanitized = {};
    const stats = {
        keptPuzzles: 0,
        removedInvalidFen: 0,
        removedInvalidAnswer: 0,
        removedCategories: 0
    };

    Object.entries(rawData).forEach(([category, categoryData]) => {
        const puzzleMap = getCategoryPuzzlesMap(categoryData);
        const filteredPuzzleMap = {};

        Object.entries(puzzleMap).forEach(([url, puzzleData]) => {
            if (!PUZZLE_URL_REGEX.test(url)) {
                return;
            }

            const { playable, reason } = isPuzzlePlayable(url, puzzleData);

            if (!playable) {
                if (reason === 'invalid-fen') {
                    stats.removedInvalidFen += 1;
                } else {
                    stats.removedInvalidAnswer += 1;
                }
                return;
            }

            filteredPuzzleMap[url] = puzzleData;
            stats.keptPuzzles += 1;
        });

        if (Object.keys(filteredPuzzleMap).length === 0) {
            stats.removedCategories += 1;
            return;
        }

        if (
            categoryData &&
            typeof categoryData === 'object' &&
            !Array.isArray(categoryData) &&
            categoryData.puzzles &&
            typeof categoryData.puzzles === 'object' &&
            !Array.isArray(categoryData.puzzles)
        ) {
            sanitized[category] = {
                ...categoryData,
                puzzles: filteredPuzzleMap
            };
            return;
        }

        if (
            categoryData &&
            typeof categoryData === 'object' &&
            !Array.isArray(categoryData) &&
            typeof categoryData.type === 'string'
        ) {
            sanitized[category] = {
                type: categoryData.type,
                puzzles: filteredPuzzleMap
            };
            return;
        }

        sanitized[category] = filteredPuzzleMap;
    });

    return { data: sanitized, stats };
};

export const usePuzzleGame = () => {
    const [puzzlesData, setPuzzlesData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Game State
    const [currentCategory, setCurrentCategory] = useState(null);
    const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
    const [hintRevealCountsByMove, setHintRevealCountsByMove] = useState({});
    const [isSolved, setIsSolved] = useState(false);
    const [isFailed, setIsFailed] = useState(false); // If user gave up

    // Persistent State
    const [completedPuzzleRecords, setCompletedPuzzleRecords] = useState(() => {
        const legacySolvedPuzzles = normalizeSolvedPuzzles(loadState('solvedPuzzles', {}));
        return normalizeCompletedPuzzleRecords(
            loadState('completedPuzzleRecords', {}),
            legacySolvedPuzzles
        );
    });

    const solvedPuzzles = useMemo(
        () => getSolvedMapFromCompletionRecords(completedPuzzleRecords),
        [completedPuzzleRecords]
    );

    useEffect(() => {
        fetch(getVersionedPublicAssetUrl('puzzles.json'))
            .then(res => res.json())
            .then(data => {
                const { data: sanitizedData, stats } = sanitizePuzzlesData(data);
                setPuzzlesData(sanitizedData);

                if (
                    stats &&
                    (stats.removedInvalidFen > 0 || stats.removedInvalidAnswer > 0 || stats.removedCategories > 0)
                ) {
                    console.warn(
                        `[puzzles] Filtered ${stats.removedInvalidFen + stats.removedInvalidAnswer} invalid puzzles ` +
                        `(${stats.removedInvalidFen} bad FEN, ${stats.removedInvalidAnswer} bad answer). ` +
                        `${stats.removedCategories} empty categories removed.`
                    );
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load puzzles", err);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        localStorage.setItem('completedPuzzleRecords', JSON.stringify(completedPuzzleRecords));
        localStorage.setItem('solvedPuzzles', JSON.stringify(solvedPuzzles));
    }, [completedPuzzleRecords, solvedPuzzles]);

    // Derived state
    const currentCategoryPuzzles = useMemo(() => {
        if (!puzzlesData || !currentCategory) return [];
        return getCategoryPuzzleEntries(puzzlesData[currentCategory]);
    }, [puzzlesData, currentCategory]);

    const currentPuzzle = currentCategoryPuzzles[currentPuzzleIndex];
    const currentPuzzleCompletion = currentPuzzle ? completedPuzzleRecords[currentPuzzle.url] || null : null;
    const hintsRevealed = useMemo(
        () => getTotalHintRevealCount(hintRevealCountsByMove),
        [hintRevealCountsByMove]
    );

    // Actions
    const selectCategory = (category, startIndex = null) => {
        if (!category) {
            setCurrentCategory(null);
            setCurrentPuzzleIndex(0);
            resetPuzzleState();
            return;
        }

        const categoryPuzzles = puzzlesData ? getCategoryPuzzleEntries(puzzlesData[category]) : [];
        const safeIndex = findPreferredStartIndex(
            categoryPuzzles,
            solvedPuzzles[category] || [],
            Number.isInteger(startIndex) && startIndex >= 0 ? startIndex : null
        );
        setCurrentCategory(category);
        setCurrentPuzzleIndex(safeIndex);
        resetPuzzleState();
    };

    const resetPuzzleState = () => {
        setHintRevealCountsByMove({});
        setIsSolved(false);
        setIsFailed(false);
    };

    const nextPuzzle = () => {
        if (currentPuzzleIndex < currentCategoryPuzzles.length - 1) {
            setCurrentPuzzleIndex(prev => prev + 1);
            resetPuzzleState();
        }
    };

    const prevPuzzle = () => {
        if (currentPuzzleIndex > 0) {
            setCurrentPuzzleIndex(prev => prev - 1);
            resetPuzzleState();
        }
    };

    useEffect(() => {
        if (currentCategoryPuzzles.length === 0) {
            return;
        }

        const isCurrentIndexInBounds =
            currentPuzzleIndex >= 0 &&
            currentPuzzleIndex < currentCategoryPuzzles.length;
        const currentPuzzleIsReady =
            isCurrentIndexInBounds &&
            isPuzzleReadyForPlayer(
                currentCategoryPuzzles[currentPuzzleIndex].url,
                currentCategoryPuzzles[currentPuzzleIndex]
            );

        if (!isCurrentIndexInBounds || !currentPuzzleIsReady) {
            const fallbackIndex = findPreferredStartIndex(
                currentCategoryPuzzles,
                solvedPuzzles[currentCategory] || [],
                currentPuzzleIndex
            );
            setCurrentPuzzleIndex(fallbackIndex);
            setHintRevealCountsByMove({});
            setIsSolved(false);
            setIsFailed(false);
        }
    }, [currentCategory, currentCategoryPuzzles, currentPuzzleIndex, solvedPuzzles]);

    const showNextHint = (options = {}) => {
        if (!currentPuzzle) {
            return;
        }

        const requestedAnswerMoveIndex =
            typeof options === 'number'
                ? options
                : Number.isInteger(options?.answerMoveIndex)
                    ? options.answerMoveIndex
                    : 0;
        const answerMoveIndex = hasStructuredMoveHints(currentPuzzle) ? requestedAnswerMoveIndex : 0;
        const currentHints = getHintsForAnswerMove(currentPuzzle, answerMoveIndex);
        const revealedForMove = getHintRevealCountForAnswerMove(hintRevealCountsByMove, answerMoveIndex);

        if (revealedForMove < currentHints.length) {
            setHintRevealCountsByMove((prev) => revealNextHintForAnswerMove(prev, currentPuzzle, answerMoveIndex));
        } else {
            setIsFailed(true);
        }
    };

    const markSolved = () => {
        if (!isFailed && !isSolved) {
            setIsSolved(true);
            setCompletedPuzzleRecords((prev) => {
                if (!currentPuzzle?.url) {
                    return prev;
                }

                const existing = prev[currentPuzzle.url];
                if (existing?.category === currentCategory && existing?.completedAt) {
                    return prev;
                }

                return {
                    ...prev,
                    [currentPuzzle.url]: {
                        category: currentCategory,
                        completedAt: existing?.completedAt || new Date().toISOString()
                    }
                };
            });
        }
    };

    const resetAllProgress = () => {
        if (confirm("Are you sure you want to reset all progress?")) {
            setCompletedPuzzleRecords({});
            localStorage.removeItem('solvedPuzzles');
            localStorage.removeItem('completedPuzzleRecords');
            localStorage.removeItem('feedbackLogs');
            window.location.reload();
        }
    };

    return {
        puzzlesData,
        loading,
        currentCategory,
        currentPuzzle,
        currentPuzzleIndex,
        totalPuzzles: currentCategoryPuzzles.length,
        hintsRevealed,
        hintRevealCountsByMove,
        isSolved,
        isFailed,
        solvedPuzzles,
        completedPuzzleRecords,
        isCurrentPuzzleCompleted: Boolean(currentPuzzleCompletion),
        currentPuzzleCompletedAt: currentPuzzleCompletion?.completedAt || null,
        selectCategory,
        nextPuzzle,
        prevPuzzle,
        showNextHint,
        markSolved,
        resetAllProgress
    };
};
