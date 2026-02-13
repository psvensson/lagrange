/**
 * Convergence and consistency assertions for the distributed
 * testing framework.
 *
 * Reuses the SLO pattern from
 * node-join-convergence-slo.integration.test.js:
 *   - voter counting per partition
 *   - over-target duration tracking
 *   - leader change tracking with quiet window
 */

import {CONVERGENCE_DEFAULTS} from './constants.js';

// --- SQL Queries ---
const SERVICES_QUERY =
  'SELECT * FROM services WHERE service_type = \'partition\'' +
  ' AND status = \'ACTIVE\'';
const NODES_QUERY =
  'SELECT * FROM nodes WHERE status = \'active\'';
const PARTITIONS_QUERY = 'SELECT * FROM partitions';

// --- Service row field values ---
const RAFT_ROLE_LEARNER = 'learner';

/**
 * Check whether a services row represents a voter-ready
 * partition replica. Mirrors the SLO integration test logic:
 *   - service_type === 'partition'
 *   - status === 'ACTIVE'
 *   - explicit raft_role that is not 'learner'
 *   - address is present
 *
 * The SQL query already filters service_type and status, so
 * callers that pre-filter may skip those checks. This function
 * is defensive and checks all four conditions regardless.
 */
function isVoterReady(row) {
  if (!row) return false;
  if (row.service_type !== 'partition') return false;
  if (row.status !== 'ACTIVE') return false;
  const role = typeof row.raft_role === 'string'
    ? row.raft_role.toLowerCase()
    : null;
  if (!role || role === RAFT_ROLE_LEARNER) return false;
  if (!row.address) return false;
  return true;
}

/**
 * Count voter-ready replicas per partition from a services
 * query result set.
 *
 * @param {Array<Object>} rows - Rows from the services table.
 * @returns {Map<string, number>} partition_id → voter count.
 */
function countVotersPerPartition(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (!isVoterReady(row)) continue;
    const pid = row.partition_id;
    if (!pid) continue;
    counts.set(pid, (counts.get(pid) || 0) + 1);
  }
  return counts;
}

/**
 * Extract leader identity per partition from a services result
 * set. A leader is a voter-ready replica with raft_role ===
 * 'leader'.
 *
 * @param {Array<Object>} rows - Rows from the services table.
 * @returns {Map<string, string>} partition_id → leader address.
 */
function extractLeaders(rows) {
  const leaders = new Map();
  for (const row of rows) {
    if (!isVoterReady(row)) continue;
    const role = row.raft_role.toLowerCase();
    if (role === 'leader') {
      leaders.set(row.partition_id, row.address);
    }
  }
  return leaders;
}

/**
 * Update over-target tracking state. For each partition whose
 * voter count exceeds targetVoterCount, record when it first
 * went over and track the maximum sustained duration.
 *
 * @param {Map<string, Object>} state - Mutable tracking state.
 * @param {Map<string, number>} counts - Current voter counts.
 * @param {number} now - Current timestamp (ms).
 * @param {number} target - Target voter count.
 */
function updateOverTargetState(state, counts, now, target) {
  const partitionIds = new Set([
    ...counts.keys(),
    ...state.keys(),
  ]);

  for (const pid of partitionIds) {
    const count = counts.get(pid) || 0;
    const entry = state.get(pid) || {
      inOverTargetSince: null,
      maxOverTargetMs: 0,
    };

    if (count > target) {
      if (entry.inOverTargetSince === null) {
        entry.inOverTargetSince = now;
      }
    } else if (entry.inOverTargetSince !== null) {
      const duration = now - entry.inOverTargetSince;
      entry.maxOverTargetMs = Math.max(
        entry.maxOverTargetMs, duration,
      );
      entry.inOverTargetSince = null;
    }

    state.set(pid, entry);
  }
}

/**
 * Finalize over-target state by closing any open intervals.
 *
 * @param {Map<string, Object>} state - Tracking state.
 * @param {number} endTimeMs - End timestamp.
 */
function finalizeOverTargetState(state, endTimeMs) {
  for (const entry of state.values()) {
    if (entry.inOverTargetSince !== null) {
      const duration = endTimeMs - entry.inOverTargetSince;
      entry.maxOverTargetMs = Math.max(
        entry.maxOverTargetMs, duration,
      );
      entry.inOverTargetSince = null;
    }
  }
}

/**
 * Query services table on all reachable nodes and return the
 * combined rows. Skips unreachable nodes.
 *
 * @param {Array<Object>} nodes - NodeHandle instances.
 * @returns {Promise<Array<Object>>} Rows from reachable nodes.
 */
async function queryReachableServices(nodes) {
  const allRows = [];
  for (const node of nodes) {
    try {
      const reachable = await node.isReachable();
      if (!reachable) continue;
      const result = await node.query(SERVICES_QUERY);
      const rows = (result && result.rows) || [];
      allRows.push(...rows);
    } catch (_err) {
      // Node unreachable — skip.
    }
  }
  return allRows;
}

/**
 * Wait for cluster convergence by polling the Admin API on all
 * reachable nodes.
 *
 * Convergence is reached when ALL of the following hold:
 *   1. Every partition has at least one leader.
 *   2. No partition has voter count above targetVoterCount.
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
  const opts = {...CONVERGENCE_DEFAULTS, ...options};
  const {
    settleTimeoutMs,
    quietWindowMs,
    maxSustainedOverTargetMs,
    sampleIntervalMs,
    targetVoterCount,
  } = opts;

  const overTargetState = new Map();
  const previousLeaders = new Map();
  let leaderChanges = 0;
  let lastLeaderChangeAt = Date.now();
  let latestCounts = new Map();
  let latestLeaders = new Map();

  const startMs = Date.now();
  const deadline = startMs + settleTimeoutMs;

  while (Date.now() <= deadline) {
    const now = Date.now();
    const rows = await queryReachableServices(nodes);

    latestCounts = countVotersPerPartition(rows);
    latestLeaders = extractLeaders(rows);

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
    updateOverTargetState(
      overTargetState, latestCounts, now, targetVoterCount,
    );

    // Check convergence conditions.
    const hasOverTarget = [...latestCounts.values()].some(
      (c) => c > targetVoterCount,
    );
    const quietElapsed = now - lastLeaderChangeAt;
    const allHaveLeaders = latestCounts.size > 0 &&
      [...latestCounts.keys()].every(
        (pid) => latestLeaders.has(pid),
      );

    if (!hasOverTarget && quietElapsed >= quietWindowMs &&
        allHaveLeaders) {
      finalizeOverTargetState(overTargetState, now);
      const maxOT = Math.max(
        0,
        ...[...overTargetState.values()].map(
          (s) => s.maxOverTargetMs,
        ),
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
    ...[...overTargetState.values()].map(
      (s) => s.maxOverTargetMs,
    ),
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

  const msg =
    'Convergence timeout after ' + settleTimeoutMs + 'ms. ' +
    'Leader changes: ' + leaderChanges + '. ' +
    'Max over-target: ' + maxOT + 'ms. ' +
    'Voter counts: ' + JSON.stringify(voterSummary) + '. ' +
    'Leaders: ' + JSON.stringify(leaderSummary) + '. ' +
    'Over-target durations: ' +
    JSON.stringify(overTargetSummary);

  const err = new Error(msg);
  err.diagnostics = {
    voterCounts: voterSummary,
    leaders: leaderSummary,
    leaderChanges,
    maxOverTargetMs: maxOT,
    overTargetDurations: overTargetSummary,
    elapsedMs: Date.now() - startMs,
  };
  throw err;
}

/**
 * Assert all reachable nodes agree on cluster state: active
 * nodes, partition assignments, and leader identities.
 *
 * @param {Array<Object>} nodes - NodeHandle instances.
 * @throws {Error} If any disagreement is found.
 */
async function assertConsistency(nodes) {
  const reachable = [];
  for (const node of nodes) {
    try {
      const ok = await node.isReachable();
      if (ok) reachable.push(node);
    } catch (_err) {
      // skip
    }
  }

  if (reachable.length < 2) {
    throw new Error(
      'Cannot assert consistency: fewer than 2 reachable ' +
      'nodes (found ' + reachable.length + ')',
    );
  }

  // Collect state from each reachable node.
  const nodeStates = [];
  for (const node of reachable) {
    const [nodesResult, partResult, svcResult] =
      await Promise.all([
        node.query(NODES_QUERY),
        node.query(PARTITIONS_QUERY),
        node.query(SERVICES_QUERY),
      ]);

    const activeNodes = ((nodesResult && nodesResult.rows) || [])
      .map((r) => r.node_id)
      .sort();

    const partitions = ((partResult && partResult.rows) || [])
      .map((r) => r.partition_id)
      .sort();

    const leaders = {};
    const svcRows = (svcResult && svcResult.rows) || [];
    for (const row of svcRows) {
      if (!isVoterReady(row)) continue;
      const role = row.raft_role.toLowerCase();
      if (role === 'leader') {
        leaders[row.partition_id] = row.address;
      }
    }

    nodeStates.push({
      nodeId: node.id,
      activeNodes,
      partitions,
      leaders,
    });
  }

  // Compare all states against the first node.
  const reference = nodeStates[0];
  const refActiveStr = JSON.stringify(reference.activeNodes);
  const refPartStr = JSON.stringify(reference.partitions);
  const refLeaderStr = JSON.stringify(
    sortObjectKeys(reference.leaders),
  );

  for (let i = 1; i < nodeStates.length; i++) {
    const other = nodeStates[i];

    const otherActiveStr = JSON.stringify(other.activeNodes);
    if (otherActiveStr !== refActiveStr) {
      throw new Error(
        'Active nodes disagree between ' +
        reference.nodeId + ' and ' + other.nodeId + '. ' +
        reference.nodeId + ': ' + refActiveStr + '. ' +
        other.nodeId + ': ' + otherActiveStr,
      );
    }

    const otherPartStr = JSON.stringify(other.partitions);
    if (otherPartStr !== refPartStr) {
      throw new Error(
        'Partition assignments disagree between ' +
        reference.nodeId + ' and ' + other.nodeId + '. ' +
        reference.nodeId + ': ' + refPartStr + '. ' +
        other.nodeId + ': ' + otherPartStr,
      );
    }

    const otherLeaderStr = JSON.stringify(
      sortObjectKeys(other.leaders),
    );
    if (otherLeaderStr !== refLeaderStr) {
      throw new Error(
        'Leader identities disagree between ' +
        reference.nodeId + ' and ' + other.nodeId + '. ' +
        reference.nodeId + ': ' + refLeaderStr + '. ' +
        other.nodeId + ': ' + otherLeaderStr,
      );
    }
  }
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
  for (const node of nodes) {
    try {
      const ok = await node.isReachable();
      if (ok) reachable.push(node);
    } catch (_err) {
      // skip
    }
  }

  if (reachable.length === 0) {
    throw new Error(
      'Cannot assert data integrity: no reachable nodes',
    );
  }

  const sql =
    'SELECT * FROM ' + table + ' ORDER BY rowid';

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
        'Data integrity mismatch on node ' + nodeId + '. ' +
        'Expected: ' + expectedStr + '. ' +
        'Actual: ' + actualStr,
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
          resultsByNode[0].nodeId + ' and ' +
          resultsByNode[i].nodeId + ' for table ' + table,
        );
      }
    }
  }
}

export {
  waitForConvergence,
  assertConsistency,
  assertDataIntegrity,
  isVoterReady,
  countVotersPerPartition,
  extractLeaders,
  updateOverTargetState,
  finalizeOverTargetState,
};
