import { CONTROL_PLANE_READINESS_SERVICE_SHARED } from "./control-plane-readiness-service-shared.js";
import { ControlPlaneReadinessServiceSegment3 } from "./control-plane-readiness-service-segment-3.js";
import {buildPriorityRecoveryObservationSnapshot} from
  "./priority-recovery-observation-snapshot.js";

const {
  AUTHORITATIVE_READINESS_REPAIR,
  AUTHORITY_DESCRIPTOR_STATE,
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
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STARTUP_AUTHORITY_ADMISSION_STATE,
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

class ControlPlaneReadinessServiceSegment4 extends ControlPlaneReadinessServiceSegment3 {
  getLocalClusterIncarnationFence() {
    if (
      typeof this.localClusterIncarnationFenceProvider !== TYPEOF.FUNCTION
    ) {
      return null;
    }
    const clusterIncarnationFence = this.localClusterIncarnationFenceProvider();
    return clusterIncarnationFence &&
      typeof clusterIncarnationFence === TYPEOF.OBJECT ?
      clusterIncarnationFence :
      null;
  }

  resolveLocalPlanningAdmissionEvidence(planningSnapshot = null) {
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return null;
    }
    const targetNodeId =
      typeof planningSnapshot.targetNodeId === TYPEOF.STRING &&
        planningSnapshot.targetNodeId.length > NUM.ZERO ?
        planningSnapshot.targetNodeId :
        typeof planningSnapshot.publisherNodeId === TYPEOF.STRING &&
          planningSnapshot.publisherNodeId.length > NUM.ZERO ?
          planningSnapshot.publisherNodeId :
          null;
    if (targetNodeId !== this.nodeId) {
      return null;
    }
    const clusterIncarnationFence = this.getLocalClusterIncarnationFence();
    if (!clusterIncarnationFence) {
      return null;
    }
    const admissionReasonCodes = Object.freeze(
      [...new Set(
        (Array.isArray(clusterIncarnationFence.reasonCodes) ?
          clusterIncarnationFence.reasonCodes :
          [])
          .filter((reasonCode) =>
            typeof reasonCode === TYPEOF.STRING &&
            reasonCode.length > NUM.ZERO),
      )],
    );
    return Object.freeze({
      admissionState:
        clusterIncarnationFence.allowed === true ?
          STARTUP_AUTHORITY_ADMISSION_STATE.ADMITTED :
          STARTUP_AUTHORITY_ADMISSION_STATE.BLOCKED,
      admissionReasonCodes,
      clusterIncarnationFence,
    });
  }

  resolvePriorityRecoveryPlanningAnswer(
    nodeId,
    observedAt,
    planningSnapshot = null,
  ) {
    const resolvedPlanningSnapshot =
      this.buildPriorityRecoveryPlanningProjection(planningSnapshot);
    if (this.isPriorityControlPlaneRecoveryActive(resolvedPlanningSnapshot)) {
      this.storeActivePriorityRecoveryPlanningSnapshot(
        nodeId,
        resolvedPlanningSnapshot,
        observedAt,
      );
      return resolvedPlanningSnapshot;
    }
    const retainedSnapshot = this.getActivePriorityRecoveryPlanningSnapshot(
      nodeId,
      observedAt,
    );
    if (
      !this.isPriorityRecoveryPlanningSnapshotIncomplete(resolvedPlanningSnapshot)
    ) {
      return this.shouldRetainMoreRecentActivePriorityRecoveryPlanningSnapshot(
        resolvedPlanningSnapshot,
        retainedSnapshot,
      )
        ? retainedSnapshot
        : resolvedPlanningSnapshot;
    }
    if (!retainedSnapshot) {
      return resolvedPlanningSnapshot;
    }
    if (
      !resolvedPlanningSnapshot ||
      typeof resolvedPlanningSnapshot !== TYPEOF.OBJECT
    ) {
      return retainedSnapshot;
    }
    return this.buildPriorityRecoveryPlanningProjection({
      ...resolvedPlanningSnapshot,
      publicationRecoveryGate: this.buildRetainedPriorityRecoveryPlanningGate(
        resolvedPlanningSnapshot,
        retainedSnapshot,
      ),
    });
  }

  isPriorityRecoveryPlanningSnapshotIncomplete(planningSnapshot = null) {
    return !this.hasMembershipPublicationRecoveryGateEvidence(planningSnapshot);
  }

  storeActivePriorityRecoveryPlanningSnapshot(
    nodeId,
    planningSnapshot,
    observedAt,
  ) {
    if (
      !nodeId ||
      !planningSnapshot ||
      typeof planningSnapshot !== TYPEOF.OBJECT
    ) {
      return;
    }
    const observedAtMs =
      normalizeDiagnosticTimestampMs(observedAt) ?? this.now();
    this.lastActivePriorityRecoveryPlanningSnapshotByNodeId.set(
      nodeId,
      planningSnapshot,
    );
    this.lastActivePriorityRecoveryPlanningSnapshotAtMsByNodeId.set(
      nodeId,
      observedAtMs,
    );
  }

  getActivePriorityRecoveryPlanningSnapshot(nodeId, observedAt) {
    const planningSnapshot =
      this.lastActivePriorityRecoveryPlanningSnapshotByNodeId.get(nodeId) ||
      null;
    const observedAtMs =
      this.lastActivePriorityRecoveryPlanningSnapshotAtMsByNodeId.get(nodeId) ||
      null;
    if (!planningSnapshot || !Number.isFinite(observedAtMs)) {
      return null;
    }
    const referenceObservedAtMs =
      normalizeDiagnosticTimestampMs(observedAt) ?? this.now();
    if (
      referenceObservedAtMs - observedAtMs >
      this.membershipPublicationPlanningActiveStaleGraceMs
    ) {
      return null;
    }
    return planningSnapshot;
  }

  clearActivePriorityRecoveryPlanningSnapshot(nodeId) {
    if (!nodeId) {
      return;
    }
    this.lastActivePriorityRecoveryPlanningSnapshotByNodeId.delete(nodeId);
    this.lastActivePriorityRecoveryPlanningSnapshotAtMsByNodeId.delete(nodeId);
  }

  getPriorityRecoveryPlanningPublicationEpoch(planningSnapshot = null) {
    const publicationEpoch = Number(planningSnapshot?.publicationEpoch);
    return Number.isInteger(publicationEpoch) && publicationEpoch >= NUM.ZERO
      ? publicationEpoch
      : null;
  }

  shouldRetainMoreRecentActivePriorityRecoveryPlanningSnapshot(
    planningSnapshot = null,
    retainedSnapshot = null,
  ) {
    if (
      !this.isPriorityControlPlaneRecoveryActive(retainedSnapshot) ||
      this.isPriorityControlPlaneRecoveryActive(planningSnapshot)
    ) {
      return false;
    }
    const retainedPublicationEpoch =
      this.getPriorityRecoveryPlanningPublicationEpoch(retainedSnapshot);
    const currentPublicationEpoch =
      this.getPriorityRecoveryPlanningPublicationEpoch(planningSnapshot);
    if (!Number.isInteger(retainedPublicationEpoch)) {
      return false;
    }
    if (!Number.isInteger(currentPublicationEpoch)) {
      return true;
    }
    return currentPublicationEpoch < retainedPublicationEpoch;
  }

  getMembershipPublicationRecoveryGate(planningSnapshot = null) {
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return null;
    }
    return planningSnapshot.publicationRecoveryGate &&
      typeof planningSnapshot.publicationRecoveryGate === TYPEOF.OBJECT
      ? planningSnapshot.publicationRecoveryGate
      : null;
  }

  buildPriorityRecoveryPlanningProjection(planningSnapshot = null) {
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return null;
    }
    const localPlanningAdmission =
      this.resolveLocalPlanningAdmissionEvidence(planningSnapshot);
    const publicationRecoveryGate =
      this.getMembershipPublicationRecoveryGate(planningSnapshot) ||
      buildPublicationRecoveryGateSnapshot(planningSnapshot);
    const priorityRecoveryReasonCodes = Object.freeze([
      ...new Set([
        ...(Array.isArray(publicationRecoveryGate?.reasonCodes)
          ? publicationRecoveryGate.reasonCodes
          : []),
        ...(Array.isArray(planningSnapshot.priorityRecoveryReasonCodes)
          ? planningSnapshot.priorityRecoveryReasonCodes
          : []),
      ]),
    ]);
    const priorityPartitionSummary =
      planningSnapshot.priorityPartitionSummary &&
      typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT
        ? planningSnapshot.priorityPartitionSummary
        : publicationRecoveryGate?.priorityPartitionSummary || null;
    const publicationObservationState =
      typeof planningSnapshot.publicationObservationState === TYPEOF.STRING &&
      planningSnapshot.publicationObservationState.length > NUM.ZERO
        ? planningSnapshot.publicationObservationState
        : publicationRecoveryGate?.publicationObservationState || null;
    const publicationStatus =
      typeof planningSnapshot.publicationStatus === TYPEOF.STRING &&
      planningSnapshot.publicationStatus.length > NUM.ZERO
        ? planningSnapshot.publicationStatus
        : typeof planningSnapshot.status === TYPEOF.STRING &&
            planningSnapshot.status.length > NUM.ZERO
          ? planningSnapshot.status
          : publicationRecoveryGate?.publicationStatus || null;
    const recoveryProtocolState =
      typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING &&
      planningSnapshot.recoveryProtocolState.length > NUM.ZERO
        ? planningSnapshot.recoveryProtocolState
        : publicationRecoveryGate?.recoveryProtocolState || null;
    const publicationEpoch = Number.isFinite(planningSnapshot.publicationEpoch)
      ? Math.floor(planningSnapshot.publicationEpoch)
      : Number.isFinite(publicationRecoveryGate?.publicationEpoch)
        ? Math.floor(publicationRecoveryGate.publicationEpoch)
        : null;
    const admissionState =
      typeof planningSnapshot.admissionState === TYPEOF.STRING &&
        planningSnapshot.admissionState.length > NUM.ZERO ?
        planningSnapshot.admissionState :
        typeof localPlanningAdmission?.admissionState === TYPEOF.STRING ?
          localPlanningAdmission.admissionState :
          null;
    const admissionReasonCodes = Array.isArray(
      planningSnapshot.admissionReasonCodes,
    ) ?
      planningSnapshot.admissionReasonCodes :
      Array.isArray(localPlanningAdmission?.admissionReasonCodes) ?
        localPlanningAdmission.admissionReasonCodes :
        null;
    const clusterIncarnationFence =
      planningSnapshot.clusterIncarnationFence &&
        typeof planningSnapshot.clusterIncarnationFence === TYPEOF.OBJECT ?
        planningSnapshot.clusterIncarnationFence :
        localPlanningAdmission?.clusterIncarnationFence || null;
    return Object.freeze({
      ...planningSnapshot,
      publicationEpoch,
      publicationRecoveryGate,
      publicationObservationState,
      publicationStatus,
      priorityRecoveryReasonCodes,
      priorityPartitionSummary,
      priorityRecoveryActive: publicationRecoveryGate?.active === true,
      recoveryProtocolState,
      ...(admissionState !== null ? {admissionState} : {}),
      ...(admissionReasonCodes !== null ? {admissionReasonCodes} : {}),
      ...(clusterIncarnationFence ? {clusterIncarnationFence} : {}),
    });
  }

  hasMembershipPublicationRecoveryGateEvidence(planningSnapshot = null) {
    const priorityRecoveryProjection =
      this.buildPriorityRecoveryPlanningProjection(planningSnapshot);
    if (!priorityRecoveryProjection) {
      return false;
    }
    if (priorityRecoveryProjection.priorityRecoveryActive === true) {
      return true;
    }
    if (
      Array.isArray(priorityRecoveryProjection.priorityRecoveryReasonCodes) &&
      priorityRecoveryProjection.priorityRecoveryReasonCodes.length > NUM.ZERO
    ) {
      return true;
    }
    if (
      priorityRecoveryProjection.priorityPartitionSummary &&
      typeof priorityRecoveryProjection.priorityPartitionSummary === TYPEOF.OBJECT
    ) {
      return true;
    }
    return (
      typeof priorityRecoveryProjection.publicationStatus === TYPEOF.STRING &&
      priorityRecoveryProjection.publicationStatus.length > NUM.ZERO &&
      priorityRecoveryProjection.publicationStatus.toUpperCase() !==
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
    );
  }

  buildRetainedPriorityRecoveryPlanningGate(
    planningSnapshot = null,
    retainedSnapshot = null,
  ) {
    if (!retainedSnapshot || typeof retainedSnapshot !== TYPEOF.OBJECT) {
      return this.getMembershipPublicationRecoveryGate(planningSnapshot);
    }
    const planningGate =
      this.getMembershipPublicationRecoveryGate(planningSnapshot);
    const retainedGate =
      this.getMembershipPublicationRecoveryGate(retainedSnapshot);
    const planningReasonCodes = Array.isArray(
      planningSnapshot?.priorityRecoveryReasonCodes,
    )
      ? planningSnapshot.priorityRecoveryReasonCodes
      : planningGate?.reasonCodes || [];
    const retainedReasonCodes = Array.isArray(
      retainedSnapshot?.priorityRecoveryReasonCodes,
    )
      ? retainedSnapshot.priorityRecoveryReasonCodes
      : retainedGate?.reasonCodes || [];
    const priorityPartitionSummary =
      planningSnapshot?.priorityPartitionSummary &&
      typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT
        ? planningSnapshot.priorityPartitionSummary
        : retainedSnapshot?.priorityPartitionSummary &&
            typeof retainedSnapshot.priorityPartitionSummary === TYPEOF.OBJECT
          ? retainedSnapshot.priorityPartitionSummary
          : null;
    const recoveryProtocolState =
      typeof planningSnapshot?.recoveryProtocolState === TYPEOF.STRING &&
      planningSnapshot.recoveryProtocolState.length > NUM.ZERO
        ? planningSnapshot.recoveryProtocolState
        : typeof retainedSnapshot?.recoveryProtocolState === TYPEOF.STRING &&
            retainedSnapshot.recoveryProtocolState.length > NUM.ZERO
          ? retainedSnapshot.recoveryProtocolState
          : null;
    return buildPublicationRecoveryGateSnapshot({
      publicationEpoch: Number.isFinite(planningSnapshot?.publicationEpoch)
        ? planningSnapshot.publicationEpoch
        : Number.isFinite(retainedSnapshot?.publicationEpoch)
          ? retainedSnapshot.publicationEpoch
          : (planningGate?.publicationEpoch ?? retainedGate?.publicationEpoch),
      publicationStatus:
        typeof planningSnapshot?.publicationStatus === TYPEOF.STRING &&
        planningSnapshot.publicationStatus.length > NUM.ZERO
          ? planningSnapshot.publicationStatus
          : typeof planningSnapshot?.status === TYPEOF.STRING &&
              planningSnapshot.status.length > NUM.ZERO
            ? planningSnapshot.status
            : typeof retainedSnapshot?.publicationStatus === TYPEOF.STRING &&
                retainedSnapshot.publicationStatus.length > NUM.ZERO
              ? retainedSnapshot.publicationStatus
              : typeof retainedSnapshot?.status === TYPEOF.STRING &&
                  retainedSnapshot.status.length > NUM.ZERO
                ? retainedSnapshot.status
                : planningGate?.publicationStatus ||
                  retainedGate?.publicationStatus,
      publicationObservationState:
        typeof planningSnapshot?.publicationObservationState ===
          TYPEOF.STRING &&
        planningSnapshot.publicationObservationState.length > NUM.ZERO
          ? planningSnapshot.publicationObservationState
          : typeof retainedSnapshot?.publicationObservationState ===
                TYPEOF.STRING &&
              retainedSnapshot.publicationObservationState.length > NUM.ZERO
            ? retainedSnapshot.publicationObservationState
            : planningGate?.publicationObservationState ||
              retainedGate?.publicationObservationState,
      recoveryProtocolState,
      priorityPartitionSummary,
      requiredAckNodeIds:
        Array.isArray(planningSnapshot?.requiredAckNodeIds) &&
        planningSnapshot.requiredAckNodeIds.length > NUM.ZERO
          ? planningSnapshot.requiredAckNodeIds
          : Array.isArray(retainedSnapshot?.requiredAckNodeIds)
            ? retainedSnapshot.requiredAckNodeIds
            : planningGate?.requiredAckNodeIds ||
              retainedGate?.requiredAckNodeIds,
      acknowledgedNodeIds:
        Array.isArray(planningSnapshot?.acknowledgedNodeIds) &&
        planningSnapshot.acknowledgedNodeIds.length > NUM.ZERO
          ? planningSnapshot.acknowledgedNodeIds
          : Array.isArray(retainedSnapshot?.acknowledgedNodeIds)
            ? retainedSnapshot.acknowledgedNodeIds
            : planningGate?.acknowledgedNodeIds ||
              retainedGate?.acknowledgedNodeIds,
      pendingAckNodeIds:
        Array.isArray(planningSnapshot?.pendingAckNodeIds) &&
        planningSnapshot.pendingAckNodeIds.length > NUM.ZERO
          ? planningSnapshot.pendingAckNodeIds
          : Array.isArray(retainedSnapshot?.pendingAckNodeIds)
            ? retainedSnapshot.pendingAckNodeIds
            : planningGate?.pendingAckNodeIds ||
              retainedGate?.pendingAckNodeIds,
      reasonCodes: Object.freeze([
        ...new Set([...planningReasonCodes, ...retainedReasonCodes]),
      ]),
      missingPublishedNodeIds:
        Array.isArray(planningSnapshot?.missingPublishedNodeIds) &&
        planningSnapshot.missingPublishedNodeIds.length > NUM.ZERO
          ? planningSnapshot.missingPublishedNodeIds
          : Array.isArray(
                planningSnapshot?.missingPublishedRecoveryActiveNodeIds,
              ) &&
              planningSnapshot.missingPublishedRecoveryActiveNodeIds.length >
                NUM.ZERO
            ? planningSnapshot.missingPublishedRecoveryActiveNodeIds
            : Array.isArray(retainedSnapshot?.missingPublishedNodeIds)
              ? retainedSnapshot.missingPublishedNodeIds
              : Array.isArray(
                    retainedSnapshot?.missingPublishedRecoveryActiveNodeIds,
                  )
                ? retainedSnapshot.missingPublishedRecoveryActiveNodeIds
                : planningGate?.missingPublishedNodeIds ||
                  retainedGate?.missingPublishedNodeIds,
    });
  }

  normalizeMembershipPublicationPlanningSnapshot(planningSnapshot = null) {
    return this.buildPriorityRecoveryPlanningProjection(planningSnapshot);
  }

  getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt) {
    const planningSnapshot = this.buildPriorityRecoveryPlanningProjection(
      this.getMembershipPublicationPlanningSnapshotSync(
        nodeId,
        observedAt,
      ),
    );
    if (this.isPriorityControlPlaneRecoveryActive(planningSnapshot)) {
      this.storeActivePriorityRecoveryPlanningSnapshot(
        nodeId,
        planningSnapshot,
        observedAt,
      );
      return planningSnapshot;
    }
    const resolvedPlanningSnapshot = this.resolvePriorityRecoveryPlanningAnswer(
      nodeId,
      observedAt,
      planningSnapshot,
    );
    if (
      !this.isPriorityControlPlaneRecoveryActive(resolvedPlanningSnapshot) &&
      !this.shouldRetainMoreRecentActivePriorityRecoveryPlanningSnapshot(
        planningSnapshot,
        resolvedPlanningSnapshot,
      )
    ) {
      this.clearActivePriorityRecoveryPlanningSnapshot(nodeId);
    }
    return resolvedPlanningSnapshot;
  }

  /**
   * Return the best current planning snapshot for callers that may benefit from
   * one bounded async freshness attempt but still need a deterministic fallback.
   *
   * The sync/async split remains explicit because the async diagnostics lane
   * may request best-effort freshness while sync callers preserve deterministic,
   * non-repairing behavior.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Promise<Object|null>}
   */
  async getMembershipPublicationPlanningSnapshotBestEffort(nodeId, observedAt) {
    const syncSnapshot = this.getMembershipPublicationPlanningAnswerSync(
      nodeId,
      observedAt,
    );
    const timeoutMs =
      this.membershipPublicationPlanningSnapshotRefreshTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= NUM.ZERO) {
      const asyncSnapshot = await this.getMembershipPublicationPlanningSnapshot(
        nodeId,
        observedAt,
      );
      return this.resolvePriorityRecoveryPlanningAnswer(
        nodeId,
        observedAt,
        asyncSnapshot || syncSnapshot,
      );
    }

    let timeoutHandle = null;
    try {
      const asyncSnapshot = await Promise.race([
        this.getMembershipPublicationPlanningSnapshot(nodeId, observedAt),
        new Promise((_resolve, reject) => {
          timeoutHandle = this.setTimeoutFn(() => {
            reject(
              new Error(
                "Timed out refreshing membership publication planning snapshot " +
                  `for ${nodeId || "unknown"} after ${timeoutMs}ms`,
              ),
            );
          }, timeoutMs);
          if (typeof timeoutHandle?.unref === TYPEOF.FUNCTION) {
            timeoutHandle.unref();
          }
        }),
      ]);
      return this.resolvePriorityRecoveryPlanningAnswer(
        nodeId,
        observedAt,
        asyncSnapshot || syncSnapshot,
      );
    } catch {
      return syncSnapshot;
    } finally {
      if (timeoutHandle) {
        this.clearTimeoutFn(timeoutHandle);
      }
    }
  }

  /**
   * Return one best-effort owner answer for membership-publication planning.
   * Callers should prefer this surface over sequencing sync/async reads
   * themselves so planning degradation policy stays owner-owned.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Promise<Object|null>}
   */
  async getMembershipPublicationPlanningAnswerBestEffort(nodeId, observedAt) {
    return this.getPriorityRecoveryPlanningAnswerBestEffort(nodeId, observedAt);
  }

  /**
   * Canonical best-effort priority-recovery planning answer.
   * Async refresh and deterministic fallback belong only in this
   * owner-owned surface.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Promise<Object|null>}
   */
  async getPriorityRecoveryPlanningAnswerBestEffort(nodeId, observedAt) {
    return this.getMembershipPublicationPlanningSnapshotBestEffort(
      nodeId,
      observedAt,
    );
  }

  /**
   * Canonical best-effort priority-recovery planning snapshot.
   * Async best-effort refresh remains owner-owned.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Promise<Object|null>}
   */
  async getPriorityRecoveryPlanningSnapshotBestEffort(nodeId, observedAt) {
    return this.getMembershipPublicationPlanningSnapshotBestEffort(
      nodeId,
      observedAt,
    );
  }

  /**
   * Return the current published membership epoch using readiness-owned
   * degradation policy instead of caller-local reconstruction.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {number|null}
   */
  getCurrentPublishedMembershipEpochSync(nodeId, observedAt) {
    const planningSnapshot = this.getMembershipPublicationPlanningAnswerSync(
      nodeId,
      observedAt,
    );
    const publishedPlanningEpoch = Number(
      planningSnapshot?.publishedPlanningEpoch,
    );
    if (
      Number.isInteger(publishedPlanningEpoch) &&
      publishedPlanningEpoch >= NUM.ZERO
    ) {
      return publishedPlanningEpoch;
    }
    return null;
  }

  buildMembershipPublicationDiagnostics(row, observedAt) {
    const protocolSnapshot = buildPublicationRecoveryProtocolSnapshot(row);
    if (!protocolSnapshot) {
      return null;
    }

    const publicationEpoch = Number(
      row.publicationEpoch ?? row.publication_epoch,
    );
    const sourceSnapshotVersion = Number(
      row.sourceSnapshotVersion ?? row.source_snapshot_version,
    );
    const createdAt = normalizeDiagnosticTimestampMs(
      row.createdAt ?? row.created_at ?? observedAt,
    );
    const updatedAt = normalizeDiagnosticTimestampMs(
      row.updatedAt ?? row.updated_at ?? createdAt,
    );
    return Object.freeze({
      publicationEpoch: Number.isFinite(publicationEpoch)
        ? publicationEpoch
        : protocolSnapshot.publicationEpoch,
      sourceSnapshotVersion: Number.isFinite(sourceSnapshotVersion)
        ? sourceSnapshotVersion
        : protocolSnapshot.sourceSnapshotVersion,
      status: protocolSnapshot.publicationStatus,
      publicationObservationState: protocolSnapshot.publicationObservationState,
      publishedActiveNodeIdsPresent:
        protocolSnapshot.publishedActiveNodeIdsPresent,
      publishedActiveNodeIds: protocolSnapshot.publishedActiveNodeIds,
      requiredAckNodeIds: protocolSnapshot.requiredAckNodeIds,
      acknowledgedNodeIds: protocolSnapshot.acknowledgedNodeIds,
      priorityPartitionSummary: protocolSnapshot.priorityPartitionSummary,
      membershipLifecycleSummary: protocolSnapshot.membershipLifecycleSummary,
      projectedServingNodeIds: protocolSnapshot.projectedServingNodeIds,
      locallyEligibleNodeIds: protocolSnapshot.locallyEligibleNodeIds,
      recoveryEligibleIncludedNodeIds:
        protocolSnapshot.recoveryEligibleIncludedNodeIds,
      recoveryActiveNodeIds: protocolSnapshot.recoveryActiveNodeIds,
      recoveryActiveNodeSource: protocolSnapshot.recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds:
        protocolSnapshot.missingPublishedRecoveryActiveNodeIds,
      participationByNodeId: protocolSnapshot.participationByNodeId,
      participationStateCounts: protocolSnapshot.participationStateCounts,
      recoveryProtocolState: protocolSnapshot.recoveryProtocolState,
      priorityRecoveryReasonCodes: protocolSnapshot.priorityRecoveryReasonCodes,
      publicationRecoveryGate: protocolSnapshot.publicationRecoveryGate,
      createdAt,
      updatedAt,
    });
  }

  buildMembershipPublicationPlanningSnapshot(context = {}) {
    const protocolSnapshot = buildPublicationRecoveryProtocolSnapshot(
      context.membershipPublication,
      {
        targetNodeId: context.nodeId,
      },
    );
    if (!protocolSnapshot) {
      return null;
    }
    return this.normalizeMembershipPublicationPlanningSnapshot(
      protocolSnapshot,
    );
  }

  resolveMembershipPublicationPlanningSnapshot(context = {}) {
    if (
      context?.membershipPublicationPlanningSnapshot &&
      typeof context.membershipPublicationPlanningSnapshot === TYPEOF.OBJECT
    ) {
      return context.membershipPublicationPlanningSnapshot;
    }
    return this.buildMembershipPublicationPlanningSnapshot({
      nodeId: context?.nodeId,
      observedAt: context?.observedAt,
      membershipPublication: context?.membershipPublication,
    });
  }

  resolveMembershipPublicationPlanningSource(options = {}) {
    return resolveMembershipPublicationPlanningSource(
      options?.membershipPublicationPlanningSource,
    );
  }

  shouldPersistReadinessSnapshot(options = {}) {
    return (
      this.resolveMembershipPublicationPlanningSource(options) !==
      MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW
    );
  }

  buildDirectMembershipPublicationPlanningAnswer(
    nodeId,
    observedAt,
    membershipPublication,
  ) {
    return this.resolvePriorityRecoveryPlanningAnswer(
      nodeId,
      observedAt,
      this.buildMembershipPublicationPlanningSnapshot({
        nodeId,
        observedAt,
        membershipPublication,
      }),
    );
  }

  async resolveNodeMembershipPublicationPlanningAnswer(
    nodeId,
    observedAt,
    membershipPublication,
    options = {},
  ) {
    if (
      this.resolveMembershipPublicationPlanningSource(options) ===
      MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW
    ) {
      return this.buildDirectMembershipPublicationPlanningAnswer(
        nodeId,
        observedAt,
        membershipPublication,
      );
    }
    return this.resolvePriorityRecoveryPlanningAnswer(
      nodeId,
      observedAt,
      await this.getMembershipPublicationPlanningAnswerBestEffort(
        nodeId,
        observedAt,
      ),
    );
  }

  resolveNodeMembershipPublicationPlanningAnswerSync(
    nodeId,
    observedAt,
    membershipPublication,
    options = {},
  ) {
    if (
      this.resolveMembershipPublicationPlanningSource(options) ===
      MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW
    ) {
      return this.buildDirectMembershipPublicationPlanningAnswer(
        nodeId,
        observedAt,
        membershipPublication,
      );
    }
    return this.resolvePriorityRecoveryPlanningAnswer(
      nodeId,
      observedAt,
      this.getMembershipPublicationPlanningAnswerSync(nodeId, observedAt),
    );
  }

  buildMembershipPublicationReadOptions(readOptions = {}) {
    return resolveMembershipPublicationReadOptions({
      lane: resolveMembershipPublicationReadLane(readOptions?.lane),
      queryTimeoutMs:
        Number.isFinite(readOptions?.queryTimeoutMs) &&
        readOptions.queryTimeoutMs > NUM.ZERO
          ? readOptions.queryTimeoutMs
          : this.membershipPublicationDiagnosticsQueryTimeoutMs,
    });
  }

  getLatestMembershipPublicationRowSync(nodeId, readOptions = {}) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return null;
    }
    const normalizedReadOptions =
      this.buildMembershipPublicationReadOptions(readOptions);
    const normalizedScope = resolveMembershipPublicationReadScope(
      readOptions?.scope,
    );
    if (
      normalizedScope === MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER &&
      typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION
    ) {
      return service.getLatestClusterPublicationSync(normalizedReadOptions);
    }
    if (typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION) {
      return service.getLatestPublicationForNodeSync(
        nodeId,
        normalizedReadOptions,
      );
    }
    if (typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION) {
      return service.getLatestClusterPublicationSync(normalizedReadOptions);
    }
    return null;
  }

  async getLatestMembershipPublicationRow(nodeId, readOptions = {}) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return null;
    }
    const normalizedReadOptions =
      this.buildMembershipPublicationReadOptions(readOptions);
    const normalizedScope = resolveMembershipPublicationReadScope(
      readOptions?.scope,
    );
    if (
      normalizedScope === MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER &&
      typeof service.getLatestClusterPublication === TYPEOF.FUNCTION
    ) {
      return service.getLatestClusterPublication(normalizedReadOptions);
    }
    if (typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION) {
      return service.getLatestPublicationForNode(nodeId, normalizedReadOptions);
    }
    if (typeof service.getLatestClusterPublication === TYPEOF.FUNCTION) {
      return service.getLatestClusterPublication(normalizedReadOptions);
    }
    return null;
  }

  getLatestPublishedMembershipPublicationRowSync(readOptions = {}) {
    const service = this.membershipPublicationService;
    if (
      !service ||
      typeof service !== TYPEOF.OBJECT ||
      typeof service.getLatestPublishedClusterPublicationSync !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    return service.getLatestPublishedClusterPublicationSync(
      this.buildMembershipPublicationReadOptions(readOptions),
    );
  }

  async getLatestPublishedMembershipPublicationRow(readOptions = {}) {
    const service = this.membershipPublicationService;
    if (
      !service ||
      typeof service !== TYPEOF.OBJECT ||
      typeof service.getLatestPublishedClusterPublication !== TYPEOF.FUNCTION
    ) {
      return null;
    }
    return service.getLatestPublishedClusterPublication(
      this.buildMembershipPublicationReadOptions(readOptions),
    );
  }

  buildPriorityControlPlaneRecoveryUnavailableHealth(
    failureReason,
    error = null,
    context = null,
  ) {
    const details = {
      failureReason,
    };
    if (context && typeof context === TYPEOF.OBJECT) {
      Object.assign(details, context);
    }
    if (error) {
      details.error = error?.message || String(error);
    }
    return Object.freeze({
      healthy: false,
      reasonCode:
        CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      details,
    });
  }

  buildStartupAuthorityFailureDescriptor(failureReason) {
    return buildStartupAuthorityFailureOwnerDescriptor(failureReason);
  }

  buildStartupAuthorityPublicationDescriptor(details = {}) {
    return buildStartupAuthorityPublicationOwnerDescriptor(details);
  }

  buildStartupAuthorityPriorityPartitionDescriptor(priorityPartitionSummary) {
    return buildStartupAuthorityPriorityPartitionOwnerDescriptor(
      priorityPartitionSummary,
    );
  }

  buildStartupAuthorityRecoveryProtocolDescriptor(recoveryProtocolState) {
    return buildStartupAuthorityRecoveryProtocolOwnerDescriptor(
      recoveryProtocolState,
    );
  }

  buildStartupAuthorityTargetParticipationDescriptor(targetParticipation) {
    return buildStartupAuthorityTargetParticipationOwnerDescriptor(
      targetParticipation,
    );
  }

  buildStartupAuthoritySnapshotContract(options = {}) {
    return buildStartupAuthorityOwnerContract(options);
  }

  buildPriorityRecoveryHealthDetailsFromStartupAuthority(
    startupAuthority,
    reasonCodes = [],
  ) {
    return buildStartupAuthorityHealthDetails(startupAuthority, reasonCodes);
  }

  buildStartupAuthorityUnavailableSnapshot(
    failureReason,
    error = null,
    context = null,
  ) {
    return buildStartupAuthorityOwnerUnavailableSnapshot(
      failureReason,
      error,
      context,
    );
  }

  buildStartupAuthoritySnapshotFromPlanningAnswer(planningSnapshot) {
    return buildStartupAuthorityOwnerSnapshotFromPlanningAnswer(
      planningSnapshot,
    );
  }

  getStartupAuthoritySnapshotSync(
    nodeId = this.nodeId,
    observedAt = this.now(),
  ) {
    try {
      return this.buildStartupAuthoritySnapshotFromPlanningAnswer(
        this.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt),
      );
    } catch (error) {
      return this.buildStartupAuthorityUnavailableSnapshot(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED,
        error,
      );
    }
  }

  async getStartupAuthoritySnapshot(
    nodeId = this.nodeId,
    observedAt = this.now(),
  ) {
    try {
      return this.buildStartupAuthoritySnapshotFromPlanningAnswer(
        await this.getPriorityRecoveryPlanningAnswerBestEffort(
          nodeId,
          observedAt,
        ),
      );
    } catch (error) {
      return this.buildStartupAuthorityUnavailableSnapshot(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED,
        error,
      );
    }
  }

  buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(planningSnapshot) {
    const startupAuthority =
      this.buildStartupAuthoritySnapshotFromPlanningAnswer(planningSnapshot);
    if (startupAuthority.authorityAvailable !== true) {
      const details =
        this.buildPriorityRecoveryHealthDetailsFromStartupAuthority(
          startupAuthority,
        );
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        startupAuthority.failure.state === "present"
          ? startupAuthority.failure.reason
          : PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_UNAVAILABLE,
        null,
        details,
      );
    }
    const reasonCodes = Array.isArray(
      startupAuthority.priorityRecoveryReasonCodes,
    )
      ? [...startupAuthority.priorityRecoveryReasonCodes]
      : [];
    return Object.freeze({
      healthy: startupAuthority.state === STARTUP_AUTHORITY_STATE.READY,
      reasonCode:
        CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      ...(startupAuthority.state !== STARTUP_AUTHORITY_STATE.READY
        ? {
            details:
              this.buildPriorityRecoveryHealthDetailsFromStartupAuthority(
                startupAuthority,
                reasonCodes,
              ),
          }
        : {}),
    });
  }

  getPriorityControlPlaneRecoveryHealthSync(
    nodeId = this.nodeId,
    observedAt = this.now(),
  ) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE,
      );
    }
    const hasPlanningProvider =
      typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION ||
      typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION;
    if (!hasPlanningProvider) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE
          .PLANNING_PROVIDER_UNAVAILABLE,
      );
    }
    try {
      return this.buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(
        this.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt),
      );
    } catch (error) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED,
        error,
      );
    }
  }

  async getPriorityControlPlaneRecoveryHealth(
    nodeId = this.nodeId,
    observedAt = this.now(),
  ) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE,
      );
    }
    const hasPlanningProvider =
      typeof service.getLatestClusterPublication === TYPEOF.FUNCTION ||
      typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION ||
      typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION ||
      typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION;
    if (!hasPlanningProvider) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE
          .PLANNING_PROVIDER_UNAVAILABLE,
      );
    }
    try {
      return this.buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(
        await this.getPriorityRecoveryPlanningAnswerBestEffort(
          nodeId,
          observedAt,
        ),
      );
    } catch (error) {
      return this.buildPriorityControlPlaneRecoveryUnavailableHealth(
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED,
        error,
      );
    }
  }

  getCapacitySnapshotSync(nodeId, _nodeRow) {
    if (
      this.storageAccountingService &&
      typeof this.storageAccountingService.getCapacitySnapshotForNodeSync ===
        TYPEOF.FUNCTION
    ) {
      return this.storageAccountingService.getCapacitySnapshotForNodeSync(nodeId);
    }

    return null;
  }

  getPriorityControlPlaneRecoveryState(context = {}) {
    return this.buildPriorityControlPlaneRecoveryProjection(context);
  }

  buildPriorityControlPlaneRecoveryProjection(context = {}) {
    const dimensions =
      context.dimensions && typeof context.dimensions === TYPEOF.OBJECT ?
        context.dimensions :
        {};
    const membershipPublication =
      context.membershipPublication &&
      typeof context.membershipPublication === TYPEOF.OBJECT ?
        context.membershipPublication :
        null;
    const planningSnapshot =
      this.buildPriorityRecoveryPlanningProjection(
        this.resolveMembershipPublicationPlanningSnapshot(context),
      );
    const publicationRecoveryGate =
      planningSnapshot?.publicationRecoveryGate ||
      buildPublicationRecoveryGateSnapshot(planningSnapshot || {});
    const priorityPartitionSummary =
      publicationRecoveryGate.priorityPartitionSummary ||
      planningSnapshot?.priorityPartitionSummary ||
      null;
    const reasonCodes = Array.isArray(planningSnapshot?.priorityRecoveryReasonCodes)
      ? [...planningSnapshot.priorityRecoveryReasonCodes]
      : [];
    if (
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
      ] !== true
    ) {
      reasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
      );
    }
    const publicationPendingReasonCodePresent = reasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    );
    const controlPlaneNotWritable = reasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
    );
    if (
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] !== true &&
      !publicationPendingReasonCodePresent &&
      !controlPlaneNotWritable
    ) {
      reasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.RECOVERY_ELIGIBILITY_PENDING,
      );
    }

    const dedupedReasonCodes = Object.freeze([...new Set(reasonCodes)]);
    const enteredAt =
      membershipPublication?.createdAt ||
      membershipPublication?.updatedAt ||
      normalizeDiagnosticTimestampMs(context.observedAt) ||
      this.now();

    return Object.freeze({
      active:
        publicationRecoveryGate.active === true ||
        dedupedReasonCodes.length > NUM.ZERO,
      reasonCodes: dedupedReasonCodes,
      publicationEpoch:
        publicationRecoveryGate.publicationEpoch ??
        planningSnapshot?.publicationEpoch ??
        membershipPublication?.publicationEpoch ??
        null,
      publicationStatus:
        publicationRecoveryGate.publicationStatus ??
        planningSnapshot?.publicationStatus ??
        (membershipPublication?.status || null),
      publicationRecoveryGate,
      priorityRecoveryObservation: buildPriorityRecoveryObservationSnapshot({
        publicationConvergence: planningSnapshot,
        publicationConvergenceGate: publicationRecoveryGate,
      }),
      priorityPartitionSummary,
      enteredAt,
    });
  }

  /**
   * Return true when the local node already has stronger self-owned readiness
   * evidence than an immediate authoritative repair would provide.
   *
   * The local node's active status plus locally hosted control-plane services
   * are sufficient to keep self admission open while CDC catches up. Forcing a
   * synchronous read-your-own-write round-trip to the seed on every stale local
   * heartbeat only recreates the chokepoint we are trying to avoid.
   *
   * @param {Object} context
   * @param {string|null} context.nodeId
   * @param {Object|null} context.nodeRow
   * @param {Object[]} context.serviceRows
   * @return {boolean}
   * @private
   */
  shouldPreferLocalSelfNodeEvidence(context = {}) {
    const nodeId = context?.nodeId || null;
    if (!nodeId || nodeId !== this.nodeId) {
      return false;
    }

    const nodeRow = context?.nodeRow || null;
    const status = String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase();
    const serviceRows = Array.isArray(context?.serviceRows) ?
      context.serviceRows :
      [];
    if (!nodeRow || typeof nodeRow !== TYPEOF.OBJECT) {
      const lifecycleState = this.getLifecycleState(nodeId, null);
      return this.resolveMissingNodeReadinessState({
        nodeId,
        lifecycleState,
        serviceRows,
      }).state === MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE;
    }

    if (status !== SERVICE_STATUS.ACTIVE) {
      return false;
    }
    return this.hasRoutableService(serviceRows) &&
      this.hasWritableControlPlaneService(serviceRows);
  }

  async readNodeRow(nodeId, options = {}) {
    if (Array.isArray(options.allNodeRows)) {
      return (
        options.allNodeRows.find((row) => row?.[COLUMN.NODE_ID] === nodeId) ||
        null
      );
    }
    if (
      options.allowAuthoritativeRefresh === true &&
      this.nodesOwner &&
      typeof this.nodesOwner.getNode === TYPEOF.FUNCTION
    ) {
      const result = await this.nodesOwner.getNode(nodeId, options);
      return unwrapRowReadResult(result);
    }
    if (
      this.nodesOwner &&
      typeof this.nodesOwner.getNodeFromCache === TYPEOF.FUNCTION
    ) {
      const result = await this.nodesOwner.getNodeFromCache(nodeId, options);
      return unwrapRowReadResult(result);
    }
    return this.getNodeRow(nodeId);
  }

  async readNodeRows(options = {}) {
    if (
      options.allowAuthoritativeRefresh === true &&
      this.nodesOwner &&
      typeof this.nodesOwner.listNodes === TYPEOF.FUNCTION
    ) {
      const result = await this.nodesOwner.listNodes(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (
      this.nodesOwner &&
      typeof this.nodesOwner.listNodesFromCache === TYPEOF.FUNCTION
    ) {
      const result = await this.nodesOwner.listNodesFromCache(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    return this.getNodeRows();
  }

  async readNodeServiceRows(nodeId, options = {}) {
    if (Array.isArray(options.allServiceRows)) {
      return options.allServiceRows.filter(
        (row) => row?.[COLUMN.NODE_ID] === nodeId,
      );
    }
    if (
      options.allowAuthoritativeRefresh === true &&
      this.servicesOwner &&
      typeof this.servicesOwner.listServices === TYPEOF.FUNCTION
    ) {
      const result = await this.servicesOwner.listServices(options);
      return Array.isArray(result?.rows) ?
        result.rows.filter((row) => row?.[COLUMN.NODE_ID] === nodeId) :
        [];
    }
    if (
      this.servicesOwner &&
      typeof this.servicesOwner.listServicesForNodeFromCache ===
        TYPEOF.FUNCTION
    ) {
      const result = await this.servicesOwner.listServicesForNodeFromCache(
        nodeId,
        options,
      );
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    return this.getNodeServiceRows(nodeId);
  }

  async readAllNodeServiceRows(options = {}) {
    if (
      options.allowAuthoritativeRefresh === true &&
      this.servicesOwner &&
      typeof this.servicesOwner.listServices === TYPEOF.FUNCTION
    ) {
      const result = await this.servicesOwner.listServices(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (
      this.servicesOwner &&
      typeof this.servicesOwner.listServicesFromCache === TYPEOF.FUNCTION
    ) {
      const result = await this.servicesOwner.listServicesFromCache(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION
    ) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.SERVICES) || [];
  }

  /**
   * Resolve one node row from cache.
   * @param {string} nodeId
   * @return {Object|null}
   * @private
   */
  getNodeRow(nodeId) {
    if (!this.systemTableCache) {
      return null;
    }
    if (typeof this.systemTableCache.get === TYPEOF.FUNCTION) {
      return this.systemTableCache.get(TABLES.NODES, nodeId) || null;
    }

    return this.getNodeRows().find((row) => row?.[COLUMN.NODE_ID] === nodeId) ||
      null;
  }

  /**
   * Resolve all node rows from cache.
   * @return {Object[]}
   * @private
   */
  getNodeRows() {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION
    ) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.NODES);
  }

  /**
   * Resolve service rows for one node.
   * @param {string} nodeId
   * @return {Object[]}
   * @private
   */
  getNodeServiceRows(nodeId) {
    if (!this.systemTableCache) {
      return [];
    }
    if (typeof this.systemTableCache.filter === TYPEOF.FUNCTION) {
      return this.systemTableCache.filter(TABLES.SERVICES, (row) => {
        return row?.[COLUMN.NODE_ID] === nodeId;
      });
    }
    if (typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.SERVICES).filter((row) => {
      return row?.[COLUMN.NODE_ID] === nodeId;
    });
  }

  /**
   * Resolve the canonical lifecycle state for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {string|null}
   * @private
   */
  getLifecycleState(nodeId, nodeRow) {
    if (
      nodeId === this.nodeId &&
      this.nodeLifecycleStateMachine &&
      typeof this.nodeLifecycleStateMachine.getState === TYPEOF.FUNCTION
    ) {
      return this.nodeLifecycleStateMachine.getState();
    }
    return nodeRow?.[COLUMN.STATUS] || null;
  }

  /**
   * Resolve the storage snapshot for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {Promise<Object|null>}
   * @private
   */
  async getCapacitySnapshot(nodeId, _nodeRow) {
    if (
      this.storageAccountingService &&
      typeof this.storageAccountingService.getCapacitySnapshotForNode ===
        TYPEOF.FUNCTION
    ) {
      return this.storageAccountingService.getCapacitySnapshotForNode(nodeId);
    }

    if (!this.loggedMissingStorageAccountingOwner) {
      this.loggedMissingStorageAccountingOwner = true;
      this.logMissingOwner(
        'ControlPlaneReadinessService missing storage accounting owner',
        CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
      );
    }

    if (this.strictOwnerDependencies) {
      throw new Error(READINESS_ERROR_MSG.STORAGE_ACCOUNTING_OWNER_REQUIRED);
    }

    return null;
  }

  /**
   * Return true when the node has at least one active addressed service.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasRoutableService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    if (
      !serviceRows.some((serviceRow) => {
        return this.hasAddressedService(serviceRow);
      })
    ) {
      return true;
    }
    return serviceRows.some((serviceRow) => {
      return (
        String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        this.hasAddressedService(serviceRow)
      );
    });
  }

  /**
   * Return true when the node has an active message-group control-plane path.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasWritableControlPlaneService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    const hasMessageGroupRows = serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (!hasMessageGroupRows) {
      return true;
    }
    if (this.hasActiveAddressedMessageGroupService(serviceRows)) {
      return true;
    }
    return this.hasStartupControlPlaneWriteGrace(serviceRows);
  }

  hasServeEligibleControlPlaneService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    const hasMessageGroupRows = serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (!hasMessageGroupRows) {
      return true;
    }
    return this.hasActiveAddressedMessageGroupService(serviceRows);
  }

  hasActiveAddressedMessageGroupService(serviceRows) {
    return serviceRows.some((serviceRow) => {
      return (
        serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        this.hasAddressedService(serviceRow)
      );
    });
  }

  hasRecoveryGraceControlPlaneService(serviceRows) {
    if (this.hasWritableControlPlaneService(serviceRows)) {
      return true;
    }
    // A restarted joiner can expose addressed but still-converging message-group
    // service rows before the local replica flips ACTIVE again. Keep recovery
    // admission open so it can finish re-registering through the owner path.
    if (
      !this.hasAddressedMessageGroupServiceWithStatuses(
        serviceRows,
        RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
      )
    ) {
      return false;
    }
    return this.hasActiveAddressedNonMessageGroupService(serviceRows);
  }

  hasStartupControlPlaneWriteGrace(serviceRows) {
    if (
      !this.hasAddressedMessageGroupServiceWithStatuses(serviceRows, [
        SERVICE_STATUS.STOPPED,
      ])
    ) {
      return false;
    }
    return this.hasActiveAddressedNonMessageGroupService(serviceRows);
  }

  hasAddressedService(serviceRow) {
    return typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
      serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
  }

  hasAddressedMessageGroupServiceWithStatuses(serviceRows, allowedStatuses) {
    if (!Array.isArray(allowedStatuses) || allowedStatuses.length === NUM.ZERO) {
      return false;
    }
    return serviceRows.some((serviceRow) => {
      return (
        serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        allowedStatuses.includes(
          String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase(),
        ) &&
        this.hasAddressedService(serviceRow)
      );
    });
  }

  hasActiveAddressedNonMessageGroupService(serviceRows) {
    return serviceRows.some((serviceRow) => {
      return (
        serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP &&
        String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        this.hasAddressedService(serviceRow)
      );
    });
  }

  /**
   * Return true when node resource usage is below the blocking threshold.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isLoadReady(nodeRow) {
    const loadValues = [
      Number(nodeRow?.[COLUMN.CPU_USAGE_PERCENT]),
      Number(nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT]),
      Number(nodeRow?.[COLUMN.DISK_USAGE_PERCENT]),
    ];

    return loadValues.every((value) => {
      return !Number.isFinite(value) ||
        value < CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT;
    });
  }

  /**
   * Return true when storage state permits placement.
   * @param {Object|null} capacity
   * @return {boolean}
   * @private
   */
  isCapacityPlacementEligible(capacity) {
    if (!capacity) {
      return false;
    }
    if (
      !Number.isFinite(Number(capacity.budgetBytes)) ||
      Number(capacity.budgetBytes) <= NUM.ZERO
    ) {
      return false;
    }
    return !CONTROL_PLANE_READINESS_DEFAULT
      .PLACEMENT_BLOCKING_PRESSURE_STATES.includes(
        String(capacity.pressureState || ''),
      );
  }

  /**
   * Map storage state to a stable readiness reason code.
   * @param {Object|null} capacity
   * @return {string|null}
   * @private
   */
  getCapacityReasonCode(capacity) {
    if (!capacity) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
    }
    if (
      !Number.isFinite(Number(capacity.budgetBytes)) ||
      Number(capacity.budgetBytes) <= NUM.ZERO
    ) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
    }
    if (capacity.pressureState === PRESSURE_STATE.HARD) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD;
    }
    if (capacity.pressureState === PRESSURE_STATE.EXHAUSTED) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED;
    }
    return null;
  }

  /**
   * Build structured diagnostics for one cluster-member-health miss.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {Object}
   * @private
   */
  buildClusterMemberHealthDetails(nodeId, nodeRow) {
    const now = this.now();
    const transportState = this.getNodeTransportState(nodeId, nodeRow);
    const localQueryTransport = this.getLocalQueryTransportEvidence(nodeId);
    const lastHeartbeat = Number(nodeRow?.[COLUMN.LAST_HEARTBEAT]);
    const readyLeaseExpiresAt = Number(nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]);
    const heartbeatAgeMs = Number.isFinite(lastHeartbeat) ?
      now - lastHeartbeat :
      null;
    const readyLeaseAgeMs = Number.isFinite(readyLeaseExpiresAt) ?
      now - readyLeaseExpiresAt :
      null;
    const status = String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase();

    return Object.freeze({
      status: status.length > NUM.ZERO ? status : null,
      rowConnectionState: transportState.rowState,
      routerConnectionState: transportState.routerState,
      transportConnected: transportState.connected,
      localQueryTransportState: localQueryTransport?.state || null,
      localQueryTransportReady:
        typeof localQueryTransport?.ready === 'boolean' ?
          localQueryTransport.ready :
          null,
      localQueryTransportReason: localQueryTransport?.reason || null,
      localQueryTransportReasonCode:
        localQueryTransport?.reasonCode || null,
      localQueryTransportErrorCode:
        localQueryTransport?.errorCode || null,
      localQueryTransportRetryAfterMs:
        Number.isFinite(localQueryTransport?.retryAfterMs) ?
          localQueryTransport.retryAfterMs :
          null,
      lastHeartbeat: Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
      heartbeatAgeMs: Number.isFinite(heartbeatAgeMs) ? heartbeatAgeMs : null,
      readyLeaseExpiresAt: Number.isFinite(readyLeaseExpiresAt) ?
        readyLeaseExpiresAt :
        null,
      readyLeaseAgeMs:
        Number.isFinite(readyLeaseAgeMs) ? readyLeaseAgeMs : null,
      staleHeartbeatLimitMs: this.clusterMemberStaleHeartbeatMaxAgeMs,
      readyNow: isNodeRecordReady(nodeRow, {now}),
      readyWhenWritten: wasNodeRecordReadyWhenWritten(nodeRow, {now}),
    });
  }

  /**
   * Resolve bounded local query/data-plane transport evidence for self-node
   * readiness diagnostics.
   * @param {string} nodeId
   * @return {{state:string,ready:boolean|null,reason:string|null,retryAfterMs:number|null}|null}
   * @private
   */
  getLocalQueryTransportEvidence(nodeId) {
    if (nodeId !== this.nodeId) {
      return null;
    }
    if (
      !this.messageRouter ||
      typeof this.messageRouter.getQueryDataPlaneTransportReadiness !==
        TYPEOF.FUNCTION
    ) {
      return normalizeLocalQueryTransportEvidence(null);
    }
    return normalizeLocalQueryTransportEvidence(
      this.messageRouter.getQueryDataPlaneTransportReadiness(),
    );
  }

  /**
   * Resolve transport connectivity evidence from row and live router state.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {{connected:boolean,rowState:string|null,routerState:string|null}}
   * @private
   */
  getNodeTransportState(nodeId, nodeRow) {
    let routerState = null;
    if (
      nodeId &&
      this.messageRouter &&
      typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION
    ) {
      routerState = String(
        this.messageRouter.getConnectionState(nodeId) || '',
      ).toLowerCase();
    }

    const rowStateRaw = String(nodeRow?.[COLUMN.CONNECTION_STATE] || '')
      .toLowerCase();
    const normalizedRowState = rowStateRaw.length > NUM.ZERO ?
      rowStateRaw :
      null;
    const normalizedRouterState =
      typeof routerState === TYPEOF.STRING && routerState.length > NUM.ZERO ?
        routerState :
        null;

    let connected = false;
    if (normalizedRouterState === STATE.DISCONNECTED) {
      connected = false;
    } else if (
      normalizedRouterState === STATE.CONNECTED ||
      normalizedRouterState === STATE.READY
    ) {
      connected = true;
    } else {
      connected =
        normalizedRowState === STATE.CONNECTED ||
        normalizedRowState === STATE.READY;
    }

    return Object.freeze({
      connected,
      rowState: normalizedRowState,
      routerState: normalizedRouterState,
    });
  }

  /**
   * Return true when a node row encodes a transport-connected state.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isNodeTransportConnected(nodeId, nodeRow) {
    return this.getNodeTransportState(nodeId, nodeRow).connected;
  }

  /**
   * Return true when heartbeat evidence is recent enough for stale-lease grace.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isRecentHeartbeat(nodeRow) {
    const lastHeartbeat = Number(nodeRow?.[COLUMN.LAST_HEARTBEAT]);
    if (!Number.isFinite(lastHeartbeat)) {
      return false;
    }
    return (this.now() - lastHeartbeat) <=
      this.clusterMemberStaleHeartbeatMaxAgeMs;
  }

  /**
   * Evaluate cluster membership health using canonical readiness row data and
   * live transport connectivity when available.
   *
   * Node rows with valid leases are healthy. Rows that were ready when written
   * remain healthy through short cache-propagation lag as long as transport is
   * connected and heartbeat evidence is still fresh.
   *
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isClusterMemberHealthy(nodeId, nodeRow) {
    const hasLeaseField = Number.isFinite(
      Number(nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]),
    );
    const hasStatusField =
      typeof nodeRow?.[COLUMN.STATUS] === TYPEOF.STRING &&
      nodeRow[COLUMN.STATUS].length > NUM.ZERO;

    if (!hasLeaseField && !hasStatusField) {
      return !!nodeRow;
    }

    const now = this.now();
    if (isNodeRecordReady(nodeRow, {now})) {
      return true;
    }

    const statusActive =
      String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase() ===
      SERVICE_STATUS.ACTIVE;

    if (!statusActive) {
      return false;
    }

    if (
      nodeId !== this.nodeId &&
      isNodeReadyLeaseExplicitlyCleared(nodeRow)
    ) {
      return false;
    }

    // §1.4.12 self-node fast path: a running node evaluating its own
    // cluster membership is trivially healthy — it is alive and
    // executing this check. This is the strongest possible signal,
    // stronger than any cache lease or transport evidence. Without
    // this, CDC propagation delays during topology changes (splits,
    // rebalance) cause the local cache lease to expire before the
    // heartbeat CDC event propagates back, leading to self-denial
    // of load-lane admission.
    if (nodeId === this.nodeId) {
      return true;
    }

    if (!this.isNodeTransportConnected(nodeId, nodeRow)) {
      return false;
    }

    const connectionState = String(
      nodeRow?.[COLUMN.CONNECTION_STATE] || '',
    ).toLowerCase();
    if (connectionState !== STATE.READY) {
      return false;
    }

    return this.isRecentHeartbeat(nodeRow);
  }

  /**
   * Build a compact snapshot summary suitable for persistence
   * alongside admission, dispatch, and progression decisions.
   *
   * Extracts only the key fields needed for diagnostics linkage
   * without the full verbose snapshot (publication details, capacity
   * breakdown, etc.).
   *
   * @param {Object|null} snapshot - Frozen readiness snapshot from
   *   getNodeReadiness / getNodeReadinessSync.
   * @param {string|null} [decisionDimension] - Canonical dimension used by
   *   the caller when evaluating this snapshot.
   * @return {Object|null} Compact frozen summary or null.
   */
  static compactSnapshotSummary(snapshot, decisionDimension = null) {
    return compactEligibilitySnapshot(snapshot, decisionDimension);
  }
}

export {
  ControlPlaneReadinessServiceSegment4,
  ControlPlaneReadinessServiceSegment4 as ControlPlaneReadinessService,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
};
