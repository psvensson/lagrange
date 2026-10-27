// An exact replay exemption must not attribute a prior epoch's PREPARED
// result to a different request identity. The coordinator normally preserves
// its epoch; this exercises the existing participant trust-boundary input.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nativeFixture, trace} from './participant-release-tx1-native-fixture.js';
import {prepareMessage, send} from '../test-helpers/participant-transaction-fixture.js';

test('durable PREPARE replay validates the original transaction epoch before exemption',
  {timeout: 30000}, async (t) => {
    const f = await nativeFixture(t);
    const identity = await f.stage('f');
    const prepared = await send(f.leader, prepareMessage(identity));
    assert.equal(prepared.state, 'PREPARED');
    await f.waitRows(identity, 'PREPARED');
    await f.pause();
    const before = f.views(identity);
    const otherEpoch = {...prepareMessage(identity),
      transactionEpoch: identity.transactionEpoch + 1};
    const answer = await send(f.leader, otherEpoch);
    const after = f.views(identity);
    trace(t, 'different-epoch-prepare-replay', {identity, prepared, otherEpoch, answer,
      before, after});
    assert.deepEqual(after.map((v) => v.participant), before.map((v) => v.participant));
    assert.equal(answer.success, false,
      'a different epoch cannot receive the original request PREPARED success');
  });
