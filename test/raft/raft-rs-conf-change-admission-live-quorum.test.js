// The leader's live-quorum admission (REMOVES_LIVE_QUORUM) refuses a change
// that takes a CURRENT voter out and leaves resulting voters with no live
// quorum. A change that takes no current voter out - a fresh learner, a
// learner promotion - is never refused by it, whatever the leader has heard:
// a leader fresh from its election (only itself live) admits a new learner
// and refuses a removal or demotion of a voter.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {confChangeProposalRefusal} from
  '../../src/raft/raft-rs-conf-change-admission.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {TRANSFEREE_DECISION} from
  '../../src/raft/raft-removal-transferee-rule.js';
import {
  TRANSFER_REASON,
  TransferLeadershipDriver,
  assertRefused,
  mostCaughtUp,
  namedSuccessor,
} from './raft-rs-backend/transfer-leadership-driver.js';

const LEADER_STATE = 2;
const STATUS = Object.freeze({id: 1, raftState: LEADER_STATE, lead: 1,
  pendingConfIndex: 0, applied: 10});
const CONF = Object.freeze({voters: [1, 2, 3], votersOutgoing: [],
  learners: [4], learnersNext: []});
const ONLY_LEADER_LIVE = new Set(['1']);
const ALL_LIVE = new Set(['1', '2', '3', '4']);

function refusal(changes, liveVoters) {
  return confChangeProposalRefusal({status: STATUS, confState: CONF,
    change: {changes}, leaderReplicaIdOf: () => 'leader', liveVoters});
}

test('a fresh learner and a learner promotion take no voter out and are ' +
  'admitted with only the leader live', () => {
  assert.equal(refusal([{changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
    nodeId: 5}], ONLY_LEADER_LIVE), null, 'a fresh learner');
  assert.equal(refusal([{changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
    nodeId: 4}], ONLY_LEADER_LIVE), null, 'a learner promoted to voter');
});

test('a removal or demotion of a current voter without a live resulting ' +
  'quorum is refused, and admitted once the survivors are live', () => {
  for (const changeType of [RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE,
    RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE]) {
    const changes = [{changeType, nodeId: 3}];
    assert.equal(refusal(changes, ONLY_LEADER_LIVE)?.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LIVE_QUORUM,
      `change type ${changeType} of a voter with only the leader live`);
    assert.equal(refusal(changes, ALL_LIVE), null,
      `change type ${changeType} of a voter with the survivors live`);
  }
  // A REPLACE step pair (AddNode t, RemoveNode s) still takes s out.
  assert.equal(refusal([
    {changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE, nodeId: 4},
    {changeType: RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE, nodeId: 3},
  ], ONLY_LEADER_LIVE)?.reason, RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LIVE_QUORUM);
});

// The record the admission reads is one tenure's (raft-rs-voter-liveness.js).
// Real rs-raft ports, time moved only by explicit ticks: A leads and hears
// its voters, hands leadership to B and is elected again within the
// liveness window, all without a tick. Before it has heard its voters in
// its new tenure, its port refuses a removal (REMOVES_LIVE_QUORUM); the
// acknowledgements of its first entry are heard, VOTER_LIVENESS_CHANGED is
// announced, and the same removal is admitted and commits.
const TENURE = Object.freeze({A: 'tenure-a', B: 'tenure-b', C: 'tenure-c'});

test('a leader re-elected within the liveness window refuses a removal ' +
  'until it has heard its voters in this tenure, and admits it after',
async () => {
  const driver = new TransferLeadershipDriver({partitionId:
    'live-quorum-re-elected', replicaIds: Object.values(TENURE)});
  try {
    driver.form();
    driver.round();
    assert.equal(driver.leads(TENURE.A), true, 'setup: A leads');
    assert.equal((await turnChainValue(driver.port(TENURE.A)
      .transferLeadership(namedSuccessor(TENURE.B)))).outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK, 'setup: A hands leadership to B');
    driver.deliver();
    assert.equal(driver.leads(TENURE.B), true, 'setup: B leads');
    // B hands it straight back; the election runs envelope by envelope and
    // stops as A becomes leader, before its voters answer its first entry.
    assert.equal((await turnChainValue(driver.port(TENURE.B)
      .transferLeadership(namedSuccessor(TENURE.A)))).outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK, 'setup: B hands leadership back');
    driver.deliverOnly([TENURE.A]);
    driver.deliverOnly([TENURE.B, TENURE.C]);
    driver.deliverOnly([TENURE.A]);
    assert.equal(driver.leads(TENURE.A), true, 'setup: A leads again');
    const announced = [];
    driver.port(TENURE.A).subscribe(RAFT_EVENT.VOTER_LIVENESS_CHANGED,
      () => announced.push(driver.status(TENURE.A).liveVoters));
    const removeC = {type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity: TENURE.C};
    const refused = await turnChainValue(
      driver.port(TENURE.A).proposeConfChange(removeC));
    assert.deepEqual({outcome: refused.outcome, reason: refused.reason,
      retryable: refused.retryable}, {
      outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      reason: RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LIVE_QUORUM,
      retryable: true}, 'nobody heard in this tenure: refused');
    driver.deliver();
    assert.ok(announced.length > 0,
      'hearing its voters announced VOTER_LIVENESS_CHANGED');
    const admitted = await turnChainValue(
      driver.port(TENURE.A).proposeConfChange(removeC));
    assert.equal(admitted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      JSON.stringify(admitted));
    driver.deliver();
    assert.equal(driver.status(TENURE.A).confState.voters
      .includes(driver.raftIdAt(TENURE.A, TENURE.C)), false,
    'the re-driven removal committed');
  } finally {
    driver.dispose();
  }
});

// raft-rs marks a peer recent_active the moment its Progress is created
// (tracker.rs apply_conf: "When a node is first added, we should mark it as
// recently active"), before the peer has answered anything. A liveness read
// off that flag counts a just-added voter that never answers as live: a
// removal whose resulting quorum needs it is admitted and leaves a
// configuration that cannot commit, and the transferee rule may name it. A
// voter is live only on its own answer at the leader's term.
const SILENT = Object.freeze({A: 'silent-a', B: 'silent-b',
  ADDED: 'silent-added'});

test('a just-added voter that never answers is not live: it does not count ' +
  'toward the live quorum of a removal, and is never chosen as a transferee',
async () => {
  const driver = new TransferLeadershipDriver({partitionId:
    'live-quorum-silent-added-voter', replicaIds: [SILENT.A, SILENT.B]});
  try {
    driver.form();
    driver.round();
    // No replica is ever built for the added voter: it answers nothing.
    const addedId = driver.reserveEverywhere(SILENT.ADDED);
    const added = await turnChainValue(driver.port(SILENT.A).proposeConfChange(
      {type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
        replicaIdentity: SILENT.ADDED, nodeId: 'silent-added-node'}));
    assert.equal(added.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      JSON.stringify(added));
    driver.deliver();
    const status = driver.status(SILENT.A);
    const bId = driver.raftIdAt(SILENT.A, SILENT.B);
    assert.ok(status.confState.voters.includes(addedId),
      'setup: the added replica is a voter of the applied configuration');
    assert.deepEqual([...status.liveVoters].sort(), [status.peerId, bId].sort(),
      'the leader counts itself and the voter that answered, never the ' +
      'added voter that has not');
    // Removing B leaves {A, added}: its quorum needs the silent voter.
    const refused = await turnChainValue(driver.port(SILENT.A)
      .proposeConfChange({type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
        replicaIdentity: SILENT.B}));
    assert.deepEqual({outcome: refused.outcome, reason: refused.reason,
      retryable: refused.retryable}, {
      outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      reason: RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LIVE_QUORUM,
      retryable: true},
    'the resulting voters hold no live quorum: refused, nothing proposed');
    assert.ok(driver.status(SILENT.A).confState.voters.includes(bId));
    // The transferee rule: B's transfer aborts unheard (B is cut off), so B
    // is excluded; the only other voter is the silent one, and it is not
    // named.
    driver.isolate(SILENT.B);
    assert.equal((await turnChainValue(driver.port(SILENT.A)
      .transferLeadership(namedSuccessor(SILENT.B)))).outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK, 'setup: a transfer to B is stepped');
    for (let tick = 0; tick < driver.electionTick(); tick += 1) {
      driver.port(SILENT.A).tick();
      driver.loseInTransit(SILENT.B);
    }
    assert.equal(driver.leads(SILENT.A), true,
      'setup: the transfer aborted and A still leads');
    const answer = await turnChainValue(
      driver.port(SILENT.A).transferLeadership(mostCaughtUp()));
    assertRefused(answer, TRANSFER_REASON.NO_ELIGIBLE_SUCCESSOR);
    assert.equal(answer.transfereeDecision,
      TRANSFEREE_DECISION.NO_LIVE_TRANSFEREE,
      'the silent added voter is never the transferee');
  } finally {
    driver.dispose();
  }
});
