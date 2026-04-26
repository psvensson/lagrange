/**
 * SQL Query Engine Tests
 * Tests for the main SQL query processing entry point.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
} from '../../src/query/query-constants.js';
import {
  TABLES,
} from '../../src/constants/index.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
} from '../../src/partition/partition-constants.js';
import {
} from '../../src/control-plane/timeout-budget.js';
import {
} from '../../src/control-plane/pressure-governor.js';
import {
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
} from './routing-repair-test-helpers.js';

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


test('SQLQueryEngine - provisionInitialTablePartition provisions requested ' +
  'replicas across active nodes', async (t) => {
  const tableId = 'tbl-users';
  const partitionId = 'tbl-users-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const mutationWorkClasses = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'users'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [];

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
      createdTargetNodeIds.push(move.nodeId);
      mutationWorkClasses.push(move.controlPlaneMutationWorkClass);
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
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'provisioning should target local node first, then active peers',
  );
  t.same(
    mutationWorkClasses,
    ['interactive', 'interactive', 'interactive'],
    'interactive provisioning should explicitly mark coordinator mutations as interactive work',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    3,
    'partition should expose three routable replicas',
  );
});

test('SQLQueryEngine - waitForProvisionTargetNodeIds exposes the shared ' +
  'ready/proceed contract when enough targets are visible', async (t) => {
  const localNodeId = 'node-a';
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return [];
      }
      return [];
    },
    getAll() {
      return [];
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  const result = await engine.waitForProvisionTargetNodeIds({
    partitionId: 'tbl-target-contract-p1',
    requiredReplicaCount: 2,
    failOnTimeout: false,
    maxWaitMs: 10,
  });

  t.equal(result.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.PROCEED);
  t.same(result.reasonCodes, []);
  t.equal(result.retryAfterMs, 0);
  t.equal(result.timedOut, false);
});

test('SQLQueryEngine - waitForProvisionTargetNodeIds exposes the shared ' +
  'pending/wait contract on soft timeout', async (t) => {
  const localNodeId = 'node-a';
  const nodes = [
    {node_id: localNodeId, status: 'active'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return [];
      }
      return [];
    },
    getAll() {
      return [];
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    tablePartitionProvisioningPollIntervalMs: 5,
    tablePartitionProvisioningTimeoutMs: 15,
  });

  const result = await engine.waitForProvisionTargetNodeIds({
    partitionId: 'tbl-target-contract-timeout-p1',
    requiredReplicaCount: 2,
    failOnTimeout: false,
    maxWaitMs: 10,
  });

  t.equal(result.contractState, OWNER_CONTRACT_STATE.PENDING);
  t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.WAIT);
  t.same(
    result.reasonCodes,
    ['table_partition_target_node_wait_timeout'],
  );
  t.ok(result.retryAfterMs > 0);
  t.equal(result.timedOut, true);
});

test('SQLQueryEngine - provisionInitialTablePartition waits for active node ' +
  'cache convergence before sizing the initial replica cohort', async (t) => {
  const tableId = 'tbl-cache-convergence';
  const partitionId = 'tbl-cache-convergence-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];
  const services = [];
  let sleepCalls = 0;
  let injectedThirdNode = false;

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
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
        service_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        replica_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
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
    tablePartitionProvisioningTimeoutMs: 50,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.sleep = async () => {
    sleepCalls += 1;
    if (!injectedThirdNode) {
      nodes.push({node_id: 'node-c', status: 'active'});
      injectedThirdNode = true;
    }
  };
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'initial provisioning should wait for the third active node instead of silently downscaling',
  );
  t.ok(
    sleepCalls > 0,
    'provisioning should poll for active-node convergence before selecting final targets',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    3,
    'all requested initial replicas should become routable',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition waits for admission ' +
  'convergence before planning the initial replica cohort', async (t) => {
  const partitionId = 'tbl-admission-convergence-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const services = [];
  let sleepCalls = 0;
  let admissionConverged = false;

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
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
      const allowed = move.nodeId === localNodeId || admissionConverged;
      if (allowed) {
        return {
          allowed: true,
          decisionType: 'admitted',
          admissionResult: {
            allowed: true,
            decisionType: 'admitted',
          },
        };
      }
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
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        service_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        replica_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
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
    tablePartitionProvisioningTimeoutMs: 50,
    tablePartitionProvisioningPollIntervalMs: 1,
    tablePartitionTargetNodeConvergenceTimeoutMs: 10,
  });
  engine.sleep = async () => {
    sleepCalls += 1;
    admissionConverged = true;
  };
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
  });

  t.ok(
    sleepCalls > 0,
    'provisioning should poll for admission convergence before planning',
  );
  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'provisioning should wait for newly admissible peers instead of failing early',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition extends the default ' +
  'convergence wait when enough active nodes exist but admission settles late',
async (t) => {
  const partitionId = 'tbl-admission-convergence-default-window-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const services = [];
  let sleepCalls = 0;
  let fakeNow = 1000;
  let admissionConverged = false;

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
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
      const allowed = move.nodeId === localNodeId || admissionConverged;
      if (allowed) {
        return {
          allowed: true,
          decisionType: 'admitted',
          admissionResult: {
            allowed: true,
            decisionType: 'admitted',
          },
        };
      }
      return {
        allowed: false,
        decisionType: 'deferred',
        admissionResult: {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['cluster_member_unhealthy'],
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
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        service_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        replica_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
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
    tablePartitionProvisioningTimeoutMs: 5000,
    tablePartitionProvisioningPollIntervalMs: 400,
    nowFn: () => fakeNow,
  });
  engine.sleep = async (ms) => {
    sleepCalls += 1;
    fakeNow += ms;
    if (fakeNow >= 2200) {
      admissionConverged = true;
    }
  };
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
  });

  t.ok(
    sleepCalls >= 3,
    'default convergence wait should keep polling past the legacy one-second window',
  );
  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'bootstrap should preserve the full cohort once delayed admission converges',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition does not block on full ' +
  'provisioning timeout when only one active target node is visible',
async (t) => {
  const partitionId = 'tbl-single-node-bootstrap-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [{node_id: localNodeId, status: 'active'}];
  const services = [];
  let sleepCalls = 0;

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
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
        service_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        replica_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
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
    tablePartitionProvisioningTimeoutMs: 200,
    tablePartitionProvisioningPollIntervalMs: 5,
    tablePartitionTargetNodeConvergenceTimeoutMs: 20,
  });
  engine.sleep = async () => {
    sleepCalls += 1;
  };
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  const startedAtMs = Date.now();
  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
  });
  const elapsedMs = Date.now() - startedAtMs;

  t.same(
    createdTargetNodeIds,
    [localNodeId],
    'single-node bootstrap should degrade the initial cohort to the visible target node',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    1,
    'single-node bootstrap should publish one routable replica',
  );
  t.ok(
    sleepCalls > 0,
    'provisioning should still poll briefly for cache convergence',
  );
  t.ok(
    elapsedMs < 120,
    'provisioning should not wait for the full table-partition provisioning timeout',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition attaches bootstrap ' +
  'table and partition metadata to CREATE_REPLICA operations', async (t) => {
  const tableId = 'tbl-bootstrap-metadata';
  const partitionId = `${tableId}-p1`;
  const localNodeId = 'node-a';
  const nodes = [{node_id: localNodeId, status: 'active'}];
  const tables = [];
  const partitions = [];
  const services = [];
  const executedOperations = [];
  const tableMetadata = {
    table_id: tableId,
    table_name: 'bootstrap_metadata_events',
    schema_definition: JSON.stringify({
      columns: [{name: 'event_id', type: 'TEXT', primaryKey: true}],
    }),
  };
  const partitionMetadata = {
    partition_id: partitionId,
    table_id: tableId,
    table_name: 'bootstrap_metadata_events',
    partition_key_start: null,
    partition_key_end: null,
    partition_version: 1,
    replica_count: 1,
    size_bytes: 0,
    leader_node_id: null,
    state: 'NORMAL',
    created_at: 100,
    updated_at: 100,
  };

  const cache = {
    has() {
      return false;
    },
    get() {
      return null;
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
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      executedOperations.push(operation);
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
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    tableId,
    tableName: 'bootstrap_metadata_events',
    tableMetadata,
    partitionId,
    partitionMetadata,
    replicaCount: 1,
  });

  t.equal(executedOperations.length, 1, 'provisioning should dispatch one CREATE_REPLICA operation');
  t.same(
    executedOperations[0]?.bootstrapTableMetadata,
    tableMetadata,
    'CREATE_REPLICA should carry the canonical table metadata snapshot',
  );
  t.same(
    executedOperations[0]?.bootstrapPartitionMetadata,
    partitionMetadata,
    'CREATE_REPLICA should carry the canonical partition metadata snapshot',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition waits for created ' +
  'service rows through CDC cache repair before final routing checks', async (t) => {
  const partitionId = 'tbl-service-visibility-p1';
  const localNodeId = 'node-a';
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];
  const services = [];
  const waitCalls = [];

  const cache = {
    onCacheChange() {},
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

  let replicaOrdinal = 0;
  const rebalanceCoordinator = {
    async createOperation(move) {
      replicaOrdinal += 1;
      return {
        operationId: `op-${replicaOrdinal}`,
        replicaId: `${partitionId}-r${replicaOrdinal}`,
        ...move,
      };
    },
    async executeOperation() {
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    cdcIntegrationService: {
      async waitForCacheUpdate(tableName, key, expectPresent, options) {
        waitCalls.push({tableName, key, expectPresent, options});
        if (tableName === TABLES.SERVICES && expectPresent === true) {
          const existing = services.find((row) =>
            row.service_id === key || row.replica_id === key,
          );
          if (!existing) {
            services.push({
              service_id: key,
              replica_id: key,
              partition_id: partitionId,
              service_type: 'partition',
              status: 'active',
              node_id: localNodeId,
              address: `${localNodeId}/partition/${key}`,
            });
          }
        }
      },
    },
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 2,
  });

  t.equal(waitCalls.length, 2);
  t.same(waitCalls.map((call) => ({
    tableName: call.tableName,
    key: call.key,
    expectPresent: call.expectPresent,
    fallbackPhase: call.options?.fallbackPhase,
  })), [
    {
      tableName: TABLES.SERVICES,
      key: `${partitionId}-r1`,
      expectPresent: true,
      fallbackPhase: 'steady_state',
    },
    {
      tableName: TABLES.SERVICES,
      key: `${partitionId}-r2`,
      expectPresent: true,
      fallbackPhase: 'steady_state',
    },
  ]);
  for (const call of waitCalls) {
    t.ok(
      Number.isFinite(call.options?.timeoutMs) &&
      call.options.timeoutMs > 0 &&
      call.options.timeoutMs <= 30000,
      'cache wait should use the remaining 30s provisioning budget',
    );
  }
});

test('SQLQueryEngine - provisionInitialTablePartition only waits for service ' +
  'row visibility before final full-cohort routing checks', async (t) => {
  const partitionId = 'tbl-service-visibility-owner-boundary-p1';
  const localNodeId = 'node-a';
  const targetNodeIds = [localNodeId, 'node-b', 'node-c'];
  const services = [];
  const waitCalls = [];
  const replicaIdByNodeId = {
    'node-a': `${partitionId}-r1`,
    'node-b': `${partitionId}-r2`,
    'node-c': `${partitionId}-r3`,
  };
  const nodeIdByReplicaId = Object.fromEntries(
    Object.entries(replicaIdByNodeId).map(([nodeId, replicaId]) =>
      [replicaId, nodeId],
    ),
  );

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    get(type, key) {
      if (type === TABLES.SERVICES) {
        return services.find((row) => row.service_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      return {
        operationId: `op-${move.nodeId}`,
        replicaId: replicaIdByNodeId[move.nodeId],
        ...move,
      };
    },
    async executeOperation() {
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    cdcIntegrationService: {
      async waitForCacheUpdate(tableName, key, expectPresent, options = {}) {
        waitCalls.push({tableName, key, expectPresent, options});
        if (tableName !== TABLES.SERVICES || expectPresent !== true) {
          return;
        }
        if (!services.some((row) => row.service_id === key)) {
          services.push({
            service_id: key,
            replica_id: key,
            partition_id: partitionId,
            service_type: 'partition',
            status: 'active',
            node_id: nodeIdByReplicaId[key],
            address: `${nodeIdByReplicaId[key]}/partition/${key}`,
          });
        }
      },
    },
    tablePartitionProvisioningTimeoutMs: 30,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.queryExecutor.isRoutablePartitionService = (service) =>
    service?.node_id !== localNodeId;
  engine.waitForCondition = async () => {
    throw new Error('per-replica routability wait should not run');
  };
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.resolves(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 3,
      targetNodeIds,
    }),
    'full-cohort bootstrap should defer routability to the final cohort wait',
  );

  t.same(
    waitCalls.map((call) => ({
      tableName: call.tableName,
      key: call.key,
      expectPresent: call.expectPresent,
      expectedFields: call.options?.expectedFields || null,
    })),
    [
      {
        tableName: TABLES.SERVICES,
        key: replicaIdByNodeId['node-a'],
        expectPresent: true,
        expectedFields: null,
      },
      {
        tableName: TABLES.SERVICES,
        key: replicaIdByNodeId['node-b'],
        expectPresent: true,
        expectedFields: null,
      },
      {
        tableName: TABLES.SERVICES,
        key: replicaIdByNodeId['node-c'],
        expectPresent: true,
        expectedFields: null,
      },
    ],
    'per-replica waits should only hydrate service rows before the later routing owners run',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition dispatches full initial ' +
  'replica set before per-replica cache waits consume timeout budget', async (t) => {
  const partitionId = 'tbl-provision-dispatch-order-p1';
  const localNodeId = 'node-a';
  const replicaIdByNodeId = {
    'node-a': `${partitionId}-r1`,
    'node-b': `${partitionId}-r2`,
  };
  const nodes = [
    {
      node_id: localNodeId,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: Date.now() + 60000,
    },
    {
      node_id: 'node-b',
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: Date.now() + 60000,
    },
  ];
  const services = [];
  const executedTargetNodeIds = [];
  const cacheWaitCalls = [];

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    get(type, key) {
      if (type === TABLES.SERVICES) {
        return services.find((row) => row.service_id === key) || null;
      }
      return null;
    },
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
    async createOperation(move) {
      return {
        operationId: `op-${move.nodeId}`,
        replicaId: replicaIdByNodeId[move.nodeId],
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      return {success: true};
    },
  };

  const cdcIntegrationService = {
    async waitForCacheUpdate(tableName, key, expectPresent, options = {}) {
      cacheWaitCalls.push({
        tableName,
        key,
        expectPresent,
        timeoutMs: options.timeoutMs,
      });
      if (tableName !== TABLES.SERVICES || expectPresent !== true) {
        return;
      }

      const requiredDelayMs = key === replicaIdByNodeId['node-a'] ? 28 : 8;
      if (!Number.isFinite(options.timeoutMs) ||
          options.timeoutMs < requiredDelayMs) {
        throw new Error(
          `cache wait budget ${String(options.timeoutMs)}ms too small for ${key}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, requiredDelayMs));
      if (!services.some((row) => row.service_id === key)) {
        services.push({
          service_id: key,
          replica_id: key,
          partition_id: partitionId,
          service_type: 'partition',
          status: 'active',
          node_id: key === replicaIdByNodeId['node-a'] ? 'node-a' : 'node-b',
          address: `node/${key}`,
        });
      }
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    cdcIntegrationService,
    tablePartitionProvisioningTimeoutMs: 30,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 2,
  });

  t.same(
    executedTargetNodeIds,
    ['node-a', 'node-b'],
    'both CREATE_REPLICA dispatches should happen before timeout budget is consumed by waits',
  );
  t.equal(
    cacheWaitCalls.length,
    2,
    'each replica should still wait for authoritative service-row visibility',
  );
});
