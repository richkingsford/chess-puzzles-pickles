# Later-move hint repair — 2026-11-16

Scope: all 488 player move 2/3 groups, containing 1,464 hints. Replayed every
position with chess.js and independently with python-chess, checked the full
ten-rule rubric, and revised the erroneous local roles and their prose.
The coverage ledger records each position, SAN, role, board observations,
three hints, and changed levels. It records replay coverage, not subjective
per-hint grades or an engine assessment of optimal play.

Changed 250 hints across 88 groups:

- 51 incidental guard-removal groups now teach the immediate capture.
- 10 routine exchanges no longer imply a special attraction mechanism.
- 7 supported checking offers explain support and recapture.
- 7 offers beside a boxed king explain crowding escape space.
- 2 quiet attacks now teach pressure on their actual heavy-piece targets.
- 2 pawn offers now teach breaking a pawn barrier.
- 1 offer explains deflection of a promotion blocker.
- 1 checking offer explains opening the recapture line.
- 7 promotion hint threes no longer imply the destination must be empty.

The Clearance 2/9 second move is Re1. Its new first hint is:
“Attacking an enemy piece can force it to retreat or gain protection.
An enemy heavy piece has no guard.” The target is the queen on e2.

The independent second pass exposed a distinction in Rd1+ (x-ray attack):
the offered rook is not yet directly protected; the opponent's recapture
opens the queen's recapture line. Its lesson and proof were corrected.

Rules now explicitly reject true but unrelated king observations, checking
advice for quiet moves, and incidental guard relationships. Regression tests
include the reported Clearance position, the x-ray exception, pawn offers,
promotion deflection, and valid blocking moves.

Validation: 12 independent-board regression tests, 10 principle/concept tests,
54 application/data tests, and production build passed. The ten-rule audit
reports zero detected violations across all 2,850 hints. Editorial nuance is
not proven by an automated zero; new feedback must still be investigated.
Nine changed grades in the Capturing Defender pilot were individually updated
to match their revised text and positions. No grading expansion was made.
