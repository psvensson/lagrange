/**
 * Typed participant acknowledgement constants for rebalance executors.
 *
 * Rebalance executor components (ReplicaHandler, MessageGroupServiceHandler,
 * RuntimeServiceHandler) produce acknowledgement payloads that flow through
 * the owner-key reconcile queue to RebalanceCoordinator.
 *
 * Payloads compose with PARTICIPANT_ACK_FIELD from workflow-constants.js
 * for the canonical field names (workflowId, participantKey, fenceToken,
 * status, checkpoint, acknowledgedAt).
 *
 * Requirements: 1, 3, 8
 * Design: §1, §2, §4
 */
// @ts-nocheck


/**
 * Participant status values for rebalance executor acknowledgements.
 *
 * Each value represents a semantic executor boundary that the coordinator
 * uses to decide whether to advance the workflow.
 *
 * @enum {string}
 */function stryNS_9fa48() {
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
const REBALANCE_ACK_STATUS = Object.freeze(stryMutAct_9fa48("135443") ? {} : (stryCov_9fa48("135443"), {
  // Partition replica acknowledgements
  REPLICA_CREATE_STARTED: stryMutAct_9fa48("135444") ? "" : (stryCov_9fa48("135444"), 'replica_create_started'),
  REPLICA_CREATE_SYNCING: stryMutAct_9fa48("135445") ? "" : (stryCov_9fa48("135445"), 'replica_create_syncing'),
  REPLICA_CREATE_ACTIVE: stryMutAct_9fa48("135446") ? "" : (stryCov_9fa48("135446"), 'replica_create_active'),
  REPLICA_CREATE_FAILED: stryMutAct_9fa48("135447") ? "" : (stryCov_9fa48("135447"), 'replica_create_failed'),
  REPLICA_REMOVE_COMPLETED: stryMutAct_9fa48("135448") ? "" : (stryCov_9fa48("135448"), 'replica_remove_completed'),
  REPLICA_REMOVE_FAILED: stryMutAct_9fa48("135449") ? "" : (stryCov_9fa48("135449"), 'replica_remove_failed'),
  // Message group replica acknowledgements
  MESSAGE_GROUP_CREATE_ACTIVE: stryMutAct_9fa48("135450") ? "" : (stryCov_9fa48("135450"), 'message_group_create_active'),
  MESSAGE_GROUP_CREATE_FAILED: stryMutAct_9fa48("135451") ? "" : (stryCov_9fa48("135451"), 'message_group_create_failed'),
  MESSAGE_GROUP_REMOVE_COMPLETED: stryMutAct_9fa48("135452") ? "" : (stryCov_9fa48("135452"), 'message_group_remove_completed'),
  MESSAGE_GROUP_REMOVE_FAILED: stryMutAct_9fa48("135453") ? "" : (stryCov_9fa48("135453"), 'message_group_remove_failed'),
  // Runtime service replica acknowledgements
  RUNTIME_SERVICE_CREATE_ACTIVE: stryMutAct_9fa48("135454") ? "" : (stryCov_9fa48("135454"), 'runtime_service_create_active'),
  RUNTIME_SERVICE_CREATE_FAILED: stryMutAct_9fa48("135455") ? "" : (stryCov_9fa48("135455"), 'runtime_service_create_failed'),
  RUNTIME_SERVICE_REMOVE_COMPLETED: stryMutAct_9fa48("135456") ? "" : (stryCov_9fa48("135456"), 'runtime_service_remove_completed'),
  RUNTIME_SERVICE_REMOVE_FAILED: stryMutAct_9fa48("135457") ? "" : (stryCov_9fa48("135457"), 'runtime_service_remove_failed')
}));

/**
 * Terminal status values for rebalance acknowledgements.
 * An acknowledgement with one of these statuses indicates the executor
 * has reached a final state for its participant boundary.
 *
 * @type {ReadonlySet<string>}
 */
const REBALANCE_ACK_TERMINAL_STATUSES = Object.freeze(new Set(stryMutAct_9fa48("135458") ? [] : (stryCov_9fa48("135458"), [REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE, REBALANCE_ACK_STATUS.REPLICA_CREATE_FAILED, REBALANCE_ACK_STATUS.REPLICA_REMOVE_COMPLETED, REBALANCE_ACK_STATUS.REPLICA_REMOVE_FAILED, REBALANCE_ACK_STATUS.MESSAGE_GROUP_CREATE_ACTIVE, REBALANCE_ACK_STATUS.MESSAGE_GROUP_CREATE_FAILED, REBALANCE_ACK_STATUS.MESSAGE_GROUP_REMOVE_COMPLETED, REBALANCE_ACK_STATUS.MESSAGE_GROUP_REMOVE_FAILED, REBALANCE_ACK_STATUS.RUNTIME_SERVICE_CREATE_ACTIVE, REBALANCE_ACK_STATUS.RUNTIME_SERVICE_CREATE_FAILED, REBALANCE_ACK_STATUS.RUNTIME_SERVICE_REMOVE_COMPLETED, REBALANCE_ACK_STATUS.RUNTIME_SERVICE_REMOVE_FAILED])));

/**
 * Failure status values for rebalance acknowledgements.
 *
 * @type {ReadonlySet<string>}
 */
const REBALANCE_ACK_FAILURE_STATUSES = Object.freeze(new Set(stryMutAct_9fa48("135459") ? [] : (stryCov_9fa48("135459"), [REBALANCE_ACK_STATUS.REPLICA_CREATE_FAILED, REBALANCE_ACK_STATUS.REPLICA_REMOVE_FAILED, REBALANCE_ACK_STATUS.MESSAGE_GROUP_CREATE_FAILED, REBALANCE_ACK_STATUS.MESSAGE_GROUP_REMOVE_FAILED, REBALANCE_ACK_STATUS.RUNTIME_SERVICE_CREATE_FAILED, REBALANCE_ACK_STATUS.RUNTIME_SERVICE_REMOVE_FAILED])));

/**
 * Checkpoint field names specific to rebalance acknowledgement payloads.
 * These extend the generic PARTICIPANT_ACK_FIELD.CHECKPOINT object
 * with rebalance-specific progress data.
 *
 * @enum {string}
 */
const REBALANCE_ACK_CHECKPOINT_FIELD = Object.freeze(stryMutAct_9fa48("135460") ? {} : (stryCov_9fa48("135460"), {
  OPERATION_ID: stryMutAct_9fa48("135461") ? "" : (stryCov_9fa48("135461"), 'operationId'),
  WORKFLOW_STEP: stryMutAct_9fa48("135462") ? "" : (stryCov_9fa48("135462"), 'workflowStep'),
  REPLICA_ID: stryMutAct_9fa48("135463") ? "" : (stryCov_9fa48("135463"), 'replicaId'),
  ERROR_MESSAGE: stryMutAct_9fa48("135464") ? "" : (stryCov_9fa48("135464"), 'errorMessage')
}));

/**
 * Log messages for rebalance participant acknowledgement processing.
 *
 * @enum {string}
 */
const REBALANCE_ACK_LOG_MSG = Object.freeze(stryMutAct_9fa48("135465") ? {} : (stryCov_9fa48("135465"), {
  ACK_RECEIVED: stryMutAct_9fa48("135466") ? "" : (stryCov_9fa48("135466"), 'Rebalance participant acknowledgement received'),
  ACK_ACCEPTED: stryMutAct_9fa48("135467") ? "" : (stryCov_9fa48("135467"), 'Rebalance participant acknowledgement accepted'),
  ACK_STALE_FENCE: stryMutAct_9fa48("135468") ? "" : (stryCov_9fa48("135468"), 'Rebalance participant acknowledgement rejected: stale fence'),
  ACK_DUPLICATE: stryMutAct_9fa48("135469") ? "" : (stryCov_9fa48("135469"), 'Rebalance participant acknowledgement rejected: duplicate'),
  ACK_NOT_FOUND: stryMutAct_9fa48("135470") ? "" : (stryCov_9fa48("135470"), 'Rebalance participant acknowledgement rejected: participant not found')
}));
export { REBALANCE_ACK_STATUS, REBALANCE_ACK_TERMINAL_STATUSES, REBALANCE_ACK_FAILURE_STATUSES, REBALANCE_ACK_CHECKPOINT_FIELD, REBALANCE_ACK_LOG_MSG };