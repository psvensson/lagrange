const APPLICATION_DATABASE_ERROR_CODE = Object.freeze({
  APPLICATION_ID_REQUIRED: 'APPLICATION_ID_REQUIRED',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  QUERY_FAILED: 'QUERY_FAILED',
  RUNTIME_ACTIVE: 'RUNTIME_ACTIVE',
  RUNTIME_NOT_STARTED: 'RUNTIME_NOT_STARTED',
  RUNTIME_START_FAILED: 'RUNTIME_START_FAILED',
  RUNTIME_STOPPED: 'RUNTIME_STOPPED',
  RUNTIME_STOP_TIMEOUT: 'RUNTIME_STOP_TIMEOUT',
  SQL_CORE_UNAVAILABLE: 'SQL_CORE_UNAVAILABLE',
  TRANSACTION_CLOSED: 'TRANSACTION_CLOSED',
  TRANSACTION_CONTROL_RESERVED: 'TRANSACTION_CONTROL_RESERVED',
  TRANSACTION_NESTED: 'TRANSACTION_NESTED',
});

const APPLICATION_DATABASE_ERROR_MSG = Object.freeze({
  APPLICATION_ID_REQUIRED: 'applicationId must be a non-empty primitive string',
  CALLBACK_REQUIRED: 'transaction callback must be a function',
  INVALID_CONFIGURATION:
    'configuration must contain only supported own data values',
  INVALID_PARAMS: 'params must be a dense array of supported SQL bind values',
  INVALID_QUERY: 'sql must be a non-empty primitive string',
  QUERY_FAILED: 'Application database query failed',
  RUNTIME_ACTIVE: 'An embedded Lagrange runtime already owns this process',
  RUNTIME_NOT_STARTED: 'Embedded Lagrange runtime has not started',
  RUNTIME_START_FAILED: 'Embedded Lagrange runtime failed to start',
  RUNTIME_STOPPED: 'Embedded Lagrange runtime is stopped',
  RUNTIME_STOP_TIMEOUT: 'Embedded Lagrange runtime stop timed out',
  SQL_CORE_UNAVAILABLE: 'Canonical SqlCore is unavailable',
  TRANSACTION_CLOSED: 'Application database transaction is closed',
  TRANSACTION_CONTROL_RESERVED:
    'Transaction-control SQL is reserved for transaction(callback)',
  TRANSACTION_NESTED: 'Nested application database transactions are not supported',
});

const APPLICATION_DATABASE_LIMIT = Object.freeze({
  APPLICATION_ID_LENGTH: 128,
  PARAMETER_COUNT: 32766,
  SQL_LENGTH: 1024 * 1024,
  STRING_BIND_LENGTH: 16 * 1024 * 1024,
  BYTE_BIND_LENGTH: 64 * 1024 * 1024,
  STOP_TIMEOUT_MS: 30000,
});

const APPLICATION_DATABASE_TRANSACTION_STATE = Object.freeze({
  CLOSED: 'closed',
  COMMITTING: 'committing',
  DRAINING: 'draining',
  OPEN: 'open',
  ROLLING_BACK: 'rolling_back',
});

const APPLICATION_DATABASE_GENERATION_STATE = Object.freeze({
  ACTIVE: 'active',
  CLOSED: 'closed',
  DRAINING: 'draining',
});

export {
  APPLICATION_DATABASE_ERROR_CODE,
  APPLICATION_DATABASE_ERROR_MSG,
  APPLICATION_DATABASE_GENERATION_STATE,
  APPLICATION_DATABASE_LIMIT,
  APPLICATION_DATABASE_TRANSACTION_STATE,
};
