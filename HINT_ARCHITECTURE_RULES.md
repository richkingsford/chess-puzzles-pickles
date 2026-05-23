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

1. **Hint 1 - Context:** identify the local weakness, tactical pattern, or
   decision point for this move. Do not name the piece to be moved, and do not
   give notation. Describe only the opponent's pieces, weakness, or opportunity.
2. **Hint 2 - Direction:** name the piece to be moved and the tactical idea
   without giving the exact move.
3. **Hint 3 - Near-direct:** give a clear nudge toward the move type or key
   square. This is the only hint in the group that may give the exact move id.

The progression resets for each player move. A later move's first hint can be
subtle again because it belongs to a new board position.

## Rule 3: One Hint = One Point

Each hint should communicate exactly one instructional point.

- Use one compact sentence.
- Do not chain multiple instructions into one hint.
- Do not include a move sequence in a single hint.
- Avoid opponent-response-plus-follow-up wording in one hint.

Legacy validator: `audit_rule2_one_point.js`

## Rule 4: Early Hints Avoid Exact Notation

The first hints inside each player-move group should avoid exact board
coordinates and SAN notation.

- Hint 1 should not include square IDs such as `e4`, `h7`, or `a8`.
- Hint 2 should usually avoid square IDs unless the concept is unclear without
  one.
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
- Avoid generic filler such as `find the best move`, `look carefully`, or
  `strong move here`.
- Avoid semicolons, colons, parenthetical explanations, dash-heavy phrasing,
  comma-heavy clauses, and dense connectors such as `because`, `although`,
  `however`, and `therefore`.
- Use one sentence.

Legacy validator: `audit_rule6_clear_short_phrasing.js`

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
