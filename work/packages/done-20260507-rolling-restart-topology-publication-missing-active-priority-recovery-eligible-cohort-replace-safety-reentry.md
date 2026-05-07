# Rolling Restart Topology Publication Missing-Active Priority Recovery Eligible-Cohort Replace-Safety Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "closed": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-eligible-cohort-materialized-preserve-20260507T044845Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-eligible-cohort-materialized-preserve-20260507T044845Z/rolling-restart/",
  "owner": "Topology publication missing-active node over priority recovery eligible-cohort replace-safety regression after join-time recovery-routing closure",
  "boundary": "Topology publication missing-active node / priority recovery eligible-cohort replace-safety owner",
  "dominantReason": "priority_recovery_rebalancer_handoff_terminal_failed",
  "currentState": "The superseded-target replace-safety seam is closed. The representative rerun no longer terminates on sql_transactions-p1 eligible-cohort rejection after target materialization; sql_transactions-p1 remains recovering_in_flight under operation 2ac8218e-15db-467f-8d23-eb483c72b427, while the live blocker migrates to epoch 4 PUBLISHED with active 2/5, snapshot coverage 3/5, and dominant reason priority_recovery_rebalancer_handoff_terminal_failed.",
  "nextAction": "Continue in work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-rebalancer-handoff-terminal-failed-reentry.md to extract the 044845Z rebalancer-handoff witnesses for replica_operations-p1 and sql_transactions-p1, add a focused stalled follow-up regression, repair only that owner boundary, and rerun one representative rolling-restart scenario.",
  "proof": [
    "Focused priority recovery replace-safety regressions",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-6.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-eligible-cohort-replace-safety-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-control-plane-publication-workflow-progress-reentry.md",
  "successor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-rebalancer-handoff-terminal-failed-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Control-Plane Publication Workflow Progress Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-control-plane-publication-workflow-progress-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Topology Publication Missing-Active Priority Recovery Rebalancer Handoff Terminal-Failed Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-rebalancer-handoff-terminal-failed-reentry.md).

## Closure Summary

1. Repaired the priority-recovery superseded-target boundary so a pre-sync
   `REPLACE` that has already materialized on the target does not fail
   terminally just because the effective eligible cohort changed later.
2. Bound the owner and observer paths to one shared materialization rule in
   `operation-workflow-owner-shared`, then applied that rule to both the
   local superseded-target gate and the remote pre-sync drain path.
3. Added focused regressions proving both sides of the boundary: the local
   owner gate now defers superseded-target failure for a materialized target,
   and the remote observer path preserves in-flight pre-sync progress for the
   same shape.
4. The representative rerun
   `rolling-restart-after-eligible-cohort-materialized-preserve-20260507T044845Z`
   removed the old eligible-cohort/materialized-target failure from the live
   owner path and exposed a new rebalancer-handoff stalled-follow-up seam.

## Final Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-eligible-cohort-materialized-preserve-20260507T044845Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-eligible-cohort-materialized-preserve-20260507T044845Z/rolling-restart/`.
3. Result: failed after `132.7s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. The repaired seam is closed in runtime evidence:
   `sql_transactions-p1` no longer terminates on the old
   out-of-cohort/materialized-target rejection. The target owner
   `35a891...` persists `2ac8218e-15db-467f-8d23-eb483c72b427` to
   `SENDING` and receives `CREATE_REPLICA` for `sql_transactions-p1-r5`.
6. The representative failure now migrates to root cause class `topology`,
   dominant reason `priority_recovery_rebalancer_handoff_terminal_failed`,
   recovery protocol state `priority_spread_pending`, and active progress
   `2/5` with snapshot coverage `3/5` at epoch `4` `PUBLISHED`.
7. The triage summary now selects owner `rebalancer_leader`,
   boundary `rebalancer_handoff`, wait mode `stalled`, and next action
   `schedule_followup_rebalance`.
8. The new failure bundle retains three blocked priority partitions:
   `replica_operations-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1`. The dominant stalled-progress shape is no
   longer replace-safety rejection; it is follow-up actuation debt split
   across `recovering_in_flight`, `needs_operation`, and
   `blocked_unclassified`.
9. Supporting runtime evidence includes:
   `replica_operations-p1` target creation on `35a891...` failing bootstrap
   ingress readiness, target-owner queue saturation on the seed, and two
   joiners still stuck in `contacting_seed`. Those remain subordinate until
   the successor package proves whether the new direct owner is handoff,
   workflow progression, or startup inability to accept the follow-up.

## Residual Closure Inventory

- [x] Extract the `041947Z` eligible-cohort / replace-safety witness fixture.
- [x] Decide the direct owner boundary: rebalancer admission,
      coordinator replace-safety, or stale authoritative normalization.
- [x] Add the focused regression and repair the selected owner path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.
- [x] Split the migrated rebalancer-handoff stalled-follow-up blocker into a
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
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Follow-on runtime migration is split into the successor package above.

## Validation

1. `npx tap test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`
2. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner-segment-6.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`
3. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner-segment-6.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`
4. `node scripts/check-runtime-grammar-contracts.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner-segment-6.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`
5. `npx eslint --no-warn-ignored src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner-segment-6.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`
6. `git diff --check`
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-eligible-cohort-materialized-preserve-20260507T044845Z.report.json --fast-local --verbose`
