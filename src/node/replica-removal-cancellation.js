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
 *     its gate: ALREADY_REMOVED, the removal goes on), and nothing that
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
 * Residual (recorded 2026-11-11): a RemoveNode of this replica proposed by
 * an earlier leader and held only by another survivor's log, not yet
 * replicated here when step 2 reads, can still commit after CANCELLED; the
 * leader-side settlement fact (currentTermApplied) is not part of the
 * witness observation the asker reads. New proposals are refused by the
 * serving row and, while the target is silent past the leader's liveness
 * window, by the leader's live-quorum admission.
 * Prohibited: an answer from elapsed time; CANCELLED without the durable
 * serving row and the voter read after it; touching another operation's
 * removal or another generation.
 */
import {
  readPartitionReplicaMembership,
} from '../partition/partition-service-raft-membership-administration.js';
import {PARTITION_REPLICA_MEMBERSHIP_STATE as MEMBERSHIP} from
  '../partition/partition-replica-membership-constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
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

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const VOTER_VERDICT = Object.freeze({
  VOTER: 'voter',
  REMOVED: 'removed',
  UNKNOWN: 'unknown',
});

function resultOf(answer, reason) {
  return Object.freeze({answer, reason});
}

// The replica's own applied configuration about itself: a voter, removed
// (absent past its gate), or unknown (unreadable, unresolved, below gate).
async function ownVoterVerdict(service, replicaId) {
  let observation = null;
  try {
    observation = await readPartitionReplicaMembership(service, replicaId);
  } catch (_error) {
    return VOTER_VERDICT.UNKNOWN;
  }
  if (observation?.state === MEMBERSHIP.VOTER) {
    return VOTER_VERDICT.VOTER;
  }
  return observation?.state === MEMBERSHIP.ABSENT &&
    observation.gateOpen === true ?
    VOTER_VERDICT.REMOVED : VOTER_VERDICT.UNKNOWN;
}

// Nothing that could still commit this replica's removal is pending in its
// own log (step 2): leading, an entry of its term applied and no change
// pending; following a known leader, every entry it holds applied.
function ownLogSettled(service) {
  let status = null;
  try {
    status = service.raft.readStatus?.();
  } catch (_error) {
    return false;
  }
  if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
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

// Step 3: the exact REMOVING generation back to ACTIVE.
async function revertRetiringRow(handler, fields, service) {
  const stateMachine = handler.replicaStateMachine;
  try {
    const authority = await stateMachine.bindAuthoritativeRemovalAuthority(
      fields.replicaId, {partitionId: fields.partitionId,
        nodeId: handler.nodeId});
    return authority?.kind === REMOVAL_AUTHORITY_KIND.REMOVING &&
      await stateMachine.cancelDurableRemovalWithAuthority(fields.replicaId,
        authority, {partitionId: fields.partitionId, nodeId: handler.nodeId,
          isEffectHandlerCurrent: () =>
            isReplicaServiceHandlerBound(service, stateMachine)}) === true;
  } catch (_error) {
    return false;
  }
}

// Step 4's other branch: the removal committed in the window; its retiring
// row is published again so the removal completes from it.
async function republishRetiringRow(handler, fields) {
  try {
    await handler.persistReplicaStatusWithRetry(fields.replicaId,
      ReplicaStatus.REMOVING, {partitionId: fields.partitionId});
    return resultOf(ANSWER.ALREADY_REMOVED, REASON.REMOVAL_APPLIED);
  } catch (_error) {
    return resultOf(ANSWER.ALREADY_REMOVED, REASON.REPUBLISH_NOT_APPLIED);
  }
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

/**
 * Steps 2-4 on durable state: the one cancellation, run at a running
 * removal's checkpoint and for a node with no running removal alike.
 * @param {Object} handler - The ReplicaHandler.
 * @param {Object} fields - {operationId, partitionId, replicaId,
 *   generation}.
 * @return {Promise<Object>} Frozen {answer, reason}.
 */
async function settleRemovalCancellation(handler, fields) {
  const local = handler.getLocalReplica(fields.replicaId);
  if (local?.status === ReplicaStatus.REMOVED &&
      local.removedByOperationId === fields.operationId) {
    return resultOf(ANSWER.ALREADY_REMOVED, REASON.REMOVAL_APPLIED);
  }
  const service = handler.getTrackedService(fields.replicaId);
  if (!service?.raft) {
    return resultOf(ANSWER.UNAVAILABLE, REASON.NO_CONSENSUS_PORT);
  }
  const before = await ownVoterVerdict(service, fields.replicaId);
  if (before === VOTER_VERDICT.REMOVED) {
    return resultOf(ANSWER.ALREADY_REMOVED, REASON.REMOVAL_APPLIED);
  }
  const named = await readNamedRow(handler, fields);
  if (named.refusal) {
    return resultOf(ANSWER.UNAVAILABLE, named.refusal);
  }
  if (before !== VOTER_VERDICT.VOTER) {
    return resultOf(ANSWER.UNAVAILABLE, REASON.MEMBERSHIP_UNAVAILABLE);
  }
  if (!ownLogSettled(service)) {
    return resultOf(ANSWER.UNAVAILABLE, REASON.LOG_UNSETTLED);
  }
  if (named.row.status !== ReplicaStatus.REMOVING) {
    return resultOf(ANSWER.NOT_IN_PROGRESS, REASON.ROW_SERVING);
  }
  if (!await revertRetiringRow(handler, fields, service)) {
    return resultOf(ANSWER.UNAVAILABLE, REASON.REVERT_NOT_APPLIED);
  }
  const after = await ownVoterVerdict(service, fields.replicaId);
  if (after === VOTER_VERDICT.REMOVED) {
    return republishRetiringRow(handler, fields);
  }
  return after === VOTER_VERDICT.VOTER && ownLogSettled(service) ?
    resultOf(ANSWER.CANCELLED, REASON.ROW_REVERTED) :
    resultOf(ANSWER.UNAVAILABLE, REASON.MEMBERSHIP_UNAVAILABLE);
}

/**
 * The replica serves again: its removal's fence lifts and its local status
 * is its lifecycle owner's (ACTIVE after the cancelling write).
 * @param {Object} handler
 * @param {Object} fields - {operationId, partitionId, replicaId}.
 */
function restoreServingAfterCancellation(handler, fields) {
  const service = handler.getTrackedService(fields.replicaId);
  service?.liftServingAdmissionFenceForCancelledRemoval?.();
  handler.setLocalReplica(fields.replicaId, {replicaId: fields.replicaId,
    partitionId: fields.partitionId, service,
    status: handler.getTrackedReplicaLifecycleState(fields.replicaId) ||
      ReplicaStatus.ACTIVE});
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
 * false) a serving row means the removal is cancelled where it stands.
 * @param {Object} handler
 * @param {Object|null} removal - The running removal's record.
 * @param {Object} phase - {retiringRowDurable}.
 * @return {Promise<Object|null>} The settled {answer, reason}, or null when
 *   no cancellation was asked.
 */
async function runRemovalCancellationCheckpoint(handler, removal, phase) {
  if (!removal) {
    return null;
  }
  if (removal.controller.signal.aborted) {
    removal.controller = new AbortController();
  }
  const asked = removal.cancellation;
  if (!asked) {
    return null;
  }
  removal.cancellation = null;
  let result = await settleRemovalCancellation(handler, {
    operationId: removal.operationId, partitionId: removal.partitionId,
    replicaId: removal.replicaId, generation: asked.generation});
  if (phase.retiringRowDurable !== true &&
      result.answer === ANSWER.NOT_IN_PROGRESS) {
    result = resultOf(ANSWER.CANCELLED, REASON.ROW_SERVING);
  }
  if (result.answer === ANSWER.CANCELLED ||
      result.answer === ANSWER.NOT_IN_PROGRESS) {
    restoreServingAfterCancellation(handler, removal);
  }
  asked.resolve(result);
  return result;
}

/**
 * A running removal ended: a cancellation asked of it and not yet settled
 * is settled on the state it left.
 * @param {Object} handler
 * @param {Object} removal - The running removal's record.
 * @return {Promise<void>}
 */
async function settleCancellationAfterRemoval(handler, removal) {
  const asked = removal.cancellation;
  if (!asked) {
    return;
  }
  removal.cancellation = null;
  try {
    asked.resolve(await settleRemovalCancellation(handler, {
      operationId: removal.operationId, partitionId: removal.partitionId,
      replicaId: removal.replicaId, generation: asked.generation}));
  } catch (_error) {
    asked.resolve(resultOf(ANSWER.UNAVAILABLE, REASON.ROW_UNAVAILABLE));
  }
}

function runningRemovalOf(handler, replicaId) {
  for (const removal of handler.removalExecutions?.values() ?? []) {
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
    let resolve;
    const settled = new Promise((settle) => {
      resolve = settle;
    });
    removal.cancellation = {generation, resolve, settled};
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
  handler.removalExecutions ??= new Map();
  const removal = {operationId: request.operationId,
    partitionId: request.partitionId, replicaId: request.replicaId,
    controller: new AbortController(), cancellation: null};
  if (request.operationId) {
    handler.removalExecutions.set(request.operationId, removal);
  }
  return removal;
}

async function endRemovalExecution(handler, removal) {
  if (handler.removalExecutions?.get(removal.operationId) === removal) {
    handler.removalExecutions.delete(removal.operationId);
  }
  await settleCancellationAfterRemoval(handler, removal);
}

function answerCancellation(handler, fields, result) {
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.COMPLETED, {
      [ReplicaOperationField.REMOVAL_CANCELLATION]: result,
      operationId: fields.operationId, replicaId: fields.replicaId,
      nodeId: handler.nodeId,
    });
}

function assignReplicaHandlerRemovalCancellationMethods(ReplicaHandler) {
  class ReplicaHandlerRemovalCancellationMethods {
    /**
     * CANCEL_REPLICA_REMOVAL: cancel this operation's removal of exactly
     * the named replica generation, or answer why not (typed, idempotent).
     * @param {Object} request
     * @return {Promise<Object>} COMPLETED with {removalCancellation}.
     */
    async handleCancelReplicaRemoval(request) {
      const fields = cancelFieldsOf(request);
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_CANCEL_REQUEST,
        {...fields, nodeId: this.nodeId});
      if (!hasCancelFields(fields)) {
        return answerCancellation(this, fields,
          resultOf(ANSWER.UNAVAILABLE, REASON.REQUIRED_FIELDS));
      }
      const running = runningRemovalOf(this, fields.replicaId);
      if (running && running.operationId !== fields.operationId) {
        return answerCancellation(this, fields,
          resultOf(ANSWER.UNAVAILABLE, REASON.OTHER_OPERATION));
      }
      if (running) {
        return answerCancellation(this, fields,
          await askRunningRemoval(running, fields.generation));
      }
      const result = await settleRemovalCancellation(this, fields);
      if (result.answer === ANSWER.CANCELLED ||
          result.answer === ANSWER.NOT_IN_PROGRESS) {
        restoreServingAfterCancellation(this, fields);
      }
      return answerCancellation(this, fields, result);
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerRemovalCancellationMethods.prototype)) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(ReplicaHandler.prototype, methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerRemovalCancellationMethods.prototype, methodName));
  }
}

export {
  assignReplicaHandlerRemovalCancellationMethods,
  beginRemovalExecution,
  endRemovalExecution,
  runRemovalCancellationCheckpoint,
  settleRemovalCancellation,
};
