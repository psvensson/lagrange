import {mintServiceRowCreatedAt} from './service-row-incarnation.js';

const createAdmissionEvidence = new WeakSet();

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
    return null;
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
