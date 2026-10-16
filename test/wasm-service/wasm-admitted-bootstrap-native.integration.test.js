import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {fixture, host, open, form, init, deliverScheduled} from './wasm-admitted-bootstrap-fixture.js';

test('actual lifecycle opens three native peers from retained admission without ACTIVE cache routes', async (t) => {
  const f = await fixture(t);
  for (let slot = 0; slot < 3; slot += 1) await open(f, await host(f, slot));
  await form(f);
  const binding = f.origin.intent.consensusBinding;
  assert.notEqual(f.groupId, f.origin.serviceId, 'UNQUALIFIED_NATIVE_GROUP');
  const oldResult = await f.hosts[0].lifecycle.administerWriter(f.origin.serviceId, init(binding, '1'.repeat(64)));
  assert.equal(oldResult.reason, 'WRITER_INCARNATION_MISMATCH');
  let response = null;
  const pending = f.hosts[0].lifecycle.administerWriter(f.origin.serviceId, init(binding));
  pending.then((result) => {
    response = result;
  });
  await deliverScheduled(f);
  assert.equal(response?.status, 'RECORDED', 'MATCHING_INIT_HAS_NO_NATIVE_APPLIED_RECEIPT');
  const views = f.replicas.map((r) => ({peer: r.replicaId,
    initialization: r.writerState.meta().initialization,
    durable: RaftRsDurableStore.readDurableRecordIn(r.db, f.groupId),
    local: JSON.parse(r.db.prepare('SELECT record FROM _wasm_local_lifecycle WHERE id=1').get().record)}));
  for (const v of views) {
    assert.equal(v.initialization.command.incarnation, binding.incarnation);
    assert.ok(BigInt(v.durable.appliedIndex) >= BigInt(response.receipt.index));
    assert.equal(v.local.phase, 'ADMITTED');
  }
  for (const h of f.hosts) assert.deepEqual(h.effects, []);
  t.diagnostic(JSON.stringify({scope: 'native WASM RF3; component metadata/journal; no guest or serving',
    groupId: f.groupId, peers: views.map((v) => ({peer: v.peer, phase: v.local.phase,
      applied: String(v.durable.appliedIndex), incarnation: v.initialization.command.incarnation})),
    receipt: response.receipt, userEffects: f.hosts.map((h) => h.effects)}));
});
