// The placement deficit model of the one replica placement owner (quest
// replica-placement-admission-owner, design section 2.6): a pure function
// of committed inputs - the committed node answer and a partition's declared
// replication factor and replica rows - that names at most one move per
// partition, in severity order FAILED_OR_DEAD > UNDER_REPLICATED (fewer
// live voters than declared: ADD) > HOST_SPREAD (enough voters on too few
// declared hosts, co-located voters included: a count-neutral REPLACE) >
// SURPLUS. Spread is counted in declared hosts (NODES.host_id,
// read only through readNodeHostIdentity). Eligibility is per target: a node
// without a valid READY lease, or without a declared host, is excluded as a
// target and its replicas are repair deficits; it never holds admissions to
// any other target. The copy source of a copy is the partition's current
// Raft leader (WP-A). REBALANCE (load and affinity scoring) stays with the
// target scorer and is not derived here.
import {projectNodeLivenessSemantics} from
  '../control-plane/node-liveness-semantic-projection.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-record-decision.js';
import {NODE_HOST_IDENTITY_STATE, readNodeHostIdentity} from
  '../topology/node-host-identity.js';
import {COLUMN} from '../constants/columns.js';
import {OperationType} from './replica-operation-progress.js';
import {
  PLACEMENT_DEFICIT_KIND as KIND,
  PLACEMENT_REPAIR_DEFICIT_KINDS,
  PLACEMENT_WAITING_REASON as WAITING,
} from './replica-placement-owner-constants.js';
import {classifyPlacementClass} from './replica-placement-owner-order.js';

const PLACEMENT_DEFICIT_STATE = Object.freeze({
  NONE: 'NONE',
  CANDIDATE: 'CANDIDATE',
  WAITING: 'WAITING',
});
const NONE = Object.freeze({state: PLACEMENT_DEFICIT_STATE.NONE});

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * The per-target eligibility of the committed node answer at nowMs: a node
 * is an eligible target while its READY lease is valid (status ACTIVE and
 * lease unexpired) and its host is declared.
 * @param {Object} input - {nodeRows, nowMs}.
 * @return {Object} Frozen {hostOfNode: Map(eligible nodeId -> hostId),
 *   eligibleNodeIds: sorted Array, eligibleHostIds: Set}.
 */
function buildPlacementNodeEligibility({nodeRows, nowMs}) {
  const hostOfNode = new Map();
  for (const nodeRow of nodeRows) {
    const nodeId = nodeRow[COLUMN.NODE_ID];
    const host = readNodeHostIdentity(nodeRow);
    if (typeof nodeId !== 'string' ||
        host.state !== NODE_HOST_IDENTITY_STATE.DECLARED ||
        projectNodeLivenessSemantics({nodeRow, nowMs}).projection.readyNow !== true) {
      continue;
    }
    hostOfNode.set(nodeId, host.hostId);
  }
  return Object.freeze({hostOfNode,
    eligibleNodeIds: Object.freeze([...hostOfNode.keys()].sort(compareText)),
    eligibleHostIds: Object.freeze(new Set(hostOfNode.values()))});
}

/**
 * The committed node inputs of one pass, from the node authority's one
 * committed read (ServeEligibilityOwner.answerCommittedNodes(), whose
 * `formation` is the formation latch's answer, precondition P4): the
 * per-target eligibility and the formation answer from the same position,
 * or NODE_AUTHORITY_UNAVAILABLE, cleared by that owner's notification.
 * @param {Object} nodeAuthority - {answerCommittedNodes()}.
 * @param {number} nowMs - The pass's time for READY-lease validity.
 * @return {Object} Frozen {state: READY, epoch, formation, eligibility} or
 *   {state: UNAVAILABLE, reason}.
 */
function readPlacementNodeInputs(nodeAuthority, nowMs) {
  const answer = nodeAuthority.answerCommittedNodes();
  if (answer.state !== SERVE_ELIGIBILITY_STATE.READY) {
    return Object.freeze({state: SERVE_ELIGIBILITY_STATE.UNAVAILABLE,
      reason: WAITING.NODE_AUTHORITY_UNAVAILABLE});
  }
  return Object.freeze({state: SERVE_ELIGIBILITY_STATE.READY, epoch: answer.epoch,
    formation: answer.formation,
    eligibility: buildPlacementNodeEligibility({nodeRows: answer.nodeRows, nowMs})});
}

function liveReplicasOf(replicaRows, eligibility) {
  return replicaRows.filter((replica) => replica.failed !== true &&
    eligibility.hostOfNode.has(replica.nodeId));
}

function hostCountsOf(replicas, eligibility) {
  const counts = new Map();
  for (const replica of replicas) {
    const hostId = eligibility.hostOfNode.get(replica.nodeId);
    counts.set(hostId, (counts.get(hostId) ?? 0) + 1);
  }
  return counts;
}

function findTargetNode(replicas, eligibility, {requireUnusedHost, excludedTargetNodeIds = null}) {
  const usedNodes = new Set(replicas.map((replica) => replica.nodeId));
  const usedHosts = new Set(replicas.map((replica) =>
    eligibility.hostOfNode.get(replica.nodeId)));
  const free = eligibility.eligibleNodeIds.filter((nodeId) =>
    !usedNodes.has(nodeId) && !excludedTargetNodeIds?.has(nodeId));
  const unusedHost = free.find((nodeId) =>
    !usedHosts.has(eligibility.hostOfNode.get(nodeId)));
  return unusedHost ?? (requireUnusedHost ? null : free[0] ?? null);
}

// An eligible node that does not host the partition, on a host it does not
// use when one exists; prefers a target not in saturatedTargetNodeIds; ties by node id.
function targetNodeOf(replicas, eligibility, {requireUnusedHost, saturatedTargetNodeIds = null}) {
  const anyTarget = findTargetNode(replicas, eligibility, {requireUnusedHost});
  if (anyTarget === null || !saturatedTargetNodeIds || saturatedTargetNodeIds.size === 0) {
    return anyTarget;
  }
  return findTargetNode(replicas, eligibility, {
    requireUnusedHost,
    excludedTargetNodeIds: saturatedTargetNodeIds,
  }) ?? anyTarget;
}

// The replica to move off the most over-represented host: never the leader
// replica while a non-leader shares its host (design section 2.2).
function overRepresentedReplicaOf(live, eligibility) {
  const counts = hostCountsOf(live, eligibility);
  const ranked = [...live].sort((left, right) =>
    counts.get(eligibility.hostOfNode.get(right.nodeId)) -
      counts.get(eligibility.hostOfNode.get(left.nodeId)) ||
    Number(left.isLeader === true) - Number(right.isLeader === true) ||
    compareText(left.replicaId, right.replicaId));
  return ranked[0];
}

function moveOf(type, fields) {
  return Object.freeze({type, targetNodeId: fields.targetNodeId,
    replicaId: fields.replicaId ?? null,
    sourceReplicaId: fields.sourceReplicaId ?? null,
    copySourceNodeId: fields.copySourceNodeId ?? null});
}

function candidateOf(context, deficitKind, move) {
  return Object.freeze({state: PLACEMENT_DEFICIT_STATE.CANDIDATE,
    candidate: Object.freeze({...context.summary, deficitKind,
      repair: PLACEMENT_REPAIR_DEFICIT_KINDS.has(deficitKind), move})});
}

function waitingOf(context, deficitKind, reason) {
  return Object.freeze({state: PLACEMENT_DEFICIT_STATE.WAITING,
    waiting: Object.freeze({...context.summary, deficitKind,
      repair: PLACEMENT_REPAIR_DEFICIT_KINDS.has(deficitKind), reason})});
}

// A copy reads from the current leader; with no known leader it waits.
function copyMoveOf(context, deficitKind, type, fields) {
  const target = targetNodeOf(context.live, context.eligibility,
    {requireUnusedHost: deficitKind === KIND.HOST_SPREAD,
      saturatedTargetNodeIds: context.saturatedTargetNodeIds});
  if (target === null) return waitingOf(context, deficitKind, WAITING.NO_ELIGIBLE_TARGET);
  if (context.leader === undefined) {
    return waitingOf(context, deficitKind, WAITING.LEADER_UNKNOWN);
  }
  return candidateOf(context, deficitKind, moveOf(type, {...fields,
    targetNodeId: target, copySourceNodeId: context.leader.nodeId}));
}

function failedOrDeadDeficit(context) {
  const dead = context.replicaRows.find((replica) =>
    !context.live.includes(replica));
  if (context.live.length >= context.replicationFactor) {
    return candidateOf(context, KIND.FAILED_OR_DEAD, moveOf(OperationType.REMOVE,
      {targetNodeId: dead.nodeId, replicaId: dead.replicaId}));
  }
  return copyMoveOf(context, KIND.FAILED_OR_DEAD, OperationType.REPLACE,
    {sourceReplicaId: dead.replicaId});
}

function spreadDeficit(context) {
  const source = overRepresentedReplicaOf(context.live, context.eligibility);
  const others = context.live.filter((replica) => replica !== source);
  return copyMoveOf({...context, live: others}, KIND.HOST_SPREAD,
    OperationType.REPLACE, {sourceReplicaId: source.replicaId});
}

function surplusDeficit(context) {
  const removed = overRepresentedReplicaOf(context.live, context.eligibility);
  return candidateOf(context, KIND.SURPLUS, moveOf(OperationType.REMOVE,
    {targetNodeId: removed.nodeId, replicaId: removed.replicaId}));
}

/**
 * The one deficit of a partition and its move, or why it waits.
 * @param {Object} input - {partitionId, replicationFactor, replicaRows:
 *   [{replicaId, nodeId, failed, isLeader}], eligibility}.
 * @return {Object} Frozen {state: NONE} | {state: CANDIDATE, candidate} |
 *   {state: WAITING, waiting}.
 */
function evaluatePartitionDeficit({partitionId, replicationFactor, replicaRows,
  eligibility, saturatedTargetNodeIds = null}) {
  const live = liveReplicasOf(replicaRows, eligibility);
  const distinctHostCount = hostCountsOf(live, eligibility).size;
  const context = {replicaRows, live, eligibility, replicationFactor,
    saturatedTargetNodeIds,
    leader: live.find((replica) => replica.isLeader === true),
    summary: Object.freeze({partitionId,
      placementClass: classifyPlacementClass(partitionId),
      distinctHostCount, voterCount: live.length})};
  if (live.length < replicaRows.length) return failedOrDeadDeficit(context);
  if (live.length < replicationFactor) {
    return copyMoveOf(context, KIND.UNDER_REPLICATED, OperationType.ADD, {});
  }
  const requiredHosts = Math.min(replicationFactor, eligibility.eligibleHostIds.size);
  if (distinctHostCount < requiredHosts) return spreadDeficit(context);
  return live.length > replicationFactor ? surplusDeficit(context) : NONE;
}

/**
 * The copy sources a repair candidate of this pass copies from: the
 * level-triggered repair reservation (owner decision D2).
 * @param {Array<Object>} evaluations - evaluatePartitionDeficit answers.
 * @return {Set<string>} The reserved copy sources.
 */
function repairSourceNodeIdsOf(evaluations) {
  return new Set(evaluations.filter((evaluation) =>
    evaluation.state === PLACEMENT_DEFICIT_STATE.CANDIDATE &&
    evaluation.candidate.repair === true &&
    evaluation.candidate.move.copySourceNodeId !== null)
    .map((evaluation) => evaluation.candidate.move.copySourceNodeId));
}

export {
  PLACEMENT_DEFICIT_STATE,
  buildPlacementNodeEligibility,
  evaluatePartitionDeficit,
  readPlacementNodeInputs,
  repairSourceNodeIdsOf,
};
