// The port's current authority observation (observeCurrentAuthority): the
// raft core as it is at the instant of the call, read and never driven.
//
// Why (verify-owner-fact-read.md F1, F2): readStatus() answers the status of
// the last completed core entry whenever a core turn is pending (amendment
// A7.1, 1aea11baf), and a read with delivered inbound first drives that
// inbound itself. A leader-qualified receiver that decides on readStatus()
// can answer "leader at T" from a core that already follows T+1, and name an
// applied index below the rows its connection reads. readStatus() is not
// changed; the observation is a distinct operation.
//
// Cases:
//   (a) a deposed-and-aware leader: the read-driven turn steps the
//       successor's heartbeat of the newer term and waits on its held reply;
//       the observation reports a follower at the newer term (and the
//       durable applied index and term at that instant) while readStatus()
//       still reports leader at the old term - that part is kept as the
//       characterization of readStatus();
//   (b) observing enters the core for its status and has_ready only: no
//       step, Ready, persistence (SQLite total_changes), application or
//       announcement, with and without delivered inbound and during a
//       pending turn; readStatus() with the same delivered inbound steps it
//       (counted, as the contrast);
//   (c) two observations across an apply report different applied
//       positions, each the store's durable applied index at that instant;
//   (d) on an idle group one observation is exactly two core entries;
//   (e) a leader that has not applied an entry of its own term, observed
//       while the turn that elected it waits on a held send, is NOT_SETTLED,
//       and LEADER once that entry applied.
//
// Real: raft-rs partition operation ports (PartitionNodeCluster) with their
// runtime owner and SQLite store. Substituted: the transport (in-process
// inboxes, delivered by the test; one replica's sends answered by a promise
// the test holds) and the clock (a VirtualTimeSource that is never advanced,
// so a delivered envelope waits in the group's inbound until a turn drains
// it).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../src/raft/constants.js';
// A namespace import, so the witness loads (and each case fails at the
// missing operation) before the contract's names exist.
import * as PORT_CONTRACT from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_SQL} from '../../src/raft/raft-rs-durable-store-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  DELIVERED_TO_PEER,
  PartitionNodeCluster,
} from './raft-rs-backend/partition-node-cluster.js';

const PARTITION_ID = 'cao-p1';
const REPLICAS = Object.freeze(['cao-p1-r1', 'cao-p1-r2', 'cao-p1-r3']);
const [LEADER, ...SUCCESSORS] = REPLICAS;
const ROUNDS = 200;
const {RAFT_EVENT, RAFT_OPERATION} = PORT_CONTRACT;
const OBSERVE = RAFT_OPERATION.OBSERVE_CURRENT_AUTHORITY;
// (d): the core entries of one observation on an idle group.
const OBSERVATION_CORE_OPERATIONS = Object.freeze(['status', 'has_ready']);
const PORT_EVENTS = Object.freeze([
  RAFT_EVENT.LEADER, RAFT_EVENT.FOLLOWER, RAFT_EVENT.CANDIDATE,
  RAFT_EVENT.LEADER_CHANGE, RAFT_EVENT.TERM_CHANGE,
  RAFT_EVENT.APPLIED_PROGRESS, RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE,
  RAFT_EVENT.MEMBERSHIP_CHANGED, RAFT_EVENT.GATE_OPENED,
  RAFT_EVENT.CONF_CHANGE_APPLIED,
]);
const NO_EFFECTS = Object.freeze({steps: 0, readies: 0, sqliteChanges: 0,
  applications: 0, announcements: 0});

function newCluster() {
  const clock = new VirtualTimeSource({startMs: 0});
  return new PartitionNodeCluster({partitionId: PARTITION_ID,
    replicaIds: [...REPLICAS], substrateFor: () => ({timeSource: clock})});
}

function observe(cluster, replicaId) {
  const port = cluster.node(replicaId);
  assert.equal(typeof port[OBSERVE], 'function',
    'the port has no current authority observation: readStatus() is its ' +
    'only status read');
  return port[OBSERVE]();
}

function summary(status) {
  return {role: status.role, term: status.term,
    appliedIndex: status.appliedIndex};
}

function durableFacts(cluster, replicaId) {
  const {db} = cluster.replica(replicaId);
  const applied = db.prepare(RAFT_RS_SQL.SELECT_APPLIED_STATE).get(PARTITION_ID);
  const hard = db.prepare(RAFT_RS_SQL.SELECT_HARD_STATE).get(PARTITION_ID);
  return {appliedIndex: Number(applied.applied_index), term: Number(hard.term)};
}

function totalChanges(db) {
  return db.prepare('SELECT total_changes() AS changes').get().changes;
}

// What one synchronous action did to a replica: the core entries it made,
// the rows its connection wrote, the committed commands it applied and the
// port events it announced.
function effectsMeter(cluster, replicaId) {
  const replica = cluster.replica(replicaId);
  const events = [];
  for (const name of PORT_EVENTS) {
    replica.node.subscribe(name, () => events.push(name));
  }
  return (action) => {
    const coreMark = cluster.coreEntries.length;
    const eventMark = events.length;
    const changes = totalChanges(replica.db);
    const applied = replica.appliedCommands.length;
    const answer = action();
    const operations = cluster.coreEntries.slice(coreMark)
      .map((entry) => entry.operation);
    return {answer, operations, effects: {
      steps: operations.filter((operation) => operation === 'step').length,
      readies: operations.filter((operation) => operation === 'take_ready').length,
      sqliteChanges: totalChanges(replica.db) - changes,
      applications: replica.appliedCommands.length - applied,
      announcements: events.length - eventMark,
    }};
  };
}

// Deliver until no envelope is in flight (bounded).
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

// Every send the replica makes is queued for its peer at once but answered
// only when the test releases it, so the turn that sends waits.
function holdSendsOf(cluster, replicaId) {
  const held = Promise.withResolvers();
  cluster.sendFor = (from, address, packet) => {
    if (from !== replicaId) return undefined;
    cluster.queue(from, address, packet);
    return held.promise;
  };
  return () => {
    cluster.sendFor = null;
    held.resolve(DELIVERED_TO_PEER);
  };
}

async function settleEventLoop() {
  for (let pass = 0; pass < 3; pass += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// Hand the replica's waiting envelopes to its port: queued in its inbound,
// stepped by nobody until a turn drains them.
function deliverToInbound(cluster, replicaId) {
  const replica = cluster.replica(replicaId);
  const envelopes = replica.inbox.splice(0, replica.inbox.length);
  for (const envelope of envelopes) replica.node.step(envelope);
  return envelopes.length;
}

test('(a) a deposed leader whose core already follows the newer term is ' +
  'observed as a follower while readStatus() still answers leader', async () => {
  const cluster = newCluster();
  let release = null;
  try {
    const before = await electedLeader(cluster, LEADER);
    // The others elect without it. It is never ticked, so under
    // check_quorum it keeps leading the old term in its own view.
    cluster.isolate(LEADER);
    cluster.tickers = [...SUCCESSORS];
    const successorLeading = () => SUCCESSORS.find((replicaId) => {
      const status = cluster.node(replicaId).readStatus();
      return status.role === RAFT_ROLE.LEADER && status.currentTermApplied === true;
    });
    assert.ok(cluster.settle(() => successorLeading() !== undefined,
      {rounds: ROUNDS}), 'a successor leads a newer term');
    const successor = successorLeading();
    const newerTerm = cluster.node(successor).readStatus().term;
    cluster.heal(LEADER);
    release = holdSendsOf(cluster, LEADER);
    for (let tick = 0; tick < ROUNDS &&
        cluster.replica(LEADER).inbox.length === 0; tick += 1) {
      cluster.node(successor).tick();
    }
    const delivered = deliverToInbound(cluster, LEADER);
    assert.ok(delivered > 0, 'the successor addressed the old leader');

    const meter = effectsMeter(cluster, LEADER);
    const atRejoin = meter(() => observe(cluster, LEADER));
    // readStatus() with delivered inbound drives it: the core steps the
    // newer term, and the turn waits on the held reply.
    const answered = cluster.node(LEADER).readStatus();
    const during = meter(() => observe(cluster, LEADER));
    const durableDuring = durableFacts(cluster, LEADER);
    const answeredAgain = cluster.node(LEADER).readStatus();
    release();
    release = null;
    await settleEventLoop();
    const afterRelease = cluster.node(LEADER).readStatus();

    const measured = {before: summary(before), newerTerm, delivered,
      atRejoin, answered: summary(answered), during, durableDuring,
      answeredAgain: summary(answeredAgain), afterRelease: summary(afterRelease)};
    const report = `measured ${JSON.stringify(measured)}`;
    // The core still leads the old term, but the successor's newer-term
    // envelopes wait in its inbound: NOT_SETTLED (corrective item B-1).
    assert.deepEqual({
      role: atRejoin.answer.role, term: atRejoin.answer.term,
      unsettledReason: atRejoin.answer.unsettledReason,
      inboundQueued: atRejoin.answer.inboundQueued,
      turnPending: atRejoin.answer.turnPending,
      operations: atRejoin.operations, effects: atRejoin.effects,
    }, {
      role: PORT_CONTRACT.RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED, term: before.term,
      unsettledReason: PORT_CONTRACT.RAFT_AUTHORITY_UNSETTLED_REASON.HIGHER_TERM_INBOUND,
      inboundQueued: delivered, turnPending: false,
      operations: [...OBSERVATION_CORE_OPERATIONS], effects: NO_EFFECTS,
    }, `observed before the read, the delivered inbound stays queued: ${report}`);
    assert.deepEqual({
      role: during.answer.role, term: during.answer.term,
      leaderPeerId: during.answer.leaderPeerId,
      currentTermApplied: during.answer.currentTermApplied,
      turnPending: during.answer.turnPending, settled: during.answer.settled,
      appliedIndex: during.answer.appliedIndex,
      operations: during.operations, effects: during.effects,
    }, {
      role: RAFT_ROLE.FOLLOWER, term: newerTerm,
      leaderPeerId: String(cluster.raftPeerIdOf(successor)),
      currentTermApplied: false, turnPending: true, settled: false,
      appliedIndex: durableDuring.appliedIndex,
      operations: [...OBSERVATION_CORE_OPERATIONS], effects: NO_EFFECTS,
    }, `during the pending turn the observation is the core's: ${report}`);
    assert.equal(durableDuring.term, newerTerm,
      `the newer term was durable before the turn sent: ${report}`);
    // Characterization of readStatus(), unchanged: the status of the last
    // completed core entry while the turn is pending.
    assert.deepEqual([summary(answered).role, summary(answered).term,
      summary(answeredAgain).role, summary(answeredAgain).term],
    [RAFT_ROLE.LEADER, before.term, RAFT_ROLE.LEADER, before.term],
    `readStatus() answers the old leadership while the turn is pending: ${report}`);
    assert.deepEqual([afterRelease.role, afterRelease.term],
      [RAFT_ROLE.FOLLOWER, newerTerm],
      `once the turn completes readStatus() agrees: ${report}`);
  } finally {
    release?.();
    cluster.dispose();
  }
});

test('(b)(d) an observation enters the core for status and has_ready only, ' +
  'with and without delivered inbound', async () => {
  const cluster = newCluster();
  try {
    await electedLeader(cluster, LEADER);
    const meter = effectsMeter(cluster, LEADER);
    const idle = meter(() => observe(cluster, LEADER));
    // Replies to a proposal wait in the leader's inbound.
    cluster.propose(LEADER, {op: 'observed-while-delivered'});
    cluster.deliverAll();
    const delivered = deliverToInbound(cluster, LEADER);
    const withInbound = meter(() => observe(cluster, LEADER));
    const readStatusWithInbound = meter(() => cluster.node(LEADER).readStatus());
    const measured = {delivered, idle, withInbound,
      readStatusWithInbound: {operations: readStatusWithInbound.operations.length,
        effects: readStatusWithInbound.effects}};
    const report = `measured ${JSON.stringify(measured)}`;
    assert.ok(delivered > 0, `replies were delivered: ${report}`);
    assert.deepEqual({operations: idle.operations, effects: idle.effects,
      settled: idle.answer.settled, role: idle.answer.role},
    {operations: [...OBSERVATION_CORE_OPERATIONS], effects: NO_EFFECTS,
      settled: true, role: RAFT_ROLE.LEADER},
    `(d) an idle observation is ${OBSERVATION_CORE_OPERATIONS.length} core ` +
      `entries and nothing else: ${report}`);
    assert.deepEqual({operations: withInbound.operations,
      effects: withInbound.effects,
      inboundQueued: withInbound.answer.inboundQueued},
    {operations: [...OBSERVATION_CORE_OPERATIONS], effects: NO_EFFECTS,
      inboundQueued: delivered},
    `(b) delivered inbound stays queued and unstepped: ${report}`);
    // The contrast: readStatus() with the same inbound drives it.
    assert.equal(readStatusWithInbound.effects.steps, delivered,
      `readStatus() steps the delivered inbound: ${report}`);
  } finally {
    cluster.dispose();
  }
});

test('(c) observations across an apply report the applied position of the ' +
  'rows', async () => {
  const cluster = newCluster();
  try {
    await electedLeader(cluster, LEADER);
    const first = observe(cluster, LEADER);
    const durableFirst = durableFacts(cluster, LEADER);
    cluster.propose(LEADER, {op: 'applied-between-observations'});
    assert.ok(cluster.settle(() => cluster.node(LEADER).readStatus()
      .appliedIndex > first.appliedIndex, {rounds: ROUNDS}),
    'the proposal applied');
    const second = observe(cluster, LEADER);
    const durableSecond = durableFacts(cluster, LEADER);
    const report = `measured ${JSON.stringify({first: summary(first),
      durableFirst, second: summary(second), durableSecond})}`;
    assert.deepEqual([first.appliedIndex, second.appliedIndex],
      [durableFirst.appliedIndex, durableSecond.appliedIndex],
      `each observation names the store's applied index: ${report}`);
    assert.ok(second.appliedIndex > first.appliedIndex,
      `the two observations differ by the apply: ${report}`);
  } finally {
    cluster.dispose();
  }
});

test('(e) a leader whose own-term entry has not applied is NOT_SETTLED ' +
  'while the turn that elected it waits', async () => {
  const cluster = newCluster();
  let release = null;
  try {
    await turnChainValue(cluster.node(LEADER).campaign());
    // Pre-vote, then the vote: deliver round by round until the candidate
    // holds the votes it has not stepped yet.
    for (let round = 0; round < ROUNDS; round += 1) {
      if (cluster.node(LEADER).readStatus().role === RAFT_ROLE.CANDIDATE &&
          cluster.replica(LEADER).inbox.length > 0) break;
      cluster.deliverAll();
    }
    release = holdSendsOf(cluster, LEADER);
    const delivered = deliverToInbound(cluster, LEADER);
    const answered = cluster.node(LEADER).readStatus();
    const during = observe(cluster, LEADER);
    release();
    release = null;
    await settleEventLoop();
    cluster.tickers = [LEADER];
    assert.ok(cluster.settle(() => observe(cluster, LEADER)
      .currentTermApplied === true, {rounds: ROUNDS}),
    'the leader applies an entry of its term');
    quiesce(cluster);
    const settled = observe(cluster, LEADER);
    const report = `measured ${JSON.stringify({delivered,
      answered: summary(answered), during, settled})}`;
    assert.deepEqual({role: during.role, leaderPeerId: during.leaderPeerId,
      currentTermApplied: during.currentTermApplied,
      turnPending: during.turnPending},
    {role: PORT_CONTRACT.RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED,
      leaderPeerId: PORT_CONTRACT.RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED,
      currentTermApplied: false, turnPending: true},
    `a leader whose term-start entry has not applied, mid-turn: ${report}`);
    assert.deepEqual({role: settled.role, leaderPeerId: settled.leaderPeerId,
      currentTermApplied: settled.currentTermApplied, settled: settled.settled,
      term: settled.term},
    {role: RAFT_ROLE.LEADER,
      leaderPeerId: String(cluster.raftPeerIdOf(LEADER)),
      currentTermApplied: true, settled: true, term: during.term},
    `the same leadership once its entry applied: ${report}`);
  } finally {
    release?.();
    cluster.dispose();
  }
});
