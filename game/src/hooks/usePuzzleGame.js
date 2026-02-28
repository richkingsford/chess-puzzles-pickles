import { useState, useEffect, useMemo } from 'react';
import { Chess } from 'chess.js';
import { parsePuzzleUrl } from '../lib/utils';

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

const normalizeSolvedPuzzles = (solvedPuzzles) => {
    if (!solvedPuzzles || typeof solvedPuzzles !== 'object') {
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
    const [hintsRevealed, setHintsRevealed] = useState(0);
    const [isSolved, setIsSolved] = useState(false);
    const [isFailed, setIsFailed] = useState(false); // If user gave up

    // Persistent State
    const [solvedPuzzles, setSolvedPuzzles] = useState(() => normalizeSolvedPuzzles(loadState('solvedPuzzles', {}))); // { category: [puzzleUrl1, puzzleUrl2] }

    useEffect(() => {
        fetch('/puzzles.json')
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
        localStorage.setItem('solvedPuzzles', JSON.stringify(solvedPuzzles));
    }, [solvedPuzzles]);

    // Derived state
    const currentCategoryPuzzles = useMemo(() => {
        if (!puzzlesData || !currentCategory) return [];
        return Object.entries(getCategoryPuzzlesMap(puzzlesData[currentCategory])).map(([url, data]) => {
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
        });
    }, [puzzlesData, currentCategory]);

    const currentPuzzle = currentCategoryPuzzles[currentPuzzleIndex];

    // Actions
    const selectCategory = (category, startIndex = 0) => {
        const safeIndex = Number.isInteger(startIndex) && startIndex >= 0 ? startIndex : 0;
        setCurrentCategory(category);
        setCurrentPuzzleIndex(safeIndex);
        resetPuzzleState();
    };

    const resetPuzzleState = () => {
        setHintsRevealed(0);
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

        if (currentPuzzleIndex < 0 || currentPuzzleIndex >= currentCategoryPuzzles.length) {
            setCurrentPuzzleIndex(0);
            setHintsRevealed(0);
            setIsSolved(false);
            setIsFailed(false);
        }
    }, [currentCategoryPuzzles, currentPuzzleIndex]);

    const showNextHint = () => {
        if (currentPuzzle && hintsRevealed < currentPuzzle.hints.length) {
            setHintsRevealed(prev => prev + 1);
        } else if (currentPuzzle && hintsRevealed >= currentPuzzle.hints.length) {
            // Show answer (give up)
            setIsFailed(true);
        }
    };

    const markSolved = () => {
        if (!isFailed && !isSolved) {
            setIsSolved(true);
            setSolvedPuzzles(prev => {
                const categorySolved = prev[currentCategory] || [];
                if (!categorySolved.includes(currentPuzzle.url)) {
                    return {
                        ...prev,
                        [currentCategory]: [...categorySolved, currentPuzzle.url]
                    };
                }
                return prev;
            });
        }
    };

    const resetAllProgress = () => {
        if (confirm("Are you sure you want to reset all progress?")) {
            setSolvedPuzzles({});
            localStorage.removeItem('solvedPuzzles');
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
        isSolved,
        isFailed,
        solvedPuzzles,
        selectCategory,
        nextPuzzle,
        prevPuzzle,
        showNextHint,
        markSolved,
        resetAllProgress
    };
};
