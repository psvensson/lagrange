/**
 * Quest fresh-create-failure-after-committed-admission, L3 condition: the
 * REMOVE that a failed-create cleanup claim drives is a no-op for a replica
 * that was never admitted into its partition's configuration. The failed
 * create's runtime was fenced, so it has no consensus port: the removal
 * completes through the exact claimed lifecycle generation without waiting
 * for a RemoveNode nobody proposes. The first pass completes: its completion
 * is the operation-bound receipt (the row stays a receipt until the terminal
 * REMOVE releases it, so it is never absent here), it reports
 * REPLICA_REMOVE_COMPLETED and the replica leaves lifecycle tracking; a
 * redelivery of the same operation answers COMPLETED from the receipt.
 * (Pre-gate 219c27bfe, replace-replica-7951c147: the first pass required the
 * row to be absent, so it always failed with "REMOVING row deletion deferred"
 * after its receipt was already durable, and the REMOVE stayed in STOPPING.)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
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
    const outcomes = [];
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
    const dataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'lagrange-fresh-create-claimed-cleanup-'),
    );
    const handler = new ReplicaHandler({nodeId: NODE_ID,
      dataDir,
      systemTableCache: store.cache, cdcIntegrationService: {},
      controlPlaneSystemTableGateway: store.gateway, replicaStateMachine: stateMachine,
      createPartitionService: async () => ({}),
      executorOutcomeEmitter: {emitOutcome: (type) => outcomes.push(type)}});
    t.teardown(async () => {
      await handler.shutdown();
      fs.rmSync(dataDir, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    });
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
    t.equal(first.removed, true,
      'the first pass completes through its operation-bound receipt ' +
        `(no RemoveNode wait for a never-admitted replica): ${
          String(first.event?.error ?? '')}`);
    t.same(outcomes, [EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED],
      'the removal reports its completion, never a deferred failure');
    t.equal(stateMachine.getState(REPLICA_ID), null,
      'the removed replica leaves lifecycle tracking (no REMOVING residue)');
    const replay = await handler.handleRemoveReplica(request);
    t.equal(replay.status, ReplicaOperationResponseStatus.COMPLETED,
      'the cleanup owner redelivery completes the same operation, not an error');
    t.equal(store.durable.services.get(REPLICA_ID)?.status, 'cleanup_complete',
      'the claimed generation holds its operation-bound completion receipt ' +
        'until the terminal REMOVE releases it');
    await handler.shutdown();
  });
