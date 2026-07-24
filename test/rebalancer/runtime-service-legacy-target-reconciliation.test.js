import {test} from '../../src/test-helpers/tap.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  LEGACY_CLEANUP_OPERATION_PREFIX,
  RuntimeServiceLegacyTargetReconciler,
} from
  '../../src/bootstrap/shared/runtime-service-legacy-target-reconciler.js';
import {UNIFIED_SERVICE_TYPE} from
  '../../src/constants/unified-service-lifecycle.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';

const ENTITY_ID = 'svc-legacy-runtime-target';
const LEGACY_REPLICA_ID = 'replace-replica-legacy-runtime-target';
const LEGACY_OPERATION_ID = 'replace-op-legacy-runtime-target';
const CLEANUP_OPERATION_ID =
  `${LEGACY_CLEANUP_OPERATION_PREFIX}${LEGACY_OPERATION_ID}`;
const TARGET_NODE_ID = 'node-legacy-target';

function buildDefinition() {
  return {
    service_id: ENTITY_ID,
    status: 'active',
    replica_count: 2,
  };
}

function buildService(serviceId, nodeId = TARGET_NODE_ID) {
  return {
    service_id: serviceId,
    replica_id: serviceId,
    service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
  };
}

function buildLegacyReplaceOperation(workflowStep = 'COMPLETED') {
  return {
    operation_id: LEGACY_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: ENTITY_ID,
    entity_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entity_id: ENTITY_ID,
    replica_id: LEGACY_REPLICA_ID,
    source_node_id: 'node-source',
    target_node_id: TARGET_NODE_ID,
    status: workflowStep === 'FAILED' ?
      ReplicaStatus.FAILED :
      ReplicaStatus.ACTIVE,
    workflow_step: workflowStep,
    created_at: 1,
    updated_at: 2,
    steps_history: '[]',
  };
}

function buildCleanupOperation(
  operationId = CLEANUP_OPERATION_ID,
  workflowStep = 'SENDING',
) {
  return {
    operation_id: operationId,
    type: OperationType.REMOVE,
    partition_id: ENTITY_ID,
    entity_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entity_id: ENTITY_ID,
    replica_id: LEGACY_REPLICA_ID,
    status: workflowStep === 'FAILED' ?
      ReplicaStatus.FAILED :
      ReplicaStatus.ACTIVE,
    workflow_step: workflowStep,
  };
}

function makeCache(tables) {
  return {
    filter(tableName, predicate) {
      return (tables[tableName] || []).filter(predicate);
    },
  };
}

function makeCoordinator(createdMoves) {
  return {
    rowToOperation(row) {
      return {
        ...row,
        operationId: row.operation_id,
        partitionId: row.partition_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        replicaId: row.replica_id,
        sourceNodeId: row.source_node_id,
        targetNodeId: row.target_node_id,
        workflowStep: row.workflow_step,
      };
    },
    isOperationTerminal(operation) {
      return (
        operation.workflowStep === 'COMPLETED' ||
        operation.workflowStep === 'FAILED'
      );
    },
    async createOperation(move) {
      createdMoves.push(move);
      return {operationId: move.operationIntentId};
    },
  };
}

test('legacy runtime target waits for full canonical coverage before one ' +
  'durable cleanup REMOVE', async (t) => {
  const tables = {
    [SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS]: [buildDefinition()],
    [SYSTEM_TABLE_NAME.SERVICES]: [
      buildService(`${ENTITY_ID}-r1`, 'node-stable'),
      buildService(LEGACY_REPLICA_ID),
    ],
    [SYSTEM_TABLE_NAME.REPLICA_OPERATIONS]: [
      buildLegacyReplaceOperation(),
    ],
  };
  const createdMoves = [];
  const reconciler = new RuntimeServiceLegacyTargetReconciler({
    systemTableCache: makeCache(tables),
    rebalanceCoordinator: makeCoordinator(createdMoves),
  });

  await reconciler.schedule();
  t.same(
    createdMoves,
    [],
    'the invalid target stays live while canonical desired state is short',
  );

  tables[SYSTEM_TABLE_NAME.SERVICES].push(
    buildService(`${ENTITY_ID}-r3`, 'node-canonical-target'),
  );
  await reconciler.schedule();

  t.equal(createdMoves.length, 1, 'coverage releases exactly one cleanup');
  t.match(createdMoves[0], {
    type: OperationType.REMOVE,
    partitionId: ENTITY_ID,
    entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entityId: ENTITY_ID,
    nodeId: TARGET_NODE_ID,
    replicaId: LEGACY_REPLICA_ID,
    operationIntentId: CLEANUP_OPERATION_ID,
  });
});

test('legacy cleanup reconstructs from durable rows after restart and adopts ' +
  'the existing deterministic operation', async (t) => {
  const tables = {
    [SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS]: [buildDefinition()],
    [SYSTEM_TABLE_NAME.SERVICES]: [
      buildService(`${ENTITY_ID}-r1`, 'node-stable'),
      buildService(`${ENTITY_ID}-r3`, 'node-canonical-target'),
      buildService(LEGACY_REPLICA_ID),
    ],
    [SYSTEM_TABLE_NAME.REPLICA_OPERATIONS]: [
      buildLegacyReplaceOperation(),
      buildCleanupOperation(),
    ],
  };
  const createdMoves = [];

  const restartedReconciler = new RuntimeServiceLegacyTargetReconciler({
    systemTableCache: makeCache(tables),
    rebalanceCoordinator: makeCoordinator(createdMoves),
  });
  await restartedReconciler.schedule();

  t.same(
    createdMoves,
    [],
    'restart observes the persisted cleanup instead of creating another',
  );
});

test('terminal legacy cleanup is level-triggered with one durable re-drive',
  async (t) => {
    const loggedExhaustions = [];
    const tables = {
      [SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS]: [buildDefinition()],
      [SYSTEM_TABLE_NAME.SERVICES]: [
        buildService(`${ENTITY_ID}-r1`, 'node-stable'),
        buildService(`${ENTITY_ID}-r3`, 'node-canonical-target'),
        buildService(LEGACY_REPLICA_ID),
      ],
      [SYSTEM_TABLE_NAME.REPLICA_OPERATIONS]: [
        buildLegacyReplaceOperation(),
        buildCleanupOperation(CLEANUP_OPERATION_ID, 'FAILED'),
      ],
    };
    const createdMoves = [];
    const reconciler = new RuntimeServiceLegacyTargetReconciler({
      systemTableCache: makeCache(tables),
      rebalanceCoordinator: makeCoordinator(createdMoves),
      logger: {
        error(message, context) {
          loggedExhaustions.push({message, context});
        },
      },
    });

    await reconciler.schedule();

    t.equal(createdMoves.length, 1, 'failed cleanup is not abandoned');
    t.equal(
      createdMoves[0].operationIntentId,
      `${CLEANUP_OPERATION_ID}-retry-2`,
      'the re-drive has a restart-stable attempt identity',
    );

    tables[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS].push(
      buildCleanupOperation(
        createdMoves[0].operationIntentId,
        'SENDING',
      ),
    );
    await reconciler.schedule();
    t.equal(
      createdMoves.length,
      1,
      'one nonterminal re-drive owns cleanup across later refreshes',
    );

    tables[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS].at(-1).workflow_step =
      'FAILED';
    tables[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS].at(-1).status =
      ReplicaStatus.FAILED;
    await reconciler.schedule();
    await reconciler.schedule();
    t.equal(
      createdMoves.length,
      1,
      'a repeatedly failed cleanup cannot mint an unbounded operation chain',
    );
    t.equal(
      loggedExhaustions.length,
      1,
      'retry exhaustion is escalated once instead of silently abandoning it',
    );
    t.match(loggedExhaustions[0], {
      context: {
        cleanupOperationId: CLEANUP_OPERATION_ID,
        legacyReplicaId: LEGACY_REPLICA_ID,
        attemptLimit: 2,
      },
    });
  },
);

test('nonterminal legacy REPLACE is retained for its workflow owner to fail ' +
  'before cleanup planning', async (t) => {
  const tables = {
    [SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS]: [buildDefinition()],
    [SYSTEM_TABLE_NAME.SERVICES]: [
      buildService(`${ENTITY_ID}-r1`, 'node-stable'),
      buildService(`${ENTITY_ID}-r3`, 'node-canonical-target'),
      buildService(LEGACY_REPLICA_ID),
    ],
    [SYSTEM_TABLE_NAME.REPLICA_OPERATIONS]: [
      buildLegacyReplaceOperation('ACTIVE'),
    ],
  };
  const createdMoves = [];
  const reconciler = new RuntimeServiceLegacyTargetReconciler({
    systemTableCache: makeCache(tables),
    rebalanceCoordinator: makeCoordinator(createdMoves),
  });

  await reconciler.schedule();
  t.same(createdMoves, [], 'cleanup never races a nonterminal operation');
});
