import { ASSERTIONS_SEGMENT_2 } from "./assertions-segment-2.js";
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
} = ASSERTIONS_SEGMENT_2;

function buildConsistencyStateByNodeId(nodeStates) {
  const stateByNodeId = {};
  for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
    const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
    stateByNodeId[nodeId] = {
      activeNodes: Array.isArray(state?.activeNodes)
        ? [...state.activeNodes].sort()
        : [],
      authoritativeActiveNodes: Array.isArray(state?.authoritativeActiveNodes)
        ? [...state.authoritativeActiveNodes].sort()
        : null,
      partitions: Array.isArray(state?.partitions)
        ? [...state.partitions].sort()
        : [],
      publicationEpoch: Number.isInteger(state?.publicationEpoch)
        ? state.publicationEpoch
        : null,
      sourceSnapshotVersion: Number.isInteger(state?.sourceSnapshotVersion)
        ? state.sourceSnapshotVersion
        : null,
      publishedActiveNodeIds: Array.isArray(state?.publishedActiveNodeIds)
        ? [...state.publishedActiveNodeIds].sort()
        : [],
      observationSource: String(state?.observationSource || VALUE_UNKNOWN),
      controlSnapshotError:
        typeof state?.controlSnapshotError === "string" &&
        state.controlSnapshotError.length > 0
          ? state.controlSnapshotError
          : null,
    };
  }
  return stateByNodeId;
}

function buildConsistencyControlPlaneDiagnostics(nodeStates, mismatch) {
  const publicationConvergenceByNodeId = {};
  const snapshotDiagnosticsByNodeId = {};

  for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
    const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
    const convergence = buildPublicationConvergenceFromState(state);
    if (convergence) {
      publicationConvergenceByNodeId[nodeId] = convergence;
    }
    const snapshotDiagnostics = cloneDiagnostics(
      state?.controlPlaneDiagnostics,
    );
    if (snapshotDiagnostics) {
      snapshotDiagnosticsByNodeId[nodeId] = snapshotDiagnostics;
    }
  }

  if (
    Object.keys(publicationConvergenceByNodeId).length === 0 &&
    Object.keys(snapshotDiagnosticsByNodeId).length === 0
  ) {
    return null;
  }

  const preferredSnapshotNodeId = String(
    mismatch?.referenceNodeId ||
      (Array.isArray(nodeStates) && nodeStates.length > 0
        ? nodeStates[0]?.nodeId
        : VALUE_UNKNOWN) ||
      VALUE_UNKNOWN,
  );
  const publicationConvergence =
    publicationConvergenceByNodeId[preferredSnapshotNodeId] ||
    Object.values(publicationConvergenceByNodeId)[0] ||
    null;

  return {
    snapshotNodeId: preferredSnapshotNodeId,
    publicationConvergence,
    publicationConvergenceByNodeId,
    mismatch: {
      ...(mismatch && typeof mismatch === "object" ? mismatch : {}),
      observedAt: new Date().toISOString(),
    },
    consistencyStateByNodeId: buildConsistencyStateByNodeId(nodeStates),
    snapshotDiagnosticsByNodeId,
  };
}

function createConsistencyMismatchError(message, options = {}) {
  const error = new Error(message);
  const controlPlaneDiagnostics = buildConsistencyControlPlaneDiagnostics(
    options.nodeStates,
    options.mismatch,
  );
  if (!controlPlaneDiagnostics) {
    return error;
  }
  error.diagnostics = {
    ...(error?.diagnostics && typeof error.diagnostics === "object"
      ? error.diagnostics
      : {}),
    controlPlaneDiagnostics,
  };
  return error;
}

/**
 * Assert all reachable nodes agree on cluster state: active
 * nodes, partition assignments, and leader identities.
 *
 * @param {Array<Object>} nodes - NodeHandle instances.
 * @throws {Error} If any disagreement is found.
 */
async function assertConsistency(nodes, options = {}) {
  const forceRepair = options.forceRepair === true;
  const tolerateEmptyLeaders = options.tolerateEmptyLeaders === true;
  const tolerateActiveNodeSkew = options.tolerateActiveNodeSkew === true;
  const maxActiveNodeSkew = Number.isFinite(options.maxActiveNodeSkew)
    ? Math.max(0, Math.floor(options.maxActiveNodeSkew))
    : 1;
  const toleratePartitionSkew = options.toleratePartitionSkew === true;
  const maxPartitionSkew = Number.isFinite(options.maxPartitionSkew)
    ? Math.max(0, Math.floor(options.maxPartitionSkew))
    : 2;
  const queryable = [];
  const reports = [];
  for (const node of nodes) {
    try {
      const report = await probeNodeReachability(node);
      reports.push(report);
      if (report.reachable !== true) {
        continue;
      }
      if (
        typeof node?.getControlSnapshot === "function" &&
        report.adminReady !== true
      ) {
        continue;
      }
      queryable.push(node);
    } catch (_err) {
      // skip
    }
  }

  if (queryable.length < 2) {
    const summary = summarizeReachabilityReports(reports);
    throw new Error(
      "Cannot assert consistency: fewer than 2 reachable " +
        "nodes (found " +
        queryable.length +
        "). Reachability: " +
        summary,
    );
  }

  // Collect state from each reachable node.
  const nodeStates = [];
  const queryFailures = [];
  for (const node of queryable) {
    try {
      nodeStates.push(await queryNodeConsistencyState(node, { forceRepair }));
    } catch (error) {
      queryFailures.push({
        nodeId: node.id,
        error: error?.message || String(error),
      });
      continue;
    }
  }

  if (nodeStates.length < 2) {
    const summary = summarizeReachabilityReports(reports);
    const queryFailureSummary = queryFailures
      .map((failure) => failure.nodeId + "=" + failure.error)
      .join("; ");
    throw new Error(
      "Cannot assert consistency: fewer than 2 queryable " +
        "nodes (found " +
        nodeStates.length +
        "). Reachability: " +
        summary +
        (queryFailureSummary ? ". Query failures: " + queryFailureSummary : ""),
    );
  }

  const reachableByNodeId = new Map(
    queryable.map((node) => [String(node?.id || ""), node]),
  );

  if (!forceRepair) {
    const hasAuthoritativePublishedMembership = nodeStates.some((state) =>
      Array.isArray(state?.authoritativeActiveNodes),
    );
    const hasMissingAuthoritativePublishedMembership = nodeStates.some(
      (state) => !Array.isArray(state?.authoritativeActiveNodes),
    );
    if (
      hasAuthoritativePublishedMembership &&
      hasMissingAuthoritativePublishedMembership
    ) {
      for (let i = 0; i < nodeStates.length; i++) {
        const state = nodeStates[i];
        if (Array.isArray(state?.authoritativeActiveNodes)) {
          continue;
        }
        const node = reachableByNodeId.get(String(state?.nodeId || ""));
        if (!node) {
          continue;
        }
        try {
          nodeStates[i] = await queryNodeConsistencyState(node, {
            forceRepair: true,
          });
        } catch (_error) {
          // Keep the original non-repaired observation if the retry fails.
        }
      }
    }
  }

  const hasControlSnapshotObservation = nodeStates.some((state) =>
    isControlSnapshotObservation(state),
  );
  const hasSqlFallbackObservation = nodeStates.some(
    (state) => !isControlSnapshotObservation(state),
  );
  if (hasControlSnapshotObservation && hasSqlFallbackObservation) {
    for (let i = 0; i < nodeStates.length; i++) {
      const state = nodeStates[i];
      if (isControlSnapshotObservation(state)) {
        continue;
      }
      const node = reachableByNodeId.get(String(state?.nodeId || ""));
      if (!node) {
        continue;
      }
      try {
        nodeStates[i] = await queryNodeConsistencyState(node, {
          forceRepair: true,
        });
      } catch (_error) {
        // Keep the original fallback observation if the retry fails.
      }
    }
  }

  const controlSnapshotStates = nodeStates.filter((state) =>
    isControlSnapshotObservation(state),
  );
  const comparableNodeStates =
    controlSnapshotStates.length >= 1 ? controlSnapshotStates : nodeStates;

  // Compare all states against the first canonical node set.
  const reference = comparableNodeStates[0];
  const refActiveStr = JSON.stringify(reference.activeNodes);
  const refHasAuthoritativeActiveNodes = Array.isArray(
    reference.authoritativeActiveNodes,
  );
  const refAuthoritativeActiveStr = refHasAuthoritativeActiveNodes
    ? JSON.stringify(reference.authoritativeActiveNodes)
    : null;
  const refPartStr = JSON.stringify(reference.partitions);
  const refLeaders = sortObjectKeys(normalizeLeaders(reference.leaders));
  const refLeaderStr = JSON.stringify(refLeaders);
  const refPublicationEpoch = Number.isInteger(reference.publicationEpoch)
    ? reference.publicationEpoch
    : null;
  const refPublishedActiveStr = JSON.stringify(
    Array.isArray(reference.publishedActiveNodeIds)
      ? [...reference.publishedActiveNodeIds].sort()
      : [],
  );

  for (let i = 1; i < comparableNodeStates.length; i++) {
    const other = comparableNodeStates[i];

    const otherActiveStr = JSON.stringify(other.activeNodes);
    const otherHasAuthoritativeActiveNodes = Array.isArray(
      other.authoritativeActiveNodes,
    );
    const canCompareAuthoritativeActiveNodes =
      refHasAuthoritativeActiveNodes && otherHasAuthoritativeActiveNodes;

    if (canCompareAuthoritativeActiveNodes) {
      const otherAuthoritativeActiveStr = JSON.stringify(
        other.authoritativeActiveNodes,
      );
      if (otherAuthoritativeActiveStr !== refAuthoritativeActiveStr) {
        throw createConsistencyMismatchError(
          "Published active-node sets disagree between " +
            reference.nodeId +
            " and " +
            other.nodeId +
            ". " +
            reference.nodeId +
            ": " +
            refAuthoritativeActiveStr +
            ". " +
            other.nodeId +
            ": " +
            otherAuthoritativeActiveStr,
          {
            nodeStates,
            mismatch: {
              reasonCode: "published_active_nodes_disagree",
              referenceNodeId: reference.nodeId,
              otherNodeId: other.nodeId,
            },
          },
        );
      }
    } else if (otherActiveStr !== refActiveStr) {
      if (
        tolerateActiveNodeSkew &&
        isTolerableActiveNodeSkew(
          reference.activeNodes,
          other.activeNodes,
          maxActiveNodeSkew,
        )
      ) {
        continue;
      }
      throw createConsistencyMismatchError(
        "Active nodes disagree between " +
          reference.nodeId +
          " and " +
          other.nodeId +
          ". " +
          reference.nodeId +
          ": " +
          refActiveStr +
          ". " +
          other.nodeId +
          ": " +
          otherActiveStr,
        {
          nodeStates,
          mismatch: {
            reasonCode: "active_nodes_disagree",
            referenceNodeId: reference.nodeId,
            otherNodeId: other.nodeId,
          },
        },
      );
    }

    const otherPartStr = JSON.stringify(other.partitions);
    if (otherPartStr !== refPartStr) {
      if (
        toleratePartitionSkew &&
        isTolerablePartitionSkew(
          reference.partitions,
          other.partitions,
          maxPartitionSkew,
        )
      ) {
        continue;
      }
      throw createConsistencyMismatchError(
        "Partition assignments disagree between " +
          reference.nodeId +
          " and " +
          other.nodeId +
          ". " +
          reference.nodeId +
          ": " +
          refPartStr +
          ". " +
          other.nodeId +
          ": " +
          otherPartStr,
        {
          nodeStates,
          mismatch: {
            reasonCode: "partition_assignments_disagree",
            referenceNodeId: reference.nodeId,
            otherNodeId: other.nodeId,
          },
        },
      );
    }

    const otherLeaders = sortObjectKeys(normalizeLeaders(other.leaders));
    const otherLeaderStr = JSON.stringify(otherLeaders);
    if (otherLeaderStr !== refLeaderStr) {
      if (
        tolerateEmptyLeaders &&
        !hasConflictingLeaders(refLeaders, otherLeaders)
      ) {
        continue;
      }
      throw createConsistencyMismatchError(
        "Leader identities disagree between " +
          reference.nodeId +
          " and " +
          other.nodeId +
          ". " +
          reference.nodeId +
          ": " +
          refLeaderStr +
          ". " +
          other.nodeId +
          ": " +
          otherLeaderStr,
        {
          nodeStates,
          mismatch: {
            reasonCode: "leader_identities_disagree",
            referenceNodeId: reference.nodeId,
            otherNodeId: other.nodeId,
          },
        },
      );
    }

    if (canCompareAuthoritativeActiveNodes) {
      const otherPublicationEpoch = Number.isInteger(other.publicationEpoch)
        ? other.publicationEpoch
        : null;
      if (otherPublicationEpoch !== refPublicationEpoch) {
        throw createConsistencyMismatchError(
          "Publication epochs disagree between " +
            reference.nodeId +
            " and " +
            other.nodeId +
            ". " +
            reference.nodeId +
            ": " +
            String(refPublicationEpoch) +
            ". " +
            other.nodeId +
            ": " +
            String(otherPublicationEpoch),
          {
            nodeStates,
            mismatch: {
              reasonCode: "publication_epochs_disagree",
              referenceNodeId: reference.nodeId,
              otherNodeId: other.nodeId,
            },
          },
        );
      }

      const otherPublishedActiveStr = JSON.stringify(
        Array.isArray(other.publishedActiveNodeIds)
          ? [...other.publishedActiveNodeIds].sort()
          : [],
      );
      if (otherPublishedActiveStr !== refPublishedActiveStr) {
        throw createConsistencyMismatchError(
          "Published active-node sets disagree between " +
            reference.nodeId +
            " and " +
            other.nodeId +
            ". " +
            reference.nodeId +
            ": " +
            refPublishedActiveStr +
            ". " +
            other.nodeId +
            ": " +
            otherPublishedActiveStr,
          {
            nodeStates,
            mismatch: {
              reasonCode: "published_active_nodes_disagree",
              referenceNodeId: reference.nodeId,
              otherNodeId: other.nodeId,
            },
          },
        );
      }
    }
  }
}

/**
 * Retry {@link assertConsistency} until all nodes agree or the
 * convergence window expires. This absorbs short-lived CDC
 * propagation skew that is expected after topology changes,
 * restarts, and fault-injection recovery.
 *
 * @param {Array<Object>} nodes - Cluster node handles.
 * @param {Object} [options]
 * @param {number} [options.timeoutMs] - Max convergence window.
 * @param {number} [options.pollIntervalMs] - Delay between retries.
 * @returns {Promise<void>}
 */
async function waitForConsistencyConvergence(nodes, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : TIMEOUTS.CONSISTENCY_CONVERGENCE;
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs)
    ? options.pollIntervalMs
    : TIMEOUTS.CONSISTENCY_CONVERGENCE_POLL_INTERVAL;
  const forceRepairAfterMs = Number.isFinite(options.forceRepairAfterMs)
    ? options.forceRepairAfterMs
    : TIMEOUTS.CONSISTENCY_CONVERGENCE_FORCE_REPAIR_AFTER;
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const forceRepairThreshold = Date.now() + Math.max(0, forceRepairAfterMs);
  let lastError = null;

  while (Date.now() <= deadline) {
    const forceRepair = Date.now() >= forceRepairThreshold;
    try {
      await assertConsistency(nodes, {
        forceRepair,
        tolerateEmptyLeaders: true,
        tolerateActiveNodeSkew: options.tolerateActiveNodeSkew === true,
        maxActiveNodeSkew: options.maxActiveNodeSkew,
        toleratePartitionSkew: options.toleratePartitionSkew === true,
        maxPartitionSkew: options.maxPartitionSkew,
      });
      return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw (
    lastError ||
    new Error("Consistency check did not converge within " + timeoutMs + "ms")
  );
}

/**
 * Sort object keys for deterministic JSON comparison.
 *
 * @param {Object} obj - Plain object.
 * @returns {Object} New object with sorted keys.
 */
function sortObjectKeys(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

/**
 * Assert consistency from pre-collected control snapshots.
 *
 * Uses the same comparison logic as {@link assertConsistency}
 * but operates on already-fetched evaluator snapshots instead
 * of re-querying each node. This eliminates the CDC
 * propagation race between the evaluator repair cycle and a
 * redundant re-query.
 *
 * Each snapshot must have: nodeId, nodes (array),
 * partitions (array), leaders (object).
 *
 * @param {Array<Object>} snapshots - Control snapshots from
 *   the consistency evaluator (post-repair).
 * @throws {Error} If fewer than 2 snapshots or any
 *   disagreement is found.
 */
function assertConsistencyFromSnapshots(snapshots) {
  const valid = Array.isArray(snapshots) ? snapshots : [];
  if (valid.length < 2) {
    return;
  }

  const normalized = valid.map((snapshot) => ({
    nodeId: String(snapshot?.nodeId || VALUE_UNKNOWN),
    activeNodes: Array.isArray(snapshot?.nodes)
      ? [...snapshot.nodes].sort()
      : [],
    authoritativeActiveNodes:
      extractControlSnapshotPublishedNodeIds(snapshot) instanceof Set
        ? Array.from(extractControlSnapshotPublishedNodeIds(snapshot)).sort()
        : null,
    projectedActiveNodes: Array.from(
      extractControlSnapshotProjectedNodeIds(snapshot),
    ).sort(),
    partitions: Array.isArray(snapshot?.partitions)
      ? [...snapshot.partitions].sort()
      : [],
    leaders:
      snapshot?.leaders && typeof snapshot.leaders === "object"
        ? sortObjectKeys(normalizeLeaders(snapshot.leaders))
        : {},
    publicationEpoch: Number.isInteger(
      snapshot?.controlPlaneDiagnostics?.publicationConvergence
        ?.publicationEpoch,
    )
      ? snapshot.controlPlaneDiagnostics.publicationConvergence.publicationEpoch
      : Number.isInteger(snapshot?.publicationEpoch)
        ? snapshot.publicationEpoch
        : null,
    publishedActiveNodeIds: Array.isArray(
      snapshot?.controlPlaneDiagnostics?.publicationConvergence
        ?.publishedActiveNodeIds,
    )
      ? [
          ...snapshot.controlPlaneDiagnostics.publicationConvergence
            .publishedActiveNodeIds,
        ].sort()
      : Array.isArray(snapshot?.publishedActiveNodeIds)
        ? [...snapshot.publishedActiveNodeIds].sort()
        : [],
  }));

  const reference = normalized[0];
  const refActiveStr = JSON.stringify(reference.activeNodes);
  const refHasAuthoritativeActiveNodes = Array.isArray(
    reference.authoritativeActiveNodes,
  );
  const refAuthoritativeActiveStr = refHasAuthoritativeActiveNodes
    ? JSON.stringify(reference.authoritativeActiveNodes)
    : null;
  const refPartStr = JSON.stringify(reference.partitions);
  const refLeaderStr = JSON.stringify(reference.leaders);
  const refPublicationEpoch = Number.isInteger(reference.publicationEpoch)
    ? reference.publicationEpoch
    : null;
  const refPublishedActiveStr = JSON.stringify(
    reference.publishedActiveNodeIds,
  );

  for (let i = 1; i < normalized.length; i++) {
    const other = normalized[i];

    const otherActiveStr = JSON.stringify(other.activeNodes);
    const otherHasAuthoritativeActiveNodes = Array.isArray(
      other.authoritativeActiveNodes,
    );
    const canCompareAuthoritativeActiveNodes =
      refHasAuthoritativeActiveNodes && otherHasAuthoritativeActiveNodes;

    if (canCompareAuthoritativeActiveNodes) {
      const otherAuthoritativeActiveStr = JSON.stringify(
        other.authoritativeActiveNodes,
      );
      if (otherAuthoritativeActiveStr !== refAuthoritativeActiveStr) {
        throw new Error(
          "Published active-node sets disagree between " +
            reference.nodeId +
            " and " +
            other.nodeId +
            ". " +
            reference.nodeId +
            ": " +
            refAuthoritativeActiveStr +
            ". " +
            other.nodeId +
            ": " +
            otherAuthoritativeActiveStr,
        );
      }
    } else if (otherActiveStr !== refActiveStr) {
      throw new Error(
        "Active nodes disagree between " +
          reference.nodeId +
          " and " +
          other.nodeId +
          ". " +
          reference.nodeId +
          ": " +
          refActiveStr +
          ". " +
          other.nodeId +
          ": " +
          otherActiveStr,
      );
    }

    const otherPartStr = JSON.stringify(other.partitions);
    if (otherPartStr !== refPartStr) {
      throw new Error(
        "Partition assignments disagree between " +
          reference.nodeId +
          " and " +
          other.nodeId +
          ". " +
          reference.nodeId +
          ": " +
          refPartStr +
          ". " +
          other.nodeId +
          ": " +
          otherPartStr,
      );
    }

    const otherLeaderStr = JSON.stringify(other.leaders);
    if (otherLeaderStr !== refLeaderStr) {
      throw new Error(
        "Leader identities disagree between " +
          reference.nodeId +
          " and " +
          other.nodeId +
          ". " +
          reference.nodeId +
          ": " +
          refLeaderStr +
          ". " +
          other.nodeId +
          ": " +
          otherLeaderStr,
      );
    }

    if (canCompareAuthoritativeActiveNodes) {
      if (other.publicationEpoch !== refPublicationEpoch) {
        throw new Error(
          "Publication epochs disagree between " +
            reference.nodeId +
            " and " +
            other.nodeId +
            ". " +
            reference.nodeId +
            ": " +
            String(refPublicationEpoch) +
            ". " +
            other.nodeId +
            ": " +
            String(other.publicationEpoch),
        );
      }

      const otherPublishedActiveStr = JSON.stringify(
        other.publishedActiveNodeIds,
      );
      if (otherPublishedActiveStr !== refPublishedActiveStr) {
        throw new Error(
          "Published active-node sets disagree between " +
            reference.nodeId +
            " and " +
            other.nodeId +
            ". " +
            reference.nodeId +
            ": " +
            refPublishedActiveStr +
            ". " +
            other.nodeId +
            ": " +
            otherPublishedActiveStr,
        );
      }
    }
  }
}

/**
 * Assert data integrity across replicas. Queries the given
 * table on each reachable node and compares results.
 *
 * @param {Array<Object>} nodes - NodeHandle instances.
 * @param {string} table - Table name to query.
 * @param {Array<Object>} expectedRows - Expected row data.
 * @throws {Error} If any node returns different data.
 */
async function assertDataIntegrity(nodes, table, expectedRows) {
  const reachable = [];
  const reports = [];
  for (const node of nodes) {
    try {
      const report = await probeNodeReachability(node);
      reports.push(report);
      if (report.reachable) reachable.push(node);
    } catch (_err) {
      // skip
    }
  }

  if (reachable.length === 0) {
    const summary = summarizeReachabilityReports(reports);
    throw new Error(
      "Cannot assert data integrity: no reachable nodes. Reachability: " +
        summary,
    );
  }

  const sql = "SELECT * FROM " + table + " ORDER BY rowid";

  const resultsByNode = [];
  for (const node of reachable) {
    const result = await node.query(sql);
    const rows = (result && result.rows) || [];
    resultsByNode.push({ nodeId: node.id, rows });
  }

  // Compare each node's rows against expectedRows.
  const expectedStr = JSON.stringify(expectedRows);
  for (const { nodeId, rows } of resultsByNode) {
    const actualStr = JSON.stringify(rows);
    if (actualStr !== expectedStr) {
      throw new Error(
        "Data integrity mismatch on node " +
          nodeId +
          ". " +
          "Expected: " +
          expectedStr +
          ". " +
          "Actual: " +
          actualStr,
      );
    }
  }

  // Also compare across nodes for cross-replica consistency.
  if (resultsByNode.length >= 2) {
    const refStr = JSON.stringify(resultsByNode[0].rows);
    for (let i = 1; i < resultsByNode.length; i++) {
      const otherStr = JSON.stringify(resultsByNode[i].rows);
      if (otherStr !== refStr) {
        throw new Error(
          "Cross-replica data mismatch between " +
            resultsByNode[0].nodeId +
            " and " +
            resultsByNode[i].nodeId +
            " for table " +
            table,
        );
      }
    }
  }
}

export const ASSERTIONS_SEGMENT_3 = {
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
  buildConsistencyStateByNodeId,
  buildConsistencyControlPlaneDiagnostics,
  createConsistencyMismatchError,
  assertConsistency,
  waitForConsistencyConvergence,
  sortObjectKeys,
  assertConsistencyFromSnapshots,
  assertDataIntegrity,
};
