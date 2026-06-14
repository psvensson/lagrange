import {ControlPlaneReadinessServiceSegment4Stage3} from './control-plane-readiness-service-segment-4-stage-3.js';
import {CONTROL_PLANE_READINESS_SERVICE_SEGMENT_4_STAGE_SHARED as SHARED} from './control-plane-readiness-service-segment-4-stage-shared.js';

const {
  COLUMN,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  LOCAL_STR_PRESENT,
  MISSING_NODE_READINESS_STATE,
  NUM,
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE,
  PRIORITY_CONTROL_PLANE_RECOVERY_PROJECTION_STATE,
  SERVICE_STATUS,
  STARTUP_AUTHORITY_STATE,
  TYPEOF,
  buildCanonicalPublicationRecoveryEvidence,
  buildPublicationRecoveryGateSnapshot,
  buildStartupAuthorityFailureOwnerDescriptor,
  buildStartupAuthorityHealthDetails,
  buildStartupAuthorityOwnerContract,
  buildStartupAuthorityOwnerSnapshotFromPlanningAnswer,
  buildStartupAuthorityOwnerUnavailableSnapshot,
  buildStartupAuthorityPriorityPartitionOwnerDescriptor,
  buildStartupAuthorityPublicationOwnerDescriptor,
  buildStartupAuthorityRecoveryProtocolOwnerDescriptor,
  buildStartupAuthorityTargetParticipationOwnerDescriptor,
  normalizeDiagnosticTimestampMs,
  unwrapRowReadResult,
} = SHARED;

class ControlPlaneReadinessServiceSegment4Stage4 extends
  ControlPlaneReadinessServiceSegment4Stage3 {
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
        await this.getPriorityRecoveryPlanningSnapshotBestEffort(
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
        startupAuthority.failure.state === LOCAL_STR_PRESENT ?
          startupAuthority.failure.reason :
          PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_UNAVAILABLE,
        null,
        details,
      );
    }
    const reasonCodes = Array.isArray(
      startupAuthority.priorityRecoveryReasonCodes,
    ) ?
      [...startupAuthority.priorityRecoveryReasonCodes] :
      [];
    return Object.freeze({
      healthy: startupAuthority.state === STARTUP_AUTHORITY_STATE.READY,
      reasonCode:
        CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      ...(startupAuthority.state !== STARTUP_AUTHORITY_STATE.READY ?
        {
          details:
              this.buildPriorityRecoveryHealthDetailsFromStartupAuthority(
                startupAuthority,
                reasonCodes,
              ),
        } :
        {}),
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
      let membershipPublication = null;
      try {
        membershipPublication = this.getMembershipPublicationDiagnosticsSync(
          nodeId,
          observedAt,
        );
      } catch (_error) {
        membershipPublication = null;
      }
      return this.buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(
        this.resolveNodeMembershipPublicationPlanningAnswerSync(
          nodeId,
          observedAt,
          membershipPublication,
        ),
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
      let membershipPublication = null;
      try {
        membershipPublication =
          await this.getMembershipPublicationDiagnostics(nodeId, observedAt);
      } catch (_error) {
        membershipPublication = null;
      }
      return this.buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(
        await this.resolveNodeMembershipPublicationPlanningAnswer(
          nodeId,
          observedAt,
          membershipPublication,
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
    const providedPlanningSnapshot =
      context.membershipPublicationPlanningSnapshot &&
      typeof context.membershipPublicationPlanningSnapshot === TYPEOF.OBJECT ?
        context.membershipPublicationPlanningSnapshot :
        null;
    const planningSnapshot =
      this.buildPriorityRecoveryPlanningProjection(
        this.resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(
          context,
        ),
      );
    const publicationEvidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: planningSnapshot,
      publicationConvergenceGate:
        planningSnapshot?.publicationRecoveryGate || null,
      priorityRecoveryObservation:
        planningSnapshot?.priorityRecoveryObservation || null,
      priorityRecoveryDecisionSnapshots:
        planningSnapshot?.priorityRecoveryDecisionSnapshots || null,
      priorityRecoveryClosureWitness:
        planningSnapshot?.priorityRecoveryClosureWitness || null,
      priorityRecoveryInvariants:
        planningSnapshot?.priorityRecoveryInvariants || null,
    });
    const publicationRecoveryGate =
      publicationEvidence.publicationConvergenceGate ||
      planningSnapshot?.publicationRecoveryGate ||
      buildPublicationRecoveryGateSnapshot(planningSnapshot || {});
    const planningPriorityRecoveryObservation =
      planningSnapshot?.priorityRecoveryObservation &&
      typeof planningSnapshot.priorityRecoveryObservation === TYPEOF.OBJECT ?
        planningSnapshot.priorityRecoveryObservation :
        null;
    const planningPriorityRecoveryClosureWitness =
      planningSnapshot?.diagnosticPriorityRecoveryClosureWitness &&
      typeof planningSnapshot.diagnosticPriorityRecoveryClosureWitness ===
        TYPEOF.OBJECT ?
        planningSnapshot.diagnosticPriorityRecoveryClosureWitness :
        planningSnapshot?.priorityRecoveryClosureWitness &&
          typeof planningSnapshot.priorityRecoveryClosureWitness ===
            TYPEOF.OBJECT ?
          planningSnapshot.priorityRecoveryClosureWitness :
          providedPlanningSnapshot?.priorityRecoveryClosureWitness &&
            typeof providedPlanningSnapshot.priorityRecoveryClosureWitness ===
              TYPEOF.OBJECT ?
            providedPlanningSnapshot.priorityRecoveryClosureWitness :
            providedPlanningSnapshot?.publicationRecoveryGate
              ?.priorityRecoveryClosureWitness &&
              typeof providedPlanningSnapshot.publicationRecoveryGate
                .priorityRecoveryClosureWitness === TYPEOF.OBJECT ?
              providedPlanningSnapshot.publicationRecoveryGate
                .priorityRecoveryClosureWitness :
              null;
    const planningPriorityRecoveryObservationHasClosureState =
      typeof planningPriorityRecoveryObservation
        ?.priorityRecoveryClosureState === TYPEOF.STRING &&
      planningPriorityRecoveryObservation.priorityRecoveryClosureState.length >
        NUM.ZERO;
    const planningPriorityRecoveryObservationHasReasonCodes =
      Array.isArray(
        planningPriorityRecoveryObservation?.priorityRecoveryReasonCodes,
      ) &&
      planningPriorityRecoveryObservation.priorityRecoveryReasonCodes.length >
        NUM.ZERO;
    const planningDiagnosticPriorityRecoveryObservation =
      planningPriorityRecoveryObservationHasClosureState ||
      planningPriorityRecoveryObservationHasReasonCodes ?
        planningPriorityRecoveryObservation :
        (
          publicationRecoveryGate?.ready === true &&
          planningPriorityRecoveryClosureWitness ?
            Object.freeze({
              ...(publicationEvidence.priorityRecoveryObservation || {}),
              priorityRecoveryClosureState:
                planningPriorityRecoveryClosureWitness.state || null,
              priorityRecoveryReasonCodes:
                Array.isArray(
                  planningSnapshot.diagnosticPriorityRecoveryReasonCodes,
                ) &&
                planningSnapshot.diagnosticPriorityRecoveryReasonCodes.length >
                  NUM.ZERO ?
                  [...planningSnapshot.diagnosticPriorityRecoveryReasonCodes] :
                  Array.isArray(
                    providedPlanningSnapshot?.priorityRecoveryReasonCodes,
                  ) &&
                  providedPlanningSnapshot.priorityRecoveryReasonCodes.length >
                    NUM.ZERO ?
                    [...providedPlanningSnapshot.priorityRecoveryReasonCodes] :
                    Array.isArray(
                      providedPlanningSnapshot?.publicationRecoveryGate
                        ?.reasonCodes,
                    ) &&
                    providedPlanningSnapshot.publicationRecoveryGate.reasonCodes
                      .length > NUM.ZERO ?
                      [
                        ...providedPlanningSnapshot.publicationRecoveryGate
                          .reasonCodes,
                      ] :
                      Array.isArray(planningSnapshot.priorityRecoveryReasonCodes) ?
                        [...planningSnapshot.priorityRecoveryReasonCodes] :
                        [],
            }) :
            planningPriorityRecoveryObservation
        );
    const priorityRecoveryObservation =
      publicationRecoveryGate?.ready === true &&
        planningDiagnosticPriorityRecoveryObservation ?
        planningDiagnosticPriorityRecoveryObservation :
        publicationEvidence.priorityRecoveryObservation ||
          planningDiagnosticPriorityRecoveryObservation ||
          null;
    const priorityPartitionSummary =
      publicationRecoveryGate.priorityPartitionSummary ||
      priorityRecoveryObservation?.priorityPartitionSummary ||
      planningSnapshot?.priorityPartitionSummary ||
      null;
    const gateReasonCodes = Array.isArray(
      publicationRecoveryGate?.reasonCodes,
    ) ?
      [...publicationRecoveryGate.reasonCodes] :
      [];
    const runtimeBlockerReasonCodes = [];
    if (
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
      ] !== true
    ) {
      runtimeBlockerReasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
      );
    }
    const publicationPendingReasonCodePresent = gateReasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    );
    const controlPlaneNotWritable = runtimeBlockerReasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
    );
    if (
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] !== true &&
      !publicationPendingReasonCodePresent &&
      !controlPlaneNotWritable
    ) {
      runtimeBlockerReasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.RECOVERY_ELIGIBILITY_PENDING,
      );
    }

    const dedupedReasonCodes = Object.freeze([
      ...new Set([...gateReasonCodes, ...runtimeBlockerReasonCodes]),
    ]);
    const enteredAt =
      membershipPublication?.createdAt ||
      membershipPublication?.updatedAt ||
      normalizeDiagnosticTimestampMs(context.observedAt) ||
      this.now();
    const state =
      publicationRecoveryGate.active === true ?
        PRIORITY_CONTROL_PLANE_RECOVERY_PROJECTION_STATE
          .PUBLICATION_GATE_PENDING :
        runtimeBlockerReasonCodes.length > NUM.ZERO ?
          PRIORITY_CONTROL_PLANE_RECOVERY_PROJECTION_STATE.RUNTIME_BLOCKED :
          PRIORITY_CONTROL_PLANE_RECOVERY_PROJECTION_STATE.READY;

    return Object.freeze({
      active: publicationRecoveryGate.active === true,
      publicationGateActive: publicationRecoveryGate.active === true,
      state,
      reasonCodes: dedupedReasonCodes,
      publicationGateReady: publicationRecoveryGate.ready === true,
      runtimeBlocked: runtimeBlockerReasonCodes.length > NUM.ZERO,
      publicationGateReasonCodes: Object.freeze([...gateReasonCodes]),
      runtimeBlockerReasonCodes: Object.freeze([...runtimeBlockerReasonCodes]),
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
      priorityRecoveryObservation,
      priorityPartitionSummary,
      enteredAt,
    });
  }

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
}

export {ControlPlaneReadinessServiceSegment4Stage4};
