// Red witness (b) of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md): the
// wakes a node arms to drain delivered raft envelopes do not grow with the
// number of idle groups it hosts, while every delivered envelope is still
// stepped exactly once and in order, and no group's envelope waits behind
// more than one drain batch of another group.
//
// Today (red): each group arms its own zero-delay drain timer whenever an
// envelope arrives and none is armed (raft-rs-runtime-owner.js
// scheduleInboundDrain, raft-rs-inbound-timer-custody.js), so a node whose
// G groups each receive a heartbeat at one instant arms G timers for it.
//
// Anti-vacuity: the envelopes delivered to the node grow with G, and each
// group's stepped sequence equals its delivered sequence (observed at the
// core boundary). Anchor (green today, kept): a burst of envelopes for one
// group does not delay the others by more than one drain batch.
//
// Real: G three-replica raft-rs partition operation ports per world
// (PartitionNodeCluster), one replica per node, scheduled on their own ticks.
// Substituted: the clock (one VirtualTimeSource, seen by each node through a
// wrapper that counts zero-delay timeouts), the transport (each envelope a
// 1 ms timer on that clock that steps the recipient port) and the
// observation of core steps (the runtime owner's existing core-boundary test
// seam, setCoreFaultInjector, used to observe only: it never throws).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {
  setActualCoreEntryObserver, setCoreFaultInjector,
} from '../../src/raft/raft-rs-runtime-owner.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {DELIVERED_TO_PEER, PartitionNodeCluster} from
  './raft-rs-backend/partition-node-cluster.js';

const NODES = Object.freeze(['nd-a', 'nd-b', 'nd-c']);
const MEASURED_NODE = NODES[0];
const LEADING_NODE = NODES[1];
const GROUP_COUNTS = Object.freeze([8, 16, 32]);
const LINK_DELAY_MS = 1;
const SETTLE_MS = 300;
const WINDOW_MS = 1000;
const TAIL_MS = 50;
const STEP_OPERATION = 'step';
// raft-rs-runtime-owner.js MAX_SCHEDULED_INBOUND_DRAIN_BATCH: the envelopes
// one scheduled drain of one group may step before the others get a turn.
const DRAIN_BATCH_BOUND = 32;
const FAIRNESS_BURST = 100;
// Independent of G: the largest world may arm at most this many times the
// wakes of the smallest (today about the ratio of their G, here 4).
const MAX_WAKE_GROWTH = 1.5;
const MIN_ENVELOPE_GROWTH = 3;
// Three worlds of up to 96 replicas on a shared, slow lab host.
const WITNESS_TIMEOUT_MS = 300000;

function settleHost() {
  return new Promise((resolve) => setImmediate(resolve));
}

function signatureOf(message) {
  return [message.from, message.msgType, message.term, message.index ?? '',
    message.commit ?? '', (message.entries ?? []).length].join(':');
}

class DrainWorld {
  constructor(groupCount) {
    this.clock = new VirtualTimeSource({startMs: 0});
    this.counting = false;
    this.recording = false;
    this.zeroDelayTimeouts = Object.fromEntries(NODES.map((node) => [node, 0]));
    this.delivered = new Map();
    this.stepped = new Map();
    this.stepLog = [];
    this.lastHeartbeat = new Map();
    this.nodeOfReplica = new Map();
    this.nodeClocks = new Map(NODES.map((node) => [node, this.nodeClock(node)]));
    this.groups = [];
    for (let index = 0; index < groupCount; index += 1) {
      this.groups.push(this.buildGroup(`nd-g${index}`));
    }
    setActualCoreEntryObserver(null);
    setCoreFaultInjector((groupId, operation, args) => {
      if (operation === STEP_OPERATION && this.recording) {
        const key = `${groupId}|${args[0]?.to}`;
        this.append(this.stepped, key, signatureOf(args[0]));
        this.stepLog.push(key);
      }
    });
    this.measuredKeys = new Map(this.groups.map((group) => {
      const replicaId = group.replicaOn.get(MEASURED_NODE);
      return [`${group.partitionId}|${group.cluster.raftPeerIdOf(replicaId)}`,
        group];
    }));
  }

  // The node's view of the one clock; it counts the zero-delay timeouts the
  // node's runtime arms (the inbound drain wake) and forwards everything.
  nodeClock(node) {
    const clock = this.clock;
    const tally = this.zeroDelayTimeouts;
    return Object.freeze({
      now: () => clock.now(),
      setTimeout: (fn, ms, ...args) => {
        if (this.counting && !(Number(ms) > 0)) tally[node] += 1;
        return clock.setTimeout(fn, ms, ...args);
      },
      clearTimeout: (handle) => clock.clearTimeout(handle),
      setInterval: (fn, ms, ...args) => clock.setInterval(fn, ms, ...args),
      clearInterval: (handle) => clock.clearInterval(handle),
      charge: () => undefined,
    });
  }

  buildGroup(partitionId) {
    const replicaOn = new Map(NODES.map((node) =>
      [node, `${partitionId}-${node}`]));
    for (const [node, replicaId] of replicaOn) {
      this.nodeOfReplica.set(replicaId, node);
    }
    const group = {partitionId, replicaOn, cluster: null};
    group.cluster = new PartitionNodeCluster({
      partitionId,
      replicaIds: [...replicaOn.values()],
      substrateFor: (replicaId) => ({timeSource:
        this.nodeClocks.get(this.nodeOfReplica.get(replicaId))}),
      sendFor: (_from, address, envelope) => {
        const to = group.cluster.replicaIdOf(address);
        this.clock.setTimeout(() => this.deliver(group, to, envelope),
          LINK_DELAY_MS);
        return DELIVERED_TO_PEER;
      },
    });
    return group;
  }

  append(map, key, value) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  deliver(group, to, envelope) {
    if (this.recording) {
      this.append(this.delivered, `${envelope.groupId}|${envelope.message.to}`,
        signatureOf(envelope.message));
    }
    if (this.nodeOfReplica.get(to) === MEASURED_NODE &&
        envelope.message.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT) {
      this.lastHeartbeat.set(group.partitionId, {to, envelope});
    }
    group.cluster.node(to).step(envelope);
  }

  forEachPort(action) {
    for (const group of this.groups) {
      for (const replicaId of group.replicaOn.values()) {
        action(group.cluster.node(replicaId), replicaId);
      }
    }
  }

  async run(ms) {
    for (let elapsed = 0; elapsed < ms; elapsed += 1) {
      this.clock.advance(1);
      await settleHost();
    }
  }

  async elect() {
    this.forEachPort((port) => port.startScheduling());
    for (const group of this.groups) {
      await turnChainValue(group.cluster.node(
        group.replicaOn.get(LEADING_NODE)).campaign());
    }
    await this.run(SETTLE_MS);
    const leaderless = this.groups.filter((group) => ![...group.replicaOn.values()]
      .some((replicaId) =>
        group.cluster.node(replicaId).readStatus().role === RAFT_ROLE.LEADER));
    assert.deepEqual(leaderless.map((group) => group.partitionId), [],
      'every group has a leader before the window');
  }

  // One window of idle raft traffic, then the in-flight envelopes landed.
  async measureWindow() {
    this.counting = true;
    this.recording = true;
    await this.run(WINDOW_MS);
    this.counting = false;
    this.forEachPort((port) => port.stopScheduling());
    await this.run(TAIL_MS);
    this.recording = false;
    const toMeasured = [...this.measuredKeys.keys()].reduce((sum, key) =>
      sum + (this.delivered.get(key)?.length ?? 0), 0);
    const mismatched = [...this.delivered.keys()].filter((key) =>
      JSON.stringify(this.delivered.get(key)) !==
        JSON.stringify(this.stepped.get(key) ?? []));
    return {
      groupCount: this.groups.length,
      zeroDelayAtMeasuredNode: this.zeroDelayTimeouts[MEASURED_NODE],
      zeroDelayAllNodes: Object.values(this.zeroDelayTimeouts)
        .reduce((sum, count) => sum + count, 0),
      envelopesToMeasuredNode: toMeasured,
      deliveredKeys: this.delivered.size,
      mismatchedKeys: mismatched.length,
    };
  }

  // A burst for one group's replica on the measured node, then one envelope
  // for each other group's replica there, all at one instant.
  async burst() {
    this.stepLog = [];
    this.recording = true;
    const [first, ...rest] = this.groups;
    const burstOf = this.lastHeartbeat.get(first.partitionId);
    assert.ok(this.groups.every((group) =>
      this.lastHeartbeat.has(group.partitionId)),
    'every measured replica received a heartbeat to replay');
    for (let copy = 0; copy < FAIRNESS_BURST; copy += 1) {
      this.deliver(first, burstOf.to, burstOf.envelope);
    }
    for (const group of rest) {
      const single = this.lastHeartbeat.get(group.partitionId);
      this.deliver(group, single.to, single.envelope);
    }
    await this.run(TAIL_MS);
    this.recording = false;
    const burstKey = [...this.measuredKeys].find(([, group]) =>
      group === first)[0];
    const measuredSteps = this.stepLog.filter((key) => this.measuredKeys.has(key));
    const lastSingle = measuredSteps.findLastIndex((key) => key !== burstKey);
    return {
      burstStepped: measuredSteps.filter((key) => key === burstKey).length,
      singlesStepped: measuredSteps.filter((key) => key !== burstKey).length,
      burstStepsBeforeLastSingle: measuredSteps.slice(0, lastSingle + 1)
        .filter((key) => key === burstKey).length,
      singles: rest.length,
    };
  }

  dispose() {
    setCoreFaultInjector(null);
    for (const group of this.groups) {
      group.cluster.dispose();
    }
  }
}

test('(b) a node arms drain wakes independent of its idle groups, and ' +
  'every delivered envelope is stepped once, in order, fairly',
{timeout: WITNESS_TIMEOUT_MS}, async () => {
  const results = [];
  let fairness = null;
  for (const groupCount of GROUP_COUNTS) {
    const world = new DrainWorld(groupCount);
    try {
      await world.elect();
      results.push(await world.measureWindow());
      if (fairness === null) fairness = await world.burst();
    } finally {
      world.dispose();
    }
  }
  const report = `measured per ${WINDOW_MS} virtual ms ${JSON.stringify(results)}` +
    ` fairness ${JSON.stringify(fairness)}`;
  // Anti-vacuity and the kept invariants.
  for (const result of results) {
    assert.equal(result.mismatchedKeys, 0,
      `every delivered envelope was stepped exactly once and in order: ${report}`);
  }
  const smallest = results[0];
  const largest = results[results.length - 1];
  assert.ok(largest.envelopesToMeasuredNode >=
    MIN_ENVELOPE_GROWTH * smallest.envelopesToMeasuredNode,
  `the measured node's inbound traffic grows with its groups: ${report}`);
  assert.deepEqual({burst: fairness.burstStepped, singles: fairness.singlesStepped},
    {burst: FAIRNESS_BURST, singles: fairness.singles},
    `the burst and every single envelope were stepped: ${report}`);
  assert.ok(fairness.burstStepsBeforeLastSingle <= DRAIN_BATCH_BOUND,
    `no group waited behind more than one drain batch of another: ${report}`);
  // The contract (red today: wakes grow with the groups).
  assert.deepEqual({
    measuredNode: largest.zeroDelayAtMeasuredNode <=
      MAX_WAKE_GROWTH * smallest.zeroDelayAtMeasuredNode,
    allNodes: largest.zeroDelayAllNodes <=
      MAX_WAKE_GROWTH * smallest.zeroDelayAllNodes,
  }, {measuredNode: true, allNodes: true},
  `drain wakes per second do not grow with the idle groups a node hosts: ${report}`);
});
