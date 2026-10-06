import {mintServiceRowCreatedAt} from './service-row-incarnation.js';

const createAdmissionEvidence = new WeakSet();
const INVALID_REPLICA_CREATE_ADMISSION_EVIDENCE = null;

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

export {
  adoptReplicaCreateAdmissionGeneration,
  isReplicaCreateAdmissionEvidence,
  reserveReplicaCreateAdmissionGeneration,
};
