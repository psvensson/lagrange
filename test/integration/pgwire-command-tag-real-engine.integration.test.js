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
  const onComplete = (message) => tags.push(message.text);
  const onEmpty = () => tags.push(EMPTY_QUERY_RESPONSE);
  const ready = new Promise((resolve) => {
    client.connection.once('readyForQuery', (message) => {
      resolve(message.status);
    });
  });
  client.connection.on('commandComplete', onComplete);
  client.connection.on('emptyQuery', onEmpty);
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
    observation = {tags, error: {code: error.code, message: error.message}};
  } finally {
    client.connection.removeListener('commandComplete', onComplete);
    client.connection.removeListener('emptyQuery', onEmpty);
  }
  return {...observation, status: await ready};
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
  return {client, db, endpoint};
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
    const {client, db, endpoint} = await startRuntime(t);
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

    // RECORD ONLY (finding, not a pass condition): INSERT ... RETURNING.
    const returning = await observe(client, `INSERT INTO ${TABLE} ` +
      '(id, n, label) VALUES (7, 7, \'h\') RETURNING id');
    t.comment(`RETURNING over the wire: ${JSON.stringify(returning)}`);

    await witnessStatementKindTags(t, client);
    await witnessMultiStatementRefusal(t, client, db, endpoint);
    await witnessTransactionRecovery(t, client);
    await witnessPsqlTags(t, endpoint);
    t.end();
  });
