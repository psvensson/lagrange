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
import {RAFT_MEMBERSHIP_CHANGE_REFUSAL} from
  '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';

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
