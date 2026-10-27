// Component metadata CAS + native WASM RF3. This does not certify native
// metadata arbitration, process recovery, snapshot import or ACTIVE projection.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {world, createGroup, initializeAndPublish, administer, retire, startWrite,
  deliverScheduled, evidence, assertRecordedWrite, proposalEntries} from
  './wasm-creation-bound-native-fixture.js';

function applicationViews(result) {
  return result.views.map(({writerMeta, writerSlots, value}) => ({writerMeta, writerSlots, value}));
}

test('creation-bound C1 refuses actual old INIT before fresh writer materialization', async (t) => {
  const w = await world(t);
  const original = await createGroup(t, w, w.metadata.request());
  await initializeAndPublish(t, original);
  startWrite(original);
  await deliverScheduled(original);
  assertRecordedWrite(original, evidence(t, original, 'original-write-applied'));
  const old = {init: structuredClone(original.init), enroll: structuredClone(original.enroll),
    write: structuredClone(original.request)};
  await retire(original);
  const next = await createGroup(t, w, w.metadata.request(1, 2, original.binding.incarnation));
  assert.notEqual(next.binding.incarnation, original.binding.incarnation);
  assert.notEqual(next.groupId, original.groupId, 'native group identity excludes old history');
  const before = evidence(t, next, 'fresh-common-root-before-old-requests');
  const initResult = await administer(next, old.init);
  const enrollResult = await administer(next, old.enroll);
  startWrite(next, old.write);
  await deliverScheduled(next);
  const after = evidence(t, next, 'after-actual-old-requests');
  t.diagnostic(JSON.stringify({initResult, enrollResult}));
  assert.equal(initResult.status, 'REFUSED', 'OLD_INIT_MUST_NOT_INITIALIZE_RECREATED_SERVICE');
  assert.equal(initResult.reason, 'WRITER_INCARNATION_MISMATCH');
  assert.equal(enrollResult.status, 'REFUSED');
  assert.equal(after.response.state, 'fulfilled');
  assert.notEqual(after.response.value.accepted, true);
  assert.deepEqual(applicationViews(after), applicationViews(before));
  await initializeAndPublish(t, next);
  startWrite(next);
  await deliverScheduled(next);
  assertRecordedWrite(next, evidence(t, next, 'valid-new-instance-write'));
});

test('creation-bound strong caller waits for actual application and survives held quorum acknowledgements',
  async (t) => {
    const w = await world(t);
    const f = await createGroup(t, w, w.metadata.request());
    await initializeAndPublish(t, f);
    f.holdResponses = true;
    startWrite(f);
    const originalCaller = f.write;
    await deliverScheduled(f);
    const cut = evidence(t, f, 'creation-bound-before-heal');
    const leader = cut.views.find((view) => view.replicaId === f.leader.replicaId);
    const entries = proposalEntries(f, leader);
    assert.equal(entries.length, 1);
    const index = BigInt(entries[0].index);
    const acknowledgements = cut.held.map((item) => item.envelope.message)
      .filter((message) => message.reject !== true && BigInt(message.index) === index);
    assert.equal(new Set(acknowledgements.map((message) => message.from)).size, 2);
    assert.ok(BigInt(leader.durable.hardState.commit) < index);
    assert.ok(BigInt(leader.durable.appliedIndex) < index);
    assert.ok(cut.views.every((view) => view.value === null));
    f.phase = 'post-measurement-heal';
    f.holdResponses = false;
    f.queue.push(...f.held.splice(0));
    await deliverScheduled(f);
    const healed = evidence(t, f, 'creation-bound-after-heal');
    assert.equal(f.write, originalCaller);
    assert.equal(healed.response.state, 'fulfilled');
    assert.equal(healed.response.value.accepted, true);
    assert.equal(healed.response.value.async, false);
    assert.ok(healed.views.every((view) => view.value === f.request.value));
    assert.notEqual(cut.response.state === 'fulfilled' &&
      cut.response.value.accepted === true && cut.response.value.async === false,
    true, 'STRONG_WRITE_SUCCESS_BEFORE_COMMIT');
    assertRecordedWrite(f, healed);
  });

test('creation-bound healthy delivery has an exact applied receipt on RF3', async (t) => {
  const w = await world(t);
  const f = await createGroup(t, w, w.metadata.request());
  await initializeAndPublish(t, f);
  startWrite(f);
  await deliverScheduled(f);
  const result = evidence(t, f, 'creation-bound-healthy');
  assertRecordedWrite(f, result);
  assert.ok(result.views.every((view) => view.value === f.request.value));
});
