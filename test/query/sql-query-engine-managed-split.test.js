/**
 * SQL Query Engine Tests
 * Tests for the main SQL query processing entry point.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  TABLES,
} from '../../src/constants/index.js';
import {
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
} from '../../src/control-plane/timeout-budget.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

import {
  createMockMessageRouter,
  createMockSystemCache,
  createAdmittedSplitAdmissionService,
  createProvisioningReadyService,
} from './sql-query-engine-test-support.js';


const TABLE_PARTITION_METADATA_WAIT_TIMEOUT_DRIFT_MS = 1;


test('SQLQueryEngine - provisionInitialTablePartition includes active-service ' +
  'nodes despite transient disconnected cache state', async (t) => {
  const tableId = 'tbl-benchmark';
  const partitionId = 'tbl-benchmark-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active', connection_state: 'ready'},
    {node_id: 'node-b', status: 'active', connection_state: 'connected'},
    {node_id: 'node-c', status: 'active', connection_state: 'disconnected'},
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_events'}];
  const partitions = [{partition_id: partitionId, table_id: tableId}];
  const services = [{
    service_id: 'mg-1-r3',
    service_type: 'message_group',
    status: 'active',
    node_id: 'node-c',
    address: 'node-c/message-group/mg-1-r3',
  }];

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
    controlPlaneReadinessService: createProvisioningReadyService(nodes),
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
    ['node-a', 'node-b', 'node-c'],
    'provisioning should not silently drop active-service nodes',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition excludes active-service ' +
  'nodes with expired ready leases', async (t) => {
  const tableId = 'tbl-benchmark';
  const partitionId = 'tbl-benchmark-p1';
  const localNodeId = 'node-a';
  const now = Date.now();
  const createdTargetNodeIds = [];
  const nodes = [
    {
      node_id: localNodeId,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: now + 60000,
    },
    {
      node_id: 'node-b',
      status: 'active',
      connection_state: 'connected',
      ready_lease_expires_at: now + 60000,
    },
    {
      node_id: 'node-c',
      status: 'active',
      connection_state: 'disconnected',
      ready_lease_expires_at: now - 1000,
    },
    {
      node_id: 'node-d',
      status: 'active',
      connection_state: 'connected',
      ready_lease_expires_at: now + 60000,
    },
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [{
    service_id: 'mg-1-r3',
    service_type: 'message_group',
    status: 'active',
    node_id: 'node-c',
    address: 'node-c/message-group/mg-1-r3',
  }];

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
    controlPlaneReadinessService: createProvisioningReadyService(
      () => nodes.filter((node) => node.ready_lease_expires_at >= now),
    ),
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
    ['node-a', 'node-b', 'node-d'],
    'provisioning should refuse active-service nodes whose ready lease expired',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition falls back to active ' +
  'service nodes when ready leases are stale', async (t) => {
  const tableId = 'tbl-ready-lease-fallback';
  const partitionId = 'tbl-ready-lease-fallback-p1';
  const localNodeId = 'node-a';
  const now = Date.now();
  const createdTargetNodeIds = [];
  const nodes = [
    {
      node_id: localNodeId,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: now + 60000,
    },
    {
      node_id: 'node-b',
      status: 'active',
      connection_state: 'connected',
      ready_lease_expires_at: now - 1000,
    },
    {
      node_id: 'node-c',
      status: 'active',
      connection_state: 'connected',
      ready_lease_expires_at: now - 1000,
    },
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [
    {
      service_id: 'mg-1-r2',
      service_type: 'message_group',
      status: 'active',
      node_id: 'node-b',
      address: 'node-b/message-group/mg-1-r2',
    },
    {
      service_id: 'mg-1-r3',
      service_type: 'message_group',
      status: 'active',
      node_id: 'node-c',
      address: 'node-c/message-group/mg-1-r3',
    },
  ];

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
    controlPlaneReadinessService: createProvisioningReadyService(nodes),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 1,
  });

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'provisioning should avoid timeout by using active-service ownership for stale leases',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition does not block on stale ' +
  'table/partition cache metadata', async (t) => {
  const partitionId = 'tbl-stale-cache-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active', connection_state: 'ready'},
    {node_id: 'node-b', status: 'active', connection_state: 'ready'},
  ];
  const services = [];

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
    tablePartitionProvisioningTimeoutMs: 500,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  await engine.provisionInitialTablePartition({
    tableId: 'tbl-stale-cache',
    partitionId,
    replicaCount: 2,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b'],
    'provisioning should continue even when table/partition rows are not yet visible in cache',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    2,
    'provisioning should still create routable replicas',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition honors explicit ' +
  'targetNodeIds for split child provisioning', async (t) => {
  const partitionId = 'tbl-split-child-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active', connection_state: 'ready'},
    {node_id: 'node-b', status: 'active', connection_state: 'disconnected'},
  ];
  const services = [];

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
    tableId: 'tbl-split-child',
    partitionId,
    replicaCount: 2,
    minimumRoutableReplicaCount: 2,
    targetNodeIds: ['node-a', 'node-b'],
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b'],
    'explicit split targets should be used even when readiness filtering is stricter',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    2,
    'provisioning should establish a quorum-ready child cohort from explicit targets',
  );
});

test('SQLQueryEngine - only evaluates local leader partitions for managed splits',
  async (t) => {
    const cache = createMockSystemCache(
      [{
        table_id: 'tbl-users',
        table_name: 'users',
        partition_key: 'id',
        active_partition_version: 1,
      }],
      [
        {
          partition_id: 'users-p1',
          table_id: 'tbl-users',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: 'm',
          partition_version: 1,
          leader_node_id: 'node-a',
        },
        {
          partition_id: 'users-p2',
          table_id: 'tbl-users',
          table_name: 'users',
          partition_key_start: 'm',
          partition_key_end: null,
          partition_version: 1,
          leader_node_id: 'node-b',
        },
      ],
    );

    const engine = new SQLQueryEngine({
      nodeId: 'node-a',
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    t.same(
      engine.listManagedSplitPartitions().map((partition) => partition.partition_id),
      ['users-p1'],
    );
  });

test('SQLQueryEngine - includes retryable failed managed split transitions ' +
  'in local leader evaluation', async (t) => {
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: PARTITION_TRANSITION_STATE.FAILED,
      partition_transition_metadata: JSON.stringify({
        workflowId: 'split-tbl-users-users-p1-v2',
        failure: {
          classification: 'split_execution_failure',
          message:
            'Timed out waiting for routable partition service for partition ' +
            'users-p-right',
          timeoutClassification: {
            classification:
              TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
          },
        },
      }),
    }],
    [{
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      leader_node_id: 'node-a',
    }],
  );

  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  t.same(
    engine.listManagedSplitPartitions().map((partition) => partition.partition_id),
    ['users-p1'],
    'retryable failed split transitions should not drop the source partition out of managed split evaluation',
  );
});

test('SQLQueryEngine - executeManagedSplit rejects non-leader callers', async (t) => {
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }],
    [{
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      replica_count: 1,
      leader_node_id: 'node-a',
    }],
  );

  const engine = new SQLQueryEngine({
    nodeId: 'node-b',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
      async upsertSystemTableRow() {
        return {success: true};
      },
    },
    partitionSplitMergeManager: {
      async splitPartition() {
        return {
          medianKey: 'm',
          leftPartition: {
            partitionId: 'users-p-left',
            keyRange: {start: null, end: 'm'},
          },
          rightPartition: {
            partitionId: 'users-p-right',
            keyRange: {start: 'm', end: null},
          },
        };
      },
    },
  });
  engine.provisionInitialTablePartition = async () => {};
  engine.startSplitReplicationOnSourcePartition = async () => {};

  await t.rejects(
    engine.executeManagedSplit('users-p1'),
    /leader/i,
  );
});

test('SQLQueryEngine - executeManagedSplit delegates to the injected managed split owner',
  async (t) => {
    const calls = [];
    const engine = new SQLQueryEngine({
      managedSplitWorkflow: {
        async execute(partitionId) {
          calls.push(partitionId);
          return {success: true, partitionId};
        },
      },
    });

    const result = await engine.executeManagedSplit('users-p1');

    t.same(calls, ['users-p1']);
    t.same(result, {success: true, partitionId: 'users-p1'});
  });

test('SQLQueryEngine - waitForTablePartitionMetadata reuses CDC cache repair waits',
  async (t) => {
    const waitCalls = [];
    const engine = new SQLQueryEngine({
      systemCache: {
        onCacheChange() {},
      },
      cdcIntegrationService: {
        async waitForCacheUpdate(tableName, key, expectPresent, options) {
          waitCalls.push({tableName, key, expectPresent, options});
        },
      },
    });

    await engine.waitForTablePartitionMetadata('tbl-users', 'users-p-left');

    t.equal(waitCalls.length, 2);
    t.same(waitCalls.map((call) => ({
      tableName: call.tableName,
      key: call.key,
      expectPresent: call.expectPresent,
      fallbackPhase: call.options?.fallbackPhase,
    })), [
      {
        tableName: TABLES.PARTITIONS,
        key: 'users-p-left',
        expectPresent: true,
        fallbackPhase: 'steady_state',
      },
      {
        tableName: TABLES.TABLES,
        key: 'tbl-users',
        expectPresent: true,
        fallbackPhase: 'steady_state',
      },
    ]);
    for (const call of waitCalls) {
      t.ok(
        call.options?.timeoutMs <= engine.tablePartitionProvisioningTimeoutMs &&
        call.options?.timeoutMs >=
          engine.tablePartitionProvisioningTimeoutMs -
            TABLE_PARTITION_METADATA_WAIT_TIMEOUT_DRIFT_MS,
        'nested cache wait should receive the full default budget minus at most one scheduling tick',
      );
    }
  });

test('SQLQueryEngine - waitForTablePartitionMetadata uses remaining budget ' +
  'for nested cache waits', async (t) => {
  const waitCalls = [];
  const nowMs = 1012;
  const parentBudget = createTimeoutBudget({
    configuredBudgetMs: 30,
    startedAtMs: 1000,
    now: () => 1000,
  });
  const engine = new SQLQueryEngine({
    systemCache: {
      onCacheChange() {},
    },
    cdcIntegrationService: {
      async waitForCacheUpdate(tableName, key, expectPresent, options) {
        waitCalls.push({tableName, key, expectPresent, options});
      },
    },
    nowFn: () => nowMs,
  });

  await engine.waitForTablePartitionMetadata(
    'tbl-users',
    'users-p-left',
    parentBudget,
  );

  t.equal(waitCalls.length, 2);
  t.equal(waitCalls[0].options.timeoutMs, 18);
  t.equal(waitCalls[1].options.timeoutMs, 18);
});

test('SQLQueryEngine - executeManagedSplit dispatches both child metadata writes ' +
  'before waiting for child visibility', async (t) => {
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }],
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
    ],
  );

  let resolveLeftInsert;
  const leftInsertPromise = new Promise((resolve) => {
    resolveLeftInsert = resolve;
  });
  let notifyLeftInsertStarted;
  const leftInsertStarted = new Promise((resolve) => {
    notifyLeftInsertStarted = resolve;
  });
  const childInsertCalls = [];
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: {
      storageAdmissionService: createAdmittedSplitAdmissionService(),
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row, options = {}) {
        childInsertCalls.push({
          tableName,
          partitionId: row.partition_id,
          options,
        });
        if (row.partition_id === 'users-p-left') {
          notifyLeftInsertStarted();
          await leftInsertPromise;
        }
        return {success: true};
      },
      async upsertSystemTableRow(tableName, row, options = {}) {
        if (tableName === TABLES.PARTITIONS) {
          childInsertCalls.push({
            tableName,
            partitionId: row.partition_id,
            options,
          });
          if (row.partition_id === 'users-p-left') {
            notifyLeftInsertStarted();
            await leftInsertPromise;
          }
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
  engine.waitForTablePartitionMetadata = async () => {};
  engine.provisionInitialTablePartition = async () => {};
  engine.startSplitReplicationOnSourcePartition = async () => {};

  const splitPromise = engine.executeManagedSplit('users-p1');
  await leftInsertStarted;

  t.equal(
    childInsertCalls.length,
    2,
    'both child metadata writes should be dispatched before the first insert resolves',
  );
  t.same(
    childInsertCalls.map((call) => call.partitionId),
    ['users-p-left', 'users-p-right'],
    'managed split should enqueue both child partition rows before waiting',
  );
  t.same(
    childInsertCalls.map((call) => call.options.skipCacheWait),
    [true, true],
    'child metadata writes should skip per-row cache waits and defer visibility gating',
  );

  resolveLeftInsert();
  await splitPromise;
});

test('SQLQueryEngine - executeManagedSplit provisions child partitions with ' +
  'a quorum-ready cohort before backfill', async (t) => {
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }],
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
    ],
  );

  const provisionCalls = [];
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    controlPlaneReadinessService: createProvisioningReadyService(() =>
      cache.getAll(TABLES.SERVICES).map((row) => ({
        node_id: row.node_id,
        status: row.status,
      })),
    ),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: {
      storageAdmissionService: createAdmittedSplitAdmissionService(),
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
      async upsertSystemTableRow() {
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
  engine.waitForTablePartitionMetadata = async () => {};
  engine.provisionInitialTablePartition = async (context) => {
    provisionCalls.push(context);
  };
  engine.startSplitReplicationOnSourcePartition = async () => {};

  await engine.executeManagedSplit('users-p1');

  t.equal(provisionCalls.length, 2, 'both child partitions should be provisioned');
  t.same(
    provisionCalls.map((context) => context.minimumRoutableReplicaCount),
    [2, 2],
    'managed split should wait for a quorum-ready child cohort instead of the full replica count before starting backfill',
  );
});

test('SQLQueryEngine - executeManagedSplit spreads child bootstrap cohorts ' +
  'across newly eligible nodes when the split target pool is wider than one replica set',
async (t) => {
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }],
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

  const provisionCalls = [];
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    controlPlaneReadinessService: createProvisioningReadyService(cache),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: {
      storageAdmissionService: createAdmittedSplitAdmissionService(),
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
      async upsertSystemTableRow() {
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
  engine.waitForTablePartitionMetadata = async () => {};
  engine.provisionInitialTablePartition = async (context) => {
    provisionCalls.push(context);
  };
  engine.startSplitReplicationOnSourcePartition = async () => {};

  await engine.executeManagedSplit('users-p1');

  t.same(
    provisionCalls.map((context) => context.targetNodeIds),
    [
      ['node-a', 'node-d', 'node-e', 'node-f', 'node-g', 'node-b', 'node-c'],
      ['node-a', 'node-f', 'node-g', 'node-d', 'node-e', 'node-b', 'node-c'],
    ],
    'child provisioning should preserve a wider admitted split pool as ordered fallbacks instead of collapsing to one fixed cohort',
  );
});
