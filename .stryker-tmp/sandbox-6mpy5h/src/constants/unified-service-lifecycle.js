/**
 * Canonical constants for unified service lifecycle orchestration.
 *
 * Defines service-type identifiers, lifecycle states, operation states,
 * and service-message envelope fields used by the hard-cutover model.
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
import { SERVICE_TYPE } from './service.js';
import { WASM_OPERATION_STATE } from './wasm-meta.js';
const UNIFIED_SERVICE_TYPE = Object.freeze(stryMutAct_9fa48("55257") ? {} : (stryCov_9fa48("55257"), {
  PARTITION: SERVICE_TYPE.PARTITION,
  MESSAGE_GROUP: SERVICE_TYPE.MESSAGE_GROUP,
  RUNTIME_SERVICE: stryMutAct_9fa48("55258") ? "" : (stryCov_9fa48("55258"), 'runtime_service')
}));
const ALLOWED_UNIFIED_SERVICE_TYPES = Object.freeze(new Set(Object.values(UNIFIED_SERVICE_TYPE)));
const SERVICE_LIFECYCLE_STATE = Object.freeze(stryMutAct_9fa48("55259") ? {} : (stryCov_9fa48("55259"), {
  CREATED: stryMutAct_9fa48("55260") ? "" : (stryCov_9fa48("55260"), 'created'),
  STARTING: stryMutAct_9fa48("55261") ? "" : (stryCov_9fa48("55261"), 'starting'),
  RUNNING: stryMutAct_9fa48("55262") ? "" : (stryCov_9fa48("55262"), 'running'),
  STOPPING: stryMutAct_9fa48("55263") ? "" : (stryCov_9fa48("55263"), 'stopping'),
  STOPPED: stryMutAct_9fa48("55264") ? "" : (stryCov_9fa48("55264"), 'stopped'),
  FAILED: stryMutAct_9fa48("55265") ? "" : (stryCov_9fa48("55265"), 'failed')
}));
const SERVICE_LIFECYCLE_TRANSITIONS = Object.freeze(stryMutAct_9fa48("55266") ? {} : (stryCov_9fa48("55266"), {
  [SERVICE_LIFECYCLE_STATE.CREATED]: stryMutAct_9fa48("55267") ? [] : (stryCov_9fa48("55267"), [SERVICE_LIFECYCLE_STATE.STARTING, SERVICE_LIFECYCLE_STATE.FAILED]),
  [SERVICE_LIFECYCLE_STATE.STARTING]: stryMutAct_9fa48("55268") ? [] : (stryCov_9fa48("55268"), [SERVICE_LIFECYCLE_STATE.RUNNING, SERVICE_LIFECYCLE_STATE.STOPPING, SERVICE_LIFECYCLE_STATE.FAILED]),
  [SERVICE_LIFECYCLE_STATE.RUNNING]: stryMutAct_9fa48("55269") ? [] : (stryCov_9fa48("55269"), [SERVICE_LIFECYCLE_STATE.STOPPING, SERVICE_LIFECYCLE_STATE.FAILED]),
  [SERVICE_LIFECYCLE_STATE.STOPPING]: stryMutAct_9fa48("55270") ? [] : (stryCov_9fa48("55270"), [SERVICE_LIFECYCLE_STATE.STOPPED, SERVICE_LIFECYCLE_STATE.FAILED]),
  [SERVICE_LIFECYCLE_STATE.STOPPED]: stryMutAct_9fa48("55271") ? [] : (stryCov_9fa48("55271"), [SERVICE_LIFECYCLE_STATE.STARTING]),
  [SERVICE_LIFECYCLE_STATE.FAILED]: stryMutAct_9fa48("55272") ? [] : (stryCov_9fa48("55272"), [SERVICE_LIFECYCLE_STATE.STARTING, SERVICE_LIFECYCLE_STATE.STOPPING])
}));
const SERVICE_LIFECYCLE_OPERATION = Object.freeze(stryMutAct_9fa48("55273") ? {} : (stryCov_9fa48("55273"), {
  CREATE: stryMutAct_9fa48("55274") ? "" : (stryCov_9fa48("55274"), 'create'),
  START: stryMutAct_9fa48("55275") ? "" : (stryCov_9fa48("55275"), 'start'),
  STOP: stryMutAct_9fa48("55276") ? "" : (stryCov_9fa48("55276"), 'stop'),
  RESTART: stryMutAct_9fa48("55277") ? "" : (stryCov_9fa48("55277"), 'restart'),
  HEALTH: stryMutAct_9fa48("55278") ? "" : (stryCov_9fa48("55278"), 'health')
}));
const SERVICE_OPERATION_STATE = Object.freeze(stryMutAct_9fa48("55279") ? {} : (stryCov_9fa48("55279"), {
  PENDING: WASM_OPERATION_STATE.PENDING,
  IN_PROGRESS: WASM_OPERATION_STATE.IN_PROGRESS,
  COMPLETED: WASM_OPERATION_STATE.COMPLETED,
  FAILED: WASM_OPERATION_STATE.FAILED,
  CANCELLED: WASM_OPERATION_STATE.CANCELLED
}));
const SERVICE_DESCRIPTOR_FIELD = Object.freeze(stryMutAct_9fa48("55280") ? {} : (stryCov_9fa48("55280"), {
  SERVICE_ID: stryMutAct_9fa48("55281") ? "" : (stryCov_9fa48("55281"), 'serviceId'),
  SERVICE_TYPE: stryMutAct_9fa48("55282") ? "" : (stryCov_9fa48("55282"), 'serviceType'),
  TENANT_ID: stryMutAct_9fa48("55283") ? "" : (stryCov_9fa48("55283"), 'tenantId'),
  REPLICA_ID: stryMutAct_9fa48("55284") ? "" : (stryCov_9fa48("55284"), 'replicaId'),
  REPLICA_COUNT: stryMutAct_9fa48("55285") ? "" : (stryCov_9fa48("55285"), 'replicaCount'),
  LIFECYCLE_STATE: stryMutAct_9fa48("55286") ? "" : (stryCov_9fa48("55286"), 'lifecycleState'),
  RUNTIME_KIND: stryMutAct_9fa48("55287") ? "" : (stryCov_9fa48("55287"), 'runtimeKind'),
  RUNTIME_REF: stryMutAct_9fa48("55288") ? "" : (stryCov_9fa48("55288"), 'runtimeRef'),
  RUNTIME_CONFIG: stryMutAct_9fa48("55289") ? "" : (stryCov_9fa48("55289"), 'runtimeConfig')
}));
const SERVICE_MESSAGE_FIELD = Object.freeze(stryMutAct_9fa48("55290") ? {} : (stryCov_9fa48("55290"), {
  MESSAGE_ID: stryMutAct_9fa48("55291") ? "" : (stryCov_9fa48("55291"), 'messageId'),
  SERVICE_ID: stryMutAct_9fa48("55292") ? "" : (stryCov_9fa48("55292"), 'serviceId'),
  SERVICE_TYPE: stryMutAct_9fa48("55293") ? "" : (stryCov_9fa48("55293"), 'serviceType'),
  OPERATION: stryMutAct_9fa48("55294") ? "" : (stryCov_9fa48("55294"), 'operation'),
  PAYLOAD: stryMutAct_9fa48("55295") ? "" : (stryCov_9fa48("55295"), 'payload'),
  METADATA: stryMutAct_9fa48("55296") ? "" : (stryCov_9fa48("55296"), 'metadata'),
  TENANT_ID: stryMutAct_9fa48("55297") ? "" : (stryCov_9fa48("55297"), 'tenantId'),
  PRINCIPAL: stryMutAct_9fa48("55298") ? "" : (stryCov_9fa48("55298"), 'principal'),
  TRACE_ID: stryMutAct_9fa48("55299") ? "" : (stryCov_9fa48("55299"), 'traceId'),
  TIMESTAMP: stryMutAct_9fa48("55300") ? "" : (stryCov_9fa48("55300"), 'timestamp')
}));
const SERVICE_MESSAGE_REQUIRED_FIELDS = Object.freeze(stryMutAct_9fa48("55301") ? [] : (stryCov_9fa48("55301"), [SERVICE_MESSAGE_FIELD.MESSAGE_ID, SERVICE_MESSAGE_FIELD.SERVICE_ID, SERVICE_MESSAGE_FIELD.OPERATION, SERVICE_MESSAGE_FIELD.PAYLOAD]));
export { UNIFIED_SERVICE_TYPE, ALLOWED_UNIFIED_SERVICE_TYPES, SERVICE_LIFECYCLE_STATE, SERVICE_LIFECYCLE_TRANSITIONS, SERVICE_LIFECYCLE_OPERATION, SERVICE_OPERATION_STATE, SERVICE_DESCRIPTOR_FIELD, SERVICE_MESSAGE_FIELD, SERVICE_MESSAGE_REQUIRED_FIELDS };