/**
 * SQL value → call-cell WIT `cell-value` mapping (sole owner).
 *
 * Maps one better-sqlite3 row value to the sealed
 * `lagrange:cell/call-context` `cell-value` variant
 * (wit/world.wit, the canonical authoring WIT package):
 *   null-value | integer(s64) | real(f64) | text(string)
 *
 * Fails closed: unsafe integers, non-finite numbers, blobs, and any other
 * type have no variant and are refused (budget-exhausted semantics per the
 * sealed batch contract — the caller maps this to the typed denial).
 */

const CELL_VALUE_TAG = Object.freeze({
  NULL: 'null-value',
  INTEGER: 'integer',
  REAL: 'real',
  TEXT: 'text',
});

const CELL_VALUE_ERROR_NAME = 'CallCellValueError';
const CELL_VALUE_ERROR_CODE = 'call_cell_value_unmappable';
const CELL_VALUE_MESSAGE = Object.freeze({
  NON_FINITE: 'non-finite number has no cell-value variant',
  UNMAPPABLE_PREFIX: 'value of type ',
  UNMAPPABLE_SUFFIX: ' has no cell-value variant',
});

class CallCellValueError extends TypeError {
  constructor(message) {
    super(message);
    this.name = CELL_VALUE_ERROR_NAME;
    this.code = CELL_VALUE_ERROR_CODE;
  }
}

function toCellValue(value) {
  if (value === null || value === undefined) {
    return Object.freeze({tag: CELL_VALUE_TAG.NULL});
  }
  if (typeof value === 'bigint') {
    return Object.freeze({tag: CELL_VALUE_TAG.INTEGER, val: value});
  }
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value)) {
      return Object.freeze({
        tag: CELL_VALUE_TAG.INTEGER,
        val: BigInt(value),
      });
    }
    if (Number.isFinite(value)) {
      return Object.freeze({tag: CELL_VALUE_TAG.REAL, val: value});
    }
    throw new CallCellValueError(CELL_VALUE_MESSAGE.NON_FINITE);
  }
  if (typeof value === 'string') {
    return Object.freeze({tag: CELL_VALUE_TAG.TEXT, val: value});
  }
  throw new CallCellValueError(
    CELL_VALUE_MESSAGE.UNMAPPABLE_PREFIX + typeof value +
    CELL_VALUE_MESSAGE.UNMAPPABLE_SUFFIX);
}

function toCellRow(rowObject) {
  const columns = Object.entries(rowObject).map(([name, val]) =>
    Object.freeze({name, val: toCellValue(val)}));
  return Object.freeze({columns});
}

function toCellBatch(rowObjects, batchRowBound) {
  if (rowObjects.length > batchRowBound) {
    throw new CallCellValueError(
      `batch of ${rowObjects.length} rows exceeds the Binding-declared ` +
      `bound of ${batchRowBound}`);
  }
  return Object.freeze(rowObjects.map(toCellRow));
}

export {
  CELL_VALUE_TAG,
  CallCellValueError,
  toCellBatch,
};
