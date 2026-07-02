/**
 * Scalar helpers and request guards for SQL-backed debug metadata.
 */

import {
  DEBUG_METADATA_DEFAULT as DEF,
  DEBUG_METADATA_ERROR_CODE as CODE,
  DEBUG_METADATA_ERROR_MSG as ERR,
} from './debug-metadata-service-constants.js';

const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_BASE64 = 'base64';

/**
 * @param {string} sessionId
 * @param {number} index
 * @param {number} lineNumber
 * @param {number} columnNumber
 * @return {string}
 */
function buildBreakpointId(sessionId, index, lineNumber, columnNumber) {
  return `${sessionId}:bp:${index}:${lineNumber}:${columnNumber}`;
}

/**
 * @param {number} count
 * @return {string}
 */
function buildPlaceholders(count) {
  const placeholders = [];
  for (let index = 1; index <= count; index++) {
    placeholders.push(`?${index}`);
  }
  return placeholders.join(LOCAL_STR_COMMA_SPACE);
}

/**
 * @param {*} value
 * @return {number|null}
 */
function toNullableInteger(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isInteger(value)) {
    return null;
  }
  return value;
}

/**
 * @param {*} value
 * @return {number}
 */
function toResolvedFlag(value) {
  return value === true || value === DEF.RESOLVED_TRUE ?
    DEF.RESOLVED_TRUE :
    DEF.RESOLVED_FALSE;
}

/**
 * @param {*} value
 * @return {Buffer}
 */
function normalizeEnvelopeBuffer(value) {
  if (!value) {
    throw createDebugMetadataError(CODE.INVALID_REQUEST, ERR.SNAPSHOT_REQUIRED);
  }
  if (typeof value === 'string') {
    return Buffer.from(value, LOCAL_STR_BASE64);
  }
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return Buffer.from(value);
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (value && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  throw createDebugMetadataError(CODE.INVALID_REQUEST, ERR.SNAPSHOT_REQUIRED);
}

/**
 * @param {*} value
 */
function assertRequestObject(value) {
  if (!value || typeof value !== 'object') {
    throw createDebugMetadataError(CODE.INVALID_REQUEST, ERR.REQUEST_REQUIRED);
  }
}

/**
 * @param {*} value
 * @param {string} message
 * @param {string} code
 */
function assertNonEmptyString(value, message, code) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createDebugMetadataError(code, message);
  }
}

/**
 * @param {*} value
 * @param {number} fallback
 * @return {number}
 */
function normalizeLimit(value, fallback) {
  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return Math.min(value, DEF.MAX_LIMIT);
}

/**
 * @param {string} code
 * @param {string} message
 * @return {Error}
 */
function createDebugMetadataError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export {
  assertNonEmptyString,
  assertRequestObject,
  buildBreakpointId,
  buildPlaceholders,
  createDebugMetadataError,
  normalizeEnvelopeBuffer,
  normalizeLimit,
  toNullableInteger,
  toResolvedFlag,
};
