import {
  COLUMN,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
} from '../cdc/cdc-integration-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from './pressure-governor.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  resolveAuthoritativeReadModeContract,
  resolveControlPlaneSystemTableDeliverySource,
  resolveReadProfileOptions,
} from './control-plane-system-table-gateway.js';
import {
  buildControlPlaneWorkloadProfile,
  resolveControlPlaneWorkloadClass,
} from './control-plane-workload-profile.js';
import {
  isDeferredTransportSemanticOutcome,
  classifyTransportSemanticOutcome,
} from '../transport/transport-semantic-outcome.js';

const LOCAL_STR_SQL_QUERY_ENGINE = 'sql_query_engine';
const LOCAL_STR_READY = 'ready';
const LOCAL_STR_CONTROL_PLANE_BACKPRESSURE = 'control_plane_backpressure';
const LOCAL_STR_CDCINTEGRATIONSERVICE = 'cdcIntegrationService';
const LOCAL_STR_MESSAGEROUTER = 'messageRouter';
const LOCAL_STR_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE = 'authoritative_row_source_unavailable';
const LOCAL_STR_AUTHORITATIVE_QUERY_FAILED = 'authoritative_query_failed';

const AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE = Object.freeze({
  LOCAL_PARTITION_REPLICA: 'local_partition_replica',
  OWNER_RPC_LANE: 'owner_rpc_lane',
  SQL_QUERY_ENGINE: 'sql_query_engine',
  LOCAL_CDC_CACHE: 'local_cdc_cache',
  MIXED: 'mixed',
  UNAVAILABLE: 'unavailable',
});

const AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY = 'local_leader';
const AUTHORITATIVE_CONTROL_PLANE_DEFAULT_QUERY_TIMEOUT_MS = 1500;

function normalizeReadSource(source) {
  const normalized = String(source || '');
  if (normalized ===
      AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_PARTITION_REPLICA) {
    return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_PARTITION_REPLICA;
  }
  if (normalized === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.OWNER_RPC_LANE) {
    return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.OWNER_RPC_LANE;
  }
  if (normalized === LOCAL_STR_SQL_QUERY_ENGINE) {
    return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.SQL_QUERY_ENGINE;
  }
  if (normalized === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_CDC_CACHE) {
    return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_CDC_CACHE;
  }
  return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE;
}

function normalizePositiveInteger(value, fallback) {
  return Number.isFinite(value) && value > 0 ?
    Math.floor(value) :
    fallback;
}

function applyAuthoritativeViewDefaultReadMode(options = {}) {
  const hasExplicitReadModeContract =
    typeof options?.readProfile === 'string' ||
    typeof options?.profile === 'string' ||
    typeof options?.authoritativeReadMode === 'string' ||
    typeof options?.ownerReadMode === 'string' ||
    typeof options?.preferOwnerRpcRead !== 'undefined' ||
    typeof options?.requireOwnerRpcRead !== 'undefined' ||
    typeof options?.allowSqlFallback !== 'undefined' ||
    typeof options?.confirmEmptyLocalReadWithOwnerRpc !== 'undefined';
  if (hasExplicitReadModeContract) {
    return options;
  }
  return {
    ...options,
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_RPC_PREFERRED_SQL_FALLBACK,
  };
}

function isReadyLocalQueryTransport(localQueryTransport = null) {
  if (!localQueryTransport || typeof localQueryTransport !== 'object') {
    return false;
  }
  if (localQueryTransport.ready === true) {
    return true;
  }
  return String(localQueryTransport.state || '').toLowerCase() === LOCAL_STR_READY;
}

function shouldRetryAuthoritativeReadWithoutOwnerRpc(
  result,
  options = {},
) {
  const authoritativeReadModeContract =
    resolveAuthoritativeReadModeContract(options);
  if (result?.success === true) {
    return false;
  }
  if (authoritativeReadModeContract.requireOwnerRpcRead === true ||
      authoritativeReadModeContract.allowSqlFallback === false) {
    return false;
  }
  if (normalizeReadSource(result?.source) !==
      AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.OWNER_RPC_LANE) {
    return false;
  }
  if (!isReadyLocalQueryTransport(result?.localQueryTransport)) {
    return false;
  }
  const transportOutcome = classifyTransportSemanticOutcome(result);
  const errorText = String(result?.error || '').toLowerCase();
  const causeChain = Array.isArray(result?.causeChain) ?
    result.causeChain.map((cause) => String(cause || '').toLowerCase()) :
    [];
  return isDeferredTransportSemanticOutcome(transportOutcome) ||
    causeChain.includes(LOCAL_STR_CONTROL_PLANE_BACKPRESSURE) ||
    errorText.includes(LOCAL_STR_CONTROL_PLANE_BACKPRESSURE);
}

function freezeRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze([]);
  }
  return Object.freeze(rows.map((row) => {
    return row && typeof row === 'object' ?
      Object.freeze({...row}) :
      row;
  }));
}

function resolveAuthoritativeReadWorkloadProfile(
  tableName,
  resolvedOptions = {},
  additionalResourceKeys = [],
) {
  return buildControlPlaneWorkloadProfile(
    resolveControlPlaneWorkloadClass(tableName, {
      workloadClass: resolvedOptions.controlPlaneWorkloadClass,
      adminDiagnostic: resolvedOptions.adminDiagnostic === true,
    }),
    {
      workClass: resolvedOptions?.workClass || null,
      allowPressureDegrade: resolvedOptions?.allowPressureDegrade,
      allowPressureDefer: resolvedOptions?.allowPressureDefer,
      retryAfterMs: resolvedOptions?.pressureRetryAfterMs,
      additionalResourceKeys,
    },
  );
}

function buildAuthoritativeReadKey(tableName, sql, params, options, queryTimeoutMs) {
  const resolvedOptions = resolveReadProfileOptions(options || {});
  const authoritativeReadModeContract =
    resolveAuthoritativeReadModeContract(resolvedOptions);
  const queryOptions =
    resolvedOptions?.queryOptions &&
      typeof resolvedOptions.queryOptions === 'object' ?
      resolvedOptions.queryOptions :
      {};
  const workloadProfile = resolveAuthoritativeReadWorkloadProfile(
    tableName,
    resolvedOptions,
  );
  return JSON.stringify({
    tableName: tableName || null,
    sql: sql || null,
    params: Array.isArray(params) ? params : [],
    workloadClass: workloadProfile.workloadClass,
    workClass:
      queryOptions.workClass ||
      workloadProfile.workClass ||
      PRESSURE_WORK_CLASS.INTERACTIVE,
    allowPressureDegrade:
      workloadProfile.allowPressureDegrade !== false,
    allowPressureDefer:
      workloadProfile.allowPressureDefer === true,
    authoritativeReadMode:
      authoritativeReadModeContract.authoritativeReadMode,
    preferOwnerRpcReadLeader:
      resolvedOptions?.preferOwnerRpcReadLeader === true,
    localReadConsistency:
      resolvedOptions?.localReadConsistency ||
      AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
    replicaFallbackConsistency:
      resolvedOptions?.replicaFallbackConsistency || null,
    routingReadinessDimension:
      queryOptions.routingReadinessDimension ||
      resolvedOptions?.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    timeoutMs: queryTimeoutMs,
  });
}

function extractRowVersion(row) {
  const candidates = [
    row?.[COLUMN.LAST_HEARTBEAT],
    row?.last_heartbeat,
    row?.updated_at,
    row?.updatedAt,
    row?.created_at,
    row?.createdAt,
  ];
  let maxVersion = null;
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    maxVersion = maxVersion === null ?
      numeric :
      Math.max(maxVersion, numeric);
  }
  return maxVersion;
}

function resolveSnapshotVersion(rows) {
  let snapshotVersion = null;
  for (const row of Array.isArray(rows) ? rows : []) {
    const rowVersion = extractRowVersion(row);
    if (!Number.isFinite(rowVersion)) {
      continue;
    }
    snapshotVersion = snapshotVersion === null ?
      rowVersion :
      Math.max(snapshotVersion, rowVersion);
  }
  return snapshotVersion;
}

function resolveCompositeSource(reads) {
  const sources = [...new Set(
    (Array.isArray(reads) ? reads : [])
      .map((entry) => entry?.source)
      .filter((source) => {
        return source &&
          source !== AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE;
      }),
  )];
  if (sources.length === 0) {
    return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE;
  }
  if (sources.length === 1) {
    return sources[0];
  }
  return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.MIXED;
}

function readNodeSnapshotServicePartitionId(serviceRow = null) {
  const partitionId =
    serviceRow?.[COLUMN.PARTITION_ID] ??
    serviceRow?.partition_id ??
    serviceRow?.partitionId ??
    null;
  return typeof partitionId === 'string' && partitionId.length > 0 ?
    partitionId :
    null;
}

function collectNodeSnapshotPartitionIds(serviceRows = []) {
  return [...new Set(
    (Array.isArray(serviceRows) ? serviceRows : [])
      .filter((serviceRow) => {
        return String(
          serviceRow?.[COLUMN.SERVICE_TYPE] ??
          serviceRow?.service_type ??
          serviceRow?.serviceType ??
          '',
        ).toLowerCase() === String(SERVICE_TYPE.PARTITION).toLowerCase();
      })
      .map((serviceRow) => readNodeSnapshotServicePartitionId(serviceRow))
      .filter((partitionId) => partitionId !== null),
  )];
}

function buildNodeSnapshotPartitionReadQuery(partitionIds = []) {
  const normalizedPartitionIds = [...new Set(
    (Array.isArray(partitionIds) ? partitionIds : [])
      .map((partitionId) => String(partitionId || '').trim())
      .filter((partitionId) => partitionId.length > 0),
  )];
  if (normalizedPartitionIds.length === 0) {
    return null;
  }
  const placeholders = normalizedPartitionIds.map(() => '?').join(', ');
  return Object.freeze({
    sql:
      `SELECT * FROM ${TABLES.PARTITIONS} ` +
      `WHERE ${COLUMN.PARTITION_ID} IN (${placeholders})`,
    params: normalizedPartitionIds,
  });
}

class AuthoritativeControlPlaneView {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.messageRouter = options.messageRouter || null;
    this.pressureGovernor = options.pressureGovernor || null;
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this.queryTimeoutMs = normalizePositiveInteger(
      options.queryTimeoutMs,
      AUTHORITATIVE_CONTROL_PLANE_DEFAULT_QUERY_TIMEOUT_MS,
    );
    this.inFlightReadsByKey = new Map();
  }

  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    if (Object.hasOwn(options, LOCAL_STR_CDCINTEGRATIONSERVICE)) {
      this.cdcIntegrationService = options.cdcIntegrationService || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_MESSAGEROUTER)) {
      this.messageRouter = options.messageRouter || null;
    }
  }

  /**
   * Return true when authoritative reads are available.
   * @return {boolean}
   */
  canRead() {
    return Boolean(
      this.cdcIntegrationService &&
      typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead ===
        'function',
    );
  }

  /**
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (this.pressureGovernor) {
      this.pressureGovernor.configure({
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
      });
      return this.pressureGovernor;
    }
    this.pressureGovernor = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    });
    return this.pressureGovernor;
  }

  /**
   * Execute one authoritative control-plane table read.
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
  * @param {Object} [options]
  * @return {Promise<Object>}
  */
  async readRows(tableName, sql, params = [], options = {}) {
    const resolvedOptions = resolveReadProfileOptions(
      applyAuthoritativeViewDefaultReadMode(options || {}),
    );
    const queryTimeoutMs = normalizePositiveInteger(
      resolvedOptions.queryTimeoutMs,
      this.queryTimeoutMs,
    );
    const readKey = buildAuthoritativeReadKey(
      tableName,
      sql,
      params,
      resolvedOptions,
      queryTimeoutMs,
    );
    if (this.inFlightReadsByKey.has(readKey)) {
      return this.inFlightReadsByKey.get(readKey);
    }

    let inFlightRead = null;
    inFlightRead = (async () => {
      const observedAtMs = this.now();
      const observedAt = new Date(observedAtMs).toISOString();
      const workloadProfile = resolveAuthoritativeReadWorkloadProfile(
        tableName,
        resolvedOptions,
        [
          'control-plane:read',
          `control-plane:table:${tableName || 'unknown'}`,
        ],
      );
      const pressureDecision = this.getPressureGovernor().evaluate({
        workClass:
          workloadProfile.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
        resourceKeys: workloadProfile.resourceKeys,
        allowDegrade: workloadProfile.allowPressureDegrade !== false,
        allowDefer: workloadProfile.allowPressureDefer === true,
        retryAfterMs: workloadProfile.retryAfterMs,
      });
      const queryOptions = {
        ...(resolvedOptions.queryOptions &&
          typeof resolvedOptions.queryOptions === 'object' ?
          resolvedOptions.queryOptions :
          {}),
        timeoutMs: queryTimeoutMs,
        sessionId:
          typeof resolvedOptions?.queryOptions?.sessionId === 'string' &&
            resolvedOptions.queryOptions.sessionId.length > 0 ?
            resolvedOptions.queryOptions.sessionId :
            `authoritative-control-plane-read:${this.nodeId || 'unknown'}:` +
              `${tableName}:${observedAtMs}`,
        routingReadinessDimension:
          resolvedOptions?.queryOptions?.routingReadinessDimension ||
          resolvedOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE,
        workloadClass: workloadProfile.workloadClass,
        workClass:
          resolvedOptions?.queryOptions?.workClass ||
          workloadProfile.workClass ||
          PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority:
          resolvedOptions?.queryOptions?.deliveryPriority ||
          resolvedOptions?.deliveryPriority ||
          null,
        // Authoritative repair reads must not recurse back into readiness
        // refresh through routed owner-RPC fallback.
        allowReadinessAuthoritativeRefresh: false,
      };
      const deliverySource = resolveControlPlaneSystemTableDeliverySource({
        deliverySource: queryOptions.deliverySource || null,
        tableName,
        sql,
      });
      if (typeof deliverySource === 'string' && deliverySource.length > 0) {
        queryOptions.deliverySource = deliverySource;
      }
      if (!this.canRead()) {
        return Object.freeze({
          success: false,
          tableName,
          rows: Object.freeze([]),
          rowCount: 0,
          source: AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE,
          usedSqlFallback: false,
          snapshotVersion: null,
          observedAt,
          observedAtMs,
          error: LOCAL_STR_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
        });
      }

      if (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
          pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT) {
        const failure = buildPressureAdmissionFailure(pressureDecision, {
          tableName,
        });
        return Object.freeze({
          ...failure,
          rows: freezeRows(failure.rows),
          rowCount: 0,
          source: AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE,
          usedSqlFallback: false,
          snapshotVersion: null,
          observedAt,
          observedAtMs,
        });
      }

      const authoritativeReadModeContract =
        resolveAuthoritativeReadModeContract(resolvedOptions);
      let result =
        await this.cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          {
            localReadConsistency:
              AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
            replicaFallbackConsistency:
              resolvedOptions?.replicaFallbackConsistency,
            authoritativeReadMode:
              authoritativeReadModeContract.authoritativeReadMode,
            allowOwnerRpcFallback:
              authoritativeReadModeContract.allowOwnerRpcFallback &&
              pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE,
            preferOwnerRpcRead:
              authoritativeReadModeContract.preferOwnerRpcRead,
            preferOwnerRpcReadLeader:
              resolvedOptions?.preferOwnerRpcReadLeader === true,
            requireOwnerRpcRead:
              authoritativeReadModeContract.requireOwnerRpcRead,
            confirmEmptyLocalReadWithOwnerRpc:
              authoritativeReadModeContract.confirmEmptyLocalReadWithOwnerRpc,
            allowSqlFallback:
              authoritativeReadModeContract.allowSqlFallback &&
              pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE,
            cacheFallbackPredicate: resolvedOptions?.cacheFallbackPredicate,
            queryOptions,
          },
        );
      if (shouldRetryAuthoritativeReadWithoutOwnerRpc(
        result,
        resolvedOptions,
      )) {
        result =
          await this.cdcIntegrationService.executeAuthoritativeSystemTableRead(
            tableName,
            sql,
            params,
            {
              localReadConsistency:
                AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
              replicaFallbackConsistency:
                options?.replicaFallbackConsistency,
              authoritativeReadMode:
                CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
              allowOwnerRpcFallback: false,
              preferOwnerRpcRead: false,
              requireOwnerRpcRead: false,
              confirmEmptyLocalReadWithOwnerRpc: false,
              allowSqlFallback:
                authoritativeReadModeContract.allowSqlFallback,
              cacheFallbackPredicate: resolvedOptions?.cacheFallbackPredicate,
              queryOptions: {
                ...queryOptions,
                sessionId: `${queryOptions.sessionId}:owner-rpc-recovery`,
              },
            },
          );
      }
      if (result?.success !== true &&
          pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE) {
        const failure = buildPressureAdmissionFailure(pressureDecision, {
          tableName,
          error: result?.error || undefined,
        });
        return Object.freeze({
          ...failure,
          rows: freezeRows(failure.rows),
          rowCount: 0,
          source: AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE,
          usedSqlFallback: false,
          snapshotVersion: null,
          observedAt,
          observedAtMs,
        });
      }
      const rows = freezeRows(result?.rows);
      const source = normalizeReadSource(result?.source);

      return Object.freeze({
        success: result?.success === true,
        tableName,
        rows,
        rowCount: rows.length,
        source,
        localReadHit: result?.localReadHit === true,
        localReplicaFallbackHit: result?.localReplicaFallbackHit === true,
        usedSqlFallback:
          result?.usedSqlFallback === true ||
          source === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.SQL_QUERY_ENGINE,
        queryTimeoutMs:
          Number.isFinite(result?.queryTimeoutMs) ?
            result.queryTimeoutMs :
            queryTimeoutMs,
        systemTableDiagnostics:
          result?.systemTableDiagnostics &&
            typeof result.systemTableDiagnostics === 'object' ?
            Object.freeze({...result.systemTableDiagnostics}) :
            null,
        snapshotVersion: resolveSnapshotVersion(rows),
        observedAt,
        observedAtMs,
        error: result?.success === true ?
          null :
          (result?.error || LOCAL_STR_AUTHORITATIVE_QUERY_FAILED),
      });
    })().finally(() => {
      if (this.inFlightReadsByKey.get(readKey) === inFlightRead) {
        this.inFlightReadsByKey.delete(readKey);
      }
    });

    this.inFlightReadsByKey.set(readKey, inFlightRead);
    return inFlightRead;
  }

  /**
   * Read node, service, and partition evidence for one node through the
   * canonical authoritative owner path.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async readNodeSnapshot(nodeId, options = {}) {
    const normalizedNodeId = String(nodeId || '');
    const matchesNodeId = (row) =>
      row?.[COLUMN.NODE_ID] === normalizedNodeId ||
      row?.node_id === normalizedNodeId;
    const baseReadOptions = {
      ...options,
      replicaFallbackConsistency:
        options?.replicaFallbackConsistency ||
        LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
    };
    // Node-scoped reads are eventually-consistent readiness snapshots; opt them
    // into the central local-CDC-cache fallback (gated/default-off) so a joiner
    // with no local replica reads from the existing cache instead of routing to
    // the overloaded owner. The predicate mirrors the SQL WHERE node_id = ?.
    const nodeScopedReadOptions = {
      ...baseReadOptions,
      cacheFallbackPredicate: matchesNodeId,
    };
    const [nodeRead, serviceRead] = await Promise.all([
      this.readRows(
        TABLES.NODES,
        `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`,
        [normalizedNodeId],
        nodeScopedReadOptions,
      ),
      this.readRows(
        TABLES.SERVICES,
        `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.NODE_ID} = ?`,
        [normalizedNodeId],
        nodeScopedReadOptions,
      ),
    ]);
    const nodeRows = nodeRead.rows;
    const serviceRows = serviceRead.rows;
    const snapshotPartitionIds = collectNodeSnapshotPartitionIds(serviceRows);
    const partitionReadQuery = buildNodeSnapshotPartitionReadQuery(
      snapshotPartitionIds,
    );
    const snapshotPartitionIdSet = new Set(snapshotPartitionIds);
    const partitionRead = partitionReadQuery ?
      await this.readRows(
        TABLES.PARTITIONS,
        partitionReadQuery.sql,
        partitionReadQuery.params,
        {
          ...baseReadOptions,
          cacheFallbackPredicate: (row) => snapshotPartitionIdSet.has(
            row?.[COLUMN.PARTITION_ID] ?? row?.partition_id,
          ),
        },
      ) :
      Object.freeze({
        success: true,
        rows: freezeRows([]),
        source: resolveCompositeSource([nodeRead, serviceRead]),
        observedAtMs:
          Number.isFinite(serviceRead?.observedAtMs) ?
            serviceRead.observedAtMs :
            nodeRead?.observedAtMs,
      });
    const partitionRows = partitionRead.rows;
    const nodeRow = nodeRows.find((row) => {
      return row?.[COLUMN.NODE_ID] === normalizedNodeId ||
        row?.node_id === normalizedNodeId;
    }) || nodeRows[0] || null;
    const lastHeartbeat = Number(
      nodeRow?.[COLUMN.LAST_HEARTBEAT] ??
        nodeRow?.last_heartbeat,
    );
    const snapshotObservedAtMs =
      Number.isFinite(nodeRead?.observedAtMs) ?
        nodeRead.observedAtMs :
        (
          Number.isFinite(serviceRead?.observedAtMs) ?
            serviceRead.observedAtMs :
            (
              Number.isFinite(partitionRead?.observedAtMs) ?
                partitionRead.observedAtMs :
                this.now()
            )
        );

    return Object.freeze({
      nodeId: normalizedNodeId,
      nodeRow,
      nodeRows,
      serviceRows,
      partitionRows,
      source: resolveCompositeSource([nodeRead, serviceRead, partitionRead]),
      snapshotVersion:
        resolveSnapshotVersion(nodeRows) ??
        resolveSnapshotVersion(serviceRows) ??
        resolveSnapshotVersion(partitionRows),
      freshness: Object.freeze({
        lastHeartbeat:
          Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
        heartbeatAgeMs:
          Number.isFinite(lastHeartbeat) ?
            Math.max(0, snapshotObservedAtMs - lastHeartbeat) :
            null,
      }),
      tables: Object.freeze({
        nodes: nodeRead,
        services: serviceRead,
        partitions: partitionRead,
      }),
    });
  }
}

export {
  AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE,
  AuthoritativeControlPlaneView,
};
