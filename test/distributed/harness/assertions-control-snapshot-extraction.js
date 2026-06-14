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
  'SELECT * FROM services WHERE service_type = \'partition\'';
const NODES_QUERY = 'SELECT * FROM nodes WHERE status = \'active\'';
const PARTITIONS_QUERY = 'SELECT * FROM partitions';
const CONTROL_SNAPSHOT_REQUIRED_ERROR_PREFIX =
  'Control snapshot API is required for convergence assertions on node ';
const CONVERGENCE_REACHABILITY_TIMEOUT_MS = 1000;
let CONVERGENCE_CONTROL_SNAPSHOT_TIMEOUT_MS = 10000;
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
const OPERATION_FIELD_CANDIDATE_STATUSES = Object.freeze(['status', 'state']);
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
const CONTROL_SNAPSHOT_FIELD_PARTITION_LEADER_AUTHORITY =
  'partitionLeaderAuthority';
const CONTROL_SNAPSHOT_FIELD_OBSERVATION_MODE = 'observationMode';
const CONTROL_SNAPSHOT_FIELD_ADMIN_OBSERVATION = 'adminObservation';
const CONTROL_SNAPSHOT_FIELD_VOTER_COUNTS = 'voterCounts';
const CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION = 'snapshotRevision';
const CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_STATE = 'snapshotRevisionState';
const CONTROL_SNAPSHOT_FIELD_SNAPSHOT_EXPECTED_MINIMUM_REVISION =
  'snapshotExpectedMinimumRevision';
const CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_GAP = 'snapshotRevisionGap';
const CONTROL_SNAPSHOT_FIELD_SNAPSHOT_RESUME_TOKEN = 'snapshotResumeToken';
const CONTROL_SNAPSHOT_FIELD_REPLICA_OPERATIONS = 'replicaOperations';
const CONTROL_SNAPSHOT_FIELD_IN_FLIGHT_COUNT = 'inFlightCount';
const CONTROL_SNAPSHOT_FIELD_STATUS_HISTOGRAM = 'statusHistogram';
const CONTROL_SNAPSHOT_FIELD_ROWS = 'rows';
const CONTROL_SNAPSHOT_FIELD_PARTITION_MEMBERSHIP = 'partitionMembership';
const CONTROL_SNAPSHOT_FIELD_REPLICA_ROLE_DIAGNOSTICS =
  'replicaRoleDiagnostics';
const CONTROL_SNAPSHOT_FIELD_ACTIVE_NODE_VIEWS = 'activeNodeViews';
const REPLICA_ROLE_DIAGNOSTICS_LEADER_NODE_IDS = 'replicaLeaderNodeIds';
const CONTROL_SNAPSHOT_FIELD_REPLICA_ROLES = 'replicaRoles';
const REPLICA_ROLE_LEADER = 'leader';
const PARTITION_LEADER_AUTHORITY_FIELD_SCHEMA_VERSION = 'schemaVersion';
const PARTITION_LEADER_AUTHORITY_FIELD_PARTITION_ID = 'partitionId';
const PARTITION_LEADER_AUTHORITY_FIELD_LEADER_NODE_ID = 'leaderNodeId';
const PARTITION_LEADER_AUTHORITY_FIELD_LEADER_SOURCE = 'leaderSource';
const PARTITION_LEADER_AUTHORITY_FIELD_TOPOLOGY_EPOCH = 'topologyEpoch';
const PARTITION_LEADER_AUTHORITY_FIELD_MEMBERSHIP_EPOCH = 'membershipEpoch';
const PARTITION_LEADER_AUTHORITY_FIELD_SNAPSHOT_REVISION = 'snapshotRevision';
const PARTITION_LEADER_AUTHORITY_FIELD_REPLICA_ROLE_CONSISTENT =
  'replicaRoleConsistent';
const PARTITION_LEADER_AUTHORITY_FIELD_REPLICA_LEADER_NODE_IDS =
  'replicaLeaderNodeIds';
const CONTROL_SNAPSHOT_ADMIN_OBSERVATION_FIELD_MODE = 'mode';
const PARTITION_LEADER_AUTHORITY_INTEGER_AVAILABLE = 'available';
const PARTITION_LEADER_AUTHORITY_INTEGER_UNAVAILABLE = 'unavailable';
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
  const timeoutMs =
    Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0 ?
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
    if (
      result &&
      typeof result === 'object' &&
      Object.prototype.hasOwnProperty.call(result, 'reachable')
    ) {
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
        '[' +
        state +
        ',source=' +
        source +
        ',error=' +
        error +
        ']',
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
  const status = typeof row.status === 'string' ? row.status.toLowerCase() : '';
  if (status !== 'active') return false;
  const role =
    typeof row.raft_role === 'string' ? row.raft_role.toLowerCase() : null;
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
 * Supplement a partition-id set from service-derived topology signals.
 *
 * The raw SQL fallback can temporarily observe a local `services` view that
 * already exposes a partition while the local `partitions` table projection is
 * still catching up. Treat leader-visible partitions and partitions with a
 * full voter set as present so consistency checks do not fail on that transient
 * table skew alone.
 *
 * @param {Set<string>} partitionIds
 * @param {Map<string, string>} leaders
 * @param {Map<string, number>} voterCounts
 */
function supplementPartitionIdsFromServiceTopology(
  partitionIds,
  leaders,
  voterCounts,
) {
  if (!(partitionIds instanceof Set)) {
    return;
  }

  if (leaders instanceof Map) {
    for (const partitionId of leaders.keys()) {
      if (typeof partitionId === 'string' && partitionId.length > 0) {
        partitionIds.add(partitionId);
      }
    }
  }

  if (!(voterCounts instanceof Map)) {
    return;
  }

  for (const [partitionId, voterCount] of voterCounts.entries()) {
    if (typeof partitionId !== 'string' || partitionId.length === 0) {
      continue;
    }
    if (voterCount >= CONVERGENCE_DEFAULTS.targetVoterCount) {
      partitionIds.add(partitionId);
    }
  }
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
  const partitionIds = new Set([...counts.keys(), ...state.keys()]);

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
      entry.maxOverTargetMs = Math.max(entry.maxOverTargetMs, duration);
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
      entry.maxOverTargetMs = Math.max(entry.maxOverTargetMs, duration);
      entry.inOverTargetSince = null;
    }
  }
}

function normalizeStatusCountMap(statusHistogram) {
  const statusCounts = new Map();
  if (
    !statusHistogram ||
    typeof statusHistogram !== 'object' ||
    Array.isArray(statusHistogram)
  ) {
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
  if (
    !voterCounts ||
    typeof voterCounts !== 'object' ||
    Array.isArray(voterCounts)
  ) {
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
  if (
    rows.length === 0 ||
    !rows[0] ||
    typeof rows[0] !== 'object' ||
    Array.isArray(rows[0])
  ) {
    throw new Error(
      'Control snapshot query returned no rows for node ' +
        String(nodeId || VALUE_UNKNOWN),
    );
  }
  return rows[0];
}

function extractControlSnapshotObservationMode(snapshot) {
  const explicitMode = String(
    snapshot?.[CONTROL_SNAPSHOT_FIELD_OBSERVATION_MODE] || '',
  ).trim();
  if (explicitMode.length > 0) {
    return explicitMode;
  }
  const adminObservationMode = String(
    snapshot?.[CONTROL_SNAPSHOT_FIELD_ADMIN_OBSERVATION]?.[
      CONTROL_SNAPSHOT_ADMIN_OBSERVATION_FIELD_MODE
    ] || '',
  ).trim();
  return adminObservationMode.length > 0 ?
    adminObservationMode :
    VALUE_UNKNOWN;
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
    snapshot?.controlPlaneDiagnostics?.[
      CONTROL_SNAPSHOT_FIELD_ACTIVE_NODE_VIEWS
    ];
  const hasActiveNodeViews =
    activeNodeViews &&
    typeof activeNodeViews === 'object' &&
    !Array.isArray(activeNodeViews);
  if (
    hasActiveNodeViews &&
    activeNodeViews.publishedMembershipAvailable !== true
  ) {
    return null;
  }

  const explicitPublishedNodes = Array.isArray(
    snapshot?.[CONTROL_SNAPSHOT_FIELD_PUBLISHED_NODES],
  ) ?
    snapshot[CONTROL_SNAPSHOT_FIELD_PUBLISHED_NODES] :
    Array.isArray(activeNodeViews?.publishedNodeIds) ?
      activeNodeViews.publishedNodeIds :
      null;
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
    snapshot?.controlPlaneDiagnostics?.[
      CONTROL_SNAPSHOT_FIELD_ACTIVE_NODE_VIEWS
    ];
  const projectedNodes = Array.isArray(
    snapshot?.[CONTROL_SNAPSHOT_FIELD_PROJECTED_NODES],
  ) ?
    snapshot[CONTROL_SNAPSHOT_FIELD_PROJECTED_NODES] :
    Array.isArray(activeNodeViews?.projectedNodeIds) ?
      activeNodeViews.projectedNodeIds :
      null;
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
  const partitions = Array.isArray(
    snapshot?.[CONTROL_SNAPSHOT_FIELD_PARTITIONS],
  ) ?
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
  if (leaderMap && typeof leaderMap === 'object' && !Array.isArray(leaderMap)) {
    for (const [partitionId, leaderAddress] of Object.entries(leaderMap)) {
      const pid = String(partitionId || '').trim();
      const addr = String(leaderAddress || '').trim();
      if (pid.length > 0 && addr.length > 0) {
        leaders.set(pid, addr);
      }
    }
  }
  return leaders;
}

function normalizeControlSnapshotAuthorityString(value) {
  return String(value || '').trim();
}

function normalizeControlSnapshotAuthorityInteger(value) {
  return Number.isInteger(value) && value >= 0 ?
    {
      state: PARTITION_LEADER_AUTHORITY_INTEGER_AVAILABLE,
      value,
    } :
    {
      state: PARTITION_LEADER_AUTHORITY_INTEGER_UNAVAILABLE,
    };
}

function normalizeControlSnapshotAuthorityNodeIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => normalizeLeaderAddress(
      normalizeControlSnapshotAuthorityString(value),
    ))
    .filter((value) => value.length > 0)
    .sort();
}

function extractControlSnapshotPartitionLeaderAuthority(snapshot) {
  const authorityByPartitionId = new Map();
  const authority =
    snapshot?.[CONTROL_SNAPSHOT_FIELD_PARTITION_LEADER_AUTHORITY];
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    return authorityByPartitionId;
  }
  const snapshotRevisionMetadata = extractControlSnapshotRevisionMetadata(
    snapshot,
  );
  for (const [fallbackPartitionId, certificate] of Object.entries(authority)) {
    if (
      !certificate ||
      typeof certificate !== 'object' ||
      Array.isArray(certificate)
    ) {
      continue;
    }
    const partitionId =
      normalizeControlSnapshotAuthorityString(
        certificate[PARTITION_LEADER_AUTHORITY_FIELD_PARTITION_ID],
      ) || normalizeControlSnapshotAuthorityString(fallbackPartitionId);
    const leaderNodeId = normalizeLeaderAddress(
      normalizeControlSnapshotAuthorityString(
        certificate[PARTITION_LEADER_AUTHORITY_FIELD_LEADER_NODE_ID],
      ),
    );
    if (partitionId.length === 0 || leaderNodeId.length === 0) {
      continue;
    }
    const normalizedCertificate = {
      partitionId,
      leaderNodeId,
      leaderSource:
        normalizeControlSnapshotAuthorityString(
          certificate[PARTITION_LEADER_AUTHORITY_FIELD_LEADER_SOURCE],
        ) || VALUE_UNKNOWN,
      replicaRoleConsistent:
        certificate[
          PARTITION_LEADER_AUTHORITY_FIELD_REPLICA_ROLE_CONSISTENT
        ] === true,
      replicaLeaderNodeIds: normalizeControlSnapshotAuthorityNodeIds(
        certificate[
          PARTITION_LEADER_AUTHORITY_FIELD_REPLICA_LEADER_NODE_IDS
        ],
      ),
    };
    const schemaVersion = normalizeControlSnapshotAuthorityInteger(
      certificate[PARTITION_LEADER_AUTHORITY_FIELD_SCHEMA_VERSION],
    );
    if (schemaVersion.state === PARTITION_LEADER_AUTHORITY_INTEGER_AVAILABLE) {
      normalizedCertificate.schemaVersion = schemaVersion.value;
    }
    const topologyEpoch = normalizeControlSnapshotAuthorityInteger(
      certificate[PARTITION_LEADER_AUTHORITY_FIELD_TOPOLOGY_EPOCH],
    );
    if (topologyEpoch.state === PARTITION_LEADER_AUTHORITY_INTEGER_AVAILABLE) {
      normalizedCertificate.topologyEpoch = topologyEpoch.value;
    }
    const membershipEpoch = normalizeControlSnapshotAuthorityInteger(
      certificate[PARTITION_LEADER_AUTHORITY_FIELD_MEMBERSHIP_EPOCH],
    );
    if (membershipEpoch.state === PARTITION_LEADER_AUTHORITY_INTEGER_AVAILABLE) {
      normalizedCertificate.membershipEpoch = membershipEpoch.value;
    }
    const snapshotRevision = normalizeControlSnapshotAuthorityInteger(
      certificate[PARTITION_LEADER_AUTHORITY_FIELD_SNAPSHOT_REVISION],
    );
    const topLevelSnapshotRevision =
      snapshotRevisionMetadata.snapshotRevision;
    if (snapshotRevision.state === PARTITION_LEADER_AUTHORITY_INTEGER_AVAILABLE) {
      normalizedCertificate.snapshotRevision = snapshotRevision.value;
    } else if (Number.isInteger(topLevelSnapshotRevision)) {
      normalizedCertificate.snapshotRevision = topLevelSnapshotRevision;
    }
    authorityByPartitionId.set(partitionId, normalizedCertificate);
  }
  return authorityByPartitionId;
}

function extractControlSnapshotVoterCounts(snapshot) {
  const voterCounts = normalizeVoterCountMap(
    snapshot?.[CONTROL_SNAPSHOT_FIELD_VOTER_COUNTS],
  );
  if (voterCounts.size > 0) {
    return voterCounts;
  }

  const partitionMembership =
    snapshot?.[CONTROL_SNAPSHOT_FIELD_PARTITION_MEMBERSHIP];
  if (
    !partitionMembership ||
    typeof partitionMembership !== 'object' ||
    Array.isArray(partitionMembership)
  ) {
    return voterCounts;
  }

  for (const [partitionId, membership] of Object.entries(partitionMembership)) {
    const normalizedPartitionId = String(partitionId || '').trim();
    const voterCount = membership?.voterCount;
    if (
      normalizedPartitionId.length === 0 ||
      !Number.isFinite(voterCount) ||
      voterCount < 0
    ) {
      continue;
    }
    voterCounts.set(normalizedPartitionId, Math.floor(voterCount));
  }
  return voterCounts;
}

function extractControlSnapshotInFlightSummary(snapshot) {
  const replicaOperations =
    snapshot?.[CONTROL_SNAPSHOT_FIELD_REPLICA_OPERATIONS];
  const inFlightCount =
    Number.isInteger(
      replicaOperations?.[CONTROL_SNAPSHOT_FIELD_IN_FLIGHT_COUNT],
    ) && replicaOperations[CONTROL_SNAPSHOT_FIELD_IN_FLIGHT_COUNT] >= 0 ?
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
  const replicaOperations =
    snapshot?.[CONTROL_SNAPSHOT_FIELD_REPLICA_OPERATIONS];
  const operationRows = Array.isArray(
    replicaOperations?.[CONTROL_SNAPSHOT_FIELD_ROWS],
  ) ?
    replicaOperations[CONTROL_SNAPSHOT_FIELD_ROWS] :
    [];
  return operationRows.filter((row) => row && typeof row === 'object');
}

function extractControlSnapshotPartitionMembership(snapshot) {
  const partitionMembership =
    snapshot?.[CONTROL_SNAPSHOT_FIELD_PARTITION_MEMBERSHIP];
  if (
    !partitionMembership ||
    typeof partitionMembership !== 'object' ||
    Array.isArray(partitionMembership)
  ) {
    return null;
  }
  return partitionMembership;
}

function extractControlSnapshotPublicationConvergence(snapshot) {
  const controlPlaneDiagnostics = snapshot?.controlPlaneDiagnostics;
  if (!controlPlaneDiagnostics || typeof controlPlaneDiagnostics !== 'object') {
    return null;
  }
  const publicationConvergence = controlPlaneDiagnostics.publicationConvergence;
  if (!publicationConvergence || typeof publicationConvergence !== 'object') {
    return null;
  }
  return publicationConvergence;
}

function extractControlSnapshotControlPlaneDiagnostics(snapshot) {
  const controlPlaneDiagnostics = snapshot?.controlPlaneDiagnostics;
  if (
    !controlPlaneDiagnostics ||
    typeof controlPlaneDiagnostics !== 'object' ||
    Array.isArray(controlPlaneDiagnostics)
  ) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(controlPlaneDiagnostics));
  } catch (_error) {
    return null;
  }
}

function extractControlSnapshotRevisionMetadata(snapshot) {
  const snapshotRevision =
    Number.isInteger(snapshot?.[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION]) &&
    snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION] >= 0 ?
      snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION] :
      null;
  const snapshotRevisionState =
    typeof snapshot?.[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_STATE] ===
      'string' &&
    snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_STATE].length > 0 ?
      snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_STATE] :
      null;
  const snapshotExpectedMinimumRevision =
    Number.isInteger(
      snapshot?.[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_EXPECTED_MINIMUM_REVISION],
    ) &&
    snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_EXPECTED_MINIMUM_REVISION] >= 0 ?
      snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_EXPECTED_MINIMUM_REVISION] :
      null;
  const snapshotRevisionGap =
    Number.isInteger(
      snapshot?.[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_GAP],
    ) && snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_GAP] >= 0 ?
      snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_GAP] :
      null;
  const snapshotResumeToken =
    typeof snapshot?.[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_RESUME_TOKEN] ===
      'string' &&
    snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_RESUME_TOKEN].length > 0 ?
      snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_RESUME_TOKEN] :
      null;
  return {
    snapshotRevision,
    snapshotRevisionState,
    snapshotExpectedMinimumRevision,
    snapshotRevisionGap,
    snapshotResumeToken,
  };
}

async function queryControlSnapshot(node, options = {}) {
  if (typeof node?.getControlSnapshot !== 'function') {
    throw new Error(
      CONTROL_SNAPSHOT_REQUIRED_ERROR_PREFIX +
        String(node?.id || VALUE_UNKNOWN),
    );
  }

  const timeoutMs =
    Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0 ?
      Math.floor(options.timeoutMs) :
      CONVERGENCE_CONTROL_SNAPSHOT_TIMEOUT_MS;
  const lane =
    typeof options?.lane === 'string' && options.lane.length > 0 ?
      options.lane :
      ADMIN_SOCKET_LANE_SNAPSHOT;
  const allowLaneFallback = options?.allowLaneFallback !== false;

  const queryForLane = async (targetLane) => {
    const result = await node.getControlSnapshot({
      forceRepair: options.forceRepair === true,
      forceAuthoritativeRepair: options.forceAuthoritativeRepair === true,
      timeoutMs,
      lane: targetLane,
    });
    const snapshot = extractControlSnapshotPayload(result, node?.id);
    const inFlightSummary = extractControlSnapshotInFlightSummary(snapshot);
    const publicationConvergence =
      extractControlSnapshotPublicationConvergence(snapshot);
    const controlPlaneDiagnostics =
      extractControlSnapshotControlPlaneDiagnostics(snapshot);
    const snapshotRevisionMetadata =
      extractControlSnapshotRevisionMetadata(snapshot);

    return {
      nodeId: String(node?.id || VALUE_UNKNOWN),
      servicesRows: [],
      activeNodeIds: extractControlSnapshotNodeIds(snapshot),
      authoritativeActiveNodeIds:
        extractControlSnapshotPublishedNodeIds(snapshot),
      projectedActiveNodeIds: extractControlSnapshotProjectedNodeIds(snapshot),
      expectedPartitionIds: extractControlSnapshotPartitionIds(snapshot),
      operationRows: extractControlSnapshotOperationRows(snapshot),
      error: null,
      voterCounts: extractControlSnapshotVoterCounts(snapshot),
      leaders: extractControlSnapshotLeaders(snapshot),
      partitionLeaderAuthority:
        extractControlSnapshotPartitionLeaderAuthority(snapshot),
      publicationEpoch: Number.isInteger(
        publicationConvergence?.publicationEpoch,
      ) ?
        publicationConvergence.publicationEpoch :
        null,
      sourceSnapshotVersion: Number.isInteger(
        publicationConvergence?.sourceSnapshotVersion,
      ) ?
        publicationConvergence.sourceSnapshotVersion :
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
      snapshotRevision: snapshotRevisionMetadata.snapshotRevision,
      snapshotRevisionState: snapshotRevisionMetadata.snapshotRevisionState,
      snapshotExpectedMinimumRevision:
        snapshotRevisionMetadata.snapshotExpectedMinimumRevision,
      snapshotRevisionGap: snapshotRevisionMetadata.snapshotRevisionGap,
      snapshotResumeToken: snapshotRevisionMetadata.snapshotResumeToken,
      observationMode: extractControlSnapshotObservationMode(snapshot),
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
          '; fallback lane ' +
          ADMIN_SOCKET_LANE_DEFAULT +
          ' failed: ' +
          String(fallbackError?.message || fallbackError),
      );
    }
  }
}

export const ASSERTIONS_CONTROL_SNAPSHOT_EXTRACTION = {
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
  CONTROL_SNAPSHOT_FIELD_OBSERVATION_MODE,
  CONTROL_SNAPSHOT_FIELD_ADMIN_OBSERVATION,
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
  CONTROL_SNAPSHOT_ADMIN_OBSERVATION_FIELD_MODE,
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
  extractControlSnapshotObservationMode,
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
};
