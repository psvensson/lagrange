/**
 * The removed leader's action and the leader's voter-liveness record
 * (2026-11-11), pinned at their bound:
 *  - a leader its applied configuration no longer names acts by one table
 *    (removedLeaderAction, raft-rs-leadership-transfer.js): with an entry of
 *    its log uncommitted it STEPS DOWN (the binding's
 *    step_down_removed_leader); with everything committed it TRANSFERS to
 *    the voter the transferee rule names over its own facts - never a
 *    learner, the removed leader itself or a peer outside the configuration;
 *    only a voter that answered in this tenure whose progress is not waiting
 *    on a snapshot - awaits a transfer it stepped while it runs, and STEPS
 *    DOWN when the rule names nobody (NO_LIVE_TRANSFEREE) or the
 *    configuration is joint. A transferee whose transfer aborted is passed
 *    over and excluded until heard again, so a dead successor is asked once
 *    per tenure. The real group witnesses are
 *    removed-leader-step-down.test.js and
 *    removed-leader-binding-step-down.test.js.
 *  - a voter is live on a message receipt: an append or heartbeat response
 *    at the leader's own term that the core took (recordVoterAnswer). The
 *    core's recent_active flag is not read: raft-rs sets it when a peer is
 *    added, before the peer has answered anything.
 *  - VOTER_LIVENESS_CHANGED is raised only when the leader's live voter set
 *    changes (and on the first sample of a leadership), never per heartbeat.
 *  - the record is one tenure's: losing leadership clears it, a leader
 *    re-elected within the window counts nobody it heard before, and a peer
 *    the configuration no longer holds is pruned.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  REMOVED_LEADER_ACTION,
  REMOVED_LEADER_STEP_DOWN_CAUSE,
  decideLeadershipTransfer,
  removedLeaderAction,
} from '../../src/raft/raft-rs-leadership-transfer.js';
import {TRANSFEREE_DECISION} from
  '../../src/raft/raft-removal-transferee-rule.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../src/raft/raft-rs-ingress-constants.js';
import {
  countVoterLivenessTick,
  createVoterLiveness,
  liveVotersOf,
  recordTransferAttempt,
  recordVoterAnswer,
  sampleVoterLiveness,
  voterLivenessFactsOf,
} from '../../src/raft/raft-rs-voter-liveness.js';

const LEADER_STATE = 2;
const FOLLOWER_STATE = 0;
const ELECTION_TICK = 10;
const TERM = '4';
const LAST_INDEX = 50n;
const {TRANSFER, STEP_DOWN, AWAIT_TRANSFER, NONE} = REMOVED_LEADER_ACTION;
const leads = (status) => status.raftState === LEADER_STATE;

function leaderStatus(progress, term = TERM, commit = String(LAST_INDEX)) {
  return {id: '1', raftState: LEADER_STATE, lead: '1', term, commit, progress};
}

// A voter's progress as the core reports it. recentActive is true on every
// one, as raft-rs leaves it for a peer just added: it must count for
// nothing. `answers: false` is a voter that never answers; `silentFrom` the
// tick from which it stops.
function voterProgress(id, matched, extra = {}) {
  return {id, matched: String(matched), state: 'Replicate',
    recentActive: true, answers: true, ...extra};
}

function heartbeatAnswer(from, term = TERM) {
  return {msgType: RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE, from, term};
}

// One tick of a leading group: the tick, the answers its voters gave (stepped
// before the drain's sample, as the runtime owner does), the sample.
function leaderTick(liveness, status, answering) {
  countVoterLivenessTick(liveness);
  for (const peerId of answering) {
    recordVoterAnswer(liveness, heartbeatAnswer(peerId, status.term));
  }
  return sampleVoterLiveness(liveness, status, ELECTION_TICK, leads);
}

// The removed leader '1' of the configuration {2, 3} (learner 4): its
// observation as the runtime owner records it, after `ticks` ticks.
function removedLeader({progress, ticks = 1, attempts = [],
  commit = String(LAST_INDEX), confState = {voters: ['2', '3'],
    votersOutgoing: [], learners: ['4']}}) {
  const liveness = createVoterLiveness();
  const status = leaderStatus(progress, TERM, commit);
  // The first sample of the tenure: the drain in which it became leader.
  sampleVoterLiveness(liveness, status, ELECTION_TICK, leads);
  for (let tick = 0; tick < ticks; tick += 1) {
    const now = liveness.ticks + 1;
    const attempt = attempts.find((entry) => entry.atTick === now);
    const answering = progress.filter((item) => item.answers === true &&
      (item.silentFrom === undefined || now < item.silentFrom))
      .map((item) => item.id);
    leaderTick(liveness, status, answering);
    if (attempt) recordTransferAttempt(liveness, status, attempt.transferee);
  }
  return {status, confState, lastIndex: LAST_INDEX,
    voterLiveness: voterLivenessFactsOf(liveness, status, ELECTION_TICK)};
}

// The transferee the queued transfer turn names for a TRANSFER action.
function transfereeOf(observation) {
  const decided = removedLeaderAction('1', observation);
  assert.equal(decided.action, TRANSFER, JSON.stringify(decided));
  return decideLeadershipTransfer('1', observation, decided.transfer)
    .transferee;
}

test('the removed leader\'s table: TRANSFER names only a voter that ' +
  'answered in this tenure; with nobody to name, a joint configuration or ' +
  'an uncommitted entry it steps down', () => {
  assert.equal(transfereeOf(removedLeader({progress: [voterProgress('1', 50),
    voterProgress('2', 40), voterProgress('3', 45),
    voterProgress('4', 99)]})), '3',
  'the most caught-up live VOTER, never the learner (4) or itself');
  assert.deepEqual(removedLeaderAction('1', removedLeader({progress: [
    voterProgress('2', 40, {state: 'Snapshot'}),
    voterProgress('3', 45, {answers: false})]})),
  {action: STEP_DOWN, cause: TRANSFEREE_DECISION.NO_LIVE_TRANSFEREE},
  'a voter waiting on a snapshot, or one that never answered in this ' +
    'tenure (recent_active set or not), qualifies not: it steps down');
  assert.equal(transfereeOf(removedLeader({progress: [voterProgress('2', 0,
    {state: 'Probe'})]})), '2',
  'a live voter the core can catch up by appends qualifies: raft-rs ' +
    'sends MsgTimeoutNow only once it holds the last index');
  assert.deepEqual(removedLeaderAction('1', removedLeader({
    progress: [voterProgress('2', 40), voterProgress('3', 45)],
    confState: {voters: ['2', '3'], votersOutgoing: ['2', '5'],
      learners: []}})),
  {action: STEP_DOWN, cause: TRANSFEREE_DECISION.JOINT_CONFIGURATION},
  'no transferee inside a joint configuration: it steps down');
  // An entry of its log uncommitted: the transferee\'s own acknowledgement
  // could commit it (raft-rs maybe_commit unwraps the progress the removed
  // leader no longer has), so no transfer is started, whoever is live.
  assert.deepEqual(removedLeaderAction('1', removedLeader({
    progress: [voterProgress('2', 49), voterProgress('3', 49)],
    commit: String(LAST_INDEX - 1n)})),
  {action: STEP_DOWN,
    cause: REMOVED_LEADER_STEP_DOWN_CAUSE.UNCOMMITTED_ENTRIES});
  const observation = removedLeader({progress: [voterProgress('2', 40)]});
  assert.deepEqual([
    removedLeaderAction('1', {...observation,
      confState: {voters: ['1', '2'], votersOutgoing: [], learners: []}}),
    removedLeaderAction('1', {...observation,
      confState: {voters: ['2'], votersOutgoing: [], learners: ['1']}}),
    removedLeaderAction('1', {...observation, status: {...observation.status,
      raftState: FOLLOWER_STATE}}),
  ].map((decided) => decided.action), [NONE, NONE, NONE],
  'a leader its configuration still names (a voter, or demoted to a ' +
    'learner) and a replica that does not lead are not this case');
});

test('the bound: a dead transferee is asked once per tenure; the next live ' +
  'voter is named once its transfer aborted, and with none the leader ' +
  'steps down', () => {
  // Voter 3 is the most caught up and dies at tick 5; the transfer to it is
  // stepped at tick 4.
  const progress = [voterProgress('2', 40), voterProgress('3', 45,
    {silentFrom: 5})];
  const attempts = [{atTick: 4, transferee: '3'}];
  assert.equal(removedLeaderAction('1', removedLeader({progress,
    ticks: 4 + ELECTION_TICK - 1, attempts})).action, AWAIT_TRANSFER,
  'while the transfer runs (one election timeout) nothing is asked');
  assert.equal(transfereeOf(removedLeader({progress,
    ticks: 4 + ELECTION_TICK, attempts})), '2',
  'the aborted, unheard transferee is passed over for the live voter');
  assert.deepEqual(removedLeaderAction('1', removedLeader({progress: [
    voterProgress('3', 45, {silentFrom: 5})], ticks: 4 + ELECTION_TICK,
  attempts})), {action: STEP_DOWN,
    cause: TRANSFEREE_DECISION.NO_LIVE_TRANSFEREE},
  'never the dead transferee again while it is unheard: it steps down');
  assert.equal(transfereeOf(removedLeader({progress: [
    voterProgress('2', 40), voterProgress('3', 45)],
  ticks: 4 + ELECTION_TICK + 1, attempts})), '2',
  'a transferee heard again is eligible but ranks after a voter not yet ' +
    'passed over');
  assert.equal(transfereeOf(removedLeader({progress: [
    voterProgress('3', 45)], ticks: 4 + ELECTION_TICK + 1, attempts})), '3',
  'and is named again when it is the only one');
});

test('a voter is live on its own answer at the leader\'s term, from the ' +
  'first one; recent_active, a response of another term and any other ' +
  'message count for nothing', () => {
  const liveness = createVoterLiveness();
  // The core reports every peer recent_active, as it does for a peer just
  // added (tracker.rs apply_conf) before the peer has answered anything.
  const status = leaderStatus([voterProgress('2', 0), voterProgress('3', 0)]);
  const live = () => [...liveVotersOf(liveness, status, ELECTION_TICK)].sort();
  recordVoterAnswer(liveness, heartbeatAnswer('2'));
  sampleVoterLiveness(liveness, status, ELECTION_TICK, leads);
  assert.deepEqual(live(), ['1'],
    'an answer before the tenure\'s record exists, and recent_active on ' +
    'every sample, make nobody live');
  recordVoterAnswer(liveness, heartbeatAnswer('2', '3'));
  recordVoterAnswer(liveness, {msgType: RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE,
    from: '2', term: TERM});
  recordVoterAnswer(liveness, {msgType: RAFT_RS_MESSAGE_TYPE.APPEND,
    from: '2', term: TERM});
  assert.deepEqual(live(), ['1'],
    'a response of an earlier term, a vote request and an append are no ' +
    'answer to this leader');
  recordVoterAnswer(liveness, {msgType: RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE,
    from: '2', term: TERM});
  assert.deepEqual(live(), ['1', '2'], 'live from its first answer');
  recordVoterAnswer(liveness, heartbeatAnswer('3'));
  assert.deepEqual(live(), ['1', '2', '3']);
  // The window: two election timeouts after its last answer.
  for (let tick = 0; tick < 2 * ELECTION_TICK; tick += 1) {
    leaderTick(liveness, status, ['2']);
  }
  assert.deepEqual(live(), ['1', '2', '3'], 'inside the window');
  leaderTick(liveness, status, ['2']);
  assert.deepEqual(live(), ['1', '2'], 'a voter silent past the window');
});

test('VOTER_LIVENESS_CHANGED fires on a change of the live set, never per ' +
  'heartbeat', () => {
  const liveness = createVoterLiveness();
  const changes = [];
  // The core's flag is cleared once per election timeout by check-quorum;
  // it is not read, so the samples carry it as noise.
  const status = (tick) => leaderStatus([
    {id: '2', recentActive: tick % ELECTION_TICK !== 0},
    {id: '3', recentActive: tick % ELECTION_TICK !== 0}]);
  // 50 election timeouts: voter 2 answers every heartbeat; voter 3 dies at
  // tick 200.
  for (let tick = 1; tick <= 50 * ELECTION_TICK; tick += 1) {
    if (leaderTick(liveness, status(tick), tick < 200 ? ['2', '3'] : ['2'])) {
      changes.push(tick);
    }
  }
  assert.equal(changes[0], 1, 'the first sample of the leadership');
  assert.deepEqual(changes.slice(1, 2), [2],
    'its voters\' first answers, recorded once the tenure is held');
  assert.equal(changes.length, 3,
    `exactly one more change, when voter 3 left the window (${changes})`);
  assert.ok(changes[2] > 200 && changes[2] <= 200 + 2 * ELECTION_TICK + 1,
    'about two election timeouts after it went silent');
  // A follower samples nothing.
  assert.equal(sampleVoterLiveness(liveness, {id: '1',
    raftState: FOLLOWER_STATE, progress: []}, ELECTION_TICK, leads), false);
});

test('the record is one tenure\'s: a leader re-elected within the window ' +
  'counts only itself until it hears its voters again; removed peers are ' +
  'pruned', () => {
  const both = (term) => leaderStatus([{id: '2'}, {id: '3'}], term);
  const liveness = createVoterLiveness();
  sampleVoterLiveness(liveness, both('4'), ELECTION_TICK, leads);
  leaderTick(liveness, both('4'), ['2', '3']);
  assert.deepEqual([...liveVotersOf(liveness, both('4'),
    ELECTION_TICK)].sort(), ['1', '2', '3'], 'setup: both heard');
  // Leadership lost, then regained at term 6 one tick later.
  countVoterLivenessTick(liveness);
  sampleVoterLiveness(liveness, {id: '1', raftState: FOLLOWER_STATE,
    term: '5', progress: []}, ELECTION_TICK, leads);
  assert.deepEqual([...liveVotersOf(liveness, both('6'), ELECTION_TICK)],
    ['1'], 'a re-elected leader before its first sample: only itself');
  // A late answer to the earlier tenure is no answer to this one.
  sampleVoterLiveness(liveness, both('6'), ELECTION_TICK, leads);
  recordVoterAnswer(liveness, heartbeatAnswer('2', '4'));
  assert.deepEqual([...liveVotersOf(liveness, both('6'), ELECTION_TICK)],
    ['1'], 'nothing heard in the new tenure: only itself');
  // A tenure that changed without a follower sample in between (two drains
  // apart at different terms) is cleared too.
  const direct = createVoterLiveness();
  sampleVoterLiveness(direct, both('4'), ELECTION_TICK, leads);
  leaderTick(direct, both('4'), ['2', '3']);
  countVoterLivenessTick(direct);
  sampleVoterLiveness(direct, both('7'), ELECTION_TICK, leads);
  assert.deepEqual([...liveVotersOf(direct, both('7'), ELECTION_TICK)],
    ['1'], 'a new term clears what the earlier tenure heard');
  leaderTick(direct, both('7'), ['2', '3']);
  assert.deepEqual([...liveVotersOf(direct, both('7'),
    ELECTION_TICK)].sort(), ['1', '2', '3'], 'heard in this tenure: live');
  // Voter 3 removed: no progress any more, pruned at the next sample.
  sampleVoterLiveness(direct, leaderStatus([{id: '2'}], '7'), ELECTION_TICK,
    leads);
  assert.deepEqual([...direct.lastActiveTick.keys()], ['2'],
    'the removed peer is pruned');
});
