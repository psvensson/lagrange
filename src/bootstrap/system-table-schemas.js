/**
 * System Table Schemas - Hard-coded schemas for bootstrap.
 * Defines schemas for all system tables to avoid circular dependencies.
 * Requirements: 6.1, 6.2, 6.5, 14.6, 14.7, 31.3, 31.4
 */

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
  TABLES: 'tables',
  PARTITIONS: 'partitions',
  INDICES: 'indices',
  MESSAGE_GROUPS: 'message_groups',
  NODES: 'nodes',
  SERVICES: 'services',
  LOGS: 'logs',
  CONFIG: 'config',
  LIVE_QUERIES: 'live_queries',
  CONTEXTS: 'contexts',
  CODE: 'code',
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
    {name: 'last_heartbeat', type: ColumnType.INTEGER, notNull: true},
    {name: 'created_at', type: ColumnType.INTEGER, notNull: true},
  ],
  indices: [
    {name: 'idx_nodes_address', columns: ['node_address']},
    {name: 'idx_nodes_status', columns: ['status']},
  ],
};

/**
 * Services system table schema.
 * Stores metadata about all services in the system.
 * Includes raft_role column for Raft-based services (Req 14.6, 14.7).
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
    {name: 'raft_role', type: ColumnType.TEXT}, // leader, follower, candidate (Req 14.6)
    {name: 'status', type: ColumnType.TEXT, notNull: true, defaultValue: '\'active\''},
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
 * All system table schemas in creation order.
 * Order matters for foreign key dependencies.
 */
const SYSTEM_TABLE_SCHEMAS = [
  TABLES_SCHEMA,
  NODES_SCHEMA,
  MESSAGE_GROUPS_SCHEMA,
  PARTITIONS_SCHEMA,
  SERVICES_SCHEMA,
  INDICES_SCHEMA,
  LOGS_SCHEMA,
  CONFIG_SCHEMA,
  LIVE_QUERIES_SCHEMA,
  CONTEXTS_SCHEMA,
  CODE_SCHEMA,
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

  return `CREATE TABLE IF NOT EXISTS ${schema.tableName} (${columnDefs})`;
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
  SERVICES_SCHEMA,
  LOGS_SCHEMA,
  CONFIG_SCHEMA,
  LIVE_QUERIES_SCHEMA,
  CONTEXTS_SCHEMA,
  CODE_SCHEMA,
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
