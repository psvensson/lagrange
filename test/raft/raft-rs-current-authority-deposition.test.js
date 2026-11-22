// The current authority observation of a leader that has applied an entry
// of its own term, while a core turn of it is pending (verify-raft-owner-
// authority.md B-1). The observation reads the core and never drives it, so
// while a turn pends - on a peer send, or up to the persistence admission
// bound (120 s) - two things the process already holds are not in the core:
//   (i)  envelopes delivered to the group and queued in its own inbound,
//        among them the successor's of a higher term: once stepped, the core
//        follows that term;
//   (ii) ticks: each one asked for while the turn pends queues behind it, so
//        the core's clock stands still and check-quorum cannot depose it.
// Reporting LEADER then names a leadership the process holds proof against,
// or whose lease the core can no longer have checked. Either is NOT_SETTLED,
// with its named reason; the observation stays non-driving (it LOOKS at the
// queue and the tick backlog). And (iii): a healthy busy leader - its turns
// pend only briefly, nothing of a higher term arrives - is not starved:
// counted over a steady write load, its answers are LEADER except while a
// tick waits behind a pending turn, and LEADER again once that turn ends.
//
// Real: raft-rs partition operation ports (PartitionNodeCluster), their
// runtime owner and SQLite stores. Substituted: the transport (in-process
// inboxes delivered by the test; the leader's sends answered by a promise the
// test holds, or a microtask later in (iii)) and the clock (a
// VirtualTimeSource never advanced; ticks are the port's own tick operation).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../src/raft/constants.js';
// A namespace import, so the witness loads before the contract's new names.
import * as PORT_CONTRACT from '../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  DELIVERED_TO_PEER,
  PartitionNodeCluster,
} from './raft-rs-backend/partition-node-cluster.js';

const PARTITION_ID = 'cad-p1';
const REPLICAS = Object.freeze(['cad-p1-r1', 'cad-p1-r2', 'cad-p1-r3']);
const [LEADER, ...SUCCESSORS] = REPLICAS;
const ROUNDS = 200;
const BUSY_WRITES = 40;
const TICK_EVERY = 4;
const {RAFT_AUTHORITY_OBSERVATION, RAFT_OPERATION} = PORT_CONTRACT;
const OBSERVE = RAFT_OPERATION.OBSERVE_CURRENT_AUTHORITY;
const OBSERVATION_CORE_OPERATIONS = Object.freeze(['status', 'has_ready']);

function unsettledReason(name) {
  return PORT_CONTRACT.RAFT_AUTHORITY_UNSETTLED_REASON?.[name];
}

function newCluster() {
  const clock = new VirtualTimeSource({startMs: 0});
  return new PartitionNodeCluster({partitionId: PARTITION_ID,
    replicaIds: [...REPLICAS], substrateFor: () => ({timeSource: clock})});
}

function observe(cluster, replicaId) {
  return cluster.node(replicaId)[OBSERVE]();
}

// The core entries and the inbound one synchronous observation made.
function metered(cluster, replicaId, action) {
  const mark = cluster.coreEntries.length;
  const answer = action();
  return {answer, operations: cluster.coreEntries.slice(mark)
    .filter((entry) => entry.groupId === PARTITION_ID)
    .map((entry) => entry.operation)};
}

function quiesce(cluster) {
  for (let round = 0; round < ROUNDS; round += 1) {
    if ([...cluster.replicas.values()].every((replica) =>
      replica.inbox.length === 0)) return;
    cluster.deliverAll();
  }
  assert.fail('the cluster did not go quiet');
}

async function electedLeader(cluster, replicaId) {
  await turnChainValue(cluster.node(replicaId).campaign());
  cluster.tickers = [replicaId];
  assert.ok(cluster.settle(() => {
    const status = cluster.node(replicaId).readStatus();
    return status.role === RAFT_ROLE.LEADER && status.currentTermApplied === true;
  }, {rounds: ROUNDS}), `${replicaId} leads with an entry of its term applied`);
  quiesce(cluster);
  return cluster.node(replicaId).readStatus();
}

// Every send of the replica is queued for its peer at once and answered by
// `answer` (held until released, or a microtask later).
function answerSendsOf(cluster, replicaId, answer) {
  cluster.sendFor = (from, address, packet) => {
    if (from !== replicaId) return undefined;
    cluster.queue(from, address, packet);
    return answer;
  };
}

function holdSendsOf(cluster, replicaId) {
  const held = Promise.withResolvers();
  answerSendsOf(cluster, replicaId, held.promise);
  return () => {
    cluster.sendFor = null;
    held.resolve(DELIVERED_TO_PEER);
  };
}

// Hand the replica's waiting envelopes to its port: queued in its inbound.
function deliverToInbound(cluster, replicaId) {
  const replica = cluster.replica(replicaId);
  const envelopes = replica.inbox.splice(0, replica.inbox.length);
  for (const envelope of envelopes) replica.node.step(envelope);
  return envelopes;
}

function authority(answer) {
  return {role: answer.role, leaderPeerId: answer.leaderPeerId,
    unsettledReason: answer.unsettledReason,
    currentTermApplied: answer.currentTermApplied};
}

function notSettled(reason) {
  return {role: RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED,
    leaderPeerId: RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED,
    unsettledReason: unsettledReason(reason), currentTermApplied: false};
}

test('B-1 (i): a leader whose turn is pending while the successor\'s ' +
  'higher-term envelope waits unstepped in its inbound is NOT_SETTLED',
async () => {
  const cluster = newCluster();
  let release = null;
  try {
    const before = await electedLeader(cluster, LEADER);
    cluster.isolate(LEADER);
    cluster.tickers = [...SUCCESSORS];
    const successorLeading = () => SUCCESSORS.find((replicaId) => {
      const status = cluster.node(replicaId).readStatus();
      return status.role === RAFT_ROLE.LEADER && status.currentTermApplied === true;
    });
    assert.ok(cluster.settle(() => successorLeading() !== undefined,
      {rounds: ROUNDS}), 'premise: a successor leads a newer term');
    const successor = successorLeading();
    const newerTerm = cluster.node(successor).readStatus().term;
    cluster.heal(LEADER);
    release = holdSendsOf(cluster, LEADER);
    const pending = cluster.node(LEADER).propose({op: 'proposed-while-deposed'});
    pending.pending?.catch(() => undefined);
    for (let tick = 0; tick < ROUNDS &&
        cluster.replica(LEADER).inbox.length === 0; tick += 1) {
      cluster.node(successor).tick();
    }
    const delivered = deliverToInbound(cluster, LEADER);
    const during = metered(cluster, LEADER, () => observe(cluster, LEADER));
    const queuedTerms = delivered.map((envelope) => Number(envelope.message.term));
    const report = `measured ${JSON.stringify({before: {term: before.term},
      newerTerm, queuedTerms, during})}`;
    assert.deepEqual({pending: pending.settled, turnPending: during.answer.turnPending,
      term: during.answer.term, inboundQueued: during.answer.inboundQueued,
      higherQueued: queuedTerms.some((term) => term > before.term)},
    {pending: false, turnPending: true, term: before.term,
      inboundQueued: delivered.length, higherQueued: true},
    `premise: the core still leads T, a turn pends and T+1 waits queued: ${report}`);
    assert.deepEqual(authority(during.answer), notSettled('HIGHER_TERM_INBOUND'),
      `proof of deposition is queued in the process: ${report}`);
    assert.deepEqual(during.operations, [...OBSERVATION_CORE_OPERATIONS],
      `the observation only looked: ${report}`);
  } finally {
    release?.();
    cluster.dispose();
  }
});

test('B-1 (ii): a leader whose tick waits behind its pending turn is ' +
  'NOT_SETTLED, and the backlog is counted', async () => {
  const cluster = newCluster();
  let release = null;
  try {
    await electedLeader(cluster, LEADER);
    release = holdSendsOf(cluster, LEADER);
    const pending = turnChainValue(cluster.node(LEADER).propose({op: 'turn-held'}));
    const beforeTick = observe(cluster, LEADER);
    const tick = turnChainValue(cluster.node(LEADER).tick());
    const during = metered(cluster, LEADER, () => observe(cluster, LEADER));
    release();
    release = null;
    await pending;
    await tick;
    const after = observe(cluster, LEADER);
    const report = `measured ${JSON.stringify({beforeTick, during, after})}`;
    assert.deepEqual({role: beforeTick.role, turnPending: beforeTick.turnPending,
      inboundQueued: beforeTick.inboundQueued},
    {role: RAFT_ROLE.LEADER, turnPending: true, inboundQueued: 0},
    `premise: a busy leader with its term applied and no tick waiting: ${report}`);
    assert.deepEqual({...authority(during.answer),
      tickBacklog: during.answer.tickBacklog},
    {...notSettled('CLOCK_BEHIND'), tickBacklog: 1},
    `the core has not been given a tick the process holds: ${report}`);
    assert.deepEqual(during.operations, [...OBSERVATION_CORE_OPERATIONS],
      `the observation only looked: ${report}`);
    assert.deepEqual({role: after.role, tickBacklog: after.tickBacklog,
      settled: after.settled}, {role: RAFT_ROLE.LEADER, tickBacklog: 0, settled: true},
    `once the turn and the tick ran: ${report}`);
  } finally {
    release?.();
    cluster.dispose();
  }
});

test('B-1 (iii): a healthy busy leader is LEADER except while a tick waits ' +
  'behind a pending turn (not starved)', async (t) => {
  const cluster = newCluster();
  try {
    await electedLeader(cluster, LEADER);
    const samples = [];
    const sample = (point) => {
      const answer = observe(cluster, LEADER);
      samples.push({point, role: answer.role, settled: answer.settled,
        reason: answer.unsettledReason, tickBacklog: answer.tickBacklog});
    };
    answerSendsOf(cluster, LEADER, Promise.resolve(DELIVERED_TO_PEER));
    for (let write = 0; write < BUSY_WRITES; write += 1) {
      const turn = turnChainValue(cluster.node(LEADER).propose({op: 'busy', write}));
      sample('turn-pending');
      let tick = null;
      if (write % TICK_EVERY === 0) {
        tick = turnChainValue(cluster.node(LEADER).tick());
        sample('tick-queued');
      }
      await turn;
      await tick;
      sample('turn-ended');
      for (const follower of SUCCESSORS) {
        const replica = cluster.replica(follower);
        for (const envelope of replica.inbox.splice(0)) replica.node.step(envelope);
        cluster.node(follower).readStatus();
      }
      deliverToInbound(cluster, LEADER);
    }
    const count = (filter) => samples.filter(filter).length;
    const counts = {samples: samples.length,
      leader: count((one) => one.role === RAFT_ROLE.LEADER),
      notSettled: count((one) => one.role === RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED),
      settledFlag: count((one) => one.settled === true)};
    t.diagnostic(JSON.stringify({busyLeader: counts}));
    const report = `measured ${JSON.stringify({counts, samples})}`;
    assert.deepEqual(samples.filter((one) => one.role !== RAFT_ROLE.LEADER &&
      !(one.point === 'tick-queued' &&
        one.reason === unsettledReason('CLOCK_BEHIND'))), [],
    `a busy leader is unsettled only while a tick waits behind its turn: ${report}`);
    assert.deepEqual(samples.filter((one) => one.point === 'turn-ended')
      .map((one) => one.role), Array(BUSY_WRITES).fill(RAFT_ROLE.LEADER),
    `and LEADER again once each turn ended: ${report}`);
  } finally {
    cluster.dispose();
  }
});
