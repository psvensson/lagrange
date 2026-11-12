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
import {
  captureReplicaAdmission,
  isReplicaAdmissionCurrent,
  runActivationEffectSection,
  runSerializedReplicaMutation,
} from
  './replica-state-machine-serialization.js';
import {pendingTurn, turnChainValue} from '../raft/raft-rs-turn-answer.js';
import {isPartitionRegistrationEvidence} from
  '../partition/partition-service-row-owner.js';
import {REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED} from
  './replica-state-machine-constants.js';

const REGISTERED_REPLICA_POINT_READ_SQL =
  'SELECT * FROM services WHERE service_id = ?';
const REGISTERED_REPLICA_ACTIVATION_REASON = 'registered_runtime_ready';
const REPLICA_REGISTERED_ACTIVATION_ERROR_CODE = Object.freeze({
  AUTHORITY_UNAVAILABLE: 'REPLICA_ACTIVATION_AUTHORITY_UNAVAILABLE',
  DURABILITY_DEFERRED: 'REPLICA_ACTIVATION_DURABILITY_DEFERRED',
  HANDLER_NOT_REGISTERED: REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED,
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
  if (rowMatchesReplicaLifecyclePredicate(observation.row,
    buildReplicaLifecycleMutationPredicateFromRow(sourceRow))) {
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


function resolveRegistrationEvidence(stateMachine, options) {
  const evidence = options.registrationEvidence;
  if (!isPartitionRegistrationEvidence(evidence, options.service, stateMachine) ||
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


// The activation effect boundary (owner decision N2): the exact handler of
// this replica generation must be registered at the moment the ACTIVE CAS is
// issued. It is checked here, inside the replica's lifecycle lane, with no
// await between the check and the CAS; the effect section opened right after
// makes handler retirement (retireReplicaHandler) wait for the CAS.
function requireEffectHandler(options) {
  if (typeof options.isEffectHandlerCurrent !== 'function' ||
      options.isEffectHandlerCurrent() !== true) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.HANDLER_NOT_REGISTERED,
      options.replicaId,
    );
  }
}

async function activateRegisteredReplicaInLane(stateMachine, options, admission) {
  if (!isReplicaAdmissionCurrent(stateMachine, options.replicaId, admission)) {
    throw activationError(REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED, options.replicaId);
  }
  const sourceRow = resolveRegistrationEvidence(stateMachine, options);
  // The check and the section opening are one synchronous step: retirement
  // cannot interleave before the ACTIVE CAS settles.
  return runActivationEffectSection(
    stateMachine,
    options.replicaId,
    () => requireEffectHandler(options),
    async () => {
      const activatedRow = await persistRegisteredReplicaActivation(
        stateMachine,
        options,
        sourceRow,
        durableRowVersion(sourceRow),
      );
      requireEffectHandler(options);
      if (!installAuthoritativeReplicaLifecycleInLane(
        stateMachine,
        options.replicaId,
        activatedRow,
        admission,
      )) {
        throw activationError(
          REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED,
          options.replicaId,
        );
      }
      return activatedRow;
    },
  );
}

function activateRegisteredReplica(stateMachine, options = {}) {
  const admission = captureReplicaAdmission(stateMachine, options.replicaId);
  return turnChainValue(runSerializedReplicaMutation(
    stateMachine,
    options.replicaId,
    () => pendingTurn(activateRegisteredReplicaInLane(stateMachine, options, admission)),
  ));
}

export {
  REPLICA_REGISTERED_ACTIVATION_ERROR_CODE,
  activateRegisteredReplica,
};
