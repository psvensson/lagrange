# Implementation Plan: Distributed Transactions

## Overview

Complete the distributed transaction support in Lagrange by implementing partition-level prepare, atomic cross-partition commit/rollback, coordinator crash recovery, snapshot isolation, write conflict detection, and transaction timeout/cleanup. All changes extend existing owners (`DistributedTransactionCoordinator`, `PartitionService`, `SQLQueryEngine`) with no new classes. Constants are added to existing constants files. Property-based tests use `fast-check` with `{numRuns: 10}`.

## Tasks

- [x] 1. Add new constants for distributed transaction operations
  - [x] 1.1 Add query-layer constants to `src/query/query-constants.js`
    - Add `QUERY_OPERATION.PREPARE` operation type
    - Add `QUERY_ERROR_CODE.PREPARE_FAILED`, `QUERY_ERROR_CODE.WRITE_CONFLICT`, `QUERY_ERROR_CODE.SNAPSHOT_EXPIRED`, `QUERY_ERROR_CODE.PREPARE_LOST` error codes
    - Add corresponding `QUERY_ERROR_MSG` entries for each new error code
    - _Requirements: 1.1, 1.2, 1.5, 5.5, 6.2, 8.5_

  - [x] 1.2 Add partition-layer constants to `src/partition/partition-service-constants.js`
    - Add `PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION` operation type
    - Add `PARTITION_SERVICE_ERROR_MSG` entries: `PREPARE_CONFLICT`, `NO_ACTIVE_TRANSACTION_PREPARE`, `SNAPSHOT_EXPIRED`, `PREPARE_LOST`
    - Add `PARTITION_SERVICE_LOG_MSG` entries: `PREPARING_TRANSACTION`, `PREPARED_STATE_RECONSTRUCTED`, `PREPARED_STATE_HOLD_TIMEOUT`
    - Add `PARTITION_SERVICE_SQL.SAVEPOINT_PREPARE` for SQLite savepoint
    - _Requirements: 1.1, 1.2, 1.4, 5.5, 8.5, 9.4_

  - [x] 1.3 Add timeout budget constants to `src/control-plane/timeout-budget.js`
    - Add `TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS` (default transaction timeout)
    - Add `TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS` (participant-side hold timeout)
    - _Requirements: 9.1, 9.3_

- [x] 2. Implement transaction epoch assignment and propagation
  - [x] 2.1 Add `transactionEpoch` to coordinator `begin()` method
    - Accept `epochSource` function in `DistributedTransactionCoordinator` constructor options
    - Assign `transactionEpoch` from epoch source in `begin()`, store on transaction record
    - Fail `begin()` with typed error if epoch source is unavailable (no fallback to wall clock)
    - _Requirements: 5.1, 7.1_

  - [x]* 2.2 Write property test: Epoch monotonicity (Property 9)
    - **Property 9: Epoch monotonicity**
    - For any sequence of `begin()` calls, assigned epochs are strictly monotonically increasing
    - Test file: `test/query/distributed-transaction-coordinator.property.test.js`
    - **Validates: Requirements 5.1, 7.1**

  - [x] 2.3 Persist `transaction_epoch` and `timeout_deadline` in `sql_transactions`
    - Extend `persistTransactionRecord` to include `transaction_epoch` and `timeout_deadline` columns
    - Extend `recoverFromSystemTables` to restore `transactionEpoch` from persisted `transaction_epoch` column
    - _Requirements: 7.4, 7.5_

  - [x]* 2.4 Write property test: Transaction epoch round-trip (Property 8)
    - **Property 8: Transaction epoch round-trip through persistence**
    - For any transaction, the epoch assigned at begin time equals the epoch restored after recovery
    - Test file: `test/query/distributed-transaction-coordinator.property.test.js`
    - **Validates: Requirements 7.4, 7.5**

  - [x] 2.5 Propagate epoch in begin message to participants
    - Modify `deliverTransactionOperation` in `SQLQueryEngine` to include `transactionEpoch` in the BEGIN message payload
    - Modify `PartitionService.beginTransaction` to accept and store `transactionEpoch` on `activeTransaction`
    - _Requirements: 7.2, 7.3_

  - [x]* 2.6 Write property test: Epoch propagation in begin message (Property 17)
    - **Property 17: Epoch propagation in begin message**
    - For any participant enlistment, the begin message includes the transaction epoch
    - Test file: `test/query/distributed-transaction-coordinator.property.test.js`
    - **Validates: Requirements 7.2**

- [x] 3. Implement write set tracking and conflict detection on PartitionService
  - [x] 3.1 Add write set tracking to `PartitionService`
    - Add `activeTransactions` Map (sessionId → TransactionState with epoch, writeSet, readSet)
    - Add `committedWriteLog` array for recent committed write sets with epoch and timestamp
    - Track row keys in write set during `executeTransactionWrite`
    - Release conflict tracking state on commit and rollback
    - _Requirements: 6.3, 6.4, 6.5_

  - [x]* 3.2 Write property test: Write set tracking and cleanup (Property 11)
    - **Property 11: Write set tracking and cleanup**
    - For any transaction, the write set reflects all modified row keys; on terminal state, conflict tracking is released
    - Test file: `test/partition/partition-transaction.property.test.js`
    - **Validates: Requirements 6.3, 6.4, 6.5**

  - [x] 3.3 Implement `checkWriteConflicts` on `PartitionService`
    - For each row key in the write set, check if any transaction with epoch > current epoch has committed a write to that key
    - Return conflict description (conflicting row keys, conflicting epoch) if conflict found
    - Implements first-committer-wins strategy
    - _Requirements: 6.1, 6.2_

- [x] 4. Implement partition-level prepare
  - [x] 4.1 Implement `PartitionService.prepareTransaction(sessionId)`
    - Validate active transaction exists for session; return prepare-failure with `NO_ACTIVE_TRANSACTION_PREPARE` if not
    - Call `checkWriteConflicts` on the write set; return prepare-failure with `PREPARE_CONFLICT` if conflict detected
    - Replicate prepared state through Raft log as `PREPARE_TRANSACTION` entry before returning prepare-success
    - Move transaction from `activeTransactions` to `preparedTransactions` map with raft log index and timestamp
    - Record `preparedAt` timestamp for hold timeout tracking
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1_

  - [x]* 4.2 Write property test: Prepare reflects conflict status (Property 1)
    - **Property 1: Prepare reflects conflict status**
    - For any transaction with a write set, prepare returns success iff no conflicts exist with committed writes at higher epochs
    - Test file: `test/partition/partition-transaction.property.test.js`
    - **Validates: Requirements 1.1, 1.2, 6.1**

  - [x]* 4.3 Write property test: Prepare replicates through Raft (Property 12)
    - **Property 12: Prepare replicates through Raft before returning**
    - For any successful prepare, the Raft log index is recorded in prepared state before prepare-success is returned
    - Test file: `test/partition/partition-transaction.property.test.js`
    - **Validates: Requirements 1.3, 8.1**

  - [x] 4.4 Add `PREPARE` case to transaction message dispatch
    - Add `PREPARE` handling in the transaction operation dispatch path (alongside existing BEGIN/COMMIT/ROLLBACK)
    - Wire through `handleRemoteQuery` or the appropriate message handler to call `prepareTransaction`
    - _Requirements: 1.5_

  - [x] 4.5 Wire `prepareParticipant` callback in `SQLQueryEngine`
    - Replace the no-op `prepareParticipant: async () => {}` stub with a real call to `deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.PREPARE)`
    - Add `PREPARE` error handling in `deliverTransactionOperation`
    - _Requirements: 1.5_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement snapshot isolation read visibility
  - [x] 6.1 Add commit epoch tracking to `PartitionService`
    - On `commitTransaction`, record `commit_epoch` metadata for committed rows in `committedWriteLog`
    - Maintain sufficient version history for active transaction snapshot reads
    - _Requirements: 5.4_

  - [x] 6.2 Implement snapshot read filtering on `PartitionService`
    - Modify the read path in `executeQuery` to filter rows by `commit_epoch < transaction_epoch` for transactional reads
    - Include uncommitted rows from the current transaction's write set (read-your-own-writes)
    - Exclude uncommitted rows from other transactions
    - Return `SNAPSHOT_EXPIRED` error when version history has been pruned for the requested epoch
    - _Requirements: 5.2, 5.3, 5.5_

  - [x]* 6.3 Write property test: Snapshot read visibility (Property 10)
    - **Property 10: Snapshot read visibility**
    - For any transaction T with epoch E, reads return only rows committed before E plus T's own writes; other uncommitted rows are never visible
    - Test file: `test/partition/partition-transaction.property.test.js`
    - **Validates: Requirements 5.2, 5.3, 7.3**

- [x] 7. Implement atomic cross-partition commit
  - [x] 7.1 Ensure commit decision persistence precedes participant messages
    - Verify `runCommitProtocol` persists `COMMITTING` status to `sql_transactions` via `setTransactionStatus` before sending any commit messages (already structured this way; add explicit validation)
    - On `commitTransaction` at participant: apply prepared write set from `preparedTransactions`, generate CDC events, release prepared state
    - _Requirements: 2.1, 2.2, 2.4_

  - [x]* 7.2 Write property test: Decision persistence precedes messages (Property 2)
    - **Property 2: Decision persistence precedes participant messages**
    - For any commit or rollback decision, the persistence callback timestamp precedes all participant message delivery timestamps
    - Test file: `test/query/distributed-transaction-coordinator.property.test.js`
    - **Validates: Requirements 2.1, 3.1**

  - [x] 7.3 Implement commit/rollback retry with bounded exponential backoff
    - Add retry logic with bounded exponential backoff for participant commit/rollback delivery failures
    - Integrate with existing `executeParticipantStage` retry mechanism or extend it
    - _Requirements: 2.3, 3.3_

  - [x]* 7.4 Write property test: Participant message delivery retries (Property 4)
    - **Property 4: Participant message delivery retries with bounded backoff**
    - For any participant that fails to acknowledge, retries are bounded and delays increase with exponential backoff
    - Test file: `test/query/distributed-transaction-coordinator.property.test.js`
    - **Validates: Requirements 2.3, 3.3, 4.5**

  - [x]* 7.5 Write property test: Commit applies write set and generates CDC (Property 5)
    - **Property 5: Commit applies write set and generates CDC events**
    - For any prepared transaction receiving commit, the write set is applied and CDC events are generated
    - Test file: `test/partition/partition-transaction.property.test.js`
    - **Validates: Requirements 2.2, 2.4**

- [x] 8. Implement cross-partition rollback
  - [x] 8.1 Implement rollback for prepared and active transactions
    - Ensure `rollbackTransaction` on `PartitionService` handles both active and prepared transactions
    - Discard write set from `preparedTransactions` or `activeTransactions`, release locks
    - Return rollback-success for sessions with no active/prepared transaction (idempotent)
    - On coordinator: persist `ROLLING_BACK` status before sending rollback messages; transition to `ROLLED_BACK` when all participants acknowledge
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [x]* 8.2 Write property test: Rollback discards write set (Property 6)
    - **Property 6: Rollback discards write set and releases locks**
    - For any active or prepared transaction, rollback discards write set and returns success; idempotent for non-existent sessions
    - Test file: `test/partition/partition-transaction.property.test.js`
    - **Validates: Requirements 3.2, 3.5**

  - [x]* 8.3 Write property test: Prepare failure triggers rollback (Property 3)
    - **Property 3: Prepare failure triggers rollback for all participants**
    - For any transaction where at least one participant returns prepare-failure, all participants are rolled back
    - Test file: `test/query/distributed-transaction-coordinator.property.test.js`
    - **Validates: Requirements 2.5, 6.2**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement prepared state durability across Raft failover
  - [x] 10.1 Implement `reconstructPreparedState` on `PartitionService`
    - On leader election, scan recent Raft log entries for `PREPARE_TRANSACTION` entries not followed by COMMIT/ROLLBACK
    - Rebuild `preparedTransactions` map from those entries
    - Handle `PREPARE_LOST` case: if reconstruction fails, report prepare-lost when next commit/rollback arrives
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [x]* 10.2 Write property test: Prepared state reconstruction (Property 13)
    - **Property 13: Prepared state reconstruction after leader election**
    - For any partition with prepared transactions, after leader election the new leader reconstructs prepared state; commit/rollback succeeds as if no leader change occurred
    - Test file: `test/partition/partition-transaction.property.test.js`
    - **Validates: Requirements 8.2, 8.3, 8.4**

- [x] 11. Implement coordinator recovery
  - [x] 11.1 Extend `recoverFromSystemTables` for epoch and timeout restoration
    - Restore `transactionEpoch` from `transaction_epoch` column in recovered rows
    - Restore `timeout_deadline` from persisted column
    - Ensure recovery blocks new transactions on recovered session IDs until replay completes
    - _Requirements: 4.1, 4.6, 7.5_

  - [x] 11.2 Implement recovery decision logic
    - COMMITTING/PREPARED transactions: resume commit protocol (re-send commit to pending participants)
    - ACTIVE/PREPARING transactions: abort and initiate rollback for all enlisted participants
    - Log structured diagnostic event for each retry attempt on unreachable participants
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x]* 11.3 Write property test: Recovery drives to terminal state (Property 7)
    - **Property 7: Recovery drives transactions to correct terminal state**
    - For any set of non-terminal recovered transactions, COMMITTING/PREPARED resume commit; ACTIVE/PREPARING are rolled back; all reach terminal state
    - Test file: `test/query/distributed-transaction-coordinator.property.test.js`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 12. Implement transaction timeout and cleanup
  - [x] 12.1 Add timeout budget tracking to coordinator
    - Assign timeout budget at `begin()` using `createTopLevelOperationBudget` from `timeout-budget.js`
    - Persist `timeout_deadline` to `sql_transactions`
    - On each protocol step, check remaining budget; initiate rollback if exceeded
    - _Requirements: 9.1, 9.2_

  - [x]* 12.2 Write property test: Transaction timeout triggers rollback (Property 14)
    - **Property 14: Transaction timeout triggers rollback**
    - For any transaction exceeding its timeout budget, rollback is initiated for all participants; budget is derived from `createTopLevelOperationBudget`
    - Test file: `test/query/distributed-transaction-coordinator.property.test.js`
    - **Validates: Requirements 9.1, 9.2**

  - [x] 12.3 Implement participant prepared-state hold timeout
    - Add periodic check on `preparedTransactions` for entries exceeding `PREPARED_HOLD_TIMEOUT_MS`
    - Release prepared state and locks autonomously on timeout
    - Log structured diagnostic event with transaction ID and hold duration
    - Return `PREPARE_LOST` on subsequent commit/rollback from coordinator
    - _Requirements: 9.3, 9.4_

  - [x]* 12.4 Write property test: Participant hold timeout (Property 15)
    - **Property 15: Participant prepared-state hold timeout**
    - For any prepared transaction, if no commit/rollback arrives within the hold period, prepared state is released autonomously
    - Test file: `test/partition/partition-transaction.property.test.js`
    - **Validates: Requirements 9.3**

  - [x] 12.5 Implement coordinator recovery sweep
    - Add `startRecoverySweep()` and `stopRecoverySweep()` methods on `DistributedTransactionCoordinator`
    - Periodic query of `sql_transactions` for non-terminal transactions beyond timeout budget
    - Drive stuck transactions to terminal state (rollback for ACTIVE/PREPARING, commit resume for COMMITTING/PREPARED)
    - _Requirements: 9.5_

  - [x]* 12.6 Write property test: Recovery sweep resolves stuck transactions (Property 16)
    - **Property 16: Recovery sweep resolves stuck transactions**
    - For any transaction stuck beyond timeout budget, the sweep detects and drives it to terminal state
    - Test file: `test/query/distributed-transaction-coordinator.property.test.js`
    - **Validates: Requirements 9.5**

- [x] 13. Update architecture documentation
  - Update `architecture.md` to document the completed distributed transaction support
    - Document `DistributedTransactionCoordinator` as the 2PC owner with prepare, commit, rollback, recovery, and timeout
    - Document `PartitionService` as the participant-side owner with prepare, snapshot isolation, write conflict detection, and prepared state durability
    - Document the epoch-based snapshot isolation model and write conflict detection strategy
    - Document the `PREPARE_TRANSACTION` Raft log entry type
    - _Requirements: all_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All constants are added to existing constants files (no new files for constants)
- The implementation language is JavaScript, matching the existing codebase
- Property-based tests use `fast-check` with `{numRuns: 10}` per workspace testing guidelines
