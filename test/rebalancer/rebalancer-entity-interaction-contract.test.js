import {test} from '../../src/test-helpers/tap.js';
import {NODE_STATE} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
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
import {
  canonicalizeRebalancerMove,
} from '../../src/rebalancer/rebalancer-entity-identity.js';
import {
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_ENTITY_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {buildCanonicalReplicaOperationRow} from
  '../../src/rebalancer/replica-operation-repository-mutation-row-methods.js';
import {
  hasObservedCompletedReplicaOperation,
} from '../../src/rebalancer/replica-operation-observed-completion.js';
import {
  buildMockPolicyAuthorityWitness,
  createMockCache,
  createMockPolicyService,
  createTestCoordinator,
} from './test-helpers.js';
import {
  buildCommittedOperationFixture,
  workflowFixtureHistory,
} from './operation-outcome-fixture.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';

const {
  OPERATION_HANDLER,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCER_SKIP_REASON,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  ReplicaOperationResponseStatus,
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
      isReplaceRemoveDispatchPhase: (operation) =>
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
    buildDeferredRemoveSafetyEvaluation: (error, deferReason) => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      deferReason,
      error,
    }),
    buildDeferredRemoveSafetyEvaluationForOperation: (_operation, error) => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      error,
    }),
  };
  return {calls, context};
}

const OWNER_NODE = 'owner-node';

function readyNodeRow(nodeId) {
  return {node_id: nodeId, status: NODE_STATE.ACTIVE};
}

// The effect owner's own evaluation of a removal that exists (the dispatch
// gate). The real workflow owner proves the subject's own durable row before
// it arbitrates competitors (getRequiredRemoveArbitrationCompetitors), so the
// subject is its owner's record committed at the evaluated step, alone on its
// entity, in the coordinator's production-schema ledger. `calls` records each
// entity the owner's effect-arbitration ledger read was asked for.
function createRemovalSafetyOwner({subject, services, nodes = [], tablePolicyService}) {
  const coordinator = createTestCoordinator({
    nodeId: OWNER_NODE,
    enableTimeouts: false,
    cacheData: {
      replicaOperations: [buildCanonicalReplicaOperationRow(subject, null)],
      services,
      nodes,
    },
    tablePolicyService,
  });
  const owner = coordinator.workflowOwner;
  const {repository} = owner;
  const calls = [];
  const readRequiredEntityOperationRows =
    repository.readRequiredEntityOperationRows.bind(repository);
  repository.readRequiredEntityOperationRows = (entityType, entityId) => {
    calls.push({entityType, entityId});
    return readRequiredEntityOperationRows(entityType, entityId);
  };
  return {calls, coordinator, owner};
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
    // The REPLACE is evaluated at its source-removal dispatch (ACTIVE).
    const replace = buildCommittedOperationFixture({
      operationId: 'runtime-replace-1',
      type: OperationType.REPLACE,
      partitionId: entityId,
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId,
      sourceReplicaId,
      replicaId: targetReplicaId,
      sourceNodeId: OWNER_NODE,
      targetNodeId: 'node-c',
    }, WORKFLOW_STEP.ACTIVE, Date.now());
    const {calls, coordinator, owner} = createRemovalSafetyOwner({
      subject: replace,
      services: [
        serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, entityId,
          sourceReplicaId, 'node-a'),
        serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, entityId,
          `${entityId}-r2`, 'node-b'),
        serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, entityId,
          targetReplicaId, 'node-c'),
      ],
    });
    try {
      const result = await evaluateRemoveSafety(owner, replace);
      t.equal(result.classification,
        REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
        'an ACTIVE canonical replacement makes count-neutral source removal safe');
      t.same(calls, [{
        entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        entityId,
      }], 'serialization reads the runtime operation ledger, not a partition alias');
    } finally {
      await coordinator.shutdown();
    }
  });

test('move preflight preserves canonical entity identity at the safety owner',
  async (t) => {
    // The real workflow owner (the coordinator's move-safety owner). Its
    // preflight hands the prospective operation to the remove-safety
    // evaluator, whose first owner question is the removal phase; a
    // pass-through observer there records the operation the safety owner got.
    const coordinator = createTestCoordinator({enableTimeouts: false});
    const owner = coordinator.workflowOwner;
    let observedOperation = null;
    const isRemoveInitialDispatchPhase = owner.isRemoveInitialDispatchPhase.bind(owner);
    owner.isRemoveInitialDispatchPhase = (operation) => {
      observedOperation ??= operation;
      return isRemoveInitialDispatchPhase(operation);
    };
    const entityId = 'runtime-preflight';
    try {
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
    } finally {
      await coordinator.shutdown();
    }
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
      async () => ({
        success: true,
        rows: [authoritativeRow],
        rowSetComplete: true,
        readAuthorityWitness: buildMockPolicyAuthorityWitness('services-p1'),
      });
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
    // Each REMOVE is evaluated at its initial dispatch, after its claim.
    const groupRemove = buildCommittedOperationFixture({
      operationId: 'group-remove-1',
      type: OperationType.REMOVE,
      partitionId: groupId,
      entityType: SERVICE_TYPE.MESSAGE_GROUP,
      entityId: groupId,
      replicaId: 'group-r1',
      sourceNodeId: OWNER_NODE,
      targetNodeId: 'node-a',
    }, WORKFLOW_STEP.SENDING, Date.now());
    const group = createRemovalSafetyOwner({
      subject: groupRemove,
      services: groupRows,
      // Every group replica's node is routable now, so all three count.
      nodes: ['node-a', 'node-b', 'node-c'].map(readyNodeRow),
      // The group's authoritative policy fact: a three-replica floor.
      tablePolicyService: createMockPolicyService({
        getMessageGroupPolicy: () => ({
          ...REBALANCER_DEFAULT_POLICY.MESSAGE_GROUP,
          minReplicaCount: 3,
        }),
      }),
    });
    let groupResult;
    try {
      groupResult = await evaluateRemoveSafety(group.owner, groupRemove);
    } finally {
      await group.coordinator.shutdown();
    }
    // The owner fails, never defers, a REMOVE that would cross a
    // non-system floor: its deferral builder defers only a REPLACE removal
    // phase or an over-replicated system-table REMOVE, and the dispatch gate
    // then fails the operation instead of retrying it.
    t.equal(groupResult.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.FAIL,
      'message-group removal cannot cross its replicated-group floor');
    t.equal(groupResult.error,
      'message_group group-safety would drop active replicas below minimum (2/3)',
      'the refusal names the group floor and the projected count');

    const runtimeId = 'runtime-floor';
    const runtimeRemove = buildCommittedOperationFixture({
      operationId: 'runtime-remove-1',
      type: OperationType.REMOVE,
      partitionId: runtimeId,
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId: runtimeId,
      replicaId: `${runtimeId}-r1`,
      sourceNodeId: OWNER_NODE,
      targetNodeId: 'node-a',
    }, WORKFLOW_STEP.SENDING, Date.now());
    // The runtime-service floor is its policy owner's minimum (one replica).
    const runtime = createRemovalSafetyOwner({
      subject: runtimeRemove,
      services: [
        serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, runtimeId,
          `${runtimeId}-r1`, 'node-a'),
        serviceRow(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, runtimeId,
          `${runtimeId}-r2`, 'node-b'),
      ],
    });
    try {
      const runtimeResult = await evaluateRemoveSafety(runtime.owner, runtimeRemove);
      t.equal(runtimeResult.classification,
        REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
        'runtime-service removal uses its availability floor, not Raft quorum');
    } finally {
      await runtime.coordinator.shutdown();
    }
  });

test('message-group REMOVE withholds on unavailable evidence and decides after evidence recovers',
  async (t) => {
    const runPairedWitness = async ({groupId, operationId, replicaIds}) => {
      const subject = buildCommittedOperationFixture({
        operationId,
        type: OperationType.REMOVE,
        partitionId: groupId,
        entityType: SERVICE_TYPE.MESSAGE_GROUP,
        entityId: groupId,
        replicaId: replicaIds[0],
        sourceNodeId: OWNER_NODE,
        targetNodeId: 'node-a',
      }, WORKFLOW_STEP.SENDING, Date.now());
      const nodeIds = replicaIds.map((_, index) =>
        `node-${String.fromCodePoint(97 + index)}`);
      const services = replicaIds.map((replicaId, index) =>
        serviceRow(SERVICE_TYPE.MESSAGE_GROUP, groupId, replicaId, nodeIds[index]));
      const {coordinator, owner} = createRemovalSafetyOwner({
        subject,
        services,
        nodes: nodeIds.map(readyNodeRow),
        tablePolicyService: createMockPolicyService({
          getMessageGroupPolicy: () => ({
            ...REBALANCER_DEFAULT_POLICY.MESSAGE_GROUP,
            minReplicaCount: 3,
          }),
        }),
      });
      const deliveries = [];
      owner.messageRouter = {
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        async deliver(address, request) {
          deliveries.push({address, request});
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: ReplicaOperationResponseStatus.INITIATED,
          });
        },
      };
      const gateway = owner.repository.controlPlaneSystemTableGateway;
      const readAuthoritativeRows = gateway.readAuthoritativeRows.bind(gateway);
      let servicesUnavailable = true;
      gateway.readAuthoritativeRows = async (tableName, sql, params, options) => {
        if (servicesUnavailable && tableName === 'services') {
          return {success: false, rowSetComplete: false, rows: []};
        }
        return readAuthoritativeRows(tableName, sql, params, options);
      };
      return {
        coordinator,
        owner,
        subject,
        deliveries,
        setServicesUnavailable: (value) => {
          servicesUnavailable = value;
        },
      };
    };

    const aboveFloor = await runPairedWitness({
      groupId: 'group-recover-proceed',
      operationId: 'group-remove-recover-proceed',
      replicaIds: ['group-r1', 'group-r2', 'group-r3', 'group-r4'],
    });
    try {
      const deferredEval = await aboveFloor.owner.evaluateRemoveSafety(aboveFloor.subject);
      t.equal(deferredEval.classification,
        REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
        'temporarily unavailable replica observation defers message-group REMOVE');
      t.equal(deferredEval.deferReason,
        REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED);
      t.equal(deferredEval.error,
        'message_group group-recover-proceed safety check unavailable');

      const deferredDispatch =
        await aboveFloor.owner.executeOperationInternal(aboveFloor.subject);
      t.equal(deferredDispatch.skipped, true,
        'unavailable replica observation withholds REMOVE instead of failing');
      t.equal(deferredDispatch.reason, REBALANCER_SKIP_REASON.SAFETY_BLOCKED);
      t.equal(deferredDispatch.deferReason,
        REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED);
      t.equal(aboveFloor.deliveries.length, 0);
      t.equal(
        aboveFloor.owner.safetyDeferredRetryTimerByOperationId.has(
          aboveFloor.subject.operationId,
        ),
        true,
        'withheld message-group REMOVE arms the owned deferred-safety continuation',
      );
      const afterDefer = await aboveFloor.owner.repository.queryOperationById(
        aboveFloor.subject.operationId,
      );
      t.equal(afterDefer.workflowStep, WORKFLOW_STEP.SENDING);
      t.equal(afterDefer.completedAt, null);

      aboveFloor.setServicesUnavailable(false);
      const getMin = aboveFloor.owner.getEntityRemoveSafetyMinReplicaCount;
      aboveFloor.owner.getEntityRemoveSafetyMinReplicaCount = async () => null;
      try {
        const policyDeferred =
          await aboveFloor.owner.evaluateRemoveSafety(aboveFloor.subject);
        t.equal(policyDeferred.classification,
          REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
          'unreadable policy minimum defers message-group REMOVE instead of failing');
        t.equal(policyDeferred.deferReason,
          REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED);
        t.equal(policyDeferred.error,
          'message_group group-recover-proceed safety policy unavailable');
      } finally {
        aboveFloor.owner.getEntityRemoveSafetyMinReplicaCount = getMin;
      }

      const recoveredEval = await aboveFloor.owner.evaluateRemoveSafety(aboveFloor.subject);
      t.equal(recoveredEval.classification,
        REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
        'recovered evidence above floor allows the message-group REMOVE');
      const recoveredDispatch =
        await aboveFloor.owner.executeOperationInternal(aboveFloor.subject);
      t.equal(recoveredDispatch.success, true);
      t.equal(aboveFloor.deliveries.length, 1,
        'recovered evidence above floor dispatches REMOVE_REPLICA');
      t.equal(
        aboveFloor.owner.safetyDeferredRetryTimerByOperationId.has(
          aboveFloor.subject.operationId,
        ),
        false,
      );
    } finally {
      await aboveFloor.coordinator.shutdown();
    }

    const belowFloor = await runPairedWitness({
      groupId: 'group-recover-fail',
      operationId: 'group-remove-recover-fail',
      replicaIds: ['group-r1', 'group-r2', 'group-r3'],
    });
    try {
      const deferredDispatch =
        await belowFloor.owner.executeOperationInternal(belowFloor.subject);
      t.equal(deferredDispatch.skipped, true,
        'below-floor candidate still withholds while replica observation is unavailable');
      t.equal(deferredDispatch.reason, REBALANCER_SKIP_REASON.SAFETY_BLOCKED);
      t.equal(belowFloor.deliveries.length, 0);
      t.equal(
        belowFloor.owner.safetyDeferredRetryTimerByOperationId.has(
          belowFloor.subject.operationId,
        ),
        true,
      );

      belowFloor.setServicesUnavailable(false);
      const provenEval = await belowFloor.owner.evaluateRemoveSafety(belowFloor.subject);
      t.equal(provenEval.classification,
        REMOVE_SAFETY_EVALUATION_CLASSIFICATION.FAIL,
        'recovered evidence proving a minimum-floor breach fails terminally');
      t.equal(provenEval.error,
        'message_group group-recover-fail would drop active replicas below minimum (2/3)');
      const failedDispatch =
        await belowFloor.owner.executeOperationInternal(belowFloor.subject);
      t.equal(failedDispatch.success, false);
      t.equal(failedDispatch.terminal, true);
      t.equal(failedDispatch.error,
        'message_group group-recover-fail would drop active replicas below minimum (2/3)');
      t.equal(belowFloor.deliveries.length, 0);
      const afterFail = await belowFloor.owner.repository.queryOperationById(
        belowFloor.subject.operationId,
      );
      t.equal(afterFail.workflowStep, WORKFLOW_STEP.FAILED);
    } finally {
      await belowFloor.coordinator.shutdown();
    }
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
    // Only the identity is malformed: the row otherwise carries the durable
    // shape (JSON-text producer history), so the identity owner is what
    // refuses it.
    const untypedRow = {
      operation_id: 'untyped-partition-op',
      type: OperationType.ADD,
      partition_id: entityId,
      replica_id: `${entityId}-r1`,
      target_node_id: 'node-a',
      status: ReplicaStatus.PENDING,
      workflow_step: 'PENDING',
      created_at: 1000,
      updated_at: 1000,
      steps_history: JSON.stringify(workflowFixtureHistory('PENDING', 1000)),
      entity_type: null,
      entity_id: null,
    };
    const cache = createMockCache({
      replicaOperations: [
        {
          operation_id: 'typed-runtime-op',
          type: OperationType.ADD,
          partition_id: entityId,
          replica_id: `${entityId}-r2`,
          source_node_id: 'test-node-1',
          target_node_id: 'node-b',
          status: ReplicaStatus.PENDING,
          workflow_step: 'PENDING',
          created_at: 1000,
          updated_at: 1000,
          entity_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
          entity_id: entityId,
        },
      ],
    });
    const coordinator = createTestCoordinator({
      enableTimeouts: false,
      systemTableCache: cache,
    });
    // The owner's schema refuses an untyped committed row (entity_type and
    // entity_id are NOT NULL), so the untyped row can only be a cache
    // observation that never committed: it reaches the cache after the
    // ledger is built from the committed rows.
    cache.upsert('replica_operations', untypedRow);
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
