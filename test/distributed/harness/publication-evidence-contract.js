import {buildPriorityRecoveryObservationSnapshot} from
  '../../../src/control-plane/priority-recovery-observation-snapshot.js';
import {buildCanonicalPublicationRecoveryEvidence} from
  '../../../src/control-plane/publication-recovery-evidence.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from
  '../../../src/control-plane/publication-recovery-gate.js';
import {classifyActiveGateClosureWitness} from
  './active-gate-closure-classification.js';
import {
  deriveLegacyPriorityRecoveryActiveGateFields,
  normalizePriorityRecoveryActiveGateSnapshot,
} from './active-gate-contract.js';

const PUBLICATION_EVIDENCE_EMPTY_LIST = Object.freeze([]);
const PUBLICATION_EVIDENCE_ZERO = 0;
const PUBLICATION_EVIDENCE_READY_BLOCKER = 'ready';
const PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const PUBLICATION_EVIDENCE_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED =
  'steady_published';
const PUBLICATION_EVIDENCE_ACTIVE_GATE_BLOCKER_PREFIX = Object.freeze({
  PUBLICATION_GATE: 'publication_gate=',
  PRIORITY_RECOVERY_PROGRESS_CLASS: 'priority_recovery_progress_class=',
});
const PUBLICATION_EVIDENCE_SOURCE_SELECTION = Object.freeze({
  OBSERVED: 'observed',
  BEST_PROGRESS_CLOSED_PUBLICATION: 'best_progress_closed_publication',
});
const PUBLICATION_EVIDENCE_TYPEOF = Object.freeze({
  OBJECT: 'object',
  STRING: 'string',
});
const PUBLICATION_EVIDENCE_TEXT = Object.freeze({
  EMPTY: '',
  VALUE_SEPARATOR: '|',
});
const PUBLICATION_EVIDENCE_EMPTY_RECORD = Object.freeze({});
const PUBLICATION_EVIDENCE_STALE_PUBLICATION_FIELD_NAMES = Object.freeze(
  new Set([
    'closureRecordId',
    'closureWitnessClass',
    'priorityRecoveryClosureState',
    'priorityRecoveryClosureWitness',
    'publicationRecoveryGate',
  ]),
);
const PUBLICATION_EVIDENCE_CLOSED_PRIORITY_RECOVERY_CURRENT_SUMMARY =
  Object.freeze({
    unresolvedClassIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    unresolvedClassCount: PUBLICATION_EVIDENCE_ZERO,
    unresolvedSemanticStateIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    unresolvedSemanticStateCount: PUBLICATION_EVIDENCE_ZERO,
    blockedPartitionIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    blockedPartitionCount: PUBLICATION_EVIDENCE_ZERO,
    blockerPartitionIdsByReason: PUBLICATION_EVIDENCE_EMPTY_RECORD,
    partitionIdsBySemanticState: PUBLICATION_EVIDENCE_EMPTY_RECORD,
    partitionBlockerHistory: PUBLICATION_EVIDENCE_EMPTY_LIST,
  });
const PUBLICATION_EVIDENCE_CLOSED_PRIORITY_RECOVERY_DECISION_SNAPSHOTS =
  Object.freeze({
    snapshots: PUBLICATION_EVIDENCE_EMPTY_LIST,
  });

function isRecord(value) {
  return Boolean(value) &&
    typeof value === PUBLICATION_EVIDENCE_TYPEOF.OBJECT &&
    !Array.isArray(value);
}

function normalizeDistinctStringArray(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || PUBLICATION_EVIDENCE_TEXT.EMPTY).trim())
        .filter((value) => value.length > PUBLICATION_EVIDENCE_ZERO),
    )],
  );
}

function normalizePublicationEpoch(value) {
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

function normalizeOptionalString(value) {
  return typeof value === PUBLICATION_EVIDENCE_TYPEOF.STRING &&
    value.trim().length > PUBLICATION_EVIDENCE_ZERO ?
    value.trim() :
    null;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= PUBLICATION_EVIDENCE_ZERO ?
    value :
    null;
}

function normalizePositiveInteger(value) {
  return Number.isInteger(value) && value > PUBLICATION_EVIDENCE_ZERO ?
    value :
    null;
}

function omitStalePublicationFields(record = null) {
  if (!isRecord(record)) {
    return {};
  }
  const filteredRecord = {};
  for (const [fieldName, fieldValue] of Object.entries(record)) {
    if (PUBLICATION_EVIDENCE_STALE_PUBLICATION_FIELD_NAMES.has(fieldName)) {
      continue;
    }
    filteredRecord[fieldName] = fieldValue;
  }
  return filteredRecord;
}

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
  const pendingAckNodeIds = normalizeDistinctStringArray(
    priorityRecoveryObservation?.pendingAckNodeIds ??
      publicationConvergenceGate?.pendingAckNodeIds ??
      publicationConvergence?.pendingAckNodeIds ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
  const pendingAckCount =
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
  const decisionPriorityPartitionSummary =
    priorityRecoveryDecisionSnapshots?.priorityPartitionSummary &&
    isRecord(priorityRecoveryDecisionSnapshots.priorityPartitionSummary) ?
      priorityRecoveryDecisionSnapshots.priorityPartitionSummary :
      null;
  const openEvidence = Object.freeze({
    pendingAckOpen: pendingAckCount > PUBLICATION_EVIDENCE_ZERO,
    publicationPending:
      priorityRecoveryObservation?.publicationPending === true ||
      publicationConvergenceGate?.publicationPending === true ||
      publicationConvergence?.publicationPending === true,
    publicationStatusOpen:
      Boolean(publicationStatus) &&
      publicationStatus !== PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED,
    prioritySpreadPending:
      priorityRecoveryObservation?.prioritySpreadPending === true ||
      publicationConvergenceGate?.prioritySpreadPending === true ||
      publicationConvergence?.prioritySpreadPending === true ||
      priorityPartitionSummary?.satisfied === false,
    gateReasonOpen: gateReasons.length > PUBLICATION_EVIDENCE_ZERO,
    priorityRecoveryReasonOpen:
      priorityRecoveryReasonCodes.length > PUBLICATION_EVIDENCE_ZERO,
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
  const activeGateBestProgress = buildClosedPublicationProgressProjection(
    activeGate?.bestProgress,
    bestProgress,
    priorityPartitionSummary,
  );
  const projectedActiveGate = isRecord(activeGate) ?
    normalizePriorityRecoveryActiveGateSnapshot({
      activeGate: {
        ...omitStalePublicationFields(activeGate),
        progress: activeGateProgress || activeGate.progress,
        bestProgress: activeGateBestProgress || activeGate.bestProgress,
      },
    }) :
    null;
  const activeGateFields = projectedActiveGate ?
    deriveLegacyPriorityRecoveryActiveGateFields(projectedActiveGate) :
    {};
  const projectedActiveGateBestProgress = projectedActiveGate?.bestProgress ||
    activeGateBestProgress ||
    null;
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
    ...(projectedActiveGateBestProgress ?
      {activeGateBestProgress: projectedActiveGateBestProgress} :
      {}),
    ...(activeGateFields.activeGateNoProgress ?
      {activeGateNoProgress: activeGateFields.activeGateNoProgress} :
      {}),
    ...(activeGateFields.activeGateBlockerHistory ?
      {activeGateBlockerHistory: activeGateFields.activeGateBlockerHistory} :
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
    ...(activeGateFields || {}),
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
    activeGateBestProgress:
      controlPlane?.activeGateBestProgress ||
      controlPlane?.priorityRecoveryObservation?.activeGateBestProgress ||
      null,
    activeGateNoProgress:
      controlPlane?.activeGateNoProgress ||
      controlPlane?.priorityRecoveryObservation?.activeGateNoProgress ||
      null,
    activeGateBlockerHistory:
      controlPlane?.activeGateBlockerHistory ||
      controlPlane?.priorityRecoveryObservation?.activeGateBlockerHistory ||
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

function resolveSelectedMissingPublishedNodeIds(progress = null) {
  if (!isRecord(progress)) {
    return null;
  }
  if (Array.isArray(progress.selectedMissingPublishedNodeIds)) {
    return normalizeDistinctStringArray(progress.selectedMissingPublishedNodeIds);
  }
  const expectedNodeCount = normalizePositiveInteger(progress.expectedNodeCount);
  const selectedPublishedActiveNodeIds = normalizeDistinctStringArray(
    progress.selectedPublishedActiveNodeIds,
  );
  const selectedPublishedActiveCount =
    normalizeNonNegativeInteger(progress.selectedPublishedActiveCount) ??
    selectedPublishedActiveNodeIds.length;
  return expectedNodeCount !== null &&
    selectedPublishedActiveCount === expectedNodeCount ?
    PUBLICATION_EVIDENCE_EMPTY_LIST :
    null;
}

function resolvePendingRequiredAckNodeIds(pendingAckSource = null) {
  if (
    !Array.isArray(pendingAckSource?.requiredAckNodeIds) ||
    !Array.isArray(pendingAckSource?.acknowledgedNodeIds)
  ) {
    return null;
  }
  const acknowledgedNodeIdSet = new Set(
    normalizeDistinctStringArray(pendingAckSource.acknowledgedNodeIds),
  );
  const requiredAckNodeIds = normalizeDistinctStringArray(
    pendingAckSource.requiredAckNodeIds,
  );
  return requiredAckNodeIds.length > PUBLICATION_EVIDENCE_ZERO ?
    requiredAckNodeIds.filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId)) :
    null;
}

function resolveCurrentPendingAckNodeIds({
  progress = null,
  priorityRecoveryObservation = null,
  publicationConvergence = null,
  publicationConvergenceGate = null,
} = {}) {
  const pendingAckNodeIdSources = [
    publicationConvergenceGate,
    publicationConvergence,
    priorityRecoveryObservation,
    progress,
  ];
  for (const pendingAckSource of pendingAckNodeIdSources) {
    if (!Array.isArray(pendingAckSource?.pendingAckNodeIds)) {
      continue;
    }
    const pendingAckNodeIds = normalizeDistinctStringArray(
      pendingAckSource.pendingAckNodeIds,
    );
    if (pendingAckNodeIds.length > PUBLICATION_EVIDENCE_ZERO) {
      return pendingAckNodeIds;
    }
    const pendingRequiredAckNodeIds =
      resolvePendingRequiredAckNodeIds(pendingAckSource);
    if (pendingRequiredAckNodeIds !== null) {
      return pendingRequiredAckNodeIds;
    }
  }
  return null;
}

function filterPublicationDerivedBlockers(blockers = []) {
  return normalizeDistinctStringArray(blockers).filter((blocker) =>
    blocker !== PUBLICATION_EVIDENCE_READY_BLOCKER &&
    !blocker.startsWith(
      PUBLICATION_EVIDENCE_ACTIVE_GATE_BLOCKER_PREFIX.PUBLICATION_GATE,
    ) &&
    !blocker.startsWith(
      PUBLICATION_EVIDENCE_ACTIVE_GATE_BLOCKER_PREFIX
        .PRIORITY_RECOVERY_PROGRESS_CLASS,
    ),
  );
}

function buildCanonicalPriorityRecoveryActiveGateProgress(
  progress = null,
  priorityRecoveryObservation = null,
  publicationConvergenceGate = null,
) {
  if (!isRecord(progress)) {
    return null;
  }
  const gateReasons = normalizeDistinctStringArray(
    publicationConvergenceGate?.reasons ??
      priorityRecoveryObservation?.publicationConvergenceGateReasons ??
      publicationConvergenceGate?.reasonCodes ??
      progress?.gateReasons ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
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
    publicationConvergenceGate,
  });
  const pendingAckCount = pendingAckNodeIds !== null ?
    pendingAckNodeIds.length :
    Math.max(
      progressPendingAckCount,
      publicationPendingAckCount,
      observationPendingAckCount,
    );
  const selectedMissingPublishedNodeIds =
    resolveSelectedMissingPublishedNodeIds(progress);
  const progressMissingPublishedCount =
    selectedMissingPublishedNodeIds !== null ?
      selectedMissingPublishedNodeIds.length :
      normalizeNonNegativeInteger(progress?.missingPublishedCount) ??
        PUBLICATION_EVIDENCE_ZERO;
  const publicationMissingPublishedCount =
    normalizeNonNegativeInteger(publicationConvergenceGate?.missingPublishedCount) ??
    PUBLICATION_EVIDENCE_ZERO;
  const missingPublishedCount =
    selectedMissingPublishedNodeIds !== null ?
      selectedMissingPublishedNodeIds.length :
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
    ...gateReasons.map((reason) =>
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
    gateReasons.length === PUBLICATION_EVIDENCE_ZERO &&
    pendingAckCount === PUBLICATION_EVIDENCE_ZERO &&
    missingPublishedCount === PUBLICATION_EVIDENCE_ZERO;
  if (
    blockers.length === PUBLICATION_EVIDENCE_ZERO &&
    hasReadyShape
  ) {
    blockers.push(PUBLICATION_EVIDENCE_READY_BLOCKER);
  }
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
    gateReasonCount: gateReasons.length,
    gateReasons,
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
      normalizeOptionalString(priorityRecoveryObservation?.closureRecordId) ||
      normalizeOptionalString(publicationConvergenceGate?.closureRecordId) ||
      normalizeOptionalString(progress?.closureRecordId),
    closureWitnessClass:
      normalizeOptionalString(priorityRecoveryObservation?.closureWitnessClass) ||
      normalizeOptionalString(publicationConvergenceGate?.closureWitnessClass) ||
      normalizeOptionalString(progress?.closureWitnessClass),
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
) {
  if (!isRecord(activeGate)) {
    return null;
  }
  const canonicalProgress = buildCanonicalPriorityRecoveryActiveGateProgress(
    activeGate.progress,
    priorityRecoveryObservation,
    publicationConvergenceGate,
  );
  const activeGateClosureWitness = classifyActiveGateClosureWitness({
    progressSnapshot: canonicalProgress,
    bestProgressSnapshot: activeGate?.bestProgress || null,
    publicationConvergence: null,
    publicationConvergenceGate,
    readinessMode: activeGate?.mode || null,
  });
  return normalizePriorityRecoveryActiveGateSnapshot({
    activeGate: {
      ...activeGate,
      closureRecordId:
        normalizeOptionalString(activeGate.closureRecordId) ||
        normalizeOptionalString(priorityRecoveryObservation?.closureRecordId) ||
        normalizeOptionalString(publicationConvergenceGate?.closureRecordId) ||
        normalizeOptionalString(activeGateClosureWitness?.closureRecordId),
      closureWitnessClass:
        normalizeOptionalString(activeGate.closureWitnessClass) ||
        normalizeOptionalString(
          priorityRecoveryObservation?.closureWitnessClass,
        ) ||
        normalizeOptionalString(publicationConvergenceGate?.closureWitnessClass) ||
        normalizeOptionalString(activeGateClosureWitness?.closureWitnessClass),
      progress: canonicalProgress,
    },
  });
}

function buildObservationPublicationGate(priorityRecoveryObservation = null) {
  if (!isRecord(priorityRecoveryObservation)) {
    return null;
  }
  return buildPublicationRecoveryGateSnapshot({
    publicationEpoch: priorityRecoveryObservation.publicationEpoch ?? null,
    publicationStatus: priorityRecoveryObservation.publicationStatus ?? null,
    recoveryProtocolState:
      priorityRecoveryObservation.recoveryProtocolState ?? null,
    priorityRecoveryReasonCodes:
      priorityRecoveryObservation.priorityRecoveryReasonCodes ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
    priorityPartitionSummary:
      priorityRecoveryObservation.priorityPartitionSummary ?? null,
    pendingAckNodeIds:
      priorityRecoveryObservation.pendingAckNodeIds ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  });
}

function resolveRawPublicationConvergenceGate(controlPlane = null) {
  if (isRecord(controlPlane?.publicationConvergenceGate)) {
    return controlPlane.publicationConvergenceGate;
  }
  if (isRecord(controlPlane?.publicationConvergence?.publicationRecoveryGate)) {
    return controlPlane.publicationConvergence.publicationRecoveryGate;
  }
  return null;
}

function resolvePriorityRecoveryClosureWitness(controlPlane = null) {
  if (isRecord(controlPlane?.priorityRecoveryDecisionSnapshots?.closureWitness)) {
    return controlPlane.priorityRecoveryDecisionSnapshots.closureWitness;
  }
  if (isRecord(controlPlane?.publicationConvergenceGate?.priorityRecoveryClosureWitness)) {
    return controlPlane.publicationConvergenceGate.priorityRecoveryClosureWitness;
  }
  if (
    isRecord(controlPlane?.publicationConvergence?.publicationRecoveryGate
      ?.priorityRecoveryClosureWitness)
  ) {
    return controlPlane.publicationConvergence.publicationRecoveryGate
      .priorityRecoveryClosureWitness;
  }
  if (isRecord(controlPlane?.publicationConvergence?.priorityRecoveryClosureWitness)) {
    return controlPlane.publicationConvergence.priorityRecoveryClosureWitness;
  }
  return null;
}

function buildCanonicalPublicationConvergenceGate(controlPlane = null) {
  const publicationConvergence = isRecord(controlPlane?.publicationConvergence) ?
    controlPlane.publicationConvergence :
    null;
  const rawPublicationConvergenceGate =
    resolveRawPublicationConvergenceGate(controlPlane);
  const priorityRecoveryObservation =
    isRecord(controlPlane?.priorityRecoveryObservation) ?
      controlPlane.priorityRecoveryObservation :
      null;
  const priorityRecoveryDecisionSnapshots =
    isRecord(controlPlane?.priorityRecoveryDecisionSnapshots) ?
      controlPlane.priorityRecoveryDecisionSnapshots :
      null;
  const priorityRecoveryClosureWitness =
    resolvePriorityRecoveryClosureWitness(controlPlane);

  if (
    !publicationConvergence &&
    !rawPublicationConvergenceGate &&
    !priorityRecoveryDecisionSnapshots
  ) {
    return null;
  }

  const hasRequiredAckNodeIdEvidence =
    Array.isArray(rawPublicationConvergenceGate?.requiredAckNodeIds) ||
    Array.isArray(publicationConvergence?.requiredAckNodeIds);
  const hasAcknowledgedNodeIdEvidence =
    Array.isArray(rawPublicationConvergenceGate?.acknowledgedNodeIds) ||
    Array.isArray(publicationConvergence?.acknowledgedNodeIds);
  const hasPendingAckNodeIdEvidence =
    Array.isArray(rawPublicationConvergenceGate?.pendingAckNodeIds) ||
    Array.isArray(publicationConvergence?.pendingAckNodeIds) ||
    Array.isArray(priorityRecoveryObservation?.pendingAckNodeIds);
  const canonicalPublicationConvergenceGate = buildPublicationRecoveryGateSnapshot({
    ...(rawPublicationConvergenceGate || {}),
    publicationEpoch:
      rawPublicationConvergenceGate?.publicationEpoch ??
      publicationConvergence?.publicationEpoch ??
      priorityRecoveryObservation?.publicationEpoch ??
      null,
    publicationStatus:
      rawPublicationConvergenceGate?.publicationStatus ??
      publicationConvergence?.publicationStatus ??
      publicationConvergence?.status ??
      priorityRecoveryObservation?.publicationStatus ??
      null,
    publicationObservationState:
      rawPublicationConvergenceGate?.publicationObservationState ??
      publicationConvergence?.publicationObservationState ??
      null,
    recoveryProtocolState:
      rawPublicationConvergenceGate?.recoveryProtocolState ??
      publicationConvergence?.recoveryProtocolState ??
      publicationConvergence?.membershipLifecycleSummary?.recoveryProtocolState ??
      priorityRecoveryObservation?.recoveryProtocolState ??
      null,
    priorityRecoveryReasonCodes:
      rawPublicationConvergenceGate?.reasonCodes ??
      rawPublicationConvergenceGate?.reasons ??
      publicationConvergence?.priorityRecoveryReasonCodes ??
      publicationConvergence?.membershipLifecycleSummary
        ?.priorityRecoveryReasonCodes ??
      priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
    priorityPartitionSummary:
      rawPublicationConvergenceGate?.priorityPartitionSummary ??
      publicationConvergence?.priorityPartitionSummary ??
      priorityRecoveryObservation?.priorityPartitionSummary ??
      null,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness,
    ...(hasRequiredAckNodeIdEvidence ? {
      requiredAckNodeIds:
        rawPublicationConvergenceGate?.requiredAckNodeIds ??
        publicationConvergence?.requiredAckNodeIds,
    } : {}),
    ...(hasAcknowledgedNodeIdEvidence ? {
      acknowledgedNodeIds:
        rawPublicationConvergenceGate?.acknowledgedNodeIds ??
        publicationConvergence?.acknowledgedNodeIds,
    } : {}),
    ...(hasPendingAckNodeIdEvidence ? {
      pendingAckNodeIds:
        rawPublicationConvergenceGate?.pendingAckNodeIds ??
        publicationConvergence?.pendingAckNodeIds ??
        priorityRecoveryObservation?.pendingAckNodeIds,
    } : {}),
    pendingAckCount:
      rawPublicationConvergenceGate?.pendingAckCount ??
      publicationConvergence?.pendingAckCount ??
      priorityRecoveryObservation?.pendingAckCount,
    missingPublishedNodeIds:
      rawPublicationConvergenceGate?.missingPublishedNodeIds ??
      publicationConvergence?.missingPublishedNodeIds ??
      publicationConvergence?.missingPublishedRecoveryActiveNodeIds ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
    missingPublishedCount:
      rawPublicationConvergenceGate?.missingPublishedCount ??
      publicationConvergence?.missingPublishedCount ??
      priorityRecoveryObservation?.missingPublishedCount,
  });
  return Array.isArray(rawPublicationConvergenceGate?.reasons) ?
    {
      ...canonicalPublicationConvergenceGate,
      reasons: normalizeDistinctStringArray(rawPublicationConvergenceGate.reasons),
    } :
    canonicalPublicationConvergenceGate;
}

function buildCanonicalPriorityRecoveryObservation(
  controlPlane = null,
  publicationConvergenceGate = null,
  basePriorityRecoveryObservation = null,
  hasExplicitPublicationConvergenceGate = false,
) {
  const publicationConvergence = isRecord(controlPlane?.publicationConvergence) ?
    controlPlane.publicationConvergence :
    null;
  const explicitPriorityRecoveryObservation =
    isRecord(controlPlane?.priorityRecoveryObservation) ?
      controlPlane.priorityRecoveryObservation :
      null;
  const existingPriorityRecoveryObservation =
    isRecord(basePriorityRecoveryObservation) ?
      basePriorityRecoveryObservation :
      explicitPriorityRecoveryObservation;
  const priorityRecoveryDecisionSnapshots =
    isRecord(controlPlane?.priorityRecoveryDecisionSnapshots) ?
      controlPlane.priorityRecoveryDecisionSnapshots :
      null;
  const priorityRecoveryInvariants =
    isRecord(controlPlane?.priorityRecoveryInvariants) ?
      controlPlane.priorityRecoveryInvariants :
      null;
  const rawActiveGate = normalizePriorityRecoveryActiveGateSnapshot({
    activeGate:
      controlPlane?.activeGate ||
      explicitPriorityRecoveryObservation?.activeGate ||
      existingPriorityRecoveryObservation?.activeGate ||
      null,
    activeGateProgress:
      controlPlane?.activeGateProgress ||
      explicitPriorityRecoveryObservation?.activeGateProgress ||
      existingPriorityRecoveryObservation?.activeGateProgress ||
      null,
    activeGateBestProgress:
      controlPlane?.activeGateBestProgress ||
      explicitPriorityRecoveryObservation?.activeGateBestProgress ||
      existingPriorityRecoveryObservation?.activeGateBestProgress ||
      null,
    activeGateNoProgress:
      controlPlane?.activeGateNoProgress ||
      explicitPriorityRecoveryObservation?.activeGateNoProgress ||
      existingPriorityRecoveryObservation?.activeGateNoProgress ||
      null,
    activeGateBlockerHistory:
      controlPlane?.activeGateBlockerHistory ||
      explicitPriorityRecoveryObservation?.activeGateBlockerHistory ||
      existingPriorityRecoveryObservation?.activeGateBlockerHistory ||
      null,
    activeGateAdmissionState:
      controlPlane?.activeGateAdmissionState ||
      explicitPriorityRecoveryObservation?.activeGateAdmissionState ||
      existingPriorityRecoveryObservation?.activeGateAdmissionState ||
      null,
  });
  const activeGateProgress = rawActiveGate?.progress ||
    explicitPriorityRecoveryObservation?.activeGateProgress ||
    existingPriorityRecoveryObservation?.activeGateProgress ||
    null;
  const activeGateBestProgress = rawActiveGate?.bestProgress ||
    explicitPriorityRecoveryObservation?.activeGateBestProgress ||
    existingPriorityRecoveryObservation?.activeGateBestProgress ||
    null;
  const activeGateNoProgress =
    controlPlane?.activeGateNoProgress ||
    explicitPriorityRecoveryObservation?.activeGateNoProgress ||
    existingPriorityRecoveryObservation?.activeGateNoProgress ||
    null;
  const activeGateBlockerHistory =
    controlPlane?.activeGateBlockerHistory ||
    explicitPriorityRecoveryObservation?.activeGateBlockerHistory ||
    existingPriorityRecoveryObservation?.activeGateBlockerHistory ||
    null;
  const logsTable = isRecord(controlPlane?.logsTable) ? controlPlane.logsTable : null;
  const hasExplicitActiveGateSource =
    isRecord(controlPlane?.activeGate) ||
    isRecord(controlPlane?.activeGateProgress) ||
    isRecord(controlPlane?.activeGateBestProgress) ||
    isRecord(controlPlane?.activeGateNoProgress) ||
    Array.isArray(controlPlane?.activeGateBlockerHistory) ||
    isRecord(controlPlane?.activeGateAdmissionState) ||
    isRecord(explicitPriorityRecoveryObservation?.activeGate) ||
    isRecord(explicitPriorityRecoveryObservation?.activeGateProgress) ||
    isRecord(explicitPriorityRecoveryObservation?.activeGateBestProgress) ||
    isRecord(explicitPriorityRecoveryObservation?.activeGateNoProgress) ||
    Array.isArray(
      explicitPriorityRecoveryObservation?.activeGateBlockerHistory,
    ) ||
    isRecord(explicitPriorityRecoveryObservation?.activeGateAdmissionState);
  const hasCanonicalObservationSource =
    Boolean(publicationConvergence) ||
    hasExplicitPublicationConvergenceGate ||
    Boolean(priorityRecoveryDecisionSnapshots) ||
    Boolean(priorityRecoveryInvariants) ||
    hasExplicitActiveGateSource ||
    Boolean(logsTable);

  if (!hasCanonicalObservationSource) {
    return existingPriorityRecoveryObservation;
  }

  const baseDerivedPriorityRecoveryObservation =
    buildPriorityRecoveryObservationSnapshot({
      publicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryDecisionSnapshots,
      priorityRecoveryInvariants,
      activeGate: rawActiveGate,
      activeGateProgress,
      activeGateBestProgress,
      activeGateNoProgress,
      activeGateBlockerHistory,
      logsTable,
      closureRecordId: existingPriorityRecoveryObservation?.closureRecordId ?? null,
      closureWitnessClass:
      existingPriorityRecoveryObservation?.closureWitnessClass ?? null,
    });
  const canonicalActiveGate = buildCanonicalPriorityRecoveryActiveGate(
    rawActiveGate,
    baseDerivedPriorityRecoveryObservation,
    publicationConvergenceGate,
  );
  const canonicalActiveGateFields = canonicalActiveGate ?
    deriveLegacyPriorityRecoveryActiveGateFields(canonicalActiveGate) :
    {
      activeGateProgress,
      activeGateBestProgress,
      activeGateNoProgress,
      activeGateBlockerHistory,
      activeGateAdmissionState: null,
    };
  const derivedPriorityRecoveryObservation =
    buildPriorityRecoveryObservationSnapshot({
      publicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryDecisionSnapshots,
      priorityRecoveryInvariants,
      activeGate: canonicalActiveGate,
      activeGateProgress: canonicalActiveGateFields.activeGateProgress,
      activeGateBestProgress: canonicalActiveGateFields.activeGateBestProgress,
      activeGateNoProgress: canonicalActiveGateFields.activeGateNoProgress,
      activeGateBlockerHistory:
        canonicalActiveGateFields.activeGateBlockerHistory,
      logsTable,
      closureRecordId:
        existingPriorityRecoveryObservation?.closureRecordId ?? null,
      closureWitnessClass:
        existingPriorityRecoveryObservation?.closureWitnessClass ?? null,
    });
  const canonicalPriorityRecoveryObservation =
    canonicalActiveGate ?
      {
        ...derivedPriorityRecoveryObservation,
        activeGate: canonicalActiveGate,
      } :
      derivedPriorityRecoveryObservation;
  if (
    !existingPriorityRecoveryObservation ||
    !canonicalPriorityRecoveryObservation
  ) {
    return canonicalPriorityRecoveryObservation ||
      existingPriorityRecoveryObservation;
  }
  const existingObservationGate = buildObservationPublicationGate(
    existingPriorityRecoveryObservation,
  );
  const derivedObservationGate = buildObservationPublicationGate(
    canonicalPriorityRecoveryObservation,
  );
  const existingPendingAckNodeIds = normalizeDistinctStringArray(
    existingObservationGate?.pendingAckNodeIds,
  );
  const derivedPendingAckNodeIds = normalizeDistinctStringArray(
    derivedObservationGate?.pendingAckNodeIds,
  );
  const samePublicationGateState =
    normalizeOptionalString(existingObservationGate?.state) ===
      normalizeOptionalString(derivedObservationGate?.state) &&
    normalizeBoolean(existingObservationGate?.publicationPending) ===
      normalizeBoolean(derivedObservationGate?.publicationPending) &&
    normalizeBoolean(existingObservationGate?.prioritySpreadPending) ===
      normalizeBoolean(derivedObservationGate?.prioritySpreadPending) &&
    existingPendingAckNodeIds.length === derivedPendingAckNodeIds.length &&
    existingPendingAckNodeIds.every((nodeId, index) =>
      nodeId === derivedPendingAckNodeIds[index],
    );
  return samePublicationGateState &&
    sameActiveGatePublicationContract(
      existingPriorityRecoveryObservation,
      canonicalPriorityRecoveryObservation,
    ) ?
    existingPriorityRecoveryObservation :
    canonicalPriorityRecoveryObservation;
}

function buildCanonicalPublicationConvergence(
  controlPlane = null,
  publicationConvergenceGate = null,
  priorityRecoveryObservation = null,
) {
  const rawPublicationConvergence =
    isRecord(controlPlane?.publicationConvergence) ?
      controlPlane.publicationConvergence :
      null;
  const activeGateProgress = isRecord(
    priorityRecoveryObservation?.activeGate?.progress,
  ) ?
    priorityRecoveryObservation.activeGate.progress :
    isRecord(priorityRecoveryObservation?.activeGateProgress) ?
      priorityRecoveryObservation.activeGateProgress :
      null;
  if (
    !rawPublicationConvergence &&
    !publicationConvergenceGate &&
    !priorityRecoveryObservation
  ) {
    return null;
  }

  const publicationEpoch =
    normalizePublicationEpoch(priorityRecoveryObservation?.publicationEpoch) ??
    normalizePublicationEpoch(publicationConvergenceGate?.publicationEpoch) ??
    normalizePublicationEpoch(rawPublicationConvergence?.publicationEpoch);
  const publicationStatus =
    normalizeOptionalString(priorityRecoveryObservation?.publicationStatus) ||
    normalizeOptionalString(publicationConvergenceGate?.publicationStatus) ||
    normalizeOptionalString(rawPublicationConvergence?.publicationStatus) ||
    normalizeOptionalString(rawPublicationConvergence?.status);
  const recoveryProtocolState =
    normalizeOptionalString(priorityRecoveryObservation?.recoveryProtocolState) ||
    normalizeOptionalString(publicationConvergenceGate?.recoveryProtocolState) ||
    normalizeOptionalString(rawPublicationConvergence?.recoveryProtocolState) ||
    normalizeOptionalString(
      rawPublicationConvergence?.membershipLifecycleSummary
        ?.recoveryProtocolState,
    );
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
      publicationConvergenceGate?.reasonCodes ??
      publicationConvergenceGate?.reasons ??
      rawPublicationConvergence?.priorityRecoveryReasonCodes ??
      rawPublicationConvergence?.membershipLifecycleSummary
        ?.priorityRecoveryReasonCodes ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
  const priorityPartitionSummary =
    priorityRecoveryObservation?.priorityPartitionSummary ||
    publicationConvergenceGate?.priorityPartitionSummary ||
    rawPublicationConvergence?.priorityPartitionSummary ||
    null;
  const publishedActiveNodeIds = normalizeDistinctStringArray(
    priorityRecoveryObservation?.publishedActiveNodeIds ??
      rawPublicationConvergence?.publishedActiveNodeIds ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
  const hasMergedRequiredAckNodeIdEvidence =
    publicationConvergenceGate?.pendingAckEvidenceState !==
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    rawPublicationConvergence?.pendingAckEvidenceState !==
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    (
      Array.isArray(publicationConvergenceGate?.requiredAckNodeIds) ||
      Array.isArray(rawPublicationConvergence?.requiredAckNodeIds)
    );
  const hasMergedAcknowledgedNodeIdEvidence =
    publicationConvergenceGate?.pendingAckEvidenceState !==
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    rawPublicationConvergence?.pendingAckEvidenceState !==
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    (
      Array.isArray(publicationConvergenceGate?.acknowledgedNodeIds) ||
      Array.isArray(rawPublicationConvergence?.acknowledgedNodeIds)
    );
  const hasMergedPendingAckNodeIdEvidence =
    Array.isArray(priorityRecoveryObservation?.pendingAckNodeIds) ||
    Array.isArray(publicationConvergenceGate?.pendingAckNodeIds) ||
    Array.isArray(rawPublicationConvergence?.pendingAckNodeIds);
  const requiredAckNodeIds = normalizeDistinctStringArray(
    publicationConvergenceGate?.requiredAckNodeIds ??
      rawPublicationConvergence?.requiredAckNodeIds ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
  const acknowledgedNodeIds = normalizeDistinctStringArray(
    publicationConvergenceGate?.acknowledgedNodeIds ??
      rawPublicationConvergence?.acknowledgedNodeIds ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
  const currentPendingAckNodeIds = resolveCurrentPendingAckNodeIds({
    progress: activeGateProgress,
    priorityRecoveryObservation,
    publicationConvergence: rawPublicationConvergence,
    publicationConvergenceGate,
  });
  const pendingAckNodeIds =
    currentPendingAckNodeIds || PUBLICATION_EVIDENCE_EMPTY_LIST;
  const pendingAckCount = currentPendingAckNodeIds !== null ?
    pendingAckNodeIds.length :
    Math.max(
      normalizeNonNegativeInteger(priorityRecoveryObservation?.pendingAckCount) ??
        PUBLICATION_EVIDENCE_ZERO,
      normalizeNonNegativeInteger(publicationConvergenceGate?.pendingAckCount) ??
        PUBLICATION_EVIDENCE_ZERO,
      normalizeNonNegativeInteger(rawPublicationConvergence?.pendingAckCount) ??
        PUBLICATION_EVIDENCE_ZERO,
      normalizeNonNegativeInteger(activeGateProgress?.pendingAckCount) ??
        PUBLICATION_EVIDENCE_ZERO,
    );
  const missingPublishedNodeIds = normalizeDistinctStringArray(
    publicationConvergenceGate?.missingPublishedNodeIds ??
      rawPublicationConvergence?.missingPublishedNodeIds ??
      rawPublicationConvergence?.missingPublishedRecoveryActiveNodeIds ??
      activeGateProgress?.selectedMissingPublishedNodeIds ??
      PUBLICATION_EVIDENCE_EMPTY_LIST,
  );
  const missingPublishedCount = Math.max(
    missingPublishedNodeIds.length,
    normalizeNonNegativeInteger(
      publicationConvergenceGate?.missingPublishedCount,
    ) ?? PUBLICATION_EVIDENCE_ZERO,
    normalizeNonNegativeInteger(
      rawPublicationConvergence?.missingPublishedCount,
    ) ?? PUBLICATION_EVIDENCE_ZERO,
    normalizeNonNegativeInteger(activeGateProgress?.missingPublishedCount) ??
      PUBLICATION_EVIDENCE_ZERO,
  );
  const closureRecordId =
    normalizeOptionalString(priorityRecoveryObservation?.closureRecordId) ||
    normalizeOptionalString(publicationConvergenceGate?.closureRecordId) ||
    normalizeOptionalString(rawPublicationConvergence?.closureRecordId);
  const closureWitnessClass =
    normalizeOptionalString(priorityRecoveryObservation?.closureWitnessClass) ||
    normalizeOptionalString(publicationConvergenceGate?.closureWitnessClass) ||
    normalizeOptionalString(rawPublicationConvergence?.closureWitnessClass);
  const priorityRecoveryClosureWitness =
    publicationConvergenceGate?.priorityRecoveryClosureWitness ||
    rawPublicationConvergence?.priorityRecoveryClosureWitness ||
    null;

  return {
    ...(rawPublicationConvergence || {}),
    ...(publicationEpoch !== null ? {publicationEpoch} : {}),
    ...(publicationStatus ? {status: publicationStatus, publicationStatus} : {}),
    ...(recoveryProtocolState ? {recoveryProtocolState} : {}),
    priorityRecoveryReasonCodes,
    priorityPartitionSummary,
    priorityRecoveryClosureWitness,
    publishedActiveNodeIds,
    ...(hasMergedRequiredAckNodeIdEvidence ? {requiredAckNodeIds} : {}),
    ...(hasMergedAcknowledgedNodeIdEvidence ? {acknowledgedNodeIds} : {}),
    ...(hasMergedPendingAckNodeIdEvidence ? {pendingAckNodeIds} : {}),
    ...(publicationConvergenceGate?.pendingAckEvidenceState ?
      {pendingAckEvidenceState: publicationConvergenceGate.pendingAckEvidenceState} :
      rawPublicationConvergence?.pendingAckEvidenceState ?
        {pendingAckEvidenceState: rawPublicationConvergence.pendingAckEvidenceState} :
        {}),
    pendingAckCount,
    missingPublishedNodeIds,
    missingPublishedCount,
    publicationPending:
      priorityRecoveryObservation?.publicationPending === true ||
      publicationConvergenceGate?.publicationPending === true,
    prioritySpreadPending:
      priorityRecoveryObservation?.prioritySpreadPending === true ||
      publicationConvergenceGate?.prioritySpreadPending === true,
    closureRecordId,
    closureWitnessClass,
    ...(publicationConvergenceGate ?
      {publicationRecoveryGate: publicationConvergenceGate} :
      {}),
  };
}

function buildCanonicalPublicationEvidenceFromControlPlane(controlPlane = null) {
  if (!isRecord(controlPlane)) {
    return Object.freeze({
      publicationConvergence: null,
      publicationConvergenceGate: null,
      priorityRecoveryObservation: null,
    });
  }
  const evidenceControlPlane =
    buildPublicationEvidenceControlPlane(controlPlane);
  const basePublicationEvidence =
    buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: evidenceControlPlane.publicationConvergence,
      publicationConvergenceGate:
        resolveRawPublicationConvergenceGate(evidenceControlPlane),
      priorityRecoveryObservation:
        evidenceControlPlane.priorityRecoveryObservation,
      priorityRecoveryDecisionSnapshots:
        evidenceControlPlane.priorityRecoveryDecisionSnapshots,
      priorityRecoveryInvariants:
        evidenceControlPlane.priorityRecoveryInvariants,
      activeGate: evidenceControlPlane.activeGate,
      activeGateProgress: evidenceControlPlane.activeGateProgress,
      activeGateBestProgress: evidenceControlPlane.activeGateBestProgress,
      activeGateNoProgress: evidenceControlPlane.activeGateNoProgress,
      activeGateBlockerHistory: evidenceControlPlane.activeGateBlockerHistory,
      logsTable: evidenceControlPlane.logsTable,
    });
  const publicationConvergenceGate =
    basePublicationEvidence.publicationConvergenceGate ||
    buildCanonicalPublicationConvergenceGate(evidenceControlPlane);
  const hasExplicitPublicationConvergenceGate = isRecord(
    resolveRawPublicationConvergenceGate(evidenceControlPlane),
  );
  const priorityRecoveryObservation =
    buildCanonicalPriorityRecoveryObservation(
      evidenceControlPlane,
      publicationConvergenceGate,
      basePublicationEvidence.priorityRecoveryObservation,
      hasExplicitPublicationConvergenceGate,
    );
  const publicationConvergence =
    buildCanonicalPublicationConvergence(
      evidenceControlPlane,
      publicationConvergenceGate,
      priorityRecoveryObservation,
    );

  return Object.freeze({
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
  });
}

function buildCanonicalControlPlaneDiagnosticsFromControlPlane(controlPlane = null) {
  if (!isRecord(controlPlane)) {
    return null;
  }
  const publicationEvidence =
    buildCanonicalPublicationEvidenceFromControlPlane(controlPlane);
  const activeGate =
    normalizePriorityRecoveryActiveGateSnapshot({
      activeGate:
        publicationEvidence.priorityRecoveryObservation?.activeGate ||
        controlPlane?.activeGate ||
        null,
      activeGateProgress:
        publicationEvidence.priorityRecoveryObservation?.activeGateProgress ||
        controlPlane?.activeGateProgress ||
        null,
      activeGateBestProgress:
        publicationEvidence.priorityRecoveryObservation?.activeGateBestProgress ||
        controlPlane?.activeGateBestProgress ||
        null,
      activeGateNoProgress:
        publicationEvidence.priorityRecoveryObservation?.activeGateNoProgress ||
        controlPlane?.activeGateNoProgress ||
        null,
      activeGateBlockerHistory:
        publicationEvidence.priorityRecoveryObservation?.activeGateBlockerHistory ||
        controlPlane?.activeGateBlockerHistory ||
        null,
      activeGateAdmissionState:
        controlPlane?.activeGateAdmissionState || null,
    });
  const legacyActiveGateFields = activeGate ?
    deriveLegacyPriorityRecoveryActiveGateFields(activeGate) :
    null;
  return {
    ...controlPlane,
    publicationConvergence:
      publicationEvidence.publicationConvergence ||
      controlPlane.publicationConvergence ||
      null,
    publicationConvergenceGate:
      publicationEvidence.publicationConvergenceGate ||
      controlPlane.publicationConvergenceGate ||
      null,
    priorityRecoveryObservation:
      publicationEvidence.priorityRecoveryObservation ||
      controlPlane.priorityRecoveryObservation ||
      null,
    ...(activeGate ? {activeGate} : {}),
    ...(legacyActiveGateFields || {}),
  };
}

export {
  buildCanonicalControlPlaneDiagnosticsFromControlPlane,
  buildCanonicalPublicationEvidenceFromControlPlane,
};
