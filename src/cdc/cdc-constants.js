import {CDC_OPERATION, NUM} from '../constants/index.js';

const CDC_SUBSYSTEM = Object.freeze({
  INTEGRATION: 'cdc-integration',
});

const CDC_EVENT = Object.freeze({
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
  UPSERT: 'upsert',
  ERROR: 'error',
  EPOCH_CHANGE: 'epochChange',
  NODE_STATE_CHANGE: 'nodeStateChange',
  NODE_JOINED: 'nodeJoined',
});

const CDC_CONFIG_KEY = Object.freeze({
  RETRY_MAX_ATTEMPTS: 'cdc.retryMaxAttempts',
  RETRY_DELAY_MS: 'cdc.retryDelayMs',
  CACHE_WAIT_TIMEOUT_MS: 'cdc.cacheWaitTimeoutMs',
});

const CDC_DEFAULTS = Object.freeze({
  // Leader election / system-cache warmup during bootstrap and node join can take a few seconds.
  // Use retries + backoff to make control-plane writes eventually succeed.
  RETRY_MAX_ATTEMPTS: 6,
  RETRY_DELAY_MS: 100,
  // Wait briefly for CDC to apply to the cache after successful writes.
  CACHE_WAIT_TIMEOUT_MS: 1000,
});

// Config key for the current assignment epoch persisted in the config table.
const CDC_EPOCH_CONFIG_KEY = 'current_epoch';

const CDC_SOURCE = Object.freeze({
  CDC: 'cdc',
});

const CDC_SKIP_REASON = Object.freeze({
  SELF: 'self',
  ALREADY_CONNECTED: 'already_connected',
});

const CDC_RETRY = Object.freeze({
  MIN_ATTEMPTS: NUM.ONE,
  MIN_DELAY_MS: NUM.ZERO,
  BACKOFF_BASE: NUM.TWO,
  MAX_EXPONENT: NUM.SIX,
  MAX_DELAY_MS: 2000,
});

const CDC_SQL = Object.freeze({
  PARAM_PLACEHOLDER: '?',
  COMMA_SPACE: ', ',
  WHERE_AND: ' AND ',
  ASSIGNMENT_PLACEHOLDER: ' = ?',
});

const CDC_SESSION = Object.freeze({
  SYSTEM_WRITE_PREFIX: 'cdc-system-write',
});

const CDC_OPERATION_LABEL = Object.freeze({
  INSERT: CDC_OPERATION.INSERT,
  UPDATE_WHERE: 'UPDATE whereClause',
  UPDATE_DATA: 'UPDATE data',
  DELETE_WHERE: 'DELETE whereClause',
  UPSERT: CDC_OPERATION.UPSERT,
});

const CDC_PRIMARY_KEY = Object.freeze({
  FALLBACK: 'id',
});

const CDC_STATS_DEFAULT = Object.freeze({
  inserts: NUM.ZERO,
  updates: NUM.ZERO,
  deletes: NUM.ZERO,
  failures: NUM.ZERO,
  epochChanges: NUM.ZERO,
  nodeStateChanges: NUM.ZERO,
});

const CDC_LOG_MSG = Object.freeze({
  INITIALIZED: 'CDC integration service initialized',
  SQL_ENGINE_SET: 'SQL query engine set for CDC integration',
  TRANSIENT_SQL_RETRY: 'Transient CDC SQL error, retrying',
  TRANSIENT_SQL_EXCEPTION_RETRY: 'Transient CDC SQL exception, retrying',
  INSERTING_ROW: 'Inserting system table row via SQL',
  INSERTED_ROW: 'System table row inserted',
  INSERT_FAILED: 'Failed to insert system table row',
  UPDATING_ROW: 'Updating system table row via SQL',
  UPDATED_ROW: 'System table row updated',
  UPDATE_FAILED: 'Failed to update system table row',
  DELETING_ROW: 'Deleting system table row via SQL',
  DELETED_ROW: 'System table row deleted',
  DELETE_FAILED: 'Failed to delete system table row',
  UPSERTING_ROW: 'Upserting system table row via SQL',
  UPSERTED_ROW: 'System table row upserted',
  UPSERT_FAILED: 'Failed to upsert system table row',
  EPOCH_MANAGER_SET: 'Epoch manager set for CDC integration',
  EPOCH_MANAGER_MISSING: 'Epoch change CDC received but no epoch manager set',
  EPOCH_PARSE_FAILED: 'Failed to parse epoch data from CDC event',
  EPOCH_CREATE_FAILED: 'Failed to create AssignmentEpoch from CDC data',
  EPOCH_APPLIED: 'Epoch change applied from CDC',
  EPOCH_SKIPPED: 'Epoch change not applied (stale or equal epoch)',
  REBALANCER_SET: 'Rebalancer set for CDC integration',
  NODE_STATE_UNCHANGED: 'Node state unchanged, skipping',
  NODE_STATE_DETECTED: 'Node state change detected via CDC',
  REBALANCER_NOTIFIED: 'Rebalancer notified of node state change',
  REBALANCER_NOTIFY_FAILED: 'Failed to notify rebalancer of node state change',
  REBALANCER_NOT_SET: 'No rebalancer set, skipping rebalancer notification',
  MESSAGE_ROUTER_SET: 'Message router set for CDC mesh connectivity',
  METRICS_LOG_FAILED: 'CDC metrics logging failed',
  BOOTSTRAP_MODE_REQUIRES_PARTITION_MAP:
    'Bootstrap mode requires a Map of local partition services',
  BOOTSTRAP_MODE_ENABLED:
    'Bootstrap mode enabled - writes go directly to local partitions',
  BOOTSTRAP_MODE_DISABLED:
    'Bootstrap mode disabled - writes will route through SQL engine',
  BOOTSTRAP_MODE_REQUIRED_FOR_DIRECT_SQL:
    'executeSQLDirectToLocalPartition can only be called in bootstrap mode',
  NEW_NODE_DETECTED: 'New node detected via CDC, establishing connection',
  NEW_NODE_CONNECTED: 'Connected to new node via CDC event',
  NEW_NODE_CONNECT_FAILED: 'Failed to connect to new node via CDC event',
  NEW_NODE_SKIP_SELF: 'Skipping connection to self node',
  NEW_NODE_SKIP_CONNECTED: 'Skipping already connected node',
  NEW_NODE_MISSING_ADDRESS: 'New node missing address, cannot connect',
});

const CDC_ERROR_MSG = Object.freeze({
  INVALID_TABLE_PREFIX: 'Invalid system table name: ',
  VALID_TABLES_PREFIX: 'Valid tables are: ',
  DATA_REQUIRED_SUFFIX: ' requires data object',
  SCHEMA_MISSING_PREFIX: 'Schema not found for system table: ',
  INSERT_VALID_COLUMNS_PREFIX: 'INSERT requires data with valid columns for ',
  UPDATE_VALID_COLUMNS_PREFIX: 'UPDATE requires data with valid columns for ',
  UPDATE_PRIMARY_KEY_PREFIX: 'UPDATE requires primary key (',
  UPDATE_PRIMARY_KEY_SUFFIX: ') in whereClause',
  DELETE_PRIMARY_KEY_PREFIX: 'DELETE requires primary key (',
  DELETE_PRIMARY_KEY_SUFFIX: ') in whereClause',
  UPSERT_PRIMARY_KEY_PREFIX: 'UPSERT requires primary key (',
  UPSERT_PRIMARY_KEY_SUFFIX: ') in data',
  UPSERT_VALID_COLUMNS_PREFIX: 'UPSERT requires data with valid columns for ',
  CDC_ENGINE_MISSING_PREFIX: 'CDCIntegrationService not properly initialized: ',
  CDC_ENGINE_MISSING_DETAIL: 'sqlQueryEngine not provided',
  INSERT_FAILED: 'Insert failed',
  UPDATE_FAILED: 'Update failed',
  DELETE_FAILED: 'Delete failed',
  UPSERT_FAILED: 'Upsert failed',
  CACHE_WAIT_TIMEOUT: (tableName, key, timeoutMs) =>
    `Cache update not observed for ${tableName}:${key} within ${timeoutMs}ms`,
  INVALID_EVENT: 'Invalid CDC event: event must be an object',
  NOT_EPOCH_CHANGE_PREFIX: 'Not an epoch change event: config_key is ',
  EPOCH_MANAGER_REQUIRED: 'epochManager is required',
  EPOCH_MANAGER_NOT_SET: 'Epoch manager not set',
  EPOCH_DATA_INVALID: 'config_value must be a string or object',
  PARSE_EPOCH_PREFIX: 'Failed to parse epoch data: ',
  CREATE_EPOCH_PREFIX: 'Failed to create epoch: ',
  EPOCH_NOT_APPLIED: 'Epoch not applied (stale or equal to current)',
  REBALANCER_REQUIRED: 'rebalancer is required',
  NOT_NODES_TABLE_PREFIX: 'Not a nodes table event: tableName is ',
  NODE_ID_MISSING: 'Missing node_id in CDC event data',
  NODE_STATUS_MISSING: 'Missing status in CDC event data',
  MESSAGE_ROUTER_REQUIRED: 'messageRouter is required',
  NOT_INSERT_OPERATION: 'Not an INSERT operation',
  MESSAGE_ROUTER_NOT_SET: 'Message router not set',
  BOOTSTRAP_REENTRY_FORBIDDEN:
    'Cannot re-enable bootstrap mode after it has been cleared',
});

export {
  CDC_CONFIG_KEY,
  CDC_DEFAULTS,
  CDC_EPOCH_CONFIG_KEY,
  CDC_EVENT,
  CDC_ERROR_MSG,
  CDC_LOG_MSG,
  CDC_OPERATION_LABEL,
  CDC_PRIMARY_KEY,
  CDC_RETRY,
  CDC_SESSION,
  CDC_SKIP_REASON,
  CDC_SOURCE,
  CDC_SQL,
  CDC_STATS_DEFAULT,
  CDC_SUBSYSTEM,
};
