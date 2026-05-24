import {
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_NUM,
  REPLICA_STATE_MACHINE_OPERATION,
  REPLICA_STATE_MACHINE_STATE,
} from './replica-state-machine-constants.js';

const ReplicaState = REPLICA_STATE_MACHINE_STATE;

/**
 * Initialize metrics tracking structures.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 */
function initializeMetrics(stateMachine) {
  stateMachine.transitionCounts = new Map();
  stateMachine.timeInState = new Map();
  for (const state of Object.values(ReplicaState)) {
    stateMachine.timeInState.set(state, REPLICA_STATE_MACHINE_NUM.ZERO);
  }

  stateMachine.failureCount = REPLICA_STATE_MACHINE_NUM.ZERO;
  stateMachine.timeoutCount = REPLICA_STATE_MACHINE_NUM.ZERO;
  stateMachine.peakConcurrentAdds = REPLICA_STATE_MACHINE_NUM.ZERO;
  stateMachine.peakConcurrentRemoves = REPLICA_STATE_MACHINE_NUM.ZERO;
}

/**
 * Get all replicas in a specific state.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {string} state - State to filter by.
 * @return {Array<Object>} Array of replica state objects.
 */
function getReplicasInState(stateMachine, state) {
  const result = [];
  for (const replicaState of stateMachine.replicas.values()) {
    if (replicaState.state === state) {
      result.push({...replicaState});
    }
  }
  return result;
}

/**
 * Get all tracked replicas.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @return {Array<Object>} Array of all replica state objects.
 */
function getAllReplicas(stateMachine) {
  return Array.from(stateMachine.replicas.values()).map((r) => ({...r}));
}

/**
 * Get replicas in transitional states.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @return {Array<Object>} Replicas in transitional states.
 */
function getTransitionalReplicas(stateMachine) {
  const transitionalStates = [
    ReplicaState.PENDING,
    ReplicaState.CREATING,
    ReplicaState.SYNCING,
    ReplicaState.REMOVING,
  ];

  const result = [];
  for (const replicaState of stateMachine.replicas.values()) {
    if (transitionalStates.includes(replicaState.state)) {
      result.push({...replicaState});
    }
  }
  return result;
}

/**
 * Check if concurrent operation limits allow new operations.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {string} operationType - Operation type.
 * @return {boolean} True if operation can proceed.
 */
function canStartOperation(stateMachine, operationType) {
  if (operationType === REPLICA_STATE_MACHINE_OPERATION.ADD) {
    const addTransitionalCount =
      stateMachine.stateCounts[ReplicaState.PENDING] +
      stateMachine.stateCounts[ReplicaState.CREATING] +
      stateMachine.stateCounts[ReplicaState.SYNCING];

    if (addTransitionalCount >= stateMachine.limits.maxConcurrentAdds) {
      stateMachine.logger.warn(
        REPLICA_STATE_MACHINE_LOG_MSG.CONCURRENT_ADD_LIMIT,
        {
          currentCount: addTransitionalCount,
          limit: stateMachine.limits.maxConcurrentAdds,
          nodeId: stateMachine.nodeId,
        },
      );
      return false;
    }
    return true;
  } else if (operationType === REPLICA_STATE_MACHINE_OPERATION.REMOVE) {
    const removeTransitionalCount =
      stateMachine.stateCounts[ReplicaState.REMOVING];

    if (removeTransitionalCount >= stateMachine.limits.maxConcurrentRemoves) {
      stateMachine.logger.warn(
        REPLICA_STATE_MACHINE_LOG_MSG.CONCURRENT_REMOVE_LIMIT,
        {
          currentCount: removeTransitionalCount,
          limit: stateMachine.limits.maxConcurrentRemoves,
          nodeId: stateMachine.nodeId,
        },
      );
      return false;
    }
    return true;
  }

  stateMachine.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.UNKNOWN_OPERATION, {
    operationType,
    nodeId: stateMachine.nodeId,
  });
  return false;
}

/**
 * Remove a replica from tracking after it reaches REMOVED state.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {string} replicaId - Replica identifier.
 * @return {boolean} True if replica was removed from tracking.
 */
function removeFromTracking(stateMachine, replicaId) {
  const state = stateMachine.replicas.get(replicaId);
  if (!state) {
    return false;
  }

  if (state.state !== ReplicaState.REMOVED) {
    stateMachine.logger.warn(
      REPLICA_STATE_MACHINE_LOG_MSG.REMOVE_TRACKING_INVALID,
      {
        replicaId,
        currentState: state.state,
        nodeId: stateMachine.nodeId,
      },
    );
    return false;
  }

  stateMachine.stateCounts[state.state]--;
  stateMachine.replicas.delete(replicaId);

  stateMachine.logger.debug(
    REPLICA_STATE_MACHINE_LOG_MSG.REMOVE_TRACKING_SUCCESS,
    {
      replicaId,
      nodeId: stateMachine.nodeId,
    },
  );

  return true;
}

/**
 * Update peak concurrent operations tracking.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 */
function updatePeakConcurrentOperations(stateMachine) {
  const currentAdds =
    stateMachine.stateCounts[ReplicaState.PENDING] +
    stateMachine.stateCounts[ReplicaState.CREATING] +
    stateMachine.stateCounts[ReplicaState.SYNCING];

  if (currentAdds > stateMachine.peakConcurrentAdds) {
    stateMachine.peakConcurrentAdds = currentAdds;
  }

  const currentRemoves = stateMachine.stateCounts[ReplicaState.REMOVING];

  if (currentRemoves > stateMachine.peakConcurrentRemoves) {
    stateMachine.peakConcurrentRemoves = currentRemoves;
  }
}

/**
 * Get metrics about state machine operations.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @return {Object} Metrics object.
 */
function getMetrics(stateMachine) {
  const currentConcurrentAdds =
    stateMachine.stateCounts[ReplicaState.PENDING] +
    stateMachine.stateCounts[ReplicaState.CREATING] +
    stateMachine.stateCounts[ReplicaState.SYNCING];

  const currentConcurrentRemoves =
    stateMachine.stateCounts[ReplicaState.REMOVING];

  const transitionCountsObj = {};
  for (const [key, value] of stateMachine.transitionCounts) {
    transitionCountsObj[key] = value;
  }

  const timeInStateObj = {};
  for (const [key, value] of stateMachine.timeInState) {
    timeInStateObj[key] = value;
  }

  return {
    stateCounts: {...stateMachine.stateCounts},
    transitionCounts: transitionCountsObj,
    timeInState: timeInStateObj,
    failureCount: stateMachine.failureCount,
    timeoutCount: stateMachine.timeoutCount,
    currentConcurrentAdds,
    currentConcurrentRemoves,
    peakConcurrentAdds: stateMachine.peakConcurrentAdds,
    peakConcurrentRemoves: stateMachine.peakConcurrentRemoves,
  };
}

/**
 * Increment the timeout count.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 */
function incrementTimeoutCount(stateMachine) {
  stateMachine.timeoutCount += REPLICA_STATE_MACHINE_NUM.ONE;
}

/**
 * Reset all metrics to initial values.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 */
function resetMetrics(stateMachine) {
  stateMachine._initializeMetrics();
}

/**
 * Clear all tracked replicas.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 */
function clear(stateMachine) {
  stateMachine.stopTimeoutChecker();
  stateMachine.replicas.clear();
  for (const state of Object.keys(stateMachine.stateCounts)) {
    stateMachine.stateCounts[state] = REPLICA_STATE_MACHINE_NUM.ZERO;
  }
  stateMachine._initializeMetrics();
}

export {
  canStartOperation,
  clear,
  getAllReplicas,
  getMetrics,
  getReplicasInState,
  getTransitionalReplicas,
  incrementTimeoutCount,
  initializeMetrics,
  removeFromTracking,
  resetMetrics,
  updatePeakConcurrentOperations,
};
