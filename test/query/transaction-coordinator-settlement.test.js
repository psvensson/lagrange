import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {buildDecisionRecord} from '../../src/partition/partition-participant-transaction-bytes.js';
import {canonicalTransactionSettlement, transactionSettlementBytes,
  canonicalTransactionSettlementResult,
  observeTransactionSettlement, applyTransactionSettlement} from
  '../../src/query/distributed/distributed-transaction-settlement.js';

const id = 'a'.repeat(32);
const participant = `${id}:p1`;
const manifest = JSON.stringify([[participant, 'p1']]);
const base = {transactionId: id, sessionId: 's', transactionEpoch: 7,
  participantSetText: manifest};
const freeze = {...base, kind: 'FREEZE'};
const row = {transaction_id: id, session_id: 's', transaction_epoch: 7,
  transaction_mode: 'EXPLICIT', status: 'ACTIVE', timeout_deadline: 20,
  participant_set_state: 'OPEN', participant_set_text: manifest,
  frozen_participant_count: 0, commit_mode: 'NOT_SELECTED', created_at: 1, updated_at: 1};

function decide(decision, digest = null) {
  const record = buildDecisionRecord(id, decision, [[participant, digest]]);
  return {...base, kind: 'DECIDE', decision,
    decisionText: record.decisionText, decisionDigest: record.decisionDigest};
}

function fixture(t) {
  const gateway = createTransactionPersistenceGateway();
  t.after(() => gateway.db.close());
  gateway.seed('sql_transactions', row);
  return gateway;
}

function apply(db, command) {
  return db.transaction(() => applyTransactionSettlement(db, command))();
}

test('settlement codec refuses unknown kinds, fields, accessors and incomplete lineage', () => {
  for (const kind of ['toString', '__proto__', 'INSERT', undefined]) {
    assert.equal(canonicalTransactionSettlement({...base, kind}), null);
  }
  for (const command of [{...freeze, sql: 'DELETE FROM sql_transactions'},
    {...freeze, participantSetText: null}, {...freeze, transactionEpoch: -1},
    {...freeze, transactionId: 'not-a-transaction'}, {...freeze, sessionId: ''}]) {
    assert.equal(canonicalTransactionSettlement(command), null);
  }
  const getter = {...freeze};
  Object.defineProperty(getter, 'sessionId', {get() {
    throw new Error('wire getter executed');
  }, enumerable: true});
  assert.equal(canonicalTransactionSettlement(getter), null);
  const reverse = Object.fromEntries(Object.entries(freeze).reverse());
  assert.deepEqual(transactionSettlementBytes(reverse), transactionSettlementBytes(freeze));
  assert.equal(Object.isFrozen(transactionSettlementBytes(freeze).command), true);
});

test('settlement performs only freeze, bound rollback and consistent progress on existing lineage',
  (t) => {
    const {db} = fixture(t);
    db.exec('CREATE TABLE application_data (id INTEGER PRIMARY KEY, value TEXT)');
    db.prepare('INSERT INTO application_data VALUES (?, ?)').run(1, 'retained');
    assert.equal(observeTransactionSettlement(db, freeze).outcome, 'ready');
    assert.equal(apply(db, freeze).outcome, 'applied');
    assert.equal(apply(db, freeze).outcome, 'replayed');
    const rollback = decide('ROLLBACK');
    assert.equal(apply(db, rollback).outcome, 'applied');
    assert.equal(apply(db, rollback).outcome, 'replayed');
    const progress = {...base, kind: 'PROGRESS', decisionDigest: rollback.decisionDigest,
      status: 'ROLLED_BACK'};
    assert.equal(apply(db, {...progress, status: 'COMMITTED'}).reason, 'decision_binding_conflict');
    assert.equal(apply(db, progress).outcome, 'applied');
    assert.equal(apply(db, {...progress, status: 'ROLLING_BACK'}).outcome, 'replayed');
    const stored = db.prepare('SELECT * FROM sql_transactions').get();
    assert.equal(stored.status, 'ROLLED_BACK');
    assert.equal(stored.participant_set_text, manifest);
    assert.equal(stored.frozen_participant_count, 1);
    assert.equal(stored.decision_text, rollback.decisionText);
    assert.deepEqual(db.prepare('SELECT * FROM application_data').all(),
      [{id: 1, value: 'retained'}]);
  });

test('settlement refuses new COMMIT but follows an actual competing recorded COMMIT', (t) => {
  const {db} = fixture(t);
  apply(db, freeze);
  const commit = decide('COMMIT', 'prepared-evidence');
  assert.equal(apply(db, commit).reason, 'new_commit_forbidden');
  db.prepare('UPDATE sql_transactions SET decision=?, decision_text=?, decision_digest=?')
    .run(commit.decision, commit.decisionText, commit.decisionDigest);
  assert.equal(apply(db, commit).outcome, 'replayed');
  const lost = apply(db, decide('ROLLBACK'));
  assert.equal(lost.outcome, 'already_recorded');
  assert.equal(lost.recordedDecision.decisionText, commit.decisionText);
});

test('settlement revalidates authoritative row after admission; late enlist wins before apply',
  (t) => {
    const {db} = fixture(t);
    assert.equal(observeTransactionSettlement(db, freeze).outcome, 'ready');
    const expanded = JSON.stringify([[participant, 'p1'], [`${id}:p2`, 'p2']]);
    db.prepare('UPDATE sql_transactions SET participant_set_text=?').run(expanded);
    assert.equal(apply(db, freeze).reason, 'participant_set_conflict');
    assert.equal(db.prepare('SELECT participant_set_state FROM sql_transactions').get()
      .participant_set_state, 'OPEN');
    const fresh = {...freeze, participantSetText: expanded};
    assert.equal(apply(db, fresh).outcome, 'applied');
    assert.equal(db.prepare('SELECT frozen_participant_count FROM sql_transactions').get()
      .frozen_participant_count, 2);
  });

test('settlement distinguishes absent, legacy, corrupt, wrong identity and unreadable owner rows',
  (t) => {
    const gateway = fixture(t);
    assert.equal(apply(gateway.db, {...freeze, sessionId: 'other'}).reason, 'identity_conflict');
    gateway.seed('sql_transactions', {...row, participant_set_text: null});
    assert.equal(apply(gateway.db, freeze).reason, 'legacy_participant_set');
    gateway.seed('sql_transactions', {...row, decision: 'COMMIT'});
    assert.equal(apply(gateway.db, freeze).reason, 'recorded_decision_invalid');
    gateway.db.exec('DELETE FROM sql_transactions');
    assert.equal(apply(gateway.db, freeze).reason, 'row_absent');
    assert.equal(observeTransactionSettlement(null, freeze).outcome, 'unavailable');
  });

test('settlement storage failure rolls fixed mutation back with its enclosing apply transaction',
  (t) => {
    const {db} = fixture(t);
    assert.throws(() => db.transaction(() => {
      assert.equal(applyTransactionSettlement(db, freeze).outcome, 'applied');
      throw new Error('applied-index write failed');
    })(), /applied-index write failed/u);
    assert.equal(db.prepare('SELECT participant_set_state FROM sql_transactions').get()
      .participant_set_state, 'OPEN');
    db.exec('DROP TABLE sql_transactions');
    assert.throws(() => apply(db, freeze), /no such table/u,
      'unexpected apply storage faults propagate to the existing transaction owner');
  });

test('settlement results validate retained bytes and refuse a forged recorded participant set',
  (t) => {
    const {db} = fixture(t);
    const ready = observeTransactionSettlement(db, freeze);
    assert.deepEqual(canonicalTransactionSettlementResult(JSON.parse(JSON.stringify(ready))),
      ready);
    const frozen = apply(db, freeze);
    assert.deepEqual(canonicalTransactionSettlementResult(frozen), frozen);
    const decided = apply(db, decide('ROLLBACK'));
    assert.deepEqual(canonicalTransactionSettlementResult(JSON.parse(JSON.stringify(decided))),
      decided);
    for (const bad of [{...decided, sql: 'DELETE'}, {...decided, outcome: 'committed'},
      {...ready, reason: 'invented'}, {...decided, recordedDecision: {
        ...decided.recordedDecision, participants: []}},
      {outcome: 'already_recorded', reason: null, recordedDecision: null},
      {outcome: 'unavailable', reason: null, recordedDecision: null}]) {
      assert.equal(canonicalTransactionSettlementResult(bad), null);
    }
  });
