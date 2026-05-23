import {CLUSTER_SEGMENT_1} from './cluster-segment-1.js';
const {
  ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK,
  ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
  ACTIVE_PROBE_REASON_CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
  ACTIVE_PROBE_REASON_PRIORITY_RECOVERY_PENDING,
  ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING,
  ACTIVE_PROBE_REASON_PUBLICATION_CONVERGENCE_MISSING,
  ACTIVE_PROBE_REASON_PUBLICATION_MISSING_ACTIVE_NODE_PREFIX,
  ACTIVE_PROBE_REASON_PUBLICATION_NOT_PUBLISHED_PREFIX,
  ACTIVE_PROBE_REASON_PUBLICATION_PENDING_ACK_PREFIX,
  ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX,
  ACTIVE_WAIT_BLOCKER_INACTIVE_NODES_PREFIX,
  ACTIVE_WAIT_BLOCKER_PRIORITY_RECOVERY_PROGRESS_CLASS_PREFIX,
  ACTIVE_WAIT_BLOCKER_PUBLICATION_GATE_PREFIX,
  ACTIVE_WAIT_BLOCKER_READY,
  ACTIVE_WAIT_BLOCKER_SNAPSHOT_COVERAGE_PREFIX,
  ACTIVE_WAIT_BLOCKER_SNAPSHOT_ERROR,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_BOOTSTRAP_JOIN_DURING_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_TRAFFIC_GATE_DURING_PRIORITY_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_BOOTSTRAP_JOIN_DURING_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_TRAFFIC_GATE_DURING_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
  ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS,
  ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING,
  ACTIVE_WAIT_PUBLICATION_STATUS_PREPARED,
  ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED,
  ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHING,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_READINESS_MODE_STARTUP,
  INVARIANT_SEVERITY,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
  buildPublicationRecoveryGateSnapshot,
  classifyActiveGateClosureWitness,
  classifyActiveGateReadinessDelay,
  CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
  CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  UNKNOWN_STATE,
  ZERO,
  resolvePositiveTimeoutMs,
} = CLUSTER_SEGMENT_1;

const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const TYPEOF_FUNCTION = 'function';
const PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD = Object.freeze({
  COMPLETED_AT_MS: 'completedAtMs',
  CREATED_AT_MS: 'createdAtMs',
  LAST_PROGRESS_AT_MS: 'lastProgressAtMs',
  TARGET_SERVICE_PROGRESS_AT_MS: 'targetServiceProgressAtMs',
  UPDATED_AT_MS: 'updatedAtMs',
});
const PUBLICATION_CONVERGENCE_GATE_EMPTY_RECORD = Object.freeze({});
const PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT = Object.freeze({
  BLOCKED: 'blocked',
  DETAIL_SEPARATOR: '#',
  EMPTY: '',
  MISSING_PUBLISHED_PREFIX: 'missingPublished=',
  NONE: 'none',
  OBJECT_TYPE: 'object',
  PENDING_ACK_PREFIX: 'pendingAck=',
  READY: 'ready',
  REASON_SEPARATOR: ',',
  RECOVERY_PREFIX: 'recovery=',
  REASONS: 'reasons',
  STATUS_PREFIX: 'status=',
  STRING_TYPE: 'string',
});
const ACTIVE_WAIT_DIAGNOSTIC_TEXT = Object.freeze({
  ADMIN_READY_PREFIX: '#adminReady=',
  CAPTURED_AT_PREFIX: '#ts=',
  COUNT_SEPARATOR: '/',
  ENTRY_SEPARATOR: ', ',
  ERROR_STATE_PREFIX: '=error:',
  KEY_VALUE_SEPARATOR: ':',
  NODE_ACTIVE_SUFFIX: '=active',
  NODE_STATE_SEPARATOR: '=',
  PRIORITY_RECOVERY_PREFIX: '#priorityRecovery=',
  PRIORITY_SPREAD_PENDING: '#prioritySpread=pending',
  PRIORITY_SPREAD_READY: '#prioritySpread=ready',
  PROBE_TIMEOUT_PREFIX: '#probeMs=',
  PUBLICATION_EPOCH_PREFIX: '#epoch=',
  PUBLICATION_MISSING_PREFIX: '#missingPublished=',
  PUBLICATION_PENDING_ACK_PREFIX: '#pendingAck=',
  PUBLICATION_STATUS_PREFIX: '#pub=',
  REACHABILITY_ERROR_PREFIX: '#adminError=',
  REACHABILITY_TIMEOUT_PREFIX: '#reachabilityProbeMs=',
  REACHABLE_BY_PREFIX: '#via=',
  SELECTED_NODE_PREFIX: '@',
  UNKNOWN_NODE_ID: 'unknown-node',
});
const ACTIVE_WAIT_PUBLICATION_STATUS_UNKNOWN = UNKNOWN_STATE;
const ACTIVE_WAIT_PUBLICATION_STATUS_RANK = Object.freeze({
  PUBLISHED: 3,
  ACK_PENDING: 2,
  PUBLISHING_OR_PREPARED: 1,
});
const ACTIVE_WAIT_PUBLICATION_CONVERGENCE_REASONS_EMPTY = Object.freeze([]);
const ACTIVE_WAIT_BLOCKER_SIGNATURE_SEPARATOR = '|';
const PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN = UNKNOWN_STATE;
const PRIORITY_RECOVERY_DECISION_SNAPSHOT_UNKNOWN_EPOCH = -1;
const PUBLICATION_CONVERGENCE_GATE_SUMMARY_DECISION_TABLE = Object.freeze([
  Object.freeze({
    summary: PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.NONE,
    matches: (evidence) => evidence.recordPresent !== true,
  }),
  Object.freeze({
    summary: PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.REASONS,
    matches: (evidence) => evidence.reasons.length > ZERO,
  }),
  Object.freeze({
    summary: PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.BLOCKED,
    matches: (evidence) => evidence.openDebtPresent === true,
  }),
  Object.freeze({
    summary: PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.READY,
    matches: (evidence) => evidence.ready === true,
  }),
  Object.freeze({
    summary: PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.BLOCKED,
    matches: () => true,
  }),
]);
const ACTIVE_WAIT_RECOVERY_PROTOCOL_STATE = Object.freeze({
  STEADY_PUBLISHED: 'steady_published',
});
const ACTIVE_GATE_OWNER_COHORT_FIELD = Object.freeze({
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME:
    'membershipPublicationHandoffOutcome',
  MISSING_PUBLISHED_COUNT: 'missingPublishedCount',
  MISSING_PUBLISHED_NODE_IDS: 'missingPublishedNodeIds',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  PENDING_RECOVERY_COUNT: 'pendingRecoveryCount',
  PENDING_RECOVERY_NODE_IDS: 'pendingRecoveryNodeIds',
  PENDING_RECONCILE_COUNT: 'pendingReconcileCount',
  PENDING_RECONCILE_NODE_IDS: 'pendingReconcileNodeIds',
  REASON_CODE: 'reasonCode',
  NEXT_ACTION: 'nextAction',
  RUNTIME_PROMOTION_ALLOWED: 'runtimePromotionAllowed',
  STATE: 'state',
});
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD = Object.freeze({
  ENQUEUED: 'enqueued',
  REASON_CODE: 'reasonCode',
  RETRY_AFTER_MS: 'retryAfterMs',
  STATE: 'state',
});

/**
 * Preserve a small but meaningful timeout floor for deadline-driven
 * observation probes so the last ACTIVE-wait attempt does not collapse into a
 * synthetic 1ms timeout classification.
 * @param {number} deadline
 * @param {number} maxTimeoutMs
 * @param {number} minimumTimeoutMs
 * @returns {number}
 */
function resolveMeaningfulProbeTimeoutMs(
  deadline,
  maxTimeoutMs,
  minimumTimeoutMs = MIN_TIMEOUT_MS,
) {
  const boundedMinimumTimeoutMs = resolvePositiveTimeoutMs(
    minimumTimeoutMs,
    MIN_TIMEOUT_MS,
  );
  const remainingBudgetMs = Math.max(
    boundedMinimumTimeoutMs,
    Math.floor(Number(deadline) - Date.now()),
  );
  return Math.min(
    Math.max(
      boundedMinimumTimeoutMs,
      Math.floor(maxTimeoutMs || boundedMinimumTimeoutMs),
    ),
    remainingBudgetMs,
  );
}

function normalizeDistinctStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [
    ...new Set(
      values
        .map((value) => String(value || PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY).trim())
        .filter((value) => value.length > ZERO),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function normalizeFirstNonEmptyDistinctStringArray(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeDistinctStringArray(candidate);
    if (normalized.length > ZERO) {
      return normalized;
    }
  }
  return [];
}

function normalizeActiveGateOwnerCohortRecord(value) {
  return value && typeof value === TYPEOF_OBJECT && !Array.isArray(value) ?
    value :
    null;
}

function normalizeActiveGateOwnerCohortString(value) {
  return typeof value === TYPEOF_STRING && value.length > ZERO ? value : null;
}

function normalizeActiveGateOwnerCohortNodeIds(record, fieldName) {
  return normalizeDistinctStringArray(record?.[fieldName]);
}

function normalizeActiveGateOwnerCohortCount(record, countField, nodeIds) {
  const explicitCount =
    Number.isInteger(record?.[countField]) && record[countField] >= ZERO ?
      record[countField] :
      ZERO;
  return Math.max(nodeIds.length, explicitCount);
}

function resolveSteadyPublishedSelectedMissingCount({
  expectedNodeCount = ZERO,
  publicationStatus = PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY,
  recoveryProtocolState = null,
  priorityPartitionSummary = null,
  pendingAckNodeIds = [],
  selectedPublishedActiveNodeIds = [],
  selectedMissingPublishedNodeIds = [],
} = {}) {
  const normalizedExpectedNodeCount =
    Number.isInteger(expectedNodeCount) && expectedNodeCount > ZERO ?
      expectedNodeCount :
      ZERO;
  const normalizedPendingAckNodeIds =
    normalizeDistinctStringArray(pendingAckNodeIds);
  const normalizedSelectedPublishedActiveNodeIds =
    normalizeDistinctStringArray(selectedPublishedActiveNodeIds);
  const normalizedSelectedMissingPublishedNodeIds =
    normalizeDistinctStringArray(selectedMissingPublishedNodeIds);
  const steadyPublishedSelection =
    publicationStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED &&
    normalizedPendingAckNodeIds.length === ZERO &&
    normalizedSelectedPublishedActiveNodeIds.length > ZERO &&
    normalizedSelectedMissingPublishedNodeIds.length > ZERO &&
    normalizedSelectedPublishedActiveNodeIds.length +
      normalizedSelectedMissingPublishedNodeIds.length ===
      normalizedExpectedNodeCount &&
    (
      recoveryProtocolState ===
        ACTIVE_WAIT_RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED ||
      priorityPartitionSummary?.satisfied === true
    );
  return steadyPublishedSelection === true ?
    normalizedSelectedMissingPublishedNodeIds.length :
    ZERO;
}

function resolveStartupPublicationLagSelectedMissingCount({
  readinessMode = UNKNOWN_STATE,
  expectedNodeCount = ZERO,
  publicationStatus = PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY,
  pendingAckNodeIds = [],
  selectedPublishedActiveNodeIds = [],
  selectedMissingPublishedNodeIds = [],
} = {}) {
  const normalizedExpectedNodeCount =
    Number.isInteger(expectedNodeCount) && expectedNodeCount > ZERO ?
      expectedNodeCount :
      ZERO;
  const normalizedPendingAckNodeIds =
    normalizeDistinctStringArray(pendingAckNodeIds);
  const normalizedSelectedPublishedActiveNodeIds =
    normalizeDistinctStringArray(selectedPublishedActiveNodeIds);
  const normalizedSelectedMissingPublishedNodeIds =
    normalizeDistinctStringArray(selectedMissingPublishedNodeIds);
  const startupPublicationLagSelection =
    readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
    publicationStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED &&
    normalizedPendingAckNodeIds.length === ZERO &&
    normalizedSelectedPublishedActiveNodeIds.length > ZERO &&
    normalizedSelectedMissingPublishedNodeIds.length > ZERO &&
    normalizedSelectedPublishedActiveNodeIds.length +
      normalizedSelectedMissingPublishedNodeIds.length ===
      normalizedExpectedNodeCount;
  return startupPublicationLagSelection === true ?
    normalizedSelectedMissingPublishedNodeIds.length :
    ZERO;
}

/**
 * Resolve/reject with timeout protection for potentially hanging operations.
 * @param {Promise<*>} promise
 * @param {number} timeoutMs
 * @param {string} timeoutMessage
 * @returns {Promise<*>}
 */
function withTimeout(promise, timeoutMs, timeoutMessage) {
  const boundedTimeoutMs = Math.max(MIN_TIMEOUT_MS, Number(timeoutMs) || ZERO);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(timeoutMessage));
    }, boundedTimeoutMs);
    if (typeof timer.unref === TYPEOF_FUNCTION) {
      timer.unref();
    }
    Promise.resolve(promise)
      .then((result) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Format count-map entries as "key:value" pairs for diagnostic errors.
 * @param {Map<string|number, number>} counts
 * @returns {string}
 */
function formatCountSummary(counts) {
  return Array.from(counts.entries())
    .map(([key, count]) =>
      String(key) +
        ACTIVE_WAIT_DIAGNOSTIC_TEXT.KEY_VALUE_SEPARATOR +
        String(count))
    .join(ACTIVE_WAIT_DIAGNOSTIC_TEXT.ENTRY_SEPARATOR);
}

/**
 * Format node diagnostics into compact "node=state" entries.
 * @param {Array<Object>} nodeDiagnostics
 * @returns {string}
 */
function formatNodeDiagnostics(nodeDiagnostics = []) {
  return nodeDiagnostics
    .map((diagnostic) => {
      const nodeId = String(
        diagnostic.nodeId || ACTIVE_WAIT_DIAGNOSTIC_TEXT.UNKNOWN_NODE_ID,
      );
      if (diagnostic.active === true) {
        return nodeId + ACTIVE_WAIT_DIAGNOSTIC_TEXT.NODE_ACTIVE_SUFFIX;
      }
      if (
        typeof diagnostic.error === TYPEOF_STRING &&
        diagnostic.error.length > ZERO
      ) {
        return nodeId +
          ACTIVE_WAIT_DIAGNOSTIC_TEXT.ERROR_STATE_PREFIX +
          diagnostic.error;
      }
      const stateValue =
        typeof diagnostic.state === TYPEOF_STRING &&
        diagnostic.state.length > ZERO ?
          diagnostic.state :
          UNKNOWN_STATE;
      return nodeId +
        ACTIVE_WAIT_DIAGNOSTIC_TEXT.NODE_STATE_SEPARATOR +
        stateValue;
    })
    .join(ACTIVE_WAIT_DIAGNOSTIC_TEXT.ENTRY_SEPARATOR);
}

/**
 * Format control snapshot coverage summary.
 * @param {Object|null} snapshotCoverage
 * @returns {string}
 */
function formatSnapshotCoverage(snapshotCoverage) {
  if (!snapshotCoverage || typeof snapshotCoverage !== TYPEOF_OBJECT) {
    return PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.NONE;
  }
  const expectedNodeCount = Number(snapshotCoverage.expectedNodeCount) || ZERO;
  const bestCoverageNodeCount =
    Number(snapshotCoverage.bestCoverageNodeCount) || ZERO;
  const selectedNodeId =
    typeof snapshotCoverage.selectedNodeId === TYPEOF_STRING &&
    snapshotCoverage.selectedNodeId.length > ZERO ?
      snapshotCoverage.selectedNodeId :
      null;
  const selectedCapturedAtMs = Number.isFinite(
    snapshotCoverage.selectedCapturedAtMs,
  ) ?
    Math.floor(snapshotCoverage.selectedCapturedAtMs) :
    null;
  const selectedAdminReady =
    snapshotCoverage.selectedAdminReady === true ?
      true :
      snapshotCoverage.selectedAdminReady === false ?
        false :
        null;
  const selectedReachableBy =
    typeof snapshotCoverage.selectedReachableBy === TYPEOF_STRING &&
    snapshotCoverage.selectedReachableBy.length > ZERO ?
      snapshotCoverage.selectedReachableBy :
      null;
  const selectedReachabilityError =
    typeof snapshotCoverage.selectedReachabilityError === TYPEOF_STRING &&
    snapshotCoverage.selectedReachabilityError.length > ZERO ?
      snapshotCoverage.selectedReachabilityError :
      null;
  const selectedSnapshotTimeoutMs = Number.isFinite(
    snapshotCoverage.selectedSnapshotTimeoutMs,
  ) ?
    Math.max(
      MIN_TIMEOUT_MS,
      Math.floor(snapshotCoverage.selectedSnapshotTimeoutMs),
    ) :
    null;
  const selectedReachabilityTimeoutMs = Number.isFinite(
    snapshotCoverage.selectedReachabilityTimeoutMs,
  ) ?
    Math.max(
      MIN_TIMEOUT_MS,
      Math.floor(snapshotCoverage.selectedReachabilityTimeoutMs),
    ) :
    null;
  const selectedPublicationConvergence =
    snapshotCoverage.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === TYPEOF_OBJECT ?
      snapshotCoverage.selectedPublicationConvergence :
      null;
  const publicationEpoch = Number.isFinite(
    selectedPublicationConvergence?.publicationEpoch,
  ) ?
    Math.floor(selectedPublicationConvergence.publicationEpoch) :
    null;
  const publicationStatus =
    typeof selectedPublicationConvergence?.publicationStatus === TYPEOF_STRING ?
      selectedPublicationConvergence.publicationStatus.toUpperCase() :
      null;
  const pendingAckCount = Array.isArray(
    selectedPublicationConvergence?.pendingAckNodeIds,
  ) ?
    selectedPublicationConvergence.pendingAckNodeIds.length :
    ZERO;
  const missingPublishedCount = Array.isArray(
    snapshotCoverage?.selectedMissingPublishedNodeIds,
  ) ?
    snapshotCoverage.selectedMissingPublishedNodeIds.length :
    ZERO;
  const prioritySpreadSatisfied =
    selectedPublicationConvergence?.priorityPartitionSummary &&
    typeof selectedPublicationConvergence.priorityPartitionSummary ===
      TYPEOF_OBJECT ?
      selectedPublicationConvergence.priorityPartitionSummary.satisfied :
      null;
  const priorityRecoveryProgressClassCount =
    summarizePriorityRecoveryProgressClasses(
      snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots || null,
    ).unresolvedClassCount;
  return (
    String(bestCoverageNodeCount) +
    ACTIVE_WAIT_DIAGNOSTIC_TEXT.COUNT_SEPARATOR +
    String(expectedNodeCount) +
    (selectedNodeId ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.SELECTED_NODE_PREFIX + selectedNodeId :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (selectedCapturedAtMs !== null ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.CAPTURED_AT_PREFIX +
        String(selectedCapturedAtMs) :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (selectedAdminReady !== null ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.ADMIN_READY_PREFIX +
        String(selectedAdminReady) :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (selectedReachableBy ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.REACHABLE_BY_PREFIX + selectedReachableBy :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (selectedReachabilityError ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.REACHABILITY_ERROR_PREFIX +
        selectedReachabilityError :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (selectedSnapshotTimeoutMs !== null &&
    selectedSnapshotTimeoutMs < CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PROBE_TIMEOUT_PREFIX +
        String(selectedSnapshotTimeoutMs) :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (selectedReachabilityTimeoutMs !== null &&
    selectedReachabilityTimeoutMs <
      CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.REACHABILITY_TIMEOUT_PREFIX +
        String(selectedReachabilityTimeoutMs) :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (publicationEpoch !== null ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PUBLICATION_EPOCH_PREFIX +
        String(publicationEpoch) :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (publicationStatus ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PUBLICATION_STATUS_PREFIX +
        publicationStatus :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (pendingAckCount > ZERO ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PUBLICATION_PENDING_ACK_PREFIX +
        String(pendingAckCount) :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (missingPublishedCount > ZERO ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PUBLICATION_MISSING_PREFIX +
        String(missingPublishedCount) :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (prioritySpreadSatisfied === false ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PRIORITY_SPREAD_PENDING :
      prioritySpreadSatisfied === true ?
        ACTIVE_WAIT_DIAGNOSTIC_TEXT.PRIORITY_SPREAD_READY :
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY) +
    (Number.isInteger(priorityRecoveryProgressClassCount) &&
    priorityRecoveryProgressClassCount > ZERO ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PRIORITY_RECOVERY_PREFIX +
        String(priorityRecoveryProgressClassCount) :
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY)
  );
}

/**
 * Evaluate whether load-mode startup can trust published membership convergence.
 * @param {Object|null} snapshotCoverage
 * @param {string[]} expectedNodeIds
 * @returns {Object}
 */
function evaluateLoadPublishedConvergence(
  snapshotCoverage,
  expectedNodeIds = [],
) {
  const expectedPublishedNodeIds =
    normalizeDistinctStringArray(expectedNodeIds);
  const selectedPriorityRecoveryDecisionSnapshots =
    snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots &&
    typeof snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots ===
      'object' ?
      snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots :
      null;
  const selectedPublicationConvergenceGate =
    snapshotCoverage?.selectedPublicationConvergenceGate &&
    typeof snapshotCoverage.selectedPublicationConvergenceGate === 'object' ?
      snapshotCoverage.selectedPublicationConvergenceGate :
      null;
  const publicationConvergence =
    snapshotCoverage?.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === 'object' ?
      snapshotCoverage.selectedPublicationConvergence :
      null;
  const publicationActiveGateHandoff = normalizeActiveGateOwnerCohortRecord(
    snapshotCoverage?.selectedPublicationActiveGateHandoff,
  );
  const publicationActiveGateHandoffPublishedActiveNodeIds =
    normalizeActiveGateOwnerCohortNodeIds(
      publicationActiveGateHandoff,
      ACTIVE_GATE_OWNER_COHORT_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
    );
  const publicationActiveGateHandoffMissingPublishedNodeIds =
    normalizeActiveGateOwnerCohortNodeIds(
      publicationActiveGateHandoff,
      ACTIVE_GATE_OWNER_COHORT_FIELD.MISSING_PUBLISHED_NODE_IDS,
    );
  const publicationRecoveryGate = selectedPublicationConvergenceGate ?
    buildPublicationRecoveryGateSnapshot({
      ...selectedPublicationConvergenceGate,
      publicationStatus:
        selectedPublicationConvergenceGate.publicationStatus ??
        publicationConvergence?.publicationStatus ??
        publicationConvergence?.status,
      recoveryProtocolState:
        selectedPublicationConvergenceGate.recoveryProtocolState,
      priorityRecoveryReasonCodes:
        selectedPublicationConvergenceGate.priorityRecoveryReasonCodes ??
        selectedPublicationConvergenceGate.reasonCodes,
      priorityPartitionSummary:
        selectedPublicationConvergenceGate.priorityPartitionSummary,
      priorityRecoveryDecisionSnapshots:
        selectedPriorityRecoveryDecisionSnapshots,
      priorityRecoveryClosureWitness:
        selectedPriorityRecoveryDecisionSnapshots?.closureWitness || null,
      pendingAckNodeIds:
        selectedPublicationConvergenceGate.pendingAckNodeIds,
      missingPublishedNodeIds:
        selectedPublicationConvergenceGate.missingPublishedNodeIds,
    }) :
    buildPublicationRecoveryGateSnapshot({
      publicationStatus:
        publicationConvergence?.publicationStatus ??
        publicationConvergence?.status,
      recoveryProtocolState: publicationConvergence?.recoveryProtocolState,
      priorityRecoveryReasonCodes:
        publicationConvergence?.priorityRecoveryReasonCodes,
      priorityPartitionSummary:
        publicationConvergence?.priorityPartitionSummary,
      priorityRecoveryDecisionSnapshots:
        selectedPriorityRecoveryDecisionSnapshots,
      priorityRecoveryClosureWitness:
        selectedPriorityRecoveryDecisionSnapshots?.closureWitness || null,
      pendingAckNodeIds: publicationConvergence?.pendingAckNodeIds,
    });
  const publicationStatus =
    typeof publicationRecoveryGate?.publicationStatusNormalized === 'string' &&
    publicationRecoveryGate.publicationStatusNormalized.length > ZERO ?
      publicationRecoveryGate.publicationStatusNormalized :
      typeof publicationConvergence?.publicationStatus === 'string' ?
        publicationConvergence.publicationStatus.toUpperCase() :
        null;
  const publishedActiveNodeIds = normalizeFirstNonEmptyDistinctStringArray(
    publicationConvergence?.publishedActiveNodeIds,
    publicationActiveGateHandoffPublishedActiveNodeIds,
  );
  const recoveryActiveNodeIds = normalizeFirstNonEmptyDistinctStringArray(
    publicationConvergence?.recoveryActiveNodeIds,
    publicationConvergence?.membershipLifecycleSummary?.recoveryActiveNodeIds,
    publicationConvergence?.membershipLifecycleSummary?.locallyEligibleNodeIds,
    publicationConvergence?.membershipLifecycleSummary?.projectedServingNodeIds,
    publicationConvergence?.publishedActiveNodeIds,
    publicationActiveGateHandoffPublishedActiveNodeIds,
  );
  const pendingAckNodeIds = normalizeDistinctStringArray(
    publicationRecoveryGate?.pendingAckNodeIds ??
      publicationConvergence?.pendingAckNodeIds,
  );
  const recoveryProtocolState =
    typeof publicationRecoveryGate?.recoveryProtocolState === 'string' &&
    publicationRecoveryGate.recoveryProtocolState.length > ZERO ?
      publicationRecoveryGate.recoveryProtocolState :
      typeof publicationConvergence?.recoveryProtocolState === 'string' &&
          publicationConvergence.recoveryProtocolState.length > ZERO ?
        publicationConvergence.recoveryProtocolState :
        null;
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    publicationRecoveryGate?.reasonCodes ??
      publicationConvergence?.priorityRecoveryReasonCodes,
  );
  const priorityPartitionSummary =
    publicationRecoveryGate?.priorityPartitionSummary &&
    typeof publicationRecoveryGate.priorityPartitionSummary === 'object' ?
      publicationRecoveryGate.priorityPartitionSummary :
      publicationConvergence?.priorityPartitionSummary &&
          typeof publicationConvergence.priorityPartitionSummary === 'object' ?
        publicationConvergence.priorityPartitionSummary :
        null;
  const requiredPublishedNodeIds = normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(publicationRecoveryGate?.requiredAckNodeIds),
    ...normalizeDistinctStringArray(
      publicationRecoveryGate?.acknowledgedNodeIds,
    ),
    ...normalizeDistinctStringArray(publicationRecoveryGate?.pendingAckNodeIds),
    ...normalizeDistinctStringArray(
      publicationRecoveryGate?.missingPublishedNodeIds,
    ),
    ...normalizeDistinctStringArray(publicationConvergence?.requiredAckNodeIds),
    ...normalizeDistinctStringArray(
      publicationConvergence?.acknowledgedNodeIds,
    ),
    ...normalizeDistinctStringArray(publicationConvergence?.pendingAckNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence?.publishedActiveNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence?.recoveryActiveNodeIds),
    ...normalizeDistinctStringArray(
      publicationConvergence?.membershipLifecycleSummary?.recoveryActiveNodeIds,
    ),
    ...normalizeDistinctStringArray(
      publicationConvergence?.membershipLifecycleSummary?.locallyEligibleNodeIds,
    ),
    ...normalizeDistinctStringArray(
      publicationConvergence?.membershipLifecycleSummary?.projectedServingNodeIds,
    ),
    ...publicationActiveGateHandoffPublishedActiveNodeIds,
    ...publicationActiveGateHandoffMissingPublishedNodeIds,
  ]);
  const effectivePublishedNodeIds =
    requiredPublishedNodeIds.length > ZERO ?
      requiredPublishedNodeIds :
      expectedPublishedNodeIds;
  const missingPublishedNodeIds = effectivePublishedNodeIds.filter((nodeId) => {
    return !publishedActiveNodeIds.includes(nodeId);
  });
  const publicationRecoveryGateMissingPublishedNodeIds =
    normalizeDistinctStringArray(publicationRecoveryGate?.missingPublishedNodeIds);
  const effectiveMissingPublishedNodeIds = normalizeDistinctStringArray([
    ...missingPublishedNodeIds,
    ...publicationRecoveryGateMissingPublishedNodeIds,
  ]);
  const publicationActiveGateHandoffMissingPublishedCount =
    normalizeActiveGateOwnerCohortCount(
      publicationActiveGateHandoff,
      ACTIVE_GATE_OWNER_COHORT_FIELD.MISSING_PUBLISHED_COUNT,
      publicationActiveGateHandoffMissingPublishedNodeIds,
    );
  const publicationActiveGateHandoffCoversExpectedNodes =
    publicationActiveGateHandoff !== null &&
    expectedPublishedNodeIds.length > ZERO &&
    publicationActiveGateHandoffPublishedActiveNodeIds.length >=
      expectedPublishedNodeIds.length &&
    publicationActiveGateHandoffMissingPublishedCount === ZERO &&
    pendingAckNodeIds.length === ZERO;
  const reasons = Array.from(ACTIVE_WAIT_PUBLICATION_CONVERGENCE_REASONS_EMPTY);

  if (
    !publicationConvergence &&
    !selectedPublicationConvergenceGate &&
    publicationActiveGateHandoffCoversExpectedNodes !== true
  ) {
    reasons.push(ACTIVE_PROBE_REASON_PUBLICATION_CONVERGENCE_MISSING);
  }
  if (
    publicationStatus !== ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED &&
    publicationActiveGateHandoffCoversExpectedNodes !== true
  ) {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_NOT_PUBLISHED_PREFIX +
        String(publicationStatus || UNKNOWN_STATE),
    );
  }
  if (pendingAckNodeIds.length > ZERO) {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_PENDING_ACK_PREFIX +
        String(pendingAckNodeIds.length),
    );
  }
  const missingRecoveryActiveNodeIds = effectivePublishedNodeIds.filter(
    (nodeId) => !recoveryActiveNodeIds.includes(nodeId),
  );
  for (const nodeId of missingRecoveryActiveNodeIds) {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_MISSING_ACTIVE_NODE_PREFIX + nodeId,
    );
  }
  for (const nodeId of effectiveMissingPublishedNodeIds) {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_MISSING_ACTIVE_NODE_PREFIX + nodeId,
    );
  }
  if (publicationRecoveryGate.prioritySpreadPending === true) {
    reasons.push(ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING);
  }

  return {
    ready: reasons.length === ZERO,
    reasons: Object.freeze(reasons),
    publicationStatus,
    closureRecordId: publicationRecoveryGate?.closureRecordId || null,
    closureWitnessClass: publicationRecoveryGate?.closureWitnessClass || null,
    publicationRecoveryGate,
    recoveryProtocolState,
    priorityRecoveryReasonCodes,
    priorityRecoveryDecisionSnapshots: selectedPriorityRecoveryDecisionSnapshots,
    recoveryActiveNodeIds,
    recoveryActiveNodeSource:
      typeof publicationConvergence?.recoveryActiveNodeSource ===
        TYPEOF_STRING &&
      publicationConvergence.recoveryActiveNodeSource.length > ZERO ?
        publicationConvergence.recoveryActiveNodeSource :
        null,
    pendingAckNodeIds,
    missingPublishedNodeIds: effectiveMissingPublishedNodeIds,
    missingRecoveryActiveNodeIds,
    priorityPartitionSummary,
  };
}

function evaluatePriorityRecoveryCrossServiceInvariants(options = {}) {
  const readinessMode =
    options.readinessMode === CLUSTER_READINESS_MODE_LOAD ?
      CLUSTER_READINESS_MODE_LOAD :
      CLUSTER_READINESS_MODE_STARTUP;
  const publicationConvergenceGate =
    options.publicationConvergenceGate &&
    typeof options.publicationConvergenceGate === 'object' ?
      options.publicationConvergenceGate :
      {ready: true, reasons: []};
  const gateReasons = normalizeDistinctStringArray(
    publicationConvergenceGate.reasons,
  );
  const nodeDiagnostics = Array.isArray(options.nodeDiagnostics) ?
    options.nodeDiagnostics :
    [];
  const prioritySpreadPending = gateReasons.includes(
    ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING,
  );
  const bootstrapAdmittedNodeIds = nodeDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic?.active === true &&
        diagnostic?.activitySource ===
          ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const trafficBlockedNodeIds = nodeDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic?.activitySource ===
          ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS &&
        diagnostic?.active === false,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const trafficPriorityRecoveryBlockedNodeIds = nodeDiagnostics
    .filter((diagnostic) => {
      if (
        diagnostic?.activitySource !==
          ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS ||
        diagnostic?.active !== false
      ) {
        return false;
      }
      const reasons = normalizeDistinctStringArray(diagnostic?.reasons);
      return (
        reasons.includes(ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING) ||
        reasons.includes(ACTIVE_PROBE_REASON_PRIORITY_RECOVERY_PENDING) ||
        reasons.includes(
          ACTIVE_PROBE_REASON_CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
        )
      );
    })
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const trafficAdmittedNodeIds = nodeDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic?.activitySource ===
          ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS &&
        diagnostic?.active === true,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const nonTrafficAdmittedNodeIds = nodeDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic?.active === true &&
        diagnostic?.activitySource !==
          ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const admittedNodeIds = normalizeDistinctStringArray([
    ...trafficAdmittedNodeIds,
    ...nonTrafficAdmittedNodeIds,
  ]);
  const readinessTimeoutFallbackAdmittedNodeIds = nodeDiagnostics
    .filter((diagnostic) => {
      if (
        diagnostic?.active !== true ||
        diagnostic?.activitySource !==
          ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK
      ) {
        return false;
      }
      const reasons = normalizeDistinctStringArray(diagnostic?.reasons);
      return reasons.some((reason) =>
        reason.startsWith(
          ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX,
        ),
      );
    })
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const deferredAdmittedNodeIds =
    readinessMode === CLUSTER_READINESS_MODE_LOAD && prioritySpreadPending ?
      readinessTimeoutFallbackAdmittedNodeIds :
      [];
  const deferredAdmittedNodeIdSet = new Set(deferredAdmittedNodeIds);
  const effectiveAdmittedNodeIds = admittedNodeIds.filter((nodeId) => {
    return !deferredAdmittedNodeIdSet.has(nodeId);
  });
  const expectedBlockedNodeCount = nodeDiagnostics.length;
  const observedBlockedNodeCount = Math.max(
    ZERO,
    expectedBlockedNodeCount - effectiveAdmittedNodeIds.length,
  );
  const invariants = [];

  const bootstrapJoinDuringRecoveryPassed =
    readinessMode === CLUSTER_READINESS_MODE_STARTUP ?
      !prioritySpreadPending || bootstrapAdmittedNodeIds.length > ZERO :
      true;
  invariants.push({
    id: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_BOOTSTRAP_JOIN_DURING_RECOVERY,
    invariantId:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_BOOTSTRAP_JOIN_DURING_RECOVERY,
    reasonCode:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_BOOTSTRAP_JOIN_DURING_RECOVERY,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
    owningSubsystem: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
    passed: bootstrapJoinDuringRecoveryPassed,
    details: {
      mode: readinessMode,
      prioritySpreadPending,
      bootstrapAdmittedNodeIds,
    },
  });

  const trafficGateDuringRecoveryPassed =
    readinessMode === CLUSTER_READINESS_MODE_LOAD ?
      !prioritySpreadPending ||
        (expectedBlockedNodeCount > ZERO &&
          effectiveAdmittedNodeIds.length === ZERO) :
      true;
  invariants.push({
    id: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_TRAFFIC_GATE_DURING_PRIORITY_RECOVERY,
    invariantId:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_TRAFFIC_GATE_DURING_PRIORITY_RECOVERY,
    reasonCode:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_TRAFFIC_GATE_DURING_RECOVERY,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
    owningSubsystem: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
    passed: trafficGateDuringRecoveryPassed,
    details: {
      mode: readinessMode,
      prioritySpreadPending,
      expectedBlockedNodeCount,
      observedBlockedNodeCount,
      trafficBlockedNodeIds,
      trafficPriorityRecoveryBlockedNodeIds,
      trafficAdmittedNodeIds,
      nonTrafficAdmittedNodeIds,
      observedAdmittedNodeIds: admittedNodeIds,
      deferredAdmittedNodeIds,
      violatingNodeIds: effectiveAdmittedNodeIds,
    },
  });

  const clusterActiveRequiresConvergencePassed =
    options.allActive === true ?
      publicationConvergenceGate.ready === true :
      true;
  invariants.push({
    id: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
    invariantId:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
    reasonCode:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
    owningSubsystem: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
    passed: clusterActiveRequiresConvergencePassed,
    details: {
      mode: readinessMode,
      allActive: options.allActive === true,
      publicationConvergenceReady: publicationConvergenceGate.ready === true,
      publicationConvergenceReasons: gateReasons,
    },
  });

  const failingInvariantIds = invariants
    .filter((invariant) => invariant.passed !== true)
    .map((invariant) => invariant.id);
  const failingInvariantReasonCodes = invariants
    .filter((invariant) => invariant.passed !== true)
    .map((invariant) => invariant.reasonCode)
    .filter(
      (reasonCode) =>
        typeof reasonCode === 'string' && reasonCode.length > ZERO,
    );
  return {
    invariants: Object.freeze(
      invariants.map((invariant) =>
        Object.freeze({
          ...invariant,
          details: Object.freeze({...invariant.details}),
        }),
      ),
    ),
    failingInvariantIds: Object.freeze(failingInvariantIds),
    failingInvariantReasonCodes: Object.freeze(failingInvariantReasonCodes),
    passed: failingInvariantIds.length === ZERO,
  };
}

function normalizePublicationConvergenceGateText(value) {
  if (typeof value !==
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.STRING_TYPE) {
    return PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY;
  }
  const trimmed = value.trim();
  return trimmed.length > ZERO ?
    trimmed :
    PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY;
}

function normalizePublicationConvergenceGateRecord(value) {
  if (
    value &&
    typeof value === PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.OBJECT_TYPE
  ) {
    return value;
  }
  return PUBLICATION_CONVERGENCE_GATE_EMPTY_RECORD;
}

function isPublicationConvergenceGateRecordPresent(value) {
  return normalizePublicationConvergenceGateRecord(value) !==
    PUBLICATION_CONVERGENCE_GATE_EMPTY_RECORD;
}

function selectPublicationConvergenceGateStatus(candidates) {
  const normalizedStatuses = candidates
    .map((candidate) => normalizeActiveWaitPublicationStatus(candidate))
    .filter((candidate) => candidate);
  if (normalizedStatuses.length === ZERO) {
    return PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY;
  }
  return normalizedStatuses.sort(comparePublicationConvergenceGateStatusDebt)[
    ZERO
  ];
}

function comparePublicationConvergenceGateStatusDebt(left, right) {
  const leftRank = resolveActiveWaitPublicationStatusRank(left);
  const rightRank = resolveActiveWaitPublicationStatusRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return left.localeCompare(right);
}

function selectPublicationConvergenceGateText(candidates) {
  for (const candidate of candidates) {
    const normalizedText = normalizePublicationConvergenceGateText(candidate);
    if (normalizedText.length > ZERO) {
      return normalizedText;
    }
  }
  return PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY;
}

function normalizePublicationConvergenceGateCount(countCandidates, nodeIdGroups) {
  const explicitCount = countCandidates.find((candidate) =>
    Number.isInteger(candidate) && candidate > ZERO,
  );
  if (Number.isInteger(explicitCount) && explicitCount > ZERO) {
    return explicitCount;
  }
  return normalizeDistinctStringArray(nodeIdGroups.flat()).length;
}

function buildPublicationConvergenceGateSummaryEvidence(
  publicationConvergenceGate,
  activeGateEvidence = PUBLICATION_CONVERGENCE_GATE_EMPTY_RECORD,
) {
  const gateRecordPresent = isPublicationConvergenceGateRecordPresent(
    publicationConvergenceGate,
  );
  const gateRecord = normalizePublicationConvergenceGateRecord(
    publicationConvergenceGate,
  );
  const evidenceRecord = normalizePublicationConvergenceGateRecord(
    activeGateEvidence,
  );
  const progressSnapshot = normalizePublicationConvergenceGateRecord(
    evidenceRecord.progressSnapshot,
  );
  const snapshotCoverage = isPublicationConvergenceGateRecordPresent(
    evidenceRecord.snapshotCoverage,
  ) ?
    normalizePublicationConvergenceGateRecord(evidenceRecord.snapshotCoverage) :
    evidenceRecord;
  const selectedPublicationConvergenceGate =
    normalizePublicationConvergenceGateRecord(
      snapshotCoverage.selectedPublicationConvergenceGate,
    );
  const selectedPublicationConvergence =
    normalizePublicationConvergenceGateRecord(
      snapshotCoverage.selectedPublicationConvergence,
    );
  const reasons = gateRecordPresent ?
    normalizeDistinctStringArray(gateRecord.reasons) :
    [];
  const status = selectPublicationConvergenceGateStatus([
    gateRecord.publicationStatus,
    progressSnapshot.publicationStatus,
    selectedPublicationConvergenceGate.publicationStatus,
    selectedPublicationConvergence.publicationStatus,
    selectedPublicationConvergence.status,
  ]);
  const recoveryProtocolState = selectPublicationConvergenceGateText([
    gateRecord.recoveryProtocolState,
    progressSnapshot.recoveryProtocolState,
    selectedPublicationConvergenceGate.recoveryProtocolState,
    selectedPublicationConvergence.recoveryProtocolState,
  ]);
  const pendingAckCount = normalizePublicationConvergenceGateCount(
    [
      gateRecord.pendingAckCount,
      progressSnapshot.pendingAckCount,
      selectedPublicationConvergenceGate.pendingAckCount,
      selectedPublicationConvergence.pendingAckCount,
    ],
    [
      gateRecord.pendingAckNodeIds,
      progressSnapshot.pendingAckNodeIds,
      snapshotCoverage.selectedPendingAckNodeIds,
      selectedPublicationConvergenceGate.pendingAckNodeIds,
      selectedPublicationConvergence.pendingAckNodeIds,
    ],
  );
  const missingPublishedCount = normalizePublicationConvergenceGateCount(
    [
      gateRecord.missingPublishedCount,
      progressSnapshot.missingPublishedCount,
      selectedPublicationConvergenceGate.missingPublishedCount,
      selectedPublicationConvergence.missingPublishedCount,
    ],
    [
      gateRecord.missingPublishedNodeIds,
      progressSnapshot.selectedMissingPublishedNodeIds,
      snapshotCoverage.selectedMissingPublishedNodeIds,
      selectedPublicationConvergenceGate.missingPublishedNodeIds,
      selectedPublicationConvergence.missingPublishedNodeIds,
    ],
  );
  const statusOpen =
    status.length > ZERO &&
    status !== ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED;
  return {
    recordPresent: gateRecordPresent,
    ready:
      gateRecordPresent &&
      gateRecord.ready === true &&
      reasons.length === ZERO &&
      statusOpen !== true &&
      pendingAckCount === ZERO &&
      missingPublishedCount === ZERO,
    reasons,
    status,
    recoveryProtocolState,
    pendingAckCount,
    missingPublishedCount,
    statusOpen,
    openDebtPresent:
      statusOpen ||
      pendingAckCount > ZERO ||
      missingPublishedCount > ZERO,
  };
}

function formatPublicationConvergenceGateDetails(evidence) {
  return [
    {
      include: evidence.statusOpen === true,
      value:
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.STATUS_PREFIX +
        evidence.status,
    },
    {
      include:
        evidence.openDebtPresent === true &&
        evidence.recoveryProtocolState.length > ZERO,
      value:
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.RECOVERY_PREFIX +
        evidence.recoveryProtocolState,
    },
    {
      include: evidence.pendingAckCount > ZERO,
      value:
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.PENDING_ACK_PREFIX +
        String(evidence.pendingAckCount),
    },
    {
      include: evidence.missingPublishedCount > ZERO,
      value:
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.MISSING_PUBLISHED_PREFIX +
        String(evidence.missingPublishedCount),
    },
  ]
    .filter((detail) => detail.include === true)
    .map((detail) => detail.value);
}

function formatPublicationConvergenceGate(
  publicationConvergenceGate,
  activeGateEvidence = PUBLICATION_CONVERGENCE_GATE_EMPTY_RECORD,
) {
  const evidence = buildPublicationConvergenceGateSummaryEvidence(
    publicationConvergenceGate,
    activeGateEvidence,
  );
  const decision =
    PUBLICATION_CONVERGENCE_GATE_SUMMARY_DECISION_TABLE.find((entry) =>
      entry.matches(evidence),
    );
  const summary =
    decision?.summary === PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.REASONS ?
      evidence.reasons.join(
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.REASON_SEPARATOR,
      ) :
      decision?.summary ||
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.BLOCKED;
  const details = formatPublicationConvergenceGateDetails(evidence);
  if (details.length === ZERO) {
    return summary;
  }
  return summary +
    PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.DETAIL_SEPARATOR +
    details.join(
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.DETAIL_SEPARATOR,
    );
}

function normalizeActiveWaitPublicationStatus(status) {
  if (typeof status !== TYPEOF_STRING) {
    return ACTIVE_WAIT_PUBLICATION_STATUS_UNKNOWN;
  }
  const normalized = status.trim().toUpperCase();
  return normalized.length > ZERO ?
    normalized :
    ACTIVE_WAIT_PUBLICATION_STATUS_UNKNOWN;
}

function resolveActiveWaitPublicationStatusRank(status) {
  const normalizedStatus = normalizeActiveWaitPublicationStatus(status);
  if (normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED) {
    return ACTIVE_WAIT_PUBLICATION_STATUS_RANK.PUBLISHED;
  }
  if (normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING) {
    return ACTIVE_WAIT_PUBLICATION_STATUS_RANK.ACK_PENDING;
  }
  if (
    normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHING ||
    normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PREPARED
  ) {
    return ACTIVE_WAIT_PUBLICATION_STATUS_RANK.PUBLISHING_OR_PREPARED;
  }
  return ZERO;
}

function buildActiveWaitProgressSnapshot(
  probeResult = {},
  expectedNodeCount = ZERO,
  options = {},
) {
  const readinessMode =
    options?.readinessMode === CLUSTER_READINESS_MODE_LOAD ?
      CLUSTER_READINESS_MODE_LOAD :
      CLUSTER_READINESS_MODE_STARTUP;
  const nodeDiagnostics = Array.isArray(probeResult?.nodeDiagnostics) ?
    probeResult.nodeDiagnostics :
    [];
  const activeNodeCount = nodeDiagnostics.filter(
    (diagnostic) => diagnostic?.active === true,
  ).length;
  const inactiveNodeCount = Math.max(
    ZERO,
    nodeDiagnostics.length - activeNodeCount,
  );

  const snapshotCoverage =
    probeResult?.snapshotCoverage &&
    typeof probeResult.snapshotCoverage === 'object' ?
      probeResult.snapshotCoverage :
      null;
  const normalizedExpectedNodeCount =
    Number.isInteger(snapshotCoverage?.expectedNodeCount) &&
    snapshotCoverage.expectedNodeCount > ZERO ?
      snapshotCoverage.expectedNodeCount :
      Math.max(ZERO, expectedNodeCount);
  const snapshotCoverageNodeCount =
    Number.isInteger(snapshotCoverage?.bestCoverageNodeCount) &&
    snapshotCoverage.bestCoverageNodeCount > ZERO ?
      snapshotCoverage.bestCoverageNodeCount :
      ZERO;
  const snapshotCoverageComplete = snapshotCoverage?.completeCoverage === true;

  const publicationConvergence =
    snapshotCoverage?.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === 'object' ?
      snapshotCoverage.selectedPublicationConvergence :
      null;
  const publicationConvergenceGate =
    probeResult?.publicationConvergenceGate &&
    typeof probeResult.publicationConvergenceGate === 'object' ?
      probeResult.publicationConvergenceGate :
      null;
  const publicationStatus = normalizeActiveWaitPublicationStatus(
    publicationConvergenceGate?.publicationStatus ||
      publicationConvergence?.publicationStatus,
  );
  const recoveryProtocolState =
    typeof publicationConvergenceGate?.recoveryProtocolState === 'string' &&
    publicationConvergenceGate.recoveryProtocolState.length > ZERO ?
      publicationConvergenceGate.recoveryProtocolState :
      typeof publicationConvergence?.recoveryProtocolState === 'string' &&
          publicationConvergence.recoveryProtocolState.length > ZERO ?
        publicationConvergence.recoveryProtocolState :
        null;
  const publicationEpoch = Number.isFinite(
    publicationConvergence?.publicationEpoch,
  ) ?
    Math.floor(publicationConvergence.publicationEpoch) :
    null;
  const selectedSnapshotNodeId =
    typeof snapshotCoverage?.selectedNodeId === 'string' &&
    snapshotCoverage.selectedNodeId.length > ZERO ?
      snapshotCoverage.selectedNodeId :
      null;
  const selectedSnapshotTimeoutMs = Number.isFinite(
    snapshotCoverage?.selectedSnapshotTimeoutMs,
  ) ?
    Math.max(ZERO, Math.floor(snapshotCoverage.selectedSnapshotTimeoutMs)) :
    null;
  const selectedSnapshotAdminReady =
    snapshotCoverage?.selectedAdminReady === true ?
      true :
      snapshotCoverage?.selectedAdminReady === false ?
        false :
        null;
  const selectedSnapshotReachableBy =
    typeof snapshotCoverage?.selectedReachableBy === 'string' &&
    snapshotCoverage.selectedReachableBy.length > ZERO ?
      snapshotCoverage.selectedReachableBy :
      null;
  const selectedSnapshotError =
    typeof snapshotCoverage?.selectedError === 'string' &&
    snapshotCoverage.selectedError.length > ZERO ?
      snapshotCoverage.selectedError :
      null;
  const selectedSnapshotReachabilityError =
    typeof snapshotCoverage?.selectedReachabilityError === 'string' &&
    snapshotCoverage.selectedReachabilityError.length > ZERO ?
      snapshotCoverage.selectedReachabilityError :
      null;
  const selectedSnapshotObservationMode =
    typeof snapshotCoverage?.selectedSnapshotObservationMode === 'string' &&
    snapshotCoverage.selectedSnapshotObservationMode.length > ZERO ?
      snapshotCoverage.selectedSnapshotObservationMode :
      null;
  const selectedSnapshotObservationState =
    typeof snapshotCoverage?.selectedSnapshotObservationState === 'string' &&
    snapshotCoverage.selectedSnapshotObservationState.length > ZERO ?
      snapshotCoverage.selectedSnapshotObservationState :
      null;
  const selectedSnapshotObservationContractState =
    typeof snapshotCoverage?.selectedSnapshotObservationContractState ===
      'string' &&
    snapshotCoverage.selectedSnapshotObservationContractState.length > ZERO ?
      snapshotCoverage.selectedSnapshotObservationContractState :
      null;
  const selectedSnapshotObservationRefreshState =
    typeof snapshotCoverage?.selectedSnapshotObservationRefreshState ===
      'string' &&
    snapshotCoverage.selectedSnapshotObservationRefreshState.length > ZERO ?
      snapshotCoverage.selectedSnapshotObservationRefreshState :
      null;
  const selectedSnapshotObservationNextAction =
    typeof snapshotCoverage?.selectedSnapshotObservationNextAction ===
      'string' &&
    snapshotCoverage.selectedSnapshotObservationNextAction.length > ZERO ?
      snapshotCoverage.selectedSnapshotObservationNextAction :
      null;
  const selectedSnapshotObservationReasonCodes = normalizeDistinctStringArray(
    snapshotCoverage?.selectedSnapshotObservationReasonCodes,
  );
  const selectedSnapshotObservationRetryAfterMs = Number.isFinite(
    snapshotCoverage?.selectedSnapshotObservationRetryAfterMs,
  ) ?
    Math.max(
      ZERO,
      Math.floor(snapshotCoverage.selectedSnapshotObservationRetryAfterMs),
    ) :
    null;
  const selectedSnapshotRepairDeferred =
    snapshotCoverage?.selectedSnapshotRepairDeferred === true;
  const selectedControlPlaneOwnerQueueDepth =
    snapshotCoverage?.selectedControlPlaneOwnerQueueDepth &&
    typeof snapshotCoverage.selectedControlPlaneOwnerQueueDepth === 'object' ?
      snapshotCoverage.selectedControlPlaneOwnerQueueDepth :
      null;
  const selectedCdcReplayLag =
    snapshotCoverage?.selectedCdcReplayLag &&
    typeof snapshotCoverage.selectedCdcReplayLag === 'object' ?
      snapshotCoverage.selectedCdcReplayLag :
      null;
  const publicationActiveGateHandoff = normalizeActiveGateOwnerCohortRecord(
    snapshotCoverage?.selectedPublicationActiveGateHandoff,
  );
  const activeGateOwnerCohort = normalizeActiveGateOwnerCohortRecord(
    publicationActiveGateHandoff ||
      snapshotCoverage?.selectedActiveGateOwnerCohort,
  );
  const publicationActiveGateHandoffNextAction =
    normalizeActiveGateOwnerCohortString(
      publicationActiveGateHandoff?.[
        ACTIVE_GATE_OWNER_COHORT_FIELD.NEXT_ACTION
      ],
    );
  const publicationActiveGateHandoffRuntimePromotionAllowed =
    publicationActiveGateHandoff?.[
      ACTIVE_GATE_OWNER_COHORT_FIELD.RUNTIME_PROMOTION_ALLOWED
    ] === true;
  const activeGateOwnerCohortState = normalizeActiveGateOwnerCohortString(
    activeGateOwnerCohort?.[ACTIVE_GATE_OWNER_COHORT_FIELD.STATE],
  );
  const activeGateOwnerCohortReasonCode =
    normalizeActiveGateOwnerCohortString(
      activeGateOwnerCohort?.[ACTIVE_GATE_OWNER_COHORT_FIELD.REASON_CODE],
    );
  const activeGateOwnerCohortMissingPublishedNodeIds =
    normalizeActiveGateOwnerCohortNodeIds(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.MISSING_PUBLISHED_NODE_IDS,
    );
  const activeGateOwnerCohortMissingPublishedCount =
    normalizeActiveGateOwnerCohortCount(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.MISSING_PUBLISHED_COUNT,
      activeGateOwnerCohortMissingPublishedNodeIds,
    );
  const activeGateOwnerCohortPendingRecoveryNodeIds =
    normalizeActiveGateOwnerCohortNodeIds(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.PENDING_RECOVERY_NODE_IDS,
    );
  const activeGateOwnerCohortPendingRecoveryCount =
    normalizeActiveGateOwnerCohortCount(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.PENDING_RECOVERY_COUNT,
      activeGateOwnerCohortPendingRecoveryNodeIds,
    );
  const activeGateOwnerCohortPendingReconcileNodeIds =
    normalizeActiveGateOwnerCohortNodeIds(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.PENDING_RECONCILE_NODE_IDS,
    );
  const activeGateOwnerCohortPendingReconcileCount =
    normalizeActiveGateOwnerCohortCount(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.PENDING_RECONCILE_COUNT,
      activeGateOwnerCohortPendingReconcileNodeIds,
    );
  const membershipPublicationHandoffOutcome =
    normalizeActiveGateOwnerCohortRecord(
      snapshotCoverage?.selectedMembershipPublicationHandoffOutcome ||
        publicationActiveGateHandoff?.[
          ACTIVE_GATE_OWNER_COHORT_FIELD
            .MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME
        ] ||
        activeGateOwnerCohort?.[
          ACTIVE_GATE_OWNER_COHORT_FIELD
            .MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME
        ],
    );
  const membershipPublicationHandoffOutcomeState =
    normalizeActiveGateOwnerCohortString(
      membershipPublicationHandoffOutcome?.[
        MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.STATE
      ],
    );
  const membershipPublicationHandoffOutcomeReasonCode =
    normalizeActiveGateOwnerCohortString(
      membershipPublicationHandoffOutcome?.[
        MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.REASON_CODE
      ],
    );
  const membershipPublicationHandoffOutcomeEnqueued =
    membershipPublicationHandoffOutcome?.[
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.ENQUEUED
    ] === true;
  const membershipPublicationHandoffOutcomeRetryAfterMs = Number.isFinite(
    membershipPublicationHandoffOutcome?.[
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.RETRY_AFTER_MS
    ],
  ) ?
    Math.max(
      ZERO,
      Math.floor(
        membershipPublicationHandoffOutcome[
          MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.RETRY_AFTER_MS
        ],
      ),
    ) :
    null;
  const perNodePublicationDisagreementSet =
    snapshotCoverage?.publicationDisagreementByNodeId &&
    typeof snapshotCoverage.publicationDisagreementByNodeId === 'object' ?
      Object.fromEntries(
        Object.entries(snapshotCoverage.publicationDisagreementByNodeId)
          .map(([nodeId, missingNodeIds]) => {
            const normalizedNodeId = String(nodeId || '').trim();
            return [
              normalizedNodeId,
              normalizeDistinctStringArray(missingNodeIds),
            ];
          })
          .filter(([nodeId]) => nodeId.length > ZERO),
      ) :
      {};
  const publicationActiveGateHandoffPublishedActiveNodeIds =
    normalizeDistinctStringArray(
      publicationActiveGateHandoff?.publishedActiveNodeIds,
    );
  const selectedPublishedActiveNodeIds =
    normalizeFirstNonEmptyDistinctStringArray(
      snapshotCoverage?.selectedPublishedActiveNodeIds,
      publicationActiveGateHandoffPublishedActiveNodeIds,
      publicationConvergence?.publishedActiveNodeIds,
    );
  const selectedMissingPublishedNodeIds =
    Array.isArray(snapshotCoverage?.selectedMissingPublishedNodeIds) ?
      normalizeDistinctStringArray(snapshotCoverage.selectedMissingPublishedNodeIds) :
      Array.isArray(publicationActiveGateHandoff?.missingPublishedNodeIds) ?
        normalizeDistinctStringArray(
          publicationActiveGateHandoff.missingPublishedNodeIds,
        ) :
        normalizeDistinctStringArray(
          publicationConvergenceGate?.missingPublishedNodeIds,
        );
  const pendingAckNodeIds = normalizeDistinctStringArray(
    snapshotCoverage?.selectedPendingAckNodeIds ||
      publicationConvergenceGate?.pendingAckNodeIds ||
      publicationConvergence?.pendingAckNodeIds,
  );
  const missingPublishedNodeIds = normalizeDistinctStringArray(
    publicationConvergenceGate?.missingPublishedNodeIds,
  );
  const publicationActiveGateHandoffCoversExpectedNodes =
    publicationActiveGateHandoff !== null &&
    normalizedExpectedNodeCount > ZERO &&
    publicationActiveGateHandoffPublishedActiveNodeIds.length >=
      normalizedExpectedNodeCount &&
    activeGateOwnerCohortMissingPublishedCount === ZERO;
  const missingPublishedCount =
    publicationActiveGateHandoffCoversExpectedNodes === true ?
      ZERO :
      Math.max(
        missingPublishedNodeIds.length,
        Number.isInteger(publicationConvergenceGate?.missingPublishedCount) &&
          publicationConvergenceGate.missingPublishedCount >= ZERO ?
          publicationConvergenceGate.missingPublishedCount :
          ZERO,
      );
  const gateReasons = normalizeDistinctStringArray(
    publicationConvergenceGate?.reasons,
  ).sort();
  const priorityPartitionSummary =
    publicationConvergenceGate?.priorityPartitionSummary &&
    typeof publicationConvergenceGate.priorityPartitionSummary === 'object' ?
      publicationConvergenceGate.priorityPartitionSummary :
      publicationConvergence?.priorityPartitionSummary &&
          typeof publicationConvergence.priorityPartitionSummary === 'object' ?
        publicationConvergence.priorityPartitionSummary :
        null;
  const prioritySpreadSatisfied =
    priorityPartitionSummary?.satisfied === true ?
      true :
      priorityPartitionSummary?.satisfied === false ?
        false :
        null;
  const prioritySpreadGap =
    Number.isInteger(priorityPartitionSummary?.totalSpreadGap) &&
    priorityPartitionSummary.totalSpreadGap >= ZERO ?
      priorityPartitionSummary.totalSpreadGap :
      null;
  const priorityBlockedPartitionCount =
    Number.isInteger(priorityPartitionSummary?.blockedPartitionCount) &&
    priorityPartitionSummary.blockedPartitionCount >= ZERO ?
      priorityPartitionSummary.blockedPartitionCount :
      null;
  const steadyPublishedSelectedMissingCount =
    resolveSteadyPublishedSelectedMissingCount({
      expectedNodeCount: normalizedExpectedNodeCount,
      publicationStatus,
      recoveryProtocolState,
      priorityPartitionSummary,
      pendingAckNodeIds,
      selectedPublishedActiveNodeIds,
      selectedMissingPublishedNodeIds,
    });
  const startupPublicationLagSelectedMissingCount =
    resolveStartupPublicationLagSelectedMissingCount({
      readinessMode,
      expectedNodeCount: normalizedExpectedNodeCount,
      publicationStatus,
      pendingAckNodeIds,
      selectedPublishedActiveNodeIds,
      selectedMissingPublishedNodeIds,
    });
  const normalizedMissingPublishedCount = Math.max(
    missingPublishedCount,
    steadyPublishedSelectedMissingCount,
    startupPublicationLagSelectedMissingCount,
  );
  const priorityRecoveryDecisionSnapshots =
    snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots &&
    typeof snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots ===
      'object' ?
      snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots :
      null;
  const priorityRecoveryProgressClasses =
    summarizePriorityRecoveryProgressClasses(priorityRecoveryDecisionSnapshots);
  const priorityRecoveryUnresolvedClassCount =
    priorityRecoveryProgressClasses.unresolvedClassCount;
  const priorityRecoveryUnresolvedSemanticStateCount =
    priorityRecoveryProgressClasses.unresolvedSemanticStateCount;
  const priorityRecoveryBlockedPartitionCount =
    priorityRecoveryProgressClasses.blockedPartitionCount;

  const blockers = [];
  if (inactiveNodeCount > ZERO) {
    blockers.push(
      ACTIVE_WAIT_BLOCKER_INACTIVE_NODES_PREFIX + String(inactiveNodeCount),
    );
  }
  if (!snapshotCoverageComplete) {
    blockers.push(
      ACTIVE_WAIT_BLOCKER_SNAPSHOT_COVERAGE_PREFIX +
        String(snapshotCoverageNodeCount) +
        ACTIVE_WAIT_DIAGNOSTIC_TEXT.COUNT_SEPARATOR +
        String(normalizedExpectedNodeCount),
    );
  }
  if (
    typeof snapshotCoverage?.selectedError === TYPEOF_STRING &&
    snapshotCoverage.selectedError.length > ZERO
  ) {
    blockers.push(ACTIVE_WAIT_BLOCKER_SNAPSHOT_ERROR);
  }
  for (const reason of gateReasons) {
    blockers.push(ACTIVE_WAIT_BLOCKER_PUBLICATION_GATE_PREFIX + reason);
  }
  for (const progressClass of priorityRecoveryProgressClasses.unresolvedClassIds) {
    blockers.push(
      ACTIVE_WAIT_BLOCKER_PRIORITY_RECOVERY_PROGRESS_CLASS_PREFIX +
        progressClass,
    );
  }
  if (blockers.length === ZERO && probeResult?.allActive === true) {
    blockers.push(ACTIVE_WAIT_BLOCKER_READY);
  }
  const progressPublicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
    ...publicationConvergenceGate,
    publicationStatus,
    recoveryProtocolState,
    priorityRecoveryReasonCodes:
      publicationConvergenceGate?.priorityRecoveryReasonCodes,
    priorityPartitionSummary,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness:
      priorityRecoveryDecisionSnapshots?.closureWitness || null,
    pendingAckNodeIds,
    missingPublishedNodeIds: selectedMissingPublishedNodeIds,
    missingPublishedCount: normalizedMissingPublishedCount,
  });

  const closureWitness = classifyActiveGateClosureWitness({
    progressSnapshot: {
      expectedNodeCount: normalizedExpectedNodeCount,
      activeNodeCount,
      inactiveNodeCount,
      snapshotCoverageNodeCount,
      snapshotCoverageComplete,
      publicationStatus,
      recoveryProtocolState,
      pendingAckCount: pendingAckNodeIds.length,
      missingPublishedCount: normalizedMissingPublishedCount,
      gateReasons,
      prioritySpreadSatisfied,
      priorityRecoveryDecisionSnapshots,
      priorityRecoveryClosureWitness:
        priorityRecoveryDecisionSnapshots?.closureWitness || null,
      publicationRecoveryGate: progressPublicationRecoveryGate,
      selectedSnapshotAdminReady,
      selectedSnapshotReachableBy,
      selectedSnapshotError,
      selectedSnapshotReachabilityError,
      selectedSnapshotObservationMode,
      selectedSnapshotObservationState,
      selectedSnapshotObservationContractState,
      selectedSnapshotObservationRefreshState,
      selectedSnapshotObservationNextAction,
      selectedSnapshotObservationReasonCodes,
      selectedSnapshotObservationRetryAfterMs,
      selectedSnapshotRepairDeferred,
      publicationActiveGateHandoffState: activeGateOwnerCohortState,
      publicationActiveGateHandoffReasonCode:
        activeGateOwnerCohortReasonCode,
      publicationActiveGateHandoffNextAction,
      publicationActiveGateHandoffRuntimePromotionAllowed,
      publicationActiveGateHandoffPendingReconcileNodeIds:
        activeGateOwnerCohortPendingReconcileNodeIds,
      publicationActiveGateHandoffPendingReconcileCount:
        activeGateOwnerCohortPendingReconcileCount,
      activeGateOwnerCohortState,
      activeGateOwnerCohortReasonCode,
      activeGateOwnerCohortMissingPublishedNodeIds,
      activeGateOwnerCohortMissingPublishedCount,
      activeGateOwnerCohortPendingRecoveryNodeIds,
      activeGateOwnerCohortPendingRecoveryCount,
      activeGateOwnerCohortPendingReconcileNodeIds,
      activeGateOwnerCohortPendingReconcileCount,
      membershipPublicationHandoffOutcomeState,
      membershipPublicationHandoffOutcomeReasonCode,
      membershipPublicationHandoffOutcomeEnqueued,
      membershipPublicationHandoffOutcomeRetryAfterMs,
    },
    publicationConvergence,
    publicationConvergenceGate,
    readinessMode,
  });
  const closureRecordId =
    (typeof publicationConvergenceGate?.closureRecordId === 'string' &&
    publicationConvergenceGate.closureRecordId.length > ZERO ?
      publicationConvergenceGate.closureRecordId :
      null) ||
    (typeof publicationConvergence?.closureRecordId === 'string' &&
    publicationConvergence.closureRecordId.length > ZERO ?
      publicationConvergence.closureRecordId :
      null) ||
    closureWitness?.closureRecordId ||
    null;
  const closureWitnessClass =
    (typeof publicationConvergenceGate?.closureWitnessClass === 'string' &&
    publicationConvergenceGate.closureWitnessClass.length > ZERO ?
      publicationConvergenceGate.closureWitnessClass :
      null) ||
    (typeof publicationConvergence?.closureWitnessClass === 'string' &&
    publicationConvergence.closureWitnessClass.length > ZERO ?
      publicationConvergence.closureWitnessClass :
      null) ||
    closureWitness?.closureWitnessClass ||
    null;

  return {
    expectedNodeCount: normalizedExpectedNodeCount,
    activeNodeCount,
    inactiveNodeCount,
    snapshotCoverageNodeCount,
    snapshotCoverageComplete,
    publicationStatus,
    publicationStatusRank:
      resolveActiveWaitPublicationStatusRank(publicationStatus),
    publicationEpoch,
    recoveryProtocolState,
    selectedSnapshotNodeId,
    selectedSnapshotTimeoutMs,
    selectedSnapshotAdminReady,
    selectedSnapshotReachableBy,
    selectedSnapshotError,
    selectedSnapshotReachabilityError,
    selectedSnapshotObservationMode,
    selectedSnapshotObservationState,
    selectedSnapshotObservationContractState,
    selectedSnapshotObservationRefreshState,
    selectedSnapshotObservationNextAction,
    selectedSnapshotObservationReasonCodes,
    selectedSnapshotObservationRetryAfterMs,
    selectedSnapshotRepairDeferred,
    selectedControlPlaneOwnerQueueDepth,
    selectedCdcReplayLag,
    publicationActiveGateHandoffState: activeGateOwnerCohortState,
    publicationActiveGateHandoffReasonCode: activeGateOwnerCohortReasonCode,
    publicationActiveGateHandoffNextAction,
    publicationActiveGateHandoffRuntimePromotionAllowed,
    publicationActiveGateHandoffPendingReconcileNodeIds:
      activeGateOwnerCohortPendingReconcileNodeIds,
    publicationActiveGateHandoffPendingReconcileCount:
      activeGateOwnerCohortPendingReconcileCount,
    activeGateOwnerCohortState,
    activeGateOwnerCohortReasonCode,
    activeGateOwnerCohortMissingPublishedNodeIds,
    activeGateOwnerCohortMissingPublishedCount,
    activeGateOwnerCohortPendingRecoveryNodeIds,
    activeGateOwnerCohortPendingRecoveryCount,
    activeGateOwnerCohortPendingReconcileNodeIds,
    activeGateOwnerCohortPendingReconcileCount,
    membershipPublicationHandoffOutcomeState,
    membershipPublicationHandoffOutcomeReasonCode,
    membershipPublicationHandoffOutcomeEnqueued,
    membershipPublicationHandoffOutcomeRetryAfterMs,
    perNodePublicationDisagreementSet,
    selectedPublishedActiveNodeIds,
    selectedPublishedActiveCount: selectedPublishedActiveNodeIds.length,
    selectedMissingPublishedNodeIds,
    pendingAckCount: pendingAckNodeIds.length,
    missingPublishedCount: normalizedMissingPublishedCount,
    gateReasonCount: gateReasons.length,
    gateReasons,
    prioritySpreadSatisfied,
    prioritySpreadGap,
    priorityBlockedPartitionCount,
    priorityRecoveryProgressClasses,
    priorityRecoveryUnresolvedClassCount,
    priorityRecoveryUnresolvedSemanticStateCount,
    priorityRecoveryBlockedPartitionCount,
    closureRecordId,
    closureWitnessClass,
    readinessDelay: classifyActiveGateReadinessDelay({
      readinessMode,
      selectedSnapshotError,
      selectedSnapshotReachabilityError,
    }),
    blockers,
    blockerSignature: blockers.join(ACTIVE_WAIT_BLOCKER_SIGNATURE_SEPARATOR),
  };
}

function normalizePriorityRecoverySemanticStateId(semanticState) {
  const normalizedSemanticState = String(
    semanticState || PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY,
  ).trim();
  if (normalizedSemanticState.length === ZERO) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(normalizedSemanticState) ?
    normalizedSemanticState :
    PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN;
}

function isPriorityRecoverySemanticStateId(semanticState) {
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(semanticState);
}

function buildPriorityRecoveryExplicitSemanticStateByPartitionId(
  partitionIdsBySemanticState,
) {
  const explicitSemanticStateByPartitionId = new Map();
  if (
    !partitionIdsBySemanticState ||
    typeof partitionIdsBySemanticState !== TYPEOF_OBJECT ||
    Array.isArray(partitionIdsBySemanticState)
  ) {
    return explicitSemanticStateByPartitionId;
  }
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    const normalizedSemanticState =
      normalizePriorityRecoverySemanticStateId(semanticState);
    if (!isPriorityRecoverySemanticStateId(normalizedSemanticState)) {
      continue;
    }
    for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
      if (!explicitSemanticStateByPartitionId.has(partitionId)) {
        explicitSemanticStateByPartitionId.set(
          partitionId,
          normalizedSemanticState,
        );
      }
    }
  }
  return explicitSemanticStateByPartitionId;
}

function resolvePriorityRecoveryExplicitSemanticState(
  snapshot,
  explicitSemanticStateByPartitionId,
) {
  const explicitSemanticStateId =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticStateId);
  if (isPriorityRecoverySemanticStateId(explicitSemanticStateId)) {
    return explicitSemanticStateId;
  }
  const explicitSemanticState =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticState);
  if (isPriorityRecoverySemanticStateId(explicitSemanticState)) {
    return explicitSemanticState;
  }
  const partitionId = String(
    snapshot?.partitionId || PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY,
  ).trim();
  if (
    partitionId.length === ZERO ||
    !(explicitSemanticStateByPartitionId instanceof Map)
  ) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN;
  }
  const partitionSemanticState =
    explicitSemanticStateByPartitionId.get(partitionId) ||
    PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN;
  return isPriorityRecoverySemanticStateId(partitionSemanticState) ?
    partitionSemanticState :
    PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN;
}

function resolvePriorityRecoveryDecisionSnapshotProgressSortTimestamp(
  snapshot,
) {
  const operation = snapshot?.coordinator?.operation || {};
  const progressTimestampCandidates = [
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD.COMPLETED_AT_MS
    ],
    operation[PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD.UPDATED_AT_MS],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD
        .TARGET_SERVICE_PROGRESS_AT_MS
    ],
    snapshot?.progress?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD.LAST_PROGRESS_AT_MS
    ],
    operation[PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD.CREATED_AT_MS],
  ]
    .map((candidate) => Number(candidate))
    .filter((candidate) => Number.isFinite(candidate) && candidate > ZERO);
  return progressTimestampCandidates.length > ZERO ?
    Math.max(...progressTimestampCandidates) :
    ZERO;
}

function resolvePriorityRecoveryDecisionSnapshotSortTimestamp(snapshot) {
  const progressTimestamp =
    resolvePriorityRecoveryDecisionSnapshotProgressSortTimestamp(snapshot);
  if (progressTimestamp > ZERO) {
    return progressTimestamp;
  }
  const updatedAtMs = Number(
    snapshot?.observation?.provenance?.capturedAt ??
      ZERO,
  );
  return Number.isFinite(updatedAtMs) ? updatedAtMs : ZERO;
}

function comparePriorityRecoveryDecisionSummarySnapshots(left, right) {
  const leftEpoch = Number.isFinite(left?.epoch) ?
    left.epoch :
    PRIORITY_RECOVERY_DECISION_SNAPSHOT_UNKNOWN_EPOCH;
  const rightEpoch = Number.isFinite(right?.epoch) ?
    right.epoch :
    PRIORITY_RECOVERY_DECISION_SNAPSHOT_UNKNOWN_EPOCH;
  if (leftEpoch !== rightEpoch) {
    return leftEpoch - rightEpoch;
  }
  const leftTimestamp = resolvePriorityRecoveryDecisionSnapshotSortTimestamp(
    left,
  );
  const rightTimestamp = resolvePriorityRecoveryDecisionSnapshotSortTimestamp(
    right,
  );
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }
  return String(
    left?.correlationKey || PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY,
  ).localeCompare(
    String(
      right?.correlationKey ||
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY,
    ),
  );
}

function selectPriorityRecoveryDecisionSummarySnapshots(snapshots) {
  const latestSnapshotByPartitionId = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    if (!snapshot || typeof snapshot !== TYPEOF_OBJECT) {
      continue;
    }
    const partitionId = String(
      snapshot.partitionId ||
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY,
    ).trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    const currentSnapshot = latestSnapshotByPartitionId.get(partitionId);
    if (
      !currentSnapshot ||
      comparePriorityRecoveryDecisionSummarySnapshots(
        currentSnapshot,
        snapshot,
      ) < ZERO
    ) {
      latestSnapshotByPartitionId.set(partitionId, snapshot);
    }
  }
  return [...latestSnapshotByPartitionId.values()];
}

function summarizePriorityRecoveryProgressClasses(
  priorityRecoveryDecisionSnapshots = null,
) {
  const snapshots = Array.isArray(priorityRecoveryDecisionSnapshots?.snapshots) ?
    priorityRecoveryDecisionSnapshots.snapshots :
    [];
  const summarySnapshots =
    selectPriorityRecoveryDecisionSummarySnapshots(snapshots);
  const partitionIdsByClass = {
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.ELIGIBLE_NO_OPERATION]:
      new Set(),
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.OPERATION_NO_TRANSITIONS]:
      new Set(),
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.LEARNER_NEVER_PROMOTABLE]:
      new Set(),
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.RECOVERY_ELIGIBLE_EXCLUDED]:
      new Set(),
  };
  const partitionIdsBySemanticState = {};
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }
  const explicitSemanticStateByPartitionId =
    buildPriorityRecoveryExplicitSemanticStateByPartitionId(
      priorityRecoveryDecisionSnapshots?.partitionIdsBySemanticState,
    );
  for (const snapshot of summarySnapshots) {
    const partitionId = String(snapshot?.partitionId || '').trim();
    const blockerReasons = normalizeDistinctStringArray(snapshot?.blockerReasons);
    if (partitionId.length === ZERO) {
      continue;
    }
    for (const blockerReason of blockerReasons) {
      if (!Object.hasOwn(partitionIdsByClass, blockerReason)) {
        continue;
      }
      partitionIdsByClass[blockerReason].add(partitionId);
    }
    const semanticState =
      resolvePriorityRecoveryExplicitSemanticState(
        snapshot,
        explicitSemanticStateByPartitionId,
      );
    if (partitionIdsBySemanticState[semanticState] instanceof Set) {
      partitionIdsBySemanticState[semanticState].add(partitionId);
    }
  }

  const normalizedPartitionIdsByClass = {};
  for (const [progressClass, partitionIds] of Object.entries(
    partitionIdsByClass,
  )) {
    normalizedPartitionIdsByClass[progressClass] = [...partitionIds].sort();
  }
  const unresolvedClassIds = Object.entries(normalizedPartitionIdsByClass)
    .filter(([, partitionIds]) => partitionIds.length > ZERO)
    .map(([progressClass]) => progressClass)
    .sort();
  const normalizedPartitionIdsBySemanticState = {};
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    normalizedPartitionIdsBySemanticState[semanticState] = [
      ...partitionIds,
    ].sort();
  }
  const unresolvedSemanticStateIds =
    PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.filter(
      (semanticState) =>
        normalizedPartitionIdsBySemanticState[semanticState].length > ZERO,
    );
  const semanticBlockedPartitionIds = normalizeDistinctStringArray(
    unresolvedSemanticStateIds.flatMap(
      (semanticState) =>
        normalizedPartitionIdsBySemanticState[semanticState] || [],
    ),
  );

  return {
    partitionIdsByClass: normalizedPartitionIdsByClass,
    unresolvedClassIds,
    unresolvedClassCount: unresolvedClassIds.length,
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
    unresolvedSemanticStateIds,
    unresolvedSemanticStateCount: unresolvedSemanticStateIds.length,
    blockedPartitionIds: semanticBlockedPartitionIds,
    blockedPartitionCount: semanticBlockedPartitionIds.length,
  };
}

export const CLUSTER_SEGMENT_2 = {
  ...CLUSTER_SEGMENT_1,
  resolveMeaningfulProbeTimeoutMs,
  withTimeout,
  formatCountSummary,
  formatNodeDiagnostics,
  formatSnapshotCoverage,
  evaluateLoadPublishedConvergence,
  evaluatePriorityRecoveryCrossServiceInvariants,
  formatPublicationConvergenceGate,
  normalizeActiveWaitPublicationStatus,
  resolveActiveWaitPublicationStatusRank,
  buildActiveWaitProgressSnapshot,
  normalizePriorityRecoverySemanticStateId,
  summarizePriorityRecoveryProgressClasses,
};
