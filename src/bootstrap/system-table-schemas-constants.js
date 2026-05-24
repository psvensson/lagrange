/**
 * System Table Schemas - Hard-coded schemas for bootstrap.
 * Defines schemas for all system tables to avoid circular dependencies.
 * Requirements: 6.1, 6.2, 6.5, 14.6, 14.7, 31.3, 31.4
 */

import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from './system-table-schema-sql.js';
import {
  COLUMN_TYPE,
  SYSTEM_TABLE_NAME,
} from './system-table-schema-shared-constants.js';
import {
  CODE_SCHEMA,
  CONFIG_SCHEMA,
  CONTEXTS_SCHEMA,
  INDICES_SCHEMA,
  INTER_GROUP_LATENCIES_SCHEMA,
  LATENCY_GROUPS_SCHEMA,
  LIVE_QUERIES_SCHEMA,
  LOGS_SCHEMA,
  MESSAGE_GROUPS_SCHEMA,
  NODES_SCHEMA,
  PARTITIONS_SCHEMA,
  SERVICES_SCHEMA,
  TABLES_SCHEMA,
} from './system-table-core-schema-definitions.js';
import {
  CONTROL_PLANE_PUBLICATIONS_SCHEMA,
  MODULE_DEPENDENCY_LOCKS_SCHEMA,
  MODULE_MANIFESTS_SCHEMA,
  NODE_ENDPOINTS_SCHEMA,
  PACKAGE_REGISTRY_MAPPINGS_SCHEMA,
  PACKAGE_REGISTRY_OVERRIDES_SCHEMA,
  REPLICA_OPERATIONS_SCHEMA,
  SERVICE_DEFINITIONS_SCHEMA,
  SERVICE_ENDPOINTS_SCHEMA,
  SERVICE_TIMERS_SCHEMA,
  WASM_OPERATIONS_SCHEMA,
} from './system-table-runtime-schema-definitions.js';
import {
  DEBUG_BREAKPOINTS_SCHEMA,
  DEBUG_SESSIONS_SCHEMA,
  DEBUG_SNAPSHOTS_SCHEMA,
  SCHEMA_MIGRATION_PARTITIONS_SCHEMA,
  SCHEMA_MIGRATIONS_SCHEMA,
  SQL_TRANSACTION_PARTICIPANTS_SCHEMA,
  SQL_TRANSACTIONS_SCHEMA,
  SQL_WRITE_OPERATIONS_SCHEMA,
  STORAGE_RESERVATIONS_SCHEMA,
} from './system-table-workflow-schema-definitions.js';

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
