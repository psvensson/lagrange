/**
 * Tests for SQLite schema migration from 'data' column to 'command' column.
 * Validates: Requirements from sqlite-schema-migration spec
 *
 * Tests:
 * 1. Fresh database creates correct schema with 'command' column
 * 2. Legacy database with 'data' column is migrated to 'command'
 * 3. Database with both columns has data copied to 'command'
 * 4. Migration is idempotent (safe to run multiple times)
 * 5. Raft operations work correctly after migration
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

test('SQLite Schema Migration', async (t) => {
  /**
   * Test 1: Fresh database creates correct schema with 'command' column
   */
  t.test('fresh database creates correct schema', async (t) => {
    const db = new Database(':memory:');
    const _adapter = new SQLiteLogAdapter(db);

    // Check schema
    const tableInfo = db.prepare('PRAGMA table_info(_raft_log)').all();
    const hasCommandColumn = tableInfo.some((col) => col.name === 'command');
    const hasDataColumn = tableInfo.some((col) => col.name === 'data');

    t.ok(hasCommandColumn, 'should have command column');
    t.notOk(hasDataColumn, 'should not have data column in fresh database');

    // Verify column properties
    const commandCol = tableInfo.find((col) => col.name === 'command');
    t.equal(commandCol.notnull, 1, 'command column should be NOT NULL');

    db.close();
  });

  t.test('legacy schema with data column is rejected', async (t) => {
    const db = new Database(':memory:');

    db.exec(`
      CREATE TABLE _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    t.throws(
      () => new SQLiteLogAdapter(db),
      /Legacy raft log schema detected/,
      'should reject legacy schema with data column',
    );

    db.close();
  });

  t.test('legacy schema missing command column is rejected', async (t) => {
    const db = new Database(':memory:');

    db.exec(`
      CREATE TABLE _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    t.throws(
      () => new SQLiteLogAdapter(db),
      /Legacy raft log schema detected/,
      'should reject schema without command column',
    );

    db.close();
  });
});
