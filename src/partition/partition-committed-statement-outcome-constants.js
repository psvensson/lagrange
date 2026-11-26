// The vocabulary of the committed-statement outcome owner
// (partition-committed-statement-outcome.js): its durable outcome table and
// its one format, the named state of an entry key's record, the identity an
// owner command's record carries, which statement failures are
// deterministic, and which result an applied statement retains (pure rules,
// here so the statement-admission and command owners can apply them without
// an import cycle).
import {createHash} from 'node:crypto';

// The durable record of every committed statement's terminal outcome, owned
// by the partition's committed-entry application. One row per committed
// entry key, written in the SAME SQLite transaction as the statement and the
// rs-raft applied state, so it is replicated state-machine state: every
// replica holds the same row for the same entry, a restart keeps it, and a
// rolled-back apply (an environmental failure, a session heal) leaves none.
// It is the authority for a retry of an entry key: an APPLIED record answers
// the applied statement's own result again (the row retains its affected-row
// count and last insert rowid), a STATEMENT_FAILED record answers the
// original failure. Its rows cross replicas inside a state-machine snapshot image
// (only `_raft_log`/`_raft_state` are excluded). Bound: rows are keyed by the
// committed entry that wrote them (`log_index`), so the table is compacted
// together with the rs-raft log by the snapshot/log-bound quest; until then
// it grows one row per committed statement, exactly like the log.
//
// An owner command (placement, formation, coordinator settlement) records its
// typed result as `owner_result_text` and, with it, its command identity as
// `command_digest` (committedCommandDigest): the CHECK makes an owner result
// without its identity, or an identity without a result, impossible to write.
// `last_insert_rowid` is only ever the inserted-row identity of an SQL
// statement (the nullable insert-result contract).
const PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL = Object.freeze({
  TABLE: '_partition_statement_outcomes',
  CREATE_TABLE: `
      CREATE TABLE IF NOT EXISTS _partition_statement_outcomes (
        entry_key TEXT PRIMARY KEY,
        outcome TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        term INTEGER NOT NULL,
        failure_code TEXT,
        failure_message TEXT,
        changes INTEGER,
        last_insert_rowid INTEGER,
        owner_result_text TEXT,
        command_digest TEXT,
        CHECK ((owner_result_text IS NULL) = (command_digest IS NULL))
      )
    `,
  SELECT_BY_ENTRY_KEY:
    'SELECT outcome, log_index, term, failure_code, failure_message, ' +
    'changes, last_insert_rowid, owner_result_text, command_digest ' +
    'FROM _partition_statement_outcomes WHERE entry_key = ?',
  SELECT_ALL:
    'SELECT entry_key, outcome, log_index, term, failure_code, failure_message, ' +
    'changes, last_insert_rowid, owner_result_text, command_digest ' +
    'FROM _partition_statement_outcomes ORDER BY log_index, entry_key',
  INSERT:
    'INSERT INTO _partition_statement_outcomes ' +
    '(entry_key, outcome, log_index, term, failure_code, failure_message, ' +
    'changes, last_insert_rowid, owner_result_text, command_digest) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  TABLE_COLUMNS: 'PRAGMA table_info(_partition_statement_outcomes)',
  // The store-open format probe: proves the table is readable without
  // reading a row; the decision is the table's definition (CREATE_TABLE).
  FORMAT_PROBE: 'SELECT 1 FROM _partition_statement_outcomes WHERE 0',
});

// The one table format is the owner's definition, CREATE_TABLE (its columns,
// these, and its identity CHECK), decided by the same rule the cold census
// applies (partition-retained-store-observation.js). A store whose table has
// any other definition was written by a build of another format (every
// released build, v0.2.6 to v0.4.0, created it without command_digest;
// development builds before the identity column likewise) and is refused,
// typed and read-only, when it opens - never migrated, never given a column.
// Such a data directory is re-founded (docs/operations-readiness.md).
const PARTITION_COMMITTED_STATEMENT_COLUMNS = Object.freeze([
  'entry_key', 'outcome', 'log_index', 'term', 'failure_code', 'failure_message',
  'changes', 'last_insert_rowid', 'owner_result_text', 'command_digest',
]);

// The format decision at store open (detectCommittedStatementOutcomeFormat).
const PARTITION_COMMITTED_STATEMENT_FORMAT = Object.freeze({
  ABSENT: 'absent',
  CURRENT: 'current',
  UNSUPPORTED: 'unsupported',
});

// The typed codes of the outcome owner's refusals: a store of another table
// format, and an owner result recorded without its identity (or the reverse).
const PARTITION_COMMITTED_STATEMENT_ERROR_CODE = Object.freeze({
  FORMAT_UNSUPPORTED: 'partition_statement_outcome_format_unsupported',
  OWNER_IDENTITY_INVALID: 'partition_statement_outcome_owner_identity_invalid',
});

// Whether a settled record settles one owner command (exact settlement): a
// durable outcome settles only the exact command it proves.
// - UNSETTLED: no record under the entry key.
// - SAME_COMMAND: the record carries this command's digest.
// - OTHER_RECORD: a record of anything else under the same entry key -
//   another command of the same owner, another owner's command, or an SQL
//   statement's record (which carries no digest).
const PARTITION_SETTLED_COMMAND_STATE = Object.freeze({
  UNSETTLED: 'unsettled',
  SAME_COMMAND: 'same_command',
  OTHER_RECORD: 'other_record',
});

// The class of a settled record (named for an OTHER_RECORD collision): an
// owner command's record (it carries a command digest), an applied SQL
// statement's record, or a deterministic statement failure's record.
const PARTITION_COMMITTED_RECORD_CLASS = Object.freeze({
  OWNER_COMMAND: 'owner_command',
  STATEMENT: 'statement',
  STATEMENT_FAILURE: 'statement_failure',
});

// The decision of the owner-command request prelude (ownerCommandPrelude):
// ANSWERED (leadership, admission, exact replay, collision, pause or pending
// join answered it) or PROPOSE (the command is to be proposed).
const PARTITION_OWNER_COMMAND_PRELUDE = Object.freeze({
  ANSWERED: 'answered',
  PROPOSE: 'propose',
});

const COMMAND_DIGEST_ALGORITHM = 'sha256';
const COMMAND_DIGEST_ENCODING = 'hex';
const COMMAND_DIGEST_SEPARATOR = ':';

/**
 * The identity an owner command's outcome record carries: the digest of its
 * type and its canonical text (the pinned body text of a placement or
 * formation command, the settlement text of a coordinator settlement). The
 * proposer's timestamp and address are not part of it, so a new leader's
 * rebuilt command under the same entry is the same command.
 * @param {string} type - The committed command type.
 * @param {string} canonicalText - The command's canonical body text.
 * @return {string} The command digest.
 */
function committedCommandDigest(type, canonicalText) {
  return createHash(COMMAND_DIGEST_ALGORITHM)
    .update(`${type}${COMMAND_DIGEST_SEPARATOR}${canonicalText}`)
    .digest(COMMAND_DIGEST_ENCODING);
}

// What the answer to a settled APPLIED entry key is (R07: a named state, never
// a count read as an outcome). A replay never executes the statement again,
// so the result it answers is the one the outcome row retained:
// - OUTCOME_RETAINED: the row retains the applied statement's result; the
//   replay answers that affected-row count and last insert rowid exactly as
//   the statement's first answer did.
// - OUTCOME_NOT_RETAINED: the row retains no statement result: an owner
//   command's record that carries only its typed owner result (a coordinator
//   settlement). Its count is not known here, so the answer carries none - an
//   unknown count is never zero rows.
const PARTITION_SETTLED_REPLAY = Object.freeze({
  OUTCOME_RETAINED: 'applied-outcome-retained',
  OUTCOME_NOT_RETAINED: 'applied-outcome-not-retained',
});

// Whether an entry key has a recorded terminal outcome (R07: an absent row is
// a named state, never an inferred null).
const PARTITION_COMMITTED_STATEMENT_RECORD_STATE = Object.freeze({
  SETTLED: 'settled',
  UNSETTLED: 'unsettled',
});

// Which failed statements are the state machine's own outcome. Only a
// failure every replica reproduces from the same command over the same state
// may be consumed as STATEMENT_FAILED: these SQLite primary result codes
// (better-sqlite3 reports extended codes, whose primary code is their
// `SQLITE_<NAME>` prefix). Every other SQLite code - busy, locked, I/O,
// full, out of memory, cannot open, corrupt, read-only, interrupted - is the
// host's environment, not the statement's: consuming it would let one
// replica skip an entry the others apply, so it fails the apply closed and
// the committed entry is delivered again.
const PARTITION_DETERMINISTIC_STATEMENT_SQLITE_CODES = Object.freeze(new Set([
  'SQLITE_CONSTRAINT',
  'SQLITE_ERROR',
  'SQLITE_MISMATCH',
  'SQLITE_RANGE',
  'SQLITE_TOOBIG',
]));

// The shape of a SQLite result code: `SQLITE_<PRIMARY>[_<EXTENDED>]`.
const PARTITION_SQLITE_RESULT_CODE = Object.freeze({
  PREFIX: 'SQLITE_',
  SEPARATOR: '_',
  PRIMARY_SEGMENTS: 2,
});

// The errors better-sqlite3 raises in JavaScript, without a SQLite result
// code, when a statement's own parameters cannot be bound (a wrong count or
// an unbindable value): deterministic in the command, so a statement failure
// - but only while the connection is open (a closed connection raises a
// TypeError too, and that is the host's state).
const PARTITION_DETERMINISTIC_STATEMENT_BINDING_ERRORS = Object.freeze(new Set([
  'RangeError',
  'TypeError',
]));

/**
 * The result an applied committed statement retains in its outcome row and
 * answers with, under the nullable insert-result contract (owner ruling
 * 2026-10-11; partition-committed-statement-outcome.js): its affected-row
 * count, and its last insert rowid only when the statement set it - an
 * INSERT or REPLACE (a WITH-headed one included; UPSERT commands render as
 * one) without a DO UPDATE clause that changed at least one row, so every
 * changed row was inserted by it. The connection's last insert rowid is
 * connection state: after a statement that inserted nothing (an UPDATE, a
 * DELETE, index DDL, an ALTER, an INSERT whose every row was ignored, a DO
 * NOTHING, an empty SELECT source) it is whatever last inserted on the
 * connection - an rs-raft log append on the shared connection, an
 * unreplicated local write, a rolled-back allocation (a c' validation, the
 * self-check's ceiling plant) - which differs between replicas. An upsert's
 * changed rows may be updates only, which leave it there too, and SQLite
 * does not report its inserts apart from its updates; so every statement
 * with a DO UPDATE clause (a mixed batch of inserted and updated rows
 * included), and every statement that inserted nothing, retains and answers
 * null, and the row and the answer are the same on every replica (revision
 * 10, 0.0.14).
 * @param {{changes: number, lastInsertRowid: *}} info - The statement's run
 *   info.
 * @param {{retainsInsertRowid: boolean}} kind - Whether the statement is an
 *   INSERT or REPLACE without a DO UPDATE clause (read from its text by the
 *   statement-admission owner).
 * @return {{changes: number, lastInsertRowid: *}} The retained result.
 */
function committedStatementResult(info, {retainsInsertRowid}) {
  return {
    changes: info.changes,
    lastInsertRowid: retainsInsertRowid === true && info.changes > 0 ?
      info.lastInsertRowid : null,
  };
}

// Mirror-effect retention constants owned by the committed-statement outcome
// vocabulary (partition-mirror-effect-retention.js).
const MIRROR_RETENTION_BARRIER_ENTRY_KEY = '__mirror_retention_barrier__';
const MIRROR_RETENTION_BARRIER_KIND = 'PINNED';
const STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW = 256;
const MIRROR_RETENTION_CUSTODY_ACTION = Object.freeze({
  PIN: 'PIN',
  RELEASE: 'RELEASE',
});
const MIRROR_RETENTION_CUSTODY_COMMAND_ERROR = Object.freeze({
  ORIGIN: 'mirror_retention_custody_origin_refused',
  BYTES: 'mirror_retention_custody_bytes_invalid',
});

export {
  committedCommandDigest,
  committedStatementResult,
  MIRROR_RETENTION_BARRIER_ENTRY_KEY,
  MIRROR_RETENTION_BARRIER_KIND,
  MIRROR_RETENTION_CUSTODY_ACTION,
  MIRROR_RETENTION_CUSTODY_COMMAND_ERROR,
  PARTITION_COMMITTED_STATEMENT_COLUMNS,
  PARTITION_COMMITTED_STATEMENT_ERROR_CODE,
  PARTITION_COMMITTED_STATEMENT_FORMAT,
  PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL,
  PARTITION_COMMITTED_RECORD_CLASS,
  PARTITION_COMMITTED_STATEMENT_RECORD_STATE,
  PARTITION_OWNER_COMMAND_PRELUDE,
  PARTITION_SETTLED_COMMAND_STATE,
  PARTITION_DETERMINISTIC_STATEMENT_BINDING_ERRORS,
  PARTITION_DETERMINISTIC_STATEMENT_SQLITE_CODES,
  PARTITION_SETTLED_REPLAY,
  PARTITION_SQLITE_RESULT_CODE,
  STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW,
};
