/**
 * Constants for ReplicaDispatchService.
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
const DISPATCH_SUBSYSTEM = stryMutAct_9fa48("72417") ? "" : (stryCov_9fa48("72417"), 'replica-dispatch-service');
const DISPATCH_STATE = Object.freeze(stryMutAct_9fa48("72418") ? {} : (stryCov_9fa48("72418"), {
  CREATED: stryMutAct_9fa48("72419") ? "" : (stryCov_9fa48("72419"), 'created'),
  INITIALIZED: stryMutAct_9fa48("72420") ? "" : (stryCov_9fa48("72420"), 'initialized'),
  RUNNING: stryMutAct_9fa48("72421") ? "" : (stryCov_9fa48("72421"), 'running'),
  STOPPED: stryMutAct_9fa48("72422") ? "" : (stryCov_9fa48("72422"), 'stopped')
}));
const DISPATCH_LOG_MSG = Object.freeze(stryMutAct_9fa48("72423") ? {} : (stryCov_9fa48("72423"), {
  INITIALIZED: stryMutAct_9fa48("72424") ? "" : (stryCov_9fa48("72424"), 'ReplicaDispatchService initialized'),
  STARTED: stryMutAct_9fa48("72425") ? "" : (stryCov_9fa48("72425"), 'ReplicaDispatchService started'),
  STOPPED: stryMutAct_9fa48("72426") ? "" : (stryCov_9fa48("72426"), 'ReplicaDispatchService stopped'),
  DISPATCHED: stryMutAct_9fa48("72427") ? "" : (stryCov_9fa48("72427"), 'Dispatched replica operation'),
  CLAIM_SKIPPED: stryMutAct_9fa48("72428") ? "" : (stryCov_9fa48("72428"), 'Skipped replica operation dispatch claim'),
  DISPATCH_FAILED: stryMutAct_9fa48("72429") ? "" : (stryCov_9fa48("72429"), 'Replica operation dispatch failed'),
  FORWARDED: stryMutAct_9fa48("72430") ? "" : (stryCov_9fa48("72430"), 'Forwarded message to leader'),
  CDC_HANDLING_FAILED: stryMutAct_9fa48("72431") ? "" : (stryCov_9fa48("72431"), 'CDC event handling failed'),
  MESSAGE_HANDLING_FAILED: stryMutAct_9fa48("72432") ? "" : (stryCov_9fa48("72432"), 'Message handling failed'),
  NO_HANDLER_ON_TARGET: stryMutAct_9fa48("72433") ? "" : (stryCov_9fa48("72433"), 'No active handler for entity type on target node'),
  RETRY_PENDING_READY_NODE: stryMutAct_9fa48("72434") ? "" : (stryCov_9fa48("72434"), 'Retrying pending replica operations for ready node'),
  OPERATION_DISPATCH_DEFERRED: stryMutAct_9fa48("72435") ? "" : (stryCov_9fa48("72435"), 'Deferred replica operation dispatch while control-plane path recovers'),
  OPERATION_DISPATCH_DEFERRED_RETRY: stryMutAct_9fa48("72436") ? "" : (stryCov_9fa48("72436"), 'Re-enqueued deferred replica operation dispatch'),
  RETRY_READY_TRIGGER_SKIPPED: stryMutAct_9fa48("72437") ? "" : (stryCov_9fa48("72437"), 'Skipped duplicate ready-trigger retry'),
  DISPATCH_LOOKUP_FAILED: stryMutAct_9fa48("72438") ? "" : (stryCov_9fa48("72438"), 'Replica operation lookup failed during ready-node retry'),
  NODE_STATE_UPDATE_SKIPPED: stryMutAct_9fa48("72439") ? "" : (stryCov_9fa48("72439"), 'Skipped stale node-state update'),
  NODE_STATE_UPDATE_DEFERRED: stryMutAct_9fa48("72440") ? "" : (stryCov_9fa48("72440"), 'Deferred node-state update while control-plane path recovers'),
  NODE_STATE_UPDATE_DEFERRED_RETRY: stryMutAct_9fa48("72441") ? "" : (stryCov_9fa48("72441"), 'Re-enqueued deferred node-state update'),
  NODE_STATE_UPDATE_BOOTSTRAP_UPSERTED: stryMutAct_9fa48("72442") ? "" : (stryCov_9fa48("72442"), 'Bootstrapped missing node row from node-state update payload'),
  MEMBERSHIP_PUBLICATION_REFRESH_FAILED: stryMutAct_9fa48("72443") ? "" : (stryCov_9fa48("72443"), 'Membership publication refresh failed for ready node-state'),
  MEMBERSHIP_PUBLICATION_ACK_FAILED: stryMutAct_9fa48("72444") ? "" : (stryCov_9fa48("72444"), 'Membership publication acknowledgement failed for ready node-state'),
  ENQUEUE_OPERATION_DISPATCH: stryMutAct_9fa48("72445") ? "" : (stryCov_9fa48("72445"), 'Enqueued operation for dispatch reconcile'),
  ENQUEUE_NODE_STATE_UPDATE: stryMutAct_9fa48("72446") ? "" : (stryCov_9fa48("72446"), 'Enqueued node-state update for reconcile'),
  ENQUEUE_NODE_READY_RETRY: stryMutAct_9fa48("72447") ? "" : (stryCov_9fa48("72447"), 'Enqueued node for ready-retry reconcile')
}));
const DISPATCH_QUEUE_NAME = Object.freeze(stryMutAct_9fa48("72448") ? {} : (stryCov_9fa48("72448"), {
  OPERATION: stryMutAct_9fa48("72449") ? "" : (stryCov_9fa48("72449"), 'dispatch-operation-reconcile'),
  NODE_STATE_UPDATE: stryMutAct_9fa48("72450") ? "" : (stryCov_9fa48("72450"), 'dispatch-node-state-update-reconcile'),
  NODE_READY: stryMutAct_9fa48("72451") ? "" : (stryCov_9fa48("72451"), 'dispatch-node-ready-reconcile')
}));
const DISPATCH_ERROR_MSG = Object.freeze(stryMutAct_9fa48("72452") ? {} : (stryCov_9fa48("72452"), {
  MISSING_NODE_ID: stryMutAct_9fa48("72453") ? "" : (stryCov_9fa48("72453"), 'ReplicaDispatchService requires nodeId'),
  MISSING_ROUTER: stryMutAct_9fa48("72454") ? "" : (stryCov_9fa48("72454"), 'ReplicaDispatchService requires messageRouter'),
  MISSING_CDC: stryMutAct_9fa48("72455") ? "" : (stryCov_9fa48("72455"), 'ReplicaDispatchService requires cdcIntegrationService'),
  MISSING_CACHE: stryMutAct_9fa48("72456") ? "" : (stryCov_9fa48("72456"), 'ReplicaDispatchService requires systemTableCache'),
  MISSING_CACHE_GET: stryMutAct_9fa48("72457") ? "" : (stryCov_9fa48("72457"), 'ReplicaDispatchService requires systemTableCache.get'),
  MISSING_CACHE_GET_ALL: stryMutAct_9fa48("72458") ? "" : (stryCov_9fa48("72458"), 'ReplicaDispatchService requires systemTableCache.getAll'),
  MISSING_COORDINATOR: stryMutAct_9fa48("72459") ? "" : (stryCov_9fa48("72459"), 'ReplicaDispatchService requires rebalanceCoordinator'),
  METADATA_FORWARD_PATH_UNAVAILABLE: stryMutAct_9fa48("72460") ? "" : (stryCov_9fa48("72460"), 'ReplicaDispatchService requires canonical metadata ingress forwarding support'),
  NODE_ROW_MISSING: stryMutAct_9fa48("72461") ? "" : (stryCov_9fa48("72461"), 'ReplicaDispatchService cannot apply NODE_STATE_UPDATE because the node row is missing'),
  NOT_INITIALIZED: stryMutAct_9fa48("72462") ? "" : (stryCov_9fa48("72462"), 'ReplicaDispatchService must be initialized before start')
}));
const DISPATCH_DEFAULT = Object.freeze(stryMutAct_9fa48("72463") ? {} : (stryCov_9fa48("72463"), {
  OPERATION_DISPATCH_QUEUE_SHARD_COUNT: 4,
  NODE_STATE_UPDATE_RETRY_AFTER_MS: 250,
  OPERATION_DISPATCH_RETRY_AFTER_MS: 250,
  OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS: 1000
}));
const DISPATCH_EVENT = Object.freeze(stryMutAct_9fa48("72464") ? {} : (stryCov_9fa48("72464"), {
  OPERATION_DISPATCHED: stryMutAct_9fa48("72465") ? "" : (stryCov_9fa48("72465"), 'operationDispatched'),
  OPERATION_FAILED: stryMutAct_9fa48("72466") ? "" : (stryCov_9fa48("72466"), 'operationFailed')
}));
export { DISPATCH_SUBSYSTEM, DISPATCH_STATE, DISPATCH_LOG_MSG, DISPATCH_ERROR_MSG, DISPATCH_DEFAULT, DISPATCH_EVENT, DISPATCH_QUEUE_NAME };