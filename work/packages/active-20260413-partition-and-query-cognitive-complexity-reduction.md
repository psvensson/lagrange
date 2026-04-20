# Partition and Query Routing Predictability

## Why

The remaining partition and query hotspots sit on boundaries that decide where
work is allowed, where it is sent, and how runtime state is interpreted during
load, recovery, and partitioning. When those decisions are spread across
branch piles or fallback paths, harness failures become hard to explain and
harder to stabilize.

This package focuses on making routing, admission, and query execution produce
one canonical answer for the scenario families that currently stress them.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Simplify the relevant owner paths in `src/partition/partition-service.js`
2. Simplify the relevant owner paths in `src/query/query-executor.js`
3. Simplify the relevant owner paths in `src/query/sql-query-engine.js`
4. Touch direct collaborators only where needed to preserve one owner path for
   routing, admission, and execution decisions

## Out Of Scope

1. New query or partitioning features
2. Broad transport or admin redesign outside direct collaborators required by
   the touched owner path
3. General duplication cleanup outside the touched routing and execution lane

## Scenario Targets

1. `node-join-under-load`
2. `seven-node-load-during-partitioning`
3. `seven-node-read-write-load-distribution`
4. `seven-node-read-write-load-transaction-recovery`
5. `seven-node-table-partition-distribution`
6. `seven-node-postgres-baseline-partition-split`

## Invariants

1. Admission, routing, partition placement, and execution decisions must flow
   through one normalized snapshot and one explicit outcome model.
2. Refactors must not reintroduce duplicated semantic answerers or hidden
   fallback paths.
3. Focused query and partition coverage plus the relevant scenario evidence
   must remain green on the touched lane.

## Execution Split

1. [Canonical leader routing reuse cutover](active-20260419-canonical-leader-routing-reuse-cutover.md)
2. [Partition CDC owner cutover](active-20260419-partition-cdc-owner-cutover.md)
3. [Query executor boundary decompression and formatting](todo-20260418-query-executor-boundary-decompression-and-formatting.md)
4. [Partition service boundary decompression and formatting](todo-20260418-partition-service-boundary-decompression-and-formatting.md)
5. [Query executor routing and delivery owner split](todo-20260418-query-executor-routing-and-delivery-owner-split.md)
6. [Partition split-routing extraction from partition service](todo-20260418-partition-split-routing-extraction-from-partition-service.md)

## Residual Closure Inventory

- [ ] `src/query/query-executor.js` is decompressed and readable enough for
      bounded owner extraction.
- [ ] `src/partition/partition-service.js` is decompressed and readable enough
      for bounded owner extraction.
- [ ] Routing/candidate selection and delivery-budget behavior are split into
      clearer owners.
- [ ] Split-routing SQL extraction is no longer owned by `PartitionService`.
- [ ] Diagnostics and scenario evidence reflect the simplified contracts.

## Validation

1. Targeted partition and query tests for the touched owner paths
2. Focused scenario evidence for the named routing and distribution lanes
3. `npm run test:metrics`

## Done When

1. The touched query and partition owners answer routing and execution
   questions through one canonical path with readable reasons.
2. The named scenario families are either green on the touched lane or fail
   with one obvious typed blocker story.
3. `npm run test:metrics` stays green on the tightened baselines.
