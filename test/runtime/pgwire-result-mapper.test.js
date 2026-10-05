/**
 * PG-wire command tags come from the statement kind the engine EXECUTED and
 * its affected-row count, both read through the one result owner
 * (src/query/application-database-result.js):
 *  - the tag is chosen by the result's executed statement kind
 *    (`statementType`, stamped by SqlCore), never by the query text, so a
 *    write that begins with a comment or a CTE is still tagged as the write;
 *  - a result that names no taggable statement kind is a typed internal
 *    error (XX000), never `OK`;
 *  - the mapper counts the canonical `affectedRows`, never `changes` or
 *    `rowCount`, and a zero count is `0`;
 *  - a DML result with NO count is a typed internal error (SQLSTATE XX000 on
 *    the wire), never a fabricated `UPDATE 0`;
 *  - every engine DML producer reachable from the wire yields a result the
 *    mapper can count (local single-partition, multi-partition aggregation,
 *    zero-row, parameterized, inside an explicit transaction), and a
 *    producer whose partition answer carries no count yields NO count (not
 *    zero, not a guess).
 */

import {after, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {
  deriveCommandTag,
  resolveFailureSqlState,
} from '../../src/runtime/pgwire-result-mapper.js';
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
const UNKNOWN_KIND_CODE = 'PGWIRE_UNKNOWN_STATEMENT_TYPE';
const INTERNAL_ERROR_SQLSTATE = 'XX000';
const FEATURE_NOT_SUPPORTED_SQLSTATE = '0A000';
const SQLSTATE_FIELD = 'C';
const TABLE = 'counted_rows';
const SPLIT_KEY = 100;
const silentLogger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function assertMissingCount(result) {
  assert.throws(() => deriveCommandTag(result), (error) => {
    assert.equal(error.code, MISSING_COUNT_CODE);
    assert.equal(error.sqlState, INTERNAL_ERROR_SQLSTATE);
    return true;
  });
}

function assertUnknownKind(result) {
  assert.throws(() => deriveCommandTag(result), (error) => {
    assert.equal(error.code, UNKNOWN_KIND_CODE);
    assert.equal(error.sqlState, INTERNAL_ERROR_SQLSTATE);
    return true;
  });
}

describe('deriveCommandTag tags the executed statement kind', () => {
  it('reads the canonical affectedRows field of a counted kind', () => {
    assert.equal(deriveCommandTag({statementType: 'INSERT', affectedRows: 5}),
      'INSERT 0 5');
    assert.equal(deriveCommandTag({statementType: 'UPDATE', affectedRows: 3}),
      'UPDATE 3');
    assert.equal(deriveCommandTag({statementType: 'DELETE', affectedRows: 1}),
      'DELETE 1');
  });

  it('reports a zero count as zero', () => {
    for (const [kind, tag] of [['INSERT', 'INSERT 0 0'],
      ['UPDATE', 'UPDATE 0'], ['DELETE', 'DELETE 0']]) {
      assert.equal(deriveCommandTag({statementType: kind, affectedRows: 0}),
        tag);
    }
  });

  it('prefers affectedRows over partition or client-library fields', () => {
    assert.equal(deriveCommandTag({statementType: 'UPDATE', affectedRows: 2,
      changes: 9, rowCount: 7}), 'UPDATE 2');
  });

  it('refuses a DML result with no count instead of reporting zero', () => {
    for (const statementType of ['INSERT', 'UPDATE', 'DELETE']) {
      assertMissingCount({statementType, success: true, rows: []});
      // Not engine result fields: a result carrying only these has no count.
      assertMissingCount({statementType, changes: 4, rowCount: 4});
      assertMissingCount({statementType, affectedRows: null});
      assertMissingCount({statementType, affectedRows: -1});
      assertMissingCount({statementType, affectedRows: 1.5});
      assertMissingCount({statementType, affectedRows: '3'});
    }
  });

  it('maps every executed kind to its truthful tag', () => {
    const table = [
      [{statementType: 'SELECT', rows: [{a: 1}, {a: 2}]}, 'SELECT 2'],
      [{statementType: 'SELECT'}, 'SELECT 0'],
      [{statementType: 'CREATE_TABLE'}, 'CREATE TABLE'],
      [{statementType: 'ALTER_TABLE'}, 'ALTER TABLE'],
      [{statementType: 'BEGIN_TRANSACTION'}, 'BEGIN'],
      [{statementType: 'COMMIT'}, 'COMMIT'],
      [{statementType: 'ROLLBACK'}, 'ROLLBACK'],
      [{statementType: 'EXPLAIN_DISTRIBUTED', rows: [{}]}, 'EXPLAIN'],
      [{statementType: 'call_binding', rows: []}, 'CALL'],
      [{statementType: 'configure_service_access'},
        'CONFIGURE SERVICE ACCESS'],
      [{statementType: 'create_binding'}, 'CREATE BINDING'],
      [{statementType: 'install_service'}, 'INSTALL SERVICE'],
      [{statementType: 'upgrade_service'}, 'UPGRADE SERVICE'],
      [{statementType: 'remove_service'}, 'REMOVE SERVICE'],
      [{statementType: 'show_services', rows: []}, 'SHOW'],
      [{statementType: 'show_service', rows: []}, 'SHOW'],
    ];
    for (const [result, tag] of table) {
      assert.equal(deriveCommandTag(result), tag, result.statementType);
    }
  });

  it('refuses a result with no taggable statement kind, never OK', () => {
    // The text is never consulted: a result without its executed kind has
    // no truthful tag, whatever it carries.
    assertUnknownKind({affectedRows: 2});
    assertUnknownKind({rows: [{a: 1}]});
    assertUnknownKind({});
    assertUnknownKind(undefined);
    assertUnknownKind({statementType: 'DROP_TABLE'});
    assertUnknownKind({statementType: 'VACUUM'});
    assertUnknownKind({statementType: ''});
    assertUnknownKind({statementType: 7});
  });
});

describe('resolveFailureSqlState', () => {
  it('names 0A000 for the multi-statement refusal, else the own state',
    () => {
      assert.equal(resolveFailureSqlState({
        errorCode: 'MULTIPLE_STATEMENTS_UNSUPPORTED',
      }), FEATURE_NOT_SUPPORTED_SQLSTATE);
      assert.equal(resolveFailureSqlState({sqlState: '55P03',
        errorCode: 'MULTIPLE_STATEMENTS_UNSUPPORTED'}), '55P03');
      assert.equal(resolveFailureSqlState({
        errorCode: 'UNSUPPORTED_SQL_FEATURE',
      }), FEATURE_NOT_SUPPORTED_SQLSTATE, 'INSERT ... SELECT, RETURNING');
      assert.equal(resolveFailureSqlState({
        errorCode: 'TRANSACTION_CONTROL_SYNTAX_ERROR',
      }), '42601', 'a transaction keyword with trailing content');
      assert.equal(resolveFailureSqlState({errorCode: 'SYNTAX_ERROR'}),
        INTERNAL_ERROR_SQLSTATE);
      assert.equal(resolveFailureSqlState(new Error('x')),
        INTERNAL_ERROR_SQLSTATE);
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

async function runSimpleQueries(execute, queries) {
  const socket = new CapturingSocket();
  const adapter = {
    async authenticate() {},
    execute,
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
  const exchanges = [];
  for (const query of queries) {
    socket.written = [];
    socket.emit('data', frontendMessage(PG_FRONTEND_MSG.QUERY,
      Buffer.from(`${query}\0`)));
    await new Promise((resolve) => setImmediate(resolve));
    exchanges.push(socket.messages());
  }
  handler.destroy();
  return exchanges;
}

async function runSimpleQuery(execResult, query) {
  const [messages] = await runSimpleQueries(async () => execResult, [query]);
  return messages;
}

function commandTags(messages) {
  return messages.filter(
    (message) => message.type === PG_BACKEND_MSG.COMMAND_COMPLETE,
  ).map((message) => message.body.subarray(0, -1).toString('utf8'));
}

function errorStates(messages) {
  return messages.filter(
    (message) => message.type === PG_BACKEND_MSG.ERROR_RESPONSE,
  ).map((message) => errorFields(message.body)[SQLSTATE_FIELD]);
}

function readyStatus(messages) {
  const ready = messages.at(-1);
  assert.equal(ready.type, PG_BACKEND_MSG.READY_FOR_QUERY);
  return String.fromCharCode(ready.body[0]);
}

describe('the protocol handler sends what the mapper decides', () => {
  it('a counted DML result completes with its count', async () => {
    const messages = await runSimpleQuery(
      {success: true, statementType: 'UPDATE', affectedRows: 2},
      '-- a leading comment\nUPDATE t SET x = 1');
    assert.deepEqual(commandTags(messages), ['UPDATE 2']);
  });

  it('a DML result with no count is an XX000 ErrorResponse, no tag',
    async () => {
      const messages = await runSimpleQuery(
        {success: true, statementType: 'DELETE', rows: []},
        'DELETE FROM t');
      assert.equal(commandTags(messages).length, 0);
      const errors = messages.filter(
        (message) => message.type === PG_BACKEND_MSG.ERROR_RESPONSE);
      assert.equal(errors.length, 1);
      const fields = errorFields(errors[0].body);
      assert.equal(fields[SQLSTATE_FIELD], INTERNAL_ERROR_SQLSTATE);
      assert.match(fields.M, /DELETE completed without an affected-row count/u);
      assert.equal(messages.at(-1).type, PG_BACKEND_MSG.READY_FOR_QUERY);
    });

  it('a result with no executed statement kind is XX000, never OK',
    async () => {
      const messages = await runSimpleQuery({success: true, affectedRows: 2},
        'UPDATE t SET x = 1');
      assert.deepEqual(commandTags(messages), []);
      assert.deepEqual(errorStates(messages), [INTERNAL_ERROR_SQLSTATE]);
    });

  it('the engine\'s multi-statement refusal is a 0A000 ErrorResponse',
    async () => {
      const messages = await runSimpleQuery({
        success: false,
        errorCode: 'MULTIPLE_STATEMENTS_UNSUPPORTED',
        error: 'multiple statements in one query are not supported; ' +
          'send them separately',
      }, 'UPDATE t SET x = 1; DELETE FROM t');
      assert.deepEqual(commandTags(messages), []);
      assert.deepEqual(errorStates(messages), [FEATURE_NOT_SUPPORTED_SQLSTATE]);
    });

  it('a text with no statement is an EmptyQueryResponse', async () => {
    const messages = await runSimpleQuery({
      success: false,
      errorCode: 'EMPTY_STATEMENT',
      error: 'SQL Parse Error: Empty SQL statement',
    }, ';');
    assert.deepEqual(messages.map((message) => message.type), [
      PG_BACKEND_MSG.EMPTY_QUERY,
      PG_BACKEND_MSG.READY_FOR_QUERY,
    ]);
  });
});

describe('the session transaction state follows what the engine executed',
  () => {
    const executedKinds = new Map([
      ['BEGIN', 'BEGIN_TRANSACTION'],
      ['ROLLBACK', 'ROLLBACK'],
      ['COMMIT', 'COMMIT'],
      ['SELECT 1', 'SELECT'],
    ]);
    function scriptedEngine(executed) {
      return async (_sessionId, sql) => {
        executed.push(sql);
        const statementType = executedKinds.get(sql);
        return statementType === undefined ?
          {success: false, error: 'engine refused', errorCode: 'X'} :
          {success: true, statementType, rows: []};
      };
    }

    it('a refused BEGIN-prefixed text leaves the session idle and usable',
      async () => {
        const executed = [];
        const [refused, after] = await runSimpleQueries(
          scriptedEngine(executed),
          ['BEGIN; INSERT INTO t VALUES (1); COMMIT', 'SELECT 1']);
        assert.equal(readyStatus(refused), 'I');
        assert.deepEqual(commandTags(after), ['SELECT 0']);
        assert.equal(readyStatus(after), 'I');
      });

    it('COMMIT in a failed block rolls it back and answers ROLLBACK',
      async () => {
        const executed = [];
        const [begun, failed, refused, committed, after] =
          await runSimpleQueries(scriptedEngine(executed), [
            'BEGIN', 'INSERT INTO missing VALUES (1)', 'SELECT 1',
            'COMMIT', 'SELECT 1',
          ]);
        assert.equal(readyStatus(begun), 'T');
        assert.equal(readyStatus(failed), 'E');
        assert.deepEqual(errorStates(refused), ['25P02']);
        assert.equal(readyStatus(refused), 'E');
        assert.deepEqual(commandTags(committed), ['ROLLBACK']);
        assert.equal(readyStatus(committed), 'I');
        assert.deepEqual(commandTags(after), ['SELECT 0']);
        // The engine ran ROLLBACK for the client's COMMIT, and never ran the
        // statement refused inside the failed block.
        assert.deepEqual(executed, [
          'BEGIN', 'INSERT INTO missing VALUES (1)', 'ROLLBACK', 'SELECT 1',
        ]);
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
    // The executed kind, not the text prefix, names the statement.
    ['line comment before an insert', 's1',
      `-- tagged by an ORM\nINSERT INTO ${TABLE} (id, n) VALUES (7, 7)`, [],
      'INSERT 0 1'],
    ['block comment before an update', 's1',
      `/* trace */ UPDATE ${TABLE} SET n = 8 WHERE id = 7`, [], 'UPDATE 1'],
    ['CTE before an update', 's1',
      `WITH x AS (SELECT 1) UPDATE ${TABLE} SET n = 6 WHERE id = 7`, [],
      'UPDATE 1'],
    ['block comment before a delete', 's1',
      `/* trace */ DELETE FROM ${TABLE} WHERE id = 7`, [], 'DELETE 1'],
    ['commented parameterized update', 's1',
      `/* x */ UPDATE ${TABLE} SET n = $1 WHERE id = $2`, [5, 999],
      'UPDATE 0'],
    ['trailing semicolon', 's1',
      `UPDATE ${TABLE} SET n = 5 WHERE id = 999;`, [], 'UPDATE 0'],
  ];

  it('refuses a multi-statement text whole, executing nothing', async () => {
    await adapter.authenticate('s3', {tenantId: 'count-tenant'});
    const before = await adapter.execute('s3',
      `SELECT id, n FROM ${TABLE} ORDER BY id`, []);
    for (const sql of [
      `UPDATE ${TABLE} SET n = 0 WHERE id = 1; DELETE FROM ${TABLE}`,
      `INSERT INTO ${TABLE} (id, n) VALUES (50, 50); ` +
        `INSERT INTO ${TABLE} (id, n) VALUES (51, 51)`,
      `BEGIN ; DELETE FROM ${TABLE}`,
      `BEGIN; DELETE FROM ${TABLE}; COMMIT`,
    ]) {
      const result = await adapter.execute('s3', sql, []);
      assert.equal(result.success, false, sql);
      assert.equal(result.errorCode, 'MULTIPLE_STATEMENTS_UNSUPPORTED', sql);
      assert.equal(resolveFailureSqlState(result),
        FEATURE_NOT_SUPPORTED_SQLSTATE, sql);
    }
    const afterRows = await adapter.execute('s3',
      `SELECT id, n FROM ${TABLE} ORDER BY id`, []);
    assert.deepEqual(afterRows.rows, before.rows, 'nothing applied');
    assert.equal(engine.hasActiveTransaction('s3'), false,
      'no transaction was begun');
  });

  it('derives the oracle tag from each producer result', async () => {
    for (const session of ['s1', 's2']) {
      await adapter.authenticate(session, {tenantId: 'count-tenant'});
    }
    for (const [producer, session, sql, params, tag] of census) {
      const result = await adapter.execute(session, sql, params);
      assert.equal(result.success, true, `${producer}: succeeded`);
      assert.equal(deriveCommandTag(result), tag, producer);
    }
  });
});

// --- Producers whose partition answer carries no count yield no count ---

describe('a partition answer without a count leaves the count absent', () => {
  const {engine, databases, close} = createSqlitePartitionSqlEngine({
    table: {
      name: TABLE,
      primaryKey: 'id',
      ddl: `CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY, n INTEGER)`,
    },
    partitions: [
      {partition_id: 'counted-p1', partition_key_start: null,
        partition_key_end: SPLIT_KEY},
      {partition_id: 'uncounted-p2', partition_key_start: SPLIT_KEY,
        partition_key_end: null},
    ],
    uncountedPartitions: ['uncounted-p2'],
  });
  const adapter = createTestPostgresWireAdapter({sqlCore: engine});
  after(close);

  it('is refused on the wire instead of read as zero or guessed',
    async () => {
      await adapter.authenticate('u1', {tenantId: 'count-tenant'});
      const counted = await adapter.execute('u1',
        `INSERT INTO ${TABLE} (id, n) VALUES (1, 1)`, []);
      assert.equal(deriveCommandTag(counted), 'INSERT 0 1');
      // Single-partition insert into the uncounted partition: the row
      // applies, the count is not guessed from the VALUES rows.
      const single = await adapter.execute('u1',
        `INSERT INTO ${TABLE} (id, n) VALUES (101, 1)`, []);
      assert.equal(single.success, true);
      assert.equal(Object.hasOwn(single, 'affectedRows'), false,
        'single-partition insert: no count');
      assertMissingCount(single);
      // Fan-out update across both partitions: one uncounted answer makes
      // the sum unknown, never the counted partition's share alone.
      const fanOut = await adapter.execute('u1',
        `UPDATE ${TABLE} SET n = 2 WHERE n = 1`, []);
      assert.equal(fanOut.success, true);
      assert.equal(Object.hasOwn(fanOut, 'affectedRows'), false,
        'fan-out update: no count');
      assertMissingCount(fanOut);
      // The writes did apply (the count is unknown, not the effect).
      assert.deepEqual(
        databases.get('uncounted-p2').prepare(
          `SELECT id, n FROM ${TABLE}`).all(),
        [{id: 101, n: 2}],
      );
    });

  it('the query-lifecycle metric logs the count it has, else null',
    async () => {
      const logged = [];
      const originalInfo = engine.logger.info;
      engine.logger.info = (message, fields) => {
        if (fields && Object.hasOwn(fields, 'rowCount')) {
          logged.push(fields.rowCount);
        }
      };
      try {
        await adapter.authenticate('u2', {tenantId: 'count-tenant'});
        await adapter.execute('u2',
          `UPDATE ${TABLE} SET n = 3 WHERE id = 1`, []);
        await adapter.execute('u2',
          `UPDATE ${TABLE} SET n = 3 WHERE id = 101`, []);
        await adapter.execute('u2', `SELECT id FROM ${TABLE}`, []);
      } finally {
        engine.logger.info = originalInfo;
      }
      assert.deepEqual(logged, [1, null, 2]);
    });
});
