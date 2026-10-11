import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {PARTITION_ID, startLeader, send, shutdownAll} from
  '../test-helpers/participant-transaction-fixture.js';

ConfigurationManager.getInstance().initialize();

function harness() {
  const messages = [];
  const cache = createMockSystemCache(
    ['users', 'items', 'sql_transactions', 'nodes'].map((tableName) =>
      ({table_name: tableName, primaryKey: 'id'})),
    ['users', 'items', 'sql_transactions', 'nodes'].map((tableName) =>
      ({table_name: tableName, partition_id: `${tableName}-p`,
        partition_key_start: null, partition_key_end: null})),
  );
  const gateway = createTransactionPersistenceGateway();
  const engine = new SQLQueryEngine({systemCache: cache,
    controlPlaneSystemTableGateway: gateway,
    messageRouter: {async deliver(address, message) {
      messages.push({address, ...message});
      if (message.type === 'TRANSACTION') {
        return answerParticipantTransactionRequest(message);
      }
      return {acknowledged: true, success: true, rows: [{id: 'one'}]};
    }}});
  return {engine, messages, gateway};
}

for (const [name, sql, partitions] of [
  ['table', 'SELECT id FROM users', ['users-p']],
  ['fromless', 'SELECT 1 AS id', ['users-p']],
  ['join', 'SELECT u.id FROM users u JOIN items i ON u.id = i.id',
    ['users-p', 'items-p']],
]) {
  test(`TX1 Q5: ${name} SELECT enlists and carries its session identity`,
    async (t) => {
      const {engine, messages, gateway} = harness();
      t.after(() => gateway.db.close());
      const begun = await engine.transactionCoordinator.begin('reader');
      const result = await engine.executeQuery(sql, [], {sessionId: 'reader',
        expectedTransactionId: begun.transactionId, preferLeader: false});
      assert.equal(result.success, true, result.error);
      const tx = engine.transactionCoordinator.getTransaction('reader');
      assert.deepEqual([...tx.participants].sort(), partitions.sort());
      const queries = messages.filter((message) => message.type === 'QUERY');
      assert.equal(queries.length, partitions.length);
      for (const query of queries) {
        const partitionId = query.address.split('/').at(-1);
        assert.equal(query.sessionId, 'reader');
        assert.equal(query.transactionId, begun.transactionId);
        assert.equal(query.participantId,
          `${begun.transactionId}:${partitionId}`);
        const begin = messages.find((message) => message.operation === 'BEGIN' &&
          message.participantId === query.participantId);
        assert.ok(begin, 'read participant BEGIN precedes its QUERY');
        assert.ok(messages.indexOf(begin) < messages.indexOf(query));
      }
    });
}

test('TX1 Q5: a transactional system-table SELECT uses its participant view',
  async (t) => {
    const {engine, messages, gateway} = harness();
    t.after(() => gateway.db.close());
    let shortcuts = 0;
    engine.tryExecuteAuthoritativeSystemTableSelect = async () => {
      shortcuts += 1;
      return {success: true, rows: [{id: 'local'}]};
    };
    await engine.transactionCoordinator.begin('system-reader');
    const result = await engine.executeQuery('SELECT id FROM nodes',
      [], {sessionId: 'system-reader'});
    assert.equal(result.success, true, result.error);
    assert.equal(shortcuts, 0);
    assert.ok(messages.some((message) => message.type === 'QUERY' &&
      message.sessionId === 'system-reader' && message.transactionId));
    await engine.executeQuery('SELECT id FROM nodes');
    assert.equal(shortcuts, 1, 'ordinary local system-table reads stay local');
  });

test('TX1 query admission refuses its own coordinator table before participant enlistment',
  async (t) => {
    const {engine, messages, gateway} = harness();
    t.after(() => gateway.db.close());
    await engine.transactionCoordinator.begin('self-reservation');
    for (const sql of ['SELECT id FROM sql_transactions',
      'SELECT u.id FROM users u JOIN sql_transactions t ON u.id = t.id',
      'UPDATE sql_transactions SET id = ? WHERE id = ?']) {
      const result = await engine.executeQuery(sql, ['next', 'old'],
        {sessionId: 'self-reservation'});
      assert.equal(result.success, false, sql);
      assert.equal(result.failureCode, 'transaction_coordinator_participant_unsupported');
    }
    assert.equal(messages.length, 0, 'no participant BEGIN, PREPARE or statement is dispatched');
    assert.equal(gateway.rows('sql_transactions')[0].participant_set_text, '[]');
  });

test('TX1 Q5: the real participant SELECT sees its staged write', async (t) => {
  const {leader} = await startLeader();
  const gateway = createTransactionPersistenceGateway();
  t.after(async () => {
    gateway.db.close(); await shutdownAll(leader);
  });
  const messages = [];
  const cache = createMockSystemCache(
    [{table_name: 'test_table', primaryKey: 'id'}],
    [{table_name: 'test_table', partition_id: PARTITION_ID,
      partition_key_start: null, partition_key_end: null}]);
  const engine = new SQLQueryEngine({systemCache: cache,
    controlPlaneSystemTableGateway: gateway,
    messageRouter: {async deliver(_address, message) {
      messages.push(message);
      return {acknowledged: true, ...await send(leader, message)};
    }}});
  const begun = await engine.executeQuery('BEGIN', [], {sessionId: 'real-read'});
  assert.equal(begun.success, true, begun.error);
  const options = {sessionId: 'real-read',
    expectedTransactionId: begun.transactionId};
  await engine.transactionCoordinator.enlistParticipants('real-read', [PARTITION_ID]);
  const beginRequest = messages.find((message) => message.operation === 'BEGIN');
  // The real participant stages the write under the same identity the
  // engine enlisted. This witness measures read ingress, not write planning.
  const staged = await send(leader, {...beginRequest, type: 'QUERY',
    sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
    params: ['row', 'staged']});
  assert.equal(staged.success, true, staged.error);
  assert.equal(leader.db.prepare('SELECT count(*) AS n FROM test_table').get().n, 0);
  const read = await engine.executeQuery('SELECT id, value FROM test_table', [],
    options);
  assert.equal(read.success, true, read.error);
  assert.deepEqual(read.rows, [{id: 'row', value: 'staged'}]);
  const query = messages.findLast((message) => message.type === 'QUERY');
  assert.equal(query.transactionId, begun.transactionId);
  assert.equal(query.participantId, `${begun.transactionId}:${PARTITION_ID}`);
});
