# Transport Reconnect Authority Cleanup

## Why

Transport reconnect authority and fallback address selection are mostly in the
right place already: inside transport owners. What is still missing is a clean
burn-down of bootstrap-only fallback hosts and a clearer boundary between
transport-owned fallback and bootstrap/join bridges.

## Scope Basis

Phase 0.1 roadmap scope: transport/discovery correctness and bounded degraded
behavior under failure.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-TR-001`
2. `FB-TR-002`

## In Scope

1. Keep local-handler to remote-path fallback inside transport owners.
2. Clean up reconnect authority/address fallback ladders.
3. Remove bootstrap-only fallback hosts once runtime dissemination converges.

## Out Of Scope

1. Join/bootstrap peer-mesh reduction outside transport ownership.
2. Query provisioning or managed split degraded cohorts.
3. CDC grouped-delivery safe fallback review.

## Invariants

1. Transport fallback policy remains transport-owned.
2. Bootstrap-only reconnect/address bridges do not leak into steady-state.
3. Special-handler dispatch still collapses onto one router surface.

## Hotspots

1. `src/transport/message-router.js`
2. `src/transport/node-address-resolution.js`
3. `src/transport/router-delivery-manager.js`
4. `src/bootstrap/shared/meta-service-definition-registration.js`

## Detection / Analysis Tasks

- [x] Inventory reconnect authority sources and fallback addresses.
- [x] Separate bootstrap-only address bridges from steady-state reconnect
      behavior.
- [x] Confirm which special-handler fallthrough behavior is still necessary.

## Implementation Tasks

- [x] Remove bootstrap-only reconnect/address fallbacks that are no longer
      needed.
- [x] Keep special-handler fallback inside transport owners.
- [x] Add tests for reconnect authority selection and bootstrap bridge removal.

## Validation

1. Message router and delivery-manager tests.
2. Bootstrap registration tests that touch fallback hosts.
3. Distributed restart/join scenarios that exercise reconnects.

## Done When

1. Transport reconnect authority stays single-owned.
2. Bootstrap-only address bridges are removed or explicitly bounded.
3. Router fallback behavior remains clear and well tested.
