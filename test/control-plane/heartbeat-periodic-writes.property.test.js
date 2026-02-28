/**
 * Property-based test for HeartbeatService periodic writes.
 *
 * Property 13: Heartbeat service periodic writes
 * For any running HeartbeatService instance, after N heartbeat intervals
 * have elapsed in a short burst, the service shall coalesce unchanged
 * node heartbeat updates and throttle node_endpoints upserts to avoid
 * rewriting unchanged rows on every tick.
 *
 * **Validates: Requirements 8.2**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {HeartbeatService} from
  '../../src/control-plane/heartbeat-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {HEARTBEAT_STATE} from
  '../../src/control-plane/heartbeat-service-constants.js';

/**
 * Initialize test singletons.
 */
function initEnv() {
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
 * Create a mock system table cache.
 * @return {Object} Mock cache.
 */
function createMockCache() {
  const store = new Map();
  return {
    get: (_table, id) => store.get(id) || null,
    set: (table, id, data) => store.set(id, data),
  };
}

/**
 * Create a mock CDC integration service that counts writes.
 * @return {Object} Mock CDC service with writeCount.
 */
function createMockCdc() {
  let updateCount = 0;
  let upsertCount = 0;
  return {
    get writeCount() {
      return updateCount + upsertCount;
    },
    get updateCount() {
      return updateCount;
    },
    get upsertCount() {
      return upsertCount;
    },
    updateSystemTableRow: async () => {
      updateCount++;
      return {success: true};
    },
    upsertSystemTableRow: async () => {
      upsertCount++;
      return {success: true};
    },
  };
}

test('Property 13: Heartbeat service periodic writes',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 5}),
        async (heartbeatCount) => {
          initEnv();

          const mockCdc = createMockCdc();
          const mockCache = createMockCache();

          const service = new HeartbeatService({
            nodeId: 'test-node',
            nodeAddress: 'ws://localhost:8080',
            cdcIntegrationService: mockCdc,
            systemTableCache: mockCache,
            nodeMetadataMinUpdateIntervalMs: 1000,
            nodeMetadataMaxStalenessMs: 5000,
          });

          service.initialize();

          const originalNow = Date.now;
          let now = 0;
          Date.now = () => now;
          try {
            // Directly call sendHeartbeat N times instead of relying on timers.
            // Keep calls inside min update interval to verify coalescing.
            for (let i = 0; i < heartbeatCount; i++) {
              await service.sendHeartbeat(null, null);
              service.heartbeatCount++;
              now += 10;
            }
          } finally {
            Date.now = originalNow;
          }

          const expectedNodeWrites = 1;
          const expectedEndpointWrites = 1;

          t.equal(
            mockCdc.updateCount, expectedNodeWrites,
            `${heartbeatCount} heartbeats should coalesce to ` +
            `${expectedNodeWrites} node heartbeat update`,
          );
          t.equal(
            mockCdc.upsertCount, expectedEndpointWrites,
            'unchanged endpoint should be upserted once during the burst',
          );

          t.equal(
            service.getHeartbeatCount(), heartbeatCount,
            `heartbeat count should be ${heartbeatCount}`,
          );

          t.equal(
            service.getState(), HEARTBEAT_STATE.INITIALIZED,
            'state should remain initialized (no timer started)',
          );

          service.stop();
          return true;
        },
      ),
      {numRuns: 10},
    );
  });
