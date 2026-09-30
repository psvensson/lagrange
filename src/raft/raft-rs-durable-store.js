// The durable Raft record of one replica's raft-rs groups, in that replica's
// own SQLite database.
//
// What it preserves: the log entries, the hard state (term, vote and commit
// index), the applied progress, the configuration state, and the snapshot
// state. The applied progress and the configuration state are columns of one
// row, so they are written by one statement and can never disagree.
//
// It keeps an ordered journal of the durable writes it made. The journal is
// observability, not authority: it is what a caller reads to see the order the
// writes happened in, while the record itself is what a restart reads.

import {
  RAFT_RS_BOOLEAN_COLUMN,
  RAFT_RS_CONF_STATE_FIELD,
  RAFT_RS_CONF_STATE_MEMBER_FIELDS,
  RAFT_RS_PARTICIPATION_GATE_COLUMNS,
  RAFT_RS_PERSISTENCE_ADMISSION,
  RAFT_RS_RECORD_COMPATIBILITY,
  RAFT_RS_RECORD_TABLES,
  RAFT_RS_SCHEMA_SQL,
  RAFT_RS_SQL,
  RAFT_RS_STORE_ERROR_CODE,
  RAFT_RS_STORE_ERROR_MSG,
  RAFT_RS_TABLE,
  RAFT_RS_ZERO_INDEX,
} from './raft-rs-durable-store-constants.js';
import {RAFT_RS_HOST_WRITE} from './raft-rs-host-contract.js';
import {decodeCommittedProposal} from './raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from './raft-rs-ready-loop-constants.js';

const DECIMAL_DIGITS = /^\d+$/u;
const PAYLOAD_ENCODING = 'base64';
// The log table and the applied-state table.
const LOG_AND_APPLIED_STATE_TABLE_COUNT = 2;

/**
 * Convert a raft-rs decimal string into the BigInt SQLite binds exactly.
 * @param {string} value - A 64-bit value as a decimal string.
 * @return {bigint} The same value.
 */
function toExactInteger(value) {
  if (typeof value !== 'string' || !DECIMAL_DIGITS.test(value)) {
    throw new Error(RAFT_RS_STORE_ERROR_MSG.notAnIndex(value));
  }
  return BigInt(value);
}

/**
 * Convert what SQLite returned back into a raft-rs decimal string.
 * @param {bigint|number} value - A column value read with safe integers.
 * @return {string} The decimal string.
 */
function fromExactInteger(value) {
  return String(value);
}

/**
 * A nullable column read with safe integers, as a decimal string or null.
 * @param {bigint|number|null|undefined} value - The column value.
 * @return {string|null} The decimal string, or null.
 */
function nullableExactInteger(value) {
  return value === null || value === undefined ? null :
    fromExactInteger(value);
}

/**
 * The empty configuration, used when a group has no record yet.
 * @return {Object} A ConfState with no members.
 */
function emptyConfState() {
  return {
    [RAFT_RS_CONF_STATE_FIELD.VOTERS]: [],
    [RAFT_RS_CONF_STATE_FIELD.LEARNERS]: [],
    [RAFT_RS_CONF_STATE_FIELD.VOTERS_OUTGOING]: [],
    [RAFT_RS_CONF_STATE_FIELD.LEARNERS_NEXT]: [],
    [RAFT_RS_CONF_STATE_FIELD.AUTO_LEAVE]: false,
  };
}

/**
 * The member columns of a ConfState, as the row stores them.
 * @param {Object} confState - A ConfState from the core.
 * @return {Array} The four member lists as JSON text, then the auto-leave flag.
 */
function confStateColumns(confState) {
  const members = RAFT_RS_CONF_STATE_MEMBER_FIELDS.map((field) =>
    JSON.stringify(confState?.[field] || []));
  const autoLeave = confState?.[RAFT_RS_CONF_STATE_FIELD.AUTO_LEAVE] === true ?
    RAFT_RS_BOOLEAN_COLUMN.TRUE :
    RAFT_RS_BOOLEAN_COLUMN.FALSE;
  return [...members, autoLeave];
}

/**
 * Rebuild a ConfState from the row that stores it.
 * @param {Object} row - A row of the applied-state or snapshot table.
 * @return {Object} The ConfState.
 */
function confStateFromRow(row) {
  const confState = {};
  for (const field of RAFT_RS_CONF_STATE_MEMBER_FIELDS) {
    const column = field.replace(/[A-Z]/gu, (letter) =>
      `_${letter.toLowerCase()}`);
    confState[field] = JSON.parse(row[column]);
  }
  confState[RAFT_RS_CONF_STATE_FIELD.AUTO_LEAVE] =
    Number(row.auto_leave) === RAFT_RS_BOOLEAN_COLUMN.TRUE;
  return confState;
}

/**
 * One read of a record table. A read that fails (the table is missing, the
 * file is unreadable or corrupt) throws an error that names the table beside
 * SQLite's own code, so its reader can say which part of the record it could
 * not read.
 * @param {string} table - The record table the read reaches.
 * @param {Function} read - The read.
 * @return {*} What the read returned.
 */
function readRecordTable(table, read) {
  try {
    return read();
  } catch (error) {
    throw Object.assign(new Error(String(error?.message || error),
      {cause: error}), {code: error?.code, table});
  }
}

/**
 * The durable Raft record for the raft-rs-wasm backend.
 */
class RaftRsDurableStore {
  /**
   * @param {Object} db - The replica's own better-sqlite3 database.
   */
  constructor(db) {
    this.db = db;
    this.journal = [];
    this.ownTransactionDepth = 0;
    this.createRecordTables();
  }

  /**
   * Create the record's tables together, on a database that has none of
   * them, in one transaction of the store's own (admitted like every write
   * the store makes): the schema is created whole or not at all, so a
   * creation that failed part way - a crash, a full disk - leaves no table,
   * and the next open creates them again. A database holding some of them
   * therefore holds a record that lost a table: created empty, the table
   * would make the record read as one that never had that part (its
   * configuration, its applied index), so it stays missing and every read of
   * the record fails, naming it, until it is restored.
   * @private
   */
  createRecordTables() {
    const tablePresent = this.db.prepare(
      RAFT_RS_SCHEMA_SQL.SELECT_TABLE_PRESENT);
    if (RAFT_RS_RECORD_TABLES.some((table) =>
      tablePresent.get(table) !== undefined)) {
      return;
    }
    this.transaction(() => {
      this.db.exec(RAFT_RS_SQL.CREATE_LOG_TABLE);
      this.db.exec(RAFT_RS_SQL.CREATE_HARD_STATE_TABLE);
      this.db.exec(RAFT_RS_SQL.CREATE_APPLIED_STATE_TABLE);
      this.db.exec(RAFT_RS_SQL.CREATE_SNAPSHOT_TABLE);
    });
  }

  /**
   * Record that a durable write happened, in order.
   * @param {string} write - A RAFT_RS_HOST_WRITE name.
   * @param {Object} detail - What the write carried.
   * @private
   */
  record(write, detail) {
    this.journal.push(Object.freeze({write, ...detail}));
  }

  /** The durable writes made so far, in the order they were made.
   * @return {Array<Object>} The journal. */
  writesMade() {
    return this.journal.slice();
  }

  /** Forget the journal without touching the record. */
  clearJournal() {
    this.journal.length = 0;
  }

  /**
   * Whether the store may write now: only when its connection is in
   * autocommit or inside a transaction the store itself opened. A transaction
   * someone else opened on the shared connection (a user session's `BEGIN`)
   * would absorb the write, and its ROLLBACK would erase consensus rows.
   * @return {string} A RAFT_RS_PERSISTENCE_ADMISSION state.
   */
  persistenceAdmission() {
    return this.db.inTransaction && this.ownTransactionDepth === 0 ?
      RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN :
      RAFT_RS_PERSISTENCE_ADMISSION.ADMITTED;
  }

  /**
   * Refuse, with a typed error, a write the connection cannot admit.
   * @private
   */
  admitWrite() {
    const admission = this.persistenceAdmission();
    if (admission !== RAFT_RS_PERSISTENCE_ADMISSION.ADMITTED) {
      throw Object.assign(
        new Error(RAFT_RS_STORE_ERROR_MSG.USER_TRANSACTION_OPEN),
        {code: RAFT_RS_STORE_ERROR_CODE.USER_TRANSACTION_OPEN, admission});
    }
  }

  /**
   * Run a unit of work as one SQLite transaction the store opens itself;
   * refused while a transaction the store did not open is in progress.
   * @param {Function} work - The work to run.
   * @return {*} Whatever the work returned.
   */
  transaction(work) {
    this.admitWrite();
    this.ownTransactionDepth += 1;
    try {
      return this.db.transaction(work)();
    } finally {
      this.ownTransactionDepth -= 1;
    }
  }

  /** Persist the storage-bearing portion of one Ready atomically. */
  persistReady(groupId, ready) {
    return this.transaction(() => {
      if (ready.snapshot) {
        this.putSnapshot(groupId, ready.snapshot);
      }
      this.appendEntries(groupId, ready.entries || []);
      if (ready.hardState) {
        this.putHardState(groupId, ready.hardState);
      }
    });
  }

  /**
   * Durably append entries, replacing any conflicting suffix first, exactly as
   * raft-rs's own storage append does.
   * @param {string} groupId - The group.
   * @param {Array<Object>} entries - Ready entries from the core.
   */
  appendEntries(groupId, entries) {
    this.admitWrite();
    if (entries.length === 0) {
      return;
    }
    this.db.prepare(RAFT_RS_SQL.DELETE_LOG_FROM)
      .run(groupId, toExactInteger(entries[0].index));
    const insert = this.db.prepare(RAFT_RS_SQL.INSERT_LOG_ENTRY);
    for (const entry of entries) {
      insert.run(
        groupId,
        toExactInteger(entry.index),
        toExactInteger(entry.term),
        entry.entryType,
        entry.data === undefined ? null : entry.data,
      );
    }
    this.record(RAFT_RS_HOST_WRITE.ENTRIES, {
      groupId,
      firstIndex: entries[0].index,
      lastIndex: entries[entries.length - 1].index,
    });
  }

  /**
   * Durably store the hard state: term, vote and commit index together.
   * @param {string} groupId - The group.
   * @param {Object} hardState - {term, vote, commit} as decimal strings.
   */
  putHardState(groupId, hardState) {
    this.admitWrite();
    this.db.prepare(RAFT_RS_SQL.UPSERT_HARD_STATE).run(
      groupId,
      toExactInteger(hardState.term),
      toExactInteger(hardState.vote),
      toExactInteger(hardState.commit),
    );
    this.record(RAFT_RS_HOST_WRITE.HARD_STATE, {groupId, ...hardState});
  }

  /**
   * Durably move the commit index the LightReady reported.
   * @param {string} groupId - The group.
   * @param {string} commitIndex - The commit index as a decimal string.
   */
  putCommitIndex(groupId, commitIndex) {
    this.admitWrite();
    this.db.prepare(RAFT_RS_SQL.UPSERT_COMMIT_INDEX)
      .run(groupId, toExactInteger(commitIndex));
    this.record(RAFT_RS_HOST_WRITE.COMMIT_INDEX, {groupId, commitIndex});
  }

  /**
   * Durably record the applied index together with the configuration state
   * that index includes. One statement writes both columns: there is no way
   * to move one without the other.
   * @param {string} groupId - The group.
   * @param {string} appliedIndex - The applied index as a decimal string.
   * @param {Object} confState - The ConfState the core reported.
   * @param {string} [write] - Which contract write this is.
   */
  putAppliedState(groupId, appliedIndex, confState,
    write = RAFT_RS_HOST_WRITE.CONF_STATE_AND_APPLIED) {
    this.admitWrite();
    this.db.prepare(RAFT_RS_SQL.UPSERT_APPLIED_STATE).run(
      groupId,
      toExactInteger(appliedIndex),
      ...confStateColumns(confState),
    );
    this.record(write, {groupId, appliedIndex, confState});
  }

  /**
   * Durably record a created group's first applied state (index 0, its
   * bootstrap configuration) together with its participation gate: the
   * committed index its bootstrap configuration was read at and, when that
   * configuration already names this replica a voter, its admission index.
   * One statement, like every applied-state write.
   * @param {string} groupId - The group.
   * @param {Object} confState - The bootstrap ConfState the core reported.
   * @param {Object} gate - {bootstrapIndex, admissionIndex} as decimal
   *   strings; admissionIndex null while this replica is not admitted.
   */
  putBootstrapAppliedState(groupId, confState, {bootstrapIndex,
    admissionIndex}) {
    this.admitWrite();
    this.db.prepare(RAFT_RS_SQL.UPSERT_BOOTSTRAP_APPLIED_STATE).run(
      groupId,
      toExactInteger(RAFT_RS_ZERO_INDEX),
      ...confStateColumns(confState),
      toExactInteger(bootstrapIndex),
      admissionIndex === null ? null : toExactInteger(admissionIndex),
    );
    this.record(RAFT_RS_HOST_WRITE.CONF_STATE_AND_APPLIED, {groupId,
      appliedIndex: RAFT_RS_ZERO_INDEX, confState, bootstrapIndex,
      admissionIndex});
  }

  /**
   * Durably record the index of the applied entry that admitted this replica
   * as a voter. Called inside the application transaction of that entry.
   * @param {string} groupId - The group.
   * @param {string} admissionIndex - The entry's index as a decimal string.
   */
  putAdmissionIndex(groupId, admissionIndex) {
    this.admitWrite();
    this.db.prepare(RAFT_RS_SQL.UPDATE_ADMISSION_INDEX)
      .run(toExactInteger(admissionIndex), groupId);
  }

  /**
   * Durably store a snapshot and the configuration it carries.
   * @param {string} groupId - The group.
   * @param {Object} snapshot - A Ready snapshot from the core.
   */
  putSnapshot(groupId, snapshot) {
    this.admitWrite();
    const metadata = snapshot.metadata || {};
    this.db.prepare(RAFT_RS_SQL.UPSERT_SNAPSHOT).run(
      groupId,
      toExactInteger(metadata.index || RAFT_RS_ZERO_INDEX),
      toExactInteger(metadata.term || RAFT_RS_ZERO_INDEX),
      snapshot.data === undefined ? null : snapshot.data,
      ...confStateColumns(metadata.confState || emptyConfState()),
    );
    this.record(RAFT_RS_HOST_WRITE.SNAPSHOT, {
      groupId,
      index: metadata.index || RAFT_RS_ZERO_INDEX,
    });
  }

  /**
   * Read one group's whole durable Raft record. A table it cannot read is
   * named on the error it throws (readRecordTable).
   * @param {string} groupId - The group.
   * @return {Object} {hardState, confState, appliedIndex, bootstrapIndex,
   *   admissionIndex, entries, snapshot}; the two gate indices are decimal
   *   strings, or null when the record holds none.
   */
  readDurableRecord(groupId) {
    const {hardStateRow, appliedRow} = this.readProgressRows(groupId);
    const snapshotRow = readRecordTable(RAFT_RS_TABLE.SNAPSHOT, () =>
      this.db.prepare(RAFT_RS_SQL.SELECT_SNAPSHOT)
        .safeIntegers(true).get(groupId));
    const entryRows = readRecordTable(RAFT_RS_TABLE.LOG, () =>
      this.db.prepare(RAFT_RS_SQL.SELECT_LOG_ENTRIES)
        .safeIntegers(true).all(groupId));
    return {
      hardState: hardStateRow ? {
        term: fromExactInteger(hardStateRow.term),
        vote: fromExactInteger(hardStateRow.vote),
        commit: fromExactInteger(hardStateRow.commit_index),
      } : null,
      appliedIndex: appliedRow ?
        fromExactInteger(appliedRow.applied_index) :
        RAFT_RS_ZERO_INDEX,
      confState: appliedRow ? confStateFromRow(appliedRow) : emptyConfState(),
      bootstrapIndex: nullableExactInteger(appliedRow?.bootstrap_index),
      admissionIndex: nullableExactInteger(appliedRow?.admission_index),
      entries: entryRows.map((row) => ({
        index: fromExactInteger(row.log_index),
        term: fromExactInteger(row.term),
        entryType: Number(row.entry_type),
        ...(row.data === null ? {} : {data: row.data}),
      })),
      snapshot: snapshotRow ? {
        ...(snapshotRow.data === null ? {} : {data: snapshotRow.data}),
        metadata: {
          index: fromExactInteger(snapshotRow.snapshot_index),
          term: fromExactInteger(snapshotRow.snapshot_term),
          confState: confStateFromRow(snapshotRow),
        },
      } : null,
    };
  }

  /**
   * The hard-state and applied-state rows of one group.
   * @param {string} groupId - The group.
   * @return {Object} {hardStateRow, appliedRow}, each undefined when absent.
   * @private
   */
  readProgressRows(groupId) {
    return {
      hardStateRow: readRecordTable(RAFT_RS_TABLE.HARD_STATE, () =>
        this.db.prepare(RAFT_RS_SQL.SELECT_HARD_STATE)
          .safeIntegers(true).get(groupId)),
      appliedRow: readRecordTable(RAFT_RS_TABLE.APPLIED_STATE, () =>
        this.db.prepare(RAFT_RS_SQL.SELECT_APPLIED_STATE)
          .safeIntegers(true).get(groupId)),
    };
  }

  /**
   * Read one group's durable progress without its log: the commit index of
   * its hard state and its applied index.
   * @param {string} groupId - The group.
   * @return {Object} {commitIndex, appliedIndex} as decimal strings (zero
   *   when the group has no such row).
   */
  readDurableProgress(groupId) {
    const {hardStateRow, appliedRow} = this.readProgressRows(groupId);
    return {
      commitIndex: hardStateRow ?
        fromExactInteger(hardStateRow.commit_index) : RAFT_RS_ZERO_INDEX,
      appliedIndex: appliedRow ?
        fromExactInteger(appliedRow.applied_index) : RAFT_RS_ZERO_INDEX,
    };
  }

  /**
   * Read one group's applied proposals from an existing connection: the
   * NORMAL entries that carry a payload, at or below the durable applied
   * index, each decoded through the proposal codec. Configuration changes
   * belong to the runtime and are never decoded here.
   *
   * Read-only and DDL-free: when the record's tables do not exist the group
   * has no applied proposals and nothing is created. An undecodable applied
   * entry fails closed with the codec's typed error.
   * @param {Object} db - An open better-sqlite3 database.
   * @param {string} groupId - The group.
   * @return {Array<Object>} Frozen {index, term, command} records in log
   *   order, index and term as decimal strings.
   */
  static readCommittedEntriesIn(db, groupId) {
    const {present} = db.prepare(
      RAFT_RS_SQL.COUNT_LOG_AND_APPLIED_STATE_TABLES).get();
    if (present !== LOG_AND_APPLIED_STATE_TABLE_COUNT) {
      return [];
    }
    return db.prepare(RAFT_RS_SQL.SELECT_APPLIED_PROPOSAL_ENTRIES)
      .safeIntegers(true).all(groupId, RAFT_RS_ENTRY_TYPE.NORMAL)
      .map((row) => Object.freeze({
        index: fromExactInteger(row.log_index),
        term: fromExactInteger(row.term),
        command: decodeCommittedProposal(
          Buffer.from(row.data, PAYLOAD_ENCODING)),
      }));
  }

  /**
   * Read one group's durable applied index from an existing connection.
   * Read-only and DDL-free.
   * @param {Object} db - An open better-sqlite3 database.
   * @param {string} groupId - The group.
   * @return {string|null} The applied index as a decimal string, or null when
   *   the group has no applied-state row (or the table does not exist).
   */
  static readAppliedIndexIn(db, groupId) {
    const {present} = db.prepare(RAFT_RS_SQL.COUNT_APPLIED_STATE_TABLE).get();
    if (present === 0) {
      return null;
    }
    const row = db.prepare(RAFT_RS_SQL.SELECT_APPLIED_STATE)
      .safeIntegers(true).get(groupId);
    return row ? fromExactInteger(row.applied_index) : null;
  }

  /**
   * Whether the record's schema carries the participation gate: a table
   * created before the gate existed lacks its columns, and such a record
   * cannot prove this replica's role (owner decisions O1, O3).
   * @return {string} A RAFT_RS_RECORD_COMPATIBILITY state.
   */
  recordCompatibility() {
    const columns = new Set(readRecordTable(RAFT_RS_TABLE.APPLIED_STATE, () =>
      this.db.prepare(RAFT_RS_SQL.SELECT_APPLIED_STATE_COLUMNS).all())
      .map((row) => row.name));
    if (columns.size === 0) {
      return RAFT_RS_RECORD_COMPATIBILITY.TABLE_MISSING;
    }
    return RAFT_RS_PARTICIPATION_GATE_COLUMNS.every((column) =>
      columns.has(column)) ? RAFT_RS_RECORD_COMPATIBILITY.COMPATIBLE :
      RAFT_RS_RECORD_COMPATIBILITY.PRE_GATE;
  }

  /**
   * Whether this group has a durable record to come back from.
   *
   * A named question rather than an exception: a caller deciding between
   * creating a fresh group and restoring one asks it, and gets a state
   * instead of reading emptiness out of a thrown error.
   * @param {string} groupId - The group.
   * @return {boolean} Whether a record exists.
   */
  hasDurableRecord(groupId) {
    const record = this.readDurableRecord(groupId);
    return record.hardState !== null || record.entries.length > 0 ||
      record.confState.voters.length > 0;
  }

  /**
   * Whether a group has a durable record in a database, asked without opening
   * a store: this creates no table and writes nothing. A database that lacks
   * the record's tables has no record. The predicate is hasDurableRecord's
   * own, run on a read view of the database that skips the constructor's DDL.
   * @param {Object} db - A better-sqlite3 database.
   * @param {string} groupId - The group.
   * @return {boolean} Whether a record exists.
   */
  static hasDurableRecordIn(db, groupId) {
    const tablePresent = db.prepare(RAFT_RS_SCHEMA_SQL.SELECT_TABLE_PRESENT);
    if (!RAFT_RS_RECORD_TABLES.every((table) =>
      tablePresent.get(table) !== undefined)) {
      return false;
    }
    const readView = Object.create(RaftRsDurableStore.prototype, {
      db: {value: db},
    });
    return readView.hasDurableRecord(groupId);
  }
}

export {RaftRsDurableStore};
