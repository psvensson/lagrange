/**
 * TX1 (quest replicated-transaction-decision-and-apply) increment 4,
 * corrective round: the staging classifier's function layer and the leader's
 * self-check (partition-transaction-determinism.js), measured against the
 * authorities they claim to cover. The function census iterates the engine's
 * own function list (pragma_function_list) against the allow-list of
 * classifier list tx1-leg-a-2. The self-check fails on any single probe
 * observed at the wrong layer, and on a table without a declared primary key
 * it passes only by observing its ceiling probe refused at implicit_key
 * (satisfied_by_implicit_key_refusal), so the M1 migration cutover's
 * participant stages and commits (design revision 10, 0.0.14). A window
 * function or definition in a session write is refused at row_order (L9d,
 * lead decision 2026-10-11). Fixture:
 * test/test-helpers/participant-transaction-fixture.js.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {getSchemaByTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {MIGRATION_SQL} from '../../src/migration/migration-coordinator.js';
import {MIGRATION_STATUS} from '../../src/migration/migration-constants.js';
import {
  classifyTransactionStatement,
  runDeterminismSelfCheck,
} from '../../src/partition/partition-transaction-determinism.js';
import {
  TRANSACTION_ADMITTED_FUNCTIONS,
  TRANSACTION_CLASSIFIER_LAYER as LAYER,
  TRANSACTION_CLASSIFIER_LIST_VERSION,
  TRANSACTION_CLASSIFIER_VETTED_ENGINE as VETTED_ENGINE,
  TRANSACTION_SELF_CHECK_RESULT as PROBE_RESULT,
} from '../../src/partition/partition-transaction-determinism-constants.js';
import {PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {
  ELSEWHERE, INSERT_SQL, REPLICAS, ROW, TABLE, V3, applyCommitted, awaitProposal, beginMessage,
  clearFixtureSingletons, decisionCommandOf, identityOf, isPrepareCommand,
  onFixtureLeader as onLeader, ordinaryWriteOf, outcomeOf, pick, prepareMessage, queryMessage,
  resetFixtureSingletons, send, settleTicks, shutdownAll, startLeader, startReplica, track,
} from '../test-helpers/participant-transaction-fixture.js';

// The classifier list this witness was written against, and its function
// population (the witness's own copy): the classifier owner changes the
// population only with a new list version, which fails the pin below.
const LIST_VERSION = 'tx1-leg-a-2';
const ADMITTED_AT_LIST_VERSION = Object.freeze(['abs', 'avg', 'char', 'count',
  'group_concat', 'hex', 'instr', 'length', 'lower', 'ltrim', 'max', 'min', 'nullif',
  'quote', 'replace', 'round', 'rtrim', 'substr', 'substring', 'sum', 'total', 'trim',
  'typeof', 'unhex', 'unicode', 'upper']);
// The functions the vetted engine compiles inline: no function opcode names
// them, so the function layer never sees them; their programs are vetted by
// the opcode, database, root-page and row-order layers like any expression.
const INLINE_ON_VETTED_ENGINE = Object.freeze({coalesce: 'admitted',
  first_value: 'admitted', if: 'admitted', iif: 'admitted', ifnull: 'admitted',
  likelihood: 'admitted', likely: 'admitted', nth_value: 'admitted', unlikely: 'admitted'});
// The opcodes whose p4 names the function they call (design 3.3, layer 9).
const FUNCTION_OPCODES = Object.freeze(new Set(['Function', 'PureFunc', 'AggStep',
  'AggInverse', 'AggValue', 'AggFinal']));
// Argument literals tried in turn until a call compiles.
const ARGUMENT_LITERALS = Object.freeze(['NULL', '0.5', '\'a\'']);
// The M1 cutover's participant table, as the partition bootstrap creates it
// from the production schema (its table-level primary key is not declared:
// finding O2, for the bootstrap owner).
const CUTOVER_TABLE = 'schema_migration_partitions';
const CUTOVER_SCHEMA = getSchemaByTableName(CUTOVER_TABLE);
const ON_CUTOVER_TABLE = Object.freeze({tableName: CUTOVER_TABLE, schema: CUTOVER_SCHEMA});

const nondeterministic = (layer) => ({success: false,
  failureCode: CODE.SESSION_WRITE_NONDETERMINISTIC, refusalLayer: layer});
const answerOf = (answer) => pick(answer, ['success', 'failureCode', 'refusalLayer']);

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

// --- the function layer, against the engine's own function list ---

test('TX1 inc4 function layer (GAP-1): every date/time function, whatever its arguments, and ' +
  'every connection-state function is refused at function on the session path, and nothing ' +
  'refused is staged', () => onLeader(async (leader, proposed) => {
  const calls = ['date()', 'time()', 'datetime()', 'julianday()', 'unixepoch()',
    'strftime(\'%s\', \'2020-01-01\')', 'date(\'2020-01-01\')', 'CURRENT_TIMESTAMP',
    'changes()', 'total_changes()', 'last_insert_rowid()', 'sqlite_source_id()',
    'sqlite_version()'];
  const tx = identityOf('i4-functions');
  await send(leader, beginMessage(tx));
  const refusals = {};
  for (const [ordinal, call] of calls.entries()) {
    refusals[call] = answerOf(await send(leader, queryMessage(tx,
      `INSERT INTO ${TABLE} (id, value) VALUES (?, ${call})`, [`f-${ordinal}`])));
  }
  const valid = answerOf(await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value])));
  track(send(leader, prepareMessage(tx)));
  const command = await awaitProposal(proposed, isPrepareCommand);
  assert.deepEqual({refusals, valid,
    sealed: command ? JSON.parse(command.operationsText).map((operation) => operation.params) :
      null}, {refusals: Object.fromEntries(calls.map((call) =>
    [call, nondeterministic(LAYER.FUNCTION)])),
  valid: {success: true, failureCode: null, refusalLayer: null},
  sealed: [[ROW.id, ROW.value]]},
  'a value only the leader\'s clock or connection knows never stages');
}));

// The compiled program of a shape, or null when it does not compile.
function programOf(db, shape) {
  try {
    return db.prepare(`EXPLAIN ${shape.sql}`).all(...shape.params);
  } catch {
    return null;
  }
}

// One call of a listed function in the shape its type admits: a scalar as a
// session write's value, an aggregate or window function in a read.
function callShapes(entry) {
  const arities = entry.narg >= 0 ? [entry.narg] : [1, 2, 3];
  return arities.flatMap((arity) => ARGUMENT_LITERALS.map((literal) => {
    const call = `"${entry.name}"(${Array(arity).fill(literal).join(', ')})`;
    if (entry.type === 's') {
      return {sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ${call})`, params: ['k']};
    }
    return {sql: `SELECT ${call}${entry.type === 'w' ? ' OVER ()' : ''} FROM ${TABLE}`,
      params: []};
  }));
}

const namesFunction = (name) => (instruction) => FUNCTION_OPCODES.has(instruction.opcode) &&
  String(instruction.p4).startsWith(`${name}(`);
const layerOf = (classified) => classified.admitted ? 'admitted' : classified.refusalLayer;

test('TX1 inc4 function allow-list (list tx1-leg-a-2): every function the engine lists outside ' +
  'the allow-list is refused at function wherever its program names it, and the functions ' +
  'the engine compiles inline are exactly the declared set', () => onLeader(async (leader) => {
  const db = leader.db;
  const census = {refusedAtFunction: 0, elsewhere: [], inline: {}, uncompiled: []};
  for (const entry of db.prepare('SELECT name, type, narg FROM pragma_function_list ' +
    'ORDER BY name, type, narg').all()) {
    if (ADMITTED_AT_LIST_VERSION.includes(entry.name)) {
      continue;
    }
    const shape = callShapes(entry).find((candidate) => programOf(db, candidate) !== null);
    if (shape === undefined) {
      census.uncompiled.push(`${entry.name}/${entry.type}/${entry.narg}`);
      continue;
    }
    const layer = layerOf(classifyTransactionStatement(db, {tableName: TABLE, ...shape}));
    if (!programOf(db, shape).some(namesFunction(entry.name))) {
      census.inline[entry.name] = layer;
    } else if (layer === LAYER.FUNCTION) {
      census.refusedAtFunction += 1;
    } else {
      census.elsewhere.push(`${entry.name}/${entry.type}/${entry.narg}: ${layer}`);
    }
  }
  assert.deepEqual({elsewhere: census.elsewhere, inline: census.inline,
    uncompiled: census.uncompiled}, {elsewhere: [], inline: {...INLINE_ON_VETTED_ENGINE},
    uncompiled: []}, 'a function outside the allow-list is refused by name or runs inline');
  assert.ok(census.refusedAtFunction > ADMITTED_AT_LIST_VERSION.length,
    `the census refused ${census.refusedAtFunction} listed overloads at function`);
  assert.deepEqual({listVersion: TRANSACTION_CLASSIFIER_LIST_VERSION,
    allowList: [...TRANSACTION_ADMITTED_FUNCTIONS].sort(),
    engine: db.prepare('SELECT sqlite_version() AS version').get().version},
  {listVersion: LIST_VERSION, allowList: [...ADMITTED_AT_LIST_VERSION],
    engine: VETTED_ENGINE.SQLITE_VERSION},
  'the census is pinned to its list version and the vetted engine');
}));

// --- the row_order layer: window functions (L9d) ---

// The detail a window refusal is named by (a wire contract, pinned here).
const WINDOW_CLAUSE = 'window_clause';

test('TX1 inc4 window rule (L9d): a session write naming a window - first_value over an ORDER ' +
  'BY whose rows tie, in an UPDATE and in an INSERT ... SELECT, nth_value over a WINDOW ' +
  'definition, and a WINDOW definition alone - is refused at row_order (window_clause) and ' +
  'never staged; an aggregate without OVER stays admitted where it was, and session reads ' +
  'keep their windows', () =>
  onLeader(async (leader, proposed) => {
    // Two committed rows whose value ties: the window's ORDER BY cannot order them.
    for (const id of ['row-1', 'row-2']) {
      applyCommitted(leader, ordinaryWriteOf(`window-${id}`, {id, value: 'tie'}));
    }
    const tx = identityOf('i4-window');
    await send(leader, beginMessage(tx));
    const stage = async (sql, params = []) => pick(await send(leader,
      queryMessage(tx, sql, params)), ['success', 'failureCode', 'refusalLayer', 'detail']);
    const read = async (sql) => pick(await send(leader, queryMessage(tx, sql)),
      ['success', 'rows']);
    const countWrite = `INSERT INTO ${TABLE} (id) SELECT count(*) FROM ${TABLE}`;
    const facts = {
      update: await stage(`UPDATE ${TABLE} SET value = (SELECT first_value(id) OVER ` +
        `(ORDER BY value) FROM ${TABLE}) WHERE id = ?`, ['row-1']),
      insertSelect: await stage(`INSERT INTO ${TABLE} (id, value) SELECT id || '-first', ` +
        `first_value(value) OVER (ORDER BY value) FROM ${TABLE}`),
      namedWindow: await stage(`INSERT INTO ${TABLE} (id, value) SELECT id || '-nth', ` +
        `nth_value(value, 2) OVER w FROM ${TABLE} WINDOW w AS (ORDER BY value)`),
      definitionOnly: await stage(`INSERT INTO ${TABLE} (id, value) SELECT id || '-def', ` +
        `value FROM ${TABLE} WINDOW w AS (ORDER BY value)`),
      aggregateRead: await read(`SELECT max(value) AS top FROM ${TABLE}`),
      windowRead: await read('SELECT id, first_value(id) OVER (ORDER BY id) AS earliest ' +
        `FROM ${TABLE} ORDER BY id`),
      countWrite: await stage(countWrite),
    };
    track(send(leader, prepareMessage(tx)));
    const command = await awaitProposal(proposed, isPrepareCommand);
    facts.sealed = command ? JSON.parse(command.operationsText).map((operation) =>
      operation.sql) : null;
    const window = {success: false, failureCode: CODE.SESSION_WRITE_NONDETERMINISTIC,
      refusalLayer: LAYER.ROW_ORDER, detail: WINDOW_CLAUSE};
    assert.deepEqual(facts, {update: window, insertSelect: window, namedWindow: window,
      definitionOnly: window,
      aggregateRead: {success: true, rows: [{top: 'tie'}]},
      windowRead: {success: true, rows: [{id: 'row-1', earliest: 'row-1'},
        {id: 'row-2', earliest: 'row-1'}]},
      countWrite: {success: true, failureCode: null, refusalLayer: null, detail: null},
      sealed: [countWrite]},
    'a window in a write is refused until a total-order proof exists');
  }));

// --- the self-check: every probe at exactly its layer ---

// A classification that answers as the module does, except the probe at
// `flippedOrdinal`, which `flip` answers instead.
function flippedAt(flippedOrdinal, flip) {
  let ordinal = 0;
  return (db, probe) => {
    const classified = classifyTransactionStatement(db, probe);
    const observed = {admitted: classified.admitted, layer: classified.refusalLayer ?? null};
    const current = ordinal;
    ordinal += 1;
    return current === flippedOrdinal ? flip(observed) : observed;
  };
}
// Admitted where it was refused, refused (at function) where it was admitted.
const admittedInstead = (observed) => observed.admitted ?
  {admitted: false, layer: LAYER.FUNCTION} : {admitted: true, layer: null};
// Refused at a layer other than the one it was observed at.
const elsewhereInstead = (observed) => ({admitted: false,
  layer: observed.layer === LAYER.ROWID_CEILING ? LAYER.FUNCTION : LAYER.ROWID_CEILING});
const PROBE_COUNT = 9;

test('TX1 inc4 self-check (GAP-2): one probe admitted, or refused at another layer, fails the ' +
  'check, on a table with a declared primary key and on one without (whose ceiling probe ' +
  'must be observed refused at implicit_key)', async () => {
  const facts = {};
  for (const [label, extra] of [['keyed', undefined], ['keyless', ON_CUTOVER_TABLE]]) {
    await onLeader(async (leader) => {
      const tableName = leader.tableName;
      const check = (classify) => runDeterminismSelfCheck(leader.db, {tableName, classify})
        .passed;
      const ordinals = [...Array(PROBE_COUNT).keys()];
      facts[label] = {real: runDeterminismSelfCheck(leader.db, {tableName}).passed,
        admittedInstead: ordinals.map((ordinal) => check(flippedAt(ordinal, admittedInstead))),
        elsewhereInstead: ordinals.map((ordinal) => check(flippedAt(ordinal,
          elsewhereInstead)))};
    }, extra);
  }
  const failsOnEveryFlip = {real: true, admittedInstead: Array(PROBE_COUNT).fill(false),
    elsewhereInstead: Array(PROBE_COUNT).fill(false)};
  assert.deepEqual(facts, {keyed: failsOnEveryFlip, keyless: failsOnEveryFlip},
    'a disabled layer always fails the self-check');
});

test('TX1 inc4 W6s on the production schema_migration_partitions table (no declared primary ' +
  'key): the self-check passes with its ceiling probe observed refused at implicit_key and ' +
  'recorded satisfied_by_implicit_key_refusal, every other probe at its own layer, and BEGIN ' +
  'is admitted', () => onLeader(async (leader) => {
  const selfCheck = runDeterminismSelfCheck(leader.db, {tableName: CUTOVER_TABLE});
  const at = (name, layer) => ({name, admitted: false, layer, result: PROBE_RESULT.SATISFIED});
  assert.deepEqual({
    keyColumns: leader.db.prepare(`SELECT name FROM pragma_table_info('${CUTOVER_TABLE}') ` +
      'WHERE pk > 0').all(),
    passed: selfCheck.passed, cases: selfCheck.cases,
    begin: pick(await send(leader, beginMessage(identityOf('i4-keyless-begin'))),
      ['success', 'failureCode'])}, {keyColumns: [], passed: true, cases: [
    at('random', LAYER.FUNCTION), at('raft_log_read', LAYER.ROOT_PAGE),
    at('pragma_table_valued', LAYER.OPCODE), at('pragma_statement', LAYER.STATEMENT_KIND),
    at('temp_schema_read', LAYER.DATABASE), at('implicit_key_insert', LAYER.IMPLICIT_KEY),
    at('aggregate_insert', LAYER.ROW_ORDER),
    {name: 'ceiling_insert', admitted: false, layer: LAYER.IMPLICIT_KEY,
      result: PROBE_RESULT.SATISFIED_BY_IMPLICIT_KEY_REFUSAL},
    {name: 'partition_table_read', admitted: true, layer: null,
      result: PROBE_RESULT.SATISFIED}],
  begin: {success: true, failureCode: null}},
  'where no admitted statement can move a rowid, the ceiling probe is satisfied, by name');
}, ON_CUTOVER_TABLE));

// --- the M1 cutover's participant ---

test('TX1 inc4 M1 cutover: the migration coordinator\'s exact cutover UPDATE ' +
  '(UPDATE_PARTITION_MIGRATION_BY_PK) stages in a participant transaction on the production ' +
  'schema_migration_partitions table, and its PREPARE and COMMIT apply identically on two ' +
  'replicas', async () => {
  const seed = {type: PARTITION_SERVICE_OPERATION.INSERT, entryId: 'i4-m1-seed',
    sql: MIGRATION_SQL.INSERT_PARTITION_MIGRATION,
    params: ['m1', 'p1', MIGRATION_STATUS.BACKFILL_COMPLETE, '42', 1, null, 100],
    timestamp: '', proposedBy: ELSEWHERE, proposedAt: 0};
  // executeCutoverTransaction's params for one partition row (status,
  // backfill_cursor, retry_count, error_message, updated_at, migration_id,
  // partition_id).
  const cutover = [MIGRATION_STATUS.COMPLETED, '42', 1, null, 200, 'm1', 'p1'];
  const tx = identityOf('i4-m1-cutover', {sessionId: 'schema-migration-cutover-m1'});
  const {leader, proposed} = await startLeader(ON_CUTOVER_TABLE);
  const follower = await startReplica(REPLICAS[1], ON_CUTOVER_TABLE);
  const rowsOf = (replica) => replica.db.prepare(`SELECT * FROM ${CUTOVER_TABLE}`).all();
  try {
    const facts = {seed: [applyCommitted(leader, seed), applyCommitted(follower, seed)],
      begin: pick(await send(leader, beginMessage(tx)), ['success', 'failureCode'])};
    facts.staged = pick(await send(leader, queryMessage(tx,
      MIGRATION_SQL.UPDATE_PARTITION_MIGRATION_BY_PK, cutover)),
    ['success', 'failureCode', 'refusalLayer', 'changes']);
    const prepare = track(send(leader, prepareMessage(tx)));
    const command = await awaitProposal(proposed, isPrepareCommand);
    facts.prepareApply = command === null ? 'not proposed' :
      [applyCommitted(leader, command), applyCommitted(follower, command)];
    await settleTicks();
    facts.prepared = prepare.settled ? pick(prepare.value, ['success', 'state']) : 'pending';
    facts.decisionApply = command === null ? 'not proposed' : [leader, follower].map(
      (replica) => applyCommitted(replica, decisionCommandOf(tx, V3.DECISION.COMMIT,
        command.preparedDigest)));
    facts.outcomes = [await outcomeOf(leader, tx), await outcomeOf(follower, tx)];
    facts.rows = [rowsOf(leader), rowsOf(follower)];
    const row = {migration_id: 'm1', partition_id: 'p1', status: MIGRATION_STATUS.COMPLETED,
      backfill_cursor: '42', retry_count: 1, error_message: null, updated_at: 200};
    const committed = {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
      state: V3.STATE.COMMITTED};
    assert.deepEqual(facts, {seed: [null, null], begin: {success: true, failureCode: null},
      staged: {success: true, failureCode: null, refusalLayer: null, changes: 1},
      prepareApply: [null, null], prepared: {success: true, state: V3.STATE.PREPARED},
      decisionApply: [null, null], outcomes: [committed, committed], rows: [[row], [row]]},
    'the cutover commits the same row on every replica');
  } finally {
    await shutdownAll(leader, follower);
  }
});
