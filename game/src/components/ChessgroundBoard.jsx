import React, { useEffect, useRef, useMemo } from 'react';
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

export function ChessgroundBoard({ fen, orientation, onMove, width, height, customArrows }) {
    const ref = useRef(null);
    const api = useRef(null);
    const onMoveRef = useRef(onMove);

    // Keep the callback ref updated
    useEffect(() => {
        onMoveRef.current = onMove;
    }, [onMove]);

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

    useEffect(() => {
        if (ref.current && !api.current) {
            const config = {
                fen: fen,
                orientation: orientation,
                movable: {
                    free: true, // Allow free movement to avoid blocking drag
                    color: 'both', // Allow moving pieces of either color (logic handled in App)
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
                premovable: { enabled: false }
            };

            api.current = Chessground(ref.current, config);
        } else if (api.current) {
            // Update existing
            api.current.set({
                fen: fen,
                orientation: orientation,
                movable: {
                    dests: legalDests
                },
                drawable: {
                    shapes: customArrows ? customArrows.map(a => ({
                        orig: a[0],
                        dest: a[1],
                        brush: 'green'
                    })) : []
                }
            });

            // Critical: Force bounds recalculation to fix click offset
            api.current.set({});
        }
    }, [fen, orientation, customArrows, legalDests]);

    // Secondary effect to ensure bounds are correct on mount, resize, and interaction
    useEffect(() => {
        if (!api.current || !ref.current) return;

        const handleSync = () => {
            if (api.current) {
                api.current.set({});
            }
        };

        window.addEventListener('resize', handleSync);
        const observer = new ResizeObserver(handleSync);
        observer.observe(ref.current);

        const el = ref.current;
        el.addEventListener('mousedown', handleSync);
        el.addEventListener('touchstart', handleSync, { passive: true });

        const t = setTimeout(handleSync, 200);

        return () => {
            window.removeEventListener('resize', handleSync);
            observer.disconnect();
            el.removeEventListener('mousedown', handleSync);
            el.removeEventListener('touchstart', handleSync);
            clearTimeout(t);
        };
    }, []);

    return (
        <div className="cg-wrap" style={{ width: width || '100%', height: height || '100%', position: 'relative' }}>
            <div
                ref={ref}
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
                className="brown cburnett"
            />
        </div>
    );
}
