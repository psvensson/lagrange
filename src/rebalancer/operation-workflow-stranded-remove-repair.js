import {isDeepStrictEqual} from 'node:util';
import {WORKFLOW_STEP} from '../constants/index.js';
import {OperationType, ReplicaStatus} from './replica-status.js';
import {ReplicaOperationResponseStatus} from './replica-operation-constants.js';
import {
  assertOperationUpdateRecord, assertOperationUpdateSubject, buildOperationUpdateOutcome,
} from './replica-operation-update-outcome.js';
import {buildOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION as DISPOSITION} from
  './replica-operation-update-disposition.js';
import {OPERATION_RECONCILE_OUTCOME as OUTCOME} from './operation-workflow-reconcile-outcome.js';

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

async function adoptTerminal(owner, operation, durable) {
  const outcome = buildOperationTransitionOutcome(buildOperationUpdateOutcome({persisted: false,
    disposition: DISPOSITION.TERMINAL_ADOPTED, operation: durable}));
  await owner.releaseDurableTerminalOperation(operation, outcome);
  return outcome.reconcileOutcome;
}

/**
 * Recover the recorded REMOVE/ACTIVE contradiction from the July run-1 failure.
 * Called only after the normal remove-safety gate and an actual accepted REMOVE
 * reply. ACTIVE remains invalid as a new operation outcome; this conditional
 * correction enters the ordinary STOPPING owner before processing that reply.
 */
async function repairStrandedRemoveAfterResponse(owner, operation, response) {
  if (!isStrandedRemove(operation) || !ACCEPTED_REMOVE_RESPONSES.has(response?.status)) return null;
  const observation = await owner.repository.queryReplicaOperationPersistenceAuthorityObservation(
    operation, {requireAbsenceConfirmation: true});
  const durable = observation.operation;
  if (!durable) return OUTCOME.WAITING;
  assertOperationUpdateSubject(operation, durable);
  if (!isStrandedRemove(durable)) {
    assertOperationUpdateRecord(durable);
    if (durable.completedAt !== null) return adoptTerminal(owner, operation, durable);
    Object.assign(operation, structuredClone(durable));
    return null;
  }
  const now = Date.now();
  const projected = {...durable, workflowStep: WORKFLOW_STEP.STOPPING,
    status: ReplicaStatus.REMOVING, updatedAt: now,
    stepsHistory: [...durable.stepsHistory, {
      step: WORKFLOW_STEP.STOPPING, previousStep: WORKFLOW_STEP.ACTIVE, timestamp: now,
      ownerKey: operation.operationId, reason: CORRECTION_REASON,
    }]};
  const persisted = await owner.repository.persistOperationUpdate(projected, {
    ...owner.buildOperationTransitionPersistOptions(),
    expectedWorkflowStep: WORKFLOW_STEP.ACTIVE, expectedStepsHistory: durable.stepsHistory,
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
  const current = await owner.repository.queryReplicaOperationPersistenceAuthorityObservation(
    operation, {requireAbsenceConfirmation: true});
  if (current.operation && current.operation.completedAt !== null) {
    assertOperationUpdateSubject(operation, current.operation);
    return adoptTerminal(owner, operation, current.operation);
  }
  return OUTCOME.WAITING;
}

export {isSameStrandedRemovePreimage, repairStrandedRemoveAfterResponse};
