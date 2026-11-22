/**
 * PgWire frontend message parsers.
 *
 * @module runtime/pgwire-message-parsers
 */

import {PG_ERROR_CODE, PG_FORMAT_CODE} from './pgwire-protocol-constants.js';
import {readCString} from './pgwire-buffer-codec.js';

const LOCAL_NUM_TWO = 2;
const LOCAL_NUM_FOUR = 4;
const LOCAL_STR_UTF8 = 'utf8';
const MALFORMED_BIND_MSG = 'Malformed Bind message payload';

function createProtocolViolationError(message) {
  const error = new Error(message);
  error.sqlState = PG_ERROR_CODE.PROTOCOL_VIOLATION;
  return error;
}

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

function readBindFormatList(payload, startOffset) {
  if (startOffset + LOCAL_NUM_TWO > payload.length) {
    throw createProtocolViolationError(MALFORMED_BIND_MSG);
  }
  const count = payload.readInt16BE(startOffset);
  let off = startOffset + LOCAL_NUM_TWO;
  if (count < 0 || off + count * LOCAL_NUM_TWO > payload.length) {
    throw createProtocolViolationError(MALFORMED_BIND_MSG);
  }
  const formats = [];
  for (let i = 0; i < count; i += 1) {
    formats.push(payload.readInt16BE(off));
    off += LOCAL_NUM_TWO;
  }
  return {formats, nextOffset: off};
}

function resolveBindParamFormat(paramFormats, index) {
  if (paramFormats.length === 0) return PG_FORMAT_CODE.TEXT;
  if (paramFormats.length === 1) return paramFormats[0];
  return paramFormats[index];
}

function readSingleBindParam(payload, startOffset, formatCode) {
  if (startOffset + LOCAL_NUM_FOUR > payload.length) {
    throw createProtocolViolationError(MALFORMED_BIND_MSG);
  }
  const len = payload.readInt32BE(startOffset);
  const dataOffset = startOffset + LOCAL_NUM_FOUR;
  if (len === -1) {
    return {value: null, nextOffset: dataOffset};
  }
  if (len < -1 || dataOffset + len > payload.length) {
    throw createProtocolViolationError(MALFORMED_BIND_MSG);
  }
  const value = formatCode === PG_FORMAT_CODE.BINARY ?
    Buffer.from(payload.subarray(dataOffset, dataOffset + len)) :
    payload.toString(LOCAL_STR_UTF8, dataOffset, dataOffset + len);
  return {value, nextOffset: dataOffset + len};
}

function readBindParamValues(payload, startOffset, paramFormats) {
  if (startOffset + LOCAL_NUM_TWO > payload.length) {
    throw createProtocolViolationError(MALFORMED_BIND_MSG);
  }
  const numParams = payload.readInt16BE(startOffset);
  if (numParams < 0) {
    throw createProtocolViolationError(MALFORMED_BIND_MSG);
  }
  let off = startOffset + LOCAL_NUM_TWO;
  const params = [];
  for (let i = 0; i < numParams; i += 1) {
    const fmt = resolveBindParamFormat(paramFormats, i);
    const param = readSingleBindParam(payload, off, fmt);
    params.push(param.value);
    off = param.nextOffset;
  }
  return {params, nextOffset: off};
}

/**
 * Parse a Bind message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{portal: string, statement: string, paramFormats: number[],
 *   params: Array<string|Buffer|null>, resultFormats: number[]}}
 */
function parseBindMessage(payload) {
  const portal = readCString(payload, 0);
  const statement = readCString(payload, portal.nextOffset);
  const paramFormatList = readBindFormatList(payload, statement.nextOffset);
  const paramValues = readBindParamValues(
    payload,
    paramFormatList.nextOffset,
    paramFormatList.formats,
  );
  const resultFormats = paramValues.nextOffset < payload.length ?
    readBindFormatList(payload, paramValues.nextOffset).formats :
    [];

  return {
    portal: portal.value,
    statement: statement.value,
    paramFormats: paramFormatList.formats,
    params: paramValues.params,
    resultFormats,
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
