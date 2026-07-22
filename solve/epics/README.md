# Epics — optional decision memos before executable work

An **epic** is a bounded place to resolve options that span more than one potential
Quest. Use it only while the intended result is not sharp enough for a sealed
`doneWhen` or a broad approved contract. It is deliberately schema-light: one
Markdown file from `_template.md`, capped at 150 lines for version 2 epics.

## Where it sits

Choose the smallest planning home that matches the work:

- bounded deterministic work with an obvious proof: work directly;
- a bounded executable result: author a Quest;
- unresolved options spanning possible Quests: use an epic temporarily;
- an approved multi-Quest contract: use a spec or architecture document.

An epic is not a mandatory waypoint between a roadmap row and a Quest, and an
epic and spec must not duplicate the same executable plan.

## Lifecycle

`node scripts/solve.js overview` derives the epic's mechanical work stage from
explicit links:

- `framing` — no linked executable work exists;
- `linked-spec` — `graduatesTo` names an existing spec;
- `linked-draft` / `linked-open` — an explicitly linked Quest is drafted/open;
- `linked-terminal` — every explicitly linked Quest is terminal.

These stages describe linked work, not whether the idea was accepted, rejected,
or dropped. Record those human decisions as dated decision-log entries. Version 2
epics MUST NOT declare a mutable `status:` field. Legacy status fields remain
readable during migration but are not execution authority.

## Conventions

- `roadmapRow` co-locates planning records in `node scripts/solve.js overview`.
  It deliberately does not imply an epic-to-Quest link. That link is exact and
  explicit through `links.planDoc`, `links.specRef`, or an epic's `graduatesTo`
  target. `trace --row` reports Quests for the row; use `overview` for the full
  planning graph.
- Prefer one epic per unresolved decision theme. Version 2 epics are limited to
  150 lines, require `## Decision log`, and use no `status:`. Unknown contract
  versions fail closed. Graduate executable detail to a spec or Quest instead
  of extending the epic.
- Epics are NOT a closure surface. Measured truth lives in quests and the
  closure-ledger; an epic only records intent and the decision trail.

Copy `_template.md` only when unresolved cross-Quest framing actually exists.
