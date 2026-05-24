import {
  REPLICA_STATE_MACHINE_ERROR_MSG,
  REPLICA_STATE_MACHINE_EVENT,
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_NUM,
  REPLICA_STATE_MACHINE_STATE,
} from './replica-state-machine-constants.js';

const ReplicaState = REPLICA_STATE_MACHINE_STATE;

/**
 * Start the timeout checker interval.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 */
function startTimeoutChecker(stateMachine) {
  if (stateMachine.timeoutCheckInterval !== null) {
    return;
  }

  stateMachine.timeoutCheckInterval = setInterval(() => {
    stateMachine._checkTimeouts();
  }, stateMachine.timeoutCheckIntervalMs);
  stateMachine.timeoutCheckInterval.unref();

  stateMachine.logger.debug(
    REPLICA_STATE_MACHINE_LOG_MSG.TIMEOUT_CHECKER_STARTED,
    {
      intervalMs: stateMachine.timeoutCheckIntervalMs,
      nodeId: stateMachine.nodeId,
    },
  );
}

/**
 * Stop the timeout checker interval.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 */
function stopTimeoutChecker(stateMachine) {
  if (stateMachine.timeoutCheckInterval !== null) {
    clearInterval(stateMachine.timeoutCheckInterval);
    stateMachine.timeoutCheckInterval = null;

    stateMachine.logger.debug(
      REPLICA_STATE_MACHINE_LOG_MSG.TIMEOUT_CHECKER_STOPPED,
      {
        nodeId: stateMachine.nodeId,
      },
    );
  }
}

/**
 * Check for timed out replicas and transition them to failed.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @return {number} Number of replicas that timed out.
 */
function checkTimeouts(stateMachine) {
  const now = stateMachine.now();
  const timedOutReplicas = [];

  for (const [replicaId, state] of stateMachine.replicas) {
    const timeout = stateMachine.timeouts[state.state];
    if (timeout === undefined) {
      continue;
    }

    const hasExplicitTimeoutAnchor =
      Object.prototype.hasOwnProperty.call(state, 'timeoutStartedAt');
    const timeoutAnchor = hasExplicitTimeoutAnchor ?
      state.timeoutStartedAt :
      state.stateEnteredAt;
    if (!Number.isFinite(timeoutAnchor)) {
      continue;
    }

    const elapsed = now - timeoutAnchor;
    if (elapsed > timeout) {
      timedOutReplicas.push({
        replicaId,
        state: state.state,
        elapsed,
        timeout,
        partitionId: state.partitionId,
        nodeId: state.nodeId,
      });
    }
  }

  for (const timedOut of timedOutReplicas) {
    stateMachine.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.OPERATION_TIMEOUT, {
      replicaId: timedOut.replicaId,
      state: timedOut.state,
      elapsed: timedOut.elapsed,
      timeout: timedOut.timeout,
      nodeId: stateMachine.nodeId,
    });

    stateMachine.timeoutCount += REPLICA_STATE_MACHINE_NUM.ONE;

    stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.TIMEOUT, {
      replicaId: timedOut.replicaId,
      partitionId: timedOut.partitionId,
      nodeId: timedOut.nodeId,
      state: timedOut.state,
      elapsed: timedOut.elapsed,
      timeout: timedOut.timeout,
    });

    stateMachine.transition(timedOut.replicaId, ReplicaState.FAILED, {
      partitionId: timedOut.partitionId,
      nodeId: timedOut.nodeId,
      reason: REPLICA_STATE_MACHINE_ERROR_MSG.timeoutReason(
        timedOut.state,
        timedOut.elapsed,
      ),
      errorMessage: REPLICA_STATE_MACHINE_ERROR_MSG.timeoutMessage(
        timedOut.timeout,
      ),
    });
  }

  return timedOutReplicas.length;
}

export {
  checkTimeouts,
  startTimeoutChecker,
  stopTimeoutChecker,
};
