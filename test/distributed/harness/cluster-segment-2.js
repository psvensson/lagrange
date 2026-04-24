import { CLUSTER_SEGMENT_1 } from "./cluster-segment-1.js";
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
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
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
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > ZERO),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

/**
 * Resolve/reject with timeout protection for potentially hanging operations.
 * @param {Promise<*>} promise
 * @param {number} timeoutMs
 * @param {string} timeoutMessage
 * @returns {Promise<*>}
 */
function withTimeout(promise, timeoutMs, timeoutMessage) {
  const boundedTimeoutMs = Math.max(MIN_TIMEOUT_MS, Number(timeoutMs) || 0);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(timeoutMessage));
    }, boundedTimeoutMs);
    if (typeof timer.unref === "function") {
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
    .map(([key, count]) => String(key) + ":" + String(count))
    .join(", ");
}

/**
 * Format node diagnostics into compact "node=state" entries.
 * @param {Array<Object>} nodeDiagnostics
 * @returns {string}
 */
function formatNodeDiagnostics(nodeDiagnostics = []) {
  return nodeDiagnostics
    .map((diagnostic) => {
      const nodeId = String(diagnostic.nodeId || "unknown-node");
      if (diagnostic.active === true) {
        return nodeId + "=active";
      }
      if (typeof diagnostic.error === "string" && diagnostic.error.length > 0) {
        return nodeId + "=error:" + diagnostic.error;
      }
      const stateValue =
        typeof diagnostic.state === "string" && diagnostic.state.length > 0
          ? diagnostic.state
          : UNKNOWN_STATE;
      return nodeId + "=" + stateValue;
    })
    .join(", ");
}

/**
 * Format control snapshot coverage summary.
 * @param {Object|null} snapshotCoverage
 * @returns {string}
 */
function formatSnapshotCoverage(snapshotCoverage) {
  if (!snapshotCoverage || typeof snapshotCoverage !== "object") {
    return "none";
  }
  const expectedNodeCount = Number(snapshotCoverage.expectedNodeCount) || 0;
  const bestCoverageNodeCount =
    Number(snapshotCoverage.bestCoverageNodeCount) || 0;
  const selectedNodeId =
    typeof snapshotCoverage.selectedNodeId === "string" &&
    snapshotCoverage.selectedNodeId.length > ZERO
      ? snapshotCoverage.selectedNodeId
      : null;
  const selectedCapturedAtMs = Number.isFinite(
    snapshotCoverage.selectedCapturedAtMs,
  )
    ? Math.floor(snapshotCoverage.selectedCapturedAtMs)
    : null;
  const selectedAdminReady =
    snapshotCoverage.selectedAdminReady === true
      ? true
      : snapshotCoverage.selectedAdminReady === false
        ? false
        : null;
  const selectedReachableBy =
    typeof snapshotCoverage.selectedReachableBy === "string" &&
    snapshotCoverage.selectedReachableBy.length > ZERO
      ? snapshotCoverage.selectedReachableBy
      : null;
  const selectedReachabilityError =
    typeof snapshotCoverage.selectedReachabilityError === "string" &&
    snapshotCoverage.selectedReachabilityError.length > ZERO
      ? snapshotCoverage.selectedReachabilityError
      : null;
  const selectedSnapshotTimeoutMs = Number.isFinite(
    snapshotCoverage.selectedSnapshotTimeoutMs,
  )
    ? Math.max(
        MIN_TIMEOUT_MS,
        Math.floor(snapshotCoverage.selectedSnapshotTimeoutMs),
      )
    : null;
  const selectedReachabilityTimeoutMs = Number.isFinite(
    snapshotCoverage.selectedReachabilityTimeoutMs,
  )
    ? Math.max(
        MIN_TIMEOUT_MS,
        Math.floor(snapshotCoverage.selectedReachabilityTimeoutMs),
      )
    : null;
  const selectedPublicationConvergence =
    snapshotCoverage.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === "object"
      ? snapshotCoverage.selectedPublicationConvergence
      : null;
  const publicationEpoch = Number.isFinite(
    selectedPublicationConvergence?.publicationEpoch,
  )
    ? Math.floor(selectedPublicationConvergence.publicationEpoch)
    : null;
  const publicationStatus =
    typeof selectedPublicationConvergence?.publicationStatus === "string"
      ? selectedPublicationConvergence.publicationStatus.toUpperCase()
      : null;
  const pendingAckCount = Array.isArray(
    selectedPublicationConvergence?.pendingAckNodeIds,
  )
    ? selectedPublicationConvergence.pendingAckNodeIds.length
    : ZERO;
  const missingPublishedCount = Array.isArray(
    snapshotCoverage?.selectedMissingPublishedNodeIds,
  )
    ? snapshotCoverage.selectedMissingPublishedNodeIds.length
    : ZERO;
  const prioritySpreadSatisfied =
    selectedPublicationConvergence?.priorityPartitionSummary &&
    typeof selectedPublicationConvergence.priorityPartitionSummary === "object"
      ? selectedPublicationConvergence.priorityPartitionSummary.satisfied
      : null;
  const priorityRecoveryProgressClassCount =
    summarizePriorityRecoveryProgressClasses(
      snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots || null,
    ).unresolvedClassCount;
  return (
    String(bestCoverageNodeCount) +
    "/" +
    String(expectedNodeCount) +
    (selectedNodeId ? "@" + selectedNodeId : "") +
    (selectedCapturedAtMs !== null
      ? "#ts=" + String(selectedCapturedAtMs)
      : "") +
    (selectedAdminReady !== null
      ? "#adminReady=" + String(selectedAdminReady)
      : "") +
    (selectedReachableBy ? "#via=" + selectedReachableBy : "") +
    (selectedReachabilityError
      ? "#adminError=" + selectedReachabilityError
      : "") +
    (selectedSnapshotTimeoutMs !== null &&
    selectedSnapshotTimeoutMs < CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS
      ? "#probeMs=" + String(selectedSnapshotTimeoutMs)
      : "") +
    (selectedReachabilityTimeoutMs !== null &&
    selectedReachabilityTimeoutMs <
      CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS
      ? "#reachabilityProbeMs=" + String(selectedReachabilityTimeoutMs)
      : "") +
    (publicationEpoch !== null ? "#epoch=" + String(publicationEpoch) : "") +
    (publicationStatus ? "#pub=" + publicationStatus : "") +
    (pendingAckCount > ZERO ? "#pendingAck=" + String(pendingAckCount) : "") +
    (missingPublishedCount > ZERO
      ? "#missingPublished=" + String(missingPublishedCount)
      : "") +
    (prioritySpreadSatisfied === false
      ? "#prioritySpread=pending"
      : prioritySpreadSatisfied === true
        ? "#prioritySpread=ready"
        : "") +
    (Number.isInteger(priorityRecoveryProgressClassCount) &&
    priorityRecoveryProgressClassCount > ZERO
      ? "#priorityRecovery=" + String(priorityRecoveryProgressClassCount)
      : "")
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
      "object"
      ? snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots
      : null;
  const selectedPublicationConvergenceGate =
    snapshotCoverage?.selectedPublicationConvergenceGate &&
    typeof snapshotCoverage.selectedPublicationConvergenceGate === "object"
      ? snapshotCoverage.selectedPublicationConvergenceGate
      : null;
  const publicationConvergence =
    snapshotCoverage?.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === "object"
      ? snapshotCoverage.selectedPublicationConvergence
      : null;
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
    typeof publicationRecoveryGate?.publicationStatusNormalized === "string" &&
    publicationRecoveryGate.publicationStatusNormalized.length > ZERO
      ? publicationRecoveryGate.publicationStatusNormalized
      : typeof publicationConvergence?.publicationStatus === "string"
        ? publicationConvergence.publicationStatus.toUpperCase()
        : null;
  const publishedActiveNodeIds = normalizeDistinctStringArray(
    publicationConvergence?.publishedActiveNodeIds,
  );
  const recoveryActiveNodeIds = normalizeDistinctStringArray(
    publicationConvergence?.recoveryActiveNodeIds ??
      publicationConvergence?.membershipLifecycleSummary
        ?.recoveryActiveNodeIds ??
      publicationConvergence?.membershipLifecycleSummary
        ?.locallyEligibleNodeIds ??
      publicationConvergence?.membershipLifecycleSummary
        ?.projectedServingNodeIds ??
      publicationConvergence?.publishedActiveNodeIds,
  );
  const pendingAckNodeIds = normalizeDistinctStringArray(
    publicationRecoveryGate?.pendingAckNodeIds ??
      publicationConvergence?.pendingAckNodeIds,
  );
  const recoveryProtocolState =
    typeof publicationRecoveryGate?.recoveryProtocolState === "string" &&
    publicationRecoveryGate.recoveryProtocolState.length > ZERO
      ? publicationRecoveryGate.recoveryProtocolState
      : typeof publicationConvergence?.recoveryProtocolState === "string" &&
          publicationConvergence.recoveryProtocolState.length > ZERO
        ? publicationConvergence.recoveryProtocolState
        : null;
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    publicationRecoveryGate?.reasonCodes ??
      publicationConvergence?.priorityRecoveryReasonCodes,
  );
  const priorityPartitionSummary =
    publicationRecoveryGate?.priorityPartitionSummary &&
    typeof publicationRecoveryGate.priorityPartitionSummary === "object"
      ? publicationRecoveryGate.priorityPartitionSummary
      : publicationConvergence?.priorityPartitionSummary &&
          typeof publicationConvergence.priorityPartitionSummary === "object"
        ? publicationConvergence.priorityPartitionSummary
        : null;
  const missingPublishedNodeIds = expectedPublishedNodeIds.filter((nodeId) => {
    return !publishedActiveNodeIds.includes(nodeId);
  });
  const publicationRecoveryGateMissingPublishedNodeIds =
    normalizeDistinctStringArray(publicationRecoveryGate?.missingPublishedNodeIds);
  const effectiveMissingPublishedNodeIds = normalizeDistinctStringArray([
    ...missingPublishedNodeIds,
    ...publicationRecoveryGateMissingPublishedNodeIds,
  ]);
  const reasons = [];

  if (!publicationConvergence && !selectedPublicationConvergenceGate) {
    reasons.push(ACTIVE_PROBE_REASON_PUBLICATION_CONVERGENCE_MISSING);
  }
  if (publicationStatus !== "PUBLISHED") {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_NOT_PUBLISHED_PREFIX +
        String(publicationStatus || "unknown"),
    );
  }
  if (pendingAckNodeIds.length > ZERO) {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_PENDING_ACK_PREFIX +
        String(pendingAckNodeIds.length),
    );
  }
  const missingRecoveryActiveNodeIds = expectedPublishedNodeIds.filter(
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
      typeof publicationConvergence?.recoveryActiveNodeSource === "string" &&
      publicationConvergence.recoveryActiveNodeSource.length > ZERO
        ? publicationConvergence.recoveryActiveNodeSource
        : null,
    pendingAckNodeIds,
    missingPublishedNodeIds: effectiveMissingPublishedNodeIds,
    missingRecoveryActiveNodeIds,
    priorityPartitionSummary,
  };
}

function evaluatePriorityRecoveryCrossServiceInvariants(options = {}) {
  const readinessMode =
    options.readinessMode === CLUSTER_READINESS_MODE_LOAD
      ? CLUSTER_READINESS_MODE_LOAD
      : CLUSTER_READINESS_MODE_STARTUP;
  const publicationConvergenceGate =
    options.publicationConvergenceGate &&
    typeof options.publicationConvergenceGate === "object"
      ? options.publicationConvergenceGate
      : { ready: true, reasons: [] };
  const gateReasons = normalizeDistinctStringArray(
    publicationConvergenceGate.reasons,
  );
  const nodeDiagnostics = Array.isArray(options.nodeDiagnostics)
    ? options.nodeDiagnostics
    : [];
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
    .map((diagnostic) => String(diagnostic.nodeId || ""))
    .filter((nodeId) => nodeId.length > ZERO);
  const trafficBlockedNodeIds = nodeDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic?.activitySource ===
          ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS &&
        diagnostic?.active === false,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ""))
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
    .map((diagnostic) => String(diagnostic.nodeId || ""))
    .filter((nodeId) => nodeId.length > ZERO);
  const trafficAdmittedNodeIds = nodeDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic?.activitySource ===
          ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS &&
        diagnostic?.active === true,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ""))
    .filter((nodeId) => nodeId.length > ZERO);
  const nonTrafficAdmittedNodeIds = nodeDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic?.active === true &&
        diagnostic?.activitySource !==
          ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ""))
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
    .map((diagnostic) => String(diagnostic.nodeId || ""))
    .filter((nodeId) => nodeId.length > ZERO);
  const deferredAdmittedNodeIds =
    readinessMode === CLUSTER_READINESS_MODE_LOAD && prioritySpreadPending
      ? readinessTimeoutFallbackAdmittedNodeIds
      : [];
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
    readinessMode === CLUSTER_READINESS_MODE_STARTUP
      ? !prioritySpreadPending || bootstrapAdmittedNodeIds.length > ZERO
      : true;
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
    readinessMode === CLUSTER_READINESS_MODE_LOAD
      ? !prioritySpreadPending ||
        (expectedBlockedNodeCount > ZERO &&
          effectiveAdmittedNodeIds.length === ZERO)
      : true;
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
    options.allActive === true
      ? publicationConvergenceGate.ready === true
      : true;
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
        typeof reasonCode === "string" && reasonCode.length > ZERO,
    );
  return {
    invariants: Object.freeze(
      invariants.map((invariant) =>
        Object.freeze({
          ...invariant,
          details: Object.freeze({ ...invariant.details }),
        }),
      ),
    ),
    failingInvariantIds: Object.freeze(failingInvariantIds),
    failingInvariantReasonCodes: Object.freeze(failingInvariantReasonCodes),
    passed: failingInvariantIds.length === ZERO,
  };
}

function formatPublicationConvergenceGate(publicationConvergenceGate) {
  if (
    !publicationConvergenceGate ||
    typeof publicationConvergenceGate !== "object"
  ) {
    return "none";
  }
  if (publicationConvergenceGate.ready === true) {
    return "ready";
  }
  const reasons = Array.isArray(publicationConvergenceGate.reasons)
    ? publicationConvergenceGate.reasons
    : [];
  if (reasons.length > ZERO) {
    return reasons.join(",");
  }
  return "blocked";
}

function normalizeActiveWaitPublicationStatus(status) {
  if (typeof status !== "string") {
    return null;
  }
  const normalized = status.trim().toUpperCase();
  return normalized.length > ZERO ? normalized : null;
}

function resolveActiveWaitPublicationStatusRank(status) {
  const normalizedStatus = normalizeActiveWaitPublicationStatus(status);
  if (normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED) {
    return 3;
  }
  if (normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING) {
    return 2;
  }
  if (
    normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHING ||
    normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PREPARED
  ) {
    return 1;
  }
  return ZERO;
}

function buildActiveWaitProgressSnapshot(
  probeResult = {},
  expectedNodeCount = ZERO,
  options = {},
) {
  const readinessMode =
    options?.readinessMode === CLUSTER_READINESS_MODE_LOAD
      ? CLUSTER_READINESS_MODE_LOAD
      : CLUSTER_READINESS_MODE_STARTUP;
  const nodeDiagnostics = Array.isArray(probeResult?.nodeDiagnostics)
    ? probeResult.nodeDiagnostics
    : [];
  const activeNodeCount = nodeDiagnostics.filter(
    (diagnostic) => diagnostic?.active === true,
  ).length;
  const inactiveNodeCount = Math.max(
    ZERO,
    nodeDiagnostics.length - activeNodeCount,
  );

  const snapshotCoverage =
    probeResult?.snapshotCoverage &&
    typeof probeResult.snapshotCoverage === "object"
      ? probeResult.snapshotCoverage
      : null;
  const normalizedExpectedNodeCount =
    Number.isInteger(snapshotCoverage?.expectedNodeCount) &&
    snapshotCoverage.expectedNodeCount > ZERO
      ? snapshotCoverage.expectedNodeCount
      : Math.max(ZERO, expectedNodeCount);
  const snapshotCoverageNodeCount =
    Number.isInteger(snapshotCoverage?.bestCoverageNodeCount) &&
    snapshotCoverage.bestCoverageNodeCount > ZERO
      ? snapshotCoverage.bestCoverageNodeCount
      : ZERO;
  const snapshotCoverageComplete = snapshotCoverage?.completeCoverage === true;

  const publicationConvergence =
    snapshotCoverage?.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === "object"
      ? snapshotCoverage.selectedPublicationConvergence
      : null;
  const publicationConvergenceGate =
    probeResult?.publicationConvergenceGate &&
    typeof probeResult.publicationConvergenceGate === "object"
      ? probeResult.publicationConvergenceGate
      : null;
  const publicationStatus = normalizeActiveWaitPublicationStatus(
    publicationConvergenceGate?.publicationStatus ||
      publicationConvergence?.publicationStatus,
  );
  const recoveryProtocolState =
    typeof publicationConvergenceGate?.recoveryProtocolState === "string" &&
    publicationConvergenceGate.recoveryProtocolState.length > ZERO
      ? publicationConvergenceGate.recoveryProtocolState
      : typeof publicationConvergence?.recoveryProtocolState === "string" &&
          publicationConvergence.recoveryProtocolState.length > ZERO
        ? publicationConvergence.recoveryProtocolState
        : null;
  const publicationEpoch = Number.isFinite(
    publicationConvergence?.publicationEpoch,
  )
    ? Math.floor(publicationConvergence.publicationEpoch)
    : null;
  const selectedSnapshotNodeId =
    typeof snapshotCoverage?.selectedNodeId === "string" &&
    snapshotCoverage.selectedNodeId.length > ZERO
      ? snapshotCoverage.selectedNodeId
      : null;
  const selectedSnapshotAdminReady =
    snapshotCoverage?.selectedAdminReady === true
      ? true
      : snapshotCoverage?.selectedAdminReady === false
        ? false
        : null;
  const selectedSnapshotReachableBy =
    typeof snapshotCoverage?.selectedReachableBy === "string" &&
    snapshotCoverage.selectedReachableBy.length > ZERO
      ? snapshotCoverage.selectedReachableBy
      : null;
  const selectedSnapshotError =
    typeof snapshotCoverage?.selectedError === "string" &&
    snapshotCoverage.selectedError.length > ZERO
      ? snapshotCoverage.selectedError
      : null;
  const selectedSnapshotReachabilityError =
    typeof snapshotCoverage?.selectedReachabilityError === "string" &&
    snapshotCoverage.selectedReachabilityError.length > ZERO
      ? snapshotCoverage.selectedReachabilityError
      : null;
  const selectedControlPlaneOwnerQueueDepth =
    snapshotCoverage?.selectedControlPlaneOwnerQueueDepth &&
    typeof snapshotCoverage.selectedControlPlaneOwnerQueueDepth === "object"
      ? snapshotCoverage.selectedControlPlaneOwnerQueueDepth
      : null;
  const selectedCdcReplayLag =
    snapshotCoverage?.selectedCdcReplayLag &&
    typeof snapshotCoverage.selectedCdcReplayLag === "object"
      ? snapshotCoverage.selectedCdcReplayLag
      : null;
  const perNodePublicationDisagreementSet =
    snapshotCoverage?.publicationDisagreementByNodeId &&
    typeof snapshotCoverage.publicationDisagreementByNodeId === "object"
      ? Object.fromEntries(
          Object.entries(snapshotCoverage.publicationDisagreementByNodeId)
            .map(([nodeId, missingNodeIds]) => {
              const normalizedNodeId = String(nodeId || "").trim();
              return [
                normalizedNodeId,
                normalizeDistinctStringArray(missingNodeIds),
              ];
            })
            .filter(([nodeId]) => nodeId.length > ZERO),
        )
      : {};
  const selectedPublishedActiveNodeIds = normalizeDistinctStringArray(
    snapshotCoverage?.selectedPublishedActiveNodeIds ||
      publicationConvergence?.publishedActiveNodeIds,
  );
  const pendingAckNodeIds = normalizeDistinctStringArray(
    snapshotCoverage?.selectedPendingAckNodeIds ||
      publicationConvergenceGate?.pendingAckNodeIds ||
      publicationConvergence?.pendingAckNodeIds,
  );
  const missingPublishedNodeIds = normalizeDistinctStringArray([
    ...(Array.isArray(snapshotCoverage?.selectedMissingPublishedNodeIds)
      ? snapshotCoverage.selectedMissingPublishedNodeIds
      : []),
    ...(Array.isArray(publicationConvergenceGate?.missingPublishedNodeIds)
      ? publicationConvergenceGate.missingPublishedNodeIds
      : []),
  ]);
  const gateReasons = normalizeDistinctStringArray(
    publicationConvergenceGate?.reasons,
  ).sort();
  const priorityPartitionSummary =
    publicationConvergenceGate?.priorityPartitionSummary &&
    typeof publicationConvergenceGate.priorityPartitionSummary === "object"
      ? publicationConvergenceGate.priorityPartitionSummary
      : publicationConvergence?.priorityPartitionSummary &&
          typeof publicationConvergence.priorityPartitionSummary === "object"
        ? publicationConvergence.priorityPartitionSummary
        : null;
  const prioritySpreadSatisfied =
    priorityPartitionSummary?.satisfied === true
      ? true
      : priorityPartitionSummary?.satisfied === false
        ? false
        : null;
  const prioritySpreadGap =
    Number.isInteger(priorityPartitionSummary?.totalSpreadGap) &&
    priorityPartitionSummary.totalSpreadGap >= ZERO
      ? priorityPartitionSummary.totalSpreadGap
      : null;
  const priorityBlockedPartitionCount =
    Number.isInteger(priorityPartitionSummary?.blockedPartitionCount) &&
    priorityPartitionSummary.blockedPartitionCount >= ZERO
      ? priorityPartitionSummary.blockedPartitionCount
      : null;
  const priorityRecoveryDecisionSnapshots =
    snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots &&
    typeof snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots ===
      "object"
      ? snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots
      : null;
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
        "/" +
        String(normalizedExpectedNodeCount),
    );
  }
  if (
    typeof snapshotCoverage?.selectedError === "string" &&
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
      missingPublishedCount: missingPublishedNodeIds.length,
      gateReasons,
      prioritySpreadSatisfied,
      priorityRecoveryDecisionSnapshots,
      priorityRecoveryClosureWitness:
        priorityRecoveryDecisionSnapshots?.closureWitness || null,
      publicationRecoveryGate:
        publicationConvergenceGate?.publicationRecoveryGate ||
        publicationConvergenceGate ||
        null,
      selectedSnapshotAdminReady,
      selectedSnapshotReachableBy,
      selectedSnapshotError,
      selectedSnapshotReachabilityError,
    },
    publicationConvergence,
    publicationConvergenceGate,
    readinessMode,
  });
  const closureRecordId =
    (typeof publicationConvergenceGate?.closureRecordId === "string" &&
    publicationConvergenceGate.closureRecordId.length > ZERO
      ? publicationConvergenceGate.closureRecordId
      : null) ||
    (typeof publicationConvergence?.closureRecordId === "string" &&
    publicationConvergence.closureRecordId.length > ZERO
      ? publicationConvergence.closureRecordId
      : null) ||
    closureWitness?.closureRecordId ||
    null;
  const closureWitnessClass =
    (typeof publicationConvergenceGate?.closureWitnessClass === "string" &&
    publicationConvergenceGate.closureWitnessClass.length > ZERO
      ? publicationConvergenceGate.closureWitnessClass
      : null) ||
    (typeof publicationConvergence?.closureWitnessClass === "string" &&
    publicationConvergence.closureWitnessClass.length > ZERO
      ? publicationConvergence.closureWitnessClass
      : null) ||
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
    selectedSnapshotAdminReady,
    selectedSnapshotReachableBy,
    selectedSnapshotError,
    selectedSnapshotReachabilityError,
    selectedControlPlaneOwnerQueueDepth,
    selectedCdcReplayLag,
    perNodePublicationDisagreementSet,
    selectedPublishedActiveNodeIds,
    selectedPublishedActiveCount: selectedPublishedActiveNodeIds.length,
    selectedMissingPublishedNodeIds: missingPublishedNodeIds,
    pendingAckCount: pendingAckNodeIds.length,
    missingPublishedCount: missingPublishedNodeIds.length,
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
    blockerSignature: blockers.join("|"),
  };
}

function normalizePriorityRecoverySemanticStateId(semanticState) {
  const normalizedSemanticState = String(semanticState || "").trim();
  if (normalizedSemanticState.length === ZERO) {
    return null;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(normalizedSemanticState)
    ? normalizedSemanticState
    : null;
}

function inferPriorityRecoverySemanticState(snapshot, blockerReasons = []) {
  for (const blockerReason of PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE) {
    if (!blockerReasons.includes(blockerReason)) {
      continue;
    }
    return (
      PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] ||
      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED
    );
  }
  if (snapshot?.planner?.ready === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED;
  }
  if (snapshot?.spreadCompletion?.satisfied === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
  }
  if (
    Number(snapshot?.coordinator?.operationCount) > ZERO ||
    (typeof snapshot?.operationId === "string" &&
      snapshot.operationId.length > ZERO)
  ) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
}

function buildPriorityRecoveryExplicitSemanticStateByPartitionId(
  partitionIdsBySemanticState,
) {
  const explicitSemanticStateByPartitionId = new Map();
  if (
    !partitionIdsBySemanticState ||
    typeof partitionIdsBySemanticState !== "object" ||
    Array.isArray(partitionIdsBySemanticState)
  ) {
    return explicitSemanticStateByPartitionId;
  }
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    const normalizedSemanticState =
      normalizePriorityRecoverySemanticStateId(semanticState);
    if (!normalizedSemanticState) {
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
  const explicitSemanticState =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticStateId) ||
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticState);
  if (explicitSemanticState) {
    return explicitSemanticState;
  }
  const partitionId = String(snapshot?.partitionId || "").trim();
  if (
    partitionId.length === ZERO ||
    !(explicitSemanticStateByPartitionId instanceof Map)
  ) {
    return null;
  }
  return explicitSemanticStateByPartitionId.get(partitionId) || null;
}

function resolvePriorityRecoveryDecisionSnapshotSortTimestamp(snapshot) {
  const updatedAtMs = Number(
    snapshot?.coordinator?.operation?.updatedAtMs ??
      snapshot?.observation?.provenance?.capturedAt ??
      ZERO,
  );
  return Number.isFinite(updatedAtMs) ? updatedAtMs : ZERO;
}

function comparePriorityRecoveryDecisionSummarySnapshots(left, right) {
  const leftEpoch = Number.isFinite(left?.epoch) ? left.epoch : -1;
  const rightEpoch = Number.isFinite(right?.epoch) ? right.epoch : -1;
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
  return String(left?.correlationKey || "").localeCompare(
    String(right?.correlationKey || ""),
  );
}

function selectPriorityRecoveryDecisionSummarySnapshots(snapshots) {
  const latestSnapshotByPartitionId = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    if (!snapshot || typeof snapshot !== "object") {
      continue;
    }
    const partitionId = String(snapshot.partitionId || "").trim();
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
  const snapshots = Array.isArray(priorityRecoveryDecisionSnapshots?.snapshots)
    ? priorityRecoveryDecisionSnapshots.snapshots
    : [];
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
    const partitionId = String(snapshot?.partitionId || "").trim();
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
      ) ||
      inferPriorityRecoverySemanticState(snapshot, blockerReasons);
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
  inferPriorityRecoverySemanticState,
  summarizePriorityRecoveryProgressClasses,
};
