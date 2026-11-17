/**
 * SQLite scalar operations shared by the SELECT combiner and HAVING evaluator.
 * These functions consume the scalar values already carried by query rows;
 * they do not infer a lost INTEGER/REAL storage class from a JavaScript number.
 */

const SQL_TEXT_TERMINATOR = '\u0000';
const SQL_TEXT_ENCODING = 'utf8';
const SQL_INTEGER_PREFIX = /^[\t\n\v\f\r ]*[+-]?\d+/u;
const SQL_REAL_PREFIX = /^[\t\n\v\f\r ]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u;
const SQL_INT64_MAGNITUDE = 9_223_372_036_854_775_808;
const SQLITE_ROUND_MAX_PRECISION = 30;
const SQLITE_ROUND_INTEGRAL_MAGNITUDE = 4_503_599_627_370_496;
const SQLITE_ROUND_HALF = 0.5;

function isNull(value) {
  return value === null || value === undefined;
}

function scalarText(value) {
  return value instanceof Uint8Array ?
    Buffer.from(value).toString(SQL_TEXT_ENCODING) : String(value);
}

function numericPrefix(value, pattern) {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Number(value);
  }
  const prefix = scalarText(value).match(pattern);
  return prefix === null ? 0 : Number(prefix[0]);
}

function scalarInteger(value) {
  const number = numericPrefix(value, SQL_INTEGER_PREFIX);
  return Math.min(SQL_INT64_MAGNITUDE,
    Math.max(-SQL_INT64_MAGNITUDE, Math.trunc(number)));
}

function textCodePoints(value) {
  const text = scalarText(value);
  const terminator = text.indexOf(SQL_TEXT_TERMINATOR);
  return Array.from(terminator < 0 ? text : text.slice(0, terminator));
}

/**
 * Count text codepoints before NUL, or all bytes of a BLOB.
 * @param {*} value - SQL scalar value.
 * @return {number|null} SQL LENGTH result.
 */
function sqlLength(value) {
  if (isNull(value)) return null;
  if (value instanceof Uint8Array) return value.byteLength;
  return textCodePoints(value).length;
}

function substringRange(size, position, count) {
  let origin = position < 0 ? size + position : position - 1;
  if (count === undefined) return [Math.max(origin, 0), size];
  if (position === 0 && count < 0) origin = 0;
  if (count < 0) {
    return [Math.max(origin + count, 0), Math.max(origin, 0)];
  }
  return [Math.max(origin, 0), Math.max(origin + count, 0)];
}

/**
 * Slice text codepoints or BLOB bytes using SQLite's one-based positions.
 * A negative length selects units before the start. Position zero occupies
 * the position before the first unit when a positive length is supplied.
 * @param {*} value - SQL text or BLOB value.
 * @param {*} start - SQL start argument.
 * @param {*} [length] - SQL length argument; omission means through the end.
 * @return {string|Buffer|null} SQL SUBSTR/SUBSTRING result.
 */
function sqlSubstr(value, start, length) {
  if (isNull(value) || isNull(start) || length === null) return null;
  const units = value instanceof Uint8Array ? value : textCodePoints(value);
  const position = scalarInteger(start);
  const count = length === undefined ? undefined : scalarInteger(length);
  const [from, to] = substringRange(units.length, position, count);
  const selected = units.slice(from, to);
  return value instanceof Uint8Array ? Buffer.from(selected) : selected.join('');
}

/**
 * Round the binary numeric value as SQLite does, with a bounded decimal
 * precision. Scaling before rounding changes values at decimal boundaries.
 * @param {*} value - SQL numeric argument.
 * @param {*} [precision=0] - SQL precision argument; negative values mean zero.
 * @return {number|null} SQL ROUND result.
 */
function sqlRound(value, precision = 0) {
  if (isNull(value) || precision === null) return null;
  const number = numericPrefix(value, SQL_REAL_PREFIX);
  const digits = Math.min(SQLITE_ROUND_MAX_PRECISION,
    Math.max(scalarInteger(precision), 0));
  if (Math.abs(number) > SQLITE_ROUND_INTEGRAL_MAGNITUDE) return number;
  if (digits === 0) {
    const half = number < 0 ? -SQLITE_ROUND_HALF : SQLITE_ROUND_HALF;
    const rounded = Math.trunc(number + half);
    return rounded === 0 ? 0 : rounded;
  }
  return Number(number.toFixed(digits));
}

export {sqlLength, sqlSubstr, sqlRound};
