# Rebalancer Recovery-Path Guardrail Cleanup

## Why

Some rebalancer fallbacks are legitimate recovery or compatibility bridges, but
they still need cleanup so they stay narrow and do not expand back into
general-purpose second paths.

This package exists to burn down those residual bridges without mixing them
with the clearer read-policy violations.

## Scope Basis

Phase 0.1 roadmap scope: deterministic recovery, topology workflow
stabilization, and explicit compatibility burn-down.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../../sprints/archived/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-RB-003`
2. `FB-RB-004`
3. `FB-RB-006`

## In Scope

1. Keep reservation cleanup SQL fallback explicitly recovery-only.
2. Burn down legacy operation-owner fallback for older rows.
3. Remove readiness-snapshot compatibility fallback once producers converge.

## Out Of Scope

1. Repository read-policy collapse.
2. Critical-partition classifier replacement.
3. Bootstrap bridges and transport fallback ownership.

## Invariants

1. Recovery sweeps remain separate from steady-state reads.
2. Compatibility fallbacks shrink over time instead of becoming permanent.
3. Legacy row-shape burn-down has explicit completion criteria.

## Hotspots

1. `src/rebalancer/rebalance-coordinator.js`
2. `src/rebalancer/operation-workflow-owner.js`
3. Recovery and compatibility-focused rebalancer tests

## Detection / Analysis Tasks

- [x] Confirm every remaining recovery-path fallback is actually recovery-only.
- [x] Inventory the legacy row shapes that still require owner fallback.
- [x] Confirm which snapshot producers still require compatibility fields.

## Implementation Tasks

- [x] Tighten guardrails around reservation cleanup SQL fallback.
- [x] Burn down legacy operation-owner fallback paths.
- [x] Remove readiness-snapshot compatibility fallback once producers are
      converged.
- [x] Add tests that keep these paths narrow and observable.

## Validation

1. Rebalancer coordinator and workflow tests.
2. Integration tests for legacy row compatibility and cleanup sweeps.
3. Distributed scenarios that exercise restart and recovery sweeps.

## Done When

1. Recovery-path fallbacks are explicit, narrow, and tested.
2. Legacy row and snapshot compatibility bridges have a clear burn-down path or
   are removed.
3. Rebalancer steady-state logic no longer depends on these guardrail paths.
