---
scope: testing
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/testing.md
parent_index: ../testing-guidelines/INDEX.md
last_reviewed: 2026-07-10
---

> **Canonical source.** Scenario and release-gate Quest proof policy. Index:
> [`INDEX.md`](INDEX.md).

# Testing — Scenario And Release-Gate Quests

## Reference Scenario Policy

When a Quest exists because a distributed, integration, load, or scenario
failure must be resolved, the Quest must keep one named reference scenario or
probe as its `doneWhen`.

This does not conflict with the gate-last-resort policy: the reference scenario
is executed once, at closure, after the deterministic ladder is green — its role
is certification of the sealed `doneWhen`, not iteration.

Required workflow:

1. Keep one named reference scenario or blocker probe for the Quest.
2. Run focused owner tests before broad representative reruns.
3. If the reference scenario still fails after focused proof passes, record a
   finding that names the new dominant failure and owner boundary.
4. Do not claim SOLVED on local green proof alone while the reference scenario
   still fails for a different named reason.
5. If the Quest records repeated material blocker migrations, escalate by
   adding a model or architecture frontier instead of continuing local patches.
6. A scenario-driven Quest that changes runtime meaning, decision meaning, or
   shared reporting must prove the direct owner path and the consuming status,
   diagnostics, admin, harness, or report surface.

## Fixture Versus Runtime Proof

If a fixture or harness contract was wrong, fix it and prove why. If the fixture
contract was correct, the next attempt must target the runtime owner boundary
that now dominates.

Classification-only (accepting a finding without a runtime fix) is valid only
when the Quest records all of:

- the focused probe command;
- the evidence path;
- the bounded-progress proof or reason no local runtime patch should continue;
- the next frontier or terminal EXHAUSTED result.

## Representative Rerun Order

Use this order for scenario Quests:

1. focused owner test or probe;
2. static guardrail relevant to the touched owner boundary;
3. shared unit-only gate when the package manager or runner boundary requires
   it;
4. representative scenario rerun — **last resort only**, governed by the gate
   policy in the next paragraph (reach it only for an irreducibly-statistical
   claim, never as a routine step);
5. Solver step commit or autonomous loop report.

The expensive non-deterministic statistical gate (the docker rolling-restart
stat-gate and equivalent multi-run scenario reruns) is a last resort, reached
only after deterministic in-process proof: a fix is validated by a deterministic
reproduction that goes red on revert, not by a passing gate run, and a gate is
never the iteration loop. The gate policy itself is single-homed in
[`operational-ground-truth.md`](../operational-ground-truth.md) (per the
AGENTS.md single-canonical-home rule) — consult it before queuing any gate run
for: the admission criteria (the named irreducibly-statistical cases, including
hot failure-path aggregate A/B validation), the mandatory
`npm run analyze:latent-blockers` pre-gate step, the sealed-metric detail, and
the N calibration table (mechanistic N=3–4 / rate or variance N≥8 / sealed-bar
certification N≥15). This file only fixes the rerun-ladder ordering above; it
does not restate those criteria.

## Deterministic Proof Must Move the Binding Observable

A deterministic proof MUST move the real in-cluster binding observable that the
`doneWhen` is about — not merely the internal math or return value of the
mechanism the fix introduces. A unit test of your own new function cannot fail to
"engage"; passing it proves the function runs, not that the binding signal moved.

- Before spending a gate, split efficacy into two questions and answer the first
  deterministically and cheaply, below the gate: (a) does the lever move the
  binding in-cluster observable at all (deterministic, red-on-revert), and only
  then (b) does it lift the statistical metric (the gate's job).
- A lever that passes its own unit DT but never moves the real observable is NOT
  proven; do NOT advance it to a gate. Reproduce the observable deterministically
  in-process first.

## Delegated Review

When a delegated worker reviews a scenario Quest, it must compare current probe
evidence with the Quest's selected frontier and findings. The review should
produce candidate findings or risks; the Solver still owns terminal status.
