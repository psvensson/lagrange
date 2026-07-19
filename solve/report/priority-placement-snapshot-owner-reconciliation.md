# Solve report: priority-placement-snapshot-owner-reconciliation

**Goal:** The existing ControlPlaneSnapshotOwner classifies a terminal priority ADD or REPLACE whose exact captured target service remains transitional as stale, reconciles topology and operation-ledger tables through canonical complete-table repair, becomes fresh only after the authoritative target is ACTIVE, never synthesizes ACTIVE or leader topology from operation evidence, and passes a production-path red-on-revert guard three consecutive times.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/priority-placement-completed-topology-observation-2026-07-19T22-45-59-502Z.report.json

**Attempts:** 2

## Links
- parent quest: priority-placement-completed-topology-observation
- plan: solve/epics/topology-convergence-hardening.md

## Scope Pressure
- Changed files: 6
- Change bytes: 36060
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/admin, src/control-plane, src/rebalancer, test/admin
- Categories: other, runtime, test
- Action: land or separate 5 owner areas: scripts/run-placement-affinity-scenarios.js, src/admin, src/control-plane, src/rebalancer, test/admin
- Split plan:
  - src/admin: 2 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - src/control-plane: 1 file(s)
  - src/rebalancer: 1 file(s)
  - test/admin: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **priority-placement-snapshot-owner-reconciliation-main** [solved] rung 2, attempts 2, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **priority-placement-snapshot-owner-reconciliation-main**: inherited from priority-placement-completed-topology-observation: inherited from runtime-replica-state-projection-retained-reconcile-integrity-reseal: The sealed retained-projection loss does not reproduce on checkpoint cc95da34: authoritative services rows for completed schema_operations, sql_transaction_participants, and sql_write_operations operations are present and ACTIVE (apart from the separately failed superseded r5), while the measuring failure is a stale current priority-placement readiness projection after completed replacements. (rules out: Do not modify the retained projection owner for this new blocker or rerun unchanged bytes; pivot to the current priority-placement projection/leader-coverage boundary.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T21-22-24-859Z.report.json]
- **priority-placement-snapshot-owner-reconciliation-main**: inherited from priority-placement-completed-topology-observation: The multi-replica Raft apply path omitted SQLite changes=0 from CDC: a zero-row services UPDATE published fallback status=syncing, overwrote an ACTIVE priority replica in SystemTableCache, opened schema_operations-p1 spread gap 1, and denied the unchanged MovieLens schema gate; threading the execution change count into CDC suppresses the no-op while an explicit stale overlay still denies admission. (rules out: The 2026-07-19 schema denial is not caused by CDC running before SQLite, a relaxed spread predicate, or a sticky publication summary; the production current-placement observer correctly rejects the stale overlay.) [test-output/reports/priority-placement-completed-topology-observation-2026-07-19T21-35-09-665Z.report.json]
- **priority-placement-snapshot-owner-reconciliation-main**: inherited from priority-placement-completed-topology-observation: Model contract gate passed unchanged after the no-op CDC owner fix; all contract records, invariants, decision tables, statecharts, owner traces, Alloy, and TLC expected route/forbidden outcomes passed. (rules out: No model-level admission bypass, topology authority, or new recovery state transition was introduced.) [test-output/reports/priority-spread-schema-admission-bypass.model.report.json]
- **priority-placement-snapshot-owner-reconciliation-main**: inherited from priority-placement-completed-topology-observation: Checkpoint 7d4aedbe reproduces the completed-placement freshness defect: a terminal priority ADD operation plus its captured target services row at status=syncing yields evaluateAuthoritativeControlSnapshotRepair.shouldRepair=false and ControlPlaneSnapshotOwner snapshotObservation.state=fresh. (rules out: The checkpointed zero-row CDC suppression alone closes completed priority placement observation; operation-ledger terminality or a constructed current placement summary is sufficient to certify snapshot freshness.) [test/admin/admin-control-snapshot-completed-placement-handoff-repair.test.js]
- **priority-placement-snapshot-owner-reconciliation-main**: inherited from priority-placement-completed-topology-observation: Model contract gate passed after the completed-placement handoff reconciliation change: contract records, invariants, decision tables, statecharts, owner traces, Alloy, and all TLC expected route/forbidden outcomes remain valid. (rules out: The change introduces a new topology authority, an admission bypass, or an unsafe owner/lifecycle transition.) [test-output/reports/priority-spread-schema-admission-bypass.model.report.json]
- **priority-placement-snapshot-owner-reconciliation-main**: Independent verifier rejected exact attempt 1: the behavior and owner routing pass, but the patch raises touched-boundary cognitive complexity from zero violations to one (deriveAuthoritativeRepairTables complexity 22 > 20); replacement must use table-driven trigger mapping and strengthen durable ADD/REPLACE lifecycle and repair-path coverage. [subagent:verify_snapshot_owner_handoff]
- **priority-placement-snapshot-owner-reconciliation-main**: DT red-on-revert proven for test/admin/admin-control-snapshot-completed-placement-handoff-repair.test.js [dt:solve/changes/dt-prove/admin-control-snapshot-completed-placement-handoff-repair.test.js-2026-07-19T22-45-48-365Z.json]
- **priority-placement-snapshot-owner-reconciliation-main**: Replacement attempt 2 removes the rejected static regression: scoped cognitive violations are 0, the table-driven repair selector and new handoff/identity helpers are below their cyclomatic threshold, and runtime grammar, decision-boundary, literal, boundary-mode, cycle, file-size, constant-name, and operation-progress-authority guards pass. (rules out: Closing on a repo-wide metric whose unrelated improvements mask new complexity at the completed-placement repair boundary.) [test-output/analysis/cognitive-complexity-scoped.json]
- **priority-placement-snapshot-owner-reconciliation-main**: The strengthened production-path guard executes the existing snapshot owner through AdminServiceDiscovery and the canonical gateway across partitions, services, tables, and replica_operations with one COMPLETE_TABLE observation per table, then only returns fresh after authoritative ACTIVE topology clears the handoff gap; the ADD/REPLACE adversarial matrix and replay negatives pass. (rules out: A derived-table-only test, operation-ledger synthesis of ACTIVE state, a second repair owner, or a repair result that remains fresh while the contradiction survives.) [test-output/reports/priority-placement-completed-topology-observation-2026-07-19T22-45-59-502Z.report.json]
- **priority-placement-snapshot-owner-reconciliation-main**: Model contracts remain green after replacement attempt 2: contract records, invariants, decision tables, statecharts, owner traces, Alloy, and TLC route/forbidden outcomes all pass. (rules out: A model-level admission bypass, new topology authority, unsafe lifecycle transition, or weakened forbidden outcome.) [test-output/reports/priority-spread-schema-admission-bypass.model.report.json]
- **priority-placement-snapshot-owner-reconciliation-main**: Independent verification approved the exact superseding six-path delta: same-base rejection supersession and aggregate equality proven, scoped complexity improved, 256 focused plus 388 gateway assertions passed, three 191-assert scenario runs passed, model/static/checklist review passed, and no topology state is synthesized. [subagent:verify_snapshot_owner_handoff]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T22:32:17.914Z | priority-placement-snapshot-owner-reconciliation-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/priority-placement-snapshot-owner-reconciliation/attempt-1.diff |
| 2026-07-19T22:47:06.862Z | priority-placement-snapshot-owner-reconciliation-main | local-fix | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/priority-placement-snapshot-owner-reconciliation/attempt-2.diff |
