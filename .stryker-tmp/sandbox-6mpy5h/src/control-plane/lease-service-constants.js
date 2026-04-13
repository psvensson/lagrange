/**
 * Constants for LeaseService.
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
import { TABLES, TIME_MS } from '../constants/index.js';
import { CONFIG_KEY } from '../config/config-constants.js';
const LEASE_SUBSYSTEM = stryMutAct_9fa48("66733") ? "" : (stryCov_9fa48("66733"), 'lease-service');
const LEASE_DEFAULT_OPTIONS = Object.freeze({});
const LEASE_EMPTY_QUERY_PARAMS = Object.freeze(stryMutAct_9fa48("66734") ? ["Stryker was here"] : (stryCov_9fa48("66734"), []));
const LEASE_NOW = stryMutAct_9fa48("66735") ? () => undefined : (stryCov_9fa48("66735"), (() => {
  const LEASE_NOW = () => Date.now();
  return LEASE_NOW;
})());
const LEASE_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("66736") ? {} : (stryCov_9fa48("66736"), {
  READY_LEASE_MS: CONFIG_KEY.CONTROL_PLANE_READY_LEASE_MS,
  SWEEP_INTERVAL_MS: CONFIG_KEY.CONTROL_PLANE_LEASE_SWEEP_INTERVAL_MS
}));
const LEASE_DEFAULT = Object.freeze(stryMutAct_9fa48("66737") ? {} : (stryCov_9fa48("66737"), {
  READY_LEASE_MS: TIME_MS.CONTROL_PLANE_READY_LEASE,
  SWEEP_INTERVAL_MS: TIME_MS.CONTROL_PLANE_LEASE_SWEEP_INTERVAL
}));
const LEASE_STATE = Object.freeze(stryMutAct_9fa48("66738") ? {} : (stryCov_9fa48("66738"), {
  CREATED: stryMutAct_9fa48("66739") ? "" : (stryCov_9fa48("66739"), 'created'),
  INITIALIZED: stryMutAct_9fa48("66740") ? "" : (stryCov_9fa48("66740"), 'initialized'),
  RUNNING: stryMutAct_9fa48("66741") ? "" : (stryCov_9fa48("66741"), 'running'),
  STOPPED: stryMutAct_9fa48("66742") ? "" : (stryCov_9fa48("66742"), 'stopped')
}));
const LEASE_LOG_MSG = Object.freeze(stryMutAct_9fa48("66743") ? {} : (stryCov_9fa48("66743"), {
  INITIALIZED: stryMutAct_9fa48("66744") ? "" : (stryCov_9fa48("66744"), 'LeaseService initialized'),
  STARTED: stryMutAct_9fa48("66745") ? "" : (stryCov_9fa48("66745"), 'LeaseService started'),
  STOPPED: stryMutAct_9fa48("66746") ? "" : (stryCov_9fa48("66746"), 'LeaseService stopped'),
  SWEEP_FAILED: stryMutAct_9fa48("66747") ? "" : (stryCov_9fa48("66747"), 'Lease sweep failed'),
  SWEEP_EXPIRED: stryMutAct_9fa48("66748") ? "" : (stryCov_9fa48("66748"), 'Swept expired leases'),
  SWEEP_SKIPPED_TRANSPORT_CONNECTED: stryMutAct_9fa48("66749") ? "" : (stryCov_9fa48("66749"), 'Skipped lease disconnect for transport-connected node')
}));
const LEASE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("66750") ? {} : (stryCov_9fa48("66750"), {
  MISSING_NODE_ID: stryMutAct_9fa48("66751") ? "" : (stryCov_9fa48("66751"), 'LeaseService requires nodeId'),
  MISSING_NODE_LEASE_OWNER: stryMutAct_9fa48("66752") ? "" : (stryCov_9fa48("66752"), 'LeaseService requires nodeLeaseOwner'),
  MISSING_CACHE: stryMutAct_9fa48("66753") ? "" : (stryCov_9fa48("66753"), 'LeaseService requires systemTableCache'),
  NOT_INITIALIZED: stryMutAct_9fa48("66754") ? "" : (stryCov_9fa48("66754"), 'LeaseService must be initialized before start')
}));
const LEASE_EVENT = Object.freeze(stryMutAct_9fa48("66755") ? {} : (stryCov_9fa48("66755"), {
  LEASE_EXPIRED: stryMutAct_9fa48("66756") ? "" : (stryCov_9fa48("66756"), 'leaseExpired'),
  SWEEP_COMPLETE: stryMutAct_9fa48("66757") ? "" : (stryCov_9fa48("66757"), 'sweepComplete'),
  SWEEP_ERROR: stryMutAct_9fa48("66758") ? "" : (stryCov_9fa48("66758"), 'sweepError')
}));
const LEASE_SQL = Object.freeze(stryMutAct_9fa48("66759") ? {} : (stryCov_9fa48("66759"), {
  SELECT_ALL_NODES: stryMutAct_9fa48("66760") ? `` : (stryCov_9fa48("66760"), `SELECT * FROM ${TABLES.NODES}`)
}));
export { LEASE_SUBSYSTEM, LEASE_DEFAULT_OPTIONS, LEASE_EMPTY_QUERY_PARAMS, LEASE_NOW, LEASE_CONFIG_KEY, LEASE_DEFAULT, LEASE_STATE, LEASE_LOG_MSG, LEASE_ERROR_MSG, LEASE_EVENT, LEASE_SQL };