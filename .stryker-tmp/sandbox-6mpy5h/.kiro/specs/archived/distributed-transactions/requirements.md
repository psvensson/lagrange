# Requirements Document

## Introduction

Lagrange supports multi-partition tables where a single SQL statement may touch
rows on different partitions hosted by different Raft groups on different nodes.
The `DistributedTransactionCoordinator` already owns the 2PC state machine
skeleton, transaction state tables (`sql_transactions`,
`sql_transaction_participants`, `sql_write_operations`), and idempotent
participant enlistment. This spec completes the remaining distributed
transaction work: a real prepare phase at the partition level, atomic
cross-partition commit, cross-partition rollback, coordinator crash recovery
that re-establishes partition-level state, and snapshot isolation so that
multi-partition reads within a transaction observe a consistent point-in-time
view.

### Current State Summary

| Component | Status |
|-----------|--------|
| `DistributedTransactionCoordinator` 2PC state machine | Done |
| Transaction state tables | Done |
| Participant enlistment (idempotent) | Done |
| `beginParticipant` callback (sends BEGIN to partition) | Done |
| `commitParticipant` callback (sends COMMIT to partition) | Done |
| `rollbackParticipant` callback (sends ROLLBACK to partition) | Done |
| `prepareParticipant` callback | Stubbed (no-op) |
| `PartitionService.prepareTransaction` | Missing |
| Coordinator recovery replay of in-flight transactions | Partial |
| Partition-level WAL hold for prepared state | Missing |
| Snapshot isolation / MVCC | Missing |

## Glossary

- **Coordinator**: The `DistributedTransactionCoordinator` instance on the node
  that initiated the transaction. Owns the 2PC state machine and persists
  transaction metadata to `sql_transactions` and `sql_transaction_participants`.
- **Participant**: A `PartitionService` instance that holds a local SQLite
  transaction as part of a distributed transaction. Identified by partition ID.
- **Prepare**: The first phase of 2PC where each participant validates its local
  writes, acquires durable locks, and promises it can commit. A prepared
  partition must survive restart without losing its prepared state.
- **Commit_Decision**: The coordinator's durable record that the transaction
  outcome is COMMITTED. Once persisted, all participants must eventually commit.
- **Rollback_Decision**: The coordinator's durable record that the transaction
  outcome is ROLLED_BACK. Once persisted, all participants must eventually
  roll back.
- **Snapshot**: A consistent point-in-time view of partition data. Reads within
  a snapshot observe only writes committed before the snapshot timestamp.
- **Transaction_Epoch**: A monotonically increasing logical timestamp assigned
  at transaction begin time, used to establish snapshot read boundaries.
- **Write_Set**: The set of rows modified by a transaction on a single
  participant partition, tracked for conflict detection.
- **Read_Set**: The set of rows read by a transaction on a single participant
  partition, tracked for conflict detection under snapshot isolation.
- **Conflict**: A situation where two concurrent transactions modify the same
  row, or where a transaction reads a row that was subsequently modified by
  a committed transaction, violating snapshot isolation.
- **Prepared_State**: The durable state of a participant that has successfully
  completed the prepare phase. The participant holds its write set and locks
  until the coordinator delivers a commit or rollback decision.
- **Recovery_Sweep**: The coordinator process that, after restart, queries
  `sql_transactions` for in-flight transactions and drives each to completion
  (commit or rollback) based on its persisted status.
- **Partition_Leader**: The Raft leader replica of a partition. All transaction
  operations (begin, prepare, commit, rollback) are delivered to the partition
  leader via `MessageRouter`.

## Requirements

### Requirement 1: Partition-Level Prepare

**User Story:** As a database operator, I want each partition participant to
validate and durably prepare its local writes before the coordinator commits,
so that the system guarantees atomicity across partitions.

#### Acceptance Criteria

1. WHEN the Coordinator sends a prepare message to a Participant,
   THE Participant SHALL validate that all local writes in the transaction
   are conflict-free and return a prepare-success acknowledgement.
2. WHEN the Participant detects a write conflict during prepare,
   THE Participant SHALL return a prepare-failure response with a
   conflict description.
3. WHEN a Participant has returned prepare-success, THE Participant SHALL
   hold its Write_Set durable across Raft log entries so that the prepared
   state survives leader failover within the Raft group.
4. IF the Participant receives a prepare message for a session with no
   active local transaction, THEN THE Participant SHALL return a
   prepare-failure response indicating no active transaction.
5. THE Coordinator SHALL wire the `prepareParticipant` callback to deliver
   a prepare message to the Participant via `MessageRouter`, replacing the
   current no-op stub.

### Requirement 2: Atomic Cross-Partition Commit

**User Story:** As a database operator, I want the commit decision to be
atomic so that either all partitions commit or none do, even under partial
failure.

#### Acceptance Criteria

1. WHEN all Participants return prepare-success, THE Coordinator SHALL
   persist the Commit_Decision to `sql_transactions` before sending commit
   messages to any Participant.
2. WHEN the Commit_Decision is persisted, THE Coordinator SHALL send commit
   messages to all Participants and transition each participant status to
   COMMITTED upon acknowledgement.
3. IF a Participant fails to acknowledge a commit message after the
   Commit_Decision is persisted, THEN THE Coordinator SHALL retry the
   commit delivery with bounded exponential backoff until the Participant
   acknowledges.
4. WHEN a Participant receives a commit message for a prepared transaction,
   THE Participant SHALL apply the prepared Write_Set to its SQLite store,
   generate CDC events for all committed writes, and return a commit
   acknowledgement.
5. IF any Participant returns prepare-failure, THEN THE Coordinator SHALL
   abort the transaction and initiate the rollback protocol for all
   Participants.

### Requirement 3: Cross-Partition Rollback

**User Story:** As a database operator, I want rollback to reliably undo
writes across all partitions so that aborted transactions leave no partial
state.

#### Acceptance Criteria

1. WHEN the Coordinator initiates rollback, THE Coordinator SHALL persist
   the Rollback_Decision to `sql_transactions` before sending rollback
   messages to Participants.
2. WHEN a Participant receives a rollback message, THE Participant SHALL
   discard its local Write_Set, release any held locks, and return a
   rollback acknowledgement.
3. IF a Participant fails to acknowledge a rollback message, THEN THE
   Coordinator SHALL retry the rollback delivery with bounded exponential
   backoff until the Participant acknowledges.
4. WHEN a Participant receives a rollback message for a session with no
   active or prepared transaction, THE Participant SHALL return a
   rollback-success acknowledgement (idempotent rollback).
5. WHEN rollback completes for all Participants, THE Coordinator SHALL
   transition the transaction status to ROLLED_BACK and remove the
   transaction from the active transaction map.

### Requirement 4: Coordinator Recovery

**User Story:** As a database operator, I want the coordinator to recover
in-flight transactions after a node restart so that no transaction is left
in an indeterminate state.

#### Acceptance Criteria

1. WHEN the Coordinator restarts, THE Coordinator SHALL query
   `sql_transactions` for all non-terminal transactions and reconstruct
   their in-memory state including participant lists from
   `sql_transaction_participants`.
2. WHEN a recovered transaction has status COMMITTED or COMMITTING,
   THE Coordinator SHALL resume the commit protocol by re-sending commit
   messages to Participants that have not yet acknowledged.
3. WHEN a recovered transaction has status ACTIVE or PREPARING,
   THE Coordinator SHALL abort the transaction and initiate the rollback
   protocol for all enlisted Participants.
4. WHEN a recovered transaction has status PREPARED, THE Coordinator SHALL
   resume the commit protocol from the commit-decision persistence step.
5. IF a Participant is unreachable during recovery replay, THEN THE
   Coordinator SHALL retry with bounded exponential backoff and log a
   structured diagnostic event for each retry attempt.
6. THE Coordinator SHALL complete recovery replay before accepting new
   transaction begin requests for recovered session IDs.

### Requirement 5: Snapshot Isolation for Multi-Partition Reads

**User Story:** As a database developer, I want reads within a transaction
to observe a consistent point-in-time snapshot across all partitions so that
multi-partition queries return a coherent view of the data.

#### Acceptance Criteria

1. WHEN a transaction begins, THE Coordinator SHALL assign a
   Transaction_Epoch representing the logical point-in-time for the
   snapshot.
2. WHEN a Participant receives a read request within a transaction,
   THE Participant SHALL return only rows that were committed before the
   transaction's Transaction_Epoch.
3. WHEN a Participant receives a read request within a transaction,
   THE Participant SHALL include uncommitted writes from the same
   transaction in the read result (read-your-own-writes).
4. THE Participant SHALL maintain sufficient version history to serve
   snapshot reads for all active transactions.
5. WHEN a transaction's snapshot can no longer be served because version
   history has been pruned, THE Participant SHALL return a snapshot-expired
   error to the Coordinator.

### Requirement 6: Write Conflict Detection Under Snapshot Isolation

**User Story:** As a database developer, I want the system to detect
write-write conflicts between concurrent transactions so that snapshot
isolation guarantees are preserved.

#### Acceptance Criteria

1. WHEN two concurrent transactions modify the same row on the same
   Participant, THE Participant that prepares second SHALL detect the
   conflict and return a prepare-failure response.
2. WHEN a conflict is detected, THE Coordinator SHALL abort the conflicting
   transaction and return a serialization-failure error to the client.
3. THE Participant SHALL track the Write_Set per transaction to enable
   conflict detection during the prepare phase.
4. WHEN a transaction commits, THE Participant SHALL release conflict
   tracking state for that transaction's Write_Set.
5. IF a transaction is rolled back, THEN THE Participant SHALL release
   conflict tracking state for that transaction's Write_Set.

### Requirement 7: Transaction Epoch Assignment and Propagation

**User Story:** As a database operator, I want a consistent epoch mechanism
for snapshot boundaries so that all partitions agree on the visibility of
committed data.

#### Acceptance Criteria

1. THE Coordinator SHALL derive the Transaction_Epoch from a monotonically
   increasing source at transaction begin time.
2. WHEN the Coordinator enlists a Participant, THE Coordinator SHALL
   include the Transaction_Epoch in the begin message delivered to the
   Participant.
3. THE Participant SHALL use the Transaction_Epoch to determine read
   visibility boundaries for all queries within the transaction.
4. THE Transaction_Epoch SHALL be persisted in the `sql_transactions` table
   alongside the transaction record.
5. WHEN the Coordinator recovers a transaction, THE Coordinator SHALL
   restore the Transaction_Epoch from the persisted record.

### Requirement 8: Prepared State Durability Across Raft Failover

**User Story:** As a database operator, I want prepared transaction state to
survive Raft leader changes so that the 2PC protocol completes correctly even
when partition leaders fail over.

#### Acceptance Criteria

1. WHEN a Participant prepares a transaction, THE Participant SHALL
   replicate the prepared Write_Set through the Raft log before returning
   prepare-success.
2. WHEN a new Raft leader is elected for a partition with prepared
   transactions, THE new leader SHALL reconstruct the Prepared_State from
   the Raft log.
3. WHEN a Participant with Prepared_State receives a commit message,
   THE Participant SHALL apply the prepared Write_Set regardless of whether
   a leader change occurred since prepare.
4. WHEN a Participant with Prepared_State receives a rollback message,
   THE Participant SHALL discard the prepared Write_Set regardless of
   whether a leader change occurred since prepare.
5. IF a Participant cannot reconstruct Prepared_State after leader
   election, THEN THE Participant SHALL report prepare-lost to the
   Coordinator when the next commit or rollback message arrives.

### Requirement 9: Transaction Timeout and Cleanup

**User Story:** As a database operator, I want stale transactions to be
cleaned up automatically so that prepared locks and version history do not
accumulate indefinitely.

#### Acceptance Criteria

1. THE Coordinator SHALL enforce a configurable transaction timeout budget
   derived from the control-plane timeout policy.
2. WHEN a transaction exceeds its timeout budget, THE Coordinator SHALL
   initiate the rollback protocol for all enlisted Participants.
3. THE Participant SHALL enforce a local prepared-state hold timeout so
   that prepared locks are released if the Coordinator does not deliver a
   commit or rollback decision within the hold period.
4. WHEN a Participant releases prepared state due to timeout, THE
   Participant SHALL log a structured diagnostic event with the transaction
   ID and hold duration.
5. THE Coordinator SHALL run a periodic Recovery_Sweep to detect and
   resolve transactions that are stuck in non-terminal states beyond the
   timeout budget.
