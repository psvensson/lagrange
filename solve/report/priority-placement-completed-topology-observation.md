# Solve report: priority-placement-completed-topology-observation

**Goal:** Completed ADD and REPLACE topology for priority control-plane partitions is reflected by the current priority-placement observation: every authoritative ACTIVE voter-ready replica counts exactly once, removed or superseded rows do not count, canonical leader coverage matches partition leader ownership, the unchanged MovieLens schema admission reaches admitted, a deterministic production-path guard is red on revert, and three consecutive fresh live MovieLens runs report priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/priority-placement-completed-topology-observation-2026-07-19T22-45-59-502Z.report.json

**Attempts:** 1

## Links
- parent quest: runtime-replica-state-projection-retained-reconcile-integrity-reseal
- plan: solve/epics/topology-convergence-hardening.md

## Scope Pressure
- Changed files: 3
- Change bytes: 9994
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/partition, test/partition
- Categories: other, runtime, test
- Action: land or separate 3 owner areas: scripts/run-placement-affinity-scenarios.js, src/partition, test/partition
- Split plan:
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - src/partition: 1 file(s)
  - test/partition: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **priority-placement-completed-topology-observation-main** [open] rung 1, attempts 1, metric 0 -> 0 — fresh measured evidence no longer satisfies frontier

## Findings
- **priority-placement-completed-topology-observation-main**: inherited from runtime-replica-state-projection-retained-reconcile-integrity-reseal: The sealed retained-projection loss does not reproduce on checkpoint cc95da34: authoritative services rows for completed schema_operations, sql_transaction_participants, and sql_write_operations operations are present and ACTIVE (apart from the separately failed superseded r5), while the measuring failure is a stale current priority-placement readiness projection after completed replacements. (rules out: Do not modify the retained projection owner for this new blocker or rerun unchanged bytes; pivot to the current priority-placement projection/leader-coverage boundary.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T21-22-24-859Z.report.json]
- **priority-placement-completed-topology-observation-main**: The multi-replica Raft apply path omitted SQLite changes=0 from CDC: a zero-row services UPDATE published fallback status=syncing, overwrote an ACTIVE priority replica in SystemTableCache, opened schema_operations-p1 spread gap 1, and denied the unchanged MovieLens schema gate; threading the execution change count into CDC suppresses the no-op while an explicit stale overlay still denies admission. (rules out: The 2026-07-19 schema denial is not caused by CDC running before SQLite, a relaxed spread predicate, or a sticky publication summary; the production current-placement observer correctly rejects the stale overlay.) [test-output/reports/priority-placement-completed-topology-observation-2026-07-19T21-35-09-665Z.report.json]
- **priority-placement-completed-topology-observation-main**: DT red-on-revert proven for test/partition/partition-service-raft-noop-cdc-placement.test.js [dt:solve/changes/dt-prove/partition-service-raft-noop-cdc-placement.test.js-2026-07-19T21-37-14-650Z.json]
- **priority-placement-completed-topology-observation-main**: DT red-on-revert proven for test/partition/partition-service-raft-noop-cdc-placement.test.js [dt:solve/changes/dt-prove/partition-service-raft-noop-cdc-placement.test.js-2026-07-19T21-42-13-272Z.json]
- **priority-placement-completed-topology-observation-main**: Model contract gate passed unchanged after the no-op CDC owner fix; all contract records, invariants, decision tables, statecharts, owner traces, Alloy, and TLC expected route/forbidden outcomes passed. (rules out: No model-level admission bypass, topology authority, or new recovery state transition was introduced.) [test-output/reports/priority-spread-schema-admission-bypass.model.report.json]
- **priority-placement-completed-topology-observation-main**: Independent verification approved the exact canonical three-path delta; 383 assertions, scoped static checks, all five attack checklists, and mechanism-bound red-on-revert passed. [subagent:verify_priority_noop_cdc]
- **priority-placement-completed-topology-observation-main**: Checkpoint 7d4aedbe reproduces the completed-placement freshness defect: a terminal priority ADD operation plus its captured target services row at status=syncing yields evaluateAuthoritativeControlSnapshotRepair.shouldRepair=false and ControlPlaneSnapshotOwner snapshotObservation.state=fresh. (rules out: The checkpointed zero-row CDC suppression alone closes completed priority placement observation; operation-ledger terminality or a constructed current placement summary is sufficient to certify snapshot freshness.) [test/admin/admin-control-snapshot-completed-placement-handoff-repair.test.js]
- **priority-placement-completed-topology-observation-main**: DT red-on-revert proven for test/admin/admin-control-snapshot-completed-placement-handoff-repair.test.js [dt:solve/changes/dt-prove/admin-control-snapshot-completed-placement-handoff-repair.test.js-2026-07-19T22-28-14-338Z.json]
- **priority-placement-completed-topology-observation-main**: Model contract gate passed after the completed-placement handoff reconciliation change: contract records, invariants, decision tables, statecharts, owner traces, Alloy, and all TLC expected route/forbidden outcomes remain valid. (rules out: The change introduces a new topology authority, an admission bypass, or an unsafe owner/lifecycle transition.) [test-output/reports/priority-spread-schema-admission-bypass.model.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T21:41:45.005Z | priority-placement-completed-topology-observation-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/priority-placement-completed-topology-observation/attempt-1.diff |
