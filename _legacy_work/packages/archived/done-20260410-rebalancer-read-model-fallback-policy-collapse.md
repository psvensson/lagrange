# Rebalancer Read-Model Fallback Policy Collapse

## Why

Rebalancer callers still influence how incomplete operations and in-flight
reads degrade under cache emptiness, read failure, or visibility lag.

That means fallback policy for one semantic concern is still partly owned by
callers instead of the repository/owner surface.

## Scope Basis

Phase 0.1 roadmap scope: topology workflow stabilization, control-plane read
contract discipline, and owner-path unification.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../../sprints/archived/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-RB-001`
2. `FB-RB-002`
3. `FB-RB-005`

## In Scope

1. Collapse incomplete-operation read degradation policy into repository-owned
   APIs.
2. Remove caller tuning of cache-empty and read-failure fallback behavior.
3. Decide whether critical partition safety can use one stronger owner snapshot
   instead of best-available rows.

## Out Of Scope

1. Legacy row-shape bridges and recovery sweeps.
2. Critical-partition classifier contract replacement.
3. Planning snapshot fallback collapse in readiness owners.

## Invariants

1. Repository callers do not choose degraded-read policy for the same semantic
   question.
2. Critical partition safety uses one explicit owner answer.
3. Cache fallback, where retained, is owner-owned and observable.

## Hotspots

1. `src/rebalancer/replica-operation-repository.js`
2. `src/rebalancer/rebalance-coordinator.js`
3. `src/rebalancer/operation-workflow-owner.js`

## Detection / Analysis Tasks

- [x] Enumerate every repository API that still exposes caller-tunable fallback
      policy.
- [x] Define the owner-owned best-effort read contracts.
- [x] Decide whether safety reads need a dedicated owner snapshot.

## Implementation Tasks

- [x] Collapse incomplete-operation read policy into repository-owned APIs.
- [x] Collapse authoritative-read failure degradation into repository-owned
      behavior.
- [x] Rework critical partition safety reads onto the chosen owner contract.
- [x] Add guardrail tests for cache-empty, read-failure, and delayed-visibility
      cases.

## Validation

1. Repository and coordinator unit tests.
2. Rebalancer workflow tests covering incomplete-operation and safety reads.
3. Distributed scenarios: `rolling-restart`, `seed-restart-under-load`.

## Done When

1. Rebalancer callers stop choosing fallback policy locally.
2. Repository read degradation policy is single-owned.
3. Critical partition safety reads are explicit and tested.
