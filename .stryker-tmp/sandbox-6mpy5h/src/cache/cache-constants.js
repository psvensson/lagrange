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
import { CDC_OPERATION, NUM, TIME_MS } from '../constants/index.js';
import { SYSTEM_CACHE_KEY_DESCRIPTOR } from './system-cache-key-descriptor.js';
import { CDC_NON_PROPAGATED_TABLES, CDC_PROPAGATED_TABLES } from './cdc-table-policy.js';
const CACHE_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("33704") ? {} : (stryCov_9fa48("33704"), {
  CACHE: stryMutAct_9fa48("33705") ? "" : (stryCov_9fa48("33705"), 'cache'),
  HYDRATION: stryMutAct_9fa48("33706") ? "" : (stryCov_9fa48("33706"), 'cache-hydration')
}));
const CACHE_LOG_MSG = Object.freeze(stryMutAct_9fa48("33707") ? {} : (stryCov_9fa48("33707"), {
  INSERT_ON_EXISTING_KEY_TREAT_UPDATE: stryMutAct_9fa48("33708") ? "" : (stryCov_9fa48("33708"), 'INSERT on existing key, treating as UPDATE'),
  UPDATE_ON_MISSING_KEY_TREAT_INSERT: stryMutAct_9fa48("33709") ? "" : (stryCov_9fa48("33709"), 'UPDATE on non-existing key, treating as INSERT'),
  DELETE_ON_MISSING_KEY_IGNORED: stryMutAct_9fa48("33710") ? "" : (stryCov_9fa48("33710"), 'DELETE on non-existing key, ignoring'),
  STALE_EVENT_IGNORED: stryMutAct_9fa48("33711") ? "" : (stryCov_9fa48("33711"), 'Ignoring stale CDC event for existing key'),
  REJECTED_STALE_EPOCH: stryMutAct_9fa48("33712") ? "" : (stryCov_9fa48("33712"), 'Rejected stale epoch update'),
  UPDATED_EPOCH: stryMutAct_9fa48("33713") ? "" : (stryCov_9fa48("33713"), 'Updated cache epoch'),
  CACHE_LISTENER_ERROR: stryMutAct_9fa48("33714") ? "" : (stryCov_9fa48("33714"), 'Cache listener error'),
  APPLIED_CDC_EVENT: stryMutAct_9fa48("33715") ? "" : (stryCov_9fa48("33715"), 'Applied CDC event to cache'),
  CACHE_CLEARED: stryMutAct_9fa48("33716") ? "" : (stryCov_9fa48("33716"), 'Cache cleared'),
  READ_ONLY_WRITE_ATTEMPT: stryMutAct_9fa48("33717") ? "" : (stryCov_9fa48("33717"), 'Attempted to write to read-only cache'),
  GET_READY_NODES_DEBUG: stryMutAct_9fa48("33718") ? "" : (stryCov_9fa48("33718"), 'getReadyNodes debug info')
}));
const CACHE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("33719") ? {} : (stryCov_9fa48("33719"), {
  EPOCH_INVALID_OBJECT: stryMutAct_9fa48("33720") ? "" : (stryCov_9fa48("33720"), 'Epoch must be a valid object'),
  EPOCH_MISSING_NUMBER: stryMutAct_9fa48("33721") ? "" : (stryCov_9fa48("33721"), 'Epoch must have a numeric epoch field'),
  EPOCH_MISSING_ASSIGNMENTS: stryMutAct_9fa48("33722") ? "" : (stryCov_9fa48("33722"), 'Epoch must have an assignments object'),
  LISTENER_REQUIRED: stryMutAct_9fa48("33723") ? "" : (stryCov_9fa48("33723"), 'Listener must be a function'),
  primaryKeyMissing: stryMutAct_9fa48("33724") ? () => undefined : (stryCov_9fa48("33724"), pkField => stryMutAct_9fa48("33725") ? `` : (stryCov_9fa48("33725"), `CDC data must include primary key field "${pkField}" or "id"`)),
  invalidTableName: stryMutAct_9fa48("33726") ? () => undefined : (stryCov_9fa48("33726"), (tableName, tables) => stryMutAct_9fa48("33727") ? `` : (stryCov_9fa48("33727"), `Invalid system table name: ${tableName}. Valid tables are: ${tables.join(stryMutAct_9fa48("33728") ? "" : (stryCov_9fa48("33728"), ', '))}`)),
  invalidCdcOperation: stryMutAct_9fa48("33729") ? () => undefined : (stryCov_9fa48("33729"), (operation, operations) => stryMutAct_9fa48("33730") ? `` : (stryCov_9fa48("33730"), `Invalid CDC operation: ${operation}. Valid operations are: ${operations.join(stryMutAct_9fa48("33731") ? "" : (stryCov_9fa48("33731"), ', '))}`)),
  READ_ONLY_CACHE_REQUIRED: stryMutAct_9fa48("33732") ? "" : (stryCov_9fa48("33732"), 'ReadOnlySystemTableCache requires an underlying cache'),
  READ_ONLY_HINT: stryMutAct_9fa48("33733") ? "" : (stryCov_9fa48("33733"), 'Use CDCIntegrationService for writes'),
  readOnlyMethodBlocked: stryMutAct_9fa48("33734") ? () => undefined : (stryCov_9fa48("33734"), prop => (stryMutAct_9fa48("33735") ? `` : (stryCov_9fa48("33735"), `Cache write violation: "${prop}" is not available on read-only cache. `)) + (stryMutAct_9fa48("33736") ? "" : (stryCov_9fa48("33736"), 'Use CDCIntegrationService for writes.'))),
  READ_ONLY_DIRECT_ACCESS: (stryMutAct_9fa48("33737") ? "" : (stryCov_9fa48("33737"), 'Cache write violation: Direct cache access is not allowed. ')) + (stryMutAct_9fa48("33738") ? "" : (stryCov_9fa48("33738"), 'Use CDCIntegrationService for writes.')),
  NODE_ID_MISSING: stryMutAct_9fa48("33739") ? "" : (stryCov_9fa48("33739"), 'Nodes cache entries must include node_id')
}));
const CACHE_DEFAULT = Object.freeze(stryMutAct_9fa48("33740") ? {} : (stryCov_9fa48("33740"), {
  INITIAL_EPOCH: NUM.ZERO,
  PRIMARY_KEY_FALLBACK: stryMutAct_9fa48("33741") ? "" : (stryCov_9fa48("33741"), 'id'),
  CACHE_ID_PREFIX: stryMutAct_9fa48("33742") ? "" : (stryCov_9fa48("33742"), 'cache-'),
  CACHE_ID_RADIX: 36,
  CACHE_ID_START: 2,
  CACHE_ID_LENGTH: 9
}));

// ---------------------------------------------------------------------------
// CDC-Propagated vs Non-Propagated Table Classification
// ---------------------------------------------------------------------------
//
// A system table is CDC-propagated when every node in the cluster must hold
// an up-to-date copy of its rows in the local SystemTableCache so that
// routing, placement, rebalancing, and topology decisions can be made
// without cross-node queries.
//
// Classification rules (a table MUST be propagated when ANY rule applies):
//
//   1. MEMBERSHIP — the table describes which nodes, partitions, message
//      groups, or replicated services exist and where they live.
//   2. ROUTING — the table is consulted during query routing, leader
//      discovery, or endpoint resolution.
//   3. PLACEMENT — the table is read by the rebalancer, move planner,
//      or admission service to decide replica placement.
//   4. CLUSTER CONFIG — the table carries cluster-wide configuration
//      (epoch, budgets, feature flags) that every node must observe.
//   5. TOPOLOGY — the table defines network topology, latency groups,
//      or inter-group measurements used for CDC fanout or routing.
//
// A table MUST NOT be propagated when ALL of the following hold:
//
//   a. It is high-cardinality or high-write-rate (e.g. logs, operations).
//   b. It is scoped to a specific service, session, or execution context
//      rather than cluster-wide topology.
//   c. It can be queried on demand from its owning partition without
//      affecting routing, placement, or cluster-health decisions.
//
// Any new system table MUST be classified in src/cache/cdc-table-policy.js.
// Tables without internal propagation stay out of cache hydration snapshots
// and steady-state cache CDC fanout.
// ---------------------------------------------------------------------------

/**
 * Complete list of all system tables (propagated + non-propagated).
 * Used by SystemTableCache for schema validation and by bootstrap for
 * partition creation. Every system table MUST appear in exactly one of
 * CDC_PROPAGATED_TABLES or CDC_NON_PROPAGATED_TABLES.
 */
const CACHE_SYSTEM_TABLES = Object.freeze(stryMutAct_9fa48("33743") ? [] : (stryCov_9fa48("33743"), [...CDC_PROPAGATED_TABLES, ...CDC_NON_PROPAGATED_TABLES]));
const CACHE_PRIMARY_KEY_FIELDS = SYSTEM_CACHE_KEY_DESCRIPTOR;
const CACHE_CDC_OPERATIONS = CDC_OPERATION;

/**
 * Tables included in cache hydration snapshots and CDC subscriptions.
 * This is the CDC-propagated set: every node receives and caches these.
 */
const CACHE_HYDRATION_TABLES = CDC_PROPAGATED_TABLES;
const CACHE_HYDRATION_LOG_MSG = Object.freeze(stryMutAct_9fa48("33744") ? {} : (stryCov_9fa48("33744"), {
  STARTING: stryMutAct_9fa48("33745") ? "" : (stryCov_9fa48("33745"), 'Starting cache hydration'),
  TABLE_HYDRATED: stryMutAct_9fa48("33746") ? "" : (stryCov_9fa48("33746"), 'Hydrated system table cache'),
  TABLE_FAILED: stryMutAct_9fa48("33747") ? "" : (stryCov_9fa48("33747"), 'Failed to hydrate system table'),
  COMPLETE: stryMutAct_9fa48("33748") ? "" : (stryCov_9fa48("33748"), 'Cache hydration complete'),
  LOGGER_INIT_UNAVAILABLE: stryMutAct_9fa48("33749") ? "" : (stryCov_9fa48("33749"), 'Cache hydration logger initialization unavailable'),
  METRICS_LOG_UNAVAILABLE: stryMutAct_9fa48("33750") ? "" : (stryCov_9fa48("33750"), 'Cache hydration metrics log unavailable')
}));
const CACHE_HYDRATION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("33751") ? {} : (stryCov_9fa48("33751"), {
  MISSING_CDC_EVENT_APPLIER: stryMutAct_9fa48("33752") ? "" : (stryCov_9fa48("33752"), 'CacheHydrationService requires explicit cdcEventApplier'),
  queryFailed: stryMutAct_9fa48("33753") ? () => undefined : (stryCov_9fa48("33753"), tableName => stryMutAct_9fa48("33754") ? `` : (stryCov_9fa48("33754"), `Failed to query ${tableName}`))
}));
const CACHE_HYDRATION_DEFAULT_OPTIONS = Object.freeze({});
const CACHE_HYDRATION_NOW = stryMutAct_9fa48("33755") ? () => undefined : (stryCov_9fa48("33755"), (() => {
  const CACHE_HYDRATION_NOW = () => Date.now();
  return CACHE_HYDRATION_NOW;
})());
const CACHE_HYDRATION_METRICS = Object.freeze(stryMutAct_9fa48("33756") ? {} : (stryCov_9fa48("33756"), {
  MS_PER_SECOND: TIME_MS.SECOND,
  ZERO_ROWS_PER_SECOND: NUM.ZERO
}));
const CACHE_HYDRATION_SQL = Object.freeze(stryMutAct_9fa48("33757") ? {} : (stryCov_9fa48("33757"), {
  selectAll: stryMutAct_9fa48("33758") ? () => undefined : (stryCov_9fa48("33758"), tableName => stryMutAct_9fa48("33759") ? `` : (stryCov_9fa48("33759"), `SELECT * FROM ${tableName}`))
}));
const CACHE_READ_ONLY = Object.freeze(stryMutAct_9fa48("33760") ? {} : (stryCov_9fa48("33760"), {
  BLOCKED_METHODS: stryMutAct_9fa48("33761") ? [] : (stryCov_9fa48("33761"), [stryMutAct_9fa48("33762") ? "" : (stryCov_9fa48("33762"), 'applySystemTableChange'), stryMutAct_9fa48("33763") ? "" : (stryCov_9fa48("33763"), 'clear'), stryMutAct_9fa48("33764") ? "" : (stryCov_9fa48("33764"), 'insert'), stryMutAct_9fa48("33765") ? "" : (stryCov_9fa48("33765"), 'update'), stryMutAct_9fa48("33766") ? "" : (stryCov_9fa48("33766"), 'delete')]),
  BLOCKED_PROPERTIES: stryMutAct_9fa48("33767") ? [] : (stryCov_9fa48("33767"), [stryMutAct_9fa48("33768") ? "" : (stryCov_9fa48("33768"), '_cache'), stryMutAct_9fa48("33769") ? "" : (stryCov_9fa48("33769"), 'tables')]),
  DIRECT_ACCESS: stryMutAct_9fa48("33770") ? "" : (stryCov_9fa48("33770"), 'direct_access')
}));
export { CACHE_CDC_OPERATIONS, CACHE_DEFAULT, CACHE_ERROR_MSG, CACHE_HYDRATION_ERROR_MSG, CACHE_HYDRATION_DEFAULT_OPTIONS, CACHE_HYDRATION_LOG_MSG, CACHE_HYDRATION_METRICS, CACHE_HYDRATION_NOW, CACHE_HYDRATION_SQL, CACHE_HYDRATION_TABLES, CACHE_LOG_MSG, CACHE_PRIMARY_KEY_FIELDS, CACHE_READ_ONLY, CACHE_SUBSYSTEM, CACHE_SYSTEM_TABLES, CDC_NON_PROPAGATED_TABLES, CDC_PROPAGATED_TABLES };