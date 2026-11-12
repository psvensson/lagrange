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

// A socket is judged wedged only after a sustained ACK-timeout streak: the
// quarantine threshold several times over, and never fewer than this many.
const WEDGED_SOCKET_STREAK_THRESHOLD_MULTIPLE = 3;
const WEDGED_SOCKET_MINIMUM_STREAK = 6;

/**
 * An ACK frame (in time or late) arrived on this outbound socket: the socket
 * returns acknowledgements, so its ACK-timeout streak and the silence the
 * streak measured both end here.
 * @param {Object} connection - The outbound connection record owning the socket.
 * @param {number} nowMs - Router clock.
 * @return {void}
 */
function recordOutboundSocketAcknowledgement(connection, nowMs) {
  connection.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
  connection.ackTimeoutStreakStartedAt = null;
  connection.lastAckAt = nowMs;
  connection.lastAckTimeoutAt = null;
}

/**
 * A delivery on this outbound socket spent its ACK bound. The first timeout
 * of a streak stamps when the streak began; any ACK on the socket clears it.
 * @param {Object} connection - The outbound connection record owning the socket.
 * @param {number} nowMs - Router clock.
 * @return {{ackTimeoutStreak: number, streakStartedAt: number, lastAckAt: number}}
 */
function recordOutboundSocketAckTimeout(connection, nowMs) {
  const streak = (connection.ackTimeoutStreak || 0) + 1;
  connection.ackTimeoutStreak = streak;
  if (streak === 1 || !Number.isFinite(connection.ackTimeoutStreakStartedAt)) {
    connection.ackTimeoutStreakStartedAt = nowMs;
  }
  connection.lastAckTimeoutAt = nowMs;
  return {
    ackTimeoutStreak: streak,
    streakStartedAt: connection.ackTimeoutStreakStartedAt,
    lastAckAt: connection.lastAckAt || 0,
  };
}

/**
 * The least time an ACK-timeout streak on one socket must span before it is
 * evidence against that socket: one keepalive round (interval plus its PONG
 * bound), so a burst of short-bound timeouts on an idle socket cannot outrun
 * the keepalive that would have shown the peer alive.
 * @param {Object} router - {pingIntervalMs, pingTimeoutMs}.
 * @return {number} Milliseconds.
 */
function resolveQuarantineMinimumStreakSpanMs(router) {
  return router.pingIntervalMs + router.pingTimeoutMs;
}

/**
 * Socket-specific death evidence for the ACK-timeout quarantine (CL-007).
 * Wedged means: THIS outbound socket has returned no acknowledgement at all,
 * late ones included, for a full liveness window during which deliveries on
 * it kept spending their ACK bound. The silence is measured from the later of
 * the socket's last ACK and the start of the current timeout streak, so an
 * idle socket's old lastAckAt, a burst of short-bound timeouts, or ACKs that
 * were merely late (each one ends the streak) can never satisfy it.
 * @param {Object} evidence - From recordOutboundSocketAckTimeout.
 * @param {Object} policy - {nowMs, livenessWindowMs, quarantineThreshold}.
 * @return {{wedged: boolean, socketSilentForMs: number}}
 */
function resolveOutboundSocketWedged(evidence, policy) {
  const socketSilentForMs = policy.nowMs -
    Math.max(evidence.lastAckAt, evidence.streakStartedAt);
  const sustainedStreak = Math.max(
    policy.quarantineThreshold * WEDGED_SOCKET_STREAK_THRESHOLD_MULTIPLE,
    WEDGED_SOCKET_MINIMUM_STREAK,
  );
  return Object.freeze({
    socketSilentForMs,
    wedged:
      Number.isFinite(policy.livenessWindowMs) &&
      policy.livenessWindowMs > TRANSPORT_NUM.ZERO &&
      evidence.ackTimeoutStreak >= sustainedStreak &&
      socketSilentForMs >= policy.livenessWindowMs,
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
  recordOutboundSocketAckTimeout,
  recordOutboundSocketAcknowledgement,
  resolveOutboundSocketWedged,
  resolveQuarantineMinimumStreakSpanMs,
};
