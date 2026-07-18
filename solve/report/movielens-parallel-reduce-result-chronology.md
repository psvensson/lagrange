# Solve report: movielens-parallel-reduce-result-chronology

**Goal:** The unchanged live MovieLens affinity scenario passes three consecutive fresh runs with a runtime-owner-published result-to-partial snapshot witness that remains valid while later periodic partial snapshots continue.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-three-way-affinity-demo
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-parallel-reduce-result-chronology-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json
- Selected theory: none
- Next move: continue supervised step for movielens-parallel-reduce-result-chronology-main
- No longer current: Do not revisit formation readiness, runtime replica creation, issuing-service identity, attribution publication/replication, placement scoring, result correctness, timeout widening, or freshness removal for this witness.

## Continuation
- Status: allowed
- Next action: continue supervised step for movielens-parallel-reduce-result-chronology-main
- Blocker: none

## Scope Pressure
- Changed files: 6
- Change bytes: 28495
- Owner areas: examples, src/runtime, test/runtime
- Categories: other, runtime, test
- Action: land or separate 3 owner areas: examples, src/runtime, test/runtime
- Split plan:
  - examples: 2 file(s)
  - src/runtime: 2 file(s)
  - test/runtime: 2 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-parallel-reduce-result-chronology-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **movielens-parallel-reduce-result-chronology-main**: inherited from movielens-three-way-affinity-demo: At checkpoint 719020ce the changed five-node milestone formed the cluster and the explicit closed-world REPLACE cohort engaged: replace-op-e1ef completed target activation and source removal, then left the authoritative ledger. The run still failed the sealed 180000ms pre-schema gate with two later priority-partition REPLACE rows in flight. The canonical publication had reported prioritySpreadPending=false continuously since 08:02:51Z, but partition rebalancer owners created replica_operations work at 08:04:39Z and sql_transaction_participants/sql_write_operations work at 08:05:07Z and 08:05:24Z. Report sha256=68f2edfc45c2bb9963f3e8b8e1f99eb41998a7ba701cda93399c17b584b73855; comparison sha256=6c791c2ef7b0f4c11e840351ca642bba5087d70bd3858edd4783f2a04cf1dbb3; immutable archive sha256=9b2835878e44db6120a15e19be29cf78ce916b2058e3c4377a2518dbcaf53913. No unchanged live rerun. (rules out: Treating the closed-world target bootstrap cohort as dormant or still blocked; attributing post-08:05:29Z shutdown connection errors as the cause; extending the sealed deadline or weakening quiescence.) [data/examples/service-data-affinity-demo-archive/wave4-live-replace-bootstrap-cohort-authority-2026-07-16T08-05-44-727Z.tar.gz]
- **movielens-parallel-reduce-result-chronology-main**: inherited from movielens-three-way-affinity-demo: Changed Wave4 engaged the terminal-hold repair twice: ledger self-move replace-op-691efb46c505c2053b80785456cab438 reached authoritative Operation completed at 12:20:58.605, the next ledger self-move replace-op-e1ef0ada4127812f28bfef5a314c48df reached authoritative Operation completed at 12:21:53.865, and the first dependent batch operation was created only at 12:21:54.081 (216ms later). The sealed run failed earlier than preload on a distinct cache_stale_watermark snapshot-observation blocker with totalSpreadGap=0, so the ledger lifecycle defect did not recur. Report sha256=2f3a3a7faff6afa97d1988b2961e3c4eea0e36383279cde3541bfd5ce95b51fd; immutable archive sha256=7f27943debfd6b59eaa919d35165d7c0ff37c32f4e113dbd8b577cbd1d11d74c. (rules out: Rules out premature terminal-hold release as the blocker in this run; do not widen timeouts or alter the live scenario.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]
- **movielens-parallel-reduce-result-chronology-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json]
- **movielens-parallel-reduce-result-chronology-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json]
- **movielens-parallel-reduce-result-chronology-main**: The sealed live symptom reproduces on the current source: formation and preload admit, two runtime replicas start, base-service attribution replicates, production-weighted locality is optimal, two current fresh bounded partials exist, and the stored top-10 exactly matches a fresh aggregate over all 100000 ratings; completion remains false only because slot 2's later periodic computed_at overtakes the already-published exact result, so resultFresh is false. (rules out: Do not revisit formation readiness, runtime replica creation, issuing-service identity, attribution publication/replication, placement scoring, result correctness, timeout widening, or freshness removal for this witness.) [solve/changes/movielens-parallel-reduce-result-chronology/live-2026-07-18-chronology-forensics.md]
- **movielens-parallel-reduce-result-chronology-main**: DT red-on-revert proven for test/runtime/sql-query-loop-parallel-reduce-sql.test.js [dt:solve/changes/dt-prove/sql-query-loop-parallel-reduce-sql.test.js-2026-07-18T14-28-33-916Z.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T14:34:25.234Z | movielens-parallel-reduce-result-chronology-main | observe | 1 -> 1 | flat | no_previous |  | diff:solve/changes/movielens-parallel-reduce-result-chronology/attempt-1.diff |
