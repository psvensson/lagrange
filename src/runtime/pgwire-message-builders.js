/**
 * PgWire backend message builders.
 *
 * @module runtime/pgwire-message-builders
 */

import {
  PG_BACKEND_MSG,
  PG_AUTH_TYPE,
  PG_ERROR_FIELD,
  PG_BUFFER_LIMIT,
  PG_FORMAT_CODE,
} from './pgwire-protocol-constants.js';
import {writeCString} from './pgwire-buffer-codec.js';

const LOCAL_NUM_TWO = 2;
const LOCAL_NUM_FOUR = 4;
const LOCAL_NUM_EIGHTEEN = 18;
const LOCAL_NUM_TWENTY_FIVE = 25;
const UNMODIFIED_TYPE = -1;
const VARIABLE_SIZE = -1;
const OID_BOOL = 16;
const OID_BYTEA = 17;
const OID_JSON = 114;
const OID_JSONB = 3802;
const PG_BOOL_TRUE = 't';
const PG_BOOL_FALSE = 'f';
const PG_BOOL_TRUE_LITERALS = new Set(['true', 't', 'TRUE', '1']);
const BYTEA_HEX_PREFIX = '\\x';
const BYTEA_HEX_RADIX = 'hex';
const BYTEA_HEX_PREFIX_BUF = Buffer.from(BYTEA_HEX_PREFIX, 'utf8');
const EMPTY_CHUNK_BUF = Buffer.alloc(0);
const DEFAULT_DATA_ROW_CHUNK_BYTES = 64 * 1024;
const DATA_ROW_HEADER_BYTES = PG_BUFFER_LIMIT.MSG_HEADER_SIZE + LOCAL_NUM_TWO;
const DATA_ROW_COL_KIND_NULL = 0;
const DATA_ROW_COL_KIND_TEXT = 1;
const DATA_ROW_COL_KIND_BYTEA = 2;
const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;
const LOW_SURROGATE_MIN = 0xdc00;
const LOW_SURROGATE_MAX = 0xdfff;
const LOCAL_STR_UTF8 = 'utf8';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';

/**
 * Build a backend message with type byte and length-prefixed payload.
 *
 * @param {number} type - Message type byte.
 * @param {Buffer} payload - Message payload.
 * @return {Buffer} Complete message buffer.
 */
function buildMessage(type, payload) {
  const len = PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE + payload.length;
  const buf = Buffer.allocUnsafe(1 + len);
  buf[0] = type;
  buf.writeInt32BE(len, 1);
  payload.copy(buf, PG_BUFFER_LIMIT.MSG_HEADER_SIZE);
  return buf;
}

/**
 * Build AuthenticationOk message.
 * @return {Buffer}
 */
function buildAuthOk() {
  const payload = Buffer.allocUnsafe(PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE);
  payload.writeInt32BE(PG_AUTH_TYPE.OK, 0);
  return buildMessage(PG_BACKEND_MSG.AUTH, payload);
}

/**
 * Build AuthenticationCleartextPassword message.
 *
 * The credential verifier remains server-owned. Externally bound password
 * deployments must select the listener-owned `tlsMode: "require"` policy.
 *
 * @return {Buffer}
 */
function buildAuthCleartextPassword() {
  const payload = Buffer.allocUnsafe(PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE);
  payload.writeInt32BE(PG_AUTH_TYPE.CLEARTEXT_PASSWORD, 0);
  return buildMessage(PG_BACKEND_MSG.AUTH, payload);
}

/**
 * Build ParameterStatus message.
 * @param {string} name - Parameter name.
 * @param {string} value - Parameter value.
 * @return {Buffer}
 */
function buildParameterStatus(name, value) {
  const nameLen = Buffer.byteLength(name, LOCAL_STR_UTF8) + 1;
  const valLen = Buffer.byteLength(value, LOCAL_STR_UTF8) + 1;
  const payload = Buffer.allocUnsafe(nameLen + valLen);
  const off = writeCString(payload, name, 0);
  writeCString(payload, value, off);
  return buildMessage(PG_BACKEND_MSG.PARAMETER_STATUS, payload);
}

/**
 * Build BackendKeyData message.
 * @param {number} pid - Process ID.
 * @param {number} secretKey - Secret key.
 * @return {Buffer}
 */
function buildBackendKeyData(pid, secretKey) {
  const payload = Buffer.allocUnsafe(8);
  payload.writeInt32BE(pid, 0);
  payload.writeInt32BE(secretKey, LOCAL_NUM_FOUR);
  return buildMessage(PG_BACKEND_MSG.BACKEND_KEY_DATA, payload);
}

/**
 * Build ReadyForQuery message.
 * @param {number} txState - Transaction state byte.
 * @return {Buffer}
 */
function buildReadyForQuery(txState) {
  const payload = Buffer.allocUnsafe(1);
  payload[0] = txState;
  return buildMessage(PG_BACKEND_MSG.READY_FOR_QUERY, payload);
}

/**
 * Build ErrorResponse message.
 * @param {string} severity - PG_SEVERITY value.
 * @param {string} code - SQLSTATE code.
 * @param {string} message - Error message.
 * @param {string|Object|null} [detail] - Optional structured error detail.
 * @return {Buffer}
 */
function buildErrorResponse(severity, code, message, detail = null) {
  return buildFieldMessage(
    PG_BACKEND_MSG.ERROR_RESPONSE, severity, code, message, detail,
  );
}

/**
 * Build a NoticeResponse message (a WARNING or NOTICE the session continues
 * after; same fields as an ErrorResponse).
 * @param {string} severity - PG_SEVERITY value (WARNING, NOTICE).
 * @param {string} code - SQLSTATE.
 * @param {string} message - Notice message.
 * @return {Buffer}
 */
function buildNoticeResponse(severity, code, message) {
  return buildFieldMessage(
    PG_BACKEND_MSG.NOTICE_RESPONSE, severity, code, message, null,
  );
}

function buildFieldMessage(type, severity, code, message, detail) {
  const fields = [
    {id: PG_ERROR_FIELD.SEVERITY, val: severity},
    {id: PG_ERROR_FIELD.CODE, val: code},
    {id: PG_ERROR_FIELD.MESSAGE, val: message},
  ];
  if (detail !== null && detail !== undefined) {
    fields.push({
      id: PG_ERROR_FIELD.DETAIL,
      val: typeof detail === 'string' ? detail : JSON.stringify(detail),
    });
  }
  let size = 1;
  for (const f of fields) {
    size += 1 + Buffer.byteLength(f.val, LOCAL_STR_UTF8) +
      1;
  }
  const payload = Buffer.allocUnsafe(size);
  let off = 0;
  for (const f of fields) {
    payload[off++] = f.id;
    off = writeCString(payload, f.val, off);
  }
  payload[off] = 0;
  return buildMessage(type, payload);
}

/**
 * Build ParameterDescription message from parameter type OIDs.
 * @param {number[]} paramOids - PostgreSQL type OIDs for each parameter.
 * @return {Buffer}
 */
function buildParameterDescription(paramOids) {
  const payload = Buffer.allocUnsafe(
    LOCAL_NUM_TWO + paramOids.length * LOCAL_NUM_FOUR,
  );
  payload.writeInt16BE(paramOids.length, 0);
  let off = LOCAL_NUM_TWO;
  for (const oid of paramOids) {
    payload.writeInt32BE(oid, off);
    off += LOCAL_NUM_FOUR;
  }
  return buildMessage(PG_BACKEND_MSG.PARAMETER_DESCRIPTION, payload);
}

/**
 * Build RowDescription message from column metadata.
 * @param {Array<{name: string, oid?: number, typeSize?: number, typeModifier?: number,
 *   formatCode?: number, tableOid?: number, columnAttr?: number}>} columns - Column descriptors.
 * @return {Buffer}
 */
function buildRowDescription(columns) {
  let size = LOCAL_NUM_TWO;
  for (const col of columns) {
    size += Buffer.byteLength(col.name, LOCAL_STR_UTF8) + 1 +
      LOCAL_NUM_EIGHTEEN;
  }
  const payload = Buffer.allocUnsafe(size);
  payload.writeInt16BE(columns.length, 0);
  let off = LOCAL_NUM_TWO;
  for (const col of columns) {
    off = writeCString(payload, col.name, off);
    payload.writeInt32BE(col.tableOid ?? 0, off); off += LOCAL_NUM_FOUR;
    payload.writeInt16BE(col.columnAttr ?? 0, off); off += LOCAL_NUM_TWO;
    payload.writeInt32BE(col.oid ?? LOCAL_NUM_TWENTY_FIVE, off); off += LOCAL_NUM_FOUR;
    payload.writeInt16BE(col.typeSize ?? VARIABLE_SIZE, off); off += LOCAL_NUM_TWO;
    payload.writeInt32BE(col.typeModifier ?? UNMODIFIED_TYPE, off); off += LOCAL_NUM_FOUR;
    const fmt = Number.isInteger(col.formatCode) ? col.formatCode : PG_FORMAT_CODE.TEXT;
    payload.writeInt16BE(fmt, off); off += LOCAL_NUM_TWO;
  }
  return buildMessage(PG_BACKEND_MSG.ROW_DESCRIPTION, payload);
}

function encodeColumnTextValue(value, col) {
  const oid = col?.oid;
  if (oid === OID_BOOL) {
    const truthy = typeof value === 'boolean' ?
      value :
      typeof value === 'number' ?
        value !== 0 :
        PG_BOOL_TRUE_LITERALS.has(String(value));
    return truthy ? PG_BOOL_TRUE : PG_BOOL_FALSE;
  }
  if (oid === OID_BYTEA && Buffer.isBuffer(value)) {
    return BYTEA_HEX_PREFIX + value.toString(BYTEA_HEX_RADIX);
  }
  if ((oid === OID_JSON || oid === OID_JSONB) &&
      typeof value === LOCAL_STR_OBJECT && typeof value !== LOCAL_STR_STRING) {
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizeRowValues(rowOrValues, columns) {
  if (Array.isArray(rowOrValues)) {
    return rowOrValues;
  }
  if (!rowOrValues || typeof rowOrValues !== LOCAL_STR_OBJECT) {
    return [];
  }
  if (Array.isArray(columns) && columns.length > 0) {
    return columns.map((col) => {
      const key = typeof col === LOCAL_STR_STRING ? col : col?.name;
      return rowOrValues[key];
    });
  }
  return Object.values(rowOrValues);
}

function describeDataRowColumn(value, col) {
  let columnType = DATA_ROW_COL_KIND_TEXT;
  let byteLength = 0;
  let text = '';
  let buffer = EMPTY_CHUNK_BUF;
  if (value === null || value === undefined) {
    columnType = DATA_ROW_COL_KIND_NULL;
  } else if (col?.oid === OID_BYTEA && Buffer.isBuffer(value)) {
    columnType = DATA_ROW_COL_KIND_BYTEA;
    byteLength = BYTEA_HEX_PREFIX_BUF.length + value.length * LOCAL_NUM_TWO;
    buffer = value;
  } else {
    text =
      typeof value === LOCAL_STR_STRING && col?.oid !== OID_BOOL ?
        value :
        encodeColumnTextValue(value, col);
    byteLength = Buffer.byteLength(text, LOCAL_STR_UTF8);
  }
  return {columnType, byteLength, text, buffer};
}

/**
 * Measure and describe each column of a DataRow without allocating a payload
 * buffer or eagerly materializing oversized BYTEA hex strings.
 * @param {Array<unknown>|Object} rowOrValues - Column values or row object.
 * @param {Array<Object|string>} [columns] - Optional column descriptors.
 * @return {{descriptors: Array<Object>, payloadLength: number, frameByteLength: number}}
 */
function prepareDataRowColumns(rowOrValues, columns = []) {
  const values = normalizeRowValues(rowOrValues, columns);
  const descriptors = new Array(values.length);
  let payloadLength = LOCAL_NUM_TWO;
  for (let idx = 0; idx < values.length; idx += 1) {
    const desc = describeDataRowColumn(values[idx], columns[idx]);
    descriptors[idx] = desc;
    payloadLength +=
      desc.columnType === DATA_ROW_COL_KIND_NULL ?
        LOCAL_NUM_FOUR :
        LOCAL_NUM_FOUR + desc.byteLength;
  }
  return {
    descriptors,
    payloadLength,
    frameByteLength: PG_BUFFER_LIMIT.MSG_HEADER_SIZE + payloadLength,
  };
}

function getPreparedDataRowFrameLength(prepared) {
  return prepared.frameByteLength;
}

function writePreparedColumnToFrame(frame, offset, desc) {
  if (desc.columnType === DATA_ROW_COL_KIND_NULL) {
    frame.writeInt32BE(VARIABLE_SIZE, offset);
    return offset + LOCAL_NUM_FOUR;
  }
  frame.writeInt32BE(desc.byteLength, offset);
  let nextOffset = offset + LOCAL_NUM_FOUR;
  if (desc.columnType === DATA_ROW_COL_KIND_BYTEA) {
    BYTEA_HEX_PREFIX_BUF.copy(frame, nextOffset);
    nextOffset += BYTEA_HEX_PREFIX_BUF.length;
    if (desc.buffer.length > 0) {
      const hexLen = desc.byteLength - BYTEA_HEX_PREFIX_BUF.length;
      frame.write(
        desc.buffer.toString(BYTEA_HEX_RADIX),
        nextOffset,
        hexLen,
        LOCAL_STR_UTF8,
      );
      nextOffset += hexLen;
    }
    return nextOffset;
  }
  if (desc.byteLength > 0) {
    frame.write(desc.text, nextOffset, desc.byteLength, LOCAL_STR_UTF8);
    nextOffset += desc.byteLength;
  }
  return nextOffset;
}

/**
 * Encode a prepared DataRow directly into a single pre-sized frame buffer
 * ('D' + UInt32BE length + Int16BE colCount + column values), eliminating
 * any intermediate payload buffer allocation or full-row copy.
 * @param {{descriptors: Array<Object>, payloadLength: number, frameByteLength: number}} prepared
 * @return {Buffer}
 */
function buildPreparedDataRowFrame(prepared) {
  const {descriptors, payloadLength, frameByteLength} = prepared;
  const frame = Buffer.allocUnsafe(frameByteLength);
  frame[0] = PG_BACKEND_MSG.DATA_ROW;
  frame.writeInt32BE(PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE + payloadLength, 1);
  frame.writeInt16BE(descriptors.length, PG_BUFFER_LIMIT.MSG_HEADER_SIZE);
  let off = DATA_ROW_HEADER_BYTES;
  for (let idx = 0; idx < descriptors.length; idx += 1) {
    off = writePreparedColumnToFrame(frame, off, descriptors[idx]);
  }
  return frame;
}

/**
 * Build DataRow message from column values in a single frame allocation.
 * @param {Array<unknown>} values - Column values (null for SQL NULL).
 * @param {Array<Object>} [columns] - Optional column descriptors for typed text encoding.
 * @return {Buffer}
 */
function buildDataRow(values, columns = []) {
  return buildPreparedDataRowFrame(prepareDataRowColumns(values, columns));
}

function isHighSurrogateCode(code) {
  return code >= HIGH_SURROGATE_MIN && code <= HIGH_SURROGATE_MAX;
}

function isLowSurrogateCode(code) {
  return code >= LOW_SURROGATE_MIN && code <= LOW_SURROGATE_MAX;
}

function isSurrogatePairAt(text, index) {
  return (
    index >= 0 &&
    index + 1 < text.length &&
    isHighSurrogateCode(text.charCodeAt(index)) &&
    isLowSurrogateCode(text.charCodeAt(index + 1))
  );
}

function clampSurrogateBoundary(text, candidateEnd) {
  if (candidateEnd > 0 && isSurrogatePairAt(text, candidateEnd - 1)) {
    return candidateEnd - 1;
  }
  return candidateEnd;
}

function takeUtf8SliceWithinBytes(text, charOffset, maxBytes) {
  if (maxBytes <= 0 || charOffset >= text.length) {
    return {slice: '', byteLen: 0, nextCharOffset: charOffset};
  }
  const firstUnits = isSurrogatePairAt(text, charOffset) ? LOCAL_NUM_TWO : 1;
  const firstSlice = text.slice(charOffset, charOffset + firstUnits);
  const firstByteLen = Buffer.byteLength(firstSlice, LOCAL_STR_UTF8);
  if (firstByteLen > maxBytes) {
    return {
      slice: '',
      byteLen: 0,
      nextCharOffset: charOffset,
      firstSlice,
      firstByteLen,
      firstUnits,
    };
  }
  let end = clampSurrogateBoundary(
    text,
    Math.min(text.length, charOffset + maxBytes),
  );
  if (end <= charOffset) {
    end = charOffset + firstUnits;
  }
  let slice = text.slice(charOffset, end);
  let byteLen = Buffer.byteLength(slice, LOCAL_STR_UTF8);
  while (byteLen > maxBytes) {
    const charCount = end - charOffset;
    const scaled = Math.max(
      firstUnits,
      Math.floor(charCount * (maxBytes / byteLen)),
    );
    let nextEnd = clampSurrogateBoundary(
      text,
      charOffset + Math.min(charCount - 1, scaled),
    );
    if (nextEnd <= charOffset || nextEnd >= end) {
      nextEnd = charOffset + firstUnits;
    }
    end = nextEnd;
    slice = text.slice(charOffset, end);
    byteLen = Buffer.byteLength(slice, LOCAL_STR_UTF8);
  }
  return {slice, byteLen, nextCharOffset: end};
}

function ensureChunkBuffer(state, minCapacity = 1) {
  if (!state.hasChunk) {
    const size = Math.max(
      minCapacity,
      Math.min(state.chunkMaxBytes, state.remainingFrameBytes),
    );
    state.buffer = Buffer.allocUnsafe(size);
    state.chunkOffset = 0;
    state.hasChunk = true;
  }
}

function takeBufferedChunk(state, endOffset) {
  const emitted =
    endOffset === state.buffer.length ?
      state.buffer :
      state.buffer.subarray(0, endOffset);
  state.buffer = EMPTY_CHUNK_BUF;
  state.chunkOffset = 0;
  state.hasChunk = false;
  return emitted;
}

function recordChunkProgress(state, writtenBytes) {
  state.chunkOffset += writtenBytes;
  state.remainingFrameBytes -= writtenBytes;
}

function* emitRawHeaderBytes(state, headerBuf) {
  let pos = 0;
  while (pos < headerBuf.length) {
    ensureChunkBuffer(state);
    const avail = state.buffer.length - state.chunkOffset;
    const toCopy = Math.min(avail, headerBuf.length - pos);
    headerBuf.copy(state.buffer, state.chunkOffset, pos, pos + toCopy);
    recordChunkProgress(state, toCopy);
    pos += toCopy;
    if (state.hasChunk && state.chunkOffset === state.buffer.length) {
      yield takeBufferedChunk(state, state.buffer.length);
    }
  }
}

function* emitByteaColumnBytes(state, buffer) {
  yield* emitRawHeaderBytes(state, BYTEA_HEX_PREFIX_BUF);
  let bufOffset = 0;
  while (bufOffset < buffer.length) {
    ensureChunkBuffer(state, LOCAL_NUM_TWO);
    const avail = state.buffer.length - state.chunkOffset;
    if (avail < LOCAL_NUM_TWO && state.chunkOffset > 0) {
      yield takeBufferedChunk(state, state.chunkOffset);
      continue;
    }
    const bytesToEncode = Math.min(
      buffer.length - bufOffset,
      Math.max(1, Math.floor(avail / LOCAL_NUM_TWO)),
    );
    const hexByteLen = bytesToEncode * LOCAL_NUM_TWO;
    const hexSlice = buffer.toString(
      BYTEA_HEX_RADIX,
      bufOffset,
      bufOffset + bytesToEncode,
    );
    state.buffer.write(hexSlice, state.chunkOffset, hexByteLen, LOCAL_STR_UTF8);
    recordChunkProgress(state, hexByteLen);
    bufOffset += bytesToEncode;
    if (state.hasChunk && state.chunkOffset === state.buffer.length) {
      yield takeBufferedChunk(state, state.buffer.length);
    }
  }
}

function computeNextTextSlice(state, text, charOffset, remainingColBytes) {
  const avail = state.buffer.length - state.chunkOffset;
  if (charOffset === 0 && remainingColBytes <= avail) {
    return {
      needsFlush: false,
      slice: text,
      byteLen: remainingColBytes,
      nextCharOffset: text.length,
    };
  }
  const taken = takeUtf8SliceWithinBytes(
    text,
    charOffset,
    Math.min(avail, remainingColBytes),
  );
  if (taken.byteLen > 0) {
    return {
      needsFlush: false,
      slice: taken.slice,
      byteLen: taken.byteLen,
      nextCharOffset: taken.nextCharOffset,
    };
  }
  if (state.chunkOffset > 0) {
    return {
      needsFlush: true,
      slice: '',
      byteLen: 0,
      nextCharOffset: charOffset,
    };
  }
  state.buffer = Buffer.allocUnsafe(taken.firstByteLen);
  state.chunkOffset = 0;
  state.hasChunk = true;
  return {
    needsFlush: false,
    slice: taken.firstSlice,
    byteLen: taken.firstByteLen,
    nextCharOffset: charOffset + taken.firstUnits,
  };
}

function* emitTextColumnBytes(state, text, totalByteLength) {
  let charOffset = 0;
  let remainingColBytes = totalByteLength;
  while (remainingColBytes > 0) {
    ensureChunkBuffer(state);
    const step = computeNextTextSlice(
      state,
      text,
      charOffset,
      remainingColBytes,
    );
    if (step.needsFlush) {
      yield takeBufferedChunk(state, state.chunkOffset);
      continue;
    }
    state.buffer.write(
      step.slice,
      state.chunkOffset,
      step.byteLen,
      LOCAL_STR_UTF8,
    );
    recordChunkProgress(state, step.byteLen);
    remainingColBytes -= step.byteLen;
    charOffset = step.nextCharOffset;
    if (state.hasChunk && state.chunkOffset === state.buffer.length) {
      yield takeBufferedChunk(state, state.buffer.length);
    }
  }
}

function* emitPreparedColumnChunks(state, colLenHeader, desc) {
  if (desc.columnType === DATA_ROW_COL_KIND_NULL) {
    colLenHeader.writeInt32BE(VARIABLE_SIZE, 0);
    yield* emitRawHeaderBytes(state, colLenHeader);
    return;
  }
  colLenHeader.writeInt32BE(desc.byteLength, 0);
  yield* emitRawHeaderBytes(state, colLenHeader);
  if (desc.columnType === DATA_ROW_COL_KIND_BYTEA) {
    yield* emitByteaColumnBytes(state, desc.buffer);
    return;
  }
  if (desc.byteLength > 0) {
    yield* emitTextColumnBytes(state, desc.text, desc.byteLength);
  }
}

/**
 * Stream a prepared DataRow as bounded <= chunkMaxBytes buffers without
 * allocating a multi-megabyte contiguous frame buffer.
 * @param {{descriptors: Array<Object>, payloadLength: number, frameByteLength: number}} prepared
 * @param {number} [chunkMaxBytes]
 * @yields {Buffer}
 */
function* encodePreparedDataRowChunks(
  prepared,
  chunkMaxBytes = DEFAULT_DATA_ROW_CHUNK_BYTES,
) {
  const maxChunk =
    Number.isSafeInteger(chunkMaxBytes) && chunkMaxBytes > 0 ?
      chunkMaxBytes :
      DEFAULT_DATA_ROW_CHUNK_BYTES;
  if (prepared.frameByteLength <= maxChunk) {
    yield buildPreparedDataRowFrame(prepared);
    return;
  }
  const state = {
    buffer: EMPTY_CHUNK_BUF,
    chunkOffset: 0,
    hasChunk: false,
    chunkMaxBytes: maxChunk,
    remainingFrameBytes: prepared.frameByteLength,
  };
  const rowHeader = Buffer.allocUnsafe(DATA_ROW_HEADER_BYTES);
  rowHeader[0] = PG_BACKEND_MSG.DATA_ROW;
  rowHeader.writeInt32BE(
    PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE + prepared.payloadLength,
    1,
  );
  rowHeader.writeInt16BE(
    prepared.descriptors.length,
    PG_BUFFER_LIMIT.MSG_HEADER_SIZE,
  );
  yield* emitRawHeaderBytes(state, rowHeader);
  const colLenHeader = Buffer.allocUnsafe(LOCAL_NUM_FOUR);
  for (let idx = 0; idx < prepared.descriptors.length; idx += 1) {
    yield* emitPreparedColumnChunks(
      state,
      colLenHeader,
      prepared.descriptors[idx],
    );
  }
  if (state.hasChunk && state.chunkOffset > 0) {
    yield takeBufferedChunk(state, state.chunkOffset);
  }
}

/**
 * Stream a DataRow as bounded <= chunkMaxBytes frame segments so synchronous
 * UTF-8 / BYTEA encoding work per step is bounded to at most chunkMaxBytes.
 * @param {Array<unknown>|Object} rowOrValues - Column values or row object.
 * @param {Array<Object|string>} [columns] - Optional column descriptors.
 * @param {number} [chunkMaxBytes] - Max bytes per emitted chunk buffer.
 * @yields {Buffer}
 */
function* encodeDataRowChunks(
  rowOrValues,
  columns = [],
  chunkMaxBytes = DEFAULT_DATA_ROW_CHUNK_BYTES,
) {
  const prepared = prepareDataRowColumns(rowOrValues, columns);
  yield* encodePreparedDataRowChunks(prepared, chunkMaxBytes);
}

/**
 * Build CommandComplete message.
 * @param {string} tag - Command tag (e.g. 'SELECT 1').
 * @return {Buffer}
 */
function buildCommandComplete(tag) {
  const len = Buffer.byteLength(tag, LOCAL_STR_UTF8) + 1;
  const payload = Buffer.allocUnsafe(len);
  writeCString(payload, tag, 0);
  return buildMessage(PG_BACKEND_MSG.COMMAND_COMPLETE, payload);
}

/**
 * Build ParseComplete message.
 * @return {Buffer}
 */
function buildParseComplete() {
  return buildMessage(PG_BACKEND_MSG.PARSE_COMPLETE, Buffer.alloc(0));
}

/**
 * Build BindComplete message.
 * @return {Buffer}
 */
function buildBindComplete() {
  return buildMessage(PG_BACKEND_MSG.BIND_COMPLETE, Buffer.alloc(0));
}

/**
 * Build CloseComplete message.
 * @return {Buffer}
 */
function buildCloseComplete() {
  return buildMessage(PG_BACKEND_MSG.CLOSE_COMPLETE, Buffer.alloc(0));
}

/**
 * Build NoData message.
 * @return {Buffer}
 */
function buildNoData() {
  return buildMessage(PG_BACKEND_MSG.NO_DATA, Buffer.alloc(0));
}

/**
 * Build EmptyQueryResponse message.
 * @return {Buffer}
 */
function buildEmptyQueryResponse() {
  return buildMessage(PG_BACKEND_MSG.EMPTY_QUERY, Buffer.alloc(0));
}

export {
  buildAuthOk,
  buildAuthCleartextPassword,
  buildParameterStatus,
  buildBackendKeyData,
  buildReadyForQuery,
  buildErrorResponse,
  buildNoticeResponse,
  buildParameterDescription,
  buildRowDescription,
  buildDataRow,
  buildPreparedDataRowFrame,
  encodeDataRowChunks,
  encodePreparedDataRowChunks,
  getPreparedDataRowFrameLength,
  prepareDataRowColumns,
  buildCommandComplete,
  buildParseComplete,
  buildBindComplete,
  buildCloseComplete,
  buildNoData,
  buildEmptyQueryResponse,
};
