import {NUM} from '../constants/index.js';
import {
  countDistinctActiveHostsFromReplicas,
  doesOperationTransitionReleaseSystemTargetNodeSlot,
  evaluateSystemPartitionTargetNodeSlotAdmission,
  isNodesPartitionPresentAndUnderSpread,
} from './system-spread-transition-policy.js';

const CONTENDER_RANK_TIER = Object.freeze({
  FORMATION_DEPENDENCY: NUM.ZERO,
  TWO_HOST_DEPTH_FIRST: NUM.ONE,
  UNDER_SPREAD_MOVE_ONE: NUM.TWO,
  OTHER_ELIGIBLE: NUM.THREE,
  INELIGIBLE: NUM.FOUR,
});

function resolveRebalancerDispatchHost(rebalancer) {
  if (rebalancer?.rebalanceCoordinator) {
    return rebalancer.rebalanceCoordinator;
  }
  if (rebalancer?.systemTableCache) {
    return rebalancer.systemTableCache;
  }
  return null;
}

function registerArmedSlotContender(rebalancer, state) {
  const host = resolveRebalancerDispatchHost(rebalancer);
  if (!host) {
    return;
  }
  if (!(host._armedContinuationWakeRebalancers instanceof Set)) {
    host._armedContinuationWakeRebalancers = new Set();
  }
  if (state.awaitingBudgetSlotRelease === true) {
    host._armedContinuationWakeRebalancers.add(rebalancer);
  } else {
    host._armedContinuationWakeRebalancers.delete(rebalancer);
  }
}

function unregisterArmedSlotContender(rebalancer) {
  const host = resolveRebalancerDispatchHost(rebalancer);
  if (host?._armedContinuationWakeRebalancers instanceof Set) {
    host._armedContinuationWakeRebalancers.delete(rebalancer);
  }
}

function rebalancerAlreadyHostsNode(rebalancer, targetNodeId) {
  if (!targetNodeId || !rebalancer.getCurrentReplicas) {
    return false;
  }
  const replicas = rebalancer.getCurrentReplicas();
  if (!Array.isArray(replicas)) {
    return false;
  }
  return replicas.some((replica) => replica && replica.node_id === targetNodeId);
}

function isUnderSpreadFormationCandidate(candidate) {
  if (!candidate) {
    return false;
  }
  return (
    candidate.isFormationLivenessDependencyPartition?.() === true &&
    candidate.isPartitionBelowDeclaredDistinctHostSpread?.() === true
  );
}

function hasArmedUnderSpreadNodesContender(rebalancer, contenders = []) {
  for (const entry of contenders) {
    if (isUnderSpreadFormationCandidate(entry?.rebalancer)) {
      return true;
    }
  }
  const host = resolveRebalancerDispatchHost(rebalancer);
  if (!(host?._armedContinuationWakeRebalancers instanceof Set)) {
    return false;
  }
  for (const candidate of host._armedContinuationWakeRebalancers) {
    if (
      candidate.isLeader === true &&
      !candidate.isShuttingDown &&
      isUnderSpreadFormationCandidate(candidate)
    ) {
      return true;
    }
  }
  return false;
}

function shouldYieldSlotWakeToNodesPartition(rebalancer, contenders = []) {
  if (rebalancer.isFormationLivenessDependencyPartition?.() === true) {
    return false;
  }
  if (
    isNodesPartitionPresentAndUnderSpread(
      rebalancer.systemTableCache,
      rebalancer.getAvailableNodes?.(),
      rebalancer.controlPlaneReadinessService || null,
    )
  ) {
    return true;
  }
  return hasArmedUnderSpreadNodesContender(rebalancer, contenders);
}

function classifySlotContender(entry, targetNodeId) {
  const {rebalancer, state} = entry;
  const needsBudgetImmediate = state.awaitingBudgetExhausted === true;
  const eligible =
    needsBudgetImmediate || !rebalancerAlreadyHostsNode(rebalancer, targetNodeId);
  if (!eligible) {
    return {eligible: false, tier: CONTENDER_RANK_TIER.INELIGIBLE};
  }
  if (rebalancer.isFormationLivenessDependencyPartition?.() === true) {
    return {eligible: true, tier: CONTENDER_RANK_TIER.FORMATION_DEPENDENCY};
  }
  const distinctHosts = countDistinctActiveHostsFromReplicas(
    rebalancer.getCurrentReplicas?.(),
  );
  if (distinctHosts === NUM.TWO) {
    return {eligible: true, tier: CONTENDER_RANK_TIER.TWO_HOST_DEPTH_FIRST};
  }
  if (distinctHosts === NUM.ONE) {
    return {eligible: true, tier: CONTENDER_RANK_TIER.UNDER_SPREAD_MOVE_ONE};
  }
  return {eligible: true, tier: CONTENDER_RANK_TIER.OTHER_ELIGIBLE};
}

function selectSlotWakeWinnerIndex(
  contenders,
  targetNodeId,
  excludedIndices = null,
) {
  let bestIndex = -NUM.ONE;
  let bestTier = CONTENDER_RANK_TIER.INELIGIBLE;
  for (let index = NUM.ZERO; index < contenders.length; index += NUM.ONE) {
    if (excludedIndices?.has(index)) {
      continue;
    }
    const classification = classifySlotContender(
      contenders[index],
      targetNodeId,
    );
    if (classification.eligible && classification.tier < bestTier) {
      bestTier = classification.tier;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function collectCandidatePhaseBTargetNodeIds(
  contenders,
  primaryTargetNodeId,
  availableNodes,
) {
  const orderedNodeIds = [];
  const seenNodeIds = new Set();
  const pushCandidate = (nodeId) => {
    if (!nodeId || seenNodeIds.has(nodeId)) {
      return;
    }
    const neededByContender = contenders.some(
      (entry) => !rebalancerAlreadyHostsNode(entry.rebalancer, nodeId),
    );
    if (!neededByContender) {
      return;
    }
    seenNodeIds.add(nodeId);
    orderedNodeIds.push(nodeId);
  };
  pushCandidate(primaryTargetNodeId);
  for (const node of availableNodes) {
    pushCandidate(node?.node_id || null);
  }
  return orderedNodeIds;
}

function countOpenPhaseBSlotsForTarget(
  sampleRebalancer,
  availableNodes,
  targetNodeId,
  completedOperationId,
) {
  const admission = evaluateSystemPartitionTargetNodeSlotAdmission({
    systemTableCache: sampleRebalancer.systemTableCache,
    controlPlaneReadinessService:
      sampleRebalancer.controlPlaneReadinessService || null,
    partitionId: sampleRebalancer.entityId,
    targetNodeId,
    operations:
      sampleRebalancer.getGlobalTopologyBlockingInFlightOperations?.() || [],
    currentReplicas: sampleRebalancer.getCurrentReplicas?.(),
    resolveAvailableNodes: () => availableNodes,
  });
  if (admission.usePhaseBCapacity !== true) {
    return -NUM.ONE;
  }
  const effectiveOccupied =
    completedOperationId &&
    admission.occupyingOperationIds.includes(completedOperationId) ?
      Math.max(NUM.ZERO, admission.occupiedCount - NUM.ONE) :
      admission.occupiedCount;
  return Math.max(NUM.ZERO, admission.maxPerTargetNode - effectiveOccupied);
}

function interleaveTargetSlotSchedule(openSlotsByNode) {
  const schedule = [];
  let remaining = true;
  let round = NUM.ZERO;
  while (remaining) {
    remaining = false;
    for (const entry of openSlotsByNode) {
      if (round < entry.openSlots) {
        schedule.push(entry.nodeId);
        if (round + NUM.ONE < entry.openSlots) {
          remaining = true;
        }
      }
    }
    round += NUM.ONE;
  }
  return schedule;
}

function collectOpenSlotsByCandidateNode(
  sampleRebalancer,
  availableNodes,
  candidateNodeIds,
  completedOperationId,
) {
  const openSlotsByNode = [];
  for (const nodeId of candidateNodeIds) {
    const openSlots = countOpenPhaseBSlotsForTarget(
      sampleRebalancer,
      availableNodes,
      nodeId,
      completedOperationId,
    );
    if (openSlots < NUM.ZERO) {
      return {phaseBActive: false, openSlotsByNode: []};
    }
    if (openSlots > NUM.ZERO) {
      openSlotsByNode.push({nodeId, openSlots});
    }
  }
  return {phaseBActive: true, openSlotsByNode};
}

function resolveSlotWakeTargetSchedule(
  contenders,
  primaryTargetNodeId,
  completedOperationId,
) {
  const sampleRebalancer = contenders[NUM.ZERO]?.rebalancer;
  const availableNodes = sampleRebalancer?.getAvailableNodes?.();
  if (
    !sampleRebalancer?.systemTableCache ||
    !Array.isArray(availableNodes) ||
    availableNodes.length === NUM.ZERO
  ) {
    return [primaryTargetNodeId];
  }
  const candidateNodeIds = collectCandidatePhaseBTargetNodeIds(
    contenders,
    primaryTargetNodeId,
    availableNodes,
  );
  const {phaseBActive, openSlotsByNode} = collectOpenSlotsByCandidateNode(
    sampleRebalancer,
    availableNodes,
    candidateNodeIds,
    completedOperationId,
  );
  if (!phaseBActive) {
    return [primaryTargetNodeId];
  }
  const schedule = interleaveTargetSlotSchedule(openSlotsByNode);
  return schedule.length > NUM.ZERO ? schedule : [primaryTargetNodeId];
}

function selectSlotWakeWinners(
  contenders,
  primaryTargetNodeId,
  completedOperationId = null,
) {
  const schedule = resolveSlotWakeTargetSchedule(
    contenders,
    primaryTargetNodeId,
    completedOperationId,
  );
  const winnersByIndex = new Map();
  const excludedIndices = new Set();
  for (const slotTargetNodeId of schedule) {
    const winnerIndex = selectSlotWakeWinnerIndex(
      contenders,
      slotTargetNodeId,
      excludedIndices,
    );
    if (winnerIndex >= NUM.ZERO) {
      excludedIndices.add(winnerIndex);
      winnersByIndex.set(winnerIndex, slotTargetNodeId);
    }
  }
  return winnersByIndex;
}

function isEligibleSlotHandoffCandidate(candidate, sourceRebalancer) {
  if (!candidate || candidate === sourceRebalancer) {
    return false;
  }
  const state = candidate.operationContinuationWakeState;
  if (
    !state ||
    state.awaitingBudgetSlotRelease !== true ||
    state.pendingOwnMatch === true ||
    candidate.isLeader !== true ||
    candidate.isShuttingDown
  ) {
    return false;
  }
  if (candidate.getCriticalSystemTrafficReadinessBlocker?.()) {
    return false;
  }
  return !shouldYieldSlotWakeToNodesPartition(candidate);
}

function collectSlotHandoffEntries(host, sourceRebalancer) {
  if (!(host?._armedContinuationWakeRebalancers instanceof Set)) {
    return [];
  }
  const entries = [];
  for (const candidate of host._armedContinuationWakeRebalancers) {
    if (isEligibleSlotHandoffCandidate(candidate, sourceRebalancer)) {
      entries.push({
        rebalancer: candidate,
        state: candidate.operationContinuationWakeState,
      });
    }
  }
  return entries;
}

export {
  collectSlotHandoffEntries,
  doesOperationTransitionReleaseSystemTargetNodeSlot,
  registerArmedSlotContender,
  resolveRebalancerDispatchHost,
  selectSlotWakeWinnerIndex,
  selectSlotWakeWinners,
  shouldYieldSlotWakeToNodesPartition,
  unregisterArmedSlotContender,
};
