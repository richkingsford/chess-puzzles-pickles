
import { useState, useEffect, useMemo } from 'react';
import { disableBodyScroll, enableBodyScroll } from 'body-scroll-lock'; // Might need this later, but for now just standard state.

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

export const usePuzzleGame = () => {
    const [puzzlesData, setPuzzlesData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Game State
    const [currentCategory, setCurrentCategory] = useState(null);
    const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
    const [hintsRevealed, setHintsRevealed] = useState(0);
    const [isSolved, setIsSolved] = useState(false);
    const [isFailed, setIsFailed] = useState(false); // If user gave up
    const [lastFeedbackType, setLastFeedbackType] = useState(null);

    // Persistent State
    const [solvedPuzzles, setSolvedPuzzles] = useState(() => loadState('solvedPuzzles', {})); // { category: [puzzleUrl1, puzzleUrl2] }
    const [feedbackLogs, setFeedbackLogs] = useState(() => loadState('feedbackLogs', []));

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

    useEffect(() => {
        localStorage.setItem('feedbackLogs', JSON.stringify(feedbackLogs));
    }, [feedbackLogs]);

    // Derived state
    const currentCategoryPuzzles = useMemo(() => {
        if (!puzzlesData || !currentCategory) return [];
        return Object.entries(puzzlesData[currentCategory] || {}).map(([url, data]) => ({
            url,
            ...data
        }));
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

    const logFeedback = (type, hintIndex = null) => {
        const log = {
            timestamp: new Date().toISOString(),
            type,
            puzzleUrl: currentPuzzle.url,
            category: currentCategory,
            hintIndex: hintIndex !== null ? hintIndex : undefined,
            puzzleDetails: {
                fen: currentPuzzle.url.split('fen=')[1]?.split('&')[0] || '',
                hints: currentPuzzle.hints,
                answer: currentPuzzle.answer,
                solution: currentPuzzle.solution
            }
        };
        setFeedbackLogs(prev => [...prev, log]);
        setLastFeedbackType(type);
        // Clear after 2 seconds
        setTimeout(() => setLastFeedbackType(null), 2000);
    };

    const resetAllProgress = () => {
        if (confirm("Are you sure you want to reset all progress?")) {
            setSolvedPuzzles({});
            setFeedbackLogs([]);
            localStorage.removeItem('solvedPuzzles');
            localStorage.removeItem('feedbackLogs');
            window.location.reload();
        }
    };

    const downloadLogs = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(feedbackLogs, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "puzzle_feedback_logs_with_details.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
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
        lastFeedbackType,
        selectCategory,
        nextPuzzle,
        prevPuzzle,
        showNextHint,
        markSolved,
        logFeedback,
        resetAllProgress,
        downloadLogs
    };
};
