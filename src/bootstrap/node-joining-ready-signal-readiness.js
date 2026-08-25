import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {
  NodeJoiningOperationLedgerFormationReadiness,
} from './node-joining-operation-ledger-formation-readiness.js';
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
import {
  getStartupAuthorityControlPlanePlacementEligibleNodeIds,
} from '../control-plane/startup-authority-placement-eligibility.js';
import {TABLES} from '../constants/index.js';
import {isNodeRecordReady} from '../node/node-readiness-policy.js';

const {
  CDC_REESTABLISHMENT,
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
  NODE_JOINING_SERVICE_LITERAL,
  NodeService,
  STARTUP_JOIN_MODE,
  STRING,
  assertCritical,
  waitForLocalQueryTransportReadiness,
  waitForMetadataPublicationReadiness,
} = NODE_JOINING_SERVICE_SHARED;

const INFRASTRUCTURE_JOIN_READY_SIGNAL_GATE = Object.freeze({
  CDC_SUBSCRIPTION: 'cdc_subscription',
  LOCAL_QUERY_TRANSPORT: 'local_query_transport',
  METADATA_PUBLICATION: 'metadata_publication',
  OPERATION_LEDGER_FORMATION: 'operation_ledger_formation',
  HEARTBEAT_PUBLICATION: 'heartbeat_publication',
});
const LOCAL_STR_BOOTSTRAP_METADATA_PUBLICATION_NOT_READY =
  'BOOTSTRAP_METADATA_PUBLICATION_NOT_READY';
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const numberIsSafeInteger = Number.isSafeInteger;
const OWN_DATA_VALUE_FIELD = 'value';
const INFRASTRUCTURE_JOIN_FAILURE_CODE_FIELD = 'code';
const INFRASTRUCTURE_JOIN_FAILURE_NAME_FIELD = 'name';
// Named absence variant: the error carries no own string value for the
// requested field (ARCH-0013 — raw null must not encode runtime state).
const INFRASTRUCTURE_JOIN_CODE_ABSENT = null;

function readOwnInfrastructureJoinFailureCode(error, field) {
  if (!error || typeof error !== 'object' || !objectHasOwn(error, field)) {
    return INFRASTRUCTURE_JOIN_CODE_ABSENT;
  }
  const descriptor = objectGetOwnPropertyDescriptor(error, field);
  if (!descriptor || !objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD)) {
    return INFRASTRUCTURE_JOIN_CODE_ABSENT;
  }
  return typeof descriptor.value === 'string' && descriptor.value.length > 0 ?
    descriptor.value :
    INFRASTRUCTURE_JOIN_CODE_ABSENT;
}

class NodeJoiningReadySignalReadiness
  extends NodeJoiningOperationLedgerFormationReadiness {
  recordInfrastructureJoinCheckpointTarget(checkpointTarget) {
    const current = this.infrastructureJoinProgress || {};
    this.infrastructureJoinProgress = {
      ...current,
      checkpointTarget:
        typeof checkpointTarget === 'string' && checkpointTarget.length > 0 ?
          checkpointTarget :
          null,
    };
  }
  recordInfrastructureJoinReadySignalProgress({
    gate,
    attempt = 1,
    lastFailureCode = null,
  }) {
    const current = this.infrastructureJoinProgress || {};
    this.infrastructureJoinProgress = {
      ...current,
      readySignalGate:
        typeof gate === 'string' && gate.length > 0 ? gate : null,
      readySignalAttempt:
        numberIsSafeInteger(attempt) && attempt > 0 ?
          attempt :
          null,
      readySignalLastFailureCode:
        typeof lastFailureCode === 'string' && lastFailureCode.length > 0 ?
          lastFailureCode :
          null,
    };
  }
  resolveInfrastructureJoinFailureCode(error, fallback = null) {
    const code = readOwnInfrastructureJoinFailureCode(
      error,
      INFRASTRUCTURE_JOIN_FAILURE_CODE_FIELD,
    );
    if (code !== null) {
      return code;
    }
    if (typeof fallback === 'string' && fallback.length > 0) {
      return fallback;
    }
    return readOwnInfrastructureJoinFailureCode(
      error,
      INFRASTRUCTURE_JOIN_FAILURE_NAME_FIELD,
    );
  }
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
        this.recordInfrastructureJoinReadySignalProgress({
          gate: INFRASTRUCTURE_JOIN_READY_SIGNAL_GATE.LOCAL_QUERY_TRANSPORT,
          attempt,
          lastFailureCode:
            readiness?.errorCode || readiness?.reasonCode || null,
        });
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
        this.recordInfrastructureJoinReadySignalProgress({
          gate: INFRASTRUCTURE_JOIN_READY_SIGNAL_GATE.METADATA_PUBLICATION,
          attempt,
          lastFailureCode:
            LOCAL_STR_BOOTSTRAP_METADATA_PUBLICATION_NOT_READY,
        });
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
      typeof readinessState?.evaluate === 'function' ?
        readinessState.evaluate() :
        typeof readinessState?.getSnapshot === 'function' ?
          readinessState.getSnapshot() :
          null;
    return this.resolveReadySignalMetadataPublicationReadinessSnapshot(
      snapshot,
    );
  }
  /**
   * Return startup-authority nodes that are already safe targets for the
   * priority placement lane, even though their public ready lease is still
   * withheld. This mirrors the existing rebalancer eligibility conjuncts:
   * owner-authored membership, ACTIVE registration row, connected/ready state,
   * and live transport. It does not make ordinary placement eligible.
   *
   * @param {Object} systemTableCache
   * @param {number} now
   * @return {Array<string>}
   * @private
   */
  async getPriorityPlacementFormationCandidateNodeIds(systemTableCache, now) {
    const startupAuthority =
      await this.getPriorityPlacementFormationStartupAuthority(now);
    return this.getPriorityPlacementFormationCandidateNodeIdsFromAuthority(
      systemTableCache,
      startupAuthority,
    );
  }
  async getPriorityPlacementFormationStartupAuthority(now) {
    const readinessService =
      this.rebalanceCoordinator?.controlPlaneReadinessService || null;
    if (
      !readinessService ||
      typeof readinessService.getStartupAuthoritySnapshotSync !== 'function'
    ) {
      return null;
    }
    try {
      if (
        typeof readinessService
          .getFormationReleaseStartupAuthoritySnapshot === 'function'
      ) {
        return await readinessService.getFormationReleaseStartupAuthoritySnapshot(
          this.seedNodeId || this.nodeId,
          now,
        );
      }
      if (
        typeof readinessService
          .getFormationReleaseStartupAuthoritySnapshotSync === 'function'
      ) {
        return readinessService.getFormationReleaseStartupAuthoritySnapshotSync(
          this.seedNodeId || this.nodeId,
          now,
        );
      }
      return readinessService.getStartupAuthoritySnapshotSync(
        this.seedNodeId || this.nodeId,
        now,
      );
    } catch {
      return null;
    }
  }
  getPriorityPlacementFormationCandidateNodeIdsFromAuthority(
    systemTableCache,
    startupAuthority,
  ) {
    return getStartupAuthorityControlPlanePlacementEligibleNodeIds({
      systemTableCache,
      startupAuthority,
      messageRouter: this.messageRouter,
      localNodeId: this.nodeId,
      includeSelf: true,
    });
  }
  getPriorityPlacementFormationPreReadyNodeIds(
    systemTableCache,
    candidateNodeIds,
    now,
  ) {
    if (
      !systemTableCache ||
      typeof systemTableCache.filter !== 'function'
    ) {
      return [];
    }
    const candidateNodeIdSet = new Set(candidateNodeIds);
    return systemTableCache
      .filter(
        TABLES.NODES,
        (node) =>
          candidateNodeIdSet.has(node?.node_id) &&
          !isNodeRecordReady(node, {now}),
      )
      .map((node) => node.node_id);
  }
  resolveReadySignalMetadataPublicationReadinessSnapshot(snapshot) {
    if (snapshot && typeof snapshot === 'object') {
      snapshot = {
        ...snapshot,
        backpressured: this.isLocalRouterBackpressured(),
      };
    }
    if (
      isMetadataPublicationReadySnapshot(snapshot) ||
      !snapshot ||
      typeof snapshot !== 'object' ||
      this.isBootstrapStartupComplete() !== true ||
      this.getSeedContactStartupAuthoritySnapshot()?.authorityAvailable !== true
    ) {
      return snapshot;
    }
    const snapshotReasons = Array.isArray(snapshot.reasons) ?
      snapshot.reasons.filter((reason) =>
        typeof reason === 'string' && reason.length > 0,
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
    this.recordInfrastructureJoinReadySignalProgress({
      gate: INFRASTRUCTURE_JOIN_READY_SIGNAL_GATE.CDC_SUBSCRIPTION,
    });
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
    //
    // Run it FIRE-AND-FORGET (honoring that "never block readiness" contract):
    // the catch-up is 19 sequential distributed full-table reads to the single
    // authoritative seed, so awaiting it serialized ~28s/join into the join
    // critical path and the serial sum blew the join timeout by the ~5th joiner
    // under N-node formation (measured per-phase). Backgrounding it keeps the
    // heartbeat/READY advertisement below off that read path; the live stream +
    // steady-state owner-RPC repair close any residual window. Rolling-restart
    // gate N=3 CONVERGED 3/3 (0 corrupt) with this behavior.
    this.runBackgroundCdcCatchupAfterSubscription();
    this.recordInfrastructureJoinReadySignalProgress({
      gate: INFRASTRUCTURE_JOIN_READY_SIGNAL_GATE.LOCAL_QUERY_TRANSPORT,
    });
    try {
      await this.awaitLocalQueryTransportReadinessForReadySignal();
    } catch (error) {
      this.recordInfrastructureJoinReadySignalProgress({
        gate: INFRASTRUCTURE_JOIN_READY_SIGNAL_GATE.LOCAL_QUERY_TRANSPORT,
        attempt: this.infrastructureJoinProgress?.readySignalAttempt,
        lastFailureCode: this.resolveInfrastructureJoinFailureCode(error),
      });
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
    this.recordInfrastructureJoinReadySignalProgress({
      gate: INFRASTRUCTURE_JOIN_READY_SIGNAL_GATE.METADATA_PUBLICATION,
    });
    try {
      await this.awaitMetadataPublicationReadinessForReadySignal();
    } catch (error) {
      this.recordInfrastructureJoinReadySignalProgress({
        gate: INFRASTRUCTURE_JOIN_READY_SIGNAL_GATE.METADATA_PUBLICATION,
        attempt: this.infrastructureJoinProgress?.readySignalAttempt,
        lastFailureCode: this.resolveInfrastructureJoinFailureCode(
          error,
          LOCAL_STR_BOOTSTRAP_METADATA_PUBLICATION_NOT_READY,
        ),
      });
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
    this.recordInfrastructureJoinReadySignalProgress({
      gate: INFRASTRUCTURE_JOIN_READY_SIGNAL_GATE.OPERATION_LEDGER_FORMATION,
    });
    await this.awaitOperationLedgerFormationBarrier();
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
      Math.max(1, Math.floor(this.config.readySignalMaxAttempts)) :
      JOINING_DEFAULT.readySignalMaxAttempts;
    const maxDelayMs = Number.isFinite(this.config.readySignalRetryMaxDelayMs) ?
      Math.max(1, Math.floor(this.config.readySignalRetryMaxDelayMs)) :
      JOINING_DEFAULT.readySignalRetryMaxDelayMs;
    const backoffMultiplier =
      Number.isFinite(this.config.readySignalRetryBackoffMultiplier) &&
      this.config.readySignalRetryBackoffMultiplier > 0 ?
        this.config.readySignalRetryBackoffMultiplier :
        JOINING_DEFAULT.readySignalRetryBackoffMultiplier;
    let delayMs = Number.isFinite(this.config.readySignalRetryDelayMs) ?
      Math.max(1, Math.floor(this.config.readySignalRetryDelayMs)) :
      JOINING_DEFAULT.readySignalRetryDelayMs;
    let lastError = null;
    const waitLogMessage = JOINING_LOG_MSG.READY_SIGNAL_RETRYING;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.recordInfrastructureJoinReadySignalProgress({
        gate: INFRASTRUCTURE_JOIN_READY_SIGNAL_GATE.HEARTBEAT_PUBLICATION,
        attempt,
      });
      try {
        await heartbeat.sendHeartbeat(heartbeatPayload, capabilities, {
          requireDurableVisibility: true,
        });
        this.logger.info(JOINING_LOG_MSG.READY_SIGNAL_SUCCESS, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
        });
        return;
      } catch (error) {
        lastError = error;
        this.recordInfrastructureJoinReadySignalProgress({
          gate: INFRASTRUCTURE_JOIN_READY_SIGNAL_GATE.HEARTBEAT_PUBLICATION,
          attempt,
          lastFailureCode: this.resolveInfrastructureJoinFailureCode(error),
        });
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
        'function'
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
   * Run the CL-014 post-arm catch-up window-close without blocking readiness.
   * Fire-and-forget by contract: the catch-up is best-effort and the live
   * stream + repair paths remain, so a joining node does not serialize 19
   * distributed full-table reads to the saturated seed into its join critical
   * path during formation. Errors are swallowed inside
   * hydrateCdcPropagatedTablesAfterSubscription; the extra catch is defensive so
   * an unexpected synchronous throw can never surface as an unhandled rejection.
   * @return {void}
   * @private
   */
  runBackgroundCdcCatchupAfterSubscription() {
    Promise.resolve()
      .then(() => this.hydrateCdcPropagatedTablesAfterSubscription())
      .catch((error) => {
        this.logger.warn(JOINING_LOG_MSG.CDC_CATCHUP_HYDRATION_FAILED, {
          nodeId: this.nodeId,
          error: error?.message || String(error),
        });
      });
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
      typeof this.heartbeatService?.setNodeStateReporter !== 'function'
    ) {
      return;
    }
    this.heartbeatService.setNodeStateReporter(null);
  }
  resolveControlPlaneNodeStateUpdateTimeoutMs(options = {}) {
    const explicitTimeoutMs = Number(options.timeoutMs);
    if (Number.isFinite(explicitTimeoutMs) && explicitTimeoutMs > 0) {
      return Math.floor(explicitTimeoutMs);
    }
    const leadershipWaitTimeoutMs = Number(
      this.config?.leadershipWaitTimeoutMs,
    );
    if (
      Number.isFinite(leadershipWaitTimeoutMs) &&
      leadershipWaitTimeoutMs > 0
    ) {
      return Math.floor(leadershipWaitTimeoutMs);
    }
    const httpTimeoutMs = Number(this.config?.httpTimeoutMs);
    if (Number.isFinite(httpTimeoutMs) && httpTimeoutMs > 0) {
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
