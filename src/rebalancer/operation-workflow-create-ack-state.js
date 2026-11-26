// The receipt belongs to the dispatched attempt. Cache visibility and a
// reconstructed admission outcome cannot establish transport acknowledgement.
import {CREATE_ADMISSION_STATE} from '../node/replica-create-admission-owner.js';
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from '../constants/index.js';
import {resolveTargetNodeIncarnationSnapshot} from './replica-status.js';
import {ReplicaOperationMessageType, ReplicaOperationResponseStatus} from
  './replica-operation-constants.js';
import {deliveryAnswerOf, deliveryTransportOf, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';

function clearAcknowledgedCreateInFlight(owner, operationId) {
  owner.acknowledgedCreateByOperationId?.delete(operationId);
}

function currentBoot(owner, targetNodeId) {
  const cache = owner.repository?.systemTableCache;
  return cache ? resolveTargetNodeIncarnationSnapshot(cache, targetNodeId).bootIncarnation : null;
}

// Every published CREATE attempt has an immutable admission token and attempt
// token. Compare the actual wire fields, including the initial pre-grant send.
function createFence(request, boot, targetNodeId) {
  if (!Number.isSafeInteger(boot) || boot <= 0 || !request.operationId ||
      !request.replicaId || !request.createAdmissionToken || !request.createAdmissionAttemptToken ||
      !Number.isSafeInteger(request.createAdmissionAttemptSeq) || request.createAdmissionAttemptSeq < 1 ||
      !Number.isSafeInteger(request.createAdmissionWorkflowUpdatedAt)) return null;
  return JSON.stringify([boot, targetNodeId, request.operationId, request.replicaId,
    request.partitionId, request.entityType, request.entityId, request.operationType,
    request.sourceNodeId, request.createAdmissionToken, request.createAdmissionAttemptToken,
    request.createAdmissionAttemptSeq, request.createAdmissionWorkflowUpdatedAt,
    request.membershipPublicationEpoch]);
}

async function deliverCreateWithReceipt(owner, operation, targetNodeId, request, routineWake, send) {
  if (request.type !== ReplicaOperationMessageType.CREATE_REPLICA) return send();
  const boot = currentBoot(owner, targetNodeId);
  const fence = createFence(request, boot, targetNodeId);
  const prior = owner.acknowledgedCreateByOperationId?.get(request.operationId);
  // Partition admission is claimed by the target. A stale wake may still carry
  // the pre-claim row or the previous owner's tuple after target restart.
  const grantMatches = request.entityType !== UNIFIED_SERVICE_TYPE.PARTITION ||
    (operation.createAdmissionOwnerIncarnation === boot &&
     operation.createAdmissionToken === request.createAdmissionToken &&
     operation.createAdmissionAttemptToken === request.createAdmissionAttemptToken &&
     (operation.createAdmissionState === CREATE_ADMISSION_STATE.ADMITTED ||
      operation.createAdmissionState === CREATE_ADMISSION_STATE.MATERIALIZED));
  const createPending = operation.workflowStep === WORKFLOW_STEP.SENDING ||
    operation.workflowStep === WORKFLOW_STEP.CREATING;
  const receiptMatches = fence !== null && prior?.fence === fence;
  if (routineWake && createPending && grantMatches && receiptMatches) {
    return prior.delivery;
  }

  clearAcknowledgedCreateInFlight(owner, request.operationId);
  const delivery = await send({
    routineWake, createPending, grantMatches, receiptMatches, targetBootIncarnation: boot,
    attemptToken: request.createAdmissionAttemptToken, attemptSeq: request.createAdmissionAttemptSeq,
    grantState: operation.createAdmissionState ?? null,
    grantOwnerIncarnation: operation.createAdmissionOwnerIncarnation ?? null,
    priorReceiptStatus: prior ? deliveryAnswerOf(prior.delivery).status : null,
  });
  const reply = deliveryAnswerOf(delivery);
  if (fence !== null && reply?.success !== false &&
      isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery)) &&
      (reply?.status === ReplicaOperationResponseStatus.INITIATED ||
       reply?.status === ReplicaOperationResponseStatus.IN_PROGRESS) &&
      reply.operationId === request.operationId && reply.replicaId === request.replicaId &&
      reply.nodeId === targetNodeId && currentBoot(owner, targetNodeId) === boot) {
    owner.acknowledgedCreateByOperationId ??= new Map();
    owner.acknowledgedCreateByOperationId.set(request.operationId, {fence, delivery});
  }
  return delivery;
}

export {clearAcknowledgedCreateInFlight, deliverCreateWithReceipt};
