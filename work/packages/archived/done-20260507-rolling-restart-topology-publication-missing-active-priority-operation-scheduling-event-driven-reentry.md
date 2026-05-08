# Rolling Restart Topology Publication Missing-Active Priority Operation Scheduling Event-Driven Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "closed": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z/rolling-restart/",
  "owner": "Topology publication missing-active node over rebalancer priority recovery operation scheduling regression after bootstrap-budget closure",
  "boundary": "Topology publication missing-active node / priority recovery operation scheduling event-driven owner",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "The retained-carrier serial-wait normalization seam is closed. The representative rerun no longer selects sql_write_operations-p1 under rebalancer_leader / operation_scheduling. The fresh artifact reaches epoch 1 PUBLISHED with pending ACK count 0, selected snapshot coverage 1/5, missingPublishedCount 4, selected-snapshot timeout on 11601..., and supporting control_plane_publications-p1 workflow-progress evidence with delivery-source saturation on control_plane_publications-p1-r4.",
  "nextAction": "Continue in work/packages/done-20260507-rolling-restart-topology-publication-missing-active-control-plane-publication-workflow-progress-reentry.md to extract the 034622Z topology/workflow-progress witnesses, add a focused regression for the selected workflow-progress or transport-saturation seam, repair only that owner boundary, and rerun one representative rolling-restart scenario.",
  "proof": [
    "Focused retained-carrier serial-wait regression",
    "Focused stale serial-wait release regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-3.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-event-driven-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-request-execution-timeout-reentry.md",
  "successor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-control-plane-publication-workflow-progress-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Startup Bootstrap Request Execution Timeout Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-request-execution-timeout-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Topology Publication Missing-Active Control-Plane Publication Workflow Progress Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-control-plane-publication-workflow-progress-reentry.md).

## Closure Summary

1. Added a focused regression proving tracked priority recovery decision
   snapshots must preserve live serial-wait source ownership even when a
   spread-satisfied retained carrier also points at the same source
   partition.
2. Repaired
   `src/control-plane/priority-recovery-snapshot-stage-3.js`
   so synthetic serial-wait blockers survive normalization only while the
   exact referenced live source operation still exists on the latest
   non-spread-progress source partition snapshot.
3. Focused serial-wait regressions, broader snapshot suites, and touched-file
   guardrails all passed after the repair.
4. The representative rerun
   `rolling-restart-after-serial-wait-source-idempotence-20260507T034622Z`
   removed the returned `sql_write_operations-p1`
   `eligible_but_no_operation_created` blocker from the live owner boundary.

## Current Evidence

1. Representative rerun:
   `test-output/reports/rolling-restart-after-serial-wait-source-idempotence-20260507T034622Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-serial-wait-source-idempotence-20260507T034622Z/rolling-restart/`.
3. Result: failed after `130.1s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification remains `publication_convergence_blocked` with root
   cause class `topology` and dominant reason
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`.
6. The repaired owner seam is closed: current failure signals no longer name
   `priorityRecoveryPartition=sql_write_operations-p1`,
   `priorityRecoveryOwner=rebalancer_leader`, or
   `priorityRecoveryBoundary=operation_scheduling`.
7. Publication convergence now stalls much earlier at epoch `1`
   `PUBLISHED`, pending ACK count `0`, missing-published count `4`, and gate
   reasons `snapshot_coverage=1/5` plus four explicit
   `publication_missing_active_node=<node>` reasons.
8. The selected readiness failure is a startup-mode selected-snapshot timeout
   on `11601...`, with admin snapshot and default lanes both timing out after
   `100ms`.
9. Supporting workflow evidence moved to
   `control_plane_publications-p1` under
   `operation_workflow_owner / workflow_progress / wait_for_operation_progress`.
10. Seed-side playback logs also show repeated
    `Outbound queue saturated for node delivery` warnings with
    `backpressureScope=delivery_source` against hot target
    `11601.../partition/control_plane_publications-p1-r4`, keeping transport
    saturation in scope as supporting context for the new boundary.
11. The package therefore closes by migration. The next representative owner
    is topology publication missing-active over control-plane publication
    workflow progress, with selected-snapshot timeout and delivery-source
    saturation as subordinate evidence to reconcile.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed serial-wait source-normalization regressions.
2. Record the `034622Z` blocker migration from priority operation scheduling
   to topology publication missing-active with control-plane-publication
   workflow progress.

## Out Of Scope

1. Reopening the closed bootstrap request execution-timeout package unless the
   same admitted-request timeout seam re-enters directly.
2. Reopening the closed serial-wait normalization seam unless
   `sql_write_operations-p1`
   `eligible_but_no_operation_created` re-enters directly.
3. Harness-only timeout increases or publication/readiness exemptions.
4. Broad matrix continuation before the new representative blocker closes or
   migrates.
5. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `rebalancer_leader / operation_scheduling` owned this package only while
   the selected blocker remained `needs_operation` with next action
   `create_recovery_operation`.
2. Serial-wait source normalization was the direct runtime seam because the
   selected blocker regressed only after tracked decision snapshots were
   rebuilt.
3. Once the representative rerun no longer named that selected blocker, the
   package had to close immediately by migration.

Canonical contract shape:

1. Tracked decision snapshot rebuilding must be idempotent for live
   serial-wait source references.
2. Spread-satisfied retained carriers may not erase a still-live source
   operation from a separate blocked partition's canonical owner projection.
3. The representative rerun must either keep the same selected owner boundary
   or move sprint bookkeeping to one new named boundary with replayable
   evidence.

## Residual Closure Inventory

- [x] Extract the `031003Z` operation-scheduling witness fixture.
- [x] Add the focused priority recovery operation-scheduling regression.
- [x] Repair the selected owner path and rerun focused tests, touched-file
      guardrails, and one representative `rolling-restart` scenario.
- [x] Split the migrated topology/workflow-progress blocker into a new active
      package before closure.

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
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npx tap test/control-plane/priority-recovery-snapshot.test.js -g "tracked priority recovery decision snapshots preserve live serial-wait sources behind retained carriers"`
   passed.
2. `npx tap test/control-plane/priority-recovery-snapshot.test.js -g "tracked priority recovery decision snapshots release stale serial-wait blockers once the only source collapses to a spread-satisfied carrier"`
   passed.
3. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
   passed.
4. `npx tap test/control-plane/publication-recovery-evidence.test.js`
   passed.
5. `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js`
   returned `0 new literal-guideline violations`.
6. `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-3.js`
   returned `0 decision-boundary guideline violations`.
7. `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot-stage-3.js`
   returned `0 runtime-grammar-contract violations`.
8. `npx eslint --no-warn-ignored src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js`
   passed.
9. `git diff --check`
   passed.
10. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-serial-wait-source-idempotence-20260507T034622Z.report.json --fast-local --verbose`
    failed after `130.1s`, but removed the selected priority
    operation-scheduling blocker and migrated the representative path to
    topology publication missing-active with supporting control-plane
    publication workflow progress.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active / operation-scheduling
   boundary with replayable evidence.
2. Sprint bookkeeping points to the successor package as the sole current
   representative owner.

## Migration

This package closes by migration. The repaired boundary was tracked
serial-wait source normalization for the returned
`sql_write_operations-p1` operation-scheduling witness. The successor package
is
[Rolling Restart Topology Publication Missing-Active Control-Plane Publication Workflow Progress Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-control-plane-publication-workflow-progress-reentry.md),
which owns the `034622Z` epoch-1 `PUBLISHED` missing-active stall with
supporting `control_plane_publications-p1`
`operation_workflow_owner / workflow_progress` evidence.
