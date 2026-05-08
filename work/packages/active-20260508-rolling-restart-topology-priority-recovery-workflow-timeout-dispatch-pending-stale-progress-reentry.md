# Rolling Restart Topology Priority Recovery Workflow Timeout Dispatch Pending Stale Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-reclassify-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-dispatch-pending-reclassify-20260508T000000Z/rolling-restart/",
  "owner": "Priority recovery workflow timeout transition deferred after dispatch-pending reclassification repair",
  "boundary": "Operation workflow owner / workflow_timeout / startup active gate support",
  "dominantReason": "priority_recovery_workflow_timeout_transition_deferred",
  "currentState": "The workflow-progress dispatch-pending reclassification repair is closed by migration. The representative rerun now stalls at epoch 2 PUBLISHED with sql_write_operations-p1 as the dominant operation_workflow_owner witness under operation_stalled / reconcile_stale_operation_progress, with actuation transition_deferred, workflow phase dispatch_pending, latest step PENDING, and startup active-gate snapshot coverage downstream only.",
  "nextAction": "Review the just-closed workflow-progress dispatch-pending package, then add one focused epoch-2 PUBLISHED workflow-timeout regression for sql_write_operations-p1 operation_stalled / reconcile_stale_operation_progress with dispatch_pending and repair or reclassify that stale-progress timeout seam.",
  "proof": [
    "Focused epoch-2 PUBLISHED workflow-timeout witness for sql_write_operations-p1 with supporting sql_transactions-p1 context",
    "Focused workflow-timeout regression for the selected dispatch-pending stale-progress seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-dispatch-pending-stale-progress-reentry.md",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-5.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Topology Priority Recovery Workflow Progress Dispatch Pending Reentry](./done-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md)
closes by migration. The focused workflow-progress repair is preserved, but
the representative rerun restores the direct blocker to
`sql_write_operations-p1` in epoch `2` `PUBLISHED`, where
`operation_stalled -> reconcile_stale_operation_progress` remains unresolved
under `operation_workflow_owner / workflow_timeout` with
`transition_deferred` actuation and workflow phase `dispatch_pending`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-reclassify-20260508T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-dispatch-pending-reclassify-20260508T000000Z/rolling-restart/`.
3. Result: failed after `131.5s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. `npm run analyze:distributed-failure` keeps root cause class `topology`,
   failure class `priority_recovery_progress_blocked`, and dominant reason
   `priority_recovery_workflow_timeout_transition_deferred`.
6. `npm run analyze:topology-convergence` on the report and matching playback
   both select `operation_workflow_owner / workflow_timeout` as the first
   frontier, with evidence anchored under
   `publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`.
7. The dominant witness is `sql_write_operations-p1`, semantic state
   `operation_stalled`, actuation `transition_deferred`, next action
   `reconcile_stale_operation_progress`, wait mode
   `timeout_reconcile_due`, workflow phase `dispatch_pending`, latest
   workflow step `PENDING`, latest operation status `pending`, and
   authoritative visibility `cache_visible`.
8. The dominant witness operation is
   `552b4993-9d12-4f79-80e3-8a50b8deca84`, with `stepAgeMs=59678` against
   `stepTimeoutMs=30000`.
9. `sql_transactions-p1` remains supporting timeout context in the same
   artifact, while `startup_active_gate_owner / snapshot_coverage` stays
   downstream only with coverage `2/5`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed workflow-progress dispatch-pending reclassification
   repair from the predecessor package.
2. Extract the focused epoch-2 workflow-timeout witness set for
   `sql_write_operations-p1` with its supporting timeout context.
3. Add one focused workflow-timeout regression for the selected
   `operation_stalled / reconcile_stale_operation_progress` dispatch-pending
   seam.
4. Repair or reclassify the selected stale-progress timeout seam without
   reopening the closed workflow-progress or earlier authoritative-observation
   repairs.
5. Rerun focused tests, touched-file static guardrails, and one
   representative `rolling-restart` scenario.

## Out Of Scope

1. Reopening the predecessor workflow-progress package unless a fresh
   representative artifact restores `workflow_progress` above the timeout
   witness.
2. Broad matrix continuation before the representative five-node blocker
   closes or migrates again.
3. Harness-only timeout increases or blocker relabeling that hide the current
   workflow-timeout debt.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner / workflow_timeout` owns the direct epoch `2`
   `PUBLISHED` `sql_write_operations-p1` stale-progress seam.
2. `sql_transactions-p1` remains supporting context unless a fresh
   representative artifact promotes it above `sql_write_operations-p1`
   without changing the owner boundary.
3. `startup_active_gate_owner / snapshot_coverage` remains supporting
   evidence while the direct unresolved frontier is still priority-recovery
   timeout reconciliation.
4. `operation_workflow_owner / workflow_progress` dispatch-pending
   reclassification stays closed unless a fresh representative artifact
   restores that lower boundary above the timeout seam.
5. `rebalancer_leader / operation_scheduling` stays closed unless a fresh
   representative artifact restores `create_recovery_operation` as the direct
   lower owner.

Canonical contract shape:

1. For the live epoch `2` `PUBLISHED` artifact, `sql_write_operations-p1`
   must either reconcile stale workflow progress or surface one canonical
   workflow-timeout reason why the transition remains deferred in
   `dispatch_pending`.
2. Supporting priority partitions must not outrank the canonical
   `sql_write_operations-p1` timeout witness in the same artifact.
3. If the representative rerun clears the timeout seam and moves the direct
   witness back to `operation_workflow_owner / workflow_progress`, this
   package closes by migration and the successor package takes ownership of
   that lower seam.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Gauss` (`019e0600-10dc-7bc0-a9b1-4f736f679618`) reviewed
      `work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `James` (`019e0602-72ec-7020-87ea-5d66c58599fb`) fixed
      `work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md`.
- [ ] Implementation subagent recorded:

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [ ] Extract the focused epoch-2 workflow-timeout witness for
      `sql_write_operations-p1` and its supporting timeout context.
- [ ] Add the focused regression for the selected workflow-timeout seam.
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
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-reclassify-20260508T000000Z.report.json`
   selected normalized dominant reason
   `priority_recovery_workflow_timeout_transition_deferred`.
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-reclassify-20260508T000000Z.report.json`
   selected `operation_workflow_owner / workflow_timeout` as the first
   frontier while promoting `sql_write_operations-p1` to the dominant
   witness.
3. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-priority-recovery-dispatch-pending-reclassify-20260508T000000Z/rolling-restart/failure-bundle.json`
   matched the report-level workflow-timeout frontier and dominant witness.

## Progress Notes

1. The predecessor package closed its local workflow-progress seam, but the
   representative owner boundary moved back to `workflow_timeout` on the same
   partition and workflow phase.
