import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';
import {installControlPlaneReadinessNodeMethods} from './control-plane-readiness-service-node-methods.js';

const LOCAL_STR_ZHDQ9 = 'control-plane-readiness-evaluation';
const LOCAL_STR_MESSAGEROUTER = 'messageRouter';
const LOCAL_STR_O1VD7 = 'cdcIntegrationService';
const LOCAL_STR_1506A = 'storageAccountingService';
const LOCAL_STR_1UD6S = 'cdcGroupPropagationService';
const LOCAL_STR_13YWM = 'membershipPublicationService';

const {
  AUTHORITATIVE_READINESS_REPAIR,
  AuthoritativeNodeEvidenceReconciler,
  CONTROL_PLANE_PARTICIPATION_DECISION,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SUBSYSTEM,
  ControlPlaneDiagnosticsLedger,
  DurableWorkflowCoordinator,
  LoggingService,
  MEMBERSHIP_PUBLICATION_PLANNING,
  MEMBERSHIP_PUBLICATION_READ_OPTIONS,
  NUM,
  OperationLane,
  READINESS_DIAGNOSTICS_LEDGER_LIMIT,
  READINESS_TRANSITION_HISTORY_LIMIT,
  RECOVERY_EPOCH_EVENT_LIMIT,
  RECOVERY_EPOCH_HISTORY_LIMIT,
  TYPEOF,
  buildParticipationErrorCode,
  buildParticipationErrorMessage,
  compactEligibilitySnapshot,
  createControlPlaneRuntimeBundle,
  evaluateEligibilityDecision,
  normalizeControlPlaneParticipationKind,
  normalizePositiveInteger,
  resolveParticipationDecisionDimension,
  shouldAllowLocalExecutionForParticipation,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

class ControlPlaneReadinessServiceSegment1 {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.nodesOwner = options.nodesOwner || null;
    this.servicesOwner = options.servicesOwner || null;
    this.messageRouter = options.messageRouter || null;
    this.nodeLifecycleStateMachine = options.nodeLifecycleStateMachine || null;
    this.storageAccountingService = options.storageAccountingService || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.cacheMutationTarget =
      options.cacheMutationTarget || options.systemTableCache || null;
    this.cdcGroupPropagationService =
      options.cdcGroupPropagationService || null;
    this.heartbeatService = options.heartbeatService || null;
    this.membershipPublicationService =
      options.membershipPublicationService || null;
    this.strictOwnerDependencies = options.strictOwnerDependencies === true;
    this.clusterMemberStaleHeartbeatMaxAgeMs =
      Number.isFinite(options.clusterMemberStaleHeartbeatMaxAgeMs) &&
      options.clusterMemberStaleHeartbeatMaxAgeMs > NUM.ZERO ?
        Math.floor(options.clusterMemberStaleHeartbeatMaxAgeMs) :
        CONTROL_PLANE_READINESS_DEFAULT.CLUSTER_MEMBER_STALE_HEARTBEAT_MAX_AGE_MS;
    this.authoritativeReadinessRepairCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairCooldownMs) &&
      options.authoritativeReadinessRepairCooldownMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.COOLDOWN_MS;
    this.authoritativeReadinessRepairFailureCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairFailureCooldownMs) &&
      options.authoritativeReadinessRepairFailureCooldownMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairFailureCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.FAILURE_COOLDOWN_MS;
    this.authoritativeReadinessRepairNoChangeCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairNoChangeCooldownMs) &&
      options.authoritativeReadinessRepairNoChangeCooldownMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairNoChangeCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.NO_CHANGE_COOLDOWN_MS;
    this.authoritativeReadinessRepairQueryTimeoutMs =
      Number.isFinite(options.authoritativeReadinessRepairQueryTimeoutMs) &&
      options.authoritativeReadinessRepairQueryTimeoutMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairQueryTimeoutMs) :
        AUTHORITATIVE_READINESS_REPAIR.QUERY_TIMEOUT_MS;
    this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs =
      Number.isFinite(
        options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
      ) && options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs) :
        AUTHORITATIVE_READINESS_REPAIR.STALE_HEARTBEAT_MAX_AGE_MS;
    this.membershipPublicationDiagnosticsQueryTimeoutMs =
      Number.isFinite(options.membershipPublicationDiagnosticsQueryTimeoutMs) &&
      options.membershipPublicationDiagnosticsQueryTimeoutMs > NUM.ZERO ?
        Math.floor(options.membershipPublicationDiagnosticsQueryTimeoutMs) :
        CONTROL_PLANE_READINESS_DEFAULT.MEMBERSHIP_PUBLICATION_DIAGNOSTICS_QUERY_TIMEOUT_MS;
    this.membershipPublicationPlanningSnapshotRefreshTimeoutMs =
      Number.isFinite(
        options.membershipPublicationPlanningSnapshotRefreshTimeoutMs,
      ) &&
      options.membershipPublicationPlanningSnapshotRefreshTimeoutMs > NUM.ZERO ?
        Math.floor(
          options.membershipPublicationPlanningSnapshotRefreshTimeoutMs,
        ) :
        MEMBERSHIP_PUBLICATION_PLANNING.REFRESH_TIMEOUT_MS;
    this.membershipPublicationPlanningActiveStaleGraceMs =
      Number.isFinite(
        options.membershipPublicationPlanningActiveStaleGraceMs,
      ) && options.membershipPublicationPlanningActiveStaleGraceMs > NUM.ZERO ?
        Math.floor(options.membershipPublicationPlanningActiveStaleGraceMs) :
        MEMBERSHIP_PUBLICATION_PLANNING.ACTIVE_STALE_GRACE_MS;
    this.membershipPublicationReadOptions = Object.freeze({
      ...MEMBERSHIP_PUBLICATION_READ_OPTIONS,
      queryTimeoutMs: this.membershipPublicationDiagnosticsQueryTimeoutMs,
    });
    this.setTimeoutFn =
      typeof options.setTimeoutFn === TYPEOF.FUNCTION ?
        options.setTimeoutFn :
        setTimeout;
    this.clearTimeoutFn =
      typeof options.clearTimeoutFn === TYPEOF.FUNCTION ?
        options.clearTimeoutFn :
        clearTimeout;
    this.loggedMissingStorageAccountingOwner = false;
    this.loggedMissingPublicationOwner = false;
    this.readinessTransitionHistoryLimit =
      Number.isInteger(options.readinessTransitionHistoryLimit) &&
      options.readinessTransitionHistoryLimit > NUM.ZERO ?
        Math.floor(options.readinessTransitionHistoryLimit) :
        READINESS_TRANSITION_HISTORY_LIMIT;
    this.readinessTransitionHistoryByNodeId = new Map();
    this.readinessTransitionHistoryViewByNodeId = new Map();
    this.lastReadinessEvaluationByNodeId = new Map();
    this.lastReadinessSnapshotByNodeId = new Map();
    this.lastReadinessSnapshotAtMsByNodeId = new Map();
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId = new Map();
    this.lastReadinessSnapshotClusterInvalidatedAtMs = NUM.ZERO;
    this.membershipPublicationDiagnosticsMemo = null;
    this.lastActivePriorityRecoveryPlanningSnapshotByNodeId = new Map();
    this.lastActivePriorityRecoveryPlanningSnapshotAtMsByNodeId = new Map();
    // CL-033: per-publisher-node memo of the priority-recovery planning
    // projection (deep cluster read + parse/clone-heavy projection), validated
    // by the existing readiness invalidation markers — see
    // resolveMemoizedPriorityRecoveryPlanningProjectionSync.
    this.priorityRecoveryPlanningProjectionMemoByNodeId = new Map();
    this.recoveryEpochHistoryLimit =
      Number.isInteger(options.recoveryEpochHistoryLimit) &&
      options.recoveryEpochHistoryLimit > NUM.ZERO ?
        Math.floor(options.recoveryEpochHistoryLimit) :
        RECOVERY_EPOCH_HISTORY_LIMIT;
    this.recoveryEpochEventLimit =
      Number.isInteger(options.recoveryEpochEventLimit) &&
      options.recoveryEpochEventLimit > NUM.ZERO ?
        Math.floor(options.recoveryEpochEventLimit) :
        RECOVERY_EPOCH_EVENT_LIMIT;
    this.currentRecoveryEpochByNodeId = new Map();
    this.recoveryEpochHistoryByNodeId = new Map();
    this.authoritativeControlPlaneView =
      options.authoritativeControlPlaneView || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      (this.cdcIntegrationService || this.systemTableCache || this.messageRouter ?
        createControlPlaneRuntimeBundle({
          nodeId: this.nodeId,
          cdcIntegrationService: this.cdcIntegrationService,
          systemTableCache: this.systemTableCache,
          messageRouter: this.messageRouter,
          now: options.now,
        }).controlPlaneSystemTableGateway :
        null);
    this.localClusterIncarnationFenceProvider =
      typeof options.getLocalClusterIncarnationFence === TYPEOF.FUNCTION ?
        options.getLocalClusterIncarnationFence :
        null;
    this.now =
      typeof options.now === TYPEOF.FUNCTION ? options.now : () => Date.now();
    this.participationDecisionLedger =
      options.participationDecisionLedger ||
      new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(
          options.participationDecisionLedgerMaxEntries,
          READINESS_DIAGNOSTICS_LEDGER_LIMIT,
        ),
        now: this.now,
      });
    this.authoritativeReadinessRepairLedger =
      options.authoritativeReadinessRepairLedger ||
      new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(
          options.authoritativeReadinessRepairLedgerMaxEntries,
          READINESS_DIAGNOSTICS_LEDGER_LIMIT,
        ),
        now: this.now,
      });
    this.readinessOperationWorkflowCoordinator =
      options.readinessOperationWorkflowCoordinator ||
      new DurableWorkflowCoordinator({
        now: this.now,
      });
    this.readinessEvaluationLane =
      options.readinessEvaluationLane ||
      new OperationLane({
        name: LOCAL_STR_ZHDQ9,
        workflowCoordinator: this.readinessOperationWorkflowCoordinator,
      });
    this.cacheChangeListener = null;
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CONTROL_PLANE_READINESS_SUBSYSTEM) :
      console;
    this.authoritativeNodeEvidenceReconciler =
      options.authoritativeNodeEvidenceReconciler ||
      new AuthoritativeNodeEvidenceReconciler({
        nodeId: this.nodeId,
        now: this.now,
        logger: this.logger,
        cdcIntegrationService: this.cdcIntegrationService,
        cacheMutationTarget: this.cacheMutationTarget,
        systemTableCache: this.systemTableCache,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        getAuthoritativeControlPlaneView: () =>
          this.getAuthoritativeControlPlaneView(),
        readNodeRow: (nodeId) => this.readNodeRow(nodeId),
        readNodeServiceRows: (nodeId) => this.readNodeServiceRows(nodeId),
        resolveDecisionDimension: (repairOptions) =>
          this.resolveReadinessDecisionDimension(repairOptions),
        getNodeTransportState: (nodeId, nodeRow) =>
          this.getNodeTransportState(nodeId, nodeRow),
        shouldPreferLocalSelfNodeEvidence: (context) =>
          this.shouldPreferLocalSelfNodeEvidence(context),
        hasFreshLocalReporterSuccess: (nodeId) =>
          this.hasFreshLocalReporterSuccess(nodeId),
        buildNodeEvidence: (nodeId, nodeRow) =>
          this.buildNodeEvidence(nodeId, nodeRow),
        isClusterMemberHealthy: (nodeId, nodeRow) =>
          this.isClusterMemberHealthy(nodeId, nodeRow),
        hasRoutableService: (serviceRows) =>
          this.hasRoutableService(serviceRows),
        hasWritableControlPlaneService: (serviceRows) =>
          this.hasWritableControlPlaneService(serviceRows),
        workflowCoordinator: this.readinessOperationWorkflowCoordinator,
        authoritativeReadinessRepairLedger:
          options.authoritativeReadinessRepairLedger,
        authoritativeReadinessRepairLedgerMaxEntries:
          options.authoritativeReadinessRepairLedgerMaxEntries,
        authoritativeReadinessRepairLane:
          options.authoritativeReadinessRepairLane,
        authoritativeReadinessRepairCooldownMs:
          this.authoritativeReadinessRepairCooldownMs,
        authoritativeReadinessRepairFailureCooldownMs:
          this.authoritativeReadinessRepairFailureCooldownMs,
        authoritativeReadinessRepairNoChangeCooldownMs:
          this.authoritativeReadinessRepairNoChangeCooldownMs,
        authoritativeReadinessRepairQueryTimeoutMs:
          this.authoritativeReadinessRepairQueryTimeoutMs,
        authoritativeReadinessRepairStaleHeartbeatMaxAgeMs:
          this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
      });
    this.subscribeToCacheChanges();
  }

  /**
   * Log one-time diagnostics for missing readiness owners.
   * In non-strict mode the service degrades intentionally, so warn instead
   * of emitting a hard-error signal.
   * @param {string} message
   * @param {string} owner
   * @private
   */
  logMissingOwner(message, owner) {
    const level = this.strictOwnerDependencies ? 'error' : 'warn';
    const logFn =
      typeof this.logger?.[level] === TYPEOF.FUNCTION ?
        this.logger[level].bind(this.logger) :
        null;
    if (!logFn) {
      return;
    }

    logFn(message, {
      nodeId: this.nodeId,
      owner,
      strictOwnerDependencies: this.strictOwnerDependencies,
    });
  }

  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    const previousSystemTableCache = this.systemTableCache;
    const systemTableCacheProvided = Object.hasOwn(options, 'systemTableCache');
    const cacheMutationTargetProvided = Object.hasOwn(
      options,
      'cacheMutationTarget',
    );

    if (systemTableCacheProvided) {
      this.systemTableCache = options.systemTableCache || null;
    }
    if (cacheMutationTargetProvided) {
      this.cacheMutationTarget = options.cacheMutationTarget || null;
    } else if (systemTableCacheProvided) {
      this.cacheMutationTarget = this.systemTableCache;
    }
    if (Object.hasOwn(options, LOCAL_STR_MESSAGEROUTER)) {
      this.messageRouter = options.messageRouter || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_O1VD7)) {
      this.cdcIntegrationService = options.cdcIntegrationService || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_1506A)) {
      this.storageAccountingService = options.storageAccountingService || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_1UD6S)) {
      this.cdcGroupPropagationService =
        options.cdcGroupPropagationService || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_13YWM)) {
      if (
        this.membershipPublicationService !==
        (options.membershipPublicationService || null)
      ) {
        this.membershipPublicationDiagnosticsMemo = null;
        // CL-033: the planning projection derives from this service's reads.
        this.priorityRecoveryPlanningProjectionMemoByNodeId?.clear();
      }
      this.membershipPublicationService =
        options.membershipPublicationService || null;
    }
    if (
      this.authoritativeControlPlaneView &&
      typeof this.authoritativeControlPlaneView.syncOwnerDependencies ===
        TYPEOF.FUNCTION
    ) {
      this.authoritativeControlPlaneView.syncOwnerDependencies({
        cdcIntegrationService: this.cdcIntegrationService,
        messageRouter: this.messageRouter,
      });
    }

    if (
      systemTableCacheProvided &&
      previousSystemTableCache !== this.systemTableCache
    ) {
      if (
        this.cacheChangeListener &&
        typeof previousSystemTableCache?.offCacheChange === TYPEOF.FUNCTION
      ) {
        previousSystemTableCache.offCacheChange(this.cacheChangeListener);
      }
      this.cacheChangeListener = null;
      // CL-019: snapshots and memos built from the previous cache must not
      // survive a cache swap as trusted reuse candidates — the new cache's
      // change events never covered them.
      this.lastReadinessSnapshotByNodeId.clear();
      this.lastReadinessSnapshotAtMsByNodeId.clear();
      this.lastReadinessSnapshotInvalidatedAtMsByNodeId.clear();
      this.lastReadinessSnapshotClusterInvalidatedAtMs = NUM.ZERO;
      this.membershipPublicationDiagnosticsMemo = null;
      this.priorityRecoveryPlanningProjectionMemoByNodeId?.clear();
      this.subscribeToCacheChanges();
    }
  }

  /**
   * Return one canonical control-plane participation decision for the
   * requested node and work kind.
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async getControlPlaneParticipation(nodeId, options = {}) {
    const participationKind = normalizeControlPlaneParticipationKind(
      options?.participationKind,
    );
    const decisionDimension = resolveParticipationDecisionDimension(
      participationKind,
      options?.decisionDimension,
    );
    const readiness = await this.getNodeReadiness(nodeId, {
      ...options,
      decisionDimension,
    });
    return this.buildControlPlaneParticipation({
      nodeId,
      readiness,
      participationKind,
      decisionDimension,
      tableName: options?.tableName || null,
      partitionId: options?.partitionId || null,
    });
  }

  /**
   * Return one synchronous canonical control-plane participation decision.
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @return {Object}
   */
  getControlPlaneParticipationSync(nodeId, options = {}) {
    const participationKind = normalizeControlPlaneParticipationKind(
      options?.participationKind,
    );
    const decisionDimension = resolveParticipationDecisionDimension(
      participationKind,
      options?.decisionDimension,
    );
    const readiness = this.getNodeReadinessSync(nodeId, {
      ...options,
      decisionDimension,
    });
    return this.buildControlPlaneParticipation({
      nodeId,
      readiness,
      participationKind,
      decisionDimension,
      tableName: options?.tableName || null,
      partitionId: options?.partitionId || null,
    });
  }

  /**
   * Build one bounded participation decision from the canonical readiness
   * snapshot.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildControlPlaneParticipation(context) {
    const snapshot =
      context?.readiness && typeof context.readiness === TYPEOF.OBJECT ?
        context.readiness :
        null;
    const decisionDimension = resolveParticipationDecisionDimension(
      normalizeControlPlaneParticipationKind(context?.participationKind),
      context?.decisionDimension,
    );
    const decision =
      snapshot?.dimensions && typeof snapshot.dimensions === TYPEOF.OBJECT ?
        evaluateEligibilityDecision(snapshot, decisionDimension) :
        Object.freeze({
          nodeId: context?.nodeId || null,
          decisionDimension,
          eligible: false,
          failedDimensions: Object.freeze([decisionDimension]),
          reasonCodes: Object.freeze([]),
        });
    const compactSummary = compactEligibilitySnapshot(
      snapshot,
      decisionDimension,
    );
    const summary = compactSummary ?
      Object.freeze({
        ...compactSummary,
        ...(snapshot?.projectionReadinessContract &&
          typeof snapshot.projectionReadinessContract === TYPEOF.OBJECT ?
          {
            projectionReadinessContract:
              snapshot.projectionReadinessContract,
          } :
          {}),
      }) :
      null;
    const cacheWatermark = this.buildStoredReadinessSnapshotWatermark(snapshot);
    const localQueryTransport = snapshot?.nodeEvidence ?
      Object.freeze({
        state: snapshot.nodeEvidence.localQueryTransportState || null,
        ready:
            typeof snapshot.nodeEvidence.localQueryTransportReady === 'boolean' ?
              snapshot.nodeEvidence.localQueryTransportReady :
              null,
        reason: snapshot.nodeEvidence.localQueryTransportReason || null,
        reasonCode:
            snapshot.nodeEvidence.localQueryTransportReasonCode || null,
        errorCode: snapshot.nodeEvidence.localQueryTransportErrorCode || null,
        retryAfterMs: Number.isFinite(
          snapshot.nodeEvidence.localQueryTransportRetryAfterMs,
        ) ?
          snapshot.nodeEvidence.localQueryTransportRetryAfterMs :
          null,
      }) :
      null;
    const transportState = snapshot?.nodeEvidence ?
      Object.freeze({
        connected: snapshot.nodeEvidence.transportConnected === true,
        rowState: snapshot.nodeEvidence.rowConnectionState || null,
        routerState: snapshot.nodeEvidence.routerConnectionState || null,
        localQueryTransportState:
            snapshot.nodeEvidence.localQueryTransportState || null,
        localQueryTransportReady:
            typeof snapshot.nodeEvidence.localQueryTransportReady === 'boolean' ?
              snapshot.nodeEvidence.localQueryTransportReady :
              null,
        localQueryTransportReason:
            snapshot.nodeEvidence.localQueryTransportReason || null,
        localQueryTransportReasonCode:
            snapshot.nodeEvidence.localQueryTransportReasonCode || null,
        localQueryTransportErrorCode:
            snapshot.nodeEvidence.localQueryTransportErrorCode || null,
        localQueryTransportRetryAfterMs: Number.isFinite(
          snapshot.nodeEvidence.localQueryTransportRetryAfterMs,
        ) ?
          snapshot.nodeEvidence.localQueryTransportRetryAfterMs :
          null,
      }) :
      null;
    const authoritativeRepair = this.getLatestAuthoritativeReadinessRepair(
      context?.nodeId || null,
    );
    const reasonCodes = Array.isArray(decision?.reasonCodes) ?
      decision.reasonCodes :
      Object.freeze([]);
    const localExecutionAllowed = shouldAllowLocalExecutionForParticipation({
      localNodeId: this.nodeId,
      targetNodeId: context?.nodeId || null,
      participationKind: normalizeControlPlaneParticipationKind(
        context?.participationKind,
      ),
      localQueryTransport,
    });
    const reasonCode =
      reasonCodes.length > NUM.ZERO ? reasonCodes[NUM.ZERO] : null;
    const deferRetry =
      reasonCode ===
        CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY &&
      Number.isFinite(localQueryTransport?.retryAfterMs) &&
      localQueryTransport.retryAfterMs > NUM.ZERO;
    const participation = {
      nodeId: context?.nodeId || null,
      tableName:
        typeof context?.tableName === TYPEOF.STRING &&
        context.tableName.length > NUM.ZERO ?
          context.tableName :
          null,
      partitionId:
        typeof context?.partitionId === TYPEOF.STRING &&
        context.partitionId.length > NUM.ZERO ?
          context.partitionId :
          null,
      participationKind: normalizeControlPlaneParticipationKind(
        context?.participationKind,
      ),
      decisionDimension,
      eligible: decision?.eligible === true,
      decision:
        decision?.eligible === true ?
          CONTROL_PLANE_PARTICIPATION_DECISION.READY :
          deferRetry ?
            CONTROL_PLANE_PARTICIPATION_DECISION.DEFER :
            CONTROL_PLANE_PARTICIPATION_DECISION.BLOCKED,
      reasonCode,
      reasonCodes,
      retryAfterMs:
        Number.isFinite(localQueryTransport?.retryAfterMs) &&
        localQueryTransport.retryAfterMs > NUM.ZERO ?
          localQueryTransport.retryAfterMs :
          null,
      deferRetry,
      localExecutionAllowed,
      errorCode: null,
      error: null,
      cacheWatermark,
      transportState,
      lifecyclePhase:
        typeof snapshot?.lifecycleState === TYPEOF.STRING &&
        snapshot.lifecycleState.length > NUM.ZERO ?
          snapshot.lifecycleState :
          summary?.lifecycleState || null,
      authoritativeRepair,
      localQueryTransport,
      snapshot,
      failedDimensions: Array.isArray(decision?.failedDimensions) ?
        decision.failedDimensions :
        Object.freeze([]),
      summary: summary ?
        Object.freeze({
          decisionDimension: summary.decisionDimension || decisionDimension,
          observedAt: summary.observedAt || null,
          lifecycleState: summary.lifecycleState || null,
          reasonCodes: summary.reasonCodes || Object.freeze([]),
          projectionReadinessContract:
            summary.projectionReadinessContract || null,
          projectionReadinessState:
            summary.projectionReadinessContract?.state || null,
          failedDimensions: Array.isArray(decision?.failedDimensions) ?
            decision.failedDimensions :
            Object.freeze([]),
        }) :
        null,
    };

    if (participation.decision !== CONTROL_PLANE_PARTICIPATION_DECISION.READY) {
      participation.errorCode = buildParticipationErrorCode(participation);
      participation.error = buildParticipationErrorMessage(participation);
    }

    const frozenParticipation = Object.freeze(participation);
    this.recordParticipationDecision(frozenParticipation);
    return frozenParticipation;
  }

  /**
   * Persist one bounded participation-decision record for diagnostics.
   * @param {Object|null} participation
   * @return {void}
   * @private
   */
}

installControlPlaneReadinessNodeMethods(
  ControlPlaneReadinessServiceSegment1.prototype,
);

export {ControlPlaneReadinessServiceSegment1};
