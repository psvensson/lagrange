---
scope: governance
status: reference-only
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-07-13
---

> **Reference-only summary.** The executable boot sequence lives in
> [`docs/steering/llm/boot.md`](../llm/boot.md), and the binding operating
> contract lives in [`solver-quests.md`](solver-quests.md). This page is retained
> for historical vocabulary and does not define an independent command path.

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
