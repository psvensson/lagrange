/**
 * Property-based tests for Native_JS_Driver.
 *
 * Verifies:
 * 1. Descriptor validation is consistent across inputs
 * 2. Lifecycle idempotency holds for all service IDs
 * 3. Health reflects actual running state
 *
 * **Validates: Requirements 2.1, 2.2**
 */

import {describe, it} from 'node:test';
import fc from 'fast-check';
import {NativeJsDriver} from
  '../../src/runtime/native-js-driver.js';
import {
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';

// --- Generators ---

const validRefArb = fc.string({minLength: 1, maxLength: 50})
  .filter((s) => s.trim().length > 0);

const serviceIdArb = fc.string({minLength: 1, maxLength: 30})
  .filter((s) => s.trim().length > 0);

// --- Property 1: Validation consistency ---

describe('NativeJsDriver validation properties', () => {
  /**
   * **Validates: Requirements 2.1**
   */
  it('valid runtime_ref always produces valid result', () => {
    fc.assert(
      fc.property(
        validRefArb,
        (ref) => {
          const driver = new NativeJsDriver();
          const result = driver.validateDescriptor({
            serviceId: 'svc-1',
            runtime_ref: ref,
          });
          return result.valid === true &&
            result.errors === undefined;
        },
      ),
      {numRuns: 10},
    );
  });

  /**
   * **Validates: Requirements 2.1**
   */
  it('null/undefined ref always produces invalid result', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined),
        (ref) => {
          const driver = new NativeJsDriver();
          const def = {serviceId: 'svc-1'};
          if (ref !== undefined) {
            def.runtime_ref = ref;
          }
          const result = driver.validateDescriptor(def);
          return result.valid === false &&
            Array.isArray(result.errors) &&
            result.errors.length > 0;
        },
      ),
      {numRuns: 10},
    );
  });

  /**
   * **Validates: Requirements 2.1**
   */
  it('non-string ref always produces invalid result', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant([]),
          fc.constant({}),
        ),
        (ref) => {
          const driver = new NativeJsDriver();
          const result = driver.validateDescriptor({
            serviceId: 'svc-1',
            runtime_ref: ref,
          });
          return result.valid === false &&
            Array.isArray(result.errors);
        },
      ),
      {numRuns: 10},
    );
  });
});

// --- Property 2: Lifecycle idempotency ---

describe('NativeJsDriver lifecycle idempotency', () => {
  /**
   * **Validates: Requirements 2.2**
   */
  it('double start always returns running for prepared svc',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          serviceIdArb,
          validRefArb,
          async (svcId, ref) => {
            const driver = new NativeJsDriver();
            const handler = () => ({ok: true});
            await driver.prepare(
              {serviceId: svcId, runtime_ref: ref},
              {handlerMap: {[ref]: handler}},
            );
            const r1 = await driver.start({serviceId: svcId});
            const r2 = await driver.start({serviceId: svcId});
            return r1.status === START_STATUS.RUNNING &&
              r2.status === START_STATUS.RUNNING;
          },
        ),
        {numRuns: 10},
      );
    });

  /**
   * **Validates: Requirements 2.2**
   */
  it('double stop never throws for any service', async () => {
    await fc.assert(
      fc.asyncProperty(
        serviceIdArb,
        validRefArb,
        async (svcId, ref) => {
          const driver = new NativeJsDriver();
          const handler = () => ({ok: true});
          await driver.prepare(
            {serviceId: svcId, runtime_ref: ref},
            {handlerMap: {[ref]: handler}},
          );
          await driver.start({serviceId: svcId});
          await driver.stop({serviceId: svcId});
          await driver.stop({serviceId: svcId});
          return true;
        },
      ),
      {numRuns: 10},
    );
  });
});

// --- Property 3: Health reflects running state ---

describe('NativeJsDriver health state consistency', () => {
  /**
   * **Validates: Requirements 2.1, 2.2**
   */
  it('health is healthy iff service is running', async () => {
    await fc.assert(
      fc.asyncProperty(
        serviceIdArb,
        validRefArb,
        async (svcId, ref) => {
          const driver = new NativeJsDriver();
          const handler = () => ({ok: true});

          // Before prepare: unhealthy
          const h1 = await driver.health({serviceId: svcId});
          if (h1.status !== HEALTH_STATUS.UNHEALTHY) return false;

          // After prepare, before start: unhealthy
          await driver.prepare(
            {serviceId: svcId, runtime_ref: ref},
            {handlerMap: {[ref]: handler}},
          );
          const h2 = await driver.health({serviceId: svcId});
          if (h2.status !== HEALTH_STATUS.UNHEALTHY) return false;

          // After start: healthy
          await driver.start({serviceId: svcId});
          const h3 = await driver.health({serviceId: svcId});
          if (h3.status !== HEALTH_STATUS.HEALTHY) return false;

          // After stop: unhealthy
          await driver.stop({serviceId: svcId});
          const h4 = await driver.health({serviceId: svcId});
          if (h4.status !== HEALTH_STATUS.UNHEALTHY) return false;

          return true;
        },
      ),
      {numRuns: 10},
    );
  });
});
