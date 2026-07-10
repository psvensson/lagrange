/**
 * Callback-oriented liferaft compatibility methods for SQLiteLogAdapter.
 * Log mutations remain owned by sqlite-log-adapter.js; this module contains
 * read-only log queries and _raft_state compatibility accessors only.
 */

const SQLITE_RAFT_STATE_UPSERT_SQL =
  'INSERT INTO _raft_state (key, value) VALUES (?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET value = excluded.value';
const SQLITE_RAFT_STATE_KEY = Object.freeze({
  COMMITTED_INDEX: 'committedIndex',
  CURRENT_TERM: 'currentTerm',
  LEGACY_COMMIT_INDEX: 'commitIndex',
  VOTED_FOR: 'votedFor',
});

const sqliteLogAdapterCallbackMethods = {
  /**
   * Get entries from a starting index.
   * @param {number} startIndex - Starting index.
   * @param {Function} callback - Callback with entries.
   * @return {void}
   */
  getEntriesFrom(startIndex, callback) {
    if (!this.isOpen()) {
      callback(null, []);
      return;
    }
    try {
      const committedIndex = this.getCommittedIndex();
      const entries = this.db.prepare(
        'SELECT log_index, term, command FROM _raft_log ' +
        'WHERE log_index >= ? ORDER BY log_index',
      ).all(startIndex);

      callback(
        null,
        entries.map((row) => this.readEntryRow(row, committedIndex)),
      );
    } catch (error) {
      callback(error);
    }
  },

  /**
   * Get the last log entry.
   * @param {Function} callback - Callback with entry.
   * @return {void}
   */
  getLastEntryCallback(callback) {
    if (!this.isOpen()) {
      callback(null, null);
      return;
    }
    try {
      const row = this.db.prepare(
        'SELECT log_index, term, command FROM _raft_log ' +
        'ORDER BY log_index DESC LIMIT 1',
      ).get();

      callback(null, row ? this.readEntryRow(row) : null);
    } catch (error) {
      callback(error);
    }
  },

  /**
   * Get log length.
   * @param {Function} callback - Callback with length.
   * @return {void}
   */
  getLength(callback) {
    if (!this.isOpen()) {
      callback(null, 0);
      return;
    }
    try {
      const row = this.db.prepare(
        'SELECT COUNT(*) as count FROM _raft_log',
      ).get();
      callback(null, row.count);
    } catch (error) {
      callback(error);
    }
  },

  /**
   * Get persistent Raft state.
   * @param {string} key - State key.
   * @param {Function} callback - Callback with value.
   * @return {void}
   */
  getState(key, callback) {
    if (!this.isOpen()) {
      callback(null, null);
      return;
    }
    try {
      callback(null, this.resolveStateValue(key));
    } catch (error) {
      callback(error);
    }
  },

  isCommittedIndexStateKey(key) {
    return key === SQLITE_RAFT_STATE_KEY.COMMITTED_INDEX ||
      key === SQLITE_RAFT_STATE_KEY.LEGACY_COMMIT_INDEX;
  },

  readPersistentStateValue(key) {
    const row = this.db.prepare(
      'SELECT value FROM _raft_state WHERE key = ?',
    ).get(key);
    return row ? row.value : null;
  },

  resolveStateValue(key) {
    return this.isCommittedIndexStateKey(key) ?
      String(this.refreshCommittedIndexCacheFromStore()) :
      this.readPersistentStateValue(key);
  },

  persistStateValue(key, value) {
    this.db.prepare(SQLITE_RAFT_STATE_UPSERT_SQL).run(key, value);
  },

  /**
   * Set persistent Raft state.
   * @param {string} key - State key.
   * @param {string} value - State value.
   * @param {Function} callback - Completion callback.
   * @return {void}
   */
  setState(key, value, callback) {
    if (!this.isOpen()) {
      callback(null);
      return;
    }
    try {
      if (this.isCommittedIndexStateKey(key)) {
        this.setCommittedIndex(Number(value));
        callback(null);
        return;
      }
      this.persistStateValue(key, value);
      callback(null);
    } catch (error) {
      callback(error);
    }
  },

  getTerm(callback) {
    this.getState(SQLITE_RAFT_STATE_KEY.CURRENT_TERM, (error, value) => {
      if (error) {
        callback(error);
        return;
      }
      callback(null, value ? parseInt(value, 10) : 0);
    });
  },

  setTerm(term, callback) {
    this.setState(SQLITE_RAFT_STATE_KEY.CURRENT_TERM, String(term), callback);
  },

  getVotedFor(callback) {
    this.getState(SQLITE_RAFT_STATE_KEY.VOTED_FOR, (error, value) => {
      if (error) {
        callback(error);
        return;
      }
      callback(null, value || null);
    });
  },

  setVotedFor(candidateId, callback) {
    this.setState(
      SQLITE_RAFT_STATE_KEY.VOTED_FOR,
      candidateId || '',
      callback,
    );
  },

  getCommitIndex(callback) {
    this.getState(SQLITE_RAFT_STATE_KEY.COMMITTED_INDEX, (error, value) => {
      if (error) {
        callback(error);
        return;
      }
      callback(null, value ? parseInt(value, 10) : 0);
    });
  },

  setCommitIndex(index, callback) {
    this.setState(
      SQLITE_RAFT_STATE_KEY.COMMITTED_INDEX,
      String(index),
      callback,
    );
  },
};

/**
 * Install callback compatibility methods with class-method descriptors.
 * @param {Function} AdapterClass - SQLiteLogAdapter constructor.
 * @return {void}
 */
function installSQLiteLogAdapterCallbackApi(AdapterClass) {
  const descriptors = {};
  for (const [name, value] of Object.entries(
    sqliteLogAdapterCallbackMethods,
  )) {
    descriptors[name] = {
      configurable: true,
      enumerable: false,
      value,
      writable: true,
    };
  }
  Object.defineProperties(AdapterClass.prototype, descriptors);
}

export {
  installSQLiteLogAdapterCallbackApi,
  SQLITE_RAFT_STATE_KEY,
  SQLITE_RAFT_STATE_UPSERT_SQL,
};
