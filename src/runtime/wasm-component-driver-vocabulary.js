/**
 * Wasm_Component_Driver vocabulary: its typed errors, actions and status
 * result shape, owned here so the driver and its creation-bound route
 * (wasm-component-driver-consensus.js) share one definition.
 *
 * @module runtime/wasm-component-driver-vocabulary
 */

const WASM_COMPONENT_ERROR = Object.freeze({
  DEFINITION_REQUIRED: 'service definition is required',
  REF_REQUIRED:
    'runtime_ref is required for wasm_component driver',
  REF_MUST_BE_STRING: 'runtime_ref must be a string',
  REF_EMPTY: 'runtime_ref must not be empty',
  REPLICA_CONTEXT_REQUIRED: 'replicaContext is required',
  SERVICE_ID_REQUIRED:
    'replicaContext.serviceId is required',
  NOT_PREPARED:
    'driver has not been prepared for this service',
  NOT_STARTED: 'service is not running',
  CREATE_REPLICA_FAILED: 'failed to create WASM replica',
  CONSENSUS_LIFECYCLE_REQUIRED:
    'WASM consensus replica lifecycle is unavailable',
  START_REPLICA_FAILED: 'failed to start WASM replica',
  START_REPLICA_NO_RESULT:
    'failed to start WASM replica: lifecycle returned no startup result',
  STOP_REPLICA_FAILED: 'failed to stop WASM replica',
  VALIDATION_PIPELINE_FAILED:
    'WASM validation pipeline failed',
  DEPENDENCY_RESOLUTION_FAILED:
    'WASM dependency resolution failed',
  LOCK_VALIDATION_FAILED:
    'WASM lock validation failed',
  UNKNOWN_LIFECYCLE_FAILURE:
    'unknown lifecycle failure',
  ARTIFACT_LOADER_REQUIRED:
    'request Cell Artifact loader is unavailable',
  COMPONENT_INVOKE_FAILED:
    'request Cell Component invocation failed',
  COMPONENT_START_FAILED:
    'request Cell Component startup failed',
  CALL_COMPONENT_INVOKE_FAILED:
    'call Cell Component invocation failed',
  CALL_PARTIALS_INVALID:
    'call Cell Component emitted invalid partials',
  RUNTIME_ACCESS_POLICY_DENIED:
    'request Cell runtime access policy is unavailable or denied',
});

const DRIVER_ACTION = Object.freeze({
  INVOKE: 'invoke',
  PREPARE: 'prepare',
  START: 'start',
  STOP: 'stop',
});

const DRIVER_SEPARATOR = Object.freeze({
  DETAIL: ': ',
  ERROR_LIST: '; ',
});

function buildDriverStatusResult(status, error, detailKey, detailValue) {
  const result = {status};
  if (error) {
    result.error = error;
  }
  if (detailKey && detailValue !== undefined) {
    result[detailKey] = detailValue;
  }
  return result;
}

export {WASM_COMPONENT_ERROR, DRIVER_ACTION, DRIVER_SEPARATOR, buildDriverStatusResult};
