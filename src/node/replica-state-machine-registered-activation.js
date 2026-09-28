import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  installAuthoritativeReplicaLifecycleInLane,
} from './replica-state-machine-recovery.js';
import {
  buildReplicaLifecycleMutationPredicateFromRow,
  durableRowVersion,
  isReplicaLifecycleMutationPredicate,
  rowMatchesReplicaLifecyclePredicate,
} from
  './replica-state-machine-lifecycle-observation.js';
import {runSerializedReplicaMutation} from
  './replica-state-machine-serialization.js';
import {isPartitionRegistrationEvidence} from
  '../partition/partition-service-row-owner.js';

const REGISTERED_REPLICA_POINT_READ_SQL =
  'SELECT * FROM services WHERE service_id = ?';
const REGISTERED_REPLICA_ACTIVATION_REASON = 'registered_runtime_ready';
const REGISTERED_REPLICA_ACTIVATION_EVIDENCE_OPTION =
  'registrationEvidence';
const REPLICA_REGISTERED_ACTIVATION_ERROR_CODE = Object.freeze({
  AUTHORITY_UNAVAILABLE: 'REPLICA_ACTIVATION_AUTHORITY_UNAVAILABLE',
  DURABILITY_DEFERRED: 'REPLICA_ACTIVATION_DURABILITY_DEFERRED',
  SOURCE_CHANGED: 'REPLICA_ACTIVATION_SOURCE_CHANGED',
});

function activationError(code, replicaId, cause = null) {
  const error = new Error(`Replica activation ${code}: ${replicaId}`);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = true;
  if (cause) error.cause = cause;
  return error;
}

function matchesRegisteredReplicaIdentity(row, options) {
  return row?.service_id === options.replicaId &&
    row.service_type === SERVICE_TYPE.PARTITION &&
    row.partition_id === options.partitionId &&
    row.node_id === options.nodeId &&
    row.replica_id === options.replicaId &&
    row.group_id === null;
}

function durableReplicaIncarnation(row) {
  return Number.isSafeInteger(row?.[COLUMN.CREATED_AT]) ?
    row[COLUMN.CREATED_AT] :
    null;
}

function matchesRegisteredReplicaIncarnation(row, sourceRow, options) {
  const sourceIncarnation = durableReplicaIncarnation(sourceRow);
  return sourceIncarnation !== null &&
    matchesRegisteredReplicaIdentity(row, options) &&
    durableReplicaIncarnation(row) === sourceIncarnation;
}

async function observeRegisteredReplica(writer, replicaId) {
  try {
    const result = await readAuthoritativeControlPlaneRows(
      writer,
      TABLES.SERVICES,
      REGISTERED_REPLICA_POINT_READ_SQL,
      [replicaId],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
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
  } catch (_error) {
    return Object.freeze({available: false, row: null});
  }
}

function buildActivatedRow(sourceRow, sourceVersion) {
  // Registration evidence must name one replay-stable destination. Using the
  // caller's later wall clock minted a different ACTIVE generation on every
  // duplicate delivery, so a successful first application became
  // indistinguishable from a conflicting generation. The strict successor of
  // the exact registered generation is causal, monotonic and idempotent.
  const timestamp = sourceVersion.value + 1;
  return {
    ...sourceRow,
    status: SERVICE_STATUS.ACTIVE,
    state_entered_at: timestamp,
    previous_state: SERVICE_STATUS.STOPPED,
    trigger_reason: REGISTERED_REPLICA_ACTIVATION_REASON,
    error_message: null,
    updated_at: timestamp,
  };
}

// The destination is identified by identity, status and lifecycle generation
// only; role/heartbeat metadata may have advanced updated_at since.
function matchesActivatedGeneration(row, activatedRow) {
  return rowMatchesReplicaLifecyclePredicate(
    row,
    buildReplicaLifecycleMutationPredicateFromRow(activatedRow),
  );
}

async function persistRegisteredReplicaActivation(
  stateMachine,
  options,
  sourceRow,
  sourceVersion,
) {
  const activatedRow = buildActivatedRow(
    sourceRow,
    sourceVersion,
  );
  const lifecycleData = {
    status: activatedRow.status,
    state_entered_at: activatedRow.state_entered_at,
    previous_state: activatedRow.previous_state,
    trigger_reason: activatedRow.trigger_reason,
    error_message: activatedRow.error_message,
    updated_at: activatedRow.updated_at,
  };
  let mutationResult = null;
  let mutationError = null;
  const whereClause =
    buildReplicaLifecycleMutationPredicateFromRow(sourceRow);
  if (!isReplicaLifecycleMutationPredicate(whereClause)) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED,
      options.replicaId,
    );
  }
  try {
    mutationResult = await options.systemTableWriter.updateSystemTableRow(
      TABLES.SERVICES,
      whereClause,
      lifecycleData,
      options.writeOptions,
    );
  } catch (error) {
    mutationError = error;
  }
  if (classifyControlPlaneMutationResult(mutationResult).applied) {
    return activatedRow;
  }

  const observation = await observeRegisteredReplica(
    options.systemTableWriter,
    options.replicaId,
  );
  if (!observation.available) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE,
      options.replicaId,
      mutationError,
    );
  }
  if (matchesActivatedGeneration(observation.row, activatedRow)) {
    return activatedRow;
  }
  if (matchesRegisteredReplicaIncarnation(
    observation.row,
    sourceRow,
    options,
  ) &&
      observation.row.status === SERVICE_STATUS.STOPPED &&
      observation.row[sourceVersion.column] === sourceVersion.value) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.DURABILITY_DEFERRED,
      options.replicaId,
      mutationError,
    );
  }
  throw activationError(
    REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED,
    options.replicaId,
    mutationError,
  );
}

function hasRegistrationEvidence(options) {
  return (
    Object.prototype.hasOwnProperty.call(
      options,
      REGISTERED_REPLICA_ACTIVATION_EVIDENCE_OPTION,
    ) &&
    options.registrationEvidence !== undefined
  );
}

function resolveRegistrationEvidence(options) {
  const evidence = options.registrationEvidence;
  if (!isPartitionRegistrationEvidence(evidence) ||
      !matchesRegisteredReplicaIdentity(evidence, options) ||
      evidence.status !== SERVICE_STATUS.STOPPED ||
      durableReplicaIncarnation(evidence) === null ||
      !durableRowVersion(evidence)) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED,
      options.replicaId,
    );
  }
  return evidence;
}

function resolveObservedSourceRow(observation, options) {
  if (!observation.available) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE,
      options.replicaId,
    );
  }
  const sourceRow = observation.row;
  const validStatus = sourceRow?.status === SERVICE_STATUS.ACTIVE ||
    (sourceRow?.status === SERVICE_STATUS.STOPPED &&
      durableRowVersion(sourceRow));
  if (!matchesRegisteredReplicaIdentity(sourceRow, options) ||
      durableReplicaIncarnation(sourceRow) === null ||
      !validStatus) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED,
      options.replicaId,
    );
  }
  return sourceRow;
}

async function resolveRegisteredReplicaSourceRow(options) {
  if (hasRegistrationEvidence(options)) {
    return resolveRegistrationEvidence(options);
  }
  const observation = await observeRegisteredReplica(
    options.systemTableWriter,
    options.replicaId,
  );
  return resolveObservedSourceRow(observation, options);
}

async function activateRegisteredReplicaInLane(stateMachine, options) {
  const sourceRow = await resolveRegisteredReplicaSourceRow(options);
  let activatedRow = sourceRow;
  if (sourceRow.status !== SERVICE_STATUS.ACTIVE) {
    const sourceVersion = durableRowVersion(sourceRow);
    activatedRow = await persistRegisteredReplicaActivation(
      stateMachine,
      options,
      sourceRow,
      sourceVersion,
    );
  }
  if (!installAuthoritativeReplicaLifecycleInLane(
    stateMachine,
    options.replicaId,
    activatedRow,
  )) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED,
      options.replicaId,
    );
  }
  return activatedRow;
}

function activateRegisteredReplica(stateMachine, options = {}) {
  return runSerializedReplicaMutation(
    stateMachine,
    options.replicaId,
    () => activateRegisteredReplicaInLane(stateMachine, options),
  );
}

export {
  REPLICA_REGISTERED_ACTIVATION_ERROR_CODE,
  activateRegisteredReplica,
};
