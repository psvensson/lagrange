/**
 * Two residuals of the removal hazard work, read and pinned (2026-11-11):
 *  - the removed-leader step-down (stepDownIfRemovedLeader in
 *    raft-rs-runtime-owner.js) asks the core for a MOST_CAUGHT_UP transfer;
 *    that decision never names a learner, the removed leader itself or a
 *    peer outside the configuration, and with no eligible voter it is a
 *    typed refusal (nothing stepped) - never a transfer to a non-voter. The
 *    runtime asks at most once per queued turn (removedLeaderStepDownQueued),
 *    so a group with no caught-up voter re-asks once per later drain, never
 *    in a loop of its own turns.
 *  - VOTER_LIVENESS_CHANGED is raised only when the leader's live voter set
 *    changes (and on the first sample of a leadership), never per heartbeat:
 *    a live voter whose recentActive flag check-quorum clears every election
 *    timeout stays in the window and changes nothing.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  decideLeadershipTransfer,
  removedLeaderStepDown,
} from '../../src/raft/raft-rs-leadership-transfer.js';
import {
  createVoterLiveness,
  countVoterLivenessTick,
  sampleVoterLiveness,
} from '../../src/raft/raft-rs-voter-liveness.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';

const LEADER_STATE = 2;
const FOLLOWER_STATE = 0;
const ELECTION_TICK = 10;
const leads = (status) => status.raftState === LEADER_STATE;

function leaderStatus(progress) {
  return {id: '1', raftState: LEADER_STATE, lead: '1', progress};
}

test('a removed leader\'s step-down names only a voter of the configuration ' +
  'that removed it, and refuses typed when there is none', () => {
  const confState = {voters: ['2', '3'], votersOutgoing: [], learners: ['4']};
  const status = leaderStatus([
    {id: '1', matched: '50'}, {id: '2', matched: '10'},
    {id: '3', matched: '40'}, {id: '4', matched: '99'}]);
  const transfer = removedLeaderStepDown('1', {status, confState});
  assert.notEqual(transfer, null, 'removed outright: it asks');
  const decided = decideLeadershipTransfer('1', {status, confState}, transfer);
  assert.equal(decided.transferee, '3',
    'the most caught-up VOTER, never the learner (4) or itself');
  const learnersOnly = {voters: [], votersOutgoing: [], learners: ['4']};
  const none = decideLeadershipTransfer('1', {status,
    confState: learnersOnly}, transfer);
  assert.equal(none.transferee, undefined, 'nothing stepped');
  assert.equal(none.answer.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    'a typed refusal when no voter can take it');
  assert.equal(removedLeaderStepDown('1', {status,
    confState: {voters: ['1', '2'], votersOutgoing: [], learners: []}}), null,
  'a leader its configuration still names never asks');
});

test('VOTER_LIVENESS_CHANGED fires on a change of the live set, never per ' +
  'heartbeat', () => {
  const liveness = createVoterLiveness();
  const changes = [];
  const progress = (twoActive, threeActive) => leaderStatus([
    {id: '2', recentActive: twoActive}, {id: '3', recentActive: threeActive}]);
  // 50 election timeouts of samples: voter 2 heard every heartbeat but its
  // flag cleared once per election timeout; voter 3 dies at tick 200.
  for (let tick = 1; tick <= 50 * ELECTION_TICK; tick += 1) {
    countVoterLivenessTick(liveness);
    const flagCleared = tick % ELECTION_TICK === 0;
    if (sampleVoterLiveness(liveness, progress(!flagCleared,
      tick < 200 && !flagCleared), ELECTION_TICK, leads)) {
      changes.push(tick);
    }
  }
  assert.equal(changes[0], 1, 'the first sample of the leadership');
  assert.equal(changes.length, 2,
    `exactly one more change, when voter 3 left the window (${changes})`);
  assert.ok(changes[1] > 200 && changes[1] <= 200 + 2 * ELECTION_TICK + 1,
    'about two election timeouts after it went silent');
  // A follower samples nothing.
  assert.equal(sampleVoterLiveness(liveness, {id: '1',
    raftState: FOLLOWER_STATE, progress: []}, ELECTION_TICK, leads), false);
});
