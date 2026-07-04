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

1. **Hint 1 - Principle plus vulnerability clue, in two brief sentences:**
   sentence 1 teaches the puzzle category's principle. Sentence 2 repeats the
   tactic or theme name and uses it to point toward the exact vulnerability on
   the current board. Keep both sentences in one string with no line break.
2. **Hint 2 - Principle restated + opportunity nudge, in two brief sentences:**
   write for an 8-year-old. Use simple, short words. Be warm and encouraging,
   like a chessmaster sitting next to them who can see the answer and is
   trying to guide their eyes to it — without pointing directly.
   Hint 2 is about 30% more direct and obvious than Hint 1. It should feel
   like a second, friendlier pass at the same lesson — a little clearer, a
   little closer, but still leaving the "aha!" moment to the player.
   Sentence 1 restates the puzzle's principle (the category or tactic) in a
   different way than Hint 1 did it — roughly 30% more direct. If Hint 1
   explained what a pin is, Hint 2 explains how you use a pin. If Hint 1
   explained what a fork does, Hint 2 explains why a fork wins material. The
   principle must still be category-specific — no generic weakness statements
   when a tactic name applies. Do not repeat Hint 1's exact wording.
   Sentence 2 tells the player specifically what to look for — like a
   chessmaster leaning over and saying "look for an empty diagonal", "look
   for a fork window", or "look for an opportunity to do X and Y". It should
   name the type of opportunity (an open line, a fork square, a free capture,
   a back-rank window) and anchor it to the relevant area of this specific
   board. The player should finish reading and feel "I know exactly where to
   look!" — not "I have no idea." Never give the move away. Never name a
   specific square. Never name a specific piece.
   Sentence 2 must start with "Look for". This frames the hint as active
   guidance — the player is being coached to search, not just informed.
   Examples: "Look for an open file aimed at the back row where the king has
   no escape." "Look for a fork square near the center where one move hits
   both targets." "Look for a chance to remove the only defender and win the
   target behind it."
   Both sentences must be specific to this puzzle's category AND this specific
   board position. No canned or generic hints that would fit any puzzle in the
   category. The second sentence must describe an opportunity that exists only
   in this position.
   Do not include square IDs, SAN notation, piece names, our-side language,
   or mid-sentence directives such as `play`, `move`, `compare`, or `trace`.
3. **Hint 3 - Near-direct:** give a clear nudge toward the move type or key
   square. This is the only hint in the group that may give the exact move id.

The progression resets for each player move. A later move's first hint can be
subtle again because it belongs to a new board position.

### Hint 1 Hard Rules

- Sentence 1 must teach the category-specific principle, not merely say that a
  good move exists.
- Sentence 2 must use the same named tactic or theme from sentence 1 to
  tactfully highlight the specific vulnerability before the current player
  move.
- Sentence 2 must describe parts of the tactic, such as trapped exits, blocked
  defenders, overloaded guards, aligned targets, loose high-value targets, or
  a weak promotion race.
- Hint 1 must not give SAN notation, square IDs such as `e4`, or exact move
  instructions.
- Hint 1 must not name our moving piece or say whose piece should move.
- Hint 1 must be relevant to both the puzzle category and the current player
  move, including later player moves in multi-step puzzles.
- Hint 1 must focus on the vulnerability, not the opportunity to play a
  specific move.

### Hint 1 Writing Guidelines

- Write for an 8-year-old learner with direct, simple language.
- Use plain language that helps the learner remember and detect the principle.
  Do not reach for flowery or clever wording.
- It is okay to name tactic ingredients when they teach the principle, such as
  the enemy king, pinned target, blocker, defender, or escape squares.
- Avoid vague location-only clues such as `back right`, `left side`, or `over
  there`. Use the tactic itself to point at the board.
- Good second sentences often begin with the tactic name, such as `The fork
  clue is...` or `The pin vulnerability is...`.
- Keep each sentence short enough to read during play.

### Hint 2 Hard Rules

- Do not use viewpoint-dependent board regions or directions such as `left`,
  `right`, `center`, `front`, `back`, `top`, or `bottom`. These labels are easy
  to reverse and do not teach the tactic.
- A canonical tactic name such as `back-rank mate` is allowed in sentence 1.
  Do not use `back row` or similar wording as the location clue in sentence 2.
- Sentence 2 must guide the learner with stable chess relationships instead,
  such as the same file, rank, or diagonal; a blocker between two pieces; an
  overloaded defender; sealed escape squares; or a target's piece value.

### Hint 2 Writing Guidelines

- Lean out location wording that does not help the learner solve the tactic.
- Prefer `the pinned 3 point piece` or `the open file to the boxed king` over
  descriptions such as `the piece on the left` or `the king in the center`.
- Relationships between pieces are more reliable than board-region labels.

## Rule 3: One Hint = One Point

Each hint should communicate exactly one instructional point.

- Hint 1 uses exactly two brief sentences: principle first, vulnerability clue
  second.
- Hint 2 uses exactly two brief sentences: principle restated 30% more
  directly first, opportunity nudge second.
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

Hints must be readable by an 8-year-old. If a child would not understand a
word or phrase, replace it with something simpler.

- Use short, plain words. Concrete and direct beats abstract and clever.
- Be friendly and helpful — a hint should feel like a nudge from a friend, not
  a riddle.
- A hint should point at something visible and real on the board. Avoid hints
  that only name a theme without giving any picture of the position.
- Avoid generic filler such as `find the best move`, `look carefully`, or
  `strong move here`.
- Avoid semicolons, colons, parenthetical explanations, and comma-heavy
  clauses.
- In Hint 1, also avoid dash-heavy phrasing and dense connectors such as
  `because`, `although`, `however`, and `therefore`.
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
