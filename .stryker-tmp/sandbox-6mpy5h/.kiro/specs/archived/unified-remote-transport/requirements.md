# Requirements Document: Unified Remote Transport

## Introduction

This specification defines a simplified transport architecture where all inter-service communication uses WebSocket, including communication between services on the same node. By treating all services as remote, the system eliminates special-case handling for local delivery, resulting in a single code path that is easier to understand, test, and debug.

The system is optimized for clusters of 100+ nodes where replicas of any service are typically distributed across different nodes. The rare case of multiple replicas on the same node does not warrant special optimization.

## Glossary

- **MessageRouter**: The unified transport component that routes all messages via WebSocket connections
- **Unified_Address**: Address format `${nodeId}/${entityType}/${entityId}` that uniquely identifies any service in the cluster
- **Self_Connection**: A WebSocket connection from a node to itself (loopback) enabling uniform message routing
- **Node**: A physical or virtual machine running the distributed database software
- **Service**: Any addressable entity (message group replica, partition replica, lifecycle manager)

## Requirements

### Requirement 1: Unified Address Format

**User Story:** As a developer, I want a consistent address format for all services, so that I can easily understand and route messages to any entity in the cluster.

#### Acceptance Criteria

1. THE Unified_Address SHALL follow the format `${nodeId}/${entityType}/${entityId}`
2. WHEN parsing a Unified_Address, THE MessageRouter SHALL extract the nodeId as the first path segment
3. THE entityType SHALL be one of: `message-group`, `partition`, `lifecycle`, or `service`
4. FOR ALL services in the cluster, THE Unified_Address SHALL uniquely identify exactly one service

### Requirement 2: Self-Connection (Loopback)

**User Story:** As a system operator, I want each node to connect to itself via WebSocket, so that local and remote message delivery use the same code path.

#### Acceptance Criteria

1. WHEN a node starts, THE MessageRouter SHALL establish a WebSocket connection to itself (loopback)
2. THE Self_Connection SHALL be established before any services are created
3. WHEN the Self_Connection fails, THE MessageRouter SHALL retry with exponential backoff
4. THE Self_Connection SHALL be treated identically to connections to other nodes

### Requirement 3: All Messages Via WebSocket

**User Story:** As a developer, I want all messages to flow through WebSocket connections, so that there is only one code path to understand and debug.

#### Acceptance Criteria

1. THE MessageRouter SHALL NOT maintain a local handlers map for direct local delivery
2. WHEN delivering a message, THE MessageRouter SHALL always use a WebSocket connection
3. FOR ALL messages (local or remote), THE MessageRouter SHALL use the same serialization and delivery logic
4. THE MessageRouter SHALL NOT have separate `deliverLocal` and `deliverRemote` methods

### Requirement 4: Remove MessageGroupTransport

**User Story:** As a developer, I want to eliminate the MessageGroupTransport layer, so that there is only one transport component to understand.

#### Acceptance Criteria

1. THE System SHALL NOT use MessageGroupTransport for any communication
2. ALL services SHALL register directly with MessageRouter
3. THE MessageRouter SHALL be the only transport component in the system
4. WHEN MessageGroupTransport is removed, ALL existing functionality SHALL continue to work

### Requirement 5: Service Registration

**User Story:** As a service developer, I want to register my service with a single transport, so that I don't have to manage multiple registration points.

#### Acceptance Criteria

1. WHEN a service starts, IT SHALL register with MessageRouter using its Unified_Address
2. THE MessageRouter SHALL store registrations and route incoming messages to the correct handler
3. WHEN a message arrives for a registered address, THE MessageRouter SHALL invoke the handler
4. WHEN a service shuts down, IT SHALL unregister from MessageRouter

### Requirement 6: Connection Management

**User Story:** As a system operator, I want reliable connection management between nodes, so that messages are delivered even after transient failures.

#### Acceptance Criteria

1. WHEN a connection to a node is lost, THE MessageRouter SHALL attempt reconnection with exponential backoff
2. WHEN a message is sent to a disconnected node, THE MessageRouter SHALL return an error immediately
3. THE MessageRouter SHALL maintain a map of nodeId to WebSocket connection
4. WHEN a new node joins the cluster, THE MessageRouter SHALL establish a connection to it

### Requirement 7: Message Delivery Semantics

**User Story:** As a developer, I want clear message delivery semantics, so that I know how to handle success and failure cases.

#### Acceptance Criteria

1. WHEN a message is delivered successfully, THE MessageRouter SHALL return an acknowledgment with the handler's response
2. WHEN a message cannot be delivered (no connection), THE MessageRouter SHALL return an error
3. WHEN a message times out, THE MessageRouter SHALL return a timeout error
4. THE MessageRouter SHALL NOT silently drop messages or fall back to alternative delivery methods

### Requirement 8: Bootstrap Sequence

**User Story:** As a system operator, I want a clear bootstrap sequence, so that the node starts correctly with all connections established.

#### Acceptance Criteria

1. WHEN bootstrapping, THE Node SHALL start the WebSocket server first
2. AFTER the WebSocket server starts, THE Node SHALL establish the Self_Connection
3. AFTER the Self_Connection is established, THE Node SHALL create services
4. IF the Self_Connection fails during bootstrap, THE Node SHALL fail the bootstrap process

### Requirement 9: Address Resolution

**User Story:** As a developer, I want simple address resolution, so that routing decisions are straightforward.

#### Acceptance Criteria

1. WHEN routing a message, THE MessageRouter SHALL extract nodeId from the first segment of the address
2. THE MessageRouter SHALL NOT require external resolvers or lookup services for basic routing
3. WHEN the target nodeId matches the local nodeId, THE MessageRouter SHALL use the Self_Connection
4. THE address parsing logic SHALL be a simple string split operation

### Requirement 10: No Legacy Support

**User Story:** As a developer, I want a clean architecture without legacy code paths, so that the system is simple and maintainable.

#### Acceptance Criteria

1. THE System SHALL NOT support old address formats
2. THE System SHALL NOT support InMemoryTransport or MessageGroupTransport
3. ALL services SHALL use Unified_Address format exclusively
4. THE migration SHALL update all services simultaneously to the new architecture
