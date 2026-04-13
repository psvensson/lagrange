/**
 * Admin WebSocket API — node-local compatibility adapter.
 *
 * This class is a THIN ROUTING ADAPTER on the configured admin WebSocket port.
 * It exists solely to preserve backward compatibility with
 * existing CLI clients. Its responsibilities are:
 *
 *   1. Accept WebSocket connections from admin CLI clients.
 *   2. Validate incoming message envelopes (JSON, required fields).
 *   3. Route query execution through the SQL query engine
 *      (SqlCore), which owns all SQL planning and mutation paths.
 *   4. Forward CDC events from the system table cache to
 *      connected clients for real-time state updates.
 *   5. Return responses in the CLI-compatible envelope format.
 *
 * This adapter MUST NOT:
 *   - Write to partitions directly (all writes go through SqlCore).
 *   - Own or introduce alternative mutation paths.
 *   - Maintain derived state beyond the client connection set.
 *   - Bypass the SQL/CDC ownership contract.
 *
 * Query execution delegates through AdminApiAdapter contract
 * and then into SqlCore.executeRequest(SqlRequest), which
 * routes through the standard SQL/CDC mutation path.
 * Cache reads use the read-only SystemTableCache interface.
 *
 * See architecture.md §AdminWebSocketAPI and §Admin Serviceization.
 *
 * Requirements: 2.4, 13.2
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
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { TIMEOUT_BUDGET_CLASSIFICATION, createTimeoutBudget, createTimeoutBudgetError } from '../control-plane/timeout-budget.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../control-plane/control-plane-error-classification.js';
import { getRegisteredControlPlaneSystemTableGateway } from '../control-plane/control-plane-gateway-registry.js';
import { PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { ERRNO, HTTP_STATUS, NUM, TABLES, TYPEOF } from '../constants/index.js';
import { META_SERVICE_ID } from '../constants/wasm-meta.js';
import { TRANSPORT_EVENT } from '../constants/transport.js';
import { CancellationToken } from '../query/cancellation-token.js';
import { createSqlRequest } from '../query/sql-request.js';
import { EXECUTION_MODE } from '../query/sql-adapter-constants.js';
import { guardedAdaptAdminAction } from './admin-api-adapter.js';
import { ADMIN_META_ACTION, CACHE_DUMP_TABLES } from './admin-meta-command-handlers.js';
import { parseLiveSelect } from '../live-query/live-query-service.js';
import { AST_TYPE, EXPR_TYPE, SQLParser } from '../query/sql-parser.js';
import { MUTATION_GUARD_MODE } from './admin-mutation-guard.js';
import { ADMIN_SERVICE_OPERATION, adaptAdminMessageToServiceMessage, isAdminMessageDispatchable } from './admin-service-message-adapter.js';
import { AdminTestRunService } from './admin-test-run-service.js';
import { DebugMetadataStore } from '../debug-runtime/debug-metadata-service.js';
import { TraceCollector } from '../debug/trace-collector.js';
import { ENDPOINT_SYNC_UNHEALTHY_POLICY } from '../runtime/endpoint-sync-constants.js';
import { WASM_SERVICE_PROTOCOL } from '../wasm-service/wasm-service-constants.js';
import { ADMIN_CACHE_DUMP, ADMIN_CONTROL_SNAPSHOT, ADMIN_CLIENT, ADMIN_CONTENT_TYPE, ADMIN_CONFIG_KEY, ADMIN_DEFAULT, ADMIN_ENFORCEMENT_MODE, ADMIN_ERROR_CODE, ADMIN_ERROR_HINT, ADMIN_ERROR_MATCH, ADMIN_ERROR_MESSAGE, ADMIN_LIMIT, ADMIN_LOG_MSG, ADMIN_MESSAGE_TYPE, ADMIN_QUERY_RESULT, ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT, ADMIN_SERVICE_DISCOVERY, ADMIN_ROUTE, ADMIN_STATUS, ADMIN_SUBSYSTEM, ADMIN_TEST_DEFAULT, ADMIN_TEST_ERROR_MSG, ADMIN_TEST_STREAM_EVENT } from './admin-constants.js';
import { normalizeIdentifier, normalizeSql } from './admin-helpers.js';
import { evaluateSharedMetadataNodeCoverage } from './admin-shared-metadata-consistency.js';
import { AdminServiceDiscovery, parseDiscoveryBooleanQuery, parseDiscoveryListQuery, parseServiceDiscoverySqlQuery } from './admin-service-discovery.js';
import { AdminPreflightSnapshot } from './admin-preflight-snapshot.js';
import { AdminControlSnapshot } from './admin-control-snapshot.js';
import { AdminDebugHandlers } from './admin-debug-handlers.js';
const MessageType = ADMIN_MESSAGE_TYPE;
const ErrorCode = ADMIN_ERROR_CODE;
const HTTP_HEADER = Object.freeze(stryMutAct_9fa48("8745") ? {} : (stryCov_9fa48("8745"), {
  CACHE_CONTROL: stryMutAct_9fa48("8746") ? "" : (stryCov_9fa48("8746"), 'Cache-Control'),
  CONNECTION: stryMutAct_9fa48("8747") ? "" : (stryCov_9fa48("8747"), 'Connection'),
  CONTENT_TYPE: stryMutAct_9fa48("8748") ? "" : (stryCov_9fa48("8748"), 'Content-Type')
}));
const HTTP_HEADER_VALUE = Object.freeze(stryMutAct_9fa48("8749") ? {} : (stryCov_9fa48("8749"), {
  NO_CACHE: stryMutAct_9fa48("8750") ? "" : (stryCov_9fa48("8750"), 'no-cache'),
  NO_STORE: stryMutAct_9fa48("8751") ? "" : (stryCov_9fa48("8751"), 'no-store'),
  KEEP_ALIVE: stryMutAct_9fa48("8752") ? "" : (stryCov_9fa48("8752"), 'keep-alive')
}));
const ADMIN_STREAM_LANE_DEFAULT = stryMutAct_9fa48("8753") ? "" : (stryCov_9fa48("8753"), 'default');
const ADMIN_STREAM_LANE_LOAD = stryMutAct_9fa48("8754") ? "" : (stryCov_9fa48("8754"), 'load');
const ADMIN_STREAM_LANE_PROBE = stryMutAct_9fa48("8755") ? "" : (stryCov_9fa48("8755"), 'probe');
const ADMIN_STREAM_LANE_SNAPSHOT = stryMutAct_9fa48("8756") ? "" : (stryCov_9fa48("8756"), 'snapshot');
const LOAD_LANE_READINESS_CACHE_MAX_AGE_MS = 5000;
const LOAD_LANE_TABLE_ADMISSION_CACHE_MAX_AGE_MS = 250;
const LOAD_LANE_TABLE_ADMISSION_RETRY_AFTER_MS = 250;
const LOAD_LANE_QUERY_TIMEOUT_CAP_MS = 3000;
const LOAD_LANE_SOFT_ADMISSION_REASON_CODES = new Set(stryMutAct_9fa48("8757") ? [] : (stryCov_9fa48("8757"), [stryMutAct_9fa48("8758") ? "" : (stryCov_9fa48("8758"), 'schema_partition_unavailable'), stryMutAct_9fa48("8759") ? "" : (stryCov_9fa48("8759"), 'leadership_unstable')]));
const LOAD_LANE_QUERY_ADMISSION_STATE = Object.freeze(stryMutAct_9fa48("8760") ? {} : (stryCov_9fa48("8760"), {
  ADMITTED: stryMutAct_9fa48("8761") ? "" : (stryCov_9fa48("8761"), 'admitted'),
  BLOCKED: stryMutAct_9fa48("8762") ? "" : (stryCov_9fa48("8762"), 'blocked'),
  SNAPSHOT_UNAVAILABLE: stryMutAct_9fa48("8763") ? "" : (stryCov_9fa48("8763"), 'snapshot_unavailable')
}));
const LOAD_LANE_TABLE_ADMISSION_STATE = Object.freeze(stryMutAct_9fa48("8764") ? {} : (stryCov_9fa48("8764"), {
  BENCHMARK_BLOCKED: stryMutAct_9fa48("8765") ? "" : (stryCov_9fa48("8765"), 'benchmark_blocked'),
  DISCOVERY_MISSING: stryMutAct_9fa48("8766") ? "" : (stryCov_9fa48("8766"), 'local_benchmark_discovery_missing'),
  READINESS_BLOCKED: stryMutAct_9fa48("8767") ? "" : (stryCov_9fa48("8767"), 'readiness_blocked'),
  READY: stryMutAct_9fa48("8768") ? "" : (stryCov_9fa48("8768"), 'ready'),
  SOFT_BLOCKER_ADMITTED: stryMutAct_9fa48("8769") ? "" : (stryCov_9fa48("8769"), 'soft_blocker_admitted')
}));
const LOAD_LANE_VOTER_READY_REPLICA_ROLES = new Set(stryMutAct_9fa48("8770") ? [] : (stryCov_9fa48("8770"), [stryMutAct_9fa48("8771") ? "" : (stryCov_9fa48("8771"), 'leader'), stryMutAct_9fa48("8772") ? "" : (stryCov_9fa48("8772"), 'follower')]));
const SSE_FRAME_PREFIX = stryMutAct_9fa48("8773") ? "" : (stryCov_9fa48("8773"), 'data: ');
const SSE_FRAME_SUFFIX = stryMutAct_9fa48("8774") ? "" : (stryCov_9fa48("8774"), '\n\n');
const EMPTY_STRING = stryMutAct_9fa48("8775") ? "Stryker was here!" : (stryCov_9fa48("8775"), '');
const ADMIN_CACHE_OBSERVATION_TABLES = new Set(stryMutAct_9fa48("8776") ? [] : (stryCov_9fa48("8776"), [...CACHE_DUMP_TABLES, TABLES.NODE_ENDPOINTS]));
const ADMIN_LOCAL_DISPATCH = Object.freeze(stryMutAct_9fa48("8777") ? {} : (stryCov_9fa48("8777"), {
  TARGET_ADDRESS: stryMutAct_9fa48("8778") ? "" : (stryCov_9fa48("8778"), 'local/admin-websocket-api')
}));
function buildLoadLaneQueryAdmissionSnapshot(readiness) {
  if (stryMutAct_9fa48("8779")) {
    {}
  } else {
    stryCov_9fa48("8779");
    const hasDimensions = Boolean(stryMutAct_9fa48("8782") ? readiness && typeof readiness === TYPEOF.OBJECT && readiness.dimensions || typeof readiness.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("8781") ? false : stryMutAct_9fa48("8780") ? true : (stryCov_9fa48("8780", "8781", "8782"), (stryMutAct_9fa48("8784") ? readiness && typeof readiness === TYPEOF.OBJECT || readiness.dimensions : stryMutAct_9fa48("8783") ? true : (stryCov_9fa48("8783", "8784"), (stryMutAct_9fa48("8786") ? readiness || typeof readiness === TYPEOF.OBJECT : stryMutAct_9fa48("8785") ? true : (stryCov_9fa48("8785", "8786"), readiness && (stryMutAct_9fa48("8788") ? typeof readiness !== TYPEOF.OBJECT : stryMutAct_9fa48("8787") ? true : (stryCov_9fa48("8787", "8788"), typeof readiness === TYPEOF.OBJECT)))) && readiness.dimensions)) && (stryMutAct_9fa48("8790") ? typeof readiness.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("8789") ? true : (stryCov_9fa48("8789", "8790"), typeof readiness.dimensions === TYPEOF.OBJECT))));
    const reasonCodes = Array.isArray(stryMutAct_9fa48("8791") ? readiness.reasons : (stryCov_9fa48("8791"), readiness?.reasons)) ? stryMutAct_9fa48("8792") ? readiness.reasons.map(reason => String(reason?.code || EMPTY_STRING).trim()) : (stryCov_9fa48("8792"), readiness.reasons.map(stryMutAct_9fa48("8793") ? () => undefined : (stryCov_9fa48("8793"), reason => stryMutAct_9fa48("8794") ? String(reason?.code || EMPTY_STRING) : (stryCov_9fa48("8794"), String(stryMutAct_9fa48("8797") ? reason?.code && EMPTY_STRING : stryMutAct_9fa48("8796") ? false : stryMutAct_9fa48("8795") ? true : (stryCov_9fa48("8795", "8796", "8797"), (stryMutAct_9fa48("8798") ? reason.code : (stryCov_9fa48("8798"), reason?.code)) || EMPTY_STRING)).trim()))).filter(stryMutAct_9fa48("8799") ? () => undefined : (stryCov_9fa48("8799"), code => stryMutAct_9fa48("8803") ? code.length <= NUM.ZERO : stryMutAct_9fa48("8802") ? code.length >= NUM.ZERO : stryMutAct_9fa48("8801") ? false : stryMutAct_9fa48("8800") ? true : (stryCov_9fa48("8800", "8801", "8802", "8803"), code.length > NUM.ZERO)))) : stryMutAct_9fa48("8804") ? ["Stryker was here"] : (stryCov_9fa48("8804"), []);
    return Object.freeze(stryMutAct_9fa48("8805") ? {} : (stryCov_9fa48("8805"), {
      serveEligible: stryMutAct_9fa48("8808") ? hasDimensions || readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === true : stryMutAct_9fa48("8807") ? false : stryMutAct_9fa48("8806") ? true : (stryCov_9fa48("8806", "8807", "8808"), hasDimensions && (stryMutAct_9fa48("8810") ? readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== true : stryMutAct_9fa48("8809") ? true : (stryCov_9fa48("8809", "8810"), readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === (stryMutAct_9fa48("8811") ? false : (stryCov_9fa48("8811"), true))))),
      reasonCodes,
      hasDimensions
    }));
  }
}
function resolveLoadLaneQueryAdmissionState(snapshot) {
  if (stryMutAct_9fa48("8812")) {
    {}
  } else {
    stryCov_9fa48("8812");
    if (stryMutAct_9fa48("8815") ? false : stryMutAct_9fa48("8814") ? true : stryMutAct_9fa48("8813") ? snapshot.hasDimensions : (stryCov_9fa48("8813", "8814", "8815"), !snapshot.hasDimensions)) {
      if (stryMutAct_9fa48("8816")) {
        {}
      } else {
        stryCov_9fa48("8816");
        return LOAD_LANE_QUERY_ADMISSION_STATE.SNAPSHOT_UNAVAILABLE;
      }
    }
    return snapshot.serveEligible ? LOAD_LANE_QUERY_ADMISSION_STATE.ADMITTED : LOAD_LANE_QUERY_ADMISSION_STATE.BLOCKED;
  }
}
function buildLoadLaneQueryAdmissionResult(snapshot, state) {
  if (stryMutAct_9fa48("8817")) {
    {}
  } else {
    stryCov_9fa48("8817");
    return Object.freeze(stryMutAct_9fa48("8818") ? {} : (stryCov_9fa48("8818"), {
      state,
      serveEligible: snapshot.serveEligible,
      reasonCodes: (stryMutAct_9fa48("8821") ? state !== LOAD_LANE_QUERY_ADMISSION_STATE.BLOCKED : stryMutAct_9fa48("8820") ? false : stryMutAct_9fa48("8819") ? true : (stryCov_9fa48("8819", "8820", "8821"), state === LOAD_LANE_QUERY_ADMISSION_STATE.BLOCKED)) ? snapshot.reasonCodes : stryMutAct_9fa48("8822") ? ["Stryker was here"] : (stryCov_9fa48("8822"), [])
    }));
  }
}

/**
 * Resolve control-plane readiness service from one SQL engine bundle.
 * @param {Object|null} sqlQueryEngine
 * @return {Object|null}
 */
function resolveSqlEngineControlPlaneReadinessService(sqlQueryEngine) {
  if (stryMutAct_9fa48("8823")) {
    {}
  } else {
    stryCov_9fa48("8823");
    return stryMutAct_9fa48("8826") ? sqlQueryEngine?.rebalanceCoordinator?.storageAdmissionService?.controlPlaneReadinessService && null : stryMutAct_9fa48("8825") ? false : stryMutAct_9fa48("8824") ? true : (stryCov_9fa48("8824", "8825", "8826"), (stryMutAct_9fa48("8829") ? sqlQueryEngine.rebalanceCoordinator?.storageAdmissionService?.controlPlaneReadinessService : stryMutAct_9fa48("8828") ? sqlQueryEngine?.rebalanceCoordinator.storageAdmissionService?.controlPlaneReadinessService : stryMutAct_9fa48("8827") ? sqlQueryEngine?.rebalanceCoordinator?.storageAdmissionService.controlPlaneReadinessService : (stryCov_9fa48("8827", "8828", "8829"), sqlQueryEngine?.rebalanceCoordinator?.storageAdmissionService?.controlPlaneReadinessService)) || null);
  }
}

/**
 * Build a typed admin-operation error used for websocket responses.
 * @param {string} errorCode
 * @param {string} message
 * @param {string|null} [hint]
 * @return {Error}
 */
function createAdminOperationError(errorCode, message, hint = null) {
  if (stryMutAct_9fa48("8830")) {
    {}
  } else {
    stryCov_9fa48("8830");
    const error = new Error(message);
    error.adminErrorCode = errorCode;
    error.adminHint = hint;
    return error;
  }
}

/**
 * Build one retryable admin-operation error for bounded admission deferral.
 * @param {string} errorCode
 * @param {string} message
 * @param {Object} [options={}]
 * @param {string|null} [options.hint]
 * @param {number} [options.retryAfterMs]
 * @return {Error}
 */
function createRetryableAdminOperationError(errorCode, message, options = {}) {
  if (stryMutAct_9fa48("8831")) {
    {}
  } else {
    stryCov_9fa48("8831");
    const error = createAdminOperationError(errorCode, message, stryMutAct_9fa48("8834") ? options?.hint && null : stryMutAct_9fa48("8833") ? false : stryMutAct_9fa48("8832") ? true : (stryCov_9fa48("8832", "8833", "8834"), (stryMutAct_9fa48("8835") ? options.hint : (stryCov_9fa48("8835"), options?.hint)) || null));
    error.deferRetry = stryMutAct_9fa48("8836") ? false : (stryCov_9fa48("8836"), true);
    error.retryAfterMs = (stryMutAct_9fa48("8839") ? Number.isFinite(options?.retryAfterMs) || options.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("8838") ? false : stryMutAct_9fa48("8837") ? true : (stryCov_9fa48("8837", "8838", "8839"), Number.isFinite(stryMutAct_9fa48("8840") ? options.retryAfterMs : (stryCov_9fa48("8840"), options?.retryAfterMs)) && (stryMutAct_9fa48("8843") ? options.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("8842") ? options.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("8841") ? true : (stryCov_9fa48("8841", "8842", "8843"), options.retryAfterMs > NUM.ZERO)))) ? Math.floor(options.retryAfterMs) : LOAD_LANE_TABLE_ADMISSION_RETRY_AFTER_MS;
    return error;
  }
}

/**
 * Resolve one optional positive timeout override from message payload.
 * @param {*} value
 * @return {number|null}
 */
function resolveRequestedQueryTimeoutMs(value) {
  if (stryMutAct_9fa48("8844")) {
    {}
  } else {
    stryCov_9fa48("8844");
    const parsedValue = Number(value);
    if (stryMutAct_9fa48("8847") ? false : stryMutAct_9fa48("8846") ? true : stryMutAct_9fa48("8845") ? Number.isFinite(parsedValue) : (stryCov_9fa48("8845", "8846", "8847"), !Number.isFinite(parsedValue))) {
      if (stryMutAct_9fa48("8848")) {
        {}
      } else {
        stryCov_9fa48("8848");
        return null;
      }
    }
    const normalizedValue = Math.floor(parsedValue);
    if (stryMutAct_9fa48("8852") ? normalizedValue > NUM.ZERO : stryMutAct_9fa48("8851") ? normalizedValue < NUM.ZERO : stryMutAct_9fa48("8850") ? false : stryMutAct_9fa48("8849") ? true : (stryCov_9fa48("8849", "8850", "8851", "8852"), normalizedValue <= NUM.ZERO)) {
      if (stryMutAct_9fa48("8853")) {
        {}
      } else {
        stryCov_9fa48("8853");
        return null;
      }
    }
    return normalizedValue;
  }
}

/**
 * Build a typed admin-operation error used for websocket responses.
 * administrative SQL/cache operations on the configured admin WebSocket port.
 *
 * All query execution routes through SqlQueryEngine (SqlCore).
 * All cache reads use the read-only SystemTableCache interface.
 * No direct partition writes or alternative mutation paths.
 */
class AdminWebSocketAPI {
  /**
   * Create a new AdminWebSocketAPI.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object|null} [options.cacheMutationTarget] - Writable cache target.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Object|null} [options.messageRouter] - MessageRouter instance (optional).
   * @param {string} options.nodeId - Node ID.
   * @param {boolean} [options.enableAdminStream] - Enable legacy admin stream.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("8854")) {
      {}
    } else {
      stryCov_9fa48("8854");
      this.systemTableCache = stryMutAct_9fa48("8857") ? options.systemTableCache && null : stryMutAct_9fa48("8856") ? false : stryMutAct_9fa48("8855") ? true : (stryCov_9fa48("8855", "8856", "8857"), options.systemTableCache || null);
      this.cacheMutationTarget = stryMutAct_9fa48("8860") ? options.cacheMutationTarget && null : stryMutAct_9fa48("8859") ? false : stryMutAct_9fa48("8858") ? true : (stryCov_9fa48("8858", "8859", "8860"), options.cacheMutationTarget || null);
      this.sqlQueryEngine = stryMutAct_9fa48("8863") ? options.sqlQueryEngine && null : stryMutAct_9fa48("8862") ? false : stryMutAct_9fa48("8861") ? true : (stryCov_9fa48("8861", "8862", "8863"), options.sqlQueryEngine || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("8866") ? (options.controlPlaneSystemTableGateway || getRegisteredControlPlaneSystemTableGateway()) && null : stryMutAct_9fa48("8865") ? false : stryMutAct_9fa48("8864") ? true : (stryCov_9fa48("8864", "8865", "8866"), (stryMutAct_9fa48("8868") ? options.controlPlaneSystemTableGateway && getRegisteredControlPlaneSystemTableGateway() : stryMutAct_9fa48("8867") ? false : (stryCov_9fa48("8867", "8868"), options.controlPlaneSystemTableGateway || getRegisteredControlPlaneSystemTableGateway())) || null);
      this.messageRouter = stryMutAct_9fa48("8871") ? options.messageRouter && null : stryMutAct_9fa48("8870") ? false : stryMutAct_9fa48("8869") ? true : (stryCov_9fa48("8869", "8870", "8871"), options.messageRouter || null);
      this.nodeId = stryMutAct_9fa48("8874") ? options.nodeId && ADMIN_DEFAULT.NODE_ID : stryMutAct_9fa48("8873") ? false : stryMutAct_9fa48("8872") ? true : (stryCov_9fa48("8872", "8873", "8874"), options.nodeId || ADMIN_DEFAULT.NODE_ID);
      this.enforcementMode = stryMutAct_9fa48("8877") ? options.enforcementMode && ADMIN_DEFAULT.ENFORCEMENT_MODE : stryMutAct_9fa48("8876") ? false : stryMutAct_9fa48("8875") ? true : (stryCov_9fa48("8875", "8876", "8877"), options.enforcementMode || ADMIN_DEFAULT.ENFORCEMENT_MODE);
      this.nowFn = stryMutAct_9fa48("8880") ? options.nowFn && (() => Date.now()) : stryMutAct_9fa48("8879") ? false : stryMutAct_9fa48("8878") ? true : (stryCov_9fa48("8878", "8879", "8880"), options.nowFn || (stryMutAct_9fa48("8881") ? () => undefined : (stryCov_9fa48("8881"), () => Date.now())));
      this.testRunService = stryMutAct_9fa48("8884") ? options.testRunService && new AdminTestRunService() : stryMutAct_9fa48("8883") ? false : stryMutAct_9fa48("8882") ? true : (stryCov_9fa48("8882", "8883", "8884"), options.testRunService || new AdminTestRunService());
      this.debugMetadataStore = stryMutAct_9fa48("8887") ? options.debugMetadataStore && (this.sqlQueryEngine ? new DebugMetadataStore({
        sqlQueryEngine: this.sqlQueryEngine
      }) : null) : stryMutAct_9fa48("8886") ? false : stryMutAct_9fa48("8885") ? true : (stryCov_9fa48("8885", "8886", "8887"), options.debugMetadataStore || (this.sqlQueryEngine ? new DebugMetadataStore(stryMutAct_9fa48("8888") ? {} : (stryCov_9fa48("8888"), {
        sqlQueryEngine: this.sqlQueryEngine
      })) : null));
      this.debugDapRouter = stryMutAct_9fa48("8891") ? options.debugDapRouter && null : stryMutAct_9fa48("8890") ? false : stryMutAct_9fa48("8889") ? true : (stryCov_9fa48("8889", "8890", "8891"), options.debugDapRouter || null);
      this.traceCollector = stryMutAct_9fa48("8894") ? options.traceCollector && new TraceCollector() : stryMutAct_9fa48("8893") ? false : stryMutAct_9fa48("8892") ? true : (stryCov_9fa48("8892", "8893", "8894"), options.traceCollector || new TraceCollector());
      this.serviceDispatcher = stryMutAct_9fa48("8897") ? options.serviceDispatcher && this.createLocalServiceDispatcher() : stryMutAct_9fa48("8896") ? false : stryMutAct_9fa48("8895") ? true : (stryCov_9fa48("8895", "8896", "8897"), options.serviceDispatcher || this.createLocalServiceDispatcher());
      this.serviceDiagnosticsProvider = stryMutAct_9fa48("8900") ? options.serviceDiagnosticsProvider && null : stryMutAct_9fa48("8899") ? false : stryMutAct_9fa48("8898") ? true : (stryCov_9fa48("8898", "8899", "8900"), options.serviceDiagnosticsProvider || null);
      this.partitionServicesProvider = (stryMutAct_9fa48("8903") ? typeof options.partitionServicesProvider !== TYPEOF.FUNCTION : stryMutAct_9fa48("8902") ? false : stryMutAct_9fa48("8901") ? true : (stryCov_9fa48("8901", "8902", "8903"), typeof options.partitionServicesProvider === TYPEOF.FUNCTION)) ? options.partitionServicesProvider : null;
      this.partitionServices = options.partitionServices instanceof Map ? options.partitionServices : null;
      this.liveQueryManager = stryMutAct_9fa48("8906") ? options.liveQueryManager && null : stryMutAct_9fa48("8905") ? false : stryMutAct_9fa48("8904") ? true : (stryCov_9fa48("8904", "8905", "8906"), options.liveQueryManager || null);
      this.cdcIntegrationService = stryMutAct_9fa48("8909") ? options.cdcIntegrationService && null : stryMutAct_9fa48("8908") ? false : stryMutAct_9fa48("8907") ? true : (stryCov_9fa48("8907", "8908", "8909"), options.cdcIntegrationService || null);
      this.controlPlaneReadinessService = stryMutAct_9fa48("8912") ? (options.controlPlaneReadinessService || resolveSqlEngineControlPlaneReadinessService(this.sqlQueryEngine)) && null : stryMutAct_9fa48("8911") ? false : stryMutAct_9fa48("8910") ? true : (stryCov_9fa48("8910", "8911", "8912"), (stryMutAct_9fa48("8914") ? options.controlPlaneReadinessService && resolveSqlEngineControlPlaneReadinessService(this.sqlQueryEngine) : stryMutAct_9fa48("8913") ? false : (stryCov_9fa48("8913", "8914"), options.controlPlaneReadinessService || resolveSqlEngineControlPlaneReadinessService(this.sqlQueryEngine))) || null);
      this.heartbeatService = stryMutAct_9fa48("8917") ? options.heartbeatService && null : stryMutAct_9fa48("8916") ? false : stryMutAct_9fa48("8915") ? true : (stryCov_9fa48("8915", "8916", "8917"), options.heartbeatService || null);
      this.loadLaneReadinessCacheMaxAgeMs = (stryMutAct_9fa48("8920") ? Number.isFinite(options.loadLaneReadinessCacheMaxAgeMs) || options.loadLaneReadinessCacheMaxAgeMs > NUM.ZERO : stryMutAct_9fa48("8919") ? false : stryMutAct_9fa48("8918") ? true : (stryCov_9fa48("8918", "8919", "8920"), Number.isFinite(options.loadLaneReadinessCacheMaxAgeMs) && (stryMutAct_9fa48("8923") ? options.loadLaneReadinessCacheMaxAgeMs <= NUM.ZERO : stryMutAct_9fa48("8922") ? options.loadLaneReadinessCacheMaxAgeMs >= NUM.ZERO : stryMutAct_9fa48("8921") ? true : (stryCov_9fa48("8921", "8922", "8923"), options.loadLaneReadinessCacheMaxAgeMs > NUM.ZERO)))) ? Math.floor(options.loadLaneReadinessCacheMaxAgeMs) : LOAD_LANE_READINESS_CACHE_MAX_AGE_MS;
      this.loadLaneTableAdmissionCacheMaxAgeMs = (stryMutAct_9fa48("8926") ? Number.isFinite(options.loadLaneTableAdmissionCacheMaxAgeMs) || options.loadLaneTableAdmissionCacheMaxAgeMs > NUM.ZERO : stryMutAct_9fa48("8925") ? false : stryMutAct_9fa48("8924") ? true : (stryCov_9fa48("8924", "8925", "8926"), Number.isFinite(options.loadLaneTableAdmissionCacheMaxAgeMs) && (stryMutAct_9fa48("8929") ? options.loadLaneTableAdmissionCacheMaxAgeMs <= NUM.ZERO : stryMutAct_9fa48("8928") ? options.loadLaneTableAdmissionCacheMaxAgeMs >= NUM.ZERO : stryMutAct_9fa48("8927") ? true : (stryCov_9fa48("8927", "8928", "8929"), options.loadLaneTableAdmissionCacheMaxAgeMs > NUM.ZERO)))) ? Math.floor(options.loadLaneTableAdmissionCacheMaxAgeMs) : stryMutAct_9fa48("8930") ? Math.max(this.loadLaneReadinessCacheMaxAgeMs, LOAD_LANE_TABLE_ADMISSION_CACHE_MAX_AGE_MS) : (stryCov_9fa48("8930"), Math.min(this.loadLaneReadinessCacheMaxAgeMs, LOAD_LANE_TABLE_ADMISSION_CACHE_MAX_AGE_MS));
      this.loadLaneQueryTimeoutCapMs = (stryMutAct_9fa48("8933") ? Number.isFinite(options.loadLaneQueryTimeoutCapMs) || options.loadLaneQueryTimeoutCapMs > NUM.ZERO : stryMutAct_9fa48("8932") ? false : stryMutAct_9fa48("8931") ? true : (stryCov_9fa48("8931", "8932", "8933"), Number.isFinite(options.loadLaneQueryTimeoutCapMs) && (stryMutAct_9fa48("8936") ? options.loadLaneQueryTimeoutCapMs <= NUM.ZERO : stryMutAct_9fa48("8935") ? options.loadLaneQueryTimeoutCapMs >= NUM.ZERO : stryMutAct_9fa48("8934") ? true : (stryCov_9fa48("8934", "8935", "8936"), options.loadLaneQueryTimeoutCapMs > NUM.ZERO)))) ? Math.floor(options.loadLaneQueryTimeoutCapMs) : LOAD_LANE_QUERY_TIMEOUT_CAP_MS;
      this.loadLaneTableAdmissionCache = new Map();
      this.enableAdminStream = stryMutAct_9fa48("8939") ? options.enableAdminStream === false : stryMutAct_9fa48("8938") ? false : stryMutAct_9fa48("8937") ? true : (stryCov_9fa48("8937", "8938", "8939"), options.enableAdminStream !== (stryMutAct_9fa48("8940") ? true : (stryCov_9fa48("8940"), false)));

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.port = ADMIN_DEFAULT.WEBSOCKET_PORT;
      this.queryTimeoutMs = stryMutAct_9fa48("8943") ? config.get(ADMIN_CONFIG_KEY.QUERY_TIMEOUT_MS) && ADMIN_DEFAULT.QUERY_TIMEOUT_MS : stryMutAct_9fa48("8942") ? false : stryMutAct_9fa48("8941") ? true : (stryCov_9fa48("8941", "8942", "8943"), config.get(ADMIN_CONFIG_KEY.QUERY_TIMEOUT_MS) || ADMIN_DEFAULT.QUERY_TIMEOUT_MS);
      this.cacheDumpTimeoutMs = stryMutAct_9fa48("8946") ? config.get(ADMIN_CONFIG_KEY.CACHE_DUMP_TIMEOUT_MS) && ADMIN_DEFAULT.CACHE_DUMP_TIMEOUT_MS : stryMutAct_9fa48("8945") ? false : stryMutAct_9fa48("8944") ? true : (stryCov_9fa48("8944", "8945", "8946"), config.get(ADMIN_CONFIG_KEY.CACHE_DUMP_TIMEOUT_MS) || ADMIN_DEFAULT.CACHE_DUMP_TIMEOUT_MS);

      // Logging
      this.logger = this.initLogger();

      // Fastify instance
      this.fastify = null;
      this.initialized = stryMutAct_9fa48("8947") ? true : (stryCov_9fa48("8947"), false);
      this.listening = stryMutAct_9fa48("8948") ? true : (stryCov_9fa48("8948"), false);

      // Connected clients
      this.clients = new Set();

      // Control snapshot delegate
      this.controlSnapshot = new AdminControlSnapshot(stryMutAct_9fa48("8949") ? {} : (stryCov_9fa48("8949"), {
        systemTableCache: this.systemTableCache,
        nodeId: this.nodeId,
        cacheMutationTarget: this.cacheMutationTarget,
        sqlQueryEngine: this.sqlQueryEngine,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        controlPlaneReadinessService: this.controlPlaneReadinessService,
        startupRecoveryCoordinator: stryMutAct_9fa48("8952") ? options.startupRecoveryCoordinator && null : stryMutAct_9fa48("8951") ? false : stryMutAct_9fa48("8950") ? true : (stryCov_9fa48("8950", "8951", "8952"), options.startupRecoveryCoordinator || null),
        bootstrapReadinessState: stryMutAct_9fa48("8955") ? options.bootstrapReadinessState && null : stryMutAct_9fa48("8954") ? false : stryMutAct_9fa48("8953") ? true : (stryCov_9fa48("8953", "8954", "8955"), options.bootstrapReadinessState || null),
        heartbeatService: this.heartbeatService,
        ensureAuthoritativeDiscoveryCacheRepair: stryMutAct_9fa48("8956") ? () => undefined : (stryCov_9fa48("8956"), opts => stryMutAct_9fa48("8957") ? this.serviceDiscovery.ensureAuthoritativeDiscoveryCacheRepair(opts) : (stryCov_9fa48("8957"), this.serviceDiscovery?.ensureAuthoritativeDiscoveryCacheRepair(opts))),
        resolveLocalPartitionServices: stryMutAct_9fa48("8958") ? () => undefined : (stryCov_9fa48("8958"), () => this.serviceDiscovery.resolveLocalPartitionServices()),
        nowFn: this.nowFn
      }));

      // Preflight critical path snapshot delegate
      this.preflightSnapshot = new AdminPreflightSnapshot(stryMutAct_9fa48("8959") ? {} : (stryCov_9fa48("8959"), {
        systemTableCache: this.systemTableCache,
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        cacheMutationTarget: this.cacheMutationTarget,
        sqlQueryEngine: this.sqlQueryEngine,
        buildLocalServiceDiscoverySnapshot: stryMutAct_9fa48("8960") ? () => undefined : (stryCov_9fa48("8960"), opts => this.serviceDiscovery.buildLocalServiceDiscoverySnapshot(opts)),
        ensureAuthoritativeDiscoveryCacheRepair: stryMutAct_9fa48("8961") ? () => undefined : (stryCov_9fa48("8961"), opts => this.serviceDiscovery.ensureAuthoritativeDiscoveryCacheRepair(opts)),
        buildControlPlaneDiagnosticsSnapshot: stryMutAct_9fa48("8962") ? () => undefined : (stryCov_9fa48("8962"), () => this.controlSnapshot.buildControlPlaneDiagnosticsSnapshot())
      }));

      // Service discovery delegate
      this.serviceDiscovery = new AdminServiceDiscovery(stryMutAct_9fa48("8963") ? {} : (stryCov_9fa48("8963"), {
        systemTableCache: this.systemTableCache,
        nodeId: this.nodeId,
        logger: this.logger,
        cacheMutationTarget: this.cacheMutationTarget,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        cdcIntegrationService: this.cdcIntegrationService,
        partitionServicesProvider: this.partitionServicesProvider,
        partitionServices: this.partitionServices,
        sqlQueryEngine: this.sqlQueryEngine,
        buildPreflightCacheFreshnessSummary: stryMutAct_9fa48("8964") ? () => undefined : (stryCov_9fa48("8964"), opts => this.preflightSnapshot.buildPreflightCacheFreshnessSummary(opts)),
        buildControlSnapshotReplicaOperationSummary: stryMutAct_9fa48("8965") ? () => undefined : (stryCov_9fa48("8965"), (rows, opts) => this.controlSnapshot.buildControlSnapshotReplicaOperationSummary(rows, opts)),
        executeSqlRequestWithTimeout: stryMutAct_9fa48("8966") ? () => undefined : (stryCov_9fa48("8966"), (req, timeout) => this.executeSqlRequestWithTimeout(req, timeout)),
        nowFn: this.nowFn
      }));

      // Debug handlers delegate
      this.debugHandlers = new AdminDebugHandlers(stryMutAct_9fa48("8967") ? {} : (stryCov_9fa48("8967"), {
        debugMetadataStore: this.debugMetadataStore,
        debugDapRouter: this.debugDapRouter,
        traceCollector: this.traceCollector,
        logger: this.logger,
        testRunService: this.testRunService
      }));

      // Subscribe to cache notifications for CDC forwarding (Requirement 2.2)
      this.subscribeToCacheNotifications();
    }
  }

  /**
   * Subscribe to cache change notifications.
   * Broadcasts CDC events to all connected clients when cache changes.
   * @private
   */
  subscribeToCacheNotifications() {
    if (stryMutAct_9fa48("8968")) {
      {}
    } else {
      stryCov_9fa48("8968");
      if (stryMutAct_9fa48("8971") ? this.systemTableCache || typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("8970") ? false : stryMutAct_9fa48("8969") ? true : (stryCov_9fa48("8969", "8970", "8971"), this.systemTableCache && (stryMutAct_9fa48("8973") ? typeof this.systemTableCache.onCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("8972") ? true : (stryCov_9fa48("8972", "8973"), typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("8974")) {
          {}
        } else {
          stryCov_9fa48("8974");
          this.systemTableCache.onCacheChange((tableName, operation, record) => {
            if (stryMutAct_9fa48("8975")) {
              {}
            } else {
              stryCov_9fa48("8975");
              this.broadcastCDCEvent(tableName, operation, record);
            }
          });
        }
      }
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("8976")) {
      {}
    } else {
      stryCov_9fa48("8976");
      try {
        if (stryMutAct_9fa48("8977")) {
          {}
        } else {
          stryCov_9fa48("8977");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("8979") ? false : stryMutAct_9fa48("8978") ? true : (stryCov_9fa48("8978", "8979"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("8980")) {
              {}
            } else {
              stryCov_9fa48("8980");
              return loggingService.forSubsystem(ADMIN_SUBSYSTEM.WEBSOCKET_API);
            }
          }
        }
      } catch (_logErr) {
        // Logging not available — fall through to console
      }
      return console;
    }
  }

  /**
   * Initialize and start the WebSocket server.
   * @param {number} port - Port to listen on (optional).
   * @param {Object} [options] - Initialization options.
   * @param {boolean} [options.listen] - Whether to listen on a TCP port.
   * @return {Promise<void>}
   */
  async initialize(port, options = {}) {
    if (stryMutAct_9fa48("8981")) {
      {}
    } else {
      stryCov_9fa48("8981");
      if (stryMutAct_9fa48("8983") ? false : stryMutAct_9fa48("8982") ? true : (stryCov_9fa48("8982", "8983"), this.initialized)) {
        if (stryMutAct_9fa48("8984")) {
          {}
        } else {
          stryCov_9fa48("8984");
          return;
        }
      }
      const listenPort = (stryMutAct_9fa48("8987") ? port === undefined : stryMutAct_9fa48("8986") ? false : stryMutAct_9fa48("8985") ? true : (stryCov_9fa48("8985", "8986", "8987"), port !== undefined)) ? port : this.port;
      const shouldListen = stryMutAct_9fa48("8990") ? options.listen === false : stryMutAct_9fa48("8989") ? false : stryMutAct_9fa48("8988") ? true : (stryCov_9fa48("8988", "8989", "8990"), options.listen !== (stryMutAct_9fa48("8991") ? true : (stryCov_9fa48("8991"), false)));
      const listenHost = stryMutAct_9fa48("8994") ? options.host && ADMIN_DEFAULT.HOST : stryMutAct_9fa48("8993") ? false : stryMutAct_9fa48("8992") ? true : (stryCov_9fa48("8992", "8993", "8994"), options.host || ADMIN_DEFAULT.HOST);
      this.fastify = Fastify(stryMutAct_9fa48("8995") ? {} : (stryCov_9fa48("8995"), {
        logger: stryMutAct_9fa48("8996") ? true : (stryCov_9fa48("8996"), false)
      }));

      // Register WebSocket plugin
      await this.fastify.register(websocket);

      // Register routes
      this.registerRoutes();
      if (stryMutAct_9fa48("8998") ? false : stryMutAct_9fa48("8997") ? true : (stryCov_9fa48("8997", "8998"), shouldListen)) {
        if (stryMutAct_9fa48("8999")) {
          {}
        } else {
          stryCov_9fa48("8999");
          try {
            if (stryMutAct_9fa48("9000")) {
              {}
            } else {
              stryCov_9fa48("9000");
              await this.fastify.listen(stryMutAct_9fa48("9001") ? {} : (stryCov_9fa48("9001"), {
                port: listenPort,
                host: listenHost
              }));
              this.listening = stryMutAct_9fa48("9002") ? false : (stryCov_9fa48("9002"), true);
            }
          } catch (err) {
            if (stryMutAct_9fa48("9003")) {
              {}
            } else {
              stryCov_9fa48("9003");
              // Some environments disallow opening listening sockets (eg, unit-test sandboxes).
              // In that case, continue in "ready-only" mode so tests can use fastify.inject()
              // and/or direct handler invocation without binding ports.
              if (stryMutAct_9fa48("9006") ? err || err.code === ERRNO.EPERM || err.code === ERRNO.EACCES : stryMutAct_9fa48("9005") ? false : stryMutAct_9fa48("9004") ? true : (stryCov_9fa48("9004", "9005", "9006"), err && (stryMutAct_9fa48("9008") ? err.code === ERRNO.EPERM && err.code === ERRNO.EACCES : stryMutAct_9fa48("9007") ? true : (stryCov_9fa48("9007", "9008"), (stryMutAct_9fa48("9010") ? err.code !== ERRNO.EPERM : stryMutAct_9fa48("9009") ? false : (stryCov_9fa48("9009", "9010"), err.code === ERRNO.EPERM)) || (stryMutAct_9fa48("9012") ? err.code !== ERRNO.EACCES : stryMutAct_9fa48("9011") ? false : (stryCov_9fa48("9011", "9012"), err.code === ERRNO.EACCES)))))) {
                if (stryMutAct_9fa48("9013")) {
                  {}
                } else {
                  stryCov_9fa48("9013");
                  await this.fastify.ready();
                  this.listening = stryMutAct_9fa48("9014") ? true : (stryCov_9fa48("9014"), false);
                }
              } else {
                if (stryMutAct_9fa48("9015")) {
                  {}
                } else {
                  stryCov_9fa48("9015");
                  throw err;
                }
              }
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("9016")) {
          {}
        } else {
          stryCov_9fa48("9016");
          await this.fastify.ready();
          this.listening = stryMutAct_9fa48("9017") ? true : (stryCov_9fa48("9017"), false);
        }
      }
      this.initialized = stryMutAct_9fa48("9018") ? false : (stryCov_9fa48("9018"), true);
      this.logger.info(ADMIN_LOG_MSG.STARTED, stryMutAct_9fa48("9019") ? {} : (stryCov_9fa48("9019"), {
        port: this.listening ? listenPort : null,
        listen: this.listening,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Register API routes.
   * @private
   */
  registerRoutes() {
    if (stryMutAct_9fa48("9020")) {
      {}
    } else {
      stryCov_9fa48("9020");
      // Landing page routes.
      this.fastify.get(ADMIN_ROUTE.ROOT, async (_request, reply) => {
        if (stryMutAct_9fa48("9021")) {
          {}
        } else {
          stryCov_9fa48("9021");
          return this.handleDashboardPage(reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.TEST_DASHBOARD, async (_request, reply) => {
        if (stryMutAct_9fa48("9022")) {
          {}
        } else {
          stryCov_9fa48("9022");
          return this.handleDashboardPage(reply);
        }
      });

      // Health check endpoint
      this.fastify.get(ADMIN_ROUTE.HEALTH, async (_request, _reply) => {
        if (stryMutAct_9fa48("9023")) {
          {}
        } else {
          stryCov_9fa48("9023");
          return stryMutAct_9fa48("9024") ? {} : (stryCov_9fa48("9024"), {
            status: ADMIN_STATUS.HEALTHY,
            nodeId: this.nodeId,
            connectedClients: this.clients.size
          });
        }
      });
      this.fastify.get(ADMIN_ROUTE.SERVICE_DIAGNOSTICS, async (_request, reply) => {
        if (stryMutAct_9fa48("9025")) {
          {}
        } else {
          stryCov_9fa48("9025");
          return this.handleServiceDiagnostics(reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.CDC_DIAGNOSTICS, async (_request, reply) => {
        if (stryMutAct_9fa48("9026")) {
          {}
        } else {
          stryCov_9fa48("9026");
          return this.handleCdcDiagnostics(reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.PARTITION_DIAGNOSTICS, async (_request, reply) => {
        if (stryMutAct_9fa48("9027")) {
          {}
        } else {
          stryCov_9fa48("9027");
          return this.handlePartitionDiagnostics(reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.SQL_DIAGNOSTICS, async (_request, reply) => {
        if (stryMutAct_9fa48("9028")) {
          {}
        } else {
          stryCov_9fa48("9028");
          return this.handleSqlDiagnostics(reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.PREFLIGHT_CRITICAL_PATH_SNAPSHOT, async (_request, reply) => {
        if (stryMutAct_9fa48("9029")) {
          {}
        } else {
          stryCov_9fa48("9029");
          return this.handlePreflightCriticalPathSnapshot(reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.CONTROL_SNAPSHOT, async (request, reply) => {
        if (stryMutAct_9fa48("9030")) {
          {}
        } else {
          stryCov_9fa48("9030");
          return this.handleControlSnapshot(request, reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.SERVICE_DISCOVERY, async (request, reply) => {
        if (stryMutAct_9fa48("9031")) {
          {}
        } else {
          stryCov_9fa48("9031");
          return this.handleServiceDiscovery(request, reply);
        }
      });

      // Test administration endpoints.
      this.fastify.get(ADMIN_ROUTE.TESTS, async (_request, reply) => {
        if (stryMutAct_9fa48("9032")) {
          {}
        } else {
          stryCov_9fa48("9032");
          return this.handleListTests(reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.TEST_RUNS, async (_request, reply) => {
        if (stryMutAct_9fa48("9033")) {
          {}
        } else {
          stryCov_9fa48("9033");
          return this.handleListRuns(reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.TEST_RUN_BY_ID, async (request, reply) => {
        if (stryMutAct_9fa48("9034")) {
          {}
        } else {
          stryCov_9fa48("9034");
          return this.handleGetRun(request, reply);
        }
      });
      this.fastify.delete(ADMIN_ROUTE.TEST_RUN_BY_ID, async (request, reply) => {
        if (stryMutAct_9fa48("9035")) {
          {}
        } else {
          stryCov_9fa48("9035");
          return this.handleDeleteRun(request, reply);
        }
      });
      this.fastify.post(ADMIN_ROUTE.TEST_RUNS, async (request, reply) => {
        if (stryMutAct_9fa48("9036")) {
          {}
        } else {
          stryCov_9fa48("9036");
          return this.handleStartRun(request, reply);
        }
      });
      this.fastify.post(ADMIN_ROUTE.TEST_RUN_STOP, async (request, reply) => {
        if (stryMutAct_9fa48("9037")) {
          {}
        } else {
          stryCov_9fa48("9037");
          return this.handleStopRun(request, reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.TEST_RUN_STREAM, async (request, reply) => {
        if (stryMutAct_9fa48("9038")) {
          {}
        } else {
          stryCov_9fa48("9038");
          return this.handleRunStream(request, reply);
        }
      });
      this.fastify.post(ADMIN_ROUTE.DEBUG_SESSIONS, async (request, reply) => {
        if (stryMutAct_9fa48("9039")) {
          {}
        } else {
          stryCov_9fa48("9039");
          return this.debugHandlers.handleCreateDebugSession(request, reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.DEBUG_SESSION_BY_ID, async (request, reply) => {
        if (stryMutAct_9fa48("9040")) {
          {}
        } else {
          stryCov_9fa48("9040");
          return this.debugHandlers.handleGetDebugSession(request, reply);
        }
      });
      this.fastify.patch(ADMIN_ROUTE.DEBUG_SESSION_BY_ID, async (request, reply) => {
        if (stryMutAct_9fa48("9041")) {
          {}
        } else {
          stryCov_9fa48("9041");
          return this.debugHandlers.handleUpdateDebugSession(request, reply);
        }
      });
      this.fastify.post(ADMIN_ROUTE.DEBUG_SESSION_ATTACH, async (request, reply) => {
        if (stryMutAct_9fa48("9042")) {
          {}
        } else {
          stryCov_9fa48("9042");
          return this.debugHandlers.handleAttachDebugSession(request, reply);
        }
      });
      this.fastify.post(ADMIN_ROUTE.DEBUG_SESSION_BREAKPOINTS, async (request, reply) => {
        if (stryMutAct_9fa48("9043")) {
          {}
        } else {
          stryCov_9fa48("9043");
          return this.debugHandlers.handleWriteDebugBreakpoints(request, reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.DEBUG_SESSION_BREAKPOINTS, async (request, reply) => {
        if (stryMutAct_9fa48("9044")) {
          {}
        } else {
          stryCov_9fa48("9044");
          return this.debugHandlers.handleListDebugBreakpoints(request, reply);
        }
      });
      this.fastify.post(ADMIN_ROUTE.DEBUG_SESSION_SNAPSHOTS, async (request, reply) => {
        if (stryMutAct_9fa48("9045")) {
          {}
        } else {
          stryCov_9fa48("9045");
          return this.debugHandlers.handleWriteDebugSnapshot(request, reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.DEBUG_SESSION_SNAPSHOTS, async (request, reply) => {
        if (stryMutAct_9fa48("9046")) {
          {}
        } else {
          stryCov_9fa48("9046");
          return this.debugHandlers.handleListDebugSnapshots(request, reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.DEBUG_SNAPSHOT_BY_ID, async (request, reply) => {
        if (stryMutAct_9fa48("9047")) {
          {}
        } else {
          stryCov_9fa48("9047");
          return this.debugHandlers.handleGetDebugSnapshot(request, reply);
        }
      });
      this.fastify.post(ADMIN_ROUTE.DEBUG_DAP_REQUEST, async (request, reply) => {
        if (stryMutAct_9fa48("9048")) {
          {}
        } else {
          stryCov_9fa48("9048");
          return this.debugHandlers.handleDebugDapRequest(request, reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.PLAYBACK_VIEWER, async (_request, reply) => {
        if (stryMutAct_9fa48("9049")) {
          {}
        } else {
          stryCov_9fa48("9049");
          return this.debugHandlers.handlePlaybackViewerPage(reply);
        }
      });
      this.fastify.get(ADMIN_ROUTE.OUTPUT_FILES, async (request, reply) => {
        if (stryMutAct_9fa48("9050")) {
          {}
        } else {
          stryCov_9fa48("9050");
          return this.debugHandlers.handleOutputFile(request, reply);
        }
      });
      if (stryMutAct_9fa48("9052") ? false : stryMutAct_9fa48("9051") ? true : (stryCov_9fa48("9051", "9052"), this.enableAdminStream)) {
        if (stryMutAct_9fa48("9053")) {
          {}
        } else {
          stryCov_9fa48("9053");
          // WebSocket endpoint for admin stream
          // Note: @fastify/websocket passes socket directly in newer versions
          this.fastify.register(async fastify => {
            if (stryMutAct_9fa48("9054")) {
              {}
            } else {
              stryCov_9fa48("9054");
              fastify.get(ADMIN_ROUTE.STREAM, stryMutAct_9fa48("9055") ? {} : (stryCov_9fa48("9055"), {
                websocket: stryMutAct_9fa48("9056") ? false : (stryCov_9fa48("9056"), true)
              }), (socket, req) => {
                if (stryMutAct_9fa48("9057")) {
                  {}
                } else {
                  stryCov_9fa48("9057");
                  this.handleConnection(socket, req);
                }
              });
              fastify.get(ADMIN_ROUTE.DEBUG_TRACE_STREAM, stryMutAct_9fa48("9058") ? {} : (stryCov_9fa48("9058"), {
                websocket: stryMutAct_9fa48("9059") ? false : (stryCov_9fa48("9059"), true)
              }), (socket, request) => {
                if (stryMutAct_9fa48("9060")) {
                  {}
                } else {
                  stryCov_9fa48("9060");
                  this.debugHandlers.handleDebugTraceConnection(socket, request);
                }
              });
            }
          });
        }
      }
    }
  }

  /**
   * Serve dashboard landing page.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleDashboardPage(reply) {
    if (stryMutAct_9fa48("9061")) {
      {}
    } else {
      stryCov_9fa48("9061");
      try {
        if (stryMutAct_9fa48("9062")) {
          {}
        } else {
          stryCov_9fa48("9062");
          const page = await this.testRunService.readDashboardPage();
          reply.code(HTTP_STATUS.OK).header(HTTP_HEADER.CACHE_CONTROL, HTTP_HEADER_VALUE.NO_STORE).type(ADMIN_CONTENT_TYPE.HTML).send(page);
        }
      } catch (error) {
        if (stryMutAct_9fa48("9063")) {
          {}
        } else {
          stryCov_9fa48("9063");
          reply.code(HTTP_STATUS.NOT_FOUND).send(stryMutAct_9fa48("9064") ? {} : (stryCov_9fa48("9064"), {
            error: ADMIN_TEST_ERROR_MSG.DASHBOARD_NOT_FOUND,
            details: error.message
          }));
        }
      }
    }
  }

  /**
   * List distributed tests and configs.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleListTests(reply) {
    if (stryMutAct_9fa48("9065")) {
      {}
    } else {
      stryCov_9fa48("9065");
      try {
        if (stryMutAct_9fa48("9066")) {
          {}
        } else {
          stryCov_9fa48("9066");
          const [tests, configs] = await Promise.all(stryMutAct_9fa48("9067") ? [] : (stryCov_9fa48("9067"), [this.testRunService.listAvailableTests(), this.testRunService.listAvailableConfigs()]));
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("9068") ? {} : (stryCov_9fa48("9068"), {
            tests,
            configs,
            defaultConfig: ADMIN_TEST_DEFAULT.CONFIG_FILE
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("9069")) {
          {}
        } else {
          stryCov_9fa48("9069");
          reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(stryMutAct_9fa48("9070") ? {} : (stryCov_9fa48("9070"), {
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * List saved and active test runs.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleListRuns(reply) {
    if (stryMutAct_9fa48("9071")) {
      {}
    } else {
      stryCov_9fa48("9071");
      try {
        if (stryMutAct_9fa48("9072")) {
          {}
        } else {
          stryCov_9fa48("9072");
          const runs = await this.testRunService.listSavedRuns();
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("9073") ? {} : (stryCov_9fa48("9073"), {
            runs
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("9074")) {
          {}
        } else {
          stryCov_9fa48("9074");
          reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(stryMutAct_9fa48("9075") ? {} : (stryCov_9fa48("9075"), {
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Get one test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleGetRun(request, reply) {
    if (stryMutAct_9fa48("9076")) {
      {}
    } else {
      stryCov_9fa48("9076");
      const runId = request.params.runId;
      const run = await this.testRunService.getRun(runId);
      if (stryMutAct_9fa48("9079") ? false : stryMutAct_9fa48("9078") ? true : stryMutAct_9fa48("9077") ? run : (stryCov_9fa48("9077", "9078", "9079"), !run)) {
        if (stryMutAct_9fa48("9080")) {
          {}
        } else {
          stryCov_9fa48("9080");
          reply.code(HTTP_STATUS.NOT_FOUND).send(stryMutAct_9fa48("9081") ? {} : (stryCov_9fa48("9081"), {
            error: ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND
          }));
          return;
        }
      }
      reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("9082") ? {} : (stryCov_9fa48("9082"), {
        run
      }));
    }
  }

  /**
   * Start a distributed test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleStartRun(request, reply) {
    if (stryMutAct_9fa48("9083")) {
      {}
    } else {
      stryCov_9fa48("9083");
      try {
        if (stryMutAct_9fa48("9084")) {
          {}
        } else {
          stryCov_9fa48("9084");
          const run = await this.testRunService.startRun(stryMutAct_9fa48("9087") ? request.body && {} : stryMutAct_9fa48("9086") ? false : stryMutAct_9fa48("9085") ? true : (stryCov_9fa48("9085", "9086", "9087"), request.body || {}));
          this.logger.info(ADMIN_LOG_MSG.TEST_RUN_STARTED, stryMutAct_9fa48("9088") ? {} : (stryCov_9fa48("9088"), {
            runId: run.runId,
            scenario: run.scenario,
            gitHash: run.gitHash
          }));
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("9089") ? {} : (stryCov_9fa48("9089"), {
            run
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("9090")) {
          {}
        } else {
          stryCov_9fa48("9090");
          reply.code(this.resolveTestApiErrorStatus(error)).send(stryMutAct_9fa48("9091") ? {} : (stryCov_9fa48("9091"), {
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Stop a distributed test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleStopRun(request, reply) {
    if (stryMutAct_9fa48("9092")) {
      {}
    } else {
      stryCov_9fa48("9092");
      try {
        if (stryMutAct_9fa48("9093")) {
          {}
        } else {
          stryCov_9fa48("9093");
          const run = await this.testRunService.stopRun(request.params.runId);
          this.logger.info(ADMIN_LOG_MSG.TEST_RUN_STOP_REQUESTED, stryMutAct_9fa48("9094") ? {} : (stryCov_9fa48("9094"), {
            runId: run.runId,
            scenario: run.scenario
          }));
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("9095") ? {} : (stryCov_9fa48("9095"), {
            run
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("9096")) {
          {}
        } else {
          stryCov_9fa48("9096");
          reply.code(this.resolveTestApiErrorStatus(error)).send(stryMutAct_9fa48("9097") ? {} : (stryCov_9fa48("9097"), {
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Delete a completed distributed test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleDeleteRun(request, reply) {
    if (stryMutAct_9fa48("9098")) {
      {}
    } else {
      stryCov_9fa48("9098");
      try {
        if (stryMutAct_9fa48("9099")) {
          {}
        } else {
          stryCov_9fa48("9099");
          const result = await this.testRunService.deleteRun(request.params.runId);
          this.logger.info(ADMIN_LOG_MSG.TEST_RUN_DELETED, stryMutAct_9fa48("9100") ? {} : (stryCov_9fa48("9100"), {
            runId: result.runId
          }));
          reply.code(HTTP_STATUS.OK).send(result);
        }
      } catch (error) {
        if (stryMutAct_9fa48("9101")) {
          {}
        } else {
          stryCov_9fa48("9101");
          reply.code(this.resolveTestApiErrorStatus(error)).send(stryMutAct_9fa48("9102") ? {} : (stryCov_9fa48("9102"), {
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Stream live run events using SSE.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleRunStream(request, reply) {
    if (stryMutAct_9fa48("9103")) {
      {}
    } else {
      stryCov_9fa48("9103");
      const runId = request.params.runId;
      const existingRun = await this.testRunService.getRun(runId);
      if (stryMutAct_9fa48("9106") ? false : stryMutAct_9fa48("9105") ? true : stryMutAct_9fa48("9104") ? existingRun : (stryCov_9fa48("9104", "9105", "9106"), !existingRun)) {
        if (stryMutAct_9fa48("9107")) {
          {}
        } else {
          stryCov_9fa48("9107");
          reply.code(HTTP_STATUS.NOT_FOUND).send(stryMutAct_9fa48("9108") ? {} : (stryCov_9fa48("9108"), {
            error: ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND
          }));
          return;
        }
      }
      let subscription = null;
      let closed = stryMutAct_9fa48("9109") ? true : (stryCov_9fa48("9109"), false);
      const sendEvent = eventPayload => {
        if (stryMutAct_9fa48("9110")) {
          {}
        } else {
          stryCov_9fa48("9110");
          if (stryMutAct_9fa48("9112") ? false : stryMutAct_9fa48("9111") ? true : (stryCov_9fa48("9111", "9112"), closed)) {
            if (stryMutAct_9fa48("9113")) {
              {}
            } else {
              stryCov_9fa48("9113");
              return;
            }
          }
          try {
            if (stryMutAct_9fa48("9114")) {
              {}
            } else {
              stryCov_9fa48("9114");
              const frame = stryMutAct_9fa48("9115") ? `` : (stryCov_9fa48("9115"), `${SSE_FRAME_PREFIX}${JSON.stringify(eventPayload)}${SSE_FRAME_SUFFIX}`);
              reply.raw.write(frame);
            }
          } catch (_streamErr) {
            // Stream errors are handled by close listener cleanup.
          }
        }
      };
      subscription = this.testRunService.subscribeToRun(runId, sendEvent);
      if (stryMutAct_9fa48("9118") ? false : stryMutAct_9fa48("9117") ? true : stryMutAct_9fa48("9116") ? subscription : (stryCov_9fa48("9116", "9117", "9118"), !subscription)) {
        if (stryMutAct_9fa48("9119")) {
          {}
        } else {
          stryCov_9fa48("9119");
          reply.hijack();
          reply.raw.statusCode = HTTP_STATUS.OK;
          reply.raw.setHeader(HTTP_HEADER.CACHE_CONTROL, HTTP_HEADER_VALUE.NO_CACHE);
          reply.raw.setHeader(HTTP_HEADER.CONNECTION, HTTP_HEADER_VALUE.KEEP_ALIVE);
          reply.raw.setHeader(HTTP_HEADER.CONTENT_TYPE, ADMIN_CONTENT_TYPE.EVENT_STREAM);
          sendEvent(stryMutAct_9fa48("9120") ? {} : (stryCov_9fa48("9120"), {
            type: ADMIN_TEST_STREAM_EVENT.STATUS,
            data: existingRun
          }));
          for (const entry of stryMutAct_9fa48("9123") ? existingRun.logs && [] : stryMutAct_9fa48("9122") ? false : stryMutAct_9fa48("9121") ? true : (stryCov_9fa48("9121", "9122", "9123"), existingRun.logs || (stryMutAct_9fa48("9124") ? ["Stryker was here"] : (stryCov_9fa48("9124"), [])))) {
            if (stryMutAct_9fa48("9125")) {
              {}
            } else {
              stryCov_9fa48("9125");
              sendEvent(stryMutAct_9fa48("9126") ? {} : (stryCov_9fa48("9126"), {
                type: ADMIN_TEST_STREAM_EVENT.LOG,
                data: entry
              }));
            }
          }
          reply.raw.end();
          return;
        }
      }
      reply.hijack();
      reply.raw.statusCode = HTTP_STATUS.OK;
      reply.raw.setHeader(HTTP_HEADER.CACHE_CONTROL, HTTP_HEADER_VALUE.NO_CACHE);
      reply.raw.setHeader(HTTP_HEADER.CONNECTION, HTTP_HEADER_VALUE.KEEP_ALIVE);
      reply.raw.setHeader(HTTP_HEADER.CONTENT_TYPE, ADMIN_CONTENT_TYPE.EVENT_STREAM);
      this.logger.info(ADMIN_LOG_MSG.TEST_RUN_LOG_STREAM_SUBSCRIBED, stryMutAct_9fa48("9127") ? {} : (stryCov_9fa48("9127"), {
        runId
      }));
      sendEvent(stryMutAct_9fa48("9128") ? {} : (stryCov_9fa48("9128"), {
        type: ADMIN_TEST_STREAM_EVENT.STATUS,
        data: subscription.run
      }));
      for (const entry of subscription.backlog) {
        if (stryMutAct_9fa48("9129")) {
          {}
        } else {
          stryCov_9fa48("9129");
          sendEvent(stryMutAct_9fa48("9130") ? {} : (stryCov_9fa48("9130"), {
            type: ADMIN_TEST_STREAM_EVENT.LOG,
            data: entry
          }));
        }
      }
      request.raw.on(TRANSPORT_EVENT.CLOSE, () => {
        if (stryMutAct_9fa48("9131")) {
          {}
        } else {
          stryCov_9fa48("9131");
          if (stryMutAct_9fa48("9133") ? false : stryMutAct_9fa48("9132") ? true : (stryCov_9fa48("9132", "9133"), closed)) {
            if (stryMutAct_9fa48("9134")) {
              {}
            } else {
              stryCov_9fa48("9134");
              return;
            }
          }
          closed = stryMutAct_9fa48("9135") ? false : (stryCov_9fa48("9135"), true);
          subscription.unsubscribe();
          this.logger.info(ADMIN_LOG_MSG.TEST_RUN_LOG_STREAM_UNSUBSCRIBED, stryMutAct_9fa48("9136") ? {} : (stryCov_9fa48("9136"), {
            runId
          }));
          reply.raw.end();
        }
      });
    }
  }

  /**
   * Resolve status code for admin test API errors.
   * @param {Error} error
   * @return {number}
   * @private
   */
  resolveTestApiErrorStatus(error) {
    if (stryMutAct_9fa48("9137")) {
      {}
    } else {
      stryCov_9fa48("9137");
      const message = stryMutAct_9fa48("9140") ? error?.message && EMPTY_STRING : stryMutAct_9fa48("9139") ? false : stryMutAct_9fa48("9138") ? true : (stryCov_9fa48("9138", "9139", "9140"), (stryMutAct_9fa48("9141") ? error.message : (stryCov_9fa48("9141"), error?.message)) || EMPTY_STRING);
      if (stryMutAct_9fa48("9144") ? (message === ADMIN_TEST_ERROR_MSG.SCENARIO_REQUIRED || message === ADMIN_TEST_ERROR_MSG.RUN_NOT_ACTIVE || message === ADMIN_TEST_ERROR_MSG.RUN_DELETE_ACTIVE) && message.startsWith(`${ADMIN_TEST_ERROR_MSG.CONFIG_PREFLIGHT_FAILED}: `) : stryMutAct_9fa48("9143") ? false : stryMutAct_9fa48("9142") ? true : (stryCov_9fa48("9142", "9143", "9144"), (stryMutAct_9fa48("9146") ? (message === ADMIN_TEST_ERROR_MSG.SCENARIO_REQUIRED || message === ADMIN_TEST_ERROR_MSG.RUN_NOT_ACTIVE) && message === ADMIN_TEST_ERROR_MSG.RUN_DELETE_ACTIVE : stryMutAct_9fa48("9145") ? false : (stryCov_9fa48("9145", "9146"), (stryMutAct_9fa48("9148") ? message === ADMIN_TEST_ERROR_MSG.SCENARIO_REQUIRED && message === ADMIN_TEST_ERROR_MSG.RUN_NOT_ACTIVE : stryMutAct_9fa48("9147") ? false : (stryCov_9fa48("9147", "9148"), (stryMutAct_9fa48("9150") ? message !== ADMIN_TEST_ERROR_MSG.SCENARIO_REQUIRED : stryMutAct_9fa48("9149") ? false : (stryCov_9fa48("9149", "9150"), message === ADMIN_TEST_ERROR_MSG.SCENARIO_REQUIRED)) || (stryMutAct_9fa48("9152") ? message !== ADMIN_TEST_ERROR_MSG.RUN_NOT_ACTIVE : stryMutAct_9fa48("9151") ? false : (stryCov_9fa48("9151", "9152"), message === ADMIN_TEST_ERROR_MSG.RUN_NOT_ACTIVE)))) || (stryMutAct_9fa48("9154") ? message !== ADMIN_TEST_ERROR_MSG.RUN_DELETE_ACTIVE : stryMutAct_9fa48("9153") ? false : (stryCov_9fa48("9153", "9154"), message === ADMIN_TEST_ERROR_MSG.RUN_DELETE_ACTIVE)))) || (stryMutAct_9fa48("9155") ? message.endsWith(`${ADMIN_TEST_ERROR_MSG.CONFIG_PREFLIGHT_FAILED}: `) : (stryCov_9fa48("9155"), message.startsWith(stryMutAct_9fa48("9156") ? `` : (stryCov_9fa48("9156"), `${ADMIN_TEST_ERROR_MSG.CONFIG_PREFLIGHT_FAILED}: `)))))) {
        if (stryMutAct_9fa48("9157")) {
          {}
        } else {
          stryCov_9fa48("9157");
          return HTTP_STATUS.BAD_REQUEST;
        }
      }
      if (stryMutAct_9fa48("9160") ? (message === ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND || message === ADMIN_TEST_ERROR_MSG.SCENARIO_NOT_FOUND) && message === ADMIN_TEST_ERROR_MSG.CONFIG_NOT_FOUND : stryMutAct_9fa48("9159") ? false : stryMutAct_9fa48("9158") ? true : (stryCov_9fa48("9158", "9159", "9160"), (stryMutAct_9fa48("9162") ? message === ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND && message === ADMIN_TEST_ERROR_MSG.SCENARIO_NOT_FOUND : stryMutAct_9fa48("9161") ? false : (stryCov_9fa48("9161", "9162"), (stryMutAct_9fa48("9164") ? message !== ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND : stryMutAct_9fa48("9163") ? false : (stryCov_9fa48("9163", "9164"), message === ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND)) || (stryMutAct_9fa48("9166") ? message !== ADMIN_TEST_ERROR_MSG.SCENARIO_NOT_FOUND : stryMutAct_9fa48("9165") ? false : (stryCov_9fa48("9165", "9166"), message === ADMIN_TEST_ERROR_MSG.SCENARIO_NOT_FOUND)))) || (stryMutAct_9fa48("9168") ? message !== ADMIN_TEST_ERROR_MSG.CONFIG_NOT_FOUND : stryMutAct_9fa48("9167") ? false : (stryCov_9fa48("9167", "9168"), message === ADMIN_TEST_ERROR_MSG.CONFIG_NOT_FOUND)))) {
        if (stryMutAct_9fa48("9169")) {
          {}
        } else {
          stryCov_9fa48("9169");
          return HTTP_STATUS.NOT_FOUND;
        }
      }
      return HTTP_STATUS.INTERNAL_SERVER_ERROR;
    }
  }

  /**
   * Normalize one admin websocket lane string.
   * @param {*} lane
   * @return {string}
   * @private
   */
  resolveAdminClientLane(lane) {
    if (stryMutAct_9fa48("9170")) {
      {}
    } else {
      stryCov_9fa48("9170");
      if (stryMutAct_9fa48("9173") ? typeof lane === TYPEOF.STRING : stryMutAct_9fa48("9172") ? false : stryMutAct_9fa48("9171") ? true : (stryCov_9fa48("9171", "9172", "9173"), typeof lane !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("9174")) {
          {}
        } else {
          stryCov_9fa48("9174");
          return ADMIN_STREAM_LANE_DEFAULT;
        }
      }
      const normalized = stryMutAct_9fa48("9176") ? lane.toLowerCase() : stryMutAct_9fa48("9175") ? lane.trim().toUpperCase() : (stryCov_9fa48("9175", "9176"), lane.trim().toLowerCase());
      if (stryMutAct_9fa48("9179") ? normalized.length !== NUM.ZERO : stryMutAct_9fa48("9178") ? false : stryMutAct_9fa48("9177") ? true : (stryCov_9fa48("9177", "9178", "9179"), normalized.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("9180")) {
          {}
        } else {
          stryCov_9fa48("9180");
          return ADMIN_STREAM_LANE_DEFAULT;
        }
      }
      return normalized;
    }
  }

  /**
   * Handle new WebSocket connection.
   * @param {Object} socket - WebSocket connection.
   * @param {Object} [request] - Fastify request.
   * @private
   */
  handleConnection(socket, request = null) {
    if (stryMutAct_9fa48("9181")) {
      {}
    } else {
      stryCov_9fa48("9181");
      const lane = this.resolveAdminClientLane(stryMutAct_9fa48("9183") ? request.query?.lane : stryMutAct_9fa48("9182") ? request?.query.lane : (stryCov_9fa48("9182", "9183"), request?.query?.lane));
      const clientId = (stryMutAct_9fa48("9184") ? `` : (stryCov_9fa48("9184"), `${ADMIN_CLIENT.PREFIX}${Date.now()}-`)) + (stryMutAct_9fa48("9185") ? `` : (stryCov_9fa48("9185"), `${stryMutAct_9fa48("9186") ? Math.random().toString(ADMIN_CLIENT.RANDOM_BASE) : (stryCov_9fa48("9186"), Math.random().toString(ADMIN_CLIENT.RANDOM_BASE).substr(ADMIN_CLIENT.RANDOM_START, ADMIN_CLIENT.RANDOM_LENGTH))}`));
      this.logger.info(ADMIN_LOG_MSG.CLIENT_CONNECTED, stryMutAct_9fa48("9187") ? {} : (stryCov_9fa48("9187"), {
        clientId,
        lane,
        totalClients: stryMutAct_9fa48("9188") ? this.clients.size - NUM.ONE : (stryCov_9fa48("9188"), this.clients.size + NUM.ONE)
      }));

      // Add to connected clients
      const clientInfo = stryMutAct_9fa48("9189") ? {} : (stryCov_9fa48("9189"), {
        id: clientId,
        lane,
        socket,
        connectedAt: Date.now(),
        liveQueryMap: new Map()
      });
      this.clients.add(clientInfo);

      // Send cache dump on connection
      this.sendCacheDump(clientInfo);

      // Handle incoming messages
      socket.on(TRANSPORT_EVENT.MESSAGE, data => {
        if (stryMutAct_9fa48("9190")) {
          {}
        } else {
          stryCov_9fa48("9190");
          this.handleMessage(clientInfo, data);
        }
      });

      // Handle disconnection
      socket.on(TRANSPORT_EVENT.CLOSE, () => {
        if (stryMutAct_9fa48("9191")) {
          {}
        } else {
          stryCov_9fa48("9191");
          this.handleDisconnection(clientInfo);
        }
      });

      // Handle errors
      socket.on(TRANSPORT_EVENT.ERROR, error => {
        if (stryMutAct_9fa48("9192")) {
          {}
        } else {
          stryCov_9fa48("9192");
          this.logger.error(ADMIN_LOG_MSG.SOCKET_ERROR, stryMutAct_9fa48("9193") ? {} : (stryCov_9fa48("9193"), {
            clientId,
            error: error.message
          }));
        }
      });
    }
  }

  /**
   * Handle client disconnection.
   * @param {Object} clientInfo - Client information.
   * @private
   */
  handleDisconnection(clientInfo) {
    if (stryMutAct_9fa48("9194")) {
      {}
    } else {
      stryCov_9fa48("9194");
      this.clients.delete(clientInfo);
      if (stryMutAct_9fa48("9196") ? false : stryMutAct_9fa48("9195") ? true : (stryCov_9fa48("9195", "9196"), this.liveQueryManager)) {
        if (stryMutAct_9fa48("9197")) {
          {}
        } else {
          stryCov_9fa48("9197");
          this.liveQueryManager.handleClientDisconnection(clientInfo.id);
        }
      }
      this.logger.info(ADMIN_LOG_MSG.CLIENT_DISCONNECTED, stryMutAct_9fa48("9198") ? {} : (stryCov_9fa48("9198"), {
        clientId: clientInfo.id,
        lane: this.resolveAdminClientLane(stryMutAct_9fa48("9199") ? clientInfo.lane : (stryCov_9fa48("9199"), clientInfo?.lane)),
        totalClients: this.clients.size
      }));
    }
  }

  /**
   * Send cache dump to a client.
   * @param {Object} clientInfo - Client information.
   * @param {Array<string>} [tables] - Optional table filter.
   * @private
   */
  sendCacheDump(clientInfo, tables) {
    if (stryMutAct_9fa48("9200")) {
      {}
    } else {
      stryCov_9fa48("9200");
      const cacheDump = this.buildValidatedCacheDump(tables);
      this.sendCacheDumpPayload(clientInfo, cacheDump);
    }
  }

  /**
   * Build and validate one cache-dump payload.
   * @param {Array<string>} [tables] - Optional table filter.
   * @return {Object}
   * @private
   */
  buildValidatedCacheDump(tables) {
    if (stryMutAct_9fa48("9201")) {
      {}
    } else {
      stryCov_9fa48("9201");
      const cacheDump = this.buildCacheDump(tables);
      const isEmpty = stryMutAct_9fa48("9202") ? Object.values(cacheDump).some(rows => Array.isArray(rows) && rows.length === NUM.ZERO) : (stryCov_9fa48("9202"), Object.values(cacheDump).every(stryMutAct_9fa48("9203") ? () => undefined : (stryCov_9fa48("9203"), rows => stryMutAct_9fa48("9206") ? Array.isArray(rows) || rows.length === NUM.ZERO : stryMutAct_9fa48("9205") ? false : stryMutAct_9fa48("9204") ? true : (stryCov_9fa48("9204", "9205", "9206"), Array.isArray(rows) && (stryMutAct_9fa48("9208") ? rows.length !== NUM.ZERO : stryMutAct_9fa48("9207") ? true : (stryCov_9fa48("9207", "9208"), rows.length === NUM.ZERO))))));
      if (stryMutAct_9fa48("9210") ? false : stryMutAct_9fa48("9209") ? true : (stryCov_9fa48("9209", "9210"), isEmpty)) {
        if (stryMutAct_9fa48("9211")) {
          {}
        } else {
          stryCov_9fa48("9211");
          throw createAdminOperationError(ErrorCode.INTERNAL_ERROR, ADMIN_ERROR_MESSAGE.SYSTEM_CACHE_EMPTY);
        }
      }
      return cacheDump;
    }
  }

  /**
   * Send one prepared cache-dump payload.
   * @param {Object} clientInfo
   * @param {Object} cacheDump
   * @private
   */
  sendCacheDumpPayload(clientInfo, cacheDump) {
    if (stryMutAct_9fa48("9212")) {
      {}
    } else {
      stryCov_9fa48("9212");
      this.sendToClient(clientInfo, stryMutAct_9fa48("9213") ? {} : (stryCov_9fa48("9213"), {
        type: MessageType.CACHE_DUMP,
        timestamp: Date.now(),
        nodeId: this.nodeId,
        data: cacheDump
      }));
      this.logger.debug(ADMIN_LOG_MSG.CACHE_DUMP_SENT, stryMutAct_9fa48("9214") ? {} : (stryCov_9fa48("9214"), {
        clientId: clientInfo.id,
        tableCount: Object.keys(cacheDump).length
      }));
    }
  }

  /**
   * Build cache dump from system table cache.
   * @param {Array<string>} [tables] - Optional table filter.
   * @return {Object} Cache dump with all system tables.
   * @private
   */
  buildCacheDump(tables) {
    if (stryMutAct_9fa48("9215")) {
      {}
    } else {
      stryCov_9fa48("9215");
      const targetTables = stryMutAct_9fa48("9218") ? tables && CACHE_DUMP_TABLES : stryMutAct_9fa48("9217") ? false : stryMutAct_9fa48("9216") ? true : (stryCov_9fa48("9216", "9217", "9218"), tables || CACHE_DUMP_TABLES);
      const dump = {};
      if (stryMutAct_9fa48("9221") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("9220") ? false : stryMutAct_9fa48("9219") ? true : (stryCov_9fa48("9219", "9220", "9221"), (stryMutAct_9fa48("9222") ? this.systemTableCache : (stryCov_9fa48("9222"), !this.systemTableCache)) || (stryMutAct_9fa48("9224") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("9223") ? false : (stryCov_9fa48("9223", "9224"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("9225")) {
          {}
        } else {
          stryCov_9fa48("9225");
          throw new Error(stryMutAct_9fa48("9226") ? "" : (stryCov_9fa48("9226"), 'System table cache not initialized'));
        }
      }
      for (const tableName of targetTables) {
        if (stryMutAct_9fa48("9227")) {
          {}
        } else {
          stryCov_9fa48("9227");
          try {
            if (stryMutAct_9fa48("9228")) {
              {}
            } else {
              stryCov_9fa48("9228");
              dump[tableName] = this.systemTableCache.getAll(tableName);
            }
          } catch (_cacheErr) {
            if (stryMutAct_9fa48("9229")) {
              {}
            } else {
              stryCov_9fa48("9229");
              dump[tableName] = ADMIN_CACHE_DUMP.EMPTY;
            }
          }
        }
      }
      return dump;
    }
  }

  /**
   * Create default local dispatcher implementing canonical dispatch interface.
   * @return {Object}
   * @private
   */
  createLocalServiceDispatcher() {
    if (stryMutAct_9fa48("9230")) {
      {}
    } else {
      stryCov_9fa48("9230");
      return stryMutAct_9fa48("9231") ? {} : (stryCov_9fa48("9231"), {
        dispatch: async (envelope, context = {}) => {
          if (stryMutAct_9fa48("9232")) {
            {}
          } else {
            stryCov_9fa48("9232");
            const payload = await this.executeLocalServiceEnvelope(envelope, context);
            return stryMutAct_9fa48("9233") ? {} : (stryCov_9fa48("9233"), {
              envelope,
              target: stryMutAct_9fa48("9234") ? {} : (stryCov_9fa48("9234"), {
                targetAddress: ADMIN_LOCAL_DISPATCH.TARGET_ADDRESS,
                targetNodeId: this.nodeId
              }),
              delivery: stryMutAct_9fa48("9235") ? {} : (stryCov_9fa48("9235"), {
                acknowledged: stryMutAct_9fa48("9236") ? false : (stryCov_9fa48("9236"), true),
                payload
              })
            });
          }
        }
      });
    }
  }

  /**
   * Execute one canonical Service_Message envelope locally.
   * @param {Object} envelope
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalServiceEnvelope(envelope, context = {}) {
    if (stryMutAct_9fa48("9237")) {
      {}
    } else {
      stryCov_9fa48("9237");
      const operation = stryMutAct_9fa48("9238") ? envelope.operation : (stryCov_9fa48("9238"), envelope?.operation);
      const payload = stryMutAct_9fa48("9241") ? envelope?.payload && {} : stryMutAct_9fa48("9240") ? false : stryMutAct_9fa48("9239") ? true : (stryCov_9fa48("9239", "9240", "9241"), (stryMutAct_9fa48("9242") ? envelope.payload : (stryCov_9fa48("9242"), envelope?.payload)) || {});
      if (stryMutAct_9fa48("9245") ? operation !== ADMIN_SERVICE_OPERATION.EXECUTE_QUERY : stryMutAct_9fa48("9244") ? false : stryMutAct_9fa48("9243") ? true : (stryCov_9fa48("9243", "9244", "9245"), operation === ADMIN_SERVICE_OPERATION.EXECUTE_QUERY)) {
        if (stryMutAct_9fa48("9246")) {
          {}
        } else {
          stryCov_9fa48("9246");
          return stryMutAct_9fa48("9247") ? {} : (stryCov_9fa48("9247"), {
            queryResult: await this.executeLocalQueryEnvelope(payload, context)
          });
        }
      }
      if (stryMutAct_9fa48("9250") ? operation !== ADMIN_SERVICE_OPERATION.EXECUTE_PARTITION_CALLBACK : stryMutAct_9fa48("9249") ? false : stryMutAct_9fa48("9248") ? true : (stryCov_9fa48("9248", "9249", "9250"), operation === ADMIN_SERVICE_OPERATION.EXECUTE_PARTITION_CALLBACK)) {
        if (stryMutAct_9fa48("9251")) {
          {}
        } else {
          stryCov_9fa48("9251");
          return stryMutAct_9fa48("9252") ? {} : (stryCov_9fa48("9252"), {
            queryResult: await this.executeLocalPartitionCallbackEnvelope(payload, context)
          });
        }
      }
      if (stryMutAct_9fa48("9255") ? operation !== ADMIN_SERVICE_OPERATION.GET_CACHE_DUMP : stryMutAct_9fa48("9254") ? false : stryMutAct_9fa48("9253") ? true : (stryCov_9fa48("9253", "9254", "9255"), operation === ADMIN_SERVICE_OPERATION.GET_CACHE_DUMP)) {
        if (stryMutAct_9fa48("9256")) {
          {}
        } else {
          stryCov_9fa48("9256");
          return stryMutAct_9fa48("9257") ? {} : (stryCov_9fa48("9257"), {
            cacheDump: this.executeLocalCacheDumpEnvelope()
          });
        }
      }
      throw createAdminOperationError(ErrorCode.INTERNAL_ERROR, stryMutAct_9fa48("9258") ? `` : (stryCov_9fa48("9258"), `${ADMIN_ERROR_MESSAGE.SERVICE_DISPATCH_OPERATION_UNSUPPORTED}: ${operation}`));
    }
  }

  /**
   * Return true when one request is executing on the load lane.
   * @param {Object} executionContext
   * @return {boolean}
   * @private
   */
  isLoadLaneExecution(executionContext = {}) {
    if (stryMutAct_9fa48("9259")) {
      {}
    } else {
      stryCov_9fa48("9259");
      const lane = this.resolveAdminClientLane(stryMutAct_9fa48("9261") ? executionContext.clientInfo?.lane : stryMutAct_9fa48("9260") ? executionContext?.clientInfo.lane : (stryCov_9fa48("9260", "9261"), executionContext?.clientInfo?.lane));
      return stryMutAct_9fa48("9264") ? lane !== ADMIN_STREAM_LANE_LOAD : stryMutAct_9fa48("9263") ? false : stryMutAct_9fa48("9262") ? true : (stryCov_9fa48("9262", "9263", "9264"), lane === ADMIN_STREAM_LANE_LOAD);
    }
  }

  /**
   * Return true when one request is executing on a local-observation lane.
   * Probe/snapshot lanes must not amplify cluster pressure with
   * authoritative discovery repair.
   * @param {Object} executionContext
   * @return {boolean}
   * @private
   */
  isLocalObservationLaneExecution(executionContext = {}) {
    if (stryMutAct_9fa48("9265")) {
      {}
    } else {
      stryCov_9fa48("9265");
      const lane = this.resolveAdminClientLane(stryMutAct_9fa48("9267") ? executionContext.clientInfo?.lane : stryMutAct_9fa48("9266") ? executionContext?.clientInfo.lane : (stryCov_9fa48("9266", "9267"), executionContext?.clientInfo?.lane));
      return stryMutAct_9fa48("9270") ? lane === ADMIN_STREAM_LANE_PROBE && lane === ADMIN_STREAM_LANE_SNAPSHOT : stryMutAct_9fa48("9269") ? false : stryMutAct_9fa48("9268") ? true : (stryCov_9fa48("9268", "9269", "9270"), (stryMutAct_9fa48("9272") ? lane !== ADMIN_STREAM_LANE_PROBE : stryMutAct_9fa48("9271") ? false : (stryCov_9fa48("9271", "9272"), lane === ADMIN_STREAM_LANE_PROBE)) || (stryMutAct_9fa48("9274") ? lane !== ADMIN_STREAM_LANE_SNAPSHOT : stryMutAct_9fa48("9273") ? false : (stryCov_9fa48("9273", "9274"), lane === ADMIN_STREAM_LANE_SNAPSHOT)));
    }
  }

  /**
   * Evaluate node-local pressure for local observation queries.
   * @return {Object|null}
   * @private
   */
  evaluateLocalObservationPressure() {
    if (stryMutAct_9fa48("9275")) {
      {}
    } else {
      stryCov_9fa48("9275");
      if (stryMutAct_9fa48("9278") ? false : stryMutAct_9fa48("9277") ? true : stryMutAct_9fa48("9276") ? this.messageRouter : (stryCov_9fa48("9276", "9277", "9278"), !this.messageRouter)) {
        if (stryMutAct_9fa48("9279")) {
          {}
        } else {
          stryCov_9fa48("9279");
          return null;
        }
      }
      return PressureGovernor.getShared(stryMutAct_9fa48("9280") ? {} : (stryCov_9fa48("9280"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        now: this.nowFn
      })).evaluate(stryMutAct_9fa48("9281") ? {} : (stryCov_9fa48("9281"), {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        resourceKeys: stryMutAct_9fa48("9282") ? [] : (stryCov_9fa48("9282"), [stryMutAct_9fa48("9283") ? "" : (stryCov_9fa48("9283"), 'control-plane:read'), stryMutAct_9fa48("9284") ? "" : (stryCov_9fa48("9284"), 'control-plane:admin-local-observation')]),
        allowDegrade: stryMutAct_9fa48("9285") ? false : (stryCov_9fa48("9285"), true)
      }));
    }
  }

  /**
   * Resolve execution policy for control-snapshot/service-discovery
   * local observation queries.
   * @param {Object} executionContext
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  resolveLocalObservationExecutionPolicy(executionContext = {}, options = {}) {
    if (stryMutAct_9fa48("9286")) {
      {}
    } else {
      stryCov_9fa48("9286");
      const forceAuthoritativeRepair = stryMutAct_9fa48("9289") ? options.forceAuthoritativeRepair !== true : stryMutAct_9fa48("9288") ? false : stryMutAct_9fa48("9287") ? true : (stryCov_9fa48("9287", "9288", "9289"), options.forceAuthoritativeRepair === (stryMutAct_9fa48("9290") ? false : (stryCov_9fa48("9290"), true)));
      if (stryMutAct_9fa48("9292") ? false : stryMutAct_9fa48("9291") ? true : (stryCov_9fa48("9291", "9292"), forceAuthoritativeRepair)) {
        if (stryMutAct_9fa48("9293")) {
          {}
        } else {
          stryCov_9fa48("9293");
          return stryMutAct_9fa48("9294") ? {} : (stryCov_9fa48("9294"), {
            allowAuthoritativeRepair: stryMutAct_9fa48("9295") ? false : (stryCov_9fa48("9295"), true),
            allowAuthoritativeReadinessRefresh: stryMutAct_9fa48("9296") ? true : (stryCov_9fa48("9296"), false),
            allowStaleReadinessOnCacheChange: stryMutAct_9fa48("9297") ? false : (stryCov_9fa48("9297"), true)
          });
        }
      }
      return stryMutAct_9fa48("9298") ? {} : (stryCov_9fa48("9298"), {
        allowAuthoritativeRepair: stryMutAct_9fa48("9299") ? true : (stryCov_9fa48("9299"), false),
        allowAuthoritativeReadinessRefresh: stryMutAct_9fa48("9300") ? true : (stryCov_9fa48("9300"), false),
        allowStaleReadinessOnCacheChange: stryMutAct_9fa48("9301") ? false : (stryCov_9fa48("9301"), true)
      });
    }
  }

  /**
   * Resolve local readiness snapshot for load-lane admission checks.
   * @return {Object|null}
   * @private
   */
  async resolveLoadLaneReadinessSnapshot() {
    if (stryMutAct_9fa48("9302")) {
      {}
    } else {
      stryCov_9fa48("9302");
      if (stryMutAct_9fa48("9305") ? (!this.controlPlaneReadinessService || typeof this.nodeId !== TYPEOF.STRING) && this.nodeId.length === NUM.ZERO : stryMutAct_9fa48("9304") ? false : stryMutAct_9fa48("9303") ? true : (stryCov_9fa48("9303", "9304", "9305"), (stryMutAct_9fa48("9307") ? !this.controlPlaneReadinessService && typeof this.nodeId !== TYPEOF.STRING : stryMutAct_9fa48("9306") ? false : (stryCov_9fa48("9306", "9307"), (stryMutAct_9fa48("9308") ? this.controlPlaneReadinessService : (stryCov_9fa48("9308"), !this.controlPlaneReadinessService)) || (stryMutAct_9fa48("9310") ? typeof this.nodeId === TYPEOF.STRING : stryMutAct_9fa48("9309") ? false : (stryCov_9fa48("9309", "9310"), typeof this.nodeId !== TYPEOF.STRING)))) || (stryMutAct_9fa48("9312") ? this.nodeId.length !== NUM.ZERO : stryMutAct_9fa48("9311") ? false : (stryCov_9fa48("9311", "9312"), this.nodeId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("9313")) {
          {}
        } else {
          stryCov_9fa48("9313");
          return null;
        }
      }
      if (stryMutAct_9fa48("9316") ? typeof this.controlPlaneReadinessService.getNodeReadiness !== TYPEOF.FUNCTION : stryMutAct_9fa48("9315") ? false : stryMutAct_9fa48("9314") ? true : (stryCov_9fa48("9314", "9315", "9316"), typeof this.controlPlaneReadinessService.getNodeReadiness === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("9317")) {
          {}
        } else {
          stryCov_9fa48("9317");
          return this.controlPlaneReadinessService.getNodeReadiness(this.nodeId, stryMutAct_9fa48("9318") ? {} : (stryCov_9fa48("9318"), {
            allowAuthoritativeRefresh: stryMutAct_9fa48("9319") ? false : (stryCov_9fa48("9319"), true),
            preferBackgroundRefreshOnIneligible: stryMutAct_9fa48("9320") ? false : (stryCov_9fa48("9320"), true),
            decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
            maxCachedAgeMs: this.loadLaneReadinessCacheMaxAgeMs
          }));
        }
      }
      if (stryMutAct_9fa48("9323") ? typeof this.controlPlaneReadinessService.getNodeReadinessSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("9322") ? false : stryMutAct_9fa48("9321") ? true : (stryCov_9fa48("9321", "9322", "9323"), typeof this.controlPlaneReadinessService.getNodeReadinessSync === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("9324")) {
          {}
        } else {
          stryCov_9fa48("9324");
          return this.controlPlaneReadinessService.getNodeReadinessSync(this.nodeId);
        }
      }
      return null;
    }
  }

  /**
   * Fail fast for load-lane queries when local routing/member health
   * indicates requests should be shed.
   * @param {Object} executionContext
   * @private
   */
  async assertLoadLaneQueryAdmitted(executionContext = {}) {
    if (stryMutAct_9fa48("9325")) {
      {}
    } else {
      stryCov_9fa48("9325");
      if (stryMutAct_9fa48("9328") ? false : stryMutAct_9fa48("9327") ? true : stryMutAct_9fa48("9326") ? this.isLoadLaneExecution(executionContext) : (stryCov_9fa48("9326", "9327", "9328"), !this.isLoadLaneExecution(executionContext))) {
        if (stryMutAct_9fa48("9329")) {
          {}
        } else {
          stryCov_9fa48("9329");
          return;
        }
      }
      const snapshot = buildLoadLaneQueryAdmissionSnapshot(await this.resolveLoadLaneReadinessSnapshot());
      const admission = buildLoadLaneQueryAdmissionResult(snapshot, resolveLoadLaneQueryAdmissionState(snapshot));
      if (stryMutAct_9fa48("9332") ? admission.state === LOAD_LANE_QUERY_ADMISSION_STATE.BLOCKED : stryMutAct_9fa48("9331") ? false : stryMutAct_9fa48("9330") ? true : (stryCov_9fa48("9330", "9331", "9332"), admission.state !== LOAD_LANE_QUERY_ADMISSION_STATE.BLOCKED)) {
        if (stryMutAct_9fa48("9333")) {
          {}
        } else {
          stryCov_9fa48("9333");
          return;
        }
      }
      throw createRetryableAdminOperationError(ErrorCode.INTERNAL_ERROR, (stryMutAct_9fa48("9334") ? "" : (stryCov_9fa48("9334"), 'serve not ready: load lane admission denied on node ')) + this.nodeId + (stryMutAct_9fa48("9335") ? "" : (stryCov_9fa48("9335"), ' (serveEligible=')) + String(admission.serveEligible) + (stryMutAct_9fa48("9336") ? "" : (stryCov_9fa48("9336"), ', reasons=')) + ((stryMutAct_9fa48("9340") ? admission.reasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("9339") ? admission.reasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("9338") ? false : stryMutAct_9fa48("9337") ? true : (stryCov_9fa48("9337", "9338", "9339", "9340"), admission.reasonCodes.length > NUM.ZERO)) ? admission.reasonCodes.join(stryMutAct_9fa48("9341") ? "" : (stryCov_9fa48("9341"), ',')) : stryMutAct_9fa48("9342") ? "" : (stryCov_9fa48("9342"), 'none')) + (stryMutAct_9fa48("9343") ? "" : (stryCov_9fa48("9343"), ')')));
    }
  }

  /**
   * Resolve one routed user-table target from a load-lane SQL statement.
   * Returns null for non-table statements or unsupported shapes.
   * @param {string} sql
   * @return {string|null}
   * @private
   */
  resolveLoadLaneQueryTargetTableName(sql) {
    if (stryMutAct_9fa48("9344")) {
      {}
    } else {
      stryCov_9fa48("9344");
      if (stryMutAct_9fa48("9347") ? typeof sql !== TYPEOF.STRING && sql.length === NUM.ZERO : stryMutAct_9fa48("9346") ? false : stryMutAct_9fa48("9345") ? true : (stryCov_9fa48("9345", "9346", "9347"), (stryMutAct_9fa48("9349") ? typeof sql === TYPEOF.STRING : stryMutAct_9fa48("9348") ? false : (stryCov_9fa48("9348", "9349"), typeof sql !== TYPEOF.STRING)) || (stryMutAct_9fa48("9351") ? sql.length !== NUM.ZERO : stryMutAct_9fa48("9350") ? false : (stryCov_9fa48("9350", "9351"), sql.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("9352")) {
          {}
        } else {
          stryCov_9fa48("9352");
          return null;
        }
      }
      let ast;
      try {
        if (stryMutAct_9fa48("9353")) {
          {}
        } else {
          stryCov_9fa48("9353");
          ast = new SQLParser(sql).parse();
        }
      } catch (_error) {
        if (stryMutAct_9fa48("9354")) {
          {}
        } else {
          stryCov_9fa48("9354");
          return null;
        }
      }
      if (stryMutAct_9fa48("9357") ? ast?.type !== AST_TYPE.SELECT : stryMutAct_9fa48("9356") ? false : stryMutAct_9fa48("9355") ? true : (stryCov_9fa48("9355", "9356", "9357"), (stryMutAct_9fa48("9358") ? ast.type : (stryCov_9fa48("9358"), ast?.type)) === AST_TYPE.SELECT)) {
        if (stryMutAct_9fa48("9359")) {
          {}
        } else {
          stryCov_9fa48("9359");
          if (stryMutAct_9fa48("9362") ? !ast.from && ast.from.subquery : stryMutAct_9fa48("9361") ? false : stryMutAct_9fa48("9360") ? true : (stryCov_9fa48("9360", "9361", "9362"), (stryMutAct_9fa48("9363") ? ast.from : (stryCov_9fa48("9363"), !ast.from)) || ast.from.subquery)) {
            if (stryMutAct_9fa48("9364")) {
              {}
            } else {
              stryCov_9fa48("9364");
              return null;
            }
          }
          return normalizeIdentifier(ast.from.name);
        }
      }
      if (stryMutAct_9fa48("9367") ? (ast?.type === AST_TYPE.INSERT || ast?.type === AST_TYPE.UPDATE) && ast?.type === AST_TYPE.DELETE : stryMutAct_9fa48("9366") ? false : stryMutAct_9fa48("9365") ? true : (stryCov_9fa48("9365", "9366", "9367"), (stryMutAct_9fa48("9369") ? ast?.type === AST_TYPE.INSERT && ast?.type === AST_TYPE.UPDATE : stryMutAct_9fa48("9368") ? false : (stryCov_9fa48("9368", "9369"), (stryMutAct_9fa48("9371") ? ast?.type !== AST_TYPE.INSERT : stryMutAct_9fa48("9370") ? false : (stryCov_9fa48("9370", "9371"), (stryMutAct_9fa48("9372") ? ast.type : (stryCov_9fa48("9372"), ast?.type)) === AST_TYPE.INSERT)) || (stryMutAct_9fa48("9374") ? ast?.type !== AST_TYPE.UPDATE : stryMutAct_9fa48("9373") ? false : (stryCov_9fa48("9373", "9374"), (stryMutAct_9fa48("9375") ? ast.type : (stryCov_9fa48("9375"), ast?.type)) === AST_TYPE.UPDATE)))) || (stryMutAct_9fa48("9377") ? ast?.type !== AST_TYPE.DELETE : stryMutAct_9fa48("9376") ? false : (stryCov_9fa48("9376", "9377"), (stryMutAct_9fa48("9378") ? ast.type : (stryCov_9fa48("9378"), ast?.type)) === AST_TYPE.DELETE)))) {
        if (stryMutAct_9fa48("9379")) {
          {}
        } else {
          stryCov_9fa48("9379");
          return normalizeIdentifier(ast.table);
        }
      }
      return null;
    }
  }

  /**
   * Resolve one stable list of reason codes from discovery readiness.
   * @param {Array<Object>} reasons
   * @param {string} fallbackCode
   * @return {Array<string>}
   * @private
   */
  normalizeLoadLaneAdmissionReasonCodes(reasons, fallbackCode) {
    if (stryMutAct_9fa48("9380")) {
      {}
    } else {
      stryCov_9fa48("9380");
      const normalized = Array.isArray(reasons) ? stryMutAct_9fa48("9381") ? reasons.map(reason => String(reason?.code || EMPTY_STRING).trim()) : (stryCov_9fa48("9381"), reasons.map(stryMutAct_9fa48("9382") ? () => undefined : (stryCov_9fa48("9382"), reason => stryMutAct_9fa48("9383") ? String(reason?.code || EMPTY_STRING) : (stryCov_9fa48("9383"), String(stryMutAct_9fa48("9386") ? reason?.code && EMPTY_STRING : stryMutAct_9fa48("9385") ? false : stryMutAct_9fa48("9384") ? true : (stryCov_9fa48("9384", "9385", "9386"), (stryMutAct_9fa48("9387") ? reason.code : (stryCov_9fa48("9387"), reason?.code)) || EMPTY_STRING)).trim()))).filter(stryMutAct_9fa48("9388") ? () => undefined : (stryCov_9fa48("9388"), code => stryMutAct_9fa48("9392") ? code.length <= NUM.ZERO : stryMutAct_9fa48("9391") ? code.length >= NUM.ZERO : stryMutAct_9fa48("9390") ? false : stryMutAct_9fa48("9389") ? true : (stryCov_9fa48("9389", "9390", "9391", "9392"), code.length > NUM.ZERO)))) : stryMutAct_9fa48("9393") ? ["Stryker was here"] : (stryCov_9fa48("9393"), []);
      if (stryMutAct_9fa48("9397") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("9396") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("9395") ? false : stryMutAct_9fa48("9394") ? true : (stryCov_9fa48("9394", "9395", "9396", "9397"), normalized.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("9398")) {
          {}
        } else {
          stryCov_9fa48("9398");
          return stryMutAct_9fa48("9399") ? [] : (stryCov_9fa48("9399"), [...new Set(normalized)]);
        }
      }
      if (stryMutAct_9fa48("9402") ? typeof fallbackCode === TYPEOF.STRING || fallbackCode.length > NUM.ZERO : stryMutAct_9fa48("9401") ? false : stryMutAct_9fa48("9400") ? true : (stryCov_9fa48("9400", "9401", "9402"), (stryMutAct_9fa48("9404") ? typeof fallbackCode !== TYPEOF.STRING : stryMutAct_9fa48("9403") ? true : (stryCov_9fa48("9403", "9404"), typeof fallbackCode === TYPEOF.STRING)) && (stryMutAct_9fa48("9407") ? fallbackCode.length <= NUM.ZERO : stryMutAct_9fa48("9406") ? fallbackCode.length >= NUM.ZERO : stryMutAct_9fa48("9405") ? true : (stryCov_9fa48("9405", "9406", "9407"), fallbackCode.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("9408")) {
          {}
        } else {
          stryCov_9fa48("9408");
          return stryMutAct_9fa48("9409") ? [] : (stryCov_9fa48("9409"), [fallbackCode]);
        }
      }
      return stryMutAct_9fa48("9410") ? ["Stryker was here"] : (stryCov_9fa48("9410"), []);
    }
  }

  /**
   * Determine whether transient schema/leadership drift can be treated as
   * soft blockers for local load-lane admission.
   * @param {Object|null} benchmarkAdmission
   * @param {Array<string>} reasonCodes
   * @return {boolean}
   * @private
   */
  shouldAdmitLoadLaneSoftBenchmarkBlockers(benchmarkAdmission, reasonCodes) {
    if (stryMutAct_9fa48("9411")) {
      {}
    } else {
      stryCov_9fa48("9411");
      if (stryMutAct_9fa48("9414") ? !benchmarkAdmission && typeof benchmarkAdmission !== TYPEOF.OBJECT : stryMutAct_9fa48("9413") ? false : stryMutAct_9fa48("9412") ? true : (stryCov_9fa48("9412", "9413", "9414"), (stryMutAct_9fa48("9415") ? benchmarkAdmission : (stryCov_9fa48("9415"), !benchmarkAdmission)) || (stryMutAct_9fa48("9417") ? typeof benchmarkAdmission === TYPEOF.OBJECT : stryMutAct_9fa48("9416") ? false : (stryCov_9fa48("9416", "9417"), typeof benchmarkAdmission !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("9418")) {
          {}
        } else {
          stryCov_9fa48("9418");
          return stryMutAct_9fa48("9419") ? true : (stryCov_9fa48("9419"), false);
        }
      }
      if (stryMutAct_9fa48("9422") ? !Array.isArray(reasonCodes) && reasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("9421") ? false : stryMutAct_9fa48("9420") ? true : (stryCov_9fa48("9420", "9421", "9422"), (stryMutAct_9fa48("9423") ? Array.isArray(reasonCodes) : (stryCov_9fa48("9423"), !Array.isArray(reasonCodes))) || (stryMutAct_9fa48("9426") ? reasonCodes.length > NUM.ZERO : stryMutAct_9fa48("9425") ? reasonCodes.length < NUM.ZERO : stryMutAct_9fa48("9424") ? false : (stryCov_9fa48("9424", "9425", "9426"), reasonCodes.length <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("9427")) {
          {}
        } else {
          stryCov_9fa48("9427");
          return stryMutAct_9fa48("9428") ? true : (stryCov_9fa48("9428"), false);
        }
      }
      if (stryMutAct_9fa48("9431") ? false : stryMutAct_9fa48("9430") ? true : stryMutAct_9fa48("9429") ? reasonCodes.every(code => LOAD_LANE_SOFT_ADMISSION_REASON_CODES.has(code)) : (stryCov_9fa48("9429", "9430", "9431"), !(stryMutAct_9fa48("9432") ? reasonCodes.some(code => LOAD_LANE_SOFT_ADMISSION_REASON_CODES.has(code)) : (stryCov_9fa48("9432"), reasonCodes.every(stryMutAct_9fa48("9433") ? () => undefined : (stryCov_9fa48("9433"), code => LOAD_LANE_SOFT_ADMISSION_REASON_CODES.has(code))))))) {
        if (stryMutAct_9fa48("9434")) {
          {}
        } else {
          stryCov_9fa48("9434");
          return stryMutAct_9fa48("9435") ? true : (stryCov_9fa48("9435"), false);
        }
      }
      const routingReady = stryMutAct_9fa48("9438") ? benchmarkAdmission.routingReady !== true : stryMutAct_9fa48("9437") ? false : stryMutAct_9fa48("9436") ? true : (stryCov_9fa48("9436", "9437", "9438"), benchmarkAdmission.routingReady === (stryMutAct_9fa48("9439") ? false : (stryCov_9fa48("9439"), true)));
      const localReplicaRole = stryMutAct_9fa48("9440") ? String(benchmarkAdmission.localReplicaRole || EMPTY_STRING).toUpperCase() : (stryCov_9fa48("9440"), String(stryMutAct_9fa48("9443") ? benchmarkAdmission.localReplicaRole && EMPTY_STRING : stryMutAct_9fa48("9442") ? false : stryMutAct_9fa48("9441") ? true : (stryCov_9fa48("9441", "9442", "9443"), benchmarkAdmission.localReplicaRole || EMPTY_STRING)).toLowerCase());
      const localReplicaVoterReady = LOAD_LANE_VOTER_READY_REPLICA_ROLES.has(localReplicaRole);
      const degradedByOperationIds = Array.isArray(benchmarkAdmission.degradedByOperationIds) ? benchmarkAdmission.degradedByOperationIds : ADMIN_CACHE_DUMP.EMPTY;
      return stryMutAct_9fa48("9446") ? routingReady && localReplicaVoterReady || degradedByOperationIds.length <= NUM.ZERO : stryMutAct_9fa48("9445") ? false : stryMutAct_9fa48("9444") ? true : (stryCov_9fa48("9444", "9445", "9446"), (stryMutAct_9fa48("9448") ? routingReady || localReplicaVoterReady : stryMutAct_9fa48("9447") ? true : (stryCov_9fa48("9447", "9448"), routingReady && localReplicaVoterReady)) && (stryMutAct_9fa48("9451") ? degradedByOperationIds.length > NUM.ZERO : stryMutAct_9fa48("9450") ? degradedByOperationIds.length < NUM.ZERO : stryMutAct_9fa48("9449") ? true : (stryCov_9fa48("9449", "9450", "9451"), degradedByOperationIds.length <= NUM.ZERO)));
    }
  }

  /**
   * Determine whether transient schema/leadership drift can be treated as
   * soft blockers when only legacy readiness evidence is available.
   * @param {Object|null} readiness
   * @param {Array<string>} reasonCodes
   * @return {boolean}
   * @private
   */
  shouldAdmitLoadLaneSoftReadinessBlockers(readiness, reasonCodes) {
    if (stryMutAct_9fa48("9452")) {
      {}
    } else {
      stryCov_9fa48("9452");
      if (stryMutAct_9fa48("9455") ? !readiness && typeof readiness !== TYPEOF.OBJECT : stryMutAct_9fa48("9454") ? false : stryMutAct_9fa48("9453") ? true : (stryCov_9fa48("9453", "9454", "9455"), (stryMutAct_9fa48("9456") ? readiness : (stryCov_9fa48("9456"), !readiness)) || (stryMutAct_9fa48("9458") ? typeof readiness === TYPEOF.OBJECT : stryMutAct_9fa48("9457") ? false : (stryCov_9fa48("9457", "9458"), typeof readiness !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("9459")) {
          {}
        } else {
          stryCov_9fa48("9459");
          return stryMutAct_9fa48("9460") ? true : (stryCov_9fa48("9460"), false);
        }
      }
      if (stryMutAct_9fa48("9463") ? !Array.isArray(reasonCodes) && reasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("9462") ? false : stryMutAct_9fa48("9461") ? true : (stryCov_9fa48("9461", "9462", "9463"), (stryMutAct_9fa48("9464") ? Array.isArray(reasonCodes) : (stryCov_9fa48("9464"), !Array.isArray(reasonCodes))) || (stryMutAct_9fa48("9467") ? reasonCodes.length > NUM.ZERO : stryMutAct_9fa48("9466") ? reasonCodes.length < NUM.ZERO : stryMutAct_9fa48("9465") ? false : (stryCov_9fa48("9465", "9466", "9467"), reasonCodes.length <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("9468")) {
          {}
        } else {
          stryCov_9fa48("9468");
          return stryMutAct_9fa48("9469") ? true : (stryCov_9fa48("9469"), false);
        }
      }
      if (stryMutAct_9fa48("9472") ? false : stryMutAct_9fa48("9471") ? true : stryMutAct_9fa48("9470") ? reasonCodes.every(code => LOAD_LANE_SOFT_ADMISSION_REASON_CODES.has(code)) : (stryCov_9fa48("9470", "9471", "9472"), !(stryMutAct_9fa48("9473") ? reasonCodes.some(code => LOAD_LANE_SOFT_ADMISSION_REASON_CODES.has(code)) : (stryCov_9fa48("9473"), reasonCodes.every(stryMutAct_9fa48("9474") ? () => undefined : (stryCov_9fa48("9474"), code => LOAD_LANE_SOFT_ADMISSION_REASON_CODES.has(code))))))) {
        if (stryMutAct_9fa48("9475")) {
          {}
        } else {
          stryCov_9fa48("9475");
          return stryMutAct_9fa48("9476") ? true : (stryCov_9fa48("9476"), false);
        }
      }
      return stryMutAct_9fa48("9479") ? readiness.routingReady !== true : stryMutAct_9fa48("9478") ? false : stryMutAct_9fa48("9477") ? true : (stryCov_9fa48("9477", "9478", "9479"), readiness.routingReady === (stryMutAct_9fa48("9480") ? false : (stryCov_9fa48("9480"), true)));
    }
  }

  /**
   * Build one canonical load-lane table-admission result.
   * @param {string} tableName
   * @param {string} state
   * @param {Array<string>} reasonCodes
   * @return {Object}
   * @private
   */
  buildLoadLaneTableAdmissionResult(tableName, state, reasonCodes) {
    if (stryMutAct_9fa48("9481")) {
      {}
    } else {
      stryCov_9fa48("9481");
      return stryMutAct_9fa48("9482") ? {} : (stryCov_9fa48("9482"), {
        ready: stryMutAct_9fa48("9485") ? state === LOAD_LANE_TABLE_ADMISSION_STATE.READY && state === LOAD_LANE_TABLE_ADMISSION_STATE.SOFT_BLOCKER_ADMITTED : stryMutAct_9fa48("9484") ? false : stryMutAct_9fa48("9483") ? true : (stryCov_9fa48("9483", "9484", "9485"), (stryMutAct_9fa48("9487") ? state !== LOAD_LANE_TABLE_ADMISSION_STATE.READY : stryMutAct_9fa48("9486") ? false : (stryCov_9fa48("9486", "9487"), state === LOAD_LANE_TABLE_ADMISSION_STATE.READY)) || (stryMutAct_9fa48("9489") ? state !== LOAD_LANE_TABLE_ADMISSION_STATE.SOFT_BLOCKER_ADMITTED : stryMutAct_9fa48("9488") ? false : (stryCov_9fa48("9488", "9489"), state === LOAD_LANE_TABLE_ADMISSION_STATE.SOFT_BLOCKER_ADMITTED))),
        tableName,
        state,
        reasonCodes
      });
    }
  }

  /**
   * Resolve one replica-scoped load-lane table-admission result from one
   * replica readiness snapshot.
   * @param {Object} replica
   * @param {string} tableName
   * @return {Object}
   * @private
   */
  resolveLoadLaneReplicaAdmissionResult(replica, tableName) {
    if (stryMutAct_9fa48("9490")) {
      {}
    } else {
      stryCov_9fa48("9490");
      const benchmarkAdmission = (stryMutAct_9fa48("9493") ? replica?.benchmarkAdmission || typeof replica.benchmarkAdmission === TYPEOF.OBJECT : stryMutAct_9fa48("9492") ? false : stryMutAct_9fa48("9491") ? true : (stryCov_9fa48("9491", "9492", "9493"), (stryMutAct_9fa48("9494") ? replica.benchmarkAdmission : (stryCov_9fa48("9494"), replica?.benchmarkAdmission)) && (stryMutAct_9fa48("9496") ? typeof replica.benchmarkAdmission !== TYPEOF.OBJECT : stryMutAct_9fa48("9495") ? true : (stryCov_9fa48("9495", "9496"), typeof replica.benchmarkAdmission === TYPEOF.OBJECT)))) ? replica.benchmarkAdmission : null;
      if (stryMutAct_9fa48("9498") ? false : stryMutAct_9fa48("9497") ? true : (stryCov_9fa48("9497", "9498"), benchmarkAdmission)) {
        if (stryMutAct_9fa48("9499")) {
          {}
        } else {
          stryCov_9fa48("9499");
          const benchmarkAdmissionReady = stryMutAct_9fa48("9502") ? String(benchmarkAdmission.state || EMPTY_STRING).toLowerCase() !== LOAD_LANE_TABLE_ADMISSION_STATE.READY : stryMutAct_9fa48("9501") ? false : stryMutAct_9fa48("9500") ? true : (stryCov_9fa48("9500", "9501", "9502"), (stryMutAct_9fa48("9503") ? String(benchmarkAdmission.state || EMPTY_STRING).toUpperCase() : (stryCov_9fa48("9503"), String(stryMutAct_9fa48("9506") ? benchmarkAdmission.state && EMPTY_STRING : stryMutAct_9fa48("9505") ? false : stryMutAct_9fa48("9504") ? true : (stryCov_9fa48("9504", "9505", "9506"), benchmarkAdmission.state || EMPTY_STRING)).toLowerCase())) === LOAD_LANE_TABLE_ADMISSION_STATE.READY);
          const reasonCodes = benchmarkAdmissionReady ? stryMutAct_9fa48("9507") ? ["Stryker was here"] : (stryCov_9fa48("9507"), []) : this.normalizeLoadLaneAdmissionReasonCodes(benchmarkAdmission.reasons, stryMutAct_9fa48("9508") ? "" : (stryCov_9fa48("9508"), 'benchmark_admission_blocked'));
          const softBlockerAdmitted = stryMutAct_9fa48("9511") ? !benchmarkAdmissionReady || this.shouldAdmitLoadLaneSoftBenchmarkBlockers(benchmarkAdmission, reasonCodes) : stryMutAct_9fa48("9510") ? false : stryMutAct_9fa48("9509") ? true : (stryCov_9fa48("9509", "9510", "9511"), (stryMutAct_9fa48("9512") ? benchmarkAdmissionReady : (stryCov_9fa48("9512"), !benchmarkAdmissionReady)) && this.shouldAdmitLoadLaneSoftBenchmarkBlockers(benchmarkAdmission, reasonCodes));
          return this.buildLoadLaneTableAdmissionResult(tableName, (stryMutAct_9fa48("9515") ? benchmarkAdmissionReady || reasonCodes.length === NUM.ZERO : stryMutAct_9fa48("9514") ? false : stryMutAct_9fa48("9513") ? true : (stryCov_9fa48("9513", "9514", "9515"), benchmarkAdmissionReady && (stryMutAct_9fa48("9517") ? reasonCodes.length !== NUM.ZERO : stryMutAct_9fa48("9516") ? true : (stryCov_9fa48("9516", "9517"), reasonCodes.length === NUM.ZERO)))) ? LOAD_LANE_TABLE_ADMISSION_STATE.READY : softBlockerAdmitted ? LOAD_LANE_TABLE_ADMISSION_STATE.SOFT_BLOCKER_ADMITTED : LOAD_LANE_TABLE_ADMISSION_STATE.BENCHMARK_BLOCKED, softBlockerAdmitted ? stryMutAct_9fa48("9518") ? ["Stryker was here"] : (stryCov_9fa48("9518"), []) : reasonCodes);
        }
      }
      const readiness = (stryMutAct_9fa48("9521") ? replica?.readiness || typeof replica.readiness === TYPEOF.OBJECT : stryMutAct_9fa48("9520") ? false : stryMutAct_9fa48("9519") ? true : (stryCov_9fa48("9519", "9520", "9521"), (stryMutAct_9fa48("9522") ? replica.readiness : (stryCov_9fa48("9522"), replica?.readiness)) && (stryMutAct_9fa48("9524") ? typeof replica.readiness !== TYPEOF.OBJECT : stryMutAct_9fa48("9523") ? true : (stryCov_9fa48("9523", "9524"), typeof replica.readiness === TYPEOF.OBJECT)))) ? replica.readiness : null;
      if (stryMutAct_9fa48("9526") ? false : stryMutAct_9fa48("9525") ? true : (stryCov_9fa48("9525", "9526"), readiness)) {
        if (stryMutAct_9fa48("9527")) {
          {}
        } else {
          stryCov_9fa48("9527");
          const benchmarkReady = stryMutAct_9fa48("9530") ? readiness.benchmarkReady !== true : stryMutAct_9fa48("9529") ? false : stryMutAct_9fa48("9528") ? true : (stryCov_9fa48("9528", "9529", "9530"), readiness.benchmarkReady === (stryMutAct_9fa48("9531") ? false : (stryCov_9fa48("9531"), true)));
          const reasonCodes = benchmarkReady ? stryMutAct_9fa48("9532") ? ["Stryker was here"] : (stryCov_9fa48("9532"), []) : this.normalizeLoadLaneAdmissionReasonCodes(readiness.reasons, stryMutAct_9fa48("9533") ? "" : (stryCov_9fa48("9533"), 'benchmark_readiness_blocked'));
          const softBlockerAdmitted = stryMutAct_9fa48("9536") ? !benchmarkReady || this.shouldAdmitLoadLaneSoftReadinessBlockers(readiness, reasonCodes) : stryMutAct_9fa48("9535") ? false : stryMutAct_9fa48("9534") ? true : (stryCov_9fa48("9534", "9535", "9536"), (stryMutAct_9fa48("9537") ? benchmarkReady : (stryCov_9fa48("9537"), !benchmarkReady)) && this.shouldAdmitLoadLaneSoftReadinessBlockers(readiness, reasonCodes));
          return this.buildLoadLaneTableAdmissionResult(tableName, (stryMutAct_9fa48("9540") ? benchmarkReady || reasonCodes.length === NUM.ZERO : stryMutAct_9fa48("9539") ? false : stryMutAct_9fa48("9538") ? true : (stryCov_9fa48("9538", "9539", "9540"), benchmarkReady && (stryMutAct_9fa48("9542") ? reasonCodes.length !== NUM.ZERO : stryMutAct_9fa48("9541") ? true : (stryCov_9fa48("9541", "9542"), reasonCodes.length === NUM.ZERO)))) ? LOAD_LANE_TABLE_ADMISSION_STATE.READY : softBlockerAdmitted ? LOAD_LANE_TABLE_ADMISSION_STATE.SOFT_BLOCKER_ADMITTED : LOAD_LANE_TABLE_ADMISSION_STATE.READINESS_BLOCKED, softBlockerAdmitted ? stryMutAct_9fa48("9543") ? ["Stryker was here"] : (stryCov_9fa48("9543"), []) : reasonCodes);
        }
      }
      return this.buildLoadLaneTableAdmissionResult(tableName, LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING, stryMutAct_9fa48("9544") ? [] : (stryCov_9fa48("9544"), [LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING]));
    }
  }

  /**
   * Resolve local benchmark admission for one routed load-lane table.
   * @param {string} tableName
   * @return {Object|null}
   * @private
   */
  async resolveLoadLaneTableAdmissionState(tableName) {
    if (stryMutAct_9fa48("9545")) {
      {}
    } else {
      stryCov_9fa48("9545");
      const normalizedTableName = normalizeIdentifier(tableName);
      if (stryMutAct_9fa48("9548") ? false : stryMutAct_9fa48("9547") ? true : stryMutAct_9fa48("9546") ? normalizedTableName : (stryCov_9fa48("9546", "9547", "9548"), !normalizedTableName)) {
        if (stryMutAct_9fa48("9549")) {
          {}
        } else {
          stryCov_9fa48("9549");
          return null;
        }
      }
      const nowMs = this.nowFn();
      const cachedEntry = this.loadLaneTableAdmissionCache.get(normalizedTableName);
      if (stryMutAct_9fa48("9552") ? cachedEntry || nowMs - cachedEntry.capturedAtMs <= this.loadLaneTableAdmissionCacheMaxAgeMs : stryMutAct_9fa48("9551") ? false : stryMutAct_9fa48("9550") ? true : (stryCov_9fa48("9550", "9551", "9552"), cachedEntry && (stryMutAct_9fa48("9555") ? nowMs - cachedEntry.capturedAtMs > this.loadLaneTableAdmissionCacheMaxAgeMs : stryMutAct_9fa48("9554") ? nowMs - cachedEntry.capturedAtMs < this.loadLaneTableAdmissionCacheMaxAgeMs : stryMutAct_9fa48("9553") ? true : (stryCov_9fa48("9553", "9554", "9555"), (stryMutAct_9fa48("9556") ? nowMs + cachedEntry.capturedAtMs : (stryCov_9fa48("9556"), nowMs - cachedEntry.capturedAtMs)) <= this.loadLaneTableAdmissionCacheMaxAgeMs)))) {
        if (stryMutAct_9fa48("9557")) {
          {}
        } else {
          stryCov_9fa48("9557");
          return cachedEntry.state;
        }
      }
      const snapshot = await this.serviceDiscovery.resolveServiceDiscoverySnapshot(stryMutAct_9fa48("9558") ? {} : (stryCov_9fa48("9558"), {
        tableName: normalizedTableName,
        serviceIdAllowlist: stryMutAct_9fa48("9559") ? [] : (stryCov_9fa48("9559"), [META_SERVICE_ID.POSTGRES_WIRE]),
        protocolAllowlist: stryMutAct_9fa48("9560") ? [] : (stryCov_9fa48("9560"), [WASM_SERVICE_PROTOCOL.POSTGRESQL]),
        allowAuthoritativeRepair: stryMutAct_9fa48("9561") ? false : (stryCov_9fa48("9561"), true)
      }));
      const services = Array.isArray(stryMutAct_9fa48("9562") ? snapshot.services : (stryCov_9fa48("9562"), snapshot?.services)) ? snapshot.services : ADMIN_CACHE_DUMP.EMPTY;
      let resolvedState = this.buildLoadLaneTableAdmissionResult(normalizedTableName, LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING, stryMutAct_9fa48("9563") ? [] : (stryCov_9fa48("9563"), [LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING]));
      for (const service of services) {
        if (stryMutAct_9fa48("9564")) {
          {}
        } else {
          stryCov_9fa48("9564");
          const replicas = Array.isArray(stryMutAct_9fa48("9565") ? service.replicas : (stryCov_9fa48("9565"), service?.replicas)) ? service.replicas : ADMIN_CACHE_DUMP.EMPTY;
          for (const replica of replicas) {
            if (stryMutAct_9fa48("9566")) {
              {}
            } else {
              stryCov_9fa48("9566");
              if (stryMutAct_9fa48("9569") ? String(replica?.nodeId || EMPTY_STRING) === this.nodeId : stryMutAct_9fa48("9568") ? false : stryMutAct_9fa48("9567") ? true : (stryCov_9fa48("9567", "9568", "9569"), String(stryMutAct_9fa48("9572") ? replica?.nodeId && EMPTY_STRING : stryMutAct_9fa48("9571") ? false : stryMutAct_9fa48("9570") ? true : (stryCov_9fa48("9570", "9571", "9572"), (stryMutAct_9fa48("9573") ? replica.nodeId : (stryCov_9fa48("9573"), replica?.nodeId)) || EMPTY_STRING)) !== this.nodeId)) {
                if (stryMutAct_9fa48("9574")) {
                  {}
                } else {
                  stryCov_9fa48("9574");
                  continue;
                }
              }
              resolvedState = this.resolveLoadLaneReplicaAdmissionResult(replica, normalizedTableName);
              break;
            }
          }
          if (stryMutAct_9fa48("9577") ? resolvedState.ready === true && resolvedState.state !== LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING : stryMutAct_9fa48("9576") ? false : stryMutAct_9fa48("9575") ? true : (stryCov_9fa48("9575", "9576", "9577"), (stryMutAct_9fa48("9579") ? resolvedState.ready !== true : stryMutAct_9fa48("9578") ? false : (stryCov_9fa48("9578", "9579"), resolvedState.ready === (stryMutAct_9fa48("9580") ? false : (stryCov_9fa48("9580"), true)))) || (stryMutAct_9fa48("9582") ? resolvedState.state === LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING : stryMutAct_9fa48("9581") ? false : (stryCov_9fa48("9581", "9582"), resolvedState.state !== LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING)))) {
            if (stryMutAct_9fa48("9583")) {
              {}
            } else {
              stryCov_9fa48("9583");
              break;
            }
          }
        }
      }
      this.loadLaneTableAdmissionCache.set(normalizedTableName, stryMutAct_9fa48("9584") ? {} : (stryCov_9fa48("9584"), {
        capturedAtMs: nowMs,
        state: resolvedState
      }));
      return resolvedState;
    }
  }

  /**
   * Enforce table-scoped load-lane admission for routed user-table queries.
   * @param {string} sql
   * @param {Object} executionContext
   * @return {Promise<void>}
   * @private
   */
  async assertLoadLaneTableQueryAdmitted(sql, executionContext = {}) {
    if (stryMutAct_9fa48("9585")) {
      {}
    } else {
      stryCov_9fa48("9585");
      if (stryMutAct_9fa48("9588") ? false : stryMutAct_9fa48("9587") ? true : stryMutAct_9fa48("9586") ? this.isLoadLaneExecution(executionContext) : (stryCov_9fa48("9586", "9587", "9588"), !this.isLoadLaneExecution(executionContext))) {
        if (stryMutAct_9fa48("9589")) {
          {}
        } else {
          stryCov_9fa48("9589");
          return;
        }
      }
      const tableName = this.resolveLoadLaneQueryTargetTableName(sql);
      if (stryMutAct_9fa48("9592") ? false : stryMutAct_9fa48("9591") ? true : stryMutAct_9fa48("9590") ? tableName : (stryCov_9fa48("9590", "9591", "9592"), !tableName)) {
        if (stryMutAct_9fa48("9593")) {
          {}
        } else {
          stryCov_9fa48("9593");
          return;
        }
      }
      const admissionState = await this.resolveLoadLaneTableAdmissionState(tableName);
      if (stryMutAct_9fa48("9596") ? admissionState?.ready !== true : stryMutAct_9fa48("9595") ? false : stryMutAct_9fa48("9594") ? true : (stryCov_9fa48("9594", "9595", "9596"), (stryMutAct_9fa48("9597") ? admissionState.ready : (stryCov_9fa48("9597"), admissionState?.ready)) === (stryMutAct_9fa48("9598") ? false : (stryCov_9fa48("9598"), true)))) {
        if (stryMutAct_9fa48("9599")) {
          {}
        } else {
          stryCov_9fa48("9599");
          return;
        }
      }
      const reasonCodes = (stryMutAct_9fa48("9602") ? Array.isArray(admissionState?.reasonCodes) || admissionState.reasonCodes.length > NUM.ZERO : stryMutAct_9fa48("9601") ? false : stryMutAct_9fa48("9600") ? true : (stryCov_9fa48("9600", "9601", "9602"), Array.isArray(stryMutAct_9fa48("9603") ? admissionState.reasonCodes : (stryCov_9fa48("9603"), admissionState?.reasonCodes)) && (stryMutAct_9fa48("9606") ? admissionState.reasonCodes.length <= NUM.ZERO : stryMutAct_9fa48("9605") ? admissionState.reasonCodes.length >= NUM.ZERO : stryMutAct_9fa48("9604") ? true : (stryCov_9fa48("9604", "9605", "9606"), admissionState.reasonCodes.length > NUM.ZERO)))) ? admissionState.reasonCodes : stryMutAct_9fa48("9607") ? [] : (stryCov_9fa48("9607"), [stryMutAct_9fa48("9608") ? "" : (stryCov_9fa48("9608"), 'benchmark_admission_blocked')]);
      throw createRetryableAdminOperationError(ErrorCode.INTERNAL_ERROR, (stryMutAct_9fa48("9609") ? "" : (stryCov_9fa48("9609"), 'serve not ready: load lane admission denied on node ')) + this.nodeId + (stryMutAct_9fa48("9610") ? "" : (stryCov_9fa48("9610"), ' (tableName=')) + tableName + (stryMutAct_9fa48("9611") ? "" : (stryCov_9fa48("9611"), ', benchmarkReady=false, reasons=')) + reasonCodes.join(stryMutAct_9fa48("9612") ? "" : (stryCov_9fa48("9612"), ',')) + (stryMutAct_9fa48("9613") ? "" : (stryCov_9fa48("9613"), ')')));
    }
  }

  /**
   * Resolve bounded query timeout for one execution context.
   * Load-lane traffic should fail fast under pressure so retries can
   * redistribute work instead of occupying long timeout budgets.
   * @param {number|null} requestedTimeoutMs
   * @param {Object} executionContext
   * @return {number|null}
   * @private
   */
  resolveExecutionQueryTimeoutMs(requestedTimeoutMs, executionContext = {}) {
    if (stryMutAct_9fa48("9614")) {
      {}
    } else {
      stryCov_9fa48("9614");
      const normalizedTimeoutMs = resolveRequestedQueryTimeoutMs(requestedTimeoutMs);
      if (stryMutAct_9fa48("9617") ? false : stryMutAct_9fa48("9616") ? true : stryMutAct_9fa48("9615") ? this.isLoadLaneExecution(executionContext) : (stryCov_9fa48("9615", "9616", "9617"), !this.isLoadLaneExecution(executionContext))) {
        if (stryMutAct_9fa48("9618")) {
          {}
        } else {
          stryCov_9fa48("9618");
          return normalizedTimeoutMs;
        }
      }
      const boundedTimeoutMs = (stryMutAct_9fa48("9621") ? Number.isFinite(this.loadLaneQueryTimeoutCapMs) || this.loadLaneQueryTimeoutCapMs > NUM.ZERO : stryMutAct_9fa48("9620") ? false : stryMutAct_9fa48("9619") ? true : (stryCov_9fa48("9619", "9620", "9621"), Number.isFinite(this.loadLaneQueryTimeoutCapMs) && (stryMutAct_9fa48("9624") ? this.loadLaneQueryTimeoutCapMs <= NUM.ZERO : stryMutAct_9fa48("9623") ? this.loadLaneQueryTimeoutCapMs >= NUM.ZERO : stryMutAct_9fa48("9622") ? true : (stryCov_9fa48("9622", "9623", "9624"), this.loadLaneQueryTimeoutCapMs > NUM.ZERO)))) ? Math.floor(this.loadLaneQueryTimeoutCapMs) : LOAD_LANE_QUERY_TIMEOUT_CAP_MS;
      if (stryMutAct_9fa48("9627") ? normalizedTimeoutMs !== null : stryMutAct_9fa48("9626") ? false : stryMutAct_9fa48("9625") ? true : (stryCov_9fa48("9625", "9626", "9627"), normalizedTimeoutMs === null)) {
        if (stryMutAct_9fa48("9628")) {
          {}
        } else {
          stryCov_9fa48("9628");
          return boundedTimeoutMs;
        }
      }
      return stryMutAct_9fa48("9629") ? Math.min(NUM.ONE, Math.min(normalizedTimeoutMs, boundedTimeoutMs)) : (stryCov_9fa48("9629"), Math.max(NUM.ONE, stryMutAct_9fa48("9630") ? Math.max(normalizedTimeoutMs, boundedTimeoutMs) : (stryCov_9fa48("9630"), Math.min(normalizedTimeoutMs, boundedTimeoutMs))));
    }
  }

  /**
   * Resolve retry-after metadata for one retryable load-lane failure.
   * @param {Object} value
   * @return {number}
   * @private
   */
  resolveLoadLaneRetryAfterMs(value = null) {
    if (stryMutAct_9fa48("9631")) {
      {}
    } else {
      stryCov_9fa48("9631");
      const classifiedRetryAfterMs = getControlPlaneRetryAfterMs(value);
      if (stryMutAct_9fa48("9635") ? classifiedRetryAfterMs <= NUM.ZERO : stryMutAct_9fa48("9634") ? classifiedRetryAfterMs >= NUM.ZERO : stryMutAct_9fa48("9633") ? false : stryMutAct_9fa48("9632") ? true : (stryCov_9fa48("9632", "9633", "9634", "9635"), classifiedRetryAfterMs > NUM.ZERO)) {
        if (stryMutAct_9fa48("9636")) {
          {}
        } else {
          stryCov_9fa48("9636");
          return classifiedRetryAfterMs;
        }
      }
      const retryAfterMs = Number(stryMutAct_9fa48("9637") ? value.retryAfterMs : (stryCov_9fa48("9637"), value?.retryAfterMs));
      if (stryMutAct_9fa48("9640") ? Number.isFinite(retryAfterMs) || retryAfterMs > NUM.ZERO : stryMutAct_9fa48("9639") ? false : stryMutAct_9fa48("9638") ? true : (stryCov_9fa48("9638", "9639", "9640"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("9643") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("9642") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("9641") ? true : (stryCov_9fa48("9641", "9642", "9643"), retryAfterMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("9644")) {
          {}
        } else {
          stryCov_9fa48("9644");
          return Math.floor(retryAfterMs);
        }
      }
      return LOAD_LANE_TABLE_ADMISSION_RETRY_AFTER_MS;
    }
  }

  /**
   * Return true when one load-lane SQL failure should be surfaced as
   * bounded retry pressure instead of a hard failure.
   * @param {Object} value
   * @return {boolean}
   * @private
   */
  isRetryableLoadLaneExecutionFailure(value = null) {
    if (stryMutAct_9fa48("9645")) {
      {}
    } else {
      stryCov_9fa48("9645");
      if (stryMutAct_9fa48("9648") ? !value && typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("9647") ? false : stryMutAct_9fa48("9646") ? true : (stryCov_9fa48("9646", "9647", "9648"), (stryMutAct_9fa48("9649") ? value : (stryCov_9fa48("9649"), !value)) || (stryMutAct_9fa48("9651") ? typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("9650") ? false : (stryCov_9fa48("9650", "9651"), typeof value !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("9652")) {
          {}
        } else {
          stryCov_9fa48("9652");
          return stryMutAct_9fa48("9653") ? true : (stryCov_9fa48("9653"), false);
        }
      }
      if (stryMutAct_9fa48("9656") ? value.deferRetry !== true : stryMutAct_9fa48("9655") ? false : stryMutAct_9fa48("9654") ? true : (stryCov_9fa48("9654", "9655", "9656"), value.deferRetry === (stryMutAct_9fa48("9657") ? false : (stryCov_9fa48("9657"), true)))) {
        if (stryMutAct_9fa48("9658")) {
          {}
        } else {
          stryCov_9fa48("9658");
          return stryMutAct_9fa48("9659") ? false : (stryCov_9fa48("9659"), true);
        }
      }
      if (stryMutAct_9fa48("9663") ? getControlPlaneRetryAfterMs(value) <= NUM.ZERO : stryMutAct_9fa48("9662") ? getControlPlaneRetryAfterMs(value) >= NUM.ZERO : stryMutAct_9fa48("9661") ? false : stryMutAct_9fa48("9660") ? true : (stryCov_9fa48("9660", "9661", "9662", "9663"), getControlPlaneRetryAfterMs(value) > NUM.ZERO)) {
        if (stryMutAct_9fa48("9664")) {
          {}
        } else {
          stryCov_9fa48("9664");
          return stryMutAct_9fa48("9665") ? false : (stryCov_9fa48("9665"), true);
        }
      }
      if (stryMutAct_9fa48("9667") ? false : stryMutAct_9fa48("9666") ? true : (stryCov_9fa48("9666", "9667"), isRetryableControlPlaneError(value))) {
        if (stryMutAct_9fa48("9668")) {
          {}
        } else {
          stryCov_9fa48("9668");
          return stryMutAct_9fa48("9669") ? false : (stryCov_9fa48("9669"), true);
        }
      }
      const errorCode = stryMutAct_9fa48("9670") ? String(value?.errorCode || value?.code || EMPTY_STRING).toUpperCase() : (stryCov_9fa48("9670"), String(stryMutAct_9fa48("9673") ? (value?.errorCode || value?.code) && EMPTY_STRING : stryMutAct_9fa48("9672") ? false : stryMutAct_9fa48("9671") ? true : (stryCov_9fa48("9671", "9672", "9673"), (stryMutAct_9fa48("9675") ? value?.errorCode && value?.code : stryMutAct_9fa48("9674") ? false : (stryCov_9fa48("9674", "9675"), (stryMutAct_9fa48("9676") ? value.errorCode : (stryCov_9fa48("9676"), value?.errorCode)) || (stryMutAct_9fa48("9677") ? value.code : (stryCov_9fa48("9677"), value?.code)))) || EMPTY_STRING)).toLowerCase());
      if (stryMutAct_9fa48("9680") ? errorCode !== String(ErrorCode.TIMEOUT).toLowerCase() : stryMutAct_9fa48("9679") ? false : stryMutAct_9fa48("9678") ? true : (stryCov_9fa48("9678", "9679", "9680"), errorCode === (stryMutAct_9fa48("9681") ? String(ErrorCode.TIMEOUT).toUpperCase() : (stryCov_9fa48("9681"), String(ErrorCode.TIMEOUT).toLowerCase())))) {
        if (stryMutAct_9fa48("9682")) {
          {}
        } else {
          stryCov_9fa48("9682");
          return stryMutAct_9fa48("9683") ? false : (stryCov_9fa48("9683"), true);
        }
      }
      const message = stryMutAct_9fa48("9684") ? String(value?.message || value?.error || EMPTY_STRING).toUpperCase() : (stryCov_9fa48("9684"), String(stryMutAct_9fa48("9687") ? (value?.message || value?.error) && EMPTY_STRING : stryMutAct_9fa48("9686") ? false : stryMutAct_9fa48("9685") ? true : (stryCov_9fa48("9685", "9686", "9687"), (stryMutAct_9fa48("9689") ? value?.message && value?.error : stryMutAct_9fa48("9688") ? false : (stryCov_9fa48("9688", "9689"), (stryMutAct_9fa48("9690") ? value.message : (stryCov_9fa48("9690"), value?.message)) || (stryMutAct_9fa48("9691") ? value.error : (stryCov_9fa48("9691"), value?.error)))) || EMPTY_STRING)).toLowerCase());
      return stryMutAct_9fa48("9694") ? (message.includes('timeout') || message.includes('timed out')) && message.includes('deadline exceeded') : stryMutAct_9fa48("9693") ? false : stryMutAct_9fa48("9692") ? true : (stryCov_9fa48("9692", "9693", "9694"), (stryMutAct_9fa48("9696") ? message.includes('timeout') && message.includes('timed out') : stryMutAct_9fa48("9695") ? false : (stryCov_9fa48("9695", "9696"), message.includes(stryMutAct_9fa48("9697") ? "" : (stryCov_9fa48("9697"), 'timeout')) || message.includes(stryMutAct_9fa48("9698") ? "" : (stryCov_9fa48("9698"), 'timed out')))) || message.includes(stryMutAct_9fa48("9699") ? "" : (stryCov_9fa48("9699"), 'deadline exceeded')));
    }
  }

  /**
   * Execute one simple single-table system observation query from the local
   * cache instead of routing it back through SqlCore.
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Object|null}
   * @private
   */
  tryExecuteLocalSystemTableObservationQuery(sql, params = stryMutAct_9fa48("9700") ? ["Stryker was here"] : (stryCov_9fa48("9700"), [])) {
    if (stryMutAct_9fa48("9701")) {
      {}
    } else {
      stryCov_9fa48("9701");
      if (stryMutAct_9fa48("9704") ? (!this.systemTableCache || typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) && typeof sql !== TYPEOF.STRING : stryMutAct_9fa48("9703") ? false : stryMutAct_9fa48("9702") ? true : (stryCov_9fa48("9702", "9703", "9704"), (stryMutAct_9fa48("9706") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("9705") ? false : (stryCov_9fa48("9705", "9706"), (stryMutAct_9fa48("9707") ? this.systemTableCache : (stryCov_9fa48("9707"), !this.systemTableCache)) || (stryMutAct_9fa48("9709") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("9708") ? false : (stryCov_9fa48("9708", "9709"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("9711") ? typeof sql === TYPEOF.STRING : stryMutAct_9fa48("9710") ? false : (stryCov_9fa48("9710", "9711"), typeof sql !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("9712")) {
          {}
        } else {
          stryCov_9fa48("9712");
          return null;
        }
      }
      let ast;
      try {
        if (stryMutAct_9fa48("9713")) {
          {}
        } else {
          stryCov_9fa48("9713");
          ast = new SQLParser(sql).parse();
        }
      } catch (_error) {
        if (stryMutAct_9fa48("9714")) {
          {}
        } else {
          stryCov_9fa48("9714");
          return null;
        }
      }
      if (stryMutAct_9fa48("9717") ? (ast?.type !== AST_TYPE.SELECT || !ast.from || ast.from.subquery || Array.isArray(ast.joins) && ast.joins.length > NUM.ZERO || ast.distinct === true || ast.groupBy || ast.having || ast.ctes || ast.recursive === true) && ast.setOperation : stryMutAct_9fa48("9716") ? false : stryMutAct_9fa48("9715") ? true : (stryCov_9fa48("9715", "9716", "9717"), (stryMutAct_9fa48("9719") ? (ast?.type !== AST_TYPE.SELECT || !ast.from || ast.from.subquery || Array.isArray(ast.joins) && ast.joins.length > NUM.ZERO || ast.distinct === true || ast.groupBy || ast.having || ast.ctes) && ast.recursive === true : stryMutAct_9fa48("9718") ? false : (stryCov_9fa48("9718", "9719"), (stryMutAct_9fa48("9721") ? (ast?.type !== AST_TYPE.SELECT || !ast.from || ast.from.subquery || Array.isArray(ast.joins) && ast.joins.length > NUM.ZERO || ast.distinct === true || ast.groupBy || ast.having) && ast.ctes : stryMutAct_9fa48("9720") ? false : (stryCov_9fa48("9720", "9721"), (stryMutAct_9fa48("9723") ? (ast?.type !== AST_TYPE.SELECT || !ast.from || ast.from.subquery || Array.isArray(ast.joins) && ast.joins.length > NUM.ZERO || ast.distinct === true || ast.groupBy) && ast.having : stryMutAct_9fa48("9722") ? false : (stryCov_9fa48("9722", "9723"), (stryMutAct_9fa48("9725") ? (ast?.type !== AST_TYPE.SELECT || !ast.from || ast.from.subquery || Array.isArray(ast.joins) && ast.joins.length > NUM.ZERO || ast.distinct === true) && ast.groupBy : stryMutAct_9fa48("9724") ? false : (stryCov_9fa48("9724", "9725"), (stryMutAct_9fa48("9727") ? (ast?.type !== AST_TYPE.SELECT || !ast.from || ast.from.subquery || Array.isArray(ast.joins) && ast.joins.length > NUM.ZERO) && ast.distinct === true : stryMutAct_9fa48("9726") ? false : (stryCov_9fa48("9726", "9727"), (stryMutAct_9fa48("9729") ? (ast?.type !== AST_TYPE.SELECT || !ast.from || ast.from.subquery) && Array.isArray(ast.joins) && ast.joins.length > NUM.ZERO : stryMutAct_9fa48("9728") ? false : (stryCov_9fa48("9728", "9729"), (stryMutAct_9fa48("9731") ? (ast?.type !== AST_TYPE.SELECT || !ast.from) && ast.from.subquery : stryMutAct_9fa48("9730") ? false : (stryCov_9fa48("9730", "9731"), (stryMutAct_9fa48("9733") ? ast?.type !== AST_TYPE.SELECT && !ast.from : stryMutAct_9fa48("9732") ? false : (stryCov_9fa48("9732", "9733"), (stryMutAct_9fa48("9735") ? ast?.type === AST_TYPE.SELECT : stryMutAct_9fa48("9734") ? false : (stryCov_9fa48("9734", "9735"), (stryMutAct_9fa48("9736") ? ast.type : (stryCov_9fa48("9736"), ast?.type)) !== AST_TYPE.SELECT)) || (stryMutAct_9fa48("9737") ? ast.from : (stryCov_9fa48("9737"), !ast.from)))) || ast.from.subquery)) || (stryMutAct_9fa48("9739") ? Array.isArray(ast.joins) || ast.joins.length > NUM.ZERO : stryMutAct_9fa48("9738") ? false : (stryCov_9fa48("9738", "9739"), Array.isArray(ast.joins) && (stryMutAct_9fa48("9742") ? ast.joins.length <= NUM.ZERO : stryMutAct_9fa48("9741") ? ast.joins.length >= NUM.ZERO : stryMutAct_9fa48("9740") ? true : (stryCov_9fa48("9740", "9741", "9742"), ast.joins.length > NUM.ZERO)))))) || (stryMutAct_9fa48("9744") ? ast.distinct !== true : stryMutAct_9fa48("9743") ? false : (stryCov_9fa48("9743", "9744"), ast.distinct === (stryMutAct_9fa48("9745") ? false : (stryCov_9fa48("9745"), true)))))) || ast.groupBy)) || ast.having)) || ast.ctes)) || (stryMutAct_9fa48("9747") ? ast.recursive !== true : stryMutAct_9fa48("9746") ? false : (stryCov_9fa48("9746", "9747"), ast.recursive === (stryMutAct_9fa48("9748") ? false : (stryCov_9fa48("9748"), true)))))) || ast.setOperation)) {
        if (stryMutAct_9fa48("9749")) {
          {}
        } else {
          stryCov_9fa48("9749");
          return null;
        }
      }
      const tableName = normalizeIdentifier(ast.from.name);
      if (stryMutAct_9fa48("9752") ? !tableName && !ADMIN_CACHE_OBSERVATION_TABLES.has(tableName) : stryMutAct_9fa48("9751") ? false : stryMutAct_9fa48("9750") ? true : (stryCov_9fa48("9750", "9751", "9752"), (stryMutAct_9fa48("9753") ? tableName : (stryCov_9fa48("9753"), !tableName)) || (stryMutAct_9fa48("9754") ? ADMIN_CACHE_OBSERVATION_TABLES.has(tableName) : (stryCov_9fa48("9754"), !ADMIN_CACHE_OBSERVATION_TABLES.has(tableName))))) {
        if (stryMutAct_9fa48("9755")) {
          {}
        } else {
          stryCov_9fa48("9755");
          return null;
        }
      }
      if (stryMutAct_9fa48("9757") ? false : stryMutAct_9fa48("9756") ? true : (stryCov_9fa48("9756", "9757"), this.shouldRouteSystemTableObservationThroughAuthoritativeRead(tableName))) {
        if (stryMutAct_9fa48("9758")) {
          {}
        } else {
          stryCov_9fa48("9758");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("9759")) {
          {}
        } else {
          stryCov_9fa48("9759");
          let rows = this.systemTableCache.getAll(tableName);
          rows = Array.isArray(rows) ? rows.map(stryMutAct_9fa48("9760") ? () => undefined : (stryCov_9fa48("9760"), row => stryMutAct_9fa48("9761") ? {} : (stryCov_9fa48("9761"), {
            ...row
          }))) : stryMutAct_9fa48("9762") ? ["Stryker was here"] : (stryCov_9fa48("9762"), []);
          rows = stryMutAct_9fa48("9763") ? rows : (stryCov_9fa48("9763"), rows.filter(stryMutAct_9fa48("9764") ? () => undefined : (stryCov_9fa48("9764"), row => this.evaluateLocalSystemTableObservationExpression(ast.where, row, params))));
          rows = this.sortLocalSystemTableObservationRows(rows, ast.orderBy, params);
          rows = this.limitLocalSystemTableObservationRows(rows, ast.limit);
          rows = this.projectLocalSystemTableObservationRows(rows, ast.columns, params);
          if (stryMutAct_9fa48("9767") ? rows !== null : stryMutAct_9fa48("9766") ? false : stryMutAct_9fa48("9765") ? true : (stryCov_9fa48("9765", "9766", "9767"), rows === null)) {
            if (stryMutAct_9fa48("9768")) {
              {}
            } else {
              stryCov_9fa48("9768");
              return null;
            }
          }
          return stryMutAct_9fa48("9769") ? {} : (stryCov_9fa48("9769"), {
            success: stryMutAct_9fa48("9770") ? false : (stryCov_9fa48("9770"), true),
            rows,
            count: rows.length,
            partitions: this.resolveLocalSystemTableObservationPartitions(tableName, rows),
            tableName
          });
        }
      } catch (_error) {
        if (stryMutAct_9fa48("9771")) {
          {}
        } else {
          stryCov_9fa48("9771");
          return null;
        }
      }
    }
  }

  /**
   * Return true when a local cache observation query should defer to the
   * canonical authoritative read path because the local shared-metadata graph
   * is internally inconsistent.
   * @param {string} tableName
   * @return {boolean}
   * @private
   */
  shouldRouteSystemTableObservationThroughAuthoritativeRead(tableName) {
    if (stryMutAct_9fa48("9772")) {
      {}
    } else {
      stryCov_9fa48("9772");
      if (stryMutAct_9fa48("9775") ? (!tableName || !this.systemTableCache) && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("9774") ? false : stryMutAct_9fa48("9773") ? true : (stryCov_9fa48("9773", "9774", "9775"), (stryMutAct_9fa48("9777") ? !tableName && !this.systemTableCache : stryMutAct_9fa48("9776") ? false : (stryCov_9fa48("9776", "9777"), (stryMutAct_9fa48("9778") ? tableName : (stryCov_9fa48("9778"), !tableName)) || (stryMutAct_9fa48("9779") ? this.systemTableCache : (stryCov_9fa48("9779"), !this.systemTableCache)))) || (stryMutAct_9fa48("9781") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("9780") ? false : (stryCov_9fa48("9780", "9781"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("9782")) {
          {}
        } else {
          stryCov_9fa48("9782");
          return stryMutAct_9fa48("9783") ? true : (stryCov_9fa48("9783"), false);
        }
      }
      if (stryMutAct_9fa48("9786") ? false : stryMutAct_9fa48("9785") ? true : stryMutAct_9fa48("9784") ? ADMIN_CACHE_OBSERVATION_TABLES.has(tableName) : (stryCov_9fa48("9784", "9785", "9786"), !ADMIN_CACHE_OBSERVATION_TABLES.has(tableName))) {
        if (stryMutAct_9fa48("9787")) {
          {}
        } else {
          stryCov_9fa48("9787");
          return stryMutAct_9fa48("9788") ? true : (stryCov_9fa48("9788"), false);
        }
      }
      const nodeCoverage = evaluateSharedMetadataNodeCoverage(stryMutAct_9fa48("9789") ? {} : (stryCov_9fa48("9789"), {
        nodeRows: this.systemTableCache.getAll(TABLES.NODES),
        serviceRows: this.systemTableCache.getAll(TABLES.SERVICES),
        partitionRows: this.systemTableCache.getAll(TABLES.PARTITIONS),
        nodeEndpointRows: this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS)
      }));
      return stryMutAct_9fa48("9792") ? nodeCoverage.hasCoverageGap !== true : stryMutAct_9fa48("9791") ? false : stryMutAct_9fa48("9790") ? true : (stryCov_9fa48("9790", "9791", "9792"), nodeCoverage.hasCoverageGap === (stryMutAct_9fa48("9793") ? false : (stryCov_9fa48("9793"), true)));
    }
  }

  /**
   * Evaluate one cache-backed WHERE expression against one row.
   * @param {Object|null} expr
   * @param {Object} row
   * @param {Array<*>} params
   * @return {boolean}
   * @private
   */
  evaluateLocalSystemTableObservationExpression(expr, row, params = stryMutAct_9fa48("9794") ? ["Stryker was here"] : (stryCov_9fa48("9794"), [])) {
    if (stryMutAct_9fa48("9795")) {
      {}
    } else {
      stryCov_9fa48("9795");
      if (stryMutAct_9fa48("9798") ? false : stryMutAct_9fa48("9797") ? true : stryMutAct_9fa48("9796") ? expr : (stryCov_9fa48("9796", "9797", "9798"), !expr)) {
        if (stryMutAct_9fa48("9799")) {
          {}
        } else {
          stryCov_9fa48("9799");
          return stryMutAct_9fa48("9800") ? false : (stryCov_9fa48("9800"), true);
        }
      }
      if (stryMutAct_9fa48("9803") ? expr.type !== EXPR_TYPE.BINARY : stryMutAct_9fa48("9802") ? false : stryMutAct_9fa48("9801") ? true : (stryCov_9fa48("9801", "9802", "9803"), expr.type === EXPR_TYPE.BINARY)) {
        if (stryMutAct_9fa48("9804")) {
          {}
        } else {
          stryCov_9fa48("9804");
          if (stryMutAct_9fa48("9807") ? expr.operator !== 'AND' : stryMutAct_9fa48("9806") ? false : stryMutAct_9fa48("9805") ? true : (stryCov_9fa48("9805", "9806", "9807"), expr.operator === (stryMutAct_9fa48("9808") ? "" : (stryCov_9fa48("9808"), 'AND')))) {
            if (stryMutAct_9fa48("9809")) {
              {}
            } else {
              stryCov_9fa48("9809");
              return stryMutAct_9fa48("9812") ? this.evaluateLocalSystemTableObservationExpression(expr.left, row, params) || this.evaluateLocalSystemTableObservationExpression(expr.right, row, params) : stryMutAct_9fa48("9811") ? false : stryMutAct_9fa48("9810") ? true : (stryCov_9fa48("9810", "9811", "9812"), this.evaluateLocalSystemTableObservationExpression(expr.left, row, params) && this.evaluateLocalSystemTableObservationExpression(expr.right, row, params));
            }
          }
          if (stryMutAct_9fa48("9815") ? expr.operator !== 'OR' : stryMutAct_9fa48("9814") ? false : stryMutAct_9fa48("9813") ? true : (stryCov_9fa48("9813", "9814", "9815"), expr.operator === (stryMutAct_9fa48("9816") ? "" : (stryCov_9fa48("9816"), 'OR')))) {
            if (stryMutAct_9fa48("9817")) {
              {}
            } else {
              stryCov_9fa48("9817");
              return stryMutAct_9fa48("9820") ? this.evaluateLocalSystemTableObservationExpression(expr.left, row, params) && this.evaluateLocalSystemTableObservationExpression(expr.right, row, params) : stryMutAct_9fa48("9819") ? false : stryMutAct_9fa48("9818") ? true : (stryCov_9fa48("9818", "9819", "9820"), this.evaluateLocalSystemTableObservationExpression(expr.left, row, params) || this.evaluateLocalSystemTableObservationExpression(expr.right, row, params));
            }
          }
          const leftValue = this.resolveLocalSystemTableObservationValue(expr.left, row, params);
          const rightValue = this.resolveLocalSystemTableObservationValue(expr.right, row, params);
          const comparison = this.compareLocalSystemTableObservationValues(leftValue, rightValue);
          switch (expr.operator) {
            case stryMutAct_9fa48("9822") ? "" : (stryCov_9fa48("9822"), '='):
              if (stryMutAct_9fa48("9821")) {} else {
                stryCov_9fa48("9821");
                return stryMutAct_9fa48("9825") ? comparison !== NUM.ZERO : stryMutAct_9fa48("9824") ? false : stryMutAct_9fa48("9823") ? true : (stryCov_9fa48("9823", "9824", "9825"), comparison === NUM.ZERO);
              }
            case stryMutAct_9fa48("9827") ? "" : (stryCov_9fa48("9827"), '<>'):
              if (stryMutAct_9fa48("9826")) {} else {
                stryCov_9fa48("9826");
                return stryMutAct_9fa48("9830") ? comparison === NUM.ZERO : stryMutAct_9fa48("9829") ? false : stryMutAct_9fa48("9828") ? true : (stryCov_9fa48("9828", "9829", "9830"), comparison !== NUM.ZERO);
              }
            case stryMutAct_9fa48("9832") ? "" : (stryCov_9fa48("9832"), '>'):
              if (stryMutAct_9fa48("9831")) {} else {
                stryCov_9fa48("9831");
                return stryMutAct_9fa48("9836") ? comparison <= NUM.ZERO : stryMutAct_9fa48("9835") ? comparison >= NUM.ZERO : stryMutAct_9fa48("9834") ? false : stryMutAct_9fa48("9833") ? true : (stryCov_9fa48("9833", "9834", "9835", "9836"), comparison > NUM.ZERO);
              }
            case stryMutAct_9fa48("9838") ? "" : (stryCov_9fa48("9838"), '>='):
              if (stryMutAct_9fa48("9837")) {} else {
                stryCov_9fa48("9837");
                return stryMutAct_9fa48("9842") ? comparison < NUM.ZERO : stryMutAct_9fa48("9841") ? comparison > NUM.ZERO : stryMutAct_9fa48("9840") ? false : stryMutAct_9fa48("9839") ? true : (stryCov_9fa48("9839", "9840", "9841", "9842"), comparison >= NUM.ZERO);
              }
            case stryMutAct_9fa48("9844") ? "" : (stryCov_9fa48("9844"), '<'):
              if (stryMutAct_9fa48("9843")) {} else {
                stryCov_9fa48("9843");
                return stryMutAct_9fa48("9848") ? comparison >= NUM.ZERO : stryMutAct_9fa48("9847") ? comparison <= NUM.ZERO : stryMutAct_9fa48("9846") ? false : stryMutAct_9fa48("9845") ? true : (stryCov_9fa48("9845", "9846", "9847", "9848"), comparison < NUM.ZERO);
              }
            case stryMutAct_9fa48("9850") ? "" : (stryCov_9fa48("9850"), '<='):
              if (stryMutAct_9fa48("9849")) {} else {
                stryCov_9fa48("9849");
                return stryMutAct_9fa48("9854") ? comparison > NUM.ZERO : stryMutAct_9fa48("9853") ? comparison < NUM.ZERO : stryMutAct_9fa48("9852") ? false : stryMutAct_9fa48("9851") ? true : (stryCov_9fa48("9851", "9852", "9853", "9854"), comparison <= NUM.ZERO);
              }
            case stryMutAct_9fa48("9856") ? "" : (stryCov_9fa48("9856"), 'IS NULL'):
              if (stryMutAct_9fa48("9855")) {} else {
                stryCov_9fa48("9855");
                return stryMutAct_9fa48("9859") ? leftValue === null && leftValue === undefined : stryMutAct_9fa48("9858") ? false : stryMutAct_9fa48("9857") ? true : (stryCov_9fa48("9857", "9858", "9859"), (stryMutAct_9fa48("9861") ? leftValue !== null : stryMutAct_9fa48("9860") ? false : (stryCov_9fa48("9860", "9861"), leftValue === null)) || (stryMutAct_9fa48("9863") ? leftValue !== undefined : stryMutAct_9fa48("9862") ? false : (stryCov_9fa48("9862", "9863"), leftValue === undefined)));
              }
            case stryMutAct_9fa48("9865") ? "" : (stryCov_9fa48("9865"), 'IS NOT NULL'):
              if (stryMutAct_9fa48("9864")) {} else {
                stryCov_9fa48("9864");
                return stryMutAct_9fa48("9868") ? leftValue !== null || leftValue !== undefined : stryMutAct_9fa48("9867") ? false : stryMutAct_9fa48("9866") ? true : (stryCov_9fa48("9866", "9867", "9868"), (stryMutAct_9fa48("9870") ? leftValue === null : stryMutAct_9fa48("9869") ? true : (stryCov_9fa48("9869", "9870"), leftValue !== null)) && (stryMutAct_9fa48("9872") ? leftValue === undefined : stryMutAct_9fa48("9871") ? true : (stryCov_9fa48("9871", "9872"), leftValue !== undefined)));
              }
            default:
              if (stryMutAct_9fa48("9873")) {} else {
                stryCov_9fa48("9873");
                throw new Error(stryMutAct_9fa48("9874") ? `` : (stryCov_9fa48("9874"), `Unsupported local admin cache operator: ${expr.operator}`));
              }
          }
        }
      }
      if (stryMutAct_9fa48("9877") ? expr.type !== EXPR_TYPE.IN : stryMutAct_9fa48("9876") ? false : stryMutAct_9fa48("9875") ? true : (stryCov_9fa48("9875", "9876", "9877"), expr.type === EXPR_TYPE.IN)) {
        if (stryMutAct_9fa48("9878")) {
          {}
        } else {
          stryCov_9fa48("9878");
          const candidate = this.resolveLocalSystemTableObservationValue(expr.expression, row, params);
          const values = Array.isArray(expr.values) ? expr.values : stryMutAct_9fa48("9879") ? ["Stryker was here"] : (stryCov_9fa48("9879"), []);
          const matched = stryMutAct_9fa48("9880") ? values.every(valueExpr => {
            const value = this.resolveLocalSystemTableObservationValue(valueExpr, row, params);
            return this.compareLocalSystemTableObservationValues(candidate, value) === NUM.ZERO;
          }) : (stryCov_9fa48("9880"), values.some(valueExpr => {
            if (stryMutAct_9fa48("9881")) {
              {}
            } else {
              stryCov_9fa48("9881");
              const value = this.resolveLocalSystemTableObservationValue(valueExpr, row, params);
              return stryMutAct_9fa48("9884") ? this.compareLocalSystemTableObservationValues(candidate, value) !== NUM.ZERO : stryMutAct_9fa48("9883") ? false : stryMutAct_9fa48("9882") ? true : (stryCov_9fa48("9882", "9883", "9884"), this.compareLocalSystemTableObservationValues(candidate, value) === NUM.ZERO);
            }
          }));
          return (stryMutAct_9fa48("9887") ? expr.negated !== true : stryMutAct_9fa48("9886") ? false : stryMutAct_9fa48("9885") ? true : (stryCov_9fa48("9885", "9886", "9887"), expr.negated === (stryMutAct_9fa48("9888") ? false : (stryCov_9fa48("9888"), true)))) ? stryMutAct_9fa48("9889") ? matched : (stryCov_9fa48("9889"), !matched) : matched;
        }
      }
      if (stryMutAct_9fa48("9892") ? expr.type !== EXPR_TYPE.LIKE : stryMutAct_9fa48("9891") ? false : stryMutAct_9fa48("9890") ? true : (stryCov_9fa48("9890", "9891", "9892"), expr.type === EXPR_TYPE.LIKE)) {
        if (stryMutAct_9fa48("9893")) {
          {}
        } else {
          stryCov_9fa48("9893");
          const candidate = this.resolveLocalSystemTableObservationValue(expr.expression, row, params);
          const pattern = this.resolveLocalSystemTableObservationValue(expr.pattern, row, params);
          const matched = this.matchesLocalSystemTableObservationLike(candidate, pattern);
          return (stryMutAct_9fa48("9896") ? expr.negated !== true : stryMutAct_9fa48("9895") ? false : stryMutAct_9fa48("9894") ? true : (stryCov_9fa48("9894", "9895", "9896"), expr.negated === (stryMutAct_9fa48("9897") ? false : (stryCov_9fa48("9897"), true)))) ? stryMutAct_9fa48("9898") ? matched : (stryCov_9fa48("9898"), !matched) : matched;
        }
      }
      if (stryMutAct_9fa48("9901") ? expr.type === EXPR_TYPE.UNARY || expr.operator === 'NOT' : stryMutAct_9fa48("9900") ? false : stryMutAct_9fa48("9899") ? true : (stryCov_9fa48("9899", "9900", "9901"), (stryMutAct_9fa48("9903") ? expr.type !== EXPR_TYPE.UNARY : stryMutAct_9fa48("9902") ? true : (stryCov_9fa48("9902", "9903"), expr.type === EXPR_TYPE.UNARY)) && (stryMutAct_9fa48("9905") ? expr.operator !== 'NOT' : stryMutAct_9fa48("9904") ? true : (stryCov_9fa48("9904", "9905"), expr.operator === (stryMutAct_9fa48("9906") ? "" : (stryCov_9fa48("9906"), 'NOT')))))) {
        if (stryMutAct_9fa48("9907")) {
          {}
        } else {
          stryCov_9fa48("9907");
          return stryMutAct_9fa48("9908") ? this.evaluateLocalSystemTableObservationExpression(expr.operand, row, params) : (stryCov_9fa48("9908"), !this.evaluateLocalSystemTableObservationExpression(expr.operand, row, params));
        }
      }
      return Boolean(this.resolveLocalSystemTableObservationValue(expr, row, params));
    }
  }

  /**
   * Resolve one supported expression value against one cache row.
   * @param {Object|null} expr
   * @param {Object} row
   * @param {Array<*>} params
   * @return {*}
   * @private
   */
  resolveLocalSystemTableObservationValue(expr, row, params = stryMutAct_9fa48("9909") ? ["Stryker was here"] : (stryCov_9fa48("9909"), [])) {
    if (stryMutAct_9fa48("9910")) {
      {}
    } else {
      stryCov_9fa48("9910");
      if (stryMutAct_9fa48("9913") ? false : stryMutAct_9fa48("9912") ? true : stryMutAct_9fa48("9911") ? expr : (stryCov_9fa48("9911", "9912", "9913"), !expr)) {
        if (stryMutAct_9fa48("9914")) {
          {}
        } else {
          stryCov_9fa48("9914");
          return null;
        }
      }
      switch (expr.type) {
        case EXPR_TYPE.LITERAL:
          if (stryMutAct_9fa48("9915")) {} else {
            stryCov_9fa48("9915");
            return expr.value;
          }
        case EXPR_TYPE.PARAMETER:
          if (stryMutAct_9fa48("9916")) {} else {
            stryCov_9fa48("9916");
            return params[expr.index];
          }
        case EXPR_TYPE.COLUMN:
          if (stryMutAct_9fa48("9917")) {} else {
            stryCov_9fa48("9917");
            return this.resolveLocalSystemTableObservationValue(expr.expression, row, params);
          }
        case EXPR_TYPE.COLUMN_REF:
          if (stryMutAct_9fa48("9918")) {} else {
            stryCov_9fa48("9918");
            {
              if (stryMutAct_9fa48("9919")) {
                {}
              } else {
                stryCov_9fa48("9919");
                const directValue = stryMutAct_9fa48("9920") ? row[expr.column] : (stryCov_9fa48("9920"), row?.[expr.column]);
                if (stryMutAct_9fa48("9923") ? directValue === undefined : stryMutAct_9fa48("9922") ? false : stryMutAct_9fa48("9921") ? true : (stryCov_9fa48("9921", "9922", "9923"), directValue !== undefined)) {
                  if (stryMutAct_9fa48("9924")) {
                    {}
                  } else {
                    stryCov_9fa48("9924");
                    return directValue;
                  }
                }
                const normalizedColumn = normalizeIdentifier(expr.column);
                if (stryMutAct_9fa48("9927") ? false : stryMutAct_9fa48("9926") ? true : stryMutAct_9fa48("9925") ? normalizedColumn : (stryCov_9fa48("9925", "9926", "9927"), !normalizedColumn)) {
                  if (stryMutAct_9fa48("9928")) {
                    {}
                  } else {
                    stryCov_9fa48("9928");
                    return undefined;
                  }
                }
                for (const [key, value] of Object.entries(stryMutAct_9fa48("9931") ? row && {} : stryMutAct_9fa48("9930") ? false : stryMutAct_9fa48("9929") ? true : (stryCov_9fa48("9929", "9930", "9931"), row || {}))) {
                  if (stryMutAct_9fa48("9932")) {
                    {}
                  } else {
                    stryCov_9fa48("9932");
                    if (stryMutAct_9fa48("9935") ? normalizeIdentifier(key) !== normalizedColumn : stryMutAct_9fa48("9934") ? false : stryMutAct_9fa48("9933") ? true : (stryCov_9fa48("9933", "9934", "9935"), normalizeIdentifier(key) === normalizedColumn)) {
                      if (stryMutAct_9fa48("9936")) {
                        {}
                      } else {
                        stryCov_9fa48("9936");
                        return value;
                      }
                    }
                  }
                }
                return undefined;
              }
            }
          }
        case EXPR_TYPE.UNARY:
          if (stryMutAct_9fa48("9937")) {} else {
            stryCov_9fa48("9937");
            if (stryMutAct_9fa48("9940") ? expr.operator !== '-' : stryMutAct_9fa48("9939") ? false : stryMutAct_9fa48("9938") ? true : (stryCov_9fa48("9938", "9939", "9940"), expr.operator === (stryMutAct_9fa48("9941") ? "" : (stryCov_9fa48("9941"), '-')))) {
              if (stryMutAct_9fa48("9942")) {
                {}
              } else {
                stryCov_9fa48("9942");
                const value = Number(this.resolveLocalSystemTableObservationValue(expr.operand, row, params));
                return Number.isFinite(value) ? stryMutAct_9fa48("9943") ? +value : (stryCov_9fa48("9943"), -value) : null;
              }
            }
            return this.resolveLocalSystemTableObservationValue(expr.operand, row, params);
          }
        default:
          if (stryMutAct_9fa48("9944")) {} else {
            stryCov_9fa48("9944");
            throw new Error(stryMutAct_9fa48("9945") ? `` : (stryCov_9fa48("9945"), `Unsupported local admin cache expression: ${expr.type}`));
          }
      }
    }
  }

  /**
   * Compare two cache observation values.
   * @param {*} left
   * @param {*} right
   * @return {number}
   * @private
   */
  compareLocalSystemTableObservationValues(left, right) {
    if (stryMutAct_9fa48("9946")) {
      {}
    } else {
      stryCov_9fa48("9946");
      if (stryMutAct_9fa48("9949") ? left !== right : stryMutAct_9fa48("9948") ? false : stryMutAct_9fa48("9947") ? true : (stryCov_9fa48("9947", "9948", "9949"), left === right)) {
        if (stryMutAct_9fa48("9950")) {
          {}
        } else {
          stryCov_9fa48("9950");
          return NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("9953") ? left === null && left === undefined : stryMutAct_9fa48("9952") ? false : stryMutAct_9fa48("9951") ? true : (stryCov_9fa48("9951", "9952", "9953"), (stryMutAct_9fa48("9955") ? left !== null : stryMutAct_9fa48("9954") ? false : (stryCov_9fa48("9954", "9955"), left === null)) || (stryMutAct_9fa48("9957") ? left !== undefined : stryMutAct_9fa48("9956") ? false : (stryCov_9fa48("9956", "9957"), left === undefined)))) {
        if (stryMutAct_9fa48("9958")) {
          {}
        } else {
          stryCov_9fa48("9958");
          return NUM.NEGATIVE_ONE;
        }
      }
      if (stryMutAct_9fa48("9961") ? right === null && right === undefined : stryMutAct_9fa48("9960") ? false : stryMutAct_9fa48("9959") ? true : (stryCov_9fa48("9959", "9960", "9961"), (stryMutAct_9fa48("9963") ? right !== null : stryMutAct_9fa48("9962") ? false : (stryCov_9fa48("9962", "9963"), right === null)) || (stryMutAct_9fa48("9965") ? right !== undefined : stryMutAct_9fa48("9964") ? false : (stryCov_9fa48("9964", "9965"), right === undefined)))) {
        if (stryMutAct_9fa48("9966")) {
          {}
        } else {
          stryCov_9fa48("9966");
          return NUM.ONE;
        }
      }
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      if (stryMutAct_9fa48("9969") ? Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && String(left).trim().length > NUM.ZERO || String(right).trim().length > NUM.ZERO : stryMutAct_9fa48("9968") ? false : stryMutAct_9fa48("9967") ? true : (stryCov_9fa48("9967", "9968", "9969"), (stryMutAct_9fa48("9971") ? Number.isFinite(leftNumber) && Number.isFinite(rightNumber) || String(left).trim().length > NUM.ZERO : stryMutAct_9fa48("9970") ? true : (stryCov_9fa48("9970", "9971"), (stryMutAct_9fa48("9973") ? Number.isFinite(leftNumber) || Number.isFinite(rightNumber) : stryMutAct_9fa48("9972") ? true : (stryCov_9fa48("9972", "9973"), Number.isFinite(leftNumber) && Number.isFinite(rightNumber))) && (stryMutAct_9fa48("9976") ? String(left).trim().length <= NUM.ZERO : stryMutAct_9fa48("9975") ? String(left).trim().length >= NUM.ZERO : stryMutAct_9fa48("9974") ? true : (stryCov_9fa48("9974", "9975", "9976"), (stryMutAct_9fa48("9977") ? String(left).length : (stryCov_9fa48("9977"), String(left).trim().length)) > NUM.ZERO)))) && (stryMutAct_9fa48("9980") ? String(right).trim().length <= NUM.ZERO : stryMutAct_9fa48("9979") ? String(right).trim().length >= NUM.ZERO : stryMutAct_9fa48("9978") ? true : (stryCov_9fa48("9978", "9979", "9980"), (stryMutAct_9fa48("9981") ? String(right).length : (stryCov_9fa48("9981"), String(right).trim().length)) > NUM.ZERO)))) {
        if (stryMutAct_9fa48("9982")) {
          {}
        } else {
          stryCov_9fa48("9982");
          return stryMutAct_9fa48("9983") ? leftNumber + rightNumber : (stryCov_9fa48("9983"), leftNumber - rightNumber);
        }
      }
      return String(left).localeCompare(String(right));
    }
  }

  /**
   * Apply column projection for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object[]|null} columns
   * @param {Array<*>} params
   * @return {Object[]|null}
   * @private
   */
  projectLocalSystemTableObservationRows(rows, columns, params = stryMutAct_9fa48("9984") ? ["Stryker was here"] : (stryCov_9fa48("9984"), [])) {
    if (stryMutAct_9fa48("9985")) {
      {}
    } else {
      stryCov_9fa48("9985");
      if (stryMutAct_9fa48("9988") ? (!Array.isArray(columns) || columns.length === NUM.ZERO) && columns.some(column => column?.type === EXPR_TYPE.STAR) : stryMutAct_9fa48("9987") ? false : stryMutAct_9fa48("9986") ? true : (stryCov_9fa48("9986", "9987", "9988"), (stryMutAct_9fa48("9990") ? !Array.isArray(columns) && columns.length === NUM.ZERO : stryMutAct_9fa48("9989") ? false : (stryCov_9fa48("9989", "9990"), (stryMutAct_9fa48("9991") ? Array.isArray(columns) : (stryCov_9fa48("9991"), !Array.isArray(columns))) || (stryMutAct_9fa48("9993") ? columns.length !== NUM.ZERO : stryMutAct_9fa48("9992") ? false : (stryCov_9fa48("9992", "9993"), columns.length === NUM.ZERO)))) || (stryMutAct_9fa48("9994") ? columns.every(column => column?.type === EXPR_TYPE.STAR) : (stryCov_9fa48("9994"), columns.some(stryMutAct_9fa48("9995") ? () => undefined : (stryCov_9fa48("9995"), column => stryMutAct_9fa48("9998") ? column?.type !== EXPR_TYPE.STAR : stryMutAct_9fa48("9997") ? false : stryMutAct_9fa48("9996") ? true : (stryCov_9fa48("9996", "9997", "9998"), (stryMutAct_9fa48("9999") ? column.type : (stryCov_9fa48("9999"), column?.type)) === EXPR_TYPE.STAR))))))) {
        if (stryMutAct_9fa48("10000")) {
          {}
        } else {
          stryCov_9fa48("10000");
          return rows.map(stryMutAct_9fa48("10001") ? () => undefined : (stryCov_9fa48("10001"), row => stryMutAct_9fa48("10002") ? {} : (stryCov_9fa48("10002"), {
            ...row
          })));
        }
      }
      const projectedRows = stryMutAct_9fa48("10003") ? ["Stryker was here"] : (stryCov_9fa48("10003"), []);
      for (const row of rows) {
        if (stryMutAct_9fa48("10004")) {
          {}
        } else {
          stryCov_9fa48("10004");
          const projected = {};
          for (const column of columns) {
            if (stryMutAct_9fa48("10005")) {
              {}
            } else {
              stryCov_9fa48("10005");
              if (stryMutAct_9fa48("10008") ? column?.type !== EXPR_TYPE.COLUMN && column.expression?.type !== EXPR_TYPE.COLUMN_REF : stryMutAct_9fa48("10007") ? false : stryMutAct_9fa48("10006") ? true : (stryCov_9fa48("10006", "10007", "10008"), (stryMutAct_9fa48("10010") ? column?.type === EXPR_TYPE.COLUMN : stryMutAct_9fa48("10009") ? false : (stryCov_9fa48("10009", "10010"), (stryMutAct_9fa48("10011") ? column.type : (stryCov_9fa48("10011"), column?.type)) !== EXPR_TYPE.COLUMN)) || (stryMutAct_9fa48("10013") ? column.expression?.type === EXPR_TYPE.COLUMN_REF : stryMutAct_9fa48("10012") ? false : (stryCov_9fa48("10012", "10013"), (stryMutAct_9fa48("10014") ? column.expression.type : (stryCov_9fa48("10014"), column.expression?.type)) !== EXPR_TYPE.COLUMN_REF)))) {
                if (stryMutAct_9fa48("10015")) {
                  {}
                } else {
                  stryCov_9fa48("10015");
                  return null;
                }
              }
              const key = (stryMutAct_9fa48("10018") ? typeof column.alias === TYPEOF.STRING || column.alias.length > NUM.ZERO : stryMutAct_9fa48("10017") ? false : stryMutAct_9fa48("10016") ? true : (stryCov_9fa48("10016", "10017", "10018"), (stryMutAct_9fa48("10020") ? typeof column.alias !== TYPEOF.STRING : stryMutAct_9fa48("10019") ? true : (stryCov_9fa48("10019", "10020"), typeof column.alias === TYPEOF.STRING)) && (stryMutAct_9fa48("10023") ? column.alias.length <= NUM.ZERO : stryMutAct_9fa48("10022") ? column.alias.length >= NUM.ZERO : stryMutAct_9fa48("10021") ? true : (stryCov_9fa48("10021", "10022", "10023"), column.alias.length > NUM.ZERO)))) ? column.alias : column.expression.column;
              projected[key] = this.resolveLocalSystemTableObservationValue(column.expression, row, params);
            }
          }
          projectedRows.push(projected);
        }
      }
      return projectedRows;
    }
  }

  /**
   * Apply ORDER BY clauses for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object[]|null} orderBy
   * @param {Array<*>} params
   * @return {Object[]}
   * @private
   */
  sortLocalSystemTableObservationRows(rows, orderBy, params = stryMutAct_9fa48("10024") ? ["Stryker was here"] : (stryCov_9fa48("10024"), [])) {
    if (stryMutAct_9fa48("10025")) {
      {}
    } else {
      stryCov_9fa48("10025");
      if (stryMutAct_9fa48("10028") ? !Array.isArray(orderBy) && orderBy.length === NUM.ZERO : stryMutAct_9fa48("10027") ? false : stryMutAct_9fa48("10026") ? true : (stryCov_9fa48("10026", "10027", "10028"), (stryMutAct_9fa48("10029") ? Array.isArray(orderBy) : (stryCov_9fa48("10029"), !Array.isArray(orderBy))) || (stryMutAct_9fa48("10031") ? orderBy.length !== NUM.ZERO : stryMutAct_9fa48("10030") ? false : (stryCov_9fa48("10030", "10031"), orderBy.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("10032")) {
          {}
        } else {
          stryCov_9fa48("10032");
          return rows;
        }
      }
      return stryMutAct_9fa48("10033") ? [...rows] : (stryCov_9fa48("10033"), (stryMutAct_9fa48("10034") ? [] : (stryCov_9fa48("10034"), [...rows])).sort((leftRow, rightRow) => {
        if (stryMutAct_9fa48("10035")) {
          {}
        } else {
          stryCov_9fa48("10035");
          for (const ordering of orderBy) {
            if (stryMutAct_9fa48("10036")) {
              {}
            } else {
              stryCov_9fa48("10036");
              const leftValue = this.resolveLocalSystemTableObservationValue(ordering.expression, leftRow, params);
              const rightValue = this.resolveLocalSystemTableObservationValue(ordering.expression, rightRow, params);
              const comparison = this.compareLocalSystemTableObservationValues(leftValue, rightValue);
              if (stryMutAct_9fa48("10039") ? comparison === NUM.ZERO : stryMutAct_9fa48("10038") ? false : stryMutAct_9fa48("10037") ? true : (stryCov_9fa48("10037", "10038", "10039"), comparison !== NUM.ZERO)) {
                if (stryMutAct_9fa48("10040")) {
                  {}
                } else {
                  stryCov_9fa48("10040");
                  return (stryMutAct_9fa48("10043") ? String(ordering.direction || 'ASC').toUpperCase() !== 'DESC' : stryMutAct_9fa48("10042") ? false : stryMutAct_9fa48("10041") ? true : (stryCov_9fa48("10041", "10042", "10043"), (stryMutAct_9fa48("10044") ? String(ordering.direction || 'ASC').toLowerCase() : (stryCov_9fa48("10044"), String(stryMutAct_9fa48("10047") ? ordering.direction && 'ASC' : stryMutAct_9fa48("10046") ? false : stryMutAct_9fa48("10045") ? true : (stryCov_9fa48("10045", "10046", "10047"), ordering.direction || (stryMutAct_9fa48("10048") ? "" : (stryCov_9fa48("10048"), 'ASC')))).toUpperCase())) === (stryMutAct_9fa48("10049") ? "" : (stryCov_9fa48("10049"), 'DESC')))) ? stryMutAct_9fa48("10050") ? +comparison : (stryCov_9fa48("10050"), -comparison) : comparison;
                }
              }
            }
          }
          return NUM.ZERO;
        }
      }));
    }
  }

  /**
   * Apply LIMIT/OFFSET clauses for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object|null} limit
   * @return {Object[]}
   * @private
   */
  limitLocalSystemTableObservationRows(rows, limit) {
    if (stryMutAct_9fa48("10051")) {
      {}
    } else {
      stryCov_9fa48("10051");
      if (stryMutAct_9fa48("10054") ? !limit && typeof limit !== TYPEOF.OBJECT : stryMutAct_9fa48("10053") ? false : stryMutAct_9fa48("10052") ? true : (stryCov_9fa48("10052", "10053", "10054"), (stryMutAct_9fa48("10055") ? limit : (stryCov_9fa48("10055"), !limit)) || (stryMutAct_9fa48("10057") ? typeof limit === TYPEOF.OBJECT : stryMutAct_9fa48("10056") ? false : (stryCov_9fa48("10056", "10057"), typeof limit !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("10058")) {
          {}
        } else {
          stryCov_9fa48("10058");
          return rows;
        }
      }
      const count = Number(limit.count);
      const offset = Number(limit.offset);
      const normalizedOffset = (stryMutAct_9fa48("10061") ? Number.isFinite(offset) || offset > NUM.ZERO : stryMutAct_9fa48("10060") ? false : stryMutAct_9fa48("10059") ? true : (stryCov_9fa48("10059", "10060", "10061"), Number.isFinite(offset) && (stryMutAct_9fa48("10064") ? offset <= NUM.ZERO : stryMutAct_9fa48("10063") ? offset >= NUM.ZERO : stryMutAct_9fa48("10062") ? true : (stryCov_9fa48("10062", "10063", "10064"), offset > NUM.ZERO)))) ? Math.floor(offset) : NUM.ZERO;
      const normalizedCount = (stryMutAct_9fa48("10067") ? Number.isFinite(count) || count >= NUM.ZERO : stryMutAct_9fa48("10066") ? false : stryMutAct_9fa48("10065") ? true : (stryCov_9fa48("10065", "10066", "10067"), Number.isFinite(count) && (stryMutAct_9fa48("10070") ? count < NUM.ZERO : stryMutAct_9fa48("10069") ? count > NUM.ZERO : stryMutAct_9fa48("10068") ? true : (stryCov_9fa48("10068", "10069", "10070"), count >= NUM.ZERO)))) ? Math.floor(count) : null;
      if (stryMutAct_9fa48("10073") ? normalizedCount !== null : stryMutAct_9fa48("10072") ? false : stryMutAct_9fa48("10071") ? true : (stryCov_9fa48("10071", "10072", "10073"), normalizedCount === null)) {
        if (stryMutAct_9fa48("10074")) {
          {}
        } else {
          stryCov_9fa48("10074");
          return stryMutAct_9fa48("10075") ? rows : (stryCov_9fa48("10075"), rows.slice(normalizedOffset));
        }
      }
      return stryMutAct_9fa48("10076") ? rows : (stryCov_9fa48("10076"), rows.slice(normalizedOffset, stryMutAct_9fa48("10077") ? normalizedOffset - normalizedCount : (stryCov_9fa48("10077"), normalizedOffset + normalizedCount)));
    }
  }

  /**
   * Resolve best-effort partition ids for one local cache result.
   * @param {string} tableName
   * @param {Object[]} rows
   * @return {string[]}
   * @private
   */
  resolveLocalSystemTableObservationPartitions(tableName, rows) {
    if (stryMutAct_9fa48("10078")) {
      {}
    } else {
      stryCov_9fa48("10078");
      if (stryMutAct_9fa48("10081") ? tableName !== TABLES.PARTITIONS : stryMutAct_9fa48("10080") ? false : stryMutAct_9fa48("10079") ? true : (stryCov_9fa48("10079", "10080", "10081"), tableName === TABLES.PARTITIONS)) {
        if (stryMutAct_9fa48("10082")) {
          {}
        } else {
          stryCov_9fa48("10082");
          return stryMutAct_9fa48("10083") ? rows.map(row => row?.partition_id || row?.partitionId || null) : (stryCov_9fa48("10083"), rows.map(stryMutAct_9fa48("10084") ? () => undefined : (stryCov_9fa48("10084"), row => stryMutAct_9fa48("10087") ? (row?.partition_id || row?.partitionId) && null : stryMutAct_9fa48("10086") ? false : stryMutAct_9fa48("10085") ? true : (stryCov_9fa48("10085", "10086", "10087"), (stryMutAct_9fa48("10089") ? row?.partition_id && row?.partitionId : stryMutAct_9fa48("10088") ? false : (stryCov_9fa48("10088", "10089"), (stryMutAct_9fa48("10090") ? row.partition_id : (stryCov_9fa48("10090"), row?.partition_id)) || (stryMutAct_9fa48("10091") ? row.partitionId : (stryCov_9fa48("10091"), row?.partitionId)))) || null))).filter(stryMutAct_9fa48("10092") ? () => undefined : (stryCov_9fa48("10092"), partitionId => stryMutAct_9fa48("10095") ? typeof partitionId === TYPEOF.STRING || partitionId.length > NUM.ZERO : stryMutAct_9fa48("10094") ? false : stryMutAct_9fa48("10093") ? true : (stryCov_9fa48("10093", "10094", "10095"), (stryMutAct_9fa48("10097") ? typeof partitionId !== TYPEOF.STRING : stryMutAct_9fa48("10096") ? true : (stryCov_9fa48("10096", "10097"), typeof partitionId === TYPEOF.STRING)) && (stryMutAct_9fa48("10100") ? partitionId.length <= NUM.ZERO : stryMutAct_9fa48("10099") ? partitionId.length >= NUM.ZERO : stryMutAct_9fa48("10098") ? true : (stryCov_9fa48("10098", "10099", "10100"), partitionId.length > NUM.ZERO))))));
        }
      }
      if (stryMutAct_9fa48("10103") ? tableName === TABLES.SERVICES && tableName === TABLES.REPLICA_OPERATIONS : stryMutAct_9fa48("10102") ? false : stryMutAct_9fa48("10101") ? true : (stryCov_9fa48("10101", "10102", "10103"), (stryMutAct_9fa48("10105") ? tableName !== TABLES.SERVICES : stryMutAct_9fa48("10104") ? false : (stryCov_9fa48("10104", "10105"), tableName === TABLES.SERVICES)) || (stryMutAct_9fa48("10107") ? tableName !== TABLES.REPLICA_OPERATIONS : stryMutAct_9fa48("10106") ? false : (stryCov_9fa48("10106", "10107"), tableName === TABLES.REPLICA_OPERATIONS)))) {
        if (stryMutAct_9fa48("10108")) {
          {}
        } else {
          stryCov_9fa48("10108");
          return stryMutAct_9fa48("10109") ? [] : (stryCov_9fa48("10109"), [...new Set(stryMutAct_9fa48("10110") ? rows.map(row => row?.partition_id || row?.partitionId || null) : (stryCov_9fa48("10110"), rows.map(stryMutAct_9fa48("10111") ? () => undefined : (stryCov_9fa48("10111"), row => stryMutAct_9fa48("10114") ? (row?.partition_id || row?.partitionId) && null : stryMutAct_9fa48("10113") ? false : stryMutAct_9fa48("10112") ? true : (stryCov_9fa48("10112", "10113", "10114"), (stryMutAct_9fa48("10116") ? row?.partition_id && row?.partitionId : stryMutAct_9fa48("10115") ? false : (stryCov_9fa48("10115", "10116"), (stryMutAct_9fa48("10117") ? row.partition_id : (stryCov_9fa48("10117"), row?.partition_id)) || (stryMutAct_9fa48("10118") ? row.partitionId : (stryCov_9fa48("10118"), row?.partitionId)))) || null))).filter(stryMutAct_9fa48("10119") ? () => undefined : (stryCov_9fa48("10119"), partitionId => stryMutAct_9fa48("10122") ? typeof partitionId === TYPEOF.STRING || partitionId.length > NUM.ZERO : stryMutAct_9fa48("10121") ? false : stryMutAct_9fa48("10120") ? true : (stryCov_9fa48("10120", "10121", "10122"), (stryMutAct_9fa48("10124") ? typeof partitionId !== TYPEOF.STRING : stryMutAct_9fa48("10123") ? true : (stryCov_9fa48("10123", "10124"), typeof partitionId === TYPEOF.STRING)) && (stryMutAct_9fa48("10127") ? partitionId.length <= NUM.ZERO : stryMutAct_9fa48("10126") ? partitionId.length >= NUM.ZERO : stryMutAct_9fa48("10125") ? true : (stryCov_9fa48("10125", "10126", "10127"), partitionId.length > NUM.ZERO)))))))]);
        }
      }
      if (stryMutAct_9fa48("10130") ? typeof this.systemTableCache.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("10129") ? false : stryMutAct_9fa48("10128") ? true : (stryCov_9fa48("10128", "10129", "10130"), typeof this.systemTableCache.filter !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("10131")) {
          {}
        } else {
          stryCov_9fa48("10131");
          return ADMIN_CACHE_DUMP.EMPTY;
        }
      }
      return stryMutAct_9fa48("10133") ? this.systemTableCache.map(row => row?.partition_id || row?.partitionId || null).filter(partitionId => typeof partitionId === TYPEOF.STRING && partitionId.length > NUM.ZERO) : stryMutAct_9fa48("10132") ? this.systemTableCache.filter(TABLES.PARTITIONS, row => {
        const rowTableName = normalizeIdentifier(row?.table_name || row?.tableName || null);
        const rowTableId = normalizeIdentifier(row?.table_id || row?.tableId || null);
        return rowTableName === tableName || rowTableId === tableName;
      }).map(row => row?.partition_id || row?.partitionId || null) : (stryCov_9fa48("10132", "10133"), this.systemTableCache.filter(TABLES.PARTITIONS, row => {
        if (stryMutAct_9fa48("10134")) {
          {}
        } else {
          stryCov_9fa48("10134");
          const rowTableName = normalizeIdentifier(stryMutAct_9fa48("10137") ? (row?.table_name || row?.tableName) && null : stryMutAct_9fa48("10136") ? false : stryMutAct_9fa48("10135") ? true : (stryCov_9fa48("10135", "10136", "10137"), (stryMutAct_9fa48("10139") ? row?.table_name && row?.tableName : stryMutAct_9fa48("10138") ? false : (stryCov_9fa48("10138", "10139"), (stryMutAct_9fa48("10140") ? row.table_name : (stryCov_9fa48("10140"), row?.table_name)) || (stryMutAct_9fa48("10141") ? row.tableName : (stryCov_9fa48("10141"), row?.tableName)))) || null));
          const rowTableId = normalizeIdentifier(stryMutAct_9fa48("10144") ? (row?.table_id || row?.tableId) && null : stryMutAct_9fa48("10143") ? false : stryMutAct_9fa48("10142") ? true : (stryCov_9fa48("10142", "10143", "10144"), (stryMutAct_9fa48("10146") ? row?.table_id && row?.tableId : stryMutAct_9fa48("10145") ? false : (stryCov_9fa48("10145", "10146"), (stryMutAct_9fa48("10147") ? row.table_id : (stryCov_9fa48("10147"), row?.table_id)) || (stryMutAct_9fa48("10148") ? row.tableId : (stryCov_9fa48("10148"), row?.tableId)))) || null));
          return stryMutAct_9fa48("10151") ? rowTableName === tableName && rowTableId === tableName : stryMutAct_9fa48("10150") ? false : stryMutAct_9fa48("10149") ? true : (stryCov_9fa48("10149", "10150", "10151"), (stryMutAct_9fa48("10153") ? rowTableName !== tableName : stryMutAct_9fa48("10152") ? false : (stryCov_9fa48("10152", "10153"), rowTableName === tableName)) || (stryMutAct_9fa48("10155") ? rowTableId !== tableName : stryMutAct_9fa48("10154") ? false : (stryCov_9fa48("10154", "10155"), rowTableId === tableName)));
        }
      }).map(stryMutAct_9fa48("10156") ? () => undefined : (stryCov_9fa48("10156"), row => stryMutAct_9fa48("10159") ? (row?.partition_id || row?.partitionId) && null : stryMutAct_9fa48("10158") ? false : stryMutAct_9fa48("10157") ? true : (stryCov_9fa48("10157", "10158", "10159"), (stryMutAct_9fa48("10161") ? row?.partition_id && row?.partitionId : stryMutAct_9fa48("10160") ? false : (stryCov_9fa48("10160", "10161"), (stryMutAct_9fa48("10162") ? row.partition_id : (stryCov_9fa48("10162"), row?.partition_id)) || (stryMutAct_9fa48("10163") ? row.partitionId : (stryCov_9fa48("10163"), row?.partitionId)))) || null))).filter(stryMutAct_9fa48("10164") ? () => undefined : (stryCov_9fa48("10164"), partitionId => stryMutAct_9fa48("10167") ? typeof partitionId === TYPEOF.STRING || partitionId.length > NUM.ZERO : stryMutAct_9fa48("10166") ? false : stryMutAct_9fa48("10165") ? true : (stryCov_9fa48("10165", "10166", "10167"), (stryMutAct_9fa48("10169") ? typeof partitionId !== TYPEOF.STRING : stryMutAct_9fa48("10168") ? true : (stryCov_9fa48("10168", "10169"), typeof partitionId === TYPEOF.STRING)) && (stryMutAct_9fa48("10172") ? partitionId.length <= NUM.ZERO : stryMutAct_9fa48("10171") ? partitionId.length >= NUM.ZERO : stryMutAct_9fa48("10170") ? true : (stryCov_9fa48("10170", "10171", "10172"), partitionId.length > NUM.ZERO))))));
    }
  }

  /**
   * Match one SQL LIKE pattern for local cache observation queries.
   * @param {*} value
   * @param {*} pattern
   * @return {boolean}
   * @private
   */
  matchesLocalSystemTableObservationLike(value, pattern) {
    if (stryMutAct_9fa48("10173")) {
      {}
    } else {
      stryCov_9fa48("10173");
      const normalizedValue = String(stryMutAct_9fa48("10174") ? value && EMPTY_STRING : (stryCov_9fa48("10174"), value ?? EMPTY_STRING));
      const normalizedPattern = String(stryMutAct_9fa48("10175") ? pattern && EMPTY_STRING : (stryCov_9fa48("10175"), pattern ?? EMPTY_STRING)).replace(stryMutAct_9fa48("10176") ? /[^.*+?^${}()|[\]\\]/g : (stryCov_9fa48("10176"), /[.*+?^${}()|[\]\\]/g), stryMutAct_9fa48("10177") ? "" : (stryCov_9fa48("10177"), '\\$&')).replace(/%/g, stryMutAct_9fa48("10178") ? "" : (stryCov_9fa48("10178"), '.*')).replace(/_/g, stryMutAct_9fa48("10179") ? "" : (stryCov_9fa48("10179"), '.'));
      return new RegExp(stryMutAct_9fa48("10180") ? `` : (stryCov_9fa48("10180"), `^${normalizedPattern}$`), stryMutAct_9fa48("10181") ? "" : (stryCov_9fa48("10181"), 'i')).test(normalizedValue);
    }
  }

  /**
   * Execute canonical query operation payload.
   * @param {Object} payload
   * @param {Object} executionContext
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalQueryEnvelope(payload, executionContext = {}) {
    if (stryMutAct_9fa48("10182")) {
      {}
    } else {
      stryCov_9fa48("10182");
      const queryId = stryMutAct_9fa48("10185") ? payload?.queryId && null : stryMutAct_9fa48("10184") ? false : stryMutAct_9fa48("10183") ? true : (stryCov_9fa48("10183", "10184", "10185"), (stryMutAct_9fa48("10186") ? payload.queryId : (stryCov_9fa48("10186"), payload?.queryId)) || null);
      const sql = stryMutAct_9fa48("10187") ? payload.sql : (stryCov_9fa48("10187"), payload?.sql);
      const params = stryMutAct_9fa48("10190") ? payload?.params && [] : stryMutAct_9fa48("10189") ? false : stryMutAct_9fa48("10188") ? true : (stryCov_9fa48("10188", "10189", "10190"), (stryMutAct_9fa48("10191") ? payload.params : (stryCov_9fa48("10191"), payload?.params)) || (stryMutAct_9fa48("10192") ? ["Stryker was here"] : (stryCov_9fa48("10192"), [])));
      const timeoutMs = this.resolveExecutionQueryTimeoutMs(stryMutAct_9fa48("10193") ? payload.timeoutMs : (stryCov_9fa48("10193"), payload?.timeoutMs), executionContext);
      const loadLaneExecution = this.isLoadLaneExecution(executionContext);
      if (stryMutAct_9fa48("10196") ? false : stryMutAct_9fa48("10195") ? true : stryMutAct_9fa48("10194") ? queryId : (stryCov_9fa48("10194", "10195", "10196"), !queryId)) {
        if (stryMutAct_9fa48("10197")) {
          {}
        } else {
          stryCov_9fa48("10197");
          throw createAdminOperationError(ErrorCode.MALFORMED_JSON, ADMIN_ERROR_MESSAGE.MISSING_QUERY_ID, ADMIN_ERROR_HINT.MISSING_QUERY_ID);
        }
      }
      if (stryMutAct_9fa48("10200") ? !sql && typeof sql !== TYPEOF.STRING : stryMutAct_9fa48("10199") ? false : stryMutAct_9fa48("10198") ? true : (stryCov_9fa48("10198", "10199", "10200"), (stryMutAct_9fa48("10201") ? sql : (stryCov_9fa48("10201"), !sql)) || (stryMutAct_9fa48("10203") ? typeof sql === TYPEOF.STRING : stryMutAct_9fa48("10202") ? false : (stryCov_9fa48("10202", "10203"), typeof sql !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("10204")) {
          {}
        } else {
          stryCov_9fa48("10204");
          throw createAdminOperationError(ErrorCode.SYNTAX_ERROR, ADMIN_ERROR_MESSAGE.MISSING_SQL, ADMIN_ERROR_HINT.MISSING_SQL);
        }
      }
      await this.assertLoadLaneQueryAdmitted(executionContext);
      if (stryMutAct_9fa48("10206") ? false : stryMutAct_9fa48("10205") ? true : (stryCov_9fa48("10205", "10206"), this.isPreflightCriticalPathSnapshotQuery(sql))) {
        if (stryMutAct_9fa48("10207")) {
          {}
        } else {
          stryCov_9fa48("10207");
          return this.buildPreflightCriticalPathSnapshotQueryResult();
        }
      }
      const controlSnapshotQuery = this.parseControlSnapshotQuery(sql);
      if (stryMutAct_9fa48("10209") ? false : stryMutAct_9fa48("10208") ? true : (stryCov_9fa48("10208", "10209"), controlSnapshotQuery.isQuery)) {
        if (stryMutAct_9fa48("10210")) {
          {}
        } else {
          stryCov_9fa48("10210");
          const observationPolicy = this.resolveLocalObservationExecutionPolicy(executionContext, stryMutAct_9fa48("10211") ? {} : (stryCov_9fa48("10211"), {
            forceAuthoritativeRepair: controlSnapshotQuery.forceAuthoritativeRepair
          }));
          return this.buildControlSnapshotQueryResult(stryMutAct_9fa48("10212") ? {} : (stryCov_9fa48("10212"), {
            forceAuthoritativeRepair: controlSnapshotQuery.forceAuthoritativeRepair,
            allowAuthoritativeRepair: observationPolicy.allowAuthoritativeRepair,
            allowAuthoritativeReadinessRefresh: observationPolicy.allowAuthoritativeReadinessRefresh,
            allowStaleReadinessOnCacheChange: observationPolicy.allowStaleReadinessOnCacheChange
          }));
        }
      }
      const serviceDiscoveryQuery = parseServiceDiscoverySqlQuery(sql);
      if (stryMutAct_9fa48("10214") ? false : stryMutAct_9fa48("10213") ? true : (stryCov_9fa48("10213", "10214"), serviceDiscoveryQuery.isQuery)) {
        if (stryMutAct_9fa48("10215")) {
          {}
        } else {
          stryCov_9fa48("10215");
          const observationPolicy = this.resolveLocalObservationExecutionPolicy(executionContext);
          return this.serviceDiscovery.buildServiceDiscoveryQueryResult(stryMutAct_9fa48("10216") ? {} : (stryCov_9fa48("10216"), {
            tableName: serviceDiscoveryQuery.tableName,
            tableId: serviceDiscoveryQuery.tableId,
            allowAuthoritativeRepair: observationPolicy.allowAuthoritativeRepair
          }));
        }
      }
      const localSystemTableObservation = this.tryExecuteLocalSystemTableObservationQuery(sql, params);
      if (stryMutAct_9fa48("10218") ? false : stryMutAct_9fa48("10217") ? true : (stryCov_9fa48("10217", "10218"), localSystemTableObservation)) {
        if (stryMutAct_9fa48("10219")) {
          {}
        } else {
          stryCov_9fa48("10219");
          return localSystemTableObservation;
        }
      }
      await this.assertLoadLaneTableQueryAdmitted(sql, executionContext);
      const routed = guardedAdaptAdminAction(ADMIN_META_ACTION.EXECUTE_QUERY, stryMutAct_9fa48("10220") ? {} : (stryCov_9fa48("10220"), {
        sql,
        queryParams: params
      }), this.systemTableCache, this.resolveMutationGuardMode());
      if (stryMutAct_9fa48("10223") ? false : stryMutAct_9fa48("10222") ? true : stryMutAct_9fa48("10221") ? routed.success : (stryCov_9fa48("10221", "10222", "10223"), !routed.success)) {
        if (stryMutAct_9fa48("10224")) {
          {}
        } else {
          stryCov_9fa48("10224");
          throw createAdminOperationError(stryMutAct_9fa48("10227") ? routed.code && ErrorCode.INTERNAL_ERROR : stryMutAct_9fa48("10226") ? false : stryMutAct_9fa48("10225") ? true : (stryCov_9fa48("10225", "10226", "10227"), routed.code || ErrorCode.INTERNAL_ERROR), stryMutAct_9fa48("10230") ? routed.error && ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE : stryMutAct_9fa48("10229") ? false : stryMutAct_9fa48("10228") ? true : (stryCov_9fa48("10228", "10229", "10230"), routed.error || ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE));
        }
      }
      let result;
      try {
        if (stryMutAct_9fa48("10231")) {
          {}
        } else {
          stryCov_9fa48("10231");
          result = await this.executeQueryWithTimeout(routed.sql, stryMutAct_9fa48("10234") ? routed.params && [] : stryMutAct_9fa48("10233") ? false : stryMutAct_9fa48("10232") ? true : (stryCov_9fa48("10232", "10233", "10234"), routed.params || (stryMutAct_9fa48("10235") ? ["Stryker was here"] : (stryCov_9fa48("10235"), []))), queryId, timeoutMs);
        }
      } catch (error) {
        if (stryMutAct_9fa48("10236")) {
          {}
        } else {
          stryCov_9fa48("10236");
          if (stryMutAct_9fa48("10239") ? loadLaneExecution || this.isRetryableLoadLaneExecutionFailure(error) : stryMutAct_9fa48("10238") ? false : stryMutAct_9fa48("10237") ? true : (stryCov_9fa48("10237", "10238", "10239"), loadLaneExecution && this.isRetryableLoadLaneExecutionFailure(error))) {
            if (stryMutAct_9fa48("10240")) {
              {}
            } else {
              stryCov_9fa48("10240");
              throw createRetryableAdminOperationError(this.getErrorCode(error), String(stryMutAct_9fa48("10243") ? error?.message && ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE : stryMutAct_9fa48("10242") ? false : stryMutAct_9fa48("10241") ? true : (stryCov_9fa48("10241", "10242", "10243"), (stryMutAct_9fa48("10244") ? error.message : (stryCov_9fa48("10244"), error?.message)) || ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE)), stryMutAct_9fa48("10245") ? {} : (stryCov_9fa48("10245"), {
                retryAfterMs: this.resolveLoadLaneRetryAfterMs(error)
              }));
            }
          }
          throw error;
        }
      }
      if (stryMutAct_9fa48("10248") ? loadLaneExecution && result?.success === false || this.isRetryableLoadLaneExecutionFailure(result) : stryMutAct_9fa48("10247") ? false : stryMutAct_9fa48("10246") ? true : (stryCov_9fa48("10246", "10247", "10248"), (stryMutAct_9fa48("10250") ? loadLaneExecution || result?.success === false : stryMutAct_9fa48("10249") ? true : (stryCov_9fa48("10249", "10250"), loadLaneExecution && (stryMutAct_9fa48("10252") ? result?.success !== false : stryMutAct_9fa48("10251") ? true : (stryCov_9fa48("10251", "10252"), (stryMutAct_9fa48("10253") ? result.success : (stryCov_9fa48("10253"), result?.success)) === (stryMutAct_9fa48("10254") ? true : (stryCov_9fa48("10254"), false)))))) && this.isRetryableLoadLaneExecutionFailure(result))) {
        if (stryMutAct_9fa48("10255")) {
          {}
        } else {
          stryCov_9fa48("10255");
          result = stryMutAct_9fa48("10256") ? {} : (stryCov_9fa48("10256"), {
            ...result,
            deferRetry: stryMutAct_9fa48("10257") ? false : (stryCov_9fa48("10257"), true),
            retryAfterMs: this.resolveLoadLaneRetryAfterMs(result)
          });
        }
      }
      if (stryMutAct_9fa48("10259") ? false : stryMutAct_9fa48("10258") ? true : (stryCov_9fa48("10258", "10259"), routed.warning)) {
        if (stryMutAct_9fa48("10260")) {
          {}
        } else {
          stryCov_9fa48("10260");
          result.warning = routed.warning;
        }
      }
      return result;
    }
  }

  /**
   * Execute canonical partition-callback payload.
   * @param {Object} payload
   * @param {Object} _executionContext
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalPartitionCallbackEnvelope(payload, _executionContext = {}) {
    if (stryMutAct_9fa48("10261")) {
      {}
    } else {
      stryCov_9fa48("10261");
      const queryId = stryMutAct_9fa48("10264") ? payload?.queryId && null : stryMutAct_9fa48("10263") ? false : stryMutAct_9fa48("10262") ? true : (stryCov_9fa48("10262", "10263", "10264"), (stryMutAct_9fa48("10265") ? payload.queryId : (stryCov_9fa48("10265"), payload?.queryId)) || null);
      const statement = stryMutAct_9fa48("10266") ? payload.statement : (stryCov_9fa48("10266"), payload?.statement);
      const parameters = stryMutAct_9fa48("10269") ? payload?.parameters && [] : stryMutAct_9fa48("10268") ? false : stryMutAct_9fa48("10267") ? true : (stryCov_9fa48("10267", "10268", "10269"), (stryMutAct_9fa48("10270") ? payload.parameters : (stryCov_9fa48("10270"), payload?.parameters)) || (stryMutAct_9fa48("10271") ? ["Stryker was here"] : (stryCov_9fa48("10271"), [])));
      const callbackModuleRef = stryMutAct_9fa48("10272") ? payload.callbackModuleRef : (stryCov_9fa48("10272"), payload?.callbackModuleRef);
      const callbackExport = stryMutAct_9fa48("10273") ? payload.callbackExport : (stryCov_9fa48("10273"), payload?.callbackExport);
      const runtimeKind = stryMutAct_9fa48("10274") ? payload.runtimeKind : (stryCov_9fa48("10274"), payload?.runtimeKind);
      const timeoutMs = resolveRequestedQueryTimeoutMs(stryMutAct_9fa48("10275") ? payload.timeoutMs : (stryCov_9fa48("10275"), payload?.timeoutMs));
      if (stryMutAct_9fa48("10278") ? false : stryMutAct_9fa48("10277") ? true : stryMutAct_9fa48("10276") ? queryId : (stryCov_9fa48("10276", "10277", "10278"), !queryId)) {
        if (stryMutAct_9fa48("10279")) {
          {}
        } else {
          stryCov_9fa48("10279");
          throw createAdminOperationError(ErrorCode.MALFORMED_JSON, ADMIN_ERROR_MESSAGE.MISSING_QUERY_ID, ADMIN_ERROR_HINT.MISSING_QUERY_ID);
        }
      }
      if (stryMutAct_9fa48("10282") ? !statement && typeof statement !== TYPEOF.STRING : stryMutAct_9fa48("10281") ? false : stryMutAct_9fa48("10280") ? true : (stryCov_9fa48("10280", "10281", "10282"), (stryMutAct_9fa48("10283") ? statement : (stryCov_9fa48("10283"), !statement)) || (stryMutAct_9fa48("10285") ? typeof statement === TYPEOF.STRING : stryMutAct_9fa48("10284") ? false : (stryCov_9fa48("10284", "10285"), typeof statement !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("10286")) {
          {}
        } else {
          stryCov_9fa48("10286");
          throw createAdminOperationError(ErrorCode.SYNTAX_ERROR, ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_STATEMENT, ADMIN_ERROR_HINT.MISSING_CALLBACK_STATEMENT);
        }
      }
      if (stryMutAct_9fa48("10289") ? !callbackModuleRef && typeof callbackModuleRef !== TYPEOF.STRING : stryMutAct_9fa48("10288") ? false : stryMutAct_9fa48("10287") ? true : (stryCov_9fa48("10287", "10288", "10289"), (stryMutAct_9fa48("10290") ? callbackModuleRef : (stryCov_9fa48("10290"), !callbackModuleRef)) || (stryMutAct_9fa48("10292") ? typeof callbackModuleRef === TYPEOF.STRING : stryMutAct_9fa48("10291") ? false : (stryCov_9fa48("10291", "10292"), typeof callbackModuleRef !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("10293")) {
          {}
        } else {
          stryCov_9fa48("10293");
          throw createAdminOperationError(ErrorCode.MALFORMED_JSON, ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_MODULE_REF, ADMIN_ERROR_HINT.MISSING_CALLBACK_MODULE_REF);
        }
      }
      if (stryMutAct_9fa48("10296") ? !callbackExport && typeof callbackExport !== TYPEOF.STRING : stryMutAct_9fa48("10295") ? false : stryMutAct_9fa48("10294") ? true : (stryCov_9fa48("10294", "10295", "10296"), (stryMutAct_9fa48("10297") ? callbackExport : (stryCov_9fa48("10297"), !callbackExport)) || (stryMutAct_9fa48("10299") ? typeof callbackExport === TYPEOF.STRING : stryMutAct_9fa48("10298") ? false : (stryCov_9fa48("10298", "10299"), typeof callbackExport !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("10300")) {
          {}
        } else {
          stryCov_9fa48("10300");
          throw createAdminOperationError(ErrorCode.MALFORMED_JSON, ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_EXPORT, ADMIN_ERROR_HINT.MISSING_CALLBACK_EXPORT);
        }
      }
      if (stryMutAct_9fa48("10303") ? !runtimeKind && typeof runtimeKind !== TYPEOF.STRING : stryMutAct_9fa48("10302") ? false : stryMutAct_9fa48("10301") ? true : (stryCov_9fa48("10301", "10302", "10303"), (stryMutAct_9fa48("10304") ? runtimeKind : (stryCov_9fa48("10304"), !runtimeKind)) || (stryMutAct_9fa48("10306") ? typeof runtimeKind === TYPEOF.STRING : stryMutAct_9fa48("10305") ? false : (stryCov_9fa48("10305", "10306"), typeof runtimeKind !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("10307")) {
          {}
        } else {
          stryCov_9fa48("10307");
          throw createAdminOperationError(ErrorCode.MALFORMED_JSON, ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_RUNTIME_KIND, ADMIN_ERROR_HINT.MISSING_CALLBACK_RUNTIME_KIND);
        }
      }
      return this.executeSqlRequestWithTimeout(createSqlRequest(stryMutAct_9fa48("10308") ? {} : (stryCov_9fa48("10308"), {
        statement,
        parameters,
        sessionId: queryId,
        executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
        callbackModuleRef,
        callbackExport,
        runtimeKind
      })), (stryMutAct_9fa48("10311") ? timeoutMs !== null : stryMutAct_9fa48("10310") ? false : stryMutAct_9fa48("10309") ? true : (stryCov_9fa48("10309", "10310", "10311"), timeoutMs === null)) ? undefined : timeoutMs);
    }
  }

  /**
   * Execute canonical cache-dump operation payload.
   * @return {Object}
   * @private
   */
  executeLocalCacheDumpEnvelope() {
    if (stryMutAct_9fa48("10312")) {
      {}
    } else {
      stryCov_9fa48("10312");
      const routed = guardedAdaptAdminAction(ADMIN_META_ACTION.GET_CACHE_DUMP, {}, this.systemTableCache, this.resolveMutationGuardMode());
      if (stryMutAct_9fa48("10315") ? false : stryMutAct_9fa48("10314") ? true : stryMutAct_9fa48("10313") ? routed.success : (stryCov_9fa48("10313", "10314", "10315"), !routed.success)) {
        if (stryMutAct_9fa48("10316")) {
          {}
        } else {
          stryCov_9fa48("10316");
          throw createAdminOperationError(stryMutAct_9fa48("10319") ? routed.code && ErrorCode.INTERNAL_ERROR : stryMutAct_9fa48("10318") ? false : stryMutAct_9fa48("10317") ? true : (stryCov_9fa48("10317", "10318", "10319"), routed.code || ErrorCode.INTERNAL_ERROR), stryMutAct_9fa48("10322") ? routed.error && ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE : stryMutAct_9fa48("10321") ? false : stryMutAct_9fa48("10320") ? true : (stryCov_9fa48("10320", "10321", "10322"), routed.error || ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE));
        }
      }
      return this.buildValidatedCacheDump(routed.tables);
    }
  }

  /**
   * Handle incoming message from client.
   * @param {Object} clientInfo - Client information.
   * @param {Buffer|string} data - Message data.
   * @private
   */
  handleMessage(clientInfo, data) {
    if (stryMutAct_9fa48("10323")) {
      {}
    } else {
      stryCov_9fa48("10323");
      let message;
      try {
        if (stryMutAct_9fa48("10324")) {
          {}
        } else {
          stryCov_9fa48("10324");
          const messageStr = data.toString();
          message = JSON.parse(messageStr);
        }
      } catch (_error) {
        if (stryMutAct_9fa48("10325")) {
          {}
        } else {
          stryCov_9fa48("10325");
          this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON, ADMIN_ERROR_MESSAGE.INVALID_JSON, ADMIN_ERROR_HINT.INVALID_JSON);
          return;
        }
      }
      if (stryMutAct_9fa48("10328") ? !message && typeof message.type !== TYPEOF.STRING : stryMutAct_9fa48("10327") ? false : stryMutAct_9fa48("10326") ? true : (stryCov_9fa48("10326", "10327", "10328"), (stryMutAct_9fa48("10329") ? message : (stryCov_9fa48("10329"), !message)) || (stryMutAct_9fa48("10331") ? typeof message.type === TYPEOF.STRING : stryMutAct_9fa48("10330") ? false : (stryCov_9fa48("10330", "10331"), typeof message.type !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("10332")) {
          {}
        } else {
          stryCov_9fa48("10332");
          this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON, ADMIN_ERROR_MESSAGE.MISSING_TYPE, ADMIN_ERROR_HINT.MISSING_TYPE);
          return;
        }
      }
      this.logger.debug(ADMIN_LOG_MSG.RECEIVED_MESSAGE, stryMutAct_9fa48("10333") ? {} : (stryCov_9fa48("10333"), {
        clientId: clientInfo.id,
        type: message.type
      }));
      switch (message.type) {
        case MessageType.QUERY:
          if (stryMutAct_9fa48("10334")) {} else {
            stryCov_9fa48("10334");
            this.handleDispatchableAdminMessage(clientInfo, message);
            break;
          }
        case MessageType.PARTITION_CALLBACK:
          if (stryMutAct_9fa48("10335")) {} else {
            stryCov_9fa48("10335");
            this.handleDispatchableAdminMessage(clientInfo, message);
            break;
          }
        case MessageType.REFRESH:
          if (stryMutAct_9fa48("10336")) {} else {
            stryCov_9fa48("10336");
            this.handleDispatchableAdminMessage(clientInfo, message);
            break;
          }
        case MessageType.LIVE_QUERY_SUBSCRIBE:
          if (stryMutAct_9fa48("10337")) {} else {
            stryCov_9fa48("10337");
            this.handleLiveQuerySubscribe(clientInfo, message);
            break;
          }
        case MessageType.LIVE_QUERY_UNSUBSCRIBE:
          if (stryMutAct_9fa48("10338")) {} else {
            stryCov_9fa48("10338");
            this.handleLiveQueryUnsubscribe(clientInfo, message);
            break;
          }
        default:
          if (stryMutAct_9fa48("10339")) {} else {
            stryCov_9fa48("10339");
            // Ignore unknown message types (Requirement 32.38)
            this.logger.debug(ADMIN_LOG_MSG.UNKNOWN_MESSAGE, stryMutAct_9fa48("10340") ? {} : (stryCov_9fa48("10340"), {
              clientId: clientInfo.id,
              type: message.type
            }));
            break;
          }
      }
    }
  }

  /**
   * Handle live query subscribe request.
   * Parses the LIVE SELECT SQL, registers with the server-side
   * LiveQueryManager, and bridges CDC events to the client socket.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Subscribe message.
   * @private
   */
  async handleLiveQuerySubscribe(clientInfo, message) {
    if (stryMutAct_9fa48("10341")) {
      {}
    } else {
      stryCov_9fa48("10341");
      const subscriptionId = message.subscriptionId;
      const sql = message.sql;
      if (stryMutAct_9fa48("10344") ? false : stryMutAct_9fa48("10343") ? true : stryMutAct_9fa48("10342") ? subscriptionId : (stryCov_9fa48("10342", "10343", "10344"), !subscriptionId)) {
        if (stryMutAct_9fa48("10345")) {
          {}
        } else {
          stryCov_9fa48("10345");
          this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON, ADMIN_ERROR_MESSAGE.LIVE_QUERY_MISSING_SUBSCRIPTION_ID, ADMIN_ERROR_HINT.LIVE_QUERY_MISSING_SUBSCRIPTION_ID);
          return;
        }
      }
      if (stryMutAct_9fa48("10348") ? !sql && typeof sql !== TYPEOF.STRING : stryMutAct_9fa48("10347") ? false : stryMutAct_9fa48("10346") ? true : (stryCov_9fa48("10346", "10347", "10348"), (stryMutAct_9fa48("10349") ? sql : (stryCov_9fa48("10349"), !sql)) || (stryMutAct_9fa48("10351") ? typeof sql === TYPEOF.STRING : stryMutAct_9fa48("10350") ? false : (stryCov_9fa48("10350", "10351"), typeof sql !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("10352")) {
          {}
        } else {
          stryCov_9fa48("10352");
          this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON, ADMIN_ERROR_MESSAGE.LIVE_QUERY_MISSING_SQL, ADMIN_ERROR_HINT.LIVE_QUERY_MISSING_SQL);
          return;
        }
      }
      if (stryMutAct_9fa48("10355") ? false : stryMutAct_9fa48("10354") ? true : stryMutAct_9fa48("10353") ? this.liveQueryManager : (stryCov_9fa48("10353", "10354", "10355"), !this.liveQueryManager)) {
        if (stryMutAct_9fa48("10356")) {
          {}
        } else {
          stryCov_9fa48("10356");
          this.sendError(clientInfo, null, ErrorCode.INTERNAL_ERROR, ADMIN_ERROR_MESSAGE.LIVE_QUERY_MANAGER_UNAVAILABLE);
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("10357")) {
          {}
        } else {
          stryCov_9fa48("10357");
          const parsed = parseLiveSelect(sql);
          const selectSql = parsed.isLive ? parsed.sql : sql;
          const parser = new SQLParser(selectSql);
          const ast = parser.parse();
          const registrationResult = stryMutAct_9fa48("10358") ? {} : (stryCov_9fa48("10358"), {
            partitions: stryMutAct_9fa48("10359") ? ["Stryker was here"] : (stryCov_9fa48("10359"), [])
          });
          const liveClient = stryMutAct_9fa48("10360") ? {} : (stryCov_9fa48("10360"), {
            id: clientInfo.id,
            send: data => {
              if (stryMutAct_9fa48("10361")) {
                {}
              } else {
                stryCov_9fa48("10361");
                const payload = (stryMutAct_9fa48("10364") ? typeof data !== TYPEOF.STRING : stryMutAct_9fa48("10363") ? false : stryMutAct_9fa48("10362") ? true : (stryCov_9fa48("10362", "10363", "10364"), typeof data === TYPEOF.STRING)) ? JSON.parse(data) : data;
                const innerType = payload.type;
                this.sendToClient(clientInfo, stryMutAct_9fa48("10365") ? {} : (stryCov_9fa48("10365"), {
                  type: MessageType.LIVE_QUERY_EVENT,
                  subscriptionId,
                  eventType: innerType,
                  data: stryMutAct_9fa48("10368") ? (payload.row || payload.new || payload.rows) && null : stryMutAct_9fa48("10367") ? false : stryMutAct_9fa48("10366") ? true : (stryCov_9fa48("10366", "10367", "10368"), (stryMutAct_9fa48("10370") ? (payload.row || payload.new) && payload.rows : stryMutAct_9fa48("10369") ? false : (stryCov_9fa48("10369", "10370"), (stryMutAct_9fa48("10372") ? payload.row && payload.new : stryMutAct_9fa48("10371") ? false : (stryCov_9fa48("10371", "10372"), payload.row || payload.new)) || payload.rows)) || null),
                  oldData: stryMutAct_9fa48("10375") ? payload.old && null : stryMutAct_9fa48("10374") ? false : stryMutAct_9fa48("10373") ? true : (stryCov_9fa48("10373", "10374", "10375"), payload.old || null),
                  queryId: stryMutAct_9fa48("10378") ? payload.queryId && null : stryMutAct_9fa48("10377") ? false : stryMutAct_9fa48("10376") ? true : (stryCov_9fa48("10376", "10377", "10378"), payload.queryId || null),
                  partitions: stryMutAct_9fa48("10381") ? registrationResult.partitions && [] : stryMutAct_9fa48("10380") ? false : stryMutAct_9fa48("10379") ? true : (stryCov_9fa48("10379", "10380", "10381"), registrationResult.partitions || (stryMutAct_9fa48("10382") ? ["Stryker was here"] : (stryCov_9fa48("10382"), [])))
                }));
              }
            }
          });
          const result = await this.liveQueryManager.registerLiveQuery(ast, liveClient);
          registrationResult.partitions = stryMutAct_9fa48("10385") ? result.partitions && [] : stryMutAct_9fa48("10384") ? false : stryMutAct_9fa48("10383") ? true : (stryCov_9fa48("10383", "10384", "10385"), result.partitions || (stryMutAct_9fa48("10386") ? ["Stryker was here"] : (stryCov_9fa48("10386"), [])));
          clientInfo.liveQueryMap.set(subscriptionId, result.queryId);
          this.sendToClient(clientInfo, stryMutAct_9fa48("10387") ? {} : (stryCov_9fa48("10387"), {
            type: MessageType.LIVE_QUERY_EVENT,
            subscriptionId,
            queryId: result.queryId,
            partitions: result.partitions,
            expiresAt: result.expiresAt
          }));
          this.logger.info(ADMIN_LOG_MSG.LIVE_QUERY_SUBSCRIBED, stryMutAct_9fa48("10388") ? {} : (stryCov_9fa48("10388"), {
            clientId: clientInfo.id,
            subscriptionId,
            queryId: result.queryId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("10389")) {
          {}
        } else {
          stryCov_9fa48("10389");
          this.logger.error(ADMIN_LOG_MSG.LIVE_QUERY_SUBSCRIBE_FAILED, stryMutAct_9fa48("10390") ? {} : (stryCov_9fa48("10390"), {
            clientId: clientInfo.id,
            subscriptionId,
            error: error.message
          }));
          this.sendError(clientInfo, null, ErrorCode.INTERNAL_ERROR, stryMutAct_9fa48("10391") ? `` : (stryCov_9fa48("10391"), `${ADMIN_ERROR_MESSAGE.LIVE_QUERY_PARSE_FAILED}: ${error.message}`));
        }
      }
    }
  }

  /**
   * Handle live query unsubscribe request.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Unsubscribe message.
   * @private
   */
  handleLiveQueryUnsubscribe(clientInfo, message) {
    if (stryMutAct_9fa48("10392")) {
      {}
    } else {
      stryCov_9fa48("10392");
      const subscriptionId = message.subscriptionId;
      if (stryMutAct_9fa48("10395") ? false : stryMutAct_9fa48("10394") ? true : stryMutAct_9fa48("10393") ? subscriptionId : (stryCov_9fa48("10393", "10394", "10395"), !subscriptionId)) {
        if (stryMutAct_9fa48("10396")) {
          {}
        } else {
          stryCov_9fa48("10396");
          return;
        }
      }
      const queryId = clientInfo.liveQueryMap.get(subscriptionId);
      if (stryMutAct_9fa48("10399") ? queryId || this.liveQueryManager : stryMutAct_9fa48("10398") ? false : stryMutAct_9fa48("10397") ? true : (stryCov_9fa48("10397", "10398", "10399"), queryId && this.liveQueryManager)) {
        if (stryMutAct_9fa48("10400")) {
          {}
        } else {
          stryCov_9fa48("10400");
          this.liveQueryManager.unregisterLiveQuery(queryId, clientInfo.id);
          clientInfo.liveQueryMap.delete(subscriptionId);
          this.logger.info(ADMIN_LOG_MSG.LIVE_QUERY_UNSUBSCRIBED, stryMutAct_9fa48("10401") ? {} : (stryCov_9fa48("10401"), {
            clientId: clientInfo.id,
            subscriptionId,
            queryId
          }));
        }
      }
    }
  }

  /**
   * Handle one dispatchable admin message by first translating to
   * canonical Service_Message envelope.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Admin websocket message.
   * @return {Promise<void>}
   * @private
   */
  async handleDispatchableAdminMessage(clientInfo, message) {
    if (stryMutAct_9fa48("10402")) {
      {}
    } else {
      stryCov_9fa48("10402");
      if (stryMutAct_9fa48("10405") ? false : stryMutAct_9fa48("10404") ? true : stryMutAct_9fa48("10403") ? isAdminMessageDispatchable(message.type) : (stryCov_9fa48("10403", "10404", "10405"), !isAdminMessageDispatchable(message.type))) {
        if (stryMutAct_9fa48("10406")) {
          {}
        } else {
          stryCov_9fa48("10406");
          return;
        }
      }
      const envelope = adaptAdminMessageToServiceMessage(message, stryMutAct_9fa48("10407") ? {} : (stryCov_9fa48("10407"), {
        clientId: clientInfo.id,
        lane: this.resolveAdminClientLane(stryMutAct_9fa48("10408") ? clientInfo.lane : (stryCov_9fa48("10408"), clientInfo?.lane)),
        tenantId: stryMutAct_9fa48("10411") ? message.tenantId && null : stryMutAct_9fa48("10410") ? false : stryMutAct_9fa48("10409") ? true : (stryCov_9fa48("10409", "10410", "10411"), message.tenantId || null),
        principal: stryMutAct_9fa48("10414") ? message.principal && null : stryMutAct_9fa48("10413") ? false : stryMutAct_9fa48("10412") ? true : (stryCov_9fa48("10412", "10413", "10414"), message.principal || null),
        traceId: stryMutAct_9fa48("10417") ? message.traceId && null : stryMutAct_9fa48("10416") ? false : stryMutAct_9fa48("10415") ? true : (stryCov_9fa48("10415", "10416", "10417"), message.traceId || null)
      }));
      await this.handleServiceDispatchEnvelope(clientInfo, message, envelope);
    }
  }

  /**
   * Handle dispatchable admin messages through ServiceDispatcher.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Admin websocket message.
   * @private
   */
  async handleServiceDispatchMessage(clientInfo, message) {
    if (stryMutAct_9fa48("10418")) {
      {}
    } else {
      stryCov_9fa48("10418");
      const envelope = adaptAdminMessageToServiceMessage(message, stryMutAct_9fa48("10419") ? {} : (stryCov_9fa48("10419"), {
        clientId: clientInfo.id,
        lane: this.resolveAdminClientLane(stryMutAct_9fa48("10420") ? clientInfo.lane : (stryCov_9fa48("10420"), clientInfo?.lane)),
        tenantId: stryMutAct_9fa48("10423") ? message.tenantId && null : stryMutAct_9fa48("10422") ? false : stryMutAct_9fa48("10421") ? true : (stryCov_9fa48("10421", "10422", "10423"), message.tenantId || null),
        principal: stryMutAct_9fa48("10426") ? message.principal && null : stryMutAct_9fa48("10425") ? false : stryMutAct_9fa48("10424") ? true : (stryCov_9fa48("10424", "10425", "10426"), message.principal || null),
        traceId: stryMutAct_9fa48("10429") ? message.traceId && null : stryMutAct_9fa48("10428") ? false : stryMutAct_9fa48("10427") ? true : (stryCov_9fa48("10427", "10428", "10429"), message.traceId || null)
      }));
      return this.handleServiceDispatchEnvelope(clientInfo, message, envelope);
    }
  }

  /**
   * Dispatch one canonical envelope through the shared service dispatcher.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Original admin websocket message.
   * @param {Object} envelope - Canonical service-message envelope.
   * @return {Promise<void>}
   * @private
   */
  async handleServiceDispatchEnvelope(clientInfo, message, envelope) {
    if (stryMutAct_9fa48("10430")) {
      {}
    } else {
      stryCov_9fa48("10430");
      const queryId = stryMutAct_9fa48("10433") ? (message.queryId || message.messageId) && null : stryMutAct_9fa48("10432") ? false : stryMutAct_9fa48("10431") ? true : (stryCov_9fa48("10431", "10432", "10433"), (stryMutAct_9fa48("10435") ? message.queryId && message.messageId : stryMutAct_9fa48("10434") ? false : (stryCov_9fa48("10434", "10435"), message.queryId || message.messageId)) || null);
      try {
        if (stryMutAct_9fa48("10436")) {
          {}
        } else {
          stryCov_9fa48("10436");
          const dispatchResult = await this.serviceDispatcher.dispatch(envelope, stryMutAct_9fa48("10437") ? {} : (stryCov_9fa48("10437"), {
            clientInfo,
            nodeId: this.nodeId,
            traceId: stryMutAct_9fa48("10440") ? envelope.traceId && null : stryMutAct_9fa48("10439") ? false : stryMutAct_9fa48("10438") ? true : (stryCov_9fa48("10438", "10439", "10440"), envelope.traceId || null),
            tenantId: stryMutAct_9fa48("10443") ? envelope.tenantId && null : stryMutAct_9fa48("10442") ? false : stryMutAct_9fa48("10441") ? true : (stryCov_9fa48("10441", "10442", "10443"), envelope.tenantId || null),
            principal: stryMutAct_9fa48("10446") ? envelope.principal && null : stryMutAct_9fa48("10445") ? false : stryMutAct_9fa48("10444") ? true : (stryCov_9fa48("10444", "10445", "10446"), envelope.principal || null)
          }));
          const deliveryPayload = stryMutAct_9fa48("10449") ? dispatchResult.delivery?.payload && {} : stryMutAct_9fa48("10448") ? false : stryMutAct_9fa48("10447") ? true : (stryCov_9fa48("10447", "10448", "10449"), (stryMutAct_9fa48("10450") ? dispatchResult.delivery.payload : (stryCov_9fa48("10450"), dispatchResult.delivery?.payload)) || {});
          const operation = dispatchResult.envelope.operation;
          if (stryMutAct_9fa48("10453") ? operation !== ADMIN_SERVICE_OPERATION.GET_CACHE_DUMP : stryMutAct_9fa48("10452") ? false : stryMutAct_9fa48("10451") ? true : (stryCov_9fa48("10451", "10452", "10453"), operation === ADMIN_SERVICE_OPERATION.GET_CACHE_DUMP)) {
            if (stryMutAct_9fa48("10454")) {
              {}
            } else {
              stryCov_9fa48("10454");
              const cacheDump = stryMutAct_9fa48("10457") ? (deliveryPayload.cacheDump || deliveryPayload.data) && null : stryMutAct_9fa48("10456") ? false : stryMutAct_9fa48("10455") ? true : (stryCov_9fa48("10455", "10456", "10457"), (stryMutAct_9fa48("10459") ? deliveryPayload.cacheDump && deliveryPayload.data : stryMutAct_9fa48("10458") ? false : (stryCov_9fa48("10458", "10459"), deliveryPayload.cacheDump || deliveryPayload.data)) || null);
              if (stryMutAct_9fa48("10462") ? !cacheDump && typeof cacheDump !== TYPEOF.OBJECT : stryMutAct_9fa48("10461") ? false : stryMutAct_9fa48("10460") ? true : (stryCov_9fa48("10460", "10461", "10462"), (stryMutAct_9fa48("10463") ? cacheDump : (stryCov_9fa48("10463"), !cacheDump)) || (stryMutAct_9fa48("10465") ? typeof cacheDump === TYPEOF.OBJECT : stryMutAct_9fa48("10464") ? false : (stryCov_9fa48("10464", "10465"), typeof cacheDump !== TYPEOF.OBJECT)))) {
                if (stryMutAct_9fa48("10466")) {
                  {}
                } else {
                  stryCov_9fa48("10466");
                  throw new Error(ADMIN_ERROR_MESSAGE.SYSTEM_CACHE_EMPTY);
                }
              }
              this.sendCacheDumpPayload(clientInfo, cacheDump);
              return;
            }
          }
          if (stryMutAct_9fa48("10469") ? deliveryPayload.queryResult || typeof deliveryPayload.queryResult === TYPEOF.OBJECT : stryMutAct_9fa48("10468") ? false : stryMutAct_9fa48("10467") ? true : (stryCov_9fa48("10467", "10468", "10469"), deliveryPayload.queryResult && (stryMutAct_9fa48("10471") ? typeof deliveryPayload.queryResult !== TYPEOF.OBJECT : stryMutAct_9fa48("10470") ? true : (stryCov_9fa48("10470", "10471"), typeof deliveryPayload.queryResult === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("10472")) {
              {}
            } else {
              stryCov_9fa48("10472");
              this.sendQueryResult(clientInfo, stryMutAct_9fa48("10475") ? queryId && envelope.messageId : stryMutAct_9fa48("10474") ? false : stryMutAct_9fa48("10473") ? true : (stryCov_9fa48("10473", "10474", "10475"), queryId || envelope.messageId), deliveryPayload.queryResult);
              return;
            }
          }
          const deliveryResults = Array.isArray(deliveryPayload.results) ? deliveryPayload.results : stryMutAct_9fa48("10476") ? ["Stryker was here"] : (stryCov_9fa48("10476"), []);
          this.sendQueryResult(clientInfo, stryMutAct_9fa48("10479") ? queryId && envelope.messageId : stryMutAct_9fa48("10478") ? false : stryMutAct_9fa48("10477") ? true : (stryCov_9fa48("10477", "10478", "10479"), queryId || envelope.messageId), stryMutAct_9fa48("10480") ? {} : (stryCov_9fa48("10480"), {
            operation,
            results: deliveryResults,
            count: deliveryResults.length
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("10481")) {
          {}
        } else {
          stryCov_9fa48("10481");
          const errorCode = this.getErrorCode(error);
          this.sendError(clientInfo, queryId, errorCode, error.message, error.adminHint, error);
        }
      }
    }
  }

  /**
   * Resolve unified lifecycle diagnostics report payload.
   * @return {Object|null}
   * @private
   */
  resolveServiceDiagnosticsReport() {
    if (stryMutAct_9fa48("10482")) {
      {}
    } else {
      stryCov_9fa48("10482");
      if (stryMutAct_9fa48("10485") ? !this.serviceDiagnosticsProvider && typeof this.serviceDiagnosticsProvider !== TYPEOF.FUNCTION : stryMutAct_9fa48("10484") ? false : stryMutAct_9fa48("10483") ? true : (stryCov_9fa48("10483", "10484", "10485"), (stryMutAct_9fa48("10486") ? this.serviceDiagnosticsProvider : (stryCov_9fa48("10486"), !this.serviceDiagnosticsProvider)) || (stryMutAct_9fa48("10488") ? typeof this.serviceDiagnosticsProvider === TYPEOF.FUNCTION : stryMutAct_9fa48("10487") ? false : (stryCov_9fa48("10487", "10488"), typeof this.serviceDiagnosticsProvider !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("10489")) {
          {}
        } else {
          stryCov_9fa48("10489");
          return null;
        }
      }
      const report = this.serviceDiagnosticsProvider();
      if (stryMutAct_9fa48("10492") ? !report && typeof report !== TYPEOF.OBJECT : stryMutAct_9fa48("10491") ? false : stryMutAct_9fa48("10490") ? true : (stryCov_9fa48("10490", "10491", "10492"), (stryMutAct_9fa48("10493") ? report : (stryCov_9fa48("10493"), !report)) || (stryMutAct_9fa48("10495") ? typeof report === TYPEOF.OBJECT : stryMutAct_9fa48("10494") ? false : (stryCov_9fa48("10494", "10495"), typeof report !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("10496")) {
          {}
        } else {
          stryCov_9fa48("10496");
          return null;
        }
      }
      return report;
    }
  }

  /**
   * Handle lifecycle/reconciler diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleServiceDiagnostics(reply) {
    if (stryMutAct_9fa48("10497")) {
      {}
    } else {
      stryCov_9fa48("10497");
      const report = this.resolveServiceDiagnosticsReport();
      if (stryMutAct_9fa48("10500") ? false : stryMutAct_9fa48("10499") ? true : stryMutAct_9fa48("10498") ? report : (stryCov_9fa48("10498", "10499", "10500"), !report)) {
        if (stryMutAct_9fa48("10501")) {
          {}
        } else {
          stryCov_9fa48("10501");
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send(stryMutAct_9fa48("10502") ? {} : (stryCov_9fa48("10502"), {
            error: ADMIN_ERROR_MESSAGE.SERVICE_DIAGNOSTICS_UNAVAILABLE
          }));
          return;
        }
      }
      reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("10503") ? {} : (stryCov_9fa48("10503"), {
        nodeId: this.nodeId,
        timestamp: Date.now(),
        diagnostics: report
      }));
    }
  }

  /**
   * Handle local CDC diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleCdcDiagnostics(reply) {
    if (stryMutAct_9fa48("10504")) {
      {}
    } else {
      stryCov_9fa48("10504");
      try {
        if (stryMutAct_9fa48("10505")) {
          {}
        } else {
          stryCov_9fa48("10505");
          const diagnostics = this.buildLocalCdcDiagnostics();
          reply.code(HTTP_STATUS.OK).send(diagnostics);
        }
      } catch (error) {
        if (stryMutAct_9fa48("10506")) {
          {}
        } else {
          stryCov_9fa48("10506");
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send(stryMutAct_9fa48("10507") ? {} : (stryCov_9fa48("10507"), {
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Handle local partition diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handlePartitionDiagnostics(reply) {
    if (stryMutAct_9fa48("10508")) {
      {}
    } else {
      stryCov_9fa48("10508");
      try {
        if (stryMutAct_9fa48("10509")) {
          {}
        } else {
          stryCov_9fa48("10509");
          const diagnostics = this.buildLocalPartitionDiagnostics();
          reply.code(HTTP_STATUS.OK).send(diagnostics);
        }
      } catch (error) {
        if (stryMutAct_9fa48("10510")) {
          {}
        } else {
          stryCov_9fa48("10510");
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send(stryMutAct_9fa48("10511") ? {} : (stryCov_9fa48("10511"), {
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Handle local SQL diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleSqlDiagnostics(reply) {
    if (stryMutAct_9fa48("10512")) {
      {}
    } else {
      stryCov_9fa48("10512");
      try {
        if (stryMutAct_9fa48("10513")) {
          {}
        } else {
          stryCov_9fa48("10513");
          const diagnostics = this.buildLocalSqlDiagnostics();
          reply.code(HTTP_STATUS.OK).send(diagnostics);
        }
      } catch (error) {
        if (stryMutAct_9fa48("10514")) {
          {}
        } else {
          stryCov_9fa48("10514");
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send(stryMutAct_9fa48("10515") ? {} : (stryCov_9fa48("10515"), {
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Handle preflight critical-path snapshot diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handlePreflightCriticalPathSnapshot(reply) {
    if (stryMutAct_9fa48("10516")) {
      {}
    } else {
      stryCov_9fa48("10516");
      try {
        if (stryMutAct_9fa48("10517")) {
          {}
        } else {
          stryCov_9fa48("10517");
          const snapshot = await this.resolvePreflightCriticalPathSnapshot();
          reply.code(HTTP_STATUS.OK).send(snapshot);
        }
      } catch (error) {
        if (stryMutAct_9fa48("10518")) {
          {}
        } else {
          stryCov_9fa48("10518");
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send(stryMutAct_9fa48("10519") ? {} : (stryCov_9fa48("10519"), {
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Handle local control snapshot route.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleControlSnapshot(request, reply) {
    if (stryMutAct_9fa48("10520")) {
      {}
    } else {
      stryCov_9fa48("10520");
      const scope = stryMutAct_9fa48("10522") ? String(request?.query?.[ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_KEY] || ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL).toLowerCase() : stryMutAct_9fa48("10521") ? String(request?.query?.[ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_KEY] || ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL).trim().toUpperCase() : (stryCov_9fa48("10521", "10522"), String(stryMutAct_9fa48("10525") ? request?.query?.[ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_KEY] && ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL : stryMutAct_9fa48("10524") ? false : stryMutAct_9fa48("10523") ? true : (stryCov_9fa48("10523", "10524", "10525"), (stryMutAct_9fa48("10527") ? request.query?.[ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_KEY] : stryMutAct_9fa48("10526") ? request?.query[ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_KEY] : (stryCov_9fa48("10526", "10527"), request?.query?.[ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_KEY])) || ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL)).trim().toLowerCase());
      if (stryMutAct_9fa48("10530") ? scope === ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL : stryMutAct_9fa48("10529") ? false : stryMutAct_9fa48("10528") ? true : (stryCov_9fa48("10528", "10529", "10530"), scope !== ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL)) {
        if (stryMutAct_9fa48("10531")) {
          {}
        } else {
          stryCov_9fa48("10531");
          reply.code(HTTP_STATUS.BAD_REQUEST).send(stryMutAct_9fa48("10532") ? {} : (stryCov_9fa48("10532"), {
            error: ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_SCOPE_UNSUPPORTED
          }));
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("10533")) {
          {}
        } else {
          stryCov_9fa48("10533");
          const snapshot = await this.buildLocalControlSnapshot();
          reply.code(HTTP_STATUS.OK).send(snapshot);
        }
      } catch (error) {
        if (stryMutAct_9fa48("10534")) {
          {}
        } else {
          stryCov_9fa48("10534");
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send(stryMutAct_9fa48("10535") ? {} : (stryCov_9fa48("10535"), {
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Handle local service-discovery route.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleServiceDiscovery(request, reply) {
    if (stryMutAct_9fa48("10536")) {
      {}
    } else {
      stryCov_9fa48("10536");
      const protocolAllowlist = parseDiscoveryListQuery(stryMutAct_9fa48("10538") ? request.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_PROTOCOL_KEY] : stryMutAct_9fa48("10537") ? request?.query[ADMIN_SERVICE_DISCOVERY.QUERY_PROTOCOL_KEY] : (stryCov_9fa48("10537", "10538"), request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_PROTOCOL_KEY]));
      const serviceIdAllowlist = parseDiscoveryListQuery(stryMutAct_9fa48("10540") ? request.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_SERVICE_ID_KEY] : stryMutAct_9fa48("10539") ? request?.query[ADMIN_SERVICE_DISCOVERY.QUERY_SERVICE_ID_KEY] : (stryCov_9fa48("10539", "10540"), request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_SERVICE_ID_KEY]));
      const nodeIdAllowlist = parseDiscoveryListQuery(stryMutAct_9fa48("10542") ? request.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_NODE_ID_KEY] : stryMutAct_9fa48("10541") ? request?.query[ADMIN_SERVICE_DISCOVERY.QUERY_NODE_ID_KEY] : (stryCov_9fa48("10541", "10542"), request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_NODE_ID_KEY]));
      const healthyOnly = parseDiscoveryBooleanQuery(stryMutAct_9fa48("10544") ? request.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_HEALTHY_ONLY_KEY] : stryMutAct_9fa48("10543") ? request?.query[ADMIN_SERVICE_DISCOVERY.QUERY_HEALTHY_ONLY_KEY] : (stryCov_9fa48("10543", "10544"), request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_HEALTHY_ONLY_KEY]), stryMutAct_9fa48("10545") ? true : (stryCov_9fa48("10545"), false));
      const unhealthyPolicyRaw = stryMutAct_9fa48("10547") ? request.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_UNHEALTHY_POLICY_KEY] : stryMutAct_9fa48("10546") ? request?.query[ADMIN_SERVICE_DISCOVERY.QUERY_UNHEALTHY_POLICY_KEY] : (stryCov_9fa48("10546", "10547"), request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_UNHEALTHY_POLICY_KEY]);
      const unhealthyPolicy = stryMutAct_9fa48("10549") ? String(unhealthyPolicyRaw || ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY).toLowerCase() : stryMutAct_9fa48("10548") ? String(unhealthyPolicyRaw || ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY).trim().toUpperCase() : (stryCov_9fa48("10548", "10549"), String(stryMutAct_9fa48("10552") ? unhealthyPolicyRaw && ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY : stryMutAct_9fa48("10551") ? false : stryMutAct_9fa48("10550") ? true : (stryCov_9fa48("10550", "10551", "10552"), unhealthyPolicyRaw || ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY)).trim().toLowerCase());
      const tableName = normalizeIdentifier(stryMutAct_9fa48("10554") ? request.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_TABLE_NAME_KEY] : stryMutAct_9fa48("10553") ? request?.query[ADMIN_SERVICE_DISCOVERY.QUERY_TABLE_NAME_KEY] : (stryCov_9fa48("10553", "10554"), request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_TABLE_NAME_KEY]));
      const resolvedUnhealthyPolicy = (stryMutAct_9fa48("10557") ? unhealthyPolicy !== ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE : stryMutAct_9fa48("10556") ? false : stryMutAct_9fa48("10555") ? true : (stryCov_9fa48("10555", "10556", "10557"), unhealthyPolicy === ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE)) ? ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE : ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY;
      try {
        if (stryMutAct_9fa48("10558")) {
          {}
        } else {
          stryCov_9fa48("10558");
          const snapshot = await this.serviceDiscovery.resolveServiceDiscoverySnapshot(stryMutAct_9fa48("10559") ? {} : (stryCov_9fa48("10559"), {
            protocolAllowlist,
            serviceIdAllowlist,
            nodeIdAllowlist,
            tableName,
            healthyOnly,
            unhealthyPolicy: resolvedUnhealthyPolicy
          }));
          reply.code(HTTP_STATUS.OK).send(snapshot);
        }
      } catch (error) {
        if (stryMutAct_9fa48("10560")) {
          {}
        } else {
          stryCov_9fa48("10560");
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send(stryMutAct_9fa48("10561") ? {} : (stryCov_9fa48("10561"), {
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Determine whether one SQL statement requests preflight critical path snapshot.
   * @param {string} sql
   * @return {boolean}
   * @private
   */
  isPreflightCriticalPathSnapshotQuery(sql) {
    if (stryMutAct_9fa48("10562")) {
      {}
    } else {
      stryCov_9fa48("10562");
      return stryMutAct_9fa48("10565") ? normalizeSql(sql) !== normalizeSql(ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.QUERY_SQL) : stryMutAct_9fa48("10564") ? false : stryMutAct_9fa48("10563") ? true : (stryCov_9fa48("10563", "10564", "10565"), normalizeSql(sql) === normalizeSql(ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.QUERY_SQL));
    }
  }

  /**
   * Determine whether one SQL statement requests local control snapshot.
   * @param {string} sql
   * @return {boolean}
   * @private
   */
  isControlSnapshotQuery(sql) {
    if (stryMutAct_9fa48("10566")) {
      {}
    } else {
      stryCov_9fa48("10566");
      return this.parseControlSnapshotQuery(sql).isQuery;
    }
  }

  /**
   * Parse one local control snapshot SQL query.
   * @param {string} sql
   * @return {Object}
   * @private
   */
  parseControlSnapshotQuery(sql) {
    if (stryMutAct_9fa48("10567")) {
      {}
    } else {
      stryCov_9fa48("10567");
      const normalizedSql = normalizeSql(sql);
      if (stryMutAct_9fa48("10570") ? normalizedSql !== normalizeSql(ADMIN_CONTROL_SNAPSHOT.QUERY_SQL) : stryMutAct_9fa48("10569") ? false : stryMutAct_9fa48("10568") ? true : (stryCov_9fa48("10568", "10569", "10570"), normalizedSql === normalizeSql(ADMIN_CONTROL_SNAPSHOT.QUERY_SQL))) {
        if (stryMutAct_9fa48("10571")) {
          {}
        } else {
          stryCov_9fa48("10571");
          return stryMutAct_9fa48("10572") ? {} : (stryCov_9fa48("10572"), {
            isQuery: stryMutAct_9fa48("10573") ? false : (stryCov_9fa48("10573"), true),
            forceAuthoritativeRepair: stryMutAct_9fa48("10574") ? true : (stryCov_9fa48("10574"), false)
          });
        }
      }
      if (stryMutAct_9fa48("10577") ? normalizedSql !== normalizeSql(ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR) : stryMutAct_9fa48("10576") ? false : stryMutAct_9fa48("10575") ? true : (stryCov_9fa48("10575", "10576", "10577"), normalizedSql === normalizeSql(ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR))) {
        if (stryMutAct_9fa48("10578")) {
          {}
        } else {
          stryCov_9fa48("10578");
          return stryMutAct_9fa48("10579") ? {} : (stryCov_9fa48("10579"), {
            isQuery: stryMutAct_9fa48("10580") ? false : (stryCov_9fa48("10580"), true),
            forceAuthoritativeRepair: stryMutAct_9fa48("10581") ? false : (stryCov_9fa48("10581"), true)
          });
        }
      }
      return stryMutAct_9fa48("10582") ? {} : (stryCov_9fa48("10582"), {
        isQuery: stryMutAct_9fa48("10583") ? true : (stryCov_9fa48("10583"), false),
        forceAuthoritativeRepair: stryMutAct_9fa48("10584") ? true : (stryCov_9fa48("10584"), false)
      });
    }
  }

  /**
   * Determine whether one SQL statement requests local service discovery.
   * @param {string} sql
   * @return {boolean}
   * @private
   */
  isServiceDiscoveryQuery(sql) {
    if (stryMutAct_9fa48("10585")) {
      {}
    } else {
      stryCov_9fa48("10585");
      return parseServiceDiscoverySqlQuery(sql).isQuery;
    }
  }

  /**
   * Delegate: build service discovery query result.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async buildServiceDiscoveryQueryResult(options = {}) {
    if (stryMutAct_9fa48("10586")) {
      {}
    } else {
      stryCov_9fa48("10586");
      return this.serviceDiscovery.buildServiceDiscoveryQueryResult(options);
    }
  }

  /**
   * Delegate: resolve service discovery snapshot.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async resolveServiceDiscoverySnapshot(options = {}) {
    if (stryMutAct_9fa48("10587")) {
      {}
    } else {
      stryCov_9fa48("10587");
      return this.serviceDiscovery.resolveServiceDiscoverySnapshot(options);
    }
  }

  /**
   * Delegate: build service discovery replica readiness.
   * @param {Object} replica
   * @param {Object} readinessContext
   * @return {Object}
   */
  buildServiceDiscoveryReplicaReadiness(replica, readinessContext) {
    if (stryMutAct_9fa48("10588")) {
      {}
    } else {
      stryCov_9fa48("10588");
      return this.serviceDiscovery.buildServiceDiscoveryReplicaReadiness(replica, readinessContext);
    }
  }

  /**
   * Delegate: build local preflight critical-path snapshot.
   * @return {Promise<Object>}
   */
  async buildLocalPreflightCriticalPathSnapshot() {
    if (stryMutAct_9fa48("10589")) {
      {}
    } else {
      stryCov_9fa48("10589");
      return this.preflightSnapshot.buildLocalPreflightCriticalPathSnapshot();
    }
  }

  /**
   * Delegate: resolve preflight critical-path snapshot.
   * @return {Promise<Object>}
   */
  async resolvePreflightCriticalPathSnapshot() {
    if (stryMutAct_9fa48("10590")) {
      {}
    } else {
      stryCov_9fa48("10590");
      return this.preflightSnapshot.resolvePreflightCriticalPathSnapshot();
    }
  }

  /**
   * Delegate: build preflight critical-path snapshot query result.
   * @return {Promise<Object>}
   */
  async buildPreflightCriticalPathSnapshotQueryResult() {
    if (stryMutAct_9fa48("10591")) {
      {}
    } else {
      stryCov_9fa48("10591");
      return this.preflightSnapshot.buildPreflightCriticalPathSnapshotQueryResult();
    }
  }

  /**
   * Delegate: build preflight cache freshness summary.
   * @param {Object} options
   * @return {Object}
   */
  buildPreflightCacheFreshnessSummary(options) {
    if (stryMutAct_9fa48("10592")) {
      {}
    } else {
      stryCov_9fa48("10592");
      return this.preflightSnapshot.buildPreflightCacheFreshnessSummary(options);
    }
  }

  /**
   * Delegate: build local control snapshot.
   * @return {Promise<Object>}
   */
  async buildLocalControlSnapshot() {
    if (stryMutAct_9fa48("10593")) {
      {}
    } else {
      stryCov_9fa48("10593");
      if (stryMutAct_9fa48("10596") ? typeof this.controlSnapshot.resolveLocalControlSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("10595") ? false : stryMutAct_9fa48("10594") ? true : (stryCov_9fa48("10594", "10595", "10596"), typeof this.controlSnapshot.resolveLocalControlSnapshot === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("10597")) {
          {}
        } else {
          stryCov_9fa48("10597");
          return this.controlSnapshot.resolveLocalControlSnapshot();
        }
      }
      return this.controlSnapshot.buildLocalControlSnapshot();
    }
  }

  /**
   * Delegate: build control snapshot leader summary.
   * @param {Array<Object>} partitionRows
   * @param {Array<Object>} serviceRows
   * @return {Object}
   */
  buildControlSnapshotLeaderSummary(partitionRows = stryMutAct_9fa48("10598") ? ["Stryker was here"] : (stryCov_9fa48("10598"), []), serviceRows = stryMutAct_9fa48("10599") ? ["Stryker was here"] : (stryCov_9fa48("10599"), [])) {
    if (stryMutAct_9fa48("10600")) {
      {}
    } else {
      stryCov_9fa48("10600");
      return this.controlSnapshot.buildControlSnapshotLeaderSummary(partitionRows, serviceRows);
    }
  }

  /**
   * Delegate: build control snapshot voter counts.
   * @param {Array<Object>} serviceRows
   * @return {Object}
   */
  buildControlSnapshotVoterCounts(serviceRows = stryMutAct_9fa48("10601") ? ["Stryker was here"] : (stryCov_9fa48("10601"), [])) {
    if (stryMutAct_9fa48("10602")) {
      {}
    } else {
      stryCov_9fa48("10602");
      return this.controlSnapshot.buildControlSnapshotVoterCounts(serviceRows);
    }
  }

  /**
   * Delegate: build control snapshot replica operation summary.
   * @param {Array<Object>} replicaOperationRows
   * @param {Object} [options={}]
   * @return {Object}
   */
  buildControlSnapshotReplicaOperationSummary(replicaOperationRows = stryMutAct_9fa48("10603") ? ["Stryker was here"] : (stryCov_9fa48("10603"), []), options = {}) {
    if (stryMutAct_9fa48("10604")) {
      {}
    } else {
      stryCov_9fa48("10604");
      return this.controlSnapshot.buildControlSnapshotReplicaOperationSummary(replicaOperationRows, options);
    }
  }

  /**
   * Delegate: build local CDC telemetry.
   * @return {Object}
   */
  buildLocalCdcTelemetry() {
    if (stryMutAct_9fa48("10605")) {
      {}
    } else {
      stryCov_9fa48("10605");
      return this.controlSnapshot.buildLocalCdcTelemetry();
    }
  }

  /**
   * Delegate: build local CDC diagnostics.
   * @return {Object}
   */
  buildLocalCdcDiagnostics() {
    if (stryMutAct_9fa48("10606")) {
      {}
    } else {
      stryCov_9fa48("10606");
      return this.controlSnapshot.buildLocalCdcDiagnostics();
    }
  }

  /**
   * Delegate: build local partition diagnostics.
   * @return {Object}
   */
  buildLocalPartitionDiagnostics() {
    if (stryMutAct_9fa48("10607")) {
      {}
    } else {
      stryCov_9fa48("10607");
      return this.controlSnapshot.buildLocalPartitionDiagnostics();
    }
  }

  /**
   * Delegate: build local SQL diagnostics.
   * @return {Object}
   */
  buildLocalSqlDiagnostics() {
    if (stryMutAct_9fa48("10608")) {
      {}
    } else {
      stryCov_9fa48("10608");
      return this.controlSnapshot.buildLocalSqlDiagnostics();
    }
  }

  /**
   * Delegate: build control snapshot query result.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async buildControlSnapshotQueryResult(options = {}) {
    if (stryMutAct_9fa48("10609")) {
      {}
    } else {
      stryCov_9fa48("10609");
      return this.controlSnapshot.buildControlSnapshotQueryResult(options);
    }
  }

  /**
   * Handle query message.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Query message.
   * @private
   */
  async handleQueryMessage(clientInfo, message) {
    if (stryMutAct_9fa48("10610")) {
      {}
    } else {
      stryCov_9fa48("10610");
      const queryId = stryMutAct_9fa48("10613") ? message.queryId && null : stryMutAct_9fa48("10612") ? false : stryMutAct_9fa48("10611") ? true : (stryCov_9fa48("10611", "10612", "10613"), message.queryId || null);
      const payload = stryMutAct_9fa48("10614") ? {} : (stryCov_9fa48("10614"), {
        queryId,
        sql: message.sql,
        params: stryMutAct_9fa48("10617") ? message.params && [] : stryMutAct_9fa48("10616") ? false : stryMutAct_9fa48("10615") ? true : (stryCov_9fa48("10615", "10616", "10617"), message.params || (stryMutAct_9fa48("10618") ? ["Stryker was here"] : (stryCov_9fa48("10618"), []))),
        timeoutMs: resolveRequestedQueryTimeoutMs(message.timeoutMs)
      });
      this.logger.debug(ADMIN_LOG_MSG.EXECUTING_QUERY, stryMutAct_9fa48("10619") ? {} : (stryCov_9fa48("10619"), {
        clientId: clientInfo.id,
        queryId,
        sql: (stryMutAct_9fa48("10622") ? typeof payload.sql !== TYPEOF.STRING : stryMutAct_9fa48("10621") ? false : stryMutAct_9fa48("10620") ? true : (stryCov_9fa48("10620", "10621", "10622"), typeof payload.sql === TYPEOF.STRING)) ? stryMutAct_9fa48("10623") ? payload.sql : (stryCov_9fa48("10623"), payload.sql.substring(NUM.ZERO, ADMIN_LIMIT.SQL_PREVIEW_LENGTH)) : null
      }));
      try {
        if (stryMutAct_9fa48("10624")) {
          {}
        } else {
          stryCov_9fa48("10624");
          const result = await this.executeLocalQueryEnvelope(payload);
          this.sendQueryResult(clientInfo, queryId, result);
        }
      } catch (error) {
        if (stryMutAct_9fa48("10625")) {
          {}
        } else {
          stryCov_9fa48("10625");
          const errorCode = this.getErrorCode(error);
          this.sendError(clientInfo, queryId, errorCode, error.message, error.adminHint, error);
        }
      }
    }
  }

  /**
   * Handle partition callback execution message.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Callback message.
   * @private
   */
  async handlePartitionCallbackMessage(clientInfo, message) {
    if (stryMutAct_9fa48("10626")) {
      {}
    } else {
      stryCov_9fa48("10626");
      const queryId = stryMutAct_9fa48("10629") ? message.queryId && null : stryMutAct_9fa48("10628") ? false : stryMutAct_9fa48("10627") ? true : (stryCov_9fa48("10627", "10628", "10629"), message.queryId || null);
      const payload = stryMutAct_9fa48("10630") ? {} : (stryCov_9fa48("10630"), {
        queryId,
        statement: stryMutAct_9fa48("10633") ? message.statement && message.sql : stryMutAct_9fa48("10632") ? false : stryMutAct_9fa48("10631") ? true : (stryCov_9fa48("10631", "10632", "10633"), message.statement || message.sql),
        parameters: stryMutAct_9fa48("10636") ? (message.parameters || message.params) && [] : stryMutAct_9fa48("10635") ? false : stryMutAct_9fa48("10634") ? true : (stryCov_9fa48("10634", "10635", "10636"), (stryMutAct_9fa48("10638") ? message.parameters && message.params : stryMutAct_9fa48("10637") ? false : (stryCov_9fa48("10637", "10638"), message.parameters || message.params)) || (stryMutAct_9fa48("10639") ? ["Stryker was here"] : (stryCov_9fa48("10639"), []))),
        callbackModuleRef: message.callbackModuleRef,
        callbackExport: message.callbackExport,
        runtimeKind: message.runtimeKind,
        timeoutMs: resolveRequestedQueryTimeoutMs(message.timeoutMs)
      });
      this.logger.debug(ADMIN_LOG_MSG.EXECUTING_QUERY, stryMutAct_9fa48("10640") ? {} : (stryCov_9fa48("10640"), {
        clientId: clientInfo.id,
        queryId,
        sql: (stryMutAct_9fa48("10643") ? typeof payload.statement !== TYPEOF.STRING : stryMutAct_9fa48("10642") ? false : stryMutAct_9fa48("10641") ? true : (stryCov_9fa48("10641", "10642", "10643"), typeof payload.statement === TYPEOF.STRING)) ? stryMutAct_9fa48("10644") ? payload.statement : (stryCov_9fa48("10644"), payload.statement.substring(NUM.ZERO, ADMIN_LIMIT.SQL_PREVIEW_LENGTH)) : null,
        executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
        callbackModuleRef: payload.callbackModuleRef,
        callbackExport: payload.callbackExport,
        runtimeKind: payload.runtimeKind
      }));
      try {
        if (stryMutAct_9fa48("10645")) {
          {}
        } else {
          stryCov_9fa48("10645");
          const result = await this.executeLocalPartitionCallbackEnvelope(payload);
          this.sendQueryResult(clientInfo, queryId, result);
        }
      } catch (error) {
        if (stryMutAct_9fa48("10646")) {
          {}
        } else {
          stryCov_9fa48("10646");
          const errorCode = this.getErrorCode(error);
          this.sendError(clientInfo, queryId, errorCode, error.message, error.adminHint, error);
        }
      }
    }
  }

  /**
   * Execute query with timeout.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {string} queryId - Query ID.
   * @param {number|null} [timeoutMs] - Optional timeout override.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeQueryWithTimeout(sql, params, queryId, timeoutMs = null) {
    if (stryMutAct_9fa48("10647")) {
      {}
    } else {
      stryCov_9fa48("10647");
      const requestedTimeoutMs = resolveRequestedQueryTimeoutMs(timeoutMs);
      return this.executeSqlRequestWithTimeout(createSqlRequest(stryMutAct_9fa48("10648") ? {} : (stryCov_9fa48("10648"), {
        statement: sql,
        parameters: params,
        sessionId: queryId,
        executionMode: EXECUTION_MODE.SQL_STATEMENT
      })), (stryMutAct_9fa48("10651") ? requestedTimeoutMs !== null : stryMutAct_9fa48("10650") ? false : stryMutAct_9fa48("10649") ? true : (stryCov_9fa48("10649", "10650", "10651"), requestedTimeoutMs === null)) ? undefined : requestedTimeoutMs);
    }
  }

  /**
   * Execute canonical SQL request with timeout.
   * @param {Object} sqlRequest - Canonical SqlRequest.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSqlRequestWithTimeout(sqlRequest, timeoutMs = this.queryTimeoutMs) {
    if (stryMutAct_9fa48("10652")) {
      {}
    } else {
      stryCov_9fa48("10652");
      if (stryMutAct_9fa48("10655") ? !this.sqlQueryEngine && typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION : stryMutAct_9fa48("10654") ? false : stryMutAct_9fa48("10653") ? true : (stryCov_9fa48("10653", "10654", "10655"), (stryMutAct_9fa48("10656") ? this.sqlQueryEngine : (stryCov_9fa48("10656"), !this.sqlQueryEngine)) || (stryMutAct_9fa48("10658") ? typeof this.sqlQueryEngine.executeRequest === TYPEOF.FUNCTION : stryMutAct_9fa48("10657") ? false : (stryCov_9fa48("10657", "10658"), typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("10659")) {
          {}
        } else {
          stryCov_9fa48("10659");
          throw new Error(ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE);
        }
      }
      const timeoutBudget = createTimeoutBudget(stryMutAct_9fa48("10660") ? {} : (stryCov_9fa48("10660"), {
        configuredBudgetMs: timeoutMs,
        now: this.nowFn
      }));
      const cancellationToken = stryMutAct_9fa48("10663") ? sqlRequest?.cancellationToken && new CancellationToken() : stryMutAct_9fa48("10662") ? false : stryMutAct_9fa48("10661") ? true : (stryCov_9fa48("10661", "10662", "10663"), (stryMutAct_9fa48("10664") ? sqlRequest.cancellationToken : (stryCov_9fa48("10664"), sqlRequest?.cancellationToken)) || new CancellationToken());
      const requestWithControl = stryMutAct_9fa48("10665") ? {} : (stryCov_9fa48("10665"), {
        ...sqlRequest,
        timeoutMs,
        cancellationToken
      });
      let timeoutId;
      try {
        if (stryMutAct_9fa48("10666")) {
          {}
        } else {
          stryCov_9fa48("10666");
          const timeoutPromise = new Promise((_, reject) => {
            if (stryMutAct_9fa48("10667")) {
              {}
            } else {
              stryCov_9fa48("10667");
              timeoutId = setTimeout(() => {
                if (stryMutAct_9fa48("10668")) {
                  {}
                } else {
                  stryCov_9fa48("10668");
                  cancellationToken.cancel(ADMIN_ERROR_MESSAGE.queryTimeout(timeoutMs));
                  reject(createTimeoutBudgetError(stryMutAct_9fa48("10669") ? {} : (stryCov_9fa48("10669"), {
                    message: ADMIN_ERROR_MESSAGE.queryTimeout(timeoutMs),
                    budget: timeoutBudget,
                    classification: TIMEOUT_BUDGET_CLASSIFICATION.QUERY_TIMEOUT,
                    nestedOperation: stryMutAct_9fa48("10670") ? "" : (stryCov_9fa48("10670"), 'admin_sql_query'),
                    now: this.nowFn
                  })));
                }
              }, timeoutMs);
            }
          });
          const queryPromise = this.sqlQueryEngine.executeRequest(requestWithControl);
          return await Promise.race(stryMutAct_9fa48("10671") ? [] : (stryCov_9fa48("10671"), [queryPromise, timeoutPromise]));
        }
      } finally {
        if (stryMutAct_9fa48("10672")) {
          {}
        } else {
          stryCov_9fa48("10672");
          if (stryMutAct_9fa48("10674") ? false : stryMutAct_9fa48("10673") ? true : (stryCov_9fa48("10673", "10674"), timeoutId)) {
            if (stryMutAct_9fa48("10675")) {
              {}
            } else {
              stryCov_9fa48("10675");
              clearTimeout(timeoutId);
            }
          }
        }
      }
    }
  }

  /**
   * Resolve guard mode for adapter routing based on enforcement mode.
   * @return {string} MUTATION_GUARD_MODE value.
   * @private
   */
  resolveMutationGuardMode() {
    if (stryMutAct_9fa48("10676")) {
      {}
    } else {
      stryCov_9fa48("10676");
      if (stryMutAct_9fa48("10679") ? this.enforcementMode !== ADMIN_ENFORCEMENT_MODE.ENFORCE : stryMutAct_9fa48("10678") ? false : stryMutAct_9fa48("10677") ? true : (stryCov_9fa48("10677", "10678", "10679"), this.enforcementMode === ADMIN_ENFORCEMENT_MODE.ENFORCE)) {
        if (stryMutAct_9fa48("10680")) {
          {}
        } else {
          stryCov_9fa48("10680");
          return MUTATION_GUARD_MODE.REJECT;
        }
      }
      return MUTATION_GUARD_MODE.WARN;
    }
  }

  /**
   * Send query result to client.
   * @param {Object} clientInfo - Client information.
   * @param {string} queryId - Query ID.
   * @param {Object} result - Query result.
   * @private
   */
  sendQueryResult(clientInfo, queryId, result) {
    if (stryMutAct_9fa48("10681")) {
      {}
    } else {
      stryCov_9fa48("10681");
      const message = stryMutAct_9fa48("10682") ? {} : (stryCov_9fa48("10682"), {
        type: MessageType.QUERY_RESULT,
        queryId,
        timestamp: Date.now()
      });
      const operation = (stryMutAct_9fa48("10685") ? typeof result?.operation !== TYPEOF.STRING : stryMutAct_9fa48("10684") ? false : stryMutAct_9fa48("10683") ? true : (stryCov_9fa48("10683", "10684", "10685"), typeof (stryMutAct_9fa48("10686") ? result.operation : (stryCov_9fa48("10686"), result?.operation)) === TYPEOF.STRING)) ? stryMutAct_9fa48("10688") ? result.operation.toLowerCase() : stryMutAct_9fa48("10687") ? result.operation.trim().toUpperCase() : (stryCov_9fa48("10687", "10688"), result.operation.trim().toLowerCase()) : EMPTY_STRING;
      const isWriteOperation = stryMutAct_9fa48("10691") ? (operation === 'insert' || operation === 'update') && operation === 'delete' : stryMutAct_9fa48("10690") ? false : stryMutAct_9fa48("10689") ? true : (stryCov_9fa48("10689", "10690", "10691"), (stryMutAct_9fa48("10693") ? operation === 'insert' && operation === 'update' : stryMutAct_9fa48("10692") ? false : (stryCov_9fa48("10692", "10693"), (stryMutAct_9fa48("10695") ? operation !== 'insert' : stryMutAct_9fa48("10694") ? false : (stryCov_9fa48("10694", "10695"), operation === (stryMutAct_9fa48("10696") ? "" : (stryCov_9fa48("10696"), 'insert')))) || (stryMutAct_9fa48("10698") ? operation !== 'update' : stryMutAct_9fa48("10697") ? false : (stryCov_9fa48("10697", "10698"), operation === (stryMutAct_9fa48("10699") ? "" : (stryCov_9fa48("10699"), 'update')))))) || (stryMutAct_9fa48("10701") ? operation !== 'delete' : stryMutAct_9fa48("10700") ? false : (stryCov_9fa48("10700", "10701"), operation === (stryMutAct_9fa48("10702") ? "" : (stryCov_9fa48("10702"), 'delete')))));
      const hasAffectedRows = Number.isFinite(Number(stryMutAct_9fa48("10703") ? result.affectedRows : (stryCov_9fa48("10703"), result?.affectedRows)));
      const hasRowPayload = stryMutAct_9fa48("10706") ? result.rows !== undefined && result.results !== undefined : stryMutAct_9fa48("10705") ? false : stryMutAct_9fa48("10704") ? true : (stryCov_9fa48("10704", "10705", "10706"), (stryMutAct_9fa48("10708") ? result.rows === undefined : stryMutAct_9fa48("10707") ? false : (stryCov_9fa48("10707", "10708"), result.rows !== undefined)) || (stryMutAct_9fa48("10710") ? result.results === undefined : stryMutAct_9fa48("10709") ? false : (stryCov_9fa48("10709", "10710"), result.results !== undefined)));
      if (stryMutAct_9fa48("10713") ? result.success !== false : stryMutAct_9fa48("10712") ? false : stryMutAct_9fa48("10711") ? true : (stryCov_9fa48("10711", "10712", "10713"), result.success === (stryMutAct_9fa48("10714") ? true : (stryCov_9fa48("10714"), false)))) {
        if (stryMutAct_9fa48("10715")) {
          {}
        } else {
          stryCov_9fa48("10715");
          message.error = result.error;
          message.errorCode = stryMutAct_9fa48("10718") ? result.errorCode && ErrorCode.INTERNAL_ERROR : stryMutAct_9fa48("10717") ? false : stryMutAct_9fa48("10716") ? true : (stryCov_9fa48("10716", "10717", "10718"), result.errorCode || ErrorCode.INTERNAL_ERROR);
          if (stryMutAct_9fa48("10720") ? false : stryMutAct_9fa48("10719") ? true : (stryCov_9fa48("10719", "10720"), result.hint)) {
            if (stryMutAct_9fa48("10721")) {
              {}
            } else {
              stryCov_9fa48("10721");
              message.hint = result.hint;
            }
          }
          if (stryMutAct_9fa48("10724") ? result.deferRetry !== true : stryMutAct_9fa48("10723") ? false : stryMutAct_9fa48("10722") ? true : (stryCov_9fa48("10722", "10723", "10724"), result.deferRetry === (stryMutAct_9fa48("10725") ? false : (stryCov_9fa48("10725"), true)))) {
            if (stryMutAct_9fa48("10726")) {
              {}
            } else {
              stryCov_9fa48("10726");
              message.deferRetry = stryMutAct_9fa48("10727") ? false : (stryCov_9fa48("10727"), true);
            }
          }
          if (stryMutAct_9fa48("10729") ? false : stryMutAct_9fa48("10728") ? true : (stryCov_9fa48("10728", "10729"), Number.isFinite(result.retryAfterMs))) {
            if (stryMutAct_9fa48("10730")) {
              {}
            } else {
              stryCov_9fa48("10730");
              message.retryAfterMs = stryMutAct_9fa48("10731") ? Math.min(NUM.ZERO, Math.floor(result.retryAfterMs)) : (stryCov_9fa48("10731"), Math.max(NUM.ZERO, Math.floor(result.retryAfterMs)));
            }
          }
        }
      } else if (stryMutAct_9fa48("10734") ? result.hostResult && result.executionMode === EXECUTION_MODE.PARTITION_CALLBACK : stryMutAct_9fa48("10733") ? false : stryMutAct_9fa48("10732") ? true : (stryCov_9fa48("10732", "10733", "10734"), result.hostResult || (stryMutAct_9fa48("10736") ? result.executionMode !== EXECUTION_MODE.PARTITION_CALLBACK : stryMutAct_9fa48("10735") ? false : (stryCov_9fa48("10735", "10736"), result.executionMode === EXECUTION_MODE.PARTITION_CALLBACK)))) {
        if (stryMutAct_9fa48("10737")) {
          {}
        } else {
          stryCov_9fa48("10737");
          message.operation = EXECUTION_MODE.PARTITION_CALLBACK;
          message.results = Array.isArray(result.results) ? result.results : ADMIN_CACHE_DUMP.EMPTY;
          message.hostResult = stryMutAct_9fa48("10740") ? result.hostResult && null : stryMutAct_9fa48("10739") ? false : stryMutAct_9fa48("10738") ? true : (stryCov_9fa48("10738", "10739", "10740"), result.hostResult || null);
          message.callbackModuleRef = stryMutAct_9fa48("10743") ? result.callbackModuleRef && null : stryMutAct_9fa48("10742") ? false : stryMutAct_9fa48("10741") ? true : (stryCov_9fa48("10741", "10742", "10743"), result.callbackModuleRef || null);
          message.callbackExport = stryMutAct_9fa48("10746") ? result.callbackExport && null : stryMutAct_9fa48("10745") ? false : stryMutAct_9fa48("10744") ? true : (stryCov_9fa48("10744", "10745", "10746"), result.callbackExport || null);
        }
      } else if (stryMutAct_9fa48("10749") ? isWriteOperation && hasAffectedRows : stryMutAct_9fa48("10748") ? false : stryMutAct_9fa48("10747") ? true : (stryCov_9fa48("10747", "10748", "10749"), isWriteOperation || hasAffectedRows)) {
        if (stryMutAct_9fa48("10750")) {
          {}
        } else {
          stryCov_9fa48("10750");
          message.operation = stryMutAct_9fa48("10753") ? result.operation && null : stryMutAct_9fa48("10752") ? false : stryMutAct_9fa48("10751") ? true : (stryCov_9fa48("10751", "10752", "10753"), result.operation || null);
          const parsedAffectedRows = Number(result.affectedRows);
          message.affectedRows = Number.isFinite(parsedAffectedRows) ? parsedAffectedRows : ADMIN_QUERY_RESULT.AFFECTED_ROWS_DEFAULT;
          message.partitions = stryMutAct_9fa48("10756") ? result.partitions && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("10755") ? false : stryMutAct_9fa48("10754") ? true : (stryCov_9fa48("10754", "10755", "10756"), result.partitions || ADMIN_CACHE_DUMP.EMPTY);
          message.tableName = stryMutAct_9fa48("10759") ? result.tableName && null : stryMutAct_9fa48("10758") ? false : stryMutAct_9fa48("10757") ? true : (stryCov_9fa48("10757", "10758", "10759"), result.tableName || null);
          if (stryMutAct_9fa48("10761") ? false : stryMutAct_9fa48("10760") ? true : (stryCov_9fa48("10760", "10761"), hasRowPayload)) {
            if (stryMutAct_9fa48("10762")) {
              {}
            } else {
              stryCov_9fa48("10762");
              message.results = stryMutAct_9fa48("10765") ? (result.rows || result.results) && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("10764") ? false : stryMutAct_9fa48("10763") ? true : (stryCov_9fa48("10763", "10764", "10765"), (stryMutAct_9fa48("10767") ? result.rows && result.results : stryMutAct_9fa48("10766") ? false : (stryCov_9fa48("10766", "10767"), result.rows || result.results)) || ADMIN_CACHE_DUMP.EMPTY);
              message.count = message.results.length;
            }
          }
        }
      } else if (stryMutAct_9fa48("10769") ? false : stryMutAct_9fa48("10768") ? true : (stryCov_9fa48("10768", "10769"), hasRowPayload)) {
        if (stryMutAct_9fa48("10770")) {
          {}
        } else {
          stryCov_9fa48("10770");
          // SELECT query result - handle both 'rows' and 'results' field names
          message.results = stryMutAct_9fa48("10773") ? (result.rows || result.results) && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("10772") ? false : stryMutAct_9fa48("10771") ? true : (stryCov_9fa48("10771", "10772", "10773"), (stryMutAct_9fa48("10775") ? result.rows && result.results : stryMutAct_9fa48("10774") ? false : (stryCov_9fa48("10774", "10775"), result.rows || result.results)) || ADMIN_CACHE_DUMP.EMPTY);
          message.count = (stryMutAct_9fa48("10778") ? result.count === undefined : stryMutAct_9fa48("10777") ? false : stryMutAct_9fa48("10776") ? true : (stryCov_9fa48("10776", "10777", "10778"), result.count !== undefined)) ? result.count : message.results.length;
          message.partitions = stryMutAct_9fa48("10781") ? result.partitions && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("10780") ? false : stryMutAct_9fa48("10779") ? true : (stryCov_9fa48("10779", "10780", "10781"), result.partitions || ADMIN_CACHE_DUMP.EMPTY);
          message.tableName = stryMutAct_9fa48("10784") ? result.tableName && null : stryMutAct_9fa48("10783") ? false : stryMutAct_9fa48("10782") ? true : (stryCov_9fa48("10782", "10783", "10784"), result.tableName || null);
        }
      } else {
        if (stryMutAct_9fa48("10785")) {
          {}
        } else {
          stryCov_9fa48("10785");
          // Write operation result (INSERT, UPDATE, DELETE)
          message.operation = result.operation;
          message.affectedRows = stryMutAct_9fa48("10788") ? result.affectedRows && ADMIN_QUERY_RESULT.AFFECTED_ROWS_DEFAULT : stryMutAct_9fa48("10787") ? false : stryMutAct_9fa48("10786") ? true : (stryCov_9fa48("10786", "10787", "10788"), result.affectedRows || ADMIN_QUERY_RESULT.AFFECTED_ROWS_DEFAULT);
          message.partitions = stryMutAct_9fa48("10791") ? result.partitions && ADMIN_CACHE_DUMP.EMPTY : stryMutAct_9fa48("10790") ? false : stryMutAct_9fa48("10789") ? true : (stryCov_9fa48("10789", "10790", "10791"), result.partitions || ADMIN_CACHE_DUMP.EMPTY);
          message.tableName = stryMutAct_9fa48("10794") ? result.tableName && null : stryMutAct_9fa48("10793") ? false : stryMutAct_9fa48("10792") ? true : (stryCov_9fa48("10792", "10793", "10794"), result.tableName || null);
        }
      }
      if (stryMutAct_9fa48("10796") ? false : stryMutAct_9fa48("10795") ? true : (stryCov_9fa48("10795", "10796"), result.warning)) {
        if (stryMutAct_9fa48("10797")) {
          {}
        } else {
          stryCov_9fa48("10797");
          message.warning = result.warning;
        }
      }
      this.sendToClient(clientInfo, message);
      this.logger.debug(ADMIN_LOG_MSG.QUERY_RESULT_SENT, stryMutAct_9fa48("10798") ? {} : (stryCov_9fa48("10798"), {
        clientId: clientInfo.id,
        queryId,
        success: stryMutAct_9fa48("10801") ? result.success === false : stryMutAct_9fa48("10800") ? false : stryMutAct_9fa48("10799") ? true : (stryCov_9fa48("10799", "10800", "10801"), result.success !== (stryMutAct_9fa48("10802") ? true : (stryCov_9fa48("10802"), false)))
      }));
    }
  }

  /**
   * Handle refresh message (request new cache dump).
   * @param {Object} clientInfo - Client information.
   * @param {Object} _message - Refresh message.
   * @private
   */
  handleRefreshMessage(clientInfo, _message) {
    if (stryMutAct_9fa48("10803")) {
      {}
    } else {
      stryCov_9fa48("10803");
      this.logger.debug(ADMIN_LOG_MSG.REFRESH_REQUESTED, stryMutAct_9fa48("10804") ? {} : (stryCov_9fa48("10804"), {
        clientId: clientInfo.id
      }));
      try {
        if (stryMutAct_9fa48("10805")) {
          {}
        } else {
          stryCov_9fa48("10805");
          this.sendCacheDumpPayload(clientInfo, this.executeLocalCacheDumpEnvelope());
        }
      } catch (error) {
        if (stryMutAct_9fa48("10806")) {
          {}
        } else {
          stryCov_9fa48("10806");
          const errorCode = this.getErrorCode(error);
          this.sendError(clientInfo, null, errorCode, error.message, error.adminHint, error);
        }
      }
    }
  }

  /**
   * Send error to client.
   * @param {Object} clientInfo - Client information.
   * @param {string|null} queryId - Query ID (if applicable).
   * @param {string} errorCode - Error code.
   * @param {string} errorMessage - Error message.
   * @param {string} hint - Optional hint for resolution.
   * @private
   */
  sendError(clientInfo, queryId, errorCode, errorMessage, hint, options = {}) {
    if (stryMutAct_9fa48("10807")) {
      {}
    } else {
      stryCov_9fa48("10807");
      const message = stryMutAct_9fa48("10808") ? {} : (stryCov_9fa48("10808"), {
        type: queryId ? MessageType.QUERY_RESULT : MessageType.ERROR,
        timestamp: Date.now(),
        error: errorMessage,
        errorCode
      });
      if (stryMutAct_9fa48("10810") ? false : stryMutAct_9fa48("10809") ? true : (stryCov_9fa48("10809", "10810"), queryId)) {
        if (stryMutAct_9fa48("10811")) {
          {}
        } else {
          stryCov_9fa48("10811");
          message.queryId = queryId;
        }
      }
      if (stryMutAct_9fa48("10813") ? false : stryMutAct_9fa48("10812") ? true : (stryCov_9fa48("10812", "10813"), hint)) {
        if (stryMutAct_9fa48("10814")) {
          {}
        } else {
          stryCov_9fa48("10814");
          message.hint = hint;
        }
      }
      if (stryMutAct_9fa48("10817") ? options?.deferRetry !== true : stryMutAct_9fa48("10816") ? false : stryMutAct_9fa48("10815") ? true : (stryCov_9fa48("10815", "10816", "10817"), (stryMutAct_9fa48("10818") ? options.deferRetry : (stryCov_9fa48("10818"), options?.deferRetry)) === (stryMutAct_9fa48("10819") ? false : (stryCov_9fa48("10819"), true)))) {
        if (stryMutAct_9fa48("10820")) {
          {}
        } else {
          stryCov_9fa48("10820");
          message.deferRetry = stryMutAct_9fa48("10821") ? false : (stryCov_9fa48("10821"), true);
        }
      }
      if (stryMutAct_9fa48("10823") ? false : stryMutAct_9fa48("10822") ? true : (stryCov_9fa48("10822", "10823"), Number.isFinite(stryMutAct_9fa48("10824") ? options.retryAfterMs : (stryCov_9fa48("10824"), options?.retryAfterMs)))) {
        if (stryMutAct_9fa48("10825")) {
          {}
        } else {
          stryCov_9fa48("10825");
          message.retryAfterMs = stryMutAct_9fa48("10826") ? Math.min(NUM.ZERO, Math.floor(options.retryAfterMs)) : (stryCov_9fa48("10826"), Math.max(NUM.ZERO, Math.floor(options.retryAfterMs)));
        }
      }
      this.sendToClient(clientInfo, message);
    }
  }

  /**
   * Send message to a specific client.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Message to send.
   * @private
   */
  sendToClient(clientInfo, message) {
    if (stryMutAct_9fa48("10827")) {
      {}
    } else {
      stryCov_9fa48("10827");
      try {
        if (stryMutAct_9fa48("10828")) {
          {}
        } else {
          stryCov_9fa48("10828");
          const json = JSON.stringify(message);
          clientInfo.socket.send(json);
        }
      } catch (error) {
        if (stryMutAct_9fa48("10829")) {
          {}
        } else {
          stryCov_9fa48("10829");
          this.logger.error(ADMIN_LOG_MSG.SEND_FAILED, stryMutAct_9fa48("10830") ? {} : (stryCov_9fa48("10830"), {
            clientId: clientInfo.id,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Broadcast CDC event to all connected clients.
   * @param {string} tableName - Table name.
   * @param {string} operation - CDC operation (insert, update, delete).
   * @param {Object} record - Record data.
   */
  broadcastCDCEvent(tableName, operation, record) {
    if (stryMutAct_9fa48("10831")) {
      {}
    } else {
      stryCov_9fa48("10831");
      const message = stryMutAct_9fa48("10832") ? {} : (stryCov_9fa48("10832"), {
        type: MessageType.CDC_EVENT,
        timestamp: Date.now(),
        table: tableName,
        operation: stryMutAct_9fa48("10833") ? operation.toUpperCase() : (stryCov_9fa48("10833"), operation.toLowerCase()),
        record
      });
      for (const clientInfo of this.clients) {
        if (stryMutAct_9fa48("10834")) {
          {}
        } else {
          stryCov_9fa48("10834");
          this.sendToClient(clientInfo, message);
        }
      }
    }
  }

  /**
   * Get error code from error.
   * @param {Error} error - Error object.
   * @return {string} Error code.
   * @private
   */
  getErrorCode(error) {
    if (stryMutAct_9fa48("10835")) {
      {}
    } else {
      stryCov_9fa48("10835");
      if (stryMutAct_9fa48("10838") ? error || typeof error.adminErrorCode === TYPEOF.STRING : stryMutAct_9fa48("10837") ? false : stryMutAct_9fa48("10836") ? true : (stryCov_9fa48("10836", "10837", "10838"), error && (stryMutAct_9fa48("10840") ? typeof error.adminErrorCode !== TYPEOF.STRING : stryMutAct_9fa48("10839") ? true : (stryCov_9fa48("10839", "10840"), typeof error.adminErrorCode === TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("10841")) {
          {}
        } else {
          stryCov_9fa48("10841");
          return error.adminErrorCode;
        }
      }
      const message = stryMutAct_9fa48("10842") ? error.message.toUpperCase() : (stryCov_9fa48("10842"), error.message.toLowerCase());
      if (stryMutAct_9fa48("10845") ? message.includes(ADMIN_ERROR_MATCH.PARSE) && message.includes(ADMIN_ERROR_MATCH.SYNTAX) : stryMutAct_9fa48("10844") ? false : stryMutAct_9fa48("10843") ? true : (stryCov_9fa48("10843", "10844", "10845"), message.includes(ADMIN_ERROR_MATCH.PARSE) || message.includes(ADMIN_ERROR_MATCH.SYNTAX))) {
        if (stryMutAct_9fa48("10846")) {
          {}
        } else {
          stryCov_9fa48("10846");
          return ErrorCode.SYNTAX_ERROR;
        }
      }
      if (stryMutAct_9fa48("10849") ? message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND) && message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND_CODE) : stryMutAct_9fa48("10848") ? false : stryMutAct_9fa48("10847") ? true : (stryCov_9fa48("10847", "10848", "10849"), message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND) || message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND_CODE))) {
        if (stryMutAct_9fa48("10850")) {
          {}
        } else {
          stryCov_9fa48("10850");
          return ErrorCode.TABLE_NOT_FOUND;
        }
      }
      if (stryMutAct_9fa48("10852") ? false : stryMutAct_9fa48("10851") ? true : (stryCov_9fa48("10851", "10852"), message.includes(ADMIN_ERROR_MATCH.TIMEOUT))) {
        if (stryMutAct_9fa48("10853")) {
          {}
        } else {
          stryCov_9fa48("10853");
          return ErrorCode.TIMEOUT;
        }
      }
      return ErrorCode.INTERNAL_ERROR;
    }
  }

  /**
   * Set the system table cache.
   * @param {Object} cache - System table cache.
   */
  setSystemTableCache(cache) {
    if (stryMutAct_9fa48("10854")) {
      {}
    } else {
      stryCov_9fa48("10854");
      this.systemTableCache = cache;
      // Subscribe to cache notifications when cache is set (Requirement 2.2)
      this.subscribeToCacheNotifications();
    }
  }

  /**
   * Set the SQL query engine.
   * @param {Object} engine - SQL query engine.
   */
  setSQLQueryEngine(engine) {
    if (stryMutAct_9fa48("10855")) {
      {}
    } else {
      stryCov_9fa48("10855");
      this.sqlQueryEngine = engine;
      this.controlPlaneReadinessService = stryMutAct_9fa48("10858") ? this.controlPlaneReadinessService && resolveSqlEngineControlPlaneReadinessService(engine) : stryMutAct_9fa48("10857") ? false : stryMutAct_9fa48("10856") ? true : (stryCov_9fa48("10856", "10857", "10858"), this.controlPlaneReadinessService || resolveSqlEngineControlPlaneReadinessService(engine));
      if (stryMutAct_9fa48("10860") ? false : stryMutAct_9fa48("10859") ? true : (stryCov_9fa48("10859", "10860"), this.controlSnapshot)) {
        if (stryMutAct_9fa48("10861")) {
          {}
        } else {
          stryCov_9fa48("10861");
          this.controlSnapshot.sqlQueryEngine = stryMutAct_9fa48("10864") ? engine && null : stryMutAct_9fa48("10863") ? false : stryMutAct_9fa48("10862") ? true : (stryCov_9fa48("10862", "10863", "10864"), engine || null);
          this.controlSnapshot.controlPlaneReadinessService = stryMutAct_9fa48("10867") ? this.controlSnapshot.controlPlaneReadinessService && this.controlPlaneReadinessService : stryMutAct_9fa48("10866") ? false : stryMutAct_9fa48("10865") ? true : (stryCov_9fa48("10865", "10866", "10867"), this.controlSnapshot.controlPlaneReadinessService || this.controlPlaneReadinessService);
        }
      }
      if (stryMutAct_9fa48("10869") ? false : stryMutAct_9fa48("10868") ? true : (stryCov_9fa48("10868", "10869"), this.preflightSnapshot)) {
        if (stryMutAct_9fa48("10870")) {
          {}
        } else {
          stryCov_9fa48("10870");
          this.preflightSnapshot.sqlQueryEngine = stryMutAct_9fa48("10873") ? engine && null : stryMutAct_9fa48("10872") ? false : stryMutAct_9fa48("10871") ? true : (stryCov_9fa48("10871", "10872", "10873"), engine || null);
        }
      }
      if (stryMutAct_9fa48("10876") ? this.liveQueryManager || typeof this.liveQueryManager.initialize === TYPEOF.FUNCTION : stryMutAct_9fa48("10875") ? false : stryMutAct_9fa48("10874") ? true : (stryCov_9fa48("10874", "10875", "10876"), this.liveQueryManager && (stryMutAct_9fa48("10878") ? typeof this.liveQueryManager.initialize !== TYPEOF.FUNCTION : stryMutAct_9fa48("10877") ? true : (stryCov_9fa48("10877", "10878"), typeof this.liveQueryManager.initialize === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("10879")) {
          {}
        } else {
          stryCov_9fa48("10879");
          this.liveQueryManager.initialize(stryMutAct_9fa48("10880") ? {} : (stryCov_9fa48("10880"), {
            sqlQueryEngine: engine
          }));
        }
      }
      if (stryMutAct_9fa48("10883") ? this.debugMetadataStore || typeof this.debugMetadataStore.setSqlQueryEngine === TYPEOF.FUNCTION : stryMutAct_9fa48("10882") ? false : stryMutAct_9fa48("10881") ? true : (stryCov_9fa48("10881", "10882", "10883"), this.debugMetadataStore && (stryMutAct_9fa48("10885") ? typeof this.debugMetadataStore.setSqlQueryEngine !== TYPEOF.FUNCTION : stryMutAct_9fa48("10884") ? true : (stryCov_9fa48("10884", "10885"), typeof this.debugMetadataStore.setSqlQueryEngine === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("10886")) {
          {}
        } else {
          stryCov_9fa48("10886");
          this.debugMetadataStore.setSqlQueryEngine(engine);
          return;
        }
      }
      if (stryMutAct_9fa48("10889") ? !this.debugMetadataStore || engine : stryMutAct_9fa48("10888") ? false : stryMutAct_9fa48("10887") ? true : (stryCov_9fa48("10887", "10888", "10889"), (stryMutAct_9fa48("10890") ? this.debugMetadataStore : (stryCov_9fa48("10890"), !this.debugMetadataStore)) && engine)) {
        if (stryMutAct_9fa48("10891")) {
          {}
        } else {
          stryCov_9fa48("10891");
          this.debugMetadataStore = new DebugMetadataStore(stryMutAct_9fa48("10892") ? {} : (stryCov_9fa48("10892"), {
            sqlQueryEngine: engine
          }));
          this.debugHandlers.debugMetadataStore = this.debugMetadataStore;
        }
      }
    }
  }

  /**
   * Get the number of connected clients.
   * @return {number} Number of connected clients.
   */
  getClientCount() {
    if (stryMutAct_9fa48("10893")) {
      {}
    } else {
      stryCov_9fa48("10893");
      return this.clients.size;
    }
  }

  /**
   * Get the Fastify instance.
   * @return {Object} Fastify instance.
   */
  getFastify() {
    if (stryMutAct_9fa48("10894")) {
      {}
    } else {
      stryCov_9fa48("10894");
      return this.fastify;
    }
  }

  /**
   * Check if the API is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("10895")) {
      {}
    } else {
      stryCov_9fa48("10895");
      return this.initialized;
    }
  }

  /**
   * Returns whether the API is bound to a TCP port.
   * @return {boolean}
   */
  isListening() {
    if (stryMutAct_9fa48("10896")) {
      {}
    } else {
      stryCov_9fa48("10896");
      return this.listening;
    }
  }

  /**
   * Shutdown the WebSocket server.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("10897")) {
      {}
    } else {
      stryCov_9fa48("10897");
      // Close all client connections
      for (const clientInfo of this.clients) {
        if (stryMutAct_9fa48("10898")) {
          {}
        } else {
          stryCov_9fa48("10898");
          try {
            if (stryMutAct_9fa48("10899")) {
              {}
            } else {
              stryCov_9fa48("10899");
              clientInfo.socket.close();
            }
          } catch (_closeErr) {
            // Ignore close errors during shutdown
          }
        }
      }
      this.clients.clear();
      if (stryMutAct_9fa48("10901") ? false : stryMutAct_9fa48("10900") ? true : (stryCov_9fa48("10900", "10901"), this.fastify)) {
        if (stryMutAct_9fa48("10902")) {
          {}
        } else {
          stryCov_9fa48("10902");
          const server = this.fastify.server;
          // Close all active connections immediately
          if (stryMutAct_9fa48("10905") ? server || typeof server.closeAllConnections === TYPEOF.FUNCTION : stryMutAct_9fa48("10904") ? false : stryMutAct_9fa48("10903") ? true : (stryCov_9fa48("10903", "10904", "10905"), server && (stryMutAct_9fa48("10907") ? typeof server.closeAllConnections !== TYPEOF.FUNCTION : stryMutAct_9fa48("10906") ? true : (stryCov_9fa48("10906", "10907"), typeof server.closeAllConnections === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("10908")) {
              {}
            } else {
              stryCov_9fa48("10908");
              server.closeAllConnections();
            }
          }
          await this.fastify.close();
          // Ensure underlying HTTP server is fully closed
          if (stryMutAct_9fa48("10911") ? server || typeof server.close === TYPEOF.FUNCTION : stryMutAct_9fa48("10910") ? false : stryMutAct_9fa48("10909") ? true : (stryCov_9fa48("10909", "10910", "10911"), server && (stryMutAct_9fa48("10913") ? typeof server.close !== TYPEOF.FUNCTION : stryMutAct_9fa48("10912") ? true : (stryCov_9fa48("10912", "10913"), typeof server.close === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("10914")) {
              {}
            } else {
              stryCov_9fa48("10914");
              await new Promise(resolve => {
                if (stryMutAct_9fa48("10915")) {
                  {}
                } else {
                  stryCov_9fa48("10915");
                  server.close(error => {
                    if (stryMutAct_9fa48("10916")) {
                      {}
                    } else {
                      stryCov_9fa48("10916");
                      if (stryMutAct_9fa48("10919") ? error || error.code !== ERRNO.NOT_RUNNING : stryMutAct_9fa48("10918") ? false : stryMutAct_9fa48("10917") ? true : (stryCov_9fa48("10917", "10918", "10919"), error && (stryMutAct_9fa48("10921") ? error.code === ERRNO.NOT_RUNNING : stryMutAct_9fa48("10920") ? true : (stryCov_9fa48("10920", "10921"), error.code !== ERRNO.NOT_RUNNING)))) {
                        if (stryMutAct_9fa48("10922")) {
                          {}
                        } else {
                          stryCov_9fa48("10922");
                          this.logger.warn(ADMIN_LOG_MSG.SERVER_CLOSE_ERROR, stryMutAct_9fa48("10923") ? {} : (stryCov_9fa48("10923"), {
                            error: error.message
                          }));
                        }
                      }
                      resolve();
                    }
                  });
                }
              });
            }
          }
          // Unref the server to allow process exit
          if (stryMutAct_9fa48("10926") ? server || typeof server.unref === TYPEOF.FUNCTION : stryMutAct_9fa48("10925") ? false : stryMutAct_9fa48("10924") ? true : (stryCov_9fa48("10924", "10925", "10926"), server && (stryMutAct_9fa48("10928") ? typeof server.unref !== TYPEOF.FUNCTION : stryMutAct_9fa48("10927") ? true : (stryCov_9fa48("10927", "10928"), typeof server.unref === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("10929")) {
              {}
            } else {
              stryCov_9fa48("10929");
              server.unref();
            }
          }
          this.fastify = null;
        }
      }
      this.initialized = stryMutAct_9fa48("10930") ? true : (stryCov_9fa48("10930"), false);
      this.logger.info(ADMIN_LOG_MSG.SHUTDOWN, stryMutAct_9fa48("10931") ? {} : (stryCov_9fa48("10931"), {
        nodeId: this.nodeId
      }));
    }
  }
}
export { AdminWebSocketAPI, MessageType, ErrorCode };