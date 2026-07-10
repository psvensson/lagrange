import {after, before, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import Database from 'better-sqlite3';
import pg from 'pg';
import {PostgresWireRuntimeModule} from
  '../../src/runtime/pgwire-runtime-module.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {isSqlRequest} from '../../src/query/sql-request.js';

const execFileAsync = promisify(execFile);
const COMPAT_HOST = '127.0.0.1';
const COMPAT_DATABASE = 'pgwire_compat';
const COMPAT_USER = 'pgwire_test';
const PSQL_COMMAND = 'psql';
const SQL_PARAMETER_PATTERN = /\$\d+/gu;
const SQL_SELECT_PATTERN = /^\s*(SELECT|WITH|PRAGMA)\b/iu;
const silentLogger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function createSqlRequestExecutor(database, observedRequests) {
  return async (request) => {
    assert.equal(isSqlRequest(request), true);
    observedRequests.push(request);
    const statement = request.statement.replace(SQL_PARAMETER_PATTERN, '?');
    const prepared = database.prepare(statement);
    if (SQL_SELECT_PATTERN.test(statement)) {
      return {
        success: true,
        rows: prepared.all(...request.parameters),
        columns: prepared.columns().map((column) => column.name),
      };
    }
    const result = prepared.run(...request.parameters);
    return {
      success: true,
      rows: [],
      changes: result.changes,
      rowCount: result.changes,
    };
  };
}

describe('pgwire real-client compatibility', () => {
  const database = new Database(':memory:');
  const observedRequests = [];
  const runtime = new PostgresWireRuntimeModule({logger: silentLogger});
  const context = {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: COMPAT_HOST,
    port: 0,
    sqlRequestExecutor: createSqlRequestExecutor(
      database,
      observedRequests,
    ),
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
    database.close();
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
    try {
      const simple = await client.query('SELECT \'ready\' AS status');
      assert.deepEqual(simple.rows, [{status: 'ready'}]);

      const parameterized = await client.query(
        'SELECT $1 AS value',
        ['bound-value'],
      );
      assert.deepEqual(parameterized.rows, [{value: 'bound-value'}]);
    } finally {
      await client.end();
    }
    assert.ok(observedRequests.length >= 2);
    assert.equal(observedRequests.at(-1).dialect, 'postgresql');
  });

  it('executes create, insert, and select through psql', async () => {
    const {stdout} = await execFileAsync(PSQL_COMMAND, [
      '-h', COMPAT_HOST,
      '-p', String(port),
      '-U', COMPAT_USER,
      '-d', COMPAT_DATABASE,
      '-At',
      '-v', 'ON_ERROR_STOP=1',
      '-c', 'CREATE TABLE client_rows (id INTEGER PRIMARY KEY, name TEXT)',
      '-c', 'INSERT INTO client_rows VALUES (1, \'alice\')',
      '-c', 'SELECT id, name FROM client_rows ORDER BY id',
    ]);
    assert.match(stdout, /CREATE TABLE/u);
    assert.match(stdout, /INSERT 0 1/u);
    assert.match(stdout, /1\|alice/u);
  });
});
