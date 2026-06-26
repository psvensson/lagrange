# Implementation Plan: Transport Architecture Improvements

## Overview

Implement four architectural patterns (separate Raft transport channel, immediate ACK with deferred response, bounded proposal queue, unified write path) and two cleanup items (remove RaftTransportAdapter, remove console.log) across the transport, Raft, and partition layers.

## Tasks

- [x] 1. Add SERVICE_RESPONSE message type and transport constants
  - [x] 1.1 Add SERVICE_RESPONSE to ROUTER_MESSAGE_TYPE in src/constants/transport.js
    - Add `SERVICE_RESPONSE: 'service_response'` to the frozen object
    - Add log messages for Raft direct delivery and SERVICE_RESPONSE handling to ROUTER_LOG_MSG
    - Add error messages for pending response timeout to ROUTER_ERROR_MSG
    - _Requirements: 2.2, 2.3_

  - [x] 1.2 Create proposal-queue-constants.js in src/partition/
    - Define PROPOSAL_QUEUE_DEFAULT with MAX_CAPACITY constant
    - Define PROPOSAL_QUEUE_ERROR_MSG with BACKPRESSURE message
    - Define PROPOSAL_QUEUE_LOG_MSG for enqueue/resolve/reject logging
    - _Requirements: 3.1_

- [x] 2. Implement separate Raft transport channel
  - [x] 2.1 Add deliverRaftDirect method to RouterDeliveryManager
    - Import isRaftPacket from raft-packet-utils.js
    - Add deliverRaftDirect method that sends via WebSocket directly without outbound queue
    - Modify deliverRemote to check isRaftPacket(payload) and route to deliverRaftDirect
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 2.2 Write property test for Raft packet delivery path (Property 1)
    - **Property 1: Raft packet delivery path determination**
    - Generate random Raft and non-Raft payloads, verify delivery path matches isRaftPacket result
    - **Validates: Requirements 1.1, 1.2**

- [x] 3. Implement immediate ACK with deferred response
  - [x] 3.1 Modify RouterMessageHandler.handleServiceMessage for immediate ACK
    - Send ACK immediately before invoking handler
    - Invoke handler asynchronously after ACK
    - Send SERVICE_RESPONSE with handler result or error, correlated by messageId
    - Add SERVICE_RESPONSE dispatch case in handleMessage
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Add pending response tracking to RouterDeliveryManager
    - Add pendingResponses Map to constructor
    - Add registerPendingResponse method with timeout
    - Add resolvePendingResponse method called when SERVICE_RESPONSE arrives
    - Wire SERVICE_RESPONSE handling from RouterMessageHandler to RouterDeliveryManager
    - Update sendMessage to resolve ACK immediately and optionally register pending response
    - Clean up pendingResponses on shutdown
    - _Requirements: 2.4, 2.5, 2.6_

  - [x] 3.3 Write property test for immediate ACK ordering (Property 2)
    - **Property 2: Immediate ACK before handler invocation**
    - Generate random SERVICE_MESSAGEs, verify ACK is sent before handler runs
    - **Validates: Requirements 2.1**

  - [x] 3.4 Write property test for SERVICE_RESPONSE correlation (Property 3)
    - **Property 3: SERVICE_RESPONSE correlation and completeness**
    - Generate random handler outcomes, verify SERVICE_RESPONSE has correct messageId and outcome
    - **Validates: Requirements 2.2, 2.3**

  - [x] 3.5 Write property test for pending response round-trip (Property 4)
    - **Property 4: Pending response round-trip**
    - Generate random messageIds and results, verify pending response resolves correctly
    - **Validates: Requirements 2.5**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement bounded proposal queue
  - [x] 5.1 Create ProposalQueue class in src/partition/proposal-queue.js
    - Implement constructor with configurable maxCapacity from proposal-queue-constants.js
    - Implement enqueue method that throws backpressure error when full
    - Implement resolve and reject methods that remove entries and free capacity
    - Implement clear method for shutdown/leadership loss
    - Implement getStats method returning size and maxCapacity
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 5.2 Integrate ProposalQueue into PartitionReplicationHandler
    - Replace raw pendingCommits Map with ProposalQueue instance
    - Update proposeAndWaitForCommit to use proposalQueue.enqueue
    - Update resolveCommit to use proposalQueue.resolve
    - Update rejectCommit to use proposalQueue.reject
    - Update clearPendingCommits to use proposalQueue.clear
    - Update getPendingCommitCount to use proposalQueue.size
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [x] 5.3 Write property test for proposal queue capacity enforcement (Property 5)
    - **Property 5: Proposal queue capacity enforcement**
    - Generate random sequences of proposals, verify accept/reject based on capacity
    - **Validates: Requirements 3.2, 3.3**

  - [x] 5.4 Write property test for proposal queue size invariant (Property 6)
    - **Property 6: Proposal queue size invariant**
    - Generate random enqueue/resolve/reject sequences, verify getStats().size matches expected
    - **Validates: Requirements 3.4, 3.5, 3.6**

- [x] 6. Implement unified write path through Raft
  - [x] 6.1 Unify applyWrite in PartitionReplicationHandler
    - Remove the isLiferaftLeader branch
    - Add isMultiReplica() method checking replicaIds.length > 1
    - For multi-replica: use proposeAndWaitForCommit (existing path through ProposalQueue)
    - For single-replica: append to Raft log, call applyCommittedEntry directly
    - Both paths converge at applyCommittedEntry → executeWriteEntry
    - Wire applyCommittedEntry callback from PartitionService into replication handler
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 6.2 Write property test for unified write path (Property 7)
    - **Property 7: Unified write path through applyCommittedEntry**
    - Generate random write entries, verify both single and multi-replica call executeWriteEntry through applyCommittedEntry
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.5**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Remove RaftTransportAdapter and clean up console.log
  - [x] 8.1 Delete RaftTransportAdapter and update imports
    - Delete src/raft/raft-transport-adapter.js
    - Remove RaftTransportAdapter export from src/raft/index.js
    - Remove RAFT_TRANSPORT_LOG_MSG and RAFT_TRANSPORT_ERROR_MSG from src/raft/constants.js
    - Delete test/raft/raft-transport-adapter.test.js
    - Delete test/raft/unified-address-format.property.test.js
    - Update test/raft/raft-packet-round-trip.property.test.js to test through PartitionRaftNode
    - Verify no remaining imports of RaftTransportAdapter in codebase
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 8.2 Remove console.log from Raft layer
    - Remove console.log calls from src/raft/constants.js (RAFT_TRANSPORT_LOG_MSG)
    - Verify no console.log remains in any file under src/raft/
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 8.3 Write unit tests verifying cleanup
    - Test that src/raft/raft-transport-adapter.js does not exist
    - Test that no file under src/raft/ contains console.log
    - _Requirements: 5.1, 6.3_

- [x] 9. Update architecture.md
  - [x] 9.1 Update architecture.md with transport architecture changes
    - Document the Raft direct delivery channel
    - Document the immediate ACK / deferred response pattern
    - Document the proposal queue with backpressure
    - Document the unified write path

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required including property tests and unit tests
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties with fast-check (numRuns: 10)
- Unit tests validate specific examples and edge cases
