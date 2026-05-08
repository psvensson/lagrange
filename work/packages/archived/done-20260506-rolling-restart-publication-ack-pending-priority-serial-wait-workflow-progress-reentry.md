# Rolling Restart Publication ACK-Pending Priority Serial-Wait Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z/rolling-restart/",
  "owner": "Publication recovery gate over pending ACK convergence and priority serial-wait workflow progress",
  "boundary": "Publication ACK-pending priority serial-wait workflow progress",
  "dominantReason": "pending_ack_nodes",
  "currentState": "The stale serial-wait blocker seam is closed. The representative rerun no longer leaves sql_transactions-p1 on priority_operation_serial_wait: sql_transactions-p1 moves to spread_satisfied_in_flight under epoch 5 ACK_PENDING, while the live blocker migrates to sql_transaction_participants-p1 terminal rebalancer_handoff with supporting replica_operations-p1 workflow timeout debt.",
  "nextAction": "Continue in work/packages/active-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-stalled-followup-reentry.md to extract the epoch-5 handoff/timeout fixture and repair only that owner path.",
  "proof": [
    "Focused retained-carrier stale serial-wait release regression",
    "Affected priority-recovery snapshot proof",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-3.js",
    "test/control-plane/priority-recovery-snapshot.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-join-contacting-seed-bootstrap-readiness-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/active-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-stalled-followup-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Join Contacting Seed Bootstrap Readiness Reentry](./done-20260506-rolling-restart-startup-join-contacting-seed-bootstrap-readiness-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Publication ACK-Pending Rebalancer Handoff Stalled Followup Reentry](./active-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-stalled-followup-reentry.md).

## Closure Summary

1. Added a focused regression proving tracked priority-recovery snapshots must
   release stale `priority_operation_serial_wait` blockers when the only
   remaining source collapses to a spread-satisfied retained carrier.
2. Repaired
   `src/control-plane/priority-recovery-snapshot-stage-3.js`
   so serial-wait-only no-operation snapshots fall back to the canonical
   `eligible_but_no_operation_created` contract when stage-3 still sees global
   serial-lane evidence but nothing valid remains for that target.
3. Focused red/green proof, the full
   `test/control-plane/priority-recovery-snapshot.test.js` suite, and the
   touched-file guardrails all passed after the repair.
4. The representative rerun
   `rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z`
   closed the serial-wait workflow seam and exposed a new epoch-5
   ACK-pending rebalancer-handoff / stale follow-up blocker.

## Final Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z/rolling-restart/`.
3. Result: failed after `134.4s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification remains `publication_convergence_blocked` with
   confidence `high`, root cause class `topology`, and dominant reason
   `pending_ack_nodes`.
6. Publication convergence moved to epoch `5` `ACK_PENDING` with pending ACK
   count `1`, blocked-node count `0`, missing-published count `0`, and
   recovery protocol state `publication_pending`.
7. Current active-gate progress reaches active `3/5`, snapshot coverage
   `2/5`, selected snapshot node `11601...`, and blocker signature
   `inactive_nodes=2|snapshot_coverage=2/5|priority_recovery_progress_class=operation_created_but_no_step_transitions`.
8. The closed seam no longer dominates:
   `priority_operation_serial_wait` is absent from unresolved class ids,
   `sql_transactions-p1` is now `spread_satisfied_in_flight`, and the old
   workflow-owned serial-wait blocker does not reappear in the representative
   report.
9. The new dominant priority-recovery witness is
   `sql_transaction_participants-p1`, now `blocked_unclassified` under
   `rebalancer_leader / rebalancer_handoff` with
   `nextRequiredAction=schedule_followup_rebalance` and a retained diagnostic
   backlink to `sql_write_operations-p1`.
10. Supporting follow-up debt now includes:
    `replica_operations-p1` `operation_stalled` under
    `operation_workflow_owner / workflow_timeout`, and
    `sql_write_operations-p1` `recovering_in_flight` under
    `operation_workflow_owner / workflow_progress`.
11. Join-time `contacting_seed` failures on `35a...` and `8be8...`, plus
    repeated outbound queue saturation on seed `7493...` for
    `target:11601.../partition/sql_transactions-p1-r4`, remain supporting
    evidence only. The live owner has moved away from serial-wait workflow
    progress.

## Residual Closure Inventory

- [x] Extract the `215236Z` stale serial-wait release fixture.
- [x] Decide the owner boundary: retained-carrier serial wait or selected
      publication disagreement.
- [x] Add the focused regression and repair the selected owner path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.
- [x] Split the follow-on rebalancer-handoff / stale follow-up blocker into a
      new active package before closure.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, or runtime-grammar
      violation remains.
- [x] Follow-on runtime migration is split into the successor package above.

## Validation

1. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js -g "tracked priority recovery decision snapshots release stale serial-wait blockers once the only source collapses to a spread-satisfied carrier"`
2. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`
3. `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js`
4. `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-3.js`
5. `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot-stage-3.js`
6. `git diff --check`
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z.report.json --fast-local --verbose`
