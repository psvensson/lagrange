/**
 * Regression witnesses for Track B (24 Nov 2026 review of 1c51010d0):
 * 1. Finding 2 (P2): Prompt BEGIN transaction custody before backpressured
 *    wire output & real PostgresWireAdapter / SQLQueryEngine disconnect
 *    cleanup when a client disconnects before 'drain'.
 * 2. Opportunity 3: Explicit oversized wire-row chunking (<= 64 KiB socket
 *    writes), backpressure + event-loop yield cadence across chunks, exact
 *    byte-order framing, and concurrent short-query responsiveness.
 */

import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';
import {
  PgWireProtocolHandler,
  readCString,
} from '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_BACKEND_MSG,
  PG_DESCRIBE_TYPE,
  PG_FRONTEND_MSG,
  PG_PROTOCOL_VERSION,
  PG_TRANSACTION_STATE,
} from '../../src/runtime/pgwire-protocol-constants.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {createTestPostgresWireAdapter} from
  '../helpers/pgwire-auth-handler.js';
import {createMockSystemCache} from
  '../query/sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';

const DEFAULT_BATCH_MAX_BYTES = 64 * 1024;
const OVERSIZED_TEXT_BYTES = 512 * 1024;
const TABLE_NAME = 'accounts';
const PARTITION_ENTRY = Object.freeze({
  partition_id: 'p1',
  table_name: TABLE_NAME,
  partition_key_start: null,
  partition_key_end: null,
});
const SILENT_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'pgwire-track-b-witness'},
  });
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function createRealAdapterAndEngine(gatewayOptions = {}) {
  resetEnvironment();
  let clockMs = 1000;
  const gateway = createTransactionPersistenceGateway(gatewayOptions);
  const cache = createMockSystemCache(
    [{table_name: TABLE_NAME, primaryKey: 'id'}],
    [PARTITION_ENTRY],
  );
  const router = {
    async deliver(address, message) {
      const partitionId = address.split('/')[2];
      clockMs += 1;
      if (message.type !== QUERY_OPERATION.TRANSACTION) {
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: [],
          changes: 1,
        });
      }
      return buildDeliveryEnvelope(
        {acknowledged: true},
        answerParticipantTransactionRequest(message, partitionId),
      );
    },
  };
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: cache,
    messageRouter: router,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
    unrefRetryDelayTimers: true,
    nowFn: () => clockMs,
  });
  engine.transactionCoordinator.sleep = async () => {};
  const adapter = createTestPostgresWireAdapter({
    sqlCore: engine,
    logger: SILENT_LOGGER,
  });
  return {adapter, engine, gateway};
}

class ControlledBackpressureSocket extends EventEmitter {
  constructor({backpressureEveryWrites = 0} = {}) {
    super();
    this.written = [];
    this.chunkLengths = [];
    this.queuedBytes = 0;
    this.maxQueuedBytes = 0;
    this.backpressured = false;
    this.forceBackpressure = false;
    this.writesWhileBackpressured = 0;
    this.writeCount = 0;
    this.backpressureEveryWrites = backpressureEveryWrites;
    this.destroyed = false;
    this.writableEnded = false;
    this.writable = true;
  }

  write(chunk) {
    const buf = Buffer.from(chunk);
    if (this.backpressured) {
      this.writesWhileBackpressured += 1;
    }
    this.written.push(buf);
    this.chunkLengths.push(buf.length);
    this.writeCount += 1;
    this.queuedBytes += buf.length;
    if (this.queuedBytes > this.maxQueuedBytes) {
      this.maxQueuedBytes = this.queuedBytes;
    }
    const shouldBackpressure =
      this.forceBackpressure ||
      (this.backpressureEveryWrites > 0 &&
        this.writeCount % this.backpressureEveryWrites === 0);
    if (shouldBackpressure) {
      this.backpressured = true;
      return false;
    }
    return true;
  }

  drain() {
    this.queuedBytes = 0;
    this.backpressured = false;
    this.emit('drain');
  }

  end() {
    this.writableEnded = true;
    this.writable = false;
  }

  destroy() {
    this.destroyed = true;
    this.writable = false;
    this.emit('close');
  }

  resetStats() {
    this.written = [];
    this.chunkLengths = [];
    this.queuedBytes = 0;
    this.maxQueuedBytes = 0;
    this.backpressured = false;
    this.writesWhileBackpressured = 0;
    this.writeCount = 0;
  }

  decodeFrames() {
    const all = Buffer.concat(this.written);
    const frames = [];
    for (let offset = 0; offset + 5 <= all.length;) {
      const type = all[offset];
      const len = all.readInt32BE(offset + 1);
      const body = all.subarray(offset + 5, offset + 1 + len);
      frames.push({type, len, body});
      offset += 1 + len;
    }
    return frames;
  }
}

function buildStartupBuffer() {
  const parts = [
    Buffer.alloc(4),
    Buffer.from('user\0test\0database\0test\0\0', 'utf8'),
  ];
  parts[0].writeInt32BE(PG_PROTOCOL_VERSION.CODE, 0);
  const payload = Buffer.concat(parts);
  const header = Buffer.alloc(4);
  header.writeInt32BE(payload.length + 4, 0);
  return Buffer.concat([header, payload]);
}

function buildQueryBuffer(sql) {
  const body = Buffer.from(`${sql}\0`, 'utf8');
  const frame = Buffer.alloc(1 + 4 + body.length);
  frame[0] = PG_FRONTEND_MSG.QUERY;
  frame.writeInt32BE(4 + body.length, 1);
  body.copy(frame, 5);
  return frame;
}

function int16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeInt16BE(value);
  return buffer;
}

function int32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}

function cstring(value) {
  return Buffer.from(`${value}\0`, 'utf8');
}

function frontendMessage(type, parts = []) {
  const payload = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([type]), int32(payload.length + 4), payload]);
}

function decodeDataRowStrings(body) {
  const colCount = body.readInt16BE(0);
  let offset = 2;
  const values = [];
  for (let i = 0; i < colCount; i += 1) {
    const valLen = body.readInt32BE(offset);
    offset += 4;
    if (valLen === -1) {
      values.push(null);
    } else {
      values.push(body.subarray(offset, offset + valLen).toString('utf8'));
      offset += valLen;
    }
  }
  return values;
}

test('Finding 2 Witness: simple-query and extended-query BEGIN record session ' +
  'transaction custody before backpressured output and roll back the live ' +
  'SQLQueryEngine transaction immediately on pre-drain disconnect', async () => {
  // 1. Simple Query ('Q') BEGIN -> backpressure on CommandComplete(BEGIN) ->
  //    disconnect before 'drain' -> real adapter & engine roll back immediately.
  {
    const {adapter, engine} = createRealAdapterAndEngine();
    const socket = new ControlledBackpressureSocket();
    const handler = new PgWireProtocolHandler({
      adapter,
      socket,
      logger: SILENT_LOGGER,
    });
    handler.start();
    socket.emit('data', buildStartupBuffer());
    await handler._processing;
    socket.resetStats();

    const session = handler.getSession();
    assert.ok(session, 'authenticated session must exist');
    const sessionId = session.sessionId;
    assert.equal(engine.hasActiveTransaction(sessionId), false);

    // Force socket backpressure on the very first write of the BEGIN response
    // (CommandComplete('BEGIN')), so ReadyForQuery has not even been written.
    socket.forceBackpressure = true;
    socket.emit('data', buildQueryBuffer('BEGIN'));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(socket.backpressured, true,
      'BEGIN response must be parked on socket backpressure before drain');
    assert.equal(socket.written.length, 1,
      'only CommandComplete(BEGIN) was written before backpressure');
    assert.equal(socket.written[0][0], PG_BACKEND_MSG.COMMAND_COMPLETE);

    // Engine created the transaction AND session already holds custody of it
    // before CommandComplete(BEGIN) / ReadyForQuery finish draining.
    assert.equal(engine.hasActiveTransaction(sessionId), true,
      'SQLQueryEngine must have allocated an active transaction for BEGIN');
    const engineTx = engine.activeTransactions.get(sessionId);
    assert.ok(engineTx?.transactionId, 'engine transactionId must be allocated');
    assert.equal(
      session.getTransactionState(),
      PG_TRANSACTION_STATE.IN_TRANSACTION,
      'PgWireSession must enter IN_TRANSACTION before awaiting wire drain',
    );
    assert.equal(
      session.transactionId,
      engineTx.transactionId,
      'PgWireSession must record engine transactionId before awaiting wire drain',
    );

    // Client disconnects before 'drain' ever fires.
    socket.destroy();
    await handler._processing;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(
      engine.hasActiveTransaction(sessionId),
      false,
      'disconnect before drain must roll back and remove active transaction immediately',
    );
    assert.equal(
      engine.activeTransactions.size,
      0,
      'SQLQueryEngine activeTransactions table must have 0 leaked transactions',
    );
    assert.equal(adapter.hasSession(sessionId), false,
      'PostgresWireAdapter must remove the closed session');
  }

  // 2. Extended Query (Parse / Bind / Execute 'BEGIN') -> backpressure on
  //    CommandComplete(BEGIN) before Sync -> disconnect before 'drain'.
  {
    const {adapter, engine} = createRealAdapterAndEngine();
    const socket = new ControlledBackpressureSocket();
    const handler = new PgWireProtocolHandler({
      adapter,
      socket,
      logger: SILENT_LOGGER,
    });
    handler.start();
    socket.emit('data', buildStartupBuffer());
    await handler._processing;
    socket.resetStats();

    const session = handler.getSession();
    const sessionId = session.sessionId;

    const parseAndBindBegin = Buffer.concat([
      frontendMessage(PG_FRONTEND_MSG.PARSE, [
        cstring(''), cstring('BEGIN'), int16(0),
      ]),
      frontendMessage(PG_FRONTEND_MSG.BIND, [
        cstring(''), cstring(''), int16(0), int16(0), int16(0),
      ]),
      frontendMessage(PG_FRONTEND_MSG.DESCRIBE, [
        Buffer.from([PG_DESCRIBE_TYPE.PORTAL]), cstring(''),
      ]),
    ]);
    socket.emit('data', parseAndBindBegin);
    await handler._processing;
    socket.resetStats();

    // Now force backpressure on Execute('BEGIN') before Sync is sent.
    socket.forceBackpressure = true;
    socket.emit(
      'data',
      frontendMessage(PG_FRONTEND_MSG.EXECUTE, [cstring(''), int32(0)]),
    );
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(socket.backpressured, true);
    assert.equal(engine.hasActiveTransaction(sessionId), true);
    assert.equal(
      session.getTransactionState(),
      PG_TRANSACTION_STATE.IN_TRANSACTION,
    );
    assert.ok(session.transactionId);

    // Disconnect while Execute('BEGIN') output is still backpressured.
    socket.destroy();
    await handler._processing;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(
      engine.hasActiveTransaction(sessionId),
      false,
      'extended-query BEGIN disconnect before drain must roll back immediately',
    );
    assert.equal(engine.activeTransactions.size, 0);
  }

  // 3. Disconnect while BEGIN is still in-flight registering its durable row ->
  //    late-completing BEGIN immediately rolls back and disposes the transaction.
  {
    const beginPersistEntered = Promise.withResolvers();
    const releaseBeginPersist = Promise.withResolvers();
    let holdInsert = true;
    const {adapter, engine, gateway} = createRealAdapterAndEngine({
      async beforeMutation(mutation) {
        if (holdInsert &&
            mutation.operation === 'insert' &&
            mutation.tableName === 'sql_transactions') {
          holdInsert = false;
          beginPersistEntered.resolve(mutation.row?.transaction_id ?? null);
          await releaseBeginPersist.promise;
        }
      },
    });
    const socket = new ControlledBackpressureSocket();
    const handler = new PgWireProtocolHandler({
      adapter,
      socket,
      logger: SILENT_LOGGER,
    });
    handler.start();
    socket.emit('data', buildStartupBuffer());
    await handler._processing;
    socket.resetStats();

    const session = handler.getSession();
    const sessionId = session.sessionId;
    socket.emit('data', buildQueryBuffer('BEGIN'));
    const registeringTxId = await beginPersistEntered.promise;
    assert.ok(registeringTxId, 'durable BEGIN registration must have minted a transactionId');
    assert.equal(session.getTransactionState(), PG_TRANSACTION_STATE.IDLE,
      'PgWireSession is still IDLE while BEGIN registration is in flight');
    assert.equal(session.transactionId, null,
      'PgWireSession has no transactionId while BEGIN is still in flight');

    // Client disconnects while BEGIN is still awaiting durable registration.
    socket.destroy();
    assert.equal(adapter.hasSession(sessionId), false,
      'adapter session is closed while BEGIN registration is still in flight');

    // Release durable BEGIN registration and await handler settlement.
    releaseBeginPersist.resolve();
    await handler._processing;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(engine.hasActiveTransaction(sessionId), false,
      'late-registered BEGIN on a closed session must be rolled back immediately');
    assert.equal(engine.activeTransactions.size, 0,
      'zero active transactions may remain after in-flight BEGIN disconnect');
    const persistedRows = gateway.rows('sql_transactions');
    assert.equal(persistedRows.length, 1);
    assert.equal(persistedRows[0].transaction_id, registeringTxId);
    assert.equal(persistedRows[0].status, 'ROLLED_BACK',
      'durable transaction row must be settled to ROLLED_BACK immediately');
  }

  // 4. Direct PostgresWireAdapter.closeSession(sessionId) while adapter.execute('BEGIN')
  //    is in-flight registering its durable row -> immediately rolled back and disposed.
  {
    const beginPersistEntered = Promise.withResolvers();
    const releaseBeginPersist = Promise.withResolvers();
    let holdInsert = true;
    const {adapter, engine, gateway} = createRealAdapterAndEngine({
      async beforeMutation(mutation) {
        if (holdInsert &&
            mutation.operation === 'insert' &&
            mutation.tableName === 'sql_transactions') {
          holdInsert = false;
          beginPersistEntered.resolve(mutation.row?.transaction_id ?? null);
          await releaseBeginPersist.promise;
        }
      },
    });
    const sessionId = 'direct-adapter-inflight-begin';
    await adapter.authenticate(sessionId, {
      tenantId: 'test',
      user: 'test',
    });
    const beginPromise = adapter.execute(sessionId, 'BEGIN');
    const registeringTxId = await beginPersistEntered.promise;
    assert.ok(registeringTxId);
    assert.equal(engine.activeTransactions.size, 1);

    // Close the adapter session directly while BEGIN is still registering.
    const rollbackSettlement = adapter.closeSession(sessionId);
    assert.equal(adapter.hasSession(sessionId), false);

    releaseBeginPersist.resolve();
    await Promise.all([beginPromise, rollbackSettlement]);

    assert.equal(engine.hasActiveTransaction(sessionId), false);
    assert.equal(engine.activeTransactions.size, 0,
      'direct closeSession during in-flight BEGIN leaves 0 activeTransactions');
    const persistedRows = gateway.rows('sql_transactions');
    assert.equal(persistedRows.length, 1);
    assert.equal(persistedRows[0].transaction_id, registeringTxId);
    assert.equal(persistedRows[0].status, 'ROLLED_BACK');
  }
});

test('Opportunity 3 Witness: single oversized wire row (>= 512 KiB TEXT) is ' +
  'sliced into <= 64 KiB socket write chunks in exact byte order with ' +
  'backpressure and yield cadence so concurrent short queries complete promptly', async () => {
  const oversizedPattern = '0123456789abcdef'.repeat(OVERSIZED_TEXT_BYTES / 16);
  assert.equal(oversizedPattern.length, OVERSIZED_TEXT_BYTES);

  const rawRows = [
    [1, 'prefix-row'],
    [2, oversizedPattern],
    [3, 'suffix-row'],
  ];

  const adapter = {
    async authenticate() {},
    async describe() {
      return {
        success: true,
        described: true,
        statementType: 'SELECT',
        returnsRows: true,
        paramCount: 0,
        paramOids: [],
        columns: [
          {name: 'id', oid: 23, typeSize: 4, typeModifier: -1, formatCode: 0},
          {name: 'payload', oid: 25, typeSize: -1, typeModifier: -1, formatCode: 0},
        ],
      };
    },
    async execute(_sessionId, sql) {
      if (sql.includes('OVERSIZED_ROW')) {
        return {
          success: true,
          statementType: 'SELECT',
          columns: ['id', 'payload'],
          rawRows,
          get rows() {
            return rawRows.map(([id, payload]) => ({id, payload}));
          },
        };
      }
      return {
        success: true,
        statementType: 'SELECT',
        columns: ['ok'],
        rawRows: [[42]],
        rows: [{ok: 42}],
      };
    },
    closeSession() {},
  };

  const slowSocket = new ControlledBackpressureSocket({
    backpressureEveryWrites: 1,
  });
  const slowHandler = new PgWireProtocolHandler({
    adapter,
    socket: slowSocket,
    logger: SILENT_LOGGER,
    // Use default 64 KiB batch/chunk ceiling.
  });
  slowHandler.start();
  slowSocket.emit('data', buildStartupBuffer());
  while (slowSocket.backpressured) {
    slowSocket.drain();
    await new Promise((resolve) => setImmediate(resolve));
  }
  await slowHandler._processing;
  slowSocket.resetStats();

  const fastSocket = new ControlledBackpressureSocket();
  const fastHandler = new PgWireProtocolHandler({
    adapter,
    socket: fastSocket,
    logger: SILENT_LOGGER,
  });
  fastHandler.start();
  fastSocket.emit('data', buildStartupBuffer());
  await fastHandler._processing;
  fastSocket.resetStats();

  // Start the query with a single 512 KiB row on the slow reader.
  slowSocket.emit('data', buildQueryBuffer('SELECT id, payload FROM OVERSIZED_ROW'));
  await new Promise((resolve) => setImmediate(resolve));

  // Drain RowDescription, prefix row, and the first two 64 KiB chunks of the
  // single 512 KiB row so slowHandler is parked mid-row on the 512 KiB DataRow.
  let totalDrains = 0;
  while (totalDrains < 4) {
    if (slowSocket.backpressured) {
      slowSocket.drain();
      totalDrains += 1;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  while (!slowSocket.backpressured) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  // While slowHandler is parked mid-row on the 512 KiB DataRow, run a
  // concurrent short query on fastHandler.
  fastSocket.emit('data', buildQueryBuffer('SELECT 42 AS ok'));
  await fastHandler._processing;
  const fastFrames = fastSocket.decodeFrames();
  assert.equal(
    slowSocket.backpressured,
    true,
    'slow reader must still be mid-stream on the oversized row',
  );
  assert.equal(
    fastFrames.at(-1)?.type,
    PG_BACKEND_MSG.READY_FOR_QUERY,
    'concurrent short query must complete promptly while oversized row is mid-stream',
  );

  // Finish draining the remaining chunks of the oversized row + suffix row.
  let slowDone = false;
  slowHandler._processing.then(() => {
    slowDone = true;
  });
  while (!slowDone) {
    if (slowSocket.backpressured) {
      slowSocket.drain();
      totalDrains += 1;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  await slowHandler._processing;

  const maxChunkBytes = Math.max(...slowSocket.chunkLengths);
  assert.ok(
    maxChunkBytes <= DEFAULT_BATCH_MAX_BYTES,
    `every socket.write chunk (${maxChunkBytes}) must be <= ${DEFAULT_BATCH_MAX_BYTES} bytes`,
  );
  assert.ok(
    slowSocket.maxQueuedBytes <= DEFAULT_BATCH_MAX_BYTES,
    `maxQueuedBytes (${slowSocket.maxQueuedBytes}) must be <= ${DEFAULT_BATCH_MAX_BYTES} bytes`,
  );
  assert.equal(
    slowSocket.writesWhileBackpressured,
    0,
    'never writes to socket while backpressured before drain',
  );
  // 512 KiB row alone requires at least 9 chunks of <= 64 KiB.
  assert.ok(
    totalDrains >= 11,
    `expected at least 11 chunked writes/drains for 512 KiB row, got ${totalDrains}`,
  );

  // Reassemble the wire stream and verify exact byte-order framing and payload.
  const frames = slowSocket.decodeFrames();
  assert.equal(frames[0].type, PG_BACKEND_MSG.ROW_DESCRIPTION);
  const dataFrames = frames.filter((frame) => frame.type === PG_BACKEND_MSG.DATA_ROW);
  assert.equal(dataFrames.length, 3);
  assert.deepEqual(decodeDataRowStrings(dataFrames[0].body), ['1', 'prefix-row']);
  const [row2Id, row2Payload] = decodeDataRowStrings(dataFrames[1].body);
  assert.equal(row2Id, '2');
  assert.equal(row2Payload.length, OVERSIZED_TEXT_BYTES);
  assert.equal(row2Payload, oversizedPattern);
  assert.deepEqual(decodeDataRowStrings(dataFrames[2].body), ['3', 'suffix-row']);

  assert.equal(frames.at(-2).type, PG_BACKEND_MSG.COMMAND_COMPLETE);
  assert.equal(readCString(frames.at(-2).body, 0).value, 'SELECT 3');
  assert.equal(frames.at(-1).type, PG_BACKEND_MSG.READY_FOR_QUERY);

  slowHandler.destroy();
  fastHandler.destroy();
});
