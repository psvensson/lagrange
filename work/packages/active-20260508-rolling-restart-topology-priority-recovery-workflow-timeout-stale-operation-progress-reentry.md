# Rolling Restart Topology Priority Recovery Workflow Timeout Stale Operation Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z/rolling-restart/",
  "owner": "Priority recovery workflow timeout transition deferred after source-partition workflow-progress repair",
  "boundary": "Operation workflow owner / workflow_timeout / startup active gate support",
  "dominantReason": "priority_recovery_workflow_timeout_transition_deferred",
  "currentState": "The source-partition workflow-progress repair is closed by migration. The representative rerun now stalls at epoch 4 PUBLISHED with replica_operations-p1 as the dominant operation_workflow_owner witness under operation_created_but_no_step_transitions / reconcile_stale_operation_progress, while sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1 remain supporting context and startup active-gate snapshot coverage stays downstream only.",
  "nextAction": "Review the just-closed source-partition workflow-progress package, then add one focused epoch-4 PUBLISHED workflow-timeout regression for replica_operations-p1 operation_created_but_no_step_transitions / reconcile_stale_operation_progress with supporting sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1 context, and repair or reclassify that stale-operation-progress seam.",
  "proof": [
    "Focused epoch-4 PUBLISHED workflow-timeout witness for replica_operations-p1 with supporting sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1 context",
    "Focused workflow-timeout regression for the selected stale-operation-progress seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-stale-operation-progress-reentry.md",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-5.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-source-partition-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Topology Priority Recovery Workflow Progress Serial-Wait Source Partition Reentry](./done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-source-partition-reentry.md)
closes by migration. The representative rerun no longer spends package effort
on the source-partition workflow-progress reuse seam. The live blocker has
moved to `replica_operations-p1` in epoch `4` `PUBLISHED`, where
`operation_created_but_no_step_transitions ->
reconcile_stale_operation_progress` remains unresolved under
`operation_workflow_owner / workflow_timeout` and the prior partitions stay as
supporting context only.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z/rolling-restart/`.
3. Result: failed after `134.4s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. `npm run analyze:distributed-failure` keeps root cause class `topology`,
   failure class `priority_recovery_progress_blocked`, and dominant reason
   `priority_recovery_workflow_timeout_transition_deferred`.
6. `npm run analyze:topology-convergence` on the report and matching playback
   both select `operation_workflow_owner / workflow_timeout` as the first
   frontier, with evidence anchored under
   `publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`.
7. The dominant witness is `replica_operations-p1`, semantic state
   `operation_stalled`, progress class
   `operation_created_but_no_step_transitions`, next action
   `reconcile_stale_operation_progress`, wait mode
   `timeout_reconcile_due`, workflow phase `target_creation`, latest workflow
   step `CREATING`, latest operation status `creating`, and authoritative
   visibility `cache_visible`.
8. The dominant witness operation is
   `3f545961-a4ac-4963-b740-5e584cafc03a`, with `stepAgeMs=69892` against
   `stepTimeoutMs=60000`.
9. Supporting unresolved context remains on
   `sql_transaction_participants-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1`, while startup active-gate snapshot coverage
   stays downstream only.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed source-partition workflow-progress repair from the
   predecessor package.
2. Extract the focused epoch-4 workflow-timeout witness set for
   `replica_operations-p1` and its supporting partitions.
3. Add one focused workflow-timeout regression for the selected
   `operation_created_but_no_step_transitions /
   reconcile_stale_operation_progress` seam.
4. Repair or reclassify the selected stale-operation-progress timeout seam
   without reopening the closed workflow-progress source-partition repair or
   the earlier operation-scheduling boundary.
5. Rerun focused tests, touched-file static guardrails, and one
   representative `rolling-restart` scenario.

## Out Of Scope

1. Reopening the predecessor source-partition workflow-progress package unless
   a fresh representative artifact restores `sql_transaction_participants-p1`
   as the direct blocker above the timeout witness.
2. Broad matrix continuation before the representative five-node blocker
   closes or migrates again.
3. Harness-only timeout increases or blocker relabeling that hide the current
   workflow-timeout debt.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner / workflow_timeout` owns the direct epoch `4`
   `PUBLISHED` `replica_operations-p1` stale-operation-progress seam.
2. `sql_transaction_participants-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1` remain supporting context unless a fresh
   representative artifact promotes one of them above
   `replica_operations-p1` without changing the owner boundary.
3. `startup_active_gate_owner / snapshot_coverage` remains supporting
   evidence while the direct unresolved frontier is still priority-recovery
   timeout reconciliation.
4. `operation_workflow_owner / workflow_progress` source-partition reuse stays
   closed unless a fresh representative artifact restores that lower boundary
   above the timeout seam.
5. `rebalancer_leader / operation_scheduling` stays closed unless a fresh
   representative artifact restores `create_recovery_operation` as the direct
   lower owner.

Canonical contract shape:

1. For the live epoch `4` `PUBLISHED` artifact, `replica_operations-p1` must
   either reconcile stale workflow progress or surface one canonical
   workflow-timeout reason why the transition remains deferred.
2. Supporting priority partitions must not outrank the canonical
   `replica_operations-p1` workflow-timeout witness in the same artifact.
3. If a fresh representative rerun keeps the same owner boundary but changes
   only the dominant partition or count shape, this package stays active and
   absorbs that evidence instead of splitting again.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Bernoulli` (`019e05cf-7a73-7531-b973-71257b08a905`) reviewed
      `work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-source-partition-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Wegener` (`019e05d2-e8bb-7df2-a65b-0861e62d8462`) fixed
      `work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-source-partition-reentry.md`.
- [ ] Implementation subagent recorded:

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [ ] Extract the focused epoch-4 workflow-timeout witness for
      `replica_operations-p1` and supporting
      `sql_transaction_participants-p1`, `sql_transactions-p1`, and
      `sql_write_operations-p1`.
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

1. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z.report.json`
   selected normalized dominant reason
   `priority_recovery_workflow_timeout_transition_deferred`.
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z.report.json`
   selected `operation_workflow_owner / workflow_timeout` as the first
   frontier while promoting `replica_operations-p1` to the dominant witness.
3. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z/rolling-restart/failure-bundle.json`
   matched the report-level workflow-timeout frontier and dominant witness.
