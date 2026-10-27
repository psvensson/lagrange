/**
 * Failed-create cleanup lifecycle-generation probes.
 *
 * These witnesses exercise the production ReplicaHandler and durable lifecycle
 * owner across exact FAILED evidence, retry interleavings, lost acknowledgement,
 * and stale local projections.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {
  ReplicaState,
  ReplicaStateMachine,
} from '../../src/node/replica-state-machine.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {buildFailedCreateCleanupToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';
import {
  createLifecycleServiceRow,
  createLifecycleStateStore as createLifecycleRowStore,
  createPartitionRow,
} from '../test-helpers/lifecycle-state-store.js';

const SERVICES = 'services';
const NODE_ID = 'test-node';

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function serviceRow(replicaId, status, version, partitionId = 'partition-1',
  options = {}) {
  const cleanupToken = options.cleanupToken !== undefined ?
    options.cleanupToken :
    status === ReplicaState.FAILED ?
      buildFailedCreateCleanupToken(`create-${replicaId}`) : null;
  const createAttemptToken = options.createAttemptToken !== undefined ?
    options.createAttemptToken :
    status === ReplicaState.FAILED ? `create-attempt:${replicaId}:1` : null;
  return createLifecycleServiceRow({
    replicaId,
    status,
    version,
    partitionId,
    nodeId: NODE_ID,
    cleanupToken,
    createAttemptToken,
  });
}

function partitionRow(partitionId = 'partition-1') {
  return createPartitionRow({partitionId, nodeId: NODE_ID});
}

function createStateMachine(store, options = {}) {
  return new ReplicaStateMachine({
    nodeId: NODE_ID,
    systemTableCache: store.cache,
    controlPlaneSystemTableGateway: store.gateway,
    ...options,
  });
}

function registerRow(stateMachine, row) {
  const durableVersionColumn = Number.isFinite(row.state_entered_at) ?
    'state_entered_at' : 'updated_at';
  return stateMachine.registerReplicaSnapshot(row.service_id, {
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
    durableVersionColumn,
    durableVersion: row[durableVersionColumn],
    durableUpdatedAt: row.updated_at,
    authoritativeSnapshot: true,
  });
}

function createHandler(store, stateMachine) {
  return new ReplicaHandler({
    nodeId: NODE_ID,
    dataDir: '/tmp/replica-failed-create-cleanup-generation',
    systemTableCache: store.cache,
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: store.gateway,
    replicaStateMachine: stateMachine,
    createPartitionService: async () => ({}),
    executorOutcomeEmitter: {emitOutcome: () => {}},
  });
}

test('failed-create cleanup is consumed by the exact lifecycle generation',
  async (t) => {
    initializeEnvironment();
    const failed = serviceRow(
      'replica-failed-create-cleanup',
      ReplicaState.FAILED,
      100,
    );
    const store = createLifecycleRowStore({
      services: [failed],
      partitions: [partitionRow()],
    });
    const stateMachine = createStateMachine(store, {now: () => 200});
    registerRow(stateMachine, failed);
    const handler = createHandler(store, stateMachine);
    handler.localReplicas.set(failed.service_id, {
      replicaId: failed.service_id,
      partitionId: failed.partition_id,
      status: ReplicaStatus.FAILED,
      service: null,
    });
    handler.startRemoveReplicaAsync = () => {};

    const response = await handler.handleRemoveReplica({
      operationId: 'cleanup-exact-failed-generation',
      partitionId: failed.partition_id,
      replicaId: failed.service_id,
      [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
        failed,
    });

    t.equal(response.status, ReplicaOperationResponseStatus.INITIATED);
    t.equal(store.durable[SERVICES].get(failed.service_id)?.status,
      ReplicaState.REMOVING,
      'the lifecycle owner enters REMOVING before accepting cleanup');
    t.equal(handler.getLocalReplica(failed.service_id)?.status,
      ReplicaStatus.REMOVING);
  });

test('a claimed failed-create generation cannot restart before cleanup',
  async (t) => {
    initializeEnvironment();
    const failed = serviceRow(
      'replica-failed-create-retry',
      ReplicaState.FAILED,
      300,
    );
    const store = createLifecycleRowStore({
      services: [failed],
      partitions: [partitionRow()],
    });
    const stateMachine = createStateMachine(store, {now: () => 400});
    registerRow(stateMachine, failed);
    const handler = createHandler(store, stateMachine);
    handler.localReplicas.set(failed.service_id, {
      replicaId: failed.service_id,
      partitionId: failed.partition_id,
      status: ReplicaStatus.FAILED,
      service: null,
    });
    handler.startRemoveReplicaAsync = () => {};

    t.equal(await stateMachine.restartFailedCreate(
      failed.service_id,
      {
        partitionId: failed.partition_id,
        nodeId: failed.node_id,
        serviceId: failed.service_id,
        serviceType: failed.service_type,
        serviceAddress: failed.address,
      },
      {persist: true},
    ), false, 'the durable terminal claim closes FAILED to CREATING replay');

    const response = await handler.handleRemoveReplica({
      operationId: 'cleanup-queued-before-retry',
      partitionId: failed.partition_id,
      replicaId: failed.service_id,
      [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
        failed,
    });

    t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
      'the actual removal owner consumes the claimed generation');
    t.equal(store.durable[SERVICES].get(failed.service_id)?.status,
      ReplicaState.REMOVING, 'the claimed generation enters cleanup');
    t.equal(store.mutations.some((mutation) =>
      mutation.data?.status === ReplicaState.CREATING), false,
    'no newer create generation was minted');
  });

test('unclaimed FAILED evidence cannot authorize destructive cleanup',
  async (t) => {
    initializeEnvironment();
    const failed = serviceRow(
      'replica-failed-create-unclaimed',
      ReplicaState.FAILED,
      350,
      'partition-1',
      {cleanupToken: null},
    );
    const store = createLifecycleRowStore({
      services: [failed],
      partitions: [partitionRow()],
    });
    const stateMachine = createStateMachine(store, {now: () => 400});
    registerRow(stateMachine, failed);
    const handler = createHandler(store, stateMachine);
    handler.localReplicas.set(failed.service_id, {
      replicaId: failed.service_id,
      partitionId: failed.partition_id,
      status: ReplicaStatus.FAILED,
      service: null,
    });
    const response = await handler.handleRemoveReplica({
      operationId: 'cleanup-unclaimed-failed-generation',
      partitionId: failed.partition_id,
      replicaId: failed.service_id,
      [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
        failed,
    });
    t.equal(response.status, ReplicaOperationResponseStatus.ERROR,
      'the participant requires the operation-bound FAILED claim');
    t.equal(store.mutations.some((mutation) =>
      mutation.data?.status === ReplicaState.REMOVING), false,
    'unclaimed evidence reaches no destructive mutation');
  });

test('failed-create claim and retry serialize on one lifecycle owner',
  async (t) => {
    initializeEnvironment();
    const failed = serviceRow(
      'replica-failed-create-interleaved-retry',
      ReplicaState.FAILED,
      300,
      'partition-1',
      {cleanupToken: null},
    );
    const store = createLifecycleRowStore({
      services: [failed],
      partitions: [partitionRow()],
    });
    const stateMachine = createStateMachine(store, {now: () => 400});
    registerRow(stateMachine, failed);
    const cleanupToken = buildFailedCreateCleanupToken(
      'create-interleaved-before-transition-capture',
    );
    t.equal(await stateMachine.claimFailedCreateCleanup(
      failed,
      cleanupToken,
    ), true, 'terminal cleanup atomically claims the FAILED generation');
    t.equal(await stateMachine.restartFailedCreate(
      failed.service_id,
      {
        partitionId: failed.partition_id,
        nodeId: failed.node_id,
        serviceId: failed.service_id,
        serviceType: failed.service_type,
        serviceAddress: failed.address,
      },
      {persist: true},
    ), false, 'a retry cannot overtake the claimed terminal generation');
    t.equal(store.durable[SERVICES].get(failed.service_id)?.status,
      ReplicaState.FAILED, 'the claimed FAILED generation remains authoritative');
    t.equal(store.durable[SERVICES].get(failed.service_id)?.cleanup_token,
      cleanupToken, 'the lifecycle row records the winning attempt');
    t.equal(store.mutations.some((mutation) =>
      mutation.data?.status === ReplicaState.CREATING), false,
    'serialization prevents a live retry from appearing after the claim');
  });

test('lost cleanup acknowledgement redrives only the same tracked removal',
  async (t) => {
    initializeEnvironment();
    const failed = serviceRow(
      'replica-failed-create-cleanup-lost-ack',
      ReplicaState.FAILED,
      200,
    );
    const store = createLifecycleRowStore({
      services: [failed],
      partitions: [partitionRow()],
    });
    store.setApplyThenThrowStatus(ReplicaState.REMOVING);
    const stateMachine = createStateMachine(store, {now: () => 300});
    registerRow(stateMachine, failed);
    const handler = createHandler(store, stateMachine);
    handler.localReplicas.set(failed.service_id, {
      replicaId: failed.service_id,
      partitionId: failed.partition_id,
      status: ReplicaStatus.FAILED,
      service: null,
    });
    let asyncStarts = 0;
    handler.startRemoveReplicaAsync = () => {
      asyncStarts += 1;
    };
    const request = {
      operationId: 'cleanup-lost-ack-same-operation',
      partitionId: failed.partition_id,
      replicaId: failed.service_id,
      [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
        failed,
    };

    const first = await handler.handleRemoveReplica(request);
    const repeated = await handler.handleRemoveReplica(request);

    t.equal(first.status, ReplicaOperationResponseStatus.INITIATED,
      'authoritative readback resolves the lost transition acknowledgement');
    t.equal(repeated.status, ReplicaOperationResponseStatus.IN_PROGRESS,
      'the same tracked operation receives an idempotent response');
    t.equal(asyncStarts, 1, 'the repeated request starts no second cleanup');
    t.equal(store.mutations.filter((mutation) =>
      mutation.data?.status === ReplicaState.REMOVING).length, 1,
    'the exact FAILED generation enters REMOVING once');
  });

test('cleanup redelivery resumes its durable REMOVING generation after restart',
  async (t) => {
    initializeEnvironment();
    const failed = serviceRow(
      'replica-failed-create-cleanup-restart',
      ReplicaState.FAILED,
      200,
    );
    const store = createLifecycleRowStore({
      services: [failed],
      partitions: [partitionRow()],
    });
    const firstStateMachine = createStateMachine(store, {now: () => 300});
    registerRow(firstStateMachine, failed);
    const firstHandler = createHandler(store, firstStateMachine);
    firstHandler.localReplicas.set(failed.service_id, {
      replicaId: failed.service_id,
      partitionId: failed.partition_id,
      status: ReplicaStatus.FAILED,
      service: null,
    });
    firstHandler.startRemoveReplicaAsync = () => {};
    const request = {
      operationId: 'cleanup-restart-same-operation',
      partitionId: failed.partition_id,
      replicaId: failed.service_id,
      [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
        failed,
    };

    t.equal((await firstHandler.handleRemoveReplica(request)).status,
      ReplicaOperationResponseStatus.INITIATED);
    const removing = store.durable[SERVICES].get(failed.service_id);
    t.equal(removing.status, ReplicaState.REMOVING,
      'the first handler durably accepts cleanup');

    const restartedStateMachine = createStateMachine(store, {now: () => 400});
    registerRow(restartedStateMachine, removing);
    const restartedHandler = createHandler(store, restartedStateMachine);
    restartedHandler.localReplicas.set(failed.service_id, {
      replicaId: failed.service_id,
      partitionId: failed.partition_id,
      status: ReplicaStatus.REMOVING,
      service: null,
    });
    let resumed = 0;
    restartedHandler.startRemoveReplicaAsync = () => {
      resumed += 1;
    };

    const response = await restartedHandler.handleRemoveReplica(request);
    t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
      'the same operation resumes from durable ownership after restart');
    t.equal(resumed, 1, 'cleanup execution is re-entered exactly once');
  });

test('cleanup completion receipt survives a fresh handler and lost final ACK',
  async (t) => {
    initializeEnvironment();
    const failed = serviceRow(
      'replica-failed-create-cleanup-complete-restart',
      ReplicaState.FAILED,
      500,
    );
    const store = createLifecycleRowStore({
      services: [failed],
      partitions: [partitionRow()],
    });
    const stateMachine = createStateMachine(store, {now: () => 600});
    registerRow(stateMachine, failed);
    const handler = createHandler(store, stateMachine);
    handler.localReplicas.set(failed.service_id, {
      replicaId: failed.service_id,
      partitionId: failed.partition_id,
      status: ReplicaStatus.FAILED,
      service: null,
    });
    handler.startRemoveReplicaAsync = () => {};
    const request = {
      operationId: 'cleanup-complete-restart-same-operation',
      partitionId: failed.partition_id,
      replicaId: failed.service_id,
      [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
        failed,
    };
    t.equal((await handler.handleRemoveReplica(request)).status,
      ReplicaOperationResponseStatus.INITIATED);
    const removingAuthority = await stateMachine
      .bindAuthoritativeRemovalAuthority(failed.service_id, {
        partitionId: failed.partition_id,
        nodeId: NODE_ID,
      });
    const owner = handler.getReplicaCleanupTombstoneOwner();
    const cleanupAuthority = await owner.takeoverRemoving(
      removingAuthority,
      'failed_create_cleanup_test',
    );
    const completionReceipt = await owner.markComplete(
      cleanupAuthority,
      {artifactsAbsent: true},
    );
    t.equal(completionReceipt?.kind, 'cleanup_complete',
      'artifact absence is retained as an operation-bound durable receipt');
    t.equal((await handler.handleRemoveReplica(request)).status,
      ReplicaOperationResponseStatus.COMPLETED,
      'same-process final ACK loss resolves from the durable receipt');

    const restartedStateMachine = createStateMachine(store, {now: () => 700});
    const restartedHandler = createHandler(store, restartedStateMachine);
    const repeated = await restartedHandler.handleRemoveReplica(request);
    t.equal(repeated.status, ReplicaOperationResponseStatus.COMPLETED,
      'the identical cleanup operation recovers terminal success');
    const missingAttempt = await restartedHandler.handleRemoveReplica({
      ...request,
      [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]: {
        ...failed,
        create_attempt_token: null,
      },
    });
    t.equal(missingAttempt.status, ReplicaOperationResponseStatus.ERROR,
      'a receipt cannot complete a request without the exact create attempt');
    const different = await restartedHandler.handleRemoveReplica({
      ...request,
      operationId: 'cleanup-complete-restart-different-operation',
    });
    t.equal(different.status, ReplicaOperationResponseStatus.ERROR,
      'a different operation cannot borrow the completion receipt');
    store.durable.replica_operations = new Map([[request.operationId, {
      operation_id: request.operationId,
      status: 'removed',
      workflow_step: 'REMOVED',
    }]]);
    store.setNextDeleteBehavior({
      resultOnly: true,
      result: {success: false, outcome: 'authority_unavailable'},
    });
    await t.rejects(restartedHandler.handleRemoveReplica(request), {
      deferRetry: true,
    }, 'a failed terminal release remains retry debt');
    t.equal(store.durable[SERVICES].get(failed.service_id)?.status,
      'cleanup_complete',
      'transport failure retains the durable receipt');
    t.equal((await restartedHandler.handleRemoveReplica(request)).status,
      ReplicaOperationResponseStatus.COMPLETED,
      'later terminal redelivery releases after transport recovery');
    t.equal(store.durable[SERVICES].has(failed.service_id), false,
      'the exact terminal operation releases its completion receipt');
    t.equal((await restartedHandler.handleRemoveReplica(request)).status,
      ReplicaOperationResponseStatus.COMPLETED,
      'coordinator recovery redelivery converges after prior release');
    store.setBeforeAuthoritativeRead((tableName, _params, durable) => {
      if (tableName !== 'replica_operations') return;
      durable[SERVICES].set(failed.service_id, serviceRow(
        failed.service_id,
        ReplicaState.CREATING,
        900,
      ));
    });
    const recreated = await restartedHandler.handleRemoveReplica(request);
    t.equal(recreated.status, ReplicaOperationResponseStatus.ERROR,
      'a newer lifecycle row cannot borrow terminal absence');
    t.equal(store.durable[SERVICES].get(failed.service_id)?.status,
      ReplicaState.CREATING);
  });

test('stale local REMOVING cannot shortcut a failed-create cleanup token',
  async (t) => {
    initializeEnvironment();
    const failed = {
      ...serviceRow('replica-stale-local-removing', ReplicaState.FAILED, 200),
      created_at: 100,
    };
    const removing = {
      ...serviceRow(failed.service_id, ReplicaState.REMOVING, 300),
      created_at: 100,
      previous_state: ReplicaState.FAILED,
    };
    const creating = {
      ...serviceRow(failed.service_id, ReplicaState.CREATING, 400),
      created_at: 100,
      previous_state: ReplicaState.FAILED,
    };
    const store = createLifecycleRowStore({
      services: [creating],
      partitions: [partitionRow()],
    });
    store.project(SERVICES, removing);
    const stateMachine = createStateMachine(store, {now: () => 500});
    registerRow(stateMachine, removing);
    const handler = createHandler(store, stateMachine);
    handler.localReplicas.set(failed.service_id, {
      replicaId: failed.service_id,
      partitionId: failed.partition_id,
      status: ReplicaStatus.REMOVING,
      service: null,
    });
    let asyncStarts = 0;
    handler.startRemoveReplicaAsync = () => {
      asyncStarts += 1;
    };

    const response = await handler.handleRemoveReplica({
      operationId: 'cleanup-stale-local-removing',
      partitionId: failed.partition_id,
      replicaId: failed.service_id,
      [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
        failed,
    });

    t.equal(response.status, ReplicaOperationResponseStatus.ERROR,
      'the stale local shortcut cannot bypass lifecycle authority');
    t.equal(asyncStarts, 0, 'no asynchronous cleanup is started');
    t.equal(store.durable[SERVICES].get(failed.service_id)?.status,
      ReplicaState.CREATING, 'the newer authoritative generation survives');
  });
