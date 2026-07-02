import {CDC_OPERATION, TIME_MS} from '../constants/index.js';
import {
  SYSTEM_CACHE_KEY_DESCRIPTOR,
} from './system-cache-key-descriptor.js';
import {
  CDC_NON_PROPAGATED_TABLES,
  CDC_PROPAGATED_TABLES,
} from './cdc-table-policy.js';

const CACHE_SUBSYSTEM = Object.freeze({
  CACHE: 'cache',
  HYDRATION: 'cache-hydration',
});

const CACHE_LOG_MSG = Object.freeze({
  INSERT_ON_EXISTING_KEY_TREAT_UPDATE: 'INSERT on existing key, treating as UPDATE',
  UPDATE_ON_MISSING_KEY_TREAT_INSERT: 'UPDATE on non-existing key, treating as INSERT',
  DELETE_ON_MISSING_KEY_IGNORED: 'DELETE on non-existing key, ignoring',
  STALE_EVENT_IGNORED: 'Ignoring stale CDC event for existing key',
  WRITE_FENCED_BY_TOMBSTONE: 'Rejecting write fenced by DELETE tombstone',
  ANTI_ENTROPY_SWEEP_DELETE: 'Anti-entropy sweep deleted cache-only row',
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
  INITIAL_EPOCH: 0,
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
// Any new system table MUST be classified in src/cache/cdc-table-policy.js.
// Tables without internal propagation stay out of cache hydration snapshots
// and steady-state cache CDC fanout.
// ---------------------------------------------------------------------------

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
  LOGGER_INIT_UNAVAILABLE: 'Cache hydration logger initialization unavailable',
  METRICS_LOG_UNAVAILABLE: 'Cache hydration metrics log unavailable',
});

const CACHE_HYDRATION_ERROR_MSG = Object.freeze({
  MISSING_CDC_EVENT_APPLIER:
    'CacheHydrationService requires explicit cdcEventApplier',
  queryFailed: (tableName) => `Failed to query ${tableName}`,
});

const CACHE_HYDRATION_DEFAULT_OPTIONS = Object.freeze({});
const CACHE_HYDRATION_NOW = () => Date.now();
const CACHE_HYDRATION_METRICS = Object.freeze({
  MS_PER_SECOND: TIME_MS.SECOND,
  ZERO_ROWS_PER_SECOND: 0,
});

const CACHE_HYDRATION_SQL = Object.freeze({
  selectAll: (tableName) => `SELECT * FROM ${tableName}`,
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
  CACHE_HYDRATION_DEFAULT_OPTIONS,
  CACHE_HYDRATION_LOG_MSG,
  CACHE_HYDRATION_METRICS,
  CACHE_HYDRATION_NOW,
  CACHE_HYDRATION_SQL,
  CACHE_HYDRATION_TABLES,
  CACHE_LOG_MSG,
  CACHE_PRIMARY_KEY_FIELDS,
  CACHE_READ_ONLY,
  CACHE_SUBSYSTEM,
  CACHE_SYSTEM_TABLES,
  CDC_NON_PROPAGATED_TABLES,
  CDC_PROPAGATED_TABLES,
};
