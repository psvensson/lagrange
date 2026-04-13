/**
 * Shared debug constants for Track A tracing integration.
 *
 * These constants are reused by service/callback tracing,
 * session resolution, and admin stream routing.
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
const DEBUG_CAPABILITY = Object.freeze(stryMutAct_9fa48("75106") ? {} : (stryCov_9fa48("75106"), {
  TRACE: stryMutAct_9fa48("75107") ? "" : (stryCov_9fa48("75107"), 'debug.trace'),
  BREAKPOINT: stryMutAct_9fa48("75108") ? "" : (stryCov_9fa48("75108"), 'debug.breakpoint'),
  SNAPSHOT: stryMutAct_9fa48("75109") ? "" : (stryCov_9fa48("75109"), 'debug.snapshot')
}));
const DEBUG_TRACE_LEVEL = Object.freeze(stryMutAct_9fa48("75110") ? {} : (stryCov_9fa48("75110"), {
  ERROR: stryMutAct_9fa48("75111") ? "" : (stryCov_9fa48("75111"), 'error'),
  WARN: stryMutAct_9fa48("75112") ? "" : (stryCov_9fa48("75112"), 'warn'),
  INFO: stryMutAct_9fa48("75113") ? "" : (stryCov_9fa48("75113"), 'info'),
  DEBUG: stryMutAct_9fa48("75114") ? "" : (stryCov_9fa48("75114"), 'debug'),
  TRACE: stryMutAct_9fa48("75115") ? "" : (stryCov_9fa48("75115"), 'trace')
}));
const DEBUG_TRACE_LEVEL_SET = new Set(Object.values(DEBUG_TRACE_LEVEL));
const DEBUG_TRACE_SOURCE = Object.freeze(stryMutAct_9fa48("75116") ? {} : (stryCov_9fa48("75116"), {
  SERVICE: stryMutAct_9fa48("75117") ? "" : (stryCov_9fa48("75117"), 'service'),
  PARTITION_CALLBACK: stryMutAct_9fa48("75118") ? "" : (stryCov_9fa48("75118"), 'partition_callback')
}));
const DEBUG_TRACE_FIELD = Object.freeze(stryMutAct_9fa48("75119") ? {} : (stryCov_9fa48("75119"), {
  LEVEL: stryMutAct_9fa48("75120") ? "" : (stryCov_9fa48("75120"), 'level'),
  MESSAGE: stryMutAct_9fa48("75121") ? "" : (stryCov_9fa48("75121"), 'message'),
  CONTEXT: stryMutAct_9fa48("75122") ? "" : (stryCov_9fa48("75122"), 'context'),
  TIMESTAMP: stryMutAct_9fa48("75123") ? "" : (stryCov_9fa48("75123"), 'timestamp'),
  LINEAGE_ID: stryMutAct_9fa48("75124") ? "" : (stryCov_9fa48("75124"), 'lineageId'),
  STAGE_ID: stryMutAct_9fa48("75125") ? "" : (stryCov_9fa48("75125"), 'stageId'),
  PARTITION_ID: stryMutAct_9fa48("75126") ? "" : (stryCov_9fa48("75126"), 'partitionId'),
  NODE_ID: stryMutAct_9fa48("75127") ? "" : (stryCov_9fa48("75127"), 'nodeId'),
  SERVICE_DEFINITION_ID: stryMutAct_9fa48("75128") ? "" : (stryCov_9fa48("75128"), 'serviceDefinitionId'),
  REPLICA_ID: stryMutAct_9fa48("75129") ? "" : (stryCov_9fa48("75129"), 'replicaId'),
  RUNTIME_KIND: stryMutAct_9fa48("75130") ? "" : (stryCov_9fa48("75130"), 'runtimeKind'),
  SOURCE: stryMutAct_9fa48("75131") ? "" : (stryCov_9fa48("75131"), 'source'),
  SESSION_ID: stryMutAct_9fa48("75132") ? "" : (stryCov_9fa48("75132"), 'sessionId')
}));
const DEBUG_SESSION_STATUS = Object.freeze(stryMutAct_9fa48("75133") ? {} : (stryCov_9fa48("75133"), {
  ACTIVE: stryMutAct_9fa48("75134") ? "" : (stryCov_9fa48("75134"), 'active'),
  DETACHED: stryMutAct_9fa48("75135") ? "" : (stryCov_9fa48("75135"), 'detached')
}));
const DEBUG_DEFAULT = Object.freeze(stryMutAct_9fa48("75136") ? {} : (stryCov_9fa48("75136"), {
  MAX_SESSION_AGE_MS: 300000,
  SUBSCRIBER_ID_PREFIX: stryMutAct_9fa48("75137") ? "" : (stryCov_9fa48("75137"), 'trace-sub')
}));
const DEBUG_ERROR_MSG = Object.freeze(stryMutAct_9fa48("75138") ? {} : (stryCov_9fa48("75138"), {
  TRACE_LEVEL_INVALID_PREFIX: stryMutAct_9fa48("75139") ? "" : (stryCov_9fa48("75139"), 'Invalid debug trace level: '),
  TRACE_MESSAGE_REQUIRED: stryMutAct_9fa48("75140") ? "" : (stryCov_9fa48("75140"), 'Debug trace message is required'),
  TRACE_EVENT_REQUIRED: stryMutAct_9fa48("75141") ? "" : (stryCov_9fa48("75141"), 'Debug trace event is required'),
  TRACE_COLLECTOR_REQUIRED: stryMutAct_9fa48("75142") ? "" : (stryCov_9fa48("75142"), 'TraceCollector requires a valid send target'),
  TRACE_RESOLVER_SCOPE_REQUIRED: stryMutAct_9fa48("75143") ? "" : (stryCov_9fa48("75143"), 'DebugSessionResolver scope is required')
}));
const DEBUG_LOG_MSG = Object.freeze(stryMutAct_9fa48("75144") ? {} : (stryCov_9fa48("75144"), {
  TRACE_SUBSCRIBER_CONNECTED: stryMutAct_9fa48("75145") ? "" : (stryCov_9fa48("75145"), 'Trace subscriber connected'),
  TRACE_SUBSCRIBER_DISCONNECTED: stryMutAct_9fa48("75146") ? "" : (stryCov_9fa48("75146"), 'Trace subscriber disconnected')
}));
export { DEBUG_CAPABILITY, DEBUG_TRACE_LEVEL, DEBUG_TRACE_LEVEL_SET, DEBUG_TRACE_SOURCE, DEBUG_TRACE_FIELD, DEBUG_SESSION_STATUS, DEBUG_DEFAULT, DEBUG_ERROR_MSG, DEBUG_LOG_MSG };