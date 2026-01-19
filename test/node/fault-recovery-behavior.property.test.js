/**
 * Property Test: Fault Recovery Behavior
 * **Property 17: Fault Recovery Behavior**
 * **Validates: Requirements 14.1, 14.2**
 *
 * *For any* node failure scenario, the system should detect the failure,
 * mark affected replicas as unavailable, and create replacement replicas
 * to maintain minimum counts.
 *
 * This property test verifies that:
 * 1. Node failures are detected via heartbeat timeout
 * 2. Affected replicas are marked as failed when a node fails
 * 3. Replacement replicas are created on healthy nodes
 * 4. Minimum replica counts are maintained after recovery
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  FailureDetector,
  NodeStatus as FDNodeStatus,
  ReplicaStatus as FDReplicaStatus,
} from '../../src/node/failure-detector.js';
import {
  ReplicaRecoveryService,
  NodeStatus as RRNodeStatus,
  ReplicaStatus as RRReplicaStatus,
  ServiceType,
} from '../../src/node/replica-recovery-service.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Create a mock CDC integration service for testing.
 * @return {Object} Mock CDC integration service.
 */
function createMockCDCService() {
  const operations = [];

  return {
    operations,
    async insertSystemTableRow(tableName, data) {
      operations.push({type: 'insert', tableName, data});
      return {success: true, operation: 'INSERT', tableName, data};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      operations.push({type: 'update', tableName, whereClause, data});
      return {success: true, operation: 'UPDATE', tableName, whereClause, data};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      operations.push({type: 'delete', tableName, whereClause});
      return {success: true, operation: 'DELETE', tableName, whereClause};
    },
    reset() {
      operations.length = 0;
    },
  };
}

/**
 * Create a mock system table cache for testing.
 * @param {Object} data - Initial cache data.
 * @return {Object} Mock system table cache.
 */
function createMockCache(data = {}) {
  const cache = {
    nodes: data.nodes || [],
    services: data.services || [],
    partitions: data.partitions || [],
    message_groups: data.message_groups || [],
  };

  return {
    getAll(tableName) {
      return cache[tableName] || [];
    },
    filter(tableName, predicate) {
      const items = cache[tableName] || [];
      return items.filter(predicate);
    },
    get(tableName, id) {
      const items = cache[tableName] || [];
      return items.find((item) =>
        item.id === id ||
        item.node_id === id ||
        item.partition_id === id ||
        item.group_id === id,
      );
    },
    setNodes(nodes) {
      cache.nodes = nodes;
    },
    setServices(services) {
      cache.services = services;
    },
    setPartitions(partitions) {
      cache.partitions = partitions;
    },
    setMessageGroups(groups) {
      cache.message_groups = groups;
    },
  };
}

test('Property 17: Fault Recovery Behavior', async (t) => {
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
   * Property: For any node with stale heartbeat, the failure detector
   * should mark it as suspected or failed based on threshold.
   */
  t.test('node failures are detected via heartbeat timeout', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 16000, max: 60000}), // Time since heartbeat (> 15s threshold)
        fc.uuid(),
        async (timeSinceHeartbeat, nodeId) => {
          const mockCDC = createMockCDCService();
          const now = Date.now();

          const mockCache = createMockCache({
            nodes: [
              {
                node_id: nodeId,
                status: FDNodeStatus.SUSPECTED, // Already suspected
                last_heartbeat: now - timeSinceHeartbeat,
              },
            ],
            services: [],
          });

          const detector = new FailureDetector({
            nodeId: 'test-node',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });
          detector.initialize();

          await detector.checkNodeHealth();

          // Should have marked node as failed
          const failedOps = mockCDC.operations.filter((op) =>
            op.type === 'update' &&
            op.tableName === SystemTableName.NODES &&
            op.data.status === FDNodeStatus.FAILED,
          );

          detector.shutdown();
          return failedOps.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('node failures are detected via heartbeat timeout');
  });

  /**
   * Property: For any failed node with replicas, all replicas on that
   * node should be marked as failed.
   */
  t.test('affected replicas are marked as failed when node fails', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({min: 1, max: 5}), // Number of replicas on failed node
        async (failedNodeId, replicaCount) => {
          const mockCDC = createMockCDCService();
          const now = Date.now();

          // Create replicas on the failed node
          const services = [];
          for (let i = 0; i < replicaCount; i++) {
            services.push({
              service_id: `service-${i}`,
              node_id: failedNodeId,
              service_type: ServiceType.PARTITION_REPLICA,
              partition_id: `partition-${i}`,
              status: FDReplicaStatus.ACTIVE,
            });
          }

          const mockCache = createMockCache({
            nodes: [
              {
                node_id: failedNodeId,
                status: FDNodeStatus.SUSPECTED,
                last_heartbeat: now - 20000, // Stale heartbeat
              },
            ],
            services,
          });

          const detector = new FailureDetector({
            nodeId: 'test-node',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });
          detector.initialize();

          await detector.checkNodeHealth();

          // Count replica failure updates
          const replicaFailedOps = mockCDC.operations.filter((op) =>
            op.type === 'update' &&
            op.tableName === SystemTableName.SERVICES &&
            op.data.status === FDReplicaStatus.FAILED,
          );

          detector.shutdown();

          // All replicas should be marked as failed
          return replicaFailedOps.length === replicaCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('affected replicas are marked as failed when node fails');
  });

  /**
   * Property: For any partition with fewer healthy replicas than minimum,
   * replacement replicas should be created on healthy nodes.
   */
  t.test('replacement replicas are created on healthy nodes', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 2}), // Current healthy replica count (< 3)
        fc.integer({min: 2, max: 4}), // Number of healthy nodes
        async (healthyReplicaCount, healthyNodeCount) => {
          const mockCDC = createMockCDCService();

          // Create healthy nodes
          const nodes = [];
          for (let i = 0; i < healthyNodeCount; i++) {
            nodes.push({
              node_id: `node-${i}`,
              status: RRNodeStatus.ACTIVE,
            });
          }

          // Create partition with insufficient replicas
          const partitions = [
            {partition_id: 'partition-1', table_id: 'table-1', replica_count: 3},
          ];

          // Create healthy replicas (fewer than minimum)
          const services = [];
          for (let i = 0; i < healthyReplicaCount; i++) {
            services.push({
              service_id: `service-${i}`,
              node_id: `node-${i}`,
              partition_id: 'partition-1',
              service_type: ServiceType.PARTITION_REPLICA,
              status: RRReplicaStatus.ACTIVE,
            });
          }

          const mockCache = createMockCache({
            nodes,
            services,
            partitions,
          });

          const recoveryService = new ReplicaRecoveryService({
            nodeId: 'test-node',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });
          recoveryService.initialize();

          await recoveryService.checkReplicaCounts();

          // Count replica creation operations
          const createOps = mockCDC.operations.filter((op) =>
            op.type === 'insert' &&
            op.tableName === SystemTableName.SERVICES &&
            op.data.service_type === ServiceType.PARTITION_REPLICA,
          );

          recoveryService.shutdown();

          // Should create enough replicas to reach minimum (3)
          const expectedCreations = 3 - healthyReplicaCount;
          return createOps.length === expectedCreations;
        },
      ),
      {numRuns: 10},
    );

    t.pass('replacement replicas are created on healthy nodes');
  });

  /**
   * Property: For any partition with sufficient healthy replicas,
   * no new replicas should be created.
   */
  t.test('no recovery when replica count is sufficient', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 3, max: 7}), // Healthy replica count (>= 3)
        async (healthyReplicaCount) => {
          const mockCDC = createMockCDCService();

          // Create healthy nodes
          const nodes = [];
          for (let i = 0; i < healthyReplicaCount; i++) {
            nodes.push({
              node_id: `node-${i}`,
              status: RRNodeStatus.ACTIVE,
            });
          }

          // Create partition with sufficient replicas
          const partitions = [
            {
              partition_id: 'partition-1',
              table_id: 'table-1',
              replica_count: healthyReplicaCount,
            },
          ];

          // Create healthy replicas
          const services = [];
          for (let i = 0; i < healthyReplicaCount; i++) {
            services.push({
              service_id: `service-${i}`,
              node_id: `node-${i}`,
              partition_id: 'partition-1',
              service_type: ServiceType.PARTITION_REPLICA,
              status: RRReplicaStatus.ACTIVE,
            });
          }

          const mockCache = createMockCache({
            nodes,
            services,
            partitions,
          });

          const recoveryService = new ReplicaRecoveryService({
            nodeId: 'test-node',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });
          recoveryService.initialize();

          await recoveryService.checkReplicaCounts();

          recoveryService.shutdown();

          // Should not create any new replicas
          return mockCDC.operations.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no recovery when replica count is sufficient');
  });

  /**
   * Property: For any healthy node, the failure detector should not
   * mark it as failed or suspected.
   */
  t.test('healthy nodes are not marked as failed', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({min: 1000, max: 5000}), // Recent heartbeat (< 10s)
        async (nodeId, timeSinceHeartbeat) => {
          const mockCDC = createMockCDCService();
          const now = Date.now();

          const mockCache = createMockCache({
            nodes: [
              {
                node_id: nodeId,
                status: FDNodeStatus.ACTIVE,
                last_heartbeat: now - timeSinceHeartbeat,
              },
            ],
          });

          const detector = new FailureDetector({
            nodeId: 'test-node',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });
          detector.initialize();

          await detector.checkNodeHealth();

          detector.shutdown();

          // Should not have any status updates for healthy node
          return mockCDC.operations.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('healthy nodes are not marked as failed');
  });

  /**
   * Property: For any message group with fewer healthy replicas than minimum,
   * replacement replicas should be created.
   */
  t.test('message group replicas are recovered', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 2}), // Current healthy replica count (< 3)
        async (healthyReplicaCount) => {
          const mockCDC = createMockCDCService();

          // Create healthy nodes
          const nodes = [];
          for (let i = 0; i < 3; i++) {
            nodes.push({
              node_id: `node-${i}`,
              status: RRNodeStatus.ACTIVE,
            });
          }

          // Create message group with insufficient replicas
          const messageGroups = [
            {group_id: 'group-1', replica_count: 3},
          ];

          // Create healthy replicas (fewer than minimum)
          const services = [];
          for (let i = 0; i < healthyReplicaCount; i++) {
            services.push({
              service_id: `service-${i}`,
              node_id: `node-${i}`,
              group_id: 'group-1',
              service_type: ServiceType.MESSAGE_GROUP_REPLICA,
              status: RRReplicaStatus.ACTIVE,
            });
          }

          const mockCache = createMockCache({
            nodes,
            services,
            partitions: [],
            message_groups: messageGroups,
          });

          const recoveryService = new ReplicaRecoveryService({
            nodeId: 'test-node',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });
          recoveryService.initialize();

          await recoveryService.checkReplicaCounts();

          // Count message group replica creation operations
          const createOps = mockCDC.operations.filter((op) =>
            op.type === 'insert' &&
            op.tableName === SystemTableName.SERVICES &&
            op.data.service_type === ServiceType.MESSAGE_GROUP_REPLICA,
          );

          recoveryService.shutdown();

          // Should create enough replicas to reach minimum (3)
          const expectedCreations = 3 - healthyReplicaCount;
          return createOps.length === expectedCreations;
        },
      ),
      {numRuns: 10},
    );

    t.pass('message group replicas are recovered');
  });
});
