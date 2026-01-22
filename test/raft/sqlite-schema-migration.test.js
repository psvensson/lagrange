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

import {test} from 'tap';
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

  /**
   * Test 2: Legacy database with 'data' column is migrated to 'command'
   */
  t.test('legacy database with data column is migrated', async (t) => {
    const db = new Database(':memory:');

    // Create legacy schema with 'data' column
    db.exec(`
      CREATE TABLE _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Insert some legacy data
    db.prepare(
      'INSERT INTO _raft_log (log_index, term, data, timestamp) VALUES (?, ?, ?, ?)'
    ).run(1, 1, '{"type":"test","value":"legacy1"}', Date.now());
    db.prepare(
      'INSERT INTO _raft_log (log_index, term, data, timestamp) VALUES (?, ?, ?, ?)'
    ).run(2, 1, '{"type":"test","value":"legacy2"}', Date.now());

    // Initialize adapter - this should trigger migration
    const adapter = new SQLiteLogAdapter(db);

    // Check schema after migration
    const tableInfo = db.prepare('PRAGMA table_info(_raft_log)').all();
    const hasCommandColumn = tableInfo.some((col) => col.name === 'command');

    t.ok(hasCommandColumn, 'should have command column after migration');

    // Verify data was migrated
    const entry1 = adapter.get(1);
    const entry2 = adapter.get(2);

    t.ok(entry1, 'entry 1 should exist');
    t.ok(entry2, 'entry 2 should exist');
    t.equal(entry1.command.type, 'test', 'entry 1 command type preserved');
    t.equal(entry1.command.value, 'legacy1', 'entry 1 command value preserved');
    t.equal(entry2.command.value, 'legacy2', 'entry 2 command value preserved');

    db.close();
  });

  /**
   * Test 3: Database with both columns has data copied to 'command'
   */
  t.test('database with both columns copies data to command', async (t) => {
    const db = new Database(':memory:');

    // Create schema with both columns (simulating partial migration)
    db.exec(`
      CREATE TABLE _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        data TEXT NOT NULL,
        command TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // Insert data with 'data' column populated but 'command' NULL
    db.prepare(
      'INSERT INTO _raft_log (log_index, term, data, command, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 1, '{"type":"partial","value":"data1"}', null, Date.now());

    // Initialize adapter - this should complete migration
    const adapter = new SQLiteLogAdapter(db);

    // Verify data was copied to command
    const entry = adapter.get(1);
    t.ok(entry, 'entry should exist');
    t.equal(entry.command.type, 'partial', 'command type should be copied from data');
    t.equal(entry.command.value, 'data1', 'command value should be copied from data');

    db.close();
  });

  /**
   * Test 4: Migration is idempotent (safe to run multiple times)
   */
  t.test('migration is idempotent', async (t) => {
    const db = new Database(':memory:');

    // Create legacy schema
    db.exec(`
      CREATE TABLE _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Insert legacy data
    db.prepare(
      'INSERT INTO _raft_log (log_index, term, data, timestamp) VALUES (?, ?, ?, ?)'
    ).run(1, 1, '{"type":"idempotent","value":"test"}', Date.now());

    // Run migration multiple times by creating multiple adapters
    const adapter1 = new SQLiteLogAdapter(db);
    const entry1 = adapter1.get(1);

    // Create another adapter (simulating restart)
    const adapter2 = new SQLiteLogAdapter(db);
    const entry2 = adapter2.get(1);

    // Data should be the same after multiple migrations
    t.same(entry1.command, entry2.command, 'data should be preserved after multiple migrations');
    t.equal(entry1.index, entry2.index, 'index should be preserved');
    t.equal(entry1.term, entry2.term, 'term should be preserved');

    db.close();
  });

  /**
   * Test 5: Raft operations work correctly after migration
   */
  t.test('raft operations work after migration', async (t) => {
    const db = new Database(':memory:');

    // Create legacy schema
    db.exec(`
      CREATE TABLE _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Insert legacy data
    db.prepare(
      'INSERT INTO _raft_log (log_index, term, data, timestamp) VALUES (?, ?, ?, ?)'
    ).run(1, 1, '{"type":"existing","value":"old"}', Date.now());

    // Initialize adapter
    const adapter = new SQLiteLogAdapter(db);

    // Test put operation
    adapter.put({
      index: 2,
      term: 2,
      command: {type: 'new', value: 'entry'},
    });

    // Test get operation
    const newEntry = adapter.get(2);
    t.ok(newEntry, 'new entry should exist');
    t.equal(newEntry.command.type, 'new', 'new entry command type correct');

    // Test getLastInfo
    const lastInfo = adapter.getLastInfo();
    t.equal(lastInfo.index, 2, 'last index should be 2');
    t.equal(lastInfo.term, 2, 'last term should be 2');

    // Test getRange
    const range = adapter.getRange(1, 2);
    t.equal(range.length, 2, 'range should have 2 entries');
    t.equal(range[0].command.type, 'existing', 'first entry is migrated data');
    t.equal(range[1].command.type, 'new', 'second entry is new data');

    // Test removeFrom
    adapter.removeFrom(2);
    const afterRemove = adapter.get(2);
    t.notOk(afterRemove, 'entry 2 should be removed');

    // Entry 1 should still exist
    const entry1 = adapter.get(1);
    t.ok(entry1, 'entry 1 should still exist');

    db.close();
  });

  /**
   * Test 6: Empty legacy database migrates correctly
   */
  t.test('empty legacy database migrates correctly', async (t) => {
    const db = new Database(':memory:');

    // Create legacy schema with no data
    db.exec(`
      CREATE TABLE _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Initialize adapter
    const adapter = new SQLiteLogAdapter(db);

    // Check schema
    const tableInfo = db.prepare('PRAGMA table_info(_raft_log)').all();
    const hasCommandColumn = tableInfo.some((col) => col.name === 'command');
    t.ok(hasCommandColumn, 'should have command column');

    // Operations should work on empty migrated database
    const lastInfo = adapter.getLastInfo();
    t.equal(lastInfo.index, 0, 'empty log has index 0');

    adapter.put({index: 1, term: 1, command: {type: 'first'}});
    const entry = adapter.get(1);
    t.ok(entry, 'can insert into migrated empty database');
    t.equal(entry.command.type, 'first', 'entry has correct command');

    db.close();
  });
});
