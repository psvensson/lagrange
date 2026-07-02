import {
  CONTROL_PLANE_READINESS_REASON,
} from './control-plane-readiness-constants.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_ACTIVE_NODE_VIEW_FIELDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD,
  PUBLICATION_ACTIVE_GATE_HANDOFF_LIFECYCLE_NODE_FIELDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NODE_DEBT_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_OWNER_REASON_CODES,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_BLOCKER_COUNT_FIELDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_BLOCKER_LIST_FIELDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_GROUPS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_SUMMARY_BLOCKER_FIELDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_NODE_FIELDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_OBSERVATION_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT,
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_PROTOCOL_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_CONTEXT_FIELDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_NODE_FIELDS,
} from './publication-active-gate-handoff-contract-constants.js';
import {
  isPublicationActiveGateHandoffRecord,
  normalizePublicationActiveGateHandoffDebtCount,
  normalizePublicationActiveGateHandoffInteger,
  normalizePublicationActiveGateHandoffNodeIdList,
  normalizePublicationActiveGateHandoffText,
} from './publication-active-gate-handoff-contract-helpers.js';

const PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT_RULES =
  Object.freeze([
    Object.freeze({
      requirement:
        PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT.REQUIRED,
      matches: (snapshot) =>
        snapshot.publicationPending === true &&
        snapshot.unpublishedObservation === true &&
        snapshot.nodeDebtState ===
          PUBLICATION_ACTIVE_GATE_HANDOFF_NODE_DEBT_STATE.ABSENT &&
        snapshot.prioritySpreadPending !== true,
    }),
    Object.freeze({
      requirement:
        PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT.NOT_REQUIRED,
      matches: () => true,
    }),
  ]);

function normalizePublicationActiveGateHandoffPublicationSnapshot(
  publicationConvergence = null,
) {
  const convergence = isPublicationActiveGateHandoffRecord(
    publicationConvergence,
  ) ?
    publicationConvergence :
    {};
  const membershipLifecycleSummary = isPublicationActiveGateHandoffRecord(
    convergence[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MEMBERSHIP_LIFECYCLE_SUMMARY
    ],
  ) ?
    convergence[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MEMBERSHIP_LIFECYCLE_SUMMARY
    ] :
    {};
  const publicationObservation = isPublicationActiveGateHandoffRecord(
    convergence[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_OBSERVATION
    ],
  ) ?
    convergence[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_OBSERVATION
    ] :
    {};
  const publicationObservationState =
    normalizePublicationActiveGateHandoffText(
      convergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_OBSERVATION_STATE
      ] ??
      publicationObservation[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE
      ] ??
      membershipLifecycleSummary[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_OBSERVATION_STATE
      ],
    );
  const recoveryProtocolState =
    normalizePublicationActiveGateHandoffText(
      convergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.RECOVERY_PROTOCOL_STATE
      ] ??
      membershipLifecycleSummary[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.RECOVERY_PROTOCOL_STATE
      ],
    );
  const pendingAckNodeIds = normalizePublicationActiveGateHandoffNodeIdList(
    convergence[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_ACK_NODE_IDS],
  );
  const missingPublishedNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      convergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS
      ],
    );
  const pendingAckCount = normalizePublicationActiveGateHandoffDebtCount(
    convergence[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_ACK_COUNT],
    pendingAckNodeIds,
  );
  const missingPublishedCount = normalizePublicationActiveGateHandoffDebtCount(
    convergence[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_COUNT],
    missingPublishedNodeIds,
  );
  const nodeDebtState =
    pendingAckCount > 0 || missingPublishedCount > 0 ?
      PUBLICATION_ACTIVE_GATE_HANDOFF_NODE_DEBT_STATE.PRESENT :
      PUBLICATION_ACTIVE_GATE_HANDOFF_NODE_DEBT_STATE.ABSENT;
  return Object.freeze({
    publicationPending:
      convergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_PENDING
      ] === true,
    unpublishedObservation:
      publicationObservationState ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_OBSERVATION_STATE
          .UNPUBLISHED ||
      recoveryProtocolState ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_PROTOCOL_STATE
          .UNPUBLISHED_OBSERVATION,
    nodeDebtState,
    prioritySpreadPending:
      convergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PRIORITY_SPREAD_PENDING
      ] === true ||
      membershipLifecycleSummary[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PRIORITY_SPREAD_PENDING
      ] === true,
  });
}

function resolvePublicationActiveGateHandoffReconcileRequirement(
  publicationConvergence = null,
) {
  const snapshot =
    normalizePublicationActiveGateHandoffPublicationSnapshot(
      publicationConvergence,
    );
  return PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT_RULES.find(
    (rule) => rule.matches(snapshot),
  ).requirement;
}

function collectPublicationActiveGateHandoffRecordNodeIds(
  value = null,
  fields = PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_NODE_FIELDS,
) {
  if (!isPublicationActiveGateHandoffRecord(value)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return normalizePublicationActiveGateHandoffNodeIdList(
    fields.flatMap((field) =>
      normalizePublicationActiveGateHandoffNodeIdList(value[field]),
    ),
  );
}

function collectPublicationActiveGateHandoffNodeRows(nodeRows = []) {
  if (!Array.isArray(nodeRows)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return normalizePublicationActiveGateHandoffNodeIdList(
    nodeRows.flatMap((nodeRow) => [
      nodeRow?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NODE_ID],
      nodeRow?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NODEID],
    ]),
  );
}

function collectPublicationActiveGateHandoffReadinessNodeIds(readinessByNodeId) {
  if (!isPublicationActiveGateHandoffRecord(readinessByNodeId)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return normalizePublicationActiveGateHandoffNodeIdList(
    Object.keys(readinessByNodeId),
  );
}

function collectPublicationActiveGateHandoffPriorityRecoveryEvidenceRecords(
  publicationConvergence = null,
) {
  if (!isPublicationActiveGateHandoffRecord(publicationConvergence)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  const activeGate =
    publicationConvergence[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE];
  return Object.freeze([
    publicationConvergence,
    publicationConvergence[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PRIORITY_RECOVERY_OBSERVATION
    ],
    publicationConvergence[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PRIORITY_RECOVERY_CURRENT_SUMMARY
    ],
    publicationConvergence[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_PROGRESS
    ],
    publicationConvergence[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_BEST_PROGRESS
    ],
    activeGate,
    activeGate?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROGRESS],
  ].filter(isPublicationActiveGateHandoffRecord));
}

function collectPublicationActiveGateHandoffPublicationEvidenceRecords(
  publicationConvergence = null,
) {
  if (!isPublicationActiveGateHandoffRecord(publicationConvergence)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  const activeGate =
    publicationConvergence[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE];
  return Object.freeze([
    publicationConvergence,
    publicationConvergence[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_PROGRESS
    ],
    publicationConvergence[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_BEST_PROGRESS
    ],
    activeGate,
    activeGate?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROGRESS],
  ].filter(isPublicationActiveGateHandoffRecord));
}

function collectPublicationActiveGateHandoffPublicationNodeIds(
  publicationConvergence,
) {
  if (!isPublicationActiveGateHandoffRecord(publicationConvergence)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return collectPublicationActiveGateHandoffPublicationEvidenceRecords(
    publicationConvergence,
  ).flatMap((evidenceRecord) => {
    const lifecycleSummary =
      isPublicationActiveGateHandoffRecord(
        evidenceRecord[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MEMBERSHIP_LIFECYCLE_SUMMARY
        ],
      ) ?
        evidenceRecord[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MEMBERSHIP_LIFECYCLE_SUMMARY
        ] :
        {};
    return [
      ...collectPublicationActiveGateHandoffRecordNodeIds(
        evidenceRecord,
        PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_NODE_FIELDS,
      ),
      ...collectPublicationActiveGateHandoffRecordNodeIds(
        lifecycleSummary,
        PUBLICATION_ACTIVE_GATE_HANDOFF_LIFECYCLE_NODE_FIELDS,
      ),
    ];
  });
}

function collectPublicationActiveGateHandoffContextNodeIds(targetEvidence) {
  return PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_CONTEXT_FIELDS.flatMap(
    (fieldName) => {
      const context = targetEvidence[fieldName];
      if (!isPublicationActiveGateHandoffRecord(context)) {
        return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
      }
      return [
        ...collectPublicationActiveGateHandoffRecordNodeIds(
          context,
          PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_NODE_FIELDS,
        ),
        ...collectPublicationActiveGateHandoffPublicationNodeIds(context),
      ];
    },
  );
}

function collectPublicationActiveGateHandoffTargetEvidenceNodeIds(
  targetEvidence,
) {
  if (!isPublicationActiveGateHandoffRecord(targetEvidence)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...collectPublicationActiveGateHandoffRecordNodeIds(
      targetEvidence,
      PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_NODE_FIELDS,
    ),
    ...collectPublicationActiveGateHandoffPublicationNodeIds(targetEvidence),
    ...collectPublicationActiveGateHandoffContextNodeIds(targetEvidence),
  ]);
}

function resolvePublicationActiveGateHandoffExpectedNodeIds(options = {}) {
  const explicitExpectedNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(options.expectedNodeIds);
  if (explicitExpectedNodeIds.length > 0) {
    return explicitExpectedNodeIds;
  }
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...collectPublicationActiveGateHandoffNodeRows(options.nodeRows),
    ...collectPublicationActiveGateHandoffReadinessNodeIds(
      options.readinessByNodeId,
    ),
    ...collectPublicationActiveGateHandoffRecordNodeIds(
      options.activeNodeViews,
      PUBLICATION_ACTIVE_GATE_HANDOFF_ACTIVE_NODE_VIEW_FIELDS,
    ),
    ...collectPublicationActiveGateHandoffPublicationNodeIds(
      options.publicationConvergence,
    ),
  ]);
}

function resolvePublicationActiveGateHandoffPublishedActiveNodeIds(
  options = {},
) {
  const explicitPublishedNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      options.publishedActiveNodeIds,
    );
  if (explicitPublishedNodeIds.length > 0) {
    return explicitPublishedNodeIds;
  }
  const activeNodeViewPublishedNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      options.activeNodeViews?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
      ],
    );
  if (activeNodeViewPublishedNodeIds.length > 0) {
    return activeNodeViewPublishedNodeIds;
  }
  return normalizePublicationActiveGateHandoffNodeIdList(
    options.publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
    ],
  );
}

function resolvePublicationActiveGateHandoffExplicitMissingNodeIds(
  publicationConvergence = null,
) {
  if (!isPublicationActiveGateHandoffRecord(publicationConvergence)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return normalizePublicationActiveGateHandoffNodeIdList(
    collectPublicationActiveGateHandoffPublicationEvidenceRecords(
      publicationConvergence,
    ).flatMap((evidenceRecord) => {
      const lifecycleSummary =
        isPublicationActiveGateHandoffRecord(
          evidenceRecord[
            PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MEMBERSHIP_LIFECYCLE_SUMMARY
          ],
        ) ?
          evidenceRecord[
            PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MEMBERSHIP_LIFECYCLE_SUMMARY
          ] :
          {};
      return [
        ...normalizePublicationActiveGateHandoffNodeIdList(
          evidenceRecord[
            PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS
          ],
        ),
        ...normalizePublicationActiveGateHandoffNodeIdList(
          evidenceRecord[
            PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
              .MISSING_PUBLISHED_RECOVERY_ACTIVE_NODE_IDS
          ],
        ),
        ...normalizePublicationActiveGateHandoffNodeIdList(
          evidenceRecord[
            PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
              .SELECTED_MISSING_PUBLISHED_NODE_IDS
          ],
        ),
        ...normalizePublicationActiveGateHandoffNodeIdList(
          lifecycleSummary[
            PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
              .MISSING_PUBLISHED_RECOVERY_ACTIVE_NODE_IDS
          ],
        ),
      ];
    }),
  );
}

function resolvePublicationActiveGateHandoffMissingPublishedNodeIds({
  expectedNodeIds,
  publishedActiveNodeIds,
  publicationConvergence,
}) {
  const publishedActiveNodeIdSet = new Set(publishedActiveNodeIds);
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...expectedNodeIds.filter(
      (nodeId) => !publishedActiveNodeIdSet.has(nodeId),
    ),
    ...resolvePublicationActiveGateHandoffExplicitMissingNodeIds(
      publicationConvergence,
    ),
  ]);
}

function normalizePublicationActiveGateHandoffReasonCodes(readinessEntry) {
  if (!isPublicationActiveGateHandoffRecord(readinessEntry)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...(Array.isArray(
      readinessEntry[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REASON_CODES
      ],
    ) ?
      readinessEntry[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REASON_CODES
      ] :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
    ...(Array.isArray(readinessEntry[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REASONS]) ?
      readinessEntry[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REASONS].map(
        (reason) =>
          reason?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CODE] ??
          reason?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REASON_CODE],
      ) :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
    readinessEntry[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CODE],
    readinessEntry[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REASON_CODE],
    readinessEntry[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REASON],
  ]);
}

function normalizePublicationActiveGateHandoffPriorityRecoveryEvidenceRecord(
  evidenceRecord,
) {
  const blockerCounts =
    [
      ...PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_BLOCKER_COUNT_FIELDS,
      ...PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_SUMMARY_BLOCKER_FIELDS,
    ]
      .map((fieldName) =>
        normalizePublicationActiveGateHandoffInteger(
          evidenceRecord?.[fieldName],
        ))
      .filter((value) => value !== null);
  const cleanCountGroups =
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_GROUPS.map(
      (fieldNames) =>
        fieldNames
          .map((fieldName) =>
            normalizePublicationActiveGateHandoffInteger(
              evidenceRecord?.[fieldName],
            ))
          .filter((value) => value !== null),
    );
  const blockerListLengths =
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_BLOCKER_LIST_FIELDS
      .map((fieldName) =>
        normalizePublicationActiveGateHandoffNodeIdList(
          evidenceRecord?.[fieldName],
        ).length);
  const hasUnresolvedEvidence = [
    ...blockerCounts,
    ...blockerListLengths,
  ].some((value) => value > 0);
  if (hasUnresolvedEvidence) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.UNRESOLVED;
  }
  const hasExplicitCleanEvidence =
    cleanCountGroups.some((cleanCounts, index) =>
      cleanCounts.length ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_GROUPS[
          index
        ].length &&
      cleanCounts.every((value) => value === 0),
    );
  return hasExplicitCleanEvidence ?
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.CLEAN :
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.UNKNOWN;
}

function resolvePublicationActiveGateHandoffPriorityRecoveryState(
  publicationConvergence = null,
) {
  const evidenceStates =
    collectPublicationActiveGateHandoffPriorityRecoveryEvidenceRecords(
      publicationConvergence,
    ).map((evidenceRecord) =>
      normalizePublicationActiveGateHandoffPriorityRecoveryEvidenceRecord(
        evidenceRecord,
      ));
  if (
    evidenceStates.includes(
      PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.UNRESOLVED,
    )
  ) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.UNRESOLVED;
  }
  return evidenceStates.includes(
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.CLEAN,
  ) ?
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.CLEAN :
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.UNKNOWN;
}

function hasPublicationActiveGateHandoffPendingOwnerReasonCode(
  reasonCode,
  priorityRecoveryState,
) {
  if (
    reasonCode ===
      CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING &&
    priorityRecoveryState ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.CLEAN
  ) {
    return false;
  }
  return PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_OWNER_REASON_CODES.includes(
    reasonCode,
  );
}

function resolvePublicationActiveGateHandoffPendingRecoveryNodeIds(
  expectedNodeIds,
  readinessByNodeId,
  publicationConvergence = null,
) {
  if (!isPublicationActiveGateHandoffRecord(readinessByNodeId)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  const priorityRecoveryState =
    resolvePublicationActiveGateHandoffPriorityRecoveryState(
      publicationConvergence,
    );
  return normalizePublicationActiveGateHandoffNodeIdList(
    expectedNodeIds.filter((nodeId) => {
      const reasonCodes = normalizePublicationActiveGateHandoffReasonCodes(
        readinessByNodeId[nodeId],
      );
      return reasonCodes.some((reasonCode) =>
        hasPublicationActiveGateHandoffPendingOwnerReasonCode(
          reasonCode,
          priorityRecoveryState,
        ),
      );
    }),
  );
}

function resolvePublicationActiveGateHandoffPendingReconcileNodeIds({
  missingPublishedNodeIds,
  pendingRecoveryNodeIds,
}) {
  const pendingRecoveryNodeIdSet = new Set(pendingRecoveryNodeIds);
  return normalizePublicationActiveGateHandoffNodeIdList(
    missingPublishedNodeIds.filter(
      (nodeId) => !pendingRecoveryNodeIdSet.has(nodeId),
    ),
  );
}

export {
  normalizePublicationActiveGateHandoffPublicationSnapshot,
  resolvePublicationActiveGateHandoffReconcileRequirement,
  collectPublicationActiveGateHandoffRecordNodeIds,
  collectPublicationActiveGateHandoffNodeRows,
  collectPublicationActiveGateHandoffReadinessNodeIds,
  collectPublicationActiveGateHandoffPriorityRecoveryEvidenceRecords,
  collectPublicationActiveGateHandoffPublicationEvidenceRecords,
  collectPublicationActiveGateHandoffPublicationNodeIds,
  collectPublicationActiveGateHandoffContextNodeIds,
  collectPublicationActiveGateHandoffTargetEvidenceNodeIds,
  resolvePublicationActiveGateHandoffExpectedNodeIds,
  resolvePublicationActiveGateHandoffPublishedActiveNodeIds,
  resolvePublicationActiveGateHandoffExplicitMissingNodeIds,
  resolvePublicationActiveGateHandoffMissingPublishedNodeIds,
  normalizePublicationActiveGateHandoffReasonCodes,
  normalizePublicationActiveGateHandoffPriorityRecoveryEvidenceRecord,
  resolvePublicationActiveGateHandoffPriorityRecoveryState,
  hasPublicationActiveGateHandoffPendingOwnerReasonCode,
  resolvePublicationActiveGateHandoffPendingRecoveryNodeIds,
  resolvePublicationActiveGateHandoffPendingReconcileNodeIds,
};
