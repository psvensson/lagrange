/**
 * Unit tests for NativeJsDriver lifecycle module delegation.
 *
 * Validates: Requirements 2.2, 2.4, 9.4
 *
 * Tests that the native JS driver correctly detects lifecycle-
 * capable modules in the handlerMap and delegates prepare, start,
 * stop, and health calls to them, while preserving typed error
 * behavior for invalid refs.
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  NativeJsDriver,
  NATIVE_JS_ERROR,
  isLifecycleModule,
} from '../../src/runtime/native-js-driver.js';
import {
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';

// --- Helpers ---

const LIFECYCLE_REF = 'postgres-wire-runtime';
const SERVICE_ID = 'sys-postgres-wire';

/**
 * Build a fake lifecycle module that records calls.
 *
 * @param {Object} [overrides] - Override individual methods.
 * @return {{module: Object, calls: Array}}
 */
function makeLifecycleModule(overrides = {}) {
  const calls = [];
  const module = {
    prepare: overrides.prepare ?? (async (def, ctx) => {
      calls.push({method: 'prepare', def, ctx});
      return {status: PREPARE_STATUS.READY};
    }),
    start: overrides.start ?? (async (replicaCtx) => {
      calls.push({method: 'start', replicaCtx});
      return {
        status: START_STATUS.RUNNING,
        endpointIntent: {
          host: '0.0.0.0',
          port: 5432,
          protocol: 'postgresql',
        },
      };
    }),
    stop: overrides.stop ?? (async (replicaCtx) => {
      calls.push({method: 'stop', replicaCtx});
    }),
    health: overrides.health ?? (async (replicaCtx) => {
      calls.push({method: 'health', replicaCtx});
      return {status: HEALTH_STATUS.HEALTHY};
    }),
  };
  return {module, calls};
}

function makeDefinition(overrides = {}) {
  return {
    serviceId: SERVICE_ID,
    runtime_ref: LIFECYCLE_REF,
    ...overrides,
  };
}

function makeReplicaContext(overrides = {}) {
  return {
    serviceId: SERVICE_ID,
    ...overrides,
  };
}

// --- isLifecycleModule detection ---

describe('isLifecycleModule', () => {
  it('should return true for object with all lifecycle methods',
    () => {
      const {module} = makeLifecycleModule();
      assert.equal(isLifecycleModule(module), true);
    });

  it('should return false for plain function', () => {
    assert.equal(isLifecycleModule(() => {}), false);
  });

  it('should return false for null', () => {
    assert.equal(isLifecycleModule(null), false);
  });

  it('should return false for string', () => {
    assert.equal(isLifecycleModule('not-a-module'), false);
  });

  it('should return false for object missing prepare', () => {
    assert.equal(isLifecycleModule({
      start: () => {},
      stop: () => {},
      health: () => {},
    }), false);
  });

  it('should return false for object missing stop', () => {
    assert.equal(isLifecycleModule({
      prepare: () => {},
      start: () => {},
      health: () => {},
    }), false);
  });

  it('should return false for object with non-function method',
    () => {
      assert.equal(isLifecycleModule({
        prepare: () => {},
        start: 'not-fn',
        stop: () => {},
        health: () => {},
      }), false);
    });
});

// --- Lifecycle delegation through NativeJsDriver ---

describe('NativeJsDriver lifecycle module delegation', () => {
  let driver;

  beforeEach(() => {
    driver = new NativeJsDriver();
  });

  describe('prepare', () => {
    it('should delegate prepare to lifecycle module', async () => {
      const {module, calls} = makeLifecycleModule();
      const def = makeDefinition();
      const ctx = {handlerMap: {[LIFECYCLE_REF]: module}};

      const result = await driver.prepare(def, ctx);

      assert.equal(result.status, PREPARE_STATUS.READY);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'prepare');
      assert.equal(calls[0].def, def);
    });

    it('should propagate module prepare failure', async () => {
      const {module} = makeLifecycleModule({
        prepare: async () => ({
          status: PREPARE_STATUS.FAILED,
          error: 'config invalid',
        }),
      });
      const result = await driver.prepare(
        makeDefinition(),
        {handlerMap: {[LIFECYCLE_REF]: module}},
      );
      assert.equal(result.status, PREPARE_STATUS.FAILED);
      assert.equal(result.error, 'config invalid');
    });

    it('should still accept plain function handlers',
      async () => {
        const handler = () => ({ok: true});
        const result = await driver.prepare(
          makeDefinition({
            serviceId: 'svc-admin',
            runtime_ref: 'admin-ref',
          }),
          {handlerMap: {'admin-ref': handler}},
        );
        assert.equal(result.status, PREPARE_STATUS.READY);
      });

    it('should reject non-function non-module handler',
      async () => {
        const result = await driver.prepare(
          makeDefinition(),
          {handlerMap: {[LIFECYCLE_REF]: 42}},
        );
        assert.equal(result.status, PREPARE_STATUS.FAILED);
        assert.ok(result.error.includes(
          NATIVE_JS_ERROR.HANDLER_INVALID_TYPE,
        ));
      });

    it('should reject object missing lifecycle methods',
      async () => {
        const partial = {prepare: () => {}, start: () => {}};
        const result = await driver.prepare(
          makeDefinition(),
          {handlerMap: {[LIFECYCLE_REF]: partial}},
        );
        assert.equal(result.status, PREPARE_STATUS.FAILED);
        assert.ok(result.error.includes(
          NATIVE_JS_ERROR.HANDLER_INVALID_TYPE,
        ));
      });
  });

  describe('start', () => {
    it('should delegate start to lifecycle module', async () => {
      const {module, calls} = makeLifecycleModule();
      await driver.prepare(
        makeDefinition(),
        {handlerMap: {[LIFECYCLE_REF]: module}},
      );

      const ctx = makeReplicaContext();
      const result = await driver.start(ctx);

      assert.equal(result.status, START_STATUS.RUNNING);
      assert.deepStrictEqual(result.endpointIntent, {
        host: '0.0.0.0',
        port: 5432,
        protocol: 'postgresql',
      });
      const startCall = calls.find((c) => c.method === 'start');
      assert.ok(startCall);
      assert.equal(startCall.replicaCtx, ctx);
    });

    it('should propagate module start failure', async () => {
      const {module} = makeLifecycleModule({
        start: async () => ({
          status: START_STATUS.FAILED,
          error: 'bind failed',
        }),
      });
      await driver.prepare(
        makeDefinition(),
        {handlerMap: {[LIFECYCLE_REF]: module}},
      );

      const result = await driver.start(makeReplicaContext());
      assert.equal(result.status, START_STATUS.FAILED);
      assert.equal(result.error, 'bind failed');
    });

    it('should not mark service running on module start failure',
      async () => {
        const {module} = makeLifecycleModule({
          start: async () => ({
            status: START_STATUS.FAILED,
            error: 'bind failed',
          }),
        });
        await driver.prepare(
          makeDefinition(),
          {handlerMap: {[LIFECYCLE_REF]: module}},
        );
        await driver.start(makeReplicaContext());

        const health = await driver.health(makeReplicaContext());
        assert.equal(health.status, HEALTH_STATUS.UNHEALTHY);
      });
  });

  describe('stop', () => {
    it('should delegate stop to lifecycle module', async () => {
      const {module, calls} = makeLifecycleModule();
      await driver.prepare(
        makeDefinition(),
        {handlerMap: {[LIFECYCLE_REF]: module}},
      );
      await driver.start(makeReplicaContext());

      const ctx = makeReplicaContext();
      await driver.stop(ctx);

      const stopCall = calls.find((c) => c.method === 'stop');
      assert.ok(stopCall);
      assert.equal(stopCall.replicaCtx, ctx);
    });

    it('should clean up state after stop', async () => {
      const {module} = makeLifecycleModule();
      await driver.prepare(
        makeDefinition(),
        {handlerMap: {[LIFECYCLE_REF]: module}},
      );
      await driver.start(makeReplicaContext());
      await driver.stop(makeReplicaContext());

      const health = await driver.health(makeReplicaContext());
      assert.equal(health.status, HEALTH_STATUS.UNHEALTHY);
    });

    it('should be idempotent for lifecycle module', async () => {
      const {module} = makeLifecycleModule();
      await driver.prepare(
        makeDefinition(),
        {handlerMap: {[LIFECYCLE_REF]: module}},
      );
      await driver.start(makeReplicaContext());
      await driver.stop(makeReplicaContext());
      await driver.stop(makeReplicaContext());
    });
  });

  describe('health', () => {
    it('should delegate health to lifecycle module', async () => {
      const {module, calls} = makeLifecycleModule();
      await driver.prepare(
        makeDefinition(),
        {handlerMap: {[LIFECYCLE_REF]: module}},
      );
      await driver.start(makeReplicaContext());

      const ctx = makeReplicaContext();
      const result = await driver.health(ctx);

      assert.equal(result.status, HEALTH_STATUS.HEALTHY);
      const healthCall = calls.find(
        (c) => c.method === 'health',
      );
      assert.ok(healthCall);
      assert.equal(healthCall.replicaCtx, ctx);
    });

    it('should propagate module health detail', async () => {
      const {module} = makeLifecycleModule({
        health: async () => ({
          status: HEALTH_STATUS.HEALTHY,
          sessions: 5,
          maxSessions: 100,
        }),
      });
      await driver.prepare(
        makeDefinition(),
        {handlerMap: {[LIFECYCLE_REF]: module}},
      );
      await driver.start(makeReplicaContext());

      const result = await driver.health(makeReplicaContext());
      assert.equal(result.status, HEALTH_STATUS.HEALTHY);
      assert.equal(result.sessions, 5);
      assert.equal(result.maxSessions, 100);
    });
  });

  describe('full lifecycle', () => {
    it('should complete prepare -> start -> health -> stop',
      async () => {
        const {module, calls} = makeLifecycleModule();
        const def = makeDefinition();
        const ctx = {handlerMap: {[LIFECYCLE_REF]: module}};

        const prep = await driver.prepare(def, ctx);
        assert.equal(prep.status, PREPARE_STATUS.READY);

        const start = await driver.start(makeReplicaContext());
        assert.equal(start.status, START_STATUS.RUNNING);

        const health = await driver.health(makeReplicaContext());
        assert.equal(health.status, HEALTH_STATUS.HEALTHY);

        await driver.stop(makeReplicaContext());

        const postStop = await driver.health(
          makeReplicaContext(),
        );
        assert.equal(postStop.status, HEALTH_STATUS.UNHEALTHY);

        // All four lifecycle methods were called
        const methods = calls.map((c) => c.method);
        assert.ok(methods.includes('prepare'));
        assert.ok(methods.includes('start'));
        assert.ok(methods.includes('health'));
        assert.ok(methods.includes('stop'));
      });

    it('should support mixed handler types simultaneously',
      async () => {
        const {module} = makeLifecycleModule();
        const plainHandler = () => ({ok: true});

        // Prepare lifecycle module
        await driver.prepare(
          makeDefinition(),
          {handlerMap: {[LIFECYCLE_REF]: module}},
        );

        // Prepare plain handler
        await driver.prepare(
          {serviceId: 'svc-admin', runtime_ref: 'admin-ref'},
          {handlerMap: {'admin-ref': plainHandler}},
        );

        // Start both
        const lcStart = await driver.start(
          makeReplicaContext(),
        );
        assert.equal(lcStart.status, START_STATUS.RUNNING);
        assert.ok(lcStart.endpointIntent);

        const plainStart = await driver.start(
          {serviceId: 'svc-admin'},
        );
        assert.equal(plainStart.status, START_STATUS.RUNNING);
        assert.equal(plainStart.endpointIntent, undefined);

        // Health both
        const lcHealth = await driver.health(
          makeReplicaContext(),
        );
        assert.equal(lcHealth.status, HEALTH_STATUS.HEALTHY);

        const plainHealth = await driver.health(
          {serviceId: 'svc-admin'},
        );
        assert.equal(plainHealth.status, HEALTH_STATUS.HEALTHY);

        // Stop both
        await driver.stop(makeReplicaContext());
        await driver.stop({serviceId: 'svc-admin'});
      });
  });

  describe('typed error preservation', () => {
    it('should preserve NOT_FOUND for missing ref', async () => {
      const result = await driver.prepare(
        makeDefinition({runtime_ref: 'nonexistent'}),
        {handlerMap: {[LIFECYCLE_REF]: makeLifecycleModule().module}},
      );
      assert.equal(result.status, PREPARE_STATUS.FAILED);
      assert.ok(result.error.includes(
        NATIVE_JS_ERROR.HANDLER_NOT_FOUND,
      ));
    });

    it('should preserve NOT_PREPARED for unregistered service',
      async () => {
        const result = await driver.start(
          makeReplicaContext({serviceId: 'unknown'}),
        );
        assert.equal(result.status, START_STATUS.FAILED);
        assert.ok(result.error.includes(
          NATIVE_JS_ERROR.NOT_PREPARED,
        ));
      });
  });
});
