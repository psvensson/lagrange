# Implementation Plan: Node Joining Rebalancer Fixes

## Overview

This implementation plan addresses inter-node communication issues during node joining by:
1. Creating a PendingRequestTracker to replace EventEmitter-based ACK handling
2. Adding stabilization period to the rebalancer
3. Registering seed node partitions with ReplicaLifecycleManager
4. Ensuring lifecycle handler is registered on seed node

## Tasks

- [x] 1. Create PendingRequestTracker class
  - Create new file `src/partition/pending-request-tracker.js`
  - Implement Map-based request tracking with timeout management
  - Export class and types
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 1.1 Write property test for pending request round-trip
  - **Property 7: Pending Request Tracking Round-Trip**
  - **Validates: Requirements 3.2, 3.3**

- [x] 1.2 Write property test for timeout cleanup
  - **Property 8: Timeout Cleanup**
  - **Validates: Requirements 3.4**

- [x] 2. Add stabilization period to UnifiedRebalancer
  - Add stabilization configuration (default 5s, range 1-10s)
  - Add `lastStateChangeTime` and `stabilizationTimer` state
  - Implement `isStabilized()` and `recordStateChange()` methods
  - Modify `checkRebalance()` to wait for stabilization
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2.1 Write property test for stabilization period bounds
  - **Property 3: Stabilization Period Configuration Bounds**
  - **Validates: Requirements 2.1**

- [x] 2.2 Write property test for stabilization waiting
  - **Property 4: Stabilization Waiting Before Moves**
  - **Validates: Requirements 2.2, 2.3**

- [x] 2.3 Write property test for stabilization timer reset
  - **Property 6: Stabilization Timer Reset**
  - **Validates: Requirements 2.5**

- [x] 3. Add registerExistingReplica to ReplicaLifecycleManager
  - Implement `registerExistingReplica()` method
  - Handle idempotent registration (no error on duplicate)
  - Log registration for debugging
  - _Requirements: 1.2_

- [x] 3.1 Write property test for partition registration invariant
  - **Property 1: Partition Registration Invariant**
  - **Validates: Requirements 1.1, 1.2**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Modify BootstrapService to register partitions and lifecycle handler
  - Add `registerPartitionsWithLifecycleManager()` method
  - Add `registerLifecycleHandler()` method
  - Call both methods after bootstrap completes
  - _Requirements: 1.1, 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5.1 Write property test for lifecycle handler address format
  - **Property 10: Lifecycle Handler Address Format**
  - **Validates: Requirements 4.2**

- [x] 5.2 Write property test for lifecycle message delegation
  - **Property 11: Lifecycle Message Delegation**
  - **Validates: Requirements 4.3, 4.4, 4.5**

- [x] 6. Refactor PartitionService.deliverWithAck to use PendingRequestTracker
  - Replace EventEmitter-based ACK handling with PendingRequestTracker
  - Implement `extractAckFromResponse()` helper
  - Remove `once` listener registration for ACK events
  - Update shutdown to clear pending requests
  - _Requirements: 3.1, 6.1, 6.2, 6.3, 6.4_

- [x] 6.1 Write property test for ACK extraction from response
  - **Property 14: ACK Extraction From Response**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 7. Add move deduplication checks to UnifiedRebalancer
  - Enhance `calculateMoves()` to check pending moves
  - Ensure no duplicate ADD moves for same target node
  - Ensure no duplicate REMOVE moves for same replica
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 7.1 Write property test for move deduplication
  - **Property 12: Move Deduplication**
  - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Wire up BootstrapAPI to use new registration methods
  - Import ReplicaLifecycleManager in bootstrap-api.js
  - Create ReplicaLifecycleManager instance during bootstrap
  - Call registration methods after partition creation
  - _Requirements: 1.1, 4.1_

- [x] 9.1 Write property test for registered partition removal
  - **Property 2: Registered Partition Removal Succeeds**
  - **Validates: Requirements 1.3**

- [x] 10. Final checkpoint - Run full test suite
  - Run `npm test` to verify all tests pass
  - Verify no EventEmitter memory leak warnings
  - Ensure all property tests pass

## Additional Fixes (Post-Spec)

- [x] 11. Fix node_id undefined errors in UnifiedRebalancer
  - Add null checks when accessing `node_id` on replicas in multiple methods
  - Fixed methods: `calculateMoves`, `hasMultipleReplicasOnSameNode`, 
    `getNodesWithoutLocalReplica`, `isSuboptimalState`, `applyPolicy`, `affectsMyReplicas`
  - Prevents crashes when replicas have missing node_id fields

- [x] 12. Skip rebalancing when cache is unpopulated
  - Added check in `evaluateState()` to skip rebalancing when no nodes are known
  - Prevents newly joined nodes from making incorrect decisions before cache sync

- [x] 13. Fix duplicate REMOVE_REPLICA operations
  - Modified `handleRebalancerRemoveReplica` in PartitionService
  - When ACK returns `not_found`, call `completePendingMove` on rebalancer
  - Prevents repeated removal attempts for already-removed replicas

- [x] 14. Fix ACK extraction for deeper nesting levels
  - Update `extractAckFromResponse()` in PartitionService to handle 4+ levels of nesting
  - The response structure from WebSocket delivery has additional wrapper layers
  - Add check for `result.result?.result?.result?.request_id` (4 levels)
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 15. Pass cdcIntegrationService to joining node's ReplicaLifecycleManager
  - DECISION: Instead of passing cdcIntegrationService to joining node, have seed node
    handle all services table writes
  - Seed node inserts row with status 'starting' BEFORE sending CREATE_REPLICA
  - Seed node updates status to 'syncing' after receiving 'initiated' ACK
  - Seed node updates status to 'failed' if CREATE_REPLICA fails
  - This avoids complexity of routing writes from joining node to seed node's partitions
  - _Requirements: 10.4, 10.5, 10.6_

- [x] 16. Ensure joining node can write to services system table
  - DECISION: Joining node does NOT write to services table
  - All services table writes are handled by seed node (see task 15)
  - Modified handleRebalancerAddReplica to:
    - Insert services row BEFORE sending CREATE_REPLICA message
    - Update status to 'syncing' after successful ACK
    - Update status to 'failed' on error
  - _Requirements: 10.4, 10.5, 10.6_

- [x] 17. Checkpoint - Test cross-node replica creation end-to-end ✓
  - Start seed node, start joining node
  - Verify CREATE_REPLICA message is sent and ACK is received
  - Verify new replica appears in services system table
  - Verify admin CLI shows the new replica
  - Integration tests created: test/integration/cross-node-ack-delivery.integration.test.js
  - All 7615 tests pass

- [x] 18. Fix WebSocketTransport async handler support
  - Modified `handleServiceMessage` in WebSocketTransport to be async
  - Now properly awaits async handlers before sending ACK
  - Previously, async handlers returned Promise objects instead of resolved values
  - This caused ACK timeouts because the actual ACK data was lost
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 19. Add WebSocket integration test for CREATE_REPLICA ACK
  - Created `test/integration/websocket-create-replica-ack.integration.test.js`
  - Uses REAL WebSocket connections via MessageRouter (NOT InMemoryTransport)
  - Tests async handler returns resolved values, not Promise objects
  - Tests deeply nested ACK preservation through WebSocket
  - Tests timeout behavior when handler is slow
  - This test would have caught the async handler bug
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 20. Fix missing messageGroupTransport in BootstrapService partition factory
  - **ROOT CAUSE FOUND**: Seed node's `createPartitionService` factory in `bootstrap-service.js`
    was NOT passing `messageGroupTransport` to partition services
  - Node-joining-service correctly passed it, but bootstrap-service did not
  - This caused seed node partitions to fall back to legacy `messageGroupService.sendMessage()`
    path which doesn't properly return ACKs through the response chain
  - Fixed by adding `messageGroupTransport: this.messageGroupTransport` to the partition options
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 21. Fix slow bootstrap due to election timer delay
  - **ROOT CAUSE**: MessageGroupService always started election timer (150-300ms) even for
    self-hosted groups where all replicas are on the same node
  - `waitForMessageGroupLeadership()` would wait with exponential backoff before checking
  - Combined delays could cause 10+ second waits during bootstrap
  - **FIX 1**: Modified `MessageGroupService.initialize()` to call `becomeLeader()` immediately
    when `isSelfHostedGroup: true` or `replicaIds.length === 1`, skipping election timer
  - **FIX 2**: Modified `waitForMessageGroupLeadership()` to check immediately first (no delay)
    before entering the exponential backoff loop
  - Bootstrap should now complete in milliseconds instead of seconds

- [ ] 22. Investigate services-p1 CREATE_REPLICA timeout
  - **SYMPTOM**: nodes-p1, message_groups-p1, partitions-p1 ACKs succeed, but services-p1 times out
  - **INVESTIGATION**: Extensive code analysis found no obvious cause - all partitions use same path
  - **DIAGNOSTIC LOGGING ADDED**: Added timing and detailed logging to `handleRebalancerAddReplica`:
    - Log when starting replica addition with tableName
    - Log before/after services table insert with elapsed time
    - Log before sending CREATE_REPLICA with elapsed time
    - Log after deliverWithAck returns with elapsed time
    - Log errors with stack trace and elapsed time
  - **NEXT STEPS**: User should run with new logging to identify where the delay occurs
  - **POSSIBLE CAUSES TO INVESTIGATE**:
    1. Services table insert blocking when services-p1 writes to itself
    2. CDC event handling causing delays specific to services table
    3. Message routing issue specific to services-p1 partition
    4. Concurrency issue when multiple partitions insert into services table simultaneously

## Notes

- All tasks including property tests are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
