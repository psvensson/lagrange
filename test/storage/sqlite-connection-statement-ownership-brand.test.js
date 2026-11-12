// Private ownership is checked before foreign properties, SQL or cleanup are touched.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {
  SQLiteConnection,
  assertSQLiteConnection,
  preparedExactStatementOf,
  preparedStatementOf,
} from '../../src/storage/sqlite-prepared-statement-owner.js';

function assertOwnerMissing(work) {
  assert.throws(work, (error) => {
    assert.equal(error.constructor, Error);
    assert.equal(error.code, 'sqlite_statement_owner_missing');
    return true;
  });
}

function refuseEveryEntry(database) {
  assertOwnerMissing(() => assertSQLiteConnection(database));
  assertOwnerMissing(() => preparedStatementOf(database, 'SELECT 1'));
  assertOwnerMissing(() => preparedExactStatementOf(database, 'SELECT 1'));
}

test('all cache entries refuse open and closed raw handles without adoption or close', () => {
  for (const closed of [false, true]) {
    const database = new Database(':memory:');
    if (closed) database.close();
    let touches = 0;
    database.prepare = () => {
      touches += 1;
      throw new Error('foreign prepare');
    };
    const close = database.close.bind(database);
    database.close = () => {
      touches += 1;
      return close();
    };
    const properties = Object.getOwnPropertyDescriptors(database);
    try {
      refuseEveryEntry(database);
      assert.equal(touches, 0);
      assert.equal(database.open, !closed);
      assert.deepEqual(Object.getOwnPropertyDescriptors(database), properties);
    } finally {
      close();
    }
  }
});

test('spoofed owners and primitives fail before property getters or supplied bridges run', () => {
  let touches = 0;
  const spoofed = Object.create(SQLiteConnection.prototype);
  for (const name of ['open', 'prepare', 'close', 'assertOwner',
    'preparedStatementOf', 'preparedExactStatementOf']) {
    Object.defineProperty(spoofed, name, {get() {
      touches += 1;
      throw new Error('foreign property getter');
    }});
  }
  const functionSpoof = () => {};
  Object.setPrototypeOf(functionSpoof, SQLiteConnection.prototype);
  for (const database of [spoofed, functionSpoof, {}, null, undefined,
    false, true, 0, 1n, '', 'database', Symbol('database')]) {
    refuseEveryEntry(database);
  }
  assert.equal(touches, 0);
});

test('proxy and revoked proxy never acquire the target connection private brand', () => {
  const database = new SQLiteConnection(':memory:');
  let touches = 0;
  const proxy = new Proxy(database, {get() {
    touches += 1;
    throw new Error('foreign proxy get');
  }, has() {
    touches += 1;
    throw new Error('foreign proxy has');
  }});
  const revoked = Proxy.revocable(database, {});
  revoked.revoke();
  try {
    refuseEveryEntry(proxy);
    refuseEveryEntry(revoked.proxy);
    assert.equal(touches, 0);
    assert.equal(database.open, true);
    assert.deepEqual(preparedStatementOf(database, 'SELECT 1 AS value').get(), {value: 1});
  } finally {
    database.close();
  }
});

test('helpers use the canonical class bridge and brand-only assertion accepts closed owners', () => {
  const database = new SQLiteConnection(':memory:');
  const fail = () => {
    throw new Error('supplied bridge must not run');
  };
  database.assertOwner = fail;
  database.preparedStatementOf = fail;
  database.preparedExactStatementOf = fail;
  try {
    assertSQLiteConnection(database);
    assert.equal(preparedStatementOf(database, 'SELECT 1 AS value').get().value, 1);
    assert.equal(preparedExactStatementOf(database, 'SELECT 1 AS value').get().value, 1n);
    database.close();
    assertSQLiteConnection(database);
    assert.throws(() => preparedStatementOf(database, 'SELECT 1'),
      /The database connection is not open/u);
    assert.throws(() => preparedExactStatementOf(database, 'SELECT 1'),
      /The database connection is not open/u);
  } finally {
    database.close();
  }
});
