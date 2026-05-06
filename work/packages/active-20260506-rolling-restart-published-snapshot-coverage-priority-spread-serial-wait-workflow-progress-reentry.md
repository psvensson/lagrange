# Rolling Restart Published Snapshot Coverage Priority Spread Serial-Wait Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z/rolling-restart/",
  "owner": "Publication recovery gate over priority spread convergence and workflow-owned serial wait / coordination-mismatch progress",
  "boundary": "Published snapshot coverage priority spread serial-wait workflow progress",
  "dominantReason": "priority_recovery_workflow_progress_transition_deferred",
  "currentState": "The startup source-removal seam is closed: the representative rerun now reaches epoch 4 PUBLISHED with pendingAckCount 0, active 3/5, snapshot coverage 2/5, and recoveryProtocolState priority_spread_pending. The live owner is sql_write_operations-p1 under operation_workflow_owner / workflow_progress with priority_operation_serial_wait through sql_transactions-p1, while sql_transactions-p1 itself is blocked as publication_recovery_eligible_but_coordinator_excludes_node and seed transport saturation on sql_transaction_participants-p1-r4 remains supporting evidence.",
  "nextAction": "Extract the 224415Z epoch-4 PUBLISHED priority-spread fixture for sql_write_operations-p1 and sql_transactions-p1; decide whether workflow-owned serial wait or publication recovery coordinator exclusion is the canonical owner; then repair only that priority-spread workflow-progress path.",
  "proof": [
    "Focused 224415Z published priority-spread fixture",
    "Owner regression for priority serial wait versus coordinator exclusion workflow progress",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-3.js",
    "src/control-plane/priority-recovery-snapshot-stage-11.js",
    "src/rebalancer/operation-workflow-owner-segment-5.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-published-snapshot-coverage-control-plane-source-removal-workflow-progress-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Published Snapshot Coverage Control Plane Source-Removal Workflow Progress Reentry](./done-20260506-rolling-restart-startup-published-snapshot-coverage-control-plane-source-removal-workflow-progress-reentry.md)
closed by migration. The representative rerun no longer terminates on
startup source-removal or stale local `MOVE_REPLICA` blocker debt;
publication is already `PUBLISHED`, but the gate still times out because
priority spread remains open under serial-wait and coordination-mismatch
workflow progress.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z/rolling-restart/`.
3. Result: failed after `133.7s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification: `priority_recovery_progress_blocked` with root
   cause class `topology` and dominant reason
   `priority_recovery_workflow_progress_transition_deferred`.
6. Publication convergence is epoch `4` `PUBLISHED` with pending ACK count
   `0`, blocked-node count `0`, missing-published count `0`, and recovery
   protocol state `priority_spread_pending`.
7. Current active-gate progress ends at active `3/5`, snapshot coverage
   `2/5`, selected snapshot node
   `11601fe0-72d6-5853-8590-ec2881853e72`, and blocker signature
   `inactive_nodes=2|snapshot_coverage=2/5|priority_recovery_progress_class=priority_operation_serial_wait|priority_recovery_progress_class=publication_recovery_eligible_but_coordinator_excludes_node`.
8. `sql_write_operations-p1` is the dominant progress witness:
   `needs_operation` under `operation_workflow_owner / workflow_progress`,
   with blocker `priority_operation_serial_wait`,
   `nextRequiredAction=wait_for_operation_progress`, and serial-wait
   dependency on `sql_transactions-p1`.
9. `sql_transactions-p1` is supporting current debt:
   `coordination_mismatch` under
   `publication_recovery_eligible_but_coordinator_excludes_node`,
   with latest operation `fadb82b1-231c-4ef8-99bb-d712908c9bd1` still
   `pending` at workflow step `SENDING`.
10. `control_plane_publications-p1`, `replica_operations-p1`, and
    `sql_transaction_participants-p1` are already
    `spread_satisfied_in_flight`; the closed startup source-removal seam is
    predecessor history only.
11. Supporting runtime evidence on the seed shows repeated outbound queue
    saturation for delivery source
    `target:11601fe0-72d6-5853-8590-ec2881853e72/partition/sql_transaction_participants-p1-r4`,
    so transport pressure remains supporting evidence for the current
    priority-spread owner path.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `224415Z` epoch-`4` `PUBLISHED` fixture for
   `sql_write_operations-p1` and `sql_transactions-p1`.
2. Decide whether the canonical owner is workflow-owned serial wait,
   publication recovery coordinator exclusion, or a stronger
   pressure/visibility consumer disagreement.
3. Repair only the selected priority-spread workflow-progress owner path.
4. Preserve the closed startup source-removal reservation-refresh regression.

## Out Of Scope

1. Reopening the closed startup source-removal package unless that exact seam
   re-enters the representative blocker.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Publication recovery gate for epoch `4` `PUBLISHED` convergence while
   priority spread remains unsatisfied and pending ACK debt stays closed.
2. `operation_workflow_owner` serial-wait workflow progress for
   `sql_write_operations-p1` only while a current predecessor operation still
   owns the wait.
3. Publication recovery coordinator exclusion for `sql_transactions-p1` only
   while the current operation remains excluded from the eligible published
   cohort.

Canonical contract shape:

1. `priority_spread_pending` must surface one bounded current owner path for
   the unresolved spread gap, not a mixed summary of stale workflow
   history and unrelated startup evidence.
2. `priority_operation_serial_wait` must name one current predecessor
   operation and one serial-wait partition, and it must remain subordinate to
   stronger current owner evidence when the predecessor has migrated.
3. Failure bundle, replay, focused fixture evidence, and sprint bookkeeping
   must agree on whether workflow-owned serial wait or coordinator exclusion
   is the canonical current owner.

## Residual Closure Inventory

- [ ] Extract the `224415Z` published priority-spread fixture.
- [ ] Decide the owner boundary: workflow-owned serial wait, coordinator
      exclusion, or stronger pressure/visibility consumer disagreement.
- [ ] Add the focused regression and repair the selected owner path.
- [ ] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [ ] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [ ] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Progress Notes

May 6 migration from the startup source-removal package:

1. Bootstrap reservation collection now refreshes uncovered local
   `MOVE_REPLICA` reservations from durable `replica_operations` state before
   they can keep bootstrap admission blocked.
2. Focused stale-local blocker proof, the full bootstrap assignment suite, and
   the touched-file guardrails all passed after the repair.
3. Representative rerun
   `rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z`
   removed the startup source-removal blocker and moved the representative
   seam into published priority-spread workflow progress.
4. The active package now owns `sql_write_operations-p1`
   serial-wait debt, `sql_transactions-p1` coordinator exclusion debt, and
   the supporting seed transport saturation evidence.

## Validation

1. `./node_modules/.bin/tap test/bootstrap/move-replica-assignment-token.test.js`
2. `node scripts/check-guideline-literals.js src/bootstrap/owners/move-replica-assignment-owner.js test/bootstrap/move-replica-assignment-token.test.js`
3. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/owners/move-replica-assignment-owner.js`
4. `node scripts/check-runtime-grammar-contracts.js src/bootstrap/owners/move-replica-assignment-owner.js`
5. `git diff --check`
6. Representative rerun:
   `test-output/reports/rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z.report.json`.

## Done When

1. The representative path either clears the published priority-spread
   blocker or migrates to a different named owner boundary with replayable
   evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
