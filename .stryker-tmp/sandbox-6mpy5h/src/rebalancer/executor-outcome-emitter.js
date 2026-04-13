/**
 * ExecutorOutcomeEmitter — shared mechanism for executor-side components
 * to report typed outcomes to the workflow owner (RebalanceCoordinator).
 *
 * This replaces the triplicated updateOperationStep logic that previously
 * existed in ReplicaHandler, MessageGroupServiceHandler, and
 * RuntimeServiceHandler. Those handlers no longer write to
 * replica_operations directly; instead they emit typed outcome records
 * through this emitter.
 *
 * The coordinator consumes these outcomes through the owner-key reconcile
 * queue (wired in Task 3.2) and decides whether to transition the
 * workflow.
 *
 * Design reference: §2 — replica_operations single-writer cutover.
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
import { EventEmitter } from 'events';
import { EXECUTOR_OUTCOME_FIELD, EXECUTOR_OUTCOME_LOG_MSG } from './executor-outcome-constants.js';
const OUTCOME_EVENT_NAME = stryMutAct_9fa48("130078") ? "" : (stryCov_9fa48("130078"), 'executorOutcome');

/**
 * Builds a typed executor outcome payload.
 *
 * @param {string} outcomeType - One of EXECUTOR_OUTCOME_TYPE values.
 * @param {string} operationId - The replica operation ID.
 * @param {string} workflowStep - The WORKFLOW_STEP the executor reached.
 * @param {Object} [options] - Optional fields.
 * @param {string} [options.replicaId] - Replica ID if applicable.
 * @param {string} [options.errorMessage] - Error message if failed.
 * @return {Object} Frozen outcome payload.
 */
function buildExecutorOutcome(outcomeType, operationId, workflowStep, options = {}) {
  if (stryMutAct_9fa48("130079")) {
    {}
  } else {
    stryCov_9fa48("130079");
    const outcome = stryMutAct_9fa48("130080") ? {} : (stryCov_9fa48("130080"), {
      [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]: outcomeType,
      [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: operationId,
      [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: workflowStep,
      [EXECUTOR_OUTCOME_FIELD.TIMESTAMP]: Date.now()
    });
    if (stryMutAct_9fa48("130082") ? false : stryMutAct_9fa48("130081") ? true : (stryCov_9fa48("130081", "130082"), options.replicaId)) {
      if (stryMutAct_9fa48("130083")) {
        {}
      } else {
        stryCov_9fa48("130083");
        outcome[EXECUTOR_OUTCOME_FIELD.REPLICA_ID] = options.replicaId;
      }
    }
    if (stryMutAct_9fa48("130085") ? false : stryMutAct_9fa48("130084") ? true : (stryCov_9fa48("130084", "130085"), options.errorMessage)) {
      if (stryMutAct_9fa48("130086")) {
        {}
      } else {
        stryCov_9fa48("130086");
        outcome[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE] = options.errorMessage;
      }
    }
    return Object.freeze(outcome);
  }
}

/**
 * Shared executor outcome emitter.
 *
 * Executor handlers hold a reference to a single shared instance and
 * call {@link ExecutorOutcomeEmitter#emitOutcome} instead of writing
 * to replica_operations. The coordinator subscribes to the
 * `executorOutcome` event.
 */
class ExecutorOutcomeEmitter extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("130087")) {
      {}
    } else {
      stryCov_9fa48("130087");
      super();
      this.logger = stryMutAct_9fa48("130090") ? options.logger && console : stryMutAct_9fa48("130089") ? false : stryMutAct_9fa48("130088") ? true : (stryCov_9fa48("130088", "130089", "130090"), options.logger || console);
    }
  }

  /**
   * Emit a typed executor outcome.
   *
   * @param {string} outcomeType - EXECUTOR_OUTCOME_TYPE value.
   * @param {string} operationId - Replica operation ID.
   * @param {string} workflowStep - WORKFLOW_STEP the executor reached.
   * @param {Object} [options] - Optional replicaId, errorMessage.
   */
  emitOutcome(outcomeType, operationId, workflowStep, options = {}) {
    if (stryMutAct_9fa48("130091")) {
      {}
    } else {
      stryCov_9fa48("130091");
      if (stryMutAct_9fa48("130094") ? false : stryMutAct_9fa48("130093") ? true : stryMutAct_9fa48("130092") ? operationId : (stryCov_9fa48("130092", "130093", "130094"), !operationId)) {
        if (stryMutAct_9fa48("130095")) {
          {}
        } else {
          stryCov_9fa48("130095");
          this.logger.debug(EXECUTOR_OUTCOME_LOG_MSG.OUTCOME_EMIT_SKIPPED, stryMutAct_9fa48("130096") ? {} : (stryCov_9fa48("130096"), {
            outcomeType,
            workflowStep
          }));
          return;
        }
      }
      const outcome = buildExecutorOutcome(outcomeType, operationId, workflowStep, options);
      this.logger.debug(EXECUTOR_OUTCOME_LOG_MSG.OUTCOME_EMITTED, stryMutAct_9fa48("130097") ? {} : (stryCov_9fa48("130097"), {
        outcomeType: outcome.outcomeType,
        operationId: outcome.operationId,
        workflowStep: outcome.workflowStep,
        replicaId: outcome.replicaId
      }));
      this.emit(OUTCOME_EVENT_NAME, outcome);
    }
  }
}
export { ExecutorOutcomeEmitter, buildExecutorOutcome, OUTCOME_EVENT_NAME };