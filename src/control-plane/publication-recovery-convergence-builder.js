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

export {buildCanonicalPublicationConvergence};
