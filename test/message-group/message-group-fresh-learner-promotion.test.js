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
import {proposeMembershipTransition} from
  '../../src/raft/raft-rs-membership-transition-runtime.js';

const GROUP = 'fresh-message-group-promotion';
const FOUNDERS = Object.freeze(['promotion-a', 'promotion-b', 'promotion-c']);
const TARGET = 'promotion-fresh-d';

function nativePromotionAttempt({progress, commit = 12, term = 7}) {
  const command = {operationId: 'native-progress',
    transitionIdentity: 'native-progress-transition', permitSequence: 2,
    stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE, stageOrdinal: 2,
    replicaIdentity: TARGET, peerId: 4, peerAddress: 'target-address',
    replicaLifecycleIncarnation: 'lifecycle', expectedRuntimeGeneration: 3,
    expectedLeaderTerm: 7,
    expectedConfigurationKey: '[["1"],[],["4"],[],false]',
    expectedMembershipGenerationIndex: 9,
    targetStatusObservation: {replicaIdentity: TARGET, peerId: 4,
      configurationKey: '[["1"],[],["4"],[],false]',
      membershipGenerationIndex: 9, term: 7,
      runtimeGeneration: 3, lifecycleIncarnation: 'target-lifecycle'},
    change: {changes: []}};
  const status = {raftState: 2, term, commit, applied: commit,
    pendingConfIndex: 0, progress};
  const after = {...status, pendingConfIndex: Number(commit) + 1};
  const group = {lifecycleIncarnation: 'lifecycle',
    membershipGenerationKnown: true, membershipGenerationIndex: 9,
    membershipTransitionFence: null,
    resolvePeerAddress: () => 'target-address'};
  let statusReads = 0;
  let proposals = 0;
  const result = proposeMembershipTransition({group, expectedGeneration: 3,
    runtimeGeneration: 3, command, leaderReplicaIdOf: () => 'leader',
    invokeCoreAt: (_group, _generation, operation) => {
      if (operation === 'status') {
        return {ok: true, value: statusReads++ === 0 ? status : after};
      }
      if (operation === 'conf_state') {
        return {ok: true, value: {voters: [1], votersOutgoing: [],
          learners: [4], learnersNext: []}};
      }
      proposals += 1;
      return {ok: true};
    },
    drainReady: () => ({outcome: RAFT_OPERATION_OUTCOME.CORE_OK}),
    thenMaybe: (value, callback) => callback(value),
  });
  return {result, proposals};
}

function nativeProgressRefusal(progress, commit = 12) {
  return nativePromotionAttempt({progress, commit}).result;
}

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
    [{...observation, membershipGenerationIndex: -0},
      RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_INVALID],
    [{...observation, unexpected: true},
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

  let reads = 0;
  const accessor = {...observation};
  Object.defineProperty(accessor, 'membershipGenerationIndex', {
    enumerable: true,
    get() {
      reads += 1;
      return observation.membershipGenerationIndex;
    },
  });
  assert.equal(propose(cluster, leader, {...base,
    targetStatusObservation: accessor}).reason,
  RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_INVALID);
  assert.equal(reads, 0, 'accessor evidence is rejected without invocation');

  const inherited = Object.create({replicaIdentity:
    observation.replicaIdentity});
  Object.assign(inherited, observation);
  delete inherited.replicaIdentity;
  assert.equal(propose(cluster, leader, {...base,
    targetStatusObservation: inherited}).reason,
  RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_INVALID);

  const proxy = new Proxy({...observation}, {});
  assert.equal(propose(cluster, leader, {...base,
    targetStatusObservation: proxy}).reason,
  RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_INVALID);

  let enclosingReads = 0;
  const enclosingAccessor = {...base};
  Object.defineProperty(enclosingAccessor, 'targetStatusObservation', {
    enumerable: true,
    get() {
      enclosingReads += 1;
      return observation;
    },
  });
  assert.equal(propose(cluster, leader, enclosingAccessor).reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_INVALID);
  assert.equal(enclosingReads, 0,
    'the enclosing observation getter is never invoked');

  const originalDescriptorReader = Object.getOwnPropertyDescriptor;
  const originalOwnKeys = Reflect.ownKeys;
  try {
    Object.getOwnPropertyDescriptor = () => ({value: observation,
      enumerable: true});
    Reflect.ownKeys = () => [];
    assert.equal(propose(cluster, leader, {...base,
      targetStatusObservation: proxy}).reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.TARGET_OBSERVATION_INVALID);
  } finally {
    Object.getOwnPropertyDescriptor = originalDescriptorReader;
    Reflect.ownKeys = originalOwnKeys;
  }
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

test('promotion refuses missing, zero, and noncanonical native progress', () => {
  assert.equal(nativeProgressRefusal([]).reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_UNAVAILABLE);
  assert.equal(nativeProgressRefusal([{id: 4, matched: 0}]).reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_BEHIND);
  assert.equal(nativeProgressRefusal([{id: 4, matched: '01'}]).reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_UNAVAILABLE);
  assert.equal(nativeProgressRefusal([{id: 4, matched: 12}], -0).reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_UNAVAILABLE);
  let coercions = 0;
  const mutable = {[Symbol.toPrimitive]() {
    coercions += 1;
    return 12;
  }};
  assert.equal(nativeProgressRefusal([{id: 4, matched: mutable}]).reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_UNAVAILABLE);
  assert.equal(coercions, 0, 'mutable native progress is never coerced');
});

test('promotion refuses a synthetic native zero commit and match', () => {
  const attempt = nativePromotionAttempt({
    commit: 0,
    progress: [{id: 4, matched: 0}],
  });
  assert.equal(attempt.result.reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_UNAVAILABLE);
  assert.equal(attempt.proposals, 0);
});

test('promotion reads one canonical native term without coercion', () => {
  let reads = 0;
  const mutableTerm = {[Symbol.toPrimitive]() {
    reads += 1;
    return reads === 1 ? 7 : 8;
  }};
  const attempt = nativePromotionAttempt({
    progress: [{id: 4, matched: 12}],
    term: mutableTerm,
  });
  assert.equal(attempt.result.reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_LEADERSHIP);
  assert.equal(attempt.proposals, 0);
  assert.equal(reads, 0, 'native term is type-pinned before comparison');
});

test('promotion matches an exact native peer without mutable intrinsics', () => {
  let coercions = 0;
  const wrongPeer = {[Symbol.toPrimitive]() {
    coercions += 1;
    return 4;
  }};
  let attempt = nativePromotionAttempt({
    progress: [{id: wrongPeer, matched: 12}],
  });
  assert.equal(attempt.result.reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_UNAVAILABLE);
  assert.equal(attempt.proposals, 0);
  assert.equal(coercions, 0, 'native peer identity is never coerced');

  const originalString = globalThis.String;
  const originalFind = Object.getOwnPropertyDescriptor(
    Array.prototype, 'find');
  try {
    globalThis.String = (value) => value === 999 ? '4' : originalString(value);
    Reflect.defineProperty(Array.prototype, 'find', {...originalFind,
      value() {
        return this[0];
      }});
    attempt = nativePromotionAttempt({
      progress: [{id: 999, matched: 12}],
    });
    assert.equal(attempt.result.reason,
      RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROGRESS_UNAVAILABLE);
    assert.equal(attempt.proposals, 0);
  } finally {
    globalThis.String = originalString;
    Reflect.defineProperty(Array.prototype, 'find', originalFind);
  }
});
