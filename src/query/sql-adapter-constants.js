/**
 * Constants for the unified SQL adapter layer.
 *
 * All SQL entrypoints (internal, external protocol, WASM callback)
 * produce a canonical SqlRequest that is consumed by SqlCore
 * (the existing SQLQueryEngine).
 */

import {RUNTIME_KIND} from '../constants/runtime.js';

/**
 * Execution mode for SqlRequest objects.
 * @enum {string}
 */
const EXECUTION_MODE = Object.freeze({
  SQL_STATEMENT: 'sql_statement',
  PARTITION_CALLBACK: 'partition_callback',
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
  WASM_CALL: 'wasm_call',
});

/**
 * Subsystem names for adapter logging.
 * @enum {string}
 */
const ADAPTER_SUBSYSTEM = Object.freeze({
  INTERNAL: 'internal-sql-adapter',
  POSTGRES_WIRE: 'postgres-wire-adapter',
  WASM_CALL: 'wasm-call-adapter',
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
  SQL_CORE_REQUIRED: 'SqlCore (SQLQueryEngine) instance is required',
  STATEMENT_REQUIRED: 'SQL statement string is required',
  STATEMENT_MUST_BE_STRING: 'SQL statement must be a string',
  PARAMETERS_MUST_BE_ARRAY: 'SQL parameters must be an array',
  TENANT_ID_REQUIRED: 'Tenant ID is required for protocol sessions',
  SESSION_ID_REQUIRED: 'Session ID is required for protocol sessions',
  UNSUPPORTED_PROTOCOL_FEATURE:
    'Unsupported protocol feature requested',
  CALLBACK_MODULE_REF_REQUIRED:
    'callbackModuleRef is required for partition_callback mode',
  CALLBACK_EXPORT_REQUIRED:
    'callbackExport is required for partition_callback mode',
  SELECT_STATEMENT_REQUIRED:
    'A SELECT statement is required for DB.call',
  CALLBACK_FN_REQUIRED:
    'A callback function reference is required for DB.call',
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
  PARTITION_CALLBACK_MISSING_FIELDS:
    'partition_callback requires callbackModuleRef and callbackExport',
  PARTITION_CALLBACK_RUNTIME_KIND_REQUIRED:
    'partition_callback requires explicit runtimeKind',
  RUNTIME_DRIVER_REGISTRY_REQUIRED:
    'runtimeDriverRegistry must be provided by startup ownership',
  CALLBACK_RUNTIME_REGISTRY_REQUIRED:
    'partition_callback requires callback runtime registry ownership',
  PARTITION_CALLBACK_SELECT_ONLY:
    'partition_callback statement must be a SELECT query',
  PARTITION_CALLBACK_NO_TABLE:
    'partition_callback could not resolve table from statement',
  PARTITION_CALLBACK_NO_PARTITIONS:
    'No partitions found for callback target table',
  CALLBACK_HOST_DESCRIPTOR_REQUIRED:
    'Callback descriptor is required',
  CALLBACK_HOST_MODULE_REF_REQUIRED:
    'Callback descriptor must include callbackModuleRef',
  CALLBACK_HOST_EXPORT_REQUIRED:
    'Callback descriptor must include callbackExport',
  CALLBACK_HOST_RUNTIME_KIND_REQUIRED:
    'Callback descriptor must include runtimeKind',
  CALLBACK_HOST_UNSUPPORTED_RUNTIME:
    'Unsupported runtime kind for callback execution: ',
  CALLBACK_HOST_BATCHES_REQUIRED:
    'Batches array is required for callback execution',
  CALLBACK_HOST_BUDGET_TERMINATED:
    'Callback execution terminated: budget exceeded',
  NATIVE_CALLBACK_MODULE_NOT_FOUND:
    'native_js callback module not found in code table',
  NATIVE_CALLBACK_SOURCE_INVALID:
    'native_js callback module code_blob must be a non-empty string',
  NATIVE_CALLBACK_EXPORT_NOT_FOUND:
    'native_js callback export not found in module exports',
  NATIVE_CALLBACK_COMPILE_FAILED:
    'native_js callback compilation failed',
  REGISTRY_UNKNOWN_RUNTIME_KIND:
    'Unknown runtime kind; no fallback driver allowed: ',
  REGISTRY_OCI_CONTAINER_GATED:
    'oci_container runtime is feature-gated and not ' +
    'enabled; enable the OCI container feature gate ' +
    'before use',
  REGISTRY_DRIVER_MISSING_INVOKE:
    'Runtime driver must implement invokeCallback',
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
  WASM_CALL_DELEGATED: 'DB.call delegated to SqlCore',
  EXECUTE_REQUEST_START: 'SqlCore.executeRequest dispatching',
  EXECUTE_REQUEST_COMPLETE: 'SqlCore.executeRequest complete',
  EXECUTE_REQUEST_FAILED: 'SqlCore.executeRequest failed',
  PARTITION_CALLBACK_DISPATCH:
    'SqlCore.executeRequest dispatching partition_callback',
  PARTITION_CALLBACK_COMPLETE:
    'SqlCore.executePartitionCallback complete',
  PARTITION_CALLBACK_RESOLVED:
    'Resolved partitions for partition_callback',
  PARTITION_CALLBACK_BATCHED:
    'Constructed per-partition batches for callback',
  CALLBACK_HOST_EXECUTING:
    'Callback_Execution_Host executing batches',
  CALLBACK_HOST_BATCH_COMPLETE:
    'Callback_Execution_Host batch complete',
  CALLBACK_HOST_COMPLETE:
    'Callback_Execution_Host execution complete',
  CALLBACK_HOST_BATCH_FAILED:
    'Callback_Execution_Host batch failed',
  CALLBACK_HOST_CANCELLED:
    'Callback_Execution_Host execution cancelled',
  REGISTRY_DRIVER_REGISTERED:
    'Runtime driver registered for callback execution',
  REGISTRY_DRIVER_RESOLVED:
    'Runtime driver resolved for callback invocation',
  REGISTRY_OCI_REJECTED:
    'oci_container callback rejected by feature gate',
});

/**
 * Supported runtime kinds for callback execution.
 * Alias of the canonical RUNTIME_KIND from constants/runtime.js.
 * @enum {string}
 */
const CALLBACK_RUNTIME_KIND = RUNTIME_KIND;

export {
  EXECUTION_MODE,
  ADAPTER_TYPE,
  ADAPTER_SUBSYSTEM,
  DEFAULT_TENANT_ID,
  DEFAULT_SESSION_ID,
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
  CALLBACK_RUNTIME_KIND,
};
