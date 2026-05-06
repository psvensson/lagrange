# Rolling Restart Startup Published Snapshot Coverage Control Plane Source-Removal Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z/rolling-restart/",
  "owner": "Startup published snapshot-coverage convergence over control-plane publication source-removal workflow progress",
  "boundary": "Startup published snapshot coverage control-plane source-removal workflow progress",
  "dominantReason": "priority_recovery_workflow_progress_transition_deferred",
  "currentState": "The stale local MOVE_REPLICA blocker seam is closed. The representative rerun no longer stalls at epoch 1 PUBLISHED source-removal progress; it migrates to epoch 4 PUBLISHED priority_spread_pending with sql_write_operations-p1 on priority_operation_serial_wait and sql_transactions-p1 on publication_recovery_eligible_but_coordinator_excludes_node.",
  "nextAction": "Continue in work/packages/active-20260506-rolling-restart-published-snapshot-coverage-priority-spread-serial-wait-workflow-progress-reentry.md to extract the epoch-4 priority-spread fixture and repair only that owner path.",
  "proof": [
    "Focused stale local MOVE_REPLICA terminal-row refresh regression",
    "Full bootstrap MOVE_REPLICA assignment proof",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/bootstrap/owners/move-replica-assignment-owner.js",
    "test/bootstrap/move-replica-assignment-token.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-stalled-followup-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/active-20260506-rolling-restart-published-snapshot-coverage-priority-spread-serial-wait-workflow-progress-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Publication ACK-Pending Rebalancer Handoff Stalled Followup Reentry](./done-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-stalled-followup-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Published Snapshot Coverage Priority Spread Serial-Wait Workflow Progress Reentry](./active-20260506-rolling-restart-published-snapshot-coverage-priority-spread-serial-wait-workflow-progress-reentry.md).

## Closure Summary

1. Added a focused regression proving bootstrap admission must refresh a stale
   local `MOVE_REPLICA` reservation from the durable terminal row when cache
   visibility for `replica_operations` is missing.
2. Repaired
   `src/bootstrap/owners/move-replica-assignment-owner.js`
   so cache-confirmed reservations still stay on the fast path, but uncovered
   local reservations fall through to one bounded SQL refresh before they can
   keep blocking bootstrap admission.
3. The full
   `test/bootstrap/move-replica-assignment-token.test.js` suite and the
   touched-file guardrails all passed after the repair.
4. Representative rerun
   `rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z`
   removed the startup source-removal / stale-assignment seam and exposed a
   new published priority-spread workflow-progress blocker.

## Final Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z/rolling-restart/`.
3. Result: failed after `133.7s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification moved to `priority_recovery_progress_blocked` with
   root cause class `topology` and dominant reason
   `priority_recovery_workflow_progress_transition_deferred`.
6. Publication convergence is now epoch `4` `PUBLISHED` with pending ACK
   count `0`, blocked-node count `0`, recovery protocol state
   `priority_spread_pending`, and gate reasons
   `priority_partitions_not_spread` plus `snapshot_coverage=2/5`.
7. Current active-gate progress reaches active `3/5`, snapshot coverage
   `2/5`, selected snapshot node
   `11601fe0-72d6-5853-8590-ec2881853e72`, and blocker signature
   `inactive_nodes=2|snapshot_coverage=2/5|priority_recovery_progress_class=priority_operation_serial_wait|priority_recovery_progress_class=publication_recovery_eligible_but_coordinator_excludes_node`.
8. The closed seam no longer dominates: the `epoch 1` `PUBLISHED`
   `control_plane_publications-p1` `source_removal` witness is absent from
   the dominant current owner path.
9. The new dominant workflow witness is `sql_write_operations-p1`, surfaced
   under `operation_workflow_owner / workflow_progress` with semantic state
   `needs_operation`, blocker `priority_operation_serial_wait`, and serial
   wait through `sql_transactions-p1`.
10. Supporting current-session evidence also shows `sql_transactions-p1`
    under `publication_recovery_eligible_but_coordinator_excludes_node`
    with latest workflow step `SENDING`, and repeated seed transport
    saturation on
    `target:11601fe0-72d6-5853-8590-ec2881853e72/partition/sql_transaction_participants-p1-r4`.

## Residual Closure Inventory

- [x] Extract the `222400Z` startup source-removal fixture.
- [x] Decide the owner boundary: stale local reservation blocker versus
      durable terminal assignment visibility.
- [x] Add the focused regression and repair the selected owner path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.
- [x] Split the follow-on published priority-spread workflow-progress blocker
      into a new active package before closure.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Follow-on runtime migration is split into the successor package above.

## Validation

1. `./node_modules/.bin/tap test/bootstrap/move-replica-assignment-token.test.js -g "blocking admission refreshes stale in-memory MOVE_REPLICA reservation from durable terminal row when cache visibility is missing"`
2. `./node_modules/.bin/tap test/bootstrap/move-replica-assignment-token.test.js -g "bootstrap admission defers on cached MOVE_REPLICA reservations without replica_operations SQL rereads|MOVE_REPLICA reservation SQL fallback backs off after retryable lookup pressure|bootstrap preserves MOVE_REPLICA assignment after retryable reservation persistence failure"`
3. `./node_modules/.bin/tap test/bootstrap/move-replica-assignment-token.test.js`
4. `node scripts/check-guideline-literals.js src/bootstrap/owners/move-replica-assignment-owner.js test/bootstrap/move-replica-assignment-token.test.js`
5. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/owners/move-replica-assignment-owner.js`
6. `node scripts/check-runtime-grammar-contracts.js src/bootstrap/owners/move-replica-assignment-owner.js`
7. `git diff --check`
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-stale-move-assignment-sql-refresh-20260506T224415Z.report.json --fast-local --verbose`
