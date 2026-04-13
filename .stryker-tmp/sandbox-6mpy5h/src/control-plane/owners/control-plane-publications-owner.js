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
import { PRESSURE_WORK_CLASS } from '../pressure-governor.js';
import { SystemMetadataOwnerBase } from './system-metadata-owner-base.js';
class ControlPlanePublicationsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = stryMutAct_9fa48("69330") ? "" : (stryCov_9fa48("69330"), 'control-plane-publications-owner');
  static TABLE_NAME = TABLES.CONTROL_PLANE_PUBLICATIONS;
  buildPublicationMutationOptions(options = {}) {
    if (stryMutAct_9fa48("69331")) {
      {}
    } else {
      stryCov_9fa48("69331");
      return stryMutAct_9fa48("69332") ? {} : (stryCov_9fa48("69332"), {
        ...options,
        allowPressureDefer: stryMutAct_9fa48("69333") ? true : (stryCov_9fa48("69333"), false),
        deliveryPriority: stryMutAct_9fa48("69334") ? "" : (stryCov_9fa48("69334"), 'critical'),
        workClass: PRESSURE_WORK_CLASS.CRITICAL
      });
    }
  }
  async getPublication(publicationId, options = {}) {
    if (stryMutAct_9fa48("69335")) {
      {}
    } else {
      stryCov_9fa48("69335");
      return this.readByPrimaryKey(publicationId, options);
    }
  }
  async getPublicationFromCache(publicationId, options = {}) {
    if (stryMutAct_9fa48("69336")) {
      {}
    } else {
      stryCov_9fa48("69336");
      return this.readCachedByPrimaryKey(publicationId, options);
    }
  }
  async listPublications(options = {}) {
    if (stryMutAct_9fa48("69337")) {
      {}
    } else {
      stryCov_9fa48("69337");
      return this.listRows(options);
    }
  }
  async listPublicationsFromCache(options = {}) {
    if (stryMutAct_9fa48("69338")) {
      {}
    } else {
      stryCov_9fa48("69338");
      return this.listCachedRows(options);
    }
  }
  async insertPublication(row, options = {}) {
    if (stryMutAct_9fa48("69339")) {
      {}
    } else {
      stryCov_9fa48("69339");
      return this.insertRow(row, this.buildPublicationMutationOptions(options));
    }
  }
  async upsertPublication(row, options = {}) {
    if (stryMutAct_9fa48("69340")) {
      {}
    } else {
      stryCov_9fa48("69340");
      return this.upsertRow(row, this.buildPublicationMutationOptions(options));
    }
  }
  async updatePublication(publicationId, data, options = {}) {
    if (stryMutAct_9fa48("69341")) {
      {}
    } else {
      stryCov_9fa48("69341");
      return this.updateByPrimaryKey(publicationId, data, this.buildPublicationMutationOptions(options));
    }
  }
  async removePublication(publicationId, options = {}) {
    if (stryMutAct_9fa48("69342")) {
      {}
    } else {
      stryCov_9fa48("69342");
      return this.deleteByPrimaryKey(publicationId, this.buildPublicationMutationOptions(options));
    }
  }
}
export { ControlPlanePublicationsOwner };