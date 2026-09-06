---
scope: boot
status: manual-pack
always_load: true
source_of_truth: self
canonical_rules: docs/steering/workflow-guidelines/solver-quests.md
last_reviewed: 2026-07-22
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

Direct work is progressive: a failed measurement, expansion beyond the bounded
owner scope, or a durable finding needed for handoff is the stop signal. Seal a
Quest before a second evidence-bearing intervention; preserve the first result as
provenance rather than backdating it as an attempt.

```sh
node scripts/solve.js board
```

`start` seals a quest: it validates `solve/quests/<id>/quest.json` and its
epic, measures the `doneWhen` probe, refuses unless the probe is red, and
records `sealedAt` plus the seal-time metric in the log:

```sh
node scripts/solve.js start --id <id>
```

A new quest is authored by writing `solve/quests/<id>/quest.json` (statement,
epic, `doneWhen` probe, constraints) before `start`; there is no draft verb.

Routine supervised work uses `probe` to read the sealed probe and `note` to
record attempts, findings, verifications and blocked stops; `land` is the one
terminal action and stops for the operator when a guard refuses:

```sh
node scripts/solve.js probe --id <id>
# make and prove the bounded change
node scripts/solve.js note --id <id> --attempt "<what changed>"
```

After `land` records a categorized verifier rejection, make the bounded repair
and run only the summarized form: it both begins and captures the replacement.
The rejection itself reopens the Quest. Unchanged or narrower previously
authorized scope remains authorized without another override event; any introduced
source path stops for one new decision. Generated collateral is refreshed by its
owner and does not broaden admission.

`board` lists the open epics and quests. The v1 `doctor`, `new`, `lint`,
`next`, `step`, `continue`, `run`, `audit`, `checkpoint` and `handoff` verbs
were retired in solve-v2 phase 2; the four commands above plus `evidence add`
and `board` are the whole CLI (`solve-commands.md` is the generated reference).

At a terminal, run `land` once. It refuses unless the probe is green, the
newest verification is not a standing rejection, `src/` changes carry an
approving verification newer than the last attempt, the altitude budget and
the epic's `authorizes` scope hold, and the coupled-pair guard and the
changed-path static checkers pass; then it refreshes the inventories, verifies
the canonical import graph, runs `npm test`, commits the change set with
`LAGRANGE_SOLVER_LANDING=1`, and records the terminal `solved` entry. A
refused commit leaves the quest open. No Solver command pushes.

```sh
node scripts/solve.js note --id <id> --verification "<summary>" \
  --verifier subagent:<id> --verdict approve
node scripts/solve.js land --id <id>
# on rejection: --verdict reject, then repair and record the next attempt:
node scripts/solve.js note --id <id> --attempt "<what changed>"
```

After all intended Quest commits are landed, publish exactly the committed HEAD:

```sh
npm run publish
# if this exact push repairs the current red main:
npm run publish -- --fixes-red <origin-main-sha> --reason "<why>"
```

The publisher uses a clean temporary worktree, reuses the pre-push gate, verifies
the remote SHA, and writes a HEAD-bound receipt. It never stages, commits, amends,
force-pushes, or sweeps the caller's working tree.

## Before Verification Or Checkpoint

`land` owns the mechanical preflight and refuses before any commit when a
guard fails; `probe --id <id> --json` projects the quest state (probe, seal
delta, attempts since the last altitude check, recent entries) without
changing it.

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
