// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  RuntimeDriver,
  VALIDATION_STATUS,
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {
  DriverNotImplementedError,
  DriverValidationError,
  DriverLifecycleError,
} from '../../src/runtime/runtime-driver-errors.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';

// --- Minimal concrete subclass for testing the contract ---

class TestDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
}

class FullDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.WASM_COMPONENT);
  }
  validateDescriptor(_definition) {
    return {valid: true};
  }
  async prepare(_definition, _context) {
    return {status: PREPARE_STATUS.READY};
  }
  async start(_replicaContext) {
    return {status: START_STATUS.RUNNING};
  }
  async stop(_replicaContext) {}
  async health(_replicaContext) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

describe('RuntimeDriver contract', () => {
  describe('abstract guard', () => {
    it('should throw when instantiated directly', () => {
      assert.throws(
        () => new RuntimeDriver(RUNTIME_KIND.NATIVE_JS),
        (err) => err.message.includes('abstract'),
      );
    });
  });

  describe('constructor validation', () => {
    it('should reject invalid runtime kind', () => {
      assert.throws(
        () => {
          class Bad extends RuntimeDriver {
            constructor() {
              super('invalid_kind');
            }
          }
          return new Bad();
        },
        (err) => err.message.includes('valid runtime kind'),
      );
    });

    it('should reject non-string runtime kind', () => {
      assert.throws(
        () => {
          class Bad extends RuntimeDriver {
            constructor() {
              super(42);
            }
          }
          return new Bad();
        },
        (err) => err.message.includes('valid runtime kind'),
      );
    });

    it('should set kind as readonly property', () => {
      const driver = new TestDriver();
      assert.equal(driver.kind, RUNTIME_KIND.NATIVE_JS);
      assert.throws(() => {
        driver.kind = 'other';
      });
    });

    it('should accept all allowed runtime kinds', () => {
      class NativeDriver extends RuntimeDriver {
        constructor() {
          super(RUNTIME_KIND.NATIVE_JS);
        }
      }
      class WasmDriver extends RuntimeDriver {
        constructor() {
          super(RUNTIME_KIND.WASM_COMPONENT);
        }
      }
      class OciDriver extends RuntimeDriver {
        constructor() {
          super(RUNTIME_KIND.OCI_CONTAINER);
        }
      }
      assert.equal(new NativeDriver().kind, RUNTIME_KIND.NATIVE_JS);
      assert.equal(new WasmDriver().kind, RUNTIME_KIND.WASM_COMPONENT);
      assert.equal(new OciDriver().kind, RUNTIME_KIND.OCI_CONTAINER);
    });
  });

  describe('unimplemented methods throw DriverNotImplementedError', () => {
    const driver = new TestDriver();

    it('validateDescriptor throws', () => {
      assert.throws(
        () => driver.validateDescriptor({}),
        (err) => {
          assert.ok(err instanceof DriverNotImplementedError);
          assert.equal(err.driverKind, RUNTIME_KIND.NATIVE_JS);
          assert.equal(err.methodName, 'validateDescriptor');
          return true;
        },
      );
    });

    it('prepare throws', async () => {
      await assert.rejects(
        () => driver.prepare({}, {}),
        (err) => {
          assert.ok(err instanceof DriverNotImplementedError);
          assert.equal(err.methodName, 'prepare');
          return true;
        },
      );
    });

    it('start throws', async () => {
      await assert.rejects(
        () => driver.start({}),
        (err) => {
          assert.ok(err instanceof DriverNotImplementedError);
          assert.equal(err.methodName, 'start');
          return true;
        },
      );
    });

    it('stop throws', async () => {
      await assert.rejects(
        () => driver.stop({}),
        (err) => {
          assert.ok(err instanceof DriverNotImplementedError);
          assert.equal(err.methodName, 'stop');
          return true;
        },
      );
    });

    it('health throws', async () => {
      await assert.rejects(
        () => driver.health({}),
        (err) => {
          assert.ok(err instanceof DriverNotImplementedError);
          assert.equal(err.methodName, 'health');
          return true;
        },
      );
    });
  });

  describe('fully implemented driver', () => {
    const driver = new FullDriver();

    it('should have correct kind', () => {
      assert.equal(driver.kind, RUNTIME_KIND.WASM_COMPONENT);
    });

    it('validateDescriptor returns valid result', () => {
      const result = driver.validateDescriptor({});
      assert.equal(result.valid, true);
    });

    it('prepare returns ready status', async () => {
      const result = await driver.prepare({}, {});
      assert.equal(result.status, PREPARE_STATUS.READY);
    });

    it('start returns running status', async () => {
      const result = await driver.start({});
      assert.equal(result.status, START_STATUS.RUNNING);
    });

    it('stop resolves without error', async () => {
      await driver.stop({});
    });

    it('health returns healthy status', async () => {
      const result = await driver.health({});
      assert.equal(result.status, HEALTH_STATUS.HEALTHY);
    });
  });

  describe('result status constants', () => {
    it('VALIDATION_STATUS has expected values', () => {
      assert.equal(VALIDATION_STATUS.VALID, 'valid');
      assert.equal(VALIDATION_STATUS.INVALID, 'invalid');
      assert.equal(Object.keys(VALIDATION_STATUS).length, 2);
    });

    it('PREPARE_STATUS has expected values', () => {
      assert.equal(PREPARE_STATUS.READY, 'ready');
      assert.equal(PREPARE_STATUS.FAILED, 'failed');
      assert.equal(Object.keys(PREPARE_STATUS).length, 2);
    });

    it('START_STATUS has expected values', () => {
      assert.equal(START_STATUS.RUNNING, 'running');
      assert.equal(START_STATUS.FAILED, 'failed');
      assert.equal(Object.keys(START_STATUS).length, 2);
    });

    it('HEALTH_STATUS has expected values', () => {
      assert.equal(HEALTH_STATUS.HEALTHY, 'healthy');
      assert.equal(HEALTH_STATUS.UNHEALTHY, 'unhealthy');
      assert.equal(HEALTH_STATUS.UNKNOWN, 'unknown');
      assert.equal(Object.keys(HEALTH_STATUS).length, 3);
    });

    it('all status objects are frozen', () => {
      assert.ok(Object.isFrozen(VALIDATION_STATUS));
      assert.ok(Object.isFrozen(PREPARE_STATUS));
      assert.ok(Object.isFrozen(START_STATUS));
      assert.ok(Object.isFrozen(HEALTH_STATUS));
    });
  });
});

describe('RuntimeDriver typed errors', () => {
  describe('DriverNotImplementedError', () => {
    it('should include driver kind and method name', () => {
      const err = new DriverNotImplementedError('native_js', 'start');
      assert.equal(err.driverKind, 'native_js');
      assert.equal(err.methodName, 'start');
      assert.ok(err.message.includes('native_js'));
      assert.ok(err.message.includes('start'));
      assert.equal(err.name, 'DriverNotImplementedError');
    });

    it('should have context metadata', () => {
      const err = new DriverNotImplementedError('wasm_component', 'health');
      assert.equal(err.context.component, 'RuntimeDriver');
      assert.equal(err.context.operation, 'health');
      assert.equal(err.context.metadata.driverKind, 'wasm_component');
    });

    it('should serialize to JSON', () => {
      const err = new DriverNotImplementedError('native_js', 'prepare');
      const json = err.toJSON();
      assert.equal(json.name, 'DriverNotImplementedError');
      assert.ok(json.message.includes('prepare'));
    });
  });

  describe('DriverValidationError', () => {
    it('should include driver kind and validation errors', () => {
      const errors = ['ref is required', 'config is invalid'];
      const err = new DriverValidationError('oci_container', errors);
      assert.equal(err.driverKind, 'oci_container');
      assert.deepStrictEqual(err.validationErrors, errors);
      assert.ok(err.message.includes('oci_container'));
      assert.ok(err.message.includes('ref is required'));
      assert.equal(err.name, 'DriverValidationError');
    });
  });

  describe('DriverLifecycleError', () => {
    it('should include driver kind and operation', () => {
      const err = new DriverLifecycleError(
        'wasm_component', 'start', 'module not found',
      );
      assert.equal(err.driverKind, 'wasm_component');
      assert.equal(err.operation, 'start');
      assert.ok(err.message.includes('start'));
      assert.ok(err.message.includes('module not found'));
      assert.equal(err.name, 'DriverLifecycleError');
    });

    it('should support cause chaining', () => {
      const cause = new Error('underlying failure');
      const err = new DriverLifecycleError(
        'native_js', 'stop', 'handler threw', {cause},
      );
      assert.equal(err.cause, cause);
    });
  });
});
