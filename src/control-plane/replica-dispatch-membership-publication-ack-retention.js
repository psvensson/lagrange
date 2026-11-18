// This node's retained membership-publication acknowledgement: the deferred
// re-derive the dispatch service keeps while an acknowledgement is not
// settled (a retryable failure, an unknown write outcome, or a refusal that
// says nothing about the row). One entry per node, at the earliest asked
// time; when it fires the acknowledgement is re-derived from the current
// rows and the publications owner resolves it by reading the durable row
// (an acknowledgement whose write outcome was unknown is found applied, or
// is applied then). The obligation is never released by a spent wait.
import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';

const {
  DISPATCH_LOG_MSG,
  RECONCILE_REASON,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const NODE_ROW_UNAVAILABLE = null;

function resolveMembershipPublicationAckRetryAfterMs(service, error) {
  const retryAfterMs = getControlPlaneRetryAfterMs(error);
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return Math.max(1, Math.floor(retryAfterMs));
  }
  return service.nodeStateUpdateRetryAfterMs;
}

function armDeferredMembershipPublicationAckRetry(service, nodeId,
  retryAfterMs) {
  return service.setTimeoutFn(() => {
    service.membershipPublicationAckDeferredRetries.delete(nodeId);
    if (!service.isNodeReady(nodeId)) {
      return;
    }
    service.scheduleReadyNodeMembershipPublicationAdvance(
      nodeId,
      NODE_ROW_UNAVAILABLE,
      RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_ACK_RETRY,
    );
  }, retryAfterMs);
}

/**
 * Retain the node's acknowledgement obligation.
 * @param {Object} service - The dispatch service.
 * @param {string} nodeId
 * @param {Object} retained - {retryAfterMs, error, publicationId?}.
 * @return {boolean}
 */
function retainMembershipPublicationAck(service, nodeId, retained) {
  const {retryAfterMs} = retained;
  const desiredAttemptAt = Date.now() + retryAfterMs;
  const existing = service.membershipPublicationAckDeferredRetries.get(nodeId);
  if (existing) {
    existing.error = retained.error;
    if (desiredAttemptAt < existing.nextAttemptAt) {
      if (existing.timeoutHandle) {
        service.clearTimeoutFn(existing.timeoutHandle);
      }
      existing.nextAttemptAt = desiredAttemptAt;
      existing.timeoutHandle = service.armDeferredMembershipPublicationAckRetry(
        nodeId,
        retryAfterMs,
      );
    }
    return true;
  }
  service.membershipPublicationAckDeferredRetries.set(nodeId, {
    error: retained.error,
    nextAttemptAt: desiredAttemptAt,
    timeoutHandle: service.armDeferredMembershipPublicationAckRetry(
      nodeId,
      retryAfterMs,
    ),
  });
  service.logger.info(DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_ACK_DEFERRED, {
    nodeId,
    retryAfterMs,
    error: retained.error,
    ...(retained.publicationId ?
      {publicationId: retained.publicationId} : {}),
  });
  return true;
}

function deferMembershipPublicationAckRetry(service, nodeId, error) {
  if (!nodeId || !isRetryableControlPlaneError(error)) {
    return false;
  }
  return service.retainMembershipPublicationAck(nodeId, {
    retryAfterMs: service.resolveMembershipPublicationAckRetryAfterMs(error),
    error: getControlPlaneErrorMessage(error),
  });
}

export {
  armDeferredMembershipPublicationAckRetry,
  deferMembershipPublicationAckRetry,
  resolveMembershipPublicationAckRetryAfterMs,
  retainMembershipPublicationAck,
};
