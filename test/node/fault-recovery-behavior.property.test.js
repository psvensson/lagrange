/**
 * Property Test: Recovery State Handling
 * **Property 7: Recovery State Handling**
 * **Validates: Requirements 4.3, 4.4**
 *
 * *For any* replica found in a transitional state (`creating`, `syncing`,
 * `removing`) after node recovery, the state machine SHALL transition it
 * appropriately:
 * - `creating`/`syncing` → `failed`
 * - `removing` → `removed`
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaStateMachine,
  ReplicaState,
} from '../../src/node/replica-state-machine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Create a mock system table cache.
 * @param {string} nodeId - Node ID to filter services.
 * @param {Array} services - Services to include in cache.
 * @return {Object} Mock cache.
 */
function createMockCache(nodeId, services = []) {
  return {
    filter(tableName, predicate) {
      if (tableName === 'services') {
        return services.filter(predicate);
      }
      return [];
    },
    get(tableName, id) {
      if (tableName === 'services') {
        return services.find((s) => s.service_id === id);
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === 'services') {
        return services;
      }
      return [];
    },
  };
}

function createMockCDCService() {
  return {
    updateSystemTableRow: async () => ({success: true}),
  };
}

test('Property 7: Recovery State Handling', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  /**
   * Property: For any 'creating' replica on recovery, it is transitioned to
   * 'failed'.
   */
  t.test('creating replicas transition to failed on recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';

          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: 'creating',
            },
          ];

          const mockCache = createMockCache(nodeId, services);

          const stateMachine = new ReplicaStateMachine({
            nodeId,
            cdcIntegrationService: createMockCDCService(),
          });

          const result = await stateMachine.handleNodeRecovery({
            systemTableCache: mockCache,
            nodeId,
          });

          // Check that replica was transitioned to failed
          const replicaState = stateMachine.getState(serviceId);

          stateMachine.clear();

          return result.creatingToFailed === 1 &&
            replicaState !== null &&
            replicaState.state === ReplicaState.FAILED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('creating replicas transition to failed on recovery');
  });

  /**
   * Property: For any 'syncing' replica on recovery, it is transitioned to
   * 'failed'.
   */
  t.test('syncing replicas transition to failed on recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';

          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: 'syncing',
            },
          ];

          const mockCache = createMockCache(nodeId, services);

          const stateMachine = new ReplicaStateMachine({
            nodeId,
            cdcIntegrationService: createMockCDCService(),
          });

          const result = await stateMachine.handleNodeRecovery({
            systemTableCache: mockCache,
            nodeId,
          });

          // Check that replica was transitioned to failed
          const replicaState = stateMachine.getState(serviceId);

          stateMachine.clear();

          return result.syncingToFailed === 1 &&
            replicaState !== null &&
            replicaState.state === ReplicaState.FAILED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('syncing replicas transition to failed on recovery');
  });

  /**
   * Property: For any 'removing' replica on recovery, it is transitioned to
   * 'removed'.
   */
  t.test('removing replicas transition to removed on recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';

          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: 'removing',
            },
          ];

          const mockCache = createMockCache(nodeId, services);

          const stateMachine = new ReplicaStateMachine({
            nodeId,
            cdcIntegrationService: createMockCDCService(),
          });

          const result = await stateMachine.handleNodeRecovery({
            systemTableCache: mockCache,
            nodeId,
          });

          // Check that replica was transitioned to removed
          const replicaState = stateMachine.getState(serviceId);

          stateMachine.clear();

          return result.removingToRemoved === 1 &&
            replicaState !== null &&
            replicaState.state === ReplicaState.REMOVED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('removing replicas transition to removed on recovery');
  });

  /**
   * Property: For any mix of transitional replicas, all are handled correctly.
   */
  t.test('mixed transitional replicas are all handled', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 0, max: 3}), // creating count
        fc.integer({min: 0, max: 3}), // syncing count
        fc.integer({min: 0, max: 3}), // removing count
        async (creatingCount, syncingCount, removingCount) => {
          const nodeId = 'test-node';

          const services = [];

          // Add creating replicas
          for (let i = 0; i < creatingCount; i++) {
            services.push({
              service_id: `creating-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: `partition-creating-${i}`,
              status: 'creating',
            });
          }

          // Add syncing replicas
          for (let i = 0; i < syncingCount; i++) {
            services.push({
              service_id: `syncing-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: `partition-syncing-${i}`,
              status: 'syncing',
            });
          }

          // Add removing replicas
          for (let i = 0; i < removingCount; i++) {
            services.push({
              service_id: `removing-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: `partition-removing-${i}`,
              status: 'removing',
            });
          }

          const mockCache = createMockCache(nodeId, services);

          const stateMachine = new ReplicaStateMachine({
            nodeId,
            cdcIntegrationService: createMockCDCService(),
          });

          const result = await stateMachine.handleNodeRecovery({
            systemTableCache: mockCache,
            nodeId,
          });

          stateMachine.clear();

          return result.creatingToFailed === creatingCount &&
            result.syncingToFailed === syncingCount &&
            result.removingToRemoved === removingCount &&
            result.total === creatingCount + syncingCount + removingCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('mixed transitional replicas are all handled');
  });

  /**
   * Property: Active replicas are not affected by recovery.
   */
  t.test('active replicas are not affected by recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';

          // Active replica should not be processed
          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: 'active',
            },
          ];

          const mockCache = createMockCache(nodeId, services);

          const stateMachine = new ReplicaStateMachine({
            nodeId,
            cdcIntegrationService: createMockCDCService(),
          });

          const result = await stateMachine.handleNodeRecovery({
            systemTableCache: mockCache,
            nodeId,
          });

          stateMachine.clear();

          // No replicas should be processed
          return result.total === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('active replicas are not affected by recovery');
  });

  /**
   * Property: Replicas on other nodes are not affected by recovery.
   */
  t.test('replicas on other nodes are not affected', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';
          const otherNodeId = 'other-node';

          // Replica on different node in transitional state
          const services = [
            {
              service_id: serviceId,
              node_id: otherNodeId, // Different node
              service_type: 'partition',
              partition_id: partitionId,
              status: 'creating',
            },
          ];

          const mockCache = createMockCache(nodeId, services);

          const stateMachine = new ReplicaStateMachine({
            nodeId,
            cdcIntegrationService: createMockCDCService(),
          });

          const result = await stateMachine.handleNodeRecovery({
            systemTableCache: mockCache,
            nodeId,
          });

          stateMachine.clear();

          // No replicas should be processed (different node)
          return result.total === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('replicas on other nodes are not affected');
  });

  /**
   * Property: Recovery emits recoveryComplete event with correct counts.
   */
  t.test('recoveryComplete event is emitted with correct counts', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 0, max: 3}), // creating count
        fc.integer({min: 0, max: 3}), // syncing count
        fc.integer({min: 0, max: 3}), // removing count
        async (creatingCount, syncingCount, removingCount) => {
          const nodeId = 'test-node';

          const services = [];

          for (let i = 0; i < creatingCount; i++) {
            services.push({
              service_id: `creating-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: `partition-creating-${i}`,
              status: 'creating',
            });
          }

          for (let i = 0; i < syncingCount; i++) {
            services.push({
              service_id: `syncing-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: `partition-syncing-${i}`,
              status: 'syncing',
            });
          }

          for (let i = 0; i < removingCount; i++) {
            services.push({
              service_id: `removing-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: `partition-removing-${i}`,
              status: 'removing',
            });
          }

          const mockCache = createMockCache(nodeId, services);

          const stateMachine = new ReplicaStateMachine({
            nodeId,
            cdcIntegrationService: createMockCDCService(),
          });

          let emittedEvent = null;
          stateMachine.on('recoveryComplete', (event) => {
            emittedEvent = event;
          });

          await stateMachine.handleNodeRecovery({
            systemTableCache: mockCache,
            nodeId,
          });

          stateMachine.clear();

          return emittedEvent !== null &&
            emittedEvent.nodeId === nodeId &&
            emittedEvent.creatingToFailed === creatingCount &&
            emittedEvent.syncingToFailed === syncingCount &&
            emittedEvent.removingToRemoved === removingCount &&
            emittedEvent.total === creatingCount + syncingCount + removingCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('recoveryComplete event is emitted with correct counts');
  });

  /**
   * Property: Recovery handles empty cache gracefully.
   */
  t.test('recovery handles empty cache gracefully', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // nodeId
        async (nodeId) => {
          const services = [];
          const mockCache = createMockCache(nodeId, services);

          const stateMachine = new ReplicaStateMachine({
            nodeId,
            cdcIntegrationService: createMockCDCService(),
          });

          const result = await stateMachine.handleNodeRecovery({
            systemTableCache: mockCache,
            nodeId,
          });

          stateMachine.clear();

          return result.total === 0 &&
            result.creatingToFailed === 0 &&
            result.syncingToFailed === 0 &&
            result.removingToRemoved === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('recovery handles empty cache gracefully');
  });

  /**
   * Property: Recovery requires system table cache.
   */
  t.test('recovery requires system table cache', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // nodeId
        async (nodeId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId,
            cdcIntegrationService: createMockCDCService(),
          });

          let threw = false;
          try {
            await stateMachine.handleNodeRecovery({nodeId});
          } catch (_error) {
            threw = true;
          }

          stateMachine.clear();

          return threw;
        },
      ),
      {numRuns: 10},
    );

    t.pass('recovery requires system table cache');
  });
});
