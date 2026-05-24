import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE,
  INITIAL_PARTITION_IDS,
  NUM,
  SYSTEM_TABLE_NAME,
  TYPEOF,
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
  if (typeof tableName !== TYPEOF.STRING || tableName.length === NUM.ZERO) {
    return null;
  }
  const cdcIntegrationService = gateway.resolveCdcIntegrationService();
  if (
    typeof cdcIntegrationService?.resolveSystemTablePartitionIds ===
    TYPEOF.FUNCTION
  ) {
    const partitionIds =
      cdcIntegrationService.resolveSystemTablePartitionIds(tableName);
    if (Array.isArray(partitionIds)) {
      const partitionId =
        partitionIds.find(
          (entry) =>
            typeof entry === TYPEOF.STRING && entry.length > NUM.ZERO,
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
 * @return {Object}
 */
function buildGatewayFallbackSystemTableRoutingDiagnostics(
  gateway,
  tableName,
  routingReadinessDimension = null,
) {
  const partitionId = resolveGatewaySystemTablePartitionId(gateway, tableName);
  let routingSnapshot = null;
  const sqlQueryEngine = gateway.resolveSqlQueryEngine();
  if (
    partitionId &&
    sqlQueryEngine?.queryExecutor &&
    typeof sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot ===
      TYPEOF.FUNCTION
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
    typeof systemTableCache.filter === TYPEOF.FUNCTION
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
    partitionRow = partitionRows[NUM.ZERO] || null;
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
    routingSnapshot && typeof routingSnapshot === TYPEOF.OBJECT;
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
    ] === TYPEOF.STRING ?
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
          typeof row?.address === TYPEOF.STRING &&
          row.address.length > NUM.ZERO,
    ).length;
  const serviceRowCount = Number.isFinite(routingSnapshot?.serviceRowCount) ?
    routingSnapshot.serviceRowCount :
    serviceRows.length;
  const canonicalLeaderRoutingGapState = hasRoutingSnapshot ?
    typeof routingSnapshot[
      CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD
        .CANONICAL_LEADER_ROUTING_GAP_STATE
    ] === TYPEOF.STRING ?
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
    ...(typeof canonicalLeaderIdentityState === TYPEOF.STRING ?
      {
        canonicalLeaderIdentityState,
      } :
      {}),
    ...(typeof canonicalLeaderRoutingGapState === TYPEOF.STRING ?
      {
        canonicalLeaderRoutingGapState,
      } :
      {}),
    ...(typeof leaderNodeId === TYPEOF.STRING &&
    leaderNodeId.length > NUM.ZERO ?
      {
        leaderNodeId,
      } :
      {}),
    serviceRowCount,
    routableServiceCount,
    deniedByReadiness:
      routingSnapshot &&
      typeof routingSnapshot.deniedByNodeId === TYPEOF.OBJECT ?
        Object.keys(routingSnapshot.deniedByNodeId).length > NUM.ZERO :
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
    typeof result?.error === TYPEOF.STRING ||
    typeof result?.message === TYPEOF.STRING ||
    Array.isArray(result?.participantFailures);
  const systemTableDiagnostics =
    result?.systemTableDiagnostics &&
    typeof result.systemTableDiagnostics === TYPEOF.OBJECT ?
      result.systemTableDiagnostics :
      {};
  const failureSummary = hasFailureSignals ?
    getControlPlaneFailureSummary(result) :
    null;
  const retryAfterMs = hasFailureSignals ?
    getControlPlaneRetryAfterMs(result) :
    NUM.ZERO;
  const errorCode = hasFailureSignals ?
    getControlPlaneErrorCode(result) || null :
    null;
  const fallbackDiagnostics = buildGatewayFallbackSystemTableRoutingDiagnostics(
    gateway,
    tableName,
    routingReadinessDimension,
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
    typeof systemTableDiagnostics.leaderNodeId === TYPEOF.STRING &&
    systemTableDiagnostics.leaderNodeId.length > NUM.ZERO ?
      systemTableDiagnostics.leaderNodeId :
      typeof fallbackDiagnostics.leaderNodeId === TYPEOF.STRING &&
          fallbackDiagnostics.leaderNodeId.length > NUM.ZERO ?
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
    ...(typeof routedToNode === TYPEOF.STRING &&
    routedToNode.length > NUM.ZERO ?
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
    ...(typeof canonicalLeaderIdentityState === TYPEOF.STRING ?
      {
        canonicalLeaderIdentityState,
      } :
      {}),
    ...(typeof canonicalLeaderRoutingGapState === TYPEOF.STRING ?
      {
        canonicalLeaderRoutingGapState,
      } :
      {}),
    ...(typeof leaderNodeId === TYPEOF.STRING &&
    leaderNodeId.length > NUM.ZERO ?
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
      Number.isFinite(queryTimeoutMs) && queryTimeoutMs > NUM.ZERO ?
        Math.floor(queryTimeoutMs) :
        null,
    ...(typeof errorCode === TYPEOF.STRING && errorCode.length > NUM.ZERO ?
      {
        errorCode,
      } :
      {}),
    ...(retryAfterMs > NUM.ZERO ?
      {
        retryAfterMs,
      } :
      {}),
    ...(failureSummary && failureSummary.linkedFailureCount > NUM.ZERO ?
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
        queueWaitMs: Math.max(NUM.ZERO, Math.floor(result.queueWaitMs)),
      } :
      {}),
    ...(typeof result?.queueState === TYPEOF.STRING ?
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
