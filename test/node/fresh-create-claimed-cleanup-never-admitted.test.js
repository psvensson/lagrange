/**
 * Quest fresh-create-failure-after-committed-admission, L3 condition: the
 * REMOVE that a failed-create cleanup claim drives is a no-op for a replica
 * that was never admitted into its partition's configuration. The failed
 * create's runtime was fenced, so it has no consensus port: the removal
 * completes through the exact claimed lifecycle generation without waiting
 * for a RemoveNode nobody proposes: the first pass either completes or leaves
 * typed retryable removal debt, and the cleanup owner's redelivery of the same
 * operation completes it (the row stays an operation-bound receipt until the
 * terminal REMOVE releases it, as for any failed-create cleanup).
 */
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaState, ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {buildFailedCreateCleanupToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';
import {
  createLifecycleServiceRow,
  createLifecycleStateStore,
  createPartitionRow,
} from '../test-helpers/lifecycle-state-store.js';

const NODE_ID = 'test-node';
const REPLICA_ID = 'replica-claimed-never-admitted';
const OPERATION_ID = 'cleanup-never-admitted';

test('a claimed failed create that was never admitted is removed as a typed no-op',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
    const failed = createLifecycleServiceRow({replicaId: REPLICA_ID,
      status: ReplicaState.FAILED, version: 100, partitionId: 'partition-1',
      nodeId: NODE_ID, cleanupToken: buildFailedCreateCleanupToken(`create-${REPLICA_ID}`),
      createAttemptToken: `create-attempt:${REPLICA_ID}:1`});
    const store = createLifecycleStateStore({services: [failed],
      partitions: [createPartitionRow({partitionId: 'partition-1', nodeId: NODE_ID})]});
    const stateMachine = new ReplicaStateMachine({nodeId: NODE_ID,
      systemTableCache: store.cache, controlPlaneSystemTableGateway: store.gateway,
      now: () => 200});
    stateMachine.registerReplicaSnapshot(failed.service_id, {
      partitionId: failed.partition_id, nodeId: failed.node_id, state: failed.status,
      serviceId: failed.service_id, serviceType: failed.service_type,
      serviceAddress: failed.address, replicaIdentity: failed.replica_id,
      groupId: failed.group_id, cleanupToken: failed.cleanup_token,
      createAttemptToken: failed.create_attempt_token, createdAt: failed.created_at,
      durableVersionColumn: 'state_entered_at', durableVersion: failed.state_entered_at,
      durableUpdatedAt: failed.updated_at, authoritativeSnapshot: true});
    const handler = new ReplicaHandler({nodeId: NODE_ID,
      dataDir: '/tmp/fresh-create-claimed-cleanup-never-admitted',
      systemTableCache: store.cache, cdcIntegrationService: {},
      controlPlaneSystemTableGateway: store.gateway, replicaStateMachine: stateMachine,
      createPartitionService: async () => ({}),
      executorOutcomeEmitter: {emitOutcome: () => {}}});
    // The fenced runtime of the failed create: no service, no consensus port.
    handler.localReplicas.set(REPLICA_ID, {replicaId: REPLICA_ID,
      partitionId: failed.partition_id, status: ReplicaStatus.FAILED, service: null});
    const outcome = new Promise((resolve) => {
      handler.once('replicaRemoved', () => resolve({removed: true}));
      handler.once('replicaRemovalFailed', (event) => resolve({removed: false, event}));
    });
    const request = {operationId: OPERATION_ID, partitionId: failed.partition_id,
      replicaId: REPLICA_ID,
      [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]: failed};
    const accepted = await handler.handleRemoveReplica(request);
    t.equal(accepted.status, ReplicaOperationResponseStatus.INITIATED);
    const first = await outcome;
    t.ok(first.removed || /deletion deferred/u.test(String(first.event?.error)),
      'the first pass completes or leaves typed retryable removal debt ' +
        '(no RemoveNode wait for a never-admitted replica)');
    const replay = await handler.handleRemoveReplica(request);
    t.equal(replay.status, ReplicaOperationResponseStatus.COMPLETED,
      'the cleanup owner redelivery completes the same operation, not an error');
    t.equal(store.durable.services.get(REPLICA_ID)?.status, 'cleanup_complete',
      'the claimed generation holds its operation-bound completion receipt ' +
        'until the terminal REMOVE releases it');
    await handler.shutdown();
  });
