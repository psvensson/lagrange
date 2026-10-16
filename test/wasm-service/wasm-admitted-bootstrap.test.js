import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {fixture, host, open, init} from './wasm-admitted-bootstrap-fixture.js';

function localState(replica) {
  return JSON.parse(replica.db.prepare('SELECT record FROM _wasm_local_lifecycle WHERE id=1').get().record);
}
function root(replica) {
  return JSON.parse(replica.db.prepare('SELECT binding FROM _wasm_creation_root WHERE id=1').get().binding);
}

test('retained manager admission opens exact instance-qualified root and keeps all user effects held', async (t) => {
  const f = await fixture(t); const h = await host(f); const replica = await open(f, h);
  assert.deepEqual(root(replica), h.preparation.intent.consensusBinding);
  const local = localState(replica);
  assert.deepEqual(local.token, h.preparation.token);
  assert.equal(local.phase, 'ADMITTED');
  assert.equal(local.replicaId, replica.replicaId);
  assert.equal(local.path, fs.realpathSync(replica.dbPath));
  assert.notEqual(replica.replicaId, h.intent.descriptor.replicaId);
  assert.ok(replica.replicaIds.every((id) =>
    id.startsWith(replica.consensusOpening.identity.groupId)));
  assert.ok(replica.dbPath.includes(replica.consensusOpening.identity.groupId));
  assert.equal(replica.writerState.meta().initialization, null);
  assert.deepEqual(f.origin.row().admission_json, JSON.stringify(h.preparation.token));
  assert.equal((await replica.handleMessage({operation: 'read', key: 'key'})).reason, 'BOOTSTRAPPED_HELD');
  assert.equal((await replica.handleMessage({operation: 'write', key: 'key', value: 'v'})).reason, 'BOOTSTRAPPED_HELD');
  await assert.rejects(replica.proposeEntry({type: 'ASYNC_WRITE', sessionId: 's', key: 'k', value: 'v'}));
  assert.equal(f.origin.state().selected.resources[0].phase, 'ADMITTED');
});

for (const fault of ['unavailable', 'closed', 'forged-token', 'foreign-host']) {
  test(`admitted physical handoff refuses ${fault} before opening or publishing`, async (t) => {
    const f = await fixture(t); const h = await host(f);
    if (fault === 'unavailable') h.lifecycle.dependencies.serviceDefinitionsOwner = null;
    if (fault === 'closed') await f.origin.primary.closeInstanceResource(h.intent.consensusBinding, h.preparation.token);
    if (fault === 'forged-token') h.preparation.token.ordinal += 1;
    if (fault === 'foreign-host') h.lifecycle.dependencies.nodeId = 'other-host';
    assert.equal(typeof h.lifecycle.createAdmittedReplica, 'function', 'MISSING_ADMITTED_PHYSICAL_HANDOFF');
    await assert.rejects(h.lifecycle.createAdmittedReplica(h.preparation));
    assert.equal(h.lifecycle.activeReplicas.size, 0);
    assert.deepEqual(h.effects, []);
  });
}

test('stored common root rejects old INIT before initial writer materialization and at committed apply', async (t) => {
  const f = await fixture(t); const h = await host(f); const r = await open(f, h);
  const command = init(h.intent.consensusBinding, '1'.repeat(64));
  assert.equal(r.writerState.classify(command).reason, 'WRITER_INCARNATION_MISMATCH', 'OLD_INIT_CHOSE_NEW_ROOT');
  const result = r.db.transaction(() => r.writerState.apply(command, r.kvStore, 1, 1))();
  assert.equal(result.reason, 'WRITER_INCARNATION_MISMATCH');
  assert.equal(r.writerState.meta().initialization, null);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM _wasm_writer_slots').get().n, 0);
  assert.deepEqual(root(r), h.intent.consensusBinding);
});

test('actual native and borrowed-KV closure writes local RETIRED without inventing metadata CLOSED', async (t) => {
  const f = await fixture(t); const h = await host(f); const r = await open(f, h);
  await h.lifecycle.stopReplica(f.origin.serviceId);
  const db = new Database(r.dbPath, {readonly: true});
  try {
    const local = JSON.parse(db.prepare('SELECT record FROM _wasm_local_lifecycle WHERE id=1').get().record);
    assert.equal(local.phase, 'RETIRED');
    assert.deepEqual(local.token, h.preparation.token);
  } finally {
    db.close();
  }
  assert.equal(f.origin.state().selected.resources[0].phase, 'ADMITTED');
  const successor = await h.lifecycle.createAdmittedReplica(h.preparation);
  successor.providedTimeSource = r.providedTimeSource;
  const result = await h.lifecycle.startReplica(f.origin.serviceId, h.startOptions);
  assert.equal(result.started, false);
  assert.notEqual(result.bootstrapped, true, 'RETIRED_RESOURCE_REOPENED');
});

test('stop joins a pending metadata resolution and forbids its later physical allocation', async (t) => {
  const f = await fixture(t); const h = await host(f);
  const entered = Promise.withResolvers(); const resume = Promise.withResolvers();
  const resolve = f.origin.primary.resolveInstanceResource.bind(f.origin.primary);
  f.origin.primary.resolveInstanceResource = async (...args) => {
    entered.resolve(); await resume.promise; return resolve(...args);
  };
  assert.equal(typeof h.lifecycle.createAdmittedReplica, 'function', 'MISSING_ADMITTED_PHYSICAL_HANDOFF');
  const creating = h.lifecycle.createAdmittedReplica(h.preparation);
  const rejected = assert.rejects(creating);
  await entered.promise;
  let stopped = false;
  const stopping = h.lifecycle.stopReplica(f.origin.serviceId).then(() => {
    stopped = true;
  });
  await Promise.resolve(); assert.equal(stopped, false, 'STOP_ABANDONED_PENDING_CREATION');
  resume.resolve(); await rejected; await stopping;
  assert.equal(h.lifecycle.activeReplicas.size, 0);
  assert.deepEqual(h.effects, []);
});

test('concurrent identical admitted delivery shares one exact physical object before start', async (t) => {
  const f = await fixture(t); const h = await host(f);
  assert.equal(typeof h.lifecycle.createAdmittedReplica, 'function', 'MISSING_ADMITTED_PHYSICAL_HANDOFF');
  const [a, b] = await Promise.all([h.lifecycle.createAdmittedReplica(h.preparation),
    h.lifecycle.createAdmittedReplica(structuredClone(h.preparation))]);
  assert.equal(a, b, 'DUPLICATE_LIVE_PHYSICAL_OBJECT');
  assert.equal(await h.lifecycle.createAdmittedReplica(h.preparation), a);
});
