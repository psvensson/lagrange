# Selected-Seed Readiness and Control-Snapshot Survivability

## Why

Four focused reruns still die at startup because active-gate success depends on
one selected seed whose control snapshot and admin readiness are not
survivable. The system can look partially converged while the chosen seed still
has `snapshotCoverage=0/N`, probe timeout, or non-authoritative admin state.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Completion Contracts and Owner Simplification Sprint](../sprints/active-2026-q2-runtime-completion-contracts-and-owner-simplification.md)

## In Scope

1. Define an explicit selected-seed eligibility contract for startup and active
   gating.
2. Tie selected-seed choice to authoritative control-snapshot survivability
   instead of local partial liveness alone.
3. Prevent `publicationConvergence=ready` from masking `snapshotCoverage=0/N`
   or non-authoritative admin state on the selected seed.
4. Add deterministic fallback or reselection behavior when the current seed is
   not a valid authoritative source.
5. Surface selected-seed reason, health, and authority in failure artifacts.

## Out Of Scope

1. Replacing the cluster membership algorithm.
2. General transport redesign outside the seed-readiness path.
3. Unlimited startup wait extensions as a substitute for seed survivability.

## Invariants

1. Startup gating must not depend on a seed that is not authoritatively usable.
2. Selected-seed health and snapshot authority are explicit and testable.
3. Partial cluster liveness cannot silently stand in for missing selected-seed
   control-snapshot authority.

## Hotspots

1. `test/distributed/harness/cluster.js`
2. `test/distributed/harness/startup-readiness-evidence.js`
3. `src/control-plane/control-plane-readiness-service.js`
4. `src/admin/admin-control-snapshot.js`
5. `src/bootstrap/owners/bootstrap-cluster-view-owner.js`
6. `src/bootstrap/owners/bootstrap-readiness-owner.js`
7. `src/bootstrap/join-readiness-evaluator.js`
8. `src/bootstrap/bootstrap-topology-snapshot.js`

## Status

Partially implemented on 2026-04-11.

Implemented:

1. snapshot witness selection now prefers control-plane diagnostics, admin-ready
   witnesses, reachable witnesses, and stronger readiness evidence when raw
   coverage ties
2. focused harness regression coverage now pins the stronger-authority witness
   preference
3. one previously failing startup/load scenario, `seven-node-load-during-partitioning`,
   now passes
4. bootstrap cluster view no longer auto-includes the seed in the ready set
   under unpublished startup mode unless the seed has explicit readiness
   evidence

Still failing in this family:

1. `node-join-under-load`
2. `postgres-baseline-comparison`
3. `seven-node-postgres-baseline-partition-split`
4. `seven-node-table-partition-distribution`
5. after the latest rerun set, the startup authority blocker now dominates all
   seven rerun scenarios as the first explicit failure family

Deep-dive findings now extending this package:

1. `BootstrapReadinessOwner` still rebuilds startup authority locally from raw
   publication diagnostics instead of consuming one readiness-owned final
   answer
2. `StartupRecoveryCoordinator` adds a second projection layer on top of that
   bootstrap-local adjudication
3. `JoinReadinessEvaluator` still accepts bootstrap topology snapshot
   `activeNodeIds` and cache `nodes.status` as active-node truth, which is a
   weaker and partly contradictory signal relative to readiness/publication
   ownership
4. `bootstrap-topology-snapshot.js` derives `activeNodeIds` directly from
   `nodes.status`, creating another authority surface for the same semantic
   concern

## Detection / Analysis Tasks

- [x] Inventory how the selected seed is chosen today for startup and active-gate
      evidence.
- [x] Map where selected-seed authority can drift from admin readiness and
      snapshot coverage.
- [x] Confirm whether reselection, fallback, or multi-source validation already
      exists and where it currently stops.
- [x] Deep-dive the bootstrap-ready, join-readiness, and bootstrap-topology
      snapshot fallback paths for contradictory active-node or authority
      semantics.

## Implementation Tasks

- [x] Define one owner-owned selected-seed eligibility and fallback contract.
- [ ] Make startup and active-gate closure consume one startup-authority
      snapshot and adjudicator instead of
      private local heuristics.
- [x] Block or downgrade superficial `ready` outcomes when selected-seed control
      snapshot authority is absent.
- [ ] Remove bootstrap-topology-snapshot `activeNodeIds` and join-readiness
      `nodes.status` fallback as authority signals for startup gating.
- [ ] Collapse bootstrap-local priority-recovery health and startup-recovery
      projection into one owner-owned startup-authority answer.
- [x] Add focused coverage for the current startup failure family and recovery
      path when an alternate authoritative source exists.

## Validation

1. The startup rerun family no longer fails with `snapshotCoverage=0/N` on the
   authoritative seed path.
2. Selected-seed authority, health, and fallback behavior are visible in
   failure artifacts.
3. Startup gating fails only when no authoritative path can stabilize.

## Done When

1. Selected-seed control-snapshot survivability has one canonical owner path.
2. Startup readiness cannot report superficial convergence against an unusable
   seed.
3. Focused startup scenarios either stabilize or fail behind explicit seed
   authority semantics.

## 2026-04-11 implementation update
- BootstrapClusterViewOwner seed fallback is now strict: unpublished-startup ready-node projections only synthesize the seed when the readiness service reports `ready === true`.
- Repair-only and control-plane-recovery-only readiness no longer count as bootstrap-ready evidence.
- BootstrapAPI coverage was updated to lock the new seed-readiness contract and prevent regression back to implicit seed readiness.

## 2026-04-11 implementation update - local query transport contract tightening
- Shared local query transport readiness now requires explicit `ready === true` for startup promotion and self-target reachability.
- `unknown` local transport state now blocks `/readyz`, `/bootstrap/ready`, and self-target join routing when the query transport capability exists.
- Bootstrap readiness only applies this dependency when the runtime surface actually exposes query transport readiness, preventing API-only routers from manufacturing false blockers.

## 2026-04-12 extension
- The latest rerun set made selected-seed startup authority the first blocker for all seven distributed scenarios.
- This package is extended to remove the remaining duplicated startup-authority layers:
  bootstrap-local projection, startup-recovery re-projection, and bootstrap-topology active-node fallback.
- The target is one canonical startup-authority answer owned below bootstrap consumers, not another round of bootstrap-local exception logic.

## 2026-04-12 Deep-Dive Extension: Canonical Startup Authority Required

### New evidence

1. The latest seven-scenario distributed rerun did not fragment into multiple failure families. All seven scenarios failed behind the same earlier blocker: selected-seed startup could not establish authoritative control-snapshot/publication truth.
2. The repeated live shape was:
   - seed phase `DEGRADED`
   - reason `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
   - `publishedControlPlaneEpoch = null`
   - `publishedControlPlaneStatus = null`
   - bootstrap projection blocker `control_snapshot_authority_unavailable`
3. This indicates the current startup contract is still not owned in one place. The new gate correctly fails closed, but the system still reconstructs startup authority through multiple overlapping paths.

### Additional hotspots

1. `src/bootstrap/owners/bootstrap-readiness-owner.js`
2. `src/bootstrap/startup-recovery-coordinator.js`
3. `src/bootstrap/bootstrap-topology-snapshot.js`
4. `src/bootstrap/join-readiness-evaluator.js`
5. `src/control-plane/control-plane-readiness-service.js`
6. `src/admin/admin-control-snapshot.js`
7. `src/bootstrap/owners/bootstrap-cluster-view-owner.js`

### Additional implementation tasks

- [ ] Introduce one canonical startup-authority answer, owned at the readiness/bootstrap seam, that distinguishes at least: `ready`, `recovery_pending`, `authority_unavailable`, and `blocked`.
- [ ] Make `BootstrapReadinessOwner`, `StartupRecoveryCoordinator`, `JoinReadinessEvaluator`, and selected-seed projection consume that answer instead of rebuilding health from raw diagnostics.
- [ ] Remove bootstrap-topology and `nodes.status` active-node fallback from startup-authority decisions; startup authority must derive from readiness/publication evidence, not weaker bootstrap-local hints.
- [ ] Separate `control_snapshot_authority_unavailable` from legitimate recovery-in-progress in one explicit state model instead of a local bag of conditionals.
- [ ] Reduce the selected-seed path to one owner-owned projection contract that both harness startup gating and bootstrap readiness can consume unchanged.

### Structural concern

This package is no longer just about survivability heuristics. It now carries the primary ownership defect exposed by the rerun: startup authority is still reconstructed instead of owned.

## 2026-04-12 Close-out Update

Implemented in this package:
1. Bootstrap readiness now prefers readiness-owned priority-recovery health when that owner surface exists.
2. Priority-recovery planning for startup now uses cluster publication truth so target exclusion no longer collapses into local authority absence.

Validation outcome:
1. Focused bootstrap/readiness unit coverage passed.
2. Distributed reruns still fail behind the same unresolved startup blocker:
   `control_snapshot_authority_unavailable` with `publishedControlPlaneEpoch = null` and `availableNodeCount = 1`.

Status:
This package is structurally improved but not runtime-complete. The remaining work is no longer projection cleanup; it is seed-side initial publication establishment.
