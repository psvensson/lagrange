---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-07-10
---

> **Canonical source.** Quest lifecycle and first commands. Index:
> [`INDEX.md`](INDEX.md).

# Workflow Lifecycle

## Quest Lifecycle

Every non-trivial task follows this lifecycle:

1. **Author or select a Quest.** Use `node scripts/solve.js new --id <id>` when
   no existing Quest matches the requested outcome. The template writes
   `class: "product"` (a MEASURED goal); for a decision/scaffolding Quest that
   closes on a recorded decision rather than a measured artifact, edit the
   `class` field to `"process"` in the quest JSON right after `new`, before the
   first `run`/`step` (the field is consumed by the closure-kind and portfolio
   machinery).
2. **Seal the goal.** Define `doneWhen` before implementation begins. The goal
   is sealed at the first `run` or `step` invocation — the first Solver
   declaration; before that, the quest file is a refinable draft.
3. **Default to autonomous execution.** Run
   `run --executor agent --yes --keep-alive` for non-trivial work — drive to a true
   terminal without pausing (see core.md "Default Posture: Autonomy"). Reach for
   supervised `step` only for human-paced or exploratory work; mode selection is not
   a free choice for routine non-trivial work.
4. **Measure before and after.** Attempts are valid only when the Solver can
   re-measure the configured frontier metric.
5. **Record findings.** Use `node scripts/solve.js finding` for durable
   knowledge or ruled-out approaches.
6. **Close through the report.** Use `node scripts/solve.js report --id <id>`;
   closure is SOLVED or EXHAUSTED.

## First Commands

For a new implementation task, default to an autonomous, self-resuming run:

```sh
node scripts/solve.js new --id <id> --statement "<sealed result>"
node scripts/solve.js run --id <id> --executor agent --yes --keep-alive
```

For human-paced or exploratory work, drive it step by step:

```sh
node scripts/solve.js step --id <id>
```

For an existing Quest:

```sh
node scripts/solve.js status --id <id>
node scripts/solve.js run --id <id> --executor agent --yes --keep-alive
```

## Progress Grammar

Use the Solver vocabulary in handoffs and final reports:

- `attempt(frontier, before -> after)` when one measured attempt is recorded;
- `progress(frontier)` when the metric decreases honestly;
- `stall(frontier)` when the metric does not move;
- `climb(frontier, rung)` when a stall escalates the strategy ladder;
- `park(frontier)` when a frontier has no honest remaining local move;
- `solved(quest)` when `doneWhen` is satisfied;
- `exhausted(quest)` when every frontier is parked **as `exhausted`** (a
  `cannot_measure` park keeps the quest open).
