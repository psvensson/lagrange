# Recovery Protocol And Node Participation State Machine

## Why

The system still answers "what state is this node in for recovery, publication,
and readiness?" in several places.

That leaves publication, readiness, bootstrap, join, and priority recovery
internally coherent but collectively coupled. Under five-node restart pressure,
they can still wait on each other's outputs.

## Scope Basis

Phase 0.1 roadmap scope: control-plane correctness, restart recovery, and
failure-simulation robustness.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

## In Scope

1. Define one explicit node participation state model across join, readiness,
   publication, and recovery.
2. Define one cluster recovery protocol snapshot or owner that derives
   publication intent and recovery intent from those node states.
3. Route publication, readiness, bootstrap, and priority-recovery diagnostics
   through that shared model.

## Out Of Scope

1. Final priority spread completion and rearm semantics.
2. Transport pressure relief outside participation signaling.
3. Admin snapshot lane behavior except where needed to preserve the owner
   boundary.

## Invariants

1. One node has one participation state at a time.
2. Observation does not mutate recovery protocol state inline.
3. Published membership remains the durable contract; pre-published recovery
   states are explicit and typed.

## Hotspots

1. `src/control-plane/active-node-projection.js`
2. `src/control-plane/control-plane-readiness-service.js`
3. `src/control-plane/membership-publication-coordinator.js`
4. `src/bootstrap/node-joining-service.js`
5. `src/bootstrap/owners/bootstrap-readiness-owner.js`

## Detection / Analysis Tasks

- [x] Extract the current implicit node-participation states from join,
      readiness, publication, and bootstrap.
- [x] Define the canonical state set, legal transitions, and reason codes.
- [x] Define the recovery protocol snapshot inputs, outputs, and owner.
- [x] Identify every consumer that must stop recomputing adjacent truth.

## Implementation Tasks

- [x] Introduce the canonical node participation state model and shared
      recovery protocol snapshot.
- [x] Route readiness, publication, bootstrap, and recovery diagnostics through
      it.
- [x] Remove remaining local recomputation from admin snapshot and join/rejoin
      lanes that still reshape participation truth outside the shared owner.
- [x] Add distributed/system-level guardrails for rejoin, rolling restart, and
      partial-publication recovery on top of the shared snapshot contract.

## Validation

- [x] `node test/control-plane/recovery-protocol-snapshot.test.js`
- [x] `node test/control-plane/membership-publication-coordinator.test.js`
- [x] `node test/control-plane/control-plane-readiness-service.test.js`
- [x] `node test/admin/admin-control-snapshot.test.js`
- [x] `node test/bootstrap/startup-recovery-coordinator.test.js`
- [x] `node test/bootstrap/bootstrap-api.test.js`
- [x] `node test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
- [x] `node test/distributed/harness/__tests__/seed-restart-under-load-scenario.test.js`
- [x] `node test/distributed/harness/__tests__/node-join-under-load-scenario.test.js`
- [x] `node test/distributed/harness/__tests__/failure-bundle.test.js`
- [x] `node test/distributed/harness/__tests__/cluster.test.js`
- [x] Distributed scenarios: `rolling-restart`, `seed-restart-under-load`,
      `node-join-under-load`

## Live Validation Notes

1. `rolling-restart` and `node-join-under-load` now pass on the tightened local
   profile.
2. `seed-restart-under-load` remains red on the live topology-settling blocker
   family with full snapshot coverage and published membership:
   `priority_control_plane_spread_pending`,
   `priorityRecoveryState=recovering_in_flight`,
   and `publication_missing_active_node=...`.
3. That remaining red is follow-on recovery work, not a regression in the
   shared participation-state or recovery-protocol snapshot contract added by
   this package.

## Done When

1. Node participation is explicit and single-owned.
2. Publication, readiness, bootstrap, and recovery diagnostics consume the
   same protocol output.
3. Recovery/publication decisions no longer depend on parallel boolean sets.
4. Follow-on work, if any, is split into separate packages.
