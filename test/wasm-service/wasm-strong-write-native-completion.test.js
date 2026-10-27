// The native completion-contract witness uses the admitted writer v1
// lifecycle. Its earlier bare KV_SET delivery was retired: those bytes no
// longer represent a valid strong-write request to WasmServiceReplica.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertRecordedWrite, deliverScheduled, evidence, fixture, proposalEntries,
  startWrite} from './wasm-strong-write-v1-native-fixture.js';

test('WasmServiceReplica strong write does not succeed before native quorum commit',
  async (t) => {
    const f = await fixture(t, 'withheld');
    f.holdResponses = true;
    startWrite(f);
    const originalCaller = f.write;
    await deliverScheduled(f);
    // Freeze and print every observation BEFORE the contract assertion.
    const cut = evidence(t, f, 'before-heal');
    const leader = cut.views.find((view) => view.replicaId === f.leader.replicaId);
    const entries = proposalEntries(f, leader);
    assert.equal(entries.length, 1, 'actual durable proposal has an exact position');
    const index = BigInt(entries[0].index);
    const acknowledgements = cut.held.map((item) => item.envelope.message)
      .filter((message) => message.reject !== true && BigInt(message.index) === index);
    assert.equal(new Set(acknowledgements.map((message) => message.from)).size,
      2, 'both real followers acknowledge the exact proposal position');
    assert.ok(BigInt(leader.durable.hardState.commit) < index,
      'leader has not committed the exact proposal');
    assert.ok(BigInt(leader.durable.appliedIndex) < index,
      'leader has not applied the exact proposal');
    assert.ok(cut.views.every((view) => view.value === null),
      'no replica has applied the requested value');

    // Healing is explicitly AFTER the recorded cut; it cannot rescue the
    // measured strong-write response. Finish it before reporting semantic RED.
    f.phase = 'post-measurement-heal';
    f.holdResponses = false;
    f.queue.push(...f.held.splice(0));
    await deliverScheduled(f);
    const healed = evidence(t, f, 'after-heal');
    assert.equal(f.write, originalCaller, 'the original caller completes after native healing');
    assert.ok(healed.views.every((view) => view.value === f.request.value),
      'the retained actual responses permit real application after healing');
    assert.equal(healed.response.state, 'fulfilled');
    assert.equal(healed.response.value.accepted, true,
      'the same caller receives strong-write success after healing');
    assert.equal(healed.response.value.async, false);
    assert.notEqual(cut.response.state === 'fulfilled' &&
      cut.response.value.accepted === true && cut.response.value.async === false,
    true, 'STRONG_WRITE_SUCCESS_BEFORE_COMMIT');
    assertRecordedWrite(f, healed);
  });

test('WasmServiceReplica healthy strong write reaches native commit and KV application',
  async (t) => {
    const f = await fixture(t, 'healthy');
    startWrite(f);
    await deliverScheduled(f);
    const result = evidence(t, f, 'healthy-delivery-complete');
    assertRecordedWrite(f, result);
    for (const view of result.views) {
      const entries = proposalEntries(f, view);
      assert.equal(entries.length, 1);
      const index = BigInt(entries[0].index);
      assert.ok(BigInt(view.durable.hardState.commit) >= index);
      assert.ok(BigInt(view.durable.appliedIndex) >= index);
      assert.equal(view.value, f.request.value);
    }
  });
