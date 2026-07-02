/**
 * HeartbeatService - Periodic heartbeat updates and consecutive
 * failure tracking. Extracted from ControlPlaneService.
 * Requirements: 8.2, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {createControlPlaneRuntimeBundle} from './control-plane-runtime-bundle.js';
import {
  HEARTBEAT_CONFIG_KEY,
  HEARTBEAT_DEFAULT,
  HEARTBEAT_MEMORY_TREND,
  HEARTBEAT_STATE,
  HEARTBEAT_SUBSYSTEM,
} from './heartbeat-service-constants.js';
import {defineHeartbeatServiceLifecycleMethods} from './heartbeat-service-lifecycle-methods.js';
import {defineHeartbeatServicePublicationMethods} from './heartbeat-service-publication-methods.js';
import {
  defineHeartbeatServiceReporterVisibilityMethods,
} from './heartbeat-service-reporter-visibility-methods.js';
import {
  calculateUsageSlopePerMinute,
  HEARTBEAT_REPORTER_VISIBILITY_STATE,
  MIN_REGRESSION_SAMPLE_COUNT,
  REPORTER_VISIBILITY_QUERY_TIMEOUT_MS,
  ZERO,
} from './heartbeat-service-runtime-state.js';

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
      typeof options.nodeStateReporter === 'function' ? options.nodeStateReporter : null;
    this.verifyReporterVisibilityOnSuccess = options.verifyReporterVisibilityOnSuccess === true;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.setIntervalFn =
      typeof options.setIntervalFn === 'function' ? options.setIntervalFn : setInterval;
    this.clearIntervalFn =
      typeof options.clearIntervalFn === 'function' ? options.clearIntervalFn : clearInterval;
    this.setTimeoutFn =
      typeof options.setTimeoutFn === 'function' ? options.setTimeoutFn : setTimeout;
    this.clearTimeoutFn =
      typeof options.clearTimeoutFn === 'function' ? options.clearTimeoutFn : clearTimeout;
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
    this.heartbeatConsecutiveFailures = 0;
    this.heartbeatCount = 0;
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
      consecutiveFailures: 0,
    };
    this.lastReporterVisibilityVerifiedAt = null;
    this.lastReporterVisibilityTargetAddress = null;
    this.lastReporterVisibilityAttemptAt = null;
    this.lastReporterVisibilityAttemptTargetAddress = null;
    this.nodeHeartbeatReporterVisibilityState = HEARTBEAT_REPORTER_VISIBILITY_STATE.IDLE;
    this.reporterVisibilityVerificationPromise = null;
    this.quietModeSuppressedCounts = {nodeHeartbeatWrites: 0, endpointUpserts: 0};
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
    this.membershipPublicationService = options.membershipPublicationService || null;
    this.scheduledReconcileObligationEnabled = false;
    this.scheduledReconcileTickInFlight = false;
  }
}

defineHeartbeatServiceLifecycleMethods(HeartbeatService);
defineHeartbeatServicePublicationMethods(HeartbeatService);
defineHeartbeatServiceReporterVisibilityMethods(HeartbeatService);

export {HeartbeatService, calculateUsageSlopePerMinute};
