import {ControlPlaneReadinessServiceSegment4Stage2} from './control-plane-readiness-service-segment-4-stage-2.js';
import {CONTROL_PLANE_READINESS_SERVICE_SEGMENT_4_STAGE_SHARED as SHARED} from './control-plane-readiness-service-segment-4-stage-shared.js';

const {
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
  MEMBERSHIP_PUBLICATION_READ_SCOPE,
  NUM,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  TYPEOF,
  buildCanonicalPublicationRecoveryEvidence,
  resolveMembershipPublicationPlanningSource,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
  resolveMembershipPublicationReadScope,
} = SHARED;

class ControlPlaneReadinessServiceSegment4Stage3 extends
  ControlPlaneReadinessServiceSegment4Stage2 {
  resolveMembershipPublicationPlanningSnapshot(context = {}) {
    const directPlanningSnapshot = this.buildMembershipPublicationPlanningSnapshot({
      nodeId: context?.nodeId,
      observedAt: context?.observedAt,
      membershipPublication: context?.membershipPublication,
    });
    const providedPlanningSnapshot =
      context?.membershipPublicationPlanningSnapshot &&
      typeof context.membershipPublicationPlanningSnapshot === TYPEOF.OBJECT ?
        context.membershipPublicationPlanningSnapshot :
        null;
    if (!providedPlanningSnapshot) {
      return directPlanningSnapshot;
    }
    if (!directPlanningSnapshot) {
      return providedPlanningSnapshot;
    }
    if (
      this.shouldUseProvidedReadyGateForMembershipPublicationPlanningMerge(
        directPlanningSnapshot,
        providedPlanningSnapshot,
      )
    ) {
      return this.buildPriorityRecoveryPlanningProjection(
        providedPlanningSnapshot,
      );
    }
    const preferDirectReadyGate =
      this.shouldUseDirectReadyGateForMembershipPublicationPlanningMerge(
        directPlanningSnapshot,
        providedPlanningSnapshot,
      );
    const directPublicationRecoveryGate =
      directPlanningSnapshot.publicationRecoveryGate &&
      typeof directPlanningSnapshot.publicationRecoveryGate === TYPEOF.OBJECT ?
        directPlanningSnapshot.publicationRecoveryGate :
        null;
    const providedPublicationRecoveryGate =
      providedPlanningSnapshot.publicationRecoveryGate &&
      typeof providedPlanningSnapshot.publicationRecoveryGate ===
        TYPEOF.OBJECT ?
        providedPlanningSnapshot.publicationRecoveryGate :
        null;
    const directPendingAckEvidenceState =
      this.resolvePlanningPendingAckEvidenceState(
        directPlanningSnapshot,
        directPublicationRecoveryGate,
      );
    const providedPendingAckEvidenceState =
      this.resolvePlanningPendingAckEvidenceState(
        providedPlanningSnapshot,
        providedPublicationRecoveryGate,
      );
    const providedPendingAckCountValue =
      providedPlanningSnapshot.pendingAckCount ??
      providedPlanningSnapshot.publicationRecoveryGate?.pendingAckCount;
    const providedPendingAckCount = Number(providedPendingAckCountValue);
    const directRequiredAckNodeIds = Array.isArray(
      directPlanningSnapshot.requiredAckNodeIds,
    ) ?
      directPlanningSnapshot.requiredAckNodeIds :
      Array.isArray(
        directPlanningSnapshot.publicationRecoveryGate?.requiredAckNodeIds,
      ) ?
        directPlanningSnapshot.publicationRecoveryGate.requiredAckNodeIds :
        [];
    const providedRequiredAckNodeIds = Array.isArray(
      providedPlanningSnapshot.requiredAckNodeIds,
    ) ?
      providedPlanningSnapshot.requiredAckNodeIds :
      [];
    const directPendingAckCount = Number(
      directPlanningSnapshot.pendingAckCount ??
      directPlanningSnapshot.publicationRecoveryGate?.pendingAckCount ??
      NUM.ZERO,
    );
    const directHasPendingAckDebt =
      Number.isFinite(directPendingAckCount) &&
      directPendingAckCount > NUM.ZERO;
    const directHasRequiredAckNodeListDebt =
      directPendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST &&
      directRequiredAckNodeIds.length > NUM.ZERO;
    const providedHasCountOnlyAckDebt =
      providedPendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
      Number.isFinite(providedPendingAckCount) &&
      providedPendingAckCount > NUM.ZERO;
    const directCanAcceptProvidedCountOnlyAckDebt =
      directPendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY ||
      (
        directHasPendingAckDebt !== true &&
        directHasRequiredAckNodeListDebt !== true
      );
    const shouldUseProvidedAckNodeList =
      providedPendingAckEvidenceState !==
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
      providedRequiredAckNodeIds.length > NUM.ZERO &&
      (
        directPendingAckEvidenceState ===
          PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY ||
        (
          directPendingAckEvidenceState ===
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
              .REQUIRED_ACK_NODE_LIST &&
          directHasPendingAckDebt !== true &&
          directHasRequiredAckNodeListDebt !== true
        )
      );
    const shouldUseProvidedCountOnlyAckDebt =
      shouldUseProvidedAckNodeList !== true &&
      providedHasCountOnlyAckDebt &&
      directCanAcceptProvidedCountOnlyAckDebt;
    const publicationConvergenceForEvidence =
      shouldUseProvidedAckNodeList ?
        {
          ...directPlanningSnapshot,
          requiredAckNodeIds: providedPlanningSnapshot.requiredAckNodeIds,
          acknowledgedNodeIds: Array.isArray(
            providedPlanningSnapshot.acknowledgedNodeIds,
          ) ?
            providedPlanningSnapshot.acknowledgedNodeIds :
            directPlanningSnapshot.acknowledgedNodeIds,
          pendingAckNodeIds: Array.isArray(
            providedPlanningSnapshot.pendingAckNodeIds,
          ) ?
            providedPlanningSnapshot.pendingAckNodeIds :
            directPlanningSnapshot.pendingAckNodeIds,
          pendingAckEvidenceState:
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
              .REQUIRED_ACK_NODE_LIST,
          publicationRecoveryGate: (() => {
            const gate = providedPlanningSnapshot.publicationRecoveryGate ||
              directPlanningSnapshot.publicationRecoveryGate ||
              {};
            const requiredAckIds = providedPlanningSnapshot.requiredAckNodeIds;
            const acknowledgedIds = Array.isArray(
              providedPlanningSnapshot.acknowledgedNodeIds,
            ) ?
              providedPlanningSnapshot.acknowledgedNodeIds :
              directPlanningSnapshot.acknowledgedNodeIds;
            const pendingAckIds = Array.isArray(
              providedPlanningSnapshot.pendingAckNodeIds,
            ) ?
              providedPlanningSnapshot.pendingAckNodeIds :
              directPlanningSnapshot.pendingAckNodeIds;
            return {
              ...gate,
              requiredAckNodeIds: requiredAckIds,
              acknowledgedNodeIds: acknowledgedIds,
              pendingAckNodeIds: pendingAckIds,
              pendingAckCount: providedPendingAckCount,
              pendingAckEvidenceState:
                PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
                  .REQUIRED_ACK_NODE_LIST,
              publicationOwnerStream: gate.publicationOwnerStream ? {
                ...gate.publicationOwnerStream,
                requiredAckNodeIds: requiredAckIds,
                acknowledgedNodeIds: acknowledgedIds,
                pendingAckNodeIds: pendingAckIds,
                pendingAckCount: providedPendingAckCount,
                pendingAckEvidenceState:
                  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
                    .REQUIRED_ACK_NODE_LIST,
              } : null,
            };
          })(),
        } :
        shouldUseProvidedCountOnlyAckDebt ?
          {
            ...directPlanningSnapshot,
            pendingAckCount: providedPendingAckCount,
            pendingAckEvidenceState:
              PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
            pendingAckNodeIds: Array.isArray(
              providedPlanningSnapshot.pendingAckNodeIds,
            ) ?
              providedPlanningSnapshot.pendingAckNodeIds :
              directPlanningSnapshot.pendingAckNodeIds,
            publicationRecoveryGate: (() => {
              const gate = directPlanningSnapshot.publicationRecoveryGate || {};
              const pendingAckIds = Array.isArray(
                providedPlanningSnapshot.pendingAckNodeIds,
              ) ?
                providedPlanningSnapshot.pendingAckNodeIds :
                directPlanningSnapshot.pendingAckNodeIds;
              return {
                ...gate,
                pendingAckCount: providedPendingAckCount,
                pendingAckEvidenceState:
                  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
                pendingAckNodeIds: pendingAckIds,
                publicationOwnerStream: gate.publicationOwnerStream ? {
                  ...gate.publicationOwnerStream,
                  pendingAckCount: providedPendingAckCount,
                  pendingAckEvidenceState:
                    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
                  pendingAckNodeIds: pendingAckIds,
                } : null,
              };
            })(),
          } :
          directPlanningSnapshot;
    const publicationConvergenceGateForMerge =
      publicationConvergenceForEvidence.publicationRecoveryGate ||
      directPlanningSnapshot.publicationRecoveryGate ||
      providedPlanningSnapshot.publicationRecoveryGate ||
      null;
    const shouldUseProvidedPriorityRecoveryDecisionSnapshots =
      this.shouldUseProvidedPriorityRecoveryDecisionSnapshotsForMembershipPublicationPlanningMerge(
        directPlanningSnapshot,
        providedPlanningSnapshot,
        publicationConvergenceGateForMerge,
      );
    const providedPriorityRecoveryObservation =
      shouldUseProvidedPriorityRecoveryDecisionSnapshots &&
      providedPlanningSnapshot.priorityRecoveryObservation &&
      typeof providedPlanningSnapshot.priorityRecoveryObservation ===
        TYPEOF.OBJECT ?
        providedPlanningSnapshot.priorityRecoveryObservation :
        null;
    const providedPriorityRecoveryDecisionSnapshots =
      shouldUseProvidedPriorityRecoveryDecisionSnapshots ?
        providedPlanningSnapshot.priorityRecoveryDecisionSnapshots || null :
        null;
    const publicationEvidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: publicationConvergenceForEvidence,
      publicationConvergenceGate:
        publicationConvergenceForEvidence.publicationRecoveryGate ||
        providedPlanningSnapshot.publicationRecoveryGate ||
        null,
      priorityRecoveryObservation: providedPriorityRecoveryObservation,
      priorityRecoveryDecisionSnapshots:
        preferDirectReadyGate ?
          null :
          providedPriorityRecoveryDecisionSnapshots,
      priorityRecoveryClosureWitness:
        preferDirectReadyGate ?
          directPlanningSnapshot.priorityRecoveryClosureWitness ||
            null :
          providedPlanningSnapshot.priorityRecoveryClosureWitness ||
        directPlanningSnapshot.priorityRecoveryClosureWitness ||
        null,
      priorityRecoveryInvariants:
        providedPlanningSnapshot.priorityRecoveryInvariants || null,
    });
    const diagnosticPublicationEvidence =
      preferDirectReadyGate ?
        buildCanonicalPublicationRecoveryEvidence({
          publicationConvergence: publicationConvergenceForEvidence,
          publicationConvergenceGate:
            publicationConvergenceForEvidence.publicationRecoveryGate ||
            providedPlanningSnapshot.publicationRecoveryGate ||
            null,
          priorityRecoveryObservation: providedPriorityRecoveryObservation,
          priorityRecoveryDecisionSnapshots:
            providedPriorityRecoveryDecisionSnapshots,
          priorityRecoveryClosureWitness:
            providedPlanningSnapshot.priorityRecoveryClosureWitness || null,
          priorityRecoveryInvariants:
            providedPlanningSnapshot.priorityRecoveryInvariants || null,
        }) :
        null;
    const publicationConvergenceGate =
      publicationEvidence.publicationConvergenceGate ||
      directPlanningSnapshot.publicationRecoveryGate ||
      providedPlanningSnapshot.publicationRecoveryGate ||
      null;
    const preferDirectPublicationStatus =
      this.shouldPreferDirectPublicationStatusForMembershipPublicationPlanningMerge(
        directPlanningSnapshot,
        providedPlanningSnapshot,
        publicationConvergenceGate,
      );
    const priorityRecoveryObservation =
      diagnosticPublicationEvidence?.priorityRecoveryObservation ||
      publicationEvidence.priorityRecoveryObservation ||
      null;
    return this.buildPriorityRecoveryPlanningProjection({
      ...providedPlanningSnapshot,
      ...directPlanningSnapshot,
      ...(shouldUseProvidedAckNodeList ?
        {
          requiredAckNodeIds: providedPlanningSnapshot.requiredAckNodeIds,
          acknowledgedNodeIds: Array.isArray(
            providedPlanningSnapshot.acknowledgedNodeIds,
          ) ?
            providedPlanningSnapshot.acknowledgedNodeIds :
            directPlanningSnapshot.acknowledgedNodeIds,
          pendingAckNodeIds: Array.isArray(
            providedPlanningSnapshot.pendingAckNodeIds,
          ) ?
            providedPlanningSnapshot.pendingAckNodeIds :
            directPlanningSnapshot.pendingAckNodeIds,
          pendingAckEvidenceState:
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
              .REQUIRED_ACK_NODE_LIST,
        } :
        {}),
      ...(shouldUseProvidedCountOnlyAckDebt ?
        {
          pendingAckCount: providedPendingAckCount,
          pendingAckEvidenceState:
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
          pendingAckNodeIds: Array.isArray(
            providedPlanningSnapshot.pendingAckNodeIds,
          ) ?
            providedPlanningSnapshot.pendingAckNodeIds :
            directPlanningSnapshot.pendingAckNodeIds,
        } :
        {}),
      priorityRecoveryDecisionSnapshots:
        preferDirectReadyGate ?
          null :
          providedPriorityRecoveryDecisionSnapshots,
      publicationRecoveryGate: publicationConvergenceGate,
      publicationEpoch:
        publicationConvergenceGate?.publicationEpoch ??
        directPlanningSnapshot.publicationEpoch ??
        providedPlanningSnapshot.publicationEpoch ??
        null,
      publicationStatus:
        preferDirectPublicationStatus ?
          directPlanningSnapshot.publicationStatus ??
            directPlanningSnapshot.status ??
            publicationConvergenceGate?.publicationStatus ??
            providedPlanningSnapshot.publicationStatus ??
            providedPlanningSnapshot.status ??
            null :
          publicationConvergenceGate?.publicationStatus ??
            directPlanningSnapshot.publicationStatus ??
            directPlanningSnapshot.status ??
            providedPlanningSnapshot.publicationStatus ??
            providedPlanningSnapshot.status ??
            null,
      publicationObservationState:
        preferDirectPublicationStatus ?
          directPlanningSnapshot.publicationObservationState ??
            publicationConvergenceGate?.publicationObservationState ??
            providedPlanningSnapshot.publicationObservationState ??
            null :
          publicationConvergenceGate?.publicationObservationState ??
            directPlanningSnapshot.publicationObservationState ??
            providedPlanningSnapshot.publicationObservationState ??
            null,
      pendingAckCount:
        publicationConvergenceGate?.pendingAckCount ??
        directPlanningSnapshot.pendingAckCount ??
        providedPlanningSnapshot.pendingAckCount ??
        NUM.ZERO,
      recoveryProtocolState:
        priorityRecoveryObservation?.recoveryProtocolState ??
        publicationConvergenceGate?.recoveryProtocolState ??
        directPlanningSnapshot.recoveryProtocolState ??
        providedPlanningSnapshot.recoveryProtocolState ??
        null,
      priorityRecoveryReasonCodes:
        priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
        publicationConvergenceGate?.reasonCodes ??
        directPlanningSnapshot.priorityRecoveryReasonCodes ??
        providedPlanningSnapshot.priorityRecoveryReasonCodes ??
        [],
      priorityPartitionSummary:
        priorityRecoveryObservation?.priorityPartitionSummary ??
        publicationConvergenceGate?.priorityPartitionSummary ??
        directPlanningSnapshot.priorityPartitionSummary ??
        providedPlanningSnapshot.priorityPartitionSummary ??
        null,
      priorityRecoveryClosureWitness:
        publicationConvergenceGate?.priorityRecoveryClosureWitness ??
        (preferDirectReadyGate ?
          directPlanningSnapshot.priorityRecoveryClosureWitness ||
            null :
          directPlanningSnapshot.priorityRecoveryClosureWitness ??
            providedPlanningSnapshot.priorityRecoveryClosureWitness ??
            null),
      diagnosticPriorityRecoveryClosureWitness:
        providedPlanningSnapshot.diagnosticPriorityRecoveryClosureWitness ||
        providedPlanningSnapshot.priorityRecoveryClosureWitness ||
        providedPlanningSnapshot.publicationRecoveryGate
          ?.priorityRecoveryClosureWitness ||
        null,
      diagnosticPriorityRecoveryReasonCodes:
        Array.isArray(
          providedPlanningSnapshot.diagnosticPriorityRecoveryReasonCodes,
        ) ?
          [...providedPlanningSnapshot.diagnosticPriorityRecoveryReasonCodes] :
          Array.isArray(providedPlanningSnapshot.priorityRecoveryReasonCodes) ?
            [...providedPlanningSnapshot.priorityRecoveryReasonCodes] :
            Array.isArray(providedPlanningSnapshot.publicationRecoveryGate
              ?.reasonCodes) ?
              [...providedPlanningSnapshot.publicationRecoveryGate.reasonCodes] :
              [],
      publicationRecoveryGate: publicationConvergenceGate,
      priorityRecoveryObservation,
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
    const planningSnapshot = await this.getMembershipPublicationPlanningSnapshotBestEffort(
      nodeId,
      observedAt,
    );
    return this.resolvePriorityRecoveryPlanningAnswer(
      nodeId,
      observedAt,
      this.resolveMembershipPublicationPlanningSnapshot({
        nodeId,
        observedAt,
        membershipPublication,
        membershipPublicationPlanningSnapshot: planningSnapshot,
      }),
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
    const planningSnapshot = this.getMembershipPublicationPlanningAnswerSync(
      nodeId,
      observedAt,
    );
    return this.resolvePriorityRecoveryPlanningAnswer(
      nodeId,
      observedAt,
      this.resolveMembershipPublicationPlanningSnapshot({
        nodeId,
        observedAt,
        membershipPublication,
        membershipPublicationPlanningSnapshot: planningSnapshot,
      }),
    );
  }

  buildMembershipPublicationReadOptions(readOptions = {}) {
    return resolveMembershipPublicationReadOptions({
      lane: resolveMembershipPublicationReadLane(readOptions?.lane),
      queryTimeoutMs:
        Number.isFinite(readOptions?.queryTimeoutMs) &&
        readOptions.queryTimeoutMs > NUM.ZERO ?
          readOptions.queryTimeoutMs :
          this.membershipPublicationDiagnosticsQueryTimeoutMs,
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
}

export {ControlPlaneReadinessServiceSegment4Stage3};
