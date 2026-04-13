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
const METRICS_LOG_PREFIX = stryMutAct_9fa48("54661") ? "" : (stryCov_9fa48("54661"), 'metrics.');
const METRICS_LOG_TAG = Object.freeze(stryMutAct_9fa48("54662") ? {} : (stryCov_9fa48("54662"), {
  QUERY_LIFECYCLE: stryMutAct_9fa48("54663") ? "" : (stryCov_9fa48("54663"), 'metrics.query.lifecycle'),
  QUERY_DISPATCH: stryMutAct_9fa48("54664") ? "" : (stryCov_9fa48("54664"), 'metrics.query.dispatch'),
  CONTROL_PLANE_GATEWAY_READ: stryMutAct_9fa48("54665") ? "" : (stryCov_9fa48("54665"), 'metrics.control_plane.gateway.read'),
  CONTROL_PLANE_GATEWAY_MUTATION: stryMutAct_9fa48("54666") ? "" : (stryCov_9fa48("54666"), 'metrics.control_plane.gateway.mutation'),
  CONTROL_PLANE_GATEWAY_RETENTION: stryMutAct_9fa48("54667") ? "" : (stryCov_9fa48("54667"), 'metrics.control_plane.gateway.retention'),
  PRESSURE_POLICY: stryMutAct_9fa48("54668") ? "" : (stryCov_9fa48("54668"), 'metrics.pressure.policy'),
  SELECT_DISTRIBUTED: stryMutAct_9fa48("54669") ? "" : (stryCov_9fa48("54669"), 'metrics.select.distributed'),
  FANOUT_COMPLETE: stryMutAct_9fa48("54670") ? "" : (stryCov_9fa48("54670"), 'metrics.fanout.complete'),
  PARTITION_SQLITE: stryMutAct_9fa48("54671") ? "" : (stryCov_9fa48("54671"), 'metrics.partition.sqlite'),
  PARTITION_RAFT_PROPOSE: stryMutAct_9fa48("54672") ? "" : (stryCov_9fa48("54672"), 'metrics.partition.raft_propose'),
  TRANSPORT_DELIVER: stryMutAct_9fa48("54673") ? "" : (stryCov_9fa48("54673"), 'metrics.transport.deliver'),
  TRANSPORT_ENDPOINT: stryMutAct_9fa48("54674") ? "" : (stryCov_9fa48("54674"), 'metrics.transport.endpoint'),
  CDC_WRITE: stryMutAct_9fa48("54675") ? "" : (stryCov_9fa48("54675"), 'metrics.cdc.write'),
  CDC_SQL_ROUTE: stryMutAct_9fa48("54676") ? "" : (stryCov_9fa48("54676"), 'metrics.cdc.sql_route'),
  CDC_PROPAGATION: stryMutAct_9fa48("54677") ? "" : (stryCov_9fa48("54677"), 'metrics.cdc.propagation'),
  HYDRATION_TABLE: stryMutAct_9fa48("54678") ? "" : (stryCov_9fa48("54678"), 'metrics.hydration.table'),
  HYDRATION_COMPLETE: stryMutAct_9fa48("54679") ? "" : (stryCov_9fa48("54679"), 'metrics.hydration.complete'),
  CALLBACK_THROUGHPUT: stryMutAct_9fa48("54680") ? "" : (stryCov_9fa48("54680"), 'metrics.callback.throughput'),
  REBALANCE_OPERATION: stryMutAct_9fa48("54681") ? "" : (stryCov_9fa48("54681"), 'metrics.rebalance.operation'),
  PGWIRE_HANDSHAKE: stryMutAct_9fa48("54682") ? "" : (stryCov_9fa48("54682"), 'metrics.pgwire.handshake'),
  PGWIRE_QUERY: stryMutAct_9fa48("54683") ? "" : (stryCov_9fa48("54683"), 'metrics.pgwire.query'),
  PGWIRE_SESSION: stryMutAct_9fa48("54684") ? "" : (stryCov_9fa48("54684"), 'metrics.pgwire.session'),
  PGWIRE_PROTOCOL_ERROR: stryMutAct_9fa48("54685") ? "" : (stryCov_9fa48("54685"), 'metrics.pgwire.protocol_error')
}));
export { METRICS_LOG_PREFIX, METRICS_LOG_TAG };