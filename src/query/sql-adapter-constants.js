/**
 * Constants for the unified SQL adapter layer.
 *
 * All SQL entrypoints (internal, external protocol)
 * produce a canonical SqlRequest that is consumed by SqlCore
 * (the existing SQLQueryEngine).
 */

/**
 * Execution mode for SqlRequest objects.
 * @enum {string}
 */
const EXECUTION_MODE = Object.freeze({
  SQL_STATEMENT: 'sql_statement',
  STAGE: 'stage',
  PLAN: 'plan',
});

/**
 * Adapter type identifiers.
 * @enum {string}
 */
const ADAPTER_TYPE = Object.freeze({
  INTERNAL: 'internal',
  POSTGRES_WIRE: 'postgres_wire',
});

/**
 * Subsystem names for adapter logging.
 * @enum {string}
 */
const ADAPTER_SUBSYSTEM = Object.freeze({
  INTERNAL: 'internal-sql-adapter',
  POSTGRES_WIRE: 'postgres-wire-adapter',
});

/**
 * Default tenant identifier for internal SQL calls.
 * @type {string}
 */
const DEFAULT_TENANT_ID = 'system';

/**
 * Default session identifier for internal SQL calls.
 * @type {string}
 */
const DEFAULT_SESSION_ID = 'default';

/**
 * Error messages for the adapter layer.
 * @enum {string}
 */
const ADAPTER_ERROR_MSG = Object.freeze({
  STATE_PROJECTION_GATEWAY_REQUIRED:
    'runtime replica state projection requires the control-plane ' +
    'system-table gateway',
  SQL_CORE_REQUIRED: 'SqlCore (SQLQueryEngine) instance is required',
  AUTH_HANDLER_REQUIRED:
    'PostgresWireAdapter requires an authentication owner',
  STATEMENT_REQUIRED: 'SQL statement string is required',
  STATEMENT_MUST_BE_STRING: 'SQL statement must be a string',
  PARAMETERS_MUST_BE_ARRAY: 'SQL parameters must be an array',
  EXPECTED_TRANSACTION_ID_INVALID:
    'expectedTransactionId must be a non-empty string or null',
  SECURITY_CONTEXT_INVALID:
    'SqlRequest security context must contain tenantId, principal, and roles',
  LIFECYCLE_AUTH_ACTION_REQUIRED:
    'Lifecycle SQL classification requires an authorization action',
  TENANT_ID_REQUIRED: 'Tenant ID is required for protocol sessions',
  SESSION_ID_REQUIRED: 'Session ID is required for protocol sessions',
  UNSUPPORTED_PROTOCOL_FEATURE:
    'Unsupported protocol feature requested',
  FALLBACK_EXECUTION_REJECTED:
    'Alternate SQL execution path rejected; all queries must use SqlCore',
  SECOND_ENGINE_REJECTED:
    'Configuration rejected: second SQL execution path is not allowed',
  INVALID_SQL_REQUEST:
    'executeRequest requires a valid SqlRequest object',
  UNSUPPORTED_EXECUTION_MODE:
    'Unsupported execution mode: ',
  STAGE_HANDLER_REQUIRED:
    'stage execution mode requires a handler function',
  PLAN_OBJECT_REQUIRED:
    'plan execution mode requires a plan object',
  RUNTIME_DRIVER_REGISTRY_REQUIRED:
    'runtimeDriverRegistry must be provided by startup ownership',
});

/**
 * Log messages for the adapter layer.
 * @enum {string}
 */
const ADAPTER_LOG_MSG = Object.freeze({
  REQUEST_CREATED: 'SqlRequest created',
  EXECUTING_VIA_SQLCORE: 'Executing SqlRequest via SqlCore',
  EXECUTION_COMPLETE: 'SqlRequest execution complete',
  EXECUTION_FAILED: 'SqlRequest execution failed',
  FALLBACK_REJECTED: 'Fallback execution path rejected',
  PROTOCOL_SESSION_MAPPED: 'Protocol session mapped to tenant/policy',
  UNSUPPORTED_FEATURE: 'Unsupported protocol feature negotiation',
  CLOSED_SESSION_ROLLBACK_FAILED:
    'Rollback of a closed protocol session\'s open transaction failed ' +
    '(the transaction budget sweep remains the backstop)',
  EXECUTE_REQUEST_START: 'SqlCore.executeRequest dispatching',
  EXECUTE_REQUEST_COMPLETE: 'SqlCore.executeRequest complete',
  EXECUTE_REQUEST_FAILED: 'SqlCore.executeRequest failed',
  LOGGING_INIT_FAILED: 'initLogger failed',
});

export {
  EXECUTION_MODE,
  ADAPTER_TYPE,
  ADAPTER_SUBSYSTEM,
  DEFAULT_TENANT_ID,
  DEFAULT_SESSION_ID,
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
};
