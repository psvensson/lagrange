/**
 * Constants for the unified SQL adapter layer.
 *
 * All SQL entrypoints (internal, external protocol, WASM callback)
 * produce a canonical SqlRequest that is consumed by SqlCore
 * (the existing SQLQueryEngine).
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { RUNTIME_KIND } from '../constants/runtime.js';

/**
 * Execution mode for SqlRequest objects.
 * @enum {string}
 */
const EXECUTION_MODE = Object.freeze(stryMutAct_9fa48("118779") ? {} : (stryCov_9fa48("118779"), {
  SQL_STATEMENT: stryMutAct_9fa48("118780") ? "" : (stryCov_9fa48("118780"), 'sql_statement'),
  PARTITION_CALLBACK: stryMutAct_9fa48("118781") ? "" : (stryCov_9fa48("118781"), 'partition_callback'),
  STAGE: stryMutAct_9fa48("118782") ? "" : (stryCov_9fa48("118782"), 'stage'),
  PLAN: stryMutAct_9fa48("118783") ? "" : (stryCov_9fa48("118783"), 'plan')
}));

/**
 * Adapter type identifiers.
 * @enum {string}
 */
const ADAPTER_TYPE = Object.freeze(stryMutAct_9fa48("118784") ? {} : (stryCov_9fa48("118784"), {
  INTERNAL: stryMutAct_9fa48("118785") ? "" : (stryCov_9fa48("118785"), 'internal'),
  POSTGRES_WIRE: stryMutAct_9fa48("118786") ? "" : (stryCov_9fa48("118786"), 'postgres_wire'),
  WASM_CALL: stryMutAct_9fa48("118787") ? "" : (stryCov_9fa48("118787"), 'wasm_call')
}));

/**
 * Subsystem names for adapter logging.
 * @enum {string}
 */
const ADAPTER_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("118788") ? {} : (stryCov_9fa48("118788"), {
  INTERNAL: stryMutAct_9fa48("118789") ? "" : (stryCov_9fa48("118789"), 'internal-sql-adapter'),
  POSTGRES_WIRE: stryMutAct_9fa48("118790") ? "" : (stryCov_9fa48("118790"), 'postgres-wire-adapter'),
  WASM_CALL: stryMutAct_9fa48("118791") ? "" : (stryCov_9fa48("118791"), 'wasm-call-adapter')
}));

/**
 * Default tenant identifier for internal SQL calls.
 * @type {string}
 */
const DEFAULT_TENANT_ID = stryMutAct_9fa48("118792") ? "" : (stryCov_9fa48("118792"), 'system');

/**
 * Default session identifier for internal SQL calls.
 * @type {string}
 */
const DEFAULT_SESSION_ID = stryMutAct_9fa48("118793") ? "" : (stryCov_9fa48("118793"), 'default');

/**
 * Error messages for the adapter layer.
 * @enum {string}
 */
const ADAPTER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("118794") ? {} : (stryCov_9fa48("118794"), {
  SQL_CORE_REQUIRED: stryMutAct_9fa48("118795") ? "" : (stryCov_9fa48("118795"), 'SqlCore (SQLQueryEngine) instance is required'),
  STATEMENT_REQUIRED: stryMutAct_9fa48("118796") ? "" : (stryCov_9fa48("118796"), 'SQL statement string is required'),
  STATEMENT_MUST_BE_STRING: stryMutAct_9fa48("118797") ? "" : (stryCov_9fa48("118797"), 'SQL statement must be a string'),
  PARAMETERS_MUST_BE_ARRAY: stryMutAct_9fa48("118798") ? "" : (stryCov_9fa48("118798"), 'SQL parameters must be an array'),
  TENANT_ID_REQUIRED: stryMutAct_9fa48("118799") ? "" : (stryCov_9fa48("118799"), 'Tenant ID is required for protocol sessions'),
  SESSION_ID_REQUIRED: stryMutAct_9fa48("118800") ? "" : (stryCov_9fa48("118800"), 'Session ID is required for protocol sessions'),
  UNSUPPORTED_PROTOCOL_FEATURE: stryMutAct_9fa48("118801") ? "" : (stryCov_9fa48("118801"), 'Unsupported protocol feature requested'),
  CALLBACK_MODULE_REF_REQUIRED: stryMutAct_9fa48("118802") ? "" : (stryCov_9fa48("118802"), 'callbackModuleRef is required for partition_callback mode'),
  CALLBACK_EXPORT_REQUIRED: stryMutAct_9fa48("118803") ? "" : (stryCov_9fa48("118803"), 'callbackExport is required for partition_callback mode'),
  SELECT_STATEMENT_REQUIRED: stryMutAct_9fa48("118804") ? "" : (stryCov_9fa48("118804"), 'A SELECT statement is required for DB.call'),
  CALLBACK_FN_REQUIRED: stryMutAct_9fa48("118805") ? "" : (stryCov_9fa48("118805"), 'A callback function reference is required for DB.call'),
  FALLBACK_EXECUTION_REJECTED: stryMutAct_9fa48("118806") ? "" : (stryCov_9fa48("118806"), 'Alternate SQL execution path rejected; all queries must use SqlCore'),
  SECOND_ENGINE_REJECTED: stryMutAct_9fa48("118807") ? "" : (stryCov_9fa48("118807"), 'Configuration rejected: second SQL execution path is not allowed'),
  INVALID_SQL_REQUEST: stryMutAct_9fa48("118808") ? "" : (stryCov_9fa48("118808"), 'executeRequest requires a valid SqlRequest object'),
  UNSUPPORTED_EXECUTION_MODE: stryMutAct_9fa48("118809") ? "" : (stryCov_9fa48("118809"), 'Unsupported execution mode: '),
  STAGE_HANDLER_REQUIRED: stryMutAct_9fa48("118810") ? "" : (stryCov_9fa48("118810"), 'stage execution mode requires a handler function'),
  PLAN_OBJECT_REQUIRED: stryMutAct_9fa48("118811") ? "" : (stryCov_9fa48("118811"), 'plan execution mode requires a plan object'),
  PARTITION_CALLBACK_MISSING_FIELDS: stryMutAct_9fa48("118812") ? "" : (stryCov_9fa48("118812"), 'partition_callback requires callbackModuleRef and callbackExport'),
  PARTITION_CALLBACK_RUNTIME_KIND_REQUIRED: stryMutAct_9fa48("118813") ? "" : (stryCov_9fa48("118813"), 'partition_callback requires explicit runtimeKind'),
  RUNTIME_DRIVER_REGISTRY_REQUIRED: stryMutAct_9fa48("118814") ? "" : (stryCov_9fa48("118814"), 'runtimeDriverRegistry must be provided by startup ownership'),
  CALLBACK_RUNTIME_REGISTRY_REQUIRED: stryMutAct_9fa48("118815") ? "" : (stryCov_9fa48("118815"), 'partition_callback requires callback runtime registry ownership'),
  PARTITION_CALLBACK_SELECT_ONLY: stryMutAct_9fa48("118816") ? "" : (stryCov_9fa48("118816"), 'partition_callback statement must be a SELECT query'),
  PARTITION_CALLBACK_NO_TABLE: stryMutAct_9fa48("118817") ? "" : (stryCov_9fa48("118817"), 'partition_callback could not resolve table from statement'),
  PARTITION_CALLBACK_NO_PARTITIONS: stryMutAct_9fa48("118818") ? "" : (stryCov_9fa48("118818"), 'No partitions found for callback target table'),
  CALLBACK_HOST_DESCRIPTOR_REQUIRED: stryMutAct_9fa48("118819") ? "" : (stryCov_9fa48("118819"), 'Callback descriptor is required'),
  CALLBACK_HOST_MODULE_REF_REQUIRED: stryMutAct_9fa48("118820") ? "" : (stryCov_9fa48("118820"), 'Callback descriptor must include callbackModuleRef'),
  CALLBACK_HOST_EXPORT_REQUIRED: stryMutAct_9fa48("118821") ? "" : (stryCov_9fa48("118821"), 'Callback descriptor must include callbackExport'),
  CALLBACK_HOST_RUNTIME_KIND_REQUIRED: stryMutAct_9fa48("118822") ? "" : (stryCov_9fa48("118822"), 'Callback descriptor must include runtimeKind'),
  CALLBACK_HOST_UNSUPPORTED_RUNTIME: stryMutAct_9fa48("118823") ? "" : (stryCov_9fa48("118823"), 'Unsupported runtime kind for callback execution: '),
  CALLBACK_HOST_BATCHES_REQUIRED: stryMutAct_9fa48("118824") ? "" : (stryCov_9fa48("118824"), 'Batches array is required for callback execution'),
  CALLBACK_HOST_BUDGET_TERMINATED: stryMutAct_9fa48("118825") ? "" : (stryCov_9fa48("118825"), 'Callback execution terminated: budget exceeded'),
  NATIVE_CALLBACK_MODULE_NOT_FOUND: stryMutAct_9fa48("118826") ? "" : (stryCov_9fa48("118826"), 'native_js callback module not found in code table'),
  NATIVE_CALLBACK_SOURCE_INVALID: stryMutAct_9fa48("118827") ? "" : (stryCov_9fa48("118827"), 'native_js callback module code_blob must be a non-empty string'),
  NATIVE_CALLBACK_EXPORT_NOT_FOUND: stryMutAct_9fa48("118828") ? "" : (stryCov_9fa48("118828"), 'native_js callback export not found in module exports'),
  NATIVE_CALLBACK_COMPILE_FAILED: stryMutAct_9fa48("118829") ? "" : (stryCov_9fa48("118829"), 'native_js callback compilation failed'),
  WASM_CALLBACK_EXECUTOR_REQUIRED: stryMutAct_9fa48("118830") ? "" : (stryCov_9fa48("118830"), 'wasm_component callback execution requires a wasmExecutor'),
  WASM_CALLBACK_MODULE_MIRROR_REQUIRED: stryMutAct_9fa48("118831") ? "" : (stryCov_9fa48("118831"), 'wasm_component callback execution requires a module mirror'),
  WASM_CALLBACK_SOURCE_INVALID: stryMutAct_9fa48("118832") ? "" : (stryCov_9fa48("118832"), 'wasm_component callback artifact must contain non-empty source'),
  WASM_CALLBACK_EXPORT_NOT_FOUND: stryMutAct_9fa48("118833") ? "" : (stryCov_9fa48("118833"), 'wasm_component callback export not found in module exports'),
  WASM_CALLBACK_COMPILE_FAILED: stryMutAct_9fa48("118834") ? "" : (stryCov_9fa48("118834"), 'wasm_component callback artifact compilation failed'),
  REGISTRY_UNKNOWN_RUNTIME_KIND: stryMutAct_9fa48("118835") ? "" : (stryCov_9fa48("118835"), 'Unknown runtime kind; no fallback driver allowed: '),
  REGISTRY_OCI_CONTAINER_GATED: (stryMutAct_9fa48("118836") ? "" : (stryCov_9fa48("118836"), 'oci_container runtime is feature-gated and not ')) + (stryMutAct_9fa48("118837") ? "" : (stryCov_9fa48("118837"), 'enabled; enable the OCI container feature gate ')) + (stryMutAct_9fa48("118838") ? "" : (stryCov_9fa48("118838"), 'before use')),
  REGISTRY_DRIVER_MISSING_INVOKE: stryMutAct_9fa48("118839") ? "" : (stryCov_9fa48("118839"), 'Runtime driver must implement invokeCallback')
}));

/**
 * Log messages for the adapter layer.
 * @enum {string}
 */
const ADAPTER_LOG_MSG = Object.freeze(stryMutAct_9fa48("118840") ? {} : (stryCov_9fa48("118840"), {
  REQUEST_CREATED: stryMutAct_9fa48("118841") ? "" : (stryCov_9fa48("118841"), 'SqlRequest created'),
  EXECUTING_VIA_SQLCORE: stryMutAct_9fa48("118842") ? "" : (stryCov_9fa48("118842"), 'Executing SqlRequest via SqlCore'),
  EXECUTION_COMPLETE: stryMutAct_9fa48("118843") ? "" : (stryCov_9fa48("118843"), 'SqlRequest execution complete'),
  EXECUTION_FAILED: stryMutAct_9fa48("118844") ? "" : (stryCov_9fa48("118844"), 'SqlRequest execution failed'),
  FALLBACK_REJECTED: stryMutAct_9fa48("118845") ? "" : (stryCov_9fa48("118845"), 'Fallback execution path rejected'),
  PROTOCOL_SESSION_MAPPED: stryMutAct_9fa48("118846") ? "" : (stryCov_9fa48("118846"), 'Protocol session mapped to tenant/policy'),
  UNSUPPORTED_FEATURE: stryMutAct_9fa48("118847") ? "" : (stryCov_9fa48("118847"), 'Unsupported protocol feature negotiation'),
  WASM_CALL_DELEGATED: stryMutAct_9fa48("118848") ? "" : (stryCov_9fa48("118848"), 'DB.call delegated to SqlCore'),
  EXECUTE_REQUEST_START: stryMutAct_9fa48("118849") ? "" : (stryCov_9fa48("118849"), 'SqlCore.executeRequest dispatching'),
  EXECUTE_REQUEST_COMPLETE: stryMutAct_9fa48("118850") ? "" : (stryCov_9fa48("118850"), 'SqlCore.executeRequest complete'),
  EXECUTE_REQUEST_FAILED: stryMutAct_9fa48("118851") ? "" : (stryCov_9fa48("118851"), 'SqlCore.executeRequest failed'),
  PARTITION_CALLBACK_DISPATCH: stryMutAct_9fa48("118852") ? "" : (stryCov_9fa48("118852"), 'SqlCore.executeRequest dispatching partition_callback'),
  PARTITION_CALLBACK_COMPLETE: stryMutAct_9fa48("118853") ? "" : (stryCov_9fa48("118853"), 'SqlCore.executePartitionCallback complete'),
  PARTITION_CALLBACK_RESOLVED: stryMutAct_9fa48("118854") ? "" : (stryCov_9fa48("118854"), 'Resolved partitions for partition_callback'),
  PARTITION_CALLBACK_BATCHED: stryMutAct_9fa48("118855") ? "" : (stryCov_9fa48("118855"), 'Constructed per-partition batches for callback'),
  CALLBACK_HOST_EXECUTING: stryMutAct_9fa48("118856") ? "" : (stryCov_9fa48("118856"), 'Callback_Execution_Host executing batches'),
  CALLBACK_HOST_BATCH_COMPLETE: stryMutAct_9fa48("118857") ? "" : (stryCov_9fa48("118857"), 'Callback_Execution_Host batch complete'),
  CALLBACK_HOST_COMPLETE: stryMutAct_9fa48("118858") ? "" : (stryCov_9fa48("118858"), 'Callback_Execution_Host execution complete'),
  CALLBACK_HOST_BATCH_FAILED: stryMutAct_9fa48("118859") ? "" : (stryCov_9fa48("118859"), 'Callback_Execution_Host batch failed'),
  CALLBACK_HOST_CANCELLED: stryMutAct_9fa48("118860") ? "" : (stryCov_9fa48("118860"), 'Callback_Execution_Host execution cancelled'),
  REGISTRY_DRIVER_REGISTERED: stryMutAct_9fa48("118861") ? "" : (stryCov_9fa48("118861"), 'Runtime driver registered for callback execution'),
  REGISTRY_DRIVER_RESOLVED: stryMutAct_9fa48("118862") ? "" : (stryCov_9fa48("118862"), 'Runtime driver resolved for callback invocation'),
  REGISTRY_OCI_REJECTED: stryMutAct_9fa48("118863") ? "" : (stryCov_9fa48("118863"), 'oci_container callback rejected by feature gate'),
  LOGGING_INIT_FAILED: stryMutAct_9fa48("118864") ? "" : (stryCov_9fa48("118864"), 'initLogger failed'),
  CALLBACK_HOST_INIT_LOGGER_FAILED: stryMutAct_9fa48("118865") ? "" : (stryCov_9fa48("118865"), 'Callback_Execution_Host initLogger failed'),
  CALLBACK_HOST_METRICS_FAILED: stryMutAct_9fa48("118866") ? "" : (stryCov_9fa48("118866"), 'Callback_Execution_Host metrics logging failed')
}));

/**
 * Supported runtime kinds for callback execution.
 * Alias of the canonical RUNTIME_KIND from constants/runtime.js.
 * @enum {string}
 */
const CALLBACK_RUNTIME_KIND = RUNTIME_KIND;
export { EXECUTION_MODE, ADAPTER_TYPE, ADAPTER_SUBSYSTEM, DEFAULT_TENANT_ID, DEFAULT_SESSION_ID, ADAPTER_ERROR_MSG, ADAPTER_LOG_MSG, CALLBACK_RUNTIME_KIND };