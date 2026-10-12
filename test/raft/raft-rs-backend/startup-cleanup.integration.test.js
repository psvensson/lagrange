// Real native constructor refusals plus faults at actual SQLite close calls.
// Supplemental release tests explicitly substitute the async close boundary;
// they are not a claim that raft-rs itself returned that injected rejection.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {createFixture, buildService, assertInitializationRefusal, KINDS} from './startup-cleanup-native-fixture.js';
import {setCoreFaultInjector} from '../../../src/raft/raft-rs-runtime-owner.js';
import {RAFT_OPERATION_OUTCOME as OUTCOME} from '../../../src/raft/raft-operation-port-constants.js';
import {closeMessageGroupConsensus} from '../../../src/message-group/message-group-consensus-port.js';
import {releaseWasmServiceReplicaConsensus} from '../../../src/wasm-service/wasm-service-replica-lifecycle.js';
import {WASM_SERVICE_LIFECYCLE_REFUSAL, WASM_SERVICE_REPLICA_STATE as STATE} from '../../../src/wasm-service/wasm-service-constants.js';

function assertBoth(kind, failure, secondary, service, shared) {
  assertInitializationRefusal(kind, failure, service.replicaId, shared);
  assert.ok(failure instanceof AggregateError, 'both failure objects are retained');
  assert.equal(failure.errors[0], failure.cause, 'cause is the unchanged primary startup refusal');
  assert.equal(failure.errors[1], secondary,
    'secondary failure is retained without string conversion');
  assert.equal(failure.consensus, failure.cause.consensus,
    'the original immutable owner answer is not rebuilt');
}

for (const kind of KINDS) {
  for (const afterClose of [false, true]) {
    for (const backoff of [false, true]) {
      test(`startup cleanup: ${kind} ${backoff ? 'backoff' : 'unhealthy'} DB failure ${afterClose ? 'after' : 'before'} close preserves both errors and permits owned cleanup retry`, async (t) => {
        const fixture = await createFixture(t);
        await fixture.trap();
        let shared = null;
        if (backoff) {
          let trapped = 0;
          setCoreFaultInjector((_group, operation) => {
            if (operation === 'create_node') {
              setCoreFaultInjector(null); trapped++;
              throw new globalThis.WebAssembly.RuntimeError('cleanup witness replacement trap');
            }
          });
          shared = await fixture.port.readStatus();
          assert.equal(trapped, 1); assert.equal(shared.outcome, OUTCOME.HOST_FAILURE);
          assert.ok(shared.retryAfterMs > 0);
        }
        const service = buildService(fixture, kind);
        const close = Database.prototype.close;
        const secondary = Object.assign(new Error('injected SQLite close fault'), {code: 'SQLITE_IOERR'});
        let ownedDb; let attempts = 0; let fail = true;
        Database.prototype.close = function(...args) {
          if (this.name === service.dbPath && fail) {
            ownedDb = this; attempts++;
            if (!fixture.databases.includes(this)) fixture.databases.push(this);
            if (afterClose) close.apply(this, args);
            throw secondary;
          }
          return close.apply(this, args);
        };
        try {
          const entries = fixture.entries.length;
          let failure;
          try {
            await service.initialize();
          } catch (error) {
            failure = error;
          }
          assert.equal(attempts, 1, 'fault must occur at the real owned SQLite connection');
          assertBoth(kind, failure, secondary, service, shared);
          assert.equal(service.db, ownedDb,
            'the cleanup owner retains the exact unreleased/uncertain handle');
          assert.equal(ownedDb.open, !afterClose);
          assert.equal(fixture.entries.length, entries,
            'refused startup enters no native primitive');
          await assert.rejects(service.initialize(),
            (error) => error.consensus === failure.consensus,
            'same instance cannot reopen or overwrite its cleanup debt');
          assert.equal(service.db, ownedDb);
          assert.equal(attempts, 1, 'another initialize is not an unowned cleanup retry');
          fail = false;
          await service.shutdown();
          assert.equal(ownedDb.open, false, 'the same lifecycle shutdown settles retained cleanup');
          assert.equal(service.db, null);
          if (kind === 'wasm-service') assert.equal(service.lifecycleState, STATE.STOPPED);
          if (shared) fixture.clock.advance(shared.retryAfterMs);
          assert.equal((await fixture.port.readStatus()).outcome, OUTCOME.CORE_OK);
          const successor = buildService(fixture, kind);
          await successor.initialize();
          assert.equal(successor.raft.readStatus().outcome, OUTCOME.CORE_OK);
          assert.ok(successor.db.open, 'ordinary successor opens on the same file after complete cleanup');
          await service.shutdown();
          assert.ok(successor.db.open, 'repeated predecessor shutdown never releases the successor');
        } finally {
          fail = false; Database.prototype.close = close;
        }
      });
    }
  }
}

for (const kind of ['message-group', 'wasm-service']) {
  test(`release boundary: ${kind} concurrent async close rejection retains exact port and database for retry`, async () => {
    const db = new Database(':memory:');
    const failure = new Error('controlled async close rejection');
    let reject; let calls = 0; let failing = true;
    const pending = new Promise((_resolve, fail) => {
      reject = fail;
    });
    const port = {stopScheduling() {}, close() {
      calls++; return failing ? pending : {outcome: OUTCOME.CORE_OK};
    }};
    const owner = {raft: port, db, kvStore: null};
    const release = kind === 'message-group' ? closeMessageGroupConsensus : releaseWasmServiceReplicaConsensus;
    try {
      const first = release(owner); const second = release(owner);
      const outcomes = Promise.allSettled([first, second]);
      await Promise.resolve();
      assert.equal(owner.raft, port, 'a pending release retains its exact reference');
      assert.equal(db.open, true, 'a live port keeps its database');
      reject(failure);
      assert.deepEqual((await outcomes).map((r) => r.reason), [failure, failure]);
      assert.equal(calls, 1, 'overlapping callers join the existing owner settlement');
      assert.equal(owner.raft, port); assert.equal(owner.db, db);
      failing = false;
      await release(owner);
      assert.equal(calls, 2); assert.equal(owner.raft, null); assert.equal(owner.db, null);
      assert.equal(db.open, false);
      await release(owner); assert.equal(calls, 2);
    } finally {
      failing = false; reject(failure); if (db.open) db.close();
    }
  });
}

test('release boundary: WASM borrowed KV failure keeps its database and already-released port stays released', async () => {
  const db = new Database(':memory:'); let closes = 0; let fail = true;
  const failure = new Error('controlled KV close failure');
  const kv = {close() {
    if (fail) throw failure;
  }};
  const owner = {db, kvStore: kv, raft: {stopScheduling() {}, close() {
    closes++; return {outcome: OUTCOME.CORE_OK};
  }}};
  try {
    await assert.rejects(releaseWasmServiceReplicaConsensus(owner), (error) => error === failure);
    assert.equal(owner.kvStore, kv);
    assert.equal(owner.db, db);
    assert.equal(db.open, true,
      'borrowed connection must outlive failed KV release');
    assert.equal(owner.raft, null); assert.equal(closes, 1);
    fail = false; await releaseWasmServiceReplicaConsensus(owner);
    assert.equal(closes, 1); assert.equal(owner.kvStore, null); assert.equal(db.open, false);
  } finally {
    if (db.open) db.close();
  }
});

for (const kind of KINDS) {
  test(`native shutdown: ${kind} failed DB release is not terminal and repeated shutdown retries only owned resources`, async (t) => {
    const fixture = await createFixture(t); const service = buildService(fixture, kind);
    await service.initialize(); const db = service.db;
    const close = Database.prototype.close;
    const failure = new Error('shutdown close failure');
    let fail = true;
    Database.prototype.close = function(...args) {
      if (this === db && fail) throw failure;
      return close.apply(this, args);
    };
    fixture.databases.push(db);
    try {
      await assert.rejects(service.shutdown(), (error) => error === failure);
      assert.equal(service.db, db, 'failed release remains owned'); assert.equal(db.open, true);
      if (kind === 'wasm-service') assert.notEqual(service.lifecycleState, STATE.STOPPED);
      else {
        assert.equal(service.initialized, false,
          'teardown closes service admission before fallible cleanup');
      }
      fail = false; await service.shutdown();
      assert.equal(db.open, false); assert.equal(service.db, null);
    } finally {
      fail = false; Database.prototype.close = close;
    }
  });
}

for (const throwRetirement of [false, true]) {
  test(`WASM shutdown retains exact handler on ${throwRetirement ? 'throwing' : 'unverifiable'} retirement and never removes a successor`, async (t) => {
    const fixture = await createFixture(t); const service = buildService(fixture, 'wasm-service');
    await service.initialize(); const original = service.transport;
    const handler = service.transportHandler; const db = service.db;
    const fault = new Error('injected exact-handler retirement failure');
    service.transport = throwRetirement ? {
      getRegisteredHandler: original.getRegisteredHandler.bind(original),
      unregisterExact() {
        throw fault;
      },
    } : {};
    try {
      await assert.rejects(service.shutdown());
      assert.equal(service.transportHandler, handler,
        'failed retirement retains the exact handler');
      assert.notEqual(service.lifecycleState, STATE.STOPPED);
      assert.equal(original.getRegisteredHandler(service.unifiedAddress), handler);
      assert.equal(service.db, db); assert.equal(db.open, true);
      const successor = async () => ({handled: 'successor'});
      original.register(service.unifiedAddress, successor);
      service.transport = original;
      await service.shutdown();
      assert.equal(service.lifecycleState, STATE.STOPPED); assert.equal(db.open, false);
      assert.equal(original.getRegisteredHandler(service.unifiedAddress), successor,
        'retry retires only its exact handler, never a successor at the same address');
      original.unregisterExact(service.unifiedAddress, successor);
    } finally {
      service.transport = original;
    }
  });
}

test('WASM shutdown observes activity and DB cleanup failures together, remains nonterminal and joins concurrent callers', async (t) => {
  const fixture = await createFixture(t); const service = buildService(fixture, 'wasm-service');
  await service.initialize(); const db = service.db;
  const stop = service.timerManager.stopAll; const close = Database.prototype.close;
  const activity = new Error('injected timer stop error');
  const storage = new Error('injected close error');
  let stops = 0; let failing = true;
  service.timerManager.stopAll = () => {
    stops++; if (failing) throw activity; return stop.call(service.timerManager);
  };
  Database.prototype.close = function(...args) {
    if (this === db && failing) throw storage;
    return close.apply(this, args);
  };
  try {
    const results = await Promise.allSettled([service.shutdown(), service.shutdown()]);
    assert.equal(stops, 1, 'concurrent shutdowns share the original activity stop and retirement');
    for (const result of results) {
      assert.equal(result.status, 'rejected'); assert.ok(result.reason instanceof AggregateError);
      assert.deepEqual(result.reason.errors, [activity, storage]);
    }
    assert.equal(results[0].reason, results[1].reason);
    assert.notEqual(service.lifecycleState, STATE.STOPPED);
    assert.equal(service.db, db); assert.equal(db.open, true);
    failing = false; await service.shutdown();
    assert.equal(stops, 2);
    assert.equal(db.open, false);
    assert.equal(service.lifecycleState,
      STATE.STOPPED);
  } finally {
    failing = false; service.timerManager.stopAll = stop; Database.prototype.close = close;
  }
});

test('WASM shutdown racing rejected initialization owns the cleanup retry, not a false STOPPED transition', async (t) => {
  const fixture = await createFixture(t); const service = buildService(fixture, 'wasm-service');
  await fixture.trap();
  const close = Database.prototype.close; let attempts = 0; let ownedDb;
  const secondary = new Error('first startup release failure');
  Database.prototype.close = function(...args) {
    if (this.name === service.dbPath && attempts++ === 0) {
      ownedDb = this; throw secondary;
    }
    return close.apply(this, args);
  };
  try {
    const starting = service.initialize();
    const stopping = service.shutdown();
    const results = await Promise.allSettled([starting, stopping]);
    assert.equal(results[0].status, 'rejected');
    assertBoth('wasm-service', results[0].reason, secondary, service, null);
    assert.equal(results[1].status, 'fulfilled',
      'shutdown retries the failed opening cleanup after it settles');
    assert.equal(ownedDb.open, false); assert.equal(service.lifecycleState, STATE.STOPPED);
  } finally {
    Database.prototype.close = close;
  }
});

test('partition shutdown awaits a pending port close and retains DB/port on rejection until the same shutdown owner retries', async (t) => {
  const fixture = await createFixture(t); const service = buildService(fixture, 'partition');
  await service.initialize(); const original = service.raft; const db = service.db;
  const failure = new Error('controlled partition async close'); let reject; let calls = 0;
  const pending = new Promise((_resolve, failed) => {
    reject = failed;
  }); let fail = true;
  // The baseline discards this returned promise. Observe it in the fixture so
  // the behavioral assertion, not an unhandled test rejection, discriminates.
  pending.catch(() => undefined);
  const controlled = {...original, close() {
    calls++; return fail ? pending : original.close();
  }};
  service.raft = controlled;
  try {
    const outcomes = Promise.allSettled([service.shutdown(), service.shutdown()]);
    await Promise.resolve();
    assert.equal(service.raft, controlled); assert.equal(db.open, true);
    reject(failure);
    assert.deepEqual((await outcomes).map((r) => r.reason), [failure, failure]);
    assert.equal(calls, 1); assert.equal(service.raft, controlled); assert.equal(service.db, db);
    fail = false; await service.shutdown();
    assert.equal(calls, 2); assert.equal(service.raft, null); assert.equal(db.open, false);
  } finally {
    fail = false; reject(failure);
    // The baseline may already have discarded this still-live native handle.
    // Release the captured fixture after assertions, never as product success.
    await original.close();
  }
});

// Explicit constructor-boundary controls: these throws are ordinary host code,
// not injected native faults. Successful cleanup must preserve the original
// Error identity; failed cleanup must retain it without a fake consensus result.
for (const kind of ['partition', 'message-group']) {
  for (const failCleanup of [false, true]) {
    test(`ordinary ${kind} constructor error ${failCleanup ? 'and cleanup error are both retained' : 'is not reclassified'}`, async (t) => {
      const fixture = await createFixture(t); const service = buildService(fixture, kind);
      const primary = Object.assign(new Error('ordinary constructor error'), {code: 'HOST_CONSTRUCTOR_ERROR'});
      const secondary = new Error('ordinary cleanup error');
      const originalCreate = service.createOperationPort;
      service.createOperationPort = () => {
        throw primary;
      };
      const close = Database.prototype.close; let failing = failCleanup; let owned;
      Database.prototype.close = function(...args) {
        if (this.name === service.dbPath && failing) {
          owned = this; fixture.databases.push(this); throw secondary;
        }
        return close.apply(this, args);
      };
      try {
        let failure; try {
          await service.initialize();
        } catch (error) {
          failure = error;
        }
        if (failCleanup) {
          assert.ok(failure instanceof AggregateError); assert.equal(failure.cause, primary);
          assert.deepEqual(failure.errors, [primary, secondary]); assert.equal(service.db, owned);
          failing = false; await service.shutdown(); assert.equal(owned.open, false);
        } else {
          assert.equal(failure, primary, 'ordinary constructor error identity is unchanged');
          assert.equal(service.db, null, 'ordinary failure also releases acquired resources');
        }
        assert.equal(failure.consensus, undefined,
          'ordinary host failure is not relabeled as consensus');
      } finally {
        failing = false;
        Database.prototype.close = close;
        service.createOperationPort = originalCreate;
      }
    });
  }
}

test('WASM hosting lifecycle retains a cleanup-required replica rather than overwriting its only resource owner', async (t) => {
  const {WasmServiceLifecycle} = await import('../../../src/wasm-service/wasm-service-lifecycle.js');
  const fixture = await createFixture(t);
  const path = await import('node:path');
  const owner = new WasmServiceLifecycle({messageRouter: fixture.router, nodeId: 'opening-refusal-node',
    dataDirectoryManager: {getWasmServiceDbPath: () => path.join(fixture.directory, 'managed.db'), ensureWasmServiceDirExists() {}}});
  const definition = {serviceId: 'managed-service'};
  const config = {replicaId: 'managed-r1', replicaIds: ['managed-r1']};
  const service = owner.createReplica(definition, config); fixture.services.push(service);
  await fixture.trap();
  const close = Database.prototype.close; let fail = true; let db;
  Database.prototype.close = function(...args) {
    if (this.name === service.dbPath && fail) {
      db = this; if (!fixture.databases.includes(this)) fixture.databases.push(this);
      throw new Error('managed release failure');
    }
    return close.apply(this, args);
  };
  try {
    await assert.rejects(service.initialize());
    assert.throws(() => owner.createReplica(definition, config),
      (error) => error.code === WASM_SERVICE_LIFECYCLE_REFUSAL.REPLICA_LIVE,
      'a failed cleanup is not permission to overwrite the managed replica');
    assert.equal(owner.getReplica(definition.serviceId), service);
    fail = false; await owner.stopReplica(definition.serviceId);
    assert.equal(db.open, false); assert.equal(owner.getReplica(definition.serviceId), null);
    assert.equal((await fixture.port.readStatus()).outcome, OUTCOME.CORE_OK);
    const successor = owner.createReplica(definition, config); fixture.services.push(successor);
    await successor.initialize(); assert.equal(successor.initialized, true);
  } finally {
    fail = false; Database.prototype.close = close;
  }
});

for (const kind of ['partition', 'message-group']) {
  test(`native ${kind} initialization cannot replace resources during its pending shutdown`, async (t) => {
    const fixture = await createFixture(t); const service = buildService(fixture, kind);
    await service.initialize(); const port = service.raft; const db = service.db;
    let resolve; const pending = new Promise((done) => {
      resolve = done;
    });
    const controlled = {...port, close: () => pending.then(() => port.close())};
    service.raft = controlled;
    const stopping = service.shutdown();
    try {
      const before = fixture.entries.length;
      await assert.rejects(service.initialize(),
        (error) => error.code === (kind === 'partition' ? 'partition_service_shutdown' : 'message_group_service_shutdown'));
      assert.equal(service.raft, controlled); assert.equal(service.db, db);
      assert.equal(fixture.entries.length, before,
        'the closed service admission makes no native opening');
    } finally {
      resolve(); await stopping;
    }
  });
}
