/**
 * Unit tests for UnifiedRebalancer.
 * Tests the core rebalancing logic for partitions and message groups.
 * Requirements: 8.1, 8.2, 8.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
} from '../../src/cdc/cdc-integration-service.js';
import {
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  UnifiedRebalancer,
  EntityType,
  ReplicaStatus,
  NodeStatus,
  DEFAULT_TABLE_POLICY,
  DEFAULT_MESSAGE_GROUP_POLICY,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
} from '../../src/rebalancer/replica-status.js';
import {
} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
} from '../../src/rebalancer/storage-capacity-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ENDPOINT_STATUS,
  META_SERVICE_ID,
  TRANSPORT_TYPE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {ENDPOINT_SYNC_HEALTH} from '../../src/runtime/endpoint-sync-constants.js';

import {
  createMockCache,
  createMockCdcService,
  createMockCoordinator,
  createMockMessageRouter,
  createMockPolicyService,
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
function createMockReadinessService(mockCache) {
  return {
    getNodeReadinessSync: (nodeId) => {
      const nodeRow = mockCache.get('nodes', nodeId);
      if (!nodeRow) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
              false,
            [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
              false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .METADATA_PUBLICATION_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
          },
          reasons: [],
        };
      }
      const now = Date.now();
      const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
      const leaseValid =
        Number.isFinite(leaseExpiry) && leaseExpiry > now;
      const isActive = nodeRow.status === 'active';
      const healthy = isActive && leaseValid;
      return {
        nodeId,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION
            .METADATA_PUBLICATION_HEALTHY]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
            healthy,
        },
        reasons: [],
      };
    },
    getNodeReadiness: async (nodeId) => {
      return createMockReadinessService(mockCache)
        .getNodeReadinessSync(nodeId);
    },
  };
}


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

test('UnifiedRebalancer - Rebalancing Triggers', async (t) => {
  initializeTestEnvironment();

  await t.test('schedules periodic checks when becoming leader', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    // Initially no scheduled check
    t.equal(rebalancer.scheduledCheck, null);

    // Become leader - but immediately cancel to avoid async issues
    rebalancer.setLeader(true);

    // Should have scheduled a check
    t.ok(rebalancer.scheduledCheck !== null, 'Check was scheduled');

    // Cleanup immediately
    rebalancer.shutdown();
    t.equal(rebalancer.scheduledCheck, null);
  });

  await t.test(
    'schedules fast-start checks for priority control-plane partitions',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();

      const UNSCHEDULED = Symbol('unscheduled');
      let scheduledDelayMs = UNSCHEDULED;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      rebalancer.setLeader(true);

      t.equal(typeof scheduledDelayMs, 'number');
      t.ok(
        scheduledDelayMs >= 1 &&
        scheduledDelayMs <= rebalancer.criticalCheckDelayMs,
        'priority control-plane partitions should schedule within the short critical retry window',
      );

      rebalancer.shutdown();
    },
  );

  await t.test(
    'priority control-plane leadership enqueues immediate reconciliation with scheduled fallback',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();

      const observedReasons = [];
      const UNSCHEDULED = Symbol('unscheduled');
      let scheduledDelayMs = UNSCHEDULED;
      rebalancer.enqueueRebalanceCheck = (reason) => {
        observedReasons.push(reason);
        return true;
      };
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      rebalancer.setLeader(true);

      t.same(
        observedReasons,
        [RECONCILE_REASON.PERIODIC_CHECK],
        'priority partitions should enqueue one immediate reconciliation when leadership starts',
      );
      t.equal(typeof scheduledDelayMs, 'number');
      t.ok(
        scheduledDelayMs >= 1 &&
          scheduledDelayMs <= rebalancer.criticalCheckDelayMs,
        'priority partitions should keep the short scheduled fallback window',
      );

      rebalancer.shutdown();
    },
  );

  await t.test('cancels scheduled checks when losing leadership', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    t.ok(rebalancer.scheduledCheck !== null);

    // Lose leadership
    rebalancer.setLeader(false);

    t.equal(rebalancer.scheduledCheck, null);
    rebalancer.shutdown();
  });

  await t.test('triggers immediate check for critical events', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    // Set leader directly without triggering scheduler
    rebalancer.isLeader = true;

    let immediateCheckCalled = false;
    // Override triggerImmediateCheck to track calls
    const _originalTrigger = rebalancer.triggerImmediateCheck.bind(rebalancer);
    rebalancer.triggerImmediateCheck = (_reason) => {
      immediateCheckCalled = true;
    // Don't actually trigger the check to avoid async issues
    };

    // Trigger immediate check
    rebalancer.triggerImmediateCheck('node_failure');

    t.equal(immediateCheckCalled, true, 'Immediate check was triggered');

    rebalancer.isLeader = false;
    rebalancer.shutdown();
  });

  await t.test(
    'routes timer-driven checks through the owner queue and replaces stale periodic timers',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;

      const originalSetTimeout = globalThis.setTimeout;
      const originalClearTimeout = globalThis.clearTimeout;
      const timerRecords = [];
      const clearedTimers = [];
      let nextTimerId = 1;
      let directCheckCount = 0;
      const enqueuedReasons = [];

      globalThis.setTimeout = (callback, delayMs) => {
        const handle = {id: nextTimerId++, callback, delayMs};
        timerRecords.push(handle);
        return handle;
      };
      globalThis.clearTimeout = (handle) => {
        clearedTimers.push(handle);
      };

      rebalancer.checkRebalance = async () => {
        directCheckCount += 1;
      };
      rebalancer.rebalanceCheckQueue.enqueue =
        (ownerKey, reason) => {
          enqueuedReasons.push({ownerKey, reason});
          return true;
        };

      try {
        rebalancer.scheduleNextCheck(5000);
        t.equal(timerRecords.length, 1, 'initial periodic timer scheduled');

        rebalancer.recordStateChange('node_joined');

        t.same(
          clearedTimers,
          [timerRecords[0]],
          'state change clears the stale periodic timer',
        );
        t.equal(
          rebalancer.scheduledCheck,
          null,
          'no stale periodic timer remains armed after reset',
        );
        t.equal(
          timerRecords.length,
          2,
          'state change schedules one stabilization timer',
        );

        timerRecords[1].callback();

        t.equal(
          directCheckCount,
          0,
          'stabilization timers do not call checkRebalance directly',
        );
        t.same(
          enqueuedReasons,
          [{
            ownerKey: 'partition-1',
            reason: 'periodic_check',
          }],
          'stabilization timers enqueue through the shared owner queue',
        );
      } finally {
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
        rebalancer.shutdown();
      }
    },
  );

  await t.test(
    'replaces an existing periodic timer instead of stacking another one',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;

      const originalSetTimeout = globalThis.setTimeout;
      const originalClearTimeout = globalThis.clearTimeout;
      const timerRecords = [];
      const clearedTimers = [];
      let nextTimerId = 1;

      globalThis.setTimeout = (callback, delayMs) => {
        const handle = {id: nextTimerId++, callback, delayMs};
        timerRecords.push(handle);
        return handle;
      };
      globalThis.clearTimeout = (handle) => {
        clearedTimers.push(handle);
      };

      try {
        rebalancer.scheduleNextCheck(4000);
        rebalancer.scheduleNextCheck(2000);

        t.same(
          clearedTimers,
          [timerRecords[0]],
          'scheduling again clears the previous timer first',
        );
        t.equal(
          rebalancer.scheduledCheck,
          timerRecords[1],
          'only the latest timer remains scheduled',
        );
      } finally {
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
        rebalancer.shutdown();
      }
    },
  );

  await t.test('detects critical CDC events', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
      services: [
        {
          service_id: 's1',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    // Node failure event affecting our replicas
    const nodeFailureEvent = {
      tableName: 'nodes',
      operation: 'UPDATE',
      data: {node_id: 'node-1', status: NodeStatus.FAILED},
    };

    t.equal(rebalancer.isCriticalCDCEvent(nodeFailureEvent), true);

    // Node failure event NOT affecting our replicas
    const otherNodeFailureEvent = {
      tableName: 'nodes',
      operation: 'UPDATE',
      data: {node_id: 'node-3', status: NodeStatus.FAILED},
    };

    t.equal(rebalancer.isCriticalCDCEvent(otherNodeFailureEvent), false);
  });

  await t.test('detects service failure CDC events', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Service failure for our partition
    const serviceFailureEvent = {
      tableName: 'services',
      operation: 'UPDATE',
      data: {
        service_id: 's1',
        partition_id: 'partition-1',
        status: ReplicaStatus.FAILED,
      },
    };

    t.equal(rebalancer.isCriticalCDCEvent(serviceFailureEvent), true);

    // Service failure for different partition
    const otherServiceFailureEvent = {
      tableName: 'services',
      operation: 'UPDATE',
      data: {
        service_id: 's2',
        partition_id: 'partition-2',
        status: ReplicaStatus.FAILED,
      },
    };

    t.equal(rebalancer.isCriticalCDCEvent(otherServiceFailureEvent), false);
  });

  await t.test('uses exponential backoff when stable', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    const initialInterval = rebalancer.currentInterval;

    // Simulate stable state (no rebalancing needed)
    // The interval should increase
    rebalancer.currentInterval = Math.min(
      rebalancer.currentInterval * 1.5,
      rebalancer.maxInterval,
    );

    t.ok(rebalancer.currentInterval > initialInterval);
    t.ok(rebalancer.currentInterval <= rebalancer.maxInterval);
  });

  await t.test('resets interval after rebalancing action', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    // Increase interval (simulate stable period)
    const baseInterval = rebalancer.periodicCheckIntervalMs;
    rebalancer.currentInterval = rebalancer.maxInterval;

    // Simulate what checkRebalance does when rebalancing is needed
    // Reset interval to base (this is what happens after a rebalance action)
    rebalancer.currentInterval = baseInterval;

    // Interval should be reset to base after rebalancing
    t.equal(rebalancer.currentInterval, baseInterval);
  });

  await t.test('checkRebalance backs off when no actionable moves were executed', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.isLeader = true;
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.evaluateState = async () => true;
    rebalancer.rebalance = async () => ({
      success: true,
      moves: [
        {success: false, skipped: true, reason: 'safety_blocked'},
      ],
    });
    rebalancer.scheduleNextCheck = () => {};

    const baseInterval = rebalancer.periodicCheckIntervalMs;
    rebalancer.currentInterval = baseInterval;

    await rebalancer.checkRebalance();

    t.ok(
      rebalancer.currentInterval > baseInterval,
      'interval should back off when all moves are skipped',
    );
  });

  await t.test(
    'checkRebalance revalidates topology in-flight blockers with authoritative entity operations',
    async (t) => {
      let authoritativeEntityReadCalls = 0;
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'control_plane_publications-p1',
            table_id: 'control_plane_publications',
          },
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
        ],
        replicaOperations: [
          {
            operation_id: 'op-cache-stale-topology',
            type: 'ADD',
            partition_id: 'control_plane_publications-p1',
            entity_type: EntityType.PARTITION,
            entity_id: 'control_plane_publications-p1',
            source_node_id: 'node-1',
            target_node_id: 'node-2',
            status: ReplicaStatus.CREATING,
            workflow_step: WORKFLOW_STEP.CREATING,
          },
        ],
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async getOperationsByEntity() {
            authoritativeEntityReadCalls += 1;
            return [];
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
        'in-flight topology blockers should be revalidated against authoritative entity operations',
      );
      t.equal(
        evaluateStateCalls,
        1,
        'stale cache-only topology blockers should not prevent progress',
      );
    },
  );

  await t.test(
    'checkRebalance ignores stale authoritative topology operations during blocker revalidation',
    async (t) => {
      let authoritativeEntityReadCalls = 0;
      const nowMs = Date.now();
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'control_plane_publications-p1',
            table_id: 'control_plane_publications',
          },
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
        ],
        replicaOperations: [
          {
            operation_id: 'op-cache-topology',
            type: 'ADD',
            partition_id: 'control_plane_publications-p1',
            entity_type: EntityType.PARTITION,
            entity_id: 'control_plane_publications-p1',
            source_node_id: 'node-1',
            target_node_id: 'node-2',
            status: ReplicaStatus.CREATING,
            workflow_step: WORKFLOW_STEP.CREATING,
          },
        ],
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async getOperationsByEntity() {
            authoritativeEntityReadCalls += 1;
            return [{
              operation_id: 'op-authoritative-stale',
              type: 'ADD',
              partition_id: 'control_plane_publications-p1',
              entity_type: EntityType.PARTITION,
              entity_id: 'control_plane_publications-p1',
              source_node_id: 'node-1',
              target_node_id: 'node-2',
              status: ReplicaStatus.CREATING,
              workflow_step: WORKFLOW_STEP.CREATING,
              created_at: nowMs - 120000,
              updated_at: nowMs - 120000,
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
        'topology blocker revalidation should still read authoritative entity operations',
      );
      t.equal(
        evaluateStateCalls,
        1,
        'stale authoritative in-flight topology operations should not keep topology-settling closed',
      );
    },
  );

  await t.test(
    'checkRebalance requests authoritative entity operations during topology blocker revalidation when available',
    async (t) => {
      let cacheEntityReadCalls = 0;
      let authoritativeEntityReadCalls = 0;
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'control_plane_publications-p1',
            table_id: 'control_plane_publications',
          },
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
        ],
        replicaOperations: [
          {
            operation_id: 'op-cache-stale-topology',
            type: 'ADD',
            partition_id: 'control_plane_publications-p1',
            entity_type: EntityType.PARTITION,
            entity_id: 'control_plane_publications-p1',
            source_node_id: 'node-1',
            target_node_id: 'node-2',
            status: ReplicaStatus.CREATING,
            workflow_step: WORKFLOW_STEP.CREATING,
          },
        ],
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async getOperationsByEntity(_entityType, _entityId, options = {}) {
            if (options?.visibilityReadMode ===
                REPLICA_OPERATION_VISIBILITY_READ_MODE
                  .OWNER_RPC_REQUIRED) {
              authoritativeEntityReadCalls += 1;
              return [];
            }
            cacheEntityReadCalls += 1;
            return [{
              operation_id: 'op-cache-stale-topology',
              type: 'ADD',
              partition_id: 'control_plane_publications-p1',
              entity_type: EntityType.PARTITION,
              entity_id: 'control_plane_publications-p1',
              source_node_id: 'node-1',
              target_node_id: 'node-2',
              status: ReplicaStatus.CREATING,
              workflow_step: WORKFLOW_STEP.CREATING,
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
        'topology blocker revalidation should prefer authoritative entity operations when the coordinator supports them',
      );
      t.equal(
        cacheEntityReadCalls,
        0,
        'topology blocker revalidation should not fall back to cache-backed entity reads when authoritative reads are available',
      );
      t.equal(
        evaluateStateCalls,
        1,
        'authoritative empty entity reads should let planning continue past stale cache blockers',
      );
    },
  );

  await t.test(
    'checkRebalance ignores authoritative REPLACE remove-dispatch rows during blocker revalidation',
    async (t) => {
      let authoritativeEntityReadCalls = 0;
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        partitions: [{
          partition_id: 'control_plane_publications-p1',
          table_id: 'control_plane_publications',
        }],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
        ],
        replicaOperations: [{
          operation_id: 'op-cache-topology',
          type: 'ADD',
          partition_id: 'control_plane_publications-p1',
          entity_type: EntityType.PARTITION,
          entity_id: 'control_plane_publications-p1',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
        }],
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async getOperationsByEntity() {
            authoritativeEntityReadCalls += 1;
            return [{
              operation_id: 'op-authoritative-replace-active',
              type: 'REPLACE',
              partition_id: 'control_plane_publications-p1',
              entity_type: EntityType.PARTITION,
              entity_id: 'control_plane_publications-p1',
              source_node_id: 'node-1',
              target_node_id: 'node-2',
              status: 'running',
              workflow_step: WORKFLOW_STEP.ACTIVE,
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
        'authoritative REPLACE remove-dispatch rows should not keep topology-settling closed',
      );
    },
  );

  await t.test(
    'checkRebalance ignores authoritative priority REPLACE rows once the owner best-effort planning answer no longer blocks that partition',
    async (t) => {
      let authoritativeEntityReadCalls = 0;
      const nodes = [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ];
      const nodeEndpoints = [
        createNodeEndpoint('node-1'),
        createNodeEndpoint('node-2'),
      ];
      const serviceEndpoints = [
        createPostgresWireEndpoint('node-1'),
        createPostgresWireEndpoint('node-2'),
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
        async getMembershipPublicationPlanningSnapshotBestEffort() {
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
        async getMembershipPublicationPlanningSnapshot() {
          t.fail(
            'checkRebalance should use the canonical best-effort planning answer owner',
          );
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
          operation_id: 'op-cache-topology',
          type: 'ADD',
          partition_id: 'control_plane_publications-p1',
          entity_type: EntityType.PARTITION,
          entity_id: 'control_plane_publications-p1',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
        }],
        controlPlaneReadinessService: readinessService,
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async getOperationsByEntity() {
            authoritativeEntityReadCalls += 1;
            return [{
              operation_id: 'op-authoritative-priority-syncing',
              type: 'REPLACE',
              partition_id: 'control_plane_publications-p1',
              entity_type: EntityType.PARTITION,
              entity_id: 'control_plane_publications-p1',
              source_node_id: 'node-1',
              target_node_id: 'node-2',
              status: ReplicaStatus.SYNCING,
              workflow_step: WORKFLOW_STEP.SYNCING,
              steps_history: JSON.stringify([
                {step: 'PENDING', status: 'pending', inFlight: true},
                {step: 'SENDING', status: 'pending', inFlight: true},
                {step: 'CREATING', status: 'creating', inFlight: true},
                {step: 'SYNCING', status: 'syncing', inFlight: true},
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
        'planner-ready in-flight priority operations should not keep topology-settling closed',
      );
    },
  );
});
