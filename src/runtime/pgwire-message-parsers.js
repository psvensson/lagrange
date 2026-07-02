/**
 * PgWire frontend message parsers.
 *
 * @module runtime/pgwire-message-parsers
 */

import {readCString} from './pgwire-buffer-codec.js';

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
  let off = 0;
  while (off < buf.length) {
    if (buf[off] === 0) break;
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
  const {value} = readCString(payload, 0);
  return {query: value};
}

/**
 * Parse a Parse message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{name: string, query: string, paramTypes: number[]}}
 */
function parseParseMessage(payload) {
  let off = 0;
  const name = readCString(payload, off);
  off = name.nextOffset;
  const query = readCString(payload, off);
  off = query.nextOffset;
  const numParams = payload.readInt16BE(off);
  off += 2;
  const paramTypes = [];
  for (let i = 0; i < numParams; i++) {
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
  let off = 0;
  const portal = readCString(payload, off);
  off = portal.nextOffset;
  const statement = readCString(payload, off);
  off = statement.nextOffset;

  const numFormats = payload.readInt16BE(off);
  off += 2;
  off += numFormats * 2;

  const numParams = payload.readInt16BE(off);
  off += 2;
  const params = [];
  for (let i = 0; i < numParams; i++) {
    const len = payload.readInt32BE(off);
    off += LOCAL_NUM_FOUR;
    if (len === -1) {
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
    type: payload[0],
    name: readCString(payload, 1).value,
  };
}

/**
 * Parse an Execute message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{portal: string, maxRows: number}}
 */
function parseExecuteMessage(payload) {
  const portal = readCString(payload, 0);
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
    type: payload[0],
    name: readCString(payload, 1).value,
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
