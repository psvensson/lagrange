// The three membership scenarios driven directly on the raft-rs core through
// the forked binding: a stable three-voter group, Lagrange's sequential
// replacement, and a joint replacement by one ConfChangeV2 - the latter in
// both the explicit and the automatic transition, and both with a peer
// failing mid-way.
//
// Every configuration fact asserted here comes out of a record whose values
// the harness read from the core and tagged; nothing declares a membership.
// The two replacement styles are measured and reported side by side, and
// nothing here decides which Lagrange should use.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  CONF_CHANGE_TRANSITION,
  assertMembershipEmpty,
  assertMembershipEqual,
  assertMembershipExcludes,
  assertMembershipIncludes,
  assertMembershipNotEmpty,
  assertMembershipSize,
} from './forked-core-harness.js';
import {
  runJointQuorumRequirement,
  runPromotionGating,
  runJointReplacement,
  runJointReplacementWithFailure,
  runSequentialFailureMatrix,
  runSequentialReplacement,
  runSequentialReplacementWithFailure,
  runThreeVoterGroup,
} from './core-scenarios.js';

const EXPECTED_SEQUENTIAL_STEPS = 3;

function assertWitnessed(record) {
  assert.ok(record.witness.total > 0,
    `${record.id}: the scenario must have read membership from the core`);
  assert.equal(record.witness.refusals, 0,
    `${record.id}: no membership value may have bypassed a core read`);
}

test('a three-voter group elects and commits deterministically', () => {
  const record = runThreeVoterGroup();
  assertWitnessed(record);

  const peers = Object.keys(record.confStateByPeer);
  assert.equal(peers.length, 3, 'three peers must report a configuration');
  const first = record.confStateByPeer[peers[0]].voters;
  assertMembershipSize(first, 3, 'the core must report three voters');
  for (const peerId of peers) {
    assertMembershipEqual(record.confStateByPeer[peerId].voters, first,
      `${peerId} must report the same voters as every other peer`);
    assertMembershipEmpty(record.confStateByPeer[peerId].learners,
      `${peerId}: a stable three-voter group has no learners`);
  }
  assert.equal(record.statusByPeer[record.leaderId].raftState, 2,
    'the leader the scenario found must report itself leader');

  const indices = Object.values(record.appliedIndexByPeer);
  assert.equal(indices.length, 3, 'every peer must have applied the entry');
  assert.equal(new Set(indices).size, 1,
    'every peer must have applied it at the same index');
});

test('sequential replacement: learner added, caught up, promoted, old voter ' +
  'removed', () => {
  const record = runSequentialReplacement();
  assertWitnessed(record);
  assert.equal(record.steps.length, EXPECTED_SEQUENTIAL_STEPS,
    'the sequential style takes three steps');
  assert.equal(record.confEntriesTotal, EXPECTED_SEQUENTIAL_STEPS,
    'each step must be one committed configuration change');

  const [added, promoted, removed] = record.steps;
  for (const state of Object.values(added.confStateByPeer)) {
    assertMembershipSize(state.learners, 1,
      'every peer must report exactly the new learner');
    assertMembershipExcludes(state.voters, state.learners,
      'the learner must not yet be a voter anywhere');
  }

  // Catch-up is read from the leader's own progress.
  assert.ok(record.catchUp.learnerProgress,
    'the leader must report progress for the learner');
  assert.equal(record.catchUp.caughtUp, true,
    'the learner must have caught up to the leader\'s committed index ' +
    `(matched ${record.catchUp.learnerProgress.matched} vs commit ` +
    `${record.catchUp.leaderCommit})`);

  for (const [peerId, state] of Object.entries(promoted.confStateByPeer)) {
    assertMembershipIncludes(state.voters, added.leaderLearners,
      `${peerId} must report the promoted learner as a voter`);
    assertMembershipEmpty(state.learners,
      `${peerId} must no longer report it as a learner`);
  }
  const survivingVoters = removed.leaderVoters;
  for (const [peerId, state] of Object.entries(removed.confStateByPeer)) {
    assertMembershipEqual(state.voters, survivingVoters,
      `${peerId} must report the same voters as the leader after removal`);
  }
  assertMembershipSize(survivingVoters, 3,
    'a replacement leaves the group the size it started at');

  // And the same style with a peer failing before the learner caught up.
  const failure = runSequentialReplacementWithFailure();
  assertWitnessed(failure);
  assertSequentialFailure(failure);

  // The core does NOT gate promotion on catch-up: it promotes a learner that
  // never caught up. Catch-up is a LAGRANGE policy, and the contrast is
  // driven rather than argued.
  const gating = runPromotionGating();
  assert.equal(gating.coreGatesNothing, true,
    'the core must be shown promoting a learner that never caught up, or ' +
    'the policy above is not the thing doing the gating: ' +
    JSON.stringify(gating.ungated));
  assert.equal(gating.ungated.learnerWasCaughtUp, false,
    'the ungated variant must promote a learner the core\'s own progress ' +
    `says is behind (${JSON.stringify(
      gating.ungated.learnerProgressAtPromotion)})`);
  assert.equal(gating.gated.policyRefusedToPromote, true,
    'at the same point, the Lagrange-side policy reading the core\'s own ' +
    'progress must refuse to promote');
  assert.equal(record.catchUp.caughtUp, true,
    'the sequential scenario must gate on the core\'s progress, and did');

  // A peer dying at EACH phase, with the quorum the core required at that
  // phase read from its own voter set and progress.
  const matrix = runSequentialFailureMatrix();
  assert.equal(matrix.cases.length, 4,
    'a peer must have been failed at each phase, and the learner too');
  for (const testCase of matrix.cases) {
    assert.equal(testCase.steps.length, EXPECTED_SEQUENTIAL_STEPS,
      `${testCase.label}: every phase must be recorded`);
    for (const step of testCase.steps) {
      assert.ok(step.voterCount > 0,
        `${testCase.label}/${step.phase}: the voter set the core used must ` +
        'be recorded');
      assert.ok(Array.isArray(step.progress),
        `${testCase.label}/${step.phase}: the core's own progress must be ` +
        'recorded as the quorum evidence');
    }
    assert.equal(testCase.allSurvivorsAgree, true,
      `${testCase.label}: every surviving peer must agree on the ` +
      'configuration');
  }
});

function assertSequentialFailure(record) {
  assert.ok(record.failedPeer, 'a peer must have been failed');
  assert.equal(record.committedWithPeerDown, true,
    'the group must still have committed with that peer down ' +
    `(commit ${record.commitBefore} -> ${record.commitAfter})`);
  // The quorum is evidenced by the core's own progress over the core's own
  // voter set, not by arithmetic here.
  assert.ok(record.progressAfter.length > 0,
    'the leader must report per-peer progress over its own configuration');
  const survivors = Object.keys(record.survivingConfStateByPeer);
  assert.ok(!survivors.includes(record.failedPeer),
    'the failed peer must not be reporting anything');
  const agreedOn = record.survivingConfStateByPeer[survivors[0]].voters;
  for (const peerId of survivors) {
    assertMembershipEqual(record.survivingConfStateByPeer[peerId].voters,
      agreedOn, 'every surviving peer must agree on the configuration');
  }
}

test('joint replacement: one ConfChangeV2 enters, commits and leaves the ' +
  'joint configuration', () => {
  const explicit = runJointReplacement(CONF_CHANGE_TRANSITION.EXPLICIT);
  const auto = runJointReplacement(CONF_CHANGE_TRANSITION.AUTO);
  assertWitnessed(explicit);
  assertWitnessed(auto);

  for (const record of [explicit, auto]) {
    assert.equal(record.enteredJoint, true,
      `${record.id}: every peer must have entered the joint configuration`);
    for (const [peerId, state] of
      Object.entries(record.jointConfStateByPeer)) {
      assertMembershipNotEmpty(state.votersOutgoing,
        `${record.id}: ${peerId} must report an outgoing configuration`);
    }
    for (const [peerId, state] of
      Object.entries(record.finalConfStateByPeer)) {
      assertMembershipEmpty(state.votersOutgoing,
        `${record.id}: ${peerId} must have left the joint configuration`);
      assertMembershipEqual(state.voters, record.expectedFinalVoters,
        `${record.id}: ${peerId} must report the configuration derived ` +
        'from what the core reported before the change plus the change ' +
        'that was requested');
    }
  }

  // The two transitions are recorded as they behaved, not as hoped.
  assert.equal(explicit.autoLeftWithoutAProposal, false,
    'an explicit transition must not leave the joint configuration by ' +
    'itself: the host proposed the empty change');
  assert.equal(auto.autoLeftWithoutAProposal, true,
    'the automatic transition left the joint configuration with no ' +
    'proposal from the host');
  assert.ok(auto.confEntries < explicit.confEntries,
    'the automatic transition costs the host fewer proposed changes ' +
    `(${auto.confEntries} vs ${explicit.confEntries})`);

  // The same style with a peer down, once incoming and once outgoing.
  const incoming = runJointReplacementWithFailure('incoming');
  const outgoing = runJointReplacementWithFailure('outgoing');
  for (const record of [incoming, outgoing]) {
    assertWitnessed(record);
    assertMembershipNotEmpty(record.jointVoters,
      `${record.id}: the scenario must have had an incoming configuration`);
    assertMembershipNotEmpty(record.jointVotersOutgoing,
      `${record.id}: the scenario must actually have been in a joint ` +
      'configuration when the peer failed');
    assert.equal(record.committedWithPeerDown, true,
      `${record.id}: the group must still commit with the ${record.failedRole}` +
      ` peer down (commit ${record.commitBefore} -> ${record.commitAfter})`);
    assert.ok(record.progressAfter.length > 0,
      `${record.id}: the quorum must be evidenced by the core's own progress`);
    assert.ok(!record.survivingPeers.includes(record.failedPeer),
      `${record.id}: the failed peer must be gone`);
  }

  // While joint, a commit needs a majority of BOTH configurations. Measured
  // by taking peers down and asking the core, never by arithmetic here.
  const quorum = runJointQuorumRequirement();
  assertWitnessed(quorum);
  assertMembershipNotEmpty(quorum.outgoingOnlyVoters,
    'the joint configuration must have a voter only in its outgoing set');
  assert.equal(quorum.oneDown.committed, true,
    'with only the outgoing-only voter down both majorities are still ' +
    `reachable (commit ${quorum.oneDown.commitBefore} -> ` +
    `${quorum.oneDown.commitAfter})`);
  assert.equal(quorum.twoDown.committed, false,
    'with a voter present in both configurations also down the outgoing ' +
    'majority is lost and nothing may commit (commit ' +
    `${quorum.twoDown.commitBefore} -> ${quorum.twoDown.commitAfter})`);
  assert.equal(quorum.bothMajoritiesRequired, true,
    'a commit while joint must require a majority of both configurations');
});
