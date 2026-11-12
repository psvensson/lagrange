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
  REPLICA_STATE_MACHINE_STATE,
} from './replica-state-machine-constants.js';

import {installAuthoritativeReplicaLifecycleInLane} from
  './replica-state-machine-recovery.js';
import {runTransitionAttempt} from './replica-state-machine-transition.js';
import {settleCanonicalLeaderClearDebtInLane} from
  './replica-state-machine-leader-clear.js';
import {captureReplicaAdmission, isReplicaAdmissionCurrent,
  runPersistedTransitionEffect, runSerializedReplicaMutation} from
  './replica-state-machine-serialization.js';
import {pendingTurn, turnChainValue} from '../raft/raft-rs-turn-answer.js';

const ReplicaState = REPLICA_STATE_MACHINE_STATE;
const AUTHORITATIVE_LIFECYCLE_TRANSITION_ERROR_CODE = Object.freeze({
  AUTHORITY_UNAVAILABLE:
    'REPLICA_LIFECYCLE_TRANSITION_AUTHORITY_UNAVAILABLE',
  SOURCE_CHANGED: 'REPLICA_LIFECYCLE_TRANSITION_SOURCE_CHANGED',
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
    create_attempt_token:
      context.createAttemptToken ?? sourceRow.create_attempt_token ?? null,
    state_entered_at: destinationVersion,
  });
}

function rowMatchesLifecycleDestination(row, expected) {
  return expected && Object.entries(expected).every(([field, value]) =>
    row?.[field] === value);
}

function installObservedLifecycle(stateMachine, observation, admission) {
  const row = observation?.row;
  return observation?.available === true && row &&
    installAuthoritativeReplicaLifecycleInLane(
      stateMachine, row.service_id, row, admission,
    );
}

function isAuthoritativeLifecycleTransitionRequest(evidence, newState) {
  return typeof evidence?.service_id === 'string' &&
    isReplicaLifecycleMutationPredicate(
      buildReplicaLifecycleMutationPredicateFromRow(evidence),
    ) &&
    evidence.service_type === SERVICE_TYPE.PARTITION &&
    Object.values(ReplicaState).includes(newState);
}

async function readAuthoritativeLifecycleAdmission(stateMachine, evidence, admission,
  expected, context) {
  const replicaId = evidence.service_id;
  if (!isReplicaAdmissionCurrent(stateMachine, replicaId, admission)) return null;
  if (context.runtimeObservation && context.isEffectHandlerCurrent() !== true) return null;
  const debt = stateMachine.canonicalLeaderClearDebtByReplicaId.get(replicaId);
  const observation = await observeAuthoritativeReplicaLifecycle(stateMachine, replicaId);
  if (!isReplicaAdmissionCurrent(stateMachine, replicaId, admission) ||
      stateMachine.canonicalLeaderClearDebtByReplicaId.get(replicaId) !== debt) return null;
  if (context.runtimeObservation && context.isEffectHandlerCurrent() !== true) return null;
  if (observation.available !== true) {
    throw authoritativeLifecycleTransitionError(
      AUTHORITATIVE_LIFECYCLE_TRANSITION_ERROR_CODE.AUTHORITY_UNAVAILABLE,
      replicaId,
    );
  }
  const completed = Boolean(context.runtimeObservation) &&
    rowMatchesLifecycleDestination(observation.row, expected);
  if (!completed && !rowMatchesLifecycleEvidence(observation.row, evidence) ||
      !installObservedLifecycle(stateMachine, observation, admission)) return null;
  // This capture immediately follows our own synchronous accepted install.
  // It never borrows an unrelated revision after an asynchronous boundary.
  return Object.freeze({row: observation.row, completed,
    admission: captureReplicaAdmission(stateMachine, replicaId)});
}

async function resolveAuthoritativeLifecycleOutcome(
  stateMachine, evidence, newState, expected, transitionError, admission,
) {
  const replicaId = evidence.service_id;
  if (!isReplicaAdmissionCurrent(stateMachine, replicaId, admission)) return false;
  const debt = stateMachine.canonicalLeaderClearDebtByReplicaId.get(replicaId);
  const observation = await observeAuthoritativeReplicaLifecycle(stateMachine, replicaId);
  if (!isReplicaAdmissionCurrent(stateMachine, replicaId, admission) ||
      stateMachine.canonicalLeaderClearDebtByReplicaId.get(replicaId) !== debt) return false;
  if (observation.available !== true) {
    throw authoritativeLifecycleTransitionError(
      AUTHORITATIVE_LIFECYCLE_TRANSITION_ERROR_CODE.AUTHORITY_UNAVAILABLE,
      replicaId, transitionError,
    );
  }
  if (rowMatchesLifecycleDestination(observation.row, expected)) {
    if (!installObservedLifecycle(stateMachine, observation, admission)) return false;
    const installedAdmission = captureReplicaAdmission(stateMachine, replicaId);
    if (newState === ReplicaState.FAILED || newState === ReplicaState.REMOVING) {
      await settleCanonicalLeaderClearDebtInLane(
        stateMachine, replicaId, installedAdmission,
      );
    }
    return isReplicaAdmissionCurrent(stateMachine, replicaId, installedAdmission);
  }
  if (rowMatchesLifecycleEvidence(observation.row, evidence)) {
    throw transitionError || durableTransitionNotAppliedError(
      replicaId, newState, {success: true, deferRetry: true},
    );
  }
  // A foreign observation belongs to its own recovery intent. This old
  // operation must not install it or clear that successor's debt.
  return false;
}

async function applyAuthoritativeLifecycleInLane(
  stateMachine, evidence, newState, context, originalAdmission,
) {
  const timestamp = Number.isFinite(context.timestamp) ? context.timestamp : stateMachine.now();
  const expected = expectedLifecycleDestination(evidence, newState, timestamp, context);
  const accepted = await readAuthoritativeLifecycleAdmission(
    stateMachine, evidence, originalAdmission, expected, context,
  );
  if (!accepted) return false;
  const replicaId = evidence.service_id;
  const transitionContext = {...context,
    partitionId: accepted.row.partition_id, nodeId: accepted.row.node_id,
    serviceId: replicaId, serviceType: accepted.row.service_type,
    serviceAddress: accepted.row.address, timestamp};
  let effectAdmission = accepted.admission;
  return runPersistedTransitionEffect(stateMachine, replicaId, newState, context, async () => {
    if (accepted.completed) {
      await settleCanonicalLeaderClearDebtInLane(stateMachine, replicaId, effectAdmission);
      return isReplicaAdmissionCurrent(stateMachine, replicaId, effectAdmission);
    }
    let transitionError = null;
    try {
      const applied = await turnChainValue(runTransitionAttempt(
        stateMachine, replicaId, newState, transitionContext,
        {persist: true, validate: true, expectedSourceEvidence: accepted.row,
          onAdmissionAdvanced: (admission) => { effectAdmission = admission; }},
        accepted.admission,
      ));
      if (applied === true) return true;
    } catch (error) {
      transitionError = error;
    }
    return resolveAuthoritativeLifecycleOutcome(
      stateMachine, evidence, newState, expected, transitionError, effectAdmission,
    );
  });
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
  const admission = context.runtimeObservation ?
    context.runtimeObservation.admission : captureReplicaAdmission(stateMachine, evidence.service_id);
  return turnChainValue(runSerializedReplicaMutation(stateMachine, evidence.service_id,
    () => pendingTurn(applyAuthoritativeLifecycleInLane(
      stateMachine, evidence, newState, context, admission,
    ))));
}

export {
  applyAuthoritativeLifecycleInLane,
  transitionAuthoritativeReplicaGeneration,
};
