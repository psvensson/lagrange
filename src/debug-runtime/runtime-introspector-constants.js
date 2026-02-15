/**
 * Constants for runtime introspection limits and errors.
 */

const RUNTIME_INTROSPECTOR_DEFAULT = Object.freeze({
  MAX_MEMORY_READ_BYTES: 4096,
  MAX_VARIABLES_PER_SCOPE: 256,
  REQUEST_TIMEOUT_MS: 250,
  DEFAULT_FRAME_ID: 0,
});

const RUNTIME_INTROSPECTOR_ERROR_MSG = Object.freeze({
  REQUEST_REQUIRED: 'Runtime introspection request is required',
  INSTANCE_HANDLE_REQUIRED:
    'Runtime introspection requires instanceHandle',
  INDEX_REQUIRED: 'Runtime introspection requires index object',
  RUNTIME_ADAPTER_REQUIRED:
    'Runtime introspection requires runtimeAdapter.inspect function',
  FRAME_ID_REQUIRED:
    'Runtime introspection frameId must be a non-negative integer',
  OFFSET_REQUIRED:
    'Runtime introspection offset must be a non-negative integer',
  LENGTH_REQUIRED:
    'Runtime introspection length must be a non-negative integer',
  MEMORY_READ_LIMIT_EXCEEDED:
    'Runtime introspection memory read exceeds max bytes limit',
  VARIABLES_LIMIT_EXCEEDED:
    'Runtime introspection variables request exceeds max scope limit',
  INSPECT_TIMEOUT:
    'Runtime introspection inspect request timed out',
  MEMORY_UNAVAILABLE:
    'Runtime introspection memory is unavailable on runtime adapter',
});

export {
  RUNTIME_INTROSPECTOR_DEFAULT,
  RUNTIME_INTROSPECTOR_ERROR_MSG,
};
