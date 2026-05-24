import {classifyActiveGateClosureWitness} from
  './active-gate-closure-classification.js';
import {
  normalizePriorityRecoveryActiveGateSnapshot,
} from './active-gate-contract.js';
import {
  PUBLICATION_EVIDENCE_ACTIVE_GATE_BLOCKER_PREFIX,
  PUBLICATION_EVIDENCE_EMPTY_LIST,
  PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON,
  PUBLICATION_EVIDENCE_READY_BLOCKER,
  PUBLICATION_EVIDENCE_TEXT,
  PUBLICATION_EVIDENCE_ZERO,
  filterPublicationDerivedBlockers,
  hasOnlyGenericPublicationEpochGateReason,
  isPublicationMembershipGateReason,
  isPublicationMissingActiveGateReason,
  isPublicationPendingAckGateReason,
  isRecord,
  normalizeDistinctStringArray,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePublicationEpoch,
  resolveActiveGateProgressGateReasons,
  resolveCurrentPendingAckNodeIds,
  hasCurrentActiveGatePendingAckClosure,
  resolveOwnerReconcileHandoffMissingPublishedNodeIds,
  shouldClearStaleActiveGatePrioritySpreadClosure,
} from './publication-evidence-shared.js';
import {
  buildActiveGatePublicationMembershipEvidence,
  hasSteadyPublishedSelectedPublicationMembershipOpen,
  isClosedActiveGatePublicationMembershipState,
  resolveActiveGatePublicationMembershipState,
  resolveAuthoritativePublicationMembershipNodeIds,
  resolveEffectivePublicationMembershipNodeIds,
  resolveRelevantPublicationMembershipNodeIds,
  resolveSelectedMissingPublishedNodeIds,
  resolveSelectedPublicationMembershipNodeIds,
  resolveSelectedPublishedMembershipDeficitNodeIds,
} from './publication-evidence-membership-contract.js';

function buildCanonicalPriorityRecoveryProgressClasses(
  priorityRecoveryObservation = null,
  fallbackProgress = null,
) {
  const currentSummary =
    isRecord(priorityRecoveryObservation?.priorityRecoveryCurrentSummary) ?
      priorityRecoveryObservation.priorityRecoveryCurrentSummary :
      null;
  const fallbackProgressClasses = isRecord(
    fallbackProgress?.priorityRecoveryProgressClasses,
  ) ?
    fallbackProgress.priorityRecoveryProgressClasses :
    null;
  if (!isRecord(priorityRecoveryObservation) && !fallbackProgressClasses) {
    return null;
  }
  const unresolvedClassIds = normalizeDistinctStringArray(
    currentSummary?.unresolvedClassIds ??
      priorityRecoveryObservation?.priorityRecoveryProgressClassIds ??
      fallbackProgressClasses?.unresolvedClassIds ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
  const unresolvedSemanticStateIds = normalizeDistinctStringArray(
    currentSummary?.unresolvedSemanticStateIds ??
      priorityRecoveryObservation?.priorityRecoverySemanticStateIds ??
      fallbackProgressClasses?.unresolvedSemanticStateIds ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
  const blockedPartitionIds = normalizeDistinctStringArray(
    currentSummary?.blockedPartitionIds ??
      priorityRecoveryObservation?.priorityRecoveryBlockedPartitionIds ??
      fallbackProgressClasses?.blockedPartitionIds ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
  const partitionIdsByClass = {};
  const blockerPartitionIdsByReason = isRecord(
    currentSummary?.blockerPartitionIdsByReason,
  ) ?
    currentSummary.blockerPartitionIdsByReason :
    isRecord(
      priorityRecoveryObservation?.priorityRecoveryBlockerPartitionIdsByReason,
    ) ?
      priorityRecoveryObservation.priorityRecoveryBlockerPartitionIdsByReason :
      fallbackProgressClasses?.partitionIdsByClass;
  for (const [classId, partitionIds] of Object.entries(
    isRecord(blockerPartitionIdsByReason) ? blockerPartitionIdsByReason : {},
  )) {
    partitionIdsByClass[classId] = normalizeDistinctStringArray(partitionIds);
  }
  const partitionIdsBySemanticState = {};
  const semanticStatePartitions = isRecord(
    currentSummary?.partitionIdsBySemanticState,
  ) ?
    currentSummary.partitionIdsBySemanticState :
    isRecord(
      priorityRecoveryObservation?.priorityRecoveryPartitionIdsBySemanticState,
    ) ?
      priorityRecoveryObservation.priorityRecoveryPartitionIdsBySemanticState :
      fallbackProgressClasses?.partitionIdsBySemanticState;
  for (const [semanticStateId, partitionIds] of Object.entries(
    isRecord(semanticStatePartitions) ? semanticStatePartitions : {},
  )) {
    partitionIdsBySemanticState[semanticStateId] =
      normalizeDistinctStringArray(partitionIds);
  }
  return Object.freeze({
    partitionIdsByClass: Object.freeze(partitionIdsByClass),
    unresolvedClassIds,
    unresolvedClassCount:
      normalizeNonNegativeInteger(
        priorityRecoveryObservation?.priorityRecoveryProgressClassCount,
      ) ??
      unresolvedClassIds.length,
    partitionIdsBySemanticState: Object.freeze(partitionIdsBySemanticState),
    unresolvedSemanticStateIds,
    unresolvedSemanticStateCount:
      normalizeNonNegativeInteger(
        priorityRecoveryObservation?.priorityRecoverySemanticStateCount,
      ) ??
      unresolvedSemanticStateIds.length,
    blockedPartitionIds,
    blockedPartitionCount:
      normalizeNonNegativeInteger(
        priorityRecoveryObservation?.priorityRecoveryBlockedPartitionCount ??
          currentSummary?.blockedPartitionCount,
      ) ??
      blockedPartitionIds.length,
  });
}

function buildCanonicalPriorityRecoveryActiveGateProgress(
  progress = null,
  priorityRecoveryObservation = null,
  publicationConvergenceGate = null,
  rawPublicationConvergenceGate = null,
) {
  if (!isRecord(progress)) {
    return null;
  }
  const gateReasons = resolveActiveGateProgressGateReasons({
    publicationConvergenceGate,
    priorityRecoveryObservation,
    progress,
  });
  const priorityRecoveryProgressClasses =
    buildCanonicalPriorityRecoveryProgressClasses(
      priorityRecoveryObservation,
      progress,
    );
  const priorityPartitionSummary =
    priorityRecoveryObservation?.priorityPartitionSummary ??
    publicationConvergenceGate?.priorityPartitionSummary ??
    null;
  const progressPendingAckCount =
    normalizeNonNegativeInteger(progress?.pendingAckCount) ??
    PUBLICATION_EVIDENCE_ZERO;
  const publicationPendingAckCount =
    normalizeNonNegativeInteger(publicationConvergenceGate?.pendingAckCount) ??
    PUBLICATION_EVIDENCE_ZERO;
  const observationPendingAckCount =
    normalizeNonNegativeInteger(priorityRecoveryObservation?.pendingAckCount) ??
    PUBLICATION_EVIDENCE_ZERO;
  const pendingAckNodeIds = resolveCurrentPendingAckNodeIds({
    progress,
    priorityRecoveryObservation,
    publicationConvergence: rawPublicationConvergenceGate,
    publicationConvergenceGate,
  });
  const pendingAckCount = pendingAckNodeIds !== null ?
    pendingAckNodeIds.length :
    hasCurrentActiveGatePendingAckClosure(progress) === true ?
      PUBLICATION_EVIDENCE_ZERO :
      Math.max(
        progressPendingAckCount,
        publicationPendingAckCount,
        observationPendingAckCount,
      );
  const activeGatePublicationStatus =
    normalizeOptionalString(priorityRecoveryObservation?.publicationStatus) ||
    normalizeOptionalString(publicationConvergenceGate?.publicationStatus) ||
    normalizeOptionalString(progress?.publicationStatus);
  const activeGatePendingAckEvidenceState =
    publicationConvergenceGate?.pendingAckEvidenceState ??
    rawPublicationConvergenceGate?.pendingAckEvidenceState;
  const ownerReconcileNarrowedMissingPublishedNodeIds =
    resolveOwnerReconcileHandoffMissingPublishedNodeIds({
      activeGateProgress: progress,
      publicationStatus: activeGatePublicationStatus,
      pendingAckCount,
      pendingAckNodeIds: pendingAckNodeIds ?? PUBLICATION_EVIDENCE_EMPTY_LIST,
      pendingAckEvidenceState: activeGatePendingAckEvidenceState,
    });
  const ownerReconcileNarrowsActiveGateProgress =
    ownerReconcileNarrowedMissingPublishedNodeIds.length >
      PUBLICATION_EVIDENCE_ZERO;
  const publicationMembershipEvidence =
    buildActiveGatePublicationMembershipEvidence({
      progress,
      priorityRecoveryObservation,
      publicationConvergenceGate,
      rawPublicationConvergenceGate,
      pendingAckCount,
    });
  const authoritativePublicationMembershipNodeIds =
    resolveAuthoritativePublicationMembershipNodeIds({
      publicationConvergenceGate,
      rawPublicationConvergenceGate,
      requiredAckNodeIds:
        publicationConvergenceGate?.requiredAckNodeIds ??
        rawPublicationConvergenceGate?.requiredAckNodeIds ??
        PUBLICATION_EVIDENCE_EMPTY_LIST,
      acknowledgedNodeIds:
        publicationConvergenceGate?.acknowledgedNodeIds ??
        rawPublicationConvergenceGate?.acknowledgedNodeIds ??
        PUBLICATION_EVIDENCE_EMPTY_LIST,
      pendingAckNodeIds:
        pendingAckNodeIds ?? PUBLICATION_EVIDENCE_EMPTY_LIST,
    });
  const selectedPublicationMembershipNodeIds =
    ownerReconcileNarrowsActiveGateProgress ?
      normalizeDistinctStringArray([
        ...normalizeDistinctStringArray(progress.selectedPublishedActiveNodeIds),
        ...ownerReconcileNarrowedMissingPublishedNodeIds,
      ]) :
      resolveSelectedPublicationMembershipNodeIds(progress);
  const publicationMembershipState =
    resolveActiveGatePublicationMembershipState(publicationMembershipEvidence);
  const staleGenericPublicationMembershipClosed =
    publicationMembershipEvidence.stalePublicationClosure === true &&
    publicationMembershipEvidence.publicationStatusPublished === true &&
    publicationMembershipEvidence.pendingAckClosed === true &&
    hasOnlyGenericPublicationEpochGateReason(gateReasons) &&
    normalizeDistinctStringArray(gateReasons).some((reason) =>
      isPublicationMissingActiveGateReason(reason),
    ) !== true;
  const steadyPublishedSelectedPublicationMembershipOpen =
    hasSteadyPublishedSelectedPublicationMembershipOpen({
      publicationConvergence: rawPublicationConvergenceGate,
      publicationConvergenceGate,
      priorityRecoveryObservation,
      activeGateProgress: progress,
      pendingAckCount,
    });
  const effectivePublicationMembershipNodeIds =
    resolveEffectivePublicationMembershipNodeIds({
      authoritativePublicationMembershipNodeIds,
      selectedPublicationMembershipNodeIds,
      selectedPublicationMembershipOpen:
        isClosedActiveGatePublicationMembershipState(
          publicationMembershipState,
        ) !== true &&
        staleGenericPublicationMembershipClosed !== true &&
        (
          pendingAckCount > PUBLICATION_EVIDENCE_ZERO ||
          steadyPublishedSelectedPublicationMembershipOpen === true ||
          publicationConvergenceGate?.publicationPending === true ||
          rawPublicationConvergenceGate?.publicationPending === true
        ),
    });
  const currentSelectedSnapshotDisagreementNodeIds =
    ownerReconcileNarrowsActiveGateProgress ?
      ownerReconcileNarrowedMissingPublishedNodeIds :
      resolveSelectedPublishedMembershipDeficitNodeIds(progress);
  const currentSelectedPublicationMembershipDeficitNodeIds =
    resolveRelevantPublicationMembershipNodeIds(
      currentSelectedSnapshotDisagreementNodeIds,
      effectivePublicationMembershipNodeIds,
    );
  const currentSelectedPublicationMembershipDeficitOpen =
    currentSelectedPublicationMembershipDeficitNodeIds !== null &&
    currentSelectedPublicationMembershipDeficitNodeIds.length >
      PUBLICATION_EVIDENCE_ZERO;
  const publicationMembershipClosed =
    currentSelectedPublicationMembershipDeficitOpen !== true &&
    (
      publicationMembershipEvidence.currentPublicationGateClosed === true ||
      isClosedActiveGatePublicationMembershipState(publicationMembershipState) ||
      staleGenericPublicationMembershipClosed
    );
  const observedSelectedMissingPublishedNodeIds =
    ownerReconcileNarrowsActiveGateProgress ?
      ownerReconcileNarrowedMissingPublishedNodeIds :
      resolveSelectedMissingPublishedNodeIds(progress);
  const selectedMissingPublishedNodeIds =
    currentSelectedSnapshotDisagreementNodeIds !== null ?
      currentSelectedSnapshotDisagreementNodeIds :
      publicationMembershipClosed ?
        PUBLICATION_EVIDENCE_EMPTY_LIST :
        observedSelectedMissingPublishedNodeIds;
  const pendingAckFilteredGateReasons =
    pendingAckCount === PUBLICATION_EVIDENCE_ZERO ?
      gateReasons.filter((reason) =>
        isPublicationPendingAckGateReason(reason) !== true,
      ) :
      gateReasons;
  const canonicalGateReasons =
    publicationMembershipClosed ?
      pendingAckFilteredGateReasons.filter((reason) =>
        isPublicationMembershipGateReason(reason) !== true,
      ) :
      pendingAckFilteredGateReasons;
  const progressMissingPublishedCount =
    currentSelectedPublicationMembershipDeficitNodeIds !== null ?
      currentSelectedPublicationMembershipDeficitNodeIds.length :
      authoritativePublicationMembershipNodeIds.length >
        PUBLICATION_EVIDENCE_ZERO ?
        PUBLICATION_EVIDENCE_ZERO :
        normalizeNonNegativeInteger(progress?.missingPublishedCount) ??
        PUBLICATION_EVIDENCE_ZERO;
  const publicationMissingPublishedCount =
    publicationMembershipClosed ?
      PUBLICATION_EVIDENCE_ZERO :
      normalizeNonNegativeInteger(
        publicationConvergenceGate?.missingPublishedCount,
      ) ?? PUBLICATION_EVIDENCE_ZERO;
  const missingPublishedCount =
    currentSelectedPublicationMembershipDeficitNodeIds !== null ?
      currentSelectedPublicationMembershipDeficitNodeIds.length :
      Math.max(
        progressMissingPublishedCount,
        publicationMissingPublishedCount,
      );
  const prioritySpreadSatisfied =
    priorityPartitionSummary?.satisfied === true ?
      true :
      priorityPartitionSummary?.satisfied === false ?
        false :
        progress?.prioritySpreadSatisfied ?? null;
  const blockers = [
    ...filterPublicationDerivedBlockers(progress?.blockers),
    ...canonicalGateReasons.map((reason) =>
      PUBLICATION_EVIDENCE_ACTIVE_GATE_BLOCKER_PREFIX.PUBLICATION_GATE +
      reason,
    ),
    ...normalizeDistinctStringArray(
      priorityRecoveryProgressClasses?.unresolvedClassIds,
    ).map((classId) =>
      PUBLICATION_EVIDENCE_ACTIVE_GATE_BLOCKER_PREFIX
        .PRIORITY_RECOVERY_PROGRESS_CLASS + classId,
    ),
  ];
  const hasReadyShape =
    normalizeNonNegativeInteger(progress?.expectedNodeCount) !== null &&
    normalizeNonNegativeInteger(progress?.activeNodeCount) !== null &&
    progress.activeNodeCount === progress.expectedNodeCount &&
    progress.snapshotCoverageComplete === true &&
    canonicalGateReasons.length === PUBLICATION_EVIDENCE_ZERO &&
    pendingAckCount === PUBLICATION_EVIDENCE_ZERO &&
    missingPublishedCount === PUBLICATION_EVIDENCE_ZERO;
  if (
    blockers.length === PUBLICATION_EVIDENCE_ZERO &&
    hasReadyShape
  ) {
    blockers.push(PUBLICATION_EVIDENCE_READY_BLOCKER);
  }
  const inheritedClosureRecordId =
    normalizeOptionalString(priorityRecoveryObservation?.closureRecordId) ||
    normalizeOptionalString(publicationConvergenceGate?.closureRecordId) ||
    normalizeOptionalString(progress?.closureRecordId);
  const inheritedClosureWitnessClass =
    normalizeOptionalString(priorityRecoveryObservation?.closureWitnessClass) ||
    normalizeOptionalString(publicationConvergenceGate?.closureWitnessClass) ||
    normalizeOptionalString(progress?.closureWitnessClass);
  const clearStalePrioritySpreadClosure =
    shouldClearStaleActiveGatePrioritySpreadClosure({
      closureRecordId: inheritedClosureRecordId,
      closureWitnessClass: inheritedClosureWitnessClass,
      gateReasons: canonicalGateReasons,
      prioritySpreadSatisfied,
      snapshotCoverageComplete: progress?.snapshotCoverageComplete === true,
    });
  return Object.freeze({
    ...progress,
    publicationEpoch:
      normalizePublicationEpoch(priorityRecoveryObservation?.publicationEpoch) ??
      normalizePublicationEpoch(publicationConvergenceGate?.publicationEpoch) ??
      normalizePublicationEpoch(progress?.publicationEpoch),
    publicationStatus:
      normalizeOptionalString(priorityRecoveryObservation?.publicationStatus) ||
      normalizeOptionalString(publicationConvergenceGate?.publicationStatus) ||
      normalizeOptionalString(progress?.publicationStatus),
    recoveryProtocolState:
      normalizeOptionalString(priorityRecoveryObservation?.recoveryProtocolState) ||
      normalizeOptionalString(publicationConvergenceGate?.recoveryProtocolState) ||
      normalizeOptionalString(progress?.recoveryProtocolState),
    ...(pendingAckNodeIds !== null ? {pendingAckNodeIds} : {}),
    pendingAckCount,
    missingPublishedCount,
    ...(selectedMissingPublishedNodeIds !== null ?
      {selectedMissingPublishedNodeIds} :
      {}),
    gateReasonCount: canonicalGateReasons.length,
    gateReasons: canonicalGateReasons,
    prioritySpreadSatisfied,
    prioritySpreadGap:
      normalizeNonNegativeInteger(priorityPartitionSummary?.totalSpreadGap) ??
      normalizeNonNegativeInteger(priorityPartitionSummary?.largestSpreadGap) ??
      normalizeNonNegativeInteger(progress?.prioritySpreadGap) ??
      PUBLICATION_EVIDENCE_ZERO,
    priorityBlockedPartitionCount:
      normalizeNonNegativeInteger(
        priorityRecoveryObservation?.priorityRecoveryBlockedPartitionCount,
      ) ??
      normalizeNonNegativeInteger(priorityPartitionSummary?.blockedPartitionCount) ??
      normalizeNonNegativeInteger(progress?.priorityBlockedPartitionCount) ??
      PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryProgressClasses,
    priorityRecoveryUnresolvedClassCount:
      normalizeNonNegativeInteger(
        priorityRecoveryObservation?.priorityRecoveryProgressClassCount,
      ) ??
      normalizeNonNegativeInteger(
        progress?.priorityRecoveryUnresolvedClassCount,
      ) ??
      priorityRecoveryProgressClasses?.unresolvedClassCount ??
      PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryUnresolvedSemanticStateCount:
      normalizeNonNegativeInteger(
        priorityRecoveryObservation?.priorityRecoverySemanticStateCount,
      ) ??
      normalizeNonNegativeInteger(
        progress?.priorityRecoveryUnresolvedSemanticStateCount,
      ) ??
      priorityRecoveryProgressClasses?.unresolvedSemanticStateCount ??
      PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryBlockedPartitionCount:
      normalizeNonNegativeInteger(
        priorityRecoveryObservation?.priorityRecoveryBlockedPartitionCount,
      ) ??
      normalizeNonNegativeInteger(
        progress?.priorityRecoveryBlockedPartitionCount,
      ) ??
      priorityRecoveryProgressClasses?.blockedPartitionCount ??
      PUBLICATION_EVIDENCE_ZERO,
    closureRecordId:
      clearStalePrioritySpreadClosure === true ?
        null :
        inheritedClosureRecordId,
    closureWitnessClass:
      clearStalePrioritySpreadClosure === true ?
        null :
        inheritedClosureWitnessClass,
    blockers: Object.freeze(blockers),
    blockerSignature: blockers.join(PUBLICATION_EVIDENCE_TEXT.VALUE_SEPARATOR),
  });
}

function buildActiveGatePublicationContract(priorityRecoveryObservation = null) {
  const activeGateProgress = isRecord(
    priorityRecoveryObservation?.activeGate?.progress,
  ) ?
    priorityRecoveryObservation.activeGate.progress :
    isRecord(priorityRecoveryObservation?.activeGateProgress) ?
      priorityRecoveryObservation.activeGateProgress :
      null;
  if (!activeGateProgress) {
    return null;
  }
  return Object.freeze({
    publicationStatus:
      normalizeOptionalString(activeGateProgress.publicationStatus),
    recoveryProtocolState:
      normalizeOptionalString(activeGateProgress.recoveryProtocolState),
    gateReasons: normalizeDistinctStringArray(activeGateProgress.gateReasons),
    pendingAckCount:
      normalizeNonNegativeInteger(activeGateProgress.pendingAckCount) ??
      PUBLICATION_EVIDENCE_ZERO,
    missingPublishedCount:
      normalizeNonNegativeInteger(activeGateProgress.missingPublishedCount) ??
      PUBLICATION_EVIDENCE_ZERO,
    prioritySpreadSatisfied:
      activeGateProgress.prioritySpreadSatisfied === true ?
        true :
        activeGateProgress.prioritySpreadSatisfied === false ?
          false :
          null,
    priorityBlockedPartitionCount:
      normalizeNonNegativeInteger(
        activeGateProgress.priorityBlockedPartitionCount,
      ) ??
      PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryUnresolvedClassCount:
      normalizeNonNegativeInteger(
        activeGateProgress.priorityRecoveryUnresolvedClassCount,
      ) ??
      PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryUnresolvedSemanticStateCount:
      normalizeNonNegativeInteger(
        activeGateProgress.priorityRecoveryUnresolvedSemanticStateCount,
      ) ??
      PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryBlockedPartitionCount:
      normalizeNonNegativeInteger(
        activeGateProgress.priorityRecoveryBlockedPartitionCount,
      ) ??
      PUBLICATION_EVIDENCE_ZERO,
    closureRecordId:
      normalizeOptionalString(activeGateProgress.closureRecordId),
    closureWitnessClass:
      normalizeOptionalString(activeGateProgress.closureWitnessClass),
  });
}

function sameActiveGatePublicationContract(leftObservation, rightObservation) {
  const leftContract = buildActiveGatePublicationContract(leftObservation);
  const rightContract = buildActiveGatePublicationContract(rightObservation);
  const leftClosureRecordId =
    normalizeOptionalString(leftObservation?.closureRecordId);
  const rightClosureRecordId =
    normalizeOptionalString(rightObservation?.closureRecordId);
  const leftClosureWitnessClass =
    normalizeOptionalString(leftObservation?.closureWitnessClass);
  const rightClosureWitnessClass =
    normalizeOptionalString(rightObservation?.closureWitnessClass);
  if (leftClosureRecordId !== rightClosureRecordId ||
      leftClosureWitnessClass !== rightClosureWitnessClass) {
    return false;
  }
  if (!leftContract && !rightContract) {
    return true;
  }
  if (!leftContract || !rightContract) {
    return false;
  }
  return leftContract.publicationStatus === rightContract.publicationStatus &&
    leftContract.recoveryProtocolState === rightContract.recoveryProtocolState &&
    leftContract.pendingAckCount === rightContract.pendingAckCount &&
    leftContract.missingPublishedCount === rightContract.missingPublishedCount &&
    leftContract.prioritySpreadSatisfied ===
      rightContract.prioritySpreadSatisfied &&
    leftContract.priorityBlockedPartitionCount ===
      rightContract.priorityBlockedPartitionCount &&
    leftContract.priorityRecoveryUnresolvedClassCount ===
      rightContract.priorityRecoveryUnresolvedClassCount &&
    leftContract.priorityRecoveryUnresolvedSemanticStateCount ===
      rightContract.priorityRecoveryUnresolvedSemanticStateCount &&
    leftContract.priorityRecoveryBlockedPartitionCount ===
      rightContract.priorityRecoveryBlockedPartitionCount &&
    leftContract.closureRecordId === rightContract.closureRecordId &&
    leftContract.closureWitnessClass === rightContract.closureWitnessClass &&
    leftContract.gateReasons.length === rightContract.gateReasons.length &&
    leftContract.gateReasons.every((reason, index) =>
      reason === rightContract.gateReasons[index],
    );
}

function buildCanonicalPriorityRecoveryActiveGate(
  activeGate = null,
  priorityRecoveryObservation = null,
  publicationConvergenceGate = null,
  rawPublicationConvergenceGate = null,
) {
  if (!isRecord(activeGate)) {
    return null;
  }
  const priorityRecoveryObservationWithActiveGateClosure = Object.freeze({
    ...(isRecord(priorityRecoveryObservation) ? priorityRecoveryObservation : {}),
    closureRecordId:
      normalizeOptionalString(priorityRecoveryObservation?.closureRecordId) ||
      normalizeOptionalString(activeGate.closureRecordId),
    closureWitnessClass:
      normalizeOptionalString(priorityRecoveryObservation?.closureWitnessClass) ||
      normalizeOptionalString(activeGate.closureWitnessClass),
  });
  const canonicalProgress = buildCanonicalPriorityRecoveryActiveGateProgress(
    activeGate.progress,
    priorityRecoveryObservationWithActiveGateClosure,
    publicationConvergenceGate,
    rawPublicationConvergenceGate,
  );
  const canonicalBestProgress = buildCanonicalPriorityRecoveryActiveGateProgress(
    activeGate.bestProgress,
    priorityRecoveryObservationWithActiveGateClosure,
    publicationConvergenceGate,
    rawPublicationConvergenceGate,
  );
  const canonicalLastMeaningfulProgress =
    buildCanonicalPriorityRecoveryActiveGateProgress(
      activeGate.lastMeaningfulProgress,
      priorityRecoveryObservationWithActiveGateClosure,
      publicationConvergenceGate,
      rawPublicationConvergenceGate,
    );
  const activeGateClosureWitness = classifyActiveGateClosureWitness({
    progressSnapshot: canonicalProgress,
    bestProgressSnapshot: canonicalBestProgress,
    publicationConvergence: null,
    publicationConvergenceGate,
    readinessMode: activeGate?.mode || null,
  });
  const inheritedActiveGateClosureRecordId =
    normalizeOptionalString(activeGate.closureRecordId) ||
    normalizeOptionalString(
      priorityRecoveryObservationWithActiveGateClosure.closureRecordId,
    ) ||
    normalizeOptionalString(publicationConvergenceGate?.closureRecordId);
  const inheritedActiveGateClosureWitnessClass =
    normalizeOptionalString(activeGate.closureWitnessClass) ||
    normalizeOptionalString(
      priorityRecoveryObservationWithActiveGateClosure.closureWitnessClass,
    ) ||
    normalizeOptionalString(publicationConvergenceGate?.closureWitnessClass);
  const activeGateClosureProgress =
    canonicalProgress ||
    canonicalBestProgress ||
    canonicalLastMeaningfulProgress;
  const clearInheritedActiveGatePrioritySpreadClosure =
    shouldClearStaleActiveGatePrioritySpreadClosure({
      closureRecordId: inheritedActiveGateClosureRecordId,
      closureWitnessClass: inheritedActiveGateClosureWitnessClass,
      gateReasons: activeGateClosureProgress?.gateReasons,
      prioritySpreadSatisfied: activeGateClosureProgress?.prioritySpreadSatisfied,
      snapshotCoverageComplete:
        activeGateClosureProgress?.snapshotCoverageComplete === true,
    });
  return normalizePriorityRecoveryActiveGateSnapshot({
    activeGate: {
      ...activeGate,
      closureRecordId:
        normalizeOptionalString(activeGateClosureWitness?.closureRecordId) ||
        (
          clearInheritedActiveGatePrioritySpreadClosure === true ?
            null :
            inheritedActiveGateClosureRecordId
        ),
      closureWitnessClass:
        normalizeOptionalString(activeGateClosureWitness?.closureWitnessClass) ||
        (
          clearInheritedActiveGatePrioritySpreadClosure === true ?
            null :
            inheritedActiveGateClosureWitnessClass
        ),
      progress: canonicalProgress,
      bestProgress: canonicalBestProgress,
      lastMeaningfulProgress: canonicalLastMeaningfulProgress,
    },
  });
}


export {
  buildCanonicalPriorityRecoveryProgressClasses,
  buildCanonicalPriorityRecoveryActiveGateProgress,
  buildActiveGatePublicationContract,
  sameActiveGatePublicationContract,
  buildCanonicalPriorityRecoveryActiveGate,
};
