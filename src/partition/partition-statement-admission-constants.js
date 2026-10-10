// The vocabulary of the statement-admission owner
// (partition-statement-admission.js): the one owner of what caller-supplied
// SQL text may be prepared on a partition's shared SQLite connection, on the
// ordinary (sessionless) request paths and at the committed SQL apply (TX1
// design revision 10, section 3.3: the statement kind, the rowid rules R1-R3
// and the post-statement rowid ceiling).
//
// Declared conservative refusals, for the classifier owner (design limit L7).
// Each refuses a statement that could be admitted safely, because the owner
// does not read it closely enough to prove so; none has a known sender in
// src (derivation 3):
// - R2 (`rowid_allocation`), on an INTEGER PRIMARY KEY table:
//   - a WITH-headed write with REPLACE resolution or a DO UPDATE that assigns
//     the key: a WITH write's rows are not read, so it counts as able to
//     allocate;
//   - a key bound through `?NNN` or a named param (`:a`, `@a`, `$a`), or any
//     key param when a bound value is an array or an object (better-sqlite3
//     spreads arrays and binds objects by name, so the key's value is not
//     resolved): it is not an explicit integer;
//   - a hex (`0x10`) or digit-separated (`1_000`) integer literal, or a
//     signed literal other than one `-` or `+`, in a key position;
//   - a bare column named `replace` (any REPLACE keyword not followed by `(`
//     counts as REPLACE resolution).
// - R1 (`rowid_alias`): an alias token in a WITH-headed UPDATE or DELETE
//   (N9-1), and an alias token anywhere outside an UPDATE's or DELETE's
//   top-level WHERE even when it only reads the rowid (`SET x = rowid`,
//   `RETURNING rowid`) or names a column, alias or function.
// - The statement kind (`statement_kind`): index DDL in any shape but the
//   index service's two (a column list with ASC, DESC or COLLATE, an
//   expression or partial index, a schema-qualified name), and a VT anywhere
//   before the head.
// - R3 (`rowid_ceiling`) also checks a WITH-headed UPDATE or DELETE as an
//   allocating statement (harmless: such a statement never allocates).
// - The function rule (`statement_function`): a single-quoted string whose
//   text starts with `pragma_` or is `fts3_tokenizer` or `load_extension` is
//   refused wherever it stands, a plain string literal included (a string
//   names a table-valued function in a FROM list after a comma, where the
//   owner does not read names).
// - The conflict rule (`statement_conflict`): `OR ROLLBACK` anywhere in a
//   write, even where it would never fire.
//
// Names (independent review of increment 2, B1): SQLite reads a single-quoted
// string as a name wherever its grammar takes one (nm ::= ID | STRING), so
// `'rowid'` in an INSERT column list is an alias token and `SET 'id' = 5`
// assigns the key (partition-statement-admission-names.js). In an INSERT
// column list the INTEGER PRIMARY KEY takes its LAST mention (sqlite3Insert's
// ipkColumn; measured: `(id, v, id) VALUES (20, 'x', 21)` stores 21), so R2
// judges the last mention. A VALUES list followed by anything but ON
// CONFLICT, RETURNING, `;` or the end (a compound: UNION, UNION ALL, EXCEPT,
// INTERSECT) is SELECT-sourced, so it can allocate.
//
// Declared dispositions (L6 window, no sender in src):
// - An allocating write runs inside a savepoint for the post-statement
//   ceiling, so a failing `INSERT OR FAIL` (or REPLACE ... OR FAIL) keeps no
//   partial effect any more: the savepoint rolls the whole statement back,
//   where HEAD kept the rows inserted before the failing one. `UPDATE OR FAIL`
//   is unchanged (it runs outside a savepoint).
// - An ordinary write to any table but the own one is refused
//   `statement_table` at the request path and at apply. HEAD let SQLite run it:
//   an internal table (`_raft_rs_*`, `_partition_*`) was written, a missing
//   one failed `SQLITE_ERROR`. Senders in src write only their partition's own
//   table (the index service, the CDC routed and bootstrap-direct writes, the
//   migration backfill, the split/merge copies).
// - A committed SELECT or read-only WITH entry is refused at apply, where HEAD
//   ran it as an applied write with no changes (HEAD's executeQuery proposed
//   every non-SELECT-prefixed read, a CTE read among them; such reads are now
//   answered as reads).
// - Residual of the retained-result rule (committedStatementResult): an
//   upsert whose every row took its DO UPDATE path changed rows without
//   inserting one, and retains the connection's last insert rowid (connection
//   state). Reading it would need the insert count, which SQLite does not
//   report apart from the update count.

// The typed code of every refusal, on the request paths and at the apply (an
// offending committed statement is recorded STATEMENT_FAILED with it).
const PARTITION_STATEMENT_REFUSAL_CODE = 'partition_write_statement_refused';

// Which rule refused a statement (the answer's `refusalLayer`).
const PARTITION_STATEMENT_REFUSAL_LAYER = Object.freeze({
  // A head outside the admitted set of the path (or a WITH statement whose
  // compiled flags are neither a read nor a write), refused before any
  // prepare except WITH's.
  STATEMENT_KIND: 'statement_kind',
  // R1: an alias token (rowid, _rowid_, oid) outside an UPDATE's or DELETE's
  // top-level WHERE clause.
  ROWID_ALIAS: 'rowid_alias',
  // R2: on an INTEGER PRIMARY KEY table, REPLACE resolution or a key-assigning
  // DO UPDATE in a statement that can allocate a key.
  ROWID_ALLOCATION: 'rowid_allocation',
  // R3: the own table's maximum rowid at or above 2^62, before or after.
  ROWID_CEILING: 'rowid_ceiling',
  // A table-valued pragma function (any `pragma_` name) or a function that
  // changes connection state (fts3_tokenizer, load_extension), on every path.
  STATEMENT_FUNCTION: 'statement_function',
  // An ordinary write whose target table is not the partition's own.
  STATEMENT_TABLE: 'statement_table',
  // An `OR ROLLBACK` conflict clause: it would end the apply's own SQLite
  // transaction (the outcome row and the applied index would then be written
  // outside it).
  STATEMENT_CONFLICT: 'statement_conflict',
});

// What an admitted statement is.
const PARTITION_STATEMENT_KIND = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  INDEX_DDL: 'index_ddl',
  ALTER_TABLE: 'alter_table',
});

// Where a statement arrives: the sessionless query path (executeQuery: reads
// answered here, writes proposed), the unreplicated local path
// (executeLocalQuery: reads and writes run here), the committed apply of the
// SQL command types, the committed MIGRATION_ALTER_TABLE apply, and the local
// system-table read.
const PARTITION_STATEMENT_PATH = Object.freeze({
  SESSIONLESS: 'sessionless',
  LOCAL: 'local',
  COMMITTED: 'committed',
  MIGRATION: 'migration',
  READ_ONLY: 'read_only',
});

// The kind each admitted head keyword is. A WITH statement's kind is decided
// by its compiled flags (better-sqlite3 Statement#readonly and #reader): a read
// is readonly and a reader, a write is not readonly; anything else refuses.
const PARTITION_STATEMENT_KIND_BY_FLAGS = 'by_flags';
const PARTITION_STATEMENT_HEAD_KIND = Object.freeze({
  SELECT: PARTITION_STATEMENT_KIND.READ,
  WITH: PARTITION_STATEMENT_KIND_BY_FLAGS,
  INSERT: PARTITION_STATEMENT_KIND.WRITE,
  UPDATE: PARTITION_STATEMENT_KIND.WRITE,
  DELETE: PARTITION_STATEMENT_KIND.WRITE,
  REPLACE: PARTITION_STATEMENT_KIND.WRITE,
  CREATE: PARTITION_STATEMENT_KIND.INDEX_DDL,
  DROP: PARTITION_STATEMENT_KIND.INDEX_DDL,
  ALTER: PARTITION_STATEMENT_KIND.ALTER_TABLE,
});

// The kinds each path admits (design 3.3, "The admitted heads per path"):
// the sessionless paths admit reads, writes and the two index-DDL shapes; the
// committed SQL apply only the writes and the index DDL; the committed
// MIGRATION_ALTER_TABLE apply only ALTER TABLE; the local read only reads.
const PARTITION_STATEMENT_PATH_KINDS = Object.freeze({
  [PARTITION_STATEMENT_PATH.SESSIONLESS]: Object.freeze(new Set([
    PARTITION_STATEMENT_KIND.READ, PARTITION_STATEMENT_KIND.WRITE,
    PARTITION_STATEMENT_KIND.INDEX_DDL])),
  [PARTITION_STATEMENT_PATH.LOCAL]: Object.freeze(new Set([
    PARTITION_STATEMENT_KIND.READ, PARTITION_STATEMENT_KIND.WRITE,
    PARTITION_STATEMENT_KIND.INDEX_DDL])),
  [PARTITION_STATEMENT_PATH.COMMITTED]: Object.freeze(new Set([
    PARTITION_STATEMENT_KIND.WRITE, PARTITION_STATEMENT_KIND.INDEX_DDL])),
  [PARTITION_STATEMENT_PATH.MIGRATION]: Object.freeze(new Set([
    PARTITION_STATEMENT_KIND.ALTER_TABLE])),
  [PARTITION_STATEMENT_PATH.READ_ONLY]: Object.freeze(new Set([
    PARTITION_STATEMENT_KIND.READ])),
});

// The SQLite keywords the owner reads (compared ASCII upper-case).
const PARTITION_STATEMENT_KEYWORD = Object.freeze({
  BY: 'BY',
  CONFLICT: 'CONFLICT',
  CREATE: 'CREATE',
  DISTINCT: 'DISTINCT',
  FROM: 'FROM',
  INDEXED: 'INDEXED',
  JOIN: 'JOIN',
  ROLLBACK: 'ROLLBACK',
  TABLE: 'TABLE',
  USING: 'USING',
  DELETE: 'DELETE',
  DO: 'DO',
  EXISTS: 'EXISTS',
  IF: 'IF',
  INDEX: 'INDEX',
  INSERT: 'INSERT',
  INTO: 'INTO',
  LIMIT: 'LIMIT',
  NOT: 'NOT',
  ON: 'ON',
  OR: 'OR',
  ORDER: 'ORDER',
  REPLACE: 'REPLACE',
  RETURNING: 'RETURNING',
  SELECT: 'SELECT',
  SET: 'SET',
  UPDATE: 'UPDATE',
  VALUES: 'VALUES',
  WHERE: 'WHERE',
  WITH: 'WITH',
  AS: 'AS',
  MAIN: 'MAIN',
});

// The token classes of the SQLite-lexed text (sqlite3GetToken, 3.49.2).
const PARTITION_STATEMENT_TOKEN = Object.freeze({
  WORD: 'word',
  QUOTED: 'quoted',
  STRING: 'string',
  BLOB: 'blob',
  NUMBER: 'number',
  PARAM: 'param',
  PUNCT: 'punct',
  ILLEGAL: 'illegal',
});

// SQLite's lexical characters (sqlite3.c aiClass and sqlite3GetToken):
// whitespace is space, tab, LF, FF and CR, plus a UTF-8 BOM read as space; a
// `--` comment ends only at LF; VT continues a whitespace run but is illegal
// at its start, so the owner refuses it anywhere before the head.
const PARTITION_STATEMENT_CHAR = Object.freeze({
  SPACE: ' ',
  TAB: '\t',
  LF: '\n',
  FF: '\f',
  CR: '\r',
  VT: '\v',
  BOM: '﻿',
  DASH: '-',
  SLASH: '/',
  STAR: '*',
  QUOTE: '\'',
  DOUBLE_QUOTE: '"',
  BACKTICK: '`',
  OPEN_BRACKET: '[',
  CLOSE_BRACKET: ']',
  OPEN_PAREN: '(',
  CLOSE_PAREN: ')',
  COMMA: ',',
  DOT: '.',
  SEMICOLON: ';',
  PLUS: '+',
  QUESTION: '?',
  COLON: ':',
  AT: '@',
  DOLLAR: '$',
  HASH: '#',
  BLOB_PREFIXES: 'xX',
});

// Character classes, matched one character at a time.
const PARTITION_STATEMENT_CHAR_CLASS = Object.freeze({
  DIGIT: /[0-9]/,
  // An identifier starts with an ASCII letter, `_`, or any non-ASCII
  // character (SQLite reads every byte >= 0x80 as an identifier byte).
  ID_START: /[A-Za-z_\u0080-￿]/,
  ID_CHAR: /[A-Za-z0-9_$\u0080-￿]/,
});

// The whitespace characters of a run (VT included after its start).
const PARTITION_STATEMENT_WHITESPACE = Object.freeze(new Set([
  PARTITION_STATEMENT_CHAR.SPACE, PARTITION_STATEMENT_CHAR.TAB,
  PARTITION_STATEMENT_CHAR.LF, PARTITION_STATEMENT_CHAR.FF,
  PARTITION_STATEMENT_CHAR.CR, PARTITION_STATEMENT_CHAR.VT]));

// The alias names of the rowid (R1), compared ASCII lower-case.
const PARTITION_ROWID_ALIASES = Object.freeze(['rowid', '_rowid_', 'oid']);

// R3: an own-table rowid at or above 2^62 refuses an allocating statement; the
// signed 64-bit range bounds an explicit integer key (R2).
const PARTITION_ROWID_LIMIT = Object.freeze({
  CEILING: 2n ** 62n,
  INT64_MIN: -(2n ** 63n),
  INT64_MAX: 2n ** 63n - 1n,
});

// R2 (revision 10, AT): a string param is an explicit integer key iff it is
// canonical decimal text whose exact BigInt is a valid int64; an integer
// literal is plain decimal digits.
const PARTITION_STATEMENT_INTEGER_TEXT = Object.freeze({
  CANONICAL_DECIMAL: /^-?(0|[1-9][0-9]*)$/,
  LITERAL_DIGITS: /^[0-9]+$/,
});

// The owner's own reads of the connection (code, not caller text): the table
// shape, an index's table, and the own table's maximum rowid.
const PARTITION_STATEMENT_SHAPE_SQL = Object.freeze({
  TABLE_LIST: 'SELECT wr FROM pragma_table_list(?) ' +
    'WHERE schema = \'main\' AND type = \'table\'',
  TABLE_INFO: 'SELECT name, pk FROM pragma_table_info(?) ORDER BY cid',
  PRIMARY_KEY_INDEX:
    'SELECT COUNT(*) AS count FROM pragma_index_list(?) WHERE origin = \'pk\'',
  MAIN_INDEX_TABLE: 'SELECT tbl_name AS tableName FROM main.sqlite_master ' +
    'WHERE type = \'index\' AND name = ? COLLATE NOCASE',
  TEMP_INDEX_TABLE: 'SELECT tbl_name AS tableName FROM temp.sqlite_master ' +
    'WHERE type = \'index\' AND name = ? COLLATE NOCASE',
  maxRowid: (rowidName, quotedTable) =>
    `SELECT max(${rowidName}) AS maximum FROM main.${quotedTable}`,
});

const PARTITION_STATEMENT_ADMISSION_MESSAGE = Object.freeze({
  REFUSED: 'Statement refused by the partition statement-admission owner',
  LAYER_SEPARATOR: ': ',
});

// The function rule's names: every table-valued pragma function (`pragma_`
// prefix; pragma_optimize runs ANALYZE when stepped) and the functions that
// change connection state.
const PARTITION_STATEMENT_REFUSED_FUNCTION = Object.freeze({
  PRAGMA_PREFIX: 'pragma_',
  NAMES: Object.freeze(new Set(['fts3_tokenizer', 'load_extension'])),
});

// How much of a refused statement's text its log line carries.
const PARTITION_STATEMENT_LOG_SQL_LENGTH = 100;

/**
 * The answer field naming the refusal layer of a recorded statement failure,
 * read back from the owner's own message (`<REFUSED>: <layer>`): {refusalLayer}
 * for the owner's refusal, an empty object for any other failure. The apply
 * records the refusal's message, so a settled replay answers the same layer as
 * the first answer did.
 * @param {*} code - The recorded failure code.
 * @param {*} message - The recorded failure message.
 * @return {{refusalLayer: string}|Object} The field, or none.
 */
function refusalLayerFieldOf(code, message) {
  const prefix = PARTITION_STATEMENT_ADMISSION_MESSAGE.REFUSED +
    PARTITION_STATEMENT_ADMISSION_MESSAGE.LAYER_SEPARATOR;
  const layer = code === PARTITION_STATEMENT_REFUSAL_CODE &&
    typeof message === 'string' && message.startsWith(prefix) ?
    message.slice(prefix.length) : '';
  return Object.values(PARTITION_STATEMENT_REFUSAL_LAYER).includes(layer) ?
    {refusalLayer: layer} : {};
}

export {
  refusalLayerFieldOf,
  PARTITION_ROWID_ALIASES,
  PARTITION_ROWID_LIMIT,
  PARTITION_STATEMENT_ADMISSION_MESSAGE,
  PARTITION_STATEMENT_CHAR,
  PARTITION_STATEMENT_CHAR_CLASS,
  PARTITION_STATEMENT_HEAD_KIND,
  PARTITION_STATEMENT_INTEGER_TEXT,
  PARTITION_STATEMENT_KEYWORD,
  PARTITION_STATEMENT_KIND,
  PARTITION_STATEMENT_KIND_BY_FLAGS,
  PARTITION_STATEMENT_LOG_SQL_LENGTH,
  PARTITION_STATEMENT_PATH,
  PARTITION_STATEMENT_PATH_KINDS,
  PARTITION_STATEMENT_REFUSAL_CODE,
  PARTITION_STATEMENT_REFUSAL_LAYER,
  PARTITION_STATEMENT_REFUSED_FUNCTION,
  PARTITION_STATEMENT_SHAPE_SQL,
  PARTITION_STATEMENT_TOKEN,
  PARTITION_STATEMENT_WHITESPACE,
};
