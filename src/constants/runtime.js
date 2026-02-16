/**
 * Constants for the unified service runtime model.
 *
 * Runtime kind selection, descriptor field names, and
 * feature-gate identifiers for replicated service execution.
 *
 * Requirements: 1.1, 5.1
 */

// --- Runtime kind selector (service_definitions.runtime_kind) ---

const RUNTIME_KIND = Object.freeze({
  NATIVE_JS: 'native_js',
  WASM_COMPONENT: 'wasm_component',
  OCI_CONTAINER: 'oci_container',
});

/**
 * Canonical runtime kind for SQL engine service profile.
 * This must remain aligned with runtime inference and
 * SQL profile factory defaults.
 */
const SQL_ENGINE_RUNTIME_KIND = RUNTIME_KIND.NATIVE_JS;

// --- Allowed runtime kinds set (for fast membership checks) ---

const ALLOWED_RUNTIME_KINDS = Object.freeze(
  new Set(Object.values(RUNTIME_KIND)),
);

// --- Runtime descriptor field names (service_definitions columns) ---

const RUNTIME_FIELD = Object.freeze({
  RUNTIME_KIND: 'runtime_kind',
  RUNTIME_REF: 'runtime_ref',
  RUNTIME_CONFIG: 'runtime_config',
});

export {
  RUNTIME_KIND,
  SQL_ENGINE_RUNTIME_KIND,
  ALLOWED_RUNTIME_KINDS,
  RUNTIME_FIELD,
};

// --- Lifecycle operation names ---

const LIFECYCLE_OPERATION = Object.freeze({
  PREPARE: 'prepare',
  START: 'start',
  STOP: 'stop',
  HEALTH: 'health',
});

// --- Lifecycle event names ---

const LIFECYCLE_EVENT = Object.freeze({
  PREPARE_START: 'lifecycle:prepare:start',
  PREPARE_SUCCESS: 'lifecycle:prepare:success',
  PREPARE_FAILURE: 'lifecycle:prepare:failure',
  START_START: 'lifecycle:start:start',
  START_SUCCESS: 'lifecycle:start:success',
  START_FAILURE: 'lifecycle:start:failure',
  STOP_START: 'lifecycle:stop:start',
  STOP_SUCCESS: 'lifecycle:stop:success',
  STOP_FAILURE: 'lifecycle:stop:failure',
  HEALTH_CHECK: 'lifecycle:health:check',
  HEALTH_RESULT: 'lifecycle:health:result',
  ENDPOINT_INTENT_RECEIVED: 'lifecycle:endpoint:intent_received',
  ENDPOINT_REGISTERED: 'lifecycle:endpoint:registered',
  ENDPOINT_REGISTRATION_FAILED: 'lifecycle:endpoint:registration_failed',
  ENDPOINT_REMOVED: 'lifecycle:endpoint:removed',
  ENDPOINT_REMOVAL_FAILED: 'lifecycle:endpoint:removal_failed',
});

// --- Operation journal event names ---

const OPERATION_JOURNAL_EVENT = Object.freeze({
  OPERATION_CREATED: 'lifecycle:operation:created',
  OPERATION_TRANSITIONED: 'lifecycle:operation:transitioned',
  OPERATION_JOURNAL_FAILED: 'lifecycle:operation:journal_failed',
  IDEMPOTENCY_HIT: 'lifecycle:operation:idempotency_hit',
});

// --- Endpoint intent field names (returned by drivers) ---

const ENDPOINT_INTENT_FIELD = Object.freeze({
  HOST: 'host',
  PORT: 'port',
  PROTOCOL: 'protocol',
});

// --- Minimum valid port number ---
const MIN_PORT = 1;

// --- Maximum valid port number ---
const MAX_PORT = 65535;

// --- State projection event names (services table) ---

const STATE_PROJECTION_EVENT = Object.freeze({
  STATE_PROJECTED: 'lifecycle:state:projected',
  STATE_PROJECTION_FAILED: 'lifecycle:state:projection_failed',
});

// --- Runtime service status values for services table ---

const RUNTIME_REPLICA_STATUS = Object.freeze({
  CREATED: 'created',
  ACTIVE: 'active',
  STOPPED: 'stopped',
  FAILED: 'failed',
});

export {
  LIFECYCLE_OPERATION,
  LIFECYCLE_EVENT,
  OPERATION_JOURNAL_EVENT,
  ENDPOINT_INTENT_FIELD,
  STATE_PROJECTION_EVENT,
  RUNTIME_REPLICA_STATUS,
  MIN_PORT,
  MAX_PORT,
};
