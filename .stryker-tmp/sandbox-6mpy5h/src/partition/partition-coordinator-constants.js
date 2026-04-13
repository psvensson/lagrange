/**
 * Constants for PartitionCoordinator - orchestrator that wires
 * RaftGroup, SQLiteStore, and CDCEmitter together for partition
 * replicas.
 *
 * Requirements: 5.6, 5.7, 5.8, 5.9
 *
 * @module partition/partition-coordinator-constants
 */
// @ts-nocheck


/**
 * PartitionCoordinator lifecycle states.
 */function stryNS_9fa48() {
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
const COORDINATOR_STATE = Object.freeze(stryMutAct_9fa48("100717") ? {} : (stryCov_9fa48("100717"), {
  CREATED: stryMutAct_9fa48("100718") ? "" : (stryCov_9fa48("100718"), 'created'),
  INITIALIZING: stryMutAct_9fa48("100719") ? "" : (stryCov_9fa48("100719"), 'initializing'),
  INITIALIZED: stryMutAct_9fa48("100720") ? "" : (stryCov_9fa48("100720"), 'initialized'),
  SHUTTING_DOWN: stryMutAct_9fa48("100721") ? "" : (stryCov_9fa48("100721"), 'shutting_down'),
  SHUT_DOWN: stryMutAct_9fa48("100722") ? "" : (stryCov_9fa48("100722"), 'shut_down')
}));

/**
 * Error messages for PartitionCoordinator validation and runtime.
 * Static messages are strings; dynamic messages are functions.
 */
const COORDINATOR_ERROR_MSG = Object.freeze(stryMutAct_9fa48("100723") ? {} : (stryCov_9fa48("100723"), {
  MISSING_RAFT_GROUP: stryMutAct_9fa48("100724") ? "" : (stryCov_9fa48("100724"), 'PartitionCoordinator requires raftGroup'),
  MISSING_SQLITE_STORE: stryMutAct_9fa48("100725") ? "" : (stryCov_9fa48("100725"), 'PartitionCoordinator requires sqliteStore'),
  MISSING_CDC_EMITTER: stryMutAct_9fa48("100726") ? "" : (stryCov_9fa48("100726"), 'PartitionCoordinator requires cdcEmitter'),
  MISSING_PARTITION_ID: stryMutAct_9fa48("100727") ? "" : (stryCov_9fa48("100727"), 'PartitionCoordinator requires partitionId'),
  MISSING_TABLE_ID: stryMutAct_9fa48("100728") ? "" : (stryCov_9fa48("100728"), 'PartitionCoordinator requires tableId'),
  NOT_INITIALIZED: stryMutAct_9fa48("100729") ? "" : (stryCov_9fa48("100729"), 'PartitionCoordinator not initialized'),
  ALREADY_INITIALIZED: stryMutAct_9fa48("100730") ? "" : (stryCov_9fa48("100730"), 'PartitionCoordinator already initialized'),
  ALREADY_SHUT_DOWN: stryMutAct_9fa48("100731") ? "" : (stryCov_9fa48("100731"), 'PartitionCoordinator already shut down'),
  initializeFailed: stryMutAct_9fa48("100732") ? () => undefined : (stryCov_9fa48("100732"), component => stryMutAct_9fa48("100733") ? `` : (stryCov_9fa48("100733"), `PartitionCoordinator failed to initialize ${component}`)),
  shutdownFailed: stryMutAct_9fa48("100734") ? () => undefined : (stryCov_9fa48("100734"), component => stryMutAct_9fa48("100735") ? `` : (stryCov_9fa48("100735"), `PartitionCoordinator failed to shut down ${component}`))
}));

/**
 * Log messages emitted by PartitionCoordinator during lifecycle.
 */
const COORDINATOR_LOG_MSG = Object.freeze(stryMutAct_9fa48("100736") ? {} : (stryCov_9fa48("100736"), {
  INITIALIZING: stryMutAct_9fa48("100737") ? "" : (stryCov_9fa48("100737"), 'Initializing PartitionCoordinator'),
  INITIALIZING_SQLITE_STORE: stryMutAct_9fa48("100738") ? "" : (stryCov_9fa48("100738"), 'Initializing SQLiteStore'),
  INITIALIZING_RAFT_GROUP: stryMutAct_9fa48("100739") ? "" : (stryCov_9fa48("100739"), 'Initializing RaftGroup'),
  INITIALIZING_CDC_EMITTER: stryMutAct_9fa48("100740") ? "" : (stryCov_9fa48("100740"), 'Initializing CDCEmitter'),
  INITIALIZED: stryMutAct_9fa48("100741") ? "" : (stryCov_9fa48("100741"), 'PartitionCoordinator initialized'),
  EXECUTING_QUERY: stryMutAct_9fa48("100742") ? "" : (stryCov_9fa48("100742"), 'Executing query via PartitionCoordinator'),
  WRITE_DETECTED: stryMutAct_9fa48("100743") ? "" : (stryCov_9fa48("100743"), 'Write operation detected, emitting CDC event'),
  SHUTDOWN_START: stryMutAct_9fa48("100744") ? "" : (stryCov_9fa48("100744"), 'Shutting down PartitionCoordinator'),
  SHUTTING_DOWN_CDC_EMITTER: stryMutAct_9fa48("100745") ? "" : (stryCov_9fa48("100745"), 'Shutting down CDCEmitter'),
  SHUTTING_DOWN_RAFT_GROUP: stryMutAct_9fa48("100746") ? "" : (stryCov_9fa48("100746"), 'Shutting down RaftGroup'),
  SHUTTING_DOWN_SQLITE_STORE: stryMutAct_9fa48("100747") ? "" : (stryCov_9fa48("100747"), 'Shutting down SQLiteStore'),
  SHUTDOWN_COMPLETE: stryMutAct_9fa48("100748") ? "" : (stryCov_9fa48("100748"), 'PartitionCoordinator shutdown complete'),
  SHUTDOWN_COMPONENT_FAILED: stryMutAct_9fa48("100749") ? "" : (stryCov_9fa48("100749"), 'Component shutdown failed, continuing cleanup')
}));

/**
 * Component names used in log and error messages.
 */
const COORDINATOR_COMPONENT = Object.freeze(stryMutAct_9fa48("100750") ? {} : (stryCov_9fa48("100750"), {
  SQLITE_STORE: stryMutAct_9fa48("100751") ? "" : (stryCov_9fa48("100751"), 'SQLiteStore'),
  RAFT_GROUP: stryMutAct_9fa48("100752") ? "" : (stryCov_9fa48("100752"), 'RaftGroup'),
  CDC_EMITTER: stryMutAct_9fa48("100753") ? "" : (stryCov_9fa48("100753"), 'CDCEmitter')
}));

/**
 * Regex pattern for detecting SELECT (read) queries.
 * Matches the SELECT keyword at the start of a trimmed,
 * uppercased SQL string.
 */
const COORDINATOR_READ_PATTERN = stryMutAct_9fa48("100754") ? /SELECT\b/ : (stryCov_9fa48("100754"), /^SELECT\b/);
export { COORDINATOR_COMPONENT, COORDINATOR_ERROR_MSG, COORDINATOR_LOG_MSG, COORDINATOR_READ_PATTERN, COORDINATOR_STATE };