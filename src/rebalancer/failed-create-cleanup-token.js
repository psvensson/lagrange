const FAILED_CREATE_CLEANUP_TOKEN_PREFIX = 'failed-create:';
const FAILED_CREATE_REMOVE_TOKEN_PREFIX = 'failed-create-remove:';

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

export {
  buildFailedCreateCleanupToken,
  buildFailedCreateRemoveToken,
  isFailedCreateCleanupToken,
  isFailedCreateRemoveToken,
  parseFailedCreateRemoveOperationId,
};
