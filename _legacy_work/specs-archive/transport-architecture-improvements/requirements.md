# Requirements Document

## Introduction

This feature addresses six architectural gaps in the transport and Raft consensus layers of the distributed database system. The current design mixes transport concerns with consensus concerns, uses blocking ACK patterns, has fragile commit correlation, maintains dual write paths for single-replica vs multi-replica groups, has an unused RaftTransportAdapter that conflicts with the active PartitionRaftNode transport, and uses console.log in the RaftTransportAdapter. Four patterns are introduced to resolve these gaps: a separate Raft transport channel, immediate ACK with deferred response, a bounded proposal queue with backpressure, and a unified write path through Raft.

## Glossary

- **MessageRouter**: The unified message routing component that handles local and cross-node communication over WebSocket connections.
- **RouterOutboundQueue**: Per-node outbound delivery queue with configurable concurrency limits inside the MessageRouter.
- **RouterDeliveryManager**: Component responsible for message delivery including direct WebSocket delivery and TransportRegistry-based delivery.
- **RouterMessageHandler**: Component that processes incoming WebSocket messages and dispatches them to registered handlers.
- **PartitionRaftNode**: Custom LifeRaft subclass that integrates partition consensus with the MessageRouter transport.
- **RaftTransportAdapter**: An adapter bridging liferaft with MessageRouter that is currently unused and conflicts with PartitionRaftNode.
- **PartitionReplicationHandler**: Component managing write forwarding and replication for partitions, including proposeAndWaitForCommit.
- **PartitionService**: SQLite-backed Raft group service implementing table partitions with Raft consensus.
- **Raft_Packet**: A native liferaft protocol message with type values: vote, voted, append, appended, append fail, append ack.
- **Service_Message**: An application-level message routed through the MessageRouter using the SERVICE_MESSAGE type.
- **Outbound_Queue**: The per-node queue in RouterOutboundQueue that limits concurrent deliveries to a target node.
- **Proposal_Queue**: A bounded queue for pending Raft write proposals that provides backpressure when full.
- **Backpressure**: A flow control mechanism where the Proposal_Queue rejects new proposals when the queue reaches its configured capacity.
- **ACK**: An acknowledgment message sent by the receiver to confirm receipt of a Service_Message.
- **SERVICE_RESPONSE**: A new message type for delivering deferred handler results back to the original sender.
- **Head_Of_Line_Blocking**: A condition where a slow message handler blocks subsequent messages in the same Outbound_Queue slot.
- **Priority_Inversion**: A condition where low-priority application messages delay high-priority Raft_Packet delivery by competing for the same Outbound_Queue.
- **LoggingService**: The centralized logging service used throughout the system for structured logging.

## Requirements

### Requirement 1: Separate Raft Transport Channel

**User Story:** As a system operator, I want Raft consensus messages to bypass the outbound queue, so that Raft protocol communication is not delayed by application message traffic.

#### Acceptance Criteria

1. WHEN the RouterDeliveryManager delivers a message whose payload satisfies isRaftPacket(), THE RouterDeliveryManager SHALL send the message directly through the WebSocket connection without enqueuing it in the Outbound_Queue.
2. WHEN the RouterDeliveryManager delivers a message whose payload does not satisfy isRaftPacket(), THE RouterDeliveryManager SHALL enqueue the message in the Outbound_Queue as it does today.
3. WHILE the Outbound_Queue for a target node is full, THE RouterDeliveryManager SHALL still deliver Raft_Packet messages to that node without delay.
4. THE RouterDeliveryManager SHALL use the existing isRaftPacket() utility from raft-packet-utils.js to detect Raft packets.

### Requirement 2: Immediate ACK with Deferred Response

**User Story:** As a system operator, I want the message router to acknowledge receipt of messages immediately, so that outbound queue slots are released without waiting for handler completion.

#### Acceptance Criteria

1. WHEN the RouterMessageHandler receives a SERVICE_MESSAGE, THE RouterMessageHandler SHALL send an ACK to the sender immediately before invoking the registered handler.
2. WHEN the registered handler completes with a result, THE RouterMessageHandler SHALL send a SERVICE_RESPONSE message containing the handler result back to the source address, correlated by the original messageId.
3. WHEN the registered handler fails with an error, THE RouterMessageHandler SHALL send a SERVICE_RESPONSE message containing the error back to the source address, correlated by the original messageId.
4. WHEN the RouterDeliveryManager receives an ACK for a pending message, THE RouterDeliveryManager SHALL resolve the pending message promise immediately with the ACK.
5. WHEN the RouterDeliveryManager sends a message that expects a handler result, THE RouterDeliveryManager SHALL register a pending response callback and resolve it when the corresponding SERVICE_RESPONSE arrives.
6. IF a SERVICE_RESPONSE does not arrive within the configured timeout, THEN THE RouterDeliveryManager SHALL reject the pending response with a timeout error.

### Requirement 3: Bounded Proposal Queue with Backpressure

**User Story:** As a system operator, I want write proposals to be bounded by a configurable queue, so that the system applies backpressure under load instead of consuming unbounded memory.

#### Acceptance Criteria

1. THE Proposal_Queue SHALL have a configurable maximum capacity with a default value defined as a shared constant.
2. WHEN a write proposal is submitted and the Proposal_Queue has capacity, THE PartitionReplicationHandler SHALL enqueue the proposal and return a promise that resolves when the Raft commit completes.
3. WHEN a write proposal is submitted and the Proposal_Queue is at capacity, THE PartitionReplicationHandler SHALL reject the proposal immediately with a backpressure error.
4. WHEN a Raft commit event resolves a pending proposal, THE Proposal_Queue SHALL remove the resolved entry and make capacity available for new proposals.
5. WHEN a pending proposal times out, THE Proposal_Queue SHALL remove the timed-out entry and make capacity available for new proposals.
6. THE Proposal_Queue SHALL track the current queue depth and expose it through a status method for monitoring.

### Requirement 4: Unified Write Path Through Raft

**User Story:** As a developer, I want all write operations to follow a single code path through Raft commit, so that the system complies with the "one way" guideline and reduces branching logic.

#### Acceptance Criteria

1. WHEN the PartitionReplicationHandler receives a write for a single-replica group, THE PartitionReplicationHandler SHALL apply the write through the same applyCommittedEntry code path used by multi-replica groups.
2. WHEN the PartitionReplicationHandler receives a write for a multi-replica group, THE PartitionReplicationHandler SHALL propose the write through Raft consensus as it does today.
3. THE PartitionReplicationHandler SHALL remove the branch that checks isLiferaftLeader to decide between direct execution and Raft proposal.
4. WHEN a single-replica group processes a write, THE PartitionReplicationHandler SHALL append the entry to the Raft log and invoke applyCommittedEntry directly, simulating what Raft consensus would do.
5. THE PartitionService SHALL use executeWriteEntry as the single place where write SQL is executed, reached through applyCommittedEntry for both single-replica and multi-replica groups.

### Requirement 5: Remove Unused RaftTransportAdapter

**User Story:** As a developer, I want to remove the unused RaftTransportAdapter, so that there is only one way to send Raft packets and no conflicting transport code exists.

#### Acceptance Criteria

1. THE system SHALL remove the RaftTransportAdapter class and its source file (raft-transport-adapter.js).
2. THE system SHALL remove all import references to RaftTransportAdapter throughout the codebase.
3. THE system SHALL retain the PartitionRaftNode write() method and the RaftReplicaBase write() method as the sole mechanisms for sending Raft packets.
4. IF any code references RaftTransportAdapter after removal, THEN the build or lint step SHALL report an error.

### Requirement 6: Replace console.log in Raft Transport Constants

**User Story:** As a developer, I want all logging in the Raft transport layer to use the LoggingService, so that log output is consistent and configurable.

#### Acceptance Criteria

1. THE system SHALL remove all console.log calls from the Raft transport layer constants and any remaining references in raft-transport-adapter.js.
2. WHEN Raft transport log messages are defined as constants, THE constants SHALL be plain string templates suitable for use with LoggingService, not console.log invocations.
3. THE system SHALL ensure that after removing RaftTransportAdapter, no console.log calls remain in any file under src/raft/.
