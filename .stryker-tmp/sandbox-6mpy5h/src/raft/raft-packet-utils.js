/**
 * Shared Raft packet utilities.
 * Used by both MessageGroupService and PartitionService for consistent
 * Raft packet detection without type conversion.
 * Requirements: 9.1, 9.2, 9.3, 9.4
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
import { TYPEOF } from '../constants/index.js';
import { RAFT_PACKET_TYPES } from './constants.js';

/**
 * Detect if a payload is a native liferaft Raft packet.
 * Checks for native liferaft type values: 'vote', 'voted', 'append', 'appended'.
 * This function is shared between MessageGroupService and PartitionService
 * to ensure consistent Raft packet detection.
 * Requirements: 2.1, 2.4, 9.1, 9.3
 * @param {Object} payload - Message payload to check.
 * @return {boolean} True if payload is a Raft packet.
 */
function isRaftPacket(payload) {
  if (stryMutAct_9fa48("127997")) {
    {}
  } else {
    stryCov_9fa48("127997");
    return Boolean(stryMutAct_9fa48("128000") ? payload && typeof payload.type === TYPEOF.STRING || RAFT_PACKET_TYPES.has(payload.type) : stryMutAct_9fa48("127999") ? false : stryMutAct_9fa48("127998") ? true : (stryCov_9fa48("127998", "127999", "128000"), (stryMutAct_9fa48("128002") ? payload || typeof payload.type === TYPEOF.STRING : stryMutAct_9fa48("128001") ? true : (stryCov_9fa48("128001", "128002"), payload && (stryMutAct_9fa48("128004") ? typeof payload.type !== TYPEOF.STRING : stryMutAct_9fa48("128003") ? true : (stryCov_9fa48("128003", "128004"), typeof payload.type === TYPEOF.STRING)))) && RAFT_PACKET_TYPES.has(payload.type)));
  }
}
export { RAFT_PACKET_TYPES, isRaftPacket };