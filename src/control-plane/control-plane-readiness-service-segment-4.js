import { CONTROL_PLANE_READINESS_SERVICE_SHARED } from "./control-plane-readiness-service-shared.js";
import { ControlPlaneReadinessServiceSegment3 } from "./control-plane-readiness-service-segment-3.js";

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

class ControlPlaneReadinessServiceSegment4 extends ControlPlaneReadinessServiceSegment3 {
  resolvePriorityRecoveryPlanningAnswer(
    nodeId,
    observedAt,
    planningSnapshot = null,
  ) {
    if (this.isPriorityControlPlaneRecoveryActive(planningSnapshot)) {
      this.storeActivePriorityRecoveryPlanningSnapshot(
        nodeId,
        planningSnapshot,
        observedAt,
      );
      return planningSnapshot;
    }
    const retainedSnapshot = this.getActivePriorityRecoveryPlanningSnapshot(
      nodeId,
      observedAt,
    );
    if (!this.isPriorityRecoveryPlanningSnapshotIncomplete(planningSnapshot)) {
      return this.shouldRetainMoreRecentActivePriorityRecoveryPlanningSnapshot(
        planningSnapshot,
        retainedSnapshot,
      )
        ? retainedSnapshot
        : planningSnapshot;
    }
    if (!retainedSnapshot) {
      return planningSnapshot;
    }
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return retainedSnapshot;
    }
    const publicationRecoveryGate =
      this.buildRetainedPriorityRecoveryPlanningGate(
        planningSnapshot,
        retainedSnapshot,
      );
    return Object.freeze({
      ...planningSnapshot,
      publicationRecoveryGate,
      priorityRecoveryActive: publicationRecoveryGate?.active === true,
      priorityRecoveryReasonCodes:
        publicationRecoveryGate?.reasonCodes ||
        Object.freeze([
          ...new Set([
            ...(Array.isArray(planningSnapshot.priorityRecoveryReasonCodes)
              ? planningSnapshot.priorityRecoveryReasonCodes
              : []),
            ...(Array.isArray(retainedSnapshot.priorityRecoveryReasonCodes)
              ? retainedSnapshot.priorityRecoveryReasonCodes
              : []),
          ]),
        ]),
      priorityPartitionSummary:
        publicationRecoveryGate?.priorityPartitionSummary ||
        (planningSnapshot.priorityPartitionSummary &&
        typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT
          ? planningSnapshot.priorityPartitionSummary
          : retainedSnapshot.priorityPartitionSummary),
      recoveryProtocolState:
        publicationRecoveryGate?.recoveryProtocolState ||
        (typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING &&
        planningSnapshot.recoveryProtocolState.length > NUM.ZERO
          ? planningSnapshot.recoveryProtocolState
          : retainedSnapshot.recoveryProtocolState),
      publicationObservationState:
        publicationRecoveryGate?.publicationObservationState ||
        planningSnapshot.publicationObservationState ||
        retainedSnapshot.publicationObservationState ||
        null,
    });
  }

  isPriorityRecoveryPlanningSnapshotIncomplete(planningSnapshot = null) {
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return true;
    }
    if (this.hasMembershipPublicationRecoveryGateEvidence(planningSnapshot)) {
      return false;
    }
    if (
      Array.isArray(planningSnapshot.priorityRecoveryReasonCodes) &&
      planningSnapshot.priorityRecoveryReasonCodes.length > NUM.ZERO
    ) {
      return false;
    }
    if (
      planningSnapshot.priorityPartitionSummary &&
      typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT
    ) {
      return false;
    }
    const publicationStatus =
      planningSnapshot.publicationStatus || planningSnapshot.status || null;
    if (
      typeof publicationStatus === TYPEOF.STRING &&
      publicationStatus.length > NUM.ZERO
    ) {
      const publicationPending =
        publicationStatus.toUpperCase() !==
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
      if (publicationPending) {
        return false;
      }
    }
    return true;
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

  hasMembershipPublicationRecoveryGateEvidence(planningSnapshot = null) {
    const publicationRecoveryGate =
      this.getMembershipPublicationRecoveryGate(planningSnapshot);
    if (!publicationRecoveryGate) {
      return false;
    }
    return (
      publicationRecoveryGate.active === true ||
      (typeof publicationRecoveryGate.publicationObservationState ===
        TYPEOF.STRING &&
        publicationRecoveryGate.publicationObservationState.length > NUM.ZERO &&
        publicationRecoveryGate.publicationObservationState !==
          AUTHORITY_PUBLICATION_OBSERVATION_STATE.OBSERVATION_UNAVAILABLE &&
        publicationRecoveryGate.publicationObservationState ===
          AUTHORITY_PUBLICATION_OBSERVATION_STATE.UNPUBLISHED) ||
      (typeof publicationRecoveryGate.recoveryProtocolState === TYPEOF.STRING &&
        publicationRecoveryGate.recoveryProtocolState.length > NUM.ZERO &&
        publicationRecoveryGate.recoveryProtocolState !==
          RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED) ||
      (publicationRecoveryGate.priorityPartitionSummary &&
        typeof publicationRecoveryGate.priorityPartitionSummary ===
          TYPEOF.OBJECT) ||
      (Array.isArray(publicationRecoveryGate.reasonCodes) &&
        publicationRecoveryGate.reasonCodes.length > NUM.ZERO) ||
      (typeof publicationRecoveryGate.publicationStatus === TYPEOF.STRING &&
        publicationRecoveryGate.publicationStatus.length > NUM.ZERO &&
        publicationRecoveryGate.publicationStatus.toUpperCase() !==
          CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED) ||
      publicationRecoveryGate.requiredAckCount > NUM.ZERO ||
      publicationRecoveryGate.acknowledgedCount > NUM.ZERO ||
      publicationRecoveryGate.pendingAckCount > NUM.ZERO ||
      publicationRecoveryGate.missingPublishedCount > NUM.ZERO
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
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return null;
    }
    const publicationRecoveryGate =
      this.getMembershipPublicationRecoveryGate(planningSnapshot) ||
      buildPublicationRecoveryGateSnapshot(planningSnapshot);
    const priorityRecoveryReasonCodes = Object.freeze([
      ...new Set([
        ...(Array.isArray(planningSnapshot.priorityRecoveryReasonCodes)
          ? planningSnapshot.priorityRecoveryReasonCodes
          : []),
        ...(Array.isArray(publicationRecoveryGate?.reasonCodes)
          ? publicationRecoveryGate.reasonCodes
          : []),
      ]),
    ]);
    const priorityPartitionSummary =
      planningSnapshot.priorityPartitionSummary &&
      typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT
        ? planningSnapshot.priorityPartitionSummary
        : publicationRecoveryGate?.priorityPartitionSummary || null;
    return Object.freeze({
      ...planningSnapshot,
      publicationRecoveryGate,
      publicationObservationState:
        typeof planningSnapshot.publicationObservationState === TYPEOF.STRING &&
        planningSnapshot.publicationObservationState.length > NUM.ZERO
          ? planningSnapshot.publicationObservationState
          : publicationRecoveryGate?.publicationObservationState || null,
      publicationStatus:
        typeof planningSnapshot.publicationStatus === TYPEOF.STRING &&
        planningSnapshot.publicationStatus.length > NUM.ZERO
          ? planningSnapshot.publicationStatus
          : typeof planningSnapshot.status === TYPEOF.STRING &&
              planningSnapshot.status.length > NUM.ZERO
            ? planningSnapshot.status
            : publicationRecoveryGate?.publicationStatus || null,
      priorityRecoveryReasonCodes,
      priorityPartitionSummary,
      priorityRecoveryActive: publicationRecoveryGate?.active === true,
      recoveryProtocolState:
        typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING &&
        planningSnapshot.recoveryProtocolState.length > NUM.ZERO
          ? planningSnapshot.recoveryProtocolState
          : publicationRecoveryGate?.recoveryProtocolState || null,
    });
  }

  getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt) {
    const planningSnapshot = this.getMembershipPublicationPlanningSnapshotSync(
      nodeId,
      observedAt,
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
}

export { ControlPlaneReadinessServiceSegment4 };
