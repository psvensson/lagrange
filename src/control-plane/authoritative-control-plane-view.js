import {
  COLUMN,
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';

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
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.queryTimeoutMs = normalizePositiveInteger(
      options.queryTimeoutMs,
      AUTHORITATIVE_CONTROL_PLANE_DEFAULT_QUERY_TIMEOUT_MS,
    );
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
   * Execute one authoritative control-plane table read.
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async readRows(tableName, sql, params = [], options = {}) {
    const observedAtMs = this.now();
    const observedAt = new Date(observedAtMs).toISOString();
    const queryTimeoutMs = normalizePositiveInteger(
      options.queryTimeoutMs,
      this.queryTimeoutMs,
    );
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

    const result =
      await this.cdcIntegrationService.executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        {
          localReadConsistency:
            AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
          allowSqlFallback: options.allowSqlFallback !== false,
          queryOptions,
        },
      );
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
            Math.max(NUM.ZERO, this.now() - lastHeartbeat) :
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
