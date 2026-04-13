/**
 * Constants for OwnerKeyReconcileQueue.
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
const RECONCILE_QUEUE_SUBSYSTEM = stryMutAct_9fa48("167116") ? "" : (stryCov_9fa48("167116"), 'owner-key-reconcile-queue');

/**
 * Typed reason codes for enqueued reconcile work items.
 * Each reason identifies the trigger that caused the enqueue.
 */
const RECONCILE_REASON = Object.freeze(stryMutAct_9fa48("167117") ? {} : (stryCov_9fa48("167117"), {
  // Dispatch: operation-level reasons
  COORDINATOR_OPERATION_CREATED: stryMutAct_9fa48("167118") ? "" : (stryCov_9fa48("167118"), 'coordinator_operation_created'),
  CDC_OPERATION_PENDING: stryMutAct_9fa48("167119") ? "" : (stryCov_9fa48("167119"), 'cdc_operation_pending'),
  CDC_REPLACE_ACTIVE: stryMutAct_9fa48("167120") ? "" : (stryCov_9fa48("167120"), 'cdc_replace_active'),
  REPLICA_OPERATIONS_CACHE_PENDING: stryMutAct_9fa48("167121") ? "" : (stryCov_9fa48("167121"), 'replica_operations_cache_pending'),
  REPLICA_OPERATIONS_CACHE_REPLACE_ACTIVE: stryMutAct_9fa48("167122") ? "" : (stryCov_9fa48("167122"), 'replica_operations_cache_replace_active'),
  MESSAGE_DISPATCH_REQUEST: stryMutAct_9fa48("167123") ? "" : (stryCov_9fa48("167123"), 'message_dispatch_request'),
  RETRYABLE_OPERATION_DISPATCH: stryMutAct_9fa48("167124") ? "" : (stryCov_9fa48("167124"), 'retryable_operation_dispatch'),
  NODE_STATE_UPDATE_MESSAGE: stryMutAct_9fa48("167125") ? "" : (stryCov_9fa48("167125"), 'node_state_update_message'),
  // Dispatch: node-ready retry reasons
  NODE_STATE_UPDATE_READY: stryMutAct_9fa48("167126") ? "" : (stryCov_9fa48("167126"), 'node_state_update_ready'),
  NODE_READY_DISPATCH_RETRY: stryMutAct_9fa48("167127") ? "" : (stryCov_9fa48("167127"), 'node_ready_dispatch_retry'),
  NODES_CDC_READY: stryMutAct_9fa48("167128") ? "" : (stryCov_9fa48("167128"), 'nodes_cdc_ready'),
  NODES_CACHE_READY: stryMutAct_9fa48("167129") ? "" : (stryCov_9fa48("167129"), 'nodes_cache_ready'),
  SERVICES_CACHE_ACTIVE: stryMutAct_9fa48("167130") ? "" : (stryCov_9fa48("167130"), 'services_cache_active'),
  // Rebalance: planning-level reasons
  PERIODIC_CHECK: stryMutAct_9fa48("167131") ? "" : (stryCov_9fa48("167131"), 'periodic_check'),
  NODE_BECAME_READY: stryMutAct_9fa48("167132") ? "" : (stryCov_9fa48("167132"), 'node_became_ready'),
  NODE_LEFT_READY: stryMutAct_9fa48("167133") ? "" : (stryCov_9fa48("167133"), 'node_left_ready'),
  NODE_FAILED: stryMutAct_9fa48("167134") ? "" : (stryCov_9fa48("167134"), 'node_failed'),
  BOOTSTRAP_NODE_READY: stryMutAct_9fa48("167135") ? "" : (stryCov_9fa48("167135"), 'bootstrap_node_ready'),
  LEADER_ELECTED: stryMutAct_9fa48("167136") ? "" : (stryCov_9fa48("167136"), 'leader_elected'),
  // Rebalance: operation execution reasons
  DISPATCH_EXECUTE: stryMutAct_9fa48("167137") ? "" : (stryCov_9fa48("167137"), 'dispatch_execute'),
  TIMEOUT_RECONCILE: stryMutAct_9fa48("167138") ? "" : (stryCov_9fa48("167138"), 'timeout_reconcile'),
  PROGRESS_RECONCILE: stryMutAct_9fa48("167139") ? "" : (stryCov_9fa48("167139"), 'progress_reconcile')
}));
const RECONCILE_QUEUE_LOG_MSG = Object.freeze(stryMutAct_9fa48("167140") ? {} : (stryCov_9fa48("167140"), {
  ENQUEUED: stryMutAct_9fa48("167141") ? "" : (stryCov_9fa48("167141"), 'Reconcile work enqueued'),
  DEDUP_MERGED: stryMutAct_9fa48("167142") ? "" : (stryCov_9fa48("167142"), 'Reconcile work merged with pending item'),
  DRAIN_START: stryMutAct_9fa48("167143") ? "" : (stryCov_9fa48("167143"), 'Reconcile queue drain started'),
  DRAIN_ITEM: stryMutAct_9fa48("167144") ? "" : (stryCov_9fa48("167144"), 'Processing reconcile queue item'),
  DRAIN_COMPLETE: stryMutAct_9fa48("167145") ? "" : (stryCov_9fa48("167145"), 'Reconcile queue drain completed'),
  DRAIN_ERROR: stryMutAct_9fa48("167146") ? "" : (stryCov_9fa48("167146"), 'Reconcile queue item processing failed'),
  IN_FLIGHT_CLAIMED: stryMutAct_9fa48("167147") ? "" : (stryCov_9fa48("167147"), 'Owner key claimed for in-flight reconcile'),
  IN_FLIGHT_RELEASED: stryMutAct_9fa48("167148") ? "" : (stryCov_9fa48("167148"), 'Owner key released from in-flight reconcile'),
  IN_FLIGHT_DEFERRED: stryMutAct_9fa48("167149") ? "" : (stryCov_9fa48("167149"), 'Owner key deferred — already in-flight'),
  STALE_FENCE_REJECTED: stryMutAct_9fa48("167150") ? "" : (stryCov_9fa48("167150"), 'Claim rejected — stale fence token'),
  SHUTDOWN: stryMutAct_9fa48("167151") ? "" : (stryCov_9fa48("167151"), 'Reconcile queue shutdown')
}));
const RECONCILE_QUEUE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("167152") ? {} : (stryCov_9fa48("167152"), {
  RECONCILE_FN_REQUIRED: stryMutAct_9fa48("167153") ? "" : (stryCov_9fa48("167153"), 'OwnerKeyReconcileQueue requires a reconcile function'),
  OWNER_KEY_REQUIRED: stryMutAct_9fa48("167154") ? "" : (stryCov_9fa48("167154"), 'OwnerKeyReconcileQueue enqueue requires an owner key'),
  STALE_FENCE_TOKEN: stryMutAct_9fa48("167155") ? "" : (stryCov_9fa48("167155"), 'OwnerKeyReconcileQueue claim rejected: stale fence token')
}));

/**
 * Typed diagnostic codes for stale-claim and in-flight guard events.
 */
const RECONCILE_QUEUE_DIAGNOSTIC = Object.freeze(stryMutAct_9fa48("167156") ? {} : (stryCov_9fa48("167156"), {
  /** Reconcile attempt rejected because the owner key is already in-flight. */
  STALE_CLAIM_IN_FLIGHT: stryMutAct_9fa48("167157") ? "" : (stryCov_9fa48("167157"), 'stale_claim_in_flight'),
  /** Claim rejected because the fence token is stale. */
  STALE_FENCE_TOKEN: stryMutAct_9fa48("167158") ? "" : (stryCov_9fa48("167158"), 'stale_fence_token')
}));

/**
 * Typed event names emitted by OwnerKeyReconcileQueue.
 * Consumers subscribe via queue.on(EVENT_NAME, handler).
 */
const RECONCILE_QUEUE_EVENT = Object.freeze(stryMutAct_9fa48("167159") ? {} : (stryCov_9fa48("167159"), {
  /** Emitted when a stale fence token is rejected at enqueue time. */
  STALE_FENCE_REJECTED_ENQUEUE: stryMutAct_9fa48("167160") ? "" : (stryCov_9fa48("167160"), 'stale_fence_rejected_enqueue'),
  /** Emitted when a stale fence token is rejected at drain time. */
  STALE_FENCE_REJECTED_DRAIN: stryMutAct_9fa48("167161") ? "" : (stryCov_9fa48("167161"), 'stale_fence_rejected_drain'),
  /** Emitted when a work item is deferred because the key is in-flight. */
  STALE_CLAIM_DEFERRED: stryMutAct_9fa48("167162") ? "" : (stryCov_9fa48("167162"), 'stale_claim_deferred')
}));

/**
 * Maximum number of recent stale-fence event samples retained
 * in the diagnostics ring buffer.
 */
const STALE_FENCE_SAMPLE_CAPACITY = 32;
export { RECONCILE_QUEUE_SUBSYSTEM, RECONCILE_REASON, RECONCILE_QUEUE_LOG_MSG, RECONCILE_QUEUE_ERROR_MSG, RECONCILE_QUEUE_DIAGNOSTIC, RECONCILE_QUEUE_EVENT, STALE_FENCE_SAMPLE_CAPACITY };