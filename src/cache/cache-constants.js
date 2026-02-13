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

const CACHE_SYSTEM_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.PARTITIONS,
  TABLES.TABLES,
  TABLES.SERVICES,
  TABLES.REPLICA_OPERATIONS,
  TABLES.MESSAGE_GROUPS,
  TABLES.INDICES,
  TABLES.CONTEXTS,
  TABLES.CODE,
  TABLES.CONFIG,
  TABLES.LOGS,
  TABLES.LIVE_QUERIES,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICE_DEFINITIONS,
  TABLES.SERVICE_ENDPOINTS,
  TABLES.SERVICE_TIMERS,
  TABLES.MODULE_MANIFESTS,
  TABLES.PACKAGE_REGISTRY_MAPPINGS,
  TABLES.PACKAGE_REGISTRY_OVERRIDES,
  TABLES.MODULE_DEPENDENCY_LOCKS,
  TABLES.WASM_OPERATIONS,
  TABLES.STORAGE_RESERVATIONS,
  TABLES.LATENCY_GROUPS,
  TABLES.INTER_GROUP_LATENCIES,
]);

const CACHE_DEFAULT_SYNC_EXCLUDED_TABLES = Object.freeze([
  // Logs are intentionally excluded from default cache sync due high cardinality.
  TABLES.LOGS,
]);

const CACHE_PRIMARY_KEY_FIELDS = SYSTEM_CACHE_KEY_DESCRIPTOR;

const CACHE_CDC_OPERATIONS = CDC_OPERATION;

// Explicit default hydration/subscription treatment:
// all system tables are synced except CACHE_DEFAULT_SYNC_EXCLUDED_TABLES.
// Latency topology tables remain included by default so join/bootstrap flows
// always receive topology metadata snapshots through the canonical path.
const CACHE_HYDRATION_TABLES = Object.freeze(
  CACHE_SYSTEM_TABLES.filter((tableName) =>
    !CACHE_DEFAULT_SYNC_EXCLUDED_TABLES.includes(tableName),
  ),
);

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
};
