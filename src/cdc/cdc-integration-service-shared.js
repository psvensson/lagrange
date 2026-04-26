/**
 * CDC Integration Service - Routes all system table writes through SQL.
 * Ensures cache consistency by making CDC the single source of truth.
 *
 * Bootstrap-Direct Write Phase:
 * - Seed node uses a bootstrap-direct phase during initial setup
 * - The bootstrap-direct phase enables direct writes to local partitions
 * - Required because system cache is empty during seed node bootstrap
 * - After bootstrap, the service switches to sql-routed steady state
 * Sql-Routed Steady State:
 * - All writes route through SQL query engine
 * - SQL engine uses system cache to find partition leaders
 * - Writes go to partition leader via message router
 * - Partition generates CDC event that updates all caches
 * - Single code path - no fallbacks or legacy mechanisms
 *
 * Requirements: 3.5, 5.6, 5.7, 5.8, 5.9, 5.10
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {
  CDC_OPERATION,
  COLUMN,
  ENTITY_TYPE,
  ERRORS,
  METRICS_LOG_TAG,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SQL,
  STATE,
  STRING,
  TIME_MS,
  TYPEOF,
  ADDRESS,
  PROTOCOL,
} from '../constants/index.js';
import {ENTRYPOINT_DEFAULT} from '../constants/entrypoint.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
  createTimeoutBudgetError,
  getRemainingBudgetMs,
} from '../control-plane/timeout-budget.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from '../control-plane/control-plane-readiness-constants.js';
import {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  CONTROL_PLANE_MUTATION_READINESS_ERROR,
  hasControlPlaneMutationRoutingGapFailureSignature,
} from '../control-plane/control-plane-mutation-readiness-constants.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {
  READ_MODEL_DIVERGENCE_TYPE,
  SQL_RECONCILIATION_REASON,
  buildDivergenceEvent,
} from '../control-plane/read-model-contract.js';
import {canonicalizeSystemTableRow} from '../control-plane/system-row-normalizers.js';
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  normalizeControlPlaneSystemTableVisibilityState,
} from '../control-plane/control-plane-system-table-visibility-constants.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
} from '../control-plane/owner-contract-outcome.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from '../query/query-constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
  getSchemaByTableName,
} from '../bootstrap/system-table-schemas-constants.js';
import {resolveSystemTableMutationDeliveryPriority} from '../bootstrap/system-partition-classification.js';
import {getSystemCachePrimaryKeyFieldOrFallback} from '../cache/system-cache-key-descriptor.js';
import {isTableInternalCachePropagationEnabled} from '../cache/cdc-table-policy.js';
import {CDCEventHandler} from './cdc-event-handler.js';
import {
  CDC_CONFIG_KEY,
  CDC_DEFAULTS,
  CDC_EPOCH_CONFIG_KEY,
  CDC_EVENT,
  CDC_ERROR_MSG,
  CDC_LOG_MSG,
  CDC_OPERATION_LABEL,
  CDC_PRIMARY_KEY,
  CDC_RETRY,
  CDC_SESSION,
  CDC_SKIP_REASON,
  CDC_SOURCE,
  CDC_SQL,
  CDC_STATS_DEFAULT,
  CDC_SUBSYSTEM,
} from './cdc-constants.js';
import {
  WRITE_ROUTER_MODE,
  createBootstrapDirectWriteRouter,
  createSqlWriteRouter,
} from './write-router/index.js';
import {
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  resolveNodeWebSocketAddress,
} from '../transport/node-address-resolution.js';

/**
 * Valid system table names for CDC operations.
 */
const CDC_INTEGRATION_SERVICE_LITERAL = Object.freeze({
  VISIBILITYSTATE: 'visibilityState',
  READY: 'ready',
  DEFERRED: 'deferred',
  LEADER: 'leader',
  LOCAL_PARTITION_QUERY_UNAVAILABLE: 'local_partition_query_unavailable',
  FAILED_TO_READ_AUTHORITATIVE_SYSTEM_TABLE_ROWS_FROM_LOCAL:
    'Failed to read authoritative system table rows from local ',
  PARTITION_REPLICA: 'partition replica',
  QUERY_DATA_PLANE_TRANSPORT_NOT_READY: 'query_data_plane_transport_not_ready',
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE: 'authoritative_row_source_unavailable',
  AUTHORITATIVE_QUERY_FAILED: 'authoritative_query_failed',
  SELECT: 'SELECT',
  EMPTY: '',
  EMPTY_2: ', ',
  EXECUTING_SQL_DIRECTLY_ON_LOCAL_PARTITION_BOOTSTRAP_MODE:
    'Executing SQL directly on local partition (bootstrap mode)',
  CDC_WRITE_ROUTER_IS_NOT_CONFIGURED: 'CDC write router is not configured',
  NO_CONNECTION_TO_NODE: 'No connection to node',
  FAILED_TO_FORWARD_WRITE_TO_LEADER: 'Failed to forward write to leader',
  MESSAGE_TIMEOUT: 'Message timeout',
  VALUE_60: 60,
  VALUE_1000: 1000,
  DIAGNOSED_CACHE_VISIBILITY_GAP_FROM_AUTHORITATIVE_SYSTEM_TABLE_READ:
    'Diagnosed cache visibility gap from authoritative system table read',
  UNKNOWN: 'unknown',
  EMPTY_3: '[]',
  EMPTY_4: '\'',
  EMPTY_5: '"',
  NULL: 'null',
  DEFAULT_VALUE_STATE_NULL: 'null',
  DEFAULT_VALUE_STATE_UNDEFINED: 'undefined',
  DEFAULT_VALUE_STATE_VALUE: 'value',
  TABLE_NAME_EXTRACTION_STATE_FOUND: 'found',
  TABLE_NAME_EXTRACTION_STATE_INVALID_INPUT: 'invalid_input',
  TABLE_NAME_EXTRACTION_STATE_NOT_FOUND: 'not_found',
});
const VALID_SYSTEM_TABLES = Object.values(SYSTEM_TABLE_NAME);
const CDC_OWNER_HANDOFF_ROUTING_ERROR_FRAGMENTS = Object.freeze([
  ERRORS.NO_HANDLER_FOR_ADDRESS,
  ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
  QUERY_ERROR_MSG.NO_ACTIVE_SERVICE_FOR_PARTITION,
  QUERY_ERROR_MSG.QUERY_ROUTING_FAILED,
  'No connection to node',
  'Failed to forward write to leader',
  'Message timeout',
]);
const CDC_OWNER_HANDOFF_CONNECTION_TO_NODE_FRAGMENT = 'Connection to node';
const CDC_OWNER_HANDOFF_CLOSED_FRAGMENT = 'closed';
const CDC_SYSTEM_WRITE_RECOVERY_CANDIDATE_SELECTION_KIND = 'cdc_system_write';

/**
 * CDC operation types.
 */
const CDCOperationType = CDC_OPERATION;

/**
 * Config key for the current epoch in the config table.
 */
const EPOCH_CONFIG_KEY = CDC_EPOCH_CONFIG_KEY;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function materializeNormalizedDefaultValue(result) {
  if (
    result.state === CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE
  ) {
    return result.value;
  }
  if (
    result.state === CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_NULL
  ) {
    return null;
  }
  return undefined;
}

/**
 * Determine whether CDC write-route metrics should be emitted for a table.
 * Metrics for logs table writes are skipped to avoid feedback loops where
 * persisted metrics generate more persisted metrics. Heartbeat-driven writes
 * for nodes and node_endpoints are also excluded to avoid periodic idle noise.
 * @param {string|null} tableName
 * @return {boolean}
 */
const TABLE_WRITE_METRIC_SUPPRESSED_TABLES = new Set([
  SYSTEM_TABLE_NAME.LOGS,
  SYSTEM_TABLE_NAME.NODES,
  SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
]);
const TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES = new Set([
  SYSTEM_TABLE_NAME.LOGS,
]);
const AUTHORITATIVE_FALLBACK_PHASE = Object.freeze({
  BOOTSTRAP: 'bootstrap',
  RECOVERY: 'recovery',
  STEADY_STATE: 'steady_state',
});
const AUTHORITATIVE_FALLBACK_OUTCOME = Object.freeze({
  RECOVERED: 'recovered',
  DIAGNOSED: 'diagnosed',
  FAILED: 'failed',
});
const AUTHORITATIVE_FALLBACK_WINDOW_MS = TIME_MS.MINUTE;
const AUTHORITATIVE_FALLBACK_RECENT_LIMIT = NUM.TEN;
const AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS = 250;
const AUTHORITATIVE_FALLBACK_RETRY_DELAY_MS = 25;
const LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY = Object.freeze({
  ANY_REPLICA: 'any_replica',
  LOCAL_LEADER: 'local_leader',
});
const CDC_INTEGRATION_SERVICE_ERROR = Object.freeze({
  MISSING_CANONICAL_NODE_ENDPOINTS_WEBSOCKET_ADDRESS:
    'Missing canonical node_endpoints websocket address',
});
const QUERY_TRANSPORT_NOT_READY_ERROR_CODE = 'ROUTER_QUERY_TRANSPORT_NOT_READY';
const AUTHORITATIVE_READ_SOURCE = Object.freeze({
  LOCAL_PARTITION_REPLICA: 'local_partition_replica',
  QUERY_TRANSPORT_PREFLIGHT: 'query_transport_preflight',
  OWNER_RPC_LANE: 'owner_rpc_lane',
});
const SYSTEM_TABLE_VISIBILITY_STATE =
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE;
function normalizeSystemTableVisibilityState(value, fallback = null) {
  return normalizeControlPlaneSystemTableVisibilityState(value, fallback);
}
function buildPendingVisibilityTimeoutResult(result = {}) {
  return buildSystemTableVisibilityResult({
    visibilityState:
      SYSTEM_TABLE_VISIBILITY_STATE.AUTHORITATIVE_CONFIRMATION_PENDING,
    pressureAction: result?.pressureAction,
    pressureReason: result?.pressureReason,
    retryAfterMs: result?.retryAfterMs,
  });
}
function resolveSystemTableVisibilityContractOutcome(visibilityState) {
  if (visibilityState === SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    });
  }
  if (
    visibilityState === SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY ||
    visibilityState ===
      SYSTEM_TABLE_VISIBILITY_STATE.AUTHORITATIVE_CONFIRMATION_PENDING
  ) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
    });
  }
  if (visibilityState === SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.READY,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
    });
  }
  return null;
}
function buildSystemTableVisibilityResult(options = {}) {
  const hasExplicitVisibilityState =
    options &&
    typeof options === TYPEOF.OBJECT &&
    Object.hasOwn(options, 'visibilityState');
  const visibilityState = normalizeSystemTableVisibilityState(
    options?.visibilityState,
    hasExplicitVisibilityState ? null : SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
  );
  const contractOutcome =
    resolveSystemTableVisibilityContractOutcome(visibilityState);
  return Object.freeze({
    visibilityState,
    visible: visibilityState === SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
    authoritativeVisibilityConfirmed:
      options?.authoritativeVisibilityConfirmed === true,
    cacheRepaired: options?.cacheRepaired === true,
    contractState: contractOutcome?.contractState || null,
    nextAction: contractOutcome?.nextAction || null,
    pressureAction:
      typeof options?.pressureAction === TYPEOF.STRING ?
        options.pressureAction :
        null,
    pressureReason:
      typeof options?.pressureReason === TYPEOF.STRING ?
        options.pressureReason :
        null,
    retryAfterMs:
      Number.isFinite(options?.retryAfterMs) && options.retryAfterMs > NUM.ZERO ?
        Math.floor(options.retryAfterMs) :
        null,
  });
}
function normalizeSystemTableVisibilityResult(result, fallbackState = null) {
  if (
    result &&
    typeof result === TYPEOF.OBJECT &&
    Object.hasOwn(result, CDC_INTEGRATION_SERVICE_LITERAL.VISIBILITYSTATE)
  ) {
    return buildSystemTableVisibilityResult({
      ...result,
      visibilityState: normalizeSystemTableVisibilityState(
        result.visibilityState,
        fallbackState,
      ),
    });
  }
  return buildSystemTableVisibilityResult({
    visibilityState: fallbackState,
  });
}
function resolveAuthoritativeFallbackOutcome(recovered) {
  return recovered === true ?
    AUTHORITATIVE_FALLBACK_OUTCOME.RECOVERED :
    AUTHORITATIVE_FALLBACK_OUTCOME.DIAGNOSED;
}
function buildCDCNodeJoinedResult(options = {}) {
  const result = {
    processed: options.processed === true,
    nodeId: options.nodeId,
    connected: options.connected === true,
    skipped: options.skipped === true,
  };
  if (options.reason) {
    result.reason = options.reason;
  }
  if (options.error) {
    result.error = options.error;
  }
  if (options.wsAddress) {
    result.wsAddress = options.wsAddress;
  }
  return result;
}
function normalizeDeliveryPriority(value, fallback = null) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    fallback;
}
function buildSystemTableMutationError(result, fallbackMessage) {
  const error = new Error(result?.error || fallbackMessage);
  if (
    typeof result?.errorCode === TYPEOF.STRING &&
    result.errorCode.length > NUM.ZERO
  ) {
    error.code = result.errorCode;
    error.errorCode = result.errorCode;
  }
  if (
    typeof result?.pressureAction === TYPEOF.STRING &&
    result.pressureAction.length > NUM.ZERO
  ) {
    error.pressureAction = result.pressureAction;
  }
  if (
    typeof result?.pressureReason === TYPEOF.STRING &&
    result.pressureReason.length > NUM.ZERO
  ) {
    error.pressureReason = result.pressureReason;
  }
  if (
    typeof result?.outcome === TYPEOF.STRING &&
    result.outcome.length > NUM.ZERO
  ) {
    error.outcome = result.outcome;
  }
  if (
    typeof result?.contractState === TYPEOF.STRING &&
    result.contractState.length > NUM.ZERO
  ) {
    error.contractState = result.contractState;
  }
  if (
    typeof result?.nextAction === TYPEOF.STRING &&
    result.nextAction.length > NUM.ZERO
  ) {
    error.nextAction = result.nextAction;
  }
  if (
    typeof result?.completionState === TYPEOF.STRING &&
    result.completionState.length > NUM.ZERO
  ) {
    error.completionState = result.completionState;
  }
  if (
    typeof result?.reasonCode === TYPEOF.STRING &&
    result.reasonCode.length > NUM.ZERO
  ) {
    error.reasonCode = result.reasonCode;
  }
  if (Array.isArray(result?.reasonCodes)) {
    error.reasonCodes = [...result.reasonCodes];
  }
  if (Array.isArray(result?.failedDimensions)) {
    error.failedDimensions = [...result.failedDimensions];
  }
  if (result?.details && typeof result.details === TYPEOF.OBJECT) {
    error.details = {...result.details};
  }
  if (
    typeof result?.tableName === TYPEOF.STRING &&
    result.tableName.length > NUM.ZERO
  ) {
    error.tableName = result.tableName;
  }
  if (result?.deferRetry === true) {
    error.deferRetry = true;
  }
  if (Number.isFinite(result?.retryAfterMs)) {
    error.retryAfterMs = Math.max(NUM.ZERO, Math.floor(result.retryAfterMs));
    if (error.retryAfterMs > NUM.ZERO) {
      error.deferRetry = true;
    }
  }
  if (
    result?.pressureSummary &&
    typeof result.pressureSummary === TYPEOF.OBJECT
  ) {
    error.pressureSummary = result.pressureSummary;
  }
  if (Array.isArray(result?.participantFailures)) {
    error.participantFailures = result.participantFailures.map((entry) =>
      entry && typeof entry === TYPEOF.OBJECT ? {...entry} : entry,
    );
  }
  if (
    result?.firstFailedParticipant &&
    typeof result.firstFailedParticipant === TYPEOF.OBJECT
  ) {
    error.firstFailedParticipant = {
      ...result.firstFailedParticipant,
    };
  }
  return error;
}
function resolveSystemTableOwnerHandoffFailureTableName(
  value,
  fallbackTableName = null,
) {
  const candidateTableName =
    typeof value?.failedTable === TYPEOF.STRING &&
    value.failedTable.length > NUM.ZERO ?
      value.failedTable :
      typeof value?.tableName === TYPEOF.STRING &&
          value.tableName.length > NUM.ZERO ?
        value.tableName :
        fallbackTableName;
  if (!VALID_SYSTEM_TABLES.includes(candidateTableName)) {
    return null;
  }
  return candidateTableName;
}
function isSystemTableOwnerHandoffFailure(errorLike, fallbackTableName = null) {
  const tableName = resolveSystemTableOwnerHandoffFailureTableName(
    errorLike,
    fallbackTableName,
  );
  if (!tableName) {
    return false;
  }
  const errorCode = getControlPlaneErrorCode(errorLike);
  if (errorCode === QUERY_ERROR_CODE.ROUTER_CONNECTION_CLOSED) {
    return true;
  }
  const errorMessage = getControlPlaneErrorMessage(errorLike);
  if (
    CDC_OWNER_HANDOFF_ROUTING_ERROR_FRAGMENTS.some((fragment) =>
      errorMessage.includes(fragment),
    )
  ) {
    return true;
  }
  return (
    errorMessage.includes(CDC_OWNER_HANDOFF_CONNECTION_TO_NODE_FRAGMENT) &&
    errorMessage.includes(CDC_OWNER_HANDOFF_CLOSED_FRAGMENT)
  );
}
function hasSystemTableOwnerHandoffFailureSignature(
  value = null,
  fallbackTableName = null,
) {
  if (isSystemTableOwnerHandoffFailure(value, fallbackTableName)) {
    return true;
  }
  const participantFailures = Array.isArray(value?.participantFailures) ?
    value.participantFailures :
    [];
  if (
    value?.firstFailedParticipant &&
    typeof value.firstFailedParticipant === TYPEOF.OBJECT &&
    isSystemTableOwnerHandoffFailure(
      value.firstFailedParticipant,
      fallbackTableName,
    )
  ) {
    return true;
  }
  return participantFailures.some(
    (entry) =>
      entry &&
      typeof entry === TYPEOF.OBJECT &&
      isSystemTableOwnerHandoffFailure(entry, fallbackTableName),
  );
}
function sortMutationKeyObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortMutationKeyObject(entry));
  }
  if (!value || typeof value !== TYPEOF.OBJECT) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      accumulator[key] = sortMutationKeyObject(value[key]);
      return accumulator;
    }, {});
}
function stableSerializeMutationKey(value) {
  return JSON.stringify(sortMutationKeyObject(value));
}
function normalizeSystemWriteRecoveryCandidateSelectionKeyValue(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    null;
}
const AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES = Object.freeze([
  'last_heartbeat',
  'lastHeartbeat',
  'ready_lease_expires_at',
  'readyLeaseExpiresAt',
  'updated_at_hlc',
  'updatedAtHlc',
  'schema_version',
  'schemaVersion',
  'updated_at',
  'updatedAt',
  'completed_at',
  'completedAt',
  'created_at',
  'createdAt',
]);
function normalizeAuthoritativeFallbackPhase(value) {
  if (value === AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP) {
    return AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP;
  }
  if (value === AUTHORITATIVE_FALLBACK_PHASE.RECOVERY) {
    return AUTHORITATIVE_FALLBACK_PHASE.RECOVERY;
  }
  return AUTHORITATIVE_FALLBACK_PHASE.STEADY_STATE;
}
function normalizeAuthoritativeFallbackOutcome(value) {
  if (value === AUTHORITATIVE_FALLBACK_OUTCOME.DIAGNOSED) {
    return AUTHORITATIVE_FALLBACK_OUTCOME.DIAGNOSED;
  }
  return value === AUTHORITATIVE_FALLBACK_OUTCOME.FAILED ?
    AUTHORITATIVE_FALLBACK_OUTCOME.FAILED :
    AUTHORITATIVE_FALLBACK_OUTCOME.RECOVERED;
}
function normalizeLocalQueryTransportReadiness(readiness) {
  if (!readiness || typeof readiness !== TYPEOF.OBJECT) {
    return null;
  }
  const ready = readiness.ready === true;
  return {
    state: ready ?
      CDC_INTEGRATION_SERVICE_LITERAL.READY :
      CDC_INTEGRATION_SERVICE_LITERAL.DEFERRED,
    ready,
    reason:
      typeof readiness.reason === TYPEOF.STRING &&
      readiness.reason.length > NUM.ZERO ?
        readiness.reason :
        null,
    retryAfterMs:
      Number.isFinite(readiness.retryAfterMs) &&
      readiness.retryAfterMs > NUM.ZERO ?
        Math.floor(readiness.retryAfterMs) :
        NUM.ZERO,
  };
}
function shouldEmitTableWriteMetric(tableName) {
  return !TABLE_WRITE_METRIC_SUPPRESSED_TABLES.has(tableName);
}
function shouldLogTableWriteFailure(tableName) {
  return !TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES.has(tableName);
}
function normalizeSystemTableWriteMode(service, error) {
  if (
    typeof error?.writeMode === TYPEOF.STRING &&
    error.writeMode.length > NUM.ZERO
  ) {
    return error.writeMode;
  }
  if (
    service?.writeRouter?.mode === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT ||
    service?.bootstrapMode === true
  ) {
    return WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT;
  }
  return WRITE_ROUTER_MODE.SQL_ROUTED;
}
function isCacheVisibilityTimeoutError(error) {
  return (
    error?.timeoutClassification?.classification ===
    TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT
  );
}
function annotateSystemTableMutationError(error, context = {}) {
  if (!error || typeof error !== TYPEOF.OBJECT) {
    return error;
  }
  if (Number.isFinite(context.attempt)) {
    error.attempt = Math.max(NUM.ONE, Math.floor(context.attempt));
  }
  if (
    typeof context.writeMode === TYPEOF.STRING &&
    context.writeMode.length > NUM.ZERO
  ) {
    error.writeMode = context.writeMode;
  }
  if (context.cacheWaitTimedOut === true) {
    error.cacheWaitTimedOut = true;
  }
  return error;
}
function logSystemTableWriteFailure(service, logMessage, details, error) {
  const payload = {
    ...details,
    code: getControlPlaneErrorCode(error) || null,
    retryAfterMs: getControlPlaneRetryAfterMs(error),
    causeId: typeof details?.causeId === TYPEOF.STRING ? details.causeId : null,
    operation:
      typeof details?.operation === TYPEOF.STRING ? details.operation : null,
    writeMode: normalizeSystemTableWriteMode(service, error),
    bootstrapMode:
      service?.writeRouter?.mode === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT ||
      service?.bootstrapMode === true,
    primaryKey: sortMutationKeyObject(details?.primaryKey || null),
    attempt: Number.isFinite(details?.attempt) ?
      Math.max(NUM.ONE, Math.floor(details.attempt)) :
      Number.isFinite(error?.attempt) ?
        Math.max(NUM.ONE, Math.floor(error.attempt)) :
        null,
    cacheWaitTimedOut:
      details?.cacheWaitTimedOut === true ||
      error?.cacheWaitTimedOut === true ||
      isCacheVisibilityTimeoutError(error),
  };
  if (isRetryableControlPlaneError(error)) {
    service.logger.warn(logMessage, payload);
    return;
  }
  service.logger.error(logMessage, payload);
}

/**
 * CDCIntegrationService routes all system table writes through SQL queries.
 * This ensures cache updates only happen via CDC events, maintaining consistency.
 * Queries are routed transparently to wherever the partition leader is.
 *
 * Key architectural constraint:
 * - Components MUST NOT write directly to System_Table_Cache
 * - All writes go through SQL → partition (wherever it is) → CDC → cache
 */

export const CDC_INTEGRATION_SERVICE_SHARED = {
  ADDRESS,
  AUTHORITATIVE_FALLBACK_OUTCOME,
  AUTHORITATIVE_FALLBACK_PHASE,
  AUTHORITATIVE_FALLBACK_RECENT_LIMIT,
  AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS,
  AUTHORITATIVE_FALLBACK_RETRY_DELAY_MS,
  AUTHORITATIVE_FALLBACK_WINDOW_MS,
  AUTHORITATIVE_READ_SOURCE,
  AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES,
  CDCEventHandler,
  CDCOperationType,
  CDC_CONFIG_KEY,
  CDC_DEFAULTS,
  CDC_EPOCH_CONFIG_KEY,
  CDC_ERROR_MSG,
  CDC_EVENT,
  CDC_INTEGRATION_SERVICE_ERROR,
  CDC_INTEGRATION_SERVICE_LITERAL,
  CDC_LOG_MSG,
  CDC_OPERATION,
  CDC_OPERATION_LABEL,
  CDC_OWNER_HANDOFF_CLOSED_FRAGMENT,
  CDC_OWNER_HANDOFF_CONNECTION_TO_NODE_FRAGMENT,
  CDC_OWNER_HANDOFF_ROUTING_ERROR_FRAGMENTS,
  CDC_PRIMARY_KEY,
  CDC_RETRY,
  CDC_SESSION,
  CDC_SKIP_REASON,
  CDC_SOURCE,
  CDC_SQL,
  CDC_STATS_DEFAULT,
  CDC_SUBSYSTEM,
  CDC_SYSTEM_WRITE_RECOVERY_CANDIDATE_SELECTION_KIND,
  COLUMN,
  CONTROL_PLANE_MUTATION_READINESS_ERROR,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  ConfigurationManager,
  ENTITY_TYPE,
  ENTRYPOINT_DEFAULT,
  EPOCH_CONFIG_KEY,
  ERRORS,
  EventEmitter,
  HLCClockService,
  INITIAL_PARTITION_IDS,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  METRICS_LOG_TAG,
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  NUM,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PROTOCOL,
  PressureGovernor,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  READ_MODEL_DIVERGENCE_TYPE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SQL,
  SQL_RECONCILIATION_REASON,
  STATE,
  STRING,
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_VISIBILITY_STATE,
  TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES,
  TABLE_WRITE_METRIC_SUPPRESSED_TABLES,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIME_MS,
  TYPEOF,
  VALID_SYSTEM_TABLES,
  WRITE_ROUTER_MODE,
  annotateSystemTableMutationError,
  buildCDCNodeJoinedResult,
  buildDivergenceEvent,
  buildOwnerContractOutcome,
  buildPendingVisibilityTimeoutResult,
  buildPressureAdmissionFailure,
  buildSystemTableMutationError,
  buildSystemTableVisibilityResult,
  canonicalizeSystemTableRow,
  createBootstrapDirectWriteRouter,
  createSqlWriteRouter,
  createTimeoutBudget,
  createTimeoutBudgetError,
  delay,
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  getRemainingBudgetMs,
  getSchemaByTableName,
  getSystemCachePrimaryKeyFieldOrFallback,
  hasControlPlaneMutationRoutingGapFailureSignature,
  hasSystemTableOwnerHandoffFailureSignature,
  isCacheVisibilityTimeoutError,
  isRetryableControlPlaneError,
  isSystemTableOwnerHandoffFailure,
  isTableInternalCachePropagationEnabled,
  logSystemTableWriteFailure,
  materializeNormalizedDefaultValue,
  normalizeAuthoritativeFallbackOutcome,
  normalizeAuthoritativeFallbackPhase,
  normalizeControlPlaneSystemTableVisibilityState,
  normalizeDeliveryPriority,
  normalizeLocalQueryTransportReadiness,
  normalizeSystemTableVisibilityResult,
  normalizeSystemTableVisibilityState,
  normalizeSystemTableWriteMode,
  normalizeSystemWriteRecoveryCandidateSelectionKeyValue,
  resolveAuthoritativeFallbackOutcome,
  resolveNodeWebSocketAddress,
  resolveSystemTableMutationDeliveryPriority,
  resolveSystemTableOwnerHandoffFailureTableName,
  resolveSystemTableVisibilityContractOutcome,
  shouldEmitTableWriteMetric,
  shouldLogTableWriteFailure,
  sortMutationKeyObject,
  stableSerializeMutationKey,
  uuidv4,
};
