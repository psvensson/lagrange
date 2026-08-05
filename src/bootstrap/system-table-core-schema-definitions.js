/**
 * Core system table schema definitions.
 */

import {
  LATENCY_ASSIGNMENT_STATE,
  LATENCY_GROUP_STATE,
} from '../topology/latency-topology-constants.js';
import {
  COLUMN_TYPE,
  SYSTEM_TABLE_NAME,
} from './system-table-schema-shared-constants.js';

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
    // Locally minted monotonic boot incarnation of the row's writer
    // (node-incarnation-fencing): receivers refuse a stale-incarnation
    // writer before the heartbeat watermark comparison. 0 = pre-incarnation.
    {name: 'boot_incarnation', type: COLUMN_TYPE.INTEGER, notNull: true, defaultValue: 0},
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

export {
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
};
