# Partition Owner Card

## Role

`src/partition/` owns partition service execution, Raft-backed partition
storage, CDC generation and delivery, split/merge workflow, partition
transactions, and partition-local write kernels.

## Primary Owners

- `PartitionService` owns partition-local service behavior.
- `PartitionRaftNode` and `PartitionRaftStorage` own Raft integration and
  durable log/storage behavior.
- `PartitionWriteKernel` owns partition write execution.
- `PartitionTransactionHandler` owns partition-local transaction handling.
- `ManagedSplitWorkflow` owns split lifecycle progression.
- `PartitionSplitMergeManager` owns split/merge evaluation and triggering.
- `PartitionServiceRowOwner` owns partition service-row field mutation.

## First Files

- `index.js` for exported partition surface.
- `partition-constants.js` and `partition-service-constants.js` for vocabulary
  owners.
- `partition-service.js` before changing runtime partition behavior.
- `partition-write-kernel.js` before changing writes.
- `managed-split-workflow.js` before changing split lifecycle.
- `partition-split-merge-manager.js` before changing split/merge policy.

## Do Not

- Do not infer lifecycle completion from cache visibility or timer age.
- Do not mutate row fields owned by another owner.
- Do not add local readiness or repair fallbacks around split/merge admission.
- Do not introduce a new oversized `segment` file when extracting partition
  behavior.

## Proof Surface

- Focused tests under `test/partition/`.
- Query tests when SQL-visible partition behavior changes.
- Distributed scenario proof when split/merge, replication, or recovery
  behavior changes.
- Literal, decision-boundary, and runtime-grammar guardrails for lifecycle,
  transition, and admission changes.
