// The fifth fork fix of the raft-rs binding (2026-11-11) through the
// production host: a leader that applies its own removal steps down through
// the binding's step_down_removed_leader (the primitive's own witnesses:
// step-down-removed-leader-primitive.test.js).
//
// raft-rs keeps a leader that applied its own removal leading
// (raft.rs post_conf_change: "TODO(tbg): step down (for sanity)") with no
// Progress for itself, and maybe_commit (raft.rs:943) unwraps that Progress
// when an acknowledgement commits an entry the removed leader still held
// uncommitted: on wasm32 an abort of the module, which is one per process.
//
// Real rs-raft ports (TransferLeadershipDriver):
//   - a leader that applies its own removal while it holds an entry of its
//     own term uncommitted stops leading in that same turn, at the apply and
//     before the cycle's advance_append; its port announces FOLLOWER; the
//     acknowledgement that would have committed that entry aborts nothing;
//     an unrelated group in the same runtime keeps working; the voters that
//     remain elect within the stated bound and a write commits.
// The host's two entries (pure): a step-down the binding refuses at the
// apply (a Ready outstanding with messages queued) is entered at the end of
// the same drain, before any further message is stepped.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {removedLeaderAtApply, removedLeaderAtDrainEnd} from
  '../../../src/raft/raft-rs-removed-leader-step-down.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {TransferLeadershipDriver} from './transfer-leadership-driver.js';

const {CORE_OK} = RAFT_OPERATION_OUTCOME;
const STEP_DOWN = 'step_down_removed_leader';
const LEADER_STATE = 2;

// The host's two entries (raft-rs-removed-leader-step-down.js) over one
// removed leader's facts: an uncommitted entry, so the action is STEP_DOWN.
test('a step-down the binding refuses at the apply is entered at the end of ' +
  'the same drain; a transfer is queued only there', () => {
  const removedLeader = (commit, liveVoters) => ({ok: true, value: {
    status: {id: '1', raftState: LEADER_STATE, term: '4', commit,
      progress: [{id: '2', matched: '9', state: 'Replicate'}]},
    confState: {voters: ['2'], votersOutgoing: [], learners: []},
    lastIndex: 10n,
    voterLiveness: {liveVoters, abortedUnheard: [], aborted: [],
      transferRunning: false}}});
  const entered = [];
  const queued = [];
  const refusing = (primitive) => {
    entered.push(`refused:${primitive}`);
    return {ok: false, result: {outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED}};
  };
  const taking = (primitive) => {
    entered.push(`taken:${primitive}`);
    return {ok: true, value: {steppedDown: true, term: '4'}};
  };
  const uncommitted = removedLeader('9', ['1', '2']);
  assert.equal(removedLeaderAtApply({peerId: '1',
    confState: uncommitted.value.confState, observe: () => uncommitted,
    stepDown: refusing}), false, 'refused at the apply: not stepped down');
  assert.equal(removedLeaderAtDrainEnd({peerId: '1', observed: uncommitted,
    stepDown: taking, queueTransfer: (transfer) => queued.push(transfer)}),
  true, 'entered at the end of the drain: the caller drains its Ready');
  assert.deepEqual(entered, [`refused:${STEP_DOWN}`, `taken:${STEP_DOWN}`]);
  // Everything committed and a live voter: a transfer, started only at the
  // end of the drain.
  const committed = removedLeader('10', ['1', '2']);
  assert.equal(removedLeaderAtApply({peerId: '1',
    confState: committed.value.confState, observe: () => committed,
    stepDown: taking}), false);
  assert.equal(removedLeaderAtDrainEnd({peerId: '1', observed: committed,
    stepDown: taking, queueTransfer: (transfer) => queued.push(transfer)}),
  false);
  assert.deepEqual({entered: entered.length, queued: queued.length},
    {entered: 2, queued: 1});
  // A configuration that still names the replica reads nothing at the apply.
  assert.equal(removedLeaderAtApply({peerId: '1',
    confState: {voters: ['1', '2'], votersOutgoing: [], learners: []},
    observe: () => assert.fail('no observation is read'),
    stepDown: taking}), false);
});

const A = 'own-removal-a';
const B = 'own-removal-b';
const S = 'own-removal-s';
const OTHER = Object.freeze(['own-removal-x', 'own-removal-y',
  'own-removal-z']);
// Election timeouts a setup election may take.
const SETUP_TIMEOUTS = 6;
// The bound of the step-down: the voters that remain elect by their own
// timeout, at most two election timeouts after the removed leader's last
// heartbeat (the randomized timeout's upper bound), plus the rounds of the
// pre-vote and the vote.
const STEP_DOWN_BOUND_TIMEOUTS = 2;
const VOTE_ROUNDS = 4;

function isVoter(driver, replicaId) {
  const status = driver.status(replicaId);
  return [...status.confState.voters,
    ...(status.confState.votersOutgoing || [])].includes(status.peerId);
}

/**
 * The race up to S leading with its own RemoveNode(S) uncommitted in its
 * log: A leads; its RemoveNode(S) reaches S only (B cut off); A is cut off
 * with S's acknowledgement; B and S elect S, whose log is the longer.
 * Delivery runs one hop at a time and stops as S becomes leader, before B
 * has seen S's first append.
 * @param {TransferLeadershipDriver} driver
 * @param {Object} away - How A leaves ({leave}).
 */
function subjectLeadsHoldingItsRemoval(driver, away) {
  driver.isolate(B);
  assert.equal(driver.port(A).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: S,
  }).result.outcome, CORE_OK, 'setup: A proposes RemoveNode(S)');
  driver.deliverOnly([S]);
  away.leave(driver);
  driver.heal(B);
  for (let round = 0; round < SETUP_TIMEOUTS * driver.electionTick() &&
      !driver.leads(S); round += 1) {
    driver.port(B).tick();
    driver.port(S).tick();
    driver.deliverOnly([S]);
    if (!driver.leads(S)) driver.deliverOnly([B]);
  }
  assert.equal(driver.leads(S), true, 'setup: S leads');
  assert.equal(isVoter(driver, S), true,
    'setup: S has not applied its own removal yet');
}

// The step-down is entered at the apply: after the apply_conf_change that
// removed the leader (and the reads that decide), before any other core call
// of that Ready cycle - its advance_append above all, whose
// on_persist_entries unwraps the Progress a removed leader no longer has.
const BETWEEN_APPLY_AND_STEP_DOWN = new Set(['set_conf_state', 'status',
  'conf_state']);

function assertSteppedDownAtApply(operations) {
  const steppedDown = operations.lastIndexOf(STEP_DOWN);
  assert.notEqual(steppedDown, -1, 'the host entered step_down_removed_leader');
  const applied = operations.lastIndexOf('apply_conf_change', steppedDown);
  assert.deepEqual(operations.slice(applied + 1, steppedDown)
    .filter((operation) => !BETWEEN_APPLY_AND_STEP_DOWN.has(operation)), [],
  'nothing but the decision\'s reads between the apply and the step-down');
  assert.ok(operations.indexOf('advance_append', applied) > steppedDown,
    'the cycle\'s advance_append comes after the step-down');
}

// The abort this closes was reproduced on the tree before the fix (raft.rs
// 943, maybe_commit: "called `Option::unwrap()` on a `None` value", stepping
// A's acknowledgement of D; the host reported core-trapped, then
// runtime-replaced with every group of the process restored, and the
// unrelated group lost its leader). A away as an isolated replica that keeps
// ticking, and as a crashed one.
const AWAY = Object.freeze({
  isolated: {leave: (driver) => driver.isolate(A),
    back: (driver) => driver.heal(A)},
  crashed: {leave: (driver) => driver.crash(A),
    back: (driver) => driver.recover(A)},
});

for (const [mode, away] of Object.entries(AWAY)) {
  test('a leader that applies its own removal while an entry of its term ' +
  'is uncommitted stops leading in that turn; the acknowledgement that ' +
  'would commit the entry aborts nothing; the remaining voters elect ' +
  `within the bound and a write commits (the other survivor ${mode})`,
  () => ownRemovalWithUncommittedEntry(mode, away));
}

async function ownRemovalWithUncommittedEntry(mode, away) {
  const other = new TransferLeadershipDriver({
    partitionId: `own-removal-unrelated-${mode}`, replicaIds: OTHER});
  // Built last: the process's core-entry observer is the latest cluster's.
  const driver = new TransferLeadershipDriver({
    partitionId: `own-removal-uncommitted-${mode}`, replicaIds: [A, B, S]});
  try {
    driver.form();
    other.form();
    const generation = other.status(OTHER[0]).runtimeGeneration;
    subjectLeadsHoldingItsRemoval(driver, away);
    let followerEvents = 0;
    driver.port(S).subscribe(RAFT_EVENT.FOLLOWER, () => {
      followerEvents += 1;
    });
    // B lacks RemoveNode(S): its first answer is a rejection, and S then
    // sends RemoveNode(S) and its own first entry (probing: one in flight).
    driver.deliverOnly([B]);
    driver.deliverOnly([S]);
    // S takes a write while it is still a voter: entry D, of its own term.
    const pendingWrite = {on: 'the-leader-about-to-be-removed'};
    const accepted = await turnChainValue(driver.port(S).propose(pendingWrite));
    assert.equal(accepted.outcome, CORE_OK, JSON.stringify(accepted));
    const termOfRemoved = driver.status(S).term;
    // B acknowledges RemoveNode(S) and S's first entry, not yet D. In the
    // turn that takes that acknowledgement S commits and applies its own
    // removal with D uncommitted.
    driver.deliverOnly([B]);
    driver.deliverOnly([S]);
    const afterApply = driver.status(S);
    assertSteppedDownAtApply(driver.coreOperations());
    assert.deepEqual({voter: isVoter(driver, S), role: afterApply.role,
      term: afterApply.term}, {voter: false, role: RAFT_ROLE.FOLLOWER,
      term: termOfRemoved},
    'S applied its own removal and stopped leading in the same turn, at ' +
      'its own term');
    assert.equal(driver.applied(S, pendingWrite), false,
      'setup: D was uncommitted when S applied its removal');
    // The port announced the loss of leadership in that turn: the event on
    // which the partition releases every pending write as leadership lost
    // (partition-service-raft-lifecycle-wiring.js, onFollower), so D's
    // proposer is answered an unknown outcome and never waits on S.
    assert.equal(followerEvents, 1, 'FOLLOWER announced once, in that turn');
    // The acknowledgements that would have committed D (raft-rs
    // maybe_commit unwraps the Progress the removed leader no longer has):
    // B's, then A's once A is back. Nothing aborts.
    driver.deliverOnly([B]);
    driver.deliverOnly([S]);
    away.back(driver);
    // A still believes it leads its old term until it hears the group: the
    // successor is the voter that leads a term after the removed leader's.
    const succeeds = (replicaId) => driver.leads(replicaId) &&
      Number(driver.status(replicaId).term) > Number(termOfRemoved);
    const rounds = driver.roundsUntil(() => [A, B].some(succeeds),
      STEP_DOWN_BOUND_TIMEOUTS * driver.electionTick() + VOTE_ROUNDS);
    assert.notEqual(rounds, null, 'a remaining voter leads within ' +
      `${STEP_DOWN_BOUND_TIMEOUTS} election timeouts and ${VOTE_ROUNDS} ` +
      'rounds of the step-down');
    const successor = [A, B].find(succeeds);
    const command = {after: 'own-removal-step-down'};
    const committed = await turnChainValue(
      driver.port(successor).propose(command));
    driver.deliver();
    assert.equal(committed.outcome, CORE_OK, JSON.stringify(committed));
    assert.equal(driver.applied(successor, command), true,
      'the successor takes writes');
    assert.equal(driver.leads(S), false, 'the removed replica never leads');
    assert.equal(driver.status(S).runtimeHealth,
      other.status(OTHER[0]).runtimeHealth);
    // The unrelated group shares the runtime: it was never replaced, and it
    // still commits.
    assert.equal(other.status(OTHER[0]).runtimeGeneration, generation,
      'the shared runtime was not replaced: nothing aborted');
    const unrelated = {unrelated: 'still-working'};
    other.propose(OTHER[0], unrelated);
    assert.equal(other.applied(OTHER[0], unrelated), true);
  } finally {
    driver.dispose();
    other.dispose();
  }
}
