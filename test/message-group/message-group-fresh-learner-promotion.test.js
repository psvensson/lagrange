import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  RAFT_MEMBERSHIP_TRANSITION_REASON,
  RAFT_MEMBERSHIP_TRANSITION_STAGE,
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';

const GROUP = 'fresh-message-group-promotion';
const FOUNDERS = Object.freeze(['promotion-a', 'promotion-b', 'promotion-c']);
const TARGET = 'promotion-fresh-d';

function request(cluster, leader, stage, permitSequence, overrides = {}) {
  const leaderStatus = cluster.node(leader).readStatus();
  return {
    operationId: 'fresh-message-group-replace-r1',
    transitionIdentity: 'fresh-message-group-replace-r1-transition',
    permitSequence,
    stage,
    replicaIdentity: TARGET,
    peerAddress: cluster.addressOf(TARGET),
    replicaLifecycleIncarnation: leaderStatus.lifecycleIncarnation,
    runtimeGeneration: leaderStatus.runtimeGeneration,
    leaderTerm: leaderStatus.term,
    leaderConfigurationStamp: {
      configurationKey: leaderStatus.configurationKey,
      membershipGenerationIndex: leaderStatus.membershipGenerationIndex,
    },
    ...overrides,
  };
}

function propose(cluster, leader, transition) {
  return cluster.node(leader)[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](
    transition);
}

function targetObservation(status) {
  return {
    replicaIdentity: status.replicaIdentity,
    peerId: status.peerId,
    configurationKey: status.configurationKey,
    membershipGenerationIndex: status.membershipGenerationIndex,
    term: status.term,
    runtimeGeneration: status.runtimeGeneration,
    lifecycleIncarnation: status.lifecycleIncarnation,
  };
}

function formLearner(t) {
  const cluster = new PartitionNodeCluster({partitionId: GROUP,
    replicaIds: FOUNDERS});
  t.after(() => cluster.dispose());
  cluster.tickers = [...FOUNDERS];
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null), true);
  const leader = cluster.leaderReplicaId();
  cluster.addReplica(TARGET, FOUNDERS);

  const added = propose(cluster, leader, request(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, 1));
  assert.equal(added.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  const targetPeer = cluster.node(TARGET).readStatus().peerId;
  assert.equal(cluster.settle(() => {
    const target = cluster.node(TARGET).readStatus();
    const currentLeader = cluster.node(leader).readStatus();
    return target.confState.learners.includes(targetPeer) &&
      target.membershipGenerationIndex ===
        currentLeader.membershipGenerationIndex &&
      currentLeader.followerProgress[cluster.addressOf(TARGET)] >=
        currentLeader.commitIndex;
  }, {rounds: 400}), true);

  return {cluster, leader, targetPeer,
    observation: targetObservation(cluster.node(TARGET).readStatus())};
}

test('the leader atomically promotes only a caught-up learner observation ' +
  'from the target operation port', (t) => {
  const {cluster, leader, targetPeer, observation} = formLearner(t);
  const promoted = propose(cluster, leader, request(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE, 2,
    {targetStatusObservation: observation}));
  assert.equal(promoted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    JSON.stringify(promoted));
  assert.equal(promoted.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  assert.equal(cluster.settle(() => cluster.node(leader).readStatus()
    .confState.voters.includes(targetPeer), {rounds: 400}), true,
  'the accepted atomic turn commits ADD_NODE for the exact learner peer');
});

test('promotion refuses malformed, misbound, and stale target observations ' +
  'before native proposal', (t) => {
  const {cluster, leader, observation} = formLearner(t);
  const base = request(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE, 2);
  const cases = [
    [undefined, RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROOF_REQUIRED],
    [null, RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_INVALID],
    [{...observation, membershipGenerationIndex: null},
      RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_INVALID],
    [{...observation, replicaIdentity: 'address-shaped-alias'},
      RAFT_MEMBERSHIP_TRANSITION_REASON.IDENTITY_MISMATCH],
    [{...observation, peerId: '1'},
      RAFT_MEMBERSHIP_TRANSITION_REASON.IDENTITY_MISMATCH],
    [{...observation, term: observation.term + 1},
      RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_STALE],
    [{...observation, configurationKey: `${observation.configurationKey}|aba`},
      RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_STALE],
    [{...observation,
      membershipGenerationIndex: observation.membershipGenerationIndex + 1},
    RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_STALE],
  ];
  for (const [targetStatusObservation, reason] of cases) {
    const candidate = targetStatusObservation === undefined ? base :
      {...base, targetStatusObservation};
    assert.equal(propose(cluster, leader, candidate).reason, reason);
  }
  assert.equal(cluster.node(leader).readStatus().confState.voters
    .includes(observation.peerId), false);
});

test('a real target observation cannot override leader-owned native progress',
  (t) => {
    const {cluster, leader, observation} = formLearner(t);
    cluster.isolate(TARGET);
    const proposed = cluster.node(leader).propose({id: 'after-isolation'});
    assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(cluster.settle(() => cluster.node(leader).readStatus()
      .commitIndex > observation.membershipGenerationIndex), true);
    const refused = propose(cluster, leader, request(cluster, leader,
      RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE, 2,
      {targetStatusObservation: observation}));
    assert.equal(refused.reason,
      RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_BEHIND);
  });
