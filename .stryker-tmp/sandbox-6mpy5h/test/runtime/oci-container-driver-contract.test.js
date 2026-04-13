/**
 * Contract conformance tests for OCI_Container_Driver
 * startup/shutdown/health lifecycle semantics.
 *
 * Validates: Requirements 4.4, 14.2
 */
// @ts-nocheck


import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  OciContainerDriver,
  OCI_DRIVER_ERROR,
} from '../../src/runtime/oci-container-driver.js';
import {
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {
  DriverLifecycleError,
} from '../../src/runtime/runtime-driver-errors.js';


// --- Helpers ---

const VALID_REF =
  'registry.example.com/img@sha256:aabbccdd';

function makeDef(serviceId = 'svc-1') {
  return {serviceId, runtime_ref: VALID_REF};
}

function makeCtx(serviceId = 'svc-1') {
  return {serviceId};
}

describe('OciContainerDriver contract', () => {
  let driver;

  beforeEach(() => {
    driver = new OciContainerDriver();
    driver.setFeatureGate(true);
  });

  // -------------------------------------------------------
  // 1. Startup contract
  // -------------------------------------------------------
  describe('startup contract', () => {
    it('prepare must succeed before start can succeed',
      async () => {
        await driver.prepare(makeDef(), {});
        const r = await driver.start(makeCtx());
        assert.equal(r.status, START_STATUS.RUNNING);
      });

    it('start on unprepared service returns failed status',
      async () => {
        const r = await driver.start(makeCtx());
        assert.equal(r.status, START_STATUS.FAILED);
        assert.ok(r.error.includes(
          OCI_DRIVER_ERROR.NOT_PREPARED,
        ));
      });

    it('start is idempotent (double start returns running)',
      async () => {
        await driver.prepare(makeDef(), {});
        await driver.start(makeCtx());
        const r = await driver.start(makeCtx());
        assert.equal(r.status, START_STATUS.RUNNING);
      });

    it('start requires valid replicaContext with serviceId',
      async () => {
        await driver.prepare(makeDef(), {});
        await assert.rejects(
          () => driver.start(null),
          (err) => {
            assert.ok(err instanceof DriverLifecycleError);
            assert.ok(err.message.includes(
              OCI_DRIVER_ERROR.REPLICA_CONTEXT_REQUIRED,
            ));
            return true;
          },
        );
        await assert.rejects(
          () => driver.start({}),
          (err) => {
            assert.ok(err instanceof DriverLifecycleError);
            assert.ok(err.message.includes(
              OCI_DRIVER_ERROR.SERVICE_ID_REQUIRED,
            ));
            return true;
          },
        );
      });

    it('after start, health returns healthy', async () => {
      await driver.prepare(makeDef(), {});
      await driver.start(makeCtx());
      const h = await driver.health(makeCtx());
      assert.equal(h.status, HEALTH_STATUS.HEALTHY);
    });
  });

  // -------------------------------------------------------
  // 2. Shutdown contract
  // -------------------------------------------------------
  describe('shutdown contract', () => {
    beforeEach(async () => {
      await driver.prepare(makeDef(), {});
      await driver.start(makeCtx());
    });

    it('stop cleans up prepared and running state',
      async () => {
        await driver.stop(makeCtx());
        assert.equal(driver._prepared.has('svc-1'), false);
        assert.equal(driver._running.has('svc-1'), false);
      });

    it('stop is idempotent (double stop does not throw)',
      async () => {
        await driver.stop(makeCtx());
        await driver.stop(makeCtx());
      });

    it('after stop, health returns unhealthy', async () => {
      await driver.stop(makeCtx());
      const h = await driver.health(makeCtx());
      assert.equal(h.status, HEALTH_STATUS.UNHEALTHY);
    });

    it('after stop, start fails (no longer prepared)',
      async () => {
        await driver.stop(makeCtx());
        const r = await driver.start(makeCtx());
        assert.equal(r.status, START_STATUS.FAILED);
        assert.ok(r.error.includes(
          OCI_DRIVER_ERROR.NOT_PREPARED,
        ));
      });

    it('stop requires valid replicaContext with serviceId',
      async () => {
        await assert.rejects(
          () => driver.stop(null),
          (err) => {
            assert.ok(err instanceof DriverLifecycleError);
            assert.ok(err.message.includes(
              OCI_DRIVER_ERROR.REPLICA_CONTEXT_REQUIRED,
            ));
            return true;
          },
        );
        await assert.rejects(
          () => driver.stop({}),
          (err) => {
            assert.ok(err instanceof DriverLifecycleError);
            assert.ok(err.message.includes(
              OCI_DRIVER_ERROR.SERVICE_ID_REQUIRED,
            ));
            return true;
          },
        );
      });
  });

  // -------------------------------------------------------
  // 3. Health contract
  // -------------------------------------------------------
  describe('health contract', () => {
    it('returns healthy for running services', async () => {
      await driver.prepare(makeDef(), {});
      await driver.start(makeCtx());
      const h = await driver.health(makeCtx());
      assert.equal(h.status, HEALTH_STATUS.HEALTHY);
    });

    it('returns unhealthy for prepared-but-not-started',
      async () => {
        await driver.prepare(makeDef(), {});
        const h = await driver.health(makeCtx());
        assert.equal(h.status, HEALTH_STATUS.UNHEALTHY);
        assert.ok(h.detail.includes(
          OCI_DRIVER_ERROR.NOT_STARTED,
        ));
      });

    it('returns unhealthy for stopped services', async () => {
      await driver.prepare(makeDef(), {});
      await driver.start(makeCtx());
      await driver.stop(makeCtx());
      const h = await driver.health(makeCtx());
      assert.equal(h.status, HEALTH_STATUS.UNHEALTHY);
    });

    it('returns unknown for null replicaContext',
      async () => {
        const h = await driver.health(null);
        assert.equal(h.status, HEALTH_STATUS.UNKNOWN);
        assert.equal(
          h.detail,
          OCI_DRIVER_ERROR.REPLICA_CONTEXT_REQUIRED,
        );
      });

    it('returns unknown for missing serviceId', async () => {
      const h = await driver.health({});
      assert.equal(h.status, HEALTH_STATUS.UNKNOWN);
      assert.equal(
        h.detail,
        OCI_DRIVER_ERROR.SERVICE_ID_REQUIRED,
      );
    });

    it('returns unknown when feature gate disabled',
      async () => {
        driver.setFeatureGate(false);
        const h = await driver.health(makeCtx());
        assert.equal(h.status, HEALTH_STATUS.UNKNOWN);
        assert.equal(
          h.detail,
          OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
        );
      });

    it('health never throws — always returns result',
      async () => {
        // gate disabled
        driver.setFeatureGate(false);
        const h1 = await driver.health(null);
        assert.equal(typeof h1.status, 'string');

        // gate enabled, bad context
        driver.setFeatureGate(true);
        const h2 = await driver.health(undefined);
        assert.equal(typeof h2.status, 'string');

        // gate enabled, unknown service
        const h3 = await driver.health(
          makeCtx('nonexistent'),
        );
        assert.equal(typeof h3.status, 'string');
      });
  });

  // -------------------------------------------------------
  // 4. Lifecycle ordering
  // -------------------------------------------------------
  describe('lifecycle ordering', () => {
    it('full lifecycle: prepare -> start -> healthy ' +
      '-> stop -> unhealthy', async () => {
      const prep = await driver.prepare(makeDef(), {});
      assert.equal(prep.status, PREPARE_STATUS.READY);

      const start = await driver.start(makeCtx());
      assert.equal(start.status, START_STATUS.RUNNING);

      const h1 = await driver.health(makeCtx());
      assert.equal(h1.status, HEALTH_STATUS.HEALTHY);

      await driver.stop(makeCtx());

      const h2 = await driver.health(makeCtx());
      assert.equal(h2.status, HEALTH_STATUS.UNHEALTHY);
    });

    it('re-prepare after stop restores lifecycle',
      async () => {
        await driver.prepare(makeDef(), {});
        await driver.start(makeCtx());
        await driver.stop(makeCtx());

        // re-prepare and restart
        const prep = await driver.prepare(makeDef(), {});
        assert.equal(prep.status, PREPARE_STATUS.READY);

        const start = await driver.start(makeCtx());
        assert.equal(start.status, START_STATUS.RUNNING);

        const h = await driver.health(makeCtx());
        assert.equal(h.status, HEALTH_STATUS.HEALTHY);
      });

    it('multiple services have independent lifecycles',
      async () => {
        const defA = makeDef('svc-a');
        const defB = makeDef('svc-b');
        const ctxA = makeCtx('svc-a');
        const ctxB = makeCtx('svc-b');

        await driver.prepare(defA, {});
        await driver.prepare(defB, {});
        await driver.start(ctxA);
        await driver.start(ctxB);

        // stop A, B stays healthy
        await driver.stop(ctxA);

        const hA = await driver.health(ctxA);
        assert.equal(hA.status, HEALTH_STATUS.UNHEALTHY);

        const hB = await driver.health(ctxB);
        assert.equal(hB.status, HEALTH_STATUS.HEALTHY);
      });
  });

  // -------------------------------------------------------
  // 5. Feature gate interaction with lifecycle
  // -------------------------------------------------------
  describe('feature gate interaction', () => {
    it('prepare throws DriverLifecycleError when gate ' +
      'disabled', async () => {
      driver.setFeatureGate(false);
      await assert.rejects(
        () => driver.prepare(makeDef(), {}),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          assert.ok(err.message.includes(
            OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
          ));
          return true;
        },
      );
    });

    it('start throws DriverLifecycleError when gate ' +
      'disabled', async () => {
      // prepare with gate on, then disable
      await driver.prepare(makeDef(), {});
      driver.setFeatureGate(false);
      await assert.rejects(
        () => driver.start(makeCtx()),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          assert.ok(err.message.includes(
            OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
          ));
          return true;
        },
      );
    });

    it('stop throws DriverLifecycleError when gate ' +
      'disabled', async () => {
      await driver.prepare(makeDef(), {});
      await driver.start(makeCtx());
      driver.setFeatureGate(false);
      await assert.rejects(
        () => driver.stop(makeCtx()),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          assert.ok(err.message.includes(
            OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
          ));
          return true;
        },
      );
    });

    it('health returns unknown (not throw) when gate ' +
      'disabled', async () => {
      driver.setFeatureGate(false);
      const h = await driver.health(makeCtx());
      assert.equal(h.status, HEALTH_STATUS.UNKNOWN);
      assert.equal(
        h.detail,
        OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
      );
    });

    it('enabling gate mid-lifecycle allows operations',
      async () => {
        driver.setFeatureGate(false);

        // gate off — prepare fails
        await assert.rejects(
          () => driver.prepare(makeDef(), {}),
          (err) => err instanceof DriverLifecycleError,
        );

        // enable gate — lifecycle proceeds
        driver.setFeatureGate(true);
        const prep = await driver.prepare(makeDef(), {});
        assert.equal(prep.status, PREPARE_STATUS.READY);

        const start = await driver.start(makeCtx());
        assert.equal(start.status, START_STATUS.RUNNING);

        const h = await driver.health(makeCtx());
        assert.equal(h.status, HEALTH_STATUS.HEALTHY);
      });
  });
});
