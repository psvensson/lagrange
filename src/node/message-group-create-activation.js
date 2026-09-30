/**
 * Create-path activation and failure classification for the message-group
 * service handler: the STOPPED -> ACTIVE step and the typed failure options
 * the coordinator re-drives on.
 */
import {isReplicaServiceHandlerBound} from
  './replica-transport-handler-identity.js';

/**
 * STOPPED -> ACTIVE for an executor-created replica: through the replica's
 * lifecycle owner, the ReplicaStateMachine its transport handler retires
 * through, with the exact handler of this generation checked inside the lane
 * immediately before the ACTIVE CAS.
 * @param {Object} handler - The MessageGroupServiceHandler.
 * @param {Object} activation - {groupId, replicaId, service,
 *   registrationEvidence}.
 * @return {Promise<Object>} The ACTIVE row.
 */
function activateCreatedMessageGroupReplica(handler, activation) {
  const {service} = activation;
  const lifecycleOwner = service?.resolveHandlerRetirementLane?.() || null;
  return handler.messageGroupServiceRowOwner
    .forLifecycleOwner(lifecycleOwner)
    .activateReplica({
      groupId: activation.groupId,
      replicaId: activation.replicaId,
      nodeId: handler.nodeId,
      service,
      registrationEvidence: activation.registrationEvidence,
      isEffectHandlerCurrent: () =>
        isReplicaServiceHandlerBound(service, lifecycleOwner),
    });
}

function resolveCreateFailureErrorCode(error) {
  if (typeof error?.errorCode === 'string') {
    return error.errorCode;
  }
  if (typeof error?.code === 'string') {
    return error.code;
  }
  return '';
}

/**
 * Carries the typed retry vocabulary of a failed create to the coordinator so
 * a deferrable failure stays re-drivable rather than collapsing to a message.
 * @param {Error} error - The failure raised by the create path.
 * @param {string} replicaId - The replica the create was for.
 * @return {Object} Executor failure outcome options.
 */
function buildMessageGroupCreateFailureOptions(error, replicaId) {
  const options = {replicaId, errorMessage: error.message};
  const errorCode = resolveCreateFailureErrorCode(error);
  if (errorCode.length > 0) {
    options.errorCode = errorCode;
  }
  if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0) {
    options.retryAfterMs = Math.floor(error.retryAfterMs);
  }
  if (error?.deferRetry === true) {
    options.deferRetry = true;
  }
  return options;
}

export {
  activateCreatedMessageGroupReplica,
  buildMessageGroupCreateFailureOptions,
};
