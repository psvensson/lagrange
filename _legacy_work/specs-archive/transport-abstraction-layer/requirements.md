# Transport Abstraction Layer - Requirements

## Introduction

This document specifies the requirements for a transport abstraction layer that separates node identity from transport mechanisms. Currently, the system uses WebSocket connections directly with transport information embedded in node addresses. This feature enables support for multiple transport protocols (WebSocket, NATS, Veilid, etc.) without changing calling code, while maintaining on-demand connection management and graceful fallback capabilities.

## Glossary

- **Node_Identity**: A UUID that uniquely identifies a node, independent of any transport mechanism
- **Transport_Endpoint**: A specific address for reaching a node via a particular transport (e.g., ws://host:port, nats://server/topic)
- **Transport_Provider**: An implementation of the transport interface for a specific protocol (WebSocket, NATS, Veilid)
- **Transport_Registry**: Central registry that manages available transport providers and selects the best one for delivery
- **Message_Router**: The component that routes messages to target nodes, now using the transport abstraction
- **System_Cache**: In-memory cache of system tables including node endpoints, updated by CDC events (the ONLY cache of system information)
- **Connection_Pool**: Cache of active connections with TTL-based lifecycle management
- **Endpoint_Priority**: Numeric ordering that determines which endpoint to try first when multiple are available
- **CDC**: Change Data Capture - mechanism for streaming changes from table partitions to all nodes
- **SQL_Engine**: The built-in SQL engine used for all system information access

## Architecture Principles

From the system guidelines:

1. **All information in the system must be stored as tables** - Transport endpoints are system information and must be stored in system tables
2. **System cache is the single source of truth** - The system cache (fed by CDC) is the ONLY cache of system information
3. **CDC keeps cache updated** - Changes to endpoint tables propagate via CDC to all nodes
4. **All communication goes through message router** - No direct partition access for endpoint lookups
5. **SQL engine for all system access** - Accessing system information must use the built-in SQL engine
6. **No fallback code paths** - Single code path for transport selection; no legacy mechanisms

## Requirements

### Requirement 1: Separate Node Identity from Transport Endpoints

**User Story:** As a system architect, I want node identity to be separate from transport information, so that nodes can be reached via multiple transports without changing their identity.

#### Acceptance Criteria

1. THE Node_Identity SHALL be a UUID with no transport information embedded
2. WHEN a node registers THEN the `nodes` system table SHALL store only identity information (node_id, status, metadata)
3. THE system SHALL store Transport_Endpoints in a separate `node_endpoints` system table
4. EACH node MAY have multiple Transport_Endpoints stored in the `node_endpoints` table
5. EACH Transport_Endpoint record SHALL include:
   - endpoint_id: Unique identifier for the endpoint
   - node_id: Foreign key reference to the nodes table
   - transport_type: Type of transport (ws, nats, veilid)
   - address: Transport-specific address string
   - priority: Numeric priority (lower = higher preference)
   - metadata: JSON object for transport-specific configuration
   - status: Current endpoint status (active, inactive)
6. WHEN endpoints change for a node THEN the Node_Identity in the `nodes` table SHALL remain unchanged
7. THE address format used by callers SHALL remain transport-agnostic: {nodeId}/{entityType}/{entityId}

### Requirement 2: Transport Provider Interface

**User Story:** As a developer, I want a common interface for all transport providers, so that new transports can be added without modifying existing code.

#### Acceptance Criteria

1. THE Transport_Provider interface SHALL define methods for:
   - connect(endpoint): Establish connection to an endpoint
   - send(connection, message): Send a message through a connection
   - disconnect(connection): Close a connection
   - isAvailable(): Check if the transport is currently available
   - getHealthStatus(connection): Check connection health
2. EACH Transport_Provider SHALL implement the common interface
3. WHEN a Transport_Provider encounters an error THEN it SHALL report the error through a standardized error format
4. THE Transport_Provider SHALL emit events for connection state changes
5. WHEN a Transport_Provider is not available THEN isAvailable() SHALL return false

### Requirement 3: Transport Registry

**User Story:** As the message router, I want a central registry of transport providers, so that I can select the best transport for each delivery.

#### Acceptance Criteria

1. THE Transport_Registry SHALL maintain a map of transport type to Transport_Provider
2. WHEN a Transport_Provider is registered THEN it SHALL be available for message delivery
3. WHEN a Transport_Provider is unregistered THEN it SHALL no longer be used for new connections
4. THE Transport_Registry SHALL support dynamic registration and unregistration of providers
5. WHEN selecting a transport for a node THEN the Transport_Registry SHALL:
   - Query the System_Cache for the node's endpoints from the `node_endpoints` table
   - Filter endpoints to those with available providers
   - Select the highest priority endpoint with an available provider
6. IF no transport is available for a node THEN the Transport_Registry SHALL return an error
7. THE Transport_Registry SHALL NOT maintain its own cache of endpoints (use System_Cache only)

### Requirement 4: On-Demand Connection Management

**User Story:** As a system operator, I want connections to be established only when needed, so that resources are not wasted on idle connections.

#### Acceptance Criteria

1. WHEN a message needs to be delivered to a node THEN the system SHALL check for an existing connection first
2. IF no connection exists THEN the system SHALL establish a connection on-demand
3. THE Connection_Pool SHALL cache active connections with configurable TTL
4. WHEN a connection is idle beyond the TTL THEN it SHALL be closed automatically
5. WHEN a connection fails THEN the system SHALL attempt reconnection with backoff
6. THE system SHALL NOT maintain proactive mesh connections to all nodes
7. WHEN a connection is reused THEN the TTL timer SHALL be reset

### Requirement 5: Message Router Integration

**User Story:** As a service developer, I want to specify only the target nodeId when sending messages, so that transport selection is handled automatically.

#### Acceptance Criteria

1. WHEN delivering a message THEN the caller SHALL specify only the target address (nodeId/entityType/entityId)
2. THE Message_Router SHALL resolve the nodeId to endpoints by querying the System_Cache for `node_endpoints` records
3. THE Message_Router SHALL select the best available transport via the Transport_Registry
4. IF the primary transport fails THEN the Message_Router SHALL attempt fallback to the next priority endpoint
5. THE Message_Router SHALL return delivery status including which transport was used
6. WHEN all transports fail THEN the Message_Router SHALL return an error with details of all attempts
7. THE Message_Router SHALL NOT maintain its own cache of node endpoints (use System_Cache only)
8. WHEN the System_Cache does not have endpoint information for a node THEN the Message_Router SHALL return an error

### Requirement 6: Endpoint Storage in System Tables

**User Story:** As a system administrator, I want node endpoints stored in system tables, so that endpoint changes propagate via CDC to all nodes.

#### Acceptance Criteria

1. THE system SHALL create a new `node_endpoints` system table for storing transport endpoints
2. THE `node_endpoints` table SHALL be implemented as a partition (Raft group) like all other system tables
3. THE `node_endpoints` table schema SHALL include:
   - endpoint_id (PRIMARY KEY): Unique identifier for the endpoint
   - node_id: Reference to the node in the `nodes` table
   - transport_type: Type of transport (ws, nats, veilid)
   - address: Transport-specific address string
   - priority: Numeric priority (lower = higher preference, default 0)
   - metadata: JSON object for transport-specific configuration
   - status: Current endpoint status (active, inactive)
   - created_at: Timestamp of endpoint creation
   - updated_at: Timestamp of last update
4. WHEN an endpoint is added, modified, or deleted THEN a CDC event SHALL be generated
5. WHEN a CDC event for `node_endpoints` is received THEN the System_Cache SHALL be updated
6. THE System_Cache SHALL provide methods to query endpoints by node_id
7. ALL reads of endpoint information SHALL first check the System_Cache
8. ALL writes to endpoint information SHALL go through the SQL_Engine to the partition leader
9. THE `node_endpoints` table SHALL be added to the CACHE_SYSTEM_TABLES constant
10. THE `node_endpoints` table SHALL be included in bootstrap snapshots for joining nodes

### Requirement 7: WebSocket Transport Provider

**User Story:** As a developer, I want the existing WebSocket functionality refactored into a transport provider, so that it works within the new abstraction.

#### Acceptance Criteria

1. THE WebSocketTransportProvider SHALL implement the Transport_Provider interface
2. THE WebSocketTransportProvider SHALL support all existing WebSocket functionality:
   - Connection establishment with identification handshake
   - Message sending with acknowledgment
   - Ping/pong health checks
   - Reconnection with exponential backoff
3. WHEN migrating to the new architecture THEN existing callers SHALL NOT require changes
4. THE WebSocketTransportProvider SHALL use the existing WebSocket configuration from ConfigurationManager
5. THE WebSocketTransportProvider SHALL emit standard transport events

### Requirement 8: Migration Strategy

**User Story:** As a system operator, I want a clear migration path, so that the system transitions cleanly to the new transport abstraction.

#### Acceptance Criteria

1. WHEN the seed node bootstraps THEN it SHALL create the `node_endpoints` system table as part of system table initialization
2. WHEN a node registers THEN it SHALL write its WebSocket endpoint to the `node_endpoints` table via the SQL_Engine
3. THE existing `node_address` field in the `nodes` table SHALL be removed after migration (no dual storage)
4. THE existing message delivery API SHALL remain unchanged (callers still use nodeId/entityType/entityId)
5. THERE SHALL be only one code path for endpoint resolution (via System_Cache from `node_endpoints` table)
6. THE migration SHALL be atomic - no mixed-mode operation where some nodes use old addressing and others use new

