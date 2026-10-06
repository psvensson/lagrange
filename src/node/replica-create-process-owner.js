function matchesPhysicalWorkerOwner(owner, evidence) {
  return evidence?.ownerIncarnation === owner.ownerIncarnation;
}

function runReplicaCreateExclusive(owner, operationId, work) {
  const key = String(operationId || '').trim();
  const previous = owner.laneTailByOperationId.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(work);
  const tail = current.catch(() => undefined).finally(() => {
    if (owner.laneTailByOperationId.get(key) === tail) {
      owner.laneTailByOperationId.delete(key);
    }
  });
  owner.laneTailByOperationId.set(key, tail);
  return current;
}

async function claimReplicaCreatePhysicalWorker(owner, evidence) {
  if (!matchesPhysicalWorkerOwner(owner, evidence) ||
      owner.activePhysicalWorkerOperationIds.has(evidence.operationId)) {
    return false;
  }
  await owner.requireCurrentBootIncarnation();
  owner.activePhysicalWorkerOperationIds.add(evidence.operationId);
  return true;
}

async function revalidateReplicaCreatePhysicalWorker(owner, evidence) {
  if (!matchesPhysicalWorkerOwner(owner, evidence) ||
      !owner.activePhysicalWorkerOperationIds.has(evidence.operationId)) {
    return false;
  }
  await owner.requireCurrentBootIncarnation();
  return true;
}

function releaseReplicaCreatePhysicalWorker(owner, operationId) {
  return owner.activePhysicalWorkerOperationIds.delete(operationId);
}

export {
  claimReplicaCreatePhysicalWorker,
  releaseReplicaCreatePhysicalWorker,
  revalidateReplicaCreatePhysicalWorker,
  runReplicaCreateExclusive,
};
