// Property over the removal subject's leadership owner
// (partition-service-removal-subject-handoff.js) and the removal transferee
// rule (raft-removal-transferee-rule.js): for every leader position x timing
// of the subject's retiring row x transferee availability x answer to the
// first transfer, the subject
//   - asks a transfer only while its own row retires it AND it leads;
//   - never names itself, never a voter that has not answered this leader,
//     is unrouted or is behind the configuration's entry, and never inside a
//     joint configuration;
//   - after a transfer that was refused or ran out, names another eligible
//     voter when one exists (never the same refusing one forever);
//   - with no eligible survivor waits NO_TRANSFEREE, re-evaluating on the
//     transfer window only when other voters exist (a lone voter waits for
//     an admission, never a timer);
//   - asks nothing once its row serves again.
// The port is a double answering the leader's own status facts; the real
// group witnesses are partition-removal-subject-leadership.test.js.

import assert from 'node:assert/strict';
import {mock, test} from 'node:test';

import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {PEER_ADDRESS_STATUS} from
  '../../src/raft/raft-rs-runtime-owner-constants.js';
import {settledTurn} from '../../src/raft/raft-rs-turn-answer.js';
import {
  REMOVAL_SUBJECT_HANDOFF_STATE as STATE,
  observeRemovalSubjectRetained,
  observeRemovalSubjectRetiring,
  removalSubjectHandoffStateOf,
  subscribeRemovalSubjectHandoff,
} from '../../src/partition/partition-service-removal-subject-handoff.js';
import {chooseRemovalTransferee} from
  '../../src/raft/raft-removal-transferee-rule.js';

const SUBJECT = 's';
const PEERS = Object.freeze({s: '1', x: '2', y: '3'});
const GENERATION = 5;
const TIMING = Object.freeze({heartbeatMs: 50, baseElectionMinMs: 150,
  baseElectionMaxMs: 300, electionMinMs: 150, electionMaxMs: 300,
  tickIntervalMs: 10});
const WINDOW_BOUND_MS = 60_000;

// Each survivor's availability: eligible, silent (has not answered this
// leader), unrouted, behind (below the configuration's entry).
const AVAILABILITY = Object.freeze({
  ELIGIBLE: {matched: 9, routed: true},
  SILENT: {matched: 0, routed: true},
  UNROUTED: {matched: 9, routed: false},
  BEHIND: {matched: GENERATION - 1, routed: true},
});
const ELIGIBLE_KINDS = new Set([AVAILABILITY.ELIGIBLE]);

function statusOf(world) {
  const voters = world.voters.map((id) => PEERS[id]);
  const peers = world.voters.filter((id) => id !== SUBJECT).map((id) => ({
    peerId: PEERS[id], replicaIdentity: id, learner: false,
    addressStatus: world.availability[id].routed ?
      PEER_ADDRESS_STATUS.RESOLVED : PEER_ADDRESS_STATUS.UNAVAILABLE,
  }));
  return Object.freeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    peerId: PEERS[SUBJECT], replicaIdentity: SUBJECT, term: 3,
    voterCount: voters.length,
    role: world.leader === SUBJECT ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
    membershipGenerationIndex: GENERATION,
    confState: {voters, votersOutgoing: world.joint ? [PEERS.y] : [],
      learners: []},
    peers,
    // The leader's voter-liveness record: a silent survivor was never heard
    // in this tenure.
    liveVoters: [PEERS[SUBJECT], ...peers.filter((peer) =>
      world.availability[peer.replicaIdentity] !== AVAILABILITY.SILENT)
      .map((peer) => peer.peerId)],
    followerProgress: Object.fromEntries(peers.map((peer) =>
      [peer.replicaIdentity,
        world.availability[peer.replicaIdentity].matched])),
  });
}

function fakeService(world) {
  const listeners = new Map();
  const service = {
    replicaId: SUBJECT, partitionId: 'prop-p1', isShutdown: false,
    replicaIds: world.voters, raftTimingConfig: TIMING,
    logger: {info() {}, warn() {}, debug() {}, error() {}},
    requests: [],
    raft: {
      readStatus: () => statusOf(world),
      subscribe: (event, listener) => {
        listeners.set(event, [...(listeners.get(event) || []), listener]);
      },
    },
    requestLeadershipTransfer(request) {
      service.requests.push(request);
      return settledTurn(world.answers.shift() ??
        {outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
    },
  };
  service.emit = (event) => (listeners.get(event) || []).forEach((l) => l());
  return service;
}

async function flush() {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

function eligibleIds(world) {
  return world.joint ? [] : world.voters.filter((id) => id !== SUBJECT &&
    ELIGIBLE_KINDS.has(world.availability[id]));
}

const CASES = [];
for (const voters of [['s', 'x', 'y'], ['s']]) {
  for (const x of Object.values(AVAILABILITY)) {
    for (const y of Object.values(AVAILABILITY)) {
      for (const joint of [false, true]) {
        for (const leader of ['s', 'x', null]) {
          for (const rowTiming of ['before', 'after', 'reverted']) {
            for (const firstAnswer of ['accepted', 'refused']) {
              if (voters.length === 1 && (x !== AVAILABILITY.ELIGIBLE ||
                  y !== AVAILABILITY.ELIGIBLE || joint)) continue;
              CASES.push({voters, availability: {x, y}, joint, leader,
                rowTiming, firstAnswer});
            }
          }
        }
      }
    }
  }
}

test('property: the removal subject hands leadership only while it retires ' +
  'and leads, only to an eligible survivor, never twice to one that did ' +
  'not take it while another exists', async () => {
  mock.timers.enable({apis: ['setTimeout']});
  try {
    for (const c of CASES) {
      const world = {...c, leader: c.rowTiming === 'after' ? null : c.leader,
        answers: c.firstAnswer === 'refused' ?
          [{outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
            reason: 'target-not-voter'}] : []};
      const service = fakeService(world);
      subscribeRemovalSubjectHandoff(service);
      observeRemovalSubjectRetiring(service);
      if (c.rowTiming === 'after') {
        world.leader = c.leader;
        service.emit(RAFT_EVENT.LEADER);
      }
      if (c.rowTiming === 'reverted') observeRemovalSubjectRetained(service);
      await flush();
      const label = JSON.stringify({...c, availability: {
        x: Object.keys(AVAILABILITY).find((k) =>
          AVAILABILITY[k] === c.availability.x),
        y: Object.keys(AVAILABILITY).find((k) =>
          AVAILABILITY[k] === c.availability.y)}});
      const eligible = eligibleIds(world);
      const leads = c.leader === SUBJECT;
      const retiring = c.rowTiming !== 'reverted';
      const expectTransfer = leads && retiring && eligible.length > 0 &&
        (c.rowTiming !== 'reverted');
      const first = service.requests[0] ?? null;
      if (c.rowTiming === 'reverted') {
        // The row reverted after the first evaluation: nothing further.
        const before = service.requests.length;
        mock.timers.tick(WINDOW_BOUND_MS);
        await flush();
        assert.equal(service.requests.length, before, label);
        assert.equal(removalSubjectHandoffStateOf(service), STATE.NOT_RETIRING,
          label);
        continue;
      }
      assert.equal(first !== null, expectTransfer, label);
      if (!expectTransfer) {
        assert.equal(removalSubjectHandoffStateOf(service), leads ?
          STATE.NO_TRANSFEREE : STATE.FOLLOWING, label);
        const before = service.requests.length;
        mock.timers.tick(WINDOW_BOUND_MS);
        await flush();
        assert.equal(service.requests.length, before,
          `no eligible survivor appears without an event: ${label}`);
        continue;
      }
      assert.equal(first.successor, RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        label);
      assert.ok(eligible.includes(first.replicaIdentity), label);
      assert.notEqual(first.replicaIdentity, SUBJECT, label);
      // The window ends the first attempt (refused, or ran out with the
      // subject still leading): the next names another eligible voter when
      // one exists.
      mock.timers.tick(WINDOW_BOUND_MS);
      await flush();
      const second = service.requests[1] ?? null;
      assert.ok(second !== null, `re-driven after the window: ${label}`);
      assert.ok(eligible.includes(second.replicaIdentity), label);
      if (eligible.length > 1) {
        assert.notEqual(second.replicaIdentity, first.replicaIdentity, label);
      }
      // The transfer lands: the subject follows and asks nothing more.
      world.leader = 'x';
      service.emit(RAFT_EVENT.LEADER_CHANGE);
      await flush();
      const settled = service.requests.length;
      mock.timers.tick(WINDOW_BOUND_MS);
      await flush();
      assert.equal(service.requests.length, settled, label);
      assert.equal(removalSubjectHandoffStateOf(service), STATE.FOLLOWING,
        label);
    }
  } finally {
    mock.timers.reset();
  }
});

test('the removal transferee rule: eligibility, ranking and exclusion', () => {
  const voter = (id, index, extra = {}) => ({id, confirmsLeader: true,
    pastParticipationGate: true, routed: true, index, secondaryIndex: 0,
    ...extra});
  const choose = (voters, extra = {}) => chooseRemovalTransferee({
    subjectId: 's', joint: false, voters, ...extra})?.id ?? null;
  assert.deepEqual({
    ranked: choose([voter('s', 99), voter('x', 5), voter('y', 7)]),
    tie: choose([voter('y', 7), voter('x', 7)]),
    secondary: choose([voter('x', 7, {secondaryIndex: 1}),
      voter('y', 7, {secondaryIndex: 2})]),
    excluded: choose([voter('x', 5), voter('y', 7)], {excludedId: 'y'}),
    onlyExcluded: choose([voter('y', 7)], {excludedId: 'y'}),
    joint: choose([voter('x', 5)], {joint: true}),
    silent: choose([voter('x', 5, {confirmsLeader: false})]),
    gated: choose([voter('x', 5, {pastParticipationGate: false})]),
    unrouted: choose([voter('x', 5, {routed: false})]),
    subjectOnly: choose([voter('s', 5)]),
  }, {
    ranked: 'y', tie: 'x', secondary: 'y', excluded: 'x', onlyExcluded: 'y',
    joint: null, silent: null, gated: null, unrouted: null, subjectOnly: null,
  });
});
