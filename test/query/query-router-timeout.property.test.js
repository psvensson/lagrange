/**
 * Property test for QueryRouter Timeout Enforcement.
 * Property 6: For any routing operation, if the total elapsed time exceeds
 * the configured timeout, the operation SHALL fail with a timeout error
 * regardless of retry state.
 *
 * Validates: Requirements 3.5
 *
 * Feature: code-clarity-maintainability
 * Property 6: QueryRouter Timeout Enforcement
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {QueryRouter} from '../../src/query/query-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_TYPE, STATE, TABLES, NUM} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

// Initialize configuration and logging for tests (module level)
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

/**
 * Create a mock system cache with configurable services.
 * @param {Array<Object>} services - Array of service objects to return
 * @return {Object} Mock system cache
 */
function createMockSystemCache(services) {
  return {
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
  };
}

/**
 * Create a service entry for a partition.
 * @param {string} partitionId - Partition ID
 * @param {string} serviceId - Service ID
 * @param {string} address - Service address
 * @return {Object} Service entry
 */
function createServiceEntry(partitionId, serviceId, address) {
  return {
    partition_id: partitionId,
    service_id: serviceId,
    service_type: SERVICE_TYPE.PARTITION,
    status: STATE.ACTIVE,
    address,
    raft_role: RAFT_ROLE.LEADER,
    node_id: 'node-1',
  };
}

/**
 * Feature: code-clarity-maintainability
 * Property 6: QueryRouter Timeout Enforcement
 *
 * For any routing operation, if the total elapsed time exceeds the configured
 * timeout, the operation SHALL fail with a timeout error regardless of retry
 * state.
 */
test('Property 6: QueryRouter Timeout Enforcement', async (t) => {
  /**
   * Property: Operations fail with timeout error when timeout is exceeded.
   *
   * For any configured timeout, when the elapsed time exceeds the timeout,
   * the router should throw a timeout error regardless of retry state.
   *
   * **Validates: Requirements 3.5**
   */
  t.test('operations fail with timeout error when timeout exceeded', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate timeout (10-100ms for fast tests)
        fc.integer({min: NUM.TEN, max: NUM.HUNDRED}),
        // Generate retry attempts (2-5)
        fc.integer({min: NUM.TWO, max: NUM.FIVE}),
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (timeoutMs, retryAttempts, partitionId) => {
          let _deliverCallCount = NUM.ZERO;
          let simulatedTime = NUM.ZERO;

          const services = [
            createServiceEntry(partitionId, 'service-1', 'host:8080'),
          ];

          const systemCache = createMockSystemCache(services);

          // Mock message router that always fails (to trigger retries)
          const messageRouter = {
            deliver: async () => {
              _deliverCallCount++;
              return {acknowledged: false, success: false, error: 'Transient failure'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts,
            retryDelayMs: NUM.TEN,
            timeoutMs,
          });

          // Override Date.now to simulate time passing beyond timeout
          const originalDateNow = Date.now;
          let startTime = null;
          Date.now = () => {
            if (startTime === null) {
              startTime = originalDateNow();
              return startTime;
            }
            // After first call, simulate time exceeding timeout
            simulatedTime = timeoutMs + NUM.ONE;
            return startTime + simulatedTime;
          };

          // Override delay to be instant
          router.delay = () => Promise.resolve();

          let threwTimeoutError = false;
          let errorMessage = '';

          try {
            await router.routeToPartition(partitionId, {type: 'test'});
          } catch (error) {
            threwTimeoutError = error.message.includes('timed out');
            errorMessage = error.message;
          } finally {
            Date.now = originalDateNow;
          }

          // Should throw timeout error
          if (!threwTimeoutError) {
            return false;
          }

          // Error message should contain partition ID and timeout value
          if (!errorMessage.includes(partitionId)) {
            return false;
          }

          return errorMessage.includes(String(timeoutMs));
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('operations fail with timeout error when timeout exceeded');
  });

  /**
   * Property: Timeout is checked before each retry attempt.
   *
   * For any routing operation with multiple retries, the timeout should be
   * checked at the start of each retry loop iteration.
   *
   * **Validates: Requirements 3.5**
   */
  t.test('timeout is checked before each retry attempt', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate timeout (50-200ms)
        fc.integer({min: NUM.TEN * NUM.FIVE, max: NUM.HUNDRED * NUM.TWO}),
        // Generate retry attempts (3-5)
        fc.integer({min: NUM.THREE, max: NUM.FIVE}),
        // Generate attempt at which timeout occurs (1 to retryAttempts-1)
        fc.integer({min: NUM.ONE, max: NUM.FOUR}),
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (timeoutMs, retryAttempts, timeoutAtAttempt, partitionId) => {
          // Ensure timeoutAtAttempt is valid for the retry count
          const actualTimeoutAtAttempt = Math.min(timeoutAtAttempt, retryAttempts - NUM.ONE);
          let deliverCallCount = NUM.ZERO;

          const services = [
            createServiceEntry(partitionId, 'service-1', 'host:8080'),
          ];

          const systemCache = createMockSystemCache(services);

          // Mock message router that always fails
          const messageRouter = {
            deliver: async () => {
              deliverCallCount++;
              return {acknowledged: false, success: false, error: 'Transient failure'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts,
            retryDelayMs: NUM.ONE,
            timeoutMs,
          });

          // Override Date.now to simulate timeout at specific attempt
          const originalDateNow = Date.now;
          let startTime = null;
          let currentAttempt = NUM.ZERO;

          Date.now = () => {
            if (startTime === null) {
              startTime = originalDateNow();
              return startTime;
            }
            // Simulate time passing - exceed timeout at specific attempt
            if (currentAttempt >= actualTimeoutAtAttempt) {
              return startTime + timeoutMs + NUM.ONE;
            }
            // Before timeout attempt, return time within timeout
            return startTime + (currentAttempt * NUM.TEN);
          };

          // Override delay to track attempts and be instant
          router.delay = () => {
            currentAttempt++;
            return Promise.resolve();
          };

          let threwTimeoutError = false;

          try {
            await router.routeToPartition(partitionId, {type: 'test'});
          } catch (error) {
            threwTimeoutError = error.message.includes('timed out');
          } finally {
            Date.now = originalDateNow;
          }

          // Should throw timeout error
          if (!threwTimeoutError) {
            return false;
          }

          // Deliver should have been called at most actualTimeoutAtAttempt times
          // (timeout check happens at start of loop, before deliver)
          return deliverCallCount <= actualTimeoutAtAttempt;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('timeout is checked before each retry attempt');
  });

  /**
   * Property: Operations succeed if completed before timeout.
   *
   * For any routing operation that completes before the timeout, the operation
   * should succeed without throwing a timeout error.
   *
   * **Validates: Requirements 3.5**
   */
  t.test('operations succeed if completed before timeout', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate timeout (100-500ms)
        fc.integer({min: NUM.HUNDRED, max: NUM.HUNDRED * NUM.FIVE}),
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (timeoutMs, partitionId) => {
          const services = [
            createServiceEntry(partitionId, 'service-1', 'host:8080'),
          ];

          const systemCache = createMockSystemCache(services);

          // Mock message router that succeeds immediately
          const messageRouter = {
            deliver: async () => {
              return {acknowledged: true, success: true, data: 'result'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts: NUM.THREE,
            retryDelayMs: NUM.TEN,
            timeoutMs,
          });

          // Override Date.now to simulate time within timeout
          const originalDateNow = Date.now;
          const startTime = originalDateNow();
          Date.now = () => startTime + NUM.ONE; // Always 1ms elapsed

          // Override delay to be instant
          router.delay = () => Promise.resolve();

          let succeeded = false;
          let threwTimeoutError = false;

          try {
            const result = await router.routeToPartition(partitionId, {type: 'test'});
            succeeded = result.success === true;
          } catch (error) {
            threwTimeoutError = error.message.includes('timed out');
          } finally {
            Date.now = originalDateNow;
          }

          // Should succeed without timeout error
          return succeeded && !threwTimeoutError;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('operations succeed if completed before timeout');
  });

  /**
   * Property: Timeout error includes partition ID and timeout value.
   *
   * For any timeout error, the error message should include the partition ID
   * and the configured timeout value for debugging purposes.
   *
   * **Validates: Requirements 3.5**
   */
  t.test('timeout error includes partition ID and timeout value', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate timeout (10-100ms)
        fc.integer({min: NUM.TEN, max: NUM.HUNDRED}),
        // Generate partition ID (alphanumeric for clear error messages)
        fc.stringMatching(/^[a-z][a-z0-9]{0,19}$/),
        async (timeoutMs, partitionId) => {
          // Skip empty partition IDs
          if (!partitionId || partitionId.trim().length === NUM.ZERO) {
            return true;
          }

          const services = [
            createServiceEntry(partitionId, 'service-1', 'host:8080'),
          ];

          const systemCache = createMockSystemCache(services);

          // Mock message router that always fails
          const messageRouter = {
            deliver: async () => {
              return {acknowledged: false, success: false, error: 'Transient failure'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts: NUM.THREE,
            retryDelayMs: NUM.ONE,
            timeoutMs,
          });

          // Override Date.now to immediately exceed timeout
          const originalDateNow = Date.now;
          let callCount = NUM.ZERO;
          Date.now = () => {
            callCount++;
            if (callCount === NUM.ONE) {
              return NUM.ZERO;
            }
            return timeoutMs + NUM.ONE;
          };

          // Override delay to be instant
          router.delay = () => Promise.resolve();

          let errorMessage = '';

          try {
            await router.routeToPartition(partitionId, {type: 'test'});
          } catch (error) {
            errorMessage = error.message;
          } finally {
            Date.now = originalDateNow;
          }

          // Error message should contain partition ID
          if (!errorMessage.includes(partitionId)) {
            return false;
          }

          // Error message should contain timeout value
          return errorMessage.includes(String(timeoutMs));
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('timeout error includes partition ID and timeout value');
  });

  /**
   * Property: Timeout takes precedence over retry exhaustion.
   *
   * When both timeout and retry exhaustion could occur, timeout should be
   * checked first and take precedence.
   *
   * **Validates: Requirements 3.5**
   */
  t.test('timeout takes precedence over retry exhaustion', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate timeout (10-50ms)
        fc.integer({min: NUM.TEN, max: NUM.TEN * NUM.FIVE}),
        // Generate retry attempts (2-4)
        fc.integer({min: NUM.TWO, max: NUM.FOUR}),
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (timeoutMs, retryAttempts, partitionId) => {
          const services = [
            createServiceEntry(partitionId, 'service-1', 'host:8080'),
          ];

          const systemCache = createMockSystemCache(services);

          // Mock message router that always fails
          const messageRouter = {
            deliver: async () => {
              return {acknowledged: false, success: false, error: 'Transient failure'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts,
            retryDelayMs: NUM.ONE,
            timeoutMs,
          });

          // Override Date.now to exceed timeout immediately after first attempt
          const originalDateNow = Date.now;
          let callCount = NUM.ZERO;
          Date.now = () => {
            callCount++;
            if (callCount === NUM.ONE) {
              return NUM.ZERO;
            }
            // Exceed timeout on second check
            return timeoutMs + NUM.ONE;
          };

          // Override delay to be instant
          router.delay = () => Promise.resolve();

          let errorMessage = '';

          try {
            await router.routeToPartition(partitionId, {type: 'test'});
          } catch (error) {
            errorMessage = error.message;
          } finally {
            Date.now = originalDateNow;
          }

          // Should be a timeout error, not a retry exhaustion error
          const isTimeoutError = errorMessage.includes('timed out');
          const isRetryError = errorMessage.includes('after') &&
            errorMessage.includes('attempts');

          // Timeout error should be thrown, not retry exhaustion
          return isTimeoutError && !isRetryError;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('timeout takes precedence over retry exhaustion');
  });
});
