/**
 * Constants for PeerAddressResolver - unified peer address resolution.
 * Replaces duplicated buildPeerAddress() logic across services.
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
const PEER_ADDRESS_RESOLVER_ADDRESS = Object.freeze(stryMutAct_9fa48("127542") ? {} : (stryCov_9fa48("127542"), {
  SEPARATOR: stryMutAct_9fa48("127543") ? "" : (stryCov_9fa48("127543"), '/')
}));
const PEER_ADDRESS_RESOLVER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("127544") ? {} : (stryCov_9fa48("127544"), {
  peerAddressNotUnified: stryMutAct_9fa48("127545") ? () => undefined : (stryCov_9fa48("127545"), peerId => stryMutAct_9fa48("127546") ? `` : (stryCov_9fa48("127546"), `Peer address must be unified: ${peerId}`)),
  peerAddressUnresolved: stryMutAct_9fa48("127547") ? () => undefined : (stryCov_9fa48("127547"), peerId => stryMutAct_9fa48("127548") ? `` : (stryCov_9fa48("127548"), `Unable to resolve unified peer address for ${peerId}`))
}));
const PEER_ADDRESS_RESOLVER_LOG_MSG = Object.freeze(stryMutAct_9fa48("127549") ? {} : (stryCov_9fa48("127549"), {
  PEER_ADDRESS_FROM_LIST: stryMutAct_9fa48("127550") ? "" : (stryCov_9fa48("127550"), 'Built peer address from peerAddresses array'),
  PEER_ADDRESS_FROM_CACHE: stryMutAct_9fa48("127551") ? "" : (stryCov_9fa48("127551"), 'Built peer address from cache'),
  PEER_ADDRESS_NOT_UNIFIED: stryMutAct_9fa48("127552") ? "" : (stryCov_9fa48("127552"), 'Peer address must be in unified format')
}));
export { PEER_ADDRESS_RESOLVER_ADDRESS, PEER_ADDRESS_RESOLVER_ERROR_MSG, PEER_ADDRESS_RESOLVER_LOG_MSG };