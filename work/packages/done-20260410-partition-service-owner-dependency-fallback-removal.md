# Partition-Service Owner-Dependency Fallback Removal

## Why

`PartitionService` still mutates local leader state directly when the embedded
raft implementation is absent for single-replica setups.

That bypasses the injected owner dependency and is a direct violation of the
repo's owner-dependency rule.

## Scope Basis

Phase 0.1 roadmap scope: owner-dependency fallback removal and deterministic
single-writer lifecycle ownership.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-PT-002`

## In Scope

1. Remove the local single-replica leader-election fallback.
2. Require an explicit raft owner or test double contract.
3. Add fail-closed or explicit test-owned behavior where raft is absent.

## Out Of Scope

1. Managed split cohort fallback logic.
2. Query provisioning cohort unification.
3. General partition transaction/default helpers.

## Invariants

1. Injected owners are used rather than bypassed.
2. Single-replica leadership still has one owner.
3. Missing raft support fails explicitly instead of mutating local shadow state.

## Hotspots

1. `src/partition/partition-service.js`
2. Partition service unit and integration tests

## Detection / Analysis Tasks

- [x] Identify all code paths that rely on the local no-raft bridge.
- [x] Define the required owner/test-double contract for single-replica setups.
- [x] Decide what should fail closed versus what should be supported explicitly.

## Implementation Tasks

- [x] Remove the local leader-election fallback path.
- [x] Provide or require an explicit owner/test-double path for supported cases.
- [x] Update tests to stop depending on the bypass behavior.

## Validation

1. Partition service tests for single-replica leadership.
2. Integration tests for startup and role transitions.
3. Any distributed/local harness cases that exercise single-node ownership.

## Done When

1. PartitionService no longer bypasses the raft owner.
2. Single-replica leadership still works through an explicit contract.
3. Tests no longer depend on the old fallback behavior.
