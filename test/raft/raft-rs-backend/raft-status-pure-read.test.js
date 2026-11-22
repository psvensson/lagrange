// Pure-read witnesses for raft.readStatus() (raft-status-read-drives.md §6):
//
//   W1 (idle read): readStatus() on an idle group makes 0 core entries, 0
//       SQLite transactions, 0 events; N consecutive reads return the exact
//       same frozen object (===).
//   W2 (read with pending inbound): k envelopes delivered, scheduled drain
//       not yet fired: readStatus() makes 0 core entries, inbound still holds
//       k envelopes, no committed-entry application and no role/term/leader
//       event inside the call (on both synchronous and awaited send modes).
//   W3 (read during a busy turn): N readStatus() calls while a turn awaits
//       and inbound is pending queue 0 extra turns and 0 later discarded core
//       entries.
//   W4 (a read repairs nothing): readStatus() on a group in recovery, or under
//       an unhealthy runtime, enters no core and starts no reconstruction or
//       runtime replacement; truthful lifecycle and health state (groupHealth,
//       runtimeHealth, runtimeGeneration, lifecycleIncarnation) are still
//       reflected in the returned observation.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setImmediate as nextEventLoopTurn} from 'node:timers/promises';

import {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_TRANSITION_STAGE,
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {
  HEALTHY,
  RECOVERY_REQUIRED,
  RUNTIME_PHASE,
  UNHEALTHY,
  USABLE,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {
  RaftRsPeerIdentityRegistry,
  deriveRaftRsPeerId,
} from '../../../src/raft/raft-rs-peer-identity.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {
  setActualCoreEntryObserver,
  setCoreFaultInjector,
} from '../../../src/raft/raft-rs-runtime-owner.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {
  DELIVERED_TO_PEER,
  PartitionNodeCluster,
} from './partition-node-cluster.js';

const {CORE_FATAL, CORE_OK, HOST_FAILURE} = RAFT_OPERATION_OUTCOME;
const OBSERVE = RAFT_OPERATION.OBSERVE_CURRENT_AUTHORITY;
const CONSECUTIVE_READS = 5;
const SEND_MODE = Object.freeze({SYNC: 'sync', ASYNC: 'async'});
const SUBSCRIBABLE_EVENTS = Object.freeze([
  RAFT_EVENT.LEADER,
  RAFT_EVENT.FOLLOWER,
  RAFT_EVENT.CANDIDATE,
  RAFT_EVENT.LEADER_CHANGE,
  RAFT_EVENT.TERM_CHANGE,
  RAFT_EVENT.APPLIED_PROGRESS,
  RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE,
  RAFT_EVENT.MEMBERSHIP_CHANGED,
  RAFT_EVENT.GATE_OPENED,
  RAFT_EVENT.CONF_CHANGE_APPLIED,
  RAFT_EVENT.STATUS_CHANGED,
]);
const CORE_OP_STEP = 'step';
const CORE_OP_CONF_STATE = 'conf_state';

function wrapTransactionCounter(database, counter) {
  return new Proxy(database, {
    get(target, property) {
      if (property === 'transaction') {
        return (work) => {
          const wrapped = target.transaction(work);
          return (...args) => {
            counter.transactions += 1;
            return wrapped(...args);
          };
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function subscribeAllEvents(port, log) {
  const unsubscribes = SUBSCRIBABLE_EVENTS.map((eventName) =>
    port.subscribe(eventName, (payload) => {
      log.push({eventName, payload});
    }));
  return () => {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };
}

function drainInboxThroughPort(cluster, clock, replicaId) {
  const replica = cluster.replica(replicaId);
  const envelopes = replica.inbox.splice(0, replica.inbox.length);
  for (const envelope of envelopes) {
    replica.node.step(envelope);
  }
  if (envelopes.length > 0) {
    clock.advance(0);
  }
  return envelopes.length;
}

function deliverToInboundOnly(cluster, replicaId) {
  const replica = cluster.replica(replicaId);
  const envelopes = replica.inbox.splice(0, replica.inbox.length);
  for (const envelope of envelopes) {
    const admitted = turnChainValue(replica.node.step(envelope));
    assert.equal(admitted.outcome, CORE_OK,
      `setup: envelope admitted to ${replicaId}`);
  }
  return envelopes.length;
}

function quiesceWithClocks(cluster, clocks, replicaIds) {
  for (let round = 0; round < 200; round += 1) {
    let moved = 0;
    for (const replicaId of replicaIds) {
      moved += drainInboxThroughPort(cluster, clocks.get(replicaId), replicaId);
    }
    if (moved === 0) {
      return;
    }
  }
  assert.fail('setup: cluster did not quiesce');
}

async function formThreeReplicaCluster({
  partitionId,
  replicaIds,
  txCounter = null,
  applyFor = null,
}) {
  const clocks = new Map(replicaIds.map((id) =>
    [id, new VirtualTimeSource({startMs: 1000})]));
  const cluster = new PartitionNodeCluster({
    partitionId,
    replicaIds,
    substrateFor: (id) => ({timeSource: clocks.get(id)}),
    wrapDatabase: txCounter === null ? null : (_id, db) =>
      wrapTransactionCounter(db, txCounter),
    applyFor,
  });
  const [leader, ...followers] = replicaIds;
  cluster.tickers = [leader];
  assert.equal(cluster.settle(() => {
    for (const id of replicaIds) {
      clocks.get(id).advance(0);
    }
    return cluster.leaderReplicaId() === leader;
  }, {
    rounds: 200,
    between: () => {
      for (const id of replicaIds) {
        clocks.get(id).advance(0);
      }
    },
  }), true, 'setup: leader elected');
  const proposed = await turnChainValue(cluster.propose(leader, {init: true}));
  assert.equal(proposed.outcome, CORE_OK);
  quiesceWithClocks(cluster, clocks, [leader, ...followers]);
  for (const id of replicaIds) {
    const auth = cluster.node(id)[OBSERVE]();
    assert.equal(auth.inboundQueued, 0, `setup: ${id} inbound empty`);
  }
  return {cluster, clocks, leader, followers};
}

test('W1 (idle read): readStatus() makes 0 core entries, 0 SQLite transactions, ' +
  '0 events, and N consecutive reads return the same frozen object',
async () => {
  const replicaIds = ['w1-a', 'w1-b', 'w1-c'];
  const txCounter = {transactions: 0};
  const {cluster, leader} = await formThreeReplicaCluster({
    partitionId: 'pure-read-w1',
    replicaIds,
    txCounter,
  });
  const events = [];
  const port = cluster.node(leader);
  const unsubscribe = subscribeAllEvents(port, events);
  try {
    const coreMark = cluster.coreEntries.length;
    const txMark = txCounter.transactions;
    const eventMark = events.length;

    const reads = [];
    for (let index = 0; index < CONSECUTIVE_READS; index += 1) {
      reads.push(port.readStatus());
    }

    const coreOps = cluster.coreEntries.slice(coreMark);
    const txDelta = txCounter.transactions - txMark;
    const eventDelta = events.slice(eventMark);

    assert.equal(coreOps.length, 0,
      `expected 0 core entries on idle readStatus(), got ${JSON.stringify(coreOps)}`);
    assert.equal(txDelta, 0,
      `expected 0 SQLite transactions on idle readStatus(), got ${txDelta}`);
    assert.equal(eventDelta.length, 0,
      `expected 0 events on idle readStatus(), got ${JSON.stringify(eventDelta)}`);
    for (let index = 0; index < reads.length; index += 1) {
      assert.equal(reads[index].outcome, CORE_OK);
      assert.equal(Object.isFrozen(reads[index]), true,
        `read ${index} must be frozen`);
      assert.strictEqual(reads[index], reads[0],
        `read ${index} must return the exact same frozen object reference`);
    }
  } finally {
    unsubscribe();
    setActualCoreEntryObserver(null);
    cluster.dispose();
  }
});

for (const sendMode of [SEND_MODE.SYNC, SEND_MODE.ASYNC]) {
  test(`W2 (read with pending inbound, ${sendMode} send): readStatus() makes 0 core ` +
    'entries, leaves k envelopes queued, applies nothing, and emits no events',
  async () => {
    const replicaIds = [`w2-${sendMode}-a`, `w2-${sendMode}-b`, `w2-${sendMode}-c`];
    const {cluster, clocks, leader, followers} = await formThreeReplicaCluster({
      partitionId: `pure-read-w2-${sendMode}`,
      replicaIds,
    });
    const events = [];
    const port = cluster.node(leader);
    const unsubscribe = subscribeAllEvents(port, events);
    try {
      if (sendMode === SEND_MODE.ASYNC) {
        cluster.sendFor = (from, address, packet) => {
          cluster.queue(from, address, packet);
          return Promise.resolve(DELIVERED_TO_PEER);
        };
      }
      const replica = cluster.replica(leader);
      const appliedBefore = replica.appliedCommands.length;
      const command = {w2: sendMode};
      const proposed = await turnChainValue(port.propose(command));
      assert.equal(proposed.outcome, CORE_OK,
        'setup: leader appended entry awaiting follower acknowledgements');
      for (const follower of followers) {
        drainInboxThroughPort(cluster, clocks.get(follower), follower);
      }
      await nextEventLoopTurn();
      const deliveredCount = deliverToInboundOnly(cluster, leader);
      assert.ok(deliveredCount >= followers.length,
        `setup: ${deliveredCount} follower acknowledgements queued in inbound`);
      const preCheck = port[OBSERVE]();
      assert.equal(preCheck.inboundQueued, deliveredCount,
        'setup: inbound holds k unstepped envelopes before readStatus()');

      const coreMark = cluster.coreEntries.length;
      const eventMark = events.length;
      const status = port.readStatus();
      const coreOps = cluster.coreEntries.slice(coreMark);
      const eventDelta = events.slice(eventMark);
      const postCheck = port[OBSERVE]();

      assert.equal(status.outcome, CORE_OK);
      assert.equal(coreOps.length, 0,
        `expected 0 core entries during readStatus(), got ${JSON.stringify(coreOps)}`);
      assert.equal(postCheck.inboundQueued, deliveredCount,
        `expected inbound to still hold ${deliveredCount} envelopes, got ${postCheck.inboundQueued}`);
      assert.equal(replica.appliedCommands.length, appliedBefore,
        'expected no committed-entry application during readStatus()');
      assert.equal(eventDelta.length, 0,
        `expected no events during readStatus(), got ${JSON.stringify(eventDelta)}`);
    } finally {
      unsubscribe();
      setActualCoreEntryObserver(null);
      cluster.dispose();
    }
  });
}

test('W3 (read during a busy turn): N readStatus() calls while a turn awaits ' +
  'and inbound is pending queue 0 extra turns and 0 later discarded core entries',
async () => {
  const replicaIds = ['w3-a', 'w3-b', 'w3-c'];
  const {cluster, clocks, leader, followers} = await formThreeReplicaCluster({
    partitionId: 'pure-read-w3',
    replicaIds,
  });
  const port = cluster.node(leader);
  let releaseHeld = null;
  try {
    const heldSend = Promise.withResolvers();
    releaseHeld = () => heldSend.resolve(DELIVERED_TO_PEER);
    cluster.sendFor = (from, address, packet) => {
      if (from !== leader) return undefined;
      cluster.queue(from, address, packet);
      return heldSend.promise;
    };
    const pendingTurn = turnChainValue(port.propose({w3: 'busy-turn'}));
    await nextEventLoopTurn();
    for (const follower of followers) {
      drainInboxThroughPort(cluster, clocks.get(follower), follower);
    }
    const delivered = deliverToInboundOnly(cluster, leader);
    assert.ok(delivered >= 1, 'setup: pending inbound delivered during held turn');
    const preCheck = port[OBSERVE]();
    assert.equal(preCheck.turnPending, true, 'setup: turn is awaiting');
    assert.equal(preCheck.inboundQueued, delivered, 'setup: inbound is pending');

    const coreMark = cluster.coreEntries.length;
    const reads = [];
    for (let index = 0; index < CONSECUTIVE_READS; index += 1) {
      reads.push(port.readStatus());
    }
    assert.equal(cluster.coreEntries.slice(coreMark).length, 0,
      'N readStatus() calls enter 0 core operations synchronously');

    cluster.sendFor = null;
    releaseHeld();
    releaseHeld = null;
    const turnAnswer = await pendingTurn;
    assert.equal(turnAnswer.outcome, CORE_OK);
    await nextEventLoopTurn();
    await nextEventLoopTurn();

    const afterOps = cluster.coreEntries.slice(coreMark).map((entry) => entry.operation);
    const stepOps = afterOps.filter((op) => op === CORE_OP_STEP);
    const confStateOps = afterOps.filter((op) => op === CORE_OP_CONF_STATE);
    const postCheck = port[OBSERVE]();

    assert.equal(stepOps.length, 0,
      `expected 0 queued READ_STATUS drain steps after turn, got ${JSON.stringify(afterOps)}`);
    assert.ok(confStateOps.length <= 1,
      `expected at most 1 conf_state from the in-flight turn settle (0 from ${CONSECUTIVE_READS} reads), got ${JSON.stringify(afterOps)}`);
    assert.equal(postCheck.inboundQueued, delivered,
      'scheduled drain has not fired; inbound still holds delivered envelopes');
    for (const read of reads) {
      assert.equal(read.outcome, CORE_OK);
    }
  } finally {
    releaseHeld?.();
    setActualCoreEntryObserver(null);
    cluster.dispose();
  }
});

test('W4 (a read repairs nothing): readStatus() on a group in recovery enters ' +
  'no core, starts no reconstruction, and reflects truthful health and lifecycle state',
async () => {
  const failNextApply = {armed: false};
  const clock = new VirtualTimeSource({startMs: 1000});
  const cluster = new PartitionNodeCluster({
    partitionId: 'pure-read-w4-recovery',
    replicaIds: ['w4-rec-a'],
    substrateFor: () => ({timeSource: clock}),
    applyFor: () => {
      if (failNextApply.armed) {
        failNextApply.armed = false;
        throw new Error('injected W4 application failure');
      }
    },
  });
  try {
    const port = cluster.node('w4-rec-a');
    assert.equal((await turnChainValue(port.campaign())).outcome, CORE_OK);
    const before = port.readStatus();
    assert.equal(before.groupHealth, USABLE);
    assert.equal(before.runtimeHealth, HEALTHY);

    failNextApply.armed = true;
    const failed = await turnChainValue(port.propose({w4: 'trigger-recovery'}));
    assert.equal(failed.outcome, HOST_FAILURE);
    assert.equal(failed.recoveryRequired, true);

    const coreMark = cluster.coreEntries.length;
    const status = port.readStatus();
    const coreOps = cluster.coreEntries.slice(coreMark);

    assert.equal(coreOps.length, 0,
      `expected 0 core entries when reading status in recovery, got ${JSON.stringify(coreOps)}`);
    assert.equal(status.outcome, HOST_FAILURE);
    assert.equal(status.recoveryRequired, true);
    assert.equal(status.attempts, 0,
      `expected 0 reconstruction attempts started by readStatus(), got ${status.attempts}`);
    assert.equal(status.groupHealth, RECOVERY_REQUIRED,
      'returned observation reflects truthful groupHealth');
    assert.equal(status.runtimeHealth, HEALTHY,
      'returned observation reflects truthful runtimeHealth');
    assert.equal(status.runtimeGeneration, before.runtimeGeneration,
      'runtimeGeneration is preserved truthfully');
    assert.equal(status.lifecycleIncarnation, before.lifecycleIncarnation,
      'lifecycleIncarnation is preserved truthfully');
  } finally {
    setActualCoreEntryObserver(null);
    cluster.dispose();
  }
});

test('W4 (a read repairs nothing): readStatus() under an unhealthy runtime enters ' +
  'no core, starts no replacement, and reflects truthful health and generation',
async () => {
  const clock = new VirtualTimeSource({startMs: 1000});
  const cluster = new PartitionNodeCluster({
    partitionId: 'pure-read-w4-unhealthy',
    replicaIds: ['w4-unhealthy-a'],
    substrateFor: () => ({timeSource: clock}),
  });
  const originalConsoleError = console.error;
  try {
    const port = cluster.node('w4-unhealthy-a');
    assert.equal((await turnChainValue(port.campaign())).outcome, CORE_OK);
    const before = port.readStatus();

    setCoreFaultInjector((groupId, operation) => {
      if (groupId === 'pure-read-w4-unhealthy' && operation === 'propose') {
        setCoreFaultInjector(null);
        throw new globalThis.WebAssembly.RuntimeError('injected W4 core trap');
      }
    });
    console.error = () => undefined;
    const fatal = await turnChainValue(port.propose({w4: 'trap'}));
    console.error = originalConsoleError;
    assert.equal(fatal.outcome, CORE_FATAL);

    const coreMark = cluster.coreEntries.length;
    const status = port.readStatus();
    const coreOps = cluster.coreEntries.slice(coreMark);

    assert.equal(coreOps.length, 0,
      `expected 0 core entries when reading status under unhealthy runtime, got ${JSON.stringify(coreOps)}`);
    assert.equal(status.outcome, HOST_FAILURE);
    assert.equal(status.recoveryRequired, true);
    assert.equal(status.runtimeHealth, UNHEALTHY,
      'returned observation reflects truthful UNHEALTHY runtimeHealth');
    assert.equal(status.runtimeGeneration, before.runtimeGeneration,
      'runtimeGeneration must not advance when readStatus() repairs nothing');
    assert.equal(status.groupHealth, USABLE,
      'returned observation reflects truthful groupHealth');
    assert.equal(status.lifecycleIncarnation, before.lifecycleIncarnation,
      'lifecycleIncarnation is preserved truthfully');
  } finally {
    console.error = originalConsoleError;
    setCoreFaultInjector(null);
    setActualCoreEntryObserver(null);
    cluster.dispose();
  }
});

test('step (h): STATUS_CHANGED emits only when settled status changes and ' +
  'reuses the same frozen object across no-op turns', async () => {
  const replicaIds = ['steph-a', 'steph-b', 'steph-c'];
  const {cluster, clocks, leader, followers} = await formThreeReplicaCluster({
    partitionId: 'pure-read-step-h',
    replicaIds,
  });
  const port = cluster.node(leader);
  const events = [];
  const unsubscribe = subscribeAllEvents(port, events);
  try {
    const before = port.readStatus();
    const mark = events.length;
    const ticked = await turnChainValue(port.tick());
    assert.equal(ticked.outcome, CORE_OK);
    quiesceWithClocks(cluster, clocks, [leader, ...followers]);
    const afterNoop = port.readStatus();
    assert.strictEqual(afterNoop, before,
      'no-op tick/heartbeat keeps the exact same frozen status object reference');
    const noopStatusEvents = events.slice(mark).filter((e) =>
      [RAFT_EVENT.STATUS_CHANGED, RAFT_EVENT.LEADER, RAFT_EVENT.FOLLOWER,
        RAFT_EVENT.CANDIDATE, RAFT_EVENT.TERM_CHANGE, RAFT_EVENT.LEADER_CHANGE]
        .includes(e.eventName));
    assert.deepEqual(noopStatusEvents, [],
      'no-op turns emit 0 STATUS_CHANGED, role, term, or leader events');

    const changeMark = events.length;
    const proposed = await turnChainValue(port.propose({stepH: 'advance'}));
    assert.equal(proposed.outcome, CORE_OK);
    quiesceWithClocks(cluster, clocks, [leader, ...followers]);
    const afterChange = port.readStatus();
    assert.notStrictEqual(afterChange, before,
      'a committed/applied write updates the settled status object');
    assert.ok(afterChange.appliedIndex > before.appliedIndex);
    const statusChanges = events.slice(changeMark)
      .filter((e) => e.eventName === RAFT_EVENT.STATUS_CHANGED);
    assert.ok(statusChanges.length >= 1,
      'STATUS_CHANGED emits when settled status changes');
    assert.strictEqual(statusChanges.at(-1).payload, afterChange,
      'STATUS_CHANGED payload matches the settled readStatus() object');
  } finally {
    unsubscribe();
    setActualCoreEntryObserver(null);
    cluster.dispose();
  }
});

async function electWithoutStatusRead(cluster, clocks, leaderId, replicaIds) {
  for (let round = 0; round < 200; round += 1) {
    if (cluster.node(leaderId)[OBSERVE]().currentTermApplied === true) {
      quiesceWithClocks(cluster, clocks, replicaIds);
      return;
    }
    const sittingLeader = replicaIds.find((id) =>
      id !== leaderId && cluster.node(id)[OBSERVE]().role === 'leader');
    if (sittingLeader !== undefined) {
      await turnChainValue(cluster.node(sittingLeader).transferLeadership({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: leaderId,
      }));
      quiesceWithClocks(cluster, clocks, replicaIds);
      continue;
    }
    for (const id of replicaIds) {
      await turnChainValue(cluster.node(id).tick());
      drainInboxThroughPort(cluster, clocks.get(id), id);
    }
    if (round % 10 === 0 && cluster.node(leaderId)[OBSERVE]().role !== 'leader') {
      await turnChainValue(cluster.node(leaderId).campaign());
      quiesceWithClocks(cluster, clocks, replicaIds);
    }
  }
  assert.fail(`setup: ${leaderId} did not become settled leader without readStatus()`);
}

test('progress, recovery, runtime replacement, and compaction sync continue ' +
  'with zero readStatus() calls', async () => {
  const failNextApply = {armed: false};
  const replicaIds = ['nopoll-a', 'nopoll-b', 'nopoll-c'];
  const clocks = new Map(replicaIds.map((id) =>
    [id, new VirtualTimeSource({startMs: 1000})]));
  const cluster = new PartitionNodeCluster({
    partitionId: 'pure-read-zero-polling',
    replicaIds,
    substrateFor: (id) => ({timeSource: clocks.get(id)}),
    applyFor: () => {
      if (failNextApply.armed) {
        failNextApply.armed = false;
        throw new Error('injected zero-poll apply failure');
      }
    },
  });
  const originalConsoleError = console.error;
  try {
    const portA = cluster.node('nopoll-a');
    assert.equal((await turnChainValue(portA.campaign())).outcome, CORE_OK);
    for (let tick = 0; tick < 6; tick += 1) {
      for (const id of replicaIds) {
        const inbox = cluster.replica(id).inbox.splice(0);
        for (const env of inbox) cluster.node(id).step(env);
        clocks.get(id).advance(0);
      }
      await turnChainValue(portA.tick());
    }
    const firstWrite = await turnChainValue(portA.propose({zeroPoll: 1}));
    assert.equal(firstWrite.outcome, CORE_OK);
    quiesceWithClocks(cluster, clocks, replicaIds);
    assert.equal(cluster.replica('nopoll-a').appliedCommands.length, 1);

    // Group recovery via tick() with 0 readStatus() calls.
    failNextApply.armed = true;
    const proposedFail = await turnChainValue(portA.propose({zeroPoll: 2}));
    assert.equal(proposedFail.outcome, CORE_OK);
    for (const id of ['nopoll-b', 'nopoll-c']) {
      for (const env of cluster.replica(id).inbox.splice(0)) cluster.node(id).step(env);
      clocks.get(id).advance(0);
    }
    for (const env of cluster.replica('nopoll-a').inbox.splice(0)) portA.step(env);
    const failedStep = await turnChainValue(portA.tick());
    assert.equal(failedStep.outcome, HOST_FAILURE);
    assert.equal(failedStep.recoveryRequired, true);
    const reconstructed = await turnChainValue(portA.tick());
    assert.equal(reconstructed.outcome, CORE_OK);
    quiesceWithClocks(cluster, clocks, replicaIds);
    assert.equal(cluster.replica('nopoll-a').appliedCommands.length, 2,
      'group recovery replayed and applied entry without any readStatus() call');
    await electWithoutStatusRead(cluster, clocks, 'nopoll-a', replicaIds);

    // Runtime replacement via tick() with 0 readStatus() calls.
    setCoreFaultInjector((groupId, operation) => {
      if (groupId === 'pure-read-zero-polling' && operation === 'propose') {
        setCoreFaultInjector(null);
        throw new globalThis.WebAssembly.RuntimeError('zero-poll core trap');
      }
    });
    console.error = () => undefined;
    const fatal = await turnChainValue(portA.propose({zeroPoll: 'trap'}));
    console.error = originalConsoleError;
    assert.equal(fatal.outcome, CORE_FATAL);
    const replaced = await turnChainValue(portA.tick());
    assert.equal(replaced.outcome, CORE_OK);
    await electWithoutStatusRead(cluster, clocks, 'nopoll-a', replicaIds);
    const afterTrapWrite = await turnChainValue(portA.propose({zeroPoll: 3}));
    assert.equal(afterTrapWrite.outcome, CORE_OK);
    quiesceWithClocks(cluster, clocks, replicaIds);
    assert.equal(cluster.replica('nopoll-a').appliedCommands.length, 3,
      'runtime replacement and subsequent progress succeeded with 0 readStatus() calls');

    // Compaction sync via tick() without any readStatus() call.
    const storeA = new RaftRsDurableStore(cluster.replica('nopoll-a').db);
    const progressBefore = storeA.readDurableProgress('pure-read-zero-polling');
    const compacted = storeA.compactCommittedPrefix('pure-read-zero-polling', {
      toIndex: Number(progressBefore.appliedIndex),
    });
    assert.equal(compacted.changed, true, JSON.stringify(compacted));
    const syncMark = cluster.coreEntries.length;
    const syncedTick = await turnChainValue(portA.tick());
    assert.equal(syncedTick.outcome, CORE_OK);
    assert.equal(cluster.coreEntries.slice(syncMark).some((entry) =>
      entry.operation === 'seed_storage'), true,
    'compacted storage synced into core on tick() with 0 readStatus() calls');
  } finally {
    console.error = originalConsoleError;
    setCoreFaultInjector(null);
    setActualCoreEntryObserver(null);
    cluster.dispose();
  }
});

test('readCommittedMembership BOOTSTRAP/WITNESS are pure settled reads while ' +
  'LEARNER_ACTION remains an explicit settle-then-read turn', async () => {
  const replicaIds = ['rcm-a', 'rcm-b', 'rcm-c'];
  const {cluster, clocks, leader, followers} = await formThreeReplicaCluster({
    partitionId: 'pure-read-rcm',
    replicaIds,
  });
  try {
    const port = cluster.node(leader);
    const proposed = await turnChainValue(port.propose({rcm: 'pending'}));
    assert.equal(proposed.outcome, CORE_OK);
    for (const follower of followers) {
      drainInboxThroughPort(cluster, clocks.get(follower), follower);
    }
    const delivered = deliverToInboundOnly(cluster, leader);
    assert.ok(delivered >= followers.length);

    const coreMark = cluster.coreEntries.length;
    const bootstrap = port.readCommittedMembership({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP,
      includeRole: true,
    });
    const witness = port.readCommittedMembership({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS,
      replicaIdentity: leader,
    });
    assert.equal(bootstrap.kind, COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
    assert.equal(witness.kind, COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
    assert.equal(cluster.coreEntries.slice(coreMark).length, 0,
      'BOOTSTRAP and WITNESS readCommittedMembership make 0 core entries');
    assert.equal(port[OBSERVE]().inboundQueued, delivered);

    const settleId = '__rcm_settle__';
    const learnerTurn = await port.readCommittedMembership({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.LEARNER_ACTION,
      groupId: 'pure-read-rcm',
      action: {
        operationId: 'rcm-settle',
        transitionIdentity: 'rcm-settle',
        permitSequence: 1,
        stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
        replicaIdentity: settleId,
        peerId: deriveRaftRsPeerId(settleId),
        nodeId: 'rcm-node',
      },
    });
    assert.ok(typeof learnerTurn?.kind === 'string');
    assert.equal(port[OBSERVE]().inboundQueued, 0,
      'LEARNER_ACTION explicitly drained pending inbound');
  } finally {
    setActualCoreEntryObserver(null);
    cluster.dispose();
  }
});

test('Directive 5: exceptional identity-registry failure during lazy status ' +
  'shaping leaves readStatus() pure and transitions only on owner turn', async () => {
  const replicaIds = ['id-fault-a', 'id-fault-b', 'id-fault-c'];
  const {cluster, clocks, leader} = await formThreeReplicaCluster({
    partitionId: 'pure-read-identity-fault',
    replicaIds,
  });
  const port = cluster.node(leader);
  const targetDb = cluster.replica(leader).db;
  const leaderClock = clocks.get(leader);
  const events = [];
  let unsubscribe = () => {};
  let timersScheduled = 0;
  const originalSetTimeout = leaderClock.setTimeout.bind(leaderClock);
  leaderClock.setTimeout = (...args) => {
    timersScheduled += 1;
    return originalSetTimeout(...args);
  };
  const originalResolve = RaftRsPeerIdentityRegistry.prototype.resolveReplicaIdentity;
  let mode = 'off';
  let callsInRead = 0;
  RaftRsPeerIdentityRegistry.prototype.resolveReplicaIdentity = function resolveSpy(peerId) {
    if (this.db === targetDb && mode !== 'off') {
      callsInRead += 1;
      if (mode === 'progress' && callsInRead >= 4) {
        throw new Error('injected progress identity failure');
      }
      if (mode === 'always') {
        throw new Error('injected identity-registry failure');
      }
    }
    return originalResolve.call(this, peerId);
  };
  try {
    const proposed = await turnChainValue(port.propose({idFault: 1}));
    assert.equal(proposed.outcome, CORE_OK);
    quiesceWithClocks(cluster, clocks, replicaIds);
    assert.equal(port[OBSERVE]().role, 'leader');
    assert.equal(port[OBSERVE]().groupHealth, USABLE);

    // Subscribe after quiesce so STATUS_CHANGED did not pre-shape group.shapedStatus.
    unsubscribe = subscribeAllEvents(port, events);

    // 10a: followerProgressSnapshot throws during lazy readStatus().
    mode = 'progress';
    callsInRead = 0;
    events.length = 0;
    const timerBeforeA = timersScheduled;
    const coreBeforeA = cluster.coreEntries.length;
    const statusA = port.readStatus();
    assert.equal(statusA.outcome, HOST_FAILURE);
    assert.equal(statusA.phase, RUNTIME_PHASE.ADDRESS_RESOLUTION);
    assert.equal(statusA.recoveryRequired, true);
    assert.equal(statusA.reason, 'injected progress identity failure');
    assert.equal(cluster.coreEntries.length, coreBeforeA,
      'lazy readStatus() progress identity failure makes 0 core entries');
    assert.deepEqual(events, [],
      'lazy readStatus() progress identity failure emits 0 events');
    assert.equal(timersScheduled, timerBeforeA,
      'lazy readStatus() progress identity failure schedules 0 timers');
    assert.equal(port[OBSERVE]().groupHealth, USABLE,
      'lazy readStatus() progress identity failure does not mutate groupHealth');

    // 10b: leaderObservation throws during lazy readStatus().
    mode = 'always';
    callsInRead = 0;
    events.length = 0;
    const timerBeforeB = timersScheduled;
    const coreBeforeB = cluster.coreEntries.length;
    const statusB = port.readStatus();
    assert.equal(statusB.outcome, HOST_FAILURE);
    assert.equal(statusB.phase, RUNTIME_PHASE.ADDRESS_RESOLUTION);
    assert.equal(statusB.recoveryRequired, true);
    assert.equal(statusB.reason, 'injected identity-registry failure');
    assert.equal(cluster.coreEntries.length, coreBeforeB,
      'lazy readStatus() leader identity failure makes 0 core entries');
    assert.deepEqual(events, [],
      'lazy readStatus() leader identity failure emits 0 events');
    assert.equal(timersScheduled, timerBeforeB,
      'lazy readStatus() leader identity failure schedules 0 timers');
    assert.equal(port[OBSERVE]().groupHealth, USABLE,
      'lazy readStatus() leader identity failure does not mutate groupHealth');

    // 10c: Owner turn catches identity-registry failure in readGroupObservation
    // and performs the state transition cleanly on the owner turn.
    events.length = 0;
    const timerBeforeC = timersScheduled;
    const tickResult = await turnChainValue(port.tick());
    assert.equal(tickResult.outcome, HOST_FAILURE);
    assert.equal(tickResult.phase, RUNTIME_PHASE.ADDRESS_RESOLUTION);
    assert.equal(tickResult.recoveryRequired, true);
    assert.equal(port[OBSERVE]().groupHealth, RECOVERY_REQUIRED,
      'owner turn transitions groupHealth to RECOVERY_REQUIRED on identity failure');
    assert.ok(timersScheduled > timerBeforeC,
      'owner turn schedules group recovery timer');
    assert.ok(events.some(({eventName}) => eventName === RAFT_EVENT.FOLLOWER),
      'owner turn announces role loss via announceNoRole');

    events.length = 0;
    const timerBeforeHoldRead = timersScheduled;
    const coreBeforeHoldRead = cluster.coreEntries.length;
    const heldStatus = port.readStatus();
    assert.equal(heldStatus.outcome, HOST_FAILURE);
    assert.equal(heldStatus.phase, RUNTIME_PHASE.ADDRESS_RESOLUTION);
    assert.equal(heldStatus.recoveryRequired, true);
    assert.equal(heldStatus.groupHealth, RECOVERY_REQUIRED);
    assert.equal(cluster.coreEntries.length, coreBeforeHoldRead);
    assert.deepEqual(events, []);
    assert.equal(timersScheduled, timerBeforeHoldRead);

    mode = 'off';
    leaderClock.advance(1000);
    const recovered = await turnChainValue(port.tick());
    assert.equal(recovered.outcome, CORE_OK);
    assert.equal(port[OBSERVE]().groupHealth, USABLE);
    assert.equal(port.readStatus().outcome, CORE_OK);
  } finally {
    RaftRsPeerIdentityRegistry.prototype.resolveReplicaIdentity = originalResolve;
    unsubscribe();
    setActualCoreEntryObserver(null);
    cluster.dispose();
  }
});
