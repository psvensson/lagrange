import {buildPriorityRecoveryObservationSnapshot} from
  '../../../src/control-plane/priority-recovery-observation-snapshot.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from '../../../src/control-plane/publication-recovery-gate.js';
import {
  buildPublicationOwnerStreamState,
  isPublicationOwnerStreamPublicationPending,
} from '../../../src/control-plane/publication-owner-state.js';
import {
  derivePriorityRecoveryActiveGateReportFields,
  normalizePriorityRecoveryActiveGateSnapshot,
} from './active-gate-contract.js';
import {
  buildActiveGatePublicationContract,
  buildCanonicalPriorityRecoveryActiveGate,
  sameActiveGatePublicationContract,
} from './publication-evidence-active-gate-contract.js';
import {
  hasSteadyPublishedSelectedPublicationMembershipOpen,
  resolveAuthoritativePublicationMembershipNodeIds,
  resolveEffectivePublicationMembershipNodeIds,
  resolveRelevantPublicationMembershipNodeIds,
  resolveSelectedPublicationMembershipNodeIds,
  resolveSelectedPublishedMembershipDeficitNodeIds,
} from './publication-evidence-membership-contract.js';
import {
  PUBLICATION_EVIDENCE_EMPTY_LIST,
  PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON,
  PUBLICATION_EVIDENCE_ZERO,
  hasCurrentActiveGatePendingAckClosure,
  hasStaleGenericPublicationEpochClosure,
  isRecord,
  normalizeBoolean,
  normalizeDistinctStringArray,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePublicationEpoch,
  resolveCurrentPendingAckNodeIds,
  resolveOwnerReconcileHandoffMissingPublishedNodeIds,
  resolveRawPublicationConvergenceGate,
} from './publication-evidence-shared.js';

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
  const rawPublicationConvergenceGate =
    resolveRawPublicationConvergenceGate(controlPlane);
  const logsTable = isRecord(controlPlane?.logsTable) ? controlPlane.logsTable : null;
  const hasExplicitActiveGateSource =
    isRecord(controlPlane?.activeGate) ||
    isRecord(controlPlane?.activeGateProgress) ||
    isRecord(controlPlane?.activeGateAdmissionState) ||
    isRecord(explicitPriorityRecoveryObservation?.activeGate) ||
    isRecord(explicitPriorityRecoveryObservation?.activeGateProgress) ||
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
      logsTable,
      closureRecordId: existingPriorityRecoveryObservation?.closureRecordId ?? null,
      closureWitnessClass:
      existingPriorityRecoveryObservation?.closureWitnessClass ?? null,
    });
  const canonicalActiveGate = buildCanonicalPriorityRecoveryActiveGate(
    rawActiveGate,
    baseDerivedPriorityRecoveryObservation,
    publicationConvergenceGate,
    rawPublicationConvergenceGate,
  );
  const canonicalActiveGateFields = canonicalActiveGate ?
    derivePriorityRecoveryActiveGateReportFields(canonicalActiveGate) :
    {
      activeGate: null,
      activeGateProgress,
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
  const existingActiveGatePublicationContract =
    buildActiveGatePublicationContract(existingPriorityRecoveryObservation);
  const existingObservationHasStaleGenericPublicationGate =
    hasStaleGenericPublicationEpochClosure({
      publicationStatus: existingActiveGatePublicationContract
        ?.publicationStatus,
      pendingAckCount:
        existingActiveGatePublicationContract?.pendingAckCount ??
        PUBLICATION_EVIDENCE_ZERO,
      gateReasons:
        existingActiveGatePublicationContract?.gateReasons ??
        PUBLICATION_EVIDENCE_EMPTY_LIST,
      priorityRecoveryObservation: existingPriorityRecoveryObservation,
      publicationConvergenceGate: rawPublicationConvergenceGate,
    });
  return samePublicationGateState &&
    existingObservationHasStaleGenericPublicationGate !== true &&
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
    normalizeOptionalString(publicationConvergenceGate?.recoveryProtocolState) ||
    normalizeOptionalString(priorityRecoveryObservation?.recoveryProtocolState) ||
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
    hasCurrentActiveGatePendingAckClosure(activeGateProgress) === true ?
      PUBLICATION_EVIDENCE_ZERO :
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
  const pendingAckEvidenceState =
    publicationConvergenceGate?.pendingAckEvidenceState ??
    rawPublicationConvergence?.pendingAckEvidenceState;
  const rawPublicationGateReasons =
    publicationConvergenceGate?.reasonCodes ??
    publicationConvergenceGate?.reasons ??
    priorityRecoveryObservation?.publicationConvergenceGateReasons ??
    PUBLICATION_EVIDENCE_EMPTY_LIST;
  const staleGenericPublicationEpochClosure =
    hasStaleGenericPublicationEpochClosure({
      publicationStatus,
      pendingAckCount,
      gateReasons: rawPublicationGateReasons,
      priorityRecoveryObservation,
      publicationConvergenceGate,
    });
  const authoritativePublicationMembershipNodeIds =
    resolveAuthoritativePublicationMembershipNodeIds({
      publicationConvergence: rawPublicationConvergence,
      publicationConvergenceGate,
      requiredAckNodeIds,
      acknowledgedNodeIds,
      pendingAckNodeIds,
    });
  const authoritativePublicationMembershipAvailable =
    authoritativePublicationMembershipNodeIds.length >
      PUBLICATION_EVIDENCE_ZERO;
  const selectedPublicationMembershipNodeIds =
    resolveSelectedPublicationMembershipNodeIds(activeGateProgress);
  const steadyPublishedSelectedPublicationMembershipOpen =
    hasSteadyPublishedSelectedPublicationMembershipOpen({
      publicationConvergence: rawPublicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryObservation,
      activeGateProgress,
      pendingAckCount,
    });
  const effectivePublicationMembershipNodeIds =
    resolveEffectivePublicationMembershipNodeIds({
      authoritativePublicationMembershipNodeIds,
      selectedPublicationMembershipNodeIds,
      selectedPublicationMembershipOpen:
        staleGenericPublicationEpochClosure !== true &&
        (
          pendingAckCount > PUBLICATION_EVIDENCE_ZERO ||
          steadyPublishedSelectedPublicationMembershipOpen === true ||
          publicationConvergenceGate?.publicationPending === true ||
          rawPublicationConvergence?.publicationPending === true
        ),
    });
  const currentSelectedPublicationMembershipDeficitNodeIds =
    resolveSelectedPublishedMembershipDeficitNodeIds(activeGateProgress);
  const relevantCurrentSelectedPublicationMembershipDeficitNodeIds =
    resolveRelevantPublicationMembershipNodeIds(
      currentSelectedPublicationMembershipDeficitNodeIds,
      effectivePublicationMembershipNodeIds,
    );
  const currentSelectedPublicationMembershipDeficitOpen =
    relevantCurrentSelectedPublicationMembershipDeficitNodeIds !== null &&
    relevantCurrentSelectedPublicationMembershipDeficitNodeIds.length >
      PUBLICATION_EVIDENCE_ZERO;
  const currentPriorityRecoveryReasonCodes =
    staleGenericPublicationEpochClosure === true ?
      priorityRecoveryReasonCodes.filter((reason) =>
        reason !==
          PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON
            .PUBLICATION_EPOCH_PENDING,
      ) :
      priorityRecoveryReasonCodes;
  const authoritativeMissingPublishedNodeIds = normalizeDistinctStringArray([
    ...(Array.isArray(publicationConvergenceGate?.missingPublishedNodeIds) ?
      publicationConvergenceGate.missingPublishedNodeIds :
      []),
    ...(Array.isArray(rawPublicationConvergence?.missingPublishedNodeIds) ?
      rawPublicationConvergence.missingPublishedNodeIds :
      []),
    ...(Array.isArray(
      rawPublicationConvergence?.missingPublishedRecoveryActiveNodeIds,
    ) ?
      rawPublicationConvergence.missingPublishedRecoveryActiveNodeIds :
      []),
  ]);
  const observedMissingPublishedNodeIds = normalizeDistinctStringArray([
    ...(Array.isArray(priorityRecoveryObservation?.missingPublishedNodeIds) ?
      priorityRecoveryObservation.missingPublishedNodeIds :
      []),
    ...(currentSelectedPublicationMembershipDeficitNodeIds ?? []),
    ...(Array.isArray(activeGateProgress?.selectedMissingPublishedNodeIds) ?
      activeGateProgress.selectedMissingPublishedNodeIds :
      []),
  ]);
  const relevantObservedMissingPublishedNodeIds =
    resolveRelevantPublicationMembershipNodeIds(
      observedMissingPublishedNodeIds,
      effectivePublicationMembershipNodeIds,
    );
  const ownerReconcileNarrowedMissingPublishedNodeIds =
    resolveOwnerReconcileHandoffMissingPublishedNodeIds({
      activeGateProgress,
      publicationStatus,
      pendingAckCount,
      pendingAckNodeIds,
      pendingAckEvidenceState,
    });
  const ownerReconcileNarrowsOpenPublication =
    ownerReconcileNarrowedMissingPublishedNodeIds.length >
      PUBLICATION_EVIDENCE_ZERO;
  const missingPublishedNodeIds =
    ownerReconcileNarrowsOpenPublication ?
      ownerReconcileNarrowedMissingPublishedNodeIds :
      staleGenericPublicationEpochClosure === true &&
      steadyPublishedSelectedPublicationMembershipOpen !== true &&
      currentSelectedPublicationMembershipDeficitOpen !== true ?
        PUBLICATION_EVIDENCE_EMPTY_LIST :
        authoritativePublicationMembershipAvailable ?
          normalizeDistinctStringArray([
            ...authoritativeMissingPublishedNodeIds,
            ...(relevantObservedMissingPublishedNodeIds ??
          PUBLICATION_EVIDENCE_EMPTY_LIST),
          ]) :
          normalizeDistinctStringArray([
            ...authoritativeMissingPublishedNodeIds,
            ...observedMissingPublishedNodeIds,
          ]);
  const missingPublishedCount =
    ownerReconcileNarrowsOpenPublication ?
      ownerReconcileNarrowedMissingPublishedNodeIds.length :
      staleGenericPublicationEpochClosure === true &&
      currentSelectedPublicationMembershipDeficitOpen !== true ?
        PUBLICATION_EVIDENCE_ZERO :
        authoritativePublicationMembershipAvailable ?
          Math.max(
            missingPublishedNodeIds.length,
            normalizeNonNegativeInteger(
              publicationConvergenceGate?.missingPublishedCount,
            ) ?? PUBLICATION_EVIDENCE_ZERO,
            normalizeNonNegativeInteger(
              rawPublicationConvergence?.missingPublishedCount,
            ) ?? PUBLICATION_EVIDENCE_ZERO,
          ) :
          Math.max(
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
      publicationStatus,
      recoveryProtocolState,
      requiredAckNodeIds,
      acknowledgedNodeIds,
      pendingAckNodeIds,
      pendingAckCount,
      pendingAckEvidenceState,
      missingPublishedNodeIds,
      missingPublishedCount,
      priorityRecoveryReasonCodes: currentPriorityRecoveryReasonCodes,
      prioritySpreadPending:
        priorityRecoveryObservation?.prioritySpreadPending === true ||
        publicationConvergenceGate?.prioritySpreadPending === true,
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

  return {
    ...(rawPublicationConvergence || {}),
    ...(publicationEpoch !== null ? {publicationEpoch} : {}),
    ...(publicationStatus ? {status: publicationStatus, publicationStatus} : {}),
    ...(recoveryProtocolState ? {recoveryProtocolState} : {}),
    priorityRecoveryReasonCodes: currentPriorityRecoveryReasonCodes,
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
    pendingAckEvidenceState: publicationOwnerStream.pendingAckEvidenceState,
    missingPublishedNodeIds,
    missingPublishedCount,
    publicationOwnerStream,
    streamOutcome: publicationOwnerStream.streamOutcome,
    ackState: publicationOwnerStream.ackState,
    freshnessFence: publicationOwnerStream.freshnessFence,
    recoveryOutcome: publicationOwnerStream.recoveryOutcome,
    publicationPending,
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


export {
  buildCanonicalPublicationConvergenceGate,
  buildCanonicalPriorityRecoveryObservation,
  buildCanonicalPublicationConvergence,
};
