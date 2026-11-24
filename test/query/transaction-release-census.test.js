import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
import {
  openParticipantTransactionStore,
  recordPartitionWriteOrigin,
} from '../../src/partition/partition-participant-transaction-store.js';
import {buildDecisionRecord} from
  '../../src/partition/partition-participant-transaction-bytes.js';
import {installTransactionSchemaEnforcement} from
  '../../src/query/distributed/distributed-transaction-schema-enforcement.js';
import {readTransactionReleaseCensus} from
  '../../src/query/distributed/distributed-transaction-release-census.js';

test('query release census: measured empty schema is clear; unreadable or incomplete schema is unavailable',
  (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const empty = readTransactionReleaseCensus(gateway.db);
    assert.equal(empty.state, 'clear');
    assert.equal(empty.currentSchemaValid, true);
    assert.equal(empty.schemaVersion, 2);
    assert.match(empty.rowGenerationDigest, /^[a-f0-9]{64}$/u);
    assert.equal(readTransactionReleaseCensus(null).state, 'unavailable');
    gateway.db.exec('ALTER TABLE sql_transactions DROP COLUMN participant_set_text');
    const missingColumn = readTransactionReleaseCensus(gateway.db);
    assert.equal(missingColumn.state, 'unavailable');
    assert.equal(missingColumn.enforcement.state, 'incompatible');
    assert.equal(missingColumn.currentSchemaValid, false);
    assert.equal(missingColumn.schemaVersion, null);
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

test('query release census: post-origin open undecided rows stay clear while digest and validation hold',
  (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    openParticipantTransactionStore(gateway.db);
    gateway.db.transaction(() => {
      installTransactionSchemaEnforcement(gateway.db);
      recordPartitionWriteOrigin(gateway.db, {index: 1, term: 1});
    })();

    const empty = readTransactionReleaseCensus(gateway.db);
    assert.equal(empty.state, 'clear');

    const txId = 'b'.repeat(32);
    const activeOpen = {
      transaction_id: txId,
      session_id: 'post-origin',
      status: 'ACTIVE',
      transaction_epoch: 3,
      timeout_deadline: 1000,
      transaction_mode: 'EXPLICIT',
      participant_set_state: 'OPEN',
      participant_set_text: '[]',
      commit_mode: 'NOT_SELECTED',
      frozen_participant_count: 0,
      decision: null,
      decision_text: null,
      decision_digest: null,
      created_at: 1,
      updated_at: 1,
    };
    gateway.db.prepare(
      'INSERT INTO sql_transactions (transaction_id, session_id, status, transaction_epoch, ' +
      'timeout_deadline, transaction_mode, participant_set_state, participant_set_text, ' +
      'commit_mode, frozen_participant_count, decision, decision_text, decision_digest, ' +
      'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      activeOpen.transaction_id,
      activeOpen.session_id,
      activeOpen.status,
      activeOpen.transaction_epoch,
      activeOpen.timeout_deadline,
      activeOpen.transaction_mode,
      activeOpen.participant_set_state,
      activeOpen.participant_set_text,
      activeOpen.commit_mode,
      activeOpen.frozen_participant_count,
      activeOpen.decision,
      activeOpen.decision_text,
      activeOpen.decision_digest,
      activeOpen.created_at,
      activeOpen.updated_at,
    );

    const withOpen = readTransactionReleaseCensus(gateway.db);
    assert.equal(withOpen.state, 'clear');
    assert.deepEqual(withOpen.legacyTransactionIds, []);
    assert.deepEqual(withOpen.recoverableTransactionIds, []);
    assert.notEqual(
      withOpen.rowGenerationDigest,
      empty.rowGenerationDigest,
      'post-origin open undecided rows still advance rowGenerationDigest',
    );

    // Malformed or NULL participant_set_text on an ACTIVE post-origin row is never masked.
    gateway.db.prepare(
      'UPDATE sql_transactions SET participant_set_text = NULL WHERE transaction_id = ?',
    ).run(txId);
    const nullManifest = readTransactionReleaseCensus(gateway.db);
    assert.equal(nullManifest.state, 'held');
    assert.deepEqual(nullManifest.legacyTransactionIds, [txId]);
    assert.deepEqual(nullManifest.recoverableTransactionIds, []);

    gateway.db.prepare(
      'UPDATE sql_transactions SET participant_set_text = ? WHERE transaction_id = ?',
    ).run('{malformed', txId);
    const malformedManifest = readTransactionReleaseCensus(gateway.db);
    assert.equal(malformedManifest.state, 'held');
    assert.deepEqual(malformedManifest.legacyTransactionIds, [txId]);
    assert.deepEqual(malformedManifest.recoverableTransactionIds, []);

    // Post-origin PREPARING / PREPARED / ACTIVE (FROZEN) undecided 2PC rows stay clear
    // when frozen_participant_count matches pairs.length, while advancing rowGenerationDigest.
    const admittedManifest = JSON.stringify([[`${txId}:p1`, 'p1']]);
    for (const status of ['ACTIVE', 'PREPARING', 'PREPARED']) {
      gateway.db.prepare(
        'UPDATE sql_transactions SET status = ?, participant_set_state = ?, ' +
        'participant_set_text = ?, commit_mode = ?, frozen_participant_count = ? ' +
        'WHERE transaction_id = ?',
      ).run(status, 'FROZEN', admittedManifest, 'TWO_PHASE_COMMIT', 1, txId);
      const inFlight = readTransactionReleaseCensus(gateway.db);
      assert.equal(inFlight.state, 'clear', `expected post-origin ${status} undecided 2PC row to be clear`);
      assert.deepEqual(inFlight.legacyTransactionIds, []);
      assert.deepEqual(inFlight.recoverableTransactionIds, []);
    }

    // Mismatched frozen_participant_count on a FROZEN undecided row is held in recoverableTransactionIds
    // and marked currentSchemaValid === false so it can never pass current-origin revalidation.
    gateway.db.prepare(
      'UPDATE sql_transactions SET status = ?, frozen_participant_count = ? WHERE transaction_id = ?',
    ).run('PREPARING', 2, txId);
    const mismatchedCount = readTransactionReleaseCensus(gateway.db);
    assert.equal(mismatchedCount.state, 'held');
    assert.equal(mismatchedCount.currentSchemaValid, false);
    assert.deepEqual(mismatchedCount.recoverableTransactionIds, [txId]);

    // Post-origin COMMITTING (FROZEN) row without a decision is held in recoverableTransactionIds
    // and marked currentSchemaValid === false.
    gateway.db.prepare(
      'UPDATE sql_transactions SET status = ?, frozen_participant_count = ? WHERE transaction_id = ?',
    ).run('COMMITTING', 1, txId);
    const committing = readTransactionReleaseCensus(gateway.db);
    assert.equal(committing.state, 'held');
    assert.equal(committing.currentSchemaValid, false);
    assert.deepEqual(committing.legacyTransactionIds, []);
    assert.deepEqual(committing.recoverableTransactionIds, [txId]);

    // Valid post-origin FROZEN terminal COMMITTED row with matching decision record is
    // held in recoverableTransactionIds with currentSchemaValid === true.
    const commitRecord = buildDecisionRecord(txId, 'COMMIT', [[`${txId}:p1`, 'prepared-digest']]);
    gateway.db.prepare(
      'UPDATE sql_transactions SET status = ?, decision = ?, decision_text = ?, decision_digest = ? ' +
      'WHERE transaction_id = ?',
    ).run('COMMITTED', commitRecord.decision, commitRecord.decisionText,
      commitRecord.decisionDigest, txId);
    const validCommitted = readTransactionReleaseCensus(gateway.db);
    assert.equal(validCommitted.state, 'held');
    assert.equal(validCommitted.currentSchemaValid, true);
    assert.deepEqual(validCommitted.legacyTransactionIds, []);
    assert.deepEqual(validCommitted.recoverableTransactionIds, [txId]);

    // Contradictory terminal status (ROLLED_BACK with COMMIT decision) is rejected from currentSchemaValid.
    gateway.db.prepare(
      'UPDATE sql_transactions SET status = ? WHERE transaction_id = ?',
    ).run('ROLLED_BACK', txId);
    const contradictory = readTransactionReleaseCensus(gateway.db);
    assert.equal(contradictory.state, 'held');
    assert.equal(contradictory.currentSchemaValid, false);

    // Invalid decision digest is rejected into legacyTransactionIds with currentSchemaValid === false.
    gateway.db.prepare(
      'UPDATE sql_transactions SET status = ?, decision_digest = ? WHERE transaction_id = ?',
    ).run('COMMITTED', '0'.repeat(64), txId);
    const invalidDecision = readTransactionReleaseCensus(gateway.db);
    assert.equal(invalidDecision.state, 'held');
    assert.equal(invalidDecision.currentSchemaValid, false);
    assert.deepEqual(invalidDecision.legacyTransactionIds, [txId]);
  });
