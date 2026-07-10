import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PgWireProtocolHandler} from
  '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_BACKEND_MSG,
  PG_BUFFER_LIMIT,
  PG_DESCRIBE_TYPE,
  PG_FRONTEND_MSG,
  PG_PROTOCOL_VERSION,
} from '../../src/runtime/pgwire-protocol-constants.js';

const silentLogger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.written = [];
    this.ended = false;
  }
  write(buffer) {
    this.written.push(Buffer.from(buffer));
    return true;
  }
  end() {
    this.ended = true;
  }
  findMessages(type) {
    return this.written.filter((message) => message[0] === type);
  }
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

function startupMessage() {
  const payload = Buffer.concat([
    int32(PG_PROTOCOL_VERSION.CODE),
    cstring('user'),
    cstring('test-user'),
    cstring('database'),
    cstring('test-database'),
    Buffer.from([0]),
  ]);
  return Buffer.concat([int32(payload.length + 4), payload]);
}

function extendedQueryMessages() {
  return Buffer.concat([
    frontendMessage(PG_FRONTEND_MSG.PARSE, [
      cstring(''), cstring('SELECT $1'), int16(0),
    ]),
    frontendMessage(PG_FRONTEND_MSG.BIND, [
      cstring(''), cstring(''), int16(0), int16(1),
      int32(1), Buffer.from('1'), int16(0),
    ]),
    frontendMessage(PG_FRONTEND_MSG.DESCRIBE, [
      Buffer.from([PG_DESCRIBE_TYPE.PORTAL]), cstring(''),
    ]),
    frontendMessage(PG_FRONTEND_MSG.EXECUTE, [cstring(''), int32(0)]),
    frontendMessage(PG_FRONTEND_MSG.SYNC),
  ]);
}

async function authenticate(handler, socket) {
  socket.emit('data', startupMessage());
  await handler._processing;
  socket.written = [];
}

describe('pgwire protocol ordering and framing', () => {
  it('serializes Execute before Sync in one frontend chunk', async () => {
    const socket = new MockSocket();
    let releaseExecution;
    const executionGate = new Promise((resolve) => {
      releaseExecution = resolve;
    });
    const adapter = {
      async authenticate() {},
      async execute() {
        await executionGate;
        return {success: true, rows: [{value: 1}], columns: ['value']};
      },
      closeSession() {},
    };
    const handler = new PgWireProtocolHandler({
      adapter, socket, logger: silentLogger,
    });
    handler.start();
    await authenticate(handler, socket);

    socket.emit('data', extendedQueryMessages());
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      socket.findMessages(PG_BACKEND_MSG.READY_FOR_QUERY).length,
      0,
    );

    releaseExecution();
    await handler._processing;
    assert.equal(socket.written.at(-1)[0], PG_BACKEND_MSG.READY_FOR_QUERY);
    handler.destroy();
  });

  it('rejects invalid frontend message lengths', async () => {
    const socket = new MockSocket();
    const handler = new PgWireProtocolHandler({
      adapter: {
        async authenticate() {},
        closeSession() {},
      },
      socket,
      logger: silentLogger,
    });
    handler.start();
    await authenticate(handler, socket);
    const invalid = Buffer.alloc(PG_BUFFER_LIMIT.MSG_HEADER_SIZE);
    invalid[0] = PG_FRONTEND_MSG.QUERY;
    invalid.writeInt32BE(3, 1);

    socket.emit('data', invalid);
    await handler._processing;

    assert.equal(socket.ended, true);
    assert.equal(
      socket.findMessages(PG_BACKEND_MSG.ERROR_RESPONSE).length,
      1,
    );
  });
});
