# Solve report: formation-release-priority-observation-owner

**Goal:** Every node's shared formation-release owner is armed by authoritative priority-placement blocking observed by a priority planning leader even when no ordinary entity evaluates before clear; priority partitions remain undeferred, a late first ordinary evaluation waits the existing post-drain stability contract, and the unchanged MovieLens scenario completes initial schema admission before background placement resumes.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 2

## Links
- spec: solve/epics/formation-complexity-consolidation.md
- parent quest: formation-background-release-owner-closure
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: formation-release-priority-observation-owner-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: observation_gap
- Movement: unknown: PASS -> FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T09-46-30-107Z.report.json
- Selected theory: none
- Next move: continue supervised step for formation-release-priority-observation-owner-main
- No longer current: PASS; formation-release timing, early ordinary-work admission, in-flight drain, host scheduling, changed workload or timeouts

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 3
- Change bytes: 11030
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 2 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **formation-release-priority-observation-owner-main** [parked {exhausted}] rung 0, attempts 2, metric 1 -> 1 — The sealed release-observation mechanism is proven repaired, while the only permitted changed MovieLens run stopped on a distinct stale cache-local ledger placement decision at another owner; observation-owner-only forbids that repair and single-changed-live-run forbids another measurement on unchanged bytes, so no honest in-scope attempt remains.

## Findings
- **formation-release-priority-observation-owner-main**: Production planning methods reproduce the live missed-observation chronology: a priority leader remains correctly undeferred while its publication snapshot reports one ready node and spread gap two, but it does not arm the shared release owner; when spread clears before any ordinary entity evaluates, the late ordinary evaluation returns no blocker instead of the existing stabilizing state. The focused suite is red only on the two new late-observer assertions. [test/rebalancer/unified-rebalancer-planning-gate-decisions-test-cases.js]
- **formation-release-priority-observation-owner-main**: DT red-on-revert proven for test/rebalancer/unified-rebalancer.test.js [dt:solve/changes/dt-prove/unified-rebalancer.test.js-2026-07-21T11-33-12-250Z.json]
- **formation-release-priority-observation-owner-main**: Fresh MovieLens run 2026-07-21T11:10:14Z engaged the changed production seam: node-0 convergence snapshots reported prioritySpreadPending=false while actual priority placement was still concentrated; priority partition rebalancers were active before the first ordinary module_manifests-p1 REPLACE at 11:07:28.724Z, but no shared stability-hold diagnostic preceded it. The current-placement overlay in getControlPlanePrioritySpreadBlocker is therefore the authoritative evidence source, and resolvePrioritySpreadPlanningGateDecision is the path that must arm the existing release owner. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T11-10-14-468Z.report.json]
- **formation-release-priority-observation-owner-main**: independent verification rejected malformed publication evidence: an empty planning answer can fall back to local nodes, fabricate a blocker, and arm the shared release owner [subagent:verify_formation_release_owner]
- **formation-release-priority-observation-owner-main**: DT red-on-revert proven for test/rebalancer/unified-rebalancer.test.js [dt:solve/changes/dt-prove/unified-rebalancer.test.js-2026-07-21T11-42-16-666Z.json]
- **formation-release-priority-observation-owner-main**: independent verification passed: corrected attempt fails closed on absent or malformed published-node arrays, preserves explicit-empty constraints and owner isolation, and leaves priority no-deferral plus all timers and policies unchanged [subagent:verify_formation_release_owner]
- **formation-release-priority-observation-owner-main**: Checkpoint e470166b passed the single five-node local formation/schema probe: 5/5 formed in 24937ms, ratings CREATE succeeded first attempt in 2579ms, the partition became ready in 24ms, and all tracked deferral counters were zero. [solve/report/formation-probe-runs.ndjson]
- **formation-release-priority-observation-owner-main**: The single changed full MovieLens run moved past the sealed formation-release failure mode: no early ordinary REPLACE storm occurred, priority placement drained to one sql_write_operations-p1 gap with zero in-flight operations, and the gap then persisted for about 150s. Node-2 repeatedly evaluated replica_operations-p1 as three voters all on seed and rejected the final sql_write_operations ADD with operation_ledger_quorum_concentrated, while the canonical seed diagnostics observed replica_operations-p1 already spread. The remaining blocker is therefore cross-node stale services-placement evidence at the ledger quorum admission owner, outside this Quest's observation-owner-only scope. (rules out: formation-release timing, early ordinary-work admission, in-flight drain, host scheduling, changed workload or timeouts) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T11-50-15-031Z.report.json]
- **formation-release-priority-observation-owner-main**: independent aggregate verification passed: exact current bytes match the terminal fingerprint; fail-closed publication evidence, explicit-empty membership semantics, priority no-deferral, owner isolation, and unchanged timing/policy constraints all hold; 397 focused and adjacent assertions plus lint, preflight, grammar, and boundary checks passed [subagent:verify_formation_release_aggregate]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-21T11:35:23.497Z | formation-release-priority-observation-owner-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-release-priority-observation-owner/attempt-1.diff |
| 2026-07-21T11:42:24.673Z | formation-release-priority-observation-owner-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-release-priority-observation-owner/attempt-2.diff |
