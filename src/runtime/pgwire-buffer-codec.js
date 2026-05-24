/**
 * PgWire buffer codec helpers.
 *
 * @module runtime/pgwire-buffer-codec
 */

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_UTF8 = 'utf8';

/**
 * Write a null-terminated C string into a buffer at offset.
 *
 * @param {Buffer} buf - Target buffer.
 * @param {string} str - String to write.
 * @param {number} offset - Write offset.
 * @return {number} New offset after the null terminator.
 */
function writeCString(buf, str, offset) {
  const written = buf.write(str, offset, LOCAL_STR_UTF8);
  buf[offset + written] = LOCAL_NUM_ZERO;
  return offset + written + LOCAL_NUM_ONE;
}

/**
 * Read a null-terminated C string from a buffer at offset.
 *
 * @param {Buffer} buf - Source buffer.
 * @param {number} offset - Read offset.
 * @return {{value: string, nextOffset: number}}
 */
function readCString(buf, offset) {
  const end = buf.indexOf(LOCAL_NUM_ZERO, offset);
  if (end === -LOCAL_NUM_ONE) {
    return {value: LOCAL_STR_EMPTY, nextOffset: buf.length};
  }
  return {
    value: buf.toString(LOCAL_STR_UTF8, offset, end),
    nextOffset: end + LOCAL_NUM_ONE,
  };
}

export {
  writeCString,
  readCString,
};
