// Actual raft-rs ports: an acknowledged inbound envelope owns one foreground
// clock wake, with exact original-clock cancellation on close. Never use a
// polling reader, synthetic queue or direct core-step as a liveness substitute.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RealTimeSource, VirtualTimeSource} from '../../../src/time/time-source.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {PERSISTENCE_ADMISSION_WAIT} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {setActualCoreEntryObserver, setCoreFaultInjector,
  setNativeInboundStageObserver} from
  '../../../src/raft/raft-rs-runtime-owner.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {coreTrappingAppend} from './core-trap-envelope.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';

function observedClock(clock = new VirtualTimeSource({startMs: 1000})) {
  const originalSet = clock.setTimeout.bind(clock);
  const originalClear = clock.clearTimeout.bind(clock);
  const issued = [];
  const cleared = [];
  clock.setTimeout = (callback, ms, ...args) => {
    const handle = originalSet(callback, ms, ...args);
    issued.push({handle, ms});
    return handle;
  };
  clock.clearTimeout = (handle) => {
    cleared.push(handle);
    return originalClear(handle);
  };
  return {clock, issued, cleared};
}

async function withAcceptedFollower(partitionId, body, createClock = observedClock) {
  const replicaIds = ['timer-r1', 'timer-r2', 'timer-r3'];
  const clocks = new Map(replicaIds.map((id) => [id, createClock()]));
  const cluster = new PartitionNodeCluster({
    partitionId, replicaIds,
    substrateFor: (replicaId) => ({timeSource: clocks.get(replicaId).clock}),
  });
  let failure = null;
  try {
    assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null), true,
      'the actual native group elects before timer ownership is tested');
    const leader = cluster.leaderReplicaId();
    const recipientId = replicaIds.find((id) => id !== leader);
    const recipient = cluster.replica(recipientId);
    const owned = clocks.get(recipientId);
    if (typeof owned.clock.advance === 'function') owned.clock.advance(0);
    else await new Promise((resolve) => setImmediate(resolve));
    const status = recipient.node.readStatus();
    assert.equal(status.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    const envelope = coreTrappingAppend({
      dbFile: recipient.dbFile,
      groupId: partitionId,
      status,
      from: cluster.raftPeerIdOf(leader),
      term: String(status.term),
    });
    // Reuse the existing real-envelope producer without injecting a core trap.
    setCoreFaultInjector(null);
    await body({cluster, recipient, owned, envelope});
  } catch (error) {
    failure = error;
  } finally {
    setCoreFaultInjector(null);
    try {
      cluster.dispose();
    } catch (error) {
      failure = failure === null ? error :
        new AggregateError([failure, error], 'real native timer fixture cleanup failed');
    }
  }
  if (failure !== null) throw failure;
}

// Start three real peers without delivering an earlier carrier into the
// recipient: an existing zero-delay timer would coalesce a newly admitted
// carrier and make its own acquisition impossible to measure.
async function withFreshUnsteppedRecipient(partitionId, body) {
  const replicaIds = ['timer-r1', 'timer-r2', 'timer-r3'];
  const clocks = new Map(replicaIds.map((id) =>
    [id, observedClock(new RealTimeSource())]));
  const cluster = new PartitionNodeCluster({partitionId, replicaIds,
    substrateFor: (id) => ({timeSource: clocks.get(id).clock})});
  let failure = null;
  try {
    const sender = cluster.node(replicaIds[0]);
    const recipient = cluster.replica(replicaIds[1]);
    const owned = clocks.get(replicaIds[1]);
    assert.equal(owned.issued.length, 0,
      'a never-delivered recipient has no preexisting inbound wake');
    // This tests admitted inbound custody, not election. The real registered
    // sending peer need not have formed a quorum before the first delivery.
    const senderStatus = sender.readStatus();
    const status = recipient.node.readStatus();
    assert.equal(status.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(senderStatus.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    const inboundTerm = String(Math.max(1, senderStatus.term, status.term));
    assert.equal(owned.issued.length, 0,
      'sender campaign queued transport, but delivered no recipient carrier');
    const envelope = coreTrappingAppend({
      dbFile: recipient.dbFile, groupId: partitionId,
      status, from: senderStatus.peerId, term: inboundTerm,
    });
    setCoreFaultInjector(null);
    await body({cluster, recipient, owned, envelope});
  } catch (error) {
    failure = error;
  } finally {
    setCoreFaultInjector(null);
    try {
      cluster.dispose();
    } catch (error) {
      failure = failure === null ? error : new AggregateError([failure, error],
        'fresh unstepped native recipient cleanup failed');
    }
  }
  if (failure !== null) throw failure;
}

test('an accepted native envelope references its original Node timer until its real turn',
  async () => withFreshUnsteppedRecipient('native-inbound-foreground-liveness', async ({
    recipient, owned, envelope,
  }) => {
    const issuedBefore = owned.issued.length;
    // Capture the scheduling obligation at the synchronous admission boundary;
    // awaiting a settled step can allow its 0ms callback to retire the timer.
    const accepted = turnChainValue(recipient.node.step(envelope));
    assert.notEqual(typeof accepted?.then, 'function',
      'native ingress returns its typed enqueue outcome before the drain');
    assert.equal(accepted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(accepted.reason, 'inbound-enqueued',
      'the real native peer ingress admits the exact envelope');
    const current = owned.issued.slice(issuedBefore)
      .filter((record) => record.ms === 0);
    assert.equal(current.length, 1,
      'the original scheduler owns one newly accepted native drain');
    const handle = current[0].handle;
    assert.equal(typeof handle?.hasRef, 'function',
      'the native test observes an actual platform timeout');
    assert.equal(handle.hasRef(), true,
      'admitted Raft work keeps the Node event loop alive until its own turn');
    const closed = recipient.node.close();
    assert.equal(closed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(owned.cleared.filter((value) => value === handle).length, 1,
      'the original timer is retired by exact close instead of a stray callback');
  }));

test('two admitted native envelopes share one timer, then close cancels its exact handle',
  async () => withAcceptedFollower('native-inbound-timer-close', async ({
    cluster, recipient, owned, envelope,
  }) => {
    const baseline = owned.clock.pendingTimerCount();
    assert.equal(baseline, 0, 'old setup delivery has no pending timer');
    const first = await turnChainValue(recipient.node.step(envelope));
    const second = await turnChainValue(recipient.node.step(envelope));
    assert.equal(first.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(second.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(first.reason, 'inbound-enqueued');
    assert.equal(second.reason, 'inbound-enqueued');
    assert.equal(owned.clock.pendingTimerCount(), baseline + 1,
      'both accepted messages coalesce under the original native scheduler');
    const handle = owned.issued.at(-1)?.handle;
    assert.notEqual(handle, undefined);
    const beforeClose = cluster.coreEntryCount();
    const closed = recipient.node.close();
    assert.equal(closed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.ok(cluster.coreEntryCount() >= beforeClose,
      'the native close does not resurrect an earlier core generation');
    assert.equal(owned.clock.pendingTimerCount(), baseline,
      'the exact accepted-work timer is no longer owned');
    assert.equal(owned.cleared.filter((entry) => entry === handle).length, 1,
      'close clears the exact original timer once');
    const closedEntries = cluster.coreEntryCount();
    owned.clock.advance(0);
    assert.equal(cluster.coreEntryCount(), closedEntries,
      'an obsolete native wake cannot enter the core after close');
    assert.equal(recipient.node.close().reason, 'already-closed');
  }));

test('an accepted inbound retry stays bounded and close retires its original clock',
  async () => withAcceptedFollower('native-inbound-timer-retry', async ({
    recipient, owned, envelope,
  }) => {
    const db = recipient.db;
    const baseline = owned.clock.pendingTimerCount();
    assert.equal(baseline, 0);
    const accepted = await turnChainValue(recipient.node.step(envelope));
    assert.equal(accepted.reason, 'inbound-enqueued');
    const initialHandle = owned.issued.at(-1)?.handle;
    db.exec('BEGIN');
    try {
      owned.clock.advance(0);
      assert.equal(owned.clock.pendingTimerCount(), baseline + 1,
        'a held session retains exactly one native admission-retry timer');
      assert.equal(owned.issued.at(-1)?.ms,
        PERSISTENCE_ADMISSION_WAIT.POLL_INTERVAL_MS,
        'the existing retry interval is not changed');
      assert.notEqual(owned.issued.at(-1)?.handle, initialHandle,
        'the first callback retires before a bounded retry is owned');
    } finally {
      db.exec('ROLLBACK');
    }
    const retryHandle = owned.issued.at(-1)?.handle;
    const closed = recipient.node.close();
    assert.equal(closed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(owned.clock.pendingTimerCount(), baseline);
    assert.equal(owned.cleared.filter((handle) => handle === retryHandle).length, 1,
      'the outstanding retry is cancelled through its original scheduler');
    owned.clock.advance(PERSISTENCE_ADMISSION_WAIT.BOUND_MS * 2);
    assert.equal(owned.clock.pendingTimerCount(), baseline,
      'nothing rearms a retry after native group close');
  }));


test('a replacement-time native drain preserves the admitted follower debt',
  () => {
    const partitionId = 'native-inbound-replacement-p1';
    const triggerId = 'native-inbound-replacement-trigger';
    const replicaIds = ['debt-r1', 'debt-r2', 'debt-r3'];
    const clocks = new Map(replicaIds.map((id) => [id, observedClock()]));
    const first = new PartitionNodeCluster({
      partitionId, replicaIds,
      substrateFor: (id) => ({timeSource: clocks.get(id).clock}),
    });
    const second = new PartitionNodeCluster({
      partitionId: triggerId, replicaIds: ['trigger-r1'],
    });
    const recipient = first.replica('debt-r2');
    const originalScheduler = clocks.get('debt-r2').clock;
    const stages = [];
    let coreSteps = 0;
    let injected = false;
    let advancedDuringReplacement = false;
    let failure = null;
    try {
      const status = recipient.node.readStatus();
      const sender = first.node('debt-r1').readStatus();
      assert.equal(status.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      assert.equal(sender.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      assert.equal(originalScheduler.pendingTimerCount(), 0);
      const envelope = coreTrappingAppend({dbFile: recipient.dbFile,
        groupId: partitionId, status, from: sender.peerId, term: '1'});
      setCoreFaultInjector(null);
      setNativeInboundStageObserver((event) => {
        if (event.groupId === partitionId &&
            event.replicaIdentity === 'debt-r2') {
          stages.push(event.stage);
        }
      });
      const accepted = turnChainValue(recipient.node.step(envelope));
      assert.equal(accepted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      assert.equal(accepted.reason, 'inbound-enqueued');
      assert.equal(originalScheduler.pendingTimerCount(), 1,
        'one accepted inbound wake is owned before the replacement');
      setActualCoreEntryObserver((entry) => {
        if (entry.groupId === partitionId && entry.operation === 'step') {
          coreSteps += 1;
        }
        if (!advancedDuringReplacement && entry.groupId === partitionId &&
            entry.operation === 'create_node') {
          advancedDuringReplacement = true;
          // Exercise exactly the previously armed timer while the shared
          // runtime is rebuilding, not by manually ticking the recipient.
          originalScheduler.advance(0);
        }
      });
      setCoreFaultInjector((groupId, operation) => {
        if (!injected && groupId === triggerId && operation === 'tick') {
          injected = true;
          setCoreFaultInjector(null);
          throw new globalThis.WebAssembly.RuntimeError(
            'injected shared-core replacement');
        }
      });
      const trapped = turnChainValue(second.node('trigger-r1').tick());
      assert.equal(injected, true, 'the real second group traps its core');
      assert.notEqual(trapped.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      // Existing trigger-group recovery drives the shared replacement once;
      // no caller-side status read or tick touches the queued recipient.
      second.node('trigger-r1').readStatus();
      assert.equal(advancedDuringReplacement, true,
        'the accepted timer fired inside the shared reconstruction barrier');
      assert.ok(stages.includes('callback') &&
        (stages.includes('turn-request') || stages.includes('runtime-held')),
      'the exact follower attempted or deferred its inbound wake at the barrier');
      assert.equal(coreSteps, 0,
        'a queued follower cannot enter an obsolete core mid-replacement');
      originalScheduler.advance(0);
      assert.ok(coreSteps > 0,
        'after shared recovery, exact accepted inbound debt must reenter native core ' +
        'without an unrelated reader or tick');
    } catch (error) {
      failure = error;
    } finally {
      setCoreFaultInjector(null);
      setActualCoreEntryObserver(null);
      setNativeInboundStageObserver(null);
      for (const cluster of [second, first]) {
        try {
          cluster.dispose();
        } catch (error) {
          failure = failure === null ? error :
            new AggregateError([failure, error],
              'shared replacement native timer cleanup failed');
        }
      }
    }
    if (failure !== null) throw failure;
  });

test('failed shared reconstruction retains the exact admitted wake until a later valid retry',
  () => {
    const partitionId = 'inbound-owned-runtime-retry-p1';
    const triggerId = 'inbound-owned-runtime-retry-trigger';
    const replicas = ['retry-a', 'retry-b', 'retry-c'];
    const clocks = new Map(replicas.map((id) => [id, observedClock()]));
    const triggerClock = new VirtualTimeSource({startMs: 1000});
    const group = new PartitionNodeCluster({
      partitionId, replicaIds: replicas,
      substrateFor: (id) => ({timeSource: clocks.get(id).clock}),
    });
    const triggerGroup = new PartitionNodeCluster({
      partitionId: triggerId, replicaIds: ['retry-trigger'],
      substrateFor: () => ({timeSource: triggerClock}),
    });
    const recipient = group.replica('retry-b');
    const scheduler = clocks.get('retry-b').clock;
    const stages = [];
    let trappedTick = false;
    let trappedReplacement = false;
    let callbackInReplacement = false;
    let stepped = 0;
    let failure = null;
    try {
      const status = recipient.node.readStatus();
      const sender = group.node('retry-a').readStatus();
      const envelope = coreTrappingAppend({dbFile: recipient.dbFile,
        groupId: partitionId, status,
        from: sender.peerId, term: '1'});
      setCoreFaultInjector(null);
      const admitted = turnChainValue(recipient.node.step(envelope));
      assert.equal(admitted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      assert.equal(admitted.reason, 'inbound-enqueued');
      assert.equal(scheduler.pendingTimerCount(), 1);
      setNativeInboundStageObserver((event) => {
        if (event.groupId === partitionId &&
            event.replicaIdentity === 'retry-b') {
          stages.push(event.stage);
        }
      });
      setActualCoreEntryObserver((entry) => {
        if (entry.groupId === partitionId && entry.operation === 'step') {
          stepped += 1;
        }
        if (!callbackInReplacement && entry.groupId === partitionId &&
            entry.operation === 'create_node') {
          callbackInReplacement = true;
          scheduler.advance(0);
        }
      });
      setCoreFaultInjector((id, operation) => {
        if (id !== triggerId) return;
        if (!trappedTick && operation === 'tick') {
          trappedTick = true;
          throw new globalThis.WebAssembly.RuntimeError('first shared core trap');
        }
        if (trappedTick && !trappedReplacement && operation === 'create_node') {
          trappedReplacement = true;
          setCoreFaultInjector(null);
          throw new globalThis.WebAssembly.RuntimeError(
            'injected failed shared reconstruction');
        }
      });
      const first = turnChainValue(triggerGroup.node('retry-trigger').tick());
      assert.equal(trappedTick, true, 'the real core tick traps once');
      assert.notEqual(first.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      const failed = triggerGroup.node('retry-trigger').readStatus();
      assert.equal(trappedReplacement, true,
        'the first real shared reconstruction fails after accepted-wake callback');
      assert.equal(callbackInReplacement, true,
        'the native wake ran inside the first shared replacement barrier');
      assert.equal(failed.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE);
      assert.ok(stages.includes('runtime-held'),
        'the first replacement retains a typed transient inbound debt');
      assert.equal(stepped, 0,
        'no accepted inbound step enters an invalid core generation');
      assert.ok(Number.isSafeInteger(failed.retryAfterMs) && failed.retryAfterMs > 0,
        'the existing recovery owner retains a finite retry budget');
      scheduler.advance(0);
      assert.equal(stepped, 0,
        'no old timer may claim the accepted work while reconstruction is held');
      triggerClock.advance(failed.retryAfterMs);
      const resumed = triggerGroup.node('retry-trigger').readStatus();
      assert.equal(resumed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
        'a later allowed runtime retry reconstructs the original groups');
      scheduler.advance(0);
      assert.ok(stepped > 0,
        'post-retry current-generation owner resubmits the one accepted inbound wake');
    } catch (error) {
      failure = error;
    } finally {
      setCoreFaultInjector(null);
      setActualCoreEntryObserver(null);
      setNativeInboundStageObserver(null);
      for (const cluster of [triggerGroup, group]) {
        try {
          cluster.dispose();
        } catch (error) {
          failure = failure === null ? error : new AggregateError([failure, error],
            'failed shared runtime retry and accepted timer cleanup failed');
        }
      }
    }
    if (failure !== null) throw failure;
  });

test('a failed timer clear is typed without skipping actual native group close',
  async () => withAcceptedFollower('native-inbound-timer-clear-fault', async ({
    cluster, recipient, owned, envelope,
  }) => {
    const baseline = owned.clock.pendingTimerCount();
    assert.equal(baseline, 0);
    assert.equal((await turnChainValue(recipient.node.step(envelope))).reason, 'inbound-enqueued');
    const originalClear = owned.clock.clearTimeout;
    const refusal = new Error('timer cancellation refused by source clock');
    owned.clock.clearTimeout = () => {
      throw refusal;
    };
    let closed;
    try {
      closed = recipient.node.close();
    } finally {
      owned.clock.clearTimeout = originalClear;
    }
    assert.equal(closed.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE);
    assert.equal(closed.phase, 'inbound-timer-cleanup');
    assert.equal(closed.timerCleanupError, refusal,
      'the original Error object survives cleanup and reply');
    const entriesAfterClose = cluster.coreEntryCount();
    owned.clock.advance(0);
    assert.equal(cluster.coreEntryCount(), entriesAfterClose,
      'a failed clear disarms the callback rather than entering closed core');
    assert.equal(owned.clock.pendingTimerCount(), baseline,
      'the old finite timeout retires with no new work');
  }));

test('scheduled inbound drain bounds batches to 32 entries per turn and avoids ' +
  '0ms spin when an attempt does not succeed with CORE_OK', async () => {
  const {RAFT_RS_MESSAGE_TYPE} = await import(
    '../../../src/raft/raft-rs-ingress-constants.js'
  );
  const REPLICAS = ['drain-a', 'drain-b', 'drain-c'];
  const [A, B] = REPLICAS;
  const setupBoundedDrainCluster = () => {
    const clocks = new Map(REPLICAS.map((id) =>
      [id, new VirtualTimeSource({startMs: 1000})]));
    let holdB = false;
    const heldB = [];
    const cluster = new PartitionNodeCluster({
      partitionId: 'bounded-inbound-drain',
      replicaIds: REPLICAS,
      substrateFor: (id) => ({timeSource: clocks.get(id)}),
      sendFor: (from) => {
        if (from !== B || !holdB) return undefined;
        const gate = Promise.withResolvers();
        heldB.push(gate);
        return gate.promise;
      },
    });
    assert.equal(cluster.settle(() => cluster.leaderReplicaId() === A), true);
    let heartbeat = null;
    for (let round = 0; round < 12 && !heartbeat; round += 1) {
      cluster.node(A).tick();
      const inbox = cluster.replica(B).inbox;
      const idx = inbox.findIndex((item) =>
        item.message.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT);
      if (idx !== -1) heartbeat = inbox.splice(idx, 1)[0];
    }
    assert.ok(heartbeat, 'setup: captured heartbeat envelope');
    for (const clock of clocks.values()) clock.advance(0);
    return {
      cluster,
      clockB: clocks.get(B),
      heartbeat,
      heldB,
      setHold: (next) => {
        holdB = next;
      },
    };
  };

  const ctx = setupBoundedDrainCluster();
  const peerB = ctx.cluster.raftPeerIdOf(B);
  let bCoreSteps = 0;
  let trapStep = false;
  const drainTurns = [];
  const origSetTimeout = ctx.clockB.setTimeout.bind(ctx.clockB);
  ctx.clockB.setTimeout = (fn, ms, ...args) => origSetTimeout((...cbArgs) => {
    const startSteps = bCoreSteps;
    try {
      return fn(...cbArgs);
    } finally {
      if (ms === 0) {
        drainTurns.push(bCoreSteps - startSteps);
      }
    }
  }, ms, ...args);
  setCoreFaultInjector((groupId, operation, args) => {
    if (groupId !== ctx.cluster.partitionId || operation !== 'step') return;
    if (args[0]?.to === peerB) {
      bCoreSteps += 1;
    }
    if (trapStep) {
      throw new globalThis.WebAssembly.RuntimeError('drain-step-trap');
    }
  });
  try {
    ctx.setHold(true);
    const firstTurn = turnChainValue(ctx.cluster.node(B).propose({seq: 'hold-1'}));
    for (let i = 0; i < 64 && ctx.heldB.length === 0; i += 1) {
      await Promise.resolve();
    }
    assert.equal(ctx.heldB.length, 1, 'setup: B owner turn held on send');
    for (let i = 0; i < 40; i += 1) {
      ctx.cluster.node(B).step(ctx.heartbeat);
    }
    ctx.setHold(false);
    ctx.heldB.splice(0).forEach((gate) => gate.resolve());
    assert.equal((await firstTurn).outcome, RAFT_OPERATION_OUTCOME.CORE_OK);

    const beforeTurn1 = bCoreSteps;
    ctx.clockB.advance(0);
    assert.deepEqual(drainTurns, [32, 8],
      '40 queued entries drain in bounded turns of 32 and 8 via successor 0ms wake');
    assert.equal(bCoreSteps - beforeTurn1, 40,
      'all 40 queued inbound entries completed across the two bounded turns');

    // Non-CORE_OK drain must not spin a 0ms timer loop.
    drainTurns.length = 0;
    ctx.setHold(true);
    const secondTurn = turnChainValue(ctx.cluster.node(B).propose({seq: 'hold-2'}));
    for (let i = 0; i < 64 && ctx.heldB.length === 0; i += 1) {
      await Promise.resolve();
    }
    assert.equal(ctx.heldB.length, 1);
    for (let i = 0; i < 5; i += 1) {
      ctx.cluster.node(B).step(ctx.heartbeat);
    }
    ctx.setHold(false);
    ctx.heldB.splice(0).forEach((gate) => gate.resolve());
    assert.equal((await secondTurn).outcome, RAFT_OPERATION_OUTCOME.CORE_OK);

    const prevConsoleError = console.error;
    try {
      console.error = () => undefined;
      trapStep = true;
      const beforeTrap = ctx.cluster.coreEntryCount();
      ctx.clockB.advance(0);
      const afterTrap = ctx.cluster.coreEntryCount();
      assert.ok(afterTrap > beforeTrap, 'trap attempt entered core once');
      assert.deepEqual(drainTurns, [1],
        'non-CORE_OK drain executes one turn and reschedules zero successor wakes');
      ctx.clockB.advance(0);
      assert.equal(ctx.cluster.coreEntryCount(), afterTrap,
        'failed drain batch does not spin another 0ms scheduled inbound wake');
    } finally {
      console.error = prevConsoleError;
      trapStep = false;
    }
  } finally {
    setCoreFaultInjector(null);
    setActualCoreEntryObserver(null);
    ctx.cluster.dispose();
  }
});
