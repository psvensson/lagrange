# Requirements Document

## Introduction

This feature removes all in-memory transport references from the message group service to enforce that message groups exclusively use WebSocket-based transport for inter-replica communication. If WebSocket transport is not available, the system should fail hard with a clear error rather than silently falling back to in-memory transport.

The goal is to ensure production reliability by eliminating any code paths that could mask transport failures or create inconsistent behavior between development and production environments.

## Glossary

- **Message_Group_Service**: The service responsible for reliable inter-service communication using Raft consensus across replicas.
- **In_Memory_Transport**: A local message passing mechanism designed for single-node testing scenarios.
- **WebSocket_Transport**: The production transport mechanism for cross-node communication via WebSocket connections.
- **Message_Router**: The unified routing component that handles both local and remote message delivery via WebSocket.
- **Message_Group_Transport**: A transport layer that routes messages through message groups, using MessageRouter for actual delivery.
- **Bootstrap_Service**: The service that initializes the seed node and creates initial message groups and partitions.
- **Node_Joining_Service**: The service that handles new nodes joining an existing cluster.

## Requirements

### Requirement 1: Remove In-Memory Transport from Message Group Service

**User Story:** As a system operator, I want message groups to exclusively use WebSocket transport, so that transport failures are immediately visible and the system behaves consistently across all environments.

#### Acceptance Criteria

1. WHEN the Message_Group_Service is instantiated without a transport THEN the Message_Group_Service SHALL throw an error indicating that transport is required
2. WHEN the Message_Group_Service is instantiated with a transport that is not WebSocket-based THEN the Message_Group_Service SHALL throw an error indicating that only WebSocket transport is supported
3. THE Message_Group_Service SHALL NOT contain any fallback logic that emits events for local handling when transport is unavailable
4. THE Message_Group_Service SHALL NOT import or reference the In_Memory_Transport module

### Requirement 2: Update Bootstrap Service Transport Usage

**User Story:** As a developer, I want the bootstrap service to use WebSocket-based transport for message groups, so that the bootstrap process uses the same transport as production.

#### Acceptance Criteria

1. WHEN the Bootstrap_Service creates message group replicas THEN the Bootstrap_Service SHALL provide a WebSocket-based transport (MessageGroupTransport or MessageRouter)
2. THE Bootstrap_Service SHALL NOT create or use In_Memory_Transport for message group communication
3. WHEN the Bootstrap_Service initializes infrastructure THEN the Bootstrap_Service SHALL initialize the MessageRouter before creating message groups
4. IF the MessageRouter fails to initialize THEN the Bootstrap_Service SHALL fail the bootstrap process with a clear error

### Requirement 3: Update Node Joining Service Transport Usage

**User Story:** As a developer, I want the node joining service to use WebSocket-based transport for message groups, so that joining nodes use the same transport as the seed node.

#### Acceptance Criteria

1. WHEN the Node_Joining_Service creates message group replicas THEN the Node_Joining_Service SHALL provide a WebSocket-based transport
2. THE Node_Joining_Service SHALL NOT create or use In_Memory_Transport for message group communication
3. IF WebSocket transport is not available during node join THEN the Node_Joining_Service SHALL fail with a clear error

### Requirement 4: Hard Failure on Transport Unavailability

**User Story:** As a system operator, I want the system to fail immediately when WebSocket transport is unavailable, so that I can quickly identify and resolve transport issues.

#### Acceptance Criteria

1. WHEN the Message_Group_Service attempts to deliver a message and transport is null THEN the Message_Group_Service SHALL throw an error with message "WebSocket transport required but not available"
2. WHEN the Message_Group_Service attempts to request votes and transport is null THEN the Message_Group_Service SHALL throw an error with message "WebSocket transport required for Raft consensus"
3. THE Message_Group_Service SHALL NOT silently skip message delivery when transport is unavailable
4. THE Message_Group_Service SHALL log an error-level message before throwing transport unavailability errors

### Requirement 5: Update Tests to Use WebSocket Transport

**User Story:** As a developer, I want tests to use the same transport as production code, so that tests accurately reflect production behavior.

#### Acceptance Criteria

1. WHEN tests create Message_Group_Service instances THEN the tests SHALL provide a mock or real WebSocket-based transport
2. THE test suite SHALL NOT use In_Memory_Transport for message group service tests
3. WHEN tests need to simulate transport failures THEN the tests SHALL use mock WebSocket transport that throws errors rather than In_Memory_Transport

### Requirement 6: Preserve In-Memory Transport for Non-Message-Group Uses

**User Story:** As a developer, I want to keep In_Memory_Transport available for partition services and other components that legitimately need local message passing, so that we don't break existing functionality.

#### Acceptance Criteria

1. THE In_Memory_Transport module SHALL remain available in the transport package
2. THE Partition_Service MAY continue to use In_Memory_Transport for local Raft consensus during bootstrap
3. THE In_Memory_Transport SHALL NOT be used by Message_Group_Service or any code path that creates message groups
