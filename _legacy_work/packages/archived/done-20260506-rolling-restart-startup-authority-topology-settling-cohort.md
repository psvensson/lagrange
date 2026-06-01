# Rolling Restart Startup Authority Topology Settling Cohort

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "closed": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-startup-authority-topology-settling-cohort-20260506T124254Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-startup-authority-topology-settling-cohort-20260506T124254Z/rolling-restart/",
  "owner": "Startup authority cohort consumed by critical-system topology settling",
  "boundary": "Startup authority topology-settling cohort",
  "dominantReason": "PRIORITY_CONTROL_PLANE_RECOVERY_PENDING",
  "currentState": "Critical-system topology settling consumes canonicalStartupNodeIds and no longer reopens on non-cohort ACTIVE rows; the representative blocker migrated to bootstrap assignment-token handling.",
  "nextAction": "Use successor bootstrap assignment-token register-service package for the current representative blocker.",
  "proof": [
    "Focused startup-authority topology-settling contract regression",
    "Rebalancer topology-settling regression coverage",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer-segment-2.js",
    "test/rebalancer/unified-rebalancer.test-part-5-2.js"
  ],
  "predecessor": "work/packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md"
}
-->

Opened on May 6, 2026 after the fresh representative rerun migrated away from
[Rolling Restart Operation Transition Pressure And Over-Target Trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)
and proved the live blocker is no longer post-publication operation progress.
The current runtime boundary is the critical-system topology-settling gate:
startup authority already narrows the canonical cohort to three nodes, but the
rebalancer still evaluates all `ACTIVE` `nodes` rows and reopens
`node_ready_lease_incomplete` on non-cohort rows.

Closure update on May 6, 2026: the representative rerun
`test-output/reports/rolling-restart-after-startup-authority-topology-settling-cohort-20260506T124254Z.report.json`
closes this package as the live owner path. The startup-authority cohort
cutover removed the non-cohort topology-settling blocker and moved the
representative failure forward to the bootstrap `MOVE_REPLICA`
assignment-token / register-service boundary, now tracked in
[Rolling Restart Bootstrap Move Replica Assignment Token Register Service](./done-20260506-rolling-restart-bootstrap-move-replica-assignment-token-register-service.md).

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-pending-rearm-restore-20260506T121614Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-pending-rearm-restore-20260506T121614Z/rolling-restart/`.
3. Result: failed after `201.2s`.
4. Terminal barrier:
   `Cluster ACTIVE wait stalled with no meaningful progress for 8 attempts`.
5. Root cause class: `startup`.
6. Dominant reason:
   `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.
7. Failure class:
   `startup_recovery_blocked`.
8. Publication convergence is already closed for this boundary: epoch `3`,
   recovery protocol state `steady_published`, pending ACK `0`, blocked
   partitions `0`, unresolved partitions `0`, missing published count `0`,
   and published active node ids
   `11601fe0-72d6-5853-8590-ec2881853e72`,
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
   `7493b0ab-a054-5fad-a91b-5e331db29304`.
9. Load-readiness progress still stalls at active `0/5`, selected snapshot
   coverage `3/5`, selected missing published nodes
   `8be8d30f-4499-5eed-865c-71b4d529a67a` /
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, and
   `publicationGateReason=snapshot_coverage=3/5`.
10. Replay and failure-bundle evidence keep the runtime seam on topology
    settling, not publication or operation timeout: the rebalancer emits
    `topology_settling_blocked` with blocker reason
    `node_ready_lease_incomplete` for `8be8...` and `ebc4...`.
11. Runtime logs on both excluded nodes repeatedly show reconnect failure to
    seed `7493...` at `ws://172.19.0.2:8082`, and the same nodes fail
    selected control-snapshot repair over the owner-RPC lane after the route
    closes. That is supporting evidence for why those rows stay unready, but
    the current bug is that these non-cohort `ACTIVE` rows still gate the
    critical-system topology-settling decision after startup authority has
    already narrowed the canonical cohort.
12. The operation-boundary witness from the prior package is no longer the
    selected blocker in this artifact. `sql_transaction_participants-p1`,
    `sql_transactions-p1`, and `sql_write_operations-p1` remain adjacent
    supporting context only.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Make the critical-system topology-settling gate consume the readiness-owned
   startup-authority cohort instead of all cache-visible `ACTIVE` node rows.
2. Keep endpoint-visibility and same-entity in-flight topology checks aligned
   to that same cohort when startup authority is available.
3. Preserve the closed publication and migrated operation-progress slices as
   predecessor context without rebuilding the startup cohort from raw `nodes`
   rows.
4. Add focused owner-path regressions before the representative rerun.

## Out Of Scope

1. Transport-layer fixes for the reconnect failures themselves unless the
   representative rerun proves the startup-authority cohort cutover does not
   move the blocker.
2. Re-entering the dormant operation-transition residuals before the current
   topology-settling blocker is reduced or migrated.
3. Broad matrix continuation before the five-node representative path passes
   or migrates to a new named owner boundary.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owner:
`ControlPlaneReadinessService.getStartupAuthoritySnapshot...` publishes the
canonical startup cohort; `UnifiedRebalancer.getCriticalSystemTopologySettlingBlocker()`
consumes that cohort for critical-system startup topology settling.

Canonical contract shape:

1. `canonicalStartupNodeIds` is the authoritative startup cohort when
   available.
2. Critical-system topology settling may evaluate readiness, endpoint
   visibility, and same-entity in-flight topology work only for that cohort.
3. Cache-visible `ACTIVE` rows outside the cohort are diagnostics or future
   work candidates; they are not allowed to reopen startup topology settling.

Allowed consumers:

1. `getAvailableNodesConstrainedToNodeIds(...)`
2. `getCriticalSystemTopologySettlingBlocker()`
3. Topology-settling planning gate diagnostics

Prohibited reinterpretations:

1. Do not rebuild the startup cohort from all `nodes.status=ACTIVE` rows.
2. Do not let non-cohort `ACTIVE` rows reopen
   `node_ready_lease_incomplete` once startup authority is available.
3. Do not widen endpoint-visibility or same-entity topology-operation checks
   back to the raw cache cohort for this startup-sensitive boundary.

Primary diagnostics and proof surfaces:

1. `test/rebalancer/startup-authority-available-node-contract.test.js`
2. `test/rebalancer/unified-rebalancer.test-part-5-2.js`
3. `test-output/reports/.playback/.../failure-bundle.md`
4. Representative `rolling-restart --fast-local` reruns

## Progress Grammar

1. `startup_authority_constrained` means topology settling only evaluates the
   readiness-owned `canonicalStartupNodeIds` cohort.
2. `topology_settling_blocked` means a cohort member still fails readiness,
   endpoint visibility, or same-entity topology-operation completion.
3. `predecessor_publication_closed` means publication convergence remains
   steady-published and does not own the current blocker.
4. `closed_or_migrated` means the representative path either reaches ACTIVE or
   moves to one newly named non-topology-settling owner boundary.

## Residual Closure Inventory

- [x] Direct owner path updated:
      `src/rebalancer/unified-rebalancer-segment-2.js`
      `getCriticalSystemTopologySettlingBlocker()`.
- [x] Startup-authority cohort is reused consistently for readiness,
      endpoint-visibility, and same-entity in-flight topology checks.
- [x] Tail consumer boundary remains aligned:
      `resolveTopologySettlingPlanningGateDecision()` and representative
      failure-bundle/triage surfaces report the same blocker grammar.
- [x] Superseded raw-`ACTIVE`-row fallback is deleted from this boundary.
- [x] Focused owner-path regressions added before the representative rerun.
- [x] Representative `rolling-restart --fast-local` rerun recorded after the
      focused proof.

## Static Drift Ledger

Preflight:

- [x] Capture touched-file literal, decision-boundary, and runtime-grammar
      baselines for the rebalancer files and new tests.

Closure:

- [x] Rerun the same touched-file guardrails after implementation.
- [x] No new owner-path, decision-boundary, or runtime-grammar violation is
      introduced in touched files.

## Implementation Tasks

- [x] Add a focused contract regression that proves non-cohort `ACTIVE` rows
      do not reopen topology settling once startup authority is available.
- [x] Add or extend a topology-settling gate regression that preserves
      priority-system progression with the startup-authority cohort.
- [x] Update the runtime owner path in
      `src/rebalancer/unified-rebalancer-segment-2.js`.
- [x] Run focused tests, touched-file guardrails, and the representative
      scenario rerun.

## Validation

1. Focused startup-authority topology-settling contract tests pass.
2. Relevant rebalancer topology-settling regression coverage passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit blocker migration notes.

## Done When

1. Critical-system topology settling no longer reopens on non-cohort `ACTIVE`
   rows once startup authority is available.
2. The representative path either reaches ACTIVE or names the next blocker on
   a different owner boundary in the same work cycle.
