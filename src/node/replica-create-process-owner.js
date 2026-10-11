import {
  isReplicaCreateAdmissionEvidence,
  isReplicaCreateInstallAuthority,
  replicaCreateInstallAuthority,
} from './replica-create-admission-evidence.js';

const SNAPSHOT_INSTALL_MUTATION_SYNC_ERROR =
  'snapshot install mutation must be synchronous';
const ASYNC_FUNCTION_NAME = 'AsyncFunction';
const CLOSED_ADMISSION_STATE = 'CLOSED';
const CREATE_ADMISSION_DEFERRED = 'REPLICA_CREATE_ADMISSION_DEFERRED';
// A caller's admission basis: exact columns it read that must still hold at
// this owner's row check (the admission CAS, its advances and the install
// commit). None by default, so the partition path is unchanged.
const NO_ADMISSION_BASIS = Object.freeze({});

function rowMatchesAdmissionBasis(row, basis) {
  return Object.entries(basis).every(([column, value]) =>
    (row?.[column] ?? null) === value);
}

function matchesPhysicalWorkerOwner(owner, evidence) {
  return evidence?.ownerIncarnation === owner.ownerIncarnation;
}

function nullableSafeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) ? normalized : null;
}

function rowMatchesPhysicalWorkerEvidence(row, evidence) {
  const expected = {
    operation_id: evidence?.operationId,
    type: evidence?.operationType,
    entity_type: evidence?.entityType,
    entity_id: evidence?.entityId,
    partition_id: evidence?.partitionId,
    replica_id: evidence?.replicaId,
    target_node_id: evidence?.targetNodeId,
    create_admission_token: evidence?.admissionToken,
  };
  return Object.entries(expected).every(([field, value]) =>
    row?.[field] === value) &&
    nullableSafeInteger(row?.create_admission_replica_created_at) ===
      evidence?.replicaCreatedAt;
}

function rowMatchesSnapshotInstallAuthority(row, authority) {
  if (!isReplicaCreateInstallAuthority(authority)) return false;
  const expected = {
    operation_id: authority.operationId,
    type: authority.operationType,
    entity_type: authority.entityType,
    entity_id: authority.entityId,
    partition_id: authority.partitionId,
    replica_id: authority.replicaId,
    target_node_id: authority.targetNodeId,
    create_admission_token: authority.admissionToken,
    create_admission_attempt_token: authority.attemptToken,
    create_admission_attempt_seq: authority.attemptSeq,
    create_admission_workflow_updated_at: authority.workflowUpdatedAt,
    create_admission_replica_created_at: authority.replicaCreatedAt,
  };
  return Object.entries(expected).every(([field, value]) =>
    row?.[field] === value);
}

const physicalWorkerClaims = new WeakSet();
const physicalWorkerEvidence = new WeakMap();

function isPhysicalWorkerClaim(value) {
  return typeof value === 'object' && value !== null &&
    physicalWorkerClaims.has(value);
}

function replicaCreatePhysicalWorkerEvidence(claim) {
  return isPhysicalWorkerClaim(claim) ?
    physicalWorkerEvidence.get(claim) || null : null;
}

function advanceReplicaCreatePhysicalWorker(owner, claim, expectedEvidence,
  evidence) {
  const previous = replicaCreatePhysicalWorkerEvidence(claim);
  if (!previous || previous !== expectedEvidence ||
      owner.activePhysicalWorkerOperationIds.get(previous.operationId) !==
        claim || previous.operationId !== evidence?.operationId) return false;
  physicalWorkerEvidence.set(claim, evidence);
  return true;
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

function claimReplicaCreatePhysicalWorker(owner, evidence) {
  if (!matchesPhysicalWorkerOwner(owner, evidence)) {
    return false;
  }
  const claim = Object.freeze({});
  if (owner.activePhysicalWorkerOperationIds.has(evidence.operationId)) {
    return false;
  }
  owner.activePhysicalWorkerOperationIds.set(evidence.operationId, claim);
  physicalWorkerClaims.add(claim);
  physicalWorkerEvidence.set(claim, evidence);
  return claim;
}

async function claimReplicaCreateDurablePhysicalWorker(owner, evidence) {
  if (!isReplicaCreateAdmissionEvidence(evidence)) return false;
  const claim = claimReplicaCreatePhysicalWorker(owner, evidence);
  if (!claim) return false;
  try {
    await owner.requireCurrentBootIncarnation();
    const row = await owner.readOperation(evidence.operationId);
    await owner.requireCurrentBootIncarnation();
    const currentEvidence = replicaCreatePhysicalWorkerEvidence(claim);
    if (!rowMatchesPhysicalWorkerEvidence(row, evidence) ||
        row?.create_admission_attempt_token !== evidence.attemptToken ||
        nullableSafeInteger(row?.create_admission_attempt_seq) !==
          evidence.attemptSeq ||
        row?.create_admission_state === CLOSED_ADMISSION_STATE ||
        currentEvidence !== evidence) {
      releaseReplicaCreatePhysicalWorker(owner, claim);
      return false;
    }
    return claim;
  } catch (error) {
    releaseReplicaCreatePhysicalWorker(owner, claim);
    throw error;
  }
}

async function revalidateReplicaCreatePhysicalWorker(owner, claim,
  expectedEvidence = null) {
  const evidence = replicaCreatePhysicalWorkerEvidence(claim);
  if (!isPhysicalWorkerClaim(claim) ||
      expectedEvidence && evidence !== expectedEvidence ||
      !matchesPhysicalWorkerOwner(owner, evidence) ||
      owner.activePhysicalWorkerOperationIds.get(evidence.operationId) !==
        claim) {
    return false;
  }
  await owner.requireCurrentBootIncarnation();
  return owner.activePhysicalWorkerOperationIds.get(evidence.operationId) ===
    claim && replicaCreatePhysicalWorkerEvidence(claim) === evidence;
}

function releaseReplicaCreatePhysicalWorker(owner, claim) {
  if (!isPhysicalWorkerClaim(claim)) return false;
  const operationId = replicaCreatePhysicalWorkerEvidence(claim)?.operationId;
  if (!operationId) return false;
  if (owner.activePhysicalWorkerOperationIds.get(operationId) !== claim ||
      owner.physicalWorkerCommitClaim === claim) return false;
  return owner.activePhysicalWorkerOperationIds.delete(operationId);
}

function runReplicaCreatePhysicalCommit(owner, claim, evidence, mutation) {
  if (!isPhysicalWorkerClaim(claim) ||
      !matchesPhysicalWorkerOwner(owner, evidence) ||
      replicaCreatePhysicalWorkerEvidence(claim) !== evidence ||
      owner.activePhysicalWorkerOperationIds.get(evidence.operationId) !==
        claim || owner.physicalWorkerCommitClaim) return false;
  owner.physicalWorkerCommitClaim = claim;
  try {
    return mutation();
  } finally {
    owner.physicalWorkerCommitClaim = null;
  }
}

function snapshotReplicaCreateInstallAuthority(owner, claim,
  expectedEvidence = null) {
  const evidence = replicaCreatePhysicalWorkerEvidence(claim);
  if (expectedEvidence && evidence !== expectedEvidence) return false;
  return replicaCreateInstallAuthority(evidence);
}

async function commitReplicaCreateSnapshotInstall(owner, claim, mutation,
  admissionBasis = NO_ADMISSION_BASIS) {
  if (!await revalidateReplicaCreatePhysicalWorker(owner, claim) ||
      typeof mutation !== 'function' ||
      mutation.constructor.name === ASYNC_FUNCTION_NAME) return false;
  const evidence = replicaCreatePhysicalWorkerEvidence(claim);
  const authority = replicaCreateInstallAuthority(evidence);
  if (!isReplicaCreateInstallAuthority(authority)) return false;
  // The boot fence is read BEFORE the operation row, so the row read is the
  // last await: the authority, this owner's incarnation and the caller's
  // basis (a message-group learner's recorded fact, an open operation, the
  // MATERIALIZED admission) are checked on it and the swap runs
  // synchronously. The partition path shares this order. A newer boot acts on
  // the admission only after its takeover rewrites the owner incarnation, so
  // a takeover recorded while the row read is in flight is seen; a bare boot
  // change leaves this effect the sole worker.
  await owner.requireCurrentBootIncarnation();
  const row = await owner.readOperation(authority.operationId);
  if (!rowMatchesSnapshotInstallAuthority(row, authority) ||
      nullableSafeInteger(row?.create_admission_owner_incarnation) !==
        owner.ownerIncarnation ||
      !rowMatchesAdmissionBasis(row, admissionBasis)) return false;
  // No await is permitted after the authoritative read. Cleanup consults the
  // active claim, and rotation requires the exact row to have advanced.
  return runReplicaCreatePhysicalCommit(owner, claim, evidence, () => {
    const result = mutation(authority);
    if (result && typeof result.then === 'function') {
      throw new TypeError(SNAPSHOT_INSTALL_MUTATION_SYNC_ERROR);
    }
    return result === true;
  });
}

function requireReplicaCreateRotationWorkerClaim(owner, evidence, claim) {
  const activeClaim = owner.activePhysicalWorkerOperationIds.get(
    evidence.operationId);
  if (!activeClaim || activeClaim === claim) return;
  const error = new Error(
    `CREATE attempt rotation waits for physical worker ${evidence.operationId}`,
  );
  error.code = CREATE_ADMISSION_DEFERRED;
  error.errorCode = CREATE_ADMISSION_DEFERRED;
  error.operationId = evidence.operationId;
  error.deferRetry = true;
  throw error;
}

function hasReplicaCreatePhysicalWorkerForGeneration(owner, generation) {
  return [...owner.activePhysicalWorkerOperationIds.values()].some((claim) => {
    const evidence = replicaCreatePhysicalWorkerEvidence(claim);
    return evidence?.replicaId === generation.replicaId &&
      evidence?.replicaCreatedAt === generation.replicaCreatedAt &&
      evidence?.attemptToken === generation.attemptToken;
  });
}

export {
  NO_ADMISSION_BASIS,
  advanceReplicaCreatePhysicalWorker,
  claimReplicaCreateDurablePhysicalWorker,
  claimReplicaCreatePhysicalWorker,
  commitReplicaCreateSnapshotInstall,
  hasReplicaCreatePhysicalWorkerForGeneration,
  releaseReplicaCreatePhysicalWorker,
  requireReplicaCreateRotationWorkerClaim,
  revalidateReplicaCreatePhysicalWorker,
  replicaCreatePhysicalWorkerEvidence,
  rowMatchesAdmissionBasis,
  runReplicaCreatePhysicalCommit,
  runReplicaCreateExclusive,
  snapshotReplicaCreateInstallAuthority,
};
