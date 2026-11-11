// A leader is never the replica that removes itself, and a leader its own
// configuration removed does not stay leading (B2, 2026-11-11).
//
// raft-rs keeps a leader that applied its own removal leading
// (post_conf_change) while it drops every proposal for good - it has no
// progress for itself - so its group is led by a replica that takes no
// write until something ends its leadership. Two lines hold at the raft
// owner:
//   - the leader's own port refuses a change that removes (or demotes) the
//     leader itself: typed REMOVES_LEADER, retryable (another leader makes
//     it), nothing handed to the core;
//   - a removed leader can still arise from a race no proposal check closes:
//     a removal another leader proposed reaches the subject's log, the
//     subject wins the next election holding it, commits and applies it. It
//     then hands leadership to the most caught-up voter of the configuration
//     that removed it.
//
// Real rs-raft ports through the provider seam; time moves only by explicit
// ticks (TransferLeadershipDriver).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {IN_PROGRESS_REASON, TransferLeadershipDriver} from
  './transfer-leadership-driver.js';

const {CORE_OK, CORE_REFUSED} = RAFT_OPERATION_OUTCOME;
const A = 'step-down-replica-a';
const B = 'step-down-replica-b';
const C = 'step-down-replica-c';
const REPLICAS = Object.freeze([A, B, C]);
// Election timeouts a test allows for an election to settle.
const ELECTION_TIMEOUTS = 6;

function formedGroup(partitionId) {
  const driver = new TransferLeadershipDriver({
    partitionId, replicaIds: REPLICAS});
  driver.form();
  return driver;
}

function isVoter(driver, replicaId) {
  const status = driver.status(replicaId);
  return [...status.confState.voters,
    ...(status.confState.votersOutgoing || [])].includes(status.peerId);
}

function settledTurns() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Rounds with the event loop turning between them, so a turn the runtime
// queued (the removed leader's hand-off) runs as it would in production.
async function roundsUntil(driver, predicate, bound) {
  for (let round = 0; round <= bound; round += 1) {
    if (predicate()) return round;
    driver.round();
    await settledTurns();
  }
  return null;
}

/**
 * The race: A leads; its RemoveNode(C) reaches C's log only (B cut off,
 * C's acknowledgement lost with A cut off); B and C elect C, whose log is
 * the longer; C commits its term's first entry and with it the entry that
 * removes it. Returns once C leads and has applied its own removal (the
 * driver's synchronous rounds give the runtime no turn in between).
 * @param {TransferLeadershipDriver} driver
 */
function removedLeaderByRace(driver) {
  driver.isolate(B);
  assert.equal(driver.port(A).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: C,
  }).result.outcome, CORE_OK, 'setup: A proposes RemoveNode(C)');
  driver.deliverOnly([C]);
  // C's acknowledgement waits in A's inbox; cutting A off loses it.
  driver.isolate(A);
  driver.heal(B);
  const rounds = driver.roundsUntil(() => driver.leads(C) &&
    !isVoter(driver, C), ELECTION_TIMEOUTS * driver.electionTick());
  assert.notEqual(rounds, null,
    'setup: C won the election holding RemoveNode(C) and applied it');
}

test('the leader\'s port refuses a change that removes the leader itself, ' +
  'typed and retryable, and hands the core nothing', async () => {
  const driver = formedGroup('step-down-self-removal-refused');
  try {
    const before = driver.status(A).confState.voters;
    const answer = await turnChainValue(driver.port(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: A}));
    driver.deliver();
    driver.round();
    assert.deepEqual({
      outcome: answer.outcome, reason: answer.reason,
      retryable: answer.retryable, voters: driver.status(A).confState.voters,
      leads: driver.leads(A),
    }, {
      outcome: CORE_REFUSED,
      reason: RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LEADER,
      retryable: true, voters: before, leads: true,
    });
    // The same removal at a leader it does not remove commits.
    const removed = await turnChainValue(driver.port(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: C}));
    driver.deliver();
    assert.equal(removed.outcome, CORE_OK);
    assert.equal(driver.status(A).confState.voters
      .includes(driver.raftIdAt(A, C)), false, 'RemoveNode(C) committed');
  } finally {
    driver.dispose();
  }
});

test('a leader that applied its own removal (the race no proposal check ' +
  'closes) answers its proposals with the core\'s own non-retryable ' +
  'refusal, and hands leadership on to a voter of the configuration that ' +
  'removed it', async () => {
  const driver = formedGroup('step-down-removed-leader');
  try {
    removedLeaderByRace(driver);
    const termOfRemoved = driver.status(C).term;
    const answer = await turnChainValue(
      driver.port(C).propose({on: 'removed-leader'}));
    assert.equal(answer.outcome, CORE_REFUSED, JSON.stringify(answer));
    assert.notEqual(answer.reason, IN_PROGRESS_REASON,
      'the drop is the removal\'s, never a transfer window');
    assert.equal(answer.retryable, false);
    // The configuration that removed C is {A, B}: its quorum needs A back.
    driver.heal(A);
    const rounds = await roundsUntil(driver, () => !driver.leads(C) &&
      [A, B].some((replicaId) => driver.leads(replicaId)),
    ELECTION_TIMEOUTS * driver.electionTick());
    assert.notEqual(rounds, null,
      'the removed leader handed leadership to a voter that leads');
    const successor = driver.leads(A) ? A : B;
    assert.ok(driver.status(successor).term > termOfRemoved);
    const command = {after: 'step-down'};
    const accepted = await turnChainValue(driver.port(successor)
      .propose(command));
    driver.deliver();
    assert.equal(accepted.outcome, CORE_OK, JSON.stringify(accepted));
    assert.equal(driver.applied(successor, command), true,
      'the successor takes writes');
    assert.equal(driver.status(C).role === RAFT_ROLE.LEADER, false,
      'the removed replica never leads again');
  } finally {
    driver.dispose();
  }
});
