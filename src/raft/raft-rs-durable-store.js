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
  RAFT_RS_SCHEDULING_ELIGIBILITY,
  RAFT_RS_SQL,
  RAFT_RS_STORE_ERROR_MSG,
  RAFT_RS_ZERO_INDEX,
} from './raft-rs-durable-store-constants.js';
import {RAFT_RS_HOST_WRITE} from './raft-rs-host-contract.js';

const DECIMAL_DIGITS = /^\d+$/u;

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
 * The durable Raft record for the raft-rs-wasm backend.
 */
class RaftRsDurableStore {
  /**
   * @param {Object} db - The replica's own better-sqlite3 database.
   */
  constructor(db) {
    this.db = db;
    this.journal = [];
    this.db.exec(RAFT_RS_SQL.CREATE_LOG_TABLE);
    this.db.exec(RAFT_RS_SQL.CREATE_HARD_STATE_TABLE);
    this.db.exec(RAFT_RS_SQL.CREATE_APPLIED_STATE_TABLE);
    this.db.exec(RAFT_RS_SQL.CREATE_SNAPSHOT_TABLE);
    this.db.exec(RAFT_RS_SQL.CREATE_RETIREMENT_TABLE);
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
   * Run a unit of work as one SQLite transaction.
   * @param {Function} work - The work to run.
   * @return {*} Whatever the work returned.
   */
  transaction(work) {
    return this.db.transaction(work)();
  }

  /**
   * Durably append entries, replacing any conflicting suffix first, exactly as
   * raft-rs's own storage append does.
   * @param {string} groupId - The group.
   * @param {Array<Object>} entries - Ready entries from the core.
   */
  appendEntries(groupId, entries) {
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
    this.db.prepare(RAFT_RS_SQL.UPSERT_APPLIED_STATE).run(
      groupId,
      toExactInteger(appliedIndex),
      ...confStateColumns(confState),
    );
    this.record(write, {groupId, appliedIndex, confState});
  }

  /**
   * Durably store a snapshot and the configuration it carries.
   * @param {string} groupId - The group.
   * @param {Object} snapshot - A Ready snapshot from the core.
   */
  putSnapshot(groupId, snapshot) {
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
   * Read one group's whole durable Raft record.
   * @param {string} groupId - The group.
   * @return {Object} {hardState, confState, appliedIndex, entries, snapshot}.
   */
  readDurableRecord(groupId) {
    const hardStateRow = this.db.prepare(RAFT_RS_SQL.SELECT_HARD_STATE)
      .safeIntegers(true).get(groupId);
    const appliedRow = this.db.prepare(RAFT_RS_SQL.SELECT_APPLIED_STATE)
      .safeIntegers(true).get(groupId);
    const snapshotRow = this.db.prepare(RAFT_RS_SQL.SELECT_SNAPSHOT)
      .safeIntegers(true).get(groupId);
    const entryRows = this.db.prepare(RAFT_RS_SQL.SELECT_LOG_ENTRIES)
      .safeIntegers(true).all(groupId);
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
   * Durably retire one peer of one group: it is no longer an active local
   * Raft runtime and must not be scheduled again, in this process or in any
   * later one.
   *
   * Idempotent (R14): retiring a peer already retired keeps the first answer,
   * so the record says when the decision was taken rather than when it was
   * last repeated.
   * @param {string} groupId - The group.
   * @param {string} peerId - The raft peer id, as a decimal string.
   * @param {string} retiredAt - When the decision was taken.
   * @return {string} The recorded retirement moment.
   */
  putRetirement(groupId, peerId, retiredAt) {
    // Not journalled: the journal's vocabulary is the raft-rs host contract's
    // Ready-loop writes, and retirement is not one of them.
    this.db.prepare(RAFT_RS_SQL.INSERT_RETIREMENT)
      .run(groupId, peerId, retiredAt);
    return this.readRetirement(groupId, peerId).retiredAt;
  }

  /**
   * Whether this peer may run at all, read from the durable record.
   * @param {string} groupId - The group.
   * @param {string} peerId - The raft peer id, as a decimal string.
   * @return {Object} {eligibility, retiredAt}.
   */
  readRetirement(groupId, peerId) {
    const row = this.db.prepare(RAFT_RS_SQL.SELECT_RETIREMENT)
      .get(groupId, peerId);
    return Object.freeze({
      eligibility: row === undefined ?
        RAFT_RS_SCHEDULING_ELIGIBILITY.ELIGIBLE :
        RAFT_RS_SCHEDULING_ELIGIBILITY.RETIRED,
      retiredAt: row === undefined ? null : row.retired_at,
    });
  }
}

export {RaftRsDurableStore};
