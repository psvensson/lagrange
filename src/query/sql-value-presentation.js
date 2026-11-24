/**
 * Canonical client presentation owner for SQL values decoded from TypedRowSet
 * or produced by CoordinatorMergeSession (design coordinator-sqlite-merge §2.6,
 * decisions D3 and C3).
 *
 * Every exit of typed rows applies this module so that:
 * - INTEGER (`BigInt` in memory) becomes a JS `number` when within the IEEE-754
 *   safe integer range `[-9007199254740991, 9007199254740991]`, or raises the
 *   typed refusal `INTEGER_PRECISION_UNREPRESENTABLE` outside that range unless
 *   `{safeIntegers: true}` was requested by the caller;
 * - REAL (`number`), TEXT (`string`), BLOB (`Buffer`), and NULL (`null`) pass
 *   through unchanged.
 *
 * @module query/sql-value-presentation
 */

import {QUERY_ERROR_CODE} from './query-constants.js';

const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const LAZY_ROWS_GETTER_SYMBOL = Symbol.for('lagrange.query.lazyRowsGetter');
const PRESENTED_SAFE_INTEGERS_SYMBOL = Symbol.for(
  'lagrange.query.presentedSafeIntegers',
);
const RESIDENT_RESULT_BYTES_SYMBOL = Symbol.for(
  'lagrange.query.residentResultBytes',
);
const PROP_ROWS = 'rows';
const LOCAL_STR_BOOLEAN = 'boolean';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';

let objectRowMaterializationCount = 0;

function getObjectRowMaterializationCount() {
  return objectRowMaterializationCount;
}

function resetObjectRowMaterializationCount() {
  objectRowMaterializationCount = 0;
}

function stampRowCollectionPresentation(collection, safeIntegers, residentBytes) {
  if (!Array.isArray(collection)) {
    return collection;
  }
  if (typeof safeIntegers === LOCAL_STR_BOOLEAN) {
    Object.defineProperty(collection, PRESENTED_SAFE_INTEGERS_SYMBOL, {
      value: safeIntegers,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
  if (Number.isSafeInteger(residentBytes) && residentBytes >= 0) {
    Object.defineProperty(collection, RESIDENT_RESULT_BYTES_SYMBOL, {
      value: residentBytes,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
  return collection;
}

/**
 * Build the typed refusal for an INTEGER outside the JS safe integer range.
 * @param {bigint} value - Unrepresentable 64-bit integer value.
 * @return {Error}
 */
function createIntegerPrecisionError(value) {
  const error = new Error(
    `SQLite INTEGER ${value.toString()} exceeds JavaScript safe integer range`,
  );
  error.code = QUERY_ERROR_CODE.INTEGER_PRECISION_UNREPRESENTABLE;
  error.errorCode = QUERY_ERROR_CODE.INTEGER_PRECISION_UNREPRESENTABLE;
  return error;
}

/**
 * Present one typed SQL value for a JS consumer.
 * @param {*} value - Decoded SQL value (`bigint`, `number`, `string`, `Buffer`, `null`).
 * @param {Object} [options={}]
 * @param {boolean} [options.safeIntegers=false] - Keep `BigInt` values intact.
 * @return {*}
 */
function presentSqlValue(value, options = {}) {
  if (options?.safeIntegers === true) {
    return value;
  }
  if (typeof value === 'bigint') {
    if (value < MIN_SAFE_BIGINT || value > MAX_SAFE_BIGINT) {
      throw createIntegerPrecisionError(value);
    }
    return Number(value);
  }
  return value;
}

/**
 * Present one row object's values in order.
 * @param {Object} row - Materialized row object.
 * @param {Object} [options={}]
 * @param {boolean} [options.safeIntegers=false]
 * @return {Object}
 */
function presentSqlRowObject(row, options = {}) {
  if (!row || typeof row !== 'object' || options?.safeIntegers === true) {
    return row;
  }
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = presentSqlValue(value, options);
  }
  return out;
}

/**
 * Present an array of materialized row objects.
 * @param {Array<Object>} rows
 * @param {Object} [options={}]
 * @param {boolean} [options.safeIntegers=false]
 * @return {Array<Object>}
 */
function presentSqlRowObjects(rows, options = {}) {
  if (!Array.isArray(rows) || options?.safeIntegers === true) {
    return rows;
  }
  return rows.map((row) => presentSqlRowObject(row, options));
}

/**
 * Present an array of positional raw row arrays.
 * @param {Array<Array<*>>} rawRows
 * @param {Object} [options={}]
 * @param {boolean} [options.safeIntegers=false]
 * @return {Array<Array<*>>}
 */
function presentRawSqlRows(rawRows, options = {}) {
  if (!Array.isArray(rawRows) || options?.safeIntegers === true) {
    return rawRows;
  }
  return rawRows.map((row) =>
    Array.isArray(row) ? row.map((cell) => presentSqlValue(cell, options)) : row,
  );
}

function isRawCollectionAlreadyPresented(rawRows, options, safeIntegers) {
  return (
    safeIntegers ||
    options?.alreadyPresented === true ||
    rawRows[PRESENTED_SAFE_INTEGERS_SYMBOL] === safeIntegers
  );
}

function buildMaterializedRowObject(columns, rawRow, alreadyPresented, options) {
  const obj = {};
  for (let c = 0; c < columns.length; c += 1) {
    const value = rawRow[c] === undefined ? null : rawRow[c];
    obj[columns[c]] = alreadyPresented ? value : presentSqlValue(value, options);
  }
  return obj;
}

/**
 * Materialize object rows from `(columns, rawRows)` and apply client
 * presentation to every cell.
 * @param {string[]} columns - Result column names in order.
 * @param {Array<Array<*>>} rawRows - Positional row arrays.
 * @param {Object} [options={}]
 * @param {boolean} [options.safeIntegers=false]
 * @param {number} [options.residentBytes]
 * @param {boolean} [options.alreadyPresented=false]
 * @return {Array<Object>}
 */
function materializeAndPresentRowObjects(columns, rawRows, options = {}) {
  const safeIntegers = options?.safeIntegers === true;
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return stampRowCollectionPresentation([], safeIntegers, 0);
  }
  objectRowMaterializationCount += 1;
  const colList = Array.isArray(columns) ? columns : [];
  const alreadyPresented = isRawCollectionAlreadyPresented(
    rawRows,
    options,
    safeIntegers,
  );
  const rows = new Array(rawRows.length);
  for (let r = 0; r < rawRows.length; r += 1) {
    rows[r] = buildMaterializedRowObject(
      colList,
      rawRows[r],
      alreadyPresented,
      options,
    );
  }
  const residentBytes = resolveBuilderResidentBytes(
    options?.residentBytes,
    rawRows,
  );
  return stampRowCollectionPresentation(rows, safeIntegers, residentBytes);
}

function getResultRowCount(result) {
  if (Array.isArray(result?.rawRows)) {
    return result.rawRows.length;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows.length;
  }
  if (Number.isSafeInteger(result?.count) && result.count >= 0) {
    return result.count;
  }
  return 0;
}

function hasLazyRowsProperty(source) {
  if (!source || typeof source !== LOCAL_STR_OBJECT) {
    return false;
  }
  const descriptor = Object.getOwnPropertyDescriptor(source, PROP_ROWS);
  if (descriptor?.get) {
    return true;
  }
  return Boolean(source[LAZY_ROWS_GETTER_SYMBOL]) && descriptor === undefined;
}

function hasPositionalRowColumns(source) {
  return Array.isArray(source?.rawRows) && Array.isArray(source?.columns);
}

function resolveBuilderEffectivePolicy(explicitSafeIntegers, rawRows) {
  if (typeof explicitSafeIntegers === LOCAL_STR_BOOLEAN) {
    return explicitSafeIntegers;
  }
  return rawRows?.[PRESENTED_SAFE_INTEGERS_SYMBOL] === true;
}

function resolveBuilderResidentBytes(explicitResidentBytes, rawRows) {
  if (Number.isSafeInteger(explicitResidentBytes)) {
    return explicitResidentBytes;
  }
  return rawRows?.[RESIDENT_RESULT_BYTES_SYMBOL];
}

function buildRowsFromTargetOrOptions(target, options) {
  const columns = Array.isArray(options.columns) ?
    options.columns :
    target?.columns;
  const rawRows = Array.isArray(options.rawRows) ?
    options.rawRows :
    target?.rawRows;
  if (!Array.isArray(rawRows) || !Array.isArray(columns)) {
    return [];
  }
  const safeIntegers = resolveBuilderEffectivePolicy(
    options.safeIntegers,
    rawRows,
  );
  const residentBytes = resolveBuilderResidentBytes(
    options.residentBytes,
    rawRows,
  );
  return materializeAndPresentRowObjects(columns, rawRows, {
    safeIntegers,
    residentBytes,
  });
}

function createPositionalLazyRowsBuilder(target, options = {}) {
  let cachedRows = null;
  return () => {
    if (cachedRows === null) {
      cachedRows = buildRowsFromTargetOrOptions(target, options);
    }
    return cachedRows;
  };
}

function resolveLazyRowsBuilder(target, getterOrOptions) {
  if (typeof getterOrOptions === LOCAL_STR_FUNCTION) {
    return getterOrOptions;
  }
  const customGetRows = getterOrOptions?.getRows;
  if (typeof customGetRows === LOCAL_STR_FUNCTION) {
    return customGetRows;
  }
  return createPositionalLazyRowsBuilder(target, getterOrOptions);
}

function defineCachedRowsValue(holder, rows) {
  if (!holder || typeof holder !== LOCAL_STR_OBJECT) {
    return;
  }
  Object.defineProperty(holder, PROP_ROWS, {
    value: rows,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function cacheRowsOnTargetAndReceiver(target, receiver, rows) {
  defineCachedRowsValue(target, rows);
  if (receiver !== target) {
    defineCachedRowsValue(receiver, rows);
  }
  return rows;
}

function defineLazyRowObjectsGetter(target, getterOrOptions = undefined) {
  const getRows = resolveLazyRowsBuilder(target, getterOrOptions);
  Object.defineProperty(target, LAZY_ROWS_GETTER_SYMBOL, {
    value: getRows,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, PROP_ROWS, {
    enumerable: true,
    configurable: true,
    get() {
      const receiver =
        this && typeof this === LOCAL_STR_OBJECT ? this : target;
      const rawRows = Array.isArray(receiver?.rawRows) ?
        receiver.rawRows :
        target?.rawRows;
      if (Array.isArray(rawRows) && rawRows.length === 0) {
        const emptyRows = stampRowCollectionPresentation(
          [],
          rawRows[PRESENTED_SAFE_INTEGERS_SYMBOL],
          0,
        );
        return cacheRowsOnTargetAndReceiver(target, receiver, emptyRows);
      }
      const materialized = getRows();
      return cacheRowsOnTargetAndReceiver(target, receiver, materialized);
    },
    set(nextRows) {
      const receiver =
        this && typeof this === LOCAL_STR_OBJECT ? this : target;
      defineCachedRowsValue(receiver, nextRows);
    },
  });
  return target;
}

function copyNonRowsEnumerableProperties(target, source) {
  if (!source || typeof source !== LOCAL_STR_OBJECT) {
    return;
  }
  for (const key of Object.keys(source)) {
    if (key === PROP_ROWS) {
      continue;
    }
    target[key] = source[key];
  }
}

function attachExplicitExtraRows(target, extraFields) {
  if (hasLazyRowsProperty(extraFields)) {
    return defineLazyRowObjectsGetter(target, () => extraFields.rows);
  }
  target.rows = extraFields.rows;
  return target;
}

function cloneResultWithMetadata(sourceResult, extraFields = undefined) {
  if (!sourceResult || typeof sourceResult !== LOCAL_STR_OBJECT) {
    return sourceResult;
  }
  const target = {};
  copyNonRowsEnumerableProperties(target, sourceResult);
  copyNonRowsEnumerableProperties(target, extraFields);
  if (
    extraFields &&
    typeof extraFields === LOCAL_STR_OBJECT &&
    Object.hasOwn(extraFields, PROP_ROWS)
  ) {
    return attachExplicitExtraRows(target, extraFields);
  }
  if (hasLazyRowsProperty(sourceResult)) {
    return defineLazyRowObjectsGetter(target, () => sourceResult.rows);
  }
  if (
    Object.hasOwn(sourceResult, PROP_ROWS) &&
    Array.isArray(sourceResult.rows)
  ) {
    target.rows = sourceResult.rows;
    return target;
  }
  if (hasPositionalRowColumns(sourceResult)) {
    return defineLazyRowObjectsGetter(target);
  }
  if (Object.hasOwn(sourceResult, PROP_ROWS)) {
    target.rows = sourceResult.rows;
  }
  return target;
}

export {
  LAZY_ROWS_GETTER_SYMBOL,
  PRESENTED_SAFE_INTEGERS_SYMBOL,
  RESIDENT_RESULT_BYTES_SYMBOL,
  cloneResultWithMetadata,
  defineLazyRowObjectsGetter,
  getObjectRowMaterializationCount,
  getResultRowCount,
  hasLazyRowsProperty,
  hasPositionalRowColumns,
  materializeAndPresentRowObjects,
  presentRawSqlRows,
  presentSqlRowObjects,
  presentSqlValue,
  resetObjectRowMaterializationCount,
  stampRowCollectionPresentation,
};
