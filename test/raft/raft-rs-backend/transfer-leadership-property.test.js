// Property (quest f1-step-down-port; design-f1-step-down-port-2026-09-25.md
// section 2 and its lead decisions):
//
//   When a replica of a partition is asked to transfer that partition's
//   leadership to a named voter (or, when no successor is named, to the voter
//   whose log is most caught up), then, if the request is accepted, leadership
//   reaches that voter through the operation port within one election timeout
//   as the core counts it (election tick x tick length). The old leader then
//   holds no leadership, and never regains it while the new leader keeps
//   reaching it. If the request cannot succeed, the port says so as a typed
//   refusal and changes nothing. A transfer the core aborts leaves the leader
//   in place and fit to take writes after that one election timeout.
//
// This file holds W1 (the leader-side request, named and most-caught-up) and
// W2 (the target-side request, forwarded, then already-leader). The attack
// matrix W3 is transfer-leadership-attack-matrix.test.js.
//
// Every peer is a real rs-raft operation port built through the provider seam
// (PartitionNodeCluster). Time moves only by explicit ticks
// (TransferLeadershipDriver): one round is one tick length, and the election
// timeout is the core's own election tick. Every expectation is the core's
// report through readStatus, with identities resolved through the backend's
// registry; the raft-rs 0.7 semantics the design cites (raft.rs
// handle_transfer_leader, step_follower forwarding, MsgTimeoutNow) define the
// expected values.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as portVocabulary from
  '../../../src/raft/raft-operation-port-constants.js';
import {
  TRANSFER_REASON,
  TransferLeadershipDriver,
  assertAccepted,
  assertLeadershipHeld,
  mostCaughtUp,
  namedSuccessor,
} from './transfer-leadership-driver.js';

const {CORE_OK} = portVocabulary.RAFT_OPERATION_OUTCOME;
const A = 'transfer-replica-a';
const B = 'transfer-replica-b';
const C = 'transfer-replica-c';
const REPLICAS = Object.freeze([A, B, C]);
const FOLLOWER = 'follower';

function formedGroup(partitionId) {
  const driver = new TransferLeadershipDriver({
    partitionId, replicaIds: REPLICAS});
  driver.form();
  return driver;
}

// The hand-over as the core reports it: the successor leads within one
// election timeout of ticks, in a later term; the old leader is its follower.
function assertHandedOver(driver, {from, to, termBefore}) {
  const rounds = driver.roundsUntil(() => driver.leads(to),
    driver.electionTick());
  assert.notEqual(rounds, null,
    `${to} leads within one election timeout (${driver.electionTick()} ticks)`);
  const successor = driver.status(to);
  assert.ok(successor.term > termBefore, 'the term advanced');
  const old = driver.status(from);
  assert.equal(old.role, FOLLOWER, 'the old leader is a follower');
  assert.equal(old.leaderId, to, 'the old leader follows the successor');
  assert.equal(driver.raftIdAt(from, old.leaderId), successor.peerId,
    'the leader the old leader names is the successor\'s raft id');
  return successor;
}

// Replicas in the order of the raft ids the leader's registry reserved.
function byRaftId(driver, replicaIds) {
  const idOf = (replicaId) => BigInt(driver.raftIdAt(A, replicaId));
  return [...replicaIds].sort((left, right) => {
    const difference = idOf(left) - idOf(right);
    return difference === 0n ? 0 : difference < 0n ? -1 : 1;
  });
}

// A write proposed on the successor commits: its answer is CORE_OK and both
// the successor's and a follower's application apply it.
function assertWriteCommits(driver, leader, follower) {
  const command = {after: 'transfer', on: leader};
  const answer = driver.propose(leader, command);
  assert.equal(answer.outcome, CORE_OK, JSON.stringify(answer));
  driver.round();
  assert.equal(driver.applied(leader, command), true, 'the leader applied it');
  assert.equal(driver.applied(follower, command), true,
    'a follower applied it');
}

test('W0 the owner\'s transfer vocabulary carries the contract\'s reasons',
  async () => {
    const owned = portVocabulary.RAFT_LEADERSHIP_TRANSFER_REASON;
    assert.equal(typeof owned, 'object',
      'raft-operation-port-constants owns RAFT_LEADERSHIP_TRANSFER_REASON');
    assert.equal(Object.isFrozen(owned), true);
    const values = new Set(Object.values(owned));
    for (const reason of Object.values(TRANSFER_REASON)) {
      assert.equal(values.has(reason), true, `the owner names ${reason}`);
    }
  });

test('W1 a named transfer on the leader moves leadership to the target ' +
  'within one election timeout, and the old leader never regains it', async () => {
  const driver = formedGroup('w1-named-transfer');
  try {
    driver.watchLeaderEvents(A);
    const termBefore = driver.status(A).term;
    assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(C)),
      TRANSFER_REASON.REQUESTED);
    driver.deliver();
    assertHandedOver(driver, {from: A, to: C, termBefore});
    assertLeadershipHeld(driver, {from: A, to: C});
    assertWriteCommits(driver, C, A);
  } finally {
    driver.dispose();
  }
});

test('W1 a named transfer to a lagging target catches it up and hands over ' +
  'within one election timeout', async () => {
  const driver = formedGroup('w1-lagging-target');
  try {
    driver.lagBehind(A, C);
    driver.heal(C);
    driver.watchLeaderEvents(A);
    const termBefore = driver.status(A).term;
    assertAccepted(await driver.port(A).transferLeadership(namedSuccessor(C)),
      TRANSFER_REASON.REQUESTED);
    driver.deliver();
    assertHandedOver(driver, {from: A, to: C, termBefore});
    assertLeadershipHeld(driver, {from: A, to: C});
    assertWriteCommits(driver, C, B);
  } finally {
    driver.dispose();
  }
});

// The follower of the lower raft id lags, so a choice that ignored progress
// and fell to the lowest id would pick the laggard.
test('W1 most-caught-up hands leadership to the voter whose log is most ' +
  'caught up, not merely the lowest id', async () => {
  const driver = formedGroup('w1-most-caught-up');
  try {
    const [laggard, expected] = byRaftId(driver, [B, C]);
    driver.lagBehind(A, laggard);
    driver.watchLeaderEvents(A);
    const termBefore = driver.status(A).term;
    assertAccepted(await driver.port(A).transferLeadership(mostCaughtUp()),
      TRANSFER_REASON.REQUESTED);
    driver.deliver();
    assertHandedOver(driver, {from: A, to: expected, termBefore});
    assert.equal(driver.leads(laggard), false, 'the laggard does not lead');
    driver.heal(laggard);
    assertLeadershipHeld(driver, {from: A, to: expected});
    assertWriteCommits(driver, expected, laggard);
  } finally {
    driver.dispose();
  }
});

test('W1 most-caught-up with equally caught-up voters picks the lowest raft ' +
  'id (the design\'s tie rule)', async () => {
  const driver = formedGroup('w1-most-caught-up-tie');
  try {
    driver.round();
    const [expected] = byRaftId(driver, [B, C]);
    const termBefore = driver.status(A).term;
    assertAccepted(await driver.port(A).transferLeadership(mostCaughtUp()),
      TRANSFER_REASON.REQUESTED);
    driver.deliver();
    assertHandedOver(driver, {from: A, to: expected, termBefore});
  } finally {
    driver.dispose();
  }
});

// The target-side request of the REPLACE workflow: the replacement replica
// names itself while it is a follower that still lags. The leader catches it
// up and sends MsgTimeoutNow; a campaign at the target instead could not win
// with a stale log inside one election timeout.
test('W2 a target-side request is forwarded and the target leads; the same ' +
  'request on the new leader is already-leader with the term unchanged',
async () => {
  const driver = formedGroup('w2-target-side');
  try {
    driver.lagBehind(A, B);
    driver.heal(B);
    driver.watchLeaderEvents(A);
    const termBefore = driver.status(A).term;
    assertAccepted(await driver.port(B).transferLeadership(namedSuccessor(B)),
      TRANSFER_REASON.FORWARDED);
    driver.deliver();
    const successor = assertHandedOver(driver, {from: A, to: B, termBefore});
    assert.equal(successor.term, termBefore + 1,
      'one leader-mediated election, not a disruptive campaign');
    assertAccepted(await driver.port(B).transferLeadership(namedSuccessor(B)),
      TRANSFER_REASON.ALREADY_LEADER);
    driver.deliver();
    driver.round();
    assert.equal(driver.status(B).term, successor.term, 'the term unchanged');
    assert.equal(driver.leads(B), true);
    assertLeadershipHeld(driver, {from: A, to: B});
    assertWriteCommits(driver, B, C);
  } finally {
    driver.dispose();
  }
});
