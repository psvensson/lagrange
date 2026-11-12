// Remove safety's serialization floor: a removal waits while another
// membership change of the same entity is in flight. "None in flight" is an
// owner answer, never a projection: the operation ledger owner's entity read
// (getOperationsByEntityAuthoritativeObservation) is consumed, and a read it
// did not answer (DEFERRED: failed, lagging, recovery-deferred) is the named
// UNOBSERVED wait, not an empty ledger. The cache projection was read here
// before: an empty or lagging projection let a removal run concurrently with
// another membership change of its entity.
//
// What re-asks: the deferred evaluation re-enters through the remove-safety
// deferral (REMOVE_SAFETY_BLOCKED / REPLACE_REMOVE_SAFETY_BLOCKED), the same
// re-drive every other unavailable removal floor takes. What breaks the
// recovery cycle: the replica_operations owner lane is restored by ADD
// admission and leadership (the emergency priority lane), neither of which
// passes this removal floor.
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  OperationType,
  REBALANCE_COORDINATOR_DEFER_REASON,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const CONCURRENT_ENTITY_OPERATION_STATE = Object.freeze({
  NONE: 'none',
  ACTIVE: 'active',
  UNOBSERVED: 'unobserved',
});

const CONCURRENT_OPERATION_UNOBSERVED_MESSAGE =
  'Safety check waits: the operation ledger owner did not answer whether ' +
  'another operation of the entity is in flight, ';

/**
 * Whether one ledger row is a concurrent membership change that holds this
 * removal. Not one: this operation itself, a terminal row, a row past its
 * step timeout (CL-043: a persist-failed row is a reaper candidate), a row
 * whose move target fails a live ping (CL-044: no progress, and the voter,
 * membership and peer floors still protect quorum).
 * @param {Object} context
 * @param {Object} operation
 * @param {Object} candidate
 * @param {number} nowMs
 * @return {Promise<boolean>}
 */
async function isHoldingConcurrentOperation(context, operation, candidate, nowMs) {
  if (candidate.operationId === operation.operationId ||
      context.repository.isOperationTerminal(candidate) ||
      context.isConcurrentOperationStalePastStepTimeout(candidate, nowMs)) {
    return false;
  }
  return !(await context.isConcurrentOperationTargetUncontactable(candidate));
}

/**
 * The entity's concurrent membership change, as the ledger owner answers it.
 * @param {Object} context
 * @param {Object} operation
 * @param {{entityType: string, entityId: string}} identity
 * @return {Promise<{state: string, operation: (Object|null),
 *   observation: Object}>}
 */
async function observeConcurrentEntityOperation(context, operation, identity) {
  const observation =
    await context.repository.getOperationsByEntityAuthoritativeObservation(
      identity.entityType, identity.entityId);
  if (observation.state === INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED) {
    return Object.freeze({
      state: CONCURRENT_ENTITY_OPERATION_STATE.UNOBSERVED,
      operation: null,
      observation,
    });
  }
  const nowMs = context.resolveTimeoutCheckNowMs();
  for (const candidate of observation.operations) {
    if (await isHoldingConcurrentOperation(context, operation, candidate, nowMs)) {
      return Object.freeze({
        state: CONCURRENT_ENTITY_OPERATION_STATE.ACTIVE,
        operation: candidate,
        observation,
      });
    }
  }
  return Object.freeze({
    state: CONCURRENT_ENTITY_OPERATION_STATE.NONE,
    operation: null,
    observation,
  });
}

/**
 * The remove-safety answer of the serialization floor: null when no
 * concurrent operation holds the removal, else its DEFER (or the owner's
 * FAIL for a removal that is not deferrable while another runs).
 * @param {Object} context
 * @param {Object} operation
 * @param {{entityType: string, entityId: string}} identity
 * @return {Promise<Object|null>}
 */
async function evaluateConcurrentOperationRemoveSafety(
  context, operation, identity) {
  const concurrency =
    await observeConcurrentEntityOperation(context, operation, identity);
  if (concurrency.state === CONCURRENT_ENTITY_OPERATION_STATE.UNOBSERVED) {
    // Unavailability waits; it never fails the removal.
    return context.buildDeferredRemoveSafetyEvaluation(
      `${CONCURRENT_OPERATION_UNOBSERVED_MESSAGE}` +
        `${identity.entityType}:${identity.entityId}`,
      operation.type === OperationType.REPLACE ?
        REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED :
        REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED,
    );
  }
  if (concurrency.state === CONCURRENT_ENTITY_OPERATION_STATE.ACTIVE) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      `Safety check failed: concurrent ${identity.entityType} operation ` +
        `${concurrency.operation.operationId} is active`,
    );
  }
  return null;
}

export {evaluateConcurrentOperationRemoveSafety};
