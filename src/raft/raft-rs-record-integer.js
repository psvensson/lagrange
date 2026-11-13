// Exact integer conversion at the durable Raft record's SQLite boundary.
import {RAFT_RS_STORE_ERROR_MSG} from './raft-rs-durable-store-constants.js';

const DECIMAL_DIGITS = /^\d+$/u;

/**
 * Convert a raft-rs decimal string into the BigInt SQLite binds exactly.
 * @param {string} value - A 64-bit value as a decimal string.
 * @return {bigint} The same value.
 */
function toExactInteger(value) {
  if (typeof value !== 'string' || !DECIMAL_DIGITS.test(value)) {
    throw new Error(RAFT_RS_STORE_ERROR_MSG.notAnIndex(value));
  }
  return BigInt(value);
}

/**
 * Convert what SQLite returned back into a raft-rs decimal string.
 * @param {bigint|number} value - A column value read with safe integers.
 * @return {string} The decimal string.
 */
function fromExactInteger(value) {
  return String(value);
}

/**
 * A nullable column read with safe integers, as a decimal string or null.
 * @param {bigint|number|null|undefined} value - The column value.
 * @return {string|null} The decimal string, or null.
 */
function nullableExactInteger(value) {
  return value === null || value === undefined ? null :
    fromExactInteger(value);
}

export {
  fromExactInteger,
  nullableExactInteger,
  toExactInteger,
};
