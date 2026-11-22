/**
 * Package 5 (`postgres-wire-description-contract`, Milestone 0.4.1) protocol
 * contract test suite.
 *
 * Covers the six required quest receipts against live `node-pg`, `pg.Pool`,
 * `psql`, and raw PG v3 wire framing over `PostgresWireRuntimeModule` and
 * `createSqlitePartitionSqlEngine`:
 *   1. live-driver-description-red-witness
 *   2. statement-portal-parameter-result-description
 *   3. empty-null-format-oid-row-agreement
 *   4. describe-no-effects-and-portal-lifetime
 *   5. unsupported-refusal-and-matrix-preservation
 *   6. red-on-removal-and-independent-review
 */

import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {after, before, describe, it} from 'node:test';
import pg from 'pg';
import {META_SERVICE_ID} from '../../../src/constants/wasm-meta.js';
import {PG_COMPAT_SQLSTATE} from
  '../../../src/query/pg/postgres-compatibility-catalog.js';
import {
  PG_BACKEND_MSG,
  PG_CLOSE_TYPE,
  PG_DESCRIBE_TYPE,
  PG_ERROR_FIELD,
  PG_FRONTEND_MSG,
  PG_PROTOCOL_VERSION,
} from '../../../src/runtime/pgwire-protocol-constants.js';
import {PostgresWireRuntimeModule} from
  '../../../src/runtime/pgwire-runtime-module.js';
import {isSqlRequest} from '../../../src/query/sql-request.js';
import {createSqlitePartitionSqlEngine} from
  '../../helpers/sqlite-partition-sql-engine.js';

const {Client: PgClient, Pool: PgPool} = pg;

const HOST = '127.0.0.1';
const DATABASE = 'desc_contract_db';
const USER = 'desc_admin';
const PASSWORD = 'desc-contract-password';
const TABLE_NAME = 'desc_items';
const SPLIT_KEY = 2000;

const PG_OID = Object.freeze({
  BOOL: 16,
  INT8: 20,
  INT4: 23,
  TEXT: 25,
  FLOAT8: 701,
  NUMERIC: 1700,
  JSONB: 3802,
});

const PG_SQLSTATE = Object.freeze({
  ...PG_COMPAT_SQLSTATE,
  INVALID_SQL_STATEMENT_NAME: '26000',
  INVALID_CURSOR_NAME: '34000',
});

const PARTITIONS = Object.freeze([
  {
    partition_id: 'desc-p0',
    partition_key_start: null,
    partition_key_end: SPLIT_KEY,
    partition_key_type: 'INTEGER',
  },
  {
    partition_id: 'desc-p1',
    partition_key_start: SPLIT_KEY,
    partition_key_end: null,
    partition_key_type: 'INTEGER',
  },
]);

const TABLE_DDL = `CREATE TABLE ${TABLE_NAME} (` +
  'id INTEGER PRIMARY KEY, ' +
  'label TEXT, ' +
  'amount BIGINT, ' +
  'ratio DOUBLE PRECISION, ' +
  'active BOOLEAN, ' +
  'note TEXT, ' +
  'meta JSONB)';

const silentLogger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function cstring(str) {
  return Buffer.from(`${str}\0`, 'utf8');
}

function int16(val) {
  const b = Buffer.alloc(2);
  b.writeInt16BE(val);
  return b;
}

function int32(val) {
  const b = Buffer.alloc(4);
  b.writeInt32BE(val);
  return b;
}

function buildFrontendMessage(type, parts = []) {
  const payload = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([type]), int32(payload.length + 4), payload]);
}

function buildStartupPacket(user, database) {
  const payload = Buffer.concat([
    int32(PG_PROTOCOL_VERSION.CODE),
    cstring('user'), cstring(user),
    cstring('database'), cstring(database),
    Buffer.from([0]),
  ]);
  return Buffer.concat([int32(payload.length + 4), payload]);
}

function buildPasswordPacket(password) {
  return buildFrontendMessage(PG_FRONTEND_MSG.PASSWORD, [cstring(password)]);
}

function buildQueryMsg(sql) {
  return buildFrontendMessage(PG_FRONTEND_MSG.QUERY, [cstring(sql)]);
}

function buildParseMsg(name, query, paramTypes = []) {
  return buildFrontendMessage(PG_FRONTEND_MSG.PARSE, [
    cstring(name),
    cstring(query),
    int16(paramTypes.length),
    ...paramTypes.map((oid) => int32(oid)),
  ]);
}

function buildBindMsg({
  portal = '',
  statement = '',
  paramFormats = [],
  params = [],
  resultFormats = [],
} = {}) {
  const paramBufs = [];
  for (const val of params) {
    if (val === null || val === undefined) {
      paramBufs.push(int32(-1));
    } else if (Buffer.isBuffer(val)) {
      paramBufs.push(int32(val.length), val);
    } else {
      const encoded = Buffer.from(String(val), 'utf8');
      paramBufs.push(int32(encoded.length), encoded);
    }
  }
  return buildFrontendMessage(PG_FRONTEND_MSG.BIND, [
    cstring(portal),
    cstring(statement),
    int16(paramFormats.length),
    ...paramFormats.map((fmt) => int16(fmt)),
    int16(params.length),
    ...paramBufs,
    int16(resultFormats.length),
    ...resultFormats.map((fmt) => int16(fmt)),
  ]);
}

function buildDescribeMsg(targetType, name) {
  return buildFrontendMessage(PG_FRONTEND_MSG.DESCRIBE, [
    Buffer.from([targetType]),
    cstring(name),
  ]);
}

function buildExecuteMsg(portal = '', maxRows = 0) {
  return buildFrontendMessage(PG_FRONTEND_MSG.EXECUTE, [
    cstring(portal),
    int32(maxRows),
  ]);
}

function buildCloseMsg(targetType, name) {
  return buildFrontendMessage(PG_FRONTEND_MSG.CLOSE, [
    Buffer.from([targetType]),
    cstring(name),
  ]);
}

function buildSyncMsg() {
  return buildFrontendMessage(PG_FRONTEND_MSG.SYNC, []);
}

function readCStringFrom(buf, offset) {
  const idx = buf.indexOf(0, offset);
  assert.notEqual(idx, -1, 'expected NUL-terminated cstring');
  return {value: buf.toString('utf8', offset, idx), nextOffset: idx + 1};
}

function parseFrames(buffer) {
  const frames = [];
  let off = 0;
  while (off + 5 <= buffer.length) {
    const type = buffer[off];
    const len = buffer.readInt32BE(off + 1);
    const total = 1 + len;
    if (off + total > buffer.length) break;
    frames.push({
      type,
      char: String.fromCharCode(type),
      payload: buffer.subarray(off + 5, off + total),
    });
    off += total;
  }
  return {frames, remainder: buffer.subarray(off)};
}

function parseParameterDescription(payload) {
  const count = payload.readInt16BE(0);
  const oids = [];
  let off = 2;
  for (let i = 0; i < count; i++) {
    oids.push(payload.readInt32BE(off));
    off += 4;
  }
  return {count, oids};
}

function parseRowDescription(payload) {
  const count = payload.readInt16BE(0);
  const fields = [];
  let off = 2;
  for (let i = 0; i < count; i++) {
    const nameRes = readCStringFrom(payload, off);
    off = nameRes.nextOffset;
    const tableOid = payload.readInt32BE(off); off += 4;
    const columnAttr = payload.readInt16BE(off); off += 2;
    const dataTypeID = payload.readInt32BE(off); off += 4;
    const dataTypeSize = payload.readInt16BE(off); off += 2;
    const dataTypeModifier = payload.readInt32BE(off); off += 4;
    const format = payload.readInt16BE(off); off += 2;
    fields.push({
      name: nameRes.value,
      tableOid,
      columnAttr,
      dataTypeID,
      dataTypeSize,
      dataTypeModifier,
      format,
    });
  }
  return {count, fields};
}

function parseDataRow(payload) {
  const count = payload.readInt16BE(0);
  const values = [];
  let off = 2;
  for (let i = 0; i < count; i++) {
    const len = payload.readInt32BE(off);
    off += 4;
    if (len === -1) {
      values.push(null);
    } else {
      values.push(payload.toString('utf8', off, off + len));
      off += len;
    }
  }
  return {count, values};
}

function parseErrorResponse(payload) {
  const fields = {};
  let off = 0;
  while (off < payload.length && payload[off] !== 0) {
    const fieldType = payload[off++];
    const val = readCStringFrom(payload, off);
    off = val.nextOffset;
    fields[fieldType] = val.value;
  }
  return {
    severity: fields[PG_ERROR_FIELD.SEVERITY],
    code: fields[PG_ERROR_FIELD.CODE],
    message: fields[PG_ERROR_FIELD.MESSAGE],
    detail: fields[PG_ERROR_FIELD.DETAIL] || null,
  };
}

function parseCommandComplete(payload) {
  return readCStringFrom(payload, 0).value;
}

class RawPgWireClient {
  constructor(port, {user = USER, password = null, database = DATABASE} = {}) {
    this.port = port;
    this.user = user;
    this.password = password;
    this.database = database;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.frames = [];
    this.waiters = [];
  }

  async connect() {
    this.socket = net.createConnection({host: HOST, port: this.port});
    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      const parsed = parseFrames(this.buffer);
      this.buffer = parsed.remainder;
      if (parsed.frames.length > 0) {
        this.frames.push(...parsed.frames);
        this._flushWaiters();
      }
    });
    await new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('error', reject);
    });
    this.socket.write(buildStartupPacket(this.user, this.database));
    if (this.password !== null) {
      const auth = await this.readUntil((frames) =>
        frames.some((f) => f.type === PG_BACKEND_MSG.AUTH));
      assert.equal(auth.length > 0, true);
      this.socket.write(buildPasswordPacket(this.password));
    }
    await this.readUntilReady();
  }

  _flushWaiters() {
    while (this.waiters.length > 0) {
      const waiter = this.waiters[0];
      if (!waiter.predicate(this.frames)) break;
      this.waiters.shift();
      const out = this.frames.splice(0, this.frames.length);
      waiter.resolve(out);
    }
  }

  readUntil(predicate, timeoutMs = 4000) {
    if (predicate(this.frames)) {
      return Promise.resolve(this.frames.splice(0, this.frames.length));
    }
    return new Promise((resolve, reject) => {
      let timer = null;
      const entry = {
        predicate,
        resolve: (out) => {
          clearTimeout(timer);
          resolve(out);
        },
      };
      timer = setTimeout(() => {
        const idx = this.waiters.indexOf(entry);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(
          'Timed out waiting for wire frames; got: ' +
          `${this.frames.map((f) => f.char).join(',')}`,
        ));
      }, timeoutMs);
      this.waiters.push(entry);
    });
  }

  readUntilReady() {
    return this.readUntil((frames) =>
      frames.some((f) => f.type === PG_BACKEND_MSG.READY_FOR_QUERY));
  }

  async roundTrip(buffers) {
    this.socket.write(Buffer.concat(buffers));
    return this.readUntilReady();
  }

  close() {
    if (this.socket && !this.socket.destroyed) {
      this.socket.end();
      this.socket.destroy();
    }
  }
}

function runPsql({port, sql, args = []}) {
  return new Promise((resolve, reject) => {
    const connUri =
      `postgresql://${encodeURIComponent(USER)}@${HOST}:${port}/${DATABASE}` +
      '?sslmode=disable';
    const cliArgs = [connUri, '-X', '-q', '-v', 'VERBOSITY=verbose', ...args];
    if (typeof sql === 'string') cliArgs.push('-c', sql);
    const child = spawn('psql', cliArgs, {
      env: {...process.env, PGPASSWORD: PASSWORD},
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => {
      stdout += c;
    });
    child.stderr.on('data', (c) => {
      stderr += c;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({exitCode, stdout: stdout.trim(), stderr: stderr.trim()});
    });
  });
}

function detectPsqlVersion() {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', ['--version'], {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => {
      stdout += c;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      assert.equal(code, 0);
      resolve(stdout.trim());
    });
  });
}

function createWireHarness({authMode = 'trust', customExecutor = null} = {}) {
  const {engine, databases, close} = createSqlitePartitionSqlEngine({
    table: {name: TABLE_NAME, primaryKey: 'id', ddl: TABLE_DDL},
    partitions: PARTITIONS,
  });
  const observedRequests = [];
  const runtime = new PostgresWireRuntimeModule({logger: silentLogger});
  const context = {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: HOST,
    port: 0,
    sqlRequestExecutor: async (request) => {
      assert.equal(isSqlRequest(request), true);
      observedRequests.push(request);
      if (customExecutor) return customExecutor(request, engine);
      return engine.executeRequest(request);
    },
  };
  return {
    engine,
    databases,
    observedRequests,
    async start() {
      const runtimeConfig = {host: HOST, authMode, tlsMode: 'disable'};
      if (authMode === 'password') {
        runtimeConfig.authUser = USER;
        runtimeConfig.authPassword = PASSWORD;
        runtimeConfig.authDatabase = DATABASE;
      }
      const prepared = await runtime.prepare({
        serviceId: META_SERVICE_ID.POSTGRES_WIRE,
        runtimeConfig: JSON.stringify(runtimeConfig),
      });
      assert.equal(prepared.status, 'ready');
      const started = await runtime.start(context);
      assert.equal(started.status, 'running');
      return started.endpointIntent.port;
    },
    async stop() {
      await runtime.stop(context);
      close();
    },
  };
}

describe('postgres-wire-description-contract (Package 5 / 0.4.1)', () => {
  const harness = createWireHarness({authMode: 'trust'});
  let port;

  before(async () => {
    port = await harness.start();
    const client = new PgClient({
      host: HOST,
      port,
      database: DATABASE,
      user: USER,
      ssl: false,
    });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO ${TABLE_NAME} (id, label, amount, ratio, active, note, meta) VALUES ` +
        '(1001, \'alpha\', 100, 1.5, true, \'present\', \'{"k":1}\'), ' +
        '(2001, \'gamma\', 200, 2.25, false, NULL, NULL)',
      );
    } finally {
      await client.end();
    }
  });

  after(async () => {
    await harness.stop();
  });

  it('Receipt 1 (live-driver-description-red-witness): live node-pg, pg.Pool, and psql receive truthful metadata for empty, populated, parameterized, and NULL results', async () => {
    const psqlVersion = await detectPsqlVersion();
    assert.match(psqlVersion, /psql \(PostgreSQL\)/);

    const clients = [
      async (fn) => {
        const c = new PgClient({host: HOST, port, database: DATABASE, user: USER, ssl: false});
        await c.connect();
        try {
          return await fn(c);
        } finally {
          await c.end();
        }
      },
      async (fn) => {
        const pool = new PgPool({
          host: HOST, port, database: DATABASE, user: USER, ssl: false, max: 2,
        });
        try {
          return await fn(pool);
        } finally {
          await pool.end();
        }
      },
    ];

    for (const withDriver of clients) {
      await withDriver(async (driver) => {
        const zeroStar = await driver.query({
          text: `SELECT * FROM ${TABLE_NAME} WHERE id = $1`,
          values: [-9999],
          queryMode: 'extended',
        });
        assert.equal(zeroStar.rowCount, 0);
        assert.deepEqual(
          zeroStar.fields.map((f) => [f.name, f.dataTypeID]),
          [
            ['id', PG_OID.INT4],
            ['label', PG_OID.TEXT],
            ['amount', PG_OID.INT8],
            ['ratio', PG_OID.FLOAT8],
            ['active', PG_OID.BOOL],
            ['note', PG_OID.TEXT],
            ['meta', PG_OID.JSONB],
          ],
        );

        const zeroSimple = await driver.query(
          `SELECT id, label, amount FROM ${TABLE_NAME} WHERE id = -8888`,
        );
        assert.equal(zeroSimple.rowCount, 0);
        assert.deepEqual(
          zeroSimple.fields.map((f) => [f.name, f.dataTypeID]),
          [
            ['id', PG_OID.INT4],
            ['label', PG_OID.TEXT],
            ['amount', PG_OID.INT8],
          ],
        );

        const populated = await driver.query({
          name: 'desc_populated_stmt',
          text: `SELECT id, label, amount, ratio, active, note, meta FROM ${TABLE_NAME} WHERE id = $1`,
          values: [2001],
        });
        assert.equal(populated.rowCount, 1);
        assert.deepEqual(
          populated.fields.map((f) => [f.name, f.dataTypeID]),
          zeroStar.fields.map((f) => [f.name, f.dataTypeID]),
        );
        assert.strictEqual(populated.rows[0].id, 2001);
        assert.strictEqual(populated.rows[0].label, 'gamma');
        assert.strictEqual(populated.rows[0].amount, '200');
        assert.strictEqual(populated.rows[0].ratio, 2.25);
        assert.strictEqual(populated.rows[0].active, false);
        assert.strictEqual(populated.rows[0].note, null);
        assert.strictEqual(populated.rows[0].meta, null);
      });
    }

    const psqlZero = await runPsql({
      port,
      sql: `SELECT id, label, note FROM ${TABLE_NAME} WHERE id = -9999`,
    });
    assert.equal(psqlZero.exitCode, 0, psqlZero.stderr);
    assert.match(psqlZero.stdout, /id\s*\|\s*label\s*\|\s*note/);
    assert.match(psqlZero.stdout, /\(0 rows\)/);
  });

  it('Receipt 2 (statement-portal-parameter-result-description): Describe(S) and Describe(P) return exact ParameterDescription + RowDescription/NoData', async () => {
    const raw = new RawPgWireClient(port);
    await raw.connect();
    try {
      // 1. Parameterized SELECT without explicit paramTypes -> inferred from table columns
      const selFrames = await raw.roundTrip([
        buildParseMsg('s_sel', `SELECT id, label, note FROM ${TABLE_NAME} WHERE id = $1 AND label = $2`),
        buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, 's_sel'),
        buildBindMsg({portal: 'p_sel', statement: 's_sel', params: ['1001', 'alpha']}),
        buildDescribeMsg(PG_DESCRIBE_TYPE.PORTAL, 'p_sel'),
        buildSyncMsg(),
      ]);
      const selParamDesc = selFrames.filter((f) => f.type === PG_BACKEND_MSG.PARAMETER_DESCRIPTION);
      const selRowDescs = selFrames.filter((f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION);
      const selNoData = selFrames.filter((f) => f.type === PG_BACKEND_MSG.NO_DATA);
      assert.equal(selParamDesc.length, 1);
      assert.deepEqual(parseParameterDescription(selParamDesc[0].payload), {
        count: 2,
        oids: [PG_OID.INT4, PG_OID.TEXT],
      });
      assert.equal(selRowDescs.length, 2, 'Both Describe(S) and Describe(P) must send RowDescription');
      assert.equal(selNoData.length, 0);
      const expectedSelFields = [
        {name: 'id', dataTypeID: PG_OID.INT4, format: 0},
        {name: 'label', dataTypeID: PG_OID.TEXT, format: 0},
        {name: 'note', dataTypeID: PG_OID.TEXT, format: 0},
      ];
      for (const rdFrame of selRowDescs) {
        const parsed = parseRowDescription(rdFrame.payload);
        assert.deepEqual(
          parsed.fields.map((f) => ({name: f.name, dataTypeID: f.dataTypeID, format: f.format})),
          expectedSelFields,
        );
      }

      // 2. Explicit Parse paramTypes + CAST($1 AS TEXT)
      const explicitFrames = await raw.roundTrip([
        buildParseMsg(
          's_exp',
          `SELECT $1::int AS num, label FROM ${TABLE_NAME} WHERE id = $1`,
          [PG_OID.INT4],
        ),
        buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, 's_exp'),
        buildSyncMsg(),
      ]);
      const expParamDesc = explicitFrames.find(
        (f) => f.type === PG_BACKEND_MSG.PARAMETER_DESCRIPTION,
      );
      const expRowDesc = explicitFrames.find(
        (f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION,
      );
      assert.ok(expParamDesc);
      assert.ok(expRowDesc);
      assert.deepEqual(parseParameterDescription(expParamDesc.payload), {
        count: 1,
        oids: [PG_OID.INT4],
      });
      assert.deepEqual(
        parseRowDescription(expRowDesc.payload).fields.map((f) => [f.name, f.dataTypeID]),
        [['num', PG_OID.INT4], ['label', PG_OID.TEXT]],
      );

      // 3. WITH ... SELECT CTE
      const cteFrames = await raw.roundTrip([
        buildParseMsg(
          's_cte',
          `WITH cte AS (SELECT id, amount FROM ${TABLE_NAME} WHERE id = $1) ` +
            'SELECT id, amount FROM cte',
        ),
        buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, 's_cte'),
        buildSyncMsg(),
      ]);
      const cteParam = cteFrames.find(
        (f) => f.type === PG_BACKEND_MSG.PARAMETER_DESCRIPTION,
      );
      const cteRow = cteFrames.find(
        (f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION,
      );
      assert.ok(cteParam);
      assert.ok(cteRow);
      assert.deepEqual(
        parseParameterDescription(cteParam.payload),
        {count: 1, oids: [PG_OID.INT4]},
      );
      assert.deepEqual(
        parseRowDescription(cteRow.payload).fields.map((f) => [f.name, f.dataTypeID]),
        [['id', PG_OID.INT4], ['amount', PG_OID.INT8]],
      );

      // 4. EXPLAIN DISTRIBUTED
      const explainFrames = await raw.roundTrip([
        buildParseMsg('s_explain', `EXPLAIN DISTRIBUTED SELECT id FROM ${TABLE_NAME} WHERE id = $1`),
        buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, 's_explain'),
        buildSyncMsg(),
      ]);
      const expDistParam = explainFrames.find(
        (f) => f.type === PG_BACKEND_MSG.PARAMETER_DESCRIPTION,
      );
      const expDistRow = explainFrames.find(
        (f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION,
      );
      assert.ok(expDistParam);
      assert.ok(expDistRow);
      assert.equal(parseParameterDescription(expDistParam.payload).count, 1);
      assert.equal(parseRowDescription(expDistRow.payload).fields.length, 7);

      // 5. Non-row-returning INSERT / UPDATE / DELETE / BEGIN -> ParameterDescription + NoData
      for (const [stmtName, sql, expectedParamCount] of [
        ['s_ins', `INSERT INTO ${TABLE_NAME} (id, label, amount) VALUES ($1, $2, $3)`, 3],
        ['s_upd', `UPDATE ${TABLE_NAME} SET label = $2 WHERE id = $1`, 2],
        ['s_del', `DELETE FROM ${TABLE_NAME} WHERE id = $1`, 1],
        ['s_beg', 'BEGIN', 0],
      ]) {
        const params = new Array(expectedParamCount).fill(null);
        const dmlFrames = await raw.roundTrip([
          buildParseMsg(stmtName, sql),
          buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, stmtName),
          buildBindMsg({portal: `p_${stmtName}`, statement: stmtName, params}),
          buildDescribeMsg(PG_DESCRIBE_TYPE.PORTAL, `p_${stmtName}`),
          buildSyncMsg(),
        ]);
        const pd = dmlFrames.find((f) => f.type === PG_BACKEND_MSG.PARAMETER_DESCRIPTION);
        const nd = dmlFrames.filter((f) => f.type === PG_BACKEND_MSG.NO_DATA);
        const rd = dmlFrames.filter((f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION);
        assert.ok(pd, `Missing ParameterDescription for ${sql}`);
        assert.equal(parseParameterDescription(pd.payload).count, expectedParamCount);
        assert.equal(nd.length, 2, `Expected 2 NoData frames (S and P) for ${sql}`);
        assert.equal(rd.length, 0);
      }
    } finally {
      raw.close();
    }
  });

  it('Receipt 3 (empty-null-format-oid-row-agreement): Describe, Simple Query RowDescription, and DataRow agree across 0-row, NULL, expression, and aggregate columns', async () => {
    const raw = new RawPgWireClient(port);
    await raw.connect();
    try {
      const exprSql =
        'SELECT id, label, note, ' +
        'CASE WHEN amount >= 150 THEN \'high\' ELSE \'low\' END AS tier, ' +
        'COUNT(*) AS total ' +
        `FROM ${TABLE_NAME} WHERE id = $1 GROUP BY id, label, note, amount`;
      const zeroFrames = await raw.roundTrip([
        buildParseMsg('s_agree', exprSql),
        buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, 's_agree'),
        buildBindMsg({portal: 'p_agree_0', statement: 's_agree', params: ['-7777']}),
        buildDescribeMsg(PG_DESCRIBE_TYPE.PORTAL, 'p_agree_0'),
        buildExecuteMsg('p_agree_0', 0),
        buildSyncMsg(),
      ]);
      const rdFromDescribeS = parseRowDescription(
        zeroFrames.filter((f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION)[0].payload,
      );
      const rdFromDescribeP = parseRowDescription(
        zeroFrames.filter((f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION)[1].payload,
      );
      assert.equal(
        zeroFrames.filter((f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION).length,
        2,
        'Execute must not emit a duplicate RowDescription in extended query mode',
      );
      assert.deepEqual(rdFromDescribeS.fields, rdFromDescribeP.fields);
      assert.deepEqual(
        rdFromDescribeS.fields.map((f) => [f.name, f.dataTypeID, f.format]),
        [
          ['id', PG_OID.INT4, 0],
          ['label', PG_OID.TEXT, 0],
          ['note', PG_OID.TEXT, 0],
          ['tier', PG_OID.TEXT, 0],
          ['total', PG_OID.INT8, 0],
        ],
      );
      assert.equal(zeroFrames.filter((f) => f.type === PG_BACKEND_MSG.DATA_ROW).length, 0);
      const zeroCmd = zeroFrames.find((f) => f.type === PG_BACKEND_MSG.COMMAND_COMPLETE);
      assert.equal(parseCommandComplete(zeroCmd.payload), 'SELECT 0');

      // Same query with a matching row that contains SQL NULL in `note`
      const hitFrames = await raw.roundTrip([
        buildBindMsg({portal: 'p_agree_hit', statement: 's_agree', params: ['2001']}),
        buildDescribeMsg(PG_DESCRIBE_TYPE.PORTAL, 'p_agree_hit'),
        buildExecuteMsg('p_agree_hit', 0),
        buildSyncMsg(),
      ]);
      const rdHit = parseRowDescription(
        hitFrames.find((f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION).payload,
      );
      assert.deepEqual(rdHit.fields, rdFromDescribeS.fields);
      const dataRow = parseDataRow(
        hitFrames.find((f) => f.type === PG_BACKEND_MSG.DATA_ROW).payload,
      );
      assert.deepEqual(dataRow.values, ['2001', 'gamma', null, 'high', '1']);

      // Simple query 0-row SELECT * must emit exact same RowDescription schema
      const simpleZeroFrames = await raw.roundTrip([
        buildQueryMsg(`SELECT * FROM ${TABLE_NAME} WHERE id = -7777`),
      ]);
      const simpleRd = simpleZeroFrames.find((f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION);
      assert.ok(simpleRd, 'Simple query zero-row SELECT * must emit RowDescription');
      assert.deepEqual(
        parseRowDescription(simpleRd.payload).fields.map((f) => [f.name, f.dataTypeID]),
        [
          ['id', PG_OID.INT4],
          ['label', PG_OID.TEXT],
          ['amount', PG_OID.INT8],
          ['ratio', PG_OID.FLOAT8],
          ['active', PG_OID.BOOL],
          ['note', PG_OID.TEXT],
          ['meta', PG_OID.JSONB],
        ],
      );
    } finally {
      raw.close();
    }
  });

  it('Receipt 4 (describe-no-effects-and-portal-lifetime): Describe executes zero DML/lifecycle effects and honors statement/portal lifetime and error fencing', async () => {
    const lifecycleCalls = [];
    const pwHarness = createWireHarness({
      authMode: 'password',
      customExecutor: async (request, engine) => {
        lifecycleCalls.push(request.statement);
        return engine.executeRequest(request);
      },
    });
    const pwPort = await pwHarness.start();
    const raw = new RawPgWireClient(port);
    const pwRaw = new RawPgWireClient(pwPort, {password: PASSWORD});
    await raw.connect();
    await pwRaw.connect();
    try {
      // 1. Describe on INSERT/UPDATE/DELETE does not execute writes
      const beforeCount = Array.from(harness.databases.values())
        .reduce((acc, db) => acc + db.prepare(`SELECT COUNT(*) AS c FROM ${TABLE_NAME}`).get().c, 0);
      await raw.roundTrip([
        buildParseMsg('s_noeff_ins', `INSERT INTO ${TABLE_NAME} (id, label, amount) VALUES ($1, $2, $3)`),
        buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, 's_noeff_ins'),
        buildBindMsg({portal: 'p_noeff_ins', statement: 's_noeff_ins', params: ['9001', 'ghost', '5']}),
        buildDescribeMsg(PG_DESCRIBE_TYPE.PORTAL, 'p_noeff_ins'),
        buildParseMsg('s_noeff_del', `DELETE FROM ${TABLE_NAME} WHERE id = $1`),
        buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, 's_noeff_del'),
        buildBindMsg({portal: 'p_noeff_del', statement: 's_noeff_del', params: ['1001']}),
        buildDescribeMsg(PG_DESCRIBE_TYPE.PORTAL, 'p_noeff_del'),
        buildSyncMsg(),
      ]);
      const afterCount = Array.from(harness.databases.values())
        .reduce((acc, db) => acc + db.prepare(`SELECT COUNT(*) AS c FROM ${TABLE_NAME}`).get().c, 0);
      assert.equal(afterCount, beforeCount);

      // 2. Describe on lifecycle CALL BINDING / INSTALL SERVICE / SHOW SERVICES never invokes executor
      const beforeLifecycleCount = lifecycleCalls.length;
      const lcFrames = await pwRaw.roundTrip([
        buildParseMsg('s_lc_call', 'CALL BINDING $1'),
        buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, 's_lc_call'),
        buildBindMsg({
          portal: 'p_lc_call',
          statement: 's_lc_call',
          params: [JSON.stringify({schema_version: 1, name: 'fn'})],
        }),
        buildDescribeMsg(PG_DESCRIBE_TYPE.PORTAL, 'p_lc_call'),
        buildParseMsg('s_lc_show', 'SHOW SERVICES'),
        buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, 's_lc_show'),
        buildSyncMsg(),
      ]);
      assert.equal(lifecycleCalls.length, beforeLifecycleCount);
      const lcRowDescs = lcFrames.filter((f) => f.type === PG_BACKEND_MSG.ROW_DESCRIPTION);
      assert.equal(lcRowDescs.length, 3);
      assert.deepEqual(
        parseRowDescription(lcRowDescs[0].payload).fields.map((f) => f.name),
        ['name', 'result'],
      );

      // 3. Portal and statement lifetime: Close('P'), Close('S'), re-Parse, error fencing until Sync
      await raw.roundTrip([
        buildParseMsg('s_life', `SELECT id FROM ${TABLE_NAME} WHERE id = $1`),
        buildBindMsg({portal: 'p_a', statement: 's_life', params: ['1001']}),
        buildBindMsg({portal: 'p_b', statement: 's_life', params: ['2001']}),
        buildCloseMsg(PG_CLOSE_TYPE.PORTAL, 'p_a'),
        buildSyncMsg(),
      ]);

      // p_a was closed (34000); p_b is still open
      const closedPortalFrames = await raw.roundTrip([
        buildDescribeMsg(PG_DESCRIBE_TYPE.PORTAL, 'p_a'),
        buildSyncMsg(),
      ]);
      const closedPortalErr = closedPortalFrames.find(
        (f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE,
      );
      assert.equal(
        parseErrorResponse(closedPortalErr.payload).code,
        PG_SQLSTATE.INVALID_CURSOR_NAME,
      );

      const livePortalFrames = await raw.roundTrip([
        buildDescribeMsg(PG_DESCRIBE_TYPE.PORTAL, 'p_b'),
        buildExecuteMsg('p_b', 0),
        buildSyncMsg(),
      ]);
      assert.equal(
        livePortalFrames.filter((f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE).length,
        0,
      );
      const liveDataRow = livePortalFrames.find((f) => f.type === PG_BACKEND_MSG.DATA_ROW);
      assert.equal(parseDataRow(liveDataRow.payload).values[0], '2001');

      // Closing statement s_life must also close p_b bound to it
      await raw.roundTrip([
        buildCloseMsg(PG_CLOSE_TYPE.STATEMENT, 's_life'),
        buildSyncMsg(),
      ]);
      const staleAfterClose = await raw.roundTrip([
        buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, 's_life'),
        buildSyncMsg(),
      ]);
      const staleStmtErr = staleAfterClose.find(
        (f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE,
      );
      assert.equal(
        parseErrorResponse(staleStmtErr.payload).code,
        PG_SQLSTATE.INVALID_SQL_STATEMENT_NAME,
      );
      const stalePortalAfterStmtClose = await raw.roundTrip([
        buildDescribeMsg(PG_DESCRIBE_TYPE.PORTAL, 'p_b'),
        buildSyncMsg(),
      ]);
      assert.equal(
        parseErrorResponse(
          stalePortalAfterStmtClose.find((f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE).payload,
        ).code,
        PG_SQLSTATE.INVALID_CURSOR_NAME,
      );

      // Error in extended pipeline fences subsequent extended messages until Sync
      const fencedFrames = await raw.roundTrip([
        buildDescribeMsg(PG_DESCRIBE_TYPE.STATEMENT, 'missing_stmt'),
        buildParseMsg('should_not_run', 'SELECT 1'),
        buildSyncMsg(),
      ]);
      assert.equal(fencedFrames.filter((f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE).length, 1);
      assert.equal(fencedFrames.filter((f) => f.type === PG_BACKEND_MSG.PARSE_COMPLETE).length, 0);
      assert.equal(fencedFrames.at(-1).type, PG_BACKEND_MSG.READY_FOR_QUERY);
    } finally {
      raw.close();
      pwRaw.close();
      await pwHarness.stop();
    }
  });

  it('Receipt 5 (unsupported-refusal-and-matrix-preservation): explicit 08P01/0A000 refusals and preserved Q10 SQLSTATEs', async () => {
    const raw = new RawPgWireClient(port);
    await raw.connect();
    try {
      // 1. Bind parameter count mismatch -> 08P01
      const badCount = await raw.roundTrip([
        buildParseMsg('s_cnt', `SELECT id FROM ${TABLE_NAME} WHERE id = $1 AND label = $2`),
        buildBindMsg({portal: 'p_cnt', statement: 's_cnt', params: ['1001']}),
        buildSyncMsg(),
      ]);
      const badCountErr = badCount.find((f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE);
      assert.equal(parseErrorResponse(badCountErr.payload).code, PG_SQLSTATE.PROTOCOL_VIOLATION);

      // 2. Binary parameter format (1) -> 0A000; binary result format (1) -> 0A000
      const binParam = await raw.roundTrip([
        buildParseMsg('s_fmt', `SELECT id FROM ${TABLE_NAME} WHERE id = $1`),
        buildBindMsg({
          portal: 'p_fmt1',
          statement: 's_fmt',
          paramFormats: [1],
          params: [int32(1001)],
        }),
        buildSyncMsg(),
      ]);
      const binParamErr = binParam.find((f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE);
      assert.equal(parseErrorResponse(binParamErr.payload).code, PG_SQLSTATE.FEATURE_NOT_SUPPORTED);

      const binResult = await raw.roundTrip([
        buildBindMsg({portal: 'p_fmt2', statement: 's_fmt', params: ['1001'], resultFormats: [1]}),
        buildSyncMsg(),
      ]);
      const binResultErr = binResult.find((f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE);
      assert.equal(
        parseErrorResponse(binResultErr.payload).code,
        PG_SQLSTATE.FEATURE_NOT_SUPPORTED,
      );

      // 3. Invalid format code (2) -> 08P01
      const badFmt = await raw.roundTrip([
        buildBindMsg({portal: 'p_fmt3', statement: 's_fmt', paramFormats: [2], params: ['1001']}),
        buildSyncMsg(),
      ]);
      const badFmtErr = badFmt.find((f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE);
      assert.equal(parseErrorResponse(badFmtErr.payload).code, PG_SQLSTATE.PROTOCOL_VIOLATION);

      // 4. Execute maxRows > 0 (unsupported portal suspension) -> 0A000, zero DataRows
      const suspendFrames = await raw.roundTrip([
        buildBindMsg({portal: 'p_susp', statement: 's_fmt', params: ['1001']}),
        buildExecuteMsg('p_susp', 1),
        buildSyncMsg(),
      ]);
      assert.equal(suspendFrames.filter((f) => f.type === PG_BACKEND_MSG.DATA_ROW).length, 0);
      const suspendErr = suspendFrames.find((f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE);
      assert.equal(parseErrorResponse(suspendErr.payload).code, PG_SQLSTATE.FEATURE_NOT_SUPPORTED);

      // 5. Unsupported isolation / VALUES / SHOW GUC / EXPLAIN SELECT / RETURNING -> 0A000
      for (const sql of [
        'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE',
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
        'SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL SERIALIZABLE',
        'BEGIN ISOLATION LEVEL SERIALIZABLE',
        'BEGIN ISOLATION LEVEL REPEATABLE READ',
        'VALUES (1, 2)',
        'SHOW transaction_isolation',
        `EXPLAIN SELECT id FROM ${TABLE_NAME}`,
        `DELETE FROM ${TABLE_NAME} WHERE id = 1001 RETURNING id`,
      ]) {
        const frames = await raw.roundTrip([
          buildParseMsg('', sql),
          buildSyncMsg(),
        ]);
        const err = frames.find((f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE);
        assert.ok(err, `Expected ErrorResponse for ${sql}`);
        assert.equal(
          parseErrorResponse(err.payload).code,
          PG_SQLSTATE.FEATURE_NOT_SUPPORTED,
          `Expected 0A000 for ${sql}`,
        );
      }

      // Live node-pg + psql check on SET TRANSACTION ISOLATION LEVEL SERIALIZABLE
      const pgClient = new PgClient({host: HOST, port, database: DATABASE, user: USER, ssl: false});
      await pgClient.connect();
      try {
        await assert.rejects(
          () => pgClient.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE'),
          (err) => err.code === PG_SQLSTATE.FEATURE_NOT_SUPPORTED,
        );
        // Preserved Q10 SQLSTATEs
        await assert.rejects(
          () => pgClient.query(`SELECT id FROM ${TABLE_NAME} ORDER BY id ASC OFFSET 1`),
          (err) => err.code === PG_SQLSTATE.INTERNAL_ERROR,
        );
        await assert.rejects(
          () => pgClient.query(`COPY ${TABLE_NAME} TO STDOUT`),
          (err) => err.code === PG_SQLSTATE.INTERNAL_ERROR,
        );
      } finally {
        await pgClient.end();
      }
      const psqlSet = await runPsql({
        port,
        sql: 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE',
      });
      assert.notEqual(psqlSet.exitCode, 0);
      assert.match(psqlSet.stderr, /0A000/);
    } finally {
      raw.close();
    }
  });

  it('Receipt 6 (red-on-removal-and-independent-review): malformed Describe target fails with 08P01 and parameter/result counts always reconcile', async () => {
    const raw = new RawPgWireClient(port);
    await raw.connect();
    try {
      const badTarget = await raw.roundTrip([
        buildParseMsg('s_badt', 'SELECT 1'),
        buildDescribeMsg(0x58, 's_badt'),
        buildSyncMsg(),
      ]);
      const badTargetErr = badTarget.find((f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE);
      assert.equal(parseErrorResponse(badTargetErr.payload).code, PG_SQLSTATE.PROTOCOL_VIOLATION);

      // Parse with extra declared paramTypes (> $N placeholders) -> 08P01
      const extraParamTypes = await raw.roundTrip([
        buildParseMsg(
          's_extra',
          `SELECT id FROM ${TABLE_NAME} WHERE id = $1`,
          [PG_OID.INT4, PG_OID.TEXT],
        ),
        buildSyncMsg(),
      ]);
      const extraErr = extraParamTypes.find((f) => f.type === PG_BACKEND_MSG.ERROR_RESPONSE);
      assert.equal(parseErrorResponse(extraErr.payload).code, PG_SQLSTATE.PROTOCOL_VIOLATION);
    } finally {
      raw.close();
    }
  });
});
