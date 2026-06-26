# Implementation Plan: Transport Abstraction Layer

## Overview

This implementation plan breaks down the transport abstraction layer into discrete coding tasks. Each task builds on previous steps, with property-based tests placed close to implementation to catch errors early.

## Tasks

- [x] 1. Add constants and update system table configuration
  - [x] 1.1 Add transport constants to src/constants/
    - Add TRANSPORT_TYPE constants (ws, nats, veilid) to new transport-types.js
    - Add ENDPOINT_STATUS constants (active, inactive)
    - Add endpoint column constants to columns.js (endpoint_id, transport_type, priority, metadata)
    - Add NODE_ENDPOINTS to tables.js
    - _Requirements: 1.5, 6.3_

  - [x] 1.2 Update cache configuration for node_endpoints table
    - Add TABLES.NODE_ENDPOINTS to CACHE_SYSTEM_TABLES in cache-constants.js
    - Add primary key mapping for node_endpoints (endpoint_id) to CACHE_PRIMARY_KEY_FIELDS
    - Add to CACHE_HYDRATION_TABLES
    - _Requirements: 6.9_

- [x] 2. Implement TransportProvider interface and base class
  - [x] 2.1 Create TransportProvider base class
    - Create src/transport/transport-provider.js
    - Define interface methods: getType, isAvailable, connect, send, disconnect, getHealthStatus, shutdown
    - Add JSDoc documentation for each method
    - Export from src/transport/index.js
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Write property test for TransportProvider interface compliance
    - **Property 2: Transport Provider Interface Compliance**
    - Verify any provider implementing the interface has all required methods
    - **Validates: Requirements 2.1, 2.2**

- [x] 3. Implement TransportRegistry
  - [x] 3.1 Create TransportRegistry class
    - Create src/transport/transport-registry.js
    - Implement registerProvider, unregisterProvider, getProvider methods
    - Implement selectEndpoint that queries SystemTableCache for node_endpoints
    - Implement getEndpointsForNode method
    - Add logging using LoggingService
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x] 3.2 Write property test for registry provider management
    - **Property 3: Transport Registry Provider Management**
    - Test register/unregister sequences maintain correct state
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [x] 3.3 Write property test for endpoint priority selection
    - **Property 4: Endpoint Priority Selection**
    - Test that lowest priority endpoint with available provider is selected
    - **Validates: Requirements 3.5**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement ConnectionPool
  - [x] 5.1 Create ConnectionPool class
    - Create src/transport/connection-pool.js
    - Implement getConnection, releaseConnection, closeConnection methods
    - Implement TTL-based idle connection cleanup
    - Implement TTL reset on connection reuse
    - Add configurable TTL from ConfigurationManager
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7_

  - [x] 5.2 Write property test for connection TTL lifecycle
    - **Property 5: On-Demand Connection with TTL Lifecycle**
    - Test connection reuse, TTL expiration, and TTL reset
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.7**

- [x] 6. Refactor WebSocket into WebSocketTransportProvider
  - [x] 6.1 Create WebSocketTransportProvider class
    - Create src/transport/websocket-transport-provider.js
    - Implement TransportProvider interface
    - Refactor connection logic from existing websocket-transport.js
    - Maintain identification handshake, ping/pong, reconnection with backoff
    - Use existing WebSocket configuration from ConfigurationManager
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [x] 6.2 Write property test for WebSocket provider backward compatibility
    - **Property 9: WebSocket Provider Backward Compatibility**
    - Test that existing message patterns work with new provider
    - **Validates: Requirements 7.1, 7.3, 8.4**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update SystemTableCache for node_endpoints
  - [x] 8.1 Add endpoint query methods to SystemTableCache
    - Add getEndpointsForNode(nodeId) method
    - Add filterEndpointsByStatus method
    - Ensure endpoints are sorted by priority
    - _Requirements: 6.6_

  - [x] 8.2 Write property test for system cache endpoint query
    - **Property 8: System Cache Endpoint Query**
    - Test endpoint retrieval and priority sorting
    - **Validates: Requirements 6.6**

- [x] 9. Implement CDC integration for node_endpoints
  - [x] 9.1 Update CDC handlers for node_endpoints table
    - Add node_endpoints to CDC event routing
    - Ensure INSERT, UPDATE, DELETE generate CDC events
    - Update SystemTableCache on CDC events
    - _Requirements: 6.4, 6.5_

  - [x] 9.2 Write property test for CDC propagation
    - **Property 7: CDC Propagation for Endpoint Changes**
    - Test that CDC events update cache correctly
    - **Validates: Requirements 6.4, 6.5**

- [x] 10. Update bootstrap for node_endpoints table
  - [x] 10.1 Add node_endpoints table creation to seed node bootstrap
    - Add node_endpoints table to system table creation in BootstrapService
    - Include node_endpoints in bootstrap snapshots
    - _Requirements: 6.10, 8.1_

  - [x] 10.2 Write property test for bootstrap endpoint table
    - **Property 10: Bootstrap Endpoint Table Creation**
    - Test that bootstrap includes node_endpoints table
    - **Validates: Requirements 6.10, 8.1**

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Integrate transport abstraction into MessageRouter
  - [x] 12.1 Update MessageRouter to use TransportRegistry
    - Inject TransportRegistry and ConnectionPool into MessageRouter
    - Update deliver() to resolve endpoints via TransportRegistry
    - Implement fallback to next priority endpoint on failure
    - Return delivery status with transport used
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 12.2 Write property test for message delivery with fallback
    - **Property 6: Message Delivery with Transport Fallback**
    - Test fallback behavior and delivery status reporting
    - **Validates: Requirements 5.3, 5.4, 5.5**

- [x] 13. Update node registration to create endpoints
  - [x] 13.1 Update node registration to write endpoint
    - Modify node registration to write WebSocket endpoint to node_endpoints table
    - Use SQL_Engine for endpoint writes
    - Remove transport info from nodes table
    - _Requirements: 1.2, 8.2, 8.3_

  - [x] 13.2 Write property test for node identity separation
    - **Property 1: Node Identity Separation from Endpoints**
    - Test that node_id has no transport info, endpoints in separate table
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [x] 13.3 Write property test for node registration creates endpoint
    - **Property 11: Node Registration Creates Endpoint**
    - Test that registration creates endpoint in node_endpoints table
    - **Validates: Requirements 8.2**

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Wire components together and cleanup
  - [x] 15.1 Update module exports
    - Export TransportProvider, TransportRegistry, ConnectionPool, WebSocketTransportProvider from src/transport/index.js
    - Update any imports in dependent modules
    - _Requirements: 7.3, 8.4_

  - [x] 15.2 Remove deprecated code
    - Remove node_address field usage from nodes table queries
    - Remove any legacy address parsing code
    - Ensure single code path for endpoint resolution
    - _Requirements: 8.3, 8.5_

- [x] 16. Final integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (max 10 iterations per testing guidelines)
- Unit tests validate specific examples and edge cases
- All constants must be defined in src/constants/ files (no inline strings/numbers per code style guidelines)
