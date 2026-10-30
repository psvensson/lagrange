// The participant's staging classifier (TX1 design revision 10, section 3.3;
// decisions I, Q, AB, AH, AK, AN, AO): one fail-closed owner of whether a
// session statement may stage on the leader. It runs on the leader only,
// before the c' validation (partition-participant-transaction-staging.js);
// the apply side never re-classifies, so a committed PREPARE applies as
// carried and a classifier change only changes what a new leader admits.
//
// It enforces a stated supported SQL population with default refusal
// (partition-transaction-determinism-constants.js, with the declared false
// refusals); the first refusing layer is named in the answer:
//   1. statement_kind: the head (SQLite-lexed, statement-admission owner) is
//      a session head; nothing it refuses is ever prepared;
//   2. rowid_alias (writes): any rowid alias token;
//   3. row_order, text (writes): an OVER or WINDOW keyword (a window
//      function or definition, detail `window_clause`), LIMIT, OFFSET, a
//      subquery not under IN or EXISTS;
//      and the increment-2 text rules on writes: statement_conflict (OR
//      ROLLBACK) and statement_table (the own table only);
//   4. compile: prepare and EXPLAIN on the leader's connection, the kind
//      cross-checked with Statement#readonly and #reader;
//   5. opcode: every opcode of the program is in the population;
//   6. database: every cursor, transaction and clear addresses main;
//   7. root_page: every opened or cleared root page is the own table's or
//      one of its indexes', read from sqlite_master at each classification;
//   8. row_order, program (writes): no aggregate opcode;
//   9. function: every named function is on the allow-list;
//  10. implicit_key (writes): the primary key explicit (R2 in a session);
//  11. rowid_ceiling (allocating writes): the own table below 2^62 before the
//      statement (the c' validation checks it after the statement too).
// The leader's self-check (runDeterminismSelfCheck) classifies nine fixed
// probes on the running binary, each refused at exactly its layer (the
// ceiling probe at implicit_key on a table without a declared primary key).
import {lexPartitionStatement} from './partition-statement-admission-lexer.js';
import {
  dmlVerbIndex,
  hasRollbackResolution,
  resolveNamePositions,
  writesForeignTable,
} from './partition-statement-admission-names.js';
import {
  hasRowidAliasToken,
  isAtRowidCeiling,
  readTableShape,
  refusesEverySessionInsert,
  refusesSessionKey,
} from './partition-statement-admission-rowid-rules.js';
import {
  PARTITION_ROWID_ALIASES,
  PARTITION_STATEMENT_CHAR as CHAR,
  PARTITION_STATEMENT_KEYWORD as KEYWORD,
} from './partition-statement-admission-constants.js';
import {
  TRANSACTION_ADMITTED_FUNCTIONS as ADMITTED_FUNCTIONS,
  TRANSACTION_ADMITTED_OPCODES as ADMITTED_OPCODES,
  TRANSACTION_AGGREGATE_OPCODES as AGGREGATE_OPCODES,
  TRANSACTION_CLASSIFIER_LAYER as LAYER,
  TRANSACTION_CLASSIFIER_SQL as SQL,
  TRANSACTION_CLASSIFIER_VETTED_ENGINE as VETTED_ENGINE,
  TRANSACTION_FUNCTION_OPCODES as FUNCTION_OPCODES,
  TRANSACTION_PROGRAM as PROGRAM,
  TRANSACTION_ROW_ORDER_TEXT as ROW_ORDER_TEXT,
  TRANSACTION_SELF_CHECK_PROBES as PROBES,
  TRANSACTION_SELF_CHECK_RESULT as PROBE_RESULT,
  TRANSACTION_SELF_CHECK_VALUE as PROBE_VALUE,
  TRANSACTION_STATEMENT_KIND as KIND,
} from './partition-transaction-determinism-constants.js';

const WRITE_VERBS = new Set([KEYWORD.INSERT, KEYWORD.REPLACE, KEYWORD.UPDATE,
  KEYWORD.DELETE]);
const ALLOCATING_VERBS = new Set([KEYWORD.INSERT, KEYWORD.REPLACE]);
const SESSION_HEADS = new Set([...WRITE_VERBS, KEYWORD.SELECT, KEYWORD.WITH]);
// The private value that ends the ceiling probe's sentinel transaction.
const PROBE_COMPLETE = Object.freeze({probeComplete: true});
const PRAGMA_SCHEMA_VERSION = 'schema_version';
const PLAN_KEY_SEP = '\0';
const ZERO = 0;
const ONE = 1;
const COMPILED_PLAN_STORES = new WeakMap();

function compiledPlanStoreOf(connection) {
  let store = COMPILED_PLAN_STORES.get(connection);
  if (!store) {
    store = {
      schemaVersion: null,
      compiledHitCount: ZERO,
      compiledMissCount: ZERO,
      entries: new Map(),
    };
    COMPILED_PLAN_STORES.set(connection, store);
  }
  return store;
}

function readSchemaVersionOf(connection) {
  try {
    return Number(connection?.pragma?.(PRAGMA_SCHEMA_VERSION, {simple: true})) || ZERO;
  } catch (_err) {
    return ZERO;
  }
}

function getDeterminismClassifierStats(connection) {
  const store = compiledPlanStoreOf(connection);
  return {
    compiledHitCount: store.compiledHitCount,
    compiledMissCount: store.compiledMissCount,
    size: store.entries.size,
  };
}

function refusal(refusalLayer, detail = null) {
  return Object.freeze({admitted: false, refusalLayer, detail});
}

// --- 1: the kind of a session statement, from its text ---

// A read when its verb is SELECT (a WITH read's first top-level verb), a
// write when its verb is INSERT, REPLACE, UPDATE or DELETE; UNADMITTED when
// its head is not a session head.
function statementKindOf(lexed) {
  if (!SESSION_HEADS.has(lexed.head)) {
    return KIND.UNADMITTED;
  }
  if (dmlVerbIndex(lexed) >= 0) {
    return KIND.WRITE;
  }
  return lexed.head === KEYWORD.SELECT || lexed.head === KEYWORD.WITH ?
    KIND.READ : KIND.UNADMITTED;
}

/**
 * The kind of a session statement from its text alone (a read, a write, or
 * UNADMITTED when its head is refused): what the staging owner checks a
 * write's params for before it classifies.
 * @param {string} sql - The statement.
 * @return {string} A TRANSACTION_STATEMENT_KIND.
 */
function transactionStatementKindOf(sql) {
  return statementKindOf(lexPartitionStatement(sql));
}

// --- 2, 3: the text rules of a session write ---

function opensRefusedSubquery(tokens, index) {
  return tokens[index].text === CHAR.OPEN_PAREN &&
    ROW_ORDER_TEXT.SUBQUERY_OPENERS.has(tokens[index + 1]?.upper) &&
    !ROW_ORDER_TEXT.OPERAND_PREDECESSORS.has(tokens[index - 1]?.upper);
}

function hasOrderDependentText(tokens) {
  return tokens.some((token, index) => ROW_ORDER_TEXT.KEYWORDS.has(token.upper) ||
    opensRefusedSubquery(tokens, index));
}

// L9d: any window function or window definition. Its result follows the
// order of rows that tie in the window, and `first_value` and `nth_value`
// compile to no aggregate opcode, so the program layer cannot see them.
function hasWindowClause(tokens) {
  return tokens.some((token) => ROW_ORDER_TEXT.WINDOW_KEYWORDS.has(token.upper));
}

function writeTextRefusal(lexed, tableName) {
  if (hasRowidAliasToken(lexed)) {
    return refusal(LAYER.ROWID_ALIAS);
  }
  if (hasWindowClause(lexed.tokens)) {
    return refusal(LAYER.ROW_ORDER, ROW_ORDER_TEXT.WINDOW_DETAIL);
  }
  if (hasOrderDependentText(lexed.tokens)) {
    return refusal(LAYER.ROW_ORDER);
  }
  if (hasRollbackResolution(lexed.tokens)) {
    return refusal(LAYER.STATEMENT_CONFLICT);
  }
  return writesForeignTable(lexed, tableName) ? refusal(LAYER.STATEMENT_TABLE) : null;
}

// --- 4: compile ---

function compiled(db, sql, params) {
  try {
    const statement = db.prepare(sql);
    const program = db.prepare(`${SQL.EXPLAIN_PREFIX}${sql}`).all(...params);
    return {statement, program};
  } catch (compileError) {
    // The client's own deterministic error: nothing stages.
    return {failure: refusal(LAYER.COMPILE, String(compileError?.message))};
  }
}

function flagsMatchKind(statement, kind) {
  return kind === KIND.WRITE ? !statement.readonly :
    statement.readonly && statement.reader;
}

// --- 5-9: the program ---

function addressesOnlyMain(instruction) {
  if (PROGRAM.CURSOR_OPENS.has(instruction.opcode)) {
    return instruction.p3 === PROGRAM.MAIN_DATABASE &&
      (instruction.p5 & PROGRAM.P2_IS_REGISTER) === 0;
  }
  if (instruction.opcode === PROGRAM.TRANSACTION) {
    return instruction.p1 === PROGRAM.MAIN_DATABASE;
  }
  return instruction.opcode !== PROGRAM.CLEAR ||
    instruction.p2 === PROGRAM.MAIN_DATABASE;
}

function readRootPages(db, tableName) {
  return new Set(db.prepare(SQL.ROOT_PAGES).all(tableName)
    .map((row) => row.rootpage));
}

function opensOnlyOwnRoots(instruction, roots) {
  if (PROGRAM.CURSOR_OPENS.has(instruction.opcode)) {
    return roots.has(instruction.p2);
  }
  return instruction.opcode !== PROGRAM.CLEAR || roots.has(instruction.p1);
}

function namedFunction(instruction) {
  const p4 = String(instruction.p4 ?? '');
  const open = p4.indexOf(PROGRAM.FUNCTION_ARGUMENTS);
  return (open < 0 ? p4 : p4.slice(0, open)).toLowerCase();
}

function programRefusal(db, program, {kind, tableName}) {
  if (!program.every((instruction) => ADMITTED_OPCODES.has(instruction.opcode))) {
    return refusal(LAYER.OPCODE);
  }
  if (!program.every(addressesOnlyMain)) {
    return refusal(LAYER.DATABASE);
  }
  const roots = readRootPages(db, tableName);
  if (!program.every((instruction) => opensOnlyOwnRoots(instruction, roots))) {
    return refusal(LAYER.ROOT_PAGE);
  }
  if (kind === KIND.WRITE &&
      program.some((instruction) => AGGREGATE_OPCODES.has(instruction.opcode))) {
    return refusal(LAYER.ROW_ORDER);
  }
  return program.every((instruction) => !FUNCTION_OPCODES.has(instruction.opcode) ||
    ADMITTED_FUNCTIONS.has(namedFunction(instruction))) ? null :
    refusal(LAYER.FUNCTION);
}

// --- 10, 11: the key and the ceiling of a write ---

function keyAndCeilingRefusal(db, lexed, {params, tableName}) {
  if (refusesSessionKey(db, lexed, params, tableName)) {
    return refusal(LAYER.IMPLICIT_KEY);
  }
  const verb = lexed.tokens[dmlVerbIndex(lexed)].upper;
  const allocating = ALLOCATING_VERBS.has(verb);
  return allocating && isAtRowidCeiling(readTableShape(db, tableName)) ?
    refusal(LAYER.ROWID_CEILING) : null;
}

/**
 * Classify one session statement on the leader's connection, layers 1-11 in
 * order (the first refusal wins). An admitted statement is returned prepared.
 * Nothing a text layer refuses is ever prepared; a refused statement never
 * runs.
 * @param {Object} db - The leader's connection.
 * @param {Object} request - {tableName, sql, params}: the partition's own
 *   table, the statement and its bound params (JSON scalars).
 * @return {Object} {admitted: true, kind, statement} or {admitted: false,
 *   refusalLayer, detail}.
 */
function classifyTransactionStatement(db, {tableName, sql, params = []}) {
  const bound = Array.isArray(params) ? params : [];
  const store = db && typeof db === 'object' ? compiledPlanStoreOf(db) : null;
  const schemaVersion = store ? readSchemaVersionOf(db) : ZERO;
  if (store && store.schemaVersion !== schemaVersion) {
    store.schemaVersion = schemaVersion;
    store.entries.clear();
  }
  const planKey = `${tableName}${PLAN_KEY_SEP}${sql}`;
  const existingPlan = store?.entries.get(planKey) ?? null;
  if (existingPlan && existingPlan.paramCount === bound.length) {
    store.compiledHitCount += ONE;
    const keyRefused = existingPlan.kind === KIND.WRITE ?
      keyAndCeilingRefusal(db, existingPlan.lexed, {params: bound, tableName}) :
      null;
    return keyRefused ?? existingPlan.admittedOutcome;
  }
  if (store) {
    store.compiledMissCount += ONE;
  }
  const lexed = resolveNamePositions(lexPartitionStatement(sql));
  const kind = statementKindOf(lexed);
  if (kind === KIND.UNADMITTED) {
    return refusal(LAYER.STATEMENT_KIND);
  }
  const textRefusal = kind === KIND.WRITE ? writeTextRefusal(lexed, tableName) : null;
  if (textRefusal !== null) {
    return textRefusal;
  }
  const {statement, program, failure} = compiled(db, sql, bound);
  if (failure !== undefined) {
    return failure;
  }
  if (!flagsMatchKind(statement, kind)) {
    return refusal(LAYER.STATEMENT_KIND);
  }
  const programRefused = programRefusal(db, program, {kind, tableName});
  if (programRefused !== null) {
    return programRefused;
  }
  const admittedOutcome = Object.freeze({admitted: true, kind, statement});
  if (store) {
    store.entries.set(planKey, {
      lexed,
      kind,
      statement,
      paramCount: bound.length,
      admittedOutcome,
    });
  }
  const keyRefused = kind === KIND.WRITE ?
    keyAndCeilingRefusal(db, lexed, {params: bound, tableName}) : null;
  return keyRefused ?? admittedOutcome;
}

// --- the leader's self-check ---

function quoteName(name) {
  return CHAR.DOUBLE_QUOTE +
    String(name).replaceAll(CHAR.DOUBLE_QUOTE, CHAR.DOUBLE_QUOTE + CHAR.DOUBLE_QUOTE) +
    CHAR.DOUBLE_QUOTE;
}

// The ceiling row's columns and values: the rowid (or the INTEGER PRIMARY
// KEY) bound to the ceiling, and every other NOT NULL column filled with the
// text literal; null when every rowid alias name is shadowed.
function ceilingPlantOf(shape) {
  const rowidColumn = shape.integerPrimaryKey ??
    PARTITION_ROWID_ALIASES.find((alias) => !shape.columns.includes(alias)) ?? null;
  if (rowidColumn === null) {
    return null;
  }
  const filled = shape.notNull.filter((column) => column !== rowidColumn);
  return {
    columns: [rowidColumn, ...filled].map(quoteName).join(PROBE_VALUE.KEY_SEPARATOR),
    values: [PROBE_VALUE.CEILING_PARAM, ...filled.map(() => PROBE_VALUE.TEXT_KEY)]
      .join(PROBE_VALUE.KEY_SEPARATOR),
  };
}

// The partition table's probe shape: its key columns with in-range
// literals, a non-key column, and the aggregate insert built over them.
function probeShapeOf(db, tableName) {
  const shape = readTableShape(db, tableName);
  const keyNames = shape.primaryKey.length > 0 ? shape.primaryKey :
    shape.columns.slice(0, 1);
  const keyValue = shape.integerPrimaryKey === null ? PROBE_VALUE.TEXT_KEY :
    PROBE_VALUE.INTEGER_KEY;
  const keys = keyNames.map(quoteName);
  const keyValues = keyNames.map(() => keyValue);
  const nonKey = shape.columns.find((column) => !keyNames.includes(column));
  const column = nonKey === undefined ? null : quoteName(nonKey);
  const aggregate = column === null ? {target: keys.join(PROBE_VALUE.KEY_SEPARATOR),
    select: [...keyValues.slice(0, -1), PROBE_VALUE.AGGREGATE]
      .join(PROBE_VALUE.KEY_SEPARATOR), column: keys.at(-1)} :
    {target: [...keys, column].join(PROBE_VALUE.KEY_SEPARATOR),
      select: [...keyValues, PROBE_VALUE.AGGREGATE].join(PROBE_VALUE.KEY_SEPARATOR),
      column};
  return {table: quoteName(tableName), keys: keys.join(PROBE_VALUE.KEY_SEPARATOR),
    keyValues: keyValues.join(PROBE_VALUE.KEY_SEPARATOR), column, aggregate,
    ceilingPlant: ceilingPlantOf(shape),
    everyInsertRefused: shape.exists && refusesEverySessionInsert(shape)};
}

// What a probe must be observed doing on this table: refused at its own
// layer (admitted for the table read), except the ceiling probe on a table
// whose key rule refuses every INSERT (no declared primary key). There no
// admitted statement can move a rowid (layer 10 refuses every INSERT, R1
// every rowid assignment), so the ceiling layer guards nothing; the probe
// must be observed refused at implicit_key, and records that it was
// (revision 10, 0.0.14).
function expectationOf(probe, shape) {
  return probe.ceiling === true && shape.everyInsertRefused ?
    {layer: LAYER.IMPLICIT_KEY, satisfied: PROBE_RESULT.SATISFIED_BY_IMPLICIT_KEY_REFUSAL} :
    {layer: probe.layer, satisfied: PROBE_RESULT.SATISFIED};
}

function probeResultOf(observed, expected) {
  const met = expected.layer === null ? observed.admitted :
    !observed.admitted && observed.layer === expected.layer;
  return met ? expected.satisfied : PROBE_RESULT.UNSATISFIED;
}

// The module's own classification of a probe, as a case ({admitted, layer}).
function classifyProbe(db, probe) {
  const classified = classifyTransactionStatement(db, probe);
  return {admitted: classified.admitted, layer: classified.refusalLayer ?? null};
}

// The ceiling probe: classified while a row at the rowid ceiling exists,
// inside a sentinel transaction that plants it and rolls back.
function classifyAtCeiling(db, shape, classify, probe) {
  let outcome = {admitted: false, layer: LAYER.PROBE_UNAVAILABLE};
  try {
    db.transaction(() => {
      db.prepare(PROBE_VALUE.plantCeiling(shape.table, shape.ceilingPlant.columns,
        shape.ceilingPlant.values)).run(PROBE_VALUE.CEILING_ROWID);
      outcome = classify(db, probe);
      throw PROBE_COMPLETE;
    })();
  } catch (stopped) {
    if (stopped !== PROBE_COMPLETE) {
      // The row cannot be planted on this table: the probe is unavailable.
      outcome = {admitted: false, layer: LAYER.PROBE_UNAVAILABLE};
    }
  }
  return outcome;
}

function readEngine(db) {
  const engine = db.prepare(SQL.ENGINE).get();
  return {...engine, vetted: engine.sqliteVersion === VETTED_ENGINE.SQLITE_VERSION &&
    engine.sqliteSourceId === VETTED_ENGINE.SQLITE_SOURCE_ID};
}

/**
 * The leader's determinism self-check (design 3.3, AH): nine fixed probes
 * classified on this connection, each refused at exactly its layer and the
 * last admitted, on the vetted SQLite build. A disabled layer admits its
 * probe or refuses it at a later layer, and fails the check. Each case
 * records its result: satisfied, satisfied_by_implicit_key_refusal (the
 * ceiling probe on a table without a declared primary key), or unsatisfied.
 * @param {Object} db - The leader's connection.
 * @param {Object} options - {tableName, classify?}: the partition's table,
 *   and an injected classification ((db, {tableName, sql, params}) =>
 *   {admitted, layer}), the module's own by default.
 * @return {{passed: boolean, cases: Array<{name: string, admitted: boolean,
 *   layer: (string|null), result: string}>, engine: Object}} The result,
 *   probes in order.
 */
function runDeterminismSelfCheck(db, {tableName, classify = classifyProbe} = {}) {
  const shape = probeShapeOf(db, tableName);
  const cases = PROBES.map((probe) => {
    const request = {tableName, sql: probe.sql(shape), params: []};
    const outcome = probe.ceiling === true && shape.ceilingPlant !== null ?
      classifyAtCeiling(db, shape, classify, request) : classify(db, request);
    const observed = {admitted: outcome?.admitted === true, layer: outcome?.layer ?? null};
    return {name: probe.name, ...observed,
      result: probeResultOf(observed, expectationOf(probe, shape))};
  });
  const engine = readEngine(db);
  const passed = engine.vetted &&
    cases.every((entry) => entry.result !== PROBE_RESULT.UNSATISFIED);
  return {passed, cases, engine};
}

export {
  classifyTransactionStatement,
  getDeterminismClassifierStats,
  runDeterminismSelfCheck,
  transactionStatementKindOf,
};
