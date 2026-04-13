/**
 * Unit tests for runtime-service entity support in rebalancer models.
 *
 * Validates entity-type handling, replica discovery, in-flight
 * operation matching, policy resolution, and CDC event handling
 * for runtime_service entities.
 *
 * Requirements: 3.2, 4.1, 4.2, 4.3
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
  ReplicaStatus,
  NodeStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_DEFAULT_POLICY,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/unified-service-lifecycle.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createMockCache(
  nodes = [], services = [], replicaOperations = [],
) {
  const now = Date.now();
  const normalizedNodes = nodes.map((n) => ({
    connection_state: 'ready',
    ready_lease_expires_at: now + 10000,
    ...n,
  }));
  const cache = {
    nodes: new Map(normalizedNodes.map((n) => [n.node_id, n])),
    services: new Map(services.map((s) => [s.service_id, s])),
    partitions: new Map(),
    tables: new Map(),
    message_groups: new Map(),
    replica_operations: new Map(
      replicaOperations.map((op) => [op.operation_id, op]),
    ),
  };
  return {
    get: (table, key) => cache[table]?.get(key),
    filter: (table, predicate) => {
      const t = cache[table];
      if (!t) return [];
      return Array.from(t.values()).filter(predicate);
    },
    getAll: (table) => {
      const t = cache[table];
      if (!t) return [];
      return Array.from(t.values());
    },
  };
}

function createRebalancer(options = {}) {
  const {
    entityId = 'sys-postgres-wire',
    entityType = REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
    nodeId = 'node-1',
    nodes = [],
    services = [],
    replicaOperations = [],
  } = options;

  const mockCache = createMockCache(
    nodes, services, replicaOperations,
  );

  return new UnifiedRebalancer({
    entityId,
    entityType,
    nodeId,
    systemTableCache: mockCache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({}),
      getMessageGroupPolicy: async () => ({}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      deliver: async () => ({acknowledged: true}),
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      createOperation: async (m) => ({
        operationId: 'op-' + Date.now(),
        type: m.type,
        status: 'pending',
      }),
      getStats: () => ({
        operationsCreated: 0,
        operationsCompleted: 0,
        operationsFailed: 0,
      }),
    },
  });
}


// --- Entity type constants ---

test('REBALANCER_ENTITY_TYPE includes RUNTIME_SERVICE', async (t) => {
  initEnv();

  await t.test('value matches UNIFIED_SERVICE_TYPE', async (t) => {
    t.equal(
      REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
      UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    );
    t.equal(
      REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
      'runtime_service',
    );
  });

  await t.test('EntityType alias exposes RUNTIME_SERVICE', async (t) => {
    t.equal(
      EntityType.RUNTIME_SERVICE,
      'runtime_service',
    );
  });
});

// --- Default policy ---

test('REBALANCER_DEFAULT_POLICY includes RUNTIME_SERVICE', async (t) => {
  initEnv();

  await t.test('has expected shape', async (t) => {
    const policy = REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE;
    t.ok(policy, 'policy exists');
    t.equal(policy.targetReplicaCount, 3);
    t.equal(policy.minReplicaCount, 1);
    t.equal(policy.maxReplicaCount, 7);
    t.ok(policy.placementConstraints.spreadAcrossNodes);
  });

  await t.test('is frozen', async (t) => {
    t.ok(Object.isFrozen(REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE));
  });
});

// --- Initialization ---

test('UnifiedRebalancer accepts runtime_service entity type', async (t) => {
  initEnv();

  await t.test('creates with runtime_service entity type', async (t) => {
    const rebalancer = createRebalancer();
    t.equal(rebalancer.entityType, 'runtime_service');
    t.equal(rebalancer.entityId, 'sys-postgres-wire');
  });

  await t.test('initializes successfully', async (t) => {
    const rebalancer = createRebalancer();
    rebalancer.initialize();
    t.equal(rebalancer.initialized, true);
    rebalancer.shutdown();
  });
});

// --- Policy resolution ---

test('getPolicy returns runtime service policy', async (t) => {
  initEnv();

  await t.test('returns default runtime service policy', async (t) => {
    const rebalancer = createRebalancer();
    const policy = await rebalancer.getPolicy();
    t.equal(policy.targetReplicaCount, 3);
    t.equal(policy.minReplicaCount, 1);
    t.equal(policy.maxReplicaCount, 7);
    t.ok(policy.placementConstraints.spreadAcrossNodes);
  });

  await t.test('returns a fresh copy each call', async (t) => {
    const rebalancer = createRebalancer();
    const p1 = await rebalancer.getPolicy();
    const p2 = await rebalancer.getPolicy();
    t.not(p1, p2, 'different object references');
    t.equal(p1.targetReplicaCount, p2.targetReplicaCount);
  });
});

// --- Replica discovery ---

test('getCurrentReplicas discovers runtime-service replicas', async (t) => {
  initEnv();

  await t.test('returns matching runtime_service rows', async (t) => {
    const rebalancer = createRebalancer({
      services: [
        {
          service_id: 'sys-postgres-wire',
          service_type: 'runtime_service',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });
    const replicas = rebalancer.getCurrentReplicas();
    t.equal(replicas.length, 1);
    t.equal(replicas[0].service_id, 'sys-postgres-wire');
    t.equal(replicas[0].service_type, 'runtime_service');
  });

  await t.test('excludes non-matching service types', async (t) => {
    const rebalancer = createRebalancer({
      services: [
        {
          service_id: 'sys-postgres-wire',
          service_type: 'runtime_service',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 'partition-r1',
          service_type: 'partition',
          node_id: 'node-1',
          partition_id: 'p1',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 'mg-r1',
          service_type: 'message_group',
          node_id: 'node-1',
          group_id: 'mg-1',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });
    const replicas = rebalancer.getCurrentReplicas();
    t.equal(replicas.length, 1);
    t.equal(replicas[0].service_type, 'runtime_service');
  });

  await t.test('excludes other runtime_service definitions', async (t) => {
    const rebalancer = createRebalancer({
      entityId: 'sys-postgres-wire',
      services: [
        {
          service_id: 'sys-postgres-wire',
          service_type: 'runtime_service',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 'sys-admin-meta',
          service_type: 'runtime_service',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });
    const replicas = rebalancer.getCurrentReplicas();
    t.equal(replicas.length, 1);
    t.equal(replicas[0].service_id, 'sys-postgres-wire');
  });

  await t.test('returns empty when no matching replicas', async (t) => {
    const rebalancer = createRebalancer({
      services: [
        {
          service_id: 'sys-admin-meta',
          service_type: 'runtime_service',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });
    const replicas = rebalancer.getCurrentReplicas();
    t.equal(replicas.length, 0);
  });
});


// --- In-flight operation matching ---

test('getInFlightOperations matches runtime-service ops', async (t) => {
  initEnv();

  await t.test('matches operations with entity_type runtime_service',
    async (t) => {
      const rebalancer = createRebalancer({
        replicaOperations: [
          {
            operation_id: 'op-1',
            entity_type: 'runtime_service',
            entity_id: 'sys-postgres-wire',
            status: 'pending',
          },
        ],
      });
      const ops = rebalancer.getInFlightOperations();
      t.equal(ops.length, 1);
      t.equal(ops[0].operation_id, 'op-1');
    });

  await t.test('excludes terminal operations', async (t) => {
    const rebalancer = createRebalancer({
      replicaOperations: [
        {
          operation_id: 'op-1',
          entity_type: 'runtime_service',
          entity_id: 'sys-postgres-wire',
          status: 'pending',
        },
        {
          operation_id: 'op-2',
          entity_type: 'runtime_service',
          entity_id: 'sys-postgres-wire',
          status: 'active',
        },
        {
          operation_id: 'op-3',
          entity_type: 'runtime_service',
          entity_id: 'sys-postgres-wire',
          status: 'failed',
        },
        {
          operation_id: 'op-4',
          entity_type: 'runtime_service',
          entity_id: 'sys-postgres-wire',
          status: 'removed',
        },
      ],
    });
    const ops = rebalancer.getInFlightOperations();
    t.equal(ops.length, 1);
    t.equal(ops[0].operation_id, 'op-1');
  });

  await t.test('excludes operations for other entities', async (t) => {
    const rebalancer = createRebalancer({
      replicaOperations: [
        {
          operation_id: 'op-1',
          entity_type: 'runtime_service',
          entity_id: 'sys-postgres-wire',
          status: 'pending',
        },
        {
          operation_id: 'op-2',
          entity_type: 'runtime_service',
          entity_id: 'sys-admin-meta',
          status: 'pending',
        },
        {
          operation_id: 'op-3',
          entity_type: 'partition',
          entity_id: 'nodes-p1',
          status: 'pending',
        },
      ],
    });
    const ops = rebalancer.getInFlightOperations();
    t.equal(ops.length, 1);
    t.equal(ops[0].entity_id, 'sys-postgres-wire');
  });

  await t.test('excludes workflow-terminal rows even when status is stale',
    async (t) => {
      const rebalancer = createRebalancer({
        replicaOperations: [
          {
            operation_id: 'op-stale-terminal',
            type: 'ADD',
            entity_type: 'runtime_service',
            entity_id: 'sys-postgres-wire',
            status: 'pending',
            workflow_step: 'FAILED',
          },
          {
            operation_id: 'op-inflight',
            type: 'ADD',
            entity_type: 'runtime_service',
            entity_id: 'sys-postgres-wire',
            status: 'pending',
            workflow_step: 'CREATING',
          },
        ],
      });
      const ops = rebalancer.getInFlightOperations();
      t.equal(ops.length, 1);
      t.equal(ops[0].operation_id, 'op-inflight');
    });
});

// --- CDC event handling ---

test('isCriticalCDCEvent handles runtime-service entities', async (t) => {
  initEnv();

  await t.test('detects service failure for runtime_service entity',
    async (t) => {
      const rebalancer = createRebalancer({
        services: [
          {
            service_id: 'sys-postgres-wire',
            service_type: 'runtime_service',
            node_id: 'node-1',
            status: ReplicaStatus.ACTIVE,
          },
        ],
      });
      const event = {
        tableName: 'services',
        operation: 'UPDATE',
        data: {
          service_id: 'sys-postgres-wire',
          status: ReplicaStatus.FAILED,
        },
      };
      t.equal(rebalancer.isCriticalCDCEvent(event), true);
    });

  await t.test('ignores service failure for other entity',
    async (t) => {
      const rebalancer = createRebalancer({
        entityId: 'sys-postgres-wire',
      });
      const event = {
        tableName: 'services',
        operation: 'UPDATE',
        data: {
          service_id: 'sys-admin-meta',
          status: ReplicaStatus.FAILED,
        },
      };
      t.equal(rebalancer.isCriticalCDCEvent(event), false);
    });

  await t.test('detects node failure affecting runtime replicas',
    async (t) => {
      const rebalancer = createRebalancer({
        services: [
          {
            service_id: 'sys-postgres-wire',
            service_type: 'runtime_service',
            node_id: 'node-2',
            status: ReplicaStatus.ACTIVE,
          },
        ],
      });
      const event = {
        tableName: 'nodes',
        operation: 'UPDATE',
        data: {
          node_id: 'node-2',
          status: NodeStatus.FAILED,
        },
      };
      t.equal(rebalancer.isCriticalCDCEvent(event), true);
    });
});
