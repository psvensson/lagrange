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
class MessageGroupsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = stryMutAct_9fa48("69360") ? "" : (stryCov_9fa48("69360"), 'message-groups-owner');
  static TABLE_NAME = TABLES.MESSAGE_GROUPS;
  async getMessageGroup(groupId, options = {}) {
    if (stryMutAct_9fa48("69361")) {
      {}
    } else {
      stryCov_9fa48("69361");
      return this.readByPrimaryKey(groupId, options);
    }
  }
  async listMessageGroups(options = {}) {
    if (stryMutAct_9fa48("69362")) {
      {}
    } else {
      stryCov_9fa48("69362");
      return this.listRows(options);
    }
  }
  async insertMessageGroup(row, options = {}) {
    if (stryMutAct_9fa48("69363")) {
      {}
    } else {
      stryCov_9fa48("69363");
      return this.insertRow(row, options);
    }
  }
  async upsertMessageGroup(row, options = {}) {
    if (stryMutAct_9fa48("69364")) {
      {}
    } else {
      stryCov_9fa48("69364");
      return this.upsertRow(row, options);
    }
  }
  async updateMessageGroup(groupId, data, options = {}) {
    if (stryMutAct_9fa48("69365")) {
      {}
    } else {
      stryCov_9fa48("69365");
      return this.updateByPrimaryKey(groupId, data, options);
    }
  }
  async removeMessageGroup(groupId, options = {}) {
    if (stryMutAct_9fa48("69366")) {
      {}
    } else {
      stryCov_9fa48("69366");
      return this.deleteByPrimaryKey(groupId, options);
    }
  }
}
export { MessageGroupsOwner };