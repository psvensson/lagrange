---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-06-01
---

> **Canonical source.** Quest lifecycle and first commands. Index:
> [`INDEX.md`](INDEX.md).

# Workflow Lifecycle

## Quest Lifecycle

Every non-trivial task follows this lifecycle:

1. **Author or select a Quest.** Use `node scripts/solve.js new --id <id>` when
   no existing Quest matches the requested outcome.
2. **Seal the goal.** Define `doneWhen` before implementation begins. Do not
   change it after the first attempt has been recorded.
3. **Pick the execution mode.** Use supervised `step` for human-paced work and
   `run --executor agent --yes` for autonomous work.
4. **Measure before and after.** Attempts are valid only when the Solver can
   re-measure the configured frontier metric.
5. **Record findings.** Use `node scripts/solve.js finding` for durable
   knowledge or ruled-out approaches.
6. **Close through the report.** Use `node scripts/solve.js report --id <id>`;
   closure is SOLVED or EXHAUSTED.

## First Commands

For a new implementation task:

```sh
node scripts/solve.js new --id <id> --statement "<sealed result>"
node scripts/solve.js step --id <id>
```

For an existing Quest:

```sh
node scripts/solve.js status --id <id>
node scripts/solve.js step --id <id>
```

For an autonomous run:

```sh
node scripts/solve.js run --id <id> --executor agent --yes --max 20
```

## Progress Grammar

Use the Solver vocabulary in handoffs and final reports:

- `attempt(frontier, before -> after)` when one measured attempt is recorded;
- `progress(frontier)` when the metric decreases honestly;
- `stall(frontier)` when the metric does not move;
- `climb(frontier, rung)` when a stall escalates the strategy ladder;
- `park(frontier)` when a frontier has no honest remaining local move;
- `solved(quest)` when `doneWhen` is satisfied;
- `exhausted(quest)` when every frontier is parked.
