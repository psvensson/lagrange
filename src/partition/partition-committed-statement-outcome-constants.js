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
// the applied statement's own result again (the row retains its affected-row
// count and last insert rowid), a STATEMENT_FAILED record answers the
// original failure. Its rows cross replicas inside a state-machine snapshot image
// (only `_raft_log`/`_raft_state` are excluded). Bound: rows are keyed by the
// committed entry that wrote them (`log_index`), so the table is compacted
// together with the rs-raft log by the snapshot/log-bound quest; until then
// it grows one row per committed statement, exactly like the log.
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
        last_insert_rowid INTEGER
      )
    `,
  SELECT_BY_ENTRY_KEY:
    'SELECT outcome, log_index, term, failure_code, failure_message, ' +
    'changes, last_insert_rowid ' +
    'FROM _partition_statement_outcomes WHERE entry_key = ?',
  INSERT:
    'INSERT INTO _partition_statement_outcomes ' +
    '(entry_key, outcome, log_index, term, failure_code, failure_message, ' +
    'changes, last_insert_rowid) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  TABLE_COLUMNS: 'PRAGMA table_info(_partition_statement_outcomes)',
});

// The result an APPLIED row retains: the statement's affected-row count and
// last insert rowid, written with the row. A table created before the result
// was retained gains these columns when its partition opens (the rows it
// already holds retain no result: their columns are NULL), so every row
// written from then on retains its result. Column name -> its ADD COLUMN.
const PARTITION_COMMITTED_STATEMENT_RESULT_COLUMNS = Object.freeze({
  changes: 'ALTER TABLE _partition_statement_outcomes ' +
    'ADD COLUMN changes INTEGER',
  last_insert_rowid: 'ALTER TABLE _partition_statement_outcomes ' +
    'ADD COLUMN last_insert_rowid INTEGER',
});

// What the answer to a settled APPLIED entry key is (R07: a named state, never
// a count read as an outcome). A replay never executes the statement again,
// so the result it answers is the one the outcome row retained:
// - OUTCOME_RETAINED: the row retains the applied statement's result; the
//   replay answers that affected-row count and last insert rowid exactly as
//   the statement's first answer did.
// - OUTCOME_NOT_RETAINED: the row retains no result (written before results
//   were retained). The statement was applied; its count is not known here,
//   so the answer carries none - an unknown count is never zero rows.
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

export {
  PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL,
  PARTITION_COMMITTED_STATEMENT_RECORD_STATE,
  PARTITION_COMMITTED_STATEMENT_RESULT_COLUMNS,
  PARTITION_DETERMINISTIC_STATEMENT_BINDING_ERRORS,
  PARTITION_DETERMINISTIC_STATEMENT_SQLITE_CODES,
  PARTITION_SETTLED_REPLAY,
  PARTITION_SQLITE_RESULT_CODE,
};
