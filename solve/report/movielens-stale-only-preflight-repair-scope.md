# Solve report: movielens-stale-only-preflight-repair-scope

**Goal:** A stale-only preflight snapshot refreshes the exact service_endpoints freshness evidence within its bounded wait, while topology, discovery, and replica-operation triggers retain their existing authoritative table scopes; the unchanged MovieLens live scenario maintains fresh schema-admission observations for the stability window and reports priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-observation-watermark-churn-consolidation
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 5
- Change bytes: 6899
- Owner areas: src/admin, test/admin
- Categories: runtime, test
- Split plan:
  - src/admin: 3 file(s)
  - test/admin: 2 file(s)
- Signals: none

## Frontiers
- **movielens-stale-only-preflight-repair-scope-main** [parked {exhausted}] rung 0, attempts 1, metric 1 -> 1 — The sealed stale-watermark symptom is absent on fresh HEAD evidence and the remaining live failure is a distinct post-load operation-workflow/priority-spread boundary; another in-scope stale-preflight move does not exist, and the binding residual-child budget requires the O3 structural pivot.

## Findings
- **movielens-stale-only-preflight-repair-scope-main**: DT red-on-revert proven for test/admin/admin-websocket-api-http-and-debug-routes.test.js [dt:solve/changes/dt-prove/admin-websocket-api-http-and-debug-routes.test.js-2026-07-19T10-58-21-871Z.json]
- **movielens-stale-only-preflight-repair-scope-main**: DT red-on-revert proven for test/admin/admin-websocket-api-http-and-debug-routes.test.js [dt:solve/changes/dt-prove/admin-websocket-api-http-and-debug-routes.test.js-2026-07-19T11-00-08-065Z.json]
- **movielens-stale-only-preflight-repair-scope-main**: Independent verification passed: exact stale-only service_endpoints scope, forced and compound broad scopes, bounded preflight behavior, and canonical observation safety; 4 files / 330 assertions. [subagent:verify_stale_preflight_attempt]
- **movielens-stale-only-preflight-repair-scope-main**: At the Quest's drafted head 99dc5534, the unchanged live scenario reproduced the sealed stale-only preflight failure: priority spread was zero and topology stability held, yet schema admission remained stale_usable/cache_stale_watermark; attempt 1's red-on-revert DT isolates the same default nine-table repair scope mechanism. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T10-30-41-823Z.report.json]
- **movielens-stale-only-preflight-repair-scope-main**: The 2026-07-19T12:21:27.140Z fresh five-node live run cleared cache_stale_watermark and held quiescent schema admission for 65,337 ms with total/priority spread gap 0, then failed later during initial service-placement polling after schema_operations-p1 entered a REMOVE workflow with two ready replicas and priority_spread_pending. The sealed stale-preflight boundary moved; the remaining metric=1 belongs to post-load operation-workflow/priority-recovery behavior and consumes the epic's final residual-child budget. (rules out: Another unchanged live rerun or stale-only preflight repair as an honest next move; another instance-level residual child Quest under the binding formation-complexity stopping rule.) [solve/changes/movielens-stale-only-preflight-repair-scope/post-attempt-1-live-boundary-2026-07-19.md]
- **movielens-stale-only-preflight-repair-scope-main**: Independent aggregate verification approved terminal exhaustion: stale-only preflight repair was mechanism-bound, the stale watermark symptom cleared live, and the distinct later REMOVE/priority-spread boundary was routed without claiming demo success. [subagent:verify_stale_scope_aggregate]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T11:04:59.603Z | movielens-stale-only-preflight-repair-scope-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-stale-only-preflight-repair-scope/attempt-1.diff |
