/**
 * Tests that a disabled OCI container feature gate produces
 * explicit, typed, unsupported errors — never silent failures,
 * never fallback behavior.
 *
 * Distinct from contract tests (oci-container-driver-contract):
 * this file focuses exclusively on DISABLED GATE error behavior,
 * verifying errors are typed, carry diagnostic metadata, and
 * serialize correctly.
 *
 * Validates: Requirements 4.3, 12.5
 */
// @ts-nocheck


import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  OciContainerDriver,
  OCI_DRIVER_ERROR,
} from '../../src/runtime/oci-container-driver.js';
import {HEALTH_STATUS} from '../../src/runtime/runtime-driver.js';
import {
  DriverLifecycleError,
} from '../../src/runtime/runtime-driver-errors.js';
import {BaseError} from '../../src/utils/base-error.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  RuntimeDriverRegistry,
} from '../../src/runtime/runtime-driver-registry.js';

// --- Helpers ---

const VALID_REF =
  'registry.example.com/img@sha256:aabbccdd';

function makeDef(serviceId = 'svc-1') {
  return {serviceId, runtime_ref: VALID_REF};
}

function makeCtx(serviceId = 'svc-1') {
  return {serviceId};
}

describe('OCI container disabled-gate errors', () => {
  let driver;

  beforeEach(() => {
    driver = new OciContainerDriver();
    // Gate stays disabled (default) — the whole point
  });

  // ---------------------------------------------------
  // 1. prepare() with disabled gate
  // ---------------------------------------------------
  describe('prepare() with disabled gate', () => {
    it('throws DriverLifecycleError, not generic Error',
      async () => {
        await assert.rejects(
          () => driver.prepare(makeDef(), {}),
          (err) => {
            assert.ok(err instanceof DriverLifecycleError);
            assert.ok(
              !(err.constructor === Error),
              'must not be a plain Error',
            );
            return true;
          },
        );
      });

    it('error message includes FEATURE_GATE_DISABLED',
      async () => {
        await assert.rejects(
          () => driver.prepare(makeDef(), {}),
          (err) => {
            assert.ok(err.message.includes(
              OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
            ));
            return true;
          },
        );
      });

    it('error has driverKind set to oci_container',
      async () => {
        await assert.rejects(
          () => driver.prepare(makeDef(), {}),
          (err) => {
            assert.equal(
              err.driverKind,
              RUNTIME_KIND.OCI_CONTAINER,
            );
            return true;
          },
        );
      });

    it('error has operation set to prepare', async () => {
      await assert.rejects(
        () => driver.prepare(makeDef(), {}),
        (err) => {
          assert.equal(err.operation, 'prepare');
          return true;
        },
      );
    });

    it('does not silently succeed or return a result',
      async () => {
        let returned = false;
        try {
          await driver.prepare(makeDef(), {});
          returned = true;
        } catch (_e) {
          // expected
        }
        assert.equal(returned, false,
          'prepare must throw, not return');
      });
  });

  // ---------------------------------------------------
  // 2. start() with disabled gate
  // ---------------------------------------------------
  describe('start() with disabled gate', () => {
    it('throws DriverLifecycleError', async () => {
      await assert.rejects(
        () => driver.start(makeCtx()),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          return true;
        },
      );
    });

    it('error message includes FEATURE_GATE_DISABLED',
      async () => {
        await assert.rejects(
          () => driver.start(makeCtx()),
          (err) => {
            assert.ok(err.message.includes(
              OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
            ));
            return true;
          },
        );
      });

    it('error has driverKind set to oci_container',
      async () => {
        await assert.rejects(
          () => driver.start(makeCtx()),
          (err) => {
            assert.equal(
              err.driverKind,
              RUNTIME_KIND.OCI_CONTAINER,
            );
            return true;
          },
        );
      });

    it('error has operation set to start', async () => {
      await assert.rejects(
        () => driver.start(makeCtx()),
        (err) => {
          assert.equal(err.operation, 'start');
          return true;
        },
      );
    });
  });

  // ---------------------------------------------------
  // 3. stop() with disabled gate
  // ---------------------------------------------------
  describe('stop() with disabled gate', () => {
    it('throws DriverLifecycleError', async () => {
      await assert.rejects(
        () => driver.stop(makeCtx()),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          return true;
        },
      );
    });

    it('error message includes FEATURE_GATE_DISABLED',
      async () => {
        await assert.rejects(
          () => driver.stop(makeCtx()),
          (err) => {
            assert.ok(err.message.includes(
              OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
            ));
            return true;
          },
        );
      });

    it('error has driverKind set to oci_container',
      async () => {
        await assert.rejects(
          () => driver.stop(makeCtx()),
          (err) => {
            assert.equal(
              err.driverKind,
              RUNTIME_KIND.OCI_CONTAINER,
            );
            return true;
          },
        );
      });

    it('error has operation set to stop', async () => {
      await assert.rejects(
        () => driver.stop(makeCtx()),
        (err) => {
          assert.equal(err.operation, 'stop');
          return true;
        },
      );
    });
  });

  // ---------------------------------------------------
  // 4. health() with disabled gate
  // ---------------------------------------------------
  describe('health() with disabled gate', () => {
    it('does NOT throw — returns a result', async () => {
      const h = await driver.health(makeCtx());
      assert.equal(typeof h, 'object');
    });

    it('returns status unknown', async () => {
      const h = await driver.health(makeCtx());
      assert.equal(h.status, HEALTH_STATUS.UNKNOWN);
    });

    it('returns detail with FEATURE_GATE_DISABLED',
      async () => {
        const h = await driver.health(makeCtx());
        assert.equal(
          h.detail,
          OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
        );
      });

    it('detail message is explicit and diagnostic',
      async () => {
        const h = await driver.health(makeCtx());
        assert.ok(
          h.detail.length > 0,
          'detail must not be empty',
        );
        assert.ok(
          h.detail.includes('oci_container'),
          'detail should mention the runtime kind',
        );
        assert.ok(
          h.detail.includes('disabled'),
          'detail should mention disabled state',
        );
      });
  });

  // ---------------------------------------------------
  // 5. validateDescriptor() ignores feature gate
  // ---------------------------------------------------
  describe('validateDescriptor() with disabled gate', () => {
    it('returns valid for a correct descriptor', () => {
      const r = driver.validateDescriptor(makeDef());
      assert.equal(r.valid, true);
    });

    it('returns invalid for a bad descriptor', () => {
      const r = driver.validateDescriptor({
        serviceId: 'svc-1',
        runtime_ref: 'no-digest',
      });
      assert.equal(r.valid, false);
      assert.ok(r.errors.length > 0);
    });

    it('does not check feature gate at all', () => {
      // Gate is disabled, but validation still works
      const valid = driver.validateDescriptor(makeDef());
      assert.equal(valid.valid, true);

      const invalid = driver.validateDescriptor(null);
      assert.equal(invalid.valid, false);
    });
  });

  // ---------------------------------------------------
  // 6. Registry integration with disabled gate
  // ---------------------------------------------------
  describe('registry integration with disabled gate', () => {
    let registry;

    beforeEach(() => {
      registry = new RuntimeDriverRegistry();
      registry.register(driver);
    });

    it('registry resolves the driver by kind', () => {
      const resolved = registry.getDriver(
        RUNTIME_KIND.OCI_CONTAINER,
      );
      assert.equal(resolved, driver);
    });

    it('resolved driver prepare throws gate error',
      async () => {
        const resolved = registry.getDriver(
          RUNTIME_KIND.OCI_CONTAINER,
        );
        await assert.rejects(
          () => resolved.prepare(makeDef(), {}),
          (err) => {
            assert.ok(err instanceof DriverLifecycleError);
            assert.ok(err.message.includes(
              OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
            ));
            return true;
          },
        );
      });

    it('resolved driver start throws gate error',
      async () => {
        const resolved = registry.getDriver(
          RUNTIME_KIND.OCI_CONTAINER,
        );
        await assert.rejects(
          () => resolved.start(makeCtx()),
          (err) => {
            assert.ok(err instanceof DriverLifecycleError);
            return true;
          },
        );
      });

    it('resolved driver stop throws gate error',
      async () => {
        const resolved = registry.getDriver(
          RUNTIME_KIND.OCI_CONTAINER,
        );
        await assert.rejects(
          () => resolved.stop(makeCtx()),
          (err) => {
            assert.ok(err instanceof DriverLifecycleError);
            return true;
          },
        );
      });

    it('resolved driver health returns unknown (no throw)',
      async () => {
        const resolved = registry.getDriver(
          RUNTIME_KIND.OCI_CONTAINER,
        );
        const h = await resolved.health(makeCtx());
        assert.equal(h.status, HEALTH_STATUS.UNKNOWN);
        assert.equal(
          h.detail,
          OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
        );
      });

    it('registry does not gate — driver does', () => {
      // Registry resolves without error
      const resolved = registry.getDriver(
        RUNTIME_KIND.OCI_CONTAINER,
      );
      assert.ok(resolved instanceof OciContainerDriver);
      // The gate check is the driver's responsibility
      assert.equal(resolved._featureGateEnabled, false);
    });
  });

  // ---------------------------------------------------
  // 7. Error type verification
  // ---------------------------------------------------
  describe('error type verification', () => {
    it('errors are instances of DriverLifecycleError',
      async () => {
        try {
          await driver.prepare(makeDef(), {});
          assert.fail('should have thrown');
        } catch (err) {
          assert.ok(err instanceof DriverLifecycleError);
        }
      });

    it('errors are instances of BaseError', async () => {
      try {
        await driver.prepare(makeDef(), {});
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err instanceof BaseError);
      }
    });

    it('errors are instances of Error', async () => {
      try {
        await driver.prepare(makeDef(), {});
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err instanceof Error);
      }
    });

    it('errors serialize to JSON with context metadata',
      async () => {
        try {
          await driver.prepare(makeDef(), {});
          assert.fail('should have thrown');
        } catch (err) {
          const json = err.toJSON();
          assert.equal(json.name, 'DriverLifecycleError');
          assert.ok(json.message.includes(
            OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
          ));
          assert.equal(
            json.context.component,
            'RuntimeDriver',
          );
          assert.equal(json.context.operation, 'prepare');
          assert.equal(
            json.context.metadata.driverKind,
            RUNTIME_KIND.OCI_CONTAINER,
          );
        }
      });

    it('each operation serializes its own operation name',
      async () => {
        const ops = ['prepare', 'start', 'stop'];
        for (const op of ops) {
          try {
            await driver[op](
              op === 'prepare' ? makeDef() : makeCtx(),
              op === 'prepare' ? {} : undefined,
            );
            assert.fail(`${op} should have thrown`);
          } catch (err) {
            const json = err.toJSON();
            assert.equal(json.context.operation, op);
            assert.equal(
              json.context.metadata.driverKind,
              RUNTIME_KIND.OCI_CONTAINER,
            );
          }
        }
      });

    it('error has a stack trace', async () => {
      try {
        await driver.prepare(makeDef(), {});
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err.stack);
        assert.ok(err.stack.length > 0);
      }
    });
  });
});
