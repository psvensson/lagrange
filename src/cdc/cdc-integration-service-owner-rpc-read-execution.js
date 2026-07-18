import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {resolveControlPlaneSystemTableDeliverySource} from '../control-plane/control-plane-system-table-gateway-shared.js';

const {
  ADDRESS,
  AUTHORITATIVE_READ_SOURCE,
  CDC_INTEGRATION_SERVICE_LITERAL,
  CDC_LOG_MSG,
  CONTROL_PLANE_READINESS_DIMENSION,
  ENTITY_TYPE,
  INITIAL_PARTITION_IDS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  normalizeLocalQueryTransportReadiness,
} = CDC_INTEGRATION_SERVICE_SHARED;

const AUTHORITATIVE_SQL_FALLBACK_SOURCE = 'sql_query_engine';
const AUTHORITATIVE_SQL_FALLBACK_SESSION_SUFFIX = ':owner-rpc-recovery';
const AUTHORITATIVE_SQL_FALLBACK_PREFER_LEADER = false;
const AUTHORITATIVE_SQL_FALLBACK_RETRYABLE_ERROR_CODES = Object.freeze([
  QUERY_ERROR_CODE.ROUTER_CONNECTION_CLOSED,
  QUERY_ERROR_CODE.ROUTER_MESSAGE_TIMEOUT,
]);
const AUTHORITATIVE_SQL_FALLBACK_QUERY_TIMEOUT_ERROR_MESSAGES = Object.freeze([
  QUERY_ERROR_MSG.QUERY_TIMEOUT,
]);
const AUTHORITATIVE_OWNER_RPC_READ_PREFER_LEADER = false;

function isAuthoritativeSqlFallbackQueryTimeoutMessage(errorMessage) {
  if (typeof errorMessage !== 'string') {
    return false;
  }

  const normalizedMessage = errorMessage.trim();
  if (
    AUTHORITATIVE_SQL_FALLBACK_QUERY_TIMEOUT_ERROR_MESSAGES.includes(
      normalizedMessage,
    )
  ) {
    return true;
  }

  if (
    !normalizedMessage.startsWith(QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_PREFIX) ||
    !normalizedMessage.endsWith(QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_SUFFIX)
  ) {
    return false;
  }

  const timeoutValue = Number(
    normalizedMessage.slice(
      QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_PREFIX.length,
      normalizedMessage.length -
        QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_SUFFIX.length,
    ),
  );

  return Number.isInteger(timeoutValue) && timeoutValue > 0;
}

function normalizeAuthoritativeReadLocalQueryTransport(
  localQueryTransportReadiness = null,
) {
  return localQueryTransportReadiness &&
    typeof localQueryTransportReadiness === 'object' ?
    {
      state: localQueryTransportReadiness.state || null,
      ready: localQueryTransportReadiness.ready === true,
      reason: localQueryTransportReadiness.reason || null,
      retryAfterMs: localQueryTransportReadiness.retryAfterMs || 0,
    } :
    null;
}

function shouldRetryOwnerRpcReadViaSqlFallback(
  ownerRpcResult,
  options = {},
  localQueryTransportReadiness = null,
) {
  if (ownerRpcResult?.success === true || options?.allowSqlFallback !== true) {
    return false;
  }

  if (options?.requireOwnerRpcRead === true) {
    return false;
  }

  if (localQueryTransportReadiness?.ready === false) {
    return false;
  }

  const errorCode = String(
    ownerRpcResult?.errorCode || ownerRpcResult?.code || '',
  ).toUpperCase();

  const errorMessage =
    typeof ownerRpcResult?.error === 'string' ?
      ownerRpcResult.error :
      ownerRpcResult?.error?.message || ownerRpcResult?.message;

  return (
    AUTHORITATIVE_SQL_FALLBACK_RETRYABLE_ERROR_CODES.includes(errorCode) ||
    isAuthoritativeSqlFallbackQueryTimeoutMessage(errorMessage) ||
    ownerRpcResult?.deferRetry === true ||
    (
      Number.isFinite(ownerRpcResult?.retryAfterMs) &&
      ownerRpcResult.retryAfterMs > 0
    )
  );
}

function buildOwnerRpcSqlFallbackQueryOptions(
  queryOptions = {},
  baseDiagnostics = {},
) {
  const resolvedQueryOptions =
    queryOptions && typeof queryOptions === 'object' ? queryOptions : {};

  const sessionId =
    typeof resolvedQueryOptions.sessionId === 'string' &&
    resolvedQueryOptions.sessionId.length > 0 ?
      `${resolvedQueryOptions.sessionId}${AUTHORITATIVE_SQL_FALLBACK_SESSION_SUFFIX}` :
      null;

  return {
    ...resolvedQueryOptions,
    routingReadinessDimension:
      resolvedQueryOptions.routingReadinessDimension ||
      baseDiagnostics.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    preferLeader: AUTHORITATIVE_SQL_FALLBACK_PREFER_LEADER,
    ...(sessionId ? {sessionId} : {}),
  };
}

async function executeAuthoritativeSqlFallbackRead(
  service,
  _tableName,
  statement,
  params,
  options,
  baseDiagnostics,
  localQueryTransportReadiness = null,
) {
  if (typeof service.sqlQueryEngine?.executeQuery !== 'function') {
    return null;
  }

  const queryResult = await service.sqlQueryEngine.executeQuery(
    statement,
    params,
    buildOwnerRpcSqlFallbackQueryOptions(
      options?.queryOptions,
      baseDiagnostics,
    ),
  );

  return {
    ...(queryResult || {
      success: false,
      error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED,
      rows: [],
    }),
    rows: Array.isArray(queryResult?.rows) ? queryResult.rows : [],
    rowCount: Array.isArray(queryResult?.rows) ?
      queryResult.rows.length :
      0,
    source: AUTHORITATIVE_SQL_FALLBACK_SOURCE,
    usedSqlFallback: true,
    localReadHit: false,
    localReplicaFallbackHit: false,
    queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
    localQueryTransport: normalizeAuthoritativeReadLocalQueryTransport(
      localQueryTransportReadiness,
    ),
    systemTableDiagnostics: {
      ...baseDiagnostics,
      localReadHit: false,
      localReplicaFallbackHit: false,
      routedToNode: baseDiagnostics.leaderNodeId || null,
      deniedByReadiness: baseDiagnostics.deniedByReadiness === true,
    },
  };
}

function getLocalQueryTransportReadiness(service) {
  if (
    !service.messageRouter ||
    typeof service.messageRouter.getQueryDataPlaneTransportReadiness !==
      'function'
  ) {
    return null;
  }

  return normalizeLocalQueryTransportReadiness(
    service.messageRouter.getQueryDataPlaneTransportReadiness(),
  );
}

function maybeReseedBootstrapOverlay(service, tableName, queryResult) {
  const errorCode = queryResult?.errorCode || null;

  if (
    errorCode !== QUERY_ERROR_CODE.TABLE_NOT_FOUND &&
    errorCode !== QUERY_ERROR_CODE.PARTITION_NOT_FOUND
  ) {
    return {
      reseeded: false,
    };
  }

  if (
    !service.sqlQueryEngine ||
    typeof service.sqlQueryEngine.installRecoveryRoutingOverlayEntry !==
      'function'
  ) {
    return {
      reseeded: false,
    };
  }

  const partitionId = INITIAL_PARTITION_IDS[tableName] || null;
  if (!partitionId) {
    return {
      reseeded: false,
    };
  }

  const connectedNodes = service.messageRouter ?
    service.messageRouter.getConnectedNodes() :
    [];
  if (connectedNodes.length === 0) {
    return {
      reseeded: false,
    };
  }

  service.logger.info(CDC_LOG_MSG.OVERLAY_RESEED_ON_TABLE_NOT_FOUND, {
    nodeId: service.nodeId,
    tableName,
    partitionId,
    connectedNodeCount: connectedNodes.length,
    originalError: queryResult?.error || null,
  });

  const serviceRows = connectedNodes.map((nodeId) => ({
    partition_id: partitionId,
    service_type: SERVICE_TYPE.PARTITION,
    status: SERVICE_STATUS.ACTIVE,
    node_id: nodeId,
    address:
      `${nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}` +
      `${partitionId}`,
  }));

  const installed = service.sqlQueryEngine.installRecoveryRoutingOverlayEntry(
    partitionId,
    tableName,
    serviceRows,
  );

  return {
    reseeded: installed,
  };
}

function buildOwnerRpcReadResult({
  baseDiagnostics,
  localQueryTransportReadiness,
  queryResult,
}) {
  return {
    ...(queryResult || {
      success: false,
      error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED,
      rows: [],
    }),
    rows: Array.isArray(queryResult?.rows) ? queryResult.rows : [],
    rowCount: Array.isArray(queryResult?.rows) ?
      queryResult.rows.length :
      0,
    source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
    localReadHit: false,
    localReplicaFallbackHit: false,
    queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
    localQueryTransport: normalizeAuthoritativeReadLocalQueryTransport(
      localQueryTransportReadiness,
    ),
    systemTableDiagnostics: {
      ...baseDiagnostics,
      localReadHit: false,
      localReplicaFallbackHit: false,
      routedToNode:
        queryResult?.participantNodeId ||
        baseDiagnostics.leaderNodeId ||
        null,
      deniedByReadiness:
        baseDiagnostics.deniedByReadiness === true ||
        queryResult?.errorCode === QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
    },
  };
}

async function executeAuthoritativeOwnerRpcRead(
  service,
  tableName,
  statement,
  params,
  options,
  baseDiagnostics,
  localQueryTransportReadiness = null,
) {
  const queryExecutor = service.sqlQueryEngine?.queryExecutor || null;
  if (
    !queryExecutor ||
    typeof queryExecutor.executeOnPartition !== 'function'
  ) {
    return null;
  }

  const partitionId = INITIAL_PARTITION_IDS[tableName] || null;
  if (!partitionId) {
    return null;
  }

  // Structural authority: the gateway-built read-authority token wins over
  // the field-level legacy booleans, which survive only for callers that
  // bypass the gateway ingress.
  const readAuthority =
    options?.readAuthority && typeof options.readAuthority === 'object' ?
      options.readAuthority :
      null;
  const routingReadinessDimension =
    readAuthority?.routingReadinessDimension ||
    options?.queryOptions?.routingReadinessDimension ||
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;

  const deliverySource = resolveControlPlaneSystemTableDeliverySource({
    deliverySource: options?.queryOptions?.deliverySource || null,
    tableName,
    sql: statement,
  });

  const executionOptions = {
    ...(options.queryOptions && typeof options.queryOptions === 'object' ?
      options.queryOptions :
      {}),
    routingReadinessDimension,
    workClass:
      options?.queryOptions?.workClass || options?.workClass || undefined,
    deliveryPriority:
      options?.queryOptions?.deliveryPriority ||
      options?.deliveryPriority ||
      undefined,
    deliverySource,
    allowReadinessAuthoritativeRefresh:
      options?.queryOptions?.allowReadinessAuthoritativeRefresh !== false,
    ...(readAuthority ? {readAuthority} : {}),
  };

  // Default owner-RPC reads route to "an owner" replica (preferLeader=false),
  // which can be served by the caller's OWN local replica. A caller that must
  // escape a self-stale replica (the variant-D publications catch-up) sets
  // preferOwnerRpcReadLeader so the read is pinned to the partition leader,
  // which holds the authoritative epoch. The routing readiness dimension is
  // CONTROL_PLANE_RECOVERY_ELIGIBLE, so a recovery-pending leader still serves.
  const preferLeader =
    (readAuthority ?
      readAuthority.preferOwnerRpcReadLeader === true :
      options?.preferOwnerRpcReadLeader === true) ?
      true :
      AUTHORITATIVE_OWNER_RPC_READ_PREFER_LEADER;

  const queryResult = await queryExecutor.executeOnPartition(
    partitionId,
    statement,
    params,
    true,
    preferLeader,
    false,
    executionOptions,
  );

  if (!queryResult?.success) {
    const reseedResult = maybeReseedBootstrapOverlay(
      service,
      tableName,
      queryResult,
    );

    if (reseedResult.reseeded) {
      const retryResult = await queryExecutor.executeOnPartition(
        partitionId,
        statement,
        params,
        true,
        preferLeader,
        false,
        executionOptions,
      );

      service.logger.info(CDC_LOG_MSG.OVERLAY_RESEED_RETRY_RESULT, {
        nodeId: service.nodeId,
        tableName,
        retrySuccess: retryResult?.success ?? false,
      });

      return buildOwnerRpcReadResult({
        baseDiagnostics,
        localQueryTransportReadiness,
        queryResult: retryResult?.success ? retryResult : retryResult ||
          queryResult,
      });
    }
  }

  return buildOwnerRpcReadResult({
    baseDiagnostics,
    localQueryTransportReadiness,
    queryResult,
  });
}

export {
  buildOwnerRpcSqlFallbackQueryOptions,
  executeAuthoritativeOwnerRpcRead,
  executeAuthoritativeSqlFallbackRead,
  getLocalQueryTransportReadiness,
  maybeReseedBootstrapOverlay,
  normalizeAuthoritativeReadLocalQueryTransport,
  shouldRetryOwnerRpcReadViaSqlFallback,
};
