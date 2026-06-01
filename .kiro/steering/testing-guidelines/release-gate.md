---
scope: testing
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/testing.md
parent_index: ../testing-guidelines/INDEX.md
last_reviewed: 2026-06-01
---

> **Canonical source.** Scenario and release-gate Quest proof policy. Index:
> [`INDEX.md`](INDEX.md).

# Testing — Scenario And Release-Gate Quests

## Reference Scenario Policy

When a Quest exists because a distributed, integration, load, or scenario
failure must be resolved, the Quest must keep one named reference scenario or
probe as its `doneWhen`.

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

Classification-only is valid only when the Quest records:

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
4. representative scenario rerun;
5. Solver step commit or autonomous loop report.

## Delegated Review

When a delegated worker reviews a scenario Quest, it must compare current probe
evidence with the Quest's selected frontier and findings. The review should
produce candidate findings or risks; the Solver still owns terminal status.
