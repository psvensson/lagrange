/**
 * Load Generator — drives SQL traffic against the cluster via
 * Admin API WebSocket connections on node handles.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import {LOAD_DEFAULTS} from './constants.js';

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

const LOAD_TABLE_NAME = 'logs';
const LOAD_TABLE_BENCHMARK_EVENTS = 'benchmark_events';
const LOAD_NODE_ID = 'load-generator';
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

/**
 * Parse a duration string like '30s' or '5m' into milliseconds.
 * @param {string} duration
 * @returns {number} milliseconds
 */
function parseDuration(duration) {
  if (typeof duration === 'number') {
    return duration;
  }
  const value = parseInt(duration, 10);
  if (duration.endsWith(DURATION_MINUTES_SUFFIX)) {
    return value * SECONDS_PER_MINUTE * MS_PER_SECOND;
  }
  if (duration.endsWith(DURATION_SECONDS_SUFFIX)) {
    return value * MS_PER_SECOND;
  }
  return value;
}

function normalizeTableName(tableName, fallback = LOAD_TABLE_NAME) {
  const candidate = String(tableName || fallback).trim();
  if (!IDENTIFIER_PATTERN.test(candidate)) {
    return fallback;
  }
  return candidate;
}

/**
 * Build a SQL statement for the given operation type and counter.
 * @param {string} operation - One of INSERT, SELECT, UPDATE, DELETE
 * @param {number} counter - Monotonic operation counter
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @param {string} [options.workloadProfile]
 * @returns {string} SQL statement
 */
function buildSqlStatement(operation, counter, options = {}) {
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
    const eventId = BENCHMARK_EVENT_ID_PREFIX + counter;
    const payload = counter % BENCHMARK_PAYLOAD_MODULO;
    const timestamp = Date.now();
    switch (operation) {
    case INSERT_OP:
      return `INSERT INTO ${tableName} ` +
        '(event_id, payload, created_at) VALUES (' +
        `'${eventId}', ${payload}, ${timestamp})`;
    case SELECT_OP:
      return `SELECT count(*) FROM ${tableName} ` +
        `WHERE payload = ${payload}`;
    case UPDATE_OP:
      return `UPDATE ${tableName} ` +
        `SET created_at = ${timestamp} ` +
        `WHERE event_id = '${eventId}'`;
    case DELETE_OP:
      return `DELETE FROM ${tableName} ` +
        `WHERE event_id = '${eventId}'`;
    default:
      return 'SELECT 1';
    }
  }

  const logId = `load-${counter}`;
  const timestamp = Date.now();
  switch (operation) {
  case INSERT_OP:
    return `INSERT INTO ${tableName} ` +
      '(log_id, timestamp, level, node_id, message, created_at) VALUES (' +
      `'${logId}', ${timestamp}, '${LOG_LEVEL_INFO}', ` +
      `'${LOAD_NODE_ID}', 'load-${counter}', ${timestamp})`;
  case SELECT_OP:
    return `SELECT * FROM ${tableName} ` +
      `WHERE log_id = '${logId}' LIMIT 1`;
  case UPDATE_OP:
    return `UPDATE ${tableName} ` +
      `SET message = 'updated-${counter}' ` +
      `WHERE log_id = '${logId}'`;
  case DELETE_OP:
    return `DELETE FROM ${tableName} ` +
      `WHERE log_id = '${logId}'`;
  default:
    return 'SELECT 1';
  }
}

/**
 * Compute percentile from a sorted array of numbers.
 * @param {Array<number>} sorted - Sorted latency values
 * @param {number} percentile - Percentile (0-1)
 * @returns {number} Value at percentile
 */
function percentile(sorted, percentile) {
  if (sorted.length === ZERO) {
    return ZERO;
  }
  const index = Math.floor(percentile * sorted.length);
  return sorted[Math.min(index, sorted.length - ONE)];
}

/**
 * Compute metrics from raw data. Exported for independent testing.
 * @param {Array<number>} latencies - Raw latency values in ms
 * @param {number} successCount
 * @param {number} failedCount
 * @param {number} errorCount
 * @param {number} durationMs - Total run duration in ms
 * @param {Array<string>} [distinctErrors] - Distinct error messages
 * @returns {Object} Metrics snapshot
 */
function computeMetrics(
  latencies, successCount, failedCount, errorCount, durationMs,
  distinctErrors,
) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const total = successCount + failedCount;
  const elapsed = durationMs > ZERO ? durationMs : ONE;
  const metrics = {
    total,
    success: successCount,
    failed: failedCount,
    errors: errorCount,
    latency: {
      avg: sorted.length > ZERO ?
        sorted.reduce((sum, value) => sum + value, ZERO) / sorted.length :
        ZERO,
      p50: percentile(sorted, PERCENTILE_P50),
      p95: percentile(sorted, PERCENTILE_P95),
      p99: percentile(sorted, PERCENTILE_P99),
    },
    opsPerSec: (total / elapsed) * MS_PER_SECOND,
  };
  if (Array.isArray(distinctErrors) && distinctErrors.length > ZERO) {
    metrics.distinctErrors = distinctErrors;
  }
  return metrics;
}

/**
 * LoadRun — handle for an active load generation run.
 * Drives SQL operations at the target rate and tracks metrics.
 */
class LoadRun {
  /**
   * @param {Array<Object>} nodes - NodeHandle instances
   * @param {Object} options
   * @param {number} options.opsPerSec - Target operations per second
   * @param {number} options.durationMs - Duration in milliseconds
   * @param {Array<string>} options.operations - SQL operation types
   * @param {number} [options.maxInFlight] - Optional in-flight cap
   * @param {string} [options.tableName]
   * @param {string} [options.workloadProfile]
   * @param {number} [options.nodeFailureThreshold] - Consecutive
   *   failures before a node is temporarily ejected.
   * @param {number} [options.nodeFailureCooldownMs] - Circuit-breaker
   *   cooldown duration.
   * @param {number} [options.queryTimeoutMs] - Load query timeout
   *   for timeout-aware node handles.
   * @param {number} [options.nodeMaxInFlight] - Per-node in-flight
   *   cap to prevent one node from monopolizing global concurrency.
   */
  constructor(nodes, options) {
    this._nodes = [...nodes];
    this._availableNodes = [...nodes];
    this._opsPerSec = options.opsPerSec;
    this._durationMs = options.durationMs;
    this._operations = options.operations;
    this._tableName = options.tableName || LOAD_TABLE_NAME;
    this._workloadProfile =
      options.workloadProfile || WORKLOAD_PROFILE_DEFAULT;
    this._maxInFlight = options.maxInFlight ||
      this._availableNodes.length * IN_FLIGHT_PER_NODE;
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
    this._queryTimeoutMs =
      Number.isInteger(options.queryTimeoutMs) &&
      options.queryTimeoutMs > ZERO ?
        options.queryTimeoutMs :
        QUERY_TIMEOUT_MS_DEFAULT;
    this._dispatchIntervalMs = this._opsPerSec > ZERO ?
      MS_PER_SECOND / this._opsPerSec :
      MS_PER_SECOND;
    this._targetOperationCount = Math.max(
      ZERO,
      Math.floor((this._durationMs * this._opsPerSec) / MS_PER_SECOND),
    );

    this._latencies = [];
    this._successCount = ZERO;
    this._failedCount = ZERO;
    this._errorCount = ZERO;
    this._distinctErrorSet = new Set();
    this._distinctErrors = [];
    this._counter = ZERO;
    this._nextNodeIndex = ZERO;
    this._inFlight = ZERO;
    this._cancelled = false;
    this._startTime = null;
    this._dispatchTimerId = null;
    this._nextDispatchAtMs = null;
    this._schedulingStopped = false;
    this._durationTimeoutId = null;
    this._drainTimerId = null;
    this._completePromise = null;
    this._resolveComplete = null;
    this._completedMetrics = null;
    this._nodeHealthKeys = [];
    this._nodeHealthByKey = new Map();
    this._nodeInFlightByKey = new Map();
    const derivedNodeMaxInFlight = this._availableNodes.length > ZERO ?
      Math.max(ONE, Math.ceil(this._maxInFlight / this._availableNodes.length)) :
      ONE;
    this._nodeMaxInFlight =
      Number.isInteger(options.nodeMaxInFlight) &&
      options.nodeMaxInFlight > ZERO ?
        options.nodeMaxInFlight :
        derivedNodeMaxInFlight;
    for (let index = ZERO; index < this._availableNodes.length; index++) {
      const node = this._availableNodes[index];
      const nodeId = String(node?.id || 'unknown');
      const key = 'node-' + String(index) + '-' + nodeId;
      this._nodeHealthKeys.push(key);
      this._nodeHealthByKey.set(key, {
        consecutiveFailures: ZERO,
        openUntilMs: ZERO,
      });
      this._nodeInFlightByKey.set(key, ZERO);
    }
  }

  /**
   * Start the load run. Called internally by LoadGenerator.
   */
  _start() {
    this._startTime = Date.now();

    this._completePromise = new Promise((resolve) => {
      this._resolveComplete = resolve;
    });

    this._nextDispatchAtMs = this._startTime;
    this._scheduleNextDispatch(MIN_DISPATCH_DELAY_MS);

    this._durationTimeoutId = setTimeout(() => {
      this._schedulingStopped = true;
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
    if (this._counter >= this._targetOperationCount) {
      this._schedulingStopped = true;
      this._clearDispatchTimer();
      return;
    }

    const now = Date.now();
    const nextDispatchAtMs = Number(this._nextDispatchAtMs);
    if (Number.isFinite(nextDispatchAtMs) && now < nextDispatchAtMs) {
      this._scheduleNextDispatch(nextDispatchAtMs - now);
      return;
    }

    let dispatchedThisTick = ZERO;
    while (
      Number.isFinite(this._nextDispatchAtMs) &&
      now >= this._nextDispatchAtMs &&
      this._inFlight < this._maxInFlight &&
      this._counter < this._targetOperationCount &&
      this._hasDispatchCapacity(now) &&
      dispatchedThisTick < MAX_DISPATCHES_PER_TICK
    ) {
      const opIndex = this._counter % this._operations.length;
      const operation = this._operations[opIndex];
      const sql = buildSqlStatement(operation, this._counter, {
        tableName: this._tableName,
        workloadProfile: this._workloadProfile,
      });
      this._counter++;

      this._inFlight++;
      this._executeWithFailover(sql).finally(() => {
        this._inFlight = Math.max(ZERO, this._inFlight - ONE);
      });
      this._nextDispatchAtMs += this._dispatchIntervalMs;
      dispatchedThisTick++;
    }

    if (this._counter >= this._targetOperationCount) {
      this._schedulingStopped = true;
      this._clearDispatchTimer();
      return;
    }
    const delayMs = Math.max(
      MIN_DISPATCH_DELAY_MS,
      this._nextDispatchAtMs - Date.now(),
    );
    this._scheduleNextDispatch(delayMs);
  }

  /**
   * Execute a SQL operation with node failover.
   * On failure, try the next available node.
   * @param {string} sql
   */
  async _executeWithFailover(sql) {
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

    for (let attempt = ZERO; attempt < candidates.length; attempt++) {
      if (this._cancelled || this._completedMetrics) {
        return;
      }
      const candidateIndex = (startIndex + attempt) % candidates.length;
      const candidate = candidates[candidateIndex];
      const node = candidate.node;
      const nodeHealthKey = candidate.healthKey;
      if (!this._tryAcquireNodeSlot(nodeHealthKey)) {
        continue;
      }
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
        return;
      } catch (err) {
        if (this._cancelled || this._completedMetrics) {
          return;
        }
        this._recordNodeFailure(nodeHealthKey);
        this._errorCount++;
        this._captureErrorMessage(err);
      } finally {
        this._releaseNodeSlot(nodeHealthKey);
      }
    }

    if (this._cancelled || this._completedMetrics) {
      return;
    }
    if (attemptedNodes) {
      this._failedCount++;
    }
  }

  _queryNode(node, sql) {
    if (typeof node?.queryWithTimeout === 'function') {
      return node.queryWithTimeout(sql, [], {
        timeoutMs: this._queryTimeoutMs,
      });
    }
    return node.query(sql);
  }

  _hasDispatchCapacity(nowMs) {
    if (this._availableNodes.length === ZERO) {
      return false;
    }
    if (this._buildAvailableNodeCandidates(nowMs).length > ZERO) {
      return true;
    }
    return this._buildRecoveryNodeCandidate(nowMs).length > ZERO;
  }

  _buildAvailableNodeCandidates(nowMs) {
    const candidates = [];
    for (let index = ZERO; index < this._availableNodes.length; index++) {
      const node = this._availableNodes[index];
      const healthKey = this._nodeHealthKeys[index];
      const state = this._nodeHealthByKey.get(healthKey);
      if ((!state || state.openUntilMs <= nowMs) &&
          this._getNodeInFlight(healthKey) < this._nodeMaxInFlight) {
        candidates.push({
          node,
          healthKey,
        });
      }
    }
    return candidates;
  }

  _buildRecoveryNodeCandidate(nowMs) {
    let selectedIndex = null;
    let selectedOpenUntil = Number.POSITIVE_INFINITY;
    for (let index = ZERO; index < this._availableNodes.length; index++) {
      const healthKey = this._nodeHealthKeys[index];
      const state = this._nodeHealthByKey.get(healthKey);
      if (this._getNodeInFlight(healthKey) >= this._nodeMaxInFlight) {
        continue;
      }
      const openUntil = Number(state?.openUntilMs || ZERO);
      if (openUntil <= nowMs) {
        return [{
          node: this._availableNodes[index],
          healthKey: this._nodeHealthKeys[index],
        }];
      }
      if (openUntil < selectedOpenUntil) {
        selectedOpenUntil = openUntil;
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

  _getNodeInFlight(healthKey) {
    return Number(this._nodeInFlightByKey.get(healthKey) || ZERO);
  }

  _tryAcquireNodeSlot(healthKey) {
    const current = this._getNodeInFlight(healthKey);
    if (current >= this._nodeMaxInFlight) {
      return false;
    }
    this._nodeInFlightByKey.set(healthKey, current + ONE);
    return true;
  }

  _releaseNodeSlot(healthKey) {
    const current = this._getNodeInFlight(healthKey);
    if (current <= ZERO) {
      this._nodeInFlightByKey.set(healthKey, ZERO);
      return;
    }
    this._nodeInFlightByKey.set(healthKey, current - ONE);
  }

  _recordNodeSuccess(healthKey) {
    const state = this._nodeHealthByKey.get(healthKey);
    if (!state) {
      return;
    }
    state.consecutiveFailures = ZERO;
    state.openUntilMs = ZERO;
  }

  _recordNodeFailure(healthKey) {
    const state = this._nodeHealthByKey.get(healthKey);
    if (!state) {
      return;
    }
    state.consecutiveFailures += ONE;
    if (state.consecutiveFailures < this._nodeFailureThreshold) {
      return;
    }
    state.consecutiveFailures = ZERO;
    state.openUntilMs = Date.now() + this._nodeFailureCooldownMs;
  }

  /**
   * Capture a distinct error message for diagnostics.
   * @param {Error} err
   * @private
   */
  _captureErrorMessage(err) {
    if (this._distinctErrorSet.size >= MAX_DISTINCT_ERROR_MESSAGES) {
      return;
    }
    const message = String(err?.message || err || 'unknown');
    if (this._distinctErrorSet.has(message)) {
      return;
    }
    this._distinctErrorSet.add(message);
    this._distinctErrors.push(message);
  }

  /**
   * Finish the load run.
   */
  _finish(force = false) {
    if (this._completedMetrics) {
      return;
    }
    this._clearDispatchTimer();
    if (this._durationTimeoutId !== null) {
      clearTimeout(this._durationTimeoutId);
      this._durationTimeoutId = null;
    }
    if (!force && this._inFlight > ZERO) {
      this._scheduleDrainCheck();
      return;
    }

    this._clearDrainTimer();
    this._completedMetrics = this._computeCurrentMetrics();

    if (this._resolveComplete) {
      this._resolveComplete(this._completedMetrics);
      this._resolveComplete = null;
    }
  }

  /**
   * Schedule the next in-flight drain check.
   * @private
   */
  _scheduleDrainCheck() {
    if (this._drainTimerId !== null) {
      return;
    }
    this._drainTimerId = setTimeout(() => {
      this._drainTimerId = null;
      this._finish();
    }, DRAIN_WAIT_MS);
    if (typeof this._drainTimerId.unref === 'function') {
      this._drainTimerId.unref();
    }
  }

  /**
   * Clear pending in-flight drain checks.
   * @private
   */
  _clearDrainTimer() {
    if (this._drainTimerId !== null) {
      clearTimeout(this._drainTimerId);
      this._drainTimerId = null;
    }
  }

  /**
   * Build current metrics snapshot.
   * @returns {Object}
   * @private
   */
  _computeCurrentMetrics() {
    const elapsed = this._startTime ?
      Date.now() - this._startTime :
      ZERO;
    return computeMetrics(
      this._latencies,
      this._successCount,
      this._failedCount,
      this._errorCount,
      elapsed,
      this._distinctErrors,
    );
  }

  /**
   * Wait for the load run to complete. Req 6.4
   * @returns {Promise<Object>} Final metrics
   */
  async waitComplete() {
    if (!this._completePromise) {
      return this.getMetrics();
    }
    return this._completePromise;
  }

  /**
   * Get current metrics snapshot. Req 6.3
   * @returns {Object} Metrics
   */
  getMetrics() {
    if (this._completedMetrics) {
      return this._completedMetrics;
    }
    return this._computeCurrentMetrics();
  }

  /**
   * Cancel the load run early.
   */
  cancel() {
    this._cancelled = true;
    this._schedulingStopped = true;
    this._finish(true);
  }
}

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
   * @param {string} [options.tableName] - Target table name
   * @param {string} [options.workloadProfile] - SQL workload profile
   * @param {number} [options.nodeFailureThreshold] - Consecutive
   *   failures before a node is temporarily ejected.
   * @param {number} [options.nodeFailureCooldownMs] - Circuit-breaker
   *   cooldown duration.
   * @param {number} [options.queryTimeoutMs] - Load query timeout
   *   for timeout-aware node handles.
   * @param {number} [options.nodeMaxInFlight] - Per-node in-flight
   *   cap to prevent one node from monopolizing global concurrency.
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
    const run = new LoadRun(this._nodes, {
      opsPerSec: this._opsPerSec,
      durationMs,
      operations: this._operations,
      tableName: this._tableName,
      workloadProfile: this._workloadProfile,
      nodeFailureThreshold: this._nodeFailureThreshold,
      nodeFailureCooldownMs: this._nodeFailureCooldownMs,
      queryTimeoutMs: this._queryTimeoutMs,
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
