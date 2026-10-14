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
    const accepted = recipient.node.step(envelope);
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
    const first = await recipient.node.step(envelope);
    const second = await recipient.node.step(envelope);
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
    const accepted = await recipient.node.step(envelope);
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
      const accepted = recipient.node.step(envelope);
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
      const trapped = second.node('trigger-r1').tick();
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

test('a failed timer clear is typed without skipping actual native group close',
  async () => withAcceptedFollower('native-inbound-timer-clear-fault', async ({
    cluster, recipient, owned, envelope,
  }) => {
    const baseline = owned.clock.pendingTimerCount();
    assert.equal(baseline, 0);
    assert.equal((await recipient.node.step(envelope)).reason, 'inbound-enqueued');
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
