/**
 * A dispatch whose transport outcome is an acknowledged ROUTER_HANDLER_FAILED
 * (the request reached the handler, which threw) is recorded with that
 * outcome's own reason, never with the "Message not acknowledged" fallback
 * of an undelivered request.
 */
import {test} from '../../src/test-helpers/tap.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {ROUTER_HANDLER_FAILED_ERROR_CODE} from '../../src/transport/transport-error-codes.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationMessageType} from '../../src/rebalancer/replica-operation-constants.js';
import {REBALANCE_COORDINATOR_ERROR_MSG} from '../../src/rebalancer/rebalancer-constants.js';
import {createMockPolicyService, createTestCoordinator} from './test-helpers.js';

const PARTITION_ID = 'orders-p1';
const NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c', 'node-d']);
const HANDLER_FAILED_REASON = 'handler_failed';

test('an acknowledged handler failure is recorded with its own reason, not ' +
  '"not acknowledged"', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const coordinator = createTestCoordinator({
    nodeId: 'node-b',
    enableTimeouts: false,
    messageRouter: {
      deliver: async (_target, payload) => payload?.type ===
        ReplicaOperationMessageType.REMOVE_REPLICA ?
        buildDeliveryEnvelope({acknowledged: true,
          errorCode: ROUTER_HANDLER_FAILED_ERROR_CODE}) :
        buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'}),
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
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE, partitionId: PARTITION_ID,
      nodeId: 'node-a', replicaId: `${PARTITION_ID}-r1`});
    const result = await coordinator.executeOperation(operation);
    const recorded = String(result?.error ?? '');
    t.not(recorded, REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
      `not the undelivered fallback (${JSON.stringify(result)})`);
    t.match(recorded, HANDLER_FAILED_REASON,
      'the handler-failure outcome\'s own reason');
  } finally {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
