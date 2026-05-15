# Hint Architecture & Design Rules

This file defines permanent rules for puzzle hint generation.

## Rule: Subtle → Obvious Progression

### Definition
Hints must reveal information in layers, from least direct to most direct, without skipping ahead.

### Required 4-step sequence
1. **Hint 1 (Subtle):** Identify only the board weakness or pattern context.
2. **Hint 2 (Concept):** Name the tactical idea (e.g., fork, pin, mating net).
3. **Hint 3 (Starter):** Indicate which piece begins the plan.
4. **Hint 4 (Obvious):** Give a near-direct nudge about the first move type.

## Rule: One Hint = One Point

### Definition
Each hint should communicate exactly one instructional point.

### Constraints
- Keep each hint to one sentence.
- Avoid chaining multiple instructions in one hint.
- Avoid combining piece selection, tactic naming, and move type in the same hint unless it is the final (Hint 4) stage.
- Keep wording compact and readable; rely on dictionary term taps for definitions.

## Rule: Early Hints Avoid Square IDs

### Definition
Early hints should avoid naming exact board coordinates such as e4, h7, or a8.

### Constraints
- Hint 1 should not include square IDs.
- Hint 2 should usually avoid square IDs unless the concept is impossible to express clearly without one.
- Reserve exact square IDs for Hint 3 or Hint 4 when the hint is intentionally becoming more direct.

## Rule: No Redundant Hints Within a Puzzle

### Definition
Hints in the same puzzle should each add new useful information.

### Constraints
- Do not repeat the same concept, target, weakness, or tactical idea in multiple hints unless the later hint adds a clearly more specific layer.
- Avoid rephrasing the same advice with different words.
- If two hints communicate the same instructional point, merge or replace one so the progression keeps moving forward.
- Redundancy should be checked within each puzzle, not only across the full dataset.

## Rule: Canonical Dictionary Alignment
- `dictionary.json` is the single source of truth for learning terms, aliases, and definitions.
- All tag alignment, hint term linking, and coverage scoring should reference `dictionary.json`.
- Do not maintain a parallel taxonomy file unless there is a strict runtime need.

## Rule: Clear, Short Phrasing

### Definition
Hints should be beginner-readable, compact, and free of dense explanation.

### Constraints
- Prefer plain phrasing over abstract or heavily qualified explanation.
- Avoid generic filler such as "find the best move" or "look carefully".
- Avoid semicolons, parenthetical explanations, and comma-heavy clauses.
- Keep each stage short enough that the hint can be scanned quickly during play.

## Implementation Guidance
- Preserve the stage order even when adding or inserting hints.
- If extra hints are ever added, they must still preserve monotonic reveal (never less subtle after a more obvious hint).

## Why this exists
These constraints improve beginner comprehension, reduce cognitive load, and keep hint progression predictable.
