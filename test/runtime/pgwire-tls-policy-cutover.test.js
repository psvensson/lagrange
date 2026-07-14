import {after, before, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
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
import {buildPgwireCredentialVerifier} from
  '../../src/runtime/pgwire-credential-verifier.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';
import {PgWireProtocolHandler} from
  '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_BACKEND_MSG,
  PG_FRONTEND_MSG,
  PG_PROTOCOL_VERSION,
  PG_SSL_REQUEST_CODE,
  PG_SSL_RESPONSE,
} from '../../src/runtime/pgwire-protocol-constants.js';
import {
  PGWIRE_TLS_ERROR,
  buildPgwireSecureContext,
  loadPgwireTlsOptions,
} from '../../src/runtime/pgwire-tls-context.js';

const HOST = '127.0.0.1';
const DATABASE = 'portable_tls_app';
const USER = 'portable_tls_app';
const PASSWORD = 'tls-password';
const FIXTURE_URL = new URL('../fixtures/pgwire-tls/', import.meta.url);
const SERVER_KEY_PATH = fileURLToPath(new URL('server-key.pem', FIXTURE_URL));
const SERVER_CERT_PATH = fileURLToPath(new URL('server-cert.pem', FIXTURE_URL));
const SERVER_KEY = readFileSync(SERVER_KEY_PATH, 'utf8');
const SERVER_CERT = readFileSync(
  SERVER_CERT_PATH,
  'utf8',
);
const WRONG_CA_CERT = readFileSync(
  new URL('wrong-ca-cert.pem', FIXTURE_URL),
  'utf8',
);
const silentLogger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

class TlsPolicySocket extends EventEmitter {
  constructor() {
    super();
    this.written = [];
    this.ended = false;
    this.destroyed = false;
  }

  write(value) {
    this.written.push(Buffer.from(value));
    return true;
  }

  end() {
    this.ended = true;
  }

  destroy() {
    this.destroyed = true;
  }

  messageCount(type) {
    return this.written.filter((message) => message[0] === type).length;
  }
}

class TlsPolicyAdapter {
  constructor() {
    this.sessions = new Map();
    this.executions = [];
  }

  async authenticate(sessionId, credentials) {
    this.sessions.set(sessionId, credentials);
    return {sessionId, tenantId: credentials.tenantId};
  }

  async execute(sessionId, sql, parameters) {
    this.executions.push({sessionId, sql, parameters});
    return {rows: [], columns: []};
  }

  closeSession(sessionId) {
    this.sessions.delete(sessionId);
  }
}

function buildSslRequest(size = 8) {
  const message = Buffer.alloc(size);
  message.writeInt32BE(size, 0);
  message.writeInt32BE(PG_SSL_REQUEST_CODE, 4);
  return message;
}

function buildProtocolStartup() {
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

function buildFrontendMessage(type, value) {
  const payload = Buffer.from(`${value}\0`, 'utf8');
  const message = Buffer.alloc(5 + payload.length);
  message[0] = type;
  message.writeInt32BE(4 + payload.length, 1);
  payload.copy(message, 5);
  return message;
}

function settleProtocol() {
  return new Promise((resolve) => setImmediate(resolve));
}

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

function createDefinition(tlsMode) {
  return {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeKind: RUNTIME_KIND.NATIVE_JS,
    runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
    runtimeConfig: JSON.stringify({
      host: HOST,
      authMode: 'password',
      tlsMode,
    }),
  };
}

function createClient(port, ssl) {
  return new pg.Client({
    host: HOST,
    port,
    database: DATABASE,
    user: USER,
    password: PASSWORD,
    ssl,
    connectionTimeoutMillis: 1000,
  });
}

async function queryAnswer(port, ssl) {
  const client = createClient(port, ssl);
  await client.connect();
  try {
    return await client.query('SELECT 42 AS answer');
  } finally {
    await client.end();
  }
}

describe('PG wire TLS protocol boundary', () => {
  it('rejects an SSLRequest with payload bytes', async () => {
    const socket = new TlsPolicySocket();
    const handler = new PgWireProtocolHandler({
      adapter: new TlsPolicyAdapter(),
      socket,
      logger: silentLogger,
    });
    handler.start();

    socket.emit('data', buildSslRequest(9));
    await settleProtocol();

    assert.equal(socket.ended, true);
    assert.equal(socket.messageCount(PG_BACKEND_MSG.ERROR_RESPONSE), 1);
    handler.destroy();
  });

  it('rejects plaintext startup when TLS is required', async () => {
    const socket = new TlsPolicySocket();
    const adapter = new TlsPolicyAdapter();
    const handler = new PgWireProtocolHandler({
      adapter,
      socket,
      tlsMode: 'require',
      secureContext: {},
      logger: silentLogger,
    });
    handler.start();

    socket.emit('data', buildProtocolStartup());
    await settleProtocol();

    assert.equal(socket.ended, true);
    assert.equal(adapter.sessions.size, 0);
    assert.equal(socket.messageCount(PG_BACKEND_MSG.ERROR_RESPONSE), 1);
    handler.destroy();
  });

  it('routes startup through the upgraded TLS socket', async () => {
    const rawSocket = new TlsPolicySocket();
    const tlsSocket = new TlsPolicySocket();
    const adapter = new TlsPolicyAdapter();
    const secureContext = {};
    const handler = new PgWireProtocolHandler({
      adapter,
      socket: rawSocket,
      tlsMode: 'require',
      secureContext,
      tlsSocketFactory(socket, context) {
        assert.equal(socket, rawSocket);
        assert.equal(context, secureContext);
        return tlsSocket;
      },
      logger: silentLogger,
    });
    handler.start();

    rawSocket.emit('data', buildSslRequest());
    await settleProtocol();
    assert.equal(rawSocket.written[0][0], PG_SSL_RESPONSE.SUPPORTED);
    tlsSocket.emit('data', buildProtocolStartup());
    await settleProtocol();

    assert.equal(adapter.sessions.size, 1);
    assert.equal(tlsSocket.messageCount(PG_BACKEND_MSG.READY_FOR_QUERY), 1);
    handler.destroy();
  });

  it('rejects plaintext buffered after SSLRequest before TLS activation',
    async () => {
      const rawSocket = new TlsPolicySocket();
      const tlsSocket = new TlsPolicySocket();
      const adapter = new TlsPolicyAdapter();
      let factoryCalls = 0;
      const handler = new PgWireProtocolHandler({
        adapter,
        socket: rawSocket,
        authMode: 'password',
        tlsMode: 'require',
        secureContext: {},
        tlsSocketFactory() {
          factoryCalls += 1;
          return tlsSocket;
        },
        logger: silentLogger,
      });
      handler.start();
      const attack = Buffer.concat([
        buildSslRequest(),
        buildProtocolStartup(),
        buildFrontendMessage(PG_FRONTEND_MSG.PASSWORD, PASSWORD),
        buildFrontendMessage(PG_FRONTEND_MSG.QUERY, 'SELECT 42'),
      ]);

      rawSocket.emit('data', attack);
      await settleProtocol();
      tlsSocket.emit('data', Buffer.alloc(0));
      await settleProtocol();

      assert.equal(rawSocket.ended, true);
      assert.equal(factoryCalls, 0);
      assert.equal(adapter.sessions.size, 0);
      assert.equal(adapter.executions.length, 0);
      handler.destroy();
    });
});

describe('PG wire production TLS require policy', () => {
  const sqlite = new Database(':memory:');
  const observedRequests = [];
  const wiring = createRuntimeStartupWiring({
    pgwireCredentialEnv: {
      PGWIRE_AUTH_USER: USER,
      PGWIRE_AUTH_PASSWORD: PASSWORD,
      PGWIRE_AUTH_DATABASE: DATABASE,
    },
    pgwireTlsEnv: {
      PGWIRE_TLS_KEY_PATH: SERVER_KEY_PATH,
      PGWIRE_TLS_CERT_PATH: SERVER_CERT_PATH,
    },
  });
  const runtime = wiring.serviceRuntimeLifecycle;
  const definition = createDefinition('require');
  let port;

  before(async () => {
    runtime.setQueryExecutorFactory(() => ({
      executeRequest: createExecutor(sqlite, observedRequests),
    }));
    assert.equal(
      (await runtime.prepare(definition, {nodeId: 'node-a'})).status,
      'ready',
    );
    const started = await runtime.start({...definition, host: HOST, port: 0});
    assert.equal(started.status, 'running');
    port = started.endpointIntent.port;
  });

  after(async () => {
    await runtime.stop({...definition, host: HOST, port});
    sqlite.close();
  });

  it('queries through verified TLS on the production startup path', async () => {
    const result = await queryAnswer(port, {
      ca: SERVER_CERT,
      rejectUnauthorized: true,
    });

    assert.deepEqual(result.rows, [{answer: '42'}]);
    assert.equal(observedRequests.length, 1);
  });

  it('rejects plaintext downgrade before SQL', async () => {
    const requestsBefore = observedRequests.length;
    await assert.rejects(createClient(port, false).connect(), /TLS is required/iu);
    assert.equal(observedRequests.length, requestsBefore);
  });

  it('rejects an invalid certificate authority before SQL', async () => {
    const requestsBefore = observedRequests.length;
    await assert.rejects(createClient(port, {
      ca: WRONG_CA_CERT,
      rejectUnauthorized: true,
    }).connect());
    assert.equal(observedRequests.length, requestsBefore);
  });

  it('keeps TLS material outside runtime_config', () => {
    const config = JSON.parse(definition.runtimeConfig);
    assert.equal(config.tlsMode, 'require');
    assert.equal(Object.hasOwn(config, 'key'), false);
    assert.equal(Object.hasOwn(config, 'cert'), false);
    assert.equal(Object.hasOwn(config, 'ca'), false);
  });
});

describe('PG wire TLS mode ownership', () => {
  const verifier = buildPgwireCredentialVerifier({
    PGWIRE_AUTH_USER: USER,
    PGWIRE_AUTH_PASSWORD: PASSWORD,
    PGWIRE_AUTH_DATABASE: DATABASE,
  });

  async function withRuntime(tlsMode, tlsOptions, callback) {
    const sqlite = new Database(':memory:');
    const requests = [];
    const runtime = new PostgresWireRuntimeModule({
      logger: silentLogger,
      credentialVerifier: verifier,
      tlsOptions,
    });
    const definition = createDefinition(tlsMode);
    assert.equal((await runtime.prepare(definition)).status, 'ready');
    const started = await runtime.start({
      serviceId: META_SERVICE_ID.POSTGRES_WIRE,
      host: HOST,
      port: 0,
      sqlRequestExecutor: createExecutor(sqlite, requests),
    });
    try {
      await callback({runtime, definition, started, requests});
    } finally {
      await runtime.stop({serviceId: META_SERVICE_ID.POSTGRES_WIRE});
      sqlite.close();
    }
  }

  it('fails require startup without composition-root TLS material', async () => {
    await withRuntime('require', null, async ({started}) => {
      assert.equal(started.status, 'failed');
      assert.match(started.error, /TLS configuration/iu);
    });
  });

  it('sanitizes invalid TLS material at the runtime boundary', async () => {
    const secretMarker = 'private-key-secret-marker';
    await withRuntime(
      'require',
      {key: secretMarker, cert: 'invalid-certificate'},
      async ({started}) => {
        assert.equal(started.status, 'failed');
        assert.equal(started.error, PGWIRE_TLS_ERROR.CONFIG_INVALID);
        assert.equal(started.error.includes(secretMarker), false);
      },
    );
  });

  it('allows both verified TLS and plaintext in explicit prefer mode', async () => {
    await withRuntime(
      'prefer',
      {key: SERVER_KEY, cert: SERVER_CERT},
      async ({started, requests}) => {
        assert.equal(started.status, 'running');
        const port = started.endpointIntent.port;
        assert.deepEqual(
          (await queryAnswer(port, {ca: SERVER_CERT, rejectUnauthorized: true})).rows,
          [{answer: '42'}],
        );
        assert.deepEqual((await queryAnswer(port, false)).rows, [{answer: '42'}]);
        assert.equal(requests.length, 2);
      },
    );
  });

  it('keeps disable mode plaintext and rejects an SSL requirement', async () => {
    await withRuntime('disable', null, async ({started, requests}) => {
      assert.equal(started.status, 'running');
      const port = started.endpointIntent.port;
      assert.deepEqual((await queryAnswer(port, false)).rows, [{answer: '42'}]);
      await assert.rejects(queryAnswer(port, {
        ca: SERVER_CERT,
        rejectUnauthorized: true,
      }), /does not support SSL/iu);
      assert.equal(requests.length, 1);
    });
  });
});

describe('PG wire TLS composition-root material owner', () => {
  it('is absent when TLS path configuration is absent', () => {
    assert.equal(loadPgwireTlsOptions({}), null);
  });

  it('rejects partial path configuration without echoing paths', () => {
    const secretPath = '/secret/private/server.key';
    assert.throws(
      () => loadPgwireTlsOptions({PGWIRE_TLS_KEY_PATH: secretPath}),
      (error) => {
        assert.equal(error.message, PGWIRE_TLS_ERROR.CONFIG_INVALID);
        assert.equal(error.message.includes(secretPath), false);
        return true;
      },
    );
  });

  it('loads mounted key/cert paths into a usable SecureContext', () => {
    const options = loadPgwireTlsOptions({
      PGWIRE_TLS_KEY_PATH: SERVER_KEY_PATH,
      PGWIRE_TLS_CERT_PATH: SERVER_CERT_PATH,
    });

    assert.ok(Buffer.isBuffer(options.key));
    assert.ok(Buffer.isBuffer(options.cert));
    assert.ok(buildPgwireSecureContext(options));
  });

  it('rejects secret-bearing runtime_config without echoing material',
    async () => {
      const secretMarker = 'descriptor-private-key-secret';
      const runtime = new PostgresWireRuntimeModule({
        tlsOptions: {key: SERVER_KEY, cert: SERVER_CERT},
      });
      const definition = createDefinition('require');
      definition.runtimeConfig = JSON.stringify({
        host: HOST,
        authMode: 'password',
        tlsMode: 'require',
        key: secretMarker,
      });

      const prepared = await runtime.prepare(definition);
      assert.equal(prepared.status, 'failed');
      assert.match(prepared.error, /unsupported field/iu);
      assert.equal(prepared.error.includes(secretMarker), false);
    });
});
