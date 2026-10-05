/**
 * PG-wire command tags through the REAL path: one embedded Lagrange runtime
 * (real SQL engine, real partitions and storage) behind the real
 * sys-postgres-wire listener, driven by the real `pg` client.
 *
 * Oracle: the PostgreSQL protocol's CommandComplete tags - `INSERT 0 <n>`,
 * `UPDATE <n>`, `DELETE <n>`, `SELECT <n>` - where <n> is the number of rows
 * the statement changed or returned, counted from the test's own data (not
 * from the path under test). The exact tag text is read from the client's
 * CommandComplete messages; `rowCount` is node-postgres's parse of it, the
 * value ORMs and optimistic-locking clients check.
 */

import {execFile} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

import {test} from '../../src/test-helpers/tap.js';
import {
  managedSleep,
  reportOpenHandlesOnTeardown,
} from '../../src/test-helpers/managed-timers.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {openConsumerSession} from './helpers/public-binding-consumer.js';
import {
  enablePasswordPgwire,
  startSeamRuntime,
  stopPlacedPgwireReplicas,
  useSingleNodeReplicaShape,
} from './helpers/public-binding-seam-harness.js';
import {scaleByMachineFactor} from './helpers/test-machine-factor.js';

const TEST_TIMEOUT_MS = 300_000;
const WAIT_MS = scaleByMachineFactor(60_000);
const POLL_MS = 100;
const ports = createPortAllocator(import.meta.url);
const PROBE_GUARD_SUBJECT = 'pgwire-command-tag-real-engine starts an embedded runtime';
const TEMPORARY_PREFIX = 'lagrange-pgwire-command-tags-';
const APPLICATION_ID = 'pgwire-command-tags';
const NODE_ID = 'pgwire-command-tags-node';
const CREDENTIALS = Object.freeze({
  database: 'pgwire_tags',
  password: 'pgwire-tags-password',
  user: 'pgwire_tags_app',
});
const TABLE = 'tag_rows';
const EXTENDED = 'extended';
const EMPTY_QUERY_RESPONSE = 'EmptyQueryResponse';

/**
 * Run one statement and capture what the client received: every
 * CommandComplete tag text (an EmptyQueryResponse is recorded as
 * EMPTY_QUERY_RESPONSE), node-postgres's command/rowCount, the rows, or the
 * ErrorResponse code and message, and the transaction status of the
 * ReadyForQuery that ended the exchange ('I' idle, 'T' in a transaction
 * block, 'E' in a failed transaction block). node-postgres settles a failed
 * query on the ErrorResponse, before the ReadyForQuery, so the status is
 * awaited separately.
 *
 * @param {object} client - pg.Client.
 * @param {string} text - SQL.
 * @param {unknown[]} [values] - Parameters (forces the extended protocol).
 * @return {Promise<object>} Observation.
 */
async function observe(client, text, values) {
  const tags = [];
  const notices = [];
  const onComplete = (message) => tags.push(message.text);
  const onEmpty = () => tags.push(EMPTY_QUERY_RESPONSE);
  const onNotice = (message) => notices.push({
    code: message.code, message: message.message, severity: message.severity,
  });
  const ready = new Promise((resolve) => {
    client.connection.once('readyForQuery', (message) => {
      resolve(message.status);
    });
  });
  client.connection.on('commandComplete', onComplete);
  client.connection.on('emptyQuery', onEmpty);
  client.connection.on('notice', onNotice);
  let observation;
  try {
    const query = values === undefined ?
      {text} :
      {text, values, queryMode: EXTENDED};
    const result = await client.query(query);
    const results = Array.isArray(result) ? result : [result];
    observation = {
      tags,
      rowCounts: results.map((entry) => entry.rowCount),
      commands: results.map((entry) => entry.command),
      rows: results.map((entry) => entry.rows),
      error: null,
    };
  } catch (error) {
    observation = {tags, error: {
      code: error.code, detail: error.detail, message: error.message,
    }};
  } finally {
    client.connection.removeListener('commandComplete', onComplete);
    client.connection.removeListener('emptyQuery', onEmpty);
  }
  const status = await ready;
  client.connection.removeListener('notice', onNotice);
  return {...observation, notices, status};
}

async function startRuntime(t) {
  const root = await mkdtemp(path.join(tmpdir(), TEMPORARY_PREFIX));
  t.teardown(() => rm(root, {force: true, recursive: true}));
  const {restApiPort: restPort} = ports.getListenerPorts();
  const pgwirePort = ports.getPort();
  const runtime = await startSeamRuntime({
    credentials: CREDENTIALS,
    dataDir: path.join(root, 'node-data'),
    nodeId: NODE_ID,
    restPort,
  });
  const db = runtime.handle.openApplicationDatabase({
    applicationId: APPLICATION_ID,
  });
  let endpoint = null;
  t.teardown(async () => {
    if (endpoint) await stopPlacedPgwireReplicas(runtime, db);
    await runtime.handle.stop();
    runtime.restoreEnvironment();
  });
  const wait = () => ({
    deadlineMs: Date.now() + WAIT_MS,
    pause: () => managedSleep(t, POLL_MS),
  });
  endpoint = await enablePasswordPgwire(db, pgwirePort, {...wait(), restPort});
  useSingleNodeReplicaShape(runtime.engine);
  const client = await openConsumerSession({...endpoint, ...CREDENTIALS});
  t.teardown(() => client.end());
  return {client, db, endpoint, engine: runtime.engine};
}

// Statement kind -> the SQL a client sends, its parameters (extended
// protocol when present) and the exact CommandComplete tag the PostgreSQL
// protocol requires, counted from this table's own data.
const TAG_CASES = Object.freeze([
  ['create table', `CREATE TABLE ${TABLE} ` +
    '(id INTEGER PRIMARY KEY, n INTEGER, label TEXT)', undefined,
  'CREATE TABLE'],
  ['insert one row', `INSERT INTO ${TABLE} (id, n, label) ` +
    'VALUES (1, 1, \'a\')', undefined, 'INSERT 0 1'],
  ['multi-row insert of three', `INSERT INTO ${TABLE} (id, n, label) ` +
    'VALUES (2, 2, \'b\'), (3, 2, \'c\'), (4, 3, \'d\')', undefined,
  'INSERT 0 3'],
  ['update two rows', `UPDATE ${TABLE} SET label = 'x' WHERE n = 2`,
    undefined, 'UPDATE 2'],
  ['update zero rows', `UPDATE ${TABLE} SET label = 'y' WHERE n = 99`,
    undefined, 'UPDATE 0'],
  ['select four rows', `SELECT id FROM ${TABLE}`, undefined, 'SELECT 4'],
  ['extended insert', `INSERT INTO ${TABLE} (id, n, label) ` +
    'VALUES ($1, $2, $3)', [5, 5, 'e'], 'INSERT 0 1'],
  ['extended update', `UPDATE ${TABLE} SET label = $1 WHERE id = $2`,
    ['z', 5], 'UPDATE 1'],
  ['extended delete of zero rows', `DELETE FROM ${TABLE} WHERE id = $1`,
    [999], 'DELETE 0'],
  ['insert on conflict do update', `INSERT INTO ${TABLE} (id, n, label) ` +
    'VALUES (1, 1, \'u\') ON CONFLICT (id) DO UPDATE SET label = \'u\'',
  undefined, 'INSERT 0 1'],
  ['begin', 'BEGIN', undefined, 'BEGIN'],
  ['insert inside a transaction', `INSERT INTO ${TABLE} (id, n, label) ` +
    'VALUES (6, 6, \'f\')', undefined, 'INSERT 0 1'],
  ['update inside a transaction',
    `UPDATE ${TABLE} SET label = 'g' WHERE id = 6`, undefined, 'UPDATE 1'],
  ['commit', 'COMMIT', undefined, 'COMMIT'],
  ['delete two rows', `DELETE FROM ${TABLE} WHERE n = 2`, undefined,
    'DELETE 2'],
  ['select after the writes', `SELECT id, label FROM ${TABLE} ORDER BY id`,
    undefined, 'SELECT 4'],
]);
const FEATURE_NOT_SUPPORTED = '0A000';
const MULTIPLE_STATEMENTS_UNSUPPORTED = 'MULTIPLE_STATEMENTS_UNSUPPORTED';
const IDLE = 'I';
const FAILED = 'E';
const PSQL_COMMAND = 'psql';
const execFileAsync = promisify(execFile);

// A write whose text does not begin with its keyword (a leading comment, a
// CTE) is still the statement the engine executed: its tag comes from the
// executed statement kind, never from the text prefix. Simple and extended
// protocol, one table each so neither crosses the load-split threshold.
const KIND_TABLE_DDL = ' (id INTEGER PRIMARY KEY, n INTEGER, label TEXT)';
const KIND_SEED = ' (id, n, label) VALUES (1, 1, \'a\'), (2, 1, \'b\'), ' +
  '(3, 2, \'c\'), (4, 2, \'d\')';
const STATEMENT_KIND_CASES = Object.freeze([
  ['kind_simple', [
    ['line comment before UPDATE', '-- note\nUPDATE kind_simple ' +
      'SET label = \'lc\' WHERE n = 1', undefined, 'UPDATE 2'],
    ['block comment before DELETE', '/* note */ DELETE FROM kind_simple ' +
      'WHERE id = 3', undefined, 'DELETE 1'],
    ['block comment before INSERT', '/* x */ INSERT INTO kind_simple ' +
      '(id, n, label) VALUES (5, 5, \'e\')', undefined, 'INSERT 0 1'],
    ['CTE before UPDATE', 'WITH x AS (SELECT 1) UPDATE kind_simple ' +
      'SET label = \'w\' WHERE id = 4', undefined, 'UPDATE 1'],
    ['rows after the commented writes', 'SELECT id, label FROM ' +
      'kind_simple ORDER BY id', undefined, 'SELECT 4'],
  ], [
    {id: 1, label: 'lc'}, {id: 2, label: 'lc'}, {id: 4, label: 'w'},
    {id: 5, label: 'e'},
  ]],
  ['kind_extended', [
    ['extended line comment before UPDATE', '-- note\nUPDATE ' +
      'kind_extended SET label = $1 WHERE n = $2', ['lc', 1], 'UPDATE 2'],
    ['extended block comment before DELETE', '/* note */ DELETE FROM ' +
      'kind_extended WHERE id = $1', [3], 'DELETE 1'],
    ['extended block comment before INSERT', '/* x */ INSERT INTO ' +
      'kind_extended (id, n, label) VALUES ($1, $2, $3)', [5, 5, 'e'],
    'INSERT 0 1'],
    ['extended CTE before UPDATE', 'WITH x AS (SELECT 1) UPDATE ' +
      'kind_extended SET label = $1 WHERE id = $2', ['w', 4], 'UPDATE 1'],
    ['extended rows after the commented writes', 'SELECT id, label FROM ' +
      'kind_extended WHERE id > $1 ORDER BY id', [0], 'SELECT 4'],
  ], [
    {id: 1, label: 'lc'}, {id: 2, label: 'lc'}, {id: 4, label: 'w'},
    {id: 5, label: 'e'},
  ]],
]);

const MULTI_TABLE = 'multi_rows';
const MULTI_SEED_ROWS = Object.freeze([
  {id: 1, label: 'a'}, {id: 2, label: 'b'}, {id: 3, label: 'c'},
]);
const MULTI_SELECT = `SELECT id, label FROM ${MULTI_TABLE} ORDER BY id`;
// Every multi-statement query is refused whole: 0A000 and NOTHING applied.
const MULTI_STATEMENT_REFUSALS = Object.freeze([
  ['UPDATE; DELETE', `UPDATE ${MULTI_TABLE} SET label = 'm' WHERE id = 1; ` +
    `DELETE FROM ${MULTI_TABLE} WHERE id = 2`],
  ['INSERT; INSERT', `INSERT INTO ${MULTI_TABLE} (id, label) ` +
    `VALUES (10, 'x'); INSERT INTO ${MULTI_TABLE} (id, label) ` +
    'VALUES (11, \'y\')'],
  ['SELECT; DELETE', `SELECT id FROM ${MULTI_TABLE}; DELETE FROM ` +
    `${MULTI_TABLE} WHERE id = 3`],
]);
// One statement with trailing semicolons, comments, or a `;` inside a
// string literal is still one statement.
const SINGLE_STATEMENT_FORMS = Object.freeze([
  ['trailing semicolon', `UPDATE ${MULTI_TABLE} SET label = 't' ` +
    'WHERE id = 1;', 'UPDATE 1'],
  ['empty statements after the semicolon', `UPDATE ${MULTI_TABLE} ` +
    'SET label = \'u\' WHERE id = 1; ;', 'UPDATE 1'],
  ['semicolon inside a literal and a trailing comment', 'UPDATE ' +
    `${MULTI_TABLE} SET label = 'x;y' WHERE id = 1; -- done; really`,
  'UPDATE 1'],
  ['bare semicolon', ';', EMPTY_QUERY_RESPONSE],
  ['comment only', '-- nothing to run', EMPTY_QUERY_RESPONSE],
]);

const TX_TABLE = 'tx_rows';

async function seedTable(t, client, table, ddl, seed) {
  const created = await observe(client, `CREATE TABLE ${table}${ddl}`);
  t.same(created.error, null, `${table}: created`);
  const seeded = await observe(client, `INSERT INTO ${table}${seed}`);
  t.same(seeded.error, null, `${table}: seeded`);
}

async function witnessStatementKindTags(t, client) {
  for (const [table, cases, finalRows] of STATEMENT_KIND_CASES) {
    await seedTable(t, client, table, KIND_TABLE_DDL, KIND_SEED);
    let last = null;
    for (const [label, text, values, tag] of cases) {
      last = await observe(client, text, values);
      t.same(last.error, null, `${label}: no ErrorResponse`);
      t.same(last.tags, [tag], `${label}: CommandComplete is exactly ${tag}`);
      t.same(last.rowCounts, [Number(tag.split(' ').at(-1))],
        `${label}: node-postgres rowCount matches the tag`);
    }
    t.same(last.rows?.[0]?.map((row) => ({...row, id: Number(row.id)})),
      finalRows, `${table}: the rows the commented writes changed`);
  }
}

async function readMultiRows(client) {
  const {rows} = await client.query(MULTI_SELECT);
  return rows.map((row) => ({id: Number(row.id), label: row.label}));
}

async function witnessMultiStatementRefusal(t, client, db, endpoint) {
  await seedTable(t, client, MULTI_TABLE, ' (id INTEGER PRIMARY KEY, ' +
    'label TEXT)', ' (id, label) VALUES (1, \'a\'), (2, \'b\'), ' +
    '(3, \'c\')');
  for (const [label, text] of MULTI_STATEMENT_REFUSALS) {
    const refused = await observe(client, text);
    t.same(refused.tags, [], `${label}: no CommandComplete`);
    t.equal(refused.error?.code, FEATURE_NOT_SUPPORTED,
      `${label}: refused whole with 0A000`);
    t.same(await readMultiRows(client), MULTI_SEED_ROWS,
      `${label}: neither statement applied`);
  }
  const facadeError = await db.query(
    `UPDATE ${MULTI_TABLE} SET label = 'f' WHERE id = 1; ` +
    `DELETE FROM ${MULTI_TABLE} WHERE id = 2`,
  ).then(() => null, (error) => error);
  t.equal(facadeError?.code, MULTIPLE_STATEMENTS_UNSUPPORTED,
    'facade: the multi-statement query is a typed refusal');
  t.same(await readMultiRows(client), MULTI_SEED_ROWS,
    'facade: neither statement applied');
  const psql = await runPsql(endpoint, [
    `UPDATE ${MULTI_TABLE} SET label = 'p' WHERE id = 1; ` +
      `DELETE FROM ${MULTI_TABLE} WHERE id = 2`,
  ]).then(() => null, (error) => error);
  t.match(String(psql?.stderr), /multiple statements/u,
    'psql -c "a; b": refused with the multi-statement error');
  t.same(await readMultiRows(client), MULTI_SEED_ROWS,
    'psql: neither statement applied');
  for (const [label, text, tag] of SINGLE_STATEMENT_FORMS) {
    const single = await observe(client, text);
    t.same(single.error, null, `${label}: no ErrorResponse`);
    t.same(single.tags, [tag], `${label}: answered ${tag}`);
  }
}

function runPsql(endpoint, commands) {
  const args = [
    '-h', endpoint.host, '-p', String(endpoint.port), '-U', CREDENTIALS.user,
    '-d', CREDENTIALS.database, '-At', '-v', 'ON_ERROR_STOP=1',
  ];
  for (const command of commands) args.push('-c', command);
  return execFileAsync(PSQL_COMMAND, args, {
    env: {...process.env, PGPASSWORD: CREDENTIALS.password},
  });
}

// psql's own CommandComplete rendering for DDL and DML, through the real
// engine (the compatibility test's fixture engine has no control plane, so
// CREATE TABLE is witnessed here).
async function witnessPsqlTags(t, endpoint) {
  const {stdout} = await runPsql(endpoint, [
    'CREATE TABLE psql_rows (id INTEGER PRIMARY KEY, name TEXT)',
    'INSERT INTO psql_rows (id, name) VALUES (1, \'alice\')',
    'SELECT id, name FROM psql_rows ORDER BY id',
  ]);
  t.match(stdout, /^CREATE TABLE$/mu, 'psql: CREATE TABLE');
  t.match(stdout, /^INSERT 0 1$/mu, 'psql: INSERT 0 1');
  t.match(stdout, /^1\|alice$/mu, 'psql: the inserted row');
}

async function witnessTransactionRecovery(t, client) {
  await seedTable(t, client, TX_TABLE, ' (id INTEGER PRIMARY KEY, ' +
    'label TEXT)', ' (id, label) VALUES (1, \'a\')');
  const txSelect = `SELECT id FROM ${TX_TABLE} ORDER BY id`;
  for (const text of [
    `BEGIN; INSERT INTO ${TX_TABLE} (id, label) VALUES (2, 'b'); COMMIT`,
    `BEGIN ; DELETE FROM ${TX_TABLE}`,
  ]) {
    const refused = await observe(client, text);
    t.equal(refused.error?.code, FEATURE_NOT_SUPPORTED,
      `${JSON.stringify(text)}: refused whole with 0A000`);
    t.equal(refused.status, IDLE,
      `${JSON.stringify(text)}: the session is idle`);
    const after = await observe(client, txSelect);
    t.same(after.error, null, `${JSON.stringify(text)}: the session is usable`);
    t.same(after.tags, ['SELECT 1'],
      `${JSON.stringify(text)}: nothing applied`);
  }
  const begun = await observe(client, 'BEGIN;');
  t.same(begun.tags, ['BEGIN'], 'BEGIN; with a trailing semicolon begins');
  t.same((await observe(client, `INSERT INTO ${TX_TABLE} (id, label) ` +
    'VALUES (3, \'c\')')).tags, ['INSERT 0 1'], 'insert inside the block');
  const failing = await observe(client, 'SELECT id FROM tx_missing_table');
  t.not(failing.error, null, 'a failing statement inside the block');
  t.equal(failing.status, FAILED, 'the block is failed');
  const committed = await observe(client, 'COMMIT');
  t.same(committed.error, null, 'COMMIT in a failed block: no ErrorResponse');
  t.same(committed.tags, ['ROLLBACK'],
    'COMMIT in a failed block: answered ROLLBACK (PostgreSQL)');
  t.equal(committed.status, IDLE,
    'COMMIT in a failed block: the block ended');
  const after = await observe(client, txSelect);
  t.same(after.tags, ['SELECT 1'],
    'COMMIT in a failed block: the block\'s insert was rolled back');
}

// Pace between real-path statements on one table (a known separate defect
// breaks writes after an automatic load split at this base).
const EXPIRY_PACE_MS = 150;
const FORMS_TABLE = 'forms_rows';
const FORMS_SEED = Object.freeze([{id: 1, label: 'a'}, {id: 2, label: 'b'}]);
const SYNTAX_ERROR = '42601';
// Statement forms the engine cannot execute as written: refused with the
// stated SQLSTATE and NOTHING applied (never run as a different statement).
const REFUSED_FORMS = Object.freeze([
  ['INSERT ... SELECT', `INSERT INTO ${FORMS_TABLE} (id, label) ` +
    `SELECT id + 10, label FROM ${FORMS_TABLE}`, FEATURE_NOT_SUPPORTED,
  /INSERT \.\.\. SELECT is not supported/u],
  ['INSERT ... RETURNING', `INSERT INTO ${FORMS_TABLE} (id, label) ` +
    'VALUES (7, \'h\') RETURNING id', FEATURE_NOT_SUPPORTED,
  /RETURNING is not supported/u],
  ['UPDATE ... RETURNING', `UPDATE ${FORMS_TABLE} SET label = 'r' ` +
    'WHERE id = 1 RETURNING id', FEATURE_NOT_SUPPORTED,
  /RETURNING is not supported/u],
  ['DELETE ... RETURNING expression', `DELETE FROM ${FORMS_TABLE} ` +
    'WHERE id = 2 RETURNING id + 1', FEATURE_NOT_SUPPORTED,
  /RETURNING is not supported/u],
  ['BEGIN followed by a statement without `;`', 'BEGIN\nINSERT INTO ' +
    `${FORMS_TABLE} (id, label) VALUES (8, 'i')`, SYNTAX_ERROR,
  /transaction-control statement must be the whole statement/u],
  ['COMMIT followed by a statement without `;`', 'COMMIT DELETE FROM ' +
    FORMS_TABLE, SYNTAX_ERROR,
  /transaction-control statement must be the whole statement/u],
]);

async function readFormsRows(client) {
  const {rows} = await client.query(
    `SELECT id, label FROM ${FORMS_TABLE} ORDER BY id`);
  return rows.map((row) => ({id: Number(row.id), label: row.label}));
}

async function witnessRefusedForms(t, client) {
  await seedTable(t, client, FORMS_TABLE, ' (id INTEGER PRIMARY KEY, ' +
    'label TEXT)', ' (id, label) VALUES (1, \'a\'), (2, \'b\')');
  for (const [label, text, sqlState, message] of REFUSED_FORMS) {
    for (const values of [undefined, []]) {
      const mode = values ? 'extended' : 'simple';
      const refused = await observe(client, text, values);
      t.same(refused.tags, [], `${mode} ${label}: no CommandComplete`);
      t.equal(refused.error?.code, sqlState,
        `${mode} ${label}: refused ${sqlState}`);
      t.match(refused.error?.message, message,
        `${mode} ${label}: the refusal names the form`);
      t.equal(refused.status, IDLE, `${mode} ${label}: the session is idle`);
      t.same(await readFormsRows(client), FORMS_SEED,
        `${mode} ${label}: nothing applied`);
      await managedSleep(t, EXPIRY_PACE_MS);
    }
  }
}

// The standard spellings drivers and ORMs send are the transaction
// statements they name: they open, commit and roll back a block, and end a
// failed block.
const SPELLING_BLOCKS = Object.freeze([
  ['START TRANSACTION', 'COMMIT WORK', 'COMMIT', [3]],
  ['BEGIN WORK', 'END', 'COMMIT', [3, 4]],
  ['BEGIN TRANSACTION', 'ROLLBACK WORK', 'ROLLBACK', [3, 4]],
  ['START TRANSACTION READ WRITE', 'ABORT', 'ROLLBACK', [3, 4]],
  ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'COMMIT TRANSACTION', 'COMMIT',
    [3, 4, 5]],
]);
const FAILED_BLOCK_ENDS = Object.freeze([
  'ROLLBACK WORK', 'ROLLBACK TRANSACTION', 'ABORT', 'END', 'COMMIT WORK',
]);

async function witnessTransactionSpellings(t, client) {
  const ids = async () => (await readFormsRows(client)).map((row) => row.id)
    .filter((id) => id >= 3);
  let nextId = 3;
  for (const [begin, end, endTag, expectedIds] of SPELLING_BLOCKS) {
    const begun = await observe(client, begin);
    t.same(begun.tags, ['BEGIN'], `${begin}: answered BEGIN`);
    t.equal(begun.status, 'T', `${begin}: in a transaction block`);
    t.same((await observe(client, `INSERT INTO ${FORMS_TABLE} (id, label) ` +
      `VALUES (${nextId}, 's')`)).tags, ['INSERT 0 1'],
    `${begin}: insert inside the block`);
    nextId += 1;
    const ended = await observe(client, end);
    t.same(ended.tags, [endTag], `${end}: answered ${endTag}`);
    t.equal(ended.status, IDLE, `${end}: the block ended`);
    t.same(await ids(), expectedIds, `${begin} ... ${end}: the rows`);
    if (endTag === 'ROLLBACK') nextId -= 1;
    await managedSleep(t, EXPIRY_PACE_MS);
  }
  for (const end of FAILED_BLOCK_ENDS) {
    t.same((await observe(client, 'BEGIN')).tags, ['BEGIN'], 'BEGIN');
    await observe(client, `INSERT INTO ${FORMS_TABLE} (id, label) ` +
      'VALUES (90, \'f\')');
    const failing = await observe(client, 'SELECT id FROM no_such_table');
    t.equal(failing.status, FAILED, `${end}: the block is failed`);
    const ended = await observe(client, end);
    t.same(ended.error, null, `${end} in a failed block: no ErrorResponse`);
    t.same(ended.tags, ['ROLLBACK'],
      `${end} in a failed block: answered ROLLBACK`);
    t.equal(ended.status, IDLE, `${end} in a failed block: the block ended`);
    t.notOk((await ids()).includes(90),
      `${end} in a failed block: the block's insert rolled back`);
    await managedSleep(t, EXPIRY_PACE_MS);
  }
}

// The engine's transaction budget, shortened for the expiry witness (the
// production budget is 60 s): the coordinator's recovery sweep rolls back
// and drops a transaction whose budget is spent.
const EXPIRY_TABLE = 'expiry_rows';
const EXPIRY_BUDGET_MS = 1_500;
const TRANSACTION_TIMEOUT = '25P04';
const IN_FAILED_TRANSACTION = '25P02';
const NO_ACTIVE_SQL_TRANSACTION = '25P01';
const WARNING = 'WARNING';

/**
 * BEGIN on the client, run one write inside the block, then wait until the
 * engine's recovery sweep has dropped the session's transaction (its budget
 * is spent). The client is not told: that is the condition under test.
 * @param {object} t - Tap test.
 * @param {object} context - {client, engine}.
 * @param {string} insert - The write run inside the block (it answers).
 * @param {unknown[]} [values] - Extended-protocol parameters.
 * @return {Promise<void>}
 */
async function beginWriteAndExpire(t, {client, engine}, insert, values) {
  const transactions = engine.transactionCoordinator.transactionsBySession;
  const before = new Set(transactions.keys());
  t.same((await observe(client, 'BEGIN')).tags, ['BEGIN'], 'BEGIN');
  const [sessionKey] = [...transactions.keys()].filter((key) =>
    !before.has(key));
  t.ok(sessionKey, 'the BEGIN opened one engine transaction');
  await managedSleep(t, EXPIRY_PACE_MS);
  t.same((await observe(client, insert, values)).tags, ['INSERT 0 1'],
    'the write inside the block answered');
  const deadline = Date.now() + WAIT_MS;
  while (engine.hasActiveTransaction(sessionKey) && Date.now() < deadline) {
    await managedSleep(t, POLL_MS);
  }
  t.notOk(engine.hasActiveTransaction(sessionKey),
    'the engine dropped the transaction once its budget was spent');
}

async function expiryRowIds(client) {
  const {rows} = await client.query(`SELECT id FROM ${EXPIRY_TABLE}`);
  return rows.map((row) => Number(row.id)).sort((a, b) => a - b);
}

function assertNoTransactionWarning(t, observation, tag, label) {
  t.same(observation.error, null, `${label}: no ErrorResponse`);
  t.same(observation.tags, [tag], `${label}: answered ${tag}`);
  t.equal(observation.status, IDLE, `${label}: the session is idle`);
  t.same(observation.notices.map((notice) => [notice.severity, notice.code]),
    [[WARNING, NO_ACTIVE_SQL_TRANSACTION]],
    `${label}: a WARNING notice says no transaction is in progress`);
}

async function witnessCommitAfterExpiry(t, context, values) {
  const {client} = context;
  const label = values === undefined ? 'simple' : 'extended';
  await beginWriteAndExpire(t, context, `INSERT INTO ${EXPIRY_TABLE} ` +
    '(id, label) VALUES (1, \'a\')');
  const committed = await observe(client, 'COMMIT', values);
  t.equal(committed.error?.code, TRANSACTION_TIMEOUT,
    `${label} COMMIT after expiry: 25P04 transaction_timeout`);
  t.match(committed.error?.message, /no changes were committed/u,
    `${label} COMMIT after expiry: the error says nothing was committed`);
  t.match(committed.error?.detail, /NO_TRANSACTION/u,
    `${label} COMMIT after expiry: the engine's typed code is the detail`);
  t.equal(committed.status, IDLE,
    `${label} COMMIT after expiry: the block is over (idle)`);
  assertNoTransactionWarning(t, await observe(client, 'ROLLBACK', values),
    'ROLLBACK', `${label} ROLLBACK after the failed COMMIT`);
  t.same((await observe(client, 'SELECT 1')).tags, ['SELECT 1'],
    `${label}: the session is usable`);
  t.same(await expiryRowIds(client), [],
    `${label}: the expired block's insert is absent`);
}

async function witnessStatementAfterExpiry(t, context, values) {
  const {client} = context;
  const label = values === undefined ? 'simple' : 'extended';
  const insert = values === undefined ?
    `INSERT INTO ${EXPIRY_TABLE} (id, label) VALUES (2, 'b')` :
    `INSERT INTO ${EXPIRY_TABLE} (id, label) VALUES ($1, $2)`;
  await beginWriteAndExpire(t, context, insert, values && [2, 'b']);
  const late = await observe(client, values === undefined ?
    `INSERT INTO ${EXPIRY_TABLE} (id, label) VALUES (3, 'c')` : insert,
  values && [3, 'c']);
  t.comment(`${label} statement after expiry: ${JSON.stringify(late)}`);
  t.equal(late.error?.code, TRANSACTION_TIMEOUT,
    `${label} statement after expiry: refused 25P04 (never autocommitted)`);
  t.equal(late.status, FAILED,
    `${label} statement after expiry: the block is failed`);
  const ignored = await observe(client, 'SELECT 1');
  t.equal(ignored.error?.code, IN_FAILED_TRANSACTION,
    `${label}: later statements are ignored until the block ends`);
  const begun = await observe(client, 'BEGIN');
  t.equal(begun.error?.code, IN_FAILED_TRANSACTION,
    `${label}: BEGIN inside the failed block is refused`);
  const ended = await observe(client, 'COMMIT', values && []);
  t.same(ended.error, null, `${label} COMMIT ending the failed block`);
  t.same(ended.tags, ['ROLLBACK'],
    `${label} COMMIT ending the failed block: answered ROLLBACK`);
  t.equal(ended.status, IDLE, `${label}: the block ended`);
  t.same(await expiryRowIds(client), [],
    `${label}: neither the expired insert nor the late one is present`);
}

/**
 * The session follows the engine's transaction truth: a transaction the
 * engine dropped (its budget spent) never wedges the session, a COMMIT of
 * it says plainly that nothing was committed, and no later statement of the
 * block runs outside it.
 * @param {object} t - Tap test.
 * @param {object} context - {client, engine}.
 * @return {Promise<void>}
 */
async function witnessTransactionExpiry(t, context) {
  const {client, engine} = context;
  await seedTable(t, client, EXPIRY_TABLE, ' (id INTEGER PRIMARY KEY, ' +
    'label TEXT)', ' (id, label) VALUES (100, \'seed\')');
  t.same((await observe(client, `DELETE FROM ${EXPIRY_TABLE}`)).tags,
    ['DELETE 1'], 'expiry table emptied');
  for (const [text, tag] of [['ROLLBACK', 'ROLLBACK'], ['COMMIT', 'COMMIT']]) {
    assertNoTransactionWarning(t, await observe(client, text), tag,
      `${text} while idle`);
    assertNoTransactionWarning(t, await observe(client, text, []), tag,
      `extended ${text} while idle`);
  }
  const coordinator = engine.transactionCoordinator;
  const configuredBudgetMs = coordinator.transactionBudgetMs;
  coordinator.transactionBudgetMs = EXPIRY_BUDGET_MS;
  try {
    await witnessCommitAfterExpiry(t, context);
    await witnessCommitAfterExpiry(t, context, []);
    await witnessStatementAfterExpiry(t, context);
    await witnessStatementAfterExpiry(t, context, []);
  } finally {
    coordinator.transactionBudgetMs = configuredBudgetMs;
  }
}

const COUNTED_COMMANDS = new Set(['INSERT', 'UPDATE', 'DELETE', 'SELECT']);
const FINAL_ROWS = Object.freeze([
  {id: '1', label: 'u'},
  {id: '4', label: 'd'},
  {id: '5', label: 'z'},
  {id: '6', label: 'g'},
]);

test('PG-wire command tags from the real engine through a real client',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    refuseUnderProbe(PROBE_GUARD_SUBJECT);
    reportOpenHandlesOnTeardown(t);
    const {client, db, endpoint, engine} = await startRuntime(t);
    await witnessTransactionExpiry(t, {client, engine});
    let last = null;
    for (const [label, text, values, tag] of TAG_CASES) {
      last = await observe(client, text, values);
      t.same(last.error, null, `${label}: no ErrorResponse`);
      t.same(last.tags, [tag], `${label}: CommandComplete is exactly ${tag}`);
      const [command] = tag.split(' ');
      if (COUNTED_COMMANDS.has(command)) {
        t.same(last.rowCounts, [Number(tag.split(' ').at(-1))],
          `${label}: node-postgres rowCount matches the tag`);
      }
    }
    // Oracle for the counts above: the rows the statements left behind.
    t.same(last.rows[0], FINAL_ROWS, 'the table holds exactly the rows ' +
      'the counted statements changed');

    await witnessStatementKindTags(t, client);
    await witnessMultiStatementRefusal(t, client, db, endpoint);
    await witnessTransactionRecovery(t, client);
    await witnessRefusedForms(t, client);
    await witnessTransactionSpellings(t, client);
    await witnessPsqlTags(t, endpoint);
    t.end();
  });
