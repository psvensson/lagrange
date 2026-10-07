import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {hasReplicaCreatePhysicalWorkerForGeneration} from
  './replica-create-process-owner.js';

const CLOSED_ADMISSION_STATE = 'CLOSED';

function nullableSafeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) ? normalized : null;
}

function lifecycleReplicaId(lifecycle) {
  return lifecycle?.replicaId ?? lifecycle?.replicaIdentity ??
    lifecycle?.serviceId ?? null;
}

function isOpenAdmissionForIncarnation(row, createdAt) {
  return nullableSafeInteger(row.create_admission_replica_created_at) ===
    createdAt && row.create_admission_state !== CLOSED_ADMISSION_STATE;
}

function attemptTokenMatches(row, attemptToken) {
  return (row.create_admission_attempt_token ?? null) === attemptToken;
}

function rowRetainsClosedIdentity(current, row, createdAt) {
  const expected = {
    operation_id: row.operation_id,
    type: row.type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    partition_id: row.partition_id,
    replica_id: row.replica_id,
    target_node_id: row.target_node_id,
    create_admission_token: row.create_admission_token,
    create_admission_replica_created_at: createdAt,
  };
  return current?.create_admission_state === CLOSED_ADMISSION_STATE &&
    Object.entries(expected).every(([field, value]) =>
      current?.[field] === value);
}

async function closeAdmissionRow(owner, row, createdAt, attemptToken) {
  const result = await owner.gateway.updateSystemTableRow(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    {
      operation_id: row.operation_id,
      create_admission_state: row.create_admission_state,
      create_admission_token: row.create_admission_token,
      create_admission_replica_created_at: createdAt,
      create_admission_attempt_token: attemptToken,
      create_admission_attempt_seq: row.create_admission_attempt_seq,
    },
    {
      create_admission_state: CLOSED_ADMISSION_STATE,
      create_admission_owner_incarnation: owner.ownerIncarnation,
    },
    {allowCoalescing: false, deliveryPriority: 'critical', workClass: 'critical'},
  );
  if (classifyControlPlaneMutationResult(result).applied) return true;
  const current = await owner.readOperation(row.operation_id);
  return rowRetainsClosedIdentity(current, row, createdAt);
}

async function closeReplicaCreateAdmissionForLifecycle(owner, lifecycle) {
  const replicaId = lifecycleReplicaId(lifecycle);
  const replicaCreatedAt = nullableSafeInteger(lifecycle?.createdAt);
  const attemptToken = lifecycle?.createAttemptToken ?? null;
  if (!replicaId || replicaCreatedAt === null) return false;
  if (attemptToken === null) return true;
  const generation = {replicaId, replicaCreatedAt, attemptToken};
  if (hasReplicaCreatePhysicalWorkerForGeneration(owner, generation)) {
    return false;
  }
  const rows = await owner.readReplicaAdmissions(replicaId);
  const sameIncarnation = rows.filter((row) =>
    isOpenAdmissionForIncarnation(row, replicaCreatedAt));
  if (sameIncarnation.some((row) =>
    !attemptTokenMatches(row, attemptToken))) return false;
  const matching = sameIncarnation.filter((row) =>
    attemptTokenMatches(row, attemptToken));
  if (matching.some((row) =>
    owner.activePhysicalWorkerOperationIds.has(row.operation_id))) return false;
  for (const row of matching) {
    if (!await closeAdmissionRow(
      owner, row, replicaCreatedAt, attemptToken)) return false;
  }
  return true;
}

export {closeReplicaCreateAdmissionForLifecycle};
