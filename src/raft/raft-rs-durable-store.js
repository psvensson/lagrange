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
//
// What survives what (owner decision O4, 2026-10-05, "option 2"): the
// connection runs journal_mode WAL with synchronous NORMAL, so a commit
// survives a process crash. A Ready raft-rs says must be synced (a changed
// term or vote, appended entries, a snapshot) is committed SYNCED: SQLite
// fsyncs the WAL as part of its COMMIT, before the runtime hands any of that
// Ready's messages to the transport, so a granted vote and an acknowledged
// append also survive a power loss or an OS crash. Because the WAL is
// append-only, that sync also makes every earlier commit of the file durable.
// Everything else - commit-index-only hard state, applied progress, the
// application's own writes - keeps NORMAL and may be lost to a power loss;
// it is recomputed from the synced log on restart.

import {
  RAFT_RS_BOOLEAN_COLUMN,
  RAFT_RS_COMMIT_DURABILITY,
  RAFT_RS_CONF_STATE_FIELD,
  RAFT_RS_CONF_STATE_MEMBER_FIELDS,
  RAFT_RS_MEMBERSHIP_GENERATION_COLUMN,
  RAFT_RS_PARTICIPATION_GATE_COLUMNS,
  RAFT_RS_PERSISTENCE_ADMISSION,
  RAFT_RS_RECORD_COMPATIBILITY,
  RAFT_RS_RECORD_TABLES,
  RAFT_RS_SCHEMA_SQL,
  RAFT_RS_SQL,
  RAFT_RS_STORE_ERROR_CODE,
  RAFT_RS_STORE_ERROR_MSG,
  RAFT_RS_SYNCHRONOUS_PRAGMA,
  RAFT_RS_TABLE,
  RAFT_RS_ZERO_INDEX,
} from './raft-rs-durable-store-constants.js';
import {RAFT_RS_HOST_WRITE} from './raft-rs-host-contract.js';
import {decodeCommittedProposal} from './raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from './raft-rs-ready-loop-constants.js';
import {raftRsConfStateKey} from './raft-rs-conf-state-key.js';
import {MEMBERSHIP_ACTION_OBSERVATION, MEMBERSHIP_ACTION_EVIDENCE_REASON,
  observeRetainedMembershipAction} from './raft-rs-committed-membership-context.js';

const DECIMAL_DIGITS = /^\d+$/u;
const PAYLOAD_ENCODING = 'base64';
// The log table and the applied-state table.
const LOG_AND_APPLIED_STATE_TABLE_COUNT = 2;
const MAX_SAFE_RAFT_POSITION = BigInt(Number.MAX_SAFE_INTEGER);
const SNAPSHOT_MEMBERSHIP_GENERATION_BOUNDARY_ERROR =
  'raft-rs snapshot membership generation exceeds or ' +
  'contradicts its applied boundary';

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

function exactSnapshotMembershipGeneration({generation, snapshotIndex,
  confState, appliedRow}) {
  if (generation === null) {
    return null;
  }
  const exactGeneration = toExactInteger(generation);
  const exceedsBoundary = exactGeneration > snapshotIndex ||
    exactGeneration > MAX_SAFE_RAFT_POSITION;
  const currentGeneration = appliedRow === undefined ? null :
    BigInt(appliedRow.membership_generation_index);
  const regresses = currentGeneration !== null &&
    exactGeneration < currentGeneration;
  const contradictsCurrent = currentGeneration !== null &&
    exactGeneration === currentGeneration &&
    snapshotIndex >= BigInt(appliedRow.applied_index) &&
    raftRsConfStateKey(confState) !==
      raftRsConfStateKey(confStateFromRow(appliedRow));
  if (exceedsBoundary || regresses || contradictsCurrent) {
    throw new Error(SNAPSHOT_MEMBERSHIP_GENERATION_BOUNDARY_ERROR);
  }
  return exactGeneration;
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
 * Run work as one SQLite transaction whose COMMIT is synced to disk.
 *
 * `PRAGMA synchronous` is a per-connection setting that SQLite refuses to
 * change inside a transaction, and in WAL mode FULL makes every COMMIT fsync
 * the WAL. So the connection is raised to FULL before BEGIN and set back to
 * its own level after COMMIT or ROLLBACK. better-sqlite3 is synchronous and
 * nothing here awaits, so no other transaction can run on the connection in
 * between. A connection already at FULL or above is left as it is; a call
 * made while a transaction is open is refused, typed, because its commit
 * could not be synced here.
 * @param {Object} db - A better-sqlite3 database.
 * @param {Function} work - The transaction's work.
 * @return {*} Whatever the work returned.
 */
function commitDurably(db, work) {
  if (db.inTransaction) {
    throw Object.assign(
      new Error(RAFT_RS_STORE_ERROR_MSG.DURABLE_COMMIT_INSIDE_TRANSACTION),
      {code: RAFT_RS_STORE_ERROR_CODE.DURABLE_COMMIT_INSIDE_TRANSACTION});
  }
  const level = db.pragma(RAFT_RS_SYNCHRONOUS_PRAGMA.READ, {simple: true});
  if (level >= RAFT_RS_SYNCHRONOUS_PRAGMA.FULL_LEVEL) {
    return db.transaction(work)();
  }
  db.pragma(RAFT_RS_SYNCHRONOUS_PRAGMA.SET_FULL);
  try {
    return db.transaction(work)();
  } finally {
    db.pragma(RAFT_RS_SYNCHRONOUS_PRAGMA.setLevel(level));
  }
}

function readDurableRecordIn(db, groupId) {
  const hardStateRow = readRecordTable(RAFT_RS_TABLE.HARD_STATE, () =>
    db.prepare(RAFT_RS_SQL.SELECT_HARD_STATE).safeIntegers(true).get(groupId));
  const appliedRow = readRecordTable(RAFT_RS_TABLE.APPLIED_STATE, () =>
    db.prepare(RAFT_RS_SQL.SELECT_APPLIED_STATE).safeIntegers(true).get(groupId));
  const snapshotRow = readRecordTable(RAFT_RS_TABLE.SNAPSHOT, () =>
    db.prepare(RAFT_RS_SQL.SELECT_SNAPSHOT).safeIntegers(true).get(groupId));
  const entryRows = readRecordTable(RAFT_RS_TABLE.LOG, () =>
    db.prepare(RAFT_RS_SQL.SELECT_LOG_ENTRIES)
      .safeIntegers(true).all(groupId));
  return {
    hardState: hardStateRow ? {
      term: fromExactInteger(hardStateRow.term),
      vote: fromExactInteger(hardStateRow.vote),
      commit: fromExactInteger(hardStateRow.commit_index),
    } : null,
    appliedIndex: appliedRow ? fromExactInteger(appliedRow.applied_index) :
      RAFT_RS_ZERO_INDEX,
    confState: appliedRow ? confStateFromRow(appliedRow) : emptyConfState(),
    bootstrapIndex: nullableExactInteger(appliedRow?.bootstrap_index),
    admissionIndex: nullableExactInteger(appliedRow?.admission_index),
    membershipGenerationIndex: appliedRow ?
      fromExactInteger(appliedRow.membership_generation_index) :
      RAFT_RS_ZERO_INDEX,
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
        membershipGenerationIndex:
          nullableExactInteger(snapshotRow.membership_generation_index),
      },
    } : null,
  };
}

// The outcome reader accepts the WHOLE retained record, not an arbitrary slice.
// A snapshot may replace any prefix; above its cut the retained suffix must be
// contiguous, terms cannot regress, and durable progress must be represented.
// This is a read-boundary consistency check, not another Raft decision engine.
function actionEvidenceUnavailable() {
  return Object.freeze({kind: MEMBERSHIP_ACTION_OBSERVATION.UNAVAILABLE,
    reason: MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD});
}

function membershipActionRecordBoundary(record) {
  const snapshot = record.snapshot?.metadata;
  const cut = snapshot ? toExactInteger(snapshot.index) : 0n;
  const cutTerm = snapshot ? toExactInteger(snapshot.term) : 0n;
  const applied = toExactInteger(record.appliedIndex);
  const committed = toExactInteger(record.hardState.commit);
  const term = toExactInteger(record.hardState.term);
  if (cut > applied || applied > committed || cutTerm > term ||
      (cut > 0n && cutTerm === 0n)) {
    return null;
  }
  return {cut, cutTerm, committed, term};
}

function membershipActionRecordIsCoherent(record) {
  const boundary = membershipActionRecordBoundary(record);
  if (boundary === null) return false;
  let last = boundary.cut;
  let previousTerm = boundary.cutTerm;
  for (const entry of record.entries) {
    const index = toExactInteger(entry.index);
    if (index <= boundary.cut) continue;
    const term = toExactInteger(entry.term);
    if (index !== last + 1n || term < previousTerm || term > boundary.term) {
      return false;
    }
    last = index;
    previousTerm = term;
  }
  return boundary.committed <= last;
}

/**
 * How durably one Ready must commit: raft-rs's own `Ready::must_sync`, which
 * the binding reports as `mustSync`. A Ready that does not say is synced.
 * @param {Object} ready - A Ready from the core.
 * @return {string} A RAFT_RS_COMMIT_DURABILITY state.
 */
function readyCommitDurability(ready) {
  return ready.mustSync === false ?
    RAFT_RS_COMMIT_DURABILITY.CONNECTION_DEFAULT :
    RAFT_RS_COMMIT_DURABILITY.SYNCED;
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
    this.addMembershipGenerationColumns();
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

  // The configuration-only generation was added after the record shipped.
  // It is additive on every complete or partial record: missing record tables
  // remain missing (and therefore fail closed). An applied row gains neutral
  // generation 0; an old snapshot stays null because native metadata cannot
  // identify the sender's configuration-only generation.
  addMembershipGenerationColumns() {
    const tablePresent = this.db.prepare(
      RAFT_RS_SCHEMA_SQL.SELECT_TABLE_PRESENT);
    const upgrades = [
      [RAFT_RS_TABLE.APPLIED_STATE, RAFT_RS_SQL.SELECT_APPLIED_STATE_COLUMNS,
        RAFT_RS_SQL.ADD_APPLIED_MEMBERSHIP_GENERATION],
      [RAFT_RS_TABLE.SNAPSHOT, RAFT_RS_SQL.SELECT_SNAPSHOT_COLUMNS,
        RAFT_RS_SQL.ADD_SNAPSHOT_MEMBERSHIP_GENERATION],
    ];
    for (const [table, columnsSql, alterSql] of upgrades) {
      if (tablePresent.get(table) === undefined) {
        continue;
      }
      const columns = new Set(this.db.prepare(columnsSql).all()
        .map(({name}) => name));
      if (!columns.has(RAFT_RS_MEMBERSHIP_GENERATION_COLUMN)) {
        this.db.exec(alterSql);
      }
    }
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
   * @param {string} [durability] - A RAFT_RS_COMMIT_DURABILITY state; the
   *   connection's own setting unless SYNCED.
   * @return {*} Whatever the work returned.
   */
  transaction(work,
    durability = RAFT_RS_COMMIT_DURABILITY.CONNECTION_DEFAULT) {
    this.admitWrite();
    this.ownTransactionDepth += 1;
    try {
      return durability === RAFT_RS_COMMIT_DURABILITY.SYNCED ?
        commitDurably(this.db, work) : this.db.transaction(work)();
    } finally {
      this.ownTransactionDepth -= 1;
    }
  }

  /**
   * Persist the storage-bearing portion of one Ready atomically, synced to
   * disk when raft-rs says it must be (see the header). Called before any of
   * the Ready's messages are sent.
   * @param {string} groupId - The group.
   * @param {Object} ready - A Ready from the core.
   */
  persistReady(groupId, ready) {
    return this.transaction(() => {
      if (ready.snapshot) {
        this.putSnapshot(groupId, ready.snapshot);
      }
      this.appendEntries(groupId, ready.entries || []);
      if (ready.hardState) {
        this.putHardState(groupId, ready.hardState);
      }
    }, readyCommitDurability(ready));
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
    write = RAFT_RS_HOST_WRITE.CONF_STATE_AND_APPLIED,
    membershipGenerationIndex = null) {
    this.admitWrite();
    const generation = membershipGenerationIndex === null ? null :
      toExactInteger(membershipGenerationIndex);
    this.db.prepare(RAFT_RS_SQL.UPSERT_APPLIED_STATE).run(
      groupId,
      toExactInteger(appliedIndex),
      ...confStateColumns(confState),
      generation,
      generation,
    );
    this.record(write, {groupId, appliedIndex, confState,
      membershipGenerationIndex});
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
    admissionIndex, membershipGenerationIndex = RAFT_RS_ZERO_INDEX}) {
    this.admitWrite();
    this.db.prepare(RAFT_RS_SQL.UPSERT_BOOTSTRAP_APPLIED_STATE).run(
      groupId,
      toExactInteger(RAFT_RS_ZERO_INDEX),
      ...confStateColumns(confState),
      toExactInteger(bootstrapIndex),
      admissionIndex === null ? null : toExactInteger(admissionIndex),
      toExactInteger(membershipGenerationIndex),
    );
    this.record(RAFT_RS_HOST_WRITE.CONF_STATE_AND_APPLIED, {groupId,
      appliedIndex: RAFT_RS_ZERO_INDEX, confState, bootstrapIndex,
      admissionIndex, membershipGenerationIndex});
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
   * @param {Object} snapshot - A Ready snapshot from the core. Its optional
   *   metadata.membershipGenerationIndex must come from the later checkpoint
   *   owner; native SnapshotMetadata alone leaves it null.
   */
  putSnapshot(groupId, snapshot, membershipGenerationIndex = null) {
    this.admitWrite();
    const metadata = snapshot.metadata || {};
    const snapshotIndex = metadata.index || RAFT_RS_ZERO_INDEX;
    const generation = metadata.membershipGenerationIndex ??
      membershipGenerationIndex;
    const exactSnapshotIndex = toExactInteger(snapshotIndex);
    const confState = metadata.confState || emptyConfState();
    const appliedRow = this.db.prepare(RAFT_RS_SQL.SELECT_APPLIED_STATE)
      .safeIntegers(true).get(groupId);
    const exactGeneration = exactSnapshotMembershipGeneration({generation,
      snapshotIndex: exactSnapshotIndex, confState, appliedRow});
    this.db.prepare(RAFT_RS_SQL.UPSERT_SNAPSHOT).run(
      groupId,
      exactSnapshotIndex,
      toExactInteger(metadata.term || RAFT_RS_ZERO_INDEX),
      snapshot.data === undefined ? null : snapshot.data,
      ...confStateColumns(confState),
      exactGeneration,
    );
    this.record(RAFT_RS_HOST_WRITE.SNAPSHOT, {
      groupId,
      index: snapshotIndex,
      membershipGenerationIndex: generation === null ? null :
        String(generation),
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
    return readDurableRecordIn(this.db, groupId);
  }

  /** Read historical action evidence from one coherent, committed SQL view.
   * The native owner supplies its OWN group and native decoder, not request data.
   * Refuse any preexisting transaction: its local uncommitted writes are not
   * durable evidence. The read-only transaction below owns a consistent snapshot
   * across every record table; it issues no DDL or persistence mutation.
   * @param {string} groupId - The native owner's group.
   * @param {Object} action - The canonical original action tuple.
   * @param {Function} decodeEntry - The native configuration-entry decoder.
   * @return {Object} Historical evidence, unresolved, or unavailable.
   */
  observeMembershipAction(groupId, action, decodeEntry) {
    if (this.db.inTransaction) return actionEvidenceUnavailable();
    try {
      return this.db.transaction(() => {
        const record = readDurableRecordIn(this.db, groupId);
        if (!membershipActionRecordIsCoherent(record)) return actionEvidenceUnavailable();
        return observeRetainedMembershipAction({groupId, record, action, decodeEntry});
      })();
    } catch {
      return actionEvidenceUnavailable();
    }
  }

  static readDurableRecordIn(db, groupId) {
    return readDurableRecordIn(db, groupId);
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

export {RaftRsDurableStore, commitDurably};
