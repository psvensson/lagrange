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
import { assertCritical } from '../../utils/assert.js';
import { BOOTSTRAP_ERROR } from '../bootstrap-constants.js';
import { INITIAL_REPLICA_IDS } from '../system-table-schemas-constants.js';
class SeedRegistrationRuntimeOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("23217")) {
      {}
    } else {
      stryCov_9fa48("23217");
      this.delegates = stryMutAct_9fa48("23220") ? options.delegates && {} : stryMutAct_9fa48("23219") ? false : stryMutAct_9fa48("23218") ? true : (stryCov_9fa48("23218", "23219", "23220"), options.delegates || {});
    }
  }
  findLeaderPartition(tableName) {
    if (stryMutAct_9fa48("23221")) {
      {}
    } else {
      stryCov_9fa48("23221");
      const replicaIds = INITIAL_REPLICA_IDS[tableName];
      assertCritical(replicaIds, BOOTSTRAP_ERROR.PARTITION_REPLICAS_MISSING);
      for (const replicaId of replicaIds) {
        if (stryMutAct_9fa48("23222")) {
          {}
        } else {
          stryCov_9fa48("23222");
          const partition = this.delegates.getPartitionServices().get(replicaId);
          if (stryMutAct_9fa48("23225") ? partition || partition.isLeader : stryMutAct_9fa48("23224") ? false : stryMutAct_9fa48("23223") ? true : (stryCov_9fa48("23223", "23224", "23225"), partition && partition.isLeader)) {
            if (stryMutAct_9fa48("23226")) {
              {}
            } else {
              stryCov_9fa48("23226");
              return partition;
            }
          }
        }
      }
      return null;
    }
  }
  getLeaderPartition(tableName) {
    if (stryMutAct_9fa48("23227")) {
      {}
    } else {
      stryCov_9fa48("23227");
      const partition = this.findLeaderPartition(tableName);
      if (stryMutAct_9fa48("23229") ? false : stryMutAct_9fa48("23228") ? true : (stryCov_9fa48("23228", "23229"), partition)) {
        if (stryMutAct_9fa48("23230")) {
          {}
        } else {
          stryCov_9fa48("23230");
          return partition;
        }
      }
      throw new Error(BOOTSTRAP_ERROR.PARTITION_LEADER_MISSING);
    }
  }
}
export { SeedRegistrationRuntimeOwner };