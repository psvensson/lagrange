/**
 * Owner contract:
 * Owner: the REPLACE owner's side of CANCEL_REPLICA_REMOVAL on D2 target
 * death (2026-11-11): before a post-intent REPLACE records that it retained
 * its source, the source's node cancels the source's removal and answers
 * typed (node/replica-removal-cancel-contract.js).
 * Inputs: the operation (its source replica and node), the source's
 * services row generation read authoritatively (created_at of the row the
 * removal effect published), and the source node's answer.
 * Canonical output: {answer, reason, generation}; the outcome the D2 owner
 * records from it:
 *   CANCELLED, NOT_IN_PROGRESS  TARGET_DEAD_SOURCE_RETAINED (the source
 *                               serves and stays a voter);
 *   ALREADY_REMOVED             the removal happened: never "retained". The
 *                               degraded group is reported by name
 *                               (TARGET_DEAD_SOURCE_REMOVED: the source left,
 *                               the dead target is still configured, the
 *                               group runs below its replica count until the
 *                               durability repair ADD restores it) and the
 *                               operation completes by R-1a from the
 *                               committed absence - the same terminal the
 *                               source's completed removal, or an absence
 *                               read first (P6 (c)), reaches;
 *   UNAVAILABLE (and any undelivered or untyped answer)
 *                               nothing is recorded: the owner waits
 *                               (SOURCE_REMOVAL_CANCEL_PENDING), woken by its
 *                               ordinary wakes, its budget only a diagnostic.
 * Prohibited: recording "retained" on an unanswered cancel; inferring a
 * cancellation from a row or from elapsed time.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  isCompletedReplicaOperationAnswer,
} from './replica-operation-constants.js';
import {
  deliverToReplaceWitness,
  deliveryUnavailableReason,
  removalSubjectNodeIdOf,
  replaceReplicaIdsOf,
} from './operation-workflow-replace-witness.js';
import {
  REPLICA_REMOVAL_CANCEL_ANSWER,
  REPLICA_REMOVAL_CANCEL_REASON,
} from '../node/replica-removal-cancel-contract.js';

const {OPERATION_WORKFLOW_OWNER_LITERAL} = OPERATION_WORKFLOW_OWNER_SHARED;
// Why the owner could not ask (before any delivery).
const SOURCE_CANCEL_UNASKED = Object.freeze({
  NO_ROUTE: 'source_cancel_route_unavailable',
  GENERATION_UNAVAILABLE: 'source_generation_unavailable',
});
// What repairs a REPLACE that removed its source while its target died.
const TARGET_DEAD_SOURCE_REMOVED_REPAIR = 'durability_repair_add';
// The named degraded outcome of that REPLACE (its WARN report).
const TARGET_DEAD_SOURCE_REMOVED = 'replace_target_dead_source_removed';
const TARGET_DEAD_SOURCE_REMOVED_LOG_MSG =
  'REPLACE target died after its source was removed: the group is ' +
  'degraded until the durability repair ADD restores its replica count';
const ANSWERS = new Set(Object.values(REPLICA_REMOVAL_CANCEL_ANSWER));

function unavailable(reason, generation = null) {
  return Object.freeze({answer: REPLICA_REMOVAL_CANCEL_ANSWER.UNAVAILABLE,
    reason, generation});
}

// The source row's generation (created_at), from the authoritative read.
async function readSourceGeneration(owner, operation, sourceReplicaId,
  sourceNodeId) {
  if (typeof owner.repository?.getActualReplicaObservation !==
      OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION) {
    return null;
  }
  const observation = await owner.repository.getActualReplicaObservation(
    sourceReplicaId, operation.partitionId, sourceNodeId);
  const createdAt =
    observation?.state === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED ?
      observation.lifecyclePrecondition?.created_at : null;
  return Number.isFinite(createdAt) ? createdAt : null;
}

/**
 * Ask the source's node to cancel the source's removal under this
 * operation, for exactly the source generation the authority reads now.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<Object>} Frozen {answer, reason, generation}.
 */
async function cancelReplaceSourceRemoval(owner, operation) {
  const {sourceReplicaId} = replaceReplicaIdsOf(owner, operation);
  const sourceNodeId = removalSubjectNodeIdOf(operation);
  if (!sourceReplicaId || !sourceNodeId) {
    return unavailable(SOURCE_CANCEL_UNASKED.NO_ROUTE);
  }
  const generation = await readSourceGeneration(owner, operation,
    sourceReplicaId, sourceNodeId);
  if (generation === null) {
    return unavailable(SOURCE_CANCEL_UNASKED.GENERATION_UNAVAILABLE);
  }
  const delivery = await deliverToReplaceWitness(owner, operation,
    ReplicaOperationMessageType.CANCEL_REPLICA_REMOVAL,
    {replicaId: sourceReplicaId, nodeId: sourceNodeId},
    {[ReplicaOperationField.REPLICA_GENERATION]: generation});
  const response = delivery.response;
  const result = response?.[ReplicaOperationField.REMOVAL_CANCELLATION];
  if (!isCompletedReplicaOperationAnswer(response) ||
      !ANSWERS.has(result?.answer)) {
    return unavailable(deliveryUnavailableReason(delivery) ||
      REPLICA_REMOVAL_CANCEL_REASON.MEMBERSHIP_UNAVAILABLE, generation);
  }
  return Object.freeze({answer: result.answer,
    reason: result.reason ?? null, generation});
}

/**
 * Whether the source's node answered that the operation retains its
 * source (its removal cancelled, or none in progress).
 * @param {Object} cancel - cancelReplaceSourceRemoval's answer.
 * @return {boolean}
 */
function isSourceRetainedAnswer(cancel) {
  return cancel.answer === REPLICA_REMOVAL_CANCEL_ANSWER.CANCELLED ||
    cancel.answer === REPLICA_REMOVAL_CANCEL_ANSWER.NOT_IN_PROGRESS;
}

/**
 * The step metadata a target-death terminal records: the cancel's answer,
 * and for a removed source the degraded group and its repair.
 * @param {Object} cancel - cancelReplaceSourceRemoval's answer.
 * @param {Object} observation - The completion authority's observation.
 * @param {Object} ids - {sourceReplicaId, targetReplicaId}.
 * @return {Object}
 */
function targetDeathStepMetadataOf(cancel, observation, ids) {
  const sourceRemoval = {answer: cancel.answer, reason: cancel.reason,
    generation: cancel.generation};
  if (cancel.answer !== REPLICA_REMOVAL_CANCEL_ANSWER.ALREADY_REMOVED) {
    return {replaceTargetDeath: {sourceRemoval}};
  }
  return {replaceTargetDeath: {sourceRemoval, degraded: {
    removedSourceReplicaId: ids.sourceReplicaId,
    deadTargetReplicaId: ids.targetReplicaId,
    lastObservedVoterReplicaIds: observation?.voterReplicaIds ?? null,
    repair: TARGET_DEAD_SOURCE_REMOVED_REPAIR,
  }}};
}

/**
 * The completion record of a REPLACE whose source left while its target is
 * gone: the degraded group and the repair it owes (evidence for operators;
 * the repair planner decides from the ACTIVE rows below replica_count).
 * @param {Object} observation - The completion authority's observation.
 * @param {Object} ids - {sourceReplicaId, targetReplicaId}.
 * @return {Object} Step metadata.
 */
function degradedCompletionStepMetadataOf(observation, ids) {
  return {replaceTargetDeath: {outcome: TARGET_DEAD_SOURCE_REMOVED, degraded: {
    removedSourceReplicaId: ids.sourceReplicaId,
    deadTargetReplicaId: ids.targetReplicaId,
    lastObservedVoterReplicaIds: observation?.voterReplicaIds ?? null,
    repair: TARGET_DEAD_SOURCE_REMOVED_REPAIR,
  }}};
}

/**
 * Report the degraded group a REPLACE leaves when its source was removed
 * while its target died (its named outcome and repair).
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} stepMetadata - targetDeathStepMetadataOf's answer.
 */
function reportTargetDeadSourceRemoved(owner, operation, stepMetadata) {
  owner.logger?.warn?.(TARGET_DEAD_SOURCE_REMOVED_LOG_MSG, {
    outcome: TARGET_DEAD_SOURCE_REMOVED,
    operationId: operation.operationId,
    partitionId: operation.partitionId,
    ...stepMetadata.replaceTargetDeath,
  });
}

export {
  TARGET_DEAD_SOURCE_REMOVED,
  TARGET_DEAD_SOURCE_REMOVED_REPAIR,
  reportTargetDeadSourceRemoved,
  cancelReplaceSourceRemoval,
  degradedCompletionStepMetadataOf,
  isSourceRetainedAnswer,
  targetDeathStepMetadataOf,
};
