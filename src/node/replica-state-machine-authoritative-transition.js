import {SERVICE_TYPE} from '../constants/index.js';
import {durableTransitionNotAppliedError} from
  './replica-state-machine-durability.js';
import {
  buildReplicaLifecycleMutationPredicateFromRow,
  durableRowVersion,
  isReplicaLifecycleMutationPredicate,
  nextLifecycleStateEntry,
  observeAuthoritativeReplicaLifecycle,
  rowMatchesReplicaLifecyclePredicate,
} from './replica-state-machine-lifecycle-observation.js';
import {
  REPLICA_STATE_MACHINE_REASON,
  REPLICA_STATE_MACHINE_STATE,
} from './replica-state-machine-constants.js';

const ReplicaState = REPLICA_STATE_MACHINE_STATE;
const AUTHORITATIVE_LIFECYCLE_TRANSITION_ERROR_CODE = Object.freeze({
  AUTHORITY_UNAVAILABLE:
    'REPLICA_LIFECYCLE_TRANSITION_AUTHORITY_UNAVAILABLE',
  SOURCE_CHANGED: 'REPLICA_LIFECYCLE_TRANSITION_SOURCE_CHANGED',
});
const AUTHORITATIVE_LIFECYCLE_ADMISSION_STATE = Object.freeze({
  ACCEPTED: 'accepted',
  REFUSED: 'refused',
});

function authoritativeLifecycleTransitionError(code, replicaId, cause = null) {
  const error = new Error(
    `Authoritative replica lifecycle transition ${code}: ${replicaId}`,
  );
  error.code = code;
  error.errorCode = code;
  error.deferRetry = true;
  if (cause) error.cause = cause;
  return error;
}

function rowMatchesLifecycleEvidence(row, evidence) {
  const predicate = buildReplicaLifecycleMutationPredicateFromRow(evidence);
  return evidence?.service_type === SERVICE_TYPE.PARTITION &&
    rowMatchesReplicaLifecyclePredicate(row, predicate);
}

function expectedLifecycleDestination(sourceRow, newState, timestamp,
  context = {}) {
  const sourceVersion = durableRowVersion(sourceRow);
  if (!sourceVersion) {
    throw authoritativeLifecycleTransitionError(
      AUTHORITATIVE_LIFECYCLE_TRANSITION_ERROR_CODE.SOURCE_CHANGED,
      sourceRow?.service_id,
    );
  }
  const destinationVersion =
    nextLifecycleStateEntry(timestamp, sourceVersion.value);
  // The destination is the lifecycle generation (identity + status +
  // previous_state + state_entered_at), never updated_at: role and heartbeat
  // writes advance updated_at on the same row without changing its lifecycle.
  return Object.freeze({
    service_id: sourceRow.service_id,
    service_type: sourceRow.service_type,
    partition_id: sourceRow.partition_id,
    node_id: sourceRow.node_id,
    replica_id: sourceRow.replica_id,
    group_id: sourceRow.group_id ?? null,
    created_at: sourceRow.created_at,
    status: newState,
    previous_state: sourceRow.status,
    cleanup_token: context.cleanupToken ?? sourceRow.cleanup_token ?? null,
    state_entered_at: destinationVersion,
  });
}

function rowMatchesLifecycleDestination(row, expected) {
  return expected && Object.entries(expected).every(([field, value]) =>
    row?.[field] === value);
}

async function installObservedLifecycle(stateMachine, observation) {
  const row = observation?.row;
  const version = durableRowVersion(row);
  if (observation?.available !== true || !version ||
      row.service_id === undefined) return false;
  return Promise.resolve(stateMachine.registerReplicaSnapshot(
    row.service_id,
    {
      partitionId: row.partition_id,
      nodeId: row.node_id,
      state: row.status,
      serviceId: row.service_id,
      serviceType: row.service_type,
      serviceAddress: row.address,
      replicaIdentity: row.replica_id,
      groupId: row.group_id,
      cleanupToken: row.cleanup_token,
      createdAt: row.created_at,
      durableVersionColumn: version.column,
      durableVersion: version.value,
      authoritativeSnapshot: true,
      reason: REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION,
    },
  ));
}

function isAuthoritativeLifecycleTransitionRequest(evidence, newState) {
  return typeof evidence?.service_id === 'string' &&
    isReplicaLifecycleMutationPredicate(
      buildReplicaLifecycleMutationPredicateFromRow(evidence),
    ) &&
    evidence.service_type === SERVICE_TYPE.PARTITION &&
    Object.values(ReplicaState).includes(newState);
}

async function readAuthoritativeLifecycleAdmission(stateMachine, evidence) {
  const replicaId = evidence.service_id;
  const observation = await observeAuthoritativeReplicaLifecycle(
    stateMachine,
    replicaId,
  );
  if (observation.available !== true) {
    throw authoritativeLifecycleTransitionError(
      AUTHORITATIVE_LIFECYCLE_TRANSITION_ERROR_CODE.AUTHORITY_UNAVAILABLE,
      replicaId,
    );
  }
  if (!rowMatchesLifecycleEvidence(observation.row, evidence) ||
      !await installObservedLifecycle(stateMachine, observation)) {
    return Object.freeze({
      state: AUTHORITATIVE_LIFECYCLE_ADMISSION_STATE.REFUSED,
      observation,
    });
  }
  return Object.freeze({
    state: AUTHORITATIVE_LIFECYCLE_ADMISSION_STATE.ACCEPTED,
    observation,
  });
}

async function attemptAuthoritativeLifecycleTransition(
  stateMachine,
  admissionRow,
  newState,
  context,
  timestamp,
) {
  try {
    const applied = await Promise.resolve(stateMachine._applyTransition(
      admissionRow.service_id,
      newState,
      {
        ...context,
        partitionId: admissionRow.partition_id,
        nodeId: admissionRow.node_id,
        serviceId: admissionRow.service_id,
        serviceType: admissionRow.service_type,
        serviceAddress: admissionRow.address,
        timestamp,
      },
      {
        persist: true,
        validate: true,
        expectedSourceEvidence: admissionRow,
      },
    ));
    return Object.freeze({applied: applied === true, error: null});
  } catch (error) {
    return Object.freeze({applied: false, error});
  }
}

async function resolveAuthoritativeLifecycleOutcome(
  stateMachine,
  evidence,
  newState,
  expected,
  transitionError,
) {
  const replicaId = evidence.service_id;
  const observation = await observeAuthoritativeReplicaLifecycle(
    stateMachine,
    replicaId,
  );
  if (observation.available !== true) {
    throw authoritativeLifecycleTransitionError(
      AUTHORITATIVE_LIFECYCLE_TRANSITION_ERROR_CODE.AUTHORITY_UNAVAILABLE,
      replicaId,
      transitionError,
    );
  }
  if (rowMatchesLifecycleDestination(observation.row, expected)) {
    if (!await installObservedLifecycle(stateMachine, observation)) {
      return false;
    }
    if (newState === ReplicaState.FAILED) {
      await stateMachine.settleCanonicalLeaderClearDebt(replicaId);
    }
    return true;
  }
  if (rowMatchesLifecycleEvidence(observation.row, evidence)) {
    throw transitionError || durableTransitionNotAppliedError(
      replicaId,
      newState,
      {success: true, deferRetry: true},
    );
  }
  await installObservedLifecycle(stateMachine, observation);
  return false;
}

/**
 * Apply one partition lifecycle transition from exact authoritative evidence.
 * The fresh point read is admission; the state machine's exact-generation CAS
 * is serialization; and an unknown/non-applied result is resolved only by a
 * second authoritative observation.
 * @param {Object} stateMachine Canonical ReplicaStateMachine owner.
 * @param {Object} evidence Exact source lifecycle row previously observed.
 * @param {string} newState Destination lifecycle state.
 * @param {Object} context Transition context.
 * @return {Promise<boolean>} True only for the exact destination generation.
 */
async function transitionAuthoritativeReplicaGeneration(
  stateMachine,
  evidence,
  newState,
  context = {},
) {
  if (!isAuthoritativeLifecycleTransitionRequest(evidence, newState)) {
    return false;
  }
  const admission = await readAuthoritativeLifecycleAdmission(
    stateMachine,
    evidence,
  );
  if (admission.state !== AUTHORITATIVE_LIFECYCLE_ADMISSION_STATE.ACCEPTED) {
    return false;
  }
  const admissionObservation = admission.observation;
  const timestamp = Number.isFinite(context.timestamp) ?
    context.timestamp : stateMachine.now();
  const expected = expectedLifecycleDestination(
    admissionObservation.row,
    newState,
    timestamp,
    context,
  );
  const attempt = await attemptAuthoritativeLifecycleTransition(
    stateMachine,
    admissionObservation.row,
    newState,
    context,
    timestamp,
  );
  if (attempt.applied) return true;
  return resolveAuthoritativeLifecycleOutcome(
    stateMachine,
    evidence,
    newState,
    expected,
    attempt.error,
  );
}

export {
  transitionAuthoritativeReplicaGeneration,
};
