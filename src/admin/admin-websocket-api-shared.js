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

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
  createTimeoutBudgetError,
} from '../control-plane/timeout-budget.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  READINESS_SNAPSHOT_KEY,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {getRegisteredControlPlaneSystemTableGateway} from '../control-plane/control-plane-gateway-registry.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {ERRNO, HTTP_STATUS, NUM, TABLES, TYPEOF} from '../constants/index.js';
import {META_SERVICE_ID} from '../constants/wasm-meta.js';
import {TRANSPORT_EVENT} from '../constants/transport.js';
import {CancellationToken} from '../query/cancellation-token.js';
import {createSqlRequest} from '../query/sql-request.js';
import {EXECUTION_MODE} from '../query/sql-adapter-constants.js';
import {guardedAdaptAdminAction} from './admin-api-adapter.js';
import {
  ADMIN_META_ACTION,
  CACHE_DUMP_TABLES,
} from './admin-meta-command-handlers.js';
import {parseLiveSelect} from '../live-query/live-query-service.js';
import {AST_TYPE, EXPR_TYPE, SQLParser} from '../query/sql-parser.js';
import {MUTATION_GUARD_MODE} from './admin-mutation-guard.js';
import {
  ADMIN_SERVICE_OPERATION,
  adaptAdminMessageToServiceMessage,
  isAdminMessageDispatchable,
} from './admin-service-message-adapter.js';
import {AdminTestRunService} from './admin-test-run-service.js';
import {DebugMetadataStore} from '../debug-runtime/debug-metadata-service.js';
import {TraceCollector} from '../debug/trace-collector.js';
import {ENDPOINT_SYNC_UNHEALTHY_POLICY} from '../runtime/endpoint-sync-constants.js';
import {WASM_SERVICE_PROTOCOL} from '../wasm-service/wasm-service-constants.js';

import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_CLIENT,
  ADMIN_CONTENT_TYPE,
  ADMIN_CONFIG_KEY,
  ADMIN_DEFAULT,
  ADMIN_ENFORCEMENT_MODE,
  ADMIN_ERROR_CODE,
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MATCH,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LIMIT,
  ADMIN_LOG_MSG,
  ADMIN_MESSAGE_TYPE,
  ADMIN_QUERY_RESULT,
  ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT,
  ADMIN_SERVICE_DISCOVERY,
  ADMIN_ROUTE,
  ADMIN_STATUS,
  ADMIN_SUBSYSTEM,
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_STREAM_EVENT,
} from './admin-constants.js';
import {normalizeIdentifier, normalizeSql} from './admin-helpers.js';
import {evaluateSharedMetadataNodeCoverage} from './admin-shared-metadata-consistency.js';
import {ControlPlaneSnapshotOwner} from '../control-plane/control-plane-snapshot-owner.js';
import {CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE} from '../control-plane/control-plane-snapshot-owner.js';
import {
  AdminServiceDiscovery,
  parseDiscoveryBooleanQuery,
  parseDiscoveryListQuery,
  parseServiceDiscoverySqlQuery,
} from './admin-service-discovery.js';
import {AdminPreflightSnapshot} from './admin-preflight-snapshot.js';
import {AdminControlSnapshot} from './admin-control-snapshot.js';
import {AdminDebugHandlers} from './admin-debug-handlers.js';

const MessageType = ADMIN_MESSAGE_TYPE;
const ErrorCode = ADMIN_ERROR_CODE;
const HTTP_HEADER = Object.freeze({
  CACHE_CONTROL: 'Cache-Control',
  CONNECTION: 'Connection',
  CONTENT_TYPE: 'Content-Type',
});
const HTTP_HEADER_VALUE = Object.freeze({
  NO_CACHE: 'no-cache',
  NO_STORE: 'no-store',
  KEEP_ALIVE: 'keep-alive',
});
const ADMIN_STREAM_LANE_DEFAULT = 'default';
const ADMIN_STREAM_LANE_LOAD = 'load';
const ADMIN_STREAM_LANE_PROBE = 'probe';
const ADMIN_STREAM_LANE_SNAPSHOT = 'snapshot';
const LOAD_LANE_READINESS_CACHE_MAX_AGE_MS = 5000;
const LOAD_LANE_TABLE_ADMISSION_CACHE_MAX_AGE_MS = 250;
const LOAD_LANE_TABLE_ADMISSION_RETRY_AFTER_MS = 250;
const LOAD_LANE_QUERY_TIMEOUT_CAP_MS = 3000;
const LOAD_LANE_SOFT_ADMISSION_REASON_CODES = new Set([
  'schema_partition_unavailable',
  'leadership_unstable',
]);
const LOAD_LANE_QUERY_ADMISSION_STATE = Object.freeze({
  ADMITTED: 'admitted',
  BLOCKED: 'blocked',
  SNAPSHOT_UNAVAILABLE: 'snapshot_unavailable',
});
const LOAD_LANE_TABLE_ADMISSION_STATE = Object.freeze({
  BENCHMARK_BLOCKED: 'benchmark_blocked',
  DISCOVERY_MISSING: 'local_benchmark_discovery_missing',
  READINESS_BLOCKED: 'readiness_blocked',
  READY: 'ready',
  SOFT_BLOCKER_ADMITTED: 'soft_blocker_admitted',
});
const LOAD_LANE_ADMISSION_REASON_FALLBACK = Object.freeze({
  BENCHMARK_ADMISSION_BLOCKED: 'benchmark_admission_blocked',
  BENCHMARK_READINESS_BLOCKED: 'benchmark_readiness_blocked',
});
const LOAD_LANE_VOTER_READY_REPLICA_ROLES = new Set(['leader', 'follower']);
const SSE_FRAME_PREFIX = 'data: ';
const SSE_FRAME_SUFFIX = '\n\n';
const EMPTY_STRING = '';
const ADMIN_CACHE_OBSERVATION_TABLES = new Set([
  ...CACHE_DUMP_TABLES,
  TABLES.NODE_ENDPOINTS,
]);

const ADMIN_LOCAL_DISPATCH = Object.freeze({
  TARGET_ADDRESS: 'local/admin-websocket-api',
});
const QUERY_RESULT_MESSAGE_KIND = Object.freeze({
  DEFAULT_WRITE: 'default_write',
  ERROR: 'error',
  HOST_CALLBACK: 'host_callback',
  ROWS: 'rows',
  WRITE: 'write',
});
const QUERY_RESULT_WRITE_OPERATIONS = new Set(['delete', 'insert', 'update']);
const ADMIN_ERROR_DETAIL_KEY = Object.freeze({
  LOAD_LANE_ADMISSION: 'loadLaneAdmission',
});

function buildLoadLaneRuntimeAuthoritySummary(runtimeAuthority) {
  if (!runtimeAuthority || typeof runtimeAuthority !== TYPEOF.OBJECT) {
    return null;
  }
  return Object.freeze({
    state:
      typeof runtimeAuthority.state === TYPEOF.STRING ?
        runtimeAuthority.state :
        null,
    ready: runtimeAuthority.ready === true,
    authorityAvailable: runtimeAuthority.authorityAvailable === true,
    visibilityState:
      typeof runtimeAuthority.visibility?.state === TYPEOF.STRING ?
        runtimeAuthority.visibility.state :
        null,
    provisioningState:
      typeof runtimeAuthority.provisioning?.state === TYPEOF.STRING ?
        runtimeAuthority.provisioning.state :
        null,
    failureReason:
      typeof runtimeAuthority.failure?.reason === TYPEOF.STRING ?
        runtimeAuthority.failure.reason :
        null,
    reasonCodes: Array.isArray(runtimeAuthority.reasonCodes) ?
      Object.freeze(
        runtimeAuthority.reasonCodes
          .map((value) => String(value || EMPTY_STRING).trim())
          .filter((value) => value.length > NUM.ZERO),
      ) :
      Object.freeze([]),
  });
}

function buildLoadLaneQueryAdmissionSnapshot(readiness) {
  const hasDimensions = Boolean(
    readiness &&
    typeof readiness === TYPEOF.OBJECT &&
    readiness.dimensions &&
    typeof readiness.dimensions === TYPEOF.OBJECT,
  );
  const reasonCodes = Array.isArray(readiness?.reasons) ?
    readiness.reasons
      .map((reason) => String(reason?.code || EMPTY_STRING).trim())
      .filter((code) => code.length > NUM.ZERO) :
    [];
  return Object.freeze({
    serveEligible:
      hasDimensions &&
      readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] ===
        true,
    reasonCodes,
    [READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY]:
      buildLoadLaneRuntimeAuthoritySummary(readiness?.runtimeAuthority),
    hasDimensions,
  });
}

function resolveLoadLaneQueryAdmissionState(snapshot) {
  if (!snapshot.hasDimensions) {
    return LOAD_LANE_QUERY_ADMISSION_STATE.SNAPSHOT_UNAVAILABLE;
  }
  return snapshot.serveEligible ?
    LOAD_LANE_QUERY_ADMISSION_STATE.ADMITTED :
    LOAD_LANE_QUERY_ADMISSION_STATE.BLOCKED;
}

function buildLoadLaneQueryAdmissionResult(snapshot, state) {
  return Object.freeze({
    state,
    serveEligible: snapshot.serveEligible,
    reasonCodes:
      state === LOAD_LANE_QUERY_ADMISSION_STATE.BLOCKED ?
        snapshot.reasonCodes :
        [],
    [READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY]:
      state === LOAD_LANE_QUERY_ADMISSION_STATE.BLOCKED ?
        snapshot[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY] :
        null,
  });
}

function buildLoadLaneAdmissionErrorDetails(admission) {
  if (!admission || typeof admission !== TYPEOF.OBJECT) {
    return null;
  }
  return Object.freeze({
    [ADMIN_ERROR_DETAIL_KEY.LOAD_LANE_ADMISSION]: Object.freeze({
      serveEligible: admission.serveEligible === true,
      reasonCodes: Array.isArray(admission.reasonCodes) ?
        Object.freeze([...admission.reasonCodes]) :
        Object.freeze([]),
      [READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY]:
        admission[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY] || null,
    }),
  });
}

/**
 * Resolve control-plane readiness service from one SQL engine bundle.
 * @param {Object|null} sqlQueryEngine
 * @return {Object|null}
 */
function resolveSqlEngineControlPlaneReadinessService(sqlQueryEngine) {
  return (
    sqlQueryEngine?.rebalanceCoordinator?.storageAdmissionService
      ?.controlPlaneReadinessService || null
  );
}

/**
 * Build a typed admin-operation error used for websocket responses.
 * @param {string} errorCode
 * @param {string} message
 * @param {string|null} [hint]
 * @return {Error}
 */
function createAdminOperationError(errorCode, message, hint = null) {
  const error = new Error(message);
  error.adminErrorCode = errorCode;
  error.adminHint = hint;
  return error;
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
  const error = createAdminOperationError(
    errorCode,
    message,
    options?.hint || null,
  );
  error.deferRetry = true;
  error.retryAfterMs =
    Number.isFinite(options?.retryAfterMs) && options.retryAfterMs > NUM.ZERO ?
      Math.floor(options.retryAfterMs) :
      LOAD_LANE_TABLE_ADMISSION_RETRY_AFTER_MS;
  if (options?.details && typeof options.details === TYPEOF.OBJECT) {
    error.adminDetails = options.details;
  }
  return error;
}

const SQL_REQUEST_TIMEOUT_BUDGET_COMPLETION_MARGIN_MS = 250;

/**
 * Resolve one optional positive timeout override from message payload.
 * @param {*} value
 * @return {number|null}
 */
function resolveRequestedQueryTimeoutMs(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }
  const normalizedValue = Math.floor(parsedValue);
  if (normalizedValue <= NUM.ZERO) {
    return null;
  }
  return normalizedValue;
}

function resolveSqlRequestTimeoutBudgetMs(timeoutMs) {
  const normalizedTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > NUM.ZERO ?
      Math.floor(timeoutMs) :
      ADMIN_DEFAULT.QUERY_TIMEOUT_MS;
  const trimmedTimeoutMs =
    normalizedTimeoutMs - SQL_REQUEST_TIMEOUT_BUDGET_COMPLETION_MARGIN_MS;
  return trimmedTimeoutMs > NUM.ZERO ? trimmedTimeoutMs : normalizedTimeoutMs;
}

function appendStructuredQueryMetadata(message, value) {
  if (!value || typeof value !== TYPEOF.OBJECT) {
    return;
  }
  if (
    typeof value.outcome === TYPEOF.STRING &&
    value.outcome.length > NUM.ZERO
  ) {
    message.outcome = value.outcome;
  }
  if (
    typeof value.visibilityState === TYPEOF.STRING &&
    value.visibilityState.length > NUM.ZERO
  ) {
    message.visibilityState = value.visibilityState;
  }
  if (
    typeof value.contractState === TYPEOF.STRING &&
    value.contractState.length > NUM.ZERO
  ) {
    message.contractState = value.contractState;
  }
  if (
    typeof value.nextAction === TYPEOF.STRING &&
    value.nextAction.length > NUM.ZERO
  ) {
    message.nextAction = value.nextAction;
  }
  if (value.authoritativeVisibilityConfirmed === true) {
    message.authoritativeVisibilityConfirmed = true;
  }
  if (
    typeof value.reasonCode === TYPEOF.STRING &&
    value.reasonCode.length > NUM.ZERO
  ) {
    message.reasonCode = value.reasonCode;
  }
  if (Array.isArray(value.reasonCodes)) {
    message.reasonCodes = [...value.reasonCodes];
  }
  if (Array.isArray(value.failedDimensions)) {
    message.failedDimensions = [...value.failedDimensions];
  }
  if (
    value.runtimeAuthority &&
    typeof value.runtimeAuthority === TYPEOF.OBJECT
  ) {
    message.runtimeAuthority = value.runtimeAuthority;
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

export const ADMIN_WEBSOCKET_API_SHARED = {
  ADMIN_CACHE_DUMP,
  ADMIN_CACHE_OBSERVATION_TABLES,
  ADMIN_CLIENT,
  ADMIN_CONFIG_KEY,
  ADMIN_CONTENT_TYPE,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_DEFAULT,
  ADMIN_ENFORCEMENT_MODE,
  ADMIN_ERROR_CODE,
  ADMIN_ERROR_DETAIL_KEY,
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MATCH,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LIMIT,
  ADMIN_LOCAL_DISPATCH,
  ADMIN_LOG_MSG,
  ADMIN_MESSAGE_TYPE,
  ADMIN_META_ACTION,
  ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT,
  ADMIN_QUERY_RESULT,
  ADMIN_ROUTE,
  ADMIN_SERVICE_DISCOVERY,
  ADMIN_SERVICE_OPERATION,
  ADMIN_STATUS,
  ADMIN_STREAM_LANE_DEFAULT,
  ADMIN_STREAM_LANE_LOAD,
  ADMIN_STREAM_LANE_PROBE,
  ADMIN_STREAM_LANE_SNAPSHOT,
  ADMIN_SUBSYSTEM,
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_STREAM_EVENT,
  AST_TYPE,
  AdminControlSnapshot,
  AdminDebugHandlers,
  AdminPreflightSnapshot,
  AdminServiceDiscovery,
  AdminTestRunService,
  CACHE_DUMP_TABLES,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_WORKLOAD_CLASS,
  CancellationToken,
  ConfigurationManager,
  ControlPlaneSnapshotOwner,
  DebugMetadataStore,
  EMPTY_STRING,
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
  ERRNO,
  EXECUTION_MODE,
  EXPR_TYPE,
  ErrorCode,
  Fastify,
  HTTP_HEADER,
  HTTP_HEADER_VALUE,
  HTTP_STATUS,
  LOAD_LANE_ADMISSION_REASON_FALLBACK,
  LOAD_LANE_QUERY_ADMISSION_STATE,
  LOAD_LANE_QUERY_TIMEOUT_CAP_MS,
  LOAD_LANE_READINESS_CACHE_MAX_AGE_MS,
  LOAD_LANE_SOFT_ADMISSION_REASON_CODES,
  LOAD_LANE_TABLE_ADMISSION_CACHE_MAX_AGE_MS,
  LOAD_LANE_TABLE_ADMISSION_RETRY_AFTER_MS,
  LOAD_LANE_TABLE_ADMISSION_STATE,
  LOAD_LANE_VOTER_READY_REPLICA_ROLES,
  LoggingService,
  META_SERVICE_ID,
  MUTATION_GUARD_MODE,
  MessageType,
  NUM,
  PRESSURE_GOVERNOR_ACTION,
  PressureGovernor,
  QUERY_RESULT_MESSAGE_KIND,
  QUERY_RESULT_WRITE_OPERATIONS,
  READINESS_SNAPSHOT_KEY,
  SQLParser,
  SQL_REQUEST_TIMEOUT_BUDGET_COMPLETION_MARGIN_MS,
  SSE_FRAME_PREFIX,
  SSE_FRAME_SUFFIX,
  TABLES,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TRANSPORT_EVENT,
  TYPEOF,
  TraceCollector,
  WASM_SERVICE_PROTOCOL,
  adaptAdminMessageToServiceMessage,
  appendStructuredQueryMetadata,
  buildControlPlaneWorkloadProfile,
  buildLoadLaneAdmissionErrorDetails,
  buildLoadLaneQueryAdmissionResult,
  buildLoadLaneQueryAdmissionSnapshot,
  buildLoadLaneRuntimeAuthoritySummary,
  createAdminOperationError,
  createRetryableAdminOperationError,
  createSqlRequest,
  createTimeoutBudget,
  createTimeoutBudgetError,
  evaluateSharedMetadataNodeCoverage,
  getControlPlaneRetryAfterMs,
  getRegisteredControlPlaneSystemTableGateway,
  guardedAdaptAdminAction,
  isAdminMessageDispatchable,
  isRetryableControlPlaneError,
  normalizeIdentifier,
  normalizeSql,
  parseDiscoveryBooleanQuery,
  parseDiscoveryListQuery,
  parseLiveSelect,
  parseServiceDiscoverySqlQuery,
  resolveLoadLaneQueryAdmissionState,
  resolveRequestedQueryTimeoutMs,
  resolveSqlEngineControlPlaneReadinessService,
  resolveSqlRequestTimeoutBudgetMs,
  websocket,
};
