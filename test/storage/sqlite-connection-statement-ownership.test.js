// Real native connection cache identity, integer semantics, acquisition and close custody.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {
  SQLiteConnection,
  preparedExactStatementOf,
  preparedStatementOf,
} from '../../src/storage/sqlite-prepared-statement-owner.js';

const SQL = 'SELECT value FROM facts';
const LARGE = 9007199254740993n;
const CLOSED = /The database connection is not open/u;

function connection(t, filename = ':memory:', options) {
  const database = new SQLiteConnection(filename, options);
  t.after(() => database.close());
  return database;
}

function countingPrepares(database) {
  const calls = [];
  const prepare = database.prepare.bind(database);
  database.prepare = (sql) => {
    calls.push(sql);
    return prepare(sql);
  };
  return calls;
}

test('connection construction preserves native identity and adds no schema or pragmas', (t) => {
  const executed = [];
  const database = connection(t, ':memory:', {verbose: (sql) => executed.push(sql)});
  assert.ok(database instanceof SQLiteConnection);
  assert.ok(database instanceof Database);
  assert.deepEqual(executed, []);
  assert.deepEqual(database.prepare('SELECT name FROM sqlite_schema').all(), []);
  assert.equal(database.prepare('SELECT 1').database, database);
  const transaction = database.transaction(function() {
    assert.equal(this, database);
    assert.equal(database.inTransaction, true);
    return preparedStatementOf(database, 'SELECT 1 AS value').get().value;
  });
  assert.equal(transaction.call(database), 1);
  assert.equal(database.inTransaction, false);
});

test('one connection caches by fixed SQL and integer mode, independent of other connections', (t) => {
  const database = connection(t);
  database.exec('CREATE TABLE facts (value INTEGER)');
  database.prepare('INSERT INTO facts VALUES (?)').run(LARGE);
  const calls = countingPrepares(database);
  const statement = preparedStatementOf(database, SQL);
  const exact = preparedExactStatementOf(database, SQL);
  assert.notEqual(statement, exact);
  assert.equal(statement.get().value, Number(LARGE));
  assert.equal(exact.get().value, LARGE);
  for (let index = 0; index < 10; index += 1) {
    assert.equal(preparedStatementOf(database, SQL), statement);
    assert.equal(preparedExactStatementOf(database, SQL), exact);
    assert.equal(statement.get().value, Number(LARGE));
    assert.equal(exact.get().value, LARGE);
  }
  assert.deepEqual(calls, [SQL, SQL]);
  const other = connection(t);
  other.exec('CREATE TABLE facts (value INTEGER)');
  assert.notEqual(preparedStatementOf(other, SQL), statement);
  assert.notEqual(preparedExactStatementOf(other, SQL), exact);
  assert.equal(preparedStatementOf(other, SQL).get(), undefined);
});

test('default cache preserves native defaultSafeIntegers at each statement preparation', (t) => {
  const database = connection(t);
  database.defaultSafeIntegers(true);
  const firstSql = 'SELECT 1 AS value';
  const first = preparedStatementOf(database, firstSql);
  assert.equal(first.get().value, 1n);
  database.defaultSafeIntegers(false);
  assert.equal(preparedStatementOf(database, firstSql), first);
  assert.equal(first.get().value, 1n);
  const nextSql = 'SELECT 2 AS value';
  const next = preparedStatementOf(database, nextSql);
  assert.equal(next.get().value, 2);
  assert.equal(preparedExactStatementOf(database, nextSql).get().value, 2n);
  assert.equal(next.get().value, 2);
});

test('failed prepare is not cached and native schema reprepare survives migration and rollback', (t) => {
  const database = connection(t);
  assert.throws(() => preparedStatementOf(database, SQL), /no such table/u);
  assert.throws(() => preparedExactStatementOf(database, SQL), /no such table/u);
  database.exec('BEGIN; CREATE TABLE facts (value INTEGER); INSERT INTO facts VALUES (1)');
  const held = preparedStatementOf(database, SQL);
  const exact = preparedExactStatementOf(database, SQL);
  assert.deepEqual(held.all(), [{value: 1}]);
  database.exec('ROLLBACK');
  assert.throws(() => held.all(), /no such table/u);
  database.exec('CREATE TABLE facts (value INTEGER); INSERT INTO facts VALUES (2)');
  assert.equal(preparedStatementOf(database, SQL), held);
  assert.equal(preparedExactStatementOf(database, SQL), exact);
  assert.deepEqual(held.all(), [{value: 2}]);
  assert.deepEqual(exact.all(), [{value: 2n}]);
  const all = preparedStatementOf(database, 'SELECT * FROM facts');
  database.exec('ALTER TABLE facts ADD COLUMN note TEXT DEFAULT \'added\'');
  assert.deepEqual(all.all(), [{value: 2, note: 'added'}]);
});

test('exact safeIntegers failure propagates without cache insertion then retries', (t) => {
  const database = connection(t);
  const prepare = database.prepare.bind(database);
  const fault = new Error('safeIntegers refused');
  let attempts = 0;
  database.prepare = (sql) => {
    attempts += 1;
    const statement = prepare(sql);
    if (attempts === 1) {
      statement.safeIntegers = () => {
        throw fault;
      };
    }
    return statement;
  };
  assert.throws(() => preparedExactStatementOf(database, 'SELECT 1 AS value'),
    (error) => error === fault);
  const exact = preparedExactStatementOf(database, 'SELECT 1 AS value');
  assert.equal(exact.get().value, 1n);
  assert.equal(preparedExactStatementOf(database, 'SELECT 1 AS value'), exact);
  assert.equal(attempts, 2);
});

test('busy uncached iterator refusal retains both caches and handle until close retry', (t) => {
  const database = connection(t);
  database.exec('CREATE TABLE facts (value INTEGER); INSERT INTO facts VALUES (1), (2)');
  const ordinary = preparedStatementOf(database, SQL);
  const exact = preparedExactStatementOf(database, SQL);
  const iterator = database.prepare('SELECT value FROM facts ORDER BY value').iterate();
  try {
    assert.deepEqual(iterator.next(), {value: {value: 1}, done: false});
    assert.throws(() => database.close(), /busy executing a query/u);
    assert.equal(database.open, true);
    const calls = countingPrepares(database);
    assert.equal(preparedStatementOf(database, SQL), ordinary);
    assert.equal(preparedExactStatementOf(database, SQL), exact);
    assert.deepEqual(calls, []);
    assert.deepEqual(ordinary.all(), [{value: 1}, {value: 2}]);
    assert.deepEqual(exact.all(), [{value: 1n}, {value: 2n}]);
  } finally {
    iterator.return();
  }
  assert.equal(database.close(), database);
  assert.equal(database.open, false);
  assert.throws(() => ordinary.all(), CLOSED);
  assert.throws(() => exact.all(), CLOSED);
  assert.equal(database.close(), database);
});

test('successful close rejects cache hits and misses without any new prepare', (t) => {
  const database = connection(t);
  const ordinary = preparedStatementOf(database, 'SELECT 1');
  const exact = preparedExactStatementOf(database, 'SELECT 1');
  database.close();
  const calls = countingPrepares(database);
  for (const sql of ['SELECT 1', 'SELECT 2']) {
    assert.throws(() => preparedStatementOf(database, sql), CLOSED);
    assert.throws(() => preparedExactStatementOf(database, sql), CLOSED);
  }
  assert.deepEqual(calls, []);
  assert.throws(() => ordinary.get(), CLOSED);
  assert.throws(() => exact.get(), CLOSED);
});

test('replacement, readonly reopen and serialized images each use their own native connection', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'statement-connection-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'replica.db');
  const image = path.join(directory, 'image.db');
  const before = connection(t, file);
  before.exec('CREATE TABLE facts (value INTEGER); INSERT INTO facts VALUES (1)');
  const held = preparedStatementOf(before, SQL);
  const built = connection(t, image);
  built.exec('CREATE TABLE facts (value INTEGER); INSERT INTO facts VALUES (2)');
  before.close();
  built.close();
  fs.renameSync(image, file);
  const reopened = connection(t, file, {readonly: true, fileMustExist: true});
  const current = preparedStatementOf(reopened, SQL);
  assert.notEqual(current, held);
  assert.deepEqual(current.all(), [{value: 2}]);
  assert.equal(reopened.readonly, true);
  assert.throws(() => held.get(), CLOSED);
  const memory = connection(t, reopened.serialize());
  assert.equal(memory.memory, true);
  assert.notEqual(preparedStatementOf(memory, SQL), current);
  assert.deepEqual(preparedExactStatementOf(memory, SQL).all(), [{value: 2n}]);
});
