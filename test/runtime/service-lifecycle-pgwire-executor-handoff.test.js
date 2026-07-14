import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  META_SERVICE_ID,
  META_SERVICE_RUNTIME_REF,
} from '../../src/constants/wasm-meta.js';
import {isSqlRequest} from '../../src/query/sql-request.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';

const HOST = '127.0.0.1';
const DATABASE = 'executor_handoff';
const USER = 'executor_handoff';
const PASSWORD = 'executor-handoff-password';

function createDefinition() {
  return {
    runtimeConfig: JSON.stringify({
      authMode: 'password',
      host: HOST,
      tlsMode: 'disable',
    }),
    runtimeKind: RUNTIME_KIND.NATIVE_JS,
    runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
  };
}

function createWiring() {
  return createRuntimeStartupWiring({
    pgwireCredentialEnv: {
      PGWIRE_AUTH_DATABASE: DATABASE,
      PGWIRE_AUTH_PASSWORD: PASSWORD,
      PGWIRE_AUTH_USER: USER,
    },
  });
}

function createClient(port) {
  return new pg.Client({
    connectionTimeoutMillis: 1000,
    database: DATABASE,
    host: HOST,
    password: PASSWORD,
    port,
    ssl: false,
    user: USER,
  });
}

function successfulExecutor(label, requests) {
  return async (request) => {
    assert.equal(isSqlRequest(request), true);
    requests.push(request);
    return {
      columns: ['executor'],
      rows: [{executor: label}],
      success: true,
    };
  };
}

async function startRuntime(runtime, definition) {
  runtime.setQueryExecutorFactory(() => ({
    executeRequest: async () => {
      throw new Error('provisional executor was used after shutdown');
    },
  }));
  assert.equal(
    (await runtime.prepare(definition, {nodeId: 'handoff-node'})).status,
    'ready',
  );
  const started = await runtime.start({...definition, host: HOST, port: 0});
  assert.equal(started.status, 'running');
  return started.endpointIntent.port;
}

describe('PG-wire SQL executor handoff', () => {
  it('uses the authoritative executor on an already-running listener',
    async () => {
      const runtime = createWiring().serviceRuntimeLifecycle;
      const definition = createDefinition();
      const port = await startRuntime(runtime, definition);
      const authoritativeRequests = [];
      const resolvedIdentities = [];
      runtime.setQueryExecutorFactory((serviceId) => {
        resolvedIdentities.push(serviceId);
        return {
          executeRequest: successfulExecutor(
            'authoritative', authoritativeRequests,
          ),
        };
      });
      const client = createClient(port);

      try {
        await client.connect();
        const result = await client.query('SELECT 42 AS answer');
        assert.deepEqual(result.rows, [{executor: 'authoritative'}]);
        assert.equal(authoritativeRequests.length, 1);
        assert.equal(authoritativeRequests[0].tenantId, DATABASE);
        assert.deepEqual(resolvedIdentities, [META_SERVICE_ID.POSTGRES_WIRE]);
      } finally {
        await client.end().catch(() => {});
        await runtime.stop({...definition, host: HOST, port});
      }
    });

  it('fails closed when the current factory lacks executeRequest', async () => {
    const runtime = createWiring().serviceRuntimeLifecycle;
    const definition = createDefinition();
    const port = await startRuntime(runtime, definition);
    runtime.setQueryExecutorFactory(() => async () => ({success: true}));
    const client = createClient(port);

    try {
      await client.connect();
      await assert.rejects(
        client.query('SELECT 1'),
        /current SQL request executor is unavailable/iu,
      );
    } finally {
      await client.end().catch(() => {});
      await runtime.stop({...definition, host: HOST, port});
    }
  });
});
