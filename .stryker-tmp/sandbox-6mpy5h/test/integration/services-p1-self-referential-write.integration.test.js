/**
 * Integration test for services-p1 self-referential write.
 *
 * This test verifies that the services-p1 partition can write to itself
 * without deadlock and that CDC events propagate correctly to the cache.
 *
 * Requirements: 8.1, 8.2, 8.4, 8.5
 * - 8.1: WHEN services-p1 creates a new replica THEN it SHALL be able to insert
 *        a row for that replica into itself
 * - 8.2: THE self-referential insert SHALL NOT cause a deadlock
 * - 8.4: WHEN the insert completes THEN the CDC event SHALL propagate to the
 *        system cache
 * - 8.5: IF the self-referential insert fails THEN the error SHALL be logged
 *        with diagnostic details
 *
 * @module test/integration/services-p1-self-referential-write.integration.test
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  INTEGRATION_TEST_TIMEOUT_MS,
  TEST_LEADERSHIP_WAIT_MS,
  TEST_STABILIZATION_MS,
} from '../../src/test-helpers/test-timeout-constants.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  getUniquePort,
  TEST_CONFIG,
} from './helpers/cluster-test-helpers.js';

/**
 * Test timeout constants for bounded polling.
 * These values are optimized for fast test execution while allowing
 * sufficient time for Raft elections and CDC propagation.
 */
const TEST_TIMEOUTS = {
  BOOTSTRAP_WAIT_MS: 5000,
  LEADERSHIP_WAIT_MS: TEST_LEADERSHIP_WAIT_MS,
  CDC_PROPAGATION_WAIT_MS: 3000,
  POLL_INTERVAL_MS: 50,
  WRITE_TIMEOUT_MS: 5000,
};

/**
 * Wait for partition leader to be elected in partition services.
 * Uses bounded polling with configurable intervals.
 *
 * @param {Object} bootstrapResult - Bootstrap result with partitionServices.
 * @param {string} partitionId - Partition ID to wait for.
 * @param {number} timeoutMs - Maximum wait time.
 * @param {number} intervalMs - Polling interval.
 * @return {Promise<Object|null>} Leader service or null.
 */
async function waitForPartitionLeader(
  bootstrapResult,
  partitionId,
  timeoutMs = TEST_TIMEOUTS.LEADERSHIP_WAIT_MS,
  intervalMs = TEST_TIMEOUTS.POLL_INTERVAL_MS,
) {
  const start = Date.now();
  let pollCount = 0;

  while (Date.now() - start < timeoutMs) {
    pollCount++;
    for (const service of bootstrapResult.partitionServices.values()) {
      if (service.partitionId === partitionId && service.isLeader === true) {
        return service;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // Timeout reached - return null with diagnostic info logged
  const elapsed = Date.now() - start;
  const diagnostics = {
    waitingFor: 'partition leader election',
    partitionId,
    elapsedMs: elapsed,
    timeoutMs,
    pollCount,
  };
  console.error('Timeout waiting for partition leader:', JSON.stringify(diagnostics));
  return null;
}

/**
 * Wait for a service record to appear in the system table cache.
 * Uses bounded polling with configurable intervals.
 *
 * @param {Object} systemTableCache - System table cache instance.
 * @param {string} serviceId - Service ID to wait for.
 * @param {number} timeoutMs - Maximum wait time.
 * @param {number} intervalMs - Polling interval.
 * @return {Promise<Object|null>} Service record or null.
 */
async function waitForServiceInCache(
  systemTableCache,
  serviceId,
  timeoutMs = TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS,
  intervalMs = TEST_TIMEOUTS.POLL_INTERVAL_MS,
) {
  const start = Date.now();
  let pollCount = 0;

  while (Date.now() - start < timeoutMs) {
    pollCount++;
    const service = systemTableCache.get(TABLES.SERVICES, serviceId);
    if (service) {
      return service;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // Timeout reached - return null with diagnostic info
  const elapsed = Date.now() - start;
  const diagnostics = {
    waitingFor: 'service record in cache',
    serviceId,
    elapsedMs: elapsed,
    timeoutMs,
    pollCount,
  };
  console.error('Timeout waiting for service in cache:', JSON.stringify(diagnostics));
  return null;
}

/**
 * Wait for a service record to be updated in the cache.
 * Uses bounded polling with configurable intervals.
 *
 * @param {Object} systemTableCache - System table cache instance.
 * @param {string} serviceId - Service ID to check.
 * @param {Function} predicate - Function that returns true when update is detected.
 * @param {number} timeoutMs - Maximum wait time.
 * @param {number} intervalMs - Polling interval.
 * @return {Promise<Object|null>} Updated service record or null.
 */
async function waitForServiceUpdate(
  systemTableCache,
  serviceId,
  predicate,
  timeoutMs = TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS,
  intervalMs = TEST_TIMEOUTS.POLL_INTERVAL_MS,
) {
  const start = Date.now();
  let pollCount = 0;

  while (Date.now() - start < timeoutMs) {
    pollCount++;
    const service = systemTableCache.get(TABLES.SERVICES, serviceId);
    if (service && predicate(service)) {
      return service;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // Timeout reached - return null with diagnostic info
  const elapsed = Date.now() - start;
  const diagnostics = {
    waitingFor: 'service update in cache',
    serviceId,
    elapsedMs: elapsed,
    timeoutMs,
    pollCount,
  };
  console.error('Timeout waiting for service update:', JSON.stringify(diagnostics));
  return null;
}

/**
 * Check whether an error-like value indicates an in-use port collision.
 *
 * @param {*} errorLike - Error object or message-like value.
 * @return {boolean} True when the error indicates EADDRINUSE.
 */
function isAddressInUseError(errorLike) {
  const message = typeof errorLike === 'string' ?
    errorLike :
    (errorLike?.message || '');
  return message.includes('EADDRINUSE');
}

/**
 * Bootstrap a seed node with bounded retries for transient EADDRINUSE races.
 *
 * @param {string} seedNodeId - Seed node ID.
 * @param {number} maxAttempts - Maximum attempts.
 * @return {Promise<{seedWsPort:number, bootstrapService:Object, bootstrapResult:Object}>}
 */
async function bootstrapSeedNodeWithRetry(seedNodeId, maxAttempts = 3) {
  let lastAddressInUseError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const seedWsPort = getUniquePort();
    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult = null;
    try {
      bootstrapResult = await bootstrapService.bootstrap();
      if (bootstrapResult?.success) {
        return {seedWsPort, bootstrapService, bootstrapResult};
      }

      if (!isAddressInUseError(bootstrapResult?.error)) {
        return {seedWsPort, bootstrapService, bootstrapResult};
      }

      lastAddressInUseError = new Error(
        bootstrapResult?.error || 'Bootstrap failed with EADDRINUSE',
      );
    } catch (error) {
      if (!isAddressInUseError(error)) {
        throw error;
      }
      lastAddressInUseError = error;
    }

    if (bootstrapResult?.messageRouter?.shutdown) {
      await bootstrapResult.messageRouter.shutdown()
        .catch((err) => console.warn('shutdown failed', err.message));
    }
    await bootstrapService.shutdown()
      .catch((err) => console.warn('shutdown failed', err.message));
  }

  throw lastAddressInUseError ||
    new Error(`Bootstrap failed with EADDRINUSE after ${maxAttempts} attempts`);
}

test('Services-P1 self-referential write integration', {timeout: INTEGRATION_TEST_TIMEOUT_MS},
  async (t) => {
    t.beforeEach(() => {
      initializeTestEnvironment();
    });

    t.afterEach(async () => {
      await cleanupTestEnvironment();
    });

    /**
     * Test: Services-p1 can write to itself without deadlock.
     *
     * This test verifies that the services-p1 partition can insert a row
     * for itself into the services table without causing a deadlock.
     * The write should complete within the timeout and the CDC event
     * should propagate to the system cache.
     *
     * Validates: Requirements 8.1, 8.2, 8.4
     */
    await t.test('services-p1 writes to itself without deadlock', async (t) => {
      // =========================================================================
      // PHASE 1: Bootstrap seed node with system tables
      // =========================================================================
      const seedNodeId = '550e8400-e29b-41d4-a716-446655440201';
      let seedWsPort;
      let bootstrapService;
      let bootstrapResult;

      try {
        ({seedWsPort, bootstrapService, bootstrapResult} =
          await bootstrapSeedNodeWithRetry(seedNodeId));
        t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

        // =========================================================================
        // PHASE 2: Wait for services-p1 leader election
        // =========================================================================
        const servicesP1Leader = await waitForPartitionLeader(
          bootstrapResult,
          'services-p1',
          TEST_TIMEOUTS.LEADERSHIP_WAIT_MS,
        );
        t.ok(servicesP1Leader, 'services-p1 should elect a leader');
        t.equal(servicesP1Leader.isLeader, true, 'services-p1 leader should be confirmed');

        // =========================================================================
        // PHASE 3: Get system table cache and CDC integration service
        // =========================================================================
        const systemTableCache = NodeService.getInstance().getSystemTableCache();
        t.ok(systemTableCache, 'should have system table cache');

        const cdcIntegrationService = bootstrapService.cdcIntegrationService;
        t.ok(cdcIntegrationService, 'should have CDC integration service');

        // =========================================================================
        // PHASE 4: Verify services-p1 leader already exists in cache
        // This confirms the initial self-referential write during bootstrap worked
        // =========================================================================
        const existingServices = systemTableCache.getAll(TABLES.SERVICES) || [];
        const servicesP1LeaderInCache = existingServices.find((s) =>
          s[COLUMN.PARTITION_ID] === 'services-p1' &&
          s[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER,
        );
        t.ok(servicesP1LeaderInCache,
          'services-p1 leader should already exist in cache from bootstrap');

        // =========================================================================
        // PHASE 5: Trigger a new self-referential write to services-p1
        // This simulates services-p1 updating its own status
        // =========================================================================
        const testServiceId = `services-p1-test-${Date.now()}`;
        const writeStartTime = Date.now();

        // Create a timeout promise for the write operation
        let writeTimeoutId;
        const writeTimeoutPromise = new Promise((_, reject) => {
          writeTimeoutId = setTimeout(() => {
            reject(new Error(
              `Self-referential write timeout after ${TEST_TIMEOUTS.WRITE_TIMEOUT_MS}ms`,
            ));
          }, TEST_TIMEOUTS.WRITE_TIMEOUT_MS);
        });

        // Perform the self-referential write
        const writePromise = cdcIntegrationService.insertSystemTableRow(
          SYSTEM_TABLE_NAME.SERVICES,
          {
            service_id: testServiceId,
            service_type: SERVICE_TYPE.PARTITION,
            node_id: seedNodeId,
            partition_id: 'services-p1',
            replica_id: testServiceId,
            raft_role: RAFT_ROLE.FOLLOWER,
            status: SERVICE_STATUS.ACTIVE,
            address: `ws://localhost:${seedWsPort}/partition/${testServiceId}`,
          },
        );

        // Race between write and timeout
        let writeResult;
        try {
          writeResult = await Promise.race([writePromise, writeTimeoutPromise]);
        } finally {
          clearTimeout(writeTimeoutId);
        }

        const writeElapsedMs = Date.now() - writeStartTime;

        // =========================================================================
        // PHASE 6: Verify write completed without deadlock
        // Validates: Requirements 8.1, 8.2
        // =========================================================================
        t.ok(writeResult, 'self-referential write should complete');
        t.equal(writeResult.success, true, 'self-referential write should succeed');
        t.ok(writeElapsedMs < TEST_TIMEOUTS.WRITE_TIMEOUT_MS,
          `write should complete within timeout (took ${writeElapsedMs}ms)`);

        t.comment(`Self-referential write completed in ${writeElapsedMs}ms`);

        // =========================================================================
        // PHASE 7: Verify CDC propagated to cache
        // Validates: Requirement 8.4
        // =========================================================================
        const serviceInCache = await waitForServiceInCache(
          systemTableCache,
          testServiceId,
          TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS,
        );

        t.ok(serviceInCache, 'service should appear in cache after CDC propagation');
        t.equal(serviceInCache[COLUMN.SERVICE_ID], testServiceId,
          'cached service should have correct service_id');
        t.equal(serviceInCache[COLUMN.PARTITION_ID], 'services-p1',
          'cached service should have correct partition_id');
        t.equal(serviceInCache[COLUMN.SERVICE_TYPE], SERVICE_TYPE.PARTITION,
          'cached service should have correct service_type');
        t.equal(serviceInCache[COLUMN.NODE_ID], seedNodeId,
          'cached service should have correct node_id');

        t.comment('CDC propagation verified - service record found in cache');
      } finally {
        // =========================================================================
        // CLEANUP
        // =========================================================================
        if (bootstrapService?.shutdown) {
          await bootstrapService.shutdown().catch((_shutdownErr) => {});
        }
        if (bootstrapResult?.messageRouter) {
          await bootstrapResult.messageRouter.shutdown().catch((_shutdownErr) => {});
        }
      }
    });

    /**
     * Test: Services-p1 can update its own records.
     *
     * This test verifies that services-p1 can update existing records
     * in the services table (self-referential update) without deadlock.
     *
     * Validates: Requirements 8.1, 8.2, 8.4
     */
    await t.test('services-p1 updates its own records without deadlock', async (t) => {
      // =========================================================================
      // PHASE 1: Bootstrap seed node
      // =========================================================================
      const seedNodeId = '550e8400-e29b-41d4-a716-446655440202';
      let bootstrapService;
      let bootstrapResult;

      try {
        ({bootstrapService, bootstrapResult} =
          await bootstrapSeedNodeWithRetry(seedNodeId));
        t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

        // Wait for services-p1 leader
        const servicesP1Leader = await waitForPartitionLeader(
          bootstrapResult,
          'services-p1',
          TEST_TIMEOUTS.LEADERSHIP_WAIT_MS,
        );
        t.ok(servicesP1Leader, 'services-p1 should elect a leader');

        // =========================================================================
        // PHASE 2: Get services and find an existing services-p1 record to update
        // =========================================================================
        const systemTableCache = NodeService.getInstance().getSystemTableCache();
        const cdcIntegrationService = bootstrapService.cdcIntegrationService;

        const existingServices = systemTableCache.getAll(TABLES.SERVICES) || [];
        const servicesP1Record = existingServices.find((s) =>
          s[COLUMN.PARTITION_ID] === 'services-p1' &&
          s[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION,
        );

        t.ok(servicesP1Record, 'should find existing services-p1 record');
        const serviceIdToUpdate = servicesP1Record[COLUMN.SERVICE_ID];
        const originalUpdatedAt = servicesP1Record[COLUMN.UPDATED_AT];

        // Small delay to ensure updated_at will be different
        await new Promise((resolve) => setTimeout(resolve, TEST_STABILIZATION_MS));

        // =========================================================================
        // PHASE 3: Perform self-referential update
        // =========================================================================
        const updateStartTime = Date.now();

        let updateTimeoutId;
        const updateTimeoutPromise = new Promise((_, reject) => {
          updateTimeoutId = setTimeout(() => {
            reject(new Error(
              `Self-referential update timeout after ${TEST_TIMEOUTS.WRITE_TIMEOUT_MS}ms`,
            ));
          }, TEST_TIMEOUTS.WRITE_TIMEOUT_MS);
        });

        const updatePromise = cdcIntegrationService.updateSystemTableRow(
          SYSTEM_TABLE_NAME.SERVICES,
          {service_id: serviceIdToUpdate},
          {updated_at: Date.now()},
        );

        let updateResult;
        try {
          updateResult = await Promise.race([updatePromise, updateTimeoutPromise]);
        } finally {
          clearTimeout(updateTimeoutId);
        }

        const updateElapsedMs = Date.now() - updateStartTime;

        // =========================================================================
        // PHASE 4: Verify update completed without deadlock
        // =========================================================================
        t.ok(updateResult, 'self-referential update should complete');
        t.equal(updateResult.success, true, 'self-referential update should succeed');
        t.ok(updateElapsedMs < TEST_TIMEOUTS.WRITE_TIMEOUT_MS,
          `update should complete within timeout (took ${updateElapsedMs}ms)`);

        t.comment(`Self-referential update completed in ${updateElapsedMs}ms`);

        // =========================================================================
        // PHASE 5: Verify CDC propagated the update to cache
        // =========================================================================
        const updatedService = await waitForServiceUpdate(
          systemTableCache,
          serviceIdToUpdate,
          (service) => service[COLUMN.UPDATED_AT] > originalUpdatedAt,
          TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS,
        );

        t.ok(updatedService, 'updated service should appear in cache');
        t.ok(updatedService[COLUMN.UPDATED_AT] > originalUpdatedAt,
          'updated_at should be newer than original');

        t.comment('CDC propagation verified - update reflected in cache');
      } finally {
        // =========================================================================
        // CLEANUP
        // =========================================================================
        if (bootstrapService?.shutdown) {
          await bootstrapService.shutdown().catch((_shutdownErr) => {});
        }
        if (bootstrapResult?.messageRouter) {
          await bootstrapResult.messageRouter.shutdown().catch((_shutdownErr) => {});
        }
      }
    });

    /**
     * Test: Multiple concurrent self-referential writes complete.
     *
     * This test verifies that multiple concurrent writes to services-p1
     * all complete without blocking each other.
     *
     * Validates: Requirements 8.1, 8.2, 8.4
     */
    await t.test('multiple concurrent self-referential writes complete', async (t) => {
      // =========================================================================
      // PHASE 1: Bootstrap seed node
      // =========================================================================
      const seedNodeId = '550e8400-e29b-41d4-a716-446655440203';
      let seedWsPort;
      let bootstrapService;
      let bootstrapResult;

      try {
        ({seedWsPort, bootstrapService, bootstrapResult} =
          await bootstrapSeedNodeWithRetry(seedNodeId));
        t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

        // Wait for services-p1 leader
        const servicesP1Leader = await waitForPartitionLeader(
          bootstrapResult,
          'services-p1',
          TEST_TIMEOUTS.LEADERSHIP_WAIT_MS,
        );
        t.ok(servicesP1Leader, 'services-p1 should elect a leader');

        // =========================================================================
        // PHASE 2: Prepare concurrent writes
        // =========================================================================
        const systemTableCache = NodeService.getInstance().getSystemTableCache();
        const cdcIntegrationService = bootstrapService.cdcIntegrationService;

        const concurrentWriteCount = 3;
        const testServiceIds = [];
        const writePromises = [];

        const concurrentStartTime = Date.now();

        // Create concurrent write promises
        for (let i = 0; i < concurrentWriteCount; i++) {
          const testServiceId = `services-p1-concurrent-${Date.now()}-${i}`;
          testServiceIds.push(testServiceId);

          const writePromise = cdcIntegrationService.insertSystemTableRow(
            SYSTEM_TABLE_NAME.SERVICES,
            {
              service_id: testServiceId,
              service_type: SERVICE_TYPE.PARTITION,
              node_id: seedNodeId,
              partition_id: 'services-p1',
              replica_id: testServiceId,
              raft_role: RAFT_ROLE.FOLLOWER,
              status: SERVICE_STATUS.ACTIVE,
              address: `ws://localhost:${seedWsPort}/partition/${testServiceId}`,
            },
          );
          writePromises.push(writePromise);
        }

        // =========================================================================
        // PHASE 3: Execute concurrent writes with timeout
        // =========================================================================
        let concurrentTimeoutId;
        const concurrentTimeoutPromise = new Promise((_, reject) => {
          concurrentTimeoutId = setTimeout(() => {
            reject(new Error(
              `Concurrent writes timeout after ${TEST_TIMEOUTS.WRITE_TIMEOUT_MS}ms`,
            ));
          }, TEST_TIMEOUTS.WRITE_TIMEOUT_MS);
        });

        let results;
        try {
          results = await Promise.race([
            Promise.all(writePromises),
            concurrentTimeoutPromise,
          ]);
        } finally {
          clearTimeout(concurrentTimeoutId);
        }

        const concurrentElapsedMs = Date.now() - concurrentStartTime;

        // =========================================================================
        // PHASE 4: Verify all writes completed
        // =========================================================================
        t.equal(results.length, concurrentWriteCount,
          `all ${concurrentWriteCount} concurrent writes should complete`);

        for (let i = 0; i < results.length; i++) {
          t.equal(results[i].success, true, `write ${i} should succeed`);
        }

        t.ok(concurrentElapsedMs < TEST_TIMEOUTS.WRITE_TIMEOUT_MS,
          `concurrent writes should complete within timeout (took ${concurrentElapsedMs}ms)`);

        t.comment(`${concurrentWriteCount} concurrent writes completed in ` +
          `${concurrentElapsedMs}ms`);

        // =========================================================================
        // PHASE 5: Verify all records propagated to cache via CDC
        // =========================================================================
        for (const testServiceId of testServiceIds) {
          const serviceInCache = await waitForServiceInCache(
            systemTableCache,
            testServiceId,
            TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS,
          );
          t.ok(serviceInCache, `service ${testServiceId} should appear in cache`);
        }

        t.comment('All concurrent writes verified in cache via CDC');
      } finally {
        // =========================================================================
        // CLEANUP
        // =========================================================================
        if (bootstrapService?.shutdown) {
          await bootstrapService.shutdown().catch((_shutdownErr) => {});
        }
        if (bootstrapResult?.messageRouter) {
          await bootstrapResult.messageRouter.shutdown().catch((_shutdownErr) => {});
        }
      }
    });
  });
