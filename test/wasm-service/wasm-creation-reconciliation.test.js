import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WasmCreationReconciliation} from '../../src/wasm-service/wasm-creation-reconciliation.js';
import {RAFT_EVENT} from '../../src/raft/raft-operation-port-constants.js';
import {instanceDigest} from '../../src/control-plane/owners/service-instance-contract.js';
import {WASM_WRITER_PROFILE} from '../../src/wasm-service/wasm-writer-profile.js';

const QUIET = {debug() {}, info() {}, warn() {}, error() {}};

// Mechanism tests: real OwnerKeyReconcileQueue, synthetic notification source.
// No fake successful genesis or membership result is supplied.
function fixture(t) {
  const events = new EventEmitter();
  const callbacks = [];
  const port = {subscribe(event, listener) {
    callbacks.push({event, listener});
    events.on(event, listener);
    return () => events.off(event, listener);
  }};
  const replica = {replicaId: 'physical-r1', serviceDefinitionId: 'service',
    initialized: true, raft: port, consensusCreation: null};
  const lifecycle = {consensusClosing: false, activeReplicas: new Map([['service', replica]])};
  const owner = new WasmCreationReconciliation(lifecycle, replica);
  owner.queue.logger = QUIET;
  owner.bind();
  t.after(() => owner.shutdown());
  return {events, callbacks, port, replica, lifecycle, owner};
}

test('native event bursts enqueue once, do not run inline, and retain one wake during await',
  async (t) => {
    const f = fixture(t);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const run = f.owner.queue.reconcileFn;
    let calls = 0;
    let active = 0;
    let maximum = 0;
    f.owner.queue.reconcileFn = async (...args) => {
      calls += 1;
      maximum = Math.max(maximum, ++active);
      if (calls === 1) {
        entered.resolve();
        await release.promise;
      }
      try {
        return await run(...args);
      } finally {
        active -= 1;
      }
    };
    try {
      for (let i = 0; i < 1000; i++) f.events.emit(RAFT_EVENT.LEADER);
      assert.equal(calls, 0, 'NATIVE_CALLBACK_EXECUTED_RECONCILIATION_INLINE');
      assert.equal(f.owner.queue.size, 1);
      await entered.promise;
      for (let i = 0; i < 1000; i++) f.events.emit(RAFT_EVENT.APPLIED_PROGRESS);
      assert.equal(f.owner.queue.size, 1);
      const joined = f.owner.request();
      release.resolve();
      await joined;
      await f.owner.queue.awaitCurrentWorkIdle();
      assert.equal(maximum, 1);
      assert.equal(calls, 2, 'IN_FLIGHT_WAKE_WAS_LOST_OR_REPLAYED_AS_A_STORM');
      assert.equal(f.owner.queue.size, 0);
      assert.equal(f.owner.queue.retryTimers.size, 0);
    } finally {
      release.resolve();
    }
  });

test('a queued old replica wake cannot run against its replacement', async (t) => {
  const f = fixture(t);
  let reads = 0;
  f.replica.consensusCreation = {};
  f.replica.writerState = {creationBinding() {
    reads += 1; return null;
  }};
  f.owner.bind();
  f.events.emit(RAFT_EVENT.APPLIED_PROGRESS);
  f.lifecycle.activeReplicas.set('service', {...f.replica});
  await f.owner.queue.awaitCurrentWorkIdle();
  assert.equal(reads, 0, 'STALE_REPLICA_REENTERED_GENESIS');
});

test('a callback belonging to an old port cannot enqueue for a new port', async (t) => {
  const f = fixture(t);
  f.replica.raft = {...f.port};
  for (const {listener} of f.callbacks) listener({forged: 'GENESIS_OBSERVED'});
  assert.equal(f.owner.queue.size, 0);
  assert.equal(f.owner.queue.isCurrentWorkIdle(), true);
});

test('rebind retires the old event listeners instead of accumulating callbacks', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 10; i++) f.owner.bind();
  for (const event of f.events.eventNames()) assert.equal(f.events.listenerCount(event), 1);
  await f.owner.shutdown();
  assert.equal(f.events.eventNames().length, 0);
  assert.equal(f.owner.subscriptions.length, 0);
});

test('shutdown joins actual in-flight reconciliation before clearing queue custody', async (t) => {
  const f = fixture(t);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const run = f.owner.queue.reconcileFn;
  f.owner.queue.reconcileFn = async (...args) => {
    entered.resolve();
    await release.promise;
    return run(...args);
  };
  let stopped = false;
  try {
    f.events.emit(RAFT_EVENT.APPLIED_PROGRESS);
    await entered.promise;
    const pending = f.owner.shutdown().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    assert.equal(stopped, false, 'QUEUE_SHUTDOWN_WAS_MISTAKEN_FOR_A_JOIN');
    assert.equal(f.owner.queue.inFlight.size, 1);
    for (const {listener} of f.callbacks) listener();
    assert.equal(f.owner.queue.size, 0);
    release.resolve();
    await pending;
    assert.equal(f.owner.queue.stopped, true);
    assert.equal(f.owner.queue.inFlight.size, 0);
  } finally {
    release.resolve();
  }
});

test('event payloads cannot confer genesis or serving authority', async (t) => {
  const f = fixture(t);
  const results = [];
  const run = f.owner.queue.reconcileFn;
  f.owner.queue.reconcileFn = async (...args) => {
    const result = await run(...args);
    results.push(result);
    return result;
  };
  f.events.emit(RAFT_EVENT.APPLIED_PROGRESS, {outcome: 'GENESIS_OBSERVED', gateOpen: true});
  await f.owner.queue.awaitCurrentWorkIdle();
  assert.deepEqual(results, [{outcome: 'GENESIS_HELD', reason: 'WRITER_NOT_READY'}]);
});

test('a failed listener retirement preserves the failure and permits an explicit cleanup retry',
  async (t) => {
    const f = fixture(t);
    const failure = new Error('injected unsubscribe failure');
    const dispose = f.owner.subscriptions[0];
    let failing = true;
    f.owner.subscriptions[0] = () => {
      if (failing) throw failure;
      dispose();
    };
    try {
      await assert.rejects(f.owner.shutdown(), (error) => error.errors.includes(failure));
      assert.equal(f.owner.queue.stopped, true);
      assert.equal(f.owner.subscriptions.length, 1, 'FAILED_LISTENER_CUSTODY_WAS_LOST');
      assert.equal(f.events.eventNames().length, 1, 'LATER_UNSUBSCRIBERS_WERE_NOT_ATTEMPTED');
    } finally {
      failing = false;
    }
    await f.owner.shutdown();
    assert.equal(f.events.eventNames().length, 0);
    assert.equal(f.owner.subscriptions.length, 0);
  });


test('reconciliation rechecks the exact registry owner after pending writer interest settles',
  async (t) => {
    const f = fixture(t);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const binding = {serviceDefinitionId: 'service', incarnation: '1'.repeat(64),
      requestId: {nonce: '2'.repeat(64)}, profileDigest: instanceDigest(WASM_WRITER_PROFILE.id)};
    f.replica.consensusCreation = {intent: {consensusBinding: binding}};
    f.replica.isLeader = true;
    f.replica.writerState = {creationBinding: () => binding, classify: () => ({status: 'NEW'})};
    f.replica.writerCompletion = {submit: async () => {
      entered.resolve();
      await release.promise;
      return {status: 'UNKNOWN', reason: 'WRITER_DEADLINE'};
    }};
    try {
      const pending = f.owner.request();
      await entered.promise;
      f.lifecycle.activeReplicas.set('service', {...f.replica});
      release.resolve();
      assert.deepEqual(await pending, {outcome: 'GENESIS_HELD', reason: 'WRITER_SHUTDOWN'},
        'STALE_RECONCILE_RESULT_ESCAPED_AFTER_AWAIT');
    } finally {
      release.resolve();
    }
  });
