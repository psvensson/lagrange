import {NUM} from '../constants/index.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from './publication-recovery-gate.js';
import {
  buildPublicationOwnerStreamState,
  isPublicationOwnerStreamPublicationPending,
} from './publication-owner-state.js';
import {
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_PRESSURE_STATE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_STREAM_OUTCOME,
  PUBLICATION_OWNER_TEXT,
} from './publication-owner-constants.js';
import {
  buildPublicationActiveGateHandoffContract,
  buildPublicationOperationWorkflowHandoff,
} from './publication-active-gate-handoff-contract.js';

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

function buildPublicationRecoveryAckNodeListInput(value) {
  return Array.isArray(value) ?
    Object.freeze({
      state: PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE.PROVIDED,
      value,
    }) :
    PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
}

function isPublicationRecoveryAckNodeListProvided(input) {
  return input?.state ===
    PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE.PROVIDED;
}

function resolvePublicationRecoveryAckNodeListInput(inputs = []) {
  return inputs.find((input) =>
    isPublicationRecoveryAckNodeListProvided(input),
  ) || PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
}

function resolvePublicationRecoveryGateRequiredAckNodeListInput(gate = null) {
  if (
    !isRecord(gate) ||
    gate.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(gate.requiredAckNodeIds);
}

function resolvePublicationRecoveryGateAcknowledgedNodeListInput(gate = null) {
  if (
    !isRecord(gate) ||
    gate.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(gate.acknowledgedNodeIds);
}

function resolvePublicationRecoveryConvergenceRequiredAckNodeListInput(
  publicationConvergence = null,
) {
  if (
    !isRecord(publicationConvergence) ||
    publicationConvergence.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(
    publicationConvergence.requiredAckNodeIds,
  );
}

function resolvePublicationRecoveryConvergenceAcknowledgedNodeListInput(
  publicationConvergence = null,
) {
  if (
    !isRecord(publicationConvergence) ||
    publicationConvergence.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(
    publicationConvergence.acknowledgedNodeIds,
  );
}

function hasAuthoritativeEmptyPendingAckGate(gate = null) {
  return isRecord(gate) &&
    Array.isArray(gate.pendingAckNodeIds) &&
    normalizeDistinctStringArray(gate.pendingAckNodeIds).length === NUM.ZERO &&
    (
      gate.publicationStatus === PUBLICATION_RECOVERY_PUBLICATION_STATUS
        .PUBLISHED ||
      hasPublicationRecoveryPressureDeferredEvidence(gate)
    );
}

function hasAuthoritativeEmptyMissingPublishedGate(gate = null) {
  return isRecord(gate) &&
    Array.isArray(gate.missingPublishedNodeIds) &&
    normalizeDistinctStringArray(gate.missingPublishedNodeIds).length ===
      NUM.ZERO &&
    (
      gate.publicationStatus === PUBLICATION_RECOVERY_PUBLICATION_STATUS
        .PUBLISHED ||
      hasPublicationRecoveryPressureDeferredEvidence(gate)
    );
}

function hasPublicationRecoveryPressureDeferredEvidence(source = null) {
  return isRecord(source) &&
    (
      source.pressureDeferred === true ||
      source.pressureCoalesced === true ||
      source.pressureState === PUBLICATION_OWNER_PRESSURE_STATE.DEFERRED ||
      source.pressureState === PUBLICATION_OWNER_PRESSURE_STATE.COALESCED
    );
}

function hasPublicationRecoveryPressureCoalescedEvidence(source = null) {
  return isRecord(source) &&
    (
      source.pressureCoalesced === true ||
      source.pressureState === PUBLICATION_OWNER_PRESSURE_STATE.COALESCED
    );
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

function resolvePendingRequiredAckNodeIds(
  requiredAckNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  acknowledgedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
) {
  const acknowledgedNodeIdSet = new Set(acknowledgedNodeIds);
  return Object.freeze(
    requiredAckNodeIds.filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId)),
  );
}

function normalizePublicationRecoveryAckEvidence(options = {}) {
  const requiredAckNodeListInput = isRecord(options.requiredAckNodeListInput) ?
    options.requiredAckNodeListInput :
    buildPublicationRecoveryAckNodeListInput(options.requiredAckNodeIds);
  const requiredAckNodeIds = normalizeDistinctStringArray(
    requiredAckNodeListInput.value,
  );
  const acknowledgedNodeIds = normalizeDistinctStringArray(
    options.acknowledgedNodeIds,
  );
  const explicitPendingAckNodeIds = normalizeDistinctStringArray(
    options.pendingAckNodeIds,
  );
  const publicationStatus = normalizeOptionalString(options.publicationStatus);
  const openCountOnlyAckIsStale =
    options.openCountOnlyAckIsStale !== false;
  const hasClosedPublishedPendingAckList =
    publicationStatus === PUBLICATION_RECOVERY_PUBLICATION_STATUS.PUBLISHED &&
    Array.isArray(options.pendingAckNodeIds) &&
    explicitPendingAckNodeIds.length === NUM.ZERO;
  const hasOpenCountOnlyPendingAckList =
    openCountOnlyAckIsStale &&
    publicationStatus === PUBLICATION_RECOVERY_PUBLICATION_STATUS.OPEN &&
    Array.isArray(options.pendingAckNodeIds) &&
    explicitPendingAckNodeIds.length === NUM.ZERO;
  const evidenceState =
    hasClosedPublishedPendingAckList ||
    isPublicationRecoveryAckNodeListProvided(requiredAckNodeListInput) &&
      (
        requiredAckNodeIds.length > NUM.ZERO ||
        explicitPendingAckNodeIds.length === NUM.ZERO
      ) ?
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST :
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY;
  const derivedPendingAckNodeIds =
    evidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST ?
      resolvePendingRequiredAckNodeIds(requiredAckNodeIds, acknowledgedNodeIds) :
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST;
  const pendingAckNodeIds =
    evidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST ?
      derivedPendingAckNodeIds :
      explicitPendingAckNodeIds;
  const countOnlyPendingAckCount =
    hasOpenCountOnlyPendingAckList ?
      NUM.ZERO :
      Math.max(
        pendingAckNodeIds.length,
        normalizeMaximumNonNegativeInteger(options.pendingAckCountValues),
      );
  const pendingAckCountByState = Object.freeze({
    [PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY]:
      countOnlyPendingAckCount,
    [PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST]:
      pendingAckNodeIds.length,
  });

  return Object.freeze({
    evidenceState,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds,
    pendingAckCount: pendingAckCountByState[evidenceState],
  });
}

function resolvePublicationRecoveryPendingAckNodeIds({
  requiredAckNodeListInput = PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT
    .UNAVAILABLE,
  ownerPendingAckNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  fallbackPendingAckNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
} = {}) {
  const normalizedOwnerPendingAckNodeIds = normalizeDistinctStringArray(
    ownerPendingAckNodeIds,
  );
  const requiredAckNodeIds = normalizeDistinctStringArray(
    requiredAckNodeListInput.value,
  );
  if (
    isPublicationRecoveryAckNodeListProvided(requiredAckNodeListInput) &&
    (
      requiredAckNodeIds.length > NUM.ZERO ||
      normalizedOwnerPendingAckNodeIds.length === NUM.ZERO
    )
  ) {
    return PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST;
  }
  return normalizeDistinctStringArray([
    ...normalizedOwnerPendingAckNodeIds,
    ...normalizeDistinctStringArray(fallbackPendingAckNodeIds),
  ]);
}

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
    return explicitSelectedMissingPublishedNodeIds.length === NUM.ZERO &&
      expectedNodeCount > NUM.ZERO &&
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
  return expectedNodeCount > NUM.ZERO &&
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
      expectedNodeCount > NUM.ZERO &&
      selectedPublishedActiveNodeIds.length > NUM.ZERO &&
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
    unresolvedClassCount === NUM.ZERO &&
    unresolvedSemanticStateCount === NUM.ZERO &&
    blockedPartitionCount === NUM.ZERO;
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
    pendingAckEvidence?.pendingAckCount !== NUM.ZERO ||
    pendingAckEvidence?.pendingAckNodeIds?.length !== NUM.ZERO
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
      selectedPublicationMembershipNodeIds.length > NUM.ZERO &&
      selectedMissingPublishedEvidence.state ===
        PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE
          .EXPLICIT_NODE_LIST &&
      selectedMissingPublishedEvidence.nodeIds.length > NUM.ZERO &&
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
      selectedPublicationMembershipNodeIds.length > NUM.ZERO &&
      selectedMissingPublishedEvidence.state ===
        PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE
          .EXPLICIT_NODE_LIST &&
      selectedMissingPublishedEvidence.nodeIds.length > NUM.ZERO &&
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
    selectedPublicationMembershipNodeIds.length > NUM.ZERO ?
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
  pendingAckCount = NUM.ZERO,
} = {}) {
  if (pendingAckCount > NUM.ZERO) {
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
      selectedPublicationMembershipNodeIds.length > NUM.ZERO &&
      selectedMissingPublishedEvidence.nodeIds.length > NUM.ZERO &&
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

function normalizeOptionalString(value) {
  return typeof value === PUBLICATION_RECOVERY_EVIDENCE_TYPEOF.STRING &&
    value.trim().length > NUM.ZERO ?
    value.trim() :
    null;
}

function normalizeBoolean(value) {
  return value === true || value === PUBLICATION_RECOVERY_EVIDENCE_TEXT.TRUE;
}

function hasClosedUnknownNoDebtPublicationGate(
  publicationConvergenceGate = null,
) {
  if (!isRecord(publicationConvergenceGate)) {
    return false;
  }
  const publicationStatus =
    normalizeOptionalString(
      publicationConvergenceGate.publicationStatusNormalized,
    ) ||
    normalizeOptionalString(publicationConvergenceGate.publicationStatus);
  return publicationConvergenceGate.publicationPending !== true &&
    hasUnknownPublicationRecoveryStatus(publicationStatus) &&
    normalizeOptionalString(publicationConvergenceGate.recoveryProtocolState) ===
      PUBLICATION_RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION &&
    normalizeOptionalString(publicationConvergenceGate.ackState) ===
      PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED &&
    normalizeOptionalString(publicationConvergenceGate.streamOutcome) ===
      PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED &&
    normalizeOptionalString(publicationConvergenceGate.recoveryOutcome) ===
      PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED &&
    normalizeNonNegativeInteger(publicationConvergenceGate.pendingAckCount) ===
      NUM.ZERO &&
    normalizeDistinctStringArray(publicationConvergenceGate.pendingAckNodeIds)
      .length === NUM.ZERO &&
    normalizeNonNegativeInteger(
      publicationConvergenceGate.missingPublishedCount,
    ) === NUM.ZERO &&
    normalizeDistinctStringArray(
      publicationConvergenceGate.missingPublishedNodeIds,
    ).length === NUM.ZERO &&
    publicationConvergenceGate.prioritySpreadPending !== true &&
    publicationConvergenceGate.prioritySpreadEvidenceUnavailable !== true;
}

function isClosedUnknownNoDebtReasonCode(reasonCode) {
  const normalizedReasonCode = normalizeOptionalString(reasonCode);
  return normalizedReasonCode ===
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING ||
    normalizedReasonCode ===
      PUBLICATION_RECOVERY_CLOSED_UNPUBLISHED_REASON
        .PUBLICATION_CONVERGENCE_MISSING ||
    normalizedReasonCode?.startsWith(
      PUBLICATION_RECOVERY_CLOSED_UNPUBLISHED_REASON
        .PUBLICATION_MISSING_ACTIVE_NODE_PREFIX,
    ) === true ||
    normalizedReasonCode?.startsWith(
      PUBLICATION_RECOVERY_CLOSED_UNPUBLISHED_REASON
        .PUBLICATION_NOT_PUBLISHED_PREFIX,
    ) === true;
}

function filterClosedUnknownNoDebtReasonCodes(reasonCodes = []) {
  return Object.freeze(
    normalizeDistinctStringArray(reasonCodes).filter((reasonCode) =>
      isClosedUnknownNoDebtReasonCode(reasonCode) !== true,
    ),
  );
}

function normalizeClosedUnknownNoDebtPriorityRecoveryObservation(
  priorityRecoveryObservation = null,
  publicationConvergenceGate = null,
) {
  if (
    !isRecord(priorityRecoveryObservation) ||
    hasClosedUnknownNoDebtPublicationGate(publicationConvergenceGate) !== true
  ) {
    return priorityRecoveryObservation;
  }
  return Object.freeze({
    ...priorityRecoveryObservation,
    publicationPending: false,
    recoveryProtocolState:
      PUBLICATION_RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
    priorityRecoveryReasonCodes: filterClosedUnknownNoDebtReasonCodes(
      priorityRecoveryObservation.priorityRecoveryReasonCodes,
    ),
    publicationConvergenceGateReasons: filterClosedUnknownNoDebtReasonCodes(
      priorityRecoveryObservation.publicationConvergenceGateReasons,
    ),
    pendingAckNodeIds: PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    pendingAckCount: NUM.ZERO,
    missingPublishedNodeIds: PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    missingPublishedCount: NUM.ZERO,
  });
}

function normalizePriorityRecoveryObservationFromPublicationGate(
  priorityRecoveryObservation = null,
  publicationConvergenceGate = null,
) {
  if (
    !isRecord(priorityRecoveryObservation) ||
    !isRecord(publicationConvergenceGate)
  ) {
    return priorityRecoveryObservation;
  }
  const publicationGateReasonCodes = normalizeDistinctStringArray(
    publicationConvergenceGate.reasonCodes ??
      publicationConvergenceGate.reasons ??
      priorityRecoveryObservation.priorityRecoveryReasonCodes,
  );
  const pressureDeferred =
    hasPublicationRecoveryPressureDeferredEvidence(publicationConvergenceGate);
  const pressureCoalesced =
    hasPublicationRecoveryPressureCoalescedEvidence(publicationConvergenceGate);
  return Object.freeze({
    ...priorityRecoveryObservation,
    publicationEpoch:
      publicationConvergenceGate.publicationEpoch ??
      priorityRecoveryObservation.publicationEpoch,
    publicationStatus:
      publicationConvergenceGate.publicationStatus ??
      priorityRecoveryObservation.publicationStatus,
    recoveryProtocolState:
      publicationConvergenceGate.recoveryProtocolState ??
      priorityRecoveryObservation.recoveryProtocolState,
    priorityRecoveryReasonCodes: publicationGateReasonCodes,
    publicationConvergenceGateReasons: publicationGateReasonCodes,
    pendingAckNodeIds: normalizeDistinctStringArray(
      publicationConvergenceGate.pendingAckNodeIds,
    ),
    pendingAckCount: normalizeNonNegativeInteger(
      publicationConvergenceGate.pendingAckCount,
    ),
    missingPublishedNodeIds: normalizeDistinctStringArray(
      publicationConvergenceGate.missingPublishedNodeIds,
    ),
    missingPublishedCount: normalizeNonNegativeInteger(
      publicationConvergenceGate.missingPublishedCount,
    ),
    publicationPending: publicationConvergenceGate.publicationPending === true,
    prioritySpreadPending:
      publicationConvergenceGate.prioritySpreadPending === true,
    pressureState:
      publicationConvergenceGate.pressureState ??
      priorityRecoveryObservation.pressureState,
    pressureDeferred,
    pressureCoalesced,
    pressureRetryAfterMs: normalizeNonNegativeInteger(
      publicationConvergenceGate.pressureRetryAfterMs,
    ),
    pressureReasonCodes: normalizeDistinctStringArray(
      publicationConvergenceGate.pressureReasonCodes,
    ),
    priorityPartitionSummary:
      publicationConvergenceGate.priorityPartitionSummary ??
      priorityRecoveryObservation.priorityPartitionSummary,
  });
}

function hasUnavailablePublicationRecoveryEpoch(value) {
  const publicationEpoch = normalizePublicationEpoch(value);
  return publicationEpoch === null || publicationEpoch === NUM.ZERO;
}

function hasUnknownPublicationRecoveryStatus(value) {
  const publicationStatus = normalizeOptionalString(value);
  return publicationStatus === null ||
    publicationStatus === PUBLICATION_OWNER_TEXT.UNKNOWN;
}

function hasPublicationRecoveryNodeListEvidence(...nodeIdLists) {
  return nodeIdLists.some((nodeIds) =>
    normalizeDistinctStringArray(nodeIds).length > NUM.ZERO,
  );
}

function hasCountOnlyUnknownPublicationDeficit({
  publicationEpoch = null,
  publicationStatus = null,
  pendingAckEvidence = null,
  authoritativePublicationMembershipNodeIds =
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  authoritativeMissingPublishedNodeIds =
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  observedMissingPublishedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  selectedPublicationMembershipNodeIds =
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  publishedActiveNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  prioritySpreadPending = false,
  publicationActiveGateHandoff = null,
} = {}) {
  if (hasOwnerReconcilePublicationHandoff(publicationActiveGateHandoff)) {
    return false;
  }
  return hasUnknownPublicationRecoveryStatus(publicationStatus) &&
    hasUnavailablePublicationRecoveryEpoch(publicationEpoch) &&
    prioritySpreadPending !== true &&
    normalizeNonNegativeInteger(pendingAckEvidence?.pendingAckCount) ===
      NUM.ZERO &&
    hasPublicationRecoveryNodeListEvidence(
      pendingAckEvidence?.requiredAckNodeIds,
      pendingAckEvidence?.acknowledgedNodeIds,
      pendingAckEvidence?.pendingAckNodeIds,
      authoritativePublicationMembershipNodeIds,
      authoritativeMissingPublishedNodeIds,
      observedMissingPublishedNodeIds,
      selectedPublicationMembershipNodeIds,
      publishedActiveNodeIds,
    ) !== true;
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

function resolvePublicationRecoveryPublishedActiveNodeIds({
  priorityRecoveryObservation = null,
  publicationConvergence = null,
  activeGateProgressRecords = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
} = {}) {
  const ownerPublishedActiveNodeIds = normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(
      priorityRecoveryObservation?.publishedActiveNodeIds,
    ),
    ...normalizeDistinctStringArray(
      publicationConvergence?.publishedActiveNodeIds,
    ),
  ]);
  if (ownerPublishedActiveNodeIds.length > NUM.ZERO) {
    return ownerPublishedActiveNodeIds;
  }
  return normalizeActiveGateProgressNodeIds(
    activeGateProgressRecords,
    [
      PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .SELECTED_PUBLISHED_ACTIVE_NODE_IDS,
    ],
  );
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
    ...normalizeDistinctStringArray(publicationConvergence?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(
      publicationConvergence?.missingPublishedRecoveryActiveNodeIds,
    ),
    ...normalizeDistinctStringArray(publicationConvergence?.publishedActiveNodeIds),
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
  buildPublicationRecoveryAckNodeListInput,
  isPublicationRecoveryAckNodeListProvided,
  resolvePublicationRecoveryAckNodeListInput,
  resolvePublicationRecoveryGateRequiredAckNodeListInput,
  resolvePublicationRecoveryGateAcknowledgedNodeListInput,
  resolvePublicationRecoveryConvergenceRequiredAckNodeListInput,
  resolvePublicationRecoveryConvergenceAcknowledgedNodeListInput,
  hasAuthoritativeEmptyPendingAckGate,
  hasAuthoritativeEmptyMissingPublishedGate,
  hasPublicationRecoveryPressureDeferredEvidence,
  hasPublicationRecoveryPressureCoalescedEvidence,
  normalizeDistinctStringArray,
  normalizePublicationEpoch,
  normalizeNonNegativeInteger,
  normalizeMaximumNonNegativeInteger,
  resolvePendingRequiredAckNodeIds,
  normalizePublicationRecoveryAckEvidence,
  resolvePublicationRecoveryPendingAckNodeIds,
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
  normalizeOptionalString,
  normalizeBoolean,
  hasClosedUnknownNoDebtPublicationGate,
  isClosedUnknownNoDebtReasonCode,
  filterClosedUnknownNoDebtReasonCodes,
  normalizeClosedUnknownNoDebtPriorityRecoveryObservation,
  normalizePriorityRecoveryObservationFromPublicationGate,
  hasUnavailablePublicationRecoveryEpoch,
  hasUnknownPublicationRecoveryStatus,
  hasPublicationRecoveryNodeListEvidence,
  hasCountOnlyUnknownPublicationDeficit,
  normalizePublicationRecoveryNodeIdListInput,
  normalizePublicationRecoveryHandoffNodeIds,
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
  normalizeProgressNodeIds,
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
