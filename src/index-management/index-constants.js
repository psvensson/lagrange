import {CONFIG_KEY} from '../config/config-constants.js';

const INDEX_SUBSYSTEM = Object.freeze({
  INDEX_SERVICE: 'index-service',
  QUERY_OPTIMIZER: 'query-optimizer',
});

const INDEX_LOG_MSG = Object.freeze({
  SERVICE_INITIALIZING: 'Initializing index service',
  SERVICE_INITIALIZED: 'Index service initialized',
  INDICES_LOADED: 'Loaded indices from cache',
  INDICES_LOAD_FAILED: 'Failed to load indices from cache',
  CREATING_INDEX: 'Creating index',
  INDEX_CREATED: 'Index created successfully',
  NO_PARTITIONS_FOR_TABLE: 'No partitions found for table',
  CREATING_SQLITE_INDEX: 'Creating SQLite index on partitions',
  PARTITION_INDEX_FAILED: 'Failed to create index on partition',
  SQLITE_INDEX_COMPLETED: 'SQLite index creation completed',
  DROPPING_INDEX: 'Dropping index',
  INDEX_DROPPED: 'Index dropped successfully',
  INDEX_DROP_FAILED: 'Failed to drop index on partition',
  INDEX_ADDED_FROM_CDC: 'Index added to cache via CDC',
  INDEX_REMOVED_FROM_CDC: 'Index removed from cache via CDC',
  CREATING_INDICES_FOR_PARTITION: 'Creating indices on new partition',
  PARTITION_NOT_FOUND: 'Partition not found for index creation',
  INDEX_CREATED_ON_PARTITION: 'Index created on partition',
  ENSURING_INDICES: 'Ensuring indices on partition',
  REBUILDING_INDEX: 'Rebuilding index',
  INDEX_REBUILD_FAILED: 'Failed to rebuild index on partition',
  SHUTTING_DOWN: 'Shutting down index service',
  EXECUTION_PLAN_GENERATED: 'Generated execution plan',
  GLOBAL_INDEX_BACKFILL_FAILED: 'Global index backfill failed',
  CHECKPOINT_UPDATE_FAILED: 'Secondary checkpoint update failed during error handling',
  RESOLVE_TABLE_ID_FAILED: 'Failed to resolve tableId for tableName from system table',
  FIND_INDEX_FAILED: 'Failed to find index by name from system table',
});

const INDEX_ERROR_MSG = Object.freeze({
  TABLE_ID_REQUIRED: 'tableId is required',
  INDEX_NAME_REQUIRED: 'indexName is required',
  COLUMN_NAMES_REQUIRED: 'columnNames is required and must not be empty',
  SYSTEM_TABLE_CACHE_REQUIRED: 'IndexService requires systemTableCache',
  INDEX_ALREADY_EXISTS_PREFIX: 'Index \'',
  INDEX_ALREADY_EXISTS_MIDDLE: '\' already exists on table \'',
  INDEX_ALREADY_EXISTS_SUFFIX: '\'',
  INDEX_NOT_FOUND_PREFIX: 'Index \'',
  INDEX_NOT_FOUND_MIDDLE: '\' not found on table \'',
  INDEX_NOT_FOUND_SUFFIX: '\'',
  UNSUPPORTED_SQL_FEATURE: 'UNSUPPORTED_SQL_FEATURE',
});

const GLOBAL_INDEX_STATE = Object.freeze({
  CREATING: 'CREATING',
  WRITE_ONLY: 'WRITE_ONLY',
  BACKFILLING: 'BACKFILLING',
  READ_WRITE: 'READ_WRITE',
  DROPPING: 'DROPPING',
  FAILED: 'FAILED',
});

const GLOBAL_INDEX_SQL_STATE = Object.freeze({
  FEATURE_NOT_SUPPORTED: '0A000',
});

const GLOBAL_INDEX_ERROR_MSG = Object.freeze({
  CROSS_PARTITION_UNIQUE_DEFERRED:
    'Cross-partition unique indexes remain deferred in Release 0.3',
  INVALID_STATE_TRANSITION:
    'Invalid global index state transition: ',
  TABLE_NAME_REQUIRED: 'table_name is required for global secondary index',
  INDEX_NAME_REQUIRED: 'index_name is required for global secondary index',
  COLUMN_NAMES_REQUIRED: 'column_names is required for global secondary index',
});

const GLOBAL_INDEX_ACCESS_PATH = Object.freeze({
  GLOBAL_SECONDARY_INDEX: 'GLOBAL_SECONDARY_INDEX',
  SCATTER_GATHER: 'SCATTER_GATHER',
  BASE_PRIMARY_KEY: 'BASE_PRIMARY_KEY',
});

const INDEX_REJECTION_REASON = Object.freeze({
  NONE: 'NONE',
  MISSING_LEADING_COLUMN: 'MISSING_LEADING_COLUMN',
  NON_READABLE_INDEX_STATE: 'NON_READABLE_INDEX_STATE',
  HIGHER_COST_OR_SHORTER_PREFIX: 'HIGHER_COST_OR_SHORTER_PREFIX',
  INDEX_NOT_READ_WRITE: 'INDEX_NOT_READ_WRITE',
  PREFIX_NOT_MATCHED: 'PREFIX_NOT_MATCHED',
  NO_INDEX_AVAILABLE: 'NO_INDEX_AVAILABLE',
});

const INDEX_READABLE_STATE = Object.freeze({
  READABLE: 'READABLE',
  ACTIVE: 'ACTIVE',
  READY: 'READY',
});

const GLOBAL_INDEX_DATASET_PREFIX = '__idx_';
const BASE_PARTITION_ID_COLUMN = '__base_partition_id';
const BASE_PK_COLUMN_PREFIX = '__base_pk_';

const INDEX_MAINTENANCE_OPERATION = Object.freeze({
  INSERT: 'INSERT',
  DELETE: 'DELETE',
});

const INDEX_USAGE = Object.freeze({
  WHERE: 'where',
  ORDER_BY: 'order_by',
  JOIN: 'join',
});

const INDEX_COST = Object.freeze({
  FULL_SCAN: 'full_scan',
  INDEX_SCAN: 'index_scan',
});

const INDEX_PRIORITY = Object.freeze({
  HIGH: 'high',
  MEDIUM: 'medium',
});

const INDEX_HINT = Object.freeze({
  WHERE_PREFIX: 'Consider creating an index on WHERE columns: ',
  WHERE_GENERIC_PREFIX: 'Consider creating an index on columns: ',
  ORDER_BY_PREFIX: 'Consider creating an index on ORDER BY columns: ',
  JOIN_PREFIX: 'Consider creating an index on JOIN columns: ',
});

const INDEX_TYPE = Object.freeze({
  BTREE: 'btree',
  HASH: 'hash',
});

const INDEX_CONFIG_KEY = Object.freeze({
  DEFAULT_TYPE: CONFIG_KEY.INDEX_DEFAULT_TYPE,
});

const INDEX_DEFAULTS = Object.freeze({
  DEFAULT_TYPE: INDEX_TYPE.BTREE,
});

export {
  BASE_PARTITION_ID_COLUMN,
  BASE_PK_COLUMN_PREFIX,
  GLOBAL_INDEX_ACCESS_PATH,
  GLOBAL_INDEX_DATASET_PREFIX,
  GLOBAL_INDEX_ERROR_MSG,
  GLOBAL_INDEX_SQL_STATE,
  GLOBAL_INDEX_STATE,
  INDEX_CONFIG_KEY,
  INDEX_COST,
  INDEX_DEFAULTS,
  INDEX_ERROR_MSG,
  INDEX_HINT,
  INDEX_LOG_MSG,
  INDEX_MAINTENANCE_OPERATION,
  INDEX_PRIORITY,
  INDEX_READABLE_STATE,
  INDEX_REJECTION_REASON,
  INDEX_SUBSYSTEM,
  INDEX_TYPE,
  INDEX_USAGE,
};
