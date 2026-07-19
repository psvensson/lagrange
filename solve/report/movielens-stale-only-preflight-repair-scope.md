# Solve report: movielens-stale-only-preflight-repair-scope

**Goal:** A stale-only preflight snapshot refreshes the exact service_endpoints freshness evidence within its bounded wait, while topology, discovery, and replica-operation triggers retain their existing authoritative table scopes; the unchanged MovieLens live scenario maintains fresh schema-admission observations for the stability window and reports priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-observation-watermark-churn-consolidation
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Current Blocker
- Frontier: movielens-stale-only-preflight-repair-scope-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for movielens-stale-only-preflight-repair-scope-main

## Continuation
- Status: allowed
- Next action: continue supervised step for movielens-stale-only-preflight-repair-scope-main
- Blocker: none

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
- **movielens-stale-only-preflight-repair-scope-main** [open] rung 0, attempts 1, metric 1 -> 1

## Findings
- **movielens-stale-only-preflight-repair-scope-main**: DT red-on-revert proven for test/admin/admin-websocket-api-http-and-debug-routes.test.js [dt:solve/changes/dt-prove/admin-websocket-api-http-and-debug-routes.test.js-2026-07-19T10-58-21-871Z.json]
- **movielens-stale-only-preflight-repair-scope-main**: DT red-on-revert proven for test/admin/admin-websocket-api-http-and-debug-routes.test.js [dt:solve/changes/dt-prove/admin-websocket-api-http-and-debug-routes.test.js-2026-07-19T11-00-08-065Z.json]

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
