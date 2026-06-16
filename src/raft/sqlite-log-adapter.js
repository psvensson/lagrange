/**
 * SQLiteLogAdapter - SQLite-backed log storage for liferaft.
 * Used by PartitionService for durable data storage.
 * Implements the liferaft Log interface for persistence.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 12.1, 12.2, 12.3, 12.4, 12.5
 */

import {
  isCanonicalLogEntryShape,
  normalizeLogEntry,
} from './sqlite-log-entry-shape.js';

const LOCAL_STR_1BT83 = 'Database instance is required';
const LOCAL_STR_1GJYB = 'Legacy raft log schema detected; manual migration required';
const LOCAL_STR_EVRPI = 'INSERT OR REPLACE INTO _raft_log (log_index, term, command, timestamp) VALUES (?, ?, ?, ?)';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_8WQ9L = 'DELETE FROM _raft_log WHERE log_index >= ?';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_1FMKR = 'UPDATE _raft_log SET command = ? WHERE log_index = ?';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_1JYKG = 'DELETE FROM _raft_log WHERE log_index > ?';
const LOCAL_STR_1RR58 = 'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)';
const LOCAL_STR_COMMITTEDINDEX = 'committedIndex';
const LOCAL_STR_CURRENTTERM = 'currentTerm';
const LOCAL_STR_VOTEDFOR = 'votedFor';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_COMMITINDEX = 'commitIndex';

/**
 * SQLite log adapter for liferaft.
 * Used by PartitionService for durable data storage.
 * Implements the liferaft Log interface with both sync and async methods.
 */
class SQLiteLogAdapter {
  /**
   * @param {Database} db - better-sqlite3 database instance
   * @param {Object} node - The raft node using this log (optional)
   */
  constructor(db, node = null) {
    if (!db) {
      throw new Error(LOCAL_STR_1BT83);
    }
    this.db = db;
    this.node = node;
    this.closed = false;
    this.initializeTables();
  }

  /**
   * Check if the database is open and available.
   * @return {boolean} True if database is open.
   * @private
   */
  isOpen() {
    return !this.closed && this.db && this.db.open;
  }

  /**
   * Mark the adapter as closed.
   * Called when the partition service shuts down.
   */
  close() {
    this.closed = true;
  }

  /**
   * Initialize Raft tables in SQLite.
   * Requirements: 4.1, 4.2, 4.3, 12.1
   */
  initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        command TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Check current schema for migration needs
    const tableInfo = this.db.prepare('PRAGMA table_info(_raft_log)').all();
    const hasDataColumn = tableInfo.some((col) => col.name === 'data');
    const hasCommandColumn = tableInfo.some((col) => col.name === 'command');

    if (hasDataColumn || !hasCommandColumn) {
      throw new Error(LOCAL_STR_1GJYB);
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _raft_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  }

  isCanonicalEntryShape(entry) {
    return isCanonicalLogEntryShape(entry);
  }

  normalizeEntry(entry, fallback = {}) {
    return normalizeLogEntry(entry, fallback);
  }

  /**
   * Decode one SQLite row into the canonical raft entry shape.
   * @param {Object|null} row
   * @param {number} [committedIndex]
   * @return {Object|null}
   * @private
   */
  readEntryRow(row, committedIndex = null) {
    if (!row) {
      return null;
    }
    const parsedEntry = JSON.parse(row.command);
    return this.normalizeEntry(parsedEntry, {
      index: row.log_index,
      term: row.term,
      committedIndex: Number.isFinite(committedIndex) ?
        committedIndex :
        this.getCommittedIndex(),
    });
  }

  /**
   * Persist one entry using the canonical serialized shape.
   * @param {Object} entry
   * @return {Object}
   * @private
   */
  persistEntry(entry) {
    const normalizedEntry = this.normalizeEntry(entry, {
      index: entry?.index,
      term: entry?.term,
      committedIndex: this.getCommittedIndex(),
    });
    this.db.prepare(
      LOCAL_STR_EVRPI,
    ).run(
      normalizedEntry.index,
      normalizedEntry.term,
      JSON.stringify(normalizedEntry),
      Date.now(),
    );
    return normalizedEntry;
  }

  // ============================================================
  // Liferaft Log Interface Methods (sync versions)
  // Requirements: 12.2, 12.3, 12.4, 12.5
  // ============================================================

  /**
   * Get the last log entry info.
   * Required by liferaft for log consistency checks.
   * Requirements: 12.2
   * @return {Object} {index, term, committedIndex}
   */
  getLastInfo() {
    // CL-042: an empty log's last-log-term is 0 by Raft definition (§5.4.1), not the node's
    // election term — masquerading it lets an empty-log candidate out-rank a voter holding
    // committed entries (Leader-Completeness violation → committed-log divergence). See the
    // in-memory adapter's getLastEntry for the full rationale.
    if (!this.isOpen()) {
      return {
        index: LOCAL_NUM_ZERO,
        term: LOCAL_NUM_ZERO,
        committedIndex: this.getCommittedIndex(),
      };
    }
    const row = this.db.prepare(
      'SELECT log_index, term FROM _raft_log ORDER BY log_index DESC LIMIT 1',
    ).get();

    if (!row) {
      return {
        index: LOCAL_NUM_ZERO,
        term: LOCAL_NUM_ZERO,
        committedIndex: this.getCommittedIndex(),
      };
    }
    return {
      index: row.log_index,
      term: row.term,
      committedIndex: this.getCommittedIndex(),
    };
  }

  /**
   * Get a specific log entry by index.
   * Requirements: 12.2
   * @param {number} index - Log index to retrieve
   * @return {Object|null} Log entry or null if not found
   */
  get(index) {
    if (!this.isOpen()) {
      return null;
    }
    const row = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log WHERE log_index = ?',
    ).get(index);

    return this.readEntryRow(row);
  }

  /**
   * Append a new log entry.
   * Requirements: 12.2
   * @param {Object} entry - Log entry with index, term, command
   */
  put(entry) {
    if (!this.isOpen()) {
      return;
    }
    this.persistEntry(entry);
  }

  /**
   * Remove entries from a specific index onwards.
   * Requirements: 12.2
   * @param {number} index - Index to remove from (inclusive)
   */
  removeFrom(index) {
    if (!this.isOpen()) {
      return;
    }
    this.db.prepare(LOCAL_STR_8WQ9L).run(index);
  }

  /**
   * Get entries in a range (inclusive).
   * Requirements: 12.2
   * @param {number} startIndex - Starting index
   * @param {number} endIndex - Ending index
   * @return {Array} Array of log entries
   */
  getRange(startIndex, endIndex) {
    if (!this.isOpen()) {
      return [];
    }
    const committedIndex = this.getCommittedIndex();
    const rows = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log ' +
      'WHERE log_index >= ? AND log_index <= ? ORDER BY log_index',
    ).all(startIndex, endIndex);

    return rows.map((row) => this.readEntryRow(row, committedIndex));
  }

  /**
   * Check if a log entry exists at the given index.
   * Required by liferaft for log consistency checks.
   * Requirements: 12.2
   * @param {number} index - Log index to check
   * @return {boolean} True if entry exists
   */
  has(index) {
    if (!this.isOpen()) {
      return false;
    }
    const row = this.db.prepare(
      'SELECT 1 FROM _raft_log WHERE log_index = ?',
    ).get(index);
    return !!row;
  }

  /**
   * Save a command to the log.
   * Required by liferaft for command replication.
   * Requirements: 12.2
   * @param {Object} command - Command to save
   * @param {number} term - Term to save with
   * @param {number} [index] - Index to save at (optional, auto-increments)
   * @return {Object} The saved entry
   */
  saveCommand(command, term, index) {
    if (!index) {
      const lastInfo = this.getLastInfo();
      index = lastInfo.index + LOCAL_NUM_ONE;
    }

    const entry = {
      term,
      index,
      committed: false,
      responses: [{
        address: this.node ? this.node.address : 'unknown',
        ack: true,
      }],
      command,
    };

    // Store in SQLite (only if database is open)
    if (this.isOpen()) {
      this.persistEntry(entry);
    }

    return entry;
  }

  /**
   * Acknowledge a command from a follower.
   * Required by liferaft for quorum tracking.
   * Requirements: 12.2
   * @param {number} index - Index of entry
   * @param {string} address - Address of follower
   * @return {Object} Updated entry
   */
  commandAck(index, address) {
    if (!this.isOpen()) {
      return {responses: []};
    }
    const row = this.db.prepare(
      'SELECT command FROM _raft_log WHERE log_index = ?',
    ).get(index);

    if (!row) {
      return {responses: []};
    }

    const entry = this.readEntryRow(row);

    // Add acknowledgment if not already present
    if (!entry.responses) {
      entry.responses = [];
    }
    const existingIndex = entry.responses.findIndex((r) => r.address === address);
    if (existingIndex === -LOCAL_NUM_ONE) {
      entry.responses.push({address, ack: true});
    }

    // Update in SQLite
    this.db.prepare(
      LOCAL_STR_1FMKR,
    ).run(JSON.stringify(entry), index);
    // CL-018: do NOT advance the watermark here. An ack is not a commit —
    // the premature set made getUncommittedEntriesUpToIndex(index) return
    // an empty suffix in the same quorum check that was about to commit
    // this very entry (fatal once the scan was watermark-bounded), and it
    // was the source of the old watermark-regression wart. The watermark
    // advances in commit().

    return entry;
  }

  /**
   * Get uncommitted entries up to index.
   * Required by liferaft for commit processing.
   * Requirements: 12.2
   * @param {number} index - Max index
   * @param {number} _term - Term (unused)
   * @return {Array} Uncommitted entries
   */
  getUncommittedEntriesUpToIndex(index, _term) {
    if (!this.isOpen()) {
      return [];
    }
    const committedIndex = this.getCommittedIndex();
    // CL-018: rows at or below the committed watermark are committed by
    // raft's prefix-commit semantics — scanning and JSON-parsing them on
    // every heartbeat was the top self-time frame in the seed freeze
    // windows. Bound the scan to the genuinely-uncommitted suffix.
    const rows = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log WHERE log_index <= ? AND log_index > ? ORDER BY log_index',
    ).all(index, committedIndex);

    return rows
      .map((row) => this.readEntryRow(row, committedIndex))
      .filter((entry) => !entry.committed);
  }

  /**
   * Commit an entry.
   * Required by liferaft for commit processing.
   * Requirements: 12.2
   * @param {number} index - Index to commit
   * @return {Object} Committed entry
   */
  commit(index) {
    if (!this.isOpen()) {
      return null;
    }
    const row = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log WHERE log_index = ?',
    ).get(index);

    if (!row) {
      return null;
    }

    const entry = this.readEntryRow(row);
    entry.committed = true;

    // Update in SQLite
    this.db.prepare(
      LOCAL_STR_1FMKR,
    ).run(JSON.stringify(entry), index);
    // CL-018: followers never persisted the committed watermark (only the
    // leader-side commandAck did), so every heartbeat saw
    // committedIndex < packet.last.committedIndex forever and re-scanned
    // the whole log. Commit is prefix-driven, so advancing the monotonic
    // watermark here is exact.
    this.setCommittedIndex(index);

    return entry;
  }

  /**
   * Get the last entry.
   * Required by liferaft for log consistency.
   * Requirements: 12.2
   * @return {Object} Last entry or default
   */
  getLastEntry() {
    // CL-042: an empty log's last-log-term is 0 (§5.4.1), not the node's election term.
    if (!this.isOpen()) {
      return {
        index: LOCAL_NUM_ZERO,
        term: LOCAL_NUM_ZERO,
      };
    }
    const row = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log ORDER BY log_index DESC LIMIT 1',
    ).get();

    if (!row) {
      return {
        index: LOCAL_NUM_ZERO,
        term: LOCAL_NUM_ZERO,
      };
    }

    return this.readEntryRow(row);
  }

  /**
   * Get entry info before a given entry.
   * Required by liferaft for append entries.
   * Requirements: 12.2
   * @param {Object} entry - Entry to get before
   * @return {Object} {index, term, committedIndex}
   */
  getEntryInfoBefore(entry) {
    const prevEntry = this.getEntryBefore(entry);
    return {
      index: prevEntry.index,
      term: prevEntry.term,
      committedIndex: this.getCommittedIndex(),
    };
  }

  /**
   * Get entry before a given entry.
   * Required by liferaft for append entries.
   * Requirements: 12.2
   * @param {Object} entry - Entry to get before
   * @return {Object} Previous entry or default
   */
  getEntryBefore(entry) {
    const defaultInfo = {
      index: 0,
      term: this.node ? this.node.term : 0,
    };

    if (!entry || typeof entry.index !== LOCAL_STR_NUMBER || !Number.isFinite(entry.index)) {
      return defaultInfo;
    }

    if (entry.index <= LOCAL_NUM_ONE) {
      return defaultInfo;
    }

    if (!this.isOpen()) {
      return defaultInfo;
    }

    const row = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log ' +
      'WHERE log_index < ? ORDER BY log_index DESC LIMIT 1',
    ).get(entry.index);

    if (!row) {
      return defaultInfo;
    }

    return this.readEntryRow(row);
  }

  /**
   * Get entries after index.
   * Required by liferaft for replication.
   * Requirements: 12.2
   * @param {number} index - Index to get after
   * @return {Array} Entries after index
   */
  getEntriesAfter(index) {
    if (!this.isOpen()) {
      return [];
    }
    const committedIndex = this.getCommittedIndex();
    const rows = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log WHERE log_index > ? ORDER BY log_index',
    ).all(index);

    return rows.map((row) => this.readEntryRow(row, committedIndex));
  }

  /**
   * Remove all entries after index.
   * Required by liferaft for log truncation.
   * Requirements: 12.2
   * @param {number} index - Index to remove after
   */
  removeEntriesAfter(index) {
    if (!this.isOpen()) {
      return;
    }
    this.db.prepare(LOCAL_STR_1JYKG).run(index);
  }

  /**
   * Get the committed index.
   * @return {number} Committed index
   */
  getCommittedIndex() {
    if (!this.isOpen()) {
      return LOCAL_NUM_ZERO;
    }
    // CL-018: liferaft reads committedIndex on every packet build; a
    // sqlite SELECT per read is measurable on a saturated seed. The
    // adapter is the only writer of this key, so an in-memory cache over
    // the persisted value is safe.
    if (Number.isFinite(this._committedIndexCache)) {
      return this._committedIndexCache;
    }
    const row = this.db.prepare(
      'SELECT value FROM _raft_state WHERE key = ?',
    ).get('committedIndex');
    const value = row ? parseInt(row.value, 10) : LOCAL_NUM_ZERO;
    this._committedIndexCache = value;
    return value;
  }

  /**
   * Liferaft reads committedIndex as a property on the log adapter.
   * Keep it synchronized with persisted raft state.
   * @return {number} Committed index.
   */
  get committedIndex() {
    return this.getCommittedIndex();
  }

  /**
   * Set the committed index.
   * @param {number} index - Committed index
   */
  setCommittedIndex(index) {
    if (!this.isOpen()) {
      return;
    }
    // CL-018: the raft committedIndex is monotonic by definition. The
    // leader's commandAck calls this for EVERY ack — including catch-up
    // acks at OLD indexes, which used to REGRESS the persisted watermark
    // until the next head ack (CL-015 adjacent finding #2). Clamp here so
    // every caller is monotonic.
    const current = this.getCommittedIndex();
    if (Number.isFinite(index) && index <= current) {
      return;
    }
    this.db.prepare(
      LOCAL_STR_1RR58,
    ).run(LOCAL_STR_COMMITTEDINDEX, String(index));
    this._committedIndexCache = index;
  }

  /**
   * Append entries to the log.
   * Requirements: 4.3
   * @param {Array} entries - Log entries to append
   * @param {Function} callback - Completion callback
   */
  append(entries, callback) {
    if (!this.isOpen()) {
      callback(null);
      return;
    }
    try {
      // Use INSERT OR REPLACE to handle duplicate indices gracefully
      // This can happen during Raft log replication when entries are re-sent
      const sql = 'INSERT OR REPLACE INTO _raft_log ' +
        '(log_index, term, command, timestamp) VALUES (?, ?, ?, ?)';
      const stmt = this.db.prepare(sql);

      const insertMany = this.db.transaction((entries) => {
        for (const entry of entries) {
          const normalizedEntry = this.normalizeEntry(entry, {
            index: entry?.index,
            term: entry?.term,
            committedIndex: this.getCommittedIndex(),
          });
          stmt.run(
            normalizedEntry.index,
            normalizedEntry.term,
            JSON.stringify(normalizedEntry),
            Date.now(),
          );
        }
      });

      insertMany(entries);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Get entries from a starting index.
   * Requirements: 4.3
   * @param {number} startIndex - Starting index
   * @param {Function} callback - Callback with entries
   */
  getEntriesFrom(startIndex, callback) {
    if (!this.isOpen()) {
      callback(null, []);
      return;
    }
    try {
      const committedIndex = this.getCommittedIndex();
      const entries = this.db.prepare(
        'SELECT log_index, term, command FROM _raft_log WHERE log_index >= ? ORDER BY log_index',
      ).all(startIndex);

      callback(
        null,
        entries.map((row) => this.readEntryRow(row, committedIndex)),
      );
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Get the last log entry (callback version).
   * @param {Function} callback - Callback with entry
   */
  getLastEntryCallback(callback) {
    if (!this.isOpen()) {
      callback(null, null);
      return;
    }
    try {
      const row = this.db.prepare(
        'SELECT log_index, term, command FROM _raft_log ORDER BY log_index DESC LIMIT 1',
      ).get();

      if (row) {
        callback(null, this.readEntryRow(row));
      } else {
        callback(null, null);
      }
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Truncate log from a specific index.
   * Requirements: 4.4
   * @param {number} fromIndex - Index to truncate from
   * @param {Function} callback - Completion callback
   */
  truncateFrom(fromIndex, callback) {
    if (!this.isOpen()) {
      callback(null);
      return;
    }
    try {
      this.db.prepare(LOCAL_STR_8WQ9L).run(fromIndex);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Get log length.
   * @param {Function} callback - Callback with length
   */
  getLength(callback) {
    if (!this.isOpen()) {
      callback(null, LOCAL_NUM_ZERO);
      return;
    }
    try {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM _raft_log').get();
      callback(null, row.count);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Get persistent Raft state.
   * Requirements: 4.1, 4.2
   * @param {string} key - State key (e.g., 'currentTerm', 'votedFor')
   * @param {Function} callback - Callback with value
   */
  getState(key, callback) {
    if (!this.isOpen()) {
      callback(null, null);
      return;
    }
    try {
      const row = this.db.prepare('SELECT value FROM _raft_state WHERE key = ?').get(key);
      callback(null, row ? row.value : null);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Set persistent Raft state.
   * Requirements: 4.1, 4.2
   * @param {string} key - State key
   * @param {string} value - State value
   * @param {Function} callback - Completion callback
   */
  setState(key, value, callback) {
    if (!this.isOpen()) {
      callback(null);
      return;
    }
    try {
      this.db.prepare(LOCAL_STR_1RR58)
        .run(key, value);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Get current term.
   * Requirements: 4.1
   * @param {Function} callback - Callback with term
   */
  getTerm(callback) {
    this.getState(LOCAL_STR_CURRENTTERM, (err, value) => {
      if (err) {
        callback(err);
      } else {
        callback(null, value ? parseInt(value, 10) : LOCAL_NUM_ZERO);
      }
    });
  }

  /**
   * Set current term.
   * Requirements: 4.1
   * @param {number} term - Term to set
   * @param {Function} callback - Completion callback
   */
  setTerm(term, callback) {
    this.setState(LOCAL_STR_CURRENTTERM, String(term), callback);
  }

  /**
   * Get votedFor.
   * Requirements: 4.2
   * @param {Function} callback - Callback with votedFor
   */
  getVotedFor(callback) {
    this.getState(LOCAL_STR_VOTEDFOR, (err, value) => {
      if (err) {
        callback(err);
      } else {
        callback(null, value || null);
      }
    });
  }

  /**
   * Set votedFor.
   * Requirements: 4.2
   * @param {string|null} candidateId - Candidate ID or null
   * @param {Function} callback - Completion callback
   */
  setVotedFor(candidateId, callback) {
    this.setState(LOCAL_STR_VOTEDFOR, candidateId || LOCAL_STR_EMPTY, callback);
  }

  /**
   * Get commit index.
   * @param {Function} callback - Callback with commit index
   */
  getCommitIndex(callback) {
    this.getState(LOCAL_STR_COMMITINDEX, (err, value) => {
      if (err) {
        callback(err);
      } else {
        callback(null, value ? parseInt(value, 10) : LOCAL_NUM_ZERO);
      }
    });
  }

  /**
   * Set commit index.
   * @param {number} index - Commit index to set
   * @param {Function} callback - Completion callback
   */
  setCommitIndex(index, callback) {
    this.setState(LOCAL_STR_COMMITINDEX, String(index), callback);
  }

  /**
   * End/cleanup the log adapter.
   * Called by liferaft when the node is ended.
   * For SQLite, we don't close the database here as it's managed externally.
   */
  end() {
    // No-op for SQLite - database is managed by PartitionService
    // The database will be closed when PartitionService.shutdown() is called
  }
}

export {SQLiteLogAdapter};
