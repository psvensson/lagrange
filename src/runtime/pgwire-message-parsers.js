/**
 * PgWire frontend message parsers.
 *
 * @module runtime/pgwire-message-parsers
 */

import {readCString} from './pgwire-buffer-codec.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_TWO = 2;
const LOCAL_NUM_FOUR = 4;
const LOCAL_STR_UTF8 = 'utf8';

/**
 * Parse startup message parameters from payload buffer.
 * Parameters are null-terminated key-value pairs ending with
 * a final null byte.
 *
 * @param {Buffer} buf - Payload after version field.
 * @return {Object} Parsed parameters.
 */
function parseStartupParams(buf) {
  const params = {};
  let off = LOCAL_NUM_ZERO;
  while (off < buf.length) {
    if (buf[off] === LOCAL_NUM_ZERO) break;
    const key = readCString(buf, off);
    off = key.nextOffset;
    if (off >= buf.length) break;
    const val = readCString(buf, off);
    off = val.nextOffset;
    params[key.value] = val.value;
  }
  return params;
}

/**
 * Parse a simple Query message payload.
 * @param {Buffer} payload - Message payload (after header).
 * @return {{query: string}}
 */
function parseQueryMessage(payload) {
  const {value} = readCString(payload, LOCAL_NUM_ZERO);
  return {query: value};
}

/**
 * Parse a Parse message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{name: string, query: string, paramTypes: number[]}}
 */
function parseParseMessage(payload) {
  let off = LOCAL_NUM_ZERO;
  const name = readCString(payload, off);
  off = name.nextOffset;
  const query = readCString(payload, off);
  off = query.nextOffset;
  const numParams = payload.readInt16BE(off);
  off += LOCAL_NUM_TWO;
  const paramTypes = [];
  for (let i = LOCAL_NUM_ZERO; i < numParams; i++) {
    paramTypes.push(payload.readInt32BE(off));
    off += LOCAL_NUM_FOUR;
  }
  return {
    name: name.value,
    query: query.value,
    paramTypes,
  };
}

/**
 * Parse a Bind message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{portal: string, statement: string, params: string[]}}
 */
function parseBindMessage(payload) {
  let off = LOCAL_NUM_ZERO;
  const portal = readCString(payload, off);
  off = portal.nextOffset;
  const statement = readCString(payload, off);
  off = statement.nextOffset;

  const numFormats = payload.readInt16BE(off);
  off += LOCAL_NUM_TWO;
  off += numFormats * LOCAL_NUM_TWO;

  const numParams = payload.readInt16BE(off);
  off += LOCAL_NUM_TWO;
  const params = [];
  for (let i = LOCAL_NUM_ZERO; i < numParams; i++) {
    const len = payload.readInt32BE(off);
    off += LOCAL_NUM_FOUR;
    if (len === -LOCAL_NUM_ONE) {
      params.push(null);
    } else {
      params.push(payload.toString(LOCAL_STR_UTF8, off, off + len));
      off += len;
    }
  }
  return {
    portal: portal.value,
    statement: statement.value,
    params,
  };
}

/**
 * Parse a Describe message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{type: number, name: string}}
 */
function parseDescribeMessage(payload) {
  return {
    type: payload[LOCAL_NUM_ZERO],
    name: readCString(payload, LOCAL_NUM_ONE).value,
  };
}

/**
 * Parse an Execute message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{portal: string, maxRows: number}}
 */
function parseExecuteMessage(payload) {
  const portal = readCString(payload, LOCAL_NUM_ZERO);
  const maxRows = payload.readInt32BE(portal.nextOffset);
  return {portal: portal.value, maxRows};
}

/**
 * Parse a Close message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{type: number, name: string}}
 */
function parseCloseMessage(payload) {
  return {
    type: payload[LOCAL_NUM_ZERO],
    name: readCString(payload, LOCAL_NUM_ONE).value,
  };
}

export {
  parseStartupParams,
  parseQueryMessage,
  parseParseMessage,
  parseBindMessage,
  parseDescribeMessage,
  parseExecuteMessage,
  parseCloseMessage,
};
