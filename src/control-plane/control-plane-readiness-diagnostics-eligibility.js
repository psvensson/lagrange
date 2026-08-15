import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';
import {ControlPlaneReadinessParticipationBase} from './control-plane-readiness-participation-base.js';
import {installControlPlaneReadinessSnapshotStoreMethods} from './control-plane-readiness-snapshot-store.js';
import {
  PRIORITY_RECOVERY_PLANNING_PROJECTION,
} from './control-plane-readiness-constants.js';

const LOCAL_STR_NODE_STATE_REPORTER = 'node_state_reporter';
const LOCAL_STR_ATTEMPT_TIMEOUT = 'attempt_timeout';
const LOCAL_STR_CONTROLPLANEREADINESSSERVICE_MISSING_CDC = 'ControlPlaneReadinessService missing CDC publication owner';
const LOCAL_STR_PUBLICATION_OWNER_UNAVAILABLE = 'publication_owner_unavailable';

const {
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  PROVISIONING_ELIGIBILITY_STATE,
  PUBLICATION_REASON_CONFIG_SAFE_MODE,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  READINESS_ERROR_MSG,
  STATE,
  buildProjectionReadinessContract,
  buildPublicationRecoveryGateSnapshot,
  normalizeDiagnosticTimestampMs,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

const SERVE_ADMISSION_STATE = Object.freeze({
  ADMITTED: 'admitted',
  BLOCKED_RUNTIME: 'blocked_runtime',
});

class ControlPlaneReadinessDiagnosticsEligibility extends ControlPlaneReadinessParticipationBase {
  constructor(options = {}) {
    super(options);
    const originalGetState = this.getPriorityControlPlaneRecoveryState;
    if (typeof originalGetState === 'function') {
      this.getPriorityControlPlaneRecoveryState = function(context = {}) {
        const state = originalGetState.call(this, context);
        if (state && typeof state === 'object') {
          const snapshot =
            this.resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(
              context,
            );
          const active = snapshot ?
            this.isPriorityControlPlaneRecoveryActive(snapshot) :
            false;
          return Object.freeze({
            ...state,
            active: state.active === true && active === true,
          });
        }
        return state;
      };
    }
  }

  recordParticipationDecision(participation) {
    if (!participation || !this.participationDecisionLedger) {
      return;
    }
    this.participationDecisionLedger.append({
      nodeId: participation.nodeId || null,
      tableName: participation.tableName || null,
      partitionId: participation.partitionId || null,
      participationKind: participation.participationKind || null,
      decisionDimension: participation.decisionDimension || null,
      decision: participation.decision || null,
      eligible: participation.eligible === true,
      reasonCode: participation.reasonCode || null,
      reasonCodes: Array.isArray(participation.reasonCodes) ?
        [...participation.reasonCodes] :
        [],
      failedDimensions: Array.isArray(participation.failedDimensions) ?
        [...participation.failedDimensions] :
        [],
      localExecutionAllowed: participation.localExecutionAllowed === true,
      cacheWatermark:
        participation.cacheWatermark &&
        typeof participation.cacheWatermark === 'object' ?
          {...participation.cacheWatermark} :
          null,
      transportState:
        participation.transportState &&
        typeof participation.transportState === 'object' ?
          {...participation.transportState} :
          null,
      authoritativeRepair:
        participation.authoritativeRepair &&
        typeof participation.authoritativeRepair === 'object' ?
          {...participation.authoritativeRepair} :
          null,
      lifecyclePhase: participation.lifecyclePhase || null,
      lifecycleState: participation.summary?.lifecycleState || null,
      observedAt: participation.summary?.observedAt || null,
      projectionReadinessState:
        participation.summary?.projectionReadinessState || null,
    });
  }

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getParticipationDecisionLedgerEntries(options = {}) {
    return this.participationDecisionLedger ?
      this.participationDecisionLedger.getEntries(options) :
      Object.freeze([]);
  }

  /**
   * @param {Object} entry
   * @return {void}
   * @private
   */
  recordAuthoritativeReadinessRepair(entry = {}) {
    this.authoritativeNodeEvidenceReconciler.recordRepair(entry);
  }

  /**
   * @param {string} nodeId
   * @return {Object|null}
   * @private
   */
  getLatestAuthoritativeReadinessRepair(nodeId) {
    return this.authoritativeNodeEvidenceReconciler.getLatestRepair(nodeId);
  }

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getAuthoritativeReadinessRepairLedgerEntries(options = {}) {
    return this.authoritativeNodeEvidenceReconciler.getLedgerEntries(options);
  }

  /**
   * Resolve local heartbeat publication diagnostics when available.
   * @return {Object|null}
   * @private
   */
  getHeartbeatPublicationDiagnostics() {
    if (
      !this.heartbeatService ||
      typeof this.heartbeatService.getHeartbeatPublicationDiagnostics !==
        'function'
    ) {
      return null;
    }
    try {
      const diagnostics =
        this.heartbeatService.getHeartbeatPublicationDiagnostics();
      return diagnostics && typeof diagnostics === 'object' ?
        diagnostics :
        null;
    } catch (_error) {
      return null;
    }
  }

  getHeartbeatPublicationMode() {
    const publicationMode =
      this.heartbeatService?.lastHeartbeatPublicationDecision?.publicationMode;
    return typeof publicationMode === 'string' &&
      publicationMode.length > 0 ?
      publicationMode :
      null;
  }

  /**
   * Treat fresh local node_state_reporter success as self-liveness evidence
   * when the local cache lags the control-plane round-trip for this node.
   * @param {string} nodeId
   * @return {boolean}
   * @private
   */
  hasFreshLocalReporterSuccess(nodeId) {
    if (nodeId !== this.nodeId) {
      return false;
    }

    const diagnostics = this.getHeartbeatPublicationDiagnostics();
    if (!diagnostics || diagnostics.publicationPath !== LOCAL_STR_NODE_STATE_REPORTER) {
      return false;
    }

    const lastSuccessAtMs = normalizeDiagnosticTimestampMs(
      diagnostics.lastSuccessAt,
    );
    if (!Number.isFinite(lastSuccessAtMs)) {
      return false;
    }

    const lastFailureAtMs = normalizeDiagnosticTimestampMs(
      diagnostics.lastFailureAt,
    );
    if (
      Number(diagnostics.consecutiveFailures) > 0 ||
      (Number.isFinite(lastFailureAtMs) && lastFailureAtMs > lastSuccessAtMs)
    ) {
      return this.shouldGraceTimedOutLocalReporterFailure({
        diagnostics,
        lastSuccessAtMs,
        lastFailureAtMs,
      });
    }

    return (
      this.now() - lastSuccessAtMs <= this.clusterMemberStaleHeartbeatMaxAgeMs
    );
  }

  /**
   * Keep self-readiness open through one timed-out reporter attempt when the
   * last canonically visible reporter heartbeat is still fresh. This prevents
   * load-lane self denial while the bounded authoritative repair path is
   * timing out under transient control-plane pressure.
   * @param {Object} context
   * @param {Object} context.diagnostics
   * @param {number} context.lastSuccessAtMs
   * @param {number} context.lastFailureAtMs
   * @return {boolean}
   * @private
   */
  shouldGraceTimedOutLocalReporterFailure(context = {}) {
    const diagnostics = context?.diagnostics || {};
    const lastSuccessAtMs = Number(context?.lastSuccessAtMs);
    const lastFailureAtMs = Number(context?.lastFailureAtMs);
    if (!Number.isFinite(lastSuccessAtMs)) {
      return false;
    }

    if (
      this.now() - lastSuccessAtMs >
      this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs
    ) {
      return false;
    }

    if (
      !Number.isFinite(lastFailureAtMs) ||
      lastFailureAtMs <= lastSuccessAtMs
    ) {
      return false;
    }

    if (String(diagnostics?.lastFailureStage || '') !== LOCAL_STR_ATTEMPT_TIMEOUT) {
      return false;
    }

    return Number(diagnostics?.consecutiveFailures) <= 1;
  }

  /**
   * Resolve publication diagnostics from the canonical publication owner.
   * @param {string} observedAt
   * @return {Object}
   * @private
   */
  getPublicationDiagnostics(observedAt) {
    if (
      this.cdcGroupPropagationService &&
      typeof this.cdcGroupPropagationService.getPublicationModeDiagnostics ===
        'function'
    ) {
      return this.cdcGroupPropagationService.getPublicationModeDiagnostics();
    }

    if (!this.loggedMissingPublicationOwner) {
      this.loggedMissingPublicationOwner = true;
      this.logMissingOwner(
        LOCAL_STR_CONTROLPLANEREADINESSSERVICE_MISSING_CDC,
        CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION,
      );
    }

    if (this.strictOwnerDependencies) {
      throw new Error(READINESS_ERROR_MSG.PUBLICATION_OWNER_REQUIRED);
    }

    return Object.freeze({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
      reasonCode: LOCAL_STR_PUBLICATION_OWNER_UNAVAILABLE,
      enteredAt: observedAt,
      recentTransitions: Object.freeze([]),
    });
  }

  /**
   * Build the runtime serve-admission input from normalized transport, load,
   * and service evidence. Projection readiness owns publication and recovery
   * lane closure after this local runtime input is normalized.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildServeAdmissionSnapshot(context = {}) {
    const runtimeAuthority =
      context?.runtimeAuthority &&
      typeof context.runtimeAuthority === 'object' ?
        context.runtimeAuthority :
        this.buildRuntimeAuthoritySnapshot(context);
    const evidence = Object.freeze({
      repairEligible: runtimeAuthority.repairEligible === true,
      loadReady: context.loadReady === true,
      transportNotExplicitlyNegative:
        context.transportNotExplicitlyNegative === true,
      serveEligibleControlPlaneService:
        context.serveEligibleControlPlaneService === true,
    });
    const runtimeServeEligible =
      evidence.repairEligible &&
      evidence.loadReady &&
      evidence.transportNotExplicitlyNegative &&
      evidence.serveEligibleControlPlaneService;
    const state = runtimeServeEligible ?
      SERVE_ADMISSION_STATE.ADMITTED :
      SERVE_ADMISSION_STATE.BLOCKED_RUNTIME;

    return Object.freeze({
      state,
      eligible: state === SERVE_ADMISSION_STATE.ADMITTED,
      evidence,
      reasonCodes: Object.freeze([]),
    });
  }

  /**
   * Build the readiness dimensions together with the single per-build
   * projection-contract evaluation they derive from. One readiness build
   * performs exactly one runtime serve admission, one priority-recovery
   * projection, and one projection-contract construction; the returned
   * SERVE_ELIGIBLE dimension carries the contract's serve-lane decision
   * while the contract's own runtime serve input stays the runtime
   * admission value (the serve lane is the contract's output, never its
   * own input).
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildDimensionsEvaluation(context) {
    const runtimeAuthority =
      context?.runtimeAuthority &&
      typeof context.runtimeAuthority === 'object' ?
        context.runtimeAuthority :
        this.buildRuntimeAuthoritySnapshot(context);
    const serveEligibleControlPlaneService =
      this.hasServeEligibleControlPlaneService(context.serviceRows);
    const loadReady = this.isLoadReady(context.nodeRow);
    const placementEligible =
      runtimeAuthority.provisioning?.eligible === true &&
      loadReady &&
      this.isCapacityPlacementEligible(context.capacity);
    const serveAdmission = this.buildServeAdmissionSnapshot({
      ...context,
      runtimeAuthority,
      loadReady,
      transportNotExplicitlyNegative:
        this.getNodeTransportState(context.nodeId, context.nodeRow)
          .routerState !== STATE.DISCONNECTED,
      serveEligibleControlPlaneService,
    });
    const baseDimensions = Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]:
        runtimeAuthority.processAlive === true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
        runtimeAuthority.clusterMemberHealthy === true,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]:
        runtimeAuthority.routingReady === true,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: loadReady,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: placementEligible,
      [CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE]:
        runtimeAuthority.provisioning?.eligible === true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
        runtimeAuthority.writeEligible === true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]:
        runtimeAuthority.visibility?.published === true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
        runtimeAuthority.recoveryEligible === true,
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
        runtimeAuthority.publication?.healthy === true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
        runtimeAuthority.repairEligible === true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
        serveAdmission.eligible,
    });
    const priorityControlPlaneRecovery =
      this.getPriorityControlPlaneRecoveryState({
        ...context,
        dimensions: baseDimensions,
        runtimeAuthority,
      });
    const projectionReadinessContract = buildProjectionReadinessContract({
      ...context,
      dimensions: baseDimensions,
      priorityControlPlaneRecovery,
      runtimeAuthority,
      runtimeServeEligible: serveAdmission.eligible,
    });

    return Object.freeze({
      dimensions: Object.freeze({
        ...baseDimensions,
        [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
          projectionReadinessContract.lanes.serve.ready === true,
      }),
      priorityControlPlaneRecovery,
      projectionReadinessContract,
      runtimeAuthority,
      serveAdmission,
    });
  }

  /**
   * Recovery admission is broader than ordinary routed traffic: internal
   * control-plane repair must stay possible while cached lifecycle or lease
   * evidence is still converging, as long as transport and service evidence
   * show a reachable control-plane path. During active priority recovery,
   * degraded `REPAIR_ONLY` publication mode still permits recovery admission so
   * the system can repair its way back to grouped publication; steady-state
   * write eligibility remains closed until metadata publication becomes
   * healthy.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  isControlPlaneRecoveryEligible(context = {}) {
    const membershipPublicationPlanningSnapshot =
      this.resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(
        context,
      );
    const priorityRecoveryActive = this.isPriorityControlPlaneRecoveryActive(
      membershipPublicationPlanningSnapshot,
    );
    if (
      priorityRecoveryActive === true &&
      this.shouldAllowTransportBackedRecoveryGrace(context) === true
    ) {
      return true;
    }
    const publicationSupportsRecovery =
      context.publicationHealthy === true ||
      (priorityRecoveryActive &&
        context.publicationMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY);
    if (
      context.routingReady !== true ||
      publicationSupportsRecovery !== true ||
      (context.controlPlanePublished !== true && !priorityRecoveryActive)
    ) {
      return false;
    }
    if (context.clusterMemberHealthy === true) {
      return (
        context.writableControlPlaneService === true ||
        this.shouldAllowTransportBackedRecoveryGrace(context)
      );
    }
    return this.shouldAllowTransportBackedRecoveryGrace(context);
  }

  isPriorityControlPlaneRecoveryActive(
    membershipPublicationPlanningSnapshot = null,
  ) {
    if (
      !membershipPublicationPlanningSnapshot ||
      typeof membershipPublicationPlanningSnapshot !== 'object'
    ) {
      return false;
    }
    // A branded (unmodified builder-output) projection already derived
    // priorityRecoveryActive from exactly this merge — matrix-proven
    // equivalent — so skip rebuilding a full gate snapshot per call (the
    // measured 10x-per-readiness-build share of the seed's snapshot storm).
    // Hand-merged/retained snapshots lose the non-enumerable brand via
    // spread and keep the re-derive below.
    if (
      membershipPublicationPlanningSnapshot[
        PRIORITY_RECOVERY_PLANNING_PROJECTION
      ] === true
    ) {
      return membershipPublicationPlanningSnapshot
        .priorityRecoveryActive === true;
    }
    const providedPublicationRecoveryGate =
      membershipPublicationPlanningSnapshot.publicationRecoveryGate &&
      typeof membershipPublicationPlanningSnapshot.publicationRecoveryGate ===
        'object' ?
        membershipPublicationPlanningSnapshot.publicationRecoveryGate :
        null;
    const pendingAckEvidenceState =
      membershipPublicationPlanningSnapshot.pendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY ||
      membershipPublicationPlanningSnapshot.pendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST ?
        membershipPublicationPlanningSnapshot.pendingAckEvidenceState :
        Array.isArray(
          membershipPublicationPlanningSnapshot.requiredAckNodeIds,
        ) ?
          PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
            .REQUIRED_ACK_NODE_LIST :
          providedPublicationRecoveryGate?.pendingAckEvidenceState ??
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY;
    const publicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
      ...(providedPublicationRecoveryGate || {}),
      publicationEpoch:
        membershipPublicationPlanningSnapshot.publicationEpoch ??
        providedPublicationRecoveryGate?.publicationEpoch ??
        null,
      publicationStatus:
        membershipPublicationPlanningSnapshot.publicationStatus ??
        membershipPublicationPlanningSnapshot.status ??
        providedPublicationRecoveryGate?.publicationStatus ??
        null,
      publicationObservationState:
        membershipPublicationPlanningSnapshot.publicationObservationState ??
        providedPublicationRecoveryGate?.publicationObservationState ??
        null,
      recoveryProtocolState:
        membershipPublicationPlanningSnapshot.recoveryProtocolState ??
        providedPublicationRecoveryGate?.recoveryProtocolState ??
        null,
      priorityRecoveryReasonCodes:
        Array.isArray(
          membershipPublicationPlanningSnapshot.priorityRecoveryReasonCodes,
        ) ?
          membershipPublicationPlanningSnapshot.priorityRecoveryReasonCodes :
          providedPublicationRecoveryGate?.reasonCodes,
      priorityPartitionSummary:
        membershipPublicationPlanningSnapshot.priorityPartitionSummary ??
        providedPublicationRecoveryGate?.priorityPartitionSummary ??
        null,
      priorityRecoveryClosureWitness:
        membershipPublicationPlanningSnapshot.priorityRecoveryClosureWitness ??
        providedPublicationRecoveryGate?.priorityRecoveryClosureWitness ??
        null,
      requiredAckNodeIds:
        membershipPublicationPlanningSnapshot.requiredAckNodeIds ??
        providedPublicationRecoveryGate?.requiredAckNodeIds ??
        [],
      acknowledgedNodeIds:
        membershipPublicationPlanningSnapshot.acknowledgedNodeIds ??
        providedPublicationRecoveryGate?.acknowledgedNodeIds ??
        [],
      pendingAckNodeIds:
        membershipPublicationPlanningSnapshot.pendingAckNodeIds ??
        providedPublicationRecoveryGate?.pendingAckNodeIds ??
        [],
      pendingAckCount:
        membershipPublicationPlanningSnapshot.pendingAckCount ??
        providedPublicationRecoveryGate?.pendingAckCount ??
        0,
      pendingAckEvidenceState,
      missingPublishedNodeIds:
        membershipPublicationPlanningSnapshot.missingPublishedNodeIds ??
        membershipPublicationPlanningSnapshot
          .missingPublishedRecoveryActiveNodeIds ??
        providedPublicationRecoveryGate?.missingPublishedNodeIds ??
        [],
      publicationExcludesTargetNode:
        typeof membershipPublicationPlanningSnapshot
          .publicationExcludesTargetNode === 'boolean' ?
          membershipPublicationPlanningSnapshot.publicationExcludesTargetNode :
          providedPublicationRecoveryGate?.publicationExcludesTargetNode === true,
    });
    return publicationRecoveryGate.active === true;
  }

  /**
   * Bound recovery-only grace to nodes that still present live transport and
   * active control-plane service evidence, even if lifecycle or lease rows lag.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  shouldAllowTransportBackedRecoveryGrace(context = {}) {
    const nodeEvidence =
      context.nodeEvidence && typeof context.nodeEvidence === 'object' ?
        context.nodeEvidence :
        null;
    const serviceRows = Array.isArray(context.serviceRows) ?
      context.serviceRows :
      [];
    if (nodeEvidence?.transportConnected !== true) {
      return false;
    }
    return (
      this.hasRoutableService(serviceRows) &&
      this.hasRecoveryGraceControlPlaneService(serviceRows)
    );
  }

  resolveProvisioningEligibility(context = {}) {
    const state =
      context.processAlive !== true ?
        PROVISIONING_ELIGIBILITY_STATE.BLOCKED :
        context.repairEligible === true ?
          PROVISIONING_ELIGIBILITY_STATE.STEADY :
          context.controlPlaneRecoveryEligible === true &&
              this.isProvisioningConvergenceGraceActive(context) ?
            PROVISIONING_ELIGIBILITY_STATE.CONVERGENCE_GRACE :
            PROVISIONING_ELIGIBILITY_STATE.BLOCKED;
    return Object.freeze({
      state,
      eligible: state !== PROVISIONING_ELIGIBILITY_STATE.BLOCKED,
    });
  }

  isProvisioningConvergenceGraceActive(context = {}) {
    if (context.priorityRecoveryActive === true) {
      return true;
    }
    return context.controlPlanePublished !== true;
  }

  /**
   * Determine whether metadata publication mode supports control-plane writes.
   * Grouped mode is healthy, and explicit config-safe-mode repair-only remains
   * healthy because it is a canonical direct-fanout mode rather than runtime
   * degradation.
   * @param {Object} publication
   * @return {boolean}
   * @private
   */
  isPublicationHealthy(publication) {
    const currentMode = publication?.currentMode || null;
    if (currentMode === CONTROL_PLANE_PUBLICATION_MODE.GROUPED) {
      return true;
    }
    if (
      currentMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY &&
      publication?.reasonCode === PUBLICATION_REASON_CONFIG_SAFE_MODE
    ) {
      return true;
    }
    return false;
  }

  isControlPlanePublished(membershipPublication) {
    if (
      !membershipPublication ||
      typeof membershipPublication !== 'object'
    ) {
      return true;
    }
    return (
      String(membershipPublication.status || '').toUpperCase() ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
    );
  }

  /**
   * Build structured reasons for non-ready dimensions.
   * @param {Object} context
   * @return {Object[]}
   * @private
   */
}

installControlPlaneReadinessSnapshotStoreMethods(
  ControlPlaneReadinessDiagnosticsEligibility.prototype,
);

export {ControlPlaneReadinessDiagnosticsEligibility};
