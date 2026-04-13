# Observation/Repair Separation And Authoritative Read Shaping

## Why

Some recovery read paths still trigger repair or reconcile work inline, and the
system still prefers expensive authoritative reads exactly when priority spread
is unresolved.

That turns observers into participants in the failure.

## Scope Basis

Phase 0.1 roadmap scope: control-plane correctness and pressure-safe recovery
behavior under restart and load.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

## In Scope

1. Remove repair and reconcile side effects from recovery observation paths.
2. Move repair initiation to explicit owner or background queues.
3. Make authoritative read policy explicit by lane and work class.
4. Preserve progress under transient authoritative read failure without failing
   closed when cached or sync evidence is already sufficient.

## Out Of Scope

1. The node participation state model itself.
2. Priority spread completion invariants.
3. Node-state update signaling changes beyond what observation policy needs.

## Invariants

1. Reads observe; they do not mutate cluster recovery state inline.
2. Authoritative reads may degrade or defer, but must not silently widen truth.
3. Pressure policy must be explicit and uniform across recovery observers.

## Hotspots

1. `src/control-plane/control-plane-readiness-service.js`
2. `src/control-plane/membership-publication-coordinator.js`
3. `src/control-plane/authoritative-control-plane-view.js`
4. `src/admin/admin-control-snapshot.js`
5. `src/admin/admin-websocket-api.js`

## Detection / Analysis Tasks

- [x] Inventory all read paths that can trigger reconcile or repair.
- [x] Define the allowed observer behaviors by lane and work class.
- [x] Define fallback semantics for authoritative read failure under recovery.
- [x] Identify the background or owner queues that should own repair triggers.

## Implementation Tasks

- [x] Remove inline repair/reconcile from readiness and publication read paths.
- [x] Route repair initiation through explicit owner or background queues.
- [x] Tighten authoritative read policy and fallback behavior by lane.
- [x] Add guardrail tests for snapshot-lane degradation without fail-closed
      behavior.

## Validation

1. Targeted unit tests for observer policy and fallback semantics.
2. Integration tests for readiness/publication reads under pressure.
3. Distributed scenarios: `rolling-restart`, `seed-restart-under-load`,
   `sustained-write-throughput`.

## Done When

1. Recovery observation paths are side-effect free.
2. Repair initiation is explicit and owner-driven.
3. Authoritative read policy is pressure-safe and testable.
4. Follow-on work, if any, is split into separate packages.
