/**
 * Typed executor outcome constants for replica operation handlers.
 *
 * Executor-side components (ReplicaHandler, MessageGroupServiceHandler,
 * RuntimeServiceHandler) emit these outcomes instead of directly mutating
 * coordinator-owned workflow fields on replica_operations rows.
 *
 * The RebalanceCoordinator consumes these outcomes through the owner-key
 * reconcile path and decides whether to transition the workflow.
 */
// @ts-nocheck


/**
 * Executor outcome types — one constant per semantic executor boundary.
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
const EXECUTOR_OUTCOME_TYPE = Object.freeze(stryMutAct_9fa48("130036") ? {} : (stryCov_9fa48("130036"), {
  // Partition replica outcomes (ReplicaHandler)
  REPLICA_CREATE_SYNCING: stryMutAct_9fa48("130037") ? "" : (stryCov_9fa48("130037"), 'REPLICA_CREATE_SYNCING'),
  REPLICA_CREATE_ACTIVE: stryMutAct_9fa48("130038") ? "" : (stryCov_9fa48("130038"), 'REPLICA_CREATE_ACTIVE'),
  REPLICA_CREATE_FAILED: stryMutAct_9fa48("130039") ? "" : (stryCov_9fa48("130039"), 'REPLICA_CREATE_FAILED'),
  REPLICA_REMOVE_COMPLETED: stryMutAct_9fa48("130040") ? "" : (stryCov_9fa48("130040"), 'REPLICA_REMOVE_COMPLETED'),
  REPLICA_REMOVE_FAILED: stryMutAct_9fa48("130041") ? "" : (stryCov_9fa48("130041"), 'REPLICA_REMOVE_FAILED'),
  // Message group replica outcomes (MessageGroupServiceHandler)
  MESSAGE_GROUP_CREATE_ACTIVE: stryMutAct_9fa48("130042") ? "" : (stryCov_9fa48("130042"), 'MESSAGE_GROUP_CREATE_ACTIVE'),
  MESSAGE_GROUP_CREATE_FAILED: stryMutAct_9fa48("130043") ? "" : (stryCov_9fa48("130043"), 'MESSAGE_GROUP_CREATE_FAILED'),
  MESSAGE_GROUP_REMOVE_COMPLETED: stryMutAct_9fa48("130044") ? "" : (stryCov_9fa48("130044"), 'MESSAGE_GROUP_REMOVE_COMPLETED'),
  MESSAGE_GROUP_REMOVE_FAILED: stryMutAct_9fa48("130045") ? "" : (stryCov_9fa48("130045"), 'MESSAGE_GROUP_REMOVE_FAILED'),
  // Runtime service replica outcomes (RuntimeServiceHandler)
  RUNTIME_SERVICE_CREATE_ACTIVE: stryMutAct_9fa48("130046") ? "" : (stryCov_9fa48("130046"), 'RUNTIME_SERVICE_CREATE_ACTIVE'),
  RUNTIME_SERVICE_CREATE_FAILED: stryMutAct_9fa48("130047") ? "" : (stryCov_9fa48("130047"), 'RUNTIME_SERVICE_CREATE_FAILED'),
  RUNTIME_SERVICE_REMOVE_COMPLETED: stryMutAct_9fa48("130048") ? "" : (stryCov_9fa48("130048"), 'RUNTIME_SERVICE_REMOVE_COMPLETED'),
  RUNTIME_SERVICE_REMOVE_FAILED: stryMutAct_9fa48("130049") ? "" : (stryCov_9fa48("130049"), 'RUNTIME_SERVICE_REMOVE_FAILED')
}));

/**
 * Executor outcome field names — canonical property names for outcome
 * payloads.
 * @enum {string}
 */
const EXECUTOR_OUTCOME_FIELD = Object.freeze(stryMutAct_9fa48("130050") ? {} : (stryCov_9fa48("130050"), {
  OPERATION_ID: stryMutAct_9fa48("130051") ? "" : (stryCov_9fa48("130051"), 'operationId'),
  OUTCOME_TYPE: stryMutAct_9fa48("130052") ? "" : (stryCov_9fa48("130052"), 'outcomeType'),
  WORKFLOW_STEP: stryMutAct_9fa48("130053") ? "" : (stryCov_9fa48("130053"), 'workflowStep'),
  REPLICA_ID: stryMutAct_9fa48("130054") ? "" : (stryCov_9fa48("130054"), 'replicaId'),
  ERROR_MESSAGE: stryMutAct_9fa48("130055") ? "" : (stryCov_9fa48("130055"), 'errorMessage'),
  TIMESTAMP: stryMutAct_9fa48("130056") ? "" : (stryCov_9fa48("130056"), 'timestamp')
}));

/**
 * Coordinator actions that map from executor outcome types.
 * The coordinator uses this to decide which transition method to call.
 * @enum {string}
 */
const EXECUTOR_OUTCOME_ACTION = Object.freeze(stryMutAct_9fa48("130057") ? {} : (stryCov_9fa48("130057"), {
  UPDATE_STEP: stryMutAct_9fa48("130058") ? "" : (stryCov_9fa48("130058"), 'updateStep'),
  COMPLETE: stryMutAct_9fa48("130059") ? "" : (stryCov_9fa48("130059"), 'complete'),
  FAIL: stryMutAct_9fa48("130060") ? "" : (stryCov_9fa48("130060"), 'fail')
}));

/**
 * Maps each executor outcome type to the coordinator action and
 * target workflow step. The coordinator consumes this mapping in the
 * owner-key reconcile handler.
 */
const EXECUTOR_OUTCOME_ACTION_MAP = Object.freeze(stryMutAct_9fa48("130061") ? {} : (stryCov_9fa48("130061"), {
  [EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING]: Object.freeze(stryMutAct_9fa48("130062") ? {} : (stryCov_9fa48("130062"), {
    action: EXECUTOR_OUTCOME_ACTION.UPDATE_STEP
  })),
  [EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE]: Object.freeze(stryMutAct_9fa48("130063") ? {} : (stryCov_9fa48("130063"), {
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE
  })),
  [EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED]: Object.freeze(stryMutAct_9fa48("130064") ? {} : (stryCov_9fa48("130064"), {
    action: EXECUTOR_OUTCOME_ACTION.FAIL
  })),
  [EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED]: Object.freeze(stryMutAct_9fa48("130065") ? {} : (stryCov_9fa48("130065"), {
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE
  })),
  [EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED]: Object.freeze(stryMutAct_9fa48("130066") ? {} : (stryCov_9fa48("130066"), {
    action: EXECUTOR_OUTCOME_ACTION.FAIL
  })),
  [EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_ACTIVE]: Object.freeze(stryMutAct_9fa48("130067") ? {} : (stryCov_9fa48("130067"), {
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE
  })),
  [EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_FAILED]: Object.freeze(stryMutAct_9fa48("130068") ? {} : (stryCov_9fa48("130068"), {
    action: EXECUTOR_OUTCOME_ACTION.FAIL
  })),
  [EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_REMOVE_COMPLETED]: Object.freeze(stryMutAct_9fa48("130069") ? {} : (stryCov_9fa48("130069"), {
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE
  })),
  [EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_REMOVE_FAILED]: Object.freeze(stryMutAct_9fa48("130070") ? {} : (stryCov_9fa48("130070"), {
    action: EXECUTOR_OUTCOME_ACTION.FAIL
  })),
  [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE]: Object.freeze(stryMutAct_9fa48("130071") ? {} : (stryCov_9fa48("130071"), {
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE
  })),
  [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED]: Object.freeze(stryMutAct_9fa48("130072") ? {} : (stryCov_9fa48("130072"), {
    action: EXECUTOR_OUTCOME_ACTION.FAIL
  })),
  [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_COMPLETED]: Object.freeze(stryMutAct_9fa48("130073") ? {} : (stryCov_9fa48("130073"), {
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE
  })),
  [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_FAILED]: Object.freeze(stryMutAct_9fa48("130074") ? {} : (stryCov_9fa48("130074"), {
    action: EXECUTOR_OUTCOME_ACTION.FAIL
  }))
}));

/**
 * Log messages for executor outcome emission.
 * @enum {string}
 */
const EXECUTOR_OUTCOME_LOG_MSG = Object.freeze(stryMutAct_9fa48("130075") ? {} : (stryCov_9fa48("130075"), {
  OUTCOME_EMITTED: stryMutAct_9fa48("130076") ? "" : (stryCov_9fa48("130076"), 'Executor outcome emitted'),
  OUTCOME_EMIT_SKIPPED: stryMutAct_9fa48("130077") ? "" : (stryCov_9fa48("130077"), 'Executor outcome emission skipped: no operationId')
}));
export { EXECUTOR_OUTCOME_TYPE, EXECUTOR_OUTCOME_FIELD, EXECUTOR_OUTCOME_ACTION, EXECUTOR_OUTCOME_ACTION_MAP, EXECUTOR_OUTCOME_LOG_MSG };