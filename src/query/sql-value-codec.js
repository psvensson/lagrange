/**
 * The one typed wire encoding of SQL values (coordinator-sqlite-merge design
 * section 2.6, decisions D1 and D3). It is the only module that knows the
 * shape. It is not wired into any production path yet: WP3 switches the
 * partition read producer, the coordinator decode and the read parameters to
 * it in one step.
 *
 *   TypedRowSet = {v: 1, columns: [name, ...], rows: [[classes, cell, ...], ...]}
 *   TypedParams = {v: 1, classes, cells: [cell, ...]}
 *
 * `columns` keeps order and duplicates (better-sqlite3 `.raw()` rows). Each
 * row, and each params record, carries a class string with one
 * SQL_STORAGE_CLASS character per value. Each value has exactly one cell:
 *
 *   NULL     null
 *   INTEGER  decimal text of a signed 64-bit integer: no '+', no leading
 *            zeros, no "-0". In memory a BigInt.
 *   REAL     ECMAScript Number::toString text, the shortest text that
 *            round-trips, plus "-0", "Infinity" and "-Infinity". NaN has
 *            no cell: SQLite stores a bound NaN as NULL, so a read never
 *            yields it and a parameter NaN is refused instead of silently
 *            becoming NULL.
 *   TEXT     the string itself, which must be well-formed UTF-16. An
 *            unpaired surrogate has no UTF-8 form; bound, it is stored as
 *            bytes that read back as U+FFFD, so it is refused. TEXT that is
 *            already invalid UTF-8 inside SQLite is replaced by U+FFFD by
 *            better-sqlite3 at the read, before any codec: a binding limit.
 *   BLOB     padded standard base64 (RFC 4648 section 4); an empty BLOB is
 *            "". Base64 rather than hex: a third of the frame bytes the
 *            merge budget charges instead of double, native encode and
 *            decode, and an alphabet JSON never escapes.
 *
 * Every non-null cell is a string, so a record is JSON-safe by construction
 * and survives JSON.stringify/JSON.parse and local by-reference delivery
 * alike. Decoding yields BigInt, number, string, Buffer or null; better-sqlite3
 * binds those back to INTEGER, REAL, TEXT, BLOB and NULL. A JS number always
 * binds REAL, which is why INTEGER never decodes to a number.
 *
 * Input typing (D3, D15) is the same for row values and parameters: BigInt is
 * INTEGER (int64 range), boolean is INTEGER (1 or 0), number is REAL (an
 * integral number too; NaN refused), string is TEXT, Buffer or Uint8Array is
 * BLOB, null is NULL, and
 * anything else is refused. A producer reading SQLite must therefore read
 * with safeIntegers(true): an INTEGER read as a JS number would be typed REAL.
 *
 * The decoder is strict: a non-canonical cell, an unknown class character, a
 * wrong arity, an unknown or missing version, an extra or missing field or an
 * out-of-range integer is a typed SqlValueCodecError. There is no reviver and
 * no lenient path: a cell is canonical exactly when re-encoding its decoded
 * value reproduces it.
 */

import {types} from 'node:util';

import {BaseError} from '../utils/base-error.js';
import {
  SQL_STORAGE_CLASS,
  SQL_VALUE_CODEC_ERROR_CODE,
  SQL_VALUE_CODEC_REFUSAL,
} from './sql-value-codec-constants.js';

// Intrinsics are captured at module load, so a replaced prototype method
// cannot change what the decoder admits.
const arrayIsArray = Array.isArray;
const bigIntAsIntN = BigInt.asIntN;
const bigIntToString = Function.call.bind(BigInt.prototype.toString);
const bufferByteLength = Buffer.byteLength.bind(Buffer);
const bufferFrom = Buffer.from.bind(Buffer);
const bufferToString = Function.call.bind(Buffer.prototype.toString);
const isUint8Array = types.isUint8Array.bind(types);
const jsonStringify = JSON.stringify;
const numberIsNaN = Number.isNaN;
const numberToString = Function.call.bind(Number.prototype.toString);
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectKeys = Object.keys;
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringCharCodeAt = Function.call.bind(String.prototype.charCodeAt);
const stringIsWellFormed = Function.call.bind(String.prototype.isWellFormed);
const toBigInt = BigInt;
const toNumber = Number;

const MIN_SAFE_BIGINT = toBigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = toBigInt(Number.MAX_SAFE_INTEGER);

const CODEC_VERSION = 1;
const VERSION_FIELD = 'v';
const ROW_SET_FIELDS = objectFreeze([VERSION_FIELD, 'columns', 'rows']);
const PARAMS_FIELDS = objectFreeze([VERSION_FIELD, 'classes', 'cells']);
const ROW_CELL_OFFSET = 1;
const PARAMS_CELL_OFFSET = 0;

const INT64_BITS = 64;
// "-9223372036854775808": any longer canonical integer text is out of range.
// Checking the length first also bounds the BigInt parse of a hostile cell
// (a million digits cost about 76 ms).
const MAX_INTEGER_TEXT_LENGTH = 20;
const CANONICAL_INTEGER_TEXT = /^(?:0|-?[1-9][0-9]*)$/u;
const NEGATIVE_ZERO_TEXT = '-0';
const BLOB_TEXT_ENCODING = 'base64';
const UTF8_ENCODING = 'utf8';

// JSON text accounting (ECMAScript JSON.stringify, no spacing).
const JSON_NULL_BYTES = 4;
const JSON_QUOTES_BYTES = 2;
const JSON_BRACKETS_BYTES = 2;
const JSON_SEPARATOR_BYTES = 1;
const JSON_CONTROL_UNIT_LIMIT = 0x20;
const JSON_QUOTE_UNIT = 0x22;
const JSON_BACKSLASH_UNIT = 0x5c;
// \b \t \n \f \r replace one byte with two; other control units become the
// six-byte \u00XX.
const JSON_SHORT_ESCAPED_CONTROL_UNITS = objectFreeze([0x08, 0x09, 0x0a, 0x0c, 0x0d]);
const JSON_SHORT_ESCAPE_EXTRA_BYTES = 1;
const JSON_UNICODE_ESCAPE_EXTRA_BYTES = 5;
const EMPTY_ROW_SET_BYTES = bufferByteLength(
  jsonStringify({v: CODEC_VERSION, columns: [], rows: []}), UTF8_ENCODING);

const ERROR_COMPONENT = 'sql-value-codec';
const POSITION_ROW_TEXT = ' at row ';
const POSITION_COLUMN_TEXT = ' at value ';
const BOOLEAN_TRUE_INTEGER_TEXT = '1';
const BOOLEAN_FALSE_INTEGER_TEXT = '0';

const NO_POSITION = null;

/**
 * A typed refusal of the codec. `code` is a SQL_VALUE_CODEC_ERROR_CODE member,
 * `reason` a SQL_VALUE_CODEC_REFUSAL member; `row` is the row index (null for
 * params and frame-level refusals) and `column` the column or parameter index
 * (null for row- and frame-level refusals).
 */
class SqlValueCodecError extends BaseError {
  constructor(code, reason, row, column) {
    super(`${code}: ${reason}${describePosition(row, POSITION_ROW_TEXT)}` +
      `${describePosition(column, POSITION_COLUMN_TEXT)}`, {
      context: {component: ERROR_COMPONENT, metadata: {reason, row, column}},
    });
    this.code = code;
    this.reason = reason;
    this.row = row;
    this.column = column;
  }
}

function describePosition(index, label) {
  return index === NO_POSITION ? '' : `${label}${index}`;
}

function invalid(reason, row = NO_POSITION, column = NO_POSITION) {
  return new SqlValueCodecError(
    SQL_VALUE_CODEC_ERROR_CODE.INVALID, reason, row, column);
}

function unrepresentable(reason, row = NO_POSITION, column = NO_POSITION) {
  return new SqlValueCodecError(
    SQL_VALUE_CODEC_ERROR_CODE.UNREPRESENTABLE, reason, row, column);
}

function realText(value) {
  return objectIs(value, -0) ? NEGATIVE_ZERO_TEXT : numberToString(value);
}

// ---- encoding ----------------------------------------------------------

// The input-typing table (D3, D15): the one place a JS value gets a storage class.
function storageClassOf(value, row, column) {
  if (value === null) return SQL_STORAGE_CLASS.NULL;
  switch (typeof value) {
  case 'bigint':
  case 'boolean':
    return SQL_STORAGE_CLASS.INTEGER;
  case 'number': return SQL_STORAGE_CLASS.REAL;
  case 'string': return SQL_STORAGE_CLASS.TEXT;
  case 'object':
    if (isUint8Array(value)) return SQL_STORAGE_CLASS.BLOB;
    break;
  default:
    break;
  }
  throw unrepresentable(SQL_VALUE_CODEC_REFUSAL.VALUE_TYPE_UNSUPPORTED, row, column);
}

function encodeInteger(value, row, column) {
  if (typeof value === 'boolean') {
    return value ? BOOLEAN_TRUE_INTEGER_TEXT : BOOLEAN_FALSE_INTEGER_TEXT;
  }
  if (bigIntAsIntN(INT64_BITS, value) !== value) {
    throw unrepresentable(SQL_VALUE_CODEC_REFUSAL.INTEGER_OUT_OF_RANGE, row, column);
  }
  return bigIntToString(value);
}

function encodeReal(value, row, column) {
  if (numberIsNaN(value)) {
    throw unrepresentable(SQL_VALUE_CODEC_REFUSAL.REAL_NOT_A_NUMBER, row, column);
  }
  return realText(value);
}

function encodeText(value, row, column) {
  if (!stringIsWellFormed(value)) {
    throw unrepresentable(SQL_VALUE_CODEC_REFUSAL.TEXT_NOT_WELL_FORMED, row, column);
  }
  return value;
}

function encodeBlob(value) {
  return bufferToString(
    bufferFrom(value.buffer, value.byteOffset, value.byteLength),
    BLOB_TEXT_ENCODING);
}

function encodeCell(storageClass, value, row, column) {
  switch (storageClass) {
  case SQL_STORAGE_CLASS.INTEGER: return encodeInteger(value, row, column);
  case SQL_STORAGE_CLASS.REAL: return encodeReal(value, row, column);
  case SQL_STORAGE_CLASS.TEXT: return encodeText(value, row, column);
  case SQL_STORAGE_CLASS.BLOB: return encodeBlob(value);
  default: return null;
  }
}

// Writes the cells of `values` into `cells` from `offset` and returns the
// class string.
function encodeValues(values, cells, offset, row) {
  let classes = '';
  for (let column = 0; column < values.length; column += 1) {
    const value = values[column];
    const storageClass = storageClassOf(value, row, column);
    cells[offset + column] = encodeCell(storageClass, value, row, column);
    classes += storageClass;
  }
  return classes;
}

function encodeRow(values, width, row) {
  if (!arrayIsArray(values)) {
    throw unrepresentable(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID, row);
  }
  if (values.length !== width) {
    throw unrepresentable(SQL_VALUE_CODEC_REFUSAL.ARITY_MISMATCH, row);
  }
  const encoded = new Array(width + ROW_CELL_OFFSET);
  encoded[0] = encodeValues(values, encoded, ROW_CELL_OFFSET, row);
  return encoded;
}

// Column names are copied; each must be a well-formed string. `refuse` is
// the family of the side reading them (encoder input or decoder wire).
function copyColumnNames(columns, refuse) {
  if (!arrayIsArray(columns)) throw refuse(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID);
  const names = new Array(columns.length);
  for (let column = 0; column < columns.length; column += 1) {
    const name = columns[column];
    if (typeof name !== 'string') {
      throw refuse(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID, NO_POSITION, column);
    }
    if (!stringIsWellFormed(name)) {
      throw refuse(SQL_VALUE_CODEC_REFUSAL.TEXT_NOT_WELL_FORMED, NO_POSITION, column);
    }
    names[column] = name;
  }
  return names;
}

/**
 * Encode a result as a TypedRowSet.
 * @param {string[]} columns - Result column names in order, duplicates kept.
 * @param {Array<Array<*>>} rows - Value rows as better-sqlite3 returns them
 *   with `.raw(true)` and `safeIntegers(true)`: BigInt, number, string,
 *   Buffer or null, one per column.
 * @return {{v: number, columns: string[], rows: Array<Array<?string>>}}
 * @throws {SqlValueCodecError} UNREPRESENTABLE for a value outside the
 *   input-typing table or a row whose width differs from the column count.
 */
function encodeTypedRowSet(columns, rows) {
  const names = copyColumnNames(columns, unrepresentable);
  if (!arrayIsArray(rows)) throw unrepresentable(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID);
  const encodedRows = new Array(rows.length);
  for (let row = 0; row < rows.length; row += 1) {
    encodedRows[row] = encodeRow(rows[row], names.length, row);
  }
  return {v: CODEC_VERSION, columns: names, rows: encodedRows};
}

/**
 * Encode statement parameters as TypedParams under the input-typing table
 * (boolean inputs are encoded as INTEGER '1'/'0').
 * @param {Array<*>} values - Positional parameter values.
 * @return {{v: number, classes: string, cells: Array<?string>}}
 * @throws {SqlValueCodecError} UNREPRESENTABLE for a value outside the table
 *   (undefined, functions, symbols, non-Uint8Array objects, NaN, a BigInt
 *   outside int64, a string with an unpaired surrogate) or a non-array
 *   (named parameters are not typed).
 */
function encodeTypedParams(values) {
  if (!arrayIsArray(values)) throw unrepresentable(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID);
  const cells = new Array(values.length);
  const classes = encodeValues(values, cells, PARAMS_CELL_OFFSET, NO_POSITION);
  return {v: CODEC_VERSION, classes, cells};
}

// ---- decoding ----------------------------------------------------------

function decodeNull(cell, row, column) {
  if (cell !== null) throw invalid(SQL_VALUE_CODEC_REFUSAL.CELL_NOT_CANONICAL, row, column);
  return null;
}

function decodeInteger(cell, row, column) {
  if (typeof cell !== 'string' || !regExpTest(CANONICAL_INTEGER_TEXT, cell)) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.CELL_NOT_CANONICAL, row, column);
  }
  if (cell.length > MAX_INTEGER_TEXT_LENGTH) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.INTEGER_OUT_OF_RANGE, row, column);
  }
  const value = toBigInt(cell);
  if (bigIntAsIntN(INT64_BITS, value) !== value) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.INTEGER_OUT_OF_RANGE, row, column);
  }
  return value;
}

function decodeReal(cell, row, column) {
  if (typeof cell !== 'string') {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.CELL_NOT_CANONICAL, row, column);
  }
  const value = toNumber(cell);
  if (numberIsNaN(value) || realText(value) !== cell) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.CELL_NOT_CANONICAL, row, column);
  }
  return value;
}

function decodeText(cell, row, column) {
  if (typeof cell !== 'string') {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.CELL_NOT_CANONICAL, row, column);
  }
  if (!stringIsWellFormed(cell)) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.TEXT_NOT_WELL_FORMED, row, column);
  }
  return cell;
}

function decodeBlob(cell, row, column) {
  if (typeof cell !== 'string') {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.CELL_NOT_CANONICAL, row, column);
  }
  const value = bufferFrom(cell, BLOB_TEXT_ENCODING);
  if (bufferToString(value, BLOB_TEXT_ENCODING) !== cell) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.CELL_NOT_CANONICAL, row, column);
  }
  return value;
}

function decodeCell(storageClass, cell, row, column) {
  switch (storageClass) {
  case SQL_STORAGE_CLASS.NULL: return decodeNull(cell, row, column);
  case SQL_STORAGE_CLASS.INTEGER: return decodeInteger(cell, row, column);
  case SQL_STORAGE_CLASS.REAL: return decodeReal(cell, row, column);
  case SQL_STORAGE_CLASS.TEXT: return decodeText(cell, row, column);
  case SQL_STORAGE_CLASS.BLOB: return decodeBlob(cell, row, column);
  default:
    throw invalid(SQL_VALUE_CODEC_REFUSAL.STORAGE_CLASS_UNKNOWN, row, column);
  }
}

// Decodes `classes`/`cells` (from `offset`) into `values`, whose length is
// the arity the caller has already checked.
function decodeCells(classes, cells, offset, values, row) {
  for (let column = 0; column < values.length; column += 1) {
    values[column] = decodeCell(classes[column], cells[offset + column], row, column);
  }
  return values;
}

// A record with exactly `fields` as own keys and the codec version.
function assertVersionedRecord(wire, fields) {
  if (wire === null || typeof wire !== 'object' || arrayIsArray(wire)) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID);
  }
  if (!objectHasOwn(wire, VERSION_FIELD) || wire.v !== CODEC_VERSION) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.VERSION_UNSUPPORTED);
  }
  if (objectKeys(wire).length !== fields.length) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID);
  }
  for (let index = 0; index < fields.length; index += 1) {
    if (!objectHasOwn(wire, fields[index])) {
      throw invalid(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID);
    }
  }
}

function decodeRow(encoded, width, row) {
  if (!arrayIsArray(encoded) || typeof encoded[0] !== 'string') {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID, row);
  }
  if (encoded.length !== width + ROW_CELL_OFFSET || encoded[0].length !== width) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.ARITY_MISMATCH, row);
  }
  return decodeCells(encoded[0], encoded, ROW_CELL_OFFSET, new Array(width), row);
}

/**
 * Strictly decode a TypedRowSet.
 * @param {*} wire - The record as received (after JSON.parse, or by reference).
 * @return {{columns: string[], rows: Array<Array<*>>}} Values as BigInt,
 *   number, string, Buffer or null.
 * @throws {SqlValueCodecError} INVALID for any non-canonical form.
 */
function decodeTypedRowSet(wire) {
  assertVersionedRecord(wire, ROW_SET_FIELDS);
  const columns = copyColumnNames(wire.columns, invalid);
  const encodedRows = wire.rows;
  if (!arrayIsArray(encodedRows)) throw invalid(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID);
  const rows = new Array(encodedRows.length);
  for (let row = 0; row < encodedRows.length; row += 1) {
    rows[row] = decodeRow(encodedRows[row], columns.length, row);
  }
  return {columns, rows};
}

/**
 * Strictly decode TypedParams.
 * @param {*} wire - The record as received.
 * @return {Array<*>} Positional values as BigInt, number, string, Buffer or null.
 * @throws {SqlValueCodecError} INVALID for any non-canonical form.
 */
function decodeTypedParams(wire) {
  assertVersionedRecord(wire, PARAMS_FIELDS);
  const {classes, cells} = wire;
  if (typeof classes !== 'string' || !arrayIsArray(cells)) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID);
  }
  if (classes.length !== cells.length) {
    throw invalid(SQL_VALUE_CODEC_REFUSAL.ARITY_MISMATCH);
  }
  return decodeCells(classes, cells, PARAMS_CELL_OFFSET, new Array(cells.length),
    NO_POSITION);
}

// ---- byte accounting ---------------------------------------------------

function jsonEscapeExtraBytes(unit) {
  if (unit === JSON_QUOTE_UNIT || unit === JSON_BACKSLASH_UNIT) {
    return JSON_SHORT_ESCAPE_EXTRA_BYTES;
  }
  if (unit >= JSON_CONTROL_UNIT_LIMIT) return 0;
  for (let index = 0; index < JSON_SHORT_ESCAPED_CONTROL_UNITS.length; index += 1) {
    if (JSON_SHORT_ESCAPED_CONTROL_UNITS[index] === unit) {
      return JSON_SHORT_ESCAPE_EXTRA_BYTES;
    }
  }
  return JSON_UNICODE_ESCAPE_EXTRA_BYTES;
}

// The UTF-8 bytes of JSON.stringify(text) for a well-formed string.
function jsonTextByteLength(text) {
  let bytes = JSON_QUOTES_BYTES + bufferByteLength(text, UTF8_ENCODING);
  for (let index = 0; index < text.length; index += 1) {
    bytes += jsonEscapeExtraBytes(stringCharCodeAt(text, index));
  }
  return bytes;
}

function cellByteLength(storageClass, cell) {
  if (storageClass === SQL_STORAGE_CLASS.NULL) return JSON_NULL_BYTES;
  if (storageClass === SQL_STORAGE_CLASS.TEXT) return jsonTextByteLength(cell);
  // INTEGER, REAL and BLOB cells are ASCII that JSON never escapes.
  return JSON_QUOTES_BYTES + cell.length;
}

function rowByteLength(encoded) {
  const classes = encoded[0];
  let bytes = JSON_BRACKETS_BYTES + JSON_QUOTES_BYTES + classes.length;
  for (let column = 0; column < classes.length; column += 1) {
    bytes += JSON_SEPARATOR_BYTES +
      cellByteLength(classes[column], encoded[ROW_CELL_OFFSET + column]);
  }
  return bytes;
}

// The bytes between the brackets of a JSON array whose items have the
// given byte lengths, separators included.
function separatedListBytes(itemBytes, itemCount) {
  return itemCount === 0 ? 0 : itemBytes + (itemCount - 1) * JSON_SEPARATOR_BYTES;
}

/**
 * The exact UTF-8 byte length of JSON.stringify(rowSet): what the frame of a
 * TypedRowSet costs on the wire, counted from its encoded cells. Defined for
 * a TypedRowSet that encodeTypedRowSet produced or decodeTypedRowSet
 * admitted.
 * @param {{columns: string[], rows: Array<Array<?string>>}} rowSet
 * @return {number}
 */
function typedRowSetByteLength(rowSet) {
  const {columns, rows} = rowSet;
  let columnBytes = 0;
  for (let column = 0; column < columns.length; column += 1) {
    columnBytes += jsonTextByteLength(columns[column]);
  }
  let rowBytes = 0;
  for (let row = 0; row < rows.length; row += 1) {
    rowBytes += rowByteLength(rows[row]);
  }
  return EMPTY_ROW_SET_BYTES +
    separatedListBytes(columnBytes, columns.length) +
    separatedListBytes(rowBytes, rows.length);
}

/**
 * Encode one raw row and measure its UTF-8 JSON byte length (C9: per-row
 * encode-and-measure entry point for bounded partition collection).
 * @param {Array<*>} values - Raw row values as returned by better-sqlite3
 *   with `.raw(true)` and `safeIntegers(true)`.
 * @param {number} width - Expected column count.
 * @param {number} [row] - Row index for error reporting.
 * @return {{encoded: Array<?string>, byteLength: number}}
 */
function encodeAndMeasureTypedRow(values, width, row = NO_POSITION) {
  const encoded = encodeRow(values, width, row);
  return {encoded, byteLength: rowByteLength(encoded)};
}

/**
 * Assemble a TypedRowSet from column names and pre-encoded rows produced by
 * encodeAndMeasureTypedRow.
 * @param {string[]} columns - Result column names in order.
 * @param {Array<Array<?string>>} encodedRows - Encoded rows.
 * @return {{v: number, columns: string[], rows: Array<Array<?string>>}}
 */
function assembleTypedRowSet(columns, encodedRows) {
  const names = copyColumnNames(columns, unrepresentable);
  if (!arrayIsArray(encodedRows)) {
    throw unrepresentable(SQL_VALUE_CODEC_REFUSAL.SHAPE_INVALID);
  }
  return {v: CODEC_VERSION, columns: names, rows: encodedRows};
}

function normalizeMaterializedCellValue(value, coerceSafeBigIntToNumber) {
  if (
    coerceSafeBigIntToNumber &&
    typeof value === 'bigint' &&
    value >= MIN_SAFE_BIGINT &&
    value <= MAX_SAFE_BIGINT
  ) {
    return toNumber(value);
  }
  return value === undefined ? null : value;
}

/**
 * Materialize frozen row objects from positional `(columns, rawRows)` using
 * `Object.defineProperty` so column names such as `"__proto__"` are defined as
 * own enumerable data properties rather than invoking prototype setters.
 * @param {string[]} columns
 * @param {Array<Array<*>>} rawRows
 * @param {Object} [options={}]
 * @param {boolean} [options.coerceSafeBigIntToNumber=false]
 * @return {Array<Object>}
 */
function materializeCapturedRowObjects(columns, rawRows, options = {}) {
  const coerceSafeBigIntToNumber = options?.coerceSafeBigIntToNumber === true;
  return objectFreeze(
    rawRows.map((values) => {
      const row = {};
      for (let index = 0; index < columns.length; index += 1) {
        objectDefineProperty(row, columns[index], {
          value: normalizeMaterializedCellValue(
            values[index],
            coerceSafeBigIntToNumber,
          ),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return objectFreeze(row);
    }),
  );
}

/**
 * Decode a `TypedRowSet` and materialize its rows into frozen own-property row
 * objects in one canonical step.
 * @param {{v: number, columns: string[], rows: Array<Array<?string>>}} rowSet
 * @param {Object} [options={}]
 * @param {boolean} [options.coerceSafeBigIntToNumber=false]
 * @return {Array<Object>}
 */
function materializeTypedRowSetObjects(rowSet, options = {}) {
  const {columns, rows} = decodeTypedRowSet(rowSet);
  return materializeCapturedRowObjects(columns, rows, options);
}

export {
  SqlValueCodecError,
  assembleTypedRowSet,
  decodeTypedParams,
  decodeTypedRowSet,
  encodeAndMeasureTypedRow,
  encodeTypedParams,
  encodeTypedRowSet,
  materializeCapturedRowObjects,
  materializeTypedRowSetObjects,
  typedRowSetByteLength,
};
