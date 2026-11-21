import {buildOperationUpdateOutcome} from
  '../../src/rebalancer/replica-operation-update-outcome.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from
  '../../src/rebalancer/replica-operation-update-disposition.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {UNIFIED_SERVICE_TYPE} from '../../src/constants/unified-service-lifecycle.js';
import {test} from '../../src/test-helpers/tap.js';
import {OPERATION_WORKFLOW_OWNER_SHARED as SHARED} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {
  createMockPolicyService,
  createTestCoordinator,
} from './test-helpers.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  SERVICE_TYPE,
  WORKFLOW_STEP,
} = SHARED;

const OWNER_NODE_ID = 'owner-node';
const TARGET_NODE_ID = 'remove-node';
const PARTITION_ID = 'shape-b-p1';
const ENTITY_ID = PARTITION_ID;
const REPLICA_ID = 'shape-b-p1-r1';
const PENDING_OPERATION_ID = 'op-shape-b-pending-remove';
const ACTIVE_OPERATION_ID = 'op-shape-b-active-remove';
const REPLACE_OPERATION_ID = 'op-shape-b-pending-replace';
const REPLACE_SOURCE_REPLICA_ID = 'shape-b-p1-r0';
const CREATED_AT_LAG_MS = 5000;
const UPDATED_AT_LAG_MS = 1000;
const OBSERVED_STATE = OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED;

function buildOperationRow({
  operationId,
  operationType = OperationType.REMOVE,
  replicaId = REPLICA_ID,
  sourceReplicaId = null,
  workflowStep = WORKFLOW_STEP.PENDING,
  status = ReplicaStatus.PENDING,
}) {
  const now = Date.now();
  const firstStep = {
    step: WORKFLOW_STEP.PENDING,
    timestamp: now - CREATED_AT_LAG_MS,
  };
  if (sourceReplicaId) {
    firstStep.sourceReplicaId = sourceReplicaId;
  }
  const stepsHistory = [firstStep];
  if (workflowStep !== WORKFLOW_STEP.PENDING) {
    stepsHistory.push({
      step: workflowStep,
      timestamp: now - UPDATED_AT_LAG_MS,
    });
  }
  return {
    operation_id: operationId,
    type: operationType,
    partition_id: PARTITION_ID,
    replica_id: replicaId,
    source_node_id: OWNER_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    status,
    workflow_step: workflowStep,
    created_at: now - CREATED_AT_LAG_MS,
    updated_at: now - UPDATED_AT_LAG_MS,
    completed_at: null,
    error_message: null,
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: ENTITY_ID,
    steps_history: JSON.stringify(stepsHistory),
  };
}

function buildActiveServiceRow(replicaId = REPLICA_ID, nodeId = TARGET_NODE_ID) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    service_type: SERVICE_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
    raft_role: 'follower',
    address: `${nodeId}/partition/${replicaId}`,
  };
}

// The universal remove-safety floor (audit finding 1) blocks a removal that
// drops the post-removal voter-ready count below the min-replica floor. These
// fixtures exercise the dispatch / re-drive machinery, not the floor, so they
// seed a safe quorum: the removed replica plus two stable voter-ready peers on
// distinct nodes, and a min-replica policy of 2 (removing one leaves 2 >= 2).
const STABLE_SERVICE_ROWS = [
  buildActiveServiceRow(`${PARTITION_ID}-r2`, 'stable-node-a'),
  buildActiveServiceRow(`${PARTITION_ID}-r3`, 'stable-node-b'),
];

function createRemoveCoordinator({
  operationRow,
  otherOperationRows = [],
  beforeRemoveReply,
  serviceRows = [buildActiveServiceRow(), ...STABLE_SERVICE_ROWS],
  removeResponseStatus = ReplicaOperationResponseStatus.INITIATED,
}) {
  const deliveries = [];
  const nodeIds = [
    ...new Set(
      [
        OWNER_NODE_ID,
        TARGET_NODE_ID,
        ...serviceRows.map((row) => row?.node_id),
      ].filter(Boolean),
    ),
  ];
  const coordinator = createTestCoordinator({
    nodeId: OWNER_NODE_ID,
    enableTimeouts: false,
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({targetReplicaCount: 3, minReplicaCount: 2}),
    }),
    cacheData: {
      nodes: nodeIds.map((nodeId) => ({node_id: nodeId, status: 'active'})),
      services: serviceRows,
      replicaOperations: [operationRow, ...otherOperationRows],
    },
    messageRouter: {
      async deliver(target, payload) {
        deliveries.push({target, payload});
        if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
          const answer = await beforeRemoveReply?.(payload);
          if (answer !== undefined) return answer;
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          status: payload.type === ReplicaOperationMessageType.REMOVE_REPLICA ?
            removeResponseStatus :
            ReplicaOperationResponseStatus.INITIATED,
        });
      },
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
  });
  coordinator.repository.getActualReplicaObservation = async (
    replicaId,
    partitionId,
    targetNodeId,
  ) => {
    const serviceRow = serviceRows.find((row) =>
      row.replica_id === replicaId &&
      row.partition_id === partitionId &&
      row.node_id === targetNodeId,
    );
    if (!serviceRow) {
      return {state: 'absent', lifecycleStatus: null};
    }
    return {
      state: OBSERVED_STATE,
      lifecycleStatus: serviceRow.status,
    };
  };
  return {coordinator, deliveries};
}

function removeDeliveries(deliveries) {
  return deliveries.filter((entry) =>
    entry.payload?.type === ReplicaOperationMessageType.REMOVE_REPLICA,
  );
}

test('dispatch wake for PENDING REMOVE with ACTIVE target dispatches removal',
  async (t) => {
    const operationRow = buildOperationRow({
      operationId: PENDING_OPERATION_ID,
    });
    const {coordinator, deliveries} = createRemoveCoordinator({operationRow});

    try {
      const result = await coordinator.dispatchOperation(operationRow);
      const persistedOperation = await coordinator.getOperation(
        PENDING_OPERATION_ID,
      );

      t.equal(result?.success, true, 'dispatch wake reports successful progress');
      t.equal(
        removeDeliveries(deliveries).length,
        1,
        'PENDING REMOVE with ACTIVE target must dispatch REMOVE_REPLICA',
      );
      t.not(
        persistedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'target ACTIVE is not create-progress evidence for REMOVE',
      );
      t.equal(
        persistedOperation?.workflowStep,
        WORKFLOW_STEP.STOPPING,
        'remove dispatch advances to STOPPING through the stop-phase path',
      );
      t.equal(
        persistedOperation?.completedAt,
        null,
        'an initiated remove stays incomplete until source absence is observed',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('periodic orphan reconcile re-drives REMOVE already stranded at ACTIVE',
  async (t) => {
    const operationRow = buildOperationRow({
      operationId: ACTIVE_OPERATION_ID,
      workflowStep: WORKFLOW_STEP.ACTIVE,
      status: ReplicaStatus.ACTIVE,
    });
    const {coordinator, deliveries} = createRemoveCoordinator({
      operationRow,
      removeResponseStatus: ReplicaOperationResponseStatus.NOT_FOUND,
    });

    try {
      const cachedIncompleteIds = coordinator.repository
        .queryCachedIncompleteOperations()
        .map((operation) => operation.operationId);
      t.same(
        cachedIncompleteIds,
        [ACTIVE_OPERATION_ID],
        'REMOVE+ACTIVE remains visible to the periodic incomplete-op sweep',
      );

      await coordinator.reconcileOrphanedOperations();
      const persistedOperation = await coordinator.getOperation(
        ACTIVE_OPERATION_ID,
      );

      t.equal(
        removeDeliveries(deliveries).length,
        1,
        'orphan reconcile re-drives REMOVE_REPLICA for ACTIVE REMOVE',
      );
      t.equal(
        persistedOperation?.workflowStep,
        WORKFLOW_STEP.REMOVED,
        'source-absent remove response completes through completeOperation',
      );
      t.equal(
        persistedOperation?.status,
        ReplicaStatus.REMOVED,
        'completed REMOVE persists removed status',
      );
      t.ok(
        Number.isFinite(persistedOperation?.completedAt),
        'completed REMOVE has completedAt set',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('PENDING REPLACE keeps create-phase dispatch-wake target shortcut',
  async (t) => {
    const operationRow = buildOperationRow({
      operationId: REPLACE_OPERATION_ID,
      operationType: OperationType.REPLACE,
      sourceReplicaId: REPLACE_SOURCE_REPLICA_ID,
    });
    const {coordinator, deliveries} = createRemoveCoordinator({
      operationRow,
      serviceRows: [buildActiveServiceRow(REPLICA_ID)],
    });

    try {
      const result = await coordinator.dispatchOperation(operationRow);
      const persistedOperation = await coordinator.getOperation(
        REPLACE_OPERATION_ID,
      );

      t.equal(result?.success, true, 'replace dispatch wake reports progress');
      t.equal(
        persistedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'PENDING REPLACE remains in the create-phase target-progress shortcut',
      );
      t.equal(
        deliveries.length,
        0,
        'REPLACE target progress is reconciled without replaying create dispatch',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

// A retained malformed row has a narrow owner recovery path; it cannot be
// used as a successful persistence result at the generic contract boundary.
test('REMOVE ACTIVE is never an admitted operation-update result', async (t) => {
  const operationRow = buildOperationRow({operationId: ACTIVE_OPERATION_ID,
    workflowStep: WORKFLOW_STEP.ACTIVE, status: ReplicaStatus.ACTIVE});
  const {coordinator} = createRemoveCoordinator({operationRow});
  try {
    const operation = coordinator.repository.rowToOperation(operationRow);
    t.throws(() => buildOperationUpdateOutcome({persisted: true,
      disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED, operation}),
    {code: 'INVALID_OPERATION_PERSISTENCE_OUTCOME'},
    'stranded durable input does not weaken the result validator');
  } finally {
    await coordinator.shutdown();
  }
});

test('stranded REMOVE correction preserves a competing durable terminal failure', async (t) => {
  const operationRow = buildOperationRow({operationId: ACTIVE_OPERATION_ID,
    workflowStep: WORKFLOW_STEP.ACTIVE, status: ReplicaStatus.ACTIVE});
  const {coordinator, deliveries} = createRemoveCoordinator({operationRow,
    removeResponseStatus: ReplicaOperationResponseStatus.NOT_FOUND});
  const repository = coordinator.repository;
  const gateway = repository.controlPlaneSystemTableGateway;
  const execute = gateway.executeQuery.bind(gateway);
  let winner = null;
  let correctionAttempts = 0;
  gateway.executeQuery = async (sql, params, options) => {
    if (sql.includes('UPDATE replica_operations') && sql.includes('AND steps_history = ?') &&
        params[1] === WORKFLOW_STEP.STOPPING) {
      correctionAttempts += 1;
      const now = Date.now();
      const failed = {...repository.rowToOperation(operationRow),
        workflowStep: WORKFLOW_STEP.FAILED, status: ReplicaStatus.FAILED,
        updatedAt: now, completedAt: now, errorMessage: 'competing terminal writer',
        stepsHistory: [...JSON.parse(operationRow.steps_history),
          {step: WORKFLOW_STEP.FAILED, timestamp: now}]};
      // An independent writer wins at the storage boundary. Keep the
      // owner's terminal CAS guard and parameter encoding while bypassing
      // the correcting owner's pre-read of the deliberately stranded row.
      const result = await execute(
        repository.resolveOperationUpdateSql(WORKFLOW_STEP.ACTIVE, true),
        repository.buildReplicaOperationUpdateParams(failed, WORKFLOW_STEP.ACTIVE, null),
        options,
      );
      t.equal(result.changes, 1, 'the competing guarded terminal write commits in SQLite');
      winner = await repository.queryAuthoritativeOperationById(ACTIVE_OPERATION_ID);
    }
    return execute(sql, params, options);
  };
  try {
    await coordinator.reconcileOrphanedOperations();
    const durable = await repository.queryAuthoritativeOperationById(ACTIVE_OPERATION_ID);
    t.equal(removeDeliveries(deliveries).length, 1,
      'recovery still requires the accepted REMOVE response');
    t.equal(correctionAttempts, 1, 'race meets the correction persistence boundary');
    t.equal(durable.workflowStep, WORKFLOW_STEP.FAILED, 'terminal failure remains failure');
    t.equal(durable.completedAt, winner?.completedAt, 'winning completion identity retained');
    t.equal(durable.errorMessage, 'competing terminal writer', 'winning failure retained');
    t.same(durable.stepsHistory, winner?.stepsHistory, 'correction never overwrites winner history');
  } finally {
    await coordinator.shutdown();
  }
});


for (const [label, step, status, reason] of [
  ['a valid competitor', WORKFLOW_STEP.PENDING, ReplicaStatus.PENDING,
    /concurrent partition operation competing-remove/u],
  ['a malformed different row', WORKFLOW_STEP.ACTIVE, ReplicaStatus.ACTIVE,
    /invalid operation type or step/u],
]) {
  test(`stranded REMOVE still defers behind ${label}`, async (t) => {
    const operationRow = buildOperationRow({operationId: ACTIVE_OPERATION_ID,
      workflowStep: WORKFLOW_STEP.ACTIVE, status: ReplicaStatus.ACTIVE});
    const other = buildOperationRow({operationId: 'competing-remove',
      replicaId: `${PARTITION_ID}-r2`, workflowStep: step, status});
    const {coordinator, deliveries} = createRemoveCoordinator({
      operationRow, otherOperationRows: [other],
    });
    try {
      const operation = coordinator.repository.rowToOperation(operationRow);
      const result = await coordinator.workflowOwner.evaluateRemoveSafety(operation);
      t.match(result.error, reason);
      await coordinator.reconcileOrphanedOperations();
      t.same(removeDeliveries(deliveries), [], 'no source effect bypasses the competitor');
      const durable = await coordinator.repository
        .queryAuthoritativeOperationById(ACTIVE_OPERATION_ID);
      t.equal(durable.workflowStep, WORKFLOW_STEP.ACTIVE);
    } finally {
      await coordinator.shutdown();
    }
  });
}

for (const mode of ['missing', 'mismatched generation', 'duplicate', 'unavailable']) {
  test(`remove arbitration defers when its exact committed subject is ${mode}`, async (t) => {
    const operationRow = buildOperationRow({operationId: ACTIVE_OPERATION_ID,
      workflowStep: WORKFLOW_STEP.ACTIVE, status: ReplicaStatus.ACTIVE});
    const {coordinator, deliveries} = createRemoveCoordinator({operationRow});
    const {repository, controlPlaneSystemTableGateway: gateway} = coordinator;
    try {
      const operation = repository.rowToOperation(operationRow);
      const read = gateway.readAuthoritativeRows.bind(gateway);
      gateway.readAuthoritativeRows = async (table, sql, params, options) => {
        const result = await read(table, sql, params, options);
        if (table !== 'replica_operations' || !sql.includes('entity_type = ? AND entity_id = ?')) {
          return result;
        }
        if (mode === 'unavailable') return {success: false, error: 'leader read withheld'};
        if (mode === 'duplicate') return {...result, rows: [...result.rows, ...result.rows]};
        return result;
      };
      if (mode === 'missing' || mode === 'mismatched generation') {
        const mutation = mode === 'missing' ? {operation: 'delete'} :
          {operation: 'update', data: {created_at: operationRow.created_at + 1}};
        const written = await gateway.submitMutation({...mutation, tableName: 'replica_operations',
          whereClause: {operation_id: ACTIVE_OPERATION_ID}});
        t.match(written, {success: true, partitionResult: {affectedRows: 1}});
      }
      const result = await coordinator.workflowOwner.evaluateRemoveSafety(operation);
      t.match(result.error, /operation ledger is unavailable for removal arbitration/u);
      t.same(removeDeliveries(deliveries), []);
    } finally {
      await coordinator.shutdown();
    }
  });
}

for (const entityType of [SERVICE_TYPE.PARTITION, SERVICE_TYPE.MESSAGE_GROUP,
  UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE]) {
  test(`complete removal arbitration binds an ordinary ${entityType} row and only its peers`,
    async (t) => {
      const operationRow = {...buildOperationRow({operationId: PENDING_OPERATION_ID}),
        entity_type: entityType};
      const contender = {...operationRow, operation_id: 'typed-contender',
        replica_id: `${PARTITION_ID}-r2`};
      const foreign = {...operationRow, operation_id: 'other-entity-type',
        entity_type: entityType === SERVICE_TYPE.PARTITION ?
          SERVICE_TYPE.MESSAGE_GROUP : SERVICE_TYPE.PARTITION,
        workflow_step: WORKFLOW_STEP.ACTIVE, status: ReplicaStatus.ACTIVE};
      const {coordinator} = createRemoveCoordinator({
        operationRow, otherOperationRows: [foreign, contender],
      });
      try {
        const {repository} = coordinator;
        const operation = repository.rowToOperation(operationRow);
        const competitors = await repository.getRequiredRemoveArbitrationCompetitors(operation);
        t.same(competitors.map(({operationId}) => operationId), [contender.operation_id],
          'same text entity ID in another type could not contribute a malformed row');
      } finally {
        await coordinator.shutdown();
      }
    });
}


for (const boundary of ['before response', 'before SQLite CAS']) {
  const fields = boundary === 'before response' ? ['created_at', 'steps_history'] :
    ['created_at', 'steps_history', 'updated_at', 'target_node_id', 'status', 'delete'];
  for (const field of fields) {
    test(`the stranded REMOVE reply cannot replace moved ${field} ${boundary}`, async (t) => {
      const operationRow = buildOperationRow({operationId: ACTIVE_OPERATION_ID,
        workflowStep: WORKFLOW_STEP.ACTIVE, status: ReplicaStatus.ACTIVE});
      const changed = {
        created_at: operationRow.created_at + 1,
        updated_at: operationRow.updated_at + 1,
        target_node_id: 'new-target-same-key',
        status: ReplicaStatus.REMOVING,
        steps_history: JSON.stringify([...JSON.parse(operationRow.steps_history),
          {step: WORKFLOW_STEP.ACTIVE, timestamp: operationRow.updated_at, reason: 'new owner turn'}]),
      };
      const {coordinator, deliveries} = createRemoveCoordinator({
        operationRow, removeResponseStatus: ReplicaOperationResponseStatus.NOT_FOUND,
        ...(boundary === 'before response' ? {beforeRemoveReply: movePreimage} : {}),
      });
      const {repository, controlPlaneSystemTableGateway: gateway} = coordinator;
      let moved;
      let mutationRan = false;
      let releases = 0;
      const owner = coordinator.workflowOwner;
      const release = owner.releaseDurableTerminalOperation.bind(owner);
      owner.releaseDurableTerminalOperation = (...args) => {
        releases += 1;
        return release(...args);
      };
      async function movePreimage() {
        mutationRan = true;
        const mutation = field === 'delete' ? {operation: 'delete'} :
          {operation: 'update', data: {[field]: changed[field]}};
        const result = await gateway.submitMutation({...mutation, tableName: 'replica_operations',
          whereClause: {operation_id: ACTIVE_OPERATION_ID}});
        t.match(result, {success: true, partitionResult: {affectedRows: 1}},
          'the independent writer moves the exact live preimage');
        moved = await repository.queryAuthoritativeOperationById(ACTIVE_OPERATION_ID);
      }
      if (boundary === 'before SQLite CAS') {
        const execute = gateway.executeQuery.bind(gateway);
        gateway.executeQuery = async (sql, params, options) => {
          if (!mutationRan && sql.includes('UPDATE replica_operations') &&
              sql.includes('AND steps_history = ?') && params[1] === WORKFLOW_STEP.STOPPING) {
            await movePreimage();
          }
          return execute(sql, params, options);
        };
      }
      try {
        await coordinator.reconcileOrphanedOperations();
        t.equal(removeDeliveries(deliveries).length, 1, 'the old preimage admitted one send');
        t.equal(mutationRan, true, 'the prior row moved after the original send');
        t.same(await repository.queryAuthoritativeOperationById(ACTIVE_OPERATION_ID), moved,
          'the late response cannot write over the moved row or reinsert an absent row');
        t.equal(releases, 0, 'no changed or absent row grants terminal release');
      } finally {
        await coordinator.shutdown();
      }
    });
  }
}


for (const [answer, generation] of [
  ['rejected', 'replaced'], ['undelivered', 'replaced'], ['thrown', 'replaced'],
  ['rejected', 'same'], ['undelivered', 'same'], ['thrown', 'same'],
]) {
  test(`a ${answer} stranded REMOVE can adopt only a ${generation} terminal subject`, async (t) => {
    const operationRow = buildOperationRow({operationId: ACTIVE_OPERATION_ID,
      workflowStep: WORKFLOW_STEP.ACTIVE, status: ReplicaStatus.ACTIVE});
    let terminal;
    const {coordinator, deliveries} = createRemoveCoordinator({
      operationRow,
      beforeRemoveReply: async () => {
        const time = Date.now();
        const mutation = await coordinator.controlPlaneSystemTableGateway.submitMutation({
          operation: 'update', tableName: 'replica_operations',
          whereClause: {operation_id: ACTIVE_OPERATION_ID, completed_at: null},
          data: {created_at: operationRow.created_at + Number(generation === 'replaced'),
            status: ReplicaStatus.FAILED, workflow_step: WORKFLOW_STEP.FAILED,
            updated_at: time, completed_at: time, error_message: 'independent terminal writer',
            steps_history: JSON.stringify([...JSON.parse(operationRow.steps_history),
              {step: WORKFLOW_STEP.FAILED, timestamp: time}])},
        });
        t.match(mutation, {success: true, partitionResult: {affectedRows: 1}});
        terminal = await coordinator.repository
          .queryAuthoritativeOperationById(ACTIVE_OPERATION_ID);
        if (answer === 'thrown') throw new Error('transport did not return a reply');
        return answer === 'rejected' ? buildDeliveryEnvelope({acknowledged: true}, {
          status: ReplicaOperationResponseStatus.ERROR, error: 'source rejected removal',
        }) : buildDeliveryEnvelope({acknowledged: false}, null);
      },
    });
    const released = [];
    const owner = coordinator.workflowOwner;
    const release = owner.releaseDurableTerminalOperation.bind(owner);
    owner.releaseDurableTerminalOperation = (operation, outcome) => {
      released.push(outcome.operation);
      return release(operation, outcome);
    };
    try {
      await coordinator.reconcileOrphanedOperations();
      t.equal(removeDeliveries(deliveries).length, 1, 'the prior committed row permits one send');
      t.same(await coordinator.repository.queryAuthoritativeOperationById(ACTIVE_OPERATION_ID),
        terminal, 'the independent terminal result remains exactly as committed');
      t.same(released, generation === 'same' ? [terminal] : [],
        'release authority requires the actual bound generation');
    } finally {
      await coordinator.shutdown();
    }
  });
}
