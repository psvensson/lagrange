// A create that fails terminally AFTER its target was admitted as a voter
// (the ack-loss wedge, F3 (d)): the target's SYNCING row is durable, the
// leader admitted it on that row, and its port is closed. The handler must
// publish FAILED before the operation can become terminal. The existing owner
// of failed-create target cleanup - the
// planner's FAILED_REPLICA cure, fed by the terminal failed create targets of
// the rebalancer's replica state - must cover an ADD as it covers a REPLACE,
// so the closed voter is removed (REMOVE -> REMOVING -> the row-driven
// RemoveNode) instead of leaving a group leaderless with it in its ConfState.
//
// M2: the cure never names a LIVE target (its row ACTIVE), and an ADD whose
// target went live is never failed at all: the operation owner's one
// post-intent no-fail guard (shared with REPLACE) completes it instead -
// even when the SYNCING step timer fires after the promotion.

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  MOVE_REASON,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {OPERATION_METADATA_KEY, OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {REPLACE_POST_INTENT_FAILURE} from
  '../../src/rebalancer/operation-workflow-replace-owner.js';
import {buildFailedCreateCleanupToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';
import {
  armFailedCreateCleanupRelease,
  recoverFailedCreateCleanupReleaseDebt,
  runTerminalTransitionRepairAttempt,
} from '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {REBALANCE_COORDINATOR_LOG_MSG} from
  '../../src/rebalancer/rebalancer-constants.js';
import {
  createMockCache,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';

const PARTITION_ID = 'orders-p1';
const TARGET_ID = 'orders-p1-r4';
const TARGET_NODE = 'node-4';
const CREATED_AT = 10;
const FAILED_STATE_ENTERED_AT = 20;
const CREATE_ADMISSION_TOKEN = 'create-admission-token';
const CREATE_ATTEMPT_TOKEN = 'create-attempt-token';

function terminalCleanupRemoveOperation(operationId = 'cleanup-release-op') {
  return {
    operationId,
    type: OperationType.REMOVE,
    partitionId: PARTITION_ID,
    replicaId: TARGET_ID,
    targetNodeId: TARGET_NODE,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    entityId: PARTITION_ID,
    status: 'removed',
    workflowStep: WORKFLOW_STEP.REMOVED,
    completedAt: 50,
    [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]: {
      cleanup_token: buildFailedCreateCleanupToken('create-release-op'),
      create_attempt_token: CREATE_ATTEMPT_TOKEN,
    },
  };
}

function terminalCleanupRepairOwner(
  operation,
  deliveries = [],
  logs = [],
  options = {},
) {
  const scheduled = [];
  return {
    isShuttingDown: false,
    isInitialized: true,
    terminalTransitionRepairStateByOperationId: new Map(),
    terminalTransitionRepairTimerByOperationId: new Map(),
    repository: {
      queryReplicaOperationPersistenceAuthorityOperation: async () =>
        operation,
      queryTerminalFailedCreateCleanupOperations: async () => [operation],
    },
    logger: {
      info(message, context) {
        logs.push({level: 'info', message, context});
      },
      warn() {},
      error() {},
    },
    cloneOperationSnapshot: (candidate) => structuredClone(candidate),
    usesNativeRetryTimers: options.usesNativeRetryTimers === true,
    setTimeoutFn(callback) {
      const handle = {
        callback,
        unrefCalls: 0,
        unref() {
          this.unrefCalls += 1;
        },
      };
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    getOperationOwnerSingleFlightKey: (operationId) => operationId,
    operationWorkflowRunExclusive: async (_key, action) => action(),
    deliverReplicaOperationRequest: async (_operation, _target, request) => {
      deliveries.push(request);
      return deliveries.length === 1 ? {
        acknowledged: false,
        deliveryState: 'deferred',
        status: 'error',
      } : {
        acknowledged: true,
        deliveryState: 'delivered',
        status: 'completed',
      };
    },
    scheduled,
  };
}

function lifecycleRow(status, stateEnteredAt = FAILED_STATE_ENTERED_AT,
  cleanupToken = null, createAttemptToken = CREATE_ATTEMPT_TOKEN) {
  return {
    service_id: TARGET_ID,
    replica_id: TARGET_ID,
    group_id: null,
    service_type: 'partition',
    partition_id: PARTITION_ID,
    node_id: TARGET_NODE,
    address: `${TARGET_NODE}/partition/${TARGET_ID}`,
    raft_role: status === ReplicaStatus.ACTIVE ? 'follower' : 'learner',
    status,
    cleanup_token: cleanupToken,
    create_attempt_token: createAttemptToken,
    created_at: CREATED_AT,
    state_entered_at: stateEnteredAt,
  };
}

function lifecyclePrecondition(row) {
  return {
    service_id: row.service_id,
    replica_id: row.replica_id,
    group_id: row.group_id,
    partition_id: row.partition_id,
    node_id: row.node_id,
    service_type: row.service_type,
    status: row.status,
    cleanup_token: row.cleanup_token ?? null,
    create_attempt_token: row.create_attempt_token ?? null,
    created_at: row.created_at,
    state_entered_at: row.state_entered_at,
  };
}

function operationRow(type, status, failedPrecondition = null) {
  const operationId = `op-${type}-${status}`;
  const stepsHistory = [{
    step: status === ReplicaStatus.FAILED ?
      WORKFLOW_STEP.FAILED : WORKFLOW_STEP.SYNCING,
    timestamp: 1,
  }];
  if (failedPrecondition) {
    stepsHistory[0][
      OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
    ] = failedPrecondition;
  }
  return {
    operation_id: operationId,
    type,
    partition_id: PARTITION_ID,
    replica_id: TARGET_ID,
    target_node_id: TARGET_NODE,
    status,
    workflow_step: status === ReplicaStatus.FAILED ?
      WORKFLOW_STEP.FAILED : WORKFLOW_STEP.SYNCING,
    completed_at: status === ReplicaStatus.FAILED ? 2 : null,
    created_at: 1,
    updated_at: 1,
    steps_history: JSON.stringify(stepsHistory),
    entity_type: REBALANCER_ENTITY_TYPE.PARTITION,
    entity_id: PARTITION_ID,
    create_admission_state: 'MATERIALIZED',
    create_admission_token: CREATE_ADMISSION_TOKEN,
    create_admission_replica_created_at: CREATED_AT,
    create_admission_attempt_token: CREATE_ATTEMPT_TOKEN,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: 1,
    create_admission_workflow_updated_at: 1,
    create_admission_owner_incarnation: 1,
  };
}

async function installCreateAdmissionAttempt(coordinator, operation) {
  const fields = {
    create_admission_state: 'MATERIALIZED',
    create_admission_token: CREATE_ADMISSION_TOKEN,
    create_admission_replica_created_at: CREATED_AT,
    create_admission_attempt_token: CREATE_ATTEMPT_TOKEN,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: 1,
    create_admission_workflow_updated_at: operation.updatedAt,
    create_admission_owner_incarnation: 1,
  };
  Object.assign(operation, {
    createAdmissionState: fields.create_admission_state,
    createAdmissionToken: fields.create_admission_token,
    createAdmissionReplicaCreatedAt:
      fields.create_admission_replica_created_at,
    createAdmissionAttemptToken: fields.create_admission_attempt_token,
    createAdmissionPreviousAttemptToken:
      fields.create_admission_previous_attempt_token,
    createAdmissionAttemptSeq: fields.create_admission_attempt_seq,
    createAdmissionWorkflowUpdatedAt:
      fields.create_admission_workflow_updated_at,
    createAdmissionOwnerIncarnation:
      fields.create_admission_owner_incarnation,
  });
  await coordinator.repository.controlPlaneSystemTableGateway.submitMutation({
    operation: 'update',
    tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    whereClause: {operation_id: operation.operationId},
    data: fields,
  });
}

// The planner's moves with the FAILED ADD's target beside the other
// replicas: above the target count (three others) or at it (two others).
const OTHERS_ABOVE_TARGET = Object.freeze(['node-1', 'node-2', 'node-3']);
function plannedMoves(rebalancer, targetStatus,
  {others = OTHERS_ABOVE_TARGET, targetFields = {}} = {}) {
  const currentReplicas = others.map(
    (nodeId, index) => ({replica_id: `orders-p1-r${index + 1}`,
      node_id: nodeId, status: ReplicaStatus.ACTIVE}));
  currentReplicas.push({replica_id: TARGET_ID, node_id: TARGET_NODE,
    status: targetStatus, ...targetFields});
  const planner = new MovePlanner({
    entityId: PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: {
      getAvailableNodes: () => [],
      getCurrentReplicas: () => currentReplicas,
      getHealthyReplicas: (replicas) => replicas.filter((replica) =>
        replica.status === ReplicaStatus.ACTIVE),
      getInFlightOperations: () => [],
      getGlobalTopologyBlockingInFlightOperations: () => [],
      getTerminalFailedReplaceTargetReplicaIds: () =>
        rebalancer.getTerminalFailedReplaceTargetReplicaIds(),
      getTerminalFailedCreateTargetReplicaIds: () =>
        rebalancer.getTerminalFailedCreateTargetReplicaIds(),
      getFailedCreateTargetCleanupPrecondition: (replicaId) =>
        rebalancer.getFailedCreateTargetCleanupPrecondition(replicaId),
      hasPendingMove: () => false,
      hasPendingAddForNode: () => false,
    },
  });
  return planner.calculateMoves(currentReplicas, {
    targetReplicaCount: 3,
    targetNodes: others.length === 3 ? others : [...others, TARGET_NODE],
    degraded: false,
  });
}

test('a terminally failed ADD leaves no admitted-but-closed target', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });

  for (const type of [OperationType.ADD, OperationType.REPLACE]) {
    await t.test(`a FAILED ${type} names its target for cleanup`, async (t) => {
      const harness = await authoritativeCleanupHarness(
        ReplicaStatus.FAILED,
        {operationType: type},
      );
      try {
        await harness.rebalancer.refreshFailedCreateTargetCleanupDecisions();
        t.same([
          ...harness.rebalancer.getTerminalFailedReplaceTargetReplicaIds(),
        ], [TARGET_ID]);
      } finally {
        harness.rebalancer.shutdown();
        await harness.coordinator.shutdown();
      }
    });
  }

  await t.test('an in-flight ADD does not', async (t) => {
    const harness = await authoritativeCleanupHarness(
      ReplicaStatus.FAILED,
      {operationStatus: ReplicaStatus.SYNCING},
    );
    try {
      await harness.rebalancer.refreshFailedCreateTargetCleanupDecisions();
      t.same([
        ...harness.rebalancer.getTerminalFailedReplaceTargetReplicaIds(),
      ], []);
    } finally {
      harness.rebalancer.shutdown();
      await harness.coordinator.shutdown();
    }
  });

  await t.test('the planner removes the exact durably FAILED target of a ' +
    'terminal ADD and carries its owner precondition', async (t) => {
    const harness = await authoritativeCleanupHarness(ReplicaStatus.FAILED);
    try {
      await harness.rebalancer.refreshFailedCreateTargetCleanupDecisions();
      const moves = plannedMoves(harness.rebalancer, ReplicaStatus.SYNCING);
      t.equal(moves.length, 1);
      t.match(moves[0], {
        type: REBALANCER_MOVE_TYPE.REMOVE,
        replicaId: TARGET_ID,
        nodeId: TARGET_NODE,
        reason: MOVE_REASON.REPLICA_FAILED,
      });
      t.same(
        moves[0][
          ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
        ],
        lifecyclePrecondition(lifecycleRow(
          ReplicaStatus.FAILED,
          FAILED_STATE_ENTERED_AT,
          buildFailedCreateCleanupToken('op-ADD-failed'),
        )),
      );
    } finally {
      harness.rebalancer.shutdown();
      await harness.coordinator.shutdown();
    }
  });

  for (const type of [OperationType.ADD, OperationType.REPLACE]) {
    await t.test(`M2: a FAILED ${type} whose target is live (ACTIVE) names ` +
      'no cleanup target', async (t) => {
      const harness = await authoritativeCleanupHarness(
        ReplicaStatus.ACTIVE,
        {operationType: type},
      );
      try {
        await harness.rebalancer.refreshFailedCreateTargetCleanupDecisions();
        t.same([
          ...harness.rebalancer.getTerminalFailedReplaceTargetReplicaIds(),
        ], []);
      } finally {
        harness.rebalancer.shutdown();
        await harness.coordinator.shutdown();
      }
    });
  }

  await t.test('M2: the planner never plans a failed-target REMOVE of a ' +
    'FAILED ADD\'s live voter', async (t) => {
    const harness = await authoritativeCleanupHarness(ReplicaStatus.ACTIVE);
    try {
      await harness.rebalancer.refreshFailedCreateTargetCleanupDecisions();
      t.notOk(plannedMoves(harness.rebalancer, ReplicaStatus.ACTIVE,
        {others: ['node-1', 'node-2']})
        .some((move) => move.type === REBALANCER_MOVE_TYPE.REMOVE &&
          move.replicaId === TARGET_ID),
      'at the target count: no REMOVE of the healthy voter');
      t.notOk(plannedMoves(harness.rebalancer, ReplicaStatus.ACTIVE)
        .some((move) => move.reason === MOVE_REASON.REPLICA_FAILED),
      'above it: the surplus is ordinary placement, never a failed-target cure');
    } finally {
      harness.rebalancer.shutdown();
      await harness.coordinator.shutdown();
    }
  });
});

// The real operation owner (coordinator workflow owner) with the target's
// authoritative services row read through its repository.
async function addHarness() {
  const target = {status: ReplicaStatus.SYNCING, cleanupToken: null};
  const coordinator = createTestCoordinator({
    nodeId: 'node-1',
    enableTimeouts: false,
    sqlQueryResults: {
      get 'FROM services WHERE service_id = ?'() {
        return {success: true, affectedRows: 1, rows: [
          lifecycleRow(target.status, FAILED_STATE_ENTERED_AT,
            target.cleanupToken),
        ]};
      },
    },
  });
  const owner = coordinator.workflowOwner;
  const operation = await coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    nodeId: TARGET_NODE,
    replicaId: TARGET_ID,
  });
  await installCreateAdmissionAttempt(coordinator, operation);
  await owner.updateStep(operation, WORKFLOW_STEP.SYNCING);
  target.operationId = operation.operationId;
  return {coordinator, owner, operation, target};
}

test('M2: an ADD whose target went live is never failed; it completes',
  async (t) => {
    t.beforeEach(() => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});
    });

    await t.test('the SYNCING step timer fires after the promotion: the ADD ' +
      'completes, not FAILED', async (t) => {
      const harness = await addHarness();
      try {
        const clock = {offsetMs: 0};
        harness.owner.timeSource = {now: () => Date.now() + clock.offsetMs};
        // The target is promoted (its row ACTIVE) as the timer fires: after
        // the timeout's progress reconcile read SYNCING, before its failure.
        const warn = harness.owner.logger.warn.bind(harness.owner.logger);
        harness.owner.logger.warn = (message, context) => {
          if (message === REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TIMED_OUT) {
            harness.target.status = ReplicaStatus.ACTIVE;
          }
          return warn(message, context);
        };
        clock.offsetMs = 3_600_000;
        await harness.owner.checkTimeouts();
        const persisted = await harness.coordinator.getOperation(
          harness.operation.operationId);
        t.equal(harness.target.status, ReplicaStatus.ACTIVE,
          'the timer fired after the promotion');
        t.equal(persisted.workflowStep, WORKFLOW_STEP.ACTIVE,
          'the ADD completed');
        t.not(persisted.status, ReplicaStatus.FAILED, 'never FAILED');
      } finally {
        await harness.coordinator.shutdown();
      }
    });

    await t.test('any failure of an ADD whose target is live is refused and ' +
      'completed', async (t) => {
      const harness = await addHarness();
      try {
        harness.target.status = ReplicaStatus.ACTIVE;
        await harness.owner.failOperation(harness.operation,
          'Timeout in SYNCING step after 300001ms');
        const persisted = await harness.coordinator.getOperation(
          harness.operation.operationId);
        t.equal(persisted.workflowStep, WORKFLOW_STEP.ACTIVE);
      } finally {
        await harness.coordinator.shutdown();
      }
    });

    await t.test('an ADD whose target is not live still fails', async (t) => {
      const harness = await addHarness();
      try {
        // The executor reports terminal create failure only after the
        // lifecycle owner has confirmed this exact durable FAILED generation.
        harness.target.status = ReplicaStatus.FAILED;
        harness.target.cleanupToken = buildFailedCreateCleanupToken(
          harness.operation.operationId,
        );
        await harness.owner.failOperation(harness.operation,
          'Timeout in SYNCING step after 300001ms');
        const persisted = await harness.coordinator.getOperation(
          harness.operation.operationId);
        t.equal(persisted.workflowStep, WORKFLOW_STEP.FAILED);
      } finally {
        await harness.coordinator.shutdown();
      }
    });
  });

async function authoritativeCleanupHarness(authoritativeStatus, options = {}) {
  const projectedTarget = lifecycleRow(ReplicaStatus.SYNCING);
  const operationStatus = options.operationStatus || ReplicaStatus.FAILED;
  const operationType = options.operationType || OperationType.ADD;
  const operationId = `op-${operationType}-${operationStatus}`;
  const cleanupToken = buildFailedCreateCleanupToken(operationId);
  const failedRow = lifecycleRow(
    ReplicaStatus.FAILED,
    FAILED_STATE_ENTERED_AT,
    cleanupToken,
  );
  const cache = createMockCache({
    services: [projectedTarget],
    replicaOperations: [operationRow(
      operationType,
      operationStatus,
      operationStatus === ReplicaStatus.FAILED ?
        lifecyclePrecondition(failedRow) : null,
    )],
  });
  const coordinator = createTestCoordinator({
    nodeId: 'node-1',
    enableTimeouts: false,
    systemTableCache: cache,
    sqlQueryResults: {
      get 'FROM services WHERE service_id = ?'() {
        if (options.authorityUnavailable === true) {
          return {success: false, error: 'authority unavailable'};
        }
        if (options.authoritativeAbsent === true) {
          return {success: true, affectedRows: 0, rows: []};
        }
        return {success: true, affectedRows: 1, rows: [{
          ...lifecycleRow(
            authoritativeStatus,
            options.authoritativeStateEnteredAt || FAILED_STATE_ENTERED_AT,
            authoritativeStatus === ReplicaStatus.FAILED ? cleanupToken : null,
            options.authoritativeCreateAttemptToken || CREATE_ATTEMPT_TOKEN,
          ),
        }]};
      },
    },
  });
  const rebalancer = createTestRebalancer({
    entityId: PARTITION_ID,
    nodeId: 'node-1',
    systemTableCache: cache,
    rebalanceCoordinator: coordinator,
  });
  return {cache, coordinator, rebalancer};
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return {promise, resolve};
}

test('M2 owner boundary: cleanup follows authoritative lifecycle, not a ' +
  'lagging SERVICES projection', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });

  for (const [authoritativeStatus, expectedTargets] of [
    [ReplicaStatus.ACTIVE, []],
    [ReplicaStatus.FAILED, [TARGET_ID]],
  ]) {
    await t.test(`authoritative ${authoritativeStatus}`, async (t) => {
      const harness = await authoritativeCleanupHarness(authoritativeStatus);
      try {
        const observation = await harness.coordinator.repository
          .getActualReplicaObservation(
            TARGET_ID,
            PARTITION_ID,
            TARGET_NODE,
            {allowCacheFallback: false},
          );
        t.equal(observation.lifecycleStatus, authoritativeStatus,
          'the authoritative owner reports the paired lifecycle state');
        await harness.rebalancer.refreshFailedCreateTargetCleanupDecisions();
        t.same([
          ...harness.rebalancer
            .getTerminalFailedReplaceTargetReplicaIds(),
        ], expectedTargets,
        'the cleanup decision consumes the authoritative owner verdict');
        if (expectedTargets.length === 0) {
          t.notOk(plannedMoves(harness.rebalancer, ReplicaStatus.FAILED)
            .some((move) => move.reason === MOVE_REASON.REPLICA_FAILED),
          'projected FAILED cannot bypass an ineligible owner decision');
        }
      } finally {
        harness.rebalancer.shutdown();
        await harness.coordinator.shutdown();
      }
    });
  }

  for (const [label, options] of [
    ['absent', {authoritativeAbsent: true}],
    ['unavailable', {authorityUnavailable: true}],
    ['newer FAILED generation', {authoritativeStateEnteredAt:
      FAILED_STATE_ENTERED_AT + 1}],
    ['newer create attempt', {authoritativeCreateAttemptToken:
      `${CREATE_ATTEMPT_TOKEN}-2`}],
  ]) {
    await t.test(`authoritative ${label} is not cleanup eligibility`,
      async (t) => {
        const harness = await authoritativeCleanupHarness(
          ReplicaStatus.FAILED,
          options,
        );
        try {
          await harness.rebalancer.refreshFailedCreateTargetCleanupDecisions();
          t.same([
            ...harness.rebalancer.getTerminalFailedReplaceTargetReplicaIds(),
          ], []);
          t.notOk(plannedMoves(harness.rebalancer, ReplicaStatus.FAILED)
            .some((move) => move.reason === MOVE_REASON.REPLICA_FAILED),
          'projected FAILED cannot become tokenless cleanup');
        } finally {
          harness.rebalancer.shutdown();
          await harness.coordinator.shutdown();
        }
      });
  }

  await t.test('a projected create-phase FAILED row cannot outrun its ' +
    'operation projection or cleanup claim', async (t) => {
    const noOwnerDecision = {
      getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
      getTerminalFailedCreateTargetReplicaIds: () => new Set(),
      getFailedCreateTargetCleanupPrecondition: () => null,
    };
    const moves = plannedMoves(noOwnerDecision, ReplicaStatus.FAILED, {
      targetFields: {
        previous_state: ReplicaStatus.SYNCING,
        cleanup_token: null,
      },
    });
    t.notOk(
      moves.some((move) => move.reason === MOVE_REASON.REPLICA_FAILED),
      'FAILED publication alone is not destructive cleanup authority',
    );
  });
});

test('REPLACE target failure records its authoritative cleanup generation',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
    let replaceTargetId = TARGET_ID;
    let replaceOperationId = null;
    const authoritativeReplaceTarget = () => ({
      ...lifecycleRow(
        ReplicaStatus.FAILED,
        FAILED_STATE_ENTERED_AT,
        buildFailedCreateCleanupToken(replaceOperationId),
      ),
      service_id: replaceTargetId,
      replica_id: replaceTargetId,
      address: `${TARGET_NODE}/partition/${replaceTargetId}`,
    });
    const cache = createMockCache({
      services: [
        lifecycleRow(ReplicaStatus.SYNCING),
        {
          ...lifecycleRow(ReplicaStatus.ACTIVE),
          service_id: 'orders-p1-r1',
          replica_id: 'orders-p1-r1',
          node_id: 'node-1',
        },
      ],
    });
    const coordinator = createTestCoordinator({
      nodeId: 'node-1',
      enableTimeouts: false,
      systemTableCache: cache,
      sqlQueryResults: {
        get 'FROM services WHERE service_id = ?'() {
          return {success: true, affectedRows: 1,
            rows: [authoritativeReplaceTarget()]};
        },
      },
    });
    const rebalancer = createTestRebalancer({
      entityId: PARTITION_ID,
      nodeId: 'node-1',
      systemTableCache: cache,
      rebalanceCoordinator: coordinator,
    });
    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REPLACE,
        partitionId: PARTITION_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        entityId: PARTITION_ID,
        sourceNodeId: 'node-1',
        nodeId: TARGET_NODE,
        replicaId: TARGET_ID,
      });
      await installCreateAdmissionAttempt(coordinator, operation);
      replaceTargetId = operation.replicaId;
      replaceOperationId = operation.operationId;
      operation.workflowStep = WORKFLOW_STEP.ACTIVE;
      operation.status = ReplicaStatus.ACTIVE;
      await coordinator.repository.persistOperationUpdate(operation);
      await coordinator.failOperation(
        operation,
        REPLACE_POST_INTENT_FAILURE.TARGET_DEAD_SOURCE_RETAINED,
        {replacePostIntentFailure:
          REPLACE_POST_INTENT_FAILURE.TARGET_DEAD_SOURCE_RETAINED},
      );

      const persisted = await coordinator.getOperation(operation.operationId);
      t.same(
        persisted.stepsHistory.at(-1)?.[
          OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
        ],
        lifecyclePrecondition(authoritativeReplaceTarget()),
        'the real failure owner persists the exact FAILED generation',
      );
      await rebalancer.refreshFailedCreateTargetCleanupDecisions();
      t.same([
        ...rebalancer.getTerminalFailedReplaceTargetReplicaIds(),
      ], [replaceTargetId],
      'the rebalancer consumes the owner-persisted REPLACE decision');
    } finally {
      rebalancer.shutdown();
      await coordinator.shutdown();
    }
  });

test('M2 concurrency: a SYNCING observation cannot fail an ADD after its ' +
  'target activates and the operation completes', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const harness = await addHarness();
  const observed = deferred();
  const release = deferred();
  const originalObservation = harness.coordinator.repository
    .getActualReplicaObservation
    .bind(harness.coordinator.repository);
  let pauseOnce = true;
  harness.coordinator.repository.getActualReplicaObservation = async (...args) => {
    const observation = await originalObservation(...args);
    if (pauseOnce) {
      pauseOnce = false;
      observed.resolve(observation);
      await release.promise;
    }
    return observation;
  };
  try {
    const failure = harness.coordinator.failOperation(
      harness.operation,
      'timeout racing target activation',
    );
    const captured = await observed.promise;
    t.equal(captured.lifecycleStatus, ReplicaStatus.SYNCING,
      'failure admission captured the pre-activation state');
    harness.target.status = ReplicaStatus.ACTIVE;
    await harness.coordinator.completeOperation(harness.operation);
    release.resolve();
    await failure;
    const persisted = await harness.coordinator.getOperation(
      harness.operation.operationId,
    );
    t.equal(persisted.workflowStep, WORKFLOW_STEP.ACTIVE,
      'the stale failure observation cannot overwrite completion');
    t.not(persisted.status, ReplicaStatus.FAILED);
  } finally {
    release.resolve();
    await harness.coordinator.shutdown();
  }
});

test('a FAILED observation cannot terminalize after its create generation ' +
  'restarts', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const harness = await addHarness();
  const terminalWriteReached = deferred();
  const releaseTerminalWrite = deferred();
  const persist = harness.coordinator.repository.persistOperationUpdate
    .bind(harness.coordinator.repository);
  harness.coordinator.repository.persistOperationUpdate =
    async (operation, options) => {
      if (operation.workflowStep === WORKFLOW_STEP.FAILED) {
        terminalWriteReached.resolve();
        await releaseTerminalWrite.promise;
      }
      return persist(operation, options);
    };
  try {
    harness.target.status = ReplicaStatus.FAILED;
    harness.target.cleanupToken = buildFailedCreateCleanupToken(
      harness.operation.operationId,
    );
    const failure = harness.owner.failOperation(
      harness.operation,
      'failed observation racing create retry',
    );
    await terminalWriteReached.promise;
    harness.target.status = ReplicaStatus.CREATING;
    harness.target.cleanupToken = null;
    releaseTerminalWrite.resolve();
    await failure;
    const persisted = await harness.coordinator.getOperation(
      harness.operation.operationId,
    );
    t.not(persisted.workflowStep, WORKFLOW_STEP.FAILED,
      'the stale FAILED generation cannot terminalize the live retry');
  } finally {
    releaseTerminalWrite.resolve();
    await harness.coordinator.shutdown();
  }
});

test('terminal cleanup release re-drives until the exact handler ACK',
  async (t) => {
    const operation = terminalCleanupRemoveOperation();
    const deliveries = [];
    const logs = [];
    const owner = terminalCleanupRepairOwner(operation, deliveries, logs);
    t.equal(armFailedCreateCleanupRelease(owner, operation), true);

    owner.terminalTransitionRepairTimerByOperationId.delete(
      operation.operationId,
    );
    await runTerminalTransitionRepairAttempt(owner, operation.operationId);
    t.equal(deliveries.length, 1, 'the durable terminal owner sends one wake');
    t.ok(owner.terminalTransitionRepairStateByOperationId.has(
      operation.operationId,
    ), 'a transport failure retains the existing terminal repair owner');

    owner.terminalTransitionRepairTimerByOperationId.delete(
      operation.operationId,
    );
    await runTerminalTransitionRepairAttempt(owner, operation.operationId);
    t.equal(deliveries.length, 2,
      'later transport availability re-drives the same cleanup');
    t.equal(deliveries[1][ReplicaOperationField.OPERATION_ID],
      operation.operationId);
    t.notOk(owner.terminalTransitionRepairStateByOperationId.has(
      operation.operationId,
    ), 'only the exact COMPLETED release ACK clears retry ownership');
    t.match(logs, [{
      level: 'info',
      message: REBALANCE_COORDINATOR_LOG_MSG
        .FAILED_CREATE_CLEANUP_RELEASE_SUCCEEDED,
      context: {
        operationId: operation.operationId,
        workflowStep: WORKFLOW_STEP.REMOVED,
        partitionId: PARTITION_ID,
        targetNodeId: TARGET_NODE,
        attempt: 1,
      },
    }], 'the successful retry stop emits its typed owner evidence');
  });

test('terminal cleanup release unrefs only native retry timers', (t) => {
  const operation = terminalCleanupRemoveOperation(
    'cleanup-release-native-timer',
  );
  const nativeOwner = terminalCleanupRepairOwner(
    operation,
    [],
    [],
    {usesNativeRetryTimers: true},
  );
  const injectedOwner = terminalCleanupRepairOwner(operation);

  t.equal(armFailedCreateCleanupRelease(nativeOwner, operation), true);
  t.equal(nativeOwner.scheduled[0].unrefCalls, 1,
    'native background repair cannot keep an idle process alive');
  t.equal(armFailedCreateCleanupRelease(injectedOwner, operation), true);
  t.equal(injectedOwner.scheduled[0].unrefCalls, 0,
    'an injected deterministic scheduler remains observable');
  t.end();
});

test('terminal cleanup release refuses a claim without its exact create ' +
  'attempt token', (t) => {
  const operation = terminalCleanupRemoveOperation(
    'cleanup-release-missing-attempt',
  );
  delete operation[
    ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
  ].create_attempt_token;
  const owner = terminalCleanupRepairOwner(operation);
  t.equal(armFailedCreateCleanupRelease(owner, operation), false,
    'the cleanup token alone cannot reconstruct REMOVE delivery authority');
  t.equal(owner.terminalTransitionRepairStateByOperationId.size, 0,
    'no retry owner is retained for an incomplete cleanup claim');
  t.end();
});

test('coordinator recovery reconstructs terminal cleanup release debt',
  async (t) => {
    const operation = terminalCleanupRemoveOperation(
      'cleanup-release-after-coordinator-restart',
    );
    const deliveries = [{bootstrap: true}];
    const owner = terminalCleanupRepairOwner(operation, deliveries);
    t.equal(await recoverFailedCreateCleanupReleaseDebt(owner), 1,
      'the authoritative terminal scan reconstructs one release owner');
    t.ok(owner.terminalTransitionRepairStateByOperationId.has(
      operation.operationId,
    ));

    owner.terminalTransitionRepairTimerByOperationId.delete(
      operation.operationId,
    );
    await runTerminalTransitionRepairAttempt(owner, operation.operationId);
    t.notOk(owner.terminalTransitionRepairStateByOperationId.has(
      operation.operationId,
    ), 'coordinator restart alone drives release to terminal ACK');
  });

test('pre-intent REPLACE failure settles without fabricating cleanup ' +
  'authority', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  for (const [label, result] of [
    ['ACTIVE', {success: true, affectedRows: 1,
      rows: [lifecycleRow(ReplicaStatus.ACTIVE)]}],
    ['ABSENT', {success: true, affectedRows: 0, rows: []}],
    ['UNAVAILABLE', {success: false, error: 'authority unavailable'}],
  ]) {
    await t.test(label, async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'node-1',
        enableTimeouts: false,
        sqlQueryResults: {
          get 'FROM services WHERE service_id = ?'() {
            return result;
          },
        },
      });
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: PARTITION_ID,
          entityType: REBALANCER_ENTITY_TYPE.PARTITION,
          entityId: PARTITION_ID,
          sourceNodeId: 'node-1',
          nodeId: TARGET_NODE,
          replicaId: TARGET_ID,
        });
        await coordinator.failOperation(operation, `pre-intent ${label}`);
        const persisted = await coordinator.getOperation(
          operation.operationId,
        );
        t.equal(persisted.workflowStep, WORKFLOW_STEP.FAILED,
          `${label} does not block ordinary terminal settlement`);
        t.equal(
          persisted.stepsHistory.at(-1)?.[
            OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
          ],
          undefined,
          `${label} cannot fabricate deletion authority`,
        );
      } finally {
        await coordinator.shutdown();
      }
    });
  }
});
