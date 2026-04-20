/**
 * System Table Schemas - Hard-coded schemas for bootstrap.
 * Defines schemas for all system tables to avoid circular dependencies.
 * Requirements: 6.1, 6.2, 6.5, 14.6, 14.7, 31.3, 31.4
 */

import {TABLES} from '../constants/index.js';
import {
  SD_COL,
  SERVICE_DEFINITION_COLUMN_LIST,
} from '../wasm-service/wasm-service-models.js';
import {
  LATENCY_ASSIGNMENT_STATE,
  LATENCY_GROUP_STATE,
} from '../topology/latency-topology-constants.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from './system-table-schema-sql.js';

/**
 * Column type definitions for schema.
 */
const COLUMN_TYPE = {
  TEXT: 'TEXT',
  INTEGER: 'INTEGER',
  REAL: 'REAL',
  BOOLEAN: 'INTEGER', // SQLite uses INTEGER for boolean
};

/**
 * System table names.
 */
const SYSTEM_TABLE_NAME = {
  TABLES: TABLES.TABLES,
  PARTITIONS: TABLES.PARTITIONS,
  INDICES: TABLES.INDICES,
  MESSAGE_GROUPS: TABLES.MESSAGE_GROUPS,
  NODES: TABLES.NODES,
  SERVICES: TABLES.SERVICES,
  LOGS: TABLES.LOGS,
  CONFIG: TABLES.CONFIG,
  LIVE_QUERIES: TABLES.LIVE_QUERIES,
  CONTEXTS: TABLES.CONTEXTS,
  CODE: TABLES.CODE,
  CONTROL_PLANE_PUBLICATIONS: TABLES.CONTROL_PLANE_PUBLICATIONS,
  REPLICA_OPERATIONS: TABLES.REPLICA_OPERATIONS,
  NODE_ENDPOINTS: TABLES.NODE_ENDPOINTS,
  SERVICE_DEFINITIONS: TABLES.SERVICE_DEFINITIONS,
  SERVICE_ENDPOINTS: TABLES.SERVICE_ENDPOINTS,
  SERVICE_TIMERS: TABLES.SERVICE_TIMERS,
  MODULE_MANIFESTS: TABLES.MODULE_MANIFESTS,
  PACKAGE_REGISTRY_MAPPINGS: TABLES.PACKAGE_REGISTRY_MAPPINGS,
  PACKAGE_REGISTRY_OVERRIDES: TABLES.PACKAGE_REGISTRY_OVERRIDES,
  MODULE_DEPENDENCY_LOCKS: TABLES.MODULE_DEPENDENCY_LOCKS,
  WASM_OPERATIONS: TABLES.WASM_OPERATIONS,
  SQL_TRANSACTIONS: TABLES.SQL_TRANSACTIONS,
  SQL_TRANSACTION_PARTICIPANTS: TABLES.SQL_TRANSACTION_PARTICIPANTS,
  SQL_WRITE_OPERATIONS: TABLES.SQL_WRITE_OPERATIONS,
  SCHEMA_MIGRATIONS: TABLES.SCHEMA_MIGRATIONS,
  SCHEMA_MIGRATION_PARTITIONS: TABLES.SCHEMA_MIGRATION_PARTITIONS,
  DEBUG_SESSIONS: TABLES.DEBUG_SESSIONS,
  DEBUG_BREAKPOINTS: TABLES.DEBUG_BREAKPOINTS,
  DEBUG_SNAPSHOTS: TABLES.DEBUG_SNAPSHOTS,
  STORAGE_RESERVATIONS: TABLES.STORAGE_RESERVATIONS,
  LATENCY_GROUPS: TABLES.LATENCY_GROUPS,
  INTER_GROUP_LATENCIES: TABLES.INTER_GROUP_LATENCIES,
};

/**
 * Tables system table schema.
 * Stores metadata about all tables in the system.
 */
const TABLES_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.TABLES,
  columns: [
    {name: 'table_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'table_name', type: COLUMN_TYPE.TEXT, notNull: true, unique: true},
    {name: 'schema_definition', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'partition_key', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'table_policies', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'{}\''},
    {name: 'partition_count', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 1},
    {
      name: 'active_partition_version',
      type: COLUMN_TYPE.INTEGER,
      notNull: true,
      defaultValue: 1,
    },
    {name: 'pending_partition_version', type: COLUMN_TYPE.INTEGER},
    {name: 'partition_transition_state', type: COLUMN_TYPE.TEXT},
    {name: 'partition_transition_metadata', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_tables_name', columns: ['table_name']},
  ],
};

/**
 * Partitions system table schema.
 * Stores metadata about all partitions in the system.
 */
const PARTITIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.PARTITIONS,
  columns: [
    {name: 'partition_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'table_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'table_name', type: COLUMN_TYPE.TEXT},
    {name: 'partition_key_start', type: COLUMN_TYPE.TEXT},
    {name: 'partition_key_end', type: COLUMN_TYPE.TEXT},
    {
      name: 'partition_version',
      type: COLUMN_TYPE.INTEGER,
      notNull: true,
      defaultValue: 1,
    },
    {name: 'replica_count', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 3},
    {name: 'size_bytes', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 0},
    {name: 'leader_node_id', type: COLUMN_TYPE.TEXT},
    {name: 'state', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'NORMAL\''},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_partitions_table', columns: ['table_id']},
    {name: 'idx_partitions_leader', columns: ['leader_node_id']},
  ],
};

/**
 * Indices system table schema.
 * Stores metadata about all indices in the system.
 */
const INDICES_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.INDICES,
  columns: [
    {name: 'index_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'table_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'index_name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'column_names', type: COLUMN_TYPE.TEXT, notNull: true}, // JSON array
    {name: 'index_type', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'btree\''},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_indices_table', columns: ['table_id']},
  ],
};

/**
 * Message groups system table schema.
 * Stores metadata about all message groups in the system.
 */
const MESSAGE_GROUPS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
  columns: [
    {name: 'group_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'group_name', type: COLUMN_TYPE.TEXT, notNull: true, unique: true},
    {name: 'replica_count', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 3},
    {name: 'leader_node_id', type: COLUMN_TYPE.TEXT},
    {name: 'policy', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'{}\''},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_message_groups_name', columns: ['group_name']},
  ],
};

/**
 * Nodes system table schema.
 * Stores metadata about all nodes in the cluster.
 */
const NODES_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.NODES,
  columns: [
    {name: 'node_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'node_address', type: COLUMN_TYPE.TEXT, notNull: true, unique: true},
    {name: 'cpu_cores', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'memory_mb', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'disk_gb', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'cpu_usage_percent', type: COLUMN_TYPE.REAL, defaultValue: 0},
    {name: 'memory_usage_percent', type: COLUMN_TYPE.REAL, defaultValue: 0},
    {name: 'disk_usage_percent', type: COLUMN_TYPE.REAL, defaultValue: 0},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'active\''},
    {
      name: 'connection_state',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'disconnected\'',
    },
    {name: 'capabilities', type: COLUMN_TYPE.TEXT, defaultValue: '\'[]\''},
    {name: 'last_heartbeat', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'ready_lease_expires_at', type: COLUMN_TYPE.INTEGER},
    {name: 'storage_budget_bytes', type: COLUMN_TYPE.INTEGER},
    {name: 'storage_budget_source', type: COLUMN_TYPE.TEXT},
    {name: 'storage_budget_updated_at', type: COLUMN_TYPE.INTEGER},
    {name: 'latency_group_id', type: COLUMN_TYPE.TEXT},
    {name: 'last_latency_check_at', type: COLUMN_TYPE.INTEGER},
    {
      name: 'latency_assignment_state',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: `'${LATENCY_ASSIGNMENT_STATE.UNASSIGNED}'`,
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_nodes_address', columns: ['node_address']},
    {name: 'idx_nodes_status', columns: ['status']},
    {name: 'idx_nodes_latency_group', columns: ['latency_group_id']},
  ],
};

/**
 * Latency groups system table schema.
 * Stores persisted metadata for latency-group membership ownership.
 */
const LATENCY_GROUPS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.LATENCY_GROUPS,
  columns: [
    {name: 'group_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'representative_node_id', type: COLUMN_TYPE.TEXT},
    {name: 'coordinator_node_id', type: COLUMN_TYPE.TEXT},
    {
      name: 'state',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: `'${LATENCY_GROUP_STATE.ACTIVE}'`,
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_latency_groups_rep_node', columns: ['representative_node_id']},
    {name: 'idx_latency_groups_coord_node', columns: ['coordinator_node_id']},
    {name: 'idx_latency_groups_state', columns: ['state']},
  ],
};

/**
 * Inter-group latencies system table schema.
 * Stores RTT sample aggregates between latency-group representatives.
 */
const INTER_GROUP_LATENCIES_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.INTER_GROUP_LATENCIES,
  columns: [
    {name: 'latency_edge_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'source_group_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'target_group_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'latency_ms', type: COLUMN_TYPE.REAL, notNull: true},
    {name: 'sample_count', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 1},
    {name: 'sample_quality', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'good\''},
    {name: 'last_measured_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_inter_group_latencies_source_target',
      columns: ['source_group_id', 'target_group_id'],
    },
    {name: 'idx_inter_group_latencies_measured', columns: ['last_measured_at']},
  ],
};

/**
 * Services system table schema.
 * Stores metadata about all services in the system.
 * Includes raft_role column for Raft-based services (Req 14.6, 14.7).
 * Includes state machine tracking columns (Req 4.1).
 */
const SERVICES_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICES,
  columns: [
    {name: 'service_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'service_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'partition_id', type: COLUMN_TYPE.TEXT},
    {name: 'group_id', type: COLUMN_TYPE.TEXT},
    {name: 'replica_id', type: COLUMN_TYPE.TEXT},
    {name: 'raft_role', type: COLUMN_TYPE.TEXT}, // leader, follower, candidate
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'active\''},
    // Timestamp when current state was entered
    {name: 'state_entered_at', type: COLUMN_TYPE.INTEGER},
    {name: 'previous_state', type: COLUMN_TYPE.TEXT}, // Previous state for debugging
    {name: 'trigger_reason', type: COLUMN_TYPE.TEXT}, // What triggered current state
    {name: 'error_message', type: COLUMN_TYPE.TEXT}, // Error if in failed state
    {name: 'address', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_services_node', columns: ['node_id']},
    {name: 'idx_services_partition', columns: ['partition_id']},
    {name: 'idx_services_group', columns: ['group_id']},
    {name: 'idx_services_type', columns: ['service_type']},
    {name: 'idx_services_raft_role', columns: ['raft_role']},
    {name: 'idx_services_status', columns: ['status']},
  ],
};

/**
 * Logs system table schema.
 * Stores structured log entries.
 */
const LOGS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.LOGS,
  columns: [
    {name: 'log_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'timestamp', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'level', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'service_id', type: COLUMN_TYPE.TEXT},
    {name: 'service_type', type: COLUMN_TYPE.TEXT},
    {name: 'message', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'trace_id', type: COLUMN_TYPE.TEXT},
    {name: 'metadata', type: COLUMN_TYPE.TEXT}, // JSON
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_logs_timestamp', columns: ['timestamp']},
    {name: 'idx_logs_level', columns: ['level']},
    {name: 'idx_logs_node', columns: ['node_id']},
    {name: 'idx_logs_trace', columns: ['trace_id']},
  ],
};

/**
 * Config system table schema.
 * Stores dynamic configuration key-value pairs.
 */
const CONFIG_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.CONFIG,
  columns: [
    {name: 'config_key', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'config_value', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'value_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'requires_restart', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 0},
    {name: 'description', type: COLUMN_TYPE.TEXT},
    {name: 'default_value', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'updated_by', type: COLUMN_TYPE.TEXT},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_config_requires_restart', columns: ['requires_restart']},
  ],
};

/**
 * Live queries system table schema.
 * Stores metadata about active live query subscriptions for monitoring.
 * Requirements: 33.18, 33.20
 */
const LIVE_QUERIES_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.LIVE_QUERIES,
  columns: [
    {name: 'query_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'table_name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'predicate_hash', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'predicate_sql', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'partition_key_value', type: COLUMN_TYPE.TEXT},
    {name: 'client_count', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 0},
    {name: 'node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'last_activity_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_live_queries_table', columns: ['table_name']},
    {name: 'idx_live_queries_activity', columns: ['last_activity_at']},
    {name: 'idx_live_queries_node', columns: ['node_id']},
  ],
};

/**
 * Contexts system table schema.
 * Stores named state for external function executors.
 * Requirements: 34.1, 34.2, 34.3
 */
const CONTEXTS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.CONTEXTS,
  columns: [
    {name: 'context_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'context_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'context_name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'context_data', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'owner_id', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_contexts_type', columns: ['context_type']},
    {name: 'idx_contexts_owner', columns: ['owner_id']},
    {name: 'idx_contexts_type_name', columns: ['context_type', 'context_name']},
  ],
};

/**
 * Code system table schema.
 * Reserved schema for storing function definitions (implementation deferred).
 * Requirements: 34.4, 34.5, 34.18
 */
const CODE_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.CODE,
  columns: [
    {name: 'function_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'function_name', type: COLUMN_TYPE.TEXT, notNull: true, unique: true},
    {name: 'version', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 1},
    {name: 'executor_type', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'wasm\''},
    {name: 'code_blob', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'signature', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'permissions', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'[]\''},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_code_name', columns: ['function_name']},
    {name: 'idx_code_type', columns: ['executor_type']},
  ],
};


const CONTROL_PLANE_PUBLICATIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  columns: [
    {name: 'publication_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'publication_kind', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'publication_epoch', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'publisher_node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'source_topology_epoch', type: COLUMN_TYPE.INTEGER},
    {name: 'source_snapshot_version', type: COLUMN_TYPE.INTEGER},
    {name: 'published_active_node_ids', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'required_ack_node_ids', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'acknowledged_node_ids', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'priority_partition_summary', type: COLUMN_TYPE.TEXT},
    {name: 'membership_lifecycle_summary', type: COLUMN_TYPE.TEXT},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'reason_code', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'published_at', type: COLUMN_TYPE.INTEGER},
    {name: 'closed_at', type: COLUMN_TYPE.INTEGER},
    {name: 'transition_history', type: COLUMN_TYPE.TEXT, notNull: true},
  ],
  indices: [
    {
      name: 'idx_control_plane_publications_kind_epoch',
      columns: ['publication_kind', 'publication_epoch'],
    },
    {
      name: 'idx_control_plane_publications_status_updated',
      columns: ['status', 'updated_at'],
    },
  ],
};
/**
 * Replica operations system table schema.
 * Stores persistent log of all replica operations for debugging and recovery.
 * Requirements: 9.1, 9.2
 */
const REPLICA_OPERATIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  columns: [
    {name: 'operation_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'type', type: COLUMN_TYPE.TEXT, notNull: true}, // 'ADD' or 'REMOVE'
    {name: 'partition_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'entity_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'entity_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'replica_id', type: COLUMN_TYPE.TEXT},
    {name: 'source_node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'target_node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true}, // ReplicaStatus value
    {name: 'workflow_step', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'completed_at', type: COLUMN_TYPE.INTEGER},
    {name: 'lease_expires_at', type: COLUMN_TYPE.INTEGER},
    {name: 'error_message', type: COLUMN_TYPE.TEXT},
    {name: 'steps_history', type: COLUMN_TYPE.TEXT, notNull: true}, // JSON array
  ],
  indices: [
    {name: 'idx_replica_ops_status', columns: ['status']},
    {name: 'idx_replica_ops_partition', columns: ['partition_id']},
    {name: 'idx_replica_ops_entity', columns: ['entity_type', 'entity_id']},
    {
      name: 'idx_replica_ops_source_step_type',
      columns: ['source_node_id', 'workflow_step', 'type'],
    },
    {
      name: 'idx_replica_ops_target_step_type',
      columns: ['target_node_id', 'workflow_step', 'type'],
    },
    {
      name: 'idx_replica_ops_partition_target',
      columns: ['partition_id', 'target_node_id'],
    },
    {name: 'idx_replica_ops_created', columns: ['created_at']},
  ],
};

/**
 * Node endpoints system table schema.
 * Stores transport endpoints for nodes (WebSocket, NATS, Veilid, etc.).
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
const NODE_ENDPOINTS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
  columns: [
    {name: 'endpoint_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'transport_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'address', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'priority', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 0},
    {name: 'metadata', type: COLUMN_TYPE.TEXT},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'active\''},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_node_endpoints_node', columns: ['node_id']},
    {name: 'idx_node_endpoints_type', columns: ['transport_type']},
    {name: 'idx_node_endpoints_status', columns: ['status']},
  ],
};

/**
 * Service definitions system table schema.
 * Stores metadata about replicated service definitions.
 * Supports unified runtime model (native_js, wasm_component, oci_container).
 * Requirements: 5.1, 5.5, 12.3, 12.4, 12.5
 */
const SERVICE_DEFINITION_COLUMN_SPEC = Object.freeze({
  [SD_COL.SERVICE_ID]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    primaryKey: true,
  }),
  [SD_COL.SERVICE_NAME]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    unique: true,
  }),
  [SD_COL.SERVICE_PROFILE]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'default\'',
  }),
  [SD_COL.HANDLER_FUNCTION_ID]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
  }),
  [SD_COL.READ_CONSISTENCY]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'strong\'',
  }),
  [SD_COL.WRITE_CONSISTENCY]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'strong\'',
  }),
  [SD_COL.REPLICA_COUNT]: Object.freeze({
    type: COLUMN_TYPE.INTEGER,
    notNull: true,
    defaultValue: 3,
  }),
  [SD_COL.PROTOCOL]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'websocket\'',
  }),
  [SD_COL.RESOURCE_BUDGET]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'{}\'',
  }),
  [SD_COL.SAFETY_INTERVAL_MS]: Object.freeze({
    type: COLUMN_TYPE.INTEGER,
    notNull: true,
    defaultValue: 500,
  }),
  [SD_COL.RUNTIME_KIND]: Object.freeze({type: COLUMN_TYPE.TEXT}),
  [SD_COL.RUNTIME_REF]: Object.freeze({type: COLUMN_TYPE.TEXT}),
  [SD_COL.RUNTIME_CONFIG]: Object.freeze({type: COLUMN_TYPE.TEXT}),
  [SD_COL.STATUS]: Object.freeze({
    type: COLUMN_TYPE.TEXT,
    notNull: true,
    defaultValue: '\'active\'',
  }),
  [SD_COL.CREATED_AT]: Object.freeze({
    type: COLUMN_TYPE.INTEGER,
    notNull: true,
  }),
  [SD_COL.UPDATED_AT]: Object.freeze({
    type: COLUMN_TYPE.INTEGER,
    notNull: true,
  }),
});

/**
 * Build canonical service_definitions column descriptors from the shared
 * service-definition column list.
 * @return {Array<Object>} Ordered schema column descriptors.
 */
function createServiceDefinitionColumns() {
  return SERVICE_DEFINITION_COLUMN_LIST.map((columnName) => {
    const spec = SERVICE_DEFINITION_COLUMN_SPEC[columnName];
    if (!spec) {
      throw new Error(
        `Missing schema spec for service_definitions column: ${columnName}`,
      );
    }
    return {
      name: columnName,
      ...spec,
    };
  });
}

const SERVICE_DEFINITIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
  columns: createServiceDefinitionColumns(),
  indices: [
    {name: 'idx_svc_def_name', columns: [SD_COL.SERVICE_NAME]},
    {name: 'idx_svc_def_handler', columns: [SD_COL.HANDLER_FUNCTION_ID]},
    {name: 'idx_svc_def_status', columns: [SD_COL.STATUS]},
    {name: 'idx_svc_def_runtime_kind', columns: [SD_COL.RUNTIME_KIND]},
  ],
};

/**
 * Service endpoints system table schema.
 * Stores externally reachable endpoints for WASM service replicas.
 * Requirements: 12.3, 12.4, 12.5
 */
const SERVICE_ENDPOINTS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS,
  columns: [
    {name: 'endpoint_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'service_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'node_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'protocol', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'address', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'port', type: COLUMN_TYPE.INTEGER, notNull: true},
    {
      name: 'health_status',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'healthy\'',
    },
    {name: 'metadata', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'{}\''},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_svc_ep_service', columns: ['service_id']},
    {name: 'idx_svc_ep_node', columns: ['node_id']},
    {name: 'idx_svc_ep_health', columns: ['health_status']},
  ],
};

/**
 * Service timers system table schema.
 * Stores persistent timer entries for WASM service groups.
 * Requirements: 12.3, 12.4, 12.5
 */
const SERVICE_TIMERS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_TIMERS,
  columns: [
    {name: 'timer_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'service_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'delay_ms', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'fire_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'payload', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'{}\''},
    {name: 'status', type: COLUMN_TYPE.TEXT, notNull: true, defaultValue: '\'active\''},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_svc_timer_service', columns: ['service_id']},
    {name: 'idx_svc_timer_status', columns: ['status']},
    {name: 'idx_svc_timer_fire', columns: ['fire_at']},
  ],
};

/**
 * Module manifests system table schema.
 * Stores WASM module/package metadata with component-model identity.
 * Requirements: 3.2, 5.2, 10.1, 10.2
 */
const MODULE_MANIFESTS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.MODULE_MANIFESTS,
  columns: [
    {name: 'namespace', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'version', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'digest', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'run_export', type: COLUMN_TYPE.TEXT, notNull: true},
    {
      name: 'exports',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {
      name: 'dependencies',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {
      name: 'capabilities',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {name: 'source_reference', type: COLUMN_TYPE.TEXT},
    {name: 'artifact_pointer', type: COLUMN_TYPE.TEXT},
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  primaryKey: ['namespace', 'name', 'version'],
  indices: [
    {
      name: 'idx_module_manifests_digest',
      columns: ['digest'],
    },
    {
      name: 'idx_module_manifests_namespace',
      columns: ['namespace'],
    },
  ],
};

/**
 * Package registry mappings system table schema.
 * Stores namespace-to-registry resolution rules.
 * Requirements: 4.1, 10.1, 10.2
 */
const PACKAGE_REGISTRY_MAPPINGS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_MAPPINGS,
  columns: [
    {name: 'namespace', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'registry_url', type: COLUMN_TYPE.TEXT, notNull: true},
    {
      name: 'policy_metadata',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [],
};

/**
 * Package registry overrides system table schema.
 * Stores per-package registry override rules.
 * Requirements: 4.2, 10.1, 10.2
 */
const PACKAGE_REGISTRY_OVERRIDES_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_OVERRIDES,
  columns: [
    {name: 'namespace', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'name', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'registry_url', type: COLUMN_TYPE.TEXT, notNull: true},
    {
      name: 'policy_metadata',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  primaryKey: ['namespace', 'name'],
  indices: [],
};

/**
 * Module dependency locks system table schema.
 * Stores resolved dependency graphs pinned to immutable digests.
 * Requirements: 5.2, 10.1, 10.2
 */
const MODULE_DEPENDENCY_LOCKS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.MODULE_DEPENDENCY_LOCKS,
  columns: [
    {name: 'lock_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {
      name: 'target_module_namespace',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
    },
    {
      name: 'target_module_name',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
    },
    {
      name: 'target_module_version',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
    },
    {name: 'target_service_id', type: COLUMN_TYPE.TEXT},
    {
      name: 'resolved_dependencies',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_dep_locks_target',
      columns: [
        'target_module_namespace',
        'target_module_name',
        'target_module_version',
      ],
    },
    {
      name: 'idx_dep_locks_service',
      columns: ['target_service_id'],
    },
  ],
};

/**
 * WASM operations system table schema.
 * Stores async operation workflow state and idempotency metadata.
 * Requirements: 8.1, 8.3, 10.1, 10.2
 */
const WASM_OPERATIONS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.WASM_OPERATIONS,
  columns: [
    {name: 'operation_id', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'tenant_id', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'command', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'idempotency_key', type: COLUMN_TYPE.TEXT},
    {
      name: 'state',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'pending\'',
    },
    {
      name: 'result',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {
      name: 'error',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {name: 'created_at', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'updated_at', type: COLUMN_TYPE.INTEGER, notNull: true},
  ],
  indices: [
    {
      name: 'idx_wasm_ops_tenant',
      columns: ['tenant_id'],
    },
    {
      name: 'idx_wasm_ops_state',
      columns: ['state'],
    },
    {
      name: 'idx_wasm_ops_idempotency',
      columns: ['tenant_id', 'idempotency_key'],
    },
  ],
};

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

/**
 * All system table schemas in creation order.
 * Order matters for foreign key dependencies.
 */
const SYSTEM_TABLE_SCHEMAS = [
  TABLES_SCHEMA,
  NODES_SCHEMA,
  LATENCY_GROUPS_SCHEMA,
  INTER_GROUP_LATENCIES_SCHEMA,
  MESSAGE_GROUPS_SCHEMA,
  PARTITIONS_SCHEMA,
  SERVICES_SCHEMA,
  INDICES_SCHEMA,
  LOGS_SCHEMA,
  CONFIG_SCHEMA,
  LIVE_QUERIES_SCHEMA,
  CONTEXTS_SCHEMA,
  CODE_SCHEMA,
  CONTROL_PLANE_PUBLICATIONS_SCHEMA,
  REPLICA_OPERATIONS_SCHEMA,
  NODE_ENDPOINTS_SCHEMA,
  SERVICE_DEFINITIONS_SCHEMA,
  SERVICE_ENDPOINTS_SCHEMA,
  SERVICE_TIMERS_SCHEMA,
  MODULE_MANIFESTS_SCHEMA,
  PACKAGE_REGISTRY_MAPPINGS_SCHEMA,
  PACKAGE_REGISTRY_OVERRIDES_SCHEMA,
  MODULE_DEPENDENCY_LOCKS_SCHEMA,
  WASM_OPERATIONS_SCHEMA,
  SQL_TRANSACTIONS_SCHEMA,
  SQL_TRANSACTION_PARTICIPANTS_SCHEMA,
  SQL_WRITE_OPERATIONS_SCHEMA,
  SCHEMA_MIGRATIONS_SCHEMA,
  SCHEMA_MIGRATION_PARTITIONS_SCHEMA,
  DEBUG_SESSIONS_SCHEMA,
  DEBUG_BREAKPOINTS_SCHEMA,
  DEBUG_SNAPSHOTS_SCHEMA,
  STORAGE_RESERVATIONS_SCHEMA,
];

/**
 * Pre-assigned IDs for initial system table partitions.
 * These avoid circular dependencies during bootstrap.
 */
const INITIAL_PARTITION_IDS = {
  [SYSTEM_TABLE_NAME.TABLES]: 'tables-p1',
  [SYSTEM_TABLE_NAME.PARTITIONS]: 'partitions-p1',
  [SYSTEM_TABLE_NAME.INDICES]: 'indices-p1',
  [SYSTEM_TABLE_NAME.MESSAGE_GROUPS]: 'message_groups-p1',
  [SYSTEM_TABLE_NAME.NODES]: 'nodes-p1',
  [SYSTEM_TABLE_NAME.SERVICES]: 'services-p1',
  [SYSTEM_TABLE_NAME.LOGS]: 'logs-p1',
  [SYSTEM_TABLE_NAME.CONFIG]: 'config-p1',
  [SYSTEM_TABLE_NAME.LIVE_QUERIES]: 'live_queries-p1',
  [SYSTEM_TABLE_NAME.CONTEXTS]: 'contexts-p1',
  [SYSTEM_TABLE_NAME.CODE]: 'code-p1',
  [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS]:
    'control_plane_publications-p1',
  [SYSTEM_TABLE_NAME.REPLICA_OPERATIONS]: 'replica_operations-p1',
  [SYSTEM_TABLE_NAME.NODE_ENDPOINTS]: 'node_endpoints-p1',
  [SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS]: 'service_definitions-p1',
  [SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS]: 'service_endpoints-p1',
  [SYSTEM_TABLE_NAME.SERVICE_TIMERS]: 'service_timers-p1',
  [SYSTEM_TABLE_NAME.MODULE_MANIFESTS]: 'module_manifests-p1',
  [SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_MAPPINGS]:
    'package_registry_mappings-p1',
  [SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_OVERRIDES]:
    'package_registry_overrides-p1',
  [SYSTEM_TABLE_NAME.MODULE_DEPENDENCY_LOCKS]:
    'module_dependency_locks-p1',
  [SYSTEM_TABLE_NAME.WASM_OPERATIONS]: 'wasm_operations-p1',
  [SYSTEM_TABLE_NAME.SQL_TRANSACTIONS]: 'sql_transactions-p1',
  [SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS]:
    'sql_transaction_participants-p1',
  [SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS]: 'sql_write_operations-p1',
  [SYSTEM_TABLE_NAME.SCHEMA_MIGRATIONS]: 'schema_migrations-p1',
  [SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS]:
    'schema_migration_partitions-p1',
  [SYSTEM_TABLE_NAME.DEBUG_SESSIONS]: 'debug_sessions-p1',
  [SYSTEM_TABLE_NAME.DEBUG_BREAKPOINTS]: 'debug_breakpoints-p1',
  [SYSTEM_TABLE_NAME.DEBUG_SNAPSHOTS]: 'debug_snapshots-p1',
  [SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS]: 'storage_reservations-p1',
  [SYSTEM_TABLE_NAME.LATENCY_GROUPS]: 'latency_groups-p1',
  [SYSTEM_TABLE_NAME.INTER_GROUP_LATENCIES]: 'inter_group_latencies-p1',
};

const PRIORITY_CONTROL_PLANE_PARTITION_IDS = new Set([
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS],
]);

/**
 * Pre-assigned replica IDs for initial system table partitions.
 * Each partition has 3 replicas on the seed node.
 */
const INITIAL_REPLICA_IDS = {
  [SYSTEM_TABLE_NAME.TABLES]: ['tables-p1-r1', 'tables-p1-r2', 'tables-p1-r3'],
  [SYSTEM_TABLE_NAME.PARTITIONS]: ['partitions-p1-r1', 'partitions-p1-r2', 'partitions-p1-r3'],
  [SYSTEM_TABLE_NAME.INDICES]: ['indices-p1-r1', 'indices-p1-r2', 'indices-p1-r3'],
  [SYSTEM_TABLE_NAME.MESSAGE_GROUPS]: [
    'message_groups-p1-r1', 'message_groups-p1-r2', 'message_groups-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.NODES]: ['nodes-p1-r1', 'nodes-p1-r2', 'nodes-p1-r3'],
  [SYSTEM_TABLE_NAME.SERVICES]: ['services-p1-r1', 'services-p1-r2', 'services-p1-r3'],
  [SYSTEM_TABLE_NAME.LOGS]: ['logs-p1-r1', 'logs-p1-r2', 'logs-p1-r3'],
  [SYSTEM_TABLE_NAME.CONFIG]: ['config-p1-r1', 'config-p1-r2', 'config-p1-r3'],
  [SYSTEM_TABLE_NAME.LIVE_QUERIES]: [
    'live_queries-p1-r1', 'live_queries-p1-r2', 'live_queries-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.CONTEXTS]: ['contexts-p1-r1', 'contexts-p1-r2', 'contexts-p1-r3'],
  [SYSTEM_TABLE_NAME.CODE]: ['code-p1-r1', 'code-p1-r2', 'code-p1-r3'],
  [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS]: [
    'control_plane_publications-p1-r1',
    'control_plane_publications-p1-r2',
    'control_plane_publications-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.REPLICA_OPERATIONS]: [
    'replica_operations-p1-r1', 'replica_operations-p1-r2', 'replica_operations-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.NODE_ENDPOINTS]: [
    'node_endpoints-p1-r1', 'node_endpoints-p1-r2', 'node_endpoints-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS]: [
    'service_definitions-p1-r1', 'service_definitions-p1-r2', 'service_definitions-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS]: [
    'service_endpoints-p1-r1', 'service_endpoints-p1-r2', 'service_endpoints-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.SERVICE_TIMERS]: [
    'service_timers-p1-r1', 'service_timers-p1-r2', 'service_timers-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.MODULE_MANIFESTS]: [
    'module_manifests-p1-r1',
    'module_manifests-p1-r2',
    'module_manifests-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_MAPPINGS]: [
    'package_registry_mappings-p1-r1',
    'package_registry_mappings-p1-r2',
    'package_registry_mappings-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_OVERRIDES]: [
    'package_registry_overrides-p1-r1',
    'package_registry_overrides-p1-r2',
    'package_registry_overrides-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.MODULE_DEPENDENCY_LOCKS]: [
    'module_dependency_locks-p1-r1',
    'module_dependency_locks-p1-r2',
    'module_dependency_locks-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.WASM_OPERATIONS]: [
    'wasm_operations-p1-r1',
    'wasm_operations-p1-r2',
    'wasm_operations-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.SQL_TRANSACTIONS]: [
    'sql_transactions-p1-r1',
    'sql_transactions-p1-r2',
    'sql_transactions-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS]: [
    'sql_transaction_participants-p1-r1',
    'sql_transaction_participants-p1-r2',
    'sql_transaction_participants-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS]: [
    'sql_write_operations-p1-r1',
    'sql_write_operations-p1-r2',
    'sql_write_operations-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.SCHEMA_MIGRATIONS]: [
    'schema_migrations-p1-r1',
    'schema_migrations-p1-r2',
    'schema_migrations-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS]: [
    'schema_migration_partitions-p1-r1',
    'schema_migration_partitions-p1-r2',
    'schema_migration_partitions-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.DEBUG_SESSIONS]: [
    'debug_sessions-p1-r1',
    'debug_sessions-p1-r2',
    'debug_sessions-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.DEBUG_BREAKPOINTS]: [
    'debug_breakpoints-p1-r1',
    'debug_breakpoints-p1-r2',
    'debug_breakpoints-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.DEBUG_SNAPSHOTS]: [
    'debug_snapshots-p1-r1',
    'debug_snapshots-p1-r2',
    'debug_snapshots-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS]: [
    'storage_reservations-p1-r1',
    'storage_reservations-p1-r2',
    'storage_reservations-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.LATENCY_GROUPS]: [
    'latency_groups-p1-r1',
    'latency_groups-p1-r2',
    'latency_groups-p1-r3',
  ],
  [SYSTEM_TABLE_NAME.INTER_GROUP_LATENCIES]: [
    'inter_group_latencies-p1-r1',
    'inter_group_latencies-p1-r2',
    'inter_group_latencies-p1-r3',
  ],
};

/**
 * Initial message group ID for seed node.
 */
const INITIAL_MESSAGE_GROUP_ID = 'mg-1';

/**
 * Initial message group replica IDs for seed node.
 */
const INITIAL_MESSAGE_GROUP_REPLICA_IDS = ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'];

/**
 * Get schema by table name.
 * @param {string} tableName - Table name.
 * @return {Object|null} Schema or null if not found.
 */
function getSchemaByTableName(tableName) {
  return SYSTEM_TABLE_SCHEMAS.find((s) => s.tableName === tableName) || null;
}

/**
 * Get partition ID for a system table.
 * @param {string} tableName - Table name.
 * @return {string|null} Partition ID or null if not found.
 */
function getInitialPartitionId(tableName) {
  return INITIAL_PARTITION_IDS[tableName] || null;
}

/**
 * Get replica IDs for a system table partition.
 * @param {string} tableName - Table name.
 * @return {Array<string>|null} Replica IDs or null if not found.
 */
function getInitialReplicaIds(tableName) {
  return INITIAL_REPLICA_IDS[tableName] || null;
}

export {
  COLUMN_TYPE,
  SYSTEM_TABLE_NAME,
  TABLES_SCHEMA,
  PARTITIONS_SCHEMA,
  INDICES_SCHEMA,
  MESSAGE_GROUPS_SCHEMA,
  NODES_SCHEMA,
  LATENCY_GROUPS_SCHEMA,
  INTER_GROUP_LATENCIES_SCHEMA,
  SERVICES_SCHEMA,
  LOGS_SCHEMA,
  CONFIG_SCHEMA,
  LIVE_QUERIES_SCHEMA,
  CONTEXTS_SCHEMA,
  CODE_SCHEMA,
  CONTROL_PLANE_PUBLICATIONS_SCHEMA,
  REPLICA_OPERATIONS_SCHEMA,
  NODE_ENDPOINTS_SCHEMA,
  SERVICE_DEFINITIONS_SCHEMA,
  SERVICE_ENDPOINTS_SCHEMA,
  SERVICE_TIMERS_SCHEMA,
  MODULE_MANIFESTS_SCHEMA,
  PACKAGE_REGISTRY_MAPPINGS_SCHEMA,
  PACKAGE_REGISTRY_OVERRIDES_SCHEMA,
  MODULE_DEPENDENCY_LOCKS_SCHEMA,
  WASM_OPERATIONS_SCHEMA,
  SQL_TRANSACTIONS_SCHEMA,
  SQL_TRANSACTION_PARTICIPANTS_SCHEMA,
  SQL_WRITE_OPERATIONS_SCHEMA,
  SCHEMA_MIGRATIONS_SCHEMA,
  SCHEMA_MIGRATION_PARTITIONS_SCHEMA,
  DEBUG_SESSIONS_SCHEMA,
  DEBUG_BREAKPOINTS_SCHEMA,
  DEBUG_SNAPSHOTS_SCHEMA,
  STORAGE_RESERVATIONS_SCHEMA,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  PRIORITY_CONTROL_PLANE_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  generateCreateTableSQL,
  generateCreateIndexSQL,
  getSchemaByTableName,
  getInitialPartitionId,
  getInitialReplicaIds,
};
