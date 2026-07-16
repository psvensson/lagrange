import {
  buildPublicationRecoveryGateSnapshot,
} from
  './publication-recovery-gate.js';
import {
  buildPriorityRecoveryClosureWitness,
} from './priority-recovery-snapshot-active-gate.js';

import {
  isRecord,
  isPublicationRecoveryAckNodeListProvided,
  resolvePublicationRecoveryAckNodeListInput,
  resolvePublicationRecoveryGateRequiredAckNodeListInput,
  resolvePublicationRecoveryGateAcknowledgedNodeListInput,
  resolvePublicationRecoveryConvergenceRequiredAckNodeListInput,
  resolvePublicationRecoveryConvergenceAcknowledgedNodeListInput,
  hasAuthoritativeEmptyPendingAckGate,
  hasAuthoritativeEmptyMissingPublishedGate,
  normalizePublicationRecoveryAckEvidence,
  resolvePublicationRecoveryPendingAckNodeIds,
  resolveActiveGateSelectedMissingPublishedEvidence,
  resolveActiveGateSelectedPublicationMembershipNodeIds,
  hasActiveGateSelectedPublicationMembershipOpenEvidence,
  hasSelectedPublicationMembershipClosureEvidence,
  resolveEffectivePublicationMembershipNodeIds,
  hasSteadyPublishedSelectedPublicationMembershipOpen,
  hasActiveGateSelectedMissingPublishedEvidence,
  normalizeOptionalString,
  hasCountOnlyUnknownPublicationDeficit,
  resolveOwnerReconcileNarrowedMissingPublishedNodeIds,
  resolvePublicationMissingPublishedNodeIds,
  resolvePublicationMissingPublishedCount,
  activeGateOpenDebtOutrunsPublicationOwnerStream,
  ownerReconcileNarrowingRefreshesPublicationOwnerStream,
  alignPublicationRecoveryGateOwnerStreamWithOpenDebt,
  normalizeActiveGateProgressRecords,
  resolvePublicationRecoveryActiveGateHandoff,
  enrichPublicationRecoveryActiveGateHandoff,
  resolveActiveGateProgressString,
  normalizeActiveGateProgressNodeIds,
  normalizeActiveGateProgressCount,
  normalizePriorityRecoveryDecisionPendingAckNodeIds,
  resolveRawPublicationConvergenceGate,
  resolvePriorityRecoveryClosureWitness,
  resolveAuthoritativePublicationMembershipNodeIds,
  resolveRelevantPublicationMembershipNodeIds,
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD,
  PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE,
  PUBLICATION_RECOVERY_PUBLICATION_STATUS,
  PUBLICATION_RECOVERY_PROTOCOL_STATE,
} from './publication-recovery-evidence-normalizers.js';
import {normalizeDistinctStringArray} from
  './publication-recovery-evidence-values.js';

function resolveCanonicalPriorityPartitionSummary(context) {
  if (
    context.rawPublicationConvergenceGate
      ?.durablePriorityPartitionSummary
  ) {
    return context.rawPublicationConvergenceGate
      .durablePriorityPartitionSummary;
  }
  if (context.rawPublicationConvergenceGate?.priorityPartitionSummary) {
    return context.rawPublicationConvergenceGate.priorityPartitionSummary;
  }
  if (context.publicationConvergence?.priorityPartitionSummary) {
    return context.publicationConvergence.priorityPartitionSummary;
  }
  return context.priorityRecoveryObservation?.priorityPartitionSummary || null;
}

function resolveCanonicalPriorityRecoveryClosureWitness(context) {
  const {
    providedPriorityRecoveryClosureWitness,
    priorityRecoveryDecisionSnapshots,
  } = context;
  if (providedPriorityRecoveryClosureWitness) {
    return providedPriorityRecoveryClosureWitness;
  }
  return buildPriorityRecoveryClosureWitness({
    decisionSnapshots: priorityRecoveryDecisionSnapshots,
    priorityPartitionSummary: resolveCanonicalPriorityPartitionSummary(context),
  });
}

function buildCanonicalPublicationConvergenceGate(options = {}) {
  const publicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const priorityRecoveryObservation = isRecord(
    options.priorityRecoveryObservation,
  ) ?
    options.priorityRecoveryObservation :
    null;
  const priorityRecoveryDecisionSnapshots = isRecord(
    options.priorityRecoveryDecisionSnapshots,
  ) ?
    options.priorityRecoveryDecisionSnapshots :
    null;
  const rawPublicationConvergenceGate = resolveRawPublicationConvergenceGate(
    publicationConvergence,
    options.publicationConvergenceGate,
  );
  const providedPriorityRecoveryClosureWitness = isRecord(
    options.priorityRecoveryClosureWitness,
  ) ?
    options.priorityRecoveryClosureWitness :
    resolvePriorityRecoveryClosureWitness(
      publicationConvergence,
      rawPublicationConvergenceGate,
      priorityRecoveryDecisionSnapshots,
    );
  const priorityRecoveryClosureWitness =
    resolveCanonicalPriorityRecoveryClosureWitness({
      providedPriorityRecoveryClosureWitness,
      priorityRecoveryDecisionSnapshots,
      rawPublicationConvergenceGate,
      publicationConvergence,
      priorityRecoveryObservation,
    });
  const activeGateProgressRecords = normalizeActiveGateProgressRecords({
    activeGate:
      options.activeGate ||
      publicationConvergence?.activeGate ||
      priorityRecoveryObservation?.activeGate,
    activeGateProgress:
      options.activeGateProgress ||
      publicationConvergence?.activeGateProgress ||
      priorityRecoveryObservation?.activeGateProgress,
    activeGateBestProgress:
      options.activeGateBestProgress ||
      publicationConvergence?.activeGateBestProgress ||
      priorityRecoveryObservation?.activeGateBestProgress,
  });
  const activeGatePublicationStatus = resolveActiveGateProgressString(
    activeGateProgressRecords,
    PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.PUBLICATION_STATUS,
  );
  const activeGateRecoveryProtocolState = resolveActiveGateProgressString(
    activeGateProgressRecords,
    PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.RECOVERY_PROTOCOL_STATE,
  );
  const activeGatePendingAckNodeIds = normalizeActiveGateProgressNodeIds(
    activeGateProgressRecords,
    [
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.PENDING_ACK_NODE_IDS,
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .SELECTED_PENDING_ACK_NODE_IDS,
    ],
  );
  const decisionPendingAckNodeIds =
    normalizePriorityRecoveryDecisionPendingAckNodeIds(
      priorityRecoveryDecisionSnapshots,
    );
  const activeGateMissingPublishedNodeIds = normalizeActiveGateProgressNodeIds(
    activeGateProgressRecords,
    [
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .MISSING_PUBLISHED_NODE_IDS,
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .SELECTED_MISSING_PUBLISHED_NODE_IDS,
    ],
  );
  const selectedMissingPublishedEvidence =
    resolveActiveGateSelectedMissingPublishedEvidence(
      activeGateProgressRecords,
    );
  const selectedMissingPublishedEvidenceAvailable =
    hasActiveGateSelectedMissingPublishedEvidence(
      selectedMissingPublishedEvidence,
    );
  const requiredAckNodeListInput = resolvePublicationRecoveryAckNodeListInput([
    resolvePublicationRecoveryGateRequiredAckNodeListInput(
      rawPublicationConvergenceGate,
    ),
    resolvePublicationRecoveryConvergenceRequiredAckNodeListInput(
      publicationConvergence,
    ),
  ]);
  const acknowledgedNodeListInput = resolvePublicationRecoveryAckNodeListInput([
    resolvePublicationRecoveryGateAcknowledgedNodeListInput(
      rawPublicationConvergenceGate,
    ),
    resolvePublicationRecoveryConvergenceAcknowledgedNodeListInput(
      publicationConvergence,
    ),
  ]);
  const authoritativeEmptyPendingAckGate =
    hasAuthoritativeEmptyPendingAckGate(rawPublicationConvergenceGate);
  const authoritativeEmptyMissingPublishedGate =
    hasAuthoritativeEmptyMissingPublishedGate(rawPublicationConvergenceGate);
  const pendingAckEvidence = normalizePublicationRecoveryAckEvidence({
    requiredAckNodeListInput,
    acknowledgedNodeIds: acknowledgedNodeListInput.value,
    openCountOnlyAckIsStale:
      !hasActiveGateSelectedPublicationMembershipOpenEvidence(
        activeGateProgressRecords,
      ),
    publicationStatus:
      rawPublicationConvergenceGate?.publicationStatus ??
      publicationConvergence?.publicationStatus ??
      publicationConvergence?.status ??
      priorityRecoveryObservation?.publicationStatus ??
      activeGatePublicationStatus,
    pendingAckNodeIds: resolvePublicationRecoveryPendingAckNodeIds({
      requiredAckNodeListInput,
      ownerPendingAckNodeIds: [
        ...normalizeDistinctStringArray(rawPublicationConvergenceGate
          ?.pendingAckNodeIds),
        ...normalizeDistinctStringArray(
          publicationConvergence?.pendingAckNodeIds,
        ),
      ],
      fallbackPendingAckNodeIds: [
        ...(authoritativeEmptyPendingAckGate ?
          PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST :
          normalizeDistinctStringArray(priorityRecoveryObservation
            ?.pendingAckNodeIds)),
        ...(authoritativeEmptyPendingAckGate ?
          PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST :
          activeGatePendingAckNodeIds),
        ...(authoritativeEmptyPendingAckGate ?
          PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST :
          decisionPendingAckNodeIds),
      ],
    }),
    pendingAckCountValues: [
      rawPublicationConvergenceGate?.pendingAckCount,
      publicationConvergence?.pendingAckCount,
      ...(authoritativeEmptyPendingAckGate ?
        PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST :
        [
          priorityRecoveryObservation?.pendingAckCount,
          normalizeActiveGateProgressCount(
            activeGateProgressRecords,
            PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.PENDING_ACK_COUNT,
          ),
        ]),
    ],
  });
  const selectedPublicationMembershipNodeIds =
    resolveActiveGateSelectedPublicationMembershipNodeIds(
      activeGateProgressRecords,
    );
  const publicationStatus =
    rawPublicationConvergenceGate?.publicationStatus ??
    publicationConvergence?.publicationStatus ??
    publicationConvergence?.status ??
    priorityRecoveryObservation?.publicationStatus ??
    activeGatePublicationStatus ??
    null;
  const recoveryProtocolState =
    rawPublicationConvergenceGate?.recoveryProtocolState ??
    publicationConvergence?.recoveryProtocolState ??
    publicationConvergence?.membershipLifecycleSummary
      ?.recoveryProtocolState ??
    priorityRecoveryObservation?.recoveryProtocolState ??
    activeGateRecoveryProtocolState ??
    null;
  const publicationEpoch =
    rawPublicationConvergenceGate?.publicationEpoch ??
    publicationConvergence?.publicationEpoch ??
    priorityRecoveryObservation?.publicationEpoch ??
    null;
  const rawPublicationActiveGateHandoff =
    options.publicationActiveGateHandoff ||
    resolvePublicationRecoveryActiveGateHandoff(
      activeGateProgressRecords,
      rawPublicationConvergenceGate,
      publicationConvergence,
    );
  const publicationActiveGateHandoff =
    enrichPublicationRecoveryActiveGateHandoff({
      publicationActiveGateHandoff: rawPublicationActiveGateHandoff,
      publicationConvergence,
      priorityRecoveryObservation,
    });
  const selectedMembershipClosesStaleOpenPublication =
    hasSelectedPublicationMembershipClosureEvidence({
      publicationStatus: normalizeOptionalString(publicationStatus),
      pendingAckEvidence,
      activeGateProgressRecords,
    });
  const selectedMembershipPublicationStatus =
    selectedMembershipClosesStaleOpenPublication ?
      PUBLICATION_RECOVERY_PUBLICATION_STATUS.PUBLISHED :
      publicationStatus;
  const selectedMembershipRecoveryProtocolState =
    selectedMembershipClosesStaleOpenPublication ?
      PUBLICATION_RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED :
      recoveryProtocolState;
  const authoritativePublicationMembershipNodeIds =
    resolveAuthoritativePublicationMembershipNodeIds({
      publicationConvergence,
      publicationConvergenceGate: rawPublicationConvergenceGate,
      requiredAckNodeIds: pendingAckEvidence.requiredAckNodeIds,
      acknowledgedNodeIds: pendingAckEvidence.acknowledgedNodeIds,
      pendingAckNodeIds: pendingAckEvidence.pendingAckNodeIds,
    });
  const authoritativePublicationMembershipAvailable =
    authoritativePublicationMembershipNodeIds.length > 0;
  const steadyPublishedSelectedPublicationMembershipOpen =
    hasSteadyPublishedSelectedPublicationMembershipOpen({
      publicationConvergence,
      publicationConvergenceGate: rawPublicationConvergenceGate,
      priorityRecoveryObservation,
      activeGateProgressRecords,
      pendingAckCount: pendingAckEvidence.pendingAckCount,
    });
  const effectivePublicationMembershipNodeIds =
    resolveEffectivePublicationMembershipNodeIds({
      authoritativePublicationMembershipNodeIds,
      selectedPublicationMembershipNodeIds,
      selectedPublicationMembershipOpen:
        pendingAckEvidence.pendingAckCount > 0 ||
        steadyPublishedSelectedPublicationMembershipOpen === true ||
        rawPublicationConvergenceGate?.publicationPending === true ||
        publicationConvergence?.publicationPending === true,
    });
  const ownerReconcileNarrowedMissingPublishedNodeIds =
    resolveOwnerReconcileNarrowedMissingPublishedNodeIds({
      publicationStatus,
      pendingAckEvidence,
      publicationActiveGateHandoff,
    });
  const authoritativeMissingPublishedNodeIds = normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(rawPublicationConvergenceGate
      ?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence
      ?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence
      ?.missingPublishedRecoveryActiveNodeIds),
  ]);
  const observedMissingPublishedCleared =
    authoritativeEmptyMissingPublishedGate &&
    steadyPublishedSelectedPublicationMembershipOpen !== true;
  const observedMissingPublishedNodeIds = normalizeDistinctStringArray([
    ...(observedMissingPublishedCleared ?
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST :
      normalizeDistinctStringArray(priorityRecoveryObservation
        ?.missingPublishedNodeIds)),
    ...(observedMissingPublishedCleared ?
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST :
      activeGateMissingPublishedNodeIds),
    ...(selectedMissingPublishedEvidenceAvailable &&
      observedMissingPublishedCleared !== true ?
      selectedMissingPublishedEvidence.nodeIds :
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST),
  ]);
  const countOnlyUnknownPublicationDeficit =
    hasCountOnlyUnknownPublicationDeficit({
      publicationEpoch,
      publicationStatus,
      pendingAckEvidence,
      authoritativePublicationMembershipNodeIds,
      authoritativeMissingPublishedNodeIds,
      observedMissingPublishedNodeIds,
      selectedPublicationMembershipNodeIds,
      prioritySpreadPending:
        priorityRecoveryObservation?.prioritySpreadPending === true ||
        rawPublicationConvergenceGate?.prioritySpreadPending === true ||
        publicationConvergence?.prioritySpreadPending === true,
      publicationActiveGateHandoff,
    });
  const effectivePublicationStatus = selectedMembershipPublicationStatus;
  const effectiveRecoveryProtocolState = countOnlyUnknownPublicationDeficit ?
    PUBLICATION_RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION :
    (selectedMembershipRecoveryProtocolState ===
    PUBLICATION_RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION ?
      PUBLICATION_RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED :
      selectedMembershipRecoveryProtocolState);
  const relevantObservedMissingPublishedNodeIds =
    resolveRelevantPublicationMembershipNodeIds(
      observedMissingPublishedNodeIds,
      effectivePublicationMembershipNodeIds,
    );
  const hasSelectedFullCoverageClosure =
    selectedMissingPublishedEvidence.state ===
      PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE
        .FULL_SELECTED_COVERAGE &&
    pendingAckEvidence.pendingAckCount === 0;
  const selectedMembershipClosesPublication =
    hasSelectedFullCoverageClosure ||
    selectedMembershipClosesStaleOpenPublication;
  const missingPublishedClosed =
    (authoritativeEmptyMissingPublishedGate &&
     steadyPublishedSelectedPublicationMembershipOpen !== true) ||
    selectedMembershipClosesPublication ||
    countOnlyUnknownPublicationDeficit;
  const ownerReconcileNarrowsOpenPublication =
    !missingPublishedClosed &&
    ownerReconcileNarrowedMissingPublishedNodeIds.length > 0;
  const missingPublishedNodeIds = resolvePublicationMissingPublishedNodeIds({
    ownerReconcileNarrowsOpenPublication,
    ownerReconcileNarrowedMissingPublishedNodeIds,
    publicationMembershipClosed: missingPublishedClosed,
    authoritativePublicationMembershipAvailable,
    authoritativeMissingPublishedNodeIds,
    relevantObservedMissingPublishedNodeIds,
    observedMissingPublishedNodeIds,
  });
  const missingPublishedCount = resolvePublicationMissingPublishedCount({
    ownerReconcileNarrowsOpenPublication,
    ownerReconcileNarrowedMissingPublishedNodeIds,
    publicationMembershipClosed: missingPublishedClosed,
    steadyPublishedSelectedPublicationMembershipOpen,
    missingPublishedNodeIds,
    authoritativePublicationMembershipAvailable,
    authoritativeCountValues: [
      rawPublicationConvergenceGate?.missingPublishedCount,
      publicationConvergence?.missingPublishedCount,
    ],
    observedCountValues: [
      rawPublicationConvergenceGate?.missingPublishedCount,
      publicationConvergence?.missingPublishedCount,
      ...(observedMissingPublishedCleared ?
        PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST :
        [
          priorityRecoveryObservation?.missingPublishedCount,
          activeGateMissingPublishedNodeIds.length,
          normalizeActiveGateProgressCount(
            activeGateProgressRecords,
            PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
              .MISSING_PUBLISHED_COUNT,
          ),
        ]),
    ],
  });
  const activeGateOpenDebtRefreshesPublicationOwnerStream =
    activeGateOpenDebtOutrunsPublicationOwnerStream({
      publicationStatus: effectivePublicationStatus,
      pendingAckEvidence,
      missingPublishedCount,
      activeGateProgressRecords,
      publicationOwnerStream:
        rawPublicationConvergenceGate?.publicationOwnerStream,
    });
  const ownerReconcileNarrowingRefreshesOwnerStream =
    ownerReconcileNarrowingRefreshesPublicationOwnerStream({
      ownerReconcileNarrowsOpenPublication,
      ownerReconcileNarrowedMissingPublishedNodeIds,
      publicationOwnerStream:
        rawPublicationConvergenceGate?.publicationOwnerStream,
    });
  const publicationOwnerStreamNeedsOpenDebtRefresh =
    activeGateOpenDebtRefreshesPublicationOwnerStream ||
    ownerReconcileNarrowingRefreshesOwnerStream;

  if (
    !publicationConvergence &&
    !rawPublicationConvergenceGate &&
    !priorityRecoveryDecisionSnapshots &&
    !priorityRecoveryObservation &&
    activeGateProgressRecords.length === 0
  ) {
    return null;
  }

  const canonicalPublicationConvergenceGate = buildPublicationRecoveryGateSnapshot({
    ...(rawPublicationConvergenceGate || {}),
    ...(countOnlyUnknownPublicationDeficit ? {
      pendingAckEvidenceState: null,
      publicationOwnerStream: null,
    } : {}),
    ...(publicationOwnerStreamNeedsOpenDebtRefresh ? {
      publicationOwnerStream: null,
    } : {}),
    openCountOnlyAckIsStale:
      !hasActiveGateSelectedPublicationMembershipOpenEvidence(
        activeGateProgressRecords,
      ),
    publicationEpoch,
    publicationStatus: effectivePublicationStatus,
    publicationObservationState:
      rawPublicationConvergenceGate?.publicationObservationState ??
      publicationConvergence?.publicationObservationState ??
      null,
    recoveryProtocolState: effectiveRecoveryProtocolState,
    priorityRecoveryReasonCodes:
      rawPublicationConvergenceGate?.reasonCodes ??
      rawPublicationConvergenceGate?.reasons ??
      publicationConvergence?.priorityRecoveryReasonCodes ??
      publicationConvergence?.membershipLifecycleSummary
        ?.priorityRecoveryReasonCodes ??
      priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    priorityPartitionSummary:
      rawPublicationConvergenceGate?.durablePriorityPartitionSummary ??
      rawPublicationConvergenceGate?.priorityPartitionSummary ??
      publicationConvergence?.priorityPartitionSummary ??
      priorityRecoveryObservation?.priorityPartitionSummary ??
      null,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness,
    ...(isPublicationRecoveryAckNodeListProvided(requiredAckNodeListInput) ||
      countOnlyUnknownPublicationDeficit ?
      {requiredAckNodeIds: pendingAckEvidence.requiredAckNodeIds} :
      {}),
    acknowledgedNodeIds: pendingAckEvidence.acknowledgedNodeIds,
    pendingAckNodeIds: pendingAckEvidence.pendingAckNodeIds,
    pendingAckCount: pendingAckEvidence.pendingAckCount,
    missingPublishedNodeIds,
    missingPublishedCount,
    pressureState:
      rawPublicationConvergenceGate?.pressureState ??
      publicationConvergence?.pressureState ??
      priorityRecoveryObservation?.pressureState,
    pressureDeferred:
      rawPublicationConvergenceGate?.pressureDeferred ??
      publicationConvergence?.pressureDeferred ??
      priorityRecoveryObservation?.pressureDeferred,
    pressureCoalesced:
      rawPublicationConvergenceGate?.pressureCoalesced ??
      publicationConvergence?.pressureCoalesced ??
      priorityRecoveryObservation?.pressureCoalesced,
    pressureRetryAfterMs:
      rawPublicationConvergenceGate?.pressureRetryAfterMs ??
      publicationConvergence?.pressureRetryAfterMs ??
      priorityRecoveryObservation?.pressureRetryAfterMs,
    pressureReasonCodes:
      rawPublicationConvergenceGate?.pressureReasonCodes ??
      publicationConvergence?.pressureReasonCodes ??
      priorityRecoveryObservation?.pressureReasonCodes,
    publicationExcludesTargetNode:
      typeof publicationConvergence?.publicationExcludesTargetNode === 'boolean' ?
        publicationConvergence.publicationExcludesTargetNode :
        rawPublicationConvergenceGate?.publicationExcludesTargetNode === true ||
        priorityRecoveryObservation?.publicationExcludesTargetNode === true,
  });
  const alignedPublicationConvergenceGate =
    publicationOwnerStreamNeedsOpenDebtRefresh ?
      alignPublicationRecoveryGateOwnerStreamWithOpenDebt(
        canonicalPublicationConvergenceGate,
      ) :
      canonicalPublicationConvergenceGate;

  return Array.isArray(rawPublicationConvergenceGate?.reasons) ?
    {
      ...alignedPublicationConvergenceGate,
      reasons: normalizeDistinctStringArray(rawPublicationConvergenceGate.reasons),
    } :
    alignedPublicationConvergenceGate;
}

export {buildCanonicalPublicationConvergenceGate};
