import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {RAFT_RS_RECORD_TABLES} from '../../src/raft/raft-rs-durable-store-constants.js';
import {WASM_SERVICE_REPLICA_STATE as STATE} from
  '../../src/wasm-service/wasm-service-constants.js';
import {WasmServiceReplica} from '../../src/wasm-service/wasm-service-replica.js';
import {fixture, host, open} from './wasm-admitted-bootstrap-fixture.js';

test('ordinary unbound opening cannot adopt a previously bound physical database', async (t) => {
  const f = await fixture(t);
  const h = await host(f);
  const original = await open(f, h);
  const unbound = new WasmServiceReplica({replicaId: original.replicaId,
    replicaIds: original.replicaIds, nodeId: original.nodeId,
    dbPath: original.dbPath, serviceDefinitionId: original.serviceDefinitionId,
    transport: f.transport});
  t.after(() => unbound.shutdown());
  await assert.rejects(unbound.initialize(), (error) => error.outcome === 'INVALID_LINEAGE');
  assert.equal(original.db.prepare('SELECT COUNT(*) n FROM _wasm_creation_root').get().n, 1);
  assert.equal(original.db.prepare('SELECT COUNT(*) n FROM _wasm_writer_slots').get().n, 0);
});

test('start overtaken by semantic stop never reports successful held bootstrap', async (t) => {
  const f = await fixture(t);
  const h = await host(f);
  const r = await h.lifecycle.createAdmittedReplica(h.preparation);
  const starting = h.lifecycle.startReplica(f.origin.serviceId, h.startOptions);
  const stopping = h.lifecycle.stopReplica(f.origin.serviceId);
  const started = await starting;
  await stopping;
  assert.equal(started.started, false);
  assert.notEqual(started.bootstrapped, true, 'STOPPED_INSTANCE_REPORTED_BOOTSTRAPPED');
  assert.equal(r.lifecycleState, STATE.STOPPED);
  assert.deepEqual(h.effects, []);
});

test('ordinary create cannot discard bound descriptor fields into the unbound path', async (t) => {
  const f = await fixture(t);
  const h = await host(f);
  assert.throws(() => h.lifecycle.createReplica({...h.startOptions.serviceDefinition,
    consensusBinding: h.intent.consensusBinding}, {replicaId: h.intent.descriptor.replicaId,
    replicaIds: h.intent.consensusBinding.foundingPeers.map((p) => p.replicaId)}));
  assert.equal(h.lifecycle.activeReplicas.size, 0);
});

test('shutdown fences all pending admitted creation before its first wait', async (t) => {
  const f = await fixture(t);
  const h = await host(f);
  const entered = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const resolve = f.origin.primary.resolveInstanceResource.bind(f.origin.primary);
  f.origin.primary.resolveInstanceResource = async (...args) => {
    entered.resolve(); await resume.promise; return resolve(...args);
  };
  const creating = h.lifecycle.createAdmittedReplica(h.preparation);
  const refusal = assert.rejects(creating);
  await entered.promise;
  const stopping = h.lifecycle.shutdownAll();
  await assert.rejects(h.lifecycle.createAdmittedReplica(h.preparation));
  resume.resolve();
  await refusal;
  await stopping;
  assert.equal(h.lifecycle.activeReplicas.size, 0);
  assert.equal(h.lifecycle.pendingConsensusCreations.size, 0);
});

test('failed activity cleanup retains local admission and database custody until exact retry', async (t) => {
  const f = await fixture(t);
  const h = await host(f);
  const r = await open(f, h);
  const stopTimers = r.timerManager.stopAll.bind(r.timerManager);
  const failure = new Error('injected timer-owner teardown failure');
  r.timerManager.stopAll = () => {
    throw failure;
  };
  try {
    await assert.rejects(h.lifecycle.stopReplica(f.origin.serviceId), (error) => error === failure);
    assert.equal(r.db?.open, true, 'FAILED_ACTIVITY_RELEASED_DATABASE_CUSTODY');
    const local = JSON.parse(r.db.prepare('SELECT record FROM _wasm_local_lifecycle WHERE id=1').get().record);
    assert.equal(local.phase, 'ADMITTED', 'FAILED_ACTIVITY_REPORTED_LOCAL_RETIRED');
    assert.equal(r.lifecycleState, STATE.CLEANUP_REQUIRED);
    await assert.rejects(h.lifecycle.createAdmittedReplica(h.preparation));
  } finally {
    r.timerManager.stopAll = stopTimers;
    await h.lifecycle.stopReplica(f.origin.serviceId);
  }
  assert.equal(f.origin.state().selected.resources[0].phase, 'ADMITTED');
});

for (const failure of [undefined, null, false, 0, '']) {
  test(`local retirement cannot hide falsy activity failure ${String(failure)}`, async (t) => {
    const f = await fixture(t);
    const h = await host(f);
    const r = await open(f, h);
    const original = r.timerManager.stopAll.bind(r.timerManager);
    r.timerManager.stopAll = () => {
      throw failure;
    };
    try {
      const [result] = await Promise.allSettled([h.lifecycle.stopReplica(f.origin.serviceId)]);
      assert.equal(result.status, 'rejected', 'FALSY_CLEANUP_FAILURE_ERASED');
      assert.equal(result.reason, failure);
      assert.equal(r.db?.open, true);
      assert.equal(JSON.parse(r.db.prepare('SELECT record FROM _wasm_local_lifecycle WHERE id=1').get().record).phase, 'ADMITTED');
    } finally {
      r.timerManager.stopAll = original;
      await h.lifecycle.stopReplica(f.origin.serviceId);
    }
  });
}

test('retained bound root without native history is refused rather than silently founded again', async (t) => {
  const f = await fixture(t);
  const h = await host(f);
  const original = await open(f, h);
  const snapshot = path.join(f.directory, 'admitted-backup.db');
  await original.db.backup(snapshot);
  await h.lifecycle.stopReplica(f.origin.serviceId);
  // Coherent retained-image fault, not a claim of an actual crash or power loss.
  // Restore the real pre-retirement database only after all old handles close.
  fs.copyFileSync(snapshot, original.dbPath);
  const damaged = new Database(original.dbPath);
  try {
    damaged.transaction(() => {
      for (const table of RAFT_RS_RECORD_TABLES) {
        damaged.prepare(`DELETE FROM ${table} WHERE group_id=?`).run(original.consensusOpening.identity.groupId);
      }
    })();
  } finally {
    damaged.close();
  }
  const replacement = await h.lifecycle.createAdmittedReplica(h.preparation);
  replacement.providedTimeSource = original.providedTimeSource;
  const answer = await h.lifecycle.startReplica(f.origin.serviceId, h.startOptions);
  assert.equal(answer.started, false);
  assert.notEqual(answer.bootstrapped, true, 'LOST_NATIVE_HISTORY_REFOUNDED_RETAINED_INSTANCE');
  assert.equal(replacement.raft, null);
  assert.deepEqual(h.effects, []);
  assert.equal(f.origin.state().selected.resources[0].phase, 'ADMITTED');
});

test('copying a retained bound database to another canonical path cannot transplant local admission', async (t) => {
  const f = await fixture(t);
  const h = await host(f);
  const original = await open(f, h);
  const copiedPath = path.join(f.directory, 'copied-local-admission.db');
  await original.db.backup(copiedPath);
  const clone = new WasmServiceReplica({replicaId: original.replicaId,
    replicaIds: original.replicaIds, nodeId: original.nodeId,
    dbPath: copiedPath, consensusOpening: structuredClone(original.consensusOpening),
    serviceDefinitionId: original.serviceDefinitionId, transport: f.transport});
  t.after(() => clone.shutdown());
  await assert.rejects(clone.initialize(), (error) => error.outcome === 'CONTENT_CONFLICT');
  assert.equal(clone.creationOpened, false);
  assert.equal(original.initialized, true);
  const read = new Database(copiedPath, {readonly: true});
  try {
    const local = JSON.parse(read.prepare('SELECT record FROM _wasm_local_lifecycle WHERE id=1').get().record);
    assert.equal(local.path, fs.realpathSync(original.dbPath));
    assert.equal(local.phase, 'ADMITTED');
  } finally {
    read.close();
  }
});

test('failed-start cleanup observes an overtaking failed stop before durable local retirement', async (t) => {
  const f = await fixture(t);
  const h = await host(f);
  const r = await h.lifecycle.createAdmittedReplica(h.preparation);
  const register = f.transport.register.bind(f.transport);
  const stopTimers = r.timerManager.stopAll.bind(r.timerManager);
  const startupFailure = new Error('injected transport registration failure');
  const cleanupFailure = new Error('injected overtaking timer cleanup failure');
  f.transport.register = () => {
    throw startupFailure;
  };
  r.timerManager.stopAll = () => {
    throw cleanupFailure;
  };
  try {
    const starting = h.lifecycle.startReplica(f.origin.serviceId, h.startOptions);
    const stopping = h.lifecycle.stopReplica(f.origin.serviceId);
    const [start, stop] = await Promise.allSettled([starting, stopping]);
    assert.equal(start.status, 'fulfilled');
    assert.equal(start.value.started, false);
    assert.equal(stop.status, 'rejected');
    assert.equal(stop.reason, cleanupFailure);
    assert.equal(r.db?.open, true, 'OVERTAKEN_STARTUP_CLEANUP_RELEASED_DATABASE');
    const row = r.db.prepare('SELECT record FROM _wasm_local_lifecycle WHERE id=1').get();
    assert.equal(JSON.parse(row.record).phase, 'ADMITTED');
  } finally {
    f.transport.register = register;
    r.timerManager.stopAll = stopTimers;
    await h.lifecycle.stopReplica(f.origin.serviceId);
  }
});

test('admitted opening remains an immutable captured identity until physical start', async (t) => {
  const f = await fixture(t);
  const h = await host(f);
  const original = structuredClone(h.preparation);
  const r = await h.lifecycle.createAdmittedReplica(h.preparation);
  h.preparation.intent.consensusBinding.incarnation = '1'.repeat(64);
  assert.deepEqual(r.consensusOpening.binding, original.intent.consensusBinding);
  assert.throws(() => {
    r.consensusOpening.binding.incarnation = '1'.repeat(64);
  }, TypeError);
  assert.throws(() => {
    r.consensusOpening = {};
  }, TypeError);
  const started = await h.lifecycle.startReplica(f.origin.serviceId, h.startOptions);
  assert.equal(started.status, 'BOOTSTRAPPED_HELD');
  const stored = JSON.parse(r.db.prepare('SELECT binding FROM _wasm_creation_root WHERE id=1').get().binding);
  assert.deepEqual(stored, original.intent.consensusBinding);
});
