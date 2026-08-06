/**
 * Contract conformance tests for WasmComponentDriver.
 *
 * Proves the driver satisfies the abstract RuntimeDriver contract:
 *   1. Contract method existence
 *   2. Return type conformance
 *   3. Error type conformance
 *   4. Idempotency conformance
 *   5. No direct metadata writes
 *   6. Property-based contract invariants
 *
 * Validates: Requirements 14.2, 14.5
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  WasmComponentDriver,
} from '../../src/runtime/wasm-component-driver.js';
import {
  RuntimeDriver,
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {
  DriverValidationError,
  DriverLifecycleError,
} from '../../src/runtime/runtime-driver-errors.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';

// --- Contract method names ---
const CONTRACT_METHODS = [
  'validateDescriptor',
  'prepare',
  'start',
  'stop',
  'health',
  'requiresRuntimeReconciliation',
  'invoke',
];

describe('WasmComponentDriver contract conformance', () => {
  let driver;

  beforeEach(() => {
    driver = new WasmComponentDriver();
  });

  // -------------------------------------------------------
  // 1. Contract method existence
  // -------------------------------------------------------
  describe('contract method existence', () => {
    it('should be an instance of RuntimeDriver', () => {
      assert.ok(driver instanceof RuntimeDriver);
    });

    it('should have kind set to wasm_component', () => {
      assert.equal(driver.kind, RUNTIME_KIND.WASM_COMPONENT);
    });

    it('should implement validateDescriptor', () => {
      assert.equal(typeof driver.validateDescriptor, 'function');
    });

    it('should implement prepare', () => {
      assert.equal(typeof driver.prepare, 'function');
    });

    it('should implement start', () => {
      assert.equal(typeof driver.start, 'function');
    });

    it('should implement stop', () => {
      assert.equal(typeof driver.stop, 'function');
    });

    it('should implement health', () => {
      assert.equal(typeof driver.health, 'function');
    });
  });

  // -------------------------------------------------------
  // 2. Return type conformance
  // -------------------------------------------------------
  describe('return type conformance', () => {
    it('validateDescriptor returns {valid: true} for valid input', () => {
      const result = driver.validateDescriptor({
        serviceId: 'svc-1',
        runtime_ref: 'mod-v1',
      });
      assert.equal(result.valid, true);
      assert.equal(result.errors, undefined);
    });

    it('validateDescriptor returns {valid: false, errors: string[]} on failure', () => {
      const result = driver.validateDescriptor(null);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.length > 0);
      result.errors.forEach((e) => {
        assert.equal(typeof e, 'string');
      });
    });

    it('prepare returns {status: READY} on success', async () => {
      const def = {serviceId: 'svc-rt', runtime_ref: 'ref-1'};
      const result = await driver.prepare(def, {});
      assert.equal(typeof result.status, 'string');
      assert.equal(result.status, PREPARE_STATUS.READY);
    });

    it('prepare returns {status: FAILED, error: string} on failure', async () => {
      const def = {serviceId: 'svc-rt', runtime_ref: 'ref-1'};
      const failPipeline = () => ({
        valid: false,
        errors: ['boom'],
      });
      const result = await driver.prepare(def, {
        validationPipeline: failPipeline,
      });
      assert.equal(result.status, PREPARE_STATUS.FAILED);
      assert.equal(typeof result.error, 'string');
    });

    it('start returns {status: RUNNING} on success', async () => {
      const def = {serviceId: 'svc-rt', runtime_ref: 'ref-1'};
      await driver.prepare(def, {});
      const result = await driver.start({serviceId: 'svc-rt'});
      assert.equal(typeof result.status, 'string');
      assert.equal(result.status, START_STATUS.RUNNING);
    });

    it('start returns {status: FAILED, error: string} on failure', async () => {
      const result = await driver.start({serviceId: 'no-such'});
      assert.equal(result.status, START_STATUS.FAILED);
      assert.equal(typeof result.error, 'string');
    });

    it('health returns {status: string}', async () => {
      const def = {serviceId: 'svc-h', runtime_ref: 'ref-1'};
      await driver.prepare(def, {});
      await driver.start({serviceId: 'svc-h'});
      const result = await driver.health({serviceId: 'svc-h'});
      assert.equal(typeof result.status, 'string');
      assert.equal(result.status, HEALTH_STATUS.HEALTHY);
    });

    it('health returns {status: string, detail: string} on failure', async () => {
      const result = await driver.health({serviceId: 'missing'});
      assert.equal(typeof result.status, 'string');
      assert.equal(typeof result.detail, 'string');
    });

    it('stop returns void (undefined) on success', async () => {
      const def = {serviceId: 'svc-s', runtime_ref: 'ref-1'};
      await driver.prepare(def, {});
      await driver.start({serviceId: 'svc-s'});
      const result = await driver.stop({serviceId: 'svc-s'});
      assert.equal(result, undefined);
    });
  });

  // -------------------------------------------------------
  // 3. Error type conformance
  // -------------------------------------------------------
  describe('error type conformance', () => {
    it('prepare throws DriverValidationError for invalid descriptor', async () => {
      await assert.rejects(
        () => driver.prepare(null, {}),
        (err) => {
          assert.ok(err instanceof DriverValidationError);
          assert.equal(err.driverKind, RUNTIME_KIND.WASM_COMPONENT);
          assert.ok(Array.isArray(err.validationErrors));
          return true;
        },
      );
    });

    it('start throws DriverLifecycleError for null context', async () => {
      await assert.rejects(
        () => driver.start(null),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          assert.equal(err.driverKind, RUNTIME_KIND.WASM_COMPONENT);
          assert.equal(err.operation, 'start');
          return true;
        },
      );
    });

    it('stop throws DriverLifecycleError for null context', async () => {
      await assert.rejects(
        () => driver.stop(null),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          assert.equal(err.driverKind, RUNTIME_KIND.WASM_COMPONENT);
          assert.equal(err.operation, 'stop');
          return true;
        },
      );
    });

    it('health returns UNKNOWN status for null context (no throw)', async () => {
      const result = await driver.health(null);
      assert.equal(result.status, HEALTH_STATUS.UNKNOWN);
      assert.equal(typeof result.detail, 'string');
    });
  });

  // -------------------------------------------------------
  // 4. Idempotency conformance
  // -------------------------------------------------------
  describe('idempotency conformance', () => {
    it('prepare is idempotent (double prepare succeeds)', async () => {
      const def = {serviceId: 'svc-idem', runtime_ref: 'ref-1'};
      const r1 = await driver.prepare(def, {});
      const r2 = await driver.prepare(def, {});
      assert.equal(r1.status, PREPARE_STATUS.READY);
      assert.equal(r2.status, PREPARE_STATUS.READY);
    });

    it('start is idempotent (double start succeeds)', async () => {
      const def = {serviceId: 'svc-idem2', runtime_ref: 'ref-1'};
      await driver.prepare(def, {});
      const r1 = await driver.start({serviceId: 'svc-idem2'});
      const r2 = await driver.start({serviceId: 'svc-idem2'});
      assert.equal(r1.status, START_STATUS.RUNNING);
      assert.equal(r2.status, START_STATUS.RUNNING);
    });

    it('stop is idempotent (double stop succeeds)', async () => {
      const def = {serviceId: 'svc-idem3', runtime_ref: 'ref-1'};
      await driver.prepare(def, {});
      await driver.start({serviceId: 'svc-idem3'});
      const r1 = await driver.stop({serviceId: 'svc-idem3'});
      const r2 = await driver.stop({serviceId: 'svc-idem3'});
      assert.equal(r1, undefined);
      assert.equal(r2, undefined);
    });
  });

  // -------------------------------------------------------
  // 5. No direct metadata writes
  // -------------------------------------------------------
  describe('no direct metadata writes', () => {
    it('driver has no SQL/CDC write methods', () => {
      const proto = Object.getOwnPropertyNames(
        WasmComponentDriver.prototype,
      );
      const sqlPatterns = [
        /sql/i, /query/i, /insert/i, /update/i, /delete/i,
        /cdc/i, /write.*table/i, /system.*table/i,
      ];
      for (const name of proto) {
        for (const pattern of sqlPatterns) {
          assert.equal(
            pattern.test(name), false,
            `prototype method '${name}' matches SQL/CDC pattern`,
          );
        }
      }
    });

    it('driver has no system table references', () => {
      const proto = Object.getOwnPropertyNames(
        WasmComponentDriver.prototype,
      );
      const tablePatterns = [
        /systemTable/i, /systemCache/i, /partitionWrite/i,
      ];
      for (const name of proto) {
        for (const pattern of tablePatterns) {
          assert.equal(
            pattern.test(name), false,
            `prototype method '${name}' matches system table pattern`,
          );
        }
      }
    });

    it('prototype only has contract methods and constructor', () => {
      const proto = Object.getOwnPropertyNames(
        WasmComponentDriver.prototype,
      );
      const allowed = new Set([
        'constructor',
        ...CONTRACT_METHODS,
        'setArtifactLoader',
        'setRequestCallBridge',
        // Whole-node teardown chain (node-shutdown-cell-worker-teardown):
        // the driver terminates every live cell worker at node shutdown.
        'shutdown',
      ]);
      for (const name of proto) {
        assert.ok(
          allowed.has(name),
          `unexpected prototype method: '${name}'`,
        );
      }
    });
  });

  // -------------------------------------------------------
  // 6. Property-based contract invariants
  // -------------------------------------------------------
  describe('property-based contract invariants', () => {
    it('validateDescriptor always returns {valid: boolean} for any input', () => {
      fc.assert(fc.property(
        fc.anything(),
        (input) => {
          const result = driver.validateDescriptor(input);
          assert.equal(typeof result.valid, 'boolean');
          if (!result.valid) {
            assert.ok(Array.isArray(result.errors));
            assert.ok(result.errors.length > 0);
          }
        },
      ), {numRuns: 10});
    });

    it('health never throws for any input', async () => {
      await fc.assert(fc.asyncProperty(
        fc.anything(),
        async (input) => {
          const result = await driver.health(input);
          assert.ok(result);
          assert.equal(typeof result.status, 'string');
        },
      ), {numRuns: 10});
    });

    it('valid descriptor always leads to successful prepare', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({minLength: 1}).filter((s) => s.trim().length > 0),
        async (ref) => {
          const freshDriver = new WasmComponentDriver();
          const def = {serviceId: 'svc-pbt', runtime_ref: ref};
          const result = await freshDriver.prepare(def, {});
          assert.equal(result.status, PREPARE_STATUS.READY);
        },
      ), {numRuns: 10});
    });

    it('prepared service always starts successfully', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({minLength: 1}).filter((s) => s.trim().length > 0),
        async (ref) => {
          const freshDriver = new WasmComponentDriver();
          const def = {serviceId: 'svc-pbt', runtime_ref: ref};
          await freshDriver.prepare(def, {});
          const result = await freshDriver.start(
            {serviceId: 'svc-pbt'},
          );
          assert.equal(result.status, START_STATUS.RUNNING);
        },
      ), {numRuns: 10});
    });
  });
});
