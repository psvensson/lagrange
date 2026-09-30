// Round 2 of the leadership-transfer evidence (quest f1-step-down-port):
// what the port decides FROM. The property is stated in full at the top of
// transfer-leadership-property.test.js; the legs here attack the inputs of
// its two decisions:
//
//   - the transfer decision (accept, or refuse with a type and change
//     nothing) must be taken on the configuration the core holds when the
//     request is stepped, including every message already delivered to the
//     replica but not yet processed: a request the core would ignore at step
//     time is refused, never answered accepted;
//   - most-caught-up names the most caught-up VOTER: a learner, however far
//     ahead, is never the successor, and the transfer really runs;
//   - the retryable leadership-transfer-in-progress answer is given for a
//     proposal the core dropped because a transfer runs, and for no other
//     drop: a leader the committed configuration removed drops every proposal
//     for good, and that stays the core's non-retryable refusal.
//
// Real rs-raft ports through the provider seam, time moved only by explicit
// ticks (TransferLeadershipDriver). Expected values are raft-rs 0.7's own
// semantics: handle_transfer_leader ignores a transferee with no progress or
// a learner; step_leader drops a proposal when the leader is not in its
// progress map or while lead_transferee is set.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  IN_PROGRESS_REASON,
  TRANSFER_REASON,
  TransferLeadershipDriver,
  assertAccepted,
  assertRefused,
  assertTransferInProgress,
  mostCaughtUp,
  namedSuccessor,
} from './transfer-leadership-driver.js';

const {CORE_OK, CORE_REFUSED} = RAFT_OPERATION_OUTCOME;
const A = 'inputs-replica-a';
const B = 'inputs-replica-b';
const C = 'inputs-replica-c';
const LEARNER = 'inputs-replica-learner';
const REPLICAS = Object.freeze([A, B, C]);
const STEP_OPERATION = 'step';
// Entries only the learner receives while the voters are cut off.
const LEARNER_ONLY_WRITES = 3;

function formedGroup(partitionId) {
  const driver = new TransferLeadershipDriver({
    partitionId, replicaIds: REPLICAS});
  driver.form();
  return driver;
}

async function stepEntriesDuring(driver, work) {
  const before = driver.coreOperations().length;
  const answer = await work();
  return {answer, steps: driver.coreOperations().slice(before)
    .filter((operation) => operation === STEP_OPERATION).length};
}

test('a transfer to a peer that messages already delivered to the leader ' +
  'remove is refused on the configuration the step would meet', async () => {
  const driver = formedGroup('inputs-delivered-removal');
  try {
    const removedId = driver.raftIdAt(A, C);
    driver.isolate(C);
    assert.equal(driver.port(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: C,
    }).outcome, CORE_OK);
    driver.deliverOnly([B]);
    assert.equal(driver.status(A).confState.voters.includes(removedId), true,
      'precondition: the leader has not yet processed the acknowledgement');
    const delivered = driver.stepUndrained(A);
    assert.ok(delivered > 0,
      'precondition: the acknowledgement is delivered, not yet processed');
    const termBefore = driver.status(B).term;
    const {answer, steps} = await stepEntriesDuring(driver, () =>
      driver.port(A).transferLeadership(namedSuccessor(C)));
    assertRefused(answer, TRANSFER_REASON.TARGET_NOT_VOTER);
    assert.equal(steps, delivered,
      'the core was stepped with the delivered messages and nothing else');
    assert.equal(driver.status(A).confState.voters.includes(removedId), false,
      'the delivered acknowledgement committed the removal in that turn');
    driver.deliver();
    driver.round();
    assert.equal(driver.leads(A), true, 'the leader stays');
    assert.equal(driver.status(B).term, termBefore, 'no term moved');
    const command = {after: 'refused-transfer'};
    assert.equal(driver.propose(A, command).outcome, CORE_OK,
      'no transfer window was opened');
    assert.equal(driver.applied(A, command), true);
  } finally {
    driver.dispose();
  }
});

test('most-caught-up never names a learner, even one further ahead than ' +
  'every voter; the transfer to the voter runs and hands over', async () => {
  const driver = formedGroup('inputs-most-caught-up-learner');
  try {
    driver.cluster.addReplica(LEARNER, REPLICAS);
    const learnerId = driver.raftIdAt(A, LEARNER);
    assert.equal(driver.port(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: LEARNER,
    }).outcome, CORE_OK);
    driver.deliver();
    assert.notEqual(driver.roundsUntil(() =>
      driver.status(A).confState.learners.includes(learnerId),
    driver.electionTick()), null, 'setup: the learner is committed');
    driver.isolate(B);
    driver.isolate(C);
    for (let write = 0; write < LEARNER_ONLY_WRITES; write += 1) {
      driver.propose(A, {learnerOnly: write});
    }
    const progress = driver.status(A).followerProgress;
    const matchedOf = (replicaId) => progress[driver.cluster.addressOf(
      replicaId)];
    assert.ok([B, C].every((voter) =>
      matchedOf(LEARNER) > matchedOf(voter)),
    'precondition: the learner is further ahead than every voter');
    const termBefore = driver.status(A).term;
    assertAccepted(await driver.port(A).transferLeadership(mostCaughtUp()),
      TRANSFER_REASON.REQUESTED);
    assertTransferInProgress(driver.propose(A, {during: 'transfer'}));
    driver.heal(B);
    driver.heal(C);
    const voterLeads = () => [B, C].some((voter) => driver.leads(voter));
    assert.notEqual(driver.roundsUntil(voterLeads, driver.electionTick()),
      null, 'a most caught-up voter leads within one election timeout');
    const successor = driver.leads(B) ? B : C;
    assert.ok(driver.status(successor).term > termBefore);
    assert.equal(driver.leads(LEARNER), false, 'the learner never leads');
    assert.equal(driver.leads(A), false, 'the old leader stepped down');
  } finally {
    driver.dispose();
  }
});

test('a leader the committed configuration removed answers its dropped ' +
  'proposal as the core\'s refusal, never as a transfer in progress',
async () => {
  const driver = formedGroup('inputs-removed-leader');
  try {
    const selfId = driver.raftIdAt(A, A);
    assert.equal(driver.port(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: A,
    }).outcome, CORE_OK);
    driver.deliver();
    const status = driver.status(A);
    assert.equal(status.confState.voters.includes(selfId), false,
      'precondition: the removal of the leader is committed');
    assert.equal(status.role, RAFT_ROLE.LEADER,
      'precondition: raft-rs keeps the removed leader leading');
    const answer = driver.propose(A, {on: 'removed-leader'});
    assert.equal(answer.outcome, CORE_REFUSED, JSON.stringify(answer));
    assert.notEqual(answer.reason, IN_PROGRESS_REASON,
      'no transfer runs: the drop is the removal\'s');
    assert.equal(answer.retryable, false,
      'the removal\'s drop does not end within an election timeout');
  } finally {
    driver.dispose();
  }
});

// Round 3: the drop causes on a replica that does not lead. raft-rs drops a
// proposal on a candidate (step_candidate) and on a follower that knows no
// leader (step_follower); a follower that knows its leader forwards it, and a
// pre-candidate cannot arise (the production tuning leaves pre-vote off). No
// transfer runs on a non-leader, so no such drop is the retryable
// in-progress answer.
function assertNotTransferDrop(answer) {
  assert.equal(answer.outcome, CORE_REFUSED, JSON.stringify(answer));
  assert.notEqual(answer.reason, IN_PROGRESS_REASON,
    'no transfer runs on a replica that does not lead');
  assert.equal(answer.retryable, false);
}

test('a candidate answers its dropped proposal as the core\'s refusal, ' +
  'never as a transfer in progress', async () => {
  const driver = formedGroup('inputs-candidate-drop');
  try {
    driver.isolate(B);
    driver.port(B).campaign();
    driver.deliver();
    assert.equal(driver.status(B).role, RAFT_ROLE.CANDIDATE,
      'precondition: B stands for election and cannot win cut off');
    assertNotTransferDrop(driver.propose(B, {on: 'candidate'}));
  } finally {
    driver.dispose();
  }
});

test('a follower that knows no leader answers its dropped proposal as the ' +
  'core\'s refusal, never as a transfer in progress', async () => {
  const driver = new TransferLeadershipDriver({
    partitionId: 'inputs-leaderless-drop', replicaIds: REPLICAS});
  try {
    const status = driver.status(B);
    assert.equal(status.role, RAFT_ROLE.FOLLOWER);
    assert.equal(status.leaderId, null, 'precondition: no leader is known');
    assertNotTransferDrop(driver.propose(B, {on: 'leaderless'}));
  } finally {
    driver.dispose();
  }
});
