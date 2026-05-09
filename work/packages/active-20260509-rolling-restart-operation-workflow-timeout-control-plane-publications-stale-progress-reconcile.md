# Rolling Restart Operation Workflow Timeout Control Plane Publications Stale Progress Reconcile

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-09",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_workflow_progress_transition_deferred",
  "currentState": "The focused workflow-timeout stale SENDING/pending fix was committed and pushed as 17baca86. It moved control_plane_publications-p1 off workflow_timeout and the representative rolling-restart rerun migrated to operation_workflow_owner / workflow_progress. The current dominant witness is sql_write_operations-p1 with semanticStateId needs_operation, progress class priority_operation_serial_wait, actuationState transition_deferred, waitMode event_driven, nextRequiredAction wait_for_operation_progress, operationId 9fef6a49-1f1d-413a-b257-37a4c69293c8, and serialWaitOperationIds [1a3e89d1-bae0-4a19-9d1e-f11b3a425a9b] on serialWaitPartitionIds [control_plane_publications-p1].",
  "nextAction": "Open the next package on operation_workflow_owner / workflow_progress for the sql_write_operations-p1 serial-wait blocker behind control_plane_publications-p1 operation 1a3e89d1-bae0-4a19-9d1e-f11b3a425a9b.",
  "proof": [
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-dispatch-pending-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-dispatch-pending-fix.report.json --explain priority_recovery_partition_progress",
    "Focused workflow-timeout regression for control_plane_publications-p1 SENDING/pending dispatch_pending stale progress re-entry",
    "Touched-file literal, decision-boundary, runtime-grammar, syntax, and diff hygiene guardrails",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json --fast-local --verbose",
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/done-20260509-rolling-restart-operation-workflow-progress-sql-write-operations-dispatch-pending-reentry.md",
    "work/packages/done-20260508-rolling-restart-operation-scheduling-sql-transaction-participants-needs-operation-reentry.md",
    "work/packages/active-20260509-rolling-restart-operation-workflow-timeout-control-plane-publications-stale-progress-reconcile.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260509-rolling-restart-operation-workflow-progress-sql-write-operations-dispatch-pending-reentry.md"
}
-->

Opened on May 9, 2026 after the workflow-progress package was committed as
`546a83715f19cd7be1dd31d859d3bb6a666dadd4` and pushed to
`origin/codex/pending-ack-eligibility-filter`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-dispatch-pending-fix.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-dispatch-pending-fix/rolling-restart/`.
3. Frontier edge: `priority_recovery_partition_progress`.
4. Owner and boundary: `operation_workflow_owner / workflow_timeout`.
5. Dominant reason:
   `priority_recovery_workflow_timeout_transition_deferred`.
6. Dominant witness: `control_plane_publications-p1`.
7. Dominant operation:
   `9cc14694-88ba-47df-9c72-ecc301be8312`.
8. Witness state: `operation_stalled`, `dispatch_pending`,
   `transition_deferred`, `timeout_reconcile_due`, `SENDING`, and `pending`.
9. Blocked partitions: `control_plane_publications-p1` and
   `sql_transaction_participants-p1`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Re-enter stale `SENDING` / `pending` dispatch-pending priority operations
   that have reached `workflow_timeout`.
2. Preserve the workflow owner as the only runtime progression and re-entry
   owner.
3. Keep the regression focused on the current
   `control_plane_publications-p1` witness shape.
4. Update current-blocker tracker output from this active package.

## Out Of Scope

1. Reopening operation scheduling, rebalancer handoff, or workflow-progress
   blockers unless fresh evidence restores them as the first frontier.
2. Harness timeout increases or presentation-only relabeling.
3. Startup active-gate snapshot coverage work before this timeout frontier
   progresses or migrates.
4. Pro or Enterprise behavior, operator flows, or control surfaces.

## Boundary Contract

Semantic owner:
`operation_workflow_owner / workflow_timeout`.

Canonical operation:
operation `9cc14694-88ba-47df-9c72-ecc301be8312` for
`control_plane_publications-p1`.

Canonical evidence:
`dispatch_pending`, latest workflow step `SENDING`, latest operation status
`pending`, `transition_deferred`, `timeout_reconcile_due`, and
`reconcile_stale_operation_progress`.

Allowed consumers:
operation workflow owner re-entry, priority recovery diagnostics, topology
convergence analysis, distributed failure summary, focused rebalancer tests,
and the rolling-restart release gate.

Forbidden reinterpretations:

1. Do not treat the stale `SENDING` witness as operation scheduling.
2. Do not bypass `operation_workflow_owner` with a reader-local repair path.
3. Do not fail the durable operation while the owner can re-enter dispatch.
4. Do not demote the failure to startup snapshot coverage until priority
   recovery progress closes or migrates.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot-stage-10.js`
2. `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`
3. `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`

## Static Drift Ledger

Preflight:

1. Baseline artifact analysis confirms the current frontier is
   `operation_workflow_owner / workflow_timeout`.
2. Inherited repo-wide dirty files are unrelated to this package and must not
   be touched.
3. The focused test file is already at the inherited 1200-line test-file
   threshold; this package must not increase that file's line count.

Closure:

1. Rerun focused owner tests and touched-file guardrails.
2. Record whether representative `rolling-restart --fast-local` passed,
   stayed on the same frontier, or migrated.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Galileo (`019e0a30-bf0f-7801-9851-677352a9efa1`) reviewed
      `work/packages/done-20260509-rolling-restart-operation-workflow-progress-sql-write-operations-dispatch-pending-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Aquinas (`019e0a34-1e47-78e0-b8ce-9d9f64b0755a`) fixed
      `work/packages/done-20260509-rolling-restart-operation-workflow-progress-sql-write-operations-dispatch-pending-reentry.md`.
- [x] Implementation subagent recorded:
      Agent Kant (`019e0a3c-6f1e-7bf0-8113-5d1aa116b3c6`) implemented
      `work/packages/active-20260509-rolling-restart-operation-workflow-timeout-control-plane-publications-stale-progress-reconcile.md`.

## Validation

Required implementation validation:

1. Focused regression for stale `SENDING` / `pending` dispatch-pending
   workflow-timeout re-entry.
2. Focused rebalancer owner test:
   `node test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`.
3. Touched-file syntax, literal, decision-boundary, runtime-grammar, and diff
   hygiene guardrails.
4. `npm run work:current-blocker`
5. `npm run work:validate`
6. Representative
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json --fast-local --verbose`

Validation notes:

1. `node test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
   passed: 50/50 assertions.
2. `node test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   passed: 62/62 assertions.
3. Touched-file guardrails passed:
   `node --check` for the touched runtime and test files,
   `npm run audit:guideline:literals -- ...`,
   `npm run audit:guideline:decision-boundaries -- ...`,
   `npm run audit:runtime-grammar:file -- ...`,
   `npm run guard:guideline:constant-names:file -- ...`,
   `npm run audit:file-size -- ...`, and `git diff --check -- ...`.
4. `npm run work:validate` passed: work tracker validation OK for 14 files.
5. Adjacent broader snapshot suite was run for risk visibility:
   `node test/control-plane/priority-recovery-snapshot.test.js` failed
   362/377. Parent reran it with the same result; the failing assertions are on
   existing `PENDING` dispatch-pending normalization expectations, not the new
   `SENDING` / `pending` stale-progress regression.
6. Representative rerun command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json --fast-local --verbose`.
   Result: failed 0/1 after 132793ms, but the frontier migrated off
   `operation_workflow_owner / workflow_timeout` to
   `operation_workflow_owner / workflow_progress` with dominant reason
   `priority_recovery_workflow_progress_transition_deferred`.
7. New representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json`.
   Dominant witness is now `sql_write_operations-p1`, semantic state
   `needs_operation`, progress class `priority_operation_serial_wait`,
   actuation `transition_deferred`, next action `wait_for_operation_progress`,
   operation `9fef6a49-1f1d-413a-b257-37a4c69293c8`, serial wait operation
   `1a3e89d1-bae0-4a19-9d1e-f11b3a425a9b`, and serial wait partition
   `control_plane_publications-p1`.
8. Parent reran focused owner tests, touched-file syntax, literal,
   decision-boundary, runtime-grammar, constant-name, file-size, diff hygiene,
   and `npm run work:validate`; all passed.
9. Focused package commit `17baca86` was pushed to
   `origin/codex/pending-ack-eligibility-filter`.

## Done When

1. Stale `SENDING` / `pending` dispatch-pending priority operations at
   `workflow_timeout` re-enter operation workflow owner advancement.
2. The focused regression proves the witness does not remain
   `transition_deferred`.
3. Current-blocker files name the migrated workflow-progress serial-wait
   successor state after validation.
4. Representative `rolling-restart --fast-local` is rerun and the migrated
   owner boundary is recorded.

## Commit And Push Ledger

- Focused package commit: `17baca86`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
