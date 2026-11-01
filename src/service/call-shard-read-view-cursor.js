/**
 * Owner of deterministic keyset cursor planning, validation, and SQL query
 * construction for Call-shard paged execution (Q3).
 */

import {createHash} from 'node:crypto';
import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  CallCellRoutingError,
} from './call-cell-routing-contract.js';
import {
  compareCanonicalStrings,
  encodeCanonicalPartialValue,
  isWellFormedUnicode,
} from './call-canonical-partial-codec.js';

const PAGED_EXECUTION_ERROR_CODE = Object.freeze({
  ATTEMPT_DISCARDED: 'ATTEMPT_DISCARDED',
  CURSOR_INVALID: 'CURSOR_INVALID',
  DELIVERY_CONFLICT: 'DELIVERY_CONFLICT',
  INVALID_STATE_SCHEMA: 'INVALID_STATE_SCHEMA',
  KEYSET_ORDER_REQUIRED: 'KEYSET_ORDER_REQUIRED',
  PAGE_BUDGET_EXCEEDED: 'PAGE_BUDGET_EXCEEDED',
  READ_VIEW_EXPIRED: 'READ_VIEW_EXPIRED',
  READ_VIEW_LOST: 'READ_VIEW_LOST',
  READ_VIEW_UNAVAILABLE: 'READ_VIEW_UNAVAILABLE',
  SHARD_BYTE_BUDGET_EXCEEDED: 'SHARD_BYTE_BUDGET_EXCEEDED',
  SHARD_ROW_BUDGET_EXCEEDED: 'SHARD_ROW_BUDGET_EXCEEDED',
  STATE_BUDGET_EXCEEDED: 'STATE_BUDGET_EXCEEDED',
  UNSUPPORTED_ACCUMULATOR_OPERATION: 'UNSUPPORTED_ACCUMULATOR_OPERATION',
});

const PAGED_CONSISTENCY_SCOPE = 'per_shard_retained_read_view';
const CURSOR_VERSION = 'lagrange.call-page-cursor.v1';
const COMPARATOR_VERSION = 'sqlite-binary-asc.v1';
const HASH_ALG = 'sha256';
const HEX_ENCODING = 'hex';
const UTF8_ENCODING = 'utf8';
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const QUALIFIED_IDENTIFIER_PATTERN =
  /^(?:[A-Za-z_][A-Za-z0-9_]*\.)?(?<col>[A-Za-z_][A-Za-z0-9_]*)(?:\s+asc)?$/iu;
const FORBIDDEN_ORDER_PATTERN =
  /\b(?:rowid|_rowid_|oid|random\s*\(|collate\s+(?!binary\b)[A-Za-z0-9_]+)\b/iu;
const ORDER_BY_EXTRACT_PATTERN =
  /\border\s+by\s+(?<clause>[^;]+?)(?:\s+limit\b|\s*$)/iu;
const TRAILING_ORDER_OR_LIMIT_PATTERN =
  /\s+(?:order\s+by\s+[^;]+?|limit\s+[^;]+?)\s*;?\s*$/iu;
const WHERE_SPLIT_PATTERN =
  /^(?<prefix>[\s\S]+?\bfrom\s+[A-Za-z_][A-Za-z0-9_]*)(?:\s+where\s+(?<where>[\s\S]+))?$/iu;
const TRAILING_SEMICOLON_PATTERN = /;\s*$/u;
const COMMA_SPLIT = ',';
const DOT_SPLIT = '.';
const DEFAULT_PAGE_ROW_BOUND = 4096;
const ZERO_NUMBER = 0;
const ONE_NUMBER = 1;
const NEGATIVE_ONE = -1;
const KEY_CONJUNCT_JOIN = ' AND ';
const KEY_DISJUNCT_JOIN = ' OR ';
const EMPTY_STRING = '';

const PAGED_ERROR_MSG = Object.freeze({
  CURSOR_ADVANCE_REQUIRED: 'Cursor must advance strictly in keyset order and pageIndex',
  CURSOR_FIELDS_REQUIRED: 'Keyset cursor requires valid keyColumns, lastKeyTuple, and pageIndex',
  CURSOR_HEADER_INVALID: 'Cursor version or comparatorVersion is invalid',
  CURSOR_KEYS_MISMATCH: 'Cursor keyColumns do not match the operation keyset order',
  CURSOR_READ_VIEW_MISMATCH: 'Cursor readViewId does not match the active retained read view',
  CURSOR_TUPLE_MALFORMED: 'Cursor lastKeyTuple is malformed',
  CURSOR_VIEW_REQUIRED: 'Keyset cursor requires a non-empty readViewId',
  FORBIDDEN_ORDER: 'Selector ORDER BY contains forbidden rowid or non-binary collation',
  INVALID_ORDER_ITEM: 'Non-deterministic or unsupported ORDER BY item',
  INVALID_PAGE_BOUND: 'pageRowBound must be a positive safe integer',
  INVALID_PAGE_KEY: 'Declared pageKey must be a non-empty list of valid column identifiers',
  MISSING_ORDER_OR_KEY: 'Paged execution requires an explicit pageKey or deterministic ORDER BY',
  MISSING_ROW_KEY: 'Row key column is missing or not a valid key scalar',
  PAGE_BYTES_EXCEEDED: 'Page SQL result bytes exceeded bound',
  ROW_ORDER_VIOLATED: 'Page rows violated strict ascending keyset order',
  SQL_DECOMPOSE_FAILED: 'Statement could not be decomposed for keyset paging',
  TUPLE_ARRAY_INVALID: 'Keyset tuples must be non-empty arrays of identical length',
  TUPLE_LENGTH_MISMATCH: 'lastKeyTuple length does not match keyColumns',
  TUPLE_SCALAR_MISMATCH: 'Keyset tuple elements must have matching finite-number or string types',
});

const PAGED_ERROR_TO_ROUTE_CODE = Object.freeze({
  [PAGED_EXECUTION_ERROR_CODE.ATTEMPT_DISCARDED]:
    CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE,
  [PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID]:
    CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
  [PAGED_EXECUTION_ERROR_CODE.DELIVERY_CONFLICT]:
    CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE,
  [PAGED_EXECUTION_ERROR_CODE.INVALID_STATE_SCHEMA]:
    CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT,
  [PAGED_EXECUTION_ERROR_CODE.KEYSET_ORDER_REQUIRED]:
    CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
  [PAGED_EXECUTION_ERROR_CODE.PAGE_BUDGET_EXCEEDED]:
    CALL_CELL_ROUTE_ERROR_CODE.BATCH_BOUND_EXCEEDED,
  [PAGED_EXECUTION_ERROR_CODE.READ_VIEW_EXPIRED]:
    CALL_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
  [PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST]:
    CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
  [PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE]:
    CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
  [PAGED_EXECUTION_ERROR_CODE.SHARD_BYTE_BUDGET_EXCEEDED]:
    CALL_CELL_ROUTE_ERROR_CODE.BATCH_BOUND_EXCEEDED,
  [PAGED_EXECUTION_ERROR_CODE.SHARD_ROW_BUDGET_EXCEEDED]:
    CALL_CELL_ROUTE_ERROR_CODE.BATCH_BOUND_EXCEEDED,
  [PAGED_EXECUTION_ERROR_CODE.STATE_BUDGET_EXCEEDED]:
    CALL_CELL_ROUTE_ERROR_CODE.BATCH_BOUND_EXCEEDED,
  [PAGED_EXECUTION_ERROR_CODE.UNSUPPORTED_ACCUMULATOR_OPERATION]:
    CALL_CELL_ROUTE_ERROR_CODE.NOT_INVOCABLE,
});

function sha256Hex(text) {
  return createHash(HASH_ALG).update(text, UTF8_ENCODING).digest(HEX_ENCODING);
}

function defaultPagedClassification(pagedCode) {
  return pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST ||
    pagedCode === PAGED_EXECUTION_ERROR_CODE.ATTEMPT_DISCARDED ?
    CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE :
    CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL;
}

function createPagedRoutingError(pagedCode, message, options = {}) {
  const routeCode = options.routeCode ||
    PAGED_ERROR_TO_ROUTE_CODE[pagedCode] ||
    CALL_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED;
  const classification = options.classification ||
    defaultPagedClassification(pagedCode);
  const error = new CallCellRoutingError(
    routeCode,
    `${pagedCode}: ${message}`,
    {cause: options.cause, classification, invoked: Boolean(options.invoked)},
  );
  error.pagedCode = pagedCode;
  error.reason = pagedCode;
  error.wholeAttemptDiscard = options.wholeAttemptDiscard ?? true;
  return error;
}

function normalizeColumnIdentifier(rawCol) {
  const trimmed = String(rawCol ?? EMPTY_STRING).trim();
  if (FORBIDDEN_ORDER_PATTERN.test(trimmed)) return null;
  const match = QUALIFIED_IDENTIFIER_PATTERN.exec(trimmed);
  const col = match?.groups?.col;
  if (!col || FORBIDDEN_ORDER_PATTERN.test(col) || !IDENTIFIER_PATTERN.test(col)) {
    return null;
  }
  return col;
}

function parseExplicitPageKey(pageKey) {
  const list = typeof pageKey === 'string' ? [pageKey] : pageKey;
  if (!Array.isArray(list) || list.length === ZERO_NUMBER) return null;
  const normalized = [];
  for (const item of list) {
    const col = normalizeColumnIdentifier(item);
    if (!col) return null;
    normalized.push(col);
  }
  return Object.freeze(normalized);
}

function resolveDeterministicKeyColumns(statement, options = {}) {
  const sqlText = String(statement ?? EMPTY_STRING);
  if (FORBIDDEN_ORDER_PATTERN.test(sqlText)) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.KEYSET_ORDER_REQUIRED,
      PAGED_ERROR_MSG.FORBIDDEN_ORDER,
    );
  }
  if (options.pageKey !== undefined && options.pageKey !== null) {
    const explicit = parseExplicitPageKey(options.pageKey);
    if (!explicit) {
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.KEYSET_ORDER_REQUIRED,
        PAGED_ERROR_MSG.INVALID_PAGE_KEY,
      );
    }
    return explicit;
  }
  const orderMatch = ORDER_BY_EXTRACT_PATTERN.exec(sqlText);
  if (!orderMatch?.groups?.clause) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.KEYSET_ORDER_REQUIRED,
      PAGED_ERROR_MSG.MISSING_ORDER_OR_KEY,
    );
  }
  const cols = [];
  for (const part of orderMatch.groups.clause.split(COMMA_SPLIT)) {
    const col = normalizeColumnIdentifier(part);
    if (!col) {
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.KEYSET_ORDER_REQUIRED,
        PAGED_ERROR_MSG.INVALID_ORDER_ITEM,
      );
    }
    cols.push(col);
  }
  return Object.freeze(cols);
}

function isValidKeyScalar(val) {
  if (typeof val === 'number') return Number.isFinite(val);
  if (typeof val === 'string') return isWellFormedUnicode(val);
  return false;
}

function compareKeyScalars(left, right) {
  if (!isValidKeyScalar(left) || !isValidKeyScalar(right) ||
      typeof left !== typeof right) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
      PAGED_ERROR_MSG.TUPLE_SCALAR_MISMATCH,
    );
  }
  if (typeof left === 'number') {
    if (left < right) return NEGATIVE_ONE;
    return left > right ? ONE_NUMBER : ZERO_NUMBER;
  }
  return compareCanonicalStrings(left, right);
}

function compareKeyTuples(leftTuple, rightTuple) {
  if (!Array.isArray(leftTuple) || !Array.isArray(rightTuple) ||
      leftTuple.length === ZERO_NUMBER ||
      leftTuple.length !== rightTuple.length) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
      PAGED_ERROR_MSG.TUPLE_ARRAY_INVALID,
    );
  }
  for (let idx = ZERO_NUMBER; idx < leftTuple.length; idx += ONE_NUMBER) {
    const cmp = compareKeyScalars(leftTuple[idx], rightTuple[idx]);
    if (cmp !== ZERO_NUMBER) return cmp;
  }
  return ZERO_NUMBER;
}

function isValidCursorInput(keyColumns, lastKeyTuple, pageIndex) {
  return Array.isArray(keyColumns) && keyColumns.length > ZERO_NUMBER &&
    Array.isArray(lastKeyTuple) && lastKeyTuple.length === keyColumns.length &&
    lastKeyTuple.every(isValidKeyScalar) &&
    Number.isInteger(pageIndex) && pageIndex >= ZERO_NUMBER;
}

function buildKeysetPageCursor({readViewId, keyColumns, lastKeyTuple, pageIndex}) {
  if (typeof readViewId !== 'string' || readViewId.length === ZERO_NUMBER) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
      PAGED_ERROR_MSG.CURSOR_VIEW_REQUIRED,
    );
  }
  if (!isValidCursorInput(keyColumns, lastKeyTuple, pageIndex)) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
      PAGED_ERROR_MSG.CURSOR_FIELDS_REQUIRED,
    );
  }
  const core = {
    comparatorVersion: COMPARATOR_VERSION,
    keyColumns: Object.freeze([...keyColumns]),
    lastKeyTuple: Object.freeze([...lastKeyTuple]),
    pageIndex,
    readViewId,
    version: CURSOR_VERSION,
  };
  const cursorJson = encodeCanonicalPartialValue(core);
  const cursorDigest = sha256Hex(cursorJson);
  return Object.freeze({...core, cursorDigest, cursorJson});
}

function arrayShallowEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) ||
      left.length !== right.length) {
    return false;
  }
  for (let idx = ZERO_NUMBER; idx < left.length; idx += ONE_NUMBER) {
    if (left[idx] !== right[idx]) return false;
  }
  return true;
}

function validateCursorHeader(cursor, expected) {
  if (!cursor || typeof cursor !== 'object' ||
      cursor.version !== CURSOR_VERSION ||
      cursor.comparatorVersion !== COMPARATOR_VERSION) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
      PAGED_ERROR_MSG.CURSOR_HEADER_INVALID,
    );
  }
  if (expected.readViewId && cursor.readViewId !== expected.readViewId) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
      PAGED_ERROR_MSG.CURSOR_READ_VIEW_MISMATCH,
    );
  }
  if (expected.keyColumns &&
      !arrayShallowEqual(cursor.keyColumns, expected.keyColumns)) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
      PAGED_ERROR_MSG.CURSOR_KEYS_MISMATCH,
    );
  }
}

function validateKeysetPageCursor(cursor, expected = {}) {
  validateCursorHeader(cursor, expected);
  if (!Array.isArray(cursor.lastKeyTuple) ||
      cursor.lastKeyTuple.length !== cursor.keyColumns.length ||
      !cursor.lastKeyTuple.every(isValidKeyScalar)) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
      PAGED_ERROR_MSG.CURSOR_TUPLE_MALFORMED,
    );
  }
  const prev = expected.previousCursor;
  if (!prev) return Object.freeze({cursor, samePosition: false});
  const cmp = compareKeyTuples(cursor.lastKeyTuple, prev.lastKeyTuple);
  if (cursor.pageIndex === prev.pageIndex && cmp === ZERO_NUMBER) {
    return Object.freeze({cursor, samePosition: true});
  }
  if (cursor.pageIndex !== prev.pageIndex + ONE_NUMBER || cmp <= ZERO_NUMBER) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
      PAGED_ERROR_MSG.CURSOR_ADVANCE_REQUIRED,
    );
  }
  return Object.freeze({cursor, samePosition: false});
}

function stripOrderAndLimit(statement) {
  let cleaned = String(statement ?? EMPTY_STRING).trim().replace(
    TRAILING_SEMICOLON_PATTERN,
    EMPTY_STRING,
  );
  while (TRAILING_ORDER_OR_LIMIT_PATTERN.test(cleaned)) {
    cleaned = cleaned.replace(TRAILING_ORDER_OR_LIMIT_PATTERN, EMPTY_STRING);
  }
  return cleaned;
}

function buildKeysetInequalityClause(keyColumns, lastKeyTuple) {
  const disjuncts = [];
  const tupleParams = [];
  for (let outer = ZERO_NUMBER; outer < keyColumns.length; outer += ONE_NUMBER) {
    const conjuncts = [];
    for (let inner = ZERO_NUMBER; inner < outer; inner += ONE_NUMBER) {
      conjuncts.push(`${keyColumns[inner]} = ?`);
      tupleParams.push(lastKeyTuple[inner]);
    }
    conjuncts.push(`${keyColumns[outer]} > ?`);
    tupleParams.push(lastKeyTuple[outer]);
    disjuncts.push(`(${conjuncts.join(KEY_CONJUNCT_JOIN)})`);
  }
  return {clause: `(${disjuncts.join(KEY_DISJUNCT_JOIN)})`, tupleParams};
}

function appendKeysetTupleFilter(
  whereParts,
  params,
  resolvedKeys,
  lastKeyTuple,
) {
  if (lastKeyTuple === null || lastKeyTuple === undefined) {
    return;
  }
  if (!Array.isArray(lastKeyTuple) ||
      lastKeyTuple.length !== resolvedKeys.length) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
      PAGED_ERROR_MSG.TUPLE_LENGTH_MISMATCH,
    );
  }
  const keyset = buildKeysetInequalityClause(resolvedKeys, lastKeyTuple);
  whereParts.push(keyset.clause);
  params.push(...keyset.tupleParams);
}

function buildKeysetPageQuery(options) {
  const {statement, keyColumns, lastKeyTuple} = options;
  const boundParameters = options.boundParameters ?? [];
  const pageRowBound = options.pageRowBound ?? DEFAULT_PAGE_ROW_BOUND;
  const resolvedKeys =
    Array.isArray(keyColumns) && keyColumns.length > ZERO_NUMBER ?
      keyColumns :
      resolveDeterministicKeyColumns(statement);
  if (!Number.isSafeInteger(pageRowBound) || pageRowBound <= ZERO_NUMBER) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.PAGE_BUDGET_EXCEEDED,
      PAGED_ERROR_MSG.INVALID_PAGE_BOUND,
    );
  }
  const baseSql = stripOrderAndLimit(statement);
  const splitMatch = WHERE_SPLIT_PATTERN.exec(baseSql);
  if (!splitMatch?.groups?.prefix) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.KEYSET_ORDER_REQUIRED,
      PAGED_ERROR_MSG.SQL_DECOMPOSE_FAILED,
    );
  }
  const params = [...boundParameters];
  const whereParts = [];
  if (splitMatch.groups.where) whereParts.push(`(${splitMatch.groups.where})`);
  appendKeysetTupleFilter(whereParts, params, resolvedKeys, lastKeyTuple);
  const whereClause = whereParts.length > ZERO_NUMBER ?
    ` WHERE ${whereParts.join(KEY_CONJUNCT_JOIN)}` :
    EMPTY_STRING;
  const orderClause =
    ` ORDER BY ${resolvedKeys.map((col) => `${col} ASC`).join(', ')}`;
  const sql = `${splitMatch.groups.prefix}${whereClause}${orderClause} LIMIT ${pageRowBound}`;
  return Object.freeze({
    keyColumns: Object.freeze([...resolvedKeys]),
    parameters: Object.freeze(params),
    sql,
  });
}

function extractKeyTupleFromRow(row, keyColumns) {
  const tuple = [];
  for (const col of keyColumns) {
    const shortName = col.includes(DOT_SPLIT) ?
      col.split(DOT_SPLIT).at(NEGATIVE_ONE) :
      col;
    const val = row?.[shortName] ?? row?.[col];
    if (!isValidKeyScalar(val)) {
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
        PAGED_ERROR_MSG.MISSING_ROW_KEY,
      );
    }
    tuple.push(val);
  }
  return Object.freeze(tuple);
}

function measureAndVerifyPageRows(rows, keyColumns, prevTuple, pageByteBound) {
  let totalBytes = ZERO_NUMBER;
  let lastTuple = prevTuple;
  for (const row of rows) {
    totalBytes += Buffer.byteLength(JSON.stringify(row), UTF8_ENCODING);
    if (totalBytes > pageByteBound) {
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.SHARD_BYTE_BUDGET_EXCEEDED,
        PAGED_ERROR_MSG.PAGE_BYTES_EXCEEDED,
      );
    }
    const tuple = extractKeyTupleFromRow(row, keyColumns);
    if (lastTuple !== null && compareKeyTuples(tuple, lastTuple) <= ZERO_NUMBER) {
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
        PAGED_ERROR_MSG.ROW_ORDER_VIOLATED,
      );
    }
    lastTuple = tuple;
  }
  return {lastTuple, pageBytes: totalBytes};
}

export {
  COMPARATOR_VERSION,
  CURSOR_VERSION,
  PAGED_CONSISTENCY_SCOPE,
  PAGED_EXECUTION_ERROR_CODE,
  buildKeysetPageCursor,
  buildKeysetPageQuery,
  compareKeyTuples,
  createPagedRoutingError,
  extractKeyTupleFromRow,
  measureAndVerifyPageRows,
  resolveDeterministicKeyColumns,
  sha256Hex,
  validateKeysetPageCursor,
};
