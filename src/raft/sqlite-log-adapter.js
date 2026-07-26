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
  installSQLiteLogAdapterCallbackApi,
  SQLITE_RAFT_STATE_KEY,
  SQLITE_RAFT_STATE_UPSERT_SQL,
} from './sqlite-log-adapter-callback-api.js';

const LOCAL_STR_DATABASE_INSTANCE_IS_REQUIRED = 'Database instance is required';
const LOCAL_STR_LEGACY_RAFT_LOG_SCHEMA_DETECTED_MANUAL_M = 'Legacy raft log schema detected; manual migration required';
const LOCAL_STR_INSERT_OR_REPLACE_INTO_RAFT_LOG_LOG_INDE = 'INSERT OR REPLACE INTO _raft_log (log_index, term, command, timestamp) VALUES (?, ?, ?, ?)';
const LOCAL_STR_DELETE_FROM_RAFT_LOG_WHERE_LOG_INDEX = 'DELETE FROM _raft_log WHERE log_index >= ?';
const LOCAL_STR_UPDATE_RAFT_LOG_SET_COMMAND_WHERE_LOG_IN = 'UPDATE _raft_log SET command = ? WHERE log_index = ?';
const LOCAL_STR_1JYKG = 'DELETE FROM _raft_log WHERE log_index > ?';
const LOCAL_STR_DELETE_COMMITTED_PREFIX =
  'DELETE FROM _raft_log WHERE log_index <= ?';
const LOCAL_STR_COMMITTED_TRUNCATION_REFUSED =
  'Refused raft log truncation into the committed prefix ' +
  '(committed-entry-loss prevented)';

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
  constructor(db, node = null, logger = null) {
    if (!db) {
      throw new Error(LOCAL_STR_DATABASE_INSTANCE_IS_REQUIRED);
    }
    this.db = db;
    this.node = node;
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
   * Acknowledge a command from a follower.
   * Required by liferaft for quorum tracking.
   * Requirements: 12.2
   * @param {number} index - Index of entry
   * @param {string} address - Address of follower
   * @return {Object} Updated entry
   */
  commandAck(index, address) {
    // Follower-ack recency actuals for the durability-fitness successor
    // probe (CL-039: never shed leadership without a viable successor).
    // Self-acks are stamped at saveCommand, not here, so every commandAck
    // address is a genuine peer.
    const ackAddress = String(address || '').trim();
    if (ackAddress.length > 0 && ackAddress !== this.node?.address) {
      if (!this.lastFollowerAckAtByAddress) {
        this.lastFollowerAckAtByAddress = new Map();
      }
      this.lastFollowerAckAtByAddress.set(ackAddress, Date.now());
    }
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
    if (existingIndex === -1) {
      entry.responses.push({address, ack: true});
    }

    // Update in SQLite
    this.db.prepare(
      LOCAL_STR_UPDATE_RAFT_LOG_SET_COMMAND_WHERE_LOG_IN,
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
   * Required by liferaft for log consistency.
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
  // callback-api mixin (boundary-aware since raft-snapshot-atomic-install).

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
    // Raft-safety invariant (CL-040/041/042 class): committed entries are
    // permanent and MUST NEVER be truncated — deleting a committed entry
    // destroys agreed history and, cluster-wide across a quorum, is the
    // cardinal Raft safety violation. Base liferaft's conflict truncation
    // (index.js) calls this UNGUARDED; a truncation whose floor falls below
    // committedIndex therefore silently deleted committed entries and produced
    // the replica_operations-p1 log HOLE (committedIndex advanced to 228 while
    // entries 192-228 were deleted on a quorum), which froze the durable
    // watermark at the first gap and wedged the ledger leader forever.
    //
    // Clamp the deletion floor to committedIndex so only the UNCOMMITTED
    // conflicting suffix is ever removed. This is a NO-OP on the normal path
    // (a legitimate conflict is always above the committed prefix, so
    // index >= committedIndex and the clamp does nothing); it only bites the
    // anomalous case, where refusing to delete committed history is the correct
    // Raft response, not obeying it. truncateConflictingSameIndexTail already
    // guards its own call (liferaft.js), but the invariant belongs at the
    // adapter so EVERY caller — including base liferaft — is covered.
    if (!isValidRaftLogIndex(index)) {
      return;
    }
    const safeIndex = this.safeExclusiveTruncationIndex(index);
    this.db.prepare(LOCAL_STR_1JYKG).run(safeIndex);
  }

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
      atMs: Date.now(),
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

  safeExclusiveTruncationIndex(index) {
    const committedIndex = this.refreshCommittedIndexCacheFromStore();
    // A truncation aimed at or below the snapshot boundary is a legitimate,
    // expected consequence of has() answering compacted lineage — clamp it
    // silently instead of tripping the committed-truncation raft-safety
    // witness, which stays reserved for genuinely anomalous requests in
    // (boundary, committedIndex).
    const boundary = this.getSnapshotBoundary().lastIncludedIndex;
    if (index < committedIndex && index > boundary) {
      this.recordCommittedTruncationBlock(index, committedIndex);
    }
    return Math.max(index, committedIndex);
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
    // CL-018: liferaft reads committedIndex on every packet build; a
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
    if (!isValidRaftLogIndex(index)) {
      return;
    }
    // CL-018: the raft committedIndex is monotonic by definition. The
    // leader's commandAck calls this for EVERY ack — including catch-up
    // acks at OLD indexes, which used to REGRESS the persisted watermark
    // until the next head ack (CL-015 adjacent finding #2). Clamp here so
    // every caller is monotonic.
    const current = this.refreshCommittedIndexCacheFromStore();
    if (index <= current) {
      return;
    }
    this.db.prepare(
      SQLITE_RAFT_STATE_UPSERT_SQL,
    ).run(SQLITE_RAFT_STATE_KEY.COMMITTED_INDEX, String(index));
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
      const insertMany = this.db.transaction((entries) => {
        for (const entry of entries) {
          this.persistEntry(entry);
        }
      });

      insertMany(entries);
      callback(null);
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
      if (!isValidRaftLogIndex(fromIndex)) {
        callback(null);
        return;
      }
      const safeIndex = this.safeInclusiveTruncationIndex(fromIndex);
      this.db.prepare(LOCAL_STR_DELETE_FROM_RAFT_LOG_WHERE_LOG_INDEX)
        .run(safeIndex);
      callback(null);
    } catch (error) {
      callback(error);
    }
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

installSQLiteLogAdapterCallbackApi(SQLiteLogAdapter);
installSnapshotCompactionApi(SQLiteLogAdapter);

export {SQLiteLogAdapter};
