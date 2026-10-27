import {
  REPLICA_STATE_MACHINE_ERROR_MSG,
  REPLICA_STATE_MACHINE_EVENT,
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_NUM,
  REPLICA_STATE_MACHINE_STATE,
} from './replica-state-machine-constants.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {getReplicaRevision} from './replica-state-machine-serialization.js';

const ReplicaState = REPLICA_STATE_MACHINE_STATE;
const REPLICA_STATE_TIMEOUT_WAIT = Object.freeze({
  wait: 'REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS',
  awaited: 'replica left its transient lifecycle state',
});

/**
 * One replica stayed in a transient lifecycle state past its bound: one
 * wait_bound_spent ERROR per (replica, observed state). A REMOVING replica
 * is re-armed and re-fires every bound; the reporter folds those repeats
 * until its observed state changes.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine.
 * @param {Object} timedOut - The timed-out replica record.
 * @return {void}
 */
function reportReplicaStateTimeoutSpent(stateMachine, timedOut) {
  reportWaitBoundSpent(stateMachine.logger, {
    ...REPLICA_STATE_TIMEOUT_WAIT,
    boundMs: timedOut.timeout,
    elapsedMs: timedOut.elapsed,
    lastObserved: {
      state: timedOut.state,
      revision: timedOut.revision ?? null,
      previousState: timedOut.stateSnapshot?.previousState ?? null,
      triggerReason: timedOut.stateSnapshot?.triggerReason ?? null,
    },
    scope: {
      nodeId: stateMachine.nodeId,
      partitionId: timedOut.partitionId ?? null,
      replicaId: timedOut.replicaId,
    },
    subject: timedOut.replicaId,
  });
}

/**
 * Start the timeout checker interval.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 */
function startTimeoutChecker(stateMachine) {
  if (stateMachine.timeoutCheckInterval !== null) {
    return;
  }

  stateMachine.timeoutCheckInterval = stateMachine.timeSource.setInterval(() => {
    stateMachine._checkTimeouts();
    // CL-021: converge deferred durable services rows (local-only marker)
    // on the same tick. Fire-and-forget — failures back off per row and
    // retry on later ticks.
    stateMachine._reconcileLocalOnlyServiceRows?.()?.catch?.(() => null);
    stateMachine.reconcileCanonicalLeaderClearDebtNow?.()?.catch?.(() => null);
  }, stateMachine.timeoutCheckIntervalMs);
  stateMachine.timeoutCheckInterval?.unref?.();

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
    stateMachine.timeSource.clearInterval(stateMachine.timeoutCheckInterval);
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
        stateSnapshot: state,
        revision: getReplicaRevision(stateMachine, replicaId),
        elapsed,
        timeout,
        partitionId: state.partitionId,
        nodeId: state.nodeId,
      });
    }
  }

  for (const timedOut of timedOutReplicas) {
    reportReplicaStateTimeoutSpent(stateMachine, timedOut);

    stateMachine.timeoutCount += REPLICA_STATE_MACHINE_NUM.ONE;

    stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.TIMEOUT, {
      replicaId: timedOut.replicaId,
      partitionId: timedOut.partitionId,
      nodeId: timedOut.nodeId,
      state: timedOut.state,
      elapsed: timedOut.elapsed,
      timeout: timedOut.timeout,
    });

    const currentState = stateMachine.replicas.get(timedOut.replicaId);
    const observedRevisionStillCurrent =
      currentState === timedOut.stateSnapshot &&
      getReplicaRevision(stateMachine, timedOut.replicaId) ===
        timedOut.revision;
    if (!observedRevisionStillCurrent) {
      continue;
    }

    if (timedOut.state === ReplicaState.REMOVING) {
      if (currentState) {
        // Durable removal intent is monotonic. The timeout event remains
        // diagnostic while the removal owner continues/re-drives through its
        // own path; re-arming bounds repeated diagnostics without inventing
        // FAILED cleanup authority.
        currentState.timeoutStartedAt = now;
      }
      continue;
    }

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
