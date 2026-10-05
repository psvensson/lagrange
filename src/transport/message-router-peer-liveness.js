import {readWaitClock, reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

const {
  ConnectionState,
  ROUTER_LOG_MSG,
  RouterMessageType,
  TRANSPORT_NUM,
  uuidv4,
} = MESSAGE_ROUTER_SHARED;

const PING_PONG_WAIT = Object.freeze({
  wait: 'PING_TIMEOUT_MS',
  awaited: 'PONG from the pinged node',
});

/**
 * A ping spent its bound without a PONG and the ping resolves dead (the
 * connection was replaced, or no recent inbound traffic answered for the
 * node): one wait_bound_spent ERROR per node, folded while what the router
 * observed of it is unchanged (probers ping on a cadence). A ping answered
 * alive by recent inbound traffic is not a spent wait: it logs at INFO and
 * never reaches here.
 * @param {Object} router - The message router.
 * @param {string} nodeId - The pinged node.
 * @param {Object} probe - {sentAtMs, timeoutMs}.
 * @param {Object} observed - {connectionReplaced, livenessEvidence}.
 * @return {void}
 */
function reportPingPongSpent(router, nodeId, probe, observed) {
  reportWaitBoundSpent(router.logger, {
    ...PING_PONG_WAIT,
    boundMs: probe.timeoutMs,
    elapsedMs: readWaitClock(router.timeSource) - probe.sentAtMs,
    lastObserved: {
      connectionReplaced: observed.connectionReplaced,
      answeredAliveByRecentInbound: false,
      livenessWindowMs: observed.livenessEvidence?.livenessWindowMs ?? null,
    },
    scope: {nodeId: router.nodeId ?? null, targetNodeId: nodeId},
    subject: nodeId,
  });
}

function buildRecentPeerLivenessEvidence(
  lastInboundAt,
  livenessWindowMs,
  nowMs,
) {
  const lastInboundAgoMs = nowMs - lastInboundAt;
  return Object.freeze({
    lastInboundAt,
    lastInboundAgoMs,
    livenessWindowMs,
    recent:
      Number.isFinite(livenessWindowMs) &&
      livenessWindowMs > TRANSPORT_NUM.ZERO &&
      Number.isFinite(lastInboundAt) &&
      lastInboundAt > TRANSPORT_NUM.ZERO &&
      lastInboundAgoMs < livenessWindowMs,
  });
}

function getRouterPeerLivenessEvidence(
  router, nodeId, nowMs = router.timeSource.now()) {
  return buildRecentPeerLivenessEvidence(
    router.getNodeInboundActivityAt(nodeId),
    router.ackTimeoutQuarantineLivenessWindowMs,
    nowMs,
  );
}

function resolvePingTimeout(
  router,
  nodeId,
  initiatingConnection,
  initiatingWebSocket,
  probe,
  resolve,
) {
  router.pendingPings.delete(probe.pingId);
  const currentConnection = router.nodeConnections.get(nodeId);
  if (
    currentConnection !== initiatingConnection ||
    currentConnection.state !== ConnectionState.CONNECTED ||
    currentConnection.ws !== initiatingWebSocket
  ) {
    reportPingPongSpent(router, nodeId, probe,
      {connectionReplaced: true, livenessEvidence: null});
    resolve(false);
    return;
  }
  const livenessEvidence = getRouterPeerLivenessEvidence(router, nodeId);
  if (livenessEvidence.recent) {
    router.logger.info(ROUTER_LOG_MSG.PING_TIMEOUT_SATISFIED_BY_INBOUND, {
      nodeId,
      lastInboundAgoMs: livenessEvidence.lastInboundAgoMs,
      livenessWindowMs: livenessEvidence.livenessWindowMs,
    });
  } else {
    reportPingPongSpent(router, nodeId, probe,
      {connectionReplaced: false, livenessEvidence});
  }
  resolve(livenessEvidence.recent);
}

export async function pingNode(router, nodeId, timeoutMs = null) {
  const connection = router.nodeConnections.get(nodeId);
  if (
    !connection ||
    connection.state !== ConnectionState.CONNECTED ||
    !connection.ws
  ) {
    return false;
  }
  const pingId = uuidv4();
  const timeout = timeoutMs ?? router.pingTimeoutMs;
  const initiatingWebSocket = connection.ws;
  const probe = {
    pingId,
    sentAtMs: readWaitClock(router.timeSource),
    timeoutMs: timeout,
  };
  return new Promise((resolve) => {
    const timer = router.timeSource.setTimeout(() => {
      resolvePingTimeout(
        router,
        nodeId,
        connection,
        initiatingWebSocket,
        probe,
        resolve,
      );
    }, timeout);
    router.pendingPings.set(pingId, {
      resolve,
      timeout: timer,
    });
    router.sendRaw(initiatingWebSocket, {
      type: RouterMessageType.PING,
      pingId,
      timestamp: router.timeSource.now(),
    });
  });
}

export {
  buildRecentPeerLivenessEvidence,
};
