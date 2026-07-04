import {
  PLACEMENT_OWNER,
  PLACEMENT_OWNER_DATA_AFFINITY_SCORE,
  PLACEMENT_OWNER_FILTER_ACTION,
  PLACEMENT_OWNER_FILTER_REASON,
  PLACEMENT_OWNER_FILTER_STATE,
  PLACEMENT_OWNER_INTENT_ACTION,
  PLACEMENT_OWNER_INTENT_STATE,
  PLACEMENT_OWNER_PHASE,
  PLACEMENT_OWNER_REASON,
  PLACEMENT_OWNER_REINTERPRETATION,
  PLACEMENT_OWNER_RESERVATION_REASON,
  PLACEMENT_OWNER_RESERVATION_STATE,
  PLACEMENT_OWNER_SCORE_DIMENSION,
  PLACEMENT_OWNER_SCORE_PROFILE,
  PLACEMENT_OWNER_SCORE_STATE,
  PLACEMENT_OWNER_TOPOLOGY_SCORE,
  TOPOLOGY_CONTROL_PLANE_OWNER,
} from './placement-owner-constants.js';
import {normalizePlacementOwnerEvidence} from './placement-owner-evidence.js';

const PLACEMENT_OWNER_NO_DOMINANT_GROUP = '';

function selectDominantGroupId(existingGroupCounts) {
  let dominantGroupId = PLACEMENT_OWNER_NO_DOMINANT_GROUP;
  let dominantCount = 0;
  for (const [groupId, count] of existingGroupCounts.entries()) {
    if (count > dominantCount) {
      dominantGroupId = groupId;
      dominantCount = count;
      continue;
    }
    if (
      count === dominantCount &&
      dominantGroupId.length > 0 &&
      groupId < dominantGroupId
    ) {
      dominantGroupId = groupId;
    }
  }
  return dominantGroupId;
}

function buildPlacementOwnerFilterResult(evidence) {
  const acceptedCandidates = evidence.candidateNodes.filter(
    (candidate) => candidate.valid === true,
  );
  const state =
    acceptedCandidates.length === 0 ?
      PLACEMENT_OWNER_FILTER_STATE.NO_CANDIDATES :
      evidence.capacityDiagnostics.rejectedCount > 0 ?
        PLACEMENT_OWNER_FILTER_STATE.CAPACITY_CONSTRAINED :
        PLACEMENT_OWNER_FILTER_STATE.CANDIDATES_ACCEPTED;
  const action =
    acceptedCandidates.length === 0 ?
      PLACEMENT_OWNER_FILTER_ACTION.REJECT :
      PLACEMENT_OWNER_FILTER_ACTION.ACCEPT;
  const reason =
    state === PLACEMENT_OWNER_FILTER_STATE.NO_CANDIDATES ?
      PLACEMENT_OWNER_FILTER_REASON.CANDIDATE_SET_EMPTY :
      state === PLACEMENT_OWNER_FILTER_STATE.CAPACITY_CONSTRAINED ?
        PLACEMENT_OWNER_FILTER_REASON.CAPACITY_REJECTED_CANDIDATES :
        PLACEMENT_OWNER_FILTER_REASON.CANDIDATES_ACCEPTED;
  return Object.freeze({
    owner: PLACEMENT_OWNER,
    phase: PLACEMENT_OWNER_PHASE.FILTER,
    state,
    action,
    reason,
    acceptedCandidates: Object.freeze(acceptedCandidates),
    acceptedNodeIds: Object.freeze(
      acceptedCandidates.map((candidate) => candidate.nodeId),
    ),
    capacityDiagnostics: evidence.capacityDiagnostics,
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

function buildScoreDimension(dimension, value) {
  return Object.freeze({dimension, value});
}

function calculateTopologyScoreDimensions(candidate, evidence) {
  const dimensions = [];
  const context = evidence.latencyGroupContext;
  const dominantGroupId = selectDominantGroupId(context.existingGroupCounts);
  const candidateGroupId =
    context.nodeGroupById.get(candidate.nodeId) ||
    PLACEMENT_OWNER_NO_DOMINANT_GROUP;
  if (
    evidence.placementConstraints.preferSameLatencyGroup === true &&
    dominantGroupId.length > 0 &&
    candidateGroupId.length > 0
  ) {
    dimensions.push(buildScoreDimension(
      PLACEMENT_OWNER_SCORE_DIMENSION.SAME_LATENCY_GROUP,
      candidateGroupId === dominantGroupId ?
        -PLACEMENT_OWNER_TOPOLOGY_SCORE.SAME_GROUP_BONUS :
        PLACEMENT_OWNER_TOPOLOGY_SCORE.SAME_GROUP_PENALTY,
    ));
  }
  if (
    evidence.placementConstraints.preferLatencyGroupDiversity === true &&
    candidateGroupId.length > 0
  ) {
    dimensions.push(buildScoreDimension(
      PLACEMENT_OWNER_SCORE_DIMENSION.LATENCY_GROUP_DIVERSITY,
      context.existingGroupCounts.has(candidateGroupId) ?
        PLACEMENT_OWNER_TOPOLOGY_SCORE.DIVERSITY_EXISTING_GROUP_PENALTY :
        -PLACEMENT_OWNER_TOPOLOGY_SCORE.DIVERSITY_NEW_GROUP_BONUS,
    ));
  }
  return dimensions;
}

// DATA_AFFINITY dimension family (service↔data affinity placement epic):
// candidates in latency groups holding more of the entity's accessed
// data score better (negative values win), and incumbents carry an
// in-score movement-cost bonus so an affinity gradient below the
// retention margin does not churn the placement (Tier-1a sim finding:
// affinity/load coupling without in-score hysteresis limit-cycles).
// Gated on the preferDataAffinity constraint AND supplied affinity
// evidence — absent either, no dimension is emitted and the kernel
// output is byte-identical to the pre-affinity scorer.
function buildNodeAffinityDimension(candidate, nodeWeights) {
  const nodeAffinityWeight = nodeWeights.get(candidate.nodeId) || 0;
  if (nodeWeights.size === 0 || nodeAffinityWeight <= 0) {
    return [];
  }
  return [buildScoreDimension(
    PLACEMENT_OWNER_SCORE_DIMENSION.DATA_AFFINITY_NODE,
    -(PLACEMENT_OWNER_DATA_AFFINITY_SCORE.NODE_AFFINITY_WEIGHT *
      nodeAffinityWeight),
  )];
}

function buildGroupAffinityDimension(candidate, evidence, groupWeights) {
  const candidateGroupId =
    evidence.latencyGroupContext.nodeGroupById.get(candidate.nodeId) ||
    PLACEMENT_OWNER_NO_DOMINANT_GROUP;
  if (groupWeights.size === 0 || candidateGroupId.length === 0) {
    return [];
  }
  const affinityWeight = groupWeights.get(candidateGroupId) || 0;
  return [buildScoreDimension(
    PLACEMENT_OWNER_SCORE_DIMENSION.DATA_AFFINITY,
    affinityWeight === 0 ?
      0 :
      -(PLACEMENT_OWNER_DATA_AFFINITY_SCORE.AFFINITY_WEIGHT *
        affinityWeight),
  )];
}

function calculateDataAffinityScoreDimensions(candidate, evidence) {
  if (evidence.placementConstraints.preferDataAffinity !== true) {
    return [];
  }
  const groupWeights = evidence.dataAffinityContext.groupWeights;
  const nodeWeights = evidence.dataAffinityContext.nodeWeights;
  if (groupWeights.size === 0 && nodeWeights.size === 0) {
    return [];
  }
  const dimensions = [];
  // Node term first — the primary nearness coordinate ("code ON its
  // data"); the group term is the coarse cross-latency-domain tie.
  dimensions.push(...buildNodeAffinityDimension(candidate, nodeWeights));
  dimensions.push(...buildGroupAffinityDimension(
    candidate, evidence, groupWeights,
  ));
  const isIncumbent = evidence.currentReplicas.some(
    (replica) => replica.valid === true && replica.nodeId === candidate.nodeId,
  );
  if (isIncumbent) {
    dimensions.push(buildScoreDimension(
      PLACEMENT_OWNER_SCORE_DIMENSION.DATA_AFFINITY_INCUMBENT_RETENTION,
      -PLACEMENT_OWNER_DATA_AFFINITY_SCORE.INCUMBENT_MOVEMENT_COST,
    ));
  }
  return dimensions;
}

function calculateScoreDimensions(candidate, evidence) {
  const dimensions = [];
  if (
    evidence.scoreProfile === PLACEMENT_OWNER_SCORE_PROFILE.LOAD ||
    evidence.placementConstraints.considerCpuLoad === true
  ) {
    dimensions.push(buildScoreDimension(
      PLACEMENT_OWNER_SCORE_DIMENSION.CPU_LOAD,
      candidate.cpuUsagePercent,
    ));
  }
  if (
    evidence.scoreProfile === PLACEMENT_OWNER_SCORE_PROFILE.LOAD ||
    evidence.placementConstraints.considerMemoryLoad === true
  ) {
    dimensions.push(buildScoreDimension(
      PLACEMENT_OWNER_SCORE_DIMENSION.MEMORY_LOAD,
      candidate.memoryUsagePercent,
    ));
  }
  if (
    evidence.scoreProfile === PLACEMENT_OWNER_SCORE_PROFILE.LOAD ||
    evidence.placementConstraints.considerDiskSpace === true
  ) {
    dimensions.push(buildScoreDimension(
      PLACEMENT_OWNER_SCORE_DIMENSION.DISK_LOAD,
      candidate.diskUsagePercent,
    ));
  }
  dimensions.push(...calculateTopologyScoreDimensions(candidate, evidence));
  dimensions.push(
    ...calculateDataAffinityScoreDimensions(candidate, evidence),
  );
  dimensions.push(buildScoreDimension(
    PLACEMENT_OWNER_SCORE_DIMENSION.DISK_TIE_BREAKER,
    candidate.diskUsagePercent,
  ));
  return Object.freeze(dimensions);
}

function sumPrimaryScore(dimensions) {
  return dimensions
    .filter(
      (entry) =>
        entry.dimension !== PLACEMENT_OWNER_SCORE_DIMENSION.DISK_TIE_BREAKER,
    )
    .reduce((total, entry) => total + entry.value, 0);
}

function getTieBreakerScore(dimensions) {
  return dimensions.find(
    (entry) =>
      entry.dimension === PLACEMENT_OWNER_SCORE_DIMENSION.DISK_TIE_BREAKER,
  )?.value || 0;
}

function buildPlacementOwnerScoreResult(evidence, filterResult) {
  const scoreVector = filterResult.acceptedCandidates
    .map((candidate) => {
      const dimensions = calculateScoreDimensions(candidate, evidence);
      return Object.freeze({
        node: candidate.node,
        nodeId: candidate.nodeId,
        ordinal: candidate.ordinal,
        score: sumPrimaryScore(dimensions),
        diskTieBreaker: getTieBreakerScore(dimensions),
        dimensions,
      });
    });
  const rankedCandidates = [...scoreVector].sort((left, right) => {
    if (left.score === right.score) {
      if (left.diskTieBreaker === right.diskTieBreaker) {
        return left.ordinal - right.ordinal;
      }
      return left.diskTieBreaker - right.diskTieBreaker;
    }
    return left.score - right.score;
  });
  return Object.freeze({
    owner: PLACEMENT_OWNER,
    phase: PLACEMENT_OWNER_PHASE.SCORE,
    state:
      rankedCandidates.length === 0 ?
        PLACEMENT_OWNER_SCORE_STATE.NO_SCORED_CANDIDATES :
        PLACEMENT_OWNER_SCORE_STATE.RANKED_CANDIDATES,
    scoreProfile: evidence.scoreProfile,
    scoreVector: Object.freeze(scoreVector),
    rankedCandidates: Object.freeze(rankedCandidates),
    rankedNodeIds: Object.freeze(
      rankedCandidates.map((candidate) => candidate.nodeId),
    ),
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

function buildPlacementOwnerReservationResult(evidence, scoreResult) {
  const targetCount = Math.min(evidence.targetCount, scoreResult.rankedNodeIds.length);
  // Transition reservations (in-flight entity establishment) take precedence over
  // CL-038 leader retention: when the budget is tight, retaining the leader must
  // never EVICT a node mid-establishment (that would re-introduce the churn the
  // lever exists to remove). So fill from transition reservations first, then add
  // the surplus-drain leader node only on the leftover budget. Filtering on
  // rankedNodeIds keeps both classes feasible (capacity-accepted) — a
  // capacity-rejected leader is never floored back in.
  const transitionReserved = scoreResult.rankedNodeIds
    .filter((nodeId) => evidence.transitionReservations.has(nodeId));
  // C-2 incumbency stickiness: retain current healthy+feasible incumbents (those
  // still in rankedNodeIds) so load-only re-ranking cannot migrate a control-plane-
  // priority partition's replicas off them. Precedence sits BELOW in-flight
  // transitions (never evict a mid-establishment node) and SUPERSEDES the narrower
  // CL-038 leader-only retention (the leader is itself an incumbent). Empty unless
  // the caller opted in, so the flag-off path is byte-identical to prior behavior.
  const incumbentRetentionNodeIdSet = new Set(evidence.incumbentRetentionNodeIds);
  const incumbentReserved = scoreResult.rankedNodeIds
    .filter((nodeId) =>
      incumbentRetentionNodeIdSet.has(nodeId) &&
      !evidence.transitionReservations.has(nodeId),
    );
  const leaderReserved =
    evidence.leaderRetentionNodeId.length > 0 &&
      scoreResult.rankedNodeIds.includes(evidence.leaderRetentionNodeId) &&
      !evidence.transitionReservations.has(evidence.leaderRetentionNodeId) ?
      [evidence.leaderRetentionNodeId] :
      [];
  // Precedence within the targetCount slice budget: in-flight transitions first
  // (never evict a mid-establishment node), then the raft LEADER (so the
  // over-target surplus-drain case still retains the leader exactly like CL-038 —
  // otherwise rank-ordered incumbents could slice a high-load leader out and force
  // the re-election this lever exists to prevent), then the remaining incumbents
  // by rank. Dedup preserves this order; the leader appears once.
  const reservedNodeIds = [
    ...new Set([...transitionReserved, ...leaderReserved, ...incumbentReserved]),
  ].slice(0, targetCount);
  const reservedNodeIdSet = new Set(reservedNodeIds);
  const deferredNodeIds = scoreResult.rankedNodeIds
    .filter((nodeId) =>
      evidence.transitionDeferrals.has(nodeId) &&
      !reservedNodeIdSet.has(nodeId),
    )
    .slice(0, targetCount);
  const state =
    reservedNodeIds.length > 0 || deferredNodeIds.length > 0 ?
      PLACEMENT_OWNER_RESERVATION_STATE.RESERVATIONS_APPLIED :
      PLACEMENT_OWNER_RESERVATION_STATE.NO_RESERVATIONS;
  const reasons = [];
  if (reservedNodeIds.some(
    (nodeId) => evidence.transitionReservations.has(nodeId),
  )) {
    reasons.push(PLACEMENT_OWNER_RESERVATION_REASON.SAME_ENTITY_TRANSITION);
  }
  if (evidence.leaderRetentionNodeId.length > 0 &&
      reservedNodeIds.includes(evidence.leaderRetentionNodeId)) {
    reasons.push(PLACEMENT_OWNER_RESERVATION_REASON.LEADER_RETENTION);
  }
  if (reservedNodeIds.some(
    (nodeId) => incumbentRetentionNodeIdSet.has(nodeId),
  )) {
    reasons.push(PLACEMENT_OWNER_RESERVATION_REASON.INCUMBENT_RETENTION);
  }
  if (deferredNodeIds.length > 0) {
    reasons.push(
      PLACEMENT_OWNER_RESERVATION_REASON.GLOBAL_SYSTEM_TRANSITION_DEFERRED,
    );
  }
  return Object.freeze({
    owner: PLACEMENT_OWNER,
    phase: PLACEMENT_OWNER_PHASE.RESERVE,
    state,
    reasons: Object.freeze(
      reasons.length > 0 ?
        reasons :
        [PLACEMENT_OWNER_RESERVATION_REASON.NONE],
    ),
    targetCount,
    reservedNodeIds: Object.freeze(reservedNodeIds),
    deferredNodeIds: Object.freeze(deferredNodeIds),
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

function selectIntentTargetNodeIds(scoreResult, reservationResult) {
  const selectedNodeIds = [...reservationResult.reservedNodeIds];
  const reservedNodeIdSet = new Set(reservationResult.reservedNodeIds);
  const deferredNodeIdSet = new Set(reservationResult.deferredNodeIds);
  for (const nodeId of scoreResult.rankedNodeIds) {
    if (selectedNodeIds.length >= reservationResult.targetCount) {
      break;
    }
    if (reservedNodeIdSet.has(nodeId) || deferredNodeIdSet.has(nodeId)) {
      continue;
    }
    selectedNodeIds.push(nodeId);
  }
  for (const nodeId of reservationResult.deferredNodeIds) {
    if (selectedNodeIds.length >= reservationResult.targetCount) {
      break;
    }
    selectedNodeIds.push(nodeId);
  }
  const selectedNodeIdSet = new Set(selectedNodeIds);
  return scoreResult.rankedNodeIds
    .filter((nodeId) => selectedNodeIdSet.has(nodeId))
    .slice(0, reservationResult.targetCount);
}

function buildPlacementOwnerIntent(evidence, filterResult, scoreResult, reservationResult) {
  const state =
    evidence.targetCount === 0 ?
      PLACEMENT_OWNER_INTENT_STATE.NO_TARGET_REQUESTED :
      filterResult.action === PLACEMENT_OWNER_FILTER_ACTION.REJECT ||
        scoreResult.rankedNodeIds.length === 0 ?
        PLACEMENT_OWNER_INTENT_STATE.NO_CANDIDATES :
        PLACEMENT_OWNER_INTENT_STATE.TARGETS_SELECTED;
  const action =
    state === PLACEMENT_OWNER_INTENT_STATE.TARGETS_SELECTED ?
      PLACEMENT_OWNER_INTENT_ACTION.SELECT_TARGETS :
      PLACEMENT_OWNER_INTENT_ACTION.SELECT_NONE;
  const reason =
    state === PLACEMENT_OWNER_INTENT_STATE.NO_TARGET_REQUESTED ?
      PLACEMENT_OWNER_REASON.TARGET_COUNT_EMPTY :
      state === PLACEMENT_OWNER_INTENT_STATE.NO_CANDIDATES ?
        PLACEMENT_OWNER_REASON.CANDIDATE_SET_EMPTY :
        PLACEMENT_OWNER_REASON.TARGETS_SELECTED;
  const targetNodeIds =
    action === PLACEMENT_OWNER_INTENT_ACTION.SELECT_TARGETS ?
      selectIntentTargetNodeIds(scoreResult, reservationResult) :
      [];
  return Object.freeze({
    owner: PLACEMENT_OWNER,
    phase: PLACEMENT_OWNER_PHASE.INTENT,
    state,
    action,
    reason,
    placementPolicy: evidence.placementPolicy,
    requestedTargetCount: evidence.targetCount,
    targetCount: reservationResult.targetCount,
    targetNodeIds: Object.freeze(targetNodeIds),
    reservedNodeIds: reservationResult.reservedNodeIds,
    deferredNodeIds: reservationResult.deferredNodeIds,
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

function buildPlacementOwnerOutcome(intent) {
  return Object.freeze({
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
    state: intent.state,
    action: intent.action,
    reason: intent.reason,
    targetNodeIds: intent.targetNodeIds,
    reservedNodeIds: intent.reservedNodeIds,
    deferredNodeIds: intent.deferredNodeIds,
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

function buildPlacementOwnerDecision(options = {}) {
  const evidence = normalizePlacementOwnerEvidence(options);
  const filterResult = buildPlacementOwnerFilterResult(evidence);
  const scoreResult = buildPlacementOwnerScoreResult(evidence, filterResult);
  const reservationResult = buildPlacementOwnerReservationResult(
    evidence,
    scoreResult,
  );
  const intent = buildPlacementOwnerIntent(
    evidence,
    filterResult,
    scoreResult,
    reservationResult,
  );
  return Object.freeze({
    owner: PLACEMENT_OWNER,
    evidence,
    filterResult,
    scoreResult,
    reservationResult,
    intent,
    placementOwnerOutcome: buildPlacementOwnerOutcome(intent),
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

export {
  buildPlacementOwnerDecision,
};
