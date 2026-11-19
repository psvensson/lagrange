import assert from 'node:assert/strict';
import {DELIVERED_TO_PEER, PartitionNodeCluster} from './partition-node-cluster.js';
import {
  durableAppliedState,
  durableHardState,
  durableLog,
  reservedIdentities,
} from './committed-membership-oracles.js';
import {
  RAFT_CATCH_UP_REQUEST_KIND,
  RAFT_EVENT,
  RAFT_FOUNDING_GROWTH_OUTCOME,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
  PARTICIPATION_GATE,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {
  COMMITTED_REPLICA_ROLE,
  projectPeerRole,
  projectReplicaRole,
  readCommittedMembershipView,
} from '../../../src/raft/raft-rs-committed-membership-read.js';
import {
  computeBaseConfigurationDigest,
  decideTypedConfChangeOperation,
  evaluateTenureCatchUpOnDrain,
  resolveVoterTargetCount,
  syncLeadershipTenure,
} from '../../../src/raft/raft-rs-conf-change-admission.js';
import {
  executeTypedConfChangeOperation,
  normalizedConfChange,
} from '../../../src/raft/raft-rs-conf-change-refusal-answer.js';
import {
  admitGroupLearner,
  admitGroupPeer,
  evaluateGroupLearnerCatchUp,
  proposeGroupGrowthPromote,
  proposeGroupRemoveLearner,
  proposeGroupReplacePromote,
  reserveAndAdmitGroupLearner,
  reserveGroupPeerIdentity,
  withdrawGroupPromotion,
} from '../../../src/raft/raft-rs-group-membership-admission.js';
import {
  restoreAppliedTerm,
  snapshotAdmitsReplica,
} from '../../../src/raft/raft-rs-participation-gate.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {
  RAFT_RS_CONF_CHANGE_ENTRY_TYPES,
  RAFT_RS_CONF_CHANGE_TYPE,
} from '../../../src/raft/raft-rs-ready-loop-constants.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {instantiateRaftRsCore} from '../../../src/raft/raft-rs-binding-owner.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';

const PARTITION_ID = 'founding-growth-partition';
const LEADER_ROLE = 'leader';
const SETTLE_ROUNDS = 400;
const RETRY_ROUNDS = 30;
const PROPOSAL_ATTEMPTS = 25;

function createFoundingCluster(founders, options = {}) {
  return new PartitionNodeCluster({
    partitionId: options.partitionId || PARTITION_ID,
    replicaIds: founders,
    ...(options.sendFor ? {sendFor: options.sendFor} : {}),
    ...(options.substrateFor ? {substrateFor: options.substrateFor} : {}),
  });
}

function liveReplicas(cluster) {
  return [...cluster.replicas.keys()].filter(
    (replicaId) => !cluster.isolated.has(replicaId));
}

function roleOf(cluster, replicaId) {
  return cluster.node(replicaId).readStatus().role;
}

function leaderOf(cluster) {
  return liveReplicas(cluster).find(
    (replicaId) => roleOf(cluster, replicaId) === LEADER_ROLE) ?? null;
}

function settleCluster(cluster, predicate, tickers = liveReplicas(cluster),
  rounds = SETTLE_ROUNDS) {
  cluster.tickers = tickers;
  return cluster.settle(predicate, {rounds});
}

function peerIdOf(cluster, holderReplicaId, targetReplicaId) {
  const map = new Map(
    [...reservedIdentities(cluster.replica(holderReplicaId).dbFile)]
      .map(([id, identity]) => [identity, id]),
  );
  return map.get(targetReplicaId) ?? cluster.raftPeerIdOf(targetReplicaId);
}

function appliedStateOf(cluster, replicaId) {
  return durableAppliedState(
    cluster.replica(replicaId).dbFile, cluster.partitionId);
}

function hardStateOf(cluster, replicaId) {
  return durableHardState(
    cluster.replica(replicaId).dbFile, cluster.partitionId);
}

function logOf(cluster, replicaId) {
  return durableLog(
    cluster.replica(replicaId).dbFile, cluster.partitionId);
}

function readLeaderBootstrapStamp(cluster, leaderReplicaId) {
  const answer = cluster.node(leaderReplicaId).readCommittedMembership({
    purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP,
  });
  assert.equal(answer.kind, COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
  return answer;
}

function addLearnerReplicaToCluster(cluster, leaderReplicaId, learnerReplicaId,
  stamp = readLeaderBootstrapStamp(cluster, leaderReplicaId)) {
  const hints = [...new Set([
    ...Object.values(stamp.identities),
    ...cluster.replicas.keys(),
    learnerReplicaId,
  ])];
  for (const existing of cluster.replicas.keys()) {
    reserveGroupPeerIdentity(
      {groupId: cluster.partitionId, localReplicaIdentity: existing},
      learnerReplicaId,
    );
  }
  return cluster.addReplica(learnerReplicaId, hints, {
    [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp,
  });
}

function admitLearnerAndSettle(cluster, leaderReplicaId, learnerReplicaId,
  operationId = `op-admit-${learnerReplicaId}`) {
  let lastAnswer = null;
  const isLearner = () => {
    const leader = leaderOf(cluster) ?? leaderReplicaId;
    const peerId = peerIdOf(cluster, leader, learnerReplicaId);
    return appliedStateOf(cluster, leader).learners.includes(peerId);
  };
  for (let attempt = 0; attempt < PROPOSAL_ATTEMPTS && !isLearner(); attempt += 1) {
    const leader = leaderOf(cluster) ?? leaderReplicaId;
    lastAnswer = turnChainValue(
      cluster.node(leader).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADMIT,
        operationId,
        replicaIdentity: learnerReplicaId,
        nodeId: `node-${learnerReplicaId}`,
      }),
    );
    cluster.settle(isLearner, {rounds: RETRY_ROUNDS});
  }
  assert.ok(settleCluster(cluster, isLearner),
    `learner ${learnerReplicaId} must be admitted into applied ConfState.learners`);
  return lastAnswer;
}

function catchUpLearnerAndSettle(cluster, leaderReplicaId, learnerReplicaId,
  operationId, requestKind = RAFT_CATCH_UP_REQUEST_KIND.GROWTH_PROMOTE) {
  let last = null;
  const settled = settleCluster(cluster, () => {
    const leader = leaderOf(cluster) ?? leaderReplicaId;
    last = turnChainValue(
      evaluateGroupLearnerCatchUp(cluster.node(leader), {
        operationId,
        replicaIdentity: learnerReplicaId,
        requestKind,
      }),
    );
    return last.reason === RAFT_FOUNDING_GROWTH_OUTCOME.CAUGHT_UP;
  });
  assert.ok(settled, `learner ${learnerReplicaId} must reach CAUGHT_UP`);
  return last;
}

function applyFoldSingleChange(state, step) {
  const id = String(step.nodeId);
  if (step.changeType === RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE) {
    if (!state.voters.includes(id)) state.voters.push(id);
    state.learners = state.learners.filter((item) => item !== id);
    return;
  }
  if (step.changeType === RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE) {
    const targetList = state.votersOutgoing.includes(id) ?
      state.learnersNext : state.learners;
    if (!targetList.includes(id)) targetList.push(id);
    state.voters = state.voters.filter((item) => item !== id);
    return;
  }
  if (step.changeType === RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE) {
    state.voters = state.voters.filter((item) => item !== id);
    state.votersOutgoing = state.votersOutgoing.filter((item) => item !== id);
    state.learners = state.learners.filter((item) => item !== id);
    state.learnersNext = state.learnersNext.filter((item) => item !== id);
  }
}

function applyFoldDecodedChanges(state, changes) {
  if (changes.length === 0 && state.votersOutgoing.length > 0) {
    state.votersOutgoing = [];
    if (state.learnersNext.length > 0) {
      state.learners = [...new Set([...state.learners, ...state.learnersNext])];
      state.learnersNext = [];
    }
    state.autoLeave = false;
    return;
  }
  if (changes.length > 1) {
    state.votersOutgoing = [...state.voters];
    for (const step of changes) {
      applyFoldSingleChange(state, step);
    }
    state.autoLeave = true;
    return;
  }
  if (changes.length === 1) {
    applyFoldSingleChange(state, changes[0]);
  }
}

function snapshotFoldState(state) {
  return {
    voters: [...state.voters],
    learners: [...state.learners],
    votersOutgoing: [...state.votersOutgoing],
    autoLeave: state.autoLeave,
  };
}

function foldJointAwareLog(dbFile, partitionId, genesisVoters) {
  const core = instantiateRaftRsCore();
  const state = {
    voters: [...genesisVoters].map(String),
    learners: [],
    votersOutgoing: [],
    learnersNext: [],
    autoLeave: false,
  };
  const byIndex = new Map([[0, snapshotFoldState(state)]]);
  for (const entry of durableLog(dbFile, partitionId)) {
    if (RAFT_RS_CONF_CHANGE_ENTRY_TYPES.includes(entry.entryType)) {
      const decoded = core.decode_conf_change_entry(entry.entryType, entry.data);
      applyFoldDecodedChanges(state, decoded.changes || []);
    }
    byIndex.set(entry.index, snapshotFoldState(state));
  }
  return byIndex;
}

export {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_REPLICA_ROLE,
  DELIVERED_TO_PEER,
  LEADER_ROLE,
  PARTICIPATION_GATE,
  RAFT_CATCH_UP_REQUEST_KIND,
  RAFT_EVENT,
  RAFT_FOUNDING_GROWTH_OUTCOME,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
  RAFT_RS_CONF_CHANGE_ENTRY_TYPES,
  RAFT_RS_CONF_CHANGE_TYPE,
  RaftRsDurableStore,
  addLearnerReplicaToCluster,
  admitGroupLearner,
  admitGroupPeer,
  admitLearnerAndSettle,
  appliedStateOf,
  catchUpLearnerAndSettle,
  computeBaseConfigurationDigest,
  createFoundingCluster,
  decideTypedConfChangeOperation,
  evaluateGroupLearnerCatchUp,
  evaluateTenureCatchUpOnDrain,
  executeTypedConfChangeOperation,
  foldJointAwareLog,
  hardStateOf,
  instantiateRaftRsCore,
  leaderOf,
  logOf,
  normalizedConfChange,
  peerIdOf,
  projectPeerRole,
  projectReplicaRole,
  proposeGroupGrowthPromote,
  proposeGroupRemoveLearner,
  proposeGroupReplacePromote,
  readCommittedMembershipView,
  readLeaderBootstrapStamp,
  reserveAndAdmitGroupLearner,
  resolveVoterTargetCount,
  restoreAppliedTerm,
  roleOf,
  settleCluster,
  snapshotAdmitsReplica,
  syncLeadershipTenure,
  turnChainValue,
  withdrawGroupPromotion,
};
