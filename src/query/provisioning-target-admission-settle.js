// The one path by which table provisioning asks the operation-creation
// admission owner about one founding target and settles the answer.
//
// The admission owner re-reads the readiness planning identity after its
// gates' awaits and DEFERS (readiness_planning_identity_changed) when it
// moved: a statement about the cluster changing during the check, never
// about the target. Provisioning used to record that deferral as a final
// per-target rejection, and a three-replica table was then founded with two
// members because two still met quorum (lab: 6 of 11 tree runs).
//
// Here a denial is classified by the admission owner's own classifier
// (classifyOperationCreationAdmissionDenial):
//  - REFUSED: a gate answered about the move. Final for this statement.
//  - TRANSIENT_REENTER: the owner deferred on its own planning identity or
//    route. Before re-entering, the settle waits for what the owner names as
//    clearing that reason (awaitOperationCreationAdmissionClearance): an
//    identity_changed denial re-enters at once (it carries the identity
//    current at its end); identity_unavailable waits for the node's planning
//    identity to become current (snapshot publication / classified cache
//    change); route_unavailable waits for a change of the rows routing is
//    resolved from. A denial answered before any await can therefore never
//    re-enter in a microtask loop that starves the timers, I/O and cache
//    applies that alone can clear it.
// Every wait and re-entry is bounded by the statement's own budget and ended
// by its cancellation token. Without a budget (an unbudgeted probe) at most
// one immediate re-entry is made and no event is waited for. A target still
// deferred when the bound is spent is UNSETTLED: never a rejection, so a
// consumer can never found a smaller cohort on it.
//
// Explicit-context module: every function takes the SQL engine first.
import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {throwIfCancellationRequested} from './query-cancellation.js';
import {
  OPERATION_CREATION_ADMISSION_DENIAL_CLASS,
  classifyOperationCreationAdmissionDenial,
} from '../rebalancer/rebalance-coordinator-operation-creation-admission.js';
import {
  OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME,
  awaitOperationCreationAdmissionClearance,
} from '../rebalancer/operation-creation-admission-clearance.js';

const {
  CONTROL_PLANE_MUTATION_WORK_CLASS,
  OperationType,
  SERVICE_TYPE,
  getRemainingBudgetMs,
} = SQL_QUERY_ENGINE_SHARED;

const PROVISIONING_TARGET_ADMISSION_STATE = Object.freeze({
  ADMITTED: 'admitted',
  REFUSED: 'refused',
  UNSETTLED: 'unsettled',
});
const UNBUDGETED_REENTRY_LIMIT = 1;
const PROVISIONING_ADMISSION_REENTRY_LOG_MSG =
  'Re-entering provisioning target admission after a transient deferral';
const LOCAL_STR_OBJECT = 'object';

function buildAdmissionMove(request) {
  return {
    type: OperationType.ADD,
    partitionId: request.partitionId,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: request.partitionId,
    nodeId: request.targetNodeId,
    controlPlaneMutationWorkClass:
      CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE,
    operationIntentId: request.childIntent.operationIntentId,
    replicaIntentId: request.childIntent.replicaIntentId,
  };
}

// The decision shape of the re-entry error the creation boundary throws
// (createOperationCreationAdmissionReentryError states every field).
function buildDenialDecision(error) {
  return {
    allowed: false,
    admissionResult: error.admissionResult,
    reasonCodes: error.reasonCodes,
    moveIdentity: error.moveIdentity,
    routeObservation: error.routeObservation,
    error,
  };
}

// One admission check. The owner answers every gate's denial as an
// observation (observeOperationCreationAdmission); anything it throws is a
// failure of the check itself and propagates.
function checkProvisioningTargetOnce(engine, request) {
  return engine.rebalanceCoordinator.checkProvisioningAdmission(
    buildAdmissionMove(request),
  );
}

/**
 * The statement's remaining budget, or null when it has none.
 * @param {Object} engine
 * @param {Object|null} timeoutBudget
 * @return {number|null}
 */
function readRemainingBudgetMs(engine, timeoutBudget) {
  if (!timeoutBudget || typeof timeoutBudget !== LOCAL_STR_OBJECT) {
    return null;
  }
  return getRemainingBudgetMs(timeoutBudget, {now: engine.nowFn});
}

/**
 * Wait for what clears one transient denial, within the bound. Returns
 * whether admission may be re-entered.
 * @param {Object} engine
 * @param {Object} request
 * @param {Object} denial
 * @param {Object} options
 * @param {number} reentries already made
 * @return {Promise<boolean>}
 */
async function awaitReentry(engine, request, denial, options, reentries) {
  const remainingBudgetMs =
    readRemainingBudgetMs(engine, options.timeoutBudget);
  if (remainingBudgetMs === null ? reentries >= UNBUDGETED_REENTRY_LIMIT :
    remainingBudgetMs <= 0) {
    return false;
  }
  const clearance = await awaitOperationCreationAdmissionClearance(
    engine.rebalanceCoordinator, denial, {
      nodeId: request.targetNodeId,
      remainingBudgetMs,
      cancellationToken: options.cancellationToken || null,
    });
  throwIfCancellationRequested(options.cancellationToken);
  return clearance.outcome ===
    OPERATION_CREATION_ADMISSION_CLEARANCE_OUTCOME.CLEARED;
}

/**
 * Ask admission about one founding target until the answer settles.
 * @param {Object} engine
 * @param {Object} request
 * @param {string} request.partitionId
 * @param {string} request.targetNodeId
 * @param {Object} request.childIntent
 * @param {Object} [options]
 * @param {Object|null} [options.timeoutBudget]
 * @param {Object|null} [options.cancellationToken]
 * @param {Error|null} [options.priorDenial] a transient re-entry error the
 *   creation boundary threw; its clearance is awaited before the first check
 * @return {Promise<{state: string, decision: Object, reentries: number}>}
 */
async function settleProvisioningTargetAdmission(engine, request, options = {}) {
  let reentries = 0;
  let denial = options.priorDenial ?
    buildDenialDecision(options.priorDenial) : null;
  for (;;) {
    if (denial) {
      if (!await awaitReentry(engine, request, denial, options, reentries)) {
        return {state: PROVISIONING_TARGET_ADMISSION_STATE.UNSETTLED,
          decision: denial, reentries};
      }
      reentries += 1;
      engine.logger?.debug?.(PROVISIONING_ADMISSION_REENTRY_LOG_MSG, {
        partitionId: request.partitionId,
        targetNodeId: request.targetNodeId,
        reentries,
        reasonCodes: [...denial.reasonCodes],
      });
    }
    throwIfCancellationRequested(options.cancellationToken);
    const decision = await checkProvisioningTargetOnce(engine, request);
    if (decision?.allowed === true) {
      return {state: PROVISIONING_TARGET_ADMISSION_STATE.ADMITTED, decision,
        reentries};
    }
    if (classifyOperationCreationAdmissionDenial(decision) !==
        OPERATION_CREATION_ADMISSION_DENIAL_CLASS.TRANSIENT_REENTER) {
      return {state: PROVISIONING_TARGET_ADMISSION_STATE.REFUSED, decision,
        reentries};
    }
    denial = decision;
  }
}

export {
  PROVISIONING_TARGET_ADMISSION_STATE,
  settleProvisioningTargetAdmission,
};
