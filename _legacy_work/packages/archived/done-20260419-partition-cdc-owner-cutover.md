# Partition CDC Owner Cutover

## Status

Complete on 2026-04-19 after the shared CDC-generator cutover plus focused
partition CDC tests and repo metrics. Named harness reruns remain
intentionally deferred until the full reuse-first tranche is closed.

## Why

`PartitionService` already has extracted CDC parsing and generation helpers, but
it still owns a parallel event-construction state machine. That keeps CDC
behavior harder to prove than it needs to be and leaves the service carrying
two semantic answers for the same work.

This package moves the touched CDC path toward one owner for event generation
while preserving the existing buffering and delivery contract.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reuse `src/partition/partition-cdc-generator.js` from
   `src/partition/partition-service.js` where semantics already match
2. Preserve `PartitionService` ownership of subscriber buffering, retry, and
   shutdown awaiting
3. Add or update focused CDC tests that prove the shared generator contract

## Out Of Scope

1. New CDC features
2. CDC transport redesign outside the touched partition-service path
3. Replay-window redesign beyond the existing buffer contract

## Scenario Targets

1. `seven-node-read-write-load-distribution`
2. `seven-node-read-write-load-transaction-recovery`
3. `seven-node-postgres-baseline-partition-split`

## Invariants

1. CDC event shape, no-op suppression, buffering rules, and delivery semantics
   must remain stable.
2. `PartitionService` must not keep a second parallel event-construction owner
   after the cutover.
3. Focused partition CDC tests plus metrics must remain green.

## Shared Boundary Contract

- Semantic owner: `src/partition/partition-cdc-generator.js`
- Canonical contract shape / vocabulary: one typed CDC event with table,
  operation, data, timestamp, source partition, and source replica
- Allowed consumers: `PartitionService`, focused CDC tests, CDC diagnostics
- Prohibited reinterpretations: duplicate SQL parsing and mutation-to-event
  mapping logic inside `PartitionService`
- Primary diagnostics / proof surfaces: CDC generator tests, partition CDC
  suppression tests, distributed CDC scenario evidence

## Detection / Analysis Tasks

- [x] Diff `PartitionService.generateCDCEvent()` against
      `PartitionCDCGenerator.generateEvent()`.
- [x] Mark the semantics that remain partition-service-only.
- [x] Prove no-op suppression and buffering behavior around the cutover.

## Implementation Tasks

- [x] Reuse the extracted CDC generator where event-construction semantics
      already align.
- [x] Keep buffering and delivery ownership in one place.
- [x] Delete superseded CDC parsing or event-shaping logic from
      `PartitionService`.

## Residual Closure Inventory

- [x] CDC event construction has one semantic owner.
- [x] `PartitionService` keeps only buffer/delivery concerns that are still
      local by contract.
- [x] Superseded duplicate CDC logic is deleted.

## Validation

1. `test/partition/partition-cdc-generator.test.js`
2. `test/partition/partition-service-cdc-log-suppression.test.js`
3. Additional touched partition CDC tests
4. `npm run test:metrics`

## Done When

1. CDC event construction flows through one reusable owner path.
2. Buffering and delivery semantics remain intact.
3. The named scenario lanes keep green or fail with one obvious typed CDC
   blocker story.
