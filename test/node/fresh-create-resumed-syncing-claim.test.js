import {createReplicaHandlerFixture} from
  '../test-helpers/replica-handler-construction-fixture.js';
// Quest fresh-create-failure-after-committed-admission, verifier finding B1
// (2026-11-02). A create re-driven onto its own durable SYNCING row
// (RESTARTABLE_CREATE_STATUSES -> RESTART_CREATE -> resumeSyncingReplicaCreateStatus)
// re-publishes nothing, but that row IS the leader's admission input
// (isPeerRowStatusAdmissible): the admission may already be committed. A
// retryable failure of that create before its runtime opens must therefore
// keep the removal obligation (the failed-create cleanup claim), exactly as a
// failure after the runtime opened does; only a create whose admission input
// is absent may stay unclaimed for the coordinator's re-dispatch.
//
// Real ReplicaHandler and ReplicaStateMachine over a SystemTableCache and the
// lifecycle gateway. Fixture seams (stated): the replica context is supplied
// (resolveReplicaContextWithRetry) so the create reaches its runtime step;
// the coordinator classification runs the real executor-outcome reconcile
// methods with isDispatchRetryableWorkflowStep stubbed true (the strictest
// case: a re-armable step); the planner runs the real MovePlanner with the
// cleanup decision computed by the real decideFailedCreateTargetCleanup over
// an observation built from the resulting durable row.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {ReplicaOperationResponseStatus, ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {OPERATION_METADATA_KEY, OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {EXECUTOR_OUTCOME_TYPE} from '../../src/rebalancer/executor-outcome-constants.js';
import {applyOperationWorkflowExecutorOutcomeReconcileMethods} from
  '../../src/rebalancer/operation-workflow-executor-outcome-reconcile-methods.js';
import {admitCreateTerminalFailure, decideFailedCreateTargetCleanup} from
  '../../src/rebalancer/operation-workflow-replace-terminal-admission.js';
import {buildPresentOperationVisibility} from
  '../../src/rebalancer/replica-operation-repository-operation-visibility.js';
import {buildFailedCreateCleanupToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {MOVE_REASON, REBALANCER_ENTITY_TYPE, REBALANCER_MOVE_TYPE} from
  '../../src/rebalancer/rebalancer-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {createLifecycleControlPlaneGatewayForCache, createLifecycleCdcServiceForCache} from
  '../test-helpers/lifecycle-state-store.js';

const NODE_ID = 'test-node';
const PARTITION_ID = 'partition-1';
const SCHEMA = {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]};
const attemptTokenOf = (replicaId) => `create-attempt:${replicaId}:1`;

function seededCache(replicaId, operationId, {resumedSyncing}) {
  const cache = new SystemTableCache();
  const now = Date.now();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {table_id: 'table-1',
    table_name: 'test_table', schema_definition: JSON.stringify(SCHEMA)});
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: PARTITION_ID, table_id: 'table-1', partition_key_start: null,
    partition_key_end: null, leader_node_id: 'leader-node'});
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
    service_id: 'leader-replica', service_type: 'partition', partition_id: PARTITION_ID,
    node_id: 'leader-node', replica_id: 'leader-replica', group_id: null,
    raft_role: 'leader', status: ReplicaStatus.ACTIVE,
    address: 'leader-node/partition/leader-replica', created_at: now,
    state_entered_at: now, updated_at: now});
  if (resumedSyncing) {
    // The earlier incarnation of this create published its admission input.
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
      service_id: replicaId, service_type: 'partition', partition_id: PARTITION_ID,
      node_id: NODE_ID, replica_id: replicaId, group_id: null, raft_role: 'learner',
      status: ReplicaStatus.SYNCING, previous_state: ReplicaStatus.CREATING,
      cleanup_token: null, create_attempt_token: attemptTokenOf(replicaId),
      address: `${NODE_ID}/partition/${replicaId}`, created_at: now - 1000,
      state_entered_at: now - 500, updated_at: now - 500});
  }
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, 'INSERT', {
    operation_id: operationId, type: OperationType.ADD, partition_id: PARTITION_ID,
    replica_id: replicaId, source_node_id: 'seed-node', target_node_id: NODE_ID,
    status: resumedSyncing ? ReplicaStatus.SYNCING : ReplicaStatus.PENDING,
    workflow_step: resumedSyncing ? 'SYNCING' : 'PENDING',
    created_at: now - 1000, updated_at: now - 500, steps_history: '[]'});
  return cache;
}

function deferredError(operationId) {
  return Object.assign(new Error(`CREATE admission read deferred for ${operationId}`), {
    code: 'REPLICA_CREATE_ADMISSION_DEFERRED',
    errorCode: 'REPLICA_CREATE_ADMISSION_DEFERRED', deferRetry: true});
}

// failure: 'runtime-step' (the partition factory throws deferRetry: after the
// resume, before the runtime opens) or 'prior-existence' (the create's first
// authoritative services read is unavailable: before the resume).
async function runResumedCreate({label, resumedSyncing, failure}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const replicaId = `replica-resumed-${label}`;
  const operationId = `op-resumed-${label}`;
  const cache = seededCache(replicaId, operationId, {resumedSyncing});
  const lifecycle = createLifecycleControlPlaneGatewayForCache(cache);
  let servicesReadsRefused = 0;
  const gateway = {
    ...lifecycle,
    async readAuthoritativeRows(tableName, sql, params, options) {
      if (failure === 'prior-existence' && servicesReadsRefused === 0 &&
          tableName === SYSTEM_TABLE_NAME.SERVICES && params?.includes?.(replicaId)) {
        servicesReadsRefused += 1;
        return {success: false, outcome: 'owner_not_ready',
          error: 'all_services_filtered_by_readiness'};
      }
      return lifecycle.readAuthoritativeRows(tableName, sql, params, options);
    },
  };
  const stateMachine = new ReplicaStateMachine({nodeId: NODE_ID, systemTableCache: cache,
    controlPlaneSystemTableGateway: gateway});
  const outcomes = [];
  const handler = createReplicaHandlerFixture(ReplicaHandler, {nodeId: NODE_ID,
    dataDir: `/tmp/fresh-create-resumed-syncing-${label}`,
    systemTableCache: cache, cdcIntegrationService: createLifecycleCdcServiceForCache(cache),
    controlPlaneSystemTableGateway: gateway, replicaStateMachine: stateMachine,
    createPartitionService: async () => {
      throw deferredError(operationId);
    },
    executorOutcomeEmitter: {emitOutcome: (type, outcomeOperationId, step, options) =>
      outcomes.push({type, operationId: outcomeOperationId, step, options})}});
  handler.resolveReplicaContextWithRetry = async () => ({tableName: 'test_table',
    tableId: 'table-1', schema: SCHEMA, keyRange: null,
    leaderAddress: 'leader-node/partition/leader-replica',
    replicaIds: ['leader-replica', replicaId], existingReplicaCount: 1,
    bootstrapMembership: null});
  if (resumedSyncing) {
    // As reconcileCreateAdmissionLifecycle seeds it from the durable row.
    handler.localReplicas.set(replicaId, {replicaId, partitionId: PARTITION_ID,
      status: ReplicaStatus.SYNCING, service: null});
  }
  handler.initialize();
  const settled = new Promise((resolve) => {
    handler.once('replicaCreationFailed', (event) => resolve({failed: true, event}));
    handler.once('replicaCreated', () => resolve({failed: false}));
  });
  const response = await handler.handleCreateReplica({operationId,
    partitionId: PARTITION_ID, replicaId});
  assert.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
    `setup: the create is (re-)driven (${JSON.stringify(response)})`);
  const outcome = await settled;
  await handler.shutdown();
  const row = lifecycle.store.durableRow(SYSTEM_TABLE_NAME.SERVICES, replicaId);
  const failedOutcomes = outcomes.filter((entry) =>
    entry.type === EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED);
  return {outcome, row, failedOutcomes, replicaId, operationId};
}

function classify(failedOutcomeOptions) {
  class ExecutorFailureClassifier {
    // Fixture seam: the strictest case, a dispatch-retryable (re-armable) step.
    isDispatchRetryableWorkflowStep() {
      return true;
    }
  }
  applyOperationWorkflowExecutorOutcomeReconcileMethods(ExecutorFailureClassifier);
  const coordinator = new ExecutorFailureClassifier();
  return coordinator.resolveExecutorFailureReconcileState(
    coordinator.buildExecutorFailureReconcileEvidence(
      {partitionId: 'replica_operations-p1', workflowStep: 'SYNCING'},
      coordinator.buildExecutorFailureOutcomeErrorLike(failedOutcomeOptions, 'failed')));
}

function lifecyclePreconditionOf(row) {
  return {service_id: row.service_id, replica_id: row.replica_id, group_id: row.group_id,
    partition_id: row.partition_id, node_id: row.node_id, service_type: row.service_type,
    status: row.status, created_at: row.created_at, state_entered_at: row.state_entered_at,
    cleanup_token: row.cleanup_token ?? null,
    create_attempt_token: row.create_attempt_token ?? null};
}

async function plannerMovesFor(run) {
  // The real failed-create admission and cleanup decision of the operation
  // owner, over the observation of the resulting durable FAILED row.
  const observation = {state: 'observed', lifecycleStatus: run.row.status,
    lifecyclePrecondition: lifecyclePreconditionOf(run.row)};
  const operation = {operationId: run.operationId, type: OperationType.ADD,
    entityType: 'partition', partitionId: PARTITION_ID, replicaId: run.replicaId,
    targetNodeId: NODE_ID, workflowStep: WORKFLOW_STEP.SYNCING,
    createAdmissionAttemptToken: run.row.create_attempt_token};
  // The repository's two reads the admission consults: the target's
  // actual observation and the operation's durable row (its step).
  const owner = {repository: {getActualReplicaObservation: async () => observation,
    queryReplicaOperationPersistenceAuthorityObservation: async () =>
      buildPresentOperationVisibility(operation)}};
  const admission = await admitCreateTerminalFailure(owner, operation);
  assert.equal(admission.admitted, true, 'the coordinator admits the FAILED');
  const terminal = {...operation, workflowStep: WORKFLOW_STEP.FAILED,
    status: ReplicaStatus.FAILED, completedAt: Date.now(),
    stepsHistory: [{...admission.stepMetadata}]};
  const decision = await decideFailedCreateTargetCleanup(owner, terminal);
  assert.equal(decision.cleanupEligible, true,
    'the cleanup decision is ELIGIBLE with the recorded lifecycle precondition');
  const currentReplicas = ['node-1', 'node-2', 'node-3'].map((nodeId, index) => ({
    replica_id: `partition-1-r${index + 1}`, node_id: nodeId, status: ReplicaStatus.ACTIVE}));
  currentReplicas.push({...run.row, node_id: NODE_ID});
  const planner = new MovePlanner({entityId: PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION, moveStateProvider: {
      getAvailableNodes: () => [], getCurrentReplicas: () => currentReplicas,
      getHealthyReplicas: (replicas) => replicas.filter((replica) =>
        replica.status === ReplicaStatus.ACTIVE),
      getInFlightOperations: () => [], getGlobalTopologyBlockingInFlightOperations: () => [],
      getTerminalFailedReplaceTargetReplicaIds: () => new Set([run.replicaId]),
      getTerminalFailedCreateTargetReplicaIds: () => new Set([run.replicaId]),
      getTerminalFailedCreateTargetClaims: () => [terminal.stepsHistory[0][
        OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]],
      getFailedCreateTargetCleanupPrecondition: () => decision.lifecyclePrecondition,
      hasPendingMove: () => false, hasPendingAddForNode: () => false}});
  return planner.calculateMoves(currentReplicas, {targetReplicaCount: 3,
    targetNodes: ['node-1', 'node-2', 'node-3'], degraded: false});
}

for (const failure of ['runtime-step', 'prior-existence']) {
  test(`B1: a create resumed on its durable SYNCING row that fails deferRetry at ${failure} ` +
    'keeps the failed-create cleanup claim, is failed (not re-dispatched) and is removed',
  async () => {
    const run = await runResumedCreate({label: `syncing-${failure}`,
      resumedSyncing: true, failure});
    assert.equal(run.outcome.failed, true, 'the create failed');
    assert.equal(run.row?.status, ReplicaStatus.FAILED, 'the create failed durably');
    assert.equal(run.row.cleanup_token, buildFailedCreateCleanupToken(run.operationId),
      'the admission input was published: the FAILED row carries the cleanup claim');
    assert.equal(run.failedOutcomes.length, 1, 'one failed executor outcome');
    assert.equal(run.failedOutcomes[0].options.deferRetry, undefined,
      'a claimed failure emits no deferRetry');
    assert.equal(classify(run.failedOutcomes[0].options), 'fail_operation',
      'the coordinator fails, never re-dispatches, the claimed create');
    const moves = await plannerMovesFor(run);
    const remove = moves.find((move) => move.replicaId === run.replicaId);
    assert.ok(remove, 'the planner issues a REMOVE for the claimed row');
    assert.equal(remove.type, REBALANCER_MOVE_TYPE.REMOVE);
    assert.equal(remove.reason, MOVE_REASON.REPLICA_FAILED);
    assert.ok(remove[ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION],
      'the REMOVE carries the claimed lifecycle generation');
  });
}

test('B1 control: a first create (no admission input) failing deferRetry before its ' +
  'runtime stays unclaimed and re-dispatchable', async () => {
  const run = await runResumedCreate({label: 'fresh-runtime-step', resumedSyncing: false,
    failure: 'runtime-step'});
  assert.equal(run.outcome.failed, true, 'the create failed');
  assert.equal(run.row?.status, ReplicaStatus.FAILED);
  assert.equal(run.row.cleanup_token ?? null, null, 'no admission input: unclaimed');
  assert.equal(run.failedOutcomes[0].options.deferRetry, true);
  assert.equal(classify(run.failedOutcomes[0].options), 'defer_retry');
});
