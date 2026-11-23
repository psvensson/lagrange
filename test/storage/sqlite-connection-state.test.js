// The per-connection statement and committed-fact owner
// (src/storage/sqlite-connection-state.js), measured on real better-sqlite3
// connections:
//   - a statement is compiled once per connection, and only once per integer
//     mode, however often it is asked for;
//   - a connection that closed holds nothing: asking for a statement answers
//     what a prepare on that connection answers;
//   - a held statement reads the current schema after a schema change;
//   - a committed fact is derived once, follows the write that forgets it,
//     and never keeps a value a rolled-back transaction wrote.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {sqliteConnectionState} from '../../src/storage/sqlite-connection-state.js';
import {preparePartitionReadStatement} from
  '../../src/partition/partition-read-statement-owner.js';

const SELECT_VALUE = 'SELECT value FROM facts WHERE id = ?';
const SELECT_ALL = 'SELECT * FROM facts WHERE id = ?';
const UPDATE_VALUE = 'UPDATE facts SET value = ? WHERE id = ?';
const FACT = 'facts-value';
const SUBJECT = 'one';
const BIG_VALUE = 9007199254740993n;
const LOOKUPS = 50;

function countedConnection(t) {
  const db = new Database(':memory:');
  t.after(() => {
    if (db.open) db.close();
  });
  db.exec('CREATE TABLE facts (id TEXT PRIMARY KEY, value INTEGER NOT NULL)');
  db.prepare('INSERT INTO facts VALUES (?, ?)').run(SUBJECT, 1);
  const prepares = [];
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    prepares.push(sql);
    return prepare(sql);
  };
  return {db, prepares};
}

function factValue(db) {
  return sqliteConnectionState(db).committedFact(FACT, SUBJECT,
    () => sqliteConnectionState(db).statement(SELECT_VALUE).get(SUBJECT).value);
}

function writeValue(db, value) {
  sqliteConnectionState(db).statement(UPDATE_VALUE).run(value, SUBJECT);
  sqliteConnectionState(db).forgetFact(FACT, SUBJECT);
}

test('a statement is compiled once per connection and per integer mode', (t) => {
  const {db, prepares} = countedConnection(t);
  db.prepare('UPDATE facts SET value = ? WHERE id = ?').run(BIG_VALUE, SUBJECT);
  prepares.length = 0;
  const cache = sqliteConnectionState(db);
  const plain = [];
  const exact = [];
  for (let lookup = 0; lookup < LOOKUPS; lookup += 1) {
    plain.push(cache.statement(SELECT_VALUE).get(SUBJECT).value);
    exact.push(cache.exactStatement(SELECT_VALUE).get(SUBJECT).value);
  }
  assert.deepEqual(prepares, [SELECT_VALUE, SELECT_VALUE],
    'one compile for the connection mode and one for the exact mode');
  assert.equal(typeof plain[LOOKUPS - 1], 'number',
    'the connection-mode statement keeps reading numbers');
  assert.equal(exact[LOOKUPS - 1], BIG_VALUE,
    'the exact statement reads the stored integer exactly');
  assert.equal(sqliteConnectionState(db), cache, 'one cache per connection');

  const other = countedConnection(t);
  sqliteConnectionState(other.db).statement(SELECT_VALUE).get(SUBJECT);
  assert.deepEqual(other.prepares, [SELECT_VALUE],
    'another connection compiles its own statement');
});

test('a closed connection holds nothing: a request answers as a prepare does',
  (t) => {
    const {db, prepares} = countedConnection(t);
    const cache = sqliteConnectionState(db);
    cache.statement(SELECT_VALUE).get(SUBJECT);
    db.close();
    assert.throws(() => cache.statement(SELECT_VALUE),
      {name: 'TypeError', message: 'The database connection is not open'},
      'the held statement is not handed out after close');
    assert.deepEqual(prepares, [SELECT_VALUE, SELECT_VALUE],
      'the request after close went to the connection itself');
  });

test('a held statement reads the schema as it is now', (t) => {
  const {db} = countedConnection(t);
  const cache = sqliteConnectionState(db);
  assert.deepEqual(Object.keys(cache.statement(SELECT_ALL).get(SUBJECT)),
    ['id', 'value']);
  db.exec('ALTER TABLE facts ADD COLUMN note TEXT DEFAULT \'added\'');
  assert.deepEqual(cache.statement(SELECT_ALL).get(SUBJECT),
    {id: SUBJECT, value: 1, note: 'added'},
    'the added column is read through the held statement');
  db.exec('DROP TABLE facts');
  assert.throws(() => cache.statement(SELECT_ALL).get(SUBJECT),
    {code: 'SQLITE_ERROR', message: 'no such table: facts'},
    'a dropped table answers as a fresh prepare does');
});

test('a committed fact is derived once and follows the write that forgets it',
  (t) => {
    const {db, prepares} = countedConnection(t);
    let derivations = 0;
    const read = () => sqliteConnectionState(db).committedFact(FACT, SUBJECT,
      () => {
        derivations += 1;
        return sqliteConnectionState(db).statement(SELECT_VALUE).get(SUBJECT).value;
      });
    for (let lookup = 0; lookup < LOOKUPS; lookup += 1) {
      assert.equal(read(), 1);
    }
    assert.equal(derivations, 1, 'held after the first derivation');
    writeValue(db, 2);
    assert.equal(read(), 2, 'the write is observed by the next read');
    assert.equal(read(), 2);
    assert.equal(derivations, 2, 'derived once more, after the write only');
    assert.deepEqual(prepares, [SELECT_VALUE, UPDATE_VALUE]);
  });

test('a fact forgotten inside a transaction is read through until it ends, ' +
  'and a rollback leaves the committed value', (t) => {
  const {db} = countedConnection(t);
  assert.equal(factValue(db), 1);
  assert.throws(() => db.transaction(() => {
    writeValue(db, 5);
    assert.equal(factValue(db), 5,
      'inside the transaction the connection reads its own write');
    throw new Error('roll back');
  })(), /roll back/u);
  assert.equal(factValue(db), 1, 'the rolled-back value is not held');

  db.transaction(() => {
    writeValue(db, 7);
    assert.equal(factValue(db), 7);
  })();
  assert.equal(factValue(db), 7, 'the committed value is observed');

  const savepoint = db.transaction(() => {
    writeValue(db, 9);
    assert.equal(factValue(db), 9);
    throw new Error('inner');
  });
  db.transaction(() => {
    assert.throws(() => savepoint(), /inner/u);
    assert.equal(factValue(db), 7,
      'after a rolled-back savepoint the outer transaction reads its rows');
  })();
  assert.equal(factValue(db), 7);
});

test('applicationStampedFact reuses across non-application writes and ' +
  'invalidates on application writes or rollbacks', (t) => {
  const {db} = countedConnection(t);
  db.exec('CREATE TABLE raft_log (id INTEGER PRIMARY KEY, val TEXT)');
  const state = sqliteConnectionState(db);
  const stampSql = 'SELECT total_changes() AS tc, ' +
    '(SELECT data_version FROM pragma_data_version) AS dv, ' +
    '(SELECT schema_version FROM pragma_schema_version) AS sv';
  let derivations = 0;
  const readAppFact = () => state.applicationStampedFact(
    'app-census',
    state.statement(stampSql).get(),
    () => {
      derivations += 1;
      return state.statement(SELECT_VALUE).get(SUBJECT).value;
    },
  );

  assert.equal(readAppFact(), 1);
  assert.equal(derivations, 1);

  // Raft-store-only writes advance total_changes() and nonApplicationChanges together.
  state.runNonApplication('INSERT INTO raft_log (val) VALUES (?)', 'entry-1');
  state.runNonApplication('INSERT INTO raft_log (val) VALUES (?)', 'entry-2');
  assert.equal(readAppFact(), 1);
  assert.equal(derivations, 1, 'non-application writes keep app stamp stable');

  // Inside a transaction before any app write, read still hits committed value.
  db.transaction(() => {
    assert.equal(readAppFact(), 1);
    assert.equal(derivations, 1, 'in-tx read hits before any app mutation');
  })();

  // An uncommitted app write invalidates inside the tx and after rollback.
  assert.throws(() => db.transaction(() => {
    state.statement(UPDATE_VALUE).run(99, SUBJECT);
    assert.equal(readAppFact(), 99, 'sees uncommitted app write in tx');
    assert.equal(derivations, 2);
    throw new Error('abort-tx');
  })(), /abort-tx/u);
  assert.equal(readAppFact(), 1, 'rolled-back value is never retained');
  assert.equal(derivations, 3);
});

test('schemaVersionedFact invalidates on DDL and boundedStatement resets ' +
  'read/write statement modes safely', (t) => {
  const {db} = countedConnection(t);
  const state = sqliteConnectionState(db);
  const svSql = 'SELECT schema_version AS sv FROM pragma_schema_version';
  let builds = 0;
  const readCols = () => state.schemaVersionedFact(
    'cols',
    'facts',
    state.statement(svSql).get().sv,
    () => {
      builds += 1;
      return db.pragma('table_info(facts)').map((c) => c.name);
    },
  );

  assert.deepEqual(readCols(), ['id', 'value']);
  assert.deepEqual(readCols(), ['id', 'value']);
  assert.equal(builds, 1);

  db.exec('ALTER TABLE facts ADD COLUMN note TEXT');
  assert.deepEqual(readCols(), ['id', 'value', 'note']);
  assert.equal(builds, 2, 'DDL advances schema_version and invalidates');

  const writeStmt = preparePartitionReadStatement(db, UPDATE_VALUE);
  assert.equal(writeStmt.reader, false);
  writeStmt.run(42, SUBJECT);
  const readStmt = preparePartitionReadStatement(db, SELECT_VALUE);
  assert.equal(readStmt.get(SUBJECT).value, 42);
});
