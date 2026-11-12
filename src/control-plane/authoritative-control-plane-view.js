import {
  COLUMN,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {
  CONTROL_PLANE_READ_PURPOSE,
} from './control-plane-readiness-constants.js';
import {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from './pressure-governor.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  resolveControlPlaneSystemTableDeliverySource,
} from './control-plane-system-table-gateway.js';
import {
  assertControlPlaneOwnerReadAuthority,
  buildControlPlaneReadAuthority,
  isCompleteAuthoritativeReadResult,
} from './control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR} from
  './control-plane-cache-reconcile-constants.js';
import {
  buildControlPlaneWorkloadProfile,
  resolveControlPlaneWorkloadClass,
} from './control-plane-workload-profile.js';

const LOCAL_STR_CDCINTEGRATIONSERVICE = 'cdcIntegrationService';
const LOCAL_STR_MESSAGEROUTER = 'messageRouter';
const LOCAL_STR_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE = 'authoritative_row_source_unavailable';

const AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE = Object.freeze({
  LOCAL_PARTITION_REPLICA: 'local_partition_replica',
  OWNER_RPC_LANE: 'owner_rpc_lane',
  MIXED: 'mixed',
  UNAVAILABLE: 'unavailable',
});

const AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY = 'local_leader';
const AUTHORITATIVE_CONTROL_PLANE_DEFAULT_QUERY_TIMEOUT_MS = 1500; // ends-on: the authoritative control-plane query answers

function normalizeReadSource(source) {
  const normalized = String(source || '');
  if (normalized ===
      AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_PARTITION_REPLICA) {
    return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_PARTITION_REPLICA;
  }
  if (normalized === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.OWNER_RPC_LANE) {
    return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.OWNER_RPC_LANE;
  }
  return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE;
}

function normalizePositiveInteger(value, fallback) {
  return Number.isFinite(value) && value > 0 ?
    Math.floor(value) :
    fallback;
}

function applyAuthoritativeViewDefaultReadMode(options = {}) {
  const readAuthority = options?.readAuthority === undefined ?
    buildControlPlaneReadAuthority({
      localReadConsistency: AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    }) : assertControlPlaneOwnerReadAuthority(options.readAuthority);
  return {
    ...options,
    readAuthority,
  };
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

function freezeWitness(witness) {
  return witness && typeof witness === 'object' && !Array.isArray(witness) ?
    Object.freeze({...witness}) :
    null;
}

function freezeWitnesses(result) {
  if (Array.isArray(result?.readAuthorityWitnesses)) {
    return Object.freeze(
      result.readAuthorityWitnesses
        .map((witness) => freezeWitness(witness))
        .filter((witness) => witness !== null),
    );
  }
  const singleWitness = freezeWitness(result?.readAuthorityWitness);
  return singleWitness ?
    Object.freeze([singleWitness]) :
    Object.freeze([]);
}

function buildUnavailableReadObservation(tableName, observedAtMs, failure) {
  return Object.freeze({
    ...failure,
    success: false,
    tableName,
    rows: Object.freeze([]),
    count: 0,
    rowCount: 0,
    rowSetComplete: false,
    readAuthorityWitness: null,
    readAuthorityWitnesses: Object.freeze([]),
    authoritativeObservation: null,
    source: AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE,
    snapshotVersion: null,
    observedAt: new Date(observedAtMs).toISOString(),
    observedAtMs,
  });
}

function freezeReadObservation(value) {
  return value && typeof value === 'object' ? Object.freeze({...value}) : null;
}

function buildAnsweredReadEvidence(result) {
  const rows = freezeRows(result.rows);
  const witnesses = freezeWitnesses(result);
  return {
    success: true,
    rows,
    count: rows.length,
    rowCount: rows.length,
    rowSetComplete: isCompleteAuthoritativeReadResult(result),
    readAuthorityWitness: witnesses[0] || freezeWitness(result.readAuthorityWitness),
    readAuthorityWitnesses: witnesses,
    authoritativeObservation: freezeReadObservation(result.authoritativeObservation),
    source: normalizeReadSource(result.source),
    localReadHit: result.localReadHit === true,
    snapshotVersion: resolveSnapshotVersion(rows),
    error: null,
  };
}

function buildOwnerReadObservation(tableName, result, queryTimeoutMs, observedAtMs) {
  const evidence = result?.success === true && Array.isArray(result.rows) ?
    buildAnsweredReadEvidence(result) :
    buildUnavailableReadObservation(tableName, observedAtMs, {
      ...result,
      error: result?.error || LOCAL_STR_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
      localReadHit: false,
    });
  return Object.freeze({
    ...evidence,
    tableName,
    queryTimeoutMs: Number.isFinite(result?.queryTimeoutMs) ? result.queryTimeoutMs : queryTimeoutMs,
    systemTableDiagnostics: freezeReadObservation(result?.systemTableDiagnostics),
    observedAt: new Date(observedAtMs).toISOString(),
    observedAtMs,
  });
}

function declaredQueryOptions(options) {
  return options.queryOptions && typeof options.queryOptions === 'object' ? options.queryOptions : {};
}

function readSessionId(nodeId, tableName, queryOptions, observedAtMs) {
  return typeof queryOptions.sessionId === 'string' && queryOptions.sessionId.length > 0 ?
    queryOptions.sessionId :
    `authoritative-control-plane-read:${nodeId || 'unknown'}:${tableName}:${observedAtMs}`;
}

function buildViewQueryOptions(nodeId, tableName, sql, options, workloadProfile,
  queryTimeoutMs, observedAtMs) {
  const declared = declaredQueryOptions(options);
  const queryOptions = {
    ...declared,
    timeoutMs: queryTimeoutMs,
    sessionId: readSessionId(nodeId, tableName, declared, observedAtMs),
    routingReadinessDimension: options.readAuthority.routingReadinessDimension,
    workloadClass: workloadProfile.workloadClass,
    workClass: declared.workClass || workloadProfile.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
    deliveryPriority: declared.deliveryPriority || options.deliveryPriority || null,
    // Repair cannot recursively refresh readiness through its own RPC owner.
    allowReadinessAuthoritativeRefresh: false,
    readAuthority: options.readAuthority,
  };
  const deliverySource = resolveControlPlaneSystemTableDeliverySource({
    deliverySource: queryOptions.deliverySource || null, tableName, sql,
  });
  if (typeof deliverySource === 'string' && deliverySource.length > 0) {
    queryOptions.deliverySource = deliverySource;
  }
  return queryOptions;
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
      additionalResourceKeys,
    },
  );
}

function buildAuthoritativeReadKey(tableName, sql, params, options, queryTimeoutMs) {
  const resolvedOptions = options || {};
  const queryOptions =
    resolvedOptions?.queryOptions &&
      typeof resolvedOptions.queryOptions === 'object' ?
      resolvedOptions.queryOptions :
      {};
  const workloadProfile = resolveAuthoritativeReadWorkloadProfile(
    tableName,
    resolvedOptions,
  );
  const readAuthority = resolvedOptions.readAuthority;
  return JSON.stringify({
    tableName: tableName || null,
    sql: sql || null,
    params: Array.isArray(params) ? params : [],
    workloadClass: workloadProfile.workloadClass,
    workClass:
      queryOptions.workClass ||
      workloadProfile.workClass ||
      PRESSURE_WORK_CLASS.INTERACTIVE,
    readAuthority,
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

function nodeSnapshotObservedAtMs(reads, now) {
  for (const read of reads) {
    if (Number.isFinite(read?.observedAtMs)) return read.observedAtMs;
  }
  return now();
}

function nodeSnapshotRow(rows, nodeId) {
  return rows.find((row) => row?.[COLUMN.NODE_ID] === nodeId || row?.node_id === nodeId) ||
    rows[0] || null;
}

function nodeSnapshotFreshness(nodeRow, observedAtMs) {
  const lastHeartbeat = Number(nodeRow?.[COLUMN.LAST_HEARTBEAT] ?? nodeRow?.last_heartbeat);
  return Object.freeze({
    lastHeartbeat: Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
    heartbeatAgeMs: Number.isFinite(lastHeartbeat) ? Math.max(0, observedAtMs - lastHeartbeat) : null,
  });
}

function buildNodeSnapshotResult(nodeId, nodeRead, serviceRead, partitionRead, now) {
  const nodeRows = nodeRead.rows;
  const serviceRows = serviceRead.rows;
  const partitionRows = partitionRead.rows;
  const nodeRow = nodeSnapshotRow(nodeRows, nodeId);
  const observedAtMs = nodeSnapshotObservedAtMs([nodeRead, serviceRead, partitionRead], now);
  return Object.freeze({
    nodeId, nodeRow, nodeRows, serviceRows, partitionRows,
    source: resolveCompositeSource([nodeRead, serviceRead, partitionRead]),
    snapshotVersion: resolveSnapshotVersion(nodeRows) ?? resolveSnapshotVersion(serviceRows) ??
      resolveSnapshotVersion(partitionRows),
    freshness: nodeSnapshotFreshness(nodeRow, observedAtMs),
    tables: Object.freeze({nodes: nodeRead, services: serviceRead, partitions: partitionRead}),
  });
}

async function readNodeSnapshotPartitions(view, serviceRead, options) {
  if (serviceRead.success !== true) {
    return buildUnavailableReadObservation(TABLES.PARTITIONS, serviceRead.observedAtMs,
      serviceRead);
  }
  const partitionIds = collectNodeSnapshotPartitionIds(serviceRead.rows);
  const query = buildNodeSnapshotPartitionReadQuery(partitionIds);
  if (query) return view.readRows(TABLES.PARTITIONS, query.sql, query.params, options);
  if (serviceRead.rowSetComplete !== true) {
    return buildUnavailableReadObservation(TABLES.PARTITIONS, serviceRead.observedAtMs, {
      error: CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.READ_INCOMPLETE,
      errorCode: CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.READ_INCOMPLETE,
      deferRetry: true,
      cause: serviceRead,
    });
  }
  return Object.freeze({
    success: true,
    rows: freezeRows([]),
    rowSetComplete: true,
    source: serviceRead.source,
    observedAtMs: serviceRead.observedAtMs,
  });
}

async function executeViewOwnerRead(view, tableName, sql, params, options, queryTimeoutMs) {
  const observedAtMs = view.now();
  const workloadProfile = resolveAuthoritativeReadWorkloadProfile(tableName, options,
    ['control-plane:read', `control-plane:table:${tableName || 'unknown'}`]);
  const pressureDecision = await view.getPressureGovernor().admit({
    workClass: workloadProfile.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
    resourceKeys: workloadProfile.resourceKeys,
  });
  const queryOptions = buildViewQueryOptions(view.nodeId, tableName, sql, options,
    workloadProfile, queryTimeoutMs, observedAtMs);
  if (!view.canRead()) {
    return buildUnavailableReadObservation(tableName, observedAtMs, {
      error: LOCAL_STR_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
    });
  }
  if (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
      pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT) {
    return buildUnavailableReadObservation(tableName, observedAtMs,
      buildPressureAdmissionFailure(pressureDecision, {tableName}));
  }
  const result = await view.cdcIntegrationService.executeAuthoritativeSystemTableRead(
    tableName, sql, params, {readAuthority: options.readAuthority, queryOptions},
  );
  return buildOwnerReadObservation(tableName, result, queryTimeoutMs, observedAtMs);
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
    const resolvedOptions = applyAuthoritativeViewDefaultReadMode(options || {});
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
    inFlightRead = executeViewOwnerRead(this, tableName, sql, params, resolvedOptions,
      queryTimeoutMs).finally(() => {
      if (this.inFlightReadsByKey.get(readKey) === inFlightRead) {
        this.inFlightReadsByKey.delete(readKey);
      }
    });

    this.inFlightReadsByKey.set(readKey, inFlightRead);
    return inFlightRead;
  }

  /**
   * Read canonical owner rows needed to make a readiness decision.
   *
   * This named interaction owns the whole cross-subsystem contract. Callers
   * cannot accidentally route readiness evidence through ordinary readiness,
   * fall back to a stale SQL projection, or accept a non-leader owner replica.
   * Optional workload/timeout fields remain caller-owned; authority fields do
   * not.
   *
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async readReadinessOwnerRows(tableName, sql, params = [], options = {}) {
    const readAuthority = buildControlPlaneReadAuthority({
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      purpose: CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL,
    });
    return this.readRows(tableName, sql, params, {
      ...options,
      readAuthority,
    });
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
    const baseReadOptions = applyAuthoritativeViewDefaultReadMode(options);
    const [nodeRead, serviceRead] = await Promise.all([
      this.readRows(
        TABLES.NODES,
        `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`,
        [normalizedNodeId],
        baseReadOptions,
      ),
      this.readRows(
        TABLES.SERVICES,
        `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.NODE_ID} = ?`,
        [normalizedNodeId],
        baseReadOptions,
      ),
    ]);
    const partitionRead = await readNodeSnapshotPartitions(this, serviceRead, baseReadOptions);
    return buildNodeSnapshotResult(normalizedNodeId, nodeRead, serviceRead, partitionRead, this.now);
  }
}

export {
  AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE,
  AuthoritativeControlPlaneView,
};
