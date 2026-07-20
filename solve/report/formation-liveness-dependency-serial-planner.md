# Solve report: formation-liveness-dependency-serial-planner

**Goal:** nodes-p1 remains non-priority while one serial goal-state owner, given current owner-authored recovery-eligible quorum, transport, inventory, and source/leader evidence, emits at most one executable formation move per tick or progresses the existing transition; missing evidence emits none, ordinary placement remains fail-closed, only real heartbeat owners renew admission leases, and the unchanged MovieLens gate passes 5-of-5 formation probes followed by 3-of-3 full demos.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- spec: solve/epics/formation-complexity-consolidation.md
- parent quest: effective-placement-serial-priority-planner
- plan: solve/epics/formation-complexity-consolidation.md

## Scope Pressure
- Changed files: 16
- Change bytes: 46563
- Owner areas: scripts/run-formation-liveness-dependency-serial-planner-scenarios.js, src/bootstrap, src/rebalancer, test/bootstrap, test/rebalancer
- Categories: other, runtime
- Action: split by owner area before the next attempt (16 files)
- Action: land or separate 5 owner areas: scripts/run-formation-liveness-dependency-serial-planner-scenarios.js, src/bootstrap, src/rebalancer, test/bootstrap, test/rebalancer
- Split plan:
  - src/rebalancer: 7 file(s)
  - test/rebalancer: 4 file(s)
  - src/bootstrap: 2 file(s)
  - test/bootstrap: 2 file(s)
  - scripts/run-formation-liveness-dependency-serial-planner-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **formation-liveness-dependency-serial-planner-main** [parked {exhausted}] rung 1, attempts 1, metric 1 -> 1 — Current source passes 5-of-5 formation probes and reaches zero formation/spread residuals in the demo; the remaining measuring failure is delegated to the distinct per-table cache-version/observation owner, so another formation-planner attempt or unchanged live rerun would cross the sealed boundary.

## Findings
- **formation-liveness-dependency-serial-planner-main**: Inherited from movielens-nodes-priority-recovery-escape: broad NODES membership in the priority-control-plane set changed nodes-p1 from delayed planning to advance-now recovery but did not improve the live outcome. (rules out: Do not add NODES to PRIORITY_CONTROL_PLANE_TABLE_IDS or otherwise grant nodes-p1 the broad priorityControlPlane identity.) [solve/changes/movielens-nodes-priority-recovery-escape/live-ab-summary.json]
- **formation-liveness-dependency-serial-planner-main**: Inherited from independent aggregate rejection: the broad priority classification produced 3 and 4 final in-flight operations versus 2 and 2 reverted, 5622 versus 1711 level-50 events, and 344 versus 29 nodes-linked warnings. (rules out: Do not approve a deterministic engagement-only result; require controlled live A/B with no aggregate load amplification and meaningful outcome or sealed-milestone improvement.) [solve/changes/movielens-nodes-priority-recovery-escape/live-ab-summary.json]
- **formation-liveness-dependency-serial-planner-main**: Inherited ownership boundary: an authoritative snapshot reread may reveal node leases but cannot renew them; expired leases must continue to block schema admission until heartbeat owners durably advance nodes-p1. (rules out: Do not synthesize ready leases or ACTIVE status, treat observation as readiness, weaken cache_stale_watermark, widen live budgets, or speed retries to hide the dependency cycle.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T23-05-19-103Z.report.json]
- **formation-liveness-dependency-serial-planner-main**: Independent verifier AMEND verdict confirms a distinct formationLivenessDependency scoped to nodes-p1 is materially safer than broad priority classification, provided it is consumed only by the serial owner and matching topology/target admission seams and remains fail-closed on explicit owner-authored evidence. (rules out: Do not silently broaden the exhausted O3 seal; this structural successor owns the narrow non-priority cutover and its stronger deterministic and live A/B gates.) [subagent:verify_live_stale_watermark]
- **formation-liveness-dependency-serial-planner-main**: DT red-on-revert proven for test/rebalancer/formation-liveness-dependency-serial-planner.test.js [dt:solve/changes/dt-prove/formation-liveness-dependency-serial-planner.test.js-2026-07-19T23-27-57-766Z.json]
- **formation-liveness-dependency-serial-planner-main**: Deterministic aggregate is green except for the intentionally pending source-bound live gate; ordinary system and non-system controls, schema lease freshness, publication visibility, inventory, and model contracts pass. [report:test-output/reports/formation-liveness-dependency-serial-planner-2026-07-19T23-29-36-045Z.report.json]
- **formation-liveness-dependency-serial-planner-main**: DT red-on-revert proven for test/rebalancer/formation-liveness-dependency-serial-planner.test.js [dt:solve/changes/dt-prove/formation-liveness-dependency-serial-planner.test.js-2026-07-19T23-33-56-237Z.json]
- **formation-liveness-dependency-serial-planner-main**: Independent verification approved exact attempt-3 for controlled live validation: nodes-p1 remains nonpriority; formation liveness is owner-scoped and fails closed without explicit recovery eligibility; serial one-move planning, quorum, transport, inventory, source, leader, transition, lease, and non-leakage checks all passed. [subagent:verify_live_stale_watermark]
- **formation-liveness-dependency-serial-planner-main**: Independent aggregate verification approved exact attempt-3 to proceed to the unchanged five-probe gate: fixed advanced schema and preload 2/2 versus 0/2, matched level-50 events fell 47 versus 66, admission drained to zero in-flight, and the coarse nodes-warning increase was isolated to safety-preserving peer-alive quarantine skips without correlated transport, CDC-delivery, join failure, or non-drain; terminal closure remains unapproved. [subagent:verify_live_stale_watermark]
- **formation-liveness-dependency-serial-planner-main**: The sealed formation/schema symptom does not reproduce on checkpoint 0527723b: the unchanged thermally valid ordered gate passed 5-of-5 probes at stable source fingerprint 8a64ad4bd3d98636; every run formed five nodes, provisioned the ratings partition to NORMAL with a leader, harvested complete counters, and observed zero legacy formation-interlock deferrals. [test-output/reports/live-repetitions-probe-2026-07-20T00-40-34-842Z.summary.json]
- **formation-liveness-dependency-serial-planner-main**: The functional 5-of-5 probe result is not terminal safety clearance: immutable per-node logs exceeded the fixed A/B matched-window ACK-skip reference of 58 in probes 2, 4, and 5 (244, 162, 396), with level-50 transport/reconnect/CDC events present, so the verifier-defined stop/escalate condition fired and demos are paused pending independent temporal attribution. [solve/changes/formation-liveness-dependency-serial-planner/live-probe-gate-20260720/log-analysis.json]
- **formation-liveness-dependency-serial-planner-main**: Independent verifier approved the ordered three-demo gate after correcting the probe safety comparison: the prior escalation was a dimensional mismatch between an all-target probe numerator and a nodes-p1-only A/B threshold. Like-for-like pre-SIGTERM counts were nodes-p1 0,7,0,3,10 versus fixed max 58 and all-target 29,244,34,162,384 versus fixed max 806, so zero probes exceeded either reference. Seed event-loop pressure and CDC handler-registration errors remain real residual observations but were not amplified versus the fixed A/B and do not block this unchanged-source gate. (rules out: Do not classify a safety regression by comparing differently scoped counters; preserve seed event-loop capacity and message-group CDC-forward readiness as separately owned residual evidence without weakening CL-007.) [subagent:verify_live_stale_watermark]
- **formation-liveness-dependency-serial-planner-main**: Fresh measuring Demo 1 passed five-node formation, schema quiescence admission, 100,000-row ratings load, three-way partition spread, and the 1,682-row distributed grouped query, then moved red to runtime-service initial placement: operation 7bd8c0b7-c43f-4d16-8291-20e237312ffe remained CREATING while its exact target services row was ACTIVE. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T01-06-07-995Z.report.json]
- **formation-liveness-dependency-serial-planner-main**: The current-fingerprint ordered gate proves the formation planner surface engaged: 5-of-5 probes passed on e85b031c182c3041, then measuring demo slot 1 reached five-node formation, drained priority and total spread gaps to zero, and briefly accumulated 11 seconds of quiescence before the final 58 observations failed at the separate control-snapshot/cache freshness boundary (snapshot_query_error: cache_stale_watermark). (rules out: Do not rerun unchanged or modify formation planning, admission budgets, spread policy, or workload for this cache-observation recurrence; the structural successor is the already-drafted per-table-cache-version-consolidation slice.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T17-07-46-984Z.report.json]
- **formation-liveness-dependency-serial-planner-main**: Independent aggregate verification passed: exact source aggregate matches the reviewed current fingerprint, 11 focused guards / 431 assertions plus exact-path ESLint and diff checks are green, and terminal exhaustion honestly delegates the distinct cache_stale_watermark boundary without another unchanged formation rerun. [subagent:verify_formation_terminal_aggregate]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T23:36:18.656Z | formation-liveness-dependency-serial-planner-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-liveness-dependency-serial-planner/attempt-3.diff.json |
