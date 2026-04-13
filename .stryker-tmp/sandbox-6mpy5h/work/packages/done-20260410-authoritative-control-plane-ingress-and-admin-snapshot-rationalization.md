# Authoritative Control-Plane Ingress And Admin Snapshot Rationalization

## Why

The authoritative control-plane read and repair lane is already the right
owner, but its surface is still broad and admin/control-plane consumers are not
yet shaped around one intentionally small ingress contract.

This package exists to tighten the owner surface without accidentally
reintroducing caller-local fallback policy.

## Scope Basis

Phase 0.1 roadmap scope: control-plane correctness, cache-observation boundary
enforcement, and operational diagnostics that do not become progression
authorities.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-AD-001`
2. `FB-CDC-001`
3. `FB-CDC-002`
4. `FB-CP-005`

## In Scope

1. Reduce the exposed option surface of the authoritative control-plane ingress.
2. Keep admin diagnostics routed through the same owner-controlled read and
   repair lane.
3. Separate observation-only degradation from progression-authority behavior.

## Out Of Scope

1. Caller-owned planning snapshot fallbacks.
2. Startup mutation bridges.
3. Query provisioning degraded cohort selection.

## Invariants

1. The authoritative control-plane ingress remains the only read owner for
   this concern.
2. Admin surfaces remain observation-only.
3. Read and repair options do not leak back out as caller-tunable fallback
   policy.

## Hotspots

1. `src/cdc/cdc-integration-service.js`
2. `src/control-plane/control-plane-system-table-gateway.js`
3. `src/control-plane/authoritative-control-plane-view.js`
4. `src/admin/admin-control-snapshot.js`
5. `src/admin/admin-service-discovery.js`

## Detection / Analysis Tasks

- [x] Inventory ingress options that callers still vary unnecessarily.
- [x] Identify which admin diagnostics must remain degradable and which should
      fail closed.
- [x] Confirm that cache-visibility repair stays an explicit owner path.

## Implementation Tasks

- [x] Narrow the authoritative ingress option surface.
- [x] Move any remaining admin fallback shaping behind admin snapshot owners.
- [x] Add tests that enforce observation-only degradation and ingress ownership.

## Validation

1. Targeted unit tests for authoritative ingress behavior.
2. Admin snapshot and service-discovery tests.
3. Distributed scenarios that exercise delayed cache visibility and admin
   diagnostics during recovery.

## Done When

1. Authoritative control-plane read and repair behavior stays single-owned.
2. Admin diagnostics do not carry duplicate local fallback policy.
3. The ingress surface is smaller, clearer, and better tested.
