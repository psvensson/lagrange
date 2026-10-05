import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NODE_STATE,
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
  buildStaleNodeIncarnationError,
  isRetryableControlPlaneError,
} from './control-plane-error-classification.js';
import {CONTROL_PLANE_MUTATION_MERGE_POLICY} from './control-plane-system-table-gateway.js';
import {
  ENDPOINT_INCARNATION_OUTCOME,
  isEndpointIncarnationOutcomeCompleted,
  readAuthoritativeEndpointRow,
  writeEndpointAtIncarnation,
} from './owners/endpoint-incarnation-authority.js';
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
import {
  isNodeLifecyclePublicationCompleted,
  isNodeLifecyclePublicationDeferred,
  isTerminalNodeLifecycleSource,
  NODE_LIFECYCLE_PUBLICATION_OUTCOME,
} from './node-lifecycle-publication.js';

class HeartbeatServicePublicationMethods {
  shouldTreatEndpointHeartbeatWriteAsDeferred(resultOrError, writeOptions) {
    if (writeOptions?.deferOnPressure !== true || !resultOrError) {
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
   * @param {Object} [options]
   * @param {boolean} [options.requireDurableVisibility]
   * @return {Promise<void>}
   * @private
   */ async sendHeartbeat(stats, capabilities, options = {}) {
    const now = this.now();
    const memoryMb = Number.isFinite(stats?.memory?.totalBytes) ?
      Math.round(stats.memory.totalBytes / NUM.BYTES_PER_MIB) :
      undefined;
    const cache = this.systemTableCache;
    const existing = cache.get(SYSTEM_TABLE_NAME.NODES, this.nodeId) || null;
    // A pre-activation node must never self-promote: while the own row is
    // JOINING and the LOCAL lifecycle has not reached READY, heartbeats renew
    // liveness only (CONNECTED, lease untouched), matching the join barrier's
    // heartbeat-only publication. Once the local lifecycle is READY — the
    // seed at bootstrap completion, a joiner at barrier-gated join
    // completion — the heartbeat may publish the READY promotion even if the
    // row's ACTIVE flip has not yet propagated back through CDC (the seed's
    // own promotion rides this very heartbeat).
    const withholdReadyPromotion =
      existing?.status === NODE_STATE.JOINING &&
      this.isNodeLifecycleReady?.() !== true;
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
      status: withholdReadyPromotion ?
        NODE_STATE.JOINING :
        SERVICE_STATUS.ACTIVE,
      connection_state: withholdReadyPromotion ?
        STATE.CONNECTED :
        STATE.READY,
      capabilities: capabilities ?
        JSON.stringify(capabilities) :
        existing?.capabilities || STRING.EMPTY_JSON_ARRAY,
      last_heartbeat: now,
      ...resolveHeartbeatBudgetFields(existing),
    };
    this.recordMemoryTrendSample(updateRow.memory_usage_percent, now);
    const heartbeatWriteQueryTimeoutMs = this.resolveHeartbeatWriteQueryTimeoutMs();
    const quietModeActive = isQuietModeActive(this.quietMode, {
      booleanTypeValue: HEARTBEAT_SERVICE_LITERAL.BOOLEAN,
    });
    const nodeWriteDecision = this.resolveNodeHeartbeatWriteDecision(updateRow, now);
    this.lastHeartbeatPublicationDecision = nodeWriteDecision;
    const requireDurableVisibility = options.requireDurableVisibility === true;
    // A caller waiting on the publication boundary owns a fresh write and its
    // visibility proof.  Reusing an earlier coalesced heartbeat here would
    // turn "durable" back into a timing-dependent cache observation.
    let shouldWriteNodeHeartbeat =
      requireDurableVisibility || nodeWriteDecision.shouldWrite;
    if (quietModeActive && shouldWriteNodeHeartbeat && !requireDurableVisibility) {
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
        options,
      );
    } // Register or refresh WebSocket endpoint, but avoid rewriting unchanged
    // endpoint rows on every heartbeat.
    // The endpoint refresh is this node's second liveness publication, and it
    // is fenced by the same source rule as the first (N2/D6): a terminal
    // (reaped or withdrawn) own row of this generation is not a publication
    // source, so its routing target is never reactivated — not even on a tick
    // whose node-row write coalesced away and therefore never reached the
    // lifecycle owner's own refusal.
    if (isTerminalNodeLifecycleSource(existing, this.bootIncarnation)) {
      this.logger.debug(
        HEARTBEAT_LOG_MSG.ENDPOINT_REFRESH_REFUSED_TERMINAL_NODE_ROW,
        {nodeId: this.nodeId, bootIncarnation: this.bootIncarnation},
      );
      return;
    }
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
          await this.writeNodeEndpointAtIncarnation(
            endpointRow,
            existingEp,
            endpointWriteOptions,
          );
        if (!endpointWriteResult) {
          return;
        }
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
   * Birth or refresh this node's endpoint at this process's exact boot
   * incarnation (the endpoint incarnation authority): a row owned by a newer
   * incarnation is never replaced. Returns the mutation result when the row
   * reflects this incarnation, null when this incarnation may not write it
   * (stale, unknown incarnation, or the outcome is not yet observable), and
   * rethrows an unresolved write error for the deferred classification.
   * @param {Object} endpointRow
   * @param {Object|null} existingEp - Cached observation of the row.
   * @param {Object} writeOptions
   * @return {Promise<Object|null>}
   * @private
   */ async writeNodeEndpointAtIncarnation(endpointRow, existingEp,
    writeOptions) {
    const gateway = this.getControlPlaneSystemTableGateway();
    const table = SYSTEM_TABLE_NAME.NODE_ENDPOINTS;
    const outcome = await writeEndpointAtIncarnation({
      row: endpointRow,
      bootIncarnation: this.bootIncarnation,
      observe: async () => ({available: true, row: existingEp}),
      readback: () => readAuthoritativeEndpointRow(gateway, table,
        endpointRow[COLUMN.ENDPOINT_ID]),
      insert: (row, identity) => gateway.insertSystemTableRow(table, row,
        {...writeOptions, ...identity}),
      update: (whereClause, data, identity) =>
        gateway.updateSystemTableRow(table, whereClause, data,
          {...writeOptions, ...identity}),
    });
    if (isEndpointIncarnationOutcomeCompleted(outcome.outcome)) {
      return outcome.result || {success: true};
    }
    if (outcome.error &&
        outcome.outcome !== ENDPOINT_INCARNATION_OUTCOME
          .REFUSED_STALE_INCARNATION) {
      throw outcome.error;
    }
    this.logger.debug(HEARTBEAT_LOG_MSG.ENDPOINT_WRITE_NOT_CURRENT, {
      nodeId: this.nodeId,
      bootIncarnation: this.bootIncarnation,
      outcome: outcome.outcome,
    });
    return null;
  }
  /**
   * Build the canonical node lifecycle publication request for this
   * heartbeat. Local and routed ingress carry this one request shape; the
   * lifecycle owner grants the lease and fences the incarnation.
   * @param {Object} updateRow - Observed heartbeat row (lifecycle ask and
   *   telemetry/storage-budget columns).
   * @param {Array<string>|string|null} capabilities
   * @param {number} now
   * @param {string} publicationMode
   * @return {Object}
   * @private
   */ buildNodeLifecycleRequest(updateRow, capabilities, now, publicationMode) {
    return {
      nodeId: this.nodeId,
      bootIncarnation: this.bootIncarnation,
      state: updateRow.connection_state,
      heartbeatOnly: true,
      heartbeatAt: now,
      nodeAddress: updateRow.node_address,
      capabilities: capabilities ?? updateRow.capabilities,
      telemetry: {...updateRow},
      publicationMode,
    };
  }
  /**
   * Publish the current node heartbeat through the node lifecycle owner.
   * The local ingress awaits the owner directly; a node whose join installed
   * the routed reporter delivers the same request to a message-group replica,
   * which calls the same owner.
   * @param {Object} updateRow
   * @param {Array<string>|string|null} capabilities
   * @param {number} now
   * @param {number} [queryTimeoutMs]
   * @param {string} [publicationMode]
   * @param {Object} [options]
   * @return {Promise<void>}
   * @private
   */ async writeNodeHeartbeat(
    updateRow,
    capabilities,
    now,
    queryTimeoutMs = null,
    publicationMode = CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
    options = {},
  ) {
    const request = this.buildNodeLifecycleRequest(
      updateRow,
      capabilities,
      now,
      publicationMode,
    );
    if (typeof this.nodeStateReporter === 'function') {
      return this.reportNodeHeartbeat(
        updateRow,
        request,
        now,
        queryTimeoutMs,
        options,
      );
    }
    return this.publishNodeHeartbeat(updateRow, request, now);
  }
  /**
   * Local ingress: await the lifecycle owner and map its named outcome.
   * @param {Object} updateRow
   * @param {Object} request
   * @param {number} now
   * @return {Promise<void>}
   * @private
   */ async publishNodeHeartbeat(updateRow, request, now) {
    const publication = assertCritical(
      this.nodeLifecyclePublication,
      HEARTBEAT_SERVICE_LITERAL.NODE_LIFECYCLE_PUBLICATION_REQUIRED,
    );
    const result = await publication.publish(request);
    if (!isNodeLifecyclePublicationCompleted(result.outcome)) {
      throw this.buildNodeLifecyclePublicationError(result);
    }
    this.installAuthoritativeReporterHeartbeatRow(result, result.row);
    recordHeartbeatPublicationSuccess({
      diagnostics: {
        publicationPath: HEARTBEAT_PUBLICATION_PATH.NODE_LIFECYCLE_PUBLICATION,
      },
      heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
      heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
      now,
      serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
    });
    this.recordConfirmedNodeHeartbeatWrite(updateRow, now);
  }
  /**
   * Map one non-completed lifecycle outcome to the heartbeat error contract:
   * deferred outcomes are retried by the next level-triggered tick, a missing
   * row is the typed missing-row error, and refusals are terminal.
   * @param {Object} result
   * @return {Error}
   * @private
   */ buildNodeLifecyclePublicationError(result) {
    if (result.outcome === NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_ROW_MISSING) {
      return this.buildMissingNodeRowError(HEARTBEAT_SERVICE_LITERAL.HEARTBEAT);
    }
    if (
      result.outcome === NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_STALE_INCARNATION
    ) {
      return buildStaleNodeIncarnationError({
        nodeId: this.nodeId,
        receivedIncarnation: this.bootIncarnation,
        knownIncarnation: result.knownIncarnation,
      });
    }
    const error = new Error(result.outcome);
    error.code = result.outcome;
    error.nodeId = this.nodeId;
    if (isNodeLifecyclePublicationDeferred(result.outcome)) {
      error.deferRetry = true;
      error.retryAfterMs = result.retryAfterMs;
    }
    return error;
  }
  /**
   * Routed ingress: deliver the lifecycle request through the installed
   * node-state reporter (a message-group replica publishes it).
   * @param {Object} updateRow
   * @param {Object} request
   * @param {number} now
   * @param {number|null} queryTimeoutMs
   * @param {Object} options
   * @return {Promise<void>}
   * @private
   */ async reportNodeHeartbeat(updateRow, request, now, queryTimeoutMs, options) {
    const heartbeatWriteQueryTimeoutMs =
      Number.isFinite(queryTimeoutMs) && queryTimeoutMs > ZERO ?
        Math.floor(queryTimeoutMs) :
        this.resolveHeartbeatWriteQueryTimeoutMs();
    const reporterTimeoutMs = this.resolveNodeStateReporterTimeoutMs(heartbeatWriteQueryTimeoutMs);
    try {
      const reporterResult = await this.callNodeStateReporterWithTimeout(
        {
          ...request,
          requireDurableCompletion: options.requireDurableVisibility === true,
        },
        reporterTimeoutMs,
      );
      const reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(
        reporterResult,
        HEARTBEAT_PUBLICATION_PATH.NODE_STATE_REPORTER,
      );
      if (options.requireDurableVisibility === true) {
        this.assertReporterDurableHeartbeatCompletion(
          reporterResult,
          now,
          updateRow,
          reporterDiagnostics,
        );
        this.lastReporterVisibilityVerifiedAt = this.now();
        this.lastReporterVisibilityTargetAddress =
          reporterDiagnostics.targetAddress || null;
        this.recordReporterHeartbeatSuccess(updateRow, now, reporterDiagnostics);
        return;
      }
      this.applyReporterHeartbeatVisibilityDecision(
        updateRow,
        now,
        reporterDiagnostics,
      );
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
  recordReporterHeartbeatSuccess(updateRow, now, reporterDiagnostics) {
    recordHeartbeatPublicationSuccess({
      diagnostics: reporterDiagnostics,
      heartbeatConsecutiveFailures: this.heartbeatConsecutiveFailures,
      heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
      now,
      serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
    });
    this.recordConfirmedNodeHeartbeatWrite(updateRow, now);
  }
  applyReporterHeartbeatVisibilityDecision(updateRow, now, reporterDiagnostics) {
    const visibilityDecision = this.resolveReporterHeartbeatVisibilityDecision(
      reporterDiagnostics,
      now,
    );
    this.nodeHeartbeatReporterVisibilityState = visibilityDecision.nextState;
    if (visibilityDecision.outcome === HEARTBEAT_REPORTER_VISIBILITY_DECISION.CONFIRMED) {
      this.recordReporterHeartbeatSuccess(updateRow, now, reporterDiagnostics);
      return;
    }
    if (
      visibilityDecision.outcome ===
      HEARTBEAT_REPORTER_VISIBILITY_DECISION.SCHEDULE_VERIFICATION
    ) {
      this.scheduleReporterHeartbeatVisibilityVerification(now, reporterDiagnostics, {
        onVisible: () => {
          this.recordReporterHeartbeatSuccess(updateRow, now, reporterDiagnostics);
        },
      });
      this.lastReporterVisibilityTargetAddress = reporterDiagnostics.targetAddress || null;
    }
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
      deferOnPressure: publicationProfile.deferOnPressure,
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
      deferOnPressure: true,
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
    const failedAtMs = this.now();
    this.heartbeatPublicationDiagnostics.lastFailureAt = normalizeHeartbeatPublicationTimestamp(
      failedAtMs,
    );
    this.heartbeatPublicationDiagnostics.lastFailureAtMs = failedAtMs;
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
