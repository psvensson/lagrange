/**
 * Partition Raft Storage - SQLite-backed Raft log storage for partitions.
 * Extracted from partition-service.js for single responsibility.
 * Requirements: 6.1, 6.4, 6.6
 */

import {NUM} from '../constants/numbers.js';
import {STRING} from '../constants/strings.js';
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
   */
  constructor(db, partitionId) {
    this.db = db;
    this.partitionId = partitionId;
    this.currentTerm = NUM.ZERO;
    this.votedFor = null;
    this.commitIndex = NUM.ZERO;
    this.lastApplied = NUM.ZERO;

    // In-memory log for Raft entries
    this.log = [];

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

    // Create Raft log table
    this.db.exec(PARTITION_SERVICE_SQL.CREATE_RAFT_LOG_TABLE);

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

    // Load log entries
    const entries = this.db.prepare(
      PARTITION_SERVICE_SQL.SELECT_RAFT_LOGS,
    ).all();

    this.log = entries.map((row) => new PartitionRaftLogEntry(
      row.term,
      row.log_index,
      JSON.parse(row.command),
    ));

    if (this.log.length > NUM.ZERO) {
      this.commitIndex = this.log[this.log.length - NUM.ONE].index;
      this.lastApplied = this.commitIndex;
    }
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
    const index = this.log.length + NUM.ONE;
    const entry = new PartitionRaftLogEntry(this.currentTerm, index, data);
    this.log.push(entry);

    // Persist to SQLite - use INSERT OR REPLACE to handle edge cases gracefully
    this.db.prepare(
      PARTITION_SERVICE_SQL.UPSERT_RAFT_LOG,
    ).run(entry.index, entry.term, JSON.stringify(entry.data), entry.timestamp);

    return entry;
  }

  /**
   * Get entries from a starting index.
   * @param {number} startIndex - Starting index (1-based).
   * @return {Array<PartitionRaftLogEntry>} Log entries.
   */
  getEntriesFrom(startIndex) {
    if (startIndex < NUM.ONE) {
      return [...this.log];
    }
    return this.log.slice(startIndex - NUM.ONE);
  }

  /**
   * Get the last log entry.
   * @return {PartitionRaftLogEntry|null} Last entry or null.
   */
  getLastEntry() {
    return this.log.length > NUM.ZERO ? this.log[this.log.length - NUM.ONE] : null;
  }

  /**
   * Get entry at a specific index.
   * @param {number} index - Log index (1-based).
   * @return {PartitionRaftLogEntry|null} Entry or null.
   */
  getEntry(index) {
    if (index < NUM.ONE || index > this.log.length) {
      return null;
    }
    return this.log[index - NUM.ONE];
  }

  /**
   * Truncate log from a specific index.
   * Removes all entries from the given index onwards.
   * @param {number} fromIndex - Index to truncate from (1-based).
   */
  truncateFrom(fromIndex) {
    if (fromIndex >= NUM.ONE && fromIndex <= this.log.length) {
      this.log = this.log.slice(NUM.ZERO, fromIndex - NUM.ONE);

      // Truncate in SQLite
      this.db.prepare(PARTITION_SERVICE_SQL.DELETE_RAFT_LOG_FROM).run(fromIndex);
    }
  }

  /**
   * Get the log length.
   * @return {number} Number of entries.
   */
  getLogLength() {
    return this.log.length;
  }

  /**
   * Get the last log index.
   * @return {number} Last index or 0 if empty.
   */
  getLastIndex() {
    const lastEntry = this.getLastEntry();
    return lastEntry ? lastEntry.index : NUM.ZERO;
  }

  /**
   * Get the last log term.
   * @return {number} Last term or 0 if empty.
   */
  getLastTerm() {
    const lastEntry = this.getLastEntry();
    return lastEntry ? lastEntry.term : NUM.ZERO;
  }
}

export {
  PartitionRaftStorage,
  PartitionRaftLogEntry,
};
