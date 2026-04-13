/**
 * SystemCacheClient - Unified read-only cache client abstraction.
 *
 * Provides factory helpers for two read backings:
 * - direct cache reads (ReadOnlySystemTableCache-compatible)
 * - proxy cache reads (SystemCacheProxy-compatible)
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
import { TYPEOF } from '../constants/index.js';
const SYSTEM_CACHE_CLIENT_MODE = Object.freeze(stryMutAct_9fa48("34571") ? {} : (stryCov_9fa48("34571"), {
  DIRECT: stryMutAct_9fa48("34572") ? "" : (stryCov_9fa48("34572"), 'direct'),
  PROXY: stryMutAct_9fa48("34573") ? "" : (stryCov_9fa48("34573"), 'proxy')
}));
const SYSTEM_CACHE_CLIENT_ERROR_MSG = Object.freeze(stryMutAct_9fa48("34574") ? {} : (stryCov_9fa48("34574"), {
  CACHE_REQUIRED: stryMutAct_9fa48("34575") ? "" : (stryCov_9fa48("34575"), 'System cache backing is required'),
  INVALID_LISTENER: stryMutAct_9fa48("34576") ? "" : (stryCov_9fa48("34576"), 'Cache change listener must be a function'),
  UNSUPPORTED_MODE: stryMutAct_9fa48("34577") ? () => undefined : (stryCov_9fa48("34577"), mode => stryMutAct_9fa48("34578") ? `` : (stryCov_9fa48("34578"), `Unsupported system cache client mode: ${mode}`))
}));
function assertCacheBacking(backing) {
  if (stryMutAct_9fa48("34579")) {
    {}
  } else {
    stryCov_9fa48("34579");
    if (stryMutAct_9fa48("34582") ? false : stryMutAct_9fa48("34581") ? true : stryMutAct_9fa48("34580") ? backing : (stryCov_9fa48("34580", "34581", "34582"), !backing)) {
      if (stryMutAct_9fa48("34583")) {
        {}
      } else {
        stryCov_9fa48("34583");
        throw new Error(SYSTEM_CACHE_CLIENT_ERROR_MSG.CACHE_REQUIRED);
      }
    }
  }
}
function createDirectSystemCacheClient(readOnlyCache) {
  if (stryMutAct_9fa48("34584")) {
    {}
  } else {
    stryCov_9fa48("34584");
    assertCacheBacking(readOnlyCache);
    return stryMutAct_9fa48("34585") ? {} : (stryCov_9fa48("34585"), {
      get: stryMutAct_9fa48("34586") ? () => undefined : (stryCov_9fa48("34586"), (tableName, key) => readOnlyCache.get(tableName, key)),
      find: stryMutAct_9fa48("34587") ? () => undefined : (stryCov_9fa48("34587"), (tableName, predicate) => readOnlyCache.find(tableName, predicate)),
      filter: stryMutAct_9fa48("34588") ? () => undefined : (stryCov_9fa48("34588"), (tableName, predicate) => stryMutAct_9fa48("34589") ? readOnlyCache : (stryCov_9fa48("34589"), readOnlyCache.filter(tableName, predicate))),
      getAll: stryMutAct_9fa48("34590") ? () => undefined : (stryCov_9fa48("34590"), tableName => readOnlyCache.getAll(tableName)),
      has: stryMutAct_9fa48("34591") ? () => undefined : (stryCov_9fa48("34591"), (tableName, key) => readOnlyCache.has(tableName, key)),
      count: stryMutAct_9fa48("34592") ? () => undefined : (stryCov_9fa48("34592"), tableName => readOnlyCache.count(tableName)),
      getTableNames: stryMutAct_9fa48("34593") ? () => undefined : (stryCov_9fa48("34593"), () => readOnlyCache.getTableNames()),
      onCacheChange: listener => {
        if (stryMutAct_9fa48("34594")) {
          {}
        } else {
          stryCov_9fa48("34594");
          if (stryMutAct_9fa48("34597") ? typeof listener === TYPEOF.FUNCTION : stryMutAct_9fa48("34596") ? false : stryMutAct_9fa48("34595") ? true : (stryCov_9fa48("34595", "34596", "34597"), typeof listener !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("34598")) {
              {}
            } else {
              stryCov_9fa48("34598");
              throw new Error(SYSTEM_CACHE_CLIENT_ERROR_MSG.INVALID_LISTENER);
            }
          }
          return readOnlyCache.onCacheChange(listener);
        }
      },
      offCacheChange: listener => {
        if (stryMutAct_9fa48("34599")) {
          {}
        } else {
          stryCov_9fa48("34599");
          if (stryMutAct_9fa48("34602") ? typeof listener === TYPEOF.FUNCTION : stryMutAct_9fa48("34601") ? false : stryMutAct_9fa48("34600") ? true : (stryCov_9fa48("34600", "34601", "34602"), typeof listener !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("34603")) {
              {}
            } else {
              stryCov_9fa48("34603");
              throw new Error(SYSTEM_CACHE_CLIENT_ERROR_MSG.INVALID_LISTENER);
            }
          }
          return readOnlyCache.offCacheChange(listener);
        }
      }
    });
  }
}
function createProxySystemCacheClient(systemCacheProxy) {
  if (stryMutAct_9fa48("34604")) {
    {}
  } else {
    stryCov_9fa48("34604");
    assertCacheBacking(systemCacheProxy);
    return stryMutAct_9fa48("34605") ? {} : (stryCov_9fa48("34605"), {
      get: stryMutAct_9fa48("34606") ? () => undefined : (stryCov_9fa48("34606"), async (tableName, key) => systemCacheProxy.get(tableName, key)),
      find: stryMutAct_9fa48("34607") ? () => undefined : (stryCov_9fa48("34607"), async (tableName, predicate) => systemCacheProxy.find(tableName, predicate)),
      filter: stryMutAct_9fa48("34608") ? () => undefined : (stryCov_9fa48("34608"), async (tableName, predicate) => stryMutAct_9fa48("34609") ? systemCacheProxy : (stryCov_9fa48("34609"), systemCacheProxy.filter(tableName, predicate))),
      getAll: stryMutAct_9fa48("34610") ? () => undefined : (stryCov_9fa48("34610"), async tableName => systemCacheProxy.getAll(tableName)),
      has: stryMutAct_9fa48("34611") ? () => undefined : (stryCov_9fa48("34611"), async (tableName, key) => systemCacheProxy.has(tableName, key)),
      count: async tableName => {
        if (stryMutAct_9fa48("34612")) {
          {}
        } else {
          stryCov_9fa48("34612");
          if (stryMutAct_9fa48("34615") ? typeof systemCacheProxy.count !== TYPEOF.FUNCTION : stryMutAct_9fa48("34614") ? false : stryMutAct_9fa48("34613") ? true : (stryCov_9fa48("34613", "34614", "34615"), typeof systemCacheProxy.count === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("34616")) {
              {}
            } else {
              stryCov_9fa48("34616");
              return systemCacheProxy.count(tableName);
            }
          }
          const records = await systemCacheProxy.getAll(tableName);
          return Array.isArray(records) ? records.length : 0;
        }
      },
      getTableNames: async () => {
        if (stryMutAct_9fa48("34617")) {
          {}
        } else {
          stryCov_9fa48("34617");
          if (stryMutAct_9fa48("34620") ? typeof systemCacheProxy.getTableNames !== TYPEOF.FUNCTION : stryMutAct_9fa48("34619") ? false : stryMutAct_9fa48("34618") ? true : (stryCov_9fa48("34618", "34619", "34620"), typeof systemCacheProxy.getTableNames === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("34621")) {
              {}
            } else {
              stryCov_9fa48("34621");
              return systemCacheProxy.getTableNames();
            }
          }
          return stryMutAct_9fa48("34622") ? ["Stryker was here"] : (stryCov_9fa48("34622"), []);
        }
      },
      onCacheChange: _listener => {
        if (stryMutAct_9fa48("34623")) {
          {}
        } else {
          stryCov_9fa48("34623");
          // Proxy does not provide push-based cache events.
          return null;
        }
      },
      offCacheChange: _listener => {
        if (stryMutAct_9fa48("34624")) {
          {}
        } else {
          stryCov_9fa48("34624");
          // Proxy does not provide push-based cache events.
          return stryMutAct_9fa48("34625") ? true : (stryCov_9fa48("34625"), false);
        }
      }
    });
  }
}
function createSystemCacheClient(options = {}) {
  if (stryMutAct_9fa48("34626")) {
    {}
  } else {
    stryCov_9fa48("34626");
    const mode = stryMutAct_9fa48("34629") ? options.mode && SYSTEM_CACHE_CLIENT_MODE.DIRECT : stryMutAct_9fa48("34628") ? false : stryMutAct_9fa48("34627") ? true : (stryCov_9fa48("34627", "34628", "34629"), options.mode || SYSTEM_CACHE_CLIENT_MODE.DIRECT);
    if (stryMutAct_9fa48("34632") ? mode !== SYSTEM_CACHE_CLIENT_MODE.DIRECT : stryMutAct_9fa48("34631") ? false : stryMutAct_9fa48("34630") ? true : (stryCov_9fa48("34630", "34631", "34632"), mode === SYSTEM_CACHE_CLIENT_MODE.DIRECT)) {
      if (stryMutAct_9fa48("34633")) {
        {}
      } else {
        stryCov_9fa48("34633");
        return createDirectSystemCacheClient(options.cache);
      }
    }
    if (stryMutAct_9fa48("34636") ? mode !== SYSTEM_CACHE_CLIENT_MODE.PROXY : stryMutAct_9fa48("34635") ? false : stryMutAct_9fa48("34634") ? true : (stryCov_9fa48("34634", "34635", "34636"), mode === SYSTEM_CACHE_CLIENT_MODE.PROXY)) {
      if (stryMutAct_9fa48("34637")) {
        {}
      } else {
        stryCov_9fa48("34637");
        return createProxySystemCacheClient(options.cache);
      }
    }
    throw new Error(SYSTEM_CACHE_CLIENT_ERROR_MSG.UNSUPPORTED_MODE(mode));
  }
}
export { SYSTEM_CACHE_CLIENT_MODE, SYSTEM_CACHE_CLIENT_ERROR_MSG, createDirectSystemCacheClient, createProxySystemCacheClient, createSystemCacheClient };