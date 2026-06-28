import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
} from '../../src/rebalancer/storage-admission-constants.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_NODE_ID = 'node-1';
const TEST_PARTITION_ID = 'partition-1';
const TEST_TARGET_NODE_ID = 'node-4';
const TEST_EXISTING_NODE_ID = 'node-2';
const TEST_FAILED_REPLICA_ID = TEST_PARTITION_ID + '-r4';
const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
const TEST_MESSAGE_GROUP_ID = 'message-group-1';
const TEST_MESSAGE_GROUP_REPLICA_ID = TEST_MESSAGE_GROUP_ID + '-r1';
const TEST_REPLACE_OPERATION_TYPE = 'REPLACE';
const TEST_ADD_OPERATION_TYPE = 'ADD';
const TEST_FAILED_STATUS = 'failed';
const TEST_TABLE_POLICY = Object.freeze({
  replicaCount: 3,
});

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: TEST_NODE_ID},
    logging: {level: 'error'},
  });
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function createServiceRow(replicaId, nodeId, options = {}) {
  const serviceType = options.serviceType || SERVICE_TYPE.PARTITION;
  const partitionId = options.partitionId || TEST_PARTITION_ID;
  const groupId = options.groupId || null;
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    group_id: groupId,
    node_id: nodeId,
    service_type: serviceType,
    status: options.status || 'active',
    raft_role: 'follower',
    address: 'ws://' + nodeId + ':7000',
  };
}

function createSqlEngine(options = {}) {
  const {
    authoritativeServices = [],
  } = options;
  const operations = new Map();

  return {
    executeQuery: async (sql, params = []) => {
      if (sql.includes('SELECT * FROM services') &&
          sql.includes('partition_id = ?')) {
        const [, partitionId] = params;
        return {
          success: true,
          rows: authoritativeServices.filter(
            (row) => row.partition_id === partitionId,
          ),
        };
      }
      if (sql.includes('SELECT * FROM replica_operations') &&
          sql.includes('target_node_id = ?')) {
        const [partitionId, targetNodeId] = params;
        const existing = [...operations.values()].filter((operation) =>
          operation.partition_id === partitionId &&
          operation.target_node_id === targetNodeId,
        );
        return {
          success: true,
          rows: existing,
        };
      }
      if (sql.includes('SELECT * FROM replica_operations') &&
          sql.includes('entity_type = ?')) {
        const [entityType, entityId, fallbackPartitionId] = params;
        const existing = [...operations.values()].filter((operation) => {
          return operation.entity_type === entityType &&
            operation.entity_id === entityId ||
            (!operation.entity_type &&
              operation.partition_id === fallbackPartitionId);
        });
        return {
          success: true,
          rows: existing,
        };
      }
      if (sql.includes('INSERT INTO replica_operations')) {
        const [
          operationId, type, partitionId, replicaId, sourceNodeId,
          targetNodeId, status, workflowStep, createdAt, updatedAt,
          completedAt, errorMessage, stepsHistory, entityType, entityId,
        ] = params;
        operations.set(operationId, {
          operation_id: operationId,
          type,
          partition_id: partitionId,
          replica_id: replicaId,
          source_node_id: sourceNodeId,
          target_node_id: targetNodeId,
          status,
          workflow_step: workflowStep,
          created_at: createdAt,
          updated_at: updatedAt,
          completed_at: completedAt,
          error_message: errorMessage,
          steps_history: stepsHistory,
          entity_type: entityType,
          entity_id: entityId,
        });
        return {success: true, changes: 1};
      }
      if (sql.includes('SELECT * FROM replica_operations') &&
          sql.includes('operation_id = ?')) {
        const [operationId] = params;
        return {
          success: true,
          rows: operations.has(operationId) ? [operations.get(operationId)] : [],
        };
      }
      return {success: true, rows: []};
    },
    getOperations() {
      return [...operations.values()];
    },
  };
}

function createCoordinator(options = {}) {
  const cache = createMockCache({
    services: options.cacheServices || [],
  });
  const sqlEngine = createSqlEngine({
    authoritativeServices: options.authoritativeServices || [],
  });
  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    messageRouter: {
      deliver: async () => ({acknowledged: true, status: 'completed'}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => TEST_TABLE_POLICY,
    },
    sqlQueryEngine: sqlEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      systemTableCache: cache,
    }),
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async (_tableName, sql, params = []) =>
        sqlEngine.executeQuery(sql, params),
      readRows: async (_tableName, sql, params = []) =>
        sqlEngine.executeQuery(sql, params),
      executeQuery: async (sql, params = []) =>
        sqlEngine.executeQuery(sql, params),
    },
    storageAdmissionService: {
      checkAdd: async () => ({
        allowed: true,
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
      }),
      checkReplace: async () => ({
        allowed: true,
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
      }),
    },
    storageAccountingService: {
      estimateReplicaBytes: () => 1,
    },
    enableTimeouts: false,
  });
  coordinator.initialize();
  return {
    coordinator,
    sqlEngine,
  };
}

async function captureOperationCreateError(operationFactory) {
  try {
    await operationFactory();
  } catch (error) {
    return error;
  }
  throw new Error('Expected createOperation to reject');
}

test('RebalanceCoordinator blocks same-node duplicate topology creation', async (t) => {
  initializeTestEnvironment();

  const existingReplica = createServiceRow(
    TEST_PARTITION_ID + '-r2',
    TEST_EXISTING_NODE_ID,
  );
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices: [existingReplica],
  });

  const error = await captureOperationCreateError(() => coordinator.createOperation({
    type: 'ADD',
    partitionId: TEST_PARTITION_ID,
    nodeId: TEST_EXISTING_NODE_ID,
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  }));

  t.equal(
    error?.admissionResult?.decisionType,
    STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
    'createOperation should fail closed when the target node already hosts the partition',
  );
  t.same(
    error?.admissionResult?.blockingReasons,
    ['target_node_already_occupied'],
    'same-node duplicate adds should surface the occupied-target reason',
  );

  t.equal(
    sqlEngine.getOperations().length,
    0,
    'blocked topology creation should not persist a replica operation',
  );

  coordinator.shutdown();
});

test('RebalanceCoordinator blocks stale ADD when authoritative topology already satisfies target', async (t) => {
  initializeTestEnvironment();

  const cacheServices = [
    createServiceRow(TEST_PARTITION_ID + '-r1', TEST_NODE_ID),
    createServiceRow(TEST_PARTITION_ID + '-r2', TEST_EXISTING_NODE_ID),
  ];
  const authoritativeServices = [
    ...cacheServices,
    createServiceRow(TEST_PARTITION_ID + '-r3', 'node-3'),
  ];
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices,
    authoritativeServices,
  });

  const error = await captureOperationCreateError(() => coordinator.createOperation({
    type: 'ADD',
    partitionId: TEST_PARTITION_ID,
    nodeId: TEST_TARGET_NODE_ID,
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  }));

  t.equal(
    error?.admissionResult?.decisionType,
    STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
    'createOperation should fail closed when authoritative topology already satisfies the target replica count',
  );
  t.same(
    error?.admissionResult?.blockingReasons,
    ['target_replica_count_already_satisfied'],
    'stale planner adds should surface the target-satisfied reason',
  );
  t.equal(
    error?.admissionResult?.topologySnapshot?.observedDistinctNodeCount,
    3,
    'topology guard should preserve the canonical distinct-node count in diagnostics',
  );

  t.equal(
    sqlEngine.getOperations().length,
    0,
    'stale planner add should not persist a replica operation',
  );

  coordinator.shutdown();
});

test('RebalanceCoordinator blocks REPLACE when target node already has partition topology', async (t) => {
  initializeTestEnvironment();

  const cacheServices = [
    createServiceRow(TEST_SOURCE_REPLICA_ID, TEST_NODE_ID),
    createServiceRow(TEST_PARTITION_ID + '-r2', TEST_EXISTING_NODE_ID),
    createServiceRow(TEST_FAILED_REPLICA_ID, TEST_TARGET_NODE_ID, {
      status: TEST_FAILED_STATUS,
    }),
  ];
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices,
  });

  const error = await captureOperationCreateError(() => coordinator.createOperation({
    type: TEST_REPLACE_OPERATION_TYPE,
    partitionId: TEST_PARTITION_ID,
    nodeId: TEST_TARGET_NODE_ID,
    replicaId: TEST_SOURCE_REPLICA_ID,
    sourceNodeId: TEST_NODE_ID,
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  }));

  t.equal(
    error?.admissionResult?.decisionType,
    STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
    'createOperation should fail closed when REPLACE targets an occupied partition node',
  );
  t.same(
    error?.admissionResult?.blockingReasons,
    ['target_node_already_occupied'],
    'duplicate replacement target rows should surface the occupied-target reason',
  );

  t.equal(
    sqlEngine.getOperations().length,
    0,
    'blocked replacement topology creation should not persist a replica operation',
  );

  coordinator.shutdown();
});

test('RebalanceCoordinator applies topology occupancy guard to message-group creates', async (t) => {
  initializeTestEnvironment();

  const existingReplica = createServiceRow(
    TEST_MESSAGE_GROUP_REPLICA_ID,
    TEST_EXISTING_NODE_ID,
    {
      groupId: TEST_MESSAGE_GROUP_ID,
      partitionId: null,
      serviceType: SERVICE_TYPE.MESSAGE_GROUP,
    },
  );
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices: [existingReplica],
  });

  const error = await captureOperationCreateError(() => coordinator.createOperation({
    type: TEST_ADD_OPERATION_TYPE,
    partitionId: TEST_MESSAGE_GROUP_ID,
    entityType: SERVICE_TYPE.MESSAGE_GROUP,
    entityId: TEST_MESSAGE_GROUP_ID,
    nodeId: TEST_EXISTING_NODE_ID,
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  }));

  t.equal(
    error?.admissionResult?.decisionType,
    STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
    'message-group ADD should use the shared topology occupancy guard',
  );
  t.same(
    error?.admissionResult?.blockingReasons,
    ['target_node_already_occupied'],
    'message-group duplicate topology should surface the occupied-target reason',
  );

  t.equal(
    sqlEngine.getOperations().length,
    0,
    'blocked message-group topology creation should not persist a replica operation',
  );

  coordinator.shutdown();
});

// Structural goal-owner Increment 1: count-keyed critical create lane hold.
// A critical partition over its replica target on ALIVE replicas must not admit a
// new add-like op (ADD inflow OR REPLACE churn) — the lane stays held until the
// surplus drains. The net-new catch vs the existing rows-only distinct-node ADD
// guard is REPLACE (which that guard exempts), so the red-on-revert is a REPLACE.
const CRIT_PARTITION_ID = 'control_plane_publications-p1';
function critRow(replicaId, nodeId, status) {
  return createServiceRow(replicaId, nodeId, {
    partitionId: CRIT_PARTITION_ID,
    status: status || 'active',
  });
}

test('count-keyed lane HOLDS a REPLACE churn create while the critical partition is over target ' +
  'on alive replicas (red-on-revert: the rows-only ADD guard exempts REPLACE, so without the hold ' +
  'the churn is admitted)', async (t) => {
  initializeTestEnvironment();
  // 4 ACTIVE replicas on 4 ready nodes, target 3 => over target by 1.
  const rows = [
    critRow(CRIT_PARTITION_ID + '-r1', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r2', 'node-2'),
    critRow(CRIT_PARTITION_ID + '-r3', 'node-3'),
    critRow(CRIT_PARTITION_ID + '-r4', 'node-4'),
  ];
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices: rows,
    authoritativeServices: rows,
  });
  const error = await captureOperationCreateError(() => coordinator.createOperation({
    type: TEST_REPLACE_OPERATION_TYPE,
    partitionId: CRIT_PARTITION_ID,
    nodeId: 'node-5',
    replicaId: CRIT_PARTITION_ID + '-r1',
    sourceNodeId: 'node-1',
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  }));
  t.ok(error, 'over-target REPLACE churn is rejected by the count-keyed lane hold');
  t.equal(
    sqlEngine.getOperations().length,
    0,
    'the held REPLACE churn create persists no replica operation',
  );
  coordinator.shutdown();
});

test('count-keyed lane ALIVE-GUARD: a FAILED replica does not count toward the alive occupancy, so ' +
  'a legitimate re-placement REPLACE is admitted (the hold never over-blocks a dead-replica fix)',
  async (t) => {
    initializeTestEnvironment();
    // 3 ACTIVE on ready nodes + 1 FAILED => 4 rows but alive-occupancy 3 == target.
    const rows = [
      critRow(CRIT_PARTITION_ID + '-r1', 'node-1'),
      critRow(CRIT_PARTITION_ID + '-r2', 'node-2'),
      critRow(CRIT_PARTITION_ID + '-r3', 'node-3'),
      critRow(CRIT_PARTITION_ID + '-r4', 'node-4', TEST_FAILED_STATUS),
    ];
    const {coordinator, sqlEngine} = createCoordinator({
      cacheServices: rows,
      authoritativeServices: rows,
    });
    await coordinator.createOperation({
      type: TEST_REPLACE_OPERATION_TYPE,
      partitionId: CRIT_PARTITION_ID,
      nodeId: 'node-5',
      replicaId: CRIT_PARTITION_ID + '-r4',
      sourceNodeId: 'node-4',
      emitOperationCreated: false,
      enforceConcurrentOperationBudget: true,
    });
    t.equal(
      sqlEngine.getOperations().length,
      1,
      'alive-occupancy at target (failed replica excluded) admits the re-placement REPLACE',
    );
    coordinator.shutdown();
  });
