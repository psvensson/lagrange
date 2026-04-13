/**
 * Property test for QueryRouter Retry Behavior.
 * Property 4: For any routing operation that fails transiently, the QueryRouter
 * SHALL retry up to the configured number of attempts with exponential backoff
 * delays.
 *
 * Validates: Requirements 3.3
 *
 * Feature: code-clarity-maintainability
 * Property 4: QueryRouter Retry Behavior
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {QueryRouter} from '../../src/query/query-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
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
    status: SERVICE_STATUS.ACTIVE,
    address,
    raft_role: RAFT_ROLE.LEADER,
    node_id: 'node-1',
  };
}

/**
 * Feature: code-clarity-maintainability
 * Property 4: QueryRouter Retry Behavior
 *
 * For any routing operation that fails transiently, the QueryRouter SHALL retry
 * up to the configured number of attempts with exponential backoff delays.
 */
test('Property 4: QueryRouter Retry Behavior', async (t) => {
  /**
   * Property: Retry count matches configured retryAttempts.
   *
   * For any configured retry count, when all routing attempts fail, the router
   * should attempt exactly retryAttempts times before throwing.
   *
   * **Validates: Requirements 3.3**
   */
  t.test('retry count matches configured retryAttempts', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate retry attempts (1-5)
        fc.integer({min: NUM.ONE, max: NUM.FIVE}),
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (retryAttempts, partitionId) => {
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
            retryDelayMs: NUM.ONE, // Minimal delay for testing
            timeoutMs: NUM.THOUSAND * NUM.TEN, // High timeout to avoid timeout errors
          });

          // Override delay to be instant for testing
          router.delay = () => Promise.resolve();

          let threwError = false;
          try {
            await router.routeToPartition(partitionId, {type: 'test'});
          } catch (_error) {
            threwError = true;
          }

          // Should throw after exhausting retries
          if (!threwError) {
            return false;
          }

          // Deliver should be called exactly retryAttempts times
          // (once per retry attempt, each attempt tries all candidates)
          return deliverCallCount === retryAttempts;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('retry count matches configured retryAttempts');
  });

  /**
   * Property: Exponential backoff delays double each attempt.
   *
   * For any base delay and attempt sequence, the backoff delay should follow
   * the formula: baseDelay * 2^attempt.
   *
   * **Validates: Requirements 3.3**
   */
  t.test('exponential backoff delays double each attempt', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate base delay (10-100ms)
        fc.integer({min: NUM.TEN, max: NUM.HUNDRED}),
        // Generate retry attempts (2-4 to see backoff pattern)
        fc.integer({min: NUM.TWO, max: NUM.FOUR}),
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (baseDelay, retryAttempts, partitionId) => {
          const recordedDelays = [];

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
            retryDelayMs: baseDelay,
            timeoutMs: NUM.THOUSAND * NUM.HUNDRED, // High timeout
          });

          // Override delay to record delays without waiting
          router.delay = (ms) => {
            recordedDelays.push(ms);
            return Promise.resolve();
          };

          try {
            await router.routeToPartition(partitionId, {type: 'test'});
          } catch (_error) {
            // Expected to throw
          }

          // Should have retryAttempts - 1 delays (no delay after last attempt)
          if (recordedDelays.length !== retryAttempts - NUM.ONE) {
            return false;
          }

          // Verify exponential backoff: delay[i] = baseDelay * 2^i
          for (let i = NUM.ZERO; i < recordedDelays.length; i++) {
            const expectedDelay = baseDelay * Math.pow(NUM.TWO, i);
            if (recordedDelays[i] !== expectedDelay) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('exponential backoff delays double each attempt');
  });

  /**
   * Property: Routing succeeds if any retry succeeds.
   *
   * For any sequence of failures followed by a success, the router should
   * return successfully without throwing.
   *
   * **Validates: Requirements 3.3**
   */
  t.test('routing succeeds if any retry succeeds', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of failures before success (0-3)
        fc.integer({min: NUM.ZERO, max: NUM.THREE}),
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (failuresBeforeSuccess, partitionId) => {
          let callCount = NUM.ZERO;
          const retryAttempts = failuresBeforeSuccess + NUM.TWO; // Ensure enough retries

          const services = [
            createServiceEntry(partitionId, 'service-1', 'host:8080'),
          ];

          const systemCache = createMockSystemCache(services);

          // Mock message router that fails N times then succeeds
          const messageRouter = {
            deliver: async () => {
              callCount++;
              if (callCount <= failuresBeforeSuccess) {
                return {acknowledged: false, success: false, error: 'Transient failure'};
              }
              return {acknowledged: true, success: true, data: 'result'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts,
            retryDelayMs: NUM.ONE,
            timeoutMs: NUM.THOUSAND * NUM.TEN,
          });

          // Override delay to be instant
          router.delay = () => Promise.resolve();

          try {
            const result = await router.routeToPartition(partitionId, {type: 'test'});
            // Should succeed
            return result.success === true;
          } catch (_error) {
            // Should not throw if a retry succeeds
            return false;
          }
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('routing succeeds if any retry succeeds');
  });

  /**
   * Property: Backoff delay calculation is correct for any attempt number.
   *
   * The calculateBackoffDelay method should return baseDelay * 2^attempt
   * for any valid attempt number.
   *
   * **Validates: Requirements 3.3**
   */
  t.test('backoff delay calculation is correct for any attempt', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate base delay (1-1000ms)
        fc.integer({min: NUM.ONE, max: NUM.THOUSAND}),
        // Generate attempt number (0-10)
        fc.integer({min: NUM.ZERO, max: NUM.TEN}),
        async (baseDelay, attempt) => {
          const systemCache = createMockSystemCache([]);
          const messageRouter = {
            deliver: async () => ({acknowledged: true, success: true}),
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryDelayMs: baseDelay,
          });

          const calculatedDelay = router.calculateBackoffDelay(attempt);
          const expectedDelay = baseDelay * Math.pow(NUM.TWO, attempt);

          return calculatedDelay === expectedDelay;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('backoff delay calculation is correct for any attempt');
  });

  /**
   * Property: No retries needed when first attempt succeeds.
   *
   * When the first routing attempt succeeds, no delays should be recorded
   * and the result should be returned immediately.
   *
   * **Validates: Requirements 3.3**
   */
  t.test('no retries when first attempt succeeds', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate retry attempts (1-5)
        fc.integer({min: NUM.ONE, max: NUM.FIVE}),
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (retryAttempts, partitionId) => {
          let deliverCallCount = NUM.ZERO;
          const recordedDelays = [];

          const services = [
            createServiceEntry(partitionId, 'service-1', 'host:8080'),
          ];

          const systemCache = createMockSystemCache(services);

          // Mock message router that succeeds immediately
          const messageRouter = {
            deliver: async () => {
              deliverCallCount++;
              return {acknowledged: true, success: true, data: 'result'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts,
            retryDelayMs: NUM.HUNDRED,
            timeoutMs: NUM.THOUSAND * NUM.TEN,
          });

          // Override delay to record calls
          router.delay = (ms) => {
            recordedDelays.push(ms);
            return Promise.resolve();
          };

          const result = await router.routeToPartition(partitionId, {type: 'test'});

          // Should succeed on first attempt
          if (!result.success) {
            return false;
          }

          // Should only call deliver once
          if (deliverCallCount !== NUM.ONE) {
            return false;
          }

          // Should have no delays (no retries needed)
          return recordedDelays.length === NUM.ZERO;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('no retries when first attempt succeeds');
  });
});
