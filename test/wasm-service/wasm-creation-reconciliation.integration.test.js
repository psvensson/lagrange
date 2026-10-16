import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RAFT_EVENT} from '../../src/raft/raft-operation-port-constants.js';
import {WASM_WRITER_PROFILE} from '../../src/wasm-service/wasm-writer-profile.js';
import {fixture, bootstrapGroup, deliverScheduled, initialization} from
  './wasm-retained-bootstrap-fixture.js';

// Observe actual lifecycle calls, without driving them or synthesizing replies.
async function observedFixture(t, options = {}) {
  const f = await fixture(t, options);
  f.starts = [];
  const addHost = f.addHost;
  f.addHost = async (slot) => {
    const host = await addHost(slot);
    const start = host.lifecycle.startReplica.bind(host.lifecycle);
    host.startCalls = 0;
    host.lifecycle.startReplica = async (...args) => {
      host.startCalls += 1;
      const result = await start(...args);
      f.starts.push({host, result});
      if (f.afterStart) await f.afterStart(host, result);
      return result;
    };
    if (options.captureNativeCallbacks) captureNativeCallbacks(host);
    return host;
  };
  return f;
}
function assertServingHeld(f) {
  for (const host of f.hosts) {
    assert.equal(host.result.status, 'BOOTSTRAPPED_HELD');
    assert.deepEqual(host.publications, []);
    assert.equal(host.replica.timerManager.activeTimers.size, 0);
  }
}

test('native leadership and applied progress finish bound genesis without caller reentry',
  async (t) => {
    const f = await observedFixture(t);
    await bootstrapGroup(f);
    await deliverScheduled(f);
    const command = initialization(f.metadata.intent.consensusBinding);
    for (const host of f.hosts) {
      assert.deepEqual(host.replica.writerState.meta().initialization?.command, command,
        'NATIVE_EVENT_DID_NOT_REENTER_CREATION');
      const observed = f.starts.filter((item) => item.host === host &&
        item.result?.genesis?.outcome === 'GENESIS_OBSERVED');
      assert.ok(observed.length > 0, 'APPLIED_PROGRESS_DID_NOT_RECONCILE_FOLLOWER');
      assert.equal(f.metadata.state().selected.resources[
        host.intent.consensusSlotRequest.slot].ordinal, 1);
    }
    assertServingHeld(f);
    const calls = f.starts.length;
    await deliverScheduled(f);
    assert.equal(f.starts.length, calls, 'RECONCILIATION_SELF_REARMED_WITHOUT_AN_EVENT');
  });

// Native port methods/results remain real. Only subscribe is passively wrapped
// to retain callbacks for delayed-delivery and replaced-producer faults.
function captureNativeCallbacks(host) {
  const create = host.lifecycle.createReplica.bind(host.lifecycle);
  const seen = new WeakSet();
  host.lifecycle.createReplica = (...args) => {
    const replica = create(...args);
    if (seen.has(replica)) return replica;
    seen.add(replica);
    const initialize = replica.initialize.bind(replica);
    let wrapped = null;
    replica.initialize = async () => {
      await initialize();
      if (replica.raft === wrapped) return;
      const port = replica.raft;
      host.nativeCallbacks = [];
      wrapped = {...port,
        readCommittedMembership: (...args) => typeof host.membershipRead === 'function' ?
          host.membershipRead(...args) : port.readCommittedMembership(...args),
        subscribe: (event, callback) => {
          host.nativeCallbacks.push({event, callback});
          return port.subscribe(event, callback);
        }};
      replica.raft = wrapped;
    };
    return replica;
  };
}
async function releaseScheduledReconciliation(f) {
  // A fixed schedule, not a success-dependent retry. Work is already queued by
  // actual native events, and the fixture only releases its delivery custody.
  for (let pass = 0; pass < 4; pass += 1) {
    for (const host of f.hosts) {
      for (const drain of host.reconciliationDrains.splice(0)) drain();
    }
    await deliverScheduled(f);
  }
}
function replayWake(host, event = RAFT_EVENT.APPLIED_PROGRESS) {
  const registration = host.nativeCallbacks.find((item) => item.event === event);
  assert.ok(registration, 'NATIVE_PROGRESS_LISTENER_NOT_REGISTERED');
  registration.callback({outcome: 'GENESIS_OBSERVED', gateOpen: true});
}

test('native event bursts coalesce and a wake during a running reconciliation is not lost',
  async (t) => {
    const f = await observedFixture(t,
      {holdCreationReconciliation: true, captureNativeCallbacks: true});
    await bootstrapGroup(f);
    const host = f.hosts[0];
    const queue = host.lifecycle.creationReconcileQueue;
    const before = host.startCalls;
    for (let count = 0; count < 1000; count += 1) replayWake(host);
    assert.equal(host.startCalls, before, 'EVENT_CALLBACK_EXECUTED_PROGRESSION_INLINE');
    assert.equal(queue.size, 1, 'EVENT_BURST_ALLOCATED_MULTIPLE_OWNER_ITEMS');
    const hold = Promise.withResolvers();
    let held = false;
    f.afterStart = async (current) => {
      if (current === host && !held) {
        held = true;
        await hold.promise;
      }
    };
    try {
      await releaseScheduledReconciliation(f);
      assert.equal(held, true, 'RECONCILIATION_WAS_NOT_IN_FLIGHT');
      assert.equal(queue.isInFlight(host.replica.replicaId), true);
      for (let count = 0; count < 1000; count += 1) replayWake(host);
      assert.equal(queue.size, 1);
      assert.equal(host.startCalls, before + 1, 'OVERLAPPING_RECONCILIATION');
      hold.resolve();
      await releaseScheduledReconciliation(f);
      assert.equal(host.startCalls, before + 2, 'IN_FLIGHT_WAKE_WAS_LOST_OR_DUPLICATED');
      assert.ok(f.starts.some((item) => item.host === host &&
        item.result?.genesis?.outcome === 'GENESIS_OBSERVED'));
      assert.equal(queue.size, 0);
      assert.equal(queue.isInFlight(host.replica.replicaId), false);
      assertServingHeld(f);
    } finally {
      hold.resolve();
      f.afterStart = null;
    }
  });

test('lost quorum settles UNKNOWN without retrying and actual applied progress resumes the same INIT',
  async (t) => {
    const f = await observedFixture(t, {holdCreationReconciliation: true});
    await bootstrapGroup(f);
    f.holdResponses = true;
    await releaseScheduledReconciliation(f);
    assert.ok(f.held.length > 0, 'NO_NATIVE_REPLIES_WITHHELD');
    const host = f.hosts[0];
    assert.equal(host.lifecycle.creationReconcileQueue.isInFlight(host.replica.replicaId), true);
    assert.equal(f.leader.writerState.meta().initialization, null);
    f.clocks[0].advance(WASM_WRITER_PROFILE.interestMs);
    await releaseScheduledReconciliation(f);
    assert.ok(f.starts.some((item) => item.host === host &&
      item.result?.genesis?.outcome === 'UNKNOWN'));
    const calls = host.startCalls;
    await releaseScheduledReconciliation(f);
    assert.equal(host.startCalls, calls, 'UNKNOWN_SELF_RETRIED_WITHOUT_AN_EVENT');
    f.holdResponses = false;
    f.queue.push(...f.held.splice(0));
    await releaseScheduledReconciliation(f);
    assert.ok(f.starts.some((item) => item.host === host &&
      item.result?.genesis?.outcome === 'GENESIS_OBSERVED'));
    assert.equal(f.metadata.state().selected.resources[0].ordinal, 1);
    assertServingHeld(f);
  });

test('shutdown discards queued wakes and old callbacks cannot touch a retained successor',
  async (t) => {
    const f = await observedFixture(t,
      {holdCreationReconciliation: true, captureNativeCallbacks: true});
    await bootstrapGroup(f);
    const host = f.hosts[0];
    const old = host.replica;
    const oldCallbacks = [...host.nativeCallbacks];
    const calls = host.startCalls;
    await host.lifecycle.stopReplica(f.metadata.serviceId);
    for (const item of oldCallbacks) item.callback();
    await releaseScheduledReconciliation(f);
    assert.equal(host.startCalls, calls, 'STOPPED_EVENT_REENTERED_CREATION');
    assert.equal(old.raft, null);
    assert.equal(old.db, null);
    const reopening = f.bootstrap(host);
    await releaseScheduledReconciliation(f);
    const result = await reopening;
    assert.equal(result.status, 'BOOTSTRAPPED_HELD');
    assert.notEqual(host.replica, old);
    const successorCalls = host.startCalls;
    for (const item of oldCallbacks) item.callback();
    await old.shutdown();
    await releaseScheduledReconciliation(f);
    assert.equal(host.startCalls, successorCalls, 'OLD_CALLBACK_RETARGETED_SUCCESSOR');
    assert.equal(host.lifecycle.getReplica(f.metadata.serviceId), host.replica);
    assertServingHeld(f);
  });

test('runtime shutdown aborts an event-owned writer wait and joins it before releasing custody',
  async (t) => {
    const f = await observedFixture(t, {holdCreationReconciliation: true});
    await bootstrapGroup(f);
    f.holdResponses = true;
    await releaseScheduledReconciliation(f);
    const host = f.hosts[0];
    assert.equal(host.replica.writerCompletion.pending.size, 1);
    const flight = host.replica.consensusReconciliation.flight;
    assert.ok(flight, 'NO_EVENT_RECONCILIATION_TO_JOIN');
    let settled = false;
    flight.then(() => {
      settled = true;
    });
    await host.runtime.shutdown();
    assert.equal(settled, true, 'SHUTDOWN_DID_NOT_JOIN_EVENT_RECONCILIATION');
    assert.equal(host.replica.raft, null);
    assert.equal(host.replica.db, null);
    assert.equal(host.replica.writerCompletion.pending.size, 0);
    const calls = host.startCalls;
    f.holdResponses = false;
    // Delivery to the actually retired transport handler is refused, not a
    // successful native step. Do not make the fixture swallow that refusal.
    for (const item of f.held.splice(0)) {
      await assert.rejects(async () => Reflect.apply(f.deliver, f.transport,
        [item.address, item.envelope, ...item.options]), /No handler registered/);
    }
    await releaseScheduledReconciliation(f);
    assert.equal(host.startCalls, calls, 'LATE_APPLY_REVIVED_RETIRED_CREATION');
    assertServingHeld(f);
  });


test('shutdown remains pending until the actual event continuation has settled', async (t) => {
  const f = await observedFixture(t, {holdCreationReconciliation: true});
  await bootstrapGroup(f);
  const host = f.hosts[0];
  const hold = Promise.withResolvers();
  let held = false;
  f.afterStart = async (current) => {
    if (current === host && !held) {
      held = true;
      await hold.promise;
    }
  };
  let stopping;
  try {
    await releaseScheduledReconciliation(f);
    assert.equal(held, true);
    let stopped = false;
    stopping = host.runtime.shutdown().then(() => {
      stopped = true;
    });
    await releaseScheduledReconciliation(f);
    assert.equal(host.replica.db, null, 'NATIVE_CLOSE_WAS_NOT_ENGAGED');
    assert.equal(stopped, false, 'SHUTDOWN_DECLARED_CLOSURE_BEFORE_RECONCILIATION_SETTLED');
    hold.resolve();
    await stopping;
    assert.equal(stopped, true);
    assertServingHeld(f);
  } finally {
    hold.resolve();
    f.afterStart = null;
    if (stopping) await stopping;
  }
});

test('reentry does not multiply subscriptions and event payloads cannot replace native evidence',
  async (t) => {
    const f = await observedFixture(t,
      {holdCreationReconciliation: true, captureNativeCallbacks: true});
    await bootstrapGroup(f);
    await releaseScheduledReconciliation(f);
    const host = f.hosts[0];
    const subscriptions = host.nativeCallbacks.length;
    for (let call = 0; call < 3; call += 1) await f.bootstrap(host);
    assert.equal(host.nativeCallbacks.length, subscriptions, 'REENTRY_DUPLICATED_SUBSCRIPTIONS');
    host.membershipRead = () => ({kind: 'refused', reason: 'membership-replica-held'});
    const before = f.starts.length;
    replayWake(host);
    await releaseScheduledReconciliation(f);
    const answers = f.starts.slice(before).filter((item) => item.host === host);
    assert.equal(answers.length, 1);
    assert.deepEqual(answers[0].result.genesis,
      {outcome: 'GENESIS_HELD', reason: 'membership-replica-held'},
      'EVENT_PAYLOAD_OR_PRIOR_SUCCESS_BYPASSED_NATIVE_READ');
    assertServingHeld(f);
  });

test('a queued wake rechecks both exact registered replica and port before invoking lifecycle',
  async (t) => {
    const f = await observedFixture(t,
      {holdCreationReconciliation: true, captureNativeCallbacks: true});
    await bootstrapGroup(f);
    await releaseScheduledReconciliation(f);
    const host = f.hosts[0];
    const replica = host.replica;
    const queue = host.lifecycle.creationReconcileQueue;
    const port = replica.raft;
    const before = host.startCalls;
    try {
      replayWake(host);
      assert.equal(queue.size, 1);
      replica.raft = {...port};
      await releaseScheduledReconciliation(f);
      assert.equal(host.startCalls, before, 'REPLACED_PORT_WAKE_EXECUTED_LIFECYCLE');
      replayWake(host);
      assert.equal(queue.size, 0, 'REPLACED_PORT_CALLBACK_ENQUEUED_NEW_WORK');
      replica.raft = port;
      replayWake(host);
      assert.equal(queue.size, 1);
      host.lifecycle.activeReplicas.delete(f.metadata.serviceId);
      await releaseScheduledReconciliation(f);
      assert.equal(host.startCalls, before, 'REMOVED_REPLICA_WAKE_EXECUTED_LIFECYCLE');
      replayWake(host);
      assert.equal(queue.size, 0, 'REMOVED_REPLICA_CALLBACK_ENQUEUED_NEW_WORK');
    } finally {
      replica.raft = port;
      host.lifecycle.activeReplicas.set(f.metadata.serviceId, replica);
    }
    replayWake(host);
    await releaseScheduledReconciliation(f);
    assert.equal(host.startCalls, before + 1, 'CURRENT_PRODUCER_CANNOT_MAKE_PROGRESS');
    assertServingHeld(f);
  });

test('explicit reentry and event work share the original writer interest and one INIT proposal',
  async (t) => {
    const f = await observedFixture(t, {holdCreationReconciliation: true});
    await bootstrapGroup(f);
    const host = f.hosts[0];
    const propose = f.leader.proposeEntry.bind(f.leader);
    const commands = [];
    f.leader.proposeEntry = (command) => {
      commands.push(structuredClone(command));
      return propose(command);
    };
    // Actual election already queued the event. Caller redelivery overlaps the
    // event pass without becoming another native proposal or reservation.
    for (const drain of host.reconciliationDrains.splice(0)) drain();
    const first = f.bootstrap(host);
    const second = f.bootstrap(host);
    await releaseScheduledReconciliation(f);
    const results = await Promise.all([first, second]);
    assert.ok(results.every((result) => result.status === 'BOOTSTRAPPED_HELD'));
    assert.deepEqual(commands, [initialization(f.metadata.intent.consensusBinding)]);
    assert.ok(f.starts.some((item) => item.host === host &&
      item.result?.genesis?.outcome === 'GENESIS_OBSERVED'));
    assert.equal(f.metadata.state().selected.resources[0].ordinal, 1);
    assert.equal(host.replica.writerCompletion.pending.size, 0);
    assertServingHeld(f);
  });
