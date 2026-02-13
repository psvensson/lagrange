/**
 * Unit tests for OCI_Container_Driver.
 *
 * Validates: Requirements 4.3, 4.5
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
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
  DriverValidationError,
  DriverLifecycleError,
} from '../../src/runtime/runtime-driver-errors.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';

// --- Helpers ---

const VALID_OCI_REF =
  'registry.example.com/my-image@sha256:abc123def456';

function makeDefinition(overrides = {}) {
  return {
    serviceId: 'svc-oci-1',
    runtime_ref: VALID_OCI_REF,
    ...overrides,
  };
}

function makeReplicaContext(overrides = {}) {
  return {
    serviceId: 'svc-oci-1',
    ...overrides,
  };
}

describe('OciContainerDriver', () => {
  let driver;

  beforeEach(() => {
    driver = new OciContainerDriver();
  });

  describe('constructor', () => {
    it('should have oci_container kind', () => {
      assert.equal(driver.kind, RUNTIME_KIND.OCI_CONTAINER);
    });

    it('should have feature gate disabled by default', () => {
      const gate = driver._checkFeatureGate();
      assert.equal(gate.enabled, false);
    });

    it('should have kind as readonly', () => {
      assert.throws(() => {
        driver.kind = 'other';
      });
    });
  });

  describe('setFeatureGate', () => {
    it('should enable the feature gate', () => {
      driver.setFeatureGate(true);
      const gate = driver._checkFeatureGate();
      assert.equal(gate.enabled, true);
    });

    it('should disable the feature gate', () => {
      driver.setFeatureGate(true);
      driver.setFeatureGate(false);
      const gate = driver._checkFeatureGate();
      assert.equal(gate.enabled, false);
    });

    it('should coerce truthy values to boolean', () => {
      driver.setFeatureGate(1);
      assert.equal(driver._checkFeatureGate().enabled, true);
      driver.setFeatureGate(0);
      assert.equal(driver._checkFeatureGate().enabled, false);
    });
  });

  describe('validateDescriptor', () => {
    it('should accept valid definition with digest ref', () => {
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
          runtimeRef: 'img@sha256:abc',
        });
        assert.equal(result.valid, true);
      });

    it('should reject null definition', () => {
      const result = driver.validateDescriptor(null);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DRIVER_ERROR.DEFINITION_REQUIRED,
      ));
    });

    it('should reject missing runtime_ref', () => {
      const result = driver.validateDescriptor(
        {serviceId: 's'},
      );
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DRIVER_ERROR.REF_REQUIRED,
      ));
    });

    it('should reject empty runtime_ref', () => {
      const result = driver.validateDescriptor({
        serviceId: 's',
        runtime_ref: '  ',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DRIVER_ERROR.REF_EMPTY,
      ));
    });

    it('should reject non-string runtime_ref', () => {
      const result = driver.validateDescriptor({
        serviceId: 's',
        runtime_ref: 42,
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DRIVER_ERROR.REF_MUST_BE_STRING,
      ));
    });

    it('should reject runtime_ref without digest', () => {
      const result = driver.validateDescriptor({
        serviceId: 's',
        runtime_ref: 'registry.example.com/my-image:latest',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DRIVER_ERROR.DIGEST_REQUIRED,
      ));
    });

    it('should not check feature gate during validation',
      () => {
        // Gate is disabled by default
        const result = driver.validateDescriptor(
          makeDefinition(),
        );
        assert.equal(result.valid, true);
      });
  });

  describe('prepare', () => {
    beforeEach(() => {
      driver.setFeatureGate(true);
    });

    it('should succeed when gate enabled and descriptor valid',
      async () => {
        const result = await driver.prepare(
          makeDefinition(), {},
        );
        assert.equal(result.status, PREPARE_STATUS.READY);
      });

    it('should throw when feature gate disabled', async () => {
      driver.setFeatureGate(false);
      await assert.rejects(
        () => driver.prepare(makeDefinition(), {}),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          assert.ok(err.message.includes(
            OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
          ));
          return true;
        },
      );
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

    it('should throw for ref without digest', async () => {
      await assert.rejects(
        () => driver.prepare(
          makeDefinition({runtime_ref: 'no-digest:latest'}),
          {},
        ),
        (err) => {
          assert.ok(err instanceof DriverValidationError);
          return true;
        },
      );
    });

    it('should be idempotent (re-prepare updates definition)',
      async () => {
        await driver.prepare(makeDefinition(), {});
        const result = await driver.prepare(
          makeDefinition({
            runtime_ref: 'other@sha256:def789',
          }), {},
        );
        assert.equal(result.status, PREPARE_STATUS.READY);
      });
  });

  describe('start', () => {
    beforeEach(async () => {
      driver.setFeatureGate(true);
      await driver.prepare(makeDefinition(), {});
    });

    it('should start a prepared service', async () => {
      const result = await driver.start(
        makeReplicaContext(),
      );
      assert.equal(result.status, START_STATUS.RUNNING);
    });

    it('should throw when feature gate disabled', async () => {
      driver.setFeatureGate(false);
      await assert.rejects(
        () => driver.start(makeReplicaContext()),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          assert.ok(err.message.includes(
            OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
          ));
          return true;
        },
      );
    });

    it('should fail for unprepared service', async () => {
      const result = await driver.start(
        makeReplicaContext({serviceId: 'unknown-svc'}),
      );
      assert.equal(result.status, START_STATUS.FAILED);
      assert.ok(result.error.includes(
        OCI_DRIVER_ERROR.NOT_PREPARED,
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
            OCI_DRIVER_ERROR.SERVICE_ID_REQUIRED,
          ));
          return true;
        },
      );
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      driver.setFeatureGate(true);
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

    it('should throw when feature gate disabled', async () => {
      driver.setFeatureGate(false);
      await assert.rejects(
        () => driver.stop(makeReplicaContext()),
        (err) => {
          assert.ok(err instanceof DriverLifecycleError);
          assert.ok(err.message.includes(
            OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
          ));
          return true;
        },
      );
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
            OCI_DRIVER_ERROR.SERVICE_ID_REQUIRED,
          ));
          return true;
        },
      );
    });
  });

  describe('health', () => {
    it('should return healthy for running service',
      async () => {
        driver.setFeatureGate(true);
        await driver.prepare(makeDefinition(), {});
        await driver.start(makeReplicaContext());
        const result = await driver.health(
          makeReplicaContext(),
        );
        assert.equal(result.status, HEALTH_STATUS.HEALTHY);
      });

    it('should return unknown when feature gate disabled',
      async () => {
        // Gate disabled by default
        const result = await driver.health(
          makeReplicaContext(),
        );
        assert.equal(result.status, HEALTH_STATUS.UNKNOWN);
        assert.equal(
          result.detail,
          OCI_DRIVER_ERROR.FEATURE_GATE_DISABLED,
        );
      });

    it('should return unhealthy for unprepared service',
      async () => {
        driver.setFeatureGate(true);
        const result = await driver.health(
          makeReplicaContext({serviceId: 'unknown'}),
        );
        assert.equal(result.status, HEALTH_STATUS.UNHEALTHY);
        assert.ok(result.detail.includes(
          OCI_DRIVER_ERROR.NOT_PREPARED,
        ));
      });

    it('should return unhealthy for prepared but not started',
      async () => {
        driver.setFeatureGate(true);
        await driver.prepare(makeDefinition(), {});
        const result = await driver.health(
          makeReplicaContext(),
        );
        assert.equal(result.status, HEALTH_STATUS.UNHEALTHY);
        assert.ok(result.detail.includes(
          OCI_DRIVER_ERROR.NOT_STARTED,
        ));
      });

    it('should return unknown for null replicaContext',
      async () => {
        driver.setFeatureGate(true);
        const result = await driver.health(null);
        assert.equal(result.status, HEALTH_STATUS.UNKNOWN);
      });

    it('should return unknown for missing serviceId',
      async () => {
        driver.setFeatureGate(true);
        const result = await driver.health({});
        assert.equal(result.status, HEALTH_STATUS.UNKNOWN);
      });
  });

  describe('property-based: digest validation', () => {
    it('should reject arbitrary strings without @sha256:',
      () => {
        fc.assert(
          fc.property(
            fc.string({minLength: 1}).filter((s) =>
              s.trim().length > 0 &&
              !s.includes('@sha256:')),
            (ref) => {
              const result = driver.validateDescriptor({
                serviceId: 'svc-1',
                runtime_ref: ref,
              });
              assert.equal(result.valid, false);
              assert.ok(result.errors.includes(
                OCI_DRIVER_ERROR.DIGEST_REQUIRED,
              ));
            },
          ),
          {numRuns: 10},
        );
      });
  });

  describe('full lifecycle', () => {
    it('should complete prepare -> start -> health -> stop',
      async () => {
        driver.setFeatureGate(true);

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
  });
});
