# Rolling Restart Recovery-Ready And Transport Pressure

## Why

The `rolling-restart` secondary re-entry has moved beyond the
`replica_operations-p1` follow-up creation blocker. The latest run now fails
earlier at the restarted-node recovery boundary:

1. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-strict-final-active.report.json`
2. Failure: node `11601fe0-72d6-5853-8590-ec2881853e72` did not become
   recovery-ready within `120000ms`.
3. Reachability evidence: `reachable=true`, `reachableBy=bootstrap_health`,
   `adminReady=false`, `controlPlaneRecoveryReady=false`.
4. Transport evidence: admin API probe failed with `ECONNREFUSED`, while logs
   showed repeated outbound queue saturation, CDC delivery retries, WebSocket
   reconnect failures, and operation timeouts.

This is a runtime pressure/recovery-readiness package, not a priority
follow-up creation package.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Topology workflow stabilization`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Keep the scenario from using load-mode soft active success after load has
   stopped and before final consistency.
2. Isolate why restarted nodes can remain bootstrap-health reachable while
   admin/control-plane recovery readiness stays closed under transport pressure.
3. Preserve strict final consistency once the cluster is actually active.
4. Improve owner diagnostics if the remaining failure cannot identify whether
   the blocker is admin listener startup, control-plane recovery readiness, or
   transport queue starvation.

## Out Of Scope

1. Treating `bootstrap_health` reachability as final recovery readiness.
2. Reintroducing load-mode soft success for post-load final checks.
3. Increasing restart readiness timeouts before the readiness owner path is
   understood.
4. Broad matrix continuation while this blocker remains active.

## Shared Boundary Contract

- Semantic owner:
  restarted-node recovery readiness under load and post-load cleanup.
- Canonical contract:
  a restarted node may satisfy per-restart readiness through admin readiness or
  control-plane recovery readiness, but bootstrap health alone is only process
  reachability.
- Allowed consumers:
  `rolling-restart`, restart-boundary diagnostics, reachability diagnostics,
  and failure bundles.
- Prohibited reinterpretations:
  counting a load-mode closure witness as final active convergence after load
  has stopped, or hiding admin/control-plane readiness failures behind leader
  comparison noise.

## Implemented

1. `rolling-restart` now uses the strict/default `waitForAllActive` gate after
   load cancellation and before final leader consistency.
2. The scenario unit test now verifies the final active wait runs after load
   stops and does not pass `mode: load`.
3. Load-mode active probing now projects stale local traffic recovery blockers
   only after the canonical load publication gate is ready, snapshot coverage
   is complete, and the selected snapshot is admin-reachable.
4. Restart recovery timeout diagnostics now include the bootstrap readiness
   phase, readiness stage, stage rank, and readiness reason set when the node
   is process-reachable but admin/control-plane recovery readiness remains
   closed.
5. The latest `rolling-restart` rerun moved beyond per-restart recovery
   readiness and failed later at the post-restart strict ACTIVE gate.

## Residual Closure Inventory

- [x] Remove load-mode soft active success from the post-load final gate.
- [x] Add scenario-level proof for the strict final active gate.
- [x] Isolate the restarted-node `bootstrap_health` reachable /
      `adminReady=false` state under transport pressure.
- [x] Close the admin/control-plane recovery readiness path or split the next
      blocker with canonical owner evidence.

## Validation

Executed:

1. `node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
2. Result: passed.
3. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-strict-final-active.report.json --fast-local --verbose`
4. Result: failed at restarted-node recovery readiness with admin API
   `ECONNREFUSED`.
5. `node test/distributed/harness/__tests__/cluster.test-part-4.js`
6. Result: passed after load publication gate projection proof.
7. `node test/distributed/harness/__tests__/cluster.test-part-2.js`
8. Result: passed after restart recovery owner-blocker diagnostic proof.
9. `node test/distributed/harness/__tests__/cluster.test.js`
10. Result: passed.
11. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-recovery-readiness-owner-blocker.report.json --fast-local --verbose`
12. Result: failed later at the strict post-restart ACTIVE gate, not at
    per-restart recovery readiness:
    `snapshotCoverage=5/5`, `publicationConvergence=ready`,
    `priorityRecoveryInvariants=passed`, `active=3/5`,
    one node readiness probe timed out, and one node remained `warming`.
13. `git diff --check`
14. Result: passed.

## Handoff

The remaining `rolling-restart` blocker is now:

1. [Rolling restart post-restart ACTIVE gate and transport saturation](done-20260424-rolling-restart-post-restart-active-gate-and-transport-saturation.md)

## Done When

1. A restarted node that is only `bootstrap_health` reachable either recovers
   to admin/control-plane readiness within the current readiness budget or
   emits a canonical owner-state blocker.
2. `rolling-restart` passes or moves to a freshly split blocker that is not
   restart recovery readiness under transport pressure.
