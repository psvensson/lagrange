import {COLUMN} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  PLACEMENT_OWNER,
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_REINTERPRETATION,
  PLACEMENT_OWNER_SCORE_PROFILE,
} from './placement-owner-constants.js';

const PLACEMENT_OWNER_EMPTY_STRING = '';
const PLACEMENT_OWNER_TRANSITION_FIELD = Object.freeze({
  ENTITY_ADD: 'nodesWithEntityAddTransitional',
  GLOBAL_SYSTEM_ADD: 'nodesWithGlobalSystemAddTransitional',
});
const PLACEMENT_OWNER_POLICY_FIELD = Object.freeze({
  PLACEMENT_CONSTRAINTS: 'placementConstraints',
  CONSIDER_CPU_LOAD: 'considerCpuLoad',
  CONSIDER_MEMORY_LOAD: 'considerMemoryLoad',
  CONSIDER_DISK_SPACE: 'considerDiskSpace',
  PREFER_SAME_LATENCY_GROUP: 'preferSameLatencyGroup',
  PREFER_LATENCY_GROUP_DIVERSITY: 'preferLatencyGroupDiversity',
  PREFER_DATA_AFFINITY: 'preferDataAffinity',
  DATA_AFFINITY: 'dataAffinity',
  DATA_AFFINITY_GROUP_WEIGHTS: 'groupWeights',
});
const PLACEMENT_OWNER_DIAGNOSTIC_FIELD = Object.freeze({
  TOTAL_CANDIDATES: 'totalCandidates',
  FEASIBLE_COUNT: 'feasibleCount',
  REJECTED_COUNT: 'rejectedCount',
  REJECTIONS_BY_REASON: 'rejectionsByReason',
  CAPACITY_FILTER_APPLIED: 'capacityFilterApplied',
});

function normalizeNodeId(value) {
  return String(value || PLACEMENT_OWNER_EMPTY_STRING).trim();
}

function normalizePositiveInteger(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ?
    Math.floor(numericValue) :
    0;
}

function normalizeNonNegativeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ?
    numericValue :
    0;
}

function normalizeTransitionNodeSet(transitionSnapshot, fieldName) {
  const candidate = transitionSnapshot?.[fieldName];
  if (candidate instanceof Set) {
    return new Set(
      Array.from(candidate)
        .map(normalizeNodeId)
        .filter((nodeId) => nodeId.length > 0),
    );
  }
  if (Array.isArray(candidate)) {
    return new Set(
      candidate
        .map(normalizeNodeId)
        .filter((nodeId) => nodeId.length > 0),
    );
  }
  return new Set();
}

function normalizeCandidateNodes(nodes) {
  if (!Array.isArray(nodes)) {
    return [];
  }
  return nodes
    .map((node, index) => {
      const nodeId = normalizeNodeId(node?.[COLUMN.NODE_ID]);
      if (nodeId.length === 0) {
        return Object.freeze({
          node,
          nodeId,
          valid: false,
          ordinal: index,
          cpuUsagePercent: 0,
          memoryUsagePercent: 0,
          diskUsagePercent: 0,
          latencyGroupId: PLACEMENT_OWNER_EMPTY_STRING,
        });
      }
      return Object.freeze({
        node,
        nodeId,
        valid: true,
        ordinal: index,
        cpuUsagePercent: normalizeNonNegativeNumber(
          node?.[COLUMN.CPU_USAGE_PERCENT],
        ),
        memoryUsagePercent: normalizeNonNegativeNumber(
          node?.[COLUMN.MEMORY_USAGE_PERCENT],
        ),
        diskUsagePercent: normalizeNonNegativeNumber(
          node?.[COLUMN.DISK_USAGE_PERCENT],
        ),
        latencyGroupId: normalizeNodeId(node?.[COLUMN.LATENCY_GROUP_ID]),
      });
    });
}

function normalizeRaftRole(value) {
  return typeof value === 'string' ?
    value.trim().toLowerCase() :
    PLACEMENT_OWNER_EMPTY_STRING;
}

function normalizeCurrentReplicas(currentReplicas) {
  if (!Array.isArray(currentReplicas)) {
    return [];
  }
  return currentReplicas
    .map((replica) => {
      const nodeId = normalizeNodeId(replica?.[COLUMN.NODE_ID]);
      return Object.freeze({
        replica,
        nodeId,
        raftRole: normalizeRaftRole(replica?.[COLUMN.RAFT_ROLE]),
        valid: nodeId.length > 0,
      });
    });
}

// CL-038 churn-root lever: when a partition is OVER target (a surplus drain),
// resolve the node that currently hosts the raft leader so the placement owner
// can RETAIN it instead of draining it. Draining the leader's replica forces a
// re-election, and every re-election resets the topology-quiescence quiet window
// — the demonstrated reason a 5-node rolling restart cannot settle within the
// wall budget. Returns '' unless there is a genuine surplus to drain
// (valid replica count > targetCount), so at/under-target placement is unchanged.
// Feasibility is enforced downstream: the reservation only retains a node that
// survived the capacity filter, so an unhealthy/over-capacity leader still drains.
function resolveLeaderRetentionNodeId(currentReplicas, targetCount) {
  const validReplicas = currentReplicas.filter((replica) => replica.valid);
  if (validReplicas.length <= targetCount) {
    return PLACEMENT_OWNER_EMPTY_STRING;
  }
  const leaderReplica = validReplicas.find(
    (replica) => replica.raftRole === RAFT_ROLE.LEADER,
  );
  return leaderReplica ? leaderReplica.nodeId : PLACEMENT_OWNER_EMPTY_STRING;
}

// C-2 incumbency-stickiness lever (Head A of convergence-timeout-leadership-settle):
// the leadership_unstable rolling-restart blocker is raft leader-map churn driven
// by load-only placement re-selecting freshly-returned low-load nodes into a
// control-plane-priority partition's cohort, displacing healthy incumbents. The
// resulting 3->5 over-replication raises the raft majority while fresh followers
// can't heartbeat, provoking a re-election that resets the 15s quiescence window.
// When the caller opts in (flag-gated + control-plane-priority partition only),
// reserve the CURRENT valid incumbent nodes so they are retained in the target
// cohort ahead of marginally-lower-load returned candidates. Feasibility is
// enforced downstream exactly like leader retention: the reservation only ever
// keeps a node that survived the capacity/score filter (is in rankedNodeIds), so a
// GONE/infeasible incumbent is never floored back in and still gets replaced — the
// lever suppresses load-churn migration, never genuine recovery.
function resolveIncumbentRetentionNodeIds(currentReplicas, retainHealthyIncumbents) {
  if (retainHealthyIncumbents !== true) {
    return [];
  }
  const seen = new Set();
  const nodeIds = [];
  for (const replica of currentReplicas) {
    if (replica.valid !== true || seen.has(replica.nodeId)) {
      continue;
    }
    seen.add(replica.nodeId);
    nodeIds.push(replica.nodeId);
  }
  return nodeIds;
}

function normalizeCapacityDiagnostics(capacityDiagnostics, fallbackCount) {
  const diagnostics =
    capacityDiagnostics && typeof capacityDiagnostics === 'object' ?
      capacityDiagnostics :
      {};
  const rejectionsByReason =
    diagnostics[PLACEMENT_OWNER_DIAGNOSTIC_FIELD.REJECTIONS_BY_REASON] &&
      typeof diagnostics[
        PLACEMENT_OWNER_DIAGNOSTIC_FIELD.REJECTIONS_BY_REASON
      ] === 'object' ?
      {
        ...diagnostics[
          PLACEMENT_OWNER_DIAGNOSTIC_FIELD.REJECTIONS_BY_REASON
        ],
      } :
      {};
  return Object.freeze({
    totalCandidates: normalizePositiveInteger(
      diagnostics[PLACEMENT_OWNER_DIAGNOSTIC_FIELD.TOTAL_CANDIDATES] ||
        fallbackCount,
    ),
    feasibleCount: normalizePositiveInteger(
      diagnostics[PLACEMENT_OWNER_DIAGNOSTIC_FIELD.FEASIBLE_COUNT] ||
        fallbackCount,
    ),
    rejectedCount: normalizePositiveInteger(
      diagnostics[PLACEMENT_OWNER_DIAGNOSTIC_FIELD.REJECTED_COUNT],
    ),
    rejectionsByReason: Object.freeze(rejectionsByReason),
    capacityFilterApplied:
      diagnostics[
        PLACEMENT_OWNER_DIAGNOSTIC_FIELD.CAPACITY_FILTER_APPLIED
      ] === true,
  });
}

function normalizePlacementConstraints(policy) {
  const constraints =
    policy?.[PLACEMENT_OWNER_POLICY_FIELD.PLACEMENT_CONSTRAINTS] &&
      typeof policy[
        PLACEMENT_OWNER_POLICY_FIELD.PLACEMENT_CONSTRAINTS
      ] === 'object' ?
      policy[PLACEMENT_OWNER_POLICY_FIELD.PLACEMENT_CONSTRAINTS] :
      {};
  return Object.freeze({
    considerCpuLoad:
      constraints[PLACEMENT_OWNER_POLICY_FIELD.CONSIDER_CPU_LOAD] === true,
    considerMemoryLoad:
      constraints[PLACEMENT_OWNER_POLICY_FIELD.CONSIDER_MEMORY_LOAD] === true,
    considerDiskSpace:
      constraints[PLACEMENT_OWNER_POLICY_FIELD.CONSIDER_DISK_SPACE] === true,
    preferSameLatencyGroup:
      constraints[
        PLACEMENT_OWNER_POLICY_FIELD.PREFER_SAME_LATENCY_GROUP
      ] === true,
    preferLatencyGroupDiversity:
      constraints[
        PLACEMENT_OWNER_POLICY_FIELD.PREFER_LATENCY_GROUP_DIVERSITY
      ] === true,
    preferDataAffinity:
      constraints[
        PLACEMENT_OWNER_POLICY_FIELD.PREFER_DATA_AFFINITY
      ] === true,
  });
}

// Accessed-data affinity evidence: the policy carries per-latency-group
// weights in (0..1] describing where the entity's accessed data lives
// (the A[s][p] · data-replica-location join, computed by the policy
// owner; synthetic in Tier-1b tests). Invalid and zero-weight entries
// are dropped, not defaulted — an empty map means "no affinity
// evidence", so a map of only zeros carries none and must not engage
// the dimension family (incumbent retention included).
function buildDataAffinityContext(policy) {
  const affinity =
    policy?.[PLACEMENT_OWNER_POLICY_FIELD.DATA_AFFINITY] &&
      typeof policy[PLACEMENT_OWNER_POLICY_FIELD.DATA_AFFINITY] === 'object' ?
      policy[PLACEMENT_OWNER_POLICY_FIELD.DATA_AFFINITY] :
      {};
  const rawCandidate =
    affinity[PLACEMENT_OWNER_POLICY_FIELD.DATA_AFFINITY_GROUP_WEIGHTS];
  const rawWeights =
    rawCandidate &&
      typeof rawCandidate === 'object' &&
      !Array.isArray(rawCandidate) ?
      rawCandidate :
      {};
  const groupWeights = new Map();
  for (const [groupId, weight] of Object.entries(rawWeights)) {
    if (groupId.length === 0 || !Number.isFinite(weight) || weight <= 0) {
      continue;
    }
    groupWeights.set(groupId, Math.min(weight, 1));
  }
  return Object.freeze({groupWeights});
}

function buildLatencyGroupContext(candidateNodes, currentReplicas) {
  const nodeGroupById = new Map();
  for (const candidate of candidateNodes) {
    if (candidate.valid !== true || candidate.latencyGroupId.length === 0) {
      continue;
    }
    nodeGroupById.set(candidate.nodeId, candidate.latencyGroupId);
  }
  const existingGroupCounts = new Map();
  for (const replica of currentReplicas) {
    if (replica.valid !== true) {
      continue;
    }
    const groupId =
      nodeGroupById.get(replica.nodeId) || PLACEMENT_OWNER_EMPTY_STRING;
    if (groupId.length === 0) {
      continue;
    }
    existingGroupCounts.set(
      groupId,
      (existingGroupCounts.get(groupId) || 0) + 1,
    );
  }
  return Object.freeze({
    nodeGroupById,
    existingGroupCounts,
  });
}

function normalizePlacementOwnerEvidence(options = {}) {
  const candidateNodes = normalizeCandidateNodes(options.candidateNodes);
  const currentReplicas = normalizeCurrentReplicas(options.currentReplicas);
  const capacityDiagnostics = normalizeCapacityDiagnostics(
    options.capacityDiagnostics,
    candidateNodes.length,
  );
  const includeGlobalSystemDeferral =
    options.includeGlobalSystemDeferral === true;
  const placementPolicy =
    options.placementPolicy || PLACEMENT_OWNER_POLICY.PARTITION_SPREAD;
  const scoreProfile =
    options.scoreProfile || PLACEMENT_OWNER_SCORE_PROFILE.SUITABILITY;
  return Object.freeze({
    owner: PLACEMENT_OWNER,
    candidateNodes: Object.freeze(candidateNodes),
    currentReplicas: Object.freeze(currentReplicas),
    policy: options.policy || Object.freeze({}),
    placementPolicy,
    scoreProfile,
    placementConstraints: normalizePlacementConstraints(options.policy),
    targetCount: normalizePositiveInteger(options.targetCount),
    transitionReservations: normalizeTransitionNodeSet(
      options.transitionSnapshot,
      PLACEMENT_OWNER_TRANSITION_FIELD.ENTITY_ADD,
    ),
    transitionDeferrals: includeGlobalSystemDeferral ?
      normalizeTransitionNodeSet(
        options.transitionSnapshot,
        PLACEMENT_OWNER_TRANSITION_FIELD.GLOBAL_SYSTEM_ADD,
      ) :
      new Set(),
    capacityDiagnostics,
    latencyGroupContext: buildLatencyGroupContext(
      candidateNodes,
      currentReplicas,
    ),
    dataAffinityContext: buildDataAffinityContext(options.policy),
    leaderRetentionNodeId: resolveLeaderRetentionNodeId(
      currentReplicas,
      normalizePositiveInteger(options.targetCount),
    ),
    incumbentRetentionNodeIds: Object.freeze(
      resolveIncumbentRetentionNodeIds(
        currentReplicas,
        options.retainHealthyIncumbents === true,
      ),
    ),
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

export {
  normalizePlacementOwnerEvidence,
};
