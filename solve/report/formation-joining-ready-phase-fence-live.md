# Solve report: formation-joining-ready-phase-fence-live

**Goal:** One unchanged fresh movielens-lagrange-service-affinity-live run reports priority metric 0; every JOINING node, including READY with fresh liveness, remains absent from generic serving, locally eligible, published-active, required-ack, and remove-safety membership, while an explicitly recovery-eligible reachable JOINING node can receive only priority control-plane formation placement until activation.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-joining-ready-phase-fence
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: formation-joining-ready-phase-fence-live-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: unknown: PASS -> FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T19-03-43-610Z.report.json
- Selected theory: none
- Next move: continue supervised step for formation-joining-ready-phase-fence-live-main
- No longer current: PASS

## Continuation
- Status: allowed
- Next action: continue supervised step for formation-joining-ready-phase-fence-live-main
- Blocker: none

## Scope Pressure
- Changed files: 11
- Change bytes: 35497
- Owner areas: src/bootstrap, src/control-plane, test/bootstrap, test/control-plane, test/rebalancer
- Categories: runtime, test
- Action: split by owner area before the next attempt (11 files)
- Action: land or separate 5 owner areas: src/bootstrap, src/control-plane, test/bootstrap, test/control-plane, test/rebalancer
- Split plan:
  - src/control-plane: 7 file(s)
  - src/bootstrap: 1 file(s)
  - test/bootstrap: 1 file(s)
  - test/control-plane: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **formation-joining-ready-phase-fence-live-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **formation-joining-ready-phase-fence-live-main**: inherited from formation-joining-ready-phase-fence: inherited from formation-schema-operation-collision-leader-read-closure: The cold-formation barrier withholds only the final ready lease: node registration publishes nodes.status=active earlier, and the unchanged MovieLens scenario starts schema admission after counting those active rows. In the failed run the ledger barrier and priority operations continued after that clock began, so eventual zero spread at T+164 left only about 16 seconds for an unchanged 60-second stability condition. Planner-only reordering and timeout increases are ruled out; the missing contract is a canonical placement-ready or available phase between recovery-eligible registration and schema admission. (rules out: planner-only reordering; timeout increases; treating nodes.status=active as placement-ready) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T07-27-39-737Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: DT red-on-revert proven for test/rebalancer/startup-authority-available-node-contract.test.js [dt:solve/changes/dt-prove/startup-authority-available-node-contract.test.js-2026-07-18T08-45-20-355Z.json]
- **formation-joining-ready-phase-fence-live-main**: Independent verification passed [subagent:formation_barrier_verifier]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Fresh unchanged live run confirms the JOINING formation repair engages and cluster formation completes, then fails downstream because the background release clock matures from priority-spread clear while four schema-provisioning operations remain in flight; ordinary work releases after only 11.481s of full operation drain, before the unchanged 60s schema-admission window. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T14-48-39-104Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T14-48-39-104Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Learned-affinity attribution stall ROOT-CAUSED and fixed: the node-local authoritative system-table read (cdc-integration-service-authoritative-read-flow.js mergeAuthoritativeSystemTableRowSets) merges per-replica row sets KEYED BY THE PRIMARY KEY and silently drops any row whose key field is absent - so every system-table SELECT that does not project the pk under its own name returns a successful EMPTY result. The demo probe (SELECT node_id, service_id, access_json, published_at FROM service_partition_access - no access_id) therefore read 0 rows forever while attribution rows demonstrably landed and replicated (verified in all replica DBs of run 16-43-20). Reproduced on a single seed node in 2 minutes: INSERT succeeds, pk-projecting SELECT returns the row, pk-less projection returns []. Same-shape latent wrongness for ANY pk-less system-table projection (including aggregates). Fix: the local authoritative fast path (tryExecuteAuthoritativeSystemTableSelect) now requires the projection to carry the pk unaliased, or a bounded pk-lookup (whose empty local reads are already owner-confirmed); everything else takes the routed execution path. Guard tests added (pk-less projection routes and returns rows; aliased pk bypasses; star keeps the fast path). Repro after fix: pk-less scan returns the row. This is another instance of the epic's F4 hand-re-enumeration drop class, on the read-merge side. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T16-43-20-162Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T17-40-24-737Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T17-40-24-737Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T17-49-37-367Z.report.json. Metric: 1 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T17-49-37-367Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T17-49-37-367Z.report.json. Metric: 1 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T17-49-37-367Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: First fully-PASSING movielens-lagrange-service-affinity-live run of 2026-07-18 (report 17-49-37): schema admission admitted (stableElapsedMs 64820), 100k ratings loaded and spread, Lagrange distributed SQL 288ms, parallel reduce correct, and the learned-affinity phase - stalled at weightedLocality 0.000 with attributionRows=0 for 300s on every prior run - converged to weightedLocality=1 with resultCorrect=true in 31.4s. Confirms the pk-projection read fix live (commit after 0e21d387): the attribution probe can now see service_partition_access rows. Stack under test also included the flagless admission cutover and the DDL default-literal fix. The spread-gap rotation residual did NOT occur this run (it remains an intermittent formation-phase residual, evidence 17-40-24). [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T17-49-37-367Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T19-03-43-610Z.report.json. Metric: 0 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T19-03-43-610Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T19-03-43-610Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T19-03-43-610Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T08:49:36.209Z | formation-joining-ready-phase-fence-live-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-joining-ready-phase-fence-live/attempt-1.diff |
