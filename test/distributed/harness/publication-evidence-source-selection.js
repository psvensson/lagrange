import {
  derivePriorityRecoveryActiveGateReportFields,
  normalizePriorityRecoveryActiveGateSnapshot,
} from './active-gate-contract.js';
import {
  PUBLICATION_EVIDENCE_CLOSED_PRIORITY_RECOVERY_CURRENT_SUMMARY,
  PUBLICATION_EVIDENCE_CLOSED_PRIORITY_RECOVERY_DECISION_SNAPSHOTS,
  PUBLICATION_EVIDENCE_EMPTY_LIST,
  PUBLICATION_EVIDENCE_EMPTY_RECORD,
  PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON,
  PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED,
  PUBLICATION_EVIDENCE_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED,
  PUBLICATION_EVIDENCE_SOURCE_SELECTION,
  PUBLICATION_EVIDENCE_TEXT,
  PUBLICATION_EVIDENCE_ZERO,
  filterPublicationDerivedBlockers,
  hasOnlyGenericPublicationEpochGateReason,
  isPublicationMissingActiveGateReason,
  isRecord,
  normalizeDistinctStringArray,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePositiveInteger,
  omitStalePublicationFields,
  resolveCurrentPendingAckNodeIds,
  resolveRawPublicationConvergenceGate,
  hasStaleGenericPublicationEpochClosure,
} from './publication-evidence-shared.js';

function hasProbeObservationGap(progress = null) {
  const snapshotCoverageNodeCount = normalizeNonNegativeInteger(
    progress?.snapshotCoverageNodeCount,
  ) ?? PUBLICATION_EVIDENCE_ZERO;
  return isRecord(progress) && (
    Boolean(normalizeOptionalString(progress.selectedSnapshotError)) ||
    Boolean(normalizeOptionalString(progress.selectedSnapshotReachabilityError)) ||
    (
      progress.snapshotCoverageComplete !== true &&
      snapshotCoverageNodeCount === PUBLICATION_EVIDENCE_ZERO
    )
  );
}

function hasClosedPublicationBestProgress(progress = null) {
  const publicationStatus = normalizeOptionalString(progress?.publicationStatus);
  const recoveryProtocolState = normalizeOptionalString(
    progress?.recoveryProtocolState,
  );
  const pendingAckCount =
    normalizeNonNegativeInteger(progress?.pendingAckCount) ??
    PUBLICATION_EVIDENCE_ZERO;
  const missingPublishedCount =
    normalizeNonNegativeInteger(progress?.missingPublishedCount) ??
    PUBLICATION_EVIDENCE_ZERO;
  const gateReasons = normalizeDistinctStringArray(progress?.gateReasons);
  const snapshotCoverageNodeCount = normalizePositiveInteger(
    progress?.snapshotCoverageNodeCount,
  );
  return isRecord(progress) &&
    publicationStatus === PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED &&
    pendingAckCount === PUBLICATION_EVIDENCE_ZERO &&
    missingPublishedCount === PUBLICATION_EVIDENCE_ZERO &&
    gateReasons.length === PUBLICATION_EVIDENCE_ZERO &&
    progress.snapshotCoverageComplete === true &&
    snapshotCoverageNodeCount !== null &&
    (
      progress.prioritySpreadSatisfied === true ||
      recoveryProtocolState ===
        PUBLICATION_EVIDENCE_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED
    );
}

function hasOpenPublicationEvidence({
  publicationConvergence = null,
  publicationConvergenceGate = null,
  priorityRecoveryObservation = null,
  priorityRecoveryDecisionSnapshots = null,
} = {}) {
  const currentPendingAckNodeIds = resolveCurrentPendingAckNodeIds({
    priorityRecoveryObservation,
    publicationConvergenceGate,
    publicationConvergence,
  });
  const pendingAckNodeIds =
    currentPendingAckNodeIds ?? normalizeDistinctStringArray(
      priorityRecoveryObservation?.pendingAckNodeIds ??
        publicationConvergenceGate?.pendingAckNodeIds ??
        publicationConvergence?.pendingAckNodeIds ??
        PUBLICATION_EVIDENCE_EMPTY_LIST,
    );
  const pendingAckCount = currentPendingAckNodeIds !== null ?
    pendingAckNodeIds.length :
    normalizeNonNegativeInteger(priorityRecoveryObservation?.pendingAckCount) ??
      normalizeNonNegativeInteger(publicationConvergenceGate?.pendingAckCount) ??
      normalizeNonNegativeInteger(publicationConvergence?.pendingAckCount) ??
      pendingAckNodeIds.length;
  const publicationStatus =
    normalizeOptionalString(priorityRecoveryObservation?.publicationStatus) ||
    normalizeOptionalString(publicationConvergenceGate?.publicationStatus) ||
    normalizeOptionalString(publicationConvergence?.publicationStatus) ||
    normalizeOptionalString(publicationConvergence?.status);
  const priorityPartitionSummary =
    priorityRecoveryObservation?.priorityPartitionSummary ??
    publicationConvergenceGate?.priorityPartitionSummary ??
    publicationConvergence?.priorityPartitionSummary ??
    null;
  const gateReasons = normalizeDistinctStringArray(
    publicationConvergenceGate?.reasonCodes ??
      publicationConvergenceGate?.reasons ??
      priorityRecoveryObservation?.publicationConvergenceGateReasons ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
      publicationConvergenceGate?.reasonCodes ??
      publicationConvergenceGate?.reasons ??
      publicationConvergence?.priorityRecoveryReasonCodes ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
  const staleGenericPublicationEpochClosure =
    hasStaleGenericPublicationEpochClosure({
      publicationStatus,
      pendingAckCount,
      gateReasons,
      priorityRecoveryObservation,
      publicationConvergenceGate,
    });
  const currentPriorityRecoveryReasonCodes =
    staleGenericPublicationEpochClosure === true ?
      priorityRecoveryReasonCodes.filter((reason) =>
        reason !==
          PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON
            .PUBLICATION_EPOCH_PENDING,
      ) :
      priorityRecoveryReasonCodes;
  const decisionPriorityPartitionSummary =
    priorityRecoveryDecisionSnapshots?.priorityPartitionSummary &&
    isRecord(priorityRecoveryDecisionSnapshots.priorityPartitionSummary) ?
      priorityRecoveryDecisionSnapshots.priorityPartitionSummary :
      null;
  const openEvidence = Object.freeze({
    pendingAckOpen: pendingAckCount > PUBLICATION_EVIDENCE_ZERO,
    publicationPending:
      staleGenericPublicationEpochClosure !== true &&
      (
        priorityRecoveryObservation?.publicationPending === true ||
      publicationConvergenceGate?.publicationPending === true ||
      publicationConvergence?.publicationPending === true
      ),
    publicationStatusOpen:
      Boolean(publicationStatus) &&
      publicationStatus !== PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED,
    prioritySpreadPending:
      priorityRecoveryObservation?.prioritySpreadPending === true ||
      publicationConvergenceGate?.prioritySpreadPending === true ||
      publicationConvergence?.prioritySpreadPending === true ||
      priorityPartitionSummary?.satisfied === false,
    gateReasonOpen:
      staleGenericPublicationEpochClosure !== true &&
      gateReasons.length > PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryReasonOpen:
      currentPriorityRecoveryReasonCodes.length > PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryDecisionOpen:
      decisionPriorityPartitionSummary?.satisfied === false,
  });
  return Object.values(openEvidence).some(Boolean);
}

function resolvePublicationEvidenceSourceSelection({
  activeGate = null,
  publicationConvergence = null,
  publicationConvergenceGate = null,
  priorityRecoveryObservation = null,
  priorityRecoveryDecisionSnapshots = null,
} = {}) {
  const evidence = Object.freeze({
    terminalProbeDegraded: hasProbeObservationGap(activeGate?.progress),
    bestProgressClosed: hasClosedPublicationBestProgress(
      activeGate?.bestProgress,
    ),
    observedPublicationOpen: hasOpenPublicationEvidence({
      publicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryObservation,
      priorityRecoveryDecisionSnapshots,
    }),
  });
  const state =
    evidence.terminalProbeDegraded &&
    evidence.bestProgressClosed &&
    evidence.observedPublicationOpen ?
      PUBLICATION_EVIDENCE_SOURCE_SELECTION.BEST_PROGRESS_CLOSED_PUBLICATION :
      PUBLICATION_EVIDENCE_SOURCE_SELECTION.OBSERVED;
  return Object.freeze({state, evidence});
}

function buildClosedPriorityPartitionSummary(baseSummary = null) {
  return Object.freeze({
    ...(isRecord(baseSummary) ? baseSummary : {}),
    satisfied: true,
    missingPartitionIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    blockedPartitions: PUBLICATION_EVIDENCE_EMPTY_LIST,
    blockedPartitionCount: PUBLICATION_EVIDENCE_ZERO,
    largestSpreadGap: PUBLICATION_EVIDENCE_ZERO,
    totalSpreadGap: PUBLICATION_EVIDENCE_ZERO,
  });
}

function buildClosedPublicationProgressProjection(
  progress = null,
  bestProgress = null,
  priorityPartitionSummary = null,
) {
  if (!isRecord(progress)) {
    return null;
  }
  const blockers = filterPublicationDerivedBlockers(progress.blockers);
  return Object.freeze({
    ...omitStalePublicationFields(progress),
    publicationStatus: bestProgress.publicationStatus,
    recoveryProtocolState: bestProgress.recoveryProtocolState,
    pendingAckCount: PUBLICATION_EVIDENCE_ZERO,
    missingPublishedCount: PUBLICATION_EVIDENCE_ZERO,
    gateReasonCount: PUBLICATION_EVIDENCE_ZERO,
    gateReasons: PUBLICATION_EVIDENCE_EMPTY_LIST,
    prioritySpreadSatisfied: true,
    prioritySpreadGap: PUBLICATION_EVIDENCE_ZERO,
    priorityBlockedPartitionCount: PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryProgressClasses:
      PUBLICATION_EVIDENCE_CLOSED_PRIORITY_RECOVERY_CURRENT_SUMMARY,
    priorityRecoveryUnresolvedClassCount: PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryUnresolvedSemanticStateCount: PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryBlockedPartitionCount: PUBLICATION_EVIDENCE_ZERO,
    priorityPartitionSummary,
    blockers,
    blockerSignature: blockers.join(PUBLICATION_EVIDENCE_TEXT.VALUE_SEPARATOR),
  });
}

function buildBestProgressPublicationClosedControlPlane(
  controlPlane = null,
  activeGate = null,
) {
  const bestProgress = activeGate?.bestProgress;
  const priorityPartitionSummary = buildClosedPriorityPartitionSummary(
    controlPlane?.priorityRecoveryObservation?.priorityPartitionSummary ??
      controlPlane?.publicationConvergenceGate?.priorityPartitionSummary ??
      controlPlane?.publicationConvergence?.priorityPartitionSummary ??
      null,
  );
  const activeGateProgress = buildClosedPublicationProgressProjection(
    activeGate?.progress,
    bestProgress,
    priorityPartitionSummary,
  );
  const projectedBestProgress = buildClosedPublicationProgressProjection(
    activeGate?.bestProgress,
    bestProgress,
    priorityPartitionSummary,
  );
  const projectedActiveGate = isRecord(activeGate) ?
    normalizePriorityRecoveryActiveGateSnapshot({
      activeGate: {
        ...omitStalePublicationFields(activeGate),
        progress: activeGateProgress || activeGate.progress,
        bestProgress: projectedBestProgress || activeGate.bestProgress,
      },
    }) :
    null;
  const activeGateFields = projectedActiveGate ?
    derivePriorityRecoveryActiveGateReportFields(projectedActiveGate) :
    {};
  const closedPublicationFields = Object.freeze({
    publicationStatus: bestProgress.publicationStatus,
    status: bestProgress.publicationStatus,
    recoveryProtocolState: bestProgress.recoveryProtocolState,
    priorityRecoveryReasonCodes: PUBLICATION_EVIDENCE_EMPTY_LIST,
    priorityPartitionSummary,
    pendingAckNodeIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    pendingAckCount: PUBLICATION_EVIDENCE_ZERO,
    missingPublishedNodeIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    missingPublishedCount: PUBLICATION_EVIDENCE_ZERO,
    publicationPending: false,
    prioritySpreadPending: false,
  });
  const publicationConvergence = Object.freeze({
    ...omitStalePublicationFields(controlPlane?.publicationConvergence),
    ...closedPublicationFields,
    publishedActiveNodeIds: normalizeDistinctStringArray(
      bestProgress.selectedPublishedActiveNodeIds ??
        controlPlane?.publicationConvergence?.publishedActiveNodeIds ??
        PUBLICATION_EVIDENCE_EMPTY_LIST,
    ),
  });
  const publicationConvergenceGate = Object.freeze({
    ...omitStalePublicationFields(
      resolveRawPublicationConvergenceGate(controlPlane),
    ),
    ...closedPublicationFields,
    ready: true,
    reasons: PUBLICATION_EVIDENCE_EMPTY_LIST,
    reasonCodes: PUBLICATION_EVIDENCE_EMPTY_LIST,
  });
  const priorityRecoveryObservation = Object.freeze({
    ...omitStalePublicationFields(controlPlane?.priorityRecoveryObservation),
    ...closedPublicationFields,
    publicationConvergenceGateReasons: PUBLICATION_EVIDENCE_EMPTY_LIST,
    priorityRecoveryCurrentSummary:
      PUBLICATION_EVIDENCE_CLOSED_PRIORITY_RECOVERY_CURRENT_SUMMARY,
    priorityRecoveryProgressClassIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    priorityRecoveryProgressClassCount: PUBLICATION_EVIDENCE_ZERO,
    priorityRecoverySemanticStateIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    priorityRecoverySemanticStateCount: PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryBlockedPartitionIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    priorityRecoveryBlockedPartitionCount: PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryUnresolvedPartitionIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    priorityRecoveryUnresolvedPartitionCount: PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryBlockerPartitionIdsByReason:
      PUBLICATION_EVIDENCE_EMPTY_RECORD,
    priorityRecoveryPartitionIdsBySemanticState:
      PUBLICATION_EVIDENCE_EMPTY_RECORD,
    priorityRecoveryPartitionBlockerHistory:
      PUBLICATION_EVIDENCE_EMPTY_LIST,
    ...(activeGateFields.activeGateProgress ?
      {activeGateProgress: activeGateFields.activeGateProgress} :
      {}),
  });
  return {
    ...controlPlane,
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
    priorityRecoveryDecisionSnapshots:
      PUBLICATION_EVIDENCE_CLOSED_PRIORITY_RECOVERY_DECISION_SNAPSHOTS,
    ...(projectedActiveGate ? {activeGate: projectedActiveGate} : {}),
    ...(activeGateFields.activeGateProgress ?
      {activeGateProgress: activeGateFields.activeGateProgress} :
      {}),
    ...(activeGateFields.activeGateAdmissionState ?
      {activeGateAdmissionState: activeGateFields.activeGateAdmissionState} :
      {}),
  };
}

function buildPublicationEvidenceControlPlane(controlPlane = null) {
  const activeGate = normalizePriorityRecoveryActiveGateSnapshot({
    activeGate:
      controlPlane?.activeGate ||
      controlPlane?.priorityRecoveryObservation?.activeGate ||
      null,
    activeGateProgress:
      controlPlane?.activeGateProgress ||
      controlPlane?.priorityRecoveryObservation?.activeGateProgress ||
      null,
    activeGateAdmissionState:
      controlPlane?.activeGateAdmissionState ||
      controlPlane?.priorityRecoveryObservation?.activeGateAdmissionState ||
      null,
  });
  const sourceSelection = resolvePublicationEvidenceSourceSelection({
    activeGate,
    publicationConvergence: controlPlane?.publicationConvergence || null,
    publicationConvergenceGate: resolveRawPublicationConvergenceGate(
      controlPlane,
    ),
    priorityRecoveryObservation:
      controlPlane?.priorityRecoveryObservation || null,
    priorityRecoveryDecisionSnapshots:
      controlPlane?.priorityRecoveryDecisionSnapshots || null,
  });
  return sourceSelection.state ===
    PUBLICATION_EVIDENCE_SOURCE_SELECTION.BEST_PROGRESS_CLOSED_PUBLICATION ?
    buildBestProgressPublicationClosedControlPlane(controlPlane, activeGate) :
    controlPlane;
}


export {
  buildPublicationEvidenceControlPlane,
};
