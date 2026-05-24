import {NUM} from '../constants/index.js';

const PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST = Object.freeze([]);
const PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE = Object.freeze({
  PROVIDED: 'provided',
  UNAVAILABLE: 'unavailable',
});
const PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT = Object.freeze({
  UNAVAILABLE: Object.freeze({
    state: PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE.UNAVAILABLE,
    value: PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  }),
});
const PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD = Object.freeze({
  EXPECTED_NODE_COUNT: 'expectedNodeCount',
  MISSING_PUBLISHED_COUNT: 'missingPublishedCount',
  MISSING_PUBLISHED_NODE_IDS: 'missingPublishedNodeIds',
  PENDING_ACK_COUNT: 'pendingAckCount',
  PENDING_ACK_NODE_IDS: 'pendingAckNodeIds',
  PUBLICATION_ACTIVE_GATE_HANDOFF: 'publicationActiveGateHandoff',
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION:
    'publicationActiveGateHandoffNextAction',
  PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECONCILE_COUNT:
    'publicationActiveGateHandoffPendingReconcileCount',
  PUBLICATION_ACTIVE_GATE_HANDOFF_PENDING_RECONCILE_NODE_IDS:
    'publicationActiveGateHandoffPendingReconcileNodeIds',
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON_CODE:
    'publicationActiveGateHandoffReasonCode',
  PUBLICATION_ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED:
    'publicationActiveGateHandoffRuntimePromotionAllowed',
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE:
    'publicationActiveGateHandoffState',
  PRIORITY_RECOVERY_PROGRESS_CLASSES: 'priorityRecoveryProgressClasses',
  PRIORITY_RECOVERY_UNRESOLVED_CLASS_COUNT:
    'priorityRecoveryUnresolvedClassCount',
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_COUNT:
    'priorityRecoveryUnresolvedSemanticStateCount',
  PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT:
    'priorityRecoveryBlockedPartitionCount',
  PRIORITY_SPREAD_SATISFIED: 'prioritySpreadSatisfied',
  PUBLICATION_STATUS: 'publicationStatus',
  RECOVERY_PROTOCOL_STATE: 'recoveryProtocolState',
  SELECTED_PUBLISHED_ACTIVE_COUNT: 'selectedPublishedActiveCount',
  SELECTED_PUBLISHED_ACTIVE_NODE_IDS: 'selectedPublishedActiveNodeIds',
  SELECTED_MISSING_PUBLISHED_NODE_IDS: 'selectedMissingPublishedNodeIds',
  SELECTED_PENDING_ACK_NODE_IDS: 'selectedPendingAckNodeIds',
});
const PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE = Object.freeze({
  EXPLICIT_NODE_LIST: 'explicit_node_list',
  FULL_SELECTED_COVERAGE: 'full_selected_coverage',
  UNAVAILABLE: 'unavailable',
});
const PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE = Object.freeze({
  UNAVAILABLE: Object.freeze({
    state: PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE.UNAVAILABLE,
    nodeIds: PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  }),
});
const PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_RANK = Object.freeze({
  [PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE.UNAVAILABLE]: NUM.ZERO,
  [PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE.EXPLICIT_NODE_LIST]:
    NUM.ONE,
  [PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE.FULL_SELECTED_COVERAGE]:
    NUM.ONE + NUM.ONE,
});
const PUBLICATION_RECOVERY_DECISION_SNAPSHOT_FIELD = Object.freeze({
  PENDING_ACK_NODE_IDS: 'pendingAckNodeIds',
  PUBLICATION: 'publication',
  SNAPSHOTS: 'snapshots',
});
const PUBLICATION_RECOVERY_EVIDENCE_TEXT = Object.freeze({
  COMMA: ',',
  EMPTY: '',
  PIPE: '|',
  TRUE: 'true',
});
const PUBLICATION_RECOVERY_LEASE_DEFAULT_DURATION_MS = 5000;
const PUBLICATION_RECOVERY_HANDOFF_FIELD = Object.freeze({
  NEXT_ACTION: 'nextAction',
  OPERATION_WORKFLOW_HANDOFF: 'operationWorkflowHandoff',
  PENDING_RECONCILE_COUNT: 'pendingReconcileCount',
  PENDING_RECONCILE_NODE_IDS: 'pendingReconcileNodeIds',
  REASON_CODE: 'reasonCode',
  RUNTIME_PROMOTION_ALLOWED: 'runtimePromotionAllowed',
  STATE: 'state',
});
const PUBLICATION_RECOVERY_HANDOFF_STATE = Object.freeze({
  PENDING: 'pending',
});
const PUBLICATION_RECOVERY_HANDOFF_REASON_CODE = Object.freeze({
  OWNER_RECONCILE_PENDING: 'owner_reconcile_pending',
});
const PUBLICATION_RECOVERY_HANDOFF_NEXT_ACTION = Object.freeze({
  RECONCILE_OWNER_MEMBERSHIP_PUBLICATION:
    'reconcile_owner_membership_publication',
});
const PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION = Object.freeze({
  EMIT_UNPUBLISHED_RECONCILE: 'emit_unpublished_reconcile',
  OMIT: 'omit',
  PRESERVE_EXISTING: 'preserve_existing',
});
const PUBLICATION_RECOVERY_NODE_DEBT_STATE = Object.freeze({
  ABSENT: 'absent',
  PRESENT: 'present',
});
const PUBLICATION_RECOVERY_OWNER_RECONCILE_HANDOFF_MATCHERS = Object.freeze([
  Object.freeze({
    fieldName: PUBLICATION_RECOVERY_HANDOFF_FIELD.STATE,
    expectedValue: PUBLICATION_RECOVERY_HANDOFF_STATE.PENDING,
  }),
  Object.freeze({
    fieldName: PUBLICATION_RECOVERY_HANDOFF_FIELD.REASON_CODE,
    expectedValue:
      PUBLICATION_RECOVERY_HANDOFF_REASON_CODE.OWNER_RECONCILE_PENDING,
  }),
  Object.freeze({
    fieldName: PUBLICATION_RECOVERY_HANDOFF_FIELD.NEXT_ACTION,
    expectedValue: PUBLICATION_RECOVERY_HANDOFF_NEXT_ACTION
      .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
  }),
]);
const PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION_RULES = Object.freeze([
  Object.freeze({
    outcome:
      PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION.PRESERVE_EXISTING,
    matches: (snapshot) => snapshot.existingHandoffAvailable === true,
  }),
  Object.freeze({
    outcome:
      PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION
        .EMIT_UNPUBLISHED_RECONCILE,
    matches: (snapshot) =>
      snapshot.activeGateProgressAvailable === true &&
      snapshot.publicationPending === true &&
      snapshot.recoveryProtocolState ===
        PUBLICATION_RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION &&
      snapshot.nodeDebtState === PUBLICATION_RECOVERY_NODE_DEBT_STATE.ABSENT &&
      snapshot.prioritySpreadPending !== true,
  }),
  Object.freeze({
    outcome: PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION.OMIT,
    matches: () => true,
  }),
]);
const PUBLICATION_RECOVERY_PUBLICATION_STATUS = Object.freeze({
  OPEN: 'OPEN',
  PUBLISHED: 'PUBLISHED',
});
const PUBLICATION_RECOVERY_PROTOCOL_STATE = Object.freeze({
  STEADY_PUBLISHED: 'steady_published',
  UNPUBLISHED_OBSERVATION: 'unpublished_observation',
});
const PUBLICATION_RECOVERY_CLOSED_UNPUBLISHED_REASON = Object.freeze({
  PUBLICATION_CONVERGENCE_MISSING: 'publication_convergence_missing',
  PUBLICATION_MISSING_ACTIVE_NODE_PREFIX: 'publication_missing_active_node=',
  PUBLICATION_NOT_PUBLISHED_PREFIX: 'publication_not_published=',
});
const PUBLICATION_RECOVERY_EVIDENCE_TYPEOF = Object.freeze({
  OBJECT: 'object',
  STRING: 'string',
});

function isRecord(value) {
  return Boolean(value) &&
    typeof value === PUBLICATION_RECOVERY_EVIDENCE_TYPEOF.OBJECT &&
    Array.isArray(value) !== true;
}

function normalizeDistinctStringArray(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) =>
          String(value || PUBLICATION_RECOVERY_EVIDENCE_TEXT.EMPTY).trim())
        .filter((value) => value.length > NUM.ZERO),
    )],
  );
}

function normalizePublicationEpoch(value) {
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

function normalizeNonNegativeInteger(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= NUM.ZERO ?
    Math.floor(numericValue) :
    NUM.ZERO;
}

function normalizeMaximumNonNegativeInteger(values = []) {
  return Math.max(
    NUM.ZERO,
    ...values.map((value) => normalizeNonNegativeInteger(value)),
  );
}

function normalizeOptionalString(value) {
  return typeof value === PUBLICATION_RECOVERY_EVIDENCE_TYPEOF.STRING &&
    value.trim().length > NUM.ZERO ?
    value.trim() :
    null;
}

function normalizeBoolean(value) {
  return value === true || value === PUBLICATION_RECOVERY_EVIDENCE_TEXT.TRUE;
}

function normalizePublicationRecoveryNodeIdListInput(
  values = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
) {
  if (Array.isArray(values)) {
    return values;
  }
  if (typeof values !== PUBLICATION_RECOVERY_EVIDENCE_TYPEOF.STRING) {
    return PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST;
  }
  return values
    .split(PUBLICATION_RECOVERY_EVIDENCE_TEXT.COMMA)
    .flatMap((value) =>
      value.split(PUBLICATION_RECOVERY_EVIDENCE_TEXT.PIPE));
}

function normalizePublicationRecoveryHandoffNodeIds(
  values = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
) {
  return normalizeDistinctStringArray(
    normalizePublicationRecoveryNodeIdListInput(values),
  );
}

function normalizeProgressNodeIds(
  progress = null,
  fieldName = PUBLICATION_RECOVERY_EVIDENCE_TEXT.EMPTY,
) {
  return normalizeDistinctStringArray(progress?.[fieldName]);
}

function resolveActiveGateProgressString(
  activeGateProgressRecords = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  fieldName = PUBLICATION_RECOVERY_EVIDENCE_TEXT.EMPTY,
) {
  for (const progress of activeGateProgressRecords) {
    const normalizedValue = normalizeOptionalString(progress?.[fieldName]);
    if (normalizedValue) {
      return normalizedValue;
    }
  }
  return null;
}

function normalizeActiveGateProgressNodeIds(
  activeGateProgressRecords = [],
  fieldNames = [],
) {
  return normalizeDistinctStringArray(
    activeGateProgressRecords.flatMap((progress) =>
      fieldNames.flatMap((fieldName) =>
        normalizeProgressNodeIds(progress, fieldName),
      ),
    ),
  );
}

function normalizeActiveGateProgressCount(
  activeGateProgressRecords = [],
  fieldName = PUBLICATION_RECOVERY_EVIDENCE_TEXT.EMPTY,
) {
  return normalizeMaximumNonNegativeInteger(
    activeGateProgressRecords.map((progress) => progress?.[fieldName]),
  );
}

function normalizePriorityRecoveryDecisionPendingAckNodeIds(
  priorityRecoveryDecisionSnapshots = null,
) {
  const snapshots = Array.isArray(
    priorityRecoveryDecisionSnapshots?.[
      PUBLICATION_RECOVERY_DECISION_SNAPSHOT_FIELD.SNAPSHOTS
    ],
  ) ?
    priorityRecoveryDecisionSnapshots[
      PUBLICATION_RECOVERY_DECISION_SNAPSHOT_FIELD.SNAPSHOTS
    ] :
    PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST;
  return normalizeDistinctStringArray(
    snapshots.flatMap((snapshot) =>
      normalizeDistinctStringArray(
        snapshot?.[
          PUBLICATION_RECOVERY_DECISION_SNAPSHOT_FIELD.PUBLICATION
        ]?.[
          PUBLICATION_RECOVERY_DECISION_SNAPSHOT_FIELD.PENDING_ACK_NODE_IDS
        ],
      ),
    ),
  );
}

function resolveRawPublicationConvergenceGate(
  publicationConvergence = null,
  publicationConvergenceGate = null,
) {
  if (isRecord(publicationConvergenceGate)) {
    return publicationConvergenceGate;
  }
  if (isRecord(publicationConvergence?.publicationRecoveryGate)) {
    return publicationConvergence.publicationRecoveryGate;
  }
  return null;
}

function resolvePriorityRecoveryClosureWitness(
  publicationConvergence = null,
  rawPublicationConvergenceGate = null,
  priorityRecoveryDecisionSnapshots = null,
) {
  if (isRecord(priorityRecoveryDecisionSnapshots?.closureWitness)) {
    return priorityRecoveryDecisionSnapshots.closureWitness;
  }
  if (isRecord(rawPublicationConvergenceGate?.priorityRecoveryClosureWitness)) {
    return rawPublicationConvergenceGate.priorityRecoveryClosureWitness;
  }
  if (isRecord(publicationConvergence?.priorityRecoveryClosureWitness)) {
    return publicationConvergence.priorityRecoveryClosureWitness;
  }
  return null;
}

function resolveAuthoritativePublicationMembershipNodeIds({
  publicationConvergence = null,
  publicationConvergenceGate = null,
  requiredAckNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  acknowledgedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  pendingAckNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
} = {}) {
  return normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(requiredAckNodeIds),
    ...normalizeDistinctStringArray(acknowledgedNodeIds),
    ...normalizeDistinctStringArray(pendingAckNodeIds),
    ...normalizeDistinctStringArray(
      publicationConvergenceGate?.missingPublishedNodeIds,
    ),
    ...normalizeDistinctStringArray(
      publicationConvergence?.missingPublishedNodeIds,
    ),
    ...normalizeDistinctStringArray(
      publicationConvergence?.missingPublishedRecoveryActiveNodeIds,
    ),
    ...normalizeDistinctStringArray(
      publicationConvergence?.publishedActiveNodeIds,
    ),
  ]);
}

function resolveRelevantPublicationMembershipNodeIds(
  nodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  authoritativePublicationMembershipNodeIds =
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
) {
  const normalizedNodeIds = normalizeDistinctStringArray(nodeIds);
  const authoritativeNodeIdSet = new Set(
    normalizeDistinctStringArray(authoritativePublicationMembershipNodeIds),
  );
  return authoritativeNodeIdSet.size > NUM.ZERO ?
    normalizeDistinctStringArray(
      normalizedNodeIds.filter((nodeId) => authoritativeNodeIdSet.has(nodeId)),
    ) :
    normalizedNodeIds;
}

export {
  isRecord,
  normalizeDistinctStringArray,
  normalizePublicationEpoch,
  normalizeNonNegativeInteger,
  normalizeMaximumNonNegativeInteger,
  normalizeOptionalString,
  normalizeBoolean,
  normalizePublicationRecoveryNodeIdListInput,
  normalizePublicationRecoveryHandoffNodeIds,
  normalizeProgressNodeIds,
  resolveActiveGateProgressString,
  normalizeActiveGateProgressNodeIds,
  normalizeActiveGateProgressCount,
  normalizePriorityRecoveryDecisionPendingAckNodeIds,
  resolveRawPublicationConvergenceGate,
  resolvePriorityRecoveryClosureWitness,
  resolveAuthoritativePublicationMembershipNodeIds,
  resolveRelevantPublicationMembershipNodeIds,
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE,
  PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT,
  PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD,
  PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE,
  PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE,
  PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_RANK,
  PUBLICATION_RECOVERY_DECISION_SNAPSHOT_FIELD,
  PUBLICATION_RECOVERY_EVIDENCE_TEXT,
  PUBLICATION_RECOVERY_LEASE_DEFAULT_DURATION_MS,
  PUBLICATION_RECOVERY_HANDOFF_FIELD,
  PUBLICATION_RECOVERY_HANDOFF_STATE,
  PUBLICATION_RECOVERY_HANDOFF_REASON_CODE,
  PUBLICATION_RECOVERY_HANDOFF_NEXT_ACTION,
  PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION,
  PUBLICATION_RECOVERY_NODE_DEBT_STATE,
  PUBLICATION_RECOVERY_OWNER_RECONCILE_HANDOFF_MATCHERS,
  PUBLICATION_RECOVERY_ACTIVE_GATE_HANDOFF_EMISSION_RULES,
  PUBLICATION_RECOVERY_PUBLICATION_STATUS,
  PUBLICATION_RECOVERY_PROTOCOL_STATE,
  PUBLICATION_RECOVERY_CLOSED_UNPUBLISHED_REASON,
  PUBLICATION_RECOVERY_EVIDENCE_TYPEOF,
};
