import {NUM} from '../constants/index.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from './publication-recovery-gate.js';
import {
  buildPublicationOwnerStreamState,
  isPublicationOwnerStreamPublicationPending,
} from './publication-owner-state.js';
import {
  buildPublicationActiveGateHandoffContract,
  buildPublicationOperationWorkflowHandoff,
} from './publication-active-gate-handoff-contract.js';
import {
  hasActiveGateSelectedPublicationMembershipOpenEvidence,
} from './publication-recovery-membership-evidence-normalizers.js';
import {
  isRecord,
  normalizeBoolean,
  normalizeDistinctStringArray,
  normalizeMaximumNonNegativeInteger,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePublicationRecoveryHandoffNodeIds,
  PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION,
  PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION_RULES,
  PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD,
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  PUBLICATION_RECOVERY_HANDOFF_FIELD,
  PUBLICATION_RECOVERY_NODE_DEBT_STATE,
  PUBLICATION_RECOVERY_OWNER_RECONCILE_HANDOFF_MATCHERS,
  PUBLICATION_RECOVERY_PUBLICATION_STATUS,
} from './publication-recovery-evidence-values.js';

function buildPublicationRecoveryActiveGateHandoffFromProgress(
  progress = null,
) {
  const state = normalizeOptionalString(
    progress?.[
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF_STATE
    ],
  );
  const reasonCode = normalizeOptionalString(
    progress?.[
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF_REASON_CODE
    ],
  );
  const nextAction = normalizeOptionalString(
    progress?.[
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
    ],
  );
  const pendingReconcileNodeIds =
    normalizePublicationRecoveryHandoffNodeIds(
      progress?.[
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECONCILE_NODE_IDS
      ],
    );
  const pendingReconcileCount = normalizeMaximumNonNegativeInteger([
    progress?.[
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECONCILE_COUNT
    ],
    pendingReconcileNodeIds.length,
  ]);
  if (
    !state &&
    !reasonCode &&
    !nextAction &&
    pendingReconcileCount === NUM.ZERO
  ) {
    return null;
  }
  return Object.freeze({
    ...(state ? {
      [PUBLICATION_RECOVERY_HANDOFF_FIELD.STATE]: state,
    } : {}),
    ...(reasonCode ? {
      [PUBLICATION_RECOVERY_HANDOFF_FIELD.REASON_CODE]: reasonCode,
    } : {}),
    ...(nextAction ? {
      [PUBLICATION_RECOVERY_HANDOFF_FIELD.NEXT_ACTION]: nextAction,
    } : {}),
    [PUBLICATION_RECOVERY_HANDOFF_FIELD.RUNTIME_PROMOTION_ALLOWED]:
      normalizeBoolean(
        progress?.[
          PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
            .PUBLICATION_ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED
        ],
      ),
    [PUBLICATION_RECOVERY_HANDOFF_FIELD.PENDING_RECONCILE_COUNT]:
      pendingReconcileCount,
    [PUBLICATION_RECOVERY_HANDOFF_FIELD.PENDING_RECONCILE_NODE_IDS]:
      pendingReconcileNodeIds,
  });
}

function resolveOwnerReconcileNarrowedMissingPublishedNodeIds({
  publicationStatus = null,
  pendingAckEvidence = null,
  publicationActiveGateHandoff = null,
} = {}) {
  const canNarrow = [
    normalizeOptionalString(publicationStatus) ===
      PUBLICATION_RECOVERY_PUBLICATION_STATUS.OPEN,
    hasOwnerReconcilePublicationHandoff(publicationActiveGateHandoff),
    pendingAckEvidenceAllowsOwnerReconcileNarrowing(pendingAckEvidence),
  ].every(Boolean);
  if (!canNarrow) {
    return PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST;
  }
  return normalizeDistinctStringArray(
    publicationActiveGateHandoff.pendingReconcileNodeIds,
  );
}

function hasOwnerReconcilePublicationHandoff(handoff = null) {
  if (!isRecord(handoff)) {
    return false;
  }
  const matchesOwnerReconcileFields =
    PUBLICATION_RECOVERY_OWNER_RECONCILE_HANDOFF_MATCHERS.every((matcher) =>
      normalizeOptionalString(handoff[matcher.fieldName]) ===
        matcher.expectedValue,
    );
  return matchesOwnerReconcileFields &&
    normalizeBoolean(
      handoff[PUBLICATION_RECOVERY_HANDOFF_FIELD.RUNTIME_PROMOTION_ALLOWED],
    ) === false;
}

function hasNoPendingPublicationAckDebt(pendingAckEvidence = null) {
  return normalizeNonNegativeInteger(pendingAckEvidence?.pendingAckCount) ===
    NUM.ZERO &&
    normalizeDistinctStringArray(pendingAckEvidence?.pendingAckNodeIds)
      .length === NUM.ZERO;
}

function hasNoPendingPublicationAckNodeDebt(pendingAckEvidence = null) {
  return normalizeDistinctStringArray(pendingAckEvidence?.pendingAckNodeIds)
    .length === NUM.ZERO;
}

function hasCountOnlyPendingPublicationAckDebt(pendingAckEvidence = null) {
  return normalizeOptionalString(pendingAckEvidence?.evidenceState) ===
    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    hasNoPendingPublicationAckNodeDebt(pendingAckEvidence) &&
    normalizeNonNegativeInteger(pendingAckEvidence?.pendingAckCount) >
      NUM.ZERO;
}

function pendingAckEvidenceAllowsOwnerReconcileNarrowing(
  pendingAckEvidence = null,
) {
  return hasNoPendingPublicationAckDebt(pendingAckEvidence) ||
    hasCountOnlyPendingPublicationAckDebt(pendingAckEvidence);
}

function resolvePublicationMissingPublishedNodeIds({
  ownerReconcileNarrowsOpenPublication = false,
  ownerReconcileNarrowedMissingPublishedNodeIds =
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  publicationMembershipClosed = false,
  closedMissingPublishedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  authoritativePublicationMembershipAvailable = false,
  authoritativeMissingPublishedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  relevantObservedMissingPublishedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  observedMissingPublishedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
} = {}) {
  const selectedObservedMissingPublishedNodeIds =
    authoritativePublicationMembershipAvailable ?
      relevantObservedMissingPublishedNodeIds :
      observedMissingPublishedNodeIds;
  const choices = [
    Object.freeze({
      selected: ownerReconcileNarrowsOpenPublication,
      nodeIds: ownerReconcileNarrowedMissingPublishedNodeIds,
    }),
    Object.freeze({
      selected: publicationMembershipClosed,
      nodeIds: normalizeDistinctStringArray(closedMissingPublishedNodeIds),
    }),
    Object.freeze({
      selected: true,
      nodeIds: normalizeDistinctStringArray([
        ...authoritativeMissingPublishedNodeIds,
        ...selectedObservedMissingPublishedNodeIds,
      ]),
    }),
  ];
  return choices.find((choice) => choice.selected === true).nodeIds;
}

function resolvePublicationMissingPublishedCount({
  ownerReconcileNarrowsOpenPublication = false,
  ownerReconcileNarrowedMissingPublishedNodeIds =
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  publicationMembershipClosed = false,
  publicationMembershipClosedCount = NUM.ZERO,
  steadyPublishedSelectedPublicationMembershipOpen = false,
  missingPublishedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  authoritativePublicationMembershipAvailable = false,
  authoritativeCountValues = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  observedCountValues = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
} = {}) {
  const selectedCountValues = authoritativePublicationMembershipAvailable ?
    authoritativeCountValues :
    observedCountValues;
  const choices = [
    Object.freeze({
      selected: ownerReconcileNarrowsOpenPublication,
      count: ownerReconcileNarrowedMissingPublishedNodeIds.length,
    }),
    Object.freeze({
      selected: publicationMembershipClosed,
      count: normalizeNonNegativeInteger(publicationMembershipClosedCount),
    }),
    Object.freeze({
      selected: steadyPublishedSelectedPublicationMembershipOpen === true,
      count: missingPublishedNodeIds.length,
    }),
    Object.freeze({
      selected: true,
      count: normalizeMaximumNonNegativeInteger([
        missingPublishedNodeIds.length,
        ...selectedCountValues,
      ]),
    }),
  ];
  return choices.find((choice) => choice.selected === true).count;
}

function activeGateOpenDebtOutrunsPublicationOwnerStream({
  publicationStatus = null,
  pendingAckEvidence = null,
  missingPublishedCount = NUM.ZERO,
  activeGateProgressRecords = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  publicationOwnerStream = null,
} = {}) {
  if (
    !isRecord(publicationOwnerStream) ||
    normalizeOptionalString(publicationStatus) !==
      PUBLICATION_RECOVERY_PUBLICATION_STATUS.OPEN ||
    !hasActiveGateSelectedPublicationMembershipOpenEvidence(
      activeGateProgressRecords,
    )
  ) {
    return false;
  }
  return normalizeNonNegativeInteger(pendingAckEvidence?.pendingAckCount) >
    normalizeNonNegativeInteger(publicationOwnerStream.pendingAckCount) ||
    normalizeNonNegativeInteger(missingPublishedCount) >
      normalizeNonNegativeInteger(publicationOwnerStream.missingPublishedCount);
}

function haveSamePublicationRecoveryNodeIdSet(
  leftNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  rightNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
) {
  const left = normalizeDistinctStringArray(leftNodeIds);
  const right = normalizeDistinctStringArray(rightNodeIds);
  return left.length === right.length &&
    left.every((nodeId) => right.includes(nodeId));
}

function ownerReconcileNarrowingRefreshesPublicationOwnerStream({
  ownerReconcileNarrowsOpenPublication = false,
  ownerReconcileNarrowedMissingPublishedNodeIds =
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  publicationOwnerStream = null,
} = {}) {
  if (
    ownerReconcileNarrowsOpenPublication !== true ||
    !isRecord(publicationOwnerStream)
  ) {
    return false;
  }
  const narrowedMissingPublishedNodeIds = normalizeDistinctStringArray(
    ownerReconcileNarrowedMissingPublishedNodeIds,
  );
  return haveSamePublicationRecoveryNodeIdSet(
    publicationOwnerStream.missingPublishedNodeIds,
    narrowedMissingPublishedNodeIds,
  ) !== true ||
    normalizeNonNegativeInteger(publicationOwnerStream.missingPublishedCount) !==
      narrowedMissingPublishedNodeIds.length;
}

function alignPublicationRecoveryGateOwnerStreamWithOpenDebt(gate = null) {
  if (!isRecord(gate)) {
    return gate;
  }
  const pendingAckNodeIds = normalizeDistinctStringArray(
    gate.pendingAckNodeIds,
  );
  const publicationOwnerStream = buildPublicationOwnerStreamState({
    publicationRevision: gate.publicationEpoch,
    desiredPublicationRevision: gate.publicationEpoch,
    committedPublicationRevision:
      gate.publicationOwnerStream?.revision?.committed?.value,
    publicationStatus: gate.publicationStatus,
    publicationObservationState: gate.publicationObservationState,
    recoveryProtocolState: gate.recoveryProtocolState,
    requiredAckNodeIds: gate.requiredAckNodeIds,
    acknowledgedNodeIds: gate.acknowledgedNodeIds,
    ...(pendingAckNodeIds.length > NUM.ZERO ? {pendingAckNodeIds} : {}),
    pendingAckCount: gate.pendingAckCount,
    pendingAckEvidenceState: gate.pendingAckEvidenceState,
    missingPublishedNodeIds: gate.missingPublishedNodeIds,
    missingPublishedCount: gate.missingPublishedCount,
    priorityRecoveryReasonCodes: gate.reasonCodes,
    prioritySpreadPending: gate.prioritySpreadPending,
    prioritySpreadEvidenceUnavailable: gate.prioritySpreadEvidenceUnavailable,
    pressureState: gate.pressureState,
    pressureDeferred: gate.pressureDeferred,
    pressureCoalesced: gate.pressureCoalesced,
    pressureRetryAfterMs: gate.pressureRetryAfterMs,
    pressureReasonCodes: gate.pressureReasonCodes,
    publicationPendingHint: gate.publicationPending,
  });
  return Object.freeze({
    ...gate,
    publicationOwnerStream,
    streamOutcome: publicationOwnerStream.streamOutcome,
    ackState: publicationOwnerStream.ackState,
    freshnessFence: publicationOwnerStream.freshnessFence,
    recoveryOutcome: publicationOwnerStream.recoveryOutcome,
    publicationPending:
      isPublicationOwnerStreamPublicationPending(publicationOwnerStream),
    ackPending: publicationOwnerStream.pendingAckCount > NUM.ZERO,
  });
}

function normalizeActiveGateProgressRecords(options = {}) {
  return Object.freeze([
    options.activeGateBestProgress,
    options.activeGate?.bestProgress,
    options.activeGateProgress,
    options.activeGate?.progress,
  ].filter((progress) => isRecord(progress)));
}

function resolvePublicationRecoveryActiveGateHandoff(
  activeGateProgressRecords = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  publicationConvergenceGate = null,
  publicationConvergence = null,
) {
  if (isRecord(publicationConvergenceGate?.publicationActiveGateHandoff)) {
    return publicationConvergenceGate.publicationActiveGateHandoff;
  }
  if (isRecord(publicationConvergence?.publicationActiveGateHandoff)) {
    return publicationConvergence.publicationActiveGateHandoff;
  }
  for (const progress of activeGateProgressRecords) {
    if (
      isRecord(
        progress[
          PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
            .PUBLICATION_ACTIVE_GATE_HANDOFF
        ],
      )
    ) {
      return progress[
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF
      ];
    }
    const handoff =
      buildPublicationRecoveryActiveGateHandoffFromProgress(progress);
    if (handoff) {
      return handoff;
    }
  }
  return null;
}

function enrichPublicationRecoveryActiveGateHandoff({
  publicationActiveGateHandoff = null,
  publicationConvergence = null,
  priorityRecoveryObservation = null,
} = {}) {
  if (!isRecord(publicationActiveGateHandoff)) {
    return publicationActiveGateHandoff;
  }
  const operationWorkflowHandoff = buildPublicationOperationWorkflowHandoff({
    publicationConvergence: {
      ...(isRecord(publicationConvergence) ? publicationConvergence : {}),
      priorityRecoveryObservation,
      [PUBLICATION_RECOVERY_HANDOFF_FIELD.OPERATION_WORKFLOW_HANDOFF]:
        publicationActiveGateHandoff[
          PUBLICATION_RECOVERY_HANDOFF_FIELD.OPERATION_WORKFLOW_HANDOFF
        ],
    },
    handoffContract: publicationActiveGateHandoff,
  });
  return operationWorkflowHandoff ?
    Object.freeze({
      ...publicationActiveGateHandoff,
      [PUBLICATION_RECOVERY_HANDOFF_FIELD.OPERATION_WORKFLOW_HANDOFF]:
        operationWorkflowHandoff,
    }) :
    publicationActiveGateHandoff;
}

function buildPublicationRecoveryActiveGateHandoffEmissionSnapshot({
  publicationActiveGateHandoff = null,
  activeGateProgressRecords = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  publicationPending = false,
  recoveryProtocolState = null,
  pendingAckEvidence = null,
  missingPublishedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  missingPublishedCount = NUM.ZERO,
  prioritySpreadPending = false,
} = {}) {
  const normalizedMissingPublishedNodeIds = normalizeDistinctStringArray(
    missingPublishedNodeIds,
  );
  const normalizedPendingAckNodeIds = normalizeDistinctStringArray(
    pendingAckEvidence?.pendingAckNodeIds,
  );
  const pendingAckCount = normalizeMaximumNonNegativeInteger([
    pendingAckEvidence?.pendingAckCount,
    normalizedPendingAckNodeIds.length,
  ]);
  const normalizedMissingPublishedCount = normalizeMaximumNonNegativeInteger([
    missingPublishedCount,
    normalizedMissingPublishedNodeIds.length,
  ]);
  const nodeDebtState =
    pendingAckCount > NUM.ZERO ||
    normalizedMissingPublishedCount > NUM.ZERO ?
      PUBLICATION_RECOVERY_NODE_DEBT_STATE.PRESENT :
      PUBLICATION_RECOVERY_NODE_DEBT_STATE.ABSENT;
  return Object.freeze({
    existingHandoffAvailable: isRecord(publicationActiveGateHandoff),
    activeGateProgressAvailable:
      activeGateProgressRecords.length > NUM.ZERO,
    publicationPending,
    recoveryProtocolState: normalizeOptionalString(recoveryProtocolState),
    nodeDebtState,
    prioritySpreadPending,
  });
}

function resolvePublicationRecoveryActiveGateHandoffEmission(snapshot) {
  return PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION_RULES.find((rule) =>
    rule.matches(snapshot),
  ).outcome;
}

function resolvePublicationRecoveryEmittedActiveGateHandoff({
  publicationActiveGateHandoff = null,
  publicationConvergence = null,
  priorityRecoveryObservation = null,
  activeGateProgressRecords = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  publicationEpoch = null,
  publicationStatus = null,
  recoveryProtocolState = null,
  publicationPending = false,
  pendingAckEvidence = null,
  missingPublishedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  missingPublishedCount = NUM.ZERO,
  publishedActiveNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  prioritySpreadPending = false,
} = {}) {
  const snapshot = buildPublicationRecoveryActiveGateHandoffEmissionSnapshot({
    publicationActiveGateHandoff,
    activeGateProgressRecords,
    publicationPending,
    recoveryProtocolState,
    pendingAckEvidence,
    missingPublishedNodeIds,
    missingPublishedCount,
    prioritySpreadPending,
  });
  const outcome = resolvePublicationRecoveryActiveGateHandoffEmission(snapshot);
  if (
    outcome ===
    PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION.PRESERVE_EXISTING
  ) {
    return publicationActiveGateHandoff;
  }
  if (
    outcome !==
    PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION
      .EMIT_UNPUBLISHED_RECONCILE
  ) {
    return null;
  }
  return enrichPublicationRecoveryActiveGateHandoff({
    publicationActiveGateHandoff: buildPublicationActiveGateHandoffContract({
      publicationConvergence: {
        ...(isRecord(publicationConvergence) ? publicationConvergence : {}),
        publicationEpoch,
        publicationStatus,
        recoveryProtocolState,
        publicationPending,
        pendingAckNodeIds: pendingAckEvidence?.pendingAckNodeIds,
        pendingAckCount: pendingAckEvidence?.pendingAckCount,
        missingPublishedNodeIds,
        missingPublishedCount,
        publishedActiveNodeIds,
        prioritySpreadPending,
      },
      activeGateProgress: activeGateProgressRecords[NUM.ZERO],
    }),
    publicationConvergence,
    priorityRecoveryObservation,
  });
}

export {
  buildPublicationRecoveryActiveGateHandoffFromProgress,
  resolveOwnerReconcileNarrowedMissingPublishedNodeIds,
  resolvePublicationMissingPublishedNodeIds,
  resolvePublicationMissingPublishedCount,
  hasOwnerReconcilePublicationHandoff,
  hasNoPendingPublicationAckDebt,
  hasNoPendingPublicationAckNodeDebt,
  hasCountOnlyPendingPublicationAckDebt,
  pendingAckEvidenceAllowsOwnerReconcileNarrowing,
  activeGateOpenDebtOutrunsPublicationOwnerStream,
  haveSamePublicationRecoveryNodeIdSet,
  ownerReconcileNarrowingRefreshesPublicationOwnerStream,
  alignPublicationRecoveryGateOwnerStreamWithOpenDebt,
  normalizeActiveGateProgressRecords,
  resolvePublicationRecoveryActiveGateHandoff,
  enrichPublicationRecoveryActiveGateHandoff,
  buildPublicationRecoveryActiveGateHandoffEmissionSnapshot,
  resolvePublicationRecoveryActiveGateHandoffEmission,
  resolvePublicationRecoveryEmittedActiveGateHandoff,
};
