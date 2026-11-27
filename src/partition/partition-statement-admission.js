// The statement-admission owner: the single owner of what caller-supplied SQL
// text may be prepared on a partition's shared SQLite connection (TX1 design
// revision 10, section 3.3; owner rowid conditions 1-5).
// The kind rule is a pure function of the SQLite-lexed head: nothing it
// refuses is ever prepared. Single-quoted names are read as SQLite reads them
// (partition-statement-admission-names.js). Text rules refuse table-valued
// pragma/connection-state functions, OR ROLLBACK conflict clauses, and writes
// to foreign tables. Rowid rules R1-R3 (partition-statement-admission-rowid-rules.js)
// apply on writes, with R3 also checked post-statement inside a savepoint.
import {extractLexedSqlMutationType, lexedMutationOperationType} from './partition-mirror-custody-codec.js';
import {preparePartitionReadStatement} from './partition-read-statement-owner.js';
import {asciiLower, lexPartitionStatement} from './partition-statement-admission-lexer.js';
import {
  hasDoUpdateClause,
  hasUnadmittedRowidAlias,
  isAtRowidCeiling,
  readIndexTable,
  readTableShape,
  refusesKeyAllocation,
} from './partition-statement-admission-rowid-rules.js';
import {
  PARTITION_GLOBAL_INDEX_DATASET_PREFIX as INDEX_DATASET_PREFIX,
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
import {assertTransactionSchemaWriteEnforced} from
  '../query/distributed/distributed-transaction-schema-enforcement.js';
import {readPartitionWriteOrigin} from './partition-participant-transaction-store.js';
import {
  dmlVerbIndex,
  hasRollbackResolution,
  namesRefusedFunction,
  resolveNamePositions,
  writesForeignTable,
} from './partition-statement-admission-names.js';
import {committedStatementResult} from
  './partition-committed-statement-outcome-constants.js';
import {
  isKnownSystemTable,
  isTableCdcObligationRecorded,
} from '../cache/cdc-table-policy.js';
import {
  decodeTypedParams,
  encodeTypedRowSet,
  materializeCapturedRowObjects,
} from '../query/sql-value-codec.js';

const ALLOCATING_HEADS = new Set([KEYWORD.INSERT, KEYWORD.REPLACE,
  KEYWORD.WITH]);
const INSERTING_VERBS = new Set([KEYWORD.INSERT, KEYWORD.REPLACE]);
const MAIN_VERBS = new Set([KEYWORD.INSERT, KEYWORD.REPLACE, KEYWORD.UPDATE,
  KEYWORD.DELETE, KEYWORD.SELECT]);
const PUBLICATIONS_TABLE_NAME = 'control_plane_publications';
const PROTECTED_FORMATION_KEY = 'cluster_formation';
const PROTECTED_FORMATION_SELECT_SQL =
  'SELECT * FROM control_plane_publications ' +
  'WHERE publication_id = ? OR publication_kind = ? ' +
  'ORDER BY publication_id';
const RETURNING_ALL_SUFFIX = '\nRETURNING *';
const WRITE_EXECUTION_META_SQL =
  'SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid';

function mentionsProtectedFormationKey(lexed, params) {
  const tokenMatches = Array.isArray(lexed?.tokens) &&
    lexed.tokens.some((token) =>
      typeof token?.identifier === 'string' &&
      asciiLower(token.identifier) === PROTECTED_FORMATION_KEY);
  if (tokenMatches) {
    return true;
  }
  return Array.isArray(params) &&
    params.some((value) =>
      typeof value === 'string' &&
      asciiLower(value.trim()) === PROTECTED_FORMATION_KEY);
}

function readProtectedFormationSnapshotJson(db) {
  return JSON.stringify(
    db.prepare(PROTECTED_FORMATION_SELECT_SQL)
      .all(PROTECTED_FORMATION_KEY, PROTECTED_FORMATION_KEY),
  );
}

// The verb of a statement: its head, or for a WITH head the first verb after
// the common table expressions (whose bodies are parenthesized).
function mainVerb(lexed) {
  if (lexed.head !== KEYWORD.WITH) {
    return lexed.head;
  }
  return lexed.tokens.find((token, index) => index > 0 && token.depth === 0 &&
    MAIN_VERBS.has(token.upper))?.upper ?? null;
}

const QUALIFIED_TARGET_ADVANCE = 3;
function dmlTargetTokenIndex(tokens, verb) {
  const keyword = tokens[verb].upper;
  const afterVerb = tokens[verb + 1]?.upper === KEYWORD.OR ?
    verb + QUALIFIED_TARGET_ADVANCE :
    verb + 1;
  if (keyword === KEYWORD.UPDATE) return afterVerb;
  if (keyword === KEYWORD.DELETE) {
    return tokens[verb + 1]?.upper === KEYWORD.FROM ? verb + 2 : -1;
  }
  return tokens[afterVerb]?.upper === KEYWORD.INTO ? afterVerb + 1 : -1;
}

function extractMainSchemaTargetName(tokens, at) {
  if (at < 0) return null;
  const qualified = tokens[at + 1]?.text === CHAR.DOT;
  if (qualified && tokens[at]?.identifier !== asciiLower(KEYWORD.MAIN)) {
    return null;
  }
  const targetToken = tokens[qualified ? at + 2 : at];
  return typeof targetToken?.identifier === 'string' &&
      targetToken.identifier.length > 0 ?
    targetToken.value :
    null;
}

function extractLexedDmlTargetTableName(sql) {
  if (typeof sql !== 'string' || sql.length === 0) return null;
  const lexed = resolveNamePositions(lexPartitionStatement(sql));
  const verb = dmlVerbIndex(lexed);
  return verb < 0 ?
    null :
    extractMainSchemaTargetName(lexed.tokens, dmlTargetTokenIndex(lexed.tokens, verb));
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

function withStatementKind(lexed) {
  if (dmlVerbIndex(lexed) >= 0) {
    return KIND.WRITE;
  }
  return mainVerb(lexed) === KEYWORD.SELECT ? KIND.READ : null;
}

/**
 * The pure head rule, for a site that routes a statement before choosing a
 * lane (the CDC bootstrap direct path and remote query classification): the
 * admitted kind of its head on the sessionless path (for WITH, resolved from
 * its top-level verb), or the refusal, together with the lexed head keyword.
 * @param {string} sql - The statement.
 * @return {{admitted: boolean, kind: (string|null), head: (string|null)}|Object}
 *   Kind or refusal.
 */
function classifyPartitionStatementHead(sql) {
  const lexed = lexPartitionStatement(sql);
  const kind = headKind(lexed, PATH.SESSIONLESS);
  if (kind === null) {
    return Object.freeze({
      ...refusal(LAYER.STATEMENT_KIND),
      head: lexed.head,
    });
  }
  return {
    admitted: true,
    kind: kind === KIND_BY_FLAGS ? withStatementKind(lexed) : kind,
    head: lexed.head,
  };
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

// CREATE [UNIQUE] INDEX [IF NOT EXISTS] <name> ON <table> (<column>, ...)
function matchCreateIndex(tokens, indexStart) {
  const at = skipKeywords(tokens, indexStart, [KEYWORD.IF, KEYWORD.NOT, KEYWORD.EXISTS]);
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
  if (lexed.head === KEYWORD.CREATE) {
    const indexAt = skipKeywords(lexed.tokens, 1, [KEYWORD.UNIQUE]);
    return lexed.tokens[indexAt]?.upper === KEYWORD.INDEX ?
      matchCreateIndex(lexed.tokens, indexAt + 1) : null;
  }
  return lexed.tokens[1]?.upper === KEYWORD.INDEX ?
    matchDropIndex(lexed.tokens) : null;
}

function matchDatasetTableTarget(tokens, at) {
  if (tokens[at + 1]?.text === CHAR.DOT) {
    const schema = tokens[at]?.identifier;
    const tableName = tokens[at + 2]?.identifier ?? null;
    return schema === asciiLower(KEYWORD.MAIN) && tableName !== null ?
      {tableName, next: at + QUALIFIED_TARGET_ADVANCE} : null;
  }
  const tableName = nameAt(tokens, at);
  return tableName !== null ? {tableName, next: at + 1} : null;
}

function findBalancedParenEnd(tokens, openIndex) {
  if (tokens[openIndex]?.text !== CHAR.OPEN_PAREN) {
    return -1;
  }
  let balance = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].text === CHAR.OPEN_PAREN) balance += 1;
    else if (tokens[index].text === CHAR.CLOSE_PAREN) {
      balance -= 1;
      if (balance === 0) return index;
    }
  }
  return -1;
}

function matchDropDatasetTable(tokens) {
  if (tokens[1]?.upper !== KEYWORD.TABLE) return null;
  const at = skipKeywords(tokens, 2, [KEYWORD.IF, KEYWORD.EXISTS]);
  const target = matchDatasetTableTarget(tokens, at);
  return target !== null && endsAt(tokens, target.next) ?
    {tableName: target.tableName} : null;
}

function matchCreateDatasetTable(tokens) {
  if (tokens[1]?.upper !== KEYWORD.TABLE) return null;
  const at = skipKeywords(tokens, 2, [KEYWORD.IF, KEYWORD.NOT, KEYWORD.EXISTS]);
  const target = matchDatasetTableTarget(tokens, at);
  if (target === null) return null;
  const close = findBalancedParenEnd(tokens, target.next);
  return close >= 0 && endsAt(tokens, close + 1) ?
    {tableName: target.tableName} : null;
}

function matchDatasetTableDdl(lexed) {
  return lexed.head === KEYWORD.CREATE ?
    matchCreateDatasetTable(lexed.tokens) :
    matchDropDatasetTable(lexed.tokens);
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
  const tableName = ownTableName(service);
  if (tableName === null) {
    return refusal(LAYER.STATEMENT_KIND);
  }
  const ddl = matchIndexDdl(lexed);
  if (ddl !== null) {
    const refused = ddl.create ? ddl.tableName !== asciiLower(tableName) :
      refusesIndexDrop(service, ddl.indexName, tableName);
    return refused ? refusal(LAYER.STATEMENT_KIND) :
      {admitted: true, kind: KIND.INDEX_DDL, statement: service.db.prepare(sql)};
  }
  const ownLower = asciiLower(tableName);
  if (ownLower.startsWith(INDEX_DATASET_PREFIX)) {
    const datasetDdl = matchDatasetTableDdl(lexed);
    if (datasetDdl !== null && datasetDdl.tableName === ownLower) {
      return {admitted: true, kind: KIND.INDEX_DDL, statement: service.db.prepare(sql)};
    }
  }
  return refusal(LAYER.STATEMENT_KIND);
}

// --- writes: R1, R2 and the R3 pre-check ---

// The leader's ceiling check before a proposal is an early refusal from
// committed state only. While a legacy session holds a SQLite transaction
// open on the shared connection (its staging keeps BEGIN across requests),
// that connection also reads the session's uncommitted rows, so the check is
// left to the apply: its checks before and after the statement are the
// authority on every replica. A participant session never holds one (c').
// Every other path runs the statement here (or is the apply), and always
// checks.
function checksCeilingBeforeRun(service, path) {
  return path !== PATH.SESSIONLESS || !service.db.inTransaction;
}

function hasTopLevelReturning(lexed) {
  return Array.isArray(lexed?.tokens) &&
    lexed.tokens.some((token) => token.depth === 0 && token.upper === KEYWORD.RETURNING);
}

function hasActiveMirrorCapture(service) {
  return Boolean(
    service.splitReplication ||
    service.mergeReplication,
  );
}

function tableNeedsCapturedWriteRows(tableName) {
  return (
    tableName !== null &&
    (isTableCdcObligationRecorded(tableName) || !isKnownSystemTable(tableName))
  );
}

function partitionCapturesCommittedWriteRows(
  service,
  path,
  tableName = ownTableName(service),
) {
  if (path !== PATH.COMMITTED || !service?.db) return false;
  return (
    hasActiveMirrorCapture(service) ||
    tableNeedsCapturedWriteRows(tableName) ||
    (service.cdcSubscribers?.size ?? 0) > 0
  );
}

function returningSqlOf(sql, lexed) {
  const tokens = lexed?.tokens;
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return null;
  }
  let endIndex = tokens.length - 1;
  while (endIndex >= 0 && tokens[endIndex].text === CHAR.SEMICOLON) {
    endIndex -= 1;
  }
  if (endIndex < 0) {
    return null;
  }
  const lastToken = tokens[endIndex];
  return `${sql.slice(0, lastToken.start + lastToken.text.length)}${RETURNING_ALL_SUFFIX}`;
}

function prepareReturningWrite(service, lexed, sql, path) {
  if (!partitionCapturesCommittedWriteRows(service, path) ||
      hasTopLevelReturning(lexed)) {
    return null;
  }
  const returningSql = returningSqlOf(sql, lexed);
  return returningSql === null ? null :
    prepareByKind(service.db, returningSql, KIND.WRITE);
}

function admitWrite(service, lexed, params, statement, path, sql) {
  if (hasUnadmittedRowidAlias(lexed)) {
    return refusal(LAYER.ROWID_ALIAS);
  }
  const allocating = ALLOCATING_HEADS.has(lexed.head);
  const tableName = ownTableName(service);
  const protectFormationRow = tableName === PUBLICATIONS_TABLE_NAME;
  if (protectFormationRow && mentionsProtectedFormationKey(lexed, params)) {
    return refusal(LAYER.FORMATION_RECORD_PROTECTED);
  }
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
  const returningPrepared = prepareReturningWrite(
    service, lexed, sql, path,
  );
  const mutationKind = lexedMutationOperationType(lexed);
  return {admitted: true, kind: KIND.WRITE, statement, returningPrepared,
    mutationKind,
    ceilingChecked: allocating,
    protectFormationRow, ownShape,
    retainsInsertRowid: INSERTING_VERBS.has(mainVerb(lexed)) &&
      !hasDoUpdateClause(lexed.tokens)};
}

// The text rules that refuse before anything is prepared, whatever the kind:
// a refused function on every path (reads included, and nondeterministic or
// connection-state calls on writes); for a write, an OR ROLLBACK conflict
// clause and a target other than the partition's own table.
function textRuleRefusal(service, lexed, options = {}) {
  if (namesRefusedFunction(lexed, options)) {
    return refusal(LAYER.STATEMENT_FUNCTION);
  }
  if (hasRollbackResolution(lexed.tokens)) {
    return refusal(LAYER.STATEMENT_CONFLICT);
  }
  return writesForeignTable(lexed, ownTableName(service)) ?
    refusal(LAYER.STATEMENT_TABLE) : null;
}

function prepareByKind(db, sql, kind) {
  return kind === KIND.READ || kind === KIND.WRITE ?
    preparePartitionReadStatement(db, sql) :
    db.prepare(sql);
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
 * @param {Object} [options] - Optional text-rule controls.
 * @return {Object} {admitted: true, kind, statement, ceilingChecked} or
 *   {admitted: false, refusalLayer, reason}.
 */
function admitPartitionStatement(
  service, sql, params = [], path = PATH.SESSIONLESS, options = {},
) {
  const lexed = resolveNamePositions(lexPartitionStatement(sql));
  const kind = headKind(lexed, path);
  if (kind === null) {
    return refusal(LAYER.STATEMENT_KIND);
  }
  const refusedByText = textRuleRefusal(service, lexed, options);
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
  return admitWrite(service, lexed, params, statement, path, sql);
}


function statementRefusalError(refused) {
  const error = new Error(refused.reason);
  error.code = REFUSAL_CODE;
  error.refusalLayer = refused.refusalLayer;
  error.refusal = refused;
  return error;
}

function executeAdmittedWriteStatement(service, admission, params) {
  const mutationPatch =
    typeof admission.mutationKind === 'string' ?
      {mutationKind: admission.mutationKind} :
      {};
  if (!admission.returningPrepared) {
    const info = admission.statement.run(...params);
    return typeof admission.mutationKind === 'string' ?
      {...info, ...mutationPatch} :
      info;
  }
  const stmt = admission.returningPrepared;
  stmt.raw?.(true);
  stmt.safeIntegers?.(true);
  let rawRows;
  let columns;
  try {
    rawRows = stmt.all(...params);
    columns = stmt.columns().map((column) => column.name);
  } finally {
    stmt.raw?.(false);
    stmt.safeIntegers?.(false);
  }
  const typedEffects = encodeTypedRowSet(columns, rawRows);
  const affectedRows = materializeCapturedRowObjects(columns, rawRows, {
    coerceSafeBigIntToNumber: true,
  });
  const meta = prepareByKind(service.db, WRITE_EXECUTION_META_SQL, KIND.READ).get();
  return {
    changes: rawRows.length,
    lastInsertRowid: meta.lastInsertRowid,
    ...mutationPatch,
    typedEffects,
    affectedRows,
  };
}

function runBelowCeiling(service, admission, params) {
  const beforeFormation = admission.protectFormationRow === true ?
    readProtectedFormationSnapshotJson(service.db) : null;
  const info = executeAdmittedWriteStatement(service, admission, params);
  if (beforeFormation !== null &&
      readProtectedFormationSnapshotJson(service.db) !== beforeFormation) {
    throw statementRefusalError(refusal(LAYER.FORMATION_RECORD_PROTECTED));
  }
  if (admission.ceilingChecked === true && isAtRowidCeiling(admission.ownShape)) {
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
  if (admission.ceilingChecked !== true && admission.protectFormationRow !== true) {
    return {admitted: true, info: executeAdmittedWriteStatement(service, admission, params)};
  }
  try {
    return {admitted: true, info: service.db.transaction(() =>
      runBelowCeiling(service, admission, params))()};
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
 * an INSERT or REPLACE without a DO UPDATE clause and changed rows.
 * @param {Object} service - The partition.
 * @param {Object} command - The committed command ({type, sql, params}).
 * @return {{changes: number, lastInsertRowid: *, affectedRows?: Array<Object>}}
 *   The statement's result.
 */
function runCommittedPartitionStatement(service, command) {
  assertTransactionSchemaWriteEnforced(service.db, service.tableName,
    readPartitionWriteOrigin(service.db) !== null);
  const params = command.typedParams ?
    decodeTypedParams(command.typedParams) :
    (command.params || []);
  const path = command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE ?
    PATH.MIGRATION : PATH.COMMITTED;
  const admission = admitPartitionStatement(service, command.sql, params, path, {
    classifyWriteFunctions: command.carried !== true,
  });
  const outcome = admission.admitted ?
    runAdmittedPartitionStatement(service, admission, params) : admission;
  if (!outcome.admitted) {
    throw statementRefusalError(outcome);
  }
  const result = committedStatementResult(outcome.info,
    {retainsInsertRowid: admission.retainsInsertRowid === true});
  return {
    ...result,
    ...(typeof outcome.info?.mutationKind === 'string' ?
      {mutationKind: outcome.info.mutationKind} :
      {}),
    ...(outcome.info?.typedEffects ?
      {typedEffects: outcome.info.typedEffects} :
      {}),
    ...(Array.isArray(outcome.info?.affectedRows) ?
      {affectedRows: outcome.info.affectedRows} :
      {}),
  };
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
  return {
    success: true,
    rows: admission.statement.all(...params),
    rowSetComplete: true,
  };
}

export {
  admitPartitionStatement,
  classifyPartitionStatementHead,
  extractLexedDmlTargetTableName,
  extractLexedSqlMutationType,
  partitionStatementRefusalAnswer,
  readAdmittedPartitionRows,
  runAdmittedPartitionStatement,
  runCommittedPartitionStatement,
  statementRefusalError,
};
