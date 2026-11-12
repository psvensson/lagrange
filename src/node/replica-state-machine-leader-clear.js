import {SERVICE_TYPE, TABLES} from '../constants/index.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from
  '../control-plane/control-plane-system-table-gateway.js';
import {
  didDurableServiceRowWriteApply,
  durableTransitionNotAppliedError,
} from './replica-state-machine-durability.js';
import {
  getReplicaRevision,
  isCanonicalLeaderClearSettled,
  isReplicaAdmissionCurrent,
  recordCanonicalLeaderClearSettlement,
} from './replica-state-machine-serialization.js';
import {observeAuthoritativeReplicaLifecycle, readAuthoritativePartitionLeader,
  rowMatchesReplicaLifecycle} from
  './replica-state-machine-lifecycle-observation.js';
import {
  REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE,
  REPLICA_STATE_MACHINE_EVENT,
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_STATE,
} from './replica-state-machine-constants.js';

const ReplicaState = REPLICA_STATE_MACHINE_STATE;
const CANONICAL_LEADER_CLEAR_EFFECT = 'canonical-leader-clear';
const OBSERVED_STATE_CHANGED_OUTCOME = 'observed_state_changed';
const CRITICAL_WORK_CLASS = 'critical';
const CLEARS_CANONICAL_PARTITION_LEADER_STATES = new Set([
  ReplicaState.REMOVING,
  ReplicaState.REMOVED,
  ReplicaState.FAILED,
]);

async function clearLeaderOrRecordDebt(
  stateMachine,
  replicaState,
  previousState,
  admission,
) {
  if (!hasCanonicalLeaderClearIdentity(replicaState)) return true;
  const replicaId = replicaState.replicaId;
  const retainedDebt = stateMachine.canonicalLeaderClearDebtByReplicaId.get(replicaId);
  const isCurrent = () => isReplicaAdmissionCurrent(stateMachine, replicaId, admission) &&
    stateMachine.canonicalLeaderClearDebtByReplicaId.get(replicaId) === retainedDebt;
  if (!isCurrent()) return false;
  if (replicaState.state === ReplicaState.REMOVED &&
      previousState?.state === ReplicaState.REMOVING &&
      isCanonicalLeaderClearSettled(
        stateMachine,
        replicaState.replicaId,
        previousState,
      )) {
    return;
  }
  try {
    if (await settleCanonicalLeaderMutation(
      stateMachine,
      replicaState,
    ) !== true) {
      throw durableTransitionNotAppliedError(
        replicaState.replicaId,
        CANONICAL_LEADER_CLEAR_EFFECT,
        {
          success: true,
          outcome: OBSERVED_STATE_CHANGED_OUTCOME,
          deferRetry: true,
        },
      );
    }
    if (!isCurrent()) return false;
    stateMachine.canonicalLeaderClearDebtByReplicaId.delete(replicaId);
    recordCanonicalLeaderClearSettlement(stateMachine, replicaId, replicaState,
      admission.revision + 1);
  } catch (error) {
    if (!isCurrent()) return false;
    stateMachine.canonicalLeaderClearDebtByReplicaId.set(
      replicaState.replicaId,
      Object.freeze({
        replicaState,
        revision: admission.revision + 1,
      }),
    );
    stateMachine.canonicalLeaderClearSettlementByReplicaId.delete(
      replicaState.replicaId,
    );
    stateMachine.logger.error(
      REPLICA_STATE_MACHINE_LOG_MSG.CANONICAL_LEADER_CLEAR_DEFERRED,
      {
        replicaId: replicaState.replicaId,
        partitionId: replicaState.partitionId,
        error: error.message,
        nodeId: stateMachine.nodeId,
      },
    );
    stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.PERSISTENCE_ERROR, {
      replicaId: replicaState.replicaId,
      state: replicaState.state,
      error: error.message,
      durableStateApplied: true,
      deferredSideEffect:
        REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE.CANONICAL_LEADER_CLEAR_DEFERRED,
    });
    return false;
  }
  return true;
}

async function settleCanonicalLeaderMutation(stateMachine, replicaState) {
  const result = await stateMachine
    ._clearCanonicalPartitionLeaderIfNeeded(replicaState);
  if (result === true || didDurableServiceRowWriteApply(result)) return true;
  const row = await readAuthoritativePartitionLeader(
    stateMachine,
    replicaState.partitionId,
  );
  return Boolean(row && row.leader_node_id !== replicaState.nodeId);
}

// Shared by the public serialized debt redrive and an authoritative
// transition already holding that same lane. The caller carries its original
// local admission; observing a foreign generation never installs it here.
async function settleCanonicalLeaderClearDebtInLane(
  stateMachine, replicaId, admission,
) {
  if (!isReplicaAdmissionCurrent(stateMachine, replicaId, admission)) return false;
  let debt = stateMachine.canonicalLeaderClearDebtByReplicaId.get(replicaId);
  if (!debt) {
    const currentState = stateMachine.replicas.get(replicaId) || null;
    if (!hasCanonicalLeaderClearIdentity(currentState)) return false;
    if (isCanonicalLeaderClearSettled(stateMachine, replicaId)) return true;
    debt = Object.freeze({replicaState: currentState,
      revision: getReplicaRevision(stateMachine, replicaId)});
    stateMachine.canonicalLeaderClearDebtByReplicaId.set(replicaId, debt);
  }
  const isCurrent = () =>
    isReplicaAdmissionCurrent(stateMachine, replicaId, admission) &&
    stateMachine.canonicalLeaderClearDebtByReplicaId.get(replicaId) === debt &&
    stateMachine.replicas.get(replicaId) === debt.replicaState &&
    getReplicaRevision(stateMachine, replicaId) === debt.revision;
  if (!isCurrent()) return false;
  const observation = await observeAuthoritativeReplicaLifecycle(stateMachine, replicaId);
  if (!isCurrent() || observation.available !== true ||
      !rowMatchesReplicaLifecycle(observation.row, debt.replicaState)) return false;
  try {
    if (await settleCanonicalLeaderMutation(stateMachine, debt.replicaState) !== true) {
      return false;
    }
  } catch (_error) {
    return false;
  }
  if (!isCurrent()) return false;
  stateMachine.canonicalLeaderClearDebtByReplicaId.delete(replicaId);
  recordCanonicalLeaderClearSettlement(stateMachine, replicaId,
    debt.replicaState, debt.revision);
  return true;
}

function hasCanonicalLeaderClearIdentity(replicaState) {
  return replicaState &&
    replicaState.serviceType === SERVICE_TYPE.PARTITION &&
    CLEARS_CANONICAL_PARTITION_LEADER_STATES.has(replicaState.state) &&
    typeof replicaState.partitionId === 'string' &&
    replicaState.partitionId.length > 0 &&
    typeof replicaState.nodeId === 'string' &&
    replicaState.nodeId.length > 0;
}

async function clearCanonicalPartitionLeaderIfNeeded(
  stateMachine,
  replicaState,
) {
  if (
    !hasCanonicalLeaderClearIdentity(replicaState) ||
    stateMachine.hasOtherActivePartitionReplicaOnLeaderNode?.(replicaState)
  ) {
    return true;
  }
  return stateMachine.getControlPlaneSystemTableGateway().submitMutation({
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.PARTITIONS,
    whereClause: {
      partition_id: replicaState.partitionId,
      leader_node_id: replicaState.nodeId,
    },
    data: {
      leader_node_id: null,
      updated_at: replicaState.stateEnteredAt,
    },
  }, {
    allowCoalescing: true,
    coalescingKey: `partitions:leader:${replicaState.partitionId}`,
    deliveryPriority: CRITICAL_WORK_CLASS,
    workClass: CRITICAL_WORK_CLASS,
  });
}

export {
  clearCanonicalPartitionLeaderIfNeeded,
  clearLeaderOrRecordDebt,
  hasCanonicalLeaderClearIdentity,
  settleCanonicalLeaderClearDebtInLane,
  settleCanonicalLeaderMutation,
};
