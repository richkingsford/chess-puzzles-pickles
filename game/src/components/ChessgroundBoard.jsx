import React, { useEffect, useRef, useMemo } from 'react';
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

const FILES = 'abcdefgh';

const extractClientPoint = (event) => {
    if (typeof event?.clientX === 'number' && typeof event?.clientY === 'number') {
        return { x: event.clientX, y: event.clientY };
    }

    const touch = event?.touches?.[0] || event?.changedTouches?.[0];
    if (touch && typeof touch.clientX === 'number' && typeof touch.clientY === 'number') {
        return { x: touch.clientX, y: touch.clientY };
    }

    return null;
};

const getSquareOverlayStyle = (square, orientation) => {
    const fileIndex = FILES.indexOf(String(square || '').charAt(0));
    const rank = Number(String(square || '').charAt(1));

    if (fileIndex === -1 || Number.isNaN(rank) || rank < 1 || rank > 8) {
        return null;
    }

    const left = orientation === 'black' ? (7 - fileIndex) * 12.5 : fileIndex * 12.5;
    const top = orientation === 'black' ? (rank - 1) * 12.5 : (8 - rank) * 12.5;

    return {
        left: `${left}%`,
        top: `${top}%`
    };
};

export function ChessgroundBoard({ fen, orientation, onMove, onInteraction, width, height, customArrows, movableColor, highlights = [], enemyHighlights = [] }) {
    const wrapperRef = useRef(null);
    const ref = useRef(null);
    const api = useRef(null);
    const onMoveRef = useRef(onMove);
    const onInteractionRef = useRef(onInteraction);

    // Keep the callback ref updated
    useEffect(() => {
        onMoveRef.current = onMove;
    }, [onMove]);

    useEffect(() => {
        onInteractionRef.current = onInteraction;
    }, [onInteraction]);

    // Calculate legal moves for Chessground
    const legalDests = useMemo(() => {
        try {
            const chess = new Chess(fen);
            const dests = new Map();
            chess.moves({ verbose: true }).forEach(m => {
                if (dests.has(m.from)) dests.get(m.from).push(m.to);
                else dests.set(m.from, [m.to]);
            });
            return dests;
        } catch (e) {
            return new Map();
        }
    }, [fen]);

    // Current side to move color for Chessground
    const sideToMove = useMemo(() => {
        try {
            return new Chess(fen).turn() === 'w' ? 'white' : 'black';
        } catch (e) {
            return orientation;
        }
    }, [fen, orientation]);

    const activeMovableColor = movableColor || 'both';
    const isPlayerTurn = activeMovableColor !== 'both' && sideToMove === activeMovableColor;
    const highlightedSourceSquares = useMemo(() => {
        if (!isPlayerTurn) {
            return [];
        }

        return Array.from(legalDests.keys());
    }, [isPlayerTurn, legalDests]);
    const boardClassName = [
        'cg-wrap',
        'puzzle-chessboard',
        activeMovableColor === 'white' ? 'player-white' : '',
        activeMovableColor === 'black' ? 'player-black' : '',
        isPlayerTurn ? 'is-player-turn' : 'is-opponent-turn'
    ].filter(Boolean).join(' ');

    useEffect(() => {
        if (ref.current && !api.current) {
            const config = {
                fen: fen,
                orientation: orientation,
                turnColor: sideToMove,
                movable: {
                    free: false,
                    color: activeMovableColor,
                    dests: legalDests,
                    showDests: true,
                    events: {
                        after: (orig, dest) => {
                            if (onMoveRef.current) onMoveRef.current(orig, dest);
                        }
                    }
                },
                draggable: {
                    showGhost: true,
                    autoDistance: true,
                    deleteOnRightClick: false
                },
                highlight: {
                    lastMove: true,
                    check: true
                },
                drawable: {
                    enabled: true,
                    shapes: customArrows ? customArrows.map(a => ({
                        orig: a[0],
                        dest: a[1],
                        brush: 'green'
                    })) : []
                },
                classes: new Map(highlights.map(square => [square, 'visual-highlight'])),
                premovable: { enabled: false }
            };

            api.current = Chessground(ref.current, config);
        } else if (api.current) {
            // Update existing
            api.current.set({
                fen: fen,
                orientation: orientation,
                turnColor: sideToMove,
                movable: {
                    free: false,
                    color: activeMovableColor,
                    dests: legalDests
                },
                drawable: {
                    shapes: customArrows ? customArrows.map(a => ({
                        orig: a[0],
                        dest: a[1],
                        brush: 'green'
                    })) : []
                },
                classes: new Map(highlights.map(square => [square, 'visual-highlight']))
            });

            // Critical: Force bounds recalculation to fix click offset
            api.current.set({});
        }
    }, [fen, orientation, sideToMove, customArrows, legalDests, activeMovableColor, highlights]);

    // Secondary effect to ensure bounds are correct on mount, resize, and interaction
    useEffect(() => {
        if (!api.current || !ref.current || !wrapperRef.current) return;

        const handleSync = () => {
            if (api.current) {
                api.current.set({});
            }

            const boardElement = ref.current?.querySelector('cg-board');
            const wrapperElement = wrapperRef.current;

            if (!boardElement || !wrapperElement) {
                return;
            }

            const wrapperRect = wrapperElement.getBoundingClientRect();
            const boardRect = boardElement.getBoundingClientRect();

            wrapperElement.style.setProperty('--cg-board-offset-left', `${boardRect.left - wrapperRect.left}px`);
            wrapperElement.style.setProperty('--cg-board-offset-top', `${boardRect.top - wrapperRect.top}px`);
            wrapperElement.style.setProperty('--cg-board-width', `${boardRect.width}px`);
            wrapperElement.style.setProperty('--cg-board-height', `${boardRect.height}px`);
        };

        window.addEventListener('resize', handleSync);
        const observer = new ResizeObserver(handleSync);
        observer.observe(ref.current);

        const el = ref.current;
        const handlePointerDown = (event) => {
            handleSync();

            const point = extractClientPoint(event);
            if (point && onInteractionRef.current) {
                onInteractionRef.current(point);
            }
        };

        el.addEventListener('pointerdown', handlePointerDown, { passive: true });

        const t = setTimeout(handleSync, 200);

        return () => {
            window.removeEventListener('resize', handleSync);
            observer.disconnect();
            el.removeEventListener('pointerdown', handlePointerDown);
            clearTimeout(t);
        };
    }, []);

    return (
        <div
            ref={wrapperRef}
            className={boardClassName}
            style={{ width: width || '100%', height: height || '100%', position: 'relative' }}
        >
            <div
                ref={ref}
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
                className="brown cburnett"
            />
            {highlightedSourceSquares.length > 0 && (
                <div className="movable-source-layer" aria-hidden="true">
                    {highlightedSourceSquares.map((square) => {
                        const style = getSquareOverlayStyle(square, orientation);

                        if (!style) {
                            return null;
                        }

                        return (
                            <div
                                key={square}
                                className="movable-source-highlight"
                                style={style}
                            />
                        );
                    })}
                </div>
            )}
            {(highlights.length > 0 || enemyHighlights.length > 0) && (
                <div className="motif-highlight-layer" aria-hidden="true">
                    {highlights.map((square) => {
                        const style = getSquareOverlayStyle(square, orientation);

                        if (!style) {
                            return null;
                        }

                        return (
                            <div
                                key={`own-${square}`}
                                className="visual-motif-highlight"
                                style={style}
                            />
                        );
                    })}
                    {enemyHighlights.map((square) => {
                        const style = getSquareOverlayStyle(square, orientation);

                        if (!style) {
                            return null;
                        }

                        return (
                            <div
                                key={`enemy-${square}`}
                                className="visual-motif-highlight visual-motif-highlight--enemy"
                                style={style}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}
