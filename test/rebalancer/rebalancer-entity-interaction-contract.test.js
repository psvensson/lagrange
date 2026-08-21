import {test} from '../../src/test-helpers/tap.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  ALLOWED_UNIFIED_SERVICE_TYPES,
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/unified-service-lifecycle.js';
import {
  ENTITY_SERVICE_ROW_READ_SQL,
  readAuthoritativeEntityServiceRows,
} from '../../src/rebalancer/entity-service-row-read.js';
import {
  ENTITY_REMOVE_SAFETY_POLICY,
} from '../../src/rebalancer/operation-workflow-remove-safety-entity-tier.js';
import {
  evaluateRemoveSafety,
} from '../../src/rebalancer/operation-workflow-remove-safety-evaluator.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {PriorityPublicationSafetyRows} from
  '../../src/rebalancer/priority-publication-safety-rows.js';
import {PriorityRecoverySupersededTarget} from
  '../../src/rebalancer/priority-recovery-superseded-target.js';
import {
  canonicalizeRebalancerMove,
} from '../../src/rebalancer/rebalancer-entity-identity.js';
import {
  REBALANCER_ENTITY_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  hasObservedCompletedReplicaOperation,
} from '../../src/rebalancer/replica-operation-observed-completion.js';
import {
  createMockCache,
  createTestCoordinator,
} from './test-helpers.js';

const {
  OPERATION_HANDLER,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  resolveOperationHandlerType,
} = OPERATION_WORKFLOW_OWNER_SHARED;

function serviceRow(entityType, entityId, replicaId, nodeId) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: entityType,
    group_id: entityType === SERVICE_TYPE.MESSAGE_GROUP ? entityId : null,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
    raft_role: 'follower',
    address: `${nodeId}/service/${replicaId}`,
  };
}

function buildEvaluationContext({rows, minReplicaCount = 1, operations = []}) {
  const calls = [];
  const context = {
    nodeId: 'owner-node',
    messageRouter: null,
    repository: {
      async getOperationsByEntity(entityType, entityId) {
        calls.push({entityType, entityId});
        return operations;
      },
      isOperationTerminal: () => false,
      isReplaceRemovePhase: (operation) =>
        operation.type === OperationType.REPLACE,
      getReplaceSourceReplicaId: (operation) => operation.sourceReplicaId,
      getReplaceTargetReplicaId: (operation) => operation.replicaId,
    },
    isRemoveInitialDispatchPhase: (operation) =>
      operation.type === OperationType.REMOVE,
    isConcurrentOperationStalePastStepTimeout: () => false,
    isConcurrentOperationTargetUncontactable: async () => false,
    resolveTimeoutCheckNowMs: () => Date.now(),
    getCriticalReplicaRowsForSafety: async () => {
      throw new Error('non-partition safety must not read partition replicas');
    },
    getEntityReplicaRowsForSafety: async () => ({available: true, rows}),
    getEntityRemoveSafetyMinReplicaCount: async () => minReplicaCount,
    isVoterReadyRoutableReplica: () => true,
    isOperationReplicaRow: (row, operation) =>
      (row.replica_id || row.service_id) === operation.replicaId,
    buildSafeRemoveSafetyEvaluation: () => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
      error: null,
    }),
    buildFailedRemoveSafetyEvaluation: (error) => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.FAIL,
      error,
    }),
    buildDeferredRemoveSafetyEvaluationForOperation: (_operation, error) => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      error,
    }),
  };
  return {calls, context};
}

test('runtime authoritative entity read owns canonical replica lineage',
  async (t) => {
    const entityId = 'svc-orders_100%';
    let observedSql = null;
    let observedParams = null;
    const gateway = {
      async readAuthoritativeRows(_tableName, sql, params) {
        observedSql = sql;
        observedParams = params;
        return {
          success: true,
          rows: [
            serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, entityId,
              `${entityId}-r2`, 'node-b'),
            serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, entityId,
              `${entityId}-r0`, 'node-c'),
            serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, entityId,
              `${entityId}-r2-shadow`, 'node-d'),
            serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, 'other',
              'other-r1', 'node-e'),
            {
              serviceId: `${entityId}-r3`,
              serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
              nodeId: 'node-f',
            },
          ],
        };
      },
    };
    const result = await readAuthoritativeEntityServiceRows(
      gateway,
      {
        partitionId: entityId,
        entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        entityId,
      },
      {},
    );
    t.equal(observedSql, ENTITY_SERVICE_ROW_READ_SQL.RUNTIME_SERVICE,
      'all consumers use the runtime lineage query');
    t.same(observedParams, [
      UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      `${entityId}-r%`,
    ], 'the broad SQL prefix is parameterized');
    t.same(result.rows.map((row) => row.service_id), [`${entityId}-r2`],
      'the owner rejects wildcard, near-prefix, and alternate row forms');
  });

test('non-partition remove safety serializes and evaluates its actual entity',
  async (t) => {
    const entityId = 'svc-runtime-safety';
    const sourceReplicaId = `${entityId}-r1`;
    const targetReplicaId = `${entityId}-r3`;
    const {calls, context} = buildEvaluationContext({
      rows: [
        serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, entityId,
          sourceReplicaId, 'node-a'),
        serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, entityId,
          `${entityId}-r2`, 'node-b'),
        serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, entityId,
          targetReplicaId, 'node-c'),
      ],
    });
    const result = await evaluateRemoveSafety(context, {
      operationId: 'runtime-replace-1',
      type: OperationType.REPLACE,
      partitionId: entityId,
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId,
      sourceReplicaId,
      replicaId: targetReplicaId,
    });
    t.equal(result.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
      'an ACTIVE canonical replacement makes count-neutral source removal safe');
    t.same(calls, [{
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId,
    }], 'serialization reads the runtime operation ledger, not a partition alias');
  });

test('move preflight preserves canonical entity identity at the safety owner',
  async (t) => {
    const owner = Object.create(PriorityRecoverySupersededTarget.prototype);
    let observedOperation = null;
    owner.getRemoveSafetyError = async (operation) => {
      observedOperation = operation;
      return null;
    };
    const entityId = 'runtime-preflight';
    await owner.getMoveSafetyError({
      type: OperationType.REMOVE,
      partitionId: entityId,
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId,
      replicaId: `${entityId}-r1`,
      nodeId: 'node-a',
    });
    t.match(observedOperation, {
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId,
      partitionId: entityId,
    }, 'preflight cannot reconstruct a runtime move as a partition operation');
    await t.rejects(
      owner.getMoveSafetyError({
        type: OperationType.REMOVE,
        partitionId: 'untyped-move',
        replicaId: 'untyped-move-r1',
      }),
      /Unsupported rebalancer entity type/,
      'the safety boundary rejects an untyped move instead of guessing',
    );
  });

test('planner handoff emits one complete move identity', (t) => {
  const owner = {
    entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entityId: 'runtime-owner',
  };
  t.same(canonicalizeRebalancerMove({
    type: OperationType.ADD,
    nodeId: 'node-a',
  }, owner), {
    type: OperationType.ADD,
    nodeId: 'node-a',
    partitionId: 'runtime-owner',
    entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entityId: 'runtime-owner',
  }, 'the owner stamps identity once before any decision boundary');
  t.throws(
    () => canonicalizeRebalancerMove({
      type: OperationType.ADD,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: 'partition-p1',
    }, owner),
    /cannot emit/,
    'a rebalancer cannot silently switch entity domains',
  );
  t.end();
});

test('non-partition remove safety never substitutes cache projection for owner rows',
  async (t) => {
    const entityId = 'runtime-owner-only';
    const safety = Object.create(PriorityPublicationSafetyRows.prototype);
    safety.repository = {
      getEntityServiceRows() {
        throw new Error('cache projection must not participate');
      },
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows() {
          return {success: false, rows: []};
        },
      },
    };
    const identity = {
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId,
    };
    const unavailable = await safety.getEntityReplicaRowsForSafety(identity);
    t.same(unavailable, {available: false, rows: []},
      'an unavailable owner read fails closed without consulting cache');

    const authoritativeRow = serviceRow(
      UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId,
      `${entityId}-r1`,
      'node-a',
    );
    safety.repository.controlPlaneSystemTableGateway.readAuthoritativeRows =
      async () => ({success: true, rows: [authoritativeRow]});
    const available = await safety.getEntityReplicaRowsForSafety(identity);
    t.same(available, {available: true, rows: [authoritativeRow]},
      'a successful owner read is the complete safety evidence');
  });

test('message-group and runtime-service floors remain entity-owned',
  async (t) => {
    const groupId = 'group-safety';
    const groupRows = [
      serviceRow(SERVICE_TYPE.MESSAGE_GROUP, groupId, 'group-r1', 'node-a'),
      serviceRow(SERVICE_TYPE.MESSAGE_GROUP, groupId, 'group-r2', 'node-b'),
      serviceRow(SERVICE_TYPE.MESSAGE_GROUP, groupId, 'group-r3', 'node-c'),
    ];
    const group = buildEvaluationContext({rows: groupRows, minReplicaCount: 3});
    const groupResult = await evaluateRemoveSafety(group.context, {
      operationId: 'group-remove-1',
      type: OperationType.REMOVE,
      partitionId: groupId,
      entityType: SERVICE_TYPE.MESSAGE_GROUP,
      entityId: groupId,
      replicaId: 'group-r1',
    });
    t.equal(groupResult.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      'message-group removal cannot cross its replicated-group floor');

    const runtimeId = 'runtime-floor';
    const runtime = buildEvaluationContext({
      rows: [
        serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, runtimeId,
          `${runtimeId}-r1`, 'node-a'),
        serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, runtimeId,
          `${runtimeId}-r2`, 'node-b'),
      ],
      minReplicaCount: 1,
    });
    const runtimeResult = await evaluateRemoveSafety(runtime.context, {
      operationId: 'runtime-remove-1',
      type: OperationType.REMOVE,
      partitionId: runtimeId,
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId: runtimeId,
      replicaId: `${runtimeId}-r1`,
    });
    t.equal(runtimeResult.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
      'runtime-service removal uses its availability floor, not Raft quorum');
  });

test('entity interaction contracts are explicit and unknown types fail closed',
  async (t) => {
    t.same(
      [...ALLOWED_UNIFIED_SERVICE_TYPES].sort(),
      Object.keys(OPERATION_HANDLER).sort(),
      'every unified lifecycle type has exactly one dispatch handler owner',
    );
    t.same(
      Object.values(REBALANCER_ENTITY_TYPE).sort(),
      [...ALLOWED_UNIFIED_SERVICE_TYPES].sort(),
      'the rebalancer exposes no stale entity type outside unified lifecycle',
    );
    t.same(
      Object.keys(ENTITY_REMOVE_SAFETY_POLICY).sort(),
      [
        SERVICE_TYPE.MESSAGE_GROUP,
        UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      ].sort(),
      'every supported non-partition workflow has an explicit safety policy',
    );
    t.equal(resolveOperationHandlerType(SERVICE_TYPE.PARTITION),
      'replica-handler', 'partition dispatch remains explicit');
    t.throws(
      () => resolveOperationHandlerType(SERVICE_TYPE.WASM_SERVICE),
      /Unsupported replica-operation entity type/,
      'the stale WASM enum cannot silently route into the partition handler',
    );

    const unsupported = buildEvaluationContext({rows: []});
    await t.rejects(
      evaluateRemoveSafety(unsupported.context, {
        operationId: 'wasm-remove-1',
        type: OperationType.REMOVE,
        partitionId: 'wasm-1',
        entityType: SERVICE_TYPE.WASM_SERVICE,
        entityId: 'wasm-1',
        replicaId: 'wasm-1-r1',
      }),
      /Unsupported rebalancer entity type/,
      'unsupported entity safety rejects instead of borrowing partition rules',
    );

    const coordinator = createTestCoordinator({enableTimeouts: false});
    try {
      await t.rejects(
        coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'wasm-1',
          entityType: SERVICE_TYPE.WASM_SERVICE,
          entityId: 'wasm-1',
          nodeId: 'node-wasm',
        }),
        /Unsupported rebalancer entity type/,
        'unsupported entities are rejected before an operation row is persisted',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('untyped operation rows are outside canonical entity reads',
  async (t) => {
    const entityId = 'shared-looking-id';
    const untypedRow = {
      operation_id: 'untyped-partition-op',
      type: OperationType.ADD,
      partition_id: entityId,
      replica_id: `${entityId}-r1`,
      target_node_id: 'node-a',
      status: ReplicaStatus.PENDING,
      workflow_step: 'PENDING',
      entity_type: null,
      entity_id: null,
    };
    const cache = createMockCache({
      replicaOperations: [
        untypedRow,
        {
          operation_id: 'typed-runtime-op',
          type: OperationType.ADD,
          partition_id: entityId,
          replica_id: `${entityId}-r2`,
          target_node_id: 'node-b',
          status: ReplicaStatus.PENDING,
          workflow_step: 'PENDING',
          entity_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
          entity_id: entityId,
        },
      ],
    });
    const coordinator = createTestCoordinator({
      enableTimeouts: false,
      systemTableCache: cache,
    });
    try {
      const runtimeOperations = await coordinator.repository
        .getOperationsByEntity(
          UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
          entityId,
        );
      t.same(runtimeOperations.map((operation) => operation.operationId),
        ['typed-runtime-op'],
        'runtime serialization sees only typed runtime operations');
      const partitionOperations = await coordinator.repository
        .getOperationsByEntity(SERVICE_TYPE.PARTITION, entityId);
      t.same(partitionOperations.map((operation) => operation.operationId),
        [],
        'an untyped row cannot acquire partition semantics from partition_id');
      t.throws(
        () => coordinator.repository.rowToOperation(untypedRow),
        /Unsupported rebalancer entity type/,
        'direct replay rejects an untyped operation instead of inventing identity',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('observed completion consumes the same entity identity contract',
  async (t) => {
    const entityId = 'runtime-completion';
    const record = {
      type: OperationType.ADD,
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId,
      replicaId: `${entityId}-r2`,
      targetNodeId: 'node-b',
    };
    t.equal(hasObservedCompletedReplicaOperation(record, {
      serviceRows: [serviceRow(
        UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        entityId,
        `${entityId}-r2`,
        'node-b',
      )],
    }), true, 'canonical runtime lineage completes the exact operation');
    t.equal(hasObservedCompletedReplicaOperation({
      ...record,
      entityId: 'different-runtime',
    }, {
      serviceRows: [serviceRow(
        UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        entityId,
        `${entityId}-r2`,
        'node-b',
      )],
    }), false, 'a row cannot complete an operation for a different entity');
  });
