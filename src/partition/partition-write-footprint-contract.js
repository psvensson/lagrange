/**
 * Canonical producer contract, runtime conformance validator, and AST-based
 * write-footprint extractor for StatementWriteFootprintRecord.
 *
 * Owned by src/partition/. Defines the single authoritative write-footprint
 * shape consumed by participant row-key concurrency control and locking-read
 * reservation checks, rejecting phantom members and fixture drift.
 */

import {SQLParser} from '../query/sql-parser.js';

const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const arrayMap = Function.call.bind(Array.prototype.map);

const NUM_ZERO = 0;
const NUM_ONE = 1;
const FOOTPRINT_FIELD_COUNT = 3;

const FOOTPRINT_FIELD_SCOPED = 'scoped';
const FOOTPRINT_FIELD_ROW_KEYS = 'rowKeys';
const FOOTPRINT_FIELD_PK_TUPLES = 'pkTuples';

const ROW_KEY_SEPARATOR = '|';

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
const PG_PARAM_PATTERN = /\$[1-9]\d*/u;

const ERROR_PREFIX_RECORD_NOT_OBJECT =
  'StatementWriteFootprintRecord must be a non-null plain object';
const ERROR_PREFIX_UNKNOWN_PROPERTY =
  'StatementWriteFootprintRecord rejects unrecognized phantom property: ';
const ERROR_PREFIX_MISSING_PROPERTY =
  'StatementWriteFootprintRecord missing required property: ';
const ERROR_PREFIX_INVALID_PROPERTY_TYPE =
  'StatementWriteFootprintRecord invalid type or invariant for property: ';

/**
 * Exactly 3 canonical statement write-footprint fields.
 */
const STATEMENT_WRITE_FOOTPRINT_KEYS = objectFreeze([
  FOOTPRINT_FIELD_SCOPED,
  FOOTPRINT_FIELD_ROW_KEYS,
  FOOTPRINT_FIELD_PK_TUPLES,
]);

/**
 * @typedef {Object} StatementWriteFootprintRecord
 * @property {boolean} scoped
 * @property {readonly string[]} rowKeys
 * @property {readonly ReadonlyArray<string | number>[]} pkTuples
 */

/**
 * @typedef {Object} WhereFootprintEval
 * @property {boolean} scoped
 * @property {Map<string, Array<string | number>> | null} colMap
 * @property {Array<Array<string | number>> | null} tuples
 */

function isPlainObject(value) {
  if (value === null || typeof value !== TYPE_OBJECT || Array.isArray(value)) {
    return false;
  }
  const proto = objectGetPrototypeOf(value);
  return proto === objectPrototype || proto === null;
}

function isNonEmptyString(value) {
  return typeof value === TYPE_STRING && value.length > NUM_ZERO;
}

function isScalarPkValue(value) {
  return typeof value === TYPE_STRING ||
    (typeof value === TYPE_NUMBER && Number.isFinite(value));
}

function isValidPkTupleArray(pkTuples, expectedLength) {
  if (!Array.isArray(pkTuples) || pkTuples.length !== expectedLength) {
    return false;
  }
  for (let i = NUM_ZERO; i < pkTuples.length; i += NUM_ONE) {
    const tuple = pkTuples[i];
    if (!Array.isArray(tuple) || tuple.length === NUM_ZERO) {
      return false;
    }
    for (let j = NUM_ZERO; j < tuple.length; j += NUM_ONE) {
      if (!isScalarPkValue(tuple[j])) {
        return false;
      }
    }
  }
  return true;
}

function validateFootprintFields(record) {
  const scoped = record[FOOTPRINT_FIELD_SCOPED];
  if (typeof scoped !== TYPE_BOOLEAN) {
    return FOOTPRINT_FIELD_SCOPED;
  }
  const rowKeys = record[FOOTPRINT_FIELD_ROW_KEYS];
  if (!Array.isArray(rowKeys)) {
    return FOOTPRINT_FIELD_ROW_KEYS;
  }
  for (let i = NUM_ZERO; i < rowKeys.length; i += NUM_ONE) {
    if (!isNonEmptyString(rowKeys[i])) {
      return FOOTPRINT_FIELD_ROW_KEYS;
    }
  }
  if (!scoped && rowKeys.length > NUM_ZERO) {
    return FOOTPRINT_FIELD_ROW_KEYS;
  }
  if (scoped && rowKeys.length === NUM_ZERO) {
    return FOOTPRINT_FIELD_ROW_KEYS;
  }
  const pkTuples = record[FOOTPRINT_FIELD_PK_TUPLES];
  if (!isValidPkTupleArray(pkTuples, rowKeys.length)) {
    return FOOTPRINT_FIELD_PK_TUPLES;
  }
  return null;
}

/**
 * Validate that a record conforms strictly to StatementWriteFootprintRecord.
 * Throws TypeError if invalid or if any phantom member is present.
 *
 * @param {unknown} value
 * @return {StatementWriteFootprintRecord}
 */
function assertStatementWriteFootprintConformance(value) {
  if (!isPlainObject(value)) {
    throw new TypeError(ERROR_PREFIX_RECORD_NOT_OBJECT);
  }
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
 *
 * @param {*} value
 * @return {boolean}
 */
function isStatementWriteFootprintRecord(value) {
  if (!isPlainObject(value)) {
    return false;
  }
  const record = value;
  const keys = objectKeys(record);
  if (keys.length !== FOOTPRINT_FIELD_COUNT) {
    return false;
  }
  for (let i = NUM_ZERO; i < keys.length; i += NUM_ONE) {
    if (!STATEMENT_WRITE_FOOTPRINT_KEYS.includes(keys[i])) {
      return false;
    }
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
  if (!Array.isArray(cols)) {
    return [];
  }
  const normalized = [];
  for (let i = NUM_ZERO; i < cols.length; i += NUM_ONE) {
    const item = cols[i];
    const raw = typeof item === TYPE_STRING ?
      item :
      String(item?.name ?? item?.column ?? '');
    const cleaned = raw.trim().replace(/^["'`]|["'`]$/gu, '').toLowerCase();
    if (cleaned.length > NUM_ZERO) {
      normalized.push(cleaned);
    }
  }
  return normalized;
}

function buildScopedFootprintFromTuples(tuples) {
  if (!Array.isArray(tuples) || tuples.length === NUM_ZERO) {
    return UNSCOPED_WRITE_FOOTPRINT;
  }
  const seenKeys = new Set();
  /** @type {string[]} */
  const rowKeys = [];
  /** @type {Array<Array<string | number>>} */
  const pkTuples = [];
  for (let i = NUM_ZERO; i < tuples.length; i += NUM_ONE) {
    const tuple = tuples[i];
    if (!Array.isArray(tuple) || tuple.length === NUM_ZERO) {
      return UNSCOPED_WRITE_FOOTPRINT;
    }
    const rk = tuple.map(String).join(ROW_KEY_SEPARATOR);
    if (rk.length === NUM_ZERO) {
      return UNSCOPED_WRITE_FOOTPRINT;
    }
    if (!seenKeys.has(rk)) {
      seenKeys.add(rk);
      rowKeys.push(rk);
      pkTuples.push(tuple);
    }
  }
  return rowKeys.length > NUM_ZERO ?
    createStatementWriteFootprintRecord({scoped: true, rowKeys, pkTuples}) :
    UNSCOPED_WRITE_FOOTPRINT;
}

function resolveParameterScalar(node, params, ast) {
  const rawIdx = typeof node.index === TYPE_NUMBER ? node.index : -1;
  if (rawIdx < NUM_ZERO || !Array.isArray(params)) {
    return undefined;
  }
  const mapping = ast?._paramMapping;
  const paramIdx = Array.isArray(mapping) && rawIdx < mapping.length ?
    Number(mapping[rawIdx]) - NUM_ONE :
    rawIdx;
  if (paramIdx < NUM_ZERO || paramIdx >= params.length) {
    return undefined;
  }
  const val = params[paramIdx];
  return isScalarPkValue(val) ? val : undefined;
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
  return op === OP_MINUS ? -inner.value : inner.value;
}

function extractScalarValueFromNode(node, params, ast) {
  if (!node || typeof node !== TYPE_OBJECT) {
    return undefined;
  }
  const nodeType = String(node.type ?? '').toLowerCase();
  if (nodeType === NODE_TYPE_LITERAL) {
    return isScalarPkValue(node.value) ? node.value : undefined;
  }
  if (nodeType === NODE_TYPE_UNARY) {
    return resolveUnaryScalar(node);
  }
  if (nodeType === NODE_TYPE_PARAMETER) {
    return resolveParameterScalar(node, params, ast);
  }
  return undefined;
}

function extractColumnIdentifierFromNode(node) {
  if (!node || typeof node !== TYPE_OBJECT) {
    return null;
  }
  const nodeType = String(node.type ?? '').toLowerCase();
  if (nodeType === NODE_TYPE_LITERAL ||
      nodeType === NODE_TYPE_PARAMETER ||
      nodeType === NODE_TYPE_UNARY ||
      nodeType === NODE_TYPE_BINARY ||
      nodeType === NODE_TYPE_IN ||
      nodeType === NODE_TYPE_SUBQUERY ||
      nodeType === NODE_TYPE_EXISTS) {
    return null;
  }
  if (nodeType !== NODE_TYPE_COLUMN &&
      nodeType !== NODE_TYPE_COLUMN_REF &&
      nodeType !== '') {
    return null;
  }
  const raw = node.column ?? node.name;
  if (typeof raw !== TYPE_STRING || raw.length === NUM_ZERO) {
    return null;
  }
  const stripped = raw.includes('.') ? raw.split('.').at(-1) ?? raw : raw;
  const cleaned = stripped.trim().replace(/^["'`]|["'`]$/gu, '').toLowerCase();
  return cleaned.length > NUM_ZERO ? cleaned : null;
}

function hasOnConflictMutation(ast) {
  return Boolean(ast?.onConflict || ast?.conflict);
}

function extractInsertFootprint(ast, params, pkCols, allCols) {
  if (hasOnConflictMutation(ast) ||
      !Array.isArray(ast.values) ||
      ast.values.length === NUM_ZERO) {
    return UNSCOPED_WRITE_FOOTPRINT;
  }
  const hasExplicitCols = Array.isArray(ast.columns) && ast.columns.length > NUM_ZERO;
  const targetCols = hasExplicitCols ?
    normalizeColumnList(ast.columns) :
    allCols;
  if (targetCols.length === NUM_ZERO) {
    return UNSCOPED_WRITE_FOOTPRINT;
  }
  const columnOffsets = pkCols.map((pkCol) => targetCols.indexOf(pkCol));
  if (columnOffsets.some((idx) => idx < NUM_ZERO)) {
    return UNSCOPED_WRITE_FOOTPRINT;
  }
  /** @type {Array<Array<string | number>>} */
  const tuples = [];
  for (let r = NUM_ZERO; r < ast.values.length; r += NUM_ONE) {
    const row = ast.values[r];
    if (!Array.isArray(row) || row.length !== targetCols.length) {
      return UNSCOPED_WRITE_FOOTPRINT;
    }
    /** @type {Array<string | number>} */
    const tuple = [];
    for (let k = NUM_ZERO; k < columnOffsets.length; k += NUM_ONE) {
      const scalar = extractScalarValueFromNode(row[columnOffsets[k]], params, ast);
      if (scalar === undefined) {
        return UNSCOPED_WRITE_FOOTPRINT;
      }
      tuple.push(scalar);
    }
    tuples.push(tuple);
  }
  return buildScopedFootprintFromTuples(tuples);
}

function containsSubqueryNode(node) {
  if (!node || typeof node !== TYPE_OBJECT) {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some(containsSubqueryNode);
  }
  const nodeType = String(node.type ?? '').toLowerCase();
  if (nodeType === NODE_TYPE_SUBQUERY ||
      nodeType === NODE_TYPE_EXISTS ||
      Boolean(node.subquery) ||
      Boolean(node.query)) {
    return true;
  }
  const children = [
    node.left,
    node.right,
    node.operand,
    node.expression,
    node.expr,
    node.low,
    node.high,
    node.pattern,
    node.elseExpr,
    node.values,
    node.args,
  ];
  for (let i = NUM_ZERO; i < children.length; i += NUM_ONE) {
    if (containsSubqueryNode(children[i])) {
      return true;
    }
  }
  if (Array.isArray(node.conditions)) {
    for (let i = NUM_ZERO; i < node.conditions.length; i += NUM_ONE) {
      const cond = node.conditions[i];
      if (containsSubqueryNode(cond?.when) ||
          containsSubqueryNode(cond?.thenExpression)) {
        return true;
      }
    }
  }
  return false;
}

function deduplicateScalars(values) {
  const seen = new Set();
  /** @type {Array<string | number>} */
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
  /** @type {Array<Array<string | number>>} */
  let acc = [[]];
  for (let i = NUM_ZERO; i < pkCols.length; i += NUM_ONE) {
    const colValues = colMap.get(pkCols[i]);
    if (!colValues || colValues.length === NUM_ZERO) {
      return null;
    }
    /** @type {Array<Array<string | number>>} */
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
  /** @type {Array<string | number>} */
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
  const rightKeys = new Set(rightTuples.map((t) => t.map(String).join(ROW_KEY_SEPARATOR)));
  return leftTuples.filter((t) => rightKeys.has(t.map(String).join(ROW_KEY_SEPARATOR)));
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

function evaluateAndNode(leftEval, rightEval, pkCols) {
  const {contradiction, colMap} = mergeAndColMaps(leftEval.colMap, rightEval.colMap);
  if (contradiction) return UNSCOPED_WHERE_EVAL;
  const cartesian = colMap ? buildCartesianTuples(pkCols, colMap) : null;
  if (cartesian !== null && cartesian.length > NUM_ZERO) {
    return {scoped: true, colMap, tuples: cartesian};
  }
  if (leftEval.scoped && leftEval.tuples && rightEval.scoped && rightEval.tuples) {
    const both = intersectTupleLists(leftEval.tuples, rightEval.tuples);
    return both.length > NUM_ZERO ? {scoped: true, colMap, tuples: both} : UNSCOPED_WHERE_EVAL;
  }
  if (leftEval.scoped && leftEval.tuples) {
    const filtered = filterTuplesByColMap(leftEval.tuples, pkCols, rightEval.colMap);
    return filtered.length > NUM_ZERO ?
      {scoped: true, colMap, tuples: filtered} : UNSCOPED_WHERE_EVAL;
  }
  if (rightEval.scoped && rightEval.tuples) {
    const filtered = filterTuplesByColMap(rightEval.tuples, pkCols, leftEval.colMap);
    return filtered.length > NUM_ZERO ?
      {scoped: true, colMap, tuples: filtered} : UNSCOPED_WHERE_EVAL;
  }
  return {scoped: false, colMap, tuples: null};
}

function unionTupleLists(leftTuples, rightTuples) {
  const seen = new Set();
  /** @type {Array<Array<string | number>>} */
  const out = [];
  for (const list of [leftTuples, rightTuples]) {
    for (let i = NUM_ZERO; i < list.length; i += NUM_ONE) {
      const tuple = list[i];
      const key = tuple.map(String).join(ROW_KEY_SEPARATOR);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(tuple);
      }
    }
  }
  return out;
}

function evaluateOrNode(leftEval, rightEval, pkCols) {
  if (leftEval.scoped && leftEval.tuples && rightEval.scoped && rightEval.tuples) {
    const combined = unionTupleLists(leftEval.tuples, rightEval.tuples);
    return combined.length > NUM_ZERO ?
      {scoped: true, colMap: null, tuples: combined} : UNSCOPED_WHERE_EVAL;
  }
  if (leftEval.colMap && rightEval.colMap) {
    const sharedColMap = new Map();
    for (const [col, leftVals] of leftEval.colMap.entries()) {
      const rightVals = rightEval.colMap.get(col);
      if (rightVals) sharedColMap.set(col, deduplicateScalars([...leftVals, ...rightVals]));
    }
    if (sharedColMap.size > NUM_ZERO) {
      const tuples = buildCartesianTuples(pkCols, sharedColMap);
      return {
        scoped: tuples !== null && tuples.length > NUM_ZERO,
        colMap: sharedColMap,
        tuples,
      };
    }
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

function updateMutatesPkOrSubquery(ast, pkCols) {
  const assignments = ast.assignments ?? ast.set;
  if (!Array.isArray(assignments)) return false;
  for (let i = NUM_ZERO; i < assignments.length; i += NUM_ONE) {
    const assignment = assignments[i];
    const col = String(assignment?.column ?? assignment?.name ?? '')
      .trim().replace(/^["'`]|["'`]$/gu, '').toLowerCase();
    if (pkCols.includes(col) || containsSubqueryNode(assignment?.value)) return true;
  }
  return false;
}

function extractUpdateOrDeleteFootprint(ast, params, pkCols, isUpdate) {
  if ((isUpdate && updateMutatesPkOrSubquery(ast, pkCols)) ||
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

/**
 * Extract the canonical primary-key write footprint from a SQL statement or AST.
 *
 * @param {Object} [options]
 * @param {string} [options.sql]
 * @param {any} [options.ast]
 * @param {Array<unknown>} [options.params]
 * @param {string[]} [options.pkCols]
 * @param {string[]} [options.allCols]
 * @return {StatementWriteFootprintRecord}
 */
function extractStatementWriteFootprint({
  sql = '', ast = null, params = [], pkCols = [], allCols = [],
} = {}) {
  if (!Array.isArray(pkCols) || pkCols.length === NUM_ZERO) return UNSCOPED_WRITE_FOOTPRINT;
  const normalizedPkCols = normalizeColumnList(pkCols);
  if (normalizedPkCols.length !== pkCols.length) return UNSCOPED_WRITE_FOOTPRINT;
  const normalizedAllCols = normalizeColumnList(allCols);
  const resolvedAst = ast ?? parseSqlAstSafely(sql);
  if (!resolvedAst || typeof resolvedAst !== TYPE_OBJECT) return UNSCOPED_WRITE_FOOTPRINT;
  const safeParams = Array.isArray(params) ? params : [];
  const statementKind = String(resolvedAst.type ?? '').toUpperCase();
  if (statementKind === AST_KIND_INSERT) {
    return extractInsertFootprint(resolvedAst, safeParams, normalizedPkCols, normalizedAllCols);
  }
  if (statementKind === AST_KIND_UPDATE) {
    return extractUpdateOrDeleteFootprint(resolvedAst, safeParams, normalizedPkCols, true);
  }
  if (statementKind === AST_KIND_DELETE || statementKind === AST_KIND_SELECT) {
    return extractUpdateOrDeleteFootprint(resolvedAst, safeParams, normalizedPkCols, false);
  }
  return UNSCOPED_WRITE_FOOTPRINT;
}

export {
  ROW_KEY_SEPARATOR,
  STATEMENT_WRITE_FOOTPRINT_KEYS,
  assertStatementWriteFootprintConformance,
  createStatementWriteFootprintRecord,
  extractStatementWriteFootprint,
  isStatementWriteFootprintRecord,
};
