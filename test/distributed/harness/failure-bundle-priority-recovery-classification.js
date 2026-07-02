import {
  CONTROL_PLANE_READINESS_REASON,
} from '../../../src/control-plane/control-plane-readiness-constants.js';
import {FAILURE_BUNDLE_DIAGNOSTICS_CONTRACT} from './failure-bundle-diagnostics-contract-reexport.js';
const {
  ZERO,
  ROOT_CAUSE_CLASS_UNKNOWN,
  ROOT_CAUSE_CLASS_TOPOLOGY,
  PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
  FAILURE_CLASS_LOAD_PRESSURE,
  FAILURE_CLASS_CONFIDENCE_HIGH,
  FAILURE_CLASS_CONFIDENCE_MEDIUM,
  isRecord,
  normalizeNonNegativeCount,
  normalizeDistinctStringArray,
  hasPublicationMissingActiveNodeBlocker,
} = FAILURE_BUNDLE_DIAGNOSTICS_CONTRACT;

import {
  ACTIVE_GATE_PUBLICATION_GATE_PREFIX,
  ACTIVE_GATE_REASON_PRIORITY_CONTROL_PLANE_SPREAD_PENDING,
  FAILURE_SIGNAL_BLOCKED_NODE_COUNT_PREFIX,
  FAILURE_SIGNAL_DOMINANT_REASON_PREFIX,
  FAILURE_SIGNAL_FAILURE_BARRIER_PREFIX,
  FAILURE_SIGNAL_FAILURE_BARRIER_REASON_PREFIX,
  FAILURE_SIGNAL_PENDING_ACK_COUNT_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_BOUNDARY_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_FAILING_INVARIANTS_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_LATEST_STATUS_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_LATEST_STEP_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_NEXT_ACTION_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_OWNER_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_PARTITION_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_PROGRESS_CLASS_COUNT_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_PROGRESS_CLASS_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_READINESS_NODE_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_REASON_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_SEMANTIC_STATE_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_UNRESOLVED_PARTITION_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_WAIT_MODE_PREFIX,
  FAILURE_SIGNAL_PRIORITY_SPREAD_PENDING,
  FAILURE_SIGNAL_RECOVERY_PROTOCOL_STATE_PREFIX,
  FAILURE_SIGNAL_VALUE_SEPARATOR,
} from './failure-bundle-classification-constants.js';

function buildPublicationOwnerConvergenceBlockerEvidence({
  publicationConvergence,
  hasStartupReadinessBlocker,
  hasBlockingClosureRecord,
  hasPriorityRecoveryOwnerBlocker,
}) {
  const missingActiveNodeBlocked =
    hasPublicationMissingActiveNodeBlocker(publicationConvergence);
  const pendingAckBlocked =
    normalizeNonNegativeCount(publicationConvergence?.pendingAckCount) >
    ZERO;
  const publicationNodeBlocked =
    normalizeNonNegativeCount(publicationConvergence?.blockedNodeCount) >
    ZERO;
  const publicationPending =
    publicationConvergence?.publicationPending === true &&
    missingActiveNodeBlocked !== true;
  const publicationDebtOpen =
    pendingAckBlocked ||
    publicationNodeBlocked ||
    missingActiveNodeBlocked ||
    publicationPending;
  const prioritySpreadPendingBlocked =
    hasActiveGatePrioritySpreadPendingBlocker(publicationConvergence) &&
    hasPriorityRecoveryOwnerBlocker !== true;
  const closureRecordBlocked =
    hasBlockingClosureRecord === true &&
    (
      hasPriorityRecoveryOwnerBlocker !== true ||
      publicationDebtOpen === true
    );
  const publicationOwnerOpen =
    publicationDebtOpen ||
    prioritySpreadPendingBlocked ||
    closureRecordBlocked;
  return {
    pendingAckBlocked,
    publicationNodeBlocked,
    missingActiveNodeBlocked,
    publicationPending,
    prioritySpreadPendingBlocked,
    startupReadinessBlocked:
      hasStartupReadinessBlocker === true && publicationOwnerOpen,
    closureRecordBlocked,
    priorityRecoveryOwnerBlocked:
      hasPriorityRecoveryOwnerBlocker === true,
  };
}

function hasPublicationOwnerConvergenceBlocker(options) {
  if (!options?.publicationConvergence) {
    return false;
  }
  const evidence = buildPublicationOwnerConvergenceBlockerEvidence(options);
  return (
    evidence.pendingAckBlocked ||
    evidence.publicationNodeBlocked ||
    evidence.missingActiveNodeBlocked ||
    evidence.publicationPending ||
    evidence.prioritySpreadPendingBlocked ||
    evidence.closureRecordBlocked ||
    (
      evidence.startupReadinessBlocked &&
      evidence.priorityRecoveryOwnerBlocked !== true
    )
  );
}

function hasPriorityRecoverySpreadGap(publicationConvergence) {
  const priorityPartitionSummary = isRecord(
    publicationConvergence?.priorityPartitionSummary,
  ) ?
    publicationConvergence.priorityPartitionSummary :
    null;
  return (
    publicationConvergence?.prioritySpreadPending === true &&
    priorityPartitionSummary?.satisfied === false
  );
}

function normalizeActiveGatePublicationReason(reason) {
  const normalizedReason = String(reason || '').trim();
  return normalizedReason.startsWith(ACTIVE_GATE_PUBLICATION_GATE_PREFIX) ?
    normalizedReason.slice(ACTIVE_GATE_PUBLICATION_GATE_PREFIX.length) :
    normalizedReason;
}

function hasActiveGatePrioritySpreadPendingBlocker(publicationConvergence) {
  const activeGateProgress =
    publicationConvergence?.activeGateProgress ||
    publicationConvergence?.activeGate?.progress ||
    null;
  return normalizeDistinctStringArray([
    ...(Array.isArray(activeGateProgress?.gateReasons) ?
      activeGateProgress.gateReasons :
      []),
    ...(Array.isArray(activeGateProgress?.blockers) ?
      activeGateProgress.blockers :
      []),
  ])
    .map((reason) => normalizeActiveGatePublicationReason(reason))
    .includes(ACTIVE_GATE_REASON_PRIORITY_CONTROL_PLANE_SPREAD_PENDING);
}

function resolveFirstDistinctSignalValue(values) {
  const normalizedValues = normalizeDistinctStringArray(values);
  return normalizedValues.length > ZERO ? normalizedValues[ZERO] : null;
}

function resolvePriorityRecoveryPartitionIdFromMap(partitionMap, mapKey) {
  const normalizedMapKey = String(mapKey || '').trim();
  if (normalizedMapKey.length <= ZERO || !isRecord(partitionMap)) {
    return null;
  }
  return resolveFirstDistinctSignalValue(partitionMap[normalizedMapKey]);
}

function resolveFirstPriorityRecoveryPartitionIdFromMap(partitionMap) {
  if (!isRecord(partitionMap)) {
    return null;
  }
  for (const partitionIds of Object.values(partitionMap)) {
    const partitionId = resolveFirstDistinctSignalValue(partitionIds);
    if (partitionId) {
      return partitionId;
    }
  }
  return null;
}

function appendSignalOnce(signals, signal) {
  if (
    typeof signal !== 'string' ||
    signal.length <= ZERO ||
    signals.includes(signal)
  ) {
    return;
  }
  signals.push(signal);
}

function collectBlockedPartitionIdsFromSummary(priorityPartitionSummary) {
  if (!isRecord(priorityPartitionSummary)) {
    return [];
  }
  const blockedPartitions = Array.isArray(
    priorityPartitionSummary.blockedPartitions,
  ) ?
    priorityPartitionSummary.blockedPartitions :
    [];
  return blockedPartitions
    .map((partition) => partition?.partitionId)
    .filter((partitionId) => typeof partitionId === 'string');
}

function resolveActiveGateProgressClasses(publicationConvergence) {
  return isRecord(
    publicationConvergence?.activeGateProgress?.priorityRecoveryProgressClasses,
  ) ?
    publicationConvergence.activeGateProgress.priorityRecoveryProgressClasses :
    isRecord(
      publicationConvergence?.activeGate?.progress
        ?.priorityRecoveryProgressClasses,
    ) ?
      publicationConvergence.activeGate.progress
        .priorityRecoveryProgressClasses :
      null;
}

function resolvePriorityRecoverySemanticStateSignal({
  publicationConvergence,
  dominantProgressWitness,
}) {
  const witnessSemanticStateId = resolveFirstDistinctSignalValue([
    dominantProgressWitness?.semanticStateId,
  ]);
  if (witnessSemanticStateId) {
    return witnessSemanticStateId;
  }
  const directSemanticStateId = resolveFirstDistinctSignalValue(
    publicationConvergence?.priorityRecoverySemanticStateIds,
  );
  if (directSemanticStateId) {
    return directSemanticStateId;
  }
  const activeGateProgressClasses =
    resolveActiveGateProgressClasses(publicationConvergence);
  const progressSemanticStateId = resolveFirstDistinctSignalValue(
    activeGateProgressClasses?.unresolvedSemanticStateIds,
  );
  if (progressSemanticStateId) {
    return progressSemanticStateId;
  }
  const partitionIdsBySemanticState = isRecord(
    activeGateProgressClasses?.partitionIdsBySemanticState,
  ) ?
    activeGateProgressClasses.partitionIdsBySemanticState :
    {};
  for (const [semanticStateId, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    if (normalizeDistinctStringArray(partitionIds).length > ZERO) {
      return semanticStateId;
    }
  }
  return dominantProgressWitness?.semanticStateId || null;
}

function resolvePriorityRecoveryProgressClassSignal({
  publicationConvergence,
  dominantProgressWitness,
}) {
  const witnessProgressClassId = resolveFirstDistinctSignalValue([
    ...normalizeDistinctStringArray(dominantProgressWitness?.progressClassIds),
    ...normalizeDistinctStringArray(
      dominantProgressWitness?.blockerReasonCodes,
    ),
  ]);
  if (witnessProgressClassId) {
    return witnessProgressClassId;
  }
  const directProgressClassId = resolveFirstDistinctSignalValue(
    publicationConvergence?.priorityRecoveryProgressClassIds,
  );
  if (directProgressClassId) {
    return directProgressClassId;
  }
  const activeGateProgressClasses =
    resolveActiveGateProgressClasses(publicationConvergence);
  return resolveFirstDistinctSignalValue(
    activeGateProgressClasses?.unresolvedClassIds,
  );
}

function resolvePriorityRecoveryMappedPartitionSignal({
  publicationConvergence,
  dominantProgressWitness,
  progressClassId,
  semanticStateId,
}) {
  const directClassPartitionId = resolvePriorityRecoveryPartitionIdFromMap(
    publicationConvergence?.priorityRecoveryBlockerPartitionIdsByReason,
    progressClassId,
  );
  if (directClassPartitionId) {
    return directClassPartitionId;
  }
  const directMappedClassPartitionId =
    resolveFirstPriorityRecoveryPartitionIdFromMap(
      publicationConvergence?.priorityRecoveryBlockerPartitionIdsByReason,
    );
  if (directMappedClassPartitionId) {
    return directMappedClassPartitionId;
  }
  const activeGateProgressClasses =
    resolveActiveGateProgressClasses(publicationConvergence);
  const progressClassPartitionId = resolvePriorityRecoveryPartitionIdFromMap(
    activeGateProgressClasses?.partitionIdsByClass,
    progressClassId,
  );
  if (progressClassPartitionId) {
    return progressClassPartitionId;
  }
  const directSemanticPartitionId = resolvePriorityRecoveryPartitionIdFromMap(
    publicationConvergence?.priorityRecoveryPartitionIdsBySemanticState,
    semanticStateId,
  );
  if (directSemanticPartitionId) {
    return directSemanticPartitionId;
  }
  const directMappedSemanticPartitionId =
    resolveFirstPriorityRecoveryPartitionIdFromMap(
      publicationConvergence?.priorityRecoveryPartitionIdsBySemanticState,
    );
  if (directMappedSemanticPartitionId) {
    return directMappedSemanticPartitionId;
  }
  return resolvePriorityRecoveryPartitionIdFromMap(
    activeGateProgressClasses?.partitionIdsBySemanticState,
    semanticStateId,
  ) || dominantProgressWitness?.partitionId || null;
}

function resolvePriorityRecoveryBlockedPartitionSignal({
  publicationConvergence,
  dominantProgressWitness,
  progressClassId,
  semanticStateId,
}) {
  const mappedPartitionId = resolvePriorityRecoveryMappedPartitionSignal({
    publicationConvergence,
    dominantProgressWitness,
    progressClassId,
    semanticStateId,
  });
  if (mappedPartitionId) {
    return mappedPartitionId;
  }
  const directPartitionId =
    resolveFirstDistinctSignalValue(
      publicationConvergence?.priorityRecoveryUnresolvedPartitionIds,
    ) ||
    resolveFirstDistinctSignalValue(
      publicationConvergence?.priorityRecoveryBlockedPartitionIds,
    );
  if (directPartitionId) {
    return directPartitionId;
  }
  const activeGateProgressClasses =
    resolveActiveGateProgressClasses(publicationConvergence);
  const progressPartitionId = resolveFirstDistinctSignalValue(
    activeGateProgressClasses?.blockedPartitionIds,
  );
  if (progressPartitionId) {
    return progressPartitionId;
  }
  const partitionIdsBySemanticState = isRecord(
    activeGateProgressClasses?.partitionIdsBySemanticState,
  ) ?
    activeGateProgressClasses.partitionIdsBySemanticState :
    {};
  for (const partitionIds of Object.values(partitionIdsBySemanticState)) {
    const mappedPartitionId = resolveFirstDistinctSignalValue(partitionIds);
    if (mappedPartitionId) {
      return mappedPartitionId;
    }
  }
  return dominantProgressWitness?.partitionId || null;
}

function resolvePriorityRecoveryUnresolvedPartitionSignal({
  publicationConvergence,
  dominantProgressWitness,
  progressClassId,
  semanticStateId,
}) {
  const mappedPartitionId = resolvePriorityRecoveryMappedPartitionSignal({
    publicationConvergence,
    dominantProgressWitness,
    progressClassId,
    semanticStateId,
  });
  const unresolvedPartitionIds = normalizeDistinctStringArray(
    publicationConvergence?.priorityRecoveryUnresolvedPartitionIds,
  );
  if (
    mappedPartitionId &&
    (
      unresolvedPartitionIds.length === ZERO ||
      unresolvedPartitionIds.includes(mappedPartitionId)
    )
  ) {
    return mappedPartitionId;
  }
  return resolveFirstDistinctSignalValue(unresolvedPartitionIds);
}

function buildReadinessPriorityRecoveryBlockerEvidence({
  nodeId,
  reason,
}) {
  const details = isRecord(reason?.details) ? reason.details : null;
  if (!details) {
    return null;
  }
  const publicationRecoveryGate = isRecord(details.publicationRecoveryGate) ?
    details.publicationRecoveryGate :
    null;
  const priorityRecoveryObservation = isRecord(
    details.priorityRecoveryObservation,
  ) ?
    details.priorityRecoveryObservation :
    null;
  const priorityPartitionSummary =
    isRecord(details.priorityPartitionSummary) ?
      details.priorityPartitionSummary :
      isRecord(publicationRecoveryGate?.priorityPartitionSummary) ?
        publicationRecoveryGate.priorityPartitionSummary :
        null;
  const closureWitness = isRecord(
    publicationRecoveryGate?.priorityRecoveryClosureWitness,
  ) ?
    publicationRecoveryGate.priorityRecoveryClosureWitness :
    null;
  const blockedPartitionIds = normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoveryBlockedPartitionIds,
    ),
    ...normalizeDistinctStringArray(closureWitness?.blockedPartitionIds),
    ...collectBlockedPartitionIdsFromSummary(priorityPartitionSummary),
  ]);
  const unresolvedPartitionIds = normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoveryUnresolvedPartitionIds,
    ),
    ...normalizeDistinctStringArray(closureWitness?.blockedPartitionIds),
  ]);
  const progressClassIds = normalizeDistinctStringArray(
    priorityRecoveryObservation?.priorityRecoveryProgressClassIds,
  );
  const unresolvedSemanticStateIds = normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoverySemanticStateIds,
    ),
    ...normalizeDistinctStringArray(closureWitness?.unresolvedSemanticStateIds),
  ]);
  const reasonCodes = normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(details.reasonCodes),
    ...normalizeDistinctStringArray(
      details.publicationGateReasonCodes,
    ),
    ...normalizeDistinctStringArray(publicationRecoveryGate?.reasonCodes),
  ]);
  if (
    blockedPartitionIds.length === ZERO &&
    unresolvedSemanticStateIds.length === ZERO &&
    details.active !== true
  ) {
    return null;
  }
  return {
    nodeId,
    reasonCode: reason?.code || null,
    blockedPartitionIds,
    blockedPartitionCount: blockedPartitionIds.length,
    unresolvedPartitionIds,
    progressClassIds,
    unresolvedSemanticStateIds,
    blockerPartitionIdsByReason: isRecord(
      priorityRecoveryObservation?.priorityRecoveryBlockerPartitionIdsByReason,
    ) ?
      priorityRecoveryObservation.priorityRecoveryBlockerPartitionIdsByReason :
      null,
    partitionIdsBySemanticState: isRecord(
      priorityRecoveryObservation?.priorityRecoveryPartitionIdsBySemanticState,
    ) ?
      priorityRecoveryObservation.priorityRecoveryPartitionIdsBySemanticState :
      null,
    partitionWitnesses: Array.isArray(
      priorityRecoveryObservation?.priorityRecoveryPartitionWitnesses,
    ) ?
      priorityRecoveryObservation.priorityRecoveryPartitionWitnesses :
      [],
    reasonCodes,
  };
}

function resolveReadinessPriorityRecoveryBlocker(controlPlane) {
  const readinessByNodeId = isRecord(controlPlane?.readinessByNodeId) ?
    controlPlane.readinessByNodeId :
    {};
  for (const [nodeId, readiness] of Object.entries(readinessByNodeId)) {
    const reasons = Array.isArray(readiness?.reasons) ?
      readiness.reasons :
      [];
    for (const reason of reasons) {
      if (
        reason?.code !==
        CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING
      ) {
        continue;
      }
      const evidence = buildReadinessPriorityRecoveryBlockerEvidence({
        nodeId,
        reason,
      });
      if (evidence) {
        return evidence;
      }
    }
  }
  return null;
}

function hasPriorityRecoveryProgressBlocker(publicationConvergence) {
  if (!publicationConvergence) {
    return false;
  }
  return (
    normalizeNonNegativeCount(
      publicationConvergence.priorityRecoveryProgressClassCount,
    ) > ZERO ||
    normalizeNonNegativeCount(
      publicationConvergence.priorityRecoverySemanticStateCount,
    ) > ZERO ||
    normalizeNonNegativeCount(
      publicationConvergence.priorityRecoveryBlockedPartitionCount,
    ) > ZERO ||
    normalizeNonNegativeCount(
      publicationConvergence.priorityRecoveryUnresolvedPartitionCount,
    ) > ZERO ||
    normalizeDistinctStringArray(
      publicationConvergence.priorityRecoveryProgressClassIds,
    ).length > ZERO ||
    normalizeDistinctStringArray(
      publicationConvergence.priorityRecoverySemanticStateIds,
    ).length > ZERO ||
    normalizeDistinctStringArray(
      publicationConvergence.priorityRecoveryBlockedPartitionIds,
    ).length > ZERO ||
    normalizeDistinctStringArray(
      publicationConvergence.priorityRecoveryUnresolvedPartitionIds,
    ).length > ZERO ||
    hasPriorityRecoverySpreadGap(publicationConvergence)
  );
}

function appendPriorityRecoveryProgressSignals({
  signals,
  publicationConvergence,
  dominantProgressWitness,
}) {
  signals.push(
    FAILURE_SIGNAL_PENDING_ACK_COUNT_PREFIX +
      String(publicationConvergence.pendingAckCount),
    FAILURE_SIGNAL_BLOCKED_NODE_COUNT_PREFIX +
      String(publicationConvergence.blockedNodeCount),
  );
  if (
    typeof publicationConvergence.recoveryProtocolState === 'string' &&
    publicationConvergence.recoveryProtocolState.length > ZERO
  ) {
    signals.push(
      FAILURE_SIGNAL_RECOVERY_PROTOCOL_STATE_PREFIX +
        publicationConvergence.recoveryProtocolState,
    );
  }
  if (publicationConvergence.prioritySpreadPending === true) {
    signals.push(FAILURE_SIGNAL_PRIORITY_SPREAD_PENDING);
  }
  if (
    typeof publicationConvergence.activeGateSnapshotCoverageBlocker ===
      'string' &&
    publicationConvergence.activeGateSnapshotCoverageBlocker.length > ZERO
  ) {
    appendSignalOnce(
      signals,
      publicationConvergence.activeGateSnapshotCoverageBlocker,
    );
  }
  if (
    normalizeNonNegativeCount(
      publicationConvergence.priorityRecoveryProgressClassCount,
    ) > ZERO
  ) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_PROGRESS_CLASS_COUNT_PREFIX +
        String(publicationConvergence.priorityRecoveryProgressClassCount),
    );
  }
  if (
    Array.isArray(publicationConvergence.priorityRecoveryInvariantFailingIds) &&
    publicationConvergence.priorityRecoveryInvariantFailingIds.length > ZERO
  ) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_FAILING_INVARIANTS_PREFIX +
        publicationConvergence.priorityRecoveryInvariantFailingIds.join(
          FAILURE_SIGNAL_VALUE_SEPARATOR,
        ),
    );
  }
  const progressClassId = resolvePriorityRecoveryProgressClassSignal({
    publicationConvergence,
    dominantProgressWitness,
  });
  if (progressClassId) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_PROGRESS_CLASS_PREFIX +
        progressClassId,
    );
  }
  const semanticStateId = resolvePriorityRecoverySemanticStateSignal({
    publicationConvergence,
    dominantProgressWitness,
  });
  if (semanticStateId) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_SEMANTIC_STATE_PREFIX +
        semanticStateId,
    );
  }
  const blockedPartitionId = resolvePriorityRecoveryBlockedPartitionSignal({
    publicationConvergence,
    dominantProgressWitness,
    progressClassId,
    semanticStateId,
  });
  if (blockedPartitionId) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_PARTITION_PREFIX + blockedPartitionId,
    );
  }
  const unresolvedPartitionId = resolvePriorityRecoveryUnresolvedPartitionSignal({
    publicationConvergence,
    dominantProgressWitness,
    progressClassId,
    semanticStateId,
  });
  if (unresolvedPartitionId) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_UNRESOLVED_PARTITION_PREFIX +
        unresolvedPartitionId,
    );
  }
  if (dominantProgressWitness?.currentOwner) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_OWNER_PREFIX +
        dominantProgressWitness.currentOwner,
    );
  }
  if (dominantProgressWitness?.blockingBoundary) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_BOUNDARY_PREFIX +
        dominantProgressWitness.blockingBoundary,
    );
  }
  if (dominantProgressWitness?.waitMode) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_WAIT_MODE_PREFIX +
        dominantProgressWitness.waitMode,
    );
  }
  if (dominantProgressWitness?.nextRequiredAction) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_NEXT_ACTION_PREFIX +
        dominantProgressWitness.nextRequiredAction,
    );
  }
}

function appendDominantPriorityRecoveryWitnessSignals(
  signals,
  dominantProgressWitness,
) {
  if (!isRecord(dominantProgressWitness)) {
    return;
  }
  if (dominantProgressWitness.partitionId) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_PARTITION_PREFIX +
        dominantProgressWitness.partitionId,
    );
  }
  if (dominantProgressWitness.semanticStateId) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_SEMANTIC_STATE_PREFIX +
        dominantProgressWitness.semanticStateId,
    );
  }
  if (dominantProgressWitness.currentOwner) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_OWNER_PREFIX +
        dominantProgressWitness.currentOwner,
    );
  }
  if (dominantProgressWitness.blockingBoundary) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_BOUNDARY_PREFIX +
        dominantProgressWitness.blockingBoundary,
    );
  }
  if (dominantProgressWitness.waitMode) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_WAIT_MODE_PREFIX +
        dominantProgressWitness.waitMode,
    );
  }
  if (dominantProgressWitness.nextRequiredAction) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_NEXT_ACTION_PREFIX +
        dominantProgressWitness.nextRequiredAction,
    );
  }
  if (dominantProgressWitness.latestOperationWorkflowStep) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_LATEST_STEP_PREFIX +
        dominantProgressWitness.latestOperationWorkflowStep,
    );
  }
  if (dominantProgressWitness.latestOperationStatus) {
    signals.push(
      FAILURE_SIGNAL_PRIORITY_RECOVERY_LATEST_STATUS_PREFIX +
        dominantProgressWitness.latestOperationStatus,
    );
  }
}

function resolveReadinessPriorityRecoveryWitnessPartitionSignal({
  readinessPriorityRecoveryBlocker,
  progressClassId,
  semanticStateId,
}) {
  const partitionWitnesses = Array.isArray(
    readinessPriorityRecoveryBlocker?.partitionWitnesses,
  ) ?
    readinessPriorityRecoveryBlocker.partitionWitnesses :
    [];
  for (const partitionWitness of partitionWitnesses) {
    const partitionId = String(partitionWitness?.partitionId || '').trim();
    if (partitionId.length <= ZERO) {
      continue;
    }
    const witnessSemanticStateId = String(
      partitionWitness?.semanticStateId || '',
    ).trim();
    if (semanticStateId && witnessSemanticStateId === semanticStateId) {
      return partitionId;
    }
    const witnessProgressClassIds = normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(partitionWitness?.progressClassIds),
      ...normalizeDistinctStringArray(partitionWitness?.blockerReasonCodes),
    ]);
    if (
      progressClassId &&
      witnessProgressClassIds.includes(progressClassId)
    ) {
      return partitionId;
    }
  }
  for (const partitionWitness of partitionWitnesses) {
    const partitionId = String(partitionWitness?.partitionId || '').trim();
    if (partitionId.length > ZERO) {
      return partitionId;
    }
  }
  return null;
}

function resolveReadinessPriorityRecoveryPartitionSignal({
  readinessPriorityRecoveryBlocker,
  progressClassId,
  semanticStateId,
}) {
  const classPartitionId = resolvePriorityRecoveryPartitionIdFromMap(
    readinessPriorityRecoveryBlocker?.blockerPartitionIdsByReason,
    progressClassId,
  );
  if (classPartitionId) {
    return classPartitionId;
  }
  const mappedClassPartitionId = resolveFirstPriorityRecoveryPartitionIdFromMap(
    readinessPriorityRecoveryBlocker?.blockerPartitionIdsByReason,
  );
  if (mappedClassPartitionId) {
    return mappedClassPartitionId;
  }
  const semanticPartitionId = resolvePriorityRecoveryPartitionIdFromMap(
    readinessPriorityRecoveryBlocker?.partitionIdsBySemanticState,
    semanticStateId,
  );
  if (semanticPartitionId) {
    return semanticPartitionId;
  }
  const mappedSemanticPartitionId =
    resolveFirstPriorityRecoveryPartitionIdFromMap(
      readinessPriorityRecoveryBlocker?.partitionIdsBySemanticState,
    );
  if (mappedSemanticPartitionId) {
    return mappedSemanticPartitionId;
  }
  const unresolvedPartitionId = resolveFirstDistinctSignalValue(
    readinessPriorityRecoveryBlocker?.unresolvedPartitionIds,
  );
  if (unresolvedPartitionId) {
    return unresolvedPartitionId;
  }
  const witnessPartitionId =
    resolveReadinessPriorityRecoveryWitnessPartitionSignal({
      readinessPriorityRecoveryBlocker,
      progressClassId,
      semanticStateId,
    });
  if (witnessPartitionId) {
    return witnessPartitionId;
  }
  return resolveFirstDistinctSignalValue(
    readinessPriorityRecoveryBlocker?.blockedPartitionIds,
  );
}

function appendReadinessPriorityRecoveryBlockerSignals(
  signals,
  readinessPriorityRecoveryBlocker,
) {
  if (!isRecord(readinessPriorityRecoveryBlocker)) {
    return;
  }
  if (readinessPriorityRecoveryBlocker.nodeId) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_PRIORITY_RECOVERY_READINESS_NODE_PREFIX +
        readinessPriorityRecoveryBlocker.nodeId,
    );
  }
  if (readinessPriorityRecoveryBlocker.reasonCode) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_PRIORITY_RECOVERY_REASON_PREFIX +
        readinessPriorityRecoveryBlocker.reasonCode,
    );
  }
  if (
    normalizeNonNegativeCount(
      readinessPriorityRecoveryBlocker.blockedPartitionCount,
    ) > ZERO
  ) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT_PREFIX +
        String(readinessPriorityRecoveryBlocker.blockedPartitionCount),
    );
  }
  const semanticStateId = resolveFirstDistinctSignalValue(
    readinessPriorityRecoveryBlocker.unresolvedSemanticStateIds,
  );
  const progressClassId =
    resolveFirstDistinctSignalValue(
      readinessPriorityRecoveryBlocker.progressClassIds,
    ) ||
    resolveFirstDistinctSignalValue(
      readinessPriorityRecoveryBlocker.reasonCodes,
    );
  const blockedPartitionId = resolveReadinessPriorityRecoveryPartitionSignal(
    {
      readinessPriorityRecoveryBlocker,
      progressClassId,
      semanticStateId,
    },
  );
  if (blockedPartitionId) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_PRIORITY_RECOVERY_PARTITION_PREFIX + blockedPartitionId,
    );
  }
  if (semanticStateId) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_PRIORITY_RECOVERY_SEMANTIC_STATE_PREFIX +
        semanticStateId,
    );
  }
  if (progressClassId) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_PRIORITY_RECOVERY_PROGRESS_CLASS_PREFIX + progressClassId,
    );
  }
}

function appendFailureBarrierSignals(signals, failureBarrier) {
  if (!Array.isArray(signals) || !isRecord(failureBarrier)) {
    return signals;
  }
  const phase = String(failureBarrier.phase || '').trim();
  if (phase.length > ZERO) {
    appendSignalOnce(signals, FAILURE_SIGNAL_FAILURE_BARRIER_PREFIX + phase);
  }
  const dominantReason = String(failureBarrier.dominantReason || '').trim();
  if (dominantReason.length > ZERO) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_FAILURE_BARRIER_REASON_PREFIX + dominantReason,
    );
  }
  return signals;
}

function buildPriorityRecoveryProgressFailureClassification({
  publicationConvergence,
  rootCauseClass,
  dominantReason,
  dominantProgressWitness,
  readinessPriorityRecoveryBlocker,
  failureBarrier,
}) {
  const signals = [];
  appendFailureBarrierSignals(signals, failureBarrier);
  if (publicationConvergence) {
    appendPriorityRecoveryProgressSignals({
      signals,
      publicationConvergence,
      dominantProgressWitness,
    });
  }
  appendReadinessPriorityRecoveryBlockerSignals(
    signals,
    readinessPriorityRecoveryBlocker,
  );
  return {
    failureClass: PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
    confidence: FAILURE_CLASS_CONFIDENCE_HIGH,
    rootCauseClass:
      rootCauseClass && rootCauseClass !== ROOT_CAUSE_CLASS_UNKNOWN ?
        rootCauseClass :
        ROOT_CAUSE_CLASS_TOPOLOGY,
    dominantReason: dominantReason || null,
    signals,
  };
}

function buildLoadPressureFailureClassification({
  rootCauseClass,
  dominantReason,
  dominantProgressWitness,
}) {
  const signals = [];
  if (dominantReason) {
    signals.push(FAILURE_SIGNAL_DOMINANT_REASON_PREFIX + dominantReason);
  }
  appendDominantPriorityRecoveryWitnessSignals(
    signals,
    dominantProgressWitness,
  );
  return {
    failureClass: FAILURE_CLASS_LOAD_PRESSURE,
    confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
    rootCauseClass,
    dominantReason: dominantReason || null,
    signals,
  };
}

export {
  appendDominantPriorityRecoveryWitnessSignals,
  appendPriorityRecoveryProgressSignals,
  appendReadinessPriorityRecoveryBlockerSignals,
  appendSignalOnce,
  buildLoadPressureFailureClassification,
  buildPriorityRecoveryProgressFailureClassification,
  buildPublicationOwnerConvergenceBlockerEvidence,
  buildReadinessPriorityRecoveryBlockerEvidence,
  collectBlockedPartitionIdsFromSummary,
  hasActiveGatePrioritySpreadPendingBlocker,
  hasPriorityRecoveryProgressBlocker,
  hasPriorityRecoverySpreadGap,
  hasPublicationOwnerConvergenceBlocker,
  normalizeActiveGatePublicationReason,
  resolveActiveGateProgressClasses,
  resolveFirstDistinctSignalValue,
  resolveFirstPriorityRecoveryPartitionIdFromMap,
  resolvePriorityRecoveryBlockedPartitionSignal,
  resolvePriorityRecoveryMappedPartitionSignal,
  resolvePriorityRecoveryPartitionIdFromMap,
  resolvePriorityRecoveryProgressClassSignal,
  resolvePriorityRecoverySemanticStateSignal,
  resolvePriorityRecoveryUnresolvedPartitionSignal,
  resolveReadinessPriorityRecoveryBlocker,
  resolveReadinessPriorityRecoveryPartitionSignal,
  resolveReadinessPriorityRecoveryWitnessPartitionSignal,
};
