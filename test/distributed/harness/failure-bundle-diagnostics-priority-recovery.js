import * as foundation from './failure-bundle-diagnostics-foundation.js';

const {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  EDGE_ID,
  EMPTY_STRING,
  FAILURE_ARTIFACT_OWNER_CONTRACT_ACTIONABLE_STATES,
  FAILURE_ARTIFACT_OWNER_CONTRACT_EMPTY_SUMMARY,
  ONE,
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WITNESS_FRESHNESS_KEY_SEPARATOR,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_ACTUATION_STATES,
  REASON,
  RECOVERY_PROTOCOL_STATE,
  buildTopologyConvergenceGraphFromArtifacts,
  buildTopologyConvergenceOwnerPresentation,
  normalizePriorityRecoveryPartitionWitnessesForDiagnostics,
} = Object.assign({}, foundation);
const {
  FAILURE_CLASS_UNKNOWN,
  ROOT_CAUSE_CLASS_UNKNOWN,
  UNKNOWN_VALUE,
  ZERO,
  addNormalizedReasonCount,
  buildDominantReason,
  buildTopReasonCounts,
  isRecord,
  normalizeDistinctStringArray,
  normalizeNonNegativeCount,
} = foundation;

export function hasPrioritySpreadReasonCode(...reasonLists) {
  return reasonLists
    .flatMap((reasonList) => normalizeDistinctStringArray(reasonList))
    .includes(PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD);
}

export function isPrioritySpreadSummarySatisfied(summary) {
  return isRecord(summary) && summary.satisfied === true;
}

export function hasSatisfiedPrioritySpreadEvidence({
  decisionClosureWitness,
  publicationConvergence,
  publicationConvergenceGate,
  priorityRecoveryObservation,
}) {
  return (
    decisionClosureWitness?.prioritySpreadPending === false ||
    isPrioritySpreadSummarySatisfied(
      decisionClosureWitness?.refreshedPriorityPartitionSummary,
    ) ||
    isPrioritySpreadSummarySatisfied(
      priorityRecoveryObservation?.priorityPartitionSummary,
    ) ||
    isPrioritySpreadSummarySatisfied(
      publicationConvergenceGate?.priorityPartitionSummary,
    ) ||
    isPrioritySpreadSummarySatisfied(
      publicationConvergence?.priorityPartitionSummary,
    )
  );
}

export function hasCompletePriorityRecoveryOperationEvidence(
  priorityRecoveryPartitionWitnesses,
) {
  const witnesses = Array.isArray(priorityRecoveryPartitionWitnesses) ?
    priorityRecoveryPartitionWitnesses :
    [];
  return (
    witnesses.length > ZERO &&
    witnesses.every(
      (witness) =>
        normalizeDistinctStringArray(witness?.operationIds).length > ZERO,
    )
  );
}

export function hasActivePrioritySpreadGate({
  decisionClosureWitness,
  publicationConvergence,
  publicationConvergenceGate,
  priorityRecoveryObservation,
  priorityRecoveryPartitionWitnesses,
}) {
  if (
    hasSatisfiedPrioritySpreadEvidence({
      decisionClosureWitness,
      publicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryObservation,
    })
  ) {
    return false;
  }
  if (
    hasCompletePriorityRecoveryOperationEvidence(
      priorityRecoveryPartitionWitnesses,
    )
  ) {
    return false;
  }
  return (
    priorityRecoveryObservation?.prioritySpreadPending === true ||
    publicationConvergenceGate?.prioritySpreadPending === true ||
    publicationConvergence?.prioritySpreadPending === true ||
    priorityRecoveryObservation?.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING ||
    publicationConvergenceGate?.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING ||
    publicationConvergence?.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING ||
    hasPrioritySpreadReasonCode(
      priorityRecoveryObservation?.priorityRecoveryReasonCodes,
      publicationConvergenceGate?.reasonCodes,
      publicationConvergenceGate?.reasons,
      publicationConvergence?.priorityRecoveryReasonCodes,
    )
  );
}

export function buildPriorityRecoveryActuationWitnessEvidence(witness) {
  const progressClassIds = normalizeDistinctStringArray([
    ...(Array.isArray(witness?.progressClassIds) ?
      witness.progressClassIds :
      []),
    ...(Array.isArray(witness?.blockerReasonCodes) ?
      witness.blockerReasonCodes :
      []),
    ...(Array.isArray(witness?.blockerReasons) ?
      witness.blockerReasons :
      []),
  ]);
  const semanticStateIds = normalizeDistinctStringArray([
    witness?.semanticStateId,
    witness?.semanticState,
  ]);
  const ownerIds = normalizeDistinctStringArray([
    witness?.currentOwner,
    witness?.actuationOwner,
    witness?.owner,
  ]);
  return Object.freeze({
    progressClass:
      progressClassIds.includes(
        PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
      ),
    semanticState:
      semanticStateIds.includes(
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
      ),
    owner:
      ownerIds.includes(PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER),
    boundary:
      witness?.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
    nextAction:
      witness?.nextRequiredAction ===
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
    operationWorkflowProgress:
      ownerIds.includes(
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      ) &&
      witness?.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
      witness?.nextRequiredAction ===
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS &&
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_ACTUATION_STATES.includes(
        witness?.actuationState,
      ),
    actuationState:
      witness?.actuationState ===
        PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
  });
}

export function buildActiveGatePriorityRecoveryActuationEvidence({
  priorityRecoveryObservation = null,
  priorityRecoveryPartitionWitnesses = [],
  activeGateProgressClasses = null,
} = {}) {
  const observationProgressClassIds = normalizeDistinctStringArray(
    priorityRecoveryObservation?.priorityRecoveryProgressClassIds,
  );
  const activeGateProgressClassIds = normalizeDistinctStringArray(
    activeGateProgressClasses?.unresolvedClassIds,
  );
  const observationSemanticStateIds = normalizeDistinctStringArray(
    priorityRecoveryObservation?.priorityRecoverySemanticStateIds,
  );
  const activeGateSemanticStateIds = normalizeDistinctStringArray(
    activeGateProgressClasses?.unresolvedSemanticStateIds,
  );
  const witnessEvidence = (
    Array.isArray(priorityRecoveryPartitionWitnesses) ?
      priorityRecoveryPartitionWitnesses :
      []
  ).map(buildPriorityRecoveryActuationWitnessEvidence);
  const witnessProgressClass = witnessEvidence.some(
    (witness) => witness.progressClass === true,
  );
  const witnessOperationWorkflowProgress = witnessEvidence.some(
    (witness) => witness.operationWorkflowProgress === true,
  );
  const witnessOperationCreationRequired = witnessEvidence.some(
    (witness) =>
      witness.progressClass === true &&
      witness.semanticState === true &&
      witness.owner === true &&
      witness.boundary === true &&
      witness.nextAction === true &&
      witness.actuationState === true,
  );
  return Object.freeze({
    progressClassIds:
      observationProgressClassIds.includes(
        PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
      ) ||
      activeGateProgressClassIds.includes(
        PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
      ) ||
      witnessEvidence.some((witness) => witness.progressClass),
    semanticStateIds:
      observationSemanticStateIds.includes(
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
      ) ||
      activeGateSemanticStateIds.includes(
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
      ) ||
      witnessEvidence.some((witness) => witness.semanticState),
    activeGateClassContract:
      activeGateProgressClassIds.length > ZERO &&
      activeGateSemanticStateIds.length > ZERO,
    witnessOperationCreationRequired:
      witnessEvidence.some((witness) =>
        witness.progressClass === true &&
        witness.semanticState === true &&
        witness.owner === true &&
        witness.boundary === true &&
        witness.nextAction === true &&
        witness.actuationState === true,
      ),
    witnessOperationWorkflowProgress,
    witnessProgressClass,
    isOpen:
      (activeGateProgressClassIds.length > ZERO &&
        activeGateSemanticStateIds.length > ZERO) ||
      witnessProgressClass ||
      witnessOperationCreationRequired ||
      witnessOperationWorkflowProgress,
  });
}

export function hasActiveGatePriorityRecoveryActuationEvidence(input) {
  const evidence = buildActiveGatePriorityRecoveryActuationEvidence(input);
  return evidence.isOpen === true;
}

export function resolvePriorityRecoveryObservationList(primaryValues, fallbackValues) {
  const primaryList = normalizeDistinctStringArray(primaryValues);
  return primaryList.length > ZERO ?
    primaryList :
    normalizeDistinctStringArray(fallbackValues);
}

export function priorityRecoveryPartitionMapHasEntries(partitionMap) {
  return (
    isRecord(partitionMap) &&
    Object.values(partitionMap).some(
      (partitionIds) =>
        normalizeDistinctStringArray(partitionIds).length > ZERO,
    )
  );
}

export function resolvePriorityRecoveryObservationMap(primaryMap, fallbackMap) {
  if (priorityRecoveryPartitionMapHasEntries(primaryMap)) {
    return primaryMap;
  }
  return isRecord(fallbackMap) ? fallbackMap : {};
}

export function resolvePriorityRecoveryObservationCount(primaryCount, fallbackCount) {
  const primary = normalizeNonNegativeCount(primaryCount);
  return primary > ZERO ? primary : normalizeNonNegativeCount(fallbackCount);
}

export function resolvePriorityRecoveryReasonCodes(primaryCodes, fallbackCodes) {
  const normalizedPrimaryCodes = normalizeDistinctStringArray(primaryCodes);
  const normalizedFallbackCodes = normalizeDistinctStringArray(fallbackCodes);
  const fallbackHasPrioritySpreadReason = normalizedFallbackCodes.includes(
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
  );
  const primaryOnlyHasEvidenceUnavailable =
    normalizedPrimaryCodes.length === ONE &&
    normalizedPrimaryCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON
        .PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
    );
  if (fallbackHasPrioritySpreadReason && primaryOnlyHasEvidenceUnavailable) {
    return normalizedFallbackCodes;
  }
  return normalizedPrimaryCodes.length > ZERO ?
    normalizedPrimaryCodes :
    normalizedFallbackCodes;
}

export function dedupePriorityRecoveryObservationWitnesses(witnesses) {
  const witnessByKey = new Map();
  for (const witness of witnesses) {
    const witnessKey = JSON.stringify(witness);
    if (!witnessByKey.has(witnessKey)) {
      witnessByKey.set(witnessKey, witness);
    }
  }
  return [...witnessByKey.values()];
}

export function buildPriorityRecoveryWitnessFreshnessKey(witness) {
  const operationIds = normalizeDistinctStringArray(witness?.operationIds)
    .sort();
  if (operationIds.length > ZERO) {
    return operationIds.join(PRIORITY_RECOVERY_WITNESS_FRESHNESS_KEY_SEPARATOR);
  }
  const correlationKey = String(witness?.correlationKey || EMPTY_STRING).trim();
  return correlationKey.length > ZERO ? correlationKey : EMPTY_STRING;
}

export function resolvePriorityRecoveryWitnessFreshnessAtMs(witness) {
  const lastProgressAtMs = normalizeNonNegativeCount(witness?.lastProgressAtMs);
  if (lastProgressAtMs > ZERO) {
    return lastProgressAtMs;
  }
  const snapshotCapturedAt = normalizeNonNegativeCount(
    witness?.snapshotCapturedAt,
  );
  return snapshotCapturedAt > ZERO ? snapshotCapturedAt : null;
}

export function resolveFreshRetainedPriorityRecoveryObservationWitnesses(
  canonicalWitnesses,
  sourceWitnesses,
) {
  const canonical = normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
    canonicalWitnesses,
  );
  const canonicalFreshnessByKey = new Map();
  for (const canonicalWitness of canonical) {
    const freshnessKey = buildPriorityRecoveryWitnessFreshnessKey(
      canonicalWitness,
    );
    if (freshnessKey.length === ZERO) {
      continue;
    }
    canonicalFreshnessByKey.set(
      freshnessKey,
      resolvePriorityRecoveryWitnessFreshnessAtMs(canonicalWitness),
    );
  }
  const retainedSourceWitnesses =
    normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
      sourceWitnesses,
    ).filter((sourceWitness) => {
      const freshnessKey = buildPriorityRecoveryWitnessFreshnessKey(
        sourceWitness,
      );
      if (!canonicalFreshnessByKey.has(freshnessKey)) {
        return false;
      }
      const sourceFreshnessAtMs =
        resolvePriorityRecoveryWitnessFreshnessAtMs(sourceWitness);
      const canonicalFreshnessAtMs = canonicalFreshnessByKey.get(freshnessKey);
      return (
        sourceFreshnessAtMs !== null &&
        (
          canonicalFreshnessAtMs === null ||
          sourceFreshnessAtMs > canonicalFreshnessAtMs
        )
      );
    });
  return dedupePriorityRecoveryObservationWitnesses([
    ...canonical,
    ...retainedSourceWitnesses,
  ]);
}

export function resolvePriorityRecoveryObservationWitnesses(
  primaryWitnesses,
  fallbackWitnesses,
) {
  const primary = normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
    primaryWitnesses,
  );
  const fallback = normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
    fallbackWitnesses,
  );
  return [
    ...dedupePriorityRecoveryObservationWitnesses([
      ...primary,
      ...fallback,
    ]),
  ];
}

export function hasPriorityRecoveryOperationDetail(observation) {
  return (
    normalizeDistinctStringArray(
      observation?.priorityRecoveryProgressClassIds,
    ).length > ZERO ||
    normalizeDistinctStringArray(
      observation?.priorityRecoverySemanticStateIds,
    ).length > ZERO ||
    normalizeDistinctStringArray(
      observation?.priorityRecoveryUnresolvedPartitionIds,
    ).length > ZERO ||
    priorityRecoveryPartitionMapHasEntries(
      observation?.priorityRecoveryBlockerPartitionIdsByReason,
    ) ||
    priorityRecoveryPartitionMapHasEntries(
      observation?.priorityRecoveryPartitionIdsBySemanticState,
    ) ||
    normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
      observation?.priorityRecoveryPartitionWitnesses,
    ).length > ZERO
  );
}

export function normalizeOwnerContractPresentation(ownerPresentation) {
  const dominantWitness = ownerPresentation?.dominantWitness;
  if (!Array.isArray(dominantWitness?.reasons)) {
    return ownerPresentation;
  }
  const reasons = dominantWitness.reasons;
  const hasSnapshotCoverageTimeout =
    reasons.includes(REASON.ACTIVE_GATE_TIMED_OUT) &&
    reasons.includes(REASON.SNAPSHOT_COVERAGE_INCOMPLETE);
  if (!hasSnapshotCoverageTimeout) {
    return ownerPresentation;
  }
  return {
    ...ownerPresentation,
    dominantWitness: {
      ...dominantWitness,
      reasons: reasons.filter(
        (reason) => reason !== REASON.SELECTED_SNAPSHOT_SOURCE_TIMEOUT,
      ),
    },
  };
}

export function shouldMergeRetainedPriorityRecoveryObservation(
  canonicalObservation,
  sourceObservation,
) {
  if (!isRecord(sourceObservation)) {
    return false;
  }
  if (!isRecord(canonicalObservation)) {
    return true;
  }
  if (
    canonicalObservation.publicationPending !== true &&
    canonicalObservation.prioritySpreadPending !== true
  ) {
    return false;
  }
  return hasPriorityRecoveryOperationDetail(canonicalObservation) !== true;
}

export function mergeRetainedPriorityRecoveryObservation(
  canonicalObservation,
  sourceObservation,
) {
  const hasCanonicalObservation = isRecord(canonicalObservation);
  const hasSourceObservation = isRecord(sourceObservation);
  if (!hasSourceObservation) {
    return hasCanonicalObservation ? canonicalObservation : null;
  }
  if (!hasCanonicalObservation) {
    return sourceObservation;
  }
  if (
    shouldMergeRetainedPriorityRecoveryObservation(
      canonicalObservation,
      sourceObservation,
    ) !== true
  ) {
    const retainedWitnesses =
      resolveFreshRetainedPriorityRecoveryObservationWitnesses(
        canonicalObservation.priorityRecoveryPartitionWitnesses,
        sourceObservation.priorityRecoveryPartitionWitnesses,
      );
    const reasonMergedObservation = {
      ...canonicalObservation,
      rawActiveGateProgress:
        canonicalObservation.rawActiveGateProgress ||
        sourceObservation.rawActiveGateProgress ||
        sourceObservation.activeGate?.progress ||
        sourceObservation.activeGateProgress ||
        null,
      priorityRecoveryReasonCodes: resolvePriorityRecoveryReasonCodes(
        canonicalObservation.priorityRecoveryReasonCodes,
        sourceObservation.priorityRecoveryReasonCodes,
      ),
      publicationConvergenceGateReasons: resolvePriorityRecoveryReasonCodes(
        canonicalObservation.publicationConvergenceGateReasons,
        sourceObservation.publicationConvergenceGateReasons,
      ),
      missingPublishedNodeIds: resolvePriorityRecoveryObservationList(
        canonicalObservation.missingPublishedNodeIds,
        sourceObservation.missingPublishedNodeIds,
      ),
      missingPublishedCount: resolvePriorityRecoveryObservationCount(
        canonicalObservation.missingPublishedCount,
        sourceObservation.missingPublishedCount,
      ),
    };
    return retainedWitnesses.length > ZERO ?
      {
        ...reasonMergedObservation,
        priorityRecoveryPartitionWitnesses: retainedWitnesses,
      } :
      reasonMergedObservation;
  }
  return {
    ...canonicalObservation,
    priorityRecoveryProgressClassIds:
      resolvePriorityRecoveryObservationList(
        canonicalObservation.priorityRecoveryProgressClassIds,
        sourceObservation.priorityRecoveryProgressClassIds,
      ),
    priorityRecoveryProgressClassCount:
      resolvePriorityRecoveryObservationCount(
        canonicalObservation.priorityRecoveryProgressClassCount,
        sourceObservation.priorityRecoveryProgressClassCount,
      ),
    priorityRecoverySemanticStateIds:
      resolvePriorityRecoveryObservationList(
        canonicalObservation.priorityRecoverySemanticStateIds,
        sourceObservation.priorityRecoverySemanticStateIds,
      ),
    priorityRecoverySemanticStateCount:
      resolvePriorityRecoveryObservationCount(
        canonicalObservation.priorityRecoverySemanticStateCount,
        sourceObservation.priorityRecoverySemanticStateCount,
      ),
    priorityRecoveryReasonCodes: resolvePriorityRecoveryReasonCodes(
      canonicalObservation.priorityRecoveryReasonCodes,
      sourceObservation.priorityRecoveryReasonCodes,
    ),
    rawActiveGateProgress:
      canonicalObservation.rawActiveGateProgress ||
      sourceObservation.rawActiveGateProgress ||
      sourceObservation.activeGate?.progress ||
      sourceObservation.activeGateProgress ||
      null,
    missingPublishedNodeIds: resolvePriorityRecoveryObservationList(
      canonicalObservation.missingPublishedNodeIds,
      sourceObservation.missingPublishedNodeIds,
    ),
    missingPublishedCount: resolvePriorityRecoveryObservationCount(
      canonicalObservation.missingPublishedCount,
      sourceObservation.missingPublishedCount,
    ),
    publicationConvergenceGateReasons: resolvePriorityRecoveryReasonCodes(
      canonicalObservation.publicationConvergenceGateReasons,
      sourceObservation.publicationConvergenceGateReasons,
    ),
    priorityRecoveryBlockedPartitionIds:
      resolvePriorityRecoveryObservationList(
        canonicalObservation.priorityRecoveryBlockedPartitionIds,
        sourceObservation.priorityRecoveryBlockedPartitionIds,
      ),
    priorityRecoveryBlockedPartitionCount:
      resolvePriorityRecoveryObservationCount(
        canonicalObservation.priorityRecoveryBlockedPartitionCount,
        sourceObservation.priorityRecoveryBlockedPartitionCount,
      ),
    priorityRecoveryUnresolvedPartitionIds:
      resolvePriorityRecoveryObservationList(
        canonicalObservation.priorityRecoveryUnresolvedPartitionIds,
        sourceObservation.priorityRecoveryUnresolvedPartitionIds,
      ),
    priorityRecoveryUnresolvedPartitionCount:
      resolvePriorityRecoveryObservationCount(
        canonicalObservation.priorityRecoveryUnresolvedPartitionCount,
        sourceObservation.priorityRecoveryUnresolvedPartitionCount,
      ),
    priorityRecoveryBlockerPartitionIdsByReason:
      resolvePriorityRecoveryObservationMap(
        canonicalObservation.priorityRecoveryBlockerPartitionIdsByReason,
        sourceObservation.priorityRecoveryBlockerPartitionIdsByReason,
      ),
    priorityRecoveryPartitionIdsBySemanticState:
      resolvePriorityRecoveryObservationMap(
        canonicalObservation.priorityRecoveryPartitionIdsBySemanticState,
        sourceObservation.priorityRecoveryPartitionIdsBySemanticState,
      ),
    priorityRecoveryPartitionWitnesses:
      resolvePriorityRecoveryObservationWitnesses(
        canonicalObservation.priorityRecoveryPartitionWitnesses,
        sourceObservation.priorityRecoveryPartitionWitnesses,
      ),
  };
}

export function buildFailureArtifactOwnerContractPresentation({
  entry,
  existingFailure,
  publicationConvergence,
  reasonCounts,
  progressDominantReason,
}) {
  if (!isRecord(publicationConvergence)) {
    return null;
  }
  const summary = {
    ...FAILURE_ARTIFACT_OWNER_CONTRACT_EMPTY_SUMMARY,
    dominantReason:
      progressDominantReason ||
      existingFailure?.dominantReason ||
      buildDominantReason(reasonCounts) ||
      UNKNOWN_VALUE,
    failureClass:
      existingFailure?.failureClass ||
      FAILURE_CLASS_UNKNOWN,
    topReasons: buildTopReasonCounts(reasonCounts),
  };
  const graph = buildTopologyConvergenceGraphFromArtifacts({
    failureBundle: {
      scenario: entry?.scenario || UNKNOWN_VALUE,
      summary,
      publicationConvergence,
    },
  });
  const ownerPresentation = normalizeOwnerContractPresentation(
    buildTopologyConvergenceOwnerPresentation(graph),
  );
  return hasActionableOwnerContractWitness(
    ownerPresentation.dominantWitness,
  ) ?
    ownerPresentation :
    null;
}

export function hasActionableOwnerContractWitness(witness) {
  return (
    isRecord(witness) &&
    FAILURE_ARTIFACT_OWNER_CONTRACT_ACTIONABLE_STATES.has(witness.state)
  );
}

export function resolveOwnerContractDominantReason(ownerContractPresentation) {
  if (isPendingAckOwnerContractWitness(ownerContractPresentation) !== true) {
    return null;
  }
  return REASON.PENDING_ACKS;
}

export function resolveOwnerContractRootCauseClass(ownerContractPresentation) {
  if (isPendingAckOwnerContractWitness(ownerContractPresentation) !== true) {
    return null;
  }
  const rootCauseClass = String(
    ownerContractPresentation?.dominantWitness?.rootCauseClass || EMPTY_STRING,
  ).trim();
  return rootCauseClass.length > ZERO &&
    rootCauseClass !== ROOT_CAUSE_CLASS_UNKNOWN ?
    rootCauseClass :
    null;
}

export function isPendingAckOwnerContractWitness(ownerContractPresentation) {
  const dominantWitness = ownerContractPresentation?.dominantWitness;
  return (
    isRecord(dominantWitness) &&
    dominantWitness.edgeId === EDGE_ID.PUBLICATION_ACK_CONVERGENCE &&
    dominantWitness.dominantReason ===
      REASON.PENDING_ACKS
  );
}

export function addOwnerContractReasonCounts(reasonCounts, ownerContractPresentation) {
  if (!isRecord(reasonCounts) || !isRecord(ownerContractPresentation)) {
    return;
  }
  const dominantReason = resolveOwnerContractDominantReason(
    ownerContractPresentation,
  );
  if (dominantReason) {
    addNormalizedReasonCount(reasonCounts, dominantReason);
  }
}
