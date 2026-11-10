// Production-shaped stored rows of the system tables, for tests that hand a
// row to a system-table row decoder or insert it into the system-table cache.
// Every row carries exactly the table's stored columns (the decoders refuse
// a missing, extra or camelCase column): the override, else the column's
// declared DEFAULT (as the SQL table would store it), else NULL for a
// nullable column, else a stored-domain value for each NOT NULL column
// (declared below for services, nodes and replica_operations; a typed
// placeholder for the other tables). Overrides are stored column names; an
// unknown name throws, so a fixture can never carry a second spelling of a
// field.

import {
  NODES_SCHEMA,
  REPLICA_OPERATIONS_SCHEMA,
  SERVICES_SCHEMA,
  getSchemaByTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {COLUMN_TYPE} from '../../src/bootstrap/system-table-schema-shared-constants.js';
import {decodeServicesRow} from '../../src/control-plane/services-row-decoder.js';
import {projectReplicaFromServicesRow} from '../../src/rebalancer/projected-replica.js';

const SQL_STRING_QUOTE = '\'';
const SQL_NULL_LITERAL = 'null';
const SQL_NUMERIC_LITERAL = /^-?\d+(\.\d+)?$/u;
const DEFAULT_STATE = Object.freeze({NONE: 'none', DECLARED: 'declared'});

// The stored value of a literal under the column's type affinity.
function storedLiteralValue(column, value) {
  return column.type === COLUMN_TYPE.TEXT ? String(value) : Number(value);
}

// The stored value a column's declared DEFAULT gives an INSERT that omits the
// column, read from the same `defaultValue` the DDL writes after DEFAULT: a
// quoted literal is its text, NULL is SQL NULL, a numeric literal its number.
function columnDefault(column) {
  const declared = column.defaultValue;
  if (declared === undefined) return {state: DEFAULT_STATE.NONE};
  if (typeof declared === 'number') {
    return {state: DEFAULT_STATE.DECLARED, value: storedLiteralValue(column, declared)};
  }
  const literal = String(declared).trim();
  if (literal.length >= 2 && literal.startsWith(SQL_STRING_QUOTE) &&
      literal.endsWith(SQL_STRING_QUOTE)) {
    return {state: DEFAULT_STATE.DECLARED, value: literal.slice(1, -1)
      .replaceAll(SQL_STRING_QUOTE + SQL_STRING_QUOTE, SQL_STRING_QUOTE)};
  }
  if (literal.toLowerCase() === SQL_NULL_LITERAL) {
    return {state: DEFAULT_STATE.DECLARED, value: null};
  }
  if (SQL_NUMERIC_LITERAL.test(literal)) {
    return {state: DEFAULT_STATE.DECLARED, value: storedLiteralValue(column, literal)};
  }
  throw new Error(`column ${column.name}: DEFAULT ${literal} has no literal stored value`);
}

function isNotNullColumn(schema, column) {
  return column.notNull === true || column.primaryKey === true ||
    (schema.primaryKey || []).includes(column.name);
}

const NOT_NULL_DEFAULTS = Object.freeze({
  services: Object.freeze({
    service_id: 'service-1', service_type: 'partition', node_id: 'node-1',
    status: 'active', created_at: 1, updated_at: 1,
  }),
  nodes: Object.freeze({
    node_id: 'node-1', node_address: 'ws://127.0.0.1:8080', cpu_cores: 4, memory_mb: 4096,
    disk_gb: 64, status: 'active', connection_state: 'connected', last_heartbeat: 1,
    boot_incarnation: 1, latency_assignment_state: 'unassigned', created_at: 1,
  }),
  // JSON list columns hold JSON text, never the typed placeholder.
  control_plane_publications: Object.freeze({
    published_active_node_ids: '[]', required_ack_node_ids: '[]',
    acknowledged_node_ids: '[]', transition_history: '[]',
  }),
  replica_operations: Object.freeze({
    operation_id: 'operation-1', type: 'ADD', partition_id: 'partition-1',
    entity_type: 'table', entity_id: 'table-1', source_node_id: 'node-1',
    target_node_id: 'node-2', status: 'pending', workflow_step: 'PENDING', created_at: 1,
    updated_at: 1, steps_history: '[]',
  }),
});

// A NOT NULL column without a declared value: a typed placeholder.
function placeholderValue(column) {
  return column.type === 'TEXT' ? `${column.name}-1` : 1;
}

function omittedColumnValue(schema, column) {
  const declared = NOT_NULL_DEFAULTS[schema.tableName] || {};
  if (Object.hasOwn(declared, column.name)) return declared[column.name];
  const declaredDefault = columnDefault(column);
  if (declaredDefault.state === DEFAULT_STATE.DECLARED) return declaredDefault.value;
  return isNotNullColumn(schema, column) ? placeholderValue(column) : null;
}

function storedRow(schema, overrides) {
  const columns = schema.columns.map((column) => column.name);
  for (const key of Object.keys(overrides)) {
    if (!columns.includes(key)) {
      throw new Error(`${schema.tableName} has no stored column ${key}`);
    }
  }
  const row = {};
  for (const column of schema.columns) {
    row[column.name] = Object.hasOwn(overrides, column.name) ?
      overrides[column.name] :
      omittedColumnValue(schema, column);
  }
  return row;
}

/**
 * A production-shaped stored row of any system table.
 * @param {string} tableName the system table
 * @param {Object} overrides stored column values
 * @return {Object} the complete stored row
 */
function systemTableRow(tableName, overrides = {}) {
  const schema = getSchemaByTableName(tableName);
  if (!schema) throw new Error(`${tableName} is not a system table`);
  return storedRow(schema, overrides);
}

/**
 * The row a SQL table stores for an INSERT of exactly `values`: each omitted
 * (or undefined) column takes its declared DEFAULT, else NULL; omitting a NOT NULL column
 * without a DEFAULT throws, as the table refuses that INSERT. For test SQL
 * fakes that store inserted rows.
 * @param {string} tableName the system table
 * @param {Object} values the inserted stored column values
 * @return {Object} the stored row
 */
function sqlInsertedSystemTableRow(tableName, values) {
  const schema = getSchemaByTableName(tableName);
  if (!schema) throw new Error(`${tableName} is not a system table`);
  // An undefined value binds no value: the column is omitted.
  const row = Object.fromEntries(Object.entries(values)
    .filter(([, value]) => value !== undefined));
  for (const column of schema.columns) {
    if (Object.hasOwn(row, column.name)) continue;
    const declaredDefault = columnDefault(column);
    if (declaredDefault.state === DEFAULT_STATE.DECLARED) {
      row[column.name] = declaredDefault.value;
    } else if (isNotNullColumn(schema, column)) {
      throw new Error(`NOT NULL constraint failed: ${tableName}.${column.name}`);
    } else {
      row[column.name] = null;
    }
  }
  return row;
}

function servicesRow(overrides = {}) {
  return storedRow(SERVICES_SCHEMA, overrides);
}

function nodesRow(overrides = {}) {
  return storedRow(NODES_SCHEMA, overrides);
}

function replicaOperationsRow(overrides = {}) {
  return storedRow(REPLICA_OPERATIONS_SCHEMA, overrides);
}

/**
 * The projected replica (src/rebalancer/projected-replica.js) of a
 * production-shaped services row: what getCurrentReplicas returns for that
 * row. Overrides are stored column names, as for servicesRow.
 * @param {Object} overrides stored services column values
 * @return {Object} the frozen projected replica
 */
function projectedReplica(overrides = {}) {
  return projectReplicaFromServicesRow(decodeServicesRow(servicesRow(overrides)));
}

export {
  nodesRow,
  projectedReplica,
  replicaOperationsRow,
  servicesRow,
  sqlInsertedSystemTableRow,
  systemTableRow,
};
