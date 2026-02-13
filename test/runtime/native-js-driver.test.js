/**
 * Unit tests for Native_JS_Driver.
 *
 * Validates: Requirements 2.1, 2.2
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {NativeJsDriver, NATIVE_JS_ERROR} from
  '../../src/runtime/native-js-driver.js';
import {
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {
  DriverValidationError,
  DriverLifecycleError,
} from '../../src/runtime/runtime-driver-errors.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';

// --- Helpers ---

function makeDefinition(overrides = {}) {
  return {
    serviceId: 'svc-admin-1',
    runtime_ref: 'admin-handler-v1',
    ...overrides,
  };
}

function makeHandlerMap(ref = 'admin-handler-v1') {
  const handler = (params) => ({success: true, ...params});
  return {[ref]: handler};
}

function makeReplicaContext(overrides = {}) {
  return {
    serviceId: 'svc-admin-1',
    ...overrides,
  };
}

describe('NativeJsDriver', () => {
  let driver;

  beforeEach(() => {
    driver = new NativeJsDriver();
  });

  describe('constructor', () => {
    it('should have native_js kind', () => {
      assert.equal(driver.kind, RUNTIME_KIND.NATIVE_JS);
    });

    it('should have kind as readonly', () => {
      assert.throws(() => {
        driver.kind = 'other';
      });
    });
  });

  describe('validateDescriptor', () => {
    it('should accept valid definition with runtime_ref', () => {
      const result = driver.validateDescriptor(
        makeDefinition(),
      );
      assert.equal(result.valid, true);
      assert.equal(result.errors, undefined);
    });

    it('should accept definition with camelCase runtimeRef', () => {
      const result = driver.validateDescriptor({
        serviceId: 'svc-1',
        runtimeRef: 'handler-id',
      });
      assert.equal(result.valid, true);
    });

    it('should reject null definition', () => {
      const result = driver.validateDescriptor(null);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        NATIVE_JS_ERROR.DEFINITION_REQUIRED,
      ));
    });

    it('should reject undefined definition', () => {
      const result = driver.validateDescriptor(undefined);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        NATIVE_JS_ERROR.DEFINITION_REQUIRED,
      ));
    });

    it('should reject non-object definition', () => {
      const result = driver.validateDescriptor('not-object');
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        NATIVE_JS_ERROR.DEFINITION_REQUIRED,
      ));
    });

    it('should reject missing runtime_ref', () => {
      const result = driver.validateDescriptor({serviceId: 's'});
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        NATIVE_JS_ERROR.REF_REQUIRED,
      ));
    });

    it('should reject non-string runtime_ref', () => {
      const result = driver.validateDescriptor({
        serviceId: 's',
        runtime_ref: 42,
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        NATIVE_JS_ERROR.REF_MUST_BE_STRING,
      ));
    });

    it('should reject empty runtime_ref', () => {
      const result = driver.validateDescriptor({
        serviceId: 's',
        runtime_ref: '  ',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        NATIVE_JS_ERROR.REF_EMPTY,
      ));
    });
  });

  describe('prepare', () => {
    it('should resolve handler from handlerMap', async () => {
      const result = await driver.prepare(
        makeDefinition(),
        {handlerMap: makeHandlerMap()},
      );
      assert.equal(result.status, PREPARE_STATUS.READY);
    });

    it('should fail when handler not found', async () => {
      const result = await driver.prepare(
        makeDefinition({runtime_ref: 'missing-ref'}),
        {handlerMap: makeHandlerMap()},
      );
      assert.equal(result.status, PREPARE_STATUS.FAILED);
      assert.ok(result.error.includes(
        NATIVE_JS_ERROR.HANDLER_NOT_FOUND,
      ));
    });

    it('should fail when handler is not a function', async () => {
      const result = await driver.prepare(
        makeDefinition(),
        {handlerMap: {'admin-handler-v1': 'not-a-function'}},
      );
      assert.equal(result.status, PREPARE_STATUS.FAILED);
      assert.ok(result.error.includes(
        NATIVE_JS_ERROR.HANDLER_NOT_FUNCTION,
      ));
    });

    it('should throw DriverValidationError for invalid def',
      async () => {
        await assert.rejects(
          () => driver.prepare(null, {handlerMap: {}}),
          (err) => {
            assert.ok(err instanceof DriverValidationError);
            return true;
          },
        );
      });

    it('should throw DriverLifecycleError for missing map',
      async () => {
        await assert.rejects(
          () => driver.prepare(makeDefinition(), {}),
          (err) => {
            assert.ok(err instanceof DriverLifecycleError);
            assert.ok(err.message.includes(
              NATIVE_JS_ERROR.HANDLER_MAP_NOT_OBJECT,
            ));
            return true;
          },
        );
      });

    it('should throw DriverLifecycleError for null map',
      async () => {
        await assert.rejects(
          () => driver.prepare(
            makeDefinition(), {handlerMap: null},
          ),
          (err) => {
            assert.ok(err instanceof DriverLifecycleError);
            return true;
          },
        );
      });

    it('should be idempotent (re-prepare updates handler)',
      async () => {
        const map1 = makeHandlerMap();
        await driver.prepare(makeDefinition(), {handlerMap: map1});

        const newHandler = () => ({replaced: true});
        const map2 = {'admin-handler-v1': newHandler};
        const result = await driver.prepare(
          makeDefinition(), {handlerMap: map2},
        );
        assert.equal(result.status, PREPARE_STATUS.READY);
      });
  });

  describe('start', () => {
    beforeEach(async () => {
      await driver.prepare(
        makeDefinition(),
        {handlerMap: makeHandlerMap()},
      );
    });

    it('should start a prepared service', async () => {
      const result = await driver.start(makeReplicaContext());
      assert.equal(result.status, START_STATUS.RUNNING);
    });

    it('should fail for unprepared service', async () => {
      const result = await driver.start(
        makeReplicaContext({serviceId: 'unknown-svc'}),
      );
      assert.equal(result.status, START_STATUS.FAILED);
      assert.ok(result.error.includes(
        NATIVE_JS_ERROR.NOT_PREPARED,
      ));
    });

    it('should be idempotent (double start succeeds)',
      async () => {
        await driver.start(makeReplicaContext());
        const result = await driver.start(makeReplicaContext());
        assert.equal(result.status, START_STATUS.RUNNING);
      });

    it('should include endpoint intent when configured',
      async () => {
        const result = await driver.start(makeReplicaContext({
          endpointHost: '127.0.0.1',
          endpointPort: 8081,
          endpointProtocol: 'http',
        }));
        assert.equal(result.status, START_STATUS.RUNNING);
        assert.deepStrictEqual(result.endpointIntent, {
          host: '127.0.0.1',
          port: 8081,
          protocol: 'http',
        });
      });

    it('should default protocol to ws', async () => {
      const result = await driver.start(makeReplicaContext({
        endpointHost: '127.0.0.1',
        endpointPort: 8081,
      }));
      assert.equal(result.endpointIntent.protocol, 'ws');
    });

    it('should not include endpoint without host/port',
      async () => {
        const result = await driver.start(makeReplicaContext());
        assert.equal(result.endpointIntent, undefined);
      });

    it('should throw for null replicaContext', async () => {
      await assert.rejects(
        () => driver.start(null),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          return true;
        },
      );
    });

    it('should throw for missing serviceId', async () => {
      await assert.rejects(
        () => driver.start({}),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          assert.ok(err.message.includes(
            NATIVE_JS_ERROR.SERVICE_ID_REQUIRED,
          ));
          return true;
        },
      );
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      await driver.prepare(
        makeDefinition(),
        {handlerMap: makeHandlerMap()},
      );
      await driver.start(makeReplicaContext());
    });

    it('should stop a running service', async () => {
      await driver.stop(makeReplicaContext());
      const health = await driver.health(makeReplicaContext());
      assert.equal(health.status, HEALTH_STATUS.UNHEALTHY);
    });

    it('should be idempotent (double stop succeeds)',
      async () => {
        await driver.stop(makeReplicaContext());
        await driver.stop(makeReplicaContext());
      });

    it('should throw for null replicaContext', async () => {
      await assert.rejects(
        () => driver.stop(null),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          return true;
        },
      );
    });

    it('should throw for missing serviceId', async () => {
      await assert.rejects(
        () => driver.stop({}),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          return true;
        },
      );
    });
  });

  describe('health', () => {
    it('should return healthy for running service', async () => {
      await driver.prepare(
        makeDefinition(),
        {handlerMap: makeHandlerMap()},
      );
      await driver.start(makeReplicaContext());
      const result = await driver.health(makeReplicaContext());
      assert.equal(result.status, HEALTH_STATUS.HEALTHY);
    });

    it('should return unhealthy for prepared but not started',
      async () => {
        await driver.prepare(
          makeDefinition(),
          {handlerMap: makeHandlerMap()},
        );
        const result = await driver.health(makeReplicaContext());
        assert.equal(result.status, HEALTH_STATUS.UNHEALTHY);
        assert.ok(result.detail.includes(
          NATIVE_JS_ERROR.NOT_STARTED,
        ));
      });

    it('should return unhealthy for unknown service', async () => {
      const result = await driver.health(
        makeReplicaContext({serviceId: 'unknown'}),
      );
      assert.equal(result.status, HEALTH_STATUS.UNHEALTHY);
      assert.ok(result.detail.includes(
        NATIVE_JS_ERROR.NOT_PREPARED,
      ));
    });

    it('should return unknown for null replicaContext',
      async () => {
        const result = await driver.health(null);
        assert.equal(result.status, HEALTH_STATUS.UNKNOWN);
      });

    it('should return unknown for missing serviceId',
      async () => {
        const result = await driver.health({});
        assert.equal(result.status, HEALTH_STATUS.UNKNOWN);
      });
  });

  describe('getHandler', () => {
    it('should return handler for running service', async () => {
      const handlerMap = makeHandlerMap();
      await driver.prepare(
        makeDefinition(),
        {handlerMap},
      );
      await driver.start(makeReplicaContext());
      const handler = driver.getHandler('svc-admin-1');
      assert.equal(typeof handler, 'function');
      assert.equal(
        handler, handlerMap['admin-handler-v1'],
      );
    });

    it('should return undefined for non-running service',
      () => {
        const handler = driver.getHandler('svc-admin-1');
        assert.equal(handler, undefined);
      });

    it('should return undefined after stop', async () => {
      await driver.prepare(
        makeDefinition(),
        {handlerMap: makeHandlerMap()},
      );
      await driver.start(makeReplicaContext());
      await driver.stop(makeReplicaContext());
      const handler = driver.getHandler('svc-admin-1');
      assert.equal(handler, undefined);
    });
  });

  describe('full lifecycle', () => {
    it('should complete prepare -> start -> health -> stop',
      async () => {
        const prep = await driver.prepare(
          makeDefinition(),
          {handlerMap: makeHandlerMap()},
        );
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
      });
  });
});
