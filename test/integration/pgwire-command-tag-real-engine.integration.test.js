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

import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

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

/**
 * Run one statement and capture what the client received: every
 * CommandComplete tag text, node-postgres's command/rowCount, the rows, or
 * the ErrorResponse code and message.
 *
 * @param {object} client - pg.Client.
 * @param {string} text - SQL.
 * @param {unknown[]} [values] - Parameters (forces the extended protocol).
 * @return {Promise<object>} Observation.
 */
async function observe(client, text, values) {
  const tags = [];
  const onComplete = (message) => tags.push(message.text);
  client.connection.on('commandComplete', onComplete);
  try {
    const query = values === undefined ?
      {text} :
      {text, values, queryMode: EXTENDED};
    const result = await client.query(query);
    const results = Array.isArray(result) ? result : [result];
    return {
      tags,
      rowCounts: results.map((entry) => entry.rowCount),
      commands: results.map((entry) => entry.command),
      rows: results.map((entry) => entry.rows),
      error: null,
    };
  } catch (error) {
    return {tags, error: {code: error.code, message: error.message}};
  } finally {
    client.connection.removeListener('commandComplete', onComplete);
  }
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
  return {client};
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
    const {client} = await startRuntime(t);
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
    t.end();
  });
