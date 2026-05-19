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

const {
  AUTHORITATIVE_READ_SOURCE,
  AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES,
  CDC_INTEGRATION_SERVICE_LITERAL,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  CONTROL_PLANE_READINESS_DIMENSION,
  NUM,
  QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TYPEOF,
  SYSTEM_TABLE_NAME,
} = CDC_INTEGRATION_SERVICE_SHARED;

function resolveAuthoritativeRowVersion(service, row) {
  if (!row || typeof row !== TYPEOF.OBJECT) {
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

    if (typeof value === TYPEOF.STRING && value.length > NUM.ZERO) {
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

  if (localServices.length === NUM.ZERO) {
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
    options?.queryOptions && typeof options.queryOptions === TYPEOF.OBJECT ?
      options.queryOptions :
      {};

  const routingReadinessDimension =
    queryOptions.routingReadinessDimension ||
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;

  const partitionIds = resolveSystemTablePartitionIds(service, tableName);
  const partitionId = partitionIds[NUM.ZERO] || null;

  let routingSnapshot = null;
  if (
    partitionId &&
    service.sqlQueryEngine?.queryExecutor &&
    typeof service.sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot ===
      TYPEOF.FUNCTION
  ) {
    try {
      routingSnapshot =
        service.sqlQueryEngine.queryExecutor.getPartitionRoutingSnapshot(
          partitionId,
          routingReadinessDimension,
        );
    } catch (_error) {
      routingSnapshot = null;
    }
  }

  let partitionRow = null;
  let serviceRows = [];
  if (
    service.systemTableCache &&
    typeof service.systemTableCache.filter === TYPEOF.FUNCTION
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

    partitionRow = partitionRows[NUM.ZERO] || null;

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
        typeof row?.address === TYPEOF.STRING &&
        row.address.length > NUM.ZERO
      );
    }).length;

  return Object.freeze({
    partitionId,
    leaderNodeId:
      typeof leaderNodeId === TYPEOF.STRING && leaderNodeId.length > NUM.ZERO ?
        leaderNodeId :
        null,
    serviceRowCount,
    routableServiceCount,
    queryTimeoutMs:
      Number.isFinite(queryOptions.timeoutMs) &&
      queryOptions.timeoutMs > NUM.ZERO ?
        Math.floor(queryOptions.timeoutMs) :
        null,
    routingReadinessDimension,
    deniedByReadiness:
      routingSnapshot &&
      typeof routingSnapshot.deniedByNodeId === TYPEOF.OBJECT ?
        Object.keys(routingSnapshot.deniedByNodeId).length > NUM.ZERO :
        false,
  });
}

function normalizeLocalSystemTableWriteResult(result) {
  if (!result || typeof result !== TYPEOF.OBJECT) {
    return result;
  }

  if (
    typeof result.affectedRows === TYPEOF.NUMBER ||
    typeof result.changes !== TYPEOF.NUMBER
  ) {
    return result;
  }

  return {
    ...result,
    affectedRows: result.changes,
  };
}

async function executeAuthoritativeSystemTableRead(
  service,
  tableName,
  sql,
  params = [],
  options = {},
) {
  const statement = sql || `SELECT * FROM ${tableName}`;
  const requireOwnerRpcRead = options.requireOwnerRpcRead === true;
  const preferredConsistency =
    options.localReadConsistency ||
    LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA;
  const preferOwnerRpcRead =
    options.preferOwnerRpcRead === true || requireOwnerRpcRead;
  const allowOwnerRpcFallback = options.allowOwnerRpcFallback !== false;
  const baseDiagnostics = buildSystemTableOperationDiagnostics(
    service,
    tableName,
    options,
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
      options.replicaFallbackConsistency &&
      options.replicaFallbackConsistency !== preferredConsistency
    ) {
      localRead = await queryLocalAuthoritativeSystemTableRows(
        service,
        tableName,
        statement,
        params,
        {
          consistency: options.replicaFallbackConsistency,
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
    options.confirmEmptyLocalReadWithOwnerRpc === true &&
    allowOwnerRpcFallback &&
    localRead.available &&
    localRead.rows.length === NUM.ZERO &&
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
    options,
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
        options,
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
