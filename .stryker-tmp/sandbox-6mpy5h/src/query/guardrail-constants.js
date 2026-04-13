/**
 * Constants for budget enforcement, lineage tracking,
 * dedupe registry, and cancellation tokens.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 * @module query/guardrail-constants
 */
// @ts-nocheck


/**
 * Field names used in guardrail tracking objects.
 * @enum {string}
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
const GUARDRAIL_FIELD = Object.freeze(stryMutAct_9fa48("113138") ? {} : (stryCov_9fa48("113138"), {
  CPU_TIME_MS: stryMutAct_9fa48("113139") ? "" : (stryCov_9fa48("113139"), 'cpuTimeMs'),
  MEMORY_BYTES: stryMutAct_9fa48("113140") ? "" : (stryCov_9fa48("113140"), 'memoryBytes'),
  WALL_START: stryMutAct_9fa48("113141") ? "" : (stryCov_9fa48("113141"), 'wallStart'),
  LOOKUP_KEYS: stryMutAct_9fa48("113142") ? "" : (stryCov_9fa48("113142"), 'lookupKeys'),
  LOOKUP_BYTES: stryMutAct_9fa48("113143") ? "" : (stryCov_9fa48("113143"), 'lookupBytes'),
  EMIT_BYTES: stryMutAct_9fa48("113144") ? "" : (stryCov_9fa48("113144"), 'emitBytes'),
  BROADCAST_BYTES: stryMutAct_9fa48("113145") ? "" : (stryCov_9fa48("113145"), 'broadcastBytes'),
  OUT_BYTES: stryMutAct_9fa48("113146") ? "" : (stryCov_9fa48("113146"), 'outBytes'),
  LINEAGE_ID: stryMutAct_9fa48("113147") ? "" : (stryCov_9fa48("113147"), 'lineageId'),
  QUERY_ID: stryMutAct_9fa48("113148") ? "" : (stryCov_9fa48("113148"), 'queryId'),
  STAGE_INDEX: stryMutAct_9fa48("113149") ? "" : (stryCov_9fa48("113149"), 'stageIndex'),
  PRIMITIVE_TYPE: stryMutAct_9fa48("113150") ? "" : (stryCov_9fa48("113150"), 'primitiveType'),
  SEQUENCE_NUM: stryMutAct_9fa48("113151") ? "" : (stryCov_9fa48("113151"), 'sequenceNum')
}));

/**
 * Error messages for guardrail violations.
 * @enum {string}
 */
const GUARDRAIL_ERROR_MSG = Object.freeze(stryMutAct_9fa48("113152") ? {} : (stryCov_9fa48("113152"), {
  CPU_TIME_EXCEEDED: stryMutAct_9fa48("113153") ? "" : (stryCov_9fa48("113153"), 'CPU time budget exceeded'),
  MEMORY_EXCEEDED: stryMutAct_9fa48("113154") ? "" : (stryCov_9fa48("113154"), 'Memory budget exceeded'),
  WALL_TIME_EXCEEDED: stryMutAct_9fa48("113155") ? "" : (stryCov_9fa48("113155"), 'Wall time budget exceeded'),
  LOOKUP_KEYS_EXCEEDED: stryMutAct_9fa48("113156") ? "" : (stryCov_9fa48("113156"), 'Lookup key count budget exceeded'),
  LOOKUP_BYTES_EXCEEDED: stryMutAct_9fa48("113157") ? "" : (stryCov_9fa48("113157"), 'Lookup byte budget exceeded'),
  EMIT_BYTES_EXCEEDED: stryMutAct_9fa48("113158") ? "" : (stryCov_9fa48("113158"), 'Emit byte budget exceeded'),
  BROADCAST_BYTES_EXCEEDED: stryMutAct_9fa48("113159") ? "" : (stryCov_9fa48("113159"), 'Broadcast byte budget exceeded'),
  OUT_BYTES_EXCEEDED: stryMutAct_9fa48("113160") ? "" : (stryCov_9fa48("113160"), 'Output byte budget exceeded'),
  NESTED_CALLS_EXCEEDED: stryMutAct_9fa48("113161") ? "" : (stryCov_9fa48("113161"), 'Nested call count budget exceeded'),
  NESTED_KEYS_EXCEEDED: stryMutAct_9fa48("113162") ? "" : (stryCov_9fa48("113162"), 'Nested key count budget exceeded'),
  NESTED_BYTES_EXCEEDED: stryMutAct_9fa48("113163") ? "" : (stryCov_9fa48("113163"), 'Nested byte budget exceeded'),
  INFLIGHT_EXCEEDED: stryMutAct_9fa48("113164") ? "" : (stryCov_9fa48("113164"), 'Max inflight operations exceeded'),
  EMIT_BACKPRESSURE: stryMutAct_9fa48("113165") ? "" : (stryCov_9fa48("113165"), 'Emit backpressure limit reached'),
  OPERATION_TERMINATED: stryMutAct_9fa48("113166") ? "" : (stryCov_9fa48("113166"), 'Operation terminated due to budget violation'),
  CANCELLED: stryMutAct_9fa48("113167") ? "" : (stryCov_9fa48("113167"), 'Operation was cancelled'),
  TIMEOUT_EXCEEDED: stryMutAct_9fa48("113168") ? "" : (stryCov_9fa48("113168"), 'Operation timed out'),
  ALREADY_CANCELLED: stryMutAct_9fa48("113169") ? "" : (stryCov_9fa48("113169"), 'Token is already cancelled')
}));

/**
 * Log messages for guardrail operations.
 * @enum {string}
 */
const GUARDRAIL_LOG_MSG = Object.freeze(stryMutAct_9fa48("113170") ? {} : (stryCov_9fa48("113170"), {
  BUDGET_CHECK: stryMutAct_9fa48("113171") ? "" : (stryCov_9fa48("113171"), 'Budget limit checked'),
  BUDGET_EXCEEDED: stryMutAct_9fa48("113172") ? "" : (stryCov_9fa48("113172"), 'Budget limit exceeded'),
  LINEAGE_ATTACHED: stryMutAct_9fa48("113173") ? "" : (stryCov_9fa48("113173"), 'Lineage ID attached to artifact'),
  DEDUPE_HIT: stryMutAct_9fa48("113174") ? "" : (stryCov_9fa48("113174"), 'Duplicate operation detected by lineage'),
  CANCELLATION_TRIGGERED: stryMutAct_9fa48("113175") ? "" : (stryCov_9fa48("113175"), 'Cancellation triggered')
}));

/**
 * Separator for lineage ID components.
 * @type {string}
 */
const LINEAGE_SEPARATOR = stryMutAct_9fa48("113176") ? "" : (stryCov_9fa48("113176"), ':');

/**
 * Field names for dedupe registry result entries.
 * @enum {string}
 */
const DEDUPE_RESULT_FIELD = Object.freeze(stryMutAct_9fa48("113177") ? {} : (stryCov_9fa48("113177"), {
  LINEAGE_ID: stryMutAct_9fa48("113178") ? "" : (stryCov_9fa48("113178"), 'lineageId'),
  STAGE_ID: stryMutAct_9fa48("113179") ? "" : (stryCov_9fa48("113179"), 'stageId'),
  RESULT: stryMutAct_9fa48("113180") ? "" : (stryCov_9fa48("113180"), 'result'),
  TIMESTAMP: stryMutAct_9fa48("113181") ? "" : (stryCov_9fa48("113181"), 'timestamp')
}));

/**
 * Separator for composite dedupe keys (lineageId + stageId).
 * @type {string}
 */
const DEDUPE_KEY_SEPARATOR = stryMutAct_9fa48("113182") ? "" : (stryCov_9fa48("113182"), '|');
export { GUARDRAIL_FIELD, GUARDRAIL_ERROR_MSG, GUARDRAIL_LOG_MSG, LINEAGE_SEPARATOR, DEDUPE_RESULT_FIELD, DEDUPE_KEY_SEPARATOR };