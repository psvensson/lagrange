import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {ExecutorOutcomeEmitter} from '../../src/rebalancer/executor-outcome-emitter.js';
import {REBALANCE_COORDINATOR_EVENT} from '../../src/rebalancer/rebalancer-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {DurableWorkflowCoordinator} from '../../src/workflow/durable-workflow-coordinator.js';
import {
  createFixtureSystemMutationPort, createMockControlPlaneSystemTableGateway,
  createCoordinatorSqlStore,
} from './test-helpers.js';
import {createReplaceWitness} from './replace-witness-fixture.js';
import {partialReadinessFake} from '../helpers/readiness-service-fixture.js';

const TEST_NODE_ID = 'node-target-local';
const TEST_SEED_NODE_ID = 'node-seed-remote';
const TEST_OPERATION_ID = 'op-cl-029-replace';
const TEST_PARTITION_ID = 'control_plane_publications-p1';
const TEST_SOURCE_REPLICA_ID = 'control_plane_publications-p1-r1';
const TEST_TARGET_REPLICA_ID = 'control_plane_publications-p1-r2';
const TEST_LEDGER_TABLE = 'replica_operations';
const TEST_UPDATE_OPERATION = 'update';

/**
 * Build the CL-029 REPLACE operation row: priority control-plane
 * partition, target node = local node, so per
 * replica-operation-repository-row-methods.js:124-151 the op is locally
 * owned by the TARGET (this node) while unsettled.
 */
function buildReplaceOperation() {
  const now = Date.now();
  return {
    operationId: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: TEST_PARTITION_ID,
    entityType: 'partition',
    entityId: TEST_PARTITION_ID,
    replicaId: TEST_TARGET_REPLICA_ID,
    sourceReplicaId: TEST_SOURCE_REPLICA_ID,
    sourceNodeId: TEST_SEED_NODE_ID,
    targetNodeId: TEST_NODE_ID,
    status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [
      {
        step: WORKFLOW_STEP.PENDING,
        timestamp: now,
        sourceReplicaId: TEST_SOURCE_REPLICA_ID,
      },
    ],
  };
}

/**
 * Convert an operation-shaped record to the SQL row shape the repository
 * read path expects (no source_replica_id column — it is reconstructed
 * from steps_history metadata, matching production).
 */
function operationToRow(op) {
  return {
    operation_id: op.operationId,
    type: op.type,
    partition_id: op.partitionId,
    entity_type: op.entityType,
    entity_id: op.entityId,
    replica_id: op.replicaId,
    source_node_id: op.sourceNodeId,
    target_node_id: op.targetNodeId,
    status: op.status,
    workflow_step: op.workflowStep,
    created_at: op.createdAt,
    updated_at: op.updatedAt,
    completed_at: op.completedAt,
    error_message: op.errorMessage,
    steps_history: JSON.stringify(op.stepsHistory || []),
  };
}

/**
 * Durable replica_operations store with REAL CAS semantics: the repository's
 * structured expected-step UPDATE (where workflow_step) is planned to SQL and
 * applied by SQLite.
 *
 * Reads (SELECT by operation_id) are served from `readView` when set —
 * this models the run's read/write divergence: authoritative READS routed
 * to a divergent/lagging replica while the CAS WRITE evaluates on the
 * true partition leader row.
 */
function createCasBackedReplicaOperationStore(initialOperation) {
  const state = {
    authoritative: {
      ...initialOperation,
      stepsHistory: initialOperation.stepsHistory.map((entry) => ({
        ...entry,
      })),
    },
    readView: null,
    updateAttempts: [],
    insertAttempts: [],
    failCasUpdateForStep: null,
    failCasUpdateResult: null,
  };

  const snapshotAuthoritative = () => ({
    ...state.authoritative,
    stepsHistory: (state.authoritative.stepsHistory || []).map((entry) => ({
      ...entry,
    })),
  });

  const mapper = Object.create(ReplicaOperationRepository.prototype);
  const sqlStore = createCoordinatorSqlStore({
    getAll: (table) => table === 'replica_operations' ? [operationToRow(initialOperation)] : [],
    upsert(_table, row) {
      state.authoritative = mapper.rowToOperation(row);
    },
  });

  const applyPlanned = createFixtureSystemMutationPort(
    async (sql, params) => sqlStore.execute(sql, params));

  // Instrument the repository's structured mutation port by its named fields;
  // SQLite alone decides whether a conditional write applied, including the
  // terminal guards.
  async function submitMutation(mutation, options) {
    const ledgerUpdate = mutation?.tableName === TEST_LEDGER_TABLE &&
      mutation.operation === TEST_UPDATE_OPERATION;
    if (!ledgerUpdate) {
      if (mutation?.tableName === TEST_LEDGER_TABLE) state.insertAttempts.push({row: mutation.row});
      return applyPlanned(mutation, options);
    }
    const expectedWorkflowStep = mutation.whereClause?.workflow_step ?? null;
    const isCas = expectedWorkflowStep !== null;
    const workflowStep = mutation.data?.workflow_step;
    const attempt = {
      isCas, workflowStep, expectedWorkflowStep,
      authoritativeStepAtWrite: state.authoritative.workflowStep,
      applied: false, injectedFailure: false,
    };
    state.updateAttempts.push(attempt);
    if (isCas && state.failCasUpdateResult && workflowStep === state.failCasUpdateForStep) {
      attempt.injectedFailure = true;
      return state.failCasUpdateResult;
    }
    const result = await applyPlanned(mutation, options);
    attempt.applied = result.changes > 0;
    return result;
  }

  async function executeQuery(sql, params = []) {
    if (state.readView && /^SELECT /iu.test(sql)) {
      // Substitute delivery of a stale row only; execute the real query on
      // that snapshot so predicates and identity still belong to SQLite.
      const stale = createCoordinatorSqlStore({
        getAll: (table) => table === 'replica_operations' ? [operationToRow(state.readView)] : [],
      });
      try {
        return stale.execute(sql, params);
      } finally {
        stale.suspend();
      }
    }
    return sqlStore.execute(sql, params);
  }

  return {
    state,
    suspend: sqlStore.suspend,
    executeQuery,
    submitMutation,
    snapshotAuthoritative,
    engageStaleReadView(snapshot) {
      state.readView = snapshot;
    },
    // An outage, not a single refusal: every CAS write to this step answers the
    // retryable failure until healRetryableCasFailure(), so it outlasts the
    // repository's in-loop persist retry budget.
    injectRetryableCasFailureForStep(workflowStep, failureResult) {
      state.failCasUpdateForStep = workflowStep;
      state.failCasUpdateResult = failureResult;
    },
    healRetryableCasFailure() {
      state.failCasUpdateForStep = null;
      state.failCasUpdateResult = null;
    },
  };
}

function createTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

function createCaptureLogger(logs) {
  return {
    debug(message, payload) {
      logs.debugs.push({message, payload});
    },
    info(message, payload) {
      logs.infos.push({message, payload});
    },
    warn(message, payload) {
      logs.warns.push({message, payload});
    },
    error(message, payload) {
      logs.errors.push({message, payload});
    },
  };
}

/**
 * Wrap a method on the owner with a call-recording spy. Preserves
 * sync/async semantics; does not change behavior.
 */
function instrumentMethod(target, methodName, calls) {
  const original = target[methodName];
  target[methodName] = function instrumented(...args) {
    const record = {method: methodName, args, settled: false};
    calls.push(record);
    let outcome;
    try {
      outcome = original.apply(this, args);
    } catch (error) {
      record.error = error;
      record.settled = true;
      throw error;
    }
    if (outcome && typeof outcome.then === 'function') {
      return outcome.then(
        (value) => {
          record.result = value;
          record.settled = true;
          return value;
        },
        (error) => {
          record.error = error;
          record.settled = true;
          throw error;
        },
      );
    }
    record.result = outcome;
    record.settled = true;
    return outcome;
  };
}

/**
 * Build the real coordinator/owner wired to the CAS-backed store,
 * mirroring rebalance-coordinator-outcome-routing.test.js conventions.
 * `timeSource` (optional) is the coordinator's clock, which its repository
 * shares: a case that needs time to pass gives a VirtualTimeSource.
 */
function createHarness(store, witness = createReplaceWitness({
  leaderReplicaId: TEST_TARGET_REPLICA_ID,
}), {timeSource} = {}) {
  const emitter = new ExecutorOutcomeEmitter({
    logger: {debug() {}, info() {}, warn() {}, error() {}},
  });
  const workflowCoordinator = new DurableWorkflowCoordinator();
  const deliveries = [];
  const scheduledTimers = [];
  const logs = {debugs: [], infos: [], warns: [], errors: []};
  const routedEvents = [];
  // The REPLACE's witness replica (quest replace-source-removal-owner): the
  // target's committed configuration still holds the source, and the target
  // leads.
  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    timeSource,
    transactionCoordinator: createTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
      },
    },
    cdcIntegrationService: {
      async refreshAuthoritativeCacheRow() {
        return true;
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: 3, minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        const witnessAnswer = witness.deliveryFor(payload);
        if (witnessAnswer) {
          return witnessAnswer;
        }
        deliveries.push({target, payload, options});
        return buildDeliveryEnvelope({acknowledged: true}, {status: 'initiated'});
      },
    },
    sqlQueryEngine: {
      executeQuery: store.executeQuery,
    },
    controlPlaneSystemTableGateway: {
      ...createMockControlPlaneSystemTableGateway({executeQuery: store.executeQuery}),
      submitMutation: store.submitMutation,
    },
    storageAccountingService: {estimateReplicaBytes: () => 1},
    storageAdmissionService: {
      async checkAdd() {
        return {allowed: true, decision: 'allow'};
      },
    },
    controlPlaneReadinessService: partialReadinessFake({
      getNodeReadinessSync() {
        return null;
      },
    }),
    operationWorkflowCoordinator: workflowCoordinator,
    executorOutcomeEmitter: emitter,
    setTimeoutFn(callback, delayMs) {
      const timerHandle = {callback, delayMs, cleared: false};
      scheduledTimers.push(timerHandle);
      return timerHandle;
    },
    clearTimeoutFn(timerHandle) {
      if (timerHandle) {
        timerHandle.cleared = true;
      }
    },
    enableTimeouts: false,
  });
  coordinator.initialize();

  const owner = coordinator.workflowOwner;
  const captureLogger = createCaptureLogger(logs);
  owner.logger = captureLogger;
  coordinator.repository.logger = captureLogger;

  // Replica-status evidence is unreadable during control-plane recovery
  // (the run's services/cache reads return nothing useful at this point);
  // keeps the incidental SYNCING-outcome lifecycle reconcile inert so the
  // characterization stays pinned on the ACTIVE-outcome path.
  owner.getReconciledReplicaStatus = async () => null;
  // Remove-safety voter-topology evidence is downstream of the
  // characterization point; stub it safe (same convention as the
  // in-progress remove test in rebalance-coordinator-outcome-routing)
  // so the post-ACTIVE source-removal phase stays healthy when reached.
  owner.evaluateRemoveSafety = async () => ({});

  coordinator.on(REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED, (event) => {
    routedEvents.push(event);
  });

  const calls = [];
  for (const methodName of [
    'reconcileExecutorOutcome',
    'reconcileReplaceActualActive',
    'updateStep',
    'replayReplaceActiveSourceRemovalFromAuthoritative',
    'replayReplaceActiveSourceRemovalFromObservedTarget',
    'scheduleExecutorOutcomeRetry',
    'ensurePriorityActiveReplaceRetryArmed',
    'completeOperation',
    'failOperation',
  ]) {
    instrumentMethod(owner, methodName, calls);
  }

  // Record what retained evidence is present at the moment
  // clearExecutorOutcomeRetry erases it (reconcile-methods line ~599).
  const clearedRetainedPayloads = [];
  const originalClear = owner.clearExecutorOutcomeRetry;
  owner.clearExecutorOutcomeRetry = function clearSpy(operationId) {
    clearedRetainedPayloads.push({
      operationId,
      retainedWorkflowStep:
        this.executorOutcomeRetryPayloadByOperationId.get(operationId)
          ?.workflowStep ?? null,
      hadTimer: this.executorOutcomeRetryTimerByOperationId.has(operationId),
    });
    return originalClear.call(this, operationId);
  };

  return {
    coordinator,
    owner,
    emitter,
    deliveries,
    scheduledTimers,
    logs,
    routedEvents,
    calls,
    clearedRetainedPayloads,
    witness,
  };
}

export {
  buildReplaceOperation,
  createCasBackedReplicaOperationStore,
  createHarness,
  TEST_OPERATION_ID,
  TEST_PARTITION_ID,
  TEST_SOURCE_REPLICA_ID,
  TEST_TARGET_REPLICA_ID,
};
