# Hint Architecture Rules

This file is the source of truth for chess puzzle hint writing and review.
The current migration target is move-scoped hints: three hints for every player
move in a puzzle.

Existing puzzle data still uses the legacy flat `hints` array. Do not rewrite
that content until weak categories have been trimmed and the remaining set is
ready for regeneration.

## Current Target Shape

Use `moveHints` for new or regenerated hint content:

```json
{
  "answer": "e4, e5, Nf3",
  "moveHints": [
    ["Move 1 hint 1", "Move 1 hint 2", "Move 1 hint 3"],
    ["Move 2 hint 1", "Move 2 hint 2", "Move 2 hint 3"]
  ]
}
```

`answer` starts with the player's move and then alternates opponent replies and
player moves. Player moves are therefore answer indices `0`, `2`, `4`, and so
on. Each player move must have exactly one `moveHints` group with exactly three
hints.

The app remains backward-compatible: when `moveHints` is absent, the legacy
flat `hints` array keeps its current puzzle-level behavior.

## Rule 1: Three Hints Per Player Move

Every player move in the answer line gets its own three-hint group.

- Do not stop after the first move in a multi-move puzzle.
- Do not write hints for opponent replies.
- The number of `moveHints` groups must equal the number of player moves.
- Each group must contain exactly three hint strings.

Validator: `game/src/lib/puzzleAudit.js` checks `moveHints` shape when the field
exists.

## Rule 2: Per-Move Progression

Each three-hint group should reveal one player move in layers.

1. **Hint 1 - Vulnerability only, in two brief sentences:** the first sentence
   states the general principle behind the weakness, such as what a back-rank
   mate, smothered mate, loose target, overloaded guard, promotion race, or
   loaded line means. Do not use the first sentence as another board-location
   clue.
   The second sentence highlights the area of the board without saying the
   piece the player must move or using square IDs. Prefer area clues like
   `vulnerable diagonal near the enemy queen` or `the king cannot escape to the
   right side`. Do not mention our opportunity, our side, candidate moves,
   notation, or what the player should move.
   For material vulnerabilities, be direct about why the target is loose: name
   the defender count and target value, such as `a target with 1 defender` and
   `the 3 point target near the enemy king`.
   For king vulnerabilities, be direct about escape limits: name the safe
   escape count and the area or blocked side, such as `a king with only 1 safe
   escape square` and `the right side of the enemy king has no safe exit`.
   For line, race, opening, endgame, and coordination vulnerabilities, name the
   concrete failure point, such as one blocker, a late stopper, an unsettled
   back line, no spare tempo, or thin nearby support.
2. **Hint 2 - Tactical opportunity, in two brief sentences:** do not repeat
   Hint 1's general principle. The first sentence highlights the opportunity
   more directly, such as a capture on an under-defended target, a blocked
   escape, a loaded line, a race lane, a tied-down guard, or a tempo problem.
   The second sentence tells the player how to see the opportunity on the board
   without giving the move away, such as following a diagonal, checking the
   defender count, comparing escape sides, tracing the open line, or noticing
   which reply is overloaded. Do not include square IDs, SAN notation, piece
   names, our-side language, or direct phrasing such as `play`, `move`, or
   `start with`.
3. **Hint 3 - Near-direct:** give a clear nudge toward the move type or key
   square. This is the only hint in the group that may give the exact move id.

The progression resets for each player move. A later move's first hint can be
subtle again because it belongs to a new board position.

## Rule 3: One Hint = One Point

Each hint should communicate exactly one instructional point.

- Hint 1 uses exactly two brief sentences: principle first, area clue second.
- Hint 2 uses exactly two brief sentences: opportunity first, how-to-see-it
  clue second.
- Hint 3 uses one compact sentence.
- Do not chain multiple instructions into one hint.
- Do not include a move sequence in a single hint.
- Avoid opponent-response-plus-follow-up wording in one hint.

Legacy validator: `audit_rule2_one_point.js`

## Rule 4: Early Hints Avoid Exact Notation

The first hints inside each player-move group should avoid exact board
coordinates and SAN notation.

- Hint 1 must not include square IDs such as `e4`, `h7`, or `a8`.
- Hint 2 must not include square IDs, SAN notation, or piece names.
- Hint 3 may use a square or move type when the hint is intentionally direct.

Legacy validator: `audit_rule3_early_square_ids.js`

## Rule 5: No Redundant Hints Within a Move

The three hints for one player move should each add useful information.

- Do not repeat the same concept, target, weakness, or advice.
- Do not rephrase the same hint with different words.
- Repeated concepts are only acceptable when the later hint adds a clearly more
  specific layer.

Legacy validator: `audit_rule4_no_redundant_hints.js`

## Rule 6: Dictionary / Taxonomy Alignment

`dictionary.json` is the single source of truth for learning terms, aliases,
and definitions.

- Puzzle tags must resolve to a canonical dictionary term or alias.
- Explicit hint concepts using `The key concept is ...` must resolve to a
  canonical dictionary term or alias.
- Hint term linking and coverage scoring should reference `dictionary.json`.
- Do not maintain a parallel taxonomy file unless there is a strict runtime
  need.

Legacy validator: `audit_rule5_dictionary_alignment.js`

## Rule 7: Clear, Short Phrasing

Hints should be beginner-readable, compact, and easy to scan during play.

- Prefer plain phrasing over abstract or heavily qualified explanation.
- Write for an 8-year-old learner: concrete, vivid, and friendly, with enough
  texture to make the position feel memorable.
- Prefer helpful over coy. A hint can point at the shape of the tactic without
  giving away the mover or square.
- Brevity is good, but early hints should still teach. Avoid tiny hints that
  name only a theme and leave the player with no picture.
- Dictionary linking can define terms, so hints do not need to explain every
  chess word, but they should still point to a visible board clue.
- Avoid generic filler such as `find the best move`, `look carefully`, or
  `strong move here`.
- Avoid semicolons, colons, parenthetical explanations, dash-heavy phrasing,
  comma-heavy clauses, and dense connectors such as `because`, `although`,
  `however`, and `therefore`.
- Use one sentence, except Hint 1 and Hint 2 in each `moveHints` group, which
  use exactly two brief sentences.

Legacy validator: `audit_rule6_clear_short_phrasing.js`

## Rule 8: Current-Move Relevancy

Structured `moveHints` must describe the board before that specific player
move, not just the puzzle's opening position or category.

- Recompute the board for each player move before writing its hint group.
- The final hint in each group must name that move's SAN, not a later or
  earlier player move.
- Do not reuse the same first two hints for consecutive player moves.
- Avoid generic filler such as `force the issue`, `big clue`, or `best move`.

Validator: `game/src/lib/puzzleHints.js` checks structured `moveHints` for
wrong SAN references, repeated opening pairs, and known vague phrasing.

## Category Trimming Before Regeneration

Before regenerating `moveHints`, trim categories that are weak, redundant, too
generic, or expensive to support for low instructional value. Use the category
trim candidate report to guide that pass:

```sh
node audit_category_trim_candidates.js
```

The report is a starting point for editorial review, not an automatic delete
list.

## Audit Commands

Run the focused legacy validators from the repo root:

```sh
node audit_rule1_progression.js
node audit_rule2_one_point.js
node audit_rule3_early_square_ids.js
node audit_rule4_no_redundant_hints.js
node audit_rule5_dictionary_alignment.js
node audit_rule6_clear_short_phrasing.js
```

Run the app/data audit, including optional `moveHints` shape validation:

```sh
npm run audit:puzzles
```

## Why These Rules Exist

The hint system is for beginners. The rules keep hints available throughout a
multi-move solution, reduce cognitive load, and make every reveal feel earned
instead of abrupt.
