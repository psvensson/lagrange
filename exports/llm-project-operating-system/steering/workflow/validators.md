---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: steering/packs/governance.md
parent_index: ../workflow/INDEX.md
last_reviewed: 2026-06-01
---

> Method kernel — portable. Keep the mechanism; this file is domain-neutral.

> **Canonical source.** Quest validation and honesty policy. Index:
> [`INDEX.md`](INDEX.md).

# Workflow Validators

## Probe-Owned Truth

The Solver never trusts an agent's claim that work succeeded. It trusts only
probe output collected after the attempt.

Required validation:

1. `doneWhen` is evaluated by a real probe.
2. Frontier metrics are evaluated by real probes.
3. The post-attempt metric is finite when progress is claimed.
4. The configured metric direction is lower-is-better.
5. The attempt `changeRef` resolves to an existing `diff:<path>` artifact.

## Goalpost Immutability

The first Solver declaration seals:

- `doneWhen`;
- each frontier id;
- each frontier metric.

Later attempts must use the same sealed goalposts. If the desired result
changes, stop the current Quest as EXHAUSTED or author a new Quest.

## Report Projection

`node tooling/solve.js report --id <id>` is a projection over the append-only
event log. The report projection must not invent terminal status, synthetic
attempts, or unmeasured progress.

SOLVED requires live `doneWhen` evidence. EXHAUSTED requires every frontier to
be parked by the finite strategy ladder.
