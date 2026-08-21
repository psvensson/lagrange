import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
} from '../../src/rebalancer/storage-admission-constants.js';
import {buildReplicaInventorySnapshot} from '../../src/rebalancer/replica-inventory.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const ReplicaStatusForTest = {REMOVING: 'removing'};
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
        const [entityType, entityId] = params;
        const existing = [...operations.values()].filter((operation) =>
          operation.entity_type === entityType &&
          operation.entity_id === entityId);
        return {
          success: true,
          rows: existing,
        };
      }
      if (sql.includes('INSERT INTO replica_operations')) {
        const [
          operationId, type, partitionId, replicaId, targetClaimKey,
          sourceNodeId, targetNodeId, status, workflowStep, createdAt,
          updatedAt, completedAt, errorMessage, stepsHistory, entityType,
          entityId,
        ] = params;
        operations.set(operationId, {
          operation_id: operationId,
          type,
          partition_id: partitionId,
          replica_id: replicaId,
          target_claim_key: targetClaimKey,
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
    nodes: options.cacheNodes || [],
    services: options.cacheServices || [],
    partitions: options.cachePartitions || [],
  });
  const sqlEngine = createSqlEngine({
    authoritativeServices: options.authoritativeServices || [],
  });
  const baseReadinessService = createMockControlPlaneReadinessService({
    systemTableCache: cache,
  });
  const controlPlaneReadinessService =
    options.controlPlaneReadinessService ||
    (options.startupAuthority ?
      {
        ...baseReadinessService,
        getStartupAuthoritySnapshotSync: () => options.startupAuthority,
      } :
      baseReadinessService);
  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    messageRouter: options.messageRouter || {
      deliver: async () => ({acknowledged: true, status: 'completed'}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => TEST_TABLE_POLICY,
    },
    sqlQueryEngine: sqlEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService,
    controlPlaneSystemTableGateway: options.controlPlaneSystemTableGateway || {
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
    replicaInventoryBuilder: options.replicaInventoryBuilder,
    nowFn: options.nowFn,
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

test('RebalanceCoordinator topology guard invokes the injected inventory owner',
  async (t) => {
    initializeTestEnvironment();
    let inventoryBuildCount = 0;
    const inventoryBuilder = (options) => {
      inventoryBuildCount += 1;
      return buildReplicaInventorySnapshot(options);
    };
    const {coordinator} = createCoordinator({
      cacheServices: [
        createServiceRow(TEST_SOURCE_REPLICA_ID, TEST_TARGET_NODE_ID),
      ],
      replicaInventoryBuilder: inventoryBuilder,
    });

    await captureOperationCreateError(() => coordinator.createOperation({
      type: TEST_ADD_OPERATION_TYPE,
      partitionId: TEST_PARTITION_ID,
      nodeId: TEST_TARGET_NODE_ID,
      emitOperationCreated: false,
      enforceConcurrentOperationBudget: true,
    }));

    t.equal(inventoryBuildCount, 1,
      'create-time occupancy and target census share one canonical capture');
    coordinator.shutdown();
  },
);

test('RebalanceCoordinator fails topology increase closed when owner rows are unavailable',
  async (t) => {
    initializeTestEnvironment();
    const unavailable = async () => ({
      success: false,
      rows: [],
      error: 'owner unavailable',
    });
    const {coordinator} = createCoordinator({
      cacheServices: [
        createServiceRow(TEST_SOURCE_REPLICA_ID, TEST_NODE_ID),
      ],
      controlPlaneSystemTableGateway: {
        readAuthoritativeRows: unavailable,
        readRows: unavailable,
        executeQuery: unavailable,
      },
    });

    const error = await captureOperationCreateError(() =>
      coordinator.createOperation({
        type: TEST_ADD_OPERATION_TYPE,
        partitionId: TEST_PARTITION_ID,
        nodeId: TEST_TARGET_NODE_ID,
        emitOperationCreated: false,
        enforceConcurrentOperationBudget: true,
      }),
    );

    t.same(error?.admissionResult?.blockingReasons,
      ['replica_inventory_unusable'],
      'cache presence cannot turn unavailable owner evidence into empty');
    coordinator.shutdown();
  },
);

test(
  'RebalanceCoordinator does not fabricate inventory skew from slow ' +
    'successful reads without source timestamps',
  async (t) => {
    initializeTestEnvironment();
    let nowMs = 10_000;
    const authoritativeServices = [
      createServiceRow(TEST_SOURCE_REPLICA_ID, TEST_NODE_ID),
    ];
    const slowSuccessfulGateway = {
      readAuthoritativeRows: async (tableName) => {
        nowMs += 1_500;
        if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
          return {success: true, rows: []};
        }
        return {success: true, rows: authoritativeServices};
      },
      readRows: async () => ({success: true, rows: authoritativeServices}),
      executeQuery: async () => ({success: true, rows: []}),
    };
    const {coordinator} = createCoordinator({
      cacheServices: authoritativeServices,
      controlPlaneSystemTableGateway: slowSuccessfulGateway,
      nowFn: () => nowMs,
    });

    const snapshot = await coordinator.buildTopologyGuardSnapshot({
      normalizedMoveType: TEST_REPLACE_OPERATION_TYPE,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: TEST_PARTITION_ID,
      partitionId: TEST_PARTITION_ID,
      move: {
        nodeId: TEST_TARGET_NODE_ID,
        enforceConcurrentOperationBudget: true,
      },
    });

    t.equal(snapshot.state, 'allowed',
      'read duration alone cannot make a successful inventory unusable');
    t.equal(snapshot.admissionResult, null,
      'the recovery REPLACE remains admissible');
    coordinator.shutdown();
  },
);

test(
  'RebalanceCoordinator admits only declared concentrated-ledger recovery ' +
    'moves when the services owner is circularly unavailable',
  async (t) => {
    initializeTestEnvironment();
    const ledgerId = 'replica_operations-p1';
    const seed = 'seed';
    const spreadNode = 'spread-node';
    const firstReadyTarget = 'first-ready-target';
    const targetNode = 'target-node';
    const staleTransportTarget = 'stale-transport-target';
    const nonAuthorityTarget = 'non-authority-target';
    const unreadyNode = 'unready-node';
    const services = [
      createServiceRow(`${ledgerId}-r1`, seed, {partitionId: ledgerId}),
      createServiceRow(`${ledgerId}-r2`, seed, {partitionId: ledgerId}),
      createServiceRow(`${ledgerId}-r3`, spreadNode, {partitionId: ledgerId}),
    ];
    const unavailable = async () => ({
      success: false,
      rows: [],
      error: 'services owner unavailable during ledger recovery',
    });
    const ownerRead = async (tableName) =>
      tableName === 'services' ?
        unavailable() :
        {success: true, rows: []};
    const {coordinator} = createCoordinator({
      cacheNodes: [
        seed,
        spreadNode,
        firstReadyTarget,
        targetNode,
        staleTransportTarget,
        nonAuthorityTarget,
      ].map((nodeId) => ({
        node_id: nodeId,
        status: 'active',
        connection_state:
          [
            targetNode,
            staleTransportTarget,
            nonAuthorityTarget,
          ].includes(nodeId) ?
            'connected' :
            'ready',
      })),
      cacheServices: services,
      cachePartitions: [{partition_id: ledgerId, replica_count: 3}],
      startupAuthority: {
        authorityAvailable: true,
        canonicalStartupNodeIds: [
          seed,
          spreadNode,
          firstReadyTarget,
          targetNode,
          staleTransportTarget,
        ],
      },
      messageRouter: {
        deliver: async () => ({acknowledged: true, status: 'completed'}),
        getConnectionState: (nodeId) =>
          nodeId === staleTransportTarget ? 'disconnected' : 'connected',
      },
      controlPlaneSystemTableGateway: {
        readAuthoritativeRows: ownerRead,
        readRows: ownerRead,
        executeQuery: async () => ({success: true, rows: []}),
      },
    });
    const context = {
      normalizedMoveType: TEST_REPLACE_OPERATION_TYPE,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: ledgerId,
      partitionId: ledgerId,
      move: {
        nodeId: targetNode,
        replicaId: `${ledgerId}-r2`,
        enforceConcurrentOperationBudget: true,
      },
    };

    const recovery = await coordinator.buildTopologyGuardSnapshot(context);
    t.equal(recovery.state, 'allowed',
      'the count-neutral ledger spread cure breaks the owner-read circularity');

    const occupied = await coordinator.buildTopologyGuardSnapshot({
      ...context,
      move: {...context.move, nodeId: spreadNode},
    });
    t.equal(occupied.state, 'target_node_occupied',
      'the exception never permits two replicas on one node');

    const missingSource = await coordinator.buildTopologyGuardSnapshot({
      ...context,
      move: {...context.move, replicaId: `${ledgerId}-missing`},
    });
    t.equal(missingSource.state, 'inventory_unusable',
      'the recovery REPLACE must be anchored to an actual source row');

    const nonHotSource = await coordinator.buildTopologyGuardSnapshot({
      ...context,
      move: {...context.move, replicaId: `${ledgerId}-r3`},
    });
    t.equal(nonHotSource.state, 'inventory_unusable',
      'a voter off the hottest node is not the quorum-spread cure');

    const genericAdd = await coordinator.buildTopologyGuardSnapshot({
      ...context,
      normalizedMoveType: TEST_ADD_OPERATION_TYPE,
      move: {...context.move, replicaId: null},
    });
    t.equal(genericAdd.state, 'allowed',
      'a canonical live pre-ready target breaks circularity without another REPLACE');

    const firstFeasibleAdd = await coordinator.buildTopologyGuardSnapshot({
      ...context,
      normalizedMoveType: TEST_ADD_OPERATION_TYPE,
      move: {
        ...context.move,
        nodeId: firstReadyTarget,
        replicaId: null,
      },
    });
    t.equal(firstFeasibleAdd.state, 'allowed',
      'the first ready unoccupied target remains a valid cure');

    const unreadyAdd = await coordinator.buildTopologyGuardSnapshot({
      ...context,
      normalizedMoveType: TEST_ADD_OPERATION_TYPE,
      move: {
        ...context.move,
        nodeId: unreadyNode,
        replicaId: null,
      },
    });
    t.equal(unreadyAdd.state, 'inventory_unusable',
      'the circularity exception must not admit an unready target');

    const staleTransportAdd = await coordinator.buildTopologyGuardSnapshot({
      ...context,
      normalizedMoveType: TEST_ADD_OPERATION_TYPE,
      move: {
        ...context.move,
        nodeId: staleTransportTarget,
        replicaId: null,
      },
    });
    t.equal(staleTransportAdd.state, 'inventory_unusable',
      'startup authority cannot replace live transport evidence');

    const nonAuthorityAdd = await coordinator.buildTopologyGuardSnapshot({
      ...context,
      normalizedMoveType: TEST_ADD_OPERATION_TYPE,
      move: {
        ...context.move,
        nodeId: nonAuthorityTarget,
        replicaId: null,
      },
    });
    t.equal(nonAuthorityAdd.state, 'inventory_unusable',
      'live CONNECTED evidence cannot replace startup authority membership');
    coordinator.shutdown();
  },
);

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

test('count-keyed lane consumes canonical identity deduplication', async (t) => {
  initializeTestEnvironment();
  const first = critRow(CRIT_PARTITION_ID + '-r1', 'node-1');
  const rows = [
    first,
    {...first},
    critRow(CRIT_PARTITION_ID + '-r2', 'node-2'),
    critRow(CRIT_PARTITION_ID + '-r3', 'node-3'),
  ];
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices: rows,
    authoritativeServices: rows,
  });

  const operation = await coordinator.createOperation({
    type: TEST_REPLACE_OPERATION_TYPE,
    partitionId: CRIT_PARTITION_ID,
    nodeId: 'node-5',
    replicaId: CRIT_PARTITION_ID + '-r1',
    sourceNodeId: 'node-1',
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  });

  t.ok(operation,
    'duplicate observations of one identity do not manufacture a surplus');
  t.equal(sqlEngine.getOperations().length, 1,
    'critical lane output depends on canonical inventory deduplication');
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

test('count-keyed lane HOLDS a REPLACE churn create when the surplus is a draining (REMOVING) source ' +
  '-- the real over-replication signature: 3 active + 1 removing source on ready nodes is over target', async (t) => {
  initializeTestEnvironment();
  // 3 ACTIVE + 1 REMOVING (a REPLACE source-removal whose drain lags) = physically
  // over target 3. Active-only counting would miss the removing source (the bug);
  // occupancy (active + removing) sees 4 > 3 and holds the next churn create.
  const rows = [
    critRow(CRIT_PARTITION_ID + '-r1', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r2', 'node-2'),
    critRow(CRIT_PARTITION_ID + '-r3', 'node-3'),
    critRow(CRIT_PARTITION_ID + '-r4', 'node-4', ReplicaStatusForTest.REMOVING),
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
  t.ok(error, 'a draining (removing) source keeps the partition over target -> churn create is held');
  t.equal(sqlEngine.getOperations().length, 0, 'the held churn create persists no replica operation');
  coordinator.shutdown();
});

// --- count-keyed lane: priority-spread cure ADD exemption ---
// The planner refuses to drain the surplus while its one retained spread-cure
// ADD is outstanding, so an unconditional over-target hold on that ADD is a
// static deadlock (live witness public-path-multinode-baseline-20260811T135503Z:
// 4 alive over 2 distinct nodes, target 3x3, 700 held cycles, spread pinned at
// 2/3 all run). The hold must admit exactly the cure shape and nothing else.

test('count-keyed lane EXEMPTS the priority-spread cure ADD: over target on alive ' +
  'replicas but below distinct-node coverage, an ADD typed spread_replicas to an ' +
  'unoccupied node is ADMITTED (red-on-revert: the unconditional hold deadlocks ' +
  'the planner-yielded drain)', async (t) => {
  initializeTestEnvironment();
  // Witnessed deadlock topology: 4 alive replicas over 2 distinct nodes.
  const rows = [
    critRow(CRIT_PARTITION_ID + '-r1', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r2', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r3', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r4', 'node-2'),
  ];
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices: rows,
    authoritativeServices: rows,
  });
  await coordinator.createOperation({
    type: TEST_ADD_OPERATION_TYPE,
    partitionId: CRIT_PARTITION_ID,
    nodeId: 'node-3',
    moveReason: 'spread_replicas',
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  });
  t.equal(
    sqlEngine.getOperations().length,
    1,
    'the planner-retained spread-cure ADD is admitted despite the over-target surplus',
  );
  coordinator.shutdown();
});

test('count-keyed lane STILL HOLDS an over-target ADD without the spread-cure ' +
  'typing (the exemption admits only the planner-retained cure shape)', async (t) => {
  initializeTestEnvironment();
  const rows = [
    critRow(CRIT_PARTITION_ID + '-r1', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r2', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r3', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r4', 'node-2'),
  ];
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices: rows,
    authoritativeServices: rows,
  });
  const error = await captureOperationCreateError(() => coordinator.createOperation({
    type: TEST_ADD_OPERATION_TYPE,
    partitionId: CRIT_PARTITION_ID,
    nodeId: 'node-3',
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  }));
  t.ok(error, 'an untyped over-target ADD stays held');
  t.equal(sqlEngine.getOperations().length, 0, 'no operation persists');
  coordinator.shutdown();
});

test('count-keyed lane STILL HOLDS a spread-typed over-target ADD once distinct-node ' +
  'coverage meets the target (spread satisfied -> the surplus must drain, not grow)',
async (t) => {
  initializeTestEnvironment();
  // 4 alive over 4 distinct nodes, target 3: over target with spread satisfied.
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
    type: TEST_ADD_OPERATION_TYPE,
    partitionId: CRIT_PARTITION_ID,
    nodeId: 'node-5',
    moveReason: 'spread_replicas',
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  }));
  t.ok(error, 'a spread-typed ADD with coverage at target stays held');
  t.equal(sqlEngine.getOperations().length, 0, 'no operation persists');
  coordinator.shutdown();
});

test('count-keyed lane STILL HOLDS a spread-typed over-target ADD whose target node ' +
  'already hosts a replica (no coverage gain -> not the cure shape)', async (t) => {
  initializeTestEnvironment();
  const rows = [
    critRow(CRIT_PARTITION_ID + '-r1', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r2', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r3', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r4', 'node-2'),
  ];
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices: rows,
    authoritativeServices: rows,
  });
  const error = await captureOperationCreateError(() => coordinator.createOperation({
    type: TEST_ADD_OPERATION_TYPE,
    partitionId: CRIT_PARTITION_ID,
    nodeId: 'node-2',
    moveReason: 'spread_replicas',
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  }));
  t.ok(error, 'a spread-typed ADD to an already-hosting node stays held');
  t.equal(sqlEngine.getOperations().length, 0, 'no operation persists');
  coordinator.shutdown();
});

// --- s14: orphaned-row census (topology-guard raft_role awareness) ---
// An orphan = status=active, NON-voter raft_role, no live in-flight ADD-like op:
// the phantom a lost promotion-to-voter write-back leaves (its REPLACE completed
// but raft_role never advanced). It must NOT count toward the target-count
// census, or it blocks the spread ADD that would mint a real replacement voter
// (the interlock, raft_role-aware, correctly sees the group under-replicated) —
// a self-referential formation deadlock.
function orphanRow(replicaId, nodeId) {
  return {...critRow(replicaId, nodeId), raft_role: 'learner', status: 'active'};
}

test('s14 orphan census: 2 voters + 1 ORPHAN (active, non-voter, no in-flight op) ' +
  'on 3 nodes does NOT satisfy target 3 — the spread ADD to a 4th node is ADMITTED ' +
  '(RED on the status-only-census head)', async (t) => {
  initializeTestEnvironment();
  const rows = [
    critRow(CRIT_PARTITION_ID + '-r1', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r2', 'node-2'),
    orphanRow(CRIT_PARTITION_ID + '-r3', 'node-3'),
  ];
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices: rows,
    authoritativeServices: rows,
  });
  await coordinator.createOperation({
    type: TEST_ADD_OPERATION_TYPE,
    partitionId: CRIT_PARTITION_ID,
    nodeId: 'node-4',
    replicaId: CRIT_PARTITION_ID + '-r5',
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  });
  t.equal(
    sqlEngine.getOperations().length,
    1,
    'orphan excluded from the count-census (voters=2 < target 3) -> spread ADD admitted',
  );
  coordinator.shutdown();
});

test('s14 orphan census: a CATCHING-UP learner (status=creating) still counts, ' +
  'so a redundant 4th ADD is HELD — over-creation is not admitted', async (t) => {
  initializeTestEnvironment();
  const rows = [
    critRow(CRIT_PARTITION_ID + '-r1', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r2', 'node-2'),
    // pre-active transitional (not an orphan): a legitimate voter-to-be.
    {...critRow(CRIT_PARTITION_ID + '-r3', 'node-3'), raft_role: 'learner', status: 'creating'},
  ];
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices: rows,
    authoritativeServices: rows,
  });
  const error = await captureOperationCreateError(() => coordinator.createOperation({
    type: TEST_ADD_OPERATION_TYPE,
    partitionId: CRIT_PARTITION_ID,
    nodeId: 'node-4',
    replicaId: CRIT_PARTITION_ID + '-r5',
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  }));
  t.ok(error, 'catching-up learner counts (3 nodes == target) -> redundant ADD held');
  t.equal(sqlEngine.getOperations().length, 0, 'no over-creating replica operation persisted');
  coordinator.shutdown();
});

test('s14 orphan census: the one-node-per-replica occupancy check is UNCHANGED — ' +
  'an add-like create targeting the ORPHAN\'s node is still blocked (no double-placement)', async (t) => {
  initializeTestEnvironment();
  const rows = [
    critRow(CRIT_PARTITION_ID + '-r1', 'node-1'),
    critRow(CRIT_PARTITION_ID + '-r2', 'node-2'),
    orphanRow(CRIT_PARTITION_ID + '-r3', 'node-3'),
  ];
  const {coordinator, sqlEngine} = createCoordinator({
    cacheServices: rows,
    authoritativeServices: rows,
  });
  const error = await captureOperationCreateError(() => coordinator.createOperation({
    type: TEST_ADD_OPERATION_TYPE,
    partitionId: CRIT_PARTITION_ID,
    nodeId: 'node-3',
    replicaId: CRIT_PARTITION_ID + '-r6',
    emitOperationCreated: false,
    enforceConcurrentOperationBudget: true,
  }));
  t.ok(error, 'target node already occupied (full-occupancy check intact) -> blocked');
  t.equal(sqlEngine.getOperations().length, 0, 'no double-placement on the orphan node');
  coordinator.shutdown();
});
