import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_READINESS_REASON,
} from './control-plane-readiness-constants.js';

const PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST = Object.freeze([]);
const PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_TEXT = '';
const PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION = 1;
const PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH = 0;

const PUBLICATION_ACTIVE_GATE_HANDOFF_STATE = Object.freeze({
  COMPLETE: 'complete',
  DEGRADED: 'degraded',
  PENDING: 'pending',
  UNAVAILABLE: 'unavailable',
});

const PUBLICATION_ACTIVE_GATE_HANDOFF_REASON = Object.freeze({
  COMPLETE: 'owner_cohort_complete',
  EXPECTED_COHORT_UNAVAILABLE: 'expected_cohort_unavailable',
  OWNER_RECONCILE_PENDING: 'owner_reconcile_pending',
  PUBLISHED_ACTIVE_COVERAGE_INCOMPLETE:
    'published_active_coverage_incomplete',
});

const PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION = Object.freeze({
  ADMIT_ACTIVE_GATE: 'admit_active_gate',
  OBSERVE_OWNER_HANDOFF: 'observe_owner_handoff',
  RECONCILE_OWNER_MEMBERSHIP_PUBLICATION:
    'reconcile_owner_membership_publication',
  WAIT_OWNER_RECOVERY: 'wait_owner_recovery',
});

const PUBLICATION_ACTIVE_GATE_HANDOFF_BUDGET_STATE = Object.freeze({
  UNAVAILABLE: 'unavailable',
});

const PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_STATE = Object.freeze({
  ABSENT: 'absent',
  SELECTED: 'selected',
});

const PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
  ACTIVE_GATE_OWNER_COHORT: 'activeGateOwnerCohort',
  EFFECTIVE_ACTIVE_NODE_IDS: 'effectiveActiveNodeIds',
  EXPECTED_NODE_IDS: 'expectedNodeIds',
  ID: 'id',
  LOCALLY_ELIGIBLE_NODE_IDS: 'locallyEligibleNodeIds',
  MEMBERSHIP_LIFECYCLE_SUMMARY: 'membershipLifecycleSummary',
  MISSING_PUBLISHED_NODE_IDS: 'missingPublishedNodeIds',
  MISSING_PUBLISHED_RECOVERY_ACTIVE_NODE_IDS:
    'missingPublishedRecoveryActiveNodeIds',
  NODE_ID: 'node_id',
  NODEID: 'nodeId',
  PENDING_ACK_NODE_IDS: 'pendingAckNodeIds',
  PENDING_RECONCILE_COUNT: 'pendingReconcileCount',
  PENDING_RECONCILE_NODE_IDS: 'pendingReconcileNodeIds',
  PROJECTED_ACTIVE_NODE_IDS: 'projectedActiveNodeIds',
  PROJECTED_SERVING_NODE_IDS: 'projectedServingNodeIds',
  PUBLICATION_ACTIVE_GATE_HANDOFF: 'publicationActiveGateHandoff',
  PUBLICATION_CONVERGENCE: 'publicationConvergence',
  PUBLICATION_EPOCH: 'publicationEpoch',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  REASON_CODE: 'reasonCode',
  REASON_CODES: 'reasonCodes',
  REASONS: 'reasons',
  RECOVERY_ACTIVE_NODE_IDS: 'recoveryActiveNodeIds',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
  STATE: 'state',
  SUSPECTED_OR_TRANSITIONING_NODE_IDS: 'suspectedOrTransitioningNodeIds',
});

const PUBLICATION_ACTIVE_GATE_HANDOFF_READINESS_REASON_FIELD =
  Object.freeze({
    CODE: 'code',
    REASON_CODE: 'reasonCode',
  });

const PUBLICATION_ACTIVE_GATE_HANDOFF_ACTIVE_NODE_VIEW_FIELDS =
  Object.freeze([
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EFFECTIVE_ACTIVE_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROJECTED_ACTIVE_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROJECTED_SERVING_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.LOCALLY_ELIGIBLE_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SUSPECTED_OR_TRANSITIONING_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
  ]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_NODE_FIELDS =
  Object.freeze([
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
      .MISSING_PUBLISHED_RECOVERY_ACTIVE_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.RECOVERY_ACTIVE_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REQUIRED_ACK_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACKNOWLEDGED_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_ACK_NODE_IDS,
  ]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_LIFECYCLE_NODE_FIELDS =
  Object.freeze([
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROJECTED_SERVING_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.LOCALLY_ELIGIBLE_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SUSPECTED_OR_TRANSITIONING_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.RECOVERY_ACTIVE_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
      .MISSING_PUBLISHED_RECOVERY_ACTIVE_NODE_IDS,
  ]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_NODE_FIELDS = Object.freeze([
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EXPECTED_NODE_IDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EFFECTIVE_ACTIVE_NODE_IDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROJECTED_ACTIVE_NODE_IDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROJECTED_SERVING_NODE_IDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.LOCALLY_ELIGIBLE_NODE_IDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
    .MISSING_PUBLISHED_RECOVERY_ACTIVE_NODE_IDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_NODE_IDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.RECOVERY_ACTIVE_NODE_IDS,
]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_CONTEXT_FIELDS = Object.freeze([
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_OWNER_COHORT,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE,
]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_OWNER_REASON_CODES =
  Object.freeze([
    CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  ]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_RULES = Object.freeze([
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.UNAVAILABLE,
    reasonCode:
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.EXPECTED_COHORT_UNAVAILABLE,
    nextAction:
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF,
    runtimePromotionAllowed: false,
    matches: (evidence) =>
      evidence.expectedNodeIds.length === NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
    reasonCode:
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
    nextAction:
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
    runtimePromotionAllowed: false,
    matches: (evidence) =>
      evidence.pendingReconcileNodeIds.length > NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
    reasonCode:
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
    nextAction:
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
    runtimePromotionAllowed: false,
    matches: (evidence) =>
      evidence.pendingRecoveryNodeIds.length > NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.DEGRADED,
    reasonCode:
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
        .PUBLISHED_ACTIVE_COVERAGE_INCOMPLETE,
    nextAction:
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF,
    runtimePromotionAllowed: false,
    matches: (evidence) =>
      evidence.missingPublishedNodeIds.length > NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.COMPLETE,
    reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.COMPLETE,
    nextAction:
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.ADMIT_ACTIVE_GATE,
    runtimePromotionAllowed: true,
    matches: () => true,
  }),
]);

function isPublicationActiveGateHandoffRecord(value) {
  return Boolean(value) &&
    typeof value === TYPEOF.OBJECT &&
    !Array.isArray(value);
}

function normalizePublicationActiveGateHandoffNodeId(value) {
  const normalizedValue = String(
    value || PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_TEXT,
  ).trim();
  return normalizedValue.length > NUM.ZERO ? normalizedValue : null;
}

function normalizePublicationActiveGateHandoffNodeIdList(
  values = PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
) {
  return Object.freeze(
    [
      ...new Set(
        (Array.isArray(values) ?
          values :
          PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST)
          .map((value) =>
            normalizePublicationActiveGateHandoffNodeId(value),
          )
          .filter((value) => value !== null),
      ),
    ].sort((left, right) => left.localeCompare(right)),
  );
}

function collectPublicationActiveGateHandoffRecordNodeIds(record, fields) {
  if (!isPublicationActiveGateHandoffRecord(record)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return fields.flatMap((fieldName) =>
    normalizePublicationActiveGateHandoffNodeIdList(record[fieldName]),
  );
}

function collectPublicationActiveGateHandoffNodeRows(nodeRows) {
  if (!Array.isArray(nodeRows)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return nodeRows
    .map((row) => {
      if (!isPublicationActiveGateHandoffRecord(row)) {
        return null;
      }
      return normalizePublicationActiveGateHandoffNodeId(
        row[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NODE_ID] ??
          row[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NODEID] ??
          row[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ID],
      );
    })
    .filter((nodeId) => nodeId !== null);
}

function collectPublicationActiveGateHandoffReadinessNodeIds(readinessByNodeId) {
  if (!isPublicationActiveGateHandoffRecord(readinessByNodeId)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return Object.keys(readinessByNodeId);
}

function collectPublicationActiveGateHandoffPublicationNodeIds(
  publicationConvergence,
) {
  if (!isPublicationActiveGateHandoffRecord(publicationConvergence)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  const lifecycleSummary =
    isPublicationActiveGateHandoffRecord(
      publicationConvergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MEMBERSHIP_LIFECYCLE_SUMMARY
      ],
    ) ?
      publicationConvergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MEMBERSHIP_LIFECYCLE_SUMMARY
      ] :
      {};
  return [
    ...collectPublicationActiveGateHandoffRecordNodeIds(
      publicationConvergence,
      PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_NODE_FIELDS,
    ),
    ...collectPublicationActiveGateHandoffRecordNodeIds(
      lifecycleSummary,
      PUBLICATION_ACTIVE_GATE_HANDOFF_LIFECYCLE_NODE_FIELDS,
    ),
  ];
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
  if (explicitExpectedNodeIds.length > NUM.ZERO) {
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
  if (explicitPublishedNodeIds.length > NUM.ZERO) {
    return explicitPublishedNodeIds;
  }
  const activeNodeViewPublishedNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      options.activeNodeViews?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
      ],
    );
  if (activeNodeViewPublishedNodeIds.length > NUM.ZERO) {
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
  const lifecycleSummary =
    isPublicationActiveGateHandoffRecord(
      publicationConvergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MEMBERSHIP_LIFECYCLE_SUMMARY
      ],
    ) ?
      publicationConvergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MEMBERSHIP_LIFECYCLE_SUMMARY
      ] :
      {};
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...normalizePublicationActiveGateHandoffNodeIdList(
      publicationConvergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS
      ],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      publicationConvergence[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .MISSING_PUBLISHED_RECOVERY_ACTIVE_NODE_IDS
      ],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      lifecycleSummary[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .MISSING_PUBLISHED_RECOVERY_ACTIVE_NODE_IDS
      ],
    ),
  ]);
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
        (reason) => {
          if (isPublicationActiveGateHandoffRecord(reason)) {
            return reason[
              PUBLICATION_ACTIVE_GATE_HANDOFF_READINESS_REASON_FIELD.CODE
            ] ??
              reason[
                PUBLICATION_ACTIVE_GATE_HANDOFF_READINESS_REASON_FIELD
                  .REASON_CODE
              ];
          }
          return reason;
        },
      ) :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
  ]);
}

function resolvePublicationActiveGateHandoffPendingRecoveryNodeIds(
  expectedNodeIds,
  readinessByNodeId,
) {
  if (!isPublicationActiveGateHandoffRecord(readinessByNodeId)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return normalizePublicationActiveGateHandoffNodeIdList(
    expectedNodeIds.filter((nodeId) => {
      const reasonCodes = normalizePublicationActiveGateHandoffReasonCodes(
        readinessByNodeId[nodeId],
      );
      return reasonCodes.some((reasonCode) =>
        PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_OWNER_REASON_CODES.includes(
          reasonCode,
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

function resolvePublicationActiveGateHandoffPublicationEpoch(
  publicationConvergence = null,
) {
  const publicationEpoch = Number(
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH
    ],
  );
  return Number.isFinite(publicationEpoch) ?
    Math.floor(publicationEpoch) :
    PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH;
}

function decidePublicationActiveGateHandoff(evidence) {
  return PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_RULES.find((rule) =>
    rule.matches(evidence),
  );
}

function buildPublicationActiveGateHandoffContract(options = {}) {
  const expectedNodeIds =
    resolvePublicationActiveGateHandoffExpectedNodeIds(options);
  const publishedActiveNodeIds =
    resolvePublicationActiveGateHandoffPublishedActiveNodeIds(options);
  const missingPublishedNodeIds =
    resolvePublicationActiveGateHandoffMissingPublishedNodeIds({
      expectedNodeIds,
      publishedActiveNodeIds,
      publicationConvergence: options.publicationConvergence,
    });
  const pendingRecoveryNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      options.pendingRecoveryNodeIds,
    ).length > NUM.ZERO ?
      normalizePublicationActiveGateHandoffNodeIdList(
        options.pendingRecoveryNodeIds,
      ) :
      resolvePublicationActiveGateHandoffPendingRecoveryNodeIds(
        expectedNodeIds,
        options.readinessByNodeId,
      );
  const pendingReconcileNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      options.pendingReconcileNodeIds,
    ).length > NUM.ZERO ?
      normalizePublicationActiveGateHandoffNodeIdList(
        options.pendingReconcileNodeIds,
      ) :
      resolvePublicationActiveGateHandoffPendingReconcileNodeIds({
        missingPublishedNodeIds,
        pendingRecoveryNodeIds,
      });
  const evidence = Object.freeze({
    expectedNodeIds,
    publishedActiveNodeIds,
    missingPublishedNodeIds,
    pendingRecoveryNodeIds,
    pendingReconcileNodeIds,
  });
  const decision = decidePublicationActiveGateHandoff(evidence);
  return Object.freeze({
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    publicationEpoch: resolvePublicationActiveGateHandoffPublicationEpoch(
      options.publicationConvergence,
    ),
    expectedNodeIds,
    expectedNodeCount: expectedNodeIds.length,
    publishedActiveNodeIds,
    publishedActiveNodeCount: publishedActiveNodeIds.length,
    missingPublishedNodeIds,
    missingPublishedCount: missingPublishedNodeIds.length,
    pendingRecoveryNodeIds,
    pendingRecoveryCount: pendingRecoveryNodeIds.length,
    pendingReconcileNodeIds,
    pendingReconcileCount: pendingReconcileNodeIds.length,
    runtimePromotionAllowed: decision.runtimePromotionAllowed,
    state: decision.state,
    reasonCode: decision.reasonCode,
    nextAction: decision.nextAction,
  });
}

function normalizePublicationActiveGateHandoffContract(value) {
  if (!isPublicationActiveGateHandoffRecord(value)) {
    return null;
  }
  return buildPublicationActiveGateHandoffContract({
    publicationConvergence: {
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH]:
        value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH],
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS]:
        value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS],
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS]:
        value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS],
    },
    expectedNodeIds: value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EXPECTED_NODE_IDS],
    pendingRecoveryNodeIds: value.pendingRecoveryNodeIds,
    pendingReconcileNodeIds: value.pendingReconcileNodeIds,
  });
}

function projectPublicationActiveGateHandoffToOwnerCohort(
  handoffContract,
  options = {},
) {
  const contract = normalizePublicationActiveGateHandoffContract(
    handoffContract,
  );
  const activeGateBudget =
    isPublicationActiveGateHandoffRecord(options.activeGateBudget) ?
      options.activeGateBudget :
      Object.freeze({
        state: PUBLICATION_ACTIVE_GATE_HANDOFF_BUDGET_STATE.UNAVAILABLE,
      });
  return Object.freeze({
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    state: contract.state,
    reasonCode: contract.reasonCode,
    topologyEpoch: contract.publicationEpoch,
    expectedNodeIds: contract.expectedNodeIds,
    expectedNodeCount: contract.expectedNodeCount,
    readyLeaseNodeIds: normalizePublicationActiveGateHandoffNodeIdList(
      options.readyLeaseNodeIds,
    ),
    readyLeaseNodeCount:
      normalizePublicationActiveGateHandoffNodeIdList(
        options.readyLeaseNodeIds,
      ).length,
    publishedActiveNodeIds: contract.publishedActiveNodeIds,
    publishedActiveNodeCount: contract.publishedActiveNodeCount,
    missingPublishedNodeIds: contract.missingPublishedNodeIds,
    missingPublishedCount: contract.missingPublishedCount,
    pendingRecoveryNodeIds: contract.pendingRecoveryNodeIds,
    pendingRecoveryCount: contract.pendingRecoveryCount,
    pendingReconcileNodeIds: contract.pendingReconcileNodeIds,
    pendingReconcileCount: contract.pendingReconcileCount,
    runtimePromotionAllowed: contract.runtimePromotionAllowed,
    nextAction: contract.nextAction,
    activeGateBudget,
  });
}

function selectPublicationActiveGateHandoffContract(value = null) {
  if (!isPublicationActiveGateHandoffRecord(value)) {
    return null;
  }
  if (
    isPublicationActiveGateHandoffRecord(
      value[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF
      ],
    )
  ) {
    return value[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF
    ];
  }
  if (
    isPublicationActiveGateHandoffRecord(
      value[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE
      ]?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF
      ],
    )
  ) {
    return value[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE
    ][PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF];
  }
  if (
    isPublicationActiveGateHandoffRecord(
      value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_OWNER_COHORT],
    )
  ) {
    const activeGateOwnerCohort =
      value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_OWNER_COHORT];
    const publicationConvergence =
      isPublicationActiveGateHandoffRecord(
        value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE],
      ) ?
        value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE] :
        {};
    return Object.freeze({
      ...publicationConvergence,
      ...activeGateOwnerCohort,
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH]:
        activeGateOwnerCohort[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH
        ] ??
        publicationConvergence[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH
        ],
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS]:
        activeGateOwnerCohort[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
        ] ??
        publicationConvergence[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
        ],
    });
  }
  return value;
}

function buildPublicationActiveGateHandoffEmptyReconcileTarget(
  handoffContract = null,
) {
  return Object.freeze({
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_TARGET_STATE.ABSENT,
    reconcileRequired: false,
    handoffContract,
    publishedActiveNodeIds: PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
    requiredAckNodeIds: PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
    acknowledgedNodeIds: PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
    pendingReconcileNodeIds: PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
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
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...handoffContract.publishedActiveNodeIds,
    ...handoffContract.pendingReconcileNodeIds,
    ...expectedTargetNodeIds.filter(
      (nodeId) => !pendingRecoveryNodeIdSet.has(nodeId),
    ),
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
  });
}

function resolvePublicationActiveGateMembershipPublicationTarget(value = null) {
  const selectedHandoffContract = selectPublicationActiveGateHandoffContract(
    value,
  );
  const handoffContract = normalizePublicationActiveGateHandoffContract(
    selectedHandoffContract,
  );
  if (
    !handoffContract ||
    handoffContract.nextAction !==
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION
  ) {
    return buildPublicationActiveGateHandoffEmptyReconcileTarget(
      handoffContract,
    );
  }
  return buildPublicationActiveGateHandoffReconcileTarget(
    handoffContract,
    value,
  );
}

function hasPublicationActiveGateOwnerReconcileSignal(value = null) {
  const selectedHandoffContract = selectPublicationActiveGateHandoffContract(
    value,
  );
  if (
    isPublicationActiveGateHandoffRecord(selectedHandoffContract) &&
    (
      selectedHandoffContract.nextAction ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
      Number(
        selectedHandoffContract[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_COUNT
        ],
      ) > NUM.ZERO ||
      normalizePublicationActiveGateHandoffNodeIdList(
        selectedHandoffContract[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_NODE_IDS
        ],
      ).length > NUM.ZERO
    )
  ) {
    return true;
  }
  const handoffContract = normalizePublicationActiveGateHandoffContract(
    selectedHandoffContract,
  );
  if (!handoffContract) {
    return false;
  }
  return handoffContract.nextAction ===
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
      .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
    handoffContract.pendingReconcileCount > NUM.ZERO ||
    handoffContract.pendingReconcileNodeIds.length > NUM.ZERO;
}

export {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
  buildPublicationActiveGateHandoffContract,
  hasPublicationActiveGateOwnerReconcileSignal,
  normalizePublicationActiveGateHandoffContract,
  projectPublicationActiveGateHandoffToOwnerCohort,
  resolvePublicationActiveGateMembershipPublicationTarget,
  selectPublicationActiveGateHandoffContract,
};
