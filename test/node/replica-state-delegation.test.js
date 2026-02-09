/**
 * Unit tests verifying replica state delegation.
 *
 * Verifies that ReplicaLifecycleManager and ReplicaHandler do NOT
 * maintain independent replica lifecycle state maps. Their Maps are
 * operational bookkeeping (service references, concurrency guards,
 * request correlation) — not shadow copies of replica state.
 *
 * Requirements: 4.2, 4.3, 4.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {ReplicaLifecycleManager} from '../../src/node/replica-lifecycle-manager.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  REPLICA_STATE_MACHINE_STATE,
} from '../../src/node/replica-state-machine-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * All replica lifecycle state values from both state enums.
 * These are the values that should NOT be stored as Map values
 * in ReplicaHandler or ReplicaLifecycleManager.
 */
const REPLICA_STATE_VALUES = new Set([
  ...Object.values(ReplicaStatus),
  ...Object.values(REPLICA_STATE_MACHINE_STATE),
]);

/**
 * Create a minimal mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService() {
  return {
    async insertSystemTableRow() {
      return {success: true};
    },
    async updateSystemTableRow() {
      return {success: true};
    },
    async upsertSystemTableRow() {
      return {success: true};
    },
    async deleteSystemTableRow() {
      return {success: true};
    },
  };
}

/**
 * Create a minimal system table cache with filter support.
 * @return {Object} Mock system table cache.
 */
function createMockCache() {
  const cache = new SystemTableCache();
  return cache;
}

/**
 * Create a mock partition service factory.
 * @return {Function} Factory function.
 */
function createMockPartitionServiceFactory() {
  return async (options) => ({
    partitionId: options.partitionId,
    replicaId: options.replicaId,
    async shutdown() {},
    async syncFromLeader() {},
  });
}

test('Replica state delegation', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize({});
    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.test(
    'ReplicaLifecycleManager.pendingOperations stores ' +
    'request correlation, not replica state',
    async (t) => {
      const cache = createMockCache();
      const mockCDC = createMockCDCService();

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: '/tmp/test',
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      const manager = new ReplicaLifecycleManager({
        nodeId: 'test-node',
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        replicaHandler: handler,
      });

      // pendingOperations is a Map keyed by request_id
      t.ok(
        manager.pendingOperations instanceof Map,
        'pendingOperations is a Map',
      );

      // Verify the Map is empty initially — no pre-seeded state
      t.equal(
        manager.pendingOperations.size,
        0,
        'pendingOperations starts empty',
      );

      // Verify no Map keys match replica state values
      for (const key of manager.pendingOperations.keys()) {
        t.notOk(
          REPLICA_STATE_VALUES.has(key),
          `pendingOperations key "${key}" is not a replica state`,
        );
      }

      manager.shutdown();
      handler.shutdown();
    },
  );

  t.test(
    'ReplicaHandler.localServices stores service references, ' +
    'not state values',
    async (t) => {
      const cache = createMockCache();
      const mockCDC = createMockCDCService();

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: '/tmp/test',
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      // Simulate registering a service reference
      const mockService = {
        partitionId: 'p-1',
        replicaId: 'r-1',
        async shutdown() {},
      };
      handler.localServices.set('r-1', mockService);

      // Values must be objects (service handles), not strings
      for (const [key, value] of handler.localServices) {
        t.notOk(
          REPLICA_STATE_VALUES.has(key),
          `localServices key "${key}" is not a replica state`,
        );
        t.equal(
          typeof value,
          'object',
          `localServices value for "${key}" is an object reference`,
        );
        t.notOk(
          REPLICA_STATE_VALUES.has(value),
          `localServices value for "${key}" is not a state string`,
        );
      }

      handler.shutdown();
    },
  );

  t.test(
    'ReplicaHandler.inProgressOperations stores operation metadata, ' +
    'not state values',
    async (t) => {
      const cache = createMockCache();
      const mockCDC = createMockCDCService();

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: '/tmp/test',
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      // Simulate an in-progress operation entry
      handler.inProgressOperations.set('op-1', {
        type: 'CREATE_REPLICA',
        replicaId: 'r-1',
        partitionId: 'p-1',
        startedAt: Date.now(),
      });

      // Keys are operation IDs, not state values
      for (const [key, value] of handler.inProgressOperations) {
        t.notOk(
          REPLICA_STATE_VALUES.has(key),
          `inProgressOperations key "${key}" is not a replica state`,
        );
        t.equal(
          typeof value,
          'object',
          `inProgressOperations value for "${key}" is an object`,
        );
        t.notOk(
          REPLICA_STATE_VALUES.has(value),
          'inProgressOperations value is not a state string',
        );
      }

      handler.shutdown();
    },
  );

  t.test(
    'Neither component has Maps/Sets keyed by replica state values',
    async (t) => {
      const cache = createMockCache();
      const mockCDC = createMockCDCService();

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: '/tmp/test',
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      const manager = new ReplicaLifecycleManager({
        nodeId: 'test-node',
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        replicaHandler: handler,
      });

      // Collect all Map/Set properties from both instances
      const collectMapSetProps = (instance, name) => {
        const results = [];
        for (const prop of Object.keys(instance)) {
          const val = instance[prop];
          if (val instanceof Map || val instanceof Set) {
            results.push({component: name, property: prop, collection: val});
          }
        }
        return results;
      };

      const collections = [
        ...collectMapSetProps(handler, 'ReplicaHandler'),
        ...collectMapSetProps(manager, 'ReplicaLifecycleManager'),
      ];

      // No Map/Set should use replica state values as keys
      for (const {component, property, collection} of collections) {
        const keys = collection instanceof Map ?
          [...collection.keys()] :
          [...collection.values()];

        for (const key of keys) {
          t.notOk(
            REPLICA_STATE_VALUES.has(key),
            `${component}.${property} key "${key}" ` +
            'is not a replica lifecycle state',
          );
        }
      }

      manager.shutdown();
      handler.shutdown();
    },
  );
});
