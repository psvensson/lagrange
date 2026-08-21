import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {
  executeLocalSystemTableRead,
  resolveLocalSystemTableServices,
  resolveSystemTablePartitionIds,
} from './cdc-integration-service-local-system-table-routing.js';
import {
  buildOwnerRpcSqlFallbackQueryOptions,
  executeAuthoritativeOwnerRpcRead,
  executeAuthoritativeSqlFallbackRead,
  getLocalQueryTransportReadiness,
  maybeReseedBootstrapOverlay,
  normalizeAuthoritativeReadLocalQueryTransport,
  shouldRetryOwnerRpcReadViaSqlFallback,
} from './cdc-integration-service-owner-rpc-read-execution.js';
import {
  resolveAuthoritativeReadModeContract,
} from '../control-plane/control-plane-system-table-gateway-read-contracts.js';
const {
  AUTHORITATIVE_READ_SOURCE,
  AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES,
  CDC_INTEGRATION_SERVICE_ERROR,
  CDC_INTEGRATION_SERVICE_LITERAL,
  CONTROL_PLANE_READINESS_DIMENSION,
  QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAME,
} = CDC_INTEGRATION_SERVICE_SHARED;

function resolveAuthoritativeRowVersion(service, row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  for (const fieldName of AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES) {
    const value = row[fieldName];
    if (value === undefined || value === null) {
      continue;
    }

    const comparable = service.normalizeComparableCacheFieldValue(value);
    if (comparable !== null) {
      return comparable;
    }

    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

function compareAuthoritativeRepairRows(service, candidate, existing) {
  const candidateVersion = resolveAuthoritativeRowVersion(service, candidate);
  const existingVersion = resolveAuthoritativeRowVersion(service, existing);

  if (candidateVersion !== null && existingVersion !== null) {
    if (candidateVersion === existingVersion) {
      return (
        JSON.stringify(candidate).length > JSON.stringify(existing).length
      );
    }
    return candidateVersion > existingVersion;
  }

  if (candidateVersion !== null) {
    return true;
  }

  if (existingVersion !== null) {
    return false;
  }

  return JSON.stringify(candidate).length > JSON.stringify(existing).length;
}

function mergeAuthoritativeSystemTableRowSets(service, tableName, rowSets) {
  const keyField = service.getPrimaryKeyField(tableName);
  const mergedRows = new Map();

  for (const rowSet of rowSets) {
    const rows = Array.isArray(rowSet) ? rowSet : [];
    for (const row of rows) {
      const key = row?.[keyField] ?? row?.id ?? null;
      if (key === null || key === undefined) {
        continue;
      }
      const existing = mergedRows.get(key);
      if (!existing || compareAuthoritativeRepairRows(service, row, existing)) {
        mergedRows.set(key, row);
      }
    }
  }

  return [...mergedRows.values()];
}

async function queryLocalAuthoritativeSystemTableRows(
  service,
  tableName,
  sql,
  params = [],
  options = {},
) {
  const localServices = resolveLocalSystemTableServices(service, tableName, {
    consistency: options.consistency,
  });

  if (localServices.length === 0) {
    return {
      available: false,
      rows: [],
    };
  }

  const rowSets = [];
  let available = false;

  for (const partitionService of localServices) {
    try {
      const result = await executeLocalSystemTableRead(
        service,
        partitionService,
        sql,
        params,
      );

      if (!result || result.success === false) {
        continue;
      }

      rowSets.push(Array.isArray(result.rows) ? result.rows : []);
      available = true;
    } catch (error) {
      service.logger.warn(
        CDC_INTEGRATION_SERVICE_LITERAL.FAILED_TO_READ_AUTHORITATIVE_SYSTEM_TABLE_ROWS_FROM_LOCAL +
          CDC_INTEGRATION_SERVICE_LITERAL.PARTITION_REPLICA,
        {
          nodeId: service.nodeId,
          tableName,
          partitionId: partitionService?.partitionId || null,
          replicaId: partitionService?.replicaId || null,
          error: error?.message || String(error),
        },
      );
    }
  }

  return {
    available,
    rows: available ?
      mergeAuthoritativeSystemTableRowSets(service, tableName, rowSets) :
      [],
  };
}

function buildSystemTableOperationDiagnostics(service, tableName, options = {}) {
  const queryOptions =
    options?.queryOptions && typeof options.queryOptions === 'object' ?
      options.queryOptions :
      {};

  const routingReadinessDimension =
    queryOptions.routingReadinessDimension ||
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;

  const partitionIds = resolveSystemTablePartitionIds(service, tableName);
  const partitionId = partitionIds[0] || null;

  // CL-012: these diagnostics are built on EVERY authoritative read, and a
  // partition routing snapshot evaluates full node readiness per service
  // row — the inclusive-time profile pinned this eager enrichment inside
  // the seed's 20-95s event-loop gaps. The routing-snapshot-derived fields
  // are informational only and every consumer already falls back to the
  // cache-derived values below, so the snapshot is no longer built here.
  const routingSnapshot = null;

  let partitionRow = null;
  let serviceRows = [];
  if (
    service.systemTableCache &&
    typeof service.systemTableCache.filter === 'function'
  ) {
    const partitionRows =
      service.systemTableCache.filter(SYSTEM_TABLE_NAME.PARTITIONS, (row) => {
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
        service.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (row) => {
          return (
            row?.partition_id === partitionId &&
            row?.service_type === SERVICE_TYPE.PARTITION
          );
        }) || [];
    }
  }

  const leaderNodeId =
    routingSnapshot?.canonicalLeaderNodeId ||
    partitionRow?.leader_node_id ||
    partitionRow?.leaderNodeId ||
    null;

  const serviceRowCount =
    Number.isFinite(routingSnapshot?.serviceRowCount) ?
      routingSnapshot.serviceRowCount :
      serviceRows.length;

  const routableServiceCount = Number.isFinite(
    routingSnapshot?.routableServiceCount,
  ) ?
    routingSnapshot.routableServiceCount :
    serviceRows.filter((row) => {
      return (
        row?.status === SERVICE_STATUS.ACTIVE &&
        typeof row?.address === 'string' &&
        row.address.length > 0
      );
    }).length;

  return Object.freeze({
    partitionId,
    leaderNodeId:
      typeof leaderNodeId === 'string' && leaderNodeId.length > 0 ?
        leaderNodeId :
        null,
    serviceRowCount,
    routableServiceCount,
    queryTimeoutMs:
      Number.isFinite(queryOptions.timeoutMs) &&
      queryOptions.timeoutMs > 0 ?
        Math.floor(queryOptions.timeoutMs) :
        null,
    routingReadinessDimension,
    deniedByReadiness:
      routingSnapshot &&
      typeof routingSnapshot.deniedByNodeId === 'object' ?
        Object.keys(routingSnapshot.deniedByNodeId).length > 0 :
        false,
  });
}

function normalizeLocalSystemTableWriteResult(result) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  if (
    typeof result.affectedRows === 'number' ||
    typeof result.changes !== 'number'
  ) {
    return result;
  }

  return {
    ...result,
    affectedRows: result.changes,
  };
}

function buildAuthoritativeReadDeliveryOptions(options, readAuthority) {
  return {
    readAuthority,
    cacheFallbackPredicate: options?.cacheFallbackPredicate,
    workClass: options?.workClass,
    deliveryPriority: options?.deliveryPriority,
  };
}

function attachAuthoritativeReadQueryOptions(deliveryOptions, options) {
  return {
    ...deliveryOptions,
    queryOptions:
      options?.queryOptions && typeof options.queryOptions === 'object' ?
        options.queryOptions :
        {},
  };
}

async function executeAuthoritativeSystemTableRead(
  service,
  tableName,
  sql,
  params = [],
  options = {},
) {
  const readAuthority = options?.readAuthority || null;
  if (!readAuthority || Object.isFrozen(readAuthority) !== true) {
    return {
      success: false,
      error: CDC_INTEGRATION_SERVICE_ERROR.READ_AUTHORITY_REQUIRED,
      rows: [],
    };
  }
  const authoritativeReadModeContract =
    resolveAuthoritativeReadModeContract(readAuthority);
  const canonicalOptions = attachAuthoritativeReadQueryOptions(
    buildAuthoritativeReadDeliveryOptions(options, readAuthority),
    options,
  );
  const statement = sql || `SELECT * FROM ${tableName}`;
  const requireOwnerRpcRead =
    authoritativeReadModeContract.requireOwnerRpcRead;
  const preferredConsistency =
    readAuthority.localReadConsistency;
  const preferOwnerRpcRead =
    authoritativeReadModeContract.preferOwnerRpcRead;
  const allowOwnerRpcFallback =
    authoritativeReadModeContract.allowOwnerRpcFallback;
  const baseDiagnostics = buildSystemTableOperationDiagnostics(
    service,
    tableName,
    canonicalOptions,
  );

  let localRead = {
    available: false,
    rows: [],
  };
  let localReplicaFallbackHit = false;

  const readLocalAuthoritativeRows = async () => {
    localRead = await queryLocalAuthoritativeSystemTableRows(
      service,
      tableName,
      statement,
      params,
      {
        consistency: preferredConsistency,
      },
    );

    if (
      !localRead.available &&
      readAuthority.replicaFallbackConsistency &&
      readAuthority.replicaFallbackConsistency !== preferredConsistency
    ) {
      localRead = await queryLocalAuthoritativeSystemTableRows(
        service,
        tableName,
        statement,
        params,
        {
          consistency: readAuthority.replicaFallbackConsistency,
        },
      );
      localReplicaFallbackHit = localRead.available;
    }
  };

  const buildLocalReadResult = () => ({
    success: true,
    rows: localRead.rows,
    count: localRead.rows.length,
    rowCount: localRead.rows.length,
    source: AUTHORITATIVE_READ_SOURCE.LOCAL_PARTITION_REPLICA,
    localReadHit: true,
    localReplicaFallbackHit,
    queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
    systemTableDiagnostics: {
      ...baseDiagnostics,
      localReadHit: true,
      localReplicaFallbackHit,
      routedToNode: null,
      deniedByReadiness: false,
    },
  });

  await readLocalAuthoritativeRows();

  const shouldConfirmEmptyLocalReadWithOwnerRpc =
    authoritativeReadModeContract.confirmEmptyLocalReadWithOwnerRpc === true &&
    allowOwnerRpcFallback &&
    localRead.available &&
    localRead.rows.length === 0 &&
    !preferOwnerRpcRead &&
    !requireOwnerRpcRead;

  if (
    localRead.available &&
    !preferOwnerRpcRead &&
    !requireOwnerRpcRead &&
    !shouldConfirmEmptyLocalReadWithOwnerRpc
  ) {
    return buildLocalReadResult();
  }

  const localQueryTransportReadiness = getLocalQueryTransportReadiness(service);

  if (
    localQueryTransportReadiness?.ready === false &&
    !allowOwnerRpcFallback
  ) {
    return {
      success: false,
      error:
        localQueryTransportReadiness.reason ||
        CDC_INTEGRATION_SERVICE_LITERAL.QUERY_DATA_PLANE_TRANSPORT_NOT_READY,
      errorCode: QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
      deferRetry: true,
      retryAfterMs: localQueryTransportReadiness.retryAfterMs,
      localQueryTransport: {
        state:
          localQueryTransportReadiness.state ||
          CDC_INTEGRATION_SERVICE_LITERAL.DEFERRED,
        ready: false,
        reason: localQueryTransportReadiness.reason || null,
        retryAfterMs: localQueryTransportReadiness.retryAfterMs,
      },
      rows: [],
      source: AUTHORITATIVE_READ_SOURCE.QUERY_TRANSPORT_PREFLIGHT,
      localReadHit: false,
      localReplicaFallbackHit: false,
      queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
      systemTableDiagnostics: {
        ...baseDiagnostics,
        localReadHit: false,
        localReplicaFallbackHit: false,
        routedToNode: null,
        deniedByReadiness: true,
      },
    };
  }

  if (
    localQueryTransportReadiness?.ready === false &&
    preferOwnerRpcRead &&
    localRead.available &&
    !requireOwnerRpcRead
  ) {
    return buildLocalReadResult();
  }

  if (!allowOwnerRpcFallback) {
    if (preferOwnerRpcRead && localRead.available && !requireOwnerRpcRead) {
      return buildLocalReadResult();
    }

    return {
      success: false,
      error:
        CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
      rows: [],
      localReadHit: false,
      localReplicaFallbackHit: false,
      queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
      systemTableDiagnostics: {
        ...baseDiagnostics,
        localReadHit: false,
        localReplicaFallbackHit: false,
        routedToNode: null,
      },
    };
  }

  const ownerRpcResult = await executeAuthoritativeOwnerRpcRead(
    service,
    tableName,
    statement,
    params,
    canonicalOptions,
    baseDiagnostics,
    localQueryTransportReadiness,
  );

  if (ownerRpcResult !== null) {
    if (
      ownerRpcResult.success !== true &&
      preferOwnerRpcRead &&
      localRead.available &&
      !requireOwnerRpcRead
    ) {
      return buildLocalReadResult();
    }

    if (
      shouldRetryOwnerRpcReadViaSqlFallback(
        ownerRpcResult,
        canonicalOptions,
        localQueryTransportReadiness,
      )
    ) {
      const sqlFallbackResult = await executeAuthoritativeSqlFallbackRead(
        service,
        tableName,
        statement,
        params,
        options,
        baseDiagnostics,
        localQueryTransportReadiness,
      );

      if (sqlFallbackResult !== null) {
        return sqlFallbackResult;
      }
    }

    return ownerRpcResult;
  }

  if (preferOwnerRpcRead && localRead.available && !requireOwnerRpcRead) {
    return buildLocalReadResult();
  }

  return {
    success: false,
    error:
      CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
    rows: [],
    localReadHit: false,
    localReplicaFallbackHit: false,
    queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
    systemTableDiagnostics: {
      ...baseDiagnostics,
      localReadHit: false,
      localReplicaFallbackHit: false,
      routedToNode: null,
    },
  };
}

export {
  buildOwnerRpcSqlFallbackQueryOptions,
  buildSystemTableOperationDiagnostics,
  executeAuthoritativeOwnerRpcRead,
  executeAuthoritativeSqlFallbackRead,
  executeAuthoritativeSystemTableRead,
  getLocalQueryTransportReadiness,
  maybeReseedBootstrapOverlay,
  mergeAuthoritativeSystemTableRowSets,
  normalizeAuthoritativeReadLocalQueryTransport,
  normalizeLocalSystemTableWriteResult,
  queryLocalAuthoritativeSystemTableRows,
  resolveAuthoritativeRowVersion,
  shouldRetryOwnerRpcReadViaSqlFallback,
};

export const extractAuthoritativeRowVersion = resolveAuthoritativeRowVersion;
export const isAuthoritativeRepairRowNewer = compareAuthoritativeRepairRows;
