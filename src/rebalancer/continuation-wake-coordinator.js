import {NUM} from '../constants/index.js';
import {
  countDistinctActiveHostsFromReplicas,
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

function selectSlotWakeWinnerIndex(contenders, targetNodeId) {
  let bestIndex = -NUM.ONE;
  let bestTier = CONTENDER_RANK_TIER.INELIGIBLE;
  for (let index = NUM.ZERO; index < contenders.length; index += NUM.ONE) {
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
  registerArmedSlotContender,
  resolveRebalancerDispatchHost,
  selectSlotWakeWinnerIndex,
  shouldYieldSlotWakeToNodesPartition,
  unregisterArmedSlotContender,
};
