/**
 * SQLiteLogAdapter - SQLite-backed consensus log storage.
 * Used by PartitionService for durable data storage.
 * Implements the persistent log operations used by Lagrange consensus and snapshot owners.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 12.1, 12.2, 12.3, 12.4, 12.5
 */

import {
  isCanonicalLogEntryShape,
  normalizeLogEntry,
} from './sqlite-log-entry-shape.js';
import {STRING} from '../constants/strings.js';
import {
  COMMITTED_ENTRY_WRITE_OUTCOME,
  guardCommittedEntryWrite,
} from './committed-entry-guard.js';
import {isValidRaftLogIndex} from './log-index.js';
import {installSnapshotCompactionApi} from './snapshot-compaction.js';
import {
  isCompactedIndex,
  readSnapshotBoundary,
  VIRGIN_BOUNDARY,
} from './snapshot-boundary.js';
import {
  installSQLiteLogAdapterQueryApi,
} from './sqlite-log-adapter-query-api.js';
import {
  SQLITE_RAFT_STATE_KEY,
  SQLITE_RAFT_STATE_UPSERT_SQL,
} from './sqlite-raft-state-constants.js';


const LOCAL_STR_DATABASE_INSTANCE_IS_REQUIRED = 'Database instance is required';
const LOCAL_STR_LEGACY_RAFT_LOG_SCHEMA_DETECTED_MANUAL_M = 'Legacy raft log schema detected; manual migration required';
const LOCAL_STR_INSERT_OR_REPLACE_INTO_RAFT_LOG_LOG_INDE = 'INSERT OR REPLACE INTO _raft_log (log_index, term, command, timestamp) VALUES (?, ?, ?, ?)';
const LOCAL_STR_DELETE_FROM_RAFT_LOG_WHERE_LOG_INDEX = 'DELETE FROM _raft_log WHERE log_index >= ?';
const LOCAL_STR_UPDATE_RAFT_LOG_SET_COMMAND_WHERE_LOG_IN = 'UPDATE _raft_log SET command = ? WHERE log_index = ?';
const LOCAL_STR_DELETE_COMMITTED_PREFIX =
  'DELETE FROM _raft_log WHERE log_index <= ?';
const LOCAL_STR_COMMITTED_TRUNCATION_REFUSED =
  'Refused raft log truncation into the committed prefix ' +
  '(committed-entry-loss prevented)';
import {resolveTimeSource} from '../time/time-source.js';

/**
 * SQLite log adapter for consensus persistence.
 * Used by PartitionService for durable data storage.
 * Implements the consensus log interface with both sync and async methods.
 */
class SQLiteLogAdapter {
  /**
   * @param {Database} db - better-sqlite3 database instance
   * @param {Object} node - The raft node using this log (optional)
   */
  constructor(db, node = null, logger = null, timeSource = null) {
    if (!db) {
      throw new Error(LOCAL_STR_DATABASE_INSTANCE_IS_REQUIRED);
    }
    this.db = db;
    this.node = node;
    // The log belongs to one replica on one node, so its append and
    // acknowledgement stamps read that node's clock. Unsupplied, they read
    // the host clock exactly as before.
    this.timeSource = resolveTimeSource({timeSource});
    // Optional logger so the adapter can SURFACE a raft-safety-invariant breach
    // (a truncation reaching into the committed prefix) on the live path; the
    // adapter is constructed without one in reduced harnesses, so all logging
    // is best-effort and never load-bearing.
    this.logger = logger || node?.logger || null;
    // Observability for the committed-prefix truncation guard (below). Counters
    // are the DT-facing witness; the log line is the live-wedge witness.
    this.committedTruncationBlockedCount = 0;
    this.lastCommittedTruncationBlocked = null;
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
      throw new Error(LOCAL_STR_LEGACY_RAFT_LOG_SCHEMA_DETECTED_MANUAL_M);
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
   * Resolve one entry write against fresh durable committed state.
   * @param {Object} entry
   * @return {{guard: Object, normalizedEntry: Object}}
   * @private
   */
  resolveEntryWrite(entry) {
    const committedIndex = this.refreshCommittedIndexCacheFromStore();
    const normalizedEntry = this.normalizeEntry(entry, {
      index: entry?.index,
      term: entry?.term,
      committedIndex,
    });
    const existing = normalizedEntry.index <= committedIndex ?
      this.get(normalizedEntry.index) :
      null;
    // A committed-range row MISS re-anchors the boundary cache before the
    // guard decides (compacted row vs conflict — snapshot-compaction.js).
    const boundary = existing === null &&
      normalizedEntry.index <= committedIndex ?
      this.resolveBoundaryAfterRowMiss(normalizedEntry.index) :
      this.getSnapshotBoundary();
    const guard = guardCommittedEntryWrite(
      existing,
      normalizedEntry,
      committedIndex,
      boundary.lastIncludedIndex,
    );
    return {guard, normalizedEntry};
  }

  /**
   * Persist one entry using the canonical serialized shape.
   * @param {Object} entry
   * @return {Object}
   * @private
   */
  persistEntry(entry) {
    const {guard, normalizedEntry} = this.resolveEntryWrite(entry);
    if (guard.outcome === COMMITTED_ENTRY_WRITE_OUTCOME.IDEMPOTENT) {
      return guard.entry;
    }
    if (guard.outcome === COMMITTED_ENTRY_WRITE_OUTCOME.COMPACTED) {
      return normalizedEntry;
    }
    this.db.prepare(
      LOCAL_STR_INSERT_OR_REPLACE_INTO_RAFT_LOG_LOG_INDE,
    ).run(
      normalizedEntry.index,
      normalizedEntry.term,
      JSON.stringify(normalizedEntry),
      this.timeSource.now(),
    );
    return normalizedEntry;
  }

  // ============================================================
  // Consensus Log Interface Methods (sync versions)
  // Requirements: 12.2, 12.3, 12.4, 12.5
  // ============================================================

  /**
   * Get the last log entry info.
   * Required by consensus owners for log consistency checks.
   * Requirements: 12.2
   * @return {Object} {index, term, committedIndex}
   */
  getLastInfo() {
    // CL-042: an empty log's last-log-term is 0 by Raft definition (§5.4.1), not the node's
    // election term — masquerading it lets an empty-log candidate out-rank a voter holding
    // committed entries (Leader-Completeness violation → committed-log divergence). See the
    // in-memory adapter's getLastEntry for the full rationale. A COMPACTED-empty log is the
    // one exception: after a snapshot install the boundary keys are the exact last-log
    // identity, and answering {0,0} would grant votes to candidates behind the installed
    // state (quest raft-snapshot-atomic-install). Virgin logs keep the zero.
    if (!this.isOpen()) {
      return {
        index: 0,
        term: 0,
        committedIndex: this.getCommittedIndex(),
      };
    }
    const row = this.db.prepare(
      'SELECT log_index, term FROM _raft_log ORDER BY log_index DESC LIMIT 1',
    ).get();

    if (!row) {
      const boundary = this.resolveBoundaryAfterLogEmpty();
      return {
        index: boundary.lastIncludedIndex,
        term: boundary.lastIncludedTerm,
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
   * Compacted-log boundary recorded by a snapshot install ({0,0} for a
   * virgin log). Cached per instance: the boundary only ever changes at the
   * closed-handle install transition, which no live adapter survives.
   * @return {{lastIncludedIndex: number, lastIncludedTerm: number}}
   */
  getSnapshotBoundary() {
    if (!this._snapshotBoundaryCache) {
      this._snapshotBoundaryCache = this.isOpen() ?
        readSnapshotBoundary(this.db) : VIRGIN_BOUNDARY;
    }
    return this._snapshotBoundaryCache;
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
    return this.persistEntry(entry);
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
    if (!isValidRaftLogIndex(index)) {
      return;
    }
    const safeIndex = this.safeInclusiveTruncationIndex(index);
    this.db.prepare(LOCAL_STR_DELETE_FROM_RAFT_LOG_WHERE_LOG_INDEX)
      .run(safeIndex);
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
   * Required by consensus owners for log consistency checks.
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
    if (row) {
      return true;
    }
    // A compacted index is known-present lineage (durably applied inside the
    // installed snapshot) even though its bytes are gone; has(0) stays false.
    // The miss path re-anchors the boundary cache against durable state
    // (live compaction is the second boundary writer — snapshot-compaction.js).
    return isCompactedIndex(index, this.resolveBoundaryAfterRowMiss(index));
  }

  /**
   * Save a command to the log.
   * Required by consensus owners for command replication.
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
      command,
    };

    // Store in SQLite (only if database is open)
    return this.isOpen() ? this.persistEntry(entry) : entry;
  }

  /**
   * Declared commit intent (stamped before persist guards) — the in-memory
   * side of the durability-fitness divergence witness.
   * @return {number}
   */
  getLastDeclaredCommitIndex() {
    return this.lastDeclaredCommitIndex || 0;
  }

  /**
   * Re-anchor the in-memory committed-index cache to DURABLE state. A swept
   * transaction rollback evaporates watermark writes that the monotonic
   * cache still remembers (verifier finding Z1) — without this refresh every
   * post-heal catch-up commit is clamped and the durable watermark never
   * advances again.
   * @return {number} The durable committed index the cache now reflects.
   */
  refreshCommittedIndexCacheFromStore() {
    this._committedIndexCache = undefined;
    return this.getCommittedIndex();
  }

  /**
   * Commit an entry.
   * Required by consensus owners for commit processing.
   * Requirements: 12.2
   * @param {number} index - Index to commit
   * @return {Object} Committed entry
   */
  commit(index) {
    // Durability-fitness witness (quest formation-ledger-leader-local-
    // persistence-wedge): the DECLARED commit intent is stamped before any
    // isOpen/persist guard, so a silently-closed or transaction-wedged
    // adapter still shows intent diverging from the durable watermark.
    if (
      Number.isFinite(index) &&
      index > (this.lastDeclaredCommitIndex || 0)
    ) {
      this.lastDeclaredCommitIndex = index;
    }
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
      LOCAL_STR_UPDATE_RAFT_LOG_SET_COMMAND_WHERE_LOG_IN,
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
   * Required by consensus owners for log consistency.
   * Requirements: 12.2
   * @return {Object} Last entry or default
   */
  getLastEntry() {
    // CL-042: an empty log's last-log-term is 0 (§5.4.1), not the node's election term.
    // Compacted-empty logs answer from the snapshot boundary (see getLastInfo).
    if (!this.isOpen()) {
      return {
        index: 0,
        term: 0,
      };
    }
    const row = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log ORDER BY log_index DESC LIMIT 1',
    ).get();

    if (!row) {
      const boundary = this.resolveBoundaryAfterLogEmpty();
      return {
        index: boundary.lastIncludedIndex,
        term: boundary.lastIncludedTerm,
      };
    }

    return this.readEntryRow(row);
  }

  // getEntryInfoBefore / getEntryBefore / getEntriesAfter live in the
  // query-api mixin (boundary-aware since raft-snapshot-atomic-install).

  // compactCommittedEntries (the S5 proof-gated decision table — the
  // proofless call keeps the frozen refusal), refreshSnapshotBoundaryFromStore
  // and the resolveBoundaryAfter* row-miss discipline live in the
  // snapshot-compaction.js prototype mixin.

  /**
   * Physically delete the log rows at or below `toIndex`. ONLY the S5
   * proof-gated compaction transaction (snapshot-compaction.js) may call
   * this, AFTER its full decision table approved the removal and inside the
   * same transaction that advances the boundary keys. The SQL lives here so
   * the adapter stays the single _raft_log mutation owner (the
   * raft-log-write-owner guard).
   * @param {number} toIndex inclusive deletion ceiling
   * @return {number} deleted row count
   */
  deleteCommittedPrefixRows(toIndex) {
    return this.db.prepare(LOCAL_STR_DELETE_COMMITTED_PREFIX)
      .run(toIndex).changes;
  }

  recordCommittedTruncationBlock(requestedIndex, committedIndex) {
    this.committedTruncationBlockedCount += 1;
    this.lastCommittedTruncationBlocked = {
      requestedIndex,
      committedIndex,
      atMs: this.timeSource.now(),
    };
    if (this.logger && typeof this.logger.error === 'function') {
      this.logger.error(
        LOCAL_STR_COMMITTED_TRUNCATION_REFUSED,
        {
          requestedIndex,
          committedIndex,
          address: this.node ? this.node.address : STRING.UNKNOWN,
        },
      );
    }
  }

  safeInclusiveTruncationIndex(index) {
    const committedIndex = this.refreshCommittedIndexCacheFromStore();
    const boundary = this.getSnapshotBoundary().lastIncludedIndex;
    if (index <= committedIndex && index > boundary) {
      this.recordCommittedTruncationBlock(index, committedIndex);
    }
    return Math.max(index, committedIndex + 1);
  }

  /**
   * Get the committed index.
   * @return {number} Committed index
   */
  getCommittedIndex() {
    if (!this.isOpen()) {
      return 0;
    }
    // CL-018: consensus callers read committedIndex frequently; a
    // sqlite SELECT per read is measurable on a saturated seed. The
    // SQLiteLogAdapter is the only writer class, but more than one facade can
    // hold an adapter over the same database. Mutation paths refresh this
    // cache from durable state before making a safety decision.
    if (Number.isFinite(this._committedIndexCache)) {
      return this._committedIndexCache;
    }
    const row = this.db.prepare(
      'SELECT value FROM _raft_state WHERE key = ?',
    ).get('committedIndex');
    const value = row ? parseInt(row.value, 10) : 0;
    this._committedIndexCache = value;
    return value;
  }

  /**
   * Consensus compatibility callers read committedIndex as a log-adapter property.
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
    if (!isValidRaftLogIndex(index)) {
      return;
    }
    // CL-018: the raft committedIndex is monotonic by definition. The
    // Stale callers can still present an older observed index after a newer
    // durable commit. Clamp here so every caller is monotonic.
    const current = this.refreshCommittedIndexCacheFromStore();
    if (index <= current) {
      return;
    }
    this.db.prepare(
      SQLITE_RAFT_STATE_UPSERT_SQL,
    ).run(SQLITE_RAFT_STATE_KEY.COMMITTED_INDEX, String(index));
    this._committedIndexCache = index;
  }
}

installSQLiteLogAdapterQueryApi(SQLiteLogAdapter);
installSnapshotCompactionApi(SQLiteLogAdapter);

export {SQLiteLogAdapter};
