import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
import {readTransactionReleaseCensus} from
  '../../src/query/distributed/distributed-transaction-release-census.js';

test('query release census: measured empty schema is clear; unreadable schema is unavailable',
  (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const empty = readTransactionReleaseCensus(gateway.db);
    assert.equal(empty.state, 'clear');
    assert.equal(empty.schemaVersion, 2);
    assert.match(empty.rowGenerationDigest, /^[a-f0-9]{64}$/u);
    assert.equal(readTransactionReleaseCensus(null).state, 'unavailable');
    gateway.db.exec('ALTER TABLE sql_transactions DROP COLUMN participant_set_text');
    assert.equal(readTransactionReleaseCensus(gateway.db).state, 'empty_legacy_schema');
    assert.equal(readTransactionReleaseCensus(gateway.db).schemaVersion, null);
  });

test('query release census: legacy terminal labels never certify drain; exact generation changes',
  (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const row = {transaction_id: 'a'.repeat(32), session_id: 'legacy', status: 'COMMITTED',
      transaction_epoch: 1, transaction_mode: 'EXPLICIT', participant_set_state: 'FROZEN',
      commit_mode: 'TWO_PHASE_COMMIT', frozen_participant_count: 0, created_at: 1, updated_at: 1};
    gateway.seed('sql_transactions', row);
    const legacy = readTransactionReleaseCensus(gateway.db);
    assert.equal(legacy.state, 'held');
    assert.deepEqual(legacy.legacyTransactionIds, [row.transaction_id]);
    gateway.seed('sql_transactions', {...row, participant_set_text: '[]'});
    const known = readTransactionReleaseCensus(gateway.db);
    assert.equal(known.state, 'held', 'a retained set is recoverable, not fresh terminal proof');
    assert.deepEqual(known.recoverableTransactionIds, [row.transaction_id]);
    assert.notEqual(known.rowGenerationDigest, legacy.rowGenerationDigest);
  });
