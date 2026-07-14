/**
 * Unit tests for PgWireProtocolHandler — PG wire protocol handling.
 *
 * Validates: Requirements 8.1, 9.1, 9.4, 10.1
 *
 * Tests cover startup/auth handshake, simple query protocol,
 * extended query protocol (Parse/Bind/Execute/Sync), session
 * state management, error handling, and unsupported features.
 *
 * All tests use mock sockets and a mock adapter to avoid real
 * SQL execution.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';

import {
  PgWireProtocolHandler,
  HANDLER_PHASE,
  buildAuthOk,
  buildParameterStatus,
  buildReadyForQuery,
  buildErrorResponse,
  buildRowDescription,
  buildDataRow,
  buildCommandComplete,
  buildParseComplete,
  buildBindComplete,
  buildCloseComplete,
  buildNoData,
  buildEmptyQueryResponse,
  parseStartupParams,
  parseQueryMessage,
  parseParseMessage,
  parseBindMessage,
  parseDescribeMessage,
  parseExecuteMessage,
  parseCloseMessage,
  deriveCommandTag,
  extractColumns,
  extractRowValues,
  writeCString,
  readCString,
} from '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_PROTOCOL_VERSION,
  PG_SSL_REQUEST_CODE,
  PG_SSL_RESPONSE,
  PG_FRONTEND_MSG,
  PG_BACKEND_MSG,
  PG_AUTH_TYPE,
  PG_TRANSACTION_STATE,
  PG_SEVERITY,
  PG_ERROR_CODE,
  PG_DESCRIBE_TYPE,
  PG_CLOSE_TYPE,
  PG_SERVER_PARAMS,
  PG_HANDLER_ERROR,
} from '../../src/runtime/pgwire-protocol-constants.js';

// --- Test helpers ---

/**
 * Mock socket that records written data.
 */
class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.written = [];
    this.ended = false;
    this.destroyed = false;
  }
  write(buf) {
    this.written.push(Buffer.from(buf));
    return true;
  }
  end() {
    this.ended = true;
  }
  destroy() {
    this.destroyed = true;
  }
  /** Get all written bytes concatenated. */
  allWritten() {
    return Buffer.concat(this.written);
  }
  /** Find messages of a given backend type in written data. */
  findMessages(type) {
    const all = this.allWritten();
    const msgs = [];
    let off = 0;
    while (off < all.length) {
      const t = all[off];
      if (off + 5 > all.length) break;
      const len = all.readInt32BE(off + 1);
      const total = 1 + len;
      if (off + total > all.length) break;
      if (t === type) {
        msgs.push(all.subarray(off, off + total));
      }
      off += total;
    }
    return msgs;
  }
}

/**
 * Mock adapter that records calls and returns configurable results.
 */
class MockAdapter {
  constructor(options = {}) {
    this.sessions = new Map();
    this.executions = [];
    this.authError = options.authError || null;
    this.execResult = options.execResult || {rows: [], columns: []};
    this.execError = options.execError || null;
  }
  async authenticate(sessionId, credentials) {
    if (this.authError) throw new Error(this.authError);
    this.sessions.set(sessionId, credentials);
    return {sessionId, tenantId: credentials.tenantId};
  }
  async execute(sessionId, sql, params) {
    this.executions.push({sessionId, sql, params});
    if (this.execError) throw new Error(this.execError);
    return this.execResult;
  }
  closeSession(sessionId) {
    this.sessions.delete(sessionId);
  }
  hasSession(sessionId) {
    return this.sessions.has(sessionId);
  }
}

/** Silent logger for tests. */
const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * Build a PG startup message buffer.
 * @param {Object} params - Key-value startup parameters.
 * @return {Buffer}
 */
function buildStartupMessage(params = {}) {
  const pairs = [];
  for (const [k, v] of Object.entries(params)) {
    pairs.push(k, v);
  }
  // Calculate size: 4 (length) + 4 (version) + params + final null
  let paramSize = 0;
  for (const s of pairs) {
    paramSize += Buffer.byteLength(s, 'utf8') + 1;
  }
  const totalLen = 4 + 4 + paramSize + 1;
  const buf = Buffer.allocUnsafe(totalLen);
  buf.writeInt32BE(totalLen, 0);
  buf.writeInt32BE(PG_PROTOCOL_VERSION.CODE, 4);
  let off = 8;
  for (const s of pairs) {
    off += buf.write(s, off, 'utf8');
    buf[off++] = 0;
  }
  buf[off] = 0; // final null
  return buf;
}

/**
 * Build a frontend message with type byte.
 * @param {number} type - Message type byte.
 * @param {Buffer} payload - Payload.
 * @return {Buffer}
 */
function buildFrontendMsg(type, payload) {
  const len = 4 + payload.length;
  const buf = Buffer.allocUnsafe(1 + len);
  buf[0] = type;
  buf.writeInt32BE(len, 1);
  payload.copy(buf, 5);
  return buf;
}

/**
 * Build a simple Query message.
 * @param {string} query - SQL query.
 * @return {Buffer}
 */
function buildQueryMsg(query) {
  const qLen = Buffer.byteLength(query, 'utf8') + 1;
  const payload = Buffer.allocUnsafe(qLen);
  payload.write(query, 0, 'utf8');
  payload[qLen - 1] = 0;
  return buildFrontendMsg(PG_FRONTEND_MSG.QUERY, payload);
}

/**
 * Build a Parse message.
 * @param {string} name - Statement name.
 * @param {string} query - SQL query.
 * @param {number[]} [paramTypes] - Parameter type OIDs.
 * @return {Buffer}
 */
function buildParseMsg(name, query, paramTypes = []) {
  const nameLen = Buffer.byteLength(name, 'utf8') + 1;
  const queryLen = Buffer.byteLength(query, 'utf8') + 1;
  const size = nameLen + queryLen + 2 + paramTypes.length * 4;
  const payload = Buffer.allocUnsafe(size);
  let off = 0;
  off += payload.write(name, off, 'utf8');
  payload[off++] = 0;
  off += payload.write(query, off, 'utf8');
  payload[off++] = 0;
  payload.writeInt16BE(paramTypes.length, off);
  off += 2;
  for (const t of paramTypes) {
    payload.writeInt32BE(t, off);
    off += 4;
  }
  return buildFrontendMsg(PG_FRONTEND_MSG.PARSE, payload);
}

/**
 * Build a Bind message.
 * @param {string} portal - Portal name.
 * @param {string} statement - Statement name.
 * @param {Array<string|null>} params - Parameter values.
 * @return {Buffer}
 */
function buildBindMsg(portal, statement, params = []) {
  const portalLen = Buffer.byteLength(portal, 'utf8') + 1;
  const stmtLen = Buffer.byteLength(statement, 'utf8') + 1;
  // format codes: 0 formats
  // params: count + values
  let paramSize = 0;
  for (const p of params) {
    if (p === null) {
      paramSize += 4;
    } else {
      paramSize += 4 + Buffer.byteLength(p, 'utf8');
    }
  }
  // portal + stmt + 2(numFormats) + 2(numParams) + paramSize
  // + 2(result format codes count)
  const size = portalLen + stmtLen + 2 + 2 + paramSize + 2;
  const payload = Buffer.allocUnsafe(size);
  let off = 0;
  off += payload.write(portal, off, 'utf8');
  payload[off++] = 0;
  off += payload.write(statement, off, 'utf8');
  payload[off++] = 0;
  payload.writeInt16BE(0, off); off += 2; // 0 format codes
  payload.writeInt16BE(params.length, off); off += 2;
  for (const p of params) {
    if (p === null) {
      payload.writeInt32BE(-1, off);
      off += 4;
    } else {
      const len = Buffer.byteLength(p, 'utf8');
      payload.writeInt32BE(len, off);
      off += 4;
      payload.write(p, off, 'utf8');
      off += len;
    }
  }
  payload.writeInt16BE(0, off); // 0 result format codes
  return buildFrontendMsg(PG_FRONTEND_MSG.BIND, payload);
}

/**
 * Build an Execute message.
 * @param {string} portal - Portal name.
 * @param {number} [maxRows] - Max rows (0 = unlimited).
 * @return {Buffer}
 */
function buildExecuteMsg(portal = '', maxRows = 0) {
  const portalLen = Buffer.byteLength(portal, 'utf8') + 1;
  const payload = Buffer.allocUnsafe(portalLen + 4);
  let off = 0;
  off += payload.write(portal, off, 'utf8');
  payload[off++] = 0;
  payload.writeInt32BE(maxRows, off);
  return buildFrontendMsg(PG_FRONTEND_MSG.EXECUTE, payload);
}

/**
 * Build a Sync message.
 * @return {Buffer}
 */
function buildSyncMsg() {
  return buildFrontendMsg(
    PG_FRONTEND_MSG.SYNC, Buffer.alloc(0),
  );
}

/**
 * Build a Describe message.
 * @param {number} type - 'S' or 'P'.
 * @param {string} name - Target name.
 * @return {Buffer}
 */
function buildDescribeMsg(type, name) {
  const nameLen = Buffer.byteLength(name, 'utf8') + 1;
  const payload = Buffer.allocUnsafe(1 + nameLen);
  payload[0] = type;
  payload.write(name, 1, 'utf8');
  payload[1 + nameLen - 1] = 0;
  return buildFrontendMsg(PG_FRONTEND_MSG.DESCRIBE, payload);
}

/**
 * Build a Close message.
 * @param {number} type - 'S' or 'P'.
 * @param {string} name - Target name.
 * @return {Buffer}
 */
function buildCloseMsg(type, name) {
  const nameLen = Buffer.byteLength(name, 'utf8') + 1;
  const payload = Buffer.allocUnsafe(1 + nameLen);
  payload[0] = type;
  payload.write(name, 1, 'utf8');
  payload[1 + nameLen - 1] = 0;
  return buildFrontendMsg(PG_FRONTEND_MSG.CLOSE, payload);
}

/**
 * Build a Terminate message.
 * @return {Buffer}
 */
function buildTerminateMsg() {
  return buildFrontendMsg(
    PG_FRONTEND_MSG.TERMINATE, Buffer.alloc(0),
  );
}

/**
 * Send startup + wait for handler to process.
 * @param {PgWireProtocolHandler} handler
 * @param {MockSocket} socket
 * @param {Object} [params]
 */
async function doStartup(handler, socket, params = {}) {
  const msg = buildStartupMessage({
    user: 'testuser',
    database: 'testdb',
    ...params,
  });
  socket.emit('data', msg);
  // Allow async _handleStartup to complete
  await new Promise((r) => setImmediate(r));
}

// --- Tests ---

describe('pgwire-protocol-handler', () => {
  describe('construction', () => {
    it('should throw when adapter is missing', () => {
      assert.throws(
        () => new PgWireProtocolHandler({socket: new MockSocket()}),
        (err) => err.message ===
          PG_HANDLER_ERROR.ADAPTER_REQUIRED,
      );
    });

    it('should throw when socket is missing', () => {
      assert.throws(
        () => new PgWireProtocolHandler({
          adapter: new MockAdapter(),
        }),
        (err) => err.message ===
          PG_HANDLER_ERROR.SOCKET_REQUIRED,
      );
    });

    it('should create handler with valid options', () => {
      const h = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket: new MockSocket(),
        logger: silentLogger,
      });
      assert.ok(h);
    });
  });

  describe('startup/auth handshake', () => {
    it('should complete startup handshake', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter();
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();

      await doStartup(handler, socket);

      // Should have written: AuthOk + ParameterStatus* +
      // BackendKeyData + ReadyForQuery
      const all = socket.allWritten();
      assert.ok(all.length > 0);

      // First message should be AuthenticationOk (R)
      assert.equal(all[0], PG_BACKEND_MSG.AUTH);
      const authPayload = all.readInt32BE(5);
      assert.equal(authPayload, PG_AUTH_TYPE.OK);

      // Should have a ReadyForQuery at the end
      const rfq = socket.findMessages(PG_BACKEND_MSG.READY_FOR_QUERY);
      assert.equal(rfq.length, 1);
      // Transaction state should be IDLE
      assert.equal(rfq[0][5], PG_TRANSACTION_STATE.IDLE);

      // Session should be created in adapter
      assert.equal(adapter.sessions.size, 1);

      handler.destroy();
    });

    it('should send ParameterStatus messages', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();

      await doStartup(handler, socket);

      const paramMsgs = socket.findMessages(
        PG_BACKEND_MSG.PARAMETER_STATUS,
      );
      assert.equal(
        paramMsgs.length,
        Object.keys(PG_SERVER_PARAMS).length,
      );

      handler.destroy();
    });

    it('should send BackendKeyData', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();

      await doStartup(handler, socket);

      const bkd = socket.findMessages(
        PG_BACKEND_MSG.BACKEND_KEY_DATA,
      );
      assert.equal(bkd.length, 1);

      handler.destroy();
    });

    it('should reject unsupported protocol version', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();

      // Send startup with wrong version
      const buf = Buffer.allocUnsafe(9);
      buf.writeInt32BE(9, 0);
      buf.writeInt32BE((2 << 16) | 0, 4); // version 2.0
      buf[8] = 0;
      socket.emit('data', buf);
      await new Promise((r) => setImmediate(r));

      const errors = socket.findMessages(
        PG_BACKEND_MSG.ERROR_RESPONSE,
      );
      assert.equal(errors.length, 1);
      assert.ok(socket.ended);

      handler.destroy();
    });

    it('should respond N to SSL request and continue', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();

      // Send SSL request
      const sslBuf = Buffer.allocUnsafe(8);
      sslBuf.writeInt32BE(8, 0);
      sslBuf.writeInt32BE(PG_SSL_REQUEST_CODE, 4);
      socket.emit('data', sslBuf);
      await new Promise((r) => setImmediate(r));

      // Should have written 'N'
      assert.equal(socket.written[0][0], PG_SSL_RESPONSE.UNSUPPORTED);
      socket.written = [];

      // Now send real startup
      await doStartup(handler, socket);

      const rfq = socket.findMessages(
        PG_BACKEND_MSG.READY_FOR_QUERY,
      );
      assert.equal(rfq.length, 1);

      handler.destroy();
    });

    it('should send error on auth failure', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter({
        authError: 'bad credentials',
      });
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();

      await doStartup(handler, socket);

      const errors = socket.findMessages(
        PG_BACKEND_MSG.ERROR_RESPONSE,
      );
      assert.equal(errors.length, 1);
      assert.ok(socket.ended);

      handler.destroy();
    });
  });

  describe('simple query protocol', () => {
    it('should execute a SELECT and return results', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter({
        execResult: {
          rows: [{id: 1, name: 'alice'}],
          columns: ['id', 'name'],
        },
      });
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);
      socket.written = [];

      socket.emit('data', buildQueryMsg('SELECT * FROM users'));
      await new Promise((r) => setImmediate(r));

      // Should have: RowDescription + DataRow + CommandComplete
      // + ReadyForQuery
      const rowDesc = socket.findMessages(
        PG_BACKEND_MSG.ROW_DESCRIPTION,
      );
      assert.equal(rowDesc.length, 1);

      const dataRows = socket.findMessages(PG_BACKEND_MSG.DATA_ROW);
      assert.equal(dataRows.length, 1);

      const cmdComplete = socket.findMessages(
        PG_BACKEND_MSG.COMMAND_COMPLETE,
      );
      assert.equal(cmdComplete.length, 1);

      const rfq = socket.findMessages(
        PG_BACKEND_MSG.READY_FOR_QUERY,
      );
      assert.equal(rfq.length, 1);

      assert.equal(adapter.executions.length, 1);
      assert.equal(
        adapter.executions[0].sql, 'SELECT * FROM users',
      );

      handler.destroy();
    });

    it('should handle empty query', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);
      socket.written = [];

      socket.emit('data', buildQueryMsg(''));
      await new Promise((r) => setImmediate(r));

      const empty = socket.findMessages(PG_BACKEND_MSG.EMPTY_QUERY);
      assert.equal(empty.length, 1);

      const rfq = socket.findMessages(
        PG_BACKEND_MSG.READY_FOR_QUERY,
      );
      assert.equal(rfq.length, 1);

      handler.destroy();
    });

    it('should handle whitespace-only query', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);
      socket.written = [];

      socket.emit('data', buildQueryMsg('   '));
      await new Promise((r) => setImmediate(r));

      const empty = socket.findMessages(PG_BACKEND_MSG.EMPTY_QUERY);
      assert.equal(empty.length, 1);

      handler.destroy();
    });

    it('should send error on execution failure', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter({
        execError: 'syntax error at position 1',
      });
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);
      socket.written = [];

      socket.emit('data', buildQueryMsg('INVALID SQL'));
      await new Promise((r) => setImmediate(r));

      const errors = socket.findMessages(
        PG_BACKEND_MSG.ERROR_RESPONSE,
      );
      assert.equal(errors.length, 1);

      // Should still send ReadyForQuery after error
      const rfq = socket.findMessages(
        PG_BACKEND_MSG.READY_FOR_QUERY,
      );
      assert.equal(rfq.length, 1);

      handler.destroy();
    });

    it('should handle INSERT result', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter({
        execResult: {changes: 3},
      });
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);
      socket.written = [];

      socket.emit('data', buildQueryMsg(
        'INSERT INTO t VALUES (1)',
      ));
      await new Promise((r) => setImmediate(r));

      const cmd = socket.findMessages(
        PG_BACKEND_MSG.COMMAND_COMPLETE,
      );
      assert.equal(cmd.length, 1);

      handler.destroy();
    });
  });

  describe('extended query protocol', () => {
    it('should handle Parse/Bind/Execute/Sync flow', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter({
        execResult: {
          rows: [{val: 42}],
          columns: ['val'],
        },
      });
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);
      socket.written = [];

      // Parse
      socket.emit('data', buildParseMsg('', 'SELECT $1'));
      await new Promise((r) => setImmediate(r));
      const pc = socket.findMessages(PG_BACKEND_MSG.PARSE_COMPLETE);
      assert.equal(pc.length, 1);

      socket.written = [];

      // Bind
      socket.emit('data', buildBindMsg('', '', ['42']));
      await new Promise((r) => setImmediate(r));
      const bc = socket.findMessages(PG_BACKEND_MSG.BIND_COMPLETE);
      assert.equal(bc.length, 1);

      socket.written = [];

      // Execute
      socket.emit('data', buildExecuteMsg(''));
      await new Promise((r) => setImmediate(r));

      const dataRows = socket.findMessages(PG_BACKEND_MSG.DATA_ROW);
      assert.equal(dataRows.length, 1);

      socket.written = [];

      // Sync
      socket.emit('data', buildSyncMsg());
      await new Promise((r) => setImmediate(r));

      const rfq = socket.findMessages(
        PG_BACKEND_MSG.READY_FOR_QUERY,
      );
      assert.equal(rfq.length, 1);

      // Verify adapter received the query with params
      assert.equal(adapter.executions.length, 1);
      assert.equal(adapter.executions[0].sql, 'SELECT $1');
      assert.deepStrictEqual(adapter.executions[0].params, ['42']);

      handler.destroy();
    });

    it('should handle named prepared statements', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter({
        execResult: {rows: [], columns: []},
      });
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);
      socket.written = [];

      // Parse with name
      socket.emit('data', buildParseMsg('s1', 'SELECT 1'));
      await new Promise((r) => setImmediate(r));

      // Bind to named statement
      socket.emit('data', buildBindMsg('', 's1', []));
      await new Promise((r) => setImmediate(r));

      // Execute
      socket.emit('data', buildExecuteMsg(''));
      await new Promise((r) => setImmediate(r));

      assert.equal(adapter.executions.length, 1);
      assert.equal(adapter.executions[0].sql, 'SELECT 1');

      handler.destroy();
    });

    it('should error on bind to non-existent statement',
      async () => {
        const socket = new MockSocket();
        const handler = new PgWireProtocolHandler({
          adapter: new MockAdapter(),
          socket,
          logger: silentLogger,
        });
        handler.start();
        await doStartup(handler, socket);
        socket.written = [];

        socket.emit('data', buildBindMsg('', 'missing', []));
        await new Promise((r) => setImmediate(r));

        const errors = socket.findMessages(
          PG_BACKEND_MSG.ERROR_RESPONSE,
        );
        assert.equal(errors.length, 1);

        handler.destroy();
      });

    it('should error on execute with non-existent portal',
      async () => {
        const socket = new MockSocket();
        const handler = new PgWireProtocolHandler({
          adapter: new MockAdapter(),
          socket,
          logger: silentLogger,
        });
        handler.start();
        await doStartup(handler, socket);
        socket.written = [];

        socket.emit('data', buildExecuteMsg('missing'));
        await new Promise((r) => setImmediate(r));

        const errors = socket.findMessages(
          PG_BACKEND_MSG.ERROR_RESPONSE,
        );
        assert.equal(errors.length, 1);

        handler.destroy();
      });

    it('should handle Describe for statement', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);

      socket.emit('data', buildParseMsg('', 'SELECT 1'));
      await new Promise((r) => setImmediate(r));
      socket.written = [];

      socket.emit('data', buildDescribeMsg(
        PG_DESCRIBE_TYPE.STATEMENT, '',
      ));
      await new Promise((r) => setImmediate(r));

      const noData = socket.findMessages(PG_BACKEND_MSG.NO_DATA);
      assert.equal(noData.length, 1);

      handler.destroy();
    });

    it('should handle Close for statement', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);

      socket.emit('data', buildParseMsg('s1', 'SELECT 1'));
      await new Promise((r) => setImmediate(r));
      socket.written = [];

      socket.emit('data', buildCloseMsg(
        PG_CLOSE_TYPE.STATEMENT, 's1',
      ));
      await new Promise((r) => setImmediate(r));

      const cc = socket.findMessages(
        PG_BACKEND_MSG.CLOSE_COMPLETE,
      );
      assert.equal(cc.length, 1);

      // Statement should be gone
      const session = handler.getSession();
      assert.equal(session.getPreparedStatement('s1'), null);

      handler.destroy();
    });
  });

  describe('transaction state tracking', () => {
    it('should track BEGIN/COMMIT state', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter({
        execResult: {rows: []},
      });
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);

      // BEGIN
      socket.written = [];
      socket.emit('data', buildQueryMsg('BEGIN'));
      await new Promise((r) => setImmediate(r));

      let rfq = socket.findMessages(
        PG_BACKEND_MSG.READY_FOR_QUERY,
      );
      assert.equal(rfq[0][5], PG_TRANSACTION_STATE.IN_TRANSACTION);

      // COMMIT
      socket.written = [];
      socket.emit('data', buildQueryMsg('COMMIT'));
      await new Promise((r) => setImmediate(r));

      rfq = socket.findMessages(PG_BACKEND_MSG.READY_FOR_QUERY);
      assert.equal(rfq[0][5], PG_TRANSACTION_STATE.IDLE);

      handler.destroy();
    });

    it('should mark failed transaction on error', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter({
        execResult: {rows: []},
      });
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);

      // BEGIN
      socket.emit('data', buildQueryMsg('BEGIN'));
      await new Promise((r) => setImmediate(r));

      // Cause error in transaction
      adapter.execError = 'some error';
      socket.written = [];
      socket.emit('data', buildQueryMsg('SELECT bad'));
      await new Promise((r) => setImmediate(r));

      const rfq = socket.findMessages(
        PG_BACKEND_MSG.READY_FOR_QUERY,
      );
      assert.equal(rfq[0][5], PG_TRANSACTION_STATE.FAILED);

      handler.destroy();
    });

    it('should reject queries in failed transaction except ROLLBACK',
      async () => {
        const socket = new MockSocket();
        const adapter = new MockAdapter({
          execResult: {rows: []},
        });
        const handler = new PgWireProtocolHandler({
          adapter, socket, logger: silentLogger,
        });
        handler.start();
        await doStartup(handler, socket);

        // BEGIN
        socket.emit('data', buildQueryMsg('BEGIN'));
        await new Promise((r) => setImmediate(r));

        // Cause error
        adapter.execError = 'error';
        socket.emit('data', buildQueryMsg('SELECT 1'));
        await new Promise((r) => setImmediate(r));

        // Try another query - should be rejected
        adapter.execError = null;
        socket.written = [];
        socket.emit('data', buildQueryMsg('SELECT 2'));
        await new Promise((r) => setImmediate(r));

        const errors = socket.findMessages(
          PG_BACKEND_MSG.ERROR_RESPONSE,
        );
        assert.equal(errors.length, 1);
        // Should not have executed
        assert.equal(adapter.executions.length, 2);

        // ROLLBACK should work
        socket.written = [];
        socket.emit('data', buildQueryMsg('ROLLBACK'));
        await new Promise((r) => setImmediate(r));

        const rfq = socket.findMessages(
          PG_BACKEND_MSG.READY_FOR_QUERY,
        );
        assert.equal(rfq[0][5], PG_TRANSACTION_STATE.IDLE);

        handler.destroy();
      });
  });

  describe('terminate and cleanup', () => {
    it('should handle Terminate message', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter();
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);

      socket.emit('data', buildTerminateMsg());
      await new Promise((r) => setImmediate(r));

      assert.ok(socket.ended);
      assert.equal(adapter.sessions.size, 0);
    });

    it('should clean up on socket close', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter();
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);

      socket.emit('close');
      await new Promise((r) => setImmediate(r));

      assert.equal(adapter.sessions.size, 0);
    });

    it('should clean up on socket error', async () => {
      const socket = new MockSocket();
      const adapter = new MockAdapter();
      const handler = new PgWireProtocolHandler({
        adapter, socket, logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);

      socket.emit('error', new Error('connection reset'));
      await new Promise((r) => setImmediate(r));

      assert.equal(adapter.sessions.size, 0);
    });

    it('should be idempotent on destroy', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);

      handler.destroy();
      handler.destroy(); // second call should not throw
    });
  });

  describe('unsupported features', () => {
    it('should send error for unknown message type', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);
      socket.written = [];

      // Send unknown message type 0xFF
      const payload = Buffer.alloc(0);
      const msg = buildFrontendMsg(0xFF, payload);
      socket.emit('data', msg);
      await new Promise((r) => setImmediate(r));

      const errors = socket.findMessages(
        PG_BACKEND_MSG.ERROR_RESPONSE,
      );
      assert.equal(errors.length, 1);

      handler.destroy();
    });

    it('should handle Flush as no-op', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();
      await doStartup(handler, socket);
      socket.written = [];

      const msg = buildFrontendMsg(
        PG_FRONTEND_MSG.FLUSH, Buffer.alloc(0),
      );
      socket.emit('data', msg);
      await new Promise((r) => setImmediate(r));

      // No error should be sent
      const errors = socket.findMessages(
        PG_BACKEND_MSG.ERROR_RESPONSE,
      );
      assert.equal(errors.length, 0);

      handler.destroy();
    });
  });

  describe('message builders', () => {
    it('buildAuthOk should produce valid message', () => {
      const msg = buildAuthOk();
      assert.equal(msg[0], PG_BACKEND_MSG.AUTH);
      const len = msg.readInt32BE(1);
      assert.equal(msg.length, 1 + len);
      assert.equal(msg.readInt32BE(5), PG_AUTH_TYPE.OK);
    });

    it('buildParameterStatus should encode name and value', () => {
      const msg = buildParameterStatus('server_version', '15.0');
      assert.equal(msg[0], PG_BACKEND_MSG.PARAMETER_STATUS);
      const payload = msg.subarray(5);
      const name = readCString(payload, 0);
      assert.equal(name.value, 'server_version');
      const val = readCString(payload, name.nextOffset);
      assert.equal(val.value, '15.0');
    });

    it('buildReadyForQuery should encode transaction state', () => {
      const msg = buildReadyForQuery(PG_TRANSACTION_STATE.IDLE);
      assert.equal(msg[0], PG_BACKEND_MSG.READY_FOR_QUERY);
      assert.equal(msg[5], PG_TRANSACTION_STATE.IDLE);
    });

    it('buildErrorResponse should encode fields', () => {
      const msg = buildErrorResponse(
        PG_SEVERITY.ERROR,
        PG_ERROR_CODE.SYNTAX_ERROR,
        'bad query',
      );
      assert.equal(msg[0], PG_BACKEND_MSG.ERROR_RESPONSE);
      // Should contain the message text
      assert.ok(msg.includes(Buffer.from('bad query')));
    });

    it('buildRowDescription should encode columns', () => {
      const msg = buildRowDescription([
        {name: 'id'}, {name: 'name'},
      ]);
      assert.equal(msg[0], PG_BACKEND_MSG.ROW_DESCRIPTION);
      const colCount = msg.readInt16BE(5);
      assert.equal(colCount, 2);
    });

    it('buildDataRow should encode values', () => {
      const msg = buildDataRow(['hello', null, '42']);
      assert.equal(msg[0], PG_BACKEND_MSG.DATA_ROW);
      const colCount = msg.readInt16BE(5);
      assert.equal(colCount, 3);
    });

    it('buildCommandComplete should encode tag', () => {
      const msg = buildCommandComplete('SELECT 5');
      assert.equal(msg[0], PG_BACKEND_MSG.COMMAND_COMPLETE);
      const payload = msg.subarray(5);
      const tag = readCString(payload, 0);
      assert.equal(tag.value, 'SELECT 5');
    });

    it('buildParseComplete should produce valid message', () => {
      const msg = buildParseComplete();
      assert.equal(msg[0], PG_BACKEND_MSG.PARSE_COMPLETE);
    });

    it('buildBindComplete should produce valid message', () => {
      const msg = buildBindComplete();
      assert.equal(msg[0], PG_BACKEND_MSG.BIND_COMPLETE);
    });

    it('buildCloseComplete should produce valid message', () => {
      const msg = buildCloseComplete();
      assert.equal(msg[0], PG_BACKEND_MSG.CLOSE_COMPLETE);
    });

    it('buildNoData should produce valid message', () => {
      const msg = buildNoData();
      assert.equal(msg[0], PG_BACKEND_MSG.NO_DATA);
    });

    it('buildEmptyQueryResponse should produce valid message', () => {
      const msg = buildEmptyQueryResponse();
      assert.equal(msg[0], PG_BACKEND_MSG.EMPTY_QUERY);
    });
  });

  describe('message parsers', () => {
    it('parseStartupParams should extract key-value pairs', () => {
      const buf = Buffer.from(
        'user\0alice\0database\0mydb\0\0',
      );
      const params = parseStartupParams(buf);
      assert.equal(params.user, 'alice');
      assert.equal(params.database, 'mydb');
    });

    it('parseQueryMessage should extract query string', () => {
      const buf = Buffer.from('SELECT 1\0');
      const {query} = parseQueryMessage(buf);
      assert.equal(query, 'SELECT 1');
    });

    it('parseParseMessage should extract name, query, types', () => {
      // name\0query\0numParams(2 bytes) + type OIDs
      const name = 'stmt1';
      const query = 'SELECT $1';
      const nameLen = Buffer.byteLength(name) + 1;
      const queryLen = Buffer.byteLength(query) + 1;
      const buf = Buffer.allocUnsafe(nameLen + queryLen + 2 + 4);
      let off = 0;
      off += buf.write(name, off);
      buf[off++] = 0;
      off += buf.write(query, off);
      buf[off++] = 0;
      buf.writeInt16BE(1, off); off += 2;
      buf.writeInt32BE(23, off); // int4 OID

      const result = parseParseMessage(buf);
      assert.equal(result.name, 'stmt1');
      assert.equal(result.query, 'SELECT $1');
      assert.deepStrictEqual(result.paramTypes, [23]);
    });

    it('parseBindMessage should extract portal, stmt, params',
      () => {
        const portalLen = 1; // just null byte
        const stmtLen = 1;
        // 0 format codes, 1 param with value 'hi'
        const paramVal = 'hi';
        const paramLen = Buffer.byteLength(paramVal);
        const size = portalLen + stmtLen + 2 + 2 + 4 + paramLen;
        const buf = Buffer.allocUnsafe(size);
        let off = 0;
        buf[off++] = 0; // portal
        buf[off++] = 0; // statement
        buf.writeInt16BE(0, off); off += 2; // 0 format codes
        buf.writeInt16BE(1, off); off += 2; // 1 param
        buf.writeInt32BE(paramLen, off); off += 4;
        buf.write(paramVal, off);

        const result = parseBindMessage(buf);
        assert.equal(result.portal, '');
        assert.equal(result.statement, '');
        assert.deepStrictEqual(result.params, ['hi']);
      });

    it('parseBindMessage should handle null params', () => {
      const buf = Buffer.allocUnsafe(1 + 1 + 2 + 2 + 4);
      let off = 0;
      buf[off++] = 0; // portal
      buf[off++] = 0; // statement
      buf.writeInt16BE(0, off); off += 2;
      buf.writeInt16BE(1, off); off += 2;
      buf.writeInt32BE(-1, off); // NULL

      const result = parseBindMessage(buf);
      assert.deepStrictEqual(result.params, [null]);
    });

    it('parseDescribeMessage should extract type and name', () => {
      const buf = Buffer.from([PG_DESCRIBE_TYPE.STATEMENT,
        ...Buffer.from('s1\0')]);
      const result = parseDescribeMessage(buf);
      assert.equal(result.type, PG_DESCRIBE_TYPE.STATEMENT);
      assert.equal(result.name, 's1');
    });

    it('parseExecuteMessage should extract portal and maxRows',
      () => {
        const buf = Buffer.allocUnsafe(1 + 4);
        buf[0] = 0; // unnamed portal
        buf.writeInt32BE(100, 1);
        const result = parseExecuteMessage(buf);
        assert.equal(result.portal, '');
        assert.equal(result.maxRows, 100);
      });

    it('parseCloseMessage should extract type and name', () => {
      const buf = Buffer.from([PG_CLOSE_TYPE.PORTAL,
        ...Buffer.from('p1\0')]);
      const result = parseCloseMessage(buf);
      assert.equal(result.type, PG_CLOSE_TYPE.PORTAL);
      assert.equal(result.name, 'p1');
    });
  });

  describe('helper functions', () => {
    it('writeCString and readCString should round-trip', () => {
      const buf = Buffer.allocUnsafe(20);
      const end = writeCString(buf, 'hello', 0);
      assert.equal(end, 6);
      const {value, nextOffset} = readCString(buf, 0);
      assert.equal(value, 'hello');
      assert.equal(nextOffset, 6);
    });

    it('readCString should handle missing null terminator', () => {
      const buf = Buffer.from('abc');
      const {value, nextOffset} = readCString(buf, 0);
      assert.equal(value, '');
      assert.equal(nextOffset, buf.length);
    });

    it('deriveCommandTag should handle SELECT', () => {
      assert.equal(
        deriveCommandTag({rows: [{a: 1}, {a: 2}]}, 'SELECT 1'),
        'SELECT 2',
      );
    });

    it('deriveCommandTag should handle INSERT', () => {
      assert.equal(
        deriveCommandTag({changes: 5}, 'INSERT INTO t VALUES(1)'),
        'INSERT 0 5',
      );
    });

    it('deriveCommandTag should handle UPDATE', () => {
      assert.equal(
        deriveCommandTag({changes: 3}, 'UPDATE t SET x=1'),
        'UPDATE 3',
      );
    });

    it('deriveCommandTag should handle DELETE', () => {
      assert.equal(
        deriveCommandTag({changes: 1}, 'DELETE FROM t'),
        'DELETE 1',
      );
    });

    it('deriveCommandTag should handle CREATE', () => {
      assert.equal(
        deriveCommandTag({}, 'CREATE TABLE t (id INT)'),
        'CREATE TABLE',
      );
    });

    it('deriveCommandTag should handle BEGIN/COMMIT/ROLLBACK',
      () => {
        assert.equal(deriveCommandTag({}, 'BEGIN'), 'BEGIN');
        assert.equal(deriveCommandTag({}, 'COMMIT'), 'COMMIT');
        assert.equal(deriveCommandTag({}, 'ROLLBACK'), 'ROLLBACK');
      });

    it('deriveCommandTag should default to OK', () => {
      assert.equal(deriveCommandTag({}, 'VACUUM'), 'OK');
    });

    it('extractColumns from columns array', () => {
      const cols = extractColumns({columns: ['a', 'b']});
      assert.deepStrictEqual(cols, [{name: 'a'}, {name: 'b'}]);
    });

    it('extractColumns from rows keys', () => {
      const cols = extractColumns({rows: [{x: 1, y: 2}]});
      assert.deepStrictEqual(cols, [{name: 'x'}, {name: 'y'}]);
    });

    it('extractColumns returns empty for no data', () => {
      assert.deepStrictEqual(extractColumns({}), []);
      assert.deepStrictEqual(extractColumns(null), []);
    });

    it('extractRowValues from object row', () => {
      const vals = extractRowValues(
        {a: 1, b: 'hi'},
        [{name: 'a'}, {name: 'b'}],
      );
      assert.deepStrictEqual(vals, [1, 'hi']);
    });

    it('extractRowValues from array row', () => {
      const vals = extractRowValues(
        [1, null, 'x'],
        [{name: 'a'}, {name: 'b'}, {name: 'c'}],
      );
      assert.deepStrictEqual(vals, [1, null, 'x']);
    });

    it('extractRowValues handles missing keys', () => {
      const vals = extractRowValues(
        {a: 1},
        [{name: 'a'}, {name: 'b'}],
      );
      assert.deepStrictEqual(vals, [1, null]);
    });
  });

  describe('buffer fragmentation', () => {
    it('should handle startup split across chunks', async () => {
      const socket = new MockSocket();
      const handler = new PgWireProtocolHandler({
        adapter: new MockAdapter(),
        socket,
        logger: silentLogger,
      });
      handler.start();

      const msg = buildStartupMessage({
        user: 'test', database: 'db',
      });
      // Split in half
      const mid = Math.floor(msg.length / 2);
      socket.emit('data', msg.subarray(0, mid));
      await new Promise((r) => setImmediate(r));

      // No messages yet (incomplete)
      assert.equal(socket.written.length, 0);

      socket.emit('data', msg.subarray(mid));
      await new Promise((r) => setImmediate(r));

      // Now should have completed startup
      const rfq = socket.findMessages(
        PG_BACKEND_MSG.READY_FOR_QUERY,
      );
      assert.equal(rfq.length, 1);

      handler.destroy();
    });

    it('should handle multiple messages in one chunk',
      async () => {
        const socket = new MockSocket();
        const adapter = new MockAdapter({
          execResult: {rows: [], columns: []},
        });
        const handler = new PgWireProtocolHandler({
          adapter, socket, logger: silentLogger,
        });
        handler.start();
        await doStartup(handler, socket);
        socket.written = [];

        // Send Parse + Bind + Execute + Sync in one chunk
        const combined = Buffer.concat([
          buildParseMsg('', 'SELECT 1'),
          buildBindMsg('', '', []),
          buildExecuteMsg(''),
          buildSyncMsg(),
        ]);
        socket.emit('data', combined);
        await new Promise((r) => setImmediate(r));

        assert.equal(adapter.executions.length, 1);

        const rfq = socket.findMessages(
          PG_BACKEND_MSG.READY_FOR_QUERY,
        );
        assert.equal(rfq.length, 1);

        handler.destroy();
      });
  });

  describe('constants', () => {
    it('should export frozen PG_PROTOCOL_VERSION', () => {
      assert.ok(Object.isFrozen(PG_PROTOCOL_VERSION));
      assert.equal(PG_PROTOCOL_VERSION.CODE, (3 << 16) | 0);
    });

    it('should export frozen PG_FRONTEND_MSG', () => {
      assert.ok(Object.isFrozen(PG_FRONTEND_MSG));
      assert.equal(PG_FRONTEND_MSG.QUERY, 0x51);
    });

    it('should export frozen PG_BACKEND_MSG', () => {
      assert.ok(Object.isFrozen(PG_BACKEND_MSG));
      assert.equal(PG_BACKEND_MSG.AUTH, 0x52);
    });

    it('should export frozen PG_HANDLER_ERROR', () => {
      assert.ok(Object.isFrozen(PG_HANDLER_ERROR));
    });

    it('should export HANDLER_PHASE', () => {
      assert.ok(Object.isFrozen(HANDLER_PHASE));
      assert.equal(HANDLER_PHASE.STARTUP, 'startup');
      assert.equal(HANDLER_PHASE.NORMAL, 'normal');
      assert.equal(HANDLER_PHASE.CLOSED, 'closed');
    });
  });
});
