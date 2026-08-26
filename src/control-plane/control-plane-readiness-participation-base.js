import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';
import {installControlPlaneReadinessNodeMethods} from './control-plane-readiness-service-node-methods.js';
import {resolveTimeSource} from '../time/time-source.js';
import {ReadinessPlanningSnapshotOwner} from
  './readiness-planning-snapshot-owner.js';

const LOCAL_STR_CONTROL_PLANE_READINESS_EVALUATION = 'control-plane-readiness-evaluation';
const LOCAL_STR_MESSAGEROUTER = 'messageRouter';
const LOCAL_STR_CDCINTEGRATIONSERVICE = 'cdcIntegrationService';
const LOCAL_STR_STORAGEACCOUNTINGSERVICE = 'storageAccountingService';
const LOCAL_STR_CDCGROUPPROPAGATIONSERVICE = 'cdcGroupPropagationService';
const LOCAL_STR_MEMBERSHIPPUBLICATIONSERVICE = 'membershipPublicationService';
const LOCAL_STR_NODELIFECYCLESTATEMACHINE = 'nodeLifecycleStateMachine';
const LOCAL_STR_HEARTBEATSERVICE = 'heartbeatService';
const LOCAL_STR_NODESOWNER = 'nodesOwner';
const LOCAL_STR_SERVICESOWNER = 'servicesOwner';
const LOCAL_STR_CACHEMUTATIONTARGET = 'cacheMutationTarget';
const LOCAL_STR_CONTROLPLANESYSTEMTABLEGATEWAY =
  'controlPlaneSystemTableGateway';
const LOCAL_STR_AUTHORITATIVECONTROLPLANEVIEW =
  'authoritativeControlPlaneView';
const LOCAL_STR_LOCALCLUSTERINCARNATIONFENCEPROVIDER =
  'localClusterIncarnationFenceProvider';
const numberIsFinite = Number.isFinite;
const objectEntries = Object.entries;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;

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
  OperationLane,
  READINESS_DIAGNOSTICS_LEDGER_LIMIT,
  READINESS_TRANSITION_HISTORY_LIMIT,
  RECOVERY_EPOCH_EVENT_LIMIT,
  RECOVERY_EPOCH_HISTORY_LIMIT,
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

function recordChangedReadinessOwnerDependencies(
  readinessPlanningSnapshotOwner,
  service,
  previousOwnerDependencies,
) {
  for (const [ownerName, previousOwner] of objectEntries(
    previousOwnerDependencies,
  )) {
    if (previousOwner === service[ownerName]) {
      continue;
    }
    readinessPlanningSnapshotOwner?.recordOwnerDependencyReplacement(
      ownerName,
    );
  }
}

function syncNullableOwnerDependency(service, options, ownerName) {
  if (objectHasOwn(options, ownerName)) {
    service[ownerName] = options[ownerName] || null;
  }
}

class ControlPlaneReadinessParticipationBase {
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
      numberIsFinite(options.clusterMemberStaleHeartbeatMaxAgeMs) &&
      options.clusterMemberStaleHeartbeatMaxAgeMs > 0 ?
        Math.floor(options.clusterMemberStaleHeartbeatMaxAgeMs) :
        CONTROL_PLANE_READINESS_DEFAULT.CLUSTER_MEMBER_STALE_HEARTBEAT_MAX_AGE_MS;
    this.authoritativeReadinessRepairCooldownMs =
      numberIsFinite(options.authoritativeReadinessRepairCooldownMs) &&
      options.authoritativeReadinessRepairCooldownMs > 0 ?
        Math.floor(options.authoritativeReadinessRepairCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.COOLDOWN_MS;
    this.authoritativeReadinessRepairFailureCooldownMs =
      numberIsFinite(options.authoritativeReadinessRepairFailureCooldownMs) &&
      options.authoritativeReadinessRepairFailureCooldownMs > 0 ?
        Math.floor(options.authoritativeReadinessRepairFailureCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.FAILURE_COOLDOWN_MS;
    this.authoritativeReadinessRepairNoChangeCooldownMs =
      numberIsFinite(options.authoritativeReadinessRepairNoChangeCooldownMs) &&
      options.authoritativeReadinessRepairNoChangeCooldownMs > 0 ?
        Math.floor(options.authoritativeReadinessRepairNoChangeCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.NO_CHANGE_COOLDOWN_MS;
    this.authoritativeReadinessRepairQueryTimeoutMs =
      numberIsFinite(options.authoritativeReadinessRepairQueryTimeoutMs) &&
      options.authoritativeReadinessRepairQueryTimeoutMs > 0 ?
        Math.floor(options.authoritativeReadinessRepairQueryTimeoutMs) :
        AUTHORITATIVE_READINESS_REPAIR.QUERY_TIMEOUT_MS;
    this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs =
      numberIsFinite(
        options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
      ) && options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs > 0 ?
        Math.floor(options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs) :
        AUTHORITATIVE_READINESS_REPAIR.STALE_HEARTBEAT_MAX_AGE_MS;
    this.membershipPublicationDiagnosticsQueryTimeoutMs =
      numberIsFinite(options.membershipPublicationDiagnosticsQueryTimeoutMs) &&
      options.membershipPublicationDiagnosticsQueryTimeoutMs > 0 ?
        Math.floor(options.membershipPublicationDiagnosticsQueryTimeoutMs) :
        CONTROL_PLANE_READINESS_DEFAULT.MEMBERSHIP_PUBLICATION_DIAGNOSTICS_QUERY_TIMEOUT_MS;
    this.membershipPublicationPlanningSnapshotRefreshTimeoutMs =
      numberIsFinite(
        options.membershipPublicationPlanningSnapshotRefreshTimeoutMs,
      ) &&
      options.membershipPublicationPlanningSnapshotRefreshTimeoutMs > 0 ?
        Math.floor(
          options.membershipPublicationPlanningSnapshotRefreshTimeoutMs,
        ) :
        MEMBERSHIP_PUBLICATION_PLANNING.REFRESH_TIMEOUT_MS;
    this.membershipPublicationPlanningActiveStaleGraceMs =
      numberIsFinite(
        options.membershipPublicationPlanningActiveStaleGraceMs,
      ) && options.membershipPublicationPlanningActiveStaleGraceMs > 0 ?
        Math.floor(options.membershipPublicationPlanningActiveStaleGraceMs) :
        MEMBERSHIP_PUBLICATION_PLANNING.ACTIVE_STALE_GRACE_MS;
    this.membershipPublicationReadOptions = objectFreeze({
      ...MEMBERSHIP_PUBLICATION_READ_OPTIONS,
      queryTimeoutMs: this.membershipPublicationDiagnosticsQueryTimeoutMs,
    });
    // DT4 seam: one TimeSource backs this subsystem's clock + timers. The default
    // is a RealTimeSource that delegates to the platform globals, so behavior is
    // byte-for-byte unchanged; the convergence harness can pass a VirtualTimeSource
    // to drive readiness deterministically. Explicit per-fn options keep precedence
    // so existing callers/tests are untouched.
    this.timeSource = resolveTimeSource(options);
    this.setTimeoutFn =
      typeof options.setTimeoutFn === 'function' ?
        options.setTimeoutFn :
        (fn, ms, ...args) => this.timeSource.setTimeout(fn, ms, ...args);
    this.clearTimeoutFn =
      typeof options.clearTimeoutFn === 'function' ?
        options.clearTimeoutFn :
        (handle) => this.timeSource.clearTimeout(handle);
    this.loggedMissingStorageAccountingOwner = false;
    this.loggedMissingPublicationOwner = false;
    this.readinessTransitionHistoryLimit =
      Number.isInteger(options.readinessTransitionHistoryLimit) &&
      options.readinessTransitionHistoryLimit > 0 ?
        Math.floor(options.readinessTransitionHistoryLimit) :
        READINESS_TRANSITION_HISTORY_LIMIT;
    this.readinessTransitionHistoryByNodeId = new Map();
    this.readinessTransitionHistoryViewByNodeId = new Map();
    this.lastReadinessEvaluationByNodeId = new Map();
    this.lastReadinessSnapshotByNodeId = new Map();
    this.lastReadinessSnapshotAtMsByNodeId = new Map();
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId = new Map();
    this.lastReadinessSnapshotClusterInvalidatedAtMs = 0;
    this.lastReadinessSnapshotServicesVersionByNodeId = new Map();
    // Priority summaries depend on cluster-wide topology, not one node's rows.
    this.membershipPublicationPlanningSourceRevision = 0;
    this.membershipPublicationDiagnosticsMemo = null;
    this.lastActivePriorityRecoveryPlanningSnapshotByNodeId = new Map();
    this.lastActivePriorityRecoveryPlanningSnapshotAtMsByNodeId = new Map();
    // CL-033: per-publisher-node memo of the priority-recovery planning
    // projection (deep cluster read + parse/clone-heavy projection), validated
    // by the existing readiness invalidation markers — see
    // resolveMemoizedPriorityRecoveryPlanningProjectionSync.
    this.priorityRecoveryPlanningProjectionMemoByNodeId = new Map();
    // CL-034: per-publisher-node memo of the membership-publication planning
    // SNAPSHOT MERGE (resolveMembershipPublicationPlanningSnapshot) — the residual
    // readiness-build cost CL-033's projection memo did not cover, validated by the
    // SAME invalidation markers — see
    // resolveMemoizedMembershipPublicationPlanningSnapshotSync.
    this.membershipPublicationPlanningSnapshotMemoByNodeId = new Map();
    // CL-034 follow-up: WITHIN-BUILD memo of the SAME merge for the readiness-build
    // sub-builders (getPriorityControlPlaneRecoveryState ×2, buildRuntimeAuthority
    // Snapshot, isControlPlaneRecoveryEligible, buildPriorityControlPlaneRecovery
    // Projection), which all re-run resolveMembershipPublicationPlanningSnapshot(context)
    // with the SAME already-resolved planning snapshot threaded through context. Keyed
    // by that providedPlanningSnapshot OBJECT REFERENCE (a fresh per-build object), so it
    // collapses the ~6 redundant within-build merges into one yet can NEVER serve a
    // different logical input (a different context carries a different snapshot object =
    // a different key). Cross-build freshness is enforced inside the wrapper by gating
    // the hit on membershipPublication reference identity (a RETAINED snapshot object
    // re-presented after the publication advances misses and recomputes), so the WeakMap
    // needs no explicit clear. See
    // resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync.
    this.membershipPublicationPlanningSnapshotContextMemo = new WeakMap();
    // Observer-local stale-negative rescue windows used only by the
    // provisioning trust view. A stable evidence key prevents a continuously
    // connected socket from renewing grace forever.
    this.provisioningTrustGraceByNodeId = new Map();
    this.recoveryEpochHistoryLimit =
      Number.isInteger(options.recoveryEpochHistoryLimit) &&
      options.recoveryEpochHistoryLimit > 0 ?
        Math.floor(options.recoveryEpochHistoryLimit) :
        RECOVERY_EPOCH_HISTORY_LIMIT;
    this.recoveryEpochEventLimit =
      Number.isInteger(options.recoveryEpochEventLimit) &&
      options.recoveryEpochEventLimit > 0 ?
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
      typeof options.getLocalClusterIncarnationFence === 'function' ?
        options.getLocalClusterIncarnationFence :
        null;
    this.now =
      typeof options.now === 'function' ?
        options.now :
        () => this.timeSource.now();
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
        name: LOCAL_STR_CONTROL_PLANE_READINESS_EVALUATION,
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
    this.readinessPlanningSnapshotOwner =
      options.readinessPlanningSnapshotOwner ||
      new ReadinessPlanningSnapshotOwner({
        service: this,
        now: this.now,
        scheduleDrainFn: options.readinessPlanningScheduleDrainFn,
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
      typeof this.logger?.[level] === 'function' ?
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
    const previousOwnerDependencies = {
      nodesOwner: this.nodesOwner,
      servicesOwner: this.servicesOwner,
      messageRouter: this.messageRouter,
      nodeLifecycleStateMachine: this.nodeLifecycleStateMachine,
      storageAccountingService: this.storageAccountingService,
      cdcIntegrationService: this.cdcIntegrationService,
      cacheMutationTarget: this.cacheMutationTarget,
      cdcGroupPropagationService: this.cdcGroupPropagationService,
      heartbeatService: this.heartbeatService,
      controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
      authoritativeControlPlaneView: this.authoritativeControlPlaneView,
      localClusterIncarnationFenceProvider:
        this.localClusterIncarnationFenceProvider,
    };
    const systemTableCacheProvided = objectHasOwn(options, 'systemTableCache');
    const cacheMutationTargetProvided = objectHasOwn(
      options,
      LOCAL_STR_CACHEMUTATIONTARGET,
    );

    if (systemTableCacheProvided) {
      this.systemTableCache = options.systemTableCache || null;
    }
    if (cacheMutationTargetProvided) {
      this.cacheMutationTarget = options[LOCAL_STR_CACHEMUTATIONTARGET] || null;
    } else if (systemTableCacheProvided) {
      this.cacheMutationTarget = this.systemTableCache;
    }
    const nullableOwnerDependencies = [
      LOCAL_STR_MESSAGEROUTER,
      LOCAL_STR_NODELIFECYCLESTATEMACHINE,
      LOCAL_STR_CDCINTEGRATIONSERVICE,
      LOCAL_STR_STORAGEACCOUNTINGSERVICE,
      LOCAL_STR_CDCGROUPPROPAGATIONSERVICE,
      LOCAL_STR_HEARTBEATSERVICE,
      LOCAL_STR_NODESOWNER,
      LOCAL_STR_SERVICESOWNER,
      LOCAL_STR_CONTROLPLANESYSTEMTABLEGATEWAY,
      LOCAL_STR_AUTHORITATIVECONTROLPLANEVIEW,
      LOCAL_STR_LOCALCLUSTERINCARNATIONFENCEPROVIDER,
    ];
    for (const ownerName of nullableOwnerDependencies) {
      syncNullableOwnerDependency(this, options, ownerName);
    }
    if (objectHasOwn(options, LOCAL_STR_MEMBERSHIPPUBLICATIONSERVICE)) {
      const previousMembershipPublicationService =
        this.membershipPublicationService;
      if (
        this.membershipPublicationService !==
        (options.membershipPublicationService || null)
      ) {
        this.membershipPublicationDiagnosticsMemo = null;
        // CL-033/CL-034: the planning projection and snapshot merge derive from
        // this service's reads.
        this.priorityRecoveryPlanningProjectionMemoByNodeId?.clear();
        this.membershipPublicationPlanningSnapshotMemoByNodeId?.clear();
        this.membershipPlanningSnapshotSyncMemoByPublisher?.clear();
        this.membershipPlanningSnapshotAsyncMemoByPublisher?.clear();
        // membershipPublicationPlanningSnapshotContextMemo is a WeakMap keyed by
        // per-build snapshot objects — it needs no explicit clear (entries GC with
        // their build).
      }
      this.membershipPublicationService =
        options.membershipPublicationService || null;
      if (
        previousMembershipPublicationService !==
        this.membershipPublicationService
      ) {
        this.readinessPlanningSnapshotOwner
          ?.recordMembershipOwnerReplacement();
      }
    }
    if (
      this.authoritativeControlPlaneView &&
      typeof this.authoritativeControlPlaneView.syncOwnerDependencies ===
        'function'
    ) {
      this.authoritativeControlPlaneView.syncOwnerDependencies({
        cdcIntegrationService: this.cdcIntegrationService,
        messageRouter: this.messageRouter,
      });
    }
    if (
      this.authoritativeNodeEvidenceReconciler &&
      typeof this.authoritativeNodeEvidenceReconciler.syncOwnerDependencies ===
        'function'
    ) {
      this.authoritativeNodeEvidenceReconciler.syncOwnerDependencies({
        cdcIntegrationService: this.cdcIntegrationService,
        cacheMutationTarget: this.cacheMutationTarget,
        systemTableCache: this.systemTableCache,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
      });
    }

    if (
      systemTableCacheProvided &&
      previousSystemTableCache !== this.systemTableCache
    ) {
      if (
        this.cacheChangeListener &&
        typeof previousSystemTableCache?.offCacheChange === 'function'
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
      this.lastReadinessSnapshotClusterInvalidatedAtMs = 0;
      this.membershipPublicationPlanningSourceRevision += 1;
      this.membershipPublicationDiagnosticsMemo = null;
      this.priorityRecoveryPlanningProjectionMemoByNodeId?.clear();
      this.membershipPublicationPlanningSnapshotMemoByNodeId?.clear();
      this.membershipPlanningSnapshotSyncMemoByPublisher?.clear();
      this.membershipPlanningSnapshotAsyncMemoByPublisher?.clear();
      this.subscribeToCacheChanges();
      this.readinessPlanningSnapshotOwner?.recordCacheReplacement();
    }
    recordChangedReadinessOwnerDependencies(
      this.readinessPlanningSnapshotOwner,
      this,
      previousOwnerDependencies,
    );
  }

  getReadinessPlanningDiagnostics() {
    return this.readinessPlanningSnapshotOwner?.getDiagnostics() || null;
  }

  subscribeReadinessPlanningSnapshots(listener) {
    return this.readinessPlanningSnapshotOwner?.subscribe(listener) ||
      (() => {});
  }

  recordReadinessPlanningSnapshotChange(nodeId) {
    this.readinessPlanningSnapshotOwner?.recordReadinessSnapshotChange(nodeId);
  }

  recordReadinessPlanningRecoveryEpochChange(nodeId) {
    this.readinessPlanningSnapshotOwner?.recordRecoveryEpochChange(nodeId);
  }

  shutdownReadinessPlanningOwner() {
    this.readinessPlanningSnapshotOwner?.shutdown();
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
      context?.readiness && typeof context.readiness === 'object' ?
        context.readiness :
        null;
    const decisionDimension = resolveParticipationDecisionDimension(
      normalizeControlPlaneParticipationKind(context?.participationKind),
      context?.decisionDimension,
    );
    const decision =
      snapshot?.dimensions && typeof snapshot.dimensions === 'object' ?
        evaluateEligibilityDecision(snapshot, decisionDimension) :
        objectFreeze({
          nodeId: context?.nodeId || null,
          decisionDimension,
          eligible: false,
          failedDimensions: objectFreeze([decisionDimension]),
          reasonCodes: objectFreeze([]),
        });
    const compactSummary = compactEligibilitySnapshot(
      snapshot,
      decisionDimension,
    );
    const summary = compactSummary ?
      objectFreeze({
        ...compactSummary,
        ...(snapshot?.projectionReadinessContract &&
          typeof snapshot.projectionReadinessContract === 'object' ?
          {
            projectionReadinessContract:
              snapshot.projectionReadinessContract,
          } :
          {}),
      }) :
      null;
    const cacheWatermark = this.buildStoredReadinessSnapshotWatermark(snapshot);
    const localQueryTransport = snapshot?.nodeEvidence ?
      objectFreeze({
        state: snapshot.nodeEvidence.localQueryTransportState || null,
        ready:
            typeof snapshot.nodeEvidence.localQueryTransportReady === 'boolean' ?
              snapshot.nodeEvidence.localQueryTransportReady :
              null,
        reason: snapshot.nodeEvidence.localQueryTransportReason || null,
        reasonCode:
            snapshot.nodeEvidence.localQueryTransportReasonCode || null,
        errorCode: snapshot.nodeEvidence.localQueryTransportErrorCode || null,
        retryAfterMs: numberIsFinite(
          snapshot.nodeEvidence.localQueryTransportRetryAfterMs,
        ) ?
          snapshot.nodeEvidence.localQueryTransportRetryAfterMs :
          null,
      }) :
      null;
    const transportState = snapshot?.nodeEvidence ?
      objectFreeze({
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
        localQueryTransportRetryAfterMs: numberIsFinite(
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
      objectFreeze([]);
    const localExecutionAllowed = shouldAllowLocalExecutionForParticipation({
      localNodeId: this.nodeId,
      targetNodeId: context?.nodeId || null,
      participationKind: normalizeControlPlaneParticipationKind(
        context?.participationKind,
      ),
      localQueryTransport,
    });
    const reasonCode =
      reasonCodes.length > 0 ? reasonCodes[0] : null;
    const deferRetry =
      reasonCode ===
        CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY &&
      numberIsFinite(localQueryTransport?.retryAfterMs) &&
      localQueryTransport.retryAfterMs > 0;
    const participation = {
      nodeId: context?.nodeId || null,
      tableName:
        typeof context?.tableName === 'string' &&
        context.tableName.length > 0 ?
          context.tableName :
          null,
      partitionId:
        typeof context?.partitionId === 'string' &&
        context.partitionId.length > 0 ?
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
        numberIsFinite(localQueryTransport?.retryAfterMs) &&
        localQueryTransport.retryAfterMs > 0 ?
          localQueryTransport.retryAfterMs :
          null,
      deferRetry,
      localExecutionAllowed,
      errorCode: null,
      error: null,
      cacheWatermark,
      transportState,
      lifecyclePhase:
        typeof snapshot?.lifecycleState === 'string' &&
        snapshot.lifecycleState.length > 0 ?
          snapshot.lifecycleState :
          summary?.lifecycleState || null,
      authoritativeRepair,
      localQueryTransport,
      snapshot,
      failedDimensions: Array.isArray(decision?.failedDimensions) ?
        decision.failedDimensions :
        objectFreeze([]),
      summary: summary ?
        objectFreeze({
          decisionDimension: summary.decisionDimension || decisionDimension,
          observedAt: summary.observedAt || null,
          lifecycleState: summary.lifecycleState || null,
          reasonCodes: summary.reasonCodes || objectFreeze([]),
          projectionReadinessContract:
            summary.projectionReadinessContract || null,
          projectionReadinessState:
            summary.projectionReadinessContract?.state || null,
          failedDimensions: Array.isArray(decision?.failedDimensions) ?
            decision.failedDimensions :
            objectFreeze([]),
        }) :
        null,
    };

    if (participation.decision !== CONTROL_PLANE_PARTICIPATION_DECISION.READY) {
      participation.errorCode = buildParticipationErrorCode(participation);
      participation.error = buildParticipationErrorMessage(participation);
    }

    const frozenParticipation = objectFreeze(participation);
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
  ControlPlaneReadinessParticipationBase.prototype,
);

export {ControlPlaneReadinessParticipationBase};
