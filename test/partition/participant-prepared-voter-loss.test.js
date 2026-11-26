// Custody discriminator for permanent-member-loss recovery. This exercises an
// election with the old membership intact, before any retirement permission.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {readParticipantTransactionRow} from
  '../../src/partition/partition-participant-transaction-store.js';
import {PARTITION_SERVICE_OPERATION as OP} from '../../src/partition/partition-service-constants.js';
import {commitMessage, prepareMessage, send} from '../test-helpers/participant-transaction-fixture.js';
import {coordinatorIntent, recordRollback} from './participant-release-tx1-decision-fixture.js';
import {INSERT_SQL, nativeFixture} from './participant-release-tx1-native-fixture.js';

test('the surviving quorum keeps its prepared record across founder loss and settles only the matching decision',
  {timeout: 40000}, async (t) => {
    const fixture = await nativeFixture(t);
    const {control} = fixture.owners;
    const baseline = await fixture.owners.release(control.partitionId);
    assert.equal(baseline.outcome, 'cut_over');
    assert.equal(fixture.leader, fixture.group.services[0]);
    const identity = await fixture.stage('e');
    const intent = await coordinatorIntent(control, identity, fixture.leader.partitionId);
    const prepared = await send(fixture.leader, prepareMessage(identity));
    assert.equal(prepared.state, 'PREPARED');
    await fixture.waitRows(identity, 'PREPARED');
    const survivors = fixture.group.services.filter((service) => service !== fixture.leader);
    const oldTerm = fixture.leader.raft.readStatus().term;
    await fixture.leader.shutdown();
    const elected = () => survivors.find((service) => {
      const status = service.raft.readStatus();
      return status.role === RAFT_ROLE.LEADER && status.term > oldTerm;
    });
    assert.ok(await fixture.group.waitFor(() => Boolean(elected())));
    const leader = elected();
    const rows = () => survivors.map((service) =>
      readParticipantTransactionRow(service.db, identity));
    assert.ok(rows().every((row) => row.state === 'PREPARED' &&
      row.preparedDigest === prepared.preparedDigest &&
      row.prepareIndex === prepared.prepareIndex));
    const write = await leader.applyWrite({type: OP.INSERT, entryId: 'after-founder-loss',
      sql: INSERT_SQL, params: ['unrelated', 'closed']});
    assert.equal(write.failureCode, 'partition_write_cutover_paused');
    const wrong = await send(leader, commitMessage(identity, '0'.repeat(64)));
    assert.equal(wrong.failureCode, 'participant_transaction_decision_digest_mismatch');
    assert.ok(rows().every((row) => row.state === 'PREPARED'));
    const decision = await recordRollback(control, intent, identity, prepared.preparedDigest);
    // Discard the original answer and reconcile from applied state.
    await send(leader, decision.message);
    assert.ok(await fixture.group.waitFor(() => rows().every((row) =>
      row.state === 'ROLLED_BACK' && row.decisionDigest === decision.row.decision_digest)));
    const index = rows()[0].decisionIndex;
    const replay = await send(leader, decision.message);
    assert.equal(replay.success, true);
    assert.equal(replay.decisionIndex, index);
    for (const service of survivors) {
      assert.equal(readParticipantTransactionRow(service.db, identity).decisionIndex, index);
      assert.equal(service.db.prepare('SELECT count(*) AS n FROM release_tx1_rows').get().n, 0);
    }
  });
