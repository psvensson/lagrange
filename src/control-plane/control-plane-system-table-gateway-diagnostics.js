import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE,
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
  resolveCanonicalLeaderIdentitySnapshot,
  resolveCanonicalLeaderRoutingGapState,
} from './control-plane-system-table-gateway-shared.js';

/**
 * @param {Object} gateway
 * @param {string|null} tableName
 * @return {string|null}
 */
function resolveGatewaySystemTablePartitionId(gateway, tableName) {
  if (typeof tableName !== 'string' || tableName.length === 0) {
    return null;
  }
  const cdcIntegrationService = gateway.resolveCdcIntegrationService();
  if (
    typeof cdcIntegrationService?.resolveSystemTablePartitionIds ===
    'function'
  ) {
    const partitionIds =
      cdcIntegrationService.resolveSystemTablePartitionIds(tableName);
    if (Array.isArray(partitionIds)) {
      const partitionId =
        partitionIds.find(
          (entry) =>
            typeof entry === 'string' && entry.length > 0,
        ) || null;
      if (partitionId) {
        return partitionId;
      }
    }
  }
  return INITIAL_PARTITION_IDS[tableName] || null;
}

/**
 * @param {Object} gateway
 * @param {string|null} tableName
 * @param {string|null} routingReadinessDimension
 * @param {Object} [diagnosticsOptions={}]
 * @param {boolean} [diagnosticsOptions.includeRoutingSnapshot] - When false,
 *   skip the live partition routing snapshot (full per-service readiness
 *   evaluation) and derive every field from cache fallbacks. CL-012: the
 *   operation-ledger diagnostics run on EVERY gateway operation, so the
 *   snapshot is reserved for failure diagnosis.
 * @return {Object}
 */
function buildGatewayFallbackSystemTableRoutingDiagnostics(
  gateway,
  tableName,
  routingReadinessDimension = null,
  diagnosticsOptions = {},
) {
  const partitionId = resolveGatewaySystemTablePartitionId(gateway, tableName);
  let routingSnapshot = null;
  const sqlQueryEngine = gateway.resolveSqlQueryEngine();
  if (
    diagnosticsOptions.includeRoutingSnapshot !== false &&
    partitionId &&
    sqlQueryEngine?.queryExecutor &&
    typeof sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot ===
      'function'
  ) {
    try {
      routingSnapshot =
        sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot(
          partitionId,
          routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        );
    } catch (_error) {
      routingSnapshot = null;
    }
  }

  let partitionRow = null;
  let serviceRows = [];
  const systemTableCache = gateway.resolveSystemTableCache();
  if (
    systemTableCache &&
    typeof systemTableCache.filter === 'function'
  ) {
    const partitionRows =
      systemTableCache.filter(SYSTEM_TABLE_NAME.PARTITIONS, (row) => {
        const rowPartitionId =
          row?.partition_id || row?.partitionId || row?.id || null;
        if (partitionId && rowPartitionId === partitionId) {
          return true;
        }
        return row?.table_name === tableName || row?.tableName === tableName;
      }) || [];
    partitionRow = partitionRows[0] || null;
    if (partitionId) {
      serviceRows =
        systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (row) => {
          return (
            row?.partition_id === partitionId &&
            row?.service_type ===
              CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.PARTITION
          );
        }) || [];
    }
  }

  const hasRoutingSnapshot =
    routingSnapshot && typeof routingSnapshot === 'object';
  const fallbackCanonicalLeaderIdentity = hasRoutingSnapshot ?
    null :
    resolveCanonicalLeaderIdentitySnapshot({
      partition: partitionRow || null,
      partitionPresent: partitionRow !== null,
      serviceRows,
    });
  const leaderNodeId = hasRoutingSnapshot ?
    routingSnapshot[
      CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD.CANONICAL_LEADER_NODE_ID
    ] :
    fallbackCanonicalLeaderIdentity?.leaderNodeId;
  const canonicalLeaderIdentityState = hasRoutingSnapshot ?
    typeof routingSnapshot[
      CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD.CANONICAL_LEADER_IDENTITY_STATE
    ] === 'string' ?
      routingSnapshot[
        CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD.CANONICAL_LEADER_IDENTITY_STATE
      ] :
      null :
    fallbackCanonicalLeaderIdentity?.state || null;
  const routableServiceCount = Number.isFinite(
    routingSnapshot?.routableServiceCount,
  ) ?
    routingSnapshot.routableServiceCount :
    serviceRows.filter(
      (row) =>
        row?.status === CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ACTIVE &&
          typeof row?.address === 'string' &&
          row.address.length > 0,
    ).length;
  const serviceRowCount = Number.isFinite(routingSnapshot?.serviceRowCount) ?
    routingSnapshot.serviceRowCount :
    serviceRows.length;
  const canonicalLeaderRoutingGapState = hasRoutingSnapshot ?
    typeof routingSnapshot[
      CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD
        .CANONICAL_LEADER_ROUTING_GAP_STATE
    ] === 'string' ?
      routingSnapshot[
        CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD
          .CANONICAL_LEADER_ROUTING_GAP_STATE
      ] :
      null :
    resolveCanonicalLeaderRoutingGapState({
      canonicalLeaderIdentityState,
      canonicalLeaderNodeId: leaderNodeId,
      serviceRowCount,
      activeAddressedServiceCount: routableServiceCount,
    });
  return {
    partitionId,
    ...(typeof canonicalLeaderIdentityState === 'string' ?
      {
        canonicalLeaderIdentityState,
      } :
      {}),
    ...(typeof canonicalLeaderRoutingGapState === 'string' ?
      {
        canonicalLeaderRoutingGapState,
      } :
      {}),
    ...(typeof leaderNodeId === 'string' &&
    leaderNodeId.length > 0 ?
      {
        leaderNodeId,
      } :
      {}),
    serviceRowCount,
    routableServiceCount,
    deniedByReadiness:
      routingSnapshot &&
      typeof routingSnapshot.deniedByNodeId === 'object' ?
        Object.keys(routingSnapshot.deniedByNodeId).length > 0 :
        false,
  };
}

/**
 * @param {Object} gateway
 * @param {string|null} tableName
 * @param {Object|null} result
 * @param {Object} [options={}]
 * @return {Object}
 */
function buildGatewayOperationLedgerDiagnostics(
  gateway,
  tableName,
  result = null,
  options = {},
) {
  const routingReadinessDimension =
    options?.routingReadinessDimension ||
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
  const hasFailureSignals =
    result?.success === false ||
    typeof result?.error === 'string' ||
    typeof result?.message === 'string' ||
    Array.isArray(result?.participantFailures);
  const systemTableDiagnostics =
    result?.systemTableDiagnostics &&
    typeof result.systemTableDiagnostics === 'object' ?
      result.systemTableDiagnostics :
      {};
  const failureSummary = hasFailureSignals ?
    getControlPlaneFailureSummary(result) :
    null;
  const retryAfterMs = hasFailureSignals ?
    getControlPlaneRetryAfterMs(result) :
    0;
  const errorCode = hasFailureSignals ?
    getControlPlaneErrorCode(result) || null :
    null;
  const fallbackDiagnostics = buildGatewayFallbackSystemTableRoutingDiagnostics(
    gateway,
    tableName,
    routingReadinessDimension,
    {
      // CL-012: live routing snapshots (full per-service readiness) are
      // reserved for failure diagnosis; successful operations use cache
      // fallbacks.
      includeRoutingSnapshot: hasFailureSignals,
    },
  );
  const canonicalLeaderIdentityState =
    systemTableDiagnostics.canonicalLeaderIdentityState ||
    fallbackDiagnostics.canonicalLeaderIdentityState ||
    null;
  const canonicalLeaderRoutingGapState =
    systemTableDiagnostics.canonicalLeaderRoutingGapState ||
    fallbackDiagnostics.canonicalLeaderRoutingGapState ||
    null;
  const leaderNodeId =
    typeof systemTableDiagnostics.leaderNodeId === 'string' &&
    systemTableDiagnostics.leaderNodeId.length > 0 ?
      systemTableDiagnostics.leaderNodeId :
      typeof fallbackDiagnostics.leaderNodeId === 'string' &&
          fallbackDiagnostics.leaderNodeId.length > 0 ?
        fallbackDiagnostics.leaderNodeId :
        null;
  const queryTimeoutMs = Number.isFinite(
    systemTableDiagnostics.queryTimeoutMs,
  ) ?
    systemTableDiagnostics.queryTimeoutMs :
    Number.isFinite(result?.queryTimeoutMs) ?
      result.queryTimeoutMs :
      Number.isFinite(options?.timeoutMs) ?
        options.timeoutMs :
        Number.isFinite(options?.queryTimeoutMs) ?
          options.queryTimeoutMs :
          Number.isFinite(options?.requestedTimeoutMs) ?
            options.requestedTimeoutMs :
            null;
  const routedToNode =
    systemTableDiagnostics.routedToNode ||
    (result?.source ===
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE ||
    result?.source ===
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.OWNER_RPC_LANE ||
    options?.operationClass ===
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION ||
    options?.operationClass ===
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY ?
      leaderNodeId :
      null);
  return {
    partitionId:
      systemTableDiagnostics.partitionId ||
      fallbackDiagnostics.partitionId ||
      null,
    localReadHit:
      result?.localReadHit === true ||
      systemTableDiagnostics.localReadHit === true ||
      result?.source ===
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.LOCAL_PARTITION_REPLICA,
    localReplicaFallbackHit:
      result?.localReplicaFallbackHit === true ||
      systemTableDiagnostics.localReplicaFallbackHit === true,
    ...(typeof routedToNode === 'string' &&
    routedToNode.length > 0 ?
      {
        routedToNode,
      } :
      {}),
    deniedByReadiness:
      systemTableDiagnostics.deniedByReadiness === true ||
      fallbackDiagnostics.deniedByReadiness === true ||
      result?.errorCode ===
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ROUTER_QUERY_TRANSPORT_NOT_READY ||
      (result?.success === false && result?.deferRetry === true),
    ...(typeof canonicalLeaderIdentityState === 'string' ?
      {
        canonicalLeaderIdentityState,
      } :
      {}),
    ...(typeof canonicalLeaderRoutingGapState === 'string' ?
      {
        canonicalLeaderRoutingGapState,
      } :
      {}),
    ...(typeof leaderNodeId === 'string' &&
    leaderNodeId.length > 0 ?
      {
        leaderNodeId,
      } :
      {}),
    serviceRowCount: Number.isFinite(systemTableDiagnostics.serviceRowCount) ?
      systemTableDiagnostics.serviceRowCount :
      fallbackDiagnostics.serviceRowCount,
    routableServiceCount: Number.isFinite(
      systemTableDiagnostics.routableServiceCount,
    ) ?
      systemTableDiagnostics.routableServiceCount :
      fallbackDiagnostics.routableServiceCount,
    queryTimeoutMs:
      Number.isFinite(queryTimeoutMs) && queryTimeoutMs > 0 ?
        Math.floor(queryTimeoutMs) :
        null,
    ...(typeof errorCode === 'string' && errorCode.length > 0 ?
      {
        errorCode,
      } :
      {}),
    ...(retryAfterMs > 0 ?
      {
        retryAfterMs,
      } :
      {}),
    ...(failureSummary && failureSummary.linkedFailureCount > 0 ?
      {
        canonicalFailureReason: failureSummary.primaryReason,
        linkedFailureCount: failureSummary.linkedFailureCount,
        authoritativeRowSourceUnavailableCount:
            failureSummary.authoritativeRowSourceUnavailableCount,
        distributedParticipantFailureCount:
            failureSummary.distributedParticipantFailureCount,
        reconnectDeliveryFailureCount:
            failureSummary.reconnectDeliveryFailureCount,
      } :
      {}),
    ...(Number.isFinite(result?.queueWaitMs) ?
      {
        queueWaitMs: Math.max(0, Math.floor(result.queueWaitMs)),
      } :
      {}),
    ...(typeof result?.queueState === 'string' ?
      {
        queueState: result.queueState,
      } :
      {}),
  };
}

export {
  buildGatewayFallbackSystemTableRoutingDiagnostics,
  buildGatewayOperationLedgerDiagnostics,
  resolveGatewaySystemTablePartitionId,
};
