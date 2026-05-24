/**
 * SQL/CDC-owned debug metadata service.
 */

import crypto from 'node:crypto';
import {NUM, SQL, TYPEOF} from '../constants/index.js';
import {createSqlRequest} from '../query/sql-request.js';
import {
  authorizeAction,
  validateSecurityContext,
} from '../admin/admin-auth-middleware.js';
import {
  DEBUG_METADATA_TABLE as DT,
  DEBUG_SESSION_FIELD as DSF,
  DEBUG_BREAKPOINT_FIELD as DBF,
  DEBUG_SNAPSHOT_FIELD as DPF,
  DEBUG_SESSION_STATUS,
} from './debug-metadata-constants.js';
import {
  DEBUG_METADATA_ACTION as ACTION,
  DEBUG_METADATA_DEFAULT as DEF,
  DEBUG_METADATA_ERROR_CODE as CODE,
  DEBUG_METADATA_ERROR_MSG as ERR,
  DEBUG_METADATA_SQL as DSQL,
  DEBUG_METADATA_ROW_LIMIT as LIMIT,
} from './debug-metadata-service-constants.js';
import {
  defaultDebugPolicyResolver,
} from './debug-metadata-service-policy.js';
import {
  normalizeBreakpointRow,
  normalizeSessionRow,
  normalizeSnapshotRow,
} from './debug-metadata-service-row-normalizers.js';
import {
  assertNonEmptyString,
  assertRequestObject,
  buildBreakpointId,
  buildPlaceholders,
  createDebugMetadataError,
  normalizeEnvelopeBuffer,
  normalizeLimit,
  toNullableInteger,
  toResolvedFlag,
} from './debug-metadata-service-value-helpers.js';

const LOCAL_STR_I8FSF = 'lineNumber is required for each breakpoint';
const LOCAL_STR_1XM6O = 'moduleRef is required for breakpoints';
const LOCAL_STR_1A3OA = 'sourceFileUrl is required for breakpoints';
const LOCAL_STR_J82AO = 'moduleRef is required for snapshot metadata';
const LOCAL_STR_D1ZDM = 'moduleDigest is required for snapshot metadata';
const LOCAL_STR_YWKFO = 'snapshotId is required';
const LOCAL_STR_SQL_REQUEST_FAILED = 'SQL request failed';

const SESSION_COLUMNS = Object.freeze([
  DSF.SESSION_ID,
  DSF.TENANT_ID,
  DSF.SERVICE_NAME,
  DSF.LINEAGE_ID,
  DSF.STAGE_ID,
  DSF.NODE_ID,
  DSF.ENDPOINT,
  DSF.STATUS,
  DSF.CREATED_AT,
  DSF.UPDATED_AT,
]);

const BREAKPOINT_COLUMNS = Object.freeze([
  DBF.BREAKPOINT_ID,
  DBF.SESSION_ID,
  DBF.TENANT_ID,
  DBF.MODULE_REF,
  DBF.SOURCE_FILE_URL,
  DBF.LINE_NUMBER,
  DBF.COLUMN_NUMBER,
  DBF.CONDITION,
  DBF.RESOLVED,
  DBF.CREATED_AT,
  DBF.UPDATED_AT,
]);

const SNAPSHOT_COLUMNS = Object.freeze([
  DPF.SNAPSHOT_ID,
  DPF.SESSION_ID,
  DSF.TENANT_ID,
  DPF.MODULE_REF,
  DPF.MODULE_DIGEST,
  DPF.CAPTURED_AT,
  DPF.FORMAT_VERSION,
  DPF.SNAPSHOT_BYTES_BASE64,
  DPF.MANIFEST_JSON,
  DPF.TOTAL_BYTES,
  DPF.FRAME_COUNT,
  DPF.HOST_CALL_COUNT,
  DPF.CREATED_AT,
  DPF.UPDATED_AT,
]);

const ORDER_BY_UPDATED_DESC = `${SQL.ORDER_BY} ${DSF.UPDATED_AT} DESC`;
const ORDER_BY_CREATED_ASC = `${SQL.ORDER_BY} ${DBF.CREATED_AT} ASC`;
const ORDER_BY_CAPTURED_DESC = `${SQL.ORDER_BY} ${DPF.CAPTURED_AT} DESC`;

/**
 * SQL-owned debug metadata store.
 */
class DebugMetadataStore {
  /**
   * @param {Object} [options]
   * @param {Object} [options.sqlQueryEngine]
   * @param {Function} [options.now]
   * @param {Function} [options.createSqlRequest]
   * @param {Function} [options.validateSecurityContext]
   * @param {Function} [options.authorizeAction]
   * @param {Function} [options.resolvePolicy]
   */
  constructor(options = {}) {
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.now = options.now || (() => Date.now());
    this.createSqlRequest = options.createSqlRequest || createSqlRequest;
    this.validateSecurityContext =
      options.validateSecurityContext || validateSecurityContext;
    this.authorizeAction = options.authorizeAction || authorizeAction;
    this.resolvePolicy = options.resolvePolicy || defaultDebugPolicyResolver;
  }

  /**
   * @param {Object} sqlQueryEngine
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine;
  }

  /**
   * Persist a debug session row.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async createSession(request) {
    assertRequestObject(request);
    assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
    assertNonEmptyString(
      request.serviceName,
      ERR.SERVICE_NAME_REQUIRED,
      CODE.INVALID_REQUEST,
    );

    const auth = this.authorizeRequest(request.securityContext, ACTION.CREATE_SESSION);
    const now = this.now();
    const row = {
      [DSF.SESSION_ID]: request.sessionId,
      [DSF.TENANT_ID]: auth.tenantId,
      [DSF.SERVICE_NAME]: request.serviceName,
      [DSF.LINEAGE_ID]: request.lineageId || null,
      [DSF.STAGE_ID]: toNullableInteger(request.stageId),
      [DSF.NODE_ID]: request.nodeId || null,
      [DSF.ENDPOINT]: request.endpoint || null,
      [DSF.STATUS]: request.status || DEBUG_SESSION_STATUS.ACTIVE,
      [DSF.CREATED_AT]: now,
      [DSF.UPDATED_AT]: now,
    };

    await this.upsertRow({
      tableName: DT.SESSIONS,
      columns: SESSION_COLUMNS,
      row,
      tenantId: auth.tenantId,
      sessionId: request.sessionId,
    });

    return normalizeSessionRow(row);
  }

  /**
   * Update endpoint/stage metadata for an existing session.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async updateSession(request) {
    assertRequestObject(request);
    assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);

    const auth = this.authorizeRequest(request.securityContext, ACTION.UPDATE_SESSION);
    const existing = await this.readSessionRow(
      auth.tenantId,
      request.sessionId,
      request.sessionId,
    );
    if (!existing) {
      throw createDebugMetadataError(
        CODE.SESSION_NOT_FOUND,
        ERR.SESSION_NOT_FOUND,
      );
    }

    const row = {
      ...existing,
      [DSF.SERVICE_NAME]: request.serviceName || existing[DSF.SERVICE_NAME],
      [DSF.LINEAGE_ID]: request.lineageId !== undefined ?
        request.lineageId :
        existing[DSF.LINEAGE_ID],
      [DSF.STAGE_ID]: request.stageId !== undefined ?
        toNullableInteger(request.stageId) :
        toNullableInteger(existing[DSF.STAGE_ID]),
      [DSF.NODE_ID]: request.nodeId !== undefined ?
        request.nodeId :
        existing[DSF.NODE_ID],
      [DSF.ENDPOINT]: request.endpoint !== undefined ?
        request.endpoint :
        existing[DSF.ENDPOINT],
      [DSF.STATUS]: request.status || existing[DSF.STATUS],
      [DSF.UPDATED_AT]: this.now(),
    };

    await this.upsertRow({
      tableName: DT.SESSIONS,
      columns: SESSION_COLUMNS,
      row,
      tenantId: auth.tenantId,
      sessionId: request.sessionId,
    });

    return normalizeSessionRow(row);
  }

  /**
   * Backward-compatible alias for updateSession.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async updateSessionEndpoint(request) {
    return this.updateSession(request);
  }

  /**
   * Detach an existing session by updating status/endpoint metadata.
   * Session metadata remains SQL-owned for auditability.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async detachSession(request) {
    assertRequestObject(request);
    assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);

    this.authorizeRequest(request.securityContext, ACTION.DETACH_SESSION);

    return this.updateSession({
      ...request,
      status: DEBUG_SESSION_STATUS.DETACHED,
      endpoint: null,
      nodeId: null,
    });
  }

  /**
   * Authorize and resolve one session for debugger attach.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async attachSession(request) {
    assertRequestObject(request);
    assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);

    const auth = this.authorizeRequest(request.securityContext, ACTION.ATTACH_SESSION);
    const row = await this.readSessionRow(
      auth.tenantId,
      request.sessionId,
      request.sessionId,
    );
    if (!row) {
      throw createDebugMetadataError(
        CODE.SESSION_NOT_FOUND,
        ERR.SESSION_NOT_FOUND,
      );
    }

    return normalizeSessionRow(row);
  }

  /**
   * Read a tenant-scoped debug session.
   * @param {Object} request
   * @return {Promise<Object|null>}
   */
  async getSession(request) {
    assertRequestObject(request);
    assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);

    const auth = this.authorizeRequest(request.securityContext, ACTION.ATTACH_SESSION);
    const row = await this.readSessionRow(
      auth.tenantId,
      request.sessionId,
      request.sessionId,
    );

    return row ? normalizeSessionRow(row) : null;
  }

  /**
   * List tenant-scoped sessions.
   * @param {Object} request
   * @return {Promise<Array<Object>>}
   */
  async listSessions(request) {
    assertRequestObject(request);

    const auth = this.authorizeRequest(request.securityContext, ACTION.LIST_SESSIONS);
    const limit = normalizeLimit(request.limit, LIMIT.SESSIONS);

    const filters = [`${DSF.TENANT_ID} = ?1`];
    const params = [auth.tenantId];

    if (request.serviceName) {
      params.push(request.serviceName);
      filters.push(`${DSF.SERVICE_NAME} = ?${params.length}`);
    }
    if (request.lineageId) {
      params.push(request.lineageId);
      filters.push(`${DSF.LINEAGE_ID} = ?${params.length}`);
    }

    const sql = `${SQL.SELECT} * FROM ${DT.SESSIONS}` +
      ` ${SQL.WHERE} ${filters.join(` ${SQL.AND} `)}` +
      ` ${ORDER_BY_UPDATED_DESC}` +
      `${DSQL.LIMIT}${limit}`;

    const result = await this.executeSql({
      statement: sql,
      parameters: params,
      tenantId: auth.tenantId,
      sessionId: request.sessionId || auth.tenantId,
    });
    const rows = Array.isArray(result.rows) ? result.rows : [];
    return rows.map((row) => normalizeSessionRow(row));
  }

  /**
   * Persist breakpoint rows for a session.
   * @param {Object} request
   * @return {Promise<Array<Object>>}
   */
  async writeBreakpoints(request) {
    assertRequestObject(request);
    assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
    if (!Array.isArray(request.breakpoints)) {
      throw createDebugMetadataError(
        CODE.BREAKPOINTS_REQUIRED,
        ERR.BREAKPOINTS_REQUIRED,
      );
    }

    const auth = this.authorizeRequest(request.securityContext, ACTION.WRITE_BREAKPOINTS);
    const sessionRow = await this.readSessionRow(
      auth.tenantId,
      request.sessionId,
      request.sessionId,
    );
    if (!sessionRow) {
      throw createDebugMetadataError(
        CODE.SESSION_NOT_FOUND,
        ERR.SESSION_NOT_FOUND,
      );
    }

    const now = this.now();
    const rows = [];
    for (let index = NUM.ZERO; index < request.breakpoints.length; index++) {
      const breakpoint = request.breakpoints[index] || {};
      const lineNumber = toNullableInteger(breakpoint.lineNumber);
      if (lineNumber === null) {
        throw createDebugMetadataError(
          CODE.INVALID_REQUEST,
          LOCAL_STR_I8FSF,
        );
      }
      const columnNumber = toNullableInteger(breakpoint.columnNumber) ??
        DEF.COLUMN_NUMBER;
      const moduleRef = request.moduleRef || breakpoint.moduleRef;
      const sourceFileUrl =
        request.sourceFileUrl || breakpoint.sourceFileUrl;
      assertNonEmptyString(
        moduleRef,
        LOCAL_STR_1XM6O,
        CODE.INVALID_REQUEST,
      );
      assertNonEmptyString(
        sourceFileUrl,
        LOCAL_STR_1A3OA,
        CODE.INVALID_REQUEST,
      );

      const row = {
        [DBF.BREAKPOINT_ID]: breakpoint.breakpointId ||
          buildBreakpointId(request.sessionId, index, lineNumber, columnNumber),
        [DBF.SESSION_ID]: request.sessionId,
        [DBF.TENANT_ID]: auth.tenantId,
        [DBF.MODULE_REF]: moduleRef,
        [DBF.SOURCE_FILE_URL]: sourceFileUrl,
        [DBF.LINE_NUMBER]: lineNumber,
        [DBF.COLUMN_NUMBER]: columnNumber,
        [DBF.CONDITION]: breakpoint.condition || null,
        [DBF.RESOLVED]: toResolvedFlag(breakpoint.resolved),
        [DBF.CREATED_AT]: toNullableInteger(breakpoint.createdAt) || now,
        [DBF.UPDATED_AT]: now,
      };

      await this.upsertRow({
        tableName: DT.BREAKPOINTS,
        columns: BREAKPOINT_COLUMNS,
        row,
        tenantId: auth.tenantId,
        sessionId: request.sessionId,
      });
      rows.push(normalizeBreakpointRow(row));
    }

    return rows;
  }

  /**
   * List breakpoints for one tenant/session pair.
   * @param {Object} request
   * @return {Promise<Array<Object>>}
   */
  async listBreakpoints(request) {
    assertRequestObject(request);
    assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);

    const auth = this.authorizeRequest(request.securityContext, ACTION.READ_BREAKPOINTS);
    const limit = normalizeLimit(request.limit, LIMIT.BREAKPOINTS);

    const sql = `${SQL.SELECT} * FROM ${DT.BREAKPOINTS}` +
      ` ${SQL.WHERE} ${DBF.TENANT_ID} = ?1` +
      ` ${SQL.AND} ${DBF.SESSION_ID} = ?2` +
      ` ${ORDER_BY_CREATED_ASC}` +
      `${DSQL.LIMIT}${limit}`;
    const result = await this.executeSql({
      statement: sql,
      parameters: [auth.tenantId, request.sessionId],
      tenantId: auth.tenantId,
      sessionId: request.sessionId,
    });
    const rows = Array.isArray(result.rows) ? result.rows : [];
    return rows.map((row) => normalizeBreakpointRow(row));
  }

  /**
   * Persist one serialized snapshot artifact.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async writeSnapshot(request) {
    assertRequestObject(request);
    assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
    if (!request.snapshotArtifact ||
      typeof request.snapshotArtifact !== TYPEOF.OBJECT) {
      throw createDebugMetadataError(CODE.INVALID_REQUEST, ERR.SNAPSHOT_REQUIRED);
    }

    const auth = this.authorizeRequest(request.securityContext, ACTION.WRITE_SNAPSHOT);
    const sessionRow = await this.readSessionRow(
      auth.tenantId,
      request.sessionId,
      request.sessionId,
    );
    if (!sessionRow) {
      throw createDebugMetadataError(
        CODE.SESSION_NOT_FOUND,
        ERR.SESSION_NOT_FOUND,
      );
    }

    const artifact = request.snapshotArtifact;
    const manifest = artifact.manifest || {};
    const snapshot = artifact.snapshot || {};
    const envelope = normalizeEnvelopeBuffer(artifact.envelope);
    const now = this.now();

    const row = {
      [DPF.SNAPSHOT_ID]:
        request.snapshotId || manifest.snapshotId || snapshot.snapshotId ||
        crypto.randomUUID(),
      [DPF.SESSION_ID]: request.sessionId,
      [DSF.TENANT_ID]: auth.tenantId,
      [DPF.MODULE_REF]:
        request.moduleRef || snapshot.moduleRef || manifest.moduleRef || null,
      [DPF.MODULE_DIGEST]:
        request.moduleDigest ||
        snapshot.moduleDigest ||
        manifest.moduleDigest ||
        null,
      [DPF.CAPTURED_AT]: toNullableInteger(
        request.capturedAt ||
        snapshot.capturedAt ||
        manifest.capturedAt,
      ) || now,
      [DPF.FORMAT_VERSION]: toNullableInteger(
        request.formatVersion ||
        snapshot.formatVersion ||
        manifest.formatVersion,
      ) || 1,
      [DPF.SNAPSHOT_BYTES_BASE64]: envelope.toString('base64'),
      [DPF.MANIFEST_JSON]: JSON.stringify(manifest),
      [DPF.TOTAL_BYTES]: toNullableInteger(
        request.totalBytes ||
        manifest.totalBytes ||
        snapshot.totalBytes,
      ) || envelope.length,
      [DPF.FRAME_COUNT]: toNullableInteger(
        request.frameCount ||
        manifest.frameCount ||
        snapshot.inputFrames?.length,
      ) || NUM.ZERO,
      [DPF.HOST_CALL_COUNT]: toNullableInteger(
        request.hostCallCount ||
        manifest.hostCallCount ||
        snapshot.hostCallLedger?.length,
      ) || NUM.ZERO,
      [DPF.CREATED_AT]: now,
      [DPF.UPDATED_AT]: now,
    };

    assertNonEmptyString(
      row[DPF.MODULE_REF],
      LOCAL_STR_J82AO,
      CODE.INVALID_REQUEST,
    );
    assertNonEmptyString(
      row[DPF.MODULE_DIGEST],
      LOCAL_STR_D1ZDM,
      CODE.INVALID_REQUEST,
    );

    await this.upsertRow({
      tableName: DT.SNAPSHOTS,
      columns: SNAPSHOT_COLUMNS,
      row,
      tenantId: auth.tenantId,
      sessionId: request.sessionId,
    });

    return normalizeSnapshotRow(row, true);
  }

  /**
   * Read one snapshot by ID with tenant isolation.
   * @param {Object} request
   * @return {Promise<Object|null>}
   */
  async getSnapshot(request) {
    assertRequestObject(request);
    assertNonEmptyString(request.snapshotId, LOCAL_STR_YWKFO, CODE.INVALID_REQUEST);

    const auth = this.authorizeRequest(request.securityContext, ACTION.READ_SNAPSHOT);
    const sql = `${SQL.SELECT} * FROM ${DT.SNAPSHOTS}` +
      ` ${SQL.WHERE} ${DPF.SNAPSHOT_ID} = ?1` +
      ` ${SQL.AND} ${DSF.TENANT_ID} = ?2` +
      ` ${SQL.LIMIT} 1`;
    const result = await this.executeSql({
      statement: sql,
      parameters: [request.snapshotId, auth.tenantId],
      tenantId: auth.tenantId,
      sessionId: request.sessionId || request.snapshotId,
    });

    const row = Array.isArray(result.rows) ?
      result.rows[NUM.ZERO] || null :
      null;
    if (!row) {
      return null;
    }
    const includeEnvelope = request.includeEnvelope !== false;
    return normalizeSnapshotRow(row, includeEnvelope);
  }

  /**
   * List snapshot metadata for one session.
   * @param {Object} request
   * @return {Promise<Array<Object>>}
   */
  async listSnapshots(request) {
    assertRequestObject(request);
    assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);

    const auth = this.authorizeRequest(request.securityContext, ACTION.LIST_SNAPSHOTS);
    const limit = normalizeLimit(request.limit, LIMIT.SNAPSHOTS);
    const sql = `${SQL.SELECT} * FROM ${DT.SNAPSHOTS}` +
      ` ${SQL.WHERE} ${DSF.TENANT_ID} = ?1` +
      ` ${SQL.AND} ${DPF.SESSION_ID} = ?2` +
      ` ${ORDER_BY_CAPTURED_DESC}` +
      `${DSQL.LIMIT}${limit}`;
    const result = await this.executeSql({
      statement: sql,
      parameters: [auth.tenantId, request.sessionId],
      tenantId: auth.tenantId,
      sessionId: request.sessionId,
    });
    const rows = Array.isArray(result.rows) ? result.rows : [];
    return rows.map((row) => normalizeSnapshotRow(row, false));
  }

  /**
   * @param {Object} securityContext
   * @param {string} action
   * @return {Object}
   */
  authorizeRequest(securityContext, action) {
    if (!securityContext) {
      throw createDebugMetadataError(
        CODE.INVALID_CONTEXT,
        ERR.SECURITY_CONTEXT_REQUIRED,
      );
    }

    const validation = this.validateSecurityContext(securityContext);
    if (!validation.valid) {
      throw createDebugMetadataError(
        CODE.INVALID_CONTEXT,
        validation.error || ERR.SECURITY_CONTEXT_REQUIRED,
      );
    }

    const policy = this.resolvePolicy(validation, action);
    const authResult = this.authorizeAction(securityContext, action, policy);
    if (!authResult.authorized) {
      throw createDebugMetadataError(
        CODE.UNAUTHORIZED,
        authResult.error || ERR.AUTHORIZATION_FAILED,
      );
    }

    return validation;
  }

  /**
   * Execute a canonical SqlRequest.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async executeSql(request) {
    if (!this.sqlQueryEngine ||
      typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION) {
      throw createDebugMetadataError(
        CODE.ENGINE_REQUIRED,
        ERR.ENGINE_REQUIRED,
      );
    }

    const sqlRequest = this.createSqlRequest({
      statement: request.statement,
      parameters: request.parameters || [],
      tenantId: request.tenantId,
      sessionId: request.sessionId ||
        `${DEF.SESSION_ID_PREFIX}-${this.now()}`,
    });

    const result = await this.sqlQueryEngine.executeRequest(sqlRequest);
    if (result && result.success === false) {
      throw createDebugMetadataError(
        CODE.INVALID_REQUEST,
        result.error || LOCAL_STR_SQL_REQUEST_FAILED,
      );
    }
    return result;
  }

  /**
   * Insert/replace one row.
   * @param {Object} request
   * @return {Promise<void>}
   */
  async upsertRow(request) {
    const placeholders = buildPlaceholders(request.columns.length);
    const sql = `${DSQL.INSERT_OR_REPLACE_INTO} ${request.tableName}` +
      ` (${request.columns.join(', ')})` +
      ` ${SQL.VALUES} (${placeholders})`;
    const parameters = request.columns.map((columnName) =>
      request.row[columnName],
    );

    await this.executeSql({
      statement: sql,
      parameters,
      tenantId: request.tenantId,
      sessionId: request.sessionId,
    });
  }

  /**
   * Read one session row by tenant + session ID.
   * @param {string} tenantId
   * @param {string} sessionId
   * @param {string} sqlSessionId
   * @return {Promise<Object|null>}
   */
  async readSessionRow(tenantId, sessionId, sqlSessionId) {
    const sql = `${SQL.SELECT} * FROM ${DT.SESSIONS}` +
      ` ${SQL.WHERE} ${DSF.SESSION_ID} = ?1` +
      ` ${SQL.AND} ${DSF.TENANT_ID} = ?2` +
      ` ${SQL.LIMIT} 1`;
    const result = await this.executeSql({
      statement: sql,
      parameters: [sessionId, tenantId],
      tenantId,
      sessionId: sqlSessionId,
    });

    const rows = Array.isArray(result.rows) ? result.rows : [];
    return rows[NUM.ZERO] || null;
  }
}

export {
  DebugMetadataStore,
  defaultDebugPolicyResolver,
  createDebugMetadataError,
};
