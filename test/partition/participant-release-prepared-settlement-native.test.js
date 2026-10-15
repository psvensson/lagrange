import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nativeFixture, trace, INSERT_SQL} from './participant-release-tx1-native-fixture.js';
import {coordinatorIntent, recordRollback, finishCoordinator} from
  './participant-release-tx1-decision-fixture.js';
import {beginMessage, identityOf, prepareMessage, send, commitMessage} from
  '../test-helpers/participant-transaction-fixture.js';
import {PARTITION_SERVICE_OPERATION as OP} from '../../src/partition/partition-service-constants.js';

test('durable PREPARE replay and recorded coordinator ROLLBACK settle while admission is closed',
  {timeout: 30000}, async (t) => {
    const f = await nativeFixture(t);
    const control = f.owners.control;
    await f.owners.release(control.partitionId);
    const identity = await f.stage('b');
    const second = identityOf('c'.repeat(32), {partitionId: f.leader.partitionId});
    const denied = await send(f.leader, beginMessage(second));
    assert.equal(denied.success, false);
    assert.equal(denied.failureCode, 'participant_transaction_already_active');
    const base = await coordinatorIntent(control, identity, f.leader.partitionId);
    const prepared = await send(f.leader, prepareMessage(identity));
    assert.equal(prepared.state, 'PREPARED');
    await f.waitRows(identity, 'PREPARED');
    const before = f.views(identity);
    await f.pause();
    const replay = await send(f.leader, prepareMessage(identity));
    assert.equal(replay.success, true);
    assert.equal(replay.prepareIndex, prepared.prepareIndex);
    assert.equal(replay.preparedDigest, prepared.preparedDigest);
    assert.deepEqual(f.views(identity).map((v) => v.participant),
      before.map((v) => v.participant));
    const decision = await recordRollback(control, base, identity, prepared.preparedDigest);
    const settled = await send(f.leader, decision.message);
    assert.equal(settled.success, true, JSON.stringify(settled));
    await f.waitRows(identity, 'ROLLED_BACK');
    const after = f.views(identity);
    assert.ok(after.every((v) => v.admission.state === 'closed' && v.data.length === 0));
    assert.ok(after.every((v) => v.participant.decisionDigest === decision.row.decision_digest));
    assert.equal(new Set(after.map((v) => v.participant.decisionIndex)).size, 1);
    assert.ok(after.every((v) => BigInt(v.applied) >= BigInt(v.participant.decisionIndex)));
    const replayDecision = await send(f.leader, decision.message);
    assert.equal(replayDecision.decisionIndex, settled.decisionIndex);
    const opposite = await send(f.leader, commitMessage(identity, prepared.preparedDigest));
    assert.equal(opposite.success, false);
    assert.equal(opposite.failureCode, 'participant_transaction_decision_conflict');
    const terminalPrepare = await send(f.leader, prepareMessage(identity));
    assert.equal(terminalPrepare.state, 'ROLLED_BACK');
    assert.deepEqual(f.views(identity).map((v) => v.participant),
      after.map((v) => v.participant));
    const ordinary = await f.leader.applyWrite({type: OP.INSERT, entryId: 'still-closed',
      sql: INSERT_SQL, params: ['closed', 'closed']});
    assert.equal(ordinary.failureCode, 'partition_write_cutover_paused');
    trace(t, 'prepared-settlement-while-closed',
      {denied, prepared, before, replay, decision, settled, after,
        replayDecision, opposite, terminalPrepare, ordinary});
    await finishCoordinator(control, base, decision.message.decisionDigest);
    const reopened = await f.owners.release(f.leader.partitionId);
    trace(t, 'later-local-reauthorization', {reopened, views: f.views(identity)});
    assert.ok(f.views(identity).every((v) => v.admission.state === 'open'));
    assert.deepEqual(f.views(identity).map((v) => v.participant),
      after.map((v) => v.participant), 'reauthorization cannot erase a terminal outcome');
  });
