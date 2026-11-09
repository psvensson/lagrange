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

import {
  SYSTEM_CACHE_KEY_DESCRIPTOR,
} from '../../../src/cache/system-cache-key-descriptor.js';
import {CDC_OPERATION} from '../../../src/constants/index.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);

const SEAM_ID = 'sql-engine-cache-membership';
const STATEMENT = /^\s*(select|insert|update|delete)\s+/iu;
const SELECT_STATEMENT = new RegExp(
  '^\\s*select\\s+([\\s\\S]+?)\\s+from\\s+([a-z_]+)' +
  '(?:\\s+where\\s+([\\s\\S]+?))?' +
  '(?:\\s+order\\s+by\\s+[\\s\\S]+?)?' +
  '(?:\\s+limit\\s+(\\d+))?\\s*;?\\s*$',
  'iu',
);
const COUNT_PROJECTION = /^\s*count\s*\(\s*\*\s*\)\s+as\s+([a-z_]+)\s*$/iu;
// The CDC owner writes publications with INSERT OR REPLACE (cdc-emitter) and
// idempotent reservations/endpoints with INSERT OR IGNORE.
const INSERT_STATEMENT = new RegExp(
  '^\\s*insert\\s+(?:(or\\s+replace|or\\s+ignore)\\s+)?' +
  'into\\s+([a-z_]+)\\s*\\(([^)]*)\\)',
  'iu',
);
const UPDATE_STATEMENT =
  /^\s*update\s+([a-z_]+)\s+set\s+([\s\S]+?)\s+where\s+([\s\S]+?)\s*;?\s*$/iu;
const DELETE_STATEMENT =
  /^\s*delete\s+from\s+([a-z_]+)\s+where\s+([\s\S]+?)\s*;?\s*$/iu;
const COLUMN_SEPARATOR = ',';
const ASSIGNMENT = /([a-z_]+)\s*=\s*\?/giu;
const PREDICATE_IS_NULL = /^([a-z_]+)\s+is\s+null$/iu;
const PREDICATE_IS_NOT_NULL = /^([a-z_]+)\s+is\s+not\s+null$/iu;
const PREDICATE_IN = /^([a-z_]+)\s+in\s*\(([^)]*)\)$/iu;
const PREDICATE_CMP = /^([a-z_]+)\s*(=|!=|<>|<=|>=|<|>)\s*(\?|'[^']*')$/iu;
const PREDICATE_NOT = /^not\s*\(([\s\S]+)\)$/iu;
const MALFORMED_ERROR = 'sql-engine-seam: malformed statement';
const UNKNOWN_TABLE_ERROR = 'sql-engine-seam: not a system table: ';
const KEY_FIELDS = SYSTEM_CACHE_KEY_DESCRIPTOR;

function tableOf(name) {
  const table = stringToLowerCase(stringTrim(name));
  return Object.prototype.hasOwnProperty.call(KEY_FIELDS, table) ? table : null;
}

function failure(error) {
  return {success: false, rows: [], rowSetComplete: false, error};
}

function stripOuterParens(expression) {
  let text = stringTrim(expression);
  while (stringStartsWith(text, '(') && stringEndsWith(text, ')')) {
    let depth = 0;
    let wrapsWhole = true;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '(') depth += 1;
      if (text[index] === ')') depth -= 1;
      if (depth === 0 && index < text.length - 1) {
        wrapsWhole = false;
        break;
      }
    }
    if (!wrapsWhole) break;
    text = stringTrim(text.slice(1, -1));
  }
  return text;
}

function splitTopLevelOperator(expression, keyword) {
  const parts = [];
  let depth = 0;
  let inQuotes = false;
  let start = 0;
  const pattern = new RegExp(`^\\s+${keyword}\\s+`, 'iu');
  for (let index = 0; index < expression.length; index += 1) {
    const ch = expression[index];
    if (ch === '\'') inQuotes = !inQuotes;
    if (!inQuotes && ch === '(') depth += 1;
    if (!inQuotes && ch === ')') depth -= 1;
    if (!inQuotes && depth === 0) {
      const match = pattern.exec(expression.slice(index));
      if (match) {
        parts.push(expression.slice(start, index));
        index += match[0].length - 1;
        start = index + 1;
      }
    }
  }
  parts.push(expression.slice(start));
  return parts;
}

function resolveValueToken(token, state) {
  const trimmed = stringTrim(token);
  if (trimmed === '?') {
    const value = state.params[state.index];
    state.index += 1;
    return value;
  }
  if (stringStartsWith(trimmed, '\'') && stringEndsWith(trimmed, '\'')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function compareValues(left, operator, right) {
  if (operator === '=') return left === right;
  if (operator === '!=' || operator === '<>') return left !== right;
  if (operator === '<=') return left <= right;
  if (operator === '>=') return left >= right;
  if (operator === '<') return left < right;
  return left > right;
}

function compileAtomicPredicate(clause, state) {
  const nullMatch = PREDICATE_IS_NULL.exec(clause);
  if (nullMatch) {
    const field = stringToLowerCase(nullMatch[1]);
    return (row) => row[field] === null || row[field] === undefined;
  }
  const notNullMatch = PREDICATE_IS_NOT_NULL.exec(clause);
  if (notNullMatch) {
    const field = stringToLowerCase(notNullMatch[1]);
    return (row) => row[field] !== null && row[field] !== undefined;
  }
  const inMatch = PREDICATE_IN.exec(clause);
  if (inMatch) {
    const field = stringToLowerCase(inMatch[1]);
    const tokens = arrayFilter(
      arrayMap(stringSplit(inMatch[2], COLUMN_SEPARATOR), stringTrim),
      Boolean,
    );
    const allowed = new Set(
      arrayMap(tokens, (token) => resolveValueToken(token, state)),
    );
    return (row) => allowed.has(row[field]);
  }
  const cmpMatch = PREDICATE_CMP.exec(clause);
  if (cmpMatch) {
    const field = stringToLowerCase(cmpMatch[1]);
    const operator = cmpMatch[2];
    const expected = resolveValueToken(cmpMatch[3], state);
    return (row) => compareValues(row[field], operator, expected);
  }
  return () => true;
}

function compileWherePredicate(whereClause, state) {
  const trimmed = stripOuterParens(whereClause);
  const orParts = splitTopLevelOperator(trimmed, 'or');
  if (orParts.length > 1) {
    const branches = arrayMap(orParts, (part) =>
      compileWherePredicate(part, state));
    return (row) => arraySome(branches, (branch) => branch(row));
  }
  const andParts = splitTopLevelOperator(trimmed, 'and');
  if (andParts.length > 1) {
    const branches = arrayMap(andParts, (part) =>
      compileWherePredicate(part, state));
    return (row) => arrayEvery(branches, (branch) => branch(row));
  }
  const notMatch = PREDICATE_NOT.exec(trimmed);
  if (notMatch) {
    const inner = compileWherePredicate(notMatch[1], state);
    return (row) => !inner(row);
  }
  return compileAtomicPredicate(trimmed, state);
}

function filterRows(rows, whereClause, params, startIndex = 0) {
  if (!whereClause) return rows;
  const predicate = compileWherePredicate(whereClause, {
    params,
    index: startIndex,
  });
  return arrayFilter(rows, predicate);
}

function selectRows(cache, sql, params) {
  const match = SELECT_STATEMENT.exec(sql);
  if (!match) return failure(MALFORMED_ERROR);
  const table = tableOf(match[2]);
  if (!table) return failure(`${UNKNOWN_TABLE_ERROR}${match[2]}`);
  let rows = filterRows(cache.getAll(table) || [], match[3], params);
  const countMatch = COUNT_PROJECTION.exec(match[1]);
  if (countMatch) {
    rows = [{[stringToLowerCase(countMatch[1])]: rows.length}];
  } else if (match[4]) {
    rows = rows.slice(0, Number(match[4]));
  }
  return {success: true, rows, rowSetComplete: true};
}

function insertRow(cache, sql, params) {
  const match = INSERT_STATEMENT.exec(sql);
  if (!match) return failure(MALFORMED_ERROR);
  const table = tableOf(match[2]);
  if (!table) return failure(`${UNKNOWN_TABLE_ERROR}${match[2]}`);
  const mode = match[1] ? stringToLowerCase(match[1]) : '';
  const columns = arrayFilter(
    arrayMap(stringSplit(match[3], COLUMN_SEPARATOR), stringTrim),
    Boolean,
  );
  const row = {};
  columns.forEach((column, index) => {
    row[stringToLowerCase(column)] = params[index];
  });
  const existing = cache.get(table, row[KEY_FIELDS[table]]);
  if (stringIncludes(mode, 'ignore') && existing) {
    return {success: true, rows: [], affectedRows: 0};
  }
  const replaces = stringIncludes(mode, 'replace') && Boolean(existing);
  cache.applySystemTableChange(
    table,
    replaces ? CDC_OPERATION.UPDATE : CDC_OPERATION.INSERT,
    row,
  );
  return {success: true, rows: [], affectedRows: 1};
}

function updateRow(cache, sql, params) {
  const match = UPDATE_STATEMENT.exec(sql);
  if (!match) return failure(MALFORMED_ERROR);
  const table = tableOf(match[1]);
  if (!table) return failure(`${UNKNOWN_TABLE_ERROR}${match[1]}`);
  const assignments = arrayMap(
    [...match[2].matchAll(ASSIGNMENT)],
    (entry) => stringToLowerCase(entry[1]),
  );
  const matched = filterRows(
    cache.getAll(table) || [],
    match[3],
    params,
    assignments.length,
  );
  if (matched.length === 0) return {success: true, rows: [], affectedRows: 0};
  for (const existing of matched) {
    const merged = {...existing};
    assignments.forEach((field, index) => {
      merged[field] = params[index];
    });
    cache.applySystemTableChange(table, CDC_OPERATION.UPDATE, merged);
  }
  return {success: true, rows: [], affectedRows: matched.length};
}

function deleteRow(cache, sql, params) {
  const match = DELETE_STATEMENT.exec(sql);
  if (!match) return failure(MALFORMED_ERROR);
  const table = tableOf(match[1]);
  if (!table) return failure(`${UNKNOWN_TABLE_ERROR}${match[1]}`);
  const matched = filterRows(cache.getAll(table) || [], match[2], params);
  if (matched.length === 0) return {success: true, rows: [], affectedRows: 0};
  for (const existing of matched) {
    cache.applySystemTableChange(table, CDC_OPERATION.DELETE, existing);
  }
  return {success: true, rows: [], affectedRows: matched.length};
}

/**
 * The seam: an engine over one node's cache.
 * @param {object} cache a real SystemTableCache
 * @param {object} [options]
 * @param {object} [options.queryExecutor] optional partition query executor
 * @return {{executeQuery: Function, seamId: string, queryExecutor?: object}}
 */
export function createSqlEngineSeam(cache, options = {}) {
  return Object.freeze({
    seamId: SEAM_ID,
    ...(options?.queryExecutor ? {queryExecutor: options.queryExecutor} : {}),
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

