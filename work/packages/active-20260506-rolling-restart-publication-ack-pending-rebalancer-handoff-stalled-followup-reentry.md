# Rolling Restart Publication ACK-Pending Rebalancer Handoff Stalled Followup Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z/rolling-restart/",
  "owner": "Publication recovery gate over pending ACK convergence and priority rebalancer handoff / stalled follow-up progress",
  "boundary": "Publication ACK-pending rebalancer-handoff stalled follow-up progress",
  "dominantReason": "pending_ack_nodes",
  "currentState": "The stale serial-wait workflow seam is closed: sql_transactions-p1 is now spread_satisfied_in_flight and priority_operation_serial_wait no longer dominates the representative report. The rerun migrates to epoch 5 ACK_PENDING with active-gate progress 3/5, snapshot coverage 2/5 on selected snapshot 11601..., and a new priority follow-up chain: sql_transaction_participants-p1 is terminal blocked_unclassified under rebalancer_leader / rebalancer_handoff, replica_operations-p1 is operation_stalled under operation_workflow_owner / workflow_timeout, and sql_write_operations-p1 remains recovering_in_flight.",
  "nextAction": "Extract the 215236Z epoch-5 ACK_PENDING fixture for sql_transaction_participants-p1, replica_operations-p1, and sql_write_operations-p1; decide whether terminal rebalancer_handoff or stale workflow timeout is the canonical owner; then repair only that publication/follow-up path.",
  "proof": [
    "Focused 215236Z publication ACK-pending handoff/timeout fixture",
    "Owner regression for pending-ACK rebalancer handoff or stale follow-up progress",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-11.js",
    "src/rebalancer/operation-workflow-owner-segment-5.js",
    "src/rebalancer/unified-rebalancer-segment-4.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-publication-ack-pending-priority-serial-wait-workflow-progress-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Publication ACK-Pending Priority Serial-Wait Workflow Progress Reentry](./done-20260506-rolling-restart-publication-ack-pending-priority-serial-wait-workflow-progress-reentry.md)
closed by migration. The retained-carrier serial-wait release now lands, so
the representative seam has moved away from `sql_transactions-p1`
workflow-owned serial wait and into follow-up recovery progress.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z/rolling-restart/`.
3. Result: failed after `134.4s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification: `publication_convergence_blocked` with confidence
   `high`, root cause class `topology`, and dominant reason
   `pending_ack_nodes`.
6. Publication convergence is epoch `5` `ACK_PENDING` with pending ACK count
   `1`, blocked-node count `0`, missing-published count `0`, and recovery
   protocol state `publication_pending`.
7. Current active-gate progress ends at active `3/5`, snapshot coverage
   `2/5`, selected snapshot node
   `11601fe0-72d6-5853-8590-ec2881853e72`, and blocker signature
   `inactive_nodes=2|snapshot_coverage=2/5|priority_recovery_progress_class=operation_created_but_no_step_transitions`.
8. `sql_transaction_participants-p1` is the dominant priority-recovery
   witness: `blocked_unclassified` under
   `rebalancer_leader / rebalancer_handoff`, with
   `nextRequiredAction=schedule_followup_rebalance`, `waitMode=stalled`,
   `workflowProgressPhaseId=terminal`, and a retained diagnostic backlink to
   `sql_write_operations-p1`.
9. `replica_operations-p1` is supporting follow-up debt:
   `operation_stalled` under
   `operation_workflow_owner / workflow_timeout`, with
   `nextRequiredAction=reconcile_stale_operation_progress`,
   `waitMode=timeout_reconcile_due`, and pending operation
   `f857e2da-2c45-45fa-8709-d3494776cb32`.
10. `sql_write_operations-p1` remains `recovering_in_flight` under
    `operation_workflow_owner / workflow_progress`, while
    `sql_transactions-p1` is now `spread_satisfied_in_flight`; the closed
    serial-wait seam is subordinate history only.
11. Join-time `contacting_seed` failures on `35a...` and `8be8...`, plus
    repeated seed outbound queue saturation on
    `target:11601.../partition/sql_transactions-p1-r4`, remain supporting
    runtime evidence only unless the follow-up owner boundary collapses back
    into transport or startup.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `215236Z` epoch-`5` `ACK_PENDING` fixture for
   `sql_transaction_participants-p1`, `replica_operations-p1`, and
   `sql_write_operations-p1`.
2. Decide whether the canonical owner is terminal
   `rebalancer_handoff`, stale `workflow_timeout` follow-up progress, or a
   stronger publication/failure-bundle consumer disagreement.
3. Repair only the selected publication/follow-up owner path.
4. Preserve the closed stale serial-wait regression.

## Out Of Scope

1. Reopening the closed serial-wait workflow package unless
   `priority_operation_serial_wait` re-enters the representative blocker.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Publication recovery gate for epoch `5` `ACK_PENDING` convergence while
   blocked-node count stays `0` and missing-published count stays `0`.
2. `rebalancer_leader` handoff for terminal priority-recovery witnesses whose
   spread remains unsatisfied after the operation workflow has completed.
3. `operation_workflow_owner` timeout reconciliation for stale follow-up
   operations only while a live operation still owns that timeout boundary.

Canonical contract shape:

1. `pending_ack_nodes` publication state must surface one bounded follow-up
   blocker that explains why the ACK cannot close.
2. Terminal completed priority operations with remaining spread gaps must
   resolve to one canonical follow-up owner or timeout owner, not a stale
   serial-wait or unqualified no-operation fallback.
3. Failure bundle, active gate, replay, and focused fixture evidence must
   agree on whether `sql_transaction_participants-p1` handoff or
   `replica_operations-p1` timeout is the canonical current owner.

## Residual Closure Inventory

- [ ] Extract the `215236Z` publication ACK-pending handoff/timeout fixture.
- [ ] Decide the owner boundary: terminal rebalancer handoff, stale workflow
      timeout, or stronger publication consumer disagreement.
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

May 6 migration from the publication serial-wait workflow package:

1. Tracked priority-recovery snapshots now release stale
   `priority_operation_serial_wait` blockers when the only remaining source is
   a spread-satisfied retained carrier.
2. Focused release proof, the full
   `test/control-plane/priority-recovery-snapshot.test.js` suite, and the
   touched-file guardrails all passed after the repair.
3. Representative rerun
   `rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z`
   removed `priority_operation_serial_wait` from the unresolved current owner
   path and advanced `sql_transactions-p1` to
   `spread_satisfied_in_flight`.
4. The live contraction package now owns epoch `5` `ACK_PENDING` publication
   convergence with dominant `sql_transaction_participants-p1`
   rebalancer-handoff debt and supporting `replica_operations-p1`
   timeout-follow-up debt.

## Validation

1. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`
2. `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js`
3. `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-3.js`
4. `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot-stage-3.js`
5. `git diff --check`
6. Representative rerun:
   `test-output/reports/rolling-restart-after-retained-carrier-serial-wait-release-20260506T215236Z.report.json`.

## Done When

1. The representative path either clears the epoch `5` `ACK_PENDING`
   publication follow-up blocker or migrates to a different named owner
   boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
