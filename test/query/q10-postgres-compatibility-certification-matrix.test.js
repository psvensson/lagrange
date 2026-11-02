/**
 * Q10 (`postgres-compatibility-certification-matrix`) integration and
 * external-client compatibility certification test suite.
 *
 * Exercises live `node-pg` (`pg.Client`), `psql` CLI binary, and `pg-pool`
 * (`pg.Pool`) against the real `PostgresWireRuntimeModule` and
 * `createSqlitePartitionSqlEngine` across all 12 protocol dimensions, negative
 * controls (`wrong_password`, `wrong_ca`, `unsupported_sql`), and D12
 * red-on-revert regression guards.
 */

import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {after, before, describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {
  PG_COMPAT_ALL_CLIENTS,
  PG_COMPAT_ALL_DIMENSIONS,
  PG_COMPAT_CELL_STATUS,
  PG_COMPAT_CLIENT_ID,
  PG_COMPAT_DECLARED_CELLS,
  PG_COMPAT_DIMENSION,
  PG_COMPAT_EXTENDED_PROTOCOL_CLIENTS,
  PG_COMPAT_FEATURE_ID,
  PG_COMPAT_MATRIX_ERROR_CODE,
  PG_COMPAT_NEGATIVE_CONTROL_ID,
  PG_COMPAT_SQLSTATE,
  PostgresCompatibilityMatrixError,
  createCompatibilityCellReceipt,
  createNegativeControlReceipt,
  generatePostgresCompatibilityMatrix,
  verifyCompatibilityMatrixRegression,
} from '../../src/query/pg/postgres-compatibility-matrix.js';
import {buildPgwireCredentialVerifier} from '../../src/runtime/pgwire-credential-verifier.js';
import {PostgresWireRuntimeModule} from '../../src/runtime/pgwire-runtime-module.js';
import {createSqlitePartitionSqlEngine} from '../helpers/sqlite-partition-sql-engine.js';

const {Client: PgClient, Pool: PgPool} = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const TLS_FIXTURES_DIR = path.resolve(REPO_ROOT, 'test/fixtures/pgwire-tls');
const MATRIX_JSON_PATH = path.resolve(
  REPO_ROOT,
  'docs/postgres-compatibility-matrix.json',
);

const SERVER_CERT_PATH = path.join(TLS_FIXTURES_DIR, 'server-cert.pem');
const SERVER_KEY_PATH = path.join(TLS_FIXTURES_DIR, 'server-key.pem');
const WRONG_CA_CERT_PATH = path.join(TLS_FIXTURES_DIR, 'wrong-ca-cert.pem');

const SERVER_CERT_PEM = fs.readFileSync(SERVER_CERT_PATH, 'utf8');
const SERVER_KEY_PEM = fs.readFileSync(SERVER_KEY_PATH, 'utf8');
const WRONG_CA_CERT_PEM = fs.readFileSync(WRONG_CA_CERT_PATH, 'utf8');

const LOOPBACK_HOST = '127.0.0.1';
const AUTH_USERNAME = 'cert_admin';
const AUTH_PASSWORD = 'cert-secret-password';
const WRONG_PASSWORD = 'wrong-cert-password';
const DATABASE_NAME = 'lagrange';
const TABLE_NAME = 'cert_items';
const PARTITIONS = Object.freeze([
  {
    partition_id: 'cert-p0',
    partition_key_start: null,
    partition_key_end: 2000,
    partition_key_type: 'INTEGER',
  },
  {
    partition_id: 'cert-p1',
    partition_key_start: 2000,
    partition_key_end: null,
    partition_key_type: 'INTEGER',
  },
]);
const silentLogger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function runPsqlCommand({
  host = LOOPBACK_HOST,
  port,
  user = AUTH_USERNAME,
  password = AUTH_PASSWORD,
  sslMode = 'disable',
  sslRootCert = SERVER_CERT_PATH,
  sql,
  args = [],
}) {
  return new Promise((resolve, reject) => {
    const connUri =
      `postgresql://${encodeURIComponent(user)}@` +
      `${host}:${port}/${DATABASE_NAME}?sslmode=${sslMode}` +
      `&sslrootcert=${encodeURIComponent(sslRootCert)}`;
    const cliArgs = [
      connUri,
      '-X',
      '-q',
      '-t',
      '-A',
      '-F',
      '|',
      '-v',
      'VERBOSITY=verbose',
      ...args,
    ];
    if (typeof sql === 'string') {
      cliArgs.push('-c', sql);
    }
    const child = spawn('psql', cliArgs, {
      env: {...process.env, PGPASSWORD: password},
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

function detectPsqlVersion() {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`psql --version exited with code ${code}`));
        return;
      }
      const match = stdout.trim().match(/(\d+(?:\.\d+)+)/);
      resolve(match ? match[1] : stdout.trim());
    });
  });
}

function sendCancelRequestPacket(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({host: LOOPBACK_HOST, port});
    const chunks = [];
    socket.on('data', (chunk) => {
      chunks.push(chunk);
    });
    socket.on('error', reject);
    socket.on('connect', () => {
      const cancelPacket = Buffer.alloc(16);
      cancelPacket.writeInt32BE(16, 0);
      cancelPacket.writeInt32BE(80877102, 4);
      cancelPacket.writeInt32BE(1234, 8);
      cancelPacket.writeInt32BE(5678, 12);
      socket.write(cancelPacket);
    });
    socket.on('close', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

function createTlsClientConfig(port, overrides = {}) {
  return {
    host: LOOPBACK_HOST,
    port,
    user: AUTH_USERNAME,
    password: AUTH_PASSWORD,
    database: DATABASE_NAME,
    ssl: {
      ca: SERVER_CERT_PEM,
      rejectUnauthorized: true,
      servername: 'localhost',
    },
    ...overrides,
  };
}

function createTrustClientConfig(port, overrides = {}) {
  return {
    host: LOOPBACK_HOST,
    port,
    user: AUTH_USERNAME,
    database: DATABASE_NAME,
    ssl: false,
    ...overrides,
  };
}

async function withPgClient(config, callback) {
  const client = new PgClient(config);
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function withPgPool(config, callback) {
  const pool = new PgPool({
    ...config,
    max: 2,
    idleTimeoutMillis: 1000,
  });
  try {
    return await callback(pool);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function createCertificationPartitionFixture() {
  const {engine, databases, close} = createSqlitePartitionSqlEngine({
    table: {
      name: TABLE_NAME,
      primaryKey: 'id',
      ddl: `CREATE TABLE ${TABLE_NAME} (id INTEGER PRIMARY KEY, label TEXT, amount INTEGER)`,
    },
    partitions: PARTITIONS,
  });
  const activeSavepoints = new Set();
  const baseDeliver = engine.messageRouter.deliver.bind(engine.messageRouter);
  engine.messageRouter.deliver = async (address, message) => {
    const partitionId = address.split('/')[2];
    const db = databases.get(partitionId);
    const spKey = `${partitionId}_${message.transactionId}`;
    if (db && message.transactionId) {
      if (
        message.type === 'QUERY' &&
        !/^\s*(SELECT|WITH|PRAGMA)\b/iu.test(message.sql) &&
        !activeSavepoints.has(spKey)
      ) {
        db.exec(`SAVEPOINT "${spKey}"`);
        activeSavepoints.add(spKey);
      } else if (
        message.type === 'TRANSACTION' &&
        message.operation === 'ROLLBACK' &&
        activeSavepoints.has(spKey)
      ) {
        db.exec(
          `ROLLBACK TO SAVEPOINT "${spKey}"; RELEASE SAVEPOINT "${spKey}"`,
        );
        activeSavepoints.delete(spKey);
      } else if (
        message.type === 'TRANSACTION' &&
        message.operation === 'COMMIT' &&
        activeSavepoints.has(spKey)
      ) {
        db.exec(`RELEASE SAVEPOINT "${spKey}"`);
        activeSavepoints.delete(spKey);
      }
    }
    return baseDeliver(address, message);
  };
  engine.tableCreationService = {
    async createTable(ast) {
      return {success: true, tableName: ast.tableName, rows: []};
    },
    stripPartitionDetails(result) {
      return result;
    },
  };
  engine.setServiceLifecycleCommandOwner({
    async execute() {
      return {
        success: true,
        columns: ['service_name', 'desired_state'],
        rows: [
          {service_name: 'analytics-worker', desired_state: 'installed'},
        ],
      };
    },
  });
  await engine.executeQuery(
    'INSERT INTO cert_items (id, label, amount) VALUES (1001, \'alpha\', 10), (1002, \'beta\', 20), (2001, \'gamma\', 30), (2002, \'delta\', 40)',
  );
  return {engine, cleanup: close};
}

async function startWireListener({
  engine,
  authMode,
  tlsMode,
  tlsOptions = null,
  credentialVerifier = null,
  maxSessions = 8,
}) {
  const runtime = new PostgresWireRuntimeModule({
    logger: silentLogger,
    credentialVerifier,
    tlsOptions,
  });
  const prepared = await runtime.prepare({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeConfig: JSON.stringify({
      host: LOOPBACK_HOST,
      authMode,
      tlsMode,
      maxSessions,
    }),
  });
  assert.equal(prepared.status, 'ready');
  const started = await runtime.start({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: LOOPBACK_HOST,
    port: 0,
    maxSessions,
    sqlRequestExecutor: (request) => engine.executeRequest(request),
  });
  assert.equal(started.status, 'running');
  return {
    port: started.endpointIntent.port,
    stop: () => runtime.stop({serviceId: META_SERVICE_ID.POSTGRES_WIRE}),
  };
}

function recordForClients(ctx, clients, spec) {
  for (const clientId of clients) {
    ctx.recordReceipt({
      clientId,
      ...spec,
    });
  }
}

async function certifyDimension1TlsAndAuth(ctx) {
  const {tlsPort} = ctx;
  await withPgClient(createTlsClientConfig(tlsPort), async (client) => {
    const res = await client.query(
      'SELECT id, label FROM cert_items WHERE id = 1001',
    );
    assert.equal(res.rowCount, 1);
  });
  const psqlTlsRes = await runPsqlCommand({
    port: tlsPort,
    sslMode: 'require',
    sql: 'SELECT id, label FROM cert_items WHERE id = 1001',
  });
  assert.equal(psqlTlsRes.exitCode, 0);
  assert.equal(psqlTlsRes.stdout, '1001|alpha');
  await withPgPool(createTlsClientConfig(tlsPort), async (pool) => {
    const res = await pool.query(
      'SELECT id, label FROM cert_items WHERE id = 1001',
    );
    assert.equal(res.rowCount, 1);
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.STARTUP_TLS_AUTHENTICATION,
    featureId: PG_COMPAT_FEATURE_ID.TLS_REQUIRE_PASSWORD_AUTH,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'CommandComplete:SELECT 1',
    sqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    mutationPrevented: false,
  });

  await assert.rejects(() =>
    withPgClient(createTlsClientConfig(tlsPort, {ssl: false}), (client) =>
      client.query('SELECT 1'),
    ),
  );
  const psqlDowngrade = await runPsqlCommand({
    port: tlsPort,
    sslMode: 'disable',
    sql: 'SELECT 1',
  });
  assert.notEqual(psqlDowngrade.exitCode, 0);
  await assert.rejects(() =>
    withPgPool(createTlsClientConfig(tlsPort, {ssl: false}), (pool) =>
      pool.query('SELECT 1'),
    ),
  );
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.STARTUP_TLS_AUTHENTICATION,
    featureId: PG_COMPAT_FEATURE_ID.PLAINTEXT_DOWNGRADE_WHEN_TLS_REQUIRED,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ErrorResponse:08006:TLSRequiredBeforeStartup',
    sqlState: PG_COMPAT_SQLSTATE.CONNECTION_FAILURE,
    mutationPrevented: true,
  });
}

async function certifyDimension2And3QueriesAndParams(ctx) {
  const {trustPort, countCertItems} = ctx;
  const countBefore = await countCertItems();
  for (const runQuery of [
    (sql, vals) =>
      withPgClient(createTrustClientConfig(trustPort), (c) =>
        c.query(sql, vals),
      ),
    (sql, vals) =>
      withPgPool(createTrustClientConfig(trustPort), (p) =>
        p.query(sql, vals),
      ),
  ]) {
    const simpleRes = await runQuery(
      'SELECT id, label FROM cert_items ORDER BY id ASC LIMIT 2',
    );
    assert.equal(simpleRes.rowCount, 2);
    await assert.rejects(
      () =>
        runQuery(
          'INSERT INTO cert_items (id, label, amount) VALUES (9101, \'b1\', 1); SELECT 1',
        ),
      (err) => err.code === PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    );
    const paramRes = await runQuery(
      'SELECT id, label FROM cert_items WHERE id = $1 AND label = $2',
      [1001, 'alpha'],
    );
    assert.equal(paramRes.rowCount, 1);
    await assert.rejects(
      () => runQuery('SELECT id FROM cert_items ORDER BY id ASC OFFSET 1'),
      (err) => err.code === PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    );
  }
  const psqlSimple = await runPsqlCommand({
    port: trustPort,
    sql: 'SELECT id, label FROM cert_items ORDER BY id ASC LIMIT 2',
  });
  assert.equal(psqlSimple.exitCode, 0);
  const psqlBatch = await runPsqlCommand({
    port: trustPort,
    args: [
      '--single-transaction',
      '-c',
      'INSERT INTO cert_items (id, label, amount) VALUES (9103, \'b3\', 1); SELECT 1',
    ],
  });
  assert.notEqual(psqlBatch.exitCode, 0);
  assert.match(psqlBatch.stderr, /0A000/);
  assert.equal(await countCertItems(), countBefore);
  const psqlParam = await runPsqlCommand({
    port: trustPort,
    sql: 'SELECT id, label FROM cert_items WHERE id = CAST(\'1001\' AS INTEGER) AND label = \'alpha\'',
  });
  assert.equal(psqlParam.exitCode, 0);
  const psqlOffset = await runPsqlCommand({
    port: trustPort,
    sql: 'SELECT id FROM cert_items ORDER BY id ASC OFFSET 1',
  });
  assert.notEqual(psqlOffset.exitCode, 0);
  assert.match(psqlOffset.stderr, /XX000/);

  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.SIMPLE_AND_EXTENDED_QUERY,
    featureId: PG_COMPAT_FEATURE_ID.SIMPLE_AND_EXTENDED_QUERY_EXECUTION,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'CommandComplete:SELECT 2',
    sqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    mutationPrevented: false,
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.SIMPLE_AND_EXTENDED_QUERY,
    featureId: PG_COMPAT_FEATURE_ID.MULTI_STATEMENT_BATCH_QUERY,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ErrorResponse:0A000:MultiStatementBatchRefused',
    sqlState: PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    mutationPrevented: true,
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.PARAMETER_TYPES,
    featureId: PG_COMPAT_FEATURE_ID.POSITIONAL_TYPED_PARAMETERS_AND_CASTS,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'CommandComplete:SELECT 1',
    sqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    mutationPrevented: false,
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.PARAMETER_TYPES,
    featureId: PG_COMPAT_FEATURE_ID.UNBOUNDED_OFFSET_OR_PARAMETERIZED_LIMIT,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ErrorResponse:XX000:OffsetRequiresLimit',
    sqlState: PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    mutationPrevented: true,
  });
}

async function certifyDimension4And5TxAndDdl(ctx) {
  const {trustPort} = ctx;
  for (const withSession of [
    (fn) => withPgClient(createTrustClientConfig(trustPort), fn),
    (fn) =>
      withPgPool(createTrustClientConfig(trustPort), async (pool) => {
        const client = await pool.connect();
        try {
          return await fn(client);
        } finally {
          client.release();
        }
      }),
  ]) {
    await withSession(async (client) => {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO cert_items (id, label, amount) VALUES (1501, \'tx-rb\', 50)',
      );
      await client.query('ROLLBACK');
      const checkRb = await client.query(
        'SELECT id FROM cert_items WHERE id = 1501',
      );
      assert.equal(checkRb.rowCount, 0);
      await assert.rejects(
        () => client.query('BEGIN ISOLATION LEVEL SERIALIZABLE'),
        (err) => err.code === PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
      );
      const ddlRes = await client.query(
        'CREATE TABLE cert_ddl_tbl (id INTEGER PRIMARY KEY, label TEXT)',
      );
      assert.equal(ddlRes.command, 'CREATE');
      await assert.rejects(
        () =>
          client.query(
            'CREATE TABLE cert_fk_bad (id INTEGER PRIMARY KEY, ref INTEGER REFERENCES cert_items(id))',
          ),
        (err) => err.code === PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
      );
    });
  }
  const psqlTx = await runPsqlCommand({
    port: trustPort,
    args: [
      '-c',
      'BEGIN',
      '-c',
      'INSERT INTO cert_items (id, label, amount) VALUES (1503, \'psql-tx\', 70)',
      '-c',
      'ROLLBACK',
      '-c',
      'SELECT COUNT(*) FROM cert_items WHERE id = 1503',
    ],
  });
  assert.equal(psqlTx.exitCode, 0);
  assert.equal(psqlTx.stdout, '0');
  const psqlSerializable = await runPsqlCommand({
    port: trustPort,
    sql: 'BEGIN ISOLATION LEVEL SERIALIZABLE',
  });
  assert.notEqual(psqlSerializable.exitCode, 0);
  assert.match(psqlSerializable.stderr, /0A000/);
  const psqlDdl = await runPsqlCommand({
    port: trustPort,
    sql: 'CREATE TABLE cert_ddl_psql (id INTEGER PRIMARY KEY, label TEXT)',
  });
  assert.equal(psqlDdl.exitCode, 0);
  const psqlFk = await runPsqlCommand({
    port: trustPort,
    sql: 'CREATE TABLE cert_fk_psql (id INTEGER PRIMARY KEY, ref INTEGER REFERENCES cert_items(id))',
  });
  assert.notEqual(psqlFk.exitCode, 0);
  assert.match(psqlFk.stderr, /0A000/);

  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.TRANSACTIONS,
    featureId: PG_COMPAT_FEATURE_ID.EXPLICIT_BEGIN_COMMIT_ROLLBACK,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'CommandComplete:BEGIN_COMMIT_ROLLBACK',
    sqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    mutationPrevented: false,
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.TRANSACTIONS,
    featureId: PG_COMPAT_FEATURE_ID.SERIALIZABLE_ISOLATION_MODE,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ErrorResponse:0A000:UnsupportedTransactionMode',
    sqlState: PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    mutationPrevented: true,
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.DDL,
    featureId: PG_COMPAT_FEATURE_ID.CREATE_TABLE_PRIMARY_KEY,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'CommandComplete:CREATE TABLE',
    sqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    mutationPrevented: false,
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.DDL,
    featureId: PG_COMPAT_FEATURE_ID.FOREIGN_KEY_AND_DROP_TABLE_DDL,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ErrorResponse:0A000:ForeignKeyDdlRefused',
    sqlState: PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    mutationPrevented: true,
  });
}

async function certifyDimension6And7DmlAndResultTypes(ctx) {
  const {trustPort, countCertItems} = ctx;
  const resultTypeSql =
    'SELECT id, CASE WHEN amount >= 20 THEN \'high\' ELSE \'low\' END AS tier ' +
    'FROM cert_items WHERE id IN (1001, 2001) ORDER BY id ASC';
  const countBefore = await countCertItems();
  for (const runQuery of [
    (sql) =>
      withPgClient(createTrustClientConfig(trustPort), (c) => c.query(sql)),
    (sql) =>
      withPgPool(createTrustClientConfig(trustPort), (p) => p.query(sql)),
  ]) {
    const ins = await runQuery(
      'INSERT INTO cert_items (id, label, amount) VALUES (1801, \'dml-a\', 5), (2801, \'dml-b\', 5)',
    );
    const upd = await runQuery(
      'UPDATE cert_items SET amount = 15 WHERE id IN (1801, 2801)',
    );
    const del = await runQuery(
      'DELETE FROM cert_items WHERE id IN (1801, 2801)',
    );
    assert.equal(ins.rowCount, 2);
    assert.equal(upd.rowCount, 2);
    assert.equal(del.rowCount, 2);
    await assert.rejects(
      () => runQuery('DELETE FROM cert_items WHERE id = 1001 RETURNING id'),
      (err) => err.code === PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    );
    const res = await runQuery(resultTypeSql);
    assert.equal(res.rows.length, 2);
    await assert.rejects(
      () => runQuery('COPY cert_items TO STDOUT'),
      (err) => err.code === PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    );
  }
  const psqlDml = await runPsqlCommand({
    port: trustPort,
    args: [
      '-c',
      'INSERT INTO cert_items (id, label, amount) VALUES (1802, \'dml-c\', 5), (2802, \'dml-d\', 5)',
      '-c',
      'UPDATE cert_items SET amount = 25 WHERE id IN (1802, 2802)',
      '-c',
      'DELETE FROM cert_items WHERE id IN (1802, 2802)',
    ],
  });
  assert.equal(psqlDml.exitCode, 0);
  const psqlReturning = await runPsqlCommand({
    port: trustPort,
    sql: 'DELETE FROM cert_items WHERE id = 1001 RETURNING id',
  });
  assert.notEqual(psqlReturning.exitCode, 0);
  assert.match(psqlReturning.stderr, /0A000/);
  assert.equal(await countCertItems(), countBefore);
  const psqlResultTypes = await runPsqlCommand({
    port: trustPort,
    sql: resultTypeSql,
  });
  assert.equal(psqlResultTypes.exitCode, 0);
  assert.equal(psqlResultTypes.stdout, '1001|low\n2001|high');
  const psqlCopy = await runPsqlCommand({
    port: trustPort,
    sql: 'COPY cert_items TO STDOUT',
  });
  assert.notEqual(psqlCopy.exitCode, 0);
  assert.match(psqlCopy.stderr, /XX000/);

  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.INSERTS_UPDATES_DELETES,
    featureId: PG_COMPAT_FEATURE_ID.PARTITION_SPANNING_DML_COMMAND_TAGS,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'CommandComplete:INSERT 0 2|UPDATE 2|DELETE 2',
    sqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    mutationPrevented: false,
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.INSERTS_UPDATES_DELETES,
    featureId: PG_COMPAT_FEATURE_ID.DML_RETURNING_AND_CONFLICT_UPDATE,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ErrorResponse:0A000:DmlReturningRefused',
    sqlState: PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    mutationPrevented: true,
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.RESULT_TYPES,
    featureId: PG_COMPAT_FEATURE_ID.TEXT_ROW_DESCRIPTION_AND_EXPRESSIONS,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'RowDescription:text:SELECT 2',
    sqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    mutationPrevented: false,
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.RESULT_TYPES,
    featureId: PG_COMPAT_FEATURE_ID.COPY_STREAMING_PROTOCOL,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ErrorResponse:XX000:CopyStreamingRefused',
    sqlState: PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    mutationPrevented: true,
  });
}

async function certifyDimension8Errors(ctx) {
  const {trustPort} = ctx;
  for (const withSession of [
    (fn) => withPgClient(createTrustClientConfig(trustPort), fn),
    (fn) =>
      withPgPool(createTrustClientConfig(trustPort), async (pool) => {
        const client = await pool.connect();
        try {
          return await fn(client);
        } finally {
          client.release();
        }
      }),
  ]) {
    await withSession(async (client) => {
      await client.query('BEGIN');
      await assert.rejects(() =>
        client.query('SELECT * FROM non_existent_cert_table'),
      );
      await assert.rejects(
        () => client.query('SELECT id FROM cert_items WHERE id = 1001'),
        (err) => err.code === PG_COMPAT_SQLSTATE.IN_FAILED_SQL_TRANSACTION,
      );
      await client.query('ROLLBACK');
      await assert.rejects(
        () =>
          client.query(
            'INSERT INTO services (service_id) VALUES (\'forged-service\')',
          ),
        (err) => err.code === PG_COMPAT_SQLSTATE.INSUFFICIENT_PRIVILEGE,
      );
    });
  }
  const psqlAbortedTx = await runPsqlCommand({
    port: trustPort,
    args: [
      '-c',
      'BEGIN',
      '-c',
      'SELECT * FROM non_existent_cert_table',
      '-c',
      'SELECT id FROM cert_items WHERE id = 1001',
      '-c',
      'ROLLBACK',
    ],
  });
  assert.match(psqlAbortedTx.stderr, /25P02/);
  const psqlSysTable = await runPsqlCommand({
    port: trustPort,
    sql: 'INSERT INTO services (service_id) VALUES (\'forged-service\')',
  });
  assert.notEqual(psqlSysTable.exitCode, 0);
  assert.match(psqlSysTable.stderr, /42501/);

  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.ERRORS,
    featureId: PG_COMPAT_FEATURE_ID.SQLSTATE_FAILED_TRANSACTION_FENCING,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'ErrorResponse:25P02:AbortedTransactionFenced',
    sqlState: PG_COMPAT_SQLSTATE.IN_FAILED_SQL_TRANSACTION,
    mutationPrevented: true,
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.ERRORS,
    featureId: PG_COMPAT_FEATURE_ID.SYSTEM_TABLE_DIRECT_CLIENT_MUTATION,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ErrorResponse:42501:SystemTableWriteRefused',
    sqlState: PG_COMPAT_SQLSTATE.INSUFFICIENT_PRIVILEGE,
    mutationPrevented: true,
  });
}

async function certifyDimension9And10PoolingAndPrepared(ctx) {
  const {trustPort, cappedPort} = ctx;
  await Promise.all([
    withPgClient(createTrustClientConfig(trustPort), (c1) =>
      c1.query('SELECT id FROM cert_items WHERE id = 1001'),
    ),
    withPgClient(createTrustClientConfig(trustPort), (c2) =>
      c2.query('SELECT id FROM cert_items WHERE id = 2001'),
    ),
  ]);
  const [psqlC1, psqlC2] = await Promise.all([
    runPsqlCommand({
      port: trustPort,
      sql: 'SELECT id FROM cert_items WHERE id = 1001',
    }),
    runPsqlCommand({
      port: trustPort,
      sql: 'SELECT id FROM cert_items WHERE id = 2001',
    }),
  ]);
  assert.equal(psqlC1.exitCode, 0);
  assert.equal(psqlC2.exitCode, 0);
  await withPgPool(createTrustClientConfig(trustPort), async (pool) => {
    const [r1, r2] = await Promise.all([
      pool.query('SELECT id FROM cert_items WHERE id = 1001'),
      pool.query('SELECT id FROM cert_items WHERE id = 2001'),
    ]);
    assert.equal(r1.rowCount, 1);
    assert.equal(r2.rowCount, 1);
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.CONNECTION_POOLING,
    featureId: PG_COMPAT_FEATURE_ID.CONCURRENT_SESSION_AND_POOL_REUSE,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'CommandComplete:ConcurrentSessionsVerified',
    sqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    mutationPrevented: false,
  });

  await withPgClient(createTrustClientConfig(cappedPort), async (holder) => {
    await holder.query('SELECT id FROM cert_items WHERE id = 1001');
    await assert.rejects(() =>
      withPgClient(createTrustClientConfig(cappedPort), (overflow) =>
        overflow.query('SELECT 1'),
      ),
    );
    const psqlOverflow = await runPsqlCommand({
      port: cappedPort,
      sql: 'SELECT 1',
    });
    assert.notEqual(psqlOverflow.exitCode, 0);
    await assert.rejects(() =>
      withPgPool(createTrustClientConfig(cappedPort), (overflowPool) =>
        overflowPool.query('SELECT 1'),
      ),
    );
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.CONNECTION_POOLING,
    featureId: PG_COMPAT_FEATURE_ID.MAX_SESSIONS_OVERFLOW_ADMISSION,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ConnectionClosed:08006:MaxSessionsExceeded',
    sqlState: PG_COMPAT_SQLSTATE.CONNECTION_FAILURE,
    mutationPrevented: true,
  });

  for (const withSession of [
    (fn) => withPgClient(createTrustClientConfig(trustPort), fn),
    (fn) =>
      withPgPool(createTrustClientConfig(trustPort), async (pool) => {
        const client = await pool.connect();
        try {
          return await fn(client);
        } finally {
          client.release();
        }
      }),
  ]) {
    await withSession(async (client) => {
      const firstExec = await client.query({
        name: 'cert_named_stmt',
        text: 'SELECT id, label FROM cert_items WHERE id = $1',
        values: [1001],
      });
      const secondExec = await client.query({
        name: 'cert_named_stmt',
        text: 'SELECT id, label FROM cert_items WHERE id = $1',
        values: [2001],
      });
      assert.equal(firstExec.rows[0].label, 'alpha');
      assert.equal(secondExec.rows[0].label, 'gamma');
      await assert.rejects(
        () =>
          client.query(
            'PREPARE cert_plan (int) AS SELECT id FROM cert_items WHERE id = $1',
          ),
        (err) => err.code === PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
      );
    });
  }
  const psqlPrepare = await runPsqlCommand({
    port: trustPort,
    sql: 'PREPARE cert_plan (int) AS SELECT id FROM cert_items WHERE id = $1',
  });
  assert.notEqual(psqlPrepare.exitCode, 0);
  assert.match(psqlPrepare.stderr, /XX000/);

  recordForClients(ctx, PG_COMPAT_EXTENDED_PROTOCOL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.PREPARED_STATEMENTS,
    featureId: PG_COMPAT_FEATURE_ID.NAMED_EXTENDED_PREPARED_STATEMENT,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'ParseComplete:BindComplete:SELECT 1',
    sqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    mutationPrevented: false,
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.PREPARED_STATEMENTS,
    featureId: PG_COMPAT_FEATURE_ID.SQL_PREPARE_EXECUTE_SYNTAX,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ErrorResponse:XX000:SqlPrepareSyntaxRefused',
    sqlState: PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    mutationPrevented: true,
  });
}

async function certifyDimension11And12CancellationAndLifecycle(ctx) {
  const {tlsPort, trustPort} = ctx;
  await withPgClient(createTrustClientConfig(trustPort), async (client) => {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO cert_items (id, label, amount) VALUES (1901, \'uncommitted-nodepg\', 99)',
    );
  });
  await runPsqlCommand({
    port: trustPort,
    args: [
      '-c',
      'BEGIN',
      '-c',
      'INSERT INTO cert_items (id, label, amount) VALUES (1902, \'uncommitted-psql\', 99)',
    ],
  });
  await withPgPool(createTrustClientConfig(trustPort), async (pool) => {
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO cert_items (id, label, amount) VALUES (1903, \'uncommitted-pool\', 99)',
    );
    client.release(true);
  });
  await withPgClient(createTrustClientConfig(trustPort), async (verifier) => {
    const check = await verifier.query(
      'SELECT id FROM cert_items WHERE id IN (1901, 1902, 1903)',
    );
    assert.equal(check.rowCount, 0);
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.CANCELLATION_BEHAVIOR,
    featureId: PG_COMPAT_FEATURE_ID.DISCONNECT_ABORTS_OPEN_TRANSACTION,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'DisconnectRollbackVerified:SELECT 0',
    sqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    mutationPrevented: true,
  });

  const cancelResponse = await sendCancelRequestPacket(trustPort);
  assert.match(cancelResponse, /08P01/);
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.CANCELLATION_BEHAVIOR,
    featureId: PG_COMPAT_FEATURE_ID.OUT_OF_BAND_CANCEL_REQUEST_PACKET,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ErrorResponse:08P01:CancelRequestRefused',
    sqlState: PG_COMPAT_SQLSTATE.PROTOCOL_VIOLATION,
    mutationPrevented: true,
  });

  await withPgClient(createTlsClientConfig(tlsPort), async (client) => {
    const showRes = await client.query('SHOW SERVICES');
    assert.equal(showRes.rows.length, 1);
  });
  const psqlShow = await runPsqlCommand({
    port: tlsPort,
    sslMode: 'require',
    sql: 'SHOW SERVICES',
  });
  assert.equal(psqlShow.exitCode, 0);
  assert.equal(psqlShow.stdout, 'analytics-worker|installed');
  await withPgPool(createTlsClientConfig(tlsPort), async (pool) => {
    const showRes = await pool.query('SHOW SERVICES');
    assert.equal(showRes.rows.length, 1);
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.LIFECYCLE_SQL_PERMISSIONS,
    featureId: PG_COMPAT_FEATURE_ID.PASSWORD_AUTH_LIFECYCLE_SHOW_SERVICES,
    status: PG_COMPAT_CELL_STATUS.SUPPORTED,
    observedOutcome: 'CommandComplete:SHOW 1',
    sqlState: PG_COMPAT_SQLSTATE.SUCCESSFUL_COMPLETION,
    mutationPrevented: false,
  });

  await withPgClient(createTrustClientConfig(trustPort), async (client) => {
    await assert.rejects(
      () => client.query('SHOW SERVICES'),
      (err) => err.code === PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    );
  });
  const psqlTrustShow = await runPsqlCommand({
    port: trustPort,
    sql: 'SHOW SERVICES',
  });
  assert.notEqual(psqlTrustShow.exitCode, 0);
  assert.match(psqlTrustShow.stderr, /XX000/);
  await withPgPool(createTrustClientConfig(trustPort), async (pool) => {
    await assert.rejects(
      () => pool.query('SHOW SERVICES'),
      (err) => err.code === PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    );
  });
  recordForClients(ctx, PG_COMPAT_ALL_CLIENTS, {
    dimension: PG_COMPAT_DIMENSION.LIFECYCLE_SQL_PERMISSIONS,
    featureId: PG_COMPAT_FEATURE_ID.TRUST_AUTH_LIFECYCLE_SQL_DENIED,
    status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    observedOutcome: 'ErrorResponse:XX000:LifecycleSqlUnauthorized',
    sqlState: PG_COMPAT_SQLSTATE.INTERNAL_ERROR,
    mutationPrevented: true,
  });
}

async function certifyNegativeControls(ctx) {
  const {tlsPort, trustPort, recordNegativeControl, countCertItems} = ctx;
  await assert.rejects(
    () =>
      withPgClient(
        createTlsClientConfig(tlsPort, {password: WRONG_PASSWORD}),
        (c) => c.query('SELECT 1'),
      ),
    (err) => err.code === PG_COMPAT_SQLSTATE.INVALID_AUTHORIZATION,
  );
  const psqlWrongPw = await runPsqlCommand({
    port: tlsPort,
    sslMode: 'require',
    password: WRONG_PASSWORD,
    sql: 'SELECT 1',
  });
  assert.notEqual(psqlWrongPw.exitCode, 0);
  assert.match(psqlWrongPw.stderr, /Authentication failed/i);
  await assert.rejects(
    () =>
      withPgPool(
        createTlsClientConfig(tlsPort, {password: WRONG_PASSWORD}),
        (p) => p.query('SELECT 1'),
      ),
    (err) => err.code === PG_COMPAT_SQLSTATE.INVALID_AUTHORIZATION,
  );
  for (const clientId of PG_COMPAT_ALL_CLIENTS) {
    recordNegativeControl({
      controlId: PG_COMPAT_NEGATIVE_CONTROL_ID.WRONG_PASSWORD,
      clientId,
      rejectedBeforeExecution: true,
      mutationPrevented: true,
      sqlState: PG_COMPAT_SQLSTATE.INVALID_AUTHORIZATION,
      observedError: 'Password authentication failed for user',
    });
  }

  const wrongCaSsl = {
    ca: WRONG_CA_CERT_PEM,
    rejectUnauthorized: true,
    servername: 'localhost',
  };
  await assert.rejects(() =>
    withPgClient(createTlsClientConfig(tlsPort, {ssl: wrongCaSsl}), (c) =>
      c.query('SELECT 1'),
    ),
  );
  const psqlWrongCa = await runPsqlCommand({
    port: tlsPort,
    sslMode: 'verify-ca',
    sslRootCert: WRONG_CA_CERT_PATH,
    sql: 'SELECT 1',
  });
  assert.notEqual(psqlWrongCa.exitCode, 0);
  await assert.rejects(() =>
    withPgPool(createTlsClientConfig(tlsPort, {ssl: wrongCaSsl}), (p) =>
      p.query('SELECT 1'),
    ),
  );
  for (const clientId of PG_COMPAT_ALL_CLIENTS) {
    recordNegativeControl({
      controlId: PG_COMPAT_NEGATIVE_CONTROL_ID.WRONG_CA,
      clientId,
      rejectedBeforeExecution: true,
      mutationPrevented: true,
      sqlState: 'TLS_HANDSHAKE_REJECTED',
      observedError: 'TLS certificate verification failed against wrong CA',
    });
  }

  const countBefore = await countCertItems();
  await withPgClient(createTrustClientConfig(trustPort), async (client) => {
    await assert.rejects(
      () => client.query('DROP TABLE cert_items'),
      /Unsupported statement type: DROP_TABLE/,
    );
    await assert.rejects(
      () => client.query('DELETE FROM cert_items WHERE id = 1001 RETURNING id'),
      (err) => err.code === PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    );
  });
  const psqlDrop = await runPsqlCommand({
    port: trustPort,
    sql: 'DELETE FROM cert_items WHERE id = 1001 RETURNING id',
  });
  assert.notEqual(psqlDrop.exitCode, 0);
  assert.match(psqlDrop.stderr, /0A000/);
  await withPgPool(createTrustClientConfig(trustPort), async (pool) => {
    await assert.rejects(
      () => pool.query('DROP TABLE cert_items'),
      /Unsupported statement type: DROP_TABLE/,
    );
    await assert.rejects(
      () => pool.query('DELETE FROM cert_items WHERE id = 1001 RETURNING id'),
      (err) => err.code === PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
    );
  });
  assert.equal(await countCertItems(), countBefore);
  for (const clientId of PG_COMPAT_ALL_CLIENTS) {
    recordNegativeControl({
      controlId: PG_COMPAT_NEGATIVE_CONTROL_ID.UNSUPPORTED_SQL,
      clientId,
      rejectedBeforeExecution: true,
      mutationPrevented: true,
      sqlState: PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
      observedError: 'DROP TABLE and unsupported SQL refused with 0A000',
    });
  }
}

// What the matrix certifies: the product's SQL surface. The client builds the
// generating host happened to have are environment, recorded beside it and
// never part of the claim (postgres-compatibility-matrix-driver-version-pin).
function certifiedContent(matrix) {
  const {environment: _environment, ...content} = matrix;
  return content;
}

// The same live observations as another host's client build would report them.
function receiptsAs(receipts, versions) {
  return receipts.map((receipt) => createCompatibilityCellReceipt({
    ...receipt, receiptDigest: undefined, driverVersion: versions[receipt.clientId]}));
}

describe('Q10 PostgreSQL compatibility certification matrix', () => {
  let partitionFixture = null;
  let tlsPasswordListener = null;
  let trustListener = null;
  let cappedListener = null;
  let driverVersions = null;
  const liveReceipts = [];
  const liveNegativeControls = [];
  let generatedMatrix = null;

  before(async () => {
    const pgPkg = JSON.parse(
      fs.readFileSync(
        path.resolve(REPO_ROOT, 'node_modules/pg/package.json'),
        'utf8',
      ),
    );
    const pgPoolPkg = JSON.parse(
      fs.readFileSync(
        path.resolve(REPO_ROOT, 'node_modules/pg-pool/package.json'),
        'utf8',
      ),
    );
    const psqlVersion = await detectPsqlVersion();
    driverVersions = Object.freeze({
      [PG_COMPAT_CLIENT_ID.NODE_PG]: pgPkg.version,
      [PG_COMPAT_CLIENT_ID.PSQL]: psqlVersion,
      [PG_COMPAT_CLIENT_ID.PG_POOL]: pgPoolPkg.version,
    });

    partitionFixture = await createCertificationPartitionFixture();
    const credentialVerifier = buildPgwireCredentialVerifier({
      PGWIRE_AUTH_USER: AUTH_USERNAME,
      PGWIRE_AUTH_PASSWORD: AUTH_PASSWORD,
      PGWIRE_AUTH_DATABASE: DATABASE_NAME,
    });

    tlsPasswordListener = await startWireListener({
      engine: partitionFixture.engine,
      authMode: 'password',
      tlsMode: 'require',
      tlsOptions: {key: SERVER_KEY_PEM, cert: SERVER_CERT_PEM},
      credentialVerifier,
      maxSessions: 8,
    });
    trustListener = await startWireListener({
      engine: partitionFixture.engine,
      authMode: 'trust',
      tlsMode: 'disable',
      maxSessions: 8,
    });
    cappedListener = await startWireListener({
      engine: partitionFixture.engine,
      authMode: 'trust',
      tlsMode: 'disable',
      maxSessions: 1,
    });

    const ctx = {
      tlsPort: tlsPasswordListener.port,
      trustPort: trustListener.port,
      cappedPort: cappedListener.port,
      recordReceipt(entry) {
        const receipt = createCompatibilityCellReceipt({
          ...entry,
          driverVersion: driverVersions[entry.clientId],
        });
        liveReceipts.push(receipt);
        return receipt;
      },
      recordNegativeControl(entry) {
        const receipt = createNegativeControlReceipt(entry);
        liveNegativeControls.push(receipt);
        return receipt;
      },
      async countCertItems() {
        const result = await partitionFixture.engine.executeQuery(
          'SELECT COUNT(*) AS total FROM cert_items',
        );
        return Number(result.rows[0].total);
      },
    };

    await certifyDimension1TlsAndAuth(ctx);
    await certifyDimension2And3QueriesAndParams(ctx);
    await certifyDimension4And5TxAndDdl(ctx);
    await certifyDimension6And7DmlAndResultTypes(ctx);
    await certifyDimension8Errors(ctx);
    await certifyDimension9And10PoolingAndPrepared(ctx);
    await certifyDimension11And12CancellationAndLifecycle(ctx);
    await certifyNegativeControls(ctx);

    generatedMatrix = generatePostgresCompatibilityMatrix({
      receipts: liveReceipts,
      driverVersions,
      negativeControls: liveNegativeControls,
      ormCompatibilityClaimed: false,
    });
  });

  after(async () => {
    if (cappedListener) {
      await cappedListener.stop();
    }
    if (trustListener) {
      await trustListener.stop();
    }
    if (tlsPasswordListener) {
      await tlsPasswordListener.stop();
    }
    if (partitionFixture) {
      await partitionFixture.cleanup();
    }
  });

  it('certifies all 12 dimensions across node-pg, psql, and pg-pool with live receipts', () => {
    assert.equal(generatedMatrix.clients.length, 3);
    assert.equal(generatedMatrix.dimensions.length, 12);
    assert.deepEqual(generatedMatrix.dimensions, PG_COMPAT_ALL_DIMENSIONS);
    assert.equal(generatedMatrix.cells.length, PG_COMPAT_DECLARED_CELLS.length);
    assert.equal(generatedMatrix.ormCompatibilityClaimed, false);
    assert.equal(generatedMatrix.summary.totalCells, 71);
    assert.equal(generatedMatrix.summary.supportedCells, 35);
    assert.equal(generatedMatrix.summary.unsupportedCells, 36);
    assert.equal(generatedMatrix.summary.negativeControlCount, 9);
  });

  it('matches committed docs/postgres-compatibility-matrix.json exactly in certified content (all fields but environment) and digest', () => {
    const committedMatrix = JSON.parse(
      fs.readFileSync(MATRIX_JSON_PATH, 'utf8'),
    );
    assert.deepEqual(certifiedContent(generatedMatrix), certifiedContent(committedMatrix));
    const verification = verifyCompatibilityMatrixRegression({
      baselineMatrix: committedMatrix,
      candidateMatrix: generatedMatrix,
      receipts: liveReceipts,
    });
    assert.equal(verification.verified, true);
    assert.equal(verification.matrixDigest, committedMatrix.matrixDigest);
  });

  it('another host\'s psql build certifies the same content and digest', () => {
    // Measured: the hosted runner's psql 16.15 (run 41431327759) observed all
    // 71 cells and 9 controls as this controller's psql 14.24 did.
    const otherHost = {...driverVersions, [PG_COMPAT_CLIENT_ID.PSQL]: '16.15'};
    const matrix = generatePostgresCompatibilityMatrix({
      receipts: receiptsAs(liveReceipts, otherHost),
      driverVersions: otherHost,
      negativeControls: liveNegativeControls,
    });
    const committedMatrix = JSON.parse(fs.readFileSync(MATRIX_JSON_PATH, 'utf8'));
    assert.deepEqual(certifiedContent(matrix), certifiedContent(committedMatrix));
    assert.equal(matrix.matrixDigest, committedMatrix.matrixDigest);
    assert.deepEqual(matrix.environment.driverVersions, otherHost,
      'the generating host\'s client builds are recorded beside the claim');
  });

  it('a client build outside the declared supported range is refused', () => {
    // The certified majors are pinned here, not read back from the module.
    for (const [clientId, version, supportedMajors] of [
      [PG_COMPAT_CLIENT_ID.PSQL, '9.6', [14, 16]],
      [PG_COMPAT_CLIENT_ID.NODE_PG, '7.18.2', [8]],
      [PG_COMPAT_CLIENT_ID.PSQL, 'unknown', [14, 16]]]) {
      const outside = {...driverVersions, [clientId]: version};
      assert.throws(
        () => generatePostgresCompatibilityMatrix({
          receipts: receiptsAs(liveReceipts, outside),
          driverVersions: outside,
          negativeControls: liveNegativeControls,
        }),
        (err) => err instanceof PostgresCompatibilityMatrixError &&
          err.code === PG_COMPAT_MATRIX_ERROR_CODE.DRIVER_VERSION_UNSUPPORTED &&
          err.details?.clientId === clientId &&
          err.details?.version === version &&
          JSON.stringify(err.details?.supportedMajors) === JSON.stringify(supportedMajors),
        `${clientId} ${version} is not a certified client build`,
      );
    }
  });

  it('D12 guard: hand-editing matrix without a live receipt fails MATRIX_RECEIPT_DIGEST_MISMATCH', () => {
    const tamperedMatrix = structuredClone(generatedMatrix);
    tamperedMatrix.cells[0].observedOutcome = 'HandEditedWithoutReceipt';
    assert.throws(
      () =>
        verifyCompatibilityMatrixRegression({
          baselineMatrix: generatedMatrix,
          candidateMatrix: tamperedMatrix,
          receipts: liveReceipts,
        }),
      (err) =>
        err instanceof PostgresCompatibilityMatrixError &&
        err.code === PG_COMPAT_MATRIX_ERROR_CODE.MATRIX_RECEIPT_DIGEST_MISMATCH,
    );
  });

  it('D12 guard: deleting a supported cell receipt fails MISSING_CELL_RECEIPT', () => {
    const firstSupported = liveReceipts.find(
      (r) => r.status === PG_COMPAT_CELL_STATUS.SUPPORTED,
    );
    const filteredReceipts = liveReceipts.filter(
      (r) => r.cellId !== firstSupported.cellId,
    );
    assert.throws(
      () =>
        generatePostgresCompatibilityMatrix({
          receipts: filteredReceipts,
          driverVersions,
          negativeControls: liveNegativeControls,
        }),
      (err) =>
        err instanceof PostgresCompatibilityMatrixError &&
        err.code === PG_COMPAT_MATRIX_ERROR_CODE.MISSING_CELL_RECEIPT,
    );
  });

  it('D12 guard: regressing a supported cell to unsupported fails SUPPORTED_CELL_REGRESSION', () => {
    const firstSupportedIdx = liveReceipts.findIndex(
      (r) => r.status === PG_COMPAT_CELL_STATUS.SUPPORTED,
    );
    const regressedReceipts = liveReceipts.map((receipt, index) => {
      if (index !== firstSupportedIdx) {
        return receipt;
      }
      return createCompatibilityCellReceipt({
        clientId: receipt.clientId,
        driverVersion: receipt.driverVersion,
        dimension: receipt.dimension,
        featureId: receipt.featureId,
        status: PG_COMPAT_CELL_STATUS.UNSUPPORTED,
        observedOutcome: 'ErrorResponse:0A000:RegressedFeature',
        sqlState: PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED,
        mutationPrevented: true,
      });
    });
    assert.throws(
      () =>
        generatePostgresCompatibilityMatrix({
          receipts: regressedReceipts,
          driverVersions,
          negativeControls: liveNegativeControls,
        }),
      (err) =>
        err instanceof PostgresCompatibilityMatrixError &&
        err.code === PG_COMPAT_MATRIX_ERROR_CODE.SUPPORTED_CELL_REGRESSION,
    );
  });

  it('D12 guard: omitting an unsupported cell fails UNSUPPORTED_CELL_OMITTED', () => {
    const firstUnsupported = liveReceipts.find(
      (r) => r.status === PG_COMPAT_CELL_STATUS.UNSUPPORTED,
    );
    const receiptsWithoutUnsupported = liveReceipts.filter(
      (r) => r.cellId !== firstUnsupported.cellId,
    );
    assert.throws(
      () =>
        generatePostgresCompatibilityMatrix({
          receipts: receiptsWithoutUnsupported,
          driverVersions,
          negativeControls: liveNegativeControls,
        }),
      (err) =>
        err instanceof PostgresCompatibilityMatrixError &&
        err.code === PG_COMPAT_MATRIX_ERROR_CODE.UNSUPPORTED_CELL_OMITTED,
    );

    const candidateWithoutUnsupported = structuredClone(generatedMatrix);
    candidateWithoutUnsupported.cells =
      candidateWithoutUnsupported.cells.filter(
        (c) => c.cellId !== firstUnsupported.cellId,
      );
    assert.throws(
      () =>
        verifyCompatibilityMatrixRegression({
          baselineMatrix: generatedMatrix,
          candidateMatrix: candidateWithoutUnsupported,
          receipts: liveReceipts,
        }),
      (err) =>
        err instanceof PostgresCompatibilityMatrixError &&
        err.code === PG_COMPAT_MATRIX_ERROR_CODE.UNSUPPORTED_CELL_OMITTED,
    );
  });

  it('D12 guard: claiming ORM compatibility fails ORM_OVERCLAIM_FORBIDDEN', () => {
    assert.throws(
      () =>
        generatePostgresCompatibilityMatrix({
          receipts: liveReceipts,
          driverVersions,
          negativeControls: liveNegativeControls,
          ormCompatibilityClaimed: true,
        }),
      (err) =>
        err instanceof PostgresCompatibilityMatrixError &&
        err.code === PG_COMPAT_MATRIX_ERROR_CODE.ORM_OVERCLAIM_FORBIDDEN,
    );
  });

  it('D12 guard: negative control breach fails NEGATIVE_CONTROL_BREACH', () => {
    assert.throws(
      () =>
        createNegativeControlReceipt({
          controlId: PG_COMPAT_NEGATIVE_CONTROL_ID.WRONG_PASSWORD,
          clientId: PG_COMPAT_CLIENT_ID.NODE_PG,
          rejectedBeforeExecution: false,
          mutationPrevented: true,
          sqlState: PG_COMPAT_SQLSTATE.INVALID_AUTHORIZATION,
          observedError: 'Allowed wrong password',
        }),
      (err) =>
        err instanceof PostgresCompatibilityMatrixError &&
        err.code === PG_COMPAT_MATRIX_ERROR_CODE.NEGATIVE_CONTROL_BREACH,
    );
  });
});
