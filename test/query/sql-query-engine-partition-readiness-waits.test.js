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
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {
  COLUMN,
  SERVICE_STATUS,
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
} from '../../src/partition/partition-constants.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
} from '../../src/control-plane/timeout-budget.js';
import {
} from '../../src/control-plane/pressure-governor.js';
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
} from './routing-repair-test-helpers.js';
import {createSqlRequest} from '../../src/query/sql-request.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

import {
  createMockMessageRouter,
  createMockSystemCache,
  createProvisioningReadyService,
} from './sql-query-engine-test-support.js';


test('SQLQueryEngine - provisionInitialTablePartition waits for active leader ' +
  'routes before continuing', async (t) => {
  const tableId = 'tbl-split-active-leader';
  const partitionId = 'tbl-split-active-leader-left';
  const localNodeId = 'node-a';
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
          status: 'creating',
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
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    controlPlaneReadinessService: createProvisioningReadyService(nodes),
    tablePartitionProvisioningTimeoutMs: 80,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  const provisionPromise = engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
  });

  const earlyOutcome = await Promise.race([
    provisionPromise.then(() => 'resolved'),
    new Promise((resolve) => setTimeout(() => resolve('pending'), 15)),
  ]);

  t.equal(
    earlyOutcome,
    'pending',
    'creating split replicas must not be treated as an active leader cohort',
  );

  for (const service of services) {
    service.status = 'active';
  }

  await provisionPromise;

  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    2,
    'provisioning may continue once the active leader cohort is visible',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition accepts canonical ' +
  'partition leader routing before raft_role visibility converges', async (t) => {
  const tableId = 'tbl-split-canonical-leader';
  const partitionId = 'tbl-split-canonical-leader-left';
  const localNodeId = 'node-a';
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_partition_split_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: localNodeId,
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
      if (type === TABLES.TABLES) {
        return tables.find((row) =>
          row.table_id === key || row.table_name === key,
        ) || null;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.find((row) => row.partition_id === key) || null;
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
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        service_id: `${operation.partitionId}-${targetNodeId}`,
        status: 'active',
        node_id: targetNodeId,
        raft_role: null,
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
    controlPlaneReadinessService: createProvisioningReadyService(nodes),
    tablePartitionProvisioningTimeoutMs: 80,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 1,
  });

  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    `${localNodeId}/partition/${partitionId}`,
    'write routing should use canonical partition leader metadata while service raft_role lags',
  );
});

test('SQLQueryEngine - waitForPartitionLeaderService accepts a fresh ' +
  'bootstrap leader fallback before leader_node_id converges', async (t) => {
  const partitionId = 'tbl-bootstrap-leader-gap-p1';
  const cache = {
    partitions: [
      {
        partition_id: partitionId,
        table_id: 'tbl-bootstrap-leader-gap',
        leader_node_id: null,
        created_at: 100,
        updated_at: 100,
      },
    ],
    services: [
      {
        partition_id: partitionId,
        service_type: 'partition',
        service_id: `${partitionId}-r1`,
        status: 'active',
        node_id: 'node-a',
        raft_role: 'follower',
        address: 'node-a/partition/tbl-bootstrap-leader-gap-p1-r1',
      },
      {
        partition_id: partitionId,
        service_type: 'partition',
        service_id: `${partitionId}-r2`,
        status: 'active',
        node_id: 'node-b',
        raft_role: 'leader',
        address: 'node-b/partition/tbl-bootstrap-leader-gap-p1-r2',
      },
      {
        partition_id: partitionId,
        service_type: 'partition',
        service_id: `${partitionId}-r3`,
        status: 'active',
        node_id: 'node-c',
        raft_role: 'follower',
        address: 'node-c/partition/tbl-bootstrap-leader-gap-p1-r3',
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find((row) => row.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions;
      }
      if (type === TABLES.SERVICES) {
        return this.services;
      }
      return [];
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    tablePartitionProvisioningTimeoutMs: 80,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  await t.resolves(
    engine.waitForPartitionLeaderService(partitionId),
    'fresh bootstrap leader service metadata should satisfy leader wait',
  );
  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    'node-b/partition/tbl-bootstrap-leader-gap-p1-r2',
    'leader wait should expose the visible bootstrap leader route',
  );
});

test('SQLQueryEngine - waitForPartitionLeaderService accepts one bootstrap ' +
  'leader hint while service roles lag behind heartbeat publication',
async (t) => {
  const now = 510000;
  const partitionId = 'tbl-bootstrap-hint-p1';
  const localNodeId = 'node-a';
  const cache = createMockSystemCache(
    [],
    [{
      partition_id: partitionId,
      table_id: 'tbl-bootstrap-hint',
      table_name: 'tbl-bootstrap-hint',
      leader_node_id: null,
      created_at: now - 1000,
      updated_at: now - 1000,
    }],
    [
      {
        service_id: `${partitionId}-r1`,
        service_type: 'partition',
        partition_id: partitionId,
        node_id: localNodeId,
        raft_role: null,
        address: `${localNodeId}/partition/${partitionId}-r1`,
        status: 'active',
      },
      {
        service_id: `${partitionId}-r2`,
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-b',
        raft_role: 'follower',
        address: `node-b/partition/${partitionId}-r2`,
        status: 'active',
      },
      {
        service_id: `${partitionId}-r3`,
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-c',
        raft_role: 'follower',
        address: `node-c/partition/${partitionId}-r3`,
        status: 'active',
      },
    ],
    [
      {
        [COLUMN.NODE_ID]: localNodeId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: STATE.READY,
        [COLUMN.LAST_HEARTBEAT]: now - 34000,
        [COLUMN.READY_LEASE_EXPIRES_AT]: now - 19000,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 20,
        [COLUMN.DISK_USAGE_PERCENT]: 30,
      },
      {
        [COLUMN.NODE_ID]: 'node-b',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: STATE.READY,
        [COLUMN.LAST_HEARTBEAT]: now - 34000,
        [COLUMN.READY_LEASE_EXPIRES_AT]: now - 19000,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 20,
        [COLUMN.DISK_USAGE_PERCENT]: 30,
      },
      {
        [COLUMN.NODE_ID]: 'node-c',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: STATE.READY,
        [COLUMN.LAST_HEARTBEAT]: now - 34000,
        [COLUMN.READY_LEASE_EXPIRES_AT]: now - 19000,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 20,
        [COLUMN.DISK_USAGE_PERCENT]: 30,
      },
    ],
  );
  const readinessService = new ControlPlaneReadinessService({
    nodeId: localNodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState(nodeId) {
        return [localNodeId, 'node-b', 'node-c'].includes(nodeId) ?
          STATE.CONNECTED :
          STATE.DISCONNECTED;
      },
    },
    storageAccountingService: {
      async getCapacitySnapshotForNode(nodeId) {
        return {
          nodeId,
          budgetBytes: 1000,
          pressureState: 'normal',
        };
      },
    },
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics() {
        return {
          currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
          reasonCode: null,
          enteredAt: '2026-03-12T00:00:00.000Z',
          recentTransitions: [],
        };
      },
    },
    now: () => now,
  });
  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: readinessService,
    tablePartitionProvisioningTimeoutMs: 80,
    tablePartitionProvisioningPollIntervalMs: 5,
    nowFn: () => now,
  });
  engine.waitForCondition = async () => {
    throw new Error('leader wait should not poll once bootstrap leader hint is usable');
  };

  await t.resolves(
    engine.waitForPartitionLeaderService(
      partitionId,
      null,
      {
        partitionMetadata: cache.partitions[0],
        bootstrapLeaderNodeId: localNodeId,
      },
    ),
    'bootstrap leader hint should satisfy leader wait before raft_role metadata converges',
  );
  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    `${localNodeId}/partition/${partitionId}-r1`,
    'leader wait should expose the hinted bootstrap leader route',
  );
});

test('SQLQueryEngine - waitForCondition honors a predicate that flips exactly ' +
  'at the timeout boundary', async (t) => {
  const engine = new SQLQueryEngine();
  const originalDateNow = Date.now;
  let fakeNow = 1000;

  Date.now = () => fakeNow;
  engine.sleep = async (ms) => {
    fakeNow += ms;
  };

  try {
    await t.resolves(
      engine.waitForCondition(
        async () => fakeNow >= 1040,
        40,
        30,
        'boundary timeout',
      ),
      'polling should perform a final deadline check before timing out',
    );
  } finally {
    Date.now = originalDateNow;
  }
});

test('SQLQueryEngine - waitForCondition classifies exact deadline exhaustion',
  async (t) => {
    let fakeNow = 1000;
    const engine = new SQLQueryEngine({nowFn: () => fakeNow});

    engine.sleep = async (ms) => {
      fakeNow += ms;
    };

    const error = await t.rejects(
      engine.waitForCondition(
        async () => false,
        40,
        30,
        'boundary timeout',
        {
          classification:
            TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
          nestedOperation: 'boundary_wait',
        },
      ),
    );
    t.equal(error.message, 'boundary timeout');
    t.equal(
      error.timeoutClassification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT,
    );
    t.equal(
      error.timeoutClassification.originalClassification,
      TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
    );
    t.equal(error.timeoutClassification.boundaryHit, true);
    t.equal(error.timeoutClassification.configuredBudgetMs, 40);
    t.equal(error.timeoutClassification.nestedOperation, 'boundary_wait');
  });

test('SQLQueryEngine - waitForRoutablePartitionServiceCount succeeds when the ' +
  'cohort is already routable even after budget exhaustion', async (t) => {
  let fakeNow = 2000;
  const engine = new SQLQueryEngine({
    tablePartitionProvisioningPollIntervalMs: 10,
    nowFn: () => fakeNow,
  });
  const timeoutBudget = createTimeoutBudget({
    configuredBudgetMs: 30,
    now: () => 2000,
  });

  engine.getRoutablePartitionServiceNodeIds = () => ['node-a'];
  fakeNow = 2045;

  await t.resolves(
    engine.waitForRoutablePartitionServiceCount(
      'tbl-budget-boundary-p1',
      1,
      timeoutBudget,
    ),
    'already-satisfied routable cohorts should not fail on nested budget allocation',
  );
});

test('SQLQueryEngine surfaces a canonical deferred result for timed out ' +
  'CREATE TABLE requests when control-plane authority establishment is pending',
async (t) => {
  const expectedReasonCode = 'control_plane_write_unhealthy';
  const expectedFailedDimensions = [
    'controlPlaneWritable',
    'publishedConvergencePending',
  ];
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
              true,
          },
          reasons: [{code: expectedReasonCode}],
          retryAfterMs: 175,
          runtimeAuthority: {
            state: 'establishing',
            authorityAvailable: true,
            ready: false,
            visibility: {
              state: 'pending_publication',
            },
            reasonCodes: [expectedReasonCode],
          },
          priorityControlPlaneRecovery: {
            active: true,
            reasonCodes: [expectedReasonCode],
          },
        };
      },
    },
  });

  const result = engine.buildTimedOutSqlRequestFailure(
    createSqlRequest({
      statement: 'CREATE TABLE users (id TEXT PRIMARY KEY)',
      sessionId: 'timed-out-create',
    }),
    {
      message: 'Query timeout after 15000ms',
      timeoutClassification: {
        classification: TIMEOUT_BUDGET_CLASSIFICATION.QUERY_TIMEOUT,
        originalClassification: null,
      },
    },
  );

  t.equal(result?.success, false);
  t.equal(result?.error, 'query_admission_deferred');
  t.equal(result?.outcome, 'deferred');
  t.equal(result?.contractState, OWNER_CONTRACT_STATE.DEFERRED);
  t.equal(result?.nextAction, OWNER_CONTRACT_NEXT_ACTION.RETRY);
  t.equal(
    result?.visibilityState,
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE,
  );
  t.equal(result?.retryAfterMs, 175);
  t.equal(result?.reasonCode, expectedReasonCode);
  t.same(result?.reasonCodes, [expectedReasonCode]);
  t.same(result?.failedDimensions, expectedFailedDimensions);
  t.equal(result?.runtimeAuthority?.state, 'establishing');
  t.equal(result?.details?.tableName, 'users');
  t.equal(result?.details?.cause, 'Query timeout after 15000ms');
});

test('SQLQueryEngine - executeRequest forwards timeout budget to CREATE TABLE ' +
  'execution', async (t) => {
  const timeoutBudget = createTimeoutBudget({
    configuredBudgetMs: 40,
    now: () => 5000,
  });
  let receivedOptions = null;
  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
  });
  engine.tableCreationService = {
    async createTable(_ast, options = {}) {
      receivedOptions = options;
      return {
        success: true,
        operation: 'CREATE_TABLE',
        affectedRows: 0,
      };
    },
    stripPartitionDetails(result) {
      return result;
    },
  };

  const result = await engine.executeRequest({
    ...createSqlRequest({
      statement: 'CREATE TABLE users (id TEXT PRIMARY KEY)',
      sessionId: 'create-request-timeout-budget',
      tenantId: 'tenant-create-owner',
    }),
    timeoutBudget,
  });

  t.equal(result.success, true);
  t.equal(receivedOptions.timeoutBudget, timeoutBudget);
  t.equal(receivedOptions.namespace, 'tenant-create-owner');
});

test('SQLQueryEngine - waitForRoutablePartitionServiceCount accepts fresh ' +
  'bootstrap services while transport-connected heartbeat publication lags',
async (t) => {
  const now = 520000;
  const partitionId = 'tbl-bootstrap-routable-p1';
  const nodeIds = ['node-a', 'node-b', 'node-c'];
  const cache = createMockSystemCache(
    [],
    [{
      partition_id: partitionId,
      table_id: 'tbl-bootstrap-routable',
      table_name: 'tbl-bootstrap-routable',
      leader_node_id: null,
      created_at: now - 1000,
      updated_at: now - 1000,
    }],
    nodeIds.map((nodeId, index) => ({
      service_id: `${partitionId}-r${index + 1}`,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: nodeId,
      raft_role: index === 0 ? 'leader' : 'follower',
      address: `${nodeId}/partition/${partitionId}-r${index + 1}`,
      status: 'active',
    })),
    nodeIds.map((nodeId) => ({
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.LAST_HEARTBEAT]: now - 34000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 19000,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 20,
      [COLUMN.DISK_USAGE_PERCENT]: 30,
    })),
  );
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-a',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState(nodeId) {
        return nodeIds.includes(nodeId) ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: {
      async getCapacitySnapshotForNode(nodeId) {
        return {
          nodeId,
          budgetBytes: 1000,
          pressureState: 'normal',
        };
      },
    },
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics() {
        return {
          currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
          reasonCode: null,
          enteredAt: '2026-03-12T00:00:00.000Z',
          recentTransitions: [],
        };
      },
    },
    now: () => now,
  });
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: readinessService,
    tablePartitionProvisioningTimeoutMs: 80,
    tablePartitionProvisioningPollIntervalMs: 5,
    nowFn: () => now,
  });
  engine.waitForCondition = async () => {
    throw new Error('bootstrap-routable services should satisfy the count wait without polling');
  };

  await t.resolves(
    engine.waitForRoutablePartitionServiceCount(partitionId, 3),
    'fresh bootstrap services should count as routable while transport stays connected',
  );
});

test('SQLQueryEngine - waitForRoutablePartitionServiceCount awaits one ' +
  'query-executor readiness repair before polling stale routing snapshots',
async (t) => {
  const partitionId = 'tbl-routable-repair-await-p1';
  const routingSnapshot = {
    partitionId,
    reasonCode:
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
    activeAddressedServiceCount: 2,
    routingReadinessDimension: 'serveEligible',
    deniedByNodeId: {
      'node-a': {
        decisionDimension: 'serveEligible',
        reasonCodes: ['cluster_member_unhealthy'],
        failedDimensions: ['clusterMemberHealthy'],
      },
    },
  };
  let routableNodeIds = [];
  let repairCalls = 0;

  const engine = new SQLQueryEngine({
    tablePartitionProvisioningPollIntervalMs: 5,
    autoStartDistributedTransactionRecovery: false,
  });
  engine.getRoutablePartitionServiceNodeIds = () => routableNodeIds;
  engine.queryExecutor = {
    getPartitionRoutingSnapshot(receivedPartitionId) {
      t.equal(
        receivedPartitionId,
        partitionId,
        'routable wait should inspect the canonical routing snapshot for the partition',
      );
      return routingSnapshot;
    },
    async maybeAwaitDeniedPartitionRoutingRepair(snapshot) {
      repairCalls += 1;
      t.equal(
        snapshot,
        routingSnapshot,
        'routable wait should route readiness repair through the query-executor owner',
      );
      routableNodeIds = ['node-a'];
      return true;
    },
  };
  engine.waitForCondition = async () => {
    throw new Error('routable poll should not run before awaited repair');
  };

  await t.resolves(
    engine.waitForRoutablePartitionServiceCount(partitionId, 1),
    'a successful owner repair should satisfy the routable cohort wait without falling through to raw polling',
  );
  t.equal(repairCalls, 1);
});

test('SQLQueryEngine - waitForRoutablePartitionServiceCount retries routing ' +
  'repair while polling when the first repair does not converge',
async (t) => {
  const partitionId = 'tbl-routable-repair-repoll-p1';
  const routingSnapshot = {
    partitionId,
    reasonCode:
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
    activeAddressedServiceCount: 2,
    routingReadinessDimension: 'serveEligible',
    deniedByNodeId: {
      'node-a': {
        decisionDimension: 'serveEligible',
        reasonCodes: ['cluster_member_unhealthy'],
        failedDimensions: ['clusterMemberHealthy'],
      },
    },
  };
  let routableNodeIds = [];
  let repairCalls = 0;

  const engine = new SQLQueryEngine({
    tablePartitionProvisioningPollIntervalMs: 5,
    autoStartDistributedTransactionRecovery: false,
  });
  engine.getRoutablePartitionServiceNodeIds = () => routableNodeIds;
  engine.queryExecutor = {
    getPartitionRoutingSnapshot(receivedPartitionId) {
      t.equal(
        receivedPartitionId,
        partitionId,
        'repolled repair should inspect the same canonical routing snapshot',
      );
      return routingSnapshot;
    },
    async maybeAwaitDeniedPartitionRoutingRepair(snapshot) {
      repairCalls += 1;
      t.equal(
        snapshot,
        routingSnapshot,
        'repolled repair should stay routed through the query-executor owner',
      );
      if (repairCalls >= 2) {
        routableNodeIds = ['node-a'];
        return true;
      }
      return false;
    },
  };
  engine.waitForCondition = async (predicate) => {
    t.equal(
      await predicate(),
      true,
      'poll predicate should re-run readiness repair while the wait loop is active',
    );
  };

  await t.resolves(
    engine.waitForRoutablePartitionServiceCount(partitionId, 1),
    'a later routing repair during polling should still satisfy the wait',
  );
  t.equal(repairCalls, 2);
});

test('SQLQueryEngine - waitForPartitionLeaderService succeeds when leader route ' +
  'is already known even after budget exhaustion', async (t) => {
  let fakeNow = 3000;
  const engine = new SQLQueryEngine({
    tablePartitionProvisioningPollIntervalMs: 10,
    nowFn: () => fakeNow,
  });
  const timeoutBudget = createTimeoutBudget({
    configuredBudgetMs: 30,
    now: () => 3000,
  });

  engine.queryExecutor = {
    findPartitionLeaderAddress() {
      return 'node-a/partition/tbl-budget-boundary-p1-r1';
    },
  };
  fakeNow = 3045;

  await t.resolves(
    engine.waitForPartitionLeaderService(
      'tbl-budget-boundary-p1',
      timeoutBudget,
    ),
    'already-known leader routes should not fail on nested budget allocation',
  );
});
