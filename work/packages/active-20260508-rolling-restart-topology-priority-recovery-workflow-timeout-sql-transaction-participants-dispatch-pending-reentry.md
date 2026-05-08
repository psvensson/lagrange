# Rolling Restart Topology Priority Recovery Workflow Timeout Sql Transaction Participants Dispatch Pending Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z/rolling-restart/",
  "owner": "Priority recovery workflow-timeout reconciliation for sql_transaction_participants-p1 after stale planning visibility repair",
  "boundary": "operation_workflow_owner / workflow_timeout / dispatch_pending_transition",
  "dominantReason": "priority_recovery_workflow_timeout_transition_deferred",
  "currentState": "The stale planning-visibility seam is closed by migration. The closure-driving rerun now advances startup active-gate snapshot coverage to 3/5 and removes the stale sql_write_operations-p1 eligible_but_no_operation_created witness, but epoch 2 PUBLISHED still stalls on sql_transaction_participants-p1 under semantic state operation_stalled with progress class operation_created_but_no_step_transitions, nextRequiredAction reconcile_stale_operation_progress, workflowProgressPhaseId dispatch_pending, and waitMode timeout_reconcile_due.",
  "nextAction": "Review the just-closed stale-planning-visibility package, then extract one focused epoch-2 PUBLISHED workflow-timeout witness for sql_transaction_participants-p1 and repair or classify why the operation workflow owner leaves it at operation_created_but_no_step_transitions under dispatch_pending without reopening the closed stale-planning-visibility package.",
  "proof": [
    "Focused epoch-2 PUBLISHED workflow-timeout witness for sql_transaction_participants-p1 with supporting replica_operations-p1, sql_transactions-p1, sql_write_operations-p1, and startup active-gate evidence",
    "Focused workflow-timeout regression or blocker probe for the selected operation_created_but_no_step_transitions seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Startup Active Gate Snapshot Coverage Priority Recovery Stale Planning Visibility Reentry](./done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md)
closes by migration. The representative rerun no longer spends package effort
on stale planning-only `eligible_but_no_operation_created` reporting. The live
frontier has moved to `sql_transaction_participants-p1` in epoch `2`
`PUBLISHED`, where `operation_created_but_no_step_transitions ->
reconcile_stale_operation_progress` remains unresolved under
`operation_workflow_owner / workflow_timeout` and startup active-gate snapshot
coverage stays downstream only.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded:
      Agent <name> (<agent-id>) reviewed
      `work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md`;
      result <clean|fixes-required>.
- [ ] Fix subagent recorded or explicitly not needed:
      Agent <name> (<agent-id>) fixed
      `work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md`, or
      `not-needed` only when review result is `clean`.
- [ ] Implementation subagent recorded:
      Agent <name> (<agent-id>) implemented
      `work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z/rolling-restart/`.
3. Result: failed after `132.0s`.
4. `npm run analyze:distributed-failure` classifies the rerun as
   `topology / priority_recovery_workflow_timeout_transition_deferred`.
5. `npm run analyze:topology-convergence --` on both the report and playback
   failure bundle selects `operation_workflow_owner / workflow_timeout` as the
   first frontier, with `startup_active_gate_owner / snapshot_coverage` as the
   next expected frontier.
6. The dominant witness is `sql_transaction_participants-p1` with
   `semanticState=operation_stalled`,
   `progressClass=operation_created_but_no_step_transitions`,
   `nextRequiredAction=reconcile_stale_operation_progress`,
   `workflowProgressPhaseId=dispatch_pending`,
   `waitMode=timeout_reconcile_due`, `stepAgeMs=39749`, and
   `stepTimeoutMs=30000`.
7. Supporting context keeps `replica_operations-p1` on
   `recovering_in_flight / workflow_progress`,
   `sql_transactions-p1` on `needs_operation / priority_operation_serial_wait`,
   and `sql_write_operations-p1` on the same serial-wait lane while startup
   active-gate coverage remains downstream at `3/5`.
8. The stale `sql_write_operations-p1`
   `eligible_but_no_operation_created` witness is absent from the current
   rerun, so the stale-planning-visibility package stays closed unless a fresh
   representative artifact restores that older seam above workflow timeout.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Review the just-closed stale-planning-visibility package before
   implementation resumes.
2. Extract the focused epoch-2 PUBLISHED workflow-timeout witness for
   `sql_transaction_participants-p1` and its supporting partitions.
3. Add one focused workflow-timeout regression or blocker probe for the
   selected `operation_created_but_no_step_transitions /
   reconcile_stale_operation_progress` seam.
4. Repair or classify the direct workflow-timeout seam without reopening the
   closed stale-planning-visibility package.
5. Run focused tests, touched-file static guardrails, and one representative
   `rolling-restart` rerun.

## Out Of Scope

1. Reopening the closed stale-planning-visibility package unless a fresh
   representative artifact restores `startup_active_gate_owner /
   snapshot_coverage / priority_recovery_progress_visibility` above workflow
   timeout.
2. Broad startup or publication refactors outside the direct
   `sql_transaction_participants-p1` timeout-reconciliation path.
3. Harness timeout changes that hide the current workflow-timeout debt.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner / workflow_timeout` owns the direct
   `sql_transaction_participants-p1` timeout-reconciliation seam in the fresh
   representative artifact.
2. `replica_operations-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1` remain supporting context unless a fresh
   representative artifact promotes one of them above
   `sql_transaction_participants-p1` without changing the owner boundary.
3. `startup_active_gate_owner / snapshot_coverage` remains the next expected
   frontier only after the direct workflow-timeout seam advances or closes.

Canonical contract shape:

1. If `sql_transaction_participants-p1` remains
   `operation_created_but_no_step_transitions`, the artifact must identify one
   canonical workflow-timeout reason for why the transition remains deferred.
2. Supporting priority partitions must not outrank the canonical
   `sql_transaction_participants-p1` workflow-timeout witness in the same
   artifact.
3. This package closes only after a representative rerun proves either the
   workflow-timeout frontier closes or a new named owner boundary dominates.

## Residual Closure Inventory

- [ ] Review the just-closed predecessor package on the same sprint boundary.
- [ ] Fix any predecessor-review findings before implementation resumes.
- [ ] Extract the focused epoch-2 PUBLISHED workflow-timeout witness for
      `sql_transaction_participants-p1` and supporting
      `replica_operations-p1`, `sql_transactions-p1`, and
      `sql_write_operations-p1`.
- [ ] Add the focused regression or blocker probe for the selected
      workflow-timeout seam.
- [ ] Repair the selected workflow-timeout boundary or migrate again with
      proof.

## Static Drift Ledger

Preflight:

- [ ] Relevant guardrails selected by boundary.
- [ ] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file decision-boundary, literal-owner, or diff hygiene
      violation remains.
- [ ] Representative rerun proof completed before package closure.
