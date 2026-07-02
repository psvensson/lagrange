/**
 * Unit tests for UnifiedRebalancer.
 * Tests the core rebalancing logic for partitions and message groups.
 * Requirements: 8.1, 8.2, 8.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
  ReplicaStatus,
  NodeStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  WORKFLOW_STEP,
} from '../../src/constants/index.js';

import {
  createMockCache,
  createMockCdcService,
  createMockCoordinator,
  createMockMessageRouter,
  createMockPolicyService,
  createMockReadinessService,
  createNodeEndpoint,
  createPostgresWireEndpoint,
  initializeTestEnvironment,
} from './unified-rebalancer-test-support.js';

// Initialize test environment
// Create a mock system table cache
// Create mock CDC integration service
// Create mock table policy service
// Create mock message router
// Create mock rebalance coordinator
// Create mock readiness service backed by the same cache
// Create a fully configured rebalancer for testing
function createTestRebalancer(options = {}) {
  const {
    entityId = 'partition-1',
    entityType = EntityType.PARTITION,
    nodeId = 'node-1',
    nodes = [],
    services = [],
    partitions = [],
    tables = [],
    replicaOperations = [],
    nodeEndpoints = [],
    serviceEndpoints = [],
    connectionState = 'connected',
    sqlQueryEngine = null,
    controlPlaneSystemTableGateway = null,
    cdcIntegrationService = null,
    messageRouter = null,
    rebalanceCoordinator = null,
    controlPlaneReadinessService = null,
    bootstrapReadinessState = null,
    nowFn = null,
    priorityRecoveryActivityStaleGraceMs = null,
  } = options;

  const mockCache = createMockCache(
    nodes,
    services,
    partitions,
    tables,
    replicaOperations,
    nodeEndpoints,
    serviceEndpoints,
  );
  const mockCdcService = cdcIntegrationService || createMockCdcService();
  const mockPolicyService = createMockPolicyService(
    partitions, tables,
  );
  const mockMessageRouter = messageRouter ||
    createMockMessageRouter(connectionState);
  const mockCoordinator = rebalanceCoordinator || createMockCoordinator();
  const mockSqlQueryEngine = sqlQueryEngine || {
    async executeQuery() {
      return {success: true, rows: []};
    },
  };
  const mockReadinessService = controlPlaneReadinessService ||
    createMockReadinessService(mockCache);

  return new UnifiedRebalancer({
    entityId,
    entityType,
    nodeId,
    systemTableCache: mockCache,
    cdcIntegrationService: mockCdcService,
    tablePolicyService: mockPolicyService,
    messageRouter: mockMessageRouter,
    rebalanceCoordinator: mockCoordinator,
    sqlQueryEngine: mockSqlQueryEngine,
    controlPlaneSystemTableGateway,
    controlPlaneReadinessService: mockReadinessService,
    bootstrapReadinessState,
    nowFn,
    priorityRecoveryActivityStaleGraceMs,
  });
}

test('UnifiedRebalancer - Rebalancing Triggers chunk 1', async (t) => {
  initializeTestEnvironment();
  await t.test(
    'checkRebalance ignores authoritative priority rows targeting nodes outside the current eligible cohort',
    async (t) => {
      let authoritativeEntityReadCalls = 0;
      const nodes = [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ];
      const nodeEndpoints = [
        createNodeEndpoint('node-1'),
        createNodeEndpoint('node-2'),
        createNodeEndpoint('node-3'),
      ];
      const serviceEndpoints = [
        createPostgresWireEndpoint('node-1'),
        createPostgresWireEndpoint('node-2'),
        createPostgresWireEndpoint('node-3'),
      ];
      const readinessService = {
        ...createMockReadinessService(createMockCache(
          nodes,
          [],
          [],
          [],
          [],
          nodeEndpoints,
          serviceEndpoints,
        )),
        async getMembershipPublicationPlanningSnapshot() {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-1', 'node-2'],
            projectedServingNodeIds: ['node-1', 'node-2'],
            locallyEligibleNodeIds: ['node-1', 'node-2'],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitions: [{
                partitionId: 'sql_write_operations-p1',
                spreadGap: 1,
              }],
              missingPartitionIds: ['sql_write_operations-p1'],
              requiredDistinctNodeCount: 3,
            },
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'sql_write_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes,
        partitions: [{
          partition_id: 'sql_write_operations-p1',
          table_id: 'sql_write_operations',
        }],
        nodeEndpoints,
        serviceEndpoints,
        replicaOperations: [{
          operation_id: 'op-cache-topology',
          type: 'ADD',
          partition_id: 'sql_write_operations-p1',
          entity_type: EntityType.PARTITION,
          entity_id: 'sql_write_operations-p1',
          source_node_id: 'node-1',
          target_node_id: 'node-3',
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
        }],
        controlPlaneReadinessService: readinessService,
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async getOperationsByEntity() {
            authoritativeEntityReadCalls += 1;
            return [{
              operation_id: 'op-authoritative-priority-mismatch',
              type: 'REPLACE',
              partition_id: 'sql_write_operations-p1',
              entity_type: EntityType.PARTITION,
              entity_id: 'sql_write_operations-p1',
              source_node_id: 'node-1',
              target_node_id: 'node-3',
              status: ReplicaStatus.PENDING,
              workflow_step: WORKFLOW_STEP.SENDING,
              steps_history: JSON.stringify([
                {step: 'PENDING', status: 'pending', inFlight: true},
                {step: 'SENDING', status: 'pending', inFlight: true},
              ]),
            }];
          },
        },
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.systemPartitionStartDelayMs = 0;
      rebalancer.userPartitionStartDelayMs = 0;
      rebalancer.rebalanceStartAtMs = Date.now() - 1;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
      rebalancer.scheduleNextCheck = () => {};

      let evaluateStateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateStateCalls += 1;
        return false;
      };

      await rebalancer.checkRebalance();

      t.equal(
        authoritativeEntityReadCalls,
        1,
        'topology blocker revalidation should still consult authoritative entity operations',
      );
      t.equal(
        evaluateStateCalls,
        1,
        'priority operations outside the current eligible cohort should not keep topology-settling closed',
      );
    },
  );

  await t.test(
    'checkRebalance ignores cache-in-flight priority ACTIVE replace rows that satisfy ' +
      'spread on the eligible target',
    async (t) => {
      const nodes = [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ];
      const nodeEndpoints = [
        createNodeEndpoint('node-1'),
        createNodeEndpoint('node-2'),
        createNodeEndpoint('node-3'),
      ];
      const serviceEndpoints = [
        createPostgresWireEndpoint('node-1'),
        createPostgresWireEndpoint('node-2'),
        createPostgresWireEndpoint('node-3'),
      ];
      const readinessService = {
        ...createMockReadinessService(createMockCache(
          nodes,
          [],
          [],
          [],
          [],
          nodeEndpoints,
          serviceEndpoints,
        )),
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
            locallyEligibleNodeIds: ['node-1', 'node-2'],
            priorityPartitionSummary: {
              blockedPartitions: [{
                partitionId: 'control_plane_publications-p1',
                requiredDistinctNodeCount: 3,
                readyDistinctNodeCount: 2,
                spreadGap: 1,
              }],
              missingPartitionIds: ['control_plane_publications-p1'],
              requiredDistinctNodeCount: 3,
            },
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes,
        partitions: [{
          partition_id: 'control_plane_publications-p1',
          table_id: 'control_plane_publications',
        }],
        nodeEndpoints,
        serviceEndpoints,
        replicaOperations: [{
          operation_id: 'op-cache-replace-active',
          type: 'REPLACE',
          partition_id: 'control_plane_publications-p1',
          entity_type: EntityType.PARTITION,
          entity_id: 'control_plane_publications-p1',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          status: ReplicaStatus.ACTIVE,
          workflow_step: WORKFLOW_STEP.ACTIVE,
        }],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.systemPartitionStartDelayMs = 0;
      rebalancer.userPartitionStartDelayMs = 0;
      rebalancer.rebalanceStartAtMs = Date.now() - 1;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
      rebalancer.scheduleNextCheck = () => {};

      let evaluateStateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateStateCalls += 1;
        return false;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateStateCalls,
        1,
        'in-flight priority ACTIVE replace rows on eligible targets should not block topology settling in cache',
      );
    },
  );

  await t.test(
    'checkRebalance ignores combined cache-in-flight priority ACTIVE replace rows ' +
      'that satisfy spread for one partition',
    async (t) => {
      const nodes = [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ];
      const nodeEndpoints = [
        createNodeEndpoint('node-1'),
        createNodeEndpoint('node-2'),
        createNodeEndpoint('node-3'),
      ];
      const serviceEndpoints = [
        createPostgresWireEndpoint('node-1'),
        createPostgresWireEndpoint('node-2'),
        createPostgresWireEndpoint('node-3'),
      ];
      const readinessService = {
        ...createMockReadinessService(createMockCache(
          nodes,
          [],
          [],
          [],
          [],
          nodeEndpoints,
          serviceEndpoints,
        )),
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
            locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
            priorityPartitionSummary: {
              blockedPartitions: [{
                partitionId: 'sql_transaction_participants-p1',
                requiredDistinctNodeCount: 3,
                readyDistinctNodeCount: 1,
                spreadGap: 2,
              }],
              missingPartitionIds: ['sql_transaction_participants-p1'],
              requiredDistinctNodeCount: 3,
            },
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'sql_transaction_participants-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes,
        partitions: [{
          partition_id: 'sql_transaction_participants-p1',
          table_id: 'sql_transaction_participants',
        }],
        nodeEndpoints,
        serviceEndpoints,
        replicaOperations: [{
          operation_id: 'op-cache-replace-active-1',
          type: 'REPLACE',
          partition_id: 'sql_transaction_participants-p1',
          entity_type: EntityType.PARTITION,
          entity_id: 'sql_transaction_participants-p1',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          status: ReplicaStatus.ACTIVE,
          workflow_step: WORKFLOW_STEP.ACTIVE,
        }, {
          operation_id: 'op-cache-replace-active-2',
          type: 'REPLACE',
          partition_id: 'sql_transaction_participants-p1',
          entity_type: EntityType.PARTITION,
          entity_id: 'sql_transaction_participants-p1',
          source_node_id: 'node-1',
          target_node_id: 'node-3',
          status: ReplicaStatus.ACTIVE,
          workflow_step: WORKFLOW_STEP.ACTIVE,
        }],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.systemPartitionStartDelayMs = 0;
      rebalancer.userPartitionStartDelayMs = 0;
      rebalancer.rebalanceStartAtMs = Date.now() - 1;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
      rebalancer.scheduleNextCheck = () => {};

      let evaluateStateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateStateCalls += 1;
        return false;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateStateCalls,
        1,
        'combined ACTIVE replace rows on eligible targets should not block topology settling once the partition is spread-satisfied in flight',
      );
    },
  );

  await t.test(
    'checkRebalance keeps cache-in-flight priority replace rows blocking when ' +
      'they still do not satisfy spread',
    async (t) => {
      const nodes = [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ];
      const nodeEndpoints = [
        createNodeEndpoint('node-1'),
        createNodeEndpoint('node-2'),
        createNodeEndpoint('node-3'),
      ];
      const serviceEndpoints = [
        createPostgresWireEndpoint('node-1'),
        createPostgresWireEndpoint('node-2'),
        createPostgresWireEndpoint('node-3'),
      ];
      const readinessService = {
        ...createMockReadinessService(createMockCache(
          nodes,
          [],
          [],
          [],
          [],
          nodeEndpoints,
          serviceEndpoints,
        )),
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
            locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
            priorityPartitionSummary: {
              blockedPartitions: [{
                partitionId: 'control_plane_publications-p1',
                requiredDistinctNodeCount: 3,
                readyDistinctNodeCount: 1,
                spreadGap: 2,
              }],
              missingPartitionIds: ['control_plane_publications-p1'],
              requiredDistinctNodeCount: 3,
            },
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes,
        partitions: [{
          partition_id: 'control_plane_publications-p1',
          table_id: 'control_plane_publications',
        }],
        nodeEndpoints,
        serviceEndpoints,
        replicaOperations: [{
          operation_id: 'op-cache-replace-creating',
          type: 'REPLACE',
          partition_id: 'control_plane_publications-p1',
          entity_type: EntityType.PARTITION,
          entity_id: 'control_plane_publications-p1',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
        }],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.systemPartitionStartDelayMs = 0;
      rebalancer.userPartitionStartDelayMs = 0;
      rebalancer.rebalanceStartAtMs = Date.now() - 1;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
      rebalancer.scheduleNextCheck = () => {};

      let evaluateStateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateStateCalls += 1;
        return false;
      };
      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateStateCalls,
        0,
        'in-flight priority replace rows outside the active spread completion invariant should keep topology-settling closed',
      );
      t.equal(
        scheduledDelayMs,
        rebalancer.criticalCheckDelayMs,
        'topology-settling blocker should defer on the priority check cadence',
      );
    },
  );

  await t.test(
    'checkRebalance does not wait behind the global priority blocker when the ' +
      'current priority partition is itself blocked',
    async (t) => {
      const nodes = [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ];
      const nodeEndpoints = [
        createNodeEndpoint('node-1'),
        createNodeEndpoint('node-2'),
        createNodeEndpoint('node-3'),
      ];
      const serviceEndpoints = [
        createPostgresWireEndpoint('node-1'),
        createPostgresWireEndpoint('node-2'),
        createPostgresWireEndpoint('node-3'),
      ];
      const readinessService = {
        ...createMockReadinessService(createMockCache(
          nodes,
          [],
          [],
          [],
          [],
          nodeEndpoints,
          serviceEndpoints,
        )),
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
            locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
            priorityPartitionSummary: {
              blockedPartitions: [{
                partitionId: 'control_plane_publications-p1',
                requiredDistinctNodeCount: 3,
                readyDistinctNodeCount: 2,
                spreadGap: 1,
              }, {
                partitionId: 'replica_operations-p1',
                requiredDistinctNodeCount: 3,
                readyDistinctNodeCount: 2,
                spreadGap: 1,
              }],
              missingPartitionIds: [
                'control_plane_publications-p1',
                'replica_operations-p1',
              ],
              requiredDistinctNodeCount: 3,
            },
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes,
        partitions: [{
          partition_id: 'control_plane_publications-p1',
          table_id: 'control_plane_publications',
        }],
        nodeEndpoints,
        serviceEndpoints,
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.systemPartitionStartDelayMs = 0;
      rebalancer.userPartitionStartDelayMs = 0;
      rebalancer.rebalanceStartAtMs = Date.now() - 1;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      let evaluateStateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateStateCalls += 1;
        return false;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateStateCalls,
        1,
        'a blocked priority partition should keep evaluating repair work instead of waiting behind the global priority blocker',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'self-repair should not immediately reschedule on the global priority wait gate',
      );
    },
  );
});
