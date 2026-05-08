import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';
import {ControlPlaneReadinessServiceSegment2} from './control-plane-readiness-service-segment-2.js';

const LOCAL_STR_BOOLEAN = 'boolean';

const {
  AUTHORITY_DESCRIPTOR_STATE,
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  AuthoritativeControlPlaneView,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  MEMBERSHIP_PUBLICATION_READ_LANE,
  MEMBERSHIP_PUBLICATION_READ_SCOPE,
  MISSING_NODE_READINESS_REASON,
  MISSING_NODE_READINESS_STATE,
  NUM,
  PROVISIONING_ELIGIBILITY_STATE,
  PUBLICATION_REASON_CONFIG_SAFE_MODE,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
  TYPEOF,
  buildControlPlanePublicationStory,
  buildReadinessTransitionOwnerState,
  buildReason,
  createEligibilitySnapshot,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

class ControlPlaneReadinessServiceSegment3 extends ControlPlaneReadinessServiceSegment2 {
  buildReasons(context) {
    const reasons = [];
    const dimensions = context.dimensions;
    const localQueryTransportBlocked = this.isLocalQueryTransportBlockedForNode(
      context.nodeId,
      context.nodeEvidence,
    );

    if (!dimensions.processAlive) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
          CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
          CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE,
          context.observedAt,
        ),
      );
    }
    if (!dimensions.clusterMemberHealthy) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
          CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
          CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE,
          context.observedAt,
          context.nodeEvidence ||
            this.buildNodeEvidence(context.nodeId, context.nodeRow),
        ),
      );
    }
    if (!dimensions.routingReady) {
      if (localQueryTransportBlocked) {
        reasons.push(
          buildReason(
            CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
            CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY,
            CONTROL_PLANE_READINESS_OWNER.MESSAGE_ROUTER,
            context.observedAt,
            {
              localQueryTransportState:
                context.nodeEvidence?.localQueryTransportState || null,
              localQueryTransportReason:
                context.nodeEvidence?.localQueryTransportReason || null,
              localQueryTransportReasonCode:
                context.nodeEvidence?.localQueryTransportReasonCode || null,
              localQueryTransportErrorCode:
                context.nodeEvidence?.localQueryTransportErrorCode || null,
              localQueryTransportRetryAfterMs: Number.isFinite(
                context.nodeEvidence?.localQueryTransportRetryAfterMs,
              ) ?
                context.nodeEvidence.localQueryTransportRetryAfterMs :
                null,
            },
          ),
        );
      } else {
        reasons.push(
          buildReason(
            CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY,
            CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY,
            CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
            context.observedAt,
          ),
        );
      }
    }
    if (!dimensions.loadReady) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON.LOAD_NOT_READY,
          CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY,
          CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
          context.observedAt,
        ),
      );
    }
    if (!dimensions.metadataPublicationHealthy) {
      reasons.push(
        buildReason(
          context.publication.currentMode ===
            CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY ?
            CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY :
            CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED,
          CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
          CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION,
          context.observedAt,
        ),
      );
    }
    if (!dimensions.controlPlaneWritable) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
          CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
          context.observedAt,
        ),
      );
    }
    if (!dimensions.controlPlanePublished) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING,
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED,
          CONTROL_PLANE_READINESS_OWNER.MEMBERSHIP_PUBLICATION,
          context.observedAt,
          context.membershipPublication || null,
        ),
      );
    }
    if (
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== true &&
      context.priorityControlPlaneRecovery?.active === true
    ) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON
            .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
          CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
          CONTROL_PLANE_READINESS_OWNER.MEMBERSHIP_PUBLICATION,
          context.observedAt,
          context.priorityControlPlaneRecovery,
        ),
      );
    }
    if (!this.isCapacityPlacementEligible(context.capacity)) {
      const code = this.getCapacityReasonCode(context.capacity);
      if (code) {
        reasons.push(
          buildReason(
            code,
            CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE,
            CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
            context.observedAt,
          ),
        );
      }
    }

    return Object.freeze(reasons);
  }

  /**
   * Return whether one node remains eligible for routed control-plane reads
   * given locally observable query/data-plane transport evidence.
   * Only the self node has direct local transport evidence.
   * @param {string} nodeId
   * @param {Object|null} nodeEvidence
   * @return {boolean}
   * @private
   */
  isLocalQueryTransportRoutableForNode(nodeId, nodeEvidence = null) {
    if (nodeId !== this.nodeId) {
      return true;
    }
    return nodeEvidence?.localQueryTransportReady !== false;
  }

  /**
   * Return true when one node's routed-read eligibility is blocked by the
   * canonical local query/data-plane transport owner.
   * @param {string} nodeId
   * @param {Object|null} nodeEvidence
   * @return {boolean}
   * @private
   */
  isLocalQueryTransportBlockedForNode(nodeId, nodeEvidence = null) {
    return (
      nodeId === this.nodeId && nodeEvidence?.localQueryTransportReady === false
    );
  }

  buildRuntimeAuthorityFailureDescriptor(failureReason) {
    return typeof failureReason === TYPEOF.STRING &&
      failureReason.length > NUM.ZERO ?
      Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.PRESENT,
        reason: failureReason,
      }) :
      Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.NONE,
      });
  }

  buildRuntimeAuthorityPublicationDescriptor(publication = null) {
    const mode =
      typeof publication?.currentMode === TYPEOF.STRING &&
      publication.currentMode.length > NUM.ZERO ?
        publication.currentMode :
        null;
    const reasonCode =
      typeof publication?.reasonCode === TYPEOF.STRING &&
      publication.reasonCode.length > NUM.ZERO ?
        publication.reasonCode :
        null;
    const enteredAt =
      typeof publication?.enteredAt === TYPEOF.STRING &&
      publication.enteredAt.length > NUM.ZERO ?
        publication.enteredAt :
        null;
    const healthy =
      mode === CONTROL_PLANE_PUBLICATION_MODE.GROUPED ||
      (mode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY &&
        reasonCode === PUBLICATION_REASON_CONFIG_SAFE_MODE);
    return Object.freeze({
      state: healthy ?
        RUNTIME_AUTHORITY_PUBLICATION_STATE.HEALTHY :
        RUNTIME_AUTHORITY_PUBLICATION_STATE.DEGRADED,
      healthy,
      mode,
      reasonCode,
      enteredAt,
    });
  }

  buildRuntimeAuthorityVisibilityDescriptor(details = {}) {
    const observationState =
      typeof details.publicationObservationState === TYPEOF.STRING &&
      details.publicationObservationState.length > NUM.ZERO ?
        details.publicationObservationState :
        AUTHORITY_PUBLICATION_OBSERVATION_STATE.OBSERVATION_UNAVAILABLE;
    const publicationStatus =
      typeof details.publicationStatus === TYPEOF.STRING &&
      details.publicationStatus.length > NUM.ZERO ?
        details.publicationStatus :
        null;
    const state =
      details.missingNodeReadinessState ===
      MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE ?
        RUNTIME_AUTHORITY_VISIBILITY_STATE.RETAINED_LOCAL_RUNTIME :
        details.controlPlanePublished === true ?
          RUNTIME_AUTHORITY_VISIBILITY_STATE.CONFIRMED :
          details.repairEligible === true ||
              details.recoveryEligible === true ||
              details.priorityRecoveryActive === true ?
            RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION :
            RUNTIME_AUTHORITY_VISIBILITY_STATE.UNAVAILABLE;
    return Object.freeze({
      state,
      published: details.controlPlanePublished === true,
      priorityRecoveryActive: details.priorityRecoveryActive === true,
      observationState,
      publicationStatus,
      enteredAt:
        typeof details.enteredAt === TYPEOF.STRING &&
        details.enteredAt.length > NUM.ZERO ?
          details.enteredAt :
          null,
    });
  }

  buildRuntimeAuthorityRepairDescriptor(latestRepair = null) {
    if (!latestRepair || typeof latestRepair !== TYPEOF.OBJECT) {
      return Object.freeze({
        state: RUNTIME_AUTHORITY_REPAIR_STATE.NOT_ATTEMPTED,
      });
    }
    const outcome =
      typeof latestRepair.outcome === TYPEOF.STRING &&
      latestRepair.outcome.length > NUM.ZERO ?
        latestRepair.outcome :
        null;
    const state =
      outcome === RUNTIME_AUTHORITY_REPAIR_STATE.REPAIRED ?
        RUNTIME_AUTHORITY_REPAIR_STATE.REPAIRED :
        outcome === RUNTIME_AUTHORITY_REPAIR_STATE.FAILED ?
          RUNTIME_AUTHORITY_REPAIR_STATE.FAILED :
          outcome === RUNTIME_AUTHORITY_REPAIR_STATE.UNCHANGED ?
            RUNTIME_AUTHORITY_REPAIR_STATE.UNCHANGED :
            RUNTIME_AUTHORITY_REPAIR_STATE.NOT_ATTEMPTED;
    return Object.freeze({
      state,
      outcome,
      repaired: latestRepair.repaired === true,
      repairIntent:
        typeof latestRepair.repairIntent === TYPEOF.STRING &&
        latestRepair.repairIntent.length > NUM.ZERO ?
          latestRepair.repairIntent :
          null,
      nodeEvidenceState:
        typeof latestRepair.nodeEvidenceState === TYPEOF.STRING &&
        latestRepair.nodeEvidenceState.length > NUM.ZERO ?
          latestRepair.nodeEvidenceState :
          null,
      serviceEvidenceState:
        typeof latestRepair.serviceEvidenceState === TYPEOF.STRING &&
        latestRepair.serviceEvidenceState.length > NUM.ZERO ?
          latestRepair.serviceEvidenceState :
          null,
      partitionEvidenceState:
        typeof latestRepair.partitionEvidenceState === TYPEOF.STRING &&
        latestRepair.partitionEvidenceState.length > NUM.ZERO ?
          latestRepair.partitionEvidenceState :
          null,
      nodeRowCount: Number.isFinite(latestRepair.nodeRowCount) ?
        latestRepair.nodeRowCount :
        null,
      serviceRowCount: Number.isFinite(latestRepair.serviceRowCount) ?
        latestRepair.serviceRowCount :
        null,
      partitionRowCount: Number.isFinite(latestRepair.partitionRowCount) ?
        latestRepair.partitionRowCount :
        null,
      error:
        typeof latestRepair.error === TYPEOF.STRING &&
        latestRepair.error.length > NUM.ZERO ?
          latestRepair.error :
          null,
      recordedAt:
        typeof latestRepair.recordedAt === TYPEOF.STRING &&
        latestRepair.recordedAt.length > NUM.ZERO ?
          latestRepair.recordedAt :
          null,
    });
  }

  resolveRuntimeAuthorityFailureReason(details = {}) {
    if (details.processAlive !== true) {
      return CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE;
    }
    if (
      details.visibilityState !== RUNTIME_AUTHORITY_VISIBILITY_STATE.UNAVAILABLE
    ) {
      return null;
    }
    if (details.localQueryTransportBlocked === true) {
      return CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY;
    }
    if (details.routingReady !== true) {
      return CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY;
    }
    if (details.publicationHealthy !== true) {
      return details.publicationMode ===
        CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY ?
        CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY :
        CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED;
    }
    if (details.clusterMemberHealthy !== true) {
      return CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY;
    }
    if (details.writableControlPlaneService !== true) {
      return CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY;
    }
    if (details.controlPlanePublished !== true) {
      return CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING;
    }
    return null;
  }

  resolveRuntimeAuthorityState(details = {}) {
    if (
      details.visibilityState ===
        RUNTIME_AUTHORITY_VISIBILITY_STATE.CONFIRMED &&
      details.repairEligible === true
    ) {
      return RUNTIME_AUTHORITY_STATE.CONFIRMED;
    }
    if (
      details.visibilityState ===
      RUNTIME_AUTHORITY_VISIBILITY_STATE.RETAINED_LOCAL_RUNTIME
    ) {
      return RUNTIME_AUTHORITY_STATE.RETAINED;
    }
    if (
      details.visibilityState ===
      RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION
    ) {
      return RUNTIME_AUTHORITY_STATE.ESTABLISHING;
    }
    return RUNTIME_AUTHORITY_STATE.UNAVAILABLE;
  }

  buildRuntimeAuthoritySnapshot(context = {}) {
    const missingNodeReadinessState =
      context?.missingNodeReadinessState ===
      MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE ?
        MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE :
        MISSING_NODE_READINESS_STATE.FAIL_CLOSED;
    const processAlive =
      !CONTROL_PLANE_READINESS_DEFAULT.NON_RUNNING_PROCESS_STATES.includes(
        String(context.lifecycleState || ''),
      );
    const localQueryTransportBlocked = this.isLocalQueryTransportBlockedForNode(
      context.nodeId,
      context.nodeEvidence,
    );
    const localQueryTransportRoutable =
      this.isLocalQueryTransportRoutableForNode(
        context.nodeId,
        context.nodeEvidence,
      );
    const clusterMemberHealthy =
      this.isClusterMemberHealthy(context.nodeId, context.nodeRow) ||
      missingNodeReadinessState ===
        MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE;
    const writableControlPlaneService = this.hasWritableControlPlaneService(
      context.serviceRows,
    );
    const routingReady =
      this.hasRoutableService(context.serviceRows) &&
      localQueryTransportRoutable;
    const controlPlanePublished = this.isControlPlanePublished(
      context.membershipPublication,
    );
    const membershipPublicationPlanningSnapshot =
      this.resolveMembershipPublicationPlanningSnapshot(context);
    const priorityRecoveryActive = this.isPriorityControlPlaneRecoveryActive(
      membershipPublicationPlanningSnapshot,
    );
    const publication = this.buildRuntimeAuthorityPublicationDescriptor(
      context.publication,
    );
    const publicationHealthy = publication.healthy === true;
    const writeEligible =
      clusterMemberHealthy &&
      routingReady &&
      writableControlPlaneService &&
      publicationHealthy;
    const recoveryEligible = this.isControlPlaneRecoveryEligible({
      ...context,
      priorityRecoveryActive,
      routingReady,
      writableControlPlaneService,
      publicationHealthy,
      publicationMode: publication.mode,
      controlPlanePublished,
      clusterMemberHealthy,
    });
    const repairEligible = processAlive && writeEligible;
    const visibility = this.buildRuntimeAuthorityVisibilityDescriptor({
      controlPlanePublished,
      enteredAt:
        context.membershipPublication?.createdAt ||
        context.membershipPublication?.updatedAt ||
        null,
      missingNodeReadinessState,
      priorityRecoveryActive,
      publicationObservationState:
        membershipPublicationPlanningSnapshot?.publicationObservationState ||
        context.membershipPublication?.publicationObservationState ||
        null,
      publicationStatus:
        membershipPublicationPlanningSnapshot?.publicationStatus ||
        context.membershipPublication?.status ||
        null,
      recoveryEligible,
      repairEligible,
    });
    const resolvedProvisioning = this.resolveProvisioningEligibility({
      processAlive,
      repairEligible,
      controlPlaneRecoveryEligible: recoveryEligible,
      controlPlanePublished,
      priorityRecoveryActive,
    });
    const provisioningState =
      visibility.state ===
      RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION ?
        PROVISIONING_ELIGIBILITY_STATE.CONVERGENCE_GRACE :
        resolvedProvisioning.state;
    const repair = this.buildRuntimeAuthorityRepairDescriptor(
      this.getLatestAuthoritativeReadinessRepair(context.nodeId || null),
    );
    const failureReason = this.resolveRuntimeAuthorityFailureReason({
      clusterMemberHealthy,
      controlPlanePublished,
      localQueryTransportBlocked,
      processAlive,
      publicationHealthy,
      publicationMode: publication.mode,
      routingReady,
      visibilityState: visibility.state,
      writableControlPlaneService,
    });
    const state = this.resolveRuntimeAuthorityState({
      repairEligible,
      visibilityState: visibility.state,
    });
    const reasonCodes = [];
    if (
      visibility.state ===
      RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION
    ) {
      reasonCodes.push(
        CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING,
      );
    }
    if (failureReason) {
      reasonCodes.push(failureReason);
    }
    if (
      Array.isArray(
        membershipPublicationPlanningSnapshot?.priorityRecoveryReasonCodes,
      )
    ) {
      reasonCodes.push(
        ...membershipPublicationPlanningSnapshot.priorityRecoveryReasonCodes,
      );
    }
    return Object.freeze({
      state,
      ready: state === RUNTIME_AUTHORITY_STATE.CONFIRMED,
      authorityAvailable: state !== RUNTIME_AUTHORITY_STATE.UNAVAILABLE,
      processAlive,
      clusterMemberHealthy,
      routingReady,
      writeEligible,
      recoveryEligible,
      repairEligible,
      publication,
      visibility,
      repair,
      provisioning: Object.freeze({
        state: provisioningState,
        eligible: resolvedProvisioning.eligible === true,
      }),
      failure: this.buildRuntimeAuthorityFailureDescriptor(failureReason),
      reasonCodes: Object.freeze([...new Set(reasonCodes)]),
    });
  }

  /**
   * Build readiness for a missing node row.
   * @param {string} nodeId
   * @param {string} observedAt
   * @param {Object} publication
   * @return {Object}
   * @private
   */
  buildMissingNodeReadiness(
    nodeId,
    observedAt,
    publication,
    membershipPublication = null,
  ) {
    const runtimeAuthority = this.buildRuntimeAuthoritySnapshot({
      nodeId,
      lifecycleState: null,
      membershipPublication,
      membershipPublicationPlanningSnapshot: null,
      missingNodeReadinessState: MISSING_NODE_READINESS_STATE.FAIL_CLOSED,
      nodeEvidence: null,
      nodeRow: null,
      observedAt,
      publication,
      serviceRows: Object.freeze([]),
    });
    const dimensions = Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]:
        runtimeAuthority.visibility?.published === true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
        runtimeAuthority.publication?.healthy === true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
    });
    const reasons = Object.freeze([
      buildReason(
        CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING,
        CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        observedAt,
      ),
    ]);

    return Object.freeze({
      ...createEligibilitySnapshot({
        nodeId,
        lifecycleState: null,
        publication,
        membershipPublication,
        capacity: null,
        nodeEvidence: null,
        observedAt,
        dimensions,
        reasons,
      }),
      runtimeAuthority,
    });
  }

  buildEvaluatedNodeReadinessSnapshot(context = {}) {
    const persistSnapshot = context.persistSnapshot !== false;
    const runtimeAuthority = this.buildRuntimeAuthoritySnapshot(context);
    const dimensions = this.buildDimensions({
      ...context,
      runtimeAuthority,
    });
    const priorityControlPlaneRecovery =
      this.getPriorityControlPlaneRecoveryState({
        nodeId: context.nodeId,
        observedAt: context.observedAt,
        publication: context.publication,
        membershipPublication: context.membershipPublication,
        membershipPublicationPlanningSnapshot:
          context.membershipPublicationPlanningSnapshot,
        dimensions,
      });
    const reasons = this.buildReasons({
      ...context,
      dimensions,
      priorityControlPlaneRecovery,
    });
    const recentTransitions = persistSnapshot ?
      this.recordReadinessTransition({
        nodeId: context.nodeId,
        observedAt: context.observedAt,
        publication: context.publication,
        membershipPublication: context.membershipPublication,
        nodeEvidence: context.nodeEvidence,
        dimensions,
        reasons,
        priorityControlPlaneRecovery,
        runtimeAuthority,
      }) :
      this.getReadinessTransitionHistory(context.nodeId);

    const snapshot = Object.freeze({
      ...createEligibilitySnapshot({
        nodeId: context.nodeId,
        lifecycleState: context.lifecycleState,
        publication: context.publication,
        membershipPublication: context.membershipPublication,
        priorityControlPlaneRecovery,
        capacity: context.capacity,
        nodeEvidence: context.nodeEvidence,
        observedAt: context.observedAt,
        dimensions,
        reasons,
      }),
      runtimeAuthority,
      recentTransitions,
    });
    if (persistSnapshot) {
      this.storeReadinessSnapshot(context.nodeId, snapshot);
    }
    return snapshot;
  }

  resolveMissingNodeReadinessState(context = {}) {
    const nodeId = context?.nodeId || null;
    const lifecycleState =
      typeof context?.lifecycleState === TYPEOF.STRING ?
        context.lifecycleState :
        null;
    const serviceRows = Array.isArray(context?.serviceRows) ?
      context.serviceRows :
      [];
    if (nodeId !== this.nodeId) {
      return Object.freeze({
        state: MISSING_NODE_READINESS_STATE.FAIL_CLOSED,
        reason: MISSING_NODE_READINESS_REASON.REMOTE_NODE,
      });
    }
    const processAlive =
      !CONTROL_PLANE_READINESS_DEFAULT.NON_RUNNING_PROCESS_STATES.includes(
        String(lifecycleState || ''),
      );
    if (!processAlive) {
      return Object.freeze({
        state: MISSING_NODE_READINESS_STATE.FAIL_CLOSED,
        reason: MISSING_NODE_READINESS_REASON.PROCESS_NOT_ALIVE,
      });
    }
    // Missing-row self grace must admit the same local control-plane service
    // evidence shapes that the canonical serveEligible model already treats as
    // cache-lag-safe. Otherwise a temporary cache gap on both the node row and
    // service rows synthesizes node_row_missing before the dimension model can
    // classify the live local runtime state.
    if (!this.hasServeEligibleControlPlaneService(serviceRows)) {
      return Object.freeze({
        state: MISSING_NODE_READINESS_STATE.FAIL_CLOSED,
        reason: MISSING_NODE_READINESS_REASON.CONTROL_PLANE_SERVICE_UNAVAILABLE,
      });
    }
    return Object.freeze({
      state: MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE,
      reason: MISSING_NODE_READINESS_REASON.SELF_RUNTIME_GRACE,
    });
  }

  /**
   * Resolve the shared authoritative control-plane read view.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    if (!this.cdcIntegrationService) {
      return null;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
      now: this.now,
      queryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs,
    });
    return this.authoritativeControlPlaneView;
  }

  /**
   * Build node-row liveness evidence used by readiness diagnostics.
   * @param {string} nodeId
   * @param {Object|null} nodeRow
   * @return {Object|null}
   * @private
   */
  buildNodeEvidence(nodeId, nodeRow) {
    if (!nodeRow || typeof nodeRow !== TYPEOF.OBJECT) {
      return null;
    }
    return this.buildClusterMemberHealthDetails(nodeId, nodeRow);
  }

  buildMissingSelfNodeEvidence(nodeId) {
    if (nodeId !== this.nodeId) {
      return null;
    }
    const transportState = this.getNodeTransportState(nodeId, null);
    const localQueryTransport = this.getLocalQueryTransportEvidence(nodeId);
    return Object.freeze({
      rowConnectionState: transportState.rowState,
      routerConnectionState: transportState.routerState,
      transportConnected: transportState.connected,
      localQueryTransportState: localQueryTransport?.state || null,
      localQueryTransportReady:
        typeof localQueryTransport?.ready === LOCAL_STR_BOOLEAN ?
          localQueryTransport.ready :
          null,
      localQueryTransportReason: localQueryTransport?.reason || null,
      localQueryTransportReasonCode: localQueryTransport?.reasonCode || null,
      localQueryTransportErrorCode: localQueryTransport?.errorCode || null,
      localQueryTransportRetryAfterMs: Number.isFinite(
        localQueryTransport?.retryAfterMs,
      ) ?
        localQueryTransport.retryAfterMs :
        null,
    });
  }

  /**
   * Record one readiness transition when repair/serve eligibility flips.
   * @param {Object} context
   * @return {Object[]}
   * @private
   */
  recordReadinessTransition(context) {
    const currentState = this.buildReadinessTransitionState(context);
    const previousState =
      this.lastReadinessEvaluationByNodeId.get(context.nodeId) || null;
    this.lastReadinessEvaluationByNodeId.set(context.nodeId, currentState);

    if (!previousState) {
      return this.getReadinessTransitionHistory(context.nodeId);
    }

    const flippedDimensions = [];
    if (previousState.serveEligible !== currentState.serveEligible) {
      flippedDimensions.push(CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE);
    }
    if (previousState.repairEligible !== currentState.repairEligible) {
      flippedDimensions.push(CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE);
    }
    if (flippedDimensions.length === NUM.ZERO) {
      return this.getReadinessTransitionHistory(context.nodeId);
    }

    const entry = Object.freeze({
      nodeId: context.nodeId,
      observedAt: currentState.observedAt,
      observedAtMs: currentState.observedAtMs,
      previousServeEligible: previousState.serveEligible,
      serveEligible: currentState.serveEligible,
      previousRepairEligible: previousState.repairEligible,
      repairEligible: currentState.repairEligible,
      previousProjectionReadinessContract:
        previousState.projectionReadinessContract || null,
      projectionReadinessContract:
        currentState.projectionReadinessContract || null,
      previousReasonCodes: Object.freeze([...previousState.reasonCodes]),
      reasonCodes: Object.freeze([...currentState.reasonCodes]),
      flippedDimensions: Object.freeze(flippedDimensions),
      rawInputs: Object.freeze({...currentState.rawInputs}),
    });
    const history =
      this.readinessTransitionHistoryByNodeId.get(context.nodeId) || [];
    const nextHistory = [...history, entry];
    while (nextHistory.length > this.readinessTransitionHistoryLimit) {
      nextHistory.shift();
    }
    this.readinessTransitionHistoryByNodeId.set(context.nodeId, nextHistory);
    return this.getReadinessTransitionHistory(context.nodeId);
  }

  /**
   * Return one defensive copy of readiness transition history.
   * @param {string} nodeId
   * @return {Object[]}
   */
  getReadinessTransitionHistory(nodeId) {
    const history = this.readinessTransitionHistoryByNodeId.get(nodeId);
    if (!Array.isArray(history) || history.length === NUM.ZERO) {
      return Object.freeze([]);
    }
    return Object.freeze(
      history.map((entry) =>
        Object.freeze({
          ...entry,
          previousReasonCodes: Array.isArray(entry.previousReasonCodes) ?
            Object.freeze([...entry.previousReasonCodes]) :
            Object.freeze([]),
          reasonCodes: Array.isArray(entry.reasonCodes) ?
            Object.freeze([...entry.reasonCodes]) :
            Object.freeze([]),
          flippedDimensions: Array.isArray(entry.flippedDimensions) ?
            Object.freeze([...entry.flippedDimensions]) :
            Object.freeze([]),
          previousProjectionReadinessContract:
            entry.previousProjectionReadinessContract &&
            typeof entry.previousProjectionReadinessContract === TYPEOF.OBJECT ?
              Object.freeze({...entry.previousProjectionReadinessContract}) :
              null,
          projectionReadinessContract:
            entry.projectionReadinessContract &&
            typeof entry.projectionReadinessContract === TYPEOF.OBJECT ?
              Object.freeze({...entry.projectionReadinessContract}) :
              null,
          rawInputs:
            entry.rawInputs && typeof entry.rawInputs === TYPEOF.OBJECT ?
              Object.freeze({...entry.rawInputs}) :
              Object.freeze({}),
        }),
      ),
    );
  }

  /**
   * Return transition history for every tracked node.
   * @return {Object}
   */
  getReadinessTransitionHistoryByNodeId() {
    const entries = {};
    for (const nodeId of this.readinessTransitionHistoryByNodeId.keys()) {
      entries[nodeId] = this.getReadinessTransitionHistory(nodeId);
    }
    return Object.freeze(entries);
  }

  /**
   * Normalize one readiness state for transition tracking.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildReadinessTransitionState(context) {
    return buildReadinessTransitionOwnerState(context, this.now());
  }

  async getMembershipPublicationDiagnostics(
    nodeId,
    observedAt,
    readOptions = {},
  ) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return null;
    }
    const normalizedReadOptions = resolveMembershipPublicationReadOptions({
      lane: resolveMembershipPublicationReadLane(readOptions?.lane),
      queryTimeoutMs:
        Number.isFinite(readOptions?.queryTimeoutMs) &&
        readOptions.queryTimeoutMs > NUM.ZERO ?
          readOptions.queryTimeoutMs :
          this.membershipPublicationDiagnosticsQueryTimeoutMs,
    });
    let row = null;
    if (typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION) {
      row = await service.getLatestPublicationForNode(
        nodeId,
        normalizedReadOptions,
      );
    } else if (typeof service.getLatestClusterPublication === TYPEOF.FUNCTION) {
      row = await service.getLatestClusterPublication(normalizedReadOptions);
    }
    return this.buildMembershipPublicationDiagnostics(row, observedAt);
  }

  getMembershipPublicationDiagnosticsSync(
    nodeId,
    observedAt,
    readOptions = {},
  ) {
    const row = this.getLatestMembershipPublicationRowSync(nodeId, readOptions);
    return this.buildMembershipPublicationDiagnostics(row, observedAt);
  }

  async getControlPlanePublicationStory(nodeId, observedAt, readOptions = {}) {
    const metadataPublication = this.getPublicationDiagnostics(observedAt);
    const membershipPublication =
      await this.getMembershipPublicationDiagnostics(
        nodeId,
        observedAt,
        readOptions,
      );
    return buildControlPlanePublicationStory({
      observedAt,
      nodeId,
      metadataPublication,
      nodeStatePublication: this.getHeartbeatPublicationDiagnostics(),
      nodeStatePublicationMode: this.getHeartbeatPublicationMode(),
      membershipPublication,
    });
  }

  getControlPlanePublicationStorySync(nodeId, observedAt, readOptions = {}) {
    const metadataPublication = this.getPublicationDiagnostics(observedAt);
    const membershipPublication = this.getMembershipPublicationDiagnosticsSync(
      nodeId,
      observedAt,
      readOptions,
    );
    return buildControlPlanePublicationStory({
      observedAt,
      nodeId,
      metadataPublication,
      nodeStatePublication: this.getHeartbeatPublicationDiagnostics(),
      nodeStatePublicationMode: this.getHeartbeatPublicationMode(),
      membershipPublication,
    });
  }

  async getMembershipPublicationPlanningSnapshot(nodeId, observedAt) {
    const service = this.membershipPublicationService;
    if (
      service &&
      typeof service.deriveClusterMembershipCandidate === TYPEOF.FUNCTION
    ) {
      const candidate = await service.deriveClusterMembershipCandidate({
        disableNestedPriorityRecoveryPlanning: true,
        publisherNodeId: nodeId || this.nodeId,
        nowMs: observedAt,
      });
      if (candidate && typeof candidate === TYPEOF.OBJECT) {
        return this.normalizeMembershipPublicationPlanningSnapshot(candidate);
      }
    }
    const membershipPublication =
      await this.getMembershipPublicationDiagnostics(nodeId, observedAt, {
        lane: MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING,
        scope: MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER,
      });
    return this.buildMembershipPublicationPlanningSnapshot({
      nodeId,
      observedAt,
      membershipPublication,
    });
  }

  getMembershipPublicationPlanningSnapshotSync(nodeId, observedAt) {
    const service = this.membershipPublicationService;
    if (
      service &&
      typeof service.deriveClusterMembershipCandidateSync === TYPEOF.FUNCTION
    ) {
      const candidate = service.deriveClusterMembershipCandidateSync({
        disableNestedPriorityRecoveryPlanning: true,
        publisherNodeId: nodeId || this.nodeId,
        nowMs: observedAt,
      });
      if (candidate && typeof candidate === TYPEOF.OBJECT) {
        return this.normalizeMembershipPublicationPlanningSnapshot(candidate);
      }
    }
    const membershipPublication = this.getMembershipPublicationDiagnosticsSync(
      nodeId,
      observedAt,
      {
        lane: MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING,
        scope: MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER,
      },
    );
    return this.buildMembershipPublicationPlanningSnapshot({
      nodeId,
      observedAt,
      membershipPublication,
    });
  }

  /**
   * Canonical synchronous priority-recovery planning snapshot.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Object|null}
   */
  getPriorityRecoveryPlanningSnapshotSync(nodeId, observedAt) {
    return this.getMembershipPublicationPlanningSnapshotSync(
      nodeId,
      observedAt,
    );
  }

  /**
   * Return one synchronous owner answer for membership-publication planning.
   * This remains distinct from the async/best-effort surface so sync callers
   * never reconstruct planning state from diagnostics locally.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Object|null}
   */
  getMembershipPublicationPlanningAnswerSync(nodeId, observedAt) {
    return this.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt);
  }
}

export {ControlPlaneReadinessServiceSegment3};
