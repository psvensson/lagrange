/**
 * Centralized subsystem identifiers for logging and service identification.
 *
 * This module consolidates all subsystem identifiers used throughout the codebase
 * for consistent logging, tracing, and service identification. Each subsystem
 * identifier is used with the logging service's forSubsystem() method.
 *
 * @module constants/subsystems
 * @see src/logging/logging-service.js - LoggingService.forSubsystem()
 * @see Requirements 2.1, 2.5, 2.6 - Constants centralization
 */

/**
 * Subsystem identifiers organized by functional area.
 *
 * Categories:
 * - Bootstrap: System initialization and node joining
 * - Transport: Message routing and network communication
 * - Node: Node lifecycle and failure detection
 * - Replica: Replica management and state machines
 * - Core Services: Partitions, message groups, CDC, control plane
 * - Query: SQL execution and routing
 * - Storage: Data persistence and HLC
 * - Policy: Table policies and Raft role tracking
 * - Cache: System table caching
 * - Admin: Administrative API
 * - Function: User-defined functions
 * - Index: Index management
 * - Live Query: Real-time query subscriptions
 * - Logging: Log management
 * - Address: Address resolution
 * - Config: Configuration management
 *
 * @type {Readonly<Object>}
 */
const SUBSYSTEM = Object.freeze({
  // ============================================================================
  // Bootstrap - System initialization and node joining
  // ============================================================================

  /** Main bootstrap service orchestrating system startup */
  BOOTSTRAP: 'bootstrap',

  /** Bootstrap HTTP API for node joining */
  BOOTSTRAP_API: 'bootstrap-api',

  /** Bootstrap progress tracking */
  BOOTSTRAP_TRACKER: 'bootstrap-tracker',

  /** Node joining workflow */
  BOOTSTRAP_NODE_JOINING: 'node-joining',

  /** Message router setup during bootstrap */
  MESSAGE_ROUTER_SETUP: 'message-router-setup',

  /** Control plane setup during bootstrap */
  CONTROL_PLANE_SETUP: 'control-plane-setup',

  /** Replica handler setup during bootstrap */
  REPLICA_HANDLER_SETUP: 'replica-handler-setup',

  /** CDC integration setup during bootstrap */
  CDC_INTEGRATION_SETUP: 'cdc-integration-setup',

  /** Node storage budget setup during bootstrap */
  NODE_STORAGE_BUDGET_SETUP: 'node-storage-budget-setup',

  /** Service lifecycle management */
  SERVICE_LIFECYCLE: 'service-lifecycle',

  /** Message group assignment during bootstrap */
  MESSAGE_GROUP_ASSIGNMENT: 'message-group-assignment',

  // ============================================================================
  // Transport - Message routing and network communication
  // ============================================================================

  /** Main message router for inter-node communication */
  MESSAGE_ROUTER: 'message-router',

  /** WebSocket transport layer */
  WEBSOCKET_TRANSPORT: 'websocket-transport',

  /** WebSocket transport provider factory */
  WEBSOCKET_TRANSPORT_PROVIDER: 'websocket-transport-provider',

  /** Transport registry for endpoint management */
  TRANSPORT_REGISTRY: 'transport-registry',

  /** Connection pool for WebSocket connections */
  CONNECTION_POOL: 'connection-pool',

  /** RPC client for request-response communication */
  RPC_CLIENT: 'rpc-client',

  // ============================================================================
  // Node - Node lifecycle and failure detection
  // ============================================================================

  /** Node service managing local services */
  NODE_SERVICE: 'node-service',

  /** Node lifecycle service for cluster membership */
  NODE_LIFECYCLE: 'node-lifecycle',

  /** Node lifecycle state machine */
  NODE_LIFECYCLE_STATE_MACHINE: 'node-lifecycle-state-machine',

  /** Failure detector for node health monitoring */
  FAILURE_DETECTOR: 'failure-detector',

  /** Node reintegration after recovery */
  NODE_REINTEGRATION: 'node-reintegration',

  // ============================================================================
  // Replica - Replica management and state machines
  // ============================================================================

  /** Replica handler for create/remove operations */
  REPLICA_HANDLER: 'replica-handler',

  /** Replica state machine for lifecycle tracking */
  REPLICA_STATE_MACHINE: 'replica-state-machine',

  /** Replica lifecycle manager */
  REPLICA_LIFECYCLE: 'replica-lifecycle',

  /** Runtime service handler for runtime-service replica operations */
  RUNTIME_SERVICE_HANDLER: 'runtime-service-handler',

  /** Runtime service handler setup during bootstrap */
  RUNTIME_SERVICE_HANDLER_SETUP: 'runtime-service-handler-setup',

  /** Replica recovery service */
  REPLICA_RECOVERY: 'replica-recovery',

  // ============================================================================
  // Core Services - Partitions, message groups, CDC, control plane
  // ============================================================================

  /** Partition service for data storage */
  PARTITION: 'partition',

  /** Key range manager for partition routing */
  KEY_RANGE_MANAGER: 'key-range-manager',

  /** Pending request tracker for partition operations */
  PENDING_REQUEST_TRACKER: 'pending-request-tracker',

  /** Partition split/merge manager */
  PARTITION_SPLIT_MERGE: 'partition-split-merge',

  /** Message group service for Raft consensus */
  MESSAGE_GROUP: 'message-group',

  /** CDC integration service */
  CDC_INTEGRATION: 'cdc-integration',

  /** Control plane for cluster coordination */
  CONTROL_PLANE: 'control-plane',

  /** Unified rebalancer for replica distribution */
  REBALANCER: 'rebalancer',

  /** Rebalance coordinator for move operations */
  REBALANCE_COORDINATOR: 'rebalance-coordinator',

  // ============================================================================
  // Query - SQL execution and routing
  // ============================================================================

  /** SQL query engine */
  SQL_QUERY_ENGINE: 'sql-query-engine',

  /** Query executor for partition queries */
  QUERY_EXECUTOR: 'query-executor',

  /** Query router for partition selection */
  QUERY_ROUTER: 'query-router',

  /** Parallel query coordinator */
  PARALLEL_QUERY_COORDINATOR: 'parallel-query-coordinator',

  /** Streaming aggregator for large results */
  STREAMING_AGGREGATOR: 'streaming-aggregator',

  /** Straggler detector for slow partitions */
  STRAGGLER_DETECTOR: 'straggler-detector',

  /** Speculative executor for latency optimization */
  SPECULATIVE_EXECUTOR: 'speculative-executor',

  /** Partition resolver for query routing */
  PARTITION_RESOLVER: 'partition-resolver',

  /** Table creation service */
  TABLE_CREATION_SERVICE: 'table-creation-service',

  /** SQL parser */
  SQL_PARSER: 'sql-parser',

  // ============================================================================
  // Storage and Time - Data persistence and HLC
  // ============================================================================

  /** Hybrid logical clock */
  HLC: 'hlc',

  /** Storage subsystem */
  STORAGE: 'storage',

  /** Threading subsystem */
  THREADING: 'threading',

  /** Transaction manager */
  TRANSACTION: 'transaction-manager',

  /** Worker process isolation subsystem */
  WORKER: 'worker',

  // ============================================================================
  // Policy - Table policies and Raft role tracking
  // ============================================================================

  /** Table policy service */
  TABLE_POLICY: 'table-policy',

  /** Raft role tracker */
  RAFT_ROLE_TRACKER: 'raft-role-tracker',

  // ============================================================================
  // Cache - System table caching
  // ============================================================================

  /** System table cache */
  CACHE: 'cache',

  /** Cache hydration service */
  CACHE_HYDRATION: 'cache-hydration',

  // ============================================================================
  // Admin - Administrative API
  // ============================================================================

  /** Admin WebSocket API */
  ADMIN_WEBSOCKET_API: 'admin-websocket-api',

  // ============================================================================
  // Function - User-defined functions
  // ============================================================================

  /** Function query executor */
  FUNCTION_QUERY_EXECUTOR: 'function-query-executor',

  /** CDC subscription manager for functions */
  CDC_SUBSCRIPTION_MANAGER: 'cdc-subscription-manager',

  /** Context manager for function execution */
  CONTEXT_MANAGER: 'context-manager',

  /** Function registry */
  FUNCTION_REGISTRY: 'function-registry',

  // ============================================================================
  // Index - Index management
  // ============================================================================

  /** Index service */
  INDEX_SERVICE: 'index-service',

  /** Query optimizer */
  QUERY_OPTIMIZER: 'query-optimizer',

  // ============================================================================
  // Live Query - Real-time query subscriptions
  // ============================================================================

  /** Query group for live queries */
  QUERY_GROUP: 'query-group',

  /** Live query manager */
  LIVE_QUERY_MANAGER: 'live-query-manager',

  /** Live query service */
  LIVE_QUERY_SERVICE: 'live-query-service',

  // ============================================================================
  // Logging - Log management
  // ============================================================================

  /** Main logging subsystem */
  LOGGING_MAIN: 'main',

  /** Config logging subsystem */
  LOGGING_CONFIG: 'config',

  /** Runtime resource diagnostics sampler */
  RESOURCE_DIAGNOSTICS: 'resource-diagnostics',

  // ============================================================================
  // Address - Address resolution
  // ============================================================================

  /** Address subsystem */
  ADDRESS: 'address',

  // ============================================================================
  // Entrypoint - Application entry
  // ============================================================================

  /** Main entrypoint */
  ENTRYPOINT_MAIN: 'main',

  /** Config entrypoint */
  ENTRYPOINT_CONFIG: 'config',
});

export {SUBSYSTEM};
