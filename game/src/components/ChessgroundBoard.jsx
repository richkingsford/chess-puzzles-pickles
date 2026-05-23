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

const normalizeMotifHighlight = (highlight) => {
    if (typeof highlight === 'string') {
        return {
            square: highlight,
            type: '',
            symbol: ''
        };
    }

    return {
        square: String(highlight?.square || ''),
        type: String(highlight?.type || ''),
        symbol: String(highlight?.symbol || '')
    };
};

const normalizeArrowShape = (arrow) => {
    if (Array.isArray(arrow)) {
        return {
            orig: arrow[0],
            dest: arrow[1],
            brush: arrow[2] || 'green'
        };
    }

    return {
        orig: arrow?.orig || arrow?.from,
        dest: arrow?.dest || arrow?.to,
        brush: arrow?.brush || 'green',
        modifiers: arrow?.modifiers
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
    const normalizedHighlights = useMemo(
        () => highlights.map(normalizeMotifHighlight).filter((highlight) => highlight.square),
        [highlights]
    );
    const normalizedEnemyHighlights = useMemo(
        () => enemyHighlights.map(normalizeMotifHighlight).filter((highlight) => highlight.square),
        [enemyHighlights]
    );
    const normalizedArrows = useMemo(
        () => (customArrows || []).map(normalizeArrowShape).filter((arrow) => arrow.orig && arrow.dest),
        [customArrows]
    );
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
                    shapes: normalizedArrows
                },
                classes: new Map(normalizedHighlights.map(({ square }) => [square, 'visual-highlight'])),
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
                    shapes: normalizedArrows
                },
                classes: new Map(normalizedHighlights.map(({ square }) => [square, 'visual-highlight']))
            });

            // Critical: Force bounds recalculation to fix click offset
            api.current.set({});
        }
    }, [fen, orientation, sideToMove, normalizedArrows, legalDests, activeMovableColor, normalizedHighlights]);

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
            {(normalizedHighlights.length > 0 || normalizedEnemyHighlights.length > 0) && (
                <div className="motif-highlight-layer" aria-hidden="true">
                    {normalizedHighlights.map((highlight, index) => {
                        const style = getSquareOverlayStyle(highlight.square, orientation);

                        if (!style) {
                            return null;
                        }

                        return (
                            <div
                                key={`own-${highlight.square}-${highlight.type}-${index}`}
                                className={[
                                    'visual-motif-highlight',
                                    highlight.type ? 'visual-motif-highlight--fork' : '',
                                    highlight.type ? `visual-motif-highlight--${highlight.type}` : ''
                                ].filter(Boolean).join(' ')}
                                data-symbol={highlight.symbol}
                                style={style}
                            />
                        );
                    })}
                    {normalizedEnemyHighlights.map((highlight, index) => {
                        const style = getSquareOverlayStyle(highlight.square, orientation);

                        if (!style) {
                            return null;
                        }

                        return (
                            <div
                                key={`enemy-${highlight.square}-${highlight.type}-${index}`}
                                className={[
                                    'visual-motif-highlight',
                                    'visual-motif-highlight--enemy',
                                    highlight.type ? 'visual-motif-highlight--fork' : '',
                                    highlight.type ? `visual-motif-highlight--${highlight.type}` : ''
                                ].filter(Boolean).join(' ')}
                                data-symbol={highlight.symbol}
                                style={style}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}
