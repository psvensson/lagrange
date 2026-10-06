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
  recordCanonicalLeaderClearSettlement,
} from './replica-state-machine-serialization.js';
import {readAuthoritativePartitionLeader} from
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
) {
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
    if (hasCanonicalLeaderClearIdentity(replicaState)) {
      stateMachine.canonicalLeaderClearDebtByReplicaId.delete(
        replicaState.replicaId,
      );
      recordCanonicalLeaderClearSettlement(
        stateMachine,
        replicaState.replicaId,
        replicaState,
        getReplicaRevision(stateMachine, replicaState.replicaId) + 1,
      );
    }
  } catch (error) {
    if (!hasCanonicalLeaderClearIdentity(replicaState)) throw error;
    stateMachine.canonicalLeaderClearDebtByReplicaId.set(
      replicaState.replicaId,
      Object.freeze({
        replicaState,
        revision: getReplicaRevision(stateMachine, replicaState.replicaId) + 1,
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
  if (!hasCanonicalLeaderClearIdentity(replicaState)) return true;
  if (stateMachine.shouldRetainCanonicalPartitionLeader?.(replicaState) ===
      true) {
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
    skipCacheWait: true,
  });
}

export {
  clearCanonicalPartitionLeaderIfNeeded,
  clearLeaderOrRecordDebt,
  hasCanonicalLeaderClearIdentity,
  settleCanonicalLeaderMutation,
};
