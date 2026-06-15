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

> **Canonical source.** Delegated worker policy for Quest attempts. Index:
> [`INDEX.md`](INDEX.md).

# Quest Delegation

## Delegation Model

Delegated agents are workers for one Quest attempt or one focused review.
Delegated agents do not decide whether the Quest is solved. The Solver decides that by
re-measuring `doneWhen` and the frontier metric.

## Worker Dossier

Every delegated worker should receive:

- Quest id and statement;
- selected frontier;
- current strategy rung;
- metric name and metric history;
- evidence paths from prior attempts;
- durable findings and ruled-out approaches;
- hard constraints.

The generic agent executor writes this dossier to `SOLVE_REQUEST_FILE` and
expects a response at `SOLVE_RESPONSE_FILE`.

## Worker Response

A worker response reports what changed:

```json
{"changeRef":"diff:path/to.patch","summary":"what changed","notes":"optional"}
```

The worker must not report `done: true` as proof. The Solver ignores such claims
and re-measures the Quest.

## Review Delegation

Use a review worker when the next attempt would benefit from a focused
freshness check. The review should return findings, candidate risks, or
suggested frontiers. Durable conclusions must be recorded with
`node tooling/solve.js finding` before they are relied on by later attempts.
