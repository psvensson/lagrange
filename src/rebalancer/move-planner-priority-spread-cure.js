import {
  classifyLedgerExpandForSpreadCureCondition,
  classifyLedgerSpreadSurplusDrainCureCondition,
  classifyPriorityExpandForSpreadCureCondition,
  classifyPrioritySpreadSurplusDrainCureCondition,
  isPrioritySpreadSatisfiedAtTarget,
  resolvePlacementCure,
} from './replica-placement-cure-policy.js';

function countDistinctReplicaNodes(replicas) {
  return new Set(
    replicas
      .map((replica) => replica?.node_id)
      .filter(Boolean),
  ).size;
}

function evaluatePriorityStandaloneRemoveSafety(options = {}) {
  if (options.priorityPartition !== true) {
    return {
      priorityPartition: false,
      safe: true,
      spread: null,
    };
  }
  const remainingActiveReplicas = options.activePlacementReplicas.filter(
    (candidate) =>
      (candidate?.replica_id || candidate?.service_id) !== options.replicaId,
  );
  const spread = options.analyzePrioritySpread(
    remainingActiveReplicas,
    options.prioritySpreadPolicy,
    options.availableNodes,
  );
  return {
    priorityPartition: true,
    safe: !(spread.requiresSpread === true && spread.satisfied !== true),
    monotonicSafe:
      remainingActiveReplicas.length >= options.targetReplicaCount &&
      countDistinctReplicaNodes(remainingActiveReplicas) >=
        countDistinctReplicaNodes(options.activePlacementReplicas),
    spread,
  };
}

function applyPrioritySpreadDrainCure(options = {}) {
  const {
    activePlacementReplicas,
    addMoves,
    candidateRemoves,
    inventory,
    partitionId,
    surplusVoterCount,
    targetNodeIds,
    targetReplicaCount,
  } = options;
  const activeDistinctNodeCount =
    countDistinctReplicaNodes(activePlacementReplicas);
  const targetDistinctNodeCount = new Set(targetNodeIds).size;
  if (isPrioritySpreadSatisfiedAtTarget({
    partitionId,
    occupiedReplicaCount: inventory.accounting.occupiedCount,
    voterReplicaCount: surplusVoterCount,
    activeReplicaCount: activePlacementReplicas.length,
    activeDistinctNodeCount,
    targetReplicaCount,
    targetDistinctNodeCount,
  })) {
    addMoves.length = 0;
    candidateRemoves.length = 0;
    return;
  }
  const standaloneSafeRemove = candidateRemoves.find(
    (move) =>
      move.standaloneSafe === true &&
      move.prioritySpreadStandaloneSafe !== false,
  );
  const monotonicSafeRemove = candidateRemoves.find(
    (move) =>
      move.standaloneSafe === true &&
      move.prioritySpreadMonotonicSafe === true,
  );
  const spreadDrainCureCondition =
    classifyLedgerSpreadSurplusDrainCureCondition({
      partitionId,
      occupiedReplicaCount: inventory.accounting.occupiedCount,
      voterReplicaCount: surplusVoterCount,
      activeReplicaCount: activePlacementReplicas.length,
      activeDistinctNodeCount,
      targetReplicaCount,
      targetDistinctNodeCount,
      standaloneSafeRemoveCount: standaloneSafeRemove ? 1 : 0,
    }) ||
    classifyPrioritySpreadSurplusDrainCureCondition({
      partitionId,
      occupiedReplicaCount: inventory.accounting.occupiedCount,
      voterReplicaCount: surplusVoterCount,
      activeReplicaCount: activePlacementReplicas.length,
      targetReplicaCount,
      monotonicSafeRemoveCount: monotonicSafeRemove ? 1 : 0,
    });
  if (spreadDrainCureCondition === null) {
    return;
  }
  const drainCure = resolvePlacementCure(spreadDrainCureCondition);
  const drainRemove = standaloneSafeRemove || monotonicSafeRemove;
  addMoves.length = 0;
  candidateRemoves.length = 0;
  candidateRemoves.push({
    ...drainRemove,
    type: drainCure.moveType,
    reason: drainCure.moveReason,
  });
}

function applyPrioritySpreadExpandCure(options = {}) {
  const {
    activePlacementReplicas,
    addMoves,
    candidateRemoves,
    deficitEffectiveCount,
    inFlightReplaceCount,
    inventory,
    naturalReplaceCount,
    partitionId,
    surplusVoterCount,
    targetNodeIds,
    targetReplicaCount,
  } = options;
  const replaceCount = options.replaceCount;
  const targetDistinctNodeCount = new Set(targetNodeIds).size;
  const activeDistinctNodeCount =
    countDistinctReplicaNodes(activePlacementReplicas);
  const sharedEvidence = {
    partitionId,
    inFlightReplaceCount,
    naturalReplaceCount,
    addMoveCount: addMoves.length,
    occupiedReplicaCount: inventory.accounting.occupiedCount,
    deficitEffectiveCount,
    voterReplicaCount: surplusVoterCount,
    activeReplicaCount: activePlacementReplicas.length,
    targetReplicaCount,
    targetDistinctNodeCount,
    activeDistinctNodeCount,
  };
  const spreadExpandCureCondition =
    classifyLedgerExpandForSpreadCureCondition({
      ...sharedEvidence,
      replaceCount,
    }) ||
    classifyPriorityExpandForSpreadCureCondition(sharedEvidence);
  if (spreadExpandCureCondition === null) {
    return replaceCount;
  }
  const expandCure = resolvePlacementCure(spreadExpandCureCondition);
  addMoves[0] = {
    ...addMoves[0],
    type: expandCure.moveType,
    reason: expandCure.moveReason,
  };
  // Physical spread must settle before its surplus source can drain. A
  // NODE_NOT_IN_TARGET source must not escape as a same-batch REMOVE.
  candidateRemoves.length = 0;
  return 0;
}

export {
  applyPrioritySpreadDrainCure,
  applyPrioritySpreadExpandCure,
  evaluatePriorityStandaloneRemoveSafety,
};
