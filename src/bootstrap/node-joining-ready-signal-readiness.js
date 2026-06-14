import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {NodeJoiningOwnerConstruction} from './node-joining-owner-construction.js';
import {
  BOOTSTRAP_API_PROBE_REASON,
} from './bootstrap-api-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from './lifecycle-controller-constants.js';
import {
  canBypassBootstrapInitPriorityReasons,
} from './startup-recovery-coordinator.js';
import {
  isMetadataPublicationReadySnapshot,
} from './traffic-readiness-utils.js';
import {PressureGovernor} from '../control-plane/pressure-governor.js';

const {
  CDC_REESTABLISHMENT,
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
  NODE_JOINING_SERVICE_LITERAL,
  NUM,
  NodeService,
  STARTUP_JOIN_MODE,
  STRING,
  TYPEOF,
  assertCritical,
  waitForLocalQueryTransportReadiness,
  waitForMetadataPublicationReadiness,
} = NODE_JOINING_SERVICE_SHARED;

class NodeJoiningReadySignalReadiness extends NodeJoiningOwnerConstruction {
  isLocalRouterBackpressured() {
    const messageRouter = this.messageRouter || null;
    if (!messageRouter || !this.nodeId) {
      return false;
    }
    try {
      const governor = new PressureGovernor({
        nodeId: this.nodeId,
        messageRouter,
      });
      const summary = governor.getPressureSummary(['control-plane:write']);
      return summary?.backpressured === true;
    } catch {
      return false;
    }
  }
  /**
   * Wait for local query/data-plane transport readiness before
   * advertising READY through the control plane.
   * @return {Promise<void>}
   * @private
   */
  async awaitLocalQueryTransportReadinessForReadySignal() {
    await waitForLocalQueryTransportReadiness({
      messageRouter: this.messageRouter,
      sleep: (delayMs) => this.sleep(delayMs),
      maxAttempts: this.config.readySignalMaxAttempts,
      initialDelayMs: this.config.readySignalRetryDelayMs,
      maxDelayMs: this.config.readySignalRetryMaxDelayMs,
      backoffMultiplier: this.config.readySignalRetryBackoffMultiplier,
      onRetry: ({attempt, maxAttempts, delayMs, readiness}) => {
        this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_RETRYING, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          nextDelayMs: delayMs,
          error:
            readiness?.reason ||
            NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_DATA_PLANE_TRANSPORT_IS_NOT_READY,
          gate: NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_TRANSPORT,
          localQueryTransport: readiness,
        });
      },
    });
  }
  /**
   * Wait for canonical lifecycle metadata-publication readiness before
   * advertising READY through the control plane.
   * @return {Promise<void>}
   * @private
   */
  async awaitMetadataPublicationReadinessForReadySignal() {
    await waitForMetadataPublicationReadiness({
      readinessState: this.bootstrapReadinessState,
      readinessSnapshotProvider: () =>
        this.getReadySignalMetadataPublicationReadinessSnapshot(),
      sleep: (delayMs) => this.sleep(delayMs),
      maxAttempts: this.config.readySignalMaxAttempts,
      initialDelayMs: this.config.readySignalRetryDelayMs,
      maxDelayMs: this.config.readySignalRetryMaxDelayMs,
      backoffMultiplier: this.config.readySignalRetryBackoffMultiplier,
      onRetry: ({attempt, maxAttempts, delayMs, snapshot}) => {
        this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_RETRYING, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          nextDelayMs: delayMs,
          error:
            NODE_JOINING_SERVICE_LITERAL.LIFECYCLE_METADATA_PUBLICATION_READINESS_IS_NOT_SATISFIED,
          gate: NODE_JOINING_SERVICE_LITERAL.METADATA_PUBLICATION_READINESS,
          lifecycleReadiness: snapshot || null,
        });
      },
    });
  }
  getReadySignalMetadataPublicationReadinessSnapshot() {
    const readinessState = this.bootstrapReadinessState;
    const snapshot =
      typeof readinessState?.evaluate === TYPEOF.FUNCTION ?
        readinessState.evaluate() :
        typeof readinessState?.getSnapshot === TYPEOF.FUNCTION ?
          readinessState.getSnapshot() :
          null;
    return this.resolveReadySignalMetadataPublicationReadinessSnapshot(
      snapshot,
    );
  }
  resolveReadySignalMetadataPublicationReadinessSnapshot(snapshot) {
    if (snapshot && typeof snapshot === TYPEOF.OBJECT) {
      snapshot = {
        ...snapshot,
        backpressured: this.isLocalRouterBackpressured(),
      };
    }
    if (
      isMetadataPublicationReadySnapshot(snapshot) ||
      !snapshot ||
      typeof snapshot !== TYPEOF.OBJECT ||
      this.isBootstrapStartupComplete() !== true ||
      this.getSeedContactStartupAuthoritySnapshot()?.authorityAvailable !== true
    ) {
      return snapshot;
    }
    const snapshotReasons = Array.isArray(snapshot.reasons) ?
      snapshot.reasons.filter((reason) =>
        typeof reason === TYPEOF.STRING && reason.length > NUM.ZERO,
      ) :
      [];
    if (canBypassBootstrapInitPriorityReasons(snapshotReasons, snapshot)) {
      return {
        ...snapshot,
        phase: LIFECYCLE_PHASE.DEGRADED,
        reasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
      };
    }
    const reasons = snapshotReasons.filter((reason) =>
      reason !== BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
    );
    const candidate = {
      ...snapshot,
      phase: LIFECYCLE_PHASE.DEGRADED,
      reasons,
    };
    return isMetadataPublicationReadySnapshot(candidate) ?
      candidate :
      snapshot;
  }
  /**
   * Signal readiness to accept replica assignments.
   * @return {Promise<void>}
   * @private
   */
  async signalReadyForReplicas() {
    // Gate: verify CDC subscriptions are active before advertising
    // readiness. If not confirmed within timeout, proceed with
    // degraded status rather than blocking indefinitely (Req 5.3).
    await this.awaitCdcSubscriptionsForReadiness();
    // CL-014: close the (bootstrap-snapshot, fan-out-targetability] window.
    // Remote CDC fan-out is point-in-time with no replay, so every
    // CDC-propagated row written between this node's bootstrap snapshot and
    // the moment its message group became a fan-out target was silently
    // lost to it (witnessed: joiners frozen at publication epoch 1 while
    // the owner committed epochs 2-5 inside that window). Now that the
    // stream is armed, pull the current authoritative state once;
    // best-effort — readiness must never block on catch-up because the
    // live stream and the repair paths remain.
    await this.hydrateCdcPropagatedTablesAfterSubscription();
    try {
      await this.awaitLocalQueryTransportReadinessForReadySignal();
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, {
        nodeId: this.nodeId,
        error:
          error?.message ||
          NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_DATA_PLANE_TRANSPORT_IS_NOT_READY,
        gate: NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_TRANSPORT,
        localQueryTransport: error?.localQueryTransport || null,
      });
      throw error;
    }
    try {
      await this.awaitMetadataPublicationReadinessForReadySignal();
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, {
        nodeId: this.nodeId,
        error:
          error?.message ||
          NODE_JOINING_SERVICE_LITERAL.LIFECYCLE_METADATA_PUBLICATION_READINESS_IS_NOT_SATISFIED,
        gate: NODE_JOINING_SERVICE_LITERAL.METADATA_PUBLICATION_READINESS,
        lifecycleReadiness: error?.lifecycleReadiness || null,
      });
      throw error;
    }
    const heartbeat = assertCritical(
      this.heartbeatService,
      JOINING_ERROR_MSG.CONTROL_PLANE_SERVICE_REQUIRED,
    );
    const nodeService = NodeService.getInstance();
    const capabilities = this.getNodeCapabilities();
    const stats = await nodeService.getNodeStats();
    const heartbeatPayload = {
      cpu: {count: stats.cpu?.count, usagePercent: stats.cpu?.usagePercent},
      memory: {
        totalBytes: stats.memory?.totalBytes,
        usagePercent: stats.memory?.usagePercent,
      },
      diskGb: stats.diskGb,
      diskUsagePercent: stats.diskUsagePercent,
    };
    const maxAttempts = Number.isFinite(this.config.readySignalMaxAttempts) ?
      Math.max(NUM.ONE, Math.floor(this.config.readySignalMaxAttempts)) :
      JOINING_DEFAULT.readySignalMaxAttempts;
    const maxDelayMs = Number.isFinite(this.config.readySignalRetryMaxDelayMs) ?
      Math.max(NUM.ONE, Math.floor(this.config.readySignalRetryMaxDelayMs)) :
      JOINING_DEFAULT.readySignalRetryMaxDelayMs;
    const backoffMultiplier =
      Number.isFinite(this.config.readySignalRetryBackoffMultiplier) &&
      this.config.readySignalRetryBackoffMultiplier > NUM.ZERO ?
        this.config.readySignalRetryBackoffMultiplier :
        JOINING_DEFAULT.readySignalRetryBackoffMultiplier;
    let delayMs = Number.isFinite(this.config.readySignalRetryDelayMs) ?
      Math.max(NUM.ONE, Math.floor(this.config.readySignalRetryDelayMs)) :
      JOINING_DEFAULT.readySignalRetryDelayMs;
    let lastError = null;
    const waitLogMessage = JOINING_LOG_MSG.READY_SIGNAL_RETRYING;
    for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt++) {
      try {
        await heartbeat.sendHeartbeat(heartbeatPayload, capabilities);
        this.logger.info(JOINING_LOG_MSG.READY_SIGNAL_SUCCESS, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
        });
        return;
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) {
          break;
        }
        this.logger.warn(waitLogMessage, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          nextDelayMs: delayMs,
          error: error.message,
        });
        await this.sleep(delayMs);
        delayMs = Math.min(Math.floor(delayMs * backoffMultiplier), maxDelayMs);
      }
    }
    this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, {
      nodeId: this.nodeId,
      attempts: maxAttempts,
      error: lastError?.message || STRING.UNKNOWN,
    });
    throw lastError;
  }
  /**
   * Wait for CDC subscriptions to become active before advertising
   * node readiness. If subscriptions are not confirmed within the
   * re-establishment timeout, log a degraded-status warning and
   * proceed so the node is not blocked indefinitely.
   * @return {Promise<void>}
   * @private
   */
  async awaitCdcSubscriptionsForReadiness() {
    if (this.cdcSubscriptionsActive === true) {
      this.logger.info(JOINING_LOG_MSG.CDC_READINESS_GATE_PASSED, {
        nodeId: this.nodeId,
      });
      return;
    }
    const timeoutMs = CDC_REESTABLISHMENT.TIMEOUT_MS;
    const pollMs = CDC_REESTABLISHMENT.READINESS_GATE_POLL_MS;
    const startMs = this.now();
    this.logger.info(JOINING_LOG_MSG.CDC_READINESS_GATE_WAITING, {
      nodeId: this.nodeId,
      timeoutMs,
    });
    while (this.now() - startMs < timeoutMs) {
      if (this.cdcSubscriptionsActive === true) {
        this.logger.info(JOINING_LOG_MSG.CDC_READINESS_GATE_PASSED, {
          nodeId: this.nodeId,
          elapsedMs: this.now() - startMs,
        });
        return;
      }
      await this.sleep(pollMs);
    }
    this.logger.warn(JOINING_LOG_MSG.CDC_READINESS_GATE_DEGRADED, {
      nodeId: this.nodeId,
      timeoutMs,
      elapsedMs: this.now() - startMs,
    });
  }
  /**
   * CL-014 catch-up hydration: once CDC subscriptions are confirmed (or the
   * gate degraded), re-read every CDC-propagated table from the
   * authoritative owner path so rows written before this node became a
   * fan-out target are not silently missing until the next unrelated write.
   * Best-effort by contract: failures are logged and readiness proceeds —
   * the live stream and existing repair paths remain available.
   * @return {Promise<Object|null>} Hydration summary or null when skipped.
   * @private
   */
  async hydrateCdcPropagatedTablesAfterSubscription() {
    const cdcIntegrationService = this.cdcIntegrationService;
    if (
      !cdcIntegrationService ||
      typeof cdcIntegrationService.hydrateCdcPropagatedTablesFromAuthority !==
        TYPEOF.FUNCTION
    ) {
      this.logger.warn(JOINING_LOG_MSG.CDC_CATCHUP_HYDRATION_SKIPPED, {
        nodeId: this.nodeId,
        hasCdcIntegrationService: !!cdcIntegrationService,
      });
      return null;
    }
    try {
      return await cdcIntegrationService
        .hydrateCdcPropagatedTablesFromAuthority();
    } catch (error) {
      this.logger.warn(JOINING_LOG_MSG.CDC_CATCHUP_HYDRATION_FAILED, {
        nodeId: this.nodeId,
        error: error?.message || String(error),
      });
      return null;
    }
  }
  /**
   * Disable control-plane heartbeat reporting when a caller explicitly wants
   * direct CDC heartbeats to be the active publication path.
   * @return {void}
   * @private
   */
  disableSteadyStateControlPlaneReporter() {
    if (this.startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN) {
      return;
    }
    if (
      typeof this.heartbeatService?.setNodeStateReporter !== TYPEOF.FUNCTION
    ) {
      return;
    }
    this.heartbeatService.setNodeStateReporter(null);
  }
  resolveControlPlaneNodeStateUpdateTimeoutMs(options = {}) {
    const explicitTimeoutMs = Number(options.timeoutMs);
    if (Number.isFinite(explicitTimeoutMs) && explicitTimeoutMs > NUM.ZERO) {
      return Math.floor(explicitTimeoutMs);
    }
    const leadershipWaitTimeoutMs = Number(
      this.config?.leadershipWaitTimeoutMs,
    );
    if (
      Number.isFinite(leadershipWaitTimeoutMs) &&
      leadershipWaitTimeoutMs > NUM.ZERO
    ) {
      return Math.floor(leadershipWaitTimeoutMs);
    }
    const httpTimeoutMs = Number(this.config?.httpTimeoutMs);
    if (Number.isFinite(httpTimeoutMs) && httpTimeoutMs > NUM.ZERO) {
      return Math.floor(httpTimeoutMs);
    }
    return JOINING_DEFAULT.leadershipWaitTimeoutMs;
  }
  /**
   * Activate non-critical periodic control-plane writers once the joining
   * node reaches READY.
   * @return {void}
   * @private
   */
  activateControlPlaneBackgroundWriters() {
    return this.runtimeHandoffOwner.activateControlPlaneBackgroundWriters();
  }
  /**
   * Activate steady-state distributed transaction recovery after the node has
   * crossed the READY cutover. Join-time query engines intentionally defer
   * recovery replay until this point to avoid querying through an incomplete
   * self-hosted control-plane path during restart hydration.
   *
   * @return {void}
   * @private
   */
  activateDistributedTransactionRecovery() {
    return this.runtimeHandoffOwner.activateDistributedTransactionRecovery();
  }
  hasActiveControlPlaneBackgroundWriters() {
    return this.runtimeHandoffOwner.hasActiveControlPlaneBackgroundWriters();
  }
  buildControlPlaneHeartbeatStartOptions() {
    return {
      getStats: () => NodeService.getInstance().getNodeStats(),
      capabilities: this.getNodeCapabilities(),
    };
  }
  /**
   * Flush staged CREATE_SELF_HOSTED message-group metadata after the READY
   * cutover. This is intentionally non-blocking.
   *
   * @return {void}
   * @private
   */
  flushDeferredCreateSelfHostedMetadata() {
    return this.runtimeHandoffOwner.flushDeferredCreateSelfHostedMetadata();
  }
}

export {NodeJoiningReadySignalReadiness};
