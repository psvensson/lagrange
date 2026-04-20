import { CONTROL_PLANE_READINESS_SERVICE_SHARED } from "./control-plane-readiness-service-shared.js";

const {
  AUTHORITATIVE_READINESS_REPAIR,
  AUTHORITY_DESCRIPTOR_STATE,
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  AuthoritativeControlPlaneView,
  AuthoritativeNodeEvidenceReconciler,
  COLUMN,
  CONTROL_PLANE_PARTICIPATION_DECISION,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SUBSYSTEM,
  ControlPlaneDiagnosticsLedger,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DurableWorkflowCoordinator,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  MEMBERSHIP_PUBLICATION_AUTHORITATIVE_READ_MODE,
  MEMBERSHIP_PUBLICATION_PLANNING,
  MEMBERSHIP_PUBLICATION_PLANNING_READ_OPTIONS,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
  MEMBERSHIP_PUBLICATION_READ_LANE,
  MEMBERSHIP_PUBLICATION_READ_OPTIONS,
  MEMBERSHIP_PUBLICATION_READ_SCOPE,
  MISSING_NODE_READINESS_REASON,
  MISSING_NODE_READINESS_STATE,
  NUM,
  OperationLane,
  PRESSURE_STATE,
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE,
  PROVISIONING_ELIGIBILITY_STATE,
  PUBLICATION_REASON_CONFIG_SAFE_MODE,
  READINESS_DIAGNOSTICS_LEDGER_LIMIT,
  READINESS_ERROR_MSG,
  READINESS_TRANSITION_HISTORY_LIMIT,
  RECOVERY_EPOCH_EVENT_LIMIT,
  RECOVERY_EPOCH_HISTORY_LIMIT,
  RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
  RECOVERY_PROTOCOL_STATE,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STARTUP_AUTHORITY_STATE,
  STATE,
  TABLES,
  TIME_MS,
  TYPEOF,
  assertCritical,
  buildControlPlanePublicationStory,
  buildParticipationErrorCode,
  buildParticipationErrorMessage,
  buildPublicationRecoveryGateSnapshot,
  buildPublicationRecoveryProtocolSnapshot,
  buildReadinessTransitionOwnerState,
  buildReason,
  buildStartupAuthorityFailureOwnerDescriptor,
  buildStartupAuthorityHealthDetails,
  buildStartupAuthorityOwnerContract,
  buildStartupAuthorityOwnerSnapshotFromPlanningAnswer,
  buildStartupAuthorityOwnerUnavailableSnapshot,
  buildStartupAuthorityPriorityPartitionOwnerDescriptor,
  buildStartupAuthorityPublicationOwnerDescriptor,
  buildStartupAuthorityRecoveryProtocolOwnerDescriptor,
  buildStartupAuthorityTargetParticipationOwnerDescriptor,
  compactEligibilitySnapshot,
  compareNodeHeartbeatWatermarks,
  createControlPlaneRuntimeBundle,
  createEligibilitySnapshot,
  evaluateEligibilityDecision,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeRecordReady,
  normalizeControlPlaneParticipationKind,
  normalizeDiagnosticTimestampMs,
  normalizeIsoTimestamp,
  normalizeLocalQueryTransportEvidence,
  normalizeNodeIdList,
  normalizePositiveInteger,
  resolveMembershipPublicationPlanningSource,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
  resolveMembershipPublicationReadScope,
  resolveParticipationDecisionDimension,
  resolvePriorityRecoveryActiveNodeCohort,
  shouldAllowLocalExecutionForParticipation,
  unwrapRowReadResult,
  wasNodeRecordReadyWhenWritten,
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
      options.clusterMemberStaleHeartbeatMaxAgeMs > NUM.ZERO
        ? Math.floor(options.clusterMemberStaleHeartbeatMaxAgeMs)
        : CONTROL_PLANE_READINESS_DEFAULT.CLUSTER_MEMBER_STALE_HEARTBEAT_MAX_AGE_MS;
    this.authoritativeReadinessRepairCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairCooldownMs) &&
      options.authoritativeReadinessRepairCooldownMs > NUM.ZERO
        ? Math.floor(options.authoritativeReadinessRepairCooldownMs)
        : AUTHORITATIVE_READINESS_REPAIR.COOLDOWN_MS;
    this.authoritativeReadinessRepairFailureCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairFailureCooldownMs) &&
      options.authoritativeReadinessRepairFailureCooldownMs > NUM.ZERO
        ? Math.floor(options.authoritativeReadinessRepairFailureCooldownMs)
        : AUTHORITATIVE_READINESS_REPAIR.FAILURE_COOLDOWN_MS;
    this.authoritativeReadinessRepairNoChangeCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairNoChangeCooldownMs) &&
      options.authoritativeReadinessRepairNoChangeCooldownMs > NUM.ZERO
        ? Math.floor(options.authoritativeReadinessRepairNoChangeCooldownMs)
        : AUTHORITATIVE_READINESS_REPAIR.NO_CHANGE_COOLDOWN_MS;
    this.authoritativeReadinessRepairQueryTimeoutMs =
      Number.isFinite(options.authoritativeReadinessRepairQueryTimeoutMs) &&
      options.authoritativeReadinessRepairQueryTimeoutMs > NUM.ZERO
        ? Math.floor(options.authoritativeReadinessRepairQueryTimeoutMs)
        : AUTHORITATIVE_READINESS_REPAIR.QUERY_TIMEOUT_MS;
    this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs =
      Number.isFinite(
        options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
      ) && options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs > NUM.ZERO
        ? Math.floor(options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs)
        : AUTHORITATIVE_READINESS_REPAIR.STALE_HEARTBEAT_MAX_AGE_MS;
    this.membershipPublicationDiagnosticsQueryTimeoutMs =
      Number.isFinite(options.membershipPublicationDiagnosticsQueryTimeoutMs) &&
      options.membershipPublicationDiagnosticsQueryTimeoutMs > NUM.ZERO
        ? Math.floor(options.membershipPublicationDiagnosticsQueryTimeoutMs)
        : CONTROL_PLANE_READINESS_DEFAULT.MEMBERSHIP_PUBLICATION_DIAGNOSTICS_QUERY_TIMEOUT_MS;
    this.membershipPublicationPlanningSnapshotRefreshTimeoutMs =
      Number.isFinite(
        options.membershipPublicationPlanningSnapshotRefreshTimeoutMs,
      ) &&
      options.membershipPublicationPlanningSnapshotRefreshTimeoutMs > NUM.ZERO
        ? Math.floor(
            options.membershipPublicationPlanningSnapshotRefreshTimeoutMs,
          )
        : MEMBERSHIP_PUBLICATION_PLANNING.REFRESH_TIMEOUT_MS;
    this.membershipPublicationPlanningActiveStaleGraceMs =
      Number.isFinite(
        options.membershipPublicationPlanningActiveStaleGraceMs,
      ) && options.membershipPublicationPlanningActiveStaleGraceMs > NUM.ZERO
        ? Math.floor(options.membershipPublicationPlanningActiveStaleGraceMs)
        : MEMBERSHIP_PUBLICATION_PLANNING.ACTIVE_STALE_GRACE_MS;
    this.membershipPublicationReadOptions = Object.freeze({
      ...MEMBERSHIP_PUBLICATION_READ_OPTIONS,
      queryTimeoutMs: this.membershipPublicationDiagnosticsQueryTimeoutMs,
    });
    this.setTimeoutFn =
      typeof options.setTimeoutFn === TYPEOF.FUNCTION
        ? options.setTimeoutFn
        : setTimeout;
    this.clearTimeoutFn =
      typeof options.clearTimeoutFn === TYPEOF.FUNCTION
        ? options.clearTimeoutFn
        : clearTimeout;
    this.loggedMissingStorageAccountingOwner = false;
    this.loggedMissingPublicationOwner = false;
    this.readinessTransitionHistoryLimit =
      Number.isInteger(options.readinessTransitionHistoryLimit) &&
      options.readinessTransitionHistoryLimit > NUM.ZERO
        ? Math.floor(options.readinessTransitionHistoryLimit)
        : READINESS_TRANSITION_HISTORY_LIMIT;
    this.readinessTransitionHistoryByNodeId = new Map();
    this.lastReadinessEvaluationByNodeId = new Map();
    this.lastReadinessSnapshotByNodeId = new Map();
    this.lastReadinessSnapshotAtMsByNodeId = new Map();
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId = new Map();
    this.lastActivePriorityRecoveryPlanningSnapshotByNodeId = new Map();
    this.lastActivePriorityRecoveryPlanningSnapshotAtMsByNodeId = new Map();
    this.recoveryEpochHistoryLimit =
      Number.isInteger(options.recoveryEpochHistoryLimit) &&
      options.recoveryEpochHistoryLimit > NUM.ZERO
        ? Math.floor(options.recoveryEpochHistoryLimit)
        : RECOVERY_EPOCH_HISTORY_LIMIT;
    this.recoveryEpochEventLimit =
      Number.isInteger(options.recoveryEpochEventLimit) &&
      options.recoveryEpochEventLimit > NUM.ZERO
        ? Math.floor(options.recoveryEpochEventLimit)
        : RECOVERY_EPOCH_EVENT_LIMIT;
    this.currentRecoveryEpochByNodeId = new Map();
    this.recoveryEpochHistoryByNodeId = new Map();
    this.authoritativeControlPlaneView =
      options.authoritativeControlPlaneView || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      (this.cdcIntegrationService || this.systemTableCache || this.messageRouter
        ? createControlPlaneRuntimeBundle({
            nodeId: this.nodeId,
            cdcIntegrationService: this.cdcIntegrationService,
            systemTableCache: this.systemTableCache,
            messageRouter: this.messageRouter,
            now: options.now,
          }).controlPlaneSystemTableGateway
        : null);
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
        name: "control-plane-readiness-evaluation",
        workflowCoordinator: this.readinessOperationWorkflowCoordinator,
      });
    this.cacheChangeListener = null;
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized()
      ? loggingService.forSubsystem(CONTROL_PLANE_READINESS_SUBSYSTEM)
      : console;
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
    const level = this.strictOwnerDependencies ? "error" : "warn";
    const logFn =
      typeof this.logger?.[level] === TYPEOF.FUNCTION
        ? this.logger[level].bind(this.logger)
        : null;
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
    const systemTableCacheProvided = Object.hasOwn(options, "systemTableCache");
    const cacheMutationTargetProvided = Object.hasOwn(
      options,
      "cacheMutationTarget",
    );

    if (systemTableCacheProvided) {
      this.systemTableCache = options.systemTableCache || null;
    }
    if (cacheMutationTargetProvided) {
      this.cacheMutationTarget = options.cacheMutationTarget || null;
    } else if (systemTableCacheProvided) {
      this.cacheMutationTarget = this.systemTableCache;
    }
    if (Object.hasOwn(options, "messageRouter")) {
      this.messageRouter = options.messageRouter || null;
    }
    if (Object.hasOwn(options, "cdcIntegrationService")) {
      this.cdcIntegrationService = options.cdcIntegrationService || null;
    }
    if (Object.hasOwn(options, "storageAccountingService")) {
      this.storageAccountingService = options.storageAccountingService || null;
    }
    if (Object.hasOwn(options, "cdcGroupPropagationService")) {
      this.cdcGroupPropagationService =
        options.cdcGroupPropagationService || null;
    }
    if (Object.hasOwn(options, "membershipPublicationService")) {
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
      this.subscribeToCacheChanges();
    }
  }

  /**
   * Build readiness for every known node.
   * @return {Promise<Object[]>}
   */
  async getAllNodeReadiness(options = {}) {
    const nodeRows = await this.readNodeRows(options);
    const serviceRows = await this.readAllNodeServiceRows(options);
    const bulkNodeRowsAreAuthoritative =
      options.allowAuthoritativeRefresh === true &&
      this.nodesOwner &&
      typeof this.nodesOwner.listNodes === TYPEOF.FUNCTION;
    const bulkServiceRowsAreAuthoritative =
      options.allowAuthoritativeRefresh === true &&
      this.servicesOwner &&
      typeof this.servicesOwner.listServices === TYPEOF.FUNCTION;
    const nodeIds = new Set();
    for (const nodeRow of nodeRows) {
      const nodeId = nodeRow?.[COLUMN.NODE_ID] || null;
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    if (
      serviceRows.length > NUM.ZERO ||
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION
    ) {
      const nodeEndpointRows =
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [];
      for (const serviceRow of serviceRows) {
        const nodeId = serviceRow?.[COLUMN.NODE_ID] || null;
        if (nodeId) {
          nodeIds.add(nodeId);
        }
      }
      for (const endpointRow of nodeEndpointRows) {
        const nodeId = endpointRow?.[COLUMN.NODE_ID] || null;
        if (nodeId) {
          nodeIds.add(nodeId);
        }
      }
    }
    for (const nodeId of this.lastReadinessSnapshotByNodeId.keys()) {
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    const readiness = [];

    for (const nodeId of [...nodeIds].sort()) {
      readiness.push(
        await this.getNodeReadiness(nodeId, {
          ...options,
          allNodeRows: bulkNodeRowsAreAuthoritative ? nodeRows : null,
          allServiceRows: bulkServiceRowsAreAuthoritative ? serviceRows : null,
        }),
      );
    }

    return readiness;
  }

  getAllNodeReadinessSync(options = {}) {
    const nodeRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION
        ? this.systemTableCache.getAll(TABLES.NODES) || []
        : [];
    const serviceRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION
        ? this.systemTableCache.getAll(TABLES.SERVICES) || []
        : [];
    const nodeEndpointRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION
        ? this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || []
        : [];
    const nodeIds = new Set();
    for (const nodeRow of nodeRows) {
      const nodeId = nodeRow?.[COLUMN.NODE_ID] || null;
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    for (const serviceRow of serviceRows) {
      const nodeId = serviceRow?.[COLUMN.NODE_ID] || null;
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    for (const endpointRow of nodeEndpointRows) {
      const nodeId = endpointRow?.[COLUMN.NODE_ID] || null;
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    for (const nodeId of this.lastReadinessSnapshotByNodeId.keys()) {
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    const maxCachedAgeMs = normalizePositiveInteger(
      options.maxCachedAgeMs,
      this.clusterMemberStaleHeartbeatMaxAgeMs,
    );
    const readiness = [];
    for (const nodeId of [...nodeIds].sort()) {
      const cachedSnapshot = this.getCachedReadinessSnapshot(
        nodeId,
        maxCachedAgeMs,
        {
          ...options,
          allowStaleOnCacheChange: true,
        },
      );
      if (cachedSnapshot) {
        readiness.push(cachedSnapshot);
        continue;
      }
      const storedSnapshot = this.getFresherStoredReadinessSnapshot(
        nodeId,
        this.getNodeRow(nodeId),
        null,
        null,
      );
      if (storedSnapshot) {
        readiness.push(storedSnapshot);
      }
    }
    return readiness;
  }

  /**
   * Build readiness for one node.
   * @readModel READINESS_NODE_STATE — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_SERVICE_STATE — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_CAPACITY — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async getNodeReadiness(nodeId, options = {}) {
    const maxCachedAgeMs = normalizePositiveInteger(options.maxCachedAgeMs);
    const cachedSnapshot = this.getCachedReadinessSnapshot(
      nodeId,
      maxCachedAgeMs,
      options,
    );
    if (cachedSnapshot) {
      const snapshotInvalidated = this.isReadinessSnapshotInvalidated(nodeId);
      if (
        this.shouldPreferBackgroundRefreshOnIneligible(cachedSnapshot, options)
      ) {
        this.maybeStartBackgroundReadinessRefresh(nodeId, options);
        return cachedSnapshot;
      }
      if (this.shouldBypassCachedSnapshot(cachedSnapshot, options)) {
        // Fall through to a fresh owner-path evaluation when cached readiness
        // is currently ineligible for the requested decision.
      } else if (
        options.allowStaleOnCacheChange === true &&
        snapshotInvalidated
      ) {
        this.maybeStartBackgroundReadinessRefresh(nodeId, options);
        return cachedSnapshot;
      } else {
        return cachedSnapshot;
      }
    }

    const evaluationKey = this.buildReadinessEvaluationKey(nodeId, options);
    return this.readinessEvaluationLane.run(
      { ownerKey: evaluationKey },
      async () => this.evaluateNodeReadiness(nodeId, options),
    );
  }

  /**
   * Build readiness for one node without consulting the short-lived snapshot
   * cache. Callers that need hot-path deduplication should use
   * `getNodeReadiness`.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Promise<Object>}
   * @private
   */
  async evaluateNodeReadiness(nodeId, options = {}) {
    const observedAt = normalizeIsoTimestamp(this.now());
    const publication = this.getPublicationDiagnostics(observedAt);
    const membershipPublication =
      await this.getMembershipPublicationDiagnostics(nodeId, observedAt);
    const persistSnapshot = this.shouldPersistReadinessSnapshot(options);
    const membershipPublicationPlanningSnapshot =
      await this.resolveNodeMembershipPublicationPlanningAnswer(
        nodeId,
        observedAt,
        membershipPublication,
        options,
      );
    let nodeRow = await this.readNodeRow(nodeId, options);
    let serviceRows = await this.readNodeServiceRows(nodeId, options);

    if (options.allowAuthoritativeRefresh === true) {
      const repaired =
        await this.authoritativeNodeEvidenceReconciler.maybeRepairNodeEvidence(
          {
            nodeId,
            nodeRow,
            serviceRows,
          },
          options,
        );
      if (repaired) {
        nodeRow = await this.readNodeRow(nodeId, options);
        serviceRows = await this.readNodeServiceRows(nodeId, options);
      }
    }

    const lifecycleState = nodeRow
      ? this.getLifecycleState(nodeId, nodeRow)
      : this.getLifecycleState(nodeId, null);
    const nodeEvidence = nodeRow
      ? this.buildNodeEvidence(nodeId, nodeRow)
      : this.buildMissingSelfNodeEvidence(nodeId);
    const missingNodeReadiness = nodeRow
      ? null
      : this.resolveMissingNodeReadinessState({
          nodeId,
          lifecycleState,
          serviceRows,
        });

    if (!nodeRow) {
      if (
        missingNodeReadiness?.state ===
        MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE
      ) {
        const capacity = await this.getCapacitySnapshot(nodeId, nodeRow);
        return this.buildEvaluatedNodeReadinessSnapshot({
          nodeId,
          nodeRow,
          nodeEvidence,
          lifecycleState,
          serviceRows,
          capacity,
          publication,
          membershipPublication,
          membershipPublicationPlanningSnapshot,
          missingNodeReadinessState: missingNodeReadiness.state,
          persistSnapshot,
          observedAt,
        });
      }
      const fresherStoredSnapshot = this.getFresherStoredReadinessSnapshot(
        nodeId,
        null,
        publication,
        membershipPublication,
      );
      if (fresherStoredSnapshot) {
        return fresherStoredSnapshot;
      }
      const missingReadiness = this.buildMissingNodeReadiness(
        nodeId,
        observedAt,
        publication,
        membershipPublication,
      );
      const recentTransitions = persistSnapshot
        ? this.recordReadinessTransition({
            nodeId,
            observedAt,
            publication,
            membershipPublication,
            nodeEvidence: null,
            dimensions: missingReadiness.dimensions,
            reasons: missingReadiness.reasons,
            runtimeAuthority: missingReadiness.runtimeAuthority,
            priorityControlPlaneRecovery:
              missingReadiness.priorityControlPlaneRecovery,
          })
        : this.getReadinessTransitionHistory(nodeId);
      const snapshot = Object.freeze({
        ...missingReadiness,
        recentTransitions,
      });
      if (persistSnapshot) {
        this.storeReadinessSnapshot(nodeId, snapshot);
      }
      return snapshot;
    }

    const capacity = await this.getCapacitySnapshot(nodeId, nodeRow);
    return this.buildEvaluatedNodeReadinessSnapshot({
      nodeId,
      nodeRow,
      nodeEvidence,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
      membershipPublication,
      membershipPublicationPlanningSnapshot,
      persistSnapshot,
      observedAt,
    });
  }

  /**
   * Synchronous readiness snapshot for a single node.
   * Computes all dimensions that do not require async capacity lookup.
   * `placementEligible` is conservatively false when capacity is
   * unavailable synchronously, but `serveEligible` remains a pure
   * traffic-admission signal so routing does not fail closed on
   * unavailable placement accounting alone.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Object|null} Frozen readiness snapshot or null.
   */
  getNodeReadinessSync(nodeId, options = {}) {
    const observedAt = normalizeIsoTimestamp(this.now());
    const nodeRow = this.getNodeRow(nodeId);
    const publication = this.getPublicationDiagnostics(observedAt);
    const membershipPublication = this.getMembershipPublicationDiagnosticsSync(
      nodeId,
      observedAt,
    );
    const persistSnapshot = this.shouldPersistReadinessSnapshot(options);
    const membershipPublicationPlanningSnapshot =
      this.resolveNodeMembershipPublicationPlanningAnswerSync(
        nodeId,
        observedAt,
        membershipPublication,
        options,
      );
    const serviceRows = this.getNodeServiceRows(nodeId);
    const lifecycleState = nodeRow
      ? this.getLifecycleState(nodeId, nodeRow)
      : this.getLifecycleState(nodeId, null);
    const nodeEvidence = nodeRow
      ? this.buildNodeEvidence(nodeId, nodeRow)
      : this.buildMissingSelfNodeEvidence(nodeId);
    const missingNodeReadiness = nodeRow
      ? null
      : this.resolveMissingNodeReadinessState({
          nodeId,
          lifecycleState,
          serviceRows,
        });
    const fresherStoredSnapshot = this.getFresherStoredReadinessSnapshot(
      nodeId,
      nodeRow,
      publication,
      membershipPublication,
    );

    if (fresherStoredSnapshot) {
      this.maybeStartBackgroundSyncReadinessRefresh(
        {
          nodeId,
          nodeRow,
          serviceRows,
          snapshot: fresherStoredSnapshot,
        },
        options,
      );
      return fresherStoredSnapshot;
    }

    if (!nodeRow) {
      if (
        missingNodeReadiness?.state ===
        MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE
      ) {
        const capacity = this.getCapacitySnapshotSync(nodeId, nodeRow);
        return this.buildEvaluatedNodeReadinessSnapshot({
          nodeId,
          nodeRow,
          nodeEvidence,
          lifecycleState,
          serviceRows,
          capacity,
          publication,
          membershipPublication,
          membershipPublicationPlanningSnapshot,
          missingNodeReadinessState: missingNodeReadiness.state,
          persistSnapshot,
          observedAt,
        });
      }
      const missingReadiness = this.buildMissingNodeReadiness(
        nodeId,
        observedAt,
        publication,
        membershipPublication,
      );
      const recentTransitions = persistSnapshot
        ? this.recordReadinessTransition({
            nodeId,
            observedAt,
            publication,
            membershipPublication,
            nodeEvidence: null,
            dimensions: missingReadiness.dimensions,
            reasons: missingReadiness.reasons,
            runtimeAuthority: missingReadiness.runtimeAuthority,
            priorityControlPlaneRecovery:
              missingReadiness.priorityControlPlaneRecovery,
          })
        : this.getReadinessTransitionHistory(nodeId);
      const snapshot = Object.freeze({
        ...missingReadiness,
        recentTransitions,
      });
      if (persistSnapshot) {
        this.storeReadinessSnapshot(nodeId, snapshot);
      }
      this.maybeStartBackgroundSyncReadinessRefresh(
        {
          nodeId,
          nodeRow,
          serviceRows,
          snapshot,
        },
        options,
      );
      return snapshot;
    }

    const capacity = this.getCapacitySnapshotSync(nodeId, nodeRow);
    const snapshot = this.buildEvaluatedNodeReadinessSnapshot({
      nodeId,
      nodeRow,
      nodeEvidence,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
      membershipPublication,
      membershipPublicationPlanningSnapshot,
      persistSnapshot,
      observedAt,
    });
    this.maybeStartBackgroundSyncReadinessRefresh(
      {
        nodeId,
        nodeRow,
        serviceRows,
        snapshot,
      },
      options,
    );
    return snapshot;
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
      context?.readiness && typeof context.readiness === TYPEOF.OBJECT
        ? context.readiness
        : null;
    const decisionDimension = resolveParticipationDecisionDimension(
      normalizeControlPlaneParticipationKind(context?.participationKind),
      context?.decisionDimension,
    );
    const decision =
      snapshot?.dimensions && typeof snapshot.dimensions === TYPEOF.OBJECT
        ? evaluateEligibilityDecision(snapshot, decisionDimension)
        : Object.freeze({
            nodeId: context?.nodeId || null,
            decisionDimension,
            eligible: false,
            failedDimensions: Object.freeze([decisionDimension]),
            reasonCodes: Object.freeze([]),
          });
    const summary = compactEligibilitySnapshot(snapshot, decisionDimension);
    const cacheWatermark = this.buildStoredReadinessSnapshotWatermark(snapshot);
    const localQueryTransport = snapshot?.nodeEvidence
      ? Object.freeze({
          state: snapshot.nodeEvidence.localQueryTransportState || null,
          ready:
            typeof snapshot.nodeEvidence.localQueryTransportReady === "boolean"
              ? snapshot.nodeEvidence.localQueryTransportReady
              : null,
          reason: snapshot.nodeEvidence.localQueryTransportReason || null,
          reasonCode:
            snapshot.nodeEvidence.localQueryTransportReasonCode || null,
          errorCode: snapshot.nodeEvidence.localQueryTransportErrorCode || null,
          retryAfterMs: Number.isFinite(
            snapshot.nodeEvidence.localQueryTransportRetryAfterMs,
          )
            ? snapshot.nodeEvidence.localQueryTransportRetryAfterMs
            : null,
        })
      : null;
    const transportState = snapshot?.nodeEvidence
      ? Object.freeze({
          connected: snapshot.nodeEvidence.transportConnected === true,
          rowState: snapshot.nodeEvidence.rowConnectionState || null,
          routerState: snapshot.nodeEvidence.routerConnectionState || null,
          localQueryTransportState:
            snapshot.nodeEvidence.localQueryTransportState || null,
          localQueryTransportReady:
            typeof snapshot.nodeEvidence.localQueryTransportReady === "boolean"
              ? snapshot.nodeEvidence.localQueryTransportReady
              : null,
          localQueryTransportReason:
            snapshot.nodeEvidence.localQueryTransportReason || null,
          localQueryTransportReasonCode:
            snapshot.nodeEvidence.localQueryTransportReasonCode || null,
          localQueryTransportErrorCode:
            snapshot.nodeEvidence.localQueryTransportErrorCode || null,
          localQueryTransportRetryAfterMs: Number.isFinite(
            snapshot.nodeEvidence.localQueryTransportRetryAfterMs,
          )
            ? snapshot.nodeEvidence.localQueryTransportRetryAfterMs
            : null,
        })
      : null;
    const authoritativeRepair = this.getLatestAuthoritativeReadinessRepair(
      context?.nodeId || null,
    );
    const reasonCodes = Array.isArray(decision?.reasonCodes)
      ? decision.reasonCodes
      : Object.freeze([]);
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
        context.tableName.length > NUM.ZERO
          ? context.tableName
          : null,
      partitionId:
        typeof context?.partitionId === TYPEOF.STRING &&
        context.partitionId.length > NUM.ZERO
          ? context.partitionId
          : null,
      participationKind: normalizeControlPlaneParticipationKind(
        context?.participationKind,
      ),
      decisionDimension,
      eligible: decision?.eligible === true,
      decision:
        decision?.eligible === true
          ? CONTROL_PLANE_PARTICIPATION_DECISION.READY
          : deferRetry
            ? CONTROL_PLANE_PARTICIPATION_DECISION.DEFER
            : CONTROL_PLANE_PARTICIPATION_DECISION.BLOCKED,
      reasonCode,
      reasonCodes,
      retryAfterMs:
        Number.isFinite(localQueryTransport?.retryAfterMs) &&
        localQueryTransport.retryAfterMs > NUM.ZERO
          ? localQueryTransport.retryAfterMs
          : null,
      deferRetry,
      localExecutionAllowed,
      errorCode: null,
      error: null,
      cacheWatermark,
      transportState,
      lifecyclePhase:
        typeof snapshot?.lifecycleState === TYPEOF.STRING &&
        snapshot.lifecycleState.length > NUM.ZERO
          ? snapshot.lifecycleState
          : summary?.lifecycleState || null,
      authoritativeRepair,
      localQueryTransport,
      snapshot,
      failedDimensions: Array.isArray(decision?.failedDimensions)
        ? decision.failedDimensions
        : Object.freeze([]),
      summary: summary
        ? Object.freeze({
            decisionDimension: summary.decisionDimension || decisionDimension,
            observedAt: summary.observedAt || null,
            lifecycleState: summary.lifecycleState || null,
            reasonCodes: summary.reasonCodes || Object.freeze([]),
            failedDimensions: Array.isArray(decision?.failedDimensions)
              ? decision.failedDimensions
              : Object.freeze([]),
          })
        : null,
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

export { ControlPlaneReadinessServiceSegment1 };
