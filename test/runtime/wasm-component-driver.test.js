/**
 * Unit tests for Wasm_Component_Driver.
 *
 * Validates: Requirements 3.2, 3.3, 3.5
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  WasmComponentDriver,
  WASM_COMPONENT_ERROR,
} from '../../src/runtime/wasm-component-driver.js';
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
    serviceId: 'svc-wasm-1',
    runtime_ref: 'my-wasm-module-v1',
    ...overrides,
  };
}

function makeReplicaContext(overrides = {}) {
  return {
    serviceId: 'svc-wasm-1',
    ...overrides,
  };
}

/**
 * Creates a mock WasmServiceLifecycle with controllable
 * behavior for testing delegation.
 */
function makeMockLifecycle(overrides = {}) {
  const replicas = new Map();
  return {
    createReplica: overrides.createReplica ?? ((def, _cfg) => {
      const replica = {serviceId: def.serviceId};
      replicas.set(def.serviceId, replica);
      return replica;
    }),
    startReplica: overrides.startReplica ?? ((serviceId) => {
      if (!replicas.has(serviceId)) return null;
      return {port: 9090, endpoint: null};
    }),
    stopReplica: overrides.stopReplica ?? (async (serviceId) => {
      replicas.delete(serviceId);
      return {stopped: true};
    }),
    getReplica: overrides.getReplica ?? ((serviceId) => {
      return replicas.get(serviceId) ?? null;
    }),
    _replicas: replicas,
  };
}

describe('WasmComponentDriver', () => {
  let driver;

  beforeEach(() => {
    driver = new WasmComponentDriver();
  });

  describe('constructor', () => {
    it('should have wasm_component kind', () => {
      assert.equal(driver.kind, RUNTIME_KIND.WASM_COMPONENT);
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

    it('should accept definition with camelCase runtimeRef',
      () => {
        const result = driver.validateDescriptor({
          serviceId: 'svc-1',
          runtimeRef: 'wasm-module-id',
        });
        assert.equal(result.valid, true);
      });

    it('should reject null definition', () => {
      const result = driver.validateDescriptor(null);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_COMPONENT_ERROR.DEFINITION_REQUIRED,
      ));
    });

    it('should reject undefined definition', () => {
      const result = driver.validateDescriptor(undefined);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_COMPONENT_ERROR.DEFINITION_REQUIRED,
      ));
    });

    it('should reject non-object definition', () => {
      const result = driver.validateDescriptor('not-object');
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_COMPONENT_ERROR.DEFINITION_REQUIRED,
      ));
    });

    it('should reject missing runtime_ref', () => {
      const result = driver.validateDescriptor(
        {serviceId: 's'},
      );
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_COMPONENT_ERROR.REF_REQUIRED,
      ));
    });

    it('should reject non-string runtime_ref', () => {
      const result = driver.validateDescriptor({
        serviceId: 's',
        runtime_ref: 42,
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_COMPONENT_ERROR.REF_MUST_BE_STRING,
      ));
    });

    it('should reject empty runtime_ref', () => {
      const result = driver.validateDescriptor({
        serviceId: 's',
        runtime_ref: '  ',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_COMPONENT_ERROR.REF_EMPTY,
      ));
    });

    it('should validate arbitrary non-empty strings as valid',
      () => {
        fc.assert(
          fc.property(
            fc.string({minLength: 1}).filter((s) =>
              s.trim().length > 0),
            (ref) => {
              const result = driver.validateDescriptor({
                serviceId: 'svc-1',
                runtime_ref: ref,
              });
              assert.equal(result.valid, true);
            },
          ),
          {numRuns: 10},
        );
      });

    it('should reject arbitrary non-string types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
          ),
          (ref) => {
            const result = driver.validateDescriptor({
              serviceId: 'svc-1',
              runtime_ref: ref,
            });
            assert.equal(result.valid, false);
          },
        ),
        {numRuns: 10},
      );
    });
  });

  describe('prepare', () => {
    it('should succeed without lifecycle (standalone)',
      async () => {
        const result = await driver.prepare(
          makeDefinition(), {},
        );
        assert.equal(result.status, PREPARE_STATUS.READY);
      });

    it('should succeed with lifecycle and replicaConfig',
      async () => {
        const lifecycle = makeMockLifecycle();
        const result = await driver.prepare(
          makeDefinition(),
          {wasmLifecycle: lifecycle, replicaConfig: {
            replicaId: 'r1',
            replicaIds: ['r1'],
            dbPath: '/tmp/test.db',
          }},
        );
        assert.equal(result.status, PREPARE_STATUS.READY);
        assert.ok(lifecycle._replicas.has('svc-wasm-1'));
      });

    it('should return failed when createReplica throws',
      async () => {
        const lifecycle = makeMockLifecycle({
          createReplica: () => {
            throw new Error('module not found');
          },
        });
        const result = await driver.prepare(
          makeDefinition(),
          {wasmLifecycle: lifecycle, replicaConfig: {}},
        );
        assert.equal(result.status, PREPARE_STATUS.FAILED);
        assert.ok(result.error.includes(
          WASM_COMPONENT_ERROR.CREATE_REPLICA_FAILED,
        ));
      });

    it('should throw DriverValidationError for invalid def',
      async () => {
        await assert.rejects(
          () => driver.prepare(null, {}),
          (err) => {
            assert.ok(err instanceof DriverValidationError);
            return true;
          },
        );
      });

    it('should throw DriverLifecycleError for non-object ' +
      'lifecycle', async () => {
      await assert.rejects(
        () => driver.prepare(
          makeDefinition(),
          {wasmLifecycle: 'not-object'},
        ),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          assert.ok(err.message.includes(
            WASM_COMPONENT_ERROR.LIFECYCLE_NOT_OBJECT,
          ));
          return true;
        },
      );
    });

    it('should be idempotent (re-prepare updates definition)',
      async () => {
        await driver.prepare(makeDefinition(), {});
        const result = await driver.prepare(
          makeDefinition({runtime_ref: 'updated-ref'}), {},
        );
        assert.equal(result.status, PREPARE_STATUS.READY);
      });
  });

  describe('start', () => {
    beforeEach(async () => {
      await driver.prepare(makeDefinition(), {});
    });

    it('should start a prepared service (standalone)',
      async () => {
        const result = await driver.start(
          makeReplicaContext(),
        );
        assert.equal(result.status, START_STATUS.RUNNING);
      });

    it('should fail for unprepared service', async () => {
      const result = await driver.start(
        makeReplicaContext({serviceId: 'unknown-svc'}),
      );
      assert.equal(result.status, START_STATUS.FAILED);
      assert.ok(result.error.includes(
        WASM_COMPONENT_ERROR.NOT_PREPARED,
      ));
    });

    it('should be idempotent (double start succeeds)',
      async () => {
        await driver.start(makeReplicaContext());
        const result = await driver.start(
          makeReplicaContext(),
        );
        assert.equal(result.status, START_STATUS.RUNNING);
      });

    it('should include endpoint intent when configured ' +
      '(standalone)', async () => {
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

    it('should default protocol to ws (standalone)',
      async () => {
        const result = await driver.start(makeReplicaContext({
          endpointHost: '127.0.0.1',
          endpointPort: 8081,
        }));
        assert.equal(result.endpointIntent.protocol, 'ws');
      });

    it('should not include endpoint without host/port ' +
      '(standalone)', async () => {
      const result = await driver.start(
        makeReplicaContext(),
      );
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
            WASM_COMPONENT_ERROR.SERVICE_ID_REQUIRED,
          ));
          return true;
        },
      );
    });

    it('should start with lifecycle and return endpoint ' +
      'intent from port', async () => {
      const lifecycle = makeMockLifecycle();
      const freshDriver = new WasmComponentDriver();
      await freshDriver.prepare(
        makeDefinition(),
        {wasmLifecycle: lifecycle, replicaConfig: {
          replicaId: 'r1',
          replicaIds: ['r1'],
          dbPath: '/tmp/test.db',
        }},
      );
      const result = await freshDriver.start(
        makeReplicaContext({address: '10.0.0.1'}),
      );
      assert.equal(result.status, START_STATUS.RUNNING);
      assert.ok(result.endpointIntent);
      assert.equal(result.endpointIntent.port, 9090);
      assert.equal(result.endpointIntent.host, '10.0.0.1');
      assert.equal(result.endpointIntent.protocol, 'ws');
    });

    it('should return failed when startReplica throws',
      async () => {
        const lifecycle = makeMockLifecycle({
          createReplica: (def) => {
            lifecycle._replicas.set(def.serviceId, {});
          },
          startReplica: () => {
            throw new Error('port exhausted');
          },
        });
        const freshDriver = new WasmComponentDriver();
        await freshDriver.prepare(
          makeDefinition(),
          {wasmLifecycle: lifecycle, replicaConfig: {}},
        );
        const result = await freshDriver.start(
          makeReplicaContext(),
        );
        assert.equal(result.status, START_STATUS.FAILED);
        assert.ok(result.error.includes(
          WASM_COMPONENT_ERROR.START_REPLICA_FAILED,
        ));
      });
  });

  describe('stop', () => {
    beforeEach(async () => {
      await driver.prepare(makeDefinition(), {});
      await driver.start(makeReplicaContext());
    });

    it('should stop a running service', async () => {
      await driver.stop(makeReplicaContext());
      const health = await driver.health(
        makeReplicaContext(),
      );
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
          assert.ok(err.message.includes(
            WASM_COMPONENT_ERROR.SERVICE_ID_REQUIRED,
          ));
          return true;
        },
      );
    });

    it('should delegate to lifecycle.stopReplica',
      async () => {
        const lifecycle = makeMockLifecycle();
        const freshDriver = new WasmComponentDriver();
        await freshDriver.prepare(
          makeDefinition(),
          {wasmLifecycle: lifecycle, replicaConfig: {
            replicaId: 'r1',
            replicaIds: ['r1'],
            dbPath: '/tmp/test.db',
          }},
        );
        await freshDriver.start(makeReplicaContext());
        await freshDriver.stop(makeReplicaContext());
        assert.equal(
          lifecycle._replicas.has('svc-wasm-1'), false,
        );
      });

    it('should throw DriverLifecycleError when stopReplica ' +
      'fails', async () => {
      const lifecycle = makeMockLifecycle({
        createReplica: (def) => {
          lifecycle._replicas.set(def.serviceId, {});
        },
        stopReplica: async () => {
          throw new Error('shutdown timeout');
        },
      });
      const freshDriver = new WasmComponentDriver();
      await freshDriver.prepare(
        makeDefinition(),
        {wasmLifecycle: lifecycle, replicaConfig: {}},
      );
      await freshDriver.start(makeReplicaContext());
      await assert.rejects(
        () => freshDriver.stop(makeReplicaContext()),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          assert.ok(err.message.includes(
            WASM_COMPONENT_ERROR.STOP_REPLICA_FAILED,
          ));
          return true;
        },
      );
    });
  });

  describe('health', () => {
    it('should return healthy for running service',
      async () => {
        await driver.prepare(makeDefinition(), {});
        await driver.start(makeReplicaContext());
        const result = await driver.health(
          makeReplicaContext(),
        );
        assert.equal(result.status, HEALTH_STATUS.HEALTHY);
      });

    it('should return unhealthy for prepared but not started',
      async () => {
        await driver.prepare(makeDefinition(), {});
        const result = await driver.health(
          makeReplicaContext(),
        );
        assert.equal(result.status, HEALTH_STATUS.UNHEALTHY);
        assert.ok(result.detail.includes(
          WASM_COMPONENT_ERROR.NOT_STARTED,
        ));
      });

    it('should return unhealthy for unknown service',
      async () => {
        const result = await driver.health(
          makeReplicaContext({serviceId: 'unknown'}),
        );
        assert.equal(result.status, HEALTH_STATUS.UNHEALTHY);
        assert.ok(result.detail.includes(
          WASM_COMPONENT_ERROR.NOT_PREPARED,
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

    it('should return healthy with lifecycle when replica ' +
      'exists', async () => {
      const lifecycle = makeMockLifecycle();
      const freshDriver = new WasmComponentDriver();
      await freshDriver.prepare(
        makeDefinition(),
        {wasmLifecycle: lifecycle, replicaConfig: {
          replicaId: 'r1',
          replicaIds: ['r1'],
          dbPath: '/tmp/test.db',
        }},
      );
      await freshDriver.start(makeReplicaContext());
      const result = await freshDriver.health(
        makeReplicaContext(),
      );
      assert.equal(result.status, HEALTH_STATUS.HEALTHY);
    });

    it('should return unhealthy with lifecycle when replica ' +
      'missing', async () => {
      const lifecycle = makeMockLifecycle({
        createReplica: () => {},
        getReplica: () => null,
      });
      const freshDriver = new WasmComponentDriver();
      await freshDriver.prepare(
        makeDefinition(),
        {wasmLifecycle: lifecycle, replicaConfig: {}},
      );
      await freshDriver.start(makeReplicaContext());
      const result = await freshDriver.health(
        makeReplicaContext(),
      );
      assert.equal(result.status, HEALTH_STATUS.UNHEALTHY);
      assert.ok(result.detail.includes(
        WASM_COMPONENT_ERROR.NOT_STARTED,
      ));
    });
  });

  describe('prepare with validation pipeline', () => {
    it('should pass when validationPipeline returns valid',
      async () => {
        const pipeline = () => ({valid: true, errors: []});
        const result = await driver.prepare(
          makeDefinition(),
          {validationPipeline: pipeline},
        );
        assert.equal(result.status, PREPARE_STATUS.READY);
      });

    it('should fail when validationPipeline returns invalid',
      async () => {
        const pipeline = () => ({
          valid: false,
          errors: ['manifest invalid'],
        });
        const result = await driver.prepare(
          makeDefinition(),
          {validationPipeline: pipeline},
        );
        assert.equal(result.status, PREPARE_STATUS.FAILED);
        assert.ok(result.error.includes(
          WASM_COMPONENT_ERROR.VALIDATION_PIPELINE_FAILED,
        ));
        assert.ok(result.error.includes('manifest invalid'));
      });

    it('should pass when dependencyResolver returns resolved',
      async () => {
        const resolver = () => ({
          resolved: true,
          resolvedDependencies: [],
        });
        const result = await driver.prepare(
          makeDefinition(),
          {dependencyResolver: resolver},
        );
        assert.equal(result.status, PREPARE_STATUS.READY);
      });

    it('should fail when dependencyResolver returns ' +
      'unresolved', async () => {
      const resolver = () => ({
        resolved: false,
        errors: ['dep not found'],
      });
      const result = await driver.prepare(
        makeDefinition(),
        {dependencyResolver: resolver},
      );
      assert.equal(result.status, PREPARE_STATUS.FAILED);
      assert.ok(result.error.includes(
        WASM_COMPONENT_ERROR.DEPENDENCY_RESOLUTION_FAILED,
      ));
      assert.ok(result.error.includes('dep not found'));
    });

    it('should pass when lockValidator returns valid',
      async () => {
        const validator = () => ({valid: true});
        const result = await driver.prepare(
          makeDefinition(),
          {lockValidator: validator},
        );
        assert.equal(result.status, PREPARE_STATUS.READY);
      });

    it('should fail when lockValidator returns invalid',
      async () => {
        const validator = () => ({
          valid: false,
          errors: ['lock drift'],
        });
        const result = await driver.prepare(
          makeDefinition(),
          {lockValidator: validator},
        );
        assert.equal(result.status, PREPARE_STATUS.FAILED);
        assert.ok(result.error.includes(
          WASM_COMPONENT_ERROR.LOCK_VALIDATION_FAILED,
        ));
        assert.ok(result.error.includes('lock drift'));
      });

    it('should run validators in sequence and stop on ' +
      'first failure', async () => {
      let resolverCalled = false;
      const pipeline = () => ({
        valid: false,
        errors: ['bad manifest'],
      });
      const resolver = () => {
        resolverCalled = true;
        return {resolved: true, resolvedDependencies: []};
      };
      const result = await driver.prepare(
        makeDefinition(),
        {
          validationPipeline: pipeline,
          dependencyResolver: resolver,
        },
      );
      assert.equal(result.status, PREPARE_STATUS.FAILED);
      assert.ok(result.error.includes(
        WASM_COMPONENT_ERROR.VALIDATION_PIPELINE_FAILED,
      ));
      assert.equal(resolverCalled, false);
    });

    it('should skip validation when no validators provided',
      async () => {
        const result = await driver.prepare(
          makeDefinition(), {},
        );
        assert.equal(result.status, PREPARE_STATUS.READY);
      });
  });

  describe('full lifecycle', () => {
    it('should complete prepare -> start -> health -> stop',
      async () => {
        const prep = await driver.prepare(
          makeDefinition(), {},
        );
        assert.equal(prep.status, PREPARE_STATUS.READY);

        const start = await driver.start(
          makeReplicaContext(),
        );
        assert.equal(start.status, START_STATUS.RUNNING);

        const health = await driver.health(
          makeReplicaContext(),
        );
        assert.equal(health.status, HEALTH_STATUS.HEALTHY);

        await driver.stop(makeReplicaContext());

        const postStop = await driver.health(
          makeReplicaContext(),
        );
        assert.equal(
          postStop.status, HEALTH_STATUS.UNHEALTHY,
        );
      });

    it('should complete full lifecycle with mock lifecycle',
      async () => {
        const lifecycle = makeMockLifecycle();
        const freshDriver = new WasmComponentDriver();

        const prep = await freshDriver.prepare(
          makeDefinition(),
          {wasmLifecycle: lifecycle, replicaConfig: {
            replicaId: 'r1',
            replicaIds: ['r1'],
            dbPath: '/tmp/test.db',
          }},
        );
        assert.equal(prep.status, PREPARE_STATUS.READY);

        const start = await freshDriver.start(
          makeReplicaContext(),
        );
        assert.equal(start.status, START_STATUS.RUNNING);

        const health = await freshDriver.health(
          makeReplicaContext(),
        );
        assert.equal(health.status, HEALTH_STATUS.HEALTHY);

        await freshDriver.stop(makeReplicaContext());

        const postStop = await freshDriver.health(
          makeReplicaContext(),
        );
        assert.equal(
          postStop.status, HEALTH_STATUS.UNHEALTHY,
        );
      });
  });
});
