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
import { CONFIG_KEY } from '../config/config-constants.js';
const INDEX_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("80013") ? {} : (stryCov_9fa48("80013"), {
  INDEX_SERVICE: stryMutAct_9fa48("80014") ? "" : (stryCov_9fa48("80014"), 'index-service'),
  QUERY_OPTIMIZER: stryMutAct_9fa48("80015") ? "" : (stryCov_9fa48("80015"), 'query-optimizer')
}));
const INDEX_LOG_MSG = Object.freeze(stryMutAct_9fa48("80016") ? {} : (stryCov_9fa48("80016"), {
  SERVICE_INITIALIZING: stryMutAct_9fa48("80017") ? "" : (stryCov_9fa48("80017"), 'Initializing index service'),
  SERVICE_INITIALIZED: stryMutAct_9fa48("80018") ? "" : (stryCov_9fa48("80018"), 'Index service initialized'),
  INDICES_LOADED: stryMutAct_9fa48("80019") ? "" : (stryCov_9fa48("80019"), 'Loaded indices from cache'),
  INDICES_LOAD_FAILED: stryMutAct_9fa48("80020") ? "" : (stryCov_9fa48("80020"), 'Failed to load indices from cache'),
  CREATING_INDEX: stryMutAct_9fa48("80021") ? "" : (stryCov_9fa48("80021"), 'Creating index'),
  INDEX_CREATED: stryMutAct_9fa48("80022") ? "" : (stryCov_9fa48("80022"), 'Index created successfully'),
  NO_PARTITIONS_FOR_TABLE: stryMutAct_9fa48("80023") ? "" : (stryCov_9fa48("80023"), 'No partitions found for table'),
  CREATING_SQLITE_INDEX: stryMutAct_9fa48("80024") ? "" : (stryCov_9fa48("80024"), 'Creating SQLite index on partitions'),
  PARTITION_INDEX_FAILED: stryMutAct_9fa48("80025") ? "" : (stryCov_9fa48("80025"), 'Failed to create index on partition'),
  SQLITE_INDEX_COMPLETED: stryMutAct_9fa48("80026") ? "" : (stryCov_9fa48("80026"), 'SQLite index creation completed'),
  DROPPING_INDEX: stryMutAct_9fa48("80027") ? "" : (stryCov_9fa48("80027"), 'Dropping index'),
  INDEX_DROPPED: stryMutAct_9fa48("80028") ? "" : (stryCov_9fa48("80028"), 'Index dropped successfully'),
  INDEX_DROP_FAILED: stryMutAct_9fa48("80029") ? "" : (stryCov_9fa48("80029"), 'Failed to drop index on partition'),
  INDEX_ADDED_FROM_CDC: stryMutAct_9fa48("80030") ? "" : (stryCov_9fa48("80030"), 'Index added to cache via CDC'),
  INDEX_REMOVED_FROM_CDC: stryMutAct_9fa48("80031") ? "" : (stryCov_9fa48("80031"), 'Index removed from cache via CDC'),
  CREATING_INDICES_FOR_PARTITION: stryMutAct_9fa48("80032") ? "" : (stryCov_9fa48("80032"), 'Creating indices on new partition'),
  PARTITION_NOT_FOUND: stryMutAct_9fa48("80033") ? "" : (stryCov_9fa48("80033"), 'Partition not found for index creation'),
  INDEX_CREATED_ON_PARTITION: stryMutAct_9fa48("80034") ? "" : (stryCov_9fa48("80034"), 'Index created on partition'),
  ENSURING_INDICES: stryMutAct_9fa48("80035") ? "" : (stryCov_9fa48("80035"), 'Ensuring indices on partition'),
  REBUILDING_INDEX: stryMutAct_9fa48("80036") ? "" : (stryCov_9fa48("80036"), 'Rebuilding index'),
  INDEX_REBUILD_FAILED: stryMutAct_9fa48("80037") ? "" : (stryCov_9fa48("80037"), 'Failed to rebuild index on partition'),
  SHUTTING_DOWN: stryMutAct_9fa48("80038") ? "" : (stryCov_9fa48("80038"), 'Shutting down index service'),
  EXECUTION_PLAN_GENERATED: stryMutAct_9fa48("80039") ? "" : (stryCov_9fa48("80039"), 'Generated execution plan')
}));
const INDEX_ERROR_MSG = Object.freeze(stryMutAct_9fa48("80040") ? {} : (stryCov_9fa48("80040"), {
  TABLE_ID_REQUIRED: stryMutAct_9fa48("80041") ? "" : (stryCov_9fa48("80041"), 'tableId is required'),
  INDEX_NAME_REQUIRED: stryMutAct_9fa48("80042") ? "" : (stryCov_9fa48("80042"), 'indexName is required'),
  COLUMN_NAMES_REQUIRED: stryMutAct_9fa48("80043") ? "" : (stryCov_9fa48("80043"), 'columnNames is required and must not be empty'),
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("80044") ? "" : (stryCov_9fa48("80044"), 'IndexService requires systemTableCache'),
  INDEX_ALREADY_EXISTS_PREFIX: stryMutAct_9fa48("80045") ? "" : (stryCov_9fa48("80045"), 'Index \''),
  INDEX_ALREADY_EXISTS_MIDDLE: stryMutAct_9fa48("80046") ? "" : (stryCov_9fa48("80046"), '\' already exists on table \''),
  INDEX_ALREADY_EXISTS_SUFFIX: stryMutAct_9fa48("80047") ? "" : (stryCov_9fa48("80047"), '\''),
  INDEX_NOT_FOUND_PREFIX: stryMutAct_9fa48("80048") ? "" : (stryCov_9fa48("80048"), 'Index \''),
  INDEX_NOT_FOUND_MIDDLE: stryMutAct_9fa48("80049") ? "" : (stryCov_9fa48("80049"), '\' not found on table \''),
  INDEX_NOT_FOUND_SUFFIX: stryMutAct_9fa48("80050") ? "" : (stryCov_9fa48("80050"), '\'')
}));
const INDEX_USAGE = Object.freeze(stryMutAct_9fa48("80051") ? {} : (stryCov_9fa48("80051"), {
  WHERE: stryMutAct_9fa48("80052") ? "" : (stryCov_9fa48("80052"), 'where'),
  ORDER_BY: stryMutAct_9fa48("80053") ? "" : (stryCov_9fa48("80053"), 'order_by'),
  JOIN: stryMutAct_9fa48("80054") ? "" : (stryCov_9fa48("80054"), 'join')
}));
const INDEX_COST = Object.freeze(stryMutAct_9fa48("80055") ? {} : (stryCov_9fa48("80055"), {
  FULL_SCAN: stryMutAct_9fa48("80056") ? "" : (stryCov_9fa48("80056"), 'full_scan'),
  INDEX_SCAN: stryMutAct_9fa48("80057") ? "" : (stryCov_9fa48("80057"), 'index_scan')
}));
const INDEX_PRIORITY = Object.freeze(stryMutAct_9fa48("80058") ? {} : (stryCov_9fa48("80058"), {
  HIGH: stryMutAct_9fa48("80059") ? "" : (stryCov_9fa48("80059"), 'high'),
  MEDIUM: stryMutAct_9fa48("80060") ? "" : (stryCov_9fa48("80060"), 'medium')
}));
const INDEX_HINT = Object.freeze(stryMutAct_9fa48("80061") ? {} : (stryCov_9fa48("80061"), {
  WHERE_PREFIX: stryMutAct_9fa48("80062") ? "" : (stryCov_9fa48("80062"), 'Consider creating an index on WHERE columns: '),
  WHERE_GENERIC_PREFIX: stryMutAct_9fa48("80063") ? "" : (stryCov_9fa48("80063"), 'Consider creating an index on columns: '),
  ORDER_BY_PREFIX: stryMutAct_9fa48("80064") ? "" : (stryCov_9fa48("80064"), 'Consider creating an index on ORDER BY columns: '),
  JOIN_PREFIX: stryMutAct_9fa48("80065") ? "" : (stryCov_9fa48("80065"), 'Consider creating an index on JOIN columns: ')
}));
const INDEX_TYPE = Object.freeze(stryMutAct_9fa48("80066") ? {} : (stryCov_9fa48("80066"), {
  BTREE: stryMutAct_9fa48("80067") ? "" : (stryCov_9fa48("80067"), 'btree'),
  HASH: stryMutAct_9fa48("80068") ? "" : (stryCov_9fa48("80068"), 'hash')
}));
const INDEX_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("80069") ? {} : (stryCov_9fa48("80069"), {
  DEFAULT_TYPE: CONFIG_KEY.INDEX_DEFAULT_TYPE
}));
const INDEX_DEFAULTS = Object.freeze(stryMutAct_9fa48("80070") ? {} : (stryCov_9fa48("80070"), {
  DEFAULT_TYPE: INDEX_TYPE.BTREE
}));
export { INDEX_CONFIG_KEY, INDEX_COST, INDEX_DEFAULTS, INDEX_ERROR_MSG, INDEX_HINT, INDEX_LOG_MSG, INDEX_PRIORITY, INDEX_SUBSYSTEM, INDEX_TYPE, INDEX_USAGE };