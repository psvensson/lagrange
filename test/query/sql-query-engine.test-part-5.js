/**
 * SQL Query Engine Tests
 * Tests for the main SQL query processing entry point.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
} from '../../src/query/query-constants.js';
import {
  COLUMN,
  METRICS_LOG_TAG,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
} from '../../src/control-plane/timeout-budget.js';
import {
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  assertNoHandlerRepairConverged,
  createStaleOverlayOwnerHandoffFixture,
} from './routing-repair-test-helpers.js';
import {createSqlRequest} from '../../src/query/sql-request.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data for routing
const mockPartitionData = new Map();

// Mock message router that routes queries to mock partition data
function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      // Extract partition ID from address (format: nodeId/partition/replicaId)
      const parts = address.split('/');
      const replicaId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(replicaId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: 0,
        };
      }
      return {acknowledged: true, success: true};
    },
  };
}

// Mock system cache with services for routing
function createMockSystemCache(tables, partitions, services, nodes = []) {
  const resolvedServices = services || partitions.map((p) => ({
    service_id: p.partition_id,
    service_type: 'partition',
    partition_id: p.partition_id,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${p.partition_id}`,
    status: 'active',
  }));
  const resolvedPartitions = partitions.map((partition) => {
    if (Object.prototype.hasOwnProperty.call(partition, 'leader_node_id') ||
        Object.prototype.hasOwnProperty.call(partition, 'leaderNodeId')) {
      return partition;
    }
    const leaderService = resolvedServices.find((service) =>
      service.partition_id === partition.partition_id &&
      service.raft_role === 'leader',
    ) || resolvedServices.find((service) =>
      service.partition_id === partition.partition_id,
    );
    return {
      ...partition,
      leader_node_id: leaderService?.node_id || 'test-node',
    };
  });
  return {
    tables,
    partitions: resolvedPartitions,
    services: resolvedServices,
    get: function(type, key) {
      if (type === 'tables') {
        return this.tables.find((t) => t.table_name === key);
      }
      if (type === 'nodes') {
        return nodes.find((node) => node[COLUMN.NODE_ID] === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'nodes') {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll: function(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      if (type === 'services') return this.services;
      if (type === 'nodes') return nodes;
      return [];
    },
  };
}

function uniqueNodeIds(nodeIds) {
  return [...new Set(nodeIds)];
}

const TABLE_PARTITION_METADATA_WAIT_TIMEOUT_DRIFT_MS = 1;

function createAdmittedSplitAdmissionService() {
  return {
    async checkSplit(options = {}) {
      return {
        allowed: true,
        decisionType: 'admitted',
        decision: 'admitted',
        operationType: 'partition_split',
        requiredReplicaCount: options.requiredReplicaCount || 1,
        candidateTargetNodeIds: Array.isArray(options.targetNodeIds) ?
          [...options.targetNodeIds] :
          [],
        eligibleNodeIds: Array.isArray(options.targetNodeIds) ?
          [...options.targetNodeIds] :
          [],
        sourceRoutableNodeIds: Array.isArray(options.sourceRoutableNodeIds) ?
          [...options.sourceRoutableNodeIds] :
          [],
      };
    },
  };
}

test('SQLQueryEngine - provisionInitialTablePartition suppresses duplicate ' +
  'coordinator-created dispatch when executing planned replicas inline',
async (t) => {
  const tableId = 'tbl-inline-provision-dispatch';
  const partitionId = 'tbl-inline-provision-dispatch-p1';
  const localNodeId = 'node-a';
  const nodes = [
    {node_id: localNodeId, status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'users_inline_dispatch'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [];
  const createOperationFlags = [];
  const executedInlineFlags = [];
  let dispatchOperationCalls = 0;

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      return false;
    },
    get(type, key) {
      if (type !== TABLES.TABLES) {
        return null;
      }
      return tables.find((row) =>
        row.table_id === key || row.table_name === key,
      ) || null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createOperationFlags.push(move.emitOperationCreated === false);
      return {
        operationId: `op-${move.nodeId}`,
        replicaId: `${partitionId}-r1`,
        targetNodeId: move.nodeId,
        emitOperationCreated: move.emitOperationCreated !== false,
        ...move,
      };
    },
    async executeOperation(operation) {
      executedInlineFlags.push(operation.emitOperationCreated === false);
      if (operation.emitOperationCreated !== false) {
        return {
          success: false,
          error: 'Transaction already active on this partition',
        };
      }
      services.push({
        service_id: operation.replicaId,
        replica_id: operation.replicaId,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: operation.targetNodeId || operation.nodeId,
        raft_role: 'leader',
        address: `${operation.targetNodeId || operation.nodeId}/partition/${operation.replicaId}`,
      });
      return {success: true};
    },
    async dispatchOperation() {
      dispatchOperationCalls += 1;
      return {
        success: false,
        error: 'inline provisioning must not use dispatchOperation',
      };
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 200,
    tablePartitionProvisioningPollIntervalMs: 5,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 1,
  });

  t.same(
    createOperationFlags,
    [true],
    'inline provisioning should suppress the coordinator-created dispatch event',
  );
  t.same(
    executedInlineFlags,
    [true],
    'inline provisioning should execute replicas with duplicate dispatch suppressed',
  );
  t.equal(
    dispatchOperationCalls,
    0,
    'inline provisioning should bypass dispatchOperation even when it is available',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition skips disconnected nodes',
  async (t) => {
    const tableId = 'tbl-orders';
    const partitionId = 'tbl-orders-p1';
    const localNodeId = 'node-a';
    const createdTargetNodeIds = [];
    const nodes = [
      {node_id: localNodeId, status: 'active', connection_state: 'ready'},
      {node_id: 'node-b', status: 'active', connection_state: 'disconnected'},
      {node_id: 'node-c', status: 'active', connection_state: 'disconnected'},
      {node_id: 'node-d', status: 'active', connection_state: 'connected'},
      {node_id: 'node-e', status: 'active', connection_state: 'connected'},
    ];
    const tables = [{table_id: tableId, table_name: 'orders'}];
    const partitions = [{partition_id: partitionId, table_id: tableId}];
    const services = [];

    const cache = {
      has(type, key) {
        if (type === TABLES.TABLES) {
          return tables.some((row) => row.table_id === key);
        }
        if (type === TABLES.PARTITIONS) {
          return partitions.some((row) => row.partition_id === key);
        }
        return false;
      },
      get(type, key) {
        if (type !== TABLES.TABLES) {
          return null;
        }
        return tables.find((row) =>
          row.table_id === key || row.table_name === key,
        ) || null;
      },
      filter(type, predicate) {
        if (type === TABLES.NODES) {
          return nodes.filter(predicate);
        }
        if (type === TABLES.TABLES) {
          return tables.filter(predicate);
        }
        if (type === TABLES.PARTITIONS) {
          return partitions.filter(predicate);
        }
        if (type === TABLES.SERVICES) {
          return services.filter(predicate);
        }
        return [];
      },
      getAll(type) {
        if (type === TABLES.NODES) {
          return nodes;
        }
        if (type === TABLES.TABLES) {
          return tables;
        }
        if (type === TABLES.PARTITIONS) {
          return partitions;
        }
        if (type === TABLES.SERVICES) {
          return services;
        }
        return [];
      },
    };

    const rebalanceCoordinator = {
      async createOperation(move) {
        createdTargetNodeIds.push(move.nodeId);
        return {
          operationId: `op-${move.nodeId}`,
          ...move,
        };
      },
      async executeOperation(operation) {
        const targetNodeId = operation.targetNodeId || operation.nodeId;
        services.push({
          partition_id: operation.partitionId,
          service_type: 'partition',
          status: 'active',
          node_id: targetNodeId,
          raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
          address: `${targetNodeId}/partition/${operation.partitionId}`,
        });
        return {success: true};
      },
    };

    const engine = new SQLQueryEngine({
      nodeId: localNodeId,
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
      rebalanceCoordinator,
      tablePartitionProvisioningTimeoutMs: 500,
      tablePartitionProvisioningPollIntervalMs: 5,
    });

    await engine.provisionInitialTablePartition({
      tableId,
      partitionId,
      replicaCount: 3,
    });

    t.same(
      createdTargetNodeIds,
      ['node-a', 'node-d', 'node-e'],
      'provisioning should target connected/ready active nodes only',
    );
  });

test('SQLQueryEngine - provisionInitialTablePartition continues planning on ' +
  'admission-denied targets', async (t) => {
  const partitionId = 'tbl-admission-fallback-p1';
  const localNodeId = 'node-a';
  const attemptedTargetNodeIds = [];
  const executedTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const services = [];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const createAdmissionDeniedError = (nodeId) => {
    const error = new Error(`Provisioning admission denied on ${nodeId}`);
    error.admissionResult = {
      allowed: false,
      decisionType: 'deferred',
      blockingReasons: ['insufficient_placement_eligible_nodes'],
      ineligibleNodes: [{
        nodeId,
        failedDimensions: ['controlPlaneWritable'],
        reasonCodes: ['control_plane_write_unhealthy'],
      }],
    };
    return error;
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      attemptedTargetNodeIds.push(move.nodeId);
      if (move.nodeId === localNodeId) {
        throw createAdmissionDeniedError(move.nodeId);
      }
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: 'leader',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionTargetNodeConvergenceTimeoutMs: 1,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 1,
  });

  t.same(
    attemptedTargetNodeIds,
    ['node-a', 'node-b'],
    'planning should continue to alternate targets after admission denial',
  );
  t.same(
    executedTargetNodeIds,
    ['node-b'],
    'dispatch should use the first admissible target',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition fails fast when ' +
  'admission blocks all targets', async (t) => {
  const partitionId = 'tbl-admission-blocked-p1';
  const localNodeId = 'node-a';
  const attemptedTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      attemptedTargetNodeIds.push(move.nodeId);
      const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
      error.admissionResult = {
        allowed: false,
        decisionType: 'deferred',
        blockingReasons: ['insufficient_placement_eligible_nodes'],
        ineligibleNodes: [{
          nodeId: move.nodeId,
          failedDimensions: ['clusterMemberHealthy'],
          reasonCodes: ['cluster_member_unhealthy'],
        }],
      };
      throw error;
    },
    async executeOperation() {
      throw new Error('executeOperation should not be called');
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionTargetNodeConvergenceTimeoutMs: 1,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 2,
    }),
    /Unable to satisfy minimum routable provisioning cohort/,
  );

  t.same(
    attemptedTargetNodeIds,
    ['node-a', 'node-b'],
    'planning should evaluate all discovered candidates before failing',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition probes admission ' +
  'before creating operations', async (t) => {
  const partitionId = 'tbl-admission-probe-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: false,
        decisionType: 'deferred',
        admissionResult: {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['insufficient_placement_eligible_nodes'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['clusterMemberHealthy'],
            reasonCodes: ['cluster_member_unhealthy'],
          }],
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation() {
      throw new Error('executeOperation should not be called');
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionTargetNodeConvergenceTimeoutMs: 1,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 2,
    }),
    /Unable to satisfy minimum routable provisioning cohort/,
  );

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    ['node-a', 'node-b'],
    'admission probe should evaluate all discovered candidates',
  );
  t.same(
    createdTargetNodeIds,
    [],
    'operation rows should not be created when admission probe already fails',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition downscales when ' +
  'create-phase admission leaves a smaller viable cohort', async (t) => {
  const partitionId = 'tbl-admission-race-downscale-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const executedTargetNodeIds = [];
  const failedOperationIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];
  const services = [];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: true,
        decisionType: 'admitted',
        admissionResult: {
          allowed: true,
          decisionType: 'admitted',
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      if (move.nodeId === 'node-b') {
        const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
        error.admissionResult = {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['control_plane_write_unhealthy'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['controlPlaneWritable'],
            reasonCodes: ['control_plane_write_unhealthy'],
          }],
        };
        throw error;
      }
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async failOperation(operation) {
      failedOperationIds.push(operation.operationId);
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: 'leader',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 2,
  });

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    ['node-a', 'node-b'],
    'admission probe should still evaluate the full desired cohort first',
  );
  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b'],
    'create phase should attempt all previously admitted targets until shortfall is known',
  );
  t.same(
    executedTargetNodeIds,
    ['node-a'],
    'bootstrap should continue with the viable reduced cohort instead of aborting',
  );
  t.same(
    failedOperationIds,
    [],
    'successful provisional operations should not be failed when degraded bootstrap can continue',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition preserves a quorum ' +
  'floor when convergence timing leaves only one RF3 target provisionable',
async (t) => {
  const partitionId = 'tbl-admission-quorum-floor-timeout-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      const allowed = move.nodeId === localNodeId;
      return {
        allowed,
        decisionType: allowed ? 'admitted' : 'deferred',
        admissionResult: {
          allowed,
          decisionType: allowed ? 'admitted' : 'deferred',
          ...(allowed ? {} : {
            blockingReasons: ['storage_budget_unavailable'],
            ineligibleNodes: [{
              nodeId: move.nodeId,
              failedDimensions: ['storageBudgetAvailable'],
              reasonCodes: ['storage_budget_unavailable'],
            }],
          }),
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async executeOperation() {
      throw new Error('executeOperation should not be called');
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionTargetNodeConvergenceTimeoutMs: 1,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 3,
    }),
    /Unable to satisfy minimum routable provisioning cohort/,
  );

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    [localNodeId, 'node-b', 'node-c'],
    'admission convergence should still probe the full RF3 cohort',
  );
  t.same(
    createdTargetNodeIds,
    [],
    'initial provisioning should not silently downscale to a single replica after convergence timeout',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition downscales RF3 ' +
  'create-phase shortfall only to quorum, not to one replica', async (t) => {
  const partitionId = 'tbl-admission-race-quorum-floor-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const executedTargetNodeIds = [];
  const failedOperationIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const services = [];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: true,
        decisionType: 'admitted',
        admissionResult: {
          allowed: true,
          decisionType: 'admitted',
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      if (move.nodeId === 'node-c') {
        const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
        error.admissionResult = {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['control_plane_write_unhealthy'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['controlPlaneWritable'],
            reasonCodes: ['control_plane_write_unhealthy'],
          }],
        };
        throw error;
      }
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async failOperation(operation) {
      failedOperationIds.push(operation.operationId);
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
  });

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    [localNodeId, 'node-b', 'node-c'],
    'admission probe should still evaluate the full RF3 cohort first',
  );
  t.same(
    createdTargetNodeIds,
    [localNodeId, 'node-b', 'node-c'],
    'create phase should still attempt all admitted RF3 targets until shortfall is known',
  );
  t.same(
    executedTargetNodeIds,
    [localNodeId, 'node-b'],
    'RF3 provisioning may degrade to the two-node quorum cohort',
  );
  t.same(
    failedOperationIds,
    [],
    'successful quorum-sized provisional operations should remain active',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition rejects RF3 ' +
  'create-phase shortfall below quorum', async (t) => {
  const partitionId = 'tbl-admission-race-below-quorum-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const failedOperationIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: true,
        decisionType: 'admitted',
        admissionResult: {
          allowed: true,
          decisionType: 'admitted',
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      if (move.nodeId !== localNodeId) {
        const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
        error.admissionResult = {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['storage_budget_unavailable'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['storageBudgetAvailable'],
            reasonCodes: ['storage_budget_unavailable'],
          }],
        };
        throw error;
      }
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async failOperation(operation) {
      failedOperationIds.push(operation.operationId);
    },
    async executeOperation() {
      throw new Error('executeOperation should not be called');
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 3,
    }),
    /Unable to satisfy minimum routable provisioning cohort/,
  );

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    [localNodeId, 'node-b', 'node-c'],
    'admission probe should still evaluate all RF3 targets',
  );
  t.same(
    createdTargetNodeIds,
    [localNodeId, 'node-b', 'node-c'],
    'create phase should discover the shortfall before failing',
  );
  t.same(
    failedOperationIds,
    ['op-node-a'],
    'single provisional replica should be aborted when the RF3 quorum floor is not met',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition aborts provisional ' +
  'operations when post-check planning becomes insufficient', async (t) => {
  const partitionId = 'tbl-admission-race-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const failedOperationIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: true,
        decisionType: 'admitted',
        admissionResult: {
          allowed: true,
          decisionType: 'admitted',
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      if (move.nodeId === 'node-b') {
        const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
        error.admissionResult = {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['control_plane_write_unhealthy'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['controlPlaneWritable'],
            reasonCodes: ['control_plane_write_unhealthy'],
          }],
        };
        throw error;
      }
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async failOperation(operation) {
      failedOperationIds.push(operation.operationId);
    },
    async executeOperation() {
      throw new Error('executeOperation should not be called');
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 2,
      minimumRoutableReplicaCount: 2,
    }),
    /Unable to satisfy minimum routable provisioning cohort/,
  );

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    ['node-a', 'node-b'],
    'admission probe should run for both target nodes before create phase',
  );
  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b'],
    'create phase should still attempt admitted targets until minimum is met',
  );
  t.same(
    failedOperationIds,
    ['op-node-a'],
    'newly created provisional operation should be failed before returning error',
  );
});
