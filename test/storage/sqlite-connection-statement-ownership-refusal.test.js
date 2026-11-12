// Supplied native handles remain caller-owned: cached SQL requires its connection owner.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {preparedStatementOf} from '../../src/storage/sqlite-prepared-statement-owner.js';

test('preparedStatementOf refuses a real raw Database before preparing SQL', () => {
  const database = new Database(':memory:');
  const prepare = database.prepare.bind(database);
  let prepares = 0;
  database.prepare = (sql) => {
    prepares += 1;
    return prepare(sql);
  };
  try {
    assert.throws(() => preparedStatementOf(database, 'SELECT 1'), (error) => {
      assert.equal(error.constructor, Error);
      assert.equal(error.code, 'sqlite_statement_owner_missing');
      return true;
    }, 'an unowned native connection must be refused');
    assert.equal(prepares, 0);
    assert.equal(database.open, true);
    assert.deepEqual(database.prepare('SELECT name FROM sqlite_schema').all(), []);
  } finally {
    database.close();
  }
});
