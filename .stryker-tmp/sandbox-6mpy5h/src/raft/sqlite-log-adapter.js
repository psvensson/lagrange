/**
 * SQLiteLogAdapter - SQLite-backed log storage for liferaft.
 * Used by PartitionService for durable data storage.
 * Implements the liferaft Log interface for persistence.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 12.1, 12.2, 12.3, 12.4, 12.5
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
import { NUM } from '../constants/index.js';

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
    if (stryMutAct_9fa48("129281")) {
      {}
    } else {
      stryCov_9fa48("129281");
      if (stryMutAct_9fa48("129284") ? false : stryMutAct_9fa48("129283") ? true : stryMutAct_9fa48("129282") ? db : (stryCov_9fa48("129282", "129283", "129284"), !db)) {
        if (stryMutAct_9fa48("129285")) {
          {}
        } else {
          stryCov_9fa48("129285");
          throw new Error(stryMutAct_9fa48("129286") ? "" : (stryCov_9fa48("129286"), 'Database instance is required'));
        }
      }
      this.db = db;
      this.node = node;
      this.closed = stryMutAct_9fa48("129287") ? true : (stryCov_9fa48("129287"), false);
      this.initializeTables();
    }
  }

  /**
   * Check if the database is open and available.
   * @return {boolean} True if database is open.
   * @private
   */
  isOpen() {
    if (stryMutAct_9fa48("129288")) {
      {}
    } else {
      stryCov_9fa48("129288");
      return stryMutAct_9fa48("129291") ? !this.closed && this.db || this.db.open : stryMutAct_9fa48("129290") ? false : stryMutAct_9fa48("129289") ? true : (stryCov_9fa48("129289", "129290", "129291"), (stryMutAct_9fa48("129293") ? !this.closed || this.db : stryMutAct_9fa48("129292") ? true : (stryCov_9fa48("129292", "129293"), (stryMutAct_9fa48("129294") ? this.closed : (stryCov_9fa48("129294"), !this.closed)) && this.db)) && this.db.open);
    }
  }

  /**
   * Mark the adapter as closed.
   * Called when the partition service shuts down.
   */
  close() {
    if (stryMutAct_9fa48("129295")) {
      {}
    } else {
      stryCov_9fa48("129295");
      this.closed = stryMutAct_9fa48("129296") ? false : (stryCov_9fa48("129296"), true);
    }
  }

  /**
   * Initialize Raft tables in SQLite.
   * Requirements: 4.1, 4.2, 4.3, 12.1
   */
  initializeTables() {
    if (stryMutAct_9fa48("129297")) {
      {}
    } else {
      stryCov_9fa48("129297");
      this.db.exec(stryMutAct_9fa48("129298") ? `` : (stryCov_9fa48("129298"), `
      CREATE TABLE IF NOT EXISTS _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        command TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `));

      // Check current schema for migration needs
      const tableInfo = this.db.prepare(stryMutAct_9fa48("129299") ? "" : (stryCov_9fa48("129299"), 'PRAGMA table_info(_raft_log)')).all();
      const hasDataColumn = stryMutAct_9fa48("129300") ? tableInfo.every(col => col.name === 'data') : (stryCov_9fa48("129300"), tableInfo.some(stryMutAct_9fa48("129301") ? () => undefined : (stryCov_9fa48("129301"), col => stryMutAct_9fa48("129304") ? col.name !== 'data' : stryMutAct_9fa48("129303") ? false : stryMutAct_9fa48("129302") ? true : (stryCov_9fa48("129302", "129303", "129304"), col.name === (stryMutAct_9fa48("129305") ? "" : (stryCov_9fa48("129305"), 'data'))))));
      const hasCommandColumn = stryMutAct_9fa48("129306") ? tableInfo.every(col => col.name === 'command') : (stryCov_9fa48("129306"), tableInfo.some(stryMutAct_9fa48("129307") ? () => undefined : (stryCov_9fa48("129307"), col => stryMutAct_9fa48("129310") ? col.name !== 'command' : stryMutAct_9fa48("129309") ? false : stryMutAct_9fa48("129308") ? true : (stryCov_9fa48("129308", "129309", "129310"), col.name === (stryMutAct_9fa48("129311") ? "" : (stryCov_9fa48("129311"), 'command'))))));
      if (stryMutAct_9fa48("129314") ? hasDataColumn && !hasCommandColumn : stryMutAct_9fa48("129313") ? false : stryMutAct_9fa48("129312") ? true : (stryCov_9fa48("129312", "129313", "129314"), hasDataColumn || (stryMutAct_9fa48("129315") ? hasCommandColumn : (stryCov_9fa48("129315"), !hasCommandColumn)))) {
        if (stryMutAct_9fa48("129316")) {
          {}
        } else {
          stryCov_9fa48("129316");
          throw new Error(stryMutAct_9fa48("129317") ? "" : (stryCov_9fa48("129317"), 'Legacy raft log schema detected; manual migration required'));
        }
      }
      this.db.exec(stryMutAct_9fa48("129318") ? `` : (stryCov_9fa48("129318"), `
      CREATE TABLE IF NOT EXISTS _raft_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `));
    }
  }

  /**
   * Check whether a persisted payload already uses the canonical entry shape.
   * @param {*} entry
   * @return {boolean}
   * @private
   */
  isCanonicalEntryShape(entry) {
    if (stryMutAct_9fa48("129319")) {
      {}
    } else {
      stryCov_9fa48("129319");
      return stryMutAct_9fa48("129322") ? !!entry && typeof entry === 'object' || Object.prototype.hasOwnProperty.call(entry, 'command') || Object.prototype.hasOwnProperty.call(entry, 'responses') || Object.prototype.hasOwnProperty.call(entry, 'committed') : stryMutAct_9fa48("129321") ? false : stryMutAct_9fa48("129320") ? true : (stryCov_9fa48("129320", "129321", "129322"), (stryMutAct_9fa48("129324") ? !!entry || typeof entry === 'object' : stryMutAct_9fa48("129323") ? true : (stryCov_9fa48("129323", "129324"), (stryMutAct_9fa48("129325") ? !entry : (stryCov_9fa48("129325"), !(stryMutAct_9fa48("129326") ? entry : (stryCov_9fa48("129326"), !entry)))) && (stryMutAct_9fa48("129328") ? typeof entry !== 'object' : stryMutAct_9fa48("129327") ? true : (stryCov_9fa48("129327", "129328"), typeof entry === (stryMutAct_9fa48("129329") ? "" : (stryCov_9fa48("129329"), 'object')))))) && (stryMutAct_9fa48("129331") ? (Object.prototype.hasOwnProperty.call(entry, 'command') || Object.prototype.hasOwnProperty.call(entry, 'responses')) && Object.prototype.hasOwnProperty.call(entry, 'committed') : stryMutAct_9fa48("129330") ? true : (stryCov_9fa48("129330", "129331"), (stryMutAct_9fa48("129333") ? Object.prototype.hasOwnProperty.call(entry, 'command') && Object.prototype.hasOwnProperty.call(entry, 'responses') : stryMutAct_9fa48("129332") ? false : (stryCov_9fa48("129332", "129333"), Object.prototype.hasOwnProperty.call(entry, stryMutAct_9fa48("129334") ? "" : (stryCov_9fa48("129334"), 'command')) || Object.prototype.hasOwnProperty.call(entry, stryMutAct_9fa48("129335") ? "" : (stryCov_9fa48("129335"), 'responses')))) || Object.prototype.hasOwnProperty.call(entry, stryMutAct_9fa48("129336") ? "" : (stryCov_9fa48("129336"), 'committed')))));
    }
  }

  /**
   * Normalize any stored or incoming entry to the canonical raft entry shape.
   * Legacy rows that stored only the command payload are wrapped without
   * rewriting metadata outside the adapter owner path.
   * @param {*} entry
   * @param {Object} [fallback]
   * @param {number} [fallback.index]
   * @param {number} [fallback.term]
   * @param {number} [fallback.committedIndex]
   * @return {Object}
   * @private
   */
  normalizeEntry(entry, fallback = {}) {
    if (stryMutAct_9fa48("129337")) {
      {}
    } else {
      stryCov_9fa48("129337");
      const hasCanonicalShape = this.isCanonicalEntryShape(entry);
      const committedIndex = Number.isFinite(fallback.committedIndex) ? fallback.committedIndex : NUM.ZERO;
      const index = (stryMutAct_9fa48("129340") ? hasCanonicalShape || Number.isFinite(entry?.index) : stryMutAct_9fa48("129339") ? false : stryMutAct_9fa48("129338") ? true : (stryCov_9fa48("129338", "129339", "129340"), hasCanonicalShape && Number.isFinite(stryMutAct_9fa48("129341") ? entry.index : (stryCov_9fa48("129341"), entry?.index)))) ? entry.index : fallback.index;
      const term = (stryMutAct_9fa48("129344") ? hasCanonicalShape || Number.isFinite(entry?.term) : stryMutAct_9fa48("129343") ? false : stryMutAct_9fa48("129342") ? true : (stryCov_9fa48("129342", "129343", "129344"), hasCanonicalShape && Number.isFinite(stryMutAct_9fa48("129345") ? entry.term : (stryCov_9fa48("129345"), entry?.term)))) ? entry.term : fallback.term;
      return stryMutAct_9fa48("129346") ? {} : (stryCov_9fa48("129346"), {
        index,
        term,
        committed: hasCanonicalShape ? stryMutAct_9fa48("129349") ? entry.committed !== true : stryMutAct_9fa48("129348") ? false : stryMutAct_9fa48("129347") ? true : (stryCov_9fa48("129347", "129348", "129349"), entry.committed === (stryMutAct_9fa48("129350") ? false : (stryCov_9fa48("129350"), true))) : stryMutAct_9fa48("129353") ? Number.isFinite(index) || index <= committedIndex : stryMutAct_9fa48("129352") ? false : stryMutAct_9fa48("129351") ? true : (stryCov_9fa48("129351", "129352", "129353"), Number.isFinite(index) && (stryMutAct_9fa48("129356") ? index > committedIndex : stryMutAct_9fa48("129355") ? index < committedIndex : stryMutAct_9fa48("129354") ? true : (stryCov_9fa48("129354", "129355", "129356"), index <= committedIndex))),
        responses: (stryMutAct_9fa48("129359") ? hasCanonicalShape || Array.isArray(entry.responses) : stryMutAct_9fa48("129358") ? false : stryMutAct_9fa48("129357") ? true : (stryCov_9fa48("129357", "129358", "129359"), hasCanonicalShape && Array.isArray(entry.responses))) ? entry.responses.map(stryMutAct_9fa48("129360") ? () => undefined : (stryCov_9fa48("129360"), response => stryMutAct_9fa48("129361") ? {} : (stryCov_9fa48("129361"), {
          ...response
        }))) : stryMutAct_9fa48("129362") ? ["Stryker was here"] : (stryCov_9fa48("129362"), []),
        command: hasCanonicalShape ? entry.command : entry
      });
    }
  }

  /**
   * Decode one SQLite row into the canonical raft entry shape.
   * @param {Object|null} row
   * @param {number} [committedIndex]
   * @return {Object|null}
   * @private
   */
  readEntryRow(row, committedIndex = null) {
    if (stryMutAct_9fa48("129363")) {
      {}
    } else {
      stryCov_9fa48("129363");
      if (stryMutAct_9fa48("129366") ? false : stryMutAct_9fa48("129365") ? true : stryMutAct_9fa48("129364") ? row : (stryCov_9fa48("129364", "129365", "129366"), !row)) {
        if (stryMutAct_9fa48("129367")) {
          {}
        } else {
          stryCov_9fa48("129367");
          return null;
        }
      }
      const parsedEntry = JSON.parse(row.command);
      return this.normalizeEntry(parsedEntry, stryMutAct_9fa48("129368") ? {} : (stryCov_9fa48("129368"), {
        index: row.log_index,
        term: row.term,
        committedIndex: Number.isFinite(committedIndex) ? committedIndex : this.getCommittedIndex()
      }));
    }
  }

  /**
   * Persist one entry using the canonical serialized shape.
   * @param {Object} entry
   * @return {Object}
   * @private
   */
  persistEntry(entry) {
    if (stryMutAct_9fa48("129369")) {
      {}
    } else {
      stryCov_9fa48("129369");
      const normalizedEntry = this.normalizeEntry(entry, stryMutAct_9fa48("129370") ? {} : (stryCov_9fa48("129370"), {
        index: stryMutAct_9fa48("129371") ? entry.index : (stryCov_9fa48("129371"), entry?.index),
        term: stryMutAct_9fa48("129372") ? entry.term : (stryCov_9fa48("129372"), entry?.term),
        committedIndex: this.getCommittedIndex()
      }));
      this.db.prepare(stryMutAct_9fa48("129373") ? "" : (stryCov_9fa48("129373"), 'INSERT OR REPLACE INTO _raft_log (log_index, term, command, timestamp) VALUES (?, ?, ?, ?)')).run(normalizedEntry.index, normalizedEntry.term, JSON.stringify(normalizedEntry), Date.now());
      return normalizedEntry;
    }
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
    if (stryMutAct_9fa48("129374")) {
      {}
    } else {
      stryCov_9fa48("129374");
      if (stryMutAct_9fa48("129377") ? false : stryMutAct_9fa48("129376") ? true : stryMutAct_9fa48("129375") ? this.isOpen() : (stryCov_9fa48("129375", "129376", "129377"), !this.isOpen())) {
        if (stryMutAct_9fa48("129378")) {
          {}
        } else {
          stryCov_9fa48("129378");
          return stryMutAct_9fa48("129379") ? {} : (stryCov_9fa48("129379"), {
            index: 0,
            term: this.node ? this.node.term : 0,
            committedIndex: this.getCommittedIndex()
          });
        }
      }
      const row = this.db.prepare(stryMutAct_9fa48("129380") ? "" : (stryCov_9fa48("129380"), 'SELECT log_index, term FROM _raft_log ORDER BY log_index DESC LIMIT 1')).get();
      if (stryMutAct_9fa48("129383") ? false : stryMutAct_9fa48("129382") ? true : stryMutAct_9fa48("129381") ? row : (stryCov_9fa48("129381", "129382", "129383"), !row)) {
        if (stryMutAct_9fa48("129384")) {
          {}
        } else {
          stryCov_9fa48("129384");
          return stryMutAct_9fa48("129385") ? {} : (stryCov_9fa48("129385"), {
            index: 0,
            term: this.node ? this.node.term : 0,
            committedIndex: this.getCommittedIndex()
          });
        }
      }
      return stryMutAct_9fa48("129386") ? {} : (stryCov_9fa48("129386"), {
        index: row.log_index,
        term: row.term,
        committedIndex: this.getCommittedIndex()
      });
    }
  }

  /**
   * Get a specific log entry by index.
   * Requirements: 12.2
   * @param {number} index - Log index to retrieve
   * @return {Object|null} Log entry or null if not found
   */
  get(index) {
    if (stryMutAct_9fa48("129387")) {
      {}
    } else {
      stryCov_9fa48("129387");
      if (stryMutAct_9fa48("129390") ? false : stryMutAct_9fa48("129389") ? true : stryMutAct_9fa48("129388") ? this.isOpen() : (stryCov_9fa48("129388", "129389", "129390"), !this.isOpen())) {
        if (stryMutAct_9fa48("129391")) {
          {}
        } else {
          stryCov_9fa48("129391");
          return null;
        }
      }
      const row = this.db.prepare(stryMutAct_9fa48("129392") ? "" : (stryCov_9fa48("129392"), 'SELECT log_index, term, command FROM _raft_log WHERE log_index = ?')).get(index);
      return this.readEntryRow(row);
    }
  }

  /**
   * Append a new log entry.
   * Requirements: 12.2
   * @param {Object} entry - Log entry with index, term, command
   */
  put(entry) {
    if (stryMutAct_9fa48("129393")) {
      {}
    } else {
      stryCov_9fa48("129393");
      if (stryMutAct_9fa48("129396") ? false : stryMutAct_9fa48("129395") ? true : stryMutAct_9fa48("129394") ? this.isOpen() : (stryCov_9fa48("129394", "129395", "129396"), !this.isOpen())) {
        if (stryMutAct_9fa48("129397")) {
          {}
        } else {
          stryCov_9fa48("129397");
          return;
        }
      }
      this.persistEntry(entry);
    }
  }

  /**
   * Remove entries from a specific index onwards.
   * Requirements: 12.2
   * @param {number} index - Index to remove from (inclusive)
   */
  removeFrom(index) {
    if (stryMutAct_9fa48("129398")) {
      {}
    } else {
      stryCov_9fa48("129398");
      if (stryMutAct_9fa48("129401") ? false : stryMutAct_9fa48("129400") ? true : stryMutAct_9fa48("129399") ? this.isOpen() : (stryCov_9fa48("129399", "129400", "129401"), !this.isOpen())) {
        if (stryMutAct_9fa48("129402")) {
          {}
        } else {
          stryCov_9fa48("129402");
          return;
        }
      }
      this.db.prepare(stryMutAct_9fa48("129403") ? "" : (stryCov_9fa48("129403"), 'DELETE FROM _raft_log WHERE log_index >= ?')).run(index);
    }
  }

  /**
   * Get entries in a range (inclusive).
   * Requirements: 12.2
   * @param {number} startIndex - Starting index
   * @param {number} endIndex - Ending index
   * @return {Array} Array of log entries
   */
  getRange(startIndex, endIndex) {
    if (stryMutAct_9fa48("129404")) {
      {}
    } else {
      stryCov_9fa48("129404");
      if (stryMutAct_9fa48("129407") ? false : stryMutAct_9fa48("129406") ? true : stryMutAct_9fa48("129405") ? this.isOpen() : (stryCov_9fa48("129405", "129406", "129407"), !this.isOpen())) {
        if (stryMutAct_9fa48("129408")) {
          {}
        } else {
          stryCov_9fa48("129408");
          return stryMutAct_9fa48("129409") ? ["Stryker was here"] : (stryCov_9fa48("129409"), []);
        }
      }
      const committedIndex = this.getCommittedIndex();
      const rows = this.db.prepare((stryMutAct_9fa48("129410") ? "" : (stryCov_9fa48("129410"), 'SELECT log_index, term, command FROM _raft_log ')) + (stryMutAct_9fa48("129411") ? "" : (stryCov_9fa48("129411"), 'WHERE log_index >= ? AND log_index <= ? ORDER BY log_index'))).all(startIndex, endIndex);
      return rows.map(stryMutAct_9fa48("129412") ? () => undefined : (stryCov_9fa48("129412"), row => this.readEntryRow(row, committedIndex)));
    }
  }

  /**
   * Check if a log entry exists at the given index.
   * Required by liferaft for log consistency checks.
   * Requirements: 12.2
   * @param {number} index - Log index to check
   * @return {boolean} True if entry exists
   */
  has(index) {
    if (stryMutAct_9fa48("129413")) {
      {}
    } else {
      stryCov_9fa48("129413");
      if (stryMutAct_9fa48("129416") ? false : stryMutAct_9fa48("129415") ? true : stryMutAct_9fa48("129414") ? this.isOpen() : (stryCov_9fa48("129414", "129415", "129416"), !this.isOpen())) {
        if (stryMutAct_9fa48("129417")) {
          {}
        } else {
          stryCov_9fa48("129417");
          return stryMutAct_9fa48("129418") ? true : (stryCov_9fa48("129418"), false);
        }
      }
      const row = this.db.prepare(stryMutAct_9fa48("129419") ? "" : (stryCov_9fa48("129419"), 'SELECT 1 FROM _raft_log WHERE log_index = ?')).get(index);
      return stryMutAct_9fa48("129420") ? !row : (stryCov_9fa48("129420"), !(stryMutAct_9fa48("129421") ? row : (stryCov_9fa48("129421"), !row)));
    }
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
    if (stryMutAct_9fa48("129422")) {
      {}
    } else {
      stryCov_9fa48("129422");
      if (stryMutAct_9fa48("129425") ? false : stryMutAct_9fa48("129424") ? true : stryMutAct_9fa48("129423") ? index : (stryCov_9fa48("129423", "129424", "129425"), !index)) {
        if (stryMutAct_9fa48("129426")) {
          {}
        } else {
          stryCov_9fa48("129426");
          const lastInfo = this.getLastInfo();
          index = stryMutAct_9fa48("129427") ? lastInfo.index - 1 : (stryCov_9fa48("129427"), lastInfo.index + 1);
        }
      }
      const entry = stryMutAct_9fa48("129428") ? {} : (stryCov_9fa48("129428"), {
        term,
        index,
        committed: stryMutAct_9fa48("129429") ? true : (stryCov_9fa48("129429"), false),
        responses: stryMutAct_9fa48("129430") ? [] : (stryCov_9fa48("129430"), [stryMutAct_9fa48("129431") ? {} : (stryCov_9fa48("129431"), {
          address: this.node ? this.node.address : stryMutAct_9fa48("129432") ? "" : (stryCov_9fa48("129432"), 'unknown'),
          ack: stryMutAct_9fa48("129433") ? false : (stryCov_9fa48("129433"), true)
        })]),
        command
      });

      // Store in SQLite (only if database is open)
      if (stryMutAct_9fa48("129435") ? false : stryMutAct_9fa48("129434") ? true : (stryCov_9fa48("129434", "129435"), this.isOpen())) {
        if (stryMutAct_9fa48("129436")) {
          {}
        } else {
          stryCov_9fa48("129436");
          this.persistEntry(entry);
        }
      }
      return entry;
    }
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
    if (stryMutAct_9fa48("129437")) {
      {}
    } else {
      stryCov_9fa48("129437");
      if (stryMutAct_9fa48("129440") ? false : stryMutAct_9fa48("129439") ? true : stryMutAct_9fa48("129438") ? this.isOpen() : (stryCov_9fa48("129438", "129439", "129440"), !this.isOpen())) {
        if (stryMutAct_9fa48("129441")) {
          {}
        } else {
          stryCov_9fa48("129441");
          return stryMutAct_9fa48("129442") ? {} : (stryCov_9fa48("129442"), {
            responses: stryMutAct_9fa48("129443") ? ["Stryker was here"] : (stryCov_9fa48("129443"), [])
          });
        }
      }
      const row = this.db.prepare(stryMutAct_9fa48("129444") ? "" : (stryCov_9fa48("129444"), 'SELECT command FROM _raft_log WHERE log_index = ?')).get(index);
      if (stryMutAct_9fa48("129447") ? false : stryMutAct_9fa48("129446") ? true : stryMutAct_9fa48("129445") ? row : (stryCov_9fa48("129445", "129446", "129447"), !row)) {
        if (stryMutAct_9fa48("129448")) {
          {}
        } else {
          stryCov_9fa48("129448");
          return stryMutAct_9fa48("129449") ? {} : (stryCov_9fa48("129449"), {
            responses: stryMutAct_9fa48("129450") ? ["Stryker was here"] : (stryCov_9fa48("129450"), [])
          });
        }
      }
      const entry = this.readEntryRow(row);

      // Add acknowledgment if not already present
      if (stryMutAct_9fa48("129453") ? false : stryMutAct_9fa48("129452") ? true : stryMutAct_9fa48("129451") ? entry.responses : (stryCov_9fa48("129451", "129452", "129453"), !entry.responses)) {
        if (stryMutAct_9fa48("129454")) {
          {}
        } else {
          stryCov_9fa48("129454");
          entry.responses = stryMutAct_9fa48("129455") ? ["Stryker was here"] : (stryCov_9fa48("129455"), []);
        }
      }
      const existingIndex = entry.responses.findIndex(stryMutAct_9fa48("129456") ? () => undefined : (stryCov_9fa48("129456"), r => stryMutAct_9fa48("129459") ? r.address !== address : stryMutAct_9fa48("129458") ? false : stryMutAct_9fa48("129457") ? true : (stryCov_9fa48("129457", "129458", "129459"), r.address === address)));
      if (stryMutAct_9fa48("129462") ? existingIndex !== -1 : stryMutAct_9fa48("129461") ? false : stryMutAct_9fa48("129460") ? true : (stryCov_9fa48("129460", "129461", "129462"), existingIndex === (stryMutAct_9fa48("129463") ? +1 : (stryCov_9fa48("129463"), -1)))) {
        if (stryMutAct_9fa48("129464")) {
          {}
        } else {
          stryCov_9fa48("129464");
          entry.responses.push(stryMutAct_9fa48("129465") ? {} : (stryCov_9fa48("129465"), {
            address,
            ack: stryMutAct_9fa48("129466") ? false : (stryCov_9fa48("129466"), true)
          }));
        }
      }

      // Update in SQLite
      this.db.prepare(stryMutAct_9fa48("129467") ? "" : (stryCov_9fa48("129467"), 'UPDATE _raft_log SET command = ? WHERE log_index = ?')).run(JSON.stringify(entry), index);
      this.setCommittedIndex(index);
      return entry;
    }
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
    if (stryMutAct_9fa48("129468")) {
      {}
    } else {
      stryCov_9fa48("129468");
      if (stryMutAct_9fa48("129471") ? false : stryMutAct_9fa48("129470") ? true : stryMutAct_9fa48("129469") ? this.isOpen() : (stryCov_9fa48("129469", "129470", "129471"), !this.isOpen())) {
        if (stryMutAct_9fa48("129472")) {
          {}
        } else {
          stryCov_9fa48("129472");
          return stryMutAct_9fa48("129473") ? ["Stryker was here"] : (stryCov_9fa48("129473"), []);
        }
      }
      const committedIndex = this.getCommittedIndex();
      const rows = this.db.prepare(stryMutAct_9fa48("129474") ? "" : (stryCov_9fa48("129474"), 'SELECT log_index, term, command FROM _raft_log WHERE log_index <= ? ORDER BY log_index')).all(index);
      return stryMutAct_9fa48("129475") ? rows.map(row => this.readEntryRow(row, committedIndex)) : (stryCov_9fa48("129475"), rows.map(stryMutAct_9fa48("129476") ? () => undefined : (stryCov_9fa48("129476"), row => this.readEntryRow(row, committedIndex))).filter(stryMutAct_9fa48("129477") ? () => undefined : (stryCov_9fa48("129477"), entry => stryMutAct_9fa48("129478") ? entry.committed : (stryCov_9fa48("129478"), !entry.committed))));
    }
  }

  /**
   * Commit an entry.
   * Required by liferaft for commit processing.
   * Requirements: 12.2
   * @param {number} index - Index to commit
   * @return {Object} Committed entry
   */
  commit(index) {
    if (stryMutAct_9fa48("129479")) {
      {}
    } else {
      stryCov_9fa48("129479");
      if (stryMutAct_9fa48("129482") ? false : stryMutAct_9fa48("129481") ? true : stryMutAct_9fa48("129480") ? this.isOpen() : (stryCov_9fa48("129480", "129481", "129482"), !this.isOpen())) {
        if (stryMutAct_9fa48("129483")) {
          {}
        } else {
          stryCov_9fa48("129483");
          return null;
        }
      }
      const row = this.db.prepare(stryMutAct_9fa48("129484") ? "" : (stryCov_9fa48("129484"), 'SELECT log_index, term, command FROM _raft_log WHERE log_index = ?')).get(index);
      if (stryMutAct_9fa48("129487") ? false : stryMutAct_9fa48("129486") ? true : stryMutAct_9fa48("129485") ? row : (stryCov_9fa48("129485", "129486", "129487"), !row)) {
        if (stryMutAct_9fa48("129488")) {
          {}
        } else {
          stryCov_9fa48("129488");
          return null;
        }
      }
      const entry = this.readEntryRow(row);
      entry.committed = stryMutAct_9fa48("129489") ? false : (stryCov_9fa48("129489"), true);

      // Update in SQLite
      this.db.prepare(stryMutAct_9fa48("129490") ? "" : (stryCov_9fa48("129490"), 'UPDATE _raft_log SET command = ? WHERE log_index = ?')).run(JSON.stringify(entry), index);
      return entry;
    }
  }

  /**
   * Get the last entry.
   * Required by liferaft for log consistency.
   * Requirements: 12.2
   * @return {Object} Last entry or default
   */
  getLastEntry() {
    if (stryMutAct_9fa48("129491")) {
      {}
    } else {
      stryCov_9fa48("129491");
      if (stryMutAct_9fa48("129494") ? false : stryMutAct_9fa48("129493") ? true : stryMutAct_9fa48("129492") ? this.isOpen() : (stryCov_9fa48("129492", "129493", "129494"), !this.isOpen())) {
        if (stryMutAct_9fa48("129495")) {
          {}
        } else {
          stryCov_9fa48("129495");
          return stryMutAct_9fa48("129496") ? {} : (stryCov_9fa48("129496"), {
            index: 0,
            term: this.node ? this.node.term : 0
          });
        }
      }
      const row = this.db.prepare(stryMutAct_9fa48("129497") ? "" : (stryCov_9fa48("129497"), 'SELECT log_index, term, command FROM _raft_log ORDER BY log_index DESC LIMIT 1')).get();
      if (stryMutAct_9fa48("129500") ? false : stryMutAct_9fa48("129499") ? true : stryMutAct_9fa48("129498") ? row : (stryCov_9fa48("129498", "129499", "129500"), !row)) {
        if (stryMutAct_9fa48("129501")) {
          {}
        } else {
          stryCov_9fa48("129501");
          return stryMutAct_9fa48("129502") ? {} : (stryCov_9fa48("129502"), {
            index: 0,
            term: this.node ? this.node.term : 0
          });
        }
      }
      return this.readEntryRow(row);
    }
  }

  /**
   * Get entry info before a given entry.
   * Required by liferaft for append entries.
   * Requirements: 12.2
   * @param {Object} entry - Entry to get before
   * @return {Object} {index, term, committedIndex}
   */
  getEntryInfoBefore(entry) {
    if (stryMutAct_9fa48("129503")) {
      {}
    } else {
      stryCov_9fa48("129503");
      const prevEntry = this.getEntryBefore(entry);
      return stryMutAct_9fa48("129504") ? {} : (stryCov_9fa48("129504"), {
        index: prevEntry.index,
        term: prevEntry.term,
        committedIndex: this.getCommittedIndex()
      });
    }
  }

  /**
   * Get entry before a given entry.
   * Required by liferaft for append entries.
   * Requirements: 12.2
   * @param {Object} entry - Entry to get before
   * @return {Object} Previous entry or default
   */
  getEntryBefore(entry) {
    if (stryMutAct_9fa48("129505")) {
      {}
    } else {
      stryCov_9fa48("129505");
      const defaultInfo = stryMutAct_9fa48("129506") ? {} : (stryCov_9fa48("129506"), {
        index: 0,
        term: this.node ? this.node.term : 0
      });
      if (stryMutAct_9fa48("129509") ? (!entry || typeof entry.index !== 'number') && !Number.isFinite(entry.index) : stryMutAct_9fa48("129508") ? false : stryMutAct_9fa48("129507") ? true : (stryCov_9fa48("129507", "129508", "129509"), (stryMutAct_9fa48("129511") ? !entry && typeof entry.index !== 'number' : stryMutAct_9fa48("129510") ? false : (stryCov_9fa48("129510", "129511"), (stryMutAct_9fa48("129512") ? entry : (stryCov_9fa48("129512"), !entry)) || (stryMutAct_9fa48("129514") ? typeof entry.index === 'number' : stryMutAct_9fa48("129513") ? false : (stryCov_9fa48("129513", "129514"), typeof entry.index !== (stryMutAct_9fa48("129515") ? "" : (stryCov_9fa48("129515"), 'number')))))) || (stryMutAct_9fa48("129516") ? Number.isFinite(entry.index) : (stryCov_9fa48("129516"), !Number.isFinite(entry.index))))) {
        if (stryMutAct_9fa48("129517")) {
          {}
        } else {
          stryCov_9fa48("129517");
          return defaultInfo;
        }
      }
      if (stryMutAct_9fa48("129521") ? entry.index > 1 : stryMutAct_9fa48("129520") ? entry.index < 1 : stryMutAct_9fa48("129519") ? false : stryMutAct_9fa48("129518") ? true : (stryCov_9fa48("129518", "129519", "129520", "129521"), entry.index <= 1)) {
        if (stryMutAct_9fa48("129522")) {
          {}
        } else {
          stryCov_9fa48("129522");
          return defaultInfo;
        }
      }
      if (stryMutAct_9fa48("129525") ? false : stryMutAct_9fa48("129524") ? true : stryMutAct_9fa48("129523") ? this.isOpen() : (stryCov_9fa48("129523", "129524", "129525"), !this.isOpen())) {
        if (stryMutAct_9fa48("129526")) {
          {}
        } else {
          stryCov_9fa48("129526");
          return defaultInfo;
        }
      }
      const row = this.db.prepare((stryMutAct_9fa48("129527") ? "" : (stryCov_9fa48("129527"), 'SELECT log_index, term, command FROM _raft_log ')) + (stryMutAct_9fa48("129528") ? "" : (stryCov_9fa48("129528"), 'WHERE log_index < ? ORDER BY log_index DESC LIMIT 1'))).get(entry.index);
      if (stryMutAct_9fa48("129531") ? false : stryMutAct_9fa48("129530") ? true : stryMutAct_9fa48("129529") ? row : (stryCov_9fa48("129529", "129530", "129531"), !row)) {
        if (stryMutAct_9fa48("129532")) {
          {}
        } else {
          stryCov_9fa48("129532");
          return defaultInfo;
        }
      }
      return this.readEntryRow(row);
    }
  }

  /**
   * Get entries after index.
   * Required by liferaft for replication.
   * Requirements: 12.2
   * @param {number} index - Index to get after
   * @return {Array} Entries after index
   */
  getEntriesAfter(index) {
    if (stryMutAct_9fa48("129533")) {
      {}
    } else {
      stryCov_9fa48("129533");
      if (stryMutAct_9fa48("129536") ? false : stryMutAct_9fa48("129535") ? true : stryMutAct_9fa48("129534") ? this.isOpen() : (stryCov_9fa48("129534", "129535", "129536"), !this.isOpen())) {
        if (stryMutAct_9fa48("129537")) {
          {}
        } else {
          stryCov_9fa48("129537");
          return stryMutAct_9fa48("129538") ? ["Stryker was here"] : (stryCov_9fa48("129538"), []);
        }
      }
      const committedIndex = this.getCommittedIndex();
      const rows = this.db.prepare(stryMutAct_9fa48("129539") ? "" : (stryCov_9fa48("129539"), 'SELECT log_index, term, command FROM _raft_log WHERE log_index > ? ORDER BY log_index')).all(index);
      return rows.map(stryMutAct_9fa48("129540") ? () => undefined : (stryCov_9fa48("129540"), row => this.readEntryRow(row, committedIndex)));
    }
  }

  /**
   * Remove all entries after index.
   * Required by liferaft for log truncation.
   * Requirements: 12.2
   * @param {number} index - Index to remove after
   */
  removeEntriesAfter(index) {
    if (stryMutAct_9fa48("129541")) {
      {}
    } else {
      stryCov_9fa48("129541");
      if (stryMutAct_9fa48("129544") ? false : stryMutAct_9fa48("129543") ? true : stryMutAct_9fa48("129542") ? this.isOpen() : (stryCov_9fa48("129542", "129543", "129544"), !this.isOpen())) {
        if (stryMutAct_9fa48("129545")) {
          {}
        } else {
          stryCov_9fa48("129545");
          return;
        }
      }
      this.db.prepare(stryMutAct_9fa48("129546") ? "" : (stryCov_9fa48("129546"), 'DELETE FROM _raft_log WHERE log_index > ?')).run(index);
    }
  }

  /**
   * Get the committed index.
   * @return {number} Committed index
   */
  getCommittedIndex() {
    if (stryMutAct_9fa48("129547")) {
      {}
    } else {
      stryCov_9fa48("129547");
      if (stryMutAct_9fa48("129550") ? false : stryMutAct_9fa48("129549") ? true : stryMutAct_9fa48("129548") ? this.isOpen() : (stryCov_9fa48("129548", "129549", "129550"), !this.isOpen())) {
        if (stryMutAct_9fa48("129551")) {
          {}
        } else {
          stryCov_9fa48("129551");
          return 0;
        }
      }
      const row = this.db.prepare(stryMutAct_9fa48("129552") ? "" : (stryCov_9fa48("129552"), 'SELECT value FROM _raft_state WHERE key = ?')).get(stryMutAct_9fa48("129553") ? "" : (stryCov_9fa48("129553"), 'committedIndex'));
      return row ? parseInt(row.value, 10) : 0;
    }
  }

  /**
   * Liferaft reads committedIndex as a property on the log adapter.
   * Keep it synchronized with persisted raft state.
   * @return {number} Committed index.
   */
  get committedIndex() {
    if (stryMutAct_9fa48("129554")) {
      {}
    } else {
      stryCov_9fa48("129554");
      return this.getCommittedIndex();
    }
  }

  /**
   * Set the committed index.
   * @param {number} index - Committed index
   */
  setCommittedIndex(index) {
    if (stryMutAct_9fa48("129555")) {
      {}
    } else {
      stryCov_9fa48("129555");
      if (stryMutAct_9fa48("129558") ? false : stryMutAct_9fa48("129557") ? true : stryMutAct_9fa48("129556") ? this.isOpen() : (stryCov_9fa48("129556", "129557", "129558"), !this.isOpen())) {
        if (stryMutAct_9fa48("129559")) {
          {}
        } else {
          stryCov_9fa48("129559");
          return;
        }
      }
      this.db.prepare(stryMutAct_9fa48("129560") ? "" : (stryCov_9fa48("129560"), 'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)')).run(stryMutAct_9fa48("129561") ? "" : (stryCov_9fa48("129561"), 'committedIndex'), String(index));
    }
  }

  /**
   * Append entries to the log.
   * Requirements: 4.3
   * @param {Array} entries - Log entries to append
   * @param {Function} callback - Completion callback
   */
  append(entries, callback) {
    if (stryMutAct_9fa48("129562")) {
      {}
    } else {
      stryCov_9fa48("129562");
      if (stryMutAct_9fa48("129565") ? false : stryMutAct_9fa48("129564") ? true : stryMutAct_9fa48("129563") ? this.isOpen() : (stryCov_9fa48("129563", "129564", "129565"), !this.isOpen())) {
        if (stryMutAct_9fa48("129566")) {
          {}
        } else {
          stryCov_9fa48("129566");
          callback(null);
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("129567")) {
          {}
        } else {
          stryCov_9fa48("129567");
          // Use INSERT OR REPLACE to handle duplicate indices gracefully
          // This can happen during Raft log replication when entries are re-sent
          const sql = (stryMutAct_9fa48("129568") ? "" : (stryCov_9fa48("129568"), 'INSERT OR REPLACE INTO _raft_log ')) + (stryMutAct_9fa48("129569") ? "" : (stryCov_9fa48("129569"), '(log_index, term, command, timestamp) VALUES (?, ?, ?, ?)'));
          const stmt = this.db.prepare(sql);
          const insertMany = this.db.transaction(entries => {
            if (stryMutAct_9fa48("129570")) {
              {}
            } else {
              stryCov_9fa48("129570");
              for (const entry of entries) {
                if (stryMutAct_9fa48("129571")) {
                  {}
                } else {
                  stryCov_9fa48("129571");
                  const normalizedEntry = this.normalizeEntry(entry, stryMutAct_9fa48("129572") ? {} : (stryCov_9fa48("129572"), {
                    index: stryMutAct_9fa48("129573") ? entry.index : (stryCov_9fa48("129573"), entry?.index),
                    term: stryMutAct_9fa48("129574") ? entry.term : (stryCov_9fa48("129574"), entry?.term),
                    committedIndex: this.getCommittedIndex()
                  }));
                  stmt.run(normalizedEntry.index, normalizedEntry.term, JSON.stringify(normalizedEntry), Date.now());
                }
              }
            }
          });
          insertMany(entries);
          callback(null);
        }
      } catch (error) {
        if (stryMutAct_9fa48("129575")) {
          {}
        } else {
          stryCov_9fa48("129575");
          callback(error);
        }
      }
    }
  }

  /**
   * Get entries from a starting index.
   * Requirements: 4.3
   * @param {number} startIndex - Starting index
   * @param {Function} callback - Callback with entries
   */
  getEntriesFrom(startIndex, callback) {
    if (stryMutAct_9fa48("129576")) {
      {}
    } else {
      stryCov_9fa48("129576");
      if (stryMutAct_9fa48("129579") ? false : stryMutAct_9fa48("129578") ? true : stryMutAct_9fa48("129577") ? this.isOpen() : (stryCov_9fa48("129577", "129578", "129579"), !this.isOpen())) {
        if (stryMutAct_9fa48("129580")) {
          {}
        } else {
          stryCov_9fa48("129580");
          callback(null, stryMutAct_9fa48("129581") ? ["Stryker was here"] : (stryCov_9fa48("129581"), []));
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("129582")) {
          {}
        } else {
          stryCov_9fa48("129582");
          const committedIndex = this.getCommittedIndex();
          const entries = this.db.prepare(stryMutAct_9fa48("129583") ? "" : (stryCov_9fa48("129583"), 'SELECT log_index, term, command FROM _raft_log WHERE log_index >= ? ORDER BY log_index')).all(startIndex);
          callback(null, entries.map(stryMutAct_9fa48("129584") ? () => undefined : (stryCov_9fa48("129584"), row => this.readEntryRow(row, committedIndex))));
        }
      } catch (error) {
        if (stryMutAct_9fa48("129585")) {
          {}
        } else {
          stryCov_9fa48("129585");
          callback(error);
        }
      }
    }
  }

  /**
   * Get the last log entry (callback version).
   * @param {Function} callback - Callback with entry
   */
  getLastEntryCallback(callback) {
    if (stryMutAct_9fa48("129586")) {
      {}
    } else {
      stryCov_9fa48("129586");
      if (stryMutAct_9fa48("129589") ? false : stryMutAct_9fa48("129588") ? true : stryMutAct_9fa48("129587") ? this.isOpen() : (stryCov_9fa48("129587", "129588", "129589"), !this.isOpen())) {
        if (stryMutAct_9fa48("129590")) {
          {}
        } else {
          stryCov_9fa48("129590");
          callback(null, null);
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("129591")) {
          {}
        } else {
          stryCov_9fa48("129591");
          const row = this.db.prepare(stryMutAct_9fa48("129592") ? "" : (stryCov_9fa48("129592"), 'SELECT log_index, term, command FROM _raft_log ORDER BY log_index DESC LIMIT 1')).get();
          if (stryMutAct_9fa48("129594") ? false : stryMutAct_9fa48("129593") ? true : (stryCov_9fa48("129593", "129594"), row)) {
            if (stryMutAct_9fa48("129595")) {
              {}
            } else {
              stryCov_9fa48("129595");
              callback(null, this.readEntryRow(row));
            }
          } else {
            if (stryMutAct_9fa48("129596")) {
              {}
            } else {
              stryCov_9fa48("129596");
              callback(null, null);
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("129597")) {
          {}
        } else {
          stryCov_9fa48("129597");
          callback(error);
        }
      }
    }
  }

  /**
   * Truncate log from a specific index.
   * Requirements: 4.4
   * @param {number} fromIndex - Index to truncate from
   * @param {Function} callback - Completion callback
   */
  truncateFrom(fromIndex, callback) {
    if (stryMutAct_9fa48("129598")) {
      {}
    } else {
      stryCov_9fa48("129598");
      if (stryMutAct_9fa48("129601") ? false : stryMutAct_9fa48("129600") ? true : stryMutAct_9fa48("129599") ? this.isOpen() : (stryCov_9fa48("129599", "129600", "129601"), !this.isOpen())) {
        if (stryMutAct_9fa48("129602")) {
          {}
        } else {
          stryCov_9fa48("129602");
          callback(null);
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("129603")) {
          {}
        } else {
          stryCov_9fa48("129603");
          this.db.prepare(stryMutAct_9fa48("129604") ? "" : (stryCov_9fa48("129604"), 'DELETE FROM _raft_log WHERE log_index >= ?')).run(fromIndex);
          callback(null);
        }
      } catch (error) {
        if (stryMutAct_9fa48("129605")) {
          {}
        } else {
          stryCov_9fa48("129605");
          callback(error);
        }
      }
    }
  }

  /**
   * Get log length.
   * @param {Function} callback - Callback with length
   */
  getLength(callback) {
    if (stryMutAct_9fa48("129606")) {
      {}
    } else {
      stryCov_9fa48("129606");
      if (stryMutAct_9fa48("129609") ? false : stryMutAct_9fa48("129608") ? true : stryMutAct_9fa48("129607") ? this.isOpen() : (stryCov_9fa48("129607", "129608", "129609"), !this.isOpen())) {
        if (stryMutAct_9fa48("129610")) {
          {}
        } else {
          stryCov_9fa48("129610");
          callback(null, 0);
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("129611")) {
          {}
        } else {
          stryCov_9fa48("129611");
          const row = this.db.prepare(stryMutAct_9fa48("129612") ? "" : (stryCov_9fa48("129612"), 'SELECT COUNT(*) as count FROM _raft_log')).get();
          callback(null, row.count);
        }
      } catch (error) {
        if (stryMutAct_9fa48("129613")) {
          {}
        } else {
          stryCov_9fa48("129613");
          callback(error);
        }
      }
    }
  }

  /**
   * Get persistent Raft state.
   * Requirements: 4.1, 4.2
   * @param {string} key - State key (e.g., 'currentTerm', 'votedFor')
   * @param {Function} callback - Callback with value
   */
  getState(key, callback) {
    if (stryMutAct_9fa48("129614")) {
      {}
    } else {
      stryCov_9fa48("129614");
      if (stryMutAct_9fa48("129617") ? false : stryMutAct_9fa48("129616") ? true : stryMutAct_9fa48("129615") ? this.isOpen() : (stryCov_9fa48("129615", "129616", "129617"), !this.isOpen())) {
        if (stryMutAct_9fa48("129618")) {
          {}
        } else {
          stryCov_9fa48("129618");
          callback(null, null);
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("129619")) {
          {}
        } else {
          stryCov_9fa48("129619");
          const row = this.db.prepare(stryMutAct_9fa48("129620") ? "" : (stryCov_9fa48("129620"), 'SELECT value FROM _raft_state WHERE key = ?')).get(key);
          callback(null, row ? row.value : null);
        }
      } catch (error) {
        if (stryMutAct_9fa48("129621")) {
          {}
        } else {
          stryCov_9fa48("129621");
          callback(error);
        }
      }
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
    if (stryMutAct_9fa48("129622")) {
      {}
    } else {
      stryCov_9fa48("129622");
      if (stryMutAct_9fa48("129625") ? false : stryMutAct_9fa48("129624") ? true : stryMutAct_9fa48("129623") ? this.isOpen() : (stryCov_9fa48("129623", "129624", "129625"), !this.isOpen())) {
        if (stryMutAct_9fa48("129626")) {
          {}
        } else {
          stryCov_9fa48("129626");
          callback(null);
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("129627")) {
          {}
        } else {
          stryCov_9fa48("129627");
          this.db.prepare(stryMutAct_9fa48("129628") ? "" : (stryCov_9fa48("129628"), 'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)')).run(key, value);
          callback(null);
        }
      } catch (error) {
        if (stryMutAct_9fa48("129629")) {
          {}
        } else {
          stryCov_9fa48("129629");
          callback(error);
        }
      }
    }
  }

  /**
   * Get current term.
   * Requirements: 4.1
   * @param {Function} callback - Callback with term
   */
  getTerm(callback) {
    if (stryMutAct_9fa48("129630")) {
      {}
    } else {
      stryCov_9fa48("129630");
      this.getState(stryMutAct_9fa48("129631") ? "" : (stryCov_9fa48("129631"), 'currentTerm'), (err, value) => {
        if (stryMutAct_9fa48("129632")) {
          {}
        } else {
          stryCov_9fa48("129632");
          if (stryMutAct_9fa48("129634") ? false : stryMutAct_9fa48("129633") ? true : (stryCov_9fa48("129633", "129634"), err)) {
            if (stryMutAct_9fa48("129635")) {
              {}
            } else {
              stryCov_9fa48("129635");
              callback(err);
            }
          } else {
            if (stryMutAct_9fa48("129636")) {
              {}
            } else {
              stryCov_9fa48("129636");
              callback(null, value ? parseInt(value, 10) : 0);
            }
          }
        }
      });
    }
  }

  /**
   * Set current term.
   * Requirements: 4.1
   * @param {number} term - Term to set
   * @param {Function} callback - Completion callback
   */
  setTerm(term, callback) {
    if (stryMutAct_9fa48("129637")) {
      {}
    } else {
      stryCov_9fa48("129637");
      this.setState(stryMutAct_9fa48("129638") ? "" : (stryCov_9fa48("129638"), 'currentTerm'), String(term), callback);
    }
  }

  /**
   * Get votedFor.
   * Requirements: 4.2
   * @param {Function} callback - Callback with votedFor
   */
  getVotedFor(callback) {
    if (stryMutAct_9fa48("129639")) {
      {}
    } else {
      stryCov_9fa48("129639");
      this.getState(stryMutAct_9fa48("129640") ? "" : (stryCov_9fa48("129640"), 'votedFor'), (err, value) => {
        if (stryMutAct_9fa48("129641")) {
          {}
        } else {
          stryCov_9fa48("129641");
          if (stryMutAct_9fa48("129643") ? false : stryMutAct_9fa48("129642") ? true : (stryCov_9fa48("129642", "129643"), err)) {
            if (stryMutAct_9fa48("129644")) {
              {}
            } else {
              stryCov_9fa48("129644");
              callback(err);
            }
          } else {
            if (stryMutAct_9fa48("129645")) {
              {}
            } else {
              stryCov_9fa48("129645");
              callback(null, stryMutAct_9fa48("129648") ? value && null : stryMutAct_9fa48("129647") ? false : stryMutAct_9fa48("129646") ? true : (stryCov_9fa48("129646", "129647", "129648"), value || null));
            }
          }
        }
      });
    }
  }

  /**
   * Set votedFor.
   * Requirements: 4.2
   * @param {string|null} candidateId - Candidate ID or null
   * @param {Function} callback - Completion callback
   */
  setVotedFor(candidateId, callback) {
    if (stryMutAct_9fa48("129649")) {
      {}
    } else {
      stryCov_9fa48("129649");
      this.setState(stryMutAct_9fa48("129650") ? "" : (stryCov_9fa48("129650"), 'votedFor'), stryMutAct_9fa48("129653") ? candidateId && '' : stryMutAct_9fa48("129652") ? false : stryMutAct_9fa48("129651") ? true : (stryCov_9fa48("129651", "129652", "129653"), candidateId || (stryMutAct_9fa48("129654") ? "Stryker was here!" : (stryCov_9fa48("129654"), ''))), callback);
    }
  }

  /**
   * Get commit index.
   * @param {Function} callback - Callback with commit index
   */
  getCommitIndex(callback) {
    if (stryMutAct_9fa48("129655")) {
      {}
    } else {
      stryCov_9fa48("129655");
      this.getState(stryMutAct_9fa48("129656") ? "" : (stryCov_9fa48("129656"), 'commitIndex'), (err, value) => {
        if (stryMutAct_9fa48("129657")) {
          {}
        } else {
          stryCov_9fa48("129657");
          if (stryMutAct_9fa48("129659") ? false : stryMutAct_9fa48("129658") ? true : (stryCov_9fa48("129658", "129659"), err)) {
            if (stryMutAct_9fa48("129660")) {
              {}
            } else {
              stryCov_9fa48("129660");
              callback(err);
            }
          } else {
            if (stryMutAct_9fa48("129661")) {
              {}
            } else {
              stryCov_9fa48("129661");
              callback(null, value ? parseInt(value, 10) : 0);
            }
          }
        }
      });
    }
  }

  /**
   * Set commit index.
   * @param {number} index - Commit index to set
   * @param {Function} callback - Completion callback
   */
  setCommitIndex(index, callback) {
    if (stryMutAct_9fa48("129662")) {
      {}
    } else {
      stryCov_9fa48("129662");
      this.setState(stryMutAct_9fa48("129663") ? "" : (stryCov_9fa48("129663"), 'commitIndex'), String(index), callback);
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
export { SQLiteLogAdapter };