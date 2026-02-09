/**
 * SQLiteLogAdapter - SQLite-backed log storage for liferaft.
 * Used by PartitionService for durable data storage.
 * Implements the liferaft Log interface for persistence.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 12.1, 12.2, 12.3, 12.4, 12.5
 */

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
      throw new Error('Database instance is required');
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
      throw new Error('Legacy raft log schema detected; manual migration required');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _raft_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
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
    if (!this.isOpen()) {
      return {
        index: 0,
        term: this.node ? this.node.term : 0,
        committedIndex: this.getCommittedIndex(),
      };
    }
    const row = this.db.prepare(
      'SELECT log_index, term FROM _raft_log ORDER BY log_index DESC LIMIT 1',
    ).get();

    if (!row) {
      return {
        index: 0,
        term: this.node ? this.node.term : 0,
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

    if (!row) return null;
    return {
      index: row.log_index,
      term: row.term,
      command: JSON.parse(row.command),
    };
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
    this.db.prepare(
      'INSERT OR REPLACE INTO _raft_log (log_index, term, command, timestamp) VALUES (?, ?, ?, ?)',
    ).run(entry.index, entry.term, JSON.stringify(entry.command), Date.now());
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
    this.db.prepare('DELETE FROM _raft_log WHERE log_index >= ?').run(index);
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
    const rows = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log ' +
      'WHERE log_index >= ? AND log_index <= ? ORDER BY log_index',
    ).all(startIndex, endIndex);

    return rows.map((row) => ({
      index: row.log_index,
      term: row.term,
      command: JSON.parse(row.command),
    }));
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
      index = lastInfo.index + 1;
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
      const sql = 'INSERT OR REPLACE INTO _raft_log ' +
        '(log_index, term, command, timestamp) VALUES (?, ?, ?, ?)';
      this.db.prepare(sql).run(index, term, JSON.stringify(entry), Date.now());
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

    const entry = JSON.parse(row.command);

    // Add acknowledgment if not already present
    if (!entry.responses) {
      entry.responses = [];
    }
    const existingIndex = entry.responses.findIndex((r) => r.address === address);
    if (existingIndex === -1) {
      entry.responses.push({address, ack: true});
    }

    // Update in SQLite
    this.db.prepare(
      'UPDATE _raft_log SET command = ? WHERE log_index = ?',
    ).run(JSON.stringify(entry), index);
    this.setCommittedIndex(index);

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
    const rows = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log WHERE log_index <= ? ORDER BY log_index',
    ).all(index);

    return rows
      .map((row) => {
        const entry = JSON.parse(row.command);
        return {
          ...entry,
          index: row.log_index,
          term: row.term,
        };
      })
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
      throw new Error(`Entry not found at index ${index}`);
    }

    const entry = JSON.parse(row.command);
    entry.committed = true;
    entry.index = row.log_index;
    entry.term = row.term;

    // Update in SQLite
    this.db.prepare(
      'UPDATE _raft_log SET command = ? WHERE log_index = ?',
    ).run(JSON.stringify(entry), index);

    return entry;
  }

  /**
   * Get the last entry.
   * Required by liferaft for log consistency.
   * Requirements: 12.2
   * @return {Object} Last entry or default
   */
  getLastEntry() {
    if (!this.isOpen()) {
      return {
        index: 0,
        term: this.node ? this.node.term : 0,
      };
    }
    const row = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log ORDER BY log_index DESC LIMIT 1',
    ).get();

    if (!row) {
      return {
        index: 0,
        term: this.node ? this.node.term : 0,
      };
    }

    const entry = JSON.parse(row.command);
    return {
      ...entry,
      index: row.log_index,
      term: row.term,
    };
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

    if (entry.index <= 1) {
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

    const prevEntry = JSON.parse(row.command);
    return {
      ...prevEntry,
      index: row.log_index,
      term: row.term,
    };
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
    const rows = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log WHERE log_index > ? ORDER BY log_index',
    ).all(index);

    return rows.map((row) => {
      const entry = JSON.parse(row.command);
      return {
        ...entry,
        index: row.log_index,
        term: row.term,
      };
    });
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
    this.db.prepare('DELETE FROM _raft_log WHERE log_index > ?').run(index);
  }

  /**
   * Get the committed index.
   * @return {number} Committed index
   */
  getCommittedIndex() {
    if (!this.isOpen()) {
      return 0;
    }
    const row = this.db.prepare(
      'SELECT value FROM _raft_state WHERE key = ?',
    ).get('committedIndex');
    return row ? parseInt(row.value, 10) : 0;
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
    this.db.prepare(
      'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)',
    ).run('committedIndex', String(index));
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
          stmt.run(
            entry.index,
            entry.term,
            JSON.stringify(entry.command),
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
      const entries = this.db.prepare(
        'SELECT log_index, term, command FROM _raft_log WHERE log_index >= ? ORDER BY log_index',
      ).all(startIndex);

      callback(null, entries.map((row) => ({
        index: row.log_index,
        term: row.term,
        command: JSON.parse(row.command),
      })));
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
        callback(null, {
          index: row.log_index,
          term: row.term,
          command: JSON.parse(row.command),
        });
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
      this.db.prepare('DELETE FROM _raft_log WHERE log_index >= ?').run(fromIndex);
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
      callback(null, 0);
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
      this.db.prepare('INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)')
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
    this.getState('currentTerm', (err, value) => {
      if (err) {
        callback(err);
      } else {
        callback(null, value ? parseInt(value, 10) : 0);
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
    this.setState('currentTerm', String(term), callback);
  }

  /**
   * Get votedFor.
   * Requirements: 4.2
   * @param {Function} callback - Callback with votedFor
   */
  getVotedFor(callback) {
    this.getState('votedFor', (err, value) => {
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
    this.setState('votedFor', candidateId || '', callback);
  }

  /**
   * Get commit index.
   * @param {Function} callback - Callback with commit index
   */
  getCommitIndex(callback) {
    this.getState('commitIndex', (err, value) => {
      if (err) {
        callback(err);
      } else {
        callback(null, value ? parseInt(value, 10) : 0);
      }
    });
  }

  /**
   * Set commit index.
   * @param {number} index - Commit index to set
   * @param {Function} callback - Completion callback
   */
  setCommitIndex(index, callback) {
    this.setState('commitIndex', String(index), callback);
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
