# Rolling Restart Topology Publication Missing-Active Priority Operation Scheduling Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "closed": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z/rolling-restart/",
  "owner": "Topology publication missing-active node over rebalancer priority follow-up readiness deferral",
  "boundary": "Topology publication missing-active node / priority operation scheduling owner",
  "dominantReason": "publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a",
  "currentState": "Planner-created current-entity priority follow-up moves now preserve defer_to_workflow_owner readiness semantics through pre-execution, and the representative rerun no longer selects rebalancer_leader / operation_scheduling as the live blocker. The next artifact advances sql_write_operations-p1 to recovering_in_flight behind operation f57d2c14-afae-4f6a-a626-897ff8934175, while two joiners remain stuck in contacting_seed / bootstrap INIT and seed-side evidence now points at startup bootstrap-admission precheck pressure.",
  "nextAction": "Continue in work/packages/active-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-admission-precheck-pressure-reentry.md for the startup/bootstrap admission precheck pressure boundary.",
  "proof": [
    "Focused 021000Z operation-scheduling / pre-execution handoff fixture",
    "Focused current-entity priority follow-up target-readiness regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer-segment-4-stage-3.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "test/rebalancer/priority-follow-up-target-readiness.test.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-workflow-progress-reentry.md",
  "successor": "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-admission-precheck-pressure-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Workflow Progress Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-workflow-progress-reentry.md)
closed by migration. The reservation-reconciliation fix no longer left the
representative blocker on workflow progress or orphan release. The next rerun
still failed `rolling-restart`, but the normalized owner moved to priority
operation scheduling.

Closure update on May 7, 2026: planner-created current-entity follow-up moves
now retain `defer_to_workflow_owner` target readiness when the selected target
is recovery-eligible but repair-ineligible. The representative rerun
`test-output/reports/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z.report.json`
no longer selects `rebalancer_leader / operation_scheduling` as the live
boundary. `sql_write_operations-p1` advanced to `recovering_in_flight` behind
pending operation `f57d2c14-afae-4f6a-a626-897ff8934175`, while the remaining
failure migrated back to startup/bootstrap pressure: `8be8...` and `ebc4...`
stay in `contacting_seed` / bootstrap `INIT`, and seed-side logs show
control-plane query pressure during concurrent join activity.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z/rolling-restart/`.
3. Result: failed after `133.8s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification remains `publication_convergence_blocked` with root
   cause class `topology` and dominant reason
   `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`.
6. Publication convergence is epoch `5` `ACK_PENDING` with pending ACK count
   `1`, missing-published count `2`, and gate reasons
   `priority_partitions_not_spread`, `publication_epoch_pending`,
   `snapshot_coverage=2/5`,
   `publication_missing_active_node=8be8...`, and
   `publication_missing_active_node=ebc4...`.
7. Priority recovery no longer reports `eligible_but_no_operation_created`.
   The only unresolved partition witness is `sql_write_operations-p1` with
   semantic state `recovering_in_flight`, owner
   `operation_workflow_owner`, boundary `workflow_progress`, next action
   `wait_for_operation_progress`, and pending operation
   `f57d2c14-afae-4f6a-a626-897ff8934175`.
8. Active-gate current progress is now blocked by inactive nodes and snapshot
   coverage rather than operation-scheduling classes:
   blocker signature `inactive_nodes=3|snapshot_coverage=2/5`.
9. Playback events show the seed already passed
   `setup.seed.bootstrap.ready` with startup gate state `seed_join_ready`
   before all four joiners were started, so the live seam is not the original
   seed bootstrap-ready gate.
10. Joiner logs on `8be8...` and `ebc4...` terminate in
    `contacting_seed` with `Failed to contact seed node: fetch failed`, while
    diagnostics keep both nodes in bootstrap phase `INIT` with
    `BOOTSTRAP_PHASE_INCOMPLETE`, `SQL_ENGINE_UNAVAILABLE`,
    `LEADER_METADATA_INCOMPLETE`, `BOOTSTRAP_NOT_READY`, and
    `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.
11. Seed-side evidence on `11601...` shows control-plane query pressure and
    long owner reads during the same window, including in-flight operation
    owner queries taking `8206ms`. The strongest live hypothesis is therefore
    startup bootstrap-admission precheck pressure before the bounded
    bootstrap-request slot is acquired.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `021000Z` fixture for the three selected
   `needs_operation` witnesses and the matching pre-execution handoff logs.
2. Add a focused regression that reproduces a planner-created current-entity
   priority move being dropped at pre-execution because target readiness was
   not normalized to `defer_to_workflow_owner`.
3. Repair only the selected rebalancer owner path.
4. Preserve the closed reservation-visibility regression from the predecessor
   package.

## Out Of Scope

1. Reopening the closed reservation-visibility package unless the same
   defer-visible orphan-release signature re-enters directly.
2. Harness-only timeout increases or snapshot-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `rebalancer_leader / operation_scheduling` owns the boundary while the
   selected blocked priority partitions are actionable `needs_operation` and
   the runtime still attempts to plan one add-like move per partition.
2. Startup snapshot reachability remains supporting evidence unless it
   directly explains why those add-like moves were never produced or never
   handed off.
3. Target readiness deferral belongs to the rebalancer/workflow handoff when
   the target is recovery-eligible but intentionally not repair-eligible.

Canonical contract shape:

1. The selected priority follow-up move must retain one canonical readiness
   mode from planning through pre-execution.
2. `needs_operation` must not be stranded by ordinary readiness gating when
   the workflow owner is supposed to admit recovery on a recovery-only
   target.
3. Failure bundle, active-gate progress, and runtime logs must agree on the
   same owner before the package closes.

## Residual Closure Inventory

- [x] Extract the `021000Z` operation-scheduling / pre-execution fixture.
- [x] Add the focused regression for current-entity follow-up target-readiness
      normalization.
- [x] Repair the selected owner path and rerun focused tests, touched-file
      guardrails, and one representative `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped touched-boundary baseline remained zero on the same scoped
      guardrails later used for closure.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npm test -- test/rebalancer/priority-follow-up-target-readiness.test.js`
   passed.
2. `npm test -- test/rebalancer/priority-follow-up-target-readiness.test.js test/rebalancer/coordinator-reservation-lifecycle.test.js test/rebalancer/priority-replace-exact-target-observation.test.js test/rebalancer/replica-operation-observation-contract.test.js`
   passed.
3. `node scripts/check-guideline-literals.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/priority-follow-up-target-readiness.test.js`
   passed with `0 new literal-guideline violations`.
4. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`
   passed with `0 decision-boundary guideline violations`.
5. `node scripts/check-runtime-grammar-contracts.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`
   passed with `0 runtime-grammar-contract violations`.
6. `npx eslint src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/priority-follow-up-target-readiness.test.js`
   passed.
7. `git diff --check`
   passed.
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z.report.json --fast-local --verbose`
   failed after `133.8s`, but moved the blocker forward from
   `rebalancer_leader / operation_scheduling` to startup/bootstrap admission
   precheck pressure while preserving the top-level topology publication
   re-entry gate.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active / priority operation
   scheduling boundary with replayable evidence.
2. Sprint bookkeeping points to the successor startup/bootstrap package as the
   sole current representative owner.

## Migration

This package closes by migration. The repaired boundary was planner-created
current-entity follow-up readiness deferral inside the unified rebalancer. The
successor package is
[Rolling Restart Topology Publication Missing-Active Startup Bootstrap Admission Precheck Pressure Reentry](./active-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-admission-precheck-pressure-reentry.md),
which owns the `021309Z` startup/bootstrap pressure evidence.
