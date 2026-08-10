import {MOVE_REASON} from './rebalancer-constants.js';
import {
  classifyLedgerExpandForSpreadCureCondition,
  classifyLedgerSpreadSurplusDrainCureCondition,
  classifyPriorityExpandForSpreadCureCondition,
  classifyPriorityOverTargetSpreadCureCondition,
  classifyPrioritySpreadSurplusDrainCureCondition,
  isPrioritySpreadSatisfiedAtTarget,
  resolvePlacementCure,
} from './replica-placement-cure-policy.js';

// The over-creation cap's single canonical ADD outcome (decision-table rows,
// first classifier match wins; refuse-all is the fail-closed floor).
const OVER_TARGET_CAP_ADD_DECISION = Object.freeze({
  REFUSE_ALL_ADDS: 'refuse_all_adds',
  RETAIN_SPREAD_CURE_ADDS: 'retain_spread_cure_adds',
});

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

/**
 * Select the ADD moves the over-creation cap retains as the spread cure:
 * one per distinct node NOT already hosting the partition, capped at the
 * open distinct-node gap (PrioritySpreadCoverage: coverage counts distinct
 * eligible targets, and the numeric gap is consumed as data). Retained
 * moves are re-typed through the cure-typing owner's row.
 * @param {Object} options
 * @return {Array<Object>} the retained, re-typed spread-cure ADD moves.
 */
function selectSpreadCureAddMoves(options) {
  const {addMoves, cure, hostingNodeIds, spreadGapSize} = options;
  const retainedAddMoves = [];
  const claimedNodeIds = new Set();
  for (const move of addMoves) {
    const nodeId = move?.nodeId;
    const curesSpread =
      !!nodeId &&
      !hostingNodeIds.has(nodeId) &&
      !claimedNodeIds.has(nodeId) &&
      retainedAddMoves.length < spreadGapSize;
    if (curesSpread) {
      claimedNodeIds.add(nodeId);
      retainedAddMoves.push({
        ...move,
        type: cure.moveType,
        reason: cure.moveReason,
      });
    }
  }
  return retainedAddMoves;
}

/**
 * The over-creation cap's ADD retention decision (quest
 * over-target-cap-spread-cure-wipe). Emits ONE canonical outcome: when the
 * cure-typing owner classifies the over-target-with-open-spread-gap state,
 * exactly the distinct-node spread-cure ADDs survive (gap-capped, non-hosting
 * targets only, re-typed to the spread cure row); every other state refuses
 * every ADD — the pre-existing fail-closed floor, including already-spread
 * partitions, ledger partitions, and any in-flight REPLACE.
 * Mutates addMoves in place (house pattern of this module).
 * @param {Object} options
 * @return {{decision: string, retainedSpreadCureAddCount: number,
 *   refusedAddCount: number}}
 */
function applyOverTargetCapAddRetention(options = {}) {
  const {
    activePlacementReplicas,
    addMoves,
    inFlightReplaceCount,
    partitionId,
    surplusVoterCount,
    targetNodeIds,
    targetReplicaCount,
  } = options;
  const activeDistinctNodeCount =
    countDistinctReplicaNodes(activePlacementReplicas);
  const targetDistinctNodeCount = new Set(targetNodeIds).size;
  const requiredDistinctNodeCount = Math.min(
    targetReplicaCount,
    targetDistinctNodeCount,
  );
  const cureCondition = classifyPriorityOverTargetSpreadCureCondition({
    partitionId,
    voterReplicaCount: surplusVoterCount,
    activeDistinctNodeCount,
    targetReplicaCount,
    targetDistinctNodeCount,
    addMoveCount: addMoves.length,
    inFlightReplaceCount,
  });
  const retainedAddMoves = cureCondition === null ?
    [] :
    selectSpreadCureAddMoves({
      addMoves,
      cure: resolvePlacementCure(cureCondition),
      hostingNodeIds: new Set(
        activePlacementReplicas
          .map((replica) => replica?.node_id)
          .filter(Boolean),
      ),
      spreadGapSize: requiredDistinctNodeCount - activeDistinctNodeCount,
    });
  // Log honesty: the retain decision is reported only when a cure ADD
  // actually survived (the classifier can fire while every candidate ADD
  // targets an already-hosting node — that outcome IS refuse-all).
  const decision = retainedAddMoves.length > 0 ?
    OVER_TARGET_CAP_ADD_DECISION.RETAIN_SPREAD_CURE_ADDS :
    OVER_TARGET_CAP_ADD_DECISION.REFUSE_ALL_ADDS;
  const refusedAddCount = addMoves.length - retainedAddMoves.length;
  addMoves.length = 0;
  addMoves.push(...retainedAddMoves);
  return {
    decision,
    retainedSpreadCureAddCount: retainedAddMoves.length,
    refusedAddCount,
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
  // Spread-typed ADDs at this point are exactly the cap-retained cure moves;
  // the drain classifier yields to them while the floor is unmet. This
  // counts only the CURRENT plan's ADDs — an in-flight cure ADD reads as 0
  // here, which is safe because every consumer is a serial goal-state
  // partition that emits no new move while an operation is unresolved.
  const actionableSpreadCureAddCount = addMoves.filter(
    (move) => move.reason === MOVE_REASON.SPREAD_REPLICAS,
  ).length;
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
      activeDistinctNodeCount,
      targetReplicaCount,
      targetDistinctNodeCount,
      monotonicSafeRemoveCount: monotonicSafeRemove ? 1 : 0,
      actionableSpreadCureAddCount,
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
    classifyPriorityExpandForSpreadCureCondition(sharedEvidence) ||
    // Over-target row: a cap-retained spread-cure ADD must stay a serial
    // standalone ADD (no REPLACE handoff, no same-batch surplus REMOVE) —
    // the same expand-before-drain design the at-target row encodes.
    classifyPriorityOverTargetSpreadCureCondition(sharedEvidence);
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
  applyOverTargetCapAddRetention,
  applyPrioritySpreadDrainCure,
  applyPrioritySpreadExpandCure,
  evaluatePriorityStandaloneRemoveSafety,
};
