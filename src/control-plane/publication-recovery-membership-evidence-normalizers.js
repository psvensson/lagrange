import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from './publication-recovery-gate.js';
import {
  isRecord,
  normalizeDistinctStringArray,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  resolveActiveGateProgressString,
  PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD,
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  PUBLICATION_RECOVERY_PUBLICATION_STATUS,
  PUBLICATION_RECOVERY_PROTOCOL_STATE,
  PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE,
  PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_RANK,
  PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE,
} from './publication-recovery-evidence-values.js';

function buildPublicationRecoverySelectedMissingEvidence(state, nodeIds) {
  return Object.freeze({
    state,
    nodeIds: normalizeDistinctStringArray(nodeIds),
  });
}

function resolveActiveGateSelectedMissingPublishedEvidenceFromProgress(
  progress = null,
) {
  if (!isRecord(progress)) {
    return PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE.UNAVAILABLE;
  }
  const expectedNodeCount = normalizeNonNegativeInteger(
    progress[PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.EXPECTED_NODE_COUNT],
  );
  const selectedPublishedActiveNodeIds = normalizeDistinctStringArray(
    progress[
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .SELECTED_PUBLISHED_ACTIVE_NODE_IDS
    ],
  );
  const selectedPublishedActiveCount = Math.max(
    normalizeNonNegativeInteger(
      progress[
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
          .SELECTED_PUBLISHED_ACTIVE_COUNT
      ],
    ),
    selectedPublishedActiveNodeIds.length,
  );
  if (
    Array.isArray(
      progress[
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
          .SELECTED_MISSING_PUBLISHED_NODE_IDS
      ],
    )
  ) {
    const explicitSelectedMissingPublishedNodeIds = normalizeDistinctStringArray(
      progress[
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
          .SELECTED_MISSING_PUBLISHED_NODE_IDS
      ],
    );
    return explicitSelectedMissingPublishedNodeIds.length === 0 &&
      expectedNodeCount > 0 &&
      selectedPublishedActiveCount === expectedNodeCount ?
      buildPublicationRecoverySelectedMissingEvidence(
        PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE
          .FULL_SELECTED_COVERAGE,
        PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
      ) :
      buildPublicationRecoverySelectedMissingEvidence(
        PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE.EXPLICIT_NODE_LIST,
        explicitSelectedMissingPublishedNodeIds,
      );
  }
  return expectedNodeCount > 0 &&
    selectedPublishedActiveCount === expectedNodeCount ?
    buildPublicationRecoverySelectedMissingEvidence(
      PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE
        .FULL_SELECTED_COVERAGE,
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    ) :
    PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE.UNAVAILABLE;
}

function resolveActiveGateSelectedMissingPublishedEvidence(
  activeGateProgressRecords = [],
) {
  let selectedEvidence = PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE
    .UNAVAILABLE;
  for (const activeGateProgress of activeGateProgressRecords) {
    const evidence =
      resolveActiveGateSelectedMissingPublishedEvidenceFromProgress(
        activeGateProgress,
      );
    const selectedRank =
      PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_RANK[
        selectedEvidence.state
      ];
    const evidenceRank =
      PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_RANK[evidence.state];
    const evidenceHasNodeDetail =
      evidence.nodeIds.length > selectedEvidence.nodeIds.length;
    if (evidenceRank > selectedRank || evidenceHasNodeDetail) {
      selectedEvidence = evidence;
    }
  }
  return selectedEvidence;
}

function resolveActiveGateSelectedPublicationMembershipNodeIds(
  activeGateProgressRecords = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
) {
  for (const progress of activeGateProgressRecords) {
    if (!isRecord(progress)) {
      continue;
    }
    const expectedNodeCount = normalizeNonNegativeInteger(
      progress[
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.EXPECTED_NODE_COUNT
      ],
    );
    const selectedPublishedActiveNodeIds = normalizeDistinctStringArray(
      progress[
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
          .SELECTED_PUBLISHED_ACTIVE_NODE_IDS
      ],
    );
    const selectedMissingPublishedEvidence =
      resolveActiveGateSelectedMissingPublishedEvidenceFromProgress(progress);
    if (
      selectedMissingPublishedEvidence.state ===
      PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE.UNAVAILABLE
    ) {
      continue;
    }
    const selectedPublicationMembershipNodeIds = normalizeDistinctStringArray([
      ...selectedPublishedActiveNodeIds,
      ...selectedMissingPublishedEvidence.nodeIds,
    ]);
    if (
      expectedNodeCount > 0 &&
      selectedPublishedActiveNodeIds.length > 0 &&
      selectedPublicationMembershipNodeIds.length === expectedNodeCount
    ) {
      return selectedPublicationMembershipNodeIds;
    }
  }
  return null;
}

function hasActiveGateProgressPrioritySpreadClosure(progress = null) {
  if (!isRecord(progress)) {
    return false;
  }
  const progressClasses = progress[
    PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
      .PRIORITY_RECOVERY_PROGRESS_CLASSES
  ];
  const unresolvedClassCount = normalizeNonNegativeInteger(
    progressClasses?.unresolvedClassCount ??
    progress[
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .PRIORITY_RECOVERY_UNRESOLVED_CLASS_COUNT
    ],
  );
  const unresolvedSemanticStateCount = normalizeNonNegativeInteger(
    progressClasses?.unresolvedSemanticStateCount ??
    progress[
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_COUNT
    ],
  );
  const blockedPartitionCount = normalizeNonNegativeInteger(
    progressClasses?.blockedPartitionCount ??
    progress[
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT
    ],
  );
  return progress[
    PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
      .PRIORITY_SPREAD_SATISFIED
  ] === true &&
    unresolvedClassCount === 0 &&
    unresolvedSemanticStateCount === 0 &&
    blockedPartitionCount === 0;
}

function hasSelectedPublicationMembershipClosureEvidence({
  publicationStatus = null,
  pendingAckEvidence = null,
  activeGateProgressRecords = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
} = {}) {
  if (
    publicationStatus !== PUBLICATION_RECOVERY_PUBLICATION_STATUS.OPEN ||
    pendingAckEvidence?.evidenceState !==
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY ||
    pendingAckEvidence?.pendingAckCount !== 0 ||
    pendingAckEvidence?.pendingAckNodeIds?.length !== 0
  ) {
    return false;
  }
  return hasActiveGateSelectedPublicationMembershipCohortProof(
    activeGateProgressRecords,
  );
}

function hasActiveGateSelectedPublicationMembershipCohortProof(
  activeGateProgressRecords = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
) {
  for (const progress of activeGateProgressRecords) {
    const selectedPublicationMembershipNodeIds =
      resolveActiveGateSelectedPublicationMembershipNodeIds([progress]);
    const selectedMissingPublishedEvidence =
      resolveActiveGateSelectedMissingPublishedEvidenceFromProgress(progress);
    if (
      Array.isArray(selectedPublicationMembershipNodeIds) &&
      selectedPublicationMembershipNodeIds.length > 0 &&
      selectedMissingPublishedEvidence.state ===
        PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE
          .EXPLICIT_NODE_LIST &&
      selectedMissingPublishedEvidence.nodeIds.length > 0 &&
      hasActiveGateProgressPrioritySpreadClosure(progress)
    ) {
      return true;
    }
  }
  return false;
}

function hasActiveGateSelectedPublicationMembershipOpenEvidence(
  activeGateProgressRecords = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
) {
  for (const progress of activeGateProgressRecords) {
    const selectedPublicationMembershipNodeIds =
      resolveActiveGateSelectedPublicationMembershipNodeIds([progress]);
    const selectedMissingPublishedEvidence =
      resolveActiveGateSelectedMissingPublishedEvidenceFromProgress(progress);
    if (
      Array.isArray(selectedPublicationMembershipNodeIds) &&
      selectedPublicationMembershipNodeIds.length > 0 &&
      selectedMissingPublishedEvidence.state ===
        PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE
          .EXPLICIT_NODE_LIST &&
      selectedMissingPublishedEvidence.nodeIds.length > 0 &&
      !hasActiveGateProgressPrioritySpreadClosure(progress)
    ) {
      return true;
    }
  }
  return false;
}

function resolveEffectivePublicationMembershipNodeIds({
  authoritativePublicationMembershipNodeIds =
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  selectedPublicationMembershipNodeIds = null,
  selectedPublicationMembershipOpen = false,
} = {}) {
  return selectedPublicationMembershipOpen === true &&
    Array.isArray(selectedPublicationMembershipNodeIds) &&
    selectedPublicationMembershipNodeIds.length > 0 ?
    normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(
        authoritativePublicationMembershipNodeIds,
      ),
      ...selectedPublicationMembershipNodeIds,
    ]) :
    normalizeDistinctStringArray(authoritativePublicationMembershipNodeIds);
}

function hasSteadyPublishedSelectedPublicationMembershipOpen({
  publicationConvergence = null,
  publicationConvergenceGate = null,
  priorityRecoveryObservation = null,
  activeGateProgressRecords = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  pendingAckCount = 0,
} = {}) {
  if (pendingAckCount > 0) {
    return false;
  }
  const activeGatePublicationStatus = resolveActiveGateProgressString(
    activeGateProgressRecords,
    PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.PUBLICATION_STATUS,
  );
  const activeGateRecoveryProtocolState = resolveActiveGateProgressString(
    activeGateProgressRecords,
    PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.RECOVERY_PROTOCOL_STATE,
  );
  const publicationStatus = normalizeOptionalString(
    priorityRecoveryObservation?.publicationStatus,
  ) ||
    normalizeOptionalString(publicationConvergenceGate?.publicationStatus) ||
    normalizeOptionalString(publicationConvergence?.publicationStatus) ||
    normalizeOptionalString(publicationConvergence?.status) ||
    activeGatePublicationStatus;
  const recoveryProtocolState = normalizeOptionalString(
    priorityRecoveryObservation?.recoveryProtocolState,
  ) ||
    normalizeOptionalString(publicationConvergenceGate?.recoveryProtocolState) ||
    normalizeOptionalString(publicationConvergence?.recoveryProtocolState) ||
    normalizeOptionalString(
      publicationConvergence?.membershipLifecycleSummary?.recoveryProtocolState,
    ) ||
    activeGateRecoveryProtocolState;
  const prioritySpreadPending =
    priorityRecoveryObservation?.prioritySpreadPending === true ||
    publicationConvergenceGate?.prioritySpreadPending === true ||
    publicationConvergence?.prioritySpreadPending === true;
  if (
    publicationStatus !== PUBLICATION_RECOVERY_PUBLICATION_STATUS.PUBLISHED ||
    recoveryProtocolState !==
      PUBLICATION_RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED ||
    prioritySpreadPending === true
  ) {
    return false;
  }
  for (const progress of activeGateProgressRecords) {
    if (!isRecord(progress)) {
      continue;
    }
    const selectedPublicationMembershipNodeIds =
      resolveActiveGateSelectedPublicationMembershipNodeIds([progress]);
    const selectedMissingPublishedEvidence =
      resolveActiveGateSelectedMissingPublishedEvidenceFromProgress(progress);
    const progressPublicationStatus = normalizeOptionalString(
      progress[
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.PUBLICATION_STATUS
      ],
    );
    const progressRecoveryProtocolState = normalizeOptionalString(
      progress[
        PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.RECOVERY_PROTOCOL_STATE
      ],
    );
    if (
      Array.isArray(selectedPublicationMembershipNodeIds) &&
      selectedPublicationMembershipNodeIds.length > 0 &&
      selectedMissingPublishedEvidence.nodeIds.length > 0 &&
      hasActiveGateProgressPrioritySpreadClosure(progress) &&
      (
        progressPublicationStatus === null ||
        progressPublicationStatus ===
          PUBLICATION_RECOVERY_PUBLICATION_STATUS.PUBLISHED
      ) &&
      (
        progressRecoveryProtocolState === null ||
        progressRecoveryProtocolState ===
          PUBLICATION_RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED
      )
    ) {
      return true;
    }
  }
  return false;
}

function hasActiveGateSelectedMissingPublishedEvidence(evidence) {
  return evidence?.state !==
    PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE.UNAVAILABLE;
}

export {
  buildPublicationRecoverySelectedMissingEvidence,
  resolveActiveGateSelectedMissingPublishedEvidenceFromProgress,
  resolveActiveGateSelectedMissingPublishedEvidence,
  resolveActiveGateSelectedPublicationMembershipNodeIds,
  hasActiveGateProgressPrioritySpreadClosure,
  hasSelectedPublicationMembershipClosureEvidence,
  hasActiveGateSelectedPublicationMembershipCohortProof,
  hasActiveGateSelectedPublicationMembershipOpenEvidence,
  resolveEffectivePublicationMembershipNodeIds,
  hasSteadyPublishedSelectedPublicationMembershipOpen,
  hasActiveGateSelectedMissingPublishedEvidence,
};
