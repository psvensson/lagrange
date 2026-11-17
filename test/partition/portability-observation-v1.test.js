// Q1a distinguishes the independent logical decoder from the current
// retained-table producer. Neither witness asserts a new runtime wire codec.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {readCommittedStatementCensusIn, recordCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {operationOutcomeKeyOf} from
  '../../src/partition/partition-participant-transaction-bytes.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const reference = path.join(testDirectory, 'portability-observation-reference.py');
const fixturePath = path.join(testDirectory, 'portability-observation-v1.vectors.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const sqliteSql = PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL;

function referenceDeficit(vectors) {
  const result = spawnSync('python3', [reference], {
    input: JSON.stringify(vectors), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return Number(result.stdout.trim());
}

function inMemoryStore(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(sqliteSql.CREATE_TABLE);
  return db;
}

test('independent Python decoder accepts the specified vectors', () => {
  assert.equal(referenceDeficit(fixture), 0);
  const changed = structuredClone(fixture);
  changed.comparisons[0].order = -changed.comparisons[0].order;
  assert.ok(referenceDeficit(changed) > 0,
    'integer comparison inversion must turn the reference proof red');
});

test('independent reference detects contradictions and a collapsed conformance corpus', () => {
  for (const change of [
    (copy) => {
      copy.accepted[0].value.failureCode = 'SQLITE_CONSTRAINT';
    },
    (copy) => {
      copy.accepted[2].value.changes = '1';
    },
    (copy) => {
      copy.accepted[2].value.failureCode = null;
    },
    (copy) => {
      copy.accepted[0].value.lastInsertRowid = '1';
    },
    (copy) => {
      copy.identities[1].equal = true;
    },
  ]) {
    const mutated = structuredClone(fixture);
    change(mutated);
    assert.ok(referenceDeficit(mutated) > 0,
      'invalid outcome and identity combinations must not pass');
  }
  const collapsed = structuredClone(fixture);
  collapsed.accepted = collapsed.accepted.map(({id}) =>
    ({...structuredClone(collapsed.accepted[0]), id}));
  collapsed.rejected = collapsed.rejected.map(({id}) =>
    ({...structuredClone(collapsed.rejected[0]), id}));
  collapsed.comparisons = collapsed.comparisons.map(({id}) =>
    ({...structuredClone(collapsed.comparisons[2]), id}));
  collapsed.epochs = collapsed.epochs.map(({id}) =>
    ({...structuredClone(collapsed.epochs[0]), id}));
  assert.ok(referenceDeficit(collapsed) > 0,
    'coverage cannot silently collapse into repeated small examples');
});

test('retained owner observes exact signed SQLite integers across binary64 limits', (t) => {
  const db = inMemoryStore(t);
  const selected = fixture.accepted
    .filter(({id}) => id === 'A02' || id === 'A04')
    .map(({value}) => value);
  for (const row of selected) {
    db.prepare(sqliteSql.INSERT).run(
      row.entryKey, row.outcome, BigInt(row.logIndex), BigInt(row.term),
      row.failureCode, row.failureMessage, BigInt(row.changes),
      BigInt(row.lastInsertRowid), row.ownerResultText);
  }
  const observed = db.transaction(() => readCommittedStatementCensusIn(db))();
  assert.equal(db.inTransaction, false);
  for (const selectedRow of selected) {
    const actual = observed.find(({entryKey}) => entryKey === selectedRow.entryKey);
    const expected = {...selectedRow};
    delete expected.kind;
    assert.deepEqual(actual, expected,
      'the real producer should preserve the exact reference row fields');
  }
});

test('nullable retained results stay absent, not reconstructed as zero', (t) => {
  const db = inMemoryStore(t);
  const row = fixture.accepted.find(({id}) => id === 'A10').value;
  db.prepare(sqliteSql.INSERT).run(
    row.entryKey, row.outcome, BigInt(row.logIndex), BigInt(row.term),
    row.failureCode, row.failureMessage, null, null, null);
  const [observed] = db.transaction(() => readCommittedStatementCensusIn(db))();
  assert.equal(observed.changes, null);
  assert.equal(observed.lastInsertRowid, null);
  assert.equal(observed.entryKey, row.entryKey);
});

test('actual outcome writer retains typed failure and TX1 operation identities', (t) => {
  const db = inMemoryStore(t);
  const failure = Object.assign(new Error('primary key conflict'),
    {code: 'SQLITE_CONSTRAINT'});
  const operationKey = operationOutcomeKeyOf('transaction-1:partition-1', 0);
  assert.equal(operationKey, 'txop:transaction-1:partition-1:0');
  db.transaction(() => {
    recordCommittedStatementOutcome({db}, {
      entryKey: 'entry:failed', outcome: 'statement_failed',
      index: 3n, term: 9223372036854775807n, error: failure,
    });
    recordCommittedStatementOutcome({db}, {
      entryKey: operationKey, outcome: 'applied', index: 6n, term: 3n,
      result: {changes: 2n, lastInsertRowid: null},
    });
  })();
  const observed = db.transaction(() => readCommittedStatementCensusIn(db))();
  for (const id of ['A03', 'A11']) {
    const expected = {...fixture.accepted.find((item) => item.id === id).value};
    delete expected.kind;
    assert.deepEqual(observed.find(({entryKey}) => entryKey === expected.entryKey),
      expected);
  }
});

test('an empty complete retained census is distinguishable from unavailability', (t) => {
  const db = inMemoryStore(t);
  assert.deepEqual(db.transaction(() => readCommittedStatementCensusIn(db))(), []);
  assert.throws(() => readCommittedStatementCensusIn(db),
    {code: 'partition_retained_store_schema_unavailable'});
});

test('unexpected table triggers make the authoritative retained schema contrary', (t) => {
  const db = inMemoryStore(t);
  db.exec('CREATE TRIGGER unexpected_outcomes_trigger AFTER INSERT ON ' +
    '_partition_statement_outcomes BEGIN SELECT 1; END');
  assert.throws(() => db.transaction(() => readCommittedStatementCensusIn(db))(),
    {code: 'partition_retained_store_schema_contrary'});
});

test('retained owner refuses unavailable reads and contrary retained rows', (t) => {
  const db = inMemoryStore(t);
  assert.throws(() => readCommittedStatementCensusIn(db),
    {code: 'partition_retained_store_schema_unavailable'});
  db.prepare(sqliteSql.INSERT).run('entry:contrary', 'applied', 0n, 1n,
    null, null, 0n, null, null);
  assert.throws(() => db.transaction(() => readCommittedStatementCensusIn(db))(),
    {code: 'partition_retained_store_row_contrary'});
});
