# Transport Abstraction Layer - Design

## Overview

This design document describes the architecture for a transport abstraction layer that separates node identity from transport mechanisms. The system will support multiple transport protocols (WebSocket, NATS, Veilid) through a common interface, with transport endpoints stored in a new `node_endpoints` system table and propagated via CDC to all nodes.

The design follows the system guidelines:
- All transport endpoint information stored in the `node_endpoints` system table
- System cache is the ONLY cache for endpoint information (fed by CDC)
- SQL engine used for all endpoint reads/writes
- Single code path for transport selection (no fallback mechanisms)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Node                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Message Router                               │    │
│  │              (Callers specify nodeId/entityType/entityId)            │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      Transport Registry                              │    │
│  │         (Selects best transport based on endpoint priority)          │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                            │
│           ┌─────────────────────┼─────────────────────┐                     │
│           ▼                     ▼                     ▼                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   WebSocket     │  │     NATS        │  │    Veilid       │             │
│  │   Provider      │  │   Provider      │  │   Provider      │             │
│  │                 │  │   (future)      │  │   (future)      │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Connection Pool                                  │    │
│  │              (TTL-based connection lifecycle)                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    System Table Cache                                │    │
│  │         (node_endpoints table - updated by CDC only)                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### TransportProvider Interface

The common interface that all transport implementations must follow.

```javascript
/**
 * TransportProvider - Interface for transport implementations.
 * All transport providers (WebSocket, NATS, Veilid) implement this interface.
 */
class TransportProvider {
  /**
   * Get the transport type identifier.
   * @return {string} Transport type (e.g., 'ws', 'nats', 'veilid')
   */
  getType() {}

  /**
   * Check if this transport is currently available.
   * @return {boolean} True if transport can accept connections
   */
  isAvailable() {}

  /**
   * Connect to a remote endpoint.
   * @param {Object} endpoint - Endpoint record from node_endpoints table
   * @param {string} endpoint.address - Transport-specific address
   * @param {Object} endpoint.metadata - Transport-specific configuration
   * @return {Promise<Connection>} Connection object
   */
  async connect(endpoint) {}

  /**
   * Send a message through an established connection.
   * @param {Connection} connection - Active connection
   * @param {Object} message - Message to send
   * @return {Promise<Object>} Delivery result with acknowledgment
   */
  async send(connection, message) {}

  /**
   * Close a connection.
   * @param {Connection} connection - Connection to close
   * @return {Promise<void>}
   */
  async disconnect(connection) {}

  /**
   * Get health status of a connection.
   * @param {Connection} connection - Connection to check
   * @return {Object} Health status with latency, state, lastActivity
   */
  getHealthStatus(connection) {}

  /**
   * Shutdown the transport provider.
   * @return {Promise<void>}
   */
  async shutdown() {}
}
```

### TransportRegistry

Central registry for managing transport providers and selecting the best transport for delivery.

```javascript
/**
 * TransportRegistry - Manages transport providers and selects best transport.
 * Does NOT cache endpoint information - always queries SystemTableCache.
 */
class TransportRegistry {
  constructor(systemTableCache) {}

  /**
   * Register a transport provider.
   * @param {TransportProvider} provider - Provider to register
   */
  registerProvider(provider) {}

  /**
   * Unregister a transport provider.
   * @param {string} transportType - Type to unregister
   */
  unregisterProvider(transportType) {}

  /**
   * Get provider for a transport type.
   * @param {string} transportType - Transport type
   * @return {TransportProvider|null} Provider or null if not registered
   */
  getProvider(transportType) {}

  /**
   * Select best endpoint for a node based on priority and availability.
   * Queries SystemTableCache for node_endpoints records.
   * @param {string} nodeId - Target node ID
   * @return {Object|null} Best endpoint or null if none available
   */
  selectEndpoint(nodeId) {}

  /**
   * Get all available endpoints for a node.
   * @param {string} nodeId - Target node ID
   * @return {Array<Object>} Endpoints sorted by priority
   */
  getEndpointsForNode(nodeId) {}
}
```

### ConnectionPool

Manages active connections with TTL-based lifecycle.

```javascript
/**
 * ConnectionPool - Manages active connections with TTL lifecycle.
 * Connections are cached here (not endpoint information).
 */
class ConnectionPool {
  constructor(options) {}

  /**
   * Get or create a connection to a node via specific endpoint.
   * @param {string} nodeId - Target node ID
   * @param {Object} endpoint - Endpoint to connect to
   * @param {TransportProvider} provider - Provider to use
   * @return {Promise<Connection>} Active connection
   */
  async getConnection(nodeId, endpoint, provider) {}

  /**
   * Release a connection (reset TTL timer).
   * @param {string} nodeId - Node ID
   */
  releaseConnection(nodeId) {}

  /**
   * Close a specific connection.
   * @param {string} nodeId - Node ID
   */
  async closeConnection(nodeId) {}

  /**
   * Close all idle connections that exceeded TTL.
   */
  async closeIdleConnections() {}

  /**
   * Shutdown all connections.
   * @return {Promise<void>}
   */
  async shutdown() {}
}
```

### WebSocketTransportProvider

Refactored WebSocket implementation as a transport provider.

```javascript
/**
 * WebSocketTransportProvider - WebSocket implementation of TransportProvider.
 * Refactors existing WebSocket functionality into the new abstraction.
 */
class WebSocketTransportProvider extends TransportProvider {
  constructor(options) {}

  getType() { return TRANSPORT_TYPE.WEBSOCKET; }

  isAvailable() {}

  async connect(endpoint) {}

  async send(connection, message) {}

  async disconnect(connection) {}

  getHealthStatus(connection) {}

  async shutdown() {}
}
```



## Data Models

### node_endpoints Table Schema

```sql
CREATE TABLE node_endpoints (
  endpoint_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  transport_type TEXT NOT NULL,
  address TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  metadata TEXT,
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Endpoint Record Structure

```javascript
{
  endpoint_id: 'ep-uuid-1234',           // Unique endpoint identifier
  node_id: 'node-uuid-5678',             // Reference to nodes table
  transport_type: 'ws',                   // Transport type: ws, nats, veilid
  address: 'ws://192.168.1.10:8080',     // Transport-specific address
  priority: 0,                            // Lower = higher preference
  metadata: '{"tls": true}',             // JSON transport-specific config
  status: 'active',                       // active, inactive
  created_at: 1699000000000,             // Unix timestamp ms
  updated_at: 1699000000000              // Unix timestamp ms
}
```

### Connection Object Structure

```javascript
{
  connectionId: 'conn-uuid-1234',        // Unique connection identifier
  nodeId: 'node-uuid-5678',              // Target node ID
  endpointId: 'ep-uuid-1234',            // Endpoint used for connection
  transportType: 'ws',                    // Transport type
  state: 'connected',                     // connected, connecting, disconnected
  createdAt: 1699000000000,              // Connection creation time
  lastActivity: 1699000000000,           // Last message sent/received
  ttlExpiresAt: 1699000300000            // When connection will be closed if idle
}
```

### Transport Type Constants

```javascript
const TRANSPORT_TYPE = Object.freeze({
  WEBSOCKET: 'ws',
  NATS: 'nats',
  VEILID: 'veilid',
});

const ENDPOINT_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});
```

### New Constants Required

Add to `src/constants/tables.js`:
```javascript
NODE_ENDPOINTS: 'node_endpoints',
```

Add to `src/constants/columns.js`:
```javascript
ENDPOINT_ID: 'endpoint_id',
TRANSPORT_TYPE: 'transport_type',
PRIORITY: 'priority',
METADATA: 'metadata',
```

Add to `src/cache/cache-constants.js`:
```javascript
// Add to CACHE_SYSTEM_TABLES array
TABLES.NODE_ENDPOINTS,

// Add to CACHE_PRIMARY_KEY_FIELDS
[TABLES.NODE_ENDPOINTS]: COLUMN.ENDPOINT_ID,
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Node Identity Separation from Endpoints

*For any* node registration, the node_id stored in the `nodes` table SHALL be a UUID containing no transport-specific patterns (ws://, nats://, etc.), and all transport addresses SHALL be stored only in the `node_endpoints` table.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Transport Provider Interface Compliance

*For any* registered TransportProvider, it SHALL implement all required interface methods (getType, isAvailable, connect, send, disconnect, getHealthStatus, shutdown) and each method SHALL return the expected type.

**Validates: Requirements 2.1, 2.2**

### Property 3: Transport Registry Provider Management

*For any* sequence of register and unregister operations on the TransportRegistry, a provider SHALL be retrievable by type if and only if it was registered and not subsequently unregistered.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 4: Endpoint Priority Selection

*For any* node with multiple endpoints in the `node_endpoints` table, the TransportRegistry.selectEndpoint() SHALL return the endpoint with the lowest priority value among those with available providers.

**Validates: Requirements 3.5**

### Property 5: On-Demand Connection with TTL Lifecycle

*For any* message delivery to a node, if a connection exists and is healthy it SHALL be reused, otherwise a new connection SHALL be established. *For any* connection that is idle beyond the configured TTL, it SHALL be closed. *For any* connection that is reused, its TTL timer SHALL be reset.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.7**

### Property 6: Message Delivery with Transport Fallback

*For any* message delivery where the primary transport fails, the Message_Router SHALL attempt delivery via the next priority endpoint. The delivery result SHALL include which transport was used or details of all failed attempts.

**Validates: Requirements 5.3, 5.4, 5.5**

### Property 7: CDC Propagation for Endpoint Changes

*For any* INSERT, UPDATE, or DELETE operation on the `node_endpoints` table, a CDC event SHALL be generated, and when that CDC event is applied to the SystemTableCache, the cache SHALL reflect the change.

**Validates: Requirements 6.4, 6.5**

### Property 8: System Cache Endpoint Query

*For any* node_id, the SystemTableCache SHALL provide a method to retrieve all endpoints for that node from the `node_endpoints` table, sorted by priority.

**Validates: Requirements 6.6**

### Property 9: WebSocket Provider Backward Compatibility

*For any* message delivery that previously worked with the old WebSocket implementation, the same delivery SHALL succeed with the WebSocketTransportProvider without requiring caller changes.

**Validates: Requirements 7.1, 7.3, 8.4**

### Property 10: Bootstrap Endpoint Table Creation

*For any* seed node bootstrap, the `node_endpoints` system table SHALL be created and included in bootstrap snapshots sent to joining nodes.

**Validates: Requirements 6.10, 8.1**

### Property 11: Node Registration Creates Endpoint

*For any* node registration, the node SHALL write at least one endpoint (WebSocket) to the `node_endpoints` table via the SQL_Engine.

**Validates: Requirements 8.2**

## Error Handling

### Transport Provider Errors

All transport providers SHALL report errors through a standardized format:

```javascript
{
  code: 'TRANSPORT_ERROR_CODE',      // Standardized error code
  message: 'Human readable message', // Error description
  transportType: 'ws',               // Transport that failed
  endpoint: { ... },                 // Endpoint that was attempted
  cause: Error                       // Original error if available
}
```

Error codes:
- `CONNECTION_FAILED`: Unable to establish connection
- `CONNECTION_TIMEOUT`: Connection attempt timed out
- `SEND_FAILED`: Message send failed
- `CONNECTION_CLOSED`: Connection was closed unexpectedly
- `PROVIDER_UNAVAILABLE`: Transport provider is not available

### Message Router Error Handling

When all transports fail, the Message_Router SHALL return:

```javascript
{
  success: false,
  error: 'ALL_TRANSPORTS_FAILED',
  attempts: [
    { endpoint: {...}, error: {...} },
    { endpoint: {...}, error: {...} }
  ]
}
```

### Error Logging

Per system guidelines:
- Errors MUST NOT be swallowed
- Errors MUST be either re-thrown or clearly logged
- No try/catch for conditionals or communication flow

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests:

- **Unit tests**: Specific examples, edge cases, integration points
- **Property tests**: Universal properties across generated inputs

### Property-Based Testing Configuration

- Use fast-check library for property-based testing
- Maximum 10 iterations per property test (per testing guidelines)
- Each test tagged with: **Feature: transport-abstraction-layer, Property N: {property_text}**

### Unit Test Focus Areas

1. TransportProvider interface compliance for WebSocketTransportProvider
2. TransportRegistry registration/unregistration edge cases
3. ConnectionPool TTL expiration timing
4. CDC event generation and cache update integration
5. Bootstrap snapshot inclusion of node_endpoints table

### Property Test Focus Areas

1. Node identity separation (Property 1)
2. Provider management round-trip (Property 3)
3. Priority selection ordering (Property 4)
4. TTL lifecycle behavior (Property 5)
5. CDC propagation round-trip (Property 7)
6. Backward compatibility (Property 9)

### Test File Organization

```
test/transport/
├── transport-provider.test.js           # Interface compliance tests
├── transport-registry.test.js           # Registry unit tests
├── transport-registry.property.test.js  # Registry property tests
├── connection-pool.test.js              # Pool unit tests
├── connection-pool.property.test.js     # Pool TTL property tests
├── websocket-provider.test.js           # WebSocket provider tests
├── message-router-transport.test.js     # Router integration tests
└── endpoint-cdc.property.test.js        # CDC propagation tests
```

