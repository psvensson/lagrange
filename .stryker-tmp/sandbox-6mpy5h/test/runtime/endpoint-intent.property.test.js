/**
 * Property-based tests for endpoint intent validation and
 * single-write-path registration in ServiceRuntimeLifecycle.
 *
 * **Validates: Requirements 8.1, 8.2, 8.3**
 *
 * Properties tested:
 *   P1: Any intent with a valid integer port in [1, 65535] and
 *       optional string host/protocol passes validation.
 *   P2: Any intent with an out-of-range or non-integer port
 *       fails validation.
 *   P3: The lifecycle owner is the single endpoint registration
 *       coordinator — every valid intent from a driver flows
 *       through the endpointWriter callback exactly once.
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {ServiceRuntimeLifecycle, validateEndpointIntent} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {
  RuntimeDriver,
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {MIN_PORT, MAX_PORT} from '../../src/constants/runtime.js';

// --- Arbitraries ---

const validPort = fc.integer({min: MIN_PORT, max: MAX_PORT});

const optionalString = fc.oneof(
  fc.constant(undefined),
  fc.string({minLength: 0, maxLength: 50}),
);

const validIntent = fc.record({
  port: validPort,
  host: optionalString,
  protocol: optionalString,
}).map((r) => {
  const intent = {port: r.port};
  if (r.host !== undefined) intent.host = r.host;
  if (r.protocol !== undefined) intent.protocol = r.protocol;
  return intent;
});

const invalidPort = fc.oneof(
  fc.double({min: -1e6, max: 0.99, noNaN: true}),
  fc.double({min: 65535.01, max: 1e6, noNaN: true}),
  fc.double({
    min: MIN_PORT + 0.01,
    max: MAX_PORT - 0.01,
    noNaN: true,
  }).filter((n) => !Number.isInteger(n)),
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
);

// --- Helpers ---

function makeIntentDriver(intent) {
  class IntentDriver extends RuntimeDriver {
    constructor() {
      super(RUNTIME_KIND.NATIVE_JS);
    }
    validateDescriptor(_d) {
      return {valid: true};
    }
    async prepare(_d, _c) {
      return {status: PREPARE_STATUS.READY};
    }
    async start(_c) {
      return {status: START_STATUS.RUNNING, endpointIntent: intent};
    }
    async stop(_c) {}
    async health(_c) {
      return {status: HEALTH_STATUS.HEALTHY};
    }
  }
  return new IntentDriver();
}

function makeLifecycle(driver) {
  const registry = new RuntimeDriverRegistry();
  registry.register(driver);
  registry.freeze();
  return new ServiceRuntimeLifecycle(registry);
}

function replicaCtx() {
  return {
    definition: {
      runtime_kind: RUNTIME_KIND.NATIVE_JS,
      serviceId: 'prop-svc',
    },
  };
}

// --- Properties ---

describe('Endpoint intent validation properties', () => {
  it('P1: valid port + optional string host/protocol always passes',
    () => {
      fc.assert(
        fc.property(validIntent, (intent) => {
          const result = validateEndpointIntent(intent);
          assert.equal(result.valid, true);
        }),
        {numRuns: 10},
      );
    });

  it('P2: out-of-range or non-integer port always fails', () => {
    fc.assert(
      fc.property(invalidPort, (port) => {
        const result = validateEndpointIntent({port});
        assert.equal(result.valid, false);
        assert.ok(result.reason.includes('port'));
      }),
      {numRuns: 10},
    );
  });
});

describe('Endpoint intent single-write-path property', () => {
  it('P3: valid intent flows through endpointWriter exactly once',
    async () => {
      await fc.assert(
        fc.asyncProperty(validIntent, async (intent) => {
          const driver = makeIntentDriver(intent);
          const lifecycle = makeLifecycle(driver);
          const writes = [];
          lifecycle.setEndpointWriter(
            async (svcId, kind, ep) => {
              writes.push({svcId, kind, ep});
            },
          );

          await lifecycle.start(replicaCtx());

          assert.equal(writes.length, 1);
          assert.equal(writes[0].svcId, 'prop-svc');
          assert.equal(writes[0].kind, RUNTIME_KIND.NATIVE_JS);
          assert.deepStrictEqual(writes[0].ep, intent);
        }),
        {numRuns: 10},
      );
    });
});
