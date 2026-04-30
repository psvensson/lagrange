/**
 * CLI compatibility contract for the node-local admin adapter.
 *
 * Documents and validates the message format contract between
 * the admin WebSocket API (adapter layer) and CLI clients.
 * Ensures the adapter preserves backward compatibility with
 * existing tooling while the mutation ownership moves to
 * replicated meta-services (sys-admin-meta / sys-wasm-meta).
 *
 * This module is part of the adapter-only layer. It validates
 * message envelopes only — it never executes queries, writes
 * metadata, or mutates system state.
 *
 * Requirements: 2.4, 13.2
 * @module admin/admin-cli-compat
 */

import {ADMIN_MESSAGE_TYPE} from './admin-constants.js';

const LOCAL_NUM_ZERO = 0;

/**
 * Error messages for CLI compatibility validation.
 * @type {Object}
 */
const CLI_COMPAT_ERROR_MSG = Object.freeze({
  UNKNOWN_MESSAGE_TYPE: 'Unknown message type',
  MISSING_TYPE_FIELD: 'Message must have a type field',
  MISSING_REQUIRED_FIELD: (field) => `Missing required field: ${field}`,
});

/**
 * Frozen contract documenting expected CLI message formats.
 * Each entry specifies the type string, required fields, and
 * optional fields for a given message direction.
 * @type {Object}
 */
const CLI_MESSAGE_CONTRACT = Object.freeze({
  QUERY: Object.freeze({
    type: ADMIN_MESSAGE_TYPE.QUERY,
    requiredFields: Object.freeze(['type', 'queryId', 'sql']),
    optionalFields: Object.freeze(['params']),
  }),
  REFRESH: Object.freeze({
    type: ADMIN_MESSAGE_TYPE.REFRESH,
    requiredFields: Object.freeze(['type']),
    optionalFields: Object.freeze([]),
  }),
  QUERY_RESULT: Object.freeze({
    type: ADMIN_MESSAGE_TYPE.QUERY_RESULT,
    requiredFields: Object.freeze(['type', 'queryId', 'timestamp']),
    optionalFields: Object.freeze([
      'results', 'count', 'error', 'errorCode',
    ]),
  }),
  CACHE_DUMP: Object.freeze({
    type: ADMIN_MESSAGE_TYPE.CACHE_DUMP,
    requiredFields: Object.freeze([
      'type', 'timestamp', 'nodeId', 'data',
    ]),
    optionalFields: Object.freeze([]),
  }),
  CDC_EVENT: Object.freeze({
    type: ADMIN_MESSAGE_TYPE.CDC_EVENT,
    requiredFields: Object.freeze([
      'type', 'timestamp', 'table', 'operation', 'record',
    ]),
    optionalFields: Object.freeze([]),
  }),
  ERROR: Object.freeze({
    type: ADMIN_MESSAGE_TYPE.ERROR,
    requiredFields: Object.freeze([
      'type', 'timestamp', 'error', 'errorCode',
    ]),
    optionalFields: Object.freeze([]),
  }),
});

/**
 * Lookup from message type string to contract entry.
 * @type {Map<string, Object>}
 */
const INCOMING_CONTRACT_BY_TYPE = new Map([
  [ADMIN_MESSAGE_TYPE.QUERY, CLI_MESSAGE_CONTRACT.QUERY],
  [ADMIN_MESSAGE_TYPE.REFRESH, CLI_MESSAGE_CONTRACT.REFRESH],
]);

/**
 * Lookup from message type string to contract entry.
 * @type {Map<string, Object>}
 */
const OUTGOING_CONTRACT_BY_TYPE = new Map([
  [ADMIN_MESSAGE_TYPE.QUERY_RESULT, CLI_MESSAGE_CONTRACT.QUERY_RESULT],
  [ADMIN_MESSAGE_TYPE.CACHE_DUMP, CLI_MESSAGE_CONTRACT.CACHE_DUMP],
  [ADMIN_MESSAGE_TYPE.CDC_EVENT, CLI_MESSAGE_CONTRACT.CDC_EVENT],
  [ADMIN_MESSAGE_TYPE.ERROR, CLI_MESSAGE_CONTRACT.ERROR],
]);

/**
 * Validate required fields against a contract entry.
 *
 * @param {Object} message - The message to validate.
 * @param {Object} contract - The contract entry.
 * @return {{valid: boolean, messageType?: string, errors?: string[]}}
 */
function validateFields(message, contract) {
  const errors = [];
  for (const field of contract.requiredFields) {
    if (message[field] === undefined || message[field] === null) {
      errors.push(CLI_COMPAT_ERROR_MSG.MISSING_REQUIRED_FIELD(field));
    }
  }
  if (errors.length > LOCAL_NUM_ZERO) {
    return {valid: false, errors};
  }
  return {valid: true, messageType: contract.type};
}

/**
 * Validate an incoming CLI message (query or refresh).
 *
 * @param {Object} message - The incoming message.
 * @return {{valid: boolean, messageType?: string, errors?: string[]}}
 */
function validateIncomingMessage(message) {
  if (!message || message.type === undefined || message.type === null) {
    return {
      valid: false,
      errors: [CLI_COMPAT_ERROR_MSG.MISSING_TYPE_FIELD],
    };
  }
  const contract = INCOMING_CONTRACT_BY_TYPE.get(message.type);
  if (!contract) {
    return {
      valid: false,
      errors: [CLI_COMPAT_ERROR_MSG.UNKNOWN_MESSAGE_TYPE],
    };
  }
  return validateFields(message, contract);
}

/**
 * Validate an outgoing message to the CLI.
 *
 * @param {Object} message - The outgoing message.
 * @return {{valid: boolean, messageType?: string, errors?: string[]}}
 */
function validateOutgoingMessage(message) {
  if (!message || message.type === undefined || message.type === null) {
    return {
      valid: false,
      errors: [CLI_COMPAT_ERROR_MSG.MISSING_TYPE_FIELD],
    };
  }
  const contract = OUTGOING_CONTRACT_BY_TYPE.get(message.type);
  if (!contract) {
    return {
      valid: false,
      errors: [CLI_COMPAT_ERROR_MSG.UNKNOWN_MESSAGE_TYPE],
    };
  }
  return validateFields(message, contract);
}

export {
  CLI_COMPAT_ERROR_MSG,
  CLI_MESSAGE_CONTRACT,
  validateIncomingMessage,
  validateOutgoingMessage,
};
