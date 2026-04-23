# Partition Service Boundary Decompression and Formatting

## Why

`src/partition/partition-service.js` is still one of the least readable
runtime owners in the repository. It mixes Raft bootstrap, peer
reconciliation, split mirroring, rebalancer wiring, and local helpers inside
compressed sections that are hard to inspect safely.

That makes current bug hunts harder because partitioning and recovery failures
cross several concerns in one file. The file needs one formatting and
decompression pass before deeper extraction work can follow system-guideline
discipline.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Rewrite `src/partition/partition-service.js` into a readable, consistently
   formatted file without changing runtime behavior.
2. Split obviously compressed helper blocks into owner-local helpers where
   needed to prepare later extraction work.
3. Preserve current partition bootstrap, peer-reconciliation, and split-write
   semantics during the readability pass.
4. Update direct partition-owner tests only where fixture or snapshot
   formatting expectations require it.

## Out Of Scope

1. New partition lifecycle behavior
2. Broad rebalancer or query-path redesign
3. The later split-routing extraction itself beyond minimal helper shaping

## Scenario Targets

1. `seven-node-load-during-partitioning`
2. `seven-node-table-partition-distribution`
3. `node-join-under-load`

## Invariants

1. The pass must stay behavior-preserving.
2. Partition bootstrap, Raft peer discovery, and split mirroring must keep the
   same external contracts during this package.
3. The file must become readable enough that later extraction packages can be
   reviewed boundary-by-boundary.

## Hotspots

1. `src/partition/partition-service.js`
2. direct partition-owner tests that prove the pass stayed semantic-neutral

## Detection / Analysis Tasks

- [ ] Record the compressed sections that currently hide multiple owners.
- [ ] Identify helper boundaries that can be split safely without semantic
      change.
- [ ] Confirm the pass preserves existing partition-owner contracts.

## Implementation Tasks

- [ ] Rewrite the file into readable, consistently formatted sections.
- [ ] Extract owner-local helpers only where needed to remove compressed
      blocks.
- [ ] Keep runtime behavior stable and avoid broad logic changes in this
      package.

## Residual Closure Inventory

- [ ] `src/partition/partition-service.js` no longer contains compressed
      sections that block follow-on extraction work.
- [ ] Partition-owner tests still prove the pre-existing behavior.
- [ ] Follow-on split-routing extraction work is linked explicitly rather than
      implied.

## Validation

1. Targeted `PartitionService` unit coverage
2. Focused partition/rebalance integration coverage that exercises bootstrap
   and split mirroring
3. `npm run test:metrics`

## Done When

1. `src/partition/partition-service.js` is readable enough for bounded owner
   extraction.
2. The pass is behavior-preserving and tests stay green.
3. Follow-on split-routing extraction can proceed without another formatting
   cleanup pass.
