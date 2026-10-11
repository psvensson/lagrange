// The statement-admission owner: the single owner of what caller-supplied SQL
// text may be prepared on a partition's shared SQLite connection (TX1 design
// revision 10, section 3.3; owner rowid conditions 1-5). Every site that
// prepares caller-supplied text routes through it:
// - the sessionless executeQuery (the query wire and every internal caller)
//   and executeLocalQuery (the unreplicated bootstrap path);
// - the CDC bootstrap direct path's head check, and the local system-table
//   read (its raw-prepare fallback);
// - the committed SQL apply, where an offending committed statement is
//   recorded STATEMENT_FAILED `partition_write_statement_refused`, a function
//   of the command bytes and the replicated schema, identical on every
//   replica.
// The kind rule is a pure function of the SQLite-lexed head: nothing it
// refuses is ever prepared (preparing a flag PRAGMA already sets the flag).
// Only WITH is prepared before its kind is known, and a WITH statement can
// change no connection state at prepare. Single-quoted names are read as
// SQLite reads them (partition-statement-admission-names.js). Text rules then
// refuse, before any prepare and on every path: a table-valued pragma
// function or a connection-state function (reads included; pragma_optimize
// runs ANALYZE on the replica that steps it), and for writes an OR ROLLBACK
// conflict clause and a target other than the partition's own table. On
// writes the rowid rules R1-R3 then apply
// (partition-statement-admission-rowid-rules.js), the ceiling R3 also after
// the statement, inside a savepoint that rolls the statement back.
// The session path keeps its existing preparation until the session
// classifier (a later TX1 increment) takes it over: prepareSessionStatement.
// The partition's own storage initialization stays explicit and separate.
import {preparePartitionReadStatement} from './partition-read-statement-owner.js';
import {asciiLower, lexPartitionStatement} from './partition-statement-admission-lexer.js';
import {
  hasUnadmittedRowidAlias,
  isAtRowidCeiling,
  readIndexTable,
  readTableShape,
  refusesKeyAllocation,
} from './partition-statement-admission-rowid-rules.js';
import {
  PARTITION_STATEMENT_ADMISSION_MESSAGE as MESSAGE,
  PARTITION_STATEMENT_CHAR as CHAR,
  PARTITION_STATEMENT_HEAD_KIND as HEAD_KIND,
  PARTITION_STATEMENT_KEYWORD as KEYWORD,
  PARTITION_STATEMENT_KIND as KIND,
  PARTITION_STATEMENT_KIND_BY_FLAGS as KIND_BY_FLAGS,
  PARTITION_STATEMENT_LOG_SQL_LENGTH as LOG_SQL_LENGTH,
  PARTITION_STATEMENT_PATH as PATH,
  PARTITION_STATEMENT_PATH_KINDS as PATH_KINDS,
  PARTITION_STATEMENT_REFUSAL_CODE as REFUSAL_CODE,
  PARTITION_STATEMENT_REFUSAL_LAYER as LAYER,
} from './partition-statement-admission-constants.js';
import {
  PARTITION_SERVICE_OPERATION,
  PARTITION_STATEMENT_ADMISSION_LOG_MSG,
} from './partition-service-constants.js';
import {getSchemaByTableName} from '../bootstrap/system-table-schemas-constants.js';
import {
  hasRollbackResolution,
  namesRefusedFunction,
  resolveNamePositions,
  writesForeignTable,
} from './partition-statement-admission-names.js';
import {committedStatementResult} from
  './partition-committed-statement-outcome-constants.js';

const ALLOCATING_HEADS = new Set([KEYWORD.INSERT, KEYWORD.REPLACE,
  KEYWORD.WITH]);
const INSERTING_VERBS = new Set([KEYWORD.INSERT, KEYWORD.REPLACE]);
const MAIN_VERBS = new Set([KEYWORD.INSERT, KEYWORD.REPLACE, KEYWORD.UPDATE,
  KEYWORD.DELETE, KEYWORD.SELECT]);

// The verb of a statement: its head, or for a WITH head the first verb after
// the common table expressions (whose bodies are parenthesized).
function mainVerb(lexed) {
  if (lexed.head !== KEYWORD.WITH) {
    return lexed.head;
  }
  return lexed.tokens.find((token, index) => index > 0 && token.depth === 0 &&
    MAIN_VERBS.has(token.upper))?.upper ?? null;
}

function refusal(refusalLayer) {
  return Object.freeze({admitted: false, refusalLayer,
    reason: `${MESSAGE.REFUSED}${MESSAGE.LAYER_SEPARATOR}${refusalLayer}`});
}

function ownTableName(service) {
  return typeof service?.tableName === 'string' && service.tableName.length > 0 ?
    service.tableName : null;
}

/**
 * The kind of a statement's head on one path, from the text alone: the
 * admitted kind (KIND_BY_FLAGS for WITH, decided once compiled), or null when
 * the head is not admitted on the path.
 * @param {{head: (string|null)}} lexed - The lexed statement.
 * @param {string} path - A PARTITION_STATEMENT_PATH.
 * @return {string|null} The head's kind, or null.
 */
function headKind(lexed, path) {
  const kind = lexed.head !== null && Object.hasOwn(HEAD_KIND, lexed.head) ?
    HEAD_KIND[lexed.head] : null;
  const admits = PATH_KINDS[path];
  if (kind === KIND_BY_FLAGS) {
    return admits.has(KIND.READ) || admits.has(KIND.WRITE) ? kind : null;
  }
  return kind !== null && admits.has(kind) ? kind : null;
}

/**
 * The pure head rule, for a site that routes a statement before choosing a
 * lane (the CDC bootstrap direct path): the admitted kind of its head on the
 * sessionless path (null for WITH, which only its compiled flags decide), or
 * the refusal.
 * @param {string} sql - The statement.
 * @return {{admitted: boolean, kind: (string|null)}|Object} Kind or refusal.
 */
function classifyPartitionStatementHead(sql) {
  const kind = headKind(lexPartitionStatement(sql), PATH.SESSIONLESS);
  if (kind === null) {
    return refusal(LAYER.STATEMENT_KIND);
  }
  return {admitted: true, kind: kind === KIND_BY_FLAGS ? null : kind};
}

// A WITH statement is a read when compiled readonly and a reader, a write
// when not readonly; null otherwise.
function kindByFlags(statement) {
  if (statement.readonly && statement.reader) {
    return KIND.READ;
  }
  return statement.readonly ? null : KIND.WRITE;
}

// --- index DDL: exactly the index service's two shapes on the own table ---

function nameAt(tokens, index) {
  const token = tokens[index];
  return token?.identifier !== null && token?.identifier !== undefined &&
    tokens[index + 1]?.text !== CHAR.DOT ? token.identifier : null;
}

function endsAt(tokens, index) {
  return index === tokens.length ||
    (index === tokens.length - 1 && tokens[index].text === CHAR.SEMICOLON);
}

function skipKeywords(tokens, index, keywords) {
  return keywords.every((keyword, offset) => tokens[index + offset]?.upper === keyword) ?
    index + keywords.length : index;
}

// `(<column>, ...)` of bare or quoted names from the `(` at `open`, ending the
// statement.
function isColumnListToEnd(tokens, open) {
  if (tokens[open]?.text !== CHAR.OPEN_PAREN) {
    return false;
  }
  let index = open + 1;
  while (nameAt(tokens, index) !== null && tokens[index + 1]?.text === CHAR.COMMA) {
    index += 2;
  }
  return nameAt(tokens, index) !== null &&
    tokens[index + 1]?.text === CHAR.CLOSE_PAREN && endsAt(tokens, index + 2);
}

// CREATE INDEX [IF NOT EXISTS] <name> ON <table> (<column>, ...)
function matchCreateIndex(tokens) {
  const at = skipKeywords(tokens, 2, [KEYWORD.IF, KEYWORD.NOT, KEYWORD.EXISTS]);
  const indexName = nameAt(tokens, at);
  const on = at + 1;
  const tableName = tokens[on]?.upper === KEYWORD.ON ? nameAt(tokens, on + 1) : null;
  if (indexName === null || tableName === null ||
      !isColumnListToEnd(tokens, on + 2)) {
    return null;
  }
  return {create: true, indexName, tableName};
}

// DROP INDEX [IF EXISTS] <name>
function matchDropIndex(tokens) {
  const at = skipKeywords(tokens, 2, [KEYWORD.IF, KEYWORD.EXISTS]);
  const indexName = nameAt(tokens, at);
  return indexName !== null && endsAt(tokens, at + 1) ?
    {create: false, indexName} : null;
}

function matchIndexDdl(lexed) {
  if (lexed.tokens[1]?.upper !== KEYWORD.INDEX) {
    return null;
  }
  return lexed.head === KEYWORD.CREATE ? matchCreateIndex(lexed.tokens) :
    matchDropIndex(lexed.tokens);
}

// The indexes the partition's schema declares (created at initialization on
// every replica, so a drop would come back on a restarted replica only).
function declaredIndexNames(service, tableName) {
  const schemas = [service.schema, getSchemaByTableName(tableName)];
  return new Set(schemas.flatMap((schema) => schema?.indices ?? [])
    .map((index) => asciiLower(index?.name)));
}

function refusesIndexDrop(service, indexName, tableName) {
  if (declaredIndexNames(service, tableName).has(indexName)) {
    return true;
  }
  const owner = readIndexTable(service.db, indexName);
  return owner.temporary ||
    (owner.tableName !== null && asciiLower(owner.tableName) !== asciiLower(tableName));
}

function admitIndexDdl(service, lexed, sql) {
  const ddl = matchIndexDdl(lexed);
  const tableName = ownTableName(service);
  if (ddl === null || tableName === null) {
    return refusal(LAYER.STATEMENT_KIND);
  }
  const refused = ddl.create ? ddl.tableName !== asciiLower(tableName) :
    refusesIndexDrop(service, ddl.indexName, tableName);
  return refused ? refusal(LAYER.STATEMENT_KIND) :
    {admitted: true, kind: KIND.INDEX_DDL, statement: service.db.prepare(sql)};
}

// --- writes: R1, R2 and the R3 pre-check ---

// The leader's ceiling check before a proposal is an early refusal from
// committed state only. While a user session holds a SQLite transaction open
// on the shared connection (HEAD's session staging keeps BEGIN across
// requests), that connection also reads the session's uncommitted rows, so
// the check is left to the apply: its checks before and after the statement
// are the authority on every replica. Every other path runs the statement
// here (or is the apply), and always checks.
function checksCeilingBeforeRun(service, path) {
  return path !== PATH.SESSIONLESS || !service.db.inTransaction;
}

function admitWrite(service, lexed, params, statement, path) {
  if (hasUnadmittedRowidAlias(lexed)) {
    return refusal(LAYER.ROWID_ALIAS);
  }
  const allocating = ALLOCATING_HEADS.has(lexed.head);
  const tableName = ownTableName(service);
  if (allocating &&
      refusesKeyAllocation(service.db, lexed, Array.isArray(params) ? params : [],
        tableName)) {
    return refusal(LAYER.ROWID_ALLOCATION);
  }
  // The own table's shape, read once: a DML statement cannot change it, so
  // the post-statement check reuses it.
  const ownShape = allocating ? readTableShape(service.db, tableName) : null;
  if (allocating && checksCeilingBeforeRun(service, path) &&
      isAtRowidCeiling(ownShape)) {
    return refusal(LAYER.ROWID_CEILING);
  }
  return {admitted: true, kind: KIND.WRITE, statement, ceilingChecked: allocating,
    ownShape, insertsRows: INSERTING_VERBS.has(mainVerb(lexed))};
}

// The text rules that refuse before anything is prepared, whatever the kind:
// a refused function on every path (reads included); for a write, an OR
// ROLLBACK conflict clause and a target other than the partition's own table.
function textRuleRefusal(service, lexed) {
  if (namesRefusedFunction(lexed.tokens)) {
    return refusal(LAYER.STATEMENT_FUNCTION);
  }
  if (hasRollbackResolution(lexed.tokens)) {
    return refusal(LAYER.STATEMENT_CONFLICT);
  }
  return writesForeignTable(lexed, ownTableName(service)) ?
    refusal(LAYER.STATEMENT_TABLE) : null;
}

function prepareByKind(db, sql, kind) {
  return kind === KIND.READ ? preparePartitionReadStatement(db, sql) : db.prepare(sql);
}

/**
 * Admit one caller-supplied statement on a path before it may run: the kind
 * rule (refused heads are never prepared), then, for writes, R1, R2 and the
 * R3 pre-check. An admitted statement is prepared once, here; a compile error
 * throws (the statement's own deterministic error).
 * @param {Object} service - The partition (its db, tableName and schema).
 * @param {string} sql - The statement.
 * @param {Array} [params] - The bound params.
 * @param {string} [path] - A PARTITION_STATEMENT_PATH.
 * @return {Object} {admitted: true, kind, statement, ceilingChecked} or
 *   {admitted: false, refusalLayer, reason}.
 */
function admitPartitionStatement(service, sql, params = [], path = PATH.SESSIONLESS) {
  const lexed = resolveNamePositions(lexPartitionStatement(sql));
  const kind = headKind(lexed, path);
  if (kind === null) {
    return refusal(LAYER.STATEMENT_KIND);
  }
  const refusedByText = textRuleRefusal(service, lexed);
  if (refusedByText !== null) {
    return refusedByText;
  }
  if (kind === KIND.INDEX_DDL) {
    return admitIndexDdl(service, lexed, sql);
  }
  const statement = prepareByKind(service.db, sql, kind);
  const resolved = kind === KIND_BY_FLAGS ? kindByFlags(statement) : kind;
  if (resolved === null || !PATH_KINDS[path].has(resolved)) {
    return refusal(LAYER.STATEMENT_KIND);
  }
  if (resolved !== KIND.WRITE) {
    return {admitted: true, kind: resolved, statement};
  }
  return admitWrite(service, lexed, params, statement, path);
}

/**
 * Prepare one session statement exactly as the session path always has
 * (SELECT-headed text as a read, anything else as a write). The session
 * classifier of a later TX1 increment replaces this rule; until then the
 * sessionless paths alone are closed by the kind rule.
 * @param {Object} db - The partition's connection.
 * @param {string} sql - The statement.
 * @return {{admitted: true, kind: string, statement: Object}} The admission.
 */
function prepareSessionStatement(db, sql) {
  const read = String(sql).trim().toUpperCase().startsWith(KEYWORD.SELECT);
  const kind = read ? KIND.READ : KIND.WRITE;
  return {admitted: true, kind, statement: prepareByKind(db, sql, kind)};
}

function statementRefusalError(refused) {
  const error = new Error(refused.reason);
  error.code = REFUSAL_CODE;
  error.refusalLayer = refused.refusalLayer;
  error.refusal = refused;
  return error;
}

function runBelowCeiling(admission, params) {
  const info = admission.statement.run(...params);
  if (isAtRowidCeiling(admission.ownShape)) {
    throw statementRefusalError(refusal(LAYER.ROWID_CEILING));
  }
  return info;
}

/**
 * Run an admitted write (or index DDL or ALTER TABLE). An allocating write
 * runs inside a savepoint (a transaction when none is open), and is rolled
 * back and refused `rowid_ceiling` when the own table's maximum rowid is at
 * or above 2^62 after it.
 * @param {Object} service - The partition.
 * @param {Object} admission - An admission of admitPartitionStatement.
 * @param {Array} [params] - The bound params.
 * @return {Object} {admitted: true, info} or the ceiling refusal.
 */
function runAdmittedPartitionStatement(service, admission, params = []) {
  if (admission.ceilingChecked !== true) {
    return {admitted: true, info: admission.statement.run(...params)};
  }
  try {
    return {admitted: true, info: service.db.transaction(() =>
      runBelowCeiling(admission, params))()};
  } catch (error) {
    if (error?.code === REFUSAL_CODE && error.refusal) {
      return error.refusal;
    }
    throw error;
  }
}

/**
 * Run one committed SQL command through the owner, before the committed
 * apply records its outcome: the same pure kind and rowid rules and the
 * post-statement ceiling, on every replica. A refused statement throws the
 * typed refusal (code `partition_write_statement_refused`), which the outcome
 * owner records STATEMENT_FAILED; any other throw is the statement's own.
 * An applied statement's result is the one the outcome owner retains and
 * answers (committedStatementResult): its last insert rowid only when it is
 * of an inserting kind and inserted rows.
 * @param {Object} service - The partition.
 * @param {Object} command - The committed command ({type, sql, params}).
 * @return {{changes: number, lastInsertRowid: *}} The statement's result.
 */
function runCommittedPartitionStatement(service, command) {
  const params = command.params || [];
  const path = command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE ?
    PATH.MIGRATION : PATH.COMMITTED;
  const admission = admitPartitionStatement(service, command.sql, params, path);
  const outcome = admission.admitted ?
    runAdmittedPartitionStatement(service, admission, params) : admission;
  if (!outcome.admitted) {
    throw statementRefusalError(outcome);
  }
  return committedStatementResult(outcome.info,
    {insertsRows: admission.insertsRows === true});
}

/**
 * The typed answer of a refused request-path statement, logged once here.
 * @param {Object} service - The partition (its logger and partitionId).
 * @param {string} sql - The refused statement.
 * @param {Object} refused - The refusal.
 * @return {Object} {success: false, error, failureCode, refusalLayer,
 *   partitionId}.
 */
function partitionStatementRefusalAnswer(service, sql, refused) {
  service.logger?.warn?.(PARTITION_STATEMENT_ADMISSION_LOG_MSG.STATEMENT_REFUSED, {
    partitionId: service.partitionId ?? null,
    refusalLayer: refused.refusalLayer,
    sql: String(sql).substring(0, LOG_SQL_LENGTH),
  });
  return {success: false, error: refused.reason, failureCode: REFUSAL_CODE,
    refusalLayer: refused.refusalLayer, partitionId: service.partitionId ?? null};
}

/**
 * Read rows through the owner on a partition that offers only its
 * connection (the local system-table read): reads only.
 * @param {Object} service - The partition (its db).
 * @param {string} sql - The read.
 * @param {Array} [params] - The bound params.
 * @return {Object} {success: true, rows} or the refusal answer.
 */
function readAdmittedPartitionRows(service, sql, params = []) {
  const admission = admitPartitionStatement(service, sql, params, PATH.READ_ONLY);
  if (!admission.admitted) {
    return partitionStatementRefusalAnswer(service, sql, admission);
  }
  return {success: true, rows: admission.statement.all(...params)};
}

export {
  admitPartitionStatement,
  classifyPartitionStatementHead,
  partitionStatementRefusalAnswer,
  prepareSessionStatement,
  readAdmittedPartitionRows,
  runAdmittedPartitionStatement,
  runCommittedPartitionStatement,
  statementRefusalError,
};
