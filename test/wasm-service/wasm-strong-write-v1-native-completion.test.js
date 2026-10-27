// Explicit v1 companion; the original witness and fixture remain unchanged.
// Same native schedule: proposal accepted, two quorum ACKs withheld, original
// caller observed before healing, then that SAME caller completes after heal.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertRecordedWrite, deliverScheduled, evidence, fixture,
  proposalEntries, startWrite} from './wasm-strong-write-v1-native-fixture.js';

test('WASM v1 strong caller waits for native commit and exact applied receipt', async (t) => {
  const f = await fixture(t, 'withheld');
  f.holdResponses = true;
  startWrite(f);
  const originalCaller = f.write;
  await deliverScheduled(f);
  const cut = evidence(t, f, 'v1-before-heal');
  const leader = cut.views.find((view) => view.replicaId === f.leader.replicaId);
  const entries = proposalEntries(f, leader);
  assert.equal(entries.length, 1, 'exact v1 proposal has a durable native position');
  const index = BigInt(entries[0].index);
  const acknowledgements = cut.held.map((item) => item.envelope.message)
    .filter((message) => message.reject !== true && BigInt(message.index) === index);
  assert.equal(new Set(acknowledgements.map((message) => message.from)).size,
    2, 'both real followers acknowledge this exact v1 proposal position');
  assert.ok(BigInt(leader.durable.hardState.commit) < index,
    'the exact v1 proposal has not committed');
  assert.ok(BigInt(leader.durable.appliedIndex) < index,
    'the exact v1 proposal has not applied');
  assert.ok(cut.views.every((view) => view.value === null),
    'no replica has applied the requested value');

  f.phase = 'post-measurement-heal';
  f.holdResponses = false;
  f.queue.push(...f.held.splice(0));
  await deliverScheduled(f);
  const healed = evidence(t, f, 'v1-after-heal');
  assert.equal(f.write, originalCaller, 'healing continues the original caller');
  assert.ok(healed.views.every((view) => view.value === f.request.value));
  assert.equal(healed.response.state, 'fulfilled');
  assert.equal(healed.response.value.accepted, true,
    'the same caller receives success after actual native healing');
  assert.equal(healed.response.value.async, false);
  // This discriminator precedes detailed receipt validation deliberately:
  // a completion-only acceptance mutant must fail the named semantic RED,
  // not a secondary missing-receipt assertion.
  assert.notEqual(cut.response.state === 'fulfilled' &&
    cut.response.value.accepted === true && cut.response.value.async === false,
  true, 'STRONG_WRITE_SUCCESS_BEFORE_COMMIT');
  assertRecordedWrite(f, healed);
});

test('WASM v1 healthy delivery records exact receipt with replicated KV application',
  async (t) => {
    const f = await fixture(t, 'healthy');
    startWrite(f);
    await deliverScheduled(f);
    const result = evidence(t, f, 'v1-healthy-delivery-complete');
    assertRecordedWrite(f, result);
    assert.ok(result.views.every((view) => view.value === f.request.value));
  });
