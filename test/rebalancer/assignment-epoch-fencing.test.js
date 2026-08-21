/**
 * Assignment-epoch fencing regression tests (verified-audit finding 7, quest
 * assignment-epoch-fencing). The assignment epoch must fence stale work
 * instead of being checked once at creation and forgotten.
 *
 * Receipts:
 * - unreadable-epoch-defers: an epoch-bound move whose current published
 *   membership epoch is unreadable at creation is DEFERRED — the typed
 *   MEMBERSHIP_EPOCH_UNAVAILABLE skip routes into the rebalance loop's
 *   existing skip-and-retry-next-cycle path (buildSkippedMoveResult), never
 *   silently passing into persistence. Reverting the fail-closed assert
 *   (letting an unreadable current epoch pass) flips this red.
 * - executor-rejects-stale-epoch: the operation's planning epoch is carried
 *   into the executor request AND the dispatch-time epoch gate rejects a
 *   stale ADD/REPLACE — a readable current epoch that advanced past the
 *   operation's planning epoch fails the operation closed before any
 *   dispatch; an unreadable current epoch defers the dispatch as
 *   DEFERRED_RETRY_PENDING instead of dispatching unfenced. Reverting the
 *   gate flips these red.
 * - durable-planning-epoch: the planning epoch lives in the operation row's
 *   dedicated membership_publication_epoch column and survives repository
 *   serialization without a stepsHistory copy.
 *
 * Every test is red-on-revert against the fail-closed creation assert or
 * the executor staleness gate while the rest of the change remains.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NUM, WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {REBALANCER_SKIP_REASON} from
  '../../src/rebalancer/rebalancer-constants.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {UnifiedRebalancer} from
  '../../src/rebalancer/unified-rebalancer.js';
import {
  UNIFIED_REBALANCER_SHARED,
} from '../../src/rebalancer/unified-rebalancer-shared.js';

const {MoveType, EntityType, NodeStatus} = UNIFIED_REBALANCER_SHARED;
import {
  createMockCache,
  createMockCdcService,
  createMockControlPlaneSystemTableGateway,
  createMockPolicyService,
  createMockMessageRouter,
  createMockTransactionCoordinator,
  createMockCoordinator,
} from './test-helpers.js';

const TEST_NODE_ID = 'epoch-fence-node';
const TEST_TARGET_NODE_ID = 'epoch-target-node';
const TEST_PARTITION_ID = 'p-epoch-fence';
const TEST_OPERATION_ID = 'op-epoch-fence';
const PLANNING_EPOCH = 7;

function initializeConfig() {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
    },
  });
}

/**
 * A coordinator whose current published membership epoch resolves to
 * `currentEpoch` (null = unreadable), with an in-memory no-op SQL engine.
 */
function createEpochCoordinator({currentEpoch}) {
  let persistedRows = 0;
  const sqlQueryEngine = {
    async executeQuery(sql) {
      if (typeof sql === 'string' &&
          sql.includes('INSERT INTO replica_operations')) {
        persistedRows += 1;
      }
      return {success: true, rows: [], changes: 1};
    },
  };
  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    transactionCoordinator: createMockTransactionCoordinator(),
    systemTableCache: createMockCache(),
    cdcIntegrationService: {async waitForCacheUpdate() {}},
    controlPlaneReadinessService: {
      getCurrentPublishedMembershipEpochSync() {
        return currentEpoch;
      },
      getNodeReadinessSync(nodeId) {
        return {nodeId, dimensions: {repairEligible: true}};
      },
    },
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine,
    controlPlaneSystemTableGateway:
      createMockControlPlaneSystemTableGateway(sqlQueryEngine),
    enableTimeouts: false,
  });
  coordinator.initialize();
  return {
    coordinator,
    persistedRowCount: () => persistedRows,
  };
}

function buildEpochBoundAddMove(epoch) {
  return {
    type: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: TEST_PARTITION_ID,
    nodeId: TEST_TARGET_NODE_ID,
    membershipPublicationEpoch: epoch,
    emitOperationCreated: false,
  };
}

function buildEpochBoundAddOperation(epoch, overrides = {}) {
  return {
    operationId: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: TEST_PARTITION_ID,
    replicaId: `${TEST_PARTITION_ID}-r4`,
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    stepsHistory: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    [ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH]: epoch,
    ...overrides,
  };
}

/**
 * Wire a workflow owner for a gated dispatch probe: capture the executor
 * request, clear the reservation gate (epoch gate reached), and spy on
 * failOperation. Returns the capture handles plus a `dispatch` that routes
 * one operation through the full dispatch lane (reservation + epoch gates).
 */
function wireEpochDispatchProbe(coordinator) {
  const owner = coordinator.workflowOwner;
  owner.repository.isOperationLocallyOwned = () => true;
  owner.ensureReservationForOperation = async () => ({
    outcome: 'already_active',
  });
  const deliveredRequests = [];
  const baseExecuteOperationInternal =
    owner.executeOperationInternal.bind(owner);
  owner.executeOperationInternal = async (dispatchedOperation) => {
    const requestCapture = {
      captured: null,
    };
    const baseDeliver = owner.deliverReplicaOperationRequest.bind(owner);
    owner.deliverReplicaOperationRequest = async (_op, _target, request) => {
      requestCapture.captured = request;
      return {acknowledged: true, status: 'completed'};
    };
    const result = await baseExecuteOperationInternal(dispatchedOperation);
    owner.deliverReplicaOperationRequest = baseDeliver;
    if (requestCapture.captured) {
      deliveredRequests.push(requestCapture.captured);
    }
    return result;
  };
  const failedOperations = [];
  owner.failOperation = async (failedOperation, message) => {
    failedOperations.push({
      operationId: failedOperation?.operationId,
      message,
    });
    return {success: true, operationId: failedOperation?.operationId};
  };
  return {
    owner,
    deliveredRequests,
    failedOperations,
    dispatch: (operation) => owner.dispatchOperationInternal(operation),
  };
}

// --- unreadable-epoch-defers ---

test('unreadable-epoch-defers: an epoch-bound move with an unreadable ' +
  'current epoch is deferred (typed skip), never persisted',
async (t) => {
  initializeConfig();
  const {coordinator, persistedRowCount} = createEpochCoordinator({
    currentEpoch: null, // unreadable current epoch
  });

  try {
    await coordinator.createOperation(buildEpochBoundAddMove(PLANNING_EPOCH));
    t.fail('an unreadable current epoch must not silently pass');
  } catch (error) {
    t.equal(
      error?.rebalanceSkipReason,
      REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_UNAVAILABLE,
      'the deferral exposes the typed MEMBERSHIP_EPOCH_UNAVAILABLE skip',
    );
    t.equal(
      error?.requestedMembershipPublicationEpoch,
      PLANNING_EPOCH,
      'the deferral carries the planning epoch it refused to fence open',
    );
  }
  t.equal(
    persistedRowCount(),
    0,
    'an unreadable epoch never persists the operation row',
  );
  await coordinator.shutdown();
});

test('unreadable-epoch-defers: the deferral routes into the existing ' +
  'rebalance-loop skip-and-retry path (skip result, no throw)',
async (t) => {
  initializeConfig();
  const mockCache = createMockCache([
    {node_id: TEST_TARGET_NODE_ID, status: NodeStatus.ACTIVE,
      connection_state: 'ready'},
  ]);
  // Epoch unreadable at ingress: the rebalancer must surface a skip (the
  // existing retry-next-cycle channel), not throw and not schedule.
  const rebalancer = new UnifiedRebalancer({
    entityId: TEST_PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: TEST_NODE_ID,
    systemTableCache: mockCache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: {
      getCurrentPublishedMembershipEpochSync() {
        return null; // unreadable
      },
    },
    rebalanceCoordinator: {
      ...createMockCoordinator(),
      async createOperation() {
        const error = new Error('current epoch unreadable');
        error.rebalanceSkipReason =
          REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_UNAVAILABLE;
        throw error;
      },
    },
  });

  const result = await rebalancer.executeMoveViaCoordinator({
    type: MoveType.ADD,
    partitionId: TEST_PARTITION_ID,
    entityType: EntityType.PARTITION,
    entityId: TEST_PARTITION_ID,
    nodeId: TEST_TARGET_NODE_ID,
    replicaId: `${TEST_PARTITION_ID}-r4`,
  });

  t.equal(result?.skipped, true, 'the unreadable epoch skips the move');
  t.equal(
    result?.reason,
    REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_UNAVAILABLE,
    'the skip carries the typed deferral reason into the retry path',
  );
  t.equal(result?.success, false, 'a deferred move is not scheduled');

  rebalancer.shutdown();
});

// --- executor-rejects-stale-epoch ---

test('executor-rejects-stale-epoch: the planning epoch is carried in the ' +
  'executor request for an epoch-bound ADD',
async (t) => {
  initializeConfig();
  const {coordinator} = createEpochCoordinator({currentEpoch: PLANNING_EPOCH});
  const {deliveredRequests, dispatch} = wireEpochDispatchProbe(coordinator);

  await dispatch(buildEpochBoundAddOperation(PLANNING_EPOCH));

  t.equal(
    deliveredRequests.length,
    1,
    'a current-epoch ADD dispatches to the executor',
  );
  t.equal(
    deliveredRequests[0]?.[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH],
    PLANNING_EPOCH,
    'the executor request carries the planning membership epoch',
  );
  await coordinator.shutdown();
});

test('executor-rejects-stale-epoch: a stale epoch-bound ADD fails closed ' +
  'before any dispatch',
async (t) => {
  initializeConfig();
  const {coordinator} = createEpochCoordinator({
    currentEpoch: PLANNING_EPOCH + 1, // advanced past the planning epoch
  });
  const {deliveredRequests, failedOperations, dispatch} =
    wireEpochDispatchProbe(coordinator);

  const result = await dispatch(buildEpochBoundAddOperation(PLANNING_EPOCH));

  t.equal(result?.success, false, 'a stale epoch-bound ADD does not dispatch');
  t.equal(
    deliveredRequests.length,
    0,
    'the executor never receives a stale request',
  );
  t.equal(
    failedOperations.length,
    1,
    'the stale operation is failed closed',
  );
  t.match(
    String(failedOperations[0]?.message),
    /Stale dispatch for published membership epoch/,
    'the failure names the stale-epoch fence',
  );
  await coordinator.shutdown();
});

test('executor-rejects-stale-epoch: an unreadable current epoch defers the ' +
  'dispatch instead of dispatching unfenced',
async (t) => {
  initializeConfig();
  const {coordinator} = createEpochCoordinator({currentEpoch: null});
  const {deliveredRequests, dispatch} = wireEpochDispatchProbe(coordinator);

  const result = await dispatch(buildEpochBoundAddOperation(PLANNING_EPOCH));

  t.equal(result?.success, false, 'an unreadable epoch does not dispatch');
  t.equal(result?.skipped, true, 'the unreadable-epoch dispatch is skipped');
  t.equal(
    result?.reason,
    REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
    'the skip defers into the existing dispatch-retry path',
  );
  t.equal(
    deliveredRequests.length,
    0,
    'the executor never dispatches unfenced',
  );
  await coordinator.shutdown();
});

// --- durable-planning-epoch ---

test('durable-planning-epoch: repository serialization preserves the sole ' +
  'planning epoch field',
async (t) => {
  initializeConfig();
  const {coordinator} = createEpochCoordinator({currentEpoch: PLANNING_EPOCH});
  // Admit + account so an epoch-bound ADD can persist to the record.
  coordinator.storageAdmissionService = {
    checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
    checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
  };
  coordinator.storageAccountingService = {
    estimateReplicaBytes: () => NUM.HUNDRED,
  };
  coordinator.hasStorageReservationSupport = () => false;

  const operation = await coordinator.createOperation(
    buildEpochBoundAddMove(PLANNING_EPOCH),
  );

  t.equal(
    operation?.[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH],
    PLANNING_EPOCH,
    'the operation record carries its planning epoch top-level',
  );
  const historyEpoch = (operation?.stepsHistory || []).find(
    (step) => step?.membershipPublicationEpoch !== undefined,
  );
  t.equal(
    historyEpoch,
    undefined,
    'no stepsHistory entry duplicates the planning epoch (dead write deleted)',
  );
  const persistedRow = coordinator.repository.buildReplicaOperationRow(
    operation,
  );
  t.equal(
    persistedRow.membership_publication_epoch,
    PLANNING_EPOCH,
    'the canonical row owns the planning epoch',
  );
  const reloaded = coordinator.repository.rowToOperation(persistedRow);
  t.equal(
    reloaded[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH],
    PLANNING_EPOCH,
    'repository reload restores the same top-level field',
  );
  await coordinator.shutdown();
});
