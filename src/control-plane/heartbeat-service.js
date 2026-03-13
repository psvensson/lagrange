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
import {
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
} from '../constants/transport.js';
import {assertCritical} from '../utils/assert.js';
import {AuthoritativeControlPlaneView} from
  './authoritative-control-plane-view.js';
import {
  ControlPlaneSystemTableGateway,
} from './control-plane-system-table-gateway.js';
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

const ZERO = 0;
const ONE = 1;
const MS_PER_MINUTE = 60000;
const MIN_REGRESSION_SAMPLE_COUNT = 2;
const REPORTER_VISIBILITY_QUERY_TIMEOUT_MS = 1000;

const ENDPOINT_ID_PREFIX = 'ep-';
const ENDPOINT_ID_SUFFIX = '-ws';

function normalizeHeartbeatPublicationTimestamp(value) {
  if (typeof value === TYPEOF.STRING && value.length > ZERO) {
    return value;
  }
  const timestampMs = Number(value);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  return new Date(timestampMs).toISOString();
}

function normalizeHeartbeatPublicationDiagnostics(source, fallbackPath = null) {
  const value = source && typeof source === TYPEOF.OBJECT ? source : {};
  const targetAddress = typeof value.targetAddress === TYPEOF.STRING &&
    value.targetAddress.length > ZERO ?
    value.targetAddress :
    null;
  const addressParts = targetAddress ? targetAddress.split('/') : [];
  const targetNodeId = typeof value.targetNodeId === TYPEOF.STRING &&
    value.targetNodeId.length > ZERO ?
    value.targetNodeId :
    (addressParts[ZERO] || null);
  const targetServiceType = typeof value.targetServiceType === TYPEOF.STRING &&
    value.targetServiceType.length > ZERO ?
    value.targetServiceType :
    (addressParts[ONE] || null);
  const targetServiceId = typeof value.targetServiceId === TYPEOF.STRING &&
    value.targetServiceId.length > ZERO ?
    value.targetServiceId :
    (addressParts.slice(2).join('/') || null);
  const publicationPath = typeof value.publicationPath === TYPEOF.STRING &&
    value.publicationPath.length > ZERO ?
    value.publicationPath :
    fallbackPath;

  return {
    publicationPath,
    targetAddress,
    targetNodeId,
    targetServiceType,
    targetServiceId,
  };
}

/**
 * Estimate usage-percent slope (percent per minute) with linear regression.
 * @param {Array<{timestamp: number, usagePercent: number}>} samples
 * @return {number}
 */
function calculateUsageSlopePerMinute(samples) {
  if (!Array.isArray(samples) ||
      samples.length < MIN_REGRESSION_SAMPLE_COUNT) {
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
  const denominator = (count * sumX2) - (sumX * sumX);
  if (denominator <= ZERO) {
    return ZERO;
  }

  const slopePerMs = ((count * sumXY) - (sumX * sumY)) / denominator;
  return slopePerMs * MS_PER_MINUTE;
}

class HeartbeatService extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {string} options.nodeAddress - Local node address.
   * @param {Object} options.cdcIntegrationService - CDC service.
   * @param {Object} options.systemTableCache - System table cache.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || null;
    this.nodeAddress = options.nodeAddress || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;
    this.quietMode = options.quietMode || null;
    this.nodeStateReporter = typeof options.nodeStateReporter === 'function' ?
      options.nodeStateReporter :
      null;
    this.verifyReporterVisibilityOnSuccess =
      options.verifyReporterVisibilityOnSuccess === true;
    this.fallbackToCdcOnReporterVisibilityGap =
      options.fallbackToCdcOnReporterVisibilityGap === true;
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this.setIntervalFn = typeof options.setIntervalFn === 'function' ?
      options.setIntervalFn :
      setInterval;
    this.clearIntervalFn = typeof options.clearIntervalFn === 'function' ?
      options.clearIntervalFn :
      clearInterval;
    this.setTimeoutFn = typeof options.setTimeoutFn === 'function' ?
      options.setTimeoutFn :
      setTimeout;
    this.clearTimeoutFn = typeof options.clearTimeoutFn === 'function' ?
      options.clearTimeoutFn :
      clearTimeout;
    this.authoritativeControlPlaneView =
      options.authoritativeControlPlaneView || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      new ControlPlaneSystemTableGateway({
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        now: this.now,
      });

    const config = ConfigurationManager.getInstance();
    this.heartbeatIntervalMs =
      config.get(HEARTBEAT_CONFIG_KEY.INTERVAL_MS) ||
      HEARTBEAT_DEFAULT.INTERVAL_MS;
    this.readyLeaseMs =
      config.get(HEARTBEAT_CONFIG_KEY.READY_LEASE_MS) ||
      HEARTBEAT_DEFAULT.READY_LEASE_MS;
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
    this.heartbeatAttemptTimeoutMs =
      this.resolveHeartbeatAttemptTimeoutMs(options.heartbeatAttemptTimeoutMs);
    this.reporterVisibilityQueryTimeoutMs =
      Number.isFinite(options.reporterVisibilityQueryTimeoutMs) &&
        options.reporterVisibilityQueryTimeoutMs > ZERO ?
        Math.floor(options.reporterVisibilityQueryTimeoutMs) :
        REPORTER_VISIBILITY_QUERY_TIMEOUT_MS;

    this.heartbeatTimer = null;
    this.heartbeatConsecutiveFailures = NUM.ZERO;
    this.heartbeatCount = NUM.ZERO;
    this.state = HEARTBEAT_STATE.CREATED;
    this.heartbeatInFlight = false;
    this.heartbeatAttemptSequence = ZERO;
    this.activeHeartbeatAttempt = null;
    this.lastNodeHeartbeatWriteAt = null;
    this.lastNodeHeartbeatWriteSignature = null;
    this.lastEndpointUpsertAt = null;
    this.lastEndpointUpsertSignature = null;
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
    this.quietModeSuppressedCounts = {
      nodeHeartbeatWrites: NUM.ZERO,
      endpointUpserts: NUM.ZERO,
    };
    this.quietModeBypassReasonHistogram = {};

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(HEARTBEAT_SUBSYSTEM);

    const memoryTrend = options.memoryTrend || {};
    this.memoryTrendWindowMs = Number.isFinite(memoryTrend.windowMs) &&
      memoryTrend.windowMs > ZERO ?
      memoryTrend.windowMs :
      HEARTBEAT_MEMORY_TREND.WINDOW_MS;
    this.memoryTrendMinSamples = Number.isFinite(memoryTrend.minSamples) &&
      memoryTrend.minSamples >= MIN_REGRESSION_SAMPLE_COUNT ?
      Math.floor(memoryTrend.minSamples) :
      HEARTBEAT_MEMORY_TREND.MIN_SAMPLES;
    this.memoryTrendSlopePercentPerMinThreshold =
      Number.isFinite(memoryTrend.slopePercentPerMinThreshold) ?
        memoryTrend.slopePercentPerMinThreshold :
        HEARTBEAT_MEMORY_TREND.SLOPE_PERCENT_PER_MIN;
    this.memoryTrendWarningPercent =
      Number.isFinite(memoryTrend.warningPercent) ?
        memoryTrend.warningPercent :
        HEARTBEAT_MEMORY_TREND.WARNING_PERCENT;
    this.memoryTrendWarningCooldownMs =
      Number.isFinite(memoryTrend.warningCooldownMs) &&
      memoryTrend.warningCooldownMs >= ZERO ?
        memoryTrend.warningCooldownMs :
        HEARTBEAT_MEMORY_TREND.WARNING_COOLDOWN_MS;
    this.memoryTrendSamples = [];
    this.lastMemoryTrendWarningAt = ZERO;
  }

  /**
   * Initialize the heartbeat service.
   * Transitions: CREATED → INITIALIZED
   */
  initialize() {
    assertCritical(this.nodeId, HEARTBEAT_ERROR_MSG.MISSING_NODE_ID);
    assertCritical(
      this.nodeAddress, HEARTBEAT_ERROR_MSG.MISSING_NODE_ADDRESS,
    );
    assertCritical(
      this.cdcIntegrationService, HEARTBEAT_ERROR_MSG.MISSING_CDC,
    );
    assertCritical(
      this.systemTableCache, HEARTBEAT_ERROR_MSG.MISSING_CACHE,
    );

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
   */
  resolveHeartbeatAttemptTimeoutMs(overrideMs) {
    if (Number.isFinite(overrideMs) && overrideMs > ZERO) {
      return Math.floor(overrideMs);
    }

    const config = ConfigurationManager.getInstance();
    const configuredTransportTimeoutMs =
      config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS);
    const transportMessageTimeoutMs =
      Number.isFinite(configuredTransportTimeoutMs) &&
      configuredTransportTimeoutMs > ZERO ?
        Math.floor(configuredTransportTimeoutMs) :
        TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS;
    const leaseSafetyWindowMs = Math.max(
      ONE,
      Math.floor(this.readyLeaseMs / 3),
    );
    const transportSafetyWindowMs =
      transportMessageTimeoutMs +
      HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS;
    const defaultTimeoutMs = Math.max(
      this.heartbeatIntervalMs,
      leaseSafetyWindowMs,
      transportSafetyWindowMs,
    );
    const maxSafeTimeoutMs = Math.max(
      ONE,
      this.readyLeaseMs - this.heartbeatIntervalMs,
    );

    return Math.max(
      ONE,
      Math.min(defaultTimeoutMs, maxSafeTimeoutMs),
    );
  }

  /**
   * Resolve one bounded query timeout for heartbeat write-side SQL.
   * Keeps write routing below the outer heartbeat-attempt watchdog so
   * failed writes do not continue consuming resources after the attempt
   * has already been marked as timed out.
   * @return {number}
   * @private
   */
  resolveHeartbeatWriteQueryTimeoutMs() {
    return Math.max(
      ONE,
      this.heartbeatAttemptTimeoutMs -
        HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS,
    );
  }

  /**
   * Split heartbeat write budget so reporter fallback leaves time for CDC.
   * @param {number|null|undefined} heartbeatWriteQueryTimeoutMs
   * @return {number}
   * @private
   */
  resolveNodeStateReporterTimeoutMs(heartbeatWriteQueryTimeoutMs) {
    const writeTimeoutMs = Number(heartbeatWriteQueryTimeoutMs);
    if (!Number.isFinite(writeTimeoutMs) || writeTimeoutMs <= ZERO) {
      return ONE;
    }
    return Math.max(ONE, Math.floor(writeTimeoutMs / 2));
  }

  /**
   * Return true when one node-state reporter error was raised by the local
   * reporter timeout watchdog.
   * @param {Error|Object|null} error
   * @return {boolean}
   * @private
   */
  isNodeStateReporterTimeoutError(error) {
    return error?.code === 'node_state_reporter_timeout';
  }

  /**
   * Execute node-state reporter with an explicit timeout budget.
   * @param {Object} payload
   * @param {number} timeoutMs
   * @return {Promise<Object>}
   * @private
   */
  async callNodeStateReporterWithTimeout(payload, timeoutMs) {
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
        const timeoutError = new Error(
          `Node-state reporter timed out after ${boundedTimeoutMs}ms`,
        );
        timeoutError.code = 'node_state_reporter_timeout';
        timeoutError.publicationDiagnostics = {
          publicationPath: 'node_state_reporter',
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
   */
  setNodeStateReporter(reporter) {
    this.nodeStateReporter = typeof reporter === 'function' ? reporter : null;
  }

  /**
   * Start periodic heartbeats.
   * Transitions: INITIALIZED → RUNNING
   * @param {Object} [options] - Heartbeat options.
   * @param {Function} [options.getStats] - Async fn returning node stats.
   * @param {Object} [options.stats] - Static node stats snapshot.
   * @param {Array<string>} [options.capabilities] - Node capabilities.
   */
  start(options = {}) {
    if (this.state !== HEARTBEAT_STATE.INITIALIZED) {
      throw new Error(HEARTBEAT_ERROR_MSG.NOT_INITIALIZED);
    }
    if (this.heartbeatTimer) {
      return;
    }

    this.state = HEARTBEAT_STATE.RUNNING;

    const sendHeartbeat = async () => {
      if (this.state !== HEARTBEAT_STATE.RUNNING ||
          this.heartbeatInFlight === true) {
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

    this.heartbeatTimer = this.setIntervalFn(
      sendHeartbeat, this.heartbeatIntervalMs,
    );
    if (typeof this.heartbeatTimer?.unref === 'function') {
      this.heartbeatTimer.unref();
    }
    sendHeartbeat();

    this.logger.info(HEARTBEAT_LOG_MSG.STARTED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Stop periodic heartbeats.
   * Transitions: RUNNING → STOPPED
   */
  stop() {
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
    this.logger.info(HEARTBEAT_LOG_MSG.STOPPED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Publish one terminal node row before graceful shutdown tears down the
   * control-plane path. This lets immediate rejoin reuse the same node ID
   * without waiting for ready-lease expiry.
   * @return {Promise<boolean>} True when a shutdown row was published.
   */
  async reportNodeShutdown() {
    const now = this.now();
    const existing = this.systemTableCache?.get(
      SYSTEM_TABLE_NAME.NODES,
      this.nodeId,
    ) || null;
    if (!existing) {
      this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_SKIPPED, {
        nodeId: this.nodeId,
        reason: 'node_row_missing_from_cache',
      });
      return false;
    }

    const shutdownRow = {
      node_address: this.nodeAddress ||
        existing?.node_address || STRING.UNKNOWN,
      cpu_cores: Number.isFinite(existing?.cpu_cores) ?
        existing.cpu_cores :
        NUM.ZERO,
      memory_mb: Number.isFinite(existing?.memory_mb) ?
        existing.memory_mb :
        NUM.ZERO,
      disk_gb: Number.isFinite(existing?.disk_gb) ?
        existing.disk_gb :
        NUM.ZERO,
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
    const shutdownNodeRow = {
      ...existing,
      node_id: this.nodeId,
      ...shutdownRow,
    };
    const queryTimeoutMs = this.resolveHeartbeatWriteQueryTimeoutMs();
    const reporterTimeoutMs =
      this.resolveNodeStateReporterTimeoutMs(queryTimeoutMs);

    this.recordHeartbeatPublicationAttempt(now);

    let reporterError = null;
    let reporterFallbackPath = null;
    let reporterDiagnostics = null;
    if (typeof this.nodeStateReporter === TYPEOF.FUNCTION) {
      try {
        const reporterResult = await this.callNodeStateReporterWithTimeout({
          nodeId: this.nodeId,
          nodeAddress: shutdownRow.node_address,
          state: shutdownRow.connection_state,
          capabilities: shutdownRow.capabilities,
          heartbeatAt: now,
          readyLeaseExpiresAt: null,
          nodeRow: shutdownNodeRow,
        }, reporterTimeoutMs);
        reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(
          reporterResult,
          'node_shutdown_reporter',
        );
        const reporterVisible = await this.verifyReporterHeartbeatVisibility(
          now,
          {
            expectedStatus: SERVICE_STATUS.STOPPED,
            expectedConnectionState: STATE.DISCONNECTED,
            expectedReadyLeaseCleared: true,
          },
        );
        if (!reporterVisible) {
          reporterFallbackPath =
            'node_shutdown_cdc_after_reporter_visibility_gap';
          this.recordHeartbeatPublicationTarget(reporterDiagnostics);
        } else {
          this.recordHeartbeatPublicationSuccess(reporterDiagnostics, now);
          this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_PUBLISHED, {
            nodeId: this.nodeId,
            publicationPath: reporterDiagnostics.publicationPath,
          });
          return true;
        }
      } catch (error) {
        reporterError = error;
        reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(
          error?.publicationDiagnostics || error,
          'node_shutdown_reporter',
        );
        this.recordHeartbeatPublicationTarget(reporterDiagnostics);
      }
    }

    try {
      const updateResult =
        await this.controlPlaneSystemTableGateway.updateSystemTableRow(
        SYSTEM_TABLE_NAME.NODES,
        {node_id: this.nodeId},
        shutdownRow,
        {
          skipCacheWait: true,
          queryTimeoutMs,
        },
      );
      const affectedRows = Number(updateResult?.partitionResult?.affectedRows);
      if (affectedRows === NUM.ZERO) {
        this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_SKIPPED, {
          nodeId: this.nodeId,
          reason: 'node_row_missing_from_storage',
        });
        return false;
      }

      const publicationPath = reporterFallbackPath ||
        (reporterError ?
          'node_shutdown_cdc_after_reporter_failure' :
          'node_shutdown_cdc_update');
      this.recordHeartbeatPublicationSuccess({publicationPath}, now);
      this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_PUBLISHED, {
        nodeId: this.nodeId,
        publicationPath,
      });
      return true;
    } catch (error) {
      if (reporterError) {
        error.message = `${error.message} (node-state reporter failed: ` +
          `${reporterError.message})`;
      }
      throw error;
    }
  }

  /**
   * Begin one guarded heartbeat attempt with a timeout watchdog.
   * @return {{id: number, timedOut: boolean, timeoutHandle: Object|null}}
   * @private
   */
  beginHeartbeatAttempt() {
    const attempt = {
      id: this.heartbeatAttemptSequence + ONE,
      timedOut: false,
      timeoutHandle: null,
      startedAtMs: this.now(),
    };
    this.heartbeatAttemptSequence = attempt.id;
    this.activeHeartbeatAttempt = attempt;
    this.heartbeatInFlight = true;
    this.recordHeartbeatPublicationAttempt(attempt.startedAtMs);

    attempt.timeoutHandle = this.setTimeoutFn(() => {
      if (attempt.timedOut) {
        return;
      }
      attempt.timedOut = true;
      this.recordFailure(
        'attempt_timeout',
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
   */
  completeHeartbeatAttempt(attempt) {
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
   */
  async sendHeartbeat(stats, capabilities) {
    const now = this.now();
    const memoryMb = Number.isFinite(stats?.memory?.totalBytes) ?
      Math.round(stats.memory.totalBytes / NUM.BYTES_PER_MIB) :
      undefined;

    const cache = this.systemTableCache;
    const existing = cache.get(SYSTEM_TABLE_NAME.NODES, this.nodeId) || null;

    const updateRow = {
      node_address: this.nodeAddress ||
        existing?.node_address || STRING.UNKNOWN,
      cpu_cores: Number.isFinite(stats?.cpu?.count) ?
        stats.cpu.count : (existing?.cpu_cores || NUM.ZERO),
      memory_mb: Number.isFinite(memoryMb) ?
        memoryMb : (existing?.memory_mb || NUM.ZERO),
      disk_gb: Number.isFinite(stats?.diskGb) ?
        stats.diskGb : (existing?.disk_gb || NUM.ZERO),
      cpu_usage_percent: Number.isFinite(stats?.cpu?.usagePercent) ?
        stats.cpu.usagePercent :
        (existing?.cpu_usage_percent || NUM.ZERO),
      memory_usage_percent: Number.isFinite(stats?.memory?.usagePercent) ?
        stats.memory.usagePercent :
        (existing?.memory_usage_percent || NUM.ZERO),
      disk_usage_percent: Number.isFinite(stats?.diskUsagePercent) ?
        stats.diskUsagePercent :
        (existing?.disk_usage_percent || NUM.ZERO),
      status: existing?.status || SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: capabilities ? JSON.stringify(capabilities) :
        (existing?.capabilities || STRING.EMPTY_JSON_ARRAY),
      last_heartbeat: now,
      ready_lease_expires_at: now + this.readyLeaseMs,
    };

    this.recordMemoryTrendSample(
      updateRow.memory_usage_percent,
      now,
    );
    const heartbeatWriteQueryTimeoutMs =
      this.resolveHeartbeatWriteQueryTimeoutMs();

    const quietModeActive = this.isQuietModeActive();
    const nodeWriteDecision = this.resolveNodeHeartbeatWriteDecision(
      updateRow,
      now,
    );
    let shouldWriteNodeHeartbeat = nodeWriteDecision.shouldWrite;
    if (quietModeActive && shouldWriteNodeHeartbeat) {
      if (nodeWriteDecision.reason === 'no_previous_write') {
        this.recordQuietModeBypassReason(
          HEARTBEAT_QUIET_MODE_BYPASS_REASON.NODE_HEARTBEAT_INITIAL_WRITE,
        );
      } else if (nodeWriteDecision.reason === 'max_staleness') {
        this.recordQuietModeBypassReason(
          HEARTBEAT_QUIET_MODE_BYPASS_REASON.NODE_HEARTBEAT_MAX_STALENESS,
        );
      } else {
        shouldWriteNodeHeartbeat = false;
        this.recordQuietModeSuppressedWrite('nodeHeartbeatWrites');
      }
    }

    if (shouldWriteNodeHeartbeat) {
      await this.writeNodeHeartbeat(
        updateRow,
        capabilities,
        now,
        heartbeatWriteQueryTimeoutMs,
      );
      this.lastNodeHeartbeatWriteAt = now;
      this.lastNodeHeartbeatWriteSignature =
        this.buildNodeHeartbeatWriteSignature(updateRow);
    }

    // Register or refresh WebSocket endpoint, but avoid rewriting unchanged
    // endpoint rows on every heartbeat.
    const endpointId =
      `${ENDPOINT_ID_PREFIX}${this.nodeId}${ENDPOINT_ID_SUFFIX}`;
    const existingEp = cache.get(
      SYSTEM_TABLE_NAME.NODE_ENDPOINTS, endpointId,
    ) || null;
    const endpointRow = this.buildEndpointRow(existingEp, now);
    if (this.shouldUpsertEndpointRow(endpointRow, now)) {
      if (quietModeActive) {
        this.recordQuietModeSuppressedWrite('endpointUpserts');
        return;
      }
      await this.controlPlaneSystemTableGateway.upsertSystemTableRow(
        SYSTEM_TABLE_NAME.NODE_ENDPOINTS, endpointRow,
        {
          skipCacheWait: true,
          queryTimeoutMs: heartbeatWriteQueryTimeoutMs,
        },
      );
      this.lastEndpointUpsertAt = now;
      this.lastEndpointUpsertSignature =
        this.buildEndpointUpsertSignature(endpointRow);
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
   */
  async writeNodeHeartbeat(
    updateRow,
    capabilities,
    now,
    queryTimeoutMs = null,
  ) {
    const heartbeatWriteQueryTimeoutMs = Number.isFinite(queryTimeoutMs) &&
      queryTimeoutMs > ZERO ?
      Math.floor(queryTimeoutMs) :
      this.resolveHeartbeatWriteQueryTimeoutMs();
    const reporterTimeoutMs = this.resolveNodeStateReporterTimeoutMs(
      heartbeatWriteQueryTimeoutMs,
    );
    let reporterError = null;
    let reporterFallbackPath = null;
    let reporterDiagnostics = null;
    let cdcWriteQueryTimeoutMs = heartbeatWriteQueryTimeoutMs;
    if (typeof this.nodeStateReporter === 'function') {
      try {
        const reporterResult = await this.callNodeStateReporterWithTimeout({
          nodeId: this.nodeId,
          nodeAddress: updateRow.node_address,
          state: updateRow.connection_state,
          capabilities: capabilities ?? updateRow.capabilities,
          heartbeatAt: now,
          readyLeaseExpiresAt: updateRow.ready_lease_expires_at,
          nodeRow: {...updateRow},
        }, reporterTimeoutMs);
        reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(
          reporterResult,
          'node_state_reporter',
        );
        if (!this.verifyReporterVisibilityOnSuccess) {
          this.recordHeartbeatPublicationSuccess(reporterDiagnostics, now);
          return;
        }

        const reporterVisible = await this.verifyReporterHeartbeatVisibility(
          now,
        );
        if (!reporterVisible) {
          if (!this.fallbackToCdcOnReporterVisibilityGap) {
            this.recordHeartbeatPublicationSuccess(
              {
                ...reporterDiagnostics,
                publicationPath: 'node_state_reporter_unverified',
              },
              now,
            );
            return;
          }
          reporterFallbackPath = 'cdc_update_after_reporter_visibility_gap';
          this.recordHeartbeatPublicationTarget(reporterDiagnostics);
        } else {
          this.recordHeartbeatPublicationSuccess(reporterDiagnostics, now);
          return;
        }
      } catch (error) {
        reporterError = error;
        if (this.isNodeStateReporterTimeoutError(error)) {
          cdcWriteQueryTimeoutMs = reporterTimeoutMs;
        }
        reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(
          error?.publicationDiagnostics || error,
          'node_state_reporter',
        );
        this.recordHeartbeatPublicationTarget(reporterDiagnostics);
      }
    }

    try {
      const updateResult =
        await this.controlPlaneSystemTableGateway.updateSystemTableRow(
        SYSTEM_TABLE_NAME.NODES,
        {node_id: this.nodeId},
        updateRow,
        {
          // Heartbeats are liveness signals and must not wait for local cache
          // convergence on the write path.
          skipCacheWait: true,
          queryTimeoutMs: cdcWriteQueryTimeoutMs,
        },
      );
      const affectedRows = Number(updateResult?.partitionResult?.affectedRows);
      if (affectedRows === NUM.ZERO) {
        const existingNodeRow =
          this.systemTableCache.get(SYSTEM_TABLE_NAME.NODES, this.nodeId) || {};
        await this.controlPlaneSystemTableGateway.upsertSystemTableRow(
          SYSTEM_TABLE_NAME.NODES,
          {
            ...existingNodeRow,
            node_id: this.nodeId,
            created_at:
              existingNodeRow.created_at ||
              updateRow.created_at ||
              now,
            ...updateRow,
          },
          {
            skipCacheWait: true,
            queryTimeoutMs: cdcWriteQueryTimeoutMs,
          },
        );
      }
      this.recordHeartbeatPublicationSuccess(
        {
          publicationPath:
            reporterFallbackPath ||
            (reporterError ?
              'cdc_update_after_reporter_failure' :
              'cdc_update'),
        },
        now,
      );
    } catch (error) {
      if (reporterError) {
        error.message = `${error.message} (node-state reporter failed: ` +
          `${reporterError.message})`;
      }
      throw error;
    }
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
   */
  async verifyReporterHeartbeatVisibility(expectedHeartbeatAt, options = {}) {
    const authoritativeControlPlaneView =
      this.getAuthoritativeControlPlaneView();
    if (!authoritativeControlPlaneView ||
        typeof authoritativeControlPlaneView.canRead !== TYPEOF.FUNCTION ||
        authoritativeControlPlaneView.canRead() !== true) {
      return true;
    }

    try {
      const result = await authoritativeControlPlaneView.readRows(
        SYSTEM_TABLE_NAME.NODES,
        `SELECT * FROM ${SYSTEM_TABLE_NAME.NODES} WHERE node_id = ?`,
        [this.nodeId],
        {
          queryTimeoutMs: this.reporterVisibilityQueryTimeoutMs,
        },
      );
      if (!result?.success) {
        return false;
      }
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const nodeRow = rows.find((row) => {
        return row?.[COLUMN.NODE_ID] === this.nodeId ||
          row?.node_id === this.nodeId;
      }) || rows[ZERO] || null;
      const lastHeartbeat = Number(
        nodeRow?.[COLUMN.LAST_HEARTBEAT] ??
          nodeRow?.last_heartbeat,
      );
      if (!Number.isFinite(lastHeartbeat) ||
          lastHeartbeat < expectedHeartbeatAt) {
        return false;
      }

      if (typeof options.expectedStatus === TYPEOF.STRING &&
          nodeRow?.[COLUMN.STATUS] !== options.expectedStatus &&
          nodeRow?.status !== options.expectedStatus) {
        return false;
      }

      if (typeof options.expectedConnectionState === TYPEOF.STRING &&
          nodeRow?.[COLUMN.CONNECTION_STATE] !==
            options.expectedConnectionState &&
          nodeRow?.connection_state !== options.expectedConnectionState) {
        return false;
      }

      if (options.expectedReadyLeaseCleared === true) {
        const readyLeaseExpiresAt = nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT] ??
          nodeRow?.ready_lease_expires_at;
        if (readyLeaseExpiresAt !== null &&
            readyLeaseExpiresAt !== undefined) {
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
   */
  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    if (!this.cdcIntegrationService) {
      return null;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      now: this.now,
      queryTimeoutMs: this.reporterVisibilityQueryTimeoutMs,
    });
    return this.authoritativeControlPlaneView;
  }

  /**
   * Apply the canonical guarded disconnect for a node whose ready lease expired.
   * @param {Object} node - Observed node snapshot.
   * @param {number} now - Current timestamp.
   * @return {Promise<Object>} CDC mutation result.
   */
  async disconnectNodeDueToLeaseExpiry(node, now) {
    const whereClause = {
      node_id: node.node_id,
      ready_lease_expires_at: node.ready_lease_expires_at,
      last_heartbeat: node.last_heartbeat || now,
    };

    try {
      return await this.controlPlaneSystemTableGateway.updateSystemTableRow(
        SYSTEM_TABLE_NAME.NODES,
        whereClause,
        {
          connection_state: STATE.DISCONNECTED,
          ready_lease_expires_at: null,
        },
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
   */
  buildEndpointRow(existingEp, now) {
    return {
      [COLUMN.ENDPOINT_ID]:
        `${ENDPOINT_ID_PREFIX}${this.nodeId}${ENDPOINT_ID_SUFFIX}`,
      [COLUMN.NODE_ID]: this.nodeId,
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.ADDRESS]: this.nodeAddress,
      [COLUMN.PRIORITY]: NUM.ZERO,
      [COLUMN.METADATA]: existingEp?.[COLUMN.METADATA] ||
        JSON.stringify({}),
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
   */
  buildEndpointUpsertSignature(endpointRow) {
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

  /**
   * Build signature used to detect materially-changed node heartbeat payloads.
   * @param {Object} updateRow
   * @return {string}
   * @private
   */
  buildNodeHeartbeatWriteSignature(updateRow) {
    return JSON.stringify({
      nodeAddress: updateRow.node_address,
      cpuCores: updateRow.cpu_cores,
      memoryMb: updateRow.memory_mb,
      diskGb: updateRow.disk_gb,
      cpuUsagePercent: updateRow.cpu_usage_percent,
      memoryUsagePercent: updateRow.memory_usage_percent,
      diskUsagePercent: updateRow.disk_usage_percent,
      status: updateRow.status,
      connectionState: updateRow.connection_state,
      capabilities: updateRow.capabilities,
    });
  }

  /**
   * Decide if nodes heartbeat row should be written on this tick.
   * @param {Object} updateRow
   * @param {number} now
   * @return {{shouldWrite: boolean, reason: string}}
   * @private
   */
  resolveNodeHeartbeatWriteDecision(updateRow, now) {
    if (!Number.isFinite(this.lastNodeHeartbeatWriteAt)) {
      return {
        shouldWrite: true,
        reason: 'no_previous_write',
      };
    }

    const elapsedMs = now - this.lastNodeHeartbeatWriteAt;
    if (elapsedMs >= this.nodeMetadataMaxStalenessMs) {
      return {
        shouldWrite: true,
        reason: 'max_staleness',
      };
    }

    const signature = this.buildNodeHeartbeatWriteSignature(updateRow);
    if (this.lastNodeHeartbeatWriteSignature !== signature) {
      return {
        shouldWrite: true,
        reason: 'signature_changed',
      };
    }

    if (elapsedMs >= this.nodeMetadataMinUpdateIntervalMs) {
      return {
        shouldWrite: true,
        reason: 'min_interval_elapsed',
      };
    }

    return {
      shouldWrite: false,
      reason: 'coalesced_min_interval',
    };
  }

  /**
   * Determine if heartbeat quiet mode is currently active.
   * @return {boolean}
   * @private
   */
  isQuietModeActive() {
    if (!this.quietMode) {
      return false;
    }
    if (typeof this.quietMode === 'boolean') {
      return this.quietMode;
    }
    if (typeof this.quietMode?.isActive === 'function') {
      return this.quietMode.isActive() === true;
    }
    if (this.quietMode.enabled === false) {
      return false;
    }
    return this.quietMode.active === true;
  }

  /**
   * Record a quiet-mode suppressed write.
   * @param {string} key
   * @private
   */
  recordQuietModeSuppressedWrite(key) {
    if (!Object.prototype.hasOwnProperty.call(this.quietModeSuppressedCounts, key)) {
      this.quietModeSuppressedCounts[key] = NUM.ZERO;
    }
    this.quietModeSuppressedCounts[key] += ONE;
  }

  /**
   * Record a quiet-mode safety bypass reason.
   * @param {string} reason
   * @private
   */
  recordQuietModeBypassReason(reason) {
    const normalizedReason = String(reason || 'unknown');
    if (!Object.prototype.hasOwnProperty.call(
      this.quietModeBypassReasonHistogram,
      normalizedReason,
    )) {
      this.quietModeBypassReasonHistogram[normalizedReason] = NUM.ZERO;
    }
    this.quietModeBypassReasonHistogram[normalizedReason] += ONE;
  }

  /**
   * Get quiet-mode bypass reason histogram snapshot.
   * @return {Object}
   */
  getQuietModeBypassReasonHistogram() {
    return {
      ...this.quietModeBypassReasonHistogram,
    };
  }

  /**
   * Determine whether endpoint row should be upserted on this heartbeat.
   * @param {Object} endpointRow
   * @param {number} now
   * @return {boolean}
   * @private
   */
  shouldUpsertEndpointRow(endpointRow, now) {
    const signature = this.buildEndpointUpsertSignature(endpointRow);
    if (this.lastEndpointUpsertSignature !== signature) {
      return true;
    }

    // Keep eventual consistency safety refresh for long-running processes.
    if (!Number.isFinite(this.lastEndpointUpsertAt)) {
      return true;
    }
    if (now - this.lastEndpointUpsertAt >= this.endpointRefreshIntervalMs) {
      return true;
    }

    return false;
  }

  /**
   * Track memory usage trend and emit warning events on sustained growth.
   * @param {number} memoryUsagePercent
   * @param {number} timestamp
   */
  recordMemoryTrendSample(memoryUsagePercent, timestamp) {
    if (!Number.isFinite(memoryUsagePercent) || !Number.isFinite(timestamp)) {
      return;
    }

    this.memoryTrendSamples.push({
      timestamp,
      usagePercent: Number(memoryUsagePercent),
    });
    const cutoff = timestamp - this.memoryTrendWindowMs;
    this.memoryTrendSamples = this.memoryTrendSamples.filter(
      (sample) => sample.timestamp >= cutoff,
    );

    if (this.memoryTrendSamples.length < this.memoryTrendMinSamples) {
      return;
    }

    const slopePercentPerMin = calculateUsageSlopePerMinute(
      this.memoryTrendSamples,
    );
    const currentUsagePercent =
      this.memoryTrendSamples[this.memoryTrendSamples.length - ONE].usagePercent;
    if (currentUsagePercent < this.memoryTrendWarningPercent) {
      return;
    }
    if (slopePercentPerMin < this.memoryTrendSlopePercentPerMinThreshold) {
      return;
    }

    if (this.lastMemoryTrendWarningAt > ZERO &&
      timestamp - this.lastMemoryTrendWarningAt <
        this.memoryTrendWarningCooldownMs) {
      return;
    }
    this.lastMemoryTrendWarningAt = timestamp;

    const warning = {
      nodeId: this.nodeId,
      memoryUsagePercent: currentUsagePercent,
      slopePercentPerMin,
      sampleCount: this.memoryTrendSamples.length,
      windowMs: this.memoryTrendWindowMs,
      thresholdSlopePercentPerMin:
        this.memoryTrendSlopePercentPerMinThreshold,
      thresholdUsagePercent: this.memoryTrendWarningPercent,
    };

    this.logger.warn(HEARTBEAT_LOG_MSG.MEMORY_TREND_WARNING, warning);
    this.emit(HEARTBEAT_EVENT.MEMORY_TREND_WARNING, warning);
  }

  /**
   * Record a heartbeat failure.
   * @param {string} stage - Failure stage.
   * @param {string} errorMessage - Error message.
   * @private
   */
  recordFailure(stage, errorMessage) {
    this.heartbeatConsecutiveFailures++;
    this.heartbeatPublicationDiagnostics.lastFailureAt =
      normalizeHeartbeatPublicationTimestamp(this.now());
    this.heartbeatPublicationDiagnostics.lastFailureStage = stage;
    this.heartbeatPublicationDiagnostics.lastFailureReason = errorMessage;
    this.heartbeatPublicationDiagnostics.consecutiveFailures =
      this.heartbeatConsecutiveFailures;

    const logData = {
      nodeId: this.nodeId,
      stage,
      error: errorMessage,
      consecutiveFailures: this.heartbeatConsecutiveFailures,
    };

    if (this.heartbeatConsecutiveFailures >=
        HEARTBEAT_FAILURE_WARN_THRESHOLD) {
      this.logger.warn(
        HEARTBEAT_LOG_MSG.HEARTBEAT_CONSECUTIVE_FAILURES, logData,
      );
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
   */
  getHeartbeatCount() {
    return this.heartbeatCount;
  }

  /**
   * Get the current state.
   * @return {string} Current lifecycle state.
   */
  getState() {
    return this.state;
  }

  /**
   * Return the latest heartbeat publication diagnostics.
   * @return {Object}
   */
  getHeartbeatPublicationDiagnostics() {
    return Object.freeze({
      ...this.heartbeatPublicationDiagnostics,
    });
  }

  /**
   * Mark the beginning of one heartbeat publication attempt.
   * @param {number} startedAtMs
   * @private
   */
  recordHeartbeatPublicationAttempt(startedAtMs) {
    this.heartbeatPublicationDiagnostics.lastAttemptAt =
      normalizeHeartbeatPublicationTimestamp(startedAtMs);
    this.heartbeatPublicationDiagnostics.consecutiveFailures =
      this.heartbeatConsecutiveFailures;
  }

  /**
   * Update publication target details without changing attempt outcome.
   * @param {Object|null} diagnostics
   * @private
   */
  recordHeartbeatPublicationTarget(diagnostics) {
    const normalized = normalizeHeartbeatPublicationDiagnostics(diagnostics);
    const resetTarget =
      normalized.publicationPath === 'cdc_update' &&
      !normalized.targetAddress;
    if (normalized.publicationPath) {
      this.heartbeatPublicationDiagnostics.publicationPath =
        normalized.publicationPath;
    }
    if (resetTarget) {
      this.heartbeatPublicationDiagnostics.targetAddress = null;
      this.heartbeatPublicationDiagnostics.targetNodeId = null;
      this.heartbeatPublicationDiagnostics.targetServiceType = null;
      this.heartbeatPublicationDiagnostics.targetServiceId = null;
      return;
    }
    if (normalized.targetAddress) {
      this.heartbeatPublicationDiagnostics.targetAddress =
        normalized.targetAddress;
    }
    if (normalized.targetNodeId) {
      this.heartbeatPublicationDiagnostics.targetNodeId =
        normalized.targetNodeId;
    }
    if (normalized.targetServiceType) {
      this.heartbeatPublicationDiagnostics.targetServiceType =
        normalized.targetServiceType;
    }
    if (normalized.targetServiceId) {
      this.heartbeatPublicationDiagnostics.targetServiceId =
        normalized.targetServiceId;
    }
  }

  /**
   * Record a successful heartbeat publication target and timestamp.
   * @param {Object|null} diagnostics
   * @param {number} now
   * @private
   */
  recordHeartbeatPublicationSuccess(diagnostics, now) {
    this.recordHeartbeatPublicationTarget(diagnostics);
    this.heartbeatPublicationDiagnostics.lastSuccessAt =
      normalizeHeartbeatPublicationTimestamp(now);
    this.heartbeatPublicationDiagnostics.consecutiveFailures =
      this.heartbeatConsecutiveFailures;
  }
}

export {HeartbeatService, calculateUsageSlopePerMinute};
