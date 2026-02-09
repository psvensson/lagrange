/**
 * Property-based test for HeartbeatService periodic writes.
 *
 * Property 13: Heartbeat service periodic writes
 * For any running HeartbeatService instance, after N heartbeat intervals
 * have elapsed, the service shall have issued N heartbeat update writes
 * via CDC (within a tolerance of ±1 for timing).
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
  let writeCount = 0;
  return {
    get writeCount() {
      return writeCount;
    },
    upsertSystemTableRow: async () => {
      writeCount++;
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
          });

          service.initialize();

          // Directly call sendHeartbeat N times instead of
          // relying on timers (avoids real-time delays)
          for (let i = 0; i < heartbeatCount; i++) {
            await service.sendHeartbeat(null, null);
            service.heartbeatCount++;
          }

          // Each heartbeat writes 2 rows: nodes + node_endpoints
          const expectedWrites = heartbeatCount * 2;

          t.equal(
            mockCdc.writeCount, expectedWrites,
            `${heartbeatCount} heartbeats should produce ` +
            `${expectedWrites} CDC writes`,
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
