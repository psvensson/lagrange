/**
 * Abstract contract for service-type lifecycle adapters.
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
import { ServiceTypeAdapterNotImplementedError, assertKnownServiceType } from './service-lifecycle-errors.js';
class ServiceTypeAdapter {
  /**
   * @param {string} serviceType
   */
  constructor(serviceType) {
    if (stryMutAct_9fa48("151700")) {
      {}
    } else {
      stryCov_9fa48("151700");
      if (stryMutAct_9fa48("151703") ? new.target !== ServiceTypeAdapter : stryMutAct_9fa48("151702") ? false : stryMutAct_9fa48("151701") ? true : (stryCov_9fa48("151701", "151702", "151703"), new.target === ServiceTypeAdapter)) {
        if (stryMutAct_9fa48("151704")) {
          {}
        } else {
          stryCov_9fa48("151704");
          throw new Error(stryMutAct_9fa48("151705") ? "" : (stryCov_9fa48("151705"), 'ServiceTypeAdapter is abstract and cannot be instantiated directly'));
        }
      }
      this.serviceType = assertKnownServiceType(serviceType);
      Object.defineProperty(this, stryMutAct_9fa48("151706") ? "" : (stryCov_9fa48("151706"), 'serviceType'), stryMutAct_9fa48("151707") ? {} : (stryCov_9fa48("151707"), {
        writable: stryMutAct_9fa48("151708") ? true : (stryCov_9fa48("151708"), false),
        configurable: stryMutAct_9fa48("151709") ? true : (stryCov_9fa48("151709"), false)
      }));
    }
  }

  /**
   * @param {Object} _definition
   * @return {{valid: boolean, errors?: string[]}}
   */
  validateDefinition(_definition) {
    if (stryMutAct_9fa48("151710")) {
      {}
    } else {
      stryCov_9fa48("151710");
      throw new ServiceTypeAdapterNotImplementedError(this.serviceType, stryMutAct_9fa48("151711") ? "" : (stryCov_9fa48("151711"), 'validateDefinition'));
    }
  }

  /**
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async createReplica(_context) {
    if (stryMutAct_9fa48("151712")) {
      {}
    } else {
      stryCov_9fa48("151712");
      throw new ServiceTypeAdapterNotImplementedError(this.serviceType, stryMutAct_9fa48("151713") ? "" : (stryCov_9fa48("151713"), 'createReplica'));
    }
  }

  /**
   * @param {Object} _replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async startReplica(_replicaHandle, _context) {
    if (stryMutAct_9fa48("151714")) {
      {}
    } else {
      stryCov_9fa48("151714");
      throw new ServiceTypeAdapterNotImplementedError(this.serviceType, stryMutAct_9fa48("151715") ? "" : (stryCov_9fa48("151715"), 'startReplica'));
    }
  }

  /**
   * @param {Object} _replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async stopReplica(_replicaHandle, _context) {
    if (stryMutAct_9fa48("151716")) {
      {}
    } else {
      stryCov_9fa48("151716");
      throw new ServiceTypeAdapterNotImplementedError(this.serviceType, stryMutAct_9fa48("151717") ? "" : (stryCov_9fa48("151717"), 'stopReplica'));
    }
  }

  /**
   * @param {Object} _replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async health(_replicaHandle, _context) {
    if (stryMutAct_9fa48("151718")) {
      {}
    } else {
      stryCov_9fa48("151718");
      throw new ServiceTypeAdapterNotImplementedError(this.serviceType, stryMutAct_9fa48("151719") ? "" : (stryCov_9fa48("151719"), 'health'));
    }
  }
}
export { ServiceTypeAdapter };