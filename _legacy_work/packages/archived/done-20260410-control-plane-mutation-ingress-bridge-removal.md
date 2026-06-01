# Control-Plane Mutation Ingress Bridge Removal

## Why

Bootstrap/startup code still has access to a direct SQL mutation bridge when
CDC-backed mutation helpers are not online yet.

That keeps a second mutation path alive for the same semantic concern and
violates the one-ingress rule for control-plane writes.

## Scope Basis

Phase 0.1 roadmap scope: topology workflow stabilization and one write ingress
per plane.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../../sprints/archived/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-CP-006`

## In Scope

1. Remove the startup/bootstrap direct-SQL mutation bridge.
2. Ensure control-plane startup handoff is complete before mutation callers
   rely on the canonical ingress.
3. Add fail-closed behavior when the canonical mutation ingress is unavailable.

## Out Of Scope

1. Planning snapshot read fallbacks.
2. Bootstrap cache/runtime surface ownership outside mutation ingress.
3. Admin diagnostic degradation.

## Invariants

1. Control-plane writes use one ingress.
2. Startup does not keep a second write path alive "just in case."
3. Missing canonical ingress fails closed rather than silently mutating via SQL.

## Hotspots

1. `src/control-plane/control-plane-system-table-gateway.js`
2. `src/bootstrap/bootstrap-api.js`
3. `src/bootstrap/startup-recovery-coordinator.js`
4. Mutation-ingress startup tests

## Detection / Analysis Tasks

- [x] Identify every startup/bootstrap caller that still relies on direct SQL
      mutation fallback.
- [x] Define the required startup handoff point for canonical ingress
      availability.
- [x] Identify what should fail closed if the ingress is not ready.

## Implementation Tasks

- [x] Remove direct-SQL mutation fallback from the gateway.
- [x] Rework startup/bootstrap callers to wait for or depend on the canonical
      mutation ingress.
- [x] Add tests that assert fail-closed behavior when the ingress is absent.

## Validation

1. Targeted unit tests for gateway mutation ingress behavior.
2. Bootstrap API and startup handoff tests.
3. Distributed scenarios that cover startup/join mutation timing.

## Done When

1. There is no second SQL mutation path for control-plane writes.
2. Startup/bootstrap callers use the canonical ingress or fail closed.
3. Mutation-ingress handoff is explicit and tested.
