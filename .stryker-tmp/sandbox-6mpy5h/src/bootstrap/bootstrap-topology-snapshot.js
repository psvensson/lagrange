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
import { assertCritical } from '../utils/assert.js';
import { CACHE_HYDRATION_TABLES } from '../cache/cache-constants.js';
import { NUM, TABLES, TYPEOF } from '../constants/index.js';
import { normalizeNodeRow } from '../control-plane/system-row-normalizers.js';
const DEFAULT_TOPOLOGY_EPOCH = NUM.ZERO;
function resolvePublishedTopologyEpoch(systemTableCache, currentEpoch) {
  if (stryMutAct_9fa48("13429")) {
    {}
  } else {
    stryCov_9fa48("13429");
    if (stryMutAct_9fa48("13431") ? false : stryMutAct_9fa48("13430") ? true : (stryCov_9fa48("13430", "13431"), Number.isFinite(stryMutAct_9fa48("13432") ? currentEpoch.epoch : (stryCov_9fa48("13432"), currentEpoch?.epoch)))) {
      if (stryMutAct_9fa48("13433")) {
        {}
      } else {
        stryCov_9fa48("13433");
        return stryMutAct_9fa48("13434") ? Math.min(NUM.ZERO, Math.floor(currentEpoch.epoch)) : (stryCov_9fa48("13434"), Math.max(NUM.ZERO, Math.floor(currentEpoch.epoch)));
      }
    }
    if (stryMutAct_9fa48("13437") ? typeof systemTableCache?.getEpoch !== TYPEOF.FUNCTION : stryMutAct_9fa48("13436") ? false : stryMutAct_9fa48("13435") ? true : (stryCov_9fa48("13435", "13436", "13437"), typeof (stryMutAct_9fa48("13438") ? systemTableCache.getEpoch : (stryCov_9fa48("13438"), systemTableCache?.getEpoch)) === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("13439")) {
        {}
      } else {
        stryCov_9fa48("13439");
        const cacheEpoch = systemTableCache.getEpoch();
        if (stryMutAct_9fa48("13441") ? false : stryMutAct_9fa48("13440") ? true : (stryCov_9fa48("13440", "13441"), Number.isFinite(cacheEpoch))) {
          if (stryMutAct_9fa48("13442")) {
            {}
          } else {
            stryCov_9fa48("13442");
            return stryMutAct_9fa48("13443") ? Math.min(NUM.ZERO, Math.floor(cacheEpoch)) : (stryCov_9fa48("13443"), Math.max(NUM.ZERO, Math.floor(cacheEpoch)));
          }
        }
      }
    }
    return DEFAULT_TOPOLOGY_EPOCH;
  }
}
function resolveActiveNodeIds(nodeRows) {
  if (stryMutAct_9fa48("13444")) {
    {}
  } else {
    stryCov_9fa48("13444");
    const activeNodeIds = new Set();
    const rows = Array.isArray(nodeRows) ? nodeRows : stryMutAct_9fa48("13445") ? ["Stryker was here"] : (stryCov_9fa48("13445"), []);
    for (const row of rows) {
      if (stryMutAct_9fa48("13446")) {
        {}
      } else {
        stryCov_9fa48("13446");
        const normalizedRow = normalizeNodeRow(row);
        const {
          nodeId,
          status
        } = normalizedRow;
        if (stryMutAct_9fa48("13449") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("13448") ? false : stryMutAct_9fa48("13447") ? true : (stryCov_9fa48("13447", "13448", "13449"), nodeId.length === NUM.ZERO)) {
          if (stryMutAct_9fa48("13450")) {
            {}
          } else {
            stryCov_9fa48("13450");
            continue;
          }
        }
        if (stryMutAct_9fa48("13453") ? status !== 'active' : stryMutAct_9fa48("13452") ? false : stryMutAct_9fa48("13451") ? true : (stryCov_9fa48("13451", "13452", "13453"), status === (stryMutAct_9fa48("13454") ? "" : (stryCov_9fa48("13454"), 'active')))) {
          if (stryMutAct_9fa48("13455")) {
            {}
          } else {
            stryCov_9fa48("13455");
            activeNodeIds.add(nodeId);
          }
        }
      }
    }
    return stryMutAct_9fa48("13456") ? [...activeNodeIds] : (stryCov_9fa48("13456"), (stryMutAct_9fa48("13457") ? [] : (stryCov_9fa48("13457"), [...activeNodeIds])).sort());
  }
}
function buildBootstrapTopologySnapshotEnvelope(options = {}) {
  if (stryMutAct_9fa48("13458")) {
    {}
  } else {
    stryCov_9fa48("13458");
    const systemTableCache = assertCritical(options.systemTableCache, stryMutAct_9fa48("13459") ? "" : (stryCov_9fa48("13459"), 'bootstrap topology snapshot requires systemTableCache'));
    if (stryMutAct_9fa48("13462") ? typeof systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("13461") ? false : stryMutAct_9fa48("13460") ? true : (stryCov_9fa48("13460", "13461", "13462"), typeof systemTableCache.getAll !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("13463")) {
        {}
      } else {
        stryCov_9fa48("13463");
        throw new Error(stryMutAct_9fa48("13464") ? "" : (stryCov_9fa48("13464"), 'bootstrap topology snapshot requires systemTableCache.getAll'));
      }
    }
    const hydrationTables = Array.isArray(options.hydrationTables) ? stryMutAct_9fa48("13465") ? [] : (stryCov_9fa48("13465"), [...options.hydrationTables]) : stryMutAct_9fa48("13466") ? [] : (stryCov_9fa48("13466"), [...CACHE_HYDRATION_TABLES]);
    const resolveSnapshotRows = (stryMutAct_9fa48("13469") ? typeof options.resolveSnapshotRows !== TYPEOF.FUNCTION : stryMutAct_9fa48("13468") ? false : stryMutAct_9fa48("13467") ? true : (stryCov_9fa48("13467", "13468", "13469"), typeof options.resolveSnapshotRows === TYPEOF.FUNCTION)) ? options.resolveSnapshotRows : stryMutAct_9fa48("13470") ? () => undefined : (stryCov_9fa48("13470"), (_tableName, cacheRows) => cacheRows);
    const publishedAt = (stryMutAct_9fa48("13473") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("13472") ? false : stryMutAct_9fa48("13471") ? true : (stryCov_9fa48("13471", "13472", "13473"), typeof options.now === TYPEOF.FUNCTION)) ? options.now() : Date.now();
    const systemTableSnapshots = {};
    const tableRowCounts = {};
    for (const tableName of hydrationTables) {
      if (stryMutAct_9fa48("13474")) {
        {}
      } else {
        stryCov_9fa48("13474");
        const cacheRows = stryMutAct_9fa48("13477") ? systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("13476") ? false : stryMutAct_9fa48("13475") ? true : (stryCov_9fa48("13475", "13476", "13477"), systemTableCache.getAll(tableName) || (stryMutAct_9fa48("13478") ? ["Stryker was here"] : (stryCov_9fa48("13478"), [])));
        const snapshotRows = resolveSnapshotRows(tableName, cacheRows);
        const normalizedRows = Array.isArray(snapshotRows) ? snapshotRows : stryMutAct_9fa48("13479") ? ["Stryker was here"] : (stryCov_9fa48("13479"), []);
        systemTableSnapshots[tableName] = normalizedRows;
        tableRowCounts[tableName] = normalizedRows.length;
      }
    }
    return stryMutAct_9fa48("13480") ? {} : (stryCov_9fa48("13480"), {
      systemTableSnapshots,
      topologySnapshotMeta: stryMutAct_9fa48("13481") ? {} : (stryCov_9fa48("13481"), {
        publishedAt,
        topologyEpoch: resolvePublishedTopologyEpoch(systemTableCache, options.currentEpoch),
        activeNodeIds: resolveActiveNodeIds(systemTableSnapshots[TABLES.NODES]),
        hydrationTables,
        tableRowCounts
      })
    });
  }
}
export { buildBootstrapTopologySnapshotEnvelope };