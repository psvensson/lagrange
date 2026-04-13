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
class LogsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = stryMutAct_9fa48("69353") ? "" : (stryCov_9fa48("69353"), 'logs-owner');
  static TABLE_NAME = TABLES.LOGS;
  async getLog(logId, options = {}) {
    if (stryMutAct_9fa48("69354")) {
      {}
    } else {
      stryCov_9fa48("69354");
      return this.readByPrimaryKey(logId, options);
    }
  }
  async listLogs(options = {}) {
    if (stryMutAct_9fa48("69355")) {
      {}
    } else {
      stryCov_9fa48("69355");
      return this.listRows(options);
    }
  }
  async appendLog(row, options = {}) {
    if (stryMutAct_9fa48("69356")) {
      {}
    } else {
      stryCov_9fa48("69356");
      return this.insertRow(row, options);
    }
  }
  async upsertLog(row, options = {}) {
    if (stryMutAct_9fa48("69357")) {
      {}
    } else {
      stryCov_9fa48("69357");
      return this.upsertRow(row, options);
    }
  }
  async updateLog(logId, data, options = {}) {
    if (stryMutAct_9fa48("69358")) {
      {}
    } else {
      stryCov_9fa48("69358");
      return this.updateByPrimaryKey(logId, data, options);
    }
  }
  async removeLog(logId, options = {}) {
    if (stryMutAct_9fa48("69359")) {
      {}
    } else {
      stryCov_9fa48("69359");
      return this.deleteByPrimaryKey(logId, options);
    }
  }
}
export { LogsOwner };