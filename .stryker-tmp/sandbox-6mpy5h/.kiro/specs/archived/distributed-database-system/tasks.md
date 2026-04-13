# Implementation Plan: Distributed Database System

## Overview

This implementation plan breaks down the distributed database system into incremental tasks that build upon each other. The system follows a layered approach: infrastructure setup, core services, communication layer, data layer, and finally integration. Each task references specific requirements and includes property-based tests where applicable.

## Tasks

- [x] 1. Project Setup and Core Infrastructure
  - [x] 1.1 Initialize project structure with ES6 modules
    - Create package.json with type: "module"
    - Configure ESLint with Google JavaScript style guide
    - Set up tap test framework with fast-check for property-based testing
    - Install core dependencies: better-sqlite3, raft-logic, pino, fastify, ws, uuid, piscina
    - _Requirements: 11.1, 11.2, 11.3, 12.5_

  - [x] 1.2 Implement central configuration system
    - Create ConfigurationManager class with symbolic names for all constants
    - Define configuration categories: node, raft, message-group, partition, logging
    - Implement configuration validation using ajv
    - Support environment variable overrides
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 1.3 Write property test for configuration centralization
    - **Property 13: Configuration Centralization**
    - **Validates: Requirements 10.1, 10.2, 10.3**

  - [x] 1.4 Implement HLC (Hybrid Logical Clock) service
    - Create HLCTimestamp class with physical, logical, and nodeId components
    - Implement now() for generating timestamps
    - Implement update() for receiving remote timestamps
    - Handle clock drift detection and logging
    - _Requirements: 23.7, 23.8_

  - [x] 1.5 Implement structured logging with pino
    - Create LoggingService with configurable log levels
    - Implement log buffering for bootstrap phase
    - Include structured metadata (node_id, service_id, timestamp, trace_id)
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 28.1, 28.2, 28.3, 28.4, 28.5_

  - [x] 1.6 Write property test for structured logging consistency
    - **Property 19: Structured Logging Consistency**
    - **Validates: Requirements 16.1, 16.4**

- [x] 2. Checkpoint - Verify infrastructure setup
  - Ensure all tests pass, ask the user if questions arise.


- [x] 3. Address and Identity Management
  - [x] 3.1 Implement unique address generation
    - Create AddressManager class for node and service addresses
    - Use UUID v4 for unique identifiers
    - Implement address validation and conflict detection
    - _Requirements: 1.5, 2.1, 7.1_

  - [x] 3.2 Write property test for address uniqueness
    - **Property 1: Address Uniqueness**
    - **Validates: Requirements 1.5, 2.1**

- [x] 4. Threading Architecture and Service Management
  - [x] 4.1 Implement ServiceThreadManager with piscina
    - Create worker thread pool for service isolation
    - Implement message passing between main thread and workers
    - Handle worker lifecycle management
    - _Requirements: 2.3, 2.4_

  - [x] 4.2 Implement NodeService base class
    - Create NodeService for administrative operations
    - Implement startService(), stopService(), getNodeStats()
    - Handle service routing and health monitoring
    - _Requirements: 1.3, 2.3_

  - [x] 4.3 Write property test for Node Service presence
    - **Property 2: Node Service Presence**
    - **Validates: Requirements 1.3**

- [x] 5. System Table Cache Infrastructure
  - [x] 5.1 Implement SystemTableCache class
    - Create in-memory cache for system tables (nodes, partitions, tables, services, message_groups, indices)
    - Implement get(), find(), filter(), getAll(), has() query methods
    - Implement applySystemTableChange() for CDC updates (INSERT, UPDATE, DELETE)
    - _Requirements: 4.4, 4.5, 4.8_

  - [x] 5.2 Implement ReadOnlySystemTableCache wrapper
    - Create wrapper exposing only query methods
    - Enforce read-only access at runtime
    - Log violations when write methods are attempted
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 5.3 Write property test for System Table Cache in Message Group Replicas
    - **Property 21: System Table Cache in Message Group Replicas**
    - **Validates: Requirements 4.4, 4.5, 4.8**

- [x] 6. Checkpoint - Verify core services
  - Ensure all tests pass, ask the user if questions arise.


- [x] 7. Message Group Service Implementation
  - [x] 7.1 Implement MessageGroupService class
    - Create 3-replica Raft group with in-memory storage using raft-logic
    - Implement sendMessage(), receiveMessage(), acknowledgeMessage()
    - Implement simultaneous delivery and persistence pattern
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.2 Implement CDC subscription and cache updates
    - Subscribe to system table CDC events
    - Apply CDC events to System_Table_Cache
    - Maintain cache consistency across replicas
    - _Requirements: 4.4, 4.7, 5.3, 5.4_

  - [x] 7.3 Implement querySystemCache() API for local services
    - Expose API for local services to query system information
    - Route queries to any local message group replica
    - _Requirements: 4.5, 4.8_

  - [x] 7.4 Write property test for message delivery reliability
    - **Property 9: Message Delivery Reliability**
    - **Validates: Requirements 4.2**

  - [x] 7.5 Write property test for message group replica distribution
    - **Property 8: Message Group Replica Distribution**
    - **Validates: Requirements 4.3, 7.6, 7.7, 8.6**

- [x] 8. Message Transport Layer
  - [x] 8.1 Implement InMemoryTransport for single-node bootstrap
    - Create transport for local message passing during initial bootstrap ONLY
    - Support Raft consensus messages between local replicas during bootstrap
    - NOTE: InMemoryTransport is NOT used after bootstrap completes
    - _Requirements: 4.1, 4.21_

  - [x] 8.2 Implement WebSocketTransport for inter-node communication
    - Create WebSocket-based transport using ws library
    - Handle connection management and reconnection
    - Support single WebSocket connection per node pair
    - _Requirements: 9.1, 4.16_

  - [x] 8.3 Implement MessageGroupTransport for partition Raft
    - Create transport that routes all messages through message groups
    - Ensure location transparency for partition replicas
    - _Requirements: 4.6, 4.9, 4.10, 4.13, 4.14_

  - [x] 8.4 Write property test for location transparent communication
    - **Property 20: Location Transparent Communication**
    - **Validates: Requirements 4.6, 4.7, 9.2, 9.3, 9.4**

- [x] 9. Checkpoint - Verify message group infrastructure
  - Ensure all tests pass, ask the user if questions arise.


- [x] 10. Partition Service Implementation
  - [x] 10.1 Implement PartitionService class
    - Create SQLite-backed Raft group using better-sqlite3 and raft-logic
    - Implement executeQuery(), insertData(), updateData(), deleteData()
    - Use MessageGroupTransport for all Raft communication
    - _Requirements: 3.2, 3.3, 3.4_

  - [x] 10.2 Implement partition key range management
    - Create initial partition with range [NULL, NULL)
    - Implement key range validation and integrity checks
    - Support contiguous, non-overlapping ranges
    - _Requirements: 20.3, 20.5, 20.9_

  - [x] 10.3 Implement CDC event generation
    - Generate CDC events for all data modifications
    - Deliver events to subscribed message groups
    - _Requirements: 3.5, 4.4_

  - [x] 10.4 Implement partition size tracking
    - Calculate size using SQLite page_count and page_size pragmas
    - Update size_bytes asynchronously after writes (debounced)
    - Periodic background updates every 60 seconds
    - _Requirements: 31.1, 31.3, 31.5, 31.6_

  - [x] 10.5 Write property test for table partition structure
    - **Property 4: Table Partition Structure**
    - **Validates: Requirements 3.2, 3.3**

  - [x] 10.6 Write property test for default replica count
    - **Property 5: Default Replica Count**
    - **Validates: Requirements 3.4**

  - [x] 10.7 Write property test for CDC generation
    - **Property 6: Change Data Capture Generation**
    - **Validates: Requirements 3.5, 4.4**

  - [x] 10.8 Write property test for contiguous non-overlapping ranges
    - **Property 40: Contiguous Non-Overlapping Ranges**
    - **Validates: Requirements 20.5**

- [x] 11. Checkpoint - Verify partition service
  - Ensure all tests pass, ask the user if questions arise.


- [x] 12. System Tables Bootstrap
  - [x] 12.1 Define hard-coded system table schemas
    - Define schemas for: tables, partitions, indices, message_groups, nodes, services, logs, config
    - Include all required columns (size_bytes, leader_node_id, raft_role, etc.)
    - Pre-assign initial partition and replica IDs
    - _Requirements: 6.1, 6.2, 6.5, 14.6, 14.7, 31.3, 31.4_

  - [x] 12.2 Implement bootstrap initialization phases
    - Phase 1: Infrastructure setup
    - Phase 2: Message group creation (3 replicas on seed node)
    - Phase 3: Partition creation for system tables
    - Phase 4: Service registration
    - _Requirements: 6.3, 6.4, 6.7, 6.8, 6.9_

  - [x] 12.3 Implement message group leadership verification
    - Wait for leadership establishment before partition creation
    - Implement exponential backoff up to 30 seconds
    - Fail bootstrap with clear error if leadership not established
    - _Requirements: 6.12, 6.13, 6.14_

  - [x] 12.4 Implement bootstrap failure handling
    - Clean up partially initialized services on failure
    - Exit with non-zero exit code
    - Log clear error messages with context
    - _Requirements: 6.16, 29.3, 29.7, 29.10_

  - [x] 12.5 Write property test for universal partition implementation
    - **Property 32: Universal Partition Implementation**
    - **Validates: Requirements 3.2**

  - [x] 12.6 Write property test for odd replica count invariant
    - **Property 33: Odd Replica Count Invariant**
    - **Validates: Requirements 19.1, 19.5**

- [x] 13. Checkpoint - Verify bootstrap process
  - Ensure all tests pass, ask the user if questions arise.


- [x] 14. Node Bootstrap and Discovery
  - [x] 14.1 Implement seed node REST API with fastify
    - Create /bootstrap endpoint for new node registration
    - Validate node ID and address for conflicts
    - Determine message group assignment strategy
    - _Requirements: 1.2, 7.2, 7.3, 7.4_

  - [x] 14.2 Implement message group assignment strategies
    - Strategy 1: Move replica from node with 2+ replicas
    - Strategy 2: Create self-hosted message group (3 replicas on new node)
    - Return assignment instructions in bootstrap response
    - _Requirements: 7.5, 7.6, 7.9_

  - [x] 14.3 Implement new node joining process
    - Contact seed node via HTTP (bootstrap exception)
    - Create or join assigned message group
    - Wait for leadership establishment
    - Query system partitions for cluster state
    - _Requirements: 7.8, 7.10, 7.11, 7.14_

  - [x] 14.4 Write property test for node bootstrap consistency
    - **Property 11: Node Bootstrap Consistency**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [x] 15. CDC Integration Service
  - [x] 15.1 Implement CDCIntegrationService
    - Create insertSystemTableRow(), updateSystemTableRow(), deleteSystemTableRow() methods
    - Route all system table writes through actual partitions
    - Ensure cache updates only via CDC events
    - _Requirements: 5.6, 5.7, 5.8, 5.9, 5.10_

  - [x] 15.2 Integrate CDC with node lifecycle
    - Write node entries to nodes table via CDC
    - Update heartbeats via CDC
    - Mark failed nodes via CDC
    - _Requirements: 5.6, 5.7, 5.8_

- [x] 16. Checkpoint - Verify node discovery
  - Ensure all tests pass, ask the user if questions arise.


- [x] 17. Unified Rebalancer Implementation
  - [x] 17.1 Implement UnifiedRebalancer class
    - Single rebalancer for both partitions and message groups
    - Calculate optimal replica placement using policies
    - Consider node CPU, memory, and disk statistics
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 17.2 Implement policy-driven rebalancing
    - Support Table_Policy for partitions
    - Support Message_Group_Policy for message groups
    - Grow/shrink replica counts in odd increments (3→5→7)
    - _Requirements: 8.4, 8.5, 8.10_

  - [x] 17.3 Implement rebalancing triggers
    - Periodic checks with jitter for non-critical events
    - Immediate checks for critical events (replica below minimum, node failure)
    - Leader-based autonomous decisions
    - _Requirements: 8.8, 8.9, 8.11, 8.12, 8.13_

  - [x] 17.4 Implement replica state management
    - Exclude failed/inactive replicas from current count
    - Generate add/remove moves based on policy
    - Create replacement replicas on healthy nodes
    - _Requirements: 8.14, 8.15, 8.16, 8.17, 8.18, 8.19_

  - [x] 17.5 Write property test for unified rebalancer behavior
    - **Property 12: Unified Rebalancer Behavior**
    - **Validates: Requirements 8.1, 8.7, 8.8**

  - [x] 17.6 Write property test for replica placement policy compliance
    - **Property 3: Replica Placement Policy Compliance**
    - **Validates: Requirements 2.2, 2.5, 8.1, 8.2**

  - [x] 17.7 Write property test for autonomous placement decisions
    - **Property 34: Autonomous Placement Decisions**
    - **Validates: Requirements 19.2, 19.3**

  - [x] 17.8 Write property test for rebalancing scheduling
    - **Property 23: Rebalancing Scheduling**
    - **Validates: Requirements 8.10**

- [x] 18. Checkpoint - Verify rebalancer
  - Ensure all tests pass, ask the user if questions arise.


- [x] 19. Partition Split and Merge Operations
  - [x] 19.1 Implement partition split logic
    - Calculate median PRIMARY KEY value as split point
    - Create two adjacent partitions from one
    - Validate range integrity after split
    - _Requirements: 3.6, 20.4, 20.9, 31.7, 31.14_

  - [x] 19.2 Implement partition merge logic
    - Merge only adjacent partitions (end key = start key)
    - Combine key ranges into single partition
    - Validate range integrity after merge
    - _Requirements: 3.7, 20.8, 31.8, 31.15_

  - [x] 19.3 Implement split/merge criteria evaluation
    - Evaluate split: storage ≥ 10GB OR traffic ≥ 1000 qpm
    - Evaluate merge: combined storage ≤ 2GB AND traffic ≤ 200 qpm
    - Periodic evaluation every 5 minutes
    - _Requirements: 3.8, 3.9, 3.10, 3.11, 31.9, 31.10, 31.12, 31.13_

  - [x] 19.4 Write property test for partition splitting trigger
    - **Property 7: Partition Splitting Trigger**
    - **Validates: Requirements 3.6**

  - [x] 19.5 Write property test for median split point
    - **Property 39: Median Split Point**
    - **Validates: Requirements 20.4**

  - [x] 19.6 Write property test for adjacent partition merging
    - **Property 43: Adjacent Partition Merging**
    - **Validates: Requirements 20.8**

  - [x] 19.7 Write property test for range integrity validation
    - **Property 44: Range Integrity Validation**
    - **Validates: Requirements 20.9**

- [x] 20. Checkpoint - Verify split/merge operations
  - Ensure all tests pass, ask the user if questions arise.


- [x] 21. SQL Query Processing
  - [x] 21.1 Implement SQL parser for simplified dialect
    - Support SELECT, INSERT, UPDATE, DELETE statements
    - Support WHERE, ORDER BY, GROUP BY, LIMIT clauses
    - Support JOIN operations
    - _Requirements: 6.1, 6.3_

  - [x] 21.2 Implement partition resolution
    - Route queries with PRIMARY KEY filters to specific partitions
    - Route queries without filters to all partitions (scatter-gather)
    - _Requirements: 20.6, 20.7_

  - [x] 21.3 Implement parallel query execution
    - Execute queries on all relevant partitions in parallel
    - Aggregate results from multiple partitions
    - Preserve SQL semantics for ORDER BY, GROUP BY, LIMIT
    - _Requirements: 6.2, 6.4, 22.1, 22.6_

  - [x] 21.4 Implement write operation routing
    - Route INSERT to partition based on PRIMARY KEY
    - Route UPDATE/DELETE to affected partitions
    - Replicate via Raft before acknowledgment
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 21.5 Write property test for SQL query distribution
    - **Property 10: SQL Query Distribution**
    - **Validates: Requirements 6.1, 6.2, 6.4, 6.5**

  - [x] 21.6 Write property test for query routing by key range
    - **Property 41: Query Routing by Key Range**
    - **Validates: Requirements 20.6**

  - [x] 21.7 Write property test for scatter-gather for non-key queries
    - **Property 42: Scatter-Gather for Non-Key Queries**
    - **Validates: Requirements 20.7**

  - [x] 21.8 Write property test for write operation durability
    - **Property 18: Write Operation Durability**
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4**

- [x] 22. Checkpoint - Verify SQL processing
  - All 237 tests pass across query module (sql-parser, partition-resolver, query-executor, sql-query-engine, property-based tests)


- [x] 23. Transaction Support
  - [x] 23.1 Implement single-partition transactions
    - Support BEGIN TRANSACTION, COMMIT, ROLLBACK
    - Provide READ COMMITTED isolation using SQLite
    - Ensure durability through Raft replication
    - _Requirements: 21.1, 21.2, 21.4, 21.5, 21.6_

  - [x] 23.2 Implement cross-partition transaction rejection
    - Detect multi-partition write attempts
    - Return clear error message
    - _Requirements: 21.3_

  - [x] 23.3 Implement concurrent transaction handling
    - Use SQLite locking mechanisms
    - Handle transaction conflicts
    - _Requirements: 21.7_

  - [x] 23.4 Write property test for single-partition ACID guarantees
    - **Property 46: Single-Partition ACID Guarantees**
    - **Validates: Requirements 21.1**

  - [x] 23.5 Write property test for cross-partition transaction rejection
    - **Property 47: Cross-Partition Transaction Rejection**
    - **Validates: Requirements 21.3**

  - [x] 23.6 Write property test for transaction durability via Raft
    - **Property 48: Transaction Durability via Raft**
    - **Validates: Requirements 21.6**

- [x] 24. Distributed Read-Only Queries
  - [x] 24.1 Implement cross-partition SELECT execution
    - Query all relevant partitions in parallel
    - Support JOIN operations across partitions
    - _Requirements: 22.1, 22.2_

  - [x] 24.2 Implement result aggregation
    - Aggregate results into single result set
    - Support COUNT, SUM, AVG, MIN, MAX across partitions
    - _Requirements: 22.3, 22.7_

  - [x] 24.3 Implement read load distribution
    - Route read-only queries to any available replica
    - Ensure reads don't block writes
    - _Requirements: 22.4, 22.5_

  - [x] 24.4 Write property test for distributed query parallelism
    - **Property 49: Distributed Query Parallelism**
    - **Validates: Requirements 22.1**

  - [x] 24.5 Write property test for cross-partition JOIN support
    - **Property 50: Cross-Partition JOIN Support**
    - **Validates: Requirements 22.2, 22.3**

  - [x] 24.6 Write property test for aggregate function correctness
    - **Property 53: Aggregate Function Correctness**
    - **Validates: Requirements 22.7**

- [x] 25. Checkpoint - Verify transactions and queries
  - Ensure all tests pass, ask the user if questions arise.


- [x] 26. Message Retry and Failure Handling
  - [x] 26.1 Implement exponential backoff retry
    - Retry failed deliveries with configurable backoff
    - Support initial delay, multiplier, max delay, jitter
    - Limit to configurable maximum retries (default 3)
    - _Requirements: 17.1, 17.4_

  - [x] 26.2 Implement alternative replica selection
    - Try alternative replicas on delivery failure
    - Return error with diagnostics when max retries exceeded
    - _Requirements: 17.2, 17.3_

  - [x] 26.3 Implement metadata cache with TTL
    - Cache metadata with configurable TTL (default 30 seconds)
    - Query system partitions on cache miss
    - Refresh on multiple consecutive failures
    - _Requirements: 17.5, 17.6, 17.7_

  - [x] 26.4 Write property test for retry with exponential backoff
    - **Property 24: Retry with Exponential Backoff**
    - **Validates: Requirements 17.1, 17.2**

  - [x] 26.5 Write property test for maximum retry limiting
    - **Property 25: Maximum Retry Limiting**
    - **Validates: Requirements 17.3**

  - [x] 26.6 Write property test for cache TTL expiration
    - **Property 27: Cache TTL Expiration**
    - **Validates: Requirements 17.6**

  - [x] 26.7 Write property test for query-on-miss behavior
    - **Property 28: Query-on-Miss Behavior**
    - **Validates: Requirements 17.5, 17.7**

- [x] 27. Fault Tolerance and Recovery
  - [x] 27.1 Implement failure detection
    - Detect node failures via heartbeat timeout
    - Mark affected replicas as unavailable
    - _Requirements: 14.1_

  - [x] 27.2 Implement replica recovery
    - Create replacement replicas on healthy nodes
    - Maintain minimum replica counts
    - _Requirements: 14.2_

  - [x] 27.3 Implement node reintegration
    - Reintegrate recovered nodes
    - Trigger rebalancing after recovery
    - _Requirements: 14.4_

  - [x] 27.4 Write property test for fault recovery behavior
    - **Property 17: Fault Recovery Behavior**
    - **Validates: Requirements 14.1, 14.2**

- [x] 28. Checkpoint - Verify fault tolerance
  - Ensure all tests pass, ask the user if questions arise.


- [x] 29. Index Management
  - [x] 29.1 Implement index creation
    - Support creating indices on table columns
    - Store index metadata in indices system table
    - _Requirements: 12.1, 12.2_

  - [x] 29.2 Implement automatic index maintenance
    - Update indices on data changes
    - Distribute index data across same partitions as base table
    - _Requirements: 12.3, 12.5_

  - [x] 29.3 Implement index-based query optimization
    - Use indices for query optimization
    - _Requirements: 12.4_

  - [x] 29.4 Write property test for index maintenance consistency
    - **Property 15: Index Maintenance Consistency**
    - **Validates: Requirements 12.2, 12.3, 12.5**
    - **Status: PASSED** - All 5 property tests pass

- [x] 30. Table Policy Management
  - [x] 30.1 Implement table policy storage
    - Store policies in tables system table
    - Support split/merge thresholds and replication factors
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 30.2 Implement automatic policy application
    - Apply policies during partition operations
    - _Requirements: 13.5_

  - [x] 30.3 Implement Raft role tracking
    - Store raft_role in services system table
    - Update on Raft state changes
    - Propagate via CDC
    - _Requirements: 14.6, 14.7, 14.8_

  - [x] 30.4 Write property test for table policy application
    - **Property 16: Table Policy Application**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5**

  - [x] 30.5 Write property test for policy-driven automatic adjustment
    - **Property 35: Policy-Driven Automatic Adjustment**
    - **Validates: Requirements 19.4**

- [x] 31. Checkpoint - Verify index and policy management
  - Ensure all tests pass, ask the user if questions arise.


- [x] 32. Performance and Scalability
  - [x] 32.1 Implement parallel query coordinator
    - Execute partition queries in parallel
    - Enforce resource limits (max partitions, max memory)
    - Implement query timeout mechanisms
    - _Requirements: 25.1, 25.2, 25.3, 25.8, 25.12_

  - [x] 32.2 Implement straggler detection and mitigation
    - Detect slow partitions (> 2× median latency)
    - Log warnings for operator attention
    - Implement speculative execution on alternative replicas
    - _Requirements: 25.7, 25.10, 25.11_

  - [x] 32.3 Implement streaming aggregation
    - Stream results to reduce memory footprint
    - External merge sort for ordered results
    - _Requirements: 25.9_

  - [x] 32.4 Write property test for parallel query execution
    - **Property 70: Parallel Query Execution**
    - **Validates: Requirements 25.1**

  - [x] 32.5 Write property test for coordinator resource limits
    - **Property 71: Coordinator Resource Limits**
    - **Validates: Requirements 25.2, 25.3, 25.8**

  - [x] 32.6 Write property test for straggler detection
    - **Property 73: Straggler Detection**
    - **Validates: Requirements 25.10**

  - [x] 32.7 Write property test for streaming aggregation
    - **Property 75: Streaming Aggregation**
    - **Validates: Requirements 25.9**

- [x] 33. Checkpoint - Verify performance features
  - Ensure all tests pass, ask the user if questions arise.


- [x] 34. Observability and Monitoring
  - [x] 34.1 Implement logs system table
    - Create logs table with structured data
    - Flush buffered logs after bootstrap
    - _Requirements: 27.1, 27.3_

  - [x] 34.2 Implement SQL interface for log queries
    - Support filtering, aggregation, time-range queries
    - Enable Grafana integration via SQL
    - _Requirements: 27.6, 27.7_

  - [x] 34.3 Implement log retention policies
    - Use table policies for automatic log cleanup
    - _Requirements: 27.8_

  - [x] 34.4 Implement bootstrap state tracking
    - Log phase transitions at INFO level
    - Log Raft state changes at DEBUG level
    - Include relevant identifiers in log context
    - _Requirements: 28.1, 28.2, 28.5, 28.6, 28.8, 28.9_

- [x] 35. Dynamic Configuration Management
  - [x] 35.1 Implement config system table
    - Store configuration key-value pairs
    - Support string, number, boolean, JSON types
    - _Requirements: 29.1, 29.3_

  - [x] 35.2 Implement configuration seeding
    - Seed from environment variables on startup
    - Provide default values for all keys
    - _Requirements: 29.2, 29.9_

  - [x] 35.3 Implement configuration watchers
    - Notify components on config changes
    - Support hot reload for non-restart configs
    - Mark restart-required configs
    - _Requirements: 29.5, 29.6, 29.7_

  - [x] 35.4 Implement configuration validation and auditing
    - Validate values before applying
    - Record who made changes and when
    - _Requirements: 29.8, 29.10_

- [x] 36. Checkpoint - Verify observability and config
  - Ensure all tests pass, ask the user if questions arise.


- [x] 37. Admin WebSocket API
  - [x] 37.1 Implement WebSocket endpoint
    - Create /api/admin/stream endpoint using fastify-websocket
    - Support multiple concurrent CLI connections
    - Clean up resources on disconnect
    - _Requirements: 32.1, 32.12, 32.13_

  - [x] 37.2 Implement cache dump on connection
    - Send full System_Table_Cache dump within 5 seconds
    - Include all six system tables as arrays
    - _Requirements: 32.2, 32.3, 32.4, 32.5_

  - [x] 37.3 Implement CDC event broadcasting
    - Send CDC events for insert/update/delete operations
    - Include table name, operation, record data, timestamp
    - Broadcast to all connected clients
    - _Requirements: 32.6, 32.7, 32.8, 32.9, 32.10, 32.11_

  - [x] 37.4 Implement query execution via WebSocket
    - Handle query messages with queryId and SQL
    - Execute queries within 30 second timeout
    - Return results with count, affected partitions
    - _Requirements: 32.14, 32.15, 32.16, 32.17, 32.18, 32.19, 32.20_

  - [x] 37.5 Implement query result formatting
    - Format SELECT results with results array and count
    - Format write results with operation and affectedRows
    - Include partitions and tableName fields
    - _Requirements: 32.21, 32.22, 32.23, 32.24, 32.25, 32.26_

  - [x] 37.6 Implement error handling
    - Return error codes: SYNTAX_ERROR, TABLE_NOT_FOUND, TIMEOUT, INTERNAL_ERROR
    - Include human-readable messages and hints
    - _Requirements: 32.27, 32.28, 32.29, 32.30, 32.31, 32.32, 32.33_

  - [x] 37.7 Implement message protocol
    - JSON-encode all messages with type field
    - Support incoming: query, refresh
    - Support outgoing: cache_dump, cdc_event, query_result
    - Ignore unknown message types, reject malformed JSON
    - _Requirements: 32.34, 32.35, 32.36, 32.37, 32.38, 32.39_

- [x] 38. Checkpoint - Verify admin WebSocket API
  - Ensure all tests pass, ask the user if questions arise.


- [x] 39. Live Queries
  - [x] 39.1 Implement LiveQueryService core
    - Parse LIVE SELECT statements
    - Extract partition key from WHERE clause
    - Compile predicates into evaluation functions
    - _Requirements: 33.1, 33.4, 33.16_

  - [x] 39.2 Implement partition-aware CDC subscriptions
    - Calculate affected partitions from WHERE clause
    - Subscribe only to relevant partitions
    - Handle queries without partition key filter (all partitions)
    - _Requirements: 33.4, 33.5_

  - [x] 39.3 Implement partition split/merge handling
    - Subscribe to partition topology CDC events
    - Recalculate subscriptions on split/merge
    - Update subscriptions without losing events
    - _Requirements: 33.6_

  - [x] 39.4 Implement query grouping
    - Group clients with identical queries
    - Share CDC subscriptions across group
    - Evaluate predicate once, fan-out to all clients
    - _Requirements: 33.7, 33.8_

  - [x] 39.5 Implement lease-based lifecycle
    - Assign TTL to live query subscriptions
    - Handle renewal requests with cursor
    - Clean up expired subscriptions
    - _Requirements: 33.9, 33.10, 33.11, 33.12_

  - [x] 39.6 Implement cursor-based resumption
    - Track last seen HLC per client
    - Validate cursor within retention window
    - Replay events from cursor position
    - _Requirements: 33.13, 33.14_

  - [x] 39.7 Implement WebSocket close detection
    - Detect client disconnection
    - Immediate cleanup on close
    - Hybrid approach with lease expiry
    - _Requirements: 33.15_

  - [x] 39.8 Implement change evaluation logic
    - Evaluate INSERT/UPDATE/DELETE against predicate
    - Handle UPDATE entering/exiting predicate
    - Send appropriate event types to clients
    - _Requirements: 33.2, 33.3, 33.17_

  - [x] 39.9 Implement live_queries system table
    - Create schema for monitoring
    - Track query metadata and client counts
    - Log creation, renewal, expiration events
    - _Requirements: 33.18, 33.20_

  - [x] 39.10 Implement live query limits
    - Enforce max concurrent queries per client
    - Return error when limit exceeded
    - _Requirements: 33.19_

  - [x] 39.11 Write property test for partition-aware subscription
    - **Property 32: Partition-Aware Live Query Subscription**
    - *For any* live query with partition key in WHERE clause, the system subscribes only to partitions whose key range contains the partition key value
    - **Validates: Requirements 33.4, 33.5**

  - [x] 39.12 Write property test for query grouping efficiency
    - **Property 33: Query Grouping Efficiency**
    - *For any* set of clients with identical queries, the system maintains exactly one CDC subscription per affected partition regardless of client count
    - **Validates: Requirements 33.7, 33.8**

  - [x] 39.13 Write property test for lease expiry cleanup
    - **Property 34: Lease Expiry Cleanup**
    - *For any* live query subscription, if the client does not renew within TTL, the subscription is cleaned up and removed from query groups
    - **Validates: Requirements 33.11, 33.12**

  - [x] 39.14 Write property test for change evaluation correctness
    - **Property 35: Live Query Change Evaluation**
    - *For any* CDC event and predicate, INSERT events matching predicate produce insert notifications, DELETE events matching predicate produce delete notifications, and UPDATE events produce correct enter/exit/update notifications based on old and new row predicate evaluation
    - **Validates: Requirements 33.3, 33.17**

- [x] 40. Checkpoint - Verify live queries
  - Ensure all tests pass, ask the user if questions arise.


- [x] 41. Function Extensibility Framework
  - [x] 41.1 Implement contexts system table
    - Create contexts table schema
    - Support context types: function, service, user
    - Propagate via CDC to message group caches
    - _Requirements: 34.1, 34.2, 34.3_

  - [x] 41.2 Implement code system table schema
    - Create code table schema (reserved for future)
    - Include function_id, function_name, version, executor_type, code_blob, signature, permissions
    - Do NOT implement executor logic
    - _Requirements: 34.4, 34.5, 34.18_

  - [x] 41.3 Implement ContextManager
    - getContext for reading context by type and name
    - setContext for creating/updating via CDC
    - deleteContext for removing contexts
    - getContextsByOwner for listing owner's contexts
    - _Requirements: 34.1, 34.3, 34.17_

  - [x] 41.4 Implement QueryExecutor API
    - executeQuery for direct query execution
    - executeQueryWithCallback for streaming results
    - executeQueryThenInvoke for continuation-passing
    - _Requirements: 34.6, 34.7, 34.8, 34.9_

  - [x] 41.5 Implement FunctionRegistry
    - registerExecutor for plugin registration
    - unregisterExecutor for cleanup
    - invoke for function execution delegation
    - invokeByName convenience method
    - Return error when no executor registered
    - _Requirements: 34.10, 34.11, 34.12, 34.13_

  - [x] 41.6 Implement CDCSubscriptionManager
    - subscribe for callback-based subscriptions
    - subscribeWithInvoke for function-triggered subscriptions
    - unsubscribe for cleanup
    - Build on Live Query CDC infrastructure
    - _Requirements: 34.14, 34.15_

  - [x] 41.7 Implement observability logging
    - Log function invocations
    - Log context updates
    - Log executor registrations
    - _Requirements: 34.16_

  - [x] 41.8 Write property test for context CDC consistency
    - **Property 36: Context CDC Consistency**
    - *For any* context update via setContext, the change propagates via CDC and is eventually visible in all message group caches
    - **Validates: Requirements 34.3, 34.17**

  - [x] 41.9 Write property test for function registry error handling
    - **Property 37: Function Registry No Executor Error**
    - *For any* function invocation where no executor is registered for the function's executor_type, the system returns an error indicating no executor available
    - **Validates: Requirements 34.13**

  - [x] 41.10 Write property test for executeQueryThenInvoke
    - **Property 38: Query Then Invoke Continuation**
    - *For any* executeQueryThenInvoke call with valid SQL and function ID, the query executes and the specified function is invoked with query results in context
    - **Validates: Requirements 34.9**

- [x] 42. Checkpoint - Verify function extensibility framework
  - Ensure all tests pass, ask the user if questions arise.


- [x] 43. Single Executable Packaging
  - [x] 43.1 Configure Node.js SEA build
    - Set up build process for single executable
    - Include all dependencies in bundle
    - Target Linux platform
    - _Requirements: 18.1, 18.3, 18.5_

  - [x] 43.2 Build database system executable
    - Create single executable for distributed database
    - Verify runs without Node.js installed
    - _Requirements: 18.1, 18.4_

  - [x] 43.3 Build admin CLI executable
    - Create single executable for admin CLI tool
    - Verify runs without Node.js installed
    - _Requirements: 18.2, 18.4_

  - [x] 43.4 Write property test for single executable completeness
    - **Property 39: Single Executable Completeness**
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.4**

  - [x] 43.5 Write property test for single executable behavioral equivalence
    - **Property 40: Single Executable Behavioral Equivalence**
    - **Validates: Requirements 18.6**

- [x] 44. Code Quality Verification
  - [x] 44.1 Verify code path uniqueness
    - Ensure single implementation path for each functionality
    - No conditional compilation or feature flags for core features
    - _Requirements: 11.1, 11.2, 11.4_

  - [x] 44.2 Write property test for code path uniqueness
    - **Property 41: Code Path Uniqueness**
    - **Validates: Requirements 11.1, 11.2, 11.4**

- [x] 45. Checkpoint - Verify packaging and code quality
  - Ensure all tests pass, ask the user if questions arise.


- [x] 46. Partition Transparency and Table Creation
  - [x] 46.1 Implement automatic partition key from PRIMARY KEY
    - Use PRIMARY KEY as partition key automatically
    - Require PRIMARY KEY for user tables
    - _Requirements: 20.1, 20.2_

  - [x] 46.2 Implement partition transparency
    - Never expose partition details in query results
    - Expose only in system tables for operators
    - _Requirements: 20.10_

  - [x] 46.3 Write property test for automatic partition key
    - **Property 42: Automatic Partition Key from PRIMARY KEY**
    - **Validates: Requirements 20.1**

  - [x] 46.4 Write property test for PRIMARY KEY requirement
    - **Property 43: PRIMARY KEY Requirement**
    - **Validates: Requirements 20.2**

  - [x] 46.5 Write property test for initial partition full range
    - **Property 44: Initial Partition Full Range**
    - **Validates: Requirements 20.3**

  - [x] 46.6 Write property test for partition transparency
    - **Property 45: Partition Transparency**
    - **Validates: Requirements 20.10**

- [x] 47. Final Integration Testing
  - [x] 47.1 Multi-node cluster integration tests
    - Test node joining and leaving
    - Test replica rebalancing across nodes
    - Test message routing between nodes
    - _Requirements: 1.4, 7.12, 7.13_

  - [x] 47.2 End-to-end SQL workflow tests
    - Test CREATE TABLE, INSERT, SELECT, UPDATE, DELETE
    - Test partition split and merge triggers
    - Test cross-partition queries
    - _Requirements: 6.1-6.5, 15.1-15.6, 22.1-22.7_

  - [x] 47.3 Failure scenario tests
    - Test node failure detection and recovery
    - Test network partition handling
    - Test data availability during failures
    - _Requirements: 14.1-14.5_

- [x] 48. Final Checkpoint - Complete system verification
  - Ensure all tests pass, ask the user if questions arise.


- [x] 49. Persistent Partition Storage
  - [x] 49.1 Implement data directory configuration
    - Add `--data-dir` command-line parameter parsing
    - Add `DATA_DIR` environment variable support
    - Implement precedence: CLI > env var > default (`./data`)
    - Add `storage.data_dir` to ConfigurationManager
    - _Requirements: 35.2, 35.3, 35.8, 35.9_

  - [x] 49.2 Implement data directory validation
    - Create data directory if it does not exist
    - Validate directory is writable at startup
    - Fail with clear error message if not writable
    - Log configured data directory at INFO level
    - _Requirements: 35.4, 35.6, 35.7, 35.10_

  - [x] 49.3 Implement partition database path generation
    - Create `getPartitionDbPath(dataDir, partitionId, replicaId)` function
    - Generate paths using pattern `{data-dir}/partitions/{partition-id}/{replica-id}.db`
    - Create partition directory structure when creating new partitions
    - _Requirements: 35.5_

  - [x] 49.4 Update PartitionService to use persistent storage
    - Remove `:memory:` default from PartitionService
    - Always use file-based SQLite database
    - Update BootstrapService to pass correct dbPath
    - Ensure WAL mode is enabled for all partition databases
    - _Requirements: 35.1_

  - [x] 49.5 Update tests to use temporary directories
    - Create temporary data directories for tests
    - Clean up test data directories after tests complete
    - Ensure tests don't interfere with each other
    - _Requirements: 35.1_

  - [x] 49.6 Write property test for persistent storage paths
    - **Property 76: Persistent Storage Path Generation**
    - *For any* partition ID and replica ID, the generated database path follows the pattern `{data-dir}/partitions/{partition-id}/{replica-id}.db`
    - **Validates: Requirements 35.5**

  - [x] 49.7 Write property test for data directory validation
    - **Property 77: Data Directory Validation**
    - *For any* data directory configuration, the system validates writability and creates the directory if needed, or fails with a clear error
    - **Validates: Requirements 35.4, 35.6, 35.7**

- [x] 50. Checkpoint - Verify persistent storage
  - All 7,337 tests pass including storage module tests and property tests (Properties 76 & 77)

- [x] 51. Replica Lifecycle Management
  - [x] 51.1 Implement ReplicaLifecycleManager class
    - Create ReplicaLifecycleManager with message handlers for CREATE_REPLICA and REMOVE_REPLICA
    - Register handlers with message group service
    - Track pending operations with request_id mapping
    - _Requirements: 10.1, 10.2, 10.10, 10.11_

  - [x] 51.2 Implement CREATE_REPLICA handler
    - Check for duplicate replica (idempotency)
    - Send immediate ACK with 'initiated' or 'already_exists' status
    - Insert service row with status 'starting'
    - Create PartitionService instance with correct dbPath
    - Update status to 'syncing' after message group registration
    - Sync Raft log from leader
    - Update status to 'active' on sync completion
    - Handle errors by setting status to 'failed'
    - _Requirements: 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

  - [x] 51.3 Implement REMOVE_REPLICA handler
    - Send immediate ACK with 'initiated' status
    - Update status to 'stopping'
    - Complete in-flight operations via graceful shutdown
    - Update status to 'stopped'
    - Delete service row from services table
    - Clean up local resources (SQLite files)
    - Unregister service from node service
    - Handle errors by setting status to 'failed'
    - _Requirements: 10.12, 10.13, 10.14, 10.15, 10.16_

  - [x] 51.4 Implement replica status state machine
    - Define valid status transitions in constants
    - Validate transitions before applying status updates
    - Log invalid transition attempts
    - _Requirements: 10.17, 10.18, 10.19_

  - [x] 51.5 Implement message acknowledgment with timeout
    - Create sendWithAck() method in rebalancer
    - Register one-time ACK handler with request_id matching
    - Implement configurable timeout (default 30 seconds)
    - Clean up handler on timeout or response
    - _Requirements: 10.20, 10.21, 10.22_

  - [x] 51.6 Update UnifiedRebalancer for lifecycle integration
    - Replace event emission with CREATE_REPLICA/REMOVE_REPLICA messages
    - Track pending moves in pendingMoves Map
    - Filter out pending replicas in calculateMoves()
    - Skip move generation when transitioning replicas exist
    - Implement cleanupExpiredMoves() for stale operations
    - _Requirements: 10.23, 10.24, 10.25_

  - [x] 51.7 Implement CDC event handling for move completion
    - Subscribe to services table CDC events
    - Detect ADD completion when status becomes 'active'
    - Detect REMOVE completion when row is deleted
    - Detect failure when status becomes 'failed'
    - Remove completed/failed moves from pendingMoves
    - _Requirements: 10.23, 10.24_

  - [x] 51.8 Implement node recovery orphan cleanup
    - Query services table for transitional states on node recovery
    - Mark 'starting'/'syncing' replicas as 'failed'
    - Complete removal for 'stopping' replicas
    - Clean up local resources for orphaned replicas
    - _Requirements: 10.26, 10.27, 10.28_

  - [x] 51.9 Implement lifecycle observability
    - Log all lifecycle operations at INFO level
    - Include partition_id, replica_id, node_id, status in log context
    - Log state transitions with before/after status
    - Log errors with full context and stack traces
    - _Requirements: 10.29_

  - [x] 51.10 Write property test for replica lifecycle message delivery
    - **Property 77: Replica Lifecycle Message Delivery**
    - **Validates: Requirements 10.1, 10.2, 10.10, 10.11, 10.20**

  - [x] 51.11 Write property test for replica creation idempotency
    - **Property 78: Replica Creation Idempotency**
    - **Validates: Requirements 10.3**

  - [x] 51.12 Write property test for replica status state machine validity
    - **Property 79: Replica Status State Machine Validity**
    - **Validates: Requirements 10.17, 10.18, 10.19**

  - [x] 51.13 Write property test for pending move tracking
    - **Property 80: Pending Move Tracking**
    - **Validates: Requirements 10.23, 10.24**

  - [x] 51.14 Write property test for duplicate move prevention
    - **Property 81: Duplicate Move Prevention**
    - **Validates: Requirements 10.25**

  - [x] 51.15 Write property test for replica removal graceful shutdown
    - **Property 82: Replica Removal Graceful Shutdown**
    - **Validates: Requirements 10.12, 10.13, 10.14, 10.15, 10.16**

  - [x] 51.16 Write property test for node recovery orphan cleanup
    - **Property 83: Node Recovery Orphan Cleanup**
    - **Validates: Requirements 10.26, 10.27, 10.28**

- [x] 52. Checkpoint - Verify replica lifecycle management
  - Ensure all tests pass, ask the user if questions arise.


- [x] 53. Cross-Node WebSocket Communication
  - [x] 53.1 Implement MessageRouter for unified local/remote routing
    - Created MessageRouter class that handles both local and WebSocket routing
    - Supports local handler registration (like InMemoryTransport)
    - Supports WebSocket server for incoming connections
    - Supports WebSocket client connections to remote nodes
    - Routes messages locally or via WebSocket based on target
    - _Requirements: 11.1, 11.8, 4.16, 4.21, 4.22_

  - [x] 53.2 Integrate MessageRouter into bootstrap-service
    - Added MessageRouter import and initialization
    - Added wsPort configuration option
    - Added startWebSocketServer() method for post-bootstrap server start
    - Added getMessageRouter() accessor
    - Updated cleanup to shutdown MessageRouter
    - _Requirements: 11.8, 4.16, 4.21, 4.22_

  - [x] 53.3 Integrate MessageRouter into node-joining-service
    - Added MessageRouter import and initialization
    - Added seedNodeWsAddress and wsPort options
    - Added CONNECTING_WEBSOCKET phase
    - Added phaseConnectWebSocket() to connect to seed node
    - Updated cleanup to shutdown MessageRouter
    - _Requirements: 11.8, 4.16, 4.22_

  - [x] 53.4 Update MessageGroupTransport to use MessageRouter
    - Added messageRouter option to constructor
    - Added setMessageRouter() method
    - Updated deliver() to try WebSocket routing for cross-node targets
    - Added deliverViaMessageRouter() method for WebSocket delivery
    - Falls back to message group routing if WebSocket fails
    - Updated getStats() to include hasMessageRouter
    - _Requirements: 11.2, 11.3, 4.21, 4.22_

  - [x] 53.5 Write unit tests for MessageRouter
    - Test local message delivery
    - Test handler registration/unregistration
    - Test stats and state management
    - _Requirements: 10.1, 10.10_

  - [x] 53.6 Write integration test for cross-node replica placement
    - Test that CREATE_REPLICA messages reach new nodes
    - Test that REMOVE_REPLICA messages reach target nodes
    - Verify rebalancer moves are executed across nodes
    - _Requirements: 10.1, 10.10, 11.3_

- [x] 54. Checkpoint - Verify cross-node communication
  - All tests pass for MessageRouter, MessageGroupTransport, and integration tests


## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check with max 10 iterations
- Unit tests validate specific examples and edge cases
- All code must comply with Google JavaScript ESLint rules
- Use ES6 modules (import/export) throughout
