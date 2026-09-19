import {MOVE_REASON} from './rebalancer-constants.js';
import {
  authorizeSpreadCureTransition,
  classifyLedgerExpandForSpreadCureCondition,
  classifyLedgerSpreadSurplusDrainCureCondition,
  classifyPriorityExpandForSpreadCureCondition,
  classifyPriorityOverTargetSpreadCureCondition,
  classifyPrioritySpreadSurplusDrainCureCondition,
  isPrioritySpreadSatisfiedAtTarget,
  resolvePlacementCure,
} from './replica-placement-cure-policy.js';
import {
  SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD,
} from './spread-cure-transition-authorization.js';

// The over-creation cap's single canonical ADD outcome (decision-table rows,
// first classifier match wins; refuse-all is the fail-closed floor).
const OVER_TARGET_CAP_ADD_DECISION = Object.freeze({
  REFUSE_ALL_ADDS: 'refuse_all_adds',
  RETAIN_SPREAD_CURE_ADDS: 'retain_spread_cure_adds',
});

// The cure policy owner mints; this module only carries. A move the owner did
// not authorize gains NO field at all, so an absent authorization stays
// absent on the coordinator request and on the row.
function withSpreadCureTransitionAuthorization(move, authorization) {
  return authorization === null || authorization === undefined ?
    move :
    {...move, [SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD]: authorization};
}

// The mint inputs this module carries from the planner to the policy owner:
// a RESOLVER for the partition's own policy row, and the membership
// publication epoch the planning cycle observed. Never the planner's own
// target derivation, and never the row itself: the policy owner calls the
// resolver only after its own condition has held, so a plan that mints
// nothing reads nothing.
function mintSpreadCureTransitionAuthorization(evidence, options, nodeId) {
  return authorizeSpreadCureTransition(evidence, {
    destinationNodeId: nodeId,
    resolvePartitionRow: options.resolvePartitionRow,
    observedMembershipEpoch: options.observedMembershipEpoch,
  });
}

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
      retainedAddMoves.push(withSpreadCureTransitionAuthorization({
        ...move,
        type: cure.moveType,
        reason: cure.moveReason,
      }, mintSpreadCureTransitionAuthorization(
        options.cureEvidence, options, nodeId)));
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
  const cureEvidence = {
    partitionId,
    voterReplicaCount: surplusVoterCount,
    activeDistinctNodeCount,
    targetReplicaCount,
    targetDistinctNodeCount,
    addMoveCount: addMoves.length,
    inFlightReplaceCount,
  };
  const cureCondition =
    classifyPriorityOverTargetSpreadCureCondition(cureEvidence);
  const retainedAddMoves = cureCondition === null ?
    [] :
    selectSpreadCureAddMoves({
      addMoves,
      cure: resolvePlacementCure(cureCondition),
      cureEvidence,
      hostingNodeIds: new Set(
        activePlacementReplicas
          .map((replica) => replica?.node_id)
          .filter(Boolean),
      ),
      spreadGapSize: requiredDistinctNodeCount - activeDistinctNodeCount,
      resolvePartitionRow: options.resolvePartitionRow,
      observedMembershipEpoch: options.observedMembershipEpoch,
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
  const destinationNodeId = addMoves[0]?.nodeId;
  // This site RE-TYPES the move under its own cure row, so it also re-states
  // the authorization under that row: any record an earlier site attached is
  // dropped first and only this site's own mint is carried forward. Carrying
  // a stale record past a mint that has just refused would be exactly the
  // "absent coerced to present" hazard, one hop later.
  const {
    [SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD]: _previousAuthorization,
    ...retypedMove
  } = addMoves[0];
  // The mint refuses every condition but its own, so the ledger and
  // at-target expand rows above carry nothing: those states already promote
  // on the replacement allowance alone and are not this owner's to authorize.
  addMoves[0] = withSpreadCureTransitionAuthorization({
    ...retypedMove,
    type: expandCure.moveType,
    reason: expandCure.moveReason,
  }, mintSpreadCureTransitionAuthorization(
    sharedEvidence, options, destinationNodeId));
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
