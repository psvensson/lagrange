// Actual raft-rs ports: an acknowledged inbound envelope owns one foreground
// clock wake, with exact original-clock cancellation on close. Never use a
// polling reader, synthetic queue or direct core-step as a liveness substitute.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {PERSISTENCE_ADMISSION_WAIT} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {setCoreFaultInjector} from
  '../../../src/raft/raft-rs-runtime-owner.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {coreTrappingAppend} from './core-trap-envelope.js';

function observedClock() {
  const clock = new VirtualTimeSource({startMs: 1000});
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

async function withAcceptedFollower(partitionId, body) {
  const replicaIds = ['timer-r1', 'timer-r2', 'timer-r3'];
  const clocks = new Map(replicaIds.map((id) => [id, observedClock()]));
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
    owned.clock.advance(0);
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
