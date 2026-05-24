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
} from './pgwire-protocol-constants.js';
import {writeCString} from './pgwire-buffer-codec.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_TWO = 2;
const LOCAL_NUM_FOUR = 4;
const LOCAL_NUM_18 = 18;
const LOCAL_NUM_25 = 25;
const LOCAL_STR_UTF8 = 'utf8';

/**
 * Build a backend message with type byte and length-prefixed payload.
 *
 * @param {number} type - Message type byte.
 * @param {Buffer} payload - Message payload.
 * @return {Buffer} Complete message buffer.
 */
function buildMessage(type, payload) {
  const len = PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE + payload.length;
  const buf = Buffer.allocUnsafe(LOCAL_NUM_ONE + len);
  buf[LOCAL_NUM_ZERO] = type;
  buf.writeInt32BE(len, LOCAL_NUM_ONE);
  payload.copy(buf, PG_BUFFER_LIMIT.MSG_HEADER_SIZE);
  return buf;
}

/**
 * Build AuthenticationOk message.
 * @return {Buffer}
 */
function buildAuthOk() {
  const payload = Buffer.allocUnsafe(PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE);
  payload.writeInt32BE(PG_AUTH_TYPE.OK, LOCAL_NUM_ZERO);
  return buildMessage(PG_BACKEND_MSG.AUTH, payload);
}

/**
 * Build ParameterStatus message.
 * @param {string} name - Parameter name.
 * @param {string} value - Parameter value.
 * @return {Buffer}
 */
function buildParameterStatus(name, value) {
  const nameLen = Buffer.byteLength(name, LOCAL_STR_UTF8) + LOCAL_NUM_ONE;
  const valLen = Buffer.byteLength(value, LOCAL_STR_UTF8) + LOCAL_NUM_ONE;
  const payload = Buffer.allocUnsafe(nameLen + valLen);
  const off = writeCString(payload, name, LOCAL_NUM_ZERO);
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
  payload.writeInt32BE(pid, LOCAL_NUM_ZERO);
  payload.writeInt32BE(secretKey, LOCAL_NUM_FOUR);
  return buildMessage(PG_BACKEND_MSG.BACKEND_KEY_DATA, payload);
}

/**
 * Build ReadyForQuery message.
 * @param {number} txState - Transaction state byte.
 * @return {Buffer}
 */
function buildReadyForQuery(txState) {
  const payload = Buffer.allocUnsafe(LOCAL_NUM_ONE);
  payload[LOCAL_NUM_ZERO] = txState;
  return buildMessage(PG_BACKEND_MSG.READY_FOR_QUERY, payload);
}

/**
 * Build ErrorResponse message.
 * @param {string} severity - PG_SEVERITY value.
 * @param {string} code - SQLSTATE code.
 * @param {string} message - Error message.
 * @return {Buffer}
 */
function buildErrorResponse(severity, code, message) {
  const fields = [
    {id: PG_ERROR_FIELD.SEVERITY, val: severity},
    {id: PG_ERROR_FIELD.CODE, val: code},
    {id: PG_ERROR_FIELD.MESSAGE, val: message},
  ];
  let size = LOCAL_NUM_ONE;
  for (const f of fields) {
    size += LOCAL_NUM_ONE + Buffer.byteLength(f.val, LOCAL_STR_UTF8) +
      LOCAL_NUM_ONE;
  }
  const payload = Buffer.allocUnsafe(size);
  let off = LOCAL_NUM_ZERO;
  for (const f of fields) {
    payload[off++] = f.id;
    off = writeCString(payload, f.val, off);
  }
  payload[off] = LOCAL_NUM_ZERO;
  return buildMessage(PG_BACKEND_MSG.ERROR_RESPONSE, payload);
}

/**
 * Build RowDescription message from column metadata.
 * @param {Array<{name: string}>} columns - Column descriptors.
 * @return {Buffer}
 */
function buildRowDescription(columns) {
  let size = LOCAL_NUM_TWO;
  for (const col of columns) {
    size += Buffer.byteLength(col.name, LOCAL_STR_UTF8) + LOCAL_NUM_ONE +
      LOCAL_NUM_18;
  }
  const payload = Buffer.allocUnsafe(size);
  payload.writeInt16BE(columns.length, LOCAL_NUM_ZERO);
  let off = LOCAL_NUM_TWO;
  for (const col of columns) {
    off = writeCString(payload, col.name, off);
    payload.writeInt32BE(LOCAL_NUM_ZERO, off); off += LOCAL_NUM_FOUR;
    payload.writeInt16BE(LOCAL_NUM_ZERO, off); off += LOCAL_NUM_TWO;
    payload.writeInt32BE(LOCAL_NUM_25, off); off += LOCAL_NUM_FOUR;
    payload.writeInt16BE(-LOCAL_NUM_ONE, off); off += LOCAL_NUM_TWO;
    payload.writeInt32BE(-LOCAL_NUM_ONE, off); off += LOCAL_NUM_FOUR;
    payload.writeInt16BE(LOCAL_NUM_ZERO, off); off += LOCAL_NUM_TWO;
  }
  return buildMessage(PG_BACKEND_MSG.ROW_DESCRIPTION, payload);
}

/**
 * Build DataRow message from column values.
 * @param {Array<string|null>} values - Column values (null for SQL NULL).
 * @return {Buffer}
 */
function buildDataRow(values) {
  let size = LOCAL_NUM_TWO;
  for (const v of values) {
    if (v === null || v === undefined) {
      size += LOCAL_NUM_FOUR;
    } else {
      const s = String(v);
      size += LOCAL_NUM_FOUR + Buffer.byteLength(s, LOCAL_STR_UTF8);
    }
  }
  const payload = Buffer.allocUnsafe(size);
  payload.writeInt16BE(values.length, LOCAL_NUM_ZERO);
  let off = LOCAL_NUM_TWO;
  for (const v of values) {
    if (v === null || v === undefined) {
      payload.writeInt32BE(-LOCAL_NUM_ONE, off);
      off += LOCAL_NUM_FOUR;
    } else {
      const s = String(v);
      const len = Buffer.byteLength(s, LOCAL_STR_UTF8);
      payload.writeInt32BE(len, off);
      off += LOCAL_NUM_FOUR;
      payload.write(s, off, LOCAL_STR_UTF8);
      off += len;
    }
  }
  return buildMessage(PG_BACKEND_MSG.DATA_ROW, payload);
}

/**
 * Build CommandComplete message.
 * @param {string} tag - Command tag (e.g. 'SELECT 1').
 * @return {Buffer}
 */
function buildCommandComplete(tag) {
  const len = Buffer.byteLength(tag, LOCAL_STR_UTF8) + LOCAL_NUM_ONE;
  const payload = Buffer.allocUnsafe(len);
  writeCString(payload, tag, LOCAL_NUM_ZERO);
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
  buildParameterStatus,
  buildBackendKeyData,
  buildReadyForQuery,
  buildErrorResponse,
  buildRowDescription,
  buildDataRow,
  buildCommandComplete,
  buildParseComplete,
  buildBindComplete,
  buildCloseComplete,
  buildNoData,
  buildEmptyQueryResponse,
};
