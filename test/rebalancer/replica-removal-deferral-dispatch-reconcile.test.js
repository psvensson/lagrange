/**
 * End-to-end OperationWorkflowOwner <-> ReplicaHandler witnesses for retryable
 * replica removal and failed-create cleanup deferrals across user-table and
 * system-table partitions (B1, B2, B5, AG-2).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {
  ReplicaState,
  ReplicaStateMachine,
} from '../../src/node/replica-state-machine.js';
import {
  REPLICA_REMOVAL_AUTHORITY_DEFERRED,
  REPLICA_REMOVAL_COMPLETION_DEFERRED,
} from '../../src/node/replica-removal-debt-errors.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  OPERATION_METADATA_KEY,
  OperationType,
  ReplicaStatus,
  createOperation,
} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {buildFailedCreateCleanupToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {isRetryableControlPlaneError} from
  '../../src/control-plane/control-plane-error-classification.js';
import {
  createLifecycleServiceRow,
  createLifecycleStateStore,
  createPartitionRow,
} from '../test-helpers/lifecycle-state-store.js';
import {createTestCoordinator} from './test-helpers.js';

const USER_TABLE_ID = 'orders';
const USER_PARTITION_ID = 'orders-p1';
const USER_REPLICA_ID = 'orders-p1-r4';
const SYSTEM_TABLE_ID = 'services';
const SYSTEM_PARTITION_ID = 'services-p1';
const SYSTEM_REPLICA_ID = 'services-p1-r1';
const CLEANUP_COMPLETE_STATUS = 'cleanup_complete';

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function registerLifecycleSnapshot(stateMachine, row) {
  stateMachine.registerReplicaSnapshot(row.service_id, {
    partitionId: row.partition_id,
    nodeId: row.node_id,
    state: row.status,
    serviceId: row.service_id,
    serviceType: row.service_type,
    serviceAddress: row.address,
    replicaIdentity: row.replica_id,
    groupId: row.group_id,
    cleanupToken: row.cleanup_token,
    createAttemptToken: row.create_attempt_token,
    createdAt: row.created_at,
    durableVersionColumn: 'state_entered_at',
    durableVersion: row.state_entered_at,
    authoritativeSnapshot: true,
  });
}

async function createCoordinatorWithRemoveHandler(t, {
  coordinatorNodeId,
  targetNodeId,
  partitionId,
  tableId,
  peerSpecs,
  handler,
}) {
  const scheduledTimers = [];
  const allNodeIds = [
    coordinatorNodeId,
    ...peerSpecs.map(([, nId]) => nId),
    targetNodeId,
  ];
  const uniqueNodeIds = [...new Set(allNodeIds)];
  const responses = [];
  const coordinator = createTestCoordinator({
    nodeId: coordinatorNodeId,
    enableTimeouts: false,
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduledTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    sqlQueryResults: {
      'FROM nodes': {
        success: true,
        rowSetComplete: true,
        rows: uniqueNodeIds.map((nId) => ({
          node_id: nId,
          status: 'active',
          node_state: 'ready',
          last_heartbeat: Date.now(),
        })),
      },
    },
    messageRouter: {
      register() {},
      unregister() {},
      deliver: async (_target, request) => {
        const answer = await handler.handleRemoveReplica(request);
        responses.push(answer);
        return buildDeliveryEnvelope({acknowledged: true}, answer);
      },
    },
  });
  const nodeRows = uniqueNodeIds.map((nId) => ({
    node_id: nId,
    status: 'active',
    connection_state: 'ready',
    last_heartbeat: Date.now(),
    ready_lease_expires_at: Date.now() + 60_000,
  }));
  for (const row of nodeRows) {
    coordinator.repository.systemTableCache.upsert('nodes', row);
  }
  coordinator.workflowOwner.controlPlaneReadinessService = {
    ...coordinator.workflowOwner.controlPlaneReadinessService,
    readServeEligibility: async () => {},
    answerCommittedNodes: () => ({state: 'ready', nodeRows}),
  };
  for (const [id, nId, role] of peerSpecs) {
    coordinator.repository.systemTableCache.upsert(
      'services',
      createLifecycleServiceRow({
        replicaId: id,
        partitionId,
        nodeId: nId,
        status: ReplicaStatus.ACTIVE,
        raftRole: role,
      }),
    );
  }
  coordinator.repository.systemTableCache.upsert(
    'partitions',
    createPartitionRow({
      partitionId,
      tableId,
      leaderNodeId: coordinatorNodeId,
    }),
  );
  await coordinator.initialize();
  t.teardown(async () => {
    await coordinator.shutdown();
  });
  return {coordinator, responses, scheduledTimers};
}

async function createOrdersFailedCreateCleanupHarness(t, createOpId) {
  resetEnvironment();
  const dataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `lagrange-${createOpId}-`),
  );
  const targetNodeId = 'node-4';
  const failed = createLifecycleServiceRow({
    replicaId: USER_REPLICA_ID,
    partitionId: USER_PARTITION_ID,
    nodeId: targetNodeId,
    status: ReplicaState.FAILED,
    version: 200,
    createdAt: 100,
    cleanupToken: buildFailedCreateCleanupToken(createOpId),
    createAttemptToken: 'create-attempt:orders-p1-r4:1',
  });
  const store = createLifecycleStateStore({
    services: [failed],
    partitions: [createPartitionRow({
      partitionId: USER_PARTITION_ID,
      tableId: USER_TABLE_ID,
      nodeId: 'node-1',
    })],
  });
  const stateMachine = new ReplicaStateMachine({
    nodeId: targetNodeId,
    systemTableCache: store.cache,
    controlPlaneSystemTableGateway: store.gateway,
    now: () => 300,
  });
  registerLifecycleSnapshot(stateMachine, failed);
  const handler = new ReplicaHandler({
    nodeId: targetNodeId,
    dataDir,
    systemTableCache: store.cache,
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: store.gateway,
    replicaStateMachine: stateMachine,
    createPartitionService: async () => ({}),
    executorOutcomeEmitter: {emitOutcome: () => {}},
  });
  handler.localReplicas.set(USER_REPLICA_ID, {
    replicaId: USER_REPLICA_ID,
    partitionId: USER_PARTITION_ID,
    status: ReplicaStatus.FAILED,
    service: null,
  });
  t.teardown(async () => {
    await handler.shutdown();
    fs.rmSync(dataDir, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  const {coordinator, responses, scheduledTimers} =
    await createCoordinatorWithRemoveHandler(t, {
      coordinatorNodeId: 'node-1',
      targetNodeId,
      partitionId: USER_PARTITION_ID,
      tableId: USER_TABLE_ID,
      peerSpecs: [
        ['orders-p1-r1', 'node-1', 'leader'],
        ['orders-p1-r2', 'node-2', 'follower'],
        ['orders-p1-r3', 'node-3', 'follower'],
      ],
      handler,
    });
  const removeOp = createOperation({
    operationId: 'op-remove-orders-p1-failed-create',
    type: OperationType.REMOVE,
    partitionId: USER_PARTITION_ID,
    replicaId: USER_REPLICA_ID,
    sourceNodeId: 'node-1',
    targetNodeId,
  });
  removeOp.entityType = REBALANCER_ENTITY_TYPE.PARTITION;
  removeOp.entityId = USER_PARTITION_ID;
  removeOp[ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION] =
    failed;
  removeOp.stepsHistory[0][
    OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
  ] = failed;
  await coordinator.repository.persistNewOperation(removeOp);
  return {
    coordinator,
    failed,
    handler,
    removeOp,
    responses,
    scheduledTimers,
    store,
  };
}

test('user-table failed-create cleanup deferral in STOPPING defers with ' +
  'diagnostic text preserved, recovers on retry, and releases its receipt',
async (t) => {
  const {
    coordinator,
    failed,
    handler,
    removeOp,
    responses,
    scheduledTimers,
    store,
  } = await createOrdersFailedCreateCleanupHarness(t, 'create-orders-op');
  const opId = removeOp.operationId;

  const removedEvent = new Promise((resolve) =>
    handler.once('replicaRemoved', resolve));
  const firstDispatch =
    await coordinator.workflowOwner.executeOperation(removeOp);
  t.equal(firstDispatch.success, true);
  await removedEvent;
  t.equal(
    store.durable.services.get(USER_REPLICA_ID)?.status,
    CLEANUP_COMPLETE_STATUS,
    'first pass records the operation-bound cleanup_complete receipt',
  );

  // Redeliver while SERVICES authoritative read transiently fails:
  store.setAuthoritativeReadAvailable(false);
  const stoppingOp = await coordinator.getOperation(opId);
  const deferredResult =
    await coordinator.workflowOwner.executeOperation(stoppingOp);
  const afterBlipOp = await coordinator.getOperation(opId);

  t.equal(responses.at(-1)?.errorCode, REPLICA_REMOVAL_AUTHORITY_DEFERRED);
  t.equal(responses.at(-1)?.deferRetry, true);
  t.equal(deferredResult.skipped, true,
    'user-table cleanup deferral must defer retry, never fail the operation');
  t.equal(deferredResult.reason, REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING);
  t.match(
    deferredResult.error,
    /Replica removal lifecycle authority unavailable for orders-p1-r4/u,
    'diagnostic error message is preserved instead of Unknown error',
  );
  t.equal(afterBlipOp?.workflowStep, WORKFLOW_STEP.STOPPING);
  t.equal(afterBlipOp?.status, ReplicaStatus.REMOVING);
  t.equal(
    coordinator.workflowOwner.dispatchRetryTimerByOperationId.has(opId),
    true,
    'dispatch retry timer is armed for user-table cleanup REMOVE',
  );

  // Restore authority read and run the armed retry:
  store.setAuthoritativeReadAvailable(true);
  await scheduledTimers.at(-1).callback();
  const completedOp = await coordinator.getOperation(opId);
  t.equal(completedOp?.status, ReplicaStatus.REMOVED);
  t.equal(completedOp?.workflowStep, WORKFLOW_STEP.REMOVED);

  // Sync terminal REMOVED operation row to handler gateway and release receipt:
  store.durable.replica_operations = new Map([[opId, {
    operation_id: opId,
    status: completedOp.status,
    workflow_step: completedOp.workflowStep,
  }]]);
  const releaseReplay = await handler.handleRemoveReplica({
    operationId: opId,
    partitionId: USER_PARTITION_ID,
    replicaId: USER_REPLICA_ID,
    [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]: failed,
  });
  t.equal(releaseReplay.status, ReplicaOperationResponseStatus.COMPLETED);
  t.equal(
    store.durable.services.has(USER_REPLICA_ID),
    false,
    'terminal REMOVED operation cleanly releases the cleanup_complete tombstone',
  );
});

test('user-table initial failed-create cleanup FAILED -> REMOVING transient ' +
  'mutation error defers in SENDING and converges on retry', async (t) => {
  const {
    coordinator,
    handler,
    removeOp,
    responses,
    scheduledTimers,
    store,
  } = await createOrdersFailedCreateCleanupHarness(t, 'create-orders-ag2');

  store.setNextMutationBehavior({unavailable: true});
  const firstAttempt =
    await coordinator.workflowOwner.executeOperation(removeOp);
  const afterFirstOp = await coordinator.getOperation(removeOp.operationId);

  t.equal(responses.at(-1)?.errorCode, REPLICA_REMOVAL_AUTHORITY_DEFERRED);
  t.equal(responses.at(-1)?.deferRetry, true);
  t.equal(firstAttempt.skipped, true);
  t.equal(firstAttempt.reason, REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING);
  t.match(
    firstAttempt.error,
    /Replica removal lifecycle authority unavailable for orders-p1-r4/u,
  );
  t.equal(afterFirstOp?.workflowStep, WORKFLOW_STEP.SENDING);

  const removedEvent = new Promise((resolve) =>
    handler.once('replicaRemoved', resolve));
  await scheduledTimers.at(-1).callback();
  await removedEvent;
  const afterRetryOp = await coordinator.getOperation(removeOp.operationId);
  t.equal(afterRetryOp?.workflowStep, WORKFLOW_STEP.STOPPING);
  t.equal(
    store.durable.services.get(USER_REPLICA_ID)?.status,
    CLEANUP_COMPLETE_STATUS,
  );
});

test('post-completion REMOVE redelivery during SERVICES read blip preserves ' +
  'REPLICA_REMOVAL_COMPLETION_DEFERRED and converges on retry', async (t) => {
  resetEnvironment();
  const dataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'lagrange-b2-services-remove-'),
  );
  const targetNodeId = 'node-seed';
  const store = createLifecycleStateStore({
    services: [],
    partitions: [createPartitionRow({
      partitionId: SYSTEM_PARTITION_ID,
      tableId: SYSTEM_TABLE_ID,
      leaderNodeId: 'node-2',
    })],
  });
  const stateMachine = new ReplicaStateMachine({
    nodeId: targetNodeId,
    systemTableCache: store.cache,
    controlPlaneSystemTableGateway: store.gateway,
    now: () => 500,
  });
  const handler = new ReplicaHandler({
    nodeId: targetNodeId,
    dataDir,
    systemTableCache: store.cache,
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: store.gateway,
    replicaStateMachine: stateMachine,
    createPartitionService: async () => ({}),
    executorOutcomeEmitter: {emitOutcome: () => {}},
  });
  t.teardown(async () => {
    await handler.shutdown();
    fs.rmSync(dataDir, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  const {coordinator, responses, scheduledTimers} =
    await createCoordinatorWithRemoveHandler(t, {
      coordinatorNodeId: 'node-2',
      targetNodeId,
      partitionId: SYSTEM_PARTITION_ID,
      tableId: SYSTEM_TABLE_ID,
      peerSpecs: [
        ['services-p1-r2', 'node-2', 'leader'],
        ['services-p1-r3', 'node-3', 'follower'],
        ['services-p1-r4', 'node-4', 'follower'],
      ],
      handler,
    });
  const sysRemoveOp = createOperation({
    operationId: 'op-remove-services-p1-r1',
    type: OperationType.REMOVE,
    partitionId: SYSTEM_PARTITION_ID,
    replicaId: SYSTEM_REPLICA_ID,
    sourceNodeId: 'node-2',
    targetNodeId,
  });
  sysRemoveOp.entityType = REBALANCER_ENTITY_TYPE.PARTITION;
  sysRemoveOp.entityId = SYSTEM_PARTITION_ID;
  await coordinator.repository.persistNewOperation(sysRemoveOp);
  await coordinator.workflowOwner.updateStep(sysRemoveOp, WORKFLOW_STEP.STOPPING);
  const opId = sysRemoveOp.operationId;

  handler.setLocalReplica(SYSTEM_REPLICA_ID, {
    replicaId: SYSTEM_REPLICA_ID,
    partitionId: SYSTEM_PARTITION_ID,
    status: ReplicaStatus.REMOVED,
    service: null,
    completedRemovalOperationId: opId,
  });

  // Transient SERVICES read blip during redelivery:
  store.setAuthoritativeReadAvailable(false);
  const currentOp = await coordinator.getOperation(opId);
  const blipExecResult =
    await coordinator.workflowOwner.executeOperation(currentOp);
  const persistedDuringBlip = await coordinator.getOperation(opId);
  const blipResponse = responses.at(-1);

  t.equal(blipResponse?.errorCode, REPLICA_REMOVAL_COMPLETION_DEFERRED);
  t.equal(blipResponse?.deferRetry, true);
  t.equal(isRetryableControlPlaneError(blipResponse), true);
  t.equal(blipExecResult.skipped, true,
    'post-completion read blip defers retry instead of failing the REMOVE');
  t.equal(blipExecResult.reason, REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING);
  t.match(
    blipExecResult.error,
    /Replica removal lacks exact durable authority for services-p1-r1/u,
    'diagnostic error message is preserved',
  );
  t.equal(persistedDuringBlip?.workflowStep, WORKFLOW_STEP.STOPPING);
  t.equal(persistedDuringBlip?.status, ReplicaStatus.REMOVING);

  // Restore read availability and run armed retry:
  store.setAuthoritativeReadAvailable(true);
  await scheduledTimers.at(-1).callback();
  const completedOp = await coordinator.getOperation(opId);
  t.equal(completedOp?.status, ReplicaStatus.REMOVED);
  t.equal(completedOp?.workflowStep, WORKFLOW_STEP.REMOVED);
});
