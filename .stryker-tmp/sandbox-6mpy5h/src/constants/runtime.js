/**
 * Constants for the unified service runtime model.
 *
 * Runtime kind selection, descriptor field names, and
 * feature-gate identifiers for replicated service execution.
 *
 * Requirements: 1.1, 5.1
 */
// @ts-nocheck


// --- Runtime kind selector (service_definitions.runtime_kind) ---
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
const RUNTIME_KIND = Object.freeze(stryMutAct_9fa48("54714") ? {} : (stryCov_9fa48("54714"), {
  NATIVE_JS: stryMutAct_9fa48("54715") ? "" : (stryCov_9fa48("54715"), 'native_js'),
  WASM_COMPONENT: stryMutAct_9fa48("54716") ? "" : (stryCov_9fa48("54716"), 'wasm_component'),
  OCI_CONTAINER: stryMutAct_9fa48("54717") ? "" : (stryCov_9fa48("54717"), 'oci_container')
}));

/**
 * Canonical runtime kind for SQL engine service profile.
 * This must remain aligned with runtime inference and
 * SQL profile factory defaults.
 */
const SQL_ENGINE_RUNTIME_KIND = RUNTIME_KIND.NATIVE_JS;

// --- Allowed runtime kinds set (for fast membership checks) ---

const ALLOWED_RUNTIME_KINDS = Object.freeze(new Set(Object.values(RUNTIME_KIND)));

// --- Runtime descriptor field names (service_definitions columns) ---

const RUNTIME_FIELD = Object.freeze(stryMutAct_9fa48("54718") ? {} : (stryCov_9fa48("54718"), {
  RUNTIME_KIND: stryMutAct_9fa48("54719") ? "" : (stryCov_9fa48("54719"), 'runtime_kind'),
  RUNTIME_REF: stryMutAct_9fa48("54720") ? "" : (stryCov_9fa48("54720"), 'runtime_ref'),
  RUNTIME_CONFIG: stryMutAct_9fa48("54721") ? "" : (stryCov_9fa48("54721"), 'runtime_config')
}));
export { RUNTIME_KIND, SQL_ENGINE_RUNTIME_KIND, ALLOWED_RUNTIME_KINDS, RUNTIME_FIELD };

// --- Lifecycle operation names ---

const LIFECYCLE_OPERATION = Object.freeze(stryMutAct_9fa48("54722") ? {} : (stryCov_9fa48("54722"), {
  PREPARE: stryMutAct_9fa48("54723") ? "" : (stryCov_9fa48("54723"), 'prepare'),
  START: stryMutAct_9fa48("54724") ? "" : (stryCov_9fa48("54724"), 'start'),
  STOP: stryMutAct_9fa48("54725") ? "" : (stryCov_9fa48("54725"), 'stop'),
  HEALTH: stryMutAct_9fa48("54726") ? "" : (stryCov_9fa48("54726"), 'health')
}));

// --- Lifecycle event names ---

const LIFECYCLE_EVENT = Object.freeze(stryMutAct_9fa48("54727") ? {} : (stryCov_9fa48("54727"), {
  PREPARE_START: stryMutAct_9fa48("54728") ? "" : (stryCov_9fa48("54728"), 'lifecycle:prepare:start'),
  PREPARE_SUCCESS: stryMutAct_9fa48("54729") ? "" : (stryCov_9fa48("54729"), 'lifecycle:prepare:success'),
  PREPARE_FAILURE: stryMutAct_9fa48("54730") ? "" : (stryCov_9fa48("54730"), 'lifecycle:prepare:failure'),
  START_START: stryMutAct_9fa48("54731") ? "" : (stryCov_9fa48("54731"), 'lifecycle:start:start'),
  START_SUCCESS: stryMutAct_9fa48("54732") ? "" : (stryCov_9fa48("54732"), 'lifecycle:start:success'),
  START_FAILURE: stryMutAct_9fa48("54733") ? "" : (stryCov_9fa48("54733"), 'lifecycle:start:failure'),
  STOP_START: stryMutAct_9fa48("54734") ? "" : (stryCov_9fa48("54734"), 'lifecycle:stop:start'),
  STOP_SUCCESS: stryMutAct_9fa48("54735") ? "" : (stryCov_9fa48("54735"), 'lifecycle:stop:success'),
  STOP_FAILURE: stryMutAct_9fa48("54736") ? "" : (stryCov_9fa48("54736"), 'lifecycle:stop:failure'),
  HEALTH_CHECK: stryMutAct_9fa48("54737") ? "" : (stryCov_9fa48("54737"), 'lifecycle:health:check'),
  HEALTH_RESULT: stryMutAct_9fa48("54738") ? "" : (stryCov_9fa48("54738"), 'lifecycle:health:result'),
  ENDPOINT_INTENT_RECEIVED: stryMutAct_9fa48("54739") ? "" : (stryCov_9fa48("54739"), 'lifecycle:endpoint:intent_received'),
  ENDPOINT_REGISTERED: stryMutAct_9fa48("54740") ? "" : (stryCov_9fa48("54740"), 'lifecycle:endpoint:registered'),
  ENDPOINT_REGISTRATION_FAILED: stryMutAct_9fa48("54741") ? "" : (stryCov_9fa48("54741"), 'lifecycle:endpoint:registration_failed'),
  ENDPOINT_REMOVED: stryMutAct_9fa48("54742") ? "" : (stryCov_9fa48("54742"), 'lifecycle:endpoint:removed'),
  ENDPOINT_REMOVAL_FAILED: stryMutAct_9fa48("54743") ? "" : (stryCov_9fa48("54743"), 'lifecycle:endpoint:removal_failed')
}));

// --- Operation journal event names ---

const OPERATION_JOURNAL_EVENT = Object.freeze(stryMutAct_9fa48("54744") ? {} : (stryCov_9fa48("54744"), {
  OPERATION_CREATED: stryMutAct_9fa48("54745") ? "" : (stryCov_9fa48("54745"), 'lifecycle:operation:created'),
  OPERATION_TRANSITIONED: stryMutAct_9fa48("54746") ? "" : (stryCov_9fa48("54746"), 'lifecycle:operation:transitioned'),
  OPERATION_JOURNAL_FAILED: stryMutAct_9fa48("54747") ? "" : (stryCov_9fa48("54747"), 'lifecycle:operation:journal_failed'),
  IDEMPOTENCY_HIT: stryMutAct_9fa48("54748") ? "" : (stryCov_9fa48("54748"), 'lifecycle:operation:idempotency_hit')
}));

// --- Endpoint intent field names (returned by drivers) ---

const ENDPOINT_INTENT_FIELD = Object.freeze(stryMutAct_9fa48("54749") ? {} : (stryCov_9fa48("54749"), {
  HOST: stryMutAct_9fa48("54750") ? "" : (stryCov_9fa48("54750"), 'host'),
  PORT: stryMutAct_9fa48("54751") ? "" : (stryCov_9fa48("54751"), 'port'),
  PROTOCOL: stryMutAct_9fa48("54752") ? "" : (stryCov_9fa48("54752"), 'protocol')
}));

// --- Minimum valid port number ---
const MIN_PORT = 1;

// --- Maximum valid port number ---
const MAX_PORT = 65535;

// --- Query executor factory event names ---

const QUERY_EXECUTOR_FACTORY_EVENT = Object.freeze(stryMutAct_9fa48("54753") ? {} : (stryCov_9fa48("54753"), {
  FACTORY_SET: stryMutAct_9fa48("54754") ? "" : (stryCov_9fa48("54754"), 'lifecycle:query_executor_factory:set'),
  EXECUTOR_INJECTED: stryMutAct_9fa48("54755") ? "" : (stryCov_9fa48("54755"), 'lifecycle:query_executor:injected')
}));

// --- State projection event names (services table) ---

const STATE_PROJECTION_EVENT = Object.freeze(stryMutAct_9fa48("54756") ? {} : (stryCov_9fa48("54756"), {
  STATE_PROJECTED: stryMutAct_9fa48("54757") ? "" : (stryCov_9fa48("54757"), 'lifecycle:state:projected'),
  STATE_PROJECTION_FAILED: stryMutAct_9fa48("54758") ? "" : (stryCov_9fa48("54758"), 'lifecycle:state:projection_failed')
}));

// --- Runtime service status values for services table ---

const RUNTIME_REPLICA_STATUS = Object.freeze(stryMutAct_9fa48("54759") ? {} : (stryCov_9fa48("54759"), {
  CREATED: stryMutAct_9fa48("54760") ? "" : (stryCov_9fa48("54760"), 'created'),
  ACTIVE: stryMutAct_9fa48("54761") ? "" : (stryCov_9fa48("54761"), 'active'),
  STOPPED: stryMutAct_9fa48("54762") ? "" : (stryCov_9fa48("54762"), 'stopped'),
  FAILED: stryMutAct_9fa48("54763") ? "" : (stryCov_9fa48("54763"), 'failed')
}));
export { LIFECYCLE_OPERATION, LIFECYCLE_EVENT, OPERATION_JOURNAL_EVENT, ENDPOINT_INTENT_FIELD, STATE_PROJECTION_EVENT, QUERY_EXECUTOR_FACTORY_EVENT, RUNTIME_REPLICA_STATUS, MIN_PORT, MAX_PORT };