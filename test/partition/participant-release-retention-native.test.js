// Reachability measurement: one active participant does not bound the
// terminal history. Six is a witness parameter, not a production capacity.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nativeFixture, trace} from './participant-release-tx1-native-fixture.js';
import {coordinatorIntent, recordRollback, finishCoordinator} from
  './participant-release-tx1-decision-fixture.js';
import {beginMessage, identityOf, prepareMessage, send} from
  '../test-helpers/participant-transaction-fixture.js';

test('sequential native settlements retain more than four outcomes with one unresolved obligation',
  {timeout: 30000}, async (t) => {
    const f = await nativeFixture(t);
    const control = f.owners.control;
    await f.owners.release(control.partitionId);
    const measurements = [];
    for (let index = 1; index <= 6; index += 1) {
      const identity = await f.stage(String(index));
      const base = await coordinatorIntent(control, identity, f.leader.partitionId);
      const prepared = await send(f.leader, prepareMessage(identity));
      assert.equal(prepared.state, 'PREPARED');
      await f.waitRows(identity, 'PREPARED');
      const decision = await recordRollback(control, base, identity, prepared.preparedDigest);
      assert.equal((await send(f.leader, decision.message)).success, true);
      await f.waitRows(identity, 'ROLLED_BACK');
      await finishCoordinator(control, base, decision.message.decisionDigest);
      const before = f.views(identity);
      const replay = await send(f.leader, decision.message);
      assert.equal(replay.decisionIndex, before[0].participant.decisionIndex);
      assert.deepEqual(f.views(identity).map((v) => v.participant),
        before.map((v) => v.participant));
      assert.ok(before.every((v) => v.participantCount === index && v.preparedCount === 0));
      measurements.push(before);
    }
    const pinned = await f.stage('7');
    const pinnedCoordinator = await coordinatorIntent(control, pinned, f.leader.partitionId);
    const prepared = await send(f.leader, prepareMessage(pinned));
    assert.equal(prepared.state, 'PREPARED');
    await f.waitRows(pinned, 'PREPARED');
    const denied = await send(f.leader, beginMessage(identityOf('8'.repeat(32),
      {partitionId: f.leader.partitionId})));
    assert.equal(denied.failureCode, 'participant_transaction_already_active');
    const final = f.views(pinned);
    assert.ok(final.every((v) => v.participantCount === 7 && v.preparedCount === 1));
    assert.ok(final.every((v, index) =>
      v.participantJsonBytes > measurements[0][index].participantJsonBytes));
    trace(t, 'native-retention', {measurements, pinnedCoordinator, pinned: prepared, denied, final,
      sqliteDatabaseImageBytes: f.leader.db.serialize().byteLength,
      scope: 'SQLite image size is not a certified snapshot payload; no retirement performed'});
  });
