/**
 * Unit tests for PartitionRaftStorage.
 * Validates the extracted Raft log storage module.
 * Requirements: 6.1, 6.4, 6.6
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import {PartitionRaftStorage, PartitionRaftLogEntry} from
  '../../src/partition/partition-raft-storage.js';

describe('PartitionRaftStorage', () => {
  let db;
  let storage;

  beforeEach(() => {
    db = new Database(':memory:');
    storage = new PartitionRaftStorage(db, 'test-partition');
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('initialization', () => {
    it('should create Raft tables on initialization', () => {
      // Verify _raft_state table exists
      const stateTable = db.prepare(
        'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'_raft_state\'',
      ).get();
      assert.ok(stateTable, '_raft_state table should exist');

      // Verify _raft_log table exists
      const logTable = db.prepare(
        'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'_raft_log\'',
      ).get();
      assert.ok(logTable, '_raft_log table should exist');
    });

    it('should initialize with default values', () => {
      assert.strictEqual(storage.currentTerm, 0);
      assert.strictEqual(storage.votedFor, null);
      assert.strictEqual(storage.commitIndex, 0);
      assert.strictEqual(storage.lastApplied, 0);
      assert.strictEqual(storage.getLogLength(), 0);
    });

    it('should load persisted state on initialization', () => {
      // Persist some state
      storage.currentTerm = 5;
      storage.persistTerm();
      storage.votedFor = 'node-1';
      storage.persistVotedFor();
      storage.appendEntry({operation: 'test'});

      // Create new storage instance with same db
      const newStorage = new PartitionRaftStorage(db, 'test-partition');

      assert.strictEqual(newStorage.currentTerm, 5);
      assert.strictEqual(newStorage.votedFor, 'node-1');
      assert.strictEqual(newStorage.getLogLength(), 1);
    });
  });

  describe('term persistence', () => {
    it('should persist and restore current term', () => {
      storage.currentTerm = 10;
      storage.persistTerm();

      const newStorage = new PartitionRaftStorage(db, 'test-partition');
      assert.strictEqual(newStorage.currentTerm, 10);
    });
  });

  describe('votedFor persistence', () => {
    it('should persist and restore votedFor', () => {
      storage.votedFor = 'candidate-1';
      storage.persistVotedFor();

      const newStorage = new PartitionRaftStorage(db, 'test-partition');
      assert.strictEqual(newStorage.votedFor, 'candidate-1');
    });

    it('should handle null votedFor', () => {
      storage.votedFor = null;
      storage.persistVotedFor();

      const newStorage = new PartitionRaftStorage(db, 'test-partition');
      // Empty string is stored for null
      assert.strictEqual(newStorage.votedFor, '');
    });
  });

  describe('appendEntry', () => {
    it('should append entry with correct index', () => {
      const entry1 = storage.appendEntry({op: 'write', key: 'a'});
      assert.strictEqual(entry1.index, 1);

      const entry2 = storage.appendEntry({op: 'write', key: 'b'});
      assert.strictEqual(entry2.index, 2);
    });

    it('should use current term for new entries', () => {
      storage.currentTerm = 3;
      const entry = storage.appendEntry({op: 'write'});
      assert.strictEqual(entry.term, 3);
    });

    it('should persist entry to SQLite', () => {
      storage.appendEntry({op: 'write', key: 'test'});

      const row = db.prepare('SELECT * FROM _raft_log WHERE log_index = 1').get();
      assert.ok(row);
      assert.strictEqual(row.log_index, 1);
      assert.deepStrictEqual(JSON.parse(row.command), {op: 'write', key: 'test'});
    });

    it('should include timestamp in entry', () => {
      const before = Date.now();
      const entry = storage.appendEntry({op: 'write'});
      const after = Date.now();

      assert.ok(entry.timestamp >= before);
      assert.ok(entry.timestamp <= after);
    });
  });

  describe('getEntry', () => {
    it('should return entry at valid index', () => {
      storage.appendEntry({op: 'first'});
      storage.appendEntry({op: 'second'});

      const entry = storage.getEntry(2);
      assert.ok(entry);
      assert.deepStrictEqual(entry.data, {op: 'second'});
    });

    it('should return null for index below 1', () => {
      storage.appendEntry({op: 'test'});
      assert.strictEqual(storage.getEntry(0), null);
      assert.strictEqual(storage.getEntry(-1), null);
    });

    it('should return null for index beyond log length', () => {
      storage.appendEntry({op: 'test'});
      assert.strictEqual(storage.getEntry(2), null);
      assert.strictEqual(storage.getEntry(100), null);
    });
  });

  describe('getEntriesFrom', () => {
    beforeEach(() => {
      storage.appendEntry({op: 'first'});
      storage.appendEntry({op: 'second'});
      storage.appendEntry({op: 'third'});
    });

    it('should return entries from start index', () => {
      const entries = storage.getEntriesFrom(2);
      assert.strictEqual(entries.length, 2);
      assert.deepStrictEqual(entries[0].data, {op: 'second'});
      assert.deepStrictEqual(entries[1].data, {op: 'third'});
    });

    it('should return all entries for index below 1', () => {
      const entries = storage.getEntriesFrom(0);
      assert.strictEqual(entries.length, 3);
    });

    it('should return empty array for index beyond log', () => {
      const entries = storage.getEntriesFrom(10);
      assert.strictEqual(entries.length, 0);
    });
  });

  describe('getLastEntry', () => {
    it('should return null for empty log', () => {
      assert.strictEqual(storage.getLastEntry(), null);
    });

    it('should return last entry', () => {
      storage.appendEntry({op: 'first'});
      storage.appendEntry({op: 'last'});

      const last = storage.getLastEntry();
      assert.ok(last);
      assert.deepStrictEqual(last.data, {op: 'last'});
    });
  });

  describe('getLastIndex', () => {
    it('should return 0 for empty log', () => {
      assert.strictEqual(storage.getLastIndex(), 0);
    });

    it('should return last index', () => {
      storage.appendEntry({op: 'first'});
      storage.appendEntry({op: 'second'});
      assert.strictEqual(storage.getLastIndex(), 2);
    });
  });

  describe('getLastTerm', () => {
    it('should return 0 for empty log', () => {
      assert.strictEqual(storage.getLastTerm(), 0);
    });

    it('should return term of last entry', () => {
      storage.currentTerm = 5;
      storage.appendEntry({op: 'test'});
      assert.strictEqual(storage.getLastTerm(), 5);
    });
  });

  describe('truncateFrom', () => {
    beforeEach(() => {
      storage.appendEntry({op: 'first'});
      storage.appendEntry({op: 'second'});
      storage.appendEntry({op: 'third'});
    });

    it('should truncate entries from index', () => {
      storage.truncateFrom(2);
      assert.strictEqual(storage.getLogLength(), 1);
      assert.deepStrictEqual(storage.getEntry(1).data, {op: 'first'});
    });

    it('should remove entries from SQLite', () => {
      storage.truncateFrom(2);

      const rows = db.prepare('SELECT * FROM _raft_log').all();
      assert.strictEqual(rows.length, 1);
    });

    it('should handle truncate from index 1 (clear all)', () => {
      storage.truncateFrom(1);
      assert.strictEqual(storage.getLogLength(), 0);
    });

    it('should ignore truncate from invalid index', () => {
      storage.truncateFrom(0);
      assert.strictEqual(storage.getLogLength(), 3);

      storage.truncateFrom(10);
      assert.strictEqual(storage.getLogLength(), 3);
    });
  });

  describe('getLogLength', () => {
    it('should return 0 for empty log', () => {
      assert.strictEqual(storage.getLogLength(), 0);
    });

    it('should return correct count', () => {
      storage.appendEntry({op: 'a'});
      storage.appendEntry({op: 'b'});
      storage.appendEntry({op: 'c'});
      assert.strictEqual(storage.getLogLength(), 3);
    });
  });
});

describe('PartitionRaftLogEntry', () => {
  it('should create entry with correct properties', () => {
    const before = Date.now();
    const entry = new PartitionRaftLogEntry(5, 10, {op: 'write'});
    const after = Date.now();

    assert.strictEqual(entry.term, 5);
    assert.strictEqual(entry.index, 10);
    assert.deepStrictEqual(entry.data, {op: 'write'});
    assert.ok(entry.timestamp >= before);
    assert.ok(entry.timestamp <= after);
  });
});
