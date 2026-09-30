// M1 (committed-read amendment 1, section 5): projected topology cannot
// grant participation. For every history of the model and every applied cut
// below the target's gate, a target opened from the committed configuration
// C_j (plus itself, O2) does not campaign, is not voted for, does not lead
// and does not commit - while the rows every replica holds claim the target
// is a member (and omit a committed voter, and name a phantom).
//
// Ranges over HISTORY (challenger B section C: H1 with the transient
// sole-voter view, H3/H4/H5 with D = {}, H6a/H6b with |D| in {1, 2} on odd
// n) x cuts {0, every conf-change index below j, j}. Oracles: O-d (the
// target's durable term and vote on a connection of the test's own), O-c
// (durable hard states and logs), O-a (the fold of the leader's durable log
// over the TEST'S genesis, decoded by the binding), O-b (cross-member
// agreement of durable applied configurations at equal index). The replay
// law itself is checked at every cut: the target's durable applied
// configuration equals the fold of the same log over C_j + self.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  HISTORY,
  LEADER_ROLE,
  UNBOUNDED,
  admissionIndexOf,
  assertCrossMemberAgreement,
  assertSafety,
  commitVoterChange,
  committedAt,
  createModelCluster,
  durableOf,
  electionStorm,
  formHistory,
  identityOf,
  joinFromStamp,
  leaderOf,
  liveReplicas,
  peerIdIn,
  plantDisagreeingRows,
  prefixFilter,
  recordGateOpenings,
  replayedView,
  roleOf,
  settle,
  termAndVote,
} from './evidence-o1-model.js';
import {RAFT_MEMBERSHIP_OPERATION} from
  '../../../src/raft/raft-operation-port-constants.js';
import {PARTICIPATION_GATE} from
  '../../../src/raft/raft-committed-membership-constants.js';

const PARTITION_ID = 'evidence-o1-m1';
const TARGET_LETTER = 't';
const HISTORY_KEYS = Object.keys(HISTORY);

// The applied cuts below the gate: fresh, every conf-change index below j,
// j itself, and the last index before the target's own admission.
function cutsOf(changeIndices, j, aSelf) {
  return [...new Set([0, ...changeIndices.filter((index) => index < j), j,
    aSelf - 1])].sort((left, right) => left - right);
}

// Rounds that deliver what the leader already sent (a target adopts the
// group's term from the first append it receives: allowed traffic, not a
// campaign) before the storm's baseline is taken.
const FLUSH_ROUNDS = 5;

function assertGatedAtCut(cluster, target, leader, members, cut, j) {
  settle(cluster, () => false, [leader], FLUSH_ROUNDS);
  const before = durableOf(cluster, target);
  assert.equal(before.applied.appliedIndex, cut,
    `setup: the target is held at applied ${cut}`);
  assert.equal(before.applied.bootstrapIndex, j,
    'the durable bootstrap index is j');
  assert.equal(before.applied.admissionIndex, null,
    'no admission is durable below the gate');
  const membersBefore = Object.fromEntries(members.map((id) =>
    [id, termAndVote(durableOf(cluster, id).hard)]));
  const targetPeerId = peerIdIn(cluster, target, target);
  const samples = electionStorm(cluster, target, members, () => {
    assert.notEqual(roleOf(cluster, target), LEADER_ROLE,
      `the target never leads at cut ${cut}`);
  });
  const after = durableOf(cluster, target);
  assert.deepEqual(termAndVote(after.hard), termAndVote(before.hard),
    `O-d: the target durable term and vote are unchanged at cut ${cut}`);
  assert.ok(Number(after.hard?.term ?? 0) <=
    Number(durableOf(cluster, leader).hard.term),
  'O-d: the target term never exceeds the group term');
  assert.notEqual(after.hard?.vote, targetPeerId,
    'O-d: the target never voted for itself');
  assert.deepEqual(Object.fromEntries(members.map((id) =>
    [id, termAndVote(durableOf(cluster, id).hard)])), membersBefore,
  `the members' durable terms and votes are unchanged at cut ${cut}`);
  for (const {hard} of samples) {
    for (const [id, {vote}] of Object.entries(hard)) {
      assert.notEqual(vote, targetPeerId,
        `no member (${id}) ever voted for the unadmitted target`);
    }
  }
  assert.equal(leaderOf(cluster), leader, 'the leader is unchanged');
  const campaign = cluster.node(target).campaign();
  assert.equal(campaign.reason, PARTICIPATION_GATE.GATE_CLOSED,
    `an explicit campaign is refused typed at cut ${cut}`);
  const tick = cluster.node(target).tick();
  assert.equal(tick.reason, PARTICIPATION_GATE.GATE_CLOSED,
    'a tick is refused typed');
  const write = cluster.node(target).propose('below-the-gate');
  assert.equal(write.reason, PARTICIPATION_GATE.GATE_CLOSED,
    'a write is refused typed, not as a generic unavailability');
  assert.deepEqual(termAndVote(durableOf(cluster, target).hard),
    termAndVote(before.hard), 'O-d: the refusals raised no term');
  const status = cluster.node(target).readStatus();
  assert.equal(status.gateOpen, false);
  assert.equal(status.bootstrapIndex, j);
  assert.equal(status.admissionIndex, null);
  return samples;
}

function assertReplayLaw(cluster, {target, leader, genesis, stamp, D},
  cut) {
  const targetPeerId = peerIdIn(cluster, target, target);
  const bootstrap = [...stamp.voters, targetPeerId];
  const view = durableOf(cluster, target).applied;
  const replayed = replayedView(cluster, leader, bootstrap, cut);
  assert.deepEqual(view.voters, replayed.voters,
    `the target durable configuration at ${cut} is the fold of the ` +
      'leader log over C_j + self');
  const committed = committedAt(cluster, leader, genesis, cut);
  const withoutSelf = (ids) => ids.filter((id) => id !== targetPeerId);
  const viewWithoutSelf = withoutSelf(view.voters);
  if (cut >= stamp.appliedIndex) {
    assert.deepEqual(viewWithoutSelf, withoutSelf(committed.voters),
      `at or past j the target view is the committed configuration (${cut})`);
    return;
  }
  const omitted = committed.voters.filter((id) =>
    !viewWithoutSelf.includes(id));
  assert.deepEqual(omitted, committed.voters.filter((id) => D.includes(id)),
    `below j the view omits exactly the removed founders present at ${cut}`);
}

for (const historyKey of HISTORY_KEYS) {
  test(`M1 ${historyKey}: below its gate at every cut the target neither ` +
    'campaigns nor is voted for nor leads nor commits; rows claim otherwise',
  () => {
    const founders = HISTORY[historyKey].genesis.map((letter) =>
      identityOf(historyKey, letter));
    const target = identityOf(historyKey, TARGET_LETTER);
    const filter = {value: null};
    const cap = {value: UNBOUNDED};
    const cluster = createModelCluster({partitionId: PARTITION_ID, founders,
      target, filter});
    try {
      const history = formHistory(cluster, historyKey);
      const {leader, stamp} = history;
      const j = stamp.appliedIndex;
      assert.ok(j > 0, 'setup: j > 0');
      const members = liveReplicas(cluster);
      const omitted = Object.values(stamp.identities)[0];
      plantDisagreeingRows(cluster, target, omitted);
      filter.value = prefixFilter(cap);
      cap.value = 0;
      joinFromStamp(cluster, target, stamp);
      plantDisagreeingRows(cluster, target, omitted);
      const opened = recordGateOpenings(cluster, target);
      const targetPeerId = peerIdIn(cluster, target, target);
      // The group admits the target (its AddNode commits among the members)
      // while the target has replayed nothing: from here the leader
      // replicates to it, and every cut below a_self is reachable.
      commitVoterChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, target);
      const aSelf = admissionIndexOf(cluster, leader, targetPeerId, j);
      assert.ok(aSelf !== null && aSelf > j,
        'setup: the leader durable log holds the AddNode of the target');
      const allSamples = [];
      for (const cut of cutsOf(history.changeIndices, j, aSelf)) {
        cap.value = cut;
        assert.ok(settle(cluster, () =>
          durableOf(cluster, target).applied.appliedIndex === cut,
        [leader]), `setup: the target replays to ${cut}`);
        assertReplayLaw(cluster, {target, ...history}, cut);
        allSamples.push(...assertGatedAtCut(cluster, target, leader,
          members, cut, j));
      }
      assert.equal(opened.length, 0, 'the gate never opened below a_self');

      // Catch-up past a_self opens the gate.
      cap.value = UNBOUNDED;
      assert.ok(settle(cluster, () =>
        durableOf(cluster, target).applied.appliedIndex >= aSelf, [leader]),
      'the target applies its admission');
      assert.deepEqual(opened.map((event) => [event.bootstrapIndex,
        event.admissionIndex]), [[j, aSelf]],
      'GATE_OPENED once, at (j, a_self) from the durable log');
      assert.ok(opened[0].appliedIndex >= aSelf);
      const durable = durableOf(cluster, target).applied;
      assert.equal(durable.admissionIndex, aSelf, 'a_self is durable');
      assert.equal(durable.bootstrapIndex, j);
      assert.equal(cluster.node(target).readStatus().gateOpen, true);
      assertReplayLaw(cluster, {target, ...history},
        durable.appliedIndex);
      assertCrossMemberAgreement(cluster);
      assertSafety(cluster, allSamples, stamp.voters.length);
    } finally {
      cluster.dispose();
    }
  });
}
