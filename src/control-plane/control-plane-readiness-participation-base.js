import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';
import {
  createNodeLivenessSemanticProjectionOwner,
} from './control-plane-readiness-node-liveness-methods.js';
import {
  resolveWritableCacheMutationTarget,
} from './control-plane-readiness-owner-dependencies.js';
import {resolveTimeSource} from '../time/time-source.js';
import {assertReadinessServiceCollaborators} from './control-plane-readiness-collaborators.js';
import {ReadinessPlanningSnapshotOwner} from './readiness-planning-snapshot-owner.js';
import {FormationReleaseHandoffClosureOwner} from './formation-release-handoff-closure-owner.js';
import {FormationReleaseHandoffPublicationCoordinator} from './formation-release-handoff-publication-coordinator.js';
const LOCAL_STR_CONTROL_PLANE_READINESS_EVALUATION = 'control-plane-readiness-evaluation';
const numberIsFinite = Number.isFinite;
const objectFreeze = Object.freeze;

const {
  AUTHORITATIVE_READINESS_REPAIR, AuthoritativeNodeEvidenceReconciler,
  CONTROL_PLANE_PARTICIPATION_DECISION, CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_REASON, CONTROL_PLANE_READINESS_SUBSYSTEM,
  ControlPlaneDiagnosticsLedger, DurableWorkflowCoordinator, LoggingService,
  MEMBERSHIP_PUBLICATION_PLANNING, MEMBERSHIP_PUBLICATION_READ_OPTIONS,
  OperationLane, READINESS_DIAGNOSTICS_LEDGER_LIMIT,
  READINESS_TRANSITION_HISTORY_LIMIT, RECOVERY_EPOCH_EVENT_LIMIT,
  RECOVERY_EPOCH_HISTORY_LIMIT, buildParticipationErrorCode,
  buildParticipationErrorMessage, compactEligibilitySnapshot,
  createControlPlaneRuntimeBundle, evaluateEligibilityDecision,
  normalizeControlPlaneParticipationKind, normalizePositiveInteger,
  resolveParticipationDecisionDimension, shouldAllowLocalExecutionForParticipation,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

/**
 * The repair cooldowns, query timeouts and publication read options of the
 * readiness service, normalised from its construction options.
 * @param {Object} service - The readiness service being constructed.
 * @param {Object} options - Its construction options.
 * @return {void}
 */
function initializeReadinessTimingOptions(service, options) {
  service.authoritativeReadinessRepairCooldownMs =
    numberIsFinite(options.authoritativeReadinessRepairCooldownMs) &&
    options.authoritativeReadinessRepairCooldownMs > 0 ?
      Math.floor(options.authoritativeReadinessRepairCooldownMs) :
      AUTHORITATIVE_READINESS_REPAIR.COOLDOWN_MS;
  service.authoritativeReadinessRepairFailureCooldownMs =
    numberIsFinite(options.authoritativeReadinessRepairFailureCooldownMs) &&
    options.authoritativeReadinessRepairFailureCooldownMs > 0 ?
      Math.floor(options.authoritativeReadinessRepairFailureCooldownMs) :
      AUTHORITATIVE_READINESS_REPAIR.FAILURE_COOLDOWN_MS;
  service.authoritativeReadinessRepairNoChangeCooldownMs =
    numberIsFinite(options.authoritativeReadinessRepairNoChangeCooldownMs) &&
    options.authoritativeReadinessRepairNoChangeCooldownMs > 0 ?
      Math.floor(options.authoritativeReadinessRepairNoChangeCooldownMs) :
      AUTHORITATIVE_READINESS_REPAIR.NO_CHANGE_COOLDOWN_MS;
  service.authoritativeReadinessRepairQueryTimeoutMs =
    numberIsFinite(options.authoritativeReadinessRepairQueryTimeoutMs) &&
    options.authoritativeReadinessRepairQueryTimeoutMs > 0 ?
      Math.floor(options.authoritativeReadinessRepairQueryTimeoutMs) :
      AUTHORITATIVE_READINESS_REPAIR.QUERY_TIMEOUT_MS;
  service.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs =
    numberIsFinite(
      options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
    ) && options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs > 0 ?
      Math.floor(options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs) :
      AUTHORITATIVE_READINESS_REPAIR.STALE_HEARTBEAT_MAX_AGE_MS;
  service.membershipPublicationDiagnosticsQueryTimeoutMs =
    numberIsFinite(options.membershipPublicationDiagnosticsQueryTimeoutMs) &&
    options.membershipPublicationDiagnosticsQueryTimeoutMs > 0 ?
      Math.floor(options.membershipPublicationDiagnosticsQueryTimeoutMs) :
      CONTROL_PLANE_READINESS_DEFAULT.MEMBERSHIP_PUBLICATION_DIAGNOSTICS_QUERY_TIMEOUT_MS;
  service.membershipPublicationPlanningActiveStaleGraceMs =
    numberIsFinite(
      options.membershipPublicationPlanningActiveStaleGraceMs,
    ) && options.membershipPublicationPlanningActiveStaleGraceMs > 0 ?
      Math.floor(options.membershipPublicationPlanningActiveStaleGraceMs) :
      MEMBERSHIP_PUBLICATION_PLANNING.ACTIVE_STALE_GRACE_MS;
  service.membershipPublicationReadOptions = objectFreeze({
    ...MEMBERSHIP_PUBLICATION_READ_OPTIONS,
    queryTimeoutMs: service.membershipPublicationDiagnosticsQueryTimeoutMs,
  });
}

function initializeControlPlaneReadinessState(service, options = {}) {
  assertReadinessServiceCollaborators(options);
  service.nodeId = options.nodeId;
  const configuredFormationAuthority = options.formationReleaseAuthorityNodeId;
  service.formationReleaseAuthorityNodeId =
    typeof configuredFormationAuthority === 'string' &&
    configuredFormationAuthority.length > 0 ? configuredFormationAuthority :
      service.nodeId;
  service.systemTableCache = options.systemTableCache || null;
  service.nodesOwner = options.nodesOwner || null;
  service.servicesOwner = options.servicesOwner || null;
  service.messageRouter = options.messageRouter || null;
  service.nodeLifecycleStateMachine = options.nodeLifecycleStateMachine || null;
  service.storageAccountingService = options.storageAccountingService || null;
  service.cdcIntegrationService = options.cdcIntegrationService || null;
  service.cacheMutationTarget = resolveWritableCacheMutationTarget(
    options.cacheMutationTarget,
    service.systemTableCache,
    service.cdcIntegrationService,
  );
  service.cdcGroupPropagationService =
    options.cdcGroupPropagationService || null;
  service.heartbeatService = options.heartbeatService || null;
  service.membershipPublicationService =
    options.membershipPublicationService || null;
  service.strictOwnerDependencies = options.strictOwnerDependencies === true;
  service.clusterMemberStaleHeartbeatMaxAgeMs =
    numberIsFinite(options.clusterMemberStaleHeartbeatMaxAgeMs) &&
    options.clusterMemberStaleHeartbeatMaxAgeMs > 0 ?
      Math.floor(options.clusterMemberStaleHeartbeatMaxAgeMs) :
      CONTROL_PLANE_READINESS_DEFAULT.CLUSTER_MEMBER_STALE_HEARTBEAT_MAX_AGE_MS;
  initializeReadinessTimingOptions(service, options);
  // DT4 seam: one TimeSource backs this subsystem's clock + timers. The default
  // is a RealTimeSource that delegates to the platform globals, so behavior is
  // byte-for-byte unchanged; the convergence harness can pass a VirtualTimeSource
  // to drive readiness deterministically. Explicit per-fn options keep precedence
  // so existing callers/tests are untouched.
  service.timeSource = resolveTimeSource(options);
  // The timer and clock options were validated by the collaborator
  // assertion: each is absent or a function.
  service.setTimeoutFn = options.setTimeoutFn ??
    ((fn, ms, ...args) => service.timeSource.setTimeout(fn, ms, ...args));
  service.clearTimeoutFn = options.clearTimeoutFn ??
    ((handle) => service.timeSource.clearTimeout(handle));
  service.loggedMissingStorageAccountingOwner = false;
  service.loggedMissingPublicationOwner = false;
  service.readinessTransitionHistoryLimit =
    Number.isInteger(options.readinessTransitionHistoryLimit) &&
    options.readinessTransitionHistoryLimit > 0 ?
      Math.floor(options.readinessTransitionHistoryLimit) :
      READINESS_TRANSITION_HISTORY_LIMIT;
  service.readinessTransitionHistoryByNodeId = new Map();
  service.readinessTransitionHistoryViewByNodeId = new Map();
  service.lastReadinessEvaluationByNodeId = new Map();
  service.lastReadinessSnapshotByNodeId = new Map();
  service.lastReadinessSnapshotAtMsByNodeId = new Map();
  service.lastReadinessSnapshotInvalidatedAtMsByNodeId = new Map();
  service.lastReadinessSnapshotClusterInvalidatedAtMs = 0;
  service.lastReadinessSnapshotServicesVersionByNodeId = new Map();
  // Priority summaries depend on cluster-wide topology, not one node's rows.
  service.membershipPublicationPlanningSourceRevision = 0;
  service.lastActivePriorityRecoveryPlanningSnapshotByNodeId = new Map();
  service.lastActivePriorityRecoveryPlanningSnapshotAtMsByNodeId = new Map();
  // CL-033: per-publisher-node memo of the priority-recovery planning
  // projection (deep cluster read + parse/clone-heavy projection), validated
  // by the existing readiness invalidation markers — see
  // resolveMemoizedPriorityRecoveryPlanningProjectionSync.
  service.priorityRecoveryPlanningProjectionMemoByNodeId = new Map();
  // CL-034: per-publisher-node memo of the membership-publication planning
  // SNAPSHOT MERGE (resolveMembershipPublicationPlanningSnapshot) — the residual
  // readiness-build cost CL-033's projection memo did not cover, validated by the
  // SAME invalidation markers — see
  // resolveMemoizedMembershipPublicationPlanningSnapshotSync.
  service.membershipPublicationPlanningSnapshotMemoByNodeId = new Map();
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
  service.membershipPublicationPlanningSnapshotContextMemo = new WeakMap();
  // Observer-local stale-negative rescue windows used only by the
  // provisioning trust view. A stable evidence key prevents a continuously
  // connected socket from renewing grace forever.
  service.provisioningTrustGraceByNodeId = new Map();
  service.recoveryEpochHistoryLimit =
    Number.isInteger(options.recoveryEpochHistoryLimit) &&
    options.recoveryEpochHistoryLimit > 0 ?
      Math.floor(options.recoveryEpochHistoryLimit) :
      RECOVERY_EPOCH_HISTORY_LIMIT;
  service.recoveryEpochEventLimit =
    Number.isInteger(options.recoveryEpochEventLimit) &&
    options.recoveryEpochEventLimit > 0 ?
      Math.floor(options.recoveryEpochEventLimit) :
      RECOVERY_EPOCH_EVENT_LIMIT;
  service.currentRecoveryEpochByNodeId = new Map();
  service.recoveryEpochHistoryByNodeId = new Map();
  service.authoritativeControlPlaneView =
    options.authoritativeControlPlaneView || null;
  service.controlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway ||
    (service.cdcIntegrationService || service.systemTableCache || service.messageRouter ?
      createControlPlaneRuntimeBundle({
        nodeId: service.nodeId,
        cdcIntegrationService: service.cdcIntegrationService,
        systemTableCache: service.systemTableCache,
        messageRouter: service.messageRouter,
        now: options.now,
      }).controlPlaneSystemTableGateway :
      null);
  service.localClusterIncarnationFenceProvider =
    options.getLocalClusterIncarnationFence ?? null;
  service.now = options.now ?? (() => service.timeSource.now());
  service.participationDecisionLedger =
    options.participationDecisionLedger ||
    new ControlPlaneDiagnosticsLedger({
      maxEntries: normalizePositiveInteger(
        options.participationDecisionLedgerMaxEntries,
        READINESS_DIAGNOSTICS_LEDGER_LIMIT,
      ),
      now: service.now,
    });
  service.authoritativeReadinessRepairLedger =
    options.authoritativeReadinessRepairLedger ||
    new ControlPlaneDiagnosticsLedger({
      maxEntries: normalizePositiveInteger(
        options.authoritativeReadinessRepairLedgerMaxEntries,
        READINESS_DIAGNOSTICS_LEDGER_LIMIT,
      ),
      now: service.now,
    });
  service.readinessOperationWorkflowCoordinator =
    options.readinessOperationWorkflowCoordinator ||
    new DurableWorkflowCoordinator({
      now: service.now,
    });
  service.readinessEvaluationLane =
    options.readinessEvaluationLane ||
    new OperationLane({
      name: LOCAL_STR_CONTROL_PLANE_READINESS_EVALUATION,
      workflowCoordinator: service.readinessOperationWorkflowCoordinator,
    });
  service.formationReleaseHandoffClosureOwner = options.formationReleaseHandoffClosureOwner ||
    new FormationReleaseHandoffClosureOwner();
  service.cacheChangeListener = null;
  const loggingService = LoggingService.getInstance();
  service.logger = loggingService.isInitialized() ?
    loggingService.forSubsystem(CONTROL_PLANE_READINESS_SUBSYSTEM) :
    console;
  service.formationReleaseHandoffPublicationCoordinator =
    options.formationReleaseHandoffPublicationCoordinator ||
    new FormationReleaseHandoffPublicationCoordinator({
      getStorageOwner: () =>
        service.getFormationReleasePublicationStorageOwner(),
      onDurable: (contract) =>
        service.formationReleaseHandoffClosureOwner.acknowledgePublication(
          contract.generation,
        ),
      onRearm: () =>
        service.recordReadinessPlanningRecoveryEpochChange(),
      logger: service.logger,
    });
  service.nodeLivenessSemanticProjectionOwner =
    createNodeLivenessSemanticProjectionOwner(service, options);
  service.refreshNodeLivenessSourceSubscriptions();
  service.authoritativeNodeEvidenceReconciler =
    options.authoritativeNodeEvidenceReconciler ||
    new AuthoritativeNodeEvidenceReconciler({
      nodeId: service.nodeId,
      now: service.now,
      logger: service.logger,
      cdcIntegrationService: service.cdcIntegrationService,
      cacheMutationTarget: service.cacheMutationTarget,
      systemTableCache: service.systemTableCache,
      controlPlaneSystemTableGateway: service.controlPlaneSystemTableGateway,
      getAuthoritativeControlPlaneView: () =>
        service.getAuthoritativeControlPlaneView(),
      readNodeRow: (nodeId) => service.readNodeRow(nodeId),
      readNodeServiceRows: (nodeId) => service.readNodeServiceRows(nodeId),
      resolveDecisionDimension: (repairOptions) =>
        service.resolveReadinessDecisionDimension(repairOptions),
      getNodeTransportState: (nodeId, nodeRow) =>
        service.getNodeTransportState(nodeId, nodeRow),
      shouldPreferLocalSelfNodeEvidence: (context) =>
        service.shouldPreferLocalSelfNodeEvidence(context),
      hasFreshLocalReporterSuccess: (nodeId) =>
        service.hasFreshLocalReporterSuccess(nodeId),
      buildNodeEvidence: (nodeId, nodeRow) =>
        service.buildNodeEvidence(nodeId, nodeRow),
      getNodeLivenessProjection: (nodeId) =>
        service.projectNodeLiveness(nodeId, service.now()),
      isClusterMemberHealthy: (nodeId, nodeRow) =>
        service.isClusterMemberHealthy(nodeId, nodeRow),
      hasRoutableService: (serviceRows) =>
        service.hasRoutableService(serviceRows),
      hasWritableControlPlaneService: (serviceRows) =>
        service.hasWritableControlPlaneService(serviceRows),
      workflowCoordinator: service.readinessOperationWorkflowCoordinator,
      authoritativeReadinessRepairLedger:
        options.authoritativeReadinessRepairLedger,
      authoritativeReadinessRepairLedgerMaxEntries:
        options.authoritativeReadinessRepairLedgerMaxEntries,
      authoritativeReadinessRepairLane:
        options.authoritativeReadinessRepairLane,
      authoritativeReadinessRepairCooldownMs:
        service.authoritativeReadinessRepairCooldownMs,
      authoritativeReadinessRepairFailureCooldownMs:
        service.authoritativeReadinessRepairFailureCooldownMs,
      authoritativeReadinessRepairNoChangeCooldownMs:
        service.authoritativeReadinessRepairNoChangeCooldownMs,
      authoritativeReadinessRepairQueryTimeoutMs:
        service.authoritativeReadinessRepairQueryTimeoutMs,
      authoritativeReadinessRepairStaleHeartbeatMaxAgeMs:
        service.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
    });
  service.configureStorageCapacitySemanticProjection();
  service.readinessPlanningSnapshotOwner =
    options.readinessPlanningSnapshotOwner ||
    new ReadinessPlanningSnapshotOwner({
      service: service,
      now: service.now,
      scheduleDrainFn: options.readinessPlanningScheduleDrainFn,
    });
  service.subscribeToCacheChanges();
}
function setFormationReleaseAuthorityNodeId(service, nodeId) {
  if (typeof nodeId === 'string' && nodeId.length > 0) {
    service.formationReleaseAuthorityNodeId = nodeId;
  }
}
/**
 * Log one-time diagnostics for missing readiness owners.
 * In non-strict mode the service degrades intentionally, so warn instead
 * of emitting a hard-error signal.
 * @param {string} message
 * @param {string} owner
 * @private
 */
function logMissingOwner(service, message, owner) {
  // The service's logger is the readiness subsystem logger or the console
  // (set at construction): both have warn and error.
  const level = service.strictOwnerDependencies ? 'error' : 'warn';
  service.logger[level](message, {
    nodeId: service.nodeId,
    owner,
    strictOwnerDependencies: service.strictOwnerDependencies,
  });
}

/**
 * Return one canonical control-plane participation decision for the
 * requested node and work kind.
 * @param {string} nodeId
 * @param {Object} [options={}]
 * @return {Promise<Object>}
 */
async function getControlPlaneParticipation(service, nodeId, options = {}) {
  const participationKind = normalizeControlPlaneParticipationKind(
    options?.participationKind,
  );
  const decisionDimension = resolveParticipationDecisionDimension(
    participationKind,
    options?.decisionDimension,
  );
  const readiness = await service.getNodeReadiness(nodeId, {
    ...options,
    decisionDimension,
  });
  return service.buildControlPlaneParticipation({
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
function getControlPlaneParticipationSync(service, nodeId, options = {}) {
  const participationKind = normalizeControlPlaneParticipationKind(
    options?.participationKind,
  );
  const decisionDimension = resolveParticipationDecisionDimension(
    participationKind,
    options?.decisionDimension,
  );
  const readiness = service.getNodeReadinessSync(nodeId, {
    ...options,
    decisionDimension,
  });
  return service.buildControlPlaneParticipation({
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
function buildControlPlaneParticipation(service, context) {
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
  const cacheWatermark = service.buildStoredReadinessSnapshotWatermark(snapshot);
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
  const authoritativeRepair = service.getLatestAuthoritativeReadinessRepair(
    context?.nodeId || null,
  );
  const reasonCodes = Array.isArray(decision?.reasonCodes) ?
    decision.reasonCodes :
    objectFreeze([]);
  const localExecutionAllowed = shouldAllowLocalExecutionForParticipation({
    localNodeId: service.nodeId,
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
  service.recordParticipationDecision(frozenParticipation);
  return frozenParticipation;
}

/**
 * Persist one bounded participation-decision record for diagnostics.
 * @param {Object|null} participation
 * @return {void}
 * @private
 */

export {
  initializeControlPlaneReadinessState,
  setFormationReleaseAuthorityNodeId,
  logMissingOwner,
  getControlPlaneParticipation,
  getControlPlaneParticipationSync,
  buildControlPlaneParticipation,
};
