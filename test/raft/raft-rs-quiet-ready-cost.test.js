// Red witnesses (h) and (i) of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md):
// a follower that steps a heartbeat which changes nothing, or ticks without
// a Ready, opens no SQLite transaction (i) and makes no `status` or
// `conf_state` core entry to announce an unchanged status (h).
//
// Today (red): every such heartbeat runs the whole Ready cycle, whose
// persistence is a SQLite transaction with nothing in it
// (raft-rs-durable-store.js persistReady), and every drain or tick ends in
// announce, which reads `status` and then `conf_state` from the core
// (raft-rs-runtime-owner.js drainReady -> announce -> recordStatusObservation).
//
// Anti-vacuity: the follower steps every heartbeat once and answers each
// with a heartbeat response, and its term, leader and commit index do not
// move. Anchor: a heartbeat that does advance the follower's commit index
// persists that Ready in exactly one transaction (besides the application
// of the entry it commits) and announces exactly once.
//
// Real: the raft-rs partition operation port (PartitionNodeCluster, three
// replicas, each over its own SQLite file). Substituted: the clock (one
// VirtualTimeSource), the transport (envelopes held in a list and stepped by
// the test, so every core entry inside a measured window is the follower's
// own) and the follower's database handle (a Proxy that counts
// `transaction`, `prepare` and `pragma` calls and forwards each unchanged).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_RS_GROUP_TUNING} from '../../src/raft/raft-rs-group-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {CORE_OPERATION} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {DELIVERED_TO_PEER, PartitionNodeCluster} from
  './raft-rs-backend/partition-node-cluster.js';

const PARTITION_ID = 'rq-p1';
const LEADER = 'rq-p1-r1';
const FOLLOWER = 'rq-p1-r2';
const OTHER = 'rq-p1-r3';
const QUIET_ROUNDS = 100;
const WARM_ROUNDS = 5;
const SETTLE_LIMIT = 200;
function settleHost() {
  return new Promise((resolve) => setImmediate(resolve));
}

const STATUS_ENTRIES = Object.freeze([CORE_OPERATION.STATUS,
  CORE_OPERATION.CONF_STATE]);
const NO_STATUS_ENTRIES = Object.freeze(Object.fromEntries(
  STATUS_ENTRIES.map((operation) => [operation, 0])));

class QuietFollowerScenario {
  constructor() {
    this.clock = new VirtualTimeSource({startMs: 0});
    this.queue = [];
    this.database = {transactions: 0, prepares: 0, pragmas: 0};
    this.applications = 0;
    this.measuring = false;
    this.coreEntries = new Map();
    this.cluster = new PartitionNodeCluster({
      partitionId: PARTITION_ID,
      replicaIds: [LEADER, FOLLOWER, OTHER],
      substrateFor: () => ({timeSource: this.clock}),
      sendFor: (from, address, envelope) => {
        this.queue.push({from, to: this.cluster.replicaIdOf(address), envelope});
        return DELIVERED_TO_PEER;
      },
      applyFor: (replicaId) => {
        if (replicaId === FOLLOWER) this.applications += 1;
      },
      wrapDatabase: (replicaId, db) =>
        replicaId === FOLLOWER ? this.countingDatabase(db) : db,
    });
    setActualCoreEntryObserver((entry) => {
      if (this.measuring) {
        this.coreEntries.set(entry.operation,
          (this.coreEntries.get(entry.operation) ?? 0) + 1);
      }
    });
  }

  countingDatabase(target) {
    const database = this.database;
    return new Proxy(target, {get(base, property) {
      if (property === 'transaction') {
        return (work) => {
          const transaction = base.transaction(work);
          return (...args) => {
            database.transactions += 1;
            return transaction(...args);
          };
        };
      }
      if (property === 'prepare') {
        return (sql) => {
          database.prepares += 1;
          return base.prepare(sql);
        };
      }
      if (property === 'pragma') {
        return (...args) => {
          database.pragmas += 1;
          return base.pragma(...args);
        };
      }
      const value = Reflect.get(base, property, base);
      return typeof value === 'function' ? value.bind(base) : value;
    }});
  }

  port(replicaId) {
    return this.cluster.node(replicaId);
  }

  // Step every held envelope the predicate selects into its recipient, then
  // let the zero-delay drains those deliveries armed run.
  deliver(predicate) {
    const selected = [];
    const kept = [];
    for (const item of this.queue.splice(0)) {
      (predicate(item) ? selected : kept).push(item);
    }
    this.queue.push(...kept);
    for (const item of selected) {
      this.port(item.to).step(item.envelope);
    }
    this.clock.advance(0);
    return selected;
  }

  settle() {
    for (let round = 0; round < SETTLE_LIMIT; round += 1) {
      if (this.queue.length === 0) return;
      this.deliver(() => true);
    }
    throw new Error('the partition did not settle');
  }

  take(predicate) {
    const index = this.queue.findIndex(predicate);
    return index < 0 ? null : this.queue.splice(index, 1)[0];
  }

  leaderTicksOneHeartbeat() {
    for (let tick = 0; tick < RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK; tick += 1) {
      this.port(LEADER).tick();
    }
  }

  // Everything that runs inside `work` is the follower's: nothing else is
  // queued, armed or ticked while it runs. The window spans a host turn, so
  // a drain the runtime schedules on the host lands inside it too.
  async measure(work) {
    const before = {...this.database, applications: this.applications,
      queued: this.queue.length};
    this.coreEntries.clear();
    this.measuring = true;
    try {
      work();
      this.clock.advance(0);
      await settleHost();
      this.clock.advance(0);
    } finally {
      this.measuring = false;
    }
    return {
      transactions: this.database.transactions - before.transactions,
      prepares: this.database.prepares - before.prepares,
      pragmas: this.database.pragmas - before.pragmas,
      applications: this.applications - before.applications,
      sent: this.queue.slice(before.queued),
      entries: new Map(this.coreEntries),
    };
  }

  followerFacts() {
    const status = this.port(FOLLOWER).readStatus();
    return {role: status.role, term: status.term, leaderId: status.leaderId,
      commitIndex: status.commitIndex};
  }

  async elect() {
    await turnChainValue(this.port(LEADER).campaign());
    this.settle();
    for (let round = 0; round < WARM_ROUNDS; round += 1) {
      this.leaderTicksOneHeartbeat();
      this.settle();
    }
    assert.equal(this.port(LEADER).readStatus().role, RAFT_ROLE.LEADER,
      'the scenario elected its leader');
    assert.equal(this.followerFacts().leaderId, LEADER,
      'the follower follows it');
  }

  // One leader heartbeat; the follower's step of it measured alone.
  async measuredHeartbeat() {
    this.leaderTicksOneHeartbeat();
    const heartbeat = this.take((item) => item.to === FOLLOWER);
    assert.ok(heartbeat !== null &&
      heartbeat.envelope.message.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT,
    `the leader's tick produced a heartbeat for the follower: ${
      JSON.stringify(heartbeat?.envelope?.message ?? null)}`);
    const measured = await this.measure(() =>
      this.port(FOLLOWER).step(heartbeat.envelope));
    this.settle();
    return measured;
  }

  dispose() {
    setActualCoreEntryObserver(null);
    this.cluster.dispose();
  }
}

function addInto(total, measured) {
  total.transactions += measured.transactions;
  total.prepares += measured.prepares;
  total.pragmas += measured.pragmas;
  total.applications += measured.applications;
  for (const [operation, count] of measured.entries) {
    total.entries[operation] = (total.entries[operation] ?? 0) + count;
  }
  total.responses += measured.sent.filter((item) => item.from === FOLLOWER &&
    item.envelope.message.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE)
    .length;
}

function emptyTotal() {
  return {transactions: 0, prepares: 0, pragmas: 0, applications: 0,
    responses: 0, entries: {}};
}

function statusEntries(total) {
  return Object.fromEntries(STATUS_ENTRIES.map((operation) =>
    [operation, total.entries[operation] ?? 0]));
}

test('(h)(i) a follower stepping heartbeats that change nothing opens no ' +
  'transaction and reads no status', async () => {
  const scenario = new QuietFollowerScenario();
  try {
    await scenario.elect();
    const factsBefore = scenario.followerFacts();
    const total = emptyTotal();
    for (let round = 0; round < QUIET_ROUNDS; round += 1) {
      addInto(total, await scenario.measuredHeartbeat());
    }
    const factsAfter = scenario.followerFacts();
    const report = `measured over ${QUIET_ROUNDS} heartbeats ${JSON.stringify(total)}`;
    // Anti-vacuity: each heartbeat was stepped once and answered, and it
    // changed nothing the follower knows.
    assert.equal(total.entries.step, QUIET_ROUNDS,
      `the follower stepped every heartbeat once: ${report}`);
    assert.equal(total.responses, QUIET_ROUNDS,
      `the follower answered every heartbeat: ${report}`);
    assert.deepEqual(factsAfter, factsBefore,
      `term, leader and commit index did not move: ${report}`);
    assert.equal(total.applications, 0, `nothing was applied: ${report}`);
    // The contract (red today: one empty transaction and one status plus
    // one conf_state read per heartbeat).
    assert.deepEqual({
      transactions: total.transactions,
      prepares: total.prepares,
      pragmas: total.pragmas,
      ...statusEntries(total),
    }, {transactions: 0, prepares: 0, pragmas: 0, ...NO_STATUS_ENTRIES},
    `a Ready with nothing to persist and nothing to announce costs neither: ${report}`);
  } finally {
    scenario.dispose();
  }
});

test('(h) a quiet follower tick reads no status', async () => {
  const scenario = new QuietFollowerScenario();
  try {
    await scenario.elect();
    const factsBefore = scenario.followerFacts();
    const total = emptyTotal();
    for (let round = 0; round < QUIET_ROUNDS; round += 1) {
      // A heartbeat between ticks keeps the follower's election clock low.
      await scenario.measuredHeartbeat();
      addInto(total, await scenario.measure(() =>
        scenario.port(FOLLOWER).tick()));
    }
    const report = `measured over ${QUIET_ROUNDS} ticks ${JSON.stringify(total)}`;
    assert.equal(total.entries.tick, QUIET_ROUNDS,
      `the follower ticked its core every time: ${report}`);
    assert.deepEqual(scenario.followerFacts(), factsBefore,
      `the ticks changed nothing: ${report}`);
    assert.deepEqual({transactions: total.transactions, ...statusEntries(total)},
      {transactions: 0, ...NO_STATUS_ENTRIES},
      `a tick without a Ready announces nothing: ${report}`);
  } finally {
    scenario.dispose();
  }
});

test('(h)(i) anchor: a heartbeat that advances the commit index persists ' +
  'once and announces once', async () => {
  const scenario = new QuietFollowerScenario();
  try {
    await scenario.elect();
    const commitBefore = scenario.followerFacts().commitIndex;
    await turnChainValue(scenario.port(LEADER).propose({anchor: 'commit'}));
    // The entry reaches both followers and both acknowledge it; the leader
    // commits and broadcasts the new commit index. Its broadcast to the
    // follower is lost (raft re-sends it on the next heartbeat).
    scenario.deliver((item) => item.to !== LEADER);
    scenario.deliver((item) => item.to === LEADER);
    const lost = scenario.queue.filter((item) => item.to === FOLLOWER);
    scenario.queue = scenario.queue.filter((item) => item.to !== FOLLOWER);
    scenario.settle();
    assert.equal(scenario.followerFacts().commitIndex, commitBefore,
      `the follower has not learnt the commit yet (lost ${JSON.stringify(
        lost.map((item) => item.envelope.message.msgType))})`);
    const measured = await scenario.measuredHeartbeat();
    const facts = scenario.followerFacts();
    const observed = {transactions: measured.transactions,
      applications: measured.applications,
      status: measured.entries.get(CORE_OPERATION.STATUS) ?? 0,
      commitIndex: facts.commitIndex};
    const report = `measured ${JSON.stringify(observed)}`;
    assert.ok(facts.commitIndex > commitBefore,
      `the heartbeat advanced the follower's commit index: ${report}`);
    assert.equal(measured.applications, 1,
      `the follower applied the committed entry once: ${report}`);
    assert.deepEqual({
      readyPersistence: measured.transactions - measured.applications,
      status: observed.status,
    }, {readyPersistence: 1, status: 1},
    `the Ready that moved the commit index persisted once and announced once: ${report}`);
  } finally {
    scenario.dispose();
  }
});
