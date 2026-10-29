# Hint Architecture Rules

This file is the source of truth for chess puzzle hint writing and review.
The current migration target is move-scoped hints: three hints for every player
move in a puzzle.

The dataset uses move-scoped hints. The legacy flat `hints` array remains for
compatibility; its first hint must match the first move's reviewed first hint.
Older generation and audit scripts may reflect superseded writing rules.
Use the current rules below and `npm --prefix game test` before accepting edits.

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

1. **Hint 1 - A subtle nudge, in two brief sentences:** sentence 1 teaches a
   short principle relevant to this move. Sentence 2 is an extremely brief
   observation about the current board, at most 12 words. Do not repeat the
   theme or add introductions such as `The advanced-pawn clue is...`.
   Keep the whole hint at most 30 words, in one string with no line break.
   Hint 1 helps the learner locate a weakness without describing the move,
   checking route, mating pattern, or follow-up. For example, use
   `An advanced pawn can stretch the defense. The king has little room beside
   the passer.` rather than naming an L-shaped mate.
2. **Hint 2 - Principle restated + opportunity nudge, in two brief sentences:**
   write for an 8-year-old. Use simple, short words. Be warm and encouraging,
   like a chessmaster sitting next to them who can see the answer and is
   trying to guide their eyes to it — without pointing directly.
   Hint 2 is about 30% more direct and obvious than Hint 1. It should feel
   like a second, friendlier pass at the same lesson — a little clearer, a
   little closer, but still leaving the "aha!" moment to the player.
   Sentence 1 restates Hint 1's principle (the primary concept on move one,
   or the local tactic on later moves) in a
   different way than Hint 1 did it — roughly 30% more direct. If Hint 1
   explained what a pin is, Hint 2 explains how you use a pin. If Hint 1
   explained what a fork does, Hint 2 explains why a fork wins material. The
   principle must fit Rule 10 on move one. On later moves the local tactic
   may differ from the overall concept once its setup has happened. Do not repeat Hint
   1's exact wording.
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
   Both sentences must fit this move's tactic AND this specific board
   position. Never attach a generic clue merely because the category
   matches. The second sentence must describe an opportunity verified in this
   position. Similar positions can share wording when the same board
   relationship is independently verified in each.
   Do not include square IDs, SAN notation, piece names, our-side language,
   or mid-sentence directives such as `play`, `move`, `compare`, or `trace`.
3. **Hint 3 - Near-direct:** begin with an independent teaching principle,
   then give a clear nudge toward the move type or key square. This is the
   only hint in the group that may give the exact move id. Older one-sentence
   `Play ...` hints need editorial revision under Rule 9.

The progression resets for each player move. A later move's first hint can be
subtle again because it belongs to a new board position.

### Hint 1 Hard Rules

- Sentence 1 must teach an independent principle. On move one it must clearly
  teach the first tag's concept (Rule 10); on later moves it can teach the
  current local tactic. Naming a category without explaining it is not enough.
- Sentence 2 must give a short board observation before the current player
  move. It must not repeat the theme name or explain how to exploit it.
- Sentence 2 must describe parts of the tactic, such as trapped exits, blocked
  defenders, overloaded guards, aligned targets, loose high-value targets, or
  a weak promotion race.
- Hint 1 must not give SAN notation, square IDs such as `e4`, or exact move
  instructions.
- Hint 1 must not name our moving piece or say whose piece should move.
- Hint 1 must be relevant to the current player move, including later player
  moves in multi-step puzzles. The category label must not override this.
- Hint 1 must focus on the vulnerability, not the opportunity to play a
  specific move.
- Prefer `heavy piece` for a queen or rook, and `medium piece` for a bishop or
  knight. Avoid exact point values and descriptions such as `L-shaped` that
  identify the moving piece indirectly. Pawns and kings may be named.
- Keep detailed attacker identities, routes, capture instructions, promotion
  choices, and named mating mechanisms for later hints.
- Teach the broad mechanism before naming a special case. For example,
  `A fork can threaten two targets at once.` is appropriate; `A fork can
  threaten the king and another target at once.` gives away an unnecessary
  target. Do not reveal a checking-fork subtype or exact jump pattern in
  Hint 1's principle.
- An already-visible concept name such as `queen endgame` or `double-bishop
  mate` may appear in the principle when it is the first tag. This exception
  does not permit naming this position's moving piece or extra target roles.

### Hint 1 Writing Guidelines

- Write for an 8-year-old learner with direct, simple language.
- Use plain language that helps the learner remember and detect the principle.
  Do not reach for flowery or clever wording.
- It is okay to name tactic ingredients when they teach the principle, such as
  the enemy king, pinned target, blocker, defender, or escape squares.
- Avoid vague location-only clues such as `back right`, `left side`, or `over
  there`. Use the tactic itself to point at the board.
- Start sentence 2 directly with the board observation, such as
  `A heavy blocker is pinned near the king.`
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
- Hint 3 teaches a principle first, then gives a compact near-direct cue.
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
- This rule applies within a player move, and identical opening pairs must
  not repeat on consecutive player moves. Repeated wording across separate
  puzzles is a review signal rather than an automatic failure: recurring
  tactical patterns should teach the same relationship when the board facts
  support it. Do not add cosmetic words just to make a string unique.

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
- Use two brief sentences: an independent principle followed by the board
  clue or near-direct cue. Brevity must not remove the teaching content.

Legacy validator: `audit_rule6_clear_short_phrasing.js`

## Rule 8: Current-Move Relevancy

Structured `moveHints` must describe the board before that specific player
move, not just the puzzle's opening position or category.

- Recompute the board for each player move before writing its hint group.
- The final hint in each group must name that move's SAN, not a later or
  earlier player move.
- Do not reuse the same first two hints for consecutive player moves.
- Avoid generic filler such as `force the issue`, `big clue`, or `best move`.
- Audit the setup and execution separately. Once attraction has already drawn
  a defender away, the next hint must teach the current check, fork, capture,
  or mate rather than telling the player to set up attraction again.
- `audit/move_hint_evidence.json` binds each group to its before-move FEN,
  current SAN, move role and observed targets. The independent Python auditor
  reconstructs those positions with a different chess engine and checks the
  claims instead of trusting the recorded role.

Validator: `game/src/lib/puzzleHints.js` checks structured `moveHints` for
wrong SAN references, repeated opening pairs, and known vague phrasing.

## Rule 9: An Independent Teaching Principle Comes First

The first sentence of **every hint, at every hint level and player move**, must
state a correct, transferable chess principle. A reader without this board,
the category label, or the next sentence must learn something useful from it.

- Explain a mechanism, cause and effect, constraint, or tradeoff. Naming a
  theme or saying that something can happen is not enough.
- Keep the principle separate from the position-specific observation. A good
  second sentence cannot rescue a first sentence that teaches nothing.
- Reject vague possibilities such as `A defender can be drawn away from a
  safe post.` This does not explain what attraction accomplishes.
- Prefer `Attraction can draw a piece onto a square where it becomes vulnerable.`
  This teaches the mechanism without identifying this puzzle's move.
- Do not turn the principle into an exact move instruction or a description
  of this board. Reserve those details for the second sentence, with the
  disclosure level appropriate to Hint 1, 2, or 3.
- Accuracy matters: a tactic does not always win. Avoid unconditional claims
  that a fork, sacrifice, promotion, or attack guarantees a win.
- Brevity is secondary to teaching value. Remove filler, not the explanation.

Semantic auditor: `npm run audit:principles` checks every structured hint
(legacy hints only when structured hints are absent). `audit_hint1.js` and
`audit_hint2.js` also call this check. The screenshot's weak sentence is an
explicit rejection with code `principle-not-independent`.

Semantic quality cannot be established by matching chess words. Exact first
sentences need a recorded editorial verdict and reason in
`audit/principle_reviews.json`. Unreviewed wording returns
`principle-review-required`, not a pass. A bare move instruction returns
`principle-missing`. An approved principle still needs the other rules and
current-board relevance checks; approval of the lesson alone is not approval
of the whole hint.

The authored lesson library has an editorial reason and applicable move roles
for each approved first sentence. Board evidence must establish that the
lesson fits the current move. New prose still requires editorial review;
generation must not automatically approve arbitrary text read from a dataset.
Regression checks: `npm run test:principles` and `npm run test:move-hints`.

## Rule 10: Move-One Principles Clearly Teach the First Tag

For the first player move, the first sentence of **all three hints** must have
an obvious, instructional tie to `puzzle.tags[0]`. Use the actual first tag,
not a secondary tag or the category folder. Explain its mechanism or strategic
tradeoff rather than just inserting its name.

- Move one introduces the puzzle's primary concept. The short board clue,
  opportunity cue and direct answer must still describe this move, including
  a setup move when the concept is completed later.
- Later player moves are exempt from this tie-in. Their principles should
  teach the tactic currently being played, rather than repeating a setup
  lesson after the setup is over.
- A concept-specific principle still must be subtle in Hint 1. Prefer `A fork
  can threaten two targets at once.` over enumerating the king and a second
  target. Keep checking variants and other solution-specific details for later
  hints.
- The canonical concept name may contain a piece name already disclosed by
  the tag. Only that name in the teaching sentence is exempt from the generic
  piece-name style check; the rest of the hint receives the usual checks.

`audit/primary_concept_lessons.json` contains the authored teaching principles.
Their editorial records declare their supported primary tags and concept name.
Both `audit_concept_rules.cjs` and the independent Python audit check the
first-tag connection, while the latter still verifies current-move evidence.
Unknown principles or missing primary-tag ties fail rather than receiving an
automatic keyword-based approval. Hint 1 generality is checked on every player
move, including moves two, three and beyond.

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

Run the current ten-rule audit from the repo root:

```sh
python -m pip install -r requirements-audit.txt
npm run audit:hints
npm run test:principles
npm run test:move-hints
```

`audit:hints` covers all ten rules and combines application and dictionary checks using chess.js,
editorial principle approval, and an independent python-chess board replay.
It covers all three hint levels and every player move. The historical
`audit_rule1...6` scripts target older flat five-stage or single-sentence
hints; their old stage/length scores are not release gates for this format.

Run the app/data audit separately:

```sh
npm run audit:puzzles
```

## Why These Rules Exist

The hint system is for beginners. The rules keep hints available throughout a
multi-move solution, reduce cognitive load, and make every reveal feel earned
instead of abrupt.
