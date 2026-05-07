# Rolling Restart Topology Priority Recovery Workflow Progress Serial-Wait Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-other-partition-target-reservation-20260507T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-other-partition-target-reservation-20260507T000000Z/rolling-restart/",
  "owner": "Priority recovery workflow progress transition deferred after lower-owner target-reservation repair",
  "boundary": "Operation workflow owner / workflow_progress / startup active gate support",
  "dominantReason": "priority_recovery_workflow_progress_transition_deferred",
  "currentState": "The direct rebalancer_leader / operation_scheduling create_recovery_operation seam is closed. The representative rerun now reaches epoch 4 PUBLISHED and migrates the live blocker to operation_workflow_owner / workflow_progress: sql_write_operations-p1 remains blocked under priority_operation_serial_wait with nextRequiredAction=wait_for_operation_progress, supporting sql_transaction_participants-p1 remains in flight, and startup active-gate timeout is only downstream support.",
  "nextAction": "Review the just-closed migration predecessor, then add one focused epoch-4 PUBLISHED workflow-progress regression for sql_write_operations-p1 priority_operation_serial_wait / wait_for_operation_progress with supporting sql_transaction_participants-p1 context, and repair or reclassify that deferred transition seam.",
  "proof": [
    "Focused epoch-4 PUBLISHED workflow-progress witness for sql_write_operations-p1 priority_operation_serial_wait with supporting sql_transaction_participants-p1 context",
    "Focused workflow-progress regression for the selected serial-wait transition seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/active-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-reentry.md",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-5.js",
    "test/rebalancer/rebalance-coordinator-owner-path-convergence.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Startup Publication Open Convergence Priority Serial-Wait Workflow Progress Reentry](./done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md)
closes by migration. The representative rerun no longer supports
`rebalancer_leader / operation_scheduling` on
`sql_write_operations-p1 -> create_recovery_operation` as the direct lower
owner. The live blocker now sits at
`operation_workflow_owner / workflow_progress` in epoch `4` `PUBLISHED`,
where `sql_write_operations-p1` carries
`priority_operation_serial_wait -> wait_for_operation_progress` and
`sql_transaction_participants-p1` remains supporting in-flight context.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-other-partition-target-reservation-20260507T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-other-partition-target-reservation-20260507T000000Z/rolling-restart/`.
3. Result: failed after `131.7s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. `npm run analyze:distributed-failure` selects root cause class
   `topology`, dominant reason
   `priority_recovery_workflow_progress_transition_deferred`, and failure
   class `priority_recovery_progress_blocked`.
6. Publication convergence is epoch `4` `PUBLISHED` with pending ACK count
   `0`, snapshot coverage `2/5`, priority spread pending, and startup
   active-gate timeout support only.
7. `npm run analyze:topology-convergence` on the report and matching playback
   both select `operation_workflow_owner / workflow_progress` as the first
   frontier, with evidence anchored under
   `publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
   (or the matching playback path).
8. The dominant witness is `sql_write_operations-p1`, semantic state
   `needs_operation`, progress class `priority_operation_serial_wait`,
   next action `wait_for_operation_progress`, and actuation state
   `transition_deferred`.
9. The supporting serial-wait carrier is `sql_transaction_participants-p1`,
   which remains unresolved under the same owner and boundary.
10. The direct lower-owner target-reservation seam is therefore closed enough
    to stop spending package effort on operation creation; the next worker
    should spend proof on the migrated workflow-progress transition seam.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed lower-owner target-reservation repair from the
   predecessor package.
2. Extract the focused epoch-4 workflow-progress witness set for
   `sql_write_operations-p1` and its serial-wait dependency.
3. Add one focused workflow-progress regression for the selected
   `priority_operation_serial_wait / wait_for_operation_progress` seam.
4. Repair or reclassify the selected deferred transition seam without
   reopening the closed operation-scheduling boundary.
5. Rerun focused tests, touched-file static guardrails, and one
   representative `rolling-restart` scenario.

## Out Of Scope

1. Reopening the predecessor operation-scheduling package unless a fresh
   representative artifact again selects `rebalancer_leader /
   operation_scheduling`.
2. Broad matrix continuation before the representative five-node blocker
   closes or migrates again.
3. Harness-only timeout increases or blocker relabeling that hide the current
   workflow-progress debt.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner / workflow_progress` owns the direct epoch `4`
   `PUBLISHED` `sql_write_operations-p1` serial-wait transition seam.
2. `sql_transaction_participants-p1` remains supporting in-flight priority
   context unless a fresh representative artifact promotes it above
   `sql_write_operations-p1`.
3. `startup_active_gate_owner / snapshot_coverage` remains supporting evidence
   while the direct unresolved frontier is still priority-recovery workflow
   progress.
4. `rebalancer_leader / operation_scheduling` stays closed unless a fresh
   representative artifact restores `create_recovery_operation` as the direct
   lower owner.

Canonical contract shape:

1. For the live epoch `4` `PUBLISHED` artifact, `sql_write_operations-p1`
   must either advance past `priority_operation_serial_wait` or surface one
   canonical workflow-progress reason why the transition remains deferred.
2. Supporting priority partitions must not outrank the canonical
   `sql_write_operations-p1` workflow-progress witness in the same artifact.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Lorentz` (`019e03b6-93f2-7793-8f28-90f9c3215e0d`) reviewed
      `work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Hilbert` (`019e03bb-26ad-7bb1-8de9-4ad064559905`) fixed
      `work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md`.
- [ ] Implementation subagent recorded:

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [ ] Extract the focused epoch-4 workflow-progress witness for
      `sql_write_operations-p1` serial wait and supporting
      `sql_transaction_participants-p1`.
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

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-other-partition-target-reservation-20260507T000000Z.report.json --fast-local --verbose`
   failed after `131.7s`, but closed the direct lower-owner target-reservation
   seam and migrated the representative blocker to
   `operation_workflow_owner / workflow_progress`.
2. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-other-partition-target-reservation-20260507T000000Z.report.json`
   selected `priority_recovery_workflow_progress_transition_deferred` as the
   normalized dominant reason.
3. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-other-partition-target-reservation-20260507T000000Z.report.json`
   and the matching playback failure bundle both selected
   `operation_workflow_owner / workflow_progress` as the first frontier.
