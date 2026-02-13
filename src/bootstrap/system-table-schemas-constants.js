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

/**
 * Column type definitions for schema.
 */
const ColumnType = {
  TEXT: 'TEXT',
  INTEGER: 'INTEGER',
  REAL: 'REAL',
  BOOLEAN: 'INTEGER', // SQLite uses INTEGER for boolean
};

/**
 * System table names.
 */
const SystemTableName = {
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
  STORAGE_RESERVATIONS: TABLES.STORAGE_RESERVATIONS,
  LATENCY_GROUPS: TABLES.LATENCY_GROUPS,
  INTER_GROUP_LATENCIES: TABLES.INTER_GROUP_LATENCIES,
};

/**
 * Tables system table schema.
 * Stores metadata about all tables in the system.
 */
const TABLES_SCHEMA = {
  tableName: SystemTableName.TABLES,
  columns: [
    {name: 'table_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'table_name', type: ColumnType.TEXT, notNull: true, unique: true},
    {name: 'schema_definition', type: ColumnType.TEXT, notNull: true},
    {name: 'partition_key', type: ColumnType.TEXT, notNull: true},
    {name: 'table_policies', type: ColumnType.TEXT, notNull: true, defaultValue: '\'{}\''},
    {name: 'partition_count', type: ColumnType.INTEGER, notNull: true, defaultValue: 1},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.PARTITIONS,
  columns: [
    {name: 'partition_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'table_id', type: ColumnType.TEXT, notNull: true},
    {name: 'table_name', type: ColumnType.TEXT},
    {name: 'partition_key_start', type: ColumnType.TEXT},
    {name: 'partition_key_end', type: ColumnType.TEXT},
    {name: 'replica_count', type: ColumnType.INTEGER, notNull: true, defaultValue: 3},
    {name: 'size_bytes', type: ColumnType.INTEGER, notNull: true, defaultValue: 0},
    {name: 'leader_node_id', type: ColumnType.TEXT},
    {name: 'state', type: ColumnType.TEXT, notNull: true, defaultValue: '\'NORMAL\''},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.INDICES,
  columns: [
    {name: 'index_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'table_id', type: ColumnType.TEXT, notNull: true},
    {name: 'index_name', type: ColumnType.TEXT, notNull: true},
    {name: 'column_names', type: ColumnType.TEXT, notNull: true}, // JSON array
    {name: 'index_type', type: ColumnType.TEXT, notNull: true, defaultValue: '\'btree\''},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.MESSAGE_GROUPS,
  columns: [
    {name: 'group_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'group_name', type: ColumnType.TEXT, notNull: true, unique: true},
    {name: 'replica_count', type: ColumnType.INTEGER, notNull: true, defaultValue: 3},
    {name: 'leader_node_id', type: ColumnType.TEXT},
    {name: 'policy', type: ColumnType.TEXT, notNull: true, defaultValue: '\'{}\''},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.NODES,
  columns: [
    {name: 'node_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'node_address', type: ColumnType.TEXT, notNull: true, unique: true},
    {name: 'cpu_cores', type: ColumnType.INTEGER, notNull: true},
    {name: 'memory_mb', type: ColumnType.INTEGER, notNull: true},
    {name: 'disk_gb', type: ColumnType.INTEGER, notNull: true},
    {name: 'cpu_usage_percent', type: ColumnType.REAL, defaultValue: 0},
    {name: 'memory_usage_percent', type: ColumnType.REAL, defaultValue: 0},
    {name: 'disk_usage_percent', type: ColumnType.REAL, defaultValue: 0},
    {name: 'status', type: ColumnType.TEXT, notNull: true, defaultValue: '\'active\''},
    {
      name: 'ws_connection_state',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'disconnected\'',
    },
    {name: 'capabilities', type: ColumnType.TEXT, defaultValue: '\'[]\''},
    {name: 'last_heartbeat', type: ColumnType.INTEGER, notNull: true},
    {name: 'ready_lease_expires_at', type: ColumnType.INTEGER},
    {name: 'storage_budget_bytes', type: ColumnType.INTEGER},
    {name: 'storage_budget_source', type: ColumnType.TEXT},
    {name: 'storage_budget_updated_at', type: ColumnType.INTEGER},
    {name: 'latency_group_id', type: ColumnType.TEXT},
    {name: 'last_latency_check_at', type: ColumnType.INTEGER},
    {
      name: 'latency_assignment_state',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: `'${LATENCY_ASSIGNMENT_STATE.UNASSIGNED}'`,
    },
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.LATENCY_GROUPS,
  columns: [
    {name: 'group_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'representative_node_id', type: ColumnType.TEXT},
    {name: 'coordinator_node_id', type: ColumnType.TEXT},
    {
      name: 'state',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: `'${LATENCY_GROUP_STATE.ACTIVE}'`,
    },
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.INTER_GROUP_LATENCIES,
  columns: [
    {name: 'latency_edge_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'source_group_id', type: ColumnType.TEXT, notNull: true},
    {name: 'target_group_id', type: ColumnType.TEXT, notNull: true},
    {name: 'latency_ms', type: ColumnType.REAL, notNull: true},
    {name: 'sample_count', type: ColumnType.INTEGER, notNull: true, defaultValue: 1},
    {name: 'sample_quality', type: ColumnType.TEXT, notNull: true, defaultValue: '\'good\''},
    {name: 'last_measured_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.SERVICES,
  columns: [
    {name: 'service_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'service_type', type: ColumnType.TEXT, notNull: true},
    {name: 'node_id', type: ColumnType.TEXT, notNull: true},
    {name: 'partition_id', type: ColumnType.TEXT},
    {name: 'group_id', type: ColumnType.TEXT},
    {name: 'replica_id', type: ColumnType.TEXT},
    {name: 'raft_role', type: ColumnType.TEXT}, // leader, follower, candidate
    {name: 'status', type: ColumnType.TEXT, notNull: true, defaultValue: '\'active\''},
    // Timestamp when current state was entered
    {name: 'state_entered_at', type: ColumnType.INTEGER},
    {name: 'previous_state', type: ColumnType.TEXT}, // Previous state for debugging
    {name: 'trigger_reason', type: ColumnType.TEXT}, // What triggered current state
    {name: 'error_message', type: ColumnType.TEXT}, // Error if in failed state
    {name: 'address', type: ColumnType.TEXT},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.LOGS,
  columns: [
    {name: 'log_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'timestamp', type: ColumnType.INTEGER, notNull: true},
    {name: 'level', type: ColumnType.TEXT, notNull: true},
    {name: 'node_id', type: ColumnType.TEXT, notNull: true},
    {name: 'service_id', type: ColumnType.TEXT},
    {name: 'service_type', type: ColumnType.TEXT},
    {name: 'message', type: ColumnType.TEXT, notNull: true},
    {name: 'trace_id', type: ColumnType.TEXT},
    {name: 'metadata', type: ColumnType.TEXT}, // JSON
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.CONFIG,
  columns: [
    {name: 'config_key', type: ColumnType.TEXT, primaryKey: true},
    {name: 'config_value', type: ColumnType.TEXT, notNull: true},
    {name: 'value_type', type: ColumnType.TEXT, notNull: true},
    {name: 'requires_restart', type: ColumnType.INTEGER, notNull: true, defaultValue: 0},
    {name: 'description', type: ColumnType.TEXT},
    {name: 'default_value', type: ColumnType.TEXT, notNull: true},
    {name: 'updated_by', type: ColumnType.TEXT},
    {name: 'updated_at', type: ColumnType.INTEGER},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.LIVE_QUERIES,
  columns: [
    {name: 'query_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'table_name', type: ColumnType.TEXT, notNull: true},
    {name: 'predicate_hash', type: ColumnType.TEXT, notNull: true},
    {name: 'predicate_sql', type: ColumnType.TEXT, notNull: true},
    {name: 'partition_key_value', type: ColumnType.TEXT},
    {name: 'client_count', type: ColumnType.INTEGER, notNull: true, defaultValue: 0},
    {name: 'node_id', type: ColumnType.TEXT, notNull: true},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'last_activity_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.CONTEXTS,
  columns: [
    {name: 'context_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'context_type', type: ColumnType.TEXT, notNull: true},
    {name: 'context_name', type: ColumnType.TEXT, notNull: true},
    {name: 'context_data', type: ColumnType.TEXT, notNull: true},
    {name: 'owner_id', type: ColumnType.TEXT},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.CODE,
  columns: [
    {name: 'function_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'function_name', type: ColumnType.TEXT, notNull: true, unique: true},
    {name: 'version', type: ColumnType.INTEGER, notNull: true, defaultValue: 1},
    {name: 'executor_type', type: ColumnType.TEXT, notNull: true, defaultValue: '\'wasm\''},
    {name: 'code_blob', type: ColumnType.TEXT, notNull: true},
    {name: 'signature', type: ColumnType.TEXT, notNull: true},
    {name: 'permissions', type: ColumnType.TEXT, notNull: true, defaultValue: '\'[]\''},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_code_name', columns: ['function_name']},
    {name: 'idx_code_type', columns: ['executor_type']},
  ],
};

/**
 * Replica operations system table schema.
 * Stores persistent log of all replica operations for debugging and recovery.
 * Requirements: 9.1, 9.2
 */
const REPLICA_OPERATIONS_SCHEMA = {
  tableName: SystemTableName.REPLICA_OPERATIONS,
  columns: [
    {name: 'operation_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'type', type: ColumnType.TEXT, notNull: true}, // 'ADD' or 'REMOVE'
    {name: 'partition_id', type: ColumnType.TEXT, notNull: true},
    {name: 'entity_type', type: ColumnType.TEXT, notNull: true},
    {name: 'entity_id', type: ColumnType.TEXT, notNull: true},
    {name: 'replica_id', type: ColumnType.TEXT},
    {name: 'source_node_id', type: ColumnType.TEXT, notNull: true},
    {name: 'target_node_id', type: ColumnType.TEXT, notNull: true},
    {name: 'status', type: ColumnType.TEXT, notNull: true}, // ReplicaStatus value
    {name: 'workflow_step', type: ColumnType.TEXT, notNull: true},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'completed_at', type: ColumnType.INTEGER},
    {name: 'error_message', type: ColumnType.TEXT},
    {name: 'steps_history', type: ColumnType.TEXT, notNull: true}, // JSON array
  ],
  indices: [
    {name: 'idx_replica_ops_status', columns: ['status']},
    {name: 'idx_replica_ops_partition', columns: ['partition_id']},
    {name: 'idx_replica_ops_entity', columns: ['entity_type', 'entity_id']},
    {name: 'idx_replica_ops_created', columns: ['created_at']},
  ],
};

/**
 * Node endpoints system table schema.
 * Stores transport endpoints for nodes (WebSocket, NATS, Veilid, etc.).
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
const NODE_ENDPOINTS_SCHEMA = {
  tableName: SystemTableName.NODE_ENDPOINTS,
  columns: [
    {name: 'endpoint_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'node_id', type: ColumnType.TEXT, notNull: true},
    {name: 'transport_type', type: ColumnType.TEXT, notNull: true},
    {name: 'address', type: ColumnType.TEXT, notNull: true},
    {name: 'priority', type: ColumnType.INTEGER, notNull: true, defaultValue: 0},
    {name: 'metadata', type: ColumnType.TEXT},
    {name: 'status', type: ColumnType.TEXT, notNull: true, defaultValue: '\'active\''},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
    type: ColumnType.TEXT,
    primaryKey: true,
  }),
  [SD_COL.SERVICE_NAME]: Object.freeze({
    type: ColumnType.TEXT,
    notNull: true,
    unique: true,
  }),
  [SD_COL.SERVICE_PROFILE]: Object.freeze({
    type: ColumnType.TEXT,
    notNull: true,
    defaultValue: '\'default\'',
  }),
  [SD_COL.HANDLER_FUNCTION_ID]: Object.freeze({
    type: ColumnType.TEXT,
  }),
  [SD_COL.READ_CONSISTENCY]: Object.freeze({
    type: ColumnType.TEXT,
    notNull: true,
    defaultValue: '\'strong\'',
  }),
  [SD_COL.WRITE_CONSISTENCY]: Object.freeze({
    type: ColumnType.TEXT,
    notNull: true,
    defaultValue: '\'strong\'',
  }),
  [SD_COL.REPLICA_COUNT]: Object.freeze({
    type: ColumnType.INTEGER,
    notNull: true,
    defaultValue: 3,
  }),
  [SD_COL.PROTOCOL]: Object.freeze({
    type: ColumnType.TEXT,
    notNull: true,
    defaultValue: '\'websocket\'',
  }),
  [SD_COL.RESOURCE_BUDGET]: Object.freeze({
    type: ColumnType.TEXT,
    notNull: true,
    defaultValue: '\'{}\'',
  }),
  [SD_COL.SAFETY_INTERVAL_MS]: Object.freeze({
    type: ColumnType.INTEGER,
    notNull: true,
    defaultValue: 500,
  }),
  [SD_COL.RUNTIME_KIND]: Object.freeze({type: ColumnType.TEXT}),
  [SD_COL.RUNTIME_REF]: Object.freeze({type: ColumnType.TEXT}),
  [SD_COL.RUNTIME_CONFIG]: Object.freeze({type: ColumnType.TEXT}),
  [SD_COL.STATUS]: Object.freeze({
    type: ColumnType.TEXT,
    notNull: true,
    defaultValue: '\'active\'',
  }),
  [SD_COL.CREATED_AT]: Object.freeze({
    type: ColumnType.INTEGER,
    notNull: true,
  }),
  [SD_COL.UPDATED_AT]: Object.freeze({
    type: ColumnType.INTEGER,
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
  tableName: SystemTableName.SERVICE_DEFINITIONS,
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
  tableName: SystemTableName.SERVICE_ENDPOINTS,
  columns: [
    {name: 'endpoint_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'service_id', type: ColumnType.TEXT, notNull: true},
    {name: 'node_id', type: ColumnType.TEXT, notNull: true},
    {name: 'protocol', type: ColumnType.TEXT, notNull: true},
    {name: 'address', type: ColumnType.TEXT, notNull: true},
    {name: 'port', type: ColumnType.INTEGER, notNull: true},
    {
      name: 'health_status',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'healthy\'',
    },
    {name: 'metadata', type: ColumnType.TEXT, notNull: true, defaultValue: '\'{}\''},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.SERVICE_TIMERS,
  columns: [
    {name: 'timer_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'service_id', type: ColumnType.TEXT, notNull: true},
    {name: 'delay_ms', type: ColumnType.INTEGER, notNull: true},
    {name: 'fire_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'payload', type: ColumnType.TEXT, notNull: true, defaultValue: '\'{}\''},
    {name: 'status', type: ColumnType.TEXT, notNull: true, defaultValue: '\'active\''},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.MODULE_MANIFESTS,
  columns: [
    {name: 'namespace', type: ColumnType.TEXT, notNull: true},
    {name: 'name', type: ColumnType.TEXT, notNull: true},
    {name: 'version', type: ColumnType.TEXT, notNull: true},
    {name: 'digest', type: ColumnType.TEXT, notNull: true},
    {name: 'run_export', type: ColumnType.TEXT, notNull: true},
    {
      name: 'exports',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {
      name: 'dependencies',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {
      name: 'capabilities',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {name: 'source_reference', type: ColumnType.TEXT},
    {name: 'artifact_pointer', type: ColumnType.TEXT},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.PACKAGE_REGISTRY_MAPPINGS,
  columns: [
    {name: 'namespace', type: ColumnType.TEXT, primaryKey: true},
    {name: 'registry_url', type: ColumnType.TEXT, notNull: true},
    {
      name: 'policy_metadata',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
  ],
  indices: [],
};

/**
 * Package registry overrides system table schema.
 * Stores per-package registry override rules.
 * Requirements: 4.2, 10.1, 10.2
 */
const PACKAGE_REGISTRY_OVERRIDES_SCHEMA = {
  tableName: SystemTableName.PACKAGE_REGISTRY_OVERRIDES,
  columns: [
    {name: 'namespace', type: ColumnType.TEXT, notNull: true},
    {name: 'name', type: ColumnType.TEXT, notNull: true},
    {name: 'registry_url', type: ColumnType.TEXT, notNull: true},
    {
      name: 'policy_metadata',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.MODULE_DEPENDENCY_LOCKS,
  columns: [
    {name: 'lock_id', type: ColumnType.TEXT, primaryKey: true},
    {
      name: 'target_module_namespace',
      type: ColumnType.TEXT,
      notNull: true,
    },
    {
      name: 'target_module_name',
      type: ColumnType.TEXT,
      notNull: true,
    },
    {
      name: 'target_module_version',
      type: ColumnType.TEXT,
      notNull: true,
    },
    {name: 'target_service_id', type: ColumnType.TEXT},
    {
      name: 'resolved_dependencies',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'[]\'',
    },
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
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
  tableName: SystemTableName.WASM_OPERATIONS,
  columns: [
    {name: 'operation_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'tenant_id', type: ColumnType.TEXT, notNull: true},
    {name: 'command', type: ColumnType.TEXT, notNull: true},
    {name: 'idempotency_key', type: ColumnType.TEXT},
    {
      name: 'state',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'pending\'',
    },
    {
      name: 'result',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {
      name: 'error',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'{}\'',
    },
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
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
 * Storage reservations system table schema.
 * Tracks in-flight storage reservations for admission control.
 * Requirements: 1.2, 2.1, 12.1
 */
const STORAGE_RESERVATIONS_SCHEMA = {
  tableName: SystemTableName.STORAGE_RESERVATIONS,
  columns: [
    {name: 'reservation_id', type: ColumnType.TEXT, primaryKey: true},
    {name: 'operation_id', type: ColumnType.TEXT, notNull: true},
    {name: 'entity_type', type: ColumnType.TEXT, notNull: true},
    {name: 'entity_id', type: ColumnType.TEXT, notNull: true},
    {name: 'partition_id', type: ColumnType.TEXT, notNull: true},
    {name: 'target_node_id', type: ColumnType.TEXT, notNull: true},
    {name: 'estimated_bytes', type: ColumnType.INTEGER, notNull: true},
    {
      name: 'amplification_factor',
      type: ColumnType.REAL,
      notNull: true,
      defaultValue: 1,
    },
    {
      name: 'status',
      type: ColumnType.TEXT,
      notNull: true,
      defaultValue: '\'active\'',
    },
    {name: 'reason_code', type: ColumnType.TEXT},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'updated_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'expires_at', type: ColumnType.INTEGER, notNull: true},
    {name: 'released_at', type: ColumnType.INTEGER},
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
  STORAGE_RESERVATIONS_SCHEMA,
];

/**
 * Pre-assigned IDs for initial system table partitions.
 * These avoid circular dependencies during bootstrap.
 */
const INITIAL_PARTITION_IDS = {
  [SystemTableName.TABLES]: 'tables-p1',
  [SystemTableName.PARTITIONS]: 'partitions-p1',
  [SystemTableName.INDICES]: 'indices-p1',
  [SystemTableName.MESSAGE_GROUPS]: 'message_groups-p1',
  [SystemTableName.NODES]: 'nodes-p1',
  [SystemTableName.SERVICES]: 'services-p1',
  [SystemTableName.LOGS]: 'logs-p1',
  [SystemTableName.CONFIG]: 'config-p1',
  [SystemTableName.LIVE_QUERIES]: 'live_queries-p1',
  [SystemTableName.CONTEXTS]: 'contexts-p1',
  [SystemTableName.CODE]: 'code-p1',
  [SystemTableName.REPLICA_OPERATIONS]: 'replica_operations-p1',
  [SystemTableName.NODE_ENDPOINTS]: 'node_endpoints-p1',
  [SystemTableName.SERVICE_DEFINITIONS]: 'service_definitions-p1',
  [SystemTableName.SERVICE_ENDPOINTS]: 'service_endpoints-p1',
  [SystemTableName.SERVICE_TIMERS]: 'service_timers-p1',
  [SystemTableName.MODULE_MANIFESTS]: 'module_manifests-p1',
  [SystemTableName.PACKAGE_REGISTRY_MAPPINGS]:
    'package_registry_mappings-p1',
  [SystemTableName.PACKAGE_REGISTRY_OVERRIDES]:
    'package_registry_overrides-p1',
  [SystemTableName.MODULE_DEPENDENCY_LOCKS]:
    'module_dependency_locks-p1',
  [SystemTableName.WASM_OPERATIONS]: 'wasm_operations-p1',
  [SystemTableName.STORAGE_RESERVATIONS]: 'storage_reservations-p1',
  [SystemTableName.LATENCY_GROUPS]: 'latency_groups-p1',
  [SystemTableName.INTER_GROUP_LATENCIES]: 'inter_group_latencies-p1',
};

/**
 * Pre-assigned replica IDs for initial system table partitions.
 * Each partition has 3 replicas on the seed node.
 */
const INITIAL_REPLICA_IDS = {
  [SystemTableName.TABLES]: ['tables-p1-r1', 'tables-p1-r2', 'tables-p1-r3'],
  [SystemTableName.PARTITIONS]: ['partitions-p1-r1', 'partitions-p1-r2', 'partitions-p1-r3'],
  [SystemTableName.INDICES]: ['indices-p1-r1', 'indices-p1-r2', 'indices-p1-r3'],
  [SystemTableName.MESSAGE_GROUPS]: [
    'message_groups-p1-r1', 'message_groups-p1-r2', 'message_groups-p1-r3',
  ],
  [SystemTableName.NODES]: ['nodes-p1-r1', 'nodes-p1-r2', 'nodes-p1-r3'],
  [SystemTableName.SERVICES]: ['services-p1-r1', 'services-p1-r2', 'services-p1-r3'],
  [SystemTableName.LOGS]: ['logs-p1-r1', 'logs-p1-r2', 'logs-p1-r3'],
  [SystemTableName.CONFIG]: ['config-p1-r1', 'config-p1-r2', 'config-p1-r3'],
  [SystemTableName.LIVE_QUERIES]: [
    'live_queries-p1-r1', 'live_queries-p1-r2', 'live_queries-p1-r3',
  ],
  [SystemTableName.CONTEXTS]: ['contexts-p1-r1', 'contexts-p1-r2', 'contexts-p1-r3'],
  [SystemTableName.CODE]: ['code-p1-r1', 'code-p1-r2', 'code-p1-r3'],
  [SystemTableName.REPLICA_OPERATIONS]: [
    'replica_operations-p1-r1', 'replica_operations-p1-r2', 'replica_operations-p1-r3',
  ],
  [SystemTableName.NODE_ENDPOINTS]: [
    'node_endpoints-p1-r1', 'node_endpoints-p1-r2', 'node_endpoints-p1-r3',
  ],
  [SystemTableName.SERVICE_DEFINITIONS]: [
    'service_definitions-p1-r1', 'service_definitions-p1-r2', 'service_definitions-p1-r3',
  ],
  [SystemTableName.SERVICE_ENDPOINTS]: [
    'service_endpoints-p1-r1', 'service_endpoints-p1-r2', 'service_endpoints-p1-r3',
  ],
  [SystemTableName.SERVICE_TIMERS]: [
    'service_timers-p1-r1', 'service_timers-p1-r2', 'service_timers-p1-r3',
  ],
  [SystemTableName.MODULE_MANIFESTS]: [
    'module_manifests-p1-r1',
    'module_manifests-p1-r2',
    'module_manifests-p1-r3',
  ],
  [SystemTableName.PACKAGE_REGISTRY_MAPPINGS]: [
    'package_registry_mappings-p1-r1',
    'package_registry_mappings-p1-r2',
    'package_registry_mappings-p1-r3',
  ],
  [SystemTableName.PACKAGE_REGISTRY_OVERRIDES]: [
    'package_registry_overrides-p1-r1',
    'package_registry_overrides-p1-r2',
    'package_registry_overrides-p1-r3',
  ],
  [SystemTableName.MODULE_DEPENDENCY_LOCKS]: [
    'module_dependency_locks-p1-r1',
    'module_dependency_locks-p1-r2',
    'module_dependency_locks-p1-r3',
  ],
  [SystemTableName.WASM_OPERATIONS]: [
    'wasm_operations-p1-r1',
    'wasm_operations-p1-r2',
    'wasm_operations-p1-r3',
  ],
  [SystemTableName.STORAGE_RESERVATIONS]: [
    'storage_reservations-p1-r1',
    'storage_reservations-p1-r2',
    'storage_reservations-p1-r3',
  ],
  [SystemTableName.LATENCY_GROUPS]: [
    'latency_groups-p1-r1',
    'latency_groups-p1-r2',
    'latency_groups-p1-r3',
  ],
  [SystemTableName.INTER_GROUP_LATENCIES]: [
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
 * Generate SQL CREATE TABLE statement from schema.
 * @param {Object} schema - Table schema definition.
 * @return {string} SQL CREATE TABLE statement.
 */
function generateCreateTableSQL(schema) {
  const columnDefs = schema.columns.map((col) => {
    let def = `${col.name} ${col.type}`;
    if (col.primaryKey) {
      def += ' PRIMARY KEY';
    }
    if (col.notNull) {
      def += ' NOT NULL';
    }
    if (col.unique) {
      def += ' UNIQUE';
    }
    if (col.defaultValue !== undefined) {
      def += ` DEFAULT ${col.defaultValue}`;
    }
    return def;
  }).join(', ');

  let sql = `CREATE TABLE IF NOT EXISTS ${schema.tableName} (${columnDefs}`;

  if (schema.primaryKey && schema.primaryKey.length > 0) {
    const pkCols = schema.primaryKey.join(', ');
    sql += `, PRIMARY KEY (${pkCols})`;
  }

  sql += ')';
  return sql;
}

/**
 * Generate SQL CREATE INDEX statements from schema.
 * @param {Object} schema - Table schema definition.
 * @return {Array<string>} Array of SQL CREATE INDEX statements.
 */
function generateCreateIndexSQL(schema) {
  if (!schema.indices || schema.indices.length === 0) {
    return [];
  }

  return schema.indices.map((idx) => {
    const columns = idx.columns.join(', ');
    return `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${schema.tableName}(${columns})`;
  });
}

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
  ColumnType,
  SystemTableName,
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
  STORAGE_RESERVATIONS_SCHEMA,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  generateCreateTableSQL,
  generateCreateIndexSQL,
  getSchemaByTableName,
  getInitialPartitionId,
  getInitialReplicaIds,
};
