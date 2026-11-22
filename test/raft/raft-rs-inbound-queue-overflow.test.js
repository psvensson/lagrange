// Finding F-3 of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md, sections
// 13.2 and 20): a group's inbound queue that is full THROWS
// (raft-rs-runtime-owner.js pushInboundEnvelopeWithBounds,
// RAFT_INBOUND_QUEUE_OVERFLOW); the port contains the throw as one the runtime
// did not type, so the group becomes RECOVERY_REQUIRED, announces no role,
// drops every delivery for a retry window and is then rebuilt from its
// durable record - a consensus group stopped by load (R12). Its byte bound
// counts every real envelope as 64 bytes (it reads a `byteLength` no binding
// message has), so it never binds before the envelope count does, whatever
// the entries carry.
//
// Contract: an envelope that does not fit is dropped - raft re-sends or
// re-times every message type on this path (record section 3.1) - counted
// per sender and visible in the group's status, answered as a typed drop; the
// group keeps its role and leader and keeps processing; the queue holds at
// most its bounds, its bytes counted from what the envelopes carry.
//
// Real: the raft-rs partition operation port (PartitionNodeCluster, three
// replicas over SQLite), its ingress admission and inbound queue, the current
// authority observation (item B). Substituted: the clock (one
// VirtualTimeSource: no drain runs until the test advances it, so a burst of
// deliveries lands in one queue as a stalled drain would leave it); the
// transport (envelopes held in a list and stepped by the test); the burst
// (one real leader envelope delivered many times - raft is idempotent per
// position, so a duplicate is an ordinary delivery).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_RS_GROUP_TUNING} from '../../src/raft/raft-rs-group-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {
  DEFAULT_MAX_INBOUND_QUEUE_BYTES, DEFAULT_MAX_INBOUND_QUEUE_LENGTH,
} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {DELIVERED_TO_PEER, PartitionNodeCluster} from
  './raft-rs-backend/partition-node-cluster.js';

const PARTITION_ID = 'iq-p1';
const LEADER = 'iq-p1-r1';
const FOLLOWER = 'iq-p1-r2';
const OTHER = 'iq-p1-r3';
const EXCESS = 100;
const SETTLE_LIMIT = 400;
const WARM_ROUNDS = 3;
const ENTRY_BYTES = 4 * 1024 * 1024;
const LARGE_APPENDS = 24;
// A drain pass steps at most 32 envelopes; the full queue needs 512 passes.
const DRAIN_ROUNDS = 2000;
const {CORE_OK} = RAFT_OPERATION_OUTCOME;

class BurstScenario {
  constructor() {
    this.clock = new VirtualTimeSource({startMs: 0});
    this.queue = [];
    this.cluster = new PartitionNodeCluster({
      partitionId: PARTITION_ID,
      replicaIds: [LEADER, FOLLOWER, OTHER],
      substrateFor: () => ({timeSource: this.clock}),
      sendFor: (from, address, envelope) => {
        this.queue.push({from, to: this.cluster.replicaIdOf(address), envelope});
        return DELIVERED_TO_PEER;
      },
    });
  }

  port(replicaId) {
    return this.cluster.node(replicaId);
  }

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

  heartbeat() {
    for (let tick = 0; tick < RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK; tick += 1) {
      this.port(LEADER).tick();
    }
  }

  async elect() {
    await turnChainValue(this.port(LEADER).campaign());
    this.settle();
    for (let round = 0; round < WARM_ROUNDS; round += 1) {
      this.heartbeat();
      this.settle();
    }
    assert.equal(this.port(LEADER).readStatus().role, RAFT_ROLE.LEADER,
      'the scenario elected its leader');
  }

  async authority(replicaId) {
    const observed = await turnChainValue(this.port(replicaId).observeCurrentAuthority());
    return {outcome: observed.outcome, reason: observed.reason ?? null,
      role: observed.role ?? null, leaderPeerId: observed.leaderPeerId ?? null,
      inboundQueued: observed.inboundQueued ?? null,
      groupHealth: observed.groupHealth ?? null};
  }

  // Deliver one envelope `count` times into the follower with no drain in
  // between, and tally the answers by reason.
  async burst(envelope, count) {
    const answers = {};
    for (let index = 0; index < count; index += 1) {
      const answer = await turnChainValue(this.port(FOLLOWER).step(envelope));
      const key = `${answer.outcome}:${answer.reason ?? ''}`;
      answers[key] = (answers[key] ?? 0) + 1;
    }
    return answers;
  }

  // The follower's record of the deliveries it did not step, per sender.
  refusalsOf(replicaId) {
    return (this.port(replicaId).readStatus().inboundStepRefusals ?? [])
      .map((refusal) => ({from: refusal.from, reason: refusal.reason,
        refusalCount: refusal.refusalCount}));
  }

  dispose() {
    this.cluster.dispose();
  }
}

test('F-3: a full inbound queue drops the envelope, counted and visible; the ' +
  'group keeps its role and keeps processing', async (t) => {
  const scenario = new BurstScenario();
  try {
    await scenario.elect();
    const before = await scenario.authority(FOLLOWER);
    scenario.heartbeat();
    const heartbeat = scenario.take((item) => item.to === FOLLOWER);
    assert.equal(heartbeat?.envelope?.message?.msgType, RAFT_RS_MESSAGE_TYPE.HEARTBEAT,
      'the leader produced a heartbeat for the follower');
    const answers = await scenario.burst(heartbeat.envelope,
      DEFAULT_MAX_INBOUND_QUEUE_LENGTH + EXCESS);
    const atBurst = await scenario.authority(FOLLOWER);
    const refusals = scenario.refusalsOf(FOLLOWER);
    // The queued heartbeats drain; their answers to the leader are dropped
    // here (the leader needs none of them).
    for (let round = 0; round < DRAIN_ROUNDS; round += 1) {
      scenario.clock.advance(0);
      const draining = await scenario.authority(FOLLOWER);
      if (draining.outcome !== CORE_OK || draining.inboundQueued === 0) break;
    }
    scenario.queue = scenario.queue.filter((item) => item.to !== LEADER);
    // It keeps processing: a new entry commits and the follower applies it.
    const appliedBefore = scenario.port(FOLLOWER).readStatus().appliedIndex;
    await turnChainValue(scenario.port(LEADER).propose({after: 'burst'}));
    scenario.settle();
    scenario.heartbeat();
    scenario.settle();
    const appliedAfter = scenario.port(FOLLOWER).readStatus().appliedIndex;
    const measured = {bound: DEFAULT_MAX_INBOUND_QUEUE_LENGTH, before, answers,
      atBurst, refusals, appliedBefore, appliedAfter};
    const report = `measured ${JSON.stringify(measured)}`;
    t.diagnostic(report);
    assert.equal(atBurst.outcome, CORE_OK, `the group is not held: ${report}`);
    assert.deepEqual({role: atBurst.role, leaderPeerId: atBurst.leaderPeerId},
      {role: before.role, leaderPeerId: before.leaderPeerId},
      `the follower keeps its role and its leader: ${report}`);
    assert.ok(atBurst.inboundQueued <= DEFAULT_MAX_INBOUND_QUEUE_LENGTH,
      `the queue holds at most its bound: ${report}`);
    const dropped = refusals.find((refusal) => refusal.from ===
      String(heartbeat.envelope.message.from));
    assert.equal(dropped?.refusalCount, EXCESS,
      `every envelope that did not fit is counted, visibly, per sender: ${report}`);
    assert.ok(appliedAfter > appliedBefore,
      `the group keeps processing after the burst: ${report}`);
  } finally {
    scenario.dispose();
  }
});

test('F-3: the inbound queue counts the bytes its envelopes carry', async (t) => {
  const scenario = new BurstScenario();
  try {
    await scenario.elect();
    await turnChainValue(scenario.port(LEADER).propose({append: 'shape'}));
    const append = scenario.take((item) => item.to === FOLLOWER &&
      item.envelope.message.msgType === RAFT_RS_MESSAGE_TYPE.APPEND &&
      (item.envelope.message.entries ?? []).length > 0);
    assert.ok(append !== null, 'the leader produced an append for the follower');
    // The same append with one large entry (valid base64), as a catch-up
    // append carries up to the core's max_size_per_msg of entries.
    const [entry, ...rest] = append.envelope.message.entries;
    const large = {...append.envelope, message: {...append.envelope.message,
      entries: [{...entry, data: 'A'.repeat(ENTRY_BYTES)}, ...rest]}};
    const answers = await scenario.burst(large, LARGE_APPENDS);
    const atBurst = await scenario.authority(FOLLOWER);
    const fitting = Math.floor(DEFAULT_MAX_INBOUND_QUEUE_BYTES / ENTRY_BYTES);
    const measured = {boundBytes: DEFAULT_MAX_INBOUND_QUEUE_BYTES, entryBytes: ENTRY_BYTES,
      delivered: LARGE_APPENDS, fitting, answers, atBurst,
      refusals: scenario.refusalsOf(FOLLOWER)};
    const report = `measured ${JSON.stringify(measured)}`;
    t.diagnostic(report);
    assert.equal(atBurst.outcome, CORE_OK, `the group is not held: ${report}`);
    assert.ok(atBurst.inboundQueued !== null && atBurst.inboundQueued <= fitting,
      `the queue holds at most its byte bound of what the envelopes carry: ${report}`);
  } finally {
    scenario.dispose();
  }
});
