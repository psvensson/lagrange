// WP-R lifecycle witnesses W6, W7, W9-W17, W-FOLD-JOINT, and negative
// controls N2, N8, N9, N11 on real rs-raft groups.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND, COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL, COMMITTED_REPLICA_ROLE, DELIVERED_TO_PEER,
  LEADER_ROLE, PARTICIPATION_GATE, RAFT_CATCH_UP_REQUEST_KIND, RAFT_EVENT,
  RAFT_FOUNDING_GROWTH_OUTCOME, RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION, RAFT_OPERATION_OUTCOME, RaftRsDurableStore,
  addLearnerReplicaToCluster, admitLearnerAndSettle, appliedStateOf,
  catchUpLearnerAndSettle, createFoundingCluster,
  decideTypedConfChangeOperation, evaluateGroupLearnerCatchUp,
  evaluateTenureCatchUpOnDrain, executeTypedConfChangeOperation,
  foldJointAwareLog, hardStateOf, leaderOf, normalizedConfChange,
  proposeGroupGrowthPromote, proposeGroupRemoveLearner,
  proposeGroupReplacePromote, restoreAppliedTerm, roleOf, settleCluster,
  snapshotAdmitsReplica, syncLeadershipTenure, turnChainValue,
  withdrawGroupPromotion,
} from './founding-growth-test-support.js';
import {pruneCompactedStatementOutcomeEffectsIn} from
  '../../../src/partition/partition-mirror-effect-retention.js';

const SEED = 'seed-s';
const JOINER_1 = 'joiner-j1';
const JOINER_2 = 'joiner-j2';
const JOINER_3 = 'joiner-j3';
const TARGET_T = 'target-t';

function electSoleFounder(cluster, seed = SEED) {
  assert.ok(
    settleCluster(cluster, () =>
      leaderOf(cluster) === seed &&
      appliedStateOf(cluster, seed).appliedIndex > 0, [seed]),
    'sole founder must campaign, lead, and apply its no-op entry',
  );
}

function growSeedToThreeVoters(cluster) {
  electSoleFounder(cluster, SEED);
  addLearnerReplicaToCluster(cluster, SEED, JOINER_1);
  addLearnerReplicaToCluster(cluster, SEED, JOINER_2);
  admitLearnerAndSettle(cluster, SEED, JOINER_1, 'op-grow-admit-1');
  admitLearnerAndSettle(cluster, SEED, JOINER_2, 'op-grow-admit-2');
  catchUpLearnerAndSettle(cluster, SEED, JOINER_1, 'op-grow-1-3');
  catchUpLearnerAndSettle(cluster, SEED, JOINER_2, 'op-grow-1-3');
  const promoted = turnChainValue(
    proposeGroupGrowthPromote(cluster.node(SEED), {
      operationId: 'op-grow-1-3',
      replicaIdentities: [JOINER_1, JOINER_2],
    }),
  );
  assert.equal(promoted.reason, RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED);
  assert.ok(
    settleCluster(cluster, () => {
      const applied = appliedStateOf(cluster, SEED);
      return applied.voters.length === 3 &&
        applied.votersOutgoing.length === 0 &&
        cluster.node(JOINER_1).readStatus().gateOpen === true &&
        cluster.node(JOINER_2).readStatus().gateOpen === true;
    }),
  );
}

function installSnapshotFromLeader(cluster, leaderId, targetId, compact = false) {
  const leaderStore = new RaftRsDurableStore(cluster.replica(leaderId).db);
  const record = leaderStore.readDurableRecord(cluster.partitionId);
  const snapIdx = String(record.appliedIndex);
  const snapTerm = String(restoreAppliedTerm(record));
  if (compact) {
    leaderStore.compactCommittedPrefix(cluster.partitionId, {
      toIndex: Number(snapIdx),
    }, pruneCompactedStatementOutcomeEffectsIn);
    cluster.isolated.delete(targetId);
    for (let round = 0; round < 20; round += 1) {
      cluster.node(leaderId).tick();
      cluster.deliverAll();
    }
  }
  const targetDb = cluster.replica(targetId).db;
  const targetStore = new RaftRsDurableStore(targetDb);
  targetStore.transaction(() => {
    targetDb.prepare(
      'DELETE FROM _raft_rs_log WHERE group_id = ? AND log_index <= ?',
    ).run(cluster.partitionId, Number(snapIdx));
    targetStore.putAppliedState(cluster.partitionId, snapIdx, record.confState,
      undefined, String(record.membershipGenerationIndex));
    targetStore.putHardState(cluster.partitionId, {
      term: snapTerm, vote: '0', commit: snapIdx,
    });
    targetStore.putSnapshot(cluster.partitionId, {
      metadata: {
        index: snapIdx, term: snapTerm, confState: record.confState,
        membershipGenerationIndex: String(record.membershipGenerationIndex),
      },
    });
  });
}

test('W6: a learner caught up by snapshot install is promoted, and its role ' +
  'projection, MEMBERSHIP_CHANGED, and GATE_OPENED fire on restore', () => {
  const cluster = createFoundingCluster([SEED]);
  try {
    assert.equal(typeof decideTypedConfChangeOperation, 'function');
    assert.equal(typeof evaluateTenureCatchUpOnDrain, 'function');
    assert.equal(typeof executeTypedConfChangeOperation, 'function');
    assert.equal(typeof normalizedConfChange, 'function');
    assert.equal(typeof syncLeadershipTenure, 'function');
    assert.equal(typeof restoreAppliedTerm, 'function');
    assert.equal(typeof snapshotAdmitsReplica, 'function');

    electSoleFounder(cluster);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_1);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_2);
    admitLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w6-1');
    admitLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w6-2');

    cluster.isolate(JOINER_2);
    for (let i = 1; i <= 5; i += 1) {
      assert.equal(
        turnChainValue(cluster.node(SEED).propose(`w6-entry-${i}`)).outcome,
        RAFT_OPERATION_OUTCOME.CORE_OK,
      );
    }
    catchUpLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w6-grow');

    installSnapshotFromLeader(cluster, SEED, JOINER_2, true);
    cluster.restart(JOINER_2);
    const j2MembershipEvents = [];
    cluster.node(JOINER_2).subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, (evt) => {
      j2MembershipEvents.push(evt);
    });
    turnChainValue(cluster.node(JOINER_2).tick());
    cluster.deliverAll();
    assert.ok(
      j2MembershipEvents.some((evt) => evt.role === COMMITTED_REPLICA_ROLE.LEARNER),
      'snapshot restore as learner must emit MEMBERSHIP_CHANGED with role=LEARNER',
    );
    assert.equal(cluster.node(JOINER_2).readStatus().memberRole, COMMITTED_REPLICA_ROLE.LEARNER);

    assert.equal(
      turnChainValue(cluster.node(SEED).propose('w6-post-snapshot-entry')).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK,
    );
    catchUpLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w6-grow');
    cluster.isolate(JOINER_2);
    const promoted = turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-w6-grow',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    assert.equal(promoted.reason, RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED);
    assert.ok(
      settleCluster(cluster, () =>
        appliedStateOf(cluster, SEED).voters.length === 3 &&
        appliedStateOf(cluster, SEED).votersOutgoing.length === 0,
      [SEED, JOINER_1]),
    );

    installSnapshotFromLeader(cluster, SEED, JOINER_2, false);
    cluster.restart(JOINER_2);
    const j2GateOpened = [];
    cluster.node(JOINER_2).subscribe(RAFT_EVENT.GATE_OPENED, (evt) => {
      j2GateOpened.push(evt);
    });
    cluster.node(JOINER_2).subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, (evt) => {
      j2MembershipEvents.push(evt);
    });
    turnChainValue(cluster.node(JOINER_2).tick());
    assert.equal(cluster.node(JOINER_2).readStatus().gateOpen, true);
    assert.equal(cluster.node(JOINER_2).readStatus().memberRole, COMMITTED_REPLICA_ROLE.VOTER);
    assert.ok(j2GateOpened.length > 0, 'GATE_OPENED must fire on voter snapshot restore');
    assert.ok(
      j2MembershipEvents.some((evt) => evt.role === COMMITTED_REPLICA_ROLE.VOTER),
      'MEMBERSHIP_CHANGED with role=VOTER must fire on voter snapshot restore',
    );
  } finally {
    cluster.dispose();
  }
});

test('W7 & N8: catch-up under steady seed-local write load with link delay ' +
  'passes with fixed c0, whereas per-drain reference re-sampling (N8) starves; ' +
  'c0 is keyed by (operationId, peerId, requestKind) and resets on term change',
() => {
  let delayJ1Responses = false;
  const delayedQueue = [];
  let cluster = null;
  cluster = createFoundingCluster([SEED], {
    sendFor: (fromReplicaId, address, packet) => {
      if (delayJ1Responses && fromReplicaId === JOINER_1) {
        delayedQueue.push({address, packet});
        return DELIVERED_TO_PEER;
      }
      return undefined;
    },
  });
  try {
    electSoleFounder(cluster);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_1);
    admitLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w7-admit');

    // Isolate j1 while proposing a write so j1 is initially behind fixedC0.
    cluster.isolate(JOINER_1);
    turnChainValue(cluster.node(SEED).propose('w7-entry-at-c0'));
    const firstFixed = turnChainValue(
      evaluateGroupLearnerCatchUp(cluster.node(SEED), {
        operationId: 'op-w7-promote',
        replicaIdentity: JOINER_1,
        requestKind: RAFT_CATCH_UP_REQUEST_KIND.GROWTH_PROMOTE,
      }),
    );
    assert.equal(firstFixed.reason, RAFT_FOUNDING_GROWTH_OUTCOME.CATCH_UP_PENDING);
    const fixedC0 = firstFixed.referenceIndex;
    assert.ok(fixedC0 >= 2);

    // Let j1 catch up to fixedC0 (Progress[j1].state == Replicate, matched == fixedC0).
    cluster.isolated.delete(JOINER_1);
    assert.ok(
      settleCluster(cluster, () =>
        appliedStateOf(cluster, JOINER_1).appliedIndex >= fixedC0),
    );
    for (let round = 0; round < 5; round += 1) {
      cluster.node(SEED).tick();
      cluster.deliverAll();
    }

    // Now enable link delay on j1's responses and propose steady new writes on
    // SEED so SEED's lastIndex > j1.matched >= fixedC0.
    delayJ1Responses = true;
    turnChainValue(cluster.node(SEED).propose('w7-steady-write-1'));
    turnChainValue(cluster.node(SEED).propose('w7-steady-write-2'));

    // Negative control N8: re-sampling c0 per drain sees matched < new lastIndex and starves!
    const movingTarget = turnChainValue(
      evaluateGroupLearnerCatchUp(cluster.node(SEED), {
        operationId: 'op-w7-moving-n8',
        replicaIdentity: JOINER_1,
        requestKind: RAFT_CATCH_UP_REQUEST_KIND.GROWTH_PROMOTE,
        perDrainReference: true,
      }),
    );
    assert.equal(
      movingTarget.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.CATCH_UP_PENDING,
      'N8: per-drain re-sampling of c0 must fail to catch up under steady write load',
    );

    // Fixed c0 succeeds because matched >= fixedC0 and state == Replicate!
    const caughtUpFixed = turnChainValue(
      evaluateGroupLearnerCatchUp(cluster.node(SEED), {
        operationId: 'op-w7-promote',
        replicaIdentity: JOINER_1,
        requestKind: RAFT_CATCH_UP_REQUEST_KIND.GROWTH_PROMOTE,
      }),
    );
    assert.equal(
      caughtUpFixed.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.CAUGHT_UP,
      'W7: fixed-reference c0 must evaluate to CAUGHT_UP even when newer writes are in flight',
    );
    assert.equal(caughtUpFixed.referenceIndex, fixedC0);

    // Keyed by (operationId, peerId, requestKind): a REPLACE_PROMOTE evaluation
    // for the same operationId and peerId records its own fresh c0 (> fixedC0),
    // never inheriting GROWTH_PROMOTE's c0.
    const replaceEval = turnChainValue(
      evaluateGroupLearnerCatchUp(cluster.node(SEED), {
        operationId: 'op-w7-promote',
        replicaIdentity: JOINER_1,
        requestKind: RAFT_CATCH_UP_REQUEST_KIND.REPLACE_PROMOTE,
      }),
    );
    assert.ok(
      replaceEval.referenceIndex > fixedC0,
      'different requestKind must record its own fresh c0',
    );
  } finally {
    cluster.dispose();
  }
});

test('W9 & N2: seed restarted after GROWTH_PROMOTE in {s, j1, j2} sends ' +
  'heartbeats across >= 3 election timeouts with no spurious election, steps ' +
  'down by check-quorum when both joiners are partitioned, and takes no ' +
  'sole-voter campaign path on restart', () => {
  const cluster = createFoundingCluster([SEED]);
  try {
    growSeedToThreeVoters(cluster);
    const termAfterGrowth = hardStateOf(cluster, SEED).term;

    // Leader maintains heartbeats across >= 3 election timeouts (~90 ticks) with no term increase.
    for (let round = 0; round < 90; round += 1) {
      for (const replicaId of [SEED, JOINER_1, JOINER_2]) {
        cluster.node(replicaId).tick();
      }
      cluster.deliverAll();
    }
    assert.equal(leaderOf(cluster), SEED);
    assert.equal(
      hardStateOf(cluster, SEED).term,
      termAfterGrowth,
      'heartbeat scheduling must prevent spurious elections across >= 3 election timeouts',
    );

    // Partition both joiners from SEED: check-quorum steps SEED down to follower.
    cluster.isolate(JOINER_1);
    cluster.isolate(JOINER_2);
    for (let round = 0; round < 60; round += 1) {
      cluster.node(SEED).tick();
    }
    assert.notEqual(
      roleOf(cluster, SEED),
      LEADER_ROLE,
      'check-quorum must step the isolated seed down when both joiners are partitioned',
    );

    // Restart SEED while j1 and j2 remain isolated: because ConfState is {s, j1, j2},
    // SEED is no longer a sole voter and must NOT take the sole-voter campaign path (N2).
    cluster.restart(SEED);
    assert.notEqual(
      roleOf(cluster, SEED),
      LEADER_ROLE,
      'restarted seed in {s, j1, j2} must not take the sole-voter campaign path',
    );
  } finally {
    cluster.dispose();
  }
});

test('W10, W11-W13, & N9: withdrawal race (C1) answers PROMOTION_IN_LOG when ' +
  'enter-joint is pending or applied, REMOVE_LEARNER is refused NOT_LEARNER ' +
  'after enter-joint, and configuration never degrades to {s, j1}', () => {
  const cluster = createFoundingCluster([SEED]);
  try {
    electSoleFounder(cluster);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_1);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_2);
    admitLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w10-1');
    admitLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w10-2');

    // W12: proposal on a below-gate learner is refused GATE_CLOSED; after
    // promotion opens j1's gate, ADMIT on non-leader voter j1 returns
    // NOT_LEADER with leaderReplicaId hint.
    const gatedAdmit = turnChainValue(
      cluster.node(JOINER_1).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADMIT,
        replicaIdentity: JOINER_2,
        nodeId: 'node-j2',
      }),
    );
    assert.equal(gatedAdmit.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(gatedAdmit.reason, PARTICIPATION_GATE.GATE_CLOSED);

    catchUpLearnerAndSettle(cluster, SEED, JOINER_1, 'op-w10-grow');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_2, 'op-w10-grow');

    // Isolate both joiners so enter-joint is applied on SEED (entering joint
    // {s, j1, j2} && {s} with auto-leave pending in log).
    cluster.isolate(JOINER_1);
    cluster.isolate(JOINER_2);
    const promoted = turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-w10-grow',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    assert.equal(promoted.reason, RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED);

    // W10 & N9: WITHDRAW_PROMOTION while promotion is in log must answer
    // PROMOTION_IN_LOG, never WITHDRAWN!
    const withdrawInLog = turnChainValue(
      withdrawGroupPromotion(cluster.node(SEED), {
        operationId: 'op-w10-grow',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    assert.equal(withdrawInLog.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(
      withdrawInLog.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_IN_LOG,
    );

    // REMOVE_LEARNER(j2) while j2 is in ConfState.voters (joint) is refused NOT_LEARNER.
    const removeWhileJoint = turnChainValue(
      proposeGroupRemoveLearner(cluster.node(SEED), {
        replicaIdentity: JOINER_2,
      }),
    );
    assert.equal(removeWhileJoint.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(
      removeWhileJoint.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEARNER,
    );

    // Reconnect j1 so auto-leave commits to {s, j1, j2}.
    cluster.isolated.delete(JOINER_1);
    assert.ok(
      settleCluster(cluster, () =>
        appliedStateOf(cluster, SEED).voters.length === 3 &&
        appliedStateOf(cluster, SEED).votersOutgoing.length === 0,
      [SEED, JOINER_1]),
    );

    const removeAfterLeave = turnChainValue(
      proposeGroupRemoveLearner(cluster.node(SEED), {
        replicaIdentity: JOINER_2,
      }),
    );
    assert.equal(removeAfterLeave.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(
      removeAfterLeave.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEARNER,
      'REMOVE_LEARNER must refuse NOT_LEARNER for a promoted voter (never degrading to 2 voters)',
    );
    assert.equal(appliedStateOf(cluster, SEED).voters.length, 3);
    assert.ok(
      settleCluster(cluster, () =>
        cluster.node(JOINER_1).readStatus().gateOpen === true,
      [SEED, JOINER_1]),
    );
    const nonLeaderAdmit = turnChainValue(
      cluster.node(JOINER_1).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADMIT,
        replicaIdentity: JOINER_2,
        nodeId: 'node-j2',
      }),
    );
    assert.equal(nonLeaderAdmit.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(nonLeaderAdmit.reason, RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEADER);
    assert.equal(nonLeaderAdmit.leaderReplicaId, SEED);
  } finally {
    cluster.dispose();
  }
});

test('W14 & W17: REPLACE_PROMOTE for RF=3 live source (3->4->3), RF=3 dead ' +
  'source, RF=1 (1->2->1), refusal when below target (|V| < V(r, H)), and ' +
  'W17 roll-forward when target dies after promotion is in the log', () => {
  // Part A: RF=1 replace {s} + L{t} -> {s, t} -> handoff -> {t}, plus
  // REPLACE_PROMOTE_NOT_AT_TARGET when V(r=3, H=3) = 3 but |V| = 1.
  const rf1Cluster = createFoundingCluster([SEED]);
  try {
    electSoleFounder(rf1Cluster);
    addLearnerReplicaToCluster(rf1Cluster, SEED, TARGET_T);
    admitLearnerAndSettle(rf1Cluster, SEED, TARGET_T, 'op-rf1-admit');
    catchUpLearnerAndSettle(
      rf1Cluster, SEED, TARGET_T, 'op-rf1-replace',
      RAFT_CATCH_UP_REQUEST_KIND.REPLACE_PROMOTE,
    );

    const belowTarget = turnChainValue(
      proposeGroupReplacePromote(rf1Cluster.node(SEED), {
        operationId: 'op-rf1-below',
        sourceReplicaIdentity: SEED,
        targetReplicaIdentity: TARGET_T,
        replicationFactor: 3,
        eligibleHostCount: 3,
      }),
    );
    assert.equal(belowTarget.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(
      belowTarget.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.REPLACE_PROMOTE_NOT_AT_TARGET,
    );

    const rf1Promoted = turnChainValue(
      proposeGroupReplacePromote(rf1Cluster.node(SEED), {
        operationId: 'op-rf1-replace',
        sourceReplicaIdentity: SEED,
        targetReplicaIdentity: TARGET_T,
        replicationFactor: 1,
        eligibleHostCount: 2,
      }),
    );
    assert.equal(
      rf1Promoted.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED,
    );
    assert.ok(
      settleCluster(rf1Cluster, () =>
        appliedStateOf(rf1Cluster, SEED).voters.length === 2 &&
        rf1Cluster.node(TARGET_T).readStatus().gateOpen === true),
    );
    // Remove source SEED: REMOVES_LEADER transfers leadership to TARGET_T, then TARGET_T removes SEED.
    const selfRemove = turnChainValue(
      rf1Cluster.node(SEED).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
        replicaIdentity: SEED,
        nodeId: 'node-s',
      }),
    );
    assert.equal(selfRemove.reason, RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LEADER);
    assert.ok(settleCluster(rf1Cluster, () => leaderOf(rf1Cluster) === TARGET_T));
    turnChainValue(
      rf1Cluster.node(TARGET_T).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
        replicaIdentity: SEED,
        nodeId: 'node-s',
      }),
    );
    assert.ok(
      settleCluster(rf1Cluster, () =>
        appliedStateOf(rf1Cluster, TARGET_T).voters.length === 1, [TARGET_T]),
    );
  } finally {
    rf1Cluster.dispose();
  }

  // Part B: RF=3 dead source {s, j1, j2-dead} + L{t} -> {s, j1, j2-dead, t} -> {s, j1, t},
  // and W17 roll-forward when a replacement target dies after REPLACE_PROMOTE is in the log.
  const rf3Cluster = createFoundingCluster([SEED]);
  try {
    growSeedToThreeVoters(rf3Cluster);
    // Kill source JOINER_2 and replace it with TARGET_T (3 -> 4 -> 3).
    rf3Cluster.isolate(JOINER_2);
    addLearnerReplicaToCluster(rf3Cluster, SEED, TARGET_T);
    admitLearnerAndSettle(rf3Cluster, SEED, TARGET_T, 'op-rf3-admit-t');
    catchUpLearnerAndSettle(
      rf3Cluster, SEED, TARGET_T, 'op-rf3-replace-t',
      RAFT_CATCH_UP_REQUEST_KIND.REPLACE_PROMOTE,
    );
    const promotedT = turnChainValue(
      proposeGroupReplacePromote(rf3Cluster.node(SEED), {
        operationId: 'op-rf3-replace-t',
        sourceReplicaIdentity: JOINER_2,
        targetReplicaIdentity: TARGET_T,
        targetVoterCount: 3,
      }),
    );
    assert.equal(promotedT.reason, RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED);
    assert.ok(
      settleCluster(rf3Cluster, () =>
        appliedStateOf(rf3Cluster, SEED).voters.length === 4,
      [SEED, JOINER_1, TARGET_T]),
    );
    // Remove dead source JOINER_2 to return to 3 voters {s, j1, t}.
    turnChainValue(
      rf3Cluster.node(SEED).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
        replicaIdentity: JOINER_2,
        nodeId: 'node-j2',
      }),
    );
    assert.ok(
      settleCluster(rf3Cluster, () =>
        appliedStateOf(rf3Cluster, SEED).voters.length === 3,
      [SEED, JOINER_1, TARGET_T]),
    );

    // W17: Now admit JOINER_3 as a replacement target for JOINER_1, promote it
    // (3 -> 4), and then JOINER_3 dies after REPLACE_PROMOTE is in the log.
    // WITHDRAW_PROMOTION answers PROMOTION_IN_LOG, and rolling forward by removing
    // the dead target JOINER_3 returns the group to 3 voters {s, j1, t}.
    addLearnerReplicaToCluster(rf3Cluster, SEED, JOINER_3);
    admitLearnerAndSettle(rf3Cluster, SEED, JOINER_3, 'op-w17-admit');
    catchUpLearnerAndSettle(
      rf3Cluster, SEED, JOINER_3, 'op-w17-replace',
      RAFT_CATCH_UP_REQUEST_KIND.REPLACE_PROMOTE,
    );
    const promotedJ3 = turnChainValue(
      proposeGroupReplacePromote(rf3Cluster.node(SEED), {
        operationId: 'op-w17-replace',
        sourceReplicaIdentity: JOINER_1,
        targetReplicaIdentity: JOINER_3,
        targetVoterCount: 3,
      }),
    );
    assert.equal(promotedJ3.reason, RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED);
    rf3Cluster.isolate(JOINER_3);
    const w17Withdraw = turnChainValue(
      withdrawGroupPromotion(rf3Cluster.node(SEED), {
        operationId: 'op-w17-replace',
        replicaIdentities: [JOINER_3],
      }),
    );
    assert.equal(w17Withdraw.reason, RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_IN_LOG);
    assert.ok(
      settleCluster(rf3Cluster, () =>
        appliedStateOf(rf3Cluster, SEED).voters.length === 4,
      [SEED, JOINER_1, TARGET_T]),
    );
    turnChainValue(
      rf3Cluster.node(SEED).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
        replicaIdentity: JOINER_3,
        nodeId: 'node-j3',
      }),
    );
    assert.ok(
      settleCluster(rf3Cluster, () =>
        appliedStateOf(rf3Cluster, SEED).voters.length === 3,
      [SEED, JOINER_1, TARGET_T]),
    );
  } finally {
    rf3Cluster.dispose();
  }
});

test('W15, W16 & N11: REMOVE_LEARNER removes live and dead learners (live ' +
  'learner observes transition to ABSENT); RemoveNode(leader) is refused ' +
  'REMOVES_LEADER and hands off leadership in the same turn', () => {
  const cluster = createFoundingCluster([SEED]);
  try {
    growSeedToThreeVoters(cluster);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_3);
    addLearnerReplicaToCluster(cluster, SEED, TARGET_T);
    admitLearnerAndSettle(cluster, SEED, JOINER_3, 'op-w15-live');
    admitLearnerAndSettle(cluster, SEED, TARGET_T, 'op-w15-dead');

    const j3Events = [];
    cluster.node(JOINER_3).subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, (evt) => {
      j3Events.push(evt);
    });

    // Remove live learner JOINER_3.
    const removedLive = turnChainValue(
      proposeGroupRemoveLearner(cluster.node(SEED), {
        operationId: 'op-w15-rm-live',
        replicaIdentity: JOINER_3,
      }),
    );
    assert.equal(removedLive.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(
      removedLive.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.LEARNER_REMOVAL_PROPOSED,
    );
    assert.ok(
      settleCluster(cluster, () =>
        cluster.node(JOINER_3).readStatus().memberRole ===
          COMMITTED_REPLICA_ROLE.ABSENT),
    );
    assert.ok(
      j3Events.some((evt) => evt.role === COMMITTED_REPLICA_ROLE.ABSENT),
      'live learner must observe its applied ConfState transition to ABSENT',
    );

    // Isolate TARGET_T (dead learner) and remove it via REMOVE_LEARNER.
    cluster.isolate(TARGET_T);
    const removedDead = turnChainValue(
      proposeGroupRemoveLearner(cluster.node(SEED), {
        operationId: 'op-w15-rm-dead',
        replicaIdentity: TARGET_T,
      }),
    );
    assert.equal(
      removedDead.reason,
      RAFT_FOUNDING_GROWTH_OUTCOME.LEARNER_REMOVAL_PROPOSED,
    );
    assert.ok(
      settleCluster(cluster, () =>
        appliedStateOf(cluster, SEED).learners.length === 0,
      [SEED, JOINER_1, JOINER_2]),
    );

    // W16 & N11: RemoveNode(leader) from {s, j1, j2} is refused REMOVES_LEADER
    // and triggers leadership transfer in the same turn.
    const currentLeader = leaderOf(cluster);
    const selfRemoval = turnChainValue(
      cluster.node(currentLeader).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
        replicaIdentity: currentLeader,
        nodeId: 'node-leader',
      }),
    );
    assert.equal(selfRemoval.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(
      selfRemoval.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LEADER,
    );
    assert.ok(
      settleCluster(cluster, () => {
        const next = leaderOf(cluster);
        return next !== null && next !== currentLeader;
      }, [SEED, JOINER_1, JOINER_2]),
      'leadership hand-off must elect a remaining voter after REMOVES_LEADER',
    );
  } finally {
    cluster.dispose();
  }
});

test('W-FOLD-JOINT: a joiner bootstrapped before, during (refused JOINT then ' +
  'retried after auto-leave), and after a growth joint matches the leader ' +
  'ConfState at every applied index across restart', () => {
  const cluster = createFoundingCluster([SEED]);
  try {
    electSoleFounder(cluster);
    const genesis = [cluster.raftPeerIdOf(SEED)];

    // Joiner 1 & Joiner 2 bootstrapped BEFORE the growth joint.
    addLearnerReplicaToCluster(cluster, SEED, JOINER_1);
    addLearnerReplicaToCluster(cluster, SEED, JOINER_2);
    admitLearnerAndSettle(cluster, SEED, JOINER_1, 'op-fold-1');
    admitLearnerAndSettle(cluster, SEED, JOINER_2, 'op-fold-2');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_1, 'op-fold-grow');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_2, 'op-fold-grow');

    // Isolate j1 and j2 momentarily so SEED is in the joint state when a
    // BOOTSTRAP read is attempted during the growth joint.
    cluster.isolate(JOINER_1);
    cluster.isolate(JOINER_2);
    turnChainValue(
      proposeGroupGrowthPromote(cluster.node(SEED), {
        operationId: 'op-fold-grow',
        replicaIdentities: [JOINER_1, JOINER_2],
      }),
    );
    const bootstrapDuringJoint = cluster.node(SEED).readCommittedMembership({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP,
    });
    assert.equal(
      bootstrapDuringJoint.kind,
      COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED,
    );
    assert.equal(
      bootstrapDuringJoint.reason,
      COMMITTED_MEMBERSHIP_REFUSAL.JOINT,
      'BOOTSTRAP read during joint configuration must be refused JOINT',
    );
    const witnessDuringJoint = cluster.node(SEED).readCommittedMembership({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS,
      includeRole: true,
    });
    assert.equal(
      witnessDuringJoint.kind,
      COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
    );
    assert.equal(witnessDuringJoint.outgoing.length, 1);
    assert.equal(witnessDuringJoint.autoLeave, true);

    // Reconnect joiners so auto-leave commits and settles to {s, j1, j2}.
    cluster.isolated.delete(JOINER_1);
    cluster.isolated.delete(JOINER_2);
    assert.ok(
      settleCluster(cluster, () =>
        appliedStateOf(cluster, SEED).voters.length === 3 &&
        appliedStateOf(cluster, SEED).votersOutgoing.length === 0),
    );

    // Retry BOOTSTRAP read after auto-leave for JOINER_3 (bootstrapped AFTER joint).
    addLearnerReplicaToCluster(cluster, SEED, JOINER_3);
    admitLearnerAndSettle(cluster, SEED, JOINER_3, 'op-fold-3');
    catchUpLearnerAndSettle(cluster, SEED, JOINER_3, 'op-fold-3');

    // Restart all replicas and verify each replica's applied ConfState matches
    // the leader's and the independent joint-aware log fold.
    for (const replicaId of [SEED, JOINER_1, JOINER_2, JOINER_3]) {
      cluster.restart(replicaId);
    }
    assert.ok(
      settleCluster(cluster, () => {
        const leader = leaderOf(cluster);
        if (leader === null) return false;
        const leaderApplied = appliedStateOf(cluster, leader);
        return [SEED, JOINER_1, JOINER_2, JOINER_3].every((id) => {
          const applied = appliedStateOf(cluster, id);
          return applied.appliedIndex === leaderApplied.appliedIndex &&
            JSON.stringify(applied.voters) === JSON.stringify(leaderApplied.voters) &&
            JSON.stringify(applied.learners) === JSON.stringify(leaderApplied.learners);
        });
      }),
    );

    const fold = foldJointAwareLog(
      cluster.replica(SEED).dbFile, cluster.partitionId, genesis);
    const finalApplied = appliedStateOf(cluster, SEED);
    const foldedAtFinal = fold.get(finalApplied.appliedIndex);
    assert.deepEqual(
      [...foldedAtFinal.voters].sort(),
      [...finalApplied.voters].sort(),
    );
    assert.deepEqual(
      [...foldedAtFinal.learners].sort(),
      [...finalApplied.learners].sort(),
    );
    assert.deepEqual(foldedAtFinal.votersOutgoing, []);
  } finally {
    cluster.dispose();
  }
});
