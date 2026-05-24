import {NUM, TYPEOF} from '../constants/index.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD,
  PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE_RANK,
  PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH,
} from './publication-active-gate-handoff-contract-constants.js';
import {
  isPublicationActiveGateHandoffRecord,
  normalizePublicationActiveGateHandoffDebtCount,
  normalizePublicationActiveGateHandoffNodeIdList,
  resolvePublicationActiveGateHandoffPublicationEpoch,
} from './publication-active-gate-handoff-contract-helpers.js';
import {
  collectPublicationActiveGateHandoffTargetEvidenceNodeIds,
} from './publication-active-gate-handoff-contract-evidence.js';

function hasFlattenedPublicationActiveGateHandoffSignal(value = null) {
  if (!isPublicationActiveGateHandoffRecord(value)) {
    return false;
  }
  return typeof value[
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
      .PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
  ] === TYPEOF.STRING ||
    Number(value[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECONCILE_COUNT
    ]) > NUM.ZERO ||
    Number(value[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECOVERY_COUNT
    ]) > NUM.ZERO ||
    normalizePublicationActiveGateHandoffNodeIdList(
      value[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECONCILE_NODE_IDS
      ],
    ).length > NUM.ZERO ||
    normalizePublicationActiveGateHandoffNodeIdList(
      value[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECOVERY_NODE_IDS
      ],
    ).length > NUM.ZERO;
}

function selectFirstPublicationActiveGateHandoffNodeIdList(
  ...candidateValues
) {
  for (const candidateValue of candidateValues) {
    const nodeIds =
      normalizePublicationActiveGateHandoffNodeIdList(candidateValue);
    if (nodeIds.length > NUM.ZERO) {
      return nodeIds;
    }
  }
  return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
}

function selectPublicationActiveGateHandoffProgressContextRecord(
  value,
  fieldName,
) {
  const directHandoff = value[
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF
  ];
  if (isPublicationActiveGateHandoffRecord(directHandoff)) {
    return directHandoff;
  }
  const nestedHandoff = value[
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE
  ]?.[
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF
  ];
  if (isPublicationActiveGateHandoffRecord(nestedHandoff)) {
    return nestedHandoff;
  }
  const ownerCohort =
    value[fieldName];
  return isPublicationActiveGateHandoffRecord(ownerCohort) ?
    ownerCohort :
    PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD;
}

function selectPublicationActiveGateProgressRecord(value = null) {
  if (!isPublicationActiveGateHandoffRecord(value)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD;
  }
  const directProgress = value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROGRESS];
  if (hasFlattenedPublicationActiveGateHandoffSignal(directProgress)) {
    return directProgress;
  }
  const activeGateProgress =
    value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE]?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROGRESS
    ];
  if (hasFlattenedPublicationActiveGateHandoffSignal(activeGateProgress)) {
    return activeGateProgress;
  }
  const publicationConvergenceProgress =
    value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE]?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE
    ]?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROGRESS];
  return hasFlattenedPublicationActiveGateHandoffSignal(
    publicationConvergenceProgress,
  ) ?
    publicationConvergenceProgress :
    null;
}

function buildPublicationActiveGateHandoffContractFromProgress(
  value,
  progress,
) {
  const publicationConvergence =
    isPublicationActiveGateHandoffRecord(
      value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE],
    ) ?
      value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE] :
      value;
  const selectedPublishedActiveNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      progress[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .SELECTED_PUBLISHED_ACTIVE_NODE_IDS
      ],
    );
  const selectedMissingPublishedNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      progress[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .SELECTED_MISSING_PUBLISHED_NODE_IDS
      ],
    );
  const expectedNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList([
      ...selectedPublishedActiveNodeIds,
      ...selectedMissingPublishedNodeIds,
    ]);
  const progressContextHandoff =
    selectPublicationActiveGateHandoffProgressContextRecord(
      value,
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_OWNER_COHORT,
    );
  const pendingRecoveryNodeIds =
    selectFirstPublicationActiveGateHandoffNodeIdList(
      progress[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECOVERY_NODE_IDS
      ],
      progressContextHandoff?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECOVERY_NODE_IDS
      ],
    );
  const pendingReconcileNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      progress[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECONCILE_NODE_IDS
      ],
    );
  return Object.freeze({
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    state:
      progress[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_STATE
      ],
    reasonCode:
      progress[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_REASON_CODE
      ],
    nextAction:
      progress[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
      ],
    runtimePromotionAllowed:
      progress[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED
      ] === true,
    publicationEpoch:
      publicationConvergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH
      ],
    expectedNodeIds,
    publishedActiveNodeIds:
      selectedPublishedActiveNodeIds.length > NUM.ZERO ?
        selectedPublishedActiveNodeIds :
        normalizePublicationActiveGateHandoffNodeIdList(
          publicationConvergence[
            PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
          ],
        ),
    missingPublishedNodeIds:
      selectedMissingPublishedNodeIds.length > NUM.ZERO ?
        selectedMissingPublishedNodeIds :
        normalizePublicationActiveGateHandoffNodeIdList(
          publicationConvergence[
            PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS
          ],
        ),
    pendingRecoveryNodeIds,
    pendingRecoveryCount: normalizePublicationActiveGateHandoffDebtCount(
      progress[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECOVERY_COUNT
      ] ??
        progressContextHandoff?.[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECOVERY_COUNT
        ],
      pendingRecoveryNodeIds,
    ),
    pendingReconcileNodeIds,
    pendingReconcileCount: normalizePublicationActiveGateHandoffDebtCount(
      progress[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECONCILE_COUNT
      ],
      pendingReconcileNodeIds,
    ),
  });
}

function resolvePublicationActiveGateHandoffCandidateStateRank(
  candidate = null,
) {
  return PUBLICATION_ACTIVE_GATE_HANDOFF_STATE_RANK[
    candidate?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE]
  ] || NUM.ZERO;
}

function resolvePublicationActiveGateHandoffCandidatePendingCount(
  candidate = null,
) {
  const pendingReconcileNodeIds = normalizePublicationActiveGateHandoffNodeIdList(
    candidate?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_NODE_IDS
    ],
  );
  const pendingRecoveryNodeIds = normalizePublicationActiveGateHandoffNodeIdList(
    candidate?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECOVERY_NODE_IDS
    ],
  );
  return normalizePublicationActiveGateHandoffDebtCount(
    candidate?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_COUNT],
    pendingReconcileNodeIds,
  ) +
    normalizePublicationActiveGateHandoffDebtCount(
      candidate?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECOVERY_COUNT],
      pendingRecoveryNodeIds,
    );
}

function resolvePublicationActiveGateHandoffCandidateNodeCount(
  candidate = null,
) {
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...normalizePublicationActiveGateHandoffNodeIdList(
      candidate?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EXPECTED_NODE_IDS],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      candidate?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
      ],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      candidate?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS
      ],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      candidate?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_NODE_IDS
      ],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      candidate?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECOVERY_NODE_IDS
      ],
    ),
  ]).length;
}

function buildPublicationActiveGateHandoffCandidateRank(candidate = null) {
  return Object.freeze({
    promotionAllowed:
      candidate?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED
      ] === true ||
      candidate?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.RUNTIME_PROMOTION_ALLOWED
      ] === true,
    stateRank:
      resolvePublicationActiveGateHandoffCandidateStateRank(candidate),
    pendingReconcileCount:
      resolvePublicationActiveGateHandoffCandidatePendingCount(candidate),
    nodeCount:
      resolvePublicationActiveGateHandoffCandidateNodeCount(candidate),
    publicationEpoch: resolvePublicationActiveGateHandoffPublicationEpoch(
      candidate,
    ),
  });
}

function comparePublicationActiveGateHandoffCandidateRank(
  candidate,
  selected,
) {
  if (!isPublicationActiveGateHandoffRecord(selected)) {
    return NUM.ONE;
  }
  const candidateRank =
    buildPublicationActiveGateHandoffCandidateRank(candidate);
  const selectedRank =
    buildPublicationActiveGateHandoffCandidateRank(selected);
  const decisiveDelta = [
    Number(candidateRank.promotionAllowed) -
      Number(selectedRank.promotionAllowed),
    candidateRank.stateRank - selectedRank.stateRank,
    selectedRank.pendingReconcileCount -
      candidateRank.pendingReconcileCount,
    candidateRank.nodeCount - selectedRank.nodeCount,
    candidateRank.publicationEpoch - selectedRank.publicationEpoch,
  ].find((delta) => delta !== NUM.ZERO);
  return typeof decisiveDelta === TYPEOF.NUMBER ?
    decisiveDelta :
    NUM.ZERO;
}

function selectMostAdvancedPublicationActiveGateHandoffCandidate(
  candidates = PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
) {
  return candidates
    .filter(isPublicationActiveGateHandoffRecord)
    .reduce(
      (selected, candidate) =>
        comparePublicationActiveGateHandoffCandidateRank(
          candidate,
          selected,
        ) > NUM.ZERO ?
          candidate :
          selected,
      null,
    );
}

function buildPublicationActiveGateHandoffEmptyReconcileTarget(
  handoffContract = null,
) {
  const pendingRecoveryNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      handoffContract?.pendingRecoveryNodeIds,
    );
  return Object.freeze({
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_STATE.ABSENT,
    reconcileRequired: false,
    handoffContract,
    publishedActiveNodeIds: PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
    requiredAckNodeIds: PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
    acknowledgedNodeIds: PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
    pendingReconcileNodeIds: PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
    pendingRecoveryNodeIds,
    pendingRecoveryCount: normalizePublicationActiveGateHandoffDebtCount(
      handoffContract?.pendingRecoveryCount,
      pendingRecoveryNodeIds,
    ),
  });
}

function resolvePublicationActiveGateHandoffReconcileTargetNodeIds(
  handoffContract,
  targetEvidence = null,
) {
  const pendingRecoveryNodeIdSet = new Set(
    handoffContract.pendingRecoveryNodeIds,
  );
  const expectedTargetNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList([
      ...handoffContract.expectedNodeIds,
      ...collectPublicationActiveGateHandoffTargetEvidenceNodeIds(
        targetEvidence,
      ),
    ]);
  const selectedPendingReconcileNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      handoffContract.pendingReconcileNodeIds,
    ).filter((nodeId) => !pendingRecoveryNodeIdSet.has(nodeId));
  const expectedReconcileTargetNodeIds = expectedTargetNodeIds.filter(
    (nodeId) => !pendingRecoveryNodeIdSet.has(nodeId),
  );
  const selectedReconcileTargetNodeIds =
    expectedReconcileTargetNodeIds.length > NUM.ZERO ?
      expectedReconcileTargetNodeIds :
      selectedPendingReconcileNodeIds;
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...handoffContract.publishedActiveNodeIds,
    ...selectedReconcileTargetNodeIds,
  ]);
}

function buildPublicationActiveGateHandoffReconcileTarget(
  handoffContract,
  targetEvidence = null,
) {
  const publishedActiveNodeIds =
    resolvePublicationActiveGateHandoffReconcileTargetNodeIds(
      handoffContract,
      targetEvidence,
    );
  if (publishedActiveNodeIds.length === NUM.ZERO) {
    return buildPublicationActiveGateHandoffEmptyReconcileTarget(
      handoffContract,
    );
  }
  return Object.freeze({
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_STATE.SELECTED,
    reconcileRequired: true,
    handoffContract,
    publishedActiveNodeIds,
    requiredAckNodeIds: publishedActiveNodeIds,
    acknowledgedNodeIds: publishedActiveNodeIds,
    pendingReconcileNodeIds: handoffContract.pendingReconcileNodeIds,
    pendingRecoveryNodeIds: handoffContract.pendingRecoveryNodeIds,
    pendingRecoveryCount: handoffContract.pendingRecoveryCount,
  });
}

function hasPublicationActiveGateOwnerRecoveryWaitSignal(value = null) {
  const handoffRecord =
    isPublicationActiveGateHandoffRecord(value) ?
      value :
      PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD;
  const pendingRecoveryNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      handoffRecord?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECOVERY_NODE_IDS
      ],
    );
  const normalizedPendingRecoveryCount =
    normalizePublicationActiveGateHandoffDebtCount(
      handoffRecord?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECOVERY_COUNT
      ],
      pendingRecoveryNodeIds,
    );
  return handoffRecord?.nextAction ===
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY &&
    (
      normalizedPendingRecoveryCount > NUM.ZERO ||
      pendingRecoveryNodeIds.length > NUM.ZERO
    );
}

export {
  hasFlattenedPublicationActiveGateHandoffSignal,
  selectFirstPublicationActiveGateHandoffNodeIdList,
  selectPublicationActiveGateHandoffProgressContextRecord,
  selectPublicationActiveGateProgressRecord,
  buildPublicationActiveGateHandoffContractFromProgress,
  resolvePublicationActiveGateHandoffCandidateStateRank,
  resolvePublicationActiveGateHandoffCandidatePendingCount,
  resolvePublicationActiveGateHandoffCandidateNodeCount,
  buildPublicationActiveGateHandoffCandidateRank,
  comparePublicationActiveGateHandoffCandidateRank,
  selectMostAdvancedPublicationActiveGateHandoffCandidate,
  buildPublicationActiveGateHandoffEmptyReconcileTarget,
  resolvePublicationActiveGateHandoffReconcileTargetNodeIds,
  buildPublicationActiveGateHandoffReconcileTarget,
  hasPublicationActiveGateOwnerRecoveryWaitSignal,
};
