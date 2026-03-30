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

import {CONVERGENCE_DEFAULTS, TIMEOUTS} from './constants.js';

// --- SQL Queries ---
const SERVICES_QUERY =
  'SELECT * FROM services WHERE service_type = \'partition\'';
const NODES_QUERY =
  'SELECT * FROM nodes WHERE status = \'active\'';
const PARTITIONS_QUERY = 'SELECT * FROM partitions';
const CONTROL_SNAPSHOT_REQUIRED_ERROR_PREFIX =
  'Control snapshot API is required for convergence assertions on node ';
const CONVERGENCE_REACHABILITY_TIMEOUT_MS = 1000;
const CONVERGENCE_CONTROL_SNAPSHOT_TIMEOUT_MS = 10000;
const ADMIN_SOCKET_LANE_DEFAULT = 'default';
const ADMIN_SOCKET_LANE_SNAPSHOT = 'snapshot';

// --- Service row field values ---
const RAFT_ROLE_LEARNER = 'learner';
const REACHABILITY_SUMMARY_SEPARATOR = ', ';
const REACHABILITY_SUMMARY_SOURCE_UNKNOWN = 'unknown';
const REACHABILITY_SUMMARY_ERROR_NONE = 'none';
const STATUS_LEADER = 'leader';
const STATUS_UNKNOWN = 'unknown';
const VALUE_UNKNOWN = 'unknown';
const VALUE_NONE = 'none';
const VALUE_UNAVAILABLE = 'unavailable';
const REPLICA_MEMBERSHIP_SEPARATOR = '; ';
const REPLICA_MEMBER_SEPARATOR = ',';
const MEMBER_SNIPPET_PREFIX = '[';
const MEMBER_SNIPPET_SUFFIX = ']';
const MEMBER_REPLICA_PREFIX = ' replicas=';
const MEMBER_LEADER_PREFIX = ' leader=';
const MEMBER_VOTER_PREFIX = ' voters=';
const MEMBER_VOTER_SEPARATOR = '/';
const SNIPPET_EXTRA_PREFIX = '+';
const SNIPPET_EXTRA_SUFFIX = ' more';
const PARTITION_MEMBERSHIP_SNIPPET_LIMIT = 12;
const PARTITION_REPLICA_SNIPPET_LIMIT = 6;
const OPERATION_HISTORY_LIMIT = 20;
const OPERATION_HISTORY_SNIPPET_LIMIT = 8;
const OPERATION_HISTORY_SEPARATOR = ' | ';
const OPERATION_HISTORY_AT_PREFIX = '@';
const OPERATION_FIELD_CANDIDATE_IDS = Object.freeze([
  'operation_id',
  'operationId',
  'id',
]);
const OPERATION_FIELD_CANDIDATE_PARTITION_IDS = Object.freeze([
  'partition_id',
  'partitionId',
]);
const OPERATION_FIELD_CANDIDATE_TYPES = Object.freeze([
  'operation',
  'operation_type',
  'type',
  'action',
]);
const OPERATION_FIELD_CANDIDATE_STATUSES = Object.freeze([
  'status',
  'state',
]);
const OPERATION_FIELD_CANDIDATE_FROM_NODE_IDS = Object.freeze([
  'from_node_id',
  'source_node_id',
  'sourceNodeId',
]);
const OPERATION_FIELD_CANDIDATE_TO_NODE_IDS = Object.freeze([
  'to_node_id',
  'target_node_id',
  'targetNodeId',
]);
const OPERATION_FIELD_CANDIDATE_TIMESTAMPS = Object.freeze([
  'updated_at',
  'completed_at',
  'started_at',
  'created_at',
  'timestamp',
]);
const CONTROL_SNAPSHOT_FIELD_NODES = 'nodes';
const CONTROL_SNAPSHOT_FIELD_PUBLISHED_NODES = 'publishedNodes';
const CONTROL_SNAPSHOT_FIELD_PROJECTED_NODES = 'projectedNodes';
const CONTROL_SNAPSHOT_FIELD_PARTITIONS = 'partitions';
const CONTROL_SNAPSHOT_FIELD_LEADERS = 'leaders';
const CONTROL_SNAPSHOT_FIELD_VOTER_COUNTS = 'voterCounts';
const CONTROL_SNAPSHOT_FIELD_REPLICA_OPERATIONS = 'replicaOperations';
const CONTROL_SNAPSHOT_FIELD_IN_FLIGHT_COUNT = 'inFlightCount';
const CONTROL_SNAPSHOT_FIELD_STATUS_HISTOGRAM = 'statusHistogram';
const CONTROL_SNAPSHOT_FIELD_ROWS = 'rows';
const CONTROL_SNAPSHOT_FIELD_PARTITION_MEMBERSHIP = 'partitionMembership';
const CONTROL_SNAPSHOT_FIELD_REPLICA_ROLE_DIAGNOSTICS =
  'replicaRoleDiagnostics';
const CONTROL_SNAPSHOT_FIELD_ACTIVE_NODE_VIEWS = 'activeNodeViews';
const REPLICA_ROLE_DIAGNOSTICS_LEADER_NODE_IDS =
  'replicaLeaderNodeIds';
const CONTROL_SNAPSHOT_FIELD_REPLICA_ROLES = 'replicaRoles';
const REPLICA_ROLE_LEADER = 'leader';
const LEADER_ADDRESS_PATH_SEPARATOR = '/';
// Matches a UUID-style prefix (8-4-4-4-12 hex) at the start of
// an address, used to detect bare-node-ID-prefixed replica paths
// like `7493b0ab-1234-5678-9abc-def012345678/partition/p1-r1`.
const UUID_PREFIX_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/**
 * Normalize a leader address to its node-ID prefix.
 *
 * Control snapshots report leader identity as a bare node ID
 * (from `partitions.leader_node_id`), while the SQL fallback
 * path reports the full replica address
 * (`nodeId/partition/partitionId-replicaId`). Comparing the
 * two formats directly causes false mismatches.
 *
 * Only UUID-prefixed addresses are normalized (strip the
 * `/partition/...` suffix). Protocol-based addresses like
 * `ws://host:port` are returned as-is since both sources
 * agree on that format.
 *
 * @param {string} address
 * @returns {string}
 */
function normalizeLeaderAddress(address) {
  const str = String(address || '');
  if (!UUID_PREFIX_PATTERN.test(str)) {
    return str;
  }
  const slashIndex = str.indexOf(LEADER_ADDRESS_PATH_SEPARATOR);
  return slashIndex > 0 ? str.substring(0, slashIndex) : str;
}

/**
 * Normalize all leader values in a leaders object to node-ID
 * prefixes for format-agnostic comparison.
 *
 * @param {Object} leaders
 * @returns {Object}
 */
function normalizeLeaders(leaders) {
  const normalized = {};
  for (const [partitionId, address] of Object.entries(leaders)) {
    normalized[partitionId] = normalizeLeaderAddress(address);
  }
  return normalized;
}

/**
 * Check whether two leader maps have conflicting non-empty leaders
 * for the same partition. Missing leaders (one map has a partition
 * key the other lacks) are NOT conflicts — they indicate CDC
 * propagation lag for newly split partitions.
 * @param {Object} leadersA
 * @param {Object} leadersB
 * @return {boolean} true if any shared partition has different
 *   non-empty leader values
 */
function hasConflictingLeaders(leadersA, leadersB) {
  const keysA = Object.keys(leadersA);
  for (const partitionId of keysA) {
    if (!(partitionId in leadersB)) {
      continue;
    }
    const leaderA = leadersA[partitionId];
    const leaderB = leadersB[partitionId];
    if (leaderA !== leaderB) {
      return true;
    }
  }
  return false;
}

/**
 * Determine whether two active-node sets only differ by a small
 * symmetric-difference skew, which can occur transiently during
 * control-plane publication handoff after membership changes.
 * @param {Array<string>} activeNodesA
 * @param {Array<string>} activeNodesB
 * @param {number} maxSkew
 * @returns {boolean}
 */
function isTolerableActiveNodeSkew(activeNodesA, activeNodesB, maxSkew) {
  if (!Array.isArray(activeNodesA) || !Array.isArray(activeNodesB)) {
    return false;
  }
  const allowedSkew = Number.isFinite(maxSkew) ?
    Math.max(0, Math.floor(maxSkew)) :
    0;
  if (allowedSkew <= 0) {
    return false;
  }

  const setA = new Set(activeNodesA.map((nodeId) => String(nodeId)));
  const setB = new Set(activeNodesB.map((nodeId) => String(nodeId)));
  let differenceCount = 0;

  for (const nodeId of setA) {
    if (!setB.has(nodeId)) {
      differenceCount += 1;
      if (differenceCount > allowedSkew) {
        return false;
      }
    }
  }
  for (const nodeId of setB) {
    if (!setA.has(nodeId)) {
      differenceCount += 1;
      if (differenceCount > allowedSkew) {
        return false;
      }
    }
  }
  return differenceCount <= allowedSkew;
}

/**
 * Determine whether two partition-ID sets only differ by a small
 * symmetric-difference skew, which can occur transiently while
 * partition split publications are still propagating.
 * @param {Array<string>} partitionsA
 * @param {Array<string>} partitionsB
 * @param {number} maxSkew
 * @returns {boolean}
 */
function isTolerablePartitionSkew(partitionsA, partitionsB, maxSkew) {
  if (!Array.isArray(partitionsA) || !Array.isArray(partitionsB)) {
    return false;
  }
  const allowedSkew = Number.isFinite(maxSkew) ?
    Math.max(0, Math.floor(maxSkew)) :
    0;
  if (allowedSkew <= 0) {
    return false;
  }

  const setA = new Set(partitionsA.map((partitionId) => String(partitionId)));
  const setB = new Set(partitionsB.map((partitionId) => String(partitionId)));
  let differenceCount = 0;

  for (const partitionId of setA) {
    if (!setB.has(partitionId)) {
      differenceCount += 1;
      if (differenceCount > allowedSkew) {
        return false;
      }
    }
  }
  for (const partitionId of setB) {
    if (!setA.has(partitionId)) {
      differenceCount += 1;
      if (differenceCount > allowedSkew) {
        return false;
      }
    }
  }

  return differenceCount <= allowedSkew;
}

/**
 * Probe reachability with structured diagnostics when available.
 * @param {Object} node
 * @returns {Promise<Object>}
 */
async function probeNodeReachability(node, options = {}) {
  const timeoutMs = Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0 ?
    Math.floor(options.timeoutMs) :
    CONVERGENCE_REACHABILITY_TIMEOUT_MS;
  if (typeof node?.getReachabilityDiagnostics === 'function') {
    const diagnostics = await node.getReachabilityDiagnostics({
      timeoutMs,
    });
    return {
      nodeId: String(diagnostics?.nodeId || node?.id || 'unknown'),
      reachable: diagnostics?.reachable === true,
      adminReady: diagnostics?.adminReady === true,
      reachableBy: diagnostics?.reachableBy || null,
      lastError: diagnostics?.lastError || null,
      diagnostics,
    };
  }

  if (typeof node?.isReachable === 'function') {
    const result = await node.isReachable();
    if (result && typeof result === 'object' &&
      Object.prototype.hasOwnProperty.call(result, 'reachable')) {
      return {
        nodeId: String(result?.nodeId || node?.id || 'unknown'),
        reachable: result?.reachable === true,
        adminReady: result?.adminReady === true,
        reachableBy: result?.reachableBy || null,
        lastError: result?.lastError || null,
        diagnostics: result,
      };
    }

    return {
      nodeId: String(node?.id || 'unknown'),
      reachable: result === true,
      adminReady: result === true,
      reachableBy: null,
      lastError: result === true ? null : 'reachability probe failed',
      diagnostics: null,
    };
  }

  return {
    nodeId: String(node?.id || 'unknown'),
    reachable: false,
    adminReady: false,
    reachableBy: null,
    lastError: 'node does not expose reachability probe',
    diagnostics: null,
  };
}

/**
 * Build a compact one-line reachability summary for diagnostics.
 * @param {Array<Object>} reports
 * @returns {string}
 */
function summarizeReachabilityReports(reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    return '';
  }
  const parts = [];
  for (const report of reports) {
    const source = report?.reachableBy || REACHABILITY_SUMMARY_SOURCE_UNKNOWN;
    const error = report?.lastError || REACHABILITY_SUMMARY_ERROR_NONE;
    const state = report?.reachable === true ? 'reachable' : 'unreachable';
    parts.push(
      String(report?.nodeId || 'unknown') +
      '[' + state + ',source=' + source + ',error=' + error + ']',
    );
  }
  return parts.join(REACHABILITY_SUMMARY_SEPARATOR);
}

/**
 * Check whether a services row represents a voter-ready
 * partition replica. Mirrors the SLO integration test logic:
 *   - service_type === 'partition'
 *   - status === 'active' (case-insensitive)
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
  const status = typeof row.status === 'string' ?
    row.status.toLowerCase() :
    '';
  if (status !== 'active') return false;
  const role = typeof row.raft_role === 'string' ?
    row.raft_role.toLowerCase() :
    null;
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

function normalizeStatusCountMap(statusHistogram) {
  const statusCounts = new Map();
  if (!statusHistogram ||
    typeof statusHistogram !== 'object' ||
    Array.isArray(statusHistogram)) {
    return statusCounts;
  }
  for (const [status, count] of Object.entries(statusHistogram)) {
    if (!Number.isFinite(count) || count <= 0) {
      continue;
    }
    statusCounts.set(String(status), Math.floor(count));
  }
  return statusCounts;
}

function normalizeVoterCountMap(voterCounts) {
  const counts = new Map();
  if (!voterCounts ||
    typeof voterCounts !== 'object' ||
    Array.isArray(voterCounts)) {
    return counts;
  }
  for (const [partitionId, count] of Object.entries(voterCounts)) {
    if (!Number.isFinite(count) || count < 0) {
      continue;
    }
    counts.set(String(partitionId), Math.floor(count));
  }
  return counts;
}

function extractControlSnapshotPayload(result, nodeId) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  if (rows.length === 0 ||
    !rows[0] ||
    typeof rows[0] !== 'object' ||
    Array.isArray(rows[0])) {
    throw new Error(
      'Control snapshot query returned no rows for node ' +
      String(nodeId || VALUE_UNKNOWN),
    );
  }
  return rows[0];
}

function extractControlSnapshotNodeIds(snapshot) {
  const nodeIds = new Set();
  const nodes = Array.isArray(snapshot?.[CONTROL_SNAPSHOT_FIELD_NODES]) ?
    snapshot[CONTROL_SNAPSHOT_FIELD_NODES] :
    [];
  for (const nodeId of nodes) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (normalizedNodeId.length === 0) {
      continue;
    }
    nodeIds.add(normalizedNodeId);
  }
  return nodeIds;
}

function extractControlSnapshotPublishedNodeIds(snapshot) {
  const activeNodeViews =
    snapshot?.controlPlaneDiagnostics?.[CONTROL_SNAPSHOT_FIELD_ACTIVE_NODE_VIEWS];
  const hasActiveNodeViews =
    activeNodeViews &&
    typeof activeNodeViews === 'object' &&
    !Array.isArray(activeNodeViews);
  if (hasActiveNodeViews &&
      activeNodeViews.publishedMembershipAvailable !== true) {
    return null;
  }

  const explicitPublishedNodes = Array.isArray(
    snapshot?.[CONTROL_SNAPSHOT_FIELD_PUBLISHED_NODES],
  ) ?
    snapshot[CONTROL_SNAPSHOT_FIELD_PUBLISHED_NODES] :
    (Array.isArray(activeNodeViews?.publishedNodeIds) ?
      activeNodeViews.publishedNodeIds :
      null);
  if (Array.isArray(explicitPublishedNodes)) {
    const nodeIds = new Set();
    for (const nodeId of explicitPublishedNodes) {
      const normalizedNodeId = String(nodeId || '').trim();
      if (normalizedNodeId.length === 0) {
        continue;
      }
      nodeIds.add(normalizedNodeId);
    }
    return nodeIds;
  }

  const publicationConvergence =
    extractControlSnapshotPublicationConvergence(snapshot);
  if (!Array.isArray(publicationConvergence?.publishedActiveNodeIds)) {
    return null;
  }
  const nodeIds = new Set();
  for (const nodeId of publicationConvergence.publishedActiveNodeIds) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (normalizedNodeId.length === 0) {
      continue;
    }
    nodeIds.add(normalizedNodeId);
  }
  return nodeIds;
}

function extractControlSnapshotProjectedNodeIds(snapshot) {
  const activeNodeViews =
    snapshot?.controlPlaneDiagnostics?.[CONTROL_SNAPSHOT_FIELD_ACTIVE_NODE_VIEWS];
  const projectedNodes = Array.isArray(
    snapshot?.[CONTROL_SNAPSHOT_FIELD_PROJECTED_NODES],
  ) ?
    snapshot[CONTROL_SNAPSHOT_FIELD_PROJECTED_NODES] :
    (Array.isArray(activeNodeViews?.projectedNodeIds) ?
      activeNodeViews.projectedNodeIds :
      null);
  if (!Array.isArray(projectedNodes)) {
    return extractControlSnapshotNodeIds(snapshot);
  }
  const nodeIds = new Set();
  for (const nodeId of projectedNodes) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (normalizedNodeId.length === 0) {
      continue;
    }
    nodeIds.add(normalizedNodeId);
  }
  return nodeIds;
}

function extractControlSnapshotPartitionIds(snapshot) {
  const partitionIds = new Set();
  const partitions = Array.isArray(snapshot?.[CONTROL_SNAPSHOT_FIELD_PARTITIONS]) ?
    snapshot[CONTROL_SNAPSHOT_FIELD_PARTITIONS] :
    [];
  for (const partitionId of partitions) {
    const normalizedPartitionId = String(partitionId || '').trim();
    if (normalizedPartitionId.length === 0) {
      continue;
    }
    partitionIds.add(normalizedPartitionId);
  }
  return partitionIds;
}

function extractControlSnapshotLeaders(snapshot) {
  const leaders = new Map();
  const leaderMap = snapshot?.[CONTROL_SNAPSHOT_FIELD_LEADERS];
  if (leaderMap &&
    typeof leaderMap === 'object' &&
    !Array.isArray(leaderMap)) {
    for (const [partitionId, leaderAddress] of
      Object.entries(leaderMap)) {
      const pid = String(partitionId || '').trim();
      const addr = String(leaderAddress || '').trim();
      if (pid.length > 0 && addr.length > 0) {
        leaders.set(pid, addr);
      }
    }
  }

  // When the partitions table is not yet hydrated (e.g.
  // after a seed restart), the canonical leaders map may be
  // empty while services rows already report raft_role
  // leaders. Fall back to replicaRoles to derive leader
  // identity from services rows so convergence detection
  // does not stall.
  if (leaders.size === 0) {
    const roles = snapshot?.[
      CONTROL_SNAPSHOT_FIELD_REPLICA_ROLES
    ];
    if (roles &&
      typeof roles === 'object' &&
      !Array.isArray(roles)) {
      for (const [partitionId, replicaMap] of
        Object.entries(roles)) {
        const pid = String(partitionId || '').trim();
        if (pid.length === 0 || leaders.has(pid)) continue;
        if (!replicaMap ||
          typeof replicaMap !== 'object' ||
          Array.isArray(replicaMap)) {
          continue;
        }
        for (const [replicaId, role] of
          Object.entries(replicaMap)) {
          if (String(role || '').toLowerCase() ===
            REPLICA_ROLE_LEADER &&
            replicaId) {
            leaders.set(pid, String(replicaId));
            break;
          }
        }
      }
    }

    // Secondary fallback: replicaRoleDiagnostics carries
    // replicaLeaderNodeIds per partition (node IDs, not
    // replica IDs). Only used when replicaRoles is absent.
    if (leaders.size === 0) {
      const diagnostics = snapshot?.[
        CONTROL_SNAPSHOT_FIELD_REPLICA_ROLE_DIAGNOSTICS
      ];
      if (diagnostics &&
        typeof diagnostics === 'object' &&
        !Array.isArray(diagnostics)) {
        for (const [partitionId, detail] of
          Object.entries(diagnostics)) {
          const pid = String(partitionId || '').trim();
          if (pid.length === 0) continue;
          const nodeIds = Array.isArray(
            detail?.[
              REPLICA_ROLE_DIAGNOSTICS_LEADER_NODE_IDS
            ],
          ) ?
            detail[
              REPLICA_ROLE_DIAGNOSTICS_LEADER_NODE_IDS
            ] :
            [];
          if (nodeIds.length > 0) {
            leaders.set(pid, String(nodeIds[0]));
          }
        }
      }
    }
  }
  return leaders;
}

function extractControlSnapshotVoterCounts(snapshot) {
  const voterCounts = normalizeVoterCountMap(
    snapshot?.[CONTROL_SNAPSHOT_FIELD_VOTER_COUNTS],
  );
  if (voterCounts.size > 0) {
    return voterCounts;
  }

  const partitionMembership = snapshot?.[CONTROL_SNAPSHOT_FIELD_PARTITION_MEMBERSHIP];
  if (!partitionMembership ||
    typeof partitionMembership !== 'object' ||
    Array.isArray(partitionMembership)) {
    return voterCounts;
  }

  for (const [partitionId, membership] of Object.entries(partitionMembership)) {
    const normalizedPartitionId = String(partitionId || '').trim();
    const voterCount = membership?.voterCount;
    if (normalizedPartitionId.length === 0 ||
      !Number.isFinite(voterCount) ||
      voterCount < 0) {
      continue;
    }
    voterCounts.set(normalizedPartitionId, Math.floor(voterCount));
  }
  return voterCounts;
}

function extractControlSnapshotInFlightSummary(snapshot) {
  const replicaOperations = snapshot?.[CONTROL_SNAPSHOT_FIELD_REPLICA_OPERATIONS];
  const inFlightCount = Number.isInteger(
    replicaOperations?.[CONTROL_SNAPSHOT_FIELD_IN_FLIGHT_COUNT],
  ) &&
  replicaOperations[CONTROL_SNAPSHOT_FIELD_IN_FLIGHT_COUNT] >= 0 ?
    replicaOperations[CONTROL_SNAPSHOT_FIELD_IN_FLIGHT_COUNT] :
    0;

  const statusCounts = normalizeStatusCountMap(
    replicaOperations?.[CONTROL_SNAPSHOT_FIELD_STATUS_HISTOGRAM],
  );
  return {
    inFlightCount,
    statusCounts,
  };
}

function extractControlSnapshotOperationRows(snapshot) {
  const replicaOperations = snapshot?.[CONTROL_SNAPSHOT_FIELD_REPLICA_OPERATIONS];
  const operationRows = Array.isArray(
    replicaOperations?.[CONTROL_SNAPSHOT_FIELD_ROWS],
  ) ?
    replicaOperations[CONTROL_SNAPSHOT_FIELD_ROWS] :
    [];
  return operationRows.filter((row) => row && typeof row === 'object');
}

function extractControlSnapshotPartitionMembership(snapshot) {
  const partitionMembership = snapshot?.[CONTROL_SNAPSHOT_FIELD_PARTITION_MEMBERSHIP];
  if (!partitionMembership ||
    typeof partitionMembership !== 'object' ||
    Array.isArray(partitionMembership)) {
    return null;
  }
  return partitionMembership;
}

function extractControlSnapshotPublicationConvergence(snapshot) {
  const controlPlaneDiagnostics = snapshot?.controlPlaneDiagnostics;
  if (!controlPlaneDiagnostics || typeof controlPlaneDiagnostics !== 'object') {
    return null;
  }
  const publicationConvergence =
    controlPlaneDiagnostics.publicationConvergence;
  if (!publicationConvergence || typeof publicationConvergence !== 'object') {
    return null;
  }
  return publicationConvergence;
}

function extractControlSnapshotControlPlaneDiagnostics(snapshot) {
  const controlPlaneDiagnostics = snapshot?.controlPlaneDiagnostics;
  if (!controlPlaneDiagnostics ||
      typeof controlPlaneDiagnostics !== 'object' ||
      Array.isArray(controlPlaneDiagnostics)) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(controlPlaneDiagnostics));
  } catch (_error) {
    return null;
  }
}

async function queryControlSnapshot(node, options = {}) {
  if (typeof node?.getControlSnapshot !== 'function') {
    throw new Error(
      CONTROL_SNAPSHOT_REQUIRED_ERROR_PREFIX +
      String(node?.id || VALUE_UNKNOWN),
    );
  }

  const timeoutMs = Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0 ?
    Math.floor(options.timeoutMs) :
    CONVERGENCE_CONTROL_SNAPSHOT_TIMEOUT_MS;
  const lane = typeof options?.lane === 'string' && options.lane.length > 0 ?
    options.lane :
    ADMIN_SOCKET_LANE_SNAPSHOT;
  const allowLaneFallback = options?.allowLaneFallback !== false;

  const queryForLane = async (targetLane) => {
    const result = await node.getControlSnapshot({
      forceRepair: options.forceRepair === true,
      timeoutMs,
      lane: targetLane,
    });
    const snapshot = extractControlSnapshotPayload(result, node?.id);
    const inFlightSummary = extractControlSnapshotInFlightSummary(snapshot);
    const publicationConvergence =
      extractControlSnapshotPublicationConvergence(snapshot);
    const controlPlaneDiagnostics =
      extractControlSnapshotControlPlaneDiagnostics(snapshot);

    return {
      nodeId: String(node?.id || VALUE_UNKNOWN),
      servicesRows: [],
      activeNodeIds: extractControlSnapshotNodeIds(snapshot),
      authoritativeActiveNodeIds:
        extractControlSnapshotPublishedNodeIds(snapshot),
      projectedActiveNodeIds:
        extractControlSnapshotProjectedNodeIds(snapshot),
      expectedPartitionIds: extractControlSnapshotPartitionIds(snapshot),
      operationRows: extractControlSnapshotOperationRows(snapshot),
      error: null,
      voterCounts: extractControlSnapshotVoterCounts(snapshot),
      leaders: extractControlSnapshotLeaders(snapshot),
      publicationEpoch:
        Number.isInteger(publicationConvergence?.publicationEpoch) ?
          publicationConvergence.publicationEpoch :
          null,
      publishedActiveNodeIds: Array.isArray(
        publicationConvergence?.publishedActiveNodeIds,
      ) ?
        [...publicationConvergence.publishedActiveNodeIds].sort() :
        null,
      inFlightReplicaOperationCount: inFlightSummary.inFlightCount,
      inFlightReplicaOperationStatuses: inFlightSummary.statusCounts,
      partitionMembership: extractControlSnapshotPartitionMembership(snapshot),
      controlPlaneDiagnostics,
    };
  };

  try {
    return await queryForLane(lane);
  } catch (primaryError) {
    if (!allowLaneFallback || lane !== ADMIN_SOCKET_LANE_SNAPSHOT) {
      throw primaryError;
    }
    try {
      return await queryForLane(ADMIN_SOCKET_LANE_DEFAULT);
    } catch (fallbackError) {
      throw new Error(
        String(primaryError?.message || primaryError) +
          '; fallback lane ' + ADMIN_SOCKET_LANE_DEFAULT +
          ' failed: ' +
          String(fallbackError?.message || fallbackError),
      );
    }
  }
}

async function queryNodeConsistencyStateViaSql(node) {
  const [nodesResult, partResult, svcResult] =
    await Promise.all([
      node.query(NODES_QUERY),
      node.query(PARTITIONS_QUERY),
      node.query(SERVICES_QUERY),
    ]);

  const activeNodes = ((nodesResult && nodesResult.rows) || [])
    .map((row) => row.node_id)
    .sort();

  const partitions = ((partResult && partResult.rows) || [])
    .map((row) => row.partition_id)
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

  return {
    nodeId: node.id,
    activeNodes,
    authoritativeActiveNodes: null,
    projectedActiveNodes: null,
    partitions,
    leaders,
  };
}

async function queryConvergenceSnapshotViaSql(node) {
  const [partResult, svcResult] =
    await Promise.all([
      node.query(PARTITIONS_QUERY),
      node.query(SERVICES_QUERY),
    ]);

  const partitionRows = (partResult && partResult.rows) || [];
  const servicesRows = (svcResult && svcResult.rows) || [];
  const voterCounts = countVotersPerPartition(servicesRows);
  const leaders = extractLeaders(servicesRows);
  const expectedPartitionIds = new Set(
    partitionRows
      .map((row) => String(row?.partition_id || ''))
      .filter((partitionId) => partitionId.length > 0),
  );

  // When services rows are follower-only on a recovering node,
  // supplement leader identity from persisted partition metadata.
  for (const row of partitionRows) {
    const partitionId = String(row?.partition_id || '').trim();
    if (partitionId.length === 0 || leaders.has(partitionId)) {
      continue;
    }
    const partitionLeader = String(
      row?.leader_node_id || row?.leaderNodeId || row?.leader || '',
    ).trim();
    if (partitionLeader.length > 0) {
      leaders.set(partitionId, partitionLeader);
    }
  }

  if (expectedPartitionIds.size === 0 && voterCounts.size > 0) {
    for (const partitionId of voterCounts.keys()) {
      expectedPartitionIds.add(partitionId);
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
    publishedActiveNodeIds: null,
    inFlightReplicaOperationCount: 0,
    inFlightReplicaOperationStatuses: new Map(),
    partitionMembership: null,
    controlPlaneDiagnostics: null,
  };
}

async function queryNodeConsistencyState(node, options = {}) {
  let controlSnapshotError = null;

  if (typeof node?.getControlSnapshot === 'function') {
    try {
      const snapshotState = await queryControlSnapshot(node, {
        forceRepair: options.forceRepair === true,
      });
      return {
        nodeId: String(node?.id || VALUE_UNKNOWN),
        activeNodes: Array.from(snapshotState.activeNodeIds || []).sort(),
        authoritativeActiveNodes:
          snapshotState.authoritativeActiveNodeIds instanceof Set ?
            Array.from(snapshotState.authoritativeActiveNodeIds).sort() :
            null,
        projectedActiveNodes:
          snapshotState.projectedActiveNodeIds instanceof Set ?
            Array.from(snapshotState.projectedActiveNodeIds).sort() :
            null,
        partitions: Array.from(snapshotState.expectedPartitionIds || []).sort(),
        leaders: Object.fromEntries(
          Array.from(snapshotState.leaders || [])
            .sort(([left], [right]) => left.localeCompare(right)),
        ),
        publicationEpoch: snapshotState.publicationEpoch,
        publishedActiveNodeIds:
          snapshotState.authoritativeActiveNodeIds instanceof Set ?
            Array.from(snapshotState.authoritativeActiveNodeIds).sort() :
            null,
      };
    } catch (error) {
      controlSnapshotError = error;
    }
  }

  try {
    return await queryNodeConsistencyStateViaSql(node);
  } catch (error) {
    if (!controlSnapshotError) {
      throw error;
    }
    throw new Error(
      String(controlSnapshotError?.message || controlSnapshotError) +
        '; raw consistency fallback failed: ' +
        String(error?.message || error),
    );
  }
}

function resolveSnapshotExpectedPartitionIds(snapshot) {
  const expectedPartitionIds = snapshot?.expectedPartitionIds instanceof Set ?
    new Set(snapshot.expectedPartitionIds) :
    new Set();
  if (snapshot?.voterCounts instanceof Map &&
      snapshot.voterCounts.size > expectedPartitionIds.size) {
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
    inFlightReplicaOperationCount:
      Number(snapshot?.inFlightReplicaOperationCount || 0),
  };
}

function compareConvergenceSnapshotDebt(left, right) {
  const keys = [
    'missingLeaderCount',
    'overTargetCount',
    'inFlightReplicaOperationCount',
    'overTargetExcess',
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
  const allHaveLeaders = expectedPartitionIds.size > 0 &&
    [...expectedPartitionIds].every((partitionId) =>
      snapshot?.leaders?.has(partitionId),
    );
  const hasOverTarget = snapshot?.voterCounts instanceof Map &&
    [...snapshot.voterCounts.values()].some(
      (voterCount) => voterCount > targetVoterCount,
    );
  const hasInFlightReplicaOperations =
    Number(snapshot?.inFlightReplicaOperationCount || 0) > 0;
  return allHaveLeaders &&
    !hasOverTarget &&
    !hasInFlightReplicaOperations;
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
  const targetVoterCount = Number.isInteger(options?.targetVoterCount) &&
    options.targetVoterCount > 0 ?
    options.targetVoterCount :
    CONVERGENCE_DEFAULTS.targetVoterCount;
  const forceRepair = options?.forceRepair === true;
  const reachabilityTimeoutMs = Number.isFinite(options?.reachabilityTimeoutMs) &&
    options.reachabilityTimeoutMs > 0 ?
    Math.floor(options.reachabilityTimeoutMs) :
    CONVERGENCE_REACHABILITY_TIMEOUT_MS;
  const snapshotTimeoutMs = Number.isFinite(options?.snapshotTimeoutMs) &&
    options.snapshotTimeoutMs > 0 ?
    Math.floor(options.snapshotTimeoutMs) :
    CONVERGENCE_CONTROL_SNAPSHOT_TIMEOUT_MS;
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
          snapshot.error = controlSnapshotError ?
            String(controlSnapshotError?.message || controlSnapshotError) :
            null;
        } catch (sqlFallbackError) {
          if (!controlSnapshotError) {
            throw sqlFallbackError;
          }
          throw new Error(
            String(controlSnapshotError?.message || controlSnapshotError) +
              '; raw convergence fallback failed: ' +
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
        snapshot.expectedPartitionIds.size === 0 &&
        snapshot.leaders.size === 0;
      const hasPartialTopology =
        snapshot.voterCounts.size > 0 &&
        snapshot.expectedPartitionIds.size > 0 &&
        snapshot.voterCounts.size >
          snapshot.expectedPartitionIds.size;
      if (hasEmptyTopology || hasPartialTopology) {
        lastError = 'Snapshot from ' + String(node?.id) +
          ' has incomplete partition topology' +
          ' (partitions=' +
          snapshot.expectedPartitionIds.size +
          ', voterCounts=' +
          snapshot.voterCounts.size + ')';
        continue;
      }
      if (isConvergedSnapshot(snapshot, targetVoterCount)) {
        return snapshot;
      }
      const snapshotDebt = buildConvergenceSnapshotDebt(
        snapshot,
        targetVoterCount,
      );
      if (!bestSnapshot ||
          compareConvergenceSnapshotDebt(snapshotDebt, bestSnapshotDebt) < 0) {
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
              '; raw convergence fallback failed: ' +
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
  const opts = {...CONVERGENCE_DEFAULTS, ...options};
  const {
    settleTimeoutMs,
    quietWindowMs,
    maxSustainedOverTargetMs,
    sampleIntervalMs,
    targetVoterCount,
  } = opts;
  const ignoreStaleInFlightReplicaOperations =
    options?.ignoreStaleInFlightReplicaOperations === true;
  const forceRepairAfterMs = Number.isFinite(options.forceRepairAfterMs) ?
    options.forceRepairAfterMs :
    TIMEOUTS.ACTIVE_WAIT_FORCE_REPAIR_AFTER;

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
  let latestEffectiveInFlightReplicaOperationCount = 0;
  let latestInFlightReplicaOperationStatuses = new Map();
  let latestPartitionMembership = null;
  let latestControlPlaneDiagnostics = null;
  let latestSnapshotNodeId = null;
  let latestSnapshotError = null;

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
    latestControlPlaneDiagnostics = snapshot.controlPlaneDiagnostics;

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
    updateOverTargetState(
      overTargetState, latestCounts, now, targetVoterCount,
    );

    // Check convergence conditions.
    const hasOverTarget = [...latestCounts.values()].some(
      (c) => c > targetVoterCount,
    );
    const staleInFlightReplicaOperationCount = Number.isFinite(
      latestControlPlaneDiagnostics?.replicaOperations?.staleInFlightCount,
    ) ?
      Math.max(
        0,
        Math.floor(
          latestControlPlaneDiagnostics.replicaOperations
            .staleInFlightCount,
        ),
      ) :
      0;
    latestStaleInFlightReplicaOperationCount =
      staleInFlightReplicaOperationCount;
    const effectiveInFlightReplicaOperationCount =
      ignoreStaleInFlightReplicaOperations ?
        Math.max(
          0,
          latestInFlightReplicaOperationCount -
            staleInFlightReplicaOperationCount,
        ) :
        latestInFlightReplicaOperationCount;
    latestEffectiveInFlightReplicaOperationCount =
      effectiveInFlightReplicaOperationCount;
    const hasInFlightReplicaOperations =
      effectiveInFlightReplicaOperationCount > 0;
    const hasBlockingOverTarget = hasOverTarget &&
      (!ignoreStaleInFlightReplicaOperations ||
      hasInFlightReplicaOperations);
    const quietElapsed = now - lastLeaderChangeAt;
    const allHaveLeaders = latestExpectedPartitionIds.size > 0 &&
      [...latestExpectedPartitionIds].every(
        (pid) => latestLeaders.has(pid),
      );

    if (!hasBlockingOverTarget &&
        !hasInFlightReplicaOperations &&
        quietElapsed >= quietWindowMs &&
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
  const inFlightReplicaOperationSummary = {};
  for (const [status, count] of latestInFlightReplicaOperationStatuses) {
    inFlightReplicaOperationSummary[status] = count;
  }
  const expectedPartitions = [...latestExpectedPartitionIds].sort();

  const partitionMembership = latestPartitionMembership ||
    buildPartitionMembership(
      latestRows,
      targetVoterCount,
    );
  const membershipSnippet = formatPartitionMembershipSnippet(
    partitionMembership,
  );
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
    'Convergence timeout after ' + settleTimeoutMs + 'ms. ' +
    'Leader changes: ' + leaderChanges + '. ' +
    'Max over-target: ' + maxOT + 'ms. ' +
    'Snapshot node: ' + (latestSnapshotNodeId || VALUE_UNKNOWN) + '. ' +
    'Expected partitions: ' + JSON.stringify(expectedPartitions) + '. ' +
    'Voter counts: ' + JSON.stringify(voterSummary) + '. ' +
    'Leaders: ' + JSON.stringify(leaderSummary) + '. ' +
    'In-flight replica operations: ' +
    latestInFlightReplicaOperationCount + '. ' +
    (ignoreStaleInFlightReplicaOperations ?
      'Effective in-flight replica operations: ' +
      latestEffectiveInFlightReplicaOperationCount + '. ' :
      '') +
    'In-flight statuses: ' +
    JSON.stringify(inFlightReplicaOperationSummary) + '. ' +
    'Over-target durations: ' + JSON.stringify(overTargetSummary) + '. ' +
    'Replica membership: ' + membershipSnippet + '. ' +
    'Operation history: ' + operationHistorySnippet;

  const err = new Error(msg);
  err.diagnostics = {
    voterCounts: voterSummary,
    leaders: leaderSummary,
    leaderChanges,
    inFlightReplicaOperationCount: latestInFlightReplicaOperationCount,
    effectiveInFlightReplicaOperationCount:
      ignoreStaleInFlightReplicaOperations ?
        latestEffectiveInFlightReplicaOperationCount :
        latestInFlightReplicaOperationCount,
    staleInFlightReplicaOperationCount:
      latestStaleInFlightReplicaOperationCount,
    inFlightReplicaOperationStatuses: inFlightReplicaOperationSummary,
    replicaOperationRows: latestOperationRows,
    maxOverTargetMs: maxOT,
    overTargetDurations: overTargetSummary,
    expectedPartitions,
    snapshotNodeId: latestSnapshotNodeId,
    snapshotError: latestSnapshotError,
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
    if (!row || row.service_type !== 'partition' || !row.partition_id) {
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
    const voterCount = replicas.filter((replica) =>
      replica.voterReady === true).length;
    const leader = replicas.find((replica) =>
      String(replica.raftRole || '').toLowerCase() === STATUS_LEADER,
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
  const leftKey = String(
    left.nodeId || left.address || VALUE_UNKNOWN,
  );
  const rightKey = String(
    right.nodeId || right.address || VALUE_UNKNOWN,
  );
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
  const replicas = Array.isArray(details?.replicas) ?
    details.replicas :
    [];
  const visibleReplicas = replicas.slice(0, PARTITION_REPLICA_SNIPPET_LIMIT);
  const replicaSummary = visibleReplicas
    .map((replica) => formatReplicaMembershipEntry(replica))
    .join(REPLICA_MEMBER_SEPARATOR);
  const replicaOverflow = replicas.length - visibleReplicas.length;
  const replicaSuffix = replicaOverflow > 0 ?
    REPLICA_MEMBER_SEPARATOR +
    SNIPPET_EXTRA_PREFIX + replicaOverflow + SNIPPET_EXTRA_SUFFIX :
    '';
  const voterCount = Number.isFinite(details?.voterCount) ?
    details.voterCount :
    0;
  const targetVoterCount = Number.isFinite(details?.targetVoterCount) ?
    details.targetVoterCount :
    0;
  const leader = details?.leader || VALUE_NONE;
  return partitionId +
    MEMBER_SNIPPET_PREFIX +
    MEMBER_VOTER_PREFIX + voterCount +
    MEMBER_VOTER_SEPARATOR + targetVoterCount +
    MEMBER_LEADER_PREFIX + leader +
    MEMBER_REPLICA_PREFIX + replicaSummary + replicaSuffix +
    MEMBER_SNIPPET_SUFFIX;
}

function formatReplicaMembershipEntry(replica) {
  const node = replica?.nodeId || replica?.address || VALUE_UNKNOWN;
  const role = replica?.raftRole || STATUS_UNKNOWN;
  const status = replica?.status || STATUS_UNKNOWN;
  return node + ':' + role + ':' + status;
}

function summarizeReplicaOperations(rows, limit) {
  const normalized = rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => normalizeReplicaOperationRow(row))
    .sort((left, right) =>
      parseTimestampMs(right.at) - parseTimestampMs(left.at),
    );
  return normalized.slice(0, limit);
}

function normalizeReplicaOperationRow(row) {
  return {
    operationId: pickFirstFieldValue(row, OPERATION_FIELD_CANDIDATE_IDS),
    partitionId: pickFirstFieldValue(
      row,
      OPERATION_FIELD_CANDIDATE_PARTITION_IDS,
    ),
    type: pickFirstFieldValue(row, OPERATION_FIELD_CANDIDATE_TYPES),
    status: pickFirstFieldValue(row, OPERATION_FIELD_CANDIDATE_STATUSES),
    fromNodeId: pickFirstFieldValue(
      row,
      OPERATION_FIELD_CANDIDATE_FROM_NODE_IDS,
    ),
    toNodeId: pickFirstFieldValue(
      row,
      OPERATION_FIELD_CANDIDATE_TO_NODE_IDS,
    ),
    at: pickFirstFieldValue(row, OPERATION_FIELD_CANDIDATE_TIMESTAMPS),
  };
}

function pickFirstFieldValue(row, candidates) {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key) &&
      row[key] !== null &&
      row[key] !== undefined) {
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
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return 0;
}

function formatOperationHistorySnippet(operationHistory, operationHistoryError) {
  if (operationHistoryError) {
    return VALUE_UNAVAILABLE + '(' + operationHistoryError + ')';
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
  return operationId + ':' +
    partitionId + ':' +
    type + ':' +
    status + ':' +
    fromNodeId + '->' + toNodeId +
    OPERATION_HISTORY_AT_PREFIX + at;
}

function cloneDiagnostics(value) {
  if (!value || typeof value !== 'object') {
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
  if (convergence &&
      typeof convergence === 'object' &&
      !Array.isArray(convergence)) {
    return cloneDiagnostics(convergence);
  }
  const publicationEpoch = Number.isInteger(state?.publicationEpoch) ?
    state.publicationEpoch :
    null;
  const publishedActiveNodeIds = Array.isArray(state?.publishedActiveNodeIds) ?
    [...state.publishedActiveNodeIds].sort() :
    null;
  if (!Number.isInteger(publicationEpoch) &&
      !Array.isArray(publishedActiveNodeIds)) {
    return null;
  }
  return {
    publicationEpoch,
    publishedActiveNodeIds: Array.isArray(publishedActiveNodeIds) ?
      publishedActiveNodeIds :
      [],
  };
}

function buildConsistencyStateByNodeId(nodeStates) {
  const stateByNodeId = {};
  for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
    const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
    stateByNodeId[nodeId] = {
      activeNodes: Array.isArray(state?.activeNodes) ?
        [...state.activeNodes].sort() :
        [],
      authoritativeActiveNodes: Array.isArray(state?.authoritativeActiveNodes) ?
        [...state.authoritativeActiveNodes].sort() :
        null,
      partitions: Array.isArray(state?.partitions) ?
        [...state.partitions].sort() :
        [],
      publicationEpoch: Number.isInteger(state?.publicationEpoch) ?
        state.publicationEpoch :
        null,
      publishedActiveNodeIds: Array.isArray(state?.publishedActiveNodeIds) ?
        [...state.publishedActiveNodeIds].sort() :
        [],
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
    const snapshotDiagnostics = cloneDiagnostics(state?.controlPlaneDiagnostics);
    if (snapshotDiagnostics) {
      snapshotDiagnosticsByNodeId[nodeId] = snapshotDiagnostics;
    }
  }

  if (Object.keys(publicationConvergenceByNodeId).length === 0 &&
      Object.keys(snapshotDiagnosticsByNodeId).length === 0) {
    return null;
  }

  const preferredSnapshotNodeId = String(
    mismatch?.referenceNodeId ||
    (Array.isArray(nodeStates) && nodeStates.length > 0 ?
      nodeStates[0]?.nodeId :
      VALUE_UNKNOWN) ||
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
      ...(mismatch && typeof mismatch === 'object' ? mismatch : {}),
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
    ...(error?.diagnostics && typeof error.diagnostics === 'object' ?
      error.diagnostics :
      {}),
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
  const tolerateEmptyLeaders =
    options.tolerateEmptyLeaders === true;
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
      if (typeof node?.getControlSnapshot === 'function' &&
          report.adminReady !== true) {
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
      'nodes (found ' + queryable.length + '). Reachability: ' +
      summary,
    );
  }

  // Collect state from each reachable node.
  const nodeStates = [];
  const queryFailures = [];
  for (const node of queryable) {
    try {
      nodeStates.push(
        await queryNodeConsistencyState(node, {forceRepair}),
      );
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
      .map((failure) => failure.nodeId + '=' + failure.error)
      .join('; ');
    throw new Error(
      'Cannot assert consistency: fewer than 2 queryable ' +
      'nodes (found ' + nodeStates.length + '). Reachability: ' +
      summary +
      (queryFailureSummary ?
        '. Query failures: ' + queryFailureSummary :
        ''),
    );
  }

  if (!forceRepair) {
    const hasAuthoritativePublishedMembership = nodeStates.some((state) =>
      Array.isArray(state?.authoritativeActiveNodes),
    );
    const hasMissingAuthoritativePublishedMembership = nodeStates.some((state) =>
      !Array.isArray(state?.authoritativeActiveNodes),
    );
    if (hasAuthoritativePublishedMembership &&
        hasMissingAuthoritativePublishedMembership) {
      const reachableByNodeId = new Map(
        queryable.map((node) => [String(node?.id || ''), node]),
      );
      for (let i = 0; i < nodeStates.length; i++) {
        const state = nodeStates[i];
        if (Array.isArray(state?.authoritativeActiveNodes)) {
          continue;
        }
        const node = reachableByNodeId.get(String(state?.nodeId || ''));
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

  // Compare all states against the first node.
  const reference = nodeStates[0];
  const refActiveStr = JSON.stringify(reference.activeNodes);
  const refHasAuthoritativeActiveNodes =
    Array.isArray(reference.authoritativeActiveNodes);
  const refAuthoritativeActiveStr = refHasAuthoritativeActiveNodes ?
    JSON.stringify(reference.authoritativeActiveNodes) :
    null;
  const refPartStr = JSON.stringify(reference.partitions);
  const refLeaders = sortObjectKeys(
    normalizeLeaders(reference.leaders),
  );
  const refLeaderStr = JSON.stringify(refLeaders);
  const refPublicationEpoch = Number.isInteger(reference.publicationEpoch) ?
    reference.publicationEpoch :
    null;
  const refPublishedActiveStr = JSON.stringify(
    Array.isArray(reference.publishedActiveNodeIds) ?
      [...reference.publishedActiveNodeIds].sort() :
      [],
  );

  for (let i = 1; i < nodeStates.length; i++) {
    const other = nodeStates[i];

    const otherActiveStr = JSON.stringify(other.activeNodes);
    const otherHasAuthoritativeActiveNodes =
      Array.isArray(other.authoritativeActiveNodes);
    const canCompareAuthoritativeActiveNodes =
      refHasAuthoritativeActiveNodes &&
      otherHasAuthoritativeActiveNodes;

    if (canCompareAuthoritativeActiveNodes) {
      const otherAuthoritativeActiveStr =
        JSON.stringify(other.authoritativeActiveNodes);
      if (otherAuthoritativeActiveStr !== refAuthoritativeActiveStr) {
        throw createConsistencyMismatchError(
          'Published active-node sets disagree between ' +
          reference.nodeId + ' and ' + other.nodeId + '. ' +
          reference.nodeId + ': ' + refAuthoritativeActiveStr + '. ' +
          other.nodeId + ': ' + otherAuthoritativeActiveStr,
          {
            nodeStates,
            mismatch: {
              reasonCode: 'published_active_nodes_disagree',
              referenceNodeId: reference.nodeId,
              otherNodeId: other.nodeId,
            },
          },
        );
      }
    } else if (otherActiveStr !== refActiveStr) {
      if (tolerateActiveNodeSkew &&
          isTolerableActiveNodeSkew(
            reference.activeNodes,
            other.activeNodes,
            maxActiveNodeSkew,
          )) {
        continue;
      }
      throw createConsistencyMismatchError(
        'Active nodes disagree between ' +
        reference.nodeId + ' and ' + other.nodeId + '. ' +
        reference.nodeId + ': ' + refActiveStr + '. ' +
        other.nodeId + ': ' + otherActiveStr,
        {
          nodeStates,
          mismatch: {
            reasonCode: 'active_nodes_disagree',
            referenceNodeId: reference.nodeId,
            otherNodeId: other.nodeId,
          },
        },
      );
    }

    const otherPartStr = JSON.stringify(other.partitions);
    if (otherPartStr !== refPartStr) {
      if (toleratePartitionSkew &&
          isTolerablePartitionSkew(
            reference.partitions,
            other.partitions,
            maxPartitionSkew,
          )) {
        continue;
      }
      throw createConsistencyMismatchError(
        'Partition assignments disagree between ' +
        reference.nodeId + ' and ' + other.nodeId + '. ' +
        reference.nodeId + ': ' + refPartStr + '. ' +
        other.nodeId + ': ' + otherPartStr,
        {
          nodeStates,
          mismatch: {
            reasonCode: 'partition_assignments_disagree',
            referenceNodeId: reference.nodeId,
            otherNodeId: other.nodeId,
          },
        },
      );
    }

    const otherLeaders = sortObjectKeys(
      normalizeLeaders(other.leaders),
    );
    const otherLeaderStr = JSON.stringify(otherLeaders);
    if (otherLeaderStr !== refLeaderStr) {
      if (tolerateEmptyLeaders &&
          !hasConflictingLeaders(refLeaders, otherLeaders)) {
        continue;
      }
      throw createConsistencyMismatchError(
        'Leader identities disagree between ' +
        reference.nodeId + ' and ' + other.nodeId + '. ' +
        reference.nodeId + ': ' + refLeaderStr + '. ' +
        other.nodeId + ': ' + otherLeaderStr,
        {
          nodeStates,
          mismatch: {
            reasonCode: 'leader_identities_disagree',
            referenceNodeId: reference.nodeId,
            otherNodeId: other.nodeId,
          },
        },
      );
    }

    if (canCompareAuthoritativeActiveNodes) {
      const otherPublicationEpoch = Number.isInteger(other.publicationEpoch) ?
        other.publicationEpoch :
        null;
      if (otherPublicationEpoch !== refPublicationEpoch) {
        throw createConsistencyMismatchError(
          'Publication epochs disagree between ' +
          reference.nodeId + ' and ' + other.nodeId + '. ' +
          reference.nodeId + ': ' + String(refPublicationEpoch) + '. ' +
          other.nodeId + ': ' + String(otherPublicationEpoch),
          {
            nodeStates,
            mismatch: {
              reasonCode: 'publication_epochs_disagree',
              referenceNodeId: reference.nodeId,
              otherNodeId: other.nodeId,
            },
          },
        );
      }

      const otherPublishedActiveStr = JSON.stringify(
        Array.isArray(other.publishedActiveNodeIds) ?
          [...other.publishedActiveNodeIds].sort() :
          [],
      );
      if (otherPublishedActiveStr !== refPublishedActiveStr) {
        throw createConsistencyMismatchError(
          'Published active-node sets disagree between ' +
          reference.nodeId + ' and ' + other.nodeId + '. ' +
          reference.nodeId + ': ' + refPublishedActiveStr + '. ' +
          other.nodeId + ': ' + otherPublishedActiveStr,
          {
            nodeStates,
            mismatch: {
              reasonCode: 'published_active_nodes_disagree',
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
  const timeoutMs = Number.isFinite(options.timeoutMs) ?
    options.timeoutMs :
    TIMEOUTS.CONSISTENCY_CONVERGENCE;
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) ?
    options.pollIntervalMs :
    TIMEOUTS.CONSISTENCY_CONVERGENCE_POLL_INTERVAL;
  const forceRepairAfterMs = Number.isFinite(
    options.forceRepairAfterMs,
  ) ?
    options.forceRepairAfterMs :
    TIMEOUTS.CONSISTENCY_CONVERGENCE_FORCE_REPAIR_AFTER;
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const forceRepairThreshold = Date.now() +
    Math.max(0, forceRepairAfterMs);
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

  throw lastError || new Error(
    'Consistency check did not converge within ' +
    timeoutMs + 'ms',
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
    activeNodes: Array.isArray(snapshot?.nodes) ?
      [...snapshot.nodes].sort() : [],
    authoritativeActiveNodes:
      extractControlSnapshotPublishedNodeIds(snapshot) instanceof Set ?
        Array.from(extractControlSnapshotPublishedNodeIds(snapshot)).sort() :
        null,
    projectedActiveNodes:
      Array.from(extractControlSnapshotProjectedNodeIds(snapshot)).sort(),
    partitions: Array.isArray(snapshot?.partitions) ?
      [...snapshot.partitions].sort() : [],
    leaders: snapshot?.leaders &&
      typeof snapshot.leaders === 'object' ?
      sortObjectKeys(normalizeLeaders(snapshot.leaders)) : {},
    publicationEpoch: Number.isInteger(
      snapshot?.controlPlaneDiagnostics?.publicationConvergence?.publicationEpoch,
    ) ?
      snapshot.controlPlaneDiagnostics.publicationConvergence.publicationEpoch :
      (Number.isInteger(snapshot?.publicationEpoch) ?
        snapshot.publicationEpoch :
        null),
    publishedActiveNodeIds: Array.isArray(
      snapshot?.controlPlaneDiagnostics?.publicationConvergence?.publishedActiveNodeIds,
    ) ?
      [...snapshot.controlPlaneDiagnostics.publicationConvergence
        .publishedActiveNodeIds].sort() :
      (Array.isArray(snapshot?.publishedActiveNodeIds) ?
        [...snapshot.publishedActiveNodeIds].sort() :
        []),
  }));

  const reference = normalized[0];
  const refActiveStr = JSON.stringify(reference.activeNodes);
  const refHasAuthoritativeActiveNodes =
    Array.isArray(reference.authoritativeActiveNodes);
  const refAuthoritativeActiveStr = refHasAuthoritativeActiveNodes ?
    JSON.stringify(reference.authoritativeActiveNodes) :
    null;
  const refPartStr = JSON.stringify(reference.partitions);
  const refLeaderStr = JSON.stringify(reference.leaders);
  const refPublicationEpoch = Number.isInteger(reference.publicationEpoch) ?
    reference.publicationEpoch :
    null;
  const refPublishedActiveStr = JSON.stringify(
    reference.publishedActiveNodeIds,
  );

  for (let i = 1; i < normalized.length; i++) {
    const other = normalized[i];

    const otherActiveStr =
      JSON.stringify(other.activeNodes);
    const otherHasAuthoritativeActiveNodes =
      Array.isArray(other.authoritativeActiveNodes);
    const canCompareAuthoritativeActiveNodes =
      refHasAuthoritativeActiveNodes &&
      otherHasAuthoritativeActiveNodes;

    if (canCompareAuthoritativeActiveNodes) {
      const otherAuthoritativeActiveStr =
        JSON.stringify(other.authoritativeActiveNodes);
      if (otherAuthoritativeActiveStr !== refAuthoritativeActiveStr) {
        throw new Error(
          'Published active-node sets disagree between ' +
          reference.nodeId + ' and ' + other.nodeId +
          '. ' + reference.nodeId + ': ' +
          refAuthoritativeActiveStr + '. ' +
          other.nodeId + ': ' + otherAuthoritativeActiveStr,
        );
      }
    } else if (otherActiveStr !== refActiveStr) {
      throw new Error(
        'Active nodes disagree between ' +
        reference.nodeId + ' and ' + other.nodeId +
        '. ' + reference.nodeId + ': ' +
        refActiveStr + '. ' +
        other.nodeId + ': ' + otherActiveStr,
      );
    }

    const otherPartStr =
      JSON.stringify(other.partitions);
    if (otherPartStr !== refPartStr) {
      throw new Error(
        'Partition assignments disagree between ' +
        reference.nodeId + ' and ' + other.nodeId +
        '. ' + reference.nodeId + ': ' +
        refPartStr + '. ' +
        other.nodeId + ': ' + otherPartStr,
      );
    }

    const otherLeaderStr =
      JSON.stringify(other.leaders);
    if (otherLeaderStr !== refLeaderStr) {
      throw new Error(
        'Leader identities disagree between ' +
        reference.nodeId + ' and ' + other.nodeId +
        '. ' + reference.nodeId + ': ' +
        refLeaderStr + '. ' +
        other.nodeId + ': ' + otherLeaderStr,
      );
    }

    if (canCompareAuthoritativeActiveNodes) {
      if (other.publicationEpoch !== refPublicationEpoch) {
        throw new Error(
          'Publication epochs disagree between ' +
          reference.nodeId + ' and ' + other.nodeId +
          '. ' + reference.nodeId + ': ' +
          String(refPublicationEpoch) + '. ' +
          other.nodeId + ': ' + String(other.publicationEpoch),
        );
      }

      const otherPublishedActiveStr =
        JSON.stringify(other.publishedActiveNodeIds);
      if (otherPublishedActiveStr !== refPublishedActiveStr) {
        throw new Error(
          'Published active-node sets disagree between ' +
          reference.nodeId + ' and ' + other.nodeId +
          '. ' + reference.nodeId + ': ' +
          refPublishedActiveStr + '. ' +
          other.nodeId + ': ' + otherPublishedActiveStr,
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
      'Cannot assert data integrity: no reachable nodes. Reachability: ' +
      summary,
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
  waitForConsistencyConvergence,
  assertConsistencyFromSnapshots,
  assertDataIntegrity,
  hasConflictingLeaders,
  isVoterReady,
  countVotersPerPartition,
  extractLeaders,
  updateOverTargetState,
  finalizeOverTargetState,
};
