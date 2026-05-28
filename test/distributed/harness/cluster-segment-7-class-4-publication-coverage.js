import {CLUSTER_SEGMENT_7_CLASS_SHARED} from './cluster-segment-7-class-shared.js';

const {
  ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_READINESS_MODE_STARTUP,
  ONE,
  ZERO,
  isTimeoutShapedProbeError,
  normalizeDistinctStringArray,
  normalizeProbeError,
  parseFiniteNumberField,
  parseJsonArrayField,
  parseJsonObjectField,
} = CLUSTER_SEGMENT_7_CLASS_SHARED;

const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const CONTROL_PLANE_DIAGNOSTICS_FIELD = 'controlPlaneDiagnostics';
const CONTROL_PLANE_PUBLICATION_CONVERGENCE_FIELD = 'publicationConvergence';
const CONTROL_PLANE_PUBLICATION_CONVERGENCE_SNAKE_FIELD =
  'publication_convergence';
const PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD =
  'publicationActiveGateHandoff';
const PUBLICATION_ACTIVE_GATE_HANDOFF_SNAKE_FIELD =
  'publication_active_gate_handoff';
const PUBLICATION_PUBLISHED_ACTIVE_NODE_IDS_FIELD = 'publishedActiveNodeIds';
const PUBLICATION_PUBLISHED_ACTIVE_NODE_IDS_SNAKE_FIELD =
  'published_active_node_ids';
const PUBLICATION_HANDOFF_STATE_FIELD = 'state';
const PUBLICATION_HANDOFF_REASON_CODE_FIELD = 'reasonCode';
const PUBLICATION_HANDOFF_REASON_CODE_SNAKE_FIELD = 'reason_code';
const PUBLICATION_HANDOFF_NEXT_ACTION_FIELD = 'nextAction';
const PUBLICATION_HANDOFF_NEXT_ACTION_SNAKE_FIELD = 'next_action';
const PUBLICATION_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FIELD =
  'runtimePromotionAllowed';
const PUBLICATION_HANDOFF_RUNTIME_PROMOTION_ALLOWED_SNAKE_FIELD =
  'runtime_promotion_allowed';
const PUBLICATION_HANDOFF_PENDING_RECONCILE_NODE_IDS_FIELD =
  'pendingReconcileNodeIds';
const PUBLICATION_HANDOFF_PENDING_RECONCILE_NODE_IDS_SNAKE_FIELD =
  'pending_reconcile_node_ids';
const PUBLICATION_HANDOFF_PENDING_RECOVERY_NODE_IDS_FIELD =
  'pendingRecoveryNodeIds';
const PUBLICATION_HANDOFF_PENDING_RECOVERY_NODE_IDS_SNAKE_FIELD =
  'pending_recovery_node_ids';
const PUBLICATION_HANDOFF_STATE_PENDING = 'pending';
const PUBLICATION_HANDOFF_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
const PUBLICATION_HANDOFF_NEXT_ACTION_RECONCILE_OWNER_MEMBERSHIP =
  'reconcile_owner_membership_publication';
const PUBLICATION_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const PUBLICATION_HANDOFF_RESIDUAL_RECONCILE_PROJECTION_LIMIT = 2;
const PUBLICATION_PROJECTION_NODE_IDS_UNAVAILABLE = Object.freeze([]);
const SELECTED_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED = 'repair_deferred';
const SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION_RETRY = 'retry';
const SELECTED_SNAPSHOT_OBSERVATION_REASON_SELECTED_TIMEOUT =
  'selected_timeout';
const SELECTED_SNAPSHOT_OBSERVATION_REASON_SELECTED_TRANSPORT_CLOSED =
  'selected_transport_closed';
const SELECTED_SNAPSHOT_OWNER_RECOVERY_REPAIR_REASONS = Object.freeze([
  SELECTED_SNAPSHOT_OBSERVATION_REASON_SELECTED_TIMEOUT,
  SELECTED_SNAPSHOT_OBSERVATION_REASON_SELECTED_TRANSPORT_CLOSED,
]);
const SELECTED_SNAPSHOT_OWNER_QUEUE_PENDING_WRITES_FIELD = 'pendingWrites';
const SELECTED_SNAPSHOT_OWNER_QUEUE_PENDING_WRITE_GROWTH_COUNT_FIELD =
  'pendingWriteGrowthCount';
const SELECTED_SNAPSHOT_HANDOFF_OUTCOME_STATE_FIELD = 'state';
const SELECTED_SNAPSHOT_HANDOFF_OUTCOME_REASON_CODE_FIELD = 'reasonCode';
const SELECTED_SNAPSHOT_HANDOFF_OUTCOME_RETRY_AFTER_MS_FIELD = 'retryAfterMs';
const SELECTED_SNAPSHOT_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED =
  'write_deferred';
const ACTIVE_PROBE_REASON_READINESS_TIMEOUT_PREFIX =
  'readiness_probe_timeout=';
const SELECTED_SNAPSHOT_TIMEOUT_OWNER_RECOVERY_OUTCOME_KEEP = Object.freeze({
  project: false,
});
const SELECTED_SNAPSHOT_TIMEOUT_OWNER_RECOVERY_OUTCOME_APPLY = Object.freeze({
  project: true,
});
const SELECTED_SNAPSHOT_TIMEOUT_OWNER_RECOVERY_DECISION_TABLE = Object.freeze([
  Object.freeze({
    outcome: SELECTED_SNAPSHOT_TIMEOUT_OWNER_RECOVERY_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.selectedTimeoutRepairDeferred === true &&
      evidence.waitOwnerRecoveryHandoff === true &&
      evidence.pendingRecoveryNodeCount > ZERO &&
      evidence.ownerQueueBounded === true &&
      evidence.handoffOutcomeBounded === true,
  }),
]);
const PARTIAL_COVERAGE_CONVERGENCE_OUTCOME_KEEP = Object.freeze({
  converged: false,
});
const PARTIAL_COVERAGE_CONVERGENCE_OUTCOME_APPLY = Object.freeze({
  converged: true,
});
const PARTIAL_COVERAGE_PUBLICATION_GATE_FIELD = Object.freeze({
  MISSING_PUBLISHED_NODE_IDS: 'missingPublishedNodeIds',
  PENDING_ACK_NODE_IDS: 'pendingAckNodeIds',
  PRIORITY_PARTITION_SUMMARY: 'priorityPartitionSummary',
  READY: 'ready',
  SATISFIED: 'satisfied',
});
const PARTIAL_COVERAGE_CONVERGENCE_DECISION_TABLE = Object.freeze([
  Object.freeze({
    outcome: PARTIAL_COVERAGE_CONVERGENCE_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.readinessMode === CLUSTER_READINESS_MODE_LOAD &&
      evidence.activeByStatus === true &&
      evidence.publicationGateReady === true &&
      evidence.snapshotCoverageComplete !== true &&
      evidence.bestCoverageNodeCount > ZERO &&
      evidence.selectedSnapshotErrorPresent !== true,
  }),
  Object.freeze({
    outcome: PARTIAL_COVERAGE_CONVERGENCE_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.readinessMode === CLUSTER_READINESS_MODE_LOAD &&
      evidence.activeByStatus === true &&
      evidence.publicationGateReady === true &&
      evidence.snapshotCoverageComplete !== true &&
      evidence.bestCoverageNodeCount > ZERO &&
      evidence.selectedSnapshotAdminReady === true &&
      evidence.selectedSnapshotTimeoutOwnerRecoveryProjectionReady === true &&
      evidence.selectedPendingRecoveryCount > ZERO,
  }),
  Object.freeze({
    outcome: PARTIAL_COVERAGE_CONVERGENCE_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
      evidence.activeByStatus === true &&
      evidence.publicationGateReady === true &&
      evidence.snapshotCoverageComplete !== true &&
      evidence.bestCoverageNodeCount > ZERO &&
      evidence.selectedSnapshotAdminReady === true &&
      evidence.selectedSnapshotErrorPresent !== true &&
      evidence.selectedPublicationGateReady === true &&
      evidence.selectedPendingAckCount === ZERO &&
      evidence.selectedMissingPublishedCount > ZERO,
  }),
  Object.freeze({
    outcome: PARTIAL_COVERAGE_CONVERGENCE_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
      evidence.activeByStatus === true &&
      evidence.publicationGateReady === true &&
      evidence.snapshotCoverageComplete !== true &&
      evidence.bestCoverageNodeCount > ZERO &&
      evidence.selectedSnapshotAdminReady === true &&
      evidence.selectedSnapshotTimeoutOwnerRecoveryProjectionReady === true &&
      evidence.selectedPendingRecoveryCount > ZERO,
  }),
]);

function normalizeOptionalString(value) {
  return typeof value === TYPEOF_STRING && value.length > ZERO ? value : null;
}

function normalizeProjectionCount(value) {
  const parsedValue = parseFiniteNumberField(value);
  return Number.isFinite(parsedValue) ?
    Math.max(ZERO, Math.floor(parsedValue)) :
    ZERO;
}

function hasSelectedSnapshotBoundedRetry(value) {
  const parsedValue = parseFiniteNumberField(value);
  return Number.isFinite(parsedValue) && parsedValue > ZERO;
}

function normalizeSelectedSnapshotTimeoutOwnerRecoveryHandoff(
  snapshotCoverage,
) {
  const handoff =
    snapshotCoverage?.selectedPublicationActiveGateHandoff &&
      typeof snapshotCoverage.selectedPublicationActiveGateHandoff ===
        TYPEOF_OBJECT ?
      snapshotCoverage.selectedPublicationActiveGateHandoff :
      snapshotCoverage?.selectedActiveGateOwnerCohort &&
        typeof snapshotCoverage.selectedActiveGateOwnerCohort ===
          TYPEOF_OBJECT ?
        snapshotCoverage.selectedActiveGateOwnerCohort :
        null;
  return handoff &&
    typeof handoff === TYPEOF_OBJECT &&
    Array.isArray(handoff) !== true ?
    handoff :
    null;
}

function normalizeSelectedSnapshotTimeoutOwnerRecoveryOutcome(
  snapshotCoverage,
) {
  const outcome = snapshotCoverage?.selectedMembershipPublicationHandoffOutcome;
  return outcome &&
    typeof outcome === TYPEOF_OBJECT &&
    Array.isArray(outcome) !== true ?
    outcome :
    null;
}

function normalizeSelectedSnapshotOwnerQueueDepth(snapshotCoverage) {
  const ownerQueueDepth = snapshotCoverage?.selectedControlPlaneOwnerQueueDepth;
  return ownerQueueDepth &&
    typeof ownerQueueDepth === TYPEOF_OBJECT &&
    Array.isArray(ownerQueueDepth) !== true ?
    ownerQueueDepth :
    null;
}

function hasSelectedSnapshotTimeoutRepairDeferredEvidence(snapshotCoverage) {
  const reasonCodes = normalizeDistinctStringArray(
    snapshotCoverage?.selectedSnapshotObservationReasonCodes,
  );
  return (
    (
      isTimeoutShapedProbeError(snapshotCoverage?.selectedError) === true ||
      reasonCodes.includes(
        SELECTED_SNAPSHOT_OBSERVATION_REASON_SELECTED_TRANSPORT_CLOSED,
      )
    ) &&
    snapshotCoverage?.selectedSnapshotRepairDeferred === true &&
    snapshotCoverage?.selectedSnapshotObservationMode ===
      SELECTED_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED &&
    snapshotCoverage?.selectedSnapshotObservationNextAction ===
      SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION_RETRY &&
    hasSelectedSnapshotBoundedRetry(
      snapshotCoverage?.selectedSnapshotObservationRetryAfterMs,
    ) &&
    reasonCodes.some((reasonCode) =>
      SELECTED_SNAPSHOT_OWNER_RECOVERY_REPAIR_REASONS.includes(reasonCode),
    )
  );
}

function isSelectedSnapshotOwnerQueueBounded({
  ownerQueueDepth,
  pendingRecoveryNodeIds,
}) {
  if (!ownerQueueDepth) {
    return false;
  }
  const pendingWrites = normalizeProjectionCount(
    ownerQueueDepth[SELECTED_SNAPSHOT_OWNER_QUEUE_PENDING_WRITES_FIELD],
  );
  const pendingWriteGrowthCount = normalizeProjectionCount(
    ownerQueueDepth[
      SELECTED_SNAPSHOT_OWNER_QUEUE_PENDING_WRITE_GROWTH_COUNT_FIELD
    ],
  );
  return (
    pendingWrites >= Math.max(ONE, pendingRecoveryNodeIds.length) &&
    pendingWriteGrowthCount === ZERO
  );
}

function isSelectedSnapshotHandoffOutcomeBounded(handoffOutcome) {
  if (!handoffOutcome) {
    return false;
  }
  return (
    handoffOutcome[SELECTED_SNAPSHOT_HANDOFF_OUTCOME_STATE_FIELD] ===
      SELECTED_SNAPSHOT_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED &&
    handoffOutcome[SELECTED_SNAPSHOT_HANDOFF_OUTCOME_REASON_CODE_FIELD] ===
      PUBLICATION_HANDOFF_REASON_OWNER_RECONCILE_PENDING &&
    hasSelectedSnapshotBoundedRetry(
      handoffOutcome[SELECTED_SNAPSHOT_HANDOFF_OUTCOME_RETRY_AFTER_MS_FIELD],
    )
  );
}

function normalizeSelectedSnapshotTimeoutOwnerRecoveryEvidence(
  snapshotCoverage,
) {
  const handoff =
    normalizeSelectedSnapshotTimeoutOwnerRecoveryHandoff(snapshotCoverage);
  const pendingRecoveryNodeIds =
    normalizeOwnerReconcileHandoffPendingRecoveryNodeIds(handoff);
  const handoffOutcome =
    normalizeSelectedSnapshotTimeoutOwnerRecoveryOutcome(snapshotCoverage);
  const ownerQueueDepth =
    normalizeSelectedSnapshotOwnerQueueDepth(snapshotCoverage);
  return Object.freeze({
    pendingRecoveryNodeIds,
    pendingRecoveryNodeCount: pendingRecoveryNodeIds.length,
    selectedTimeoutRepairDeferred:
      hasSelectedSnapshotTimeoutRepairDeferredEvidence(snapshotCoverage),
    waitOwnerRecoveryHandoff:
      isPendingOwnerReconcileActiveGateHandoff(handoff),
    ownerQueueBounded: isSelectedSnapshotOwnerQueueBounded({
      ownerQueueDepth,
      pendingRecoveryNodeIds,
    }),
    handoffOutcomeBounded:
      isSelectedSnapshotHandoffOutcomeBounded(handoffOutcome),
  });
}

function decideSelectedSnapshotTimeoutOwnerRecoveryProjection(evidence) {
  const decision =
    SELECTED_SNAPSHOT_TIMEOUT_OWNER_RECOVERY_DECISION_TABLE.find(
      (candidate) => candidate.matches(evidence),
    );
  return decision?.outcome ||
    SELECTED_SNAPSHOT_TIMEOUT_OWNER_RECOVERY_OUTCOME_KEEP;
}

function extractPublicationProjectionNodeIds(row) {
  const controlPlaneDiagnostics = parseJsonObjectField(
    row?.[CONTROL_PLANE_DIAGNOSTICS_FIELD],
  );
  const publicationConvergence =
    parseJsonObjectField(
      controlPlaneDiagnostics?.[CONTROL_PLANE_PUBLICATION_CONVERGENCE_FIELD],
    ) ??
    parseJsonObjectField(
      controlPlaneDiagnostics?.[
        CONTROL_PLANE_PUBLICATION_CONVERGENCE_SNAKE_FIELD
      ],
    );
  const publicationActiveGateHandoff =
    parseJsonObjectField(
      controlPlaneDiagnostics?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD],
    ) ??
    parseJsonObjectField(
      controlPlaneDiagnostics?.[PUBLICATION_ACTIVE_GATE_HANDOFF_SNAKE_FIELD],
    ) ??
    parseJsonObjectField(
      publicationConvergence?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD],
    ) ??
    parseJsonObjectField(
      publicationConvergence?.[PUBLICATION_ACTIVE_GATE_HANDOFF_SNAKE_FIELD],
    );
  const pendingReconcileNodeIds = normalizeDistinctStringArray([
    ...parseJsonArrayField(
      publicationActiveGateHandoff?.[
        PUBLICATION_HANDOFF_PENDING_RECONCILE_NODE_IDS_FIELD
      ],
    ),
    ...parseJsonArrayField(
      publicationActiveGateHandoff?.[
        PUBLICATION_HANDOFF_PENDING_RECONCILE_NODE_IDS_SNAKE_FIELD
      ],
    ),
  ]);
  const pendingRecoveryNodeIds = normalizeDistinctStringArray([
    ...parseJsonArrayField(
      publicationActiveGateHandoff?.[
        PUBLICATION_HANDOFF_PENDING_RECOVERY_NODE_IDS_FIELD
      ],
    ),
    ...parseJsonArrayField(
      publicationActiveGateHandoff?.[
        PUBLICATION_HANDOFF_PENDING_RECOVERY_NODE_IDS_SNAKE_FIELD
      ],
    ),
  ]);
  const reasonCode =
    normalizeOptionalString(
      publicationActiveGateHandoff?.[PUBLICATION_HANDOFF_REASON_CODE_FIELD],
    ) ??
    normalizeOptionalString(
      publicationActiveGateHandoff?.[
        PUBLICATION_HANDOFF_REASON_CODE_SNAKE_FIELD
      ],
    );
  const nextAction =
    normalizeOptionalString(
      publicationActiveGateHandoff?.[PUBLICATION_HANDOFF_NEXT_ACTION_FIELD],
    ) ??
    normalizeOptionalString(
      publicationActiveGateHandoff?.[
        PUBLICATION_HANDOFF_NEXT_ACTION_SNAKE_FIELD
      ],
    );
  const runtimePromotionAllowed =
    publicationActiveGateHandoff?.[
      PUBLICATION_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FIELD
    ] === true ||
    publicationActiveGateHandoff?.[
      PUBLICATION_HANDOFF_RUNTIME_PROMOTION_ALLOWED_SNAKE_FIELD
    ] === true;
  const pendingHandoffNodeIds =
    nextAction ===
      PUBLICATION_HANDOFF_NEXT_ACTION_RECONCILE_OWNER_MEMBERSHIP ?
      pendingReconcileNodeIds :
      nextAction === PUBLICATION_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY ?
        pendingRecoveryNodeIds :
        PUBLICATION_PROJECTION_NODE_IDS_UNAVAILABLE;
  const projectionAllowed =
    publicationActiveGateHandoff?.[PUBLICATION_HANDOFF_STATE_FIELD] ===
      PUBLICATION_HANDOFF_STATE_PENDING &&
    reasonCode === PUBLICATION_HANDOFF_REASON_OWNER_RECONCILE_PENDING &&
    runtimePromotionAllowed !== true &&
    pendingHandoffNodeIds.length > ZERO;
  if (projectionAllowed !== true) {
    return PUBLICATION_PROJECTION_NODE_IDS_UNAVAILABLE;
  }
  const residualReconcileProjectionNodeIds =
    pendingHandoffNodeIds.length <=
      PUBLICATION_HANDOFF_RESIDUAL_RECONCILE_PROJECTION_LIMIT ?
      pendingHandoffNodeIds :
      PUBLICATION_PROJECTION_NODE_IDS_UNAVAILABLE;
  return normalizeDistinctStringArray([
    ...parseJsonArrayField(
      publicationConvergence?.[PUBLICATION_PUBLISHED_ACTIVE_NODE_IDS_FIELD],
    ),
    ...parseJsonArrayField(
      publicationConvergence?.[
        PUBLICATION_PUBLISHED_ACTIVE_NODE_IDS_SNAKE_FIELD
      ],
    ),
    ...residualReconcileProjectionNodeIds,
  ]);
}

function countPartialCoveragePublicationGateNodeIds(gate, fieldName) {
  return normalizeDistinctStringArray(gate?.[fieldName]).length;
}

function isPartialCoveragePublicationGateReady(gate = null) {
  if (!gate || typeof gate !== TYPEOF_OBJECT) {
    return false;
  }
  if (gate[PARTIAL_COVERAGE_PUBLICATION_GATE_FIELD.READY] === true) {
    return true;
  }
  return (
    gate[
      PARTIAL_COVERAGE_PUBLICATION_GATE_FIELD.PRIORITY_PARTITION_SUMMARY
    ]?.[PARTIAL_COVERAGE_PUBLICATION_GATE_FIELD.SATISFIED] === true &&
    countPartialCoveragePublicationGateNodeIds(
      gate,
      PARTIAL_COVERAGE_PUBLICATION_GATE_FIELD.PENDING_ACK_NODE_IDS,
    ) === ZERO &&
    countPartialCoveragePublicationGateNodeIds(
      gate,
      PARTIAL_COVERAGE_PUBLICATION_GATE_FIELD.MISSING_PUBLISHED_NODE_IDS,
    ) === ZERO
  );
}

function isPendingOwnerReconcileActiveGateHandoff(handoff = null) {
  if (!handoff || typeof handoff !== TYPEOF_OBJECT) {
    return false;
  }
  const nextAction = normalizeOptionalString(
    handoff[PUBLICATION_HANDOFF_NEXT_ACTION_FIELD] ??
      handoff[PUBLICATION_HANDOFF_NEXT_ACTION_SNAKE_FIELD],
  );
  const pendingReconcileNodeIds =
    normalizeOwnerReconcileHandoffPendingReconcileNodeIds(handoff);
  const pendingRecoveryNodeIds =
    normalizeOwnerReconcileHandoffPendingRecoveryNodeIds(handoff);
  const pendingHandoffNodeIds = normalizeOwnerReconcileHandoffPendingNodeIds(
    handoff,
  );
  const handoffActionHasPendingNodes =
    (
      nextAction ===
        PUBLICATION_HANDOFF_NEXT_ACTION_RECONCILE_OWNER_MEMBERSHIP &&
      pendingReconcileNodeIds.length > ZERO
    ) ||
    (
      nextAction === PUBLICATION_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY &&
      pendingRecoveryNodeIds.length > ZERO
    );
  return (
    normalizeOptionalString(handoff[PUBLICATION_HANDOFF_STATE_FIELD]) ===
      PUBLICATION_HANDOFF_STATE_PENDING &&
    normalizeOptionalString(
      handoff[PUBLICATION_HANDOFF_REASON_CODE_FIELD] ??
        handoff[PUBLICATION_HANDOFF_REASON_CODE_SNAKE_FIELD],
    ) === PUBLICATION_HANDOFF_REASON_OWNER_RECONCILE_PENDING &&
    (
      handoff[PUBLICATION_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FIELD] ??
      handoff[PUBLICATION_HANDOFF_RUNTIME_PROMOTION_ALLOWED_SNAKE_FIELD]
    ) !== true &&
    pendingHandoffNodeIds.length > ZERO &&
    handoffActionHasPendingNodes === true
  );
}

function normalizeOwnerReconcileHandoffPendingReconcileNodeIds(handoff = null) {
  return normalizeDistinctStringArray(
    handoff?.[PUBLICATION_HANDOFF_PENDING_RECONCILE_NODE_IDS_FIELD] ??
      handoff?.[PUBLICATION_HANDOFF_PENDING_RECONCILE_NODE_IDS_SNAKE_FIELD],
  );
}

function normalizeOwnerReconcileHandoffPendingRecoveryNodeIds(handoff = null) {
  return normalizeDistinctStringArray(
    handoff?.[PUBLICATION_HANDOFF_PENDING_RECOVERY_NODE_IDS_FIELD] ??
      handoff?.[PUBLICATION_HANDOFF_PENDING_RECOVERY_NODE_IDS_SNAKE_FIELD],
  );
}

function normalizeOwnerReconcileHandoffPendingNodeIds(handoff = null) {
  const nextAction = normalizeOptionalString(
    handoff?.[PUBLICATION_HANDOFF_NEXT_ACTION_FIELD] ??
      handoff?.[PUBLICATION_HANDOFF_NEXT_ACTION_SNAKE_FIELD],
  );
  const pendingReconcileNodeIds =
    normalizeOwnerReconcileHandoffPendingReconcileNodeIds(handoff);
  const pendingRecoveryNodeIds =
    normalizeOwnerReconcileHandoffPendingRecoveryNodeIds(handoff);
  if (
    nextAction ===
    PUBLICATION_HANDOFF_NEXT_ACTION_RECONCILE_OWNER_MEMBERSHIP
  ) {
    return pendingReconcileNodeIds;
  }
  if (nextAction === PUBLICATION_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY) {
    return pendingRecoveryNodeIds;
  }
  return normalizeDistinctStringArray([
    ...pendingReconcileNodeIds,
    ...pendingRecoveryNodeIds,
  ]);
}

function normalizeOwnerReconcileHandoffMissingNodeIds(handoff = null) {
  return normalizeDistinctStringArray(
    handoff?.[
      PARTIAL_COVERAGE_PUBLICATION_GATE_FIELD.MISSING_PUBLISHED_NODE_IDS
    ],
  );
}

function ownerReconcileHandoffMatchesSelectedMissingPublishedDebt({
  pendingReconcileNodeIds,
  selectedMissingPublishedNodeIds,
  selectedPublicationActiveGateHandoff,
}) {
  if (
    pendingReconcileNodeIds.length >
      PUBLICATION_HANDOFF_RESIDUAL_RECONCILE_PROJECTION_LIMIT
  ) {
    return false;
  }
  if (
    pendingReconcileNodeIds.every((nodeId) =>
      selectedMissingPublishedNodeIds.includes(nodeId),
    ) !== true
  ) {
    return false;
  }
  const handoffMissingPublishedNodeIds =
    normalizeOwnerReconcileHandoffMissingNodeIds(
      selectedPublicationActiveGateHandoff,
    );
  return (
    handoffMissingPublishedNodeIds.length === ZERO ||
    handoffMissingPublishedNodeIds.every((nodeId) =>
      pendingReconcileNodeIds.includes(nodeId) &&
      selectedMissingPublishedNodeIds.includes(nodeId),
    )
  );
}

function canResolveSelectedPendingAckThroughOwnerReconcile({
  publicationConvergenceGate,
  selectedPendingAckNodeIds,
  selectedPublicationActiveGateHandoff,
}) {
  const pendingAckNodeIds = normalizeDistinctStringArray(
    selectedPendingAckNodeIds,
  );
  if (pendingAckNodeIds.length === ZERO) {
    return false;
  }
  if (publicationConvergenceGate?.ready !== true) {
    return false;
  }
  if (
    isPendingOwnerReconcileActiveGateHandoff(
      selectedPublicationActiveGateHandoff,
    ) !== true
  ) {
    return false;
  }
  const pendingReconcileNodeIds = normalizeOwnerReconcileHandoffPendingNodeIds(
    selectedPublicationActiveGateHandoff,
  );
  return pendingAckNodeIds.every((nodeId) =>
    pendingReconcileNodeIds.includes(nodeId),
  );
}

function canResolveSelectedMissingPublishedThroughOwnerReconcile({
  publicationConvergenceGate,
  selectedPendingAckNodeIds,
  selectedMissingPublishedNodeIds,
  selectedPublicationActiveGateHandoff,
}) {
  const pendingAckNodeIds = normalizeDistinctStringArray(
    selectedPendingAckNodeIds,
  );
  const missingPublishedNodeIds = normalizeDistinctStringArray(
    selectedMissingPublishedNodeIds,
  );
  if (
    pendingAckNodeIds.length !== ZERO ||
    missingPublishedNodeIds.length === ZERO
  ) {
    return false;
  }
  if (publicationConvergenceGate?.ready !== true) {
    return false;
  }
  if (
    isPendingOwnerReconcileActiveGateHandoff(
      selectedPublicationActiveGateHandoff,
    ) !== true
  ) {
    return false;
  }
  return ownerReconcileHandoffMatchesSelectedMissingPublishedDebt({
    pendingReconcileNodeIds: normalizeOwnerReconcileHandoffPendingNodeIds(
      selectedPublicationActiveGateHandoff,
    ),
    selectedMissingPublishedNodeIds: missingPublishedNodeIds,
    selectedPublicationActiveGateHandoff,
  });
}

function normalizePartialCoverageConvergenceEvidence({
  readinessMode,
  activeByStatus,
  snapshotCoverage,
  publicationConvergenceGate,
}) {
  const selectedPublicationConvergenceGate =
    snapshotCoverage?.selectedPublicationConvergenceGate &&
      typeof snapshotCoverage.selectedPublicationConvergenceGate ===
        TYPEOF_OBJECT ?
      snapshotCoverage.selectedPublicationConvergenceGate :
      snapshotCoverage?.selectedPublicationConvergence?.publicationRecoveryGate &&
        typeof snapshotCoverage.selectedPublicationConvergence
          .publicationRecoveryGate === TYPEOF_OBJECT ?
        snapshotCoverage.selectedPublicationConvergence
          .publicationRecoveryGate :
        null;
  const bestCoverageNodeCount =
    Number.isInteger(snapshotCoverage?.bestCoverageNodeCount) ?
      Math.max(ZERO, snapshotCoverage.bestCoverageNodeCount) :
      ZERO;
  const selectedPendingAckNodeIds = normalizeDistinctStringArray(
    snapshotCoverage?.selectedPendingAckNodeIds,
  );
  const selectedMissingPublishedNodeIds = normalizeDistinctStringArray(
    snapshotCoverage?.selectedMissingPublishedNodeIds,
  );
  const selectedPublicationActiveGateHandoff =
    snapshotCoverage?.selectedPublicationActiveGateHandoff &&
      typeof snapshotCoverage.selectedPublicationActiveGateHandoff ===
        TYPEOF_OBJECT ?
      snapshotCoverage.selectedPublicationActiveGateHandoff :
      snapshotCoverage?.selectedActiveGateOwnerCohort &&
        typeof snapshotCoverage.selectedActiveGateOwnerCohort ===
          TYPEOF_OBJECT ?
        snapshotCoverage.selectedActiveGateOwnerCohort :
        null;
  const selectedTimeoutOwnerRecoveryEvidence =
    normalizeSelectedSnapshotTimeoutOwnerRecoveryEvidence(snapshotCoverage);
  const selectedTimeoutOwnerRecoveryOutcome =
    decideSelectedSnapshotTimeoutOwnerRecoveryProjection(
      selectedTimeoutOwnerRecoveryEvidence,
    );
  const selectedPendingAckResolvedByOwnerReconcile =
    canResolveSelectedPendingAckThroughOwnerReconcile({
      publicationConvergenceGate,
      selectedPendingAckNodeIds,
      selectedPublicationActiveGateHandoff,
    });
  const selectedMissingPublishedResolvedByOwnerReconcile =
    canResolveSelectedMissingPublishedThroughOwnerReconcile({
      publicationConvergenceGate,
      selectedPendingAckNodeIds,
      selectedMissingPublishedNodeIds,
      selectedPublicationActiveGateHandoff,
    });
  const selectedSnapshotErrorPresent =
    typeof normalizeOptionalString(snapshotCoverage?.selectedError) ===
      TYPEOF_STRING;
  const selectedSnapshotAdminReady =
    snapshotCoverage?.selectedAdminReady === true ||
    snapshotCoverage?.selectedSnapshotAdminReady === true;
  return Object.freeze({
    readinessMode,
    activeByStatus: activeByStatus === true,
    publicationGateReady: publicationConvergenceGate?.ready === true,
    snapshotCoverageComplete: snapshotCoverage?.completeCoverage === true,
    bestCoverageNodeCount,
    selectedSnapshotAdminReady,
    selectedSnapshotErrorPresent,
    selectedPublicationGateReady:
      isPartialCoveragePublicationGateReady(
        selectedPublicationConvergenceGate,
      ) ||
      selectedPendingAckResolvedByOwnerReconcile ||
      selectedMissingPublishedResolvedByOwnerReconcile,
    selectedPendingAckCount:
      selectedPendingAckResolvedByOwnerReconcile === true ?
        ZERO :
        selectedPendingAckNodeIds.length,
    selectedMissingPublishedCount: selectedMissingPublishedNodeIds.length,
    selectedSnapshotTimeoutOwnerRecoveryProjectionReady:
      selectedTimeoutOwnerRecoveryOutcome.project === true,
    selectedPendingRecoveryCount:
      selectedTimeoutOwnerRecoveryEvidence.pendingRecoveryNodeCount,
  });
}

function decidePartialCoverageConvergence(evidence) {
  const decision = PARTIAL_COVERAGE_CONVERGENCE_DECISION_TABLE.find(
    (candidate) => candidate.matches(evidence),
  );
  return decision?.outcome || PARTIAL_COVERAGE_CONVERGENCE_OUTCOME_KEEP;
}

function normalizeReadinessTimeoutEvidence({
  attemptedReadinessProbe,
  error,
  readinessMode,
}) {
  return Object.freeze({
    attemptedReadinessProbe: attemptedReadinessProbe === true,
    timeoutShaped: isTimeoutShapedProbeError(error),
    readinessMode,
  });
}

function buildReadinessTimeoutReason(error, readinessMode) {
  const reasonPrefix =
    readinessMode === CLUSTER_READINESS_MODE_STARTUP ?
      ACTIVE_PROBE_REASON_READINESS_TIMEOUT_PREFIX :
      ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX;
  return reasonPrefix + String(normalizeProbeError(error));
}

export {
  buildReadinessTimeoutReason,
  decidePartialCoverageConvergence,
  decideSelectedSnapshotTimeoutOwnerRecoveryProjection,
  extractPublicationProjectionNodeIds,
  normalizeOptionalString,
  normalizePartialCoverageConvergenceEvidence,
  normalizeReadinessTimeoutEvidence,
  normalizeSelectedSnapshotTimeoutOwnerRecoveryEvidence,
};
