/**
 * Shared helpers for distributed scenarios that validate table partition
 * growth and replica spread.
 */

import assert from "node:assert/strict";
import {
  resolvePartitionGrowthAndSpreadScenarioConfig,
  resolveTableDistributionQueryConfig,
} from "../harness/scenario-config.js";
import { BENCHMARK_DEFAULTS, TIMEOUTS } from "../harness/constants.js";
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from "../../../src/control-plane/control-plane-error-classification.js";
import { evaluatePartitionReplicaTopology } from "../../../src/admin/admin-shared-metadata-consistency.js";
import {
  BENCHMARK_PARTITION_DISPATCH_MODE,
  buildBenchmarkConvergenceEvaluationSummaries,
  buildBenchmarkLoadAdmissionSnapshot,
  buildBenchmarkPartitionConvergenceSnapshot,
  isBenchmarkCriticalControlPlaneStable,
  resolveBenchmarkPartitionDispatchMode,
} from "../harness/benchmark-partition-convergence.js";
import { isStartupAdminReachabilityTransientError } from "../harness/startup-readiness-evidence.js";
import { hasControlPlaneMutationRoutingGapFailureSignature } from "../../../src/control-plane/control-plane-mutation-readiness-constants.js";
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  isPendingControlPlaneSystemTableVisibilityState,
  normalizeControlPlaneSystemTableVisibilityState,
} from "../../../src/control-plane/control-plane-system-table-visibility-constants.js";
import {
  OWNER_CONTRACT_STATE,
  normalizeOwnerContractNextAction,
  normalizeOwnerContractState,
} from "../../../src/control-plane/owner-contract-outcome.js";

const TABLE_NAME_LOGS = "logs";
const TABLE_NAME_BENCHMARK_EVENTS = "benchmark_events";
const SERVICE_TYPE_PARTITION = "partition";
const STATUS_ACTIVE = "active";
const ZERO = 0;
const ONE = 1;
const BENCHMARK_WORKLOAD_PROFILE = "benchmark_events_mixed";
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TABLE_ID_VISIBILITY_TIMEOUT_MS = 10000;
const TABLE_BOOTSTRAP_TIMEOUT_MS = 30000;
const TABLE_BOOTSTRAP_POST_CREATE_VISIBILITY_RESERVE_MS =
  TABLE_ID_VISIBILITY_TIMEOUT_MS;
const TABLE_ID_VISIBILITY_POLL_INTERVAL_MS = 100;
const CONTROL_QUERY_TIMEOUT_MS = 30000;
const POLICY_APPLY_TIMEOUT_MS = 60000;
const POLICY_APPLY_ATTEMPT_TIMEOUT_MS = 15000;
const POLICY_VISIBILITY_POLL_INTERVAL_MS = 250;
const POLICY_APPLY_RETRY_DELAY_MS = 250;
const CONTROL_QUERY_LANE_CONTROL = "control";
const CONTROL_QUERY_LANE_SNAPSHOT = "snapshot";
const CONTROL_QUERY_PROGRESS_RETRY_DELAY_MS = 100;
const CONTROL_QUERY_MIN_CANDIDATE_TIMEOUT_MS = 1000;
const CONTROL_QUERY_MUTATION_FALLBACK_ERROR_FRAGMENTS = Object.freeze([
  "failed to reconnect target node before delivery",
  "socket is not open",
  "websocket transport required but not available",
  "channel closed",
]);
const CONTROL_QUERY_EXECUTION_MODE = Object.freeze({
  READ_FANOUT: "read_fanout",
  MUTATION_SINGLE_FLIGHT: "mutation_single_flight",
});
const CONTROL_QUERY_OUTCOME_DEFERRED = "deferred";
const TABLE_POLICY_PRECONDITION_SCENARIO_DEFAULT = "unknown-scenario";
const DEFAULT_BENCHMARK_READY_NODE_COUNT = 3;
const PARTITIONING_LOAD_HEADROOM_RATIO = 0.5;
const TABLE_DISTRIBUTION_TOPOLOGY_STALL_TIMEOUT_MS = 15000;
const TABLE_BOOTSTRAP_PARTITION_VISIBILITY_MISSING =
  "table_id_visible_without_partitions";
const TABLE_BOOTSTRAP_TOPOLOGY_NOT_ROUTABLE_PREFIX =
  "table_distribution_not_routable";
const TABLE_BOOTSTRAP_VISIBILITY_STATE = Object.freeze({
  NONE: "none",
  TABLE_ID_VISIBLE: "table_id_visible",
  PARTITIONS_VISIBLE: "partitions_visible",
  ROUTABLE_DISTRIBUTION: "routable_distribution",
});
const TABLE_BOOTSTRAP_VISIBILITY_STATE_ORDER = Object.freeze({
  [TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE]: ZERO,
  [TABLE_BOOTSTRAP_VISIBILITY_STATE.TABLE_ID_VISIBLE]: ONE,
  [TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE]: 2,
  [TABLE_BOOTSTRAP_VISIBILITY_STATE.ROUTABLE_DISTRIBUTION]: 3,
});
const TABLE_BOOTSTRAP_VISIBILITY_STATE_LABEL = Object.freeze({
  [TABLE_BOOTSTRAP_VISIBILITY_STATE.NONE]: "benchmark table visibility",
  [TABLE_BOOTSTRAP_VISIBILITY_STATE.TABLE_ID_VISIBLE]: "table_id visibility",
  [TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE]:
    "table partition visibility",
  [TABLE_BOOTSTRAP_VISIBILITY_STATE.ROUTABLE_DISTRIBUTION]:
    "routable table distribution visibility",
});
const TOPOLOGY_STATE_ROUTABLE = "routable";
const TOPOLOGY_STATE_OPAQUE = "opaque";
const TOPOLOGY_STATE_INVALID = "invalid";
const TOPOLOGY_REASON_LEADER_SERVICE_MISSING = "leader_service_missing";
const TOPOLOGY_REASON_ABOVE_TARGET_REPLICA_COUNT = "above_target_replica_count";
const RAFT_ROLE_LEADER = "leader";
const PARTITIONING_ADAPTIVE_DISPATCH_GUARDRAIL = Object.freeze({
  enabled: true,
  pressureSignalThreshold: 2,
  queueDepthThreshold: 4,
  reductionStepRatio: 0.25,
  minMaxInFlight: 2,
  recoveryQuietTicks: 8,
});

const DEFAULT_TABLE_SPLIT_POLICIES = Object.freeze({
  externalCdcAllowed: false,
  splitStorageThreshold: 16384,
  splitTrafficThreshold: 120,
  mergeStorageThreshold: 1,
  mergeTrafficThreshold: 1,
});

const SQL_SELECT_TABLE_PARTITIONS_PREFIX =
  "SELECT partition_id, replica_count, leader_node_id FROM partitions WHERE table_name = '";
const SQL_SELECT_TABLE_PARTITIONS_SUFFIX = "'";
const SQL_SELECT_TABLE_ID_PREFIX =
  "SELECT table_id FROM tables WHERE table_name = '";
const SQL_SELECT_TABLE_ID_SUFFIX = "'";
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_PREFIX =
  "SELECT table_policies FROM tables WHERE table_id = '";
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_SUFFIX = "'";
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_PREFIX =
  "SELECT table_policies FROM tables WHERE table_name = '";
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_SUFFIX = "'";
const SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX =
  "SELECT partition_id, replica_count, leader_node_id FROM partitions WHERE table_id = '";
const SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX = "'";
const SQL_CREATE_TABLE_PREFIX = "CREATE TABLE IF NOT EXISTS ";
const SQL_CREATE_TABLE_SUFFIX =
  " (event_id TEXT PRIMARY KEY, payload INTEGER NOT NULL, created_at INTEGER NOT NULL)";
const SQL_UPDATE_TABLE_POLICIES_PREFIX = "UPDATE tables SET table_policies = '";
const SQL_UPDATE_TABLE_POLICIES_MID = "' WHERE table_id = '";
const SQL_UPDATE_TABLE_POLICIES_SUFFIX = "'";
const SQL_CONTROL_SNAPSHOT = "SELECT * FROM control_snapshot_local()";
const SQL_CONTROL_SNAPSHOT_FORCE_REPAIR =
  "SELECT * FROM control_snapshot_local(true)";
const SQL_SELECT_ACTIVE_PARTITION_SERVICES_PREFIX =
  "SELECT partition_id, node_id, status, raft_role FROM services " +
  "WHERE service_type = '" +
  SERVICE_TYPE_PARTITION +
  "' " +
  "AND status = '" +
  STATUS_ACTIVE +
  "'";

const TIMEOUT_ERROR_PATTERN = /timeout|timed out|deadline exceeded|etimedout/i;
const TABLE_DISTRIBUTION_OBSERVATION_STATE_OBSERVED = "observed";
const TABLE_DISTRIBUTION_OBSERVATION_STATE_DEFERRED = "deferred";
const TABLE_DISTRIBUTION_OBSERVATION_STATE_UNAVAILABLE = "unavailable";
const TABLE_DISTRIBUTION_OBSERVATION_SIGNATURE_DEFERRED = "query:deferred";
const TABLE_DISTRIBUTION_OBSERVATION_SIGNATURE_UNAVAILABLE =
  "query:unavailable";
const CONTROL_SNAPSHOT_OBSERVATION_FIELD = "snapshotObservation";
const CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD = "state";
const CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD = "contractState";
const CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED = "failed";
const CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FAILED = "failed";

/**
 * Sleep helper for polling loops.
 * @param {number} delayMs
 * @return {Promise<void>}
 */
function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function mapNodeIds(nodes) {
  return (Array.isArray(nodes) ? nodes : [])
    .map((node) => String(node?.id || ""))
    .filter((nodeId) => nodeId.length > ZERO);
}

function normalizePlannerObservationReasonCodes(reasonCodes) {
  return Array.isArray(reasonCodes)
    ? [
        ...new Set(
          reasonCodes
            .map((reasonCode) => String(reasonCode || "").trim())
            .filter((reasonCode) => reasonCode.length > ZERO),
        ),
      ]
    : [];
}

function resolveTableDistributionObservationState(error) {
  return isRetryableControlPlaneProgressError(error) ||
    isTimeoutShapedError(error)
    ? TABLE_DISTRIBUTION_OBSERVATION_STATE_DEFERRED
    : TABLE_DISTRIBUTION_OBSERVATION_STATE_UNAVAILABLE;
}

function buildTableDistributionObservationReasonCodes(error) {
  return normalizePlannerObservationReasonCodes(
    Array.isArray(error?.reasonCodes)
      ? error.reasonCodes
      : typeof error?.reasonCode === "string"
        ? [error.reasonCode]
        : [],
  );
}

function extractControlSnapshotObservation(result = null) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const firstRow =
    rows.length > ZERO &&
    rows[ZERO] &&
    typeof rows[ZERO] === "object" &&
    !Array.isArray(rows[ZERO])
      ? rows[ZERO]
      : null;
  const observation = firstRow?.[CONTROL_SNAPSHOT_OBSERVATION_FIELD];
  if (
    !observation ||
    typeof observation !== "object" ||
    Array.isArray(observation)
  ) {
    return null;
  }
  return observation;
}

function shouldFallbackToForcedControlSnapshot(result = null) {
  const observation = extractControlSnapshotObservation(result);
  if (!observation) {
    return true;
  }
  const observationState = String(
    observation[CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD] || "",
  )
    .trim()
    .toLowerCase();
  const contractState = String(
    observation[CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD] || "",
  )
    .trim()
    .toLowerCase();
  return (
    observationState === CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED ||
    contractState === CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FAILED
  );
}

function cloneCriticalControlPlaneStabilitySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  return {
    ...snapshot,
    reasonCodes: normalizePlannerObservationReasonCodes(snapshot.reasonCodes),
    pendingAckNodeIds: normalizePlannerObservationReasonCodes(
      snapshot.pendingAckNodeIds,
    ),
    missingPublishedNodeIds: normalizePlannerObservationReasonCodes(
      snapshot.missingPublishedNodeIds,
    ),
    missingRecoveryActiveNodeIds: normalizePlannerObservationReasonCodes(
      snapshot.missingRecoveryActiveNodeIds,
    ),
    controlPlaneOwnerQueueDepth:
      snapshot.controlPlaneOwnerQueueDepth &&
      typeof snapshot.controlPlaneOwnerQueueDepth === "object"
        ? { ...snapshot.controlPlaneOwnerQueueDepth }
        : null,
    cdcReplayLag:
      snapshot.cdcReplayLag && typeof snapshot.cdcReplayLag === "object"
        ? { ...snapshot.cdcReplayLag }
        : null,
  };
}

function buildPartitioningPlannerDiagnostics(options = {}) {
  return {
    selectedNodeCount: mapNodeIds(options.selectedNodes).length,
    selectedNodeIds: mapNodeIds(options.selectedNodes),
    admissionReadyNodeCount: mapNodeIds(options.admissionReadyNodes).length,
    admissionReadyNodeIds: mapNodeIds(options.admissionReadyNodes),
    readyReplicaNodeCount: mapNodeIds(options.readyReplicaNodes).length,
    readyReplicaNodeIds: mapNodeIds(options.readyReplicaNodes),
    replicaBearingNodeCount: Number(options.replicaBearingNodeCount || ZERO),
    replicaBearingNodeIds: Array.isArray(options.replicaBearingNodeIds)
      ? options.replicaBearingNodeIds.map((nodeId) => String(nodeId)).sort()
      : [],
    partitionCount: Number(options.partitionCount || ZERO),
    readinessReasonHistogram:
      options.readinessReasonHistogram &&
      typeof options.readinessReasonHistogram === "object"
        ? { ...options.readinessReasonHistogram }
        : null,
    convergenceStateHistogram:
      options.convergenceStateHistogram &&
      typeof options.convergenceStateHistogram === "object"
        ? { ...options.convergenceStateHistogram }
        : null,
    localPrimaryNodeCount: mapNodeIds(options.localPrimaryNodes).length,
    localPrimaryNodeIds: mapNodeIds(options.localPrimaryNodes),
    routedSupportNodeCount: mapNodeIds(options.routedSupportNodes).length,
    routedSupportNodeIds: mapNodeIds(options.routedSupportNodes),
    dispatchContributionHistogram:
      options.dispatchContributionHistogram &&
      typeof options.dispatchContributionHistogram === "object"
        ? { ...options.dispatchContributionHistogram }
        : null,
    degradationStateHistogram:
      options.degradationStateHistogram &&
      typeof options.degradationStateHistogram === "object"
        ? { ...options.degradationStateHistogram }
        : null,
    selectionObservationState:
      typeof options.selectionObservationState === "string" &&
      options.selectionObservationState.length > ZERO
        ? options.selectionObservationState
        : TABLE_DISTRIBUTION_OBSERVATION_STATE_OBSERVED,
    selectionObservationRetryAfterMs:
      Number.isFinite(options.selectionObservationRetryAfterMs) &&
      options.selectionObservationRetryAfterMs > ZERO
        ? Math.floor(options.selectionObservationRetryAfterMs)
        : ZERO,
    selectionObservationError:
      typeof options.selectionObservationError === "string" &&
      options.selectionObservationError.length > ZERO
        ? options.selectionObservationError
        : null,
    selectionObservationReasonCodes: normalizePlannerObservationReasonCodes(
      options.selectionObservationReasonCodes,
    ),
    criticalControlPlaneStability: cloneCriticalControlPlaneStabilitySnapshot(
      options.criticalControlPlaneStability,
    ),
    convergenceEvaluations: Array.isArray(options.convergenceEvaluations)
      ? options.convergenceEvaluations.map((evaluation) => ({ ...evaluation }))
      : [],
  };
}

function buildPartitioningPlannerTimeoutError(message, diagnostics) {
  const observationState = String(
    diagnostics?.selectionObservationState ||
      TABLE_DISTRIBUTION_OBSERVATION_STATE_OBSERVED,
  );
  const observationRetryAfterMs =
    Number.isFinite(diagnostics?.selectionObservationRetryAfterMs) &&
    diagnostics.selectionObservationRetryAfterMs > ZERO
      ? Math.floor(diagnostics.selectionObservationRetryAfterMs)
      : ZERO;
  const observationError =
    typeof diagnostics?.selectionObservationError === "string"
      ? diagnostics.selectionObservationError
      : "none";
  const criticalControlPlaneState =
    typeof diagnostics?.criticalControlPlaneStability?.state === "string"
      ? diagnostics.criticalControlPlaneStability.state
      : "none";
  const criticalControlPlaneReasons = normalizePlannerObservationReasonCodes(
    diagnostics?.criticalControlPlaneStability?.reasonCodes,
  );
  const error = new Error(
    message +
      "; lastSelectionObservationState=" +
      observationState +
      "; lastSelectionObservationRetryAfterMs=" +
      observationRetryAfterMs +
      "; lastSelectionObservationError=" +
      observationError +
      "; lastCriticalControlPlaneState=" +
      criticalControlPlaneState +
      "; lastCriticalControlPlaneReasons=" +
      (criticalControlPlaneReasons.length > ZERO
        ? criticalControlPlaneReasons.join(",")
        : "none"),
  );
  error.diagnostics = {
    partitioningPlanner: diagnostics,
  };
  return error;
}

function buildPartitioningDispatchPlannerDiagnostics(selected, dispatchNodes) {
  const baseDiagnostics =
    selected?.diagnostics && typeof selected.diagnostics === "object"
      ? selected.diagnostics
      : {};
  return buildPartitioningPlannerDiagnostics({
    selectedNodes: dispatchNodes,
    admissionReadyNodes: selected?.admissionReadyNodes,
    readyReplicaNodes: selected?.readyReplicaNodes,
    replicaBearingNodeCount: baseDiagnostics.replicaBearingNodeCount,
    replicaBearingNodeIds: baseDiagnostics.replicaBearingNodeIds,
    partitionCount: baseDiagnostics.partitionCount,
    readinessReasonHistogram: baseDiagnostics.readinessReasonHistogram,
    convergenceStateHistogram: baseDiagnostics.convergenceStateHistogram,
    localPrimaryNodes: selected?.localPrimaryNodes,
    routedSupportNodes: selected?.routedSupportNodes,
    dispatchContributionHistogram:
      baseDiagnostics.dispatchContributionHistogram,
    degradationStateHistogram: baseDiagnostics.degradationStateHistogram,
    selectionObservationState: baseDiagnostics.selectionObservationState,
    selectionObservationRetryAfterMs:
      baseDiagnostics.selectionObservationRetryAfterMs,
    selectionObservationError: baseDiagnostics.selectionObservationError,
    selectionObservationReasonCodes:
      baseDiagnostics.selectionObservationReasonCodes,
    criticalControlPlaneStability:
      baseDiagnostics.criticalControlPlaneStability,
    convergenceEvaluations: baseDiagnostics.convergenceEvaluations,
  });
}

function resolvePartitioningPlannerDiagnosticsSnapshot(resolver) {
  if (typeof resolver !== "function") {
    return null;
  }
  try {
    const diagnostics = resolver();
    return diagnostics && typeof diagnostics === "object" ? diagnostics : null;
  } catch (_error) {
    return null;
  }
}

function buildDeferredTableDistributionSnapshot(tableName, error) {
  const observationState = resolveTableDistributionObservationState(error);
  return {
    tableName,
    partitionIds: new Set(),
    partitionCount: ZERO,
    replicaNodeIds: new Set(),
    replicaNodeCount: ZERO,
    replicasByPartition: new Map(),
    serviceCount: ZERO,
    topologyState: TOPOLOGY_STATE_OPAQUE,
    topologySignature:
      observationState === TABLE_DISTRIBUTION_OBSERVATION_STATE_DEFERRED
        ? TABLE_DISTRIBUTION_OBSERVATION_SIGNATURE_DEFERRED
        : TABLE_DISTRIBUTION_OBSERVATION_SIGNATURE_UNAVAILABLE,
    opaquePartitionCount: ZERO,
    invalidPartitionCount: ZERO,
    leaderServiceMissingPartitionCount: ZERO,
    overReplicatedPartitionCount: ZERO,
    observationState,
    observationRetryAfterMs: Math.max(ZERO, getControlPlaneRetryAfterMs(error)),
    observationError: String(error?.message || error || ""),
    observationReasonCodes: buildTableDistributionObservationReasonCodes(error),
  };
}

function buildPartitioningPlannerDiagnosticsFromPreviousState(
  diagnostics,
  distribution,
  selectedNodes,
  admissionReadyNodes,
  readyReplicaNodes,
  localPrimaryNodes,
  routedSupportNodes,
  error,
) {
  const previousDiagnostics =
    diagnostics && typeof diagnostics === "object" ? diagnostics : {};
  return buildPartitioningPlannerDiagnostics({
    selectedNodes,
    admissionReadyNodes,
    readyReplicaNodes,
    replicaBearingNodeCount: Number(distribution?.replicaNodeCount || ZERO),
    replicaBearingNodeIds:
      distribution?.replicaNodeIds instanceof Set
        ? Array.from(distribution.replicaNodeIds)
        : [],
    partitionCount: Number(distribution?.partitionCount || ZERO),
    readinessReasonHistogram: previousDiagnostics.readinessReasonHistogram,
    convergenceStateHistogram: previousDiagnostics.convergenceStateHistogram,
    localPrimaryNodes,
    routedSupportNodes,
    dispatchContributionHistogram:
      previousDiagnostics.dispatchContributionHistogram,
    degradationStateHistogram: previousDiagnostics.degradationStateHistogram,
    selectionObservationState: resolveTableDistributionObservationState(error),
    selectionObservationRetryAfterMs: getControlPlaneRetryAfterMs(error),
    selectionObservationError: String(error?.message || error || ""),
    selectionObservationReasonCodes:
      buildTableDistributionObservationReasonCodes(error),
    criticalControlPlaneStability:
      previousDiagnostics.criticalControlPlaneStability,
    convergenceEvaluations: previousDiagnostics.convergenceEvaluations,
  });
}

function formatPlannerNodeIds(nodeIds) {
  return Array.isArray(nodeIds)
    ? nodeIds.map((nodeId) => String(nodeId)).join(",")
    : "";
}

function formatPlannerHistogram(histogram) {
  if (!histogram || typeof histogram !== "object") {
    return "none";
  }
  const entries = Object.entries(histogram)
    .map(([reason, count]) => [String(reason), Number(count)])
    .filter(([, count]) => Number.isFinite(count) && count > ZERO)
    .sort(([leftReason], [rightReason]) =>
      leftReason.localeCompare(rightReason),
    );
  if (entries.length === ZERO) {
    return "none";
  }
  return entries.map(([reason, count]) => reason + ":" + count).join("|");
}

function resolvePartitionGrowthFailureMode(options = {}) {
  const additionalPartitionCount = Number(
    options.additionalPartitionCount || ZERO,
  );
  const minAdditionalPartitions = Number(
    options.minAdditionalPartitions || ZERO,
  );
  const replicaNodeCount = Number(options.replicaNodeCount || ZERO);
  const minDistinctReplicaNodes = Number(
    options.minDistinctReplicaNodes || ZERO,
  );
  const topologyState = String(options.topologyState || "");
  const leaderServiceMissingPartitionCount = Number(
    options.leaderServiceMissingPartitionCount || ZERO,
  );
  const overReplicatedPartitionCount = Number(
    options.overReplicatedPartitionCount || ZERO,
  );
  const selectedNodeCount = Number(
    options.plannerDiagnostics?.selectedNodeCount || ZERO,
  );
  const admissionReadyNodeCount = Number(
    options.plannerDiagnostics?.admissionReadyNodeCount || ZERO,
  );
  const readyReplicaNodeCount = Number(
    options.plannerDiagnostics?.readyReplicaNodeCount || ZERO,
  );
  if (topologyState === TOPOLOGY_STATE_INVALID) {
    if (leaderServiceMissingPartitionCount > ZERO) {
      return TOPOLOGY_REASON_LEADER_SERVICE_MISSING;
    }
    if (overReplicatedPartitionCount > ZERO) {
      return TOPOLOGY_REASON_ABOVE_TARGET_REPLICA_COUNT;
    }
    return "routable_visibility_stalled";
  }
  if (
    additionalPartitionCount < minAdditionalPartitions &&
    replicaNodeCount < minDistinctReplicaNodes &&
    (selectedNodeCount === ZERO ||
      (admissionReadyNodeCount === ZERO && readyReplicaNodeCount === ZERO))
  ) {
    return "planner_not_runnable";
  }
  if (additionalPartitionCount < minAdditionalPartitions) {
    return "partition_growth_stalled";
  }
  if (replicaNodeCount < minDistinctReplicaNodes) {
    return "replica_spread_stalled";
  }
  return "partitioning_timeout";
}

/**
 * Check whether an error is timeout-shaped.
 * @param {Error|*} error
 * @return {boolean}
 */
function isTimeoutShapedError(error) {
  const message = String(error?.message || error || "");
  return TIMEOUT_ERROR_PATTERN.test(message);
}

function isRetryableControlPlaneProgressError(error) {
  if (getControlPlaneRetryAfterMs(error) > ZERO) {
    return true;
  }
  if (isRetryableControlPlaneError(error)) {
    return true;
  }
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("participant failures") ||
    message.includes("query_admission_deferred") ||
    message.includes("query_admission_rejected")
  );
}

function resolveControlPlaneRetryDelayMs(error, fallbackMs) {
  return Math.max(fallbackMs, getControlPlaneRetryAfterMs(error));
}

function resolveControlQueryTimeoutMs(timeoutMs) {
  return Number.isFinite(timeoutMs) && timeoutMs > ZERO
    ? Math.floor(timeoutMs)
    : CONTROL_QUERY_TIMEOUT_MS;
}

function resolveRemainingControlQueryTimeoutMs(deadlineAtMs) {
  return Math.max(ONE, Math.floor(deadlineAtMs - Date.now()));
}

function selectMeaningfulControlQueryNodes(queryNodes, timeoutMs) {
  const candidates = Array.isArray(queryNodes) ? queryNodes : [];
  if (candidates.length <= ONE) {
    return candidates;
  }
  const totalTimeoutMs = resolveControlQueryTimeoutMs(timeoutMs);
  const maxCandidateCount = Math.max(
    ONE,
    Math.floor(totalTimeoutMs / CONTROL_QUERY_MIN_CANDIDATE_TIMEOUT_MS),
  );
  if (candidates.length <= maxCandidateCount) {
    return candidates;
  }
  return candidates.slice(ZERO, maxCandidateCount);
}

function resolveControlQueryCandidateTimeoutMs(timeoutMs, candidateCount) {
  const totalTimeoutMs = resolveControlQueryTimeoutMs(timeoutMs);
  const normalizedCandidateCount =
    Number.isInteger(candidateCount) && candidateCount > ZERO
      ? candidateCount
      : ONE;
  return Math.max(ONE, Math.floor(totalTimeoutMs / normalizedCandidateCount));
}

function resolveControlQueryExecutionMode(options = {}) {
  const executionMode =
    typeof options.executionMode === "string"
      ? options.executionMode
      : CONTROL_QUERY_EXECUTION_MODE.READ_FANOUT;
  return executionMode === CONTROL_QUERY_EXECUTION_MODE.MUTATION_SINGLE_FLIGHT
    ? executionMode
    : CONTROL_QUERY_EXECUTION_MODE.READ_FANOUT;
}

function selectControlQueryExecutionNodes(
  queryNodes,
  timeoutMs,
  executionMode,
) {
  if (executionMode === CONTROL_QUERY_EXECUTION_MODE.MUTATION_SINGLE_FLIGHT) {
    return Array.isArray(queryNodes) ? queryNodes : [];
  }
  return selectMeaningfulControlQueryNodes(queryNodes, timeoutMs);
}

function hasControlQueryMutationVisibilityEvidence(error) {
  return (
    (typeof error?.visibilityState === "string" &&
      error.visibilityState.length > ZERO) ||
    error?.authoritativeVisibilityConfirmed === true
  );
}

function isControlQueryMutationPreExecutionDeferredError(error) {
  return (
    error?.deferRetry === true &&
    error?.outcome === CONTROL_QUERY_OUTCOME_DEFERRED &&
    Array.isArray(error?.failedDimensions) &&
    error.failedDimensions.length > ZERO &&
    !hasControlQueryMutationVisibilityEvidence(error) &&
    !hasControlPlaneMutationRoutingGapFailureSignature(error)
  );
}

function isControlQueryMutationFallbackEligibleError(error) {
  if (isTimeoutShapedError(error)) {
    return false;
  }
  if (isControlQueryMutationPreExecutionDeferredError(error)) {
    return true;
  }
  if (isRetryableControlPlaneProgressError(error)) {
    return false;
  }
  if (isStartupAdminReachabilityTransientError(error)) {
    return true;
  }
  const message = String(error?.message || error || "").toLowerCase();
  return CONTROL_QUERY_MUTATION_FALLBACK_ERROR_FRAGMENTS.some((fragment) =>
    message.includes(fragment),
  );
}

function shouldRetryControlQueryOnNextCandidate(error, executionMode) {
  if (executionMode !== CONTROL_QUERY_EXECUTION_MODE.MUTATION_SINGLE_FLIGHT) {
    return true;
  }
  return isControlQueryMutationFallbackEligibleError(error);
}

/**
 * Run one control-plane query with timeout-aware lane routing.
 * @param {Object} node
 * @param {string} sql
 * @param {Array<*>} [params]
 * @return {Promise<Object>}
 */
async function queryControl(node, sql, params = [], options = {}) {
  const totalTimeoutMs = resolveControlQueryTimeoutMs(options.timeoutMs);
  const executionMode = resolveControlQueryExecutionMode(options);
  const queryNodes = selectControlQueryExecutionNodes(
    resolveControlQueryNodes(node, options),
    totalTimeoutMs,
    executionMode,
  );
  const deadlineAtMs = Date.now() + totalTimeoutMs;
  const candidateTimeoutMs =
    executionMode === CONTROL_QUERY_EXECUTION_MODE.MUTATION_SINGLE_FLIGHT
      ? null
      : resolveControlQueryCandidateTimeoutMs(
          totalTimeoutMs,
          queryNodes.length,
        );
  let lastError = null;
  for (const candidateNode of queryNodes) {
    const effectiveTimeoutMs =
      executionMode === CONTROL_QUERY_EXECUTION_MODE.MUTATION_SINGLE_FLIGHT
        ? resolveRemainingControlQueryTimeoutMs(deadlineAtMs)
        : candidateTimeoutMs;
    try {
      return await queryControlSingle(candidateNode, sql, params, {
        ...options,
        timeoutMs: effectiveTimeoutMs,
      });
    } catch (error) {
      lastError = error;
      if (
        !shouldRetryControlQueryOnNextCandidate(error, executionMode) ||
        Date.now() >= deadlineAtMs
      ) {
        throw lastError;
      }
    }
  }
  throw lastError || new Error("no_control_query_nodes_available");
}

function resolveControlQueryNodes(primaryNode, options = {}) {
  const hasControlQueryCapability = (node) => {
    return (
      node &&
      typeof node === "object" &&
      (typeof node.query === "function" ||
        typeof node.queryWithTimeout === "function")
    );
  };
  const candidates = [];
  if (hasControlQueryCapability(primaryNode)) {
    candidates.push(primaryNode);
  }
  const extraNodes = Array.isArray(options.queryNodes)
    ? options.queryNodes
    : Array.isArray(options.fallbackNodes)
      ? options.fallbackNodes
      : [];
  for (const node of extraNodes) {
    if (hasControlQueryCapability(node)) {
      candidates.push(node);
    }
  }
  const uniqueCandidates = [];
  const seenNodeIds = new Set();
  for (const node of candidates) {
    const nodeId = String(node?.id || "").trim();
    const dedupeKey = nodeId.length > ZERO ? nodeId : null;
    if (dedupeKey && seenNodeIds.has(dedupeKey)) {
      continue;
    }
    if (dedupeKey) {
      seenNodeIds.add(dedupeKey);
    }
    uniqueCandidates.push(node);
  }
  return uniqueCandidates;
}

async function forceRepairControlSnapshot(node) {
  const candidateLanes = [
    CONTROL_QUERY_LANE_SNAPSHOT,
    CONTROL_QUERY_LANE_CONTROL,
  ];
  for (const lane of candidateLanes) {
    try {
      const localSnapshot = await queryControlSingle(
        node,
        SQL_CONTROL_SNAPSHOT,
        [],
        {
          lane,
        },
      );
      if (!shouldFallbackToForcedControlSnapshot(localSnapshot)) {
        return false;
      }
    } catch (_localSnapshotError) {
      // Fall through to the forced query on this lane.
    }
    try {
      await queryControlSingle(node, SQL_CONTROL_SNAPSHOT_FORCE_REPAIR, [], {
        lane,
      });
      return true;
    } catch (_forcedSnapshotError) {
      continue;
    }
  }
  return false;
}

async function forceRepairControlSnapshotAcrossQueryNodes(
  primaryNode,
  options = {},
) {
  const queryNodes = resolveControlQueryNodes(primaryNode, options);
  let repaired = false;
  for (const candidateNode of queryNodes) {
    repaired = (await forceRepairControlSnapshot(candidateNode)) || repaired;
  }
  return repaired;
}

async function queryControlSingle(node, sql, params = [], options = {}) {
  const timeoutMs = resolveControlQueryTimeoutMs(options.timeoutMs);
  const lane =
    typeof options.lane === "string" && options.lane.length > ZERO
      ? options.lane
      : CONTROL_QUERY_LANE_CONTROL;
  if (node && typeof node.queryWithTimeout === "function") {
    return node.queryWithTimeout(sql, params, {
      timeoutMs,
      lane,
    });
  }
  return node.query(sql, params);
}

async function queryControlSingleWithProgressRetry(
  node,
  sql,
  params = [],
  options = {},
) {
  const timeoutMs = resolveControlQueryTimeoutMs(options.timeoutMs);
  const deadlineAtMs = Date.now() + timeoutMs;
  let lastError = null;

  while (true) {
    const remainingTimeoutMs =
      resolveRemainingControlQueryTimeoutMs(deadlineAtMs);
    try {
      return await queryControlSingle(node, sql, params, {
        ...options,
        timeoutMs: remainingTimeoutMs,
      });
    } catch (error) {
      lastError = error;
      if (
        !isRetryableControlPlaneProgressError(error) ||
        Date.now() >= deadlineAtMs
      ) {
        throw lastError;
      }
      const retryDelayMs = Math.min(
        Math.max(
          ONE,
          resolveControlPlaneRetryDelayMs(
            error,
            CONTROL_QUERY_PROGRESS_RETRY_DELAY_MS,
          ),
        ),
        Math.max(ONE, deadlineAtMs - Date.now()),
      );
      await sleep(retryDelayMs);
    }
  }
}

/**
 * Normalize SQL query results into a rows array.
 * @param {*} result
 * @return {Array<Object>}
 */
function rowsFromResult(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  return [];
}

/**
 * Escape single quotes for SQL string literals.
 * @param {string} value
 * @return {string}
 */
function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Resolve a benchmark-safe table name for partitioning scenarios.
 * @param {string} tableName
 * @return {string}
 */
function resolveBenchmarkTableName(tableName) {
  const candidate = String(tableName || "").trim();
  if (!IDENTIFIER_PATTERN.test(candidate)) {
    return TABLE_NAME_BENCHMARK_EVENTS;
  }
  return candidate;
}

/**
 * Resolve effective load table for partitioning scenarios.
 * Defaults to benchmark table when no explicit table override is provided.
 * @param {Object} cluster
 * @param {string} scenarioTableName
 * @param {Object} [options]
 * @param {boolean} [options.explicitTableName]
 * @return {string}
 */
function resolvePartitioningLoadTableName(
  cluster,
  scenarioTableName,
  options = {},
) {
  const explicitTableName = options.explicitTableName === true;
  const benchmarkTableName = String(
    cluster?._config?.benchmark?.tableName || "",
  ).trim();
  const candidate = explicitTableName
    ? scenarioTableName
    : benchmarkTableName || scenarioTableName;
  const resolved = resolveBenchmarkTableName(candidate);
  if (!explicitTableName && resolved === TABLE_NAME_LOGS) {
    return TABLE_NAME_BENCHMARK_EVENTS;
  }
  return resolved;
}

function resolveClusterNodes(cluster) {
  if (typeof cluster?.getNodes === "function") {
    return cluster.getNodes();
  }
  if (typeof cluster?.nodes === "function") {
    return cluster.nodes();
  }
  return [];
}

function resolveBenchmarkAdmissionRequiredNodeCount(cluster, options = {}) {
  const clusterNodeCount = Math.max(1, resolveClusterNodes(cluster).length);
  if (
    Number.isInteger(options.requiredNodeCount) &&
    options.requiredNodeCount > ZERO
  ) {
    return Math.min(clusterNodeCount, options.requiredNodeCount);
  }
  const replicationFactor =
    Number.isInteger(cluster?._config?.benchmark?.replicationFactor) &&
    cluster._config.benchmark.replicationFactor > ZERO
      ? cluster._config.benchmark.replicationFactor
      : BENCHMARK_DEFAULTS.replicationFactor;
  return Math.max(
    1,
    Math.min(
      clusterNodeCount,
      replicationFactor,
      DEFAULT_BENCHMARK_READY_NODE_COUNT,
    ),
  );
}

function resolveBenchmarkBootstrapRequiredNodeCount(cluster, options = {}) {
  const clusterNodeCount = Math.max(1, resolveClusterNodes(cluster).length);
  const targetNodeCount = resolveBenchmarkAdmissionRequiredNodeCount(
    cluster,
    options,
  );
  if (
    Number.isInteger(options.bootstrapRequiredNodeCount) &&
    options.bootstrapRequiredNodeCount > ZERO
  ) {
    return Math.max(
      1,
      Math.min(
        clusterNodeCount,
        targetNodeCount,
        options.bootstrapRequiredNodeCount,
      ),
    );
  }
  const replicationFactor =
    Number.isInteger(cluster?._config?.benchmark?.replicationFactor) &&
    cluster._config.benchmark.replicationFactor > ZERO
      ? cluster._config.benchmark.replicationFactor
      : BENCHMARK_DEFAULTS.replicationFactor;
  const bootstrapQuorumNodeCount = Math.floor(replicationFactor / 2) + ONE;
  return Math.max(
    1,
    Math.min(clusterNodeCount, targetNodeCount, bootstrapQuorumNodeCount),
  );
}

function resolveBenchmarkAdmissionTimeoutMs(cluster, options = {}) {
  if (Number.isFinite(options.timeoutMs) && options.timeoutMs > ZERO) {
    return Math.floor(options.timeoutMs);
  }
  const configuredTimeoutMs = cluster?._config?.benchmark?.readyTimeoutMs;
  if (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > ZERO) {
    return Math.floor(configuredTimeoutMs);
  }
  return BENCHMARK_DEFAULTS.readyTimeoutMs;
}

function resolveBenchmarkAdmissionStableWindowMs(cluster, options = {}) {
  if (
    Number.isFinite(options.stableWindowMs) &&
    options.stableWindowMs >= ZERO
  ) {
    return Math.floor(options.stableWindowMs);
  }
  const preloadStableWindowMs =
    cluster?._config?.benchmark?.preloadRequiredStableMs;
  if (Number.isFinite(preloadStableWindowMs) && preloadStableWindowMs >= ZERO) {
    return Math.floor(preloadStableWindowMs);
  }
  const quiescentStableWindowMs =
    cluster?._config?.benchmark?.quiescentStableWindowMs;
  if (
    Number.isFinite(quiescentStableWindowMs) &&
    quiescentStableWindowMs >= ZERO
  ) {
    return Math.floor(quiescentStableWindowMs);
  }
  return BENCHMARK_DEFAULTS.quiescentStableWindowMs;
}

export const TABLE_DISTRIBUTION_HELPERS_SEGMENT_1 = {
  BENCHMARK_DEFAULTS,
  TABLE_NAME_LOGS,
  TABLE_NAME_BENCHMARK_EVENTS,
  SERVICE_TYPE_PARTITION,
  STATUS_ACTIVE,
  ZERO,
  ONE,
  BENCHMARK_WORKLOAD_PROFILE,
  IDENTIFIER_PATTERN,
  TABLE_ID_VISIBILITY_TIMEOUT_MS,
  TABLE_BOOTSTRAP_TIMEOUT_MS,
  TABLE_BOOTSTRAP_POST_CREATE_VISIBILITY_RESERVE_MS,
  TABLE_ID_VISIBILITY_POLL_INTERVAL_MS,
  CONTROL_QUERY_TIMEOUT_MS,
  POLICY_APPLY_TIMEOUT_MS,
  POLICY_APPLY_ATTEMPT_TIMEOUT_MS,
  POLICY_VISIBILITY_POLL_INTERVAL_MS,
  POLICY_APPLY_RETRY_DELAY_MS,
  CONTROL_QUERY_LANE_CONTROL,
  CONTROL_QUERY_LANE_SNAPSHOT,
  CONTROL_QUERY_PROGRESS_RETRY_DELAY_MS,
  CONTROL_QUERY_MIN_CANDIDATE_TIMEOUT_MS,
  CONTROL_QUERY_MUTATION_FALLBACK_ERROR_FRAGMENTS,
  CONTROL_QUERY_EXECUTION_MODE,
  CONTROL_QUERY_OUTCOME_DEFERRED,
  TABLE_POLICY_PRECONDITION_SCENARIO_DEFAULT,
  DEFAULT_BENCHMARK_READY_NODE_COUNT,
  PARTITIONING_LOAD_HEADROOM_RATIO,
  TABLE_DISTRIBUTION_TOPOLOGY_STALL_TIMEOUT_MS,
  TABLE_BOOTSTRAP_PARTITION_VISIBILITY_MISSING,
  TABLE_BOOTSTRAP_TOPOLOGY_NOT_ROUTABLE_PREFIX,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  TABLE_BOOTSTRAP_VISIBILITY_STATE_ORDER,
  TABLE_BOOTSTRAP_VISIBILITY_STATE_LABEL,
  TOPOLOGY_STATE_ROUTABLE,
  TOPOLOGY_STATE_OPAQUE,
  TOPOLOGY_STATE_INVALID,
  TOPOLOGY_REASON_LEADER_SERVICE_MISSING,
  TOPOLOGY_REASON_ABOVE_TARGET_REPLICA_COUNT,
  RAFT_ROLE_LEADER,
  PARTITIONING_ADAPTIVE_DISPATCH_GUARDRAIL,
  DEFAULT_TABLE_SPLIT_POLICIES,
  SQL_SELECT_TABLE_PARTITIONS_PREFIX,
  SQL_SELECT_TABLE_PARTITIONS_SUFFIX,
  SQL_SELECT_TABLE_ID_PREFIX,
  SQL_SELECT_TABLE_ID_SUFFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_PREFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_SUFFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_PREFIX,
  SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_SUFFIX,
  SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX,
  SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX,
  SQL_CREATE_TABLE_PREFIX,
  SQL_CREATE_TABLE_SUFFIX,
  SQL_UPDATE_TABLE_POLICIES_PREFIX,
  SQL_UPDATE_TABLE_POLICIES_MID,
  SQL_UPDATE_TABLE_POLICIES_SUFFIX,
  SQL_CONTROL_SNAPSHOT,
  SQL_CONTROL_SNAPSHOT_FORCE_REPAIR,
  SQL_SELECT_ACTIVE_PARTITION_SERVICES_PREFIX,
  TIMEOUT_ERROR_PATTERN,
  TABLE_DISTRIBUTION_OBSERVATION_STATE_OBSERVED,
  TABLE_DISTRIBUTION_OBSERVATION_STATE_DEFERRED,
  TABLE_DISTRIBUTION_OBSERVATION_STATE_UNAVAILABLE,
  TABLE_DISTRIBUTION_OBSERVATION_SIGNATURE_DEFERRED,
  TABLE_DISTRIBUTION_OBSERVATION_SIGNATURE_UNAVAILABLE,
  CONTROL_SNAPSHOT_OBSERVATION_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD,
  CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED,
  CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FAILED,
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  normalizeControlPlaneSystemTableVisibilityState,
  isPendingControlPlaneSystemTableVisibilityState,
  OWNER_CONTRACT_STATE,
  normalizeOwnerContractNextAction,
  normalizeOwnerContractState,
  sleep,
  mapNodeIds,
  normalizePlannerObservationReasonCodes,
  resolveTableDistributionObservationState,
  buildTableDistributionObservationReasonCodes,
  extractControlSnapshotObservation,
  shouldFallbackToForcedControlSnapshot,
  cloneCriticalControlPlaneStabilitySnapshot,
  buildPartitioningPlannerDiagnostics,
  buildPartitioningPlannerTimeoutError,
  buildPartitioningDispatchPlannerDiagnostics,
  resolvePartitioningPlannerDiagnosticsSnapshot,
  buildDeferredTableDistributionSnapshot,
  buildPartitioningPlannerDiagnosticsFromPreviousState,
  formatPlannerNodeIds,
  formatPlannerHistogram,
  resolvePartitionGrowthFailureMode,
  isTimeoutShapedError,
  isRetryableControlPlaneProgressError,
  resolveControlPlaneRetryDelayMs,
  resolveControlQueryTimeoutMs,
  resolveRemainingControlQueryTimeoutMs,
  selectMeaningfulControlQueryNodes,
  resolveControlQueryCandidateTimeoutMs,
  resolveControlQueryExecutionMode,
  selectControlQueryExecutionNodes,
  hasControlQueryMutationVisibilityEvidence,
  isControlQueryMutationPreExecutionDeferredError,
  isControlQueryMutationFallbackEligibleError,
  shouldRetryControlQueryOnNextCandidate,
  queryControl,
  resolveControlQueryNodes,
  forceRepairControlSnapshotAcrossQueryNodes,
  queryControlSingle,
  queryControlSingleWithProgressRetry,
  rowsFromResult,
  escapeSql,
  resolveBenchmarkTableName,
  resolvePartitioningLoadTableName,
  resolveClusterNodes,
  resolveBenchmarkAdmissionRequiredNodeCount,
  resolveBenchmarkBootstrapRequiredNodeCount,
  resolveBenchmarkAdmissionTimeoutMs,
  resolveBenchmarkAdmissionStableWindowMs,
  buildBenchmarkLoadAdmissionSnapshot,
  buildBenchmarkPartitionConvergenceSnapshot,
  BENCHMARK_PARTITION_DISPATCH_MODE,
  isBenchmarkCriticalControlPlaneStable,
  resolveBenchmarkPartitionDispatchMode,
};
