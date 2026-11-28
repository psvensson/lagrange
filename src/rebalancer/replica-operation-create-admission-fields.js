import {buildReplicaCreateAdmissionToken, buildReplicaCreateAttemptToken} from './replica-create-admission-token.js';
import {CREATE_ADMISSION_STATE} from '../node/replica-create-admission-owner.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {OperationType} from './replica-operation-progress.js';

const REPLICA_CREATE_ADMISSION_OPERATION_FIELDS = Object.freeze([
  'createAdmissionState',
  'createAdmissionToken',
  'createAdmissionReplicaCreatedAt',
  'createAdmissionAttemptToken',
  'createAdmissionPreviousAttemptToken',
  'createAdmissionAttemptSeq',
  'createAdmissionWorkflowUpdatedAt',
  'createAdmissionOwnerIncarnation',
]);

function operationCarriesReplicaCreateAdmission(operation) {
  if (operation?.stepsHistory?.[0]?.placementAdmission) {
    return true;
  }
  return REPLICA_CREATE_ADMISSION_OPERATION_FIELDS.some((field) =>
    operation?.[field] !== null && operation?.[field] !== undefined,
  );
}

function hasDurableCreateDispatchTuple(operation) {
  return [
    Object.values(CREATE_ADMISSION_STATE).includes(operation?.createAdmissionState),
    typeof operation?.createAdmissionToken === 'string' &&
      operation.createAdmissionToken.length > 0,
    Number.isSafeInteger(operation?.createAdmissionReplicaCreatedAt),
    typeof operation?.createAdmissionAttemptToken === 'string' &&
      operation.createAdmissionAttemptToken.length > 0,
    Number.isSafeInteger(operation?.createAdmissionAttemptSeq) &&
      operation.createAdmissionAttemptSeq > 0,
    Number.isSafeInteger(operation?.createAdmissionWorkflowUpdatedAt),
    Number.isSafeInteger(operation?.createAdmissionOwnerIncarnation) &&
      operation.createAdmissionOwnerIncarnation > 0,
  ].every(Boolean);
}

function requiresPartitionCreateGrant(operation) {
  return operation?.entityType === SERVICE_TYPE.PARTITION &&
    (operation.type === OperationType.ADD || operation.type === OperationType.REPLACE);
}

function hasLiveCreateGrant(operation) {
  return hasDurableCreateDispatchTuple(operation) &&
    (operation.createAdmissionState === CREATE_ADMISSION_STATE.ADMITTED ||
      operation.createAdmissionState === CREATE_ADMISSION_STATE.MATERIALIZED ||
      operation.createAdmissionState === CREATE_ADMISSION_STATE.ACTIVE);
}

function matchesRequestedCreateGrant(requested, durable) {
  if (!hasLiveCreateGrant(durable)) return false;
  if (requested.createAdmissionAttemptToken != null) {
    return requested.createAdmissionAttemptToken === durable.createAdmissionAttemptToken &&
      requested.createAdmissionToken === durable.createAdmissionToken &&
      requested.createAdmissionAttemptSeq === durable.createAdmissionAttemptSeq &&
      requested.createAdmissionReplicaCreatedAt === durable.createAdmissionReplicaCreatedAt &&
      requested.createAdmissionWorkflowUpdatedAt === durable.createAdmissionWorkflowUpdatedAt &&
      requested.createAdmissionOwnerIncarnation === durable.createAdmissionOwnerIncarnation;
  }
  const admissionToken = buildReplicaCreateAdmissionToken(requested);
  return admissionToken !== null && durable.createAdmissionToken === admissionToken &&
    durable.createAdmissionAttemptToken === buildReplicaCreateAttemptToken(admissionToken, 1) &&
    durable.createAdmissionAttemptSeq === 1 &&
    durable.createAdmissionWorkflowUpdatedAt === requested.updatedAt;
}

export {hasDurableCreateDispatchTuple, hasLiveCreateGrant, matchesRequestedCreateGrant,
  operationCarriesReplicaCreateAdmission, requiresPartitionCreateGrant};
