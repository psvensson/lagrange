# Rolling Restart Topology Priority Recovery Workflow Progress Dispatch Pending Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z/rolling-restart/",
  "owner": "Priority recovery workflow progress event-driven wait after timeout authoritative-observation repair",
  "boundary": "Operation workflow owner / workflow_progress / startup active gate support",
  "dominantReason": "priority_recovery_workflow_progress_event_driven",
  "currentState": "The workflow-timeout authoritative-observation repair is closed by migration. The representative rerun now stalls at epoch 2 PUBLISHED with sql_write_operations-p1 as the only blocked operation_workflow_owner witness under recovering_in_flight / wait_for_operation_progress, with actuation persisted_not_dispatched, workflow phase dispatch_pending, and startup active-gate snapshot coverage downstream only.",
  "nextAction": "Review the just-closed workflow-timeout package, then add one focused epoch-2 PUBLISHED workflow-progress regression for sql_write_operations-p1 recovering_in_flight / wait_for_operation_progress with persisted_not_dispatched actuation, and repair or reclassify that dispatch-pending seam.",
  "proof": [
    "Focused epoch-2 PUBLISHED workflow-progress witness for sql_write_operations-p1 recovering_in_flight with persisted_not_dispatched actuation",
    "Focused workflow-progress regression for the selected dispatch-pending seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-5.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-stale-operation-progress-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Topology Priority Recovery Workflow Timeout Stale Operation Progress Reentry](./done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-stale-operation-progress-reentry.md)
closes by migration. The representative rerun no longer spends package effort
on `replica_operations-p1` workflow-timeout reconciliation. The live blocker
now sits on `sql_write_operations-p1` in epoch `2` `PUBLISHED`, where
`recovering_in_flight -> wait_for_operation_progress` remains unresolved under
`operation_workflow_owner / workflow_progress` with
`persisted_not_dispatched` actuation and startup active-gate snapshot
coverage still downstream only.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z/rolling-restart/`.
3. Result: failed after `131.4s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. `npm run analyze:distributed-failure` keeps root cause class `topology`,
   failure class `priority_recovery_progress_blocked`, and dominant reason
   `priority_recovery_workflow_progress_event_driven`.
6. `npm run analyze:topology-convergence` on the report and matching playback
   both select `operation_workflow_owner / workflow_progress` as the first
   frontier, with evidence anchored under
   `publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`.
7. The dominant witness is `sql_write_operations-p1`, semantic state
   `recovering_in_flight`, actuation `persisted_not_dispatched`, next action
   `wait_for_operation_progress`, wait mode `event_driven`, workflow phase
   `dispatch_pending`, latest workflow step `PENDING`, latest operation status
   `pending`, and authoritative visibility `cache_visible`.
8. The dominant witness operation is
   `53734f63-5175-4de6-ba25-3e8a4a0080d6`, with `stepAgeMs=7831` against
   `stepTimeoutMs=30000`.
9. `startup_active_gate_owner / snapshot_coverage` remains downstream only,
   with coverage `2/5`, while priority recovery narrows to the single
   `sql_write_operations-p1` witness.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed source-partition workflow-progress repair from the
   predecessor chain.
2. Preserve the closed workflow-timeout authoritative-observation repair from
   the immediate predecessor package.
3. Extract the focused epoch-2 workflow-progress witness for
   `sql_write_operations-p1` persisted-not-dispatched actuation.
4. Add one focused workflow-progress regression for the selected
   `recovering_in_flight / wait_for_operation_progress` dispatch-pending seam.
5. Repair or reclassify the selected workflow-progress seam without reopening
   the closed timeout or source-partition repairs.
6. Rerun focused tests, touched-file static guardrails, and one
   representative `rolling-restart` scenario.

## Out Of Scope

1. Reopening the predecessor workflow-timeout package unless a fresh
   representative artifact restores `replica_operations-p1` above the new
   workflow-progress witness.
2. Broad matrix continuation before the representative five-node blocker
   closes or migrates again.
3. Harness-only timeout increases or blocker relabeling that hide the current
   workflow-progress debt.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner / workflow_progress` owns the direct epoch `2`
   `PUBLISHED` `sql_write_operations-p1` dispatch-pending seam.
2. `startup_active_gate_owner / snapshot_coverage` remains supporting
   evidence while the direct unresolved frontier is still priority-recovery
   workflow progress.
3. `operation_workflow_owner / workflow_timeout` timeout reconciliation stays
   closed unless a fresh representative artifact restores that seam above the
   new witness.
4. `operation_workflow_owner / workflow_progress` source-partition reuse stays
   closed unless a fresh representative artifact restores
   `sql_transaction_participants-p1` above `sql_write_operations-p1`.
5. `rebalancer_leader / operation_scheduling` stays closed unless a fresh
   representative artifact restores `create_recovery_operation` as the direct
   lower owner.

Canonical contract shape:

1. For the live epoch `2` `PUBLISHED` artifact, `sql_write_operations-p1`
   must either advance past dispatch-pending workflow progress or surface one
   canonical workflow-progress reason why the wait remains event-driven.
2. If a fresh representative rerun keeps the same owner boundary but changes
   only count shape or supporting startup context, this package stays active
   and absorbs that evidence instead of splitting again.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Hume` (`019e05e4-b612-7dd2-bf81-77527ee62343`) reviewed
      `work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-stale-operation-progress-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Kuhn` (`019e05e7-b954-73e3-aa78-3904e786e233`) fixed
      `work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-stale-operation-progress-reentry.md`.
- [ ] Implementation subagent recorded:

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [ ] Extract the focused epoch-2 workflow-progress witness for
      `sql_write_operations-p1` dispatch-pending actuation.
- [ ] Add the focused regression for the selected workflow-progress seam.
- [ ] Repair the selected workflow-progress boundary or migrate again with
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

1. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z.report.json`
   selected normalized dominant reason
   `priority_recovery_workflow_progress_event_driven`.
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z.report.json`
   selected `operation_workflow_owner / workflow_progress` as the first
   frontier while promoting `sql_write_operations-p1` to the dominant
   witness.
3. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z/rolling-restart/failure-bundle.json`
   matched the report-level workflow-progress frontier and dominant witness.
