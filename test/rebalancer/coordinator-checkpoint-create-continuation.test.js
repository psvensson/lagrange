// Bounded investigation: real retention, scheduler and redispatch; fixture operation read/transport.
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {OPERATION_METADATA_KEY} from '../../src/rebalancer/replica-operation-progress.js';
import {REPLICA_SNAPSHOT_INSTALL_ERROR_CODE} from
  '../../src/node/replica-snapshot-install-constants.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from '../../src/rebalancer/operation-workflow-owner-shared.js';
const {OPERATION_WORKFLOW_OWNER_REASON} = OPERATION_WORKFLOW_OWNER_SHARED;
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
    cdcIntegrationService: {},
    messageRouter: {async deliver() {}},
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: 3, minReplicaCount: 1};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], affectedRows: 0};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      defaultRepairEligible: true,
    }),
    transactionCoordinator: createMockTransactionCoordinator(),
    enableTimeouts: false,
  });
  coordinator.initialize();
  return coordinator;
}

test('the real observation and periodic owners redispatch a deferred partition CREATE', async (t) => {
  const coordinator = createAdmissionCoordinator();
  const owner = coordinator.workflowOwner;
  const operation = {
    operationId: 'add-replay-under-install-episode',
    type: OperationType.ADD,
    partitionId: 'user-install-episode-p1',
    replicaId: 'user-install-episode-p1-r4',
    sourceNodeId: 'node-local',
    targetNodeId: 'node-local',
    status: 'sending',
    workflowStep: WORKFLOW_STEP.SENDING,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    entityType: 'partition',
    entityId: 'user-install-episode-p1',
    stepsHistory: [],
  };
  const admitted = {
    ...operation,
    createAdmissionState: 'ADMITTED',
    createAdmissionToken: 'install-episode-admission',
    createAdmissionReplicaCreatedAt: 303,
    createAdmissionAttemptToken: 'install-episode-admission:attempt:1',
    createAdmissionAttemptSeq: 1,
    createAdmissionWorkflowUpdatedAt: operation.updatedAt,
    createAdmissionOwnerIncarnation: 7,
  };
  const deferral = {
    status: ReplicaOperationResponseStatus.ERROR,
    error: 'CREATE deferred: the replica is under a snapshot install episode',
    errorCode: REPLICA_SNAPSHOT_INSTALL_ERROR_CODE.REPLICA_UNDER_INSTALL_EPISODE,
    deferRetry: true,
    operationId: operation.operationId,
    replicaId: operation.replicaId,
    nodeId: 'node-local',
  };
  const retained = [];
  const failures = [];
  const steps = [];
  owner.repository.isReplaceRemoveDispatchPhase = () => false;
  owner.repository.getReplaceSourceReplicaId = () => null;
  owner.isPriorityRecoverySupersededTargetFailureApplicable = () => false;
  owner.evaluateRemoveSafety = async () => null;
  owner.clearDeferredSafetyBlockState = () => {};
  const deliveries = [];
  const timers = [];
  owner.setTimeoutFn = (callback, delay) => {
    const timer = {callback, delay, cancelled: false, unref() {}};
    timers.push(timer);
    return timer;
  };
  owner.clearTimeoutFn = (timer) => { timer.cancelled = true; };
  owner.deliverReplicaOperationRequest = async (candidate, target, request) => {
    deliveries.push({attempt: candidate.createAdmissionAttemptToken, request});
    return buildDeliveryEnvelope({acknowledged: true}, deferral);
  };
  // Observe real retention, never replace its decision or scheduler.
  const retain = owner.retainDeliveredCreateProgress.bind(owner);
  owner.retainDeliveredCreateProgress = (...args) => {
    const result = retain(...args);
    retained.push({status: args[1]?.status, result});
    return result;
  };
  owner.updateStep = async (_operation, step) => {
    steps.push(step);
    admitted.workflowStep = step;
    admitted.status = step;
  };
  owner.failOperation = async (_candidate, message, options) => {
    failures.push({message, options});
    return {committed: true};
  };
  try {
    owner.repository.getOperationByIdVisibilityObservation = async () => ({
      operation: admitted,
      deferredOutcome: null,
    });
    const replayed = await owner.executeOperationInternal({...operation}, {});
    t.equal(replayed.skipped, true);
    t.equal(failures.length, 0);
    t.equal(deliveries.length, 1);
    t.equal(retained.every(entry => entry.result === false), true,
      'partition is excluded from runtime-service delivered progress retention');
    // The replica remains SYNCING after a deferred FAILED write. Data
    // observations are fixtures; retention, timer, lane, adapter, lifecycle
    // decision and periodic timeout reconciliation are production methods.
    owner.repository.getActualReplicaObservation = async () => ({
      state: 'observed', lifecycleStatus: 'syncing'});
    owner.repository.getIncompleteOperationVisibilityObservation = async () => ({
      state: 'present', operations: [admitted]});
    const entry = owner.observedProgressRetryTimerByOperationId.get(operation.operationId);
    t.ok(entry, 'actual observation timer is armed');
    if (entry) {
      const answer = await entry.timeoutHandle.callback();
      console.log('CREATE_OBSERVATION', JSON.stringify({kind: entry.kind,
        delay: entry.timeoutHandle.delay, outcome: answer?.outcome?.outcome,
        deliveries: deliveries.length, steps, failures,
        rearmed: owner.observedProgressRetryTimerByOperationId.has(operation.operationId)}));
    }
    // Exercise the periodic owner's real selection/reconcile path too;
    // advance its existing clock seam, never its configured deadlines.
    let clock = operation.createdAt + 1000;
    owner.timeSource = {now: () => clock};
    t.equal(owner.resolveTimeoutCheckNowMs(), clock, 'the real timeout clock seam is engaged');
    await owner.checkTimeouts();
    clock = operation.createdAt + 2000;
    await owner.checkTimeouts();
    console.log('CREATE_PERIODIC', JSON.stringify({deliveries: deliveries.length,
      steps, failures, admitted, observedRetry:
        owner.observedProgressRetryTimerByOperationId.has(operation.operationId)}));
    t.equal(failures.length, 0, 'no premature terminal failure');
    t.ok(deliveries.length > 1,
      'a real continuation must redispatch the deferred partition CREATE');
  } finally {
    await coordinator.shutdown();
  }
});
