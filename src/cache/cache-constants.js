import {CDC_OPERATION, NUM, TABLES} from '../constants/index.js';
import {
  SYSTEM_CACHE_KEY_DESCRIPTOR,
} from './system-cache-key-descriptor.js';

const CACHE_SUBSYSTEM = Object.freeze({
  CACHE: 'cache',
  HYDRATION: 'cache-hydration',
});

const CACHE_LOG_MSG = Object.freeze({
  INSERT_ON_EXISTING_KEY_TREAT_UPDATE: 'INSERT on existing key, treating as UPDATE',
  UPDATE_ON_MISSING_KEY_TREAT_INSERT: 'UPDATE on non-existing key, treating as INSERT',
  DELETE_ON_MISSING_KEY_IGNORED: 'DELETE on non-existing key, ignoring',
  STALE_EVENT_IGNORED: 'Ignoring stale CDC event for existing key',
  REJECTED_STALE_EPOCH: 'Rejected stale epoch update',
  UPDATED_EPOCH: 'Updated cache epoch',
  CACHE_LISTENER_ERROR: 'Cache listener error',
  APPLIED_CDC_EVENT: 'Applied CDC event to cache',
  CACHE_CLEARED: 'Cache cleared',
  READ_ONLY_WRITE_ATTEMPT: 'Attempted to write to read-only cache',
  GET_READY_NODES_DEBUG: 'getReadyNodes debug info',
});

const CACHE_ERROR_MSG = Object.freeze({
  EPOCH_INVALID_OBJECT: 'Epoch must be a valid object',
  EPOCH_MISSING_NUMBER: 'Epoch must have a numeric epoch field',
  EPOCH_MISSING_ASSIGNMENTS: 'Epoch must have an assignments object',
  LISTENER_REQUIRED: 'Listener must be a function',
  primaryKeyMissing: (pkField) =>
    `CDC data must include primary key field "${pkField}" or "id"`,
  invalidTableName: (tableName, tables) =>
    `Invalid system table name: ${tableName}. Valid tables are: ${tables.join(', ')}`,
  invalidCdcOperation: (operation, operations) =>
    `Invalid CDC operation: ${operation}. Valid operations are: ${operations.join(', ')}`,
  READ_ONLY_CACHE_REQUIRED: 'ReadOnlySystemTableCache requires an underlying cache',
  READ_ONLY_HINT: 'Use CDCIntegrationService for writes',
  readOnlyMethodBlocked: (prop) =>
    `Cache write violation: "${prop}" is not available on read-only cache. ` +
    'Use CDCIntegrationService for writes.',
  READ_ONLY_DIRECT_ACCESS:
    'Cache write violation: Direct cache access is not allowed. ' +
    'Use CDCIntegrationService for writes.',
  NODE_ID_MISSING: 'Nodes cache entries must include node_id',
});

const CACHE_DEFAULT = Object.freeze({
  INITIAL_EPOCH: NUM.ZERO,
  PRIMARY_KEY_FALLBACK: 'id',
  CACHE_ID_PREFIX: 'cache-',
  CACHE_ID_RADIX: 36,
  CACHE_ID_START: 2,
  CACHE_ID_LENGTH: 9,
});

// ---------------------------------------------------------------------------
// CDC-Propagated vs Non-Propagated Table Classification
// ---------------------------------------------------------------------------
//
// A system table is CDC-propagated when every node in the cluster must hold
// an up-to-date copy of its rows in the local SystemTableCache so that
// routing, placement, rebalancing, and topology decisions can be made
// without cross-node queries.
//
// Classification rules (a table MUST be propagated when ANY rule applies):
//
//   1. MEMBERSHIP — the table describes which nodes, partitions, message
//      groups, or replicated services exist and where they live.
//   2. ROUTING — the table is consulted during query routing, leader
//      discovery, or endpoint resolution.
//   3. PLACEMENT — the table is read by the rebalancer, move planner,
//      or admission service to decide replica placement.
//   4. CLUSTER CONFIG — the table carries cluster-wide configuration
//      (epoch, budgets, feature flags) that every node must observe.
//   5. TOPOLOGY — the table defines network topology, latency groups,
//      or inter-group measurements used for CDC fanout or routing.
//
// A table MUST NOT be propagated when ALL of the following hold:
//
//   a. It is high-cardinality or high-write-rate (e.g. logs, operations).
//   b. It is scoped to a specific service, session, or execution context
//      rather than cluster-wide topology.
//   c. It can be queried on demand from its owning partition without
//      affecting routing, placement, or cluster-health decisions.
//
// Any new system table MUST be classified here. Tables not listed in
// CDC_PROPAGATED_TABLES are non-propagated by default and will not be
// included in cache hydration snapshots or CDC subscriptions.
// ---------------------------------------------------------------------------

/**
 * Tables whose CDC events propagate to every node's SystemTableCache.
 * These define cluster topology, routing, placement, and configuration.
 */
const CDC_PROPAGATED_TABLES = Object.freeze([
  // Membership
  TABLES.NODES, // node registry and state
  TABLES.PARTITIONS, // partition key ranges and replica counts
  TABLES.SERVICES, // replica locations and raft roles
  TABLES.MESSAGE_GROUPS, // message group membership
  TABLES.TABLES, // table schemas and policies
  TABLES.INDICES, // secondary index definitions

  // Routing and endpoints
  TABLES.NODE_ENDPOINTS, // node transport endpoints
  TABLES.SERVICE_DEFINITIONS, // service runtime definitions
  TABLES.SERVICE_ENDPOINTS, // replicated service endpoints

  // Placement and rebalancing
  TABLES.REPLICA_OPERATIONS, // in-flight rebalancing operations
  TABLES.STORAGE_RESERVATIONS, // in-flight storage reservations

  // Cluster-wide configuration
  TABLES.CONFIG, // epoch, budgets, feature flags

  // Distributed SQL transaction coordination/recovery
  TABLES.SQL_TRANSACTIONS, // transaction state machine rows
  TABLES.SQL_TRANSACTION_PARTICIPANTS, // participant partition status
  TABLES.SQL_WRITE_OPERATIONS, // idempotent write operation envelope

  // Debug session control plane state
  TABLES.DEBUG_SESSIONS, // trace session activation + lineage scope

  // Network topology
  TABLES.LATENCY_GROUPS, // latency group assignments
  TABLES.INTER_GROUP_LATENCIES, // inter-group RTT measurements
]);

/**
 * Tables that are NOT CDC-propagated. They remain queryable from their
 * owning partition via SQL but are not cached on every node.
 *
 * Rationale per table:
 *   logs                     — high cardinality, append-only
 *   contexts                 — per-execution, transient
 *   code                     — stored procedures, query on demand
 *   live_queries             — per-session subscriptions
 *   service_timers           — WASM service-scoped timers
 *   module_manifests         — WASM module metadata, query on demand
 *   package_registry_mappings — namespace mappings, query on demand
 *   package_registry_overrides — per-package overrides, query on demand
 *   module_dependency_locks  — immutable locks, query on demand
 *   wasm_operations          — async workflow journal, transient
 *   debug_breakpoints        — debug breakpoint state, transient
 *   debug_snapshots          — debug snapshot state, transient
 */
const CDC_NON_PROPAGATED_TABLES = Object.freeze([
  TABLES.LOGS,
  TABLES.CONTEXTS,
  TABLES.CODE,
  TABLES.LIVE_QUERIES,
  TABLES.SERVICE_TIMERS,
  TABLES.MODULE_MANIFESTS,
  TABLES.PACKAGE_REGISTRY_MAPPINGS,
  TABLES.PACKAGE_REGISTRY_OVERRIDES,
  TABLES.MODULE_DEPENDENCY_LOCKS,
  TABLES.WASM_OPERATIONS,
  TABLES.DEBUG_BREAKPOINTS,
  TABLES.DEBUG_SNAPSHOTS,
]);

/**
 * Complete list of all system tables (propagated + non-propagated).
 * Used by SystemTableCache for schema validation and by bootstrap for
 * partition creation. Every system table MUST appear in exactly one of
 * CDC_PROPAGATED_TABLES or CDC_NON_PROPAGATED_TABLES.
 */
const CACHE_SYSTEM_TABLES = Object.freeze([
  ...CDC_PROPAGATED_TABLES,
  ...CDC_NON_PROPAGATED_TABLES,
]);

const CACHE_PRIMARY_KEY_FIELDS = SYSTEM_CACHE_KEY_DESCRIPTOR;

const CACHE_CDC_OPERATIONS = CDC_OPERATION;

/**
 * Tables included in cache hydration snapshots and CDC subscriptions.
 * This is the CDC-propagated set: every node receives and caches these.
 */
const CACHE_HYDRATION_TABLES = CDC_PROPAGATED_TABLES;

const CACHE_HYDRATION_LOG_MSG = Object.freeze({
  STARTING: 'Starting cache hydration',
  TABLE_HYDRATED: 'Hydrated system table cache',
  TABLE_FAILED: 'Failed to hydrate system table',
  COMPLETE: 'Cache hydration complete',
});

const CACHE_HYDRATION_ERROR_MSG = Object.freeze({
  queryFailed: (tableName) => `Failed to query ${tableName}`,
});

const CACHE_READ_ONLY = Object.freeze({
  BLOCKED_METHODS: [
    'applySystemTableChange',
    'clear',
    'insert',
    'update',
    'delete',
  ],
  BLOCKED_PROPERTIES: ['_cache', 'tables'],
  DIRECT_ACCESS: 'direct_access',
});

export {
  CACHE_CDC_OPERATIONS,
  CACHE_DEFAULT,
  CACHE_ERROR_MSG,
  CACHE_HYDRATION_ERROR_MSG,
  CACHE_HYDRATION_LOG_MSG,
  CACHE_HYDRATION_TABLES,
  CACHE_LOG_MSG,
  CACHE_PRIMARY_KEY_FIELDS,
  CACHE_READ_ONLY,
  CACHE_SUBSYSTEM,
  CACHE_SYSTEM_TABLES,
  CDC_NON_PROPAGATED_TABLES,
  CDC_PROPAGATED_TABLES,
};
