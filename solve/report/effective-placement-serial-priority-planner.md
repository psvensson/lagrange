# Solve report: effective-placement-serial-priority-planner

**Goal:** Every priority control-plane partition is planned from one immutable EffectivePlacement built from the canonical replica inventory and target topology. One serial goal-state owner emits at most one new move per partition tick, or none while an existing transition needs progress, using the precedence failed-replica REMOVE, true-deficit ADD, spread-restoring ADD, monotonic-safe surplus REMOVE, then count-neutral REPLACE. Existing classifiers and admission valves consume that decision until the fixed live gate passes; superseded priority-only parallel candidate and classifier branches are then deleted.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- spec: solve/epics/formation-complexity-consolidation.md
- plan: solve/epics/convergence-loop-and-workflow-overhead.md

## Scope Pressure
- Changed files: 9
- Change bytes: 46109
- Owner areas: architecture, scripts/run-effective-placement-serial-priority-planner-scenarios.js, scripts/run-live-repetitions.js, src/rebalancer, test/rebalancer, test/scripts
- Categories: docs, other, runtime, test
- Action: land or separate 6 owner areas: architecture, scripts/run-effective-placement-serial-priority-planner-scenarios.js, scripts/run-live-repetitions.js, src/rebalancer, test/rebalancer, test/scripts
- Split plan:
  - src/rebalancer: 2 file(s)
  - test/rebalancer: 2 file(s)
  - test/scripts: 2 file(s)
  - architecture: 1 file(s)
  - scripts/run-effective-placement-serial-priority-planner-scenarios.js: 1 file(s)
  - scripts/run-live-repetitions.js: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **effective-placement-serial-priority-planner-main** [parked {exhausted}] rung 1, attempts 1, metric 1 -> 1 — The priority-only serial planner's sealed symptom is absent on current HEAD and its 5/5 probe rung is green; the first measuring demo red occurs only at non-priority nodes-p1, which the sealed priority-only constraint excludes. Any further in-quest source change would move the goalposts, so the remaining formation-liveness dependency is delegated to a bounded structural successor.

## Findings
- **effective-placement-serial-priority-planner-main**: DT red-on-revert proven for test/rebalancer/effective-placement-serial-priority-planner.test.js [dt:solve/changes/dt-prove/effective-placement-serial-priority-planner.test.js-2026-07-19T12-37-34-425Z.json]
- **effective-placement-serial-priority-planner-main**: DT red-on-revert proven for test/rebalancer/effective-placement-serial-priority-planner.test.js [dt:solve/changes/dt-prove/effective-placement-serial-priority-planner.test.js-2026-07-19T12-50-59-896Z.json]
- **effective-placement-serial-priority-planner-main**: Independent exact-attempt verification approved immutable EffectivePlacement, priority-only serial selection, preserved policy/admission safety, exact REMOVE residual coverage, mechanism binding, and fail-closed source-bound live closure. [subagent:verify_effective_placement_attempt]
- **effective-placement-serial-priority-planner-main**: Committed source fingerprint f2d0d5fd6bd209b5 passed the fixed formation-probe rung 5-of-5 with no thermal exclusions; all five reached READY within unchanged budgets, while probe-only evidence correctly leaves the terminal priority item open until the ordered 3-of-3 full-demo rung. [test-output/reports/live-repetitions-probe-2026-07-19T13-11-39-932Z.summary.json]
- **effective-placement-serial-priority-planner-main**: The ordered cool full-demo rung stopped on measuring slot 1 at committed source fingerprint f2d0d5fd6bd209b5: formation had already passed 5-of-5, schema admission was quiescent for 62596ms with priority/total spread gap 0, preload/load-lane admission passed, and 33500 ratings committed before a later managed-split-adjacent Query timeout after 15000ms. This does not reproduce the pre-load priority-placement defect and blocks terminal closure at the existing write-path-internal-pacing owner boundary; no unchanged rerun was made. (rules out: Do not change EffectivePlacement precedence, priority admission, live budgets, loader batch size, workload, or client retry from this later-boundary witness.) [solve/changes/write-path-internal-pacing/live-2026-07-19-ratings-split-load-timeout.md]
- **effective-placement-serial-priority-planner-main**: The sealed priority-planner residual does not reproduce on current HEAD: the source-stable ordered gate passed 5-of-5 formation probes, and full-demo slot 1 reached prioritySpreadGap=0 with no priority residual witness before failing on owner-authored nodes ready-lease expiry (cache_stale_watermark), outside the sealed priority-only cutover. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T23-05-19-103Z.report.json]
- **effective-placement-serial-priority-planner-main**: Ordered live confirmation measured 5/5 probes green on source fingerprint c932781c41a19486, then stopped at thermally valid demo slot 1 red on the unchanged source; the demo failure was cache_stale_watermark after priority and total spread gaps reached zero, so the next owner boundary is the nodes-p1 ready-lease liveness dependency rather than the priority serial planner. [test-output/reports/live-repetitions-demo-2026-07-19T23-05-19-260Z.summary.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T12:58:00.257Z | effective-placement-serial-priority-planner-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/effective-placement-serial-priority-planner/attempt-1.diff |
