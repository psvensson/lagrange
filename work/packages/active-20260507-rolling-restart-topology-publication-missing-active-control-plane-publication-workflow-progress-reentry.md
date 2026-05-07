# Rolling Restart Topology Publication Missing-Active Control-Plane Publication Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-serial-wait-source-idempotence-20260507T034622Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-serial-wait-source-idempotence-20260507T034622Z/rolling-restart/",
  "owner": "Topology publication missing-active node over control-plane publication workflow progress and selected-snapshot timeout reentry",
  "boundary": "Topology publication missing-active node / control-plane publication workflow-progress owner",
  "dominantReason": "publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72",
  "currentState": "The returned sql_write_operations-p1 operation-scheduling seam is now closed. The representative rerun reaches epoch 1 PUBLISHED with pending ACK count 0, selected snapshot coverage 1/5, and missingPublishedCount 4. Failure classification stays topology/publication_convergence_blocked, the selected readiness failure is a selected-snapshot timeout on 11601..., the supporting priority-recovery witness is control_plane_publications-p1 under operation_workflow_owner / workflow_progress / wait_for_operation_progress, and seed playback shows repeated delivery_source saturation against 11601.../partition/control_plane_publications-p1-r4.",
  "nextAction": "Extract the 034622Z selected-snapshot timeout and control_plane_publications-p1 workflow-progress witnesses, add a focused regression for the selected workflow-progress or transport-saturation seam, repair only the selected owner boundary, and rerun one representative rolling-restart scenario.",
  "proof": [
    "Focused 034622Z topology/workflow-progress witness fixture",
    "Focused control-plane-publication workflow-progress or transport-saturation regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/transport/message-router-shared.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-3.js",
    "test/transport/message-router.test.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js",
    "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-control-plane-publication-workflow-progress-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-event-driven-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Priority Operation Scheduling Event-Driven Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-event-driven-reentry.md)
closed by migration. The retained-carrier serial-wait fix removed the returned
priority operation-scheduling blocker, but the representative rerun still
fails `rolling-restart` on an earlier topology publication boundary.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-serial-wait-source-idempotence-20260507T034622Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-serial-wait-source-idempotence-20260507T034622Z/rolling-restart/`.
3. Result: failed after `130.1s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification is `publication_convergence_blocked` with root cause
   class `topology`, dominant reason
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`,
   and confidence `high`.
6. Publication convergence stalls at epoch `1` `PUBLISHED` with pending ACK
   count `0`, missing-published count `4`, and gate reasons
   `snapshot_coverage=1/5` plus explicit
   `publication_missing_active_node=<node>` reasons for
   `11601...`, `35a891...`, `8be8...`, and `ebc4...`.
7. Current active-gate progress agrees on the same live deficit: active `2/5`,
   coverage `1/5`, selected published active `1/5`, pending ACK count `0`,
   missing-published count `4`, and disagreement nodes `2`.
8. The selected readiness failure is startup-mode
   `selectedSnapshotError`: admin snapshot and default lanes on `11601...`
   both time out after `100ms`, and the failure bundle records
   `activeGateReadinessDelaySource=selectedSnapshotError`.
9. Supporting workflow evidence now points at
   `control_plane_publications-p1` under
   `operation_workflow_owner / workflow_progress / wait_for_operation_progress`.
10. Seed-side playback logs on `7493...` show repeated
    `Outbound queue saturated for node delivery` warnings with
    `backpressureScope=delivery_source`, hot source
    `target:11601.../partition/control_plane_publications-p1-r4`,
    `pending=48`, `pendingSourceLimit=48`, and `criticalReserve=16`.
11. Joiner playback on `8be8...` and `ebc4...` also keeps
    `BOOTSTRAP_NOT_READY` / `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
    context in `contacting_seed`, but that remains subordinate unless it
    proves to be the direct cause of the selected publication stall.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract the focused `034622Z` witness set for top-level publication
   convergence, current active-gate progress, selected-snapshot timeout on
   `11601...`, and `control_plane_publications-p1` workflow-progress /
   transport-saturation evidence.
2. Decide whether the canonical owner is explicit topology
   `publication_missing_active_node`, control-plane-publication
   `operation_workflow_owner / workflow_progress`, or a re-entered
   delivery-source transport seam beneath that workflow.
3. Add a focused regression for the selected owner path before the next
   representative rerun.
4. Preserve the closed serial-wait source-normalization regressions from the
   predecessor package.

## Out Of Scope

1. Reopening the closed priority operation-scheduling package unless
   `sql_write_operations-p1`
   `eligible_but_no_operation_created` re-enters directly.
2. Treating the selected-snapshot timeout as the direct owner without proving
   it outranks the current missing-active and workflow-progress evidence.
3. Harness-only timeout increases or startup/publication exemptions.
4. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
5. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Explicit `publication_missing_active_node` owns the boundary while top-level
   publication convergence and current active-gate progress agree on the live
   epoch-1 missing-active set.
2. `operation_workflow_owner / workflow_progress` owns the boundary when the
   named `control_plane_publications-p1` operation directly explains why the
   missing-active nodes cannot join the published active set.
3. Delivery-source saturation is subordinate infrastructure unless it is the
   direct cause of the control-plane-publication workflow stall and becomes
   the canonical owner seam.
4. Selected-snapshot timeout is observation debt unless it outranks both the
   topology deficit and the supporting workflow evidence with one explicit
   owner reason.

Canonical contract shape:

1. Failure bundle, publication convergence, current active-gate progress, and
   runtime playback must agree on one canonical owner for the same
   missing-active node set.
2. If workflow progress owns the boundary, the proof must show the named
   operation and its saturated or deferred delivery path are the direct cause
   rather than stale supporting context.
3. If selected-snapshot timeout is only observation debt, downstream summary
   surfaces must preserve the live missing-active and workflow-progress
   evidence instead of collapsing back to generic timeout triage.

## Residual Closure Inventory

- [ ] Extract the `034622Z` topology/workflow-progress witness fixture.
- [ ] Decide the direct owner boundary: explicit topology debt, control-plane
      workflow progress, or delivery-source saturation beneath that workflow.
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

## Validation

1. Focused `034622Z` topology/workflow-progress fixture passes.
2. Focused owner-path regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active /
   control-plane-publication-workflow-progress boundary with replayable
   evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
