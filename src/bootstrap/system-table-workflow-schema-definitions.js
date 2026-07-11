/**
 * Workflow, migration, debug, and storage system table schema definitions.
 */

import {
  COLUMN_TYPE,
  SYSTEM_TABLE_NAME,
} from './system-table-schema-shared-constants.js';

/**
 * SQL transactions system table schema.
 * Stores distributed transaction coordinator state for restart recovery.
 */
const SQL_TRANSACTIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  columns: [
    {name: 'transaction_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'session_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'transaction_epoch', type: COLUMN_TYPE.INTEGER},
    {name: 'timeout_deadline', type: COLUMN_TYPE.INTEGER},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_sql_transactions_session', columns: ['session_id']},
    {name: 'idx_sql_transactions_status', columns: ['status']},
  ],
};

/**
 * SQL transaction participants system table schema.
 * Stores participant partition state for distributed transactions.
 */
const SQL_TRANSACTION_PARTICIPANTS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  columns: [
    {name: 'participant_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'transaction_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'partition_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'last_error', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_sql_tx_participants_tx_partition',
      columns: ['transaction_id', 'partition_id'],
    },
    {
      name: 'idx_sql_tx_participants_partition',
      columns: ['partition_id'],
    },
    {
      name: 'idx_sql_tx_participants_status',
      columns: ['status'],
    },
  ],
};

/**
 * SQL write operations system table schema.
 * Stores idempotent distributed write operation state.
 */
const SQL_WRITE_OPERATIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
  columns: [
    {name: 'operation_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'transaction_id', type: COLUMN_TYPE.TEXT},
    {name: 'statement_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'idempotency_key', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'payload_hash', type: COLUMN_TYPE.TEXT, notNull: true},
    {
      name: 'partition_ids',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {name: 'retry_count', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 0},
    {name: 'last_error', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_sql_write_ops_tx', columns: ['transaction_id']},
    {name: 'idx_sql_write_ops_status', columns: ['status']},
    {
      name: 'idx_sql_write_ops_idempotency',
      columns: ['idempotency_key'],
    },
  ],
};

/**
 * Schema operations system table schema.
 *
 * One row is the atomic schema-intent outbox and the canonical persistence
 * backing for its DurableWorkflowCoordinator record. The scalar workflow
 * fence fields support storage compare-and-swap. workflow_record contains only
 * participant/history details that have no scalar projection, so every
 * workflow fact has one persisted representation.
 */
const SCHEMA_OPERATIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
  columns: [
    {name: 'job_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'record_version', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'row_version', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'workflow_id', type: COLUMN_TYPE.TEXT, notNull: true, unique: true},
    {name: 'owner_key', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'idempotency_key', type: COLUMN_TYPE.TEXT, notNull: true, unique: true},
    {name: 'operation_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'namespace', type: COLUMN_TYPE.TEXT, notNull: true},
    {
      name: 'table_identity_key',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      unique: true,
    },
    {name: 'table_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'table_name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'normalized_ddl', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'intent_version', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'intent_hash', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'schema_revision', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'current_step', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'reason_codes', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'retry_after_ms', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'workflow_record', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'workflow_fence_token', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'workflow_owner_id', type: COLUMN_TYPE.TEXT},
    {name: 'workflow_lease_expires_at', type: COLUMN_TYPE.INTEGER},
    {name: 'attempt_count', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'result_json', type: COLUMN_TYPE.TEXT},
    {name: 'error_code', type: COLUMN_TYPE.TEXT},
    {name: 'error_message', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'completed_at', type: COLUMN_TYPE.INTEGER},
  ],
  indices: [
    {name: 'idx_schema_operations_owner', columns: ['owner_key']},
    {name: 'idx_schema_operations_table', columns: ['table_name']},
    {name: 'idx_schema_operations_status', columns: ['status', 'updated_at']},
    {
      name: 'idx_schema_operations_lease',
      columns: ['workflow_lease_expires_at', 'status'],
    },
  ],
};

/**
 * Schema migrations system table schema.
 * Stores durable migration workflow state for user table schema changes.
 */
const SCHEMA_MIGRATIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SCHEMA_MIGRATIONS,
  columns: [
    {name: 'migration_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'table_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'table_name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'migration_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'source_schema', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'target_schema', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'current_stage', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'error_message', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'completed_at', type: COLUMN_TYPE.INTEGER},
  ],
  indices: [
    {name: 'idx_schema_migrations_table', columns: ['table_id']},
    {name: 'idx_schema_migrations_status', columns: ['status']},
  ],
};

/**
 * Schema migration partitions system table schema.
 * Stores per-partition migration progress for each migration workflow.
 */
const SCHEMA_MIGRATION_PARTITIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS,
  columns: [
    {name: 'migration_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'partition_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'backfill_cursor', type: COLUMN_TYPE.TEXT},
    {name: 'retry_count', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 0},
    {name: 'error_message', type: COLUMN_TYPE.TEXT},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  primaryKey: ['migration_id', 'partition_id'],
  indices: [
    {
      name: 'idx_schema_migration_partitions_status',
      columns: ['migration_id', 'status'],
    },
  ],
};

/**
 * Debug sessions system table schema.
 * Stores tenant-scoped distributed debug session metadata.
 */
const DEBUG_SESSIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.DEBUG_SESSIONS,
  columns: [
    {name: 'session_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'tenant_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'service_name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'lineage_id', type: COLUMN_TYPE.TEXT},
    {name: 'stage_id', type: COLUMN_TYPE.INTEGER},
    {name: 'node_id', type: COLUMN_TYPE.TEXT},
    {name: 'endpoint', type: COLUMN_TYPE.TEXT},
    {
      name: 'status',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'active\'',
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_debug_sessions_tenant',
      columns: ['tenant_id'],
    },
    {
      name: 'idx_debug_sessions_lineage_stage',
      columns: ['lineage_id', 'stage_id'],
    },
    {
      name: 'idx_debug_sessions_service_name',
      columns: ['service_name'],
    },
  ],
};

/**
 * Debug breakpoints system table schema.
 * Stores resolved source breakpoints for a debug session.
 */
const DEBUG_BREAKPOINTS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.DEBUG_BREAKPOINTS,
  columns: [
    {name: 'breakpoint_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'session_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'tenant_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'module_ref', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'source_file_url', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'line_number', type: COLUMN_TYPE.INTEGER, notNull: true},
    {
      name: 'column_number',
      type: COLUMN_TYPE.INTEGER,
      notNull: true,
      defaultValue: 0,
    },
    {name: 'condition', type: COLUMN_TYPE.TEXT},
    {
      name: 'resolved',
      type: COLUMN_TYPE.INTEGER,
      notNull: true,
      defaultValue: 0,
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_debug_breakpoints_session',
      columns: ['session_id'],
    },
    {
      name: 'idx_debug_breakpoints_tenant_session',
      columns: ['tenant_id', 'session_id'],
    },
    {
      name: 'idx_debug_breakpoints_module_source_line',
      columns: ['module_ref', 'source_file_url', 'line_number'],
    },
  ],
};

/**
 * Debug snapshots system table schema.
 * Stores serialized deterministic snapshot artifacts.
 */
const DEBUG_SNAPSHOTS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.DEBUG_SNAPSHOTS,
  columns: [
    {name: 'snapshot_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'session_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'tenant_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'module_ref', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'module_digest', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'captured_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'format_version', type: COLUMN_TYPE.INTEGER, notNull: true},
    {
      name: 'snapshot_bytes_base64',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
    },
    {name: 'manifest_json', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'total_bytes', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'frame_count', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'host_call_count', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_debug_snapshots_session',
      columns: ['session_id'],
    },
    {
      name: 'idx_debug_snapshots_tenant_session',
      columns: ['tenant_id', 'session_id'],
    },
    {
      name: 'idx_debug_snapshots_captured_at',
      columns: ['captured_at'],
    },
  ],
};

/**
 * Storage reservations system table schema.
 * Tracks in-flight storage reservations for admission control.
 * Requirements: 1.2, 2.1, 12.1
 */
const STORAGE_RESERVATIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
  columns: [
    {name: 'reservation_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'operation_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'entity_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'entity_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'partition_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'target_node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'estimated_bytes', type: COLUMN_TYPE.INTEGER, notNull: true},
    {
      name: 'amplification_factor',
      type: COLUMN_TYPE.REAL,
      notNull: true,
      defaultValue: 1,
    },
    {
      name: 'status',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'active\'',
    },
    {name: 'reason_code', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'expires_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'released_at', type: COLUMN_TYPE.INTEGER},
  ],
  indices: [
    {
      name: 'idx_storage_res_node_status',
      columns: ['target_node_id', 'status'],
    },
    {name: 'idx_storage_res_operation', columns: ['operation_id']},
    {
      name: 'idx_storage_res_entity_status',
      columns: ['entity_type', 'entity_id', 'status'],
    },
    {
      name: 'idx_storage_res_expires_status',
      columns: ['expires_at', 'status'],
    },
  ],
};

export {
  SQL_TRANSACTIONS_SCHEMA,
  SQL_TRANSACTION_PARTICIPANTS_SCHEMA,
  SQL_WRITE_OPERATIONS_SCHEMA,
  SCHEMA_OPERATIONS_SCHEMA,
  SCHEMA_MIGRATIONS_SCHEMA,
  SCHEMA_MIGRATION_PARTITIONS_SCHEMA,
  DEBUG_SESSIONS_SCHEMA,
  DEBUG_BREAKPOINTS_SCHEMA,
  DEBUG_SNAPSHOTS_SCHEMA,
  STORAGE_RESERVATIONS_SCHEMA,
};
