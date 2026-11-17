/**
 * SQLite scalar operations shared by the SELECT combiner and HAVING evaluator.
 * These functions consume the scalar values already carried by query rows;
 * they do not infer a lost INTEGER/REAL storage class from a JavaScript number.
 */

const SQL_TEXT_TERMINATOR = '\u0000';
const SQL_TEXT_ENCODING = 'utf8';
const SQL_INTEGER_PREFIX = /^[\t\n\v\f\r ]*([+-]?)(\d+)/u;
const SQL_INTEGER_LEADING_ZEROES = /^0+/u;
const SQL_NEGATIVE_SIGN = '-';
const SQL_REAL_PREFIX = /^[\t\n\v\f\r ]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u;
const SQL_INT64_MIN = -9_223_372_036_854_775_808n;
const SQL_INT64_MAX = 9_223_372_036_854_775_807n;
const SQL_INT64_MIN_MAGNITUDE_DIGITS = String(-SQL_INT64_MIN);
const SQL_INT64_MAX_DIGITS = String(SQL_INT64_MAX);
const SQLITE_ROUND_MAX_PRECISION = 30;
const SQLITE_ROUND_INTEGRAL_MAGNITUDE = 4_503_599_627_370_496;
const SQLITE_ROUND_HALF = 0.5;

function isNull(value) {
  return value === null || value === undefined;
}

function scalarText(value) {
  // Comparison evaluation represents SQL integer truth values as JS booleans.
  if (typeof value === 'boolean') return String(Number(value));
  return value instanceof Uint8Array ?
    Buffer.from(value).toString(SQL_TEXT_ENCODING) : String(value);
}

function numericPrefix(value, pattern) {
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return Number(value);
  }
  const prefix = scalarText(value).match(pattern);
  return prefix === null ? 0 : Number(prefix[0]);
}

function clampSqlInteger(value) {
  if (value < SQL_INT64_MIN) return SQL_INT64_MIN;
  return value > SQL_INT64_MAX ? SQL_INT64_MAX : value;
}

function numberToSqlInteger(value) {
  if (value <= Number(SQL_INT64_MIN)) return SQL_INT64_MIN;
  if (value >= Number(SQL_INT64_MAX)) return SQL_INT64_MAX;
  return Number.isNaN(value) ? 0n : BigInt(Math.trunc(value));
}

function textToSqlInteger(value) {
  const prefix = scalarText(value).match(SQL_INTEGER_PREFIX);
  if (prefix === null) return 0n;
  const negative = prefix[1] === SQL_NEGATIVE_SIGN;
  const digits = prefix[2].replace(SQL_INTEGER_LEADING_ZEROES, '');
  if (digits.length === 0) return 0n;
  const limit = negative ? SQL_INT64_MIN_MAGNITUDE_DIGITS : SQL_INT64_MAX_DIGITS;
  if (digits.length > limit.length ||
      (digits.length === limit.length && digits > limit)) {
    return negative ? SQL_INT64_MIN : SQL_INT64_MAX;
  }
  // Only the bounded signed64 magnitude is parsed, regardless of input size.
  const magnitude = BigInt(digits);
  return negative ? -magnitude : magnitude;
}

function scalarInteger(value) {
  if (typeof value === 'number') return numberToSqlInteger(value);
  if (typeof value === 'bigint') return clampSqlInteger(value);
  if (typeof value === 'boolean') return BigInt(Number(value));
  return textToSqlInteger(value);
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

function sliceBoundary(boundary, extent) {
  if (boundary < 0n) return 0;
  return Number(boundary > extent ? extent : boundary);
}

function substringRange(size, position, count) {
  // Large signed bounds can cancel to a small range. Preserve the exact
  // integers until only indexes within this text/BLOB remain.
  const extent = BigInt(size);
  let origin = position < 0n ? extent + position : position - 1n;
  if (count === undefined) return [sliceBoundary(origin, extent), size];
  if (position === 0n && count < 0n) origin = 0n;
  if (count < 0n) {
    return [sliceBoundary(origin + count, extent), sliceBoundary(origin, extent)];
  }
  return [sliceBoundary(origin, extent), sliceBoundary(origin + count, extent)];
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
  // SQLite's empty input BLOB has a null data pointer. An empty slice of a
  // nonempty BLOB is different: it remains a BLOB with zero bytes.
  if (value instanceof Uint8Array && value.byteLength === 0) return null;
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
    Math.max(Number(scalarInteger(precision)), 0));
  if (Math.abs(number) > SQLITE_ROUND_INTEGRAL_MAGNITUDE) return number;
  if (digits === 0) {
    const half = number < 0 ? -SQLITE_ROUND_HALF : SQLITE_ROUND_HALF;
    const rounded = Math.trunc(number + half);
    return rounded === 0 ? 0 : rounded;
  }
  return Number(number.toFixed(digits));
}

export {sqlLength, sqlSubstr, sqlRound};
