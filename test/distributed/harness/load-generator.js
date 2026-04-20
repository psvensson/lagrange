/**
 * Load Generator — drives SQL traffic against the cluster via
 * Admin API WebSocket connections on node handles.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import {randomUUID} from 'node:crypto';
import {LOAD_DEFAULTS} from './constants.js';
import {
  LOAD_NODE_AVAILABILITY_STATE,
  buildLoadNodeAvailabilitySnapshot,
  resolveLoadNodeAvailabilityState,
} from './load-node-availability.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../../src/control-plane/control-plane-error-classification.js';
import {
  createLoadGeneratorRuntimeBundle,
} from './load-generator-runtime-methods.js';

const DURATION_SECONDS_SUFFIX = 's';
const DURATION_MINUTES_SUFFIX = 'm';
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const MIN_DISPATCH_DELAY_MS = 1;
const PERCENTILE_P50 = 0.5;
const PERCENTILE_P95 = 0.95;
const PERCENTILE_P99 = 0.99;
const ZERO = 0;
const ONE = 1;
const IN_FLIGHT_PER_NODE = 2;
const DRAIN_WAIT_MS = 10;
const MAX_DISPATCHES_PER_TICK = 64;
const MAX_DISTINCT_ERROR_MESSAGES = 10;
const NODE_FAILURE_THRESHOLD_DEFAULT = 3;
const NODE_FAILURE_COOLDOWN_MS_DEFAULT = 5000;
const QUERY_TIMEOUT_MS_DEFAULT = 2000;
const ADMISSION_BACKOFF_MS_DEFAULT = 250;
const EXTERNAL_ADMISSION_DIAGNOSTICS_MAX_AGE_MS_DEFAULT = 5000;
const NODE_BREAKER_OWNER_NODE_CLIENT = 'node-client';
const NODE_CLIENT_ADMISSION_ERROR_CIRCUIT_OPEN = 'circuit_open';
const NODE_CLIENT_ADMISSION_ERROR_BUDGET_EXHAUSTED = 'budget_exhausted';
const NODE_CLIENT_ADMISSION_ERROR_ROUTING_NOT_READY = 'routing_not_ready';
const UNDISPATCHED_REASON_CAPACITY = 'capacity';
const UNDISPATCHED_REASON_DURATION_TIMEOUT = 'durationTimeout';
const UNDISPATCHED_REASON_CANCELLED = 'cancelled';
const ADAPTIVE_DISPATCH_GUARDRAIL_SCORE_MAX = 3;
const ADAPTIVE_DISPATCH_GUARDRAIL_PRESSURE_SIGNAL_THRESHOLD_DEFAULT = 4;
const ADAPTIVE_DISPATCH_GUARDRAIL_QUEUE_DEPTH_THRESHOLD_DEFAULT = 16;
const ADAPTIVE_DISPATCH_GUARDRAIL_REDUCTION_STEP_RATIO_DEFAULT = 0.25;
const ADAPTIVE_DISPATCH_GUARDRAIL_MIN_MAX_IN_FLIGHT_RATIO_DEFAULT = 0.25;
const ADAPTIVE_DISPATCH_GUARDRAIL_RECOVERY_QUIET_TICKS_DEFAULT = 8;
const DISPATCH_STOP_REASON_TARGET = 'target';
const DISPATCH_STOP_REASON_DURATION = 'duration';
const DISPATCH_STOP_REASON_CANCELLED = 'cancelled';
const REJECTED_REASON_QUEUE_FULL = 'queueFull';
const REJECTED_REASON_FLOW_CONTROL = 'flowControl';
const WAIT_REASON_NODE_SLOT_UNAVAILABLE = 'nodeSlotUnavailable';
const WAIT_REASON_NODE_ADMISSION_BLOCKED = 'nodeAdmissionBlocked';
const WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE =
  'retryableControlPlanePressure';
const WAIT_REASON_TIMEOUT_WAITS = 'timeoutWaits';
const WAIT_REASON_QUEUE_CAPACITY_REJECTED = 'queueCapacityRejected';
const TIMEOUT_ERROR_PATTERN = /timeout|timed out|deadline exceeded|etimedout/i;
const LOAD_LANE_TRANSIENT_TIMEOUT_FRAGMENT = 'query timeout after';
const LOAD_LANE_TRANSIENT_CONNECTION_FRAGMENT = 'connection closed';
const ADMIN_LANE_LOAD = 'load';

const LOAD_TABLE_NAME = 'logs';
const LOAD_TABLE_BENCHMARK_EVENTS = 'benchmark_events';
const LOAD_NODE_ID = 'load-generator';
const LOAD_LOG_ID_PREFIX = 'load-';
const LOG_LEVEL_INFO = 'info';
const INSERT_OP = 'INSERT';
const SELECT_OP = 'SELECT';
const UPDATE_OP = 'UPDATE';
const DELETE_OP = 'DELETE';
const WORKLOAD_PROFILE_DEFAULT = 'default';
const WORKLOAD_PROFILE_BENCHMARK_EVENTS = 'benchmark_events_mixed';
const BENCHMARK_PAYLOAD_MODULO = 100000;
const BENCHMARK_EVENT_ID_PREFIX = 'bench-';
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ADMISSION_AWARE_QUEUE_MULTIPLIER_DEFAULT = 2;

const DEFAULT_OPERATIONS = Object.freeze([
  INSERT_OP,
  SELECT_OP,
  UPDATE_OP,
  DELETE_OP,
]);

const BENCHMARK_OPERATIONS = Object.freeze([
  INSERT_OP,
  SELECT_OP,
]);

const RETRY_SAFE_OPERATIONS = new Set([
  SELECT_OP,
]);

const BENCHMARK_RETRY_SAFE_OPERATIONS = new Set([
  INSERT_OP,
  SELECT_OP,
]);

const LOAD_GENERATOR_RUNTIME_BUNDLE = createLoadGeneratorRuntimeBundle({
  ADMISSION_AWARE_QUEUE_MULTIPLIER_DEFAULT,
  ADMIN_LANE_LOAD,
  DISPATCH_STOP_REASON_CANCELLED,
  DISPATCH_STOP_REASON_DURATION,
  DRAIN_WAIT_MS,
  DURATION_MINUTES_SUFFIX,
  DURATION_SECONDS_SUFFIX,
  IDENTIFIER_PATTERN,
  LOAD_LANE_TRANSIENT_CONNECTION_FRAGMENT,
  LOAD_LANE_TRANSIENT_TIMEOUT_FRAGMENT,
  LOAD_NODE_AVAILABILITY_STATE,
  LOAD_TABLE_NAME,
  MAX_DISTINCT_ERROR_MESSAGES,
  MS_PER_SECOND,
  NODE_BREAKER_OWNER_NODE_CLIENT,
  NODE_CLIENT_ADMISSION_ERROR_BUDGET_EXHAUSTED,
  NODE_CLIENT_ADMISSION_ERROR_CIRCUIT_OPEN,
  NODE_CLIENT_ADMISSION_ERROR_ROUTING_NOT_READY,
  PERCENTILE_P50,
  PERCENTILE_P95,
  PERCENTILE_P99,
  REJECTED_REASON_FLOW_CONTROL,
  REJECTED_REASON_QUEUE_FULL,
  SECONDS_PER_MINUTE,
  UNDISPATCHED_REASON_CANCELLED,
  UNDISPATCHED_REASON_CAPACITY,
  UNDISPATCHED_REASON_DURATION_TIMEOUT,
  WAIT_REASON_NODE_ADMISSION_BLOCKED,
  WAIT_REASON_NODE_SLOT_UNAVAILABLE,
  WAIT_REASON_QUEUE_CAPACITY_REJECTED,
  WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE,
  WAIT_REASON_TIMEOUT_WAITS,
  ZERO,
  ONE,
  buildLoadNodeAvailabilitySnapshot,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
  isTimeoutShapedError,
  resolveLoadNodeAvailabilityState,
});

const {
  computeMetrics,
  createWaitReasonCounters,
  loadRunRuntimeMethods: LOAD_RUN_RUNTIME_METHODS,
  normalizePositiveInteger,
  normalizeRatio,
  normalizeTableName,
  parseDuration,
} = LOAD_GENERATOR_RUNTIME_BUNDLE;

/**
 * Build one load operation descriptor for the given operation type and counter.
 * @param {string} operation - One of INSERT, SELECT, UPDATE, DELETE
 * @param {number} counter - Monotonic operation counter
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @param {string} [options.workloadProfile]
 * @returns {{sql: string, acknowledgedWriteId: string|null}}
 */
function buildLoadOperationDescriptor(operation, counter, options = {}) {
  const workloadProfile = String(
    options.workloadProfile || WORKLOAD_PROFILE_DEFAULT,
  );
  const tableName = normalizeTableName(
    options.tableName,
    workloadProfile === WORKLOAD_PROFILE_BENCHMARK_EVENTS ?
      LOAD_TABLE_BENCHMARK_EVENTS :
      LOAD_TABLE_NAME,
  );
  if (workloadProfile === WORKLOAD_PROFILE_BENCHMARK_EVENTS) {
    const eventIdPrefix = typeof options.eventIdPrefix === 'string' &&
      options.eventIdPrefix.length > ZERO ?
      options.eventIdPrefix :
      BENCHMARK_EVENT_ID_PREFIX;
    const eventId = eventIdPrefix + counter;
    const payload = counter % BENCHMARK_PAYLOAD_MODULO;
    const timestamp = Date.now();
    switch (operation) {
    case INSERT_OP:
      return {
        sql: `INSERT OR IGNORE INTO ${tableName} ` +
          '(event_id, payload, created_at) VALUES (' +
          `'${eventId}', ${payload}, ${timestamp})`,
        acknowledgedWriteId: eventId,
      };
    case SELECT_OP:
      return {
        sql: `SELECT count(*) FROM ${tableName} ` +
          `WHERE payload = ${payload}`,
        acknowledgedWriteId: null,
      };
    case UPDATE_OP:
      return {
        sql: `UPDATE ${tableName} ` +
          `SET created_at = ${timestamp} ` +
          `WHERE event_id = '${eventId}'`,
        acknowledgedWriteId: null,
      };
    case DELETE_OP:
      return {
        sql: `DELETE FROM ${tableName} ` +
          `WHERE event_id = '${eventId}'`,
        acknowledgedWriteId: null,
      };
    default:
      return {
        sql: 'SELECT 1',
        acknowledgedWriteId: null,
      };
    }
  }

  const logIdPrefix = typeof options.logIdPrefix === 'string' &&
    options.logIdPrefix.length > ZERO ?
    options.logIdPrefix :
    LOAD_LOG_ID_PREFIX;
  const logId = `${logIdPrefix}${counter}`;
  const timestamp = Date.now();
  switch (operation) {
  case INSERT_OP:
    return {
      sql: `INSERT INTO ${tableName} ` +
        '(log_id, timestamp, level, node_id, message, created_at) VALUES (' +
        `'${logId}', ${timestamp}, '${LOG_LEVEL_INFO}', ` +
        `'${LOAD_NODE_ID}', '${logId}', ${timestamp})`,
      acknowledgedWriteId: logId,
    };
  case SELECT_OP:
    return {
      sql: `SELECT * FROM ${tableName} ` +
        `WHERE log_id = '${logId}' LIMIT 1`,
      acknowledgedWriteId: null,
    };
  case UPDATE_OP:
    return {
      sql: `UPDATE ${tableName} ` +
        `SET message = 'updated-${counter}' ` +
        `WHERE log_id = '${logId}'`,
      acknowledgedWriteId: null,
    };
  case DELETE_OP:
    return {
      sql: `DELETE FROM ${tableName} ` +
        `WHERE log_id = '${logId}'`,
      acknowledgedWriteId: null,
    };
  default:
    return {
      sql: 'SELECT 1',
      acknowledgedWriteId: null,
    };
  }
}

function isRetrySafeOperation(operation) {
  return RETRY_SAFE_OPERATIONS.has(String(operation || '').toUpperCase());
}

function isBenchmarkRetrySafeOperation(operation, workloadProfile) {
  if (String(workloadProfile || '') !== WORKLOAD_PROFILE_BENCHMARK_EVENTS) {
    return false;
  }
  return BENCHMARK_RETRY_SAFE_OPERATIONS.has(
    String(operation || '').toUpperCase(),
  );
}

function isTimeoutShapedError(error) {
  const message = String(error?.message || error || '');
  if (TIMEOUT_ERROR_PATTERN.test(message)) {
    return true;
  }
  const code = String(error?.code || '').toUpperCase();
  return code === 'ETIMEDOUT';
}

/**
 * Compute percentile from a sorted array of numbers.
 * @param {Array<number>} sorted - Sorted latency values
 * @param {number} percentile - Percentile (0-1)
 * @returns {number} Value at percentile
 */
class LoadRun {
  /**
   * @param {Array<Object>} nodes - NodeHandle instances
   * @param {Object} options
   * @param {number} options.opsPerSec - Target operations per second
   * @param {number} options.durationMs - Duration in milliseconds
   * @param {Array<string>} options.operations - SQL operation types
   * @param {Function} [options.nodeResolver] - Synchronous resolver that
   *   can refresh the currently available node set mid-run.
   * @param {number} [options.maxInFlight] - Optional in-flight cap
   * @param {string} [options.tableName]
   * @param {string} [options.workloadProfile]
   * @param {number} [options.nodeFailureThreshold] - Consecutive
   *   failures before a node is temporarily ejected.
   * @param {number} [options.nodeFailureCooldownMs] - Circuit-breaker
   *   cooldown duration.
   * @param {number} [options.queryTimeoutMs] - Load query timeout
   *   for timeout-aware node handles.
   * @param {number} [options.nodeMaxInFlight] - Per-node in-flight cap to
   *   prevent one node from monopolizing global concurrency.
   * @param {number} [options.maxPendingQueueDepth] - Optional max
   *   dispatch queue depth before overload rejection.
   * @param {boolean} [options.earlyRejectOnQueueFull] - Reject
   *   scheduled operations when pending queue exceeds depth.
   * @param {boolean} [options.trackAcknowledgedWrites] - Retain successful
   *   INSERT identifiers for post-recovery visibility assertions.
   * @param {boolean} [options.admissionAwareScheduling] - Convert overload
   *   into bounded flow-control rejections instead of unbounded scheduler
   *   backlog.
   * @param {Object|boolean} [options.adaptiveDispatchGuardrail] -
   *   Adaptive dispatch guardrail settings for control-plane pressure.
   */
  constructor(nodes, options) {
    const initialAvailableNodes = Array.isArray(nodes) ?
      nodes.filter((node) => node && typeof node === 'object') :
      [];
    this._nodes = [...nodes];
    this._availableNodes = [];
    this._opsPerSec = options.opsPerSec;
    this._durationMs = options.durationMs;
    this._operations = options.operations;
    this._tableName = options.tableName || LOAD_TABLE_NAME;
    this._workloadProfile =
      options.workloadProfile || WORKLOAD_PROFILE_DEFAULT;
    this._eventIdPrefix = typeof options.eventIdPrefix === 'string' &&
      options.eventIdPrefix.length > ZERO ?
      options.eventIdPrefix :
      BENCHMARK_EVENT_ID_PREFIX;
    this._logIdPrefix = typeof options.logIdPrefix === 'string' &&
      options.logIdPrefix.length > ZERO ?
      options.logIdPrefix :
      LOAD_LOG_ID_PREFIX;
    this._trackAcknowledgedWrites = options.trackAcknowledgedWrites === true;
    this._acknowledgedWriteIdColumn = this._trackAcknowledgedWrites ?
      (this._workloadProfile === WORKLOAD_PROFILE_BENCHMARK_EVENTS ?
        'event_id' :
        'log_id') :
      null;
    this._acknowledgedWriteIds = this._trackAcknowledgedWrites ? [] : null;
    this._acknowledgedWriteIdSet =
      this._trackAcknowledgedWrites ? new Set() : null;
    this._maxInFlight = options.maxInFlight ||
      initialAvailableNodes.length * IN_FLIGHT_PER_NODE;
    this._nodeFailureThreshold =
      Number.isInteger(options.nodeFailureThreshold) &&
      options.nodeFailureThreshold > ZERO ?
        options.nodeFailureThreshold :
        NODE_FAILURE_THRESHOLD_DEFAULT;
    this._nodeFailureCooldownMs =
      Number.isInteger(options.nodeFailureCooldownMs) &&
      options.nodeFailureCooldownMs > ZERO ?
        options.nodeFailureCooldownMs :
        NODE_FAILURE_COOLDOWN_MS_DEFAULT;
    this._admissionBackoffMs =
      Number.isInteger(options.admissionBackoffMs) &&
      options.admissionBackoffMs > ZERO ?
        options.admissionBackoffMs :
        ADMISSION_BACKOFF_MS_DEFAULT;
    this._queryTimeoutMs =
      Number.isInteger(options.queryTimeoutMs) &&
      options.queryTimeoutMs > ZERO ?
        options.queryTimeoutMs :
        QUERY_TIMEOUT_MS_DEFAULT;
    this._externalAdmissionDiagnosticsMaxAgeMs = normalizePositiveInteger(
      options.externalAdmissionDiagnosticsMaxAgeMs,
      EXTERNAL_ADMISSION_DIAGNOSTICS_MAX_AGE_MS_DEFAULT,
    );
    this._nodeResolver =
      typeof options.nodeResolver === 'function' ?
        options.nodeResolver :
        null;
    this._dispatchIntervalMs = this._opsPerSec > ZERO ?
      MS_PER_SECOND / this._opsPerSec :
      MS_PER_SECOND;
    this._admissionAwareScheduling =
      options.admissionAwareScheduling === true;
    this._maxPendingQueueDepth =
      Number.isInteger(options.maxPendingQueueDepth) &&
      options.maxPendingQueueDepth >= ZERO ?
        options.maxPendingQueueDepth :
        null;
    this._earlyRejectOnQueueFull =
      options.earlyRejectOnQueueFull === true ||
      (options.earlyRejectOnQueueFull !== false &&
        this._admissionAwareScheduling === true);
    this._targetOperationCount = Math.max(
      ZERO,
      Math.floor((this._durationMs * this._opsPerSec) / MS_PER_SECOND),
    );

    this._latencies = [];
    this._successCount = ZERO;
    this._failedCount = ZERO;
    this._operationErrorCount = ZERO;
    this._attemptErrorCount = ZERO;
    this._suppressedRetrySafeAttemptErrorCount = ZERO;
    this._suppressedRetrySafeTimeoutWaitCount = ZERO;
    this._distinctErrorSet = new Set();
    this._distinctErrors = [];
    this._queueDelaySamples = [];
    this._pendingQueueDepthSamples = [];
    this._waitReasons = createWaitReasonCounters();
    this._rejectedOperations = ZERO;
    this._rejectedByReason = {
      [REJECTED_REASON_QUEUE_FULL]: ZERO,
      [REJECTED_REASON_FLOW_CONTROL]: ZERO,
    };
    this._dispatchedOperationCount = ZERO;
    this._counter = ZERO;
    this._nextNodeIndex = ZERO;
    this._inFlight = ZERO;
    this._cancelled = false;
    this._startTime = null;
    this._dispatchTimerId = null;
    this._nextDispatchAtMs = null;
    this._schedulingStopped = false;
    this._dispatchStoppedBy = '';
    this._durationTimeoutId = null;
    this._drainTimerId = null;
    this._completePromise = null;
    this._resolveComplete = null;
    this._completedMetrics = null;
    this._nodeHealthKeys = [];
    this._nodeHealthByKey = new Map();
    this._nodeInFlightByKey = new Map();
    this._nodeInFlightTokensByKey = new Map();
    this._nodeMetricsByKey = new Map();
    this._nextNodeInFlightTokenId = ONE;
    const derivedNodeMaxInFlight = initialAvailableNodes.length > ZERO ?
      Math.max(ONE, Math.ceil(this._maxInFlight / initialAvailableNodes.length)) :
      ONE;
    this._nodeMaxInFlight =
      Number.isInteger(options.nodeMaxInFlight) &&
      options.nodeMaxInFlight > ZERO ?
        options.nodeMaxInFlight :
        derivedNodeMaxInFlight;
    this._adaptiveDispatchGuardrail =
      this._createAdaptiveDispatchGuardrailState(
        options.adaptiveDispatchGuardrail,
      );
    this._replaceAvailableNodes(nodes);
  }

  _normalizeResolvedNodes(nodes) {
    if (!Array.isArray(nodes)) {
      return [];
    }
    return nodes.filter((node) => node && typeof node === 'object');
  }

  _resolveNodeHealthKey(node, index) {
    const nodeId = String(node?.id || '').trim();
    return nodeId.length > ZERO ?
      'node-' + nodeId :
      'node-index-' + String(index);
  }

  _createNodeHealthState(node) {
    return {
      consecutiveFailures: ZERO,
      openUntilMs: ZERO,
      localBreakerOwner: this._resolveNodeBreakerOwner(node),
      admissionBlockedUntilMs: ZERO,
    };
  }

  _createNodeMetricsState(node) {
    return {
      nodeId: String(node?.id || 'unknown'),
      dispatched: ZERO,
      success: ZERO,
      attemptErrors: ZERO,
      admissionSignals: ZERO,
      queuePressureSignals: ZERO,
      waitReasons: createWaitReasonCounters(),
      rejected: ZERO,
      rejectedByReason: {
        [REJECTED_REASON_QUEUE_FULL]: ZERO,
        [REJECTED_REASON_FLOW_CONTROL]: ZERO,
      },
    };
  }

  _replaceAvailableNodes(nodes) {
    const normalizedNodes = this._normalizeResolvedNodes(nodes);
    const previousHealthByKey = this._nodeHealthByKey;
    const previousInFlightByKey = this._nodeInFlightByKey;
    const previousInFlightTokensByKey = this._nodeInFlightTokensByKey;
    const previousMetricsByKey = this._nodeMetricsByKey;
    const nextAvailableNodes = [];
    const nextNodeHealthKeys = [];
    const nextNodeHealthByKey = new Map();
    const nextNodeInFlightByKey = new Map();
    const nextNodeInFlightTokensByKey = new Map();
    const nextNodeMetricsByKey = new Map();
    const seenKeys = new Set();

    for (let index = ZERO; index < normalizedNodes.length; index++) {
      const node = normalizedNodes[index];
      const key = this._resolveNodeHealthKey(node, index);
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      nextAvailableNodes.push(node);
      nextNodeHealthKeys.push(key);
      nextNodeHealthByKey.set(
        key,
        previousHealthByKey.get(key) || this._createNodeHealthState(node),
      );
      nextNodeInFlightByKey.set(
        key,
        previousInFlightByKey.get(key) || ZERO,
      );
      nextNodeInFlightTokensByKey.set(
        key,
        previousInFlightTokensByKey.get(key) || [],
      );
      nextNodeMetricsByKey.set(
        key,
        previousMetricsByKey.get(key) || this._createNodeMetricsState(node),
      );
    }

    for (const [key, state] of previousHealthByKey.entries()) {
      if (!nextNodeHealthByKey.has(key)) {
        nextNodeHealthByKey.set(key, state);
      }
    }
    for (const [key, inFlight] of previousInFlightByKey.entries()) {
      if (!nextNodeInFlightByKey.has(key)) {
        nextNodeInFlightByKey.set(key, inFlight);
      }
    }
    for (const [key, tokens] of previousInFlightTokensByKey.entries()) {
      if (!nextNodeInFlightTokensByKey.has(key)) {
        nextNodeInFlightTokensByKey.set(key, tokens);
      }
    }
    for (const [key, metrics] of previousMetricsByKey.entries()) {
      if (!nextNodeMetricsByKey.has(key)) {
        nextNodeMetricsByKey.set(key, metrics);
      }
    }

    this._availableNodes = nextAvailableNodes;
    this._nodeHealthKeys = nextNodeHealthKeys;
    this._nodeHealthByKey = nextNodeHealthByKey;
    this._nodeInFlightByKey = nextNodeInFlightByKey;
    this._nodeInFlightTokensByKey = nextNodeInFlightTokensByKey;
    this._nodeMetricsByKey = nextNodeMetricsByKey;
  }

  _syncAvailableNodesFromResolver() {
    if (typeof this._nodeResolver !== 'function') {
      return;
    }
    let resolvedNodes;
    try {
      resolvedNodes = this._nodeResolver();
    } catch (_error) {
      return;
    }
    const normalizedNodes = this._normalizeResolvedNodes(resolvedNodes);
    const nextKeys = normalizedNodes.map((node, index) =>
      this._resolveNodeHealthKey(node, index),
    );
    const noStructuralChange =
      nextKeys.length === this._nodeHealthKeys.length &&
      nextKeys.every((key, index) =>
        key === this._nodeHealthKeys[index] &&
        normalizedNodes[index] === this._availableNodes[index],
      );
    if (noStructuralChange) {
      return;
    }
    this._replaceAvailableNodes(normalizedNodes);
  }

  _resolveNodeBreakerOwner(node) {
    const breakerOwner = String(node?.breakerOwner || '').trim().toLowerCase();
    return breakerOwner === NODE_BREAKER_OWNER_NODE_CLIENT ?
      NODE_BREAKER_OWNER_NODE_CLIENT :
      '';
  }

  _createAdaptiveDispatchGuardrailState(config) {
    const configObject = config && typeof config === 'object' ?
      config :
      {};
    const enabled = config === true || configObject.enabled === true;
    if (enabled !== true) {
      return {
        enabled: false,
      };
    }
    const pressureSignalThreshold = normalizePositiveInteger(
      configObject.pressureSignalThreshold,
      ADAPTIVE_DISPATCH_GUARDRAIL_PRESSURE_SIGNAL_THRESHOLD_DEFAULT,
    );
    const queueDepthThreshold = normalizePositiveInteger(
      configObject.queueDepthThreshold,
      ADAPTIVE_DISPATCH_GUARDRAIL_QUEUE_DEPTH_THRESHOLD_DEFAULT,
    );
    const reductionStepRatio = normalizeRatio(
      configObject.reductionStepRatio,
      ADAPTIVE_DISPATCH_GUARDRAIL_REDUCTION_STEP_RATIO_DEFAULT,
    );
    const recoveryQuietTicks = normalizePositiveInteger(
      configObject.recoveryQuietTicks,
      ADAPTIVE_DISPATCH_GUARDRAIL_RECOVERY_QUIET_TICKS_DEFAULT,
    );
    const defaultMinMaxInFlight = Math.max(
      ONE,
      Math.floor(
        this._maxInFlight * ADAPTIVE_DISPATCH_GUARDRAIL_MIN_MAX_IN_FLIGHT_RATIO_DEFAULT,
      ),
    );
    const minMaxInFlight = Math.max(
      ONE,
      Math.min(
        this._maxInFlight,
        normalizePositiveInteger(
          configObject.minMaxInFlight,
          defaultMinMaxInFlight,
        ),
      ),
    );
    return {
      enabled: true,
      pressureSignalThreshold,
      queueDepthThreshold,
      reductionStepRatio,
      recoveryQuietTicks,
      minMaxInFlight,
      pressureScore: ZERO,
      quietTicks: ZERO,
      lastPressureSignalsTotal: ZERO,
      currentEffectiveMaxInFlight: this._maxInFlight,
      minEffectiveMaxInFlight: this._maxInFlight,
      currentEffectiveDispatchIntervalMs: this._dispatchIntervalMs,
      maxEffectiveDispatchIntervalMs: this._dispatchIntervalMs,
      engagedTransitions: ZERO,
      recoveryTransitions: ZERO,
      maxPressureSignalsDelta: ZERO,
      maxPendingQueueDepth: ZERO,
    };
  }

  _updateAdaptiveDispatchGuardrail(nowMs) {
    const state = this._adaptiveDispatchGuardrail;
    if (!state || state.enabled !== true) {
      return;
    }
    const pressureSignalsTotal =
      Number(this._waitReasons[WAIT_REASON_NODE_ADMISSION_BLOCKED] || ZERO) +
      Number(
        this._waitReasons[WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE] || ZERO,
      ) +
      Number(this._waitReasons[WAIT_REASON_TIMEOUT_WAITS] || ZERO);
    const pressureSignalsDelta = Math.max(
      ZERO,
      pressureSignalsTotal - Number(state.lastPressureSignalsTotal || ZERO),
    );
    state.lastPressureSignalsTotal = pressureSignalsTotal;

    const pendingQueueDepth = this._estimatePendingQueueDepth(nowMs);
    state.maxPressureSignalsDelta = Math.max(
      Number(state.maxPressureSignalsDelta || ZERO),
      pressureSignalsDelta,
    );
    state.maxPendingQueueDepth = Math.max(
      Number(state.maxPendingQueueDepth || ZERO),
      pendingQueueDepth,
    );

    const overloaded = pressureSignalsDelta >= state.pressureSignalThreshold ||
      pendingQueueDepth >= state.queueDepthThreshold;
    if (overloaded) {
      state.quietTicks = ZERO;
      state.pressureScore = Math.min(
        ADAPTIVE_DISPATCH_GUARDRAIL_SCORE_MAX,
        Number(state.pressureScore || ZERO) + ONE,
      );
    } else if (Number(state.pressureScore || ZERO) > ZERO) {
      state.quietTicks = Number(state.quietTicks || ZERO) + ONE;
      if (state.quietTicks >= state.recoveryQuietTicks) {
        state.pressureScore = Math.max(
          ZERO,
          Number(state.pressureScore || ZERO) - ONE,
        );
        state.quietTicks = ZERO;
      }
    }

    const reductionRatio = Math.max(
      ZERO,
      Math.min(
        0.9,
        Number(state.pressureScore || ZERO) * state.reductionStepRatio,
      ),
    );
    const reducedMaxInFlight = Math.floor(
      this._maxInFlight * (ONE - reductionRatio),
    );
    const dispatchReadyNodeCount = this._countCapacityContributingNodes(nowMs);
    const partiallyBlockedCluster =
      dispatchReadyNodeCount > ZERO &&
      dispatchReadyNodeCount < this._availableNodes.length;
    const dispatchReadyCapacityFloor = partiallyBlockedCluster ?
      Math.min(
        this._maxInFlight,
        dispatchReadyNodeCount * this._nodeMaxInFlight,
      ) :
      state.minMaxInFlight;
    const nextEffectiveMaxInFlight = Math.max(
      ONE,
      Math.min(
        this._maxInFlight,
        Math.max(
          state.minMaxInFlight,
          dispatchReadyCapacityFloor,
          reducedMaxInFlight,
        ),
      ),
    );
    const previousEffectiveMaxInFlight = Number(
      state.currentEffectiveMaxInFlight || this._maxInFlight,
    );
    if (nextEffectiveMaxInFlight < previousEffectiveMaxInFlight) {
      state.engagedTransitions =
        Number(state.engagedTransitions || ZERO) + ONE;
    } else if (nextEffectiveMaxInFlight > previousEffectiveMaxInFlight) {
      state.recoveryTransitions =
        Number(state.recoveryTransitions || ZERO) + ONE;
    }
    state.currentEffectiveMaxInFlight = nextEffectiveMaxInFlight;
    state.minEffectiveMaxInFlight = Math.min(
      Number(state.minEffectiveMaxInFlight || this._maxInFlight),
      nextEffectiveMaxInFlight,
    );
    const reductionFloorRatio = Math.max(0.1, ONE - reductionRatio);
    const configuredDispatchIntervalMs = this._dispatchIntervalMs > ZERO ?
      this._dispatchIntervalMs :
      MIN_DISPATCH_DELAY_MS;
    const nextEffectiveDispatchIntervalMs = Math.max(
      MIN_DISPATCH_DELAY_MS,
      configuredDispatchIntervalMs / reductionFloorRatio,
    );
    state.currentEffectiveDispatchIntervalMs = nextEffectiveDispatchIntervalMs;
    state.maxEffectiveDispatchIntervalMs = Math.max(
      Number(state.maxEffectiveDispatchIntervalMs || configuredDispatchIntervalMs),
      nextEffectiveDispatchIntervalMs,
    );
  }

  _countCapacityContributingNodes(nowMs) {
    let readyNodeCount = ZERO;
    for (let index = ZERO; index < this._availableNodes.length; index++) {
      const node = this._availableNodes[index];
      const healthKey = this._nodeHealthKeys[index];
      const availability = this._resolveNodeAvailability(
        node,
        healthKey,
        nowMs,
        this._nodeMaxInFlight,
      );
      if (availability.contributesCapacity) {
        readyNodeCount += ONE;
      }
    }
    return readyNodeCount;
  }

  _resolveEffectiveMaxInFlight() {
    const state = this._adaptiveDispatchGuardrail;
    if (!state || state.enabled !== true) {
      return this._maxInFlight;
    }
    return Math.max(
      ONE,
      Math.min(
        this._maxInFlight,
        normalizePositiveInteger(
          state.currentEffectiveMaxInFlight,
          this._maxInFlight,
        ),
      ),
    );
  }

  _resolveEffectiveDispatchIntervalMs() {
    const state = this._adaptiveDispatchGuardrail;
    if (!state || state.enabled !== true) {
      return Math.max(MIN_DISPATCH_DELAY_MS, this._dispatchIntervalMs);
    }
    return Math.max(
      MIN_DISPATCH_DELAY_MS,
      Number(
        state.currentEffectiveDispatchIntervalMs || this._dispatchIntervalMs,
      ),
    );
  }

  _rebaseDispatchSchedule(nowMs) {
    const state = this._adaptiveDispatchGuardrail;
    if (!state || state.enabled !== true || !Number.isFinite(this._nextDispatchAtMs)) {
      return;
    }
    const effectiveDispatchIntervalMs = this._resolveEffectiveDispatchIntervalMs();
    const earliestDispatchAtMs = nowMs - effectiveDispatchIntervalMs;
    if (this._nextDispatchAtMs < earliestDispatchAtMs) {
      this._nextDispatchAtMs = earliestDispatchAtMs;
    }
  }

  /**
   * Start the load run. Called internally by LoadGenerator.
   */
  _start() {
    this._syncAvailableNodesFromResolver();
    this._startTime = Date.now();

    this._completePromise = new Promise((resolve) => {
      this._resolveComplete = resolve;
    });

    this._nextDispatchAtMs = this._startTime;
    this._scheduleNextDispatch(MIN_DISPATCH_DELAY_MS);

    this._durationTimeoutId = setTimeout(() => {
      this._schedulingStopped = true;
      if (!this._dispatchStoppedBy) {
        this._dispatchStoppedBy = DISPATCH_STOP_REASON_DURATION;
      }
      this._clearDispatchTimer();
      this._finish();
    }, this._durationMs);
  }

  /**
   * Schedule the next dispatch timer.
   * @param {number} delayMs
   * @private
   */
  _scheduleNextDispatch(delayMs) {
    if (this._cancelled || this._schedulingStopped) {
      return;
    }
    const boundedDelay = Math.max(MIN_DISPATCH_DELAY_MS, Math.ceil(delayMs));
    this._dispatchTimerId = setTimeout(() => {
      this._dispatchTimerId = null;
      this._dispatchTick();
    }, boundedDelay);
  }

  /**
   * Clear the dispatch timer.
   * @private
   */
  _clearDispatchTimer() {
    if (this._dispatchTimerId !== null) {
      clearTimeout(this._dispatchTimerId);
      this._dispatchTimerId = null;
    }
  }

  /**
   * Dispatch one scheduled operation tick with strict pacing.
   * @private
   */
  _dispatchTick() {
    if (this._cancelled || this._schedulingStopped) {
      return;
    }
    this._syncAvailableNodesFromResolver();
    if (this._counter >= this._targetOperationCount) {
      this._schedulingStopped = true;
      if (!this._dispatchStoppedBy) {
        this._dispatchStoppedBy = DISPATCH_STOP_REASON_TARGET;
      }
      this._clearDispatchTimer();
      return;
    }

    const now = Date.now();
    const nextDispatchAtMs = Number(this._nextDispatchAtMs);
    if (Number.isFinite(nextDispatchAtMs) && now < nextDispatchAtMs) {
      this._recordPendingQueueDepth(now);
      this._scheduleNextDispatch(nextDispatchAtMs - now);
      return;
    }
    this._recordPendingQueueDepth(now);
    this._enforceQueueDepthBound(now);
    this._updateAdaptiveDispatchGuardrail(now);
    this._rebaseDispatchSchedule(now);
    if (this._counter >= this._targetOperationCount) {
      this._schedulingStopped = true;
      if (!this._dispatchStoppedBy) {
        this._dispatchStoppedBy = DISPATCH_STOP_REASON_TARGET;
      }
      this._clearDispatchTimer();
      return;
    }

    const effectiveMaxInFlight = this._resolveEffectiveMaxInFlight();
    const effectiveDispatchIntervalMs = this._resolveEffectiveDispatchIntervalMs();
    let dispatchedThisTick = ZERO;
    while (
      Number.isFinite(this._nextDispatchAtMs) &&
      now >= this._nextDispatchAtMs &&
      this._inFlight < effectiveMaxInFlight &&
      this._counter < this._targetOperationCount &&
      this._hasDispatchCapacity(now, {trackQueuePressure: true}) &&
      dispatchedThisTick < MAX_DISPATCHES_PER_TICK
    ) {
      const queueDelayMs = Math.max(
        ZERO,
        Date.now() - this._nextDispatchAtMs,
      );
      this._queueDelaySamples.push(queueDelayMs);
      const opIndex = this._counter % this._operations.length;
      const operation = this._operations[opIndex];
      const operationDescriptor = buildLoadOperationDescriptor(
        operation,
        this._counter,
        {
          tableName: this._tableName,
          workloadProfile: this._workloadProfile,
          eventIdPrefix: this._eventIdPrefix,
          logIdPrefix: this._logIdPrefix,
        },
      );
      this._counter++;

      this._inFlight++;
      this._executeWithFailover(
        operationDescriptor.sql,
        operation,
        operationDescriptor,
      ).finally(() => {
        this._inFlight = Math.max(ZERO, this._inFlight - ONE);
        if (this._schedulingStopped === true &&
            this._inFlight === ZERO) {
          this._finish();
        }
      });
      this._nextDispatchAtMs += effectiveDispatchIntervalMs;
      dispatchedThisTick++;
    }

    if (this._counter >= this._targetOperationCount) {
      this._schedulingStopped = true;
      if (!this._dispatchStoppedBy) {
        this._dispatchStoppedBy = DISPATCH_STOP_REASON_TARGET;
      }
      this._clearDispatchTimer();
      return;
    }
    const delayMs = Math.max(
      MIN_DISPATCH_DELAY_MS,
      this._nextDispatchAtMs - Date.now(),
    );
    this._scheduleNextDispatch(delayMs);
  }

  _recordPendingQueueDepth(nowMs) {
    this._pendingQueueDepthSamples.push(this._estimatePendingQueueDepth(nowMs));
  }

  _estimatePendingQueueDepth(nowMs) {
    if (!Number.isFinite(this._nextDispatchAtMs) ||
        this._counter >= this._targetOperationCount) {
      return ZERO;
    }
    if (nowMs < this._nextDispatchAtMs) {
      return ZERO;
    }
    const intervalMs = this._dispatchIntervalMs > ZERO ?
      this._dispatchIntervalMs :
      ONE;
    const depth = Math.floor((nowMs - this._nextDispatchAtMs) / intervalMs) + ONE;
    const remaining = Math.max(ZERO, this._targetOperationCount - this._counter);
    return Math.max(ZERO, Math.min(remaining, depth));
  }

  _enforceQueueDepthBound(nowMs) {
    if (this._earlyRejectOnQueueFull !== true) {
      return;
    }
    const queueDepthBound = this._resolveQueueDepthBound(nowMs);
    if (queueDepthBound === null) {
      return;
    }
    const pendingDepth = this._estimatePendingQueueDepth(nowMs);
    const overflow = pendingDepth - queueDepthBound;
    if (overflow <= ZERO) {
      return;
    }
    this._rejectScheduledOperations(
      overflow,
      this._resolveQueueOverflowRejectReason(),
    );
  }

  _resolveQueueDepthBound(_nowMs) {
    if (this._maxPendingQueueDepth !== null) {
      return this._maxPendingQueueDepth;
    }
    if (this._admissionAwareScheduling !== true) {
      return null;
    }
    return Math.max(
      ONE,
      Math.ceil(
        this._resolveEffectiveMaxInFlight() *
        ADMISSION_AWARE_QUEUE_MULTIPLIER_DEFAULT,
      ),
    );
  }

  _resolveQueueOverflowRejectReason() {
    if (this._maxPendingQueueDepth !== null) {
      return REJECTED_REASON_QUEUE_FULL;
    }
    if (this._admissionAwareScheduling === true) {
      return REJECTED_REASON_FLOW_CONTROL;
    }
    return REJECTED_REASON_QUEUE_FULL;
  }

  _rejectScheduledOperations(count, reason) {
    const rejectedCount = Number.isFinite(count) ?
      Math.max(ZERO, Math.floor(count)) :
      ZERO;
    if (rejectedCount === ZERO ||
        this._counter >= this._targetOperationCount) {
      return;
    }
    const remaining = Math.max(ZERO, this._targetOperationCount - this._counter);
    const accepted = Math.min(remaining, rejectedCount);
    if (accepted === ZERO) {
      return;
    }
    this._counter += accepted;
    this._rejectedOperations += accepted;
    if (Number.isFinite(this._nextDispatchAtMs)) {
      this._nextDispatchAtMs += this._dispatchIntervalMs * accepted;
    }
    if (!Object.hasOwn(this._rejectedByReason, reason)) {
      this._rejectedByReason[reason] = ZERO;
    }
    this._rejectedByReason[reason] += accepted;
    this._recordWaitReason(
      WAIT_REASON_QUEUE_CAPACITY_REJECTED,
      null,
      accepted,
    );

    const nodeCount = this._nodeHealthKeys.length;
    if (nodeCount === ZERO) {
      return;
    }
    for (let index = ZERO; index < accepted; index += ONE) {
      const nodeKeyIndex = (this._nextNodeIndex + index) % nodeCount;
      const nodeKey = this._nodeHealthKeys[nodeKeyIndex];
      const nodeMetrics = this._nodeMetricsByKey.get(nodeKey);
      if (!nodeMetrics) {
        continue;
      }
      nodeMetrics.rejected += ONE;
      if (!nodeMetrics.rejectedByReason ||
          typeof nodeMetrics.rejectedByReason !== 'object') {
        nodeMetrics.rejectedByReason = {
          [REJECTED_REASON_QUEUE_FULL]: ZERO,
          [REJECTED_REASON_FLOW_CONTROL]: ZERO,
        };
      }
      if (!Object.hasOwn(nodeMetrics.rejectedByReason, reason)) {
        nodeMetrics.rejectedByReason[reason] = ZERO;
      }
      nodeMetrics.rejectedByReason[reason] += ONE;
      this._recordWaitReason(
        WAIT_REASON_QUEUE_CAPACITY_REJECTED,
        nodeKey,
      );
    }
  }

  /**
   * Execute a SQL operation with node failover.
   * On failure, try the next available node.
   * @param {string} sql
   */
  async _executeWithFailover(sql, operation, operationDescriptor = null) {
    if (this._cancelled || this._completedMetrics) {
      return;
    }
    const startTs = Date.now();
    const nodeCount = this._availableNodes.length;
    if (nodeCount === ZERO) {
      this._failedCount++;
      return;
    }

    let candidates = this._buildAvailableNodeCandidates(Date.now());
    if (candidates.length === ZERO) {
      candidates = this._buildRecoveryNodeCandidate(Date.now());
    }
    if (candidates.length === ZERO) {
      return;
    }

    const startIndex = this._nextNodeIndex % candidates.length;
    this._nextNodeIndex =
      (this._nextNodeIndex + ONE) % nodeCount;
    let attemptedNodes = false;
    let operationDispatched = false;
    let hasNonAdmissionFailures = false;
    let nonAdmissionFailureCount = ZERO;
    let suppressibleBenchmarkFailureCount = ZERO;

    for (let attempt = ZERO; attempt < candidates.length; attempt++) {
      if (this._cancelled || this._completedMetrics) {
        return;
      }
      const candidateIndex = (startIndex + attempt) % candidates.length;
      const candidate = candidates[candidateIndex];
      const node = candidate.node;
      const nodeHealthKey = candidate.healthKey;
      const nodeState = this._nodeHealthByKey.get(nodeHealthKey);
      const attemptStartedAt = Date.now();
      if (!this._isNodeDispatchReady(nodeState, attemptStartedAt)) {
        continue;
      }
      const slotReservation = this._tryAcquireNodeSlot(
        nodeHealthKey,
        attemptStartedAt,
      );
      if (!slotReservation) {
        continue;
      }
      if (!operationDispatched) {
        this._markOperationDispatched();
        operationDispatched = true;
      }
      this._recordNodeDispatchAttempt(nodeHealthKey);
      attemptedNodes = true;
      try {
        await this._queryNode(node, sql);
        if (this._cancelled || this._completedMetrics) {
          return;
        }
        this._recordNodeSuccess(nodeHealthKey);
        const latency = Date.now() - startTs;
        this._latencies.push(latency);
        this._successCount++;
        this._recordAcknowledgedWrite(
          operationDescriptor?.acknowledgedWriteId || null,
        );
        return;
      } catch (err) {
        if (this._cancelled || this._completedMetrics) {
          return;
        }
        this._recordNodeFailure(nodeHealthKey, err);
        this._attemptErrorCount++;
        this._recordNodeAttemptFailure(nodeHealthKey, err);
        if (this._isRetryableControlPlanePressureError(err)) {
          this._recordWaitReason(
            WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE,
            nodeHealthKey,
          );
        }
        if (isTimeoutShapedError(err)) {
          this._recordWaitReason(
            WAIT_REASON_TIMEOUT_WAITS,
            nodeHealthKey,
          );
        }
        if (!this._isAdmissionSignalError(err)) {
          hasNonAdmissionFailures = true;
          nonAdmissionFailureCount++;
          if (this._shouldSuppressBenchmarkOperationFailure(operation, err)) {
            suppressibleBenchmarkFailureCount++;
            this._suppressedRetrySafeAttemptErrorCount++;
            if (isTimeoutShapedError(err)) {
              this._suppressedRetrySafeTimeoutWaitCount++;
            }
          }
        }
        this._captureErrorMessage(err);
        if (this._shouldStopFailoverAfterError(operation, err)) {
          break;
        }
      } finally {
        this._releaseNodeSlot(slotReservation);
      }
    }

    if (this._cancelled || this._completedMetrics) {
      return;
    }
    if (attemptedNodes && hasNonAdmissionFailures) {
      if (nonAdmissionFailureCount > ZERO &&
          nonAdmissionFailureCount === suppressibleBenchmarkFailureCount) {
        return;
      }
      this._failedCount++;
      this._operationErrorCount++;
    }
  }

  _markOperationDispatched() {
    this._dispatchedOperationCount += ONE;
  }

  _queryNode(node, sql) {
    if (typeof node?.queryWithTimeout === 'function') {
      return node.queryWithTimeout(sql, [], {
        timeoutMs: this._queryTimeoutMs,
        lane: ADMIN_LANE_LOAD,
      });
    }
    return node.query(sql);
  }

  _shouldStopFailoverAfterError(operation, error) {
    if (this._isAdmissionSignalError(error)) {
      return false;
    }
    if (isRetrySafeOperation(operation) ||
        isBenchmarkRetrySafeOperation(operation, this._workloadProfile)) {
      return false;
    }
    return isTimeoutShapedError(error);
  }

  _shouldSuppressBenchmarkOperationFailure(operation, error) {
    if (!isBenchmarkRetrySafeOperation(operation, this._workloadProfile)) {
      return false;
    }
    return this._isRetryableControlPlanePressureError(error) ||
      isTimeoutShapedError(error);
  }

  _hasDispatchCapacity(nowMs, options = {}) {
    if (this._availableNodes.length === ZERO) {
      return false;
    }
    if (this._buildAvailableNodeCandidates(nowMs, options).length > ZERO) {
      return true;
    }
    return this._buildRecoveryNodeCandidate(nowMs).length > ZERO;
  }

  _buildAvailableNodeCandidates(nowMs, options = {}) {
    const trackQueuePressure = options.trackQueuePressure === true;
    const candidates = [];
    const effectiveNodeMaxInFlight =
      this._resolveEffectiveNodeMaxInFlight(nowMs);
    for (let index = ZERO; index < this._availableNodes.length; index++) {
      const node = this._availableNodes[index];
      const healthKey = this._nodeHealthKeys[index];
      const availability = this._resolveNodeAvailability(
        node,
        healthKey,
        nowMs,
        effectiveNodeMaxInFlight,
      );
      if (availability.canDispatch) {
        candidates.push({node, healthKey});
      } else if (trackQueuePressure) {
        this._recordNodeQueuePressure(healthKey);
        const waitReason = this._resolveAvailabilityWaitReason(availability);
        if (waitReason) {
          this._recordWaitReason(
            waitReason,
            healthKey,
          );
        }
      }
    }
    return candidates;
  }

  _buildRecoveryNodeCandidate(nowMs) {
    let selectedIndex = null;
    let selectedOpenUntil = Number.POSITIVE_INFINITY;
    const effectiveNodeMaxInFlight =
      this._resolveEffectiveNodeMaxInFlight(nowMs);
    for (let index = ZERO; index < this._availableNodes.length; index++) {
      const node = this._availableNodes[index];
      const healthKey = this._nodeHealthKeys[index];
      const availability = this._resolveNodeAvailability(
        node,
        healthKey,
        nowMs,
        effectiveNodeMaxInFlight,
      );
      if (availability.canDispatch) {
        return [{
          node,
          healthKey,
        }];
      }
      if (availability.state !== LOAD_NODE_AVAILABILITY_STATE.LOCAL_BLOCKED) {
        continue;
      }
      const state = this._nodeHealthByKey.get(healthKey);
      if (this._getNodeInFlight(healthKey) >= effectiveNodeMaxInFlight) {
        continue;
      }
      const blockedUntil = this._resolveNodeBlockedUntilMs(state);
      if (blockedUntil <= nowMs) {
        return [{
          node,
          healthKey: this._nodeHealthKeys[index],
        }];
      }
      if (blockedUntil < selectedOpenUntil) {
        selectedOpenUntil = blockedUntil;
        selectedIndex = index;
      }
    }
    if (selectedIndex === null) {
      return [];
    }
    return [{
      node: this._availableNodes[selectedIndex],
      healthKey: this._nodeHealthKeys[selectedIndex],
    }];
  }

}

Object.assign(LoadRun.prototype, LOAD_RUN_RUNTIME_METHODS);

/**
 * LoadGenerator — connects to nodes via Admin API WebSocket,
 * drives SQL operations at a target rate. Req 6.1, 6.2
 */
class LoadGenerator {
  /**
   * @param {Array<Object>} nodes - NodeHandle instances
   * @param {Object} [options]
   * @param {number} [options.opsPerSec] - Target ops/sec
   * @param {string|number} [options.duration] - Duration ('30s', '1m', ms)
   * @param {Array<string>} [options.operations] - SQL operation types
   * @param {number} [options.maxInFlight] - Optional in-flight cap
   * @param {Function} [options.nodeResolver] - Synchronous resolver that
   *   can refresh the currently available node set mid-run.
   * @param {string} [options.tableName] - Target table name
   * @param {string} [options.workloadProfile] - SQL workload profile
   * @param {number} [options.nodeFailureThreshold] - Consecutive
   *   failures before a node is temporarily ejected.
   * @param {number} [options.nodeFailureCooldownMs] - Circuit-breaker
   *   cooldown duration.
   * @param {number} [options.queryTimeoutMs] - Load query timeout
   *   for timeout-aware node handles.
   * @param {number} [options.nodeMaxInFlight] - Per-node in-flight cap to
   *   prevent one node from monopolizing global concurrency.
   * @param {number} [options.maxPendingQueueDepth] - Optional max
   *   dispatch queue depth before overload rejection.
   * @param {boolean} [options.earlyRejectOnQueueFull] - Reject
   *   scheduled operations when pending queue exceeds depth.
   * @param {boolean} [options.trackAcknowledgedWrites] - Retain successful
   *   INSERT identifiers for post-recovery visibility assertions.
   * @param {boolean} [options.admissionAwareScheduling] - Convert overload
   *   into bounded flow-control rejections instead of unbounded scheduler
   *   backlog.
   * @param {Object|boolean} [options.adaptiveDispatchGuardrail] -
   *   Optional adaptive dispatch guardrail settings.
   */
  constructor(nodes, options = {}) {
    this._nodes = nodes;
    this._opsPerSec = options.opsPerSec ||
      LOAD_DEFAULTS.defaultOpsPerSec;
    this._duration = options.duration ||
      LOAD_DEFAULTS.defaultDuration;
    this._workloadProfile =
      options.workloadProfile || WORKLOAD_PROFILE_DEFAULT;
    const defaultOperations = this._workloadProfile ===
      WORKLOAD_PROFILE_BENCHMARK_EVENTS ?
      BENCHMARK_OPERATIONS :
      DEFAULT_OPERATIONS;
    this._operations = options.operations || defaultOperations;
    this._maxInFlight = Number.isInteger(options.maxInFlight) &&
      options.maxInFlight > ZERO ?
      options.maxInFlight :
      null;
    this._nodeFailureThreshold =
      Number.isInteger(options.nodeFailureThreshold) &&
      options.nodeFailureThreshold > ZERO ?
        options.nodeFailureThreshold :
        NODE_FAILURE_THRESHOLD_DEFAULT;
    this._nodeFailureCooldownMs =
      Number.isInteger(options.nodeFailureCooldownMs) &&
      options.nodeFailureCooldownMs > ZERO ?
        options.nodeFailureCooldownMs :
        NODE_FAILURE_COOLDOWN_MS_DEFAULT;
    this._admissionBackoffMs =
      Number.isInteger(options.admissionBackoffMs) &&
      options.admissionBackoffMs > ZERO ?
        options.admissionBackoffMs :
        ADMISSION_BACKOFF_MS_DEFAULT;
    this._queryTimeoutMs =
      Number.isInteger(options.queryTimeoutMs) &&
      options.queryTimeoutMs > ZERO ?
        options.queryTimeoutMs :
        QUERY_TIMEOUT_MS_DEFAULT;
    this._nodeMaxInFlight =
      Number.isInteger(options.nodeMaxInFlight) &&
      options.nodeMaxInFlight > ZERO ?
        options.nodeMaxInFlight :
        null;
    this._maxPendingQueueDepth =
      Number.isInteger(options.maxPendingQueueDepth) &&
      options.maxPendingQueueDepth >= ZERO ?
        options.maxPendingQueueDepth :
        null;
    this._trackAcknowledgedWrites = options.trackAcknowledgedWrites === true;
    this._admissionAwareScheduling =
      options.admissionAwareScheduling === true;
    this._earlyRejectOnQueueFull =
      options.earlyRejectOnQueueFull === true ||
      (options.earlyRejectOnQueueFull !== false &&
        this._admissionAwareScheduling === true);
    this._adaptiveDispatchGuardrail = options.adaptiveDispatchGuardrail;
    this._nodeResolver =
      typeof options.nodeResolver === 'function' ?
        options.nodeResolver :
        null;
    this._tableName = normalizeTableName(
      options.tableName,
      this._workloadProfile === WORKLOAD_PROFILE_BENCHMARK_EVENTS ?
        LOAD_TABLE_BENCHMARK_EVENTS :
        LOAD_TABLE_NAME,
    );
  }

  /**
   * Start generating load. Returns a LoadRun handle.
   * @returns {LoadRun}
   */
  start() {
    const durationMs = parseDuration(this._duration);
    const eventIdPrefix = this._workloadProfile ===
      WORKLOAD_PROFILE_BENCHMARK_EVENTS ?
      BENCHMARK_EVENT_ID_PREFIX + randomUUID() + '-' :
      BENCHMARK_EVENT_ID_PREFIX;
    const logIdPrefix = this._workloadProfile ===
      WORKLOAD_PROFILE_BENCHMARK_EVENTS ?
      LOAD_LOG_ID_PREFIX :
      LOAD_LOG_ID_PREFIX + randomUUID() + '-';
    const run = new LoadRun(this._nodes, {
      opsPerSec: this._opsPerSec,
      durationMs,
      operations: this._operations,
      tableName: this._tableName,
      workloadProfile: this._workloadProfile,
      eventIdPrefix,
      logIdPrefix,
      nodeFailureThreshold: this._nodeFailureThreshold,
      nodeFailureCooldownMs: this._nodeFailureCooldownMs,
      queryTimeoutMs: this._queryTimeoutMs,
      admissionBackoffMs: this._admissionBackoffMs,
      trackAcknowledgedWrites: this._trackAcknowledgedWrites,
      maxPendingQueueDepth: this._maxPendingQueueDepth,
      earlyRejectOnQueueFull: this._earlyRejectOnQueueFull,
      admissionAwareScheduling: this._admissionAwareScheduling,
      adaptiveDispatchGuardrail: this._adaptiveDispatchGuardrail,
      ...(this._nodeResolver ? {nodeResolver: this._nodeResolver} : {}),
      ...(this._nodeMaxInFlight !== null ?
        {nodeMaxInFlight: this._nodeMaxInFlight} :
        {}),
      ...(this._maxInFlight !== null ?
        {maxInFlight: this._maxInFlight} :
        {}),
    });
    run._start();
    return run;
  }
}

export {LoadGenerator, LoadRun, computeMetrics};
