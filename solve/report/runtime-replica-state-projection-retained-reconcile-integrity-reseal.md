# Solve report: runtime-replica-state-projection-retained-reconcile-integrity-reseal

**Goal:** Runtime replica lifecycle completion hands desired state to one production-wired retained projection owner without waiting on services-table writes; that owner composes ServicesOwner and the existing owner-key reconcile queue to serialize and coalesce the latest state per replica and retry typed failures, and three consecutive fresh MovieLens runs report priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-replica-state-projection-retained-reconcile
- plan: solve/epics/topology-convergence-hardening.md

## Scope Pressure
- Changed files: 10
- Change bytes: 52046
- Owner areas: src/query, src/runtime, src/workflow, test/runtime, test/workflow
- Categories: runtime, test
- Action: land or separate 5 owner areas: src/query, src/runtime, src/workflow, test/runtime, test/workflow
- Split plan:
  - src/query: 4 file(s)
  - src/runtime: 2 file(s)
  - test/runtime: 2 file(s)
  - src/workflow: 1 file(s)
  - test/workflow: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **runtime-replica-state-projection-retained-reconcile-integrity-reseal-main** [parked {exhausted}] rung 0, attempts 1, metric 1 -> 1 — Projection retention is proven engaged and the measured blocker moved to non-system CREATING remote-owner wake admission in ReplicaDispatchService, outside the sealed projection-owner scope; the ordered gate forbids an unchanged rerun.

## Findings
- **runtime-replica-state-projection-retained-reconcile-integrity-reseal-main**: Independent verification confirmed byte-identical approved source, equivalent sealed constraints, correct parent lineage, and a clean successor event log [subagent:verify_runtime_projection_reconcile]
- **runtime-replica-state-projection-retained-reconcile-integrity-reseal-main**: The sealed source-operation blocking and lost runtime projection symptom does not reproduce on checkpoint 84263aeb: production composition is green and the symptom returns when the retained queue change is reverted [dt:solve/changes/dt-prove/runtime-replica-state-projection-retained-reconcile.test.js-2026-07-19T18-22-34-232Z.json]
- **runtime-replica-state-projection-retained-reconcile-integrity-reseal-main**: The retained projection fix engaged: both runtime services rows are ACTIVE, but the remote ADD remains CREATING because replica-dispatch replay drops non-system CREATING rows before source-owner observed-progress reconciliation [file:solve/changes/runtime-replica-state-projection-retained-reconcile-integrity-reseal/post-live-ordered-gate-boundary-move-2026-07-19.md]
- **runtime-replica-state-projection-retained-reconcile-integrity-reseal-main**: independent aggregate verification passed: successor artifact is byte-identical to approved attempt 5, Quest contract is unchanged apart from the expected successor frontier, parent link and declaration match, and no goalpost violations remain [subagent:root/verify_runtime_projection_reconcile]
- **runtime-replica-state-projection-retained-reconcile-integrity-reseal-main**: The sealed retained-projection loss does not reproduce on checkpoint cc95da34: authoritative services rows for completed schema_operations, sql_transaction_participants, and sql_write_operations operations are present and ACTIVE (apart from the separately failed superseded r5), while the measuring failure is a stale current priority-placement readiness projection after completed replacements. (rules out: Do not modify the retained projection owner for this new blocker or rerun unchanged bytes; pivot to the current priority-placement projection/leader-coverage boundary.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T21-22-24-859Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T18:38:40.159Z | runtime-replica-state-projection-retained-reconcile-integrity-reseal-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-replica-state-projection-retained-reconcile-integrity-reseal/attempt-1.diff |
