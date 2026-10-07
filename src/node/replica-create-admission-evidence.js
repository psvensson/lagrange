import {mintServiceRowCreatedAt} from './service-row-incarnation.js';

const createAdmissionEvidence = new WeakSet();
const INVALID_REPLICA_CREATE_ADMISSION_EVIDENCE = null;
const REPLICA_CREATE_INSTALL_AUTHORITY_FIELDS = Object.freeze([
  'operationId', 'operationType', 'entityType', 'entityId', 'partitionId',
  'replicaId', 'targetNodeId', 'admissionToken', 'attemptToken', 'attemptSeq',
  'workflowUpdatedAt', 'replicaCreatedAt',
]);
const REPLICA_CREATE_INSTALL_AUTHORITY_STRING_FIELDS = Object.freeze(
  REPLICA_CREATE_INSTALL_AUTHORITY_FIELDS.slice(0, 9));

function sealReplicaCreateAdmissionEvidence(record) {
  const evidence = Object.freeze({...record});
  createAdmissionEvidence.add(evidence);
  return evidence;
}

function reserveReplicaCreateAdmissionGeneration(record, timestamp) {
  return sealReplicaCreateAdmissionEvidence({
    ...record,
    replicaCreatedAt: mintServiceRowCreatedAt(timestamp),
  });
}

function adoptReplicaCreateAdmissionGeneration(record) {
  if (!Number.isSafeInteger(record?.replicaCreatedAt) ||
      typeof record?.admissionToken !== 'string' ||
      typeof record?.attemptToken !== 'string' ||
      !Number.isSafeInteger(record?.attemptSeq)) {
    return INVALID_REPLICA_CREATE_ADMISSION_EVIDENCE;
  }
  return sealReplicaCreateAdmissionEvidence(record);
}

function isReplicaCreateAdmissionEvidence(value) {
  return value !== null && typeof value === 'object' &&
    createAdmissionEvidence.has(value);
}

function isReplicaCreateInstallAuthority(value) {
  if (value === null || typeof value !== 'object' ||
      Object.keys(value).length !== REPLICA_CREATE_INSTALL_AUTHORITY_FIELDS.length ||
      !REPLICA_CREATE_INSTALL_AUTHORITY_FIELDS.every((field) =>
        Object.hasOwn(value, field))) return false;
  return REPLICA_CREATE_INSTALL_AUTHORITY_STRING_FIELDS.every((field) =>
    typeof value[field] === 'string' &&
      value[field].length > 0) &&
    Number.isSafeInteger(value.attemptSeq) && value.attemptSeq > 0 &&
    Number.isSafeInteger(value.workflowUpdatedAt) &&
    Number.isSafeInteger(value.replicaCreatedAt);
}

function replicaCreateInstallAuthority(evidence) {
  if (!isReplicaCreateAdmissionEvidence(evidence)) return false;
  return Object.freeze(Object.fromEntries(
    REPLICA_CREATE_INSTALL_AUTHORITY_FIELDS.map(
      (field) => [field, evidence[field]]),
  ));
}

function replicaCreateInstallAuthoritiesEqual(left, right) {
  return isReplicaCreateInstallAuthority(left) &&
    isReplicaCreateInstallAuthority(right) &&
    REPLICA_CREATE_INSTALL_AUTHORITY_FIELDS.every((field) =>
      left[field] === right[field]);
}

export {
  adoptReplicaCreateAdmissionGeneration,
  isReplicaCreateAdmissionEvidence,
  isReplicaCreateInstallAuthority,
  replicaCreateInstallAuthority,
  replicaCreateInstallAuthoritiesEqual,
  reserveReplicaCreateAdmissionGeneration,
};
