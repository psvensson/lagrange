/**
 * Schema-provisioning collision/retry closure (round-7 root causes).
 *
 * A schema job's replica operation carries a deterministic id per
 * (job, target), so a retry after a completed-but-unconfirmed attempt lands
 * on its own durable row with zero changes. Three races turned that benign
 * collision into run-fatal failures (local baseline repro plus archived
 * runs 21-34-12 and 22-15-08): the collision read-back demanded
 * fresh-timestamp visibility an advanced row can never satisfy, the
 * resulting "not confirmed" error was classified non-transient and poisoned
 * every later CREATE via the schema_operations terminal short-circuit, and
 * the job prologue ran outside the request deadline so a slow
 * schema_operations partition produced client-side silence.
 */
import {test} from '../../src/test-helpers/tap.js';
import {withBootstrapHoldRelease} from './sql-query-engine-test-support.js';
import {
  SchemaProvisioningJobOwner,
  isTransientProvisioningError,
} from '../../src/query/schema-provisioning-job-owner.js';
import {
  applyRebalanceCoordinatorOperationCreationMethods,
} from '../../src/rebalancer/rebalance-coordinator-operation-creation.js';
import {
  applyRebalanceCoordinatorOperationCreationAdmissionMethods,
} from '../../src/rebalancer/rebalance-coordinator-operation-creation-admission.js';
import {
  shouldDeferRetryableDispatchFailure,
} from '../../src/rebalancer/operation-workflow-dispatch-rearm-evidence.js';
import {
  SQLQueryEngine,
} from '../../src/query/sql-query-engine.js';
import {
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from '../../src/raft/raft-committed-membership-constants.js';

class OperationCreationHost {}
applyRebalanceCoordinatorOperationCreationAdmissionMethods(
  OperationCreationHost,
);
applyRebalanceCoordinatorOperationCreationMethods(OperationCreationHost);

const NOT_CONFIRMED_MESSAGE =
  'Authoritative replica operation not confirmed: schema-job-x:operation:n1';

test('the authoritative-not-confirmed collision outcome is transient for ' +
  'schema provisioning', async (t) => {
  t.equal(isTransientProvisioningError(new Error(NOT_CONFIRMED_MESSAGE)),
    true,
    'a visibility-timing collision retries instead of terminal-failing');
  t.equal(isTransientProvisioningError(new Error('schema exploded')),
    false,
    'semantic failures stay terminal');
  t.end();
});

test('deterministic-intent operation creation requests the idempotent ' +
  'collision disposition', async (t) => {
  const persistCalls = [];
  const self = Object.assign(new OperationCreationHost(), {
    logger: {info() {}, warn() {}, error() {}},
    nodeId: 'n0',
    now: () => 1000,
    stats: {operationsCreated: 0},
    controlPlaneReadinessService: {getNodeReadinessSync: () => null},
    buildOperationReadinessSnapshot: () => null,
    resolveEntitySizeBytes: () => 0,
    ensureProvisioningAdmissionAllowed: () => {},
    buildOperationBootstrapTopology: () => null,
    resolveOperationReadinessDecisionDimension: () => null,
    persistNewOperation: async (operation, resultOptions) => {
      persistCalls.push({operation, resultOptions});
      return true;
    },
  });
  const prototype = OperationCreationHost.prototype;
  await prototype.createOperationRecordInternal.call(self, {
    move: {
      type: 'add',
      nodeId: 'n1',
      operationIntentId: 'schema-job-x:operation:n1',
    },
    normalizedMove: {type: 'add', nodeId: 'n1'},
    normalizedMoveType: 'add',
    shouldEmitOperationCreated: false,
    entityType: 'partition',
    entityId: 'tbl-x-p1',
    partitionId: 'tbl-x-p1',
    dedupeKey: 'k',
    criticalAddLikeIntentKey: null,
    sourceNodeId: 'n0',
  }).catch(() => {});
  t.equal(persistCalls.length, 1, 'the operation persists once');
  t.equal(persistCalls[0].resultOptions?.returnDisposition, true,
    'a deterministic-intent create takes the idempotent disposition lane');
  t.end();
});

test('the schema-job prologue honors the request deadline', async (t) => {
  const owner = new SchemaProvisioningJobOwner({
    repository: {
      findByTableIdentity: () => new Promise(() => {}),
      listNonterminalRows: async () => [],
      recoverWorkflowRows: () => [],
      persistWorkflowCandidate: async (workflow) => ({workflow}),
    },
    now: () => Date.now(),
    setTimeoutFn: (fn) => {
      fn();
      return {unref() {}};
    },
    clearTimeoutFn: () => {},
  });
  const sentinel = new Promise((resolve) =>
    setTimeout(() => resolve({sentinel: true}), 250));
  const outcome = await Promise.race([
    owner.execute(
      {type: 'create_table', table: {name: 'ratings'}},
      {timeoutBudget: {startedAtMs: Date.now(), budgetMs: 5}},
      async () => ({success: true}),
    ),
    sentinel,
  ]);
  t.notOk(outcome?.sentinel,
    'a hung insertOrAttach resolves through the deadline race instead of ' +
      'client-side silence');
  t.equal(outcome?.provisioningDeadlineExpired, true,
    'the deadline outcome is an explicit pending/retry contract');
  t.end();
});

test('in-flight SENDING/CREATING child operations are not re-stamped or ' +
  're-dispatched on a schema provisioning retry', async (t) => {
  const executedIds = [];
  const waitedReplicaIds = [];
  const operationsByNode = new Map([
    [
      'node-a',
      {
        operationId: 'job-1:operation:node-a',
        replicaId: 'job-1:replica:node-a',
        targetNodeId: 'node-a',
        type: 'ADD',
        status: 'creating',
        workflowStep: WORKFLOW_STEP.CREATING,
        updatedAt: 1000,
        replicaIds: [
          'job-1:replica:node-a',
          'job-1:replica:node-b',
        ],
        peerAddresses: [
          'node-a/partition/job-1:replica:node-a',
          'node-b/partition/job-1:replica:node-b',
        ],
        stepsHistory: [{step: WORKFLOW_STEP.PENDING}],
      },
    ],
    [
      'node-b',
      {
        operationId: 'job-1:operation:node-b',
        replicaId: 'job-1:replica:node-b',
        targetNodeId: 'node-b',
        type: 'ADD',
        status: 'pending',
        workflowStep: WORKFLOW_STEP.PENDING,
        updatedAt: 1000,
        stepsHistory: [{step: WORKFLOW_STEP.PENDING}],
      },
    ],
  ]);
  const engine = Object.create(SQLQueryEngine.prototype);
  Object.assign(engine, {
    logger: {debug() {}, info() {}, warn() {}, error() {}},
    nowFn: () => 2000,
    tablePartitionProvisioningTimeoutMs: 5000,
    tablePartitionTargetNodeConvergenceTimeoutMs: 1000,
    queryExecutor: {defaultRoutingReadinessDimension: null},
    normalizeTargetNodeIds: (ids) => ids || [],
    resolveMinimumProvisioningReplicaCount: (_min, target) => target,
    createControlPlaneTimeoutBudget: () => ({
      startedAtMs: 1000,
      budgetMs: 5000,
    }),
    resolveProvisionTargetNodeIdsForContext: (ids) => ids,
    getRoutablePartitionServiceNodeIds: () => [],
    getPartitionServiceRows: () => [],
    resolveInitialPartitionBootstrapLeaderNodeId: () => 'node-a',
    waitForPartitionServiceMetadata: async (replicaId) => {
      waitedReplicaIds.push(replicaId);
    },
    waitForRoutablePartitionServiceCount: async () => ['node-a', 'node-b'],
    waitForPartitionLeaderService: async () => ({node_id: 'node-a'}),
    rebalanceCoordinator: withBootstrapHoldRelease({
      createOperation: async (move) => operationsByNode.get(move.nodeId),
      dispatchOperation: async () => ({success: true}),
      executeOperation: async (operation) => {
        executedIds.push(operation.operationId);
        return {success: true};
      },
    }),
  });

  await engine.provisionInitialTablePartition({
    partitionId: 'tbl-orders-p1',
    replicaCount: 2,
    minimumRoutableReplicaCount: 2,
    targetNodeIds: ['node-a', 'node-b'],
    schemaJobId: 'job-1',
  });

  t.same(
    engine.rebalanceCoordinator.bootstrapHoldReleases
      .filter((release) => release.released)
      .map((release) => release.operationId),
    ['job-1:operation:node-b'],
    'the coordinator releases (stamps) only the still-held PENDING operation',
  );
  t.equal(
    operationsByNode.get('node-a').updatedAt,
    1000,
    'in-flight CREATING operation updatedAt is preserved for admission CAS',
  );
  t.same(
    executedIds,
    ['job-1:operation:node-b'],
    'only the still-PENDING operation is dispatched via executeOperation',
  );
  t.same(
    waitedReplicaIds.sort(),
    ['job-1:replica:node-a', 'job-1:replica:node-b'],
    'both in-flight and newly dispatched replicas are awaited for routability',
  );
});

test('bootstrap partition ADD operations defer retryable control-plane ' +
  'dispatch failures', async (t) => {
  const deferredError = Object.assign(
    new Error('Replica create admission deferred'),
    {
      errorCode: 'REPLICA_CREATE_ADMISSION_DEFERRED',
      deferRetry: true,
    },
  );
  // The founding create carries the provisioner's GENESIS stamp; an
  // ordinary partition ADD carries the creation owner's COMMITTED stamp
  // (rebalance-coordinator-operation-creation.js buildOperationBootstrapTopology),
  // so the stamp kind, not its presence, names the founding create.
  const bootstrapOp = {
    operationId: 'job-1:operation:node-a',
    type: 'ADD',
    entityType: 'partition',
    partitionId: 'tbl-orders-p1',
    bootstrapMembership: genesisStamp(
      ['job-1:replica:node-a', 'job-1:replica:node-b'],
      {
        'job-1:replica:node-a': 'node-a',
        'job-1:replica:node-b': 'node-b',
      },
    ),
  };
  const ordinaryUserOp = {
    operationId: 'rebalance-op-1',
    type: 'ADD',
    entityType: 'partition',
    partitionId: 'tbl-orders-p1',
    bootstrapMembership: {kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED},
  };

  t.equal(
    shouldDeferRetryableDispatchFailure(
      {},
      bootstrapOp,
      deferredError,
    ),
    true,
    'bootstrap partition ADD operation defers retryable dispatch failure',
  );
  t.equal(
    shouldDeferRetryableDispatchFailure(
      {},
      ordinaryUserOp,
      deferredError,
    ),
    false,
    'an ordinary committed-stamped partition ADD retains existing behavior',
  );
});
