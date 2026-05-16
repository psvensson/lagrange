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

const PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE = Object.freeze({
  CATCHUP_BLOCKED: 'catchup_blocked',
  CATCHUP_PENDING: 'catchup_pending',
  CATCHUP_READY: 'catchup_ready',
  PROMOTION_ALLOWED: 'promotion_allowed',
  PROMOTION_DENIED: 'promotion_denied',
});

const PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON = Object.freeze({
  DURABLE_PUBLICATION_INCOMPLETE: 'durable_publication_incomplete',
  DURABLE_PUBLICATION_STALE: 'durable_publication_stale',
  DURABLE_PUBLICATION_UNAVAILABLE: 'durable_publication_unavailable',
  SNAPSHOT_COVERAGE_INCOMPLETE: 'snapshot_coverage_incomplete',
  SNAPSHOT_COVERAGE_STALE: 'snapshot_coverage_stale',
  SNAPSHOT_COVERAGE_UNAVAILABLE: 'snapshot_coverage_unavailable',
  TARGET_PRESENCE_INCOMPLETE: 'target_presence_incomplete',
  TARGETS_UNAVAILABLE: 'targets_unavailable',
});

const PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION = Object.freeze({
  DENY_PROMOTION: 'deny_active_gate_promotion',
  OBSERVE_ACTIVE_GATE_TARGETS: 'observe_active_gate_targets',
  OBSERVE_OWNER_HANDOFF: 'observe_owner_handoff',
  OBSERVE_SNAPSHOT_COVERAGE: 'observe_snapshot_coverage',
  PROMOTE_ACTIVE_GATE: 'promote_active_gate',
  RECONCILE_OWNER_MEMBERSHIP_PUBLICATION:
    'reconcile_owner_membership_publication',
  REFRESH_SNAPSHOT_COVERAGE: 'refresh_snapshot_coverage',
});

const PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE = Object.freeze({
  AVAILABLE: 'available',
  INCOMPLETE: 'incomplete',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
});

const PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_STATUS = Object.freeze({
  PUBLISHED: 'PUBLISHED',
});

const PUBLICATION_ACTIVE_GATE_HANDOFF_STALE_MARKER = Object.freeze({
  BEHIND: 'behind',
  STALE: 'stale',
  STALE_USABLE: 'stale_usable',
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
  ACTIVE_GATE: 'activeGate',
  ACTIVE_GATE_BEST_PROGRESS: 'activeGateBestProgress',
  ACTIVE_GATE_PROGRESS: 'activeGateProgress',
  ACTIVE_GATE_CATCHUP_FENCE: 'activeGateCatchupFence',
  ACTIVE_GATE_OWNER_COHORT: 'activeGateOwnerCohort',
  BLOCKED_PARTITION_COUNT: 'blockedPartitionCount',
  BLOCKED_PARTITION_IDS: 'blockedPartitionIds',
  COVERED_NODE_IDS: 'coveredNodeIds',
  EFFECTIVE_ACTIVE_NODE_IDS: 'effectiveActiveNodeIds',
  EXPECTED_NODE_IDS: 'expectedNodeIds',
  FRESH: 'fresh',
  ID: 'id',
  LOCALLY_ELIGIBLE_NODE_IDS: 'locallyEligibleNodeIds',
  MEMBERSHIP_LIFECYCLE_SUMMARY: 'membershipLifecycleSummary',
  MISSING_PUBLISHED_NODE_IDS: 'missingPublishedNodeIds',
  MISSING_PUBLISHED_RECOVERY_ACTIVE_NODE_IDS:
    'missingPublishedRecoveryActiveNodeIds',
  NODE_ID: 'node_id',
  NODE_IDS: 'nodeIds',
  NODEID: 'nodeId',
  PENDING_ACK_NODE_IDS: 'pendingAckNodeIds',
  PENDING_RECONCILE_COUNT: 'pendingReconcileCount',
  PENDING_RECONCILE_NODE_IDS: 'pendingReconcileNodeIds',
  PARTITION_WITNESSES: 'partitionWitnesses',
  PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT:
    'priorityRecoveryBlockedPartitionCount',
  PRIORITY_RECOVERY_CURRENT_SUMMARY: 'priorityRecoveryCurrentSummary',
  PRIORITY_RECOVERY_INVARIANT_FAILURES: 'priorityRecoveryInvariantFailures',
  PRIORITY_RECOVERY_OBSERVATION: 'priorityRecoveryObservation',
  PRIORITY_RECOVERY_PARTITION_WITNESSES:
    'priorityRecoveryPartitionWitnesses',
  PRIORITY_RECOVERY_UNRESOLVED_CLASS_COUNT:
    'priorityRecoveryUnresolvedClassCount',
  PRIORITY_RECOVERY_UNRESOLVED_PARTITION_COUNT:
    'priorityRecoveryUnresolvedPartitionCount',
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_COUNT:
    'priorityRecoveryUnresolvedSemanticStateCount',
  PROGRESS: 'progress',
  PROJECTED_ACTIVE_NODE_IDS: 'projectedActiveNodeIds',
  PROJECTED_SERVING_NODE_IDS: 'projectedServingNodeIds',
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE: 'activeGateCatchupFence',
  PUBLICATION_ACTIVE_GATE_HANDOFF: 'publicationActiveGateHandoff',
  PUBLICATION_CONVERGENCE: 'publicationConvergence',
  PUBLICATION_EPOCH: 'publicationEpoch',
  PUBLICATION_OBSERVATION: 'publicationObservation',
  PUBLICATION_REVISION: 'publicationRevision',
  PUBLICATION_STATUS: 'publicationStatus',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  REASON_CODE: 'reasonCode',
  REASON_CODES: 'reasonCodes',
  REASONS: 'reasons',
  RECOVERY_ACTIVE_NODE_IDS: 'recoveryActiveNodeIds',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
  REVISION: 'revision',
  REVISION_STATE: 'revisionState',
  SNAPSHOT_COVERAGE: 'snapshotCoverage',
  SNAPSHOT_COVERAGE_NODE_IDS: 'snapshotCoverageNodeIds',
  SNAPSHOT_COVERAGE_REVISION: 'snapshotCoverageRevision',
  SNAPSHOT_OBSERVATION: 'snapshotObservation',
  SNAPSHOT_REVISION: 'snapshotRevision',
  SNAPSHOT_REVISION_STATE: 'snapshotRevisionState',
  SOURCE_SNAPSHOT_VERSION: 'sourceSnapshotVersion',
  SOURCE_SNAPSHOT_VERSION_SNAKE: 'source_snapshot_version',
  STATE: 'state',
  STATUS: 'status',
  SUSPECTED_OR_TRANSITIONING_NODE_IDS: 'suspectedOrTransitioningNodeIds',
  UNRESOLVED_CLASS_COUNT: 'unresolvedClassCount',
  UNRESOLVED_CLASS_IDS: 'unresolvedClassIds',
  UNRESOLVED_SEMANTIC_STATE_COUNT: 'unresolvedSemanticStateCount',
  UNRESOLVED_SEMANTIC_STATE_IDS: 'unresolvedSemanticStateIds',
  UPDATED_AT: 'updated_at',
  UPDATEDAT: 'updatedAt',
  WITNESS_PARTITION_COUNT: 'witnessPartitionCount',
  WITNESS_PARTITION_IDS: 'witnessPartitionIds',
});

const PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE = Object.freeze({
  CLEAN: 'clean',
  UNKNOWN: 'unknown',
  UNRESOLVED: 'unresolved',
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

const PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_FIELDS =
  Object.freeze([
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
      .PRIORITY_RECOVERY_UNRESOLVED_CLASS_COUNT,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
      .PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_COUNT,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
      .PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT,
  ]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_SUMMARY_CLEAN_FIELDS =
  Object.freeze([
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.UNRESOLVED_CLASS_COUNT,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.UNRESOLVED_SEMANTIC_STATE_COUNT,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.BLOCKED_PARTITION_COUNT,
  ]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_GROUPS =
  Object.freeze([
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_FIELDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_SUMMARY_CLEAN_FIELDS,
  ]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_BLOCKER_COUNT_FIELDS =
  Object.freeze([
    ...PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_FIELDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
      .PRIORITY_RECOVERY_UNRESOLVED_PARTITION_COUNT,
  ]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_SUMMARY_BLOCKER_FIELDS =
  Object.freeze([
    ...PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_SUMMARY_CLEAN_FIELDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.WITNESS_PARTITION_COUNT,
  ]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_BLOCKER_LIST_FIELDS =
  Object.freeze([
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
      .PRIORITY_RECOVERY_PARTITION_WITNESSES,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
      .PRIORITY_RECOVERY_INVARIANT_FAILURES,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.UNRESOLVED_CLASS_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.UNRESOLVED_SEMANTIC_STATE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.BLOCKED_PARTITION_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.WITNESS_PARTITION_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PARTITION_WITNESSES,
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

const PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_DECISION_RULES = Object.freeze([
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_BLOCKED,
    nextLegalAction:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
        .OBSERVE_ACTIVE_GATE_TARGETS,
    matches: (evidence) =>
      evidence.targetNodeIds.length === NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_BLOCKED,
    nextLegalAction:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
        .REFRESH_SNAPSHOT_COVERAGE,
    matches: (evidence) =>
      evidence.durablePublication.stale === true ||
      evidence.snapshotCoverage.stale === true,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_PENDING,
    nextLegalAction:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
    matches: (evidence) =>
      evidence.durablePublication.covered !== true,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_DENIED,
    nextLegalAction:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
        .OBSERVE_SNAPSHOT_COVERAGE,
    matches: (evidence) =>
      evidence.snapshotCoverage.covered !== true ||
      evidence.presence.complete !== true,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED,
    nextLegalAction:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION.PROMOTE_ACTIVE_GATE,
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
          evidenceRecord[fieldName],
        ))
      .filter((value) => value !== null);
  const cleanCountGroups =
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_GROUPS.map(
      (fieldNames) =>
        fieldNames
          .map((fieldName) =>
            normalizePublicationActiveGateHandoffInteger(
              evidenceRecord[fieldName],
            ))
          .filter((value) => value !== null),
    );
  const blockerListLengths =
    PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_BLOCKER_LIST_FIELDS
      .map((fieldName) =>
        normalizePublicationActiveGateHandoffNodeIdList(
          evidenceRecord[fieldName],
        ).length);
  const hasUnresolvedEvidence = [
    ...blockerCounts,
    ...blockerListLengths,
  ].some((value) => value > NUM.ZERO);
  if (hasUnresolvedEvidence) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_STATE.UNRESOLVED;
  }
  const hasExplicitCleanEvidence =
    cleanCountGroups.some((cleanCounts, index) =>
      cleanCounts.length ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_PRIORITY_RECOVERY_CLEAN_COUNT_GROUPS[
          index
        ].length &&
      cleanCounts.every((value) => value === NUM.ZERO),
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

function normalizePublicationActiveGateHandoffInteger(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.floor(parsedValue) : null;
}

function resolvePublicationActiveGateHandoffFirstInteger(...values) {
  for (const value of values) {
    const normalizedValue =
      normalizePublicationActiveGateHandoffInteger(value);
    if (normalizedValue !== null) {
      return normalizedValue;
    }
  }
  return null;
}

function resolvePublicationActiveGateHandoffPublicationRevision(
  publicationConvergence = null,
) {
  return resolvePublicationActiveGateHandoffFirstInteger(
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_REVISION
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SOURCE_SNAPSHOT_VERSION
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SOURCE_SNAPSHOT_VERSION_SNAKE
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.UPDATEDAT
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.UPDATED_AT
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH
    ],
  );
}

function normalizePublicationActiveGateHandoffStateMarker(value) {
  return String(
    value || PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_TEXT,
  ).trim().toLowerCase();
}

function hasPublicationActiveGateHandoffStaleMarker(...values) {
  return values
    .map((value) => normalizePublicationActiveGateHandoffStateMarker(value))
    .some((value) =>
      value === PUBLICATION_ACTIVE_GATE_HANDOFF_STALE_MARKER.STALE ||
      value === PUBLICATION_ACTIVE_GATE_HANDOFF_STALE_MARKER.STALE_USABLE ||
      value === PUBLICATION_ACTIVE_GATE_HANDOFF_STALE_MARKER.BEHIND,
    );
}

function resolvePublicationActiveGateHandoffPublicationStatus(
  publicationConvergence = null,
) {
  return String(
    publicationConvergence?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATUS] ||
      publicationConvergence?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_STATUS
      ] ||
      publicationConvergence?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_OBSERVATION
      ]?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATUS] ||
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_TEXT,
  ).toUpperCase();
}

function resolvePublicationActiveGateHandoffDurablePublishedNodeIds(
  options = {},
) {
  const explicitPublishedNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      options.publishedActiveNodeIds,
    );
  if (explicitPublishedNodeIds.length > NUM.ZERO) {
    return explicitPublishedNodeIds;
  }
  return normalizePublicationActiveGateHandoffNodeIdList(
    options.publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
    ],
  );
}

function buildPublicationActiveGateHandoffDurablePublicationEvidence({
  targetNodeIds,
  options,
}) {
  const publicationConvergence = options.publicationConvergence;
  const nodeIds = resolvePublicationActiveGateHandoffDurablePublishedNodeIds(
    options,
  );
  const missingNodeIds = normalizePublicationActiveGateHandoffNodeIdList(
    targetNodeIds.filter((nodeId) => !nodeIds.includes(nodeId)),
  );
  const publicationEpoch =
    resolvePublicationActiveGateHandoffPublicationEpoch(publicationConvergence);
  const publicationRevision =
    resolvePublicationActiveGateHandoffPublicationRevision(
      publicationConvergence,
    );
  const publicationStatus =
    resolvePublicationActiveGateHandoffPublicationStatus(
      publicationConvergence,
    );
  const available =
    nodeIds.length > NUM.ZERO ||
    publicationEpoch !== PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH ||
    publicationStatus ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_STATUS.PUBLISHED;
  const stale = hasPublicationActiveGateHandoffStaleMarker(
    publicationConvergence?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REVISION_STATE
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_OBSERVATION
    ]?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE],
  );
  const covered =
    available === true &&
    stale !== true &&
    targetNodeIds.length > NUM.ZERO &&
    missingNodeIds.length === NUM.ZERO;
  return Object.freeze({
    state: stale === true ?
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.STALE :
      (available === true ?
        (covered === true ?
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.AVAILABLE :
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.INCOMPLETE) :
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.UNAVAILABLE),
    available,
    stale,
    covered,
    nodeIds,
    nodeCount: nodeIds.length,
    missingNodeIds,
    missingNodeCount: missingNodeIds.length,
    ...(publicationEpoch !== PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH ?
      {publicationEpoch} :
      {}),
    ...(publicationRevision !== null ?
      {publicationRevision} :
      {}),
  });
}

function resolvePublicationActiveGateHandoffSnapshotCoverageSource(
  options = {},
) {
  return isPublicationActiveGateHandoffRecord(options.snapshotCoverage) ?
    options.snapshotCoverage :
    (
      isPublicationActiveGateHandoffRecord(options.activeNodeViews) ?
        options.activeNodeViews :
        null
    );
}

function resolvePublicationActiveGateHandoffSnapshotCoverageNodeIds(
  options = {},
) {
  const coverageSource =
    resolvePublicationActiveGateHandoffSnapshotCoverageSource(options);
  if (!coverageSource) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...normalizePublicationActiveGateHandoffNodeIdList(
      coverageSource[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NODE_IDS],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      coverageSource[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.COVERED_NODE_IDS],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      coverageSource[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SNAPSHOT_COVERAGE_NODE_IDS
      ],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      coverageSource[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EFFECTIVE_ACTIVE_NODE_IDS
      ],
    ),
  ]);
}

function resolvePublicationActiveGateHandoffSnapshotCoverageRevision(
  options = {},
) {
  const coverageSource =
    resolvePublicationActiveGateHandoffSnapshotCoverageSource(options);
  return resolvePublicationActiveGateHandoffFirstInteger(
    coverageSource?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REVISION],
    coverageSource?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SNAPSHOT_COVERAGE_REVISION
    ],
    coverageSource?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SNAPSHOT_REVISION],
  );
}

function isPublicationActiveGateHandoffSnapshotCoverageStale(options = {}) {
  const coverageSource =
    resolvePublicationActiveGateHandoffSnapshotCoverageSource(options);
  if (!coverageSource) {
    return false;
  }
  return coverageSource[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.FRESH] ===
    false ||
    hasPublicationActiveGateHandoffStaleMarker(
      coverageSource[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE],
      coverageSource[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REVISION_STATE
      ],
      coverageSource[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SNAPSHOT_REVISION_STATE
      ],
      coverageSource[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SNAPSHOT_OBSERVATION
      ]?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE],
    );
}

function buildPublicationActiveGateHandoffSnapshotCoverageEvidence({
  targetNodeIds,
  options,
}) {
  const nodeIds =
    resolvePublicationActiveGateHandoffSnapshotCoverageNodeIds(options);
  const missingNodeIds = normalizePublicationActiveGateHandoffNodeIdList(
    targetNodeIds.filter((nodeId) => !nodeIds.includes(nodeId)),
  );
  const revision =
    resolvePublicationActiveGateHandoffSnapshotCoverageRevision(options);
  const stale = isPublicationActiveGateHandoffSnapshotCoverageStale(options);
  const available = nodeIds.length > NUM.ZERO || revision !== null;
  const covered =
    available === true &&
    stale !== true &&
    targetNodeIds.length > NUM.ZERO &&
    missingNodeIds.length === NUM.ZERO;
  return Object.freeze({
    state: stale === true ?
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.STALE :
      (available === true ?
        (covered === true ?
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.AVAILABLE :
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.INCOMPLETE) :
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.UNAVAILABLE),
    available,
    stale,
    covered,
    nodeIds,
    coveredNodeCount: nodeIds.length,
    missingNodeIds,
    missingNodeCount: missingNodeIds.length,
    ...(revision !== null ? {revision} : {}),
  });
}

function resolvePublicationActiveGateHandoffPresenceNodeIds(options = {}) {
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...collectPublicationActiveGateHandoffNodeRows(options.nodeRows),
    ...collectPublicationActiveGateHandoffRecordNodeIds(
      options.activeNodeViews,
      PUBLICATION_ACTIVE_GATE_HANDOFF_ACTIVE_NODE_VIEW_FIELDS,
    ),
    ...resolvePublicationActiveGateHandoffSnapshotCoverageNodeIds(options),
  ]);
}

function buildPublicationActiveGateHandoffPresenceEvidence({
  targetNodeIds,
  options,
}) {
  const presentNodeIds =
    resolvePublicationActiveGateHandoffPresenceNodeIds(options);
  const missingNodeIds = normalizePublicationActiveGateHandoffNodeIdList(
    targetNodeIds.filter((nodeId) => !presentNodeIds.includes(nodeId)),
  );
  return Object.freeze({
    targetNodeIds,
    presentNodeIds,
    presentNodeCount: presentNodeIds.length,
    missingNodeIds,
    missingNodeCount: missingNodeIds.length,
    complete:
      targetNodeIds.length > NUM.ZERO &&
      missingNodeIds.length === NUM.ZERO,
  });
}

function resolvePublicationActiveGateCatchupFenceMissingProofReasons(
  evidence,
) {
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...(evidence.targetNodeIds.length === NUM.ZERO ?
      [PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON.TARGETS_UNAVAILABLE] :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
    ...(evidence.presence.complete !== true ?
      [
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
          .TARGET_PRESENCE_INCOMPLETE,
      ] :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
    ...(evidence.durablePublication.available !== true ?
      [
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
          .DURABLE_PUBLICATION_UNAVAILABLE,
      ] :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
    ...(evidence.durablePublication.stale === true ?
      [
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
          .DURABLE_PUBLICATION_STALE,
      ] :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
    ...(evidence.durablePublication.available === true &&
      evidence.durablePublication.stale !== true &&
      evidence.durablePublication.covered !== true ?
      [
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
          .DURABLE_PUBLICATION_INCOMPLETE,
      ] :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
    ...(evidence.snapshotCoverage.available !== true ?
      [
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
          .SNAPSHOT_COVERAGE_UNAVAILABLE,
      ] :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
    ...(evidence.snapshotCoverage.stale === true ?
      [
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
          .SNAPSHOT_COVERAGE_STALE,
      ] :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
    ...(evidence.snapshotCoverage.available === true &&
      evidence.snapshotCoverage.stale !== true &&
      evidence.snapshotCoverage.covered !== true ?
      [
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
          .SNAPSHOT_COVERAGE_INCOMPLETE,
      ] :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST),
  ]);
}

function buildPublicationActiveGateCatchupFence(options = {}) {
  const targetNodeIds =
    resolvePublicationActiveGateHandoffExpectedNodeIds(options);
  const durablePublication =
    buildPublicationActiveGateHandoffDurablePublicationEvidence({
      targetNodeIds,
      options,
    });
  const snapshotCoverage =
    buildPublicationActiveGateHandoffSnapshotCoverageEvidence({
      targetNodeIds,
      options,
    });
  const presence = buildPublicationActiveGateHandoffPresenceEvidence({
    targetNodeIds,
    options,
  });
  const evidence = Object.freeze({
    targetNodeIds,
    durablePublication,
    snapshotCoverage,
    presence,
  });
  const decision =
    PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_DECISION_RULES.find((rule) =>
      rule.matches(evidence),
    );
  const catchupState =
    durablePublication.covered === true ?
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_READY :
      decision.state;
  const promotionState =
    decision.state ===
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED ?
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED :
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_DENIED;
  return Object.freeze({
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    state: decision.state,
    catchupState,
    promotionState,
    targetNodeIds,
    targetNodeCount: targetNodeIds.length,
    presence,
    durablePublication,
    snapshotCoverage,
    missingProofReasons:
      resolvePublicationActiveGateCatchupFenceMissingProofReasons(evidence),
    nextLegalAction: decision.nextLegalAction,
    promotionAllowed:
      promotionState ===
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED,
  });
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
        options.publicationConvergence,
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
  const activeGateCatchupFence = buildPublicationActiveGateCatchupFence({
    ...options,
    expectedNodeIds,
  });
  const decision = decidePublicationActiveGateHandoff(evidence);
  const runtimePromotionAllowed =
    decision.runtimePromotionAllowed === true &&
    activeGateCatchupFence.promotionAllowed === true;
  const promotionDeniedByFence =
    decision.runtimePromotionAllowed === true &&
    runtimePromotionAllowed !== true;
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
    activeGateCatchupFence,
    runtimePromotionAllowed,
    state: promotionDeniedByFence ?
      PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.DEGRADED :
      decision.state,
    reasonCode: promotionDeniedByFence ?
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
        .PUBLISHED_ACTIVE_COVERAGE_INCOMPLETE :
      decision.reasonCode,
    nextAction: promotionDeniedByFence ?
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF :
      decision.nextAction,
  });
}

function normalizePublicationActiveGateHandoffContract(value) {
  if (!isPublicationActiveGateHandoffRecord(value)) {
    return null;
  }
  const activeGateCatchupFence =
    isPublicationActiveGateHandoffRecord(
      value[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE
      ],
    ) ?
      value[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE
      ] :
      null;
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
    snapshotCoverage: activeGateCatchupFence?.snapshotCoverage,
    activeNodeViews: {
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EFFECTIVE_ACTIVE_NODE_IDS]:
        activeGateCatchupFence?.presence?.presentNodeIds,
    },
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
    activeGateCatchupFence: contract.activeGateCatchupFence,
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
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE,
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
