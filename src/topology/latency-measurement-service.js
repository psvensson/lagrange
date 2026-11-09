/**
 * LatencyMeasurementService - single owner for RTT measurement and persistence.
 */

import {EventEmitter} from 'events';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {assertCritical} from '../utils/assert.js';
import {COLUMN, NUM, TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  LATENCY_TOPOLOGY_CONFIG_KEY,
  LATENCY_TOPOLOGY_DEFAULT,
} from './latency-topology-constants.js';
import {
  LATENCY_MEASUREMENT_DEFAULT,
  LATENCY_MEASUREMENT_ERROR_MSG,
  LATENCY_MEASUREMENT_EVENT,
  LATENCY_MEASUREMENT_LOG_MSG,
  LATENCY_MEASUREMENT_REASON,
  LATENCY_MEASUREMENT_SAMPLE_QUALITY,
  LATENCY_MEASUREMENT_STATE,
  LATENCY_MEASUREMENT_SUBSYSTEM,
} from './latency-measurement-constants.js';

const LATENCY_EDGE_DELIVERY_PRIORITY = 'background';
const INTER_GROUP_LATENCY_SQL = Object.freeze({
  SELECT_BY_EDGE_ID:
    'SELECT * FROM inter_group_latencies WHERE latency_edge_id = ?',
});

const LATENCY_MEASUREMENT_RETRY_WAIT = Object.freeze({
  wait: 'LATENCY_PING_TIMEOUT_MS x (retryCount + 1)',
  awaited: 'one acknowledged ping to measure the node RTT',
});

/**
 * Every measurement attempt to a node failed: one wait_bound_spent ERROR
 * per target, folded while the observed outcome is unchanged (measurement
 * runs on a cadence).
 * @param {Object} service - The latency measurement service.
 * @param {string} targetNodeId - The measured node.
 * @param {Object} spent - {timeoutMs, retryCount, startedAtMs, lastError}.
 * @return {void}
 */
function reportLatencyMeasurementSpent(service, targetNodeId, spent) {
  reportWaitBoundSpent(service.logger, {
    ...LATENCY_MEASUREMENT_RETRY_WAIT,
    boundMs: spent.timeoutMs * (spent.retryCount + 1),
    elapsedMs: service.now() - spent.startedAtMs,
    lastObserved: {
      attempts: spent.retryCount + 1,
      pingTimeoutMs: spent.timeoutMs,
      lastThrownError: spent.lastError,
    },
    scope: {nodeId: service.nodeId ?? null, targetNodeId},
    subject: targetNodeId,
  });
}

const LATENCY_MEASUREMENT_CONFIG_MIN = Object.freeze({
  // ends-on: n/a clamp
  PING_TIMEOUT_MS: 1,
  RECALC_INTERVAL_MS: NUM.THOUSAND,
  SMOOTHING_ALPHA: 0.01,
});

class LatencyMeasurementService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.messageRouter
   * @param {Object} options.systemTableCache
   * @param {Object} options.cdcIntegrationService
   * @param {Function} options.nowFn
   */
  constructor(options = {}) {
    super();
    this.nodeId = options.nodeId || null;
    this.messageRouter = options.messageRouter || null;
    this.systemTableCache = options.systemTableCache || null;
    // Committed edge rows this node wrote: the base of its next conditional
    // edge write (census site 5).
    this.committedEdgeBases = new Map();
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.nowFn = options.nowFn || Date.now;

    this.config = ConfigurationManager.getInstance();
    this.refreshConfig();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(LATENCY_MEASUREMENT_SUBSYSTEM) : console;

    this.state = LATENCY_MEASUREMENT_STATE.CREATED;
    this.stats = {
      measurementRequestCount: 0,
      measurementAttemptCount: 0,
      measurementSuccessCount: 0,
      measurementFailureCount: 0,
      sampleRecordedCount: 0,
      sampleIgnoredCount: 0,
      lastMeasurementAt: null,
      lastSampleRecordedAt: null,
    };
  }

  /**
   * Initialize dependencies and validate required owners.
   * @param {Object} options
   */
  initialize(options = {}) {
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }
    if (options.messageRouter) {
      this.messageRouter = options.messageRouter;
    }
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }
    if (options.controlPlaneSystemTableGateway) {
      this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
    }
    if (options.nowFn) {
      this.nowFn = options.nowFn;
    }

    this.nodeId = assertCritical(
      this.nodeId,
      LATENCY_MEASUREMENT_ERROR_MSG.MISSING_NODE_ID,
    );
    this.messageRouter = assertCritical(
      this.messageRouter,
      LATENCY_MEASUREMENT_ERROR_MSG.MISSING_MESSAGE_ROUTER,
    );
    this.cdcIntegrationService = assertCritical(
      this.cdcIntegrationService,
      LATENCY_MEASUREMENT_ERROR_MSG.MISSING_CDC,
    );

    this.refreshConfig();
    this.state = LATENCY_MEASUREMENT_STATE.INITIALIZED;
    this.logger.info(LATENCY_MEASUREMENT_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      pingTimeoutMs: this.pingTimeoutMs,
      pingRetryCount: this.pingRetryCount,
      smoothingAlpha: this.smoothingAlpha,
    });
  }

  /**
   * Start service lifecycle.
   */
  start() {
    this.ensureInitialized();
    this.state = LATENCY_MEASUREMENT_STATE.RUNNING;
    this.logger.info(LATENCY_MEASUREMENT_LOG_MSG.STARTED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Stop service lifecycle.
   */
  stop() {
    this.state = LATENCY_MEASUREMENT_STATE.STOPPED;
    this.logger.info(LATENCY_MEASUREMENT_LOG_MSG.STOPPED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Measure RTT to a target node using router ping/pong.
   * @param {string} targetNodeId
   * @param {Object} options
   * @return {Promise<Object|null>}
   */
  async measureNodeLatency(targetNodeId, options = {}) {
    this.ensureInitialized();
    this.stats.measurementRequestCount += 1;

    if (!targetNodeId) {
      return null;
    }

    if (targetNodeId === this.nodeId) {
      return {
        rttMs: LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS,
        attempt: 0,
      };
    }

    const timeoutMs = this.resolveTimeoutMs(options.timeoutMs);
    const retryCount = this.resolveRetryCount(options.retryCount);

    let measurementStartedAt = Number.POSITIVE_INFINITY;
    let lastError = null;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      this.stats.measurementAttemptCount += 1;
      const startedAt = this.now();
      measurementStartedAt = Math.min(measurementStartedAt, startedAt);
      this.stats.lastMeasurementAt = startedAt;
      try {
        const acknowledged = await this.messageRouter.pingNode(
          targetNodeId,
          timeoutMs,
        );
        const endedAt = this.now();
        const rttMs = Math.max(
          LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS,
          endedAt - startedAt,
        );
        if (acknowledged) {
          this.stats.measurementSuccessCount += 1;
          return {rttMs, attempt};
        }
      } catch (error) {
        lastError = error.message;
        this.logger.debug(LATENCY_MEASUREMENT_LOG_MSG.MEASUREMENT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          attempt,
          error: error.message,
        });
      }
    }

    reportLatencyMeasurementSpent(this, targetNodeId, {
      timeoutMs,
      retryCount,
      startedAtMs: measurementStartedAt,
      lastError,
    });
    this.emit(LATENCY_MEASUREMENT_EVENT.MEASUREMENT_FAILED, {
      sourceNodeId: this.nodeId,
      targetNodeId,
      timeoutMs,
      retryCount,
    });
    this.stats.measurementFailureCount += 1;

    return null;
  }

  /**
   * Measure a single inter-group RTT sample.
   * @param {Object} options
   * @return {Promise<Object|null>}
   */
  async measureInterGroupLatency(options = {}) {
    this.ensureInitialized();

    const sourceGroupId = options.sourceGroupId;
    const targetGroupId = options.targetGroupId;
    const targetRepresentativeNodeId = options.targetRepresentativeNodeId;
    const sourceNodeId = options.sourceNodeId || this.nodeId;

    assertCritical(
      sourceGroupId,
      LATENCY_MEASUREMENT_ERROR_MSG.MISSING_SOURCE_GROUP_ID,
    );
    assertCritical(
      targetGroupId,
      LATENCY_MEASUREMENT_ERROR_MSG.MISSING_TARGET_GROUP_ID,
    );
    assertCritical(
      targetRepresentativeNodeId,
      LATENCY_MEASUREMENT_ERROR_MSG.MISSING_TARGET_NODE_ID,
    );

    const measurement = await this.measureNodeLatency(
      targetRepresentativeNodeId,
      options,
    );
    if (!measurement) {
      return null;
    }

    const sample = {
      sourceGroupId,
      targetGroupId,
      sourceNodeId,
      targetNodeId: targetRepresentativeNodeId,
      rttMs: measurement.rttMs,
      timestamp: this.now(),
      sampleQuality: measurement.attempt === 0 ?
        LATENCY_MEASUREMENT_SAMPLE_QUALITY.GOOD :
        LATENCY_MEASUREMENT_SAMPLE_QUALITY.RETRY,
    };

    return this.isValidSample(sample) ? sample : null;
  }

  /**
   * Measure and persist a single inter-group latency sample.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async measureAndRecordInterGroupLatency(options = {}) {
    const sample = await this.measureInterGroupLatency(options);
    if (!sample) {
      return {success: false, sample: null};
    }

    const persisted = await this.recordInterGroupSample(sample);
    return {
      success: persisted.success,
      sample,
      row: persisted.row,
      result: persisted.result,
    };
  }

  /**
   * Persist validated sample through the canonical CDC write path.
   * @param {Object} sample
   * @return {Promise<Object>}
   */
  async recordInterGroupSample(sample) {
    this.ensureInitialized();

    if (!this.isValidSample(sample)) {
      return {
        success: false,
        ignored: true,
      };
    }

    const edgeId = this.buildLatencyEdgeId(
      sample.sourceGroupId,
      sample.targetGroupId,
    );
    const base = await this.resolveCommittedEdgeBase(edgeId);
    if (!base.known) {
      return {
        success: false,
        reason: LATENCY_MEASUREMENT_REASON.EDGE_BASE_UNAVAILABLE,
        retryAfterMs: base.retryAfterMs,
      };
    }
    const existing = base.row;
    const smoothedLatencyMs = this.smoothLatency(
      Number(existing?.[COLUMN.LATENCY_MS]),
      sample.rttMs,
    );
    const existingSampleCount = Number(existing?.[COLUMN.SAMPLE_COUNT]);
    const normalizedSampleCount = Number.isFinite(existingSampleCount) &&
      existingSampleCount >= 1 ? existingSampleCount : 0;
    const now = sample.timestamp;

    const row = {
      [COLUMN.LATENCY_EDGE_ID]: edgeId,
      [COLUMN.SOURCE_GROUP_ID]: sample.sourceGroupId,
      [COLUMN.TARGET_GROUP_ID]: sample.targetGroupId,
      [COLUMN.LATENCY_MS]: smoothedLatencyMs,
      [COLUMN.SAMPLE_COUNT]:
        normalizedSampleCount + LATENCY_MEASUREMENT_DEFAULT.MIN_SAMPLE_COUNT,
      [COLUMN.SAMPLE_QUALITY]: sample.sampleQuality,
      [COLUMN.LAST_MEASURED_AT]: sample.timestamp,
      [COLUMN.CREATED_AT]: existing?.[COLUMN.CREATED_AT] || now,
      [COLUMN.UPDATED_AT]: now,
    };

    const result = await this.writeEdgeConditionally(edgeId, existing, row);
    const refusal = this.keepCommittedEdge(edgeId, row, result);
    if (refusal !== null) {
      return refusal;
    }

    this.logger.debug(LATENCY_MEASUREMENT_LOG_MSG.SAMPLE_RECORDED, {
      nodeId: this.nodeId,
      edgeId,
      sampleCount: row[COLUMN.SAMPLE_COUNT],
      latencyMs: row[COLUMN.LATENCY_MS],
      sampleQuality: row[COLUMN.SAMPLE_QUALITY],
    });

    this.emit(LATENCY_MEASUREMENT_EVENT.SAMPLE_RECORDED, {
      edgeId,
      sample,
      row,
      result,
    });
    this.stats.sampleRecordedCount += 1;
    this.stats.lastSampleRecordedAt = sample.timestamp;

    return {
      success: true,
      row,
      result,
    };
  }

  /**
   * Determine whether sample can be accepted for persistence.
   * @param {Object} sample
   * @return {boolean}
   */
  isValidSample(sample) {
    if (!sample || typeof sample !== 'object') {
      this.emitIgnoredSample(LATENCY_MEASUREMENT_REASON.INVALID_SHAPE, sample);
      return false;
    }

    if (!sample.sourceGroupId || !sample.targetGroupId ||
      !sample.sourceNodeId || !sample.targetNodeId ||
      !sample.sampleQuality) {
      this.emitIgnoredSample(LATENCY_MEASUREMENT_REASON.INVALID_SHAPE, sample);
      return false;
    }

    if (!Number.isFinite(sample.rttMs) ||
      sample.rttMs < LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS) {
      this.emitIgnoredSample(LATENCY_MEASUREMENT_REASON.INVALID_RTT, sample);
      return false;
    }

    if (this.isSampleStale(sample.timestamp)) {
      this.emitIgnoredSample(LATENCY_MEASUREMENT_REASON.STALE_SAMPLE, sample);
      return false;
    }

    return true;
  }

  /**
   * Check if sample timestamp is stale.
   * @param {number} timestamp
   * @return {boolean}
   */
  isSampleStale(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return true;
    }
    const ageMs = this.now() - timestamp;
    return ageMs > this.maxSampleAgeMs;
  }

  /**
   * Compute smoothed RTT.
   * @param {number} previousLatencyMs
   * @param {number} measuredLatencyMs
   * @return {number}
   */
  smoothLatency(previousLatencyMs, measuredLatencyMs) {
    if (!Number.isFinite(previousLatencyMs) || previousLatencyMs < 0) {
      return measuredLatencyMs;
    }
    return (this.smoothingAlpha * measuredLatencyMs) +
      ((1 - this.smoothingAlpha) * previousLatencyMs);
  }

  /**
   * Build deterministic row key for inter-group edge.
   * @param {string} sourceGroupId
   * @param {string} targetGroupId
   * @return {string}
   */
  buildLatencyEdgeId(sourceGroupId, targetGroupId) {
    return `${sourceGroupId}${LATENCY_MEASUREMENT_DEFAULT.EDGE_ID_SEPARATOR}` +
      `${targetGroupId}`;
  }

  /**
   * The base of the next edge write (census site 5, three-class rule,
   * shared row: any node of the source group may write the edge). After a
   * committed write this node keeps that row; at an unknown position (first
   * write, a failed or conflicted write, a restart) the base is one
   * committed read through the gateway, never the projection.
   * @param {string} edgeId
   * @return {Promise<Object>} {known: true, row} or
   *   {known: false, retryAfterMs}.
   * @private
   */
  async resolveCommittedEdgeBase(edgeId) {
    if (this.committedEdgeBases.has(edgeId)) {
      return {known: true, row: this.committedEdgeBases.get(edgeId)};
    }
    const read = await this.getControlPlaneSystemTableGateway()
      .readAuthoritativeRows(
        TABLES.INTER_GROUP_LATENCIES,
        INTER_GROUP_LATENCY_SQL.SELECT_BY_EDGE_ID,
        [edgeId],
        {
          workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        },
      );
    if (read?.success !== true || !Array.isArray(read.rows)) {
      return {
        known: false,
        retryAfterMs: Number.isFinite(read?.retryAfterMs) ?
          read.retryAfterMs : null,
      };
    }
    return {known: true, row: read.rows[0] ?? null};
  }

  /**
   * Keep an applied edge write as the next base; otherwise drop the kept
   * base (the next sample re-reads it from the committed authority) and
   * answer the refusal: a zero-row answer is another writer's change (typed
   * conflict), anything else an unconfirmed write.
   * @param {string} edgeId
   * @param {Object} row - The row the write carried.
   * @param {Object} result - The gateway's answer.
   * @return {Object|null} The refusal, or null when applied.
   * @private
   */
  keepCommittedEdge(edgeId, row, result) {
    const view = classifyControlPlaneMutationResult(result);
    if (view.valid && view.applied) {
      this.committedEdgeBases.set(edgeId, row);
      return null;
    }
    this.committedEdgeBases.delete(edgeId);
    const conflict = view.valid && view.zeroAffectedRows;
    return {
      success: false,
      conflict,
      reason: conflict ? LATENCY_MEASUREMENT_REASON.EDGE_CONFLICT :
        LATENCY_MEASUREMENT_REASON.EDGE_WRITE_UNCONFIRMED,
      row,
      result,
    };
  }

  /**
   * Write the edge conditionally on the committed base: a new edge only if
   * no other writer created it (INSERT OR IGNORE), an existing edge only at
   * the base's sample_count (the monotonic stored column). A zero-row
   * answer is a conflict.
   * @param {string} edgeId
   * @param {Object|null} base - The committed base row.
   * @param {Object} row - The next row.
   * @return {Promise<Object>} The gateway's answer.
   * @private
   */
  writeEdgeConditionally(edgeId, base, row) {
    const options = {
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      deliveryPriority: LATENCY_EDGE_DELIVERY_PRIORITY,
    };
    const gateway = this.getControlPlaneSystemTableGateway();
    if (base === null) {
      return gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: TABLES.INTER_GROUP_LATENCIES,
        row,
      }, {...options, ignoreExisting: true});
    }
    const {[COLUMN.LATENCY_EDGE_ID]: _key, ...data} = row;
    return gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.INTER_GROUP_LATENCIES,
      whereClause: {
        [COLUMN.LATENCY_EDGE_ID]: edgeId,
        [COLUMN.SAMPLE_COUNT]: base[COLUMN.SAMPLE_COUNT],
      },
      data,
    }, options);
  }

  /**
   * Refresh runtime config values from ConfigurationManager.
   */
  refreshConfig() {
    this.pingTimeoutMs = this.resolveNumericConfig(
      LATENCY_TOPOLOGY_CONFIG_KEY.PING_TIMEOUT_MS,
      LATENCY_TOPOLOGY_DEFAULT.PING_TIMEOUT_MS,
      LATENCY_MEASUREMENT_CONFIG_MIN.PING_TIMEOUT_MS,
    );
    this.pingRetryCount = this.resolveIntegerConfig(
      LATENCY_TOPOLOGY_CONFIG_KEY.PING_RETRY_COUNT,
      LATENCY_TOPOLOGY_DEFAULT.PING_RETRY_COUNT,
      LATENCY_TOPOLOGY_DEFAULT.PING_RETRY_COUNT,
    );
    this.smoothingAlpha = this.resolveNumericConfig(
      LATENCY_TOPOLOGY_CONFIG_KEY.SMOOTHING_ALPHA,
      LATENCY_TOPOLOGY_DEFAULT.SMOOTHING_ALPHA,
      LATENCY_MEASUREMENT_CONFIG_MIN.SMOOTHING_ALPHA,
    );
    this.recalcIntervalMs = this.resolveNumericConfig(
      LATENCY_TOPOLOGY_CONFIG_KEY.RECALC_INTERVAL_MS,
      LATENCY_TOPOLOGY_DEFAULT.RECALC_INTERVAL_MS,
      LATENCY_MEASUREMENT_CONFIG_MIN.RECALC_INTERVAL_MS,
    );
    this.maxSampleAgeMs = this.recalcIntervalMs *
      LATENCY_MEASUREMENT_DEFAULT.STALE_SAMPLE_AGE_MULTIPLIER;
  }

  /**
   * Resolve numeric config with fallback and lower bound.
   * @param {string} key
   * @param {number} fallback
   * @param {number} minValue
   * @return {number}
   * @private
   */
  resolveNumericConfig(key, fallback, minValue) {
    const value = this.config.get(key);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(minValue, value);
  }

  /**
   * Resolve integer config with fallback and lower bound.
   * @param {string} key
   * @param {number} fallback
   * @param {number} minValue
   * @return {number}
   * @private
   */
  resolveIntegerConfig(key, fallback, minValue) {
    const value = this.config.get(key);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(minValue, Math.floor(value));
  }

  /**
   * Resolve timeout value.
   * @param {number|undefined} timeoutMs
   * @return {number}
   * @private
   */
  resolveTimeoutMs(timeoutMs) {
    if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs)) {
      return this.pingTimeoutMs;
    }
    return Math.max(LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS, timeoutMs);
  }

  /**
   * Resolve retry count value.
   * @param {number|undefined} retryCount
   * @return {number}
   * @private
   */
  resolveRetryCount(retryCount) {
    if (typeof retryCount !== 'number' || !Number.isFinite(retryCount)) {
      return this.pingRetryCount;
    }
    return Math.max(0, Math.floor(retryCount));
  }

  /**
   * Emit and log ignored sample reason.
   * @param {string} reason
   * @param {Object} sample
   * @private
   */
  emitIgnoredSample(reason, sample) {
    this.logger.debug(LATENCY_MEASUREMENT_LOG_MSG.SAMPLE_IGNORED, {
      nodeId: this.nodeId,
      reason,
      sample,
    });
    this.emit(LATENCY_MEASUREMENT_EVENT.SAMPLE_IGNORED, {
      reason,
      sample,
    });
    this.stats.sampleIgnoredCount += 1;
  }

  /**
   * Get diagnostics counters.
   * @return {Object}
   */
  getStats() {
    return {
      ...this.stats,
      nodeId: this.nodeId,
      state: this.state,
    };
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      getCdcIntegrationService: () => this.cdcIntegrationService,
      getMessageRouter: () => this.messageRouter,
      getSystemTableCache: () => this.systemTableCache,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Ensure lifecycle initialization has happened.
   * @private
   */
  ensureInitialized() {
    assertCritical(
      this.state !== LATENCY_MEASUREMENT_STATE.CREATED,
      LATENCY_MEASUREMENT_ERROR_MSG.NOT_INITIALIZED,
    );
  }

  /**
   * Current wall clock timestamp.
   * @return {number}
   * @private
   */
  now() {
    return this.nowFn();
  }
}

export {LatencyMeasurementService};
