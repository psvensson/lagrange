/**
 * InMemoryLogAdapter - In-memory log storage for liferaft.
 * Used by MessageGroupService for ephemeral message routing state.
 * Implements the same interface as liferaft's Log class.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */


/**
 * Number of committed entries to retain after compaction.
 * Keeps a window for slow followers to catch up via getEntriesAfter.
 * @type {number}
 */
const IN_MEMORY_LOG_COMPACTION_RETENTION = 1000;

/**
 * In-memory log adapter for liferaft.
 * Implements the liferaft Log interface with async methods.
 */
class InMemoryLogAdapter {
  /**
   * Create a new in-memory log adapter.
   * @param {Object} node - The raft node using this log
   * @param {Object} _options - Options (unused for in-memory)
   */
  constructor(node, _options = {}) {
    this.node = node;
    this.entries = new Map(); // index -> entry
    this.committedIndex = 0;
    this.lastIndex = 0;
  }

  /**
   * Save a command to the log.
   * @param {Object} command - Command to save
   * @param {number} term - Term to save with
   * @param {number} [index] - Index to save at (optional, auto-increments)
   * @return {Promise<Object>} The saved entry
   */
  async saveCommand(command, term, index) {
    if (!index) {
      const {index: lastIndex} = await this.getLastInfo();
      index = lastIndex + 1;
    }

    const entry = {
      term,
      index,
      committed: false,
      responses: [{
        address: this.node.address,
        ack: true,
      }],
      command,
    };

    this.entries.set(index, entry);
    if (index > this.lastIndex) {
      this.lastIndex = index;
    }

    return entry;
  }

  /**
   * Get the last entry info.
   * @return {Promise<Object>} {index, term, committedIndex}
   */
  async getLastInfo() {
    const entry = await this.getLastEntry();
    return {
      index: entry.index,
      term: entry.term,
      committedIndex: this.committedIndex,
    };
  }

  /**
   * Get the last entry.
   * @return {Promise<Object>} Last entry or default
   */
  async getLastEntry() {
    // CL-042: an EMPTY log has last-log-term 0 by Raft definition (§5.4.1). Returning the node's
    // election term here masquerades an empty log as up-to-date, letting an empty-log candidate
    // that bumped its term out-rank a voter holding committed entries (Leader-Completeness
    // violation → committed-log divergence). Use 0 so the up-to-date comparison is correct on both
    // sides (an empty candidate never out-ranks a log-bearing voter; an empty voter still grants).
    if (this.lastIndex === 0) {
      return {
        index: 0,
        term: 0,
      };
    }
    return this.entries.get(this.lastIndex) || {
      index: 0,
      term: 0,
    };
  }

  /**
   * Check if an entry exists at index.
   * @param {number} index - Index to check
   * @return {Promise<boolean>} True if exists
   */
  async has(index) {
    return this.entries.has(index);
  }

  /**
   * Get an entry at index.
   * @param {number} index - Index to get
   * @return {Promise<Object|null>} Entry at index or null if missing
   */
  async get(index) {
    return this.entries.get(index) || null;
  }

  /**
   * Remove all entries after index.
   * @param {number} index - Index to remove after
   * @return {Promise<void>}
   */
  async removeEntriesAfter(index) {
    for (const [key] of this.entries) {
      if (key > index) {
        this.entries.delete(key);
      }
    }
    // Update lastIndex
    this.lastIndex = 0;
    for (const [key] of this.entries) {
      if (key > this.lastIndex) {
        this.lastIndex = key;
      }
    }
    // CL-042 hygiene: a truncation must not leave committedIndex above the surviving log tail,
    // else a truncated follower reports committedIndex > lastIndex (the seed-21 readout anomaly).
    // In correct raft operation the log is never truncated below the committed point (Leader
    // Completeness), so committedIndex <= lastIndex already holds and this clamp is a no-op on every
    // safe path; it only repairs the readout if a conflicting tail ever reaches below it.
    if (this.committedIndex > this.lastIndex) {
      this.committedIndex = this.lastIndex;
    }
  }

  /**
   * Get entries after index.
   * @param {number} index - Index to get after
   * @return {Promise<Array>} Entries after index
   */
  async getEntriesAfter(index) {
    const result = [];
    for (const [key, entry] of this.entries) {
      if (key > index) {
        result.push(entry);
      }
    }
    return result.sort((a, b) => a.index - b.index);
  }

  /**
   * Acknowledge a command from a follower.
   * @param {number} index - Index of entry
   * @param {string} address - Address of follower
   * @return {Promise<Object>} Updated entry
   */
  async commandAck(index, address) {
    const entry = await this.get(index);
    if (!entry) {
      return {responses: []};
    }

    const existingIndex = entry.responses.findIndex((r) => r.address === address);
    if (existingIndex === -1) {
      entry.responses.push({address, ack: true});
    }

    this.entries.set(index, entry);
    return entry;
  }

  /**
   * Get uncommitted entries up to index.
   * @param {number} index - Max index
   * @param {number} _term - Term (unused)
   * @return {Promise<Array>} Uncommitted entries
   */
  async getUncommittedEntriesUpToIndex(index, _term) {
    const result = [];
    for (const [key, entry] of this.entries) {
      if (key > this.committedIndex && key <= index && !entry.committed) {
        result.push(entry);
      }
    }
    return result.sort((a, b) => a.index - b.index);
  }

  /**
   * Get entry info before a given entry.
   * @param {Object} entry - Entry to get before
   * @return {Promise<Object>} {index, term, committedIndex}
   */
  async getEntryInfoBefore(entry) {
    const prevEntry = await this.getEntryBefore(entry);
    return {
      index: prevEntry.index,
      term: prevEntry.term,
      committedIndex: this.committedIndex,
    };
  }

  /**
   * Get entry before a given entry.
   * @param {Object} entry - Entry to get before
   * @return {Promise<Object>} Previous entry or default
   */
  async getEntryBefore(entry) {
    const defaultInfo = {
      index: 0,
      term: this.node ? this.node.term : 0,
    };

    if (!entry || entry.index <= 1) {
      return defaultInfo;
    }

    // Find the entry just before this one
    let prevEntry = null;
    for (const [key, e] of this.entries) {
      if (key < entry.index && (!prevEntry || key > prevEntry.index)) {
        prevEntry = e;
      }
    }

    return prevEntry || defaultInfo;
  }

  /**
   * Commit an entry.
   * @param {number} index - Index to commit
   * @return {Promise<Object>} Committed entry
   */
  async commit(index) {
    const entry = await this.get(index);
    if (!entry) {
      return {
        index,
        term: this.node ? this.node.term : 0,
        committed: false,
      };
    }
    entry.committed = true;
    this.committedIndex = index;
    this.entries.set(index, entry);
    this.compactCommittedEntries();
    return entry;
  }

  /**
   * Remove committed entries older than the retention window.
   * Keeps the most recent IN_MEMORY_LOG_COMPACTION_RETENTION entries
   * so slow followers can still catch up via getEntriesAfter.
   * @private
   */
  compactCommittedEntries() {
    if (this.entries.size <= IN_MEMORY_LOG_COMPACTION_RETENTION) {
      return;
    }
    const cutoff =
      this.committedIndex - IN_MEMORY_LOG_COMPACTION_RETENTION;
    if (cutoff <= 0) {
      return;
    }
    for (const key of this.entries.keys()) {
      if (key <= cutoff) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * End the log (cleanup).
   * @return {boolean} Success
   */
  end() {
    this.entries.clear();
    this.lastIndex = 0;
    this.committedIndex = 0;
    return true;
  }

  /**
   * Reset all state (for testing).
   */
  reset() {
    this.entries.clear();
    this.lastIndex = 0;
    this.committedIndex = 0;
  }
}

export {InMemoryLogAdapter, IN_MEMORY_LOG_COMPACTION_RETENTION};
