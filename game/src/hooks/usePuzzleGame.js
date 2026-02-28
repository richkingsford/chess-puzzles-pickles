import { useState, useEffect, useMemo } from 'react';

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
                setPuzzlesData(data);
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
    const selectCategory = (category) => {
        setCurrentCategory(category);
        setCurrentPuzzleIndex(0);
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
