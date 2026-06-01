# Membership Publication Fetch And Ack Fallback Collapse

## Why

Membership publication freshness and acknowledgment-row selection previously leaked
into dispatch callers.

`ReplicaDispatchService` previously performed sync fetch, async refresh,
and retry selection inline when resolving one membership-publication row for
acknowledgment.

That duplicates publication-owner policy outside the publication owner.

## Scope Basis

Phase 0.1 roadmap scope: control-plane correctness and one owner per shared
metadata decision.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../../sprints/archived/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-CP-003`

## In Scope

1. Define the publication-owner surface for dispatch acknowledgment selection.
2. Move freshness, target-node inclusion, and refresh policy behind the
   publication owner.
3. Remove dispatch-local publication fetch orchestration.

## Out Of Scope

1. Readiness planning snapshot collapse.
2. Bootstrap runtime-surface bridges.
3. Startup SQL mutation bridge removal.

## Invariants

1. Dispatch does not choose publication freshness policy locally.
2. Publication acknowledgment selection is owned by the publication owner.
3. Refresh behavior remains explicit and bounded.

## Hotspots

1. `src/control-plane/replica-dispatch-service.js`
2. `src/control-plane/membership-publication-coordinator.js`
3. `test/control-plane/replica-dispatch-*.test.js`

## Detection / Analysis Tasks

- [x] Extract every dispatch path that asks for publication rows directly.
- [x] Define the owner-returned acknowledgment candidate contract.
- [x] Confirm how refresh and retry hints should surface to callers.

## Implementation Tasks

- [x] Add a membership-publication owner API for acknowledgment-row selection.
- [x] Remove dispatch-local sync fetch and async refresh orchestration.
- [x] Add tests for fresh, stale, and target-node-missing publication cases.

## Validation

1. Targeted unit tests for publication-owner acknowledgment selection.
2. Dispatch tests for acknowledgment under delayed visibility and stale rows.
3. Distributed scenarios: `node-join-under-load`, `seed-restart-under-load`.

## Done When

1. Dispatch asks the publication owner for the answer directly.
2. Publication freshness policy is no longer reproduced in dispatch.
3. Membership acknowledgment behavior is covered by owner-surface tests.
