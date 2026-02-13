# Implementation Plan: Stable Raft Leadership

## Overview

This implementation plan addresses the Raft leadership stability issue by ensuring:
1. All replicas receive complete peer lists
2. All peer addresses use fully qualified network identity format
3. Liferaft handles all Raft consensus logic
4. MessageRouter handles all Raft communication

## Tasks

- [x] 1. Add replica_ids to CREATE_REPLICA message
  - Modify `handleRebalancerAddReplica()` in `src/partition/partition-service.js`
  - Query system table cache for all replicas of the partition
  - Include `replica_ids` array in the CREATE_REPLICA message
  - _Requirements: 4.1_

- [x] 2. Pass replicaIds to PartitionService in replica-lifecycle-manager
  - Modify `createReplicaAsync()` in `src/node/replica-lifecycle-manager.js`
  - Extract `replica_ids` from CREATE_REPLICA message
  - Pass as `replicaIds` option to `createPartitionService()`
  - _Requirements: 4.1_

- [x] 3. Pass replicaIds to PartitionService in replica-handler
  - Modify `createReplicaAsync()` in `src/node/replica-handler.js`
  - Extract `replicaIds` from request
  - Pass to `createPartitionService()`
  - _Requirements: 4.1_

- [x] 4. Verify peer addresses use fully qualified format
  - Review `buildPeerAddress()` in `src/partition/partition-service.js`
  - Ensure addresses always include nodeId: `${nodeId}/partition/${replicaId}`
  - Add logging to verify address format during peer joining
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 5. Remove premature leader election logic
  - Review single-replica detection in `src/partition/partition-service.js`
  - Ensure immediate leader promotion only happens for truly single-replica groups
  - Let liferaft handle all multi-replica elections
  - _Requirements: 4.3, 5.1, 5.2, 5.3_

- [x] 6. Checkpoint - Verify existing tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Write property test for single leader election
  - **Property 1: Single Leader Election**
  - Create test file `test/partition/raft-leadership-stability.property.test.js`
  - Generate random replica configurations
  - Verify exactly one leader after initialization
  - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 8. Write property test for leadership stability
  - **Property 2: Leadership Stability**
  - Create Raft group, wait for election
  - Verify leader doesn't change without topology change
  - Verify term numbers stabilize
  - **Validates: Requirements 2.1, 2.2, 2.3**

- [x] 9. Write property test for message delivery
  - **Property 3: Message Delivery**
  - Generate random Raft messages
  - Verify delivery to correct handler via MessageRouter
  - **Validates: Requirements 3.2, 3.3, 6.2, 6.4**

- [x] 10. Write property test for complete peer list
  - **Property 4: Complete Peer List**
  - Generate replica creation scenarios
  - Verify replicaIds contains all expected peers
  - **Validates: Requirements 4.1**

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Fix message group election storm
  - Defer message group elections until AFTER all partitions are created
  - Modified `phaseMessageGroups()` to NOT start elections immediately
  - Modified `phasePartitions()` to start message group elections first, wait for leadership, then start partition elections
  - This prevents election storms where message group elections interfere with partition creation
  - **All 8632 tests pass**

- [x] 13. Fix Raft log UNIQUE constraint errors during registration
  - Changed `INSERT` to `INSERT OR REPLACE` in `sqlite-log-adapter.js` `append()` method
  - Changed `INSERT` to `INSERT OR REPLACE` in `partition-service.js` `appendEntry()` method
  - This handles duplicate log indices gracefully during Raft log replication
  - **All tests pass**

- [x] 14. Fix unified address format for cross-node communication
  - Updated `MessageGroupService` to accept `peerAddresses` option for cross-node joining
  - Updated `buildPeerAddress()` in `MessageGroupService` to use `peerAddresses` array
  - Updated `phaseJoinExistingMessageGroup()` in `NodeJoiningService` to use `peerAddresses` from bootstrap response
  - Updated `buildReplicaAddresses()` test to expect unified format `${nodeId}/${entityType}/${entityId}`
  - All addresses now use unified format for WebSocket routing
  - **All tests pass**

- [x] 15. Fix CREATE_REPLICA timeout due to lifecycle handler initialization timing
  - **Problem**: When a joining node registers itself in the `nodes` table, the seed node triggers rebalancing which sends CREATE_REPLICA messages. But the joining node's `ReplicaLifecycleManager` wasn't initialized yet, causing message timeouts.
  - **Solution**: Initialize `ReplicaLifecycleManager` BEFORE `phaseQuerySystemState()` (which registers the node)
  - Updated `join()` in `src/bootstrap/node-joining-service.js` to initialize lifecycle manager earlier
  - This ensures the lifecycle handler is registered before the node announces itself to the cluster
  - **All tests pass**

- [x] 16. Fix service row deletion timing during replica removal
  - **Problem**: When removing a replica, the code tried to delete the service row AFTER sending REMOVE_REPLICA. But if removing a replica from `services-p1`, the partition service is shut down before we can write to it.
  - **Solution**: Delete the service row BEFORE sending REMOVE_REPLICA, while the partition service is still running
  - Updated `handleRebalancerRemoveReplica()` in `src/partition/partition-service.js`
  - **All tests pass**

- [x] 17. Fix service row deletion timing (second pass)
  - **Problem**: The previous fix (task 16) was in a different code path. The actual `handleRebalancerRemoveReplica` method still had the deletion AFTER the REMOVE_REPLICA ACK.
  - **Solution**: Moved the `cdcIntegrationService.deleteSystemTableRow()` call to happen BEFORE sending REMOVE_REPLICA
  - This ensures the services table is updated while `services-p1` partition is still running
  - **All tests pass**

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- All tests must complete in < 2 seconds per testing guidelines
- Property tests use fast-check with max 10 iterations
