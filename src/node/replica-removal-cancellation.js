/**
 * Owner contract:
 * Owner: the one owner of "this replica's removal is cancelled" on its node
 * (CANCEL_REPLICA_REMOVAL, 2026-11-11; vocabulary in
 * replica-removal-cancel-contract.js). The REPLACE owner sends it when its
 * target died after its source's removal began and the operation retains
 * the source (D2).
 * Inputs: the request {operationId, partitionId, replicaId,
 * replicaGeneration}; the running removal of that operation, if any (its
 * record in handler.removalExecutions); the replica's durable services row
 * (the lifecycle owner's authoritative read and its exact REMOVING
 * generation); the replica's own applied configuration (its port's
 * committed-membership read).
 * Order of a CANCELLED, each step guarded by the one before:
 *  1. the removal's local exit is held: a running removal is asked to settle
 *     the cancellation at its next checkpoint (before its retiring row, or
 *     at its consensus-exit wait, which the request releases), so its
 *     consensus-exit path cannot retire the port meanwhile; with no running
 *     removal nothing local can retire it;
 *  2. the replica's own applied configuration names it a voter (absent past
 *     its gate: ALREADY_REMOVED once its row reads retiring - a serving row
 *     is published retiring again first, UNAVAILABLE when that write does
 *     not apply - and the removal goes on), and nothing that
 *     could still commit its removal is pending in its log: leading, it has
 *     applied an entry of its own term with no configuration change pending
 *     (no earlier-term entry can commit any more); following a known
 *     leader, every entry it holds is applied (UNAVAILABLE otherwise, asked
 *     again);
 *  3. the services row moves from the exact REMOVING generation to ACTIVE
 *     (compare-and-set, replica-state-machine-removal-cancellation.js): no
 *     survivor proposes the removal from a serving row (the row-driven
 *     reconcile drops a deferred retirement when the row serves again), and
 *     a leader refuses a removal leaving no live quorum meanwhile;
 *  4. the configuration is read again: still a voter -> CANCELLED (the
 *     serving fence lifts, the local status is ACTIVE); absent -> the
 *     removal committed in the window: the retiring row is published again
 *     and the answer is ALREADY_REMOVED.
 * A crash before 3 leaves the REMOVING row and no running removal: a repeat
 * request runs 2-4. A crash after 3 leaves a serving row: a repeat answers
 * NOT_IN_PROGRESS (still a voter) or ALREADY_REMOVED.
 * Canonical output: {answer, reason} (REPLICA_REMOVAL_CANCEL_ANSWER).
 * CANCELLED is "cancelled as far as this replica's log shows": a RemoveNode
 * proposed by an earlier leader and held only by another survivor's log,
 * not yet replicated here when step 2 reads, can still commit after it. Its
 * end state - this replica applying its own removal with a serving row and
 * no removal running - is settled by replica-removal-settlement.js
 * (REMOVED_OUTSIDE_REMOVAL). New proposals are refused by the serving row
 * and, while the target is silent past the leader's liveness window, by the
 * leader's live-quorum admission.
 * Errors: the lifecycle owner's typed answers (its authority kind, a CAS
 * that did not apply, a status write that exhausted its retry on a
 * retryable control-plane failure) are UNAVAILABLE with their reason; any
 * other error propagates to the asker (an untyped answer it waits on).
 * Prohibited: an answer from elapsed time; CANCELLED without the durable
 * serving row and the voter read after it; touching another operation's
 * removal or another generation; a caught error read as an answer.
 */
import {
  readPartitionReplicaMembership,
} from '../partition/partition-service-raft-membership-administration.js';
import {PARTITION_REPLICA_MEMBERSHIP_STATE as MEMBERSHIP} from
  '../partition/partition-replica-membership-constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {isReplicaServiceHandlerBound} from
  './replica-transport-handler-identity.js';
import {REPLICA_HANDLER_LOG_MSG} from './replica-handler-constants.js';
import {REMOVAL_AUTHORITY_KIND} from './replica-state-machine-recovery.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from
  './replica-removal-consensus-exit.js';
import {
  REPLICA_REMOVAL_CANCEL_ANSWER as ANSWER,
  REPLICA_REMOVAL_CANCEL_REASON as REASON,
} from './replica-removal-cancel-contract.js';

const VOTER_VERDICT = Object.freeze({
  VOTER: 'voter',
  REMOVED: 'removed',
  UNKNOWN: 'unknown',
});

function resultOf(answer, reason) {
  return Object.freeze({answer, reason});
}

// The replica's own applied configuration about itself: a voter, removed
// (absent past its gate), or unknown (the port's typed refusal, a voter it
// cannot resolve, an absence below its gate). A throw is not a refusal and
// propagates.
async function ownVoterVerdict(service, replicaId) {
  const observation = await readPartitionReplicaMembership(service, replicaId);
  if (observation.state === MEMBERSHIP.VOTER) {
    return VOTER_VERDICT.VOTER;
  }
  return observation.state === MEMBERSHIP.ABSENT &&
    observation.gateOpen === true ?
    VOTER_VERDICT.REMOVED : VOTER_VERDICT.UNKNOWN;
}

// Nothing that could still commit this replica's removal is pending in its
// own log (step 2): leading, an entry of its term applied and no change
// pending; following a known leader, every entry it holds applied.
// A status the port could not answer (its typed non-OK outcome) settles
// nothing.
function ownLogSettled(service) {
  const status = service.raft.readStatus();
  if (status.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    return false;
  }
  if (status.role === RAFT_ROLE.LEADER) {
    return status.currentTermApplied === true &&
      status.confChangePending === false;
  }
  return typeof status.leaderId === 'string' &&
    Number(status.appliedIndex) === Number(status.lastIndex);
}

function cancelFieldsOf(request) {
  const generation = request?.[ReplicaOperationField.REPLICA_GENERATION];
  return {
    operationId: request?.[ReplicaOperationField.OPERATION_ID] || null,
    partitionId: request?.[ReplicaOperationField.PARTITION_ID] || null,
    replicaId: request?.[ReplicaOperationField.REPLICA_ID] || null,
    generation: Number.isFinite(generation) ? generation : null,
  };
}

function hasCancelFields(fields) {
  return Boolean(fields.operationId && fields.partitionId &&
    fields.replicaId) && fields.generation !== null;
}

// Why a bound removal authority is not the exact REMOVING generation.
const AUTHORITY_REFUSAL_REASON = Object.freeze({
  [REMOVAL_AUTHORITY_KIND.UNAVAILABLE]: REASON.ROW_UNAVAILABLE,
  [REMOVAL_AUTHORITY_KIND.ABSENT]: REASON.ROW_ABSENT,
  [REMOVAL_AUTHORITY_KIND.CONFLICT]: REASON.GENERATION_MISMATCH,
});

// Step 3: the exact REMOVING generation back to ACTIVE. Answers null when
// the row serves again, otherwise the typed reason it does not: the
// lifecycle owner's authority kind, a compare-and-set that did not apply,
// or a write that exhausted its retry on a retryable control-plane failure
// (the owner's "thrown persistence error is the caller's UNAVAILABLE").
// Any other error propagates.
async function revertRetiringRow(handler, fields, service) {
  const stateMachine = handler.replicaStateMachine;
  const authority = await stateMachine.bindAuthoritativeRemovalAuthority(
    fields.replicaId, {partitionId: fields.partitionId,
      nodeId: handler.nodeId});
  if (authority.kind !== REMOVAL_AUTHORITY_KIND.REMOVING) {
    return AUTHORITY_REFUSAL_REASON[authority.kind];
  }
  let reverted;
  try {
    reverted = await stateMachine.cancelDurableRemovalWithAuthority(
      fields.replicaId, authority, {partitionId: fields.partitionId,
        nodeId: handler.nodeId, isEffectHandlerCurrent: () =>
          isReplicaServiceHandlerBound(service, stateMachine)});
  } catch (error) {
    if (!isRetryableControlPlaneError(error)) {
      throw error;
    }
    return REASON.ROW_UNAVAILABLE;
  }
  return reverted === true ? null : REASON.REVERT_NOT_APPLIED;
}

// The removal applied (the replica's own configuration no longer names it):
// its durable row must read retiring before the answer is ALREADY_REMOVED,
// so the teardown completes from it (a running removal goes on; otherwise
// the lifecycle owner's REMOVING re-drive, replica-removal-settlement.js,
// whose local status is set to match). A serving row this owner wrote in an
// earlier window (its revert, then the removal committed) is published
// again; a write that exhausted its retry is UNAVAILABLE, so the asker asks
// again and this republishes again (never an ALREADY_REMOVED over a serving
// row nobody re-drives).
async function alreadyRemovedAnswer(handler, fields) {
  const named = await readNamedRow(handler, fields);
  if (named.refusal === REASON.ROW_ABSENT) {
    return resultOf(ANSWER.ALREADY_REMOVED, REASON.REMOVAL_APPLIED);
  }
  if (named.refusal) {
    return resultOf(ANSWER.UNAVAILABLE, named.refusal);
  }
  if (named.row.status !== ReplicaStatus.ACTIVE) {
    return resultOf(ANSWER.ALREADY_REMOVED, REASON.REMOVAL_APPLIED);
  }
  try {
    await handler.persistReplicaStatusWithRetry(fields.replicaId,
      ReplicaStatus.REMOVING, {partitionId: fields.partitionId});
  } catch (error) {
    if (!isRetryableControlPlaneError(error)) {
      throw error;
    }
    return resultOf(ANSWER.UNAVAILABLE, REASON.REPUBLISH_NOT_APPLIED);
  }
  handler.setLocalReplica(fields.replicaId, {replicaId: fields.replicaId,
    partitionId: fields.partitionId, status: ReplicaStatus.REMOVING});
  return resultOf(ANSWER.ALREADY_REMOVED, REASON.REMOVAL_APPLIED);
}

// The services row as the lifecycle owner reads it, checked against the
// generation the request names.
async function readNamedRow(handler, fields) {
  const observation = await handler.replicaStateMachine
    .observeAuthoritativeReplicaLifecycle(fields.replicaId);
  if (observation?.available !== true) {
    return {refusal: REASON.ROW_UNAVAILABLE};
  }
  if (observation.row === null) {
    return {refusal: REASON.ROW_ABSENT};
  }
  if (observation.row.created_at !== fields.generation) {
    return {refusal: REASON.GENERATION_MISMATCH};
  }
  return {row: observation.row};
}

// One settled cancellation: the asker's {answer, reason}, and - when the
// replica serves again (CANCELLED, NOT_IN_PROGRESS) - its tracked service
// and the serving status its durable row holds (ACTIVE after this owner's
// revert; the row's own status when no removal was in progress).
function settledOf(result, serving = null) {
  return Object.freeze({result, serving});
}

/**
 * Steps 2-4 on durable state: the one cancellation, run at a running
 * removal's checkpoint and for a node with no running removal alike.
 * @param {Object} handler - The ReplicaHandler.
 * @param {Object} fields - {operationId, partitionId, replicaId,
 *   generation}.
 * @return {Promise<Object>} Frozen {result, serving}.
 */
async function settleRemovalCancellation(handler, fields) {
  const local = handler.getLocalReplica(fields.replicaId);
  if (local?.status === ReplicaStatus.REMOVED &&
      local.removedByOperationId === fields.operationId) {
    return settledOf(resultOf(ANSWER.ALREADY_REMOVED, REASON.REMOVAL_APPLIED));
  }
  const service = handler.getTrackedService(fields.replicaId);
  if (!service?.raft) {
    return settledOf(resultOf(ANSWER.UNAVAILABLE, REASON.NO_CONSENSUS_PORT));
  }
  const before = await ownVoterVerdict(service, fields.replicaId);
  if (before === VOTER_VERDICT.REMOVED) {
    return settledOf(await alreadyRemovedAnswer(handler, fields));
  }
  const named = await readNamedRow(handler, fields);
  if (named.refusal) {
    return settledOf(resultOf(ANSWER.UNAVAILABLE, named.refusal));
  }
  if (before !== VOTER_VERDICT.VOTER) {
    return settledOf(resultOf(ANSWER.UNAVAILABLE,
      REASON.MEMBERSHIP_UNAVAILABLE));
  }
  if (!ownLogSettled(service)) {
    return settledOf(resultOf(ANSWER.UNAVAILABLE, REASON.LOG_UNSETTLED));
  }
  if (named.row.status !== ReplicaStatus.REMOVING) {
    return settledOf(resultOf(ANSWER.NOT_IN_PROGRESS, REASON.ROW_SERVING),
      {service, status: named.row.status});
  }
  const notReverted = await revertRetiringRow(handler, fields, service);
  if (notReverted !== null) {
    return settledOf(resultOf(ANSWER.UNAVAILABLE, notReverted));
  }
  const after = await ownVoterVerdict(service, fields.replicaId);
  if (after === VOTER_VERDICT.REMOVED) {
    return settledOf(await alreadyRemovedAnswer(handler, fields));
  }
  return after === VOTER_VERDICT.VOTER && ownLogSettled(service) ?
    settledOf(resultOf(ANSWER.CANCELLED, REASON.ROW_REVERTED),
      {service, status: ReplicaStatus.ACTIVE}) :
    settledOf(resultOf(ANSWER.UNAVAILABLE, REASON.MEMBERSHIP_UNAVAILABLE));
}

/**
 * The replica serves again: its removal's fence lifts and its local status
 * is its durable row's serving status.
 * @param {Object} handler
 * @param {Object} fields - {operationId, partitionId, replicaId}.
 * @param {Object} serving - {service, status}.
 */
function restoreServingAfterCancellation(handler, fields, serving) {
  serving.service.liftServingAdmissionFenceForCancelledRemoval();
  handler.setLocalReplica(fields.replicaId, {replicaId: fields.replicaId,
    partitionId: fields.partitionId, service: serving.service,
    status: serving.status});
  if (fields.operationId) {
    handler.inProgressOperations.delete(fields.operationId);
  }
  handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_CANCELLED, {
    operationId: fields.operationId, replicaId: fields.replicaId,
    partitionId: fields.partitionId, nodeId: handler.nodeId});
}

/**
 * A running removal's checkpoint: settle the cancellation it was asked, if
 * any, and answer the asker. Before its retiring row (retiringRowDurable
 * false) a serving row means the removal is cancelled where it stands. A
 * settlement that throws rejects the asker's answer and the removal alike.
 * @param {Object} handler
 * @param {Object} removal - The running removal's record.
 * @param {Object} phase - {retiringRowDurable}.
 * @return {Promise<Object|null>} The settled {answer, reason}, or null when
 *   no cancellation was asked.
 */
async function runRemovalCancellationCheckpoint(handler, removal, phase) {
  if (removal.controller.signal.aborted) {
    removal.controller = new AbortController();
  }
  const asked = removal.cancellation;
  if (!asked) {
    return null;
  }
  removal.cancellation = null;
  let settled;
  try {
    settled = await settleRemovalCancellation(handler, {
      operationId: removal.operationId, partitionId: removal.partitionId,
      replicaId: removal.replicaId, generation: asked.generation});
  } catch (error) {
    asked.reject(error);
    throw error;
  }
  let result = settled.result;
  if (phase.retiringRowDurable !== true &&
      result.answer === ANSWER.NOT_IN_PROGRESS) {
    result = resultOf(ANSWER.CANCELLED, REASON.ROW_SERVING);
  }
  if (settled.serving !== null) {
    restoreServingAfterCancellation(handler, removal, settled.serving);
  }
  asked.resolve(result);
  return result;
}

/**
 * A running removal ended: a cancellation asked of it and not yet settled
 * is settled on the state it left (the asker gets its answer, or its
 * error).
 * @param {Object} handler
 * @param {Object} removal - The running removal's record.
 */
function settleCancellationAfterRemoval(handler, removal) {
  const asked = removal.cancellation;
  if (!asked) {
    return;
  }
  removal.cancellation = null;
  asked.resolve(settleRemovalCancellation(handler, {
    operationId: removal.operationId, partitionId: removal.partitionId,
    replicaId: removal.replicaId, generation: asked.generation})
    .then((settled) => settled.result));
}

function runningRemovalOf(handler, replicaId) {
  for (const removal of handler.removalExecutions.values()) {
    if (removal.replicaId === replicaId) {
      return removal;
    }
  }
  return null;
}

/**
 * Ask a running removal to settle a cancellation at its next checkpoint,
 * releasing its consensus-exit wait so it reaches one.
 * @param {Object} removal - The running removal's record.
 * @param {number} generation - The replica generation the request names.
 * @return {Promise<Object>} The settled {answer, reason}.
 */
function askRunningRemoval(removal, generation) {
  if (!removal.cancellation) {
    const {promise, resolve, reject} = Promise.withResolvers();
    removal.cancellation = {generation, resolve, reject, settled: promise};
  }
  removal.controller.abort(REPLICA_CONSENSUS_EXIT_REASON.CANCELLED);
  return removal.cancellation.settled;
}

/**
 * The running removal's record for one REMOVE execution (its release and
 * pending cancellation), registered while it runs.
 * @param {Object} handler
 * @param {Object} request - {operationId, partitionId, replicaId}.
 * @return {Object} The record.
 */
function beginRemovalExecution(handler, request) {
  const removal = {operationId: request.operationId,
    partitionId: request.partitionId, replicaId: request.replicaId,
    controller: new AbortController(), cancellation: null};
  if (request.operationId) {
    handler.removalExecutions.set(request.operationId, removal);
  }
  return removal;
}

function endRemovalExecution(handler, removal) {
  if (handler.removalExecutions.get(removal.operationId) === removal) {
    handler.removalExecutions.delete(removal.operationId);
  }
  settleCancellationAfterRemoval(handler, removal);
}

function answerCancellation(handler, fields, result) {
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.COMPLETED, {
      [ReplicaOperationField.REMOVAL_CANCELLATION]: result,
      operationId: fields.operationId, replicaId: fields.replicaId,
      nodeId: handler.nodeId,
    });
}

/**
 * CANCEL_REPLICA_REMOVAL: cancel this operation's removal of exactly the
 * named replica generation, or answer why not (typed, idempotent). An
 * explicit-context entry point (the handler is its first argument).
 * @param {Object} handler - The ReplicaHandler.
 * @param {Object} request
 * @return {Promise<Object>} COMPLETED with {removalCancellation}.
 */
async function handleCancelReplicaRemoval(handler, request) {
  const fields = cancelFieldsOf(request);
  handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_CANCEL_REQUEST,
    {...fields, nodeId: handler.nodeId});
  if (!hasCancelFields(fields)) {
    return answerCancellation(handler, fields,
      resultOf(ANSWER.UNAVAILABLE, REASON.REQUIRED_FIELDS));
  }
  const running = runningRemovalOf(handler, fields.replicaId);
  if (running && running.operationId !== fields.operationId) {
    return answerCancellation(handler, fields,
      resultOf(ANSWER.UNAVAILABLE, REASON.OTHER_OPERATION));
  }
  if (running) {
    return answerCancellation(handler, fields,
      await askRunningRemoval(running, fields.generation));
  }
  const settled = await settleRemovalCancellation(handler, fields);
  if (settled.serving !== null) {
    restoreServingAfterCancellation(handler, fields, settled.serving);
  }
  return answerCancellation(handler, fields, settled.result);
}

export {
  beginRemovalExecution,
  endRemovalExecution,
  handleCancelReplicaRemoval,
  runRemovalCancellationCheckpoint,
};
