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
// @ts-nocheck


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
 */function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
const SUBSYSTEM = Object.freeze(stryMutAct_9fa48("54804") ? {} : (stryCov_9fa48("54804"), {
  // ============================================================================
  // Bootstrap - System initialization and node joining
  // ============================================================================

  /** Main bootstrap service orchestrating system startup */
  BOOTSTRAP: stryMutAct_9fa48("54805") ? "" : (stryCov_9fa48("54805"), 'bootstrap'),
  /** Bootstrap HTTP API for node joining */
  BOOTSTRAP_API: stryMutAct_9fa48("54806") ? "" : (stryCov_9fa48("54806"), 'bootstrap-api'),
  /** Bootstrap progress tracking */
  BOOTSTRAP_TRACKER: stryMutAct_9fa48("54807") ? "" : (stryCov_9fa48("54807"), 'bootstrap-tracker'),
  /** Node joining workflow */
  BOOTSTRAP_NODE_JOINING: stryMutAct_9fa48("54808") ? "" : (stryCov_9fa48("54808"), 'node-joining'),
  /** Message router setup during bootstrap */
  MESSAGE_ROUTER_SETUP: stryMutAct_9fa48("54809") ? "" : (stryCov_9fa48("54809"), 'message-router-setup'),
  /** Control plane setup during bootstrap */
  CONTROL_PLANE_SETUP: stryMutAct_9fa48("54810") ? "" : (stryCov_9fa48("54810"), 'control-plane-setup'),
  /** Replica handler setup during bootstrap */
  REPLICA_HANDLER_SETUP: stryMutAct_9fa48("54811") ? "" : (stryCov_9fa48("54811"), 'replica-handler-setup'),
  /** CDC integration setup during bootstrap */
  CDC_INTEGRATION_SETUP: stryMutAct_9fa48("54812") ? "" : (stryCov_9fa48("54812"), 'cdc-integration-setup'),
  /** Node storage budget setup during bootstrap */
  NODE_STORAGE_BUDGET_SETUP: stryMutAct_9fa48("54813") ? "" : (stryCov_9fa48("54813"), 'node-storage-budget-setup'),
  /** Service lifecycle management */
  SERVICE_LIFECYCLE: stryMutAct_9fa48("54814") ? "" : (stryCov_9fa48("54814"), 'service-lifecycle'),
  /** Message group assignment during bootstrap */
  MESSAGE_GROUP_ASSIGNMENT: stryMutAct_9fa48("54815") ? "" : (stryCov_9fa48("54815"), 'message-group-assignment'),
  // ============================================================================
  // Transport - Message routing and network communication
  // ============================================================================

  /** Main message router for inter-node communication */
  MESSAGE_ROUTER: stryMutAct_9fa48("54816") ? "" : (stryCov_9fa48("54816"), 'message-router'),
  /** WebSocket transport layer */
  WEBSOCKET_TRANSPORT: stryMutAct_9fa48("54817") ? "" : (stryCov_9fa48("54817"), 'websocket-transport'),
  /** WebSocket transport provider factory */
  WEBSOCKET_TRANSPORT_PROVIDER: stryMutAct_9fa48("54818") ? "" : (stryCov_9fa48("54818"), 'websocket-transport-provider'),
  /** Transport registry for endpoint management */
  TRANSPORT_REGISTRY: stryMutAct_9fa48("54819") ? "" : (stryCov_9fa48("54819"), 'transport-registry'),
  /** Connection pool for WebSocket connections */
  CONNECTION_POOL: stryMutAct_9fa48("54820") ? "" : (stryCov_9fa48("54820"), 'connection-pool'),
  /** RPC client for request-response communication */
  RPC_CLIENT: stryMutAct_9fa48("54821") ? "" : (stryCov_9fa48("54821"), 'rpc-client'),
  // ============================================================================
  // Node - Node lifecycle and failure detection
  // ============================================================================

  /** Node service managing local services */
  NODE_SERVICE: stryMutAct_9fa48("54822") ? "" : (stryCov_9fa48("54822"), 'node-service'),
  /** Node lifecycle service for cluster membership */
  NODE_LIFECYCLE: stryMutAct_9fa48("54823") ? "" : (stryCov_9fa48("54823"), 'node-lifecycle'),
  /** Node lifecycle state machine */
  NODE_LIFECYCLE_STATE_MACHINE: stryMutAct_9fa48("54824") ? "" : (stryCov_9fa48("54824"), 'node-lifecycle-state-machine'),
  /** Failure detector for node health monitoring */
  FAILURE_DETECTOR: stryMutAct_9fa48("54825") ? "" : (stryCov_9fa48("54825"), 'failure-detector'),
  /** Node reintegration after recovery */
  NODE_REINTEGRATION: stryMutAct_9fa48("54826") ? "" : (stryCov_9fa48("54826"), 'node-reintegration'),
  // ============================================================================
  // Replica - Replica management and state machines
  // ============================================================================

  /** Replica handler for create/remove operations */
  REPLICA_HANDLER: stryMutAct_9fa48("54827") ? "" : (stryCov_9fa48("54827"), 'replica-handler'),
  /** Replica state machine for lifecycle tracking */
  REPLICA_STATE_MACHINE: stryMutAct_9fa48("54828") ? "" : (stryCov_9fa48("54828"), 'replica-state-machine'),
  /** Replica lifecycle manager */
  REPLICA_LIFECYCLE: stryMutAct_9fa48("54829") ? "" : (stryCov_9fa48("54829"), 'replica-lifecycle'),
  /** Runtime service handler for runtime-service replica operations */
  RUNTIME_SERVICE_HANDLER: stryMutAct_9fa48("54830") ? "" : (stryCov_9fa48("54830"), 'runtime-service-handler'),
  /** Runtime service handler setup during bootstrap */
  RUNTIME_SERVICE_HANDLER_SETUP: stryMutAct_9fa48("54831") ? "" : (stryCov_9fa48("54831"), 'runtime-service-handler-setup'),
  /** Replica recovery service */
  REPLICA_RECOVERY: stryMutAct_9fa48("54832") ? "" : (stryCov_9fa48("54832"), 'replica-recovery'),
  // ============================================================================
  // Core Services - Partitions, message groups, CDC, control plane
  // ============================================================================

  /** Partition service for data storage */
  PARTITION: stryMutAct_9fa48("54833") ? "" : (stryCov_9fa48("54833"), 'partition'),
  /** Key range manager for partition routing */
  KEY_RANGE_MANAGER: stryMutAct_9fa48("54834") ? "" : (stryCov_9fa48("54834"), 'key-range-manager'),
  /** Pending request tracker for partition operations */
  PENDING_REQUEST_TRACKER: stryMutAct_9fa48("54835") ? "" : (stryCov_9fa48("54835"), 'pending-request-tracker'),
  /** Partition split/merge manager */
  PARTITION_SPLIT_MERGE: stryMutAct_9fa48("54836") ? "" : (stryCov_9fa48("54836"), 'partition-split-merge'),
  /** Message group service for Raft consensus */
  MESSAGE_GROUP: stryMutAct_9fa48("54837") ? "" : (stryCov_9fa48("54837"), 'message-group'),
  /** CDC integration service */
  CDC_INTEGRATION: stryMutAct_9fa48("54838") ? "" : (stryCov_9fa48("54838"), 'cdc-integration'),
  /** Control plane for cluster coordination */
  CONTROL_PLANE: stryMutAct_9fa48("54839") ? "" : (stryCov_9fa48("54839"), 'control-plane'),
  /** Unified rebalancer for replica distribution */
  REBALANCER: stryMutAct_9fa48("54840") ? "" : (stryCov_9fa48("54840"), 'rebalancer'),
  /** Rebalance coordinator for move operations */
  REBALANCE_COORDINATOR: stryMutAct_9fa48("54841") ? "" : (stryCov_9fa48("54841"), 'rebalance-coordinator'),
  // ============================================================================
  // Query - SQL execution and routing
  // ============================================================================

  /** SQL query engine */
  SQL_QUERY_ENGINE: stryMutAct_9fa48("54842") ? "" : (stryCov_9fa48("54842"), 'sql-query-engine'),
  /** Query executor for partition queries */
  QUERY_EXECUTOR: stryMutAct_9fa48("54843") ? "" : (stryCov_9fa48("54843"), 'query-executor'),
  /** Query router for partition selection */
  QUERY_ROUTER: stryMutAct_9fa48("54844") ? "" : (stryCov_9fa48("54844"), 'query-router'),
  /** Parallel query coordinator */
  PARALLEL_QUERY_COORDINATOR: stryMutAct_9fa48("54845") ? "" : (stryCov_9fa48("54845"), 'parallel-query-coordinator'),
  /** Streaming aggregator for large results */
  STREAMING_AGGREGATOR: stryMutAct_9fa48("54846") ? "" : (stryCov_9fa48("54846"), 'streaming-aggregator'),
  /** Straggler detector for slow partitions */
  STRAGGLER_DETECTOR: stryMutAct_9fa48("54847") ? "" : (stryCov_9fa48("54847"), 'straggler-detector'),
  /** Speculative executor for latency optimization */
  SPECULATIVE_EXECUTOR: stryMutAct_9fa48("54848") ? "" : (stryCov_9fa48("54848"), 'speculative-executor'),
  /** Partition resolver for query routing */
  PARTITION_RESOLVER: stryMutAct_9fa48("54849") ? "" : (stryCov_9fa48("54849"), 'partition-resolver'),
  /** Table creation service */
  TABLE_CREATION_SERVICE: stryMutAct_9fa48("54850") ? "" : (stryCov_9fa48("54850"), 'table-creation-service'),
  /** SQL parser */
  SQL_PARSER: stryMutAct_9fa48("54851") ? "" : (stryCov_9fa48("54851"), 'sql-parser'),
  // ============================================================================
  // Storage and Time - Data persistence and HLC
  // ============================================================================

  /** Hybrid logical clock */
  HLC: stryMutAct_9fa48("54852") ? "" : (stryCov_9fa48("54852"), 'hlc'),
  /** Storage subsystem */
  STORAGE: stryMutAct_9fa48("54853") ? "" : (stryCov_9fa48("54853"), 'storage'),
  /** Threading subsystem */
  THREADING: stryMutAct_9fa48("54854") ? "" : (stryCov_9fa48("54854"), 'threading'),
  /** Transaction manager */
  TRANSACTION: stryMutAct_9fa48("54855") ? "" : (stryCov_9fa48("54855"), 'transaction-manager'),
  /** Worker process isolation subsystem */
  WORKER: stryMutAct_9fa48("54856") ? "" : (stryCov_9fa48("54856"), 'worker'),
  // ============================================================================
  // Policy - Table policies and Raft role tracking
  // ============================================================================

  /** Table policy service */
  TABLE_POLICY: stryMutAct_9fa48("54857") ? "" : (stryCov_9fa48("54857"), 'table-policy'),
  /** Raft role tracker */
  RAFT_ROLE_TRACKER: stryMutAct_9fa48("54858") ? "" : (stryCov_9fa48("54858"), 'raft-role-tracker'),
  // ============================================================================
  // Cache - System table caching
  // ============================================================================

  /** System table cache */
  CACHE: stryMutAct_9fa48("54859") ? "" : (stryCov_9fa48("54859"), 'cache'),
  /** Cache hydration service */
  CACHE_HYDRATION: stryMutAct_9fa48("54860") ? "" : (stryCov_9fa48("54860"), 'cache-hydration'),
  // ============================================================================
  // Admin - Administrative API
  // ============================================================================

  /** Admin WebSocket API */
  ADMIN_WEBSOCKET_API: stryMutAct_9fa48("54861") ? "" : (stryCov_9fa48("54861"), 'admin-websocket-api'),
  // ============================================================================
  // Function - User-defined functions
  // ============================================================================

  /** Function query executor */
  FUNCTION_QUERY_EXECUTOR: stryMutAct_9fa48("54862") ? "" : (stryCov_9fa48("54862"), 'function-query-executor'),
  /** CDC subscription manager for functions */
  CDC_SUBSCRIPTION_MANAGER: stryMutAct_9fa48("54863") ? "" : (stryCov_9fa48("54863"), 'cdc-subscription-manager'),
  /** Context manager for function execution */
  CONTEXT_MANAGER: stryMutAct_9fa48("54864") ? "" : (stryCov_9fa48("54864"), 'context-manager'),
  /** Function registry */
  FUNCTION_REGISTRY: stryMutAct_9fa48("54865") ? "" : (stryCov_9fa48("54865"), 'function-registry'),
  // ============================================================================
  // Index - Index management
  // ============================================================================

  /** Index service */
  INDEX_SERVICE: stryMutAct_9fa48("54866") ? "" : (stryCov_9fa48("54866"), 'index-service'),
  /** Query optimizer */
  QUERY_OPTIMIZER: stryMutAct_9fa48("54867") ? "" : (stryCov_9fa48("54867"), 'query-optimizer'),
  // ============================================================================
  // Live Query - Real-time query subscriptions
  // ============================================================================

  /** Query group for live queries */
  QUERY_GROUP: stryMutAct_9fa48("54868") ? "" : (stryCov_9fa48("54868"), 'query-group'),
  /** Live query manager */
  LIVE_QUERY_MANAGER: stryMutAct_9fa48("54869") ? "" : (stryCov_9fa48("54869"), 'live-query-manager'),
  /** Live query service */
  LIVE_QUERY_SERVICE: stryMutAct_9fa48("54870") ? "" : (stryCov_9fa48("54870"), 'live-query-service'),
  // ============================================================================
  // Logging - Log management
  // ============================================================================

  /** Main logging subsystem */
  LOGGING_MAIN: stryMutAct_9fa48("54871") ? "" : (stryCov_9fa48("54871"), 'main'),
  /** Config logging subsystem */
  LOGGING_CONFIG: stryMutAct_9fa48("54872") ? "" : (stryCov_9fa48("54872"), 'config'),
  /** Runtime resource diagnostics sampler */
  RESOURCE_DIAGNOSTICS: stryMutAct_9fa48("54873") ? "" : (stryCov_9fa48("54873"), 'resource-diagnostics'),
  // ============================================================================
  // Address - Address resolution
  // ============================================================================

  /** Address subsystem */
  ADDRESS: stryMutAct_9fa48("54874") ? "" : (stryCov_9fa48("54874"), 'address'),
  // ============================================================================
  // Entrypoint - Application entry
  // ============================================================================

  /** Main entrypoint */
  ENTRYPOINT_MAIN: stryMutAct_9fa48("54875") ? "" : (stryCov_9fa48("54875"), 'main'),
  /** Config entrypoint */
  ENTRYPOINT_CONFIG: stryMutAct_9fa48("54876") ? "" : (stryCov_9fa48("54876"), 'config')
}));
export { SUBSYSTEM };