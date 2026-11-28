// A transport ACK answers the request. Reusing that answer also requires the
// target's proof of physical worker custody and the current durable grant.
import {CREATE_ADMISSION_STATE} from '../node/replica-create-admission-state.js';
import {replicaCreateInstallAuthoritiesEqual} from '../node/replica-create-admission-evidence.js';
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from '../constants/index.js';
import {ReplicaOperationMessageType, ReplicaOperationResponseStatus} from
  './replica-operation-constants.js';
import {deliveryAnswerOf, deliveryTransportOf, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';

function clearAcknowledgedCreateInFlight(owner, operationId) {
  owner.acknowledgedCreateByOperationId?.delete(operationId);
}

function currentBoot(owner, targetNodeId) {
  const cache = owner.repository?.systemTableCache;
  if (!cache || !targetNodeId) return null;
  const nodeBoot = cache.get('nodes', targetNodeId)?.boot_incarnation;
  const endpointBoot = cache.get('node_endpoints', `ep-${targetNodeId}-ws`)?.boot_incarnation;
  return Number.isSafeInteger(nodeBoot) && nodeBoot > 0 && nodeBoot === endpointBoot ? nodeBoot : null;
}

function workerMatchesRequest(worker, request, targetNodeId, boot) {
  if (!worker || boot === null ||
      request.entityType !== UNIFIED_SERVICE_TYPE.PARTITION) return false;
  const {ownerIncarnation, ...authority} = worker;
  return ownerIncarnation === boot && replicaCreateInstallAuthoritiesEqual(authority, {
    operationId: request.operationId, operationType: request.operationType,
    entityType: request.entityType, entityId: request.entityId, partitionId: request.partitionId,
    replicaId: request.replicaId, targetNodeId, admissionToken: request.createAdmissionToken,
    attemptToken: request.createAdmissionAttemptToken, attemptSeq: request.createAdmissionAttemptSeq,
    workflowUpdatedAt: request.createAdmissionWorkflowUpdatedAt, replicaCreatedAt: worker.replicaCreatedAt,
  });
}

function grantMatchesWorker(operation, worker) {
  return Boolean(worker) &&
    (operation.createAdmissionState === CREATE_ADMISSION_STATE.ADMITTED ||
     operation.createAdmissionState === CREATE_ADMISSION_STATE.MATERIALIZED) &&
    operation.createAdmissionOwnerIncarnation === worker.ownerIncarnation &&
    operation.createAdmissionReplicaCreatedAt === worker.replicaCreatedAt &&
    operation.createAdmissionToken === worker.admissionToken &&
    operation.createAdmissionAttemptToken === worker.attemptToken &&
    operation.createAdmissionAttemptSeq === worker.attemptSeq &&
    operation.createAdmissionWorkflowUpdatedAt === worker.workflowUpdatedAt;
}

async function deliverCreateWithReceipt(owner, operation, targetNodeId, request, routineWake, send) {
  if (request.type !== ReplicaOperationMessageType.CREATE_REPLICA) return send();
  const boot = currentBoot(owner, targetNodeId);
  const prior = owner.acknowledgedCreateByOperationId?.get(request.operationId);
  const grantMatches = grantMatchesWorker(operation, prior?.worker);
  const createPending = operation.workflowStep === WORKFLOW_STEP.SENDING ||
    operation.workflowStep === WORKFLOW_STEP.CREATING;
  const receiptMatches = workerMatchesRequest(prior?.worker, request, targetNodeId, boot) &&
    prior.sourceNodeId === request.sourceNodeId &&
    prior.membershipPublicationEpoch === request.membershipPublicationEpoch;
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
  if (isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery)) && reply?.success !== false &&
      (reply?.status === ReplicaOperationResponseStatus.INITIATED ||
       reply?.status === ReplicaOperationResponseStatus.IN_PROGRESS) &&
      reply.operationId === request.operationId && reply.replicaId === request.replicaId &&
      reply.nodeId === targetNodeId && workerMatchesRequest(reply.createWorkerReceipt, request, targetNodeId, boot) &&
      currentBoot(owner, targetNodeId) === boot) {
    owner.acknowledgedCreateByOperationId ??= new Map();
    owner.acknowledgedCreateByOperationId.set(request.operationId, {
      worker: Object.freeze({...reply.createWorkerReceipt}), delivery,
      sourceNodeId: request.sourceNodeId, membershipPublicationEpoch: request.membershipPublicationEpoch,
    });
  }
  return delivery;
}

export {clearAcknowledgedCreateInFlight, deliverCreateWithReceipt};
