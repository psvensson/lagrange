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

/**
 * Build DataRow message from column values.
 * @param {Array<unknown>} values - Column values (null for SQL NULL).
 * @param {Array<Object>} [columns] - Optional column descriptors for typed text encoding.
 * @return {Buffer}
 */
function buildDataRow(values, columns = []) {
  const encodedValues = values.map((v, idx) => {
    if (v === null || v === undefined) return null;
    return encodeColumnTextValue(v, columns[idx]);
  });
  let size = LOCAL_NUM_TWO;
  for (const encoded of encodedValues) {
    if (encoded === null) {
      size += LOCAL_NUM_FOUR;
    } else {
      size += LOCAL_NUM_FOUR + Buffer.byteLength(encoded, LOCAL_STR_UTF8);
    }
  }
  const payload = Buffer.allocUnsafe(size);
  payload.writeInt16BE(encodedValues.length, 0);
  let off = LOCAL_NUM_TWO;
  for (const encoded of encodedValues) {
    if (encoded === null) {
      payload.writeInt32BE(VARIABLE_SIZE, off);
      off += LOCAL_NUM_FOUR;
    } else {
      const len = Buffer.byteLength(encoded, LOCAL_STR_UTF8);
      payload.writeInt32BE(len, off);
      off += LOCAL_NUM_FOUR;
      payload.write(encoded, off, LOCAL_STR_UTF8);
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
  buildCommandComplete,
  buildParseComplete,
  buildBindComplete,
  buildCloseComplete,
  buildNoData,
  buildEmptyQueryResponse,
};
