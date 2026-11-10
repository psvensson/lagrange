import {readLowerStateField} from '../utils/state-field-read.js';
import {ReplicaStatus} from './replica-status.js';

const FAILED_CREATE_CLEANUP_TOKEN_PREFIX = 'failed-create:';
const FAILED_CREATE_REMOVE_TOKEN_PREFIX = 'failed-create-remove:';
const NEVER_OPENED_FAILED_CREATE_SOURCES = Object.freeze(new Set([
  ReplicaStatus.PENDING,
  ReplicaStatus.CREATING,
]));

function buildFailedCreateCleanupToken(operationId) {
  return typeof operationId === 'string' && operationId.length > 0 ?
    `${FAILED_CREATE_CLEANUP_TOKEN_PREFIX}${operationId}` : null;
}

function buildFailedCreateRemoveToken(operationId) {
  return typeof operationId === 'string' && operationId.length > 0 ?
    `${FAILED_CREATE_REMOVE_TOKEN_PREFIX}${operationId}` : null;
}

function isFailedCreateCleanupToken(value) {
  return typeof value === 'string' &&
    value.startsWith(FAILED_CREATE_CLEANUP_TOKEN_PREFIX);
}

function isFailedCreateRemoveToken(value) {
  return typeof value === 'string' &&
    value.startsWith(FAILED_CREATE_REMOVE_TOKEN_PREFIX);
}

function parseFailedCreateRemoveOperationId(value) {
  return isFailedCreateRemoveToken(value) ?
    value.slice(FAILED_CREATE_REMOVE_TOKEN_PREFIX.length) : null;
}

function isUnclaimedPreRuntimeFailedCreateRow(row) {
  if (!row || typeof row !== 'object') {
    return false;
  }
  if (readLowerStateField(row.status) !== ReplicaStatus.FAILED) {
    return false;
  }
  if (row.cleanup_token !== null && row.cleanup_token !== undefined) {
    return false;
  }
  // The raw row's previous_state, else a decoded record's previousState
  // (spelling pair routed to system-table-row-decoders); STATE_ABSENT is no
  // never-opened source.
  const previousState =
    readLowerStateField(row.previous_state, row.previousState);
  return NEVER_OPENED_FAILED_CREATE_SOURCES.has(previousState);
}

export {
  buildFailedCreateCleanupToken,
  buildFailedCreateRemoveToken,
  isFailedCreateCleanupToken,
  isFailedCreateRemoveToken,
  isUnclaimedPreRuntimeFailedCreateRow,
  parseFailedCreateRemoveOperationId,
};
