/**
 * Replica operation message schema constants.
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
import { FIELD, MESSAGE_TYPE } from '../constants/index.js';
const ReplicaOperationMessageType = Object.freeze(stryMutAct_9fa48("137913") ? {} : (stryCov_9fa48("137913"), {
  CREATE_REPLICA: MESSAGE_TYPE.CREATE_REPLICA,
  REMOVE_REPLICA: MESSAGE_TYPE.REMOVE_REPLICA
}));
const ReplicaOperationField = Object.freeze(stryMutAct_9fa48("137914") ? {} : (stryCov_9fa48("137914"), {
  TYPE: FIELD.TYPE,
  OPERATION_ID: FIELD.OPERATION_ID,
  PARTITION_ID: FIELD.PARTITION_ID,
  REPLICA_ID: FIELD.REPLICA_ID,
  REPLICA_IDS: FIELD.REPLICA_IDS,
  PEER_ADDRESSES: FIELD.PEER_ADDRESSES,
  BOOTSTRAP_TABLE_METADATA: FIELD.BOOTSTRAP_TABLE_METADATA,
  BOOTSTRAP_PARTITION_METADATA: FIELD.BOOTSTRAP_PARTITION_METADATA,
  SOURCE_NODE_ID: FIELD.SOURCE_NODE_ID,
  ENTITY_TYPE: FIELD.ENTITY_TYPE,
  ENTITY_ID: FIELD.ENTITY_ID,
  REASON: FIELD.REASON
}));
const ReplicaOperationResponseStatus = Object.freeze(stryMutAct_9fa48("137915") ? {} : (stryCov_9fa48("137915"), {
  INITIATED: stryMutAct_9fa48("137916") ? "" : (stryCov_9fa48("137916"), 'initiated'),
  ALREADY_EXISTS: stryMutAct_9fa48("137917") ? "" : (stryCov_9fa48("137917"), 'already_exists'),
  IN_PROGRESS: stryMutAct_9fa48("137918") ? "" : (stryCov_9fa48("137918"), 'in_progress'),
  NOT_FOUND: stryMutAct_9fa48("137919") ? "" : (stryCov_9fa48("137919"), 'not_found'),
  COMPLETED: stryMutAct_9fa48("137920") ? "" : (stryCov_9fa48("137920"), 'completed'),
  ERROR: stryMutAct_9fa48("137921") ? "" : (stryCov_9fa48("137921"), 'error')
}));
export { ReplicaOperationMessageType, ReplicaOperationField, ReplicaOperationResponseStatus };