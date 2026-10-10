import {after, before, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import pg from 'pg';
import {PostgresWireRuntimeModule} from
  '../../src/runtime/pgwire-runtime-module.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {isSqlRequest} from '../../src/query/sql-request.js';
import {createSqlitePartitionSqlEngine} from
  '../helpers/sqlite-partition-sql-engine.js';

// Real clients (node-postgres, psql) -> the real PG-wire listener -> the real
// SQL engine (SqlCore: parse, route, the write coordinator and its result
// aggregation). Only the partition hop is a fixture
// (test/helpers/sqlite-partition-sql-engine.js), so every command tag here is
// derived from the result shape the engine really produces. The earlier
// stub executor answered DML with `changes`/`rowCount` itself and so hid
// that the wire mapper never read the engine's `affectedRows` (every DML
// reported zero rows).

const execFileAsync = promisify(execFile);
const COMPAT_HOST = '127.0.0.1';
const COMPAT_DATABASE = 'pgwire_compat';
const COMPAT_USER = 'pgwire_test';
const PSQL_COMMAND = 'psql';
const TABLE = 'client_rows';
const SPLIT_KEY = 100;
const PARTITIONS = Object.freeze([
  {partition_id: 'compat-p1', partition_key_start: null,
    partition_key_end: SPLIT_KEY},
  {partition_id: 'compat-p2', partition_key_start: SPLIT_KEY,
    partition_key_end: null},
]);
const silentLogger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function captureCommandTags(client) {
  const tags = [];
  client.connection.on('commandComplete', (message) => tags.push(message.text));
  return tags;
}

describe('pgwire real-client compatibility', () => {
  const {engine, close} = createSqlitePartitionSqlEngine({
    table: {
      name: TABLE,
      primaryKey: 'id',
      ddl: `CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY, name TEXT)`,
    },
    partitions: PARTITIONS,
  });
  const observedRequests = [];
  const runtime = new PostgresWireRuntimeModule({logger: silentLogger});
  const context = {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: COMPAT_HOST,
    port: 0,
    sqlRequestExecutor: async (request) => {
      assert.equal(isSqlRequest(request), true);
      observedRequests.push(request);
      return engine.executeRequest(request);
    },
  };
  let port;

  before(async () => {
    const prepared = await runtime.prepare({
      serviceId: META_SERVICE_ID.POSTGRES_WIRE,
      runtimeConfig: JSON.stringify({
        host: COMPAT_HOST,
        authMode: 'trust',
        tlsMode: 'disable',
      }),
    });
    assert.equal(prepared.status, 'ready');
    const started = await runtime.start(context);
    assert.equal(started.status, 'running');
    port = started.endpointIntent.port;
  });

  after(async () => {
    await runtime.stop(context);
    close();
  });

  it('executes simple and extended queries through node-postgres', async () => {
    const client = new pg.Client({
      host: COMPAT_HOST,
      port,
      database: COMPAT_DATABASE,
      user: COMPAT_USER,
      ssl: false,
    });
    await client.connect();
    const tags = captureCommandTags(client);
    try {
      const inserted = await client.query(
        `INSERT INTO ${TABLE} (id, name) VALUES ` +
        '(1, \'a\'), (2, \'b\'), (101, \'c\')');
      assert.equal(inserted.rowCount, 3);

      const bound = await client.query({
        text: `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
        values: [102, 'bound-value'],
        queryMode: 'extended',
      });
      assert.equal(bound.rowCount, 1);

      const parameterized = await client.query(
        `SELECT name FROM ${TABLE} WHERE id = $1`,
        [102],
      );
      assert.deepEqual(parameterized.rows, [{name: 'bound-value'}]);

      // Spans both partitions: the engine's aggregation sums them.
      const updated = await client.query(
        `UPDATE ${TABLE} SET name = 'z' WHERE id >= 2`);
      assert.equal(updated.rowCount, 3);
      const none = await client.query(
        `UPDATE ${TABLE} SET name = 'y' WHERE id = 999`);
      assert.equal(none.rowCount, 0);
      const deleted = await client.query(
        `DELETE FROM ${TABLE} WHERE name = 'z'`);
      assert.equal(deleted.rowCount, 3);
    } finally {
      await client.end();
    }
    assert.deepEqual(tags, [
      'INSERT 0 3',
      'INSERT 0 1',
      'SELECT 1',
      'UPDATE 3',
      'UPDATE 0',
      'DELETE 3',
    ]);
    assert.ok(observedRequests.length >= tags.length);
    assert.equal(observedRequests.at(-1).dialect, 'postgresql');
  });

  it('executes insert, update, select and delete through psql', async () => {
    const {stdout} = await execFileAsync(PSQL_COMMAND, [
      '-h', COMPAT_HOST,
      '-p', String(port),
      '-U', COMPAT_USER,
      '-d', COMPAT_DATABASE,
      '-At',
      '-v', 'ON_ERROR_STOP=1',
      '-c', `INSERT INTO ${TABLE} (id, name) VALUES (10, 'alice')`,
      '-c', `UPDATE ${TABLE} SET name = 'alicia' WHERE id = 10`,
      '-c', `SELECT id, name FROM ${TABLE} WHERE id = 10`,
      '-c', `DELETE FROM ${TABLE} WHERE id = 10`,
    ]);
    assert.match(stdout, /^INSERT 0 1$/mu);
    assert.match(stdout, /^UPDATE 1$/mu);
    assert.match(stdout, /^10\|alicia$/mu);
    assert.match(stdout, /^DELETE 1$/mu);
  });
});
