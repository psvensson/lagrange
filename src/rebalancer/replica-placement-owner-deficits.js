// The placement deficit model of the one replica placement owner (quest
// replica-placement-admission-owner, design section 2.6): a pure function
// of committed inputs - the committed node answer and a partition's declared
// replication factor and replica rows - that names at most one move per
// partition, in severity order FAILED_OR_DEAD > UNDER_REPLICATED (fewer
// live voters than declared: ADD) > HOST_SPREAD (enough voters on too few
// declared hosts, co-located voters included: a count-neutral REPLACE) >
// SURPLUS. Spread is counted in declared hosts (NODES.host_id,
// read only through readNodeHostIdentity). Eligibility is per target: a node
// without a valid READY lease or declared host cannot receive replicas.
// Existing members keep their occupancy while their authority is unresolved.
// The copy source of a copy is the partition's current
// Raft leader (WP-A). REBALANCE (load and affinity scoring) stays with the
// target scorer and is not derived here.
import {projectNodeLivenessSemantics} from
  '../control-plane/node-liveness-semantic-projection.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-record-decision.js';
import {NODE_HOST_IDENTITY_STATE, readNodeHostIdentity} from
  '../topology/node-host-identity.js';
import {
  COLUMN,
  NODE_STATE,
  SERVICE_STATUS,
  STATE,
  isPartitionCleanupServiceRow,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  isCatchupLearnerRaftRole,
  isVoterRaftRole,
} from '../raft/replica-voter-readiness.js';
import {STATE_ABSENT, readLowerStateField} from '../utils/state-field-read.js';
import {isFailedCreateCleanupToken} from './failed-create-cleanup-token.js';
import {OperationType} from './replica-operation-progress.js';
import {ReplicaStatus} from './replica-status.js';
import {
  PLACEMENT_DEFICIT_KIND as KIND,
  PLACEMENT_MOVE_TYPE,
  PLACEMENT_REPAIR_DEFICIT_KINDS,
  PLACEMENT_WAITING_REASON as WAITING,
} from './replica-placement-owner-constants.js';
import {classifyPlacementClass, resolveVoterTarget} from './replica-placement-owner-order.js';

const IN_FLIGHT_LEARNER_STATUSES = Object.freeze(new Set([
  ReplicaStatus.PENDING,
  ReplicaStatus.CREATING,
  ReplicaStatus.SYNCING,
]));

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

function observesCommittedNodeLoss(row) {
  const boot = row[COLUMN.BOOT_INCARNATION];
  if (!Number.isSafeInteger(boot) || boot <= 0) return false;
  const status = row[COLUMN.STATUS];
  if (status === NODE_STATE.FAILED || status === NODE_STATE.STOPPED) return true;
  return row[COLUMN.CONNECTION_STATE] === STATE.DISCONNECTED &&
    row[COLUMN.READY_LEASE_EXPIRES_AT] === null;
}

/**
 * The per-target eligibility of the committed node answer at nowMs: a node
 * is an eligible target while its READY lease is valid (status ACTIVE and
 * lease unexpired) and its host is declared.
 * @param {Object} input - {nodeRows, nowMs}.
 * @return {Object} Eligible target hosts, incumbent host declarations and
 *   positive loss observations, all from the same committed node answer.
 */
function buildPlacementNodeEligibility({nodeRows, nowMs}) {
  const hostOfNode = new Map();
  const declaredHosts = new Map();
  const lostNodeIds = new Set();
  const nodeBoots = new Map();
  for (const nodeRow of nodeRows) {
    const nodeId = nodeRow[COLUMN.NODE_ID];
    if (typeof nodeId !== 'string') continue;
    const boot = nodeRow[COLUMN.BOOT_INCARNATION];
    if (Number.isSafeInteger(boot) && boot > 0) nodeBoots.set(nodeId, boot);
    if (observesCommittedNodeLoss(nodeRow)) lostNodeIds.add(nodeId);
    const host = readNodeHostIdentity(nodeRow);
    if (host.state !== NODE_HOST_IDENTITY_STATE.DECLARED) continue;
    declaredHosts.set(nodeId, host.hostId);
    if (projectNodeLivenessSemantics({nodeRow, nowMs}).projection.readyNow === true) {
      hostOfNode.set(nodeId, host.hostId);
    }
  }
  return Object.freeze({hostOfNode, declaredHosts, lostNodeIds, nodeBoots,
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

function isLearnerReplica(replica) {
  return replica.isLearner === true || isCatchupLearnerRaftRole(replica.role);
}

function isVoterRole(role) {
  return isVoterRaftRole(role);
}

function isFailedNonVoterCreateRow(row) {
  const status = readLowerStateField(row?.[COLUMN.STATUS]);
  if (status !== ReplicaStatus.FAILED) return false;
  const role = readLowerStateField(row?.[COLUMN.RAFT_ROLE]);
  if (isVoterRaftRole(role)) return false;
  const previousState = readLowerStateField(row?.previous_state);
  return (
    isFailedCreateCleanupToken(row?.cleanup_token) ||
    IN_FLIGHT_LEARNER_STATUSES.has(previousState) ||
    (previousState !== SERVICE_STATUS.ACTIVE &&
      !isCatchupLearnerRaftRole(role) &&
      role === STATE_ABSENT)
  );
}

function shouldSkipServiceRow(row, isBusy) {
  if (isPartitionCleanupServiceRow(row)) return true;
  const status = row[COLUMN.STATUS];
  if (status === ReplicaStatus.REMOVING || status === ReplicaStatus.REMOVED) {
    return true;
  }
  const role = row[COLUMN.RAFT_ROLE];
  if (isFailedNonVoterCreateRow(row)) return true;
  return isBusy && (isCatchupLearnerRaftRole(role) || IN_FLIGHT_LEARNER_STATUSES.has(status));
}

function classifyServiceRow(row, promotedVoterReplicaIds = null) {
  const replicaId = row[COLUMN.REPLICA_ID];
  const nodeId = row[COLUMN.NODE_ID];
  if (typeof replicaId !== 'string' || typeof nodeId !== 'string') return null;
  const rawRole = row[COLUMN.RAFT_ROLE];
  const role =
    promotedVoterReplicaIds?.has(replicaId) === true &&
    isCatchupLearnerRaftRole(rawRole) ?
      RAFT_ROLE.FOLLOWER :
      rawRole;
  const status = row[COLUMN.STATUS];
  const isLearner = isCatchupLearnerRaftRole(role) ||
    (!isVoterRole(role) && IN_FLIGHT_LEARNER_STATUSES.has(status));
  const activeVoter = status === SERVICE_STATUS.ACTIVE && isVoterRole(role);
  const caughtUp = isLearner && status === SERVICE_STATUS.ACTIVE &&
    row.caught_up !== false && row.caughtUp !== false;
  return {
    replicaId,
    nodeId,
    role,
    isLearner,
    caughtUp,
    failed: status === ReplicaStatus.FAILED || status === SERVICE_STATUS.STOPPED,
    operationalVoter: activeVoter,
    createdAt: row[COLUMN.CREATED_AT],
    ...(!isLearner && !isVoterRole(role) ? {unresolvedRole: true} : {}),
    isLeader: activeVoter && role === RAFT_ROLE.LEADER,
  };
}

function buildPartitionReplicaRows(
  serviceRows,
  leaderNodeId,
  isBusy,
  promotedVoterReplicaIds = null,
) {
  const filtered = [];
  for (const row of serviceRows) {
    if (shouldSkipServiceRow(row, isBusy)) continue;
    const classified = classifyServiceRow(row, promotedVoterReplicaIds);
    if (classified !== null) filtered.push(classified);
  }
  if (!filtered.some((r) => r.isLeader) && typeof leaderNodeId === 'string') {
    const leaderRow = filtered.find((r) =>
      r.operationalVoter === true && r.nodeId === leaderNodeId);
    if (leaderRow) leaderRow.isLeader = true;
  }
  return filtered;
}

function retainedReplicasOf(replicaRows, eligibility) {
  return replicaRows.filter((replica) => replica.failed !== true &&
    !eligibility.lostNodeIds.has(replica.nodeId));
}

function isOnEligibleHost(replica, eligibility) {
  return eligibility.hostOfNode.has(replica.nodeId);
}

function hostCountsOf(replicas, eligibility) {
  const counts = new Map();
  for (const replica of replicas) {
    const hostId = eligibility.declaredHosts.get(replica.nodeId);
    if (hostId === undefined) continue;
    counts.set(hostId, (counts.get(hostId) ?? 0) + 1);
  }
  return counts;
}

function findTargetNode(replicas, eligibility, {requireUnusedHost, excludedTargetNodeIds = null}) {
  const usedNodes = new Set(replicas.map((replica) => replica.nodeId));
  const usedHosts = new Set(replicas.map((replica) =>
    eligibility.declaredHosts.get(replica.nodeId)));
  const free = eligibility.eligibleNodeIds.filter((nodeId) =>
    !usedNodes.has(nodeId) && !excludedTargetNodeIds?.has(nodeId));
  const unusedHost = free.find((nodeId) =>
    !usedHosts.has(eligibility.hostOfNode.get(nodeId)));
  return unusedHost ?? (requireUnusedHost ? null : free[0] ?? null);
}

function mergeExcludedTargetSets(first, second) {
  if (!first || first.size === 0) return second;
  if (!second || second.size === 0) return first;
  return new Set([...first, ...second]);
}

// An eligible node that does not host the partition, on a host it does not
// use when one exists; excludes storage-unavailable targets and prefers a
// target not in saturatedTargetNodeIds; ties by node id.
function targetNodeOf(replicas, eligibility, {
  requireUnusedHost,
  saturatedTargetNodeIds = null,
  storageExcludedNodeIds = null,
}) {
  const nonStorageTarget = findTargetNode(replicas, eligibility, {
    requireUnusedHost,
    excludedTargetNodeIds: storageExcludedNodeIds,
  });
  if (nonStorageTarget === null || !saturatedTargetNodeIds || saturatedTargetNodeIds.size === 0) {
    return nonStorageTarget;
  }
  return findTargetNode(replicas, eligibility, {
    requireUnusedHost,
    excludedTargetNodeIds: mergeExcludedTargetSets(
      storageExcludedNodeIds,
      saturatedTargetNodeIds,
    ),
  }) ?? nonStorageTarget;
}

// The replica to move off the most over-represented host: never the leader
// replica while a non-leader shares its host (design section 2.2).
function overRepresentedReplicaOf(live, eligibility) {
  const counts = hostCountsOf(live, eligibility);
  const ranked = [...live].sort((left, right) =>
    counts.get(eligibility.declaredHosts.get(right.nodeId)) -
      counts.get(eligibility.declaredHosts.get(left.nodeId)) ||
    Number(left.isLeader === true) - Number(right.isLeader === true) ||
    compareText(left.replicaId, right.replicaId));
  return ranked[0];
}

function moveOf(type, fields) {
  const move = {
    type,
    targetNodeId: fields.targetNodeId,
    replicaId: fields.replicaId ?? null,
    sourceReplicaId: fields.sourceReplicaId ?? null,
    copySourceNodeId: fields.copySourceNodeId ?? null,
  };
  if (fields.learnerRetirement !== undefined) move.learnerRetirement = fields.learnerRetirement;
  if (Array.isArray(fields.promoteReplicaIds)) {
    move.promoteReplicaIds = Object.freeze([...fields.promoteReplicaIds]);
  }
  return Object.freeze(move);
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
  const requireUnusedHost =
    deficitKind === KIND.HOST_SPREAD || deficitKind === KIND.LEARNER_DEFICIT;
  const anyTarget = findTargetNode(context.live, context.eligibility, {requireUnusedHost});
  if (anyTarget === null) return waitingOf(context, deficitKind, WAITING.NO_ELIGIBLE_TARGET);
  const storageExcludedNodeIds = context.storageExcludedTargets ?
    new Set(context.storageExcludedTargets.keys()) : null;
  const target = targetNodeOf(context.live, context.eligibility, {
    requireUnusedHost,
    saturatedTargetNodeIds: context.saturatedTargetNodeIds,
    storageExcludedNodeIds,
  });
  if (target === null) {
    return waitingOf(
      context,
      deficitKind,
      context.storageExcludedTargets.get(anyTarget),
    );
  }
  if (context.leader === undefined) {
    return waitingOf(context, deficitKind, WAITING.LEADER_UNKNOWN);
  }
  return candidateOf(context, deficitKind, moveOf(type, {...fields,
    targetNodeId: target, copySourceNodeId: context.leader.nodeId}));
}

function learnerRetirementDeficit(context, replica) {
  const nodeBootIncarnation = context.eligibility.nodeBoots.get(replica.nodeId);
  if (nodeBootIncarnation === undefined ||
      !Number.isSafeInteger(replica.createdAt) || replica.createdAt <= 0) {
    return waitingOf(context, KIND.DEAD_LEARNER, WAITING.INCUMBENT_AUTHORITY_UNAVAILABLE);
  }
  const learnerRetirement = Object.freeze({nodeBootIncarnation,
    replicaCreatedAt: replica.createdAt});
  return candidateOf(context, KIND.DEAD_LEARNER, moveOf(OperationType.REMOVE,
    {targetNodeId: replica.nodeId, replicaId: replica.replicaId, learnerRetirement}));
}

function failedOrDeadDeficit(context) {
  const dead = context.replicaRows.find((replica) =>
    !context.live.includes(replica));
  if (context.readyVoters.length >= context.replicationFactor) {
    return candidateOf(context, KIND.FAILED_OR_DEAD, moveOf(OperationType.REMOVE,
      {targetNodeId: dead.nodeId, replicaId: dead.replicaId}));
  }
  return copyMoveOf({...context, live: context.liveReplicas}, KIND.FAILED_OR_DEAD,
    OperationType.REPLACE, {sourceReplicaId: dead.replicaId});
}

function spreadDeficit(context) {
  const source = overRepresentedReplicaOf(context.live, context.eligibility);
  const others = context.liveReplicas.filter((replica) => replica !== source);
  return copyMoveOf({...context, live: others}, KIND.HOST_SPREAD,
    OperationType.REPLACE, {sourceReplicaId: source.replicaId});
}

function surplusDeficit(context) {
  const removed = overRepresentedReplicaOf(context.live, context.eligibility);
  return candidateOf(context, KIND.SURPLUS, moveOf(OperationType.REMOVE,
    {targetNodeId: removed.nodeId, replicaId: removed.replicaId}));
}

function promotableLearnersOf(liveLearners, liveVoters, eligibility) {
  const voterHosts = new Set(liveVoters.map((r) =>
    eligibility.declaredHosts.get(r.nodeId)));
  const seenHosts = new Set();
  const promotable = [];
  for (const learner of liveLearners) {
    if (learner.caughtUp === false) continue;
    const hostId = eligibility.hostOfNode.get(learner.nodeId);
    if (hostId === undefined || voterHosts.has(hostId) || seenHosts.has(hostId)) continue;
    seenHosts.add(hostId);
    promotable.push(learner);
  }
  return promotable;
}

function growthPromotionDeficit(context, voterTarget) {
  if (context.live.length >= voterTarget || context.readyVoters.length !== context.live.length) {
    return null;
  }
  const neededForNextOdd = context.live.length % 2 === 1 ? 2 : 1;
  if (context.live.length + neededForNextOdd > voterTarget) return null;
  const promotable = promotableLearnersOf(
    context.liveLearners, context.live, context.eligibility);
  if (promotable.length < neededForNextOdd) return null;
  if (context.leader === undefined) {
    return waitingOf(context, KIND.PROMOTION_READY, WAITING.LEADER_UNKNOWN);
  }
  const toPromote = promotable.slice(0, neededForNextOdd);
  return candidateOf(context, KIND.PROMOTION_READY, moveOf(
    PLACEMENT_MOVE_TYPE.GROWTH_PROMOTE,
    {
      targetNodeId: context.leader.nodeId,
      replicaId: toPromote[0].replicaId,
      sourceReplicaId: toPromote[1]?.replicaId ?? null,
      promoteReplicaIds: toPromote.map((r) => r.replicaId),
    },
  ));
}

function underVoterTargetDeficit(context, requiredHosts) {
  const kind = context.live.length % 2 === 1 ? KIND.LEARNER_DEFICIT : KIND.UNDER_REPLICATED;
  if (kind === KIND.LEARNER_DEFICIT &&
      hostCountsOf(context.liveReplicas, context.eligibility).size >= requiredHosts) return NONE;
  if (context.liveReplicas.length >= context.replicationFactor &&
      context.liveReplicas.some((replica) => !isOnEligibleHost(replica, context.eligibility))) {
    return waitingOf(context, kind, WAITING.INCUMBENT_AUTHORITY_UNAVAILABLE);
  }
  return copyMoveOf({...context, live: context.liveReplicas}, kind, OperationType.ADD, {});
}

/**
 * The one deficit of a partition and its move, or why it waits.
 * @param {Object} input - {partitionId, replicationFactor, replicaRows:
 *   [{replicaId, nodeId, failed, isLeader, operationalVoter,
 *     isLearner?, role?, caughtUp?}], eligibility}.
 * @return {Object} Frozen {state: NONE} | {state: CANDIDATE, candidate} |
 *   {state: WAITING, waiting}.
 */
function evaluatePartitionDeficit({partitionId, replicationFactor, replicaRows,
  eligibility, saturatedTargetNodeIds = null, storageExcludedTargets = null}) {
  const voterRows = replicaRows.filter((r) => !isLearnerReplica(r));
  const learnerRows = replicaRows.filter(isLearnerReplica);
  const live = retainedReplicasOf(voterRows, eligibility);
  const liveLearners = retainedReplicasOf(learnerRows, eligibility);
  const readyVoters = live.filter((replica) =>
    replica.operationalVoter === true && isOnEligibleHost(replica, eligibility));
  const liveReplicas = [...live, ...liveLearners];
  const distinctHostCount = hostCountsOf(live, eligibility).size;
  const context = {replicaRows: voterRows, live, liveLearners, liveReplicas, readyVoters,
    eligibility, replicationFactor, saturatedTargetNodeIds, storageExcludedTargets,
    leader: readyVoters.find((replica) => replica.isLeader === true),
    summary: Object.freeze({partitionId,
      placementClass: classifyPlacementClass(partitionId),
      distinctHostCount, voterCount: live.length})};
  const deadLearner = learnerRows.find((r) => !liveLearners.includes(r));
  if (deadLearner !== undefined) return learnerRetirementDeficit(context, deadLearner);
  if (live.length < voterRows.length) return failedOrDeadDeficit(context);
  if (live.some((replica) => replica.unresolvedRole)) {
    return waitingOf(context, KIND.UNDER_REPLICATED, WAITING.INCUMBENT_ROLE_UNAVAILABLE);
  }
  const eligibleHostCount = eligibility.eligibleHostIds.size;
  const voterTarget = resolveVoterTarget(replicationFactor, eligibleHostCount);
  const requiredHosts = Math.min(replicationFactor, eligibleHostCount);
  const promotion = growthPromotionDeficit(context, voterTarget);
  if (promotion !== null) return promotion;
  if (live.length < replicationFactor) {
    return underVoterTargetDeficit(context, requiredHosts);
  }
  if (distinctHostCount >= requiredHosts && live.length === replicationFactor) return NONE;
  if (readyVoters.length !== live.length) {
    return waitingOf(context, KIND.HOST_SPREAD, WAITING.INCUMBENT_AUTHORITY_UNAVAILABLE);
  }
  return distinctHostCount < requiredHosts ? spreadDeficit(context) : surplusDeficit(context);
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
  buildPartitionReplicaRows,
  buildPlacementNodeEligibility,
  evaluatePartitionDeficit,
  observesCommittedNodeLoss,
  readPlacementNodeInputs,
  repairSourceNodeIdsOf,
};
