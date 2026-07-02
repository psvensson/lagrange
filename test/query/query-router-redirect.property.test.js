/**
 * Property test for QueryRouter Leader Redirect Following.
 * Property 5: For any routing response that indicates a leader redirect, the
 * QueryRouter SHALL attempt to route to the new leader address before
 * exhausting retries.
 *
 * Validates: Requirements 3.4
 *
 * Feature: code-clarity-maintainability
 * Property 5: QueryRouter Leader Redirect Following
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {QueryRouter} from '../../src/query/query-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {QUERY_RESPONSE_TYPE} from '../../src/query/query-constants.js';

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
 * @param {string} raftRole - Raft role
 * @return {Object} Service entry
 */
function createServiceEntry(partitionId, serviceId, address, raftRole) {
  return {
    partition_id: partitionId,
    service_id: serviceId,
    service_type: SERVICE_TYPE.PARTITION,
    status: SERVICE_STATUS.ACTIVE,
    address,
    raft_role: raftRole,
    node_id: 'node-1',
  };
}

/**
 * Feature: code-clarity-maintainability
 * Property 5: QueryRouter Leader Redirect Following
 *
 * For any routing response that indicates a leader redirect, the QueryRouter
 * SHALL attempt to route to the new leader address before exhausting retries.
 */
test('Property 5: QueryRouter Leader Redirect Following', async (t) => {
  /**
   * Property: Redirects are followed to the new leader address.
   *
   * When a routing response indicates a leader redirect with a leaderAddress,
   * the router should attempt to route to that address on the next attempt.
   *
   * **Validates: Requirements 3.4**
   */
  t.test('redirects are followed to the new leader address', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        // Generate follower address
        fc.tuple(
          fc.string({minLength: 1, maxLength: 10}).filter((s) => /^[a-z0-9-]+$/.test(s)),
          fc.integer({min: 1024, max: 65535}),
        ).map(([host, port]) => `ws://${host}:${port}`),
        // Generate leader address (different from follower)
        fc.tuple(
          fc.string({minLength: 1, maxLength: 10}).filter((s) => /^[a-z0-9-]+$/.test(s)),
          fc.integer({min: 1024, max: 65535}),
        ).map(([host, port]) => `ws://leader-${host}:${port}`),
        async (partitionId, followerAddress, leaderAddress) => {
          const routedAddresses = [];

          const services = [
            createServiceEntry(
              partitionId,
              'follower-1',
              followerAddress,
              RAFT_ROLE.FOLLOWER,
            ),
          ];

          const systemCache = createMockSystemCache(services);

          // Mock message router that returns redirect on first call, success on second
          const messageRouter = {
            deliver: async (address) => {
              routedAddresses.push(address);
              if (address === followerAddress) {
                return {
                  acknowledged: true,
                  success: false,
                  redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
                  leaderAddress,
                };
              }
              return {acknowledged: true, success: true, data: 'result'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts: NUM.FIVE,
            retryDelayMs: 1,
            timeoutMs: NUM.THOUSAND * NUM.TEN,
          });

          // Override delay to be instant
          router.delay = () => Promise.resolve();

          const result = await router.routeToPartition(partitionId, {type: 'test'});

          // Should succeed
          if (!result.success) {
            return false;
          }

          // Should have routed to follower first, then leader
          if (routedAddresses.length < 2) {
            return false;
          }

          // First address should be the follower
          if (routedAddresses[0] !== followerAddress) {
            return false;
          }

          // Second address should be the leader from redirect
          return routedAddresses[1] === leaderAddress;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('redirects are followed to the new leader address');
  });

  /**
   * Property: Redirects are followed before exhausting retries.
   *
   * When a redirect is received, the router should follow it immediately
   * without counting it as a failed retry attempt.
   *
   * **Validates: Requirements 3.4**
   */
  t.test('redirects are followed before exhausting retries', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        // Generate number of redirects (1-3)
        fc.integer({min: 1, max: NUM.THREE}),
        async (partitionId, numRedirects) => {
          let callCount = 0;
          const routedAddresses = [];

          const services = [
            createServiceEntry(
              partitionId,
              'initial-service',
              'ws://initial:8080',
              RAFT_ROLE.FOLLOWER,
            ),
          ];

          const systemCache = createMockSystemCache(services);

          // Mock message router that returns redirects then success
          const messageRouter = {
            deliver: async (address) => {
              callCount++;
              routedAddresses.push(address);

              // Return redirects for first N calls
              if (callCount <= numRedirects) {
                return {
                  acknowledged: true,
                  success: false,
                  redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
                  leaderAddress: `ws://redirect-${callCount}:8080`,
                };
              }

              // Success after all redirects
              return {acknowledged: true, success: true, data: 'result'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts: numRedirects + 1, // Just enough for redirects + success
            retryDelayMs: 1,
            timeoutMs: NUM.THOUSAND * NUM.TEN,
          });

          // Override delay to be instant
          router.delay = () => Promise.resolve();

          try {
            const result = await router.routeToPartition(partitionId, {type: 'test'});

            // Should succeed
            if (!result.success) {
              return false;
            }

            // Should have made numRedirects + 1 calls (redirects + final success)
            return callCount === numRedirects + 1;
          } catch (_error) {
            // Should not throw if redirects are followed properly
            return false;
          }
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('redirects are followed before exhausting retries');
  });

  /**
   * Property: Redirect address is added to front of candidates.
   *
   * When a redirect is received, the new leader address should be tried
   * first on the next iteration.
   *
   * **Validates: Requirements 3.4**
   */
  t.test('redirect address is added to front of candidates', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        // Generate multiple follower addresses (2-3)
        fc.array(
          fc.tuple(
            fc.string({minLength: 1, maxLength: 10}).filter((s) => /^[a-z0-9-]+$/.test(s)),
            fc.integer({min: 1024, max: 65535}),
          ).map(([host, port]) => `ws://${host}:${port}`),
          {minLength: 2, maxLength: NUM.THREE},
        ),
        // Generate leader address
        fc.constant('ws://leader:9999'),
        async (partitionId, followerAddresses, leaderAddress) => {
          const routedAddresses = [];
          let redirectSent = false;

          const services = followerAddresses.map((addr, idx) =>
            createServiceEntry(
              partitionId,
              `follower-${idx}`,
              addr,
              RAFT_ROLE.FOLLOWER,
            ),
          );

          const systemCache = createMockSystemCache(services);

          // Mock message router
          const messageRouter = {
            deliver: async (address) => {
              routedAddresses.push(address);

              // First call returns redirect
              if (!redirectSent) {
                redirectSent = true;
                return {
                  acknowledged: true,
                  success: false,
                  redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
                  leaderAddress,
                };
              }

              // After redirect, success if we hit the leader address
              if (address === leaderAddress) {
                return {acknowledged: true, success: true, data: 'result'};
              }

              // Fail for other addresses
              return {acknowledged: false, success: false, error: 'Not leader'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts: NUM.FIVE,
            retryDelayMs: 1,
            timeoutMs: NUM.THOUSAND * NUM.TEN,
          });

          // Override delay to be instant
          router.delay = () => Promise.resolve();

          const result = await router.routeToPartition(partitionId, {type: 'test'});

          // Should succeed
          if (!result.success) {
            return false;
          }

          // After redirect, the leader address should be tried immediately
          // (second call should be to leader address)
          return routedAddresses[1] === leaderAddress;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('redirect address is added to front of candidates');
  });

  /**
   * Property: Multiple consecutive redirects are followed.
   *
   * When multiple redirects are received in sequence, each redirect should
   * be followed to the new address.
   *
   * **Validates: Requirements 3.4**
   */
  t.test('multiple consecutive redirects are followed', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        // Generate chain of redirect addresses (2-4)
        fc.array(
          fc.tuple(
            fc.string({minLength: 1, maxLength: 10}).filter((s) => /^[a-z0-9-]+$/.test(s)),
            fc.integer({min: 1024, max: 65535}),
          ).map(([host, port]) => `ws://${host}:${port}`),
          {minLength: 2, maxLength: NUM.FOUR},
        ),
        async (partitionId, redirectChain) => {
          let callIndex = 0;
          const routedAddresses = [];

          const services = [
            createServiceEntry(
              partitionId,
              'initial-service',
              redirectChain[0],
              RAFT_ROLE.FOLLOWER,
            ),
          ];

          const systemCache = createMockSystemCache(services);

          // Mock message router that follows redirect chain
          const messageRouter = {
            deliver: async (address) => {
              routedAddresses.push(address);
              const currentIndex = callIndex;
              callIndex++;

              // Return redirect for all but last address in chain
              if (currentIndex < redirectChain.length - 1) {
                return {
                  acknowledged: true,
                  success: false,
                  redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
                  leaderAddress: redirectChain[currentIndex + 1],
                };
              }

              // Success at end of chain
              return {acknowledged: true, success: true, data: 'result'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts: redirectChain.length + 1,
            retryDelayMs: 1,
            timeoutMs: NUM.THOUSAND * NUM.TEN,
          });

          // Override delay to be instant
          router.delay = () => Promise.resolve();

          const result = await router.routeToPartition(partitionId, {type: 'test'});

          // Should succeed
          if (!result.success) {
            return false;
          }

          // Should have followed the entire redirect chain
          if (routedAddresses.length !== redirectChain.length) {
            return false;
          }

          // Each address in the chain should have been visited in order
          for (let i = 0; i < redirectChain.length; i++) {
            if (routedAddresses[i] !== redirectChain[i]) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('multiple consecutive redirects are followed');
  });

  /**
   * Property: Redirect without leaderAddress is not followed.
   *
   * When a redirect response lacks a leaderAddress, it should not be
   * treated as a redirect and should proceed with normal retry logic.
   *
   * **Validates: Requirements 3.4**
   */
  t.test('redirect without leaderAddress is not followed', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate partition ID
        fc.string({minLength: 1, maxLength: 20}).filter((s) => s.trim().length > 0),
        async (partitionId) => {
          let callCount = 0;

          const services = [
            createServiceEntry(
              partitionId,
              'service-1',
              'ws://service:8080',
              RAFT_ROLE.FOLLOWER,
            ),
          ];

          const systemCache = createMockSystemCache(services);

          // Mock message router that returns redirect without leaderAddress
          const messageRouter = {
            deliver: async () => {
              callCount++;
              if (callCount === 1) {
                // Redirect without leaderAddress
                return {
                  acknowledged: true,
                  success: false,
                  redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
                  // No leaderAddress provided
                };
              }
              // Success on retry
              return {acknowledged: true, success: true, data: 'result'};
            },
          };

          const router = new QueryRouter({
            systemCache,
            messageRouter,
            retryAttempts: NUM.THREE,
            retryDelayMs: 1,
            timeoutMs: NUM.THOUSAND * NUM.TEN,
          });

          // Override delay to be instant
          router.delay = () => Promise.resolve();

          const result = await router.routeToPartition(partitionId, {type: 'test'});

          // Should eventually succeed through normal retry
          return result.success === true;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('redirect without leaderAddress is not followed');
  });
});
