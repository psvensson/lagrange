// The vocabulary of the participant's staging classifier
// (partition-transaction-determinism.js; TX1 design revision 10, section
// 3.3): the stated supported SQL population a session statement must fall in,
// pinned to better-sqlite3 11.10.0 / SQLite 3.49.2, the layers that refuse
// anything else, the leader's self-check probes and the execution envelope.
//
// The classifier does not prove determinism. It enforces this population with
// default refusal; observing a new opcode never expands it, and every
// extension is the classifier owner's explicit act with a vetting note.
//
// Vetting notes (extensions beyond design revision 10's 116 opcodes; each
// bumps TRANSACTION_CLASSIFIER_LIST_VERSION):
// - `HaltIfNull` (list tx1-leg-a-2, TX1 increment 4): SQLite emits it for
//   every NOT NULL column an INSERT writes and an UPDATE assigns, whatever the
//   value (a literal included), so without it every write to a table with a
//   NOT NULL column was refused - every system table among them (45 of 45
//   measured; it was the only opcode outside the population for an
//   all-column INSERT and an every-column UPDATE of each). Its operands are an
//   error code (P1), a conflict action (P2), a register (P3) and the column's
//   name (P4): it halts the statement with a NOT NULL constraint error when
//   that register holds NULL and otherwise falls through. It reads only its
//   register - no cursor, table, schema, connection state, clock or random
//   source - and writes nothing, exactly like `Halt` and `NotNull`, already
//   in the population; its error is the statement's own deterministic
//   failure, which the c' validation answers `statement_failed` and the
//   PREPARE dry run settles REFUSED identically on every replica. No other
//   layer changes.
//
// Declared false refusals (limit L7): each refuses a statement that could be
// staged safely, because the population does not hold it:
// - `NotFound` (a correlated IN) and `Filter` (an IN over a non-key column)
//   stay outside the population, refused at `opcode`;
// - functions outside the revision-5 allow-list, `like` and `glob` (the LIKE
//   and GLOB operators) and `printf`/`format` among them, refused at
//   `function`. The engine compiles nine functions inline, with no function
//   opcode naming them, so layers 5-8 vet their programs: `coalesce`, `if`,
//   `iif`, `ifnull`, `likelihood`, `likely` and `unlikely`, and the window
//   functions `first_value` and `nth_value`, which no aggregate opcode
//   carries either (in a write the window rule below refuses them; design
//   0.0.14);
// - an INSERT or REPLACE without a column list, or whose column list omits a
//   primary-key column, and every INSERT into a table without a declared
//   primary key, refused at `implicit_key`;
// - on an INTEGER PRIMARY KEY table: a key outside [-2^62, 2^62), a key bound
//   through `?NNN` or a named param, a hex or digit-separated literal, a key
//   assigned through a row value, and an upsert's DO UPDATE that assigns the
//   key anything but an explicit integer, refused at `implicit_key`;
// - a LIMIT or OFFSET keyword anywhere in a write, a subquery that is not the
//   operand of IN or EXISTS (so a WITH write's bodies are VALUES only), and
//   any aggregate in a write, refused at `row_order` (limit L9);
// - an OVER or WINDOW keyword anywhere in a write, refused at `row_order`
//   with the detail `window_clause` (L9d: a window function's result depends
//   on the order of rows that tie in its window, and `first_value` and
//   `nth_value` compile to no aggregate opcode L9c could see), a bare column
//   or alias named `over` or `window` included; window functions stay
//   refused in writes until a total-order proof exists;
// - any rowid alias token in a write (`rowid`, `_rowid_`, `oid`), refused at
//   `rowid_alias`;
// - a write naming a table other than the partition's own, and `OR ROLLBACK`
//   anywhere in a write, refused at `statement_table` and
//   `statement_conflict` before anything is prepared.
import {PARTITION_ROWID_LIMIT} from './partition-statement-admission-constants.js';

// The list version the leader stamps into every transaction command's
// execution envelope (design 3.3).
const TRANSACTION_CLASSIFIER_LIST_VERSION = 'tx1-leg-a-2';

// The build the lists were vetted for: any other version or source id fails
// the leader's self-check, so an upgrade fails closed until re-vetted.
const TRANSACTION_CLASSIFIER_VETTED_ENGINE = Object.freeze({
  SQLITE_VERSION: '3.49.2',
  SQLITE_SOURCE_ID: '2025-05-07 10:39:52 ' +
    '17144570b0d96ae63cd6f3edca39e27ebd74925252bbaf6723bcb2f6b4861fb1',
});

// The layer that refused a session statement (the answer's refusalLayer;
// design 3.3, layers 1-11, plus the increment-2 text rules on the session
// path). The first refusal wins.
const TRANSACTION_CLASSIFIER_LAYER = Object.freeze({
  STATEMENT_KIND: 'statement_kind',
  ROWID_ALIAS: 'rowid_alias',
  ROW_ORDER: 'row_order',
  STATEMENT_CONFLICT: 'statement_conflict',
  STATEMENT_TABLE: 'statement_table',
  COMPILE: 'compile',
  OPCODE: 'opcode',
  DATABASE: 'database',
  ROOT_PAGE: 'root_page',
  FUNCTION: 'function',
  IMPLICIT_KEY: 'implicit_key',
  ROWID_CEILING: 'rowid_ceiling',
  // A self-check probe the partition's table cannot express (its row at the
  // ceiling cannot be planted): the probe fails, so the self-check fails.
  PROBE_UNAVAILABLE: 'probe_unavailable',
});

// What a classified statement is, from its text: a session read, a session
// write, or a head no session admits.
const TRANSACTION_STATEMENT_KIND = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  UNADMITTED: 'unadmitted',
});

// The supported population: 117 opcodes of SQLite 3.49.2 (design 3.3's 116,
// revision 8 adding SoftNull, and HaltIfNull, vetted above). Anything else
// refuses at `opcode`.
const TRANSACTION_ADMITTED_OPCODES = Object.freeze(new Set([
  'Add', 'AddImm', 'Affinity', 'AggFinal', 'AggInverse', 'AggStep', 'AggValue',
  'And', 'BeginSubrtn', 'BitAnd', 'BitNot', 'BitOr', 'Blob', 'Cast', 'Clear',
  'Close', 'CollSeq', 'Column', 'Compare', 'Concat', 'Copy', 'Count',
  'DecrJumpZero', 'DeferredSeek', 'Delete', 'Divide', 'EndCoroutine', 'Eq',
  'FilterAdd', 'FinishSeek', 'FkCheck', 'Found', 'Function', 'Ge', 'Gosub',
  'Goto', 'Gt', 'Halt', 'HaltIfNull', 'IdxDelete', 'IdxGE', 'IdxGT', 'IdxInsert', 'IdxLE',
  'IdxRowid', 'If', 'IfNot', 'IfNotZero', 'IfPos', 'Init', 'InitCoroutine',
  'Insert', 'Int64', 'IntCopy', 'Integer', 'IsNull', 'IsTrue', 'Jump', 'Last',
  'Le', 'Lt', 'MakeRecord', 'Move', 'Multiply', 'MustBeInt', 'Ne', 'NewRowid',
  'Next', 'NoConflict', 'Noop', 'Not', 'NotExists', 'NotNull', 'Null',
  'NullRow', 'OffsetLimit', 'Once', 'OpenDup', 'OpenEphemeral', 'OpenPseudo',
  'OpenRead', 'OpenWrite', 'Or', 'Prev', 'PureFunc', 'Real', 'Remainder',
  'ReopenIdx', 'ResetSorter', 'ResultRow', 'Return', 'Rewind', 'RowSetAdd',
  'RowSetRead', 'RowSetTest', 'Rowid', 'SCopy', 'SeekGE', 'SeekGT', 'SeekLE',
  'SeekLT', 'SeekRowid', 'Sequence', 'ShiftLeft', 'ShiftRight', 'SoftNull',
  'Sort', 'SorterData', 'SorterInsert', 'SorterNext', 'SorterOpen',
  'SorterSort', 'String8', 'Subtract', 'Transaction', 'Variable', 'Yield',
]));

// The functions a program may name (design revision 5, unchanged): every
// date/time function, random, randomblob, the connection-state functions
// (changes, last_insert_rowid, total_changes), sqlite_version and every
// unknown or user-registered name are refused at `function`.
const TRANSACTION_ADMITTED_FUNCTIONS = Object.freeze(new Set([
  'abs', 'char', 'hex', 'instr', 'length', 'lower', 'ltrim', 'max', 'min',
  'nullif', 'quote', 'replace', 'round', 'rtrim', 'substr', 'substring',
  'trim', 'typeof', 'unhex', 'unicode', 'upper', 'avg', 'count',
  'group_concat', 'sum', 'total',
]));

// The opcodes whose p4 names a function, and the aggregate ones (refused in
// a write at `row_order`, limit L9c).
const TRANSACTION_FUNCTION_OPCODES = Object.freeze(new Set([
  'Function', 'PureFunc', 'AggStep', 'AggInverse', 'AggValue', 'AggFinal']));
const TRANSACTION_AGGREGATE_OPCODES = Object.freeze(new Set([
  'AggStep', 'AggValue', 'AggInverse', 'AggFinal']));

// The database a program may address (design 3.3, layer 6): the opcodes that
// open a cursor (database in p3, root page in p2, OPFLAG_P2ISREG in p5), and
// the two whose operand names the database or the root page directly.
const TRANSACTION_PROGRAM = Object.freeze({
  CURSOR_OPENS: Object.freeze(new Set(['OpenRead', 'OpenWrite', 'ReopenIdx'])),
  TRANSACTION: 'Transaction',
  CLEAR: 'Clear',
  MAIN_DATABASE: 0,
  P2_IS_REGISTER: 0x10,
  FUNCTION_ARGUMENTS: '(',
});

// The text rules of the session path (limit L9a/L9b/L9d): the keyword tokens
// a write may not carry, the words that open a refused subquery, the
// operators whose operand subquery stays admitted, and the window keywords,
// refused with their own named detail.
const TRANSACTION_ROW_ORDER_TEXT = Object.freeze({
  KEYWORDS: Object.freeze(new Set(['LIMIT', 'OFFSET'])),
  SUBQUERY_OPENERS: Object.freeze(new Set(['SELECT', 'WITH'])),
  OPERAND_PREDECESSORS: Object.freeze(new Set(['IN', 'EXISTS'])),
  WINDOW_KEYWORDS: Object.freeze(new Set(['OVER', 'WINDOW'])),
  WINDOW_DETAIL: 'window_clause',
});

// The classifier's own reads of the connection (code, not caller text).
const TRANSACTION_CLASSIFIER_SQL = Object.freeze({
  EXPLAIN_PREFIX: 'EXPLAIN ',
  ROOT_PAGES: 'SELECT rootpage FROM main.sqlite_master ' +
    'WHERE tbl_name = ? COLLATE NOCASE AND type IN (\'table\', \'index\') ' +
    'AND rootpage > 0',
  ENGINE: 'SELECT sqlite_version() AS sqliteVersion, ' +
    'sqlite_source_id() AS sqliteSourceId',
  COMPILE_OPTIONS_PRAGMA: 'compile_options',
});


// The leader's self-check (design 3.3, AH; revisions 7-9): nine fixed probes
// in order, each refused at exactly its layer, the last admitted. `sql`
// builds the probe from the partition table's probe shape (names quoted:
// table; keys and keyValues, the primary key and its literals; column, a
// non-key column or null; aggregate {target, select, column}, an insert
// whose last value is an aggregate over the table); `ceiling` plants a row
// at the rowid ceiling inside the probe's sentinel transaction.
const L = TRANSACTION_CLASSIFIER_LAYER;
const TRANSACTION_SELF_CHECK_PROBES = Object.freeze([
  Object.freeze({name: 'random', layer: L.FUNCTION,
    sql: () => 'SELECT random()'}),
  Object.freeze({name: 'raft_log_read', layer: L.ROOT_PAGE,
    sql: () => 'SELECT count(*) FROM _raft_rs_log'}),
  Object.freeze({name: 'pragma_table_valued', layer: L.OPCODE,
    sql: () => 'SELECT page_count FROM pragma_page_count()'}),
  Object.freeze({name: 'pragma_statement', layer: L.STATEMENT_KIND,
    sql: () => 'PRAGMA page_count'}),
  Object.freeze({name: 'temp_schema_read', layer: L.DATABASE,
    sql: () => 'SELECT count(*) FROM temp.sqlite_master'}),
  Object.freeze({name: 'implicit_key_insert', layer: L.IMPLICIT_KEY,
    sql: (shape) => shape.column === null ?
      `INSERT INTO ${shape.table} DEFAULT VALUES` :
      `INSERT INTO ${shape.table} (${shape.column}) VALUES (NULL)`}),
  Object.freeze({name: 'aggregate_insert', layer: L.ROW_ORDER,
    sql: (shape) => `INSERT INTO ${shape.table} (${shape.aggregate.target}) ` +
      `SELECT ${shape.aggregate.select} FROM ${shape.table} ` +
      `WHERE ${shape.aggregate.column} IS NULL`}),
  Object.freeze({name: 'ceiling_insert', layer: L.ROWID_CEILING, ceiling: true,
    sql: (shape) => `INSERT INTO ${shape.table} (${shape.keys}) VALUES ` +
      `(${shape.keyValues})`}),
  Object.freeze({name: 'partition_table_read', layer: null,
    sql: (shape) => `SELECT count(*) FROM ${shape.table}`}),
]);

// What a self-check case observed: its probe at the expected layer
// (admitted, for the table read); the ceiling probe refused at implicit_key
// on a table without a declared primary key, where the key rule refuses
// every INSERT and the ceiling layer guards nothing (revision 10, 0.0.14);
// or neither, which fails the check.
const TRANSACTION_SELF_CHECK_RESULT = Object.freeze({
  SATISFIED: 'satisfied',
  SATISFIED_BY_IMPLICIT_KEY_REFUSAL: 'satisfied_by_implicit_key_refusal',
  UNSATISFIED: 'unsatisfied',
});

// The probes' own values: the key literal of a TEXT (or other non-alias) key
// and of an INTEGER PRIMARY KEY (in range, so the ceiling probe passes
// `implicit_key`), and the ceiling row's statement: the rowid (or the INTEGER
// PRIMARY KEY) bound to the ceiling, every NOT NULL column given the text
// literal, so the row can be planted in any partition table.
const TRANSACTION_SELF_CHECK_VALUE = Object.freeze({
  TEXT_KEY: '\'tx1-self-check\'',
  INTEGER_KEY: '1',
  AGGREGATE: 'count(*)',
  KEY_SEPARATOR: ', ',
  CEILING_PARAM: '?',
  CEILING_ROWID: PARTITION_ROWID_LIMIT.CEILING,
  plantCeiling: (table, columns, values) =>
    `INSERT INTO main.${table} (${columns}) VALUES (${values})`,
});

export {
  TRANSACTION_ADMITTED_FUNCTIONS,
  TRANSACTION_ADMITTED_OPCODES,
  TRANSACTION_AGGREGATE_OPCODES,
  TRANSACTION_CLASSIFIER_LAYER,
  TRANSACTION_CLASSIFIER_LIST_VERSION,
  TRANSACTION_CLASSIFIER_SQL,
  TRANSACTION_CLASSIFIER_VETTED_ENGINE,
  TRANSACTION_FUNCTION_OPCODES,
  TRANSACTION_PROGRAM,
  TRANSACTION_ROW_ORDER_TEXT,
  TRANSACTION_SELF_CHECK_PROBES,
  TRANSACTION_SELF_CHECK_RESULT,
  TRANSACTION_SELF_CHECK_VALUE,
  TRANSACTION_STATEMENT_KIND,
};
