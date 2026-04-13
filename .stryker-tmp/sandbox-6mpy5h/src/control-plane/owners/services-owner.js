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
import { TABLES } from '../../constants/index.js';
import { SystemMetadataOwnerBase } from './system-metadata-owner-base.js';
class ServicesOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = stryMutAct_9fa48("69406") ? "" : (stryCov_9fa48("69406"), 'services-owner');
  static TABLE_NAME = TABLES.SERVICES;
  async getService(serviceId, options = {}) {
    if (stryMutAct_9fa48("69407")) {
      {}
    } else {
      stryCov_9fa48("69407");
      return this.readByPrimaryKey(serviceId, options);
    }
  }
  async getServiceFromCache(serviceId, options = {}) {
    if (stryMutAct_9fa48("69408")) {
      {}
    } else {
      stryCov_9fa48("69408");
      return this.readCachedByPrimaryKey(serviceId, options);
    }
  }
  async listServices(options = {}) {
    if (stryMutAct_9fa48("69409")) {
      {}
    } else {
      stryCov_9fa48("69409");
      return this.listRows(options);
    }
  }
  async listServicesFromCache(options = {}) {
    if (stryMutAct_9fa48("69410")) {
      {}
    } else {
      stryCov_9fa48("69410");
      return this.listCachedRows(options);
    }
  }
  async listServicesForNodeFromCache(nodeId, options = {}) {
    if (stryMutAct_9fa48("69411")) {
      {}
    } else {
      stryCov_9fa48("69411");
      return this.filterCachedRows(row => {
        if (stryMutAct_9fa48("69412")) {
          {}
        } else {
          stryCov_9fa48("69412");
          return stryMutAct_9fa48("69415") ? row?.node_id !== nodeId : stryMutAct_9fa48("69414") ? false : stryMutAct_9fa48("69413") ? true : (stryCov_9fa48("69413", "69414", "69415"), (stryMutAct_9fa48("69416") ? row.node_id : (stryCov_9fa48("69416"), row?.node_id)) === nodeId);
        }
      }, options);
    }
  }
  async insertService(row, options = {}) {
    if (stryMutAct_9fa48("69417")) {
      {}
    } else {
      stryCov_9fa48("69417");
      return this.insertRow(row, options);
    }
  }
  async upsertService(row, options = {}) {
    if (stryMutAct_9fa48("69418")) {
      {}
    } else {
      stryCov_9fa48("69418");
      return this.upsertRow(row, options);
    }
  }
  async updateService(serviceId, data, options = {}) {
    if (stryMutAct_9fa48("69419")) {
      {}
    } else {
      stryCov_9fa48("69419");
      return this.updateByPrimaryKey(serviceId, data, options);
    }
  }
  async removeService(serviceId, options = {}) {
    if (stryMutAct_9fa48("69420")) {
      {}
    } else {
      stryCov_9fa48("69420");
      return this.deleteByPrimaryKey(serviceId, options);
    }
  }
}
export { ServicesOwner };