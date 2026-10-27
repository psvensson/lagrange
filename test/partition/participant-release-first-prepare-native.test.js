// Semantic RED for the accepted release-fencing contract. Today's fence is
// local PAUSE, not a committed HOLD. This intentionally remains red on the
// review branch; no production implementation accompanies this packet.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nativeFixture, trace, INSERT_SQL} from './participant-release-tx1-native-fixture.js';
import {prepareMessage, send} from '../test-helpers/participant-transaction-fixture.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';

test('local staging grants no first PREPARE admission after the production PAUSE',
  {timeout: 30000}, async (t) => {
    const f = await nativeFixture(t);
    const before = f.views();
    const identity = await f.stage('a');
    const staged = f.views(identity);
    assert.equal(staged.filter((row) => row.staged).length, 1);
    assert.equal(staged.find((row) => row.staged).replicaId, f.leader.replicaId);
    assert.ok(staged.every((row) => row.participant === null && row.data.length === 0));
    assert.deepEqual(staged.map((row) => row.applied), before.map((row) => row.applied),
      'BEGIN/staging produced no replicated participant or committed application');
    await f.pause();
    const ordinary = await f.leader.applyWrite({type: PARTITION_SERVICE_OPERATION.INSERT,
      entryId: 'ordinary-after-pause', sql: INSERT_SQL, params: ['ordinary', 'ordinary']});
    assert.equal(ordinary.success, false);
    assert.equal(ordinary.failureCode, 'partition_write_cutover_paused');
    const answer = await send(f.leader, prepareMessage(identity));
    if (answer.state === 'PREPARED') await f.waitRows(identity, 'PREPARED');
    const after = f.views(identity);
    trace(t, 'first-prepare-after-pause', {before, staged, ordinary, answer, after});
    assert.equal(answer.success, false,
      'first PREPARE must not create a durable obligation across a later release fence');
    assert.ok(after.every((row) => row.participant?.state !== 'PREPARED'));
  });
