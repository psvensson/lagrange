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
  INDEX_CONFIG_KEY,
  INDEX_COST,
  INDEX_DEFAULTS,
  INDEX_ERROR_MSG,
  INDEX_HINT,
  INDEX_LOG_MSG,
  INDEX_PRIORITY,
  INDEX_SUBSYSTEM,
  INDEX_TYPE,
  INDEX_USAGE,
};
