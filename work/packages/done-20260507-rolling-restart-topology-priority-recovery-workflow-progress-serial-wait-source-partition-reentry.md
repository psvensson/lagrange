# Rolling Restart Topology Priority Recovery Workflow Progress Serial-Wait Source Partition Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-planning-serial-wait-reuse-20260507T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-planning-serial-wait-reuse-20260507T000000Z/rolling-restart/",
  "owner": "Priority recovery workflow progress transition deferred after planning-only serial-wait carrier repair",
  "boundary": "Operation workflow owner / workflow_progress / startup active gate support",
  "dominantReason": "priority_recovery_workflow_progress_transition_deferred",
  "currentState": "The source-partition workflow-progress repair is proved. The focused workflow owner now prefers live authoritative workflow progress for sql_transaction_participants-p1 while retaining supporting carrier context from planning, but the representative rerun still fails and migrates within the same owner owner boundary family: epoch 4 PUBLISHED now selects replica_operations-p1 as the dominant operation_workflow_owner blocker under operation_created_but_no_step_transitions / reconcile_stale_operation_progress, with sql_transaction_participants-p1 and sql_write_operations-p1 retained as supporting context and startup active-gate timeout still downstream only.",
  "nextAction": "Continue in work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-stale-operation-progress-reentry.md for the migrated replica_operations-p1 workflow_timeout stale-operation-progress seam.",
  "proof": [
    "Focused epoch-2 PUBLISHED workflow-progress witness for sql_transaction_participants-p1 priority_operation_serial_wait with supporting replica_operations-p1 and sql_write_operations-p1 context",
    "Focused workflow-progress regression for the selected source-partition serial-wait seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-source-partition-reentry.md",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-4.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-5.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-reentry.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-stale-operation-progress-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Priority Recovery Workflow Progress Serial-Wait Reentry](./done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-reentry.md)
closes by migration. The representative rerun keeps the direct owner boundary
on `operation_workflow_owner / workflow_progress`, but the repaired
`sql_write_operations-p1` carrier no longer owns the dominant witness. The
live blocker now sits on `sql_transaction_participants-p1` in epoch `2`
`PUBLISHED`, where `priority_operation_serial_wait ->
wait_for_operation_progress` remains unresolved and
`replica_operations-p1` plus `sql_write_operations-p1` stay supporting
serial-wait context only.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-planning-serial-wait-reuse-20260507T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-planning-serial-wait-reuse-20260507T000000Z/rolling-restart/`.
3. Result: failed after `132.0s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. `npm run analyze:distributed-failure` keeps root cause class `topology`,
   dominant reason `priority_recovery_workflow_progress_transition_deferred`,
   and failure class `priority_recovery_progress_blocked`.
6. Publication convergence is epoch `2` `PUBLISHED` with pending ACK count
   `0`, snapshot coverage `2/5`, priority spread pending, and startup
   active-gate timeout support only.
7. `npm run analyze:topology-convergence` on the report and matching playback
   both keep `operation_workflow_owner / workflow_progress` as the first
   frontier, with evidence anchored under
   `publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
   (or the matching playback path).
8. The dominant witness is `sql_transaction_participants-p1`, semantic state
   `needs_operation`, progress class `priority_operation_serial_wait`,
   next action `wait_for_operation_progress`, actuation state
   `transition_deferred`, and workflow evidence carried by operation
   `34c4e318-b6cf-4e39-9cbb-51964e521062`.
9. The supporting serial-wait carriers are `replica_operations-p1` and
   `sql_write_operations-p1`, which remain unresolved under the same owner and
   boundary but no longer outrank `sql_transaction_participants-p1`.
10. After repairing source-partition workflow-progress reuse, the
    representative rerun in
    `test-output/reports/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z.report.json`
    still fails, but it changes the direct witness again without reopening the
    lower owner family: epoch `4` `PUBLISHED` now promotes
    `replica_operations-p1` as the dominant
    `operation_created_but_no_step_transitions ->
    reconcile_stale_operation_progress` partition under
    `operation_workflow_owner / workflow_timeout`, with
    `sql_transaction_participants-p1`, `sql_transactions-p1`, and
    `sql_write_operations-p1` retained as supporting context.
11. The repaired source-partition seam is therefore closed enough to stop
    spending package effort on `sql_transaction_participants-p1`
    workflow-progress reuse; the next worker should spend proof on the
    migrated `replica_operations-p1` workflow-timeout transition seam.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed planning-only carrier repair from the predecessor
   package.
2. Extract the focused epoch-2 workflow-progress witness set for
   `sql_transaction_participants-p1` and its supporting serial-wait carriers.
3. Add one focused workflow-progress regression for the selected
   `priority_operation_serial_wait / wait_for_operation_progress` seam.
4. Repair or reclassify the selected deferred transition seam without
   reopening the closed operation-scheduling boundary or the repaired carrier
   path.
5. Rerun focused tests, touched-file static guardrails, and one
   representative `rolling-restart` scenario.

## Out Of Scope

1. Reopening the predecessor workflow-progress carrier package unless a fresh
   representative artifact again selects `sql_write_operations-p1` above the
   new source partition witness.
2. Broad matrix continuation before the representative five-node blocker
   closes or migrates again.
3. Harness-only timeout increases or blocker relabeling that hide the current
   workflow-progress debt.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner` owns the direct representative transition seam
   for this package.
2. `sql_transaction_participants-p1` owned the opening workflow-progress
   witness, but the final representative rerun migrates that role to
   `replica_operations-p1` under `workflow_timeout` without reopening the
   closed operation-scheduling boundary.
3. `sql_write_operations-p1` remains supporting priority context unless a
   fresh representative artifact promotes it above the new timeout witness.
4. `startup_active_gate_owner / snapshot_coverage` remains supporting evidence
   while the direct unresolved frontier is still priority-recovery workflow
   progress.
5. `rebalancer_leader / operation_scheduling` stays closed unless a fresh
   representative artifact restores `create_recovery_operation` as the direct
   lower owner.

Canonical contract shape:

1. The selected source-partition repair must preserve live authoritative
   workflow progress when authoritative operations exist, while retaining only
   supporting serial-wait carrier context from planning.
2. If a representative rerun promotes another partition above
   `sql_transaction_participants-p1` under the same owner family, this
   package closes by migration and the successor package takes ownership of
   that new direct witness.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Ramanujan` (`019e03ce-efea-7ba2-8faf-171a3797e7df`) reviewed
      `work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Pascal` (`019e03d3-0e55-7d60-bbeb-c88672c8be08`) fixed
      `work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-reentry.md`.
- [x] Implementation subagent recorded:
      Agent `Epicurus` (`019e03d8-d16f-72f0-9935-177286b95630`) implemented
      `work/packages/done-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-source-partition-reentry.md`.

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [x] Extract the focused epoch-2 workflow-progress witness for
      `sql_transaction_participants-p1` serial wait and supporting
      `replica_operations-p1` plus `sql_write_operations-p1`.
- [x] Add the focused regression for the selected workflow-progress seam.
- [x] Repair the selected workflow-progress boundary or migrate again with
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

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-planning-serial-wait-reuse-20260507T000000Z.report.json --fast-local --verbose`
   failed after `132.0s`, but closed the planning-only carrier regression and
   migrated the direct workflow-progress witness to
   `sql_transaction_participants-p1`.
2. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-planning-serial-wait-reuse-20260507T000000Z.report.json`
   kept normalized dominant reason
   `priority_recovery_workflow_progress_transition_deferred`.
3. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-planning-serial-wait-reuse-20260507T000000Z.report.json`
   and the matching playback failure bundle both kept
   `operation_workflow_owner / workflow_progress` as the first frontier while
   promoting `sql_transaction_participants-p1` to the dominant witness.
4. `node test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   initially failed on the new source-partition regression because stage 5
   reused the planning snapshot even when authoritative operations already
   existed for `sql_transaction_participants-p1`, preserving stale
   planning-only state instead of live workflow progress.
5. After restricting planning reuse to no-local-operation cases and retaining
   supporting carrier context only, the same targeted test passed with
   `36/36` assertions green, including the new
   `sql_transaction_participants-p1` source-partition regression.
6. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
   passed with `0` new literal-guideline violations.
7. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
   passed with `0` decision-boundary violations.
8. `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
   passed with `0` runtime-grammar-contract violations.
9. `git diff --check -- src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   passed with no whitespace or conflict-marker issues.
10. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z.report.json --fast-local --verbose`
    failed after `134.4s`, but closed the source-partition workflow-progress
    reuse regression and migrated the direct owner boundary to
    `operation_workflow_owner / workflow_timeout`.
11. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z.report.json`
    selected normalized dominant reason
    `priority_recovery_workflow_timeout_transition_deferred`.
12. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-source-partition-progress-reuse-20260507T000000Z.report.json`
    and the matching playback failure bundle both selected
    `operation_workflow_owner / workflow_timeout` as the first frontier while
    promoting `replica_operations-p1` to the dominant witness.
