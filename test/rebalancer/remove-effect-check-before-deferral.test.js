/**
 * R14 before a deferral: a REMOVE whose effect the durable rows already show
 * complete (the replica's services row is absent) completes at once, even
 * when its delivery is answered with a retryable refusal. Before the fix the
 * coordinator deferred the retryable answer first, so a removal that had
 * already happened (a duplicate REMOVE answered REPLICA_REMOVAL_COMPLETION_
 * DEFERRED, or a lost answer) was held until its retry budget was spent
 * before failDispatchUnlessRemoveEffectComplete observed it. A REMOVE whose
 * replica is still present keeps deferring the retryable answer.
 */
import {test} from '../../src/test-helpers/tap.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {REBALANCER_SKIP_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {createMockPolicyService, createTestCoordinator} from './test-helpers.js';

// A system-table partition: its retryable dispatch failures defer.
const PARTITION_ID = 'logs-p1';
const NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c', 'node-d']);
const REMOVED_REPLICA = `${PARTITION_ID}-r1`;
const DEFERRED_CODE = 'REPLICA_REMOVAL_COMPLETION_DEFERRED';

async function removeAnsweredRetryable(t, {replicaAlreadyAbsent}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const removeRequests = [];
  let coordinator = null;
  coordinator = createTestCoordinator({
    nodeId: 'node-b',
    enableTimeouts: false,
    messageRouter: {
      deliver: async (_target, payload) => {
        if (payload?.type !== ReplicaOperationMessageType.REMOVE_REPLICA) {
          return buildDeliveryEnvelope({acknowledged: true},
            {status: 'completed'});
        }
        removeRequests.push(payload);
        if (replicaAlreadyAbsent) {
          // The removal already completed: its row is durably gone.
          coordinator.systemTableCache.delete(SYSTEM_TABLE_NAME.SERVICES,
            REMOVED_REPLICA);
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          status: ReplicaOperationResponseStatus.ERROR,
          error: 'Replica REMOVING row deletion deferred',
          errorCode: DEFERRED_CODE,
          deferRetry: true,
        });
      },
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({targetReplicaCount: 3,
        minReplicaCount: 3}),
    }),
    cacheData: {
      nodes: NODE_IDS.map((nodeId) => ({node_id: nodeId, status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: Date.now() + 60_000})),
      services: NODE_IDS.map((nodeId, index) => ({
        service_id: `${PARTITION_ID}-r${index + 1}`,
        replica_id: `${PARTITION_ID}-r${index + 1}`,
        partition_id: PARTITION_ID, node_id: nodeId,
        service_type: 'partition', status: 'active', raft_role: 'follower',
        address: `${nodeId}/partition/${PARTITION_ID}-r${index + 1}`})),
    },
  });
  coordinator.initialize();
  t.teardown(async () => {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  const operation = await coordinator.createOperation({
    type: OperationType.REMOVE, partitionId: PARTITION_ID,
    nodeId: 'node-a', replicaId: REMOVED_REPLICA});
  const result = await coordinator.executeOperation(operation);
  return {result, removeRequests};
}

test('a REMOVE whose replica is already absent completes at once although ' +
  'its delivery was answered retryable', async (t) => {
  const {result, removeRequests} =
    await removeAnsweredRetryable(t, {replicaAlreadyAbsent: true});
  t.equal(removeRequests.length, 1, 'the REMOVE was delivered once');
  t.not(result?.reason, REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
    `never deferred (${JSON.stringify(result)})`);
  t.equal(result?.success, true, 'the durable effect check completed it');
});

test('a REMOVE whose replica is still present defers the retryable answer',
  async (t) => {
    const {result} =
      await removeAnsweredRetryable(t, {replicaAlreadyAbsent: false});
    t.equal(result?.reason, REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
      `deferred (${JSON.stringify(result)})`);
  });
