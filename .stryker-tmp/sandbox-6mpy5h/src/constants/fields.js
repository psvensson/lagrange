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
const FIELD = Object.freeze(stryMutAct_9fa48("54625") ? {} : (stryCov_9fa48("54625"), {
  TYPE: stryMutAct_9fa48("54626") ? "" : (stryCov_9fa48("54626"), 'type'),
  NODE_ID: stryMutAct_9fa48("54627") ? "" : (stryCov_9fa48("54627"), 'nodeId'),
  NODE_ADDRESS: stryMutAct_9fa48("54628") ? "" : (stryCov_9fa48("54628"), 'nodeAddress'),
  STATE: stryMutAct_9fa48("54629") ? "" : (stryCov_9fa48("54629"), 'state'),
  CAPABILITIES: stryMutAct_9fa48("54630") ? "" : (stryCov_9fa48("54630"), 'capabilities'),
  HEARTBEAT_AT: stryMutAct_9fa48("54631") ? "" : (stryCov_9fa48("54631"), 'heartbeatAt'),
  HEARTBEAT_ONLY: stryMutAct_9fa48("54632") ? "" : (stryCov_9fa48("54632"), 'heartbeatOnly'),
  READY_LEASE_EXPIRES_AT: stryMutAct_9fa48("54633") ? "" : (stryCov_9fa48("54633"), 'readyLeaseExpiresAt'),
  NODE_ROW: stryMutAct_9fa48("54634") ? "" : (stryCov_9fa48("54634"), 'nodeRow'),
  OPERATION_ID: stryMutAct_9fa48("54635") ? "" : (stryCov_9fa48("54635"), 'operationId'),
  OPERATION_ROW: stryMutAct_9fa48("54636") ? "" : (stryCov_9fa48("54636"), 'operationRow'),
  PARTITION_ID: stryMutAct_9fa48("54637") ? "" : (stryCov_9fa48("54637"), 'partitionId'),
  REPLICA_ID: stryMutAct_9fa48("54638") ? "" : (stryCov_9fa48("54638"), 'replicaId'),
  REPLICA_IDS: stryMutAct_9fa48("54639") ? "" : (stryCov_9fa48("54639"), 'replicaIds'),
  PEER_ADDRESSES: stryMutAct_9fa48("54640") ? "" : (stryCov_9fa48("54640"), 'peerAddresses'),
  BOOTSTRAP_TABLE_METADATA: stryMutAct_9fa48("54641") ? "" : (stryCov_9fa48("54641"), 'bootstrapTableMetadata'),
  BOOTSTRAP_PARTITION_METADATA: stryMutAct_9fa48("54642") ? "" : (stryCov_9fa48("54642"), 'bootstrapPartitionMetadata'),
  TARGET_NODE_ID: stryMutAct_9fa48("54643") ? "" : (stryCov_9fa48("54643"), 'targetNodeId'),
  FORWARDED_BY: stryMutAct_9fa48("54644") ? "" : (stryCov_9fa48("54644"), 'forwardedBy'),
  SOURCE_NODE_ID: stryMutAct_9fa48("54645") ? "" : (stryCov_9fa48("54645"), 'sourceNodeId'),
  ENTITY_TYPE: stryMutAct_9fa48("54646") ? "" : (stryCov_9fa48("54646"), 'entityType'),
  ENTITY_ID: stryMutAct_9fa48("54647") ? "" : (stryCov_9fa48("54647"), 'entityId'),
  REASON: stryMutAct_9fa48("54648") ? "" : (stryCov_9fa48("54648"), 'reason')
}));
export { FIELD };