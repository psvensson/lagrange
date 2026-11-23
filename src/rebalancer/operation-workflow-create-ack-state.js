// Generation-fenced in-flight CREATE acknowledgement state for the operation
// workflow owner. Once a target node answers INITIATED or IN_PROGRESS under
// its current boot incarnation, routine CDC echoes of the owner's own
// SENDING -> CREATING write (and routine node heartbeats under the same boot
// incarnation) do not re-send duplicate CREATE_REPLICA RPCs. Any process
// restart, target boot-incarnation change, or explicit progress-reconcile /
// dispatch-retry rearm clears the acknowledgement immediately.
import {resolveTargetNodeIncarnationSnapshot} from './replica-status.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  WORKFLOW_STEP,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const EXPLICIT_REARM_BOUNDARIES = Object.freeze(new Set([
  'dispatch_retry',
  OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTE_RECONCILE,
]));

function currentTargetBootIncarnation(owner, targetNodeId) {
  if (!targetNodeId || !owner?.systemTableCache) return null;
  return resolveTargetNodeIncarnationSnapshot(
    owner.systemTableCache, targetNodeId,
  ).bootIncarnation;
}

function recordAcknowledgedCreateInFlight(owner, operation, replaceRemovePhase = false) {
  if (!owner || !operation?.operationId || replaceRemovePhase === true) return;
  if (operation.type !== OperationType.ADD && operation.type !== OperationType.REPLACE) {
    return;
  }
  if (!owner.acknowledgedCreateByOperationId) {
    owner.acknowledgedCreateByOperationId = new Map();
  }
  owner.acknowledgedCreateByOperationId.set(operation.operationId, {
    targetNodeId: operation.targetNodeId ?? null,
    replicaId: operation.replicaId ?? null,
    targetBootIncarnation: currentTargetBootIncarnation(owner, operation.targetNodeId),
  });
}

function clearAcknowledgedCreateInFlight(owner, operationId) {
  if (!operationId || !owner?.acknowledgedCreateByOperationId) return;
  owner.acknowledgedCreateByOperationId.delete(operationId);
}

function ackMatchesOperation(owner, ack, operation) {
  if (ack.targetNodeId !== (operation.targetNodeId ?? null) ||
      ack.replicaId !== (operation.replicaId ?? null)) {
    return false;
  }
  const currentBoot = currentTargetBootIncarnation(owner, operation.targetNodeId);
  return ack.targetBootIncarnation === null || currentBoot === null ||
    ack.targetBootIncarnation === currentBoot;
}

function isAcknowledgedCreateStillInFlight(owner, operation, options = {}) {
  if (!operation?.operationId || operation.workflowStep !== WORKFLOW_STEP.CREATING) {
    return false;
  }
  if (EXPLICIT_REARM_BOUNDARIES.has(options?.boundary)) {
    clearAcknowledgedCreateInFlight(owner, operation.operationId);
    return false;
  }
  const ack = owner?.acknowledgedCreateByOperationId?.get(operation.operationId);
  if (!ack) return false;
  if (!ackMatchesOperation(owner, ack, operation)) {
    clearAcknowledgedCreateInFlight(owner, operation.operationId);
    return false;
  }
  return true;
}

export {
  clearAcknowledgedCreateInFlight,
  isAcknowledgedCreateStillInFlight,
  recordAcknowledgedCreateInFlight,
};
