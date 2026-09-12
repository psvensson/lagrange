// The SQL-engine SEAM of the cold-formation harness model.
//
// The membership-consistency harness proves cache-level membership consistency
// and does not need a real SQL engine over per-node partitions to do it; the
// seven-node probe runs the real engine. So the engine is a seam here: an
// object that answers the system-table statements the harness sends from the
// node's cache. What makes it a seam rather than a stand-in is the contract:
// test/query/sql-engine-system-table-contract-cases.js runs against the real
// engine and against this object, and the registry pair
// `sql-engine-cache-membership` names both runs, so the derived model lists
// the engine as seamed-here, real-there and goes red if either pointer dangles.

import {SYSTEM_TABLE_NAME} from '../../../src/bootstrap/system-table-schemas-constants.js';
import {CDC_OPERATION} from '../../../src/constants/index.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);

const SEAM_ID = 'sql-engine-cache-membership';
const STATEMENT = /^\s*(select|insert|update|delete)\s+/iu;
// The CDC owner writes publications with INSERT OR REPLACE (cdc-emitter):
// an upsert by primary key.
const INSERT_OR_REPLACE = /^\s*insert\s+or\s+replace\s+into\s+([a-z_]+)\s*\(([^)]*)\)/iu;
const SELECT_FROM = /\bfrom\s+([a-z_]+)/iu;
const INSERT_INTO = /^\s*insert\s+into\s+([a-z_]+)\s*\(([^)]*)\)/iu;
const UPDATE_SET = /^\s*update\s+([a-z_]+)\s+set\s+(.*?)\s+where\s+([a-z_]+)\s*=\s*\?/iu;
const DELETE_FROM = /^\s*delete\s+from\s+([a-z_]+)\s+where\s+([a-z_]+)\s*=\s*\?/iu;
const WHERE_EQ = /\bwhere\s+([a-z_]+)\s*=\s*\?/iu;
const COLUMN_SEPARATOR = ',';
const ASSIGNMENT = /([a-z_]+)\s*=\s*\?/giu;
const MALFORMED_ERROR = 'sql-engine-seam: malformed statement';
const UNKNOWN_TABLE_ERROR = 'sql-engine-seam: not a system table: ';
const KEY_FIELDS = Object.freeze({
  [SYSTEM_TABLE_NAME.NODES]: 'node_id',
  [SYSTEM_TABLE_NAME.SERVICES]: 'service_id',
  [SYSTEM_TABLE_NAME.REPLICA_OPERATIONS]: 'operation_id',
  [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS]: 'publication_id',
});

function tableOf(name) {
  const table = stringToLowerCase(stringTrim(name));
  return Object.prototype.hasOwnProperty.call(KEY_FIELDS, table) ? table : null;
}

function failure(error) {
  return {success: false, rows: [], error};
}

function selectRows(cache, sql, params) {
  const match = SELECT_FROM.exec(sql);
  const table = match ? tableOf(match[1]) : null;
  if (!table) return failure(`${UNKNOWN_TABLE_ERROR}${match ? match[1] : sql}`);
  let rows = cache.getAll(table) || [];
  const where = WHERE_EQ.exec(sql);
  if (where && params.length > 0) {
    const field = stringToLowerCase(where[1]);
    rows = arrayFilter(rows, (row) => row[field] === params[0]);
  }
  return {success: true, rows};
}

function insertRow(cache, sql, params) {
  const upsert = INSERT_OR_REPLACE.exec(sql);
  const match = upsert || INSERT_INTO.exec(sql);
  const table = match ? tableOf(match[1]) : null;
  if (!table) return failure(`${UNKNOWN_TABLE_ERROR}${match ? match[1] : sql}`);
  const columns = arrayFilter(
    arrayMap(stringSplit(match[2], COLUMN_SEPARATOR), (column) => stringTrim(column)), Boolean);
  const row = {};
  columns.forEach((column, index) => {
    row[stringToLowerCase(column)] = params[index];
  });
  const replaces = upsert && cache.get(table, row[KEY_FIELDS[table]]);
  cache.applySystemTableChange(table,
    replaces ? CDC_OPERATION.UPDATE : CDC_OPERATION.INSERT, row);
  return {success: true, rows: [], affectedRows: 1};
}

function updateRow(cache, sql, params) {
  const match = UPDATE_SET.exec(sql);
  const table = match ? tableOf(match[1]) : null;
  if (!table) return failure(`${UNKNOWN_TABLE_ERROR}${match ? match[1] : sql}`);
  const assignments = arrayMap([...match[2].matchAll(ASSIGNMENT)], (m) => stringToLowerCase(m[1]));
  const keyField = stringToLowerCase(match[3]);
  const key = params[assignments.length];
  const existing = cache.get(table, key);
  if (!existing) return {success: true, rows: [], affectedRows: 0};
  const merged = {...existing};
  assignments.forEach((field, index) => {
    merged[field] = params[index];
  });
  merged[keyField] = key;
  cache.applySystemTableChange(table, CDC_OPERATION.UPDATE, merged);
  return {success: true, rows: [], affectedRows: 1};
}

function deleteRow(cache, sql, params) {
  const match = DELETE_FROM.exec(sql);
  const table = match ? tableOf(match[1]) : null;
  if (!table) return failure(`${UNKNOWN_TABLE_ERROR}${match ? match[1] : sql}`);
  const existing = cache.get(table, params[0]);
  if (!existing) return {success: true, rows: [], affectedRows: 0};
  cache.applySystemTableChange(table, CDC_OPERATION.DELETE, existing);
  return {success: true, rows: [], affectedRows: 1};
}

/**
 * The seam: an engine over one node's cache.
 * @param {object} cache a real SystemTableCache
 * @return {{executeQuery: Function, seamId: string}}
 */
export function createSqlEngineSeam(cache) {
  return Object.freeze({
    seamId: SEAM_ID,
    async executeQuery(sql, params = []) {
      const verb = STATEMENT.exec(String(sql || ''));
      if (!verb) return failure(MALFORMED_ERROR);
      const kind = stringToLowerCase(verb[1]);
      const args = Array.isArray(params) ? params : [];
      if (kind === 'select') return selectRows(cache, sql, args);
      if (kind === 'insert') return insertRow(cache, sql, args);
      if (kind === 'update') return updateRow(cache, sql, args);
      return deleteRow(cache, sql, args);
    },
  });
}

export const SQL_ENGINE_SEAM_ID = SEAM_ID;
