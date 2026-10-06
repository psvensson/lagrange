const CREATE_ADMISSION_TOKEN_PREFIX = 'replica-create-admission:v1';

function buildReplicaCreateAdmissionToken(operation = {}) {
  const operationId = String(operation.operationId || '').trim();
  const replicaId = String(operation.replicaId || '').trim();
  const targetNodeId = String(operation.targetNodeId || '').trim();
  const workflowUpdatedAt = Number(operation.workflowUpdatedAt ??
    operation.updatedAt);
  if (!operationId || !replicaId || !targetNodeId ||
      !Number.isSafeInteger(workflowUpdatedAt)) {
    return null;
  }
  return [CREATE_ADMISSION_TOKEN_PREFIX, operationId, replicaId,
    targetNodeId, workflowUpdatedAt].join(':');
}

function buildReplicaCreateAttemptToken(admissionToken, attemptSeq) {
  if (typeof admissionToken !== 'string' || admissionToken.length === 0 ||
      !Number.isSafeInteger(attemptSeq) || attemptSeq < 1) {
    return null;
  }
  return `${admissionToken}:attempt:${attemptSeq}`;
}

export {
  buildReplicaCreateAdmissionToken,
  buildReplicaCreateAttemptToken,
};
