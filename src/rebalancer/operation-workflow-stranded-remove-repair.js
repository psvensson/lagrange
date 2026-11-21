import {isDeepStrictEqual} from 'node:util';
import {WORKFLOW_STEP} from '../constants/index.js';
import {OperationType, ReplicaStatus} from './replica-status.js';
import {ReplicaOperationResponseStatus} from './replica-operation-constants.js';
import {
  assertOperationUpdateRecord, assertOperationUpdateSubject, buildOperationUpdateOutcome,
  copyOperationOutcomeData, INVALID_OPERATION_PERSISTENCE_OUTCOME,
  invalidOperationPersistenceOutcome,
} from './replica-operation-update-outcome.js';
import {buildOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION as DISPOSITION} from
  './replica-operation-update-disposition.js';
import {OPERATION_RECONCILE_OUTCOME as OUTCOME} from './operation-workflow-reconcile-outcome.js';

const REMOVE_REPLY_SUBJECT_MOVED = Object.freeze({state: 'subject_moved', operation: null});
const REMOVE_REPLY_SUBJECT_BOUND = 'subject_bound';
const INVALID_REPLY_PREIMAGE = 'the sent REMOVE preimage does not bind the requested correction';
const CORRECTION_REASON = 'safety-gated stranded REMOVE correction';
const ACCEPTED_REMOVE_RESPONSES = new Set([
  ReplicaOperationResponseStatus.INITIATED, ReplicaOperationResponseStatus.IN_PROGRESS,
  ReplicaOperationResponseStatus.ALREADY_EXISTS, ReplicaOperationResponseStatus.COMPLETED,
  ReplicaOperationResponseStatus.NOT_FOUND,
]);

function isStrandedRemove(operation) {
  return operation?.type === OperationType.REMOVE &&
    operation.workflowStep === WORKFLOW_STEP.ACTIVE && operation.status === ReplicaStatus.ACTIVE &&
    operation.completedAt === null;
}

// This preimage is only meaningful to the historical correction. The
// normal persistence outcome validator continues to reject REMOVE/ACTIVE.
function isSameStrandedRemovePreimage(requested, durable) {
  return isStrandedRemove(requested) && isStrandedRemove(durable) &&
    Number.isFinite(durable.updatedAt) && requested.updatedAt === durable.updatedAt &&
    isDeepStrictEqual(requested.stepsHistory, durable.stepsHistory);
}

function captureStrandedRemovePreimage(operation) {
  return isStrandedRemove(operation) ? copyOperationOutcomeData(operation) : null;
}

function buildStrandedRemoveCasFields(preimage, operation, expectedStep, expectedHistory) {
  assertOperationUpdateSubject(preimage, operation);
  if (!isStrandedRemove(preimage) || expectedStep !== preimage.workflowStep ||
      expectedHistory !== JSON.stringify(preimage.stepsHistory) ||
      preimage.createdAt !== operation.createdAt || !Number.isFinite(preimage.updatedAt)) {
    throw invalidOperationPersistenceOutcome(INVALID_REPLY_PREIMAGE);
  }
  return buildRemoveReplyBindings(preimage);
}

function buildRemoveReplyBindings(preimage) {
  return Object.freeze({
    status: preimage.status,
    updated_at: preimage.updatedAt,
    type: preimage.type,
    partition_id: preimage.partitionId,
    entity_type: preimage.entityType,
    entity_id: preimage.entityId,
    replica_id: preimage.replicaId,
    source_replica_id: preimage.sourceReplicaId ?? null,
    source_node_id: preimage.sourceNodeId,
    target_node_id: preimage.targetNodeId,
    target_claim_key: preimage.targetClaimKey ?? null,
  });
}

function isAcknowledgedRemoveStopping(operation) {
  return operation?.type === OperationType.REMOVE &&
    operation.workflowStep === WORKFLOW_STEP.STOPPING &&
    operation.status === ReplicaStatus.REMOVING && operation.completedAt === null &&
    Number.isFinite(operation.updatedAt) && Array.isArray(operation.stepsHistory);
}

function isSameAcknowledgedRemovePreimage(preimage, durable) {
  return isAcknowledgedRemoveStopping(durable) &&
    durable.createdAt === preimage.createdAt && durable.updatedAt === preimage.updatedAt &&
    isDeepStrictEqual(durable.stepsHistory, preimage.stepsHistory);
}

function buildAcknowledgedRemoveCasFields(preimage, operation, terminalTransition) {
  assertOperationUpdateSubject(preimage, operation);
  if (!terminalTransition || !isAcknowledgedRemoveStopping(preimage) ||
      operation.createdAt !== preimage.createdAt) {
    throw invalidOperationPersistenceOutcome(INVALID_REPLY_PREIMAGE);
  }
  return Object.freeze({...buildRemoveReplyBindings(preimage), created_at: preimage.createdAt,
    workflow_step: preimage.workflowStep, steps_history: JSON.stringify(preimage.stepsHistory)});
}

async function readCurrentRemoveSubject(repository, preimage) {
  const rows = await repository.readRequiredEntityOperationRows(
    preimage.entityType, preimage.entityId);
  const row = rows.find((candidate) => candidate.operation_id === preimage.operationId);
  if (!row) return REMOVE_REPLY_SUBJECT_MOVED;
  const durable = repository.rowToOperation(row);
  if (durable.createdAt !== preimage.createdAt) return REMOVE_REPLY_SUBJECT_MOVED;
  try {
    assertOperationUpdateSubject(preimage, durable);
  } catch (error) {
    if (error.code !== INVALID_OPERATION_PERSISTENCE_OUTCOME) throw error;
    return REMOVE_REPLY_SUBJECT_MOVED;
  }
  return {state: REMOVE_REPLY_SUBJECT_BOUND, operation: durable};
}

async function adoptTerminal(owner, operation, durable) {
  const outcome = buildOperationTransitionOutcome(buildOperationUpdateOutcome({persisted: false,
    disposition: DISPOSITION.TERMINAL_ADOPTED, operation: durable}));
  await owner.releaseDurableTerminalOperation(operation, outcome);
  return outcome.reconcileOutcome;
}

/**
 * Recover the recorded REMOVE/ACTIVE contradiction from the July run-1 failure.
 * An accepted REMOVE reply can correct the exact stranded preimage. A failure
 * or missing reply can observe a same-generation terminal winner or wait.
 * No reply makes ACTIVE a valid operation result.
 */
async function repairStrandedRemoveAfterResponse(owner, operation, response, preimage) {
  if (!preimage) return null;
  const {operation: durable} = await readCurrentRemoveSubject(owner.repository, preimage);
  if (!durable) return OUTCOME.WAITING;
  if (durable.completedAt !== null) {
    assertOperationUpdateRecord(durable, {terminal: true});
    return adoptTerminal(owner, operation, durable);
  }
  if (!ACCEPTED_REMOVE_RESPONSES.has(response?.status) ||
      !isSameStrandedRemovePreimage(preimage, durable)) return OUTCOME.WAITING;
  const now = Date.now();
  const projected = {...durable, workflowStep: WORKFLOW_STEP.STOPPING,
    status: ReplicaStatus.REMOVING, updatedAt: now,
    stepsHistory: [...durable.stepsHistory, {
      step: WORKFLOW_STEP.STOPPING, previousStep: WORKFLOW_STEP.ACTIVE, timestamp: now,
      ownerKey: operation.operationId, reason: CORRECTION_REASON,
    }]};
  const persisted = await owner.repository.persistOperationUpdate(projected, {
    ...owner.buildOperationTransitionPersistOptions(),
    expectedWorkflowStep: WORKFLOW_STEP.ACTIVE, expectedStepsHistory: preimage.stepsHistory,
    strandedRemovePreimage: preimage,
  });
  const outcome = buildOperationTransitionOutcome(persisted,
    {repository: owner.repository, requestedOperation: projected});
  if (outcome.committed) {
    Object.assign(operation, structuredClone(outcome.operation));
    owner.operationWorkflowCoordinator.removeWorkflow(operation.operationId);
    return null;
  }
  // The same CAS may lose to terminal completion. Its refusal is not proof of
  // absence: consult the winner before deciding whether the reply can proceed.
  const {operation: current} = await readCurrentRemoveSubject(owner.repository, preimage);
  if (current && current.completedAt !== null) {
    return adoptTerminal(owner, operation, current);
  }
  return OUTCOME.WAITING;
}

async function resolveStrandedRemoveReply(owner, operation, response, preimage) {
  if (!preimage) return null;
  const outcome = await repairStrandedRemoveAfterResponse(owner, operation, response, preimage);
  if (outcome === OUTCOME.FAILED) {
    return owner.buildFailedOperationResult(operation.operationId, operation.errorMessage);
  }
  if (outcome === OUTCOME.COMPLETED) {
    return owner.buildSuccessfulOperationResult(operation.operationId, {status: outcome});
  }
  if (outcome) return owner.buildSkippedOperationResult(outcome, operation.operationId);
  owner.clearDispatchRetry(operation.operationId);
  return owner.handleStopPhaseSatisfiedResponse(operation, response.status, {
    acknowledgedRemovePreimage: copyOperationOutcomeData(operation),
  });
}

export {
  buildAcknowledgedRemoveCasFields, buildStrandedRemoveCasFields, captureStrandedRemovePreimage,
  isSameAcknowledgedRemovePreimage, isSameStrandedRemovePreimage, readCurrentRemoveSubject,
  resolveStrandedRemoveReply,
};
