import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

function createAdmissionCoordinator() {
  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-local',
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {async waitForCacheUpdate() {}},
    messageRouter: {async deliver() {}},
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], affectedRows: 0};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    enableTimeouts: false,
  });
  coordinator.initialize();
  return coordinator;
}

test('REPLACE binds a fresh target in the durable dispatch step before ' +
  'CREATE admission', async (t) => {
  const sourceReplicaId = 'sql_transactions-p1-r1';
  const targetReplicaId = 'sql_transactions-p1-r7';
  const persisted = [];
  const delivered = [];
  const events = [];
  const coordinator = createAdmissionCoordinator();
  const owner = coordinator.workflowOwner;
  owner.repository.isOperationLocallyOwned = () => true;
  owner.repository.isReplaceRemoveDispatchPhase = () => false;
  owner.repository.getReplaceSourceReplicaId = () => sourceReplicaId;
  owner.isCreateRearmDispatchPhase = () => false;
  owner.isPriorityRecoverySupersededTargetFailureApplicable = () => false;
  owner.allocateCanonicalReplicaId = async () => targetReplicaId;
  owner.buildOperationTransitionPersistOptions = () => ({});
  owner.repository.persistOperationUpdate = async (operation, options) => {
    events.push('persist');
    persisted.push({operation: {...operation}, options: {...options}});
    return true;
  };
  owner.updateStep = async () => false;
  owner.evaluateRemoveSafety = async () => null;
  owner.clearDeferredSafetyBlockState = () => {};
  owner.deliverReplicaOperationRequest = async (
    operation,
    target,
    request,
  ) => {
    events.push('deliver');
    delivered.push({operation: {...operation}, target, request: {...request}});
    return {
      acknowledged: true,
      status: ReplicaOperationResponseStatus.INITIATED,
    };
  };
  owner.retainDeliveredCreateProgress = () => {};
  owner._handleDispatchResponse = async (operation) => ({
    success: true,
    operationId: operation.operationId,
  });
  const sending = {
    operationId: 'replace-missing-durable-target',
    type: OperationType.REPLACE,
    partitionId: 'sql_transactions-p1',
    replicaId: sourceReplicaId,
    sourceReplicaId,
    sourceNodeId: 'node-source',
    targetNodeId: 'node-local',
    status: 'sending',
    workflowStep: WORKFLOW_STEP.SENDING,
    updatedAt: 101,
    completedAt: null,
    entityType: 'partition',
    entityId: 'sql_transactions-p1',
    stepsHistory: [],
    createAdmissionState: null,
  };

  try {
    const result = await owner.executeOperationInternal(sending, {});
    t.equal(result.success, true, 'bound target dispatches');
    t.same(events, ['persist', 'deliver'],
      'durable target binding precedes physical CREATE delivery');
    t.equal(persisted[0].operation.replicaId, targetReplicaId,
      'the operation owner persists the new target replica id');
    t.equal(persisted[0].options.expectedWorkflowStep, WORKFLOW_STEP.SENDING,
      'the target binding is fenced on the durable SENDING step');
    t.equal(sending.sourceReplicaId, sourceReplicaId,
      'the source replica identity remains unchanged');
    t.equal(delivered[0].request.replicaId, targetReplicaId,
      'CREATE carries only the durably bound target replica id');
    t.equal(delivered[0].request.createAdmissionWorkflowUpdatedAt, 101,
      'admission keeps the exact durable SENDING anchor');
    t.match(delivered[0].request.createAdmissionToken,
      new RegExp(`:${targetReplicaId}:node-local:101$`),
      'admission token binds the persisted target and workflow anchor');

    let claimedPending = null;
    events.length = 0;
    persisted.length = 0;
    delivered.length = 0;
    owner.claimPendingDispatchOperation = async (operation) => {
      claimedPending = {...operation};
      return null;
    };
    const pending = {
      ...sending,
      operationId: 'replace-pending-missing-target',
      replicaId: sourceReplicaId,
      status: 'pending',
      workflowStep: WORKFLOW_STEP.PENDING,
      updatedAt: 202,
    };
    const pendingResult = await owner.executeOperationInternal(pending, {});
    t.equal(pendingResult.skipped, true,
      'a failed PENDING claim does not dispatch');
    t.equal(claimedPending.replicaId, targetReplicaId,
      'PENDING target identity is bound before the canonical claim write');
    t.equal(persisted.length, 0,
      'PENDING binding uses the owner claim write instead of a second write');
    t.equal(delivered.length, 0,
      'an uncommitted PENDING binding reaches no physical CREATE');

    let allocationCount = 0;
    owner.allocateCanonicalReplicaId = async () => {
      allocationCount += 1;
      return targetReplicaId;
    };
    const admitted = {
      ...sending,
      operationId: 'replace-admitted-stale-target',
      replicaId: sourceReplicaId,
      createAdmissionState: 'ADMITTED',
    };
    const admittedResult = await owner.executeOperationInternal(admitted, {});
    t.equal(admittedResult.skipped, true,
      'an admitted operation with a conflicting target is refused');
    t.equal(allocationCount, 0,
      'dispatch never rotates target identity after admission');
    t.equal(delivered.length, 0,
      'conflicting admitted identity reaches no physical CREATE');
  } finally {
    await coordinator.shutdown();
  }
});

test('CREATE redispatch adopts the durable admission tuple instead of mutable ' +
  'workflow updated_at', async (t) => {
  const delivered = [];
  const coordinator = createAdmissionCoordinator();
  const owner = coordinator.workflowOwner;
  const stale = {
    operationId: 'add-admitted-stale-anchor',
    type: OperationType.ADD,
    partitionId: 'user-p1',
    replicaId: 'user-p1-r2',
    sourceNodeId: 'node-source',
    targetNodeId: 'node-local',
    status: 'in_progress',
    workflowStep: WORKFLOW_STEP.CREATING,
    updatedAt: 202,
    completedAt: null,
    entityType: 'partition',
    entityId: 'user-p1',
    stepsHistory: [],
  };
  const durable = {
    ...stale,
    createAdmissionState: 'MATERIALIZED',
    createAdmissionToken: 'admission-from-sending-101',
    createAdmissionReplicaCreatedAt: 303,
    createAdmissionAttemptToken: 'attempt-from-sending-101:1',
    createAdmissionAttemptSeq: 1,
    createAdmissionWorkflowUpdatedAt: 101,
    createAdmissionOwnerIncarnation: 7,
  };
  owner.repository.isOperationLocallyOwned = () => true;
  owner.repository.isReplaceRemoveDispatchPhase = () => false;
  owner.repository.getReplaceSourceReplicaId = () => null;
  owner.repository.getOperationByIdVisibilityObservation = async () => ({
    operation: durable,
    deferredOutcome: null,
  });
  owner.isCreateRearmDispatchPhase = () => false;
  owner.isPriorityRecoverySupersededTargetFailureApplicable = () => false;
  owner.evaluateRemoveSafety = async () => null;
  owner.clearDeferredSafetyBlockState = () => {};
  owner.deliverReplicaOperationRequest = async (operation, target, request) => {
    delivered.push({operation, target, request});
    return {
      acknowledged: true,
      status: ReplicaOperationResponseStatus.IN_PROGRESS,
    };
  };
  owner.retainDeliveredCreateProgress = () => {};
  owner._handleDispatchResponse = async (operation) => ({
    success: true,
    operationId: operation.operationId,
  });

  try {
    const result = await owner.executeOperationInternal(stale, {});
    t.equal(result.success, true, 'the admitted operation redispatches');
    t.equal(delivered.length, 1, 'one physical delivery is attempted');
    t.equal(delivered[0].request.createAdmissionToken,
      durable.createAdmissionToken,
      'redispatch carries the handler-owned durable admission token');
    t.equal(delivered[0].request.createAdmissionAttemptToken,
      durable.createAdmissionAttemptToken,
      'redispatch carries the exact durable attempt token');
    t.equal(delivered[0].request.createAdmissionWorkflowUpdatedAt, 101,
      'mutable CREATING updated_at cannot rotate the SENDING anchor');
    t.equal(delivered[0].operation, durable,
      'the workflow owner dispatches the authoritative row snapshot');

    delivered.length = 0;
    owner.repository.getOperationByIdVisibilityObservation = async () => ({
      operation: {
        ...stale,
        status: 'failed',
        workflowStep: WORKFLOW_STEP.FAILED,
        completedAt: 404,
      },
      deferredOutcome: null,
    });
    const terminalFirst = await owner.executeOperationInternal(stale, {});
    t.equal(terminalFirst.skipped, true,
      'a terminal row observed by the owner refuses late CREATE');
    t.equal(delivered.length, 0,
      'terminal-first ordering reaches no physical delivery');

    owner.repository.getOperationByIdVisibilityObservation = async () => ({
      operation: {
        ...durable,
        status: 'failed',
        workflowStep: WORKFLOW_STEP.FAILED,
        completedAt: 404,
      },
      deferredOutcome: null,
    });
    const admissionFirst = await owner.executeOperationInternal(stale, {});
    t.equal(admissionFirst.success, true,
      'admission-first terminal work remains recoverable');
    t.equal(delivered.length, 1,
      'settlement does not cancel already admitted physical work');
    t.equal(delivered[0].request.createAdmissionAttemptToken,
      durable.createAdmissionAttemptToken,
      'admission-first recovery retains the exact durable attempt');
  } finally {
    await coordinator.shutdown();
  }
});
