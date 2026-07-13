---
scope: boot
status: manual-pack
always_load: true
source_of_truth: self
canonical_rules: docs/steering/workflow-guidelines/solver-quests.md
last_reviewed: 2026-07-13
---

> **Manual pack - edit here directly.** Load order is owned by
> [`AGENTS.md`](../../../AGENTS.md). This file covers authority order, Quest
> vocabulary, first commands, and conflict resolution.

# LLM Boot Contract

## Authority Order

When sources appear to disagree at execution time, follow this order:

1. **User and developer instructions, and safety limits.**
2. **Quest workflow canon.** `AGENTS.md`,
   `docs/steering/workflow-guidelines/solver-quests.md`, and the active Quest
   file define the current task and rules of engagement.
3. **Domain packs under `docs/steering/llm/*.md`.** Apply only rules whose
   scope intersects the touched owner boundary.

The source-vs-pack distinction is a generator concern, not an execution-time
override path (see core.md "Pack vs Source Precedence"; drift repair is covered
under "Conflict Rule And Escape Hatch" below).

## Quest Vocabulary

The canonical glossary lives in [`core.md`](core.md) "Vocabulary" — always
loaded and read first. One additional term used here: a **Report** is the
projection of the event log and terminal state.

## First Commands

First apply the Quest threshold in `AGENTS.md`. Below it, do the bounded work,
prove it, and commit it without creating workflow state. Above it, start with
the read-only capability preflight:

```sh
node scripts/solve.js doctor
```

For an existing Quest, ask the Solver for its one typed action:

```sh
node scripts/solve.js next --id <id>
```

For a new Quest, author its planning link at creation, validate the draft, then
use the same typed-action surface:

```sh
node scripts/solve.js new --id <id> --statement "<sealed result>" \
  --spec-ref <spec-or-plan-reference>
node scripts/solve.js lint --id <id>
node scripts/solve.js next --id <id>
```

`new` writes a versioned draft and stamps `links.draftedAtCommit`; it does not
seal the goal. The first `step`, `attempt`, or `run` lints the draft and appends
the declaration. A lint failure appends nothing. `--force` may replace only a
history-free draft; once a log exists, author a successor Quest.

`doctor` reports whether a live agent adapter is explicitly enabled and
executable. When it recommends supervised mode, use `step`. When it recommends
autonomous mode, `next` may return the real agent invocation. The no-op example
adapter is never treated as a capability.

After a source-changing attempt, `next` returns the exact attempt fingerprint
to verify, then directs the operator to the explicit checkpoint:

```sh
node scripts/solve.js checkpoint --id <id>
```

At a terminal, `next` requests aggregate verification when needed and returns
`handoff --commit` only after the full audit passes. Findings never commit, and
no Solver command pushes.

```sh
node scripts/solve.js handoff --id <id> --commit
```

## Conflict Rule And Escape Hatch

If two steering files or instructions appear to disagree at execution time, do
not average them or compromise. Follow the Authority Order above.

When a Level 1 user instruction explicitly overrides or contradicts Quest or
domain-pack constraints:

1. State the contradiction in the chat or the Quest finding log.
2. Ask for confirmation before weakening safety bounds, deleting guardrails, or
   bypassing validation. This is the safety-specific instance of the core.md
   "Default Posture: Autonomy" stop-triggers; everything outside that stop-list
   stays autonomous.

Separately — and this is **drift repair, not a runtime override** — if a domain
pack rule is simply outdated (the source and the user agree; the generated pack
lagged), edit its source under `docs/steering/` and run
`npm run steering:llm:pack`. That regenerates the pack; it is not a way to resolve
a live user-vs-canon conflict, which the two steps above govern.
