/**
 * Canonical producer contract, runtime conformance validator, and AST-based
 * write-footprint extractor for StatementWriteFootprintRecord.
 *
 * Owned by src/partition/. Defines the single authoritative write-footprint
 * shape consumed by participant row-key concurrency control and locking-read
 * reservation checks, rejecting phantom members and fixture drift.
 */

import {SQLParser} from '../query/sql-parser.js';
import {decodeTypedParams} from '../query/sql-value-codec.js';

const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const arrayMap = Function.call.bind(Array.prototype.map);

const NUM_ZERO = 0;
const NUM_ONE = 1;
const FOOTPRINT_FIELD_COUNT = 3;
const MAX_SCOPED_FOOTPRINT_TUPLES = 64;

const FOOTPRINT_FIELD_SCOPED = 'scoped';
const FOOTPRINT_FIELD_ROW_KEYS = 'rowKeys';
const FOOTPRINT_FIELD_PK_TUPLES = 'pkTuples';

const SQLITE_NUMERIC_TEXT_RE = /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/u;

const TYPE_STRING = 'string';
const TYPE_BOOLEAN = 'boolean';
const TYPE_NUMBER = 'number';
const TYPE_OBJECT = 'object';

const AST_KIND_INSERT = 'INSERT';
const AST_KIND_UPDATE = 'UPDATE';
const AST_KIND_DELETE = 'DELETE';
const AST_KIND_SELECT = 'SELECT';

const NODE_TYPE_LITERAL = 'literal';
const NODE_TYPE_UNARY = 'unary';
const NODE_TYPE_PARAMETER = 'parameter';
const NODE_TYPE_COLUMN = 'column';
const NODE_TYPE_COLUMN_REF = 'column_ref';
const NODE_TYPE_BINARY = 'binary';
const NODE_TYPE_IN = 'in';
const NODE_TYPE_SUBQUERY = 'subquery';
const NODE_TYPE_EXISTS = 'exists';

const OP_EQUALS = '=';
const OP_AND = 'AND';
const OP_OR = 'OR';
const OP_PLUS = '+';
const OP_MINUS = '-';

const DIALECT_POSTGRESQL = 'postgresql';
const DIALECT_SQLITE = 'sqlite';
const CONFLICT_MODE_REPLACE = 'replace';
const UNIQUE_TUPLE_KEY_PREFIX = '__uq__:';
const UNIQUE_COLS_JOIN_SEP = ',';
const PG_PARAM_PATTERN = /\$[1-9]\d*/u;

const ERROR_PREFIX_RECORD_NOT_OBJECT =
  'StatementWriteFootprintRecord must be a non-null plain object';
const ERROR_PREFIX_UNKNOWN_PROPERTY =
  'StatementWriteFootprintRecord rejects unrecognized phantom property: ';
const ERROR_PREFIX_MISSING_PROPERTY =
  'StatementWriteFootprintRecord missing required property: ';
const ERROR_PREFIX_INVALID_PROPERTY_TYPE =
  'StatementWriteFootprintRecord invalid type or invariant for property: ';

const STATEMENT_WRITE_FOOTPRINT_KEYS = objectFreeze([
  FOOTPRINT_FIELD_SCOPED,
  FOOTPRINT_FIELD_ROW_KEYS,
  FOOTPRINT_FIELD_PK_TUPLES,
]);

function isPlainObject(value) {
  if (value === null || typeof value !== TYPE_OBJECT || Array.isArray(value)) return false;
  const proto = objectGetPrototypeOf(value);
  return proto === objectPrototype || proto === null;
}

function isNonEmptyString(value) {
  return typeof value === TYPE_STRING && value.length > NUM_ZERO;
}

const MIN_SAFE_PK_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_PK_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const TYPE_BIGINT = 'bigint';
const SQLITE_INT64_BITS = 64;

function isScalarPkValue(value) {
  return typeof value === TYPE_STRING ||
    (typeof value === TYPE_NUMBER && Number.isFinite(value)) ||
    (typeof value === TYPE_BIGINT && BigInt.asIntN(SQLITE_INT64_BITS, value) === value);
}

const CANONICAL_INT64_TEXT_RE = /^-?[1-9]\d{15,18}$/u;

function isCanonicalPkScalar(value) {
  if (typeof value === TYPE_NUMBER) return Number.isSafeInteger(value);
  if (typeof value === TYPE_BIGINT) return BigInt.asIntN(SQLITE_INT64_BITS, value) === value;
  if (typeof value !== TYPE_STRING || value.length === NUM_ZERO) return false;
  if (!SQLITE_NUMERIC_TEXT_RE.test(value)) return true;
  const parsed = Number(value);
  if (Number.isSafeInteger(parsed) && String(parsed) === value) return true;
  if (!CANONICAL_INT64_TEXT_RE.test(value)) return false;
  const bigVal = BigInt(value);
  return BigInt.asIntN(SQLITE_INT64_BITS, bigVal) === bigVal &&
    (bigVal < MIN_SAFE_PK_BIGINT || bigVal > MAX_SAFE_PK_BIGINT);
}

function normalizePkScalar(value) {
  if (typeof value === TYPE_NUMBER) return Object.is(value, -0) ? NUM_ZERO : value;
  if (typeof value !== TYPE_BIGINT) return value;
  return value >= MIN_SAFE_PK_BIGINT && value <= MAX_SAFE_PK_BIGINT ?
    Number(value) : value.toString();
}

function encodeCanonicalPkTupleKey(tuple) {
  const items = Array.isArray(tuple) ? tuple : [tuple];
  if (items.length === NUM_ZERO) return '';
  const parts = items.map((item) => String(normalizePkScalar(item)));
  return parts.length === NUM_ONE ? parts[NUM_ZERO] : JSON.stringify(parts);
}

function isValidPkTupleArray(pkTuples, expectedLength) {
  if (!Array.isArray(pkTuples) || pkTuples.length !== expectedLength) return false;
  for (let i = NUM_ZERO; i < pkTuples.length; i += NUM_ONE) {
    const tuple = pkTuples[i];
    if (!Array.isArray(tuple) || tuple.length === NUM_ZERO) return false;
    for (let j = NUM_ZERO; j < tuple.length; j += NUM_ONE) {
      if (!isScalarPkValue(tuple[j])) return false;
    }
  }
  return true;
}

function validateFootprintFields(record) {
  const scoped = record[FOOTPRINT_FIELD_SCOPED];
  if (typeof scoped !== TYPE_BOOLEAN) return FOOTPRINT_FIELD_SCOPED;
  const rowKeys = record[FOOTPRINT_FIELD_ROW_KEYS];
  if (!Array.isArray(rowKeys)) return FOOTPRINT_FIELD_ROW_KEYS;
  for (let i = NUM_ZERO; i < rowKeys.length; i += NUM_ONE) {
    if (!isNonEmptyString(rowKeys[i])) return FOOTPRINT_FIELD_ROW_KEYS;
  }
  if ((!scoped && rowKeys.length > NUM_ZERO) || (scoped && rowKeys.length === NUM_ZERO)) {
    return FOOTPRINT_FIELD_ROW_KEYS;
  }
  const pkTuples = record[FOOTPRINT_FIELD_PK_TUPLES];
  return isValidPkTupleArray(pkTuples, rowKeys.length) ? null : FOOTPRINT_FIELD_PK_TUPLES;
}

/**
 * Validate that a record conforms strictly to StatementWriteFootprintRecord.
 * @param {unknown} value
 * @return {StatementWriteFootprintRecord}
 */
function assertStatementWriteFootprintConformance(value) {
  if (!isPlainObject(value)) throw new TypeError(ERROR_PREFIX_RECORD_NOT_OBJECT);
  const record = value;
  const keys = objectKeys(record);
  for (let i = NUM_ZERO; i < keys.length; i += NUM_ONE) {
    const key = keys[i];
    if (!STATEMENT_WRITE_FOOTPRINT_KEYS.includes(key)) {
      throw new TypeError(`${ERROR_PREFIX_UNKNOWN_PROPERTY}${key}`);
    }
  }
  for (let i = NUM_ZERO; i < STATEMENT_WRITE_FOOTPRINT_KEYS.length; i += NUM_ONE) {
    const expectedKey = STATEMENT_WRITE_FOOTPRINT_KEYS[i];
    if (!objectHasOwn(record, expectedKey)) {
      throw new TypeError(`${ERROR_PREFIX_MISSING_PROPERTY}${expectedKey}`);
    }
  }
  const invalidField = validateFootprintFields(record);
  if (invalidField !== null) {
    throw new TypeError(`${ERROR_PREFIX_INVALID_PROPERTY_TYPE}${invalidField}`);
  }
  return value;
}

/**
 * Type predicate for StatementWriteFootprintRecord.
 * @param {*} value
 * @return {boolean}
 */
function isStatementWriteFootprintRecord(value) {
  if (!isPlainObject(value)) return false;
  const record = value;
  const keys = objectKeys(record);
  if (keys.length !== FOOTPRINT_FIELD_COUNT) return false;
  for (let i = NUM_ZERO; i < keys.length; i += NUM_ONE) {
    if (!STATEMENT_WRITE_FOOTPRINT_KEYS.includes(keys[i])) return false;
  }
  return validateFootprintFields(record) === null;
}

/**
 * Factory for StatementWriteFootprintRecord. Validates conformance before returning.
 *
 * @param {StatementWriteFootprintRecord} fields
 * @return {StatementWriteFootprintRecord}
 */
function createStatementWriteFootprintRecord(fields) {
  assertStatementWriteFootprintConformance(fields);
  const record = {
    scoped: fields.scoped,
    rowKeys: objectFreeze([...fields.rowKeys]),
    pkTuples: objectFreeze(
      arrayMap(fields.pkTuples, (tuple) => objectFreeze([...tuple])),
    ),
  };
  return objectFreeze(record);
}

const UNSCOPED_WRITE_FOOTPRINT = createStatementWriteFootprintRecord({
  scoped: false,
  rowKeys: [],
  pkTuples: [],
});

const UNSCOPED_WHERE_EVAL = objectFreeze({
  scoped: false,
  colMap: null,
  tuples: null,
});

function normalizeColumnList(cols) {
  if (!Array.isArray(cols)) return [];
  const normalized = [];
  for (let i = NUM_ZERO; i < cols.length; i += NUM_ONE) {
    const item = cols[i];
    const raw = typeof item === TYPE_STRING ? item : String(item?.name ?? item?.column ?? '');
    const cleaned = raw.trim().replace(/^["'`]|["'`]$/gu, '').toLowerCase();
    if (cleaned.length > NUM_ZERO) normalized.push(cleaned);
  }
  return normalized;
}

function buildScopedFootprintFromTuples(tuples) {
  if (!Array.isArray(tuples) ||
      tuples.length === NUM_ZERO ||
      tuples.length > MAX_SCOPED_FOOTPRINT_TUPLES) {
    return UNSCOPED_WRITE_FOOTPRINT;
  }
  const seenKeys = new Set();
  const rowKeys = [];
  const pkTuples = [];
  for (let i = NUM_ZERO; i < tuples.length; i += NUM_ONE) {
    const tuple = tuples[i];
    if (!Array.isArray(tuple) || tuple.length === NUM_ZERO) {
      return UNSCOPED_WRITE_FOOTPRINT;
    }
    const rk = encodeCanonicalPkTupleKey(tuple);
    if (rk.length === NUM_ZERO) {
      return UNSCOPED_WRITE_FOOTPRINT;
    }
    if (!seenKeys.has(rk)) {
      seenKeys.add(rk);
      rowKeys.push(rk);
      pkTuples.push(tuple);
    }
  }
  return rowKeys.length > NUM_ZERO && rowKeys.length <= MAX_SCOPED_FOOTPRINT_TUPLES ?
    createStatementWriteFootprintRecord({scoped: true, rowKeys, pkTuples}) :
    UNSCOPED_WRITE_FOOTPRINT;
}

function resolveParameterValue(node, params, ast) {
  const rawIdx = typeof node.index === TYPE_NUMBER ? node.index : -1;
  if (rawIdx < NUM_ZERO || !Array.isArray(params)) return undefined;
  const mapping = ast?._paramMapping;
  const paramIdx = Array.isArray(mapping) && rawIdx < mapping.length ?
    Number(mapping[rawIdx]) - NUM_ONE : rawIdx;
  return paramIdx >= NUM_ZERO && paramIdx < params.length ? params[paramIdx] : undefined;
}

function resolveParameterScalar(node, params, ast) {
  const val = resolveParameterValue(node, params, ast);
  return isCanonicalPkScalar(val) ? normalizePkScalar(val) : undefined;
}

function isExplicitNullNode(node, params, ast) {
  if (!node || typeof node !== TYPE_OBJECT) return false;
  const nodeType = String(node.type ?? '').toLowerCase();
  if (nodeType === NODE_TYPE_LITERAL) return node.value === null;
  if (nodeType === NODE_TYPE_PARAMETER) return resolveParameterValue(node, params, ast) === null;
  return false;
}

function resolveUnaryScalar(node) {
  const op = String(node.operator ?? '');
  if (op !== OP_MINUS && op !== OP_PLUS) {
    return undefined;
  }
  const inner = node.operand ?? node.expr;
  const innerType = String(inner?.type ?? '').toLowerCase();
  if (innerType !== NODE_TYPE_LITERAL ||
      typeof inner.value !== TYPE_NUMBER ||
      !Number.isFinite(inner.value)) {
    return undefined;
  }
  const rawVal = op === OP_MINUS ? -inner.value : inner.value;
  return isCanonicalPkScalar(rawVal) ? normalizePkScalar(rawVal) : undefined;
}

function extractScalarValueFromNode(node, params, ast) {
  if (!node || typeof node !== TYPE_OBJECT) {
    return undefined;
  }
  const nodeType = String(node.type ?? '').toLowerCase();
  if (nodeType === NODE_TYPE_LITERAL) {
    return isCanonicalPkScalar(node.value) ? normalizePkScalar(node.value) : undefined;
  }
  if (nodeType === NODE_TYPE_UNARY) {
    return resolveUnaryScalar(node);
  }
  if (nodeType === NODE_TYPE_PARAMETER) {
    return resolveParameterScalar(node, params, ast);
  }
  return undefined;
}

const ALLOWED_COLUMN_NODE_TYPES = objectFreeze([
  NODE_TYPE_COLUMN,
  NODE_TYPE_COLUMN_REF,
  '',
]);

function extractColumnIdentifierFromNode(node) {
  if (!node || typeof node !== TYPE_OBJECT) return null;
  const nodeType = String(node.type || '').toLowerCase();
  if (!ALLOWED_COLUMN_NODE_TYPES.includes(nodeType)) return null;
  const raw = node.column || node.name;
  if (typeof raw !== TYPE_STRING || raw.length === NUM_ZERO) return null;
  const parts = raw.split('.');
  const stripped = parts[parts.length - NUM_ONE];
  const cleaned = stripped.trim().replace(/^["'`]|["'`]$/gu, '').toLowerCase();
  return cleaned.length > NUM_ZERO ? cleaned : null;
}

function hasReplaceModeText(ast) {
  const mode = String(ast.conflictResolution || ast.insertMode || '').toLowerCase();
  const prefix = String(ast.prefix || '').toLowerCase();
  return mode === CONFLICT_MODE_REPLACE || prefix.includes(CONFLICT_MODE_REPLACE);
}

function hasOnConflictMutation(ast) {
  if (!ast) return false;
  if (ast.orReplace || ast.onConflict || ast.conflict || ast.upsert) return true;
  return hasReplaceModeText(ast);
}

function extractInsertRowTuple(row, targetColCount, columnOffsets, params, ast) {
  if (!Array.isArray(row) || row.length !== targetColCount) return null;
  const tuple = [];
  for (let k = NUM_ZERO; k < columnOffsets.length; k += NUM_ONE) {
    const scalar = extractScalarValueFromNode(row[columnOffsets[k]], params, ast);
    if (scalar === undefined) return null;
    tuple.push(scalar);
  }
  return tuple;
}

function resolveInsertTargetCols(ast, allCols) {
  const hasExplicitCols = Array.isArray(ast.columns) && ast.columns.length > NUM_ZERO;
  return hasExplicitCols ? normalizeColumnList(ast.columns) : allCols;
}

function appendInsertRowUniqueTuples(row, targetCols, uniqueConstraintCols, params, ast, tuples) {
  for (let u = NUM_ZERO; u < uniqueConstraintCols.length; u += NUM_ONE) {
    const uCols = uniqueConstraintCols[u];
    const uVals = [];
    let hasNull = false;
    for (let k = NUM_ZERO; k < uCols.length; k += NUM_ONE) {
      const colIdx = targetCols.indexOf(uCols[k]);
      if (colIdx < NUM_ZERO) return false;
      const cell = row[colIdx];
      if (isExplicitNullNode(cell, params, ast)) {
        hasNull = true;
      } else {
        const scalar = extractScalarValueFromNode(cell, params, ast);
        if (scalar === undefined) return false;
        uVals.push(scalar);
      }
    }
    if (!hasNull) {
      tuples.push([`${UNIQUE_TUPLE_KEY_PREFIX}${uCols.join(UNIQUE_COLS_JOIN_SEP)}`, ...uVals]);
    }
  }
  return true;
}

function extractInsertFootprint(ast, params, pkCols, allCols, uniqueConstraintCols = []) {
  const values = ast.values;
  if (hasOnConflictMutation(ast) || !Array.isArray(values) ||
      values.length === NUM_ZERO || values.length > MAX_SCOPED_FOOTPRINT_TUPLES) {
    return UNSCOPED_WRITE_FOOTPRINT;
  }
  const targetCols = resolveInsertTargetCols(ast, allCols);
  const columnOffsets = pkCols.map((pkCol) => targetCols.indexOf(pkCol));
  if (targetCols.length === NUM_ZERO || columnOffsets.some((idx) => idx < NUM_ZERO)) {
    return UNSCOPED_WRITE_FOOTPRINT;
  }
  const tuples = [];
  for (let r = NUM_ZERO; r < values.length; r += NUM_ONE) {
    const tuple = extractInsertRowTuple(values[r], targetCols.length, columnOffsets, params, ast);
    if (tuple === null) return UNSCOPED_WRITE_FOOTPRINT;
    tuples.push(tuple);
    if (!appendInsertRowUniqueTuples(
      values[r], targetCols, uniqueConstraintCols, params, ast, tuples,
    )) {
      return UNSCOPED_WRITE_FOOTPRINT;
    }
  }
  return buildScopedFootprintFromTuples(tuples);
}

function isDirectSubqueryNode(node) {
  const nodeType = String(node.type || '').toLowerCase();
  return nodeType === NODE_TYPE_SUBQUERY ||
    nodeType === NODE_TYPE_EXISTS ||
    Boolean(node.subquery) ||
    Boolean(node.query);
}

function containsSubqueryInConditions(conditions) {
  if (!Array.isArray(conditions)) return false;
  for (let i = NUM_ZERO; i < conditions.length; i += NUM_ONE) {
    const cond = conditions[i];
    if (cond && (containsSubqueryNode(cond.when) || containsSubqueryNode(cond.thenExpression))) {
      return true;
    }
  }
  return false;
}

function containsSubqueryNode(node) {
  if (!node || typeof node !== TYPE_OBJECT) return false;
  if (Array.isArray(node)) return node.some(containsSubqueryNode);
  if (isDirectSubqueryNode(node)) return true;
  const children = [
    node.left, node.right, node.operand, node.expression, node.expr,
    node.low, node.high, node.pattern, node.elseExpr, node.values, node.args,
  ];
  return children.some(containsSubqueryNode) || containsSubqueryInConditions(node.conditions);
}

function deduplicateScalars(values) {
  const seen = new Set();
  const out = [];
  for (let i = NUM_ZERO; i < values.length; i += NUM_ONE) {
    const v = values[i];
    const key = String(v);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

function buildCartesianTuples(pkCols, colMap) {
  let expectedCount = NUM_ONE;
  for (let i = NUM_ZERO; i < pkCols.length; i += NUM_ONE) {
    const colValues = colMap.get(pkCols[i]);
    if (!colValues || colValues.length === NUM_ZERO) {
      return null;
    }
    expectedCount *= colValues.length;
    if (expectedCount > MAX_SCOPED_FOOTPRINT_TUPLES) {
      return null;
    }
  }
  let acc = [[]];
  for (let i = NUM_ZERO; i < pkCols.length; i += NUM_ONE) {
    const colValues = colMap.get(pkCols[i]);
    const next = [];
    for (let a = NUM_ZERO; a < acc.length; a += NUM_ONE) {
      for (let v = NUM_ZERO; v < colValues.length; v += NUM_ONE) {
        next.push([...acc[a], colValues[v]]);
      }
    }
    acc = next;
  }
  return acc;
}

function makeSingleColEval(col, values, pkCols) {
  const deduped = deduplicateScalars(values);
  if (deduped.length === NUM_ZERO || !pkCols.includes(col)) {
    return UNSCOPED_WHERE_EVAL;
  }
  const colMap = new Map([[col, deduped]]);
  const tuples = buildCartesianTuples(pkCols, colMap);
  return {
    scoped: tuples !== null && tuples.length > NUM_ZERO,
    colMap,
    tuples,
  };
}

function evaluateEqualityNode(node, params, pkCols, ast) {
  const leftCol = extractColumnIdentifierFromNode(node.left);
  const rightCol = extractColumnIdentifierFromNode(node.right);
  if (leftCol !== null && rightCol === null) {
    const val = extractScalarValueFromNode(node.right, params, ast);
    return val !== undefined ?
      makeSingleColEval(leftCol, [val], pkCols) :
      UNSCOPED_WHERE_EVAL;
  }
  if (rightCol !== null && leftCol === null) {
    const val = extractScalarValueFromNode(node.left, params, ast);
    return val !== undefined ?
      makeSingleColEval(rightCol, [val], pkCols) :
      UNSCOPED_WHERE_EVAL;
  }
  return UNSCOPED_WHERE_EVAL;
}

function evaluateInNode(node, params, pkCols, ast) {
  if (node.negated || node.subquery || !Array.isArray(node.values) ||
      node.values.length === NUM_ZERO) {
    return UNSCOPED_WHERE_EVAL;
  }
  const col = extractColumnIdentifierFromNode(node.expression ?? node.expr ?? node.left);
  if (col === null) return UNSCOPED_WHERE_EVAL;
  const scalars = [];
  for (let i = NUM_ZERO; i < node.values.length; i += NUM_ONE) {
    const val = extractScalarValueFromNode(node.values[i], params, ast);
    if (val === undefined) return UNSCOPED_WHERE_EVAL;
    scalars.push(val);
  }
  return makeSingleColEval(col, scalars, pkCols);
}

function mergeAndColMaps(leftMap, rightMap) {
  if (!leftMap && !rightMap) return {contradiction: false, colMap: null};
  const merged = new Map();
  if (leftMap) {
    for (const [col, vals] of leftMap.entries()) merged.set(col, [...vals]);
  }
  if (rightMap) {
    for (const [col, rightVals] of rightMap.entries()) {
      if (!merged.has(col)) {
        merged.set(col, [...rightVals]);
      } else {
        const rightKeySet = new Set(rightVals.map(String));
        const intersected = merged.get(col).filter((v) => rightKeySet.has(String(v)));
        if (intersected.length === NUM_ZERO) return {contradiction: true, colMap: null};
        merged.set(col, intersected);
      }
    }
  }
  return {contradiction: false, colMap: merged};
}

function intersectTupleLists(leftTuples, rightTuples) {
  const rightKeys = new Set(rightTuples.map(encodeCanonicalPkTupleKey));
  return leftTuples.filter((t) => rightKeys.has(encodeCanonicalPkTupleKey(t)));
}

function filterTuplesByColMap(tuples, pkCols, colMap) {
  if (!colMap) return tuples;
  return tuples.filter((tuple) => {
    for (let i = NUM_ZERO; i < pkCols.length; i += NUM_ONE) {
      const allowed = colMap.get(pkCols[i]);
      if (allowed && !allowed.some((v) => String(v) === String(tuple[i]))) return false;
    }
    return true;
  });
}

function hasScopedTuples(evalResult) {
  return Boolean(evalResult.scoped && evalResult.tuples);
}

function wrapNonEmptyTuples(tuples, colMap) {
  return tuples && tuples.length > NUM_ZERO ?
    {scoped: true, colMap, tuples} :
    UNSCOPED_WHERE_EVAL;
}

function evaluateAndNode(leftEval, rightEval, pkCols) {
  const {contradiction, colMap} = mergeAndColMaps(leftEval.colMap, rightEval.colMap);
  if (contradiction) return UNSCOPED_WHERE_EVAL;
  const cartesian = colMap ? buildCartesianTuples(pkCols, colMap) : null;
  if (cartesian !== null && cartesian.length > NUM_ZERO) {
    return {scoped: true, colMap, tuples: cartesian};
  }
  if (hasScopedTuples(leftEval) && hasScopedTuples(rightEval)) {
    return wrapNonEmptyTuples(intersectTupleLists(leftEval.tuples, rightEval.tuples), colMap);
  }
  if (hasScopedTuples(leftEval)) {
    return wrapNonEmptyTuples(
      filterTuplesByColMap(leftEval.tuples, pkCols, rightEval.colMap),
      colMap,
    );
  }
  if (hasScopedTuples(rightEval)) {
    return wrapNonEmptyTuples(
      filterTuplesByColMap(rightEval.tuples, pkCols, leftEval.colMap),
      colMap,
    );
  }
  return {scoped: false, colMap, tuples: null};
}

function unionTupleLists(leftTuples, rightTuples) {
  const seen = new Set();
  const out = [];
  for (const list of [leftTuples, rightTuples]) {
    for (let i = NUM_ZERO; i < list.length; i += NUM_ONE) {
      const tuple = list[i];
      const key = encodeCanonicalPkTupleKey(tuple);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(tuple);
        if (out.length > MAX_SCOPED_FOOTPRINT_TUPLES) {
          return null;
        }
      }
    }
  }
  return out;
}

function buildSharedOrColMap(leftMap, rightMap) {
  const sharedColMap = new Map();
  if (!leftMap || !rightMap) return sharedColMap;
  for (const [col, leftVals] of leftMap.entries()) {
    const rightVals = rightMap.get(col);
    if (rightVals) {
      sharedColMap.set(col, deduplicateScalars([...leftVals, ...rightVals]));
    }
  }
  return sharedColMap;
}

function evaluateOrNode(leftEval, rightEval, pkCols) {
  if (hasScopedTuples(leftEval) && hasScopedTuples(rightEval)) {
    return wrapNonEmptyTuples(unionTupleLists(leftEval.tuples, rightEval.tuples), null);
  }
  const sharedColMap = buildSharedOrColMap(leftEval.colMap, rightEval.colMap);
  if (sharedColMap.size > NUM_ZERO) {
    const tuples = buildCartesianTuples(pkCols, sharedColMap);
    return {
      scoped: tuples !== null && tuples.length > NUM_ZERO,
      colMap: sharedColMap,
      tuples,
    };
  }
  return UNSCOPED_WHERE_EVAL;
}

/**
 * @param {any} node
 * @param {Array<unknown>} params
 * @param {string[]} pkCols
 * @param {any} ast
 * @return {WhereFootprintEval}
 */
function evaluateWhereNode(node, params, pkCols, ast) {
  if (!node || typeof node !== TYPE_OBJECT) return UNSCOPED_WHERE_EVAL;
  const nodeType = String(node.type ?? '').toLowerCase();
  if (nodeType === NODE_TYPE_IN) return evaluateInNode(node, params, pkCols, ast);
  if (nodeType !== NODE_TYPE_BINARY) return UNSCOPED_WHERE_EVAL;
  const op = String(node.operator ?? '').toUpperCase();
  if (op === OP_EQUALS) return evaluateEqualityNode(node, params, pkCols, ast);
  if (op === OP_AND) {
    return evaluateAndNode(
      evaluateWhereNode(node.left, params, pkCols, ast),
      evaluateWhereNode(node.right, params, pkCols, ast),
      pkCols,
    );
  }
  if (op === OP_OR) {
    return evaluateOrNode(
      evaluateWhereNode(node.left, params, pkCols, ast),
      evaluateWhereNode(node.right, params, pkCols, ast),
      pkCols,
    );
  }
  return UNSCOPED_WHERE_EVAL;
}

function normalizeUniqueConstraintCols(rawList) {
  if (!Array.isArray(rawList)) return [];
  const out = [];
  for (let i = NUM_ZERO; i < rawList.length; i += NUM_ONE) {
    const normalized = normalizeColumnList(rawList[i]);
    if (normalized.length > NUM_ZERO) out.push(normalized);
  }
  return out;
}

function assignmentMutatesKeyOrSubquery(assignment, pkCols, uniqueConstraintCols) {
  const rawCol = assignment ? (assignment.column ?? assignment.name) : '';
  const col = String(rawCol ?? '')
    .trim().replace(/^["'`]|["'`]$/gu, '').toLowerCase();
  const mutatesUnique = uniqueConstraintCols.some((uCols) => uCols.includes(col));
  return pkCols.includes(col) || mutatesUnique || containsSubqueryNode(assignment?.value);
}

function updateMutatesPkOrSubquery(ast, pkCols, uniqueConstraintCols = []) {
  const assignments = ast.assignments ?? ast.set;
  if (!Array.isArray(assignments)) return false;
  return assignments.some((assignment) =>
    assignmentMutatesKeyOrSubquery(assignment, pkCols, uniqueConstraintCols));
}

function extractUpdateOrDeleteFootprint(ast, params, pkCols, isUpdate, uniqueConstraintCols = []) {
  if ((isUpdate && updateMutatesPkOrSubquery(ast, pkCols, uniqueConstraintCols)) ||
      !ast.where || containsSubqueryNode(ast.where)) {
    return UNSCOPED_WRITE_FOOTPRINT;
  }
  const evaluated = evaluateWhereNode(ast.where, params, pkCols, ast);
  return evaluated.scoped && evaluated.tuples && evaluated.tuples.length > NUM_ZERO ?
    buildScopedFootprintFromTuples(evaluated.tuples) : UNSCOPED_WRITE_FOOTPRINT;
}

const UNPARSED_SQL_AST = Object.freeze({unparsed: true});

function parseSqlAstSafely(sql) {
  if (typeof sql !== TYPE_STRING || sql.trim().length === NUM_ZERO) return UNPARSED_SQL_AST;
  try {
    const dialect = PG_PARAM_PATTERN.test(sql) ? DIALECT_POSTGRESQL : DIALECT_SQLITE;
    const parser = new SQLParser(sql, {dialect});
    parser.logger = {debug() {}, info() {}, warn() {}, error() {}};
    return parser.parse();
  } catch {
    return UNPARSED_SQL_AST;
  }
}

function dispatchFootprintByStatementKind(
  resolvedAst, safeParams, normalizedPkCols, allCols, uniqueConstraintCols,
) {
  const statementKind = String(resolvedAst.type || '').toUpperCase();
  if (statementKind === AST_KIND_INSERT) {
    return extractInsertFootprint(
      resolvedAst, safeParams, normalizedPkCols, allCols, uniqueConstraintCols,
    );
  }
  if (statementKind === AST_KIND_UPDATE) {
    return extractUpdateOrDeleteFootprint(
      resolvedAst, safeParams, normalizedPkCols, true, uniqueConstraintCols,
    );
  }
  if (statementKind === AST_KIND_DELETE) {
    return uniqueConstraintCols.length > NUM_ZERO ?
      UNSCOPED_WRITE_FOOTPRINT :
      extractUpdateOrDeleteFootprint(
        resolvedAst, safeParams, normalizedPkCols, false, uniqueConstraintCols,
      );
  }
  if (statementKind === AST_KIND_SELECT) {
    return extractUpdateOrDeleteFootprint(
      resolvedAst, safeParams, normalizedPkCols, false, uniqueConstraintCols,
    );
  }
  return UNSCOPED_WRITE_FOOTPRINT;
}

function extractStatementWriteFootprint(options) {
  if (!options || typeof options !== TYPE_OBJECT ||
      options.hasUnscopedSchemaConstraints === true) {
    return UNSCOPED_WRITE_FOOTPRINT;
  }
  const pkCols = options.pkCols;
  if (!Array.isArray(pkCols) || pkCols.length === NUM_ZERO) return UNSCOPED_WRITE_FOOTPRINT;
  const normalizedPkCols = normalizeColumnList(pkCols);
  if (normalizedPkCols.length !== pkCols.length) return UNSCOPED_WRITE_FOOTPRINT;
  const resolvedAst = options.ast || parseSqlAstSafely(options.sql);
  if (!resolvedAst || typeof resolvedAst !== TYPE_OBJECT) return UNSCOPED_WRITE_FOOTPRINT;
  const safeParams = options.typedParams ?
    decodeTypedParams(options.typedParams) :
    (Array.isArray(options.params) ? options.params : []);
  return dispatchFootprintByStatementKind(
    resolvedAst,
    safeParams,
    normalizedPkCols,
    normalizeColumnList(options.allCols),
    normalizeUniqueConstraintCols(options.uniqueConstraintCols),
  );
}

export {
  MAX_SCOPED_FOOTPRINT_TUPLES,
  STATEMENT_WRITE_FOOTPRINT_KEYS,
  assertStatementWriteFootprintConformance,
  createStatementWriteFootprintRecord,
  encodeCanonicalPkTupleKey,
  extractStatementWriteFootprint,
  isStatementWriteFootprintRecord,
};
