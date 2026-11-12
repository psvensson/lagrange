/**
 * Read-only implementation of the replica lifecycle owner's observations.
 * Owns the file/snapshot reads and their typed classifications for removal
 * and snapshot admission. Never creates schema, births rows, stamps history,
 * acquires runtime authority or grants an irreversible effect. The lifecycle
 * owner keeps its named entry points; administration composes the group record
 * beside the lifecycle row in the same read transaction.
 */
import fs from 'node:fs';
import {SQLiteConnection} from '../storage/sqlite-prepared-statement-owner.js';
import {DURABLE_FILE_PRESENCE, readDurableFilePresence} from
  '../storage/durable-file-presence.js';
import {RaftRsDurableStore} from './raft-rs-durable-store.js';
import {RAFT_RS_TABLE} from './raft-rs-durable-store-constants.js';
import {RAFT_RS_OPENING_HISTORY} from './raft-rs-opening-history-constants.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {LIFECYCLE_STATE, REPLICA_LIFECYCLE_TABLE, retiredRefusalReason} from
  './raft-rs-replica-lifecycle-constants.js';

// What a held row says about the replica's consensus record (the `opening`
// of a lifecycle read). NEVER_OPENED is positive, from one read snapshot: an
// active row whose native history was never established (the row's own
// monotonic fact: establishment is written in the transaction that persists
// the first consensus state, and never reverts) in a database holding no row
// in any consensus table. Such a replica never voted, logged or applied
// anything: its database holds its schema and nothing a group depends on.
const DURABLE_LIFECYCLE_OPENING = Object.freeze({
  NEVER_OPENED: 'lifecycle-never-opened',
  OPENED: 'lifecycle-opened',
});

const SQL_LIST_SEPARATOR = ', ';
function frozenResult(outcome, reason, detail = null) {
  return Object.freeze({outcome, reason, detail});
}

const SNAPSHOT_RECEIVER_REASON = Object.freeze({
  FRESH: 'snapshot-receiver-fresh',
  ABSENT: 'snapshot-receiver-target-absent',
  HISTORY: 'snapshot-receiver-history-present',
  IDENTITY: 'snapshot-receiver-identity-mismatch',
  UNAVAILABLE: 'snapshot-receiver-unavailable',
  JOURNAL: 'snapshot-receiver-journal-pending',
  STAGING: 'snapshot-receiver-staging-mismatch',
});
const SNAPSHOT_RECEIVER_JOURNALS = Object.freeze(['-wal', '-journal']);
const FILE_ABSENT_CODE = 'ENOENT';

// The receiver's one lifecycle row names another group, peer or replica, or
// carries no incarnation.
function receiverRowIdentityMismatch(row, request) {
  return row.group_id !== request.groupId ||
    row.peer_id !== request.peerId || row.replica_identity !== request.replicaIdentity ||
    typeof row.incarnation !== 'string' || row.incarnation.length === 0;
}

function snapshotEstablishedReceiver(db, request, incarnation) {
  if (!RaftRsDurableStore.hasDurableRecordIn(db, request.groupId)) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.HISTORY);
  }
  RaftRsDurableStore.readRetainedHistoryIn(db, request.groupId);
  const record = RaftRsDurableStore.readDurableRecordIn(db, request.groupId);
  const snapIndex = BigInt(request.snapshotAppliedIndex ?? '0');
  if (record.bootstrapIndex === null || record.hardState === null ||
      BigInt(record.appliedIndex) > snapIndex || BigInt(record.hardState.commit) > snapIndex) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.HISTORY);
  }
  return frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK, SNAPSHOT_RECEIVER_REASON.FRESH,
    Object.freeze({incarnation, bootstrapIndex: record.bootstrapIndex,
      admissionIndex: record.admissionIndex, hardState: Object.freeze({...record.hardState}),
      appliedIndex: record.appliedIndex}));
}

function hasFreshReceiverConsensusRows(db, tables) {
  return Object.values(RAFT_RS_TABLE).some((table) =>
    tables.includes(table) &&
    Boolean(db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()));
}

function validateReceiverLifecycleRow(row, request, imported) {
  if (receiverRowIdentityMismatch(row, request)) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.IDENTITY);
  }
  if (row.state !== LIFECYCLE_STATE.ACTIVE) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, retiredRefusalReason(row.reason));
  }
  if (imported && row.native_history_state !== RAFT_RS_OPENING_HISTORY.ESTABLISHED) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.HISTORY);
  }
}

// A native FRESH_CREATE cannot replace established receiver history. Reseed or
// live catchup needs its own existing authority; a valid checkpoint is not it.
function snapshotReceiverRow(db, request, imported, readEstablished = false) {
  const observed = lifecycleRowOf(db, request.groupId, request.replicaIdentity, {});
  if (!holdsLifecycleRow(observed)) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, observed.reason);
  }
  if (!imported && observed.opening !== DURABLE_LIFECYCLE_OPENING.NEVER_OPENED) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.HISTORY);
  }
  const rows = db.prepare(`SELECT * FROM ${REPLICA_LIFECYCLE_TABLE} LIMIT 2`).all();
  if (rows.length !== 1) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.IDENTITY);
  }
  const row = rows[0];
  const refused = validateReceiverLifecycleRow(row, request, imported);
  if (refused) return refused;
  return readEstablished ? snapshotEstablishedReceiver(db, request, row.incarnation) :
    snapshotReceiverFresh(row.incarnation);
}

function snapshotReceiverFresh(incarnation) {
  return frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK, SNAPSHOT_RECEIVER_REASON.FRESH,
    Object.freeze({incarnation}));
}

function snapshotFileStat(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === FILE_ABSENT_CODE) return null;
    throw error;
  }
}

function inspectSnapshotLifecycleFile(file, request, imported = false, readEstablished = false) {
  // Never discard uncheckpointed receiver bytes. A read-only SQLite handle is
  // not proof that another writer has relinquished the required closed boundary.
  for (const suffix of SNAPSHOT_RECEIVER_JOURNALS) {
    const journal = snapshotFileStat(`${file}${suffix}`);
    if (journal && (!journal.isFile() || journal.size > 0)) {
      return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.JOURNAL);
    }
  }
  const filePresence = readDurableFilePresence(file);
  // Positive absence is a distinct target fact, not a fresh lifecycle. Only
  // the CREATE-authorized installer may consume it to install a new target.
  if (filePresence.presence === DURABLE_FILE_PRESENCE.ABSENT && !imported) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK, SNAPSHOT_RECEIVER_REASON.ABSENT,
      Object.freeze({incarnation: null}));
  }
  if (filePresence.presence !== DURABLE_FILE_PRESENCE.PRESENT) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.UNAVAILABLE);
  }
  const db = new SQLiteConnection(file, {readonly: true, fileMustExist: true});
  try {
    return db.transaction(() =>
      snapshotReceiverRow(db, request, imported, readEstablished))();
  } finally {
    db.close();
  }
}

/** Read receiver facts, without creating or migrating lifecycle/native state.
 * A caller must re-read before swap; this result is not durable permission.
 * @param {Object} request - Exact identity, receiverDbPath and optional stagedDbPath.
 * @return {Object} Frozen fresh-receiver/incarnation result or typed refusal.
 */
function inspectReplicaLifecycleForSnapshot(request) {
  try {
    const established = request.allowEstablishedReceiver === true;
    const receiver = inspectSnapshotLifecycleFile(
      request.receiverDbPath, request, established, established);
    if (receiver.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK || !request.stagedDbPath) {
      return receiver;
    }
    const staged = inspectSnapshotLifecycleFile(request.stagedDbPath, request, true);
    if (staged.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK ||
        receiver.detail.incarnation !== null &&
        receiver.detail.incarnation !== staged.detail.incarnation) {
      return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.STAGING);
    }
    return receiver;
  } catch (_error) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.UNAVAILABLE);
  }
}

// What a read of a replica database's lifecycle row found when it holds no
// such row, or cannot say: none is a lifecycle state. ABSENT is positive and
// is one fact only: the database file is not there (durable-file-presence.js;
// a lookup that failed is never an absence). Everything else that holds no
// row for the identity is UNREADABLE, each with its own reason and, where a
// read failed, its cause {code, subject}: the file's presence unknown or its
// database not readable (UNREADABLE), a database without the lifecycle table
// (TABLE_ABSENT: every database is born with the table, so one without it
// lost it or was never born by this owner), and a table without a row for
// the identity (ROW_ABSENT: every database is born with its replica's row,
// so the file is another replica's or lost its row).
const NO_ROW_FIELDS = Object.freeze({incarnation: null, peerId: null,
  retirementEvidence: null, opening: null, cause: null});
const UNREADABLE_STATE = 'unreadable';
const DURABLE_LIFECYCLE_READ = Object.freeze({
  ABSENT: Object.freeze({state: 'absent', reason: 'lifecycle-database-absent',
    ...NO_ROW_FIELDS}),
  UNREADABLE: Object.freeze({state: UNREADABLE_STATE,
    reason: 'lifecycle-database-unreadable', ...NO_ROW_FIELDS}),
  TABLE_ABSENT: Object.freeze({state: UNREADABLE_STATE,
    reason: 'lifecycle-table-absent', ...NO_ROW_FIELDS}),
  ROW_ABSENT: Object.freeze({state: UNREADABLE_STATE,
    reason: 'lifecycle-row-absent', ...NO_ROW_FIELDS}),
  ROW_INVALID: Object.freeze({state: UNREADABLE_STATE,
    reason: 'lifecycle-row-invalid', ...NO_ROW_FIELDS}),
});
// What a failed read was reading (the `subject` of an UNREADABLE cause).
const LIFECYCLE_READ_SUBJECT = Object.freeze({
  FILE: 'replica-database-file',
  SCHEMA: 'replica-database-schema',
  LIFECYCLE: REPLICA_LIFECYCLE_TABLE,
  CONSENSUS: 'consensus-record-tables',
  BESIDE: 'beside-record',
});
const UNCODED_READ_FAILURE = 'lifecycle-read-failed';
const NOTHING_BESIDE = Object.freeze({beside: null});
const SELECT_CONSENSUS_TABLES = `SELECT name FROM sqlite_master
  WHERE type = 'table' AND name IN (${Object.values(RAFT_RS_TABLE)
    .map((name) => `'${name}'`).join(SQL_LIST_SEPARATOR)})`;

function snapshotOf(lifecycle) {
  return Object.freeze({lifecycle, ...NOTHING_BESIDE});
}

function unreadableBecause(code, subject) {
  return Object.freeze({...DURABLE_LIFECYCLE_READ.UNREADABLE,
    cause: Object.freeze({code, subject})});
}

// The recorded evidence, or null (none, or one that cannot be parsed).
function retirementEvidenceOf(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }
  try {
    const evidence = JSON.parse(raw);
    return evidence && typeof evidence === 'object' ?
      Object.freeze(evidence) : null;
  } catch (_error) {
    return null;
  }
}

// The consensus tables the database holds (none before a store opened it).
function consensusTablesIn(db) {
  return db.prepare(SELECT_CONSENSUS_TABLES).all().map(({name}) => name);
}

function openingOf(db, row, progress) {
  if (row.state !== LIFECYCLE_STATE.ACTIVE ||
      row.native_history_state !== RAFT_RS_OPENING_HISTORY.NEVER_OPENED) {
    return DURABLE_LIFECYCLE_OPENING.OPENED;
  }
  progress.subject = LIFECYCLE_READ_SUBJECT.CONSENSUS;
  return hasFreshReceiverConsensusRows(db, consensusTablesIn(db)) ?
    DURABLE_LIFECYCLE_OPENING.OPENED : DURABLE_LIFECYCLE_OPENING.NEVER_OPENED;
}

// `progress.subject` names what is being read, for the cause of a failure.
function lifecycleRowOf(db, groupId, replicaIdentity, progress) {
  progress.subject = LIFECYCLE_READ_SUBJECT.SCHEMA;
  const table = db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(REPLICA_LIFECYCLE_TABLE);
  if (table === undefined) {
    return DURABLE_LIFECYCLE_READ.TABLE_ABSENT;
  }
  progress.subject = LIFECYCLE_READ_SUBJECT.LIFECYCLE;
  const row = db.prepare(`
    SELECT * FROM ${REPLICA_LIFECYCLE_TABLE}
    WHERE group_id = ? AND replica_identity = ?
  `).get(String(groupId), String(replicaIdentity));
  if (row === undefined) return DURABLE_LIFECYCLE_READ.ROW_ABSENT;
  if (typeof row.incarnation !== 'string' || row.incarnation.length === 0) {
    return DURABLE_LIFECYCLE_READ.ROW_INVALID;
  }
  return Object.freeze({state: row.state, reason: String(row.reason ?? ''),
    incarnation: row.incarnation,
    peerId: String(row.peer_id),
    retirementEvidence: retirementEvidenceOf(row.retirement_evidence),
    opening: openingOf(db, row, progress), cause: null});
}

function holdsLifecycleRow(lifecycle) {
  return lifecycle.state === LIFECYCLE_STATE.ACTIVE ||
    lifecycle.state === LIFECYCLE_STATE.RETIRED;
}

function readPresentDatabase(dbPath, groupId, replicaIdentity, readBeside) {
  const progress = {subject: LIFECYCLE_READ_SUBJECT.FILE};
  try {
    const db = new SQLiteConnection(dbPath, {readonly: true, fileMustExist: true});
    try {
      return db.transaction(() => {
        const lifecycle = lifecycleRowOf(db, groupId, replicaIdentity,
          progress);
        if (readBeside === null || !holdsLifecycleRow(lifecycle)) {
          return snapshotOf(lifecycle);
        }
        progress.subject = LIFECYCLE_READ_SUBJECT.BESIDE;
        return Object.freeze({lifecycle, beside: readBeside(db)});
      })();
    } finally {
      db.close();
    }
  } catch (error) {
    return snapshotOf(unreadableBecause(typeof error?.code === 'string' ?
      error.code : UNCODED_READ_FAILURE, progress.subject));
  }
}

/**
 * The durable lifecycle row of exactly one (group, replica identity) and,
 * when the file holds that row, whatever else its reader takes from the SAME
 * read snapshot of the file - read read-only, without opening a runtime or
 * creating a database. `readBeside(db)` runs only beside a held row; a read
 * of it that throws makes the whole answer UNREADABLE (cause subject BESIDE).
 * @param {string} dbPath - The replica's database file.
 * @param {string} groupId
 * @param {string} replicaIdentity
 * @param {Function|null} readBeside - (db) => value, or null.
 * @return {Object} Frozen {lifecycle, beside}; beside is null without a row.
 */
function readDurableReplicaLifecycleBeside(dbPath, groupId, replicaIdentity,
  readBeside) {
  const file = readDurableFilePresence(dbPath);
  if (file.presence === DURABLE_FILE_PRESENCE.ABSENT) {
    return snapshotOf(DURABLE_LIFECYCLE_READ.ABSENT);
  }
  if (file.presence !== DURABLE_FILE_PRESENCE.PRESENT) {
    return snapshotOf(unreadableBecause(file.cause.code,
      LIFECYCLE_READ_SUBJECT.FILE));
  }
  return readPresentDatabase(dbPath, groupId, replicaIdentity, readBeside);
}

/**
 * The durable lifecycle row of exactly one (group, replica identity), read
 * read-only from a replica database file without opening a runtime or
 * creating a database (the read-only connection may leave the file's
 * shared-memory sidecars; it never changes a page of the database):
 * {state, reason, incarnation, peerId, retirementEvidence, opening, cause}.
 * ABSENT is the positively missing file alone; a database that cannot be
 * read, one without the lifecycle table and one without a row for the
 * identity are UNREADABLE with their reason (and cause) - never a lifecycle
 * state, never ABSENT. A held row says whether the replica was NEVER_OPENED.
 * @param {string} dbPath - The replica's database file.
 * @param {string} groupId
 * @param {string} replicaIdentity
 * @return {Object} Frozen {state, reason, incarnation, peerId,
 *   retirementEvidence, opening, cause}.
 */
function readDurableReplicaLifecycle(dbPath, groupId, replicaIdentity) {
  return readDurableReplicaLifecycleBeside(dbPath, groupId, replicaIdentity,
    null).lifecycle;
}

export {
  DURABLE_LIFECYCLE_OPENING,
  DURABLE_LIFECYCLE_READ,
  LIFECYCLE_READ_SUBJECT,
  inspectReplicaLifecycleForSnapshot,
  readDurableReplicaLifecycle,
  readDurableReplicaLifecycleBeside,
};
