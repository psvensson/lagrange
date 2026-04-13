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
import { NUM } from '../constants/index.js';
const WASM_SERVICE_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("163770") ? {} : (stryCov_9fa48("163770"), {
  REPLICA: stryMutAct_9fa48("163771") ? "" : (stryCov_9fa48("163771"), 'wasm-service-replica'),
  EXECUTOR: stryMutAct_9fa48("163772") ? "" : (stryCov_9fa48("163772"), 'wasm-service-executor'),
  MODULE_MIRROR: stryMutAct_9fa48("163773") ? "" : (stryCov_9fa48("163773"), 'wasm-service-module-mirror'),
  PORT_ALLOCATOR: stryMutAct_9fa48("163774") ? "" : (stryCov_9fa48("163774"), 'wasm-service-port-allocator'),
  TIMER_MANAGER: stryMutAct_9fa48("163775") ? "" : (stryCov_9fa48("163775"), 'wasm-service-timer-manager'),
  SAFETY_INTERVAL: stryMutAct_9fa48("163776") ? "" : (stryCov_9fa48("163776"), 'wasm-service-safety-interval'),
  KV_STORE: stryMutAct_9fa48("163777") ? "" : (stryCov_9fa48("163777"), 'wasm-service-kv-store'),
  VALIDATOR: stryMutAct_9fa48("163778") ? "" : (stryCov_9fa48("163778"), 'wasm-service-validator'),
  LIFECYCLE: stryMutAct_9fa48("163779") ? "" : (stryCov_9fa48("163779"), 'wasm-service-lifecycle'),
  ENDPOINT_BUILDER: stryMutAct_9fa48("163780") ? "" : (stryCov_9fa48("163780"), 'wasm-service-endpoint-builder')
}));
const READ_CONSISTENCY_MODE = Object.freeze(stryMutAct_9fa48("163781") ? {} : (stryCov_9fa48("163781"), {
  LEADER_ONLY: stryMutAct_9fa48("163782") ? "" : (stryCov_9fa48("163782"), 'leader_only'),
  STRONG: stryMutAct_9fa48("163783") ? "" : (stryCov_9fa48("163783"), 'strong'),
  EVENTUAL: stryMutAct_9fa48("163784") ? "" : (stryCov_9fa48("163784"), 'eventual')
}));
const WRITE_CONSISTENCY_MODE = Object.freeze(stryMutAct_9fa48("163785") ? {} : (stryCov_9fa48("163785"), {
  STRONG: stryMutAct_9fa48("163786") ? "" : (stryCov_9fa48("163786"), 'strong'),
  ASYNC: stryMutAct_9fa48("163787") ? "" : (stryCov_9fa48("163787"), 'async')
}));
const TIMER_STATUS = Object.freeze(stryMutAct_9fa48("163788") ? {} : (stryCov_9fa48("163788"), {
  ACTIVE: stryMutAct_9fa48("163789") ? "" : (stryCov_9fa48("163789"), 'active'),
  FIRED: stryMutAct_9fa48("163790") ? "" : (stryCov_9fa48("163790"), 'fired'),
  CANCELLED: stryMutAct_9fa48("163791") ? "" : (stryCov_9fa48("163791"), 'cancelled')
}));
const RESERVED_KV_PREFIX = Object.freeze(stryMutAct_9fa48("163792") ? {} : (stryCov_9fa48("163792"), {
  TIMERS: stryMutAct_9fa48("163793") ? "" : (stryCov_9fa48("163793"), '_timers/')
}));
const DEFAULT_SAFETY_INTERVAL_MS = 500;
const DEFAULT_RESOURCE_BUDGET = Object.freeze(stryMutAct_9fa48("163794") ? {} : (stryCov_9fa48("163794"), {
  CPU_TIME_LIMIT_MS: 5000,
  MEMORY_LIMIT_BYTES: 67108864,
  SESSION_SIZE_LIMIT_BYTES: NUM.BYTES_PER_MIB,
  SERVICE_SIZE_LIMIT_BYTES: 104857600
}));
const WASM_SERVICE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("163795") ? {} : (stryCov_9fa48("163795"), {
  HANDLER_FUNCTION_NOT_FOUND: stryMutAct_9fa48("163796") ? "" : (stryCov_9fa48("163796"), 'Handler function not found in code table'),
  ODD_REPLICA_COUNT_REQUIRED: stryMutAct_9fa48("163797") ? "" : (stryCov_9fa48("163797"), 'Replica count must be an odd number >= 3'),
  INVALID_CONSISTENCY_MODE: stryMutAct_9fa48("163798") ? "" : (stryCov_9fa48("163798"), 'Invalid consistency mode'),
  CPU_TIME_LIMIT_EXCEEDED: stryMutAct_9fa48("163799") ? "" : (stryCov_9fa48("163799"), 'CPU time limit exceeded'),
  MEMORY_LIMIT_EXCEEDED: stryMutAct_9fa48("163800") ? "" : (stryCov_9fa48("163800"), 'Memory limit exceeded'),
  SESSION_SIZE_LIMIT_EXCEEDED: stryMutAct_9fa48("163801") ? "" : (stryCov_9fa48("163801"), 'Session context size limit exceeded'),
  SERVICE_SIZE_LIMIT_EXCEEDED: stryMutAct_9fa48("163802") ? "" : (stryCov_9fa48("163802"), 'Service total context size limit exceeded'),
  SERVICE_NOT_READY: stryMutAct_9fa48("163803") ? "" : (stryCov_9fa48("163803"), 'WASM service group is not ready'),
  MODULE_NOT_AVAILABLE: stryMutAct_9fa48("163804") ? "" : (stryCov_9fa48("163804"), 'WASM module not available on any node'),
  RUN_EXPORT_NOT_FOUND: stryMutAct_9fa48("163805") ? "" : (stryCov_9fa48("163805"), 'run_export function not found in module exports'),
  RUN_EXPORT_NOT_CALLABLE: stryMutAct_9fa48("163806") ? "" : (stryCov_9fa48("163806"), 'run_export must be a callable function'),
  HANDLER_INVOCATION_FAILED: stryMutAct_9fa48("163807") ? "" : (stryCov_9fa48("163807"), 'Handler invocation failed'),
  RUN_EXPORT_SIGNATURE_MISMATCH: (stryMutAct_9fa48("163808") ? "" : (stryCov_9fa48("163808"), 'run_export signature does not match required runtime')) + (stryMutAct_9fa48("163809") ? "" : (stryCov_9fa48("163809"), ' contract (2-3 params)')),
  PORT_EXHAUSTED: stryMutAct_9fa48("163810") ? "" : (stryCov_9fa48("163810"), 'No ports available for allocation')
}));
const WASM_SERVICE_LOG_MSG = Object.freeze(stryMutAct_9fa48("163811") ? {} : (stryCov_9fa48("163811"), {
  REPLICA_CREATED: stryMutAct_9fa48("163812") ? "" : (stryCov_9fa48("163812"), 'WASM service replica created'),
  REPLICA_STARTED: stryMutAct_9fa48("163813") ? "" : (stryCov_9fa48("163813"), 'WASM service replica started'),
  REPLICA_STOPPED: stryMutAct_9fa48("163814") ? "" : (stryCov_9fa48("163814"), 'WASM service replica stopped'),
  BECAME_LEADER: stryMutAct_9fa48("163815") ? "" : (stryCov_9fa48("163815"), 'WASM service replica became leader'),
  LOST_LEADERSHIP: stryMutAct_9fa48("163816") ? "" : (stryCov_9fa48("163816"), 'WASM service replica lost leadership'),
  TIMER_CREATED: stryMutAct_9fa48("163817") ? "" : (stryCov_9fa48("163817"), 'Timer created'),
  TIMER_CANCELLED: stryMutAct_9fa48("163818") ? "" : (stryCov_9fa48("163818"), 'Timer cancelled'),
  TIMER_FIRED: stryMutAct_9fa48("163819") ? "" : (stryCov_9fa48("163819"), 'Timer fired'),
  TIMER_RECONSTRUCTED: stryMutAct_9fa48("163820") ? "" : (stryCov_9fa48("163820"), 'Active timers reconstructed on leader election'),
  TIMER_SKIPPED_NON_ACTIVE: stryMutAct_9fa48("163821") ? "" : (stryCov_9fa48("163821"), 'Skipped non-active timer during reconstruction'),
  SAFETY_INTERVAL_BROADCAST: stryMutAct_9fa48("163822") ? "" : (stryCov_9fa48("163822"), 'Safety interval state broadcast'),
  SAFETY_INTERVAL_UPDATED: stryMutAct_9fa48("163823") ? "" : (stryCov_9fa48("163823"), 'Safety interval leader state updated'),
  READ_FORWARDED_TO_LEADER: stryMutAct_9fa48("163824") ? "" : (stryCov_9fa48("163824"), 'Read forwarded to leader'),
  READ_SERVED_LOCALLY: stryMutAct_9fa48("163825") ? "" : (stryCov_9fa48("163825"), 'Read served from local replica'),
  KV_WRITE_APPLIED: stryMutAct_9fa48("163826") ? "" : (stryCov_9fa48("163826"), 'KV store write applied'),
  KV_DELETE_APPLIED: stryMutAct_9fa48("163827") ? "" : (stryCov_9fa48("163827"), 'KV store delete applied'),
  SESSION_DELETED: stryMutAct_9fa48("163828") ? "" : (stryCov_9fa48("163828"), 'Session context deleted'),
  MODULE_PULLED: stryMutAct_9fa48("163829") ? "" : (stryCov_9fa48("163829"), 'WASM module pulled from peer'),
  MODULE_CACHED: stryMutAct_9fa48("163830") ? "" : (stryCov_9fa48("163830"), 'WASM module cached locally'),
  MODULE_VERSION_UPDATED: stryMutAct_9fa48("163831") ? "" : (stryCov_9fa48("163831"), 'WASM module version updated'),
  PORT_ALLOCATED: stryMutAct_9fa48("163832") ? "" : (stryCov_9fa48("163832"), 'Communication port allocated'),
  PORT_RELEASED: stryMutAct_9fa48("163833") ? "" : (stryCov_9fa48("163833"), 'Communication port released'),
  ENDPOINT_REGISTERED: stryMutAct_9fa48("163834") ? "" : (stryCov_9fa48("163834"), 'Service endpoint registered'),
  ENDPOINT_REMOVED: stryMutAct_9fa48("163835") ? "" : (stryCov_9fa48("163835"), 'Service endpoint removed'),
  HANDLER_EXECUTED: stryMutAct_9fa48("163836") ? "" : (stryCov_9fa48("163836"), 'Handler function executed'),
  HANDLER_EXECUTION_FAILED: stryMutAct_9fa48("163837") ? "" : (stryCov_9fa48("163837"), 'Handler function execution failed'),
  DEFINITION_VALIDATED: stryMutAct_9fa48("163838") ? "" : (stryCov_9fa48("163838"), 'Service definition validated'),
  DEFINITION_REJECTED: stryMutAct_9fa48("163839") ? "" : (stryCov_9fa48("163839"), 'Service definition rejected'),
  ENTRY_COMMITTED: stryMutAct_9fa48("163840") ? "" : (stryCov_9fa48("163840"), 'Raft entry committed and applied'),
  WRITE_REJECTED_SIZE_LIMIT: stryMutAct_9fa48("163841") ? "" : (stryCov_9fa48("163841"), 'Write rejected due to size limit')
}));
const WASM_SERVICE_EXECUTOR_TYPE = stryMutAct_9fa48("163842") ? "" : (stryCov_9fa48("163842"), 'wasm_service');
const SQL_ENGINE_PROFILE = Object.freeze(stryMutAct_9fa48("163843") ? {} : (stryCov_9fa48("163843"), {
  SUBSYSTEM: stryMutAct_9fa48("163844") ? "" : (stryCov_9fa48("163844"), 'sql-engine-profile'),
  DEFAULT_READ_CONSISTENCY: stryMutAct_9fa48("163845") ? "" : (stryCov_9fa48("163845"), 'leader_only'),
  DEFAULT_WRITE_CONSISTENCY: stryMutAct_9fa48("163846") ? "" : (stryCov_9fa48("163846"), 'strong')
}));
const WASM_SERVICE_PROTOCOL = Object.freeze(stryMutAct_9fa48("163847") ? {} : (stryCov_9fa48("163847"), {
  WEBSOCKET: stryMutAct_9fa48("163848") ? "" : (stryCov_9fa48("163848"), 'websocket'),
  POSTGRESQL: stryMutAct_9fa48("163849") ? "" : (stryCov_9fa48("163849"), 'postgresql')
}));
const WASM_SERVICE_HEALTH_STATUS = Object.freeze(stryMutAct_9fa48("163850") ? {} : (stryCov_9fa48("163850"), {
  HEALTHY: stryMutAct_9fa48("163851") ? "" : (stryCov_9fa48("163851"), 'healthy'),
  UNHEALTHY: stryMutAct_9fa48("163852") ? "" : (stryCov_9fa48("163852"), 'unhealthy')
}));
const WASM_SERVICE_DEFINITION_STATUS = Object.freeze(stryMutAct_9fa48("163853") ? {} : (stryCov_9fa48("163853"), {
  ACTIVE: stryMutAct_9fa48("163854") ? "" : (stryCov_9fa48("163854"), 'active'),
  INACTIVE: stryMutAct_9fa48("163855") ? "" : (stryCov_9fa48("163855"), 'inactive')
}));
const DEFAULT_PORT_RANGE_START = 30000;
const DEFAULT_PORT_RANGE_END = 39999;
const WASM_SERVICE_DEFAULT = Object.freeze(stryMutAct_9fa48("163856") ? {} : (stryCov_9fa48("163856"), {
  REPLICA_COUNT: NUM.THREE,
  SAFETY_INTERVAL_MS: DEFAULT_SAFETY_INTERVAL_MS,
  READ_CONSISTENCY: READ_CONSISTENCY_MODE.STRONG,
  WRITE_CONSISTENCY: WRITE_CONSISTENCY_MODE.STRONG,
  PROTOCOL: WASM_SERVICE_PROTOCOL.WEBSOCKET,
  PORT_RANGE_START: DEFAULT_PORT_RANGE_START,
  PORT_RANGE_END: DEFAULT_PORT_RANGE_END
}));
export { WASM_SERVICE_SUBSYSTEM, READ_CONSISTENCY_MODE, WRITE_CONSISTENCY_MODE, TIMER_STATUS, RESERVED_KV_PREFIX, DEFAULT_SAFETY_INTERVAL_MS, DEFAULT_RESOURCE_BUDGET, WASM_SERVICE_ERROR_MSG, WASM_SERVICE_LOG_MSG, WASM_SERVICE_EXECUTOR_TYPE, SQL_ENGINE_PROFILE, WASM_SERVICE_PROTOCOL, WASM_SERVICE_HEALTH_STATUS, WASM_SERVICE_DEFINITION_STATUS, WASM_SERVICE_DEFAULT };