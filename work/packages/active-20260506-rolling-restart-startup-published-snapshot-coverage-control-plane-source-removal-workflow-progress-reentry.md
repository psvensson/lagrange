# Rolling Restart Startup Published Snapshot Coverage Control Plane Source-Removal Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z/rolling-restart/",
  "owner": "Startup published snapshot-coverage convergence over control-plane publication source-removal workflow progress",
  "boundary": "Startup published snapshot coverage control-plane source-removal workflow progress",
  "dominantReason": "BOOTSTRAP_PHASE_INCOMPLETE",
  "currentState": "The pending-ACK follow-up seam is closed: priority recovery now converges, publication is epoch 1 PUBLISHED with pendingAckCount 0, and the representative rerun stalls at active 2/5 with snapshot coverage 1/5. The live owner is control_plane_publications-p1 under operation_workflow_owner / workflow_progress in source_removal, with repeated replace_remove_safety_blocked deferrals and stale MOVE_REPLICA reservation invalidations marked source_owner_unavailable.",
  "nextAction": "Extract the 222400Z epoch-1 PUBLISHED source-removal fixture for control_plane_publications-p1 and the mg-1-r1 MOVE_REPLICA assignment; decide whether replace-remove safety or stale source-owner invalidation is the canonical owner; then repair only that startup source-removal path.",
  "proof": [
    "Focused 222400Z startup source-removal fixture",
    "Owner regression for startup source-removal workflow progress or stale assignment invalidation",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "src/bootstrap/bootstrap-api-constants.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "test/rebalancer/replace-replica-workflow.test.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-stalled-followup-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Publication ACK-Pending Rebalancer Handoff Stalled Followup Reentry](./done-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-stalled-followup-reentry.md)
closed by migration. The representative rerun no longer terminates on
epoch-`5` `ACK_PENDING` follow-up debt; publication is already
`steady_published`, but startup still times out because coverage stalls with
only one snapshot visible while `control_plane_publications-p1` stays in
source-removal workflow progress.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z/rolling-restart/`.
3. Result: failed after `135.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification: `startup_recovery_blocked` with root cause class
   `startup` and dominant reason `BOOTSTRAP_PHASE_INCOMPLETE`.
6. Publication convergence is epoch `1` `PUBLISHED` with pending ACK count
   `0`, blocked-node count `0`, missing-published count `0`, and recovery
   protocol state `steady_published`.
7. Current active-gate progress ends at active `2/5`, snapshot coverage
   `1/5`, selected snapshot node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and blocker signature
   `inactive_nodes=3|snapshot_coverage=1/5`.
8. Priority recovery is no longer the live blocker: unresolved class count is
   `0`, unresolved semantic-state count is `0`, and the dominant summary
   witness is now `control_plane_publications-p1`.
9. `control_plane_publications-p1` is the dominant progress witness:
   `spread_satisfied_in_flight` under
   `operation_workflow_owner / workflow_progress`, with
   `nextRequiredAction=wait_for_operation_progress`,
   `workflowProgressPhaseId=source_removal`, `waitMode=event_driven`, and
   operation `9a3e654e-ab3f-4ca5-ad69-a78ac25728c3`.
10. Supporting runtime evidence on the selected snapshot includes repeated
    `replace_remove_safety_blocked` deferrals stating replacement leader
    ownership is still pending, then later stating the remove would drop
    voter-ready replicas below minimum (`2/3`).
11. The same playback includes repeated stale `MOVE_REPLICA` reservation
    invalidations for assignment `51ecc2e8-bbd9-40f4-b3d3-01b98e0cdebf`,
    replica `mg-1-r1`, with `invalidationReason=source_owner_unavailable`.
12. Seed-side bootstrap admission also reports
    `move_replica_handoff_stabilizing` for the same assignment and target
    node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, so the live seam is a narrow
    startup source-removal / assignment-ownership boundary rather than a
    generic readiness timeout.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `222400Z` epoch-`1` `PUBLISHED` fixture for
   `control_plane_publications-p1` source-removal progress and the
   `mg-1-r1` bootstrap assignment lifecycle.
2. Decide whether the canonical owner is replace-remove safety, stale
   source-owner invalidation, or a stronger startup/publication consumer
   disagreement.
3. Repair only the selected startup source-removal owner path.
4. Preserve the closed pending-ACK handoff and timeout-dominance regressions.

## Out Of Scope

1. Reopening the closed serial-wait or pending-ACK follow-up packages unless
   those exact seams re-enter the representative blocker.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Startup convergence while publication is already `PUBLISHED` but active
   snapshot coverage remains below the representative gate requirement.
2. `operation_workflow_owner` source-removal progress for
   `control_plane_publications-p1` while a live `REPLACE` operation still owns
   the removal workflow.
3. Bootstrap assignment invalidation for `mg-1-r1` only while stale source
   ownership is the best current explanation for blocked startup admission.

Canonical contract shape:

1. Startup `snapshot_coverage=1/5` must surface one bounded owner path that
   explains why the cluster cannot progress beyond active `2/5`.
2. `control_plane_publications-p1` source-removal progress and bootstrap
   assignment invalidation must agree on one canonical owner boundary rather
   than split between stale workflow progress and stale assignment history.
3. Failure bundle, replay, focused fixture evidence, and sprint bookkeeping
   must agree on whether remove safety or source-owner invalidation is the
   canonical current owner.

## Residual Closure Inventory

- [ ] Extract the `222400Z` startup source-removal fixture.
- [ ] Decide the owner boundary: replace-remove safety, stale source-owner
      invalidation, or stronger startup/publication consumer disagreement.
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

May 6 migration from the pending-ACK follow-up package:

1. Tracked priority-recovery snapshots now keep retained serial-wait carriers
   subordinate when spread-satisfied siblings preserve the only live
   diagnostic backlink.
2. Summary normalization now prefers `workflow_timeout` over stale
   workflow-owned serial waits for representative bundle ranking.
3. Representative rerun
   `rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z`
   removed the live `sql_transaction_participants-p1` handoff blocker and
   moved the representative seam into startup source-removal progress.
4. The active package now owns startup snapshot-coverage contraction around
   `control_plane_publications-p1` and the `mg-1-r1` assignment lifecycle.

## Validation

1. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`
2. `node --test test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
3. `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
4. `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-3.js`
5. `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot-stage-3.js`
6. `git diff --check`
7. Representative rerun:
   `test-output/reports/rolling-restart-after-retained-carrier-subordinated-source-timeout-dominance-20260506T222400Z.report.json`.

## Done When

1. The representative path either clears the startup source-removal blocker
   or migrates to a different named owner boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
