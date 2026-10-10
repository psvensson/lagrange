/**
 * Synchronous SQLite Raft-log query helpers.
 *
 * These are storage/snapshot queries owned by SQLiteLogAdapter. They are not
 * a consensus-backend adapter: callers read canonical durable log/boundary
 * state and no callback or provider contract is exposed.
 */

const sqliteLogAdapterQueryMethods = {
  /**
   * Get durable predecessor identity plus the current committed watermark.
   * @param {Object} entry - Entry whose predecessor is requested.
   * @return {Object} {index, term, committedIndex}
   */
  getEntryInfoBefore(entry) {
    const prevEntry = this.getEntryBefore(entry);
    return {
      index: prevEntry.index,
      term: prevEntry.term,
      committedIndex: this.getCommittedIndex(),
    };
  },

  /**
   * Get the durable entry immediately before a given entry. When the
   * predecessor was compacted, the snapshot boundary is its exact identity.
   * @param {Object} entry - Entry whose predecessor is requested.
   * @return {Object} Previous entry identity or the virgin-log identity.
   */
  getEntryBefore(entry) {
    const defaultInfo = {
      index: 0,
      term: this.node ? this.node.term : 0,
    };

    if (!entry || !Number.isFinite(entry?.index)) {
      return defaultInfo;
    }
    if (entry.index <= 1 || !this.isOpen()) {
      return defaultInfo;
    }

    const row = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log ' +
      'WHERE log_index < ? ORDER BY log_index DESC LIMIT 1',
    ).get(entry.index);

    if (!row) {
      const boundary = this.resolveBoundaryAfterRowMiss(entry.index - 1);
      if (boundary.lastIncludedIndex > 0 &&
          entry.index > boundary.lastIncludedIndex) {
        return {
          index: boundary.lastIncludedIndex,
          term: boundary.lastIncludedTerm,
        };
      }
      return defaultInfo;
    }

    return this.readEntryRow(row);
  },

  /**
   * Get all durable log entries after one index.
   * @param {number} index - Exclusive lower bound.
   * @return {Array} Entries after index.
   */
  getEntriesAfter(index) {
    if (!this.isOpen()) {
      return [];
    }
    const committedIndex = this.getCommittedIndex();
    const rows = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log ' +
      'WHERE log_index > ? ORDER BY log_index',
    ).all(index);

    return rows.map((row) => this.readEntryRow(row, committedIndex));
  },
};

function installSQLiteLogAdapterQueryApi(AdapterClass) {
  const descriptors = {};
  for (const [name, value] of Object.entries(sqliteLogAdapterQueryMethods)) {
    descriptors[name] = {
      configurable: true,
      enumerable: false,
      value,
      writable: true,
    };
  }
  Object.defineProperties(AdapterClass.prototype, descriptors);
}

export {installSQLiteLogAdapterQueryApi};
