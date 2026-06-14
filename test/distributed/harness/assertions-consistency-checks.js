import {ASSERTIONS_CONVERGENCE_WAIT} from './assertions-convergence-wait.js';
import {
  buildConsistencyComparisonRecordFromSnapshot,
  buildConsistencyComparisonRecordFromState,
  buildConsistencyControlPlaneDiagnostics,
  buildConsistencyStateByNodeId,
  createConsistencyMismatchError,
  findConsistencyMismatch,
  sortObjectKeys,
} from './assertions-consistency-comparison.js';
import {
  resolveConsistencyObservationCohort,
} from './assertions-consistency-observation-cohort.js';
const {
  TIMEOUTS,
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
  CONTROL_SNAPSHOT_FIELD_PARTITION_LEADER_AUTHORITY,
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
  extractControlSnapshotPartitionLeaderAuthority,
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
} = ASSERTIONS_CONVERGENCE_WAIT;
/**
 * Assert all reachable nodes agree on cluster state: active
 * nodes, partition assignments, and leader identities.
 *
 * @param {Array<Object>} nodes - NodeHandle instances.
 * @throws {Error} If any disagreement is found.
 */
async function assertConsistency(nodes, options = {}) {
  const forceRepair = options.forceRepair === true;
  const forceAuthoritativeRepair = options.forceAuthoritativeRepair === true;
  const tolerateEmptyLeaders = options.tolerateEmptyLeaders === true;
  const tolerateActiveNodeSkew = options.tolerateActiveNodeSkew === true;
  const maxActiveNodeSkew = Number.isFinite(options.maxActiveNodeSkew) ?
    Math.max(0, Math.floor(options.maxActiveNodeSkew)) :
    1;
  const toleratePartitionSkew = options.toleratePartitionSkew === true;
  const maxPartitionSkew = Number.isFinite(options.maxPartitionSkew) ?
    Math.max(0, Math.floor(options.maxPartitionSkew)) :
    2;
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
        typeof node?.getControlSnapshot === 'function' &&
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
      'Cannot assert consistency: fewer than 2 reachable ' +
        'nodes (found ' +
        queryable.length +
        '). Reachability: ' +
        summary,
    );
  }

  const nodeStates = [];
  const queryFailures = [];
  const queryResults = await Promise.all(
    queryable.map(async (node) => {
      try {
        return {
          nodeId: node.id,
          state: await queryNodeConsistencyState(node, {
            forceRepair,
            forceAuthoritativeRepair,
            timeoutMs: options.timeoutMs,
          }),
        };
      } catch (error) {
        return {
          nodeId: node.id,
          error: error?.message || String(error),
        };
      }
    }),
  );
  for (const result of queryResults) {
    if (result?.state) {
      nodeStates.push(result.state);
    } else if (result?.error) {
      queryFailures.push({
        nodeId: result.nodeId,
        error: result.error,
      });
    }
  }

  if (nodeStates.length < 2) {
    const summary = summarizeReachabilityReports(reports);
    const queryFailureSummary = queryFailures
      .map((failure) => failure.nodeId + '=' + failure.error)
      .join('; ');
    throw new Error(
      'Cannot assert consistency: fewer than 2 queryable ' +
        'nodes (found ' +
        nodeStates.length +
        '). Reachability: ' +
        summary +
        (queryFailureSummary ? '. Query failures: ' + queryFailureSummary : ''),
    );
  }

  const observationCohort = resolveConsistencyObservationCohort(nodeStates);
  if (observationCohort.mismatch) {
    throw createConsistencyMismatchError(observationCohort.mismatch.message, {
      nodeStates,
      mismatch: observationCohort.mismatch,
    });
  }

  const comparisonRecords = observationCohort.records.map(
    buildConsistencyComparisonRecordFromState,
  );
  const mismatch = findConsistencyMismatch(comparisonRecords, {
    tolerateEmptyLeaders,
    tolerateActiveNodeSkew,
    maxActiveNodeSkew,
    toleratePartitionSkew,
    maxPartitionSkew,
  });
  if (mismatch) {
    throw createConsistencyMismatchError(mismatch.message, {
      nodeStates,
      mismatch,
    });
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
  const timeoutMs = Number.isFinite(options.timeoutMs) ?
    options.timeoutMs :
    TIMEOUTS.CONSISTENCY_CONVERGENCE;
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) ?
    options.pollIntervalMs :
    TIMEOUTS.CONSISTENCY_CONVERGENCE_POLL_INTERVAL;
  const forceRepairAfterMs = Number.isFinite(options.forceRepairAfterMs) ?
    options.forceRepairAfterMs :
    TIMEOUTS.CONSISTENCY_CONVERGENCE_FORCE_REPAIR_AFTER;
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const forceRepairThreshold = Date.now() + Math.max(0, forceRepairAfterMs);
  let lastError = null;

  while (Date.now() <= deadline) {
    const forceRepair = Date.now() >= forceRepairThreshold;
    try {
      await assertConsistency(nodes, {
        forceRepair,
        forceAuthoritativeRepair: forceRepair,
        tolerateEmptyLeaders: true,
        tolerateActiveNodeSkew: options.tolerateActiveNodeSkew === true,
        maxActiveNodeSkew: options.maxActiveNodeSkew,
        toleratePartitionSkew: options.toleratePartitionSkew === true,
        maxPartitionSkew: options.maxPartitionSkew,
        timeoutMs: options.snapshotTimeoutMs ?? options.timeoutMs,
      });
      return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw (
    lastError ||
    new Error('Consistency check did not converge within ' + timeoutMs + 'ms')
  );
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
  const normalized = valid.map(buildConsistencyComparisonRecordFromSnapshot);
  const mismatch = findConsistencyMismatch(normalized);
  if (mismatch) {
    throw new Error(mismatch.message);
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
      'Cannot assert data integrity: no reachable nodes. Reachability: ' +
        summary,
    );
  }

  const sql = 'SELECT * FROM ' + table + ' ORDER BY rowid';

  const resultsByNode = [];
  for (const node of reachable) {
    const result = await node.query(sql);
    const rows = (result && result.rows) || [];
    resultsByNode.push({nodeId: node.id, rows});
  }

  // Compare each node's rows against expectedRows.
  const expectedStr = JSON.stringify(expectedRows);
  for (const {nodeId, rows} of resultsByNode) {
    const actualStr = JSON.stringify(rows);
    if (actualStr !== expectedStr) {
      throw new Error(
        'Data integrity mismatch on node ' +
          nodeId +
          '. ' +
          'Expected: ' +
          expectedStr +
          '. ' +
          'Actual: ' +
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
          'Cross-replica data mismatch between ' +
            resultsByNode[0].nodeId +
            ' and ' +
            resultsByNode[i].nodeId +
            ' for table ' +
            table,
        );
      }
    }
  }
}

export const ASSERTIONS_CONSISTENCY_CHECKS = {
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
  CONTROL_SNAPSHOT_FIELD_PARTITION_LEADER_AUTHORITY,
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
  extractControlSnapshotPartitionLeaderAuthority,
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
