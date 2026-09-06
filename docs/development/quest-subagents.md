---
scope: governance
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-07-10
---

> **Canonical source.** Delegated worker policy for Quest attempts. Reached
> from the [`owner router`](../steering/router.md).

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

Additional attempt review is optional: use a review worker when the next attempt
would benefit from a focused freshness check. The review should return findings,
candidate risks, or suggested frontiers. This optional review does not replace
mandatory independent adversarial vetting before presenting a non-trivial
hypothesis or proposed lever, or content-bound verification before source
checkpoint or terminal handoff. Durable conclusions must be recorded with
`node scripts/solve.js note --finding` before they are relied on by later attempts.

## Verification Templates

Adversarial verification prompts (design vets, implementation verifiers) MUST
include every attack-surface checklist whose category matches the change from
[`verification-templates/`](verification-templates/INDEX.md),
filled in with the change's specifics. The templates pin the classic failure
modes per category (admission/gating, retry loops, transport delivery,
sweeps, recovery, concurrency, formation circularity, harness fidelity) with
closure-record anchors, so review quality does not depend on the prompt
author recalling each one. Every checklist item demands an evidence path;
items that pass review while their class ships twice get promoted to machine
checks or deleted.

Verification rounds MUST be category-complete: instruct the verifier to
enumerate every finding it can reach and group findings by category, never
stopping at the first defect. A rejection that names one defect per round
turns a bounded checklist into an unbounded sequence of full
attempt-verify cycles (measured: 11 single-finding rounds on one
diagnostics quest, 2026-07-27). Design vets SHOULD receive a design note
structured by
[`design-note-template.md`](verification-templates/design-note-template.md)
(cited consumed surfaces, typed failure edges, cached-view audit, identity
anchoring) and attack each section separately.

If independent-agent capability is unavailable at a mandatory boundary, do not
substitute self-review. Report the unavailable verification capability and stop
before presenting the hypothesis as vetted or handing source changes off.
