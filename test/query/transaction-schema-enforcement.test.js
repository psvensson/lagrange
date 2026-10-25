import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {readTransactionSchemaEnforcement, installTransactionSchemaEnforcement,
  coordinatorTableSchemaRefusal} from
  '../../src/query/distributed/distributed-transaction-schema-enforcement.js';

const row = {transaction_id: 'a'.repeat(32), session_id: 'session', status: 'ACTIVE',
  transaction_epoch: 7, timeout_deadline: 1000, transaction_mode: 'EXPLICIT',
  participant_set_state: 'OPEN', participant_set_text: '[]', commit_mode: 'NOT_SELECTED',
  frozen_participant_count: 0, created_at: 1, updated_at: 1};

test('coordinator schema: an old producer cannot insert an unknown manifest after enforcement',
  (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    gateway.db.transaction(() => installTransactionSchemaEnforcement(gateway.db))();
    assert.throws(() => gateway.seed('sql_transactions', {...row, participant_set_text: null}),
      /transaction_initial_row_refused/u);
  });

test('coordinator schema: actual INSERT SELECT, REPLACE and UPSERT consume the same row enforcer',
  (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const {db} = gateway;
    assert.equal(readTransactionSchemaEnforcement(db).state, 'install_required');
    db.transaction(() => installTransactionSchemaEnforcement(db))();
    assert.equal(readTransactionSchemaEnforcement(db).state, 'enforced');
    gateway.seed('sql_transactions', row);
    for (const malformed of [{participant_set_text: '[ ]'}, {status: 'COMMITTED'},
      {transaction_epoch: null}, {timeout_deadline: null}, {decision: 'ROLLBACK'},
      {transaction_id: 'legacy-id'}, {session_id: ''}, {frozen_participant_count: 1}]) {
      assert.throws(() => gateway.seed('sql_transactions', {...row,
        transaction_id: 'b'.repeat(32), ...malformed}), /transaction_initial_row_refused/u);
    }
    assert.throws(() => gateway.seed('sql_transactions', {...row, session_id: 'replacement'}),
      /transaction_initial_row_refused/u, 'OR REPLACE cannot erase a retained lineage');
    assert.throws(() => db.exec('INSERT INTO sql_transactions SELECT * FROM sql_transactions'),
      /transaction_initial_row_refused/u);
    assert.throws(() => db.exec('INSERT INTO sql_transactions SELECT * FROM sql_transactions ' +
      'WHERE true ON CONFLICT(transaction_id) DO UPDATE SET participant_set_text = NULL'),
    /transaction_initial_row_refused/u);
    assert.equal(gateway.rows('sql_transactions')[0].session_id, row.session_id);
    assert.equal(gateway.rows('sql_transactions')[0].participant_set_text, '[]');
  });

test('coordinator schema: existing NULL rows survive install and never gain an empty manifest',
  (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    gateway.seed('sql_transactions', {...row, participant_set_text: null, status: 'COMMITTED'});
    const before = gateway.rows('sql_transactions');
    gateway.db.transaction(() => installTransactionSchemaEnforcement(gateway.db))();
    assert.deepEqual(gateway.rows('sql_transactions'), before);
    assert.throws(() => gateway.seed('sql_transactions', {...row, transaction_id: 'b'.repeat(32),
      participant_set_text: null}), /transaction_initial_row_refused/u);
  });

test('coordinator schema: empty old schema installs nullable columns, nonempty old schema stays held',
  (t) => {
    for (const populated of [false, true]) {
      const gateway = createTransactionPersistenceGateway();
      t.after(() => gateway.db.close());
      gateway.db.exec('ALTER TABLE sql_transactions DROP COLUMN participant_set_text');
      if (populated) {
        gateway.db.prepare('INSERT INTO sql_transactions (transaction_id, session_id, status, ' +
          'transaction_mode, participant_set_state, commit_mode, frozen_participant_count, ' +
          'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(row.transaction_id, 'old', 'COMMITTED', 'EXPLICIT', 'OPEN', 'NOT_SELECTED', 0, 1, 1);
        assert.throws(() => gateway.db.transaction(() =>
          installTransactionSchemaEnforcement(gateway.db))(), /enforcement_unavailable/u);
      } else {
        gateway.db.transaction(() => installTransactionSchemaEnforcement(gateway.db))();
        const column = gateway.db.prepare('PRAGMA table_info(sql_transactions)').all()
          .find((field) => field.name === 'participant_set_text');
        assert.equal(column.dflt_value, null);
        assert.equal(column.notnull, 0);
      }
    }
  });

test('coordinator schema: altered enforcement fails closed, and outer apply failure rolls it back',
  (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    assert.throws(() => gateway.db.transaction(() => {
      installTransactionSchemaEnforcement(gateway.db);
      throw new Error('applied index failed');
    })(), /applied index failed/u);
    assert.equal(readTransactionSchemaEnforcement(gateway.db).state, 'install_required');
    gateway.db.exec('CREATE TRIGGER sql_transactions_initial_lineage_v1 BEFORE INSERT ' +
      'ON sql_transactions BEGIN SELECT 1; END');
    assert.equal(readTransactionSchemaEnforcement(gateway.db).state, 'incompatible');
    assert.throws(() => installTransactionSchemaEnforcement(gateway.db), /enforcement_unavailable/u);
    assert.equal(coordinatorTableSchemaRefusal('sql_transactions').failureCode,
      'transaction_coordinator_schema_protected');
    assert.equal(coordinatorTableSchemaRefusal('SQL_TRANSACTIONS'), null);
    assert.equal(coordinatorTableSchemaRefusal('global.sql_transactions').failureCode,
      'transaction_coordinator_schema_protected');
    assert.equal(coordinatorTableSchemaRefusal('tables'), null);
    assert.equal(readTransactionSchemaEnforcement(null).state, 'unavailable');
  });
