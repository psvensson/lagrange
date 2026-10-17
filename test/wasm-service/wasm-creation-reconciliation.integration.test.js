import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture, bootstrapGroup, initialization, deliverScheduled} from
  './wasm-retained-bootstrap-fixture.js';
import {WASM_WRITER_PROFILE} from '../../src/wasm-service/wasm-writer-profile.js';

// Passive interception of the existing queue result, never a completion source.
function watchReconciliation(f) {
  const records = [];
  const seen = new WeakSet();
  const addHost = f.addHost;
  f.addHost = async (slot) => {
    const host = await addHost(slot);
    const create = host.lifecycle.createReplica.bind(host.lifecycle);
    host.lifecycle.createReplica = (...args) => {
      const replica = create(...args);
      const queue = replica.creationReconciliation?.queue;
      if (queue && !seen.has(queue)) {
        seen.add(queue);
        const run = queue.reconcileFn;
        queue.reconcileFn = async (...input) => {
          const result = await run(...input);
          records.push({replica, result});
          return result;
        };
      }
      return replica;
    };
    return host;
  };
  return records;
}

function assertNoServing(f) {
  for (const host of f.hosts) {
    assert.deepEqual(host.publications, []);
    assert.equal(host.replica.heldCreationRefusal().reason, 'WRITER_NOT_READY');
    assert.equal(host.replica.pendingLeaderNodeUpdate, null);
    assert.equal(host.replica.timerManager.activeTimers.size, 0);
  }
}

// Native events must make progress after the one original pre-election START.
// No second START, manual INIT, status-as-progress call or extra tick follows formation.
test('native leadership and applied progress autonomously reconcile the original held creation',
  async (t) => {
    const f = await fixture(t, {automaticReconciliation: true});
    const records = watchReconciliation(f);
    await bootstrapGroup(f);
    await deliverScheduled(f);
    const expected = initialization(f.metadata.intent.consensusBinding);
    for (const host of f.hosts) {
      assert.deepEqual(host.replica.writerState.meta().initialization?.command, expected,
        'NATIVE_EVENTS_DID_NOT_RECONCILE_ORIGINAL_CREATION');
      assert.ok(records.some((entry) => entry.replica === host.replica &&
        entry.result.outcome === 'GENESIS_OBSERVED'),
      'APPLIED_EVENT_DID_NOT_RECONCILE_COVERING_MEMBERSHIP');
      assert.equal(host.result.status, 'BOOTSTRAPPED_HELD');
      assert.deepEqual(host.publications, []);
      assert.equal(host.replica.heldCreationRefusal().reason, 'WRITER_NOT_READY');
    }
    assert.equal(f.metadata.db.prepare('SELECT count(*) n FROM wasm_operations').get().n, 3);
    assert.ok(f.metadata.state().selected.resources.every((slot) =>
      slot.phase === 'ADMITTED' || slot.phase === 'CLOSED'));
  });


test('native applied wake survives an in-flight no-quorum INIT and resolves after replies return',
  async (t) => {
    // Only setup notifications are delayed, so we can install the genuine
    // transport fault before INIT. Then all event delivery is automatic.
    const f = await fixture(t);
    const records = watchReconciliation(f);
    await bootstrapGroup(f);
    f.holdResponses = true;
    for (const host of f.hosts) host.resumeReconciliation();
    await deliverScheduled(f);
    assert.ok(f.held.length > 0, 'NO_NATIVE_REPLIES_WITHHELD');
    assert.equal(f.leader.writerState.meta().initialization, null);
    assert.equal(f.leader.writerCompletion.pending.size, 1);
    assert.equal(records.some((entry) => entry.result.outcome === 'GENESIS_OBSERVED'), false);
    f.holdResponses = false;
    f.queue.push(...f.held.splice(0));
    await deliverScheduled(f);
    for (const host of f.hosts) {
      assert.ok(records.some((entry) => entry.replica === host.replica &&
        entry.result.outcome === 'GENESIS_OBSERVED'), 'IN_FLIGHT_APPLIED_WAKE_WAS_LOST');
      assert.equal(host.replica.creationReconciliation.queue.size, 0);
    }
    assert.deepEqual(f.leader.writerState.meta().initialization.command,
      initialization(f.metadata.intent.consensusBinding));
    assertNoServing(f);
  });

test('an expired writer interest resumes from actual applied progress, not a poll or new intent',
  async (t) => {
    const f = await fixture(t);
    const records = watchReconciliation(f);
    await bootstrapGroup(f);
    f.holdResponses = true;
    for (const host of f.hosts) host.resumeReconciliation();
    await deliverScheduled(f);
    assert.ok(f.held.length > 0);
    f.clocks[0].advance(WASM_WRITER_PROFILE.interestMs);
    await deliverScheduled(f);
    assert.ok(records.some((entry) => entry.result.outcome === 'UNKNOWN'));
    assert.equal(f.leader.writerState.meta().initialization, null);
    f.holdResponses = false;
    f.queue.push(...f.held.splice(0));
    await deliverScheduled(f);
    assert.ok(records.some((entry) => entry.replica === f.leader &&
      entry.result.outcome === 'GENESIS_OBSERVED'), 'APPLIED_PROGRESS_DID_NOT_RESUME_UNKNOWN');
    assert.equal(f.metadata.state().selected.resources[0].ordinal, 1);
    assert.equal(f.metadata.db.prepare('SELECT count(*) n FROM wasm_operations').get().n, 3);
    assertNoServing(f);
  });

test('shutdown aborts event-owned INIT, joins the queue, and leaves no native handle or late success',
  async (t) => {
    const f = await fixture(t);
    const records = watchReconciliation(f);
    await bootstrapGroup(f);
    f.holdResponses = true;
    for (const host of f.hosts) host.resumeReconciliation();
    await deliverScheduled(f);
    const replica = f.leader;
    const queue = replica.creationReconciliation.queue;
    assert.equal(replica.writerCompletion.pending.size, 1);
    assert.equal(queue.inFlight.size, 1);
    const boundary = records.length;
    await f.hosts[0].runtime.shutdown();
    assert.equal(queue.stopped, true);
    assert.equal(queue.inFlight.size, 0);
    assert.equal(queue.size, 0);
    assert.equal(replica.writerCompletion.pending.size, 0);
    assert.equal(replica.creationReconciliation.subscriptions.length, 0);
    assert.equal(replica.db, null);
    assert.equal(replica.raft, null);
    assert.equal(replica.transportHandler, null);
    assert.equal(records.slice(boundary).some((entry) => entry.replica === replica &&
      entry.result.outcome === 'GENESIS_OBSERVED'), false);
    assertNoServing(f);
  });
