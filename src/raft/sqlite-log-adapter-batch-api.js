function recoverCommittedIndex(adapter) {
  adapter.refreshCommittedIndexCacheFromStore();
}

/**
 * Install the SQLite-only batch operations consumed by the Lagrange Liferaft
 * wrapper. Keeping them on the adapter preserves its single-writer ownership
 * of _raft_log and _raft_state.
 * @param {Function} SQLiteLogAdapter
 */
function installSQLiteLogAdapterBatchApi(SQLiteLogAdapter) {
  SQLiteLogAdapter.prototype.saveCommands = function(entries) {
    if (!this.isOpen()) {
      return entries.map((entry) =>
        this.saveCommand(entry.command, entry.term, entry.index),
      );
    }
    const saveAll = this.db.transaction((batch) => batch.map((entry) =>
      this.saveCommand(entry.command, entry.term, entry.index),
    ));
    try {
      return saveAll(entries);
    } catch (error) {
      recoverCommittedIndex(this);
      throw error;
    }
  };

  SQLiteLogAdapter.prototype.commitAndApplySlice = function(
    entries,
    options,
  ) {
    if (!this.isOpen()) {
      return [];
    }
    const commitAndApply = this.db.transaction((batch) => {
      const applied = [];
      const startedAtMs = options.now();
      for (const entry of batch) {
        if (applied.length >= options.maxEntries) {
          break;
        }
        const committed = this.commit(entry.index);
        if (!committed) {
          throw new Error(`Cannot commit missing raft entry ${entry.index}`);
        }
        options.apply(committed.command);
        applied.push(committed);
        if (options.now() - startedAtMs >= options.budgetMs) {
          break;
        }
      }
      return applied;
    });
    try {
      return commitAndApply(entries);
    } catch (error) {
      recoverCommittedIndex(this);
      throw error;
    }
  };
}

export {installSQLiteLogAdapterBatchApi};
