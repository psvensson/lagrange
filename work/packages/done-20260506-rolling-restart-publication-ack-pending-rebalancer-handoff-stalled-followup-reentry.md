# Rolling Restart Publication ACK-Pending Rebalancer Handoff Stalled Followup Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z/rolling-restart/",
  "owner": "Publication recovery gate over pending ACK convergence and priority rebalancer handoff / stalled follow-up progress",
  "boundary": "Publication ACK-pending rebalancer-handoff stalled follow-up progress",
  "dominantReason": "BOOTSTRAP_PHASE_INCOMPLETE",
  "currentState": "The epoch-5 ACK_PENDING follow-up seam is closed. The representative rerun no longer leaves sql_transaction_participants-p1 on rebalancer_handoff or replica_operations-p1 on workflow_timeout; instead it migrates to startup epoch 1 PUBLISHED with snapshot coverage 1/5 and control_plane_publications-p1 stuck on source_removal workflow progress.",
  "nextAction": "Continue in work/packages/active-20260506-rolling-restart-startup-published-snapshot-coverage-control-plane-source-removal-workflow-progress-reentry.md to extract the epoch-1 PUBLISHED source-removal fixture and repair only that startup owner path.",
  "proof": [
    "Focused retained-carrier subordinated-source serial-wait regression",
    "Priority-recovery snapshot proof and summary-normalization timeout dominance proof",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-3.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-publication-ack-pending-priority-serial-wait-workflow-progress-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/active-20260506-rolling-restart-startup-published-snapshot-coverage-control-plane-source-removal-workflow-progress-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Publication ACK-Pending Priority Serial-Wait Workflow Progress Reentry](./done-20260506-rolling-restart-publication-ack-pending-priority-serial-wait-workflow-progress-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Startup Published Snapshot Coverage Control Plane Source-Removal Workflow Progress Reentry](./active-20260506-rolling-restart-startup-published-snapshot-coverage-control-plane-source-removal-workflow-progress-reentry.md).

## Closure Summary

1. Added a focused regression proving tracked priority-recovery snapshots must
   keep retained serial-wait carriers subordinate when a
   spread-satisfied sibling keeps the only live diagnostic backlink.
2. Repaired
   `src/control-plane/priority-recovery-snapshot-stage-3.js`
   so retained carriers can normalize through subordinated live sources
   without reopening the spread-satisfied stale-source regressions that were
   already closed.
3. Added a focused summary-normalization regression proving
   `workflow_timeout` must outrank workflow-owned serial waits when both
   surface on the same representative summary.
4. Focused red/green proof, the full
   `test/control-plane/priority-recovery-snapshot.test.js` suite, the summary
   normalization suite, and the touched-file guardrails all passed after the
   repair.
5. The representative rerun
   `rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z`
   closed the epoch-5 ACK-pending handoff/timeout seam and exposed a new
   startup source-removal workflow-progress blocker.

## Final Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z/rolling-restart/`.
3. Result: failed after `135.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification moved to `startup_recovery_blocked` with root cause
   class `startup` and dominant reason `BOOTSTRAP_PHASE_INCOMPLETE`.
6. Publication convergence is now epoch `1` `PUBLISHED` with pending ACK
   count `0`, blocked-node count `0`, recovery protocol state
   `steady_published`, and gate reasons `snapshot_coverage=1/5`.
7. Current active-gate progress reaches active `2/5`, snapshot coverage
   `1/5`, selected snapshot node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and blocker signature
   `inactive_nodes=3|snapshot_coverage=1/5`.
8. The closed seam no longer dominates: priority recovery has no unresolved
   partitions, `sql_transaction_participants-p1` is `converged`, and
   `replica_operations-p1` is only `spread_satisfied_in_flight`.
9. The new dominant workflow witness is `control_plane_publications-p1`,
   surfaced under `operation_workflow_owner / workflow_progress` with
   `nextRequiredAction=wait_for_operation_progress`,
   `workflowProgressPhaseId=source_removal`, and operation
   `9a3e654e-ab3f-4ca5-ad69-a78ac25728c3`.
10. Supporting runtime evidence on the selected snapshot includes repeated
    `replace_remove_safety_blocked` deferrals, stale `MOVE_REPLICA`
    reservation invalidations with `source_owner_unavailable`, and bounded
    bootstrap admission with `move_replica_handoff_stabilizing`.

## Residual Closure Inventory

- [x] Extract the epoch-`5` pending-ACK handoff/timeout seam through the
      retained-carrier diagnostic backlinks.
- [x] Decide the owner boundary: retained-carrier serial wait, stale
      workflow timeout dominance, or stronger publication consumer
      disagreement.
- [x] Add the focused regressions and repair the selected owner path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.
- [x] Split the follow-on startup source-removal workflow-progress blocker
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

1. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js -g "tracked priority recovery decision snapshots keep retained serial-wait carriers subordinate when spread-satisfied siblings keep diagnostic backlinks"`
2. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`
3. `node --test test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
4. `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
5. `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-3.js`
6. `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot-stage-3.js`
7. `git diff --check`
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z.report.json --fast-local --verbose`
