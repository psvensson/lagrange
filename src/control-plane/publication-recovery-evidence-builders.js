import {NUM} from '../constants/index.js';
import {buildPriorityRecoveryObservationSnapshot} from
  './priority-recovery-observation-snapshot.js';
import {
  buildPublicationRecoveryGateSnapshot,
} from
  './publication-recovery-gate.js';
import {
  buildPublicationOwnerStreamState,
  isPublicationOwnerStreamPublicationPending,
} from './publication-owner-state.js';

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
  hasPublicationRecoveryPressureDeferredEvidence,
  normalizeDistinctStringArray,
  normalizePublicationEpoch,
  normalizeNonNegativeInteger,
  normalizeMaximumNonNegativeInteger,
  normalizePublicationRecoveryAckEvidence,
  resolvePublicationRecoveryPendingAckNodeIds,
  resolveActiveGateSelectedMissingPublishedEvidence,
  resolveActiveGateSelectedPublicationMembershipNodeIds,
  hasActiveGateSelectedPublicationMembershipOpenEvidence,
  hasActiveGateSelectedPublicationMembershipCohortProof,
  hasSelectedPublicationMembershipClosureEvidence,
  resolveEffectivePublicationMembershipNodeIds,
  hasSteadyPublishedSelectedPublicationMembershipOpen,
  hasActiveGateSelectedMissingPublishedEvidence,
  normalizeOptionalString,
  normalizeBoolean,
  normalizeClosedUnknownNoDebtPriorityRecoveryObservation,
  normalizePriorityRecoveryObservationFromPublicationGate,
  hasCountOnlyUnknownPublicationDeficit,
  resolveOwnerReconcileNarrowedMissingPublishedNodeIds,
  hasOwnerReconcilePublicationHandoff,
  resolvePublicationMissingPublishedNodeIds,
  resolvePublicationMissingPublishedCount,
  activeGateOpenDebtOutrunsPublicationOwnerStream,
  ownerReconcileNarrowingRefreshesPublicationOwnerStream,
  alignPublicationRecoveryGateOwnerStreamWithOpenDebt,
  normalizeActiveGateProgressRecords,
  resolvePublicationRecoveryActiveGateHandoff,
  enrichPublicationRecoveryActiveGateHandoff,
  resolvePublicationRecoveryEmittedActiveGateHandoff,
  resolveActiveGateProgressString,
  resolvePublicationRecoveryPublishedActiveNodeIds,
  normalizeActiveGateProgressNodeIds,
  normalizeActiveGateProgressCount,
  normalizePriorityRecoveryDecisionPendingAckNodeIds,
  resolveRawPublicationConvergenceGate,
  resolvePriorityRecoveryClosureWitness,
  resolveAuthoritativePublicationMembershipNodeIds,
  resolveRelevantPublicationMembershipNodeIds,

  // Constants
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD,
  PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE,
  PUBLICATION_RECOVERY_PUBLICATION_STATUS,
  PUBLICATION_RECOVERY_PROTOCOL_STATE,
} from './publication-recovery-evidence-normalizers.js';

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
  const priorityRecoveryClosureWitness = isRecord(
    options.priorityRecoveryClosureWitness,
  ) ?
    options.priorityRecoveryClosureWitness :
    resolvePriorityRecoveryClosureWitness(
      publicationConvergence,
      rawPublicationConvergenceGate,
      priorityRecoveryDecisionSnapshots,
    );
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
    authoritativePublicationMembershipNodeIds.length > NUM.ZERO;
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
        pendingAckEvidence.pendingAckCount > NUM.ZERO ||
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
    pendingAckEvidence.pendingAckCount === NUM.ZERO;
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
    ownerReconcileNarrowedMissingPublishedNodeIds.length > NUM.ZERO;
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
    activeGateProgressRecords.length === NUM.ZERO
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

function buildCanonicalPriorityRecoveryObservation(options = {}) {
  const publicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const publicationConvergenceGate = isRecord(options.publicationConvergenceGate) ?
    options.publicationConvergenceGate :
    null;
  const existingPriorityRecoveryObservation = isRecord(
    options.priorityRecoveryObservation,
  ) ?
    options.priorityRecoveryObservation :
    null;
  const priorityRecoveryDecisionSnapshots = isRecord(
    options.priorityRecoveryDecisionSnapshots,
  ) ?
    options.priorityRecoveryDecisionSnapshots :
    null;
  const priorityRecoveryInvariants = isRecord(
    options.priorityRecoveryInvariants,
  ) ?
    options.priorityRecoveryInvariants :
    null;
  const logsTable = isRecord(options.logsTable) ? options.logsTable : null;
  const hasExplicitPublicationConvergenceGate =
    options.hasExplicitPublicationConvergenceGate === true;
  const hasActiveGateEvidenceSource =
    isRecord(options.activeGate) ||
    isRecord(options.activeGateProgress) ||
    isRecord(options.activeGateBestProgress) ||
    isRecord(options.activeGateNoProgress) ||
    Array.isArray(options.activeGateBlockerHistory);
  const hasCanonicalObservationSource =
    Boolean(publicationConvergence) ||
    hasExplicitPublicationConvergenceGate ||
    Boolean(priorityRecoveryDecisionSnapshots) ||
    Boolean(priorityRecoveryInvariants) ||
    Boolean(logsTable) ||
    hasActiveGateEvidenceSource;

  if (
    !publicationConvergence &&
    !publicationConvergenceGate &&
    !priorityRecoveryDecisionSnapshots &&
    !priorityRecoveryInvariants &&
    !logsTable &&
    !existingPriorityRecoveryObservation
  ) {
    return null;
  }

  if (!hasCanonicalObservationSource && existingPriorityRecoveryObservation) {
    return existingPriorityRecoveryObservation;
  }

  const baseDerivedPriorityRecoveryObservation =
    buildPriorityRecoveryObservationSnapshot({
      publicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryDecisionSnapshots,
      priorityRecoveryInvariants,
      activeGate:
        options.activeGate ||
        existingPriorityRecoveryObservation?.activeGate ||
        null,
      activeGateProgress:
        options.activeGateProgress ||
        existingPriorityRecoveryObservation?.activeGateProgress ||
        null,
      activeGateBestProgress:
        options.activeGateBestProgress ||
        existingPriorityRecoveryObservation?.activeGateBestProgress ||
        null,
      activeGateNoProgress:
        options.activeGateNoProgress ||
        existingPriorityRecoveryObservation?.activeGateNoProgress ||
        null,
      activeGateBlockerHistory:
        options.activeGateBlockerHistory ||
        existingPriorityRecoveryObservation?.activeGateBlockerHistory ||
        null,
      logsTable,
      closureRecordId: null,
      closureWitnessClass: null,
    });
  const existingClosureRecordId = normalizeOptionalString(
    existingPriorityRecoveryObservation?.closureRecordId,
  );
  const existingClosureWitnessClass = normalizeOptionalString(
    existingPriorityRecoveryObservation?.closureWitnessClass,
  );
  const shouldRetainClosureDiagnostics =
    (existingClosureRecordId || existingClosureWitnessClass) &&
    shouldRetainPriorityRecoveryClosureDiagnostics(
      baseDerivedPriorityRecoveryObservation,
    );
  const derivedPriorityRecoveryObservation =
    shouldRetainClosureDiagnostics ?
      {
        ...baseDerivedPriorityRecoveryObservation,
        ...(existingClosureRecordId ?
          {closureRecordId: existingClosureRecordId} :
          {}),
        ...(existingClosureWitnessClass ?
          {closureWitnessClass: existingClosureWitnessClass} :
          {}),
      } :
      baseDerivedPriorityRecoveryObservation;
  const normalizedDerivedPriorityRecoveryObservation =
    normalizePriorityRecoveryObservationFromPublicationGate(
      normalizeClosedUnknownNoDebtPriorityRecoveryObservation(
        derivedPriorityRecoveryObservation,
        publicationConvergenceGate,
      ),
      publicationConvergenceGate,
    );

  if (
    !existingPriorityRecoveryObservation ||
    !normalizedDerivedPriorityRecoveryObservation
  ) {
    return normalizedDerivedPriorityRecoveryObservation ||
      existingPriorityRecoveryObservation;
  }

  return samePriorityRecoveryObservationContract(
    existingPriorityRecoveryObservation,
    normalizedDerivedPriorityRecoveryObservation,
  ) ?
    existingPriorityRecoveryObservation :
    normalizedDerivedPriorityRecoveryObservation;
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
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    priorityPartitionSummary:
      priorityRecoveryObservation.priorityPartitionSummary ?? null,
    pendingAckNodeIds:
      priorityRecoveryObservation.pendingAckNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    pendingAckCount: priorityRecoveryObservation.pendingAckCount,
    missingPublishedNodeIds:
      priorityRecoveryObservation.missingPublishedNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    missingPublishedCount: priorityRecoveryObservation.missingPublishedCount,
    pressureState: priorityRecoveryObservation.pressureState,
    pressureDeferred: priorityRecoveryObservation.pressureDeferred,
    pressureCoalesced: priorityRecoveryObservation.pressureCoalesced,
    pressureRetryAfterMs: priorityRecoveryObservation.pressureRetryAfterMs,
    pressureReasonCodes: priorityRecoveryObservation.pressureReasonCodes,
  });
}

function samePublicationGateState(leftObservationGate = null, rightObservationGate = null) {
  if (!leftObservationGate && !rightObservationGate) {
    return true;
  }
  if (!leftObservationGate || !rightObservationGate) {
    return false;
  }
  const leftPendingAckNodeIds = normalizeDistinctStringArray(
    leftObservationGate.pendingAckNodeIds,
  );
  const rightPendingAckNodeIds = normalizeDistinctStringArray(
    rightObservationGate.pendingAckNodeIds,
  );
  const leftMissingPublishedNodeIds = normalizeDistinctStringArray(
    leftObservationGate.missingPublishedNodeIds,
  );
  const rightMissingPublishedNodeIds = normalizeDistinctStringArray(
    rightObservationGate.missingPublishedNodeIds,
  );
  return normalizeOptionalString(leftObservationGate.state) ===
      normalizeOptionalString(rightObservationGate.state) &&
    normalizeBoolean(leftObservationGate.publicationPending) ===
      normalizeBoolean(rightObservationGate.publicationPending) &&
    normalizeBoolean(leftObservationGate.prioritySpreadPending) ===
      normalizeBoolean(rightObservationGate.prioritySpreadPending) &&
    normalizeNonNegativeInteger(leftObservationGate.pendingAckCount) ===
      normalizeNonNegativeInteger(rightObservationGate.pendingAckCount) &&
    normalizeNonNegativeInteger(leftObservationGate.missingPublishedCount) ===
      normalizeNonNegativeInteger(rightObservationGate.missingPublishedCount) &&
    leftPendingAckNodeIds.length === rightPendingAckNodeIds.length &&
    leftPendingAckNodeIds.every((nodeId, index) =>
      nodeId === rightPendingAckNodeIds[index],
    ) &&
    leftMissingPublishedNodeIds.length === rightMissingPublishedNodeIds.length &&
    leftMissingPublishedNodeIds.every((nodeId, index) =>
      nodeId === rightMissingPublishedNodeIds[index],
    );
}

function sameStringArray(leftValues = [], rightValues = []) {
  const left = normalizeDistinctStringArray(leftValues);
  const right = normalizeDistinctStringArray(rightValues);
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function resolvePriorityRecoveryCurrentSummary(priorityRecoveryObservation = null) {
  return isRecord(priorityRecoveryObservation?.priorityRecoveryCurrentSummary) ?
    priorityRecoveryObservation.priorityRecoveryCurrentSummary :
    null;
}

function isEmptyPriorityRecoveryCurrentSummary(currentSummary = null) {
  if (!currentSummary) {
    return true;
  }
  return normalizeDistinctStringArray(currentSummary.unresolvedClassIds)
    .length === NUM.ZERO &&
    normalizeDistinctStringArray(currentSummary.unresolvedSemanticStateIds)
      .length === NUM.ZERO &&
    normalizeDistinctStringArray(currentSummary.blockedPartitionIds)
      .length === NUM.ZERO;
}

function shouldRetainPriorityRecoveryClosureDiagnostics(
  priorityRecoveryObservation = null,
) {
  const priorityRecoveryCurrentSummary =
    resolvePriorityRecoveryCurrentSummary(priorityRecoveryObservation);
  return priorityRecoveryObservation?.prioritySpreadPending === true ||
    normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoveryReasonCodes,
    ).length > NUM.ZERO ||
    normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoveryBlockedPartitionIds,
    ).length > NUM.ZERO ||
    normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoveryUnresolvedPartitionIds,
    ).length > NUM.ZERO ||
    normalizeNonNegativeInteger(
      priorityRecoveryObservation?.priorityRecoveryBlockedPartitionCount,
    ) > NUM.ZERO ||
    normalizeNonNegativeInteger(
      priorityRecoveryObservation?.priorityRecoveryUnresolvedPartitionCount,
    ) > NUM.ZERO ||
    !isEmptyPriorityRecoveryCurrentSummary(priorityRecoveryCurrentSummary);
}

function samePriorityRecoveryCurrentSummary(
  leftObservation = null,
  rightObservation = null,
) {
  const leftCurrentSummary = resolvePriorityRecoveryCurrentSummary(
    leftObservation,
  );
  const rightCurrentSummary = resolvePriorityRecoveryCurrentSummary(
    rightObservation,
  );
  if (!leftCurrentSummary && !rightCurrentSummary) {
    return true;
  }
  if (!leftCurrentSummary || !rightCurrentSummary) {
    return isEmptyPriorityRecoveryCurrentSummary(leftCurrentSummary) &&
      isEmptyPriorityRecoveryCurrentSummary(rightCurrentSummary);
  }
  return normalizeOptionalString(leftCurrentSummary.scope) ===
      normalizeOptionalString(rightCurrentSummary.scope) &&
    sameStringArray(
      leftCurrentSummary.unresolvedClassIds,
      rightCurrentSummary.unresolvedClassIds,
    ) &&
    sameStringArray(
      leftCurrentSummary.unresolvedSemanticStateIds,
      rightCurrentSummary.unresolvedSemanticStateIds,
    ) &&
    sameStringArray(
      leftCurrentSummary.blockedPartitionIds,
      rightCurrentSummary.blockedPartitionIds,
    );
}

function samePriorityRecoveryObservationContract(
  leftObservation = null,
  rightObservation = null,
) {
  return samePublicationGateState(
    buildObservationPublicationGate(leftObservation),
    buildObservationPublicationGate(rightObservation),
  ) &&
    normalizeOptionalString(leftObservation?.closureRecordId) ===
      normalizeOptionalString(rightObservation?.closureRecordId) &&
    normalizeOptionalString(leftObservation?.closureWitnessClass) ===
      normalizeOptionalString(rightObservation?.closureWitnessClass) &&
    normalizeOptionalString(leftObservation?.priorityRecoveryClosureState) ===
      normalizeOptionalString(rightObservation?.priorityRecoveryClosureState) &&
    sameStringArray(
      leftObservation?.priorityRecoveryReasonCodes,
      rightObservation?.priorityRecoveryReasonCodes,
    ) &&
    samePriorityRecoveryCurrentSummary(leftObservation, rightObservation) &&
    sameStringArray(
      leftObservation?.priorityRecoveryProgressClassIds,
      rightObservation?.priorityRecoveryProgressClassIds,
    ) &&
    sameStringArray(
      leftObservation?.priorityRecoverySemanticStateIds,
      rightObservation?.priorityRecoverySemanticStateIds,
    ) &&
    sameStringArray(
      leftObservation?.priorityRecoveryBlockedPartitionIds,
      rightObservation?.priorityRecoveryBlockedPartitionIds,
    );
}

function resolveCanonicalPublicationPrioritySpreadPending({
  publicationConvergenceGate = null,
  priorityRecoveryObservation = null,
} = {}) {
  return isRecord(publicationConvergenceGate) ?
    publicationConvergenceGate.prioritySpreadPending === true :
    priorityRecoveryObservation?.prioritySpreadPending === true;
}

function buildCanonicalPublicationConvergence(options = {}) {
  const rawPublicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const publicationConvergenceGate = isRecord(options.publicationConvergenceGate) ?
    options.publicationConvergenceGate :
    null;
  const rawPriorityRecoveryObservation = isRecord(
    options.rawPriorityRecoveryObservation,
  ) ?
    options.rawPriorityRecoveryObservation :
    null;
  const priorityRecoveryObservation = isRecord(options.priorityRecoveryObservation) ?
    options.priorityRecoveryObservation :
    null;
  const priorityRecoveryDecisionSnapshots = isRecord(
    options.priorityRecoveryDecisionSnapshots,
  ) ?
    options.priorityRecoveryDecisionSnapshots :
    null;
  const activeGateProgressRecords = normalizeActiveGateProgressRecords({
    activeGate:
      options.activeGate ||
      rawPublicationConvergence?.activeGate ||
      priorityRecoveryObservation?.activeGate,
    activeGateProgress:
      options.activeGateProgress ||
      rawPublicationConvergence?.activeGateProgress ||
      priorityRecoveryObservation?.activeGateProgress,
    activeGateBestProgress:
      options.activeGateBestProgress ||
      rawPublicationConvergence?.activeGateBestProgress ||
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

  if (
    !rawPublicationConvergence &&
    !publicationConvergenceGate &&
    !priorityRecoveryDecisionSnapshots &&
    !priorityRecoveryObservation &&
    activeGateProgressRecords.length === NUM.ZERO
  ) {
    return null;
  }

  const pressureGateIsAuthoritative =
    hasPublicationRecoveryPressureDeferredEvidence(publicationConvergenceGate);
  const publicationEpoch = pressureGateIsAuthoritative ?
    normalizePublicationEpoch(publicationConvergenceGate?.publicationEpoch) ??
      normalizePublicationEpoch(priorityRecoveryObservation?.publicationEpoch) ??
      normalizePublicationEpoch(rawPublicationConvergence?.publicationEpoch) :
    normalizePublicationEpoch(priorityRecoveryObservation?.publicationEpoch) ??
      normalizePublicationEpoch(publicationConvergenceGate?.publicationEpoch) ??
      normalizePublicationEpoch(rawPublicationConvergence?.publicationEpoch);
  const publicationStatus = pressureGateIsAuthoritative ?
    normalizeOptionalString(publicationConvergenceGate?.publicationStatus) ||
      normalizeOptionalString(priorityRecoveryObservation?.publicationStatus) ||
      normalizeOptionalString(rawPublicationConvergence?.publicationStatus) ||
      normalizeOptionalString(rawPublicationConvergence?.status) ||
      activeGatePublicationStatus :
    normalizeOptionalString(priorityRecoveryObservation?.publicationStatus) ||
      normalizeOptionalString(publicationConvergenceGate?.publicationStatus) ||
      normalizeOptionalString(rawPublicationConvergence?.publicationStatus) ||
      normalizeOptionalString(rawPublicationConvergence?.status) ||
      activeGatePublicationStatus;
  const recoveryProtocolState = pressureGateIsAuthoritative ?
    normalizeOptionalString(publicationConvergenceGate?.recoveryProtocolState) ||
      normalizeOptionalString(priorityRecoveryObservation?.recoveryProtocolState) ||
      normalizeOptionalString(rawPublicationConvergence?.recoveryProtocolState) ||
      normalizeOptionalString(
        rawPublicationConvergence?.membershipLifecycleSummary
          ?.recoveryProtocolState,
      ) ||
      activeGateRecoveryProtocolState :
    normalizeOptionalString(publicationConvergenceGate?.recoveryProtocolState) ||
      normalizeOptionalString(priorityRecoveryObservation?.recoveryProtocolState) ||
      normalizeOptionalString(rawPublicationConvergence?.recoveryProtocolState) ||
      normalizeOptionalString(
        rawPublicationConvergence?.membershipLifecycleSummary
          ?.recoveryProtocolState,
      ) ||
      activeGateRecoveryProtocolState;
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    pressureGateIsAuthoritative ?
      publicationConvergenceGate?.reasonCodes ??
        publicationConvergenceGate?.reasons ??
        priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
        rawPublicationConvergence?.priorityRecoveryReasonCodes ??
        rawPublicationConvergence?.membershipLifecycleSummary
          ?.priorityRecoveryReasonCodes ??
        PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST :
      priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
        publicationConvergenceGate?.reasonCodes ??
        publicationConvergenceGate?.reasons ??
        rawPublicationConvergence?.priorityRecoveryReasonCodes ??
        rawPublicationConvergence?.membershipLifecycleSummary
          ?.priorityRecoveryReasonCodes ??
        PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  );
  const priorityPartitionSummary =
    priorityRecoveryObservation?.priorityPartitionSummary ??
    publicationConvergenceGate?.priorityPartitionSummary ??
    rawPublicationConvergence?.priorityPartitionSummary ??
    null;
  const requiredAckNodeListInput = resolvePublicationRecoveryAckNodeListInput([
    resolvePublicationRecoveryGateRequiredAckNodeListInput(
      publicationConvergenceGate,
    ),
    resolvePublicationRecoveryConvergenceRequiredAckNodeListInput(
      rawPublicationConvergence,
    ),
  ]);
  const acknowledgedNodeListInput = resolvePublicationRecoveryAckNodeListInput([
    resolvePublicationRecoveryGateAcknowledgedNodeListInput(
      publicationConvergenceGate,
    ),
    resolvePublicationRecoveryConvergenceAcknowledgedNodeListInput(
      rawPublicationConvergence,
    ),
  ]);
  const authoritativeEmptyPendingAckGate =
    hasAuthoritativeEmptyPendingAckGate(publicationConvergenceGate);
  const pendingAckEvidence = normalizePublicationRecoveryAckEvidence({
    requiredAckNodeListInput,
    acknowledgedNodeIds: acknowledgedNodeListInput.value,
    openCountOnlyAckIsStale:
      !hasActiveGateSelectedPublicationMembershipOpenEvidence(
        activeGateProgressRecords,
      ),
    publicationStatus,
    pendingAckNodeIds: resolvePublicationRecoveryPendingAckNodeIds({
      requiredAckNodeListInput,
      ownerPendingAckNodeIds: [
        ...normalizeDistinctStringArray(publicationConvergenceGate
          ?.pendingAckNodeIds),
        ...normalizeDistinctStringArray(rawPublicationConvergence
          ?.pendingAckNodeIds),
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
      publicationConvergenceGate?.pendingAckCount,
      rawPublicationConvergence?.pendingAckCount,
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
  const rawPublicationActiveGateHandoff =
    options.publicationActiveGateHandoff ||
    resolvePublicationRecoveryActiveGateHandoff(
      activeGateProgressRecords,
      publicationConvergenceGate,
      rawPublicationConvergence,
    );
  const publicationActiveGateHandoff =
    enrichPublicationRecoveryActiveGateHandoff({
      publicationActiveGateHandoff: rawPublicationActiveGateHandoff,
      publicationConvergence: rawPublicationConvergence,
      priorityRecoveryObservation:
        rawPriorityRecoveryObservation || priorityRecoveryObservation,
    });
  const rawPublicationStatus =
    normalizeOptionalString(rawPublicationConvergence?.publicationStatus) ||
    normalizeOptionalString(rawPublicationConvergence?.status);
  const canonicalGateClosedStaleOpenPublication =
    rawPublicationStatus === PUBLICATION_RECOVERY_PUBLICATION_STATUS.OPEN &&
    publicationConvergenceGate?.publicationStatus ===
      PUBLICATION_RECOVERY_PUBLICATION_STATUS.PUBLISHED &&
    normalizeMaximumNonNegativeInteger([
      publicationConvergenceGate?.missingPublishedCount,
      normalizeDistinctStringArray(
        publicationConvergenceGate?.missingPublishedNodeIds,
      ).length,
    ]) === NUM.ZERO &&
    hasActiveGateSelectedPublicationMembershipCohortProof(
      activeGateProgressRecords,
    );
  const selectedMembershipClosesStaleOpenPublication =
    canonicalGateClosedStaleOpenPublication ||
    hasSelectedPublicationMembershipClosureEvidence({
      publicationStatus: rawPublicationStatus || publicationStatus,
      pendingAckEvidence,
      activeGateProgressRecords,
    });
  const effectivePublicationStatus =
    selectedMembershipClosesStaleOpenPublication ?
      PUBLICATION_RECOVERY_PUBLICATION_STATUS.PUBLISHED :
      publicationStatus;
  const effectiveRecoveryProtocolState =
    selectedMembershipClosesStaleOpenPublication ||
    (recoveryProtocolState ===
      PUBLICATION_RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION &&
     hasOwnerReconcilePublicationHandoff(publicationActiveGateHandoff)) ?
      PUBLICATION_RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED :
      recoveryProtocolState;
  const publishedActiveNodeIds =
    selectedMembershipClosesStaleOpenPublication &&
    Array.isArray(selectedPublicationMembershipNodeIds) ?
      normalizeDistinctStringArray(selectedPublicationMembershipNodeIds) :
      resolvePublicationRecoveryPublishedActiveNodeIds({
        priorityRecoveryObservation,
        publicationConvergence: rawPublicationConvergence,
        activeGateProgressRecords,
      });
  const authoritativePublicationMembershipNodeIds =
    resolveAuthoritativePublicationMembershipNodeIds({
      publicationConvergence: rawPublicationConvergence,
      publicationConvergenceGate,
      requiredAckNodeIds: pendingAckEvidence.requiredAckNodeIds,
      acknowledgedNodeIds: pendingAckEvidence.acknowledgedNodeIds,
      pendingAckNodeIds: pendingAckEvidence.pendingAckNodeIds,
    });
  const authoritativePublicationMembershipAvailable =
    authoritativePublicationMembershipNodeIds.length > NUM.ZERO;
  const steadyPublishedSelectedPublicationMembershipOpen =
    hasSteadyPublishedSelectedPublicationMembershipOpen({
      publicationConvergence: rawPublicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryObservation,
      activeGateProgressRecords,
      pendingAckCount: pendingAckEvidence.pendingAckCount,
    });
  const effectivePublicationMembershipNodeIds =
    resolveEffectivePublicationMembershipNodeIds({
      authoritativePublicationMembershipNodeIds,
      selectedPublicationMembershipNodeIds,
      selectedPublicationMembershipOpen:
        pendingAckEvidence.pendingAckCount > NUM.ZERO ||
        steadyPublishedSelectedPublicationMembershipOpen === true ||
        publicationConvergenceGate?.publicationPending === true ||
        rawPublicationConvergence?.publicationPending === true,
    });
  const ownerReconcileNarrowedMissingPublishedNodeIds =
    resolveOwnerReconcileNarrowedMissingPublishedNodeIds({
      publicationStatus,
      pendingAckEvidence,
      publicationActiveGateHandoff,
    });
  const authoritativeGateClosesPublicationMembership =
    selectedMembershipClosesStaleOpenPublication ||
    steadyPublishedSelectedPublicationMembershipOpen !== true &&
    publicationConvergenceGate?.publicationPending !== true &&
    pendingAckEvidence.pendingAckCount === NUM.ZERO &&
    normalizeMaximumNonNegativeInteger([
      publicationConvergenceGate?.missingPublishedCount,
      normalizeDistinctStringArray(
        publicationConvergenceGate?.missingPublishedNodeIds,
      ).length,
    ]) === NUM.ZERO;
  const ownerReconcileNarrowsOpenPublication =
    !authoritativeGateClosesPublicationMembership &&
    ownerReconcileNarrowedMissingPublishedNodeIds.length > NUM.ZERO;
  const authoritativeMissingPublishedNodeIds = normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(publicationConvergenceGate
      ?.missingPublishedNodeIds),
    ...(authoritativeGateClosesPublicationMembership ?
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST :
      normalizeDistinctStringArray(rawPublicationConvergence
        ?.missingPublishedNodeIds)),
    ...(authoritativeGateClosesPublicationMembership ?
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST :
      normalizeDistinctStringArray(rawPublicationConvergence
        ?.missingPublishedRecoveryActiveNodeIds)),
  ]);
  const observedMissingPublishedNodeIds = normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(priorityRecoveryObservation
      ?.missingPublishedNodeIds),
    ...activeGateMissingPublishedNodeIds,
    ...(selectedMissingPublishedEvidenceAvailable ?
      selectedMissingPublishedEvidence.nodeIds :
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST),
  ]);
  const relevantObservedMissingPublishedNodeIds =
    resolveRelevantPublicationMembershipNodeIds(
      observedMissingPublishedNodeIds,
      effectivePublicationMembershipNodeIds,
    );
  const missingPublishedNodeIds = resolvePublicationMissingPublishedNodeIds({
    ownerReconcileNarrowsOpenPublication,
    ownerReconcileNarrowedMissingPublishedNodeIds,
    publicationMembershipClosed: authoritativeGateClosesPublicationMembership,
    closedMissingPublishedNodeIds:
      publicationConvergenceGate?.missingPublishedNodeIds,
    authoritativePublicationMembershipAvailable,
    authoritativeMissingPublishedNodeIds,
    relevantObservedMissingPublishedNodeIds,
    observedMissingPublishedNodeIds,
  });
  const missingPublishedCount = resolvePublicationMissingPublishedCount({
    ownerReconcileNarrowsOpenPublication,
    ownerReconcileNarrowedMissingPublishedNodeIds,
    publicationMembershipClosed: authoritativeGateClosesPublicationMembership,
    steadyPublishedSelectedPublicationMembershipOpen,
    missingPublishedNodeIds,
    authoritativePublicationMembershipAvailable,
    authoritativeCountValues: [
      publicationConvergenceGate?.missingPublishedCount,
      rawPublicationConvergence?.missingPublishedCount,
    ],
    observedCountValues: [
      priorityRecoveryObservation?.missingPublishedCount,
      publicationConvergenceGate?.missingPublishedCount,
      rawPublicationConvergence?.missingPublishedCount,
      normalizeActiveGateProgressCount(
        activeGateProgressRecords,
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.MISSING_PUBLISHED_COUNT,
      ),
    ],
  });
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
  const priorityRecoveryCurrentSummary = isRecord(
    priorityRecoveryObservation?.priorityRecoveryCurrentSummary,
  ) ?
    priorityRecoveryObservation.priorityRecoveryCurrentSummary :
    null;
  const canonicalPrioritySpreadPending =
    resolveCanonicalPublicationPrioritySpreadPending({
      publicationConvergenceGate,
      priorityRecoveryObservation,
    });
  const canonicalPriorityRecoveryReasonCodes = normalizeDistinctStringArray(
    publicationConvergenceGate?.reasonCodes ?? priorityRecoveryReasonCodes,
  );
  const publicationOwnerStream =
    publicationConvergenceGate?.publicationOwnerStream ||
    buildPublicationOwnerStreamState({
      publicationRevision: publicationEpoch,
      desiredPublicationRevision:
        publicationConvergenceGate?.publicationOwnerStream?.revision
          ?.desired?.value ??
        publicationConvergenceGate?.publicationEpoch ??
        rawPublicationConvergence?.publicationEpoch ??
        publicationEpoch,
      committedPublicationRevision:
        publicationConvergenceGate?.publicationOwnerStream?.revision
          ?.committed?.value,
      publicationStatus: effectivePublicationStatus,
      recoveryProtocolState: effectiveRecoveryProtocolState,
      requiredAckNodeIds: pendingAckEvidence.requiredAckNodeIds,
      acknowledgedNodeIds: pendingAckEvidence.acknowledgedNodeIds,
      pendingAckNodeIds: pendingAckEvidence.pendingAckNodeIds,
      pendingAckCount: pendingAckEvidence.pendingAckCount,
      pendingAckEvidenceState: pendingAckEvidence.evidenceState,
      missingPublishedNodeIds,
      missingPublishedCount,
      priorityRecoveryReasonCodes: canonicalPriorityRecoveryReasonCodes,
      prioritySpreadPending: canonicalPrioritySpreadPending,
      pressureState:
        publicationConvergenceGate?.pressureState ??
        priorityRecoveryObservation?.pressureState ??
        rawPublicationConvergence?.pressureState,
      pressureDeferred:
        publicationConvergenceGate?.pressureDeferred ??
        priorityRecoveryObservation?.pressureDeferred ??
        rawPublicationConvergence?.pressureDeferred,
      pressureCoalesced:
        publicationConvergenceGate?.pressureCoalesced ??
        priorityRecoveryObservation?.pressureCoalesced ??
        rawPublicationConvergence?.pressureCoalesced,
      pressureRetryAfterMs:
        publicationConvergenceGate?.pressureRetryAfterMs ??
        priorityRecoveryObservation?.pressureRetryAfterMs ??
        rawPublicationConvergence?.pressureRetryAfterMs,
      pressureReasonCodes:
        publicationConvergenceGate?.pressureReasonCodes ??
        priorityRecoveryObservation?.pressureReasonCodes ??
        rawPublicationConvergence?.pressureReasonCodes,
      publicationPendingHint:
        publicationConvergenceGate?.publicationPending === true ||
        priorityRecoveryObservation?.publicationPending === true,
    });
  const publicationPending =
    publicationConvergenceGate?.publicationPending === true ?
      true :
      publicationConvergenceGate?.publicationPending === false ?
        false :
        isPublicationOwnerStreamPublicationPending(publicationOwnerStream);
  const emittedPublicationActiveGateHandoff =
    resolvePublicationRecoveryEmittedActiveGateHandoff({
      publicationActiveGateHandoff,
      publicationConvergence: rawPublicationConvergence,
      priorityRecoveryObservation:
        rawPriorityRecoveryObservation || priorityRecoveryObservation,
      activeGateProgressRecords,
      publicationEpoch,
      publicationStatus: effectivePublicationStatus,
      recoveryProtocolState: effectiveRecoveryProtocolState,
      publicationPending:
        publicationPending ||
        publicationConvergenceGate?.publicationPending === true ||
        rawPublicationConvergence?.publicationPending === true,
      pendingAckEvidence,
      missingPublishedNodeIds,
      missingPublishedCount,
      publishedActiveNodeIds,
      prioritySpreadPending: canonicalPrioritySpreadPending,
    });

  return {
    ...(rawPublicationConvergence || {}),
    ...(publicationEpoch !== null ? {publicationEpoch} : {}),
    ...(effectivePublicationStatus ?
      {
        status: effectivePublicationStatus,
        publicationStatus: effectivePublicationStatus,
      } :
      {}),
    ...(effectiveRecoveryProtocolState ?
      {recoveryProtocolState: effectiveRecoveryProtocolState} :
      {}),
    priorityRecoveryReasonCodes: canonicalPriorityRecoveryReasonCodes,
    priorityPartitionSummary,
    priorityRecoveryClosureWitness,
    publishedActiveNodeIds,
    ...(isPublicationRecoveryAckNodeListProvided(requiredAckNodeListInput) ?
      {requiredAckNodeIds: pendingAckEvidence.requiredAckNodeIds} :
      {}),
    ...(isPublicationRecoveryAckNodeListProvided(acknowledgedNodeListInput) ?
      {acknowledgedNodeIds: pendingAckEvidence.acknowledgedNodeIds} :
      {}),
    pendingAckNodeIds: pendingAckEvidence.pendingAckNodeIds,
    pendingAckCount: pendingAckEvidence.pendingAckCount,
    pendingAckEvidenceState: pendingAckEvidence.evidenceState,
    missingPublishedNodeIds,
    missingPublishedCount,
    publicationOwnerStream,
    streamOutcome: publicationOwnerStream.streamOutcome,
    ackState: publicationOwnerStream.ackState,
    freshnessFence: publicationOwnerStream.freshnessFence,
    recoveryOutcome: publicationOwnerStream.recoveryOutcome,
    pressureState: publicationOwnerStream.pressureState,
    pressureDeferred: publicationOwnerStream.pressureDeferred,
    pressureCoalesced: publicationOwnerStream.pressureCoalesced,
    pressureRetryAfterMs: publicationOwnerStream.pressureRetryAfterMs,
    pressureReasonCodes: publicationOwnerStream.pressureReasonCodes,
    publicationPending,
    prioritySpreadPending: canonicalPrioritySpreadPending,
    ...(priorityRecoveryCurrentSummary ?
      {priorityRecoveryCurrentSummary} :
      {}),
    closureRecordId,
    closureWitnessClass,
    ...(emittedPublicationActiveGateHandoff ?
      {publicationActiveGateHandoff: emittedPublicationActiveGateHandoff} :
      {}),
    ...(publicationConvergenceGate ?
      {publicationRecoveryGate: publicationConvergenceGate} :
      {}),
  };
}

export {
  buildCanonicalPublicationConvergenceGate,
  buildCanonicalPriorityRecoveryObservation,
  buildCanonicalPublicationConvergence,
};
