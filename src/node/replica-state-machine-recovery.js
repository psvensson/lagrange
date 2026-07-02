import {
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE,
  REPLICA_STATE_MACHINE_ERROR_MSG,
  REPLICA_STATE_MACHINE_EVENT,
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_NUM,
  REPLICA_STATE_MACHINE_REASON,
  REPLICA_STATE_MACHINE_STATE,
} from './replica-state-machine-constants.js';

const ReplicaState = REPLICA_STATE_MACHINE_STATE;

/**
 * Handle node recovery by processing replicas in transitional states.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {Object} options - Recovery options.
 * @return {Promise<Object>} Recovery result with processed counts.
 */
async function handleNodeRecovery(stateMachine, options = {}) {
  const {systemTableCache} = options;
  const nodeId = options.nodeId || stateMachine.nodeId;

  stateMachine.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_START, {
    nodeId,
  });

  assertCritical(
    systemTableCache,
    REPLICA_STATE_MACHINE_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
  );

  let services = [];
  try {
    services = systemTableCache.filter(
      TABLES.SERVICES,
      (service) =>
        service.node_id === nodeId &&
        service.service_type === SERVICE_TYPE.PARTITION &&
        [ReplicaState.CREATING, ReplicaState.SYNCING, ReplicaState.REMOVING]
          .includes(service.status),
    );
  } catch (error) {
    stateMachine.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_QUERY_FAILED, {
      nodeId,
      error: error.message,
    });
    throw error;
  }

  stateMachine.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_FOUND, {
    count: services.length,
    nodeId,
  });

  let creatingToFailed = REPLICA_STATE_MACHINE_NUM.ZERO;
  let syncingToFailed = REPLICA_STATE_MACHINE_NUM.ZERO;
  let removingToRemoved = REPLICA_STATE_MACHINE_NUM.ZERO;

  for (const service of services) {
    const {service_id: replicaId, partition_id: partitionId, status} = service;

    stateMachine.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_PROCESSING, {
      replicaId,
      partitionId,
      status,
      nodeId,
    });

    try {
      const existingState = stateMachine.replicas.get(replicaId);
      if (!existingState) {
        stateMachine._registerReplicaForRecovery(replicaId, {
          partitionId,
          nodeId,
          state: status,
          serviceId: service.service_id,
        });
      }

      if (status === ReplicaState.CREATING || status === ReplicaState.SYNCING) {
        const result = stateMachine.transition(replicaId, ReplicaState.FAILED, {
          partitionId,
          nodeId,
          reason: REPLICA_STATE_MACHINE_REASON.RECOVERY_INCOMPLETE,
          errorMessage:
            REPLICA_STATE_MACHINE_ERROR_MSG.recoveryIncompleteOperation(status),
          serviceId: service.service_id,
        });

        if (result === true || result instanceof Promise && await result) {
          if (status === ReplicaState.CREATING) {
            creatingToFailed += REPLICA_STATE_MACHINE_NUM.ONE;
          } else {
            syncingToFailed += REPLICA_STATE_MACHINE_NUM.ONE;
          }
          stateMachine.logger.info(
            REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_TO_FAILED,
            {
              replicaId,
              previousStatus: status,
              nodeId,
            },
          );
        }
      } else if (status === ReplicaState.REMOVING) {
        const result = stateMachine.transition(replicaId, ReplicaState.REMOVED, {
          partitionId,
          nodeId,
          reason: REPLICA_STATE_MACHINE_REASON.RECOVERY_COMPLETE_REMOVAL,
          serviceId: service.service_id,
        });

        if (result === true || result instanceof Promise && await result) {
          removingToRemoved += REPLICA_STATE_MACHINE_NUM.ONE;
          stateMachine.logger.info(
            REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_REMOVED,
            {
              replicaId,
              nodeId,
            },
          );
        }
      }
    } catch (error) {
      stateMachine.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_FAILED, {
        replicaId,
        status,
        error: error.message,
        nodeId,
      });
    }
  }

  const total = creatingToFailed + syncingToFailed + removingToRemoved;

  stateMachine.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_COMPLETE, {
    nodeId,
    creatingToFailed,
    syncingToFailed,
    removingToRemoved,
    total,
  });

  stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.RECOVERY_COMPLETE, {
    nodeId,
    creatingToFailed,
    syncingToFailed,
    removingToRemoved,
    total,
  });

  return {
    nodeId,
    creatingToFailed,
    syncingToFailed,
    removingToRemoved,
    total,
  };
}

/**
 * Register a replica snapshot directly without transitional writes.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {string} replicaId - Replica identifier.
 * @param {Object} context - Replica context.
 * @return {boolean} True when registration succeeded.
 */
function registerReplicaSnapshot(stateMachine, replicaId, context = {}) {
  if (!replicaId || typeof replicaId !== 'string') {
    return false;
  }

  if (stateMachine.replicas.has(replicaId)) {
    return true;
  }

  const state = context.state || ReplicaState.ACTIVE;
  if (!Object.values(ReplicaState).includes(state)) {
    stateMachine.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.INVALID_TRANSITION, {
      replicaId,
      currentState: null,
      attemptedState: state,
      reason: context.reason,
      nodeId: stateMachine.nodeId,
    });
    stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.TRANSITION_ERROR, {
      code: REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE.INVALID_TRANSITION,
      replicaId,
      currentState: null,
      attemptedState: state,
      reason: context.reason,
      nodeId: stateMachine.nodeId,
    });
    return false;
  }

  stateMachine._registerReplicaForRecovery(replicaId, {
    partitionId: context.partitionId,
    nodeId: context.nodeId || stateMachine.nodeId,
    state,
    serviceId: context.serviceId || null,
    triggerReason: context.reason ||
      REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION,
  });
  return true;
}

/**
 * Register a replica directly for recovery purposes.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {string} replicaId - Replica identifier.
 * @param {Object} context - Replica context.
 */
function registerReplicaForRecovery(stateMachine, replicaId, context) {
  const now = stateMachine.now();
  const state = context.state;

  stateMachine.stateCounts[state]++;

  const replicaState = {
    replicaId,
    partitionId: context.partitionId,
    nodeId: context.nodeId || stateMachine.nodeId,
    state,
    stateEnteredAt: now,
    timeoutStartedAt: stateMachine.timeouts[state] === undefined ? null : now,
    previousState: null,
    triggerReason: context.triggerReason ||
      REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION,
    errorMessage: null,
    metadata: {},
    serviceId: context.serviceId || null,
    serviceType: context.serviceType || SERVICE_TYPE.PARTITION,
    serviceAddress: context.serviceAddress || null,
  };

  stateMachine.replicas.set(replicaId, replicaState);

  stateMachine.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_REGISTERED, {
    replicaId,
    state,
    nodeId: stateMachine.nodeId,
  });
}

export {
  handleNodeRecovery,
  registerReplicaForRecovery,
  registerReplicaSnapshot,
};
