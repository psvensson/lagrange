# Rolling Restart Topology Priority Recovery Workflow Timeout Stale Operation Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z/rolling-restart/",
  "owner": "Priority recovery workflow timeout transition deferred after source-partition workflow-progress repair",
  "boundary": "Operation workflow owner / workflow_timeout / startup active gate support",
  "dominantReason": "priority_recovery_workflow_timeout_transition_deferred",
  "currentState": "The workflow-timeout authoritative-observation repair is proved. The representative rerun no longer terminates on replica_operations-p1 workflow_timeout; epoch 2 PUBLISHED now migrates to sql_write_operations-p1 as the dominant operation_workflow_owner witness under recovering_in_flight / wait_for_operation_progress, with actuation persisted_not_dispatched, boundary workflow_progress, and startup active-gate snapshot coverage still downstream only.",
  "nextAction": "Continue in work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md for the migrated sql_write_operations-p1 workflow_progress dispatch-pending seam.",
  "proof": [
    "Focused epoch-4 PUBLISHED workflow-timeout witness for replica_operations-p1 with supporting sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1 context",
    "Focused workflow-timeout regression for the selected stale-operation-progress seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-stale-operation-progress-reentry.md",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-5.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md",
    "work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-source-partition-reentry.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-source-partition-reentry.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md"
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
10. After preserving deferred authoritative-read guidance for stale
    cache-visible timeout witnesses, the representative rerun in
    `test-output/reports/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z.report.json`
    still fails, but it clears the timeout seam entirely: epoch `2`
    `PUBLISHED` now promotes `sql_write_operations-p1` as the only blocked
    partition under `operation_workflow_owner / workflow_progress`, with
    semantic state `recovering_in_flight`, actuation
    `persisted_not_dispatched`, wait mode `event_driven`, and next action
    `wait_for_operation_progress`.
11. The repaired workflow-timeout seam is therefore closed enough to stop
    spending package effort on `replica_operations-p1` timeout
    reconciliation; the next worker should spend proof on the migrated
    `sql_write_operations-p1` workflow-progress dispatch-pending seam.

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

1. `operation_workflow_owner / workflow_timeout` owns the opening epoch `4`
   `PUBLISHED` `replica_operations-p1` stale-operation-progress seam, but the
   final representative rerun clears that timeout witness and migrates the
   direct blocker to `sql_write_operations-p1` under `workflow_progress`.
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
3. If the representative rerun clears the timeout seam and moves the direct
   witness back to `operation_workflow_owner / workflow_progress`, this
   package closes by migration and the successor package takes ownership of
   that lower workflow-progress seam.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Bernoulli` (`019e05cf-7a73-7531-b973-71257b08a905`) reviewed
      `work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-source-partition-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Wegener` (`019e05d2-e8bb-7df2-a65b-0861e62d8462`) fixed
      `work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-source-partition-reentry.md`.
- [x] Implementation subagent recorded:
      Agent `Averroes` (`019e05d4-8155-7930-910e-c16f985f7f7d`) implemented
      `work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-stale-operation-progress-reentry.md`.

## Commit And Push Ledger

- Focused package commit: `1a1f69a1`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [x] Extract the focused epoch-4 workflow-timeout witness for
      `replica_operations-p1` and supporting
      `sql_transaction_participants-p1`, `sql_transactions-p1`, and
      `sql_write_operations-p1`.
- [x] Add the focused regression for the selected workflow-timeout seam.
- [x] Repair the selected workflow-timeout boundary or migrate again with
      proof.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z.report.json`
   selected normalized dominant reason
   `priority_recovery_workflow_timeout_transition_deferred`.
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z.report.json`
   selected `operation_workflow_owner / workflow_timeout` as the first
   frontier while promoting `replica_operations-p1` to the dominant witness.
3. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z/rolling-restart/failure-bundle.json`
   matched the report-level workflow-timeout frontier and dominant witness.
4. `node test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   initially failed on the new epoch-4 timeout regression because
   `getPriorityRecoveryDecisionSnapshotForPartitionOperations(...)` skipped
   `repository.getOperationsByEntityAuthoritativeObservation(...)` when a
   stale cache-visible `replica_operations-p1` row was already present,
   dropping deferred authoritative-read guidance and reclassifying the
   partition as `workflow_timeout / reconcile_stale_operation_progress`.
5. After always consulting the authoritative partition observation and
   preserving explicit deferred-read guidance through the stage-5 decision
   snapshot path, the same focused test passed with `41/41` assertions green,
   including the new `replica_operations-p1` epoch-4 timeout regression and
   its supporting `sql_transaction_participants-p1`,
   `sql_transactions-p1`, and `sql_write_operations-p1` planning context.
6. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
   passed with `0` new literal-guideline violations.
7. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
   passed with `0` decision-boundary violations.
8. `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
   passed with `0` runtime-grammar-contract violations.
9. `git diff --check -- src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   passed with no whitespace or conflict-marker issues.
10. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z.report.json --fast-local --verbose`
    failed after `131.4s`, but cleared the `replica_operations-p1`
    workflow-timeout stale-operation-progress seam and migrated the direct
    owner boundary back to `operation_workflow_owner / workflow_progress`.
11. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z.report.json`
    selected normalized dominant reason
    `priority_recovery_workflow_progress_event_driven`.
12. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z.report.json`
    and the matching playback failure bundle both selected
    `operation_workflow_owner / workflow_progress` as the first frontier while
    promoting `sql_write_operations-p1` to the dominant witness.
