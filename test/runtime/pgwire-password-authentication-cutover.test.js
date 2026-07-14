import {after, before, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';

import Database from 'better-sqlite3';
import pg from 'pg';

import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  META_SERVICE_ID,
  META_SERVICE_RUNTIME_REF,
} from '../../src/constants/wasm-meta.js';
import {isSqlRequest} from '../../src/query/sql-request.js';
import {PostgresWireRuntimeModule} from
  '../../src/runtime/pgwire-runtime-module.js';
import {
  PGWIRE_CREDENTIAL_CONFIG_ERROR,
  buildPgwireCredentialVerifier,
  credentialTupleMatches,
} from '../../src/runtime/pgwire-credential-verifier.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';
import {PgWireProtocolHandler} from
  '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_AUTH_TYPE,
  PG_FRONTEND_MSG,
  PG_PROTOCOL_VERSION,
} from '../../src/runtime/pgwire-protocol-constants.js';

const HOST = '127.0.0.1';
const DATABASE = 'portable_app';
const USER = 'portable_app';
const PASSWORD = 'correct-horse-battery-staple';
const WRONG_PASSWORD = 'wrong-password';
const silentLogger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function createExecutor(database, observedRequests) {
  return async (request) => {
    assert.equal(isSqlRequest(request), true);
    observedRequests.push(request);
    const prepared = database.prepare(request.statement);
    return {
      success: true,
      rows: prepared.all(...request.parameters),
      columns: prepared.columns().map((column) => column.name),
    };
  };
}

function createClient(port, password, overrides = {}) {
  return new pg.Client({
    host: HOST,
    port,
    database: DATABASE,
    user: USER,
    password,
    ssl: false,
    connectionTimeoutMillis: 1000,
    ...overrides,
  });
}

function buildStartupMessage() {
  const parameters = Buffer.from(
    `user\0${USER}\0database\0${DATABASE}\0\0`,
    'utf8',
  );
  const message = Buffer.alloc(8 + parameters.length);
  message.writeInt32BE(message.length, 0);
  message.writeInt32BE(PG_PROTOCOL_VERSION.CODE, 4);
  parameters.copy(message, 8);
  return message;
}

function buildPasswordMessage(password, terminated = true) {
  const value = Buffer.from(`${password}${terminated ? '\0' : ''}`, 'utf8');
  const message = Buffer.alloc(5 + value.length);
  message[0] = PG_FRONTEND_MSG.PASSWORD;
  message.writeInt32BE(4 + value.length, 1);
  value.copy(message, 5);
  return message;
}

function settleProtocol() {
  return new Promise((resolve) => setImmediate(resolve));
}

class ProtocolSocket extends EventEmitter {
  constructor() {
    super();
    this.written = [];
    this.ended = false;
  }

  write(value) {
    this.written.push(Buffer.from(value));
    return true;
  }

  end() {
    this.ended = true;
  }
}

class ProtocolAdapter {
  constructor(beforeSuccess = null) {
    this.beforeSuccess = beforeSuccess;
    this.sessions = new Map();
    this.authenticateCalls = [];
  }

  async authenticate(sessionId, credentials) {
    this.authenticateCalls.push({sessionId, credentials});
    if (this.beforeSuccess) await this.beforeSuccess();
    this.sessions.set(sessionId, credentials);
    return {sessionId, tenantId: credentials.tenantId};
  }

  closeSession(sessionId) {
    this.sessions.delete(sessionId);
  }
}

describe('pgwire password authentication cutover', () => {
  const sqlite = new Database(':memory:');
  const observedRequests = [];
  const wiring = createRuntimeStartupWiring({
    pgwireCredentialEnv: {
      PGWIRE_AUTH_USER: USER,
      PGWIRE_AUTH_PASSWORD: PASSWORD,
      PGWIRE_AUTH_DATABASE: DATABASE,
    },
  });
  const runtime = wiring.serviceRuntimeLifecycle;
  const definition = {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeKind: RUNTIME_KIND.NATIVE_JS,
    runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
    runtimeConfig: JSON.stringify({
      host: HOST,
      authMode: 'password',
      tlsMode: 'disable',
    }),
  };
  let port;

  before(async () => {
    const unconfigured = new PostgresWireRuntimeModule({logger: silentLogger});
    const directPrepared = await unconfigured.prepare(definition);
    assert.equal(directPrepared.status, 'ready');
    const missingVerifier = await unconfigured.start({
      serviceId: META_SERVICE_ID.POSTGRES_WIRE,
      host: HOST,
      port: 0,
      sqlRequestExecutor: createExecutor(sqlite, []),
    });
    assert.equal(missingVerifier.status, 'failed');
    assert.match(missingVerifier.error, /credential verifier/iu);

    runtime.setQueryExecutorFactory(() => ({
      executeRequest: createExecutor(sqlite, observedRequests),
    }));
    const prepared = await runtime.prepare(definition, {nodeId: 'node-a'});
    assert.equal(prepared.status, 'ready');

    const started = await runtime.start({
      ...definition,
      host: HOST,
      port: 0,
    });
    assert.equal(started.status, 'running');
    port = started.endpointIntent.port;
  });

  after(async () => {
    await runtime.stop({...definition, host: HOST, port});
    sqlite.close();
  });

  it('accepts correct credentials before executing a real pg query', async () => {
    const client = createClient(port, PASSWORD);
    await client.connect();
    try {
      const result = await client.query('SELECT 42 AS answer');
      assert.deepEqual(result.rows, [{answer: '42'}]);
    } finally {
      await client.end();
    }

    assert.equal(observedRequests.length, 1);
    assert.equal(observedRequests[0].tenantId, DATABASE);
  });

  it('rejects a wrong password before a SQL request exists', async () => {
    const requestsBefore = observedRequests.length;
    const client = createClient(port, WRONG_PASSWORD);

    await assert.rejects(client.connect(), /Authentication failed/iu);
    assert.equal(observedRequests.length, requestsBefore);
  });

  it('rejects wrong user and database identities before SQL', async () => {
    const requestsBefore = observedRequests.length;
    for (const overrides of [
      {user: 'wrong-user'},
      {database: 'wrong-database'},
    ]) {
      const client = createClient(port, PASSWORD, overrides);
      await assert.rejects(client.connect(), /Authentication failed/iu);
    }
    assert.equal(observedRequests.length, requestsBefore);
  });

  it('keeps password material out of the runtime descriptor', () => {
    const parsed = JSON.parse(definition.runtimeConfig);

    assert.equal(parsed.authMode, 'password');
    assert.equal(Object.hasOwn(parsed, 'password'), false);
    assert.equal(Object.hasOwn(parsed, 'credentials'), false);
  });
});

describe('pgwire password protocol framing and disconnect safety', () => {
  function createHandler(adapter, socket) {
    const handler = new PgWireProtocolHandler({
      adapter,
      socket,
      authMode: 'password',
      logger: silentLogger,
    });
    handler.start();
    return handler;
  }

  it('processes coalesced startup and PasswordMessage bytes', async () => {
    const adapter = new ProtocolAdapter();
    const socket = new ProtocolSocket();
    const handler = createHandler(adapter, socket);

    socket.emit('data', Buffer.concat([
      buildStartupMessage(),
      buildPasswordMessage(PASSWORD),
    ]));
    await settleProtocol();

    assert.equal(adapter.authenticateCalls.length, 1);
    assert.ok(handler.getSession());
    assert.deepEqual(
      socket.written
        .filter((message) => message[0] === 0x52)
        .map((message) => message.readInt32BE(5)),
      [PG_AUTH_TYPE.CLEARTEXT_PASSWORD, PG_AUTH_TYPE.OK],
    );
    handler.destroy();
  });

  it('processes fragmented PasswordMessage bytes exactly once', async () => {
    const adapter = new ProtocolAdapter();
    const socket = new ProtocolSocket();
    const handler = createHandler(adapter, socket);
    const passwordMessage = buildPasswordMessage(PASSWORD);

    socket.emit('data', buildStartupMessage());
    await settleProtocol();
    socket.emit('data', passwordMessage.subarray(0, 2));
    socket.emit('data', passwordMessage.subarray(2, 8));
    socket.emit('data', passwordMessage.subarray(8));
    await settleProtocol();

    assert.equal(adapter.authenticateCalls.length, 1);
    assert.ok(handler.getSession());
    handler.destroy();
  });

  it('rejects a non-terminated PasswordMessage before authentication',
    async () => {
      const adapter = new ProtocolAdapter();
      const socket = new ProtocolSocket();
      const handler = createHandler(adapter, socket);

      socket.emit('data', buildStartupMessage());
      await settleProtocol();
      socket.emit('data', buildPasswordMessage(PASSWORD, false));
      await settleProtocol();

      assert.equal(adapter.authenticateCalls.length, 0);
      assert.equal(socket.ended, true);
      assert.equal(handler.getSession(), null);
    });

  it('closes a late adapter session when the client disconnects', async () => {
    let releaseVerifier;
    const verifierGate = new Promise((resolve) => {
      releaseVerifier = resolve;
    });
    const adapter = new ProtocolAdapter(() => verifierGate);
    const socket = new ProtocolSocket();
    const handler = createHandler(adapter, socket);

    socket.emit('data', Buffer.concat([
      buildStartupMessage(),
      buildPasswordMessage(PASSWORD),
    ]));
    await settleProtocol();
    assert.equal(adapter.authenticateCalls.length, 1);
    const writesAtDisconnect = socket.written.length;
    socket.emit('close');
    releaseVerifier();
    await settleProtocol();

    assert.equal(adapter.sessions.size, 0);
    assert.equal(handler.getSession(), null);
    assert.equal(socket.written.length, writesAtDisconnect);
  });
});

describe('pgwire production credential owner', () => {
  it('is absent when password authentication is not configured', () => {
    assert.equal(buildPgwireCredentialVerifier({}), null);
  });

  it('rejects partial credential configuration', () => {
    assert.throws(
      () => buildPgwireCredentialVerifier({
        PGWIRE_AUTH_USER: USER,
        PGWIRE_AUTH_PASSWORD: PASSWORD,
      }),
      new RegExp(PGWIRE_CREDENTIAL_CONFIG_ERROR, 'u'),
    );
  });

  it('authenticates only the complete server-owned identity', async () => {
    const verifier = buildPgwireCredentialVerifier({
      PGWIRE_AUTH_USER: USER,
      PGWIRE_AUTH_PASSWORD: PASSWORD,
      PGWIRE_AUTH_DATABASE: DATABASE,
    });

    assert.deepEqual(await verifier({
      user: USER,
      password: PASSWORD,
      database: DATABASE,
    }), {authenticated: true, roles: ['application']});
    assert.deepEqual(await verifier({
      user: USER,
      password: WRONG_PASSWORD,
      database: DATABASE,
    }), {authenticated: false, roles: []});
  });

  it('performs all tuple comparisons for every mismatch position', () => {
    const expected = {user: USER, password: PASSWORD, database: DATABASE};
    const candidates = [
      {...expected, user: 'wrong-user'},
      {...expected, password: WRONG_PASSWORD},
      {...expected, database: 'wrong-database'},
    ];

    for (const candidate of candidates) {
      const compared = [];
      const matches = credentialTupleMatches(
        candidate,
        expected,
        (actual, wanted) => {
          compared.push([actual, wanted]);
          return actual === wanted;
        },
      );
      assert.equal(matches, false);
      assert.equal(compared.length, 3);
    }
  });

  it('production startup wiring fails closed on a partial secret', () => {
    assert.throws(
      () => createRuntimeStartupWiring({
        pgwireCredentialEnv: {
          PGWIRE_AUTH_USER: USER,
        },
      }),
      new RegExp(PGWIRE_CREDENTIAL_CONFIG_ERROR, 'u'),
    );
  });

  it('production startup wiring accepts a complete credential source', () => {
    const wiring = createRuntimeStartupWiring({
      pgwireCredentialEnv: {
        PGWIRE_AUTH_USER: USER,
        PGWIRE_AUTH_PASSWORD: PASSWORD,
        PGWIRE_AUTH_DATABASE: DATABASE,
      },
    });

    assert.ok(wiring.serviceRuntimeLifecycle);
  });
});
