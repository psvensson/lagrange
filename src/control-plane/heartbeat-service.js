/**
 * HeartbeatService - Periodic heartbeat updates and consecutive
 * failure tracking. Extracted from ControlPlaneService.
 * Requirements: 8.2, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NUM,
  STATE,
  STRING,
  TRANSPORT_TYPE,
} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  HEARTBEAT_CONFIG_KEY,
  HEARTBEAT_DEFAULT,
  HEARTBEAT_ERROR_MSG,
  HEARTBEAT_EVENT,
  HEARTBEAT_FAILURE_WARN_THRESHOLD,
  HEARTBEAT_LOG_MSG,
  HEARTBEAT_MEMORY_TREND,
  HEARTBEAT_STATE,
  HEARTBEAT_SUBSYSTEM,
} from './heartbeat-service-constants.js';

const ZERO = 0;
const ONE = 1;
const MS_PER_MINUTE = 60000;

/**
 * Estimate usage-percent slope (percent per minute) with linear regression.
 * @param {Array<{timestamp: number, usagePercent: number}>} samples
 * @return {number}
 */
function calculateUsageSlopePerMinute(samples) {
  if (!Array.isArray(samples) || samples.length < 2) {
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

    const config = ConfigurationManager.getInstance();
    this.heartbeatIntervalMs =
      config.get(HEARTBEAT_CONFIG_KEY.INTERVAL_MS) ||
      HEARTBEAT_DEFAULT.INTERVAL_MS;
    this.readyLeaseMs =
      config.get(HEARTBEAT_CONFIG_KEY.READY_LEASE_MS) ||
      HEARTBEAT_DEFAULT.READY_LEASE_MS;

    this.heartbeatTimer = null;
    this.heartbeatConsecutiveFailures = NUM.ZERO;
    this.heartbeatCount = NUM.ZERO;
    this.state = HEARTBEAT_STATE.CREATED;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(HEARTBEAT_SUBSYSTEM) : console;

    const memoryTrend = options.memoryTrend || {};
    this.memoryTrendWindowMs = Number.isFinite(memoryTrend.windowMs) &&
      memoryTrend.windowMs > ZERO ?
      memoryTrend.windowMs :
      HEARTBEAT_MEMORY_TREND.WINDOW_MS;
    this.memoryTrendMinSamples = Number.isFinite(memoryTrend.minSamples) &&
      memoryTrend.minSamples >= 2 ?
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
    });
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
      if (this.state !== HEARTBEAT_STATE.RUNNING) {
        return;
      }

      let stats = options.stats;
      if (options.getStats) {
        try {
          stats = await options.getStats();
        } catch (error) {
          this.recordFailure('stats', error.message);
          return;
        }
      }

      try {
        await this.sendHeartbeat(stats, options.capabilities);
        this.heartbeatCount++;

        if (this.heartbeatConsecutiveFailures > NUM.ZERO) {
          this.logger.info(HEARTBEAT_LOG_MSG.HEARTBEAT_RECOVERED, {
            nodeId: this.nodeId,
            previousFailures: this.heartbeatConsecutiveFailures,
          });
          this.heartbeatConsecutiveFailures = NUM.ZERO;
        }

        this.emit(HEARTBEAT_EVENT.HEARTBEAT_SENT, {
          nodeId: this.nodeId,
          count: this.heartbeatCount,
        });
      } catch (error) {
        this.recordFailure('register', error.message);
      }
    };

    this.heartbeatTimer = setInterval(
      sendHeartbeat, this.heartbeatIntervalMs,
    );
    this.heartbeatTimer.unref();
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
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.state = HEARTBEAT_STATE.STOPPED;
    this.logger.info(HEARTBEAT_LOG_MSG.STOPPED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Send a single heartbeat update.
   * @param {Object} [stats] - Node stats.
   * @param {Array<string>} [capabilities] - Node capabilities.
   * @return {Promise<void>}
   * @private
   */
  async sendHeartbeat(stats, capabilities) {
    const now = Date.now();
    const memoryMb = Number.isFinite(stats?.memory?.totalBytes) ?
      Math.round(stats.memory.totalBytes / NUM.BYTES_PER_MIB) :
      undefined;

    const cache = this.systemTableCache;
    const existing = cache.get(SystemTableName.NODES, this.nodeId) || null;

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
      status: existing?.status || STATE.ACTIVE,
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

    await this.cdcIntegrationService.updateSystemTableRow(
      SystemTableName.NODES,
      {node_id: this.nodeId},
      updateRow,
    );

    // Register WebSocket endpoint
    const endpointId = `ep-${this.nodeId}-ws`;
    const existingEp = cache.get(
      SystemTableName.NODE_ENDPOINTS, endpointId,
    ) || null;

    const endpointRow = {
      [COLUMN.ENDPOINT_ID]: endpointId,
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

    await this.cdcIntegrationService.upsertSystemTableRow(
      SystemTableName.NODE_ENDPOINTS, endpointRow,
    );
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
}

export {HeartbeatService, calculateUsageSlopePerMinute};
