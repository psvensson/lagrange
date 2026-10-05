/**
 * PG-wire command tags read the engine's affected-row count through the one
 * result-count owner (src/query/application-database-result.js):
 *  - the mapper counts the canonical `affectedRows`, never `changes` or
 *    `rowCount`, and a zero count is `0`;
 *  - a DML result with NO count is a typed internal error (SQLSTATE XX000 on
 *    the wire), never a fabricated `UPDATE 0`;
 *  - every engine DML producer reachable from the wire yields a result the
 *    mapper can count (local single-partition, multi-partition aggregation,
 *    zero-row, parameterized, inside an explicit transaction).
 */

import {after, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {deriveCommandTag} from '../../src/runtime/pgwire-result-mapper.js';
import {PgWireProtocolHandler} from
  '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_BACKEND_MSG,
  PG_FRONTEND_MSG,
  PG_PROTOCOL_VERSION,
} from '../../src/runtime/pgwire-protocol-constants.js';
import {createTestPostgresWireAdapter} from '../helpers/pgwire-auth-handler.js';
import {createSqlitePartitionSqlEngine} from
  '../helpers/sqlite-partition-sql-engine.js';

const MISSING_COUNT_CODE = 'PGWIRE_MISSING_AFFECTED_ROW_COUNT';
const INTERNAL_ERROR_SQLSTATE = 'XX000';
const SQLSTATE_FIELD = 'C';
const TABLE = 'counted_rows';
const SPLIT_KEY = 100;
const silentLogger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function assertMissingCount(result, query) {
  assert.throws(() => deriveCommandTag(result, query), (error) => {
    assert.equal(error.code, MISSING_COUNT_CODE);
    assert.equal(error.sqlState, INTERNAL_ERROR_SQLSTATE);
    return true;
  });
}

describe('deriveCommandTag counts the engine result', () => {
  it('reads the canonical affectedRows field', () => {
    assert.equal(deriveCommandTag({affectedRows: 5}, 'INSERT INTO t VALUES (1)'),
      'INSERT 0 5');
    assert.equal(deriveCommandTag({affectedRows: 3}, 'update t set x = 1'),
      'UPDATE 3');
    assert.equal(deriveCommandTag({affectedRows: 1}, '  DELETE FROM t'),
      'DELETE 1');
  });

  it('reports a zero count as zero', () => {
    assert.equal(deriveCommandTag({affectedRows: 0}, 'INSERT INTO t SELECT 1'),
      'INSERT 0 0');
    assert.equal(deriveCommandTag({affectedRows: 0}, 'UPDATE t SET x = 1'),
      'UPDATE 0');
    assert.equal(deriveCommandTag({affectedRows: 0}, 'DELETE FROM t'),
      'DELETE 0');
  });

  it('prefers affectedRows over partition or client-library fields', () => {
    assert.equal(
      deriveCommandTag({affectedRows: 2, changes: 9, rowCount: 7},
        'UPDATE t SET x = 1'),
      'UPDATE 2');
  });

  it('refuses a DML result with no count instead of reporting zero', () => {
    for (const query of ['INSERT INTO t VALUES (1)', 'UPDATE t SET x = 1',
      'DELETE FROM t']) {
      assertMissingCount({success: true, rows: []}, query);
      assertMissingCount(undefined, query);
      // Not engine result fields: a result carrying only these has no count.
      assertMissingCount({changes: 4, rowCount: 4}, query);
      assertMissingCount({affectedRows: null}, query);
      assertMissingCount({affectedRows: -1}, query);
      assertMissingCount({affectedRows: 1.5}, query);
      assertMissingCount({affectedRows: '3'}, query);
    }
  });

  it('keeps SELECT and utility tags unchanged', () => {
    assert.equal(deriveCommandTag({rows: [{a: 1}, {a: 2}]}, 'SELECT a FROM t'),
      'SELECT 2');
    assert.equal(deriveCommandTag({}, 'CREATE TABLE t (id INT)'),
      'CREATE TABLE');
    assert.equal(deriveCommandTag({}, 'BEGIN'), 'BEGIN');
    assert.equal(deriveCommandTag({}, 'COMMIT'), 'COMMIT');
    assert.equal(deriveCommandTag({}, 'ROLLBACK'), 'ROLLBACK');
    assert.equal(deriveCommandTag({}, 'VACUUM'), 'OK');
  });
});

// --- The wire: an absent count becomes an ErrorResponse, not a tag ---

class CapturingSocket extends EventEmitter {
  written = [];
  write(chunk) {
    this.written.push(Buffer.from(chunk));
    return true;
  }
  end() {}
  destroy() {}
  messages() {
    const all = Buffer.concat(this.written);
    const found = [];
    for (let offset = 0; offset + 5 <= all.length;) {
      const length = all.readInt32BE(offset + 1);
      found.push({type: all[offset], body: all.subarray(offset + 5,
        offset + 1 + length)});
      offset += 1 + length;
    }
    return found;
  }
}

function frontendMessage(type, body) {
  const header = Buffer.alloc(5);
  header[0] = type;
  header.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([header, body]);
}

function startupMessage() {
  const params = Buffer.from('user\0counter\0database\0counted\0\0');
  const message = Buffer.alloc(8 + params.length);
  message.writeInt32BE(message.length, 0);
  message.writeInt32BE(PG_PROTOCOL_VERSION.CODE, 4);
  params.copy(message, 8);
  return message;
}

function errorFields(body) {
  const fields = {};
  for (let offset = 0; body[offset] !== 0;) {
    const end = body.indexOf(0, offset + 1);
    fields[String.fromCharCode(body[offset])] =
      body.subarray(offset + 1, end).toString('utf8');
    offset = end + 1;
  }
  return fields;
}

async function runSimpleQuery(execResult, query) {
  const socket = new CapturingSocket();
  const adapter = {
    async authenticate() {},
    async execute() {
      return execResult;
    },
    closeSession() {},
    hasSession() {
      return true;
    },
  };
  const handler = new PgWireProtocolHandler({
    adapter, socket, logger: silentLogger,
  });
  handler.start();
  socket.emit('data', startupMessage());
  await new Promise((resolve) => setImmediate(resolve));
  socket.written = [];
  socket.emit('data', frontendMessage(PG_FRONTEND_MSG.QUERY,
    Buffer.from(`${query}\0`)));
  await new Promise((resolve) => setImmediate(resolve));
  handler.destroy();
  return socket.messages();
}

describe('the protocol handler sends what the mapper decides', () => {
  it('a counted DML result completes with its count', async () => {
    const messages = await runSimpleQuery({success: true, affectedRows: 2},
      'UPDATE t SET x = 1');
    const complete = messages.filter(
      (message) => message.type === PG_BACKEND_MSG.COMMAND_COMPLETE);
    assert.deepEqual(complete.map((message) =>
      message.body.subarray(0, -1).toString('utf8')), ['UPDATE 2']);
  });

  it('a DML result with no count is an XX000 ErrorResponse, no tag',
    async () => {
      const messages = await runSimpleQuery({success: true, rows: []},
        'DELETE FROM t');
      assert.equal(messages.filter((message) =>
        message.type === PG_BACKEND_MSG.COMMAND_COMPLETE).length, 0);
      const errors = messages.filter(
        (message) => message.type === PG_BACKEND_MSG.ERROR_RESPONSE);
      assert.equal(errors.length, 1);
      const fields = errorFields(errors[0].body);
      assert.equal(fields[SQLSTATE_FIELD], INTERNAL_ERROR_SQLSTATE);
      assert.match(fields.M, /DELETE completed without an affected-row count/u);
      assert.equal(messages.at(-1).type, PG_BACKEND_MSG.READY_FOR_QUERY);
    });
});

// --- Producer census: every engine DML path the wire reaches is countable ---

describe('every engine DML producer yields a countable result', () => {
  const {engine, close} = createSqlitePartitionSqlEngine({
    table: {
      name: TABLE,
      primaryKey: 'id',
      ddl: `CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY, n INTEGER)`,
    },
    partitions: [
      {partition_id: 'count-p1', partition_key_start: null,
        partition_key_end: SPLIT_KEY},
      {partition_id: 'count-p2', partition_key_start: SPLIT_KEY,
        partition_key_end: null},
    ],
  });
  const adapter = createTestPostgresWireAdapter({sqlCore: engine});
  after(close);

  // [producer, session, SQL, params, the tag the oracle (this data) expects]
  const census = [
    ['single-partition insert', 's1',
      `INSERT INTO ${TABLE} (id, n) VALUES (1, 1)`, [], 'INSERT 0 1'],
    ['multi-partition insert aggregation', 's1',
      `INSERT INTO ${TABLE} (id, n) VALUES (2, 2), (101, 2), (102, 3)`, [],
      'INSERT 0 3'],
    ['parameterized insert', 's1',
      `INSERT INTO ${TABLE} (id, n) VALUES ($1, $2)`, [3, 3], 'INSERT 0 1'],
    ['keyed single-partition update', 's1',
      `UPDATE ${TABLE} SET n = 9 WHERE id = 1`, [], 'UPDATE 1'],
    ['fan-out update aggregation', 's1',
      `UPDATE ${TABLE} SET n = 4 WHERE n = 2`, [], 'UPDATE 2'],
    ['zero-row update', 's1',
      `UPDATE ${TABLE} SET n = 5 WHERE id = 999`, [], 'UPDATE 0'],
    ['begin', 's2', 'BEGIN', [], 'BEGIN'],
    ['insert inside a transaction', 's2',
      `INSERT INTO ${TABLE} (id, n) VALUES (4, 4)`, [], 'INSERT 0 1'],
    ['update inside a transaction', 's2',
      `UPDATE ${TABLE} SET n = 6 WHERE id = 4`, [], 'UPDATE 1'],
    ['commit', 's2', 'COMMIT', [], 'COMMIT'],
    ['fan-out delete aggregation', 's1',
      `DELETE FROM ${TABLE} WHERE n = 4`, [], 'DELETE 2'],
    ['zero-row delete', 's1',
      `DELETE FROM ${TABLE} WHERE id = 999`, [], 'DELETE 0'],
  ];

  it('derives the oracle tag from each producer result', async () => {
    for (const session of ['s1', 's2']) {
      await adapter.authenticate(session, {tenantId: 'count-tenant'});
    }
    for (const [producer, session, sql, params, tag] of census) {
      const result = await adapter.execute(session, sql, params);
      assert.equal(result.success, true, `${producer}: succeeded`);
      assert.equal(deriveCommandTag(result, sql), tag, producer);
    }
  });
});
