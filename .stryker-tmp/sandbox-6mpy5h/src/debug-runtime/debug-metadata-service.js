/**
 * SQL/CDC-owned debug metadata service.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import crypto from 'node:crypto';
import { NUM, SQL, TYPEOF } from '../constants/index.js';
import { createSqlRequest } from '../query/sql-request.js';
import { authorizeAction, validateSecurityContext, WILDCARD_POLICY } from '../admin/admin-auth-middleware.js';
import { DEBUG_METADATA_TABLE as DT, DEBUG_SESSION_FIELD as DSF, DEBUG_BREAKPOINT_FIELD as DBF, DEBUG_SNAPSHOT_FIELD as DPF, DEBUG_SESSION_STATUS } from './debug-metadata-constants.js';
import { DEBUG_METADATA_ACTION as ACTION, DEBUG_METADATA_ROLE as ROLE, DEBUG_METADATA_DEFAULT as DEF, DEBUG_METADATA_ERROR_CODE as CODE, DEBUG_METADATA_ERROR_MSG as ERR, DEBUG_METADATA_SQL as DSQL, DEBUG_METADATA_ROW_LIMIT as LIMIT } from './debug-metadata-service-constants.js';
const SESSION_COLUMNS = Object.freeze(stryMutAct_9fa48("76681") ? [] : (stryCov_9fa48("76681"), [DSF.SESSION_ID, DSF.TENANT_ID, DSF.SERVICE_NAME, DSF.LINEAGE_ID, DSF.STAGE_ID, DSF.NODE_ID, DSF.ENDPOINT, DSF.STATUS, DSF.CREATED_AT, DSF.UPDATED_AT]));
const BREAKPOINT_COLUMNS = Object.freeze(stryMutAct_9fa48("76682") ? [] : (stryCov_9fa48("76682"), [DBF.BREAKPOINT_ID, DBF.SESSION_ID, DBF.TENANT_ID, DBF.MODULE_REF, DBF.SOURCE_FILE_URL, DBF.LINE_NUMBER, DBF.COLUMN_NUMBER, DBF.CONDITION, DBF.RESOLVED, DBF.CREATED_AT, DBF.UPDATED_AT]));
const SNAPSHOT_COLUMNS = Object.freeze(stryMutAct_9fa48("76683") ? [] : (stryCov_9fa48("76683"), [DPF.SNAPSHOT_ID, DPF.SESSION_ID, DSF.TENANT_ID, DPF.MODULE_REF, DPF.MODULE_DIGEST, DPF.CAPTURED_AT, DPF.FORMAT_VERSION, DPF.SNAPSHOT_BYTES_BASE64, DPF.MANIFEST_JSON, DPF.TOTAL_BYTES, DPF.FRAME_COUNT, DPF.HOST_CALL_COUNT, DPF.CREATED_AT, DPF.UPDATED_AT]));
const ROLE_ACTIONS = Object.freeze(stryMutAct_9fa48("76684") ? {} : (stryCov_9fa48("76684"), {
  [ROLE.ATTACH]: Object.freeze(stryMutAct_9fa48("76685") ? [] : (stryCov_9fa48("76685"), [ACTION.ATTACH_SESSION, ACTION.LIST_SESSIONS])),
  [ROLE.READ]: Object.freeze(stryMutAct_9fa48("76686") ? [] : (stryCov_9fa48("76686"), [ACTION.ATTACH_SESSION, ACTION.LIST_SESSIONS, ACTION.READ_BREAKPOINTS, ACTION.READ_SNAPSHOT, ACTION.LIST_SNAPSHOTS])),
  [ROLE.WRITE]: Object.freeze(stryMutAct_9fa48("76687") ? [] : (stryCov_9fa48("76687"), [ACTION.CREATE_SESSION, ACTION.UPDATE_SESSION, ACTION.DETACH_SESSION, ACTION.WRITE_BREAKPOINTS, ACTION.WRITE_SNAPSHOT, ACTION.LIST_SESSIONS, ACTION.ATTACH_SESSION]))
}));
const ORDER_BY_UPDATED_DESC = stryMutAct_9fa48("76688") ? `` : (stryCov_9fa48("76688"), `${SQL.ORDER_BY} ${DSF.UPDATED_AT} DESC`);
const ORDER_BY_CREATED_ASC = stryMutAct_9fa48("76689") ? `` : (stryCov_9fa48("76689"), `${SQL.ORDER_BY} ${DBF.CREATED_AT} ASC`);
const ORDER_BY_CAPTURED_DESC = stryMutAct_9fa48("76690") ? `` : (stryCov_9fa48("76690"), `${SQL.ORDER_BY} ${DPF.CAPTURED_AT} DESC`);

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
    if (stryMutAct_9fa48("76691")) {
      {}
    } else {
      stryCov_9fa48("76691");
      this.sqlQueryEngine = stryMutAct_9fa48("76694") ? options.sqlQueryEngine && null : stryMutAct_9fa48("76693") ? false : stryMutAct_9fa48("76692") ? true : (stryCov_9fa48("76692", "76693", "76694"), options.sqlQueryEngine || null);
      this.now = stryMutAct_9fa48("76697") ? options.now && (() => Date.now()) : stryMutAct_9fa48("76696") ? false : stryMutAct_9fa48("76695") ? true : (stryCov_9fa48("76695", "76696", "76697"), options.now || (stryMutAct_9fa48("76698") ? () => undefined : (stryCov_9fa48("76698"), () => Date.now())));
      this.createSqlRequest = stryMutAct_9fa48("76701") ? options.createSqlRequest && createSqlRequest : stryMutAct_9fa48("76700") ? false : stryMutAct_9fa48("76699") ? true : (stryCov_9fa48("76699", "76700", "76701"), options.createSqlRequest || createSqlRequest);
      this.validateSecurityContext = stryMutAct_9fa48("76704") ? options.validateSecurityContext && validateSecurityContext : stryMutAct_9fa48("76703") ? false : stryMutAct_9fa48("76702") ? true : (stryCov_9fa48("76702", "76703", "76704"), options.validateSecurityContext || validateSecurityContext);
      this.authorizeAction = stryMutAct_9fa48("76707") ? options.authorizeAction && authorizeAction : stryMutAct_9fa48("76706") ? false : stryMutAct_9fa48("76705") ? true : (stryCov_9fa48("76705", "76706", "76707"), options.authorizeAction || authorizeAction);
      this.resolvePolicy = stryMutAct_9fa48("76710") ? options.resolvePolicy && defaultDebugPolicyResolver : stryMutAct_9fa48("76709") ? false : stryMutAct_9fa48("76708") ? true : (stryCov_9fa48("76708", "76709", "76710"), options.resolvePolicy || defaultDebugPolicyResolver);
    }
  }

  /**
   * @param {Object} sqlQueryEngine
   */
  setSqlQueryEngine(sqlQueryEngine) {
    if (stryMutAct_9fa48("76711")) {
      {}
    } else {
      stryCov_9fa48("76711");
      this.sqlQueryEngine = sqlQueryEngine;
    }
  }

  /**
   * Persist a debug session row.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async createSession(request) {
    if (stryMutAct_9fa48("76712")) {
      {}
    } else {
      stryCov_9fa48("76712");
      assertRequestObject(request);
      assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
      assertNonEmptyString(request.serviceName, ERR.SERVICE_NAME_REQUIRED, CODE.INVALID_REQUEST);
      const auth = this.authorizeRequest(request.securityContext, ACTION.CREATE_SESSION);
      const now = this.now();
      const row = stryMutAct_9fa48("76713") ? {} : (stryCov_9fa48("76713"), {
        [DSF.SESSION_ID]: request.sessionId,
        [DSF.TENANT_ID]: auth.tenantId,
        [DSF.SERVICE_NAME]: request.serviceName,
        [DSF.LINEAGE_ID]: stryMutAct_9fa48("76716") ? request.lineageId && null : stryMutAct_9fa48("76715") ? false : stryMutAct_9fa48("76714") ? true : (stryCov_9fa48("76714", "76715", "76716"), request.lineageId || null),
        [DSF.STAGE_ID]: toNullableInteger(request.stageId),
        [DSF.NODE_ID]: stryMutAct_9fa48("76719") ? request.nodeId && null : stryMutAct_9fa48("76718") ? false : stryMutAct_9fa48("76717") ? true : (stryCov_9fa48("76717", "76718", "76719"), request.nodeId || null),
        [DSF.ENDPOINT]: stryMutAct_9fa48("76722") ? request.endpoint && null : stryMutAct_9fa48("76721") ? false : stryMutAct_9fa48("76720") ? true : (stryCov_9fa48("76720", "76721", "76722"), request.endpoint || null),
        [DSF.STATUS]: stryMutAct_9fa48("76725") ? request.status && DEBUG_SESSION_STATUS.ACTIVE : stryMutAct_9fa48("76724") ? false : stryMutAct_9fa48("76723") ? true : (stryCov_9fa48("76723", "76724", "76725"), request.status || DEBUG_SESSION_STATUS.ACTIVE),
        [DSF.CREATED_AT]: now,
        [DSF.UPDATED_AT]: now
      });
      await this.upsertRow(stryMutAct_9fa48("76726") ? {} : (stryCov_9fa48("76726"), {
        tableName: DT.SESSIONS,
        columns: SESSION_COLUMNS,
        row,
        tenantId: auth.tenantId,
        sessionId: request.sessionId
      }));
      return normalizeSessionRow(row);
    }
  }

  /**
   * Update endpoint/stage metadata for an existing session.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async updateSession(request) {
    if (stryMutAct_9fa48("76727")) {
      {}
    } else {
      stryCov_9fa48("76727");
      assertRequestObject(request);
      assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
      const auth = this.authorizeRequest(request.securityContext, ACTION.UPDATE_SESSION);
      const existing = await this.readSessionRow(auth.tenantId, request.sessionId, request.sessionId);
      if (stryMutAct_9fa48("76730") ? false : stryMutAct_9fa48("76729") ? true : stryMutAct_9fa48("76728") ? existing : (stryCov_9fa48("76728", "76729", "76730"), !existing)) {
        if (stryMutAct_9fa48("76731")) {
          {}
        } else {
          stryCov_9fa48("76731");
          throw createDebugMetadataError(CODE.SESSION_NOT_FOUND, ERR.SESSION_NOT_FOUND);
        }
      }
      const row = stryMutAct_9fa48("76732") ? {} : (stryCov_9fa48("76732"), {
        ...existing,
        [DSF.SERVICE_NAME]: stryMutAct_9fa48("76735") ? request.serviceName && existing[DSF.SERVICE_NAME] : stryMutAct_9fa48("76734") ? false : stryMutAct_9fa48("76733") ? true : (stryCov_9fa48("76733", "76734", "76735"), request.serviceName || existing[DSF.SERVICE_NAME]),
        [DSF.LINEAGE_ID]: (stryMutAct_9fa48("76738") ? request.lineageId === undefined : stryMutAct_9fa48("76737") ? false : stryMutAct_9fa48("76736") ? true : (stryCov_9fa48("76736", "76737", "76738"), request.lineageId !== undefined)) ? request.lineageId : existing[DSF.LINEAGE_ID],
        [DSF.STAGE_ID]: (stryMutAct_9fa48("76741") ? request.stageId === undefined : stryMutAct_9fa48("76740") ? false : stryMutAct_9fa48("76739") ? true : (stryCov_9fa48("76739", "76740", "76741"), request.stageId !== undefined)) ? toNullableInteger(request.stageId) : toNullableInteger(existing[DSF.STAGE_ID]),
        [DSF.NODE_ID]: (stryMutAct_9fa48("76744") ? request.nodeId === undefined : stryMutAct_9fa48("76743") ? false : stryMutAct_9fa48("76742") ? true : (stryCov_9fa48("76742", "76743", "76744"), request.nodeId !== undefined)) ? request.nodeId : existing[DSF.NODE_ID],
        [DSF.ENDPOINT]: (stryMutAct_9fa48("76747") ? request.endpoint === undefined : stryMutAct_9fa48("76746") ? false : stryMutAct_9fa48("76745") ? true : (stryCov_9fa48("76745", "76746", "76747"), request.endpoint !== undefined)) ? request.endpoint : existing[DSF.ENDPOINT],
        [DSF.STATUS]: stryMutAct_9fa48("76750") ? request.status && existing[DSF.STATUS] : stryMutAct_9fa48("76749") ? false : stryMutAct_9fa48("76748") ? true : (stryCov_9fa48("76748", "76749", "76750"), request.status || existing[DSF.STATUS]),
        [DSF.UPDATED_AT]: this.now()
      });
      await this.upsertRow(stryMutAct_9fa48("76751") ? {} : (stryCov_9fa48("76751"), {
        tableName: DT.SESSIONS,
        columns: SESSION_COLUMNS,
        row,
        tenantId: auth.tenantId,
        sessionId: request.sessionId
      }));
      return normalizeSessionRow(row);
    }
  }

  /**
   * Backward-compatible alias for updateSession.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async updateSessionEndpoint(request) {
    if (stryMutAct_9fa48("76752")) {
      {}
    } else {
      stryCov_9fa48("76752");
      return this.updateSession(request);
    }
  }

  /**
   * Detach an existing session by updating status/endpoint metadata.
   * Session metadata remains SQL-owned for auditability.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async detachSession(request) {
    if (stryMutAct_9fa48("76753")) {
      {}
    } else {
      stryCov_9fa48("76753");
      assertRequestObject(request);
      assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
      this.authorizeRequest(request.securityContext, ACTION.DETACH_SESSION);
      return this.updateSession(stryMutAct_9fa48("76754") ? {} : (stryCov_9fa48("76754"), {
        ...request,
        status: DEBUG_SESSION_STATUS.DETACHED,
        endpoint: null,
        nodeId: null
      }));
    }
  }

  /**
   * Authorize and resolve one session for debugger attach.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async attachSession(request) {
    if (stryMutAct_9fa48("76755")) {
      {}
    } else {
      stryCov_9fa48("76755");
      assertRequestObject(request);
      assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
      const auth = this.authorizeRequest(request.securityContext, ACTION.ATTACH_SESSION);
      const row = await this.readSessionRow(auth.tenantId, request.sessionId, request.sessionId);
      if (stryMutAct_9fa48("76758") ? false : stryMutAct_9fa48("76757") ? true : stryMutAct_9fa48("76756") ? row : (stryCov_9fa48("76756", "76757", "76758"), !row)) {
        if (stryMutAct_9fa48("76759")) {
          {}
        } else {
          stryCov_9fa48("76759");
          throw createDebugMetadataError(CODE.SESSION_NOT_FOUND, ERR.SESSION_NOT_FOUND);
        }
      }
      return normalizeSessionRow(row);
    }
  }

  /**
   * Read a tenant-scoped debug session.
   * @param {Object} request
   * @return {Promise<Object|null>}
   */
  async getSession(request) {
    if (stryMutAct_9fa48("76760")) {
      {}
    } else {
      stryCov_9fa48("76760");
      assertRequestObject(request);
      assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
      const auth = this.authorizeRequest(request.securityContext, ACTION.ATTACH_SESSION);
      const row = await this.readSessionRow(auth.tenantId, request.sessionId, request.sessionId);
      return row ? normalizeSessionRow(row) : null;
    }
  }

  /**
   * List tenant-scoped sessions.
   * @param {Object} request
   * @return {Promise<Array<Object>>}
   */
  async listSessions(request) {
    if (stryMutAct_9fa48("76761")) {
      {}
    } else {
      stryCov_9fa48("76761");
      assertRequestObject(request);
      const auth = this.authorizeRequest(request.securityContext, ACTION.LIST_SESSIONS);
      const limit = normalizeLimit(request.limit, LIMIT.SESSIONS);
      const filters = stryMutAct_9fa48("76762") ? [] : (stryCov_9fa48("76762"), [stryMutAct_9fa48("76763") ? `` : (stryCov_9fa48("76763"), `${DSF.TENANT_ID} = ?1`)]);
      const params = stryMutAct_9fa48("76764") ? [] : (stryCov_9fa48("76764"), [auth.tenantId]);
      if (stryMutAct_9fa48("76766") ? false : stryMutAct_9fa48("76765") ? true : (stryCov_9fa48("76765", "76766"), request.serviceName)) {
        if (stryMutAct_9fa48("76767")) {
          {}
        } else {
          stryCov_9fa48("76767");
          params.push(request.serviceName);
          filters.push(stryMutAct_9fa48("76768") ? `` : (stryCov_9fa48("76768"), `${DSF.SERVICE_NAME} = ?${params.length}`));
        }
      }
      if (stryMutAct_9fa48("76770") ? false : stryMutAct_9fa48("76769") ? true : (stryCov_9fa48("76769", "76770"), request.lineageId)) {
        if (stryMutAct_9fa48("76771")) {
          {}
        } else {
          stryCov_9fa48("76771");
          params.push(request.lineageId);
          filters.push(stryMutAct_9fa48("76772") ? `` : (stryCov_9fa48("76772"), `${DSF.LINEAGE_ID} = ?${params.length}`));
        }
      }
      const sql = (stryMutAct_9fa48("76773") ? `` : (stryCov_9fa48("76773"), `${SQL.SELECT} * FROM ${DT.SESSIONS}`)) + (stryMutAct_9fa48("76774") ? `` : (stryCov_9fa48("76774"), ` ${SQL.WHERE} ${filters.join(stryMutAct_9fa48("76775") ? `` : (stryCov_9fa48("76775"), ` ${SQL.AND} `))}`)) + (stryMutAct_9fa48("76776") ? `` : (stryCov_9fa48("76776"), ` ${ORDER_BY_UPDATED_DESC}`)) + (stryMutAct_9fa48("76777") ? `` : (stryCov_9fa48("76777"), `${DSQL.LIMIT}${limit}`));
      const result = await this.executeSql(stryMutAct_9fa48("76778") ? {} : (stryCov_9fa48("76778"), {
        statement: sql,
        parameters: params,
        tenantId: auth.tenantId,
        sessionId: stryMutAct_9fa48("76781") ? request.sessionId && auth.tenantId : stryMutAct_9fa48("76780") ? false : stryMutAct_9fa48("76779") ? true : (stryCov_9fa48("76779", "76780", "76781"), request.sessionId || auth.tenantId)
      }));
      const rows = Array.isArray(result.rows) ? result.rows : stryMutAct_9fa48("76782") ? ["Stryker was here"] : (stryCov_9fa48("76782"), []);
      return rows.map(stryMutAct_9fa48("76783") ? () => undefined : (stryCov_9fa48("76783"), row => normalizeSessionRow(row)));
    }
  }

  /**
   * Persist breakpoint rows for a session.
   * @param {Object} request
   * @return {Promise<Array<Object>>}
   */
  async writeBreakpoints(request) {
    if (stryMutAct_9fa48("76784")) {
      {}
    } else {
      stryCov_9fa48("76784");
      assertRequestObject(request);
      assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
      if (stryMutAct_9fa48("76787") ? false : stryMutAct_9fa48("76786") ? true : stryMutAct_9fa48("76785") ? Array.isArray(request.breakpoints) : (stryCov_9fa48("76785", "76786", "76787"), !Array.isArray(request.breakpoints))) {
        if (stryMutAct_9fa48("76788")) {
          {}
        } else {
          stryCov_9fa48("76788");
          throw createDebugMetadataError(CODE.BREAKPOINTS_REQUIRED, ERR.BREAKPOINTS_REQUIRED);
        }
      }
      const auth = this.authorizeRequest(request.securityContext, ACTION.WRITE_BREAKPOINTS);
      const sessionRow = await this.readSessionRow(auth.tenantId, request.sessionId, request.sessionId);
      if (stryMutAct_9fa48("76791") ? false : stryMutAct_9fa48("76790") ? true : stryMutAct_9fa48("76789") ? sessionRow : (stryCov_9fa48("76789", "76790", "76791"), !sessionRow)) {
        if (stryMutAct_9fa48("76792")) {
          {}
        } else {
          stryCov_9fa48("76792");
          throw createDebugMetadataError(CODE.SESSION_NOT_FOUND, ERR.SESSION_NOT_FOUND);
        }
      }
      const now = this.now();
      const rows = stryMutAct_9fa48("76793") ? ["Stryker was here"] : (stryCov_9fa48("76793"), []);
      for (let index = NUM.ZERO; stryMutAct_9fa48("76796") ? index >= request.breakpoints.length : stryMutAct_9fa48("76795") ? index <= request.breakpoints.length : stryMutAct_9fa48("76794") ? false : (stryCov_9fa48("76794", "76795", "76796"), index < request.breakpoints.length); stryMutAct_9fa48("76797") ? index-- : (stryCov_9fa48("76797"), index++)) {
        if (stryMutAct_9fa48("76798")) {
          {}
        } else {
          stryCov_9fa48("76798");
          const breakpoint = stryMutAct_9fa48("76801") ? request.breakpoints[index] && {} : stryMutAct_9fa48("76800") ? false : stryMutAct_9fa48("76799") ? true : (stryCov_9fa48("76799", "76800", "76801"), request.breakpoints[index] || {});
          const lineNumber = toNullableInteger(breakpoint.lineNumber);
          if (stryMutAct_9fa48("76804") ? lineNumber !== null : stryMutAct_9fa48("76803") ? false : stryMutAct_9fa48("76802") ? true : (stryCov_9fa48("76802", "76803", "76804"), lineNumber === null)) {
            if (stryMutAct_9fa48("76805")) {
              {}
            } else {
              stryCov_9fa48("76805");
              throw createDebugMetadataError(CODE.INVALID_REQUEST, stryMutAct_9fa48("76806") ? "" : (stryCov_9fa48("76806"), 'lineNumber is required for each breakpoint'));
            }
          }
          const columnNumber = stryMutAct_9fa48("76807") ? toNullableInteger(breakpoint.columnNumber) && DEF.COLUMN_NUMBER : (stryCov_9fa48("76807"), toNullableInteger(breakpoint.columnNumber) ?? DEF.COLUMN_NUMBER);
          const moduleRef = stryMutAct_9fa48("76810") ? request.moduleRef && breakpoint.moduleRef : stryMutAct_9fa48("76809") ? false : stryMutAct_9fa48("76808") ? true : (stryCov_9fa48("76808", "76809", "76810"), request.moduleRef || breakpoint.moduleRef);
          const sourceFileUrl = stryMutAct_9fa48("76813") ? request.sourceFileUrl && breakpoint.sourceFileUrl : stryMutAct_9fa48("76812") ? false : stryMutAct_9fa48("76811") ? true : (stryCov_9fa48("76811", "76812", "76813"), request.sourceFileUrl || breakpoint.sourceFileUrl);
          assertNonEmptyString(moduleRef, stryMutAct_9fa48("76814") ? "" : (stryCov_9fa48("76814"), 'moduleRef is required for breakpoints'), CODE.INVALID_REQUEST);
          assertNonEmptyString(sourceFileUrl, stryMutAct_9fa48("76815") ? "" : (stryCov_9fa48("76815"), 'sourceFileUrl is required for breakpoints'), CODE.INVALID_REQUEST);
          const row = stryMutAct_9fa48("76816") ? {} : (stryCov_9fa48("76816"), {
            [DBF.BREAKPOINT_ID]: stryMutAct_9fa48("76819") ? breakpoint.breakpointId && buildBreakpointId(request.sessionId, index, lineNumber, columnNumber) : stryMutAct_9fa48("76818") ? false : stryMutAct_9fa48("76817") ? true : (stryCov_9fa48("76817", "76818", "76819"), breakpoint.breakpointId || buildBreakpointId(request.sessionId, index, lineNumber, columnNumber)),
            [DBF.SESSION_ID]: request.sessionId,
            [DBF.TENANT_ID]: auth.tenantId,
            [DBF.MODULE_REF]: moduleRef,
            [DBF.SOURCE_FILE_URL]: sourceFileUrl,
            [DBF.LINE_NUMBER]: lineNumber,
            [DBF.COLUMN_NUMBER]: columnNumber,
            [DBF.CONDITION]: stryMutAct_9fa48("76822") ? breakpoint.condition && null : stryMutAct_9fa48("76821") ? false : stryMutAct_9fa48("76820") ? true : (stryCov_9fa48("76820", "76821", "76822"), breakpoint.condition || null),
            [DBF.RESOLVED]: toResolvedFlag(breakpoint.resolved),
            [DBF.CREATED_AT]: stryMutAct_9fa48("76825") ? toNullableInteger(breakpoint.createdAt) && now : stryMutAct_9fa48("76824") ? false : stryMutAct_9fa48("76823") ? true : (stryCov_9fa48("76823", "76824", "76825"), toNullableInteger(breakpoint.createdAt) || now),
            [DBF.UPDATED_AT]: now
          });
          await this.upsertRow(stryMutAct_9fa48("76826") ? {} : (stryCov_9fa48("76826"), {
            tableName: DT.BREAKPOINTS,
            columns: BREAKPOINT_COLUMNS,
            row,
            tenantId: auth.tenantId,
            sessionId: request.sessionId
          }));
          rows.push(normalizeBreakpointRow(row));
        }
      }
      return rows;
    }
  }

  /**
   * List breakpoints for one tenant/session pair.
   * @param {Object} request
   * @return {Promise<Array<Object>>}
   */
  async listBreakpoints(request) {
    if (stryMutAct_9fa48("76827")) {
      {}
    } else {
      stryCov_9fa48("76827");
      assertRequestObject(request);
      assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
      const auth = this.authorizeRequest(request.securityContext, ACTION.READ_BREAKPOINTS);
      const limit = normalizeLimit(request.limit, LIMIT.BREAKPOINTS);
      const sql = (stryMutAct_9fa48("76828") ? `` : (stryCov_9fa48("76828"), `${SQL.SELECT} * FROM ${DT.BREAKPOINTS}`)) + (stryMutAct_9fa48("76829") ? `` : (stryCov_9fa48("76829"), ` ${SQL.WHERE} ${DBF.TENANT_ID} = ?1`)) + (stryMutAct_9fa48("76830") ? `` : (stryCov_9fa48("76830"), ` ${SQL.AND} ${DBF.SESSION_ID} = ?2`)) + (stryMutAct_9fa48("76831") ? `` : (stryCov_9fa48("76831"), ` ${ORDER_BY_CREATED_ASC}`)) + (stryMutAct_9fa48("76832") ? `` : (stryCov_9fa48("76832"), `${DSQL.LIMIT}${limit}`));
      const result = await this.executeSql(stryMutAct_9fa48("76833") ? {} : (stryCov_9fa48("76833"), {
        statement: sql,
        parameters: stryMutAct_9fa48("76834") ? [] : (stryCov_9fa48("76834"), [auth.tenantId, request.sessionId]),
        tenantId: auth.tenantId,
        sessionId: request.sessionId
      }));
      const rows = Array.isArray(result.rows) ? result.rows : stryMutAct_9fa48("76835") ? ["Stryker was here"] : (stryCov_9fa48("76835"), []);
      return rows.map(stryMutAct_9fa48("76836") ? () => undefined : (stryCov_9fa48("76836"), row => normalizeBreakpointRow(row)));
    }
  }

  /**
   * Persist one serialized snapshot artifact.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async writeSnapshot(request) {
    if (stryMutAct_9fa48("76837")) {
      {}
    } else {
      stryCov_9fa48("76837");
      assertRequestObject(request);
      assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
      if (stryMutAct_9fa48("76840") ? !request.snapshotArtifact && typeof request.snapshotArtifact !== TYPEOF.OBJECT : stryMutAct_9fa48("76839") ? false : stryMutAct_9fa48("76838") ? true : (stryCov_9fa48("76838", "76839", "76840"), (stryMutAct_9fa48("76841") ? request.snapshotArtifact : (stryCov_9fa48("76841"), !request.snapshotArtifact)) || (stryMutAct_9fa48("76843") ? typeof request.snapshotArtifact === TYPEOF.OBJECT : stryMutAct_9fa48("76842") ? false : (stryCov_9fa48("76842", "76843"), typeof request.snapshotArtifact !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("76844")) {
          {}
        } else {
          stryCov_9fa48("76844");
          throw createDebugMetadataError(CODE.INVALID_REQUEST, ERR.SNAPSHOT_REQUIRED);
        }
      }
      const auth = this.authorizeRequest(request.securityContext, ACTION.WRITE_SNAPSHOT);
      const sessionRow = await this.readSessionRow(auth.tenantId, request.sessionId, request.sessionId);
      if (stryMutAct_9fa48("76847") ? false : stryMutAct_9fa48("76846") ? true : stryMutAct_9fa48("76845") ? sessionRow : (stryCov_9fa48("76845", "76846", "76847"), !sessionRow)) {
        if (stryMutAct_9fa48("76848")) {
          {}
        } else {
          stryCov_9fa48("76848");
          throw createDebugMetadataError(CODE.SESSION_NOT_FOUND, ERR.SESSION_NOT_FOUND);
        }
      }
      const artifact = request.snapshotArtifact;
      const manifest = stryMutAct_9fa48("76851") ? artifact.manifest && {} : stryMutAct_9fa48("76850") ? false : stryMutAct_9fa48("76849") ? true : (stryCov_9fa48("76849", "76850", "76851"), artifact.manifest || {});
      const snapshot = stryMutAct_9fa48("76854") ? artifact.snapshot && {} : stryMutAct_9fa48("76853") ? false : stryMutAct_9fa48("76852") ? true : (stryCov_9fa48("76852", "76853", "76854"), artifact.snapshot || {});
      const envelope = normalizeEnvelopeBuffer(artifact.envelope);
      const now = this.now();
      const row = stryMutAct_9fa48("76855") ? {} : (stryCov_9fa48("76855"), {
        [DPF.SNAPSHOT_ID]: stryMutAct_9fa48("76858") ? (request.snapshotId || manifest.snapshotId || snapshot.snapshotId) && crypto.randomUUID() : stryMutAct_9fa48("76857") ? false : stryMutAct_9fa48("76856") ? true : (stryCov_9fa48("76856", "76857", "76858"), (stryMutAct_9fa48("76860") ? (request.snapshotId || manifest.snapshotId) && snapshot.snapshotId : stryMutAct_9fa48("76859") ? false : (stryCov_9fa48("76859", "76860"), (stryMutAct_9fa48("76862") ? request.snapshotId && manifest.snapshotId : stryMutAct_9fa48("76861") ? false : (stryCov_9fa48("76861", "76862"), request.snapshotId || manifest.snapshotId)) || snapshot.snapshotId)) || crypto.randomUUID()),
        [DPF.SESSION_ID]: request.sessionId,
        [DSF.TENANT_ID]: auth.tenantId,
        [DPF.MODULE_REF]: stryMutAct_9fa48("76865") ? (request.moduleRef || snapshot.moduleRef || manifest.moduleRef) && null : stryMutAct_9fa48("76864") ? false : stryMutAct_9fa48("76863") ? true : (stryCov_9fa48("76863", "76864", "76865"), (stryMutAct_9fa48("76867") ? (request.moduleRef || snapshot.moduleRef) && manifest.moduleRef : stryMutAct_9fa48("76866") ? false : (stryCov_9fa48("76866", "76867"), (stryMutAct_9fa48("76869") ? request.moduleRef && snapshot.moduleRef : stryMutAct_9fa48("76868") ? false : (stryCov_9fa48("76868", "76869"), request.moduleRef || snapshot.moduleRef)) || manifest.moduleRef)) || null),
        [DPF.MODULE_DIGEST]: stryMutAct_9fa48("76872") ? (request.moduleDigest || snapshot.moduleDigest || manifest.moduleDigest) && null : stryMutAct_9fa48("76871") ? false : stryMutAct_9fa48("76870") ? true : (stryCov_9fa48("76870", "76871", "76872"), (stryMutAct_9fa48("76874") ? (request.moduleDigest || snapshot.moduleDigest) && manifest.moduleDigest : stryMutAct_9fa48("76873") ? false : (stryCov_9fa48("76873", "76874"), (stryMutAct_9fa48("76876") ? request.moduleDigest && snapshot.moduleDigest : stryMutAct_9fa48("76875") ? false : (stryCov_9fa48("76875", "76876"), request.moduleDigest || snapshot.moduleDigest)) || manifest.moduleDigest)) || null),
        [DPF.CAPTURED_AT]: stryMutAct_9fa48("76879") ? toNullableInteger(request.capturedAt || snapshot.capturedAt || manifest.capturedAt) && now : stryMutAct_9fa48("76878") ? false : stryMutAct_9fa48("76877") ? true : (stryCov_9fa48("76877", "76878", "76879"), toNullableInteger(stryMutAct_9fa48("76882") ? (request.capturedAt || snapshot.capturedAt) && manifest.capturedAt : stryMutAct_9fa48("76881") ? false : stryMutAct_9fa48("76880") ? true : (stryCov_9fa48("76880", "76881", "76882"), (stryMutAct_9fa48("76884") ? request.capturedAt && snapshot.capturedAt : stryMutAct_9fa48("76883") ? false : (stryCov_9fa48("76883", "76884"), request.capturedAt || snapshot.capturedAt)) || manifest.capturedAt)) || now),
        [DPF.FORMAT_VERSION]: stryMutAct_9fa48("76887") ? toNullableInteger(request.formatVersion || snapshot.formatVersion || manifest.formatVersion) && 1 : stryMutAct_9fa48("76886") ? false : stryMutAct_9fa48("76885") ? true : (stryCov_9fa48("76885", "76886", "76887"), toNullableInteger(stryMutAct_9fa48("76890") ? (request.formatVersion || snapshot.formatVersion) && manifest.formatVersion : stryMutAct_9fa48("76889") ? false : stryMutAct_9fa48("76888") ? true : (stryCov_9fa48("76888", "76889", "76890"), (stryMutAct_9fa48("76892") ? request.formatVersion && snapshot.formatVersion : stryMutAct_9fa48("76891") ? false : (stryCov_9fa48("76891", "76892"), request.formatVersion || snapshot.formatVersion)) || manifest.formatVersion)) || 1),
        [DPF.SNAPSHOT_BYTES_BASE64]: envelope.toString(stryMutAct_9fa48("76893") ? "" : (stryCov_9fa48("76893"), 'base64')),
        [DPF.MANIFEST_JSON]: JSON.stringify(manifest),
        [DPF.TOTAL_BYTES]: stryMutAct_9fa48("76896") ? toNullableInteger(request.totalBytes || manifest.totalBytes || snapshot.totalBytes) && envelope.length : stryMutAct_9fa48("76895") ? false : stryMutAct_9fa48("76894") ? true : (stryCov_9fa48("76894", "76895", "76896"), toNullableInteger(stryMutAct_9fa48("76899") ? (request.totalBytes || manifest.totalBytes) && snapshot.totalBytes : stryMutAct_9fa48("76898") ? false : stryMutAct_9fa48("76897") ? true : (stryCov_9fa48("76897", "76898", "76899"), (stryMutAct_9fa48("76901") ? request.totalBytes && manifest.totalBytes : stryMutAct_9fa48("76900") ? false : (stryCov_9fa48("76900", "76901"), request.totalBytes || manifest.totalBytes)) || snapshot.totalBytes)) || envelope.length),
        [DPF.FRAME_COUNT]: stryMutAct_9fa48("76904") ? toNullableInteger(request.frameCount || manifest.frameCount || snapshot.inputFrames?.length) && NUM.ZERO : stryMutAct_9fa48("76903") ? false : stryMutAct_9fa48("76902") ? true : (stryCov_9fa48("76902", "76903", "76904"), toNullableInteger(stryMutAct_9fa48("76907") ? (request.frameCount || manifest.frameCount) && snapshot.inputFrames?.length : stryMutAct_9fa48("76906") ? false : stryMutAct_9fa48("76905") ? true : (stryCov_9fa48("76905", "76906", "76907"), (stryMutAct_9fa48("76909") ? request.frameCount && manifest.frameCount : stryMutAct_9fa48("76908") ? false : (stryCov_9fa48("76908", "76909"), request.frameCount || manifest.frameCount)) || (stryMutAct_9fa48("76910") ? snapshot.inputFrames.length : (stryCov_9fa48("76910"), snapshot.inputFrames?.length)))) || NUM.ZERO),
        [DPF.HOST_CALL_COUNT]: stryMutAct_9fa48("76913") ? toNullableInteger(request.hostCallCount || manifest.hostCallCount || snapshot.hostCallLedger?.length) && NUM.ZERO : stryMutAct_9fa48("76912") ? false : stryMutAct_9fa48("76911") ? true : (stryCov_9fa48("76911", "76912", "76913"), toNullableInteger(stryMutAct_9fa48("76916") ? (request.hostCallCount || manifest.hostCallCount) && snapshot.hostCallLedger?.length : stryMutAct_9fa48("76915") ? false : stryMutAct_9fa48("76914") ? true : (stryCov_9fa48("76914", "76915", "76916"), (stryMutAct_9fa48("76918") ? request.hostCallCount && manifest.hostCallCount : stryMutAct_9fa48("76917") ? false : (stryCov_9fa48("76917", "76918"), request.hostCallCount || manifest.hostCallCount)) || (stryMutAct_9fa48("76919") ? snapshot.hostCallLedger.length : (stryCov_9fa48("76919"), snapshot.hostCallLedger?.length)))) || NUM.ZERO),
        [DPF.CREATED_AT]: now,
        [DPF.UPDATED_AT]: now
      });
      assertNonEmptyString(row[DPF.MODULE_REF], stryMutAct_9fa48("76920") ? "" : (stryCov_9fa48("76920"), 'moduleRef is required for snapshot metadata'), CODE.INVALID_REQUEST);
      assertNonEmptyString(row[DPF.MODULE_DIGEST], stryMutAct_9fa48("76921") ? "" : (stryCov_9fa48("76921"), 'moduleDigest is required for snapshot metadata'), CODE.INVALID_REQUEST);
      await this.upsertRow(stryMutAct_9fa48("76922") ? {} : (stryCov_9fa48("76922"), {
        tableName: DT.SNAPSHOTS,
        columns: SNAPSHOT_COLUMNS,
        row,
        tenantId: auth.tenantId,
        sessionId: request.sessionId
      }));
      return normalizeSnapshotRow(row, stryMutAct_9fa48("76923") ? false : (stryCov_9fa48("76923"), true));
    }
  }

  /**
   * Read one snapshot by ID with tenant isolation.
   * @param {Object} request
   * @return {Promise<Object|null>}
   */
  async getSnapshot(request) {
    if (stryMutAct_9fa48("76924")) {
      {}
    } else {
      stryCov_9fa48("76924");
      assertRequestObject(request);
      assertNonEmptyString(request.snapshotId, stryMutAct_9fa48("76925") ? "" : (stryCov_9fa48("76925"), 'snapshotId is required'), CODE.INVALID_REQUEST);
      const auth = this.authorizeRequest(request.securityContext, ACTION.READ_SNAPSHOT);
      const sql = (stryMutAct_9fa48("76926") ? `` : (stryCov_9fa48("76926"), `${SQL.SELECT} * FROM ${DT.SNAPSHOTS}`)) + (stryMutAct_9fa48("76927") ? `` : (stryCov_9fa48("76927"), ` ${SQL.WHERE} ${DPF.SNAPSHOT_ID} = ?1`)) + (stryMutAct_9fa48("76928") ? `` : (stryCov_9fa48("76928"), ` ${SQL.AND} ${DSF.TENANT_ID} = ?2`)) + (stryMutAct_9fa48("76929") ? `` : (stryCov_9fa48("76929"), ` ${SQL.LIMIT} 1`));
      const result = await this.executeSql(stryMutAct_9fa48("76930") ? {} : (stryCov_9fa48("76930"), {
        statement: sql,
        parameters: stryMutAct_9fa48("76931") ? [] : (stryCov_9fa48("76931"), [request.snapshotId, auth.tenantId]),
        tenantId: auth.tenantId,
        sessionId: stryMutAct_9fa48("76934") ? request.sessionId && request.snapshotId : stryMutAct_9fa48("76933") ? false : stryMutAct_9fa48("76932") ? true : (stryCov_9fa48("76932", "76933", "76934"), request.sessionId || request.snapshotId)
      }));
      const row = Array.isArray(result.rows) ? stryMutAct_9fa48("76937") ? result.rows[NUM.ZERO] && null : stryMutAct_9fa48("76936") ? false : stryMutAct_9fa48("76935") ? true : (stryCov_9fa48("76935", "76936", "76937"), result.rows[NUM.ZERO] || null) : null;
      if (stryMutAct_9fa48("76940") ? false : stryMutAct_9fa48("76939") ? true : stryMutAct_9fa48("76938") ? row : (stryCov_9fa48("76938", "76939", "76940"), !row)) {
        if (stryMutAct_9fa48("76941")) {
          {}
        } else {
          stryCov_9fa48("76941");
          return null;
        }
      }
      const includeEnvelope = stryMutAct_9fa48("76944") ? request.includeEnvelope === false : stryMutAct_9fa48("76943") ? false : stryMutAct_9fa48("76942") ? true : (stryCov_9fa48("76942", "76943", "76944"), request.includeEnvelope !== (stryMutAct_9fa48("76945") ? true : (stryCov_9fa48("76945"), false)));
      return normalizeSnapshotRow(row, includeEnvelope);
    }
  }

  /**
   * List snapshot metadata for one session.
   * @param {Object} request
   * @return {Promise<Array<Object>>}
   */
  async listSnapshots(request) {
    if (stryMutAct_9fa48("76946")) {
      {}
    } else {
      stryCov_9fa48("76946");
      assertRequestObject(request);
      assertNonEmptyString(request.sessionId, ERR.SESSION_ID_REQUIRED, CODE.INVALID_REQUEST);
      const auth = this.authorizeRequest(request.securityContext, ACTION.LIST_SNAPSHOTS);
      const limit = normalizeLimit(request.limit, LIMIT.SNAPSHOTS);
      const sql = (stryMutAct_9fa48("76947") ? `` : (stryCov_9fa48("76947"), `${SQL.SELECT} * FROM ${DT.SNAPSHOTS}`)) + (stryMutAct_9fa48("76948") ? `` : (stryCov_9fa48("76948"), ` ${SQL.WHERE} ${DSF.TENANT_ID} = ?1`)) + (stryMutAct_9fa48("76949") ? `` : (stryCov_9fa48("76949"), ` ${SQL.AND} ${DPF.SESSION_ID} = ?2`)) + (stryMutAct_9fa48("76950") ? `` : (stryCov_9fa48("76950"), ` ${ORDER_BY_CAPTURED_DESC}`)) + (stryMutAct_9fa48("76951") ? `` : (stryCov_9fa48("76951"), `${DSQL.LIMIT}${limit}`));
      const result = await this.executeSql(stryMutAct_9fa48("76952") ? {} : (stryCov_9fa48("76952"), {
        statement: sql,
        parameters: stryMutAct_9fa48("76953") ? [] : (stryCov_9fa48("76953"), [auth.tenantId, request.sessionId]),
        tenantId: auth.tenantId,
        sessionId: request.sessionId
      }));
      const rows = Array.isArray(result.rows) ? result.rows : stryMutAct_9fa48("76954") ? ["Stryker was here"] : (stryCov_9fa48("76954"), []);
      return rows.map(stryMutAct_9fa48("76955") ? () => undefined : (stryCov_9fa48("76955"), row => normalizeSnapshotRow(row, stryMutAct_9fa48("76956") ? true : (stryCov_9fa48("76956"), false))));
    }
  }

  /**
   * @param {Object} securityContext
   * @param {string} action
   * @return {Object}
   */
  authorizeRequest(securityContext, action) {
    if (stryMutAct_9fa48("76957")) {
      {}
    } else {
      stryCov_9fa48("76957");
      if (stryMutAct_9fa48("76960") ? false : stryMutAct_9fa48("76959") ? true : stryMutAct_9fa48("76958") ? securityContext : (stryCov_9fa48("76958", "76959", "76960"), !securityContext)) {
        if (stryMutAct_9fa48("76961")) {
          {}
        } else {
          stryCov_9fa48("76961");
          throw createDebugMetadataError(CODE.INVALID_CONTEXT, ERR.SECURITY_CONTEXT_REQUIRED);
        }
      }
      const validation = this.validateSecurityContext(securityContext);
      if (stryMutAct_9fa48("76964") ? false : stryMutAct_9fa48("76963") ? true : stryMutAct_9fa48("76962") ? validation.valid : (stryCov_9fa48("76962", "76963", "76964"), !validation.valid)) {
        if (stryMutAct_9fa48("76965")) {
          {}
        } else {
          stryCov_9fa48("76965");
          throw createDebugMetadataError(CODE.INVALID_CONTEXT, stryMutAct_9fa48("76968") ? validation.error && ERR.SECURITY_CONTEXT_REQUIRED : stryMutAct_9fa48("76967") ? false : stryMutAct_9fa48("76966") ? true : (stryCov_9fa48("76966", "76967", "76968"), validation.error || ERR.SECURITY_CONTEXT_REQUIRED));
        }
      }
      const policy = this.resolvePolicy(validation, action);
      const authResult = this.authorizeAction(securityContext, action, policy);
      if (stryMutAct_9fa48("76971") ? false : stryMutAct_9fa48("76970") ? true : stryMutAct_9fa48("76969") ? authResult.authorized : (stryCov_9fa48("76969", "76970", "76971"), !authResult.authorized)) {
        if (stryMutAct_9fa48("76972")) {
          {}
        } else {
          stryCov_9fa48("76972");
          throw createDebugMetadataError(CODE.UNAUTHORIZED, stryMutAct_9fa48("76975") ? authResult.error && ERR.AUTHORIZATION_FAILED : stryMutAct_9fa48("76974") ? false : stryMutAct_9fa48("76973") ? true : (stryCov_9fa48("76973", "76974", "76975"), authResult.error || ERR.AUTHORIZATION_FAILED));
        }
      }
      return validation;
    }
  }

  /**
   * Execute a canonical SqlRequest.
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async executeSql(request) {
    if (stryMutAct_9fa48("76976")) {
      {}
    } else {
      stryCov_9fa48("76976");
      if (stryMutAct_9fa48("76979") ? !this.sqlQueryEngine && typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION : stryMutAct_9fa48("76978") ? false : stryMutAct_9fa48("76977") ? true : (stryCov_9fa48("76977", "76978", "76979"), (stryMutAct_9fa48("76980") ? this.sqlQueryEngine : (stryCov_9fa48("76980"), !this.sqlQueryEngine)) || (stryMutAct_9fa48("76982") ? typeof this.sqlQueryEngine.executeRequest === TYPEOF.FUNCTION : stryMutAct_9fa48("76981") ? false : (stryCov_9fa48("76981", "76982"), typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("76983")) {
          {}
        } else {
          stryCov_9fa48("76983");
          throw createDebugMetadataError(CODE.ENGINE_REQUIRED, ERR.ENGINE_REQUIRED);
        }
      }
      const sqlRequest = this.createSqlRequest(stryMutAct_9fa48("76984") ? {} : (stryCov_9fa48("76984"), {
        statement: request.statement,
        parameters: stryMutAct_9fa48("76987") ? request.parameters && [] : stryMutAct_9fa48("76986") ? false : stryMutAct_9fa48("76985") ? true : (stryCov_9fa48("76985", "76986", "76987"), request.parameters || (stryMutAct_9fa48("76988") ? ["Stryker was here"] : (stryCov_9fa48("76988"), []))),
        tenantId: request.tenantId,
        sessionId: stryMutAct_9fa48("76991") ? request.sessionId && `${DEF.SESSION_ID_PREFIX}-${this.now()}` : stryMutAct_9fa48("76990") ? false : stryMutAct_9fa48("76989") ? true : (stryCov_9fa48("76989", "76990", "76991"), request.sessionId || (stryMutAct_9fa48("76992") ? `` : (stryCov_9fa48("76992"), `${DEF.SESSION_ID_PREFIX}-${this.now()}`)))
      }));
      const result = await this.sqlQueryEngine.executeRequest(sqlRequest);
      if (stryMutAct_9fa48("76995") ? result || result.success === false : stryMutAct_9fa48("76994") ? false : stryMutAct_9fa48("76993") ? true : (stryCov_9fa48("76993", "76994", "76995"), result && (stryMutAct_9fa48("76997") ? result.success !== false : stryMutAct_9fa48("76996") ? true : (stryCov_9fa48("76996", "76997"), result.success === (stryMutAct_9fa48("76998") ? true : (stryCov_9fa48("76998"), false)))))) {
        if (stryMutAct_9fa48("76999")) {
          {}
        } else {
          stryCov_9fa48("76999");
          throw createDebugMetadataError(CODE.INVALID_REQUEST, stryMutAct_9fa48("77002") ? result.error && 'SQL request failed' : stryMutAct_9fa48("77001") ? false : stryMutAct_9fa48("77000") ? true : (stryCov_9fa48("77000", "77001", "77002"), result.error || (stryMutAct_9fa48("77003") ? "" : (stryCov_9fa48("77003"), 'SQL request failed'))));
        }
      }
      return result;
    }
  }

  /**
   * Insert/replace one row.
   * @param {Object} request
   * @return {Promise<void>}
   */
  async upsertRow(request) {
    if (stryMutAct_9fa48("77004")) {
      {}
    } else {
      stryCov_9fa48("77004");
      const placeholders = buildPlaceholders(request.columns.length);
      const sql = (stryMutAct_9fa48("77005") ? `` : (stryCov_9fa48("77005"), `${DSQL.INSERT_OR_REPLACE_INTO} ${request.tableName}`)) + (stryMutAct_9fa48("77006") ? `` : (stryCov_9fa48("77006"), ` (${request.columns.join(stryMutAct_9fa48("77007") ? "" : (stryCov_9fa48("77007"), ', '))})`)) + (stryMutAct_9fa48("77008") ? `` : (stryCov_9fa48("77008"), ` ${SQL.VALUES} (${placeholders})`));
      const parameters = request.columns.map(stryMutAct_9fa48("77009") ? () => undefined : (stryCov_9fa48("77009"), columnName => request.row[columnName]));
      await this.executeSql(stryMutAct_9fa48("77010") ? {} : (stryCov_9fa48("77010"), {
        statement: sql,
        parameters,
        tenantId: request.tenantId,
        sessionId: request.sessionId
      }));
    }
  }

  /**
   * Read one session row by tenant + session ID.
   * @param {string} tenantId
   * @param {string} sessionId
   * @param {string} sqlSessionId
   * @return {Promise<Object|null>}
   */
  async readSessionRow(tenantId, sessionId, sqlSessionId) {
    if (stryMutAct_9fa48("77011")) {
      {}
    } else {
      stryCov_9fa48("77011");
      const sql = (stryMutAct_9fa48("77012") ? `` : (stryCov_9fa48("77012"), `${SQL.SELECT} * FROM ${DT.SESSIONS}`)) + (stryMutAct_9fa48("77013") ? `` : (stryCov_9fa48("77013"), ` ${SQL.WHERE} ${DSF.SESSION_ID} = ?1`)) + (stryMutAct_9fa48("77014") ? `` : (stryCov_9fa48("77014"), ` ${SQL.AND} ${DSF.TENANT_ID} = ?2`)) + (stryMutAct_9fa48("77015") ? `` : (stryCov_9fa48("77015"), ` ${SQL.LIMIT} 1`));
      const result = await this.executeSql(stryMutAct_9fa48("77016") ? {} : (stryCov_9fa48("77016"), {
        statement: sql,
        parameters: stryMutAct_9fa48("77017") ? [] : (stryCov_9fa48("77017"), [sessionId, tenantId]),
        tenantId,
        sessionId: sqlSessionId
      }));
      const rows = Array.isArray(result.rows) ? result.rows : stryMutAct_9fa48("77018") ? ["Stryker was here"] : (stryCov_9fa48("77018"), []);
      return stryMutAct_9fa48("77021") ? rows[NUM.ZERO] && null : stryMutAct_9fa48("77020") ? false : stryMutAct_9fa48("77019") ? true : (stryCov_9fa48("77019", "77020", "77021"), rows[NUM.ZERO] || null);
    }
  }
}

/**
 * Default policy resolver based on debug roles.
 * @param {Object} validation
 * @return {{allowedActions: Set|string}}
 */
function defaultDebugPolicyResolver(validation) {
  if (stryMutAct_9fa48("77022")) {
    {}
  } else {
    stryCov_9fa48("77022");
    const roles = Array.isArray(validation.roles) ? validation.roles : stryMutAct_9fa48("77023") ? ["Stryker was here"] : (stryCov_9fa48("77023"), []);
    if (stryMutAct_9fa48("77025") ? false : stryMutAct_9fa48("77024") ? true : (stryCov_9fa48("77024", "77025"), roles.includes(ROLE.ADMIN))) {
      if (stryMutAct_9fa48("77026")) {
        {}
      } else {
        stryCov_9fa48("77026");
        return WILDCARD_POLICY;
      }
    }
    const allowedActions = new Set();
    for (const role of roles) {
      if (stryMutAct_9fa48("77027")) {
        {}
      } else {
        stryCov_9fa48("77027");
        const actions = ROLE_ACTIONS[role];
        if (stryMutAct_9fa48("77030") ? false : stryMutAct_9fa48("77029") ? true : stryMutAct_9fa48("77028") ? actions : (stryCov_9fa48("77028", "77029", "77030"), !actions)) {
          if (stryMutAct_9fa48("77031")) {
            {}
          } else {
            stryCov_9fa48("77031");
            continue;
          }
        }
        for (const action of actions) {
          if (stryMutAct_9fa48("77032")) {
            {}
          } else {
            stryCov_9fa48("77032");
            allowedActions.add(action);
          }
        }
      }
    }
    return stryMutAct_9fa48("77033") ? {} : (stryCov_9fa48("77033"), {
      allowedActions
    });
  }
}

/**
 * @param {string} sessionId
 * @param {number} index
 * @param {number} lineNumber
 * @param {number} columnNumber
 * @return {string}
 */
function buildBreakpointId(sessionId, index, lineNumber, columnNumber) {
  if (stryMutAct_9fa48("77034")) {
    {}
  } else {
    stryCov_9fa48("77034");
    return stryMutAct_9fa48("77035") ? `` : (stryCov_9fa48("77035"), `${sessionId}:bp:${index}:${lineNumber}:${columnNumber}`);
  }
}

/**
 * @param {number} count
 * @return {string}
 */
function buildPlaceholders(count) {
  if (stryMutAct_9fa48("77036")) {
    {}
  } else {
    stryCov_9fa48("77036");
    const placeholders = stryMutAct_9fa48("77037") ? ["Stryker was here"] : (stryCov_9fa48("77037"), []);
    for (let index = NUM.ONE; stryMutAct_9fa48("77040") ? index > count : stryMutAct_9fa48("77039") ? index < count : stryMutAct_9fa48("77038") ? false : (stryCov_9fa48("77038", "77039", "77040"), index <= count); stryMutAct_9fa48("77041") ? index-- : (stryCov_9fa48("77041"), index++)) {
      if (stryMutAct_9fa48("77042")) {
        {}
      } else {
        stryCov_9fa48("77042");
        placeholders.push(stryMutAct_9fa48("77043") ? `` : (stryCov_9fa48("77043"), `?${index}`));
      }
    }
    return placeholders.join(stryMutAct_9fa48("77044") ? "" : (stryCov_9fa48("77044"), ', '));
  }
}

/**
 * @param {*} value
 * @return {number|null}
 */
function toNullableInteger(value) {
  if (stryMutAct_9fa48("77045")) {
    {}
  } else {
    stryCov_9fa48("77045");
    if (stryMutAct_9fa48("77048") ? value === null && value === undefined : stryMutAct_9fa48("77047") ? false : stryMutAct_9fa48("77046") ? true : (stryCov_9fa48("77046", "77047", "77048"), (stryMutAct_9fa48("77050") ? value !== null : stryMutAct_9fa48("77049") ? false : (stryCov_9fa48("77049", "77050"), value === null)) || (stryMutAct_9fa48("77052") ? value !== undefined : stryMutAct_9fa48("77051") ? false : (stryCov_9fa48("77051", "77052"), value === undefined)))) {
      if (stryMutAct_9fa48("77053")) {
        {}
      } else {
        stryCov_9fa48("77053");
        return null;
      }
    }
    if (stryMutAct_9fa48("77056") ? false : stryMutAct_9fa48("77055") ? true : stryMutAct_9fa48("77054") ? Number.isInteger(value) : (stryCov_9fa48("77054", "77055", "77056"), !Number.isInteger(value))) {
      if (stryMutAct_9fa48("77057")) {
        {}
      } else {
        stryCov_9fa48("77057");
        return null;
      }
    }
    return value;
  }
}

/**
 * @param {*} value
 * @return {number}
 */
function toResolvedFlag(value) {
  if (stryMutAct_9fa48("77058")) {
    {}
  } else {
    stryCov_9fa48("77058");
    return (stryMutAct_9fa48("77061") ? value === true && value === DEF.RESOLVED_TRUE : stryMutAct_9fa48("77060") ? false : stryMutAct_9fa48("77059") ? true : (stryCov_9fa48("77059", "77060", "77061"), (stryMutAct_9fa48("77063") ? value !== true : stryMutAct_9fa48("77062") ? false : (stryCov_9fa48("77062", "77063"), value === (stryMutAct_9fa48("77064") ? false : (stryCov_9fa48("77064"), true)))) || (stryMutAct_9fa48("77066") ? value !== DEF.RESOLVED_TRUE : stryMutAct_9fa48("77065") ? false : (stryCov_9fa48("77065", "77066"), value === DEF.RESOLVED_TRUE)))) ? DEF.RESOLVED_TRUE : DEF.RESOLVED_FALSE;
  }
}

/**
 * @param {*} value
 * @return {Buffer}
 */
function normalizeEnvelopeBuffer(value) {
  if (stryMutAct_9fa48("77067")) {
    {}
  } else {
    stryCov_9fa48("77067");
    if (stryMutAct_9fa48("77070") ? false : stryMutAct_9fa48("77069") ? true : stryMutAct_9fa48("77068") ? value : (stryCov_9fa48("77068", "77069", "77070"), !value)) {
      if (stryMutAct_9fa48("77071")) {
        {}
      } else {
        stryCov_9fa48("77071");
        throw createDebugMetadataError(CODE.INVALID_REQUEST, ERR.SNAPSHOT_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("77074") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("77073") ? false : stryMutAct_9fa48("77072") ? true : (stryCov_9fa48("77072", "77073", "77074"), typeof value === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("77075")) {
        {}
      } else {
        stryCov_9fa48("77075");
        return Buffer.from(value, stryMutAct_9fa48("77076") ? "" : (stryCov_9fa48("77076"), 'base64'));
      }
    }
    if (stryMutAct_9fa48("77078") ? false : stryMutAct_9fa48("77077") ? true : (stryCov_9fa48("77077", "77078"), Buffer.isBuffer(value))) {
      if (stryMutAct_9fa48("77079")) {
        {}
      } else {
        stryCov_9fa48("77079");
        return value;
      }
    }
    if (stryMutAct_9fa48("77081") ? false : stryMutAct_9fa48("77080") ? true : (stryCov_9fa48("77080", "77081"), Array.isArray(value))) {
      if (stryMutAct_9fa48("77082")) {
        {}
      } else {
        stryCov_9fa48("77082");
        return Buffer.from(value);
      }
    }
    if (stryMutAct_9fa48("77084") ? false : stryMutAct_9fa48("77083") ? true : (stryCov_9fa48("77083", "77084"), value instanceof Uint8Array)) {
      if (stryMutAct_9fa48("77085")) {
        {}
      } else {
        stryCov_9fa48("77085");
        return Buffer.from(value);
      }
    }
    if (stryMutAct_9fa48("77088") ? value || Array.isArray(value.data) : stryMutAct_9fa48("77087") ? false : stryMutAct_9fa48("77086") ? true : (stryCov_9fa48("77086", "77087", "77088"), value && Array.isArray(value.data))) {
      if (stryMutAct_9fa48("77089")) {
        {}
      } else {
        stryCov_9fa48("77089");
        return Buffer.from(value.data);
      }
    }
    throw createDebugMetadataError(CODE.INVALID_REQUEST, ERR.SNAPSHOT_REQUIRED);
  }
}

/**
 * @param {Object} row
 * @return {Object}
 */
function normalizeSessionRow(row) {
  if (stryMutAct_9fa48("77090")) {
    {}
  } else {
    stryCov_9fa48("77090");
    return stryMutAct_9fa48("77091") ? {} : (stryCov_9fa48("77091"), {
      sessionId: row[DSF.SESSION_ID],
      tenantId: row[DSF.TENANT_ID],
      serviceName: row[DSF.SERVICE_NAME],
      lineageId: row[DSF.LINEAGE_ID],
      stageId: row[DSF.STAGE_ID],
      nodeId: row[DSF.NODE_ID],
      endpoint: row[DSF.ENDPOINT],
      status: row[DSF.STATUS],
      createdAt: row[DSF.CREATED_AT],
      updatedAt: row[DSF.UPDATED_AT]
    });
  }
}

/**
 * @param {Object} row
 * @return {Object}
 */
function normalizeBreakpointRow(row) {
  if (stryMutAct_9fa48("77092")) {
    {}
  } else {
    stryCov_9fa48("77092");
    return stryMutAct_9fa48("77093") ? {} : (stryCov_9fa48("77093"), {
      breakpointId: row[DBF.BREAKPOINT_ID],
      sessionId: row[DBF.SESSION_ID],
      tenantId: row[DBF.TENANT_ID],
      moduleRef: row[DBF.MODULE_REF],
      sourceFileUrl: row[DBF.SOURCE_FILE_URL],
      lineNumber: row[DBF.LINE_NUMBER],
      columnNumber: row[DBF.COLUMN_NUMBER],
      condition: row[DBF.CONDITION],
      resolved: stryMutAct_9fa48("77096") ? row[DBF.RESOLVED] !== DEF.RESOLVED_TRUE : stryMutAct_9fa48("77095") ? false : stryMutAct_9fa48("77094") ? true : (stryCov_9fa48("77094", "77095", "77096"), row[DBF.RESOLVED] === DEF.RESOLVED_TRUE),
      createdAt: row[DBF.CREATED_AT],
      updatedAt: row[DBF.UPDATED_AT]
    });
  }
}

/**
 * @param {Object} row
 * @param {boolean} includeEnvelope
 * @return {Object}
 */
function normalizeSnapshotRow(row, includeEnvelope) {
  if (stryMutAct_9fa48("77097")) {
    {}
  } else {
    stryCov_9fa48("77097");
    let envelope = null;
    if (stryMutAct_9fa48("77099") ? false : stryMutAct_9fa48("77098") ? true : (stryCov_9fa48("77098", "77099"), includeEnvelope)) {
      if (stryMutAct_9fa48("77100")) {
        {}
      } else {
        stryCov_9fa48("77100");
        envelope = Buffer.from(stryMutAct_9fa48("77103") ? row[DPF.SNAPSHOT_BYTES_BASE64] && '' : stryMutAct_9fa48("77102") ? false : stryMutAct_9fa48("77101") ? true : (stryCov_9fa48("77101", "77102", "77103"), row[DPF.SNAPSHOT_BYTES_BASE64] || (stryMutAct_9fa48("77104") ? "Stryker was here!" : (stryCov_9fa48("77104"), ''))), stryMutAct_9fa48("77105") ? "" : (stryCov_9fa48("77105"), 'base64'));
      }
    }
    return stryMutAct_9fa48("77106") ? {} : (stryCov_9fa48("77106"), {
      snapshotId: row[DPF.SNAPSHOT_ID],
      sessionId: row[DPF.SESSION_ID],
      tenantId: row[DSF.TENANT_ID],
      moduleRef: row[DPF.MODULE_REF],
      moduleDigest: row[DPF.MODULE_DIGEST],
      capturedAt: row[DPF.CAPTURED_AT],
      formatVersion: row[DPF.FORMAT_VERSION],
      totalBytes: row[DPF.TOTAL_BYTES],
      frameCount: row[DPF.FRAME_COUNT],
      hostCallCount: row[DPF.HOST_CALL_COUNT],
      createdAt: row[DPF.CREATED_AT],
      updatedAt: row[DPF.UPDATED_AT],
      manifest: parseJson(row[DPF.MANIFEST_JSON], {}),
      envelope
    });
  }
}

/**
 * @param {string} value
 * @param {*} fallback
 * @return {*}
 */
function parseJson(value, fallback) {
  if (stryMutAct_9fa48("77107")) {
    {}
  } else {
    stryCov_9fa48("77107");
    if (stryMutAct_9fa48("77110") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("77109") ? false : stryMutAct_9fa48("77108") ? true : (stryCov_9fa48("77108", "77109", "77110"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("77111")) {
        {}
      } else {
        stryCov_9fa48("77111");
        return fallback;
      }
    }
    try {
      if (stryMutAct_9fa48("77112")) {
        {}
      } else {
        stryCov_9fa48("77112");
        return JSON.parse(value);
      }
    } catch {
      if (stryMutAct_9fa48("77113")) {
        {}
      } else {
        stryCov_9fa48("77113");
        return fallback;
      }
    }
  }
}

/**
 * @param {*} value
 */
function assertRequestObject(value) {
  if (stryMutAct_9fa48("77114")) {
    {}
  } else {
    stryCov_9fa48("77114");
    if (stryMutAct_9fa48("77117") ? !value && typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("77116") ? false : stryMutAct_9fa48("77115") ? true : (stryCov_9fa48("77115", "77116", "77117"), (stryMutAct_9fa48("77118") ? value : (stryCov_9fa48("77118"), !value)) || (stryMutAct_9fa48("77120") ? typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("77119") ? false : (stryCov_9fa48("77119", "77120"), typeof value !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("77121")) {
        {}
      } else {
        stryCov_9fa48("77121");
        throw createDebugMetadataError(CODE.INVALID_REQUEST, ERR.REQUEST_REQUIRED);
      }
    }
  }
}

/**
 * @param {*} value
 * @param {string} message
 * @param {string} code
 */
function assertNonEmptyString(value, message, code) {
  if (stryMutAct_9fa48("77122")) {
    {}
  } else {
    stryCov_9fa48("77122");
    if (stryMutAct_9fa48("77125") ? typeof value !== TYPEOF.STRING && value.trim().length === NUM.ZERO : stryMutAct_9fa48("77124") ? false : stryMutAct_9fa48("77123") ? true : (stryCov_9fa48("77123", "77124", "77125"), (stryMutAct_9fa48("77127") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("77126") ? false : (stryCov_9fa48("77126", "77127"), typeof value !== TYPEOF.STRING)) || (stryMutAct_9fa48("77129") ? value.trim().length !== NUM.ZERO : stryMutAct_9fa48("77128") ? false : (stryCov_9fa48("77128", "77129"), (stryMutAct_9fa48("77130") ? value.length : (stryCov_9fa48("77130"), value.trim().length)) === NUM.ZERO)))) {
      if (stryMutAct_9fa48("77131")) {
        {}
      } else {
        stryCov_9fa48("77131");
        throw createDebugMetadataError(code, message);
      }
    }
  }
}

/**
 * @param {*} value
 * @param {number} fallback
 * @return {number}
 */
function normalizeLimit(value, fallback) {
  if (stryMutAct_9fa48("77132")) {
    {}
  } else {
    stryCov_9fa48("77132");
    if (stryMutAct_9fa48("77135") ? !Number.isInteger(value) && value <= NUM.ZERO : stryMutAct_9fa48("77134") ? false : stryMutAct_9fa48("77133") ? true : (stryCov_9fa48("77133", "77134", "77135"), (stryMutAct_9fa48("77136") ? Number.isInteger(value) : (stryCov_9fa48("77136"), !Number.isInteger(value))) || (stryMutAct_9fa48("77139") ? value > NUM.ZERO : stryMutAct_9fa48("77138") ? value < NUM.ZERO : stryMutAct_9fa48("77137") ? false : (stryCov_9fa48("77137", "77138", "77139"), value <= NUM.ZERO)))) {
      if (stryMutAct_9fa48("77140")) {
        {}
      } else {
        stryCov_9fa48("77140");
        return fallback;
      }
    }
    return stryMutAct_9fa48("77141") ? Math.max(value, DEF.MAX_LIMIT) : (stryCov_9fa48("77141"), Math.min(value, DEF.MAX_LIMIT));
  }
}

/**
 * @param {string} code
 * @param {string} message
 * @return {Error}
 */
function createDebugMetadataError(code, message) {
  if (stryMutAct_9fa48("77142")) {
    {}
  } else {
    stryCov_9fa48("77142");
    const error = new Error(message);
    error.code = code;
    return error;
  }
}
export { DebugMetadataStore, defaultDebugPolicyResolver, createDebugMetadataError };