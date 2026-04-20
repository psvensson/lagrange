# Replica Enactment And Partition-Kernel Split

## Status

Complete on 2026-04-19 after extracting the partition write kernel, routing
`PartitionService` write/apply flow through it, and proving replayable cleanup
behavior on focused partition and replica-handler coverage. Named harness
reruns remain intentionally deferred until the completed package set is handed
back to the harness lane.

## Why

`ReplicaHandler` and `PartitionService` still carry too much lifecycle and
topology meaning. The system needs one small partition kernel for
`validate -> persist -> apply`, with enactment and cleanup as idempotent side
effects around durable intent.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Separate semantic workflow truth from local enactment.
2. Split `PartitionService` toward a small apply kernel plus owned adapters.
3. Make cleanup and retirement replayable side effects after durable truth.

## Scenario Targets

1. `node-join-under-load`
2. `seven-node-postgres-baseline-partition-split`
3. `seven-node-read-write-load-distribution`

## Residual Closure Inventory

- [x] `partition-write-kernel` now owns entry construction, commit-mode
      selection, SQLite execution, failure shaping, and post-apply side-effect
      planning.
- [x] `PartitionService` applies writes through the kernel boundary and runs
      CDC, split, and size/evaluation work as explicit post-apply side effects.
- [x] Replica removal cleanup is proven to remain replayable without making
      durable removal truth ambiguous when local cleanup defers.

## Validation

1. `test/partition/partition-write-kernel.test.js`
2. `test/partition/partition-service-raft-propose-metrics.test.js`
3. `test/node/replica-handler.test.js`
4. `npm run test:metrics`
