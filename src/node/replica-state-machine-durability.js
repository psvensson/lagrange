import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {
  REPLICA_STATE_MACHINE_EVENT,
  REPLICA_STATE_MACHINE_LOG_MSG,
} from './replica-state-machine-constants.js';

const DURABLE_TRANSITION_DEFERRED_CODE =
  'REPLICA_STATE_TRANSITION_DURABILITY_DEFERRED';

function didDurableServiceRowWriteApply(result) {
  return classifyControlPlaneMutationResult(result).applied;
}

function durableTransitionNotAppliedError(replicaId, newState, result) {
  const effect = classifyControlPlaneMutationResult(result);
  const error = new Error(
    `Replica state transition was not durably applied for ${replicaId}: ` +
    newState,
  );
  error.code = DURABLE_TRANSITION_DEFERRED_CODE;
  error.errorCode = DURABLE_TRANSITION_DEFERRED_CODE;
  error.deferRetry = effect.retryable === true || result?.deferRetry === true;
  error.retryAfterMs = Number.isFinite(result?.retryAfterMs) ?
    result.retryAfterMs : null;
  return error;
}

function reportServiceRowPersisted(stateMachine, replicaState) {
  stateMachine.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSISTED, {
    replicaId: replicaState.replicaId,
    state: replicaState.state,
    nodeId: stateMachine.nodeId,
  });
}

function reportServiceRowPersistenceError(stateMachine, replicaState, error) {
  stateMachine.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSIST_FAILED, {
    replicaId: replicaState.replicaId,
    state: replicaState.state,
    error: error.message,
    nodeId: stateMachine.nodeId,
  });
  stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.PERSISTENCE_ERROR, {
    replicaId: replicaState.replicaId,
    state: replicaState.state,
    error: error.message,
  });
}

export {
  didDurableServiceRowWriteApply,
  durableTransitionNotAppliedError,
  reportServiceRowPersisted,
  reportServiceRowPersistenceError,
};
