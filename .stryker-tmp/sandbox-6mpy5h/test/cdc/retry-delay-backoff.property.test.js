/**
 * Property test for Retry Delay Exponential Backoff.
 *
 * Property 4: For any retry attempt number n (1-based), the computed delay
 * SHALL follow exponential backoff with the formula:
 * min(MAX_DELAY_MS, baseDelayMs * 2^min(MAX_EXPONENT, n-1)).
 *
 * **Validates: Requirements 4.1, 4.2**
 *
 * Feature: test-coverage-improvements
 * Property: Retry Delay Exponential Backoff
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {CDC_RETRY} from '../../src/cdc/cdc-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Initialize test environment with required singletons.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Cleanup test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

beforeEach(() => {
  initializeTestEnvironment();
});

afterEach(() => {
  cleanupTestEnvironment();
});

/**
 * Compute expected retry delay using the formula from the design document.
 * Formula: min(MAX_DELAY_MS, baseDelayMs * 2^min(MAX_EXPONENT, n-1))
 *
 * @param {number} baseDelayMs - Base delay in milliseconds.
 * @param {number} attempt - Current attempt number (1-based).
 * @return {number} Expected delay in milliseconds.
 */
function computeExpectedDelay(baseDelayMs, attempt) {
  const exponent = Math.min(CDC_RETRY.MAX_EXPONENT, Math.max(0, attempt - 1));
  const backoffMultiplier = Math.pow(CDC_RETRY.BACKOFF_BASE, exponent);
  return Math.min(CDC_RETRY.MAX_DELAY_MS, baseDelayMs * backoffMultiplier);
}

/**
 * Arbitrary for generating valid base delay values.
 * Base delay should be a positive integer within reasonable bounds.
 */
const baseDelayArb = fc.integer({min: 1, max: 1000});

/**
 * Arbitrary for generating valid attempt numbers.
 * Attempts are 1-based and should cover typical retry scenarios.
 */
const attemptArb = fc.integer({min: 1, max: 20});

/**
 * Property 4: Retry Delay Exponential Backoff
 *
 * For any retry attempt number n (1-based), the computed delay SHALL follow
 * exponential backoff with the formula:
 * min(MAX_DELAY_MS, baseDelayMs * 2^min(MAX_EXPONENT, n-1)).
 *
 * **Validates: Requirements 4.1, 4.2**
 */
test('Property: Retry delay follows exponential backoff formula', async (t) => {
  fc.assert(
    fc.property(
      baseDelayArb,
      attemptArb,
      (baseDelayMs, attempt) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const actualDelay = service.computeRetryDelayMs(baseDelayMs, attempt);
        const expectedDelay = computeExpectedDelay(baseDelayMs, attempt);

        return actualDelay === expectedDelay;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Retry delay follows exponential backoff formula');
});

/**
 * Property: Retry delay never exceeds MAX_DELAY_MS.
 *
 * For any base delay and attempt number, the computed delay SHALL never
 * exceed CDC_RETRY.MAX_DELAY_MS (2000ms).
 *
 * **Validates: Requirements 4.1, 4.2**
 */
test('Property: Retry delay never exceeds MAX_DELAY_MS', async (t) => {
  fc.assert(
    fc.property(
      baseDelayArb,
      attemptArb,
      (baseDelayMs, attempt) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const actualDelay = service.computeRetryDelayMs(baseDelayMs, attempt);

        return actualDelay <= CDC_RETRY.MAX_DELAY_MS;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Retry delay never exceeds MAX_DELAY_MS');
});

/**
 * Property: Retry delay increases monotonically until capped.
 *
 * For any base delay, the computed delay for attempt n+1 SHALL be greater
 * than or equal to the delay for attempt n (monotonically increasing until
 * the cap is reached).
 *
 * **Validates: Requirements 4.1, 4.2**
 */
test('Property: Retry delay increases monotonically until capped', async (t) => {
  fc.assert(
    fc.property(
      baseDelayArb,
      fc.integer({min: 1, max: 19}),
      (baseDelayMs, attempt) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const delayAtN = service.computeRetryDelayMs(baseDelayMs, attempt);
        const delayAtNPlus1 = service.computeRetryDelayMs(baseDelayMs, attempt + 1);

        return delayAtNPlus1 >= delayAtN;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Retry delay increases monotonically until capped');
});

/**
 * Property: First attempt delay equals base delay.
 *
 * For any base delay, the computed delay for attempt 1 SHALL equal the
 * base delay (since 2^0 = 1).
 *
 * **Validates: Requirements 4.1, 4.2**
 */
test('Property: First attempt delay equals base delay', async (t) => {
  fc.assert(
    fc.property(
      fc.integer({min: 1, max: CDC_RETRY.MAX_DELAY_MS}),
      (baseDelayMs) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const firstAttemptDelay = service.computeRetryDelayMs(baseDelayMs, 1);

        return firstAttemptDelay === baseDelayMs;
      },
    ),
    {numRuns: 10},
  );

  t.pass('First attempt delay equals base delay');
});

/**
 * Property: Exponent is capped at MAX_EXPONENT.
 *
 * For any attempt number greater than MAX_EXPONENT + 1, the delay SHALL
 * be the same as the delay at MAX_EXPONENT + 1 (exponent capped).
 *
 * **Validates: Requirements 4.1, 4.2**
 */
test('Property: Exponent is capped at MAX_EXPONENT', async (t) => {
  fc.assert(
    fc.property(
      baseDelayArb,
      fc.integer({min: CDC_RETRY.MAX_EXPONENT + 2, max: 100}),
      (baseDelayMs, highAttempt) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const cappedAttempt = CDC_RETRY.MAX_EXPONENT + 1;
        const delayAtCap = service.computeRetryDelayMs(baseDelayMs, cappedAttempt);
        const delayAtHighAttempt = service.computeRetryDelayMs(baseDelayMs, highAttempt);

        return delayAtHighAttempt === delayAtCap;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Exponent is capped at MAX_EXPONENT');
});

/**
 * Property: Delay doubles with each attempt until capped.
 *
 * For any base delay and attempt where the delay is not yet capped,
 * the delay at attempt n+1 SHALL be exactly double the delay at attempt n.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
test('Property: Delay doubles with each attempt until capped', async (t) => {
  fc.assert(
    fc.property(
      fc.integer({min: 1, max: 30}),
      fc.integer({min: 1, max: CDC_RETRY.MAX_EXPONENT}),
      (baseDelayMs, attempt) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const delayAtN = service.computeRetryDelayMs(baseDelayMs, attempt);
        const delayAtNPlus1 = service.computeRetryDelayMs(baseDelayMs, attempt + 1);

        const expectedDouble = Math.min(CDC_RETRY.MAX_DELAY_MS, delayAtN * 2);

        return delayAtNPlus1 === expectedDouble;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Delay doubles with each attempt until capped');
});

