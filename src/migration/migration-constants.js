const MIGRATION_STATUS = Object.freeze({
  PENDING: 'pending',
  DUAL_WRITE: 'dual_write',
  DUAL_WRITE_COMPLETE: 'dual_write_complete',
  BACKFILL: 'backfill',
  BACKFILL_COMPLETE: 'backfill_complete',
  CUTOVER_PENDING: 'cutover_pending',
  COMPLETED: 'completed',
  CANCELLING: 'cancelling',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
});

const MIGRATION_TYPE = Object.freeze({
  ADD_COLUMN: 'add_column',
  DROP_COLUMN: 'drop_column',
  RENAME_COLUMN: 'rename_column',
  ALTER_COLUMN_TYPE: 'alter_column_type',
});

const MIGRATION_STAGE_ORDER = Object.freeze([
  MIGRATION_STATUS.PENDING,
  MIGRATION_STATUS.DUAL_WRITE,
  MIGRATION_STATUS.DUAL_WRITE_COMPLETE,
  MIGRATION_STATUS.BACKFILL,
  MIGRATION_STATUS.BACKFILL_COMPLETE,
  MIGRATION_STATUS.CUTOVER_PENDING,
  MIGRATION_STATUS.COMPLETED,
]);

const MIGRATION_CANCELLABLE_STAGES = Object.freeze(new Set([
  MIGRATION_STATUS.PENDING,
  MIGRATION_STATUS.DUAL_WRITE,
  MIGRATION_STATUS.DUAL_WRITE_COMPLETE,
  MIGRATION_STATUS.BACKFILL,
  MIGRATION_STATUS.BACKFILL_COMPLETE,
]));

const MIGRATION_TERMINAL_STATUSES = Object.freeze(new Set([
  MIGRATION_STATUS.COMPLETED,
  MIGRATION_STATUS.CANCELLED,
  MIGRATION_STATUS.FAILED,
]));

const MIGRATION_DEFAULT = Object.freeze({
  BACKFILL_BATCH_SIZE: 100,
  MAX_RETRY_COUNT: 3,
  RETRY_BASE_DELAY_MS: 100,
  RETRY_MAX_DELAY_MS: 5000,
  TIMEOUT_BUDGET_MS: 300000,
});

const MIGRATION_LOG_MSG = Object.freeze({
  STAGE_TRANSITION: 'Schema migration stage transition',
  MIGRATION_INITIATED: 'Schema migration initiated',
  MIGRATION_RECOVERED: 'Schema migration recovered',
  PARTITION_RETRY: 'Schema migration partition operation retry',
  CUTOVER_RETRY: 'Schema migration cutover retry',
  MIGRATION_CANCELLED: 'Schema migration cancelled',
});

const MIGRATION_ERROR_MSG = Object.freeze({
  SQL_CORE_REQUIRED: 'MigrationCoordinator requires sqlCore',
  SYSTEM_TABLE_CACHE_REQUIRED: 'MigrationCoordinator requires systemTableCache',
  MIGRATION_NOT_FOUND: 'Migration not found',
  ACTIVE_MIGRATION_CONFLICT_PREFIX: 'Active migration already exists for table: ',
  UNSUPPORTED_MIGRATION_TYPE_PREFIX: 'Unsupported migration type: ',
  INVALID_STAGE_TRANSITION_PREFIX: 'Invalid migration stage transition: ',
  NOT_CANCELLABLE_PREFIX: 'Migration cannot be cancelled in stage: ',
  RETRY_EXHAUSTED: 'Migration retry budget exhausted',
});

const MIGRATION_COLUMN = Object.freeze({
  MIGRATION_ID: 'migration_id',
  TABLE_ID: 'table_id',
  TABLE_NAME: 'table_name',
  MIGRATION_TYPE: 'migration_type',
  SOURCE_SCHEMA: 'source_schema',
  TARGET_SCHEMA: 'target_schema',
  STATUS: 'status',
  CURRENT_STAGE: 'current_stage',
  ERROR_MESSAGE: 'error_message',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  COMPLETED_AT: 'completed_at',
  PARTITION_ID: 'partition_id',
  BACKFILL_CURSOR: 'backfill_cursor',
  RETRY_COUNT: 'retry_count',
});

const MIGRATION_PARTITION_OPERATION = Object.freeze({
  ALTER_TABLE: 'alter_table',
});

export {
  MIGRATION_STATUS,
  MIGRATION_TYPE,
  MIGRATION_STAGE_ORDER,
  MIGRATION_CANCELLABLE_STAGES,
  MIGRATION_TERMINAL_STATUSES,
  MIGRATION_DEFAULT,
  MIGRATION_LOG_MSG,
  MIGRATION_ERROR_MSG,
  MIGRATION_COLUMN,
  MIGRATION_PARTITION_OPERATION,
};
