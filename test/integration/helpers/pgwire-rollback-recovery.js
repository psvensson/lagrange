import assert from 'node:assert/strict';
import {readParticipantTransactionRow} from '../../../src/partition/partition-participant-transaction-store.js';
import {createLagrangeSession} from '../../distributed/reference-client/lagrange-oltp-adapter.js';

function tableLeader(services, name) {
  const leaders = [...services.values()].filter((service) => service.isLeader && service.tableName === name);
  assert.equal(leaders.length, 1, name);
  return leaders[0];
}

function wireFailure(error) {
  return {code: error?.code, message: error?.message, detail: error?.detail,
    causeCode: error?.cause?.code, causeMessage: error?.cause?.message};
}

export async function witnessPgwireRollbackRecovery({client, engine, partitionServices}, mark, evidence) {
  const tables = ['rollback_left', 'rollback_right'];
  for (const table of tables) {
    await client.query('CREATE TABLE ' + table + ' (id INTEGER PRIMARY KEY)');
  }
  await client.query('INSERT INTO rollback_right (id) VALUES (1)');
  mark('resolve participant and coordinator leaders');
  const participants = tables.map((table) => tableLeader(partitionServices, table));
  const transactions = tableLeader(partitionServices, 'sql_transactions').db;
  const enrollment = tableLeader(partitionServices, 'sql_transaction_participants').db;
  const router = engine.queryExecutor.messageRouter;
  const deliver = router.deliver;
  const session = createLagrangeSession(client);
  const socket = client.connection.stream;
  const tags = [];
  const ready = [];
  Object.assign(evidence, {tags, ready, dropped: 0});
  const onTag = ({text}) => tags.push(text);
  const onReady = ({status}) => ready.push(status);
  client.connection.on('commandComplete', onTag);
  client.connection.on('readyForQuery', onReady);
  let dropped = 0;
  let disrupted = true;
  let identity;
  const sessions = engine.transactionCoordinator.transactionsBySession;
  const existing = new Set(sessions.keys());
  router.deliver = function(address, message, options) {
    if (disrupted && identity && message.operation === 'ROLLBACK' &&
        message.transactionId === identity.transactionId &&
        message.participantId === identity.transactionId + ':' + participants[1].partitionId) {
      evidence.dropped = ++dropped;
      throw this.buildConnectionClosedError(participants[1].nodeId, {beforeSend: true});
    }
    return deliver.call(this, address, message, options);
  };
  try {
    mark('initial transaction and disrupted rollback');
    await assert.rejects(session.transaction(async () => {
      const opened = [...sessions.values()].filter((tx) => !existing.has(tx.sessionId));
      assert.equal(opened.length, 1);
      identity = opened[0];
      await client.query('INSERT INTO rollback_left (id) VALUES (2)');
      await client.query('INSERT INTO rollback_right (id) VALUES (2)');
      await client.query('INSERT INTO rollback_right (id) VALUES (1)');
    }), (error) => {
      evidence.initial = (error.errors ?? [error]).map(wireFailure);
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      assert.equal(error.errors[0].code, 'XX000');
      assert.match(error.errors[1].code, /^[0-9A-Z]{5}$/u);
      assert.notEqual(error.errors[1].code, '25P02');
      return true;
    });
    assert.ok(dropped > 0, 'first ROLLBACK reached the disrupted participant route');
    mark('inspect durable rollback decision');
    const decision = transactions.prepare('SELECT * FROM sql_transactions WHERE transaction_id = ?');
    const pending = decision.get(identity.transactionId);
    assert.equal(pending.decision, 'ROLLBACK');
    assert.equal(pending.status, 'ROLLING_BACK');
    assert.ok(pending.decision_digest);
    const firstDrops = dropped;
    let executions = 0;
    const work = async () => {
      executions++;
      await client.query('INSERT INTO rollback_left (id) VALUES (3)');
    };
    mark('later invocation while transport unavailable');
    await assert.rejects(session.transaction(work), (error) => {
      evidence.recovery = wireFailure(error);
      assert.match(error.message, /Previous transaction rollback failed before BEGIN/u);
      assert.match(error.cause.code, /^[0-9A-Z]{5}$/u);
      return true;
    });
    assert.ok(dropped > firstDrops);
    assert.equal(executions, 0);
    assert.equal(tags.filter((tag) => tag === 'BEGIN').length, 1);
    mark('transport restored and durable settlement');
    disrupted = false;
    await session.transaction(async () => {
      const terminal = decision.get(identity.transactionId);
      assert.equal(terminal.status, 'ROLLED_BACK');
      assert.equal(terminal.decision_digest, pending.decision_digest);
      const rows = enrollment.prepare('SELECT participant_id, status FROM sql_transaction_participants ' +
        'WHERE transaction_id = ? ORDER BY participant_id').all(identity.transactionId);
      const ids = participants.map((service) => identity.transactionId + ':' + service.partitionId);
      assert.deepEqual(rows.map((row) => row.participant_id), ids.slice().sort());
      assert.ok(rows.every((row) => row.status === 'ROLLED_BACK'));
      for (const [index, service] of participants.entries()) {
        const row = readParticipantTransactionRow(service.db, {
          transactionId: identity.transactionId, participantId: ids[index],
        });
        assert.equal(row?.state, 'ROLLED_BACK');
        assert.equal(row.decisionDigest, pending.decision_digest);
        assert.equal(row.sessionId, identity.sessionId);
        assert.equal(row.transactionEpoch, identity.transactionEpoch);
      }
      assert.notEqual(sessions.get(identity.sessionId)?.transactionId, undefined);
      assert.notEqual(sessions.get(identity.sessionId).transactionId, identity.transactionId);
      await work();
    });
    mark('same-connection commit verification');
    assert.equal(executions, 1);
    assert.equal(client.connection.stream, socket);
    assert.deepEqual(tags, ['BEGIN', 'INSERT 0 1', 'INSERT 0 1', 'ROLLBACK', 'BEGIN', 'INSERT 0 1', 'COMMIT']);
    assert.deepEqual(ready, ['T', 'T', 'T', 'E', 'E', 'E', 'I', 'T', 'T', 'I']);
    for (const [table, expected] of [[tables[0], [3]], [tables[1], [1]]]) {
      const result = await client.query('SELECT id FROM ' + table + ' ORDER BY id');
      assert.deepEqual(result.rows.map((row) => Number(row.id)), expected);
    }
  } finally {
    router.deliver = deliver;
    client.connection.off('commandComplete', onTag);
    client.connection.off('readyForQuery', onReady);
  }
}
