import {
  RECOVERY_PROTOCOL_STATE,
} from '../../../src/control-plane/membership-lifecycle-constants.js';
import {classifyActiveGateClosureWitness} from './active-gate-closure-classification.js';
import {normalizePriorityRecoveryActiveGateSnapshot} from './active-gate-contract.js';
import {buildCanonicalPublicationEvidenceFromControlPlane} from
  './publication-evidence-contract.js';
import {
  buildPriorityRecoveryProgressSummary,
  hasMeaningfulPriorityRecoveryProgressWitness,
  normalizePriorityPartitionSummaryForDiagnostics,
  normalizePriorityRecoveryPartitionWitnessesForDiagnostics,
} from './priority-recovery-summary-normalization.js';
import {
  ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE,
  ACTIVE_GATE_READINESS_DELAY_CAUSE_REACHABILITY_TIMEOUT,
  ACTIVE_GATE_READINESS_DELAY_CAUSE_SNAPSHOT_TIMEOUT,
  ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE,
} from './startup-readiness-evidence.js';
import {
  PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  NO_PROGRESS_REASON_CODE,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_PRIORITY_SPREAD_PENDING,
  PRIORITY_RECOVERY_PROGRESS_NONE,
  PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
  PRIORITY_RECOVERY_PROGRESS_REASON_PREFIX,
  PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
  PRIORITY_RECOVERY_REASON_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
  PRIORITY_RECOVERY_SPECIFIC_ACTUATION_STATES,
  READINESS_FAILURE_CLASS_NO_PROGRESS,
  READINESS_FAILURE_GUIDANCE_BY_KIND,
  READINESS_FAILURE_GUIDANCE_KIND,
  ZERO,
  addNormalizedReasonCount,
  isRecord,
  normalizeDistinctStringArray,
  normalizeNonNegativeCount,
} from './failure-bundle-artifact-foundation.js';

function resolvePublicationConvergenceGateReasonCodes(
  publicationConvergenceGate = null,
) {
  const rawReasonCodes = Array.isArray(publicationConvergenceGate?.reasonCodes) ?
    publicationConvergenceGate.reasonCodes :
    Array.isArray(publicationConvergenceGate?.reasons) ?
      publicationConvergenceGate.reasons :
      [];
  return rawReasonCodes
    .map((reason) => String(reason || '').trim())
    .filter((reason) => reason.length > ZERO);
}

function shouldSuppressGateReasonForActivePrioritySpread({
  reason,
  priorityRecoveryReasonCodes,
  prioritySpreadPending,
}) {
  return (
    prioritySpreadPending === true &&
    reason === PRIORITY_RECOVERY_REASON_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE &&
    priorityRecoveryReasonCodes.includes(
      PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
    )
  );
}

function resolveDominantPublicationConvergenceGateReasons({
  publicationConvergenceGateReasons,
  priorityRecoveryReasonCodes,
  prioritySpreadPending,
}) {
  return normalizeDistinctStringArray(publicationConvergenceGateReasons).filter(
    (reason) =>
      !shouldSuppressGateReasonForActivePrioritySpread({
        reason,
        priorityRecoveryReasonCodes,
        prioritySpreadPending,
      }),
  );
}

function isPrioritySpreadSummarySatisfied(summary) {
  return isRecord(summary) && summary.satisfied === true;
}

function resolvePublicationConvergencePendingAckNodeIds(
  publicationDetails = null,
  publicationConvergenceGate = null,
) {
  if (Array.isArray(publicationDetails?.pendingAckNodeIds)) {
    return publicationDetails.pendingAckNodeIds;
  }
  if (Array.isArray(publicationConvergenceGate?.pendingAckNodeIds)) {
    return publicationConvergenceGate.pendingAckNodeIds;
  }
  return [];
}

function isMeaningfulPriorityRecoveryProgressValue(value) {
  return (
    typeof value === 'string' &&
    value.length > ZERO &&
    value !== PRIORITY_RECOVERY_PROGRESS_NONE &&
    value !== PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.UNAVAILABLE
  );
}

export function buildPriorityRecoveryProgressDominantReason(progressSummary = null) {
  const dominantWitness =
    progressSummary?.dominantWitness &&
    typeof progressSummary.dominantWitness === 'object' ?
      progressSummary.dominantWitness :
      null;
  if (!hasMeaningfulPriorityRecoveryProgressWitness(dominantWitness)) {
    return null;
  }
  const reasonParts = [PRIORITY_RECOVERY_PROGRESS_REASON_PREFIX];
  if (isMeaningfulPriorityRecoveryProgressValue(dominantWitness.blockingBoundary)) {
    reasonParts.push(dominantWitness.blockingBoundary);
  } else if (
    isMeaningfulPriorityRecoveryProgressValue(dominantWitness.currentOwner)
  ) {
    reasonParts.push(dominantWitness.currentOwner);
  }
  if (
    isMeaningfulPriorityRecoveryProgressValue(dominantWitness.actuationState) &&
    PRIORITY_RECOVERY_SPECIFIC_ACTUATION_STATES.includes(
      dominantWitness.actuationState,
    )
  ) {
    reasonParts.push(dominantWitness.actuationState);
  } else if (
    isMeaningfulPriorityRecoveryProgressValue(dominantWitness.waitMode)
  ) {
    reasonParts.push(dominantWitness.waitMode);
  } else if (
    isMeaningfulPriorityRecoveryProgressValue(dominantWitness.nextRequiredAction)
  ) {
    reasonParts.push(dominantWitness.nextRequiredAction);
  }
  return reasonParts.length > 1 ?
    reasonParts.join('_') :
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK;
}

function addPriorityRecoveryProgressReasonCounts(
  reasonCounts,
  progressSummary = null,
) {
  if (!isRecord(reasonCounts) || !isRecord(progressSummary)) {
    return null;
  }
  const dominantReason =
    buildPriorityRecoveryProgressDominantReason(progressSummary);
  if (!dominantReason) {
    return null;
  }
  addNormalizedReasonCount(reasonCounts, dominantReason, 1);
  const countMaps = [
    ['actuation_state', progressSummary.actuationStateCounts],
    ['owner', progressSummary.currentOwnerCounts],
    ['blocking_boundary', progressSummary.blockingBoundaryCounts],
    ['wait_mode', progressSummary.waitModeCounts],
    ['next_action', progressSummary.nextRequiredActionCounts],
    ['contract_state', progressSummary.progressContractStateCounts],
    ['pressure_state', progressSummary.pressureStateCounts],
  ];
  for (const [prefix, counts] of countMaps) {
    if (!isRecord(counts)) {
      continue;
    }
    for (const [value, count] of Object.entries(counts)) {
      addNormalizedReasonCount(
        reasonCounts,
        `${PRIORITY_RECOVERY_PROGRESS_REASON_PREFIX}_${prefix}_${value}`,
        count,
      );
    }
  }
  addNormalizedReasonCount(
    reasonCounts,
    'priority_recovery_progress_partition',
    progressSummary.partitionCount || ZERO,
  );
  return dominantReason;
}

export function deriveReasonCountsFromPublicationConvergence(controlPlane = null) {
  const publicationEvidence =
    buildCanonicalPublicationEvidenceFromControlPlane(controlPlane);
  const publicationDetails = publicationEvidence.publicationConvergence;
  const publicationConvergenceGate =
    publicationEvidence.publicationConvergenceGate;
  const priorityRecoveryObservation =
    publicationEvidence.priorityRecoveryObservation;
  const pendingAckNodeIds = resolvePublicationConvergencePendingAckNodeIds(
    publicationDetails,
    publicationConvergenceGate,
  );
  const blockedNodeIds = [];
  const blockingReasonCounts = {};
  for (const [nodeId, readiness] of Object.entries(
    controlPlane?.readinessByNodeId || {},
  )) {
    const reasons = Array.isArray(readiness?.reasons) ? readiness.reasons : [];
    const reasonCodes = reasons
      .map((reason) => String(reason?.code || '').trim())
      .filter((reason) => reason.length > ZERO);
    const publicationReasons = reasonCodes.filter(
      (reason) =>
        reason === 'control_plane_publication_pending' ||
        reason === 'publishedConvergencePending' ||
        reason === 'recovery_eligibility_pending',
    );
    if (publicationReasons.length === ZERO) {
      continue;
    }
    blockedNodeIds.push(nodeId);
    for (const reason of publicationReasons) {
      blockingReasonCounts[reason] = (blockingReasonCounts[reason] || ZERO) + 1;
    }
  }
  const publicationConvergenceGateReasons =
    resolvePublicationConvergenceGateReasonCodes(publicationConvergenceGate);
  const recoveryProtocolState =
    typeof publicationConvergenceGate?.recoveryProtocolState === 'string' ?
      publicationConvergenceGate.recoveryProtocolState :
      typeof priorityRecoveryObservation?.recoveryProtocolState === 'string' ?
        priorityRecoveryObservation.recoveryProtocolState :
        typeof publicationDetails?.recoveryProtocolState === 'string' ?
          publicationDetails.recoveryProtocolState :
          typeof publicationDetails?.membershipLifecycleSummary
            ?.recoveryProtocolState === 'string' ?
            publicationDetails.membershipLifecycleSummary.recoveryProtocolState :
            null;
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
      publicationConvergenceGate?.reasonCodes ??
      publicationConvergenceGate?.reasons ??
      publicationDetails?.priorityRecoveryReasonCodes ??
      publicationDetails?.membershipLifecycleSummary
        ?.priorityRecoveryReasonCodes ??
      publicationDetails?.membershipLifecycleSummary
        ?.recoveryProtocolReasonCodes,
  );
  const priorityPartitionSummary = normalizePriorityPartitionSummaryForDiagnostics(
    priorityRecoveryObservation?.priorityPartitionSummary ??
      publicationDetails?.priorityPartitionSummary ??
      publicationConvergenceGate?.priorityPartitionSummary ??
      null,
  );
  const prioritySpreadSatisfied = isPrioritySpreadSummarySatisfied(
    priorityPartitionSummary,
  );
  const hasPrioritySpreadReason =
    priorityRecoveryReasonCodes.includes(
      PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
    );
  const prioritySpreadPending =
    prioritySpreadSatisfied !== true &&
    (
      priorityRecoveryObservation?.prioritySpreadPending === true ||
      publicationConvergenceGate?.prioritySpreadPending === true ||
      publicationDetails?.prioritySpreadPending === true ||
      (
        recoveryProtocolState ===
          RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING &&
        hasPrioritySpreadReason
      )
    );
  const publicationPending =
    priorityRecoveryObservation?.publicationPending === true ||
    publicationConvergenceGate?.publicationPending === true ||
    publicationDetails?.publicationPending === true;
  const activeGate = normalizePriorityRecoveryActiveGateSnapshot({
    activeGate: controlPlane?.activeGate || null,
    activeGateProgress: controlPlane?.activeGateProgress || null,
    activeGateAdmissionState: controlPlane?.activeGateAdmissionState || null,
  });
  const activeGateProgress = activeGate?.progress || null;
  const activeGateBestSnapshot = activeGate?.bestProgress || null;
  const activeGateSnapshotCoverage =
    controlPlane?.activeGateSnapshotCoverage &&
    typeof controlPlane.activeGateSnapshotCoverage === 'object' ?
      controlPlane.activeGateSnapshotCoverage :
      null;
  const closureProgressSnapshot =
    activeGateProgress ||
    activeGateBestSnapshot ||
    (activeGateSnapshotCoverage ?
      {
        snapshotCoverageComplete:
            activeGateSnapshotCoverage.completeCoverage === true,
        publicationStatus:
            publicationDetails?.publicationStatus ||
            publicationConvergenceGate?.publicationStatus ||
            activeGateSnapshotCoverage?.selectedPublicationConvergence
              ?.publicationStatus ||
            activeGateSnapshotCoverage?.selectedPublishedMembershipObservation
              ?.publicationStatus ||
            null,
        pendingAckCount: pendingAckNodeIds.length,
        missingPublishedCount: Array.isArray(
          publicationConvergenceGate?.missingPublishedNodeIds,
        ) ?
          publicationConvergenceGate.missingPublishedNodeIds.length :
          ZERO,
        recoveryProtocolState,
        priorityRecoveryReasonCodes,
        gateReasons: publicationConvergenceGateReasons,
        prioritySpreadSatisfied:
            priorityPartitionSummary?.satisfied === true ?
              true :
              priorityPartitionSummary?.satisfied === false ?
                false :
                null,
      } :
      null);
  const activeGateClosureWitness = classifyActiveGateClosureWitness({
    progressSnapshot: closureProgressSnapshot,
    bestProgressSnapshot: activeGateBestSnapshot,
    publicationConvergence: publicationDetails,
    publicationConvergenceGate,
    readinessMode: activeGate?.mode || null,
  });
  const normalizedPriorityRecoveryPartitionWitnesses =
    normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
      priorityRecoveryObservation?.priorityRecoveryPartitionWitnesses,
    );
  const allowPriorityRecoveryProgressSummary =
    pendingAckNodeIds.length === ZERO &&
    blockedNodeIds.length === ZERO &&
    (
      controlPlane?.hasExplicitPriorityRecoveryObservation !== true ||
      (
        publicationPending !== true &&
        prioritySpreadPending !== true
      )
    );
  const priorityRecoveryProgressSummary =
    allowPriorityRecoveryProgressSummary ?
      buildPriorityRecoveryProgressSummary(priorityRecoveryObservation) :
      null;
  const priorityRecoveryProgressClassCount =
    priorityRecoveryObservation?.priorityRecoveryProgressClassCount ??
    new Set(normalizedPriorityRecoveryPartitionWitnesses.flatMap((witness) =>
      Array.isArray(witness?.progressClassIds) ? witness.progressClassIds : [],
    )).size;
  const failingInvariantIds = normalizeDistinctStringArray([
    ...(Array.isArray(controlPlane?.priorityRecoveryInvariants?.failingInvariantIds) ?
      controlPlane.priorityRecoveryInvariants.failingInvariantIds :
      []),
    ...(Array.isArray(controlPlane?.priorityRecoveryInvariants?.invariants) ?
      controlPlane.priorityRecoveryInvariants.invariants
        .filter((invariant) => invariant?.passed !== true)
        .map((invariant) => invariant?.id) :
      []),
  ]);
  const publicationConvergence = !publicationDetails &&
    !publicationConvergenceGate &&
    !activeGate &&
    !activeGateProgress &&
    !activeGateBestSnapshot &&
    priorityRecoveryProgressClassCount === ZERO &&
    failingInvariantIds.length === ZERO ?
    null :
    {
      blockingReasonCounts,
      publicationConvergenceGateReasons,
      priorityRecoveryReasonCodes,
      pendingAckCount: pendingAckNodeIds.length,
      blockedNodeCount: blockedNodeIds.length,
      publicationPending,
      prioritySpreadPending,
      ...(activeGate ? {activeGate} : {}),
      closureWitnessClass:
            activeGate?.closureWitnessClass ||
            activeGateProgress?.closureWitnessClass ||
            activeGateBestSnapshot?.closureWitnessClass ||
            activeGateClosureWitness?.closureWitnessClass ||
            null,
      priorityRecoveryProgressClassCount,
      priorityRecoveryProgressSummary,
      priorityRecoveryInvariantFailingIds: failingInvariantIds,
    };
  if (!publicationConvergence || typeof publicationConvergence !== 'object') {
    return {};
  }
  const reasonCounts = {};
  if (isRecord(publicationConvergence.blockingReasonCounts)) {
    for (const [reason, count] of Object.entries(
      publicationConvergence.blockingReasonCounts,
    )) {
      addNormalizedReasonCount(reasonCounts, reason, count);
    }
  }
  const dominantPublicationConvergenceGateReasons =
    resolveDominantPublicationConvergenceGateReasons({
      publicationConvergenceGateReasons:
        publicationConvergence.publicationConvergenceGateReasons,
      priorityRecoveryReasonCodes:
        publicationConvergence.priorityRecoveryReasonCodes,
      prioritySpreadPending: publicationConvergence.prioritySpreadPending,
    });
  for (const reason of dominantPublicationConvergenceGateReasons) {
    addNormalizedReasonCount(reasonCounts, reason, 1);
  }
  for (const reason of normalizeDistinctStringArray(
    publicationConvergence.priorityRecoveryReasonCodes,
  )) {
    addNormalizedReasonCount(reasonCounts, reason, 1);
  }
  addNormalizedReasonCount(
    reasonCounts,
    'publication_pending_ack',
    publicationConvergence.pendingAckCount || ZERO,
  );
  addNormalizedReasonCount(
    reasonCounts,
    'publication_blocked_nodes',
    publicationConvergence.blockedNodeCount || ZERO,
  );
  if (publicationConvergence.publicationPending === true) {
    addNormalizedReasonCount(reasonCounts, 'publication_pending', 1);
  }
  if (publicationConvergence.prioritySpreadPending === true) {
    addNormalizedReasonCount(reasonCounts, 'priority_spread_pending', 1);
  }
  if (
    publicationConvergence.closureWitnessClass &&
    typeof publicationConvergence.closureWitnessClass === 'string'
  ) {
    const normalizedClosureWitness =
      publicationConvergence.closureWitnessClass.trim();
    const closureWitnessHasOpenPublicationEvidence =
      publicationConvergence.publicationPending === true ||
      publicationConvergence.prioritySpreadPending === true ||
      normalizeNonNegativeCount(publicationConvergence.pendingAckCount) >
        ZERO ||
      normalizeNonNegativeCount(
        publicationConvergence.priorityRecoveryProgressClassCount,
      ) > ZERO;
    const closureWitnessIsStalePrioritySpread =
      normalizedClosureWitness ===
        PRIORITY_RECOVERY_CLOSURE_WITNESS_PRIORITY_SPREAD_PENDING &&
      closureWitnessHasOpenPublicationEvidence !== true;
    if (
      normalizedClosureWitness.length > ZERO &&
      closureWitnessIsStalePrioritySpread !== true
    ) {
      addNormalizedReasonCount(
        reasonCounts,
        'closure_witness_' + normalizedClosureWitness,
        1,
      );
    }
  }
  if (publicationConvergence.priorityRecoveryProgressClassCount > ZERO) {
    addNormalizedReasonCount(
      reasonCounts,
      'priority_recovery_progress_class',
      publicationConvergence.priorityRecoveryProgressClassCount,
    );
  }
  addPriorityRecoveryProgressReasonCounts(
    reasonCounts,
    publicationConvergence.priorityRecoveryProgressSummary,
  );
  if (
    Array.isArray(publicationConvergence.priorityRecoveryInvariantFailingIds) &&
    publicationConvergence.priorityRecoveryInvariantFailingIds.length > ZERO
  ) {
    addNormalizedReasonCount(
      reasonCounts,
      'priority_recovery_invariant_failure',
      publicationConvergence.priorityRecoveryInvariantFailingIds.length,
    );
  }
  return reasonCounts;
}

export function normalizeActiveGateReadinessDelay(rawDelay = null) {
  if (!isRecord(rawDelay)) {
    return null;
  }
  const normalized = {
    timedOut: rawDelay.timedOut === true,
    cause: typeof rawDelay.cause === 'string' ? rawDelay.cause.trim() : null,
    source: typeof rawDelay.source === 'string' ? rawDelay.source.trim() : null,
    recoverability:
      typeof rawDelay.recoverability === 'string' ?
        rawDelay.recoverability.trim() :
        null,
    error: typeof rawDelay.error === 'string' ? rawDelay.error.trim() : null,
  };
  if (
    normalized.timedOut === false &&
    normalized.cause === null &&
    normalized.source === null &&
    normalized.recoverability === null &&
    normalized.error === null
  ) {
    return null;
  }
  return normalized;
}

export function appendActiveGateReadinessDelaySignals(signals = [], delay = null) {
  if (!Array.isArray(signals)) {
    return [];
  }
  const normalized = normalizeActiveGateReadinessDelay(delay);
  if (!normalized) {
    return signals;
  }
  signals.push(
    'activeGateReadinessDelay=' +
      (normalized.timedOut === true ? 'timeout' : 'none'),
  );
  if (
    normalized.cause &&
    normalized.cause !== ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE
  ) {
    signals.push('activeGateReadinessCause=' + normalized.cause);
  }
  if (normalized.recoverability) {
    signals.push(
      'activeGateReadinessRecoverability=' + normalized.recoverability,
    );
  }
  if (normalized.source) {
    signals.push('activeGateReadinessDelaySource=' + normalized.source);
  }
  return signals;
}

export function appendReadinessFailureSignals(signals = [], readinessFailure = null) {
  const normalized = normalizeReadinessFailure(readinessFailure);
  if (!normalized) {
    return signals;
  }
  if (normalized.classCode) {
    signals.push('activeGateReadinessClass=' + normalized.classCode);
  }
  if (normalized.recoverability) {
    signals.push(
      'activeGateReadinessRecoverability=' + normalized.recoverability,
    );
  }
  if (normalized.mode) {
    signals.push('activeGateReadinessMode=' + normalized.mode);
  }
  if (Number.isInteger(normalized.progressSignal?.attemptsSinceProgress)) {
    signals.push(
      'activeGateReadinessProgressAttemptsSince=' +
        String(normalized.progressSignal.attemptsSinceProgress),
    );
  }
  if (Number.isInteger(normalized.progressSignal?.maxAttempts)) {
    signals.push(
      'activeGateReadinessProgressMaxAttempts=' +
        String(normalized.progressSignal.maxAttempts),
    );
  }
  if (normalized.terminalReason) {
    signals.push(
      'activeGateReadinessTerminalReason=' + normalized.terminalReason,
    );
  }
  return signals;
}

export function normalizeReadinessFailure(rawReadinessFailure = null) {
  if (!isRecord(rawReadinessFailure)) {
    return null;
  }
  const progressSignal = isRecord(rawReadinessFailure.progressSignal) ?
    rawReadinessFailure.progressSignal :
    null;
  const normalized = {
    mode:
      typeof rawReadinessFailure.mode === 'string' &&
      rawReadinessFailure.mode.length > ZERO ?
        rawReadinessFailure.mode :
        null,
    classCode:
      typeof rawReadinessFailure.classCode === 'string' &&
      rawReadinessFailure.classCode.length > ZERO ?
        rawReadinessFailure.classCode :
        null,
    recoverability:
      typeof rawReadinessFailure.recoverability === 'string' &&
      rawReadinessFailure.recoverability.length > ZERO ?
        rawReadinessFailure.recoverability :
        null,
    progressSignal: isRecord(progressSignal) ?
      {
        attemptsSinceProgress: Number.isInteger(
          progressSignal.attemptsSinceProgress,
        ) ?
          Math.max(ZERO, progressSignal.attemptsSinceProgress) :
          null,
        maxAttempts:
            Number.isInteger(progressSignal.maxAttempts) &&
            progressSignal.maxAttempts > ZERO ?
              Math.max(ZERO, progressSignal.maxAttempts) :
              null,
        stalled: progressSignal.stalled === true,
      } :
      null,
    terminalReason:
      typeof rawReadinessFailure.terminalReason === 'string' &&
      rawReadinessFailure.terminalReason.length > ZERO ?
        rawReadinessFailure.terminalReason :
        null,
    source:
      typeof rawReadinessFailure.source === 'string' &&
      rawReadinessFailure.source.length > ZERO ?
        rawReadinessFailure.source :
        null,
    cause:
      typeof rawReadinessFailure.cause === 'string' &&
      rawReadinessFailure.cause.length > ZERO ?
        rawReadinessFailure.cause :
        null,
    error:
      typeof rawReadinessFailure.error === 'string' &&
      rawReadinessFailure.error.length > ZERO ?
        rawReadinessFailure.error :
        null,
  };
  if (
    normalized.classCode === null &&
    normalized.recoverability === null &&
    normalized.terminalReason === null &&
    normalized.source === null &&
    normalized.cause === null &&
    normalized.error === null
  ) {
    return null;
  }
  return normalized;
}

export function hasBlockingReadinessFailure(readinessFailure = null) {
  const normalized = normalizeReadinessFailure(readinessFailure);
  if (!normalized) {
    return false;
  }
  const readinessDelayCause =
    typeof normalized.cause === 'string' ? normalized.cause : null;
  return (
    normalized.classCode !== null ||
    normalized.terminalReason !== null ||
    (readinessDelayCause !== null &&
      readinessDelayCause !== ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE) ||
    normalized.progressSignal?.stalled === true
  );
}

export function resolveReadinessFailure(controlPlane = {}) {
  const resolvedActiveGate = normalizePriorityRecoveryActiveGateSnapshot({
    activeGate: controlPlane?.activeGate || null,
    activeGateProgress: controlPlane?.activeGateProgress || null,
    activeGateAdmissionState: controlPlane?.activeGateAdmissionState || null,
  });
  const explicit = normalizeReadinessFailure(
    resolvedActiveGate?.readinessFailure || null,
  );
  if (explicit) {
    return explicit;
  }
  const readinessDelay = normalizeActiveGateReadinessDelay(
    resolvedActiveGate?.readinessDelay ||
      controlPlane?.activeGateProgress?.readinessDelay ||
      null,
  );
  if (!isRecord(resolvedActiveGate) && !readinessDelay) {
    return null;
  }
  const attemptsSinceProgress = Number.isInteger(
    resolvedActiveGate?.attemptsSinceProgress,
  ) ?
    Math.max(ZERO, resolvedActiveGate.attemptsSinceProgress) :
    null;
  const maxAttempts =
    Number.isInteger(resolvedActiveGate?.maxAttempts) &&
    resolvedActiveGate.maxAttempts > ZERO ?
      Math.max(ZERO, resolvedActiveGate.maxAttempts) :
      null;
  const stalled = resolvedActiveGate?.state === 'stalled';
  const reasonCode = resolvedActiveGate?.reasonCode;
  const classCode =
    readinessDelay &&
    readinessDelay.timedOut === true &&
    readinessDelay.cause !== ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE ?
      readinessDelay.cause :
      stalled || reasonCode === NO_PROGRESS_REASON_CODE ?
        READINESS_FAILURE_CLASS_NO_PROGRESS :
        null;
  return normalizeReadinessFailure({
    mode: resolvedActiveGate?.mode || null,
    classCode,
    recoverability: readinessDelay?.recoverability || null,
    progressSignal: {
      attemptsSinceProgress,
      maxAttempts,
      stalled,
    },
    terminalReason:
      typeof reasonCode === 'string' && reasonCode.length > ZERO ?
        reasonCode :
        null,
    source: readinessDelay?.source || null,
    cause: readinessDelay?.cause || null,
    error: readinessDelay?.error || null,
  });
}

export function resolveReadinessFailureGuidance(readinessFailure = null) {
  if (!isRecord(readinessFailure) || readinessFailure.classCode === null) {
    return READINESS_FAILURE_GUIDANCE_BY_KIND[
      READINESS_FAILURE_GUIDANCE_KIND.NONE
    ];
  }
  if (
    readinessFailure.classCode ===
      ACTIVE_GATE_READINESS_DELAY_CAUSE_SNAPSHOT_TIMEOUT ||
    readinessFailure.classCode ===
      ACTIVE_GATE_READINESS_DELAY_CAUSE_REACHABILITY_TIMEOUT
  ) {
    if (
      readinessFailure.recoverability ===
      ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE
    ) {
      return READINESS_FAILURE_GUIDANCE_BY_KIND[
        READINESS_FAILURE_GUIDANCE_KIND.RECOVERABLE_DELAY
      ];
    }
    return READINESS_FAILURE_GUIDANCE_BY_KIND[
      READINESS_FAILURE_GUIDANCE_KIND.BLOCKING_DELAY
    ];
  }
  if (readinessFailure.classCode === READINESS_FAILURE_CLASS_NO_PROGRESS) {
    return READINESS_FAILURE_GUIDANCE_BY_KIND[
      READINESS_FAILURE_GUIDANCE_KIND.NO_PROGRESS
    ];
  }
  return READINESS_FAILURE_GUIDANCE_BY_KIND[
    READINESS_FAILURE_GUIDANCE_KIND.DEFAULT
  ];
}
