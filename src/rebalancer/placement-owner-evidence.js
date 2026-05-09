import {COLUMN, NUM, TYPEOF} from '../constants/index.js';
import {
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_REINTERPRETATION,
  PLACEMENT_OWNER_SCORE_PROFILE,
  TOPOLOGY_CONTROL_PLANE_OWNER,
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
  return Number.isFinite(numericValue) && numericValue > NUM.ZERO ?
    Math.floor(numericValue) :
    NUM.ZERO;
}

function normalizeNonNegativeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > NUM.ZERO ?
    numericValue :
    NUM.ZERO;
}

function normalizeTransitionNodeSet(transitionSnapshot, fieldName) {
  const candidate = transitionSnapshot?.[fieldName];
  if (candidate instanceof Set) {
    return new Set(
      Array.from(candidate)
        .map(normalizeNodeId)
        .filter((nodeId) => nodeId.length > NUM.ZERO),
    );
  }
  if (Array.isArray(candidate)) {
    return new Set(
      candidate
        .map(normalizeNodeId)
        .filter((nodeId) => nodeId.length > NUM.ZERO),
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
      if (nodeId.length === NUM.ZERO) {
        return Object.freeze({
          node,
          nodeId,
          valid: false,
          ordinal: index,
          cpuUsagePercent: NUM.ZERO,
          memoryUsagePercent: NUM.ZERO,
          diskUsagePercent: NUM.ZERO,
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
        valid: nodeId.length > NUM.ZERO,
      });
    });
}

function normalizeCapacityDiagnostics(capacityDiagnostics, fallbackCount) {
  const diagnostics =
    capacityDiagnostics && typeof capacityDiagnostics === TYPEOF.OBJECT ?
      capacityDiagnostics :
      {};
  const rejectionsByReason =
    diagnostics[PLACEMENT_OWNER_DIAGNOSTIC_FIELD.REJECTIONS_BY_REASON] &&
      typeof diagnostics[
        PLACEMENT_OWNER_DIAGNOSTIC_FIELD.REJECTIONS_BY_REASON
      ] === TYPEOF.OBJECT ?
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
      ] === TYPEOF.OBJECT ?
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
  });
}

function buildLatencyGroupContext(candidateNodes, currentReplicas) {
  const nodeGroupById = new Map();
  for (const candidate of candidateNodes) {
    if (candidate.valid !== true || candidate.latencyGroupId.length === NUM.ZERO) {
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
    if (groupId.length === NUM.ZERO) {
      continue;
    }
    existingGroupCounts.set(
      groupId,
      (existingGroupCounts.get(groupId) || NUM.ZERO) + NUM.ONE,
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
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
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
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

export {
  normalizePlacementOwnerEvidence,
};
