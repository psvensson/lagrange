# Rolling Restart Operation Workflow Progress Sql Write Operations Dispatch Pending Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-09",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_partitions_not_spread",
  "currentState": "The operation-scheduling package created recovery work for sql_transactions-p1, and the representative rolling-restart rerun now selects sql_write_operations-p1 under operation_workflow_owner / workflow_progress. The witness is recovering_in_flight with actuationState persisted_not_dispatched, workflowProgressPhaseId dispatch_pending, nextRequiredAction advance_existing_operation, waitMode event_driven, operationId 04b9e396-00b4-4ad7-abee-b9fac1c16f5d, and stepAgeMs 88969 over stepTimeoutMs 30000.",
  "nextAction": "Trace why workflow owner re-entry does not advance or timeout-reconcile sql_write_operations-p1 operation 04b9e396-00b4-4ad7-abee-b9fac1c16f5d from dispatch_pending persisted_not_dispatched.",
  "proof": [
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json",
    "Focused operation_workflow_owner workflow_progress regression or blocker probe for sql_write_operations-p1 dispatch_pending persisted_not_dispatched re-entry",
    "Touched-file literal, decision-boundary, runtime-grammar, syntax, and diff hygiene guardrails",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-dispatch-pending-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/todo-20260509-rolling-restart-operation-workflow-progress-sql-write-operations-dispatch-pending-reentry.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/active-20260508-rolling-restart-operation-scheduling-sql-transaction-participants-needs-operation-reentry.md"
}
-->

Opened on May 9, 2026 after the operation-scheduling package removed the
`sql_transactions-p1` no-serial-wait recovery creation gap and the representative
`rolling-restart` gate migrated to workflow progress for `sql_write_operations-p1`.

## Current Evidence

1. Representative command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json --fast-local --verbose`
2. Representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json`.
3. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix/rolling-restart/`.
4. Result: failed after approximately `137324ms`.
5. Active gate: `4/5` nodes reached ACTIVE within `120000ms`.
6. Publication is `PUBLISHED`, `pendingAckCount=0`, and priority recovery
   invariants passed.
7. Frontier edge: `priority_recovery_partition_progress`.
8. Owner and boundary:
   `operation_workflow_owner / workflow_progress`.
9. Dominant reason:
   `priority_partitions_not_spread`.
10. Dominant witness:
    `sql_write_operations-p1`.
11. Dominant semantic state:
    `recovering_in_flight`.
12. Dominant next required action:
    `advance_existing_operation`.
13. Dominant actuation state and wait mode:
    `persisted_not_dispatched / event_driven`.
14. Dominant workflow progress phase:
    `dispatch_pending`.
15. Dominant operation id:
    `04b9e396-00b4-4ad7-abee-b9fac1c16f5d`.
16. Dominant operation age:
    `stepAgeMs=88969` over `stepTimeoutMs=30000`.
17. The predecessor operation-scheduling witness now has recovery operation
    `ab74c173-78e1-4227-a15c-580c22a97930` and is classified as
    `spread_satisfied_in_flight`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Preserve the current workflow-progress report and playback witness.
2. Trace owner re-entry for the selected persisted `PENDING` operation.
3. Add the narrowest focused workflow-owner regression or blocker probe for
   `sql_write_operations-p1` dispatch-pending persisted-not-dispatched re-entry.
4. Repair only the workflow-owner path that should dispatch, advance, or
   timeout-reconcile the existing operation.
5. Rerun focused owner tests, touched-file guardrails, and the representative
   `rolling-restart --fast-local` gate.

## Out Of Scope

1. Reopening operation scheduling unless a fresh artifact restores
   `needs_operation` plus empty operation ids as the first frontier.
2. Reopening rebalancer handoff unless the fresh evidence names that boundary.
3. Harness timeout increases or presentation-only relabeling.
4. Broad startup active-gate, publication, transport, Pro, or Enterprise work.

## Boundary Contract

Semantic owner:
`operation_workflow_owner / workflow_progress`.

Canonical operation:
advance or reconcile existing operation
`04b9e396-00b4-4ad7-abee-b9fac1c16f5d` for `sql_write_operations-p1`.

Canonical witness state:
`recovering_in_flight`, `persisted_not_dispatched`, `dispatch_pending`,
`advance_existing_operation`, and `event_driven`.

Allowed consumers:
priority recovery diagnostics, topology convergence analysis, distributed
failure summary, workflow-owner tests, and the rolling-restart release gate.

Forbidden reinterpretations:

1. Do not convert this into operation scheduling while the witness has an
   operation id and `advance_existing_operation`.
2. Do not treat elapsed time alone as the fix; the owner path must emit a
   canonical dispatch, progress, retry, or timeout-reconcile outcome.
3. Do not demote the failure to startup active-gate snapshot coverage until
   priority workflow progress closes or migrates.

## Hotspots

1. `src/rebalancer/operation-workflow-owner.js`
2. `src/rebalancer/operation-workflow-owner-shared.js`
3. `src/rebalancer/operation-workflow-owner-segment-1.js`
4. `src/rebalancer/operation-workflow-owner-segment-4.js`
5. `src/rebalancer/operation-workflow-owner-segment-7-stage-1.js`
6. `src/rebalancer/operation-workflow-owner-segment-7-stage-2.js`
7. `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`

## Activation Checklist

- [ ] Fresh review subagent reviews the completed operation-scheduling package.
- [ ] Fresh fix subagent records fixes when review requires them, or `not-needed`
      when review is clean.
- [ ] Fresh implementation subagent implements this package after review/fix
      proof is clean.

## Validation

Required implementation validation:

1. Focused workflow-owner regression or blocker probe for the selected
   dispatch-pending persisted-not-dispatched witness.
2. Touched-file literal, decision-boundary, runtime-grammar, syntax, and diff
   hygiene guardrails.
3. `npm run work:current-blocker`
4. `npm run work:validate`
5. Representative
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-dispatch-pending-fix.report.json --fast-local --verbose`

## Done When

1. `sql_write_operations-p1` operation
   `04b9e396-00b4-4ad7-abee-b9fac1c16f5d` has a focused owner-path
   reproduction and fix, or the representative rerun migrates to one named
   owner boundary.
2. The package records whether the representative scenario passed, stayed on
   `operation_workflow_owner / workflow_progress`, or migrated.
3. The package has a truthful Commit And Push Ledger before closure.
