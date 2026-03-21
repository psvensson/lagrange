import {
  COLUMN,
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from './pressure-governor.js';

const AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE = Object.freeze({
  LOCAL_PARTITION_REPLICA: 'local_partition_replica',
  SQL_QUERY_ENGINE: 'sql_query_engine',
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
  if (normalized === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.SQL_QUERY_ENGINE) {
    return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.SQL_QUERY_ENGINE;
  }
  return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE;
}

function normalizePositiveInteger(value, fallback) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    fallback;
}

function freezeRows(rows) {
  if (!Array.isArray(rows) || rows.length === NUM.ZERO) {
    return Object.freeze([]);
  }
  return Object.freeze(rows.map((row) => {
    return row && typeof row === TYPEOF.OBJECT ?
      Object.freeze({...row}) :
      row;
  }));
}

function buildAuthoritativeReadKey(tableName, sql, params, options, queryTimeoutMs) {
  const queryOptions =
    options?.queryOptions && typeof options.queryOptions === TYPEOF.OBJECT ?
      options.queryOptions :
      {};
  return JSON.stringify({
    tableName: tableName || null,
    sql: sql || null,
    params: Array.isArray(params) ? params : [],
    workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
    allowPressureDegrade: options?.allowPressureDegrade !== false,
    allowPressureDefer: options?.allowPressureDefer === true,
    allowSqlFallback: options?.allowSqlFallback !== false,
    localReadConsistency: options?.localReadConsistency ||
      AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
    routingReadinessDimension:
      queryOptions.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
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
  if (sources.length === NUM.ZERO) {
    return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE;
  }
  if (sources.length === NUM.ONE) {
    return sources[NUM.ZERO];
  }
  return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.MIXED;
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
    this.now = typeof options.now === TYPEOF.FUNCTION ?
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
    if (Object.hasOwn(options, 'cdcIntegrationService')) {
      this.cdcIntegrationService = options.cdcIntegrationService || null;
    }
    if (Object.hasOwn(options, 'messageRouter')) {
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
        TYPEOF.FUNCTION,
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
    const queryTimeoutMs = normalizePositiveInteger(
      options.queryTimeoutMs,
      this.queryTimeoutMs,
    );
    const readKey = buildAuthoritativeReadKey(
      tableName,
      sql,
      params,
      options,
      queryTimeoutMs,
    );
    if (this.inFlightReadsByKey.has(readKey)) {
      return this.inFlightReadsByKey.get(readKey);
    }

    let inFlightRead = null;
    inFlightRead = (async () => {
      const observedAtMs = this.now();
      const observedAt = new Date(observedAtMs).toISOString();
      const pressureDecision = this.getPressureGovernor().evaluate({
        workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
        resourceKeys: [
          'control-plane:read',
          `control-plane:table:${tableName || 'unknown'}`,
        ],
        allowDegrade: options?.allowPressureDegrade !== false,
        allowDefer: options?.allowPressureDefer === true,
        retryAfterMs: options?.pressureRetryAfterMs,
      });
      const queryOptions = {
        ...(options.queryOptions && typeof options.queryOptions === TYPEOF.OBJECT ?
          options.queryOptions :
          {}),
        timeoutMs: queryTimeoutMs,
        sessionId:
          typeof options?.queryOptions?.sessionId === TYPEOF.STRING &&
            options.queryOptions.sessionId.length > NUM.ZERO ?
            options.queryOptions.sessionId :
            `authoritative-control-plane-read:${this.nodeId || 'unknown'}:` +
              `${tableName}:${observedAtMs}`,
        routingReadinessDimension:
          options?.queryOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      };
      if (!this.canRead()) {
        return Object.freeze({
          success: false,
          tableName,
          rows: Object.freeze([]),
          rowCount: NUM.ZERO,
          source: AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE,
          usedSqlFallback: false,
          snapshotVersion: null,
          observedAt,
          observedAtMs,
          error: 'authoritative_row_source_unavailable',
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
          rowCount: NUM.ZERO,
          source: AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE,
          usedSqlFallback: false,
          snapshotVersion: null,
          observedAt,
          observedAtMs,
        });
      }

      const result =
        await this.cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          {
            localReadConsistency:
              AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
            allowSqlFallback:
              options?.allowSqlFallback !== false &&
              pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE,
            queryOptions,
          },
        );
      if (result?.success !== true &&
          pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE) {
        const failure = buildPressureAdmissionFailure(pressureDecision, {
          tableName,
          error: result?.error || undefined,
        });
        return Object.freeze({
          ...failure,
          rows: freezeRows(failure.rows),
          rowCount: NUM.ZERO,
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
        usedSqlFallback:
          source === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.SQL_QUERY_ENGINE,
        snapshotVersion: resolveSnapshotVersion(rows),
        observedAt,
        observedAtMs,
        error: result?.success === true ?
          null :
          (result?.error || 'authoritative_query_failed'),
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
   * Read node and service evidence for one node through the canonical
   * authoritative owner path.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async readNodeSnapshot(nodeId, options = {}) {
    const normalizedNodeId = String(nodeId || '');
    const [nodeRead, serviceRead] = await Promise.all([
      this.readRows(
        TABLES.NODES,
        `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`,
        [normalizedNodeId],
        options,
      ),
      this.readRows(
        TABLES.SERVICES,
        `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.NODE_ID} = ?`,
        [normalizedNodeId],
        options,
      ),
    ]);
    const nodeRows = nodeRead.rows;
    const serviceRows = serviceRead.rows;
    const nodeRow = nodeRows.find((row) => {
      return row?.[COLUMN.NODE_ID] === normalizedNodeId ||
        row?.node_id === normalizedNodeId;
    }) || nodeRows[NUM.ZERO] || null;
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
            this.now()
        );

    return Object.freeze({
      nodeId: normalizedNodeId,
      nodeRow,
      nodeRows,
      serviceRows,
      source: resolveCompositeSource([nodeRead, serviceRead]),
      snapshotVersion:
        resolveSnapshotVersion(nodeRows) ??
        resolveSnapshotVersion(serviceRows),
      freshness: Object.freeze({
        lastHeartbeat:
          Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
        heartbeatAgeMs:
          Number.isFinite(lastHeartbeat) ?
            Math.max(NUM.ZERO, snapshotObservedAtMs - lastHeartbeat) :
            null,
      }),
      tables: Object.freeze({
        nodes: nodeRead,
        services: serviceRead,
      }),
    });
  }
}

export {
  AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE,
  AuthoritativeControlPlaneView,
};
