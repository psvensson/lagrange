import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

const {
  ConnectionState,
  ROUTER_LOG_MSG,
  RouterMessageType,
  TRANSPORT_NUM,
  uuidv4,
} = MESSAGE_ROUTER_SHARED;

function buildRecentPeerLivenessEvidence(
  lastInboundAt,
  livenessWindowMs,
  nowMs = Date.now(),
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

function getRouterPeerLivenessEvidence(router, nodeId, nowMs = Date.now()) {
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
  pingId,
  resolve,
) {
  router.pendingPings.delete(pingId);
  const currentConnection = router.nodeConnections.get(nodeId);
  if (
    currentConnection !== initiatingConnection ||
    currentConnection.state !== ConnectionState.CONNECTED ||
    currentConnection.ws !== initiatingWebSocket
  ) {
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
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolvePingTimeout(
        router,
        nodeId,
        connection,
        initiatingWebSocket,
        pingId,
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
      timestamp: Date.now(),
    });
  });
}

export {
  buildRecentPeerLivenessEvidence,
  getRouterPeerLivenessEvidence,
};
