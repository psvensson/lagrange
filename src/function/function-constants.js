const FUNCTION_SUBSYSTEM = Object.freeze({
  CONTEXT_MANAGER: 'context-manager',
});

const FUNCTION_CONTEXT_TYPE = Object.freeze({
  FUNCTION: 'function',
  SERVICE: 'service',
  USER: 'user',
});

const FUNCTION_LOG_MSG = Object.freeze({
  CONTEXT_MANAGER_INITIALIZED: 'Context manager initialized',
  CONTEXT_UPDATED: 'Context updated',
  CONTEXT_CREATED: 'Context created',
  CONTEXT_DELETE_NOT_FOUND: 'Context not found for deletion',
  CONTEXT_DELETED: 'Context deleted',
  CONTEXT_LOOKUP_FAILED: 'Failed to get context',
  CONTEXTS_BY_OWNER_FAILED: 'Failed to get contexts by owner',
  CONTEXTS_BY_TYPE_FAILED: 'Failed to get contexts by type',
});

const FUNCTION_ERROR_MSG = Object.freeze({
  INVALID_CONTEXT_TYPE_PREFIX: 'Invalid context type: ',
  VALID_CONTEXT_TYPE_PREFIX: 'Valid types are: ',
  CDC_INTEGRATION_REQUIRED: 'CDC integration service not available',
});

export {
  FUNCTION_CONTEXT_TYPE,
  FUNCTION_ERROR_MSG,
  FUNCTION_LOG_MSG,
  FUNCTION_SUBSYSTEM,
};
