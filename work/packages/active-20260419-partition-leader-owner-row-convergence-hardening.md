# Partition Leader Owner-Row Convergence Hardening

## Status

Active on 2026-04-19. The owner-row cutover slice is landed:

1. partition leader observation now distinguishes owner-row truth from
   owner-row lag/staleness instead of silently treating service-role witnesses
   as equivalent truth
2. `PartitionService`, `QueryRouter`, and `QueryExecutor` now fail closed on
   owner-missing leader identity while preserving owner-confirmed service-gap
   repair and retained bootstrap owner metadata
3. routing diagnostics now surface one canonical partition-leader observation
   state and reason alongside the existing leader identity snapshot

Focused proof and repo metrics are green. Named harness evidence remains the
final closure gate.

## Why

The latest routing outages showed that partition routing is only as strong as
`partitions.leader_node_id`. Published services metadata can no longer carry
that truth for us, so the partition owner row needs a tighter convergence and
diagnostic contract than it has today.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Tighten the owner contract for `partitions.leader_node_id` convergence and
   observation.
2. Remove remaining fallback interpretations that treat service rows or local
   role hints as equivalent leader truth.
3. Add authoritative diagnostics and proof for leader-owner lag versus missing
   leader truth.

## Scenario Targets

1. `node-join-under-load`
2. `seven-node-load-during-partitioning`
3. `seven-node-table-partition-distribution`

## Invariants

1. Partition routing must use one durable leader owner row as truth.
2. Missing leader owner-row evidence must fail closed with typed diagnostics.
3. Service-row follower/leader hints must not substitute for partition leader
   truth.

## Residual Closure Inventory

- [x] One canonical partition-leader observation contract exists.
- [x] Fallback service-row leader interpretation is deleted from the touched
      partition-routing paths.
- [x] Focused partition-routing proof is green.
- [ ] Named harness evidence is green.
