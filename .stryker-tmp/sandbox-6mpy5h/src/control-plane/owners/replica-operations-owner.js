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
class ReplicaOperationsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = stryMutAct_9fa48("69383") ? "" : (stryCov_9fa48("69383"), 'replica-operations-owner');
  static TABLE_NAME = TABLES.REPLICA_OPERATIONS;
  async getReplicaOperation(assignmentId, options = {}) {
    if (stryMutAct_9fa48("69384")) {
      {}
    } else {
      stryCov_9fa48("69384");
      return this.readByPrimaryKey(assignmentId, options);
    }
  }
  async getReplicaOperationFromCache(assignmentId, options = {}) {
    if (stryMutAct_9fa48("69385")) {
      {}
    } else {
      stryCov_9fa48("69385");
      return this.readCachedByPrimaryKey(assignmentId, options);
    }
  }
  async listReplicaOperations(options = {}) {
    if (stryMutAct_9fa48("69386")) {
      {}
    } else {
      stryCov_9fa48("69386");
      return this.listRows(options);
    }
  }
  async listReplicaOperationsFromCache(options = {}) {
    if (stryMutAct_9fa48("69387")) {
      {}
    } else {
      stryCov_9fa48("69387");
      return this.listCachedRows(options);
    }
  }
  async insertReplicaOperation(row, options = {}) {
    if (stryMutAct_9fa48("69388")) {
      {}
    } else {
      stryCov_9fa48("69388");
      return this.insertRow(row, options);
    }
  }
  async upsertReplicaOperation(row, options = {}) {
    if (stryMutAct_9fa48("69389")) {
      {}
    } else {
      stryCov_9fa48("69389");
      return this.upsertRow(row, options);
    }
  }
  async updateReplicaOperation(assignmentId, data, options = {}) {
    if (stryMutAct_9fa48("69390")) {
      {}
    } else {
      stryCov_9fa48("69390");
      return this.updateByPrimaryKey(assignmentId, data, options);
    }
  }
  async removeReplicaOperation(assignmentId, options = {}) {
    if (stryMutAct_9fa48("69391")) {
      {}
    } else {
      stryCov_9fa48("69391");
      return this.deleteByPrimaryKey(assignmentId, options);
    }
  }
}
export { ReplicaOperationsOwner };