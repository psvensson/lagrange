import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NUM,
  SERVICE_STATUS,
  STATE,
  STRING,
  TRANSPORT_TYPE,
} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
  getControlPlaneNodeStatePublicationProfile,
  isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
} from './control-plane-constants.js';
import {
  isRetryableControlPlaneError,
} from './control-plane-error-classification.js';
import {CONTROL_PLANE_MUTATION_MERGE_POLICY} from './control-plane-system-table-gateway.js';
import {
  HEARTBEAT_EVENT,
  HEARTBEAT_FAILURE_WARN_THRESHOLD,
  HEARTBEAT_LOG_MSG,
  HEARTBEAT_QUIET_MODE_BYPASS_REASON,
} from './heartbeat-service-constants.js';
import {
  advanceMemoryTrendState,
  buildNodeHeartbeatWriteDecision,
  incrementHistogramEntry,
  isQuietModeActive,
  normalizeHeartbeatPublicationDiagnostics,
  normalizeHeartbeatPublicationTimestamp,
  recordHeartbeatPublicationSuccess,
  recordHeartbeatPublicationTarget,
  resolveHeartbeatBudgetFields,
  resolveNodeHeartbeatWriteDecision as resolveNodeHeartbeatWriteDecisionHelper,
  shouldUpsertEndpointRow,
} from './heartbeat-service-write-coalescing.js';
import {
  calculateUsageSlopePerMinute,
  ENDPOINT_ID_PREFIX,
  ENDPOINT_ID_SUFFIX,
  HEARTBEAT_PUBLICATION_PATH,
  HEARTBEAT_REPORTER_VISIBILITY_DECISION,
  HEARTBEAT_REPORTER_VISIBILITY_STATE,
  HEARTBEAT_SERVICE_LITERAL,
  HEARTBEAT_WRITE_DECISION_REASON,
  HEARTBEAT_WRITE_DECISION_STATE,
  ONE,
  ZERO,
} from './heartbeat-service-runtime-state.js';
import {PRESSURE_WORK_CLASS} from './pressure-governor.js';

class HeartbeatServicePublicationMethods {
  shouldTreatEndpointHeartbeatWriteAsDeferred(resultOrError, writeOptions) {
    if (writeOptions?.allowPressureDefer !== true || !resultOrError) {
      return false;
    }
    if (isRetryableControlPlaneError(resultOrError)) {
      return true;
    }
    return resultOrError.success === false &&
      (
        resultOrError.deferRetry === true ||
        resultOrError.contractState === 'deferred' ||
        resultOrError.outcome === 'deferred' ||
        resultOrError.nextAction === 'retry'
      );
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
        existing?.cpu_cores || 0,
      memory_mb: Number.isFinite(memoryMb) ? memoryMb : existing?.memory_mb || 0,
      disk_gb: Number.isFinite(stats?.diskGb) ? stats.diskGb : existing?.disk_gb || 0,
      cpu_usage_percent: Number.isFinite(stats?.cpu?.usagePercent) ?
        stats.cpu.usagePercent :
        existing?.cpu_usage_percent || 0,
      memory_usage_percent: Number.isFinite(stats?.memory?.usagePercent) ?
        stats.memory.usagePercent :
        existing?.memory_usage_percent || 0,
      disk_usage_percent: Number.isFinite(stats?.diskUsagePercent) ?
        stats.diskUsagePercent :
        existing?.disk_usage_percent || 0,
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
      const endpointWriteOptions =
        this.buildEndpointHeartbeatWriteOptions(
          endpointId,
          heartbeatWriteQueryTimeoutMs,
        );
      try {
        const endpointWriteResult =
          await this.getControlPlaneSystemTableGateway().upsertSystemTableRow(
            SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
            endpointRow,
            endpointWriteOptions,
          );
        if (
          endpointWriteResult?.success === false &&
          !this.shouldTreatEndpointHeartbeatWriteAsDeferred(
            endpointWriteResult,
            endpointWriteOptions,
          )
        ) {
          throw new Error(
            endpointWriteResult.error ||
              'node endpoint heartbeat upsert failed',
          );
        }
      } catch (error) {
        if (
          !this.shouldTreatEndpointHeartbeatWriteAsDeferred(
            error,
            endpointWriteOptions,
          )
        ) {
          throw error;
        }
      }
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
    if (typeof this.nodeStateReporter === 'function') {
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
    if (affectedRows === 0) {
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
      [COLUMN.PRIORITY]: 0,
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

function defineHeartbeatServicePublicationMethods(HeartbeatService) {
  const methodDescriptors = Object.getOwnPropertyDescriptors(
    HeartbeatServicePublicationMethods.prototype,
  );
  delete methodDescriptors.constructor;
  Object.defineProperties(HeartbeatService.prototype, methodDescriptors);
}

export {defineHeartbeatServicePublicationMethods};
