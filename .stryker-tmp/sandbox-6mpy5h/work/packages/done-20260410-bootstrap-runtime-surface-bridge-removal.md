# Bootstrap Runtime-Surface Bridge Removal

## Why

Bootstrap still reaches through several runtime/cache providers for the same
concern, and readiness bootstrap code still reconstructs owner truth locally
when a shared helper contract is missing.

That is a classic bridge pile: it works, but it keeps several equivalent paths
alive for one semantic question.

## Scope Basis

Phase 0.1 roadmap scope: bootstrap-to-runtime handoff completion and
control-plane ownership unification.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-BS-001`
2. `FB-BS-002`
3. `FB-BS-003`

## In Scope

1. Collapse bootstrap cache/runtime surface access to one injected owner.
2. Remove local publication/recovery snapshot reconstruction in bootstrap
   readiness code.
3. Keep the remaining probe timeout fallback inside one readiness-owner API.

## Out Of Scope

1. Active-node / leader-identity bootstrap bridges.
2. Join peer-mesh fallback reduction.
3. Control-plane mutation ingress removal.

## Invariants

1. Bootstrap handoff uses one runtime-surface owner.
2. Bootstrap code does not reconstruct readiness-owner truth locally.
3. Probe timeout behavior remains owner-contained if it still exists.

## Hotspots

1. `src/bootstrap/bootstrap-api.js`
2. `src/bootstrap/owners/bootstrap-readiness-owner.js`
3. `src/bootstrap/shared/startup-runtime-surface-owner.js`
4. `src/control-plane/recovery-protocol-snapshot.js`

## Detection / Analysis Tasks

- [x] Inventory every runtime/cache surface bootstrap still reaches through.
- [x] Identify the canonical runtime-surface owner contract bootstrap should
      use.
- [x] Confirm which probe timeout behavior must remain after the bridge
      collapse.

## Implementation Tasks

- [x] Route bootstrap cache/runtime access through one owner.
- [x] Remove local readiness snapshot reconstruction.
- [x] Add guardrail tests for bootstrap readiness probes and runtime handoff.

## Validation

1. Bootstrap API and readiness-owner unit tests.
2. Startup runtime-surface owner tests.
3. Distributed scenarios: `rolling-restart`, `seed-restart-under-load`.

## Done When

1. Bootstrap uses one runtime-surface owner.
2. Bootstrap readiness no longer rebuilds recovery snapshots locally.
3. The remaining probe timeout path, if any, stays explicit and tested.
