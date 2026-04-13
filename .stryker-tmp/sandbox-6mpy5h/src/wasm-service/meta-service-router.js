/**
 * Meta-service routing and availability checking.
 * Provides a single function to check whether a meta-service
 * leader is routable, and returns a structured unavailable
 * error when it is not.
 *
 * Requirements: 1.4, 1.5
 * @module wasm-service/meta-service-router
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
import { TABLES } from '../constants/tables.js';
import { COLUMN } from '../constants/columns.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { isMetaService } from './meta-service-lifecycle.js';
const META_ROUTER_ERROR_CODE = Object.freeze(stryMutAct_9fa48("161293") ? {} : (stryCov_9fa48("161293"), {
  META_SERVICE_UNAVAILABLE: stryMutAct_9fa48("161294") ? "" : (stryCov_9fa48("161294"), 'META_SERVICE_UNAVAILABLE'),
  INVALID_META_SERVICE: stryMutAct_9fa48("161295") ? "" : (stryCov_9fa48("161295"), 'INVALID_META_SERVICE')
}));
const META_ROUTER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("161296") ? {} : (stryCov_9fa48("161296"), {
  NO_LEADER: stryMutAct_9fa48("161297") ? "" : (stryCov_9fa48("161297"), 'Meta-service leader is not routable'),
  NOT_META_SERVICE: stryMutAct_9fa48("161298") ? "" : (stryCov_9fa48("161298"), 'Service ID is not a recognized meta-service'),
  CACHE_REQUIRED: stryMutAct_9fa48("161299") ? "" : (stryCov_9fa48("161299"), 'System table cache is required')
}));

/**
 * Checks if the given meta-service has a routable leader.
 *
 * @param {Object} systemCacheClient - System cache read client.
 * @param {string} serviceId - The meta-service ID to check.
 * @return {{available: boolean, leaderAddress?: string,
 *   error?: string}} Availability result.
 * @throws {Error} If systemTableCache is missing.
 */
function checkMetaServiceAvailability(systemCacheClient, serviceId) {
  if (stryMutAct_9fa48("161300")) {
    {}
  } else {
    stryCov_9fa48("161300");
    if (stryMutAct_9fa48("161303") ? false : stryMutAct_9fa48("161302") ? true : stryMutAct_9fa48("161301") ? systemCacheClient : (stryCov_9fa48("161301", "161302", "161303"), !systemCacheClient)) {
      if (stryMutAct_9fa48("161304")) {
        {}
      } else {
        stryCov_9fa48("161304");
        throw new Error(META_ROUTER_ERROR_MSG.CACHE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161307") ? false : stryMutAct_9fa48("161306") ? true : stryMutAct_9fa48("161305") ? isMetaService(serviceId) : (stryCov_9fa48("161305", "161306", "161307"), !isMetaService(serviceId))) {
      if (stryMutAct_9fa48("161308")) {
        {}
      } else {
        stryCov_9fa48("161308");
        return stryMutAct_9fa48("161309") ? {} : (stryCov_9fa48("161309"), {
          available: stryMutAct_9fa48("161310") ? true : (stryCov_9fa48("161310"), false),
          error: META_ROUTER_ERROR_MSG.NOT_META_SERVICE
        });
      }
    }
    const services = stryMutAct_9fa48("161313") ? systemCacheClient.getAll(TABLES.SERVICES) && [] : stryMutAct_9fa48("161312") ? false : stryMutAct_9fa48("161311") ? true : (stryCov_9fa48("161311", "161312", "161313"), systemCacheClient.getAll(TABLES.SERVICES) || (stryMutAct_9fa48("161314") ? ["Stryker was here"] : (stryCov_9fa48("161314"), [])));
    const leader = services.find(stryMutAct_9fa48("161315") ? () => undefined : (stryCov_9fa48("161315"), s => stryMutAct_9fa48("161318") ? s[COLUMN.SERVICE_ID] === serviceId && s[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER || s[COLUMN.ADDRESS] : stryMutAct_9fa48("161317") ? false : stryMutAct_9fa48("161316") ? true : (stryCov_9fa48("161316", "161317", "161318"), (stryMutAct_9fa48("161320") ? s[COLUMN.SERVICE_ID] === serviceId || s[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER : stryMutAct_9fa48("161319") ? true : (stryCov_9fa48("161319", "161320"), (stryMutAct_9fa48("161322") ? s[COLUMN.SERVICE_ID] !== serviceId : stryMutAct_9fa48("161321") ? true : (stryCov_9fa48("161321", "161322"), s[COLUMN.SERVICE_ID] === serviceId)) && (stryMutAct_9fa48("161324") ? s[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEADER : stryMutAct_9fa48("161323") ? true : (stryCov_9fa48("161323", "161324"), s[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER)))) && s[COLUMN.ADDRESS])));
    if (stryMutAct_9fa48("161326") ? false : stryMutAct_9fa48("161325") ? true : (stryCov_9fa48("161325", "161326"), leader)) {
      if (stryMutAct_9fa48("161327")) {
        {}
      } else {
        stryCov_9fa48("161327");
        return stryMutAct_9fa48("161328") ? {} : (stryCov_9fa48("161328"), {
          available: stryMutAct_9fa48("161329") ? false : (stryCov_9fa48("161329"), true),
          leaderAddress: leader[COLUMN.ADDRESS]
        });
      }
    }
    return stryMutAct_9fa48("161330") ? {} : (stryCov_9fa48("161330"), {
      available: stryMutAct_9fa48("161331") ? true : (stryCov_9fa48("161331"), false),
      error: META_ROUTER_ERROR_MSG.NO_LEADER
    });
  }
}

/**
 * Routes a command to a meta-service leader if available.
 *
 * @param {Object} systemCacheClient - System cache read client.
 * @param {string} serviceId - The meta-service ID.
 * @param {string} command - The command name.
 * @param {Object} payload - The command payload.
 * @return {{success: boolean, leaderAddress?: string,
 *   serviceId?: string, command?: string, payload?: Object,
 *   error?: string, code?: string}} Routing result.
 */
function routeToMetaService(systemCacheClient, serviceId, command, payload) {
  if (stryMutAct_9fa48("161332")) {
    {}
  } else {
    stryCov_9fa48("161332");
    if (stryMutAct_9fa48("161335") ? false : stryMutAct_9fa48("161334") ? true : stryMutAct_9fa48("161333") ? isMetaService(serviceId) : (stryCov_9fa48("161333", "161334", "161335"), !isMetaService(serviceId))) {
      if (stryMutAct_9fa48("161336")) {
        {}
      } else {
        stryCov_9fa48("161336");
        return stryMutAct_9fa48("161337") ? {} : (stryCov_9fa48("161337"), {
          success: stryMutAct_9fa48("161338") ? true : (stryCov_9fa48("161338"), false),
          error: META_ROUTER_ERROR_MSG.NOT_META_SERVICE,
          code: META_ROUTER_ERROR_CODE.INVALID_META_SERVICE
        });
      }
    }
    const availability = checkMetaServiceAvailability(systemCacheClient, serviceId);
    if (stryMutAct_9fa48("161341") ? false : stryMutAct_9fa48("161340") ? true : stryMutAct_9fa48("161339") ? availability.available : (stryCov_9fa48("161339", "161340", "161341"), !availability.available)) {
      if (stryMutAct_9fa48("161342")) {
        {}
      } else {
        stryCov_9fa48("161342");
        return stryMutAct_9fa48("161343") ? {} : (stryCov_9fa48("161343"), {
          success: stryMutAct_9fa48("161344") ? true : (stryCov_9fa48("161344"), false),
          error: availability.error,
          code: META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE
        });
      }
    }
    return stryMutAct_9fa48("161345") ? {} : (stryCov_9fa48("161345"), {
      success: stryMutAct_9fa48("161346") ? false : (stryCov_9fa48("161346"), true),
      leaderAddress: availability.leaderAddress,
      serviceId,
      command,
      payload
    });
  }
}
export { META_ROUTER_ERROR_CODE, META_ROUTER_ERROR_MSG, checkMetaServiceAvailability, routeToMetaService };