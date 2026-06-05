import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

const {
  ConnectionState,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_ERROR_MSG,
  MESSAGE_ROUTER_LITERAL,
  ROUTER_LOG_MSG,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  TRANSPORT_NUM,
  TRANSPORT_PRESSURE_SUMMARY_FIELD,
  TRANSPORT_TYPEOF,
  normalizeRetryAfterMs,
  uuidv4,
} = MESSAGE_ROUTER_SHARED;

export function resolveNodeAddressForDelivery(router, targetNodeId) {
  return router.connectionAuthorityOwner.resolveNodeAddressForDelivery(
    targetNodeId,
  );
}

export function resolveCanonicalReconnectAddress(
  router,
  targetNodeId,
  fallbackAddress = null,
) {
  return router.connectionAuthorityOwner.resolveCanonicalReconnectAddress(
    targetNodeId,
    fallbackAddress,
  );
}

export function refreshReconnectAuthority(
  router,
  connectionInfo,
  fallbackAddress = null,
) {
  return router.connectionAuthorityOwner.refreshReconnectAuthority(
    connectionInfo,
    fallbackAddress,
  );
}

export function hasScheduledReconnect(router, connectionInfo) {
  return Boolean(
    connectionInfo &&
    connectionInfo.state === ConnectionState.RECONNECTING &&
    connectionInfo.reconnectTimeout,
  );
}

export function resolveReconnectRetryAfterMs(router, connectionInfo) {
  const dueAt = connectionInfo?.reconnectDueAt;
  if (!Number.isFinite(dueAt)) {
    return router.reconnectIntervalMs;
  }
  return Math.max(TRANSPORT_NUM.ZERO, Math.ceil(dueAt - Date.now()));
}

export function buildConnectionClosedError(
  router,
  targetNodeId,
  options = {},
) {
  const error = new Error(ROUTER_ERROR_MSG.connectionClosed(targetNodeId));
  error.code = ROUTER_CONNECTION_CLOSED_ERROR_CODE;
  error.deferRetry = true;
  error.retryAfterMs = normalizeRetryAfterMs(
    options.retryAfterMs,
    router.reconnectIntervalMs,
  );
  error.recoverableBeforeSend = options.beforeSend === true;
  return error;
}

export function buildReconnectInProgressFailure(
  router,
  targetNodeId,
  messageId,
  correlationId,
) {
  const connection = router.nodeConnections.get(targetNodeId) || null;
  if (!router.hasScheduledReconnect(connection)) {
    return null;
  }
  return router.buildDeferredDeliveryFailure(
    messageId,
    correlationId,
    ROUTER_ERROR_MSG.connectionClosed(targetNodeId),
    {
      errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
      retryAfterMs: router.resolveReconnectRetryAfterMs(connection),
    },
  );
}

export function getReconnectAddressSuppressionKey(
  router,
  targetNodeId,
  address,
) {
  return router.connectionAuthorityOwner.getReconnectAddressSuppressionKey(
    targetNodeId,
    address,
  );
}

export function pruneReconnectAddressSuppressions(router, nowMs = Date.now()) {
  router.connectionAuthorityOwner.pruneReconnectAddressSuppressions(nowMs);
}

export function isReconnectAddressSuppressed(router, targetNodeId, address) {
  return router.connectionAuthorityOwner.isReconnectAddressSuppressed(
    targetNodeId,
    address,
  );
}

export function suppressReconnectAddress(router, targetNodeId, address) {
  router.connectionAuthorityOwner.suppressReconnectAddress(targetNodeId, address);
}

export function clearReconnectAddressSuppression(router, targetNodeId, address) {
  router.connectionAuthorityOwner.clearReconnectAddressSuppression(
    targetNodeId,
    address,
  );
}

export function shouldSuppressReconnectAddress(router, error) {
  return router.connectionAuthorityOwner.shouldSuppressReconnectAddress(error);
}

export function resolveReconnectAddresses(
  router,
  targetNodeId,
  preferredAddress = null,
) {
  return router.connectionAuthorityOwner.resolveReconnectAddresses(
    targetNodeId,
    preferredAddress,
  );
}

export function resolveReconnectAddressCandidates(
  router,
  targetNodeId,
  preferredAddress = null,
) {
  return router.connectionAuthorityOwner.resolveReconnectAddressCandidates(
    targetNodeId,
    preferredAddress,
  );
}

export function ensureReconnectOwnerConnection(
  router,
  targetNodeId,
  preferredAddress = null,
) {
  const existing = router.nodeConnections.get(targetNodeId) || null;
  if (existing) {
    router.refreshReconnectAuthority(existing, preferredAddress);
    if (
      typeof preferredAddress === TRANSPORT_TYPEOF.STRING &&
      preferredAddress.length > TRANSPORT_NUM.ZERO
    ) {
      if (
        typeof existing.configuredAddress !== TRANSPORT_TYPEOF.STRING ||
        existing.configuredAddress.length === TRANSPORT_NUM.ZERO
      ) {
        existing.configuredAddress = preferredAddress;
      }
      if (
        typeof existing.address !== TRANSPORT_TYPEOF.STRING ||
        existing.address.length === TRANSPORT_NUM.ZERO
      ) {
        existing.address = preferredAddress;
      }
    }
    return existing;
  }
  if (
    typeof preferredAddress !== TRANSPORT_TYPEOF.STRING ||
    preferredAddress.length === TRANSPORT_NUM.ZERO
  ) {
    return null;
  }
  const canonicalPreferredAddress =
    router.resolveCanonicalReconnectAddress(targetNodeId, preferredAddress) ||
    preferredAddress;
  const connectionInfo = {
    connectionId: uuidv4(),
    nodeId: targetNodeId,
    address: canonicalPreferredAddress,
    configuredAddress: canonicalPreferredAddress,
    observedAddress: null,
    ws: null,
    state: ConnectionState.DISCONNECTED,
    reconnectAttempts: TRANSPORT_NUM.ZERO,
    reconnectTimeout: null,
    reconnectDueAt: null,
    pingInterval: null,
    isIncoming: false,
    isSelfConnection: false,
    ackTimeoutStreak: TRANSPORT_NUM.ZERO,
    lastAckAt: null,
    lastAckTimeoutAt: null,
    retired: false,
    createdAt: Date.now(),
  };
  router.nodeConnections.set(targetNodeId, connectionInfo);
  return connectionInfo;
}

export function armReconnectAfterConnectFailure(
  router,
  targetNodeId,
  preferredAddress = null,
) {
  const connection = router.ensureReconnectOwnerConnection(
    targetNodeId,
    preferredAddress,
  );
  if (
    !connection ||
    connection.isIncoming === true ||
    connection.isSelfConnection === true ||
    connection.state === ConnectionState.CONNECTED ||
    router.hasScheduledReconnect(connection)
  ) {
    return connection;
  }
  if (
    typeof connection.address !== TRANSPORT_TYPEOF.STRING ||
    connection.address.length === TRANSPORT_NUM.ZERO
  ) {
    return connection;
  }
  connection.state = ConnectionState.DISCONNECTED;
  router.scheduleReconnect(connection);
  return connection;
}

export function shouldDeferColdReconnectForDeliveryBudget(router, timeoutMs) {
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= TRANSPORT_NUM.ZERO ||
    !Number.isFinite(router.connectTimeoutMs) ||
    router.connectTimeoutMs <= TRANSPORT_NUM.ZERO
  ) {
    return false;
  }
  return Math.floor(timeoutMs) < Math.floor(router.connectTimeoutMs);
}

export function buildColdReconnectBudgetFailure(
  router,
  targetNodeId,
  reconnectAddress,
  messageId,
  correlationId,
) {
  const existing = router.nodeConnections.get(targetNodeId) || null;
  if (existing && existing.state === ConnectionState.CONNECTED) {
    return null;
  }
  const reconnectInProgress = router.buildReconnectInProgressFailure(
    targetNodeId,
    messageId,
    correlationId,
  );
  if (reconnectInProgress) {
    return reconnectInProgress;
  }
  if (!router.pendingNodeConnections.has(targetNodeId)) {
    router.armReconnectAfterConnectFailure(targetNodeId, reconnectAddress);
  }
  return router.buildReconnectInProgressFailure(
    targetNodeId,
    messageId,
    correlationId,
  ) || router.buildDeferredDeliveryFailure(
    messageId,
    correlationId,
    ROUTER_ERROR_MSG.connectionClosed(targetNodeId),
    {
      errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
      retryAfterMs: router.reconnectIntervalMs,
    },
  );
}

export async function ensureNodeConnection(router, targetNodeId, address) {
  const existing = router.nodeConnections.get(targetNodeId);
  if (existing && existing.state === ConnectionState.CONNECTED) {
    return existing;
  }
  if (router.hasScheduledReconnect(existing)) {
    return null;
  }
  if (router.pendingNodeConnections.has(targetNodeId)) {
    return router.pendingNodeConnections.get(targetNodeId);
  }
  const connectionPromise = (async () => {
    const reconnectCandidates = router.resolveReconnectAddressCandidates(
      targetNodeId,
      address,
    );
    const seenCandidateAddresses = new Set(
      reconnectCandidates.map((candidate) => candidate.address),
    );
    const attemptedCandidateAddresses = new Set();
    const appendFreshReconnectCandidates = () => {
      const freshCandidates = router.resolveReconnectAddressCandidates(
        targetNodeId,
        address,
      );
      for (const candidate of freshCandidates) {
        if (
          attemptedCandidateAddresses.has(candidate.address) ||
          seenCandidateAddresses.has(candidate.address)
        ) {
          continue;
        }
        reconnectCandidates.push(candidate);
        seenCandidateAddresses.add(candidate.address);
      }
    };
    let lastError = null;
    let lastReconnectAddress = null;
    try {
      for (
        let candidateIndex = TRANSPORT_NUM.ZERO;
        candidateIndex < reconnectCandidates.length;
        candidateIndex += TRANSPORT_NUM.ONE
      ) {
        const reconnectCandidate = reconnectCandidates[candidateIndex];
        const reconnectAddress = reconnectCandidate.address;
        if (attemptedCandidateAddresses.has(reconnectAddress)) {
          continue;
        }
        attemptedCandidateAddresses.add(reconnectAddress);
        lastReconnectAddress = reconnectAddress;
        try {
          await router.connectToNode(targetNodeId, reconnectAddress);
          router.clearReconnectAddressSuppression(
            targetNodeId,
            reconnectAddress,
          );
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (router.shouldSuppressReconnectAddress(error)) {
            router.suppressReconnectAddress(targetNodeId, reconnectAddress);
            appendFreshReconnectCandidates();
          }
          router.transportPressureMetrics[
            TRANSPORT_PRESSURE_SUMMARY_FIELD.RECONNECT_BEFORE_DELIVERY_FAILURE_COUNT
          ] += TRANSPORT_NUM.ONE;
          router.logger.warn(
            'Failed to reconnect target node before delivery',
            {
              targetNodeId,
              address: reconnectAddress,
              candidateSource: reconnectCandidate.candidateSource,
              candidateSources: reconnectCandidate.candidateSources,
              candidateIndex,
              candidateCount: reconnectCandidates.length,
              localNodeId: router.nodeId,
              error: error?.message || String(error),
            },
          );
        }
      }
    } finally {
      router.pendingNodeConnections.delete(targetNodeId);
      router.recordPendingNodeConnectionSnapshot();
    }
    router.armReconnectAfterConnectFailure(
      targetNodeId,
      lastReconnectAddress || address,
    );
    const connection = router.nodeConnections.get(targetNodeId) || null;
    if (!connection || connection.state !== ConnectionState.CONNECTED) {
      if (lastError && reconnectCandidates.length === TRANSPORT_NUM.ZERO) {
        router.transportPressureMetrics[
          TRANSPORT_PRESSURE_SUMMARY_FIELD.RECONNECT_BEFORE_DELIVERY_FAILURE_COUNT
        ] += TRANSPORT_NUM.ONE;
        router.logger.warn('Failed to reconnect target node before delivery', {
          targetNodeId,
          address: null,
          localNodeId: router.nodeId,
          error: lastError?.message || String(lastError),
        });
      }
    }
    return connection && connection.state === ConnectionState.CONNECTED ?
      connection :
      null;
  })();
  router.pendingNodeConnections.set(targetNodeId, connectionPromise);
  router.recordPendingNodeConnectionSnapshot();
  return connectionPromise;
}

export async function tryDeliverAfterReconnect(
  router,
  reconnectAddress,
  targetAddress,
  messageId,
  payload,
  targetNodeId,
  correlationId,
  timeoutMs = null,
) {
  if (router.shouldDeferColdReconnectForDeliveryBudget(timeoutMs)) {
    const reconnectBudgetFailure = router.buildColdReconnectBudgetFailure(
      targetNodeId,
      reconnectAddress,
      messageId,
      correlationId,
    );
    if (reconnectBudgetFailure) {
      return reconnectBudgetFailure;
    }
  }
  const connection = await router.ensureNodeConnection(
    targetNodeId,
    reconnectAddress,
  );
  if (!connection || connection.state !== ConnectionState.CONNECTED) {
    const reconnectInProgress = router.buildReconnectInProgressFailure(
      targetNodeId,
      messageId,
      correlationId,
    );
    if (reconnectInProgress) {
      return reconnectInProgress;
    }
    router.logger.warn(ROUTER_LOG_MSG.NO_TARGET_CONNECTION, {
      messageId,
      targetAddress,
      targetNodeId,
      localNodeId: router.nodeId,
      connectionExists: !!connection,
      connectionState: connection?.state,
      availableConnections: Array.from(router.nodeConnections.keys()),
      reconnectAddress,
      recoveredViaResolver: true,
    });
    return router.buildDeferredDeliveryFailure(
      messageId,
      correlationId,
      ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
      {
        errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
        retryAfterMs: router.reconnectIntervalMs,
      },
    );
  }
  return router.sendMessage(
    connection,
    targetAddress,
    messageId,
    payload,
    targetNodeId,
    correlationId,
    timeoutMs,
  );
}

export function scheduleRetiredSocketTermination(router, staleWs) {
  if (
    !staleWs ||
    (typeof staleWs.terminate !== TRANSPORT_TYPEOF.FUNCTION &&
      typeof staleWs.close !== TRANSPORT_TYPEOF.FUNCTION)
  ) {
    return;
  }
  const graceMs = Math.max(
    router.reconnectIntervalMs,
    router.messageTimeoutMs,
  );
  const timeout = setTimeout(() => {
    try {
      if (typeof staleWs.terminate === TRANSPORT_TYPEOF.FUNCTION) {
        staleWs.terminate();
      } else if (typeof staleWs.close === TRANSPORT_TYPEOF.FUNCTION) {
        staleWs.close();
      }
    } catch (_closeErr) {
      void _closeErr;
    }
  }, graceMs);
  if (typeof timeout?.unref === TRANSPORT_TYPEOF.FUNCTION) {
    timeout.unref();
  }
}

export function quarantineConnectionAfterAckTimeout(
  router,
  targetNodeId,
  connection,
  messageId,
  targetAddress,
) {
  if (
    !connection ||
    connection.isIncoming === true ||
    connection.isSelfConnection === true
  ) {
    return;
  }
  const activeConnection = router.nodeConnections.get(targetNodeId);
  if (
    !activeConnection ||
    activeConnection.connectionId !== connection.connectionId ||
    activeConnection.state !== ConnectionState.CONNECTED
  ) {
    return activeConnection || null;
  }
  activeConnection.ackTimeoutStreak =
    (activeConnection.ackTimeoutStreak || TRANSPORT_NUM.ZERO) +
    TRANSPORT_NUM.ONE;
  activeConnection.lastAckTimeoutAt = Date.now();
  if (
    activeConnection.ackTimeoutStreak < router.ackTimeoutQuarantineThreshold
  ) {
    router.logger.debug(
              MESSAGE_ROUTER_LITERAL.STRING_OBSERVED_ACK_TIMEOUT_BELOW_QUARANTINE_THRESHOLD,
      {
        messageId,
        targetAddress,
        targetNodeId,
        localNodeId: router.nodeId,
        connectionId: activeConnection.connectionId,
        ackTimeoutStreak: activeConnection.ackTimeoutStreak,
        ackTimeoutQuarantineThreshold: router.ackTimeoutQuarantineThreshold,
      },
    );
    return activeConnection;
  }
  router.logger.warn(
    MESSAGE_ROUTER_LITERAL.STRING_QUARANTINING_TARGET_CONNECTION_AFTER_ACK_TIMEOUT,
    {
      messageId,
      targetAddress,
      targetNodeId,
      localNodeId: router.nodeId,
      connectionId: activeConnection.connectionId,
      ackTimeoutStreak: activeConnection.ackTimeoutStreak,
      ackTimeoutQuarantineThreshold: router.ackTimeoutQuarantineThreshold,
    },
  );
  const staleWs = activeConnection.ws || null;
  const reconnectOwner = {
    connectionId: uuidv4(),
    nodeId: activeConnection.nodeId,
    nodeAddress: activeConnection.nodeAddress,
    address: activeConnection.address,
    configuredAddress: activeConnection.configuredAddress || activeConnection.address,
    observedAddress: activeConnection.observedAddress || null,
    ws: null,
    state: ConnectionState.DISCONNECTED,
    reconnectAttempts: activeConnection.reconnectAttempts,
    reconnectTimeout: null,
    reconnectDueAt: null,
    pingInterval: null,
    isIncoming: false,
    isSelfConnection: false,
    ackTimeoutStreak: TRANSPORT_NUM.ZERO,
    lastAckAt: activeConnection.lastAckAt || null,
    lastAckTimeoutAt: activeConnection.lastAckTimeoutAt || null,
    retired: false,
    createdAt: Date.now(),
  };
  router.retireConnection(activeConnection);
  activeConnection.state = ConnectionState.CLOSED;
  router.nodeConnections.set(targetNodeId, reconnectOwner);
  router.scheduleReconnect(reconnectOwner);
  router.scheduleRetiredSocketTermination(staleWs);
  return reconnectOwner;
}

export function buildDeferredDeliveryFailure(
  router,
  messageId,
  correlationId,
  error,
  options = {},
) {
  const result = {
    messageId,
    correlationId,
    acknowledged: false,
    error,
    deferRetry: true,
    retryAfterMs: normalizeRetryAfterMs(
      options.retryAfterMs,
      router.reconnectIntervalMs,
    ),
  };
  if (
    typeof options.errorCode === TRANSPORT_TYPEOF.STRING &&
    options.errorCode.length > TRANSPORT_NUM.ZERO
  ) {
    result.errorCode = options.errorCode;
  }
  return result;
}
