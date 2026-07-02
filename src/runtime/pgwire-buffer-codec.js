/**
 * PgWire buffer codec helpers.
 *
 * @module runtime/pgwire-buffer-codec
 */

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
  buf[offset + written] = 0;
  return offset + written + 1;
}

/**
 * Read a null-terminated C string from a buffer at offset.
 *
 * @param {Buffer} buf - Source buffer.
 * @param {number} offset - Read offset.
 * @return {{value: string, nextOffset: number}}
 */
function readCString(buf, offset) {
  const end = buf.indexOf(0, offset);
  if (end === -1) {
    return {value: '', nextOffset: buf.length};
  }
  return {
    value: buf.toString(LOCAL_STR_UTF8, offset, end),
    nextOffset: end + 1,
  };
}

export {
  writeCString,
  readCString,
};
