/**
 * Command handlers for sys-admin-meta service.
 * Each handler validates input and returns SQL statements
 * or metadata for the caller to execute. No direct SQL execution.
 *
 * Requirements: 1.3, 11.1
 */

import {SQL, TABLES, COLUMN, WASM_META_ACTION} from '../constants/index.js';

const ADMIN_META_ACTION = Object.freeze({
  EXECUTE_QUERY: 'executeQuery',
  GET_CACHE_DUMP: 'getCacheDump',
  GET_NODE_STATUS: 'getNodeStatus',
  LIST_SERVICES: 'listServices',
  LIST_NODES: 'listNodes',
  LIST_PARTITIONS: 'listPartitions',
  LIST_LATENCY_GROUPS: 'listLatencyGroups',
  LIST_INTER_GROUP_LATENCIES: 'listInterGroupLatencies',
});

const ADMIN_META_ERROR_MSG = Object.freeze({
  SQL_REQUIRED: 'SQL statement is required',
  SQL_MUST_BE_STRING: 'SQL must be a string',
});

/**
 * Actions that must be delegated to sys-wasm-meta.
 * Contains all WASM_META_ACTION values.
 */
const WASM_DELEGATION_ACTIONS = new Set(
  Object.values(WASM_META_ACTION),
);

const CACHE_DUMP_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.PARTITIONS,
  TABLES.SERVICES,
  TABLES.MESSAGE_GROUPS,
  TABLES.TABLES,
  TABLES.CONFIG,
  TABLES.REPLICA_OPERATIONS,
  TABLES.SERVICE_DEFINITIONS,
  TABLES.SERVICE_ENDPOINTS,
  TABLES.LATENCY_GROUPS,
  TABLES.INTER_GROUP_LATENCIES,
]);

const SELECT_ALL_FROM = `${SQL.SELECT} * FROM`;

/**
 * Handle execute query command.
 * Validates sql param and returns it for execution.
 * @param {Object} params - {sql, queryParams}.
 * @return {Object} Result with sql/params or errors.
 */
function handleExecuteQuery(params) {
  if (!params || !params.sql) {
    return {
      success: false,
      errors: [ADMIN_META_ERROR_MSG.SQL_REQUIRED],
    };
  }
  if (typeof params.sql !== 'string') {
    return {
      success: false,
      errors: [ADMIN_META_ERROR_MSG.SQL_MUST_BE_STRING],
    };
  }
  return {
    success: true,
    sql: params.sql,
    params: params.queryParams || [],
  };
}

/**
 * Handle get cache dump command.
 * Returns list of system table names to dump.
 * @param {Object} _params - Unused.
 * @return {Object} Result with tables list.
 */
function handleGetCacheDump(_params) {
  return {
    success: true,
    tables: CACHE_DUMP_TABLES,
  };
}

/**
 * Handle get node status command.
 * Returns SQL to query nodes table, optionally filtered.
 * @param {Object} params - Optional {nodeId}.
 * @return {Object} Result with sql/params.
 */
function handleGetNodeStatus(params) {
  let sql = `${SELECT_ALL_FROM} ${TABLES.NODES}`;
  const sqlParams = [];

  if (params && params.nodeId) {
    sqlParams.push(params.nodeId);
    sql += ` ${SQL.WHERE} ${COLUMN.NODE_ID} = ?1`;
  }

  return {success: true, sql, params: sqlParams};
}

/**
 * Handle list services command.
 * Returns SQL to query services table with optional filters.
 * @param {Object} params - Optional {serviceType, nodeId}.
 * @return {Object} Result with sql/params.
 */
function handleListServices(params) {
  let sql = `${SELECT_ALL_FROM} ${TABLES.SERVICES}`;
  const filters = [];
  const sqlParams = [];

  if (params && params.serviceType) {
    sqlParams.push(params.serviceType);
    filters.push(
      `${COLUMN.SERVICE_TYPE} = ?${sqlParams.length}`,
    );
  }
  if (params && params.nodeId) {
    sqlParams.push(params.nodeId);
    filters.push(
      `${COLUMN.NODE_ID} = ?${sqlParams.length}`,
    );
  }

  if (filters.length > 0) {
    sql += ` ${SQL.WHERE} ${filters.join(` ${SQL.AND} `)}`;
  }

  return {success: true, sql, params: sqlParams};
}

/**
 * Handle list nodes command.
 * Returns SQL to query all nodes.
 * @param {Object} _params - Unused.
 * @return {Object} Result with sql/params.
 */
function handleListNodes(_params) {
  return {
    success: true,
    sql: `${SELECT_ALL_FROM} ${TABLES.NODES}`,
    params: [],
  };
}

/**
 * Handle list partitions command.
 * Returns SQL to query partitions, optionally filtered by tableId.
 * @param {Object} params - Optional {tableId}.
 * @return {Object} Result with sql/params.
 */
function handleListPartitions(params) {
  let sql = `${SELECT_ALL_FROM} ${TABLES.PARTITIONS}`;
  const sqlParams = [];

  if (params && params.tableId) {
    sqlParams.push(params.tableId);
    sql += ` ${SQL.WHERE} ${COLUMN.TABLE_ID} = ?1`;
  }

  return {success: true, sql, params: sqlParams};
}

/**
 * Handle list latency groups command.
 * Returns SQL to query all latency groups.
 * @param {Object} _params - Unused.
 * @return {Object} Result with sql/params.
 */
function handleListLatencyGroups(_params) {
  return {
    success: true,
    sql: `${SELECT_ALL_FROM} ${TABLES.LATENCY_GROUPS}`,
    params: [],
  };
}

/**
 * Handle list inter-group latencies command.
 * Returns SQL to query inter-group latencies with optional filters.
 * @param {Object} params - Optional {sourceGroupId, targetGroupId}.
 * @return {Object} Result with sql/params.
 */
function handleListInterGroupLatencies(params) {
  let sql = `${SELECT_ALL_FROM} ${TABLES.INTER_GROUP_LATENCIES}`;
  const filters = [];
  const sqlParams = [];

  if (params && params.sourceGroupId) {
    sqlParams.push(params.sourceGroupId);
    filters.push(`${COLUMN.SOURCE_GROUP_ID} = ?${sqlParams.length}`);
  }
  if (params && params.targetGroupId) {
    sqlParams.push(params.targetGroupId);
    filters.push(`${COLUMN.TARGET_GROUP_ID} = ?${sqlParams.length}`);
  }

  if (filters.length > 0) {
    sql += ` ${SQL.WHERE} ${filters.join(` ${SQL.AND} `)}`;
  }

  return {success: true, sql, params: sqlParams};
}

export {
  ADMIN_META_ACTION,
  ADMIN_META_ERROR_MSG,
  WASM_DELEGATION_ACTIONS,
  CACHE_DUMP_TABLES,
  handleExecuteQuery,
  handleGetCacheDump,
  handleGetNodeStatus,
  handleListServices,
  handleListNodes,
  handleListPartitions,
  handleListLatencyGroups,
  handleListInterGroupLatencies,
};
