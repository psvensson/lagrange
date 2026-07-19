# Solve report: schema-admission-canonical-drain-handoff

**Goal:** When the immediately preceding authoritative schema-admission observation is blocked only by coordinator-owned topology work while priority topology is ready, the unchanged MovieLens scenario completes two fresh 60000ms schema confirmations before the existing 70000ms ordinary-release boundary, without backdating across any other blocker, and three consecutive fresh live runs report priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 2

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-background-release-quiescence-anchor-live
- plan: solve/epics/topology-convergence-hardening.md

## Scope Pressure
- Changed files: 6
- Change bytes: 29806
- Owner areas: examples, src/rebalancer, test/runtime
- Categories: other, runtime, test
- Action: land or separate 3 owner areas: examples, src/rebalancer, test/runtime
- Split plan:
  - src/rebalancer: 3 file(s)
  - examples: 2 file(s)
  - test/runtime: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **schema-admission-canonical-drain-handoff-main** [parked {exhausted}] rung 0, attempts 2, metric 1 -> 1 — The sealed schema drain-anchor contract is fixed, independently verified, checkpointed, and live-green; fresh stopped-state evidence moved the blocker to lost runtime services projection after routed write failures, requiring a bounded successor Quest owned by runtime lifecycle projection.

## Findings
- **schema-admission-canonical-drain-handoff-main**: inherited from formation-background-release-quiescence-anchor-live: The fresh source-stable run proves the active ordinary-release fence matured from the 14:11:29.378 topology-drain anchor and released at 14:12:39.905, while schema admission had not completed its independent quiet proof; the two maturity clocks can diverge. (rules out: a wedged package_registry_overrides repair ADD, the effective-placement serial priority planner, or split-snapshot pacing as the cause of this schema-admission miss) [solve/changes/formation-background-release-quiescence-anchor-live/post-attempt-3-live-boundary-2026-07-19.md]
- **schema-admission-canonical-drain-handoff-main**: inherited from formation-background-release-quiescence-anchor-live: Fresh source-stable transition history falsifies the earlier run-specific green-clock conclusion: canonical topology drain was 1784479343800, schema stability started 6673ms later, its first confirmation landed at drain+69134ms, and ordinary REPLACE creation began at drain+70030ms before the second confirmation. (rules out: Do not treat the earlier single green schema run as proof that the competing-clock boundary is permanently closed; the retained history now reproduces it with exact shared-drain lineage.) [solve/changes/formation-background-release-quiescence-anchor-live/post-attempt-5-live-schema-drain-anchor-recurrence-2026-07-19.md]
- **schema-admission-canonical-drain-handoff-main**: inherited from formation-background-release-quiescence-anchor-live: Live-refutation two-strikes reached: the earlier measured clock divergence and the fresh retained-history recurrence both show the fixed 70000ms release can precede the second schema confirmation when the observer clock starts later than the canonical drain; attempt 6 was aborted and the framing must move to the shared drain-anchor boundary. (rules out: No further patch or unchanged rerun belongs in formation-background-release-quiescence-anchor-live.) [solve/changes/formation-background-release-quiescence-anchor-live/post-attempt-5-live-schema-drain-anchor-recurrence-2026-07-19.md]
- **schema-admission-canonical-drain-handoff-main**: The sealed symptom reproduced on draftedAtCommit 573b747f08975cb1e760446524e73ef996a68d5c: source fingerprint b12a04460aa4e331 remained stable, the ordered 5/5 formation gate passed, and the first full run failed when ordinary REPLACE work released between schema confirmations from the same retained drain lineage. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T16-44-58-388Z.report.json]
- **schema-admission-canonical-drain-handoff-main**: DT red-on-revert proven for test/runtime/movielens-preload-admission-gate.test.js [dt:solve/changes/dt-prove/movielens-preload-admission-gate.test.js-2026-07-19T17-02-38-196Z.json]
- **schema-admission-canonical-drain-handoff-main**: DT red-on-revert proven for test/runtime/movielens-preload-admission-gate.test.js [dt:solve/changes/dt-prove/movielens-preload-admission-gate.test.js-2026-07-19T17-02-49-048Z.json]
- **schema-admission-canonical-drain-handoff-main**: Independent verification rejected this exact attempt [subagent:verify_schema_drain_handoff]
- **schema-admission-canonical-drain-handoff-main**: DT red-on-revert proven for test/runtime/movielens-preload-admission-gate.test.js [dt:solve/changes/dt-prove/movielens-preload-admission-gate.test.js-2026-07-19T17-12-57-996Z.json]
- **schema-admission-canonical-drain-handoff-main**: Independent verification passed [subagent:verify_schema_drain_handoff]
- **schema-admission-canonical-drain-handoff-main**: Fresh ordered source-stable Demo 1 passed the sealed schema drain-anchor boundary with two confirmations at retained drain+60770ms and +63628ms, then failed later because runtime replica r2 spent 30141ms and 35410ms on swallowed services-projection failures; its source operation timed out CREATING 3819ms before local ACTIVE completion and no r2 services row was retained. (rules out: schema drain-anchor recurrence, missing runtime ADD creation, missing local runtime activation, expired-lease ordinary candidate admission, and pre-terminal remote ACTIVE handoff classification) [file:solve/changes/schema-admission-canonical-drain-handoff/post-attempt-2-live-runtime-projection-loss-2026-07-19.md]
- **schema-admission-canonical-drain-handoff-main**: Independent verification passed [subagent:verify_schema_drain_handoff]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T17:01:51.470Z | schema-admission-canonical-drain-handoff-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/schema-admission-canonical-drain-handoff/attempt-1.diff |
| 2026-07-19T17:12:23.958Z | schema-admission-canonical-drain-handoff-main | observe | 1 -> 1 | flat | no_previous |  | diff:solve/changes/schema-admission-canonical-drain-handoff/attempt-2.diff |
