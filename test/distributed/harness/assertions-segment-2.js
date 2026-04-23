import { CONVERGENCE_DEFAULTS, TIMEOUTS } from "./constants.js";
import { normalizeReplicaOperationRecord } from "../../../src/rebalancer/replica-operation-liveness.js";
import { ASSERTIONS_SEGMENT_1 } from "./assertions-segment-1.js";
const {
  SERVICES_QUERY,
  NODES_QUERY,
  PARTITIONS_QUERY,
  CONTROL_SNAPSHOT_REQUIRED_ERROR_PREFIX,
  CONVERGENCE_REACHABILITY_TIMEOUT_MS,
  CONVERGENCE_CONTROL_SNAPSHOT_TIMEOUT_MS,
  ADMIN_SOCKET_LANE_DEFAULT,
  ADMIN_SOCKET_LANE_SNAPSHOT,
  RAFT_ROLE_LEARNER,
  REACHABILITY_SUMMARY_SEPARATOR,
  REACHABILITY_SUMMARY_SOURCE_UNKNOWN,
  REACHABILITY_SUMMARY_ERROR_NONE,
  STATUS_LEADER,
  STATUS_UNKNOWN,
  VALUE_UNKNOWN,
  VALUE_NONE,
  VALUE_UNAVAILABLE,
  REPLICA_MEMBERSHIP_SEPARATOR,
  REPLICA_MEMBER_SEPARATOR,
  MEMBER_SNIPPET_PREFIX,
  MEMBER_SNIPPET_SUFFIX,
  MEMBER_REPLICA_PREFIX,
  MEMBER_LEADER_PREFIX,
  MEMBER_VOTER_PREFIX,
  MEMBER_VOTER_SEPARATOR,
  SNIPPET_EXTRA_PREFIX,
  SNIPPET_EXTRA_SUFFIX,
  PARTITION_MEMBERSHIP_SNIPPET_LIMIT,
  PARTITION_REPLICA_SNIPPET_LIMIT,
  OPERATION_HISTORY_LIMIT,
  OPERATION_HISTORY_SNIPPET_LIMIT,
  OPERATION_HISTORY_SEPARATOR,
  OPERATION_HISTORY_AT_PREFIX,
  OPERATION_FIELD_CANDIDATE_IDS,
  OPERATION_FIELD_CANDIDATE_PARTITION_IDS,
  OPERATION_FIELD_CANDIDATE_TYPES,
  OPERATION_FIELD_CANDIDATE_STATUSES,
  OPERATION_FIELD_CANDIDATE_FROM_NODE_IDS,
  OPERATION_FIELD_CANDIDATE_TO_NODE_IDS,
  OPERATION_FIELD_CANDIDATE_TIMESTAMPS,
  CONTROL_SNAPSHOT_FIELD_NODES,
  CONTROL_SNAPSHOT_FIELD_PUBLISHED_NODES,
  CONTROL_SNAPSHOT_FIELD_PROJECTED_NODES,
  CONTROL_SNAPSHOT_FIELD_PARTITIONS,
  CONTROL_SNAPSHOT_FIELD_LEADERS,
  CONTROL_SNAPSHOT_FIELD_VOTER_COUNTS,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_STATE,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_EXPECTED_MINIMUM_REVISION,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_GAP,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_RESUME_TOKEN,
  CONTROL_SNAPSHOT_FIELD_REPLICA_OPERATIONS,
  CONTROL_SNAPSHOT_FIELD_IN_FLIGHT_COUNT,
  CONTROL_SNAPSHOT_FIELD_STATUS_HISTOGRAM,
  CONTROL_SNAPSHOT_FIELD_ROWS,
  CONTROL_SNAPSHOT_FIELD_PARTITION_MEMBERSHIP,
  CONTROL_SNAPSHOT_FIELD_REPLICA_ROLE_DIAGNOSTICS,
  CONTROL_SNAPSHOT_FIELD_ACTIVE_NODE_VIEWS,
  REPLICA_ROLE_DIAGNOSTICS_LEADER_NODE_IDS,
  CONTROL_SNAPSHOT_FIELD_REPLICA_ROLES,
  REPLICA_ROLE_LEADER,
  LEADER_ADDRESS_PATH_SEPARATOR,
  UUID_PREFIX_PATTERN,
  normalizeLeaderAddress,
  normalizeLeaders,
  hasConflictingLeaders,
  isTolerableActiveNodeSkew,
  isTolerablePartitionSkew,
  probeNodeReachability,
  summarizeReachabilityReports,
  isVoterReady,
  countVotersPerPartition,
  extractLeaders,
  supplementPartitionIdsFromServiceTopology,
  updateOverTargetState,
  finalizeOverTargetState,
  normalizeStatusCountMap,
  normalizeVoterCountMap,
  extractControlSnapshotPayload,
  extractControlSnapshotNodeIds,
  extractControlSnapshotPublishedNodeIds,
  extractControlSnapshotProjectedNodeIds,
  extractControlSnapshotPartitionIds,
  extractControlSnapshotLeaders,
  extractControlSnapshotVoterCounts,
  extractControlSnapshotInFlightSummary,
  extractControlSnapshotOperationRows,
  extractControlSnapshotPartitionMembership,
  extractControlSnapshotPublicationConvergence,
  extractControlSnapshotControlPlaneDiagnostics,
  extractControlSnapshotRevisionMetadata,
  queryControlSnapshot,
} = ASSERTIONS_SEGMENT_1;
const PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  "spread_satisfied_in_flight";
const PRIORITY_RECOVERY_COMPLETION_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  "spread_satisfied_in_flight";
const PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE = "cache_visible";

async function queryNodeConsistencyStateViaSql(node) {
  const [nodesResult, partResult, svcResult] = await Promise.all([
    node.query(NODES_QUERY),
    node.query(PARTITIONS_QUERY),
    node.query(SERVICES_QUERY),
  ]);

  const activeNodes = ((nodesResult && nodesResult.rows) || [])
    .map((row) => row.node_id)
    .sort();

  const svcRows = (svcResult && svcResult.rows) || [];
  const voterCounts = countVotersPerPartition(svcRows);
  const leaderMap = extractLeaders(svcRows);
  const partitionIds = new Set(
    ((partResult && partResult.rows) || [])
      .map((row) => String(row?.partition_id || ""))
      .filter((partitionId) => partitionId.length > 0),
  );
  supplementPartitionIdsFromServiceTopology(
    partitionIds,
    leaderMap,
    voterCounts,
  );
  const partitions = Array.from(partitionIds).sort();
  const leaders = Object.fromEntries(
    Array.from(leaderMap.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );

  return {
    nodeId: node.id,
    activeNodes,
    authoritativeActiveNodes: null,
    projectedActiveNodes: null,
    partitions,
    leaders,
    observationSource: "sql_fallback",
    controlSnapshotError: null,
  };
}

async function queryConvergenceSnapshotViaSql(node) {
  const [partResult, svcResult] = await Promise.all([
    node.query(PARTITIONS_QUERY),
    node.query(SERVICES_QUERY),
  ]);

  const partitionRows = (partResult && partResult.rows) || [];
  const servicesRows = (svcResult && svcResult.rows) || [];
  const voterCounts = countVotersPerPartition(servicesRows);
  const leaders = extractLeaders(servicesRows);
  const expectedPartitionIds = new Set(
    partitionRows
      .map((row) => String(row?.partition_id || ""))
      .filter((partitionId) => partitionId.length > 0),
  );
  supplementPartitionIdsFromServiceTopology(
    expectedPartitionIds,
    leaders,
    voterCounts,
  );

  // When services rows are follower-only on a recovering node,
  // supplement leader identity from persisted partition metadata.
  for (const row of partitionRows) {
    const partitionId = String(row?.partition_id || "").trim();
    if (partitionId.length === 0 || leaders.has(partitionId)) {
      continue;
    }
    const partitionLeader = String(
      row?.leader_node_id || row?.leaderNodeId || row?.leader || "",
    ).trim();
    if (partitionLeader.length > 0) {
      leaders.set(partitionId, partitionLeader);
    }
  }

  return {
    nodeId: String(node?.id || VALUE_UNKNOWN),
    servicesRows,
    activeNodeIds: new Set(),
    authoritativeActiveNodeIds: null,
    projectedActiveNodeIds: new Set(),
    expectedPartitionIds,
    operationRows: [],
    error: null,
    voterCounts,
    leaders,
    publicationEpoch: null,
    sourceSnapshotVersion: null,
    publishedActiveNodeIds: null,
    inFlightReplicaOperationCount: 0,
    inFlightReplicaOperationStatuses: new Map(),
    partitionMembership: null,
    controlPlaneDiagnostics: null,
  };
}

async function queryNodeConsistencyState(node, options = {}) {
  let controlSnapshotError = null;

  if (typeof node?.getControlSnapshot === "function") {
    try {
      const snapshotState = await queryControlSnapshot(node, {
        forceRepair: options.forceRepair === true,
      });
      return {
        nodeId: String(node?.id || VALUE_UNKNOWN),
        activeNodes: Array.from(snapshotState.activeNodeIds || []).sort(),
        authoritativeActiveNodes:
          snapshotState.authoritativeActiveNodeIds instanceof Set
            ? Array.from(snapshotState.authoritativeActiveNodeIds).sort()
            : null,
        projectedActiveNodes:
          snapshotState.projectedActiveNodeIds instanceof Set
            ? Array.from(snapshotState.projectedActiveNodeIds).sort()
            : null,
        partitions: Array.from(snapshotState.expectedPartitionIds || []).sort(),
        leaders: Object.fromEntries(
          Array.from(snapshotState.leaders || []).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
        publicationEpoch: snapshotState.publicationEpoch,
        sourceSnapshotVersion: snapshotState.sourceSnapshotVersion,
        publishedActiveNodeIds:
          snapshotState.authoritativeActiveNodeIds instanceof Set
            ? Array.from(snapshotState.authoritativeActiveNodeIds).sort()
            : null,
        observationSource: "control_snapshot",
        controlSnapshotError: null,
      };
    } catch (error) {
      controlSnapshotError = error;
    }
  }

  try {
    const sqlState = await queryNodeConsistencyStateViaSql(node);
    sqlState.controlSnapshotError = controlSnapshotError
      ? String(controlSnapshotError?.message || controlSnapshotError)
      : null;
    return sqlState;
  } catch (error) {
    if (!controlSnapshotError) {
      throw error;
    }
    throw new Error(
      String(controlSnapshotError?.message || controlSnapshotError) +
        "; raw consistency fallback failed: " +
        String(error?.message || error),
    );
  }
}

function isControlSnapshotObservation(state) {
  return state?.observationSource === "control_snapshot";
}

function resolveSnapshotExpectedPartitionIds(snapshot) {
  const expectedPartitionIds =
    snapshot?.expectedPartitionIds instanceof Set
      ? new Set(snapshot.expectedPartitionIds)
      : new Set();
  if (
    snapshot?.voterCounts instanceof Map &&
    snapshot.voterCounts.size > expectedPartitionIds.size
  ) {
    for (const partitionId of snapshot.voterCounts.keys()) {
      expectedPartitionIds.add(partitionId);
    }
  }
  return expectedPartitionIds;
}

function buildConvergenceSnapshotDebt(snapshot, targetVoterCount) {
  const expectedPartitionIds = resolveSnapshotExpectedPartitionIds(snapshot);
  let missingLeaderCount = 0;
  for (const partitionId of expectedPartitionIds) {
    if (!snapshot?.leaders?.has(partitionId)) {
      missingLeaderCount += 1;
    }
  }

  let overTargetCount = 0;
  let overTargetExcess = 0;
  if (snapshot?.voterCounts instanceof Map) {
    for (const voterCount of snapshot.voterCounts.values()) {
      if (voterCount > targetVoterCount) {
        overTargetCount += 1;
        overTargetExcess += voterCount - targetVoterCount;
      }
    }
  }

  return {
    missingLeaderCount,
    overTargetCount,
    overTargetExcess,
    inFlightReplicaOperationCount: Number(
      snapshot?.inFlightReplicaOperationCount || 0,
    ),
  };
}

function compareConvergenceSnapshotDebt(left, right) {
  const keys = [
    "missingLeaderCount",
    "overTargetCount",
    "inFlightReplicaOperationCount",
    "overTargetExcess",
  ];
  for (const key of keys) {
    const delta = Number(left?.[key] || 0) - Number(right?.[key] || 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function isConvergedSnapshot(snapshot, targetVoterCount) {
  const expectedPartitionIds = resolveSnapshotExpectedPartitionIds(snapshot);
  const allHaveLeaders =
    expectedPartitionIds.size > 0 &&
    [...expectedPartitionIds].every((partitionId) =>
      snapshot?.leaders?.has(partitionId),
    );
  const hasOverTarget =
    snapshot?.voterCounts instanceof Map &&
    [...snapshot.voterCounts.values()].some(
      (voterCount) => voterCount > targetVoterCount,
    );
  const hasInFlightReplicaOperations =
    Number(snapshot?.inFlightReplicaOperationCount || 0) > 0;
  return allHaveLeaders && !hasOverTarget && !hasInFlightReplicaOperations;
}

/**
 * Query a single reachable node for cluster convergence state.
 * Uses one node snapshot to avoid counting the same cluster-wide
 * services rows multiple times across nodes.
 *
 * @param {Array<Object>} nodes - NodeHandle instances.
 * @param {Object} [options]
 * @returns {Promise<Object>} Snapshot details.
 */
async function queryReachableClusterSnapshot(nodes, options = {}) {
  const targetVoterCount =
    Number.isInteger(options?.targetVoterCount) && options.targetVoterCount > 0
      ? options.targetVoterCount
      : CONVERGENCE_DEFAULTS.targetVoterCount;
  const forceRepair = options?.forceRepair === true;
  const reachabilityTimeoutMs =
    Number.isFinite(options?.reachabilityTimeoutMs) &&
    options.reachabilityTimeoutMs > 0
      ? Math.floor(options.reachabilityTimeoutMs)
      : CONVERGENCE_REACHABILITY_TIMEOUT_MS;
  const snapshotTimeoutMs =
    Number.isFinite(options?.snapshotTimeoutMs) && options.snapshotTimeoutMs > 0
      ? Math.floor(options.snapshotTimeoutMs)
      : CONVERGENCE_CONTROL_SNAPSHOT_TIMEOUT_MS;
  let lastError = null;
  let bestSnapshot = null;
  let bestSnapshotDebt = null;
  for (const node of nodes) {
    try {
      const report = await probeNodeReachability(node, {
        timeoutMs: reachabilityTimeoutMs,
      });
      if (!report.reachable) {
        continue;
      }
      let snapshot = null;
      let controlSnapshotError = null;
      try {
        snapshot = await queryControlSnapshot(node, {
          forceRepair,
          timeoutMs: snapshotTimeoutMs,
          lane: ADMIN_SOCKET_LANE_SNAPSHOT,
        });
      } catch (error) {
        controlSnapshotError = error;
      }
      if (!snapshot) {
        try {
          snapshot = await queryConvergenceSnapshotViaSql(node);
          snapshot.error = controlSnapshotError
            ? String(controlSnapshotError?.message || controlSnapshotError)
            : null;
        } catch (sqlFallbackError) {
          if (!controlSnapshotError) {
            throw sqlFallbackError;
          }
          throw new Error(
            String(controlSnapshotError?.message || controlSnapshotError) +
              "; raw convergence fallback failed: " +
              String(sqlFallbackError?.message || sqlFallbackError),
          );
        }
      }
      // If the snapshot has no partition topology yet (e.g.
      // node just restarted and its cache is still hydrating),
      // try the next reachable node before accepting it.
      // Also skip when voter counts show more partitions than
      // the snapshot's partition list — indicates partial
      // hydration of the partitions table.
      const hasEmptyTopology =
        snapshot.expectedPartitionIds.size === 0 && snapshot.leaders.size === 0;
      const hasPartialTopology =
        snapshot.voterCounts.size > 0 &&
        snapshot.expectedPartitionIds.size > 0 &&
        snapshot.voterCounts.size > snapshot.expectedPartitionIds.size;
      if (hasEmptyTopology || hasPartialTopology) {
        lastError =
          "Snapshot from " +
          String(node?.id) +
          " has incomplete partition topology" +
          " (partitions=" +
          snapshot.expectedPartitionIds.size +
          ", voterCounts=" +
          snapshot.voterCounts.size +
          ")";
        continue;
      }
      if (isConvergedSnapshot(snapshot, targetVoterCount)) {
        return snapshot;
      }
      const snapshotDebt = buildConvergenceSnapshotDebt(
        snapshot,
        targetVoterCount,
      );
      if (
        !bestSnapshot ||
        compareConvergenceSnapshotDebt(snapshotDebt, bestSnapshotDebt) < 0
      ) {
        bestSnapshot = snapshot;
        bestSnapshotDebt = snapshotDebt;
      }
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }
  if (bestSnapshot) {
    return bestSnapshot;
  }
  // All nodes either unreachable or returned incomplete
  // snapshots. Re-query the first reachable node to return
  // whatever partial data is available rather than nothing.
  for (const node of nodes) {
    try {
      const report = await probeNodeReachability(node, {
        timeoutMs: reachabilityTimeoutMs,
      });
      if (!report.reachable) {
        continue;
      }
      try {
        return await queryControlSnapshot(node, {
          timeoutMs: snapshotTimeoutMs,
          lane: ADMIN_SOCKET_LANE_SNAPSHOT,
        });
      } catch (controlSnapshotError) {
        try {
          const sqlFallbackSnapshot =
            await queryConvergenceSnapshotViaSql(node);
          sqlFallbackSnapshot.error = String(
            controlSnapshotError?.message || controlSnapshotError,
          );
          return sqlFallbackSnapshot;
        } catch (sqlFallbackError) {
          throw new Error(
            String(controlSnapshotError?.message || controlSnapshotError) +
              "; raw convergence fallback failed: " +
              String(sqlFallbackError?.message || sqlFallbackError),
          );
        }
      }
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }
  return {
    nodeId: null,
    servicesRows: [],
    expectedPartitionIds: new Set(),
    operationRows: [],
    error: lastError,
    voterCounts: new Map(),
    leaders: new Map(),
    inFlightReplicaOperationCount: 0,
    inFlightReplicaOperationStatuses: new Map(),
    partitionMembership: null,
    controlPlaneDiagnostics: null,
  };
}
function buildCacheVisibleSatisfiedPriorityRecoveryOperationIdSet(
  controlPlaneDiagnostics = null,
) {
  const publicationConvergence =
    controlPlaneDiagnostics?.publicationConvergence &&
    typeof controlPlaneDiagnostics.publicationConvergence === "object"
      ? controlPlaneDiagnostics.publicationConvergence
      : null;
  const partitionWitnesses = Array.isArray(
    publicationConvergence?.priorityRecoveryPartitionWitnesses,
  )
    ? publicationConvergence.priorityRecoveryPartitionWitnesses
    : [];
  const operationIds = new Set();
  for (const partitionWitness of partitionWitnesses) {
    const visibilityState = String(
      partitionWitness?.visibilityState || "",
    ).trim();
    const semanticState = String(partitionWitness?.semanticState || "").trim();
    const completionState = String(
      partitionWitness?.completionState || "",
    ).trim();
    if (
      visibilityState !== PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE
    ) {
      continue;
    }
    if (
      semanticState !==
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT &&
      completionState !==
        PRIORITY_RECOVERY_COMPLETION_STATE_SPREAD_SATISFIED_IN_FLIGHT
    ) {
      continue;
    }
    for (const operationId of Array.isArray(partitionWitness?.operationIds)
      ? partitionWitness.operationIds
      : []) {
      const normalizedOperationId = String(operationId || "").trim();
      if (normalizedOperationId.length === 0) {
        continue;
      }
      operationIds.add(normalizedOperationId);
    }
  }
  return operationIds;
}
function countCacheVisibleSatisfiedPriorityRecoveryOperations(
  controlPlaneDiagnostics = null,
  operationRows = [],
) {
  const operationIds =
    buildCacheVisibleSatisfiedPriorityRecoveryOperationIdSet(
      controlPlaneDiagnostics,
    );
  if (operationIds.size === 0) {
    return 0;
  }
  let matchingOperationCount = 0;
  for (const operationRow of Array.isArray(operationRows) ? operationRows : []) {
    const operationId = String(
      normalizeReplicaOperationRecord(operationRow).operationId || "",
    ).trim();
    if (operationId.length === 0 || !operationIds.has(operationId)) {
      continue;
    }
    matchingOperationCount += 1;
  }
  return matchingOperationCount > 0 ? matchingOperationCount : operationIds.size;
}

/**
 * Wait for cluster convergence by polling the Admin API on all
 * reachable nodes.
 *
 * Convergence is reached when ALL of the following hold:
 *   1. Every partition has at least one leader.
 *   2. No partition has voter count above targetVoterCount
 *      (or stale-only over-target when
 *      ignoreStaleInFlightReplicaOperations is enabled).
 *   3. No leader identity change within quietWindowMs.
 *   4. No partition stayed over target for longer than
 *      maxSustainedOverTargetMs.
 *
 * @param {Array<Object>} nodes - NodeHandle instances.
 * @param {Object} [options] - Override CONVERGENCE_DEFAULTS.
 * @returns {Promise<Object>} Convergence timing info:
 *   { settledAfterMs, leaderChanges, maxOverTargetMs }
 * @throws {Error} On timeout with diagnostic details.
 */
async function waitForConvergence(nodes, options = {}) {
  const opts = { ...CONVERGENCE_DEFAULTS, ...options };
  const {
    settleTimeoutMs,
    quietWindowMs,
    maxSustainedOverTargetMs,
    sampleIntervalMs,
    targetVoterCount,
  } = opts;
  const ignoreStaleInFlightReplicaOperations =
    options?.ignoreStaleInFlightReplicaOperations === true;
  const forceRepairAfterMs = Number.isFinite(options.forceRepairAfterMs)
    ? options.forceRepairAfterMs
    : TIMEOUTS.ACTIVE_WAIT_FORCE_REPAIR_AFTER;

  const overTargetState = new Map();
  const previousLeaders = new Map();
  let leaderChanges = 0;
  let lastLeaderChangeAt = Date.now();
  let latestCounts = new Map();
  let latestLeaders = new Map();
  let latestRows = [];
  let latestExpectedPartitionIds = new Set();
  let latestOperationRows = [];
  let latestInFlightReplicaOperationCount = 0;
  let latestStaleInFlightReplicaOperationCount = 0;
  let latestCacheVisibleSatisfiedPriorityRecoveryOperationCount = 0;
  let latestEffectiveInFlightReplicaOperationCount = 0;
  let latestInFlightReplicaOperationStatuses = new Map();
  let latestPartitionMembership = null;
  let latestControlPlaneDiagnostics = null;
  let latestSnapshotNodeId = null;
  let latestSnapshotError = null;
  let latestSnapshotRevision = null;
  let latestSnapshotRevisionState = null;
  let latestSnapshotExpectedMinimumRevision = null;
  let latestSnapshotRevisionGap = null;
  let latestSnapshotResumeToken = null;

  const startMs = Date.now();
  const deadline = startMs + settleTimeoutMs;
  const forceRepairThreshold = startMs + Math.max(0, forceRepairAfterMs);
  let forceRepairAttempted = false;

  while (Date.now() <= deadline) {
    const now = Date.now();
    const forceRepair = now >= forceRepairThreshold;
    if (forceRepair && !forceRepairAttempted) {
      forceRepairAttempted = true;
    }
    const snapshot = await queryReachableClusterSnapshot(nodes, {
      targetVoterCount,
      forceRepair,
    });
    latestRows = snapshot.servicesRows;
    latestExpectedPartitionIds = snapshot.expectedPartitionIds;
    latestOperationRows = snapshot.operationRows;
    latestSnapshotNodeId = snapshot.nodeId;
    latestSnapshotError = snapshot.error;
    latestCounts = snapshot.voterCounts;
    latestLeaders = snapshot.leaders;
    latestInFlightReplicaOperationCount =
      snapshot.inFlightReplicaOperationCount;
    latestInFlightReplicaOperationStatuses =
      snapshot.inFlightReplicaOperationStatuses;
    latestPartitionMembership = snapshot.partitionMembership;
    if (
      snapshot.controlPlaneDiagnostics &&
      typeof snapshot.controlPlaneDiagnostics === "object" &&
      !Array.isArray(snapshot.controlPlaneDiagnostics)
    ) {
      latestControlPlaneDiagnostics = snapshot.controlPlaneDiagnostics;
    }
    if (Number.isInteger(snapshot.snapshotRevision)) {
      latestSnapshotRevision = snapshot.snapshotRevision;
    }
    if (
      typeof snapshot.snapshotRevisionState === "string" &&
      snapshot.snapshotRevisionState.length > 0
    ) {
      latestSnapshotRevisionState = snapshot.snapshotRevisionState;
    }
    if (Number.isInteger(snapshot.snapshotExpectedMinimumRevision)) {
      latestSnapshotExpectedMinimumRevision =
        snapshot.snapshotExpectedMinimumRevision;
    }
    if (Number.isInteger(snapshot.snapshotRevisionGap)) {
      latestSnapshotRevisionGap = snapshot.snapshotRevisionGap;
    }
    if (
      typeof snapshot.snapshotResumeToken === "string" &&
      snapshot.snapshotResumeToken.length > 0
    ) {
      latestSnapshotResumeToken = snapshot.snapshotResumeToken;
    }

    // When the partitions table is not yet fully in the cache
    // (e.g. after a seed restart) but services rows are
    // available, derive expected partitions from voter-count
    // keys so the convergence check does not stall on a
    // partially hydrated partition set.
    latestExpectedPartitionIds = resolveSnapshotExpectedPartitionIds({
      expectedPartitionIds: latestExpectedPartitionIds,
      voterCounts: latestCounts,
    });

    // Detect leader changes.
    for (const [pid, addr] of latestLeaders) {
      const prev = previousLeaders.get(pid);
      if (prev !== undefined && prev !== addr) {
        leaderChanges++;
        lastLeaderChangeAt = now;
      }
      previousLeaders.set(pid, addr);
    }

    // Track over-target durations.
    updateOverTargetState(overTargetState, latestCounts, now, targetVoterCount);

    // Check convergence conditions.
    const hasOverTarget = [...latestCounts.values()].some(
      (c) => c > targetVoterCount,
    );
    const staleInFlightReplicaOperationCount = Number.isFinite(
      latestControlPlaneDiagnostics?.replicaOperations?.staleInFlightCount,
    )
      ? Math.max(
          0,
          Math.floor(
            latestControlPlaneDiagnostics.replicaOperations.staleInFlightCount,
          ),
        )
      : 0;
    const cacheVisibleSatisfiedPriorityRecoveryOperationCount =
      countCacheVisibleSatisfiedPriorityRecoveryOperations(
        latestControlPlaneDiagnostics,
        latestOperationRows,
      );
    latestStaleInFlightReplicaOperationCount =
      staleInFlightReplicaOperationCount;
    latestCacheVisibleSatisfiedPriorityRecoveryOperationCount =
      cacheVisibleSatisfiedPriorityRecoveryOperationCount;
    const staleInFlightDiscountCount = Math.max(
      staleInFlightReplicaOperationCount,
      cacheVisibleSatisfiedPriorityRecoveryOperationCount,
    );
    const effectiveInFlightReplicaOperationCount =
      ignoreStaleInFlightReplicaOperations
        ? Math.max(
            0,
            latestInFlightReplicaOperationCount -
              staleInFlightDiscountCount,
          )
        : latestInFlightReplicaOperationCount;
    latestEffectiveInFlightReplicaOperationCount =
      effectiveInFlightReplicaOperationCount;
    const hasInFlightReplicaOperations =
      effectiveInFlightReplicaOperationCount > 0;
    const hasBlockingOverTarget =
      hasOverTarget &&
      (!ignoreStaleInFlightReplicaOperations || hasInFlightReplicaOperations);
    const quietElapsed = now - lastLeaderChangeAt;
    const allHaveLeaders =
      latestExpectedPartitionIds.size > 0 &&
      [...latestExpectedPartitionIds].every((pid) => latestLeaders.has(pid));

    if (
      !hasBlockingOverTarget &&
      !hasInFlightReplicaOperations &&
      quietElapsed >= quietWindowMs &&
      allHaveLeaders
    ) {
      finalizeOverTargetState(overTargetState, now);
      const maxOT = Math.max(
        0,
        ...[...overTargetState.values()].map((s) => s.maxOverTargetMs),
      );

      if (maxOT <= maxSustainedOverTargetMs) {
        return {
          settledAfterMs: now - startMs,
          leaderChanges,
          maxOverTargetMs: maxOT,
        };
      }
    }

    await new Promise((r) => setTimeout(r, sampleIntervalMs));
  }

  // Timeout — build diagnostic details.
  finalizeOverTargetState(overTargetState, Date.now());
  const maxOT = Math.max(
    0,
    ...[...overTargetState.values()].map((s) => s.maxOverTargetMs),
  );

  const voterSummary = {};
  for (const [pid, count] of latestCounts) {
    voterSummary[pid] = count;
  }

  const leaderSummary = {};
  for (const [pid, addr] of latestLeaders) {
    leaderSummary[pid] = addr;
  }

  const overTargetSummary = {};
  for (const [pid, entry] of overTargetState) {
    if (entry.maxOverTargetMs > 0) {
      overTargetSummary[pid] = entry.maxOverTargetMs;
    }
  }
  const inFlightReplicaOperationSummary = {};
  for (const [status, count] of latestInFlightReplicaOperationStatuses) {
    inFlightReplicaOperationSummary[status] = count;
  }
  const expectedPartitions = [...latestExpectedPartitionIds].sort();

  const partitionMembership =
    latestPartitionMembership ||
    buildPartitionMembership(latestRows, targetVoterCount);
  const membershipSnippet =
    formatPartitionMembershipSnippet(partitionMembership);
  const operationHistory = summarizeReplicaOperations(
    latestOperationRows,
    OPERATION_HISTORY_LIMIT,
  );
  const operationHistoryError = latestSnapshotError;
  const operationHistorySnippet = formatOperationHistorySnippet(
    operationHistory,
    operationHistoryError,
  );

  const msg =
    "Convergence timeout after " +
    settleTimeoutMs +
    "ms. " +
    "Leader changes: " +
    leaderChanges +
    ". " +
    "Max over-target: " +
    maxOT +
    "ms. " +
    "Snapshot node: " +
    (latestSnapshotNodeId || VALUE_UNKNOWN) +
    ". " +
    "Expected partitions: " +
    JSON.stringify(expectedPartitions) +
    ". " +
    "Voter counts: " +
    JSON.stringify(voterSummary) +
    ". " +
    "Leaders: " +
    JSON.stringify(leaderSummary) +
    ". " +
    "In-flight replica operations: " +
    latestInFlightReplicaOperationCount +
    ". " +
    (ignoreStaleInFlightReplicaOperations
      ? "Effective in-flight replica operations: " +
        latestEffectiveInFlightReplicaOperationCount +
        ". "
      : "") +
    "In-flight statuses: " +
    JSON.stringify(inFlightReplicaOperationSummary) +
    ". " +
    "Over-target durations: " +
    JSON.stringify(overTargetSummary) +
    ". " +
    "Replica membership: " +
    membershipSnippet +
    ". " +
    "Operation history: " +
    operationHistorySnippet;

  const err = new Error(msg);
  err.diagnostics = {
    voterCounts: voterSummary,
    leaders: leaderSummary,
    leaderChanges,
    inFlightReplicaOperationCount: latestInFlightReplicaOperationCount,
    effectiveInFlightReplicaOperationCount: ignoreStaleInFlightReplicaOperations
      ? latestEffectiveInFlightReplicaOperationCount
      : latestInFlightReplicaOperationCount,
    staleInFlightReplicaOperationCount:
      latestStaleInFlightReplicaOperationCount,
    cacheVisibleSatisfiedPriorityRecoveryOperationCount:
      latestCacheVisibleSatisfiedPriorityRecoveryOperationCount,
    inFlightReplicaOperationStatuses: inFlightReplicaOperationSummary,
    replicaOperationRows: latestOperationRows,
    maxOverTargetMs: maxOT,
    overTargetDurations: overTargetSummary,
    expectedPartitions,
    snapshotNodeId: latestSnapshotNodeId,
    snapshotError: latestSnapshotError,
    snapshotRevision: latestSnapshotRevision,
    snapshotRevisionState: latestSnapshotRevisionState,
    snapshotExpectedMinimumRevision: latestSnapshotExpectedMinimumRevision,
    snapshotRevisionGap: latestSnapshotRevisionGap,
    snapshotResumeToken: latestSnapshotResumeToken,
    partitionMembership,
    operationHistory,
    operationHistoryError,
    elapsedMs: Date.now() - startMs,
    controlPlaneDiagnostics: latestControlPlaneDiagnostics,
  };
  throw err;
}

function buildPartitionMembership(rows, targetVoterCount) {
  const grouped = new Map();
  for (const row of rows) {
    if (!row || row.service_type !== "partition" || !row.partition_id) {
      continue;
    }
    const partitionId = String(row.partition_id);
    if (!grouped.has(partitionId)) {
      grouped.set(partitionId, []);
    }
    grouped.get(partitionId).push({
      nodeId: row.node_id ? String(row.node_id) : null,
      address: row.address ? String(row.address) : null,
      status: row.status ? String(row.status) : null,
      raftRole: row.raft_role ? String(row.raft_role) : null,
      voterReady: isVoterReady(row),
    });
  }

  const membership = {};
  for (const [partitionId, replicas] of grouped) {
    replicas.sort(compareReplicaMembershipEntries);
    const voterCount = replicas.filter(
      (replica) => replica.voterReady === true,
    ).length;
    const leader = replicas.find(
      (replica) =>
        String(replica.raftRole || "").toLowerCase() === STATUS_LEADER,
    );
    membership[partitionId] = {
      targetVoterCount,
      voterCount,
      leader: leader?.address || leader?.nodeId || null,
      replicas: replicas.map((replica) => ({
        nodeId: replica.nodeId,
        address: replica.address,
        status: replica.status,
        raftRole: replica.raftRole,
      })),
    };
  }

  return membership;
}

function compareReplicaMembershipEntries(left, right) {
  const leftKey = String(left.nodeId || left.address || VALUE_UNKNOWN);
  const rightKey = String(right.nodeId || right.address || VALUE_UNKNOWN);
  return leftKey.localeCompare(rightKey);
}

function formatPartitionMembershipSnippet(partitionMembership) {
  const partitionIds = Object.keys(partitionMembership).sort();
  if (partitionIds.length === 0) {
    return VALUE_NONE;
  }

  const limitedPartitionIds = partitionIds.slice(
    0,
    PARTITION_MEMBERSHIP_SNIPPET_LIMIT,
  );
  const parts = limitedPartitionIds.map((partitionId) =>
    formatSinglePartitionMembershipSnippet(
      partitionId,
      partitionMembership[partitionId],
    ),
  );
  if (partitionIds.length > limitedPartitionIds.length) {
    parts.push(
      SNIPPET_EXTRA_PREFIX +
        (partitionIds.length - limitedPartitionIds.length) +
        SNIPPET_EXTRA_SUFFIX,
    );
  }
  return parts.join(REPLICA_MEMBERSHIP_SEPARATOR);
}

function formatSinglePartitionMembershipSnippet(partitionId, details) {
  const replicas = Array.isArray(details?.replicas) ? details.replicas : [];
  const visibleReplicas = replicas.slice(0, PARTITION_REPLICA_SNIPPET_LIMIT);
  const replicaSummary = visibleReplicas
    .map((replica) => formatReplicaMembershipEntry(replica))
    .join(REPLICA_MEMBER_SEPARATOR);
  const replicaOverflow = replicas.length - visibleReplicas.length;
  const replicaSuffix =
    replicaOverflow > 0
      ? REPLICA_MEMBER_SEPARATOR +
        SNIPPET_EXTRA_PREFIX +
        replicaOverflow +
        SNIPPET_EXTRA_SUFFIX
      : "";
  const voterCount = Number.isFinite(details?.voterCount)
    ? details.voterCount
    : 0;
  const targetVoterCount = Number.isFinite(details?.targetVoterCount)
    ? details.targetVoterCount
    : 0;
  const leader = details?.leader || VALUE_NONE;
  return (
    partitionId +
    MEMBER_SNIPPET_PREFIX +
    MEMBER_VOTER_PREFIX +
    voterCount +
    MEMBER_VOTER_SEPARATOR +
    targetVoterCount +
    MEMBER_LEADER_PREFIX +
    leader +
    MEMBER_REPLICA_PREFIX +
    replicaSummary +
    replicaSuffix +
    MEMBER_SNIPPET_SUFFIX
  );
}

function formatReplicaMembershipEntry(replica) {
  const node = replica?.nodeId || replica?.address || VALUE_UNKNOWN;
  const role = replica?.raftRole || STATUS_UNKNOWN;
  const status = replica?.status || STATUS_UNKNOWN;
  return node + ":" + role + ":" + status;
}

function summarizeReplicaOperations(rows, limit) {
  const normalized = rows
    .filter((row) => row && typeof row === "object")
    .map((row) => normalizeReplicaOperationRow(row))
    .sort(
      (left, right) => parseTimestampMs(right.at) - parseTimestampMs(left.at),
    );
  return normalized.slice(0, limit);
}

function normalizeReplicaOperationRow(row) {
  const normalizedRecord = normalizeReplicaOperationRecord(row);
  return {
    operationId:
      normalizedRecord.operationId ||
      pickFirstFieldValue(row, OPERATION_FIELD_CANDIDATE_IDS),
    partitionId:
      normalizedRecord.partitionId ||
      normalizedRecord.partitionGroupId ||
      pickFirstFieldValue(row, OPERATION_FIELD_CANDIDATE_PARTITION_IDS),
    type:
      normalizedRecord.type ||
      pickFirstFieldValue(row, OPERATION_FIELD_CANDIDATE_TYPES),
    status:
      normalizedRecord.status ||
      pickFirstFieldValue(row, OPERATION_FIELD_CANDIDATE_STATUSES),
    fromNodeId:
      normalizedRecord.sourceNodeId ||
      pickFirstFieldValue(row, OPERATION_FIELD_CANDIDATE_FROM_NODE_IDS),
    toNodeId:
      normalizedRecord.targetNodeId ||
      pickFirstFieldValue(row, OPERATION_FIELD_CANDIDATE_TO_NODE_IDS),
    at:
      normalizedRecord.updatedAt ??
      normalizedRecord.completedAt ??
      normalizedRecord.createdAt ??
      pickFirstFieldValue(row, OPERATION_FIELD_CANDIDATE_TIMESTAMPS),
  };
}

function pickFirstFieldValue(row, candidates) {
  for (const key of candidates) {
    if (
      Object.prototype.hasOwnProperty.call(row, key) &&
      row[key] !== null &&
      row[key] !== undefined
    ) {
      const value = String(row[key]);
      if (value.length > 0) {
        return value;
      }
    }
  }
  return null;
}

function parseTimestampMs(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return 0;
}

function formatOperationHistorySnippet(
  operationHistory,
  operationHistoryError,
) {
  if (operationHistoryError) {
    return VALUE_UNAVAILABLE + "(" + operationHistoryError + ")";
  }
  if (!Array.isArray(operationHistory) || operationHistory.length === 0) {
    return VALUE_NONE;
  }
  const visibleOperations = operationHistory.slice(
    0,
    OPERATION_HISTORY_SNIPPET_LIMIT,
  );
  const parts = visibleOperations.map((entry) =>
    formatOperationHistoryEntry(entry),
  );
  if (operationHistory.length > visibleOperations.length) {
    parts.push(
      SNIPPET_EXTRA_PREFIX +
        (operationHistory.length - visibleOperations.length) +
        SNIPPET_EXTRA_SUFFIX,
    );
  }
  return parts.join(OPERATION_HISTORY_SEPARATOR);
}

function formatOperationHistoryEntry(entry) {
  const operationId = entry?.operationId || VALUE_UNKNOWN;
  const partitionId = entry?.partitionId || VALUE_UNKNOWN;
  const type = entry?.type || VALUE_UNKNOWN;
  const status = entry?.status || VALUE_UNKNOWN;
  const fromNodeId = entry?.fromNodeId || VALUE_UNKNOWN;
  const toNodeId = entry?.toNodeId || VALUE_UNKNOWN;
  const at = entry?.at || VALUE_UNKNOWN;
  return (
    operationId +
    ":" +
    partitionId +
    ":" +
    type +
    ":" +
    status +
    ":" +
    fromNodeId +
    "->" +
    toNodeId +
    OPERATION_HISTORY_AT_PREFIX +
    at
  );
}

function cloneDiagnostics(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return null;
  }
}

function buildPublicationConvergenceFromState(state) {
  const convergence = state?.controlPlaneDiagnostics?.publicationConvergence;
  if (
    convergence &&
    typeof convergence === "object" &&
    !Array.isArray(convergence)
  ) {
    const clonedConvergence = cloneDiagnostics(convergence);
    return {
      ...clonedConvergence,
      sourceSnapshotVersion: Number.isInteger(
        clonedConvergence?.sourceSnapshotVersion,
      )
        ? clonedConvergence.sourceSnapshotVersion
        : Number.isInteger(state?.sourceSnapshotVersion)
          ? state.sourceSnapshotVersion
          : null,
    };
  }
  const publicationEpoch = Number.isInteger(state?.publicationEpoch)
    ? state.publicationEpoch
    : null;
  const sourceSnapshotVersion = Number.isInteger(state?.sourceSnapshotVersion)
    ? state.sourceSnapshotVersion
    : null;
  const publishedActiveNodeIds = Array.isArray(state?.publishedActiveNodeIds)
    ? [...state.publishedActiveNodeIds].sort()
    : null;
  if (
    !Number.isInteger(publicationEpoch) &&
    !Number.isInteger(sourceSnapshotVersion) &&
    !Array.isArray(publishedActiveNodeIds)
  ) {
    return null;
  }
  return {
    publicationEpoch,
    sourceSnapshotVersion,
    publishedActiveNodeIds: Array.isArray(publishedActiveNodeIds)
      ? publishedActiveNodeIds
      : [],
  };
}

export const ASSERTIONS_SEGMENT_2 = {
  SERVICES_QUERY,
  NODES_QUERY,
  PARTITIONS_QUERY,
  CONTROL_SNAPSHOT_REQUIRED_ERROR_PREFIX,
  CONVERGENCE_REACHABILITY_TIMEOUT_MS,
  CONVERGENCE_CONTROL_SNAPSHOT_TIMEOUT_MS,
  ADMIN_SOCKET_LANE_DEFAULT,
  ADMIN_SOCKET_LANE_SNAPSHOT,
  RAFT_ROLE_LEARNER,
  REACHABILITY_SUMMARY_SEPARATOR,
  REACHABILITY_SUMMARY_SOURCE_UNKNOWN,
  REACHABILITY_SUMMARY_ERROR_NONE,
  STATUS_LEADER,
  STATUS_UNKNOWN,
  VALUE_UNKNOWN,
  VALUE_NONE,
  VALUE_UNAVAILABLE,
  REPLICA_MEMBERSHIP_SEPARATOR,
  REPLICA_MEMBER_SEPARATOR,
  MEMBER_SNIPPET_PREFIX,
  MEMBER_SNIPPET_SUFFIX,
  MEMBER_REPLICA_PREFIX,
  MEMBER_LEADER_PREFIX,
  MEMBER_VOTER_PREFIX,
  MEMBER_VOTER_SEPARATOR,
  SNIPPET_EXTRA_PREFIX,
  SNIPPET_EXTRA_SUFFIX,
  PARTITION_MEMBERSHIP_SNIPPET_LIMIT,
  PARTITION_REPLICA_SNIPPET_LIMIT,
  OPERATION_HISTORY_LIMIT,
  OPERATION_HISTORY_SNIPPET_LIMIT,
  OPERATION_HISTORY_SEPARATOR,
  OPERATION_HISTORY_AT_PREFIX,
  OPERATION_FIELD_CANDIDATE_IDS,
  OPERATION_FIELD_CANDIDATE_PARTITION_IDS,
  OPERATION_FIELD_CANDIDATE_TYPES,
  OPERATION_FIELD_CANDIDATE_STATUSES,
  OPERATION_FIELD_CANDIDATE_FROM_NODE_IDS,
  OPERATION_FIELD_CANDIDATE_TO_NODE_IDS,
  OPERATION_FIELD_CANDIDATE_TIMESTAMPS,
  CONTROL_SNAPSHOT_FIELD_NODES,
  CONTROL_SNAPSHOT_FIELD_PUBLISHED_NODES,
  CONTROL_SNAPSHOT_FIELD_PROJECTED_NODES,
  CONTROL_SNAPSHOT_FIELD_PARTITIONS,
  CONTROL_SNAPSHOT_FIELD_LEADERS,
  CONTROL_SNAPSHOT_FIELD_VOTER_COUNTS,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_STATE,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_EXPECTED_MINIMUM_REVISION,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_GAP,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_RESUME_TOKEN,
  CONTROL_SNAPSHOT_FIELD_REPLICA_OPERATIONS,
  CONTROL_SNAPSHOT_FIELD_IN_FLIGHT_COUNT,
  CONTROL_SNAPSHOT_FIELD_STATUS_HISTOGRAM,
  CONTROL_SNAPSHOT_FIELD_ROWS,
  CONTROL_SNAPSHOT_FIELD_PARTITION_MEMBERSHIP,
  CONTROL_SNAPSHOT_FIELD_REPLICA_ROLE_DIAGNOSTICS,
  CONTROL_SNAPSHOT_FIELD_ACTIVE_NODE_VIEWS,
  REPLICA_ROLE_DIAGNOSTICS_LEADER_NODE_IDS,
  CONTROL_SNAPSHOT_FIELD_REPLICA_ROLES,
  REPLICA_ROLE_LEADER,
  LEADER_ADDRESS_PATH_SEPARATOR,
  UUID_PREFIX_PATTERN,
  normalizeLeaderAddress,
  normalizeLeaders,
  hasConflictingLeaders,
  isTolerableActiveNodeSkew,
  isTolerablePartitionSkew,
  probeNodeReachability,
  summarizeReachabilityReports,
  isVoterReady,
  countVotersPerPartition,
  extractLeaders,
  supplementPartitionIdsFromServiceTopology,
  updateOverTargetState,
  finalizeOverTargetState,
  normalizeStatusCountMap,
  normalizeVoterCountMap,
  extractControlSnapshotPayload,
  extractControlSnapshotNodeIds,
  extractControlSnapshotPublishedNodeIds,
  extractControlSnapshotProjectedNodeIds,
  extractControlSnapshotPartitionIds,
  extractControlSnapshotLeaders,
  extractControlSnapshotVoterCounts,
  extractControlSnapshotInFlightSummary,
  extractControlSnapshotOperationRows,
  extractControlSnapshotPartitionMembership,
  extractControlSnapshotPublicationConvergence,
  extractControlSnapshotControlPlaneDiagnostics,
  extractControlSnapshotRevisionMetadata,
  queryControlSnapshot,
  queryNodeConsistencyStateViaSql,
  queryConvergenceSnapshotViaSql,
  queryNodeConsistencyState,
  isControlSnapshotObservation,
  resolveSnapshotExpectedPartitionIds,
  buildConvergenceSnapshotDebt,
  compareConvergenceSnapshotDebt,
  isConvergedSnapshot,
  queryReachableClusterSnapshot,
  waitForConvergence,
  buildPartitionMembership,
  compareReplicaMembershipEntries,
  formatPartitionMembershipSnippet,
  formatSinglePartitionMembershipSnippet,
  formatReplicaMembershipEntry,
  summarizeReplicaOperations,
  normalizeReplicaOperationRow,
  pickFirstFieldValue,
  parseTimestampMs,
  formatOperationHistorySnippet,
  formatOperationHistoryEntry,
  cloneDiagnostics,
  buildPublicationConvergenceFromState,
};
