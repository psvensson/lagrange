/**
 * Shared harness for the membership-epoch fence suites: a real
 * RebalanceCoordinator whose current published membership epoch is a
 * controllable double, the epoch-bound move/operation shapes, and a
 * dispatch probe that routes one operation through the full dispatch lane
 * (reservation + epoch gates) while capturing the executor request and
 * failOperation calls. The SQL engine defaults to an in-memory no-op; a
 * durable suite may supply a real engine (e.g. SQLite-backed) instead.
 */

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NUM, WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {
  createMockCache,
  createMockControlPlaneSystemTableGateway,
  createMockPolicyService,
  createMockMessageRouter,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_NODE_ID = 'epoch-fence-node';
const TEST_TARGET_NODE_ID = 'epoch-target-node';
const TEST_PARTITION_ID = 'p-epoch-fence';
const TEST_OPERATION_ID = 'op-epoch-fence';
const PLANNING_EPOCH = 7;
const INSERT_OPERATION_SQL_FRAGMENT = 'INSERT INTO replica_operations';
const RESERVATION_ALREADY_ACTIVE = 'already_active';
const DELIVERY_STATUS_COMPLETED = 'completed';
const ADMISSION_DECISION_TYPE = 'admitted';

function initializeConfig() {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
    },
  });
}

function createNoopSqlQueryEngine(onInsert) {
  return {
    async executeQuery(sql) {
      if (typeof sql === 'string' &&
          sql.includes(INSERT_OPERATION_SQL_FRAGMENT)) {
        onInsert();
      }
      return {success: true, rows: [], changes: 1};
    },
  };
}

/**
 * A coordinator whose current published membership epoch resolves to
 * `currentEpoch` (null = unreadable). `setCurrentEpoch` advances the double
 * after creation so a persisted binding can be dispatched against a later
 * epoch. `sqlQueryEngine` defaults to an in-memory no-op engine that only
 * counts operation inserts; `systemTableCache` defaults to an empty cache.
 * `readCurrentPublishedEpoch`, when given, replaces the epoch double so a
 * suite can route the read through the real readiness owner while node
 * readiness admission stays permissive.
 */
function createEpochCoordinator({
  currentEpoch,
  sqlQueryEngine = null,
  systemTableCache = createMockCache(),
  readCurrentPublishedEpoch = null,
}) {
  let persistedRows = 0;
  let publishedEpoch = currentEpoch;
  const engine = sqlQueryEngine ||
    createNoopSqlQueryEngine(() => {
      persistedRows += 1;
    });
  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    transactionCoordinator: createMockTransactionCoordinator(),
    systemTableCache,
    cdcIntegrationService: {async waitForCacheUpdate() {}},
    controlPlaneReadinessService: {
      getCurrentPublishedMembershipEpochSync(nodeId, observedAt) {
        return readCurrentPublishedEpoch ?
          readCurrentPublishedEpoch(nodeId, observedAt) :
          publishedEpoch;
      },
      getNodeReadinessSync(nodeId) {
        return {nodeId, dimensions: {repairEligible: true}};
      },
    },
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: engine,
    controlPlaneSystemTableGateway:
      createMockControlPlaneSystemTableGateway(engine),
    enableTimeouts: false,
  });
  coordinator.initialize();
  return {
    coordinator,
    persistedRowCount: () => persistedRows,
    setCurrentEpoch: (epoch) => {
      publishedEpoch = epoch;
    },
  };
}

/**
 * Admit and account storage so an ADD can persist to the operation record.
 */
function grantEpochCoordinatorStorageAdmission(coordinator) {
  coordinator.storageAdmissionService = {
    checkAdd: async () => ({allowed: true, decisionType: ADMISSION_DECISION_TYPE}),
    checkReplace: async () => ({
      allowed: true,
      decisionType: ADMISSION_DECISION_TYPE,
    }),
  };
  coordinator.storageAccountingService = {
    estimateReplicaBytes: () => NUM.HUNDRED,
  };
  coordinator.hasStorageReservationSupport = () => false;
  return coordinator;
}

function buildEpochBoundAddMove(epoch, overrides = {}) {
  return {
    type: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: TEST_PARTITION_ID,
    nodeId: TEST_TARGET_NODE_ID,
    membershipPublicationEpoch: epoch,
    emitOperationCreated: false,
    ...overrides,
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
    outcome: RESERVATION_ALREADY_ACTIVE,
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
      return {acknowledged: true, status: DELIVERY_STATUS_COMPLETED};
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

export {
  PLANNING_EPOCH,
  TEST_NODE_ID,
  TEST_PARTITION_ID,
  TEST_TARGET_NODE_ID,
  buildEpochBoundAddMove,
  buildEpochBoundAddOperation,
  createEpochCoordinator,
  grantEpochCoordinatorStorageAdmission,
  initializeConfig,
  wireEpochDispatchProbe,
};
