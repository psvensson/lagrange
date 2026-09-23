// The vocabulary of the committed-statement outcome owner
// (partition-committed-statement-outcome.js): its durable outcome table, the
// named state of an entry key's record, and which statement failures are
// deterministic.

// The durable record of every committed statement's terminal outcome, owned
// by the partition's committed-entry application. One row per committed
// entry key, written in the SAME SQLite transaction as the statement and the
// rs-raft applied state, so it is replicated state-machine state: every
// replica holds the same row for the same entry, a restart keeps it, and a
// rolled-back apply (an environmental failure, a session heal) leaves none.
// It is the authority for a retry of an entry key: an APPLIED record answers
// an idempotent replay, a STATEMENT_FAILED record answers the original
// failure. Its rows cross replicas inside a state-machine snapshot image
// (only `_raft_log`/`_raft_state` are excluded). Bound: rows are keyed by the
// committed entry that wrote them (`log_index`), so the table is compacted
// together with the rs-raft log by the snapshot/log-bound quest; until then
// it grows one row per committed statement, exactly like the log.
//
// `changes` (a recorded widening, quest reroute-carries-the-entry-id C2) is
// the affected-row count of an APPLIED statement, so a replay answers the
// rows the write changed; it is NULL for a STATEMENT_FAILED row and for a
// row recorded before the column existed - a replay of such a row answers the
// count as unknown (`changesKnown` false), never as 0.
// `statement_digest` (a recorded widening, the same quest's F4) binds the
// row to the statement its entry key settled: the digest of the statement's
// text and parameters as the proposal codec encodes them, so a retry of the
// key for another statement is refused, never answered with this row. It is
// NULL for a row recorded before the column existed (the binding was not
// recorded: such a row answers its key as it always did).
// A table created before a widening gains its column at initialization
// (WIDENING_COLUMNS).
const PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL = Object.freeze({
  CREATE_TABLE: `
      CREATE TABLE IF NOT EXISTS _partition_statement_outcomes (
        entry_key TEXT PRIMARY KEY,
        outcome TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        term INTEGER NOT NULL,
        failure_code TEXT,
        failure_message TEXT,
        changes INTEGER,
        statement_digest TEXT
      )
    `,
  SELECT_COLUMNS: 'PRAGMA table_info(_partition_statement_outcomes)',
  CHANGES_COLUMN: 'changes',
  WIDENING_COLUMNS: Object.freeze([
    Object.freeze({name: 'changes', add:
      'ALTER TABLE _partition_statement_outcomes ADD COLUMN changes INTEGER'}),
    Object.freeze({name: 'statement_digest', add:
      'ALTER TABLE _partition_statement_outcomes ADD COLUMN ' +
      'statement_digest TEXT'}),
  ]),
  SELECT_BY_ENTRY_KEY:
    'SELECT outcome, log_index, term, failure_code, failure_message, ' +
    'changes, statement_digest FROM _partition_statement_outcomes ' +
    'WHERE entry_key = ?',
  INSERT:
    'INSERT INTO _partition_statement_outcomes ' +
    '(entry_key, outcome, log_index, term, failure_code, failure_message, ' +
    'changes, statement_digest) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
});

// The digest a statement is bound by: SHA-256 over its proposal encoding,
// as hex.
const PARTITION_STATEMENT_DIGEST = Object.freeze({
  ALGORITHM: 'sha256',
  ENCODING: 'hex',
});

// The refusal of an entry key asked for by another statement than the one
// its row settled (PARTITION_COMMITTED_COMMAND_ERROR_CODE's
// ENTRY_ID_STATEMENT_MISMATCH).
const PARTITION_STATEMENT_MISMATCH_ERROR_MSG =
  'Partition write refused: its entryId is already settled for a ' +
  'different statement; the statement was not applied';

// Whether a settled row binds the statement that asks for its entry key
// (R07): the same statement, another statement, or a row that recorded no
// binding (recorded before the digest was).
const PARTITION_COMMITTED_STATEMENT_BINDING = Object.freeze({
  SAME_STATEMENT: 'same_statement',
  OTHER_STATEMENT: 'other_statement',
  UNRECORDED: 'unrecorded',
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

export {
  PARTITION_COMMITTED_STATEMENT_BINDING,
  PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL,
  PARTITION_COMMITTED_STATEMENT_RECORD_STATE,
  PARTITION_DETERMINISTIC_STATEMENT_BINDING_ERRORS,
  PARTITION_DETERMINISTIC_STATEMENT_SQLITE_CODES,
  PARTITION_SQLITE_RESULT_CODE,
  PARTITION_STATEMENT_DIGEST,
  PARTITION_STATEMENT_MISMATCH_ERROR_MSG,
};
