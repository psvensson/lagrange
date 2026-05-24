import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';

const {
  AUTHORITY_DESCRIPTOR_STATE,
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  MISSING_NODE_READINESS_STATE,
  NUM,
  PROVISIONING_ELIGIBILITY_STATE,
  PUBLICATION_REASON_CONFIG_SAFE_MODE,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
  TYPEOF,
  buildReason,
  createEligibilitySnapshot,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

function buildRuntimeAuthorityFailureDescriptor(failureReason) {
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

function buildRuntimeAuthorityPublicationDescriptor(publication = null) {
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

function buildRuntimeAuthorityVisibilityDescriptor(details = {}) {
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

function buildRuntimeAuthorityRepairDescriptor(latestRepair = null) {
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

function resolveRuntimeAuthorityFailureReason(details = {}) {
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

function resolveRuntimeAuthorityState(details = {}) {
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

function buildRuntimeAuthoritySnapshot(context = {}) {
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
function buildMissingNodeReadiness(
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
  const priorityControlPlaneRecovery =
    this.getPriorityControlPlaneRecoveryState({
      nodeId,
      observedAt,
      publication,
      membershipPublication,
      dimensions,
    });
  const projectionReadinessContract =
    this.buildProjectionReadinessContract({
      nodeId,
      observedAt,
      publication,
      membershipPublication,
      priorityControlPlaneRecovery,
      dimensions,
      reasons,
      runtimeAuthority,
    });

  return Object.freeze({
    ...createEligibilitySnapshot({
      nodeId,
      lifecycleState: null,
      publication,
      membershipPublication,
      priorityControlPlaneRecovery,
      capacity: null,
      nodeEvidence: null,
      observedAt,
      dimensions,
      reasons,
    }),
    projectionReadinessContract,
    runtimeAuthority,
  });
}

const controlPlaneReadinessRuntimeAuthorityMethods = {
  buildRuntimeAuthorityFailureDescriptor,
  buildRuntimeAuthorityPublicationDescriptor,
  buildRuntimeAuthorityVisibilityDescriptor,
  buildRuntimeAuthorityRepairDescriptor,
  resolveRuntimeAuthorityFailureReason,
  resolveRuntimeAuthorityState,
  buildRuntimeAuthoritySnapshot,
  buildMissingNodeReadiness,
};

function installControlPlaneReadinessRuntimeAuthorityMethods(prototype) {
  Object.defineProperties(
    prototype,
    Object.fromEntries(
      Object.entries(controlPlaneReadinessRuntimeAuthorityMethods).map(
        ([name, value]) => [
          name,
          {
            configurable: true,
            value,
            writable: true,
          },
        ],
      ),
    ),
  );
}

export {installControlPlaneReadinessRuntimeAuthorityMethods};
