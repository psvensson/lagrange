/**
 * Partition Raft Storage - SQLite-backed Raft log storage for partitions.
 * Extracted from partition-service.js for single responsibility.
 * Requirements: 6.1, 6.4, 6.6
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM } from '../constants/numbers.js';
import { STRING } from '../constants/strings.js';
import { PARTITION_SERVICE_SQL, PARTITION_SERVICE_STATE_KEY } from './partition-service-constants.js';

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
    if (stryMutAct_9fa48("100850")) {
      {}
    } else {
      stryCov_9fa48("100850");
      this.term = term;
      this.index = index;
      this.data = data;
      this.timestamp = Date.now();
    }
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
    if (stryMutAct_9fa48("100851")) {
      {}
    } else {
      stryCov_9fa48("100851");
      this.db = db;
      this.partitionId = partitionId;
      this.currentTerm = NUM.ZERO;
      this.votedFor = null;
      this.commitIndex = NUM.ZERO;
      this.lastApplied = NUM.ZERO;

      // In-memory log for Raft entries
      this.log = stryMutAct_9fa48("100852") ? ["Stryker was here"] : (stryCov_9fa48("100852"), []);
      this.initializeRaftTables();
    }
  }

  /**
   * Initialize Raft metadata tables.
   * Creates _raft_state and _raft_log tables if they don't exist.
   * @private
   */
  initializeRaftTables() {
    if (stryMutAct_9fa48("100853")) {
      {}
    } else {
      stryCov_9fa48("100853");
      // Create Raft state table
      this.db.exec(PARTITION_SERVICE_SQL.CREATE_RAFT_STATE_TABLE);

      // Create Raft log table
      this.db.exec(PARTITION_SERVICE_SQL.CREATE_RAFT_LOG_TABLE);

      // Load persisted state
      this.loadPersistedState();
    }
  }

  /**
   * Load persisted Raft state from SQLite.
   * Restores currentTerm, votedFor, and log entries.
   * @private
   */
  loadPersistedState() {
    if (stryMutAct_9fa48("100854")) {
      {}
    } else {
      stryCov_9fa48("100854");
      const termRow = this.db.prepare(PARTITION_SERVICE_SQL.SELECT_RAFT_STATE_VALUE).get(PARTITION_SERVICE_STATE_KEY.CURRENT_TERM);
      if (stryMutAct_9fa48("100856") ? false : stryMutAct_9fa48("100855") ? true : (stryCov_9fa48("100855", "100856"), termRow)) {
        if (stryMutAct_9fa48("100857")) {
          {}
        } else {
          stryCov_9fa48("100857");
          this.currentTerm = parseInt(termRow.value, NUM.TEN);
        }
      }
      const votedRow = this.db.prepare(PARTITION_SERVICE_SQL.SELECT_RAFT_STATE_VALUE).get(PARTITION_SERVICE_STATE_KEY.VOTED_FOR);
      if (stryMutAct_9fa48("100859") ? false : stryMutAct_9fa48("100858") ? true : (stryCov_9fa48("100858", "100859"), votedRow)) {
        if (stryMutAct_9fa48("100860")) {
          {}
        } else {
          stryCov_9fa48("100860");
          this.votedFor = votedRow.value;
        }
      }

      // Load log entries
      const entries = this.db.prepare(PARTITION_SERVICE_SQL.SELECT_RAFT_LOGS).all();
      this.log = entries.map(stryMutAct_9fa48("100861") ? () => undefined : (stryCov_9fa48("100861"), row => new PartitionRaftLogEntry(row.term, row.log_index, JSON.parse(row.command))));
      if (stryMutAct_9fa48("100865") ? this.log.length <= NUM.ZERO : stryMutAct_9fa48("100864") ? this.log.length >= NUM.ZERO : stryMutAct_9fa48("100863") ? false : stryMutAct_9fa48("100862") ? true : (stryCov_9fa48("100862", "100863", "100864", "100865"), this.log.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("100866")) {
          {}
        } else {
          stryCov_9fa48("100866");
          this.commitIndex = this.log[stryMutAct_9fa48("100867") ? this.log.length + NUM.ONE : (stryCov_9fa48("100867"), this.log.length - NUM.ONE)].index;
          this.lastApplied = this.commitIndex;
        }
      }
    }
  }

  /**
   * Persist current term to SQLite.
   */
  persistTerm() {
    if (stryMutAct_9fa48("100868")) {
      {}
    } else {
      stryCov_9fa48("100868");
      this.db.prepare(PARTITION_SERVICE_SQL.UPSERT_RAFT_STATE).run(PARTITION_SERVICE_STATE_KEY.CURRENT_TERM, String(this.currentTerm));
    }
  }

  /**
   * Persist voted for to SQLite.
   */
  persistVotedFor() {
    if (stryMutAct_9fa48("100869")) {
      {}
    } else {
      stryCov_9fa48("100869");
      this.db.prepare(PARTITION_SERVICE_SQL.UPSERT_RAFT_STATE).run(PARTITION_SERVICE_STATE_KEY.VOTED_FOR, stryMutAct_9fa48("100872") ? this.votedFor && STRING.EMPTY : stryMutAct_9fa48("100871") ? false : stryMutAct_9fa48("100870") ? true : (stryCov_9fa48("100870", "100871", "100872"), this.votedFor || STRING.EMPTY));
    }
  }

  /**
   * Append an entry to the log.
   * @param {Object} data - Entry data.
   * @return {PartitionRaftLogEntry} The appended entry.
   */
  appendEntry(data) {
    if (stryMutAct_9fa48("100873")) {
      {}
    } else {
      stryCov_9fa48("100873");
      const index = stryMutAct_9fa48("100874") ? this.log.length - NUM.ONE : (stryCov_9fa48("100874"), this.log.length + NUM.ONE);
      const entry = new PartitionRaftLogEntry(this.currentTerm, index, data);
      this.log.push(entry);

      // Persist to SQLite - use INSERT OR REPLACE to handle edge cases gracefully
      this.db.prepare(PARTITION_SERVICE_SQL.UPSERT_RAFT_LOG).run(entry.index, entry.term, JSON.stringify(entry.data), entry.timestamp);
      return entry;
    }
  }

  /**
   * Get entries from a starting index.
   * @param {number} startIndex - Starting index (1-based).
   * @return {Array<PartitionRaftLogEntry>} Log entries.
   */
  getEntriesFrom(startIndex) {
    if (stryMutAct_9fa48("100875")) {
      {}
    } else {
      stryCov_9fa48("100875");
      if (stryMutAct_9fa48("100879") ? startIndex >= NUM.ONE : stryMutAct_9fa48("100878") ? startIndex <= NUM.ONE : stryMutAct_9fa48("100877") ? false : stryMutAct_9fa48("100876") ? true : (stryCov_9fa48("100876", "100877", "100878", "100879"), startIndex < NUM.ONE)) {
        if (stryMutAct_9fa48("100880")) {
          {}
        } else {
          stryCov_9fa48("100880");
          return stryMutAct_9fa48("100881") ? [] : (stryCov_9fa48("100881"), [...this.log]);
        }
      }
      return stryMutAct_9fa48("100882") ? this.log : (stryCov_9fa48("100882"), this.log.slice(stryMutAct_9fa48("100883") ? startIndex + NUM.ONE : (stryCov_9fa48("100883"), startIndex - NUM.ONE)));
    }
  }

  /**
   * Get the last log entry.
   * @return {PartitionRaftLogEntry|null} Last entry or null.
   */
  getLastEntry() {
    if (stryMutAct_9fa48("100884")) {
      {}
    } else {
      stryCov_9fa48("100884");
      return (stryMutAct_9fa48("100888") ? this.log.length <= NUM.ZERO : stryMutAct_9fa48("100887") ? this.log.length >= NUM.ZERO : stryMutAct_9fa48("100886") ? false : stryMutAct_9fa48("100885") ? true : (stryCov_9fa48("100885", "100886", "100887", "100888"), this.log.length > NUM.ZERO)) ? this.log[stryMutAct_9fa48("100889") ? this.log.length + NUM.ONE : (stryCov_9fa48("100889"), this.log.length - NUM.ONE)] : null;
    }
  }

  /**
   * Get entry at a specific index.
   * @param {number} index - Log index (1-based).
   * @return {PartitionRaftLogEntry|null} Entry or null.
   */
  getEntry(index) {
    if (stryMutAct_9fa48("100890")) {
      {}
    } else {
      stryCov_9fa48("100890");
      if (stryMutAct_9fa48("100893") ? index < NUM.ONE && index > this.log.length : stryMutAct_9fa48("100892") ? false : stryMutAct_9fa48("100891") ? true : (stryCov_9fa48("100891", "100892", "100893"), (stryMutAct_9fa48("100896") ? index >= NUM.ONE : stryMutAct_9fa48("100895") ? index <= NUM.ONE : stryMutAct_9fa48("100894") ? false : (stryCov_9fa48("100894", "100895", "100896"), index < NUM.ONE)) || (stryMutAct_9fa48("100899") ? index <= this.log.length : stryMutAct_9fa48("100898") ? index >= this.log.length : stryMutAct_9fa48("100897") ? false : (stryCov_9fa48("100897", "100898", "100899"), index > this.log.length)))) {
        if (stryMutAct_9fa48("100900")) {
          {}
        } else {
          stryCov_9fa48("100900");
          return null;
        }
      }
      return this.log[stryMutAct_9fa48("100901") ? index + NUM.ONE : (stryCov_9fa48("100901"), index - NUM.ONE)];
    }
  }

  /**
   * Truncate log from a specific index.
   * Removes all entries from the given index onwards.
   * @param {number} fromIndex - Index to truncate from (1-based).
   */
  truncateFrom(fromIndex) {
    if (stryMutAct_9fa48("100902")) {
      {}
    } else {
      stryCov_9fa48("100902");
      if (stryMutAct_9fa48("100905") ? fromIndex >= NUM.ONE || fromIndex <= this.log.length : stryMutAct_9fa48("100904") ? false : stryMutAct_9fa48("100903") ? true : (stryCov_9fa48("100903", "100904", "100905"), (stryMutAct_9fa48("100908") ? fromIndex < NUM.ONE : stryMutAct_9fa48("100907") ? fromIndex > NUM.ONE : stryMutAct_9fa48("100906") ? true : (stryCov_9fa48("100906", "100907", "100908"), fromIndex >= NUM.ONE)) && (stryMutAct_9fa48("100911") ? fromIndex > this.log.length : stryMutAct_9fa48("100910") ? fromIndex < this.log.length : stryMutAct_9fa48("100909") ? true : (stryCov_9fa48("100909", "100910", "100911"), fromIndex <= this.log.length)))) {
        if (stryMutAct_9fa48("100912")) {
          {}
        } else {
          stryCov_9fa48("100912");
          this.log = stryMutAct_9fa48("100913") ? this.log : (stryCov_9fa48("100913"), this.log.slice(NUM.ZERO, stryMutAct_9fa48("100914") ? fromIndex + NUM.ONE : (stryCov_9fa48("100914"), fromIndex - NUM.ONE)));

          // Truncate in SQLite
          this.db.prepare(PARTITION_SERVICE_SQL.DELETE_RAFT_LOG_FROM).run(fromIndex);
        }
      }
    }
  }

  /**
   * Get the log length.
   * @return {number} Number of entries.
   */
  getLogLength() {
    if (stryMutAct_9fa48("100915")) {
      {}
    } else {
      stryCov_9fa48("100915");
      return this.log.length;
    }
  }

  /**
   * Get the last log index.
   * @return {number} Last index or 0 if empty.
   */
  getLastIndex() {
    if (stryMutAct_9fa48("100916")) {
      {}
    } else {
      stryCov_9fa48("100916");
      const lastEntry = this.getLastEntry();
      return lastEntry ? lastEntry.index : NUM.ZERO;
    }
  }

  /**
   * Get the last log term.
   * @return {number} Last term or 0 if empty.
   */
  getLastTerm() {
    if (stryMutAct_9fa48("100917")) {
      {}
    } else {
      stryCov_9fa48("100917");
      const lastEntry = this.getLastEntry();
      return lastEntry ? lastEntry.term : NUM.ZERO;
    }
  }
}
export { PartitionRaftStorage, PartitionRaftLogEntry };