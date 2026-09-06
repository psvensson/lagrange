---
scope: governance
status: reference-only
always_load: false
source_of_truth: self
last_reviewed: 2026-07-13
---

> **Reference-only summary.** The entry point is [`AGENTS.md`](../../AGENTS.md)
> and the binding operating contract lives in
> [`solver-quests.md`](../steering/workflow-guidelines/solver-quests.md). This
> page is retained for vocabulary and defines no independent command path.

# Workflow Lifecycle

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
