# Partition Split-Routing Extraction from Partition Service

## Why

Split-routing SQL extraction currently lives inside `PartitionService`, which
forces split bugs to cross Raft/bootstrap/rebalance code and query-routing
parsing in one owner. That makes partitioning failures harder to debug and
harder to test in isolation.

This package extracts split-routing key resolution into a dedicated owner so
split replication bugs stop sharing the same debugging surface as partition
lifecycle work.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Extract split-routing key resolution and SQL-data extraction from
   `src/partition/partition-service.js` into a dedicated owner.
2. Make `PartitionService` consume one canonical split-routing contract rather
   than parsing mirrored-write inputs directly.
3. Touch direct query or parser collaborators only where needed to preserve
   one canonical split-routing answer.
4. Remove superseded split-routing parsing logic from `PartitionService`.

## Out Of Scope

1. New split-planning features
2. Broad partition-service redesign beyond the touched split-routing boundary
3. General SQL parser work outside what the extracted owner requires

## Scenario Targets

1. `seven-node-load-during-partitioning`
2. `seven-node-table-partition-distribution`
3. `seven-node-postgres-baseline-partition-split`

## Invariants

1. Split-routing key resolution must have one semantic owner.
2. `PartitionService` must no longer parse mirrored-write routing keys as a
   side concern of partition lifecycle work.
3. Split-routing failures must emit one canonical typed blocker story.

## Shared Boundary Contract

- Semantic owner: extracted split-routing owner for mirrored writes
- Canonical contract shape / vocabulary: one split-routing answer containing
  target partition identity or one typed failure reason
- Allowed consumers: `PartitionService`, split workflow tests, focused
  partitioning diagnostics
- Prohibited reinterpretations: callers must not rebuild split-routing keys
  from raw SQL text in multiple places
- Primary diagnostics / proof surfaces: partition split tests, mirrored-write
  regressions, named partitioning scenarios

## Detection / Analysis Tasks

- [ ] Build the current split-routing parsing inventory.
- [ ] Detect duplicated SQL-data extraction behavior already owned elsewhere.
- [ ] Define the extracted split-routing contract before moving logic.

## Implementation Tasks

- [ ] Extract the split-routing owner.
- [ ] Cut `PartitionService` over to the extracted contract.
- [ ] Delete superseded split-routing parsing logic from `PartitionService`.

## Residual Closure Inventory

- [ ] `PartitionService` no longer directly owns split-routing SQL extraction.
- [ ] Tail callers use one canonical split-routing answer.
- [ ] Superseded parsing paths are deleted from the partition owner.

## Validation

1. Targeted split-routing and partition tests
2. Focused split workflow and mirrored-write regression coverage
3. Distributed scenario evidence for the named partitioning lanes
4. `npm run test:metrics`

## Done When

1. Split-routing extraction has one dedicated owner.
2. `PartitionService` is no longer the debugging surface for split SQL parsing.
3. The named partitioning lanes keep green or fail with one obvious typed
   blocker story.
