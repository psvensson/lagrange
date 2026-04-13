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
import { CONTROL_PLANE_READINESS_DIMENSION } from './control-plane-readiness-constants.js';
import { buildPressureAdmissionFailure, PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor } from './pressure-governor.js';
import { ControlPlaneDiagnosticsLedger } from './control-plane-diagnostics-ledger.js';
import { buildControlPlaneQueryOptions, getRemainingBudgetMs } from './timeout-budget.js';
import { CDC_OPERATION, METRICS_LOG_TAG, NUM, SQL, TYPEOF } from '../constants/index.js';
import { INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { getSystemCachePrimaryKeyFieldOrFallback } from '../cache/system-cache-key-descriptor.js';
import { canonicalizeSystemTableRow } from './system-row-normalizers.js';
const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL = Object.freeze(stryMutAct_9fa48("61788") ? {} : (stryCov_9fa48("61788"), {
  ACTIVE: stryMutAct_9fa48("61789") ? "" : (stryCov_9fa48("61789"), "active"),
  ALLOWCOALESCING: stryMutAct_9fa48("61790") ? "" : (stryCov_9fa48("61790"), "allowCoalescing"),
  ALLOWPENDINGVISIBILITY: stryMutAct_9fa48("61791") ? "" : (stryCov_9fa48("61791"), "allowPendingVisibility"),
  ALLOWPRESSUREDEFER: stryMutAct_9fa48("61792") ? "" : (stryCov_9fa48("61792"), "allowPressureDefer"),
  ALLOWPRESSUREDEGRADE: stryMutAct_9fa48("61793") ? "" : (stryCov_9fa48("61793"), "allowPressureDegrade"),
  ALLOWSQLFALLBACK: stryMutAct_9fa48("61794") ? "" : (stryCov_9fa48("61794"), "allowSqlFallback"),
  CANCELLATIONTOKEN: stryMutAct_9fa48("61795") ? "" : (stryCov_9fa48("61795"), "cancellationToken"),
  COALESCINGKEY: stryMutAct_9fa48("61796") ? "" : (stryCov_9fa48("61796"), "coalescingKey"),
  CONTROL_DASH_PLANE_COLON_READ: stryMutAct_9fa48("61797") ? "" : (stryCov_9fa48("61797"), "control-plane:read"),
  CONTROL_DASH_PLANE_DASH_MUTATION: stryMutAct_9fa48("61798") ? "" : (stryCov_9fa48("61798"), "control-plane-mutation"),
  CONTROL_DASH_PLANE_DASH_QUERY: stryMutAct_9fa48("61799") ? "" : (stryCov_9fa48("61799"), "control-plane-query"),
  CONTROL_DASH_PLANE_DASH_READ: stryMutAct_9fa48("61800") ? "" : (stryCov_9fa48("61800"), "control-plane-read"),
  CONTROL_PLANE_MUTATION_TRACKING_SATURATED: stryMutAct_9fa48("61801") ? "" : (stryCov_9fa48("61801"), "control_plane_mutation_tracking_saturated"),
  CRITICAL: stryMutAct_9fa48("61802") ? "" : (stryCov_9fa48("61802"), "critical"),
  DELETE: stryMutAct_9fa48("61803") ? "" : (stryCov_9fa48("61803"), "delete"),
  DELIVERYPRIORITY: stryMutAct_9fa48("61804") ? "" : (stryCov_9fa48("61804"), "deliveryPriority"),
  EXPECTEDCACHEFIELDS: stryMutAct_9fa48("61805") ? "" : (stryCov_9fa48("61805"), "expectedCacheFields"),
  FALLBACKPHASE: stryMutAct_9fa48("61806") ? "" : (stryCov_9fa48("61806"), "fallbackPhase"),
  IGNOREEXISTING: stryMutAct_9fa48("61807") ? "" : (stryCov_9fa48("61807"), "ignoreExisting"),
  INSERT: stryMutAct_9fa48("61808") ? "" : (stryCov_9fa48("61808"), "insert"),
  LOCAL_PARTITION_REPLICA: stryMutAct_9fa48("61809") ? "" : (stryCov_9fa48("61809"), "local_partition_replica"),
  MAXOBSERVEDMUTATIONLATENCYMS: stryMutAct_9fa48("61810") ? "" : (stryCov_9fa48("61810"), "maxObservedMutationLatencyMs"),
  MAXOBSERVEDREADLATENCYMS: stryMutAct_9fa48("61811") ? "" : (stryCov_9fa48("61811"), "maxObservedReadLatencyMs"),
  MERGEPOLICY: stryMutAct_9fa48("61812") ? "" : (stryCov_9fa48("61812"), "mergePolicy"),
  MINIMUMCACHEFIELDS: stryMutAct_9fa48("61813") ? "" : (stryCov_9fa48("61813"), "minimumCacheFields"),
  MUTATION: stryMutAct_9fa48("61814") ? "" : (stryCov_9fa48("61814"), "mutation"),
  MUTATIONOUTCOMECOUNTS: stryMutAct_9fa48("61815") ? "" : (stryCov_9fa48("61815"), "mutationOutcomeCounts"),
  MUTATIONREPLACEPENDINGQUEUEDCOUNT: stryMutAct_9fa48("61816") ? "" : (stryCov_9fa48("61816"), "mutationReplacePendingQueuedCount"),
  MUTATIONREPLACEPENDINGSUPERSEDEDCOUNT: stryMutAct_9fa48("61817") ? "" : (stryCov_9fa48("61817"), "mutationReplacePendingSupersededCount"),
  MUTATIONTRACKINGREJECTEDCOUNT: stryMutAct_9fa48("61818") ? "" : (stryCov_9fa48("61818"), "mutationTrackingRejectedCount"),
  ONE: 1,
  OWNER_RPC_LANE: stryMutAct_9fa48("61819") ? "" : (stryCov_9fa48("61819"), "owner_rpc_lane"),
  PARTITION: stryMutAct_9fa48("61820") ? "" : (stryCov_9fa48("61820"), "partition"),
  PHASESCOPE: stryMutAct_9fa48("61821") ? "" : (stryCov_9fa48("61821"), "phaseScope"),
  PREFERAUTHORITATIVEREAD: stryMutAct_9fa48("61822") ? "" : (stryCov_9fa48("61822"), "preferAuthoritativeRead"),
  PREFEROWNERRPCREAD: stryMutAct_9fa48("61823") ? "" : (stryCov_9fa48("61823"), "preferOwnerRpcRead"),
  PRESSURERETRYAFTERMS: stryMutAct_9fa48("61824") ? "" : (stryCov_9fa48("61824"), "pressureRetryAfterMs"),
  QUERY: stryMutAct_9fa48("61825") ? "" : (stryCov_9fa48("61825"), "query"),
  READ: stryMutAct_9fa48("61826") ? "" : (stryCov_9fa48("61826"), "read"),
  READOUTCOMECOUNTS: stryMutAct_9fa48("61827") ? "" : (stryCov_9fa48("61827"), "readOutcomeCounts"),
  REQUIREAUTHORITATIVE: stryMutAct_9fa48("61828") ? "" : (stryCov_9fa48("61828"), "requireAuthoritative"),
  REQUIREOWNERRPCREAD: stryMutAct_9fa48("61829") ? "" : (stryCov_9fa48("61829"), "requireOwnerRpcRead"),
  ROUTER_QUERY_TRANSPORT_NOT_READY: stryMutAct_9fa48("61830") ? "" : (stryCov_9fa48("61830"), "ROUTER_QUERY_TRANSPORT_NOT_READY"),
  ROUTINGREADINESSDIMENSION: stryMutAct_9fa48("61831") ? "" : (stryCov_9fa48("61831"), "routingReadinessDimension"),
  SELECT: stryMutAct_9fa48("61832") ? "" : (stryCov_9fa48("61832"), "select"),
  SESSIONID: stryMutAct_9fa48("61833") ? "" : (stryCov_9fa48("61833"), "sessionId"),
  SKIPCACHEWAIT: stryMutAct_9fa48("61834") ? "" : (stryCov_9fa48("61834"), "skipCacheWait"),
  SYSTEM_TABLE_CACHE_UNAVAILABLE: stryMutAct_9fa48("61835") ? "" : (stryCov_9fa48("61835"), "system_table_cache_unavailable"),
  TIMEOUTBUDGET: stryMutAct_9fa48("61836") ? "" : (stryCov_9fa48("61836"), "timeoutBudget"),
  UNKNOWN: stryMutAct_9fa48("61837") ? "" : (stryCov_9fa48("61837"), "unknown"),
  UPDATE: stryMutAct_9fa48("61838") ? "" : (stryCov_9fa48("61838"), "update"),
  VISIBLE: stryMutAct_9fa48("61839") ? "" : (stryCov_9fa48("61839"), "visible"),
  WORKCLASS: stryMutAct_9fa48("61840") ? "" : (stryCov_9fa48("61840"), "workClass"),
  WRITE: stryMutAct_9fa48("61841") ? "" : (stryCov_9fa48("61841"), "write"),
  ZERO: 0
}));
const CONTROL_PLANE_LOCAL_READ_CONSISTENCY = stryMutAct_9fa48("61842") ? "" : (stryCov_9fa48("61842"), 'local_leader');
const CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY = stryMutAct_9fa48("61843") ? "" : (stryCov_9fa48("61843"), 'any_replica');
const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR = Object.freeze(stryMutAct_9fa48("61844") ? {} : (stryCov_9fa48("61844"), {
  AUTHORITATIVE_READ_OWNER_UNAVAILABLE: stryMutAct_9fa48("61845") ? "" : (stryCov_9fa48("61845"), 'authoritative_read_owner_unavailable'),
  BOOTSTRAP_SNAPSHOT_PHASE_SCOPE_REQUIRED: stryMutAct_9fa48("61846") ? "" : (stryCov_9fa48("61846"), 'bootstrap_snapshot_phase_scope_required'),
  BOOTSTRAP_SNAPSHOT_UNAVAILABLE: stryMutAct_9fa48("61847") ? "" : (stryCov_9fa48("61847"), 'bootstrap_snapshot_unavailable'),
  SQL_QUERY_ENGINE_UNAVAILABLE: stryMutAct_9fa48("61848") ? "" : (stryCov_9fa48("61848"), 'sql_query_engine_unavailable')
}));
const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE = Object.freeze(stryMutAct_9fa48("61849") ? {} : (stryCov_9fa48("61849"), {
  SQL_QUERY_ENGINE: stryMutAct_9fa48("61850") ? "" : (stryCov_9fa48("61850"), 'sql_query_engine')
}));
const CONTROL_PLANE_OPERATION_LEDGER_LIMIT = 256;
const CONTROL_PLANE_READ_STRATEGY = Object.freeze(stryMutAct_9fa48("61851") ? {} : (stryCov_9fa48("61851"), {
  CACHE: stryMutAct_9fa48("61852") ? "" : (stryCov_9fa48("61852"), 'cache'),
  AUTHORITATIVE: stryMutAct_9fa48("61853") ? "" : (stryCov_9fa48("61853"), 'authoritative'),
  AUTHORITATIVE_REQUIRED: stryMutAct_9fa48("61854") ? "" : (stryCov_9fa48("61854"), 'authoritative_required'),
  OWNER_LOCAL_NON_PROPAGATED: stryMutAct_9fa48("61855") ? "" : (stryCov_9fa48("61855"), 'owner_local_non_propagated'),
  BOOTSTRAP_SNAPSHOT: stryMutAct_9fa48("61856") ? "" : (stryCov_9fa48("61856"), 'bootstrap_snapshot')
}));
const CONTROL_PLANE_READ_PROFILE = Object.freeze(stryMutAct_9fa48("61857") ? {} : (stryCov_9fa48("61857"), {
  DIAGNOSTICS: stryMutAct_9fa48("61858") ? "" : (stryCov_9fa48("61858"), 'diagnostics'),
  PLANNING: stryMutAct_9fa48("61859") ? "" : (stryCov_9fa48("61859"), 'planning'),
  REPAIR_REQUIRED: stryMutAct_9fa48("61860") ? "" : (stryCov_9fa48("61860"), 'repair_required'),
  TABLE_LIFECYCLE: stryMutAct_9fa48("61861") ? "" : (stryCov_9fa48("61861"), 'table_lifecycle')
}));
const CONTROL_PLANE_PHASE_SCOPE = Object.freeze(stryMutAct_9fa48("61862") ? {} : (stryCov_9fa48("61862"), {
  BOOTSTRAP: stryMutAct_9fa48("61863") ? "" : (stryCov_9fa48("61863"), 'bootstrap'),
  JOIN: stryMutAct_9fa48("61864") ? "" : (stryCov_9fa48("61864"), 'join')
}));
const CONTROL_PLANE_READ_OUTCOME = Object.freeze(stryMutAct_9fa48("61865") ? {} : (stryCov_9fa48("61865"), {
  CACHE_HIT: stryMutAct_9fa48("61866") ? "" : (stryCov_9fa48("61866"), 'cache_hit'),
  AUTHORITATIVE: stryMutAct_9fa48("61867") ? "" : (stryCov_9fa48("61867"), 'authoritative'),
  OWNER_LOCAL_NON_PROPAGATED: stryMutAct_9fa48("61868") ? "" : (stryCov_9fa48("61868"), 'owner_local_non_propagated'),
  BOOTSTRAP_SNAPSHOT: stryMutAct_9fa48("61869") ? "" : (stryCov_9fa48("61869"), 'bootstrap_snapshot'),
  DEFERRED: stryMutAct_9fa48("61870") ? "" : (stryCov_9fa48("61870"), 'deferred'),
  REJECTED: stryMutAct_9fa48("61871") ? "" : (stryCov_9fa48("61871"), 'rejected'),
  STALE_NOT_ALLOWED: stryMutAct_9fa48("61872") ? "" : (stryCov_9fa48("61872"), 'stale_not_allowed'),
  OWNER_NOT_READY: stryMutAct_9fa48("61873") ? "" : (stryCov_9fa48("61873"), 'owner_not_ready')
}));
const CONTROL_PLANE_MUTATION_OUTCOME = Object.freeze(stryMutAct_9fa48("61874") ? {} : (stryCov_9fa48("61874"), {
  APPLIED: stryMutAct_9fa48("61875") ? "" : (stryCov_9fa48("61875"), 'applied'),
  NO_OP: stryMutAct_9fa48("61876") ? "" : (stryCov_9fa48("61876"), 'no_op'),
  PENDING_VISIBILITY: stryMutAct_9fa48("61877") ? "" : (stryCov_9fa48("61877"), 'pending_visibility'),
  DEFERRED: stryMutAct_9fa48("61878") ? "" : (stryCov_9fa48("61878"), 'deferred'),
  REJECTED: stryMutAct_9fa48("61879") ? "" : (stryCov_9fa48("61879"), 'rejected'),
  OWNER_NOT_READY: stryMutAct_9fa48("61880") ? "" : (stryCov_9fa48("61880"), 'owner_not_ready'),
  OBSERVED_STATE_CHANGED: stryMutAct_9fa48("61881") ? "" : (stryCov_9fa48("61881"), 'observed_state_changed')
}));
const CONTROL_PLANE_SQL_OPERATION = Object.freeze(stryMutAct_9fa48("61882") ? {} : (stryCov_9fa48("61882"), {
  READ: stryMutAct_9fa48("61883") ? "" : (stryCov_9fa48("61883"), 'read'),
  WRITE: stryMutAct_9fa48("61884") ? "" : (stryCov_9fa48("61884"), 'write'),
  UNKNOWN: stryMutAct_9fa48("61885") ? "" : (stryCov_9fa48("61885"), 'unknown')
}));
const CONTROL_PLANE_MUTATION_OPERATION = Object.freeze(stryMutAct_9fa48("61886") ? {} : (stryCov_9fa48("61886"), {
  INSERT: stryMutAct_9fa48("61887") ? "" : (stryCov_9fa48("61887"), 'insert'),
  UPDATE: stryMutAct_9fa48("61888") ? "" : (stryCov_9fa48("61888"), 'update'),
  UPSERT: stryMutAct_9fa48("61889") ? "" : (stryCov_9fa48("61889"), 'upsert'),
  DELETE: stryMutAct_9fa48("61890") ? "" : (stryCov_9fa48("61890"), 'delete')
}));
const CONTROL_PLANE_MUTATION_MERGE_POLICY = Object.freeze(stryMutAct_9fa48("61891") ? {} : (stryCov_9fa48("61891"), {
  NONE: stryMutAct_9fa48("61892") ? "" : (stryCov_9fa48("61892"), 'none'),
  SINGLE_FLIGHT: stryMutAct_9fa48("61893") ? "" : (stryCov_9fa48("61893"), 'single_flight'),
  REPLACE_PENDING: stryMutAct_9fa48("61894") ? "" : (stryCov_9fa48("61894"), 'replace_pending')
}));
const CONTROL_PLANE_GATEWAY_LIMIT = Object.freeze(stryMutAct_9fa48("61895") ? {} : (stryCov_9fa48("61895"), {
  MAX_TRACKED_READ_REQUESTS: 512,
  MAX_TRACKED_QUERY_REQUESTS: 512,
  MAX_TRACKED_MUTATION_REQUESTS: 512,
  MAX_PENDING_REPLACE_MUTATION_REQUESTS: 512
}));
const CONTROL_PLANE_GATEWAY_ERROR_CODE = Object.freeze(stryMutAct_9fa48("61896") ? {} : (stryCov_9fa48("61896"), {
  MUTATION_TRACKING_SATURATED: stryMutAct_9fa48("61897") ? "" : (stryCov_9fa48("61897"), 'CONTROL_PLANE_MUTATION_TRACKING_SATURATED')
}));
const GATEWAY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("61898") ? {} : (stryCov_9fa48("61898"), {
  CDC_REQUIRED: stryMutAct_9fa48("61899") ? "" : (stryCov_9fa48("61899"), 'ControlPlaneSystemTableGateway requires cdcIntegrationService'),
  SQL_ENGINE_REQUIRED: stryMutAct_9fa48("61900") ? "" : (stryCov_9fa48("61900"), 'ControlPlaneSystemTableGateway requires sqlQueryEngine'),
  MUTATION_OPERATION_REQUIRED: stryMutAct_9fa48("61901") ? "" : (stryCov_9fa48("61901"), 'ControlPlaneSystemTableGateway requires a supported mutation operation'),
  MUTATION_TABLE_REQUIRED: stryMutAct_9fa48("61902") ? "" : (stryCov_9fa48("61902"), 'ControlPlaneSystemTableGateway requires a valid system table name'),
  MUTATION_ROW_REQUIRED: stryMutAct_9fa48("61903") ? "" : (stryCov_9fa48("61903"), 'ControlPlaneSystemTableGateway requires row data for insert/upsert'),
  MUTATION_WHERE_REQUIRED: stryMutAct_9fa48("61904") ? "" : (stryCov_9fa48("61904"), 'ControlPlaneSystemTableGateway requires whereClause for update/delete'),
  MUTATION_DATA_REQUIRED: stryMutAct_9fa48("61905") ? "" : (stryCov_9fa48("61905"), 'ControlPlaneSystemTableGateway requires update data for update')
}));
const GATEWAY_LOG_MSG = Object.freeze(stryMutAct_9fa48("61906") ? {} : (stryCov_9fa48("61906"), {
  READ_DEFERRED: stryMutAct_9fa48("61907") ? "" : (stryCov_9fa48("61907"), 'Control-plane metadata read deferred'),
  READ_REJECTED: stryMutAct_9fa48("61908") ? "" : (stryCov_9fa48("61908"), 'Control-plane metadata read rejected'),
  MUTATION_DEFERRED: stryMutAct_9fa48("61909") ? "" : (stryCov_9fa48("61909"), 'Control-plane metadata mutation deferred'),
  MUTATION_REJECTED: stryMutAct_9fa48("61910") ? "" : (stryCov_9fa48("61910"), 'Control-plane metadata mutation rejected')
}));
const SYSTEM_TABLE_NAMES = new Set(Object.values(SYSTEM_TABLE_NAME));
function normalizeCoalescingToken(value) {
  if (stryMutAct_9fa48("61911")) {
    {}
  } else {
    stryCov_9fa48("61911");
    return (stryMutAct_9fa48("61914") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("61913") ? false : stryMutAct_9fa48("61912") ? true : (stryCov_9fa48("61912", "61913", "61914"), (stryMutAct_9fa48("61916") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("61915") ? true : (stryCov_9fa48("61915", "61916"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("61919") ? value.length <= NUM.ZERO : stryMutAct_9fa48("61918") ? value.length >= NUM.ZERO : stryMutAct_9fa48("61917") ? true : (stryCov_9fa48("61917", "61918", "61919"), value.length > NUM.ZERO)))) ? value : null;
  }
}
function sortObjectKeys(value) {
  if (stryMutAct_9fa48("61920")) {
    {}
  } else {
    stryCov_9fa48("61920");
    if (stryMutAct_9fa48("61922") ? false : stryMutAct_9fa48("61921") ? true : (stryCov_9fa48("61921", "61922"), Array.isArray(value))) {
      if (stryMutAct_9fa48("61923")) {
        {}
      } else {
        stryCov_9fa48("61923");
        return value.map(stryMutAct_9fa48("61924") ? () => undefined : (stryCov_9fa48("61924"), entry => sortObjectKeys(entry)));
      }
    }
    if (stryMutAct_9fa48("61927") ? !value && typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("61926") ? false : stryMutAct_9fa48("61925") ? true : (stryCov_9fa48("61925", "61926", "61927"), (stryMutAct_9fa48("61928") ? value : (stryCov_9fa48("61928"), !value)) || (stryMutAct_9fa48("61930") ? typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("61929") ? false : (stryCov_9fa48("61929", "61930"), typeof value !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("61931")) {
        {}
      } else {
        stryCov_9fa48("61931");
        return value;
      }
    }
    return stryMutAct_9fa48("61932") ? Object.keys(value).reduce((accumulator, key) => {
      accumulator[key] = sortObjectKeys(value[key]);
      return accumulator;
    }, {}) : (stryCov_9fa48("61932"), Object.keys(value).sort().reduce((accumulator, key) => {
      if (stryMutAct_9fa48("61933")) {
        {}
      } else {
        stryCov_9fa48("61933");
        accumulator[key] = sortObjectKeys(value[key]);
        return accumulator;
      }
    }, {}));
  }
}
function stableSerialize(value) {
  if (stryMutAct_9fa48("61934")) {
    {}
  } else {
    stryCov_9fa48("61934");
    return JSON.stringify(sortObjectKeys(value));
  }
}
function normalizeSystemTableName(value) {
  if (stryMutAct_9fa48("61935")) {
    {}
  } else {
    stryCov_9fa48("61935");
    if (stryMutAct_9fa48("61938") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("61937") ? false : stryMutAct_9fa48("61936") ? true : (stryCov_9fa48("61936", "61937", "61938"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("61939")) {
        {}
      } else {
        stryCov_9fa48("61939");
        return null;
      }
    }
    const normalized = stryMutAct_9fa48("61941") ? value.toLowerCase() : stryMutAct_9fa48("61940") ? value.trim().toUpperCase() : (stryCov_9fa48("61940", "61941"), value.trim().toLowerCase());
    return SYSTEM_TABLE_NAMES.has(normalized) ? normalized : null;
  }
}
function normalizePhaseScope(value) {
  if (stryMutAct_9fa48("61942")) {
    {}
  } else {
    stryCov_9fa48("61942");
    if (stryMutAct_9fa48("61945") ? value !== CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP : stryMutAct_9fa48("61944") ? false : stryMutAct_9fa48("61943") ? true : (stryCov_9fa48("61943", "61944", "61945"), value === CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP)) {
      if (stryMutAct_9fa48("61946")) {
        {}
      } else {
        stryCov_9fa48("61946");
        return CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP;
      }
    }
    if (stryMutAct_9fa48("61949") ? value !== CONTROL_PLANE_PHASE_SCOPE.JOIN : stryMutAct_9fa48("61948") ? false : stryMutAct_9fa48("61947") ? true : (stryCov_9fa48("61947", "61948", "61949"), value === CONTROL_PLANE_PHASE_SCOPE.JOIN)) {
      if (stryMutAct_9fa48("61950")) {
        {}
      } else {
        stryCov_9fa48("61950");
        return CONTROL_PLANE_PHASE_SCOPE.JOIN;
      }
    }
    return null;
  }
}
function extractSystemTableNameFromSql(sql) {
  if (stryMutAct_9fa48("61951")) {
    {}
  } else {
    stryCov_9fa48("61951");
    if (stryMutAct_9fa48("61954") ? typeof sql !== TYPEOF.STRING && sql.trim().length === NUM.ZERO : stryMutAct_9fa48("61953") ? false : stryMutAct_9fa48("61952") ? true : (stryCov_9fa48("61952", "61953", "61954"), (stryMutAct_9fa48("61956") ? typeof sql === TYPEOF.STRING : stryMutAct_9fa48("61955") ? false : (stryCov_9fa48("61955", "61956"), typeof sql !== TYPEOF.STRING)) || (stryMutAct_9fa48("61958") ? sql.trim().length !== NUM.ZERO : stryMutAct_9fa48("61957") ? false : (stryCov_9fa48("61957", "61958"), (stryMutAct_9fa48("61959") ? sql.length : (stryCov_9fa48("61959"), sql.trim().length)) === NUM.ZERO)))) {
      if (stryMutAct_9fa48("61960")) {
        {}
      } else {
        stryCov_9fa48("61960");
        return null;
      }
    }
    const normalizedSql = stryMutAct_9fa48("61961") ? sql : (stryCov_9fa48("61961"), sql.trim());
    for (const matcher of stryMutAct_9fa48("61962") ? [] : (stryCov_9fa48("61962"), [stryMutAct_9fa48("61975") ? /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\W]*)/i : stryMutAct_9fa48("61974") ? /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][^\w]*)/i : stryMutAct_9fa48("61973") ? /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w])/i : stryMutAct_9fa48("61972") ? /^\s*select\b[\s\S]*?\bfrom\s+([^a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61971") ? /^\s*select\b[\s\S]*?\bfrom\S+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61970") ? /^\s*select\b[\s\S]*?\bfrom\s([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61969") ? /^\s*select\b[\s\s]*?\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61968") ? /^\s*select\b[\S\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61967") ? /^\s*select\b[^\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61966") ? /^\s*select\b[\s\S]\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61965") ? /^\S*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61964") ? /^\sselect\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61963") ? /\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i : (stryCov_9fa48("61963", "61964", "61965", "61966", "61967", "61968", "61969", "61970", "61971", "61972", "61973", "61974", "61975"), /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i), stryMutAct_9fa48("61991") ? /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\W]*)/i : stryMutAct_9fa48("61990") ? /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][^\w]*)/i : stryMutAct_9fa48("61989") ? /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w])/i : stryMutAct_9fa48("61988") ? /^\s*insert(?:\s+or\s+replace)?\s+into\s+([^a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61987") ? /^\s*insert(?:\s+or\s+replace)?\s+into\S+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61986") ? /^\s*insert(?:\s+or\s+replace)?\s+into\s([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61985") ? /^\s*insert(?:\s+or\s+replace)?\S+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61984") ? /^\s*insert(?:\s+or\s+replace)?\sinto\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61983") ? /^\s*insert(?:\s+or\S+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61982") ? /^\s*insert(?:\s+or\sreplace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61981") ? /^\s*insert(?:\S+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61980") ? /^\s*insert(?:\sor\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61979") ? /^\s*insert(?:\s+or\s+replace)\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61978") ? /^\S*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61977") ? /^\sinsert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61976") ? /\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : (stryCov_9fa48("61976", "61977", "61978", "61979", "61980", "61981", "61982", "61983", "61984", "61985", "61986", "61987", "61988", "61989", "61990", "61991"), /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i), stryMutAct_9fa48("62000") ? /^\s*update\s+([a-zA-Z_][\W]*)/i : stryMutAct_9fa48("61999") ? /^\s*update\s+([a-zA-Z_][^\w]*)/i : stryMutAct_9fa48("61998") ? /^\s*update\s+([a-zA-Z_][\w])/i : stryMutAct_9fa48("61997") ? /^\s*update\s+([^a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61996") ? /^\s*update\S+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61995") ? /^\s*update\s([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61994") ? /^\S*update\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61993") ? /^\supdate\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("61992") ? /\s*update\s+([a-zA-Z_][\w]*)/i : (stryCov_9fa48("61992", "61993", "61994", "61995", "61996", "61997", "61998", "61999", "62000"), /^\s*update\s+([a-zA-Z_][\w]*)/i), stryMutAct_9fa48("62011") ? /^\s*delete\s+from\s+([a-zA-Z_][\W]*)/i : stryMutAct_9fa48("62010") ? /^\s*delete\s+from\s+([a-zA-Z_][^\w]*)/i : stryMutAct_9fa48("62009") ? /^\s*delete\s+from\s+([a-zA-Z_][\w])/i : stryMutAct_9fa48("62008") ? /^\s*delete\s+from\s+([^a-zA-Z_][\w]*)/i : stryMutAct_9fa48("62007") ? /^\s*delete\s+from\S+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("62006") ? /^\s*delete\s+from\s([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("62005") ? /^\s*delete\S+from\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("62004") ? /^\s*delete\sfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("62003") ? /^\S*delete\s+from\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("62002") ? /^\sdelete\s+from\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("62001") ? /\s*delete\s+from\s+([a-zA-Z_][\w]*)/i : (stryCov_9fa48("62001", "62002", "62003", "62004", "62005", "62006", "62007", "62008", "62009", "62010", "62011"), /^\s*delete\s+from\s+([a-zA-Z_][\w]*)/i)])) {
      if (stryMutAct_9fa48("62012")) {
        {}
      } else {
        stryCov_9fa48("62012");
        const match = normalizedSql.match(matcher);
        if (stryMutAct_9fa48("62015") ? match[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE] : stryMutAct_9fa48("62014") ? false : stryMutAct_9fa48("62013") ? true : (stryCov_9fa48("62013", "62014", "62015"), match?.[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE])) {
          if (stryMutAct_9fa48("62016")) {
            {}
          } else {
            stryCov_9fa48("62016");
            return normalizeSystemTableName(match[CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE]);
          }
        }
      }
    }
    return null;
  }
}
function normalizeSqlOperationKind(value) {
  if (stryMutAct_9fa48("62017")) {
    {}
  } else {
    stryCov_9fa48("62017");
    if (stryMutAct_9fa48("62020") ? value !== CONTROL_PLANE_SQL_OPERATION.READ : stryMutAct_9fa48("62019") ? false : stryMutAct_9fa48("62018") ? true : (stryCov_9fa48("62018", "62019", "62020"), value === CONTROL_PLANE_SQL_OPERATION.READ)) {
      if (stryMutAct_9fa48("62021")) {
        {}
      } else {
        stryCov_9fa48("62021");
        return CONTROL_PLANE_SQL_OPERATION.READ;
      }
    }
    if (stryMutAct_9fa48("62024") ? value !== CONTROL_PLANE_SQL_OPERATION.WRITE : stryMutAct_9fa48("62023") ? false : stryMutAct_9fa48("62022") ? true : (stryCov_9fa48("62022", "62023", "62024"), value === CONTROL_PLANE_SQL_OPERATION.WRITE)) {
      if (stryMutAct_9fa48("62025")) {
        {}
      } else {
        stryCov_9fa48("62025");
        return CONTROL_PLANE_SQL_OPERATION.WRITE;
      }
    }
    return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
  }
}
function normalizeMutationOperation(value) {
  if (stryMutAct_9fa48("62026")) {
    {}
  } else {
    stryCov_9fa48("62026");
    if (stryMutAct_9fa48("62029") ? value !== CONTROL_PLANE_MUTATION_OPERATION.INSERT : stryMutAct_9fa48("62028") ? false : stryMutAct_9fa48("62027") ? true : (stryCov_9fa48("62027", "62028", "62029"), value === CONTROL_PLANE_MUTATION_OPERATION.INSERT)) {
      if (stryMutAct_9fa48("62030")) {
        {}
      } else {
        stryCov_9fa48("62030");
        return CONTROL_PLANE_MUTATION_OPERATION.INSERT;
      }
    }
    if (stryMutAct_9fa48("62033") ? value !== CONTROL_PLANE_MUTATION_OPERATION.UPDATE : stryMutAct_9fa48("62032") ? false : stryMutAct_9fa48("62031") ? true : (stryCov_9fa48("62031", "62032", "62033"), value === CONTROL_PLANE_MUTATION_OPERATION.UPDATE)) {
      if (stryMutAct_9fa48("62034")) {
        {}
      } else {
        stryCov_9fa48("62034");
        return CONTROL_PLANE_MUTATION_OPERATION.UPDATE;
      }
    }
    if (stryMutAct_9fa48("62037") ? value !== CONTROL_PLANE_MUTATION_OPERATION.UPSERT : stryMutAct_9fa48("62036") ? false : stryMutAct_9fa48("62035") ? true : (stryCov_9fa48("62035", "62036", "62037"), value === CONTROL_PLANE_MUTATION_OPERATION.UPSERT)) {
      if (stryMutAct_9fa48("62038")) {
        {}
      } else {
        stryCov_9fa48("62038");
        return CONTROL_PLANE_MUTATION_OPERATION.UPSERT;
      }
    }
    if (stryMutAct_9fa48("62041") ? value !== CONTROL_PLANE_MUTATION_OPERATION.DELETE : stryMutAct_9fa48("62040") ? false : stryMutAct_9fa48("62039") ? true : (stryCov_9fa48("62039", "62040", "62041"), value === CONTROL_PLANE_MUTATION_OPERATION.DELETE)) {
      if (stryMutAct_9fa48("62042")) {
        {}
      } else {
        stryCov_9fa48("62042");
        return CONTROL_PLANE_MUTATION_OPERATION.DELETE;
      }
    }
    return null;
  }
}
function normalizeMutationMergePolicy(value) {
  if (stryMutAct_9fa48("62043")) {
    {}
  } else {
    stryCov_9fa48("62043");
    if (stryMutAct_9fa48("62046") ? value !== CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE : stryMutAct_9fa48("62045") ? false : stryMutAct_9fa48("62044") ? true : (stryCov_9fa48("62044", "62045", "62046"), value === CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE)) {
      if (stryMutAct_9fa48("62047")) {
        {}
      } else {
        stryCov_9fa48("62047");
        return CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE;
      }
    }
    if (stryMutAct_9fa48("62050") ? value !== CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT : stryMutAct_9fa48("62049") ? false : stryMutAct_9fa48("62048") ? true : (stryCov_9fa48("62048", "62049", "62050"), value === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT)) {
      if (stryMutAct_9fa48("62051")) {
        {}
      } else {
        stryCov_9fa48("62051");
        return CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT;
      }
    }
    if (stryMutAct_9fa48("62054") ? value !== CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING : stryMutAct_9fa48("62053") ? false : stryMutAct_9fa48("62052") ? true : (stryCov_9fa48("62052", "62053", "62054"), value === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING)) {
      if (stryMutAct_9fa48("62055")) {
        {}
      } else {
        stryCov_9fa48("62055");
        return CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING;
      }
    }
    return null;
  }
}
function createDeferredPromise() {
  if (stryMutAct_9fa48("62056")) {
    {}
  } else {
    stryCov_9fa48("62056");
    let resolve = null;
    let reject = null;
    const promise = new Promise((promiseResolve, promiseReject) => {
      if (stryMutAct_9fa48("62057")) {
        {}
      } else {
        stryCov_9fa48("62057");
        resolve = promiseResolve;
        reject = promiseReject;
      }
    });
    return stryMutAct_9fa48("62058") ? {} : (stryCov_9fa48("62058"), {
      promise,
      resolve,
      reject
    });
  }
}
function normalizePositiveInteger(value, fallbackValue) {
  if (stryMutAct_9fa48("62059")) {
    {}
  } else {
    stryCov_9fa48("62059");
    return (stryMutAct_9fa48("62062") ? Number.isInteger(value) || value > NUM.ZERO : stryMutAct_9fa48("62061") ? false : stryMutAct_9fa48("62060") ? true : (stryCov_9fa48("62060", "62061", "62062"), Number.isInteger(value) && (stryMutAct_9fa48("62065") ? value <= NUM.ZERO : stryMutAct_9fa48("62064") ? value >= NUM.ZERO : stryMutAct_9fa48("62063") ? true : (stryCov_9fa48("62063", "62064", "62065"), value > NUM.ZERO)))) ? value : fallbackValue;
  }
}
function hasUsablePrimaryKeyValue(value) {
  if (stryMutAct_9fa48("62066")) {
    {}
  } else {
    stryCov_9fa48("62066");
    if (stryMutAct_9fa48("62069") ? typeof value === TYPEOF.UNDEFINED && value === null : stryMutAct_9fa48("62068") ? false : stryMutAct_9fa48("62067") ? true : (stryCov_9fa48("62067", "62068", "62069"), (stryMutAct_9fa48("62071") ? typeof value !== TYPEOF.UNDEFINED : stryMutAct_9fa48("62070") ? false : (stryCov_9fa48("62070", "62071"), typeof value === TYPEOF.UNDEFINED)) || (stryMutAct_9fa48("62073") ? value !== null : stryMutAct_9fa48("62072") ? false : (stryCov_9fa48("62072", "62073"), value === null)))) {
      if (stryMutAct_9fa48("62074")) {
        {}
      } else {
        stryCov_9fa48("62074");
        return stryMutAct_9fa48("62075") ? true : (stryCov_9fa48("62075"), false);
      }
    }
    if (stryMutAct_9fa48("62078") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("62077") ? false : stryMutAct_9fa48("62076") ? true : (stryCov_9fa48("62076", "62077", "62078"), typeof value === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("62079")) {
        {}
      } else {
        stryCov_9fa48("62079");
        return stryMutAct_9fa48("62083") ? value.trim().length <= NUM.ZERO : stryMutAct_9fa48("62082") ? value.trim().length >= NUM.ZERO : stryMutAct_9fa48("62081") ? false : stryMutAct_9fa48("62080") ? true : (stryCov_9fa48("62080", "62081", "62082", "62083"), (stryMutAct_9fa48("62084") ? value.length : (stryCov_9fa48("62084"), value.trim().length)) > NUM.ZERO);
      }
    }
    return stryMutAct_9fa48("62085") ? false : (stryCov_9fa48("62085"), true);
  }
}
function normalizeReadStrategy(value) {
  if (stryMutAct_9fa48("62086")) {
    {}
  } else {
    stryCov_9fa48("62086");
    if (stryMutAct_9fa48("62089") ? value !== CONTROL_PLANE_READ_STRATEGY.CACHE : stryMutAct_9fa48("62088") ? false : stryMutAct_9fa48("62087") ? true : (stryCov_9fa48("62087", "62088", "62089"), value === CONTROL_PLANE_READ_STRATEGY.CACHE)) {
      if (stryMutAct_9fa48("62090")) {
        {}
      } else {
        stryCov_9fa48("62090");
        return CONTROL_PLANE_READ_STRATEGY.CACHE;
      }
    }
    if (stryMutAct_9fa48("62093") ? value !== CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE : stryMutAct_9fa48("62092") ? false : stryMutAct_9fa48("62091") ? true : (stryCov_9fa48("62091", "62092", "62093"), value === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE)) {
      if (stryMutAct_9fa48("62094")) {
        {}
      } else {
        stryCov_9fa48("62094");
        return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE;
      }
    }
    if (stryMutAct_9fa48("62097") ? value !== CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED : stryMutAct_9fa48("62096") ? false : stryMutAct_9fa48("62095") ? true : (stryCov_9fa48("62095", "62096", "62097"), value === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED)) {
      if (stryMutAct_9fa48("62098")) {
        {}
      } else {
        stryCov_9fa48("62098");
        return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED;
      }
    }
    if (stryMutAct_9fa48("62101") ? value !== CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED : stryMutAct_9fa48("62100") ? false : stryMutAct_9fa48("62099") ? true : (stryCov_9fa48("62099", "62100", "62101"), value === CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED)) {
      if (stryMutAct_9fa48("62102")) {
        {}
      } else {
        stryCov_9fa48("62102");
        return CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED;
      }
    }
    if (stryMutAct_9fa48("62105") ? value !== CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT : stryMutAct_9fa48("62104") ? false : stryMutAct_9fa48("62103") ? true : (stryCov_9fa48("62103", "62104", "62105"), value === CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT)) {
      if (stryMutAct_9fa48("62106")) {
        {}
      } else {
        stryCov_9fa48("62106");
        return CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT;
      }
    }
    return null;
  }
}
function normalizeReadProfile(value) {
  if (stryMutAct_9fa48("62107")) {
    {}
  } else {
    stryCov_9fa48("62107");
    if (stryMutAct_9fa48("62110") ? value !== CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS : stryMutAct_9fa48("62109") ? false : stryMutAct_9fa48("62108") ? true : (stryCov_9fa48("62108", "62109", "62110"), value === CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS)) {
      if (stryMutAct_9fa48("62111")) {
        {}
      } else {
        stryCov_9fa48("62111");
        return CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS;
      }
    }
    if (stryMutAct_9fa48("62114") ? value !== CONTROL_PLANE_READ_PROFILE.PLANNING : stryMutAct_9fa48("62113") ? false : stryMutAct_9fa48("62112") ? true : (stryCov_9fa48("62112", "62113", "62114"), value === CONTROL_PLANE_READ_PROFILE.PLANNING)) {
      if (stryMutAct_9fa48("62115")) {
        {}
      } else {
        stryCov_9fa48("62115");
        return CONTROL_PLANE_READ_PROFILE.PLANNING;
      }
    }
    if (stryMutAct_9fa48("62118") ? value !== CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED : stryMutAct_9fa48("62117") ? false : stryMutAct_9fa48("62116") ? true : (stryCov_9fa48("62116", "62117", "62118"), value === CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED)) {
      if (stryMutAct_9fa48("62119")) {
        {}
      } else {
        stryCov_9fa48("62119");
        return CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED;
      }
    }
    if (stryMutAct_9fa48("62122") ? value !== CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE : stryMutAct_9fa48("62121") ? false : stryMutAct_9fa48("62120") ? true : (stryCov_9fa48("62120", "62121", "62122"), value === CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE)) {
      if (stryMutAct_9fa48("62123")) {
        {}
      } else {
        stryCov_9fa48("62123");
        return CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE;
      }
    }
    return null;
  }
}
function resolveReadStrategyForProfile(readProfile) {
  if (stryMutAct_9fa48("62124")) {
    {}
  } else {
    stryCov_9fa48("62124");
    if (stryMutAct_9fa48("62127") ? readProfile !== CONTROL_PLANE_READ_PROFILE.PLANNING : stryMutAct_9fa48("62126") ? false : stryMutAct_9fa48("62125") ? true : (stryCov_9fa48("62125", "62126", "62127"), readProfile === CONTROL_PLANE_READ_PROFILE.PLANNING)) {
      if (stryMutAct_9fa48("62128")) {
        {}
      } else {
        stryCov_9fa48("62128");
        return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE;
      }
    }
    if (stryMutAct_9fa48("62131") ? (readProfile === CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS || readProfile === CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED) && readProfile === CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE : stryMutAct_9fa48("62130") ? false : stryMutAct_9fa48("62129") ? true : (stryCov_9fa48("62129", "62130", "62131"), (stryMutAct_9fa48("62133") ? readProfile === CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS && readProfile === CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED : stryMutAct_9fa48("62132") ? false : (stryCov_9fa48("62132", "62133"), (stryMutAct_9fa48("62135") ? readProfile !== CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS : stryMutAct_9fa48("62134") ? false : (stryCov_9fa48("62134", "62135"), readProfile === CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS)) || (stryMutAct_9fa48("62137") ? readProfile !== CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED : stryMutAct_9fa48("62136") ? false : (stryCov_9fa48("62136", "62137"), readProfile === CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED)))) || (stryMutAct_9fa48("62139") ? readProfile !== CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE : stryMutAct_9fa48("62138") ? false : (stryCov_9fa48("62138", "62139"), readProfile === CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE)))) {
      if (stryMutAct_9fa48("62140")) {
        {}
      } else {
        stryCov_9fa48("62140");
        return CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED;
      }
    }
    return null;
  }
}
function applyProfileDefault(options, key, value) {
  if (stryMutAct_9fa48("62141")) {
    {}
  } else {
    stryCov_9fa48("62141");
    if (stryMutAct_9fa48("62144") ? typeof options?.[key] === TYPEOF.UNDEFINED : stryMutAct_9fa48("62143") ? false : stryMutAct_9fa48("62142") ? true : (stryCov_9fa48("62142", "62143", "62144"), typeof (stryMutAct_9fa48("62145") ? options[key] : (stryCov_9fa48("62145"), options?.[key])) !== TYPEOF.UNDEFINED)) {
      if (stryMutAct_9fa48("62146")) {
        {}
      } else {
        stryCov_9fa48("62146");
        return options;
      }
    }
    return stryMutAct_9fa48("62147") ? {} : (stryCov_9fa48("62147"), {
      ...options,
      [key]: value
    });
  }
}
function resolveMutationCompletionState(result = {}) {
  if (stryMutAct_9fa48("62148")) {
    {}
  } else {
    stryCov_9fa48("62148");
    if (stryMutAct_9fa48("62151") ? typeof result?.completionState === TYPEOF.STRING || result.completionState.length > NUM.ZERO : stryMutAct_9fa48("62150") ? false : stryMutAct_9fa48("62149") ? true : (stryCov_9fa48("62149", "62150", "62151"), (stryMutAct_9fa48("62153") ? typeof result?.completionState !== TYPEOF.STRING : stryMutAct_9fa48("62152") ? true : (stryCov_9fa48("62152", "62153"), typeof (stryMutAct_9fa48("62154") ? result.completionState : (stryCov_9fa48("62154"), result?.completionState)) === TYPEOF.STRING)) && (stryMutAct_9fa48("62157") ? result.completionState.length <= NUM.ZERO : stryMutAct_9fa48("62156") ? result.completionState.length >= NUM.ZERO : stryMutAct_9fa48("62155") ? true : (stryCov_9fa48("62155", "62156", "62157"), result.completionState.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("62158")) {
        {}
      } else {
        stryCov_9fa48("62158");
        return result.completionState;
      }
    }
    if (stryMutAct_9fa48("62161") ? typeof result?.visibilityState === TYPEOF.STRING || result.visibilityState !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE : stryMutAct_9fa48("62160") ? false : stryMutAct_9fa48("62159") ? true : (stryCov_9fa48("62159", "62160", "62161"), (stryMutAct_9fa48("62163") ? typeof result?.visibilityState !== TYPEOF.STRING : stryMutAct_9fa48("62162") ? true : (stryCov_9fa48("62162", "62163"), typeof (stryMutAct_9fa48("62164") ? result.visibilityState : (stryCov_9fa48("62164"), result?.visibilityState)) === TYPEOF.STRING)) && (stryMutAct_9fa48("62166") ? result.visibilityState === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE : stryMutAct_9fa48("62165") ? true : (stryCov_9fa48("62165", "62166"), result.visibilityState !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE)))) {
      if (stryMutAct_9fa48("62167")) {
        {}
      } else {
        stryCov_9fa48("62167");
        return CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY;
      }
    }
    if (stryMutAct_9fa48("62170") ? result?.success !== false : stryMutAct_9fa48("62169") ? false : stryMutAct_9fa48("62168") ? true : (stryCov_9fa48("62168", "62169", "62170"), (stryMutAct_9fa48("62171") ? result.success : (stryCov_9fa48("62171"), result?.success)) === (stryMutAct_9fa48("62172") ? true : (stryCov_9fa48("62172"), false)))) {
      if (stryMutAct_9fa48("62173")) {
        {}
      } else {
        stryCov_9fa48("62173");
        return (stryMutAct_9fa48("62176") ? result?.pressureAction !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("62175") ? false : stryMutAct_9fa48("62174") ? true : (stryCov_9fa48("62174", "62175", "62176"), (stryMutAct_9fa48("62177") ? result.pressureAction : (stryCov_9fa48("62177"), result?.pressureAction)) === PRESSURE_GOVERNOR_ACTION.DEFER)) ? CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED : (stryMutAct_9fa48("62180") ? result?.pressureAction !== PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("62179") ? false : stryMutAct_9fa48("62178") ? true : (stryCov_9fa48("62178", "62179", "62180"), (stryMutAct_9fa48("62181") ? result.pressureAction : (stryCov_9fa48("62181"), result?.pressureAction)) === PRESSURE_GOVERNOR_ACTION.REJECT)) ? CONTROL_PLANE_MUTATION_OUTCOME.REJECTED : CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY;
      }
    }
    const affectedRows = Number(stryMutAct_9fa48("62182") ? result?.partitionResult?.affectedRows && result?.affectedRows : (stryCov_9fa48("62182"), (stryMutAct_9fa48("62184") ? result.partitionResult?.affectedRows : stryMutAct_9fa48("62183") ? result?.partitionResult.affectedRows : (stryCov_9fa48("62183", "62184"), result?.partitionResult?.affectedRows)) ?? (stryMutAct_9fa48("62185") ? result.affectedRows : (stryCov_9fa48("62185"), result?.affectedRows))));
    return (stryMutAct_9fa48("62188") ? Number.isFinite(affectedRows) || affectedRows <= NUM.ZERO : stryMutAct_9fa48("62187") ? false : stryMutAct_9fa48("62186") ? true : (stryCov_9fa48("62186", "62187", "62188"), Number.isFinite(affectedRows) && (stryMutAct_9fa48("62191") ? affectedRows > NUM.ZERO : stryMutAct_9fa48("62190") ? affectedRows < NUM.ZERO : stryMutAct_9fa48("62189") ? true : (stryCov_9fa48("62189", "62190", "62191"), affectedRows <= NUM.ZERO)))) ? CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED : CONTROL_PLANE_MUTATION_OUTCOME.APPLIED;
  }
}
function resolveReadProfileOptions(options = {}) {
  if (stryMutAct_9fa48("62192")) {
    {}
  } else {
    stryCov_9fa48("62192");
    const readProfile = normalizeReadProfile(stryMutAct_9fa48("62195") ? options?.readProfile && options?.profile : stryMutAct_9fa48("62194") ? false : stryMutAct_9fa48("62193") ? true : (stryCov_9fa48("62193", "62194", "62195"), (stryMutAct_9fa48("62196") ? options.readProfile : (stryCov_9fa48("62196"), options?.readProfile)) || (stryMutAct_9fa48("62197") ? options.profile : (stryCov_9fa48("62197"), options?.profile))));
    if (stryMutAct_9fa48("62200") ? false : stryMutAct_9fa48("62199") ? true : stryMutAct_9fa48("62198") ? readProfile : (stryCov_9fa48("62198", "62199", "62200"), !readProfile)) {
      if (stryMutAct_9fa48("62201")) {
        {}
      } else {
        stryCov_9fa48("62201");
        return options;
      }
    }
    let resolvedOptions = stryMutAct_9fa48("62202") ? {} : (stryCov_9fa48("62202"), {
      ...options,
      readProfile
    });
    switch (readProfile) {
      case CONTROL_PLANE_READ_PROFILE.DIAGNOSTICS:
        if (stryMutAct_9fa48("62203")) {} else {
          stryCov_9fa48("62203");
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREAUTHORITATIVE, stryMutAct_9fa48("62204") ? false : (stryCov_9fa48("62204"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFEROWNERRPCREAD, stryMutAct_9fa48("62205") ? false : (stryCov_9fa48("62205"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREOWNERRPCREAD, stryMutAct_9fa48("62206") ? false : (stryCov_9fa48("62206"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWSQLFALLBACK, stryMutAct_9fa48("62207") ? true : (stryCov_9fa48("62207"), false));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTINGREADINESSDIMENSION, CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE);
          break;
        }
      case CONTROL_PLANE_READ_PROFILE.PLANNING:
        if (stryMutAct_9fa48("62208")) {} else {
          stryCov_9fa48("62208");
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFERAUTHORITATIVEREAD, stryMutAct_9fa48("62209") ? false : (stryCov_9fa48("62209"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFEROWNERRPCREAD, stryMutAct_9fa48("62210") ? false : (stryCov_9fa48("62210"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREOWNERRPCREAD, stryMutAct_9fa48("62211") ? true : (stryCov_9fa48("62211"), false));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWSQLFALLBACK, stryMutAct_9fa48("62212") ? false : (stryCov_9fa48("62212"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTINGREADINESSDIMENSION, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE);
          break;
        }
      case CONTROL_PLANE_READ_PROFILE.REPAIR_REQUIRED:
        if (stryMutAct_9fa48("62213")) {} else {
          stryCov_9fa48("62213");
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREAUTHORITATIVE, stryMutAct_9fa48("62214") ? false : (stryCov_9fa48("62214"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFEROWNERRPCREAD, stryMutAct_9fa48("62215") ? false : (stryCov_9fa48("62215"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREOWNERRPCREAD, stryMutAct_9fa48("62216") ? true : (stryCov_9fa48("62216"), false));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWSQLFALLBACK, stryMutAct_9fa48("62217") ? false : (stryCov_9fa48("62217"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWPRESSUREDEGRADE, stryMutAct_9fa48("62218") ? true : (stryCov_9fa48("62218"), false));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CRITICAL);
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WORKCLASS, PRESSURE_WORK_CLASS.CRITICAL);
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTINGREADINESSDIMENSION, CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE);
          break;
        }
      case CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE:
        if (stryMutAct_9fa48("62219")) {} else {
          stryCov_9fa48("62219");
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFERAUTHORITATIVEREAD, stryMutAct_9fa48("62220") ? false : (stryCov_9fa48("62220"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PREFEROWNERRPCREAD, stryMutAct_9fa48("62221") ? false : (stryCov_9fa48("62221"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREOWNERRPCREAD, stryMutAct_9fa48("62222") ? true : (stryCov_9fa48("62222"), false));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.REQUIREAUTHORITATIVE, stryMutAct_9fa48("62223") ? false : (stryCov_9fa48("62223"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWSQLFALLBACK, stryMutAct_9fa48("62224") ? false : (stryCov_9fa48("62224"), true));
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CRITICAL);
          resolvedOptions = applyProfileDefault(resolvedOptions, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTINGREADINESSDIMENSION, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE);
          break;
        }
      default:
        if (stryMutAct_9fa48("62225")) {} else {
          stryCov_9fa48("62225");
          break;
        }
    }
    return resolvedOptions;
  }
}
function extractSqlOperationKind(sql) {
  if (stryMutAct_9fa48("62226")) {
    {}
  } else {
    stryCov_9fa48("62226");
    if (stryMutAct_9fa48("62229") ? typeof sql === TYPEOF.STRING : stryMutAct_9fa48("62228") ? false : stryMutAct_9fa48("62227") ? true : (stryCov_9fa48("62227", "62228", "62229"), typeof sql !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("62230")) {
        {}
      } else {
        stryCov_9fa48("62230");
        return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
      }
    }
    const normalizedSql = stryMutAct_9fa48("62232") ? sql.toLowerCase() : stryMutAct_9fa48("62231") ? sql.trim().toUpperCase() : (stryCov_9fa48("62231", "62232"), sql.trim().toLowerCase());
    if (stryMutAct_9fa48("62235") ? normalizedSql.endsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SELECT) : stryMutAct_9fa48("62234") ? false : stryMutAct_9fa48("62233") ? true : (stryCov_9fa48("62233", "62234", "62235"), normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SELECT))) {
      if (stryMutAct_9fa48("62236")) {
        {}
      } else {
        stryCov_9fa48("62236");
        return CONTROL_PLANE_SQL_OPERATION.READ;
      }
    }
    if (stryMutAct_9fa48("62239") ? (normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.INSERT) || normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UPDATE)) && normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELETE) : stryMutAct_9fa48("62238") ? false : stryMutAct_9fa48("62237") ? true : (stryCov_9fa48("62237", "62238", "62239"), (stryMutAct_9fa48("62241") ? normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.INSERT) && normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UPDATE) : stryMutAct_9fa48("62240") ? false : (stryCov_9fa48("62240", "62241"), (stryMutAct_9fa48("62242") ? normalizedSql.endsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.INSERT) : (stryCov_9fa48("62242"), normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.INSERT))) || (stryMutAct_9fa48("62243") ? normalizedSql.endsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UPDATE) : (stryCov_9fa48("62243"), normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UPDATE))))) || (stryMutAct_9fa48("62244") ? normalizedSql.endsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELETE) : (stryCov_9fa48("62244"), normalizedSql.startsWith(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELETE))))) {
      if (stryMutAct_9fa48("62245")) {
        {}
      } else {
        stryCov_9fa48("62245");
        return CONTROL_PLANE_SQL_OPERATION.WRITE;
      }
    }
    return CONTROL_PLANE_SQL_OPERATION.UNKNOWN;
  }
}
function copyOption(target, source, key) {
  if (stryMutAct_9fa48("62246")) {
    {}
  } else {
    stryCov_9fa48("62246");
    if (stryMutAct_9fa48("62249") ? typeof source?.[key] !== TYPEOF.UNDEFINED : stryMutAct_9fa48("62248") ? false : stryMutAct_9fa48("62247") ? true : (stryCov_9fa48("62247", "62248", "62249"), typeof (stryMutAct_9fa48("62250") ? source[key] : (stryCov_9fa48("62250"), source?.[key])) === TYPEOF.UNDEFINED)) {
      if (stryMutAct_9fa48("62251")) {
        {}
      } else {
        stryCov_9fa48("62251");
        return target;
      }
    }
    return stryMutAct_9fa48("62252") ? {} : (stryCov_9fa48("62252"), {
      ...target,
      [key]: source[key]
    });
  }
}
class ControlPlaneSystemTableGateway {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("62253")) {
      {}
    } else {
      stryCov_9fa48("62253");
      this.nodeId = stryMutAct_9fa48("62256") ? options.nodeId && null : stryMutAct_9fa48("62255") ? false : stryMutAct_9fa48("62254") ? true : (stryCov_9fa48("62254", "62255", "62256"), options.nodeId || null);
      this._sqlQueryEngine = stryMutAct_9fa48("62259") ? options.sqlQueryEngine && null : stryMutAct_9fa48("62258") ? false : stryMutAct_9fa48("62257") ? true : (stryCov_9fa48("62257", "62258", "62259"), options.sqlQueryEngine || null);
      this._cdcIntegrationService = stryMutAct_9fa48("62262") ? options.cdcIntegrationService && null : stryMutAct_9fa48("62261") ? false : stryMutAct_9fa48("62260") ? true : (stryCov_9fa48("62260", "62261", "62262"), options.cdcIntegrationService || null);
      this._systemTableCache = stryMutAct_9fa48("62265") ? options.systemTableCache && null : stryMutAct_9fa48("62264") ? false : stryMutAct_9fa48("62263") ? true : (stryCov_9fa48("62263", "62264", "62265"), options.systemTableCache || null);
      this._messageRouter = stryMutAct_9fa48("62268") ? options.messageRouter && null : stryMutAct_9fa48("62267") ? false : stryMutAct_9fa48("62266") ? true : (stryCov_9fa48("62266", "62267", "62268"), options.messageRouter || null);
      this.sqlQueryEngineProvider = (stryMutAct_9fa48("62271") ? typeof options.getSqlQueryEngine !== TYPEOF.FUNCTION : stryMutAct_9fa48("62270") ? false : stryMutAct_9fa48("62269") ? true : (stryCov_9fa48("62269", "62270", "62271"), typeof options.getSqlQueryEngine === TYPEOF.FUNCTION)) ? options.getSqlQueryEngine : null;
      this.cdcIntegrationServiceProvider = (stryMutAct_9fa48("62274") ? typeof options.getCdcIntegrationService !== TYPEOF.FUNCTION : stryMutAct_9fa48("62273") ? false : stryMutAct_9fa48("62272") ? true : (stryCov_9fa48("62272", "62273", "62274"), typeof options.getCdcIntegrationService === TYPEOF.FUNCTION)) ? options.getCdcIntegrationService : null;
      this.systemTableCacheProvider = (stryMutAct_9fa48("62277") ? typeof options.getSystemTableCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("62276") ? false : stryMutAct_9fa48("62275") ? true : (stryCov_9fa48("62275", "62276", "62277"), typeof options.getSystemTableCache === TYPEOF.FUNCTION)) ? options.getSystemTableCache : null;
      this.messageRouterProvider = (stryMutAct_9fa48("62280") ? typeof options.getMessageRouter !== TYPEOF.FUNCTION : stryMutAct_9fa48("62279") ? false : stryMutAct_9fa48("62278") ? true : (stryCov_9fa48("62278", "62279", "62280"), typeof options.getMessageRouter === TYPEOF.FUNCTION)) ? options.getMessageRouter : null;
      this.pressureGovernor = stryMutAct_9fa48("62283") ? options.pressureGovernor && null : stryMutAct_9fa48("62282") ? false : stryMutAct_9fa48("62281") ? true : (stryCov_9fa48("62281", "62282", "62283"), options.pressureGovernor || null);
      this.logger = stryMutAct_9fa48("62286") ? options.logger && null : stryMutAct_9fa48("62285") ? false : stryMutAct_9fa48("62284") ? true : (stryCov_9fa48("62284", "62285", "62286"), options.logger || null);
      this.now = (stryMutAct_9fa48("62289") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("62288") ? false : stryMutAct_9fa48("62287") ? true : (stryCov_9fa48("62287", "62288", "62289"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("62290") ? () => undefined : (stryCov_9fa48("62290"), () => Date.now());
      this.controlPlaneOperationLedger = stryMutAct_9fa48("62293") ? options.controlPlaneOperationLedger && new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(options.controlPlaneOperationLedgerMaxEntries, CONTROL_PLANE_OPERATION_LEDGER_LIMIT),
        now: this.now
      }) : stryMutAct_9fa48("62292") ? false : stryMutAct_9fa48("62291") ? true : (stryCov_9fa48("62291", "62292", "62293"), options.controlPlaneOperationLedger || new ControlPlaneDiagnosticsLedger(stryMutAct_9fa48("62294") ? {} : (stryCov_9fa48("62294"), {
        maxEntries: normalizePositiveInteger(options.controlPlaneOperationLedgerMaxEntries, CONTROL_PLANE_OPERATION_LEDGER_LIMIT),
        now: this.now
      })));
      this.inFlightReadRequestsByKey = new Map();
      this.inFlightQueryRequestsByKey = new Map();
      this.inFlightMutationRequestsByKey = new Map();
      this.pendingReplaceMutationRequestsByKey = new Map();
      this.gatewayLimits = Object.freeze(stryMutAct_9fa48("62295") ? {} : (stryCov_9fa48("62295"), {
        maxTrackedReadRequests: normalizePositiveInteger(options.maxTrackedReadRequests, CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_READ_REQUESTS),
        maxTrackedQueryRequests: normalizePositiveInteger(options.maxTrackedQueryRequests, CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_QUERY_REQUESTS),
        maxTrackedMutationRequests: normalizePositiveInteger(options.maxTrackedMutationRequests, CONTROL_PLANE_GATEWAY_LIMIT.MAX_TRACKED_MUTATION_REQUESTS),
        maxPendingReplaceMutationRequests: normalizePositiveInteger(options.maxPendingReplaceMutationRequests, CONTROL_PLANE_GATEWAY_LIMIT.MAX_PENDING_REPLACE_MUTATION_REQUESTS)
      }));
      this.gatewayMetrics = stryMutAct_9fa48("62296") ? {} : (stryCov_9fa48("62296"), {
        readSingleFlightJoinCount: NUM.ZERO,
        querySingleFlightJoinCount: NUM.ZERO,
        mutationSingleFlightJoinCount: NUM.ZERO,
        readTrackingBypassCount: NUM.ZERO,
        queryTrackingBypassCount: NUM.ZERO,
        mutationReplacePendingQueuedCount: NUM.ZERO,
        mutationReplacePendingSupersededCount: NUM.ZERO,
        mutationTrackingRejectedCount: NUM.ZERO,
        maxObservedInFlightReadRequests: NUM.ZERO,
        maxObservedInFlightQueryRequests: NUM.ZERO,
        maxObservedInFlightMutationRequests: NUM.ZERO,
        maxObservedPendingReplaceMutationRequests: NUM.ZERO,
        maxObservedRetainedRequestCount: NUM.ZERO,
        maxObservedReadLatencyMs: NUM.ZERO,
        maxObservedMutationLatencyMs: NUM.ZERO,
        readOutcomeCounts: Object.create(null),
        mutationOutcomeCounts: Object.create(null)
      });
      this.lastRetentionMetricSignature = null;
      this.recordGatewayRetentionSnapshot();
    }
  }

  /**
   * @param {Object} entry
   * @return {void}
   * @private
   */
  recordControlPlaneOperation(entry = {}) {
    if (stryMutAct_9fa48("62297")) {
      {}
    } else {
      stryCov_9fa48("62297");
      if (stryMutAct_9fa48("62300") ? false : stryMutAct_9fa48("62299") ? true : stryMutAct_9fa48("62298") ? this.controlPlaneOperationLedger : (stryCov_9fa48("62298", "62299", "62300"), !this.controlPlaneOperationLedger)) {
        if (stryMutAct_9fa48("62301")) {
          {}
        } else {
          stryCov_9fa48("62301");
          return;
        }
      }
      this.controlPlaneOperationLedger.append(stryMutAct_9fa48("62302") ? {} : (stryCov_9fa48("62302"), {
        nodeId: stryMutAct_9fa48("62305") ? (entry.nodeId || this.nodeId) && null : stryMutAct_9fa48("62304") ? false : stryMutAct_9fa48("62303") ? true : (stryCov_9fa48("62303", "62304", "62305"), (stryMutAct_9fa48("62307") ? entry.nodeId && this.nodeId : stryMutAct_9fa48("62306") ? false : (stryCov_9fa48("62306", "62307"), entry.nodeId || this.nodeId)) || null),
        ...entry
      }));
    }
  }

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getControlPlaneOperationLedgerEntries(options = {}) {
    if (stryMutAct_9fa48("62308")) {
      {}
    } else {
      stryCov_9fa48("62308");
      return this.controlPlaneOperationLedger ? this.controlPlaneOperationLedger.getEntries(options) : Object.freeze(stryMutAct_9fa48("62309") ? ["Stryker was here"] : (stryCov_9fa48("62309"), []));
    }
  }
  get sqlQueryEngine() {
    if (stryMutAct_9fa48("62310")) {
      {}
    } else {
      stryCov_9fa48("62310");
      const providedSqlQueryEngine = stryMutAct_9fa48("62313") ? this.sqlQueryEngineProvider?.() && null : stryMutAct_9fa48("62312") ? false : stryMutAct_9fa48("62311") ? true : (stryCov_9fa48("62311", "62312", "62313"), (stryMutAct_9fa48("62314") ? this.sqlQueryEngineProvider() : (stryCov_9fa48("62314"), this.sqlQueryEngineProvider?.())) || null);
      return stryMutAct_9fa48("62317") ? (providedSqlQueryEngine || this._sqlQueryEngine) && null : stryMutAct_9fa48("62316") ? false : stryMutAct_9fa48("62315") ? true : (stryCov_9fa48("62315", "62316", "62317"), (stryMutAct_9fa48("62319") ? providedSqlQueryEngine && this._sqlQueryEngine : stryMutAct_9fa48("62318") ? false : (stryCov_9fa48("62318", "62319"), providedSqlQueryEngine || this._sqlQueryEngine)) || null);
    }
  }
  set sqlQueryEngine(sqlQueryEngine) {
    if (stryMutAct_9fa48("62320")) {
      {}
    } else {
      stryCov_9fa48("62320");
      this._sqlQueryEngine = stryMutAct_9fa48("62323") ? sqlQueryEngine && null : stryMutAct_9fa48("62322") ? false : stryMutAct_9fa48("62321") ? true : (stryCov_9fa48("62321", "62322", "62323"), sqlQueryEngine || null);
    }
  }
  get cdcIntegrationService() {
    if (stryMutAct_9fa48("62324")) {
      {}
    } else {
      stryCov_9fa48("62324");
      const providedCdcIntegrationService = stryMutAct_9fa48("62327") ? this.cdcIntegrationServiceProvider?.() && null : stryMutAct_9fa48("62326") ? false : stryMutAct_9fa48("62325") ? true : (stryCov_9fa48("62325", "62326", "62327"), (stryMutAct_9fa48("62328") ? this.cdcIntegrationServiceProvider() : (stryCov_9fa48("62328"), this.cdcIntegrationServiceProvider?.())) || null);
      return stryMutAct_9fa48("62331") ? (providedCdcIntegrationService || this._cdcIntegrationService) && null : stryMutAct_9fa48("62330") ? false : stryMutAct_9fa48("62329") ? true : (stryCov_9fa48("62329", "62330", "62331"), (stryMutAct_9fa48("62333") ? providedCdcIntegrationService && this._cdcIntegrationService : stryMutAct_9fa48("62332") ? false : (stryCov_9fa48("62332", "62333"), providedCdcIntegrationService || this._cdcIntegrationService)) || null);
    }
  }
  set cdcIntegrationService(cdcIntegrationService) {
    if (stryMutAct_9fa48("62334")) {
      {}
    } else {
      stryCov_9fa48("62334");
      this._cdcIntegrationService = stryMutAct_9fa48("62337") ? cdcIntegrationService && null : stryMutAct_9fa48("62336") ? false : stryMutAct_9fa48("62335") ? true : (stryCov_9fa48("62335", "62336", "62337"), cdcIntegrationService || null);
    }
  }
  get systemTableCache() {
    if (stryMutAct_9fa48("62338")) {
      {}
    } else {
      stryCov_9fa48("62338");
      const providedSystemTableCache = stryMutAct_9fa48("62341") ? this.systemTableCacheProvider?.() && null : stryMutAct_9fa48("62340") ? false : stryMutAct_9fa48("62339") ? true : (stryCov_9fa48("62339", "62340", "62341"), (stryMutAct_9fa48("62342") ? this.systemTableCacheProvider() : (stryCov_9fa48("62342"), this.systemTableCacheProvider?.())) || null);
      return stryMutAct_9fa48("62345") ? (providedSystemTableCache || this._systemTableCache) && null : stryMutAct_9fa48("62344") ? false : stryMutAct_9fa48("62343") ? true : (stryCov_9fa48("62343", "62344", "62345"), (stryMutAct_9fa48("62347") ? providedSystemTableCache && this._systemTableCache : stryMutAct_9fa48("62346") ? false : (stryCov_9fa48("62346", "62347"), providedSystemTableCache || this._systemTableCache)) || null);
    }
  }
  set systemTableCache(systemTableCache) {
    if (stryMutAct_9fa48("62348")) {
      {}
    } else {
      stryCov_9fa48("62348");
      this._systemTableCache = stryMutAct_9fa48("62351") ? systemTableCache && null : stryMutAct_9fa48("62350") ? false : stryMutAct_9fa48("62349") ? true : (stryCov_9fa48("62349", "62350", "62351"), systemTableCache || null);
    }
  }
  get messageRouter() {
    if (stryMutAct_9fa48("62352")) {
      {}
    } else {
      stryCov_9fa48("62352");
      const providedMessageRouter = stryMutAct_9fa48("62355") ? this.messageRouterProvider?.() && null : stryMutAct_9fa48("62354") ? false : stryMutAct_9fa48("62353") ? true : (stryCov_9fa48("62353", "62354", "62355"), (stryMutAct_9fa48("62356") ? this.messageRouterProvider() : (stryCov_9fa48("62356"), this.messageRouterProvider?.())) || null);
      return stryMutAct_9fa48("62359") ? (providedMessageRouter || this._messageRouter) && null : stryMutAct_9fa48("62358") ? false : stryMutAct_9fa48("62357") ? true : (stryCov_9fa48("62357", "62358", "62359"), (stryMutAct_9fa48("62361") ? providedMessageRouter && this._messageRouter : stryMutAct_9fa48("62360") ? false : (stryCov_9fa48("62360", "62361"), providedMessageRouter || this._messageRouter)) || null);
    }
  }
  set messageRouter(messageRouter) {
    if (stryMutAct_9fa48("62362")) {
      {}
    } else {
      stryCov_9fa48("62362");
      this._messageRouter = stryMutAct_9fa48("62365") ? messageRouter && null : stryMutAct_9fa48("62364") ? false : stryMutAct_9fa48("62363") ? true : (stryCov_9fa48("62363", "62364", "62365"), messageRouter || null);
    }
  }

  /**
   * @param {Object|null} sqlQueryEngine
   */
  setSqlQueryEngine(sqlQueryEngine) {
    if (stryMutAct_9fa48("62366")) {
      {}
    } else {
      stryCov_9fa48("62366");
      this.sqlQueryEngine = sqlQueryEngine;
    }
  }

  /**
   * @param {Object|null} cdcIntegrationService
   */
  setCdcIntegrationService(cdcIntegrationService) {
    if (stryMutAct_9fa48("62367")) {
      {}
    } else {
      stryCov_9fa48("62367");
      this.cdcIntegrationService = cdcIntegrationService;
    }
  }

  /**
   * @param {Object|null} systemTableCache
   */
  setSystemTableCache(systemTableCache) {
    if (stryMutAct_9fa48("62368")) {
      {}
    } else {
      stryCov_9fa48("62368");
      this.systemTableCache = systemTableCache;
    }
  }

  /**
   * @param {Object|null} messageRouter
   */
  setMessageRouter(messageRouter) {
    if (stryMutAct_9fa48("62369")) {
      {}
    } else {
      stryCov_9fa48("62369");
      this.messageRouter = messageRouter;
    }
  }
  resolveSqlQueryEngine() {
    if (stryMutAct_9fa48("62370")) {
      {}
    } else {
      stryCov_9fa48("62370");
      if (stryMutAct_9fa48("62372") ? false : stryMutAct_9fa48("62371") ? true : (stryCov_9fa48("62371", "62372"), this.sqlQueryEngine)) {
        if (stryMutAct_9fa48("62373")) {
          {}
        } else {
          stryCov_9fa48("62373");
          return this.sqlQueryEngine;
        }
      }
      return stryMutAct_9fa48("62376") ? this.resolveCdcIntegrationService()?.sqlQueryEngine && null : stryMutAct_9fa48("62375") ? false : stryMutAct_9fa48("62374") ? true : (stryCov_9fa48("62374", "62375", "62376"), (stryMutAct_9fa48("62377") ? this.resolveCdcIntegrationService().sqlQueryEngine : (stryCov_9fa48("62377"), this.resolveCdcIntegrationService()?.sqlQueryEngine)) || null);
    }
  }
  resolveCdcIntegrationService() {
    if (stryMutAct_9fa48("62378")) {
      {}
    } else {
      stryCov_9fa48("62378");
      return this.cdcIntegrationService;
    }
  }
  resolveSystemTableCache() {
    if (stryMutAct_9fa48("62379")) {
      {}
    } else {
      stryCov_9fa48("62379");
      return this.systemTableCache;
    }
  }
  resolveMessageRouter() {
    if (stryMutAct_9fa48("62380")) {
      {}
    } else {
      stryCov_9fa48("62380");
      return this.messageRouter;
    }
  }

  /**
   * Reconcile authoritative rows into the writable system-table cache.
   * This is the only runtime cache-repair ingress outside CDC delivery.
   *
   * @param {string} tableName
   * @param {Object[]} authoritativeRows
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async reconcileAuthoritativeCacheRows(tableName, authoritativeRows = stryMutAct_9fa48("62381") ? ["Stryker was here"] : (stryCov_9fa48("62381"), []), options = {}) {
    if (stryMutAct_9fa48("62382")) {
      {}
    } else {
      stryCov_9fa48("62382");
      const defaultCache = this.resolveSystemTableCache();
      const writableCache = stryMutAct_9fa48("62385") ? options?.cacheMutationTarget && defaultCache : stryMutAct_9fa48("62384") ? false : stryMutAct_9fa48("62383") ? true : (stryCov_9fa48("62383", "62384", "62385"), (stryMutAct_9fa48("62386") ? options.cacheMutationTarget : (stryCov_9fa48("62386"), options?.cacheMutationTarget)) || defaultCache);
      const readableCache = stryMutAct_9fa48("62389") ? (options?.systemTableCache || defaultCache) && writableCache : stryMutAct_9fa48("62388") ? false : stryMutAct_9fa48("62387") ? true : (stryCov_9fa48("62387", "62388", "62389"), (stryMutAct_9fa48("62391") ? options?.systemTableCache && defaultCache : stryMutAct_9fa48("62390") ? false : (stryCov_9fa48("62390", "62391"), (stryMutAct_9fa48("62392") ? options.systemTableCache : (stryCov_9fa48("62392"), options?.systemTableCache)) || defaultCache)) || writableCache);
      if (stryMutAct_9fa48("62395") ? (!writableCache || typeof writableCache.applySystemTableChange !== TYPEOF.FUNCTION) && !readableCache : stryMutAct_9fa48("62394") ? false : stryMutAct_9fa48("62393") ? true : (stryCov_9fa48("62393", "62394", "62395"), (stryMutAct_9fa48("62397") ? !writableCache && typeof writableCache.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("62396") ? false : (stryCov_9fa48("62396", "62397"), (stryMutAct_9fa48("62398") ? writableCache : (stryCov_9fa48("62398"), !writableCache)) || (stryMutAct_9fa48("62400") ? typeof writableCache.applySystemTableChange === TYPEOF.FUNCTION : stryMutAct_9fa48("62399") ? false : (stryCov_9fa48("62399", "62400"), typeof writableCache.applySystemTableChange !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("62401") ? readableCache : (stryCov_9fa48("62401"), !readableCache)))) {
        if (stryMutAct_9fa48("62402")) {
          {}
        } else {
          stryCov_9fa48("62402");
          return stryMutAct_9fa48("62403") ? {} : (stryCov_9fa48("62403"), {
            success: stryMutAct_9fa48("62404") ? true : (stryCov_9fa48("62404"), false),
            tableName,
            mutationCount: NUM.ZERO,
            outcome: CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
            error: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SYSTEM_TABLE_CACHE_UNAVAILABLE
          });
        }
      }
      const primaryKeyField = stryMutAct_9fa48("62407") ? options?.primaryKeyField && getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id') : stryMutAct_9fa48("62406") ? false : stryMutAct_9fa48("62405") ? true : (stryCov_9fa48("62405", "62406", "62407"), (stryMutAct_9fa48("62408") ? options.primaryKeyField : (stryCov_9fa48("62408"), options?.primaryKeyField)) || getSystemCachePrimaryKeyFieldOrFallback(tableName, stryMutAct_9fa48("62409") ? "" : (stryCov_9fa48("62409"), 'id')));
      const authoritativeEntries = Array.isArray(authoritativeRows) ? authoritativeRows : stryMutAct_9fa48("62410") ? ["Stryker was here"] : (stryCov_9fa48("62410"), []);
      const cachedEntries = Array.isArray(stryMutAct_9fa48("62411") ? options.cachedRows : (stryCov_9fa48("62411"), options?.cachedRows)) ? options.cachedRows : (stryMutAct_9fa48("62414") ? typeof options?.cachedRowFilter === TYPEOF.FUNCTION || typeof readableCache.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("62413") ? false : stryMutAct_9fa48("62412") ? true : (stryCov_9fa48("62412", "62413", "62414"), (stryMutAct_9fa48("62416") ? typeof options?.cachedRowFilter !== TYPEOF.FUNCTION : stryMutAct_9fa48("62415") ? true : (stryCov_9fa48("62415", "62416"), typeof (stryMutAct_9fa48("62417") ? options.cachedRowFilter : (stryCov_9fa48("62417"), options?.cachedRowFilter)) === TYPEOF.FUNCTION)) && (stryMutAct_9fa48("62419") ? typeof readableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("62418") ? true : (stryCov_9fa48("62418", "62419"), typeof readableCache.filter === TYPEOF.FUNCTION)))) ? stryMutAct_9fa48("62422") ? readableCache.filter(tableName, options.cachedRowFilter) && [] : stryMutAct_9fa48("62421") ? false : stryMutAct_9fa48("62420") ? true : (stryCov_9fa48("62420", "62421", "62422"), (stryMutAct_9fa48("62423") ? readableCache : (stryCov_9fa48("62423"), readableCache.filter(tableName, options.cachedRowFilter))) || (stryMutAct_9fa48("62424") ? ["Stryker was here"] : (stryCov_9fa48("62424"), []))) : (stryMutAct_9fa48("62427") ? typeof readableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("62426") ? false : stryMutAct_9fa48("62425") ? true : (stryCov_9fa48("62425", "62426", "62427"), typeof readableCache.getAll === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("62430") ? readableCache.getAll(tableName) && [] : stryMutAct_9fa48("62429") ? false : stryMutAct_9fa48("62428") ? true : (stryCov_9fa48("62428", "62429", "62430"), readableCache.getAll(tableName) || (stryMutAct_9fa48("62431") ? ["Stryker was here"] : (stryCov_9fa48("62431"), []))) : stryMutAct_9fa48("62432") ? ["Stryker was here"] : (stryCov_9fa48("62432"), []);
      const rowComparator = (stryMutAct_9fa48("62435") ? typeof options?.areRowsEqual !== TYPEOF.FUNCTION : stryMutAct_9fa48("62434") ? false : stryMutAct_9fa48("62433") ? true : (stryCov_9fa48("62433", "62434", "62435"), typeof (stryMutAct_9fa48("62436") ? options.areRowsEqual : (stryCov_9fa48("62436"), options?.areRowsEqual)) === TYPEOF.FUNCTION)) ? options.areRowsEqual : null;
      const causeOptions = (stryMutAct_9fa48("62439") ? typeof options?.causeId === TYPEOF.STRING || options.causeId.length > NUM.ZERO : stryMutAct_9fa48("62438") ? false : stryMutAct_9fa48("62437") ? true : (stryCov_9fa48("62437", "62438", "62439"), (stryMutAct_9fa48("62441") ? typeof options?.causeId !== TYPEOF.STRING : stryMutAct_9fa48("62440") ? true : (stryCov_9fa48("62440", "62441"), typeof (stryMutAct_9fa48("62442") ? options.causeId : (stryCov_9fa48("62442"), options?.causeId)) === TYPEOF.STRING)) && (stryMutAct_9fa48("62445") ? options.causeId.length <= NUM.ZERO : stryMutAct_9fa48("62444") ? options.causeId.length >= NUM.ZERO : stryMutAct_9fa48("62443") ? true : (stryCov_9fa48("62443", "62444", "62445"), options.causeId.length > NUM.ZERO)))) ? stryMutAct_9fa48("62446") ? {} : (stryCov_9fa48("62446"), {
        causeId: options.causeId
      }) : undefined;
      const cachedRowsByKey = new Map();
      const authoritativeKeys = new Set();
      let mutationCount = NUM.ZERO;
      for (const row of cachedEntries) {
        if (stryMutAct_9fa48("62447")) {
          {}
        } else {
          stryCov_9fa48("62447");
          const key = stryMutAct_9fa48("62448") ? row?.[primaryKeyField] && row?.id : (stryCov_9fa48("62448"), (stryMutAct_9fa48("62449") ? row[primaryKeyField] : (stryCov_9fa48("62449"), row?.[primaryKeyField])) ?? (stryMutAct_9fa48("62450") ? row.id : (stryCov_9fa48("62450"), row?.id)));
          if (stryMutAct_9fa48("62453") ? false : stryMutAct_9fa48("62452") ? true : stryMutAct_9fa48("62451") ? hasUsablePrimaryKeyValue(key) : (stryCov_9fa48("62451", "62452", "62453"), !hasUsablePrimaryKeyValue(key))) {
            if (stryMutAct_9fa48("62454")) {
              {}
            } else {
              stryCov_9fa48("62454");
              continue;
            }
          }
          cachedRowsByKey.set(String(key), row);
        }
      }
      for (const row of authoritativeEntries) {
        if (stryMutAct_9fa48("62455")) {
          {}
        } else {
          stryCov_9fa48("62455");
          const canonicalRow = canonicalizeSystemTableRow(tableName, row);
          const key = stryMutAct_9fa48("62456") ? canonicalRow?.[primaryKeyField] && canonicalRow?.id : (stryCov_9fa48("62456"), (stryMutAct_9fa48("62457") ? canonicalRow[primaryKeyField] : (stryCov_9fa48("62457"), canonicalRow?.[primaryKeyField])) ?? (stryMutAct_9fa48("62458") ? canonicalRow.id : (stryCov_9fa48("62458"), canonicalRow?.id)));
          if (stryMutAct_9fa48("62461") ? false : stryMutAct_9fa48("62460") ? true : stryMutAct_9fa48("62459") ? hasUsablePrimaryKeyValue(key) : (stryCov_9fa48("62459", "62460", "62461"), !hasUsablePrimaryKeyValue(key))) {
            if (stryMutAct_9fa48("62462")) {
              {}
            } else {
              stryCov_9fa48("62462");
              continue;
            }
          }
          const normalizedKey = String(key);
          authoritativeKeys.add(normalizedKey);
          const cachedRow = stryMutAct_9fa48("62465") ? cachedRowsByKey.get(normalizedKey) && null : stryMutAct_9fa48("62464") ? false : stryMutAct_9fa48("62463") ? true : (stryCov_9fa48("62463", "62464", "62465"), cachedRowsByKey.get(normalizedKey) || null);
          if (stryMutAct_9fa48("62468") ? rowComparator || rowComparator(cachedRow, canonicalRow) : stryMutAct_9fa48("62467") ? false : stryMutAct_9fa48("62466") ? true : (stryCov_9fa48("62466", "62467", "62468"), rowComparator && rowComparator(cachedRow, canonicalRow))) {
            if (stryMutAct_9fa48("62469")) {
              {}
            } else {
              stryCov_9fa48("62469");
              continue;
            }
          }
          writableCache.applySystemTableChange(tableName, CDC_OPERATION.UPSERT, canonicalRow, causeOptions);
          stryMutAct_9fa48("62470") ? mutationCount -= NUM.ONE : (stryCov_9fa48("62470"), mutationCount += NUM.ONE);
        }
      }
      if (stryMutAct_9fa48("62473") ? options?.deleteMissing === false : stryMutAct_9fa48("62472") ? false : stryMutAct_9fa48("62471") ? true : (stryCov_9fa48("62471", "62472", "62473"), (stryMutAct_9fa48("62474") ? options.deleteMissing : (stryCov_9fa48("62474"), options?.deleteMissing)) !== (stryMutAct_9fa48("62475") ? true : (stryCov_9fa48("62475"), false)))) {
        if (stryMutAct_9fa48("62476")) {
          {}
        } else {
          stryCov_9fa48("62476");
          for (const cachedRow of cachedEntries) {
            if (stryMutAct_9fa48("62477")) {
              {}
            } else {
              stryCov_9fa48("62477");
              const key = stryMutAct_9fa48("62478") ? cachedRow?.[primaryKeyField] && cachedRow?.id : (stryCov_9fa48("62478"), (stryMutAct_9fa48("62479") ? cachedRow[primaryKeyField] : (stryCov_9fa48("62479"), cachedRow?.[primaryKeyField])) ?? (stryMutAct_9fa48("62480") ? cachedRow.id : (stryCov_9fa48("62480"), cachedRow?.id)));
              if (stryMutAct_9fa48("62483") ? !hasUsablePrimaryKeyValue(key) && authoritativeKeys.has(String(key)) : stryMutAct_9fa48("62482") ? false : stryMutAct_9fa48("62481") ? true : (stryCov_9fa48("62481", "62482", "62483"), (stryMutAct_9fa48("62484") ? hasUsablePrimaryKeyValue(key) : (stryCov_9fa48("62484"), !hasUsablePrimaryKeyValue(key))) || authoritativeKeys.has(String(key)))) {
                if (stryMutAct_9fa48("62485")) {
                  {}
                } else {
                  stryCov_9fa48("62485");
                  continue;
                }
              }
              writableCache.applySystemTableChange(tableName, CDC_OPERATION.DELETE, cachedRow, causeOptions);
              stryMutAct_9fa48("62486") ? mutationCount -= NUM.ONE : (stryCov_9fa48("62486"), mutationCount += NUM.ONE);
            }
          }
        }
      }
      return stryMutAct_9fa48("62487") ? {} : (stryCov_9fa48("62487"), {
        success: stryMutAct_9fa48("62488") ? false : (stryCov_9fa48("62488"), true),
        tableName,
        mutationCount,
        outcome: (stryMutAct_9fa48("62492") ? mutationCount <= NUM.ZERO : stryMutAct_9fa48("62491") ? mutationCount >= NUM.ZERO : stryMutAct_9fa48("62490") ? false : stryMutAct_9fa48("62489") ? true : (stryCov_9fa48("62489", "62490", "62491", "62492"), mutationCount > NUM.ZERO)) ? CONTROL_PLANE_MUTATION_OUTCOME.APPLIED : CONTROL_PLANE_MUTATION_OUTCOME.NO_OP
      });
    }
  }

  /**
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (stryMutAct_9fa48("62493")) {
      {}
    } else {
      stryCov_9fa48("62493");
      if (stryMutAct_9fa48("62495") ? false : stryMutAct_9fa48("62494") ? true : (stryCov_9fa48("62494", "62495"), this.pressureGovernor)) {
        if (stryMutAct_9fa48("62496")) {
          {}
        } else {
          stryCov_9fa48("62496");
          this.pressureGovernor.configure(stryMutAct_9fa48("62497") ? {} : (stryCov_9fa48("62497"), {
            nodeId: this.nodeId,
            messageRouter: this.resolveMessageRouter(),
            logger: this.logger
          }));
          return this.pressureGovernor;
        }
      }
      this.pressureGovernor = PressureGovernor.getShared(stryMutAct_9fa48("62498") ? {} : (stryCov_9fa48("62498"), {
        nodeId: this.nodeId,
        messageRouter: this.resolveMessageRouter(),
        logger: this.logger
      }));
      return this.pressureGovernor;
    }
  }

  /**
   * @param {string|null} tableName
   * @return {string|null}
   * @private
   */
  resolveSystemTablePartitionId(tableName) {
    if (stryMutAct_9fa48("62499")) {
      {}
    } else {
      stryCov_9fa48("62499");
      if (stryMutAct_9fa48("62502") ? typeof tableName !== TYPEOF.STRING && tableName.length === NUM.ZERO : stryMutAct_9fa48("62501") ? false : stryMutAct_9fa48("62500") ? true : (stryCov_9fa48("62500", "62501", "62502"), (stryMutAct_9fa48("62504") ? typeof tableName === TYPEOF.STRING : stryMutAct_9fa48("62503") ? false : (stryCov_9fa48("62503", "62504"), typeof tableName !== TYPEOF.STRING)) || (stryMutAct_9fa48("62506") ? tableName.length !== NUM.ZERO : stryMutAct_9fa48("62505") ? false : (stryCov_9fa48("62505", "62506"), tableName.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("62507")) {
          {}
        } else {
          stryCov_9fa48("62507");
          return null;
        }
      }
      const cdcIntegrationService = this.resolveCdcIntegrationService();
      if (stryMutAct_9fa48("62510") ? typeof cdcIntegrationService?.resolveSystemTablePartitionIds !== TYPEOF.FUNCTION : stryMutAct_9fa48("62509") ? false : stryMutAct_9fa48("62508") ? true : (stryCov_9fa48("62508", "62509", "62510"), typeof (stryMutAct_9fa48("62511") ? cdcIntegrationService.resolveSystemTablePartitionIds : (stryCov_9fa48("62511"), cdcIntegrationService?.resolveSystemTablePartitionIds)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("62512")) {
          {}
        } else {
          stryCov_9fa48("62512");
          const partitionIds = cdcIntegrationService.resolveSystemTablePartitionIds(tableName);
          if (stryMutAct_9fa48("62514") ? false : stryMutAct_9fa48("62513") ? true : (stryCov_9fa48("62513", "62514"), Array.isArray(partitionIds))) {
            if (stryMutAct_9fa48("62515")) {
              {}
            } else {
              stryCov_9fa48("62515");
              const partitionId = stryMutAct_9fa48("62518") ? partitionIds.find(entry => typeof entry === TYPEOF.STRING && entry.length > NUM.ZERO) && null : stryMutAct_9fa48("62517") ? false : stryMutAct_9fa48("62516") ? true : (stryCov_9fa48("62516", "62517", "62518"), partitionIds.find(stryMutAct_9fa48("62519") ? () => undefined : (stryCov_9fa48("62519"), entry => stryMutAct_9fa48("62522") ? typeof entry === TYPEOF.STRING || entry.length > NUM.ZERO : stryMutAct_9fa48("62521") ? false : stryMutAct_9fa48("62520") ? true : (stryCov_9fa48("62520", "62521", "62522"), (stryMutAct_9fa48("62524") ? typeof entry !== TYPEOF.STRING : stryMutAct_9fa48("62523") ? true : (stryCov_9fa48("62523", "62524"), typeof entry === TYPEOF.STRING)) && (stryMutAct_9fa48("62527") ? entry.length <= NUM.ZERO : stryMutAct_9fa48("62526") ? entry.length >= NUM.ZERO : stryMutAct_9fa48("62525") ? true : (stryCov_9fa48("62525", "62526", "62527"), entry.length > NUM.ZERO))))) || null);
              if (stryMutAct_9fa48("62529") ? false : stryMutAct_9fa48("62528") ? true : (stryCov_9fa48("62528", "62529"), partitionId)) {
                if (stryMutAct_9fa48("62530")) {
                  {}
                } else {
                  stryCov_9fa48("62530");
                  return partitionId;
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("62533") ? INITIAL_PARTITION_IDS[tableName] && null : stryMutAct_9fa48("62532") ? false : stryMutAct_9fa48("62531") ? true : (stryCov_9fa48("62531", "62532", "62533"), INITIAL_PARTITION_IDS[tableName] || null);
    }
  }

  /**
   * @param {string|null} tableName
   * @param {string|null} routingReadinessDimension
   * @return {Object}
   * @private
   */
  buildFallbackSystemTableRoutingDiagnostics(tableName, routingReadinessDimension = null) {
    if (stryMutAct_9fa48("62534")) {
      {}
    } else {
      stryCov_9fa48("62534");
      const partitionId = this.resolveSystemTablePartitionId(tableName);
      let routingSnapshot = null;
      const sqlQueryEngine = this.resolveSqlQueryEngine();
      if (stryMutAct_9fa48("62537") ? partitionId && sqlQueryEngine?.queryExecutor || typeof sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot === TYPEOF.FUNCTION : stryMutAct_9fa48("62536") ? false : stryMutAct_9fa48("62535") ? true : (stryCov_9fa48("62535", "62536", "62537"), (stryMutAct_9fa48("62539") ? partitionId || sqlQueryEngine?.queryExecutor : stryMutAct_9fa48("62538") ? true : (stryCov_9fa48("62538", "62539"), partitionId && (stryMutAct_9fa48("62540") ? sqlQueryEngine.queryExecutor : (stryCov_9fa48("62540"), sqlQueryEngine?.queryExecutor)))) && (stryMutAct_9fa48("62542") ? typeof sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("62541") ? true : (stryCov_9fa48("62541", "62542"), typeof sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("62543")) {
          {}
        } else {
          stryCov_9fa48("62543");
          try {
            if (stryMutAct_9fa48("62544")) {
              {}
            } else {
              stryCov_9fa48("62544");
              routingSnapshot = sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot(partitionId, stryMutAct_9fa48("62547") ? routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("62546") ? false : stryMutAct_9fa48("62545") ? true : (stryCov_9fa48("62545", "62546", "62547"), routingReadinessDimension || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE));
            }
          } catch (_error) {
            if (stryMutAct_9fa48("62548")) {
              {}
            } else {
              stryCov_9fa48("62548");
              routingSnapshot = null;
            }
          }
        }
      }
      let partitionRow = null;
      let serviceRows = stryMutAct_9fa48("62549") ? ["Stryker was here"] : (stryCov_9fa48("62549"), []);
      const systemTableCache = this.resolveSystemTableCache();
      if (stryMutAct_9fa48("62552") ? systemTableCache || typeof systemTableCache.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("62551") ? false : stryMutAct_9fa48("62550") ? true : (stryCov_9fa48("62550", "62551", "62552"), systemTableCache && (stryMutAct_9fa48("62554") ? typeof systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("62553") ? true : (stryCov_9fa48("62553", "62554"), typeof systemTableCache.filter === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("62555")) {
          {}
        } else {
          stryCov_9fa48("62555");
          const partitionRows = stryMutAct_9fa48("62558") ? systemTableCache.filter(SYSTEM_TABLE_NAME.PARTITIONS, row => {
            const rowPartitionId = row?.partition_id || row?.partitionId || row?.id || null;
            if (partitionId && rowPartitionId === partitionId) {
              return true;
            }
            return row?.table_name === tableName || row?.tableName === tableName;
          }) && [] : stryMutAct_9fa48("62557") ? false : stryMutAct_9fa48("62556") ? true : (stryCov_9fa48("62556", "62557", "62558"), (stryMutAct_9fa48("62559") ? systemTableCache : (stryCov_9fa48("62559"), systemTableCache.filter(SYSTEM_TABLE_NAME.PARTITIONS, row => {
            if (stryMutAct_9fa48("62560")) {
              {}
            } else {
              stryCov_9fa48("62560");
              const rowPartitionId = stryMutAct_9fa48("62563") ? (row?.partition_id || row?.partitionId || row?.id) && null : stryMutAct_9fa48("62562") ? false : stryMutAct_9fa48("62561") ? true : (stryCov_9fa48("62561", "62562", "62563"), (stryMutAct_9fa48("62565") ? (row?.partition_id || row?.partitionId) && row?.id : stryMutAct_9fa48("62564") ? false : (stryCov_9fa48("62564", "62565"), (stryMutAct_9fa48("62567") ? row?.partition_id && row?.partitionId : stryMutAct_9fa48("62566") ? false : (stryCov_9fa48("62566", "62567"), (stryMutAct_9fa48("62568") ? row.partition_id : (stryCov_9fa48("62568"), row?.partition_id)) || (stryMutAct_9fa48("62569") ? row.partitionId : (stryCov_9fa48("62569"), row?.partitionId)))) || (stryMutAct_9fa48("62570") ? row.id : (stryCov_9fa48("62570"), row?.id)))) || null);
              if (stryMutAct_9fa48("62573") ? partitionId || rowPartitionId === partitionId : stryMutAct_9fa48("62572") ? false : stryMutAct_9fa48("62571") ? true : (stryCov_9fa48("62571", "62572", "62573"), partitionId && (stryMutAct_9fa48("62575") ? rowPartitionId !== partitionId : stryMutAct_9fa48("62574") ? true : (stryCov_9fa48("62574", "62575"), rowPartitionId === partitionId)))) {
                if (stryMutAct_9fa48("62576")) {
                  {}
                } else {
                  stryCov_9fa48("62576");
                  return stryMutAct_9fa48("62577") ? false : (stryCov_9fa48("62577"), true);
                }
              }
              return stryMutAct_9fa48("62580") ? row?.table_name === tableName && row?.tableName === tableName : stryMutAct_9fa48("62579") ? false : stryMutAct_9fa48("62578") ? true : (stryCov_9fa48("62578", "62579", "62580"), (stryMutAct_9fa48("62582") ? row?.table_name !== tableName : stryMutAct_9fa48("62581") ? false : (stryCov_9fa48("62581", "62582"), (stryMutAct_9fa48("62583") ? row.table_name : (stryCov_9fa48("62583"), row?.table_name)) === tableName)) || (stryMutAct_9fa48("62585") ? row?.tableName !== tableName : stryMutAct_9fa48("62584") ? false : (stryCov_9fa48("62584", "62585"), (stryMutAct_9fa48("62586") ? row.tableName : (stryCov_9fa48("62586"), row?.tableName)) === tableName)));
            }
          }))) || (stryMutAct_9fa48("62587") ? ["Stryker was here"] : (stryCov_9fa48("62587"), [])));
          partitionRow = stryMutAct_9fa48("62590") ? partitionRows[NUM.ZERO] && null : stryMutAct_9fa48("62589") ? false : stryMutAct_9fa48("62588") ? true : (stryCov_9fa48("62588", "62589", "62590"), partitionRows[NUM.ZERO] || null);
          if (stryMutAct_9fa48("62592") ? false : stryMutAct_9fa48("62591") ? true : (stryCov_9fa48("62591", "62592"), partitionId)) {
            if (stryMutAct_9fa48("62593")) {
              {}
            } else {
              stryCov_9fa48("62593");
              serviceRows = stryMutAct_9fa48("62596") ? systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, row => {
                return row?.partition_id === partitionId && row?.service_type === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PARTITION;
              }) && [] : stryMutAct_9fa48("62595") ? false : stryMutAct_9fa48("62594") ? true : (stryCov_9fa48("62594", "62595", "62596"), (stryMutAct_9fa48("62597") ? systemTableCache : (stryCov_9fa48("62597"), systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, row => {
                if (stryMutAct_9fa48("62598")) {
                  {}
                } else {
                  stryCov_9fa48("62598");
                  return stryMutAct_9fa48("62601") ? row?.partition_id === partitionId || row?.service_type === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PARTITION : stryMutAct_9fa48("62600") ? false : stryMutAct_9fa48("62599") ? true : (stryCov_9fa48("62599", "62600", "62601"), (stryMutAct_9fa48("62603") ? row?.partition_id !== partitionId : stryMutAct_9fa48("62602") ? true : (stryCov_9fa48("62602", "62603"), (stryMutAct_9fa48("62604") ? row.partition_id : (stryCov_9fa48("62604"), row?.partition_id)) === partitionId)) && (stryMutAct_9fa48("62606") ? row?.service_type !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PARTITION : stryMutAct_9fa48("62605") ? true : (stryCov_9fa48("62605", "62606"), (stryMutAct_9fa48("62607") ? row.service_type : (stryCov_9fa48("62607"), row?.service_type)) === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PARTITION)));
                }
              }))) || (stryMutAct_9fa48("62608") ? ["Stryker was here"] : (stryCov_9fa48("62608"), [])));
            }
          }
        }
      }
      const leaderNodeId = stryMutAct_9fa48("62611") ? (routingSnapshot?.canonicalLeaderNodeId || partitionRow?.leader_node_id || partitionRow?.leaderNodeId) && null : stryMutAct_9fa48("62610") ? false : stryMutAct_9fa48("62609") ? true : (stryCov_9fa48("62609", "62610", "62611"), (stryMutAct_9fa48("62613") ? (routingSnapshot?.canonicalLeaderNodeId || partitionRow?.leader_node_id) && partitionRow?.leaderNodeId : stryMutAct_9fa48("62612") ? false : (stryCov_9fa48("62612", "62613"), (stryMutAct_9fa48("62615") ? routingSnapshot?.canonicalLeaderNodeId && partitionRow?.leader_node_id : stryMutAct_9fa48("62614") ? false : (stryCov_9fa48("62614", "62615"), (stryMutAct_9fa48("62616") ? routingSnapshot.canonicalLeaderNodeId : (stryCov_9fa48("62616"), routingSnapshot?.canonicalLeaderNodeId)) || (stryMutAct_9fa48("62617") ? partitionRow.leader_node_id : (stryCov_9fa48("62617"), partitionRow?.leader_node_id)))) || (stryMutAct_9fa48("62618") ? partitionRow.leaderNodeId : (stryCov_9fa48("62618"), partitionRow?.leaderNodeId)))) || null);
      return stryMutAct_9fa48("62619") ? {} : (stryCov_9fa48("62619"), {
        partitionId,
        leaderNodeId: (stryMutAct_9fa48("62622") ? typeof leaderNodeId === TYPEOF.STRING || leaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("62621") ? false : stryMutAct_9fa48("62620") ? true : (stryCov_9fa48("62620", "62621", "62622"), (stryMutAct_9fa48("62624") ? typeof leaderNodeId !== TYPEOF.STRING : stryMutAct_9fa48("62623") ? true : (stryCov_9fa48("62623", "62624"), typeof leaderNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("62627") ? leaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("62626") ? leaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("62625") ? true : (stryCov_9fa48("62625", "62626", "62627"), leaderNodeId.length > NUM.ZERO)))) ? leaderNodeId : null,
        serviceRowCount: Number.isFinite(stryMutAct_9fa48("62628") ? routingSnapshot.serviceRowCount : (stryCov_9fa48("62628"), routingSnapshot?.serviceRowCount)) ? routingSnapshot.serviceRowCount : serviceRows.length,
        routableServiceCount: Number.isFinite(stryMutAct_9fa48("62629") ? routingSnapshot.routableServiceCount : (stryCov_9fa48("62629"), routingSnapshot?.routableServiceCount)) ? routingSnapshot.routableServiceCount : stryMutAct_9fa48("62630") ? serviceRows.length : (stryCov_9fa48("62630"), serviceRows.filter(stryMutAct_9fa48("62631") ? () => undefined : (stryCov_9fa48("62631"), row => stryMutAct_9fa48("62634") ? row?.status === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ACTIVE && typeof row?.address === TYPEOF.STRING || row.address.length > NUM.ZERO : stryMutAct_9fa48("62633") ? false : stryMutAct_9fa48("62632") ? true : (stryCov_9fa48("62632", "62633", "62634"), (stryMutAct_9fa48("62636") ? row?.status === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ACTIVE || typeof row?.address === TYPEOF.STRING : stryMutAct_9fa48("62635") ? true : (stryCov_9fa48("62635", "62636"), (stryMutAct_9fa48("62638") ? row?.status !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ACTIVE : stryMutAct_9fa48("62637") ? true : (stryCov_9fa48("62637", "62638"), (stryMutAct_9fa48("62639") ? row.status : (stryCov_9fa48("62639"), row?.status)) === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ACTIVE)) && (stryMutAct_9fa48("62641") ? typeof row?.address !== TYPEOF.STRING : stryMutAct_9fa48("62640") ? true : (stryCov_9fa48("62640", "62641"), typeof (stryMutAct_9fa48("62642") ? row.address : (stryCov_9fa48("62642"), row?.address)) === TYPEOF.STRING)))) && (stryMutAct_9fa48("62645") ? row.address.length <= NUM.ZERO : stryMutAct_9fa48("62644") ? row.address.length >= NUM.ZERO : stryMutAct_9fa48("62643") ? true : (stryCov_9fa48("62643", "62644", "62645"), row.address.length > NUM.ZERO))))).length),
        deniedByReadiness: (stryMutAct_9fa48("62648") ? routingSnapshot || typeof routingSnapshot.deniedByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("62647") ? false : stryMutAct_9fa48("62646") ? true : (stryCov_9fa48("62646", "62647", "62648"), routingSnapshot && (stryMutAct_9fa48("62650") ? typeof routingSnapshot.deniedByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("62649") ? true : (stryCov_9fa48("62649", "62650"), typeof routingSnapshot.deniedByNodeId === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("62654") ? Object.keys(routingSnapshot.deniedByNodeId).length <= NUM.ZERO : stryMutAct_9fa48("62653") ? Object.keys(routingSnapshot.deniedByNodeId).length >= NUM.ZERO : stryMutAct_9fa48("62652") ? false : stryMutAct_9fa48("62651") ? true : (stryCov_9fa48("62651", "62652", "62653", "62654"), Object.keys(routingSnapshot.deniedByNodeId).length > NUM.ZERO) : stryMutAct_9fa48("62655") ? true : (stryCov_9fa48("62655"), false)
      });
    }
  }

  /**
   * @param {string|null} tableName
   * @param {Object|null} result
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildOperationLedgerDiagnostics(tableName, result = null, options = {}) {
    if (stryMutAct_9fa48("62656")) {
      {}
    } else {
      stryCov_9fa48("62656");
      const routingReadinessDimension = stryMutAct_9fa48("62659") ? options?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("62658") ? false : stryMutAct_9fa48("62657") ? true : (stryCov_9fa48("62657", "62658", "62659"), (stryMutAct_9fa48("62660") ? options.routingReadinessDimension : (stryCov_9fa48("62660"), options?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE);
      const systemTableDiagnostics = (stryMutAct_9fa48("62663") ? result?.systemTableDiagnostics || typeof result.systemTableDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("62662") ? false : stryMutAct_9fa48("62661") ? true : (stryCov_9fa48("62661", "62662", "62663"), (stryMutAct_9fa48("62664") ? result.systemTableDiagnostics : (stryCov_9fa48("62664"), result?.systemTableDiagnostics)) && (stryMutAct_9fa48("62666") ? typeof result.systemTableDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("62665") ? true : (stryCov_9fa48("62665", "62666"), typeof result.systemTableDiagnostics === TYPEOF.OBJECT)))) ? result.systemTableDiagnostics : {};
      const fallbackDiagnostics = this.buildFallbackSystemTableRoutingDiagnostics(tableName, routingReadinessDimension);
      const leaderNodeId = stryMutAct_9fa48("62669") ? (systemTableDiagnostics.leaderNodeId || fallbackDiagnostics.leaderNodeId) && null : stryMutAct_9fa48("62668") ? false : stryMutAct_9fa48("62667") ? true : (stryCov_9fa48("62667", "62668", "62669"), (stryMutAct_9fa48("62671") ? systemTableDiagnostics.leaderNodeId && fallbackDiagnostics.leaderNodeId : stryMutAct_9fa48("62670") ? false : (stryCov_9fa48("62670", "62671"), systemTableDiagnostics.leaderNodeId || fallbackDiagnostics.leaderNodeId)) || null);
      const queryTimeoutMs = Number.isFinite(systemTableDiagnostics.queryTimeoutMs) ? systemTableDiagnostics.queryTimeoutMs : Number.isFinite(stryMutAct_9fa48("62672") ? result.queryTimeoutMs : (stryCov_9fa48("62672"), result?.queryTimeoutMs)) ? result.queryTimeoutMs : Number.isFinite(stryMutAct_9fa48("62673") ? options.timeoutMs : (stryCov_9fa48("62673"), options?.timeoutMs)) ? options.timeoutMs : Number.isFinite(stryMutAct_9fa48("62674") ? options.queryTimeoutMs : (stryCov_9fa48("62674"), options?.queryTimeoutMs)) ? options.queryTimeoutMs : Number.isFinite(stryMutAct_9fa48("62675") ? options.requestedTimeoutMs : (stryCov_9fa48("62675"), options?.requestedTimeoutMs)) ? options.requestedTimeoutMs : null;
      return stryMutAct_9fa48("62676") ? {} : (stryCov_9fa48("62676"), {
        partitionId: stryMutAct_9fa48("62679") ? (systemTableDiagnostics.partitionId || fallbackDiagnostics.partitionId) && null : stryMutAct_9fa48("62678") ? false : stryMutAct_9fa48("62677") ? true : (stryCov_9fa48("62677", "62678", "62679"), (stryMutAct_9fa48("62681") ? systemTableDiagnostics.partitionId && fallbackDiagnostics.partitionId : stryMutAct_9fa48("62680") ? false : (stryCov_9fa48("62680", "62681"), systemTableDiagnostics.partitionId || fallbackDiagnostics.partitionId)) || null),
        localReadHit: stryMutAct_9fa48("62684") ? (result?.localReadHit === true || systemTableDiagnostics.localReadHit === true) && result?.source === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.LOCAL_PARTITION_REPLICA : stryMutAct_9fa48("62683") ? false : stryMutAct_9fa48("62682") ? true : (stryCov_9fa48("62682", "62683", "62684"), (stryMutAct_9fa48("62686") ? result?.localReadHit === true && systemTableDiagnostics.localReadHit === true : stryMutAct_9fa48("62685") ? false : (stryCov_9fa48("62685", "62686"), (stryMutAct_9fa48("62688") ? result?.localReadHit !== true : stryMutAct_9fa48("62687") ? false : (stryCov_9fa48("62687", "62688"), (stryMutAct_9fa48("62689") ? result.localReadHit : (stryCov_9fa48("62689"), result?.localReadHit)) === (stryMutAct_9fa48("62690") ? false : (stryCov_9fa48("62690"), true)))) || (stryMutAct_9fa48("62692") ? systemTableDiagnostics.localReadHit !== true : stryMutAct_9fa48("62691") ? false : (stryCov_9fa48("62691", "62692"), systemTableDiagnostics.localReadHit === (stryMutAct_9fa48("62693") ? false : (stryCov_9fa48("62693"), true)))))) || (stryMutAct_9fa48("62695") ? result?.source !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.LOCAL_PARTITION_REPLICA : stryMutAct_9fa48("62694") ? false : (stryCov_9fa48("62694", "62695"), (stryMutAct_9fa48("62696") ? result.source : (stryCov_9fa48("62696"), result?.source)) === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.LOCAL_PARTITION_REPLICA))),
        localReplicaFallbackHit: stryMutAct_9fa48("62699") ? result?.localReplicaFallbackHit === true && systemTableDiagnostics.localReplicaFallbackHit === true : stryMutAct_9fa48("62698") ? false : stryMutAct_9fa48("62697") ? true : (stryCov_9fa48("62697", "62698", "62699"), (stryMutAct_9fa48("62701") ? result?.localReplicaFallbackHit !== true : stryMutAct_9fa48("62700") ? false : (stryCov_9fa48("62700", "62701"), (stryMutAct_9fa48("62702") ? result.localReplicaFallbackHit : (stryCov_9fa48("62702"), result?.localReplicaFallbackHit)) === (stryMutAct_9fa48("62703") ? false : (stryCov_9fa48("62703"), true)))) || (stryMutAct_9fa48("62705") ? systemTableDiagnostics.localReplicaFallbackHit !== true : stryMutAct_9fa48("62704") ? false : (stryCov_9fa48("62704", "62705"), systemTableDiagnostics.localReplicaFallbackHit === (stryMutAct_9fa48("62706") ? false : (stryCov_9fa48("62706"), true))))),
        routedToNode: stryMutAct_9fa48("62709") ? systemTableDiagnostics.routedToNode && (result?.source === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE || result?.source === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.OWNER_RPC_LANE || options?.operationClass === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION || options?.operationClass === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY ? leaderNodeId : null) : stryMutAct_9fa48("62708") ? false : stryMutAct_9fa48("62707") ? true : (stryCov_9fa48("62707", "62708", "62709"), systemTableDiagnostics.routedToNode || ((stryMutAct_9fa48("62712") ? (result?.source === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE || result?.source === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.OWNER_RPC_LANE || options?.operationClass === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION) && options?.operationClass === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY : stryMutAct_9fa48("62711") ? false : stryMutAct_9fa48("62710") ? true : (stryCov_9fa48("62710", "62711", "62712"), (stryMutAct_9fa48("62714") ? (result?.source === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE || result?.source === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.OWNER_RPC_LANE) && options?.operationClass === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION : stryMutAct_9fa48("62713") ? false : (stryCov_9fa48("62713", "62714"), (stryMutAct_9fa48("62716") ? result?.source === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE && result?.source === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.OWNER_RPC_LANE : stryMutAct_9fa48("62715") ? false : (stryCov_9fa48("62715", "62716"), (stryMutAct_9fa48("62718") ? result?.source !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE : stryMutAct_9fa48("62717") ? false : (stryCov_9fa48("62717", "62718"), (stryMutAct_9fa48("62719") ? result.source : (stryCov_9fa48("62719"), result?.source)) === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE)) || (stryMutAct_9fa48("62721") ? result?.source !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.OWNER_RPC_LANE : stryMutAct_9fa48("62720") ? false : (stryCov_9fa48("62720", "62721"), (stryMutAct_9fa48("62722") ? result.source : (stryCov_9fa48("62722"), result?.source)) === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.OWNER_RPC_LANE)))) || (stryMutAct_9fa48("62724") ? options?.operationClass !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION : stryMutAct_9fa48("62723") ? false : (stryCov_9fa48("62723", "62724"), (stryMutAct_9fa48("62725") ? options.operationClass : (stryCov_9fa48("62725"), options?.operationClass)) === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION)))) || (stryMutAct_9fa48("62727") ? options?.operationClass !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY : stryMutAct_9fa48("62726") ? false : (stryCov_9fa48("62726", "62727"), (stryMutAct_9fa48("62728") ? options.operationClass : (stryCov_9fa48("62728"), options?.operationClass)) === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY)))) ? leaderNodeId : null)),
        deniedByReadiness: stryMutAct_9fa48("62731") ? (systemTableDiagnostics.deniedByReadiness === true || fallbackDiagnostics.deniedByReadiness === true || result?.errorCode === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTER_QUERY_TRANSPORT_NOT_READY) && result?.success === false && result?.deferRetry === true : stryMutAct_9fa48("62730") ? false : stryMutAct_9fa48("62729") ? true : (stryCov_9fa48("62729", "62730", "62731"), (stryMutAct_9fa48("62733") ? (systemTableDiagnostics.deniedByReadiness === true || fallbackDiagnostics.deniedByReadiness === true) && result?.errorCode === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTER_QUERY_TRANSPORT_NOT_READY : stryMutAct_9fa48("62732") ? false : (stryCov_9fa48("62732", "62733"), (stryMutAct_9fa48("62735") ? systemTableDiagnostics.deniedByReadiness === true && fallbackDiagnostics.deniedByReadiness === true : stryMutAct_9fa48("62734") ? false : (stryCov_9fa48("62734", "62735"), (stryMutAct_9fa48("62737") ? systemTableDiagnostics.deniedByReadiness !== true : stryMutAct_9fa48("62736") ? false : (stryCov_9fa48("62736", "62737"), systemTableDiagnostics.deniedByReadiness === (stryMutAct_9fa48("62738") ? false : (stryCov_9fa48("62738"), true)))) || (stryMutAct_9fa48("62740") ? fallbackDiagnostics.deniedByReadiness !== true : stryMutAct_9fa48("62739") ? false : (stryCov_9fa48("62739", "62740"), fallbackDiagnostics.deniedByReadiness === (stryMutAct_9fa48("62741") ? false : (stryCov_9fa48("62741"), true)))))) || (stryMutAct_9fa48("62743") ? result?.errorCode !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTER_QUERY_TRANSPORT_NOT_READY : stryMutAct_9fa48("62742") ? false : (stryCov_9fa48("62742", "62743"), (stryMutAct_9fa48("62744") ? result.errorCode : (stryCov_9fa48("62744"), result?.errorCode)) === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTER_QUERY_TRANSPORT_NOT_READY)))) || (stryMutAct_9fa48("62746") ? result?.success === false || result?.deferRetry === true : stryMutAct_9fa48("62745") ? false : (stryCov_9fa48("62745", "62746"), (stryMutAct_9fa48("62748") ? result?.success !== false : stryMutAct_9fa48("62747") ? true : (stryCov_9fa48("62747", "62748"), (stryMutAct_9fa48("62749") ? result.success : (stryCov_9fa48("62749"), result?.success)) === (stryMutAct_9fa48("62750") ? true : (stryCov_9fa48("62750"), false)))) && (stryMutAct_9fa48("62752") ? result?.deferRetry !== true : stryMutAct_9fa48("62751") ? true : (stryCov_9fa48("62751", "62752"), (stryMutAct_9fa48("62753") ? result.deferRetry : (stryCov_9fa48("62753"), result?.deferRetry)) === (stryMutAct_9fa48("62754") ? false : (stryCov_9fa48("62754"), true))))))),
        leaderNodeId,
        serviceRowCount: Number.isFinite(systemTableDiagnostics.serviceRowCount) ? systemTableDiagnostics.serviceRowCount : fallbackDiagnostics.serviceRowCount,
        routableServiceCount: Number.isFinite(systemTableDiagnostics.routableServiceCount) ? systemTableDiagnostics.routableServiceCount : fallbackDiagnostics.routableServiceCount,
        queryTimeoutMs: (stryMutAct_9fa48("62757") ? Number.isFinite(queryTimeoutMs) || queryTimeoutMs > NUM.ZERO : stryMutAct_9fa48("62756") ? false : stryMutAct_9fa48("62755") ? true : (stryCov_9fa48("62755", "62756", "62757"), Number.isFinite(queryTimeoutMs) && (stryMutAct_9fa48("62760") ? queryTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("62759") ? queryTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("62758") ? true : (stryCov_9fa48("62758", "62759", "62760"), queryTimeoutMs > NUM.ZERO)))) ? Math.floor(queryTimeoutMs) : null
      });
    }
  }

  /**
   * @return {boolean}
   */
  supportsReadRows() {
    if (stryMutAct_9fa48("62761")) {
      {}
    } else {
      stryCov_9fa48("62761");
      const systemTableCache = this.resolveSystemTableCache();
      const cdcIntegrationService = this.resolveCdcIntegrationService();
      const sqlQueryEngine = this.resolveSqlQueryEngine();
      return stryMutAct_9fa48("62764") ? (Boolean(systemTableCache) || typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION) && typeof sqlQueryEngine?.executeQuery === TYPEOF.FUNCTION : stryMutAct_9fa48("62763") ? false : stryMutAct_9fa48("62762") ? true : (stryCov_9fa48("62762", "62763", "62764"), (stryMutAct_9fa48("62766") ? Boolean(systemTableCache) && typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION : stryMutAct_9fa48("62765") ? false : (stryCov_9fa48("62765", "62766"), Boolean(systemTableCache) || (stryMutAct_9fa48("62768") ? typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("62767") ? false : (stryCov_9fa48("62767", "62768"), typeof (stryMutAct_9fa48("62769") ? cdcIntegrationService.executeAuthoritativeSystemTableRead : (stryCov_9fa48("62769"), cdcIntegrationService?.executeAuthoritativeSystemTableRead)) === TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("62771") ? typeof sqlQueryEngine?.executeQuery !== TYPEOF.FUNCTION : stryMutAct_9fa48("62770") ? false : (stryCov_9fa48("62770", "62771"), typeof (stryMutAct_9fa48("62772") ? sqlQueryEngine.executeQuery : (stryCov_9fa48("62772"), sqlQueryEngine?.executeQuery)) === TYPEOF.FUNCTION)));
    }
  }

  /**
   * @return {boolean}
   */
  supportsMutationSubmission() {
    if (stryMutAct_9fa48("62773")) {
      {}
    } else {
      stryCov_9fa48("62773");
      const cdcIntegrationService = this.resolveCdcIntegrationService();
      return stryMutAct_9fa48("62776") ? (typeof cdcIntegrationService?.insertSystemTableRow === TYPEOF.FUNCTION || typeof cdcIntegrationService?.updateSystemTableRow === TYPEOF.FUNCTION || typeof cdcIntegrationService?.upsertSystemTableRow === TYPEOF.FUNCTION) && typeof cdcIntegrationService?.deleteSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("62775") ? false : stryMutAct_9fa48("62774") ? true : (stryCov_9fa48("62774", "62775", "62776"), (stryMutAct_9fa48("62778") ? (typeof cdcIntegrationService?.insertSystemTableRow === TYPEOF.FUNCTION || typeof cdcIntegrationService?.updateSystemTableRow === TYPEOF.FUNCTION) && typeof cdcIntegrationService?.upsertSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("62777") ? false : (stryCov_9fa48("62777", "62778"), (stryMutAct_9fa48("62780") ? typeof cdcIntegrationService?.insertSystemTableRow === TYPEOF.FUNCTION && typeof cdcIntegrationService?.updateSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("62779") ? false : (stryCov_9fa48("62779", "62780"), (stryMutAct_9fa48("62782") ? typeof cdcIntegrationService?.insertSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("62781") ? false : (stryCov_9fa48("62781", "62782"), typeof (stryMutAct_9fa48("62783") ? cdcIntegrationService.insertSystemTableRow : (stryCov_9fa48("62783"), cdcIntegrationService?.insertSystemTableRow)) === TYPEOF.FUNCTION)) || (stryMutAct_9fa48("62785") ? typeof cdcIntegrationService?.updateSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("62784") ? false : (stryCov_9fa48("62784", "62785"), typeof (stryMutAct_9fa48("62786") ? cdcIntegrationService.updateSystemTableRow : (stryCov_9fa48("62786"), cdcIntegrationService?.updateSystemTableRow)) === TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("62788") ? typeof cdcIntegrationService?.upsertSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("62787") ? false : (stryCov_9fa48("62787", "62788"), typeof (stryMutAct_9fa48("62789") ? cdcIntegrationService.upsertSystemTableRow : (stryCov_9fa48("62789"), cdcIntegrationService?.upsertSystemTableRow)) === TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("62791") ? typeof cdcIntegrationService?.deleteSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("62790") ? false : (stryCov_9fa48("62790", "62791"), typeof (stryMutAct_9fa48("62792") ? cdcIntegrationService.deleteSystemTableRow : (stryCov_9fa48("62792"), cdcIntegrationService?.deleteSystemTableRow)) === TYPEOF.FUNCTION)));
    }
  }

  /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildQueryOptions(options = {}) {
    if (stryMutAct_9fa48("62793")) {
      {}
    } else {
      stryCov_9fa48("62793");
      const requestedTimeoutMs = Number.isFinite(stryMutAct_9fa48("62794") ? options.timeoutMs : (stryCov_9fa48("62794"), options?.timeoutMs)) ? options.timeoutMs : Number.isFinite(stryMutAct_9fa48("62795") ? options.queryTimeoutMs : (stryCov_9fa48("62795"), options?.queryTimeoutMs)) ? options.queryTimeoutMs : stryMutAct_9fa48("62796") ? options.requestedTimeoutMs : (stryCov_9fa48("62796"), options?.requestedTimeoutMs);
      let queryOptions = stryMutAct_9fa48("62797") ? {} : (stryCov_9fa48("62797"), {
        ...buildControlPlaneQueryOptions(stryMutAct_9fa48("62798") ? {} : (stryCov_9fa48("62798"), {
          requestedTimeoutMs,
          timeoutBudget: stryMutAct_9fa48("62799") ? options.timeoutBudget : (stryCov_9fa48("62799"), options?.timeoutBudget),
          now: this.now
        })),
        routingReadinessDimension: stryMutAct_9fa48("62802") ? options?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("62801") ? false : stryMutAct_9fa48("62800") ? true : (stryCov_9fa48("62800", "62801", "62802"), (stryMutAct_9fa48("62803") ? options.routingReadinessDimension : (stryCov_9fa48("62803"), options?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)
      });
      if (stryMutAct_9fa48("62806") ? typeof options?.sessionId === TYPEOF.STRING || options.sessionId.length > CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ZERO : stryMutAct_9fa48("62805") ? false : stryMutAct_9fa48("62804") ? true : (stryCov_9fa48("62804", "62805", "62806"), (stryMutAct_9fa48("62808") ? typeof options?.sessionId !== TYPEOF.STRING : stryMutAct_9fa48("62807") ? true : (stryCov_9fa48("62807", "62808"), typeof (stryMutAct_9fa48("62809") ? options.sessionId : (stryCov_9fa48("62809"), options?.sessionId)) === TYPEOF.STRING)) && (stryMutAct_9fa48("62812") ? options.sessionId.length <= CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ZERO : stryMutAct_9fa48("62811") ? options.sessionId.length >= CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ZERO : stryMutAct_9fa48("62810") ? true : (stryCov_9fa48("62810", "62811", "62812"), options.sessionId.length > CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ZERO)))) {
        if (stryMutAct_9fa48("62813")) {
          {}
        } else {
          stryCov_9fa48("62813");
          queryOptions.sessionId = options.sessionId;
        }
      }
      if (stryMutAct_9fa48("62816") ? options.cancellationToken : stryMutAct_9fa48("62815") ? false : stryMutAct_9fa48("62814") ? true : (stryCov_9fa48("62814", "62815", "62816"), options?.cancellationToken)) {
        if (stryMutAct_9fa48("62817")) {
          {}
        } else {
          stryCov_9fa48("62817");
          queryOptions.cancellationToken = options.cancellationToken;
        }
      }
      queryOptions = copyOption(queryOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY);
      return queryOptions;
    }
  }

  /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildWriteOptions(options = {}) {
    if (stryMutAct_9fa48("62818")) {
      {}
    } else {
      stryCov_9fa48("62818");
      let writeOptions = stryMutAct_9fa48("62819") ? {} : (stryCov_9fa48("62819"), {
        routingReadinessDimension: stryMutAct_9fa48("62822") ? options?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("62821") ? false : stryMutAct_9fa48("62820") ? true : (stryCov_9fa48("62820", "62821", "62822"), (stryMutAct_9fa48("62823") ? options.routingReadinessDimension : (stryCov_9fa48("62823"), options?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)
      });
      const queryTimeoutMs = Number.isFinite(stryMutAct_9fa48("62824") ? options.queryTimeoutMs : (stryCov_9fa48("62824"), options?.queryTimeoutMs)) ? options.queryTimeoutMs : stryMutAct_9fa48("62825") ? options.timeoutMs : (stryCov_9fa48("62825"), options?.timeoutMs);
      if (stryMutAct_9fa48("62827") ? false : stryMutAct_9fa48("62826") ? true : (stryCov_9fa48("62826", "62827"), Number.isFinite(queryTimeoutMs))) {
        if (stryMutAct_9fa48("62828")) {
          {}
        } else {
          stryCov_9fa48("62828");
          writeOptions.queryTimeoutMs = queryTimeoutMs;
        }
      } else if (stryMutAct_9fa48("62831") ? options?.timeoutBudget || typeof options.timeoutBudget === TYPEOF.OBJECT : stryMutAct_9fa48("62830") ? false : stryMutAct_9fa48("62829") ? true : (stryCov_9fa48("62829", "62830", "62831"), (stryMutAct_9fa48("62832") ? options.timeoutBudget : (stryCov_9fa48("62832"), options?.timeoutBudget)) && (stryMutAct_9fa48("62834") ? typeof options.timeoutBudget !== TYPEOF.OBJECT : stryMutAct_9fa48("62833") ? true : (stryCov_9fa48("62833", "62834"), typeof options.timeoutBudget === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("62835")) {
          {}
        } else {
          stryCov_9fa48("62835");
          const remainingBudgetMs = getRemainingBudgetMs(options.timeoutBudget, stryMutAct_9fa48("62836") ? {} : (stryCov_9fa48("62836"), {
            now: this.now
          }));
          if (stryMutAct_9fa48("62840") ? remainingBudgetMs <= NUM.ZERO : stryMutAct_9fa48("62839") ? remainingBudgetMs >= NUM.ZERO : stryMutAct_9fa48("62838") ? false : stryMutAct_9fa48("62837") ? true : (stryCov_9fa48("62837", "62838", "62839", "62840"), remainingBudgetMs > NUM.ZERO)) {
            if (stryMutAct_9fa48("62841")) {
              {}
            } else {
              stryCov_9fa48("62841");
              writeOptions.queryTimeoutMs = stryMutAct_9fa48("62842") ? Math.min(NUM.ONE, Math.floor(remainingBudgetMs)) : (stryCov_9fa48("62842"), Math.max(NUM.ONE, Math.floor(remainingBudgetMs)));
            }
          }
        }
      }
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CANCELLATIONTOKEN);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.TIMEOUTBUDGET);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SKIPCACHEWAIT);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWPENDINGVISIBILITY);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.EXPECTEDCACHEFIELDS);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MINIMUMCACHEFIELDS);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.FALLBACKPHASE);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SESSIONID);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.DELIVERYPRIORITY);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WORKCLASS);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.IGNOREEXISTING);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWPRESSUREDEFER);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PRESSURERETRYAFTERMS);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.COALESCINGKEY);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ALLOWCOALESCING);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MERGEPOLICY);
      writeOptions = copyOption(writeOptions, options, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PHASESCOPE);
      return writeOptions;
    }
  }

  /**
   * @return {Object}
   */
  getStats() {
    if (stryMutAct_9fa48("62843")) {
      {}
    } else {
      stryCov_9fa48("62843");
      return stryMutAct_9fa48("62844") ? {} : (stryCov_9fa48("62844"), {
        limits: stryMutAct_9fa48("62845") ? {} : (stryCov_9fa48("62845"), {
          ...this.gatewayLimits
        }),
        retainedRequests: stryMutAct_9fa48("62846") ? {} : (stryCov_9fa48("62846"), {
          inFlightReads: this.inFlightReadRequestsByKey.size,
          inFlightQueries: this.inFlightQueryRequestsByKey.size,
          inFlightMutations: this.inFlightMutationRequestsByKey.size,
          pendingReplaceMutations: this.pendingReplaceMutationRequestsByKey.size,
          total: stryMutAct_9fa48("62847") ? this.inFlightReadRequestsByKey.size + this.inFlightQueryRequestsByKey.size + this.inFlightMutationRequestsByKey.size - this.pendingReplaceMutationRequestsByKey.size : (stryCov_9fa48("62847"), (stryMutAct_9fa48("62848") ? this.inFlightReadRequestsByKey.size + this.inFlightQueryRequestsByKey.size - this.inFlightMutationRequestsByKey.size : (stryCov_9fa48("62848"), (stryMutAct_9fa48("62849") ? this.inFlightReadRequestsByKey.size - this.inFlightQueryRequestsByKey.size : (stryCov_9fa48("62849"), this.inFlightReadRequestsByKey.size + this.inFlightQueryRequestsByKey.size)) + this.inFlightMutationRequestsByKey.size)) + this.pendingReplaceMutationRequestsByKey.size)
        }),
        metrics: this.buildGatewayMetricsSnapshot()
      });
    }
  }

  /**
   * @return {Object}
   * @private
   */
  buildGatewayMetricsSnapshot() {
    if (stryMutAct_9fa48("62850")) {
      {}
    } else {
      stryCov_9fa48("62850");
      return stryMutAct_9fa48("62851") ? {} : (stryCov_9fa48("62851"), {
        ...this.gatewayMetrics,
        readOutcomeCounts: stryMutAct_9fa48("62852") ? {} : (stryCov_9fa48("62852"), {
          ...this.gatewayMetrics.readOutcomeCounts
        }),
        mutationOutcomeCounts: stryMutAct_9fa48("62853") ? {} : (stryCov_9fa48("62853"), {
          ...this.gatewayMetrics.mutationOutcomeCounts
        })
      });
    }
  }

  /**
   * @return {Object}
   * @private
   */
  buildRetainedRequestsSnapshot() {
    if (stryMutAct_9fa48("62854")) {
      {}
    } else {
      stryCov_9fa48("62854");
      return stryMutAct_9fa48("62855") ? {} : (stryCov_9fa48("62855"), {
        inFlightReads: this.inFlightReadRequestsByKey.size,
        inFlightQueries: this.inFlightQueryRequestsByKey.size,
        inFlightMutations: this.inFlightMutationRequestsByKey.size,
        pendingReplaceMutations: this.pendingReplaceMutationRequestsByKey.size,
        total: stryMutAct_9fa48("62856") ? this.inFlightReadRequestsByKey.size + this.inFlightQueryRequestsByKey.size + this.inFlightMutationRequestsByKey.size - this.pendingReplaceMutationRequestsByKey.size : (stryCov_9fa48("62856"), (stryMutAct_9fa48("62857") ? this.inFlightReadRequestsByKey.size + this.inFlightQueryRequestsByKey.size - this.inFlightMutationRequestsByKey.size : (stryCov_9fa48("62857"), (stryMutAct_9fa48("62858") ? this.inFlightReadRequestsByKey.size - this.inFlightQueryRequestsByKey.size : (stryCov_9fa48("62858"), this.inFlightReadRequestsByKey.size + this.inFlightQueryRequestsByKey.size)) + this.inFlightMutationRequestsByKey.size)) + this.pendingReplaceMutationRequestsByKey.size)
      });
    }
  }

  /**
   * @return {Object}
   * @private
   */
  buildRetentionMetricData() {
    if (stryMutAct_9fa48("62859")) {
      {}
    } else {
      stryCov_9fa48("62859");
      const retainedRequests = this.buildRetainedRequestsSnapshot();
      const retainedRequestCapacity = stryMutAct_9fa48("62860") ? this.gatewayLimits.maxTrackedReadRequests + this.gatewayLimits.maxTrackedQueryRequests + this.gatewayLimits.maxTrackedMutationRequests - this.gatewayLimits.maxPendingReplaceMutationRequests : (stryCov_9fa48("62860"), (stryMutAct_9fa48("62861") ? this.gatewayLimits.maxTrackedReadRequests + this.gatewayLimits.maxTrackedQueryRequests - this.gatewayLimits.maxTrackedMutationRequests : (stryCov_9fa48("62861"), (stryMutAct_9fa48("62862") ? this.gatewayLimits.maxTrackedReadRequests - this.gatewayLimits.maxTrackedQueryRequests : (stryCov_9fa48("62862"), this.gatewayLimits.maxTrackedReadRequests + this.gatewayLimits.maxTrackedQueryRequests)) + this.gatewayLimits.maxTrackedMutationRequests)) + this.gatewayLimits.maxPendingReplaceMutationRequests);
      return stryMutAct_9fa48("62863") ? {} : (stryCov_9fa48("62863"), {
        nodeId: this.nodeId,
        retainedRequests,
        limits: stryMutAct_9fa48("62864") ? {} : (stryCov_9fa48("62864"), {
          ...this.gatewayLimits
        }),
        retainedRequestCapacity,
        retainedRequestUtilization: (stryMutAct_9fa48("62868") ? retainedRequestCapacity <= NUM.ZERO : stryMutAct_9fa48("62867") ? retainedRequestCapacity >= NUM.ZERO : stryMutAct_9fa48("62866") ? false : stryMutAct_9fa48("62865") ? true : (stryCov_9fa48("62865", "62866", "62867", "62868"), retainedRequestCapacity > NUM.ZERO)) ? stryMutAct_9fa48("62869") ? retainedRequests.total * retainedRequestCapacity : (stryCov_9fa48("62869"), retainedRequests.total / retainedRequestCapacity) : NUM.ZERO,
        boundedByTrackedCapacity: stryMutAct_9fa48("62873") ? retainedRequests.total > retainedRequestCapacity : stryMutAct_9fa48("62872") ? retainedRequests.total < retainedRequestCapacity : stryMutAct_9fa48("62871") ? false : stryMutAct_9fa48("62870") ? true : (stryCov_9fa48("62870", "62871", "62872", "62873"), retainedRequests.total <= retainedRequestCapacity),
        maxObservedRetainedRequestCount: this.gatewayMetrics.maxObservedRetainedRequestCount
      });
    }
  }

  /**
   * @private
   */
  recordGatewayRetentionSnapshot() {
    if (stryMutAct_9fa48("62874")) {
      {}
    } else {
      stryCov_9fa48("62874");
      const retainedRequests = this.buildRetainedRequestsSnapshot();
      const retainedRequestCount = retainedRequests.total;
      this.gatewayMetrics.maxObservedInFlightReadRequests = stryMutAct_9fa48("62875") ? Math.min(this.gatewayMetrics.maxObservedInFlightReadRequests, retainedRequests.inFlightReads) : (stryCov_9fa48("62875"), Math.max(this.gatewayMetrics.maxObservedInFlightReadRequests, retainedRequests.inFlightReads));
      this.gatewayMetrics.maxObservedInFlightQueryRequests = stryMutAct_9fa48("62876") ? Math.min(this.gatewayMetrics.maxObservedInFlightQueryRequests, retainedRequests.inFlightQueries) : (stryCov_9fa48("62876"), Math.max(this.gatewayMetrics.maxObservedInFlightQueryRequests, retainedRequests.inFlightQueries));
      this.gatewayMetrics.maxObservedInFlightMutationRequests = stryMutAct_9fa48("62877") ? Math.min(this.gatewayMetrics.maxObservedInFlightMutationRequests, retainedRequests.inFlightMutations) : (stryCov_9fa48("62877"), Math.max(this.gatewayMetrics.maxObservedInFlightMutationRequests, retainedRequests.inFlightMutations));
      this.gatewayMetrics.maxObservedPendingReplaceMutationRequests = stryMutAct_9fa48("62878") ? Math.min(this.gatewayMetrics.maxObservedPendingReplaceMutationRequests, retainedRequests.pendingReplaceMutations) : (stryCov_9fa48("62878"), Math.max(this.gatewayMetrics.maxObservedPendingReplaceMutationRequests, retainedRequests.pendingReplaceMutations));
      this.gatewayMetrics.maxObservedRetainedRequestCount = stryMutAct_9fa48("62879") ? Math.min(this.gatewayMetrics.maxObservedRetainedRequestCount, retainedRequestCount) : (stryCov_9fa48("62879"), Math.max(this.gatewayMetrics.maxObservedRetainedRequestCount, retainedRequestCount));
      this.emitGatewayRetentionMetric();
    }
  }

  /**
   * @param {string} metricName
   * @private
   */
  incrementGatewayMetric(metricName) {
    if (stryMutAct_9fa48("62880")) {
      {}
    } else {
      stryCov_9fa48("62880");
      if (stryMutAct_9fa48("62883") ? typeof this.gatewayMetrics?.[metricName] === TYPEOF.NUMBER : stryMutAct_9fa48("62882") ? false : stryMutAct_9fa48("62881") ? true : (stryCov_9fa48("62881", "62882", "62883"), typeof (stryMutAct_9fa48("62884") ? this.gatewayMetrics[metricName] : (stryCov_9fa48("62884"), this.gatewayMetrics?.[metricName])) !== TYPEOF.NUMBER)) {
        if (stryMutAct_9fa48("62885")) {
          {}
        } else {
          stryCov_9fa48("62885");
          return;
        }
      }
      stryMutAct_9fa48("62886") ? this.gatewayMetrics[metricName] -= CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE : (stryCov_9fa48("62886"), this.gatewayMetrics[metricName] += CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE);
    }
  }

  /**
   * @param {string} metricName
   * @param {number} latencyMs
   * @private
   */
  recordGatewayLatency(metricName, latencyMs) {
    if (stryMutAct_9fa48("62887")) {
      {}
    } else {
      stryCov_9fa48("62887");
      if (stryMutAct_9fa48("62890") ? typeof this.gatewayMetrics?.[metricName] === TYPEOF.NUMBER : stryMutAct_9fa48("62889") ? false : stryMutAct_9fa48("62888") ? true : (stryCov_9fa48("62888", "62889", "62890"), typeof (stryMutAct_9fa48("62891") ? this.gatewayMetrics[metricName] : (stryCov_9fa48("62891"), this.gatewayMetrics?.[metricName])) !== TYPEOF.NUMBER)) {
        if (stryMutAct_9fa48("62892")) {
          {}
        } else {
          stryCov_9fa48("62892");
          return;
        }
      }
      if (stryMutAct_9fa48("62895") ? !Number.isFinite(latencyMs) && latencyMs < NUM.ZERO : stryMutAct_9fa48("62894") ? false : stryMutAct_9fa48("62893") ? true : (stryCov_9fa48("62893", "62894", "62895"), (stryMutAct_9fa48("62896") ? Number.isFinite(latencyMs) : (stryCov_9fa48("62896"), !Number.isFinite(latencyMs))) || (stryMutAct_9fa48("62899") ? latencyMs >= NUM.ZERO : stryMutAct_9fa48("62898") ? latencyMs <= NUM.ZERO : stryMutAct_9fa48("62897") ? false : (stryCov_9fa48("62897", "62898", "62899"), latencyMs < NUM.ZERO)))) {
        if (stryMutAct_9fa48("62900")) {
          {}
        } else {
          stryCov_9fa48("62900");
          return;
        }
      }
      this.gatewayMetrics[metricName] = stryMutAct_9fa48("62901") ? Math.min(this.gatewayMetrics[metricName], Math.floor(latencyMs)) : (stryCov_9fa48("62901"), Math.max(this.gatewayMetrics[metricName], Math.floor(latencyMs)));
    }
  }

  /**
   * @param {string} bucketName
   * @param {string|null} outcome
   * @private
   */
  incrementGatewayOutcomeMetric(bucketName, outcome) {
    if (stryMutAct_9fa48("62902")) {
      {}
    } else {
      stryCov_9fa48("62902");
      const bucket = stryMutAct_9fa48("62903") ? this.gatewayMetrics[bucketName] : (stryCov_9fa48("62903"), this.gatewayMetrics?.[bucketName]);
      if (stryMutAct_9fa48("62906") ? !bucket && typeof bucket !== TYPEOF.OBJECT : stryMutAct_9fa48("62905") ? false : stryMutAct_9fa48("62904") ? true : (stryCov_9fa48("62904", "62905", "62906"), (stryMutAct_9fa48("62907") ? bucket : (stryCov_9fa48("62907"), !bucket)) || (stryMutAct_9fa48("62909") ? typeof bucket === TYPEOF.OBJECT : stryMutAct_9fa48("62908") ? false : (stryCov_9fa48("62908", "62909"), typeof bucket !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("62910")) {
          {}
        } else {
          stryCov_9fa48("62910");
          return;
        }
      }
      const normalizedOutcome = (stryMutAct_9fa48("62913") ? typeof outcome === TYPEOF.STRING || outcome.length > NUM.ZERO : stryMutAct_9fa48("62912") ? false : stryMutAct_9fa48("62911") ? true : (stryCov_9fa48("62911", "62912", "62913"), (stryMutAct_9fa48("62915") ? typeof outcome !== TYPEOF.STRING : stryMutAct_9fa48("62914") ? true : (stryCov_9fa48("62914", "62915"), typeof outcome === TYPEOF.STRING)) && (stryMutAct_9fa48("62918") ? outcome.length <= NUM.ZERO : stryMutAct_9fa48("62917") ? outcome.length >= NUM.ZERO : stryMutAct_9fa48("62916") ? true : (stryCov_9fa48("62916", "62917", "62918"), outcome.length > NUM.ZERO)))) ? outcome : stryMutAct_9fa48("62919") ? "" : (stryCov_9fa48("62919"), 'unknown');
      bucket[normalizedOutcome] = Number.isFinite(bucket[normalizedOutcome]) ? stryMutAct_9fa48("62920") ? bucket[normalizedOutcome] - NUM.ONE : (stryCov_9fa48("62920"), bucket[normalizedOutcome] + NUM.ONE) : NUM.ONE;
    }
  }

  /**
   * @param {string} tag
   * @param {Object} data
   * @private
   */
  emitGatewayMetric(tag, data) {
    if (stryMutAct_9fa48("62921")) {
      {}
    } else {
      stryCov_9fa48("62921");
      if (stryMutAct_9fa48("62924") ? typeof this.logger?.info === TYPEOF.FUNCTION : stryMutAct_9fa48("62923") ? false : stryMutAct_9fa48("62922") ? true : (stryCov_9fa48("62922", "62923", "62924"), typeof (stryMutAct_9fa48("62925") ? this.logger.info : (stryCov_9fa48("62925"), this.logger?.info)) !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("62926")) {
          {}
        } else {
          stryCov_9fa48("62926");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("62927")) {
          {}
        } else {
          stryCov_9fa48("62927");
          this.logger.info(tag, data);
        }
      } catch (_error) {
        // Metrics logging must not change gateway behavior.
      }
    }
  }

  /**
   * @param {string} message
   * @param {Object} data
   * @private
   */
  emitGatewayWarning(message, data) {
    if (stryMutAct_9fa48("62928")) {
      {}
    } else {
      stryCov_9fa48("62928");
      if (stryMutAct_9fa48("62931") ? typeof this.logger?.warn === TYPEOF.FUNCTION : stryMutAct_9fa48("62930") ? false : stryMutAct_9fa48("62929") ? true : (stryCov_9fa48("62929", "62930", "62931"), typeof (stryMutAct_9fa48("62932") ? this.logger.warn : (stryCov_9fa48("62932"), this.logger?.warn)) !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("62933")) {
          {}
        } else {
          stryCov_9fa48("62933");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("62934")) {
          {}
        } else {
          stryCov_9fa48("62934");
          this.logger.warn(message, data);
        }
      } catch (_error) {
        // Diagnostic logging must not change gateway behavior.
      }
    }
  }

  /**
   * @private
   */
  emitGatewayRetentionMetric() {
    if (stryMutAct_9fa48("62935")) {
      {}
    } else {
      stryCov_9fa48("62935");
      const data = this.buildRetentionMetricData();
      const signature = stableSerialize(data);
      if (stryMutAct_9fa48("62938") ? signature !== this.lastRetentionMetricSignature : stryMutAct_9fa48("62937") ? false : stryMutAct_9fa48("62936") ? true : (stryCov_9fa48("62936", "62937", "62938"), signature === this.lastRetentionMetricSignature)) {
        if (stryMutAct_9fa48("62939")) {
          {}
        } else {
          stryCov_9fa48("62939");
          return;
        }
      }
      this.lastRetentionMetricSignature = signature;
      this.emitGatewayMetric(METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_RETENTION, data);
    }
  }

  /**
   * @param {number} startedAtMs
   * @return {number}
   * @private
   */
  resolveLatencyMs(startedAtMs) {
    if (stryMutAct_9fa48("62940")) {
      {}
    } else {
      stryCov_9fa48("62940");
      if (stryMutAct_9fa48("62943") ? false : stryMutAct_9fa48("62942") ? true : stryMutAct_9fa48("62941") ? Number.isFinite(startedAtMs) : (stryCov_9fa48("62941", "62942", "62943"), !Number.isFinite(startedAtMs))) {
        if (stryMutAct_9fa48("62944")) {
          {}
        } else {
          stryCov_9fa48("62944");
          return NUM.ZERO;
        }
      }
      return stryMutAct_9fa48("62945") ? Math.min(NUM.ZERO, Math.floor(this.now() - startedAtMs)) : (stryCov_9fa48("62945"), Math.max(NUM.ZERO, Math.floor(stryMutAct_9fa48("62946") ? this.now() + startedAtMs : (stryCov_9fa48("62946"), this.now() - startedAtMs))));
    }
  }

  /**
   * @param {Object} context
   * @param {Object} result
   * @private
   */
  recordReadTelemetry(context = {}, result = {}) {
    if (stryMutAct_9fa48("62947")) {
      {}
    } else {
      stryCov_9fa48("62947");
      const latencyMs = this.resolveLatencyMs(context.startedAtMs);
      const outcome = (stryMutAct_9fa48("62950") ? typeof result?.outcome !== TYPEOF.STRING : stryMutAct_9fa48("62949") ? false : stryMutAct_9fa48("62948") ? true : (stryCov_9fa48("62948", "62949", "62950"), typeof (stryMutAct_9fa48("62951") ? result.outcome : (stryCov_9fa48("62951"), result?.outcome)) === TYPEOF.STRING)) ? result.outcome : CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY;
      this.incrementGatewayOutcomeMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READOUTCOMECOUNTS, outcome);
      this.recordGatewayLatency(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MAXOBSERVEDREADLATENCYMS, latencyMs);
      this.emitGatewayMetric(METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_READ, stryMutAct_9fa48("62952") ? {} : (stryCov_9fa48("62952"), {
        nodeId: this.nodeId,
        owner: stryMutAct_9fa48("62955") ? context.owner && null : stryMutAct_9fa48("62954") ? false : stryMutAct_9fa48("62953") ? true : (stryCov_9fa48("62953", "62954", "62955"), context.owner || null),
        tableName: stryMutAct_9fa48("62958") ? context.tableName && null : stryMutAct_9fa48("62957") ? false : stryMutAct_9fa48("62956") ? true : (stryCov_9fa48("62956", "62957", "62958"), context.tableName || null),
        outcome,
        strategy: stryMutAct_9fa48("62961") ? (result?.strategyUsed || context.strategy) && null : stryMutAct_9fa48("62960") ? false : stryMutAct_9fa48("62959") ? true : (stryCov_9fa48("62959", "62960", "62961"), (stryMutAct_9fa48("62963") ? result?.strategyUsed && context.strategy : stryMutAct_9fa48("62962") ? false : (stryCov_9fa48("62962", "62963"), (stryMutAct_9fa48("62964") ? result.strategyUsed : (stryCov_9fa48("62964"), result?.strategyUsed)) || context.strategy)) || null),
        readProfile: stryMutAct_9fa48("62967") ? context.readProfile && null : stryMutAct_9fa48("62966") ? false : stryMutAct_9fa48("62965") ? true : (stryCov_9fa48("62965", "62966", "62967"), context.readProfile || null),
        workClass: stryMutAct_9fa48("62970") ? context.workClass && null : stryMutAct_9fa48("62969") ? false : stryMutAct_9fa48("62968") ? true : (stryCov_9fa48("62968", "62969", "62970"), context.workClass || null),
        coalescingKey: stryMutAct_9fa48("62973") ? context.coalescingKey && null : stryMutAct_9fa48("62972") ? false : stryMutAct_9fa48("62971") ? true : (stryCov_9fa48("62971", "62972", "62973"), context.coalescingKey || null),
        latencyMs,
        success: stryMutAct_9fa48("62976") ? result?.success !== true : stryMutAct_9fa48("62975") ? false : stryMutAct_9fa48("62974") ? true : (stryCov_9fa48("62974", "62975", "62976"), (stryMutAct_9fa48("62977") ? result.success : (stryCov_9fa48("62977"), result?.success)) === (stryMutAct_9fa48("62978") ? false : (stryCov_9fa48("62978"), true))),
        rowCount: Number.isFinite(stryMutAct_9fa48("62979") ? result.rowCount : (stryCov_9fa48("62979"), result?.rowCount)) ? result.rowCount : Array.isArray(stryMutAct_9fa48("62980") ? result.rows : (stryCov_9fa48("62980"), result?.rows)) ? result.rows.length : NUM.ZERO
      }));
      if (stryMutAct_9fa48("62983") ? outcome === CONTROL_PLANE_READ_OUTCOME.DEFERRED && outcome === CONTROL_PLANE_READ_OUTCOME.REJECTED : stryMutAct_9fa48("62982") ? false : stryMutAct_9fa48("62981") ? true : (stryCov_9fa48("62981", "62982", "62983"), (stryMutAct_9fa48("62985") ? outcome !== CONTROL_PLANE_READ_OUTCOME.DEFERRED : stryMutAct_9fa48("62984") ? false : (stryCov_9fa48("62984", "62985"), outcome === CONTROL_PLANE_READ_OUTCOME.DEFERRED)) || (stryMutAct_9fa48("62987") ? outcome !== CONTROL_PLANE_READ_OUTCOME.REJECTED : stryMutAct_9fa48("62986") ? false : (stryCov_9fa48("62986", "62987"), outcome === CONTROL_PLANE_READ_OUTCOME.REJECTED)))) {
        if (stryMutAct_9fa48("62988")) {
          {}
        } else {
          stryCov_9fa48("62988");
          this.emitGatewayWarning((stryMutAct_9fa48("62991") ? outcome !== CONTROL_PLANE_READ_OUTCOME.DEFERRED : stryMutAct_9fa48("62990") ? false : stryMutAct_9fa48("62989") ? true : (stryCov_9fa48("62989", "62990", "62991"), outcome === CONTROL_PLANE_READ_OUTCOME.DEFERRED)) ? GATEWAY_LOG_MSG.READ_DEFERRED : GATEWAY_LOG_MSG.READ_REJECTED, stryMutAct_9fa48("62992") ? {} : (stryCov_9fa48("62992"), {
            nodeId: this.nodeId,
            owner: stryMutAct_9fa48("62995") ? context.owner && null : stryMutAct_9fa48("62994") ? false : stryMutAct_9fa48("62993") ? true : (stryCov_9fa48("62993", "62994", "62995"), context.owner || null),
            tableName: stryMutAct_9fa48("62998") ? context.tableName && null : stryMutAct_9fa48("62997") ? false : stryMutAct_9fa48("62996") ? true : (stryCov_9fa48("62996", "62997", "62998"), context.tableName || null),
            strategy: stryMutAct_9fa48("63001") ? (result?.strategyUsed || context.strategy) && null : stryMutAct_9fa48("63000") ? false : stryMutAct_9fa48("62999") ? true : (stryCov_9fa48("62999", "63000", "63001"), (stryMutAct_9fa48("63003") ? result?.strategyUsed && context.strategy : stryMutAct_9fa48("63002") ? false : (stryCov_9fa48("63002", "63003"), (stryMutAct_9fa48("63004") ? result.strategyUsed : (stryCov_9fa48("63004"), result?.strategyUsed)) || context.strategy)) || null),
            workClass: stryMutAct_9fa48("63007") ? context.workClass && null : stryMutAct_9fa48("63006") ? false : stryMutAct_9fa48("63005") ? true : (stryCov_9fa48("63005", "63006", "63007"), context.workClass || null),
            coalescingKey: stryMutAct_9fa48("63010") ? context.coalescingKey && null : stryMutAct_9fa48("63009") ? false : stryMutAct_9fa48("63008") ? true : (stryCov_9fa48("63008", "63009", "63010"), context.coalescingKey || null),
            pressureAction: stryMutAct_9fa48("63013") ? result?.pressureAction && null : stryMutAct_9fa48("63012") ? false : stryMutAct_9fa48("63011") ? true : (stryCov_9fa48("63011", "63012", "63013"), (stryMutAct_9fa48("63014") ? result.pressureAction : (stryCov_9fa48("63014"), result?.pressureAction)) || null),
            pressureReason: stryMutAct_9fa48("63017") ? result?.pressureReason && null : stryMutAct_9fa48("63016") ? false : stryMutAct_9fa48("63015") ? true : (stryCov_9fa48("63015", "63016", "63017"), (stryMutAct_9fa48("63018") ? result.pressureReason : (stryCov_9fa48("63018"), result?.pressureReason)) || null),
            retryAfterMs: Number.isFinite(stryMutAct_9fa48("63019") ? result.retryAfterMs : (stryCov_9fa48("63019"), result?.retryAfterMs)) ? result.retryAfterMs : null,
            error: stryMutAct_9fa48("63022") ? result?.error && null : stryMutAct_9fa48("63021") ? false : stryMutAct_9fa48("63020") ? true : (stryCov_9fa48("63020", "63021", "63022"), (stryMutAct_9fa48("63023") ? result.error : (stryCov_9fa48("63023"), result?.error)) || null)
          }));
        }
      }
    }
  }

  /**
   * @param {Object} context
   * @param {Object} result
   * @private
   */
  recordMutationTelemetry(context = {}, result = {}) {
    if (stryMutAct_9fa48("63024")) {
      {}
    } else {
      stryCov_9fa48("63024");
      const latencyMs = this.resolveLatencyMs(context.startedAtMs);
      const outcome = (stryMutAct_9fa48("63027") ? typeof result?.outcome !== TYPEOF.STRING : stryMutAct_9fa48("63026") ? false : stryMutAct_9fa48("63025") ? true : (stryCov_9fa48("63025", "63026", "63027"), typeof (stryMutAct_9fa48("63028") ? result.outcome : (stryCov_9fa48("63028"), result?.outcome)) === TYPEOF.STRING)) ? result.outcome : CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY;
      this.incrementGatewayOutcomeMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONOUTCOMECOUNTS, outcome);
      this.recordGatewayLatency(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MAXOBSERVEDMUTATIONLATENCYMS, latencyMs);
      this.emitGatewayMetric(METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_MUTATION, stryMutAct_9fa48("63029") ? {} : (stryCov_9fa48("63029"), {
        nodeId: this.nodeId,
        owner: stryMutAct_9fa48("63032") ? context.owner && null : stryMutAct_9fa48("63031") ? false : stryMutAct_9fa48("63030") ? true : (stryCov_9fa48("63030", "63031", "63032"), context.owner || null),
        tableName: stryMutAct_9fa48("63035") ? context.tableName && null : stryMutAct_9fa48("63034") ? false : stryMutAct_9fa48("63033") ? true : (stryCov_9fa48("63033", "63034", "63035"), context.tableName || null),
        operation: stryMutAct_9fa48("63038") ? context.operation && null : stryMutAct_9fa48("63037") ? false : stryMutAct_9fa48("63036") ? true : (stryCov_9fa48("63036", "63037", "63038"), context.operation || null),
        outcome,
        workClass: stryMutAct_9fa48("63041") ? context.workClass && null : stryMutAct_9fa48("63040") ? false : stryMutAct_9fa48("63039") ? true : (stryCov_9fa48("63039", "63040", "63041"), context.workClass || null),
        coalescingKey: stryMutAct_9fa48("63044") ? context.coalescingKey && null : stryMutAct_9fa48("63043") ? false : stryMutAct_9fa48("63042") ? true : (stryCov_9fa48("63042", "63043", "63044"), context.coalescingKey || null),
        mergePolicy: stryMutAct_9fa48("63047") ? context.mergePolicy && null : stryMutAct_9fa48("63046") ? false : stryMutAct_9fa48("63045") ? true : (stryCov_9fa48("63045", "63046", "63047"), context.mergePolicy || null),
        latencyMs,
        success: stryMutAct_9fa48("63050") ? result?.success !== true : stryMutAct_9fa48("63049") ? false : stryMutAct_9fa48("63048") ? true : (stryCov_9fa48("63048", "63049", "63050"), (stryMutAct_9fa48("63051") ? result.success : (stryCov_9fa48("63051"), result?.success)) === (stryMutAct_9fa48("63052") ? false : (stryCov_9fa48("63052"), true)))
      }));
      if (stryMutAct_9fa48("63055") ? outcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED && outcome === CONTROL_PLANE_MUTATION_OUTCOME.REJECTED : stryMutAct_9fa48("63054") ? false : stryMutAct_9fa48("63053") ? true : (stryCov_9fa48("63053", "63054", "63055"), (stryMutAct_9fa48("63057") ? outcome !== CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED : stryMutAct_9fa48("63056") ? false : (stryCov_9fa48("63056", "63057"), outcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED)) || (stryMutAct_9fa48("63059") ? outcome !== CONTROL_PLANE_MUTATION_OUTCOME.REJECTED : stryMutAct_9fa48("63058") ? false : (stryCov_9fa48("63058", "63059"), outcome === CONTROL_PLANE_MUTATION_OUTCOME.REJECTED)))) {
        if (stryMutAct_9fa48("63060")) {
          {}
        } else {
          stryCov_9fa48("63060");
          this.emitGatewayWarning((stryMutAct_9fa48("63063") ? outcome !== CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED : stryMutAct_9fa48("63062") ? false : stryMutAct_9fa48("63061") ? true : (stryCov_9fa48("63061", "63062", "63063"), outcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED)) ? GATEWAY_LOG_MSG.MUTATION_DEFERRED : GATEWAY_LOG_MSG.MUTATION_REJECTED, stryMutAct_9fa48("63064") ? {} : (stryCov_9fa48("63064"), {
            nodeId: this.nodeId,
            owner: stryMutAct_9fa48("63067") ? context.owner && null : stryMutAct_9fa48("63066") ? false : stryMutAct_9fa48("63065") ? true : (stryCov_9fa48("63065", "63066", "63067"), context.owner || null),
            tableName: stryMutAct_9fa48("63070") ? context.tableName && null : stryMutAct_9fa48("63069") ? false : stryMutAct_9fa48("63068") ? true : (stryCov_9fa48("63068", "63069", "63070"), context.tableName || null),
            operation: stryMutAct_9fa48("63073") ? context.operation && null : stryMutAct_9fa48("63072") ? false : stryMutAct_9fa48("63071") ? true : (stryCov_9fa48("63071", "63072", "63073"), context.operation || null),
            workClass: stryMutAct_9fa48("63076") ? context.workClass && null : stryMutAct_9fa48("63075") ? false : stryMutAct_9fa48("63074") ? true : (stryCov_9fa48("63074", "63075", "63076"), context.workClass || null),
            coalescingKey: stryMutAct_9fa48("63079") ? context.coalescingKey && null : stryMutAct_9fa48("63078") ? false : stryMutAct_9fa48("63077") ? true : (stryCov_9fa48("63077", "63078", "63079"), context.coalescingKey || null),
            mergePolicy: stryMutAct_9fa48("63082") ? context.mergePolicy && null : stryMutAct_9fa48("63081") ? false : stryMutAct_9fa48("63080") ? true : (stryCov_9fa48("63080", "63081", "63082"), context.mergePolicy || null),
            pressureAction: stryMutAct_9fa48("63085") ? result?.pressureAction && null : stryMutAct_9fa48("63084") ? false : stryMutAct_9fa48("63083") ? true : (stryCov_9fa48("63083", "63084", "63085"), (stryMutAct_9fa48("63086") ? result.pressureAction : (stryCov_9fa48("63086"), result?.pressureAction)) || null),
            pressureReason: stryMutAct_9fa48("63089") ? result?.pressureReason && null : stryMutAct_9fa48("63088") ? false : stryMutAct_9fa48("63087") ? true : (stryCov_9fa48("63087", "63088", "63089"), (stryMutAct_9fa48("63090") ? result.pressureReason : (stryCov_9fa48("63090"), result?.pressureReason)) || null),
            retryAfterMs: Number.isFinite(stryMutAct_9fa48("63091") ? result.retryAfterMs : (stryCov_9fa48("63091"), result?.retryAfterMs)) ? result.retryAfterMs : null,
            error: stryMutAct_9fa48("63094") ? result?.error && null : stryMutAct_9fa48("63093") ? false : stryMutAct_9fa48("63092") ? true : (stryCov_9fa48("63092", "63093", "63094"), (stryMutAct_9fa48("63095") ? result.error : (stryCov_9fa48("63095"), result?.error)) || null)
          }));
        }
      }
    }
  }

  /**
   * @param {Object} result
   * @return {Object}
   * @private
   */
  buildTrackingSaturatedMutationResult(result = {}) {
    if (stryMutAct_9fa48("63096")) {
      {}
    } else {
      stryCov_9fa48("63096");
      return stryMutAct_9fa48("63097") ? {} : (stryCov_9fa48("63097"), {
        success: stryMutAct_9fa48("63098") ? true : (stryCov_9fa48("63098"), false),
        error: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_PLANE_MUTATION_TRACKING_SATURATED,
        errorCode: CONTROL_PLANE_GATEWAY_ERROR_CODE.MUTATION_TRACKING_SATURATED,
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
        ...result
      });
    }
  }

  /**
   * @param {Map<string, Promise<Object>>} requestMap
   * @param {string|null} key
   * @param {Function} executionFactory
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  runSingleFlight(requestMap, key, executionFactory, options = {}) {
    if (stryMutAct_9fa48("63099")) {
      {}
    } else {
      stryCov_9fa48("63099");
      if (stryMutAct_9fa48("63102") ? false : stryMutAct_9fa48("63101") ? true : stryMutAct_9fa48("63100") ? key : (stryCov_9fa48("63100", "63101", "63102"), !key)) {
        if (stryMutAct_9fa48("63103")) {
          {}
        } else {
          stryCov_9fa48("63103");
          return executionFactory();
        }
      }
      const existingRequest = requestMap.get(key);
      if (stryMutAct_9fa48("63105") ? false : stryMutAct_9fa48("63104") ? true : (stryCov_9fa48("63104", "63105"), existingRequest)) {
        if (stryMutAct_9fa48("63106")) {
          {}
        } else {
          stryCov_9fa48("63106");
          if (stryMutAct_9fa48("63109") ? typeof options?.joinMetricName !== TYPEOF.STRING : stryMutAct_9fa48("63108") ? false : stryMutAct_9fa48("63107") ? true : (stryCov_9fa48("63107", "63108", "63109"), typeof (stryMutAct_9fa48("63110") ? options.joinMetricName : (stryCov_9fa48("63110"), options?.joinMetricName)) === TYPEOF.STRING)) {
            if (stryMutAct_9fa48("63111")) {
              {}
            } else {
              stryCov_9fa48("63111");
              this.incrementGatewayMetric(options.joinMetricName);
            }
          }
          return existingRequest;
        }
      }
      const maxTrackedRequests = normalizePositiveInteger(stryMutAct_9fa48("63112") ? options.maxTrackedRequests : (stryCov_9fa48("63112"), options?.maxTrackedRequests), Number.MAX_SAFE_INTEGER);
      if (stryMutAct_9fa48("63116") ? requestMap.size < maxTrackedRequests : stryMutAct_9fa48("63115") ? requestMap.size > maxTrackedRequests : stryMutAct_9fa48("63114") ? false : stryMutAct_9fa48("63113") ? true : (stryCov_9fa48("63113", "63114", "63115", "63116"), requestMap.size >= maxTrackedRequests)) {
        if (stryMutAct_9fa48("63117")) {
          {}
        } else {
          stryCov_9fa48("63117");
          if (stryMutAct_9fa48("63120") ? typeof options?.bypassMetricName !== TYPEOF.STRING : stryMutAct_9fa48("63119") ? false : stryMutAct_9fa48("63118") ? true : (stryCov_9fa48("63118", "63119", "63120"), typeof (stryMutAct_9fa48("63121") ? options.bypassMetricName : (stryCov_9fa48("63121"), options?.bypassMetricName)) === TYPEOF.STRING)) {
            if (stryMutAct_9fa48("63122")) {
              {}
            } else {
              stryCov_9fa48("63122");
              this.incrementGatewayMetric(options.bypassMetricName);
            }
          }
          return executionFactory();
        }
      }
      let inFlightRequest = null;
      inFlightRequest = Promise.resolve().then(stryMutAct_9fa48("63123") ? () => undefined : (stryCov_9fa48("63123"), () => executionFactory())).finally(() => {
        if (stryMutAct_9fa48("63124")) {
          {}
        } else {
          stryCov_9fa48("63124");
          if (stryMutAct_9fa48("63127") ? requestMap.get(key) !== inFlightRequest : stryMutAct_9fa48("63126") ? false : stryMutAct_9fa48("63125") ? true : (stryCov_9fa48("63125", "63126", "63127"), requestMap.get(key) === inFlightRequest)) {
            if (stryMutAct_9fa48("63128")) {
              {}
            } else {
              stryCov_9fa48("63128");
              requestMap.delete(key);
              this.recordGatewayRetentionSnapshot();
            }
          }
        }
      });
      requestMap.set(key, inFlightRequest);
      this.recordGatewayRetentionSnapshot();
      return inFlightRequest;
    }
  }

  /**
   * @param {Object} mutation
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildMutationCoalescingDescriptor(mutation = {}, options = {}) {
    if (stryMutAct_9fa48("63129")) {
      {}
    } else {
      stryCov_9fa48("63129");
      const allowCoalescing = stryMutAct_9fa48("63132") ? options?.allowCoalescing === false : stryMutAct_9fa48("63131") ? false : stryMutAct_9fa48("63130") ? true : (stryCov_9fa48("63130", "63131", "63132"), (stryMutAct_9fa48("63133") ? options.allowCoalescing : (stryCov_9fa48("63133"), options?.allowCoalescing)) !== (stryMutAct_9fa48("63134") ? true : (stryCov_9fa48("63134"), false)));
      const mergePolicy = stryMutAct_9fa48("63137") ? normalizeMutationMergePolicy(options?.mergePolicy || mutation?.mergePolicy) && (allowCoalescing ? CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT : CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE) : stryMutAct_9fa48("63136") ? false : stryMutAct_9fa48("63135") ? true : (stryCov_9fa48("63135", "63136", "63137"), normalizeMutationMergePolicy(stryMutAct_9fa48("63140") ? options?.mergePolicy && mutation?.mergePolicy : stryMutAct_9fa48("63139") ? false : stryMutAct_9fa48("63138") ? true : (stryCov_9fa48("63138", "63139", "63140"), (stryMutAct_9fa48("63141") ? options.mergePolicy : (stryCov_9fa48("63141"), options?.mergePolicy)) || (stryMutAct_9fa48("63142") ? mutation.mergePolicy : (stryCov_9fa48("63142"), mutation?.mergePolicy)))) || (allowCoalescing ? CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT : CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE));
      const explicitKey = normalizeCoalescingToken(stryMutAct_9fa48("63145") ? options?.coalescingKey && mutation?.coalescingKey : stryMutAct_9fa48("63144") ? false : stryMutAct_9fa48("63143") ? true : (stryCov_9fa48("63143", "63144", "63145"), (stryMutAct_9fa48("63146") ? options.coalescingKey : (stryCov_9fa48("63146"), options?.coalescingKey)) || (stryMutAct_9fa48("63147") ? mutation.coalescingKey : (stryCov_9fa48("63147"), mutation?.coalescingKey))));
      if (stryMutAct_9fa48("63150") ? mergePolicy !== CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE : stryMutAct_9fa48("63149") ? false : stryMutAct_9fa48("63148") ? true : (stryCov_9fa48("63148", "63149", "63150"), mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE)) {
        if (stryMutAct_9fa48("63151")) {
          {}
        } else {
          stryCov_9fa48("63151");
          return stryMutAct_9fa48("63152") ? {} : (stryCov_9fa48("63152"), {
            requestKey: null,
            mergePolicy
          });
        }
      }
      if (stryMutAct_9fa48("63155") ? false : stryMutAct_9fa48("63154") ? true : stryMutAct_9fa48("63153") ? explicitKey : (stryCov_9fa48("63153", "63154", "63155"), !explicitKey)) {
        if (stryMutAct_9fa48("63156")) {
          {}
        } else {
          stryCov_9fa48("63156");
          if (stryMutAct_9fa48("63159") ? mergePolicy !== CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING : stryMutAct_9fa48("63158") ? false : stryMutAct_9fa48("63157") ? true : (stryCov_9fa48("63157", "63158", "63159"), mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING)) {
            if (stryMutAct_9fa48("63160")) {
              {}
            } else {
              stryCov_9fa48("63160");
              return stryMutAct_9fa48("63161") ? {} : (stryCov_9fa48("63161"), {
                requestKey: null,
                mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE
              });
            }
          }
          return stryMutAct_9fa48("63162") ? {} : (stryCov_9fa48("63162"), {
            requestKey: stableSerialize(stryMutAct_9fa48("63163") ? {} : (stryCov_9fa48("63163"), {
              kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_MUTATION,
              tableName: stryMutAct_9fa48("63166") ? mutation?.tableName && null : stryMutAct_9fa48("63165") ? false : stryMutAct_9fa48("63164") ? true : (stryCov_9fa48("63164", "63165", "63166"), (stryMutAct_9fa48("63167") ? mutation.tableName : (stryCov_9fa48("63167"), mutation?.tableName)) || null),
              operation: stryMutAct_9fa48("63170") ? mutation?.operation && null : stryMutAct_9fa48("63169") ? false : stryMutAct_9fa48("63168") ? true : (stryCov_9fa48("63168", "63169", "63170"), (stryMutAct_9fa48("63171") ? mutation.operation : (stryCov_9fa48("63171"), mutation?.operation)) || null),
              row: stryMutAct_9fa48("63174") ? mutation?.row && null : stryMutAct_9fa48("63173") ? false : stryMutAct_9fa48("63172") ? true : (stryCov_9fa48("63172", "63173", "63174"), (stryMutAct_9fa48("63175") ? mutation.row : (stryCov_9fa48("63175"), mutation?.row)) || null),
              whereClause: stryMutAct_9fa48("63178") ? mutation?.whereClause && null : stryMutAct_9fa48("63177") ? false : stryMutAct_9fa48("63176") ? true : (stryCov_9fa48("63176", "63177", "63178"), (stryMutAct_9fa48("63179") ? mutation.whereClause : (stryCov_9fa48("63179"), mutation?.whereClause)) || null),
              data: stryMutAct_9fa48("63182") ? mutation?.data && null : stryMutAct_9fa48("63181") ? false : stryMutAct_9fa48("63180") ? true : (stryCov_9fa48("63180", "63181", "63182"), (stryMutAct_9fa48("63183") ? mutation.data : (stryCov_9fa48("63183"), mutation?.data)) || null),
              workClass: stryMutAct_9fa48("63186") ? options?.workClass && null : stryMutAct_9fa48("63185") ? false : stryMutAct_9fa48("63184") ? true : (stryCov_9fa48("63184", "63185", "63186"), (stryMutAct_9fa48("63187") ? options.workClass : (stryCov_9fa48("63187"), options?.workClass)) || null),
              deliveryPriority: stryMutAct_9fa48("63190") ? options?.deliveryPriority && null : stryMutAct_9fa48("63189") ? false : stryMutAct_9fa48("63188") ? true : (stryCov_9fa48("63188", "63189", "63190"), (stryMutAct_9fa48("63191") ? options.deliveryPriority : (stryCov_9fa48("63191"), options?.deliveryPriority)) || null),
              ignoreExisting: stryMutAct_9fa48("63194") ? options?.ignoreExisting !== true : stryMutAct_9fa48("63193") ? false : stryMutAct_9fa48("63192") ? true : (stryCov_9fa48("63192", "63193", "63194"), (stryMutAct_9fa48("63195") ? options.ignoreExisting : (stryCov_9fa48("63195"), options?.ignoreExisting)) === (stryMutAct_9fa48("63196") ? false : (stryCov_9fa48("63196"), true))),
              allowPressureDefer: stryMutAct_9fa48("63199") ? options?.allowPressureDefer !== true : stryMutAct_9fa48("63198") ? false : stryMutAct_9fa48("63197") ? true : (stryCov_9fa48("63197", "63198", "63199"), (stryMutAct_9fa48("63200") ? options.allowPressureDefer : (stryCov_9fa48("63200"), options?.allowPressureDefer)) === (stryMutAct_9fa48("63201") ? false : (stryCov_9fa48("63201"), true))),
              routingReadinessDimension: stryMutAct_9fa48("63204") ? options?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("63203") ? false : stryMutAct_9fa48("63202") ? true : (stryCov_9fa48("63202", "63203", "63204"), (stryMutAct_9fa48("63205") ? options.routingReadinessDimension : (stryCov_9fa48("63205"), options?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)
            })),
            mergePolicy
          });
        }
      }
      if (stryMutAct_9fa48("63208") ? mergePolicy !== CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT : stryMutAct_9fa48("63207") ? false : stryMutAct_9fa48("63206") ? true : (stryCov_9fa48("63206", "63207", "63208"), mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT)) {
        if (stryMutAct_9fa48("63209")) {
          {}
        } else {
          stryCov_9fa48("63209");
          return stryMutAct_9fa48("63210") ? {} : (stryCov_9fa48("63210"), {
            requestKey: stableSerialize(stryMutAct_9fa48("63211") ? {} : (stryCov_9fa48("63211"), {
              kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_MUTATION,
              explicitKey,
              tableName: stryMutAct_9fa48("63214") ? mutation?.tableName && null : stryMutAct_9fa48("63213") ? false : stryMutAct_9fa48("63212") ? true : (stryCov_9fa48("63212", "63213", "63214"), (stryMutAct_9fa48("63215") ? mutation.tableName : (stryCov_9fa48("63215"), mutation?.tableName)) || null),
              operation: stryMutAct_9fa48("63218") ? mutation?.operation && null : stryMutAct_9fa48("63217") ? false : stryMutAct_9fa48("63216") ? true : (stryCov_9fa48("63216", "63217", "63218"), (stryMutAct_9fa48("63219") ? mutation.operation : (stryCov_9fa48("63219"), mutation?.operation)) || null),
              row: stryMutAct_9fa48("63222") ? mutation?.row && null : stryMutAct_9fa48("63221") ? false : stryMutAct_9fa48("63220") ? true : (stryCov_9fa48("63220", "63221", "63222"), (stryMutAct_9fa48("63223") ? mutation.row : (stryCov_9fa48("63223"), mutation?.row)) || null),
              whereClause: stryMutAct_9fa48("63226") ? mutation?.whereClause && null : stryMutAct_9fa48("63225") ? false : stryMutAct_9fa48("63224") ? true : (stryCov_9fa48("63224", "63225", "63226"), (stryMutAct_9fa48("63227") ? mutation.whereClause : (stryCov_9fa48("63227"), mutation?.whereClause)) || null),
              data: stryMutAct_9fa48("63230") ? mutation?.data && null : stryMutAct_9fa48("63229") ? false : stryMutAct_9fa48("63228") ? true : (stryCov_9fa48("63228", "63229", "63230"), (stryMutAct_9fa48("63231") ? mutation.data : (stryCov_9fa48("63231"), mutation?.data)) || null),
              workClass: stryMutAct_9fa48("63234") ? options?.workClass && null : stryMutAct_9fa48("63233") ? false : stryMutAct_9fa48("63232") ? true : (stryCov_9fa48("63232", "63233", "63234"), (stryMutAct_9fa48("63235") ? options.workClass : (stryCov_9fa48("63235"), options?.workClass)) || null),
              deliveryPriority: stryMutAct_9fa48("63238") ? options?.deliveryPriority && null : stryMutAct_9fa48("63237") ? false : stryMutAct_9fa48("63236") ? true : (stryCov_9fa48("63236", "63237", "63238"), (stryMutAct_9fa48("63239") ? options.deliveryPriority : (stryCov_9fa48("63239"), options?.deliveryPriority)) || null),
              ignoreExisting: stryMutAct_9fa48("63242") ? options?.ignoreExisting !== true : stryMutAct_9fa48("63241") ? false : stryMutAct_9fa48("63240") ? true : (stryCov_9fa48("63240", "63241", "63242"), (stryMutAct_9fa48("63243") ? options.ignoreExisting : (stryCov_9fa48("63243"), options?.ignoreExisting)) === (stryMutAct_9fa48("63244") ? false : (stryCov_9fa48("63244"), true))),
              allowPressureDefer: stryMutAct_9fa48("63247") ? options?.allowPressureDefer !== true : stryMutAct_9fa48("63246") ? false : stryMutAct_9fa48("63245") ? true : (stryCov_9fa48("63245", "63246", "63247"), (stryMutAct_9fa48("63248") ? options.allowPressureDefer : (stryCov_9fa48("63248"), options?.allowPressureDefer)) === (stryMutAct_9fa48("63249") ? false : (stryCov_9fa48("63249"), true))),
              routingReadinessDimension: stryMutAct_9fa48("63252") ? options?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("63251") ? false : stryMutAct_9fa48("63250") ? true : (stryCov_9fa48("63250", "63251", "63252"), (stryMutAct_9fa48("63253") ? options.routingReadinessDimension : (stryCov_9fa48("63253"), options?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)
            })),
            mergePolicy
          });
        }
      }
      return stryMutAct_9fa48("63254") ? {} : (stryCov_9fa48("63254"), {
        requestKey: (stryMutAct_9fa48("63255") ? `` : (stryCov_9fa48("63255"), `control-plane:mutation:${stryMutAct_9fa48("63258") ? mutation?.tableName && CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN : stryMutAct_9fa48("63257") ? false : stryMutAct_9fa48("63256") ? true : (stryCov_9fa48("63256", "63257", "63258"), (stryMutAct_9fa48("63259") ? mutation.tableName : (stryCov_9fa48("63259"), mutation?.tableName)) || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN)}:`)) + (stryMutAct_9fa48("63260") ? `` : (stryCov_9fa48("63260"), `${explicitKey}`)),
        mergePolicy
      });
    }
  }

  /**
   * @param {string} requestKey
   * @return {Object}
   * @private
   */
  buildSupersededMutationResult(requestKey) {
    if (stryMutAct_9fa48("63261")) {
      {}
    } else {
      stryCov_9fa48("63261");
      return stryMutAct_9fa48("63262") ? {} : (stryCov_9fa48("63262"), {
        success: stryMutAct_9fa48("63263") ? false : (stryCov_9fa48("63263"), true),
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
        requestKey,
        superseded: stryMutAct_9fa48("63264") ? false : (stryCov_9fa48("63264"), true)
      });
    }
  }

  /**
   * @param {string} requestKey
   * @param {Function} executionFactory
   * @param {Object|null} [deferred=null]
   * @return {Promise<Object>}
   * @private
   */
  scheduleMutationExecution(requestKey, executionFactory, deferred = null) {
    if (stryMutAct_9fa48("63265")) {
      {}
    } else {
      stryCov_9fa48("63265");
      if (stryMutAct_9fa48("63268") ? !this.inFlightMutationRequestsByKey.has(requestKey) || this.inFlightMutationRequestsByKey.size >= this.gatewayLimits.maxTrackedMutationRequests : stryMutAct_9fa48("63267") ? false : stryMutAct_9fa48("63266") ? true : (stryCov_9fa48("63266", "63267", "63268"), (stryMutAct_9fa48("63269") ? this.inFlightMutationRequestsByKey.has(requestKey) : (stryCov_9fa48("63269"), !this.inFlightMutationRequestsByKey.has(requestKey))) && (stryMutAct_9fa48("63272") ? this.inFlightMutationRequestsByKey.size < this.gatewayLimits.maxTrackedMutationRequests : stryMutAct_9fa48("63271") ? this.inFlightMutationRequestsByKey.size > this.gatewayLimits.maxTrackedMutationRequests : stryMutAct_9fa48("63270") ? true : (stryCov_9fa48("63270", "63271", "63272"), this.inFlightMutationRequestsByKey.size >= this.gatewayLimits.maxTrackedMutationRequests)))) {
        if (stryMutAct_9fa48("63273")) {
          {}
        } else {
          stryCov_9fa48("63273");
          this.incrementGatewayMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONTRACKINGREJECTEDCOUNT);
          const saturatedResult = this.buildTrackingSaturatedMutationResult(stryMutAct_9fa48("63274") ? {} : (stryCov_9fa48("63274"), {
            requestKey
          }));
          if (stryMutAct_9fa48("63276") ? false : stryMutAct_9fa48("63275") ? true : (stryCov_9fa48("63275", "63276"), deferred)) {
            if (stryMutAct_9fa48("63277")) {
              {}
            } else {
              stryCov_9fa48("63277");
              deferred.resolve(saturatedResult);
              return deferred.promise;
            }
          }
          return Promise.resolve(saturatedResult);
        }
      }
      let executionPromise = null;
      executionPromise = Promise.resolve().then(stryMutAct_9fa48("63278") ? () => undefined : (stryCov_9fa48("63278"), () => executionFactory())).then(result => {
        if (stryMutAct_9fa48("63279")) {
          {}
        } else {
          stryCov_9fa48("63279");
          if (stryMutAct_9fa48("63281") ? false : stryMutAct_9fa48("63280") ? true : (stryCov_9fa48("63280", "63281"), deferred)) {
            if (stryMutAct_9fa48("63282")) {
              {}
            } else {
              stryCov_9fa48("63282");
              deferred.resolve(result);
            }
          }
          return result;
        }
      }, error => {
        if (stryMutAct_9fa48("63283")) {
          {}
        } else {
          stryCov_9fa48("63283");
          if (stryMutAct_9fa48("63285") ? false : stryMutAct_9fa48("63284") ? true : (stryCov_9fa48("63284", "63285"), deferred)) {
            if (stryMutAct_9fa48("63286")) {
              {}
            } else {
              stryCov_9fa48("63286");
              deferred.reject(error);
            }
          }
          throw error;
        }
      }).finally(() => {
        if (stryMutAct_9fa48("63287")) {
          {}
        } else {
          stryCov_9fa48("63287");
          if (stryMutAct_9fa48("63290") ? this.inFlightMutationRequestsByKey.get(requestKey) !== executionPromise : stryMutAct_9fa48("63289") ? false : stryMutAct_9fa48("63288") ? true : (stryCov_9fa48("63288", "63289", "63290"), this.inFlightMutationRequestsByKey.get(requestKey) === executionPromise)) {
            if (stryMutAct_9fa48("63291")) {
              {}
            } else {
              stryCov_9fa48("63291");
              this.inFlightMutationRequestsByKey.delete(requestKey);
              this.recordGatewayRetentionSnapshot();
            }
          }
          const pendingRequest = this.pendingReplaceMutationRequestsByKey.get(requestKey);
          if (stryMutAct_9fa48("63294") ? false : stryMutAct_9fa48("63293") ? true : stryMutAct_9fa48("63292") ? pendingRequest : (stryCov_9fa48("63292", "63293", "63294"), !pendingRequest)) {
            if (stryMutAct_9fa48("63295")) {
              {}
            } else {
              stryCov_9fa48("63295");
              return;
            }
          }
          this.pendingReplaceMutationRequestsByKey.delete(requestKey);
          this.recordGatewayRetentionSnapshot();
          this.scheduleMutationExecution(requestKey, pendingRequest.executionFactory, pendingRequest.deferred);
        }
      });
      this.inFlightMutationRequestsByKey.set(requestKey, executionPromise);
      this.recordGatewayRetentionSnapshot();
      return deferred ? deferred.promise : executionPromise;
    }
  }

  /**
   * @param {string} requestKey
   * @param {Function} executionFactory
   * @return {Promise<Object>}
   * @private
   */
  runReplacePendingMutation(requestKey, executionFactory) {
    if (stryMutAct_9fa48("63296")) {
      {}
    } else {
      stryCov_9fa48("63296");
      const inFlightRequest = this.inFlightMutationRequestsByKey.get(requestKey);
      if (stryMutAct_9fa48("63299") ? false : stryMutAct_9fa48("63298") ? true : stryMutAct_9fa48("63297") ? inFlightRequest : (stryCov_9fa48("63297", "63298", "63299"), !inFlightRequest)) {
        if (stryMutAct_9fa48("63300")) {
          {}
        } else {
          stryCov_9fa48("63300");
          return this.scheduleMutationExecution(requestKey, executionFactory);
        }
      }
      const existingPending = this.pendingReplaceMutationRequestsByKey.get(requestKey);
      if (stryMutAct_9fa48("63302") ? false : stryMutAct_9fa48("63301") ? true : (stryCov_9fa48("63301", "63302"), existingPending)) {
        if (stryMutAct_9fa48("63303")) {
          {}
        } else {
          stryCov_9fa48("63303");
          this.incrementGatewayMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONREPLACEPENDINGSUPERSEDEDCOUNT);
          existingPending.deferred.resolve(this.buildSupersededMutationResult(requestKey));
        }
      }
      if (stryMutAct_9fa48("63306") ? !existingPending || this.pendingReplaceMutationRequestsByKey.size >= this.gatewayLimits.maxPendingReplaceMutationRequests : stryMutAct_9fa48("63305") ? false : stryMutAct_9fa48("63304") ? true : (stryCov_9fa48("63304", "63305", "63306"), (stryMutAct_9fa48("63307") ? existingPending : (stryCov_9fa48("63307"), !existingPending)) && (stryMutAct_9fa48("63310") ? this.pendingReplaceMutationRequestsByKey.size < this.gatewayLimits.maxPendingReplaceMutationRequests : stryMutAct_9fa48("63309") ? this.pendingReplaceMutationRequestsByKey.size > this.gatewayLimits.maxPendingReplaceMutationRequests : stryMutAct_9fa48("63308") ? true : (stryCov_9fa48("63308", "63309", "63310"), this.pendingReplaceMutationRequestsByKey.size >= this.gatewayLimits.maxPendingReplaceMutationRequests)))) {
        if (stryMutAct_9fa48("63311")) {
          {}
        } else {
          stryCov_9fa48("63311");
          this.incrementGatewayMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONTRACKINGREJECTEDCOUNT);
          return Promise.resolve(this.buildTrackingSaturatedMutationResult(stryMutAct_9fa48("63312") ? {} : (stryCov_9fa48("63312"), {
            requestKey
          })));
        }
      }
      const deferred = createDeferredPromise();
      this.pendingReplaceMutationRequestsByKey.set(requestKey, stryMutAct_9fa48("63313") ? {} : (stryCov_9fa48("63313"), {
        deferred,
        executionFactory
      }));
      this.incrementGatewayMetric(CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONREPLACEPENDINGQUEUEDCOUNT);
      this.recordGatewayRetentionSnapshot();
      return deferred.promise;
    }
  }

  /**
   * @param {string|null} tableName
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  evaluateReadPressure(tableName, options = {}) {
    if (stryMutAct_9fa48("63314")) {
      {}
    } else {
      stryCov_9fa48("63314");
      return this.getPressureGovernor().evaluate(stryMutAct_9fa48("63315") ? {} : (stryCov_9fa48("63315"), {
        workClass: stryMutAct_9fa48("63318") ? options?.workClass && PRESSURE_WORK_CLASS.INTERACTIVE : stryMutAct_9fa48("63317") ? false : stryMutAct_9fa48("63316") ? true : (stryCov_9fa48("63316", "63317", "63318"), (stryMutAct_9fa48("63319") ? options.workClass : (stryCov_9fa48("63319"), options?.workClass)) || PRESSURE_WORK_CLASS.INTERACTIVE),
        resourceKeys: stryMutAct_9fa48("63320") ? [] : (stryCov_9fa48("63320"), [CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_COLON_READ, stryMutAct_9fa48("63321") ? `` : (stryCov_9fa48("63321"), `control-plane:table:${stryMutAct_9fa48("63324") ? tableName && CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN : stryMutAct_9fa48("63323") ? false : stryMutAct_9fa48("63322") ? true : (stryCov_9fa48("63322", "63323", "63324"), tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN)}`)]),
        allowDegrade: stryMutAct_9fa48("63327") ? options?.allowPressureDegrade === false : stryMutAct_9fa48("63326") ? false : stryMutAct_9fa48("63325") ? true : (stryCov_9fa48("63325", "63326", "63327"), (stryMutAct_9fa48("63328") ? options.allowPressureDegrade : (stryCov_9fa48("63328"), options?.allowPressureDegrade)) !== (stryMutAct_9fa48("63329") ? true : (stryCov_9fa48("63329"), false))),
        allowDefer: stryMutAct_9fa48("63332") ? options?.allowPressureDefer !== true : stryMutAct_9fa48("63331") ? false : stryMutAct_9fa48("63330") ? true : (stryCov_9fa48("63330", "63331", "63332"), (stryMutAct_9fa48("63333") ? options.allowPressureDefer : (stryCov_9fa48("63333"), options?.allowPressureDefer)) === (stryMutAct_9fa48("63334") ? false : (stryCov_9fa48("63334"), true))),
        retryAfterMs: stryMutAct_9fa48("63335") ? options.pressureRetryAfterMs : (stryCov_9fa48("63335"), options?.pressureRetryAfterMs)
      }));
    }
  }

  /**
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  buildReadRequestKey(tableName, sql, params = stryMutAct_9fa48("63336") ? ["Stryker was here"] : (stryCov_9fa48("63336"), []), options = {}) {
    if (stryMutAct_9fa48("63337")) {
      {}
    } else {
      stryCov_9fa48("63337");
      const explicitKey = normalizeCoalescingToken(stryMutAct_9fa48("63338") ? options.coalescingKey : (stryCov_9fa48("63338"), options?.coalescingKey));
      if (stryMutAct_9fa48("63340") ? false : stryMutAct_9fa48("63339") ? true : (stryCov_9fa48("63339", "63340"), explicitKey)) {
        if (stryMutAct_9fa48("63341")) {
          {}
        } else {
          stryCov_9fa48("63341");
          return stryMutAct_9fa48("63342") ? `` : (stryCov_9fa48("63342"), `control-plane:read:${stryMutAct_9fa48("63345") ? tableName && CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN : stryMutAct_9fa48("63344") ? false : stryMutAct_9fa48("63343") ? true : (stryCov_9fa48("63343", "63344", "63345"), tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN)}:${explicitKey}`);
        }
      }
      if (stryMutAct_9fa48("63348") ? options?.allowCoalescing !== false : stryMutAct_9fa48("63347") ? false : stryMutAct_9fa48("63346") ? true : (stryCov_9fa48("63346", "63347", "63348"), (stryMutAct_9fa48("63349") ? options.allowCoalescing : (stryCov_9fa48("63349"), options?.allowCoalescing)) === (stryMutAct_9fa48("63350") ? true : (stryCov_9fa48("63350"), false)))) {
        if (stryMutAct_9fa48("63351")) {
          {}
        } else {
          stryCov_9fa48("63351");
          return null;
        }
      }
      return stableSerialize(stryMutAct_9fa48("63352") ? {} : (stryCov_9fa48("63352"), {
        kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_READ,
        tableName: stryMutAct_9fa48("63355") ? tableName && null : stryMutAct_9fa48("63354") ? false : stryMutAct_9fa48("63353") ? true : (stryCov_9fa48("63353", "63354", "63355"), tableName || null),
        readProfile: stryMutAct_9fa48("63358") ? options?.readProfile && null : stryMutAct_9fa48("63357") ? false : stryMutAct_9fa48("63356") ? true : (stryCov_9fa48("63356", "63357", "63358"), (stryMutAct_9fa48("63359") ? options.readProfile : (stryCov_9fa48("63359"), options?.readProfile)) || null),
        strategy: stryMutAct_9fa48("63362") ? options?.strategy && null : stryMutAct_9fa48("63361") ? false : stryMutAct_9fa48("63360") ? true : (stryCov_9fa48("63360", "63361", "63362"), (stryMutAct_9fa48("63363") ? options.strategy : (stryCov_9fa48("63363"), options?.strategy)) || null),
        sql: stryMutAct_9fa48("63366") ? sql && null : stryMutAct_9fa48("63365") ? false : stryMutAct_9fa48("63364") ? true : (stryCov_9fa48("63364", "63365", "63366"), sql || null),
        params: Array.isArray(params) ? params : stryMutAct_9fa48("63367") ? ["Stryker was here"] : (stryCov_9fa48("63367"), []),
        workClass: stryMutAct_9fa48("63370") ? options?.workClass && PRESSURE_WORK_CLASS.INTERACTIVE : stryMutAct_9fa48("63369") ? false : stryMutAct_9fa48("63368") ? true : (stryCov_9fa48("63368", "63369", "63370"), (stryMutAct_9fa48("63371") ? options.workClass : (stryCov_9fa48("63371"), options?.workClass)) || PRESSURE_WORK_CLASS.INTERACTIVE),
        allowPressureDegrade: stryMutAct_9fa48("63374") ? options?.allowPressureDegrade === false : stryMutAct_9fa48("63373") ? false : stryMutAct_9fa48("63372") ? true : (stryCov_9fa48("63372", "63373", "63374"), (stryMutAct_9fa48("63375") ? options.allowPressureDegrade : (stryCov_9fa48("63375"), options?.allowPressureDegrade)) !== (stryMutAct_9fa48("63376") ? true : (stryCov_9fa48("63376"), false))),
        allowPressureDefer: stryMutAct_9fa48("63379") ? options?.allowPressureDefer !== true : stryMutAct_9fa48("63378") ? false : stryMutAct_9fa48("63377") ? true : (stryCov_9fa48("63377", "63378", "63379"), (stryMutAct_9fa48("63380") ? options.allowPressureDefer : (stryCov_9fa48("63380"), options?.allowPressureDefer)) === (stryMutAct_9fa48("63381") ? false : (stryCov_9fa48("63381"), true))),
        phaseScope: normalizePhaseScope(stryMutAct_9fa48("63382") ? options.phaseScope : (stryCov_9fa48("63382"), options?.phaseScope)),
        localReadConsistency: stryMutAct_9fa48("63385") ? options?.localReadConsistency && null : stryMutAct_9fa48("63384") ? false : stryMutAct_9fa48("63383") ? true : (stryCov_9fa48("63383", "63384", "63385"), (stryMutAct_9fa48("63386") ? options.localReadConsistency : (stryCov_9fa48("63386"), options?.localReadConsistency)) || null),
        replicaFallbackConsistency: stryMutAct_9fa48("63389") ? options?.replicaFallbackConsistency && null : stryMutAct_9fa48("63388") ? false : stryMutAct_9fa48("63387") ? true : (stryCov_9fa48("63387", "63388", "63389"), (stryMutAct_9fa48("63390") ? options.replicaFallbackConsistency : (stryCov_9fa48("63390"), options?.replicaFallbackConsistency)) || null),
        preferOwnerRpcRead: stryMutAct_9fa48("63393") ? options?.preferOwnerRpcRead !== true : stryMutAct_9fa48("63392") ? false : stryMutAct_9fa48("63391") ? true : (stryCov_9fa48("63391", "63392", "63393"), (stryMutAct_9fa48("63394") ? options.preferOwnerRpcRead : (stryCov_9fa48("63394"), options?.preferOwnerRpcRead)) === (stryMutAct_9fa48("63395") ? false : (stryCov_9fa48("63395"), true))),
        requireOwnerRpcRead: stryMutAct_9fa48("63398") ? options?.requireOwnerRpcRead !== true : stryMutAct_9fa48("63397") ? false : stryMutAct_9fa48("63396") ? true : (stryCov_9fa48("63396", "63397", "63398"), (stryMutAct_9fa48("63399") ? options.requireOwnerRpcRead : (stryCov_9fa48("63399"), options?.requireOwnerRpcRead)) === (stryMutAct_9fa48("63400") ? false : (stryCov_9fa48("63400"), true))),
        allowOwnerRpcFallback: stryMutAct_9fa48("63403") ? options?.allowOwnerRpcFallback === false : stryMutAct_9fa48("63402") ? false : stryMutAct_9fa48("63401") ? true : (stryCov_9fa48("63401", "63402", "63403"), (stryMutAct_9fa48("63404") ? options.allowOwnerRpcFallback : (stryCov_9fa48("63404"), options?.allowOwnerRpcFallback)) !== (stryMutAct_9fa48("63405") ? true : (stryCov_9fa48("63405"), false))),
        routingReadinessDimension: stryMutAct_9fa48("63408") ? options?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("63407") ? false : stryMutAct_9fa48("63406") ? true : (stryCov_9fa48("63406", "63407", "63408"), (stryMutAct_9fa48("63409") ? options.routingReadinessDimension : (stryCov_9fa48("63409"), options?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)
      }));
    }
  }

  /**
   * @param {string} sql
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  resolveSystemTableQueryDescriptor(sql, options = {}) {
    if (stryMutAct_9fa48("63410")) {
      {}
    } else {
      stryCov_9fa48("63410");
      const tableName = normalizeSystemTableName(stryMutAct_9fa48("63413") ? (options?.controlPlaneTableName || options?.tableName) && extractSystemTableNameFromSql(sql) : stryMutAct_9fa48("63412") ? false : stryMutAct_9fa48("63411") ? true : (stryCov_9fa48("63411", "63412", "63413"), (stryMutAct_9fa48("63415") ? options?.controlPlaneTableName && options?.tableName : stryMutAct_9fa48("63414") ? false : (stryCov_9fa48("63414", "63415"), (stryMutAct_9fa48("63416") ? options.controlPlaneTableName : (stryCov_9fa48("63416"), options?.controlPlaneTableName)) || (stryMutAct_9fa48("63417") ? options.tableName : (stryCov_9fa48("63417"), options?.tableName)))) || extractSystemTableNameFromSql(sql)));
      const operationKind = normalizeSqlOperationKind(stryMutAct_9fa48("63420") ? (options?.controlPlaneOperationKind || options?.operationKind) && extractSqlOperationKind(sql) : stryMutAct_9fa48("63419") ? false : stryMutAct_9fa48("63418") ? true : (stryCov_9fa48("63418", "63419", "63420"), (stryMutAct_9fa48("63422") ? options?.controlPlaneOperationKind && options?.operationKind : stryMutAct_9fa48("63421") ? false : (stryCov_9fa48("63421", "63422"), (stryMutAct_9fa48("63423") ? options.controlPlaneOperationKind : (stryCov_9fa48("63423"), options?.controlPlaneOperationKind)) || (stryMutAct_9fa48("63424") ? options.operationKind : (stryCov_9fa48("63424"), options?.operationKind)))) || extractSqlOperationKind(sql)));
      return stryMutAct_9fa48("63425") ? {} : (stryCov_9fa48("63425"), {
        tableName,
        operationKind,
        isSystemTable: stryMutAct_9fa48("63428") ? Boolean(tableName) || operationKind !== CONTROL_PLANE_SQL_OPERATION.UNKNOWN : stryMutAct_9fa48("63427") ? false : stryMutAct_9fa48("63426") ? true : (stryCov_9fa48("63426", "63427", "63428"), Boolean(tableName) && (stryMutAct_9fa48("63430") ? operationKind === CONTROL_PLANE_SQL_OPERATION.UNKNOWN : stryMutAct_9fa48("63429") ? true : (stryCov_9fa48("63429", "63430"), operationKind !== CONTROL_PLANE_SQL_OPERATION.UNKNOWN)))
      });
    }
  }

  /**
   * @param {Object} descriptor
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  buildExecuteQueryKey(descriptor, sql, params = stryMutAct_9fa48("63431") ? ["Stryker was here"] : (stryCov_9fa48("63431"), []), options = {}) {
    if (stryMutAct_9fa48("63432")) {
      {}
    } else {
      stryCov_9fa48("63432");
      const explicitKey = normalizeCoalescingToken(stryMutAct_9fa48("63433") ? options.coalescingKey : (stryCov_9fa48("63433"), options?.coalescingKey));
      if (stryMutAct_9fa48("63435") ? false : stryMutAct_9fa48("63434") ? true : (stryCov_9fa48("63434", "63435"), explicitKey)) {
        if (stryMutAct_9fa48("63436")) {
          {}
        } else {
          stryCov_9fa48("63436");
          return (stryMutAct_9fa48("63437") ? `` : (stryCov_9fa48("63437"), `control-plane:query:${stryMutAct_9fa48("63440") ? descriptor.tableName && CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN : stryMutAct_9fa48("63439") ? false : stryMutAct_9fa48("63438") ? true : (stryCov_9fa48("63438", "63439", "63440"), descriptor.tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN)}:`)) + (stryMutAct_9fa48("63441") ? `` : (stryCov_9fa48("63441"), `${descriptor.operationKind}:${explicitKey}`));
        }
      }
      if (stryMutAct_9fa48("63444") ? options?.allowCoalescing !== false : stryMutAct_9fa48("63443") ? false : stryMutAct_9fa48("63442") ? true : (stryCov_9fa48("63442", "63443", "63444"), (stryMutAct_9fa48("63445") ? options.allowCoalescing : (stryCov_9fa48("63445"), options?.allowCoalescing)) === (stryMutAct_9fa48("63446") ? true : (stryCov_9fa48("63446"), false)))) {
        if (stryMutAct_9fa48("63447")) {
          {}
        } else {
          stryCov_9fa48("63447");
          return null;
        }
      }
      if (stryMutAct_9fa48("63450") ? descriptor.operationKind === CONTROL_PLANE_SQL_OPERATION.READ : stryMutAct_9fa48("63449") ? false : stryMutAct_9fa48("63448") ? true : (stryCov_9fa48("63448", "63449", "63450"), descriptor.operationKind !== CONTROL_PLANE_SQL_OPERATION.READ)) {
        if (stryMutAct_9fa48("63451")) {
          {}
        } else {
          stryCov_9fa48("63451");
          return null;
        }
      }
      return stableSerialize(stryMutAct_9fa48("63452") ? {} : (stryCov_9fa48("63452"), {
        kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_QUERY,
        tableName: stryMutAct_9fa48("63455") ? descriptor.tableName && null : stryMutAct_9fa48("63454") ? false : stryMutAct_9fa48("63453") ? true : (stryCov_9fa48("63453", "63454", "63455"), descriptor.tableName || null),
        operationKind: descriptor.operationKind,
        sql: stryMutAct_9fa48("63458") ? sql && null : stryMutAct_9fa48("63457") ? false : stryMutAct_9fa48("63456") ? true : (stryCov_9fa48("63456", "63457", "63458"), sql || null),
        params: Array.isArray(params) ? params : stryMutAct_9fa48("63459") ? ["Stryker was here"] : (stryCov_9fa48("63459"), []),
        workClass: stryMutAct_9fa48("63462") ? options?.workClass && PRESSURE_WORK_CLASS.INTERACTIVE : stryMutAct_9fa48("63461") ? false : stryMutAct_9fa48("63460") ? true : (stryCov_9fa48("63460", "63461", "63462"), (stryMutAct_9fa48("63463") ? options.workClass : (stryCov_9fa48("63463"), options?.workClass)) || PRESSURE_WORK_CLASS.INTERACTIVE),
        allowPressureDefer: stryMutAct_9fa48("63466") ? options?.allowPressureDefer !== true : stryMutAct_9fa48("63465") ? false : stryMutAct_9fa48("63464") ? true : (stryCov_9fa48("63464", "63465", "63466"), (stryMutAct_9fa48("63467") ? options.allowPressureDefer : (stryCov_9fa48("63467"), options?.allowPressureDefer)) === (stryMutAct_9fa48("63468") ? false : (stryCov_9fa48("63468"), true))),
        allowPressureDegrade: stryMutAct_9fa48("63471") ? options?.allowPressureDegrade !== true : stryMutAct_9fa48("63470") ? false : stryMutAct_9fa48("63469") ? true : (stryCov_9fa48("63469", "63470", "63471"), (stryMutAct_9fa48("63472") ? options.allowPressureDegrade : (stryCov_9fa48("63472"), options?.allowPressureDegrade)) === (stryMutAct_9fa48("63473") ? false : (stryCov_9fa48("63473"), true))),
        routingReadinessDimension: stryMutAct_9fa48("63476") ? options?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("63475") ? false : stryMutAct_9fa48("63474") ? true : (stryCov_9fa48("63474", "63475", "63476"), (stryMutAct_9fa48("63477") ? options.routingReadinessDimension : (stryCov_9fa48("63477"), options?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)
      }));
    }
  }

  /**
   * @param {Object} descriptor
   * @param {Object} [options={}]
   * @return {Object|null}
   * @private
   */
  evaluateExecuteQueryPressure(descriptor, options = {}) {
    if (stryMutAct_9fa48("63478")) {
      {}
    } else {
      stryCov_9fa48("63478");
      if (stryMutAct_9fa48("63481") ? descriptor?.isSystemTable === true : stryMutAct_9fa48("63480") ? false : stryMutAct_9fa48("63479") ? true : (stryCov_9fa48("63479", "63480", "63481"), (stryMutAct_9fa48("63482") ? descriptor.isSystemTable : (stryCov_9fa48("63482"), descriptor?.isSystemTable)) !== (stryMutAct_9fa48("63483") ? false : (stryCov_9fa48("63483"), true)))) {
        if (stryMutAct_9fa48("63484")) {
          {}
        } else {
          stryCov_9fa48("63484");
          return null;
        }
      }
      const shouldEvaluate = stryMutAct_9fa48("63487") ? (options?.enforcePressureAdmission === true || options?.allowPressureDefer === true || options?.allowPressureDegrade === true) && typeof options?.workClass === TYPEOF.STRING : stryMutAct_9fa48("63486") ? false : stryMutAct_9fa48("63485") ? true : (stryCov_9fa48("63485", "63486", "63487"), (stryMutAct_9fa48("63489") ? (options?.enforcePressureAdmission === true || options?.allowPressureDefer === true) && options?.allowPressureDegrade === true : stryMutAct_9fa48("63488") ? false : (stryCov_9fa48("63488", "63489"), (stryMutAct_9fa48("63491") ? options?.enforcePressureAdmission === true && options?.allowPressureDefer === true : stryMutAct_9fa48("63490") ? false : (stryCov_9fa48("63490", "63491"), (stryMutAct_9fa48("63493") ? options?.enforcePressureAdmission !== true : stryMutAct_9fa48("63492") ? false : (stryCov_9fa48("63492", "63493"), (stryMutAct_9fa48("63494") ? options.enforcePressureAdmission : (stryCov_9fa48("63494"), options?.enforcePressureAdmission)) === (stryMutAct_9fa48("63495") ? false : (stryCov_9fa48("63495"), true)))) || (stryMutAct_9fa48("63497") ? options?.allowPressureDefer !== true : stryMutAct_9fa48("63496") ? false : (stryCov_9fa48("63496", "63497"), (stryMutAct_9fa48("63498") ? options.allowPressureDefer : (stryCov_9fa48("63498"), options?.allowPressureDefer)) === (stryMutAct_9fa48("63499") ? false : (stryCov_9fa48("63499"), true)))))) || (stryMutAct_9fa48("63501") ? options?.allowPressureDegrade !== true : stryMutAct_9fa48("63500") ? false : (stryCov_9fa48("63500", "63501"), (stryMutAct_9fa48("63502") ? options.allowPressureDegrade : (stryCov_9fa48("63502"), options?.allowPressureDegrade)) === (stryMutAct_9fa48("63503") ? false : (stryCov_9fa48("63503"), true)))))) || (stryMutAct_9fa48("63505") ? typeof options?.workClass !== TYPEOF.STRING : stryMutAct_9fa48("63504") ? false : (stryCov_9fa48("63504", "63505"), typeof (stryMutAct_9fa48("63506") ? options.workClass : (stryCov_9fa48("63506"), options?.workClass)) === TYPEOF.STRING)));
      if (stryMutAct_9fa48("63509") ? false : stryMutAct_9fa48("63508") ? true : stryMutAct_9fa48("63507") ? shouldEvaluate : (stryCov_9fa48("63507", "63508", "63509"), !shouldEvaluate)) {
        if (stryMutAct_9fa48("63510")) {
          {}
        } else {
          stryCov_9fa48("63510");
          return null;
        }
      }
      const isWrite = stryMutAct_9fa48("63513") ? descriptor.operationKind !== CONTROL_PLANE_SQL_OPERATION.WRITE : stryMutAct_9fa48("63512") ? false : stryMutAct_9fa48("63511") ? true : (stryCov_9fa48("63511", "63512", "63513"), descriptor.operationKind === CONTROL_PLANE_SQL_OPERATION.WRITE);
      return this.getPressureGovernor().evaluate(stryMutAct_9fa48("63514") ? {} : (stryCov_9fa48("63514"), {
        workClass: stryMutAct_9fa48("63517") ? options?.workClass && (isWrite ? PRESSURE_WORK_CLASS.CRITICAL : PRESSURE_WORK_CLASS.INTERACTIVE) : stryMutAct_9fa48("63516") ? false : stryMutAct_9fa48("63515") ? true : (stryCov_9fa48("63515", "63516", "63517"), (stryMutAct_9fa48("63518") ? options.workClass : (stryCov_9fa48("63518"), options?.workClass)) || (isWrite ? PRESSURE_WORK_CLASS.CRITICAL : PRESSURE_WORK_CLASS.INTERACTIVE)),
        resourceKeys: stryMutAct_9fa48("63519") ? [] : (stryCov_9fa48("63519"), [stryMutAct_9fa48("63520") ? `` : (stryCov_9fa48("63520"), `control-plane:${isWrite ? CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WRITE : CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ}`), stryMutAct_9fa48("63521") ? `` : (stryCov_9fa48("63521"), `control-plane:table:${stryMutAct_9fa48("63524") ? descriptor.tableName && CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN : stryMutAct_9fa48("63523") ? false : stryMutAct_9fa48("63522") ? true : (stryCov_9fa48("63522", "63523", "63524"), descriptor.tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN)}`)]),
        allowDegrade: isWrite ? stryMutAct_9fa48("63525") ? true : (stryCov_9fa48("63525"), false) : stryMutAct_9fa48("63528") ? options?.allowPressureDegrade !== true : stryMutAct_9fa48("63527") ? false : stryMutAct_9fa48("63526") ? true : (stryCov_9fa48("63526", "63527", "63528"), (stryMutAct_9fa48("63529") ? options.allowPressureDegrade : (stryCov_9fa48("63529"), options?.allowPressureDegrade)) === (stryMutAct_9fa48("63530") ? false : (stryCov_9fa48("63530"), true))),
        allowDefer: stryMutAct_9fa48("63533") ? options?.allowPressureDefer !== true : stryMutAct_9fa48("63532") ? false : stryMutAct_9fa48("63531") ? true : (stryCov_9fa48("63531", "63532", "63533"), (stryMutAct_9fa48("63534") ? options.allowPressureDefer : (stryCov_9fa48("63534"), options?.allowPressureDefer)) === (stryMutAct_9fa48("63535") ? false : (stryCov_9fa48("63535"), true))),
        retryAfterMs: stryMutAct_9fa48("63536") ? options.pressureRetryAfterMs : (stryCov_9fa48("63536"), options?.pressureRetryAfterMs)
      }));
    }
  }

  /**
   * @private
   */
  assertSqlQueryEngine() {
    if (stryMutAct_9fa48("63537")) {
      {}
    } else {
      stryCov_9fa48("63537");
      const sqlQueryEngine = this.resolveSqlQueryEngine();
      if (stryMutAct_9fa48("63540") ? !sqlQueryEngine && typeof sqlQueryEngine.executeQuery !== TYPEOF.FUNCTION : stryMutAct_9fa48("63539") ? false : stryMutAct_9fa48("63538") ? true : (stryCov_9fa48("63538", "63539", "63540"), (stryMutAct_9fa48("63541") ? sqlQueryEngine : (stryCov_9fa48("63541"), !sqlQueryEngine)) || (stryMutAct_9fa48("63543") ? typeof sqlQueryEngine.executeQuery === TYPEOF.FUNCTION : stryMutAct_9fa48("63542") ? false : (stryCov_9fa48("63542", "63543"), typeof sqlQueryEngine.executeQuery !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("63544")) {
          {}
        } else {
          stryCov_9fa48("63544");
          throw new Error(GATEWAY_ERROR_MSG.SQL_ENGINE_REQUIRED);
        }
      }
      return sqlQueryEngine;
    }
  }

  /**
   * @private
   */
  assertCdcIntegrationService() {
    if (stryMutAct_9fa48("63545")) {
      {}
    } else {
      stryCov_9fa48("63545");
      const cdcIntegrationService = this.resolveCdcIntegrationService();
      if (stryMutAct_9fa48("63548") ? false : stryMutAct_9fa48("63547") ? true : stryMutAct_9fa48("63546") ? cdcIntegrationService : (stryCov_9fa48("63546", "63547", "63548"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("63549")) {
          {}
        } else {
          stryCov_9fa48("63549");
          throw new Error(GATEWAY_ERROR_MSG.CDC_REQUIRED);
        }
      }
      return cdcIntegrationService;
    }
  }

  /**
   * @param {Object} options
   * @return {boolean}
   * @private
   */
  shouldUseSqlMutationFallback(options = {}) {
    if (stryMutAct_9fa48("63550")) {
      {}
    } else {
      stryCov_9fa48("63550");
      if (stryMutAct_9fa48("63553") ? options?.skipCacheWait === true : stryMutAct_9fa48("63552") ? false : stryMutAct_9fa48("63551") ? true : (stryCov_9fa48("63551", "63552", "63553"), (stryMutAct_9fa48("63554") ? options.skipCacheWait : (stryCov_9fa48("63554"), options?.skipCacheWait)) !== (stryMutAct_9fa48("63555") ? false : (stryCov_9fa48("63555"), true)))) {
        if (stryMutAct_9fa48("63556")) {
          {}
        } else {
          stryCov_9fa48("63556");
          return stryMutAct_9fa48("63557") ? true : (stryCov_9fa48("63557"), false);
        }
      }
      const phaseScope = normalizePhaseScope(stryMutAct_9fa48("63558") ? options.phaseScope : (stryCov_9fa48("63558"), options?.phaseScope));
      if (stryMutAct_9fa48("63561") ? false : stryMutAct_9fa48("63560") ? true : stryMutAct_9fa48("63559") ? phaseScope : (stryCov_9fa48("63559", "63560", "63561"), !phaseScope)) {
        if (stryMutAct_9fa48("63562")) {
          {}
        } else {
          stryCov_9fa48("63562");
          return stryMutAct_9fa48("63563") ? true : (stryCov_9fa48("63563"), false);
        }
      }
      return stryMutAct_9fa48("63566") ? typeof this.resolveSqlQueryEngine()?.executeQuery !== TYPEOF.FUNCTION : stryMutAct_9fa48("63565") ? false : stryMutAct_9fa48("63564") ? true : (stryCov_9fa48("63564", "63565", "63566"), typeof (stryMutAct_9fa48("63567") ? this.resolveSqlQueryEngine().executeQuery : (stryCov_9fa48("63567"), this.resolveSqlQueryEngine()?.executeQuery)) === TYPEOF.FUNCTION);
    }
  }

  /**
   * @param {Object} mutation
   * @return {{sql: string, params: Array<*>}}
   * @private
   */
  buildSqlMutationPlan(mutation = {}) {
    if (stryMutAct_9fa48("63568")) {
      {}
    } else {
      stryCov_9fa48("63568");
      const operation = normalizeMutationOperation(stryMutAct_9fa48("63569") ? mutation.operation : (stryCov_9fa48("63569"), mutation?.operation));
      const tableName = normalizeSystemTableName(stryMutAct_9fa48("63570") ? mutation.tableName : (stryCov_9fa48("63570"), mutation?.tableName));
      if (stryMutAct_9fa48("63573") ? false : stryMutAct_9fa48("63572") ? true : stryMutAct_9fa48("63571") ? operation : (stryCov_9fa48("63571", "63572", "63573"), !operation)) {
        if (stryMutAct_9fa48("63574")) {
          {}
        } else {
          stryCov_9fa48("63574");
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_OPERATION_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("63577") ? false : stryMutAct_9fa48("63576") ? true : stryMutAct_9fa48("63575") ? tableName : (stryCov_9fa48("63575", "63576", "63577"), !tableName)) {
        if (stryMutAct_9fa48("63578")) {
          {}
        } else {
          stryCov_9fa48("63578");
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("63581") ? operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT && operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT : stryMutAct_9fa48("63580") ? false : stryMutAct_9fa48("63579") ? true : (stryCov_9fa48("63579", "63580", "63581"), (stryMutAct_9fa48("63583") ? operation !== CONTROL_PLANE_MUTATION_OPERATION.INSERT : stryMutAct_9fa48("63582") ? false : (stryCov_9fa48("63582", "63583"), operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT)) || (stryMutAct_9fa48("63585") ? operation !== CONTROL_PLANE_MUTATION_OPERATION.UPSERT : stryMutAct_9fa48("63584") ? false : (stryCov_9fa48("63584", "63585"), operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT)))) {
        if (stryMutAct_9fa48("63586")) {
          {}
        } else {
          stryCov_9fa48("63586");
          if (stryMutAct_9fa48("63589") ? !mutation?.row && typeof mutation.row !== TYPEOF.OBJECT : stryMutAct_9fa48("63588") ? false : stryMutAct_9fa48("63587") ? true : (stryCov_9fa48("63587", "63588", "63589"), (stryMutAct_9fa48("63590") ? mutation?.row : (stryCov_9fa48("63590"), !(stryMutAct_9fa48("63591") ? mutation.row : (stryCov_9fa48("63591"), mutation?.row)))) || (stryMutAct_9fa48("63593") ? typeof mutation.row === TYPEOF.OBJECT : stryMutAct_9fa48("63592") ? false : (stryCov_9fa48("63592", "63593"), typeof mutation.row !== TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("63594")) {
              {}
            } else {
              stryCov_9fa48("63594");
              throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
            }
          }
          const rowEntries = stryMutAct_9fa48("63595") ? Object.entries(mutation.row) : (stryCov_9fa48("63595"), Object.entries(mutation.row).filter(([_key, value]) => {
            if (stryMutAct_9fa48("63596")) {
              {}
            } else {
              stryCov_9fa48("63596");
              return stryMutAct_9fa48("63599") ? typeof value === TYPEOF.UNDEFINED : stryMutAct_9fa48("63598") ? false : stryMutAct_9fa48("63597") ? true : (stryCov_9fa48("63597", "63598", "63599"), typeof value !== TYPEOF.UNDEFINED);
            }
          }));
          if (stryMutAct_9fa48("63602") ? rowEntries.length !== NUM.ZERO : stryMutAct_9fa48("63601") ? false : stryMutAct_9fa48("63600") ? true : (stryCov_9fa48("63600", "63601", "63602"), rowEntries.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("63603")) {
              {}
            } else {
              stryCov_9fa48("63603");
              throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
            }
          }
          const columns = rowEntries.map(stryMutAct_9fa48("63604") ? () => undefined : (stryCov_9fa48("63604"), ([key]) => key)).join(stryMutAct_9fa48("63605") ? "" : (stryCov_9fa48("63605"), ', '));
          const placeholders = rowEntries.map(stryMutAct_9fa48("63606") ? () => undefined : (stryCov_9fa48("63606"), () => stryMutAct_9fa48("63607") ? "" : (stryCov_9fa48("63607"), '?'))).join(stryMutAct_9fa48("63608") ? "" : (stryCov_9fa48("63608"), ', '));
          return stryMutAct_9fa48("63609") ? {} : (stryCov_9fa48("63609"), {
            sql: stryMutAct_9fa48("63610") ? `` : (stryCov_9fa48("63610"), `${(stryMutAct_9fa48("63613") ? operation !== CONTROL_PLANE_MUTATION_OPERATION.UPSERT : stryMutAct_9fa48("63612") ? false : stryMutAct_9fa48("63611") ? true : (stryCov_9fa48("63611", "63612", "63613"), operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT)) ? SQL.INSERT_OR_REPLACE_INTO : SQL.INSERT_INTO} ${tableName} (${columns}) ${SQL.VALUES} (${placeholders})`),
            params: rowEntries.map(stryMutAct_9fa48("63614") ? () => undefined : (stryCov_9fa48("63614"), ([_key, value]) => value))
          });
        }
      }
      if (stryMutAct_9fa48("63617") ? !mutation?.whereClause && typeof mutation.whereClause !== TYPEOF.OBJECT : stryMutAct_9fa48("63616") ? false : stryMutAct_9fa48("63615") ? true : (stryCov_9fa48("63615", "63616", "63617"), (stryMutAct_9fa48("63618") ? mutation?.whereClause : (stryCov_9fa48("63618"), !(stryMutAct_9fa48("63619") ? mutation.whereClause : (stryCov_9fa48("63619"), mutation?.whereClause)))) || (stryMutAct_9fa48("63621") ? typeof mutation.whereClause === TYPEOF.OBJECT : stryMutAct_9fa48("63620") ? false : (stryCov_9fa48("63620", "63621"), typeof mutation.whereClause !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("63622")) {
          {}
        } else {
          stryCov_9fa48("63622");
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
        }
      }
      const whereEntries = stryMutAct_9fa48("63623") ? Object.entries(mutation.whereClause) : (stryCov_9fa48("63623"), Object.entries(mutation.whereClause).filter(([_key, value]) => {
        if (stryMutAct_9fa48("63624")) {
          {}
        } else {
          stryCov_9fa48("63624");
          return stryMutAct_9fa48("63627") ? typeof value === TYPEOF.UNDEFINED : stryMutAct_9fa48("63626") ? false : stryMutAct_9fa48("63625") ? true : (stryCov_9fa48("63625", "63626", "63627"), typeof value !== TYPEOF.UNDEFINED);
        }
      }));
      if (stryMutAct_9fa48("63630") ? whereEntries.length !== NUM.ZERO : stryMutAct_9fa48("63629") ? false : stryMutAct_9fa48("63628") ? true : (stryCov_9fa48("63628", "63629", "63630"), whereEntries.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("63631")) {
          {}
        } else {
          stryCov_9fa48("63631");
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
        }
      }
      const whereClause = whereEntries.map(stryMutAct_9fa48("63632") ? () => undefined : (stryCov_9fa48("63632"), ([key]) => stryMutAct_9fa48("63633") ? `` : (stryCov_9fa48("63633"), `${key} = ?`))).join(stryMutAct_9fa48("63634") ? "" : (stryCov_9fa48("63634"), ' AND '));
      if (stryMutAct_9fa48("63637") ? operation !== CONTROL_PLANE_MUTATION_OPERATION.DELETE : stryMutAct_9fa48("63636") ? false : stryMutAct_9fa48("63635") ? true : (stryCov_9fa48("63635", "63636", "63637"), operation === CONTROL_PLANE_MUTATION_OPERATION.DELETE)) {
        if (stryMutAct_9fa48("63638")) {
          {}
        } else {
          stryCov_9fa48("63638");
          return stryMutAct_9fa48("63639") ? {} : (stryCov_9fa48("63639"), {
            sql: stryMutAct_9fa48("63640") ? `` : (stryCov_9fa48("63640"), `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereClause}`),
            params: whereEntries.map(stryMutAct_9fa48("63641") ? () => undefined : (stryCov_9fa48("63641"), ([_key, value]) => value))
          });
        }
      }
      if (stryMutAct_9fa48("63644") ? !mutation?.data && typeof mutation.data !== TYPEOF.OBJECT : stryMutAct_9fa48("63643") ? false : stryMutAct_9fa48("63642") ? true : (stryCov_9fa48("63642", "63643", "63644"), (stryMutAct_9fa48("63645") ? mutation?.data : (stryCov_9fa48("63645"), !(stryMutAct_9fa48("63646") ? mutation.data : (stryCov_9fa48("63646"), mutation?.data)))) || (stryMutAct_9fa48("63648") ? typeof mutation.data === TYPEOF.OBJECT : stryMutAct_9fa48("63647") ? false : (stryCov_9fa48("63647", "63648"), typeof mutation.data !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("63649")) {
          {}
        } else {
          stryCov_9fa48("63649");
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
        }
      }
      const updateEntries = stryMutAct_9fa48("63650") ? Object.entries(mutation.data) : (stryCov_9fa48("63650"), Object.entries(mutation.data).filter(([_key, value]) => {
        if (stryMutAct_9fa48("63651")) {
          {}
        } else {
          stryCov_9fa48("63651");
          return stryMutAct_9fa48("63654") ? typeof value === TYPEOF.UNDEFINED : stryMutAct_9fa48("63653") ? false : stryMutAct_9fa48("63652") ? true : (stryCov_9fa48("63652", "63653", "63654"), typeof value !== TYPEOF.UNDEFINED);
        }
      }));
      if (stryMutAct_9fa48("63657") ? updateEntries.length !== NUM.ZERO : stryMutAct_9fa48("63656") ? false : stryMutAct_9fa48("63655") ? true : (stryCov_9fa48("63655", "63656", "63657"), updateEntries.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("63658")) {
          {}
        } else {
          stryCov_9fa48("63658");
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
        }
      }
      const setClause = updateEntries.map(stryMutAct_9fa48("63659") ? () => undefined : (stryCov_9fa48("63659"), ([key]) => stryMutAct_9fa48("63660") ? `` : (stryCov_9fa48("63660"), `${key} = ?`))).join(stryMutAct_9fa48("63661") ? "" : (stryCov_9fa48("63661"), ', '));
      return stryMutAct_9fa48("63662") ? {} : (stryCov_9fa48("63662"), {
        sql: stryMutAct_9fa48("63663") ? `` : (stryCov_9fa48("63663"), `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClause} ${SQL.WHERE} ${whereClause}`),
        params: stryMutAct_9fa48("63664") ? [] : (stryCov_9fa48("63664"), [...updateEntries.map(stryMutAct_9fa48("63665") ? () => undefined : (stryCov_9fa48("63665"), ([_key, value]) => value)), ...whereEntries.map(stryMutAct_9fa48("63666") ? () => undefined : (stryCov_9fa48("63666"), ([_key, value]) => value))])
      });
    }
  }

  /**
   * Execute one control-plane mutation through the SQL query engine when the
   * caller explicitly owns visibility gating and startup has not brought the
   * CDC mutation helpers online yet.
   * @param {Object} mutation
   * @param {Object} writeOptions
   * @return {Promise<Object>}
   * @private
   */
  async executeSqlMutationFallback(mutation = {}, writeOptions = {}) {
    if (stryMutAct_9fa48("63667")) {
      {}
    } else {
      stryCov_9fa48("63667");
      const sqlQueryEngine = this.assertSqlQueryEngine();
      const {
        sql,
        params
      } = this.buildSqlMutationPlan(mutation);
      return this.normalizeMutationResult(await sqlQueryEngine.executeQuery(sql, params, writeOptions));
    }
  }

  /**
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async executeQuery(sql, params = stryMutAct_9fa48("63668") ? ["Stryker was here"] : (stryCov_9fa48("63668"), []), options = {}) {
    if (stryMutAct_9fa48("63669")) {
      {}
    } else {
      stryCov_9fa48("63669");
      const sqlQueryEngine = this.assertSqlQueryEngine();
      const descriptor = this.resolveSystemTableQueryDescriptor(sql, options);
      const pressureDecision = this.evaluateExecuteQueryPressure(descriptor, options);
      if (stryMutAct_9fa48("63672") ? pressureDecision || pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER || pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT || pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("63671") ? false : stryMutAct_9fa48("63670") ? true : (stryCov_9fa48("63670", "63671", "63672"), pressureDecision && (stryMutAct_9fa48("63674") ? (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER || pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT) && pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("63673") ? true : (stryCov_9fa48("63673", "63674"), (stryMutAct_9fa48("63676") ? pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER && pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("63675") ? false : (stryCov_9fa48("63675", "63676"), (stryMutAct_9fa48("63678") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("63677") ? false : (stryCov_9fa48("63677", "63678"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)) || (stryMutAct_9fa48("63680") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("63679") ? false : (stryCov_9fa48("63679", "63680"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT)))) || (stryMutAct_9fa48("63682") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("63681") ? false : (stryCov_9fa48("63681", "63682"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE)))))) {
        if (stryMutAct_9fa48("63683")) {
          {}
        } else {
          stryCov_9fa48("63683");
          return buildPressureAdmissionFailure(pressureDecision, stryMutAct_9fa48("63684") ? {} : (stryCov_9fa48("63684"), {
            tableName: descriptor.tableName
          }));
        }
      }
      const queryKey = this.buildExecuteQueryKey(descriptor, sql, params, options);
      const result = await this.runSingleFlight(this.inFlightQueryRequestsByKey, queryKey, () => {
        if (stryMutAct_9fa48("63685")) {
          {}
        } else {
          stryCov_9fa48("63685");
          return sqlQueryEngine.executeQuery(sql, params, this.buildQueryOptions(options));
        }
      }, stryMutAct_9fa48("63686") ? {} : (stryCov_9fa48("63686"), {
        joinMetricName: stryMutAct_9fa48("63687") ? "" : (stryCov_9fa48("63687"), 'querySingleFlightJoinCount'),
        bypassMetricName: stryMutAct_9fa48("63688") ? "" : (stryCov_9fa48("63688"), 'queryTrackingBypassCount'),
        maxTrackedRequests: this.gatewayLimits.maxTrackedQueryRequests
      }));
      this.recordControlPlaneOperation(stryMutAct_9fa48("63689") ? {} : (stryCov_9fa48("63689"), {
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY,
        tableName: stryMutAct_9fa48("63692") ? descriptor.tableName && null : stryMutAct_9fa48("63691") ? false : stryMutAct_9fa48("63690") ? true : (stryCov_9fa48("63690", "63691", "63692"), descriptor.tableName || null),
        sqlOperation: stryMutAct_9fa48("63695") ? descriptor.sqlOperation && null : stryMutAct_9fa48("63694") ? false : stryMutAct_9fa48("63693") ? true : (stryCov_9fa48("63693", "63694", "63695"), descriptor.sqlOperation || null),
        strategy: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE,
        routingReadinessDimension: stryMutAct_9fa48("63698") ? options?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("63697") ? false : stryMutAct_9fa48("63696") ? true : (stryCov_9fa48("63696", "63697", "63698"), (stryMutAct_9fa48("63699") ? options.routingReadinessDimension : (stryCov_9fa48("63699"), options?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE),
        success: stryMutAct_9fa48("63702") ? result?.success === false : stryMutAct_9fa48("63701") ? false : stryMutAct_9fa48("63700") ? true : (stryCov_9fa48("63700", "63701", "63702"), (stryMutAct_9fa48("63703") ? result.success : (stryCov_9fa48("63703"), result?.success)) !== (stryMutAct_9fa48("63704") ? true : (stryCov_9fa48("63704"), false))),
        rowCount: Number.isFinite(stryMutAct_9fa48("63705") ? result.rowCount : (stryCov_9fa48("63705"), result?.rowCount)) ? result.rowCount : Array.isArray(stryMutAct_9fa48("63706") ? result.rows : (stryCov_9fa48("63706"), result?.rows)) ? result.rows.length : NUM.ZERO,
        error: (stryMutAct_9fa48("63709") ? result?.success !== false : stryMutAct_9fa48("63708") ? false : stryMutAct_9fa48("63707") ? true : (stryCov_9fa48("63707", "63708", "63709"), (stryMutAct_9fa48("63710") ? result.success : (stryCov_9fa48("63710"), result?.success)) === (stryMutAct_9fa48("63711") ? true : (stryCov_9fa48("63711"), false)))) ? stryMutAct_9fa48("63714") ? result?.error && null : stryMutAct_9fa48("63713") ? false : stryMutAct_9fa48("63712") ? true : (stryCov_9fa48("63712", "63713", "63714"), (stryMutAct_9fa48("63715") ? result.error : (stryCov_9fa48("63715"), result?.error)) || null) : null,
        ...this.buildOperationLedgerDiagnostics(stryMutAct_9fa48("63718") ? descriptor.tableName && null : stryMutAct_9fa48("63717") ? false : stryMutAct_9fa48("63716") ? true : (stryCov_9fa48("63716", "63717", "63718"), descriptor.tableName || null), result, stryMutAct_9fa48("63719") ? {} : (stryCov_9fa48("63719"), {
          ...options,
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY
        })),
        sessionId: (stryMutAct_9fa48("63722") ? typeof options?.sessionId !== TYPEOF.STRING : stryMutAct_9fa48("63721") ? false : stryMutAct_9fa48("63720") ? true : (stryCov_9fa48("63720", "63721", "63722"), typeof (stryMutAct_9fa48("63723") ? options.sessionId : (stryCov_9fa48("63723"), options?.sessionId)) === TYPEOF.STRING)) ? options.sessionId : null
      }));
      return result;
    }
  }

  /**
   * Canonical authoritative control-plane read ingress.
   * Semantic lifecycle, placement, and owner decisions should use this path
   * instead of relying on read-strategy inference.
   *
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async readAuthoritativeRows(tableName, sql, params = stryMutAct_9fa48("63724") ? ["Stryker was here"] : (stryCov_9fa48("63724"), []), options = {}) {
    if (stryMutAct_9fa48("63725")) {
      {}
    } else {
      stryCov_9fa48("63725");
      const strategy = (stryMutAct_9fa48("63728") ? options?.requireAuthoritative !== true : stryMutAct_9fa48("63727") ? false : stryMutAct_9fa48("63726") ? true : (stryCov_9fa48("63726", "63727", "63728"), (stryMutAct_9fa48("63729") ? options.requireAuthoritative : (stryCov_9fa48("63729"), options?.requireAuthoritative)) === (stryMutAct_9fa48("63730") ? false : (stryCov_9fa48("63730"), true)))) ? CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED : CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE;
      return this.executeRead(stryMutAct_9fa48("63731") ? {} : (stryCov_9fa48("63731"), {
        tableName,
        sql,
        params,
        strategy
      }), options);
    }
  }

  /**
   * Canonical projection control-plane read ingress.
   * Observation, diagnostics, and cache-backed convenience reads should use
   * this path instead of relying on read-strategy inference.
   *
   * @param {string} tableName
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async readProjectionRows(tableName, options = {}) {
    if (stryMutAct_9fa48("63732")) {
      {}
    } else {
      stryCov_9fa48("63732");
      return this.executeRead(stryMutAct_9fa48("63733") ? {} : (stryCov_9fa48("63733"), {
        tableName,
        strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
        cachePredicate: stryMutAct_9fa48("63734") ? options.cachePredicate : (stryCov_9fa48("63734"), options?.cachePredicate),
        readFromCache: stryMutAct_9fa48("63735") ? options.readFromCache : (stryCov_9fa48("63735"), options?.readFromCache)
      }), options);
    }
  }

  /**
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async readRows(tableName, sql, params = stryMutAct_9fa48("63736") ? ["Stryker was here"] : (stryCov_9fa48("63736"), []), options = {}) {
    if (stryMutAct_9fa48("63737")) {
      {}
    } else {
      stryCov_9fa48("63737");
      const readProfile = normalizeReadProfile(stryMutAct_9fa48("63740") ? options?.readProfile && options?.profile : stryMutAct_9fa48("63739") ? false : stryMutAct_9fa48("63738") ? true : (stryCov_9fa48("63738", "63739", "63740"), (stryMutAct_9fa48("63741") ? options.readProfile : (stryCov_9fa48("63741"), options?.readProfile)) || (stryMutAct_9fa48("63742") ? options.profile : (stryCov_9fa48("63742"), options?.profile))));
      const profileStrategy = resolveReadStrategyForProfile(readProfile);
      const cdcIntegrationService = this.resolveCdcIntegrationService();
      const strategy = normalizeReadStrategy(stryMutAct_9fa48("63745") ? (options?.strategy || options?.readStrategy || profileStrategy) && (options?.bootstrapSnapshotRows || typeof options?.readBootstrapSnapshot === TYPEOF.FUNCTION ? CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT : options?.cachePredicate || typeof options?.readFromCache === TYPEOF.FUNCTION ? CONTROL_PLANE_READ_STRATEGY.CACHE : options?.requireAuthoritative === true ? CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED : typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION ? CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE : CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED) : stryMutAct_9fa48("63744") ? false : stryMutAct_9fa48("63743") ? true : (stryCov_9fa48("63743", "63744", "63745"), (stryMutAct_9fa48("63747") ? (options?.strategy || options?.readStrategy) && profileStrategy : stryMutAct_9fa48("63746") ? false : (stryCov_9fa48("63746", "63747"), (stryMutAct_9fa48("63749") ? options?.strategy && options?.readStrategy : stryMutAct_9fa48("63748") ? false : (stryCov_9fa48("63748", "63749"), (stryMutAct_9fa48("63750") ? options.strategy : (stryCov_9fa48("63750"), options?.strategy)) || (stryMutAct_9fa48("63751") ? options.readStrategy : (stryCov_9fa48("63751"), options?.readStrategy)))) || profileStrategy)) || ((stryMutAct_9fa48("63754") ? options?.bootstrapSnapshotRows && typeof options?.readBootstrapSnapshot === TYPEOF.FUNCTION : stryMutAct_9fa48("63753") ? false : stryMutAct_9fa48("63752") ? true : (stryCov_9fa48("63752", "63753", "63754"), (stryMutAct_9fa48("63755") ? options.bootstrapSnapshotRows : (stryCov_9fa48("63755"), options?.bootstrapSnapshotRows)) || (stryMutAct_9fa48("63757") ? typeof options?.readBootstrapSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("63756") ? false : (stryCov_9fa48("63756", "63757"), typeof (stryMutAct_9fa48("63758") ? options.readBootstrapSnapshot : (stryCov_9fa48("63758"), options?.readBootstrapSnapshot)) === TYPEOF.FUNCTION)))) ? CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT : (stryMutAct_9fa48("63761") ? options?.cachePredicate && typeof options?.readFromCache === TYPEOF.FUNCTION : stryMutAct_9fa48("63760") ? false : stryMutAct_9fa48("63759") ? true : (stryCov_9fa48("63759", "63760", "63761"), (stryMutAct_9fa48("63762") ? options.cachePredicate : (stryCov_9fa48("63762"), options?.cachePredicate)) || (stryMutAct_9fa48("63764") ? typeof options?.readFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("63763") ? false : (stryCov_9fa48("63763", "63764"), typeof (stryMutAct_9fa48("63765") ? options.readFromCache : (stryCov_9fa48("63765"), options?.readFromCache)) === TYPEOF.FUNCTION)))) ? CONTROL_PLANE_READ_STRATEGY.CACHE : (stryMutAct_9fa48("63768") ? options?.requireAuthoritative !== true : stryMutAct_9fa48("63767") ? false : stryMutAct_9fa48("63766") ? true : (stryCov_9fa48("63766", "63767", "63768"), (stryMutAct_9fa48("63769") ? options.requireAuthoritative : (stryCov_9fa48("63769"), options?.requireAuthoritative)) === (stryMutAct_9fa48("63770") ? false : (stryCov_9fa48("63770"), true)))) ? CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED : (stryMutAct_9fa48("63773") ? typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("63772") ? false : stryMutAct_9fa48("63771") ? true : (stryCov_9fa48("63771", "63772", "63773"), typeof (stryMutAct_9fa48("63774") ? cdcIntegrationService.executeAuthoritativeSystemTableRead : (stryCov_9fa48("63774"), cdcIntegrationService?.executeAuthoritativeSystemTableRead)) === TYPEOF.FUNCTION)) ? CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE : CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED)));
      return this.executeRead(stryMutAct_9fa48("63775") ? {} : (stryCov_9fa48("63775"), {
        tableName,
        sql,
        params,
        strategy,
        cachePredicate: stryMutAct_9fa48("63776") ? options.cachePredicate : (stryCov_9fa48("63776"), options?.cachePredicate),
        readFromCache: stryMutAct_9fa48("63777") ? options.readFromCache : (stryCov_9fa48("63777"), options?.readFromCache),
        readBootstrapSnapshot: stryMutAct_9fa48("63778") ? options.readBootstrapSnapshot : (stryCov_9fa48("63778"), options?.readBootstrapSnapshot),
        bootstrapSnapshotRows: stryMutAct_9fa48("63779") ? options.bootstrapSnapshotRows : (stryCov_9fa48("63779"), options?.bootstrapSnapshotRows),
        phaseScope: normalizePhaseScope(stryMutAct_9fa48("63780") ? options.phaseScope : (stryCov_9fa48("63780"), options?.phaseScope))
      }), stryMutAct_9fa48("63781") ? {} : (stryCov_9fa48("63781"), {
        ...options,
        readProfile
      }));
    }
  }

  /**
   * Canonical control-plane metadata read ingress.
   * One intent declares one strategy. The gateway executes that strategy only.
   *
   * @param {Object} readIntent
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async executeRead(readIntent = {}, options = {}) {
    if (stryMutAct_9fa48("63782")) {
      {}
    } else {
      stryCov_9fa48("63782");
      const tableName = normalizeSystemTableName(stryMutAct_9fa48("63783") ? readIntent.tableName : (stryCov_9fa48("63783"), readIntent?.tableName));
      const strategy = normalizeReadStrategy(stryMutAct_9fa48("63784") ? readIntent.strategy : (stryCov_9fa48("63784"), readIntent?.strategy));
      const sql = stryMutAct_9fa48("63787") ? readIntent?.sql && null : stryMutAct_9fa48("63786") ? false : stryMutAct_9fa48("63785") ? true : (stryCov_9fa48("63785", "63786", "63787"), (stryMutAct_9fa48("63788") ? readIntent.sql : (stryCov_9fa48("63788"), readIntent?.sql)) || null);
      const params = Array.isArray(stryMutAct_9fa48("63789") ? readIntent.params : (stryCov_9fa48("63789"), readIntent?.params)) ? readIntent.params : stryMutAct_9fa48("63790") ? ["Stryker was here"] : (stryCov_9fa48("63790"), []);
      const profiledOptions = resolveReadProfileOptions(options);
      const mergedOptions = stryMutAct_9fa48("63791") ? {} : (stryCov_9fa48("63791"), {
        ...profiledOptions,
        strategy
      });
      const requestKey = this.buildReadRequestKey(tableName, sql, params, mergedOptions);
      const telemetryContext = stryMutAct_9fa48("63792") ? {} : (stryCov_9fa48("63792"), {
        startedAtMs: this.now(),
        owner: stryMutAct_9fa48("63795") ? (readIntent?.owner || options?.owner) && null : stryMutAct_9fa48("63794") ? false : stryMutAct_9fa48("63793") ? true : (stryCov_9fa48("63793", "63794", "63795"), (stryMutAct_9fa48("63797") ? readIntent?.owner && options?.owner : stryMutAct_9fa48("63796") ? false : (stryCov_9fa48("63796", "63797"), (stryMutAct_9fa48("63798") ? readIntent.owner : (stryCov_9fa48("63798"), readIntent?.owner)) || (stryMutAct_9fa48("63799") ? options.owner : (stryCov_9fa48("63799"), options?.owner)))) || null),
        tableName,
        strategy,
        readProfile: stryMutAct_9fa48("63802") ? mergedOptions?.readProfile && null : stryMutAct_9fa48("63801") ? false : stryMutAct_9fa48("63800") ? true : (stryCov_9fa48("63800", "63801", "63802"), (stryMutAct_9fa48("63803") ? mergedOptions.readProfile : (stryCov_9fa48("63803"), mergedOptions?.readProfile)) || null),
        workClass: stryMutAct_9fa48("63806") ? mergedOptions?.workClass && PRESSURE_WORK_CLASS.INTERACTIVE : stryMutAct_9fa48("63805") ? false : stryMutAct_9fa48("63804") ? true : (stryCov_9fa48("63804", "63805", "63806"), (stryMutAct_9fa48("63807") ? mergedOptions.workClass : (stryCov_9fa48("63807"), mergedOptions?.workClass)) || PRESSURE_WORK_CLASS.INTERACTIVE),
        coalescingKey: normalizeCoalescingToken(stryMutAct_9fa48("63808") ? mergedOptions.coalescingKey : (stryCov_9fa48("63808"), mergedOptions?.coalescingKey))
      });
      try {
        if (stryMutAct_9fa48("63809")) {
          {}
        } else {
          stryCov_9fa48("63809");
          const result = await this.runSingleFlight(this.inFlightReadRequestsByKey, requestKey, async () => {
            if (stryMutAct_9fa48("63810")) {
              {}
            } else {
              stryCov_9fa48("63810");
              const pressureDecision = this.evaluateReadPressure(tableName, mergedOptions);
              if (stryMutAct_9fa48("63813") ? (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER || pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT) && pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("63812") ? false : stryMutAct_9fa48("63811") ? true : (stryCov_9fa48("63811", "63812", "63813"), (stryMutAct_9fa48("63815") ? pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER && pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("63814") ? false : (stryCov_9fa48("63814", "63815"), (stryMutAct_9fa48("63817") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("63816") ? false : (stryCov_9fa48("63816", "63817"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)) || (stryMutAct_9fa48("63819") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("63818") ? false : (stryCov_9fa48("63818", "63819"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT)))) || (stryMutAct_9fa48("63821") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("63820") ? false : (stryCov_9fa48("63820", "63821"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE)))) {
                if (stryMutAct_9fa48("63822")) {
                  {}
                } else {
                  stryCov_9fa48("63822");
                  const failure = buildPressureAdmissionFailure(pressureDecision, stryMutAct_9fa48("63823") ? {} : (stryCov_9fa48("63823"), {
                    tableName
                  }));
                  return stryMutAct_9fa48("63824") ? {} : (stryCov_9fa48("63824"), {
                    ...failure,
                    outcome: (stryMutAct_9fa48("63827") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("63826") ? false : stryMutAct_9fa48("63825") ? true : (stryCov_9fa48("63825", "63826", "63827"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)) ? CONTROL_PLANE_READ_OUTCOME.DEFERRED : CONTROL_PLANE_READ_OUTCOME.REJECTED,
                    strategyUsed: strategy
                  });
                }
              }
              switch (strategy) {
                case CONTROL_PLANE_READ_STRATEGY.CACHE:
                  if (stryMutAct_9fa48("63828")) {} else {
                    stryCov_9fa48("63828");
                    return this.executeCacheRead(tableName, readIntent, mergedOptions);
                  }
                case CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE:
                case CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED:
                  if (stryMutAct_9fa48("63829")) {} else {
                    stryCov_9fa48("63829");
                    return this.executeAuthoritativeRead(tableName, sql, params, strategy, mergedOptions);
                  }
                case CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED:
                  if (stryMutAct_9fa48("63830")) {} else {
                    stryCov_9fa48("63830");
                    return this.executeOwnerLocalRead(tableName, sql, params, mergedOptions);
                  }
                case CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT:
                  if (stryMutAct_9fa48("63831")) {} else {
                    stryCov_9fa48("63831");
                    return this.executeBootstrapSnapshotRead(tableName, readIntent, mergedOptions);
                  }
                default:
                  if (stryMutAct_9fa48("63832")) {} else {
                    stryCov_9fa48("63832");
                    return stryMutAct_9fa48("63833") ? {} : (stryCov_9fa48("63833"), {
                      success: stryMutAct_9fa48("63834") ? true : (stryCov_9fa48("63834"), false),
                      error: stryMutAct_9fa48("63835") ? "" : (stryCov_9fa48("63835"), 'unsupported_control_plane_read_strategy'),
                      tableName,
                      rows: stryMutAct_9fa48("63836") ? ["Stryker was here"] : (stryCov_9fa48("63836"), []),
                      outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
                      strategyUsed: null
                    });
                  }
              }
            }
          }, stryMutAct_9fa48("63837") ? {} : (stryCov_9fa48("63837"), {
            joinMetricName: stryMutAct_9fa48("63838") ? "" : (stryCov_9fa48("63838"), 'readSingleFlightJoinCount'),
            bypassMetricName: stryMutAct_9fa48("63839") ? "" : (stryCov_9fa48("63839"), 'readTrackingBypassCount'),
            maxTrackedRequests: this.gatewayLimits.maxTrackedReadRequests
          }));
          this.recordControlPlaneOperation(stryMutAct_9fa48("63840") ? {} : (stryCov_9fa48("63840"), {
            operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ,
            tableName,
            strategy,
            routingReadinessDimension: stryMutAct_9fa48("63843") ? mergedOptions?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("63842") ? false : stryMutAct_9fa48("63841") ? true : (stryCov_9fa48("63841", "63842", "63843"), (stryMutAct_9fa48("63844") ? mergedOptions.routingReadinessDimension : (stryCov_9fa48("63844"), mergedOptions?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE),
            outcome: stryMutAct_9fa48("63847") ? result?.outcome && null : stryMutAct_9fa48("63846") ? false : stryMutAct_9fa48("63845") ? true : (stryCov_9fa48("63845", "63846", "63847"), (stryMutAct_9fa48("63848") ? result.outcome : (stryCov_9fa48("63848"), result?.outcome)) || null),
            success: stryMutAct_9fa48("63851") ? result?.success !== true : stryMutAct_9fa48("63850") ? false : stryMutAct_9fa48("63849") ? true : (stryCov_9fa48("63849", "63850", "63851"), (stryMutAct_9fa48("63852") ? result.success : (stryCov_9fa48("63852"), result?.success)) === (stryMutAct_9fa48("63853") ? false : (stryCov_9fa48("63853"), true))),
            rowCount: Number.isFinite(stryMutAct_9fa48("63854") ? result.rowCount : (stryCov_9fa48("63854"), result?.rowCount)) ? result.rowCount : Array.isArray(stryMutAct_9fa48("63855") ? result.rows : (stryCov_9fa48("63855"), result?.rows)) ? result.rows.length : NUM.ZERO,
            source: stryMutAct_9fa48("63858") ? result?.source && null : stryMutAct_9fa48("63857") ? false : stryMutAct_9fa48("63856") ? true : (stryCov_9fa48("63856", "63857", "63858"), (stryMutAct_9fa48("63859") ? result.source : (stryCov_9fa48("63859"), result?.source)) || null),
            usedSqlFallback: stryMutAct_9fa48("63862") ? result?.usedSqlFallback !== true : stryMutAct_9fa48("63861") ? false : stryMutAct_9fa48("63860") ? true : (stryCov_9fa48("63860", "63861", "63862"), (stryMutAct_9fa48("63863") ? result.usedSqlFallback : (stryCov_9fa48("63863"), result?.usedSqlFallback)) === (stryMutAct_9fa48("63864") ? false : (stryCov_9fa48("63864"), true))),
            error: (stryMutAct_9fa48("63867") ? result?.success !== true : stryMutAct_9fa48("63866") ? false : stryMutAct_9fa48("63865") ? true : (stryCov_9fa48("63865", "63866", "63867"), (stryMutAct_9fa48("63868") ? result.success : (stryCov_9fa48("63868"), result?.success)) === (stryMutAct_9fa48("63869") ? false : (stryCov_9fa48("63869"), true)))) ? null : stryMutAct_9fa48("63872") ? result?.error && null : stryMutAct_9fa48("63871") ? false : stryMutAct_9fa48("63870") ? true : (stryCov_9fa48("63870", "63871", "63872"), (stryMutAct_9fa48("63873") ? result.error : (stryCov_9fa48("63873"), result?.error)) || null),
            ...this.buildOperationLedgerDiagnostics(tableName, result, mergedOptions)
          }));
          this.recordReadTelemetry(telemetryContext, result);
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("63874")) {
          {}
        } else {
          stryCov_9fa48("63874");
          this.recordControlPlaneOperation(stryMutAct_9fa48("63875") ? {} : (stryCov_9fa48("63875"), {
            operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ,
            tableName,
            strategy,
            routingReadinessDimension: stryMutAct_9fa48("63878") ? mergedOptions?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("63877") ? false : stryMutAct_9fa48("63876") ? true : (stryCov_9fa48("63876", "63877", "63878"), (stryMutAct_9fa48("63879") ? mergedOptions.routingReadinessDimension : (stryCov_9fa48("63879"), mergedOptions?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE),
            outcome: stryMutAct_9fa48("63882") ? error?.outcome && CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY : stryMutAct_9fa48("63881") ? false : stryMutAct_9fa48("63880") ? true : (stryCov_9fa48("63880", "63881", "63882"), (stryMutAct_9fa48("63883") ? error.outcome : (stryCov_9fa48("63883"), error?.outcome)) || CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY),
            success: stryMutAct_9fa48("63884") ? true : (stryCov_9fa48("63884"), false),
            rowCount: NUM.ZERO,
            error: stryMutAct_9fa48("63887") ? error?.message && String(error) : stryMutAct_9fa48("63886") ? false : stryMutAct_9fa48("63885") ? true : (stryCov_9fa48("63885", "63886", "63887"), (stryMutAct_9fa48("63888") ? error.message : (stryCov_9fa48("63888"), error?.message)) || String(error)),
            ...this.buildOperationLedgerDiagnostics(tableName, error, mergedOptions)
          }));
          this.recordReadTelemetry(telemetryContext, stryMutAct_9fa48("63889") ? {} : (stryCov_9fa48("63889"), {
            success: stryMutAct_9fa48("63890") ? true : (stryCov_9fa48("63890"), false),
            outcome: stryMutAct_9fa48("63893") ? error?.outcome && CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY : stryMutAct_9fa48("63892") ? false : stryMutAct_9fa48("63891") ? true : (stryCov_9fa48("63891", "63892", "63893"), (stryMutAct_9fa48("63894") ? error.outcome : (stryCov_9fa48("63894"), error?.outcome)) || CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY),
            rowCount: NUM.ZERO
          }));
          throw error;
        }
      }
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async insertSystemTableRow(tableName, row, options = {}) {
    if (stryMutAct_9fa48("63895")) {
      {}
    } else {
      stryCov_9fa48("63895");
      return this.submitMutation(stryMutAct_9fa48("63896") ? {} : (stryCov_9fa48("63896"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName,
        row
      }), options);
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} data
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async updateSystemTableRow(tableName, whereClause, data, options = {}) {
    if (stryMutAct_9fa48("63897")) {
      {}
    } else {
      stryCov_9fa48("63897");
      return this.submitMutation(stryMutAct_9fa48("63898") ? {} : (stryCov_9fa48("63898"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName,
        whereClause,
        data
      }), options);
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async upsertSystemTableRow(tableName, row, options = {}) {
    if (stryMutAct_9fa48("63899")) {
      {}
    } else {
      stryCov_9fa48("63899");
      return this.submitMutation(stryMutAct_9fa48("63900") ? {} : (stryCov_9fa48("63900"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName,
        row
      }), options);
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async deleteSystemTableRow(tableName, whereClause, options = {}) {
    if (stryMutAct_9fa48("63901")) {
      {}
    } else {
      stryCov_9fa48("63901");
      return this.submitMutation(stryMutAct_9fa48("63902") ? {} : (stryCov_9fa48("63902"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
        tableName,
        whereClause
      }), options);
    }
  }

  /**
   * Canonical control-plane mutation ingress for system-table writes.
   * Legacy insert/update/upsert/delete helpers delegate here so write
   * admission, routing, and backpressure policy stay on one path.
   *
   * @param {Object} mutation
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async submitMutation(mutation = {}, options = {}) {
    if (stryMutAct_9fa48("63903")) {
      {}
    } else {
      stryCov_9fa48("63903");
      const operation = normalizeMutationOperation(stryMutAct_9fa48("63904") ? mutation.operation : (stryCov_9fa48("63904"), mutation?.operation));
      const tableName = normalizeSystemTableName(stryMutAct_9fa48("63905") ? mutation.tableName : (stryCov_9fa48("63905"), mutation?.tableName));
      if (stryMutAct_9fa48("63908") ? false : stryMutAct_9fa48("63907") ? true : stryMutAct_9fa48("63906") ? operation : (stryCov_9fa48("63906", "63907", "63908"), !operation)) {
        if (stryMutAct_9fa48("63909")) {
          {}
        } else {
          stryCov_9fa48("63909");
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_OPERATION_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("63912") ? false : stryMutAct_9fa48("63911") ? true : stryMutAct_9fa48("63910") ? tableName : (stryCov_9fa48("63910", "63911", "63912"), !tableName)) {
        if (stryMutAct_9fa48("63913")) {
          {}
        } else {
          stryCov_9fa48("63913");
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
        }
      }
      const normalizedMutation = stryMutAct_9fa48("63914") ? {} : (stryCov_9fa48("63914"), {
        ...mutation,
        operation,
        tableName,
        row: (stryMutAct_9fa48("63917") ? operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT && operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT : stryMutAct_9fa48("63916") ? false : stryMutAct_9fa48("63915") ? true : (stryCov_9fa48("63915", "63916", "63917"), (stryMutAct_9fa48("63919") ? operation !== CONTROL_PLANE_MUTATION_OPERATION.INSERT : stryMutAct_9fa48("63918") ? false : (stryCov_9fa48("63918", "63919"), operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT)) || (stryMutAct_9fa48("63921") ? operation !== CONTROL_PLANE_MUTATION_OPERATION.UPSERT : stryMutAct_9fa48("63920") ? false : (stryCov_9fa48("63920", "63921"), operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT)))) ? canonicalizeSystemTableRow(tableName, stryMutAct_9fa48("63922") ? mutation.row : (stryCov_9fa48("63922"), mutation?.row)) : stryMutAct_9fa48("63923") ? mutation.row : (stryCov_9fa48("63923"), mutation?.row)
      });
      const writeOptions = this.buildWriteOptions(options);
      const cdcIntegrationService = this.resolveCdcIntegrationService();
      const {
        requestKey,
        mergePolicy
      } = this.buildMutationCoalescingDescriptor(normalizedMutation, writeOptions);
      const telemetryContext = stryMutAct_9fa48("63924") ? {} : (stryCov_9fa48("63924"), {
        startedAtMs: this.now(),
        owner: stryMutAct_9fa48("63927") ? (mutation?.owner || options?.owner) && null : stryMutAct_9fa48("63926") ? false : stryMutAct_9fa48("63925") ? true : (stryCov_9fa48("63925", "63926", "63927"), (stryMutAct_9fa48("63929") ? mutation?.owner && options?.owner : stryMutAct_9fa48("63928") ? false : (stryCov_9fa48("63928", "63929"), (stryMutAct_9fa48("63930") ? mutation.owner : (stryCov_9fa48("63930"), mutation?.owner)) || (stryMutAct_9fa48("63931") ? options.owner : (stryCov_9fa48("63931"), options?.owner)))) || null),
        tableName,
        operation,
        workClass: stryMutAct_9fa48("63934") ? writeOptions?.workClass && null : stryMutAct_9fa48("63933") ? false : stryMutAct_9fa48("63932") ? true : (stryCov_9fa48("63932", "63933", "63934"), (stryMutAct_9fa48("63935") ? writeOptions.workClass : (stryCov_9fa48("63935"), writeOptions?.workClass)) || null),
        coalescingKey: normalizeCoalescingToken(stryMutAct_9fa48("63936") ? writeOptions.coalescingKey : (stryCov_9fa48("63936"), writeOptions?.coalescingKey)),
        mergePolicy
      });
      const executionFactory = async () => {
        if (stryMutAct_9fa48("63937")) {
          {}
        } else {
          stryCov_9fa48("63937");
          if (stryMutAct_9fa48("63940") ? false : stryMutAct_9fa48("63939") ? true : stryMutAct_9fa48("63938") ? cdcIntegrationService : (stryCov_9fa48("63938", "63939", "63940"), !cdcIntegrationService)) {
            if (stryMutAct_9fa48("63941")) {
              {}
            } else {
              stryCov_9fa48("63941");
              if (stryMutAct_9fa48("63943") ? false : stryMutAct_9fa48("63942") ? true : (stryCov_9fa48("63942", "63943"), this.shouldUseSqlMutationFallback(writeOptions))) {
                if (stryMutAct_9fa48("63944")) {
                  {}
                } else {
                  stryCov_9fa48("63944");
                  return this.executeSqlMutationFallback(normalizedMutation, writeOptions);
                }
              }
              throw new Error(GATEWAY_ERROR_MSG.CDC_REQUIRED);
            }
          }
          if (stryMutAct_9fa48("63947") ? operation !== CONTROL_PLANE_MUTATION_OPERATION.INSERT : stryMutAct_9fa48("63946") ? false : stryMutAct_9fa48("63945") ? true : (stryCov_9fa48("63945", "63946", "63947"), operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT)) {
            if (stryMutAct_9fa48("63948")) {
              {}
            } else {
              stryCov_9fa48("63948");
              if (stryMutAct_9fa48("63951") ? !normalizedMutation?.row && typeof normalizedMutation.row !== TYPEOF.OBJECT : stryMutAct_9fa48("63950") ? false : stryMutAct_9fa48("63949") ? true : (stryCov_9fa48("63949", "63950", "63951"), (stryMutAct_9fa48("63952") ? normalizedMutation?.row : (stryCov_9fa48("63952"), !(stryMutAct_9fa48("63953") ? normalizedMutation.row : (stryCov_9fa48("63953"), normalizedMutation?.row)))) || (stryMutAct_9fa48("63955") ? typeof normalizedMutation.row === TYPEOF.OBJECT : stryMutAct_9fa48("63954") ? false : (stryCov_9fa48("63954", "63955"), typeof normalizedMutation.row !== TYPEOF.OBJECT)))) {
                if (stryMutAct_9fa48("63956")) {
                  {}
                } else {
                  stryCov_9fa48("63956");
                  throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
                }
              }
              return this.normalizeMutationResult(await cdcIntegrationService.insertSystemTableRow(tableName, normalizedMutation.row, writeOptions));
            }
          }
          if (stryMutAct_9fa48("63959") ? operation !== CONTROL_PLANE_MUTATION_OPERATION.UPDATE : stryMutAct_9fa48("63958") ? false : stryMutAct_9fa48("63957") ? true : (stryCov_9fa48("63957", "63958", "63959"), operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE)) {
            if (stryMutAct_9fa48("63960")) {
              {}
            } else {
              stryCov_9fa48("63960");
              if (stryMutAct_9fa48("63963") ? !normalizedMutation?.whereClause && typeof normalizedMutation.whereClause !== TYPEOF.OBJECT : stryMutAct_9fa48("63962") ? false : stryMutAct_9fa48("63961") ? true : (stryCov_9fa48("63961", "63962", "63963"), (stryMutAct_9fa48("63964") ? normalizedMutation?.whereClause : (stryCov_9fa48("63964"), !(stryMutAct_9fa48("63965") ? normalizedMutation.whereClause : (stryCov_9fa48("63965"), normalizedMutation?.whereClause)))) || (stryMutAct_9fa48("63967") ? typeof normalizedMutation.whereClause === TYPEOF.OBJECT : stryMutAct_9fa48("63966") ? false : (stryCov_9fa48("63966", "63967"), typeof normalizedMutation.whereClause !== TYPEOF.OBJECT)))) {
                if (stryMutAct_9fa48("63968")) {
                  {}
                } else {
                  stryCov_9fa48("63968");
                  throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
                }
              }
              if (stryMutAct_9fa48("63971") ? !normalizedMutation?.data && typeof normalizedMutation.data !== TYPEOF.OBJECT : stryMutAct_9fa48("63970") ? false : stryMutAct_9fa48("63969") ? true : (stryCov_9fa48("63969", "63970", "63971"), (stryMutAct_9fa48("63972") ? normalizedMutation?.data : (stryCov_9fa48("63972"), !(stryMutAct_9fa48("63973") ? normalizedMutation.data : (stryCov_9fa48("63973"), normalizedMutation?.data)))) || (stryMutAct_9fa48("63975") ? typeof normalizedMutation.data === TYPEOF.OBJECT : stryMutAct_9fa48("63974") ? false : (stryCov_9fa48("63974", "63975"), typeof normalizedMutation.data !== TYPEOF.OBJECT)))) {
                if (stryMutAct_9fa48("63976")) {
                  {}
                } else {
                  stryCov_9fa48("63976");
                  throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
                }
              }
              return this.normalizeMutationResult(await cdcIntegrationService.updateSystemTableRow(tableName, normalizedMutation.whereClause, normalizedMutation.data, writeOptions));
            }
          }
          if (stryMutAct_9fa48("63979") ? operation !== CONTROL_PLANE_MUTATION_OPERATION.UPSERT : stryMutAct_9fa48("63978") ? false : stryMutAct_9fa48("63977") ? true : (stryCov_9fa48("63977", "63978", "63979"), operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT)) {
            if (stryMutAct_9fa48("63980")) {
              {}
            } else {
              stryCov_9fa48("63980");
              if (stryMutAct_9fa48("63983") ? !normalizedMutation?.row && typeof normalizedMutation.row !== TYPEOF.OBJECT : stryMutAct_9fa48("63982") ? false : stryMutAct_9fa48("63981") ? true : (stryCov_9fa48("63981", "63982", "63983"), (stryMutAct_9fa48("63984") ? normalizedMutation?.row : (stryCov_9fa48("63984"), !(stryMutAct_9fa48("63985") ? normalizedMutation.row : (stryCov_9fa48("63985"), normalizedMutation?.row)))) || (stryMutAct_9fa48("63987") ? typeof normalizedMutation.row === TYPEOF.OBJECT : stryMutAct_9fa48("63986") ? false : (stryCov_9fa48("63986", "63987"), typeof normalizedMutation.row !== TYPEOF.OBJECT)))) {
                if (stryMutAct_9fa48("63988")) {
                  {}
                } else {
                  stryCov_9fa48("63988");
                  throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
                }
              }
              return this.normalizeMutationResult(await cdcIntegrationService.upsertSystemTableRow(tableName, normalizedMutation.row, writeOptions));
            }
          }
          if (stryMutAct_9fa48("63991") ? !normalizedMutation?.whereClause && typeof normalizedMutation.whereClause !== TYPEOF.OBJECT : stryMutAct_9fa48("63990") ? false : stryMutAct_9fa48("63989") ? true : (stryCov_9fa48("63989", "63990", "63991"), (stryMutAct_9fa48("63992") ? normalizedMutation?.whereClause : (stryCov_9fa48("63992"), !(stryMutAct_9fa48("63993") ? normalizedMutation.whereClause : (stryCov_9fa48("63993"), normalizedMutation?.whereClause)))) || (stryMutAct_9fa48("63995") ? typeof normalizedMutation.whereClause === TYPEOF.OBJECT : stryMutAct_9fa48("63994") ? false : (stryCov_9fa48("63994", "63995"), typeof normalizedMutation.whereClause !== TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("63996")) {
              {}
            } else {
              stryCov_9fa48("63996");
              throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
            }
          }
          return this.normalizeMutationResult(await cdcIntegrationService.deleteSystemTableRow(tableName, normalizedMutation.whereClause, writeOptions));
        }
      };
      if (stryMutAct_9fa48("63999") ? mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING || requestKey : stryMutAct_9fa48("63998") ? false : stryMutAct_9fa48("63997") ? true : (stryCov_9fa48("63997", "63998", "63999"), (stryMutAct_9fa48("64001") ? mergePolicy !== CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING : stryMutAct_9fa48("64000") ? true : (stryCov_9fa48("64000", "64001"), mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING)) && requestKey)) {
        if (stryMutAct_9fa48("64002")) {
          {}
        } else {
          stryCov_9fa48("64002");
          const result = await this.runReplacePendingMutation(requestKey, executionFactory);
          this.recordMutationTelemetry(telemetryContext, result);
          return result;
        }
      }
      if (stryMutAct_9fa48("64005") ? mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT || requestKey : stryMutAct_9fa48("64004") ? false : stryMutAct_9fa48("64003") ? true : (stryCov_9fa48("64003", "64004", "64005"), (stryMutAct_9fa48("64007") ? mergePolicy !== CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT : stryMutAct_9fa48("64006") ? true : (stryCov_9fa48("64006", "64007"), mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT)) && requestKey)) {
        if (stryMutAct_9fa48("64008")) {
          {}
        } else {
          stryCov_9fa48("64008");
          try {
            if (stryMutAct_9fa48("64009")) {
              {}
            } else {
              stryCov_9fa48("64009");
              const result = await this.runSingleFlight(this.inFlightMutationRequestsByKey, requestKey, executionFactory, stryMutAct_9fa48("64010") ? {} : (stryCov_9fa48("64010"), {
                joinMetricName: stryMutAct_9fa48("64011") ? "" : (stryCov_9fa48("64011"), 'mutationSingleFlightJoinCount'),
                maxTrackedRequests: this.gatewayLimits.maxTrackedMutationRequests
              }));
              this.recordControlPlaneOperation(stryMutAct_9fa48("64012") ? {} : (stryCov_9fa48("64012"), {
                operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
                tableName,
                mutationOperation: operation,
                routingReadinessDimension: stryMutAct_9fa48("64015") ? writeOptions?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("64014") ? false : stryMutAct_9fa48("64013") ? true : (stryCov_9fa48("64013", "64014", "64015"), (stryMutAct_9fa48("64016") ? writeOptions.routingReadinessDimension : (stryCov_9fa48("64016"), writeOptions?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE),
                outcome: stryMutAct_9fa48("64019") ? result?.outcome && null : stryMutAct_9fa48("64018") ? false : stryMutAct_9fa48("64017") ? true : (stryCov_9fa48("64017", "64018", "64019"), (stryMutAct_9fa48("64020") ? result.outcome : (stryCov_9fa48("64020"), result?.outcome)) || null),
                success: stryMutAct_9fa48("64023") ? result?.success === false : stryMutAct_9fa48("64022") ? false : stryMutAct_9fa48("64021") ? true : (stryCov_9fa48("64021", "64022", "64023"), (stryMutAct_9fa48("64024") ? result.success : (stryCov_9fa48("64024"), result?.success)) !== (stryMutAct_9fa48("64025") ? true : (stryCov_9fa48("64025"), false))),
                affectedRows: Number(stryMutAct_9fa48("64026") ? (result?.partitionResult?.affectedRows ?? result?.affectedRows) && NUM.ZERO : (stryCov_9fa48("64026"), (stryMutAct_9fa48("64027") ? result?.partitionResult?.affectedRows && result?.affectedRows : (stryCov_9fa48("64027"), (stryMutAct_9fa48("64029") ? result.partitionResult?.affectedRows : stryMutAct_9fa48("64028") ? result?.partitionResult.affectedRows : (stryCov_9fa48("64028", "64029"), result?.partitionResult?.affectedRows)) ?? (stryMutAct_9fa48("64030") ? result.affectedRows : (stryCov_9fa48("64030"), result?.affectedRows)))) ?? NUM.ZERO)),
                error: (stryMutAct_9fa48("64033") ? result?.success !== false : stryMutAct_9fa48("64032") ? false : stryMutAct_9fa48("64031") ? true : (stryCov_9fa48("64031", "64032", "64033"), (stryMutAct_9fa48("64034") ? result.success : (stryCov_9fa48("64034"), result?.success)) === (stryMutAct_9fa48("64035") ? true : (stryCov_9fa48("64035"), false)))) ? stryMutAct_9fa48("64038") ? result?.error && null : stryMutAct_9fa48("64037") ? false : stryMutAct_9fa48("64036") ? true : (stryCov_9fa48("64036", "64037", "64038"), (stryMutAct_9fa48("64039") ? result.error : (stryCov_9fa48("64039"), result?.error)) || null) : null,
                ...this.buildOperationLedgerDiagnostics(tableName, result, stryMutAct_9fa48("64040") ? {} : (stryCov_9fa48("64040"), {
                  ...writeOptions,
                  operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION
                }))
              }));
              this.recordMutationTelemetry(telemetryContext, result);
              return result;
            }
          } catch (error) {
            if (stryMutAct_9fa48("64041")) {
              {}
            } else {
              stryCov_9fa48("64041");
              this.recordControlPlaneOperation(stryMutAct_9fa48("64042") ? {} : (stryCov_9fa48("64042"), {
                operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
                tableName,
                mutationOperation: operation,
                routingReadinessDimension: stryMutAct_9fa48("64045") ? writeOptions?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("64044") ? false : stryMutAct_9fa48("64043") ? true : (stryCov_9fa48("64043", "64044", "64045"), (stryMutAct_9fa48("64046") ? writeOptions.routingReadinessDimension : (stryCov_9fa48("64046"), writeOptions?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE),
                outcome: stryMutAct_9fa48("64049") ? error?.outcome && CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY : stryMutAct_9fa48("64048") ? false : stryMutAct_9fa48("64047") ? true : (stryCov_9fa48("64047", "64048", "64049"), (stryMutAct_9fa48("64050") ? error.outcome : (stryCov_9fa48("64050"), error?.outcome)) || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY),
                success: stryMutAct_9fa48("64051") ? true : (stryCov_9fa48("64051"), false),
                affectedRows: NUM.ZERO,
                error: stryMutAct_9fa48("64054") ? error?.message && String(error) : stryMutAct_9fa48("64053") ? false : stryMutAct_9fa48("64052") ? true : (stryCov_9fa48("64052", "64053", "64054"), (stryMutAct_9fa48("64055") ? error.message : (stryCov_9fa48("64055"), error?.message)) || String(error)),
                ...this.buildOperationLedgerDiagnostics(tableName, error, stryMutAct_9fa48("64056") ? {} : (stryCov_9fa48("64056"), {
                  ...writeOptions,
                  operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION
                }))
              }));
              this.recordMutationTelemetry(telemetryContext, stryMutAct_9fa48("64057") ? {} : (stryCov_9fa48("64057"), {
                success: stryMutAct_9fa48("64058") ? true : (stryCov_9fa48("64058"), false),
                outcome: stryMutAct_9fa48("64061") ? error?.outcome && CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY : stryMutAct_9fa48("64060") ? false : stryMutAct_9fa48("64059") ? true : (stryCov_9fa48("64059", "64060", "64061"), (stryMutAct_9fa48("64062") ? error.outcome : (stryCov_9fa48("64062"), error?.outcome)) || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY)
              }));
              throw error;
            }
          }
        }
      }
      try {
        if (stryMutAct_9fa48("64063")) {
          {}
        } else {
          stryCov_9fa48("64063");
          const result = await executionFactory();
          this.recordControlPlaneOperation(stryMutAct_9fa48("64064") ? {} : (stryCov_9fa48("64064"), {
            operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
            tableName,
            mutationOperation: operation,
            routingReadinessDimension: stryMutAct_9fa48("64067") ? writeOptions?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("64066") ? false : stryMutAct_9fa48("64065") ? true : (stryCov_9fa48("64065", "64066", "64067"), (stryMutAct_9fa48("64068") ? writeOptions.routingReadinessDimension : (stryCov_9fa48("64068"), writeOptions?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE),
            outcome: stryMutAct_9fa48("64071") ? result?.outcome && null : stryMutAct_9fa48("64070") ? false : stryMutAct_9fa48("64069") ? true : (stryCov_9fa48("64069", "64070", "64071"), (stryMutAct_9fa48("64072") ? result.outcome : (stryCov_9fa48("64072"), result?.outcome)) || null),
            success: stryMutAct_9fa48("64075") ? result?.success === false : stryMutAct_9fa48("64074") ? false : stryMutAct_9fa48("64073") ? true : (stryCov_9fa48("64073", "64074", "64075"), (stryMutAct_9fa48("64076") ? result.success : (stryCov_9fa48("64076"), result?.success)) !== (stryMutAct_9fa48("64077") ? true : (stryCov_9fa48("64077"), false))),
            affectedRows: Number(stryMutAct_9fa48("64078") ? (result?.partitionResult?.affectedRows ?? result?.affectedRows) && NUM.ZERO : (stryCov_9fa48("64078"), (stryMutAct_9fa48("64079") ? result?.partitionResult?.affectedRows && result?.affectedRows : (stryCov_9fa48("64079"), (stryMutAct_9fa48("64081") ? result.partitionResult?.affectedRows : stryMutAct_9fa48("64080") ? result?.partitionResult.affectedRows : (stryCov_9fa48("64080", "64081"), result?.partitionResult?.affectedRows)) ?? (stryMutAct_9fa48("64082") ? result.affectedRows : (stryCov_9fa48("64082"), result?.affectedRows)))) ?? NUM.ZERO)),
            error: (stryMutAct_9fa48("64085") ? result?.success !== false : stryMutAct_9fa48("64084") ? false : stryMutAct_9fa48("64083") ? true : (stryCov_9fa48("64083", "64084", "64085"), (stryMutAct_9fa48("64086") ? result.success : (stryCov_9fa48("64086"), result?.success)) === (stryMutAct_9fa48("64087") ? true : (stryCov_9fa48("64087"), false)))) ? stryMutAct_9fa48("64090") ? result?.error && null : stryMutAct_9fa48("64089") ? false : stryMutAct_9fa48("64088") ? true : (stryCov_9fa48("64088", "64089", "64090"), (stryMutAct_9fa48("64091") ? result.error : (stryCov_9fa48("64091"), result?.error)) || null) : null,
            ...this.buildOperationLedgerDiagnostics(tableName, result, stryMutAct_9fa48("64092") ? {} : (stryCov_9fa48("64092"), {
              ...writeOptions,
              operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION
            }))
          }));
          this.recordMutationTelemetry(telemetryContext, result);
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("64093")) {
          {}
        } else {
          stryCov_9fa48("64093");
          this.recordControlPlaneOperation(stryMutAct_9fa48("64094") ? {} : (stryCov_9fa48("64094"), {
            operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
            tableName,
            mutationOperation: operation,
            routingReadinessDimension: stryMutAct_9fa48("64097") ? writeOptions?.routingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("64096") ? false : stryMutAct_9fa48("64095") ? true : (stryCov_9fa48("64095", "64096", "64097"), (stryMutAct_9fa48("64098") ? writeOptions.routingReadinessDimension : (stryCov_9fa48("64098"), writeOptions?.routingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE),
            outcome: stryMutAct_9fa48("64101") ? error?.outcome && CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY : stryMutAct_9fa48("64100") ? false : stryMutAct_9fa48("64099") ? true : (stryCov_9fa48("64099", "64100", "64101"), (stryMutAct_9fa48("64102") ? error.outcome : (stryCov_9fa48("64102"), error?.outcome)) || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY),
            success: stryMutAct_9fa48("64103") ? true : (stryCov_9fa48("64103"), false),
            affectedRows: NUM.ZERO,
            error: stryMutAct_9fa48("64106") ? error?.message && String(error) : stryMutAct_9fa48("64105") ? false : stryMutAct_9fa48("64104") ? true : (stryCov_9fa48("64104", "64105", "64106"), (stryMutAct_9fa48("64107") ? error.message : (stryCov_9fa48("64107"), error?.message)) || String(error)),
            ...this.buildOperationLedgerDiagnostics(tableName, error, stryMutAct_9fa48("64108") ? {} : (stryCov_9fa48("64108"), {
              ...writeOptions,
              operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION
            }))
          }));
          this.recordMutationTelemetry(telemetryContext, stryMutAct_9fa48("64109") ? {} : (stryCov_9fa48("64109"), {
            success: stryMutAct_9fa48("64110") ? true : (stryCov_9fa48("64110"), false),
            outcome: stryMutAct_9fa48("64113") ? error?.outcome && CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY : stryMutAct_9fa48("64112") ? false : stryMutAct_9fa48("64111") ? true : (stryCov_9fa48("64111", "64112", "64113"), (stryMutAct_9fa48("64114") ? error.outcome : (stryCov_9fa48("64114"), error?.outcome)) || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY)
          }));
          throw error;
        }
      }
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} readIntent
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeCacheRead(tableName, readIntent, options) {
    if (stryMutAct_9fa48("64115")) {
      {}
    } else {
      stryCov_9fa48("64115");
      const systemTableCache = this.resolveSystemTableCache();
      const readFromCache = (stryMutAct_9fa48("64118") ? typeof readIntent?.readFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("64117") ? false : stryMutAct_9fa48("64116") ? true : (stryCov_9fa48("64116", "64117", "64118"), typeof (stryMutAct_9fa48("64119") ? readIntent.readFromCache : (stryCov_9fa48("64119"), readIntent?.readFromCache)) === TYPEOF.FUNCTION)) ? readIntent.readFromCache : null;
      const cachePredicate = (stryMutAct_9fa48("64122") ? typeof readIntent?.cachePredicate !== TYPEOF.FUNCTION : stryMutAct_9fa48("64121") ? false : stryMutAct_9fa48("64120") ? true : (stryCov_9fa48("64120", "64121", "64122"), typeof (stryMutAct_9fa48("64123") ? readIntent.cachePredicate : (stryCov_9fa48("64123"), readIntent?.cachePredicate)) === TYPEOF.FUNCTION)) ? readIntent.cachePredicate : null;
      if (stryMutAct_9fa48("64126") ? !systemTableCache || !readFromCache : stryMutAct_9fa48("64125") ? false : stryMutAct_9fa48("64124") ? true : (stryCov_9fa48("64124", "64125", "64126"), (stryMutAct_9fa48("64127") ? systemTableCache : (stryCov_9fa48("64127"), !systemTableCache)) && (stryMutAct_9fa48("64128") ? readFromCache : (stryCov_9fa48("64128"), !readFromCache)))) {
        if (stryMutAct_9fa48("64129")) {
          {}
        } else {
          stryCov_9fa48("64129");
          return stryMutAct_9fa48("64130") ? {} : (stryCov_9fa48("64130"), {
            success: stryMutAct_9fa48("64131") ? true : (stryCov_9fa48("64131"), false),
            tableName,
            rows: stryMutAct_9fa48("64132") ? ["Stryker was here"] : (stryCov_9fa48("64132"), []),
            outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
            strategyUsed: CONTROL_PLANE_READ_STRATEGY.CACHE,
            error: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SYSTEM_TABLE_CACHE_UNAVAILABLE
          });
        }
      }
      let rows = stryMutAct_9fa48("64133") ? ["Stryker was here"] : (stryCov_9fa48("64133"), []);
      if (stryMutAct_9fa48("64135") ? false : stryMutAct_9fa48("64134") ? true : (stryCov_9fa48("64134", "64135"), readFromCache)) {
        if (stryMutAct_9fa48("64136")) {
          {}
        } else {
          stryCov_9fa48("64136");
          const cacheRows = await readFromCache(systemTableCache, readIntent, options);
          rows = Array.isArray(cacheRows) ? cacheRows : stryMutAct_9fa48("64137") ? ["Stryker was here"] : (stryCov_9fa48("64137"), []);
        }
      } else if (stryMutAct_9fa48("64140") ? cachePredicate || typeof systemTableCache?.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("64139") ? false : stryMutAct_9fa48("64138") ? true : (stryCov_9fa48("64138", "64139", "64140"), cachePredicate && (stryMutAct_9fa48("64142") ? typeof systemTableCache?.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("64141") ? true : (stryCov_9fa48("64141", "64142"), typeof (stryMutAct_9fa48("64143") ? systemTableCache.filter : (stryCov_9fa48("64143"), systemTableCache?.filter)) === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("64144")) {
          {}
        } else {
          stryCov_9fa48("64144");
          rows = stryMutAct_9fa48("64147") ? systemTableCache.filter(tableName, cachePredicate) && [] : stryMutAct_9fa48("64146") ? false : stryMutAct_9fa48("64145") ? true : (stryCov_9fa48("64145", "64146", "64147"), (stryMutAct_9fa48("64148") ? systemTableCache : (stryCov_9fa48("64148"), systemTableCache.filter(tableName, cachePredicate))) || (stryMutAct_9fa48("64149") ? ["Stryker was here"] : (stryCov_9fa48("64149"), [])));
        }
      } else if (stryMutAct_9fa48("64152") ? typeof systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("64151") ? false : stryMutAct_9fa48("64150") ? true : (stryCov_9fa48("64150", "64151", "64152"), typeof (stryMutAct_9fa48("64153") ? systemTableCache.getAll : (stryCov_9fa48("64153"), systemTableCache?.getAll)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("64154")) {
          {}
        } else {
          stryCov_9fa48("64154");
          rows = stryMutAct_9fa48("64157") ? systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("64156") ? false : stryMutAct_9fa48("64155") ? true : (stryCov_9fa48("64155", "64156", "64157"), systemTableCache.getAll(tableName) || (stryMutAct_9fa48("64158") ? ["Stryker was here"] : (stryCov_9fa48("64158"), [])));
        }
      }
      return stryMutAct_9fa48("64159") ? {} : (stryCov_9fa48("64159"), {
        success: stryMutAct_9fa48("64160") ? false : (stryCov_9fa48("64160"), true),
        tableName,
        rows,
        rowCount: rows.length,
        outcome: CONTROL_PLANE_READ_OUTCOME.CACHE_HIT,
        strategyUsed: CONTROL_PLANE_READ_STRATEGY.CACHE
      });
    }
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {string} strategy
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  buildGatewayReadResult(baseResult, tableName, strategyUsed, outcome, extra = {}) {
    if (stryMutAct_9fa48("64161")) {
      {}
    } else {
      stryCov_9fa48("64161");
      return stryMutAct_9fa48("64162") ? {} : (stryCov_9fa48("64162"), {
        ...baseResult,
        tableName,
        rows: Array.isArray(stryMutAct_9fa48("64163") ? baseResult.rows : (stryCov_9fa48("64163"), baseResult?.rows)) ? baseResult.rows : stryMutAct_9fa48("64164") ? ["Stryker was here"] : (stryCov_9fa48("64164"), []),
        outcome,
        strategyUsed,
        ...extra
      });
    }
  }

  /**
   * @param {string} tableName
   * @param {string} strategyUsed
   * @param {string} outcome
   * @param {string} error
   * @return {Object}
   * @private
   */
  buildUnavailableGatewayReadResult(tableName, strategyUsed, outcome, error) {
    if (stryMutAct_9fa48("64165")) {
      {}
    } else {
      stryCov_9fa48("64165");
      return stryMutAct_9fa48("64166") ? {} : (stryCov_9fa48("64166"), {
        success: stryMutAct_9fa48("64167") ? true : (stryCov_9fa48("64167"), false),
        tableName,
        rows: stryMutAct_9fa48("64168") ? ["Stryker was here"] : (stryCov_9fa48("64168"), []),
        outcome,
        strategyUsed,
        error
      });
    }
  }

  /**
   * @param {string} strategy
   * @return {string}
   * @private
   */
  resolveAuthoritativeReadFailureOutcome(strategy) {
    if (stryMutAct_9fa48("64169")) {
      {}
    } else {
      stryCov_9fa48("64169");
      return (stryMutAct_9fa48("64172") ? strategy !== CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED : stryMutAct_9fa48("64171") ? false : stryMutAct_9fa48("64170") ? true : (stryCov_9fa48("64170", "64171", "64172"), strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED)) ? CONTROL_PLANE_READ_OUTCOME.STALE_NOT_ALLOWED : CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY;
    }
  }

  /**
   * @param {Object} result
   * @return {{outcome: string, completionState: string}}
   * @private
   */
  resolveNormalizedMutationState(result) {
    if (stryMutAct_9fa48("64173")) {
      {}
    } else {
      stryCov_9fa48("64173");
      const affectedRows = Number(stryMutAct_9fa48("64174") ? result?.partitionResult?.affectedRows && result?.affectedRows : (stryCov_9fa48("64174"), (stryMutAct_9fa48("64176") ? result.partitionResult?.affectedRows : stryMutAct_9fa48("64175") ? result?.partitionResult.affectedRows : (stryCov_9fa48("64175", "64176"), result?.partitionResult?.affectedRows)) ?? (stryMutAct_9fa48("64177") ? result.affectedRows : (stryCov_9fa48("64177"), result?.affectedRows))));
      if (stryMutAct_9fa48("64180") ? result.outcome : stryMutAct_9fa48("64179") ? false : stryMutAct_9fa48("64178") ? true : (stryCov_9fa48("64178", "64179", "64180"), result?.outcome)) {
        if (stryMutAct_9fa48("64181")) {
          {}
        } else {
          stryCov_9fa48("64181");
          return stryMutAct_9fa48("64182") ? {} : (stryCov_9fa48("64182"), {
            outcome: result.outcome,
            completionState: resolveMutationCompletionState(result)
          });
        }
      } else if (stryMutAct_9fa48("64185") ? result?.success !== false : stryMutAct_9fa48("64184") ? false : stryMutAct_9fa48("64183") ? true : (stryCov_9fa48("64183", "64184", "64185"), (stryMutAct_9fa48("64186") ? result.success : (stryCov_9fa48("64186"), result?.success)) === (stryMutAct_9fa48("64187") ? true : (stryCov_9fa48("64187"), false)))) {
        if (stryMutAct_9fa48("64188")) {
          {}
        } else {
          stryCov_9fa48("64188");
          return stryMutAct_9fa48("64189") ? {} : (stryCov_9fa48("64189"), {
            outcome: (stryMutAct_9fa48("64192") ? result?.pressureAction !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("64191") ? false : stryMutAct_9fa48("64190") ? true : (stryCov_9fa48("64190", "64191", "64192"), (stryMutAct_9fa48("64193") ? result.pressureAction : (stryCov_9fa48("64193"), result?.pressureAction)) === PRESSURE_GOVERNOR_ACTION.DEFER)) ? CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED : (stryMutAct_9fa48("64196") ? result?.pressureAction !== PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("64195") ? false : stryMutAct_9fa48("64194") ? true : (stryCov_9fa48("64194", "64195", "64196"), (stryMutAct_9fa48("64197") ? result.pressureAction : (stryCov_9fa48("64197"), result?.pressureAction)) === PRESSURE_GOVERNOR_ACTION.REJECT)) ? CONTROL_PLANE_MUTATION_OUTCOME.REJECTED : CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
            completionState: resolveMutationCompletionState(result)
          });
        }
      } else if (stryMutAct_9fa48("64200") ? typeof result?.visibilityState === TYPEOF.STRING || result.visibilityState !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE : stryMutAct_9fa48("64199") ? false : stryMutAct_9fa48("64198") ? true : (stryCov_9fa48("64198", "64199", "64200"), (stryMutAct_9fa48("64202") ? typeof result?.visibilityState !== TYPEOF.STRING : stryMutAct_9fa48("64201") ? true : (stryCov_9fa48("64201", "64202"), typeof (stryMutAct_9fa48("64203") ? result.visibilityState : (stryCov_9fa48("64203"), result?.visibilityState)) === TYPEOF.STRING)) && (stryMutAct_9fa48("64205") ? result.visibilityState === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE : stryMutAct_9fa48("64204") ? true : (stryCov_9fa48("64204", "64205"), result.visibilityState !== CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE)))) {
        if (stryMutAct_9fa48("64206")) {
          {}
        } else {
          stryCov_9fa48("64206");
          return stryMutAct_9fa48("64207") ? {} : (stryCov_9fa48("64207"), {
            outcome: CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY,
            completionState: CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY
          });
        }
      } else if (stryMutAct_9fa48("64210") ? Number.isFinite(affectedRows) || affectedRows <= NUM.ZERO : stryMutAct_9fa48("64209") ? false : stryMutAct_9fa48("64208") ? true : (stryCov_9fa48("64208", "64209", "64210"), Number.isFinite(affectedRows) && (stryMutAct_9fa48("64213") ? affectedRows > NUM.ZERO : stryMutAct_9fa48("64212") ? affectedRows < NUM.ZERO : stryMutAct_9fa48("64211") ? true : (stryCov_9fa48("64211", "64212", "64213"), affectedRows <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("64214")) {
          {}
        } else {
          stryCov_9fa48("64214");
          return stryMutAct_9fa48("64215") ? {} : (stryCov_9fa48("64215"), {
            outcome: CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
            completionState: CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED
          });
        }
      }
      return stryMutAct_9fa48("64216") ? {} : (stryCov_9fa48("64216"), {
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
        completionState: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED
      });
    }
  }

  /**
   * @param {string} tableName
   * @param {Array<Object>} rows
   * @return {Object}
   * @private
   */
  buildBootstrapSnapshotSuccessResult(tableName, rows) {
    if (stryMutAct_9fa48("64217")) {
      {}
    } else {
      stryCov_9fa48("64217");
      return stryMutAct_9fa48("64218") ? {} : (stryCov_9fa48("64218"), {
        success: stryMutAct_9fa48("64219") ? false : (stryCov_9fa48("64219"), true),
        tableName,
        rows,
        rowCount: rows.length,
        outcome: CONTROL_PLANE_READ_OUTCOME.BOOTSTRAP_SNAPSHOT,
        strategyUsed: CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT
      });
    }
  }

  /**
   * @param {string} tableName
   * @param {string} error
   * @return {Object}
   * @private
   */
  buildBootstrapSnapshotFailureResult(tableName, error) {
    if (stryMutAct_9fa48("64220")) {
      {}
    } else {
      stryCov_9fa48("64220");
      return this.buildUnavailableGatewayReadResult(tableName, CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT, CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY, error);
    }
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {string} strategy
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeAuthoritativeRead(tableName, sql, params, strategy, options) {
    if (stryMutAct_9fa48("64221")) {
      {}
    } else {
      stryCov_9fa48("64221");
      const cdcIntegrationService = this.resolveCdcIntegrationService();
      const allowSqlFallback = stryMutAct_9fa48("64224") ? options?.allowSqlFallback !== true : stryMutAct_9fa48("64223") ? false : stryMutAct_9fa48("64222") ? true : (stryCov_9fa48("64222", "64223", "64224"), (stryMutAct_9fa48("64225") ? options.allowSqlFallback : (stryCov_9fa48("64225"), options?.allowSqlFallback)) === (stryMutAct_9fa48("64226") ? false : (stryCov_9fa48("64226"), true)));
      if (stryMutAct_9fa48("64229") ? typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION : stryMutAct_9fa48("64228") ? false : stryMutAct_9fa48("64227") ? true : (stryCov_9fa48("64227", "64228", "64229"), typeof (stryMutAct_9fa48("64230") ? cdcIntegrationService.executeAuthoritativeSystemTableRead : (stryCov_9fa48("64230"), cdcIntegrationService?.executeAuthoritativeSystemTableRead)) !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("64231")) {
          {}
        } else {
          stryCov_9fa48("64231");
          if (stryMutAct_9fa48("64234") ? allowSqlFallback || strategy !== CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED : stryMutAct_9fa48("64233") ? false : stryMutAct_9fa48("64232") ? true : (stryCov_9fa48("64232", "64233", "64234"), allowSqlFallback && (stryMutAct_9fa48("64236") ? strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED : stryMutAct_9fa48("64235") ? true : (stryCov_9fa48("64235", "64236"), strategy !== CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED)))) {
            if (stryMutAct_9fa48("64237")) {
              {}
            } else {
              stryCov_9fa48("64237");
              const sqlQueryEngine = this.resolveSqlQueryEngine();
              if (stryMutAct_9fa48("64240") ? typeof sqlQueryEngine?.executeQuery !== TYPEOF.FUNCTION : stryMutAct_9fa48("64239") ? false : stryMutAct_9fa48("64238") ? true : (stryCov_9fa48("64238", "64239", "64240"), typeof (stryMutAct_9fa48("64241") ? sqlQueryEngine.executeQuery : (stryCov_9fa48("64241"), sqlQueryEngine?.executeQuery)) === TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("64242")) {
                  {}
                } else {
                  stryCov_9fa48("64242");
                  const result = await sqlQueryEngine.executeQuery(sql, params, this.buildQueryOptions(options));
                  return this.buildGatewayReadResult(result, tableName, strategy, (stryMutAct_9fa48("64245") ? result?.success !== true : stryMutAct_9fa48("64244") ? false : stryMutAct_9fa48("64243") ? true : (stryCov_9fa48("64243", "64244", "64245"), (stryMutAct_9fa48("64246") ? result.success : (stryCov_9fa48("64246"), result?.success)) === (stryMutAct_9fa48("64247") ? false : (stryCov_9fa48("64247"), true)))) ? CONTROL_PLANE_READ_OUTCOME.AUTHORITATIVE : CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY, stryMutAct_9fa48("64248") ? {} : (stryCov_9fa48("64248"), {
                    source: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE,
                    usedSqlFallback: stryMutAct_9fa48("64249") ? false : (stryCov_9fa48("64249"), true)
                  }));
                }
              }
            }
          }
          return this.buildUnavailableGatewayReadResult(tableName, strategy, this.resolveAuthoritativeReadFailureOutcome(strategy), CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.AUTHORITATIVE_READ_OWNER_UNAVAILABLE);
        }
      }
      const authoritativeResult = await cdcIntegrationService.executeAuthoritativeSystemTableRead(tableName, sql, params, stryMutAct_9fa48("64250") ? {} : (stryCov_9fa48("64250"), {
        localReadConsistency: stryMutAct_9fa48("64253") ? options?.localReadConsistency && CONTROL_PLANE_LOCAL_READ_CONSISTENCY : stryMutAct_9fa48("64252") ? false : stryMutAct_9fa48("64251") ? true : (stryCov_9fa48("64251", "64252", "64253"), (stryMutAct_9fa48("64254") ? options.localReadConsistency : (stryCov_9fa48("64254"), options?.localReadConsistency)) || CONTROL_PLANE_LOCAL_READ_CONSISTENCY),
        replicaFallbackConsistency: stryMutAct_9fa48("64257") ? options?.replicaFallbackConsistency && CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY : stryMutAct_9fa48("64256") ? false : stryMutAct_9fa48("64255") ? true : (stryCov_9fa48("64255", "64256", "64257"), (stryMutAct_9fa48("64258") ? options.replicaFallbackConsistency : (stryCov_9fa48("64258"), options?.replicaFallbackConsistency)) || CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY),
        preferOwnerRpcRead: stryMutAct_9fa48("64261") ? options?.preferOwnerRpcRead !== true : stryMutAct_9fa48("64260") ? false : stryMutAct_9fa48("64259") ? true : (stryCov_9fa48("64259", "64260", "64261"), (stryMutAct_9fa48("64262") ? options.preferOwnerRpcRead : (stryCov_9fa48("64262"), options?.preferOwnerRpcRead)) === (stryMutAct_9fa48("64263") ? false : (stryCov_9fa48("64263"), true))),
        requireOwnerRpcRead: stryMutAct_9fa48("64266") ? options?.requireOwnerRpcRead !== true : stryMutAct_9fa48("64265") ? false : stryMutAct_9fa48("64264") ? true : (stryCov_9fa48("64264", "64265", "64266"), (stryMutAct_9fa48("64267") ? options.requireOwnerRpcRead : (stryCov_9fa48("64267"), options?.requireOwnerRpcRead)) === (stryMutAct_9fa48("64268") ? false : (stryCov_9fa48("64268"), true))),
        allowOwnerRpcFallback: stryMutAct_9fa48("64269") ? options.allowOwnerRpcFallback : (stryCov_9fa48("64269"), options?.allowOwnerRpcFallback),
        allowSqlFallback: stryMutAct_9fa48("64272") ? options?.allowSqlFallback !== true : stryMutAct_9fa48("64271") ? false : stryMutAct_9fa48("64270") ? true : (stryCov_9fa48("64270", "64271", "64272"), (stryMutAct_9fa48("64273") ? options.allowSqlFallback : (stryCov_9fa48("64273"), options?.allowSqlFallback)) === (stryMutAct_9fa48("64274") ? false : (stryCov_9fa48("64274"), true))),
        queryOptions: this.buildQueryOptions(options)
      }));
      return this.buildGatewayReadResult(authoritativeResult, tableName, strategy, (stryMutAct_9fa48("64277") ? authoritativeResult?.success !== true : stryMutAct_9fa48("64276") ? false : stryMutAct_9fa48("64275") ? true : (stryCov_9fa48("64275", "64276", "64277"), (stryMutAct_9fa48("64278") ? authoritativeResult.success : (stryCov_9fa48("64278"), authoritativeResult?.success)) === (stryMutAct_9fa48("64279") ? false : (stryCov_9fa48("64279"), true)))) ? CONTROL_PLANE_READ_OUTCOME.AUTHORITATIVE : this.resolveAuthoritativeReadFailureOutcome(strategy));
    }
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeOwnerLocalRead(tableName, sql, params, options) {
    if (stryMutAct_9fa48("64280")) {
      {}
    } else {
      stryCov_9fa48("64280");
      const cdcIntegrationService = this.resolveCdcIntegrationService();
      if (stryMutAct_9fa48("64283") ? typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("64282") ? false : stryMutAct_9fa48("64281") ? true : (stryCov_9fa48("64281", "64282", "64283"), typeof (stryMutAct_9fa48("64284") ? cdcIntegrationService.executeAuthoritativeSystemTableRead : (stryCov_9fa48("64284"), cdcIntegrationService?.executeAuthoritativeSystemTableRead)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("64285")) {
          {}
        } else {
          stryCov_9fa48("64285");
          const authoritativeResult = await cdcIntegrationService.executeAuthoritativeSystemTableRead(tableName, sql, params, stryMutAct_9fa48("64286") ? {} : (stryCov_9fa48("64286"), {
            localReadConsistency: stryMutAct_9fa48("64289") ? options?.localReadConsistency && CONTROL_PLANE_LOCAL_READ_CONSISTENCY : stryMutAct_9fa48("64288") ? false : stryMutAct_9fa48("64287") ? true : (stryCov_9fa48("64287", "64288", "64289"), (stryMutAct_9fa48("64290") ? options.localReadConsistency : (stryCov_9fa48("64290"), options?.localReadConsistency)) || CONTROL_PLANE_LOCAL_READ_CONSISTENCY),
            replicaFallbackConsistency: stryMutAct_9fa48("64293") ? options?.replicaFallbackConsistency && CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY : stryMutAct_9fa48("64292") ? false : stryMutAct_9fa48("64291") ? true : (stryCov_9fa48("64291", "64292", "64293"), (stryMutAct_9fa48("64294") ? options.replicaFallbackConsistency : (stryCov_9fa48("64294"), options?.replicaFallbackConsistency)) || CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY),
            preferOwnerRpcRead: stryMutAct_9fa48("64297") ? options?.preferOwnerRpcRead !== true : stryMutAct_9fa48("64296") ? false : stryMutAct_9fa48("64295") ? true : (stryCov_9fa48("64295", "64296", "64297"), (stryMutAct_9fa48("64298") ? options.preferOwnerRpcRead : (stryCov_9fa48("64298"), options?.preferOwnerRpcRead)) === (stryMutAct_9fa48("64299") ? false : (stryCov_9fa48("64299"), true))),
            requireOwnerRpcRead: stryMutAct_9fa48("64302") ? options?.requireOwnerRpcRead !== true : stryMutAct_9fa48("64301") ? false : stryMutAct_9fa48("64300") ? true : (stryCov_9fa48("64300", "64301", "64302"), (stryMutAct_9fa48("64303") ? options.requireOwnerRpcRead : (stryCov_9fa48("64303"), options?.requireOwnerRpcRead)) === (stryMutAct_9fa48("64304") ? false : (stryCov_9fa48("64304"), true))),
            allowOwnerRpcFallback: stryMutAct_9fa48("64305") ? options.allowOwnerRpcFallback : (stryCov_9fa48("64305"), options?.allowOwnerRpcFallback),
            allowSqlFallback: stryMutAct_9fa48("64308") ? options?.allowSqlFallback !== true : stryMutAct_9fa48("64307") ? false : stryMutAct_9fa48("64306") ? true : (stryCov_9fa48("64306", "64307", "64308"), (stryMutAct_9fa48("64309") ? options.allowSqlFallback : (stryCov_9fa48("64309"), options?.allowSqlFallback)) === (stryMutAct_9fa48("64310") ? false : (stryCov_9fa48("64310"), true))),
            queryOptions: this.buildQueryOptions(options)
          }));
          return this.buildGatewayReadResult(authoritativeResult, tableName, CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED, (stryMutAct_9fa48("64313") ? authoritativeResult?.success !== true : stryMutAct_9fa48("64312") ? false : stryMutAct_9fa48("64311") ? true : (stryCov_9fa48("64311", "64312", "64313"), (stryMutAct_9fa48("64314") ? authoritativeResult.success : (stryCov_9fa48("64314"), authoritativeResult?.success)) === (stryMutAct_9fa48("64315") ? false : (stryCov_9fa48("64315"), true)))) ? CONTROL_PLANE_READ_OUTCOME.OWNER_LOCAL_NON_PROPAGATED : CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY, stryMutAct_9fa48("64316") ? {} : (stryCov_9fa48("64316"), {
            rowCount: Number.isFinite(stryMutAct_9fa48("64317") ? authoritativeResult.rowCount : (stryCov_9fa48("64317"), authoritativeResult?.rowCount)) ? authoritativeResult.rowCount : Array.isArray(stryMutAct_9fa48("64318") ? authoritativeResult.rows : (stryCov_9fa48("64318"), authoritativeResult?.rows)) ? authoritativeResult.rows.length : NUM.ZERO
          }));
        }
      }
      const sqlQueryEngine = this.resolveSqlQueryEngine();
      if (stryMutAct_9fa48("64321") ? typeof sqlQueryEngine?.executeQuery === TYPEOF.FUNCTION : stryMutAct_9fa48("64320") ? false : stryMutAct_9fa48("64319") ? true : (stryCov_9fa48("64319", "64320", "64321"), typeof (stryMutAct_9fa48("64322") ? sqlQueryEngine.executeQuery : (stryCov_9fa48("64322"), sqlQueryEngine?.executeQuery)) !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("64323")) {
          {}
        } else {
          stryCov_9fa48("64323");
          return this.buildUnavailableGatewayReadResult(tableName, CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED, CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.SQL_QUERY_ENGINE_UNAVAILABLE);
        }
      }
      const result = await sqlQueryEngine.executeQuery(sql, params, this.buildQueryOptions(options));
      return this.buildGatewayReadResult(result, tableName, CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED, (stryMutAct_9fa48("64326") ? result?.success !== false : stryMutAct_9fa48("64325") ? false : stryMutAct_9fa48("64324") ? true : (stryCov_9fa48("64324", "64325", "64326"), (stryMutAct_9fa48("64327") ? result.success : (stryCov_9fa48("64327"), result?.success)) === (stryMutAct_9fa48("64328") ? true : (stryCov_9fa48("64328"), false)))) ? CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY : CONTROL_PLANE_READ_OUTCOME.OWNER_LOCAL_NON_PROPAGATED);
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} readIntent
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeBootstrapSnapshotRead(tableName, readIntent, options) {
    if (stryMutAct_9fa48("64329")) {
      {}
    } else {
      stryCov_9fa48("64329");
      const phaseScope = normalizePhaseScope(stryMutAct_9fa48("64332") ? readIntent?.phaseScope && options?.phaseScope : stryMutAct_9fa48("64331") ? false : stryMutAct_9fa48("64330") ? true : (stryCov_9fa48("64330", "64331", "64332"), (stryMutAct_9fa48("64333") ? readIntent.phaseScope : (stryCov_9fa48("64333"), readIntent?.phaseScope)) || (stryMutAct_9fa48("64334") ? options.phaseScope : (stryCov_9fa48("64334"), options?.phaseScope))));
      if (stryMutAct_9fa48("64337") ? false : stryMutAct_9fa48("64336") ? true : stryMutAct_9fa48("64335") ? phaseScope : (stryCov_9fa48("64335", "64336", "64337"), !phaseScope)) {
        if (stryMutAct_9fa48("64338")) {
          {}
        } else {
          stryCov_9fa48("64338");
          return this.buildBootstrapSnapshotFailureResult(tableName, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.BOOTSTRAP_SNAPSHOT_PHASE_SCOPE_REQUIRED);
        }
      } else if (stryMutAct_9fa48("64341") ? typeof readIntent?.readBootstrapSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("64340") ? false : stryMutAct_9fa48("64339") ? true : (stryCov_9fa48("64339", "64340", "64341"), typeof (stryMutAct_9fa48("64342") ? readIntent.readBootstrapSnapshot : (stryCov_9fa48("64342"), readIntent?.readBootstrapSnapshot)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("64343")) {
          {}
        } else {
          stryCov_9fa48("64343");
          const rows = await readIntent.readBootstrapSnapshot(readIntent, options);
          return this.buildBootstrapSnapshotSuccessResult(tableName, Array.isArray(rows) ? rows : stryMutAct_9fa48("64344") ? ["Stryker was here"] : (stryCov_9fa48("64344"), []));
        }
      } else if (stryMutAct_9fa48("64347") ? false : stryMutAct_9fa48("64346") ? true : stryMutAct_9fa48("64345") ? Array.isArray(readIntent?.bootstrapSnapshotRows) : (stryCov_9fa48("64345", "64346", "64347"), !Array.isArray(stryMutAct_9fa48("64348") ? readIntent.bootstrapSnapshotRows : (stryCov_9fa48("64348"), readIntent?.bootstrapSnapshotRows)))) {
        if (stryMutAct_9fa48("64349")) {
          {}
        } else {
          stryCov_9fa48("64349");
          return this.buildBootstrapSnapshotFailureResult(tableName, CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.BOOTSTRAP_SNAPSHOT_UNAVAILABLE);
        }
      }
      return this.buildBootstrapSnapshotSuccessResult(tableName, readIntent.bootstrapSnapshotRows);
    }
  }

  /**
   * @param {Object} result
   * @return {Object}
   * @private
   */
  normalizeMutationResult(result) {
    if (stryMutAct_9fa48("64350")) {
      {}
    } else {
      stryCov_9fa48("64350");
      const normalizedState = this.resolveNormalizedMutationState(result);
      return stryMutAct_9fa48("64351") ? {} : (stryCov_9fa48("64351"), {
        ...result,
        outcome: normalizedState.outcome,
        completionState: normalizedState.completionState
      });
    }
  }
}
async function readAuthoritativeControlPlaneRows(gateway, tableName, sql, params = stryMutAct_9fa48("64352") ? ["Stryker was here"] : (stryCov_9fa48("64352"), []), options = {}) {
  if (stryMutAct_9fa48("64353")) {
    {}
  } else {
    stryCov_9fa48("64353");
    if (stryMutAct_9fa48("64356") ? gateway || typeof gateway.readAuthoritativeRows === TYPEOF.FUNCTION : stryMutAct_9fa48("64355") ? false : stryMutAct_9fa48("64354") ? true : (stryCov_9fa48("64354", "64355", "64356"), gateway && (stryMutAct_9fa48("64358") ? typeof gateway.readAuthoritativeRows !== TYPEOF.FUNCTION : stryMutAct_9fa48("64357") ? true : (stryCov_9fa48("64357", "64358"), typeof gateway.readAuthoritativeRows === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("64359")) {
        {}
      } else {
        stryCov_9fa48("64359");
        return gateway.readAuthoritativeRows(tableName, sql, params, options);
      }
    }
    if (stryMutAct_9fa48("64362") ? gateway || typeof gateway.executeRead === TYPEOF.FUNCTION : stryMutAct_9fa48("64361") ? false : stryMutAct_9fa48("64360") ? true : (stryCov_9fa48("64360", "64361", "64362"), gateway && (stryMutAct_9fa48("64364") ? typeof gateway.executeRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("64363") ? true : (stryCov_9fa48("64363", "64364"), typeof gateway.executeRead === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("64365")) {
        {}
      } else {
        stryCov_9fa48("64365");
        return gateway.executeRead(stryMutAct_9fa48("64366") ? {} : (stryCov_9fa48("64366"), {
          tableName,
          sql,
          params,
          strategy: (stryMutAct_9fa48("64369") ? options?.requireAuthoritative !== true : stryMutAct_9fa48("64368") ? false : stryMutAct_9fa48("64367") ? true : (stryCov_9fa48("64367", "64368", "64369"), (stryMutAct_9fa48("64370") ? options.requireAuthoritative : (stryCov_9fa48("64370"), options?.requireAuthoritative)) === (stryMutAct_9fa48("64371") ? false : (stryCov_9fa48("64371"), true)))) ? CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED : CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE
        }), options);
      }
    }
    return gateway.readRows(tableName, sql, params, options);
  }
}
async function readProjectionControlPlaneRows(gateway, tableName, options = {}) {
  if (stryMutAct_9fa48("64372")) {
    {}
  } else {
    stryCov_9fa48("64372");
    if (stryMutAct_9fa48("64375") ? gateway || typeof gateway.readProjectionRows === TYPEOF.FUNCTION : stryMutAct_9fa48("64374") ? false : stryMutAct_9fa48("64373") ? true : (stryCov_9fa48("64373", "64374", "64375"), gateway && (stryMutAct_9fa48("64377") ? typeof gateway.readProjectionRows !== TYPEOF.FUNCTION : stryMutAct_9fa48("64376") ? true : (stryCov_9fa48("64376", "64377"), typeof gateway.readProjectionRows === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("64378")) {
        {}
      } else {
        stryCov_9fa48("64378");
        return gateway.readProjectionRows(tableName, options);
      }
    }
    if (stryMutAct_9fa48("64381") ? gateway || typeof gateway.executeRead === TYPEOF.FUNCTION : stryMutAct_9fa48("64380") ? false : stryMutAct_9fa48("64379") ? true : (stryCov_9fa48("64379", "64380", "64381"), gateway && (stryMutAct_9fa48("64383") ? typeof gateway.executeRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("64382") ? true : (stryCov_9fa48("64382", "64383"), typeof gateway.executeRead === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("64384")) {
        {}
      } else {
        stryCov_9fa48("64384");
        return gateway.executeRead(stryMutAct_9fa48("64385") ? {} : (stryCov_9fa48("64385"), {
          tableName,
          strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
          cachePredicate: stryMutAct_9fa48("64386") ? options.cachePredicate : (stryCov_9fa48("64386"), options?.cachePredicate),
          readFromCache: stryMutAct_9fa48("64387") ? options.readFromCache : (stryCov_9fa48("64387"), options?.readFromCache)
        }), options);
      }
    }
    return gateway.readRows(tableName, stryMutAct_9fa48("64390") ? options?.sql && null : stryMutAct_9fa48("64389") ? false : stryMutAct_9fa48("64388") ? true : (stryCov_9fa48("64388", "64389", "64390"), (stryMutAct_9fa48("64391") ? options.sql : (stryCov_9fa48("64391"), options?.sql)) || null), stryMutAct_9fa48("64394") ? options?.params && [] : stryMutAct_9fa48("64393") ? false : stryMutAct_9fa48("64392") ? true : (stryCov_9fa48("64392", "64393", "64394"), (stryMutAct_9fa48("64395") ? options.params : (stryCov_9fa48("64395"), options?.params)) || (stryMutAct_9fa48("64396") ? ["Stryker was here"] : (stryCov_9fa48("64396"), []))), options);
  }
}
export { CONTROL_PLANE_PHASE_SCOPE, CONTROL_PLANE_LOCAL_READ_CONSISTENCY, CONTROL_PLANE_MUTATION_MERGE_POLICY, CONTROL_PLANE_MUTATION_OPERATION, CONTROL_PLANE_MUTATION_OUTCOME, CONTROL_PLANE_READ_PROFILE, CONTROL_PLANE_READ_OUTCOME, CONTROL_PLANE_READ_STRATEGY, CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY, ControlPlaneSystemTableGateway, readAuthoritativeControlPlaneRows, readProjectionControlPlaneRows, resolveReadProfileOptions };