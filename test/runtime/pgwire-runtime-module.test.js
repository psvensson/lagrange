/**
 * Unit tests for PostgreSQL wire runtime module lifecycle.
 *
 * Validates: Requirements 2.1, 6.1, 7.1, 9.1
 *
 * Tests cover prepare/start/stop/health contract, TCP listener
 * binding, endpoint intent shape, deterministic cleanup, and
 * idempotent lifecycle transitions.
 *
 * All tests use ephemeral ports (port 0) via replicaContext
 * override to avoid bind conflicts.
 */

import {describe, it, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

import {
  PostgresWireRuntimeModule,
  PGWIRE_MODULE_ERROR,
  PGWIRE_DEFAULT,
  LISTENER_STATE,
  resolveConfig,
} from '../../src/runtime/pgwire-runtime-module.js';
import {
  PortBindConflictError,
} from '../../src/runtime/pgwire-port-allocator.js';
import {
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {WASM_SERVICE_PROTOCOL} from
  '../../src/wasm-service/wasm-service-constants.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';

/**
 * Create a minimal service definition for testing.
 * @param {Object} [overrides] - Override default fields.
 * @return {Object} Service definition.
 */
function makeDefinition(overrides = {}) {
  return {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeConfig: null,
    ...overrides,
  };
}

/**
 * Create a replica context with ephemeral port for testing.
 * @param {Object} [overrides] - Override default fields.
 * @return {Object} Replica context.
 */
function makeContext(overrides = {}) {
  return {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: '127.0.0.1',
    port: 0,
    ...overrides,
  };
}

describe('pgwire-runtime-module', () => {
  /** @type {PostgresWireRuntimeModule[]} */
  const modules = [];

  afterEach(async () => {
    for (const mod of modules) {
      await mod.stop(makeContext()).catch(() => {});
    }
    modules.length = 0;
  });

  describe('resolveConfig', () => {
    it('should use defaults when no config provided', () => {
      const cfg = resolveConfig({});
      assert.equal(cfg.host, PGWIRE_DEFAULT.HOST);
      assert.equal(cfg.port, PGWIRE_DEFAULT.PORT);
      assert.equal(cfg.maxSessions, PGWIRE_DEFAULT.MAX_SESSIONS);
    });

    it('should parse JSON string config', () => {
      const def = {
        runtimeConfig: JSON.stringify({
          host: '127.0.0.1', port: 9999, maxSessions: 50,
        }),
      };
      const cfg = resolveConfig(def);
      assert.equal(cfg.host, '127.0.0.1');
      assert.equal(cfg.port, 9999);
      assert.equal(cfg.maxSessions, 50);
    });

    it('should accept object config (runtime_config key)', () => {
      const def = {
        runtime_config: {host: '10.0.0.1', port: 8888},
      };
      const cfg = resolveConfig(def);
      assert.equal(cfg.host, '10.0.0.1');
      assert.equal(cfg.port, 8888);
    });

    it('should apply overrides over config values', () => {
      const def = {
        runtimeConfig: JSON.stringify({
          host: '10.0.0.1', port: 5432,
        }),
      };
      const cfg = resolveConfig(def, {host: '127.0.0.1', port: 0});
      assert.equal(cfg.host, '127.0.0.1');
      assert.equal(cfg.port, 0);
    });
  });

  describe('prepare', () => {
    it('should return ready for valid definition', async () => {
      const mod = new PostgresWireRuntimeModule();
      const result = await mod.prepare(makeDefinition());
      assert.equal(result.status, PREPARE_STATUS.READY);
    });

    it('should fail for null definition', async () => {
      const mod = new PostgresWireRuntimeModule();
      const result = await mod.prepare(null);
      assert.equal(result.status, PREPARE_STATUS.FAILED);
      assert.ok(result.error.includes(
        PGWIRE_MODULE_ERROR.DEFINITION_REQUIRED,
      ));
    });

    it('should fail for non-object definition', async () => {
      const mod = new PostgresWireRuntimeModule();
      const result = await mod.prepare('bad');
      assert.equal(result.status, PREPARE_STATUS.FAILED);
    });

    it('should fail for invalid runtime config', async () => {
      const mod = new PostgresWireRuntimeModule();
      const def = makeDefinition({
        runtimeConfig: JSON.stringify({port: -1}),
      });
      const result = await mod.prepare(def);
      assert.equal(result.status, PREPARE_STATUS.FAILED);
      assert.ok(result.error.includes(
        PGWIRE_MODULE_ERROR.CONFIG_INVALID,
      ));
    });

    it('should accept null runtime config', async () => {
      const mod = new PostgresWireRuntimeModule();
      const result = await mod.prepare(
        makeDefinition({runtimeConfig: null}),
      );
      assert.equal(result.status, PREPARE_STATUS.READY);
    });

    it('should be idempotent (re-prepare updates config)',
      async () => {
        const mod = new PostgresWireRuntimeModule();
        await mod.prepare(makeDefinition());
        const def2 = makeDefinition({
          runtimeConfig: JSON.stringify({maxSessions: 42}),
        });
        const result = await mod.prepare(def2);
        assert.equal(result.status, PREPARE_STATUS.READY);
      });
  });

  describe('start', () => {
    it('should bind TCP listener and return endpoint intent',
      async () => {
        const mod = new PostgresWireRuntimeModule();
        modules.push(mod);
        await mod.prepare(makeDefinition());

        const result = await mod.start(makeContext());

        assert.equal(result.status, START_STATUS.RUNNING);
        assert.ok(result.endpointIntent);
        assert.equal(
          result.endpointIntent.protocol,
          WASM_SERVICE_PROTOCOL.POSTGRESQL,
        );
        assert.equal(result.endpointIntent.host, '127.0.0.1');
        assert.equal(typeof result.endpointIntent.port, 'number');
        assert.ok(result.endpointIntent.port > 0);
      });

    it('should fail for null replicaContext', async () => {
      const mod = new PostgresWireRuntimeModule();
      const result = await mod.start(null);
      assert.equal(result.status, START_STATUS.FAILED);
      assert.ok(result.error.includes(
        PGWIRE_MODULE_ERROR.REPLICA_CONTEXT_REQUIRED,
      ));
    });

    it('should fail for missing serviceId', async () => {
      const mod = new PostgresWireRuntimeModule();
      const result = await mod.start({});
      assert.equal(result.status, START_STATUS.FAILED);
      assert.ok(result.error.includes(
        PGWIRE_MODULE_ERROR.SERVICE_ID_REQUIRED,
      ));
    });

    it('should fail when not prepared', async () => {
      const mod = new PostgresWireRuntimeModule();
      const result = await mod.start(
        makeContext({serviceId: 'unknown-service'}),
      );
      assert.equal(result.status, START_STATUS.FAILED);
      assert.ok(result.error.includes(
        PGWIRE_MODULE_ERROR.NOT_PREPARED,
      ));
    });

    it('should be idempotent (second start returns same intent)',
      async () => {
        const mod = new PostgresWireRuntimeModule();
        modules.push(mod);
        await mod.prepare(makeDefinition());

        const ctx = makeContext();
        const r1 = await mod.start(ctx);
        const r2 = await mod.start(ctx);

        assert.equal(r2.status, START_STATUS.RUNNING);
        assert.deepStrictEqual(
          r2.endpointIntent, r1.endpointIntent,
        );
      });

    it('should accept TCP connections after start', async () => {
      const mod = new PostgresWireRuntimeModule();
      modules.push(mod);
      await mod.prepare(makeDefinition());

      const result = await mod.start(makeContext());
      const port = result.endpointIntent.port;

      const client = net.createConnection(port, '127.0.0.1');
      await new Promise((resolve) => client.on('connect', resolve));
      client.destroy();
    });

    it('should reject connections beyond maxSessions',
      async () => {
        const mod = new PostgresWireRuntimeModule();
        modules.push(mod);
        await mod.prepare(makeDefinition());

        const ctx = makeContext({maxSessions: 1});
        const result = await mod.start(ctx);
        const port = result.endpointIntent.port;

        // First connection should succeed
        const c1 = net.createConnection(port, '127.0.0.1');
        await new Promise((resolve) => c1.on('connect', resolve));

        // Second connection should be destroyed by server
        const c2 = net.createConnection(port, '127.0.0.1');
        const closed = new Promise((resolve) => {
          c2.on('close', resolve);
        });
        await closed;

        c1.destroy();
      });

    it('should throw on port bind failure', async () => {
      // Bind a port first to cause conflict
      const blocker = net.createServer();
      const blockerPort = await new Promise((resolve) => {
        blocker.listen(0, '127.0.0.1', () => {
          resolve(blocker.address().port);
        });
      });

      const mod = new PostgresWireRuntimeModule();
      await mod.prepare(makeDefinition());

      await assert.rejects(
        () => mod.start(makeContext({port: blockerPort})),
        (err) => {
          assert.ok(err instanceof PortBindConflictError);
          assert.equal(err.port, blockerPort);
          assert.equal(err.code, 'EADDRINUSE');
          return true;
        },
      );

      await new Promise((resolve) => blocker.close(resolve));
    });
  });

  describe('stop', () => {
    it('should close listener and all connections', async () => {
      const mod = new PostgresWireRuntimeModule();
      await mod.prepare(makeDefinition());

      const ctx = makeContext();
      const result = await mod.start(ctx);
      const port = result.endpointIntent.port;

      const client = net.createConnection(port, '127.0.0.1');
      await new Promise((resolve) => client.on('connect', resolve));

      await mod.stop(ctx);

      // Server should no longer accept connections
      const c2 = net.createConnection(port, '127.0.0.1');
      await new Promise((resolve, reject) => {
        c2.on('error', () => resolve());
        c2.on('connect', () => {
          c2.destroy();
          reject(new Error('should not connect'));
        });
      });
    });

    it('should be idempotent (stop when not running)', async () => {
      const mod = new PostgresWireRuntimeModule();
      await mod.stop(makeContext());
    });

    it('should handle null replicaContext gracefully',
      async () => {
        const mod = new PostgresWireRuntimeModule();
        await mod.stop(null);
      });

    it('should handle missing serviceId gracefully',
      async () => {
        const mod = new PostgresWireRuntimeModule();
        await mod.stop({});
      });

    it('should clean up prepared state', async () => {
      const mod = new PostgresWireRuntimeModule();
      await mod.prepare(makeDefinition());

      const ctx = makeContext();
      await mod.start(ctx);
      await mod.stop(ctx);

      // After stop, start should fail (not prepared)
      const result = await mod.start(ctx);
      assert.equal(result.status, START_STATUS.FAILED);
      assert.ok(result.error.includes(
        PGWIRE_MODULE_ERROR.NOT_PREPARED,
      ));
    });
  });

  describe('health', () => {
    it('should report healthy when listener is bound',
      async () => {
        const mod = new PostgresWireRuntimeModule();
        modules.push(mod);
        await mod.prepare(makeDefinition());

        const ctx = makeContext();
        await mod.start(ctx);

        const result = await mod.health(ctx);
        assert.equal(result.status, HEALTH_STATUS.HEALTHY);
        assert.equal(result.sessions, 0);
        assert.equal(typeof result.maxSessions, 'number');
      });

    it('should report session count', async () => {
      const mod = new PostgresWireRuntimeModule();
      modules.push(mod);
      await mod.prepare(makeDefinition());

      const ctx = makeContext();
      const startResult = await mod.start(ctx);
      const port = startResult.endpointIntent.port;

      const client = net.createConnection(port, '127.0.0.1');
      await new Promise((resolve) => client.on('connect', resolve));

      const result = await mod.health(ctx);
      assert.equal(result.status, HEALTH_STATUS.HEALTHY);
      assert.equal(result.sessions, 1);

      client.destroy();
    });

    it('should report unhealthy when not started', async () => {
      const mod = new PostgresWireRuntimeModule();
      const result = await mod.health(makeContext());
      assert.equal(result.status, HEALTH_STATUS.UNHEALTHY);
      assert.ok(result.detail.includes(
        PGWIRE_MODULE_ERROR.NOT_STARTED,
      ));
    });

    it('should return unknown for null replicaContext',
      async () => {
        const mod = new PostgresWireRuntimeModule();
        const result = await mod.health(null);
        assert.equal(result.status, HEALTH_STATUS.UNKNOWN);
      });

    it('should return unknown for missing serviceId',
      async () => {
        const mod = new PostgresWireRuntimeModule();
        const result = await mod.health({});
        assert.equal(result.status, HEALTH_STATUS.UNKNOWN);
      });
  });

  describe('full lifecycle', () => {
    it('should support prepare -> start -> health -> stop',
      async () => {
        const mod = new PostgresWireRuntimeModule();

        const prep = await mod.prepare(makeDefinition());
        assert.equal(prep.status, PREPARE_STATUS.READY);

        const ctx = makeContext();

        const start = await mod.start(ctx);
        assert.equal(start.status, START_STATUS.RUNNING);
        assert.ok(start.endpointIntent);

        const h = await mod.health(ctx);
        assert.equal(h.status, HEALTH_STATUS.HEALTHY);

        await mod.stop(ctx);

        const h2 = await mod.health(ctx);
        assert.equal(h2.status, HEALTH_STATUS.UNHEALTHY);
      });
  });

  describe('constants', () => {
    it('should export frozen PGWIRE_MODULE_ERROR', () => {
      assert.ok(Object.isFrozen(PGWIRE_MODULE_ERROR));
    });

    it('should export frozen PGWIRE_DEFAULT', () => {
      assert.ok(Object.isFrozen(PGWIRE_DEFAULT));
      assert.equal(PGWIRE_DEFAULT.HOST, '0.0.0.0');
      assert.equal(PGWIRE_DEFAULT.PORT, 5432);
      assert.equal(PGWIRE_DEFAULT.MAX_SESSIONS, 100);
    });

    it('should export frozen LISTENER_STATE', () => {
      assert.ok(Object.isFrozen(LISTENER_STATE));
      assert.equal(LISTENER_STATE.BOUND, 'bound');
      assert.equal(LISTENER_STATE.CLOSED, 'closed');
    });
  });
});
