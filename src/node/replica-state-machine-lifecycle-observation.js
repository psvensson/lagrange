import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';

const READ_REPLICA_LIFECYCLE_SQL = `SELECT
  service_id,
  replica_id,
  group_id,
  partition_id,
  node_id,
  service_type,
  status,
  address,
  previous_state,
  trigger_reason,
  error_message,
  cleanup_token,
  create_attempt_token,
  created_at,
  state_entered_at,
  updated_at
FROM services
WHERE service_id = ?`;
const READ_PARTITION_LEADER_SQL = `SELECT
  partition_id,
  leader_node_id,
  updated_at
FROM partitions
WHERE partition_id = ?`;
const DURABLE_VERSION_COLUMN = Object.freeze({
  STATE_ENTERED_AT: 'state_entered_at',
  UPDATED_AT: 'updated_at',
});
const NO_REPLICA_LIFECYCLE_MUTATION_PREDICATE = Object.freeze({});

function durableRowVersion(service) {
  if (Number.isFinite(service?.state_entered_at)) {
    return {
      column: DURABLE_VERSION_COLUMN.STATE_ENTERED_AT,
      value: service.state_entered_at,
    };
  }
  if (Number.isFinite(service?.updated_at)) {
    return {
      column: DURABLE_VERSION_COLUMN.UPDATED_AT,
      value: service.updated_at,
    };
  }
  return null;
}

// A new lifecycle state entry is strictly later than the generation it
// supersedes, even when the clock is unchanged or regressed; otherwise a
// delayed CAS or removal fenced on the superseded generation could match the
// new state (same-state ABA). Every replica lifecycle owner stamps through this.
function nextLifecycleStateEntry(observedNow, supersededVersion) {
  return Number.isFinite(supersededVersion) ?
    Math.max(observedNow, supersededVersion + 1) : observedNow;
}

function buildLifecycleIdentityPredicate(fields, version) {
  if (typeof fields.serviceId !== 'string' ||
      typeof fields.serviceType !== 'string' ||
      typeof fields.partitionId !== 'string' ||
      typeof fields.nodeId !== 'string' ||
      typeof fields.replicaIdentity !== 'string' ||
      !Number.isFinite(fields.createdAt) ||
      typeof fields.status !== 'string' ||
      !version) {
    return NO_REPLICA_LIFECYCLE_MUTATION_PREDICATE;
  }
  return Object.freeze({
    service_id: fields.serviceId,
    service_type: fields.serviceType,
    partition_id: fields.partitionId,
    node_id: fields.nodeId,
    replica_id: fields.replicaIdentity,
    group_id: fields.groupId ?? null,
    created_at: fields.createdAt,
    status: fields.status,
    cleanup_token: fields.cleanupToken ?? null,
    create_attempt_token: fields.createAttemptToken ?? null,
    [version.column]: version.value,
  });
}

function buildReplicaLifecycleMutationPredicateFromRow(row) {
  return buildLifecycleIdentityPredicate({
    serviceId: row?.service_id,
    serviceType: row?.service_type,
    partitionId: row?.partition_id,
    nodeId: row?.node_id,
    replicaIdentity: row?.replica_id,
    groupId: row?.group_id,
    createdAt: row?.created_at,
    status: row?.status,
    cleanupToken: row?.cleanup_token,
    createAttemptToken: row?.create_attempt_token,
  }, durableRowVersion(row));
}

function buildReplicaLifecyclePredicateFromState(replicaState) {
  const version = Number.isFinite(replicaState.durableVersion) &&
      typeof replicaState.durableVersionColumn === 'string' ?
    {
      column: replicaState.durableVersionColumn,
      value: replicaState.durableVersion,
    } :
    null;
  return buildLifecycleIdentityPredicate({
    serviceId: replicaState.serviceId || replicaState.replicaId,
    serviceType: replicaState.serviceType,
    partitionId: replicaState.partitionId,
    nodeId: replicaState.nodeId,
    replicaIdentity: replicaState.replicaIdentity,
    groupId: replicaState.groupId,
    createdAt: replicaState.createdAt,
    status: replicaState.state,
    cleanupToken: replicaState.cleanupToken,
    createAttemptToken: replicaState.createAttemptToken,
  }, version);
}

function buildReplicaLifecycleMutationPredicateFromState(replicaState) {
  if (replicaState?.lifecycleIdentityAuthoritative !== true) {
    return NO_REPLICA_LIFECYCLE_MUTATION_PREDICATE;
  }
  return buildReplicaLifecyclePredicateFromState(replicaState);
}

function isReplicaLifecycleMutationPredicate(value) {
  return value !== NO_REPLICA_LIFECYCLE_MUTATION_PREDICATE;
}

function rowMatchesReplicaLifecyclePredicate(row, predicate) {
  return isReplicaLifecycleMutationPredicate(predicate) &&
    Object.entries(predicate).every(
      ([field, value]) => row?.[field] === value,
    );
}

async function readOneAuthoritativeRow(
  stateMachine,
  tableName,
  sql,
  key,
  coalescingKey,
) {
  const result = await readAuthoritativeControlPlaneRows(
    stateMachine.getControlPlaneSystemTableGateway(),
    tableName,
    sql,
    [key],
    {
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      coalescingKey,
      deliveryPriority: 'critical',
      workClass: 'critical',
    },
  );
  if (result?.success !== true || !Array.isArray(result.rows) ||
      result.rows.length > 1) {
    return Object.freeze({available: false, row: null});
  }
  return Object.freeze({
    available: true,
    row: result.rows.length === 1 ? result.rows[0] : null,
  });
}

async function observeAuthoritativeReplicaLifecycle(stateMachine, replicaId) {
  return readOneAuthoritativeRow(
    stateMachine,
    TABLES.SERVICES,
    READ_REPLICA_LIFECYCLE_SQL,
    replicaId,
    `replica-state-authority:${replicaId}`,
  );
}

async function readAuthoritativeReplicaLifecycle(stateMachine, replicaId) {
  const observation = await observeAuthoritativeReplicaLifecycle(
    stateMachine,
    replicaId,
  );
  return observation.available ? observation.row : null;
}

async function readAuthoritativePartitionLeader(stateMachine, partitionId) {
  const observation = await readOneAuthoritativeRow(
    stateMachine,
    TABLES.PARTITIONS,
    READ_PARTITION_LEADER_SQL,
    partitionId,
    `partition-leader-authority:${partitionId}`,
  );
  return observation.available ? observation.row : null;
}

function rowMatchesReplicaLifecycle(row, replicaState) {
  return rowMatchesReplicaLifecyclePredicate(
    row,
    buildReplicaLifecyclePredicateFromState(replicaState),
  );
}

// The same incarnation in the same state, whatever its durable version: the
// identity fields and the status of the state's predicate, the version left
// out (the create-SYNCING edge's idempotence; nothing else may use it).
function rowHoldsReplicaIncarnation(row, replicaState) {
  if (!replicaState || typeof replicaState !== 'object') return false;
  const predicate = buildReplicaLifecyclePredicateFromState(replicaState);
  if (!isReplicaLifecycleMutationPredicate(predicate)) return false;
  return Object.entries(predicate).every(([field, value]) =>
    field === replicaState.durableVersionColumn || row?.[field] === value);
}

async function installAuthoritativeReplicaLifecycleSnapshot(
  stateMachine,
  service,
  nodeId,
  observedVersion,
) {
  if (!observedVersion) return false;
  const replicaId = service.service_id;
  const registered = await Promise.resolve(
    stateMachine.registerReplicaSnapshot(replicaId, {
      partitionId: service.partition_id,
      nodeId,
      state: service.status,
      serviceId: replicaId,
      serviceType: service.service_type,
      serviceAddress: service.address,
      replicaIdentity: service.replica_id,
      groupId: service.group_id,
      cleanupToken: service.cleanup_token,
      createAttemptToken: service.create_attempt_token,
      createdAt: service.created_at,
      durableVersionColumn: observedVersion.column,
      durableVersion: observedVersion.value,
      durableUpdatedAt: service.updated_at,
      authoritativeSnapshot: true,
    }),
  );
  if (registered !== true) return false;
  const installedState = stateMachine.replicas.get(replicaId) || false;
  if (installedState?.state !== service.status ||
      installedState.durableVersionColumn !== observedVersion.column ||
      installedState.durableVersion !== observedVersion.value) {
    return false;
  }
  return installedState;
}

function resolveReplicaCreateGroupId(stateMachine, replicaState, serviceId) {
  if (replicaState.lifecycleIdentityAuthoritative === true ||
      typeof replicaState.groupId === 'string') {
    return replicaState.groupId ?? null;
  }
  const cachedRow = typeof stateMachine.systemTableCache?.get === 'function' ?
    stateMachine.systemTableCache.get(TABLES.SERVICES, serviceId) :
    null;
  return typeof cachedRow?.group_id === 'string' &&
    cachedRow.group_id.length > 0 ? cachedRow.group_id : null;
}

export {
  DURABLE_VERSION_COLUMN,
  buildReplicaLifecycleMutationPredicateFromRow,
  buildReplicaLifecycleMutationPredicateFromState,
  durableRowVersion,
  isReplicaLifecycleMutationPredicate,
  nextLifecycleStateEntry,
  installAuthoritativeReplicaLifecycleSnapshot,
  observeAuthoritativeReplicaLifecycle,
  readAuthoritativePartitionLeader,
  readAuthoritativeReplicaLifecycle,
  resolveReplicaCreateGroupId,
  rowHoldsReplicaIncarnation,
  rowMatchesReplicaLifecycle,
  rowMatchesReplicaLifecyclePredicate,
};
