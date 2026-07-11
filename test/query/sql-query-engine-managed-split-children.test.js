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
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
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

import {
  createMockMessageRouter,
  createMockSystemCache,
  createProvisioningReadyService,
  uniqueNodeIds,
  createAdmittedSplitAdmissionService,
} from './sql-query-engine-test-support.js';


test('SQLQueryEngine - executeManagedSplit defers before child metadata ' +
  'insertion when child provisioning precheck cannot satisfy quorum', async (t) => {
  const tables = [{
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key: 'id',
    active_partition_version: 1,
    partition_transition_state: null,
    partition_transition_metadata: null,
  }];
  const cache = createMockSystemCache(
    tables,
    [{
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      replica_count: 3,
      leader_node_id: 'node-a',
    }],
    [
      {
        service_id: 'users-p1-r1',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-a',
        raft_role: 'leader',
        address: 'node-a/partition/users-p1-r1',
        status: 'active',
      },
      {
        service_id: 'users-p1-r2',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-b',
        raft_role: 'follower',
        address: 'node-b/partition/users-p1-r2',
        status: 'active',
      },
      {
        service_id: 'users-p1-r3',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-c',
        raft_role: 'follower',
        address: 'node-c/partition/users-p1-r3',
        status: 'active',
      },
    ],
    [
      {node_id: 'node-a', status: 'active', connection_state: 'ready'},
      {node_id: 'node-b', status: 'active', connection_state: 'ready'},
      {node_id: 'node-c', status: 'active', connection_state: 'ready'},
      {node_id: 'node-d', status: 'active', connection_state: 'ready'},
      {node_id: 'node-e', status: 'active', connection_state: 'ready'},
      {node_id: 'node-f', status: 'active', connection_state: 'ready'},
      {node_id: 'node-g', status: 'active', connection_state: 'ready'},
    ],
  );

  const checkedMoves = [];
  const childInsertCalls = [];
  const provisionCalls = [];
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: {
      storageAdmissionService: createAdmittedSplitAdmissionService(),
      async checkProvisioningAdmission(move) {
        checkedMoves.push({
          partitionId: move.partitionId,
          nodeId: move.nodeId,
        });
        if (move.partitionId === 'users-p-right' &&
            move.nodeId !== 'node-a') {
          return {
            allowed: false,
            decisionType: 'deferred',
            admissionResult: {
              allowed: false,
              decisionType: 'deferred',
              blockingReasons: ['control_plane_write_unhealthy'],
              ineligibleNodes: [{
                nodeId: move.nodeId,
                failedDimensions: ['controlPlaneWritable'],
                reasonCodes: ['control_plane_write_unhealthy'],
              }],
            },
          };
        }
        return {
          allowed: true,
          decisionType: 'admitted',
          admissionResult: {
            allowed: true,
            decisionType: 'admitted',
          },
        };
      },
    },
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data) {
        if (tableName === TABLES.TABLES) {
          const row = tables.find((entry) =>
            entry.table_id === whereClause.table_id,
          );
          if (row) {
            Object.assign(row, data);
          }
        }
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row) {
        childInsertCalls.push({
          tableName,
          partitionId: row.partition_id,
        });
        return {success: true};
      },
      async upsertSystemTableRow(tableName, row) {
        if (tableName === TABLES.PARTITIONS) {
          childInsertCalls.push({
            tableName,
            partitionId: row.partition_id,
          });
        }
        return {success: true};
      },
    },
  });

  engine.buildManagedSplitPlan = async () => ({
    medianKey: 'm',
    leftPartition: {
      partitionId: 'users-p-left',
      keyRange: {start: null, end: 'm'},
    },
    rightPartition: {
      partitionId: 'users-p-right',
      keyRange: {start: 'm', end: null},
    },
  });
  engine.waitForTablePartitionMetadata = async () => {
    t.fail('metadata visibility wait must not run on child precheck deferral');
  };
  engine.provisionInitialTablePartition = async (context) => {
    provisionCalls.push(context);
  };
  engine.startSplitReplicationOnSourcePartition = async () => {
    t.fail('source replication must not start on child precheck deferral');
  };

  const result = await engine.executeManagedSplit('users-p1');

  t.equal(result.success, false);
  t.equal(result.state, PARTITION_TRANSITION_STATE.DEFERRED);
  t.equal(
    childInsertCalls.length,
    0,
    'child metadata rows must not be inserted before child cohorts are viable',
  );
  t.equal(
    provisionCalls.length,
    0,
    'child provisioning must not start when precheck already proves a shortfall',
  );
  t.ok(
    checkedMoves.some((move) =>
      move.partitionId === 'users-p-left',
    ),
    'managed split should precheck the left child cohort',
  );
  t.ok(
    checkedMoves.some((move) =>
      move.partitionId === 'users-p-right',
    ),
    'managed split should precheck the right child cohort',
  );
  const persistedMetadata = JSON.parse(
    tables[0].partition_transition_metadata,
  );
  t.equal(
    tables[0].partition_transition_state,
    PARTITION_TRANSITION_STATE.DEFERRED,
    'the deferred workflow state should persist through the canonical table row',
  );
  t.equal(
    persistedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.FAILURE
    ].classification,
    'split_child_provisioning_precheck_failed',
  );
  t.equal(
    persistedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT
    ].childProvisioningAdmissionByPartitionId['users-p-right']
      .maximumProvisionableReplicaCount,
    1,
    'persisted diagnostics should retain the failing child precheck result',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition uses explicit child ' +
  'target fallbacks when later admission rejects preferred nodes', async (t) => {
  const partitionId = 'tbl-split-child-fallback-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const executedTargetNodeIds = [];
  const services = [];
  const nodes = [
    {node_id: localNodeId, status: 'active', connection_state: 'ready'},
    {node_id: 'node-b', status: 'active', connection_state: 'ready'},
    {node_id: 'node-c', status: 'active', connection_state: 'ready'},
    {node_id: 'node-d', status: 'active', connection_state: 'ready'},
  ];

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
      if (move.nodeId === 'node-b' || move.nodeId === 'node-c') {
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
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      services.push({
        replica_id: operation.replicaId || operation.replica_id,
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
    minimumRoutableReplicaCount: 2,
    targetNodeIds: [localNodeId, 'node-b', 'node-c', 'node-d'],
  });

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    [localNodeId, 'node-b', 'node-c', 'node-d'],
    'explicit child provisioning targets should still be admission-probed in order',
  );
  t.same(
    createdTargetNodeIds,
    [localNodeId, 'node-b', 'node-c', 'node-d'],
    'later fallback targets should be attempted when earlier explicit targets are rejected',
  );
  t.same(
    executedTargetNodeIds,
    [localNodeId, 'node-d'],
    'provisioning should continue with later explicit fallbacks once the minimum child cohort is still satisfiable',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition reuses explicit child ' +
  'prechecks during bootstrap creation', async (t) => {
  const partitionId = 'tbl-split-child-prechecked-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetMoves = [];
  const executedTargetNodeIds = [];
  const services = [];
  const nodes = [
    {node_id: localNodeId, status: 'active', connection_state: 'ready'},
    {node_id: 'node-b', status: 'active', connection_state: 'ready'},
    {node_id: 'node-c', status: 'active', connection_state: 'ready'},
  ];

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

  const deniedAdmissionResult = {
    allowed: false,
    decisionType: 'deferred',
    blockingReasons: ['control_plane_write_unhealthy'],
    ineligibleNodes: [{
      nodeId: localNodeId,
      failedDimensions: ['controlPlaneWritable'],
      reasonCodes: ['control_plane_write_unhealthy'],
    }],
  };
  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: false,
        decisionType: 'deferred',
        admissionResult: deniedAdmissionResult,
      };
    },
    async createOperation(move) {
      createdTargetMoves.push({
        nodeId: move.nodeId,
        skipProvisioningAdmissionRecheck:
          move.skipProvisioningAdmissionRecheck === true,
      });
      if (move.skipProvisioningAdmissionRecheck !== true) {
        const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
        error.admissionResult = deniedAdmissionResult;
        throw error;
      }
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      services.push({
        replica_id: operation.replicaId || operation.replica_id,
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
    replicaCount: 3,
    minimumRoutableReplicaCount: 1,
    targetNodeIds: [localNodeId, 'node-b', 'node-c'],
    admissionConvergence: {
      candidateTargetNodeIds: [localNodeId, 'node-b', 'node-c'],
      admittedTargetNodeIds: [localNodeId],
      rejectedTargetNodePlans: [
        {
          targetNodeId: 'node-b',
          decisionType: 'deferred',
          blockingReasons: ['control_plane_write_unhealthy'],
          reasonCodes: ['control_plane_write_unhealthy'],
        },
        {
          targetNodeId: 'node-c',
          decisionType: 'deferred',
          blockingReasons: ['control_plane_write_unhealthy'],
          reasonCodes: ['control_plane_write_unhealthy'],
        },
      ],
      maximumProvisionableReplicaCount: 1,
    },
  });

  t.same(
    checkedTargetNodeIds,
    [],
    'prechecked child bootstrap should not re-run explicit target admission before planning',
  );
  t.same(
    createdTargetMoves,
    [{
      nodeId: localNodeId,
      skipProvisioningAdmissionRecheck: true,
    }],
    'bootstrap creation should reuse the admitted precheck target instead of re-admitting it',
  );
  t.same(
    executedTargetNodeIds,
    [localNodeId],
    'bootstrap creation should proceed on the pre-admitted child target',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition fails when the full ' +
  'initial replica cohort never becomes routable', async (t) => {
  const tableId = 'tbl-initial-quorum';
  const partitionId = 'tbl-initial-quorum-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'fast_return'}];
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
      if (targetNodeId === localNodeId) {
        services.push({
          partition_id: operation.partitionId,
          service_type: 'partition',
          status: 'active',
          node_id: targetNodeId,
          raft_role: 'leader',
          address: `${targetNodeId}/partition/${operation.partitionId}`,
        });
        return {success: true};
      }
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    controlPlaneReadinessService: createProvisioningReadyService(nodes),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  const startedAt = Date.now();
  await t.rejects(
    engine.provisionInitialTablePartition({
      tableId,
      partitionId,
      replicaCount: 3,
    }),
    new Error(`Timed out waiting for routable partition service for partition ${partitionId}`),
    'initial table creation should fail loudly when the full routable cohort never appears',
  );
  const durationMs = Date.now() - startedAt;

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'provisioning should attempt all target nodes',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    1,
    'only the local replica should have become routable in the regression setup',
  );
  t.ok(
    durationMs >= 40 && durationMs < 1000,
    'provisioning should fail on the configured timeout instead of succeeding early',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition defers active service ' +
  'enforcement to the routable cohort wait after metadata repair', async (t) => {
  const tableId = 'tbl-routable-cache-repair';
  const partitionId = 'tbl-routable-cache-repair-p1';
  const replicaId = `${partitionId}-r1`;
  const localNodeId = 'node-a';
  const nodes = [{node_id: localNodeId, status: 'active'}];
  const tables = [{table_id: tableId, table_name: 'benchmark_partition_split_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [{
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    service_type: 'partition',
    status: 'creating',
    node_id: localNodeId,
    address: `${localNodeId}/partition/${replicaId}`,
  }];
  const cacheWaitCalls = [];
  let sleepCalls = 0;

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
      if (type === TABLES.SERVICES) {
        return services.some((row) =>
          row.service_id === key || row.replica_id === key,
        );
      }
      return false;
    },
    get(type, key) {
      if (type === TABLES.TABLES) {
        return tables.find((row) =>
          row.table_id === key || row.table_name === key,
        ) || null;
      }
      if (type === TABLES.SERVICES) {
        return services.find((row) =>
          row.service_id === key || row.replica_id === key,
        ) || null;
      }
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
        operationId: 'op-routable-cache-repair',
        replicaId,
        ...move,
      };
    },
    async executeOperation() {
      return {success: true};
    },
  };

  const cdcIntegrationService = {
    async waitForCacheUpdate(tableName, key, expectPresent, options = {}) {
      cacheWaitCalls.push({
        tableName,
        key,
        expectPresent,
        options,
      });
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    controlPlaneReadinessService: createProvisioningReadyService(nodes),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    cdcIntegrationService,
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 5,
  });
  engine.sleep = async () => {
    sleepCalls += 1;
    services[0] = {
      ...services[0],
      status: 'active',
      raft_role: 'leader',
    };
  };
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 1,
  });

  t.equal(
    cacheWaitCalls.length,
    0,
    'visible service rows should skip authoritative metadata repair and defer active enforcement to the routable wait',
  );
  t.equal(
    services[0]?.status,
    'active',
    'the later routable cohort wait should still require the service row to become active',
  );
  t.ok(
    sleepCalls > 0,
    'provisioning should keep polling the routable cohort after metadata visibility is repaired',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition starts replica metadata ' +
  'waits in parallel under one timeout budget', async (t) => {
  const tableId = 'tbl-parallel-replica-metadata-waits';
  const partitionId = 'tbl-parallel-replica-metadata-waits-p1';
  const localNodeId = 'node-a';
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_partition_split_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [];
  const metadataWaitBudgetByReplicaId = new Map();
  let nextReplicaOrdinal = 0;
  let fakeNowMs = 1000;

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
      nextReplicaOrdinal += 1;
      return {
        operationId: `op-${nextReplicaOrdinal}`,
        replicaId: `${partitionId}-r${nextReplicaOrdinal}`,
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
    tablePartitionProvisioningTimeoutMs: 35,
    tablePartitionProvisioningPollIntervalMs: 5,
    nowFn: () => fakeNowMs,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};
  engine.waitForPartitionServiceMetadata = async (replicaId, timeoutBudget) => {
    const remainingBudgetMsAtStart = timeoutBudget.deadlineMs - fakeNowMs;
    metadataWaitBudgetByReplicaId.set(
      replicaId,
      remainingBudgetMsAtStart,
    );

    await Promise.resolve();

    const requiredBudgetMs = replicaId.endsWith('-r1') ? 30 : 10;
    if (remainingBudgetMsAtStart < requiredBudgetMs) {
      throw new Error(
        `Timed out waiting for partition service metadata for replica ${replicaId}`,
      );
    }
    fakeNowMs += requiredBudgetMs;
  };

  await t.resolves(
    engine.provisionInitialTablePartition({
      tableId,
      partitionId,
      replicaCount: 2,
      targetNodeIds: [localNodeId, 'node-b'],
    }),
    'metadata waits should not be serialized behind one another',
  );

  t.equal(
    metadataWaitBudgetByReplicaId.size,
    2,
    'provisioning should wait for both created replicas',
  );
  t.same(
    [...metadataWaitBudgetByReplicaId.values()].sort((a, b) => a - b),
    [35, 35],
    'each replica wait should start with the full shared deadline window',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition can stop waiting once ' +
  'the minimum routable split cohort is ready', async (t) => {
  const tableId = 'tbl-split-cohort';
  const partitionId = 'tbl-split-cohort-left';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_partition_split_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
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
      if (targetNodeId !== 'node-c') {
        services.push({
          partition_id: operation.partitionId,
          service_type: 'partition',
          status: 'active',
          node_id: targetNodeId,
          raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
          address: `${targetNodeId}/partition/${operation.partitionId}`,
        });
      }
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    controlPlaneReadinessService: createProvisioningReadyService(nodes),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  const provisionSummary = await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'split provisioning should still dispatch the full desired replica set',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    2,
    'split provisioning should only require the requested minimum routable cohort before continuing',
  );
  t.same(
    provisionSummary,
    {
      requestedReplicaCount: 3,
      resolvedReplicaCount: 3,
      minimumRoutableReplicaCount: 2,
      routableReplicaCount: 2,
      fullReplicaCountConverged: false,
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      reasonCodes: [],
      retryAfterMs: 0,
    },
    'provisioning should report quorum-only convergence when the full replica cohort is still catching up',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition tolerates one failed ' +
  'replica operation when split quorum is already satisfiable', async (t) => {
  const tableId = 'tbl-split-quorum-failure-tolerance';
  const partitionId = 'tbl-split-quorum-failure-tolerance-left';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_partition_split_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
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
      if (targetNodeId === 'node-c') {
        return {
          success: false,
          error: 'simulated split replica dispatch timeout',
        };
      }

      services.push({
        replica_id: operation.replicaId || operation.replica_id,
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
    controlPlaneReadinessService: createProvisioningReadyService(nodes),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'split provisioning should attempt the full desired replica set',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    2,
    'split provisioning should continue when quorum becomes routable despite one failed dispatch',
  );
});
