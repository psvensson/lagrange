// WP-R core witnesses W1-W5, W8, and negative controls N3-N4 for
// single-voter founding and odd-only growth on real rs-raft groups.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_REPLICA_ROLE,
  DELIVERED_TO_PEER,
  LEADER_ROLE,
  RAFT_CATCH_UP_REQUEST_KIND,
  RAFT_EVENT,
  RAFT_FOUNDING_GROWTH_OUTCOME,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
  RAFT_RS_CONF_CHANGE_ENTRY_TYPES,
  RAFT_RS_CONF_CHANGE_TYPE,
  addLearnerReplicaToCluster,
  admitGroupLearner,
  admitGroupPeer,
  admitLearnerAndSettle,
  appliedStateOf,
  catchUpLearnerAndSettle,
  computeBaseConfigurationDigest,
  createFoundingCluster,
  evaluateGroupLearnerCatchUp,
  hardStateOf,
  instantiateRaftRsCore,
  leaderOf,
  logOf,
  peerIdOf,
  projectPeerRole,
  projectReplicaRole,
  proposeGroupGrowthPromote,
  readCommittedMembershipView,
  readLeaderBootstrapStamp,
  reserveAndAdmitGroupLearner,
  resolveVoterTargetCount,
  roleOf,
  settleCluster,
  turnChainValue,
  withdrawGroupPromotion,
} from './founding-growth-test-support.js';

const SEED = 'seed-s';
const JOINER_1 = 'joiner-j1';
const JOINER_2 = 'joiner-j2';
const JOINER_3 = 'joiner-j3';
const ELECTION_TIMEOUT_ROUNDS = 120;

function electSoleFounder(cluster, seed = SEED) {
  assert.ok(
    settleCluster(cluster, () =>
      leaderOf(cluster) === seed &&
      appliedStateOf(cluster, seed).appliedIndex > 0, [seed]),
    'sole founder must campaign, lead, and apply its no-op entry',
  );
}

test('W1: 1-voter founding {s} -> learner ADMIT j1 & j2 -> caught-up ' +
  'GROWTH_PROMOTE [j1, j2] -> joint {s, j1, j2} && {s} -> auto-leave to ' +
  '{s, j1, j2} with writes committing throughout', () => {
  const cluster = createFoundingCluster([SEED]);
  try {
    assert.equal(resolveVoterTargetCount(3, 1), 1);
    assert.equal(resolveVoterTargetCount(3, 2), 1);
    assert.equal(resolveVoterTargetCount(3, 3), 3);
    assert.equal(resolveVoterTargetCount(5, 4), 3);
    assert.equal(resolveVoterTargetCount(5, 5), 5);

    electSoleFounder(cluster);
    const seedPeerId = cluster.raftPeerIdOf(SEED);
    assert.deepEqual(appliedStateOf(cluster, SEED).voters, [seedPeerId]);
    assert.deepEqual(appliedStateOf(cluster, SEED).learners, []);

    const seenMembershipOnSeed = [];
    cluster.node(SEED).subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, (evt) => {
      seenMembershipOnSeed.push(evt);
    });

    const beforeJ1Write = turnChainValue(cluster.node(SEED).propose('write-at-1'));
    assert.equal(beforeJ1Write.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);

    // Admit j1 as learner via reserveAndAdmitGroupLearner and repeat to witness
    // LEARNER_ADMITTED idempotence.
    const j1Stamp = readLeaderBootstrapStamp(cluster, SEED);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_1, j1Stamp);
    const admittedJ1 = reserveAndAdmitGroupLearner(
      cluster.node(SEED),
      {groupId: cluster.partitionId, localReplicaIdentity: SEED},
      {replicaIdentity: JOINER_1, nodeId: 'node-j1', operationId: 'op-add-j1'},
    );
    assert.equal(admittedJ1.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED);
    assert.equal(
      admittedJ1.proposal.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.LEARNER_PROPOSED,
    );
    const j1PeerId = peerIdOf(cluster, SEED, JOINER_1);
    assert.ok(settleCluster(cluster, () =>
      appliedStateOf(cluster, SEED).learners.includes(j1PeerId)));

    const repeatJ1 = admitGroupLearner(
      cluster.node(SEED),
      {groupId: cluster.partitionId, localReplicaIdentity: SEED},
      {replicaIdentity: JOINER_1, nodeId: 'node-j1', operationId: 'op-add-j1'},
    );
    assert.equal(
      repeatJ1.proposal.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.LEARNER_ADMITTED,
    );
    const repeatPeerJ1 = admitGroupPeer(
      cluster.node(SEED),
      {groupId: cluster.partitionId, localReplicaIdentity: SEED},
      {replicaIdentity: JOINER_1, nodeId: 'node-j1', asLearner: true},
    );
    assert.equal(
      repeatPeerJ1.outcome,
      RAFT_MEMBERSHIP_ADMISSION_OUTCOME.ALREADY_MEMBER,
    );
    const directSeedAdmit = turnChainValue(
      cluster.node(SEED).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADMIT,
        replicaIdentity: SEED,
        nodeId: 'node-s',
      }),
    );
    assert.equal(
      directSeedAdmit.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.ALREADY_VOTER,
    );

    const writeWith1Learner = turnChainValue(
      cluster.node(SEED).propose('write-with-1-learner'));
    assert.equal(writeWith1Learner.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);

    // Admit j2 as second learner ({s} + L{j1, j2}).
    const j2Stamp = readLeaderBootstrapStamp(cluster, SEED);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_2, j2Stamp);
    admitLearnerAndSettle(cluster, SEED, JOINER_2, 'op-add-j2');
    const j2PeerId = peerIdOf(cluster, SEED, JOINER_2);
    assert.deepEqual(
      [...appliedStateOf(cluster, SEED).learners].sort(),
      [j1PeerId, j2PeerId].sort(),
    );

    const j1ViewAsLearner = cluster.node(SEED).readCommittedMembership({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS,
      replicaIdentity: JOINER_1,
    });
    assert.equal(j1ViewAsLearner.role, COMMITTED_REPLICA_ROLE.LEARNER);
    assert.equal(j1ViewAsLearner.state, COMMITTED_REPLICA_ROLE.LEARNER);
    assert.equal(
      projectReplicaRole(j1ViewAsLearner, JOINER_1),
      COMMITTED_REPLICA_ROLE.LEARNER,
    );
    assert.equal(
      projectPeerRole(appliedStateOf(cluster, SEED), j1PeerId),
      COMMITTED_REPLICA_ROLE.LEARNER,
    );

    // Both learners catch up against fixed c0.
    catchUpLearnerAndSettle(cluster, SEED, JOINER_1, 'op-grow-1-3');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_2, 'op-grow-1-3');

    // Joint GROWTH_PROMOTE [j1, j2] -> enters joint {s, j1, j2} && {s} -> leaves to {s, j1, j2}.
    const baseDigest = computeBaseConfigurationDigest([seedPeerId]);
    const promoted = turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-grow-1-3',
        replicaIdentities: [JOINER_1, JOINER_2],
        baseConfigurationDigest: baseDigest,
      }),
    );
    assert.equal(promoted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(
      promoted.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED,
    );

    assert.ok(
      settleCluster(cluster, () => {
        const applied = appliedStateOf(cluster, SEED);
        return applied.voters.length === 3 &&
          applied.votersOutgoing.length === 0 &&
          applied.learners.length === 0 &&
          cluster.node(JOINER_1).readStatus().gateOpen === true &&
          cluster.node(JOINER_2).readStatus().gateOpen === true;
      }),
      'joint promotion and core auto-leave must settle to 3 voters {s, j1, j2}',
    );

    assert.ok(
      seenMembershipOnSeed.some(
        (evt) => (evt.confState.votersOutgoing || []).length === 1 &&
          evt.confState.voters.length === 3,
      ),
      'MEMBERSHIP_CHANGED must observe the joint configuration {s, j1, j2} && {s}',
    );
    assert.ok(
      seenMembershipOnSeed.some(
        (evt) => (evt.confState.votersOutgoing || []).length === 0 &&
          evt.confState.voters.length === 3 &&
          evt.role === COMMITTED_REPLICA_ROLE.VOTER,
      ),
      'MEMBERSHIP_CHANGED must observe the final configuration {s, j1, j2}',
    );

    const afterGrowthWrite = turnChainValue(
      cluster.node(leaderOf(cluster)).propose('write-at-3-voters'));
    assert.equal(afterGrowthWrite.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    const j1ViewAfter = readCommittedMembershipView(
      cluster.node(SEED).readCommittedMembership({
        purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS,
      }),
      {replicaIdentity: JOINER_1},
    );
    assert.equal(j1ViewAfter.role, COMMITTED_REPLICA_ROLE.VOTER);
  } finally {
    cluster.dispose();
  }
});

test('W2 & N4: GROWTH_PROMOTE of 1 learner from {s} is refused ' +
  'PROMOTION_WOULD_BE_EVEN; multi-change {AddNode t, RemoveNode s} (J1) ' +
  'and invalid multi-change shapes are refused MULTI_CHANGE_SHAPE_REFUSED',
() => {
  const cluster = createFoundingCluster([SEED]);
  try {
    electSoleFounder(cluster);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_1);
    admitLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w2-admit-j1');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w2-even');

    const logBefore = logOf(cluster, SEED).length;
    const evenRefused = turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-w2-even',
        replicaIdentities: [JOINER_1],
      }),
    );
    assert.equal(evenRefused.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(
      evenRefused.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.PROMOTION_WOULD_BE_EVEN,
    );
    assert.equal(
      logOf(cluster, SEED).length,
      logBefore,
      'refused even promotion must append no log entry',
    );

    // J1 shape {AddNode j1, RemoveNode s} via raw changes is refused MULTI_CHANGE_SHAPE_REFUSED.
    const j1PeerId = peerIdOf(cluster, SEED, JOINER_1);
    const seedPeerId = cluster.raftPeerIdOf(SEED);
    const j1Refused = turnChainValue(
      cluster.node(SEED).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.GROWTH_PROMOTE,
        operationId: 'op-w2-j1-shape',
        changes: [
          {changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE, nodeId: j1PeerId},
          {changeType: RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE, nodeId: seedPeerId},
        ],
      }),
    );
    assert.equal(j1Refused.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(
      j1Refused.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.MULTI_CHANGE_SHAPE_REFUSED,
    );

    // > 2 targets in GROWTH_PROMOTE is refused MULTI_CHANGE_SHAPE_REFUSED.
    addLearnerReplicaToCluster(cluster, SEED, JOINER_2);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_3);
    admitLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w2-admit-j2');
    admitLearnerAndSettle(cluster, SEED, JOINER_3, 'op-w2-admit-j3');
    const threeTargetsRefused = turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-w2-three',
        replicaIdentities: [JOINER_1, JOINER_2, JOINER_3],
      }),
    );
    assert.equal(threeTargetsRefused.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(
      threeTargetsRefused.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.MULTI_CHANGE_SHAPE_REFUSED,
    );
    assert.deepEqual(appliedStateOf(cluster, SEED).voters, [seedPeerId]);
  } finally {
    cluster.dispose();
  }
});

test('W3: j2 killed before GROWTH_PROMOTE is refused PROMOTION_PROGRESS_BEHIND ' +
  'and withdrawn; j2 killed after enter-joint commits still allows auto-leave ' +
  'to commit with s + j1', () => {
  const cluster = createFoundingCluster([SEED]);
  try {
    electSoleFounder(cluster);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_1);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_2);
    admitLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w3-admit-1');
    admitLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w3-admit-2');

    // Isolate j2 before new writes so j2 lags behind c0 for op-w3-behind.
    cluster.isolate(JOINER_2);
    const write = turnChainValue(cluster.node(SEED).propose('w3-ahead-of-j2'));
    assert.equal(write.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    catchUpLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w3-behind');

    const behind = turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-w3-behind',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    assert.equal(behind.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(
      behind.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.PROMOTION_PROGRESS_BEHIND,
    );

    const withdrawn = turnChainValue(
      withdrawGroupPromotion(cluster.node(SEED), {
        operationId: 'op-w3-behind',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    assert.equal(withdrawn.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(withdrawn.reason, RAFT_FOUNDING_GROWTH_OUTCOME.WITHDRAWN);

    // Reconnect j2 and verify tombstone fences op-w3-behind with OPERATION_WITHDRAWING.
    cluster.isolated.delete(JOINER_2);
    catchUpLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w3-live');
    const fenced = turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-w3-behind',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    assert.equal(fenced.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(
      fenced.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.OPERATION_WITHDRAWING,
    );

    // Now propose a fresh operation op-w3-live, and isolate j2 as soon as the
    // enter-joint entry commits on the leader; s + j1 still form an incoming
    // quorum {s, j1} of {s, j1, j2} and outgoing quorum {s}, so auto-leave commits!
    catchUpLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w3-live');
    const proposed = turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-w3-live',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    assert.equal(
      proposed.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED,
    );
    cluster.isolate(JOINER_2);
    assert.ok(
      settleCluster(cluster, () => {
        const applied = appliedStateOf(cluster, SEED);
        return applied.voters.length === 3 &&
          applied.votersOutgoing.length === 0;
      }, [SEED, JOINER_1]),
      's + j1 must commit the enter-joint and the auto-leave even with j2 dead',
    );
  } finally {
    cluster.dispose();
  }
});

test('W4: both joiners j1 & j2 isolated after enter-joint is proposed: no ' +
  'commit while both are down, and when one joiner returns the auto-leave ' +
  'commits and {s, j1, j2} resumes', () => {
  const cluster = createFoundingCluster([SEED]);
  try {
    electSoleFounder(cluster);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_1);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_2);
    admitLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w4-1');
    admitLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w4-2');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w4-grow');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w4-grow');

    // Isolate both joiners right before proposing GROWTH_PROMOTE: the
    // enter-joint entry commits under {s} and enters joint {s, j1, j2} && {s},
    // where neither the auto-leave entry nor a write can commit while both
    // joiners are down.
    cluster.isolate(JOINER_1);
    cluster.isolate(JOINER_2);
    const proposed = turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-w4-grow',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    assert.equal(
      proposed.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED,
    );
    const appliedInJoint = appliedStateOf(cluster, SEED);
    assert.equal(appliedInJoint.voters.length, 3);
    assert.equal(
      appliedInJoint.votersOutgoing.length,
      1,
      'auto-leave cannot commit without at least one joiner in {s, j1, j2}',
    );
    const appliedIndexBeforeWrite = appliedInJoint.appliedIndex;
    turnChainValue(cluster.node(SEED).propose('write-held-in-joint'));
    cluster.deliverAll();
    assert.equal(
      appliedStateOf(cluster, SEED).appliedIndex,
      appliedIndexBeforeWrite,
      'no write can commit while both joiners are isolated in joint',
    );

    // Reconnect j1 alone: s + j1 form a majority of {s, j1, j2} and s is {s}.
    cluster.isolated.delete(JOINER_1);
    assert.ok(
      settleCluster(cluster, () => {
        const applied = appliedStateOf(cluster, SEED);
        return applied.voters.length === 3 &&
          applied.votersOutgoing.length === 0 &&
          applied.appliedIndex > appliedIndexBeforeWrite;
      }, [SEED, JOINER_1]),
      'once j1 returns, auto-leave and pending write commit with s + j1',
    );
  } finally {
    cluster.dispose();
  }
});

test('W5: core auto-leave completes across leader restart in the joint ' +
  'configuration; if the seed is lost inside the joint {s, j1, j2} && {s}, ' +
  'the joiners alone cannot elect a leader', () => {
  const cluster = createFoundingCluster([SEED]);
  try {
    electSoleFounder(cluster);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_1);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_2);
    admitLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w5-1');
    admitLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w5-2');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w5-grow');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w5-grow');

    const proposed = turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-w5-grow',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    assert.equal(
      proposed.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED,
    );

    // Deliver until j1 and j2 have applied the enter-joint {s, j1, j2} && {s}
    // (or restart seed mid-transition) and verify that if seed is isolated
    // while in joint, j1 and j2 cannot elect a leader without {s}.
    // Wait until the enter-joint is applied on SEED.
    assert.ok(
      settleCluster(cluster, () =>
        appliedStateOf(cluster, SEED).voters.length === 3),
    );
    // Restart SEED and verify the group settles out of joint with no host leave driver.
    cluster.restart(SEED);
    assert.ok(
      settleCluster(cluster, () => {
        const leader = leaderOf(cluster);
        if (leader === null) return false;
        const applied = appliedStateOf(cluster, leader);
        return applied.voters.length === 3 &&
          applied.votersOutgoing.length === 0;
      }),
      'auto-leave completes across leader restart with no host leave re-driver',
    );
  } finally {
    cluster.dispose();
  }

  // Second part of W5: seed lost inside the joint {s, j1, j2} && {s} before
  // auto-leave commits -> joiners j1, j2 cannot elect a leader because {s} is
  // the outgoing quorum.
  let freezeAfterJoint = false;
  let jointCluster = null;
  jointCluster = createFoundingCluster([SEED], {
    sendFor: (fromReplicaId, address, packet) => {
      if (!freezeAfterJoint) return undefined;
      const entries = packet.message?.entries || [];
      // Drop the empty auto-leave entry so j1 and j2 stay in joint {s, j1, j2} && {s}.
      if (entries.some((e) =>
        RAFT_RS_CONF_CHANGE_ENTRY_TYPES.includes(e.entryType) &&
        jointCluster.raftPeerIdOf(SEED) &&
        logOf(jointCluster, SEED).find((le) => le.index === Number(e.index)) &&
        Number(e.index) > jointCluster.enterJointIndex)) {
        return DELIVERED_TO_PEER;
      }
      return undefined;
    },
  });
  try {
    electSoleFounder(jointCluster);
    addLearnerReplicaToCluster(jointCluster, SEED, JOINER_1);
    addLearnerReplicaToCluster(jointCluster, SEED, JOINER_2);
    admitLearnerAndSettle(jointCluster, SEED, JOINER_1, 'op-w5b-1');
    admitLearnerAndSettle(jointCluster, SEED, JOINER_2, 'op-w5b-2');
    catchUpLearnerAndSettle(jointCluster, SEED, JOINER_1, 'op-w5b-grow');
    catchUpLearnerAndSettle(jointCluster, SEED, JOINER_2, 'op-w5b-grow');

    jointCluster.enterJointIndex = logOf(jointCluster, SEED).at(-1).index + 1;
    freezeAfterJoint = true;
    turnChainValue(
      proposeGroupGrowthPromote(jointCluster.node(SEED), {
        operationId: 'op-w5b-grow',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    assert.ok(
      settleCluster(jointCluster, () =>
        appliedStateOf(jointCluster, JOINER_1).votersOutgoing.length === 1 &&
        appliedStateOf(jointCluster, JOINER_2).votersOutgoing.length === 1),
      'j1 and j2 apply the enter-joint configuration {s, j1, j2} && {s}',
    );

    // Isolate SEED while j1 and j2 are in the joint configuration.
    jointCluster.isolate(SEED);
    for (let round = 0; round < ELECTION_TIMEOUT_ROUNDS; round += 1) {
      jointCluster.node(JOINER_1).tick();
      jointCluster.node(JOINER_2).tick();
      jointCluster.deliverAll();
      assert.notEqual(roleOf(jointCluster, JOINER_1), LEADER_ROLE);
      assert.notEqual(roleOf(jointCluster, JOINER_2), LEADER_ROLE);
    }
  } finally {
    jointCluster.dispose();
  }
});

test('W8 & N3: neither the enter-joint nor the auto-leave entry carries a ' +
  'context, and a multi-change ConfChangeV2 with non-empty context is refused',
() => {
  const cluster = createFoundingCluster([SEED]);
  try {
    electSoleFounder(cluster);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_1);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_2);
    admitLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w8-1');
    admitLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w8-2');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w8-grow');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w8-grow');

    const j1PeerId = peerIdOf(cluster, SEED, JOINER_1);
    const j2PeerId = peerIdOf(cluster, SEED, JOINER_2);

    // Negative control N3: a multi-change ConfChangeV2 with non-empty context is refused.
    const withContextRefused = turnChainValue(
      cluster.node(SEED).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.GROWTH_PROMOTE,
        operationId: 'op-w8-bad-ctx',
        replicaIdentities: [JOINER_1, JOINER_2],
        context: 'non-empty-context',
      }),
    );
    assert.equal(withContextRefused.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(
      withContextRefused.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.MULTI_CHANGE_SHAPE_REFUSED,
    );

    const beforeIndex = logOf(cluster, SEED).at(-1).index;
    const promoted = turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-w8-grow',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    assert.equal(
      promoted.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED,
    );
    assert.ok(
      settleCluster(cluster, () => {
        const applied = appliedStateOf(cluster, SEED);
        return applied.voters.length === 3 &&
          applied.votersOutgoing.length === 0;
      }),
    );

    const confEntries = logOf(cluster, SEED).filter(
      (entry) => entry.index > beforeIndex &&
        RAFT_RS_CONF_CHANGE_ENTRY_TYPES.includes(entry.entryType),
    );
    assert.equal(
      confEntries.length,
      2,
      'must record the enter-joint entry and the core auto-leave entry',
    );
    const core = instantiateRaftRsCore();
    for (const entry of confEntries) {
      const decoded = core.decode_conf_change_entry(entry.entryType, entry.data);
      assert.equal(
        decoded.context?.length ?? 0,
        0,
        `conf-change entry at index ${entry.index} must have empty context`,
      );
    }
    assert.deepEqual(
      [...appliedStateOf(cluster, SEED).voters].sort(),
      [cluster.raftPeerIdOf(SEED), j1PeerId, j2PeerId].sort(),
    );
    assert.ok(hardStateOf(cluster, SEED).term >= 1);
    assert.equal(
      evaluateGroupLearnerCatchUp(cluster.node(SEED), {
        operationId: 'op-w8-after',
        replicaIdentity: JOINER_1,
        requestKind: RAFT_CATCH_UP_REQUEST_KIND.GROWTH_PROMOTE,
      }).result.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEARNER,
    );
  } finally {
    cluster.dispose();
  }
});
