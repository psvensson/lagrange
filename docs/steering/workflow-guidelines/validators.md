---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-07-10
---

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

The first declaration happens at the first `run`/`step` begin, not at `new` —
until then the quest file is a refinable draft.

Later attempts must use the same sealed goalposts. If the desired result
changes, stop the current Quest as EXHAUSTED or author a new Quest.

One sanctioned exception: a frontier metric may be sharpened to a strictly
harder gradient from `GRADIENT_REFINEMENT_METRICS` (e.g. `priority` →
`distance`) without violating the seal, provided the probe and every other
metric arg stay byte-identical and `doneWhen` is untouched — see
solver-quests.md "Gradient refinement of the sealed metric".

## Report Projection

`node scripts/solve.js report --id <id>` is a projection over the append-only
event log. The report projection must not invent terminal status, synthetic
attempts, or unmeasured progress.

SOLVED requires live `doneWhen` evidence. EXHAUSTED requires every frontier to
be parked as `exhausted` — either by the finite strategy ladder (measured — at
least one honestly-measured sample) or by a recorded operator decision
(`provenance: operator`, requiring a prior altitude reflection and a reason;
see solver-quests.md "Operator park").
