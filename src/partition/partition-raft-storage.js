/**
 * Partition Raft Storage - SQLite-backed Raft log storage for partitions.
 * Extracted from partition-service.js for single responsibility.
 * Requirements: 6.1, 6.4, 6.6
 */

import {NUM} from '../constants/numbers.js';
import {STRING} from '../constants/strings.js';
import {SQLiteLogAdapter} from '../raft/sqlite-log-adapter.js';
import {isValidRaftLogIndex} from '../raft/log-index.js';
import {
  PARTITION_SERVICE_SQL,
  PARTITION_SERVICE_STATE_KEY,
} from './partition-service-constants.js';

/**
 * Raft log entry for partition operations.
 */
class PartitionRaftLogEntry {
  /**
   * Create a new Raft log entry.
   * @param {number} term - Raft term.
   * @param {number} index - Log index.
   * @param {Object} data - Entry data.
   */
  constructor(term, index, data) {
    this.term = term;
    this.index = index;
    this.data = data;
    this.timestamp = Date.now();
  }
}

/**
 * SQLite-backed Raft storage for partitions.
 * Handles Raft log persistence and state management.
 *
 * Responsibilities:
 * - Raft log initialization and table creation
 * - Log entry storage and retrieval
 * - Term and votedFor state persistence
 * - Log truncation for conflict resolution
 *
 * @class
 */
class PartitionRaftStorage {
  /**
   * Create a new Raft storage instance.
   * @param {Database} db - SQLite database instance.
   * @param {string} partitionId - Partition ID.
   * @param {SQLiteLogAdapter|null} logAdapter - Canonical Raft log owner.
   */
  constructor(db, partitionId, logAdapter = null) {
    this.db = db;
    this.partitionId = partitionId;
    this.logAdapter = logAdapter || new SQLiteLogAdapter(db);
    this.currentTerm = 0;
    this.votedFor = null;

    this.initializeRaftTables();
  }

  /**
   * Initialize Raft metadata tables.
   * Creates _raft_state and _raft_log tables if they don't exist.
   * @private
   */
  initializeRaftTables() {
    // Create Raft state table
    this.db.exec(PARTITION_SERVICE_SQL.CREATE_RAFT_STATE_TABLE);
    this.db.exec(PARTITION_SERVICE_SQL.CREATE_TRANSACTION_OUTCOME_TABLE);

    // Load persisted state
    this.loadPersistedState();
  }

  /**
   * Load persisted Raft state from SQLite.
   * Restores currentTerm, votedFor, and log entries.
   * @private
   */
  loadPersistedState() {
    const termRow = this.db.prepare(
      PARTITION_SERVICE_SQL.SELECT_RAFT_STATE_VALUE,
    ).get(PARTITION_SERVICE_STATE_KEY.CURRENT_TERM);
    if (termRow) {
      this.currentTerm = parseInt(termRow.value, NUM.TEN);
    }

    const votedRow = this.db.prepare(
      PARTITION_SERVICE_SQL.SELECT_RAFT_STATE_VALUE,
    ).get(PARTITION_SERVICE_STATE_KEY.VOTED_FOR);
    if (votedRow) {
      this.votedFor = votedRow.value;
    }
  }

  get commitIndex() {
    return this.logAdapter.refreshCommittedIndexCacheFromStore();
  }

  get lastApplied() {
    return this.logAdapter.refreshCommittedIndexCacheFromStore();
  }

  /**
   * Persist current term to SQLite.
   */
  persistTerm() {
    this.db.prepare(
      PARTITION_SERVICE_SQL.UPSERT_RAFT_STATE,
    ).run(PARTITION_SERVICE_STATE_KEY.CURRENT_TERM, String(this.currentTerm));
  }

  /**
   * Persist voted for to SQLite.
   */
  persistVotedFor() {
    this.db.prepare(
      PARTITION_SERVICE_SQL.UPSERT_RAFT_STATE,
    ).run(PARTITION_SERVICE_STATE_KEY.VOTED_FOR, this.votedFor || STRING.EMPTY);
  }

  /**
   * Append an entry to the log.
   * @param {Object} data - Entry data.
   * @return {PartitionRaftLogEntry} The appended entry.
   */
  appendEntry(data) {
    return this.toPartitionEntry(
      this.logAdapter.saveCommand(data, this.currentTerm),
    );
  }

  /**
   * Get entries from a starting index.
   * @param {number} startIndex - Starting index (1-based).
   * @return {Array<PartitionRaftLogEntry>} Log entries.
   */
  getEntriesFrom(startIndex) {
    const previousIndex = startIndex < 1 ? 0 : startIndex - 1;
    return this.logAdapter.getEntriesAfter(previousIndex)
      .map((entry) => this.toPartitionEntry(entry));
  }

  /**
   * Get the last log entry.
   * @return {PartitionRaftLogEntry|null} Last entry or null.
   */
  getLastEntry() {
    const lastInfo = this.logAdapter.getLastInfo();
    return lastInfo.index > 0 ?
      this.toPartitionEntry(this.logAdapter.get(lastInfo.index)) :
      null;
  }

  /**
   * Get entry at a specific index.
   * @param {number} index - Log index (1-based).
   * @return {PartitionRaftLogEntry|null} Entry or null.
   */
  getEntry(index) {
    return index < 1 ? null : this.toPartitionEntry(this.logAdapter.get(index));
  }

  /**
   * Truncate log from a specific index.
   * Removes all entries from the given index onwards.
   * @param {number} fromIndex - Index to truncate from (1-based).
   */
  truncateFrom(fromIndex) {
    if (isValidRaftLogIndex(fromIndex) &&
        fromIndex >= 1 && fromIndex <= this.getLastIndex()) {
      this.logAdapter.removeFrom(fromIndex);
    }
  }

  /**
   * Get the log length.
   * @return {number} Number of entries.
   */
  getLogLength() {
    return this.logAdapter.getEntriesAfter(0).length;
  }

  /**
   * Get the last log index.
   * @return {number} Last index or 0 if empty.
   */
  getLastIndex() {
    const lastEntry = this.getLastEntry();
    return lastEntry ? lastEntry.index : 0;
  }

  /**
   * Get the last log term.
   * @return {number} Last term or 0 if empty.
   */
  getLastTerm() {
    const lastEntry = this.getLastEntry();
    return lastEntry ? lastEntry.term : 0;
  }

  /**
   * Convert the canonical SQLite adapter entry into the legacy partition API.
   * The partition facade owns no independent index, term, or command state.
   * @param {Object|null} entry - Canonical Raft log entry.
   * @return {PartitionRaftLogEntry|null} Partition-facing entry.
   * @private
   */
  toPartitionEntry(entry) {
    return entry ?
      new PartitionRaftLogEntry(entry.term, entry.index, entry.command) :
      null;
  }
}

export {
  PartitionRaftStorage,
  PartitionRaftLogEntry,
};
