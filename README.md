# Chess Puzzles Pickles

This repo contains the chess puzzle data, hint generation and audit tools, and
the React/Vite game in `game/`.

## Hint Rules

The chess hint rules are documented in
[HINT_ARCHITECTURE_RULES.md](HINT_ARCHITECTURE_RULES.md). Start there before
editing puzzle hints, generating new hints, or changing the hint audit scripts.

In short, our current hint direction is:

1. Three hints for every player move.
2. Per-move context, direction, then near-direct progression.
3. One hint equals one point.
4. Early hints avoid exact notation.
5. No redundant hints within a move.
6. Dictionary / taxonomy alignment.
7. Clear, short phrasing.

Before regenerating hints, use the category trim report to find weak or
redundant categories:

```sh
node audit_category_trim_candidates.js
```

Run the focused hint audits from the repo root with:

```sh
node audit_rule1_progression.js
node audit_rule2_one_point.js
node audit_rule3_early_square_ids.js
node audit_rule4_no_redundant_hints.js
node audit_rule5_dictionary_alignment.js
node audit_rule6_clear_short_phrasing.js
```

## Common Commands

```sh
npm run build:app
npm run analyze:puzzles
npm run audit:categories
npm run audit:puzzles
npm run test:puzzles
```
