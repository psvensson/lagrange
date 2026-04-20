/**
 * HeartbeatService - Periodic heartbeat updates and consecutive
 * failure tracking. Extracted from ControlPlaneService.
 * Requirements: 8.2, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NUM,
  SERVICE_STATUS,
  STATE,
  STRING,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../constants/index.js';
import {TRANSPORT_CONFIG_KEY, TRANSPORT_DEFAULT} from '../constants/transport.js';
import {assertCritical} from '../utils/assert.js';
import {AuthoritativeControlPlaneView} from './authoritative-control-plane-view.js';
import {createControlPlaneRuntimeBundle} from './control-plane-runtime-bundle.js';
import {CONTROL_PLANE_MUTATION_MERGE_POLICY} from './control-plane-system-table-gateway.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
  getControlPlaneNodeStatePublicationProfile,
  isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
} from './control-plane-constants.js';
import {
  HEARTBEAT_CONFIG_KEY,
  HEARTBEAT_DEFAULT,
  HEARTBEAT_ERROR_MSG,
  HEARTBEAT_EVENT,
  HEARTBEAT_FAILURE_WARN_THRESHOLD,
  HEARTBEAT_LOG_MSG,
  HEARTBEAT_MEMORY_TREND,
  HEARTBEAT_QUIET_MODE_BYPASS_REASON,
  HEARTBEAT_STATE,
  HEARTBEAT_SUBSYSTEM,
} from './heartbeat-service-constants.js';
import {
  advanceMemoryTrendState,
  buildNodeHeartbeatWriteDecision,
  buildReporterHeartbeatVisibilityDecision,
  buildNodeHeartbeatStructuralSignature,
  buildNodeHeartbeatUtilizationSignature,
  incrementHistogramEntry,
  isQuietModeActive,
  normalizeHeartbeatPublicationDiagnostics,
  normalizeHeartbeatPublicationTimestamp,
  recordHeartbeatPublicationAttempt,
  recordHeartbeatPublicationSuccess,
  recordHeartbeatPublicationTarget,
  resolveHeartbeatBudgetFields,
  resolveNodeHeartbeatWriteDecision as resolveNodeHeartbeatWriteDecisionHelper,
  shouldUpsertEndpointRow,
} from './heartbeat-service-write-coalescing.js';
import {PRESSURE_WORK_CLASS} from './pressure-governor.js';
const HEARTBEAT_REPORTER_VISIBILITY_READ = Object.freeze({
  PROFILE: 'diagnostics',
  ROUTINGREADINESSDIMENSION: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
});
const HEARTBEAT_SERVICE_LITERAL = Object.freeze({
  VALUE_2: 2,
  NODE_STATE_REPORTER_TIMEOUT: 'node_state_reporter_timeout',
  HEARTBEAT: 'heartbeat',
  NODE_ROW_MISSING: 'NODE_ROW_MISSING',
  NODE_STATE_REPORTER: 'node_state_reporter',
  NODE_ROW_MISSING_FROM_CACHE: 'node_row_missing_from_cache',
  NODE_SHUTDOWN_REPORTER_UNVERIFIED: 'node_shutdown_reporter_unverified',
  NODE_ROW_MISSING_FROM_STORAGE: 'node_row_missing_from_storage',
  NODE_SHUTDOWN_CDC_UPDATE: 'node_shutdown_cdc_update',
  ATTEMPT_TIMEOUT: 'attempt_timeout',
  NO_PREVIOUS_WRITE: 'no_previous_write',
  MAX_STALENESS: 'max_staleness',
  STRUCTURAL_CHANGED: 'structural_changed',
  NODEHEARTBEATWRITES: 'nodeHeartbeatWrites',
  ENDPOINTUPSERTS: 'endpointUpserts',
  CDC_UPDATE: 'cdc_update',
  HEARTBEATSERVICE_REQUIRES_CONTROLPLANESYSTEMTABLEGATEWAY:
    'HeartbeatService requires controlPlaneSystemTableGateway',
  BACKGROUND: 'background',
  COALESCED_MIN_INTERVAL: 'coalesced_min_interval',
  UTILIZATION_CHANGED: 'utilization_changed',
  COALESCED_UNCHANGED: 'coalesced_unchanged',
  BOOLEAN: 'boolean',
});
const ZERO = 0;
const ONE = 1;
const MS_PER_MINUTE = 60000;
const MIN_REGRESSION_SAMPLE_COUNT = 2;
const REPORTER_VISIBILITY_QUERY_TIMEOUT_MS = 1000;
const ENDPOINT_ID_PREFIX = 'ep-';
const ENDPOINT_ID_SUFFIX = '-ws';
const HEARTBEAT_REPORTER_VISIBILITY_STATE = Object.freeze({
  IDLE: 'idle',
  CONFIRMED: 'confirmed',
  PENDING: 'pending',
  UNVERIFIED: 'unverified',
});
const HEARTBEAT_REPORTER_VISIBILITY_DECISION = Object.freeze({
  CONFIRMED: 'confirmed',
  SCHEDULE_VERIFICATION: 'schedule_verification',
  VERIFICATION_PENDING: 'verification_pending',
  RETRY_THROTTLED_UNVERIFIED: 'retry_throttled_unverified',
});
const HEARTBEAT_PUBLICATION_PATH = Object.freeze({
  NODE_STATE_REPORTER: 'node_state_reporter',
  NODE_STATE_REPORTER_UNVERIFIED: 'node_state_reporter_unverified',
});
const HEARTBEAT_FAILURE_STAGE = Object.freeze({REPORTER_VISIBILITY: 'reporter_visibility'});
const HEARTBEAT_FAILURE_REASON = Object.freeze({
  REPORTER_VISIBILITY_NOT_CONFIRMED: 'reporter_visibility_not_confirmed',
  REPORTER_VISIBILITY_VERIFICATION_FAILED: 'reporter_visibility_verification_failed',
});
const HEARTBEAT_WRITE_DECISION_REASON = Object.freeze({
  REPORTER_VISIBILITY_PENDING: 'reporter_visibility_pending',
  REPORTER_VISIBILITY_UNVERIFIED: 'reporter_visibility_unverified',
  RECOVERY_FAILURE_RETRY: 'recovery_failure_retry',
});
const HEARTBEAT_WRITE_DECISION_STATE = Object.freeze({
  REPORTER_VISIBILITY_PENDING: 'reporter_visibility_pending',
  REPORTER_VISIBILITY_UNVERIFIED: 'reporter_visibility_unverified',
  INITIAL_RECOVERY_REQUIRED: 'initial_recovery_required',
  RECOVERY_FAILURE_RETRY: 'recovery_failure_retry',
  STRUCTURAL_CHANGED: 'structural_changed',
  COALESCED_MIN_INTERVAL: 'coalesced_min_interval',
  UTILIZATION_CHANGED: 'utilization_changed',
  MAX_STALENESS_REFRESH: 'max_staleness_refresh',
  COALESCED_UNCHANGED: 'coalesced_unchanged',
});
/**
 * Estimate usage-percent slope (percent per minute) with linear regression.
 * @param {Array<{timestamp: number, usagePercent: number}>} samples
 * @return {number}
 */ function calculateUsageSlopePerMinute(samples) {
  if (!Array.isArray(samples) || samples.length < MIN_REGRESSION_SAMPLE_COUNT) {
    return ZERO;
  }
  const origin = samples[ZERO].timestamp;
  let sumX = ZERO;
  let sumY = ZERO;
  let sumXY = ZERO;
  let sumX2 = ZERO;
  for (const sample of samples) {
    const x = sample.timestamp - origin;
    const y = sample.usagePercent;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const count = samples.length;
  const denominator = count * sumX2 - sumX * sumX;
  if (denominator <= ZERO) {
    return ZERO;
  }
  const slopePerMs = (count * sumXY - sumX * sumY) / denominator;
  return slopePerMs * MS_PER_MINUTE;
}
class HeartbeatService extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {string} options.nodeAddress - Local node address.
   * @param {Object} options.cdcIntegrationService - CDC service.
   * @param {Object} options.systemTableCache - System table cache.
   */ constructor(options = {}) {
    super();
    this.nodeId = options.nodeId || null;
    this.nodeAddress = options.nodeAddress || null;
    this.advertisedNodeWsAddress = options.advertisedNodeWsAddress || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;
    this.quietMode = options.quietMode || null;
    this.nodeStateReporter =
      typeof options.nodeStateReporter === TYPEOF.FUNCTION ? options.nodeStateReporter : null;
    this.verifyReporterVisibilityOnSuccess = options.verifyReporterVisibilityOnSuccess === true;
    this.now = typeof options.now === TYPEOF.FUNCTION ? options.now : () => Date.now();
    this.setIntervalFn =
      typeof options.setIntervalFn === TYPEOF.FUNCTION ? options.setIntervalFn : setInterval;
    this.clearIntervalFn =
      typeof options.clearIntervalFn === TYPEOF.FUNCTION ? options.clearIntervalFn : clearInterval;
    this.setTimeoutFn =
      typeof options.setTimeoutFn === TYPEOF.FUNCTION ? options.setTimeoutFn : setTimeout;
    this.clearTimeoutFn =
      typeof options.clearTimeoutFn === TYPEOF.FUNCTION ? options.clearTimeoutFn : clearTimeout;
    this.authoritativeControlPlaneView = options.authoritativeControlPlaneView || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      (this.cdcIntegrationService || this.systemTableCache ?
        createControlPlaneRuntimeBundle({
          nodeId: this.nodeId,
          cdcIntegrationService: this.cdcIntegrationService,
          systemTableCache: this.systemTableCache,
          messageRouter: options.messageRouter || null,
          now: options.now,
        }).controlPlaneSystemTableGateway :
        null);
    const config = ConfigurationManager.getInstance();
    this.heartbeatIntervalMs =
      config.get(HEARTBEAT_CONFIG_KEY.INTERVAL_MS) || HEARTBEAT_DEFAULT.INTERVAL_MS;
    this.readyLeaseMs =
      config.get(HEARTBEAT_CONFIG_KEY.READY_LEASE_MS) || HEARTBEAT_DEFAULT.READY_LEASE_MS;
    this.endpointRefreshIntervalMs =
      Number.isFinite(options.endpointRefreshIntervalMs) &&
      options.endpointRefreshIntervalMs > ZERO ?
        Math.floor(options.endpointRefreshIntervalMs) :
        HEARTBEAT_DEFAULT.ENDPOINT_REFRESH_INTERVAL_MS;
    this.nodeMetadataMinUpdateIntervalMs =
      Number.isFinite(options.nodeMetadataMinUpdateIntervalMs) &&
      options.nodeMetadataMinUpdateIntervalMs >= ZERO ?
        Math.floor(options.nodeMetadataMinUpdateIntervalMs) :
        HEARTBEAT_DEFAULT.NODE_METADATA_MIN_UPDATE_INTERVAL_MS;
    this.nodeMetadataMaxStalenessMs =
      Number.isFinite(options.nodeMetadataMaxStalenessMs) &&
      options.nodeMetadataMaxStalenessMs > ZERO ?
        Math.floor(options.nodeMetadataMaxStalenessMs) :
        HEARTBEAT_DEFAULT.NODE_METADATA_MAX_STALENESS_MS;
    this.nodeMetadataUsagePercentBucketSize =
      Number.isFinite(options.nodeMetadataUsagePercentBucketSize) &&
      options.nodeMetadataUsagePercentBucketSize > ZERO ?
        Math.floor(options.nodeMetadataUsagePercentBucketSize) :
        HEARTBEAT_DEFAULT.NODE_METADATA_USAGE_PERCENT_BUCKET_SIZE;
    this.heartbeatAttemptTimeoutMs = this.resolveHeartbeatAttemptTimeoutMs(
      options.heartbeatAttemptTimeoutMs,
    );
    this.reporterVisibilityQueryTimeoutMs =
      Number.isFinite(options.reporterVisibilityQueryTimeoutMs) &&
      options.reporterVisibilityQueryTimeoutMs > ZERO ?
        Math.floor(options.reporterVisibilityQueryTimeoutMs) :
        REPORTER_VISIBILITY_QUERY_TIMEOUT_MS;
    this.reporterVisibilitySuccessTtlMs = this.resolveReporterVisibilitySuccessTtlMs(
      options.reporterVisibilitySuccessTtlMs,
    );
    this.reporterVisibilityRetryIntervalMs = this.resolveReporterVisibilityRetryIntervalMs(
      options.reporterVisibilityRetryIntervalMs,
    );
    this.heartbeatTimer = null;
    this.heartbeatConsecutiveFailures = NUM.ZERO;
    this.heartbeatCount = NUM.ZERO;
    this.state = HEARTBEAT_STATE.CREATED;
    this.heartbeatInFlight = false;
    this.heartbeatAttemptSequence = ZERO;
    this.activeHeartbeatAttempt = null;
    this.lastNodeHeartbeatWriteAt = null;
    this.lastNodeHeartbeatWriteSignature = null;
    this.lastNodeHeartbeatUtilizationSignature = null;
    this.lastEndpointUpsertAt = null;
    this.lastEndpointUpsertSignature = null;
    this.lastHeartbeatPublicationDecision = null;
    this.heartbeatPublicationDiagnostics = {
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureStage: null,
      lastFailureReason: null,
      publicationPath: null,
      targetAddress: null,
      targetNodeId: null,
      targetServiceType: null,
      targetServiceId: null,
      consecutiveFailures: NUM.ZERO,
    };
    this.lastReporterVisibilityVerifiedAt = null;
    this.lastReporterVisibilityTargetAddress = null;
    this.lastReporterVisibilityAttemptAt = null;
    this.lastReporterVisibilityAttemptTargetAddress = null;
    this.nodeHeartbeatReporterVisibilityState = HEARTBEAT_REPORTER_VISIBILITY_STATE.IDLE;
    this.reporterVisibilityVerificationPromise = null;
    this.quietModeSuppressedCounts = {nodeHeartbeatWrites: NUM.ZERO, endpointUpserts: NUM.ZERO};
    this.quietModeBypassReasonHistogram = {};
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(HEARTBEAT_SUBSYSTEM);
    const memoryTrend = options.memoryTrend || {};
    this.memoryTrendWindowMs =
      Number.isFinite(memoryTrend.windowMs) && memoryTrend.windowMs > ZERO ?
        memoryTrend.windowMs :
        HEARTBEAT_MEMORY_TREND.WINDOW_MS;
    this.memoryTrendMinSamples =
      Number.isFinite(memoryTrend.minSamples) &&
      memoryTrend.minSamples >= MIN_REGRESSION_SAMPLE_COUNT ?
        Math.floor(memoryTrend.minSamples) :
        HEARTBEAT_MEMORY_TREND.MIN_SAMPLES;
    this.memoryTrendSlopePercentPerMinThreshold = Number.isFinite(
      memoryTrend.slopePercentPerMinThreshold,
    ) ?
      memoryTrend.slopePercentPerMinThreshold :
      HEARTBEAT_MEMORY_TREND.SLOPE_PERCENT_PER_MIN;
    this.memoryTrendWarningPercent = Number.isFinite(memoryTrend.warningPercent) ?
      memoryTrend.warningPercent :
      HEARTBEAT_MEMORY_TREND.WARNING_PERCENT;
    this.memoryTrendWarningCooldownMs =
      Number.isFinite(memoryTrend.warningCooldownMs) && memoryTrend.warningCooldownMs >= ZERO ?
        memoryTrend.warningCooldownMs :
        HEARTBEAT_MEMORY_TREND.WARNING_COOLDOWN_MS;
    this.memoryTrendSamples = [];
    this.lastMemoryTrendWarningAt = ZERO;
  }
  /**
   * Initialize the heartbeat service.
   * Transitions: CREATED → INITIALIZED
   */ initialize() {
    assertCritical(this.nodeId, HEARTBEAT_ERROR_MSG.MISSING_NODE_ID);
    assertCritical(this.nodeAddress, HEARTBEAT_ERROR_MSG.MISSING_NODE_ADDRESS);
    assertCritical(this.cdcIntegrationService, HEARTBEAT_ERROR_MSG.MISSING_CDC);
    assertCritical(this.systemTableCache, HEARTBEAT_ERROR_MSG.MISSING_CACHE);
    this.state = HEARTBEAT_STATE.INITIALIZED;
    this.logger.info(HEARTBEAT_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      heartbeatAttemptTimeoutMs: this.heartbeatAttemptTimeoutMs,
    });
  }
  /**
   * Resolve per-attempt heartbeat timeout.
   * Keeps the timeout inside the ready-lease budget so one stalled
   * write cannot suppress all future lease refreshes.
   * @param {number|undefined} overrideMs
   * @return {number}
   * @private
   */ resolveHeartbeatAttemptTimeoutMs(overrideMs) {
    if (Number.isFinite(overrideMs) && overrideMs > ZERO) {
      return Math.floor(overrideMs);
    }
    const config = ConfigurationManager.getInstance();
    const configuredTransportTimeoutMs = config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS);
    const transportMessageTimeoutMs =
      Number.isFinite(configuredTransportTimeoutMs) && configuredTransportTimeoutMs > ZERO ?
        Math.floor(configuredTransportTimeoutMs) :
        TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS;
    const leaseSafetyWindowMs = Math.max(ONE, Math.floor(this.readyLeaseMs / 3));
    const transportSafetyWindowMs =
      transportMessageTimeoutMs + HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS;
    const defaultTimeoutMs = Math.max(
      this.heartbeatIntervalMs,
      leaseSafetyWindowMs,
      transportSafetyWindowMs,
    );
    const maxSafeTimeoutMs = Math.max(ONE, this.readyLeaseMs - this.heartbeatIntervalMs);
    return Math.max(ONE, Math.min(defaultTimeoutMs, maxSafeTimeoutMs));
  }
  /**
   * Resolve one bounded query timeout for heartbeat write-side SQL.
   * Keeps write routing below the outer heartbeat-attempt watchdog so
   * failed writes do not continue consuming resources after the attempt
   * has already been marked as timed out.
   * @return {number}
   * @private
   */ resolveHeartbeatWriteQueryTimeoutMs() {
    return Math.max(
      ONE,
      this.heartbeatAttemptTimeoutMs - HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS,
    );
  }
  /**
   * Bound how long one successful reporter visibility proof can be reused
   * before the next heartbeat forces another authoritative verification read.
   * @param {number|null|undefined} overrideMs
   * @return {number}
   * @private
   */ resolveReporterVisibilitySuccessTtlMs(overrideMs) {
    if (Number.isFinite(overrideMs) && overrideMs > ZERO) {
      return Math.floor(overrideMs);
    }
    return Math.max(
      this.heartbeatIntervalMs,
      Math.floor(this.readyLeaseMs / HEARTBEAT_SERVICE_LITERAL.VALUE_2),
    );
  }
  /**
   * Bound how often failed or unverified reporter visibility checks can
   * re-trigger authoritative readback while the hot heartbeat path is active.
   * @param {number|null|undefined} overrideMs
   * @return {number}
   * @private
   */ resolveReporterVisibilityRetryIntervalMs(overrideMs) {
    if (Number.isFinite(overrideMs) && overrideMs > ZERO) {
      return Math.floor(overrideMs);
    }
    return Math.max(
      HEARTBEAT_DEFAULT.REPORTER_VISIBILITY_RETRY_INTERVAL_MS,
      this.reporterVisibilitySuccessTtlMs,
    );
  }
  /**
   * Bound the reporter call inside the overall heartbeat write budget.
   * @param {number|null|undefined} heartbeatWriteQueryTimeoutMs
   * @return {number}
   * @private
   */ resolveNodeStateReporterTimeoutMs(heartbeatWriteQueryTimeoutMs) {
    const writeTimeoutMs = Number(heartbeatWriteQueryTimeoutMs);
    if (!Number.isFinite(writeTimeoutMs) || writeTimeoutMs <= ZERO) {
      return ONE;
    }
    const reporterSlackMs = Math.min(
      HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS,
      Math.max(ONE, Math.floor(writeTimeoutMs / 5)),
    );
    return Math.max(ONE, writeTimeoutMs - reporterSlackMs);
  }
  /**
   * Return true when one node-state reporter error was raised by the local
   * reporter timeout watchdog.
   * @param {Error|Object|null} error
   * @return {boolean}
   * @private
   */ isNodeStateReporterTimeoutError(error) {
    return error?.code === HEARTBEAT_SERVICE_LITERAL.NODE_STATE_REPORTER_TIMEOUT;
  }
  /**
   * Build one typed missing-node-row error for steady-state heartbeats.
   * @param {string} operation
   * @return {Error}
   * @private
   */ buildMissingNodeRowError(operation = HEARTBEAT_SERVICE_LITERAL.HEARTBEAT) {
    const error = new Error(`${HEARTBEAT_ERROR_MSG.NODE_ROW_MISSING}: ${this.nodeId}`);
    error.code = HEARTBEAT_SERVICE_LITERAL.NODE_ROW_MISSING;
    error.nodeId = this.nodeId;
    error.operation = operation;
    return error;
  }
  /**
   * Execute node-state reporter with an explicit timeout budget.
   * @param {Object} payload
   * @param {number} timeoutMs
   * @return {Promise<Object>}
   * @private
   */ async callNodeStateReporterWithTimeout(payload, timeoutMs) {
    const boundedTimeoutMs = Number(timeoutMs);
    if (!Number.isFinite(boundedTimeoutMs) || boundedTimeoutMs <= ZERO) {
      return this.nodeStateReporter(payload);
    }
    let timeoutHandle = null;
    let settled = false;
    return new Promise((resolve, reject) => {
      const finalize = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutHandle) {
          this.clearTimeoutFn(timeoutHandle);
          timeoutHandle = null;
        }
        callback(value);
      };
      timeoutHandle = this.setTimeoutFn(() => {
        const timeoutError = new Error(`Node-state reporter timed out after ${boundedTimeoutMs}ms`);
        timeoutError.code = HEARTBEAT_SERVICE_LITERAL.NODE_STATE_REPORTER_TIMEOUT;
        timeoutError.publicationDiagnostics = {
          publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_STATE_REPORTER,
        };
        finalize(reject, timeoutError);
      }, boundedTimeoutMs);
      if (typeof timeoutHandle?.unref === TYPEOF.FUNCTION) {
        timeoutHandle.unref();
      }
      Promise.resolve()
        .then(() => this.nodeStateReporter(payload))
        .then((result) => {
          finalize(resolve, result);
        })
        .catch((error) => {
          finalize(reject, error);
        });
    });
  }
  /**
   * Set the node-state reporter used for control-plane mediated heartbeats.
   * @param {Function|null} reporter - Async reporter callback.
   */ setNodeStateReporter(reporter) {
    this.nodeStateReporter = typeof reporter === TYPEOF.FUNCTION ? reporter : null;
  }
  /**
   * Enable or disable reporter success visibility verification.
   * Join-time READY publication may opt into one proof, while steady-state
   * heartbeats should not keep re-querying the canonical nodes row.
   * @param {boolean} enabled
   */ setVerifyReporterVisibilityOnSuccess(enabled) {
    this.verifyReporterVisibilityOnSuccess = enabled === true;
  }
  /**
   * Start periodic heartbeats.
   * Transitions: INITIALIZED → RUNNING
   * @param {Object} [options] - Heartbeat options.
   * @param {Function} [options.getStats] - Async fn returning node stats.
   * @param {Object} [options.stats] - Static node stats snapshot.
   * @param {Array<string>} [options.capabilities] - Node capabilities.
   */ start(options = {}) {
    if (this.state !== HEARTBEAT_STATE.INITIALIZED) {
      throw new Error(HEARTBEAT_ERROR_MSG.NOT_INITIALIZED);
    }
    if (this.heartbeatTimer) {
      return;
    }
    this.state = HEARTBEAT_STATE.RUNNING;
    const sendHeartbeat = async () => {
      if (this.state !== HEARTBEAT_STATE.RUNNING || this.heartbeatInFlight === true) {
        return;
      }
      const attempt = this.beginHeartbeatAttempt();
      try {
        let stats = options.stats;
        if (options.getStats) {
          try {
            stats = await options.getStats();
          } catch (error) {
            if (!attempt.timedOut) {
              this.recordFailure('stats', error.message);
            }
            return;
          }
        }
        if (attempt.timedOut) {
          return;
        }
        try {
          await this.sendHeartbeat(stats, options.capabilities);
        } catch (error) {
          if (!attempt.timedOut) {
            this.recordFailure('register', error.message);
          }
          return;
        }
        if (attempt.timedOut) {
          return;
        }
        this.heartbeatCount++;
        if (this.heartbeatConsecutiveFailures > NUM.ZERO) {
          this.logger.info(HEARTBEAT_LOG_MSG.HEARTBEAT_RECOVERED, {
            nodeId: this.nodeId,
            previousFailures: this.heartbeatConsecutiveFailures,
          });
          this.heartbeatConsecutiveFailures = NUM.ZERO;
          this.heartbeatPublicationDiagnostics.consecutiveFailures = NUM.ZERO;
        }
        this.emit(HEARTBEAT_EVENT.HEARTBEAT_SENT, {
          nodeId: this.nodeId,
          count: this.heartbeatCount,
        });
      } finally {
        this.completeHeartbeatAttempt(attempt);
      }
    };
    this.heartbeatTimer = this.setIntervalFn(sendHeartbeat, this.heartbeatIntervalMs);
    if (typeof this.heartbeatTimer?.unref === TYPEOF.FUNCTION) {
      this.heartbeatTimer.unref();
    }
    sendHeartbeat();
    this.logger.info(HEARTBEAT_LOG_MSG.STARTED, {nodeId: this.nodeId});
  }
  /**
   * Stop periodic heartbeats.
   * Transitions: RUNNING → STOPPED
   */ stop() {
    if (this.heartbeatTimer) {
      this.clearIntervalFn(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.activeHeartbeatAttempt?.timeoutHandle) {
      this.clearTimeoutFn(this.activeHeartbeatAttempt.timeoutHandle);
      this.activeHeartbeatAttempt.timeoutHandle = null;
    }
    this.activeHeartbeatAttempt = null;
    this.heartbeatInFlight = false;
    this.state = HEARTBEAT_STATE.STOPPED;
    this.logger.info(HEARTBEAT_LOG_MSG.STOPPED, {nodeId: this.nodeId});
  }
  /**
   * Publish one terminal node row before graceful shutdown tears down the
   * control-plane path. This lets immediate rejoin reuse the same node ID
   * without waiting for ready-lease expiry.
   * @return {Promise<boolean>} True when a shutdown row was published.
   */ async reportNodeShutdown() {
    const now = this.now();
    const existing = this.systemTableCache?.get(SYSTEM_TABLE_NAME.NODES, this.nodeId) || null;
    if (!existing) {
      this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_SKIPPED, {
        nodeId: this.nodeId,
        reason: HEARTBEAT_SERVICE_LITERAL.NODE_ROW_MISSING_FROM_CACHE,
      });
      return false;
    }
    const shutdownRow = {
      node_address: this.nodeAddress || existing?.node_address || STRING.UNKNOWN,
      cpu_cores: Number.isFinite(existing?.cpu_cores) ? existing.cpu_cores : NUM.ZERO,
      memory_mb: Number.isFinite(existing?.memory_mb) ? existing.memory_mb : NUM.ZERO,
      disk_gb: Number.isFinite(existing?.disk_gb) ? existing.disk_gb : NUM.ZERO,
      cpu_usage_percent: Number.isFinite(existing?.cpu_usage_percent) ?
        existing.cpu_usage_percent :
        NUM.ZERO,
      memory_usage_percent: Number.isFinite(existing?.memory_usage_percent) ?
        existing.memory_usage_percent :
        NUM.ZERO,
      disk_usage_percent: Number.isFinite(existing?.disk_usage_percent) ?
        existing.disk_usage_percent :
        NUM.ZERO,
      status: SERVICE_STATUS.STOPPED,
      connection_state: STATE.DISCONNECTED,
      capabilities: existing?.capabilities || STRING.EMPTY_JSON_ARRAY,
      last_heartbeat: now,
      ready_lease_expires_at: null,
    };
    const shutdownNodeRow = {...existing, node_id: this.nodeId, ...shutdownRow};
    const queryTimeoutMs = this.resolveHeartbeatWriteQueryTimeoutMs();
    const reporterTimeoutMs = this.resolveNodeStateReporterTimeoutMs(queryTimeoutMs);
    recordHeartbeatPublicationAttempt({
      diagnostics: this.heartbeatPublicationDiagnostics,
      heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
      startedAtMs: now,
    });
    if (typeof this.nodeStateReporter === TYPEOF.FUNCTION) {
      try {
        const reporterResult = await this.callNodeStateReporterWithTimeout(
          {
            nodeId: this.nodeId,
            nodeAddress: shutdownRow.node_address,
            state: shutdownRow.connection_state,
            capabilities: shutdownRow.capabilities,
            heartbeatAt: now,
            readyLeaseExpiresAt: null,
            nodeRow: shutdownNodeRow,
          },
          reporterTimeoutMs,
        );
        const reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(
          reporterResult,
          'node_shutdown_reporter',
        );
        const reporterVisible = await this.verifyReporterHeartbeatVisibility(now, {
          expectedStatus: SERVICE_STATUS.STOPPED,
          expectedConnectionState: STATE.DISCONNECTED,
          expectedReadyLeaseCleared: true,
        });
        if (!reporterVisible) {
          recordHeartbeatPublicationSuccess({
            diagnostics: {
              ...reporterDiagnostics,
              publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_REPORTER_UNVERIFIED,
            },
            heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
            heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
            now,
            serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
          });
          this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_PUBLISHED, {
            nodeId: this.nodeId,
            publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_REPORTER_UNVERIFIED,
          });
          return true;
        }
        recordHeartbeatPublicationSuccess({
          diagnostics: reporterDiagnostics,
          heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
          heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
          now,
          serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
        });
        this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_PUBLISHED, {
          nodeId: this.nodeId,
          publicationPath: reporterDiagnostics.publicationPath,
        });
        return true;
      } catch (error) {
        const reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(
          error?.publicationDiagnostics || error,
          'node_shutdown_reporter',
        );
        recordHeartbeatPublicationTarget({
          diagnostics: reporterDiagnostics,
          heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
          serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
        });
        error.publicationDiagnostics = reporterDiagnostics;
        throw error;
      }
    }
    const updateResult = await this.getControlPlaneSystemTableGateway().updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: this.nodeId},
      shutdownRow,
      {skipCacheWait: true, queryTimeoutMs},
    );
    const affectedRows = Number(updateResult?.partitionResult?.affectedRows);
    if (affectedRows === NUM.ZERO) {
      this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_SKIPPED, {
        nodeId: this.nodeId,
        reason: HEARTBEAT_SERVICE_LITERAL.NODE_ROW_MISSING_FROM_STORAGE,
      });
      return false;
    }
    recordHeartbeatPublicationSuccess({
      diagnostics: {publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_CDC_UPDATE},
      heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
      heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
      now,
      serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
    });
    this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_PUBLISHED, {
      nodeId: this.nodeId,
      publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_CDC_UPDATE,
    });
    return true;
  }
  /**
   * Begin one guarded heartbeat attempt with a timeout watchdog.
   * @return {{id: number, timedOut: boolean, timeoutHandle: Object|null}}
   * @private
   */ beginHeartbeatAttempt() {
    const attempt = {
      id: this.heartbeatAttemptSequence + ONE,
      timedOut: false,
      timeoutHandle: null,
      startedAtMs: this.now(),
    };
    this.heartbeatAttemptSequence = attempt.id;
    this.activeHeartbeatAttempt = attempt;
    this.heartbeatInFlight = true;
    recordHeartbeatPublicationAttempt({
      diagnostics: this.heartbeatPublicationDiagnostics,
      heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
      startedAtMs: attempt.startedAtMs,
    });
    attempt.timeoutHandle = this.setTimeoutFn(() => {
      if (attempt.timedOut) {
        return;
      }
      attempt.timedOut = true;
      this.recordFailure(
        HEARTBEAT_SERVICE_LITERAL.ATTEMPT_TIMEOUT,
        `Heartbeat attempt timed out after ${this.heartbeatAttemptTimeoutMs}ms`,
      );
      if (this.activeHeartbeatAttempt?.id === attempt.id) {
        this.activeHeartbeatAttempt = null;
        this.heartbeatInFlight = false;
      }
    }, this.heartbeatAttemptTimeoutMs);
    if (typeof attempt.timeoutHandle?.unref === TYPEOF.FUNCTION) {
      attempt.timeoutHandle.unref();
    }
    return attempt;
  }
  /**
   * Complete one heartbeat attempt and release ownership if still current.
   * @param {{id: number, timeoutHandle: Object|null}|null} attempt
   * @private
   */ completeHeartbeatAttempt(attempt) {
    if (!attempt) {
      return;
    }
    if (attempt.timeoutHandle) {
      this.clearTimeoutFn(attempt.timeoutHandle);
      attempt.timeoutHandle = null;
    }
    if (this.activeHeartbeatAttempt?.id === attempt.id) {
      this.activeHeartbeatAttempt = null;
      this.heartbeatInFlight = false;
    }
  }
  /**
   * Send a single heartbeat update.
   * @param {Object} [stats] - Node stats.
   * @param {Array<string>} [capabilities] - Node capabilities.
   * @return {Promise<void>}
   * @private
   */ async sendHeartbeat(stats, capabilities) {
    const now = this.now();
    const memoryMb = Number.isFinite(stats?.memory?.totalBytes) ?
      Math.round(stats.memory.totalBytes / NUM.BYTES_PER_MIB) :
      undefined;
    const cache = this.systemTableCache;
    const existing = cache.get(SYSTEM_TABLE_NAME.NODES, this.nodeId) || null;
    const updateRow = {
      node_address: this.nodeAddress || existing?.node_address || STRING.UNKNOWN,
      cpu_cores: Number.isFinite(stats?.cpu?.count) ?
        stats.cpu.count :
        existing?.cpu_cores || NUM.ZERO,
      memory_mb: Number.isFinite(memoryMb) ? memoryMb : existing?.memory_mb || NUM.ZERO,
      disk_gb: Number.isFinite(stats?.diskGb) ? stats.diskGb : existing?.disk_gb || NUM.ZERO,
      cpu_usage_percent: Number.isFinite(stats?.cpu?.usagePercent) ?
        stats.cpu.usagePercent :
        existing?.cpu_usage_percent || NUM.ZERO,
      memory_usage_percent: Number.isFinite(stats?.memory?.usagePercent) ?
        stats.memory.usagePercent :
        existing?.memory_usage_percent || NUM.ZERO,
      disk_usage_percent: Number.isFinite(stats?.diskUsagePercent) ?
        stats.diskUsagePercent :
        existing?.disk_usage_percent || NUM.ZERO,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: capabilities ?
        JSON.stringify(capabilities) :
        existing?.capabilities || STRING.EMPTY_JSON_ARRAY,
      last_heartbeat: now,
      ready_lease_expires_at: now + this.readyLeaseMs,
      ...resolveHeartbeatBudgetFields(existing),
    };
    this.recordMemoryTrendSample(updateRow.memory_usage_percent, now);
    const heartbeatWriteQueryTimeoutMs = this.resolveHeartbeatWriteQueryTimeoutMs();
    const quietModeActive = isQuietModeActive(this.quietMode, {
      booleanTypeValue: HEARTBEAT_SERVICE_LITERAL.BOOLEAN,
    });
    const nodeWriteDecision = this.resolveNodeHeartbeatWriteDecision(updateRow, now);
    this.lastHeartbeatPublicationDecision = nodeWriteDecision;
    let shouldWriteNodeHeartbeat = nodeWriteDecision.shouldWrite;
    if (quietModeActive && shouldWriteNodeHeartbeat) {
      if (nodeWriteDecision.reason === HEARTBEAT_SERVICE_LITERAL.NO_PREVIOUS_WRITE) {
        incrementHistogramEntry(
          this.quietModeBypassReasonHistogram,
          HEARTBEAT_QUIET_MODE_BYPASS_REASON.NODE_HEARTBEAT_INITIAL_WRITE,
          ONE,
        );
      } else if (nodeWriteDecision.reason === HEARTBEAT_SERVICE_LITERAL.MAX_STALENESS) {
        incrementHistogramEntry(
          this.quietModeBypassReasonHistogram,
          HEARTBEAT_QUIET_MODE_BYPASS_REASON.NODE_HEARTBEAT_MAX_STALENESS,
          ONE,
        );
      } else if (nodeWriteDecision.reason === HEARTBEAT_SERVICE_LITERAL.STRUCTURAL_CHANGED) {
        incrementHistogramEntry(
          this.quietModeBypassReasonHistogram,
          HEARTBEAT_QUIET_MODE_BYPASS_REASON.NODE_HEARTBEAT_STRUCTURAL_CHANGE,
          ONE,
        );
      } else if (
        nodeWriteDecision.reason === HEARTBEAT_WRITE_DECISION_REASON.REPORTER_VISIBILITY_PENDING
      ) {
        incrementHistogramEntry(
          this.quietModeBypassReasonHistogram,
          HEARTBEAT_QUIET_MODE_BYPASS_REASON.NODE_HEARTBEAT_VISIBILITY_PENDING,
          ONE,
        );
      } else if (
        nodeWriteDecision.reason === HEARTBEAT_WRITE_DECISION_REASON.REPORTER_VISIBILITY_UNVERIFIED
      ) {
        incrementHistogramEntry(
          this.quietModeBypassReasonHistogram,
          HEARTBEAT_QUIET_MODE_BYPASS_REASON.NODE_HEARTBEAT_VISIBILITY_UNVERIFIED,
          ONE,
        );
      } else {
        shouldWriteNodeHeartbeat = false;
        incrementHistogramEntry(
          this.quietModeSuppressedCounts,
          HEARTBEAT_SERVICE_LITERAL.NODEHEARTBEATWRITES,
          ONE,
        );
      }
    }
    if (shouldWriteNodeHeartbeat) {
      await this.writeNodeHeartbeat(
        updateRow,
        capabilities,
        now,
        heartbeatWriteQueryTimeoutMs,
        nodeWriteDecision.publicationMode,
      );
    } // Register or refresh WebSocket endpoint, but avoid rewriting unchanged
    // endpoint rows on every heartbeat.
    const endpointId = `${ENDPOINT_ID_PREFIX}${this.nodeId}${ENDPOINT_ID_SUFFIX}`;
    const existingEp = cache.get(SYSTEM_TABLE_NAME.NODE_ENDPOINTS, endpointId) || null;
    const endpointRow = this.buildEndpointRow(existingEp, now);
    if (
      shouldUpsertEndpointRow(endpointRow, now, {
        buildEndpointUpsertSignature: (row) => this.buildEndpointUpsertSignature(row),
        endpointRefreshIntervalMs: this.endpointRefreshIntervalMs,
        lastEndpointUpsertAt: this.lastEndpointUpsertAt,
        lastEndpointUpsertSignature: this.lastEndpointUpsertSignature,
      })
    ) {
      if (quietModeActive) {
        incrementHistogramEntry(
          this.quietModeSuppressedCounts,
          HEARTBEAT_SERVICE_LITERAL.ENDPOINTUPSERTS,
          ONE,
        );
        return;
      }
      await this.getControlPlaneSystemTableGateway().upsertSystemTableRow(
        SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
        endpointRow,
        this.buildEndpointHeartbeatWriteOptions(endpointId, heartbeatWriteQueryTimeoutMs),
      );
      this.lastEndpointUpsertAt = now;
      this.lastEndpointUpsertSignature = this.buildEndpointUpsertSignature(endpointRow);
    }
  }
  /**
   * Persist or report the current node heartbeat row.
   * Joiners can report through the control-plane message path to avoid
   * routed SQL liveness flaps during membership changes.
   * @param {Object} updateRow
   * @param {Array<string>|string|null} capabilities
   * @param {number} now
   * @param {number} [queryTimeoutMs]
   * @return {Promise<void>}
   * @private
   */ async writeNodeHeartbeat(
    updateRow,
    capabilities,
    now,
    queryTimeoutMs = null,
    publicationMode = CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
  ) {
    const heartbeatWriteQueryTimeoutMs =
      Number.isFinite(queryTimeoutMs) && queryTimeoutMs > ZERO ?
        Math.floor(queryTimeoutMs) :
        this.resolveHeartbeatWriteQueryTimeoutMs();
    const reporterTimeoutMs = this.resolveNodeStateReporterTimeoutMs(heartbeatWriteQueryTimeoutMs);
    if (typeof this.nodeStateReporter === TYPEOF.FUNCTION) {
      try {
        const reporterResult = await this.callNodeStateReporterWithTimeout(
          {
            nodeId: this.nodeId,
            nodeAddress: updateRow.node_address,
            state: updateRow.connection_state,
            capabilities: capabilities ?? updateRow.capabilities,
            heartbeatAt: now,
            readyLeaseExpiresAt: updateRow.ready_lease_expires_at,
            heartbeatOnly: true,
            nodeStatePublicationMode: publicationMode,
            nodeRow: {...updateRow},
          },
          reporterTimeoutMs,
        );
        const reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(
          reporterResult,
          HEARTBEAT_PUBLICATION_PATH.NODE_STATE_REPORTER,
        );
        const visibilityDecision = this.resolveReporterHeartbeatVisibilityDecision(
          reporterDiagnostics,
          now,
        );
        this.nodeHeartbeatReporterVisibilityState = visibilityDecision.nextState;
        if (visibilityDecision.outcome === HEARTBEAT_REPORTER_VISIBILITY_DECISION.CONFIRMED) {
          recordHeartbeatPublicationSuccess({
            diagnostics: reporterDiagnostics,
            heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
            heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
            now,
            serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
          });
          this.recordConfirmedNodeHeartbeatWrite(updateRow, now);
          return;
        }
        if (
          visibilityDecision.outcome ===
          HEARTBEAT_REPORTER_VISIBILITY_DECISION.SCHEDULE_VERIFICATION
        ) {
          this.scheduleReporterHeartbeatVisibilityVerification(now, reporterDiagnostics, {
            onVisible: () => {
              recordHeartbeatPublicationSuccess({
                diagnostics: reporterDiagnostics,
                heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
                heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
                now,
                serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
              });
              this.recordConfirmedNodeHeartbeatWrite(updateRow, now);
            },
          });
          this.lastReporterVisibilityTargetAddress = reporterDiagnostics.targetAddress || null;
          return;
        }
        return;
      } catch (error) {
        const reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(
          error?.publicationDiagnostics || error,
          HEARTBEAT_PUBLICATION_PATH.NODE_STATE_REPORTER,
        );
        recordHeartbeatPublicationTarget({
          diagnostics: reporterDiagnostics,
          heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
          serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
        });
        this.nodeHeartbeatReporterVisibilityState = HEARTBEAT_REPORTER_VISIBILITY_STATE.UNVERIFIED;
        error.publicationDiagnostics = reporterDiagnostics;
        throw error;
      }
    }
    const updateResult = await this.getControlPlaneSystemTableGateway().updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: this.nodeId},
      updateRow,
      this.buildNodeHeartbeatWriteOptions(heartbeatWriteQueryTimeoutMs, publicationMode),
    );
    const affectedRows = Number(updateResult?.partitionResult?.affectedRows);
    if (affectedRows === NUM.ZERO) {
      throw this.buildMissingNodeRowError(HEARTBEAT_SERVICE_LITERAL.HEARTBEAT);
    }
    recordHeartbeatPublicationSuccess({
      diagnostics: {publicationPath: HEARTBEAT_SERVICE_LITERAL.CDC_UPDATE},
      heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
      heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
      now,
      serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
    });
    this.recordConfirmedNodeHeartbeatWrite(updateRow, now);
  }
  /**
   * Normalize reporter heartbeat visibility evidence into one canonical
   * decision so coalescing and verification follow one state owner.
   * @param {Object|null} reporterDiagnostics
   * @param {number} nowMs
   * @return {{outcome: string, nextState: string}}
   * @private
   */ resolveReporterHeartbeatVisibilityDecision(reporterDiagnostics, nowMs) {
    if (this.verifyReporterVisibilityOnSuccess !== true) {
      return buildReporterHeartbeatVisibilityDecision(
        HEARTBEAT_REPORTER_VISIBILITY_DECISION.CONFIRMED,
        HEARTBEAT_REPORTER_VISIBILITY_STATE.CONFIRMED,
      );
    }
    if (
      this.nodeHeartbeatReporterVisibilityState === HEARTBEAT_REPORTER_VISIBILITY_STATE.CONFIRMED &&
      this.isReporterHeartbeatVisibilityConfirmed(reporterDiagnostics, nowMs)
    ) {
      return buildReporterHeartbeatVisibilityDecision(
        HEARTBEAT_REPORTER_VISIBILITY_DECISION.CONFIRMED,
        HEARTBEAT_REPORTER_VISIBILITY_STATE.CONFIRMED,
      );
    }
    if (this.shouldVerifyReporterHeartbeatVisibility(reporterDiagnostics, nowMs)) {
      return buildReporterHeartbeatVisibilityDecision(
        HEARTBEAT_REPORTER_VISIBILITY_DECISION.SCHEDULE_VERIFICATION,
        HEARTBEAT_REPORTER_VISIBILITY_STATE.PENDING,
      );
    }
    if (this.reporterVisibilityVerificationPromise) {
      return buildReporterHeartbeatVisibilityDecision(
        HEARTBEAT_REPORTER_VISIBILITY_DECISION.VERIFICATION_PENDING,
        HEARTBEAT_REPORTER_VISIBILITY_STATE.PENDING,
      );
    }
    return buildReporterHeartbeatVisibilityDecision(
      HEARTBEAT_REPORTER_VISIBILITY_DECISION.RETRY_THROTTLED_UNVERIFIED,
      HEARTBEAT_REPORTER_VISIBILITY_STATE.UNVERIFIED,
    );
  }
  /**
   * Reuse a recent successful reporter visibility proof for steady-state
   * heartbeats so repeated success acknowledgements do not force routed
   * verification reads on every interval.
   * @param {Object} reporterDiagnostics
   * @param {number} nowMs
   * @return {boolean}
   * @private
   */ shouldVerifyReporterHeartbeatVisibility(reporterDiagnostics, nowMs) {
    if (this.verifyReporterVisibilityOnSuccess !== true) {
      return false;
    }
    if (this.reporterVisibilityVerificationPromise) {
      return false;
    }
    const targetAddress = reporterDiagnostics?.targetAddress || null;
    const hasVerifiedProof =
      Number.isFinite(this.lastReporterVisibilityVerifiedAt) &&
      this.lastReporterVisibilityVerifiedAt > ZERO;
    if (!hasVerifiedProof) {
      const targetChangedSinceLastAttempt =
        targetAddress && targetAddress !== this.lastReporterVisibilityAttemptTargetAddress;
      if (
        !targetChangedSinceLastAttempt &&
        Number.isFinite(this.lastReporterVisibilityAttemptAt) &&
        this.lastReporterVisibilityAttemptAt > ZERO &&
        nowMs - this.lastReporterVisibilityAttemptAt < this.reporterVisibilityRetryIntervalMs
      ) {
        return false;
      }
      return true;
    }
    if (targetAddress && targetAddress !== this.lastReporterVisibilityTargetAddress) {
      return true;
    }
    return nowMs - this.lastReporterVisibilityVerifiedAt >= this.reporterVisibilitySuccessTtlMs;
  }
  isReporterHeartbeatVisibilityConfirmed(reporterDiagnostics, nowMs) {
    if (this.verifyReporterVisibilityOnSuccess !== true) {
      return true;
    }
    if (this.reporterVisibilityVerificationPromise) {
      return false;
    }
    if (
      !Number.isFinite(this.lastReporterVisibilityVerifiedAt) ||
      this.lastReporterVisibilityVerifiedAt <= ZERO
    ) {
      return false;
    }
    const targetAddress = reporterDiagnostics?.targetAddress || null;
    if (targetAddress && targetAddress !== this.lastReporterVisibilityTargetAddress) {
      return false;
    }
    return nowMs - this.lastReporterVisibilityVerifiedAt < this.reporterVisibilitySuccessTtlMs;
  }
  /**
   * Schedule one bounded canonical visibility proof outside the hot heartbeat
   * path. Reporter acknowledgement remains the owner-path success signal; this
   * readback is only a throttled diagnostic proof.
   * @param {number} expectedHeartbeatAt
   * @param {Object|null} reporterDiagnostics
   * @param {Object} [options]
   * @param {Function} [options.onVisible]
   * @return {Promise<void>|null}
   * @private
   */ scheduleReporterHeartbeatVisibilityVerification(
    expectedHeartbeatAt,
    reporterDiagnostics,
    options = {},
  ) {
    const normalizedDiagnostics = normalizeHeartbeatPublicationDiagnostics(
      reporterDiagnostics,
      HEARTBEAT_PUBLICATION_PATH.NODE_STATE_REPORTER,
    );
    const nowMs = this.now();
    if (!this.shouldVerifyReporterHeartbeatVisibility(normalizedDiagnostics, nowMs)) {
      return null;
    }
    this.lastReporterVisibilityAttemptAt = nowMs;
    this.lastReporterVisibilityAttemptTargetAddress = normalizedDiagnostics.targetAddress || null;
    const verificationToken = {};
    const verificationPromise = new Promise((resolve) => {
      const timeoutHandle = this.setTimeoutFn(async () => {
        try {
          if (
            typeof this.nodeStateReporter !== TYPEOF.FUNCTION ||
            this.verifyReporterVisibilityOnSuccess !== true
          ) {
            return;
          }
          const reporterVisible = await this.verifyReporterHeartbeatVisibility(
            expectedHeartbeatAt,
            options,
          );
          if (reporterVisible) {
            this.lastReporterVisibilityVerifiedAt = this.now();
            this.lastReporterVisibilityTargetAddress = normalizedDiagnostics.targetAddress || null;
            if (typeof options.onVisible === TYPEOF.FUNCTION) {
              options.onVisible();
            }
            return;
          }
          this.recordReporterHeartbeatVisibilityFailure(
            normalizedDiagnostics,
            HEARTBEAT_FAILURE_REASON.REPORTER_VISIBILITY_NOT_CONFIRMED,
          );
        } catch (error) {
          this.recordReporterHeartbeatVisibilityFailure(
            normalizedDiagnostics,
            HEARTBEAT_FAILURE_REASON.REPORTER_VISIBILITY_VERIFICATION_FAILED,
          );
          this.logger.debug('Reporter heartbeat visibility verification failed', {
            nodeId: this.nodeId,
            error: error?.message || String(error),
            targetAddress: normalizedDiagnostics.targetAddress || null,
          });
        } finally {
          if (this.reporterVisibilityVerificationPromise === verificationToken) {
            this.reporterVisibilityVerificationPromise = null;
          }
          resolve();
        }
      }, ZERO);
      if (typeof timeoutHandle?.unref === TYPEOF.FUNCTION) {
        timeoutHandle.unref();
      }
    });
    this.reporterVisibilityVerificationPromise = verificationToken;
    return verificationPromise;
  }
  recordReporterHeartbeatVisibilityFailure(reporterDiagnostics, failureReason) {
    this.nodeHeartbeatReporterVisibilityState = HEARTBEAT_REPORTER_VISIBILITY_STATE.UNVERIFIED;
    recordHeartbeatPublicationTarget({
      diagnostics: {
        ...reporterDiagnostics,
        publicationPath: HEARTBEAT_PUBLICATION_PATH.NODE_STATE_REPORTER_UNVERIFIED,
      },
      heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
      serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
    });
    this.recordFailure(HEARTBEAT_FAILURE_STAGE.REPORTER_VISIBILITY, failureReason);
  }
  recordConfirmedNodeHeartbeatWrite(updateRow, now) {
    this.lastNodeHeartbeatWriteAt = now;
    this.lastNodeHeartbeatWriteSignature = buildNodeHeartbeatStructuralSignature(updateRow);
    this.lastNodeHeartbeatUtilizationSignature =
      buildNodeHeartbeatUtilizationSignature(updateRow, {
        bucketSize: this.nodeMetadataUsagePercentBucketSize,
        oneValue: ONE,
      });
    this.nodeHeartbeatReporterVisibilityState = HEARTBEAT_REPORTER_VISIBILITY_STATE.CONFIRMED;
    this.lastHeartbeatPublicationDecision = null;
  }
  /**
   * Verify that a successful node-state reporter heartbeat became visible in
   * the canonical nodes row before we treat delivery as sufficient.
   * @param {number} expectedHeartbeatAt
   * @param {Object} [options]
   * @param {string|null} [options.expectedStatus]
   * @param {string|null} [options.expectedConnectionState]
   * @param {boolean} [options.expectedReadyLeaseCleared]
   * @return {Promise<boolean>}
   * @private
   */ async verifyReporterHeartbeatVisibility(expectedHeartbeatAt, options = {}) {
    const authoritativeControlPlaneView = this.getAuthoritativeControlPlaneView();
    if (
      !authoritativeControlPlaneView ||
      typeof authoritativeControlPlaneView.canRead !== TYPEOF.FUNCTION ||
      authoritativeControlPlaneView.canRead() !== true
    ) {
      return true;
    }
    try {
      const result = await authoritativeControlPlaneView.readRows(
        SYSTEM_TABLE_NAME.NODES,
        `SELECT * FROM ${SYSTEM_TABLE_NAME.NODES} WHERE node_id = ?`,
        [this.nodeId],
        {
          readProfile: HEARTBEAT_REPORTER_VISIBILITY_READ.PROFILE,
          routingReadinessDimension: HEARTBEAT_REPORTER_VISIBILITY_READ.ROUTINGREADINESSDIMENSION,
          queryTimeoutMs: this.reporterVisibilityQueryTimeoutMs,
        },
      );
      if (!result?.success) {
        return false;
      }
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const nodeRow =
        rows.find((row) => {
          return row?.[COLUMN.NODE_ID] === this.nodeId || row?.node_id === this.nodeId;
        }) ||
        rows[ZERO] ||
        null;
      const lastHeartbeat = Number(nodeRow?.[COLUMN.LAST_HEARTBEAT] ?? nodeRow?.last_heartbeat);
      if (!Number.isFinite(lastHeartbeat) || lastHeartbeat < expectedHeartbeatAt) {
        return false;
      }
      if (
        typeof options.expectedStatus === TYPEOF.STRING &&
        nodeRow?.[COLUMN.STATUS] !== options.expectedStatus &&
        nodeRow?.status !== options.expectedStatus
      ) {
        return false;
      }
      if (
        typeof options.expectedConnectionState === TYPEOF.STRING &&
        nodeRow?.[COLUMN.CONNECTION_STATE] !== options.expectedConnectionState &&
        nodeRow?.connection_state !== options.expectedConnectionState
      ) {
        return false;
      }
      if (options.expectedReadyLeaseCleared === true) {
        const readyLeaseExpiresAt =
          nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT] ?? nodeRow?.ready_lease_expires_at;
        if (readyLeaseExpiresAt !== null && readyLeaseExpiresAt !== undefined) {
          return false;
        }
      }
      return true;
    } catch (_error) {
      return false;
    }
  }
  /**
   * Resolve the shared authoritative control-plane view.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */ getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    if (!this.cdcIntegrationService) {
      return null;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter || null,
      now: this.now,
      queryTimeoutMs: this.reporterVisibilityQueryTimeoutMs,
    });
    return this.authoritativeControlPlaneView;
  }
  /**
   * Resolve the canonical system-table gateway for heartbeat writes.
   * @return {Object}
   * @private
   */ getControlPlaneSystemTableGateway() {
    return assertCritical(
      this.controlPlaneSystemTableGateway,
      HEARTBEAT_SERVICE_LITERAL.HEARTBEATSERVICE_REQUIRES_CONTROLPLANESYSTEMTABLEGATEWAY,
    );
  }
  /**
   * Apply the canonical guarded disconnect for a node whose ready lease expired.
   * @param {Object} node - Observed node snapshot.
   * @param {number} now - Current timestamp.
   * @return {Promise<Object>} CDC mutation result.
   */ async disconnectNodeDueToLeaseExpiry(node, now) {
    const whereClause = {
      node_id: node.node_id,
      ready_lease_expires_at: node.ready_lease_expires_at,
      last_heartbeat: node.last_heartbeat || now,
    };
    try {
      return await this.getControlPlaneSystemTableGateway().updateSystemTableRow(
        SYSTEM_TABLE_NAME.NODES,
        whereClause,
        {connection_state: STATE.DISCONNECTED, ready_lease_expires_at: null},
      );
    } catch (error) {
      this.logger.error(HEARTBEAT_LOG_MSG.LEASE_EXPIRY_DISCONNECT_FAILED, {
        nodeId: node.node_id,
        error: error.message,
      });
      throw error;
    }
  }
  /**
   * Build node endpoint row payload for node_endpoints upsert.
   * @param {Object|null} existingEp
   * @param {number} now
   * @return {Object}
   * @private
   */ buildEndpointRow(existingEp, now) {
    return {
      [COLUMN.ENDPOINT_ID]: `${ENDPOINT_ID_PREFIX}${this.nodeId}${ENDPOINT_ID_SUFFIX}`,
      [COLUMN.NODE_ID]: this.nodeId,
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.ADDRESS]: this.advertisedNodeWsAddress || this.nodeAddress,
      [COLUMN.PRIORITY]: NUM.ZERO,
      [COLUMN.METADATA]: existingEp?.[COLUMN.METADATA] || JSON.stringify({}),
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.CREATED_AT]: existingEp?.[COLUMN.CREATED_AT] || now,
      [COLUMN.UPDATED_AT]: now,
    };
  }
  /**
   * Build signature used to detect materially-changed endpoint rows.
   * @param {Object} endpointRow
   * @return {string}
   * @private
   */ buildEndpointUpsertSignature(endpointRow) {
    return JSON.stringify({
      endpointId: endpointRow[COLUMN.ENDPOINT_ID],
      nodeId: endpointRow[COLUMN.NODE_ID],
      transportType: endpointRow[COLUMN.TRANSPORT_TYPE],
      address: endpointRow[COLUMN.ADDRESS],
      priority: endpointRow[COLUMN.PRIORITY],
      metadata: endpointRow[COLUMN.METADATA],
      status: endpointRow[COLUMN.STATUS],
    });
  }
  buildNodeHeartbeatWriteOptions(
    queryTimeoutMs,
    publicationMode = CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
  ) {
    const publicationProfile = getControlPlaneNodeStatePublicationProfile({publicationMode});
    return {
      ...this.buildSharedHeartbeatWriteOptions(queryTimeoutMs),
      allowPressureDefer: publicationProfile.allowPressureDefer,
      coalescingKey: `heartbeat:nodes:${this.nodeId}`,
      deliveryPriority: publicationProfile.deliveryPriority,
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
      workloadClass: publicationProfile.workloadClass,
      workClass: publicationProfile.workClass,
    };
  }
  buildEndpointHeartbeatWriteOptions(endpointId, queryTimeoutMs) {
    return {
      ...this.buildSharedHeartbeatWriteOptions(queryTimeoutMs),
      coalescingKey: `heartbeat:endpoint:${endpointId}`,
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    };
  }
  buildSharedHeartbeatWriteOptions(queryTimeoutMs) {
    return {
      allowCoalescing: true,
      allowPressureDefer: true,
      deliveryPriority: HEARTBEAT_SERVICE_LITERAL.BACKGROUND,
      // Heartbeats are liveness signals and must not wait for local cache
      // convergence on the write path.
      pressureRetryAfterMs: this.heartbeatIntervalMs,
      queryTimeoutMs,
      skipCacheWait: true,
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    };
  }
  resolveNodeHeartbeatWriteDecision(updateRow, now) {
    return resolveNodeHeartbeatWriteDecisionHelper(updateRow, now, {
      buildNodeHeartbeatWriteDecision,
      heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
      isHeartbeatEscalatedPublicationMode:
        isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
      lastHeartbeatPublicationDecision: this.lastHeartbeatPublicationDecision,
      lastNodeHeartbeatUtilizationSignature: this.lastNodeHeartbeatUtilizationSignature,
      lastNodeHeartbeatWriteAt: this.lastNodeHeartbeatWriteAt,
      lastNodeHeartbeatWriteSignature: this.lastNodeHeartbeatWriteSignature,
      nodeHeartbeatReporterVisibilityState: this.nodeHeartbeatReporterVisibilityState,
      nodeMetadataMaxStalenessMs: this.nodeMetadataMaxStalenessMs,
      nodeMetadataMinUpdateIntervalMs: this.nodeMetadataMinUpdateIntervalMs,
      nodeMetadataUsagePercentBucketSize: this.nodeMetadataUsagePercentBucketSize,
      oneValue: ONE,
      publicationMode: CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
      reporterVisibilityState: HEARTBEAT_REPORTER_VISIBILITY_STATE,
      serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
      writeDecisionReason: HEARTBEAT_WRITE_DECISION_REASON,
      writeDecisionState: HEARTBEAT_WRITE_DECISION_STATE,
    });
  }
  /**
   * Get quiet-mode bypass reason histogram snapshot.
   * @return {Object}
   */ getQuietModeBypassReasonHistogram() {
    return {...this.quietModeBypassReasonHistogram};
  }
  /**
   * Track memory usage trend and emit warning events on sustained growth.
   * @param {number} memoryUsagePercent
   * @param {number} timestamp
   */ recordMemoryTrendSample(memoryUsagePercent, timestamp) {
    const outcome = advanceMemoryTrendState(memoryUsagePercent, timestamp, {
      calculateUsageSlopePerMinute,
      lastMemoryTrendWarningAt: this.lastMemoryTrendWarningAt,
      memoryTrendMinSamples: this.memoryTrendMinSamples,
      memoryTrendSamples: this.memoryTrendSamples,
      memoryTrendSlopePercentPerMinThreshold:
        this.memoryTrendSlopePercentPerMinThreshold,
      memoryTrendWarningCooldownMs: this.memoryTrendWarningCooldownMs,
      memoryTrendWarningPercent: this.memoryTrendWarningPercent,
      memoryTrendWindowMs: this.memoryTrendWindowMs,
      nodeId: this.nodeId,
      oneValue: ONE,
    });
    this.memoryTrendSamples = outcome.samples;
    this.lastMemoryTrendWarningAt = outcome.lastWarningAt;
    if (!outcome.warning) {
      return;
    }
    this.logger.warn(HEARTBEAT_LOG_MSG.MEMORY_TREND_WARNING, outcome.warning);
    this.emit(HEARTBEAT_EVENT.MEMORY_TREND_WARNING, outcome.warning);
  }
  /**
   * Record a heartbeat failure.
   * @param {string} stage - Failure stage.
   * @param {string} errorMessage - Error message.
   * @private
   */ recordFailure(stage, errorMessage) {
    this.heartbeatConsecutiveFailures++;
    this.heartbeatPublicationDiagnostics.lastFailureAt = normalizeHeartbeatPublicationTimestamp(
      this.now(),
    );
    this.heartbeatPublicationDiagnostics.lastFailureStage = stage;
    this.heartbeatPublicationDiagnostics.lastFailureReason = errorMessage;
    this.heartbeatPublicationDiagnostics.consecutiveFailures = this.heartbeatConsecutiveFailures;
    const logData = {
      nodeId: this.nodeId,
      stage,
      error: errorMessage,
      consecutiveFailures: this.heartbeatConsecutiveFailures,
    };
    if (this.heartbeatConsecutiveFailures >= HEARTBEAT_FAILURE_WARN_THRESHOLD) {
      this.logger.warn(HEARTBEAT_LOG_MSG.HEARTBEAT_CONSECUTIVE_FAILURES, logData);
    } else {
      this.logger.debug(HEARTBEAT_LOG_MSG.HEARTBEAT_FAILED, logData);
    }
    this.emit(HEARTBEAT_EVENT.HEARTBEAT_FAILED, {
      nodeId: this.nodeId,
      stage,
      error: errorMessage,
      consecutiveFailures: this.heartbeatConsecutiveFailures,
    });
  }
  /**
   * Get the current heartbeat count.
   * @return {number} Number of successful heartbeats.
   */ getHeartbeatCount() {
    return this.heartbeatCount;
  }
  /**
   * Get the current state.
   * @return {string} Current lifecycle state.
   */ getState() {
    return this.state;
  }
  /**
   * Return the latest heartbeat publication diagnostics.
   * @return {Object}
   */ getHeartbeatPublicationDiagnostics() {
    return Object.freeze({...this.heartbeatPublicationDiagnostics});
  }
}

export {HeartbeatService, calculateUsageSlopePerMinute};
