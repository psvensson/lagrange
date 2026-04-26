/**
 * Tests for Node Joining Service.
 * Requirements: 7.8, 7.10, 7.11, 7.14
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
  JoiningPhase,
} from '../../src/bootstrap/node-joining-service.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {
} from '../../src/bootstrap/shared/partition-service-activation.js';
import {
  ControlPlaneKernelIngress,
} from '../../src/control-plane/control-plane-kernel-ingress.js';
import {
} from '../../src/bootstrap/join-session-store.js';
import {
} from '../../src/bootstrap/node-joining-constants.js';
import {
  MEMBERSHIP_LIFECYCLE_INTENT,
} from '../../src/control-plane/membership-lifecycle-controller.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {
} from '../../src/bootstrap/bootstrap-constants.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
} from '../../src/bootstrap/join-promotion-state-owner.js';
import {
  CDC_OPERATION,
  ENDPOINT_STATUS,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {CDC_EVENT} from '../../src/cdc/cdc-constants.js';
import {EventEmitter} from 'events';

const NODES_ROUTING_PARTITION_ID = 'nodes-p1';
const REMOTE_CANONICAL_LEADER_NODE_ID = 'seed-node-1';

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

test('NodeJoiningService - defers heartbeat-maintenance NODE_STATE_UPDATE on publication pressure after exhausting ingress candidates',
  async (t) => {
    initializeTestEnvironment();

    let nowMs = 2000;
    const service = new NodeJoiningService({
      nodeId: 'joining-node-heartbeat-maintenance',
      nodeAddress: 'ws://localhost:9095531',
      seedNodeAddress: 'http://localhost:8080',
      now: () => nowMs,
    });

    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
      },
    };

    const deliveries = [];
    service.controlPlaneKernelIngress = {
      resolveNodeStateUpdateTargetCandidates: () => [
        'seed-node-2/message-group/mg-1-r4',
        'seed-node-1/message-group/mg-1-r3',
      ],
      invalidateTarget() {},
      noteSuccessfulTarget() {},
    };
    service.messageRouter = {
      async deliver(targetAddress, message, options) {
        deliveries.push({targetAddress, message, options});
        return {
          acknowledged: false,
          error: 'Distributed operation failed due to participant failures',
          errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
          retryAfterMs: 25,
        };
      },
    };

    const deferredOutcome = await service.sendControlPlaneNodeStateUpdate({
      state: STATE.READY,
      heartbeatOnly: true,
      heartbeatAt: nowMs,
      nodeStatePublicationMode:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
    });

    t.equal(
      deferredOutcome.contractState,
      OWNER_CONTRACT_STATE.DEFERRED,
      'maintenance heartbeats should expose the shared deferred contract',
    );
    t.equal(
      deferredOutcome.nextAction,
      OWNER_CONTRACT_NEXT_ACTION.RETRY,
      'maintenance heartbeats should expose the shared retry action',
    );
    t.same(
      deliveries.map((delivery) => delivery.targetAddress),
      [
        'seed-node-2/message-group/mg-1-r4',
        'seed-node-1/message-group/mg-1-r3',
      ],
      'maintenance heartbeats should exhaust fallback ingress targets before deferring under publication pressure',
    );

    nowMs += 30;
    await service.sendControlPlaneNodeStateUpdate({
      state: STATE.READY,
      heartbeatOnly: true,
      heartbeatAt: nowMs,
      nodeStatePublicationMode:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
    });

    t.same(
      deliveries.map((delivery) => delivery.options?.deliveryPriority),
      ['background', 'background', 'background', 'background'],
      'maintenance heartbeats should stay on the background delivery lane when they resume after deferred pressure',
    );
    t.same(
      deliveries.map((delivery) =>
        delivery.message?.nodeStatePublicationMode,
      ),
      [
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
      ],
      'maintenance heartbeats should preserve publication mode across fallback attempts and deferred retries',
    );
  });

test('NodeJoiningService - prefers live local control-plane ingress over a stale confirmed remote lease',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-local-ingress',
      nodeAddress: 'ws://localhost:90956',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        peerAddresses: [
          'seed-node-1/message-group/mg-1-r3',
        ],
      },
    };
    service.messageRouter = {
      getConnectionState() {
        return 'connected';
      },
    };
    service.controlPlaneKernelIngress = new ControlPlaneKernelIngress({
      nodeId: service.nodeId,
      ingressLeaseMs: 5000,
      targetSuppressionMs: 5000,
      getBootstrapResponse: () => service.bootstrapResponse,
      getMessageRouter: () => service.messageRouter,
      getMessageGroupServices: () => new Map([
        ['mg-1-r1', {
          groupId: 'mg-1',
          unifiedAddress:
            'joining-node-local-ingress/message-group/mg-1-r1',
          isLeaderReplica: () => true,
          isMetadataIngressReady: () => true,
        }],
      ]),
    });
    service.controlPlaneKernelIngress
      .noteSuccessfulTarget('seed-node-1/message-group/mg-1-r3');

    const deliveries = [];
    service.messageRouter.deliver = async (targetAddress) => {
      deliveries.push(targetAddress);
      return {acknowledged: true};
    };

    await service.sendControlPlaneNodeStateUpdate({state: STATE.READY});

    t.same(deliveries, [
      'joining-node-local-ingress/message-group/mg-1-r1',
    ], 'node-state publication should use the live local ingress before the stale remote lease');
    t.equal(
      service.controlPlaneKernelIngress.getConfirmedIngressLease()?.targetAddress,
      'joining-node-local-ingress/message-group/mg-1-r1',
      'successful local delivery should replace the stale remote lease',
    );
  });

test('NodeJoiningService - READY heartbeats ignore a stale local ingress lease ' +
  'when local nodes routing has no service rows', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-local-routing-gap',
    nodeAddress: 'ws://localhost:909561',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r3',
      ],
    },
  };
  service.messageRouter = {
    getConnectionState() {
      return 'connected';
    },
  };
  service.controlPlaneKernelIngress = new ControlPlaneKernelIngress({
    nodeId: service.nodeId,
    ingressLeaseMs: 5000,
    targetSuppressionMs: 5000,
    getBootstrapResponse: () => service.bootstrapResponse,
    getMessageRouter: () => service.messageRouter,
    getMessageGroupServices: () => new Map([
      ['mg-1-r1', {
        groupId: 'mg-1',
        unifiedAddress:
          'joining-node-local-routing-gap/message-group/mg-1-r1',
        isLeaderReplica: () => false,
        isMetadataIngressReady: () => true,
      }],
    ]),
    getSqlQueryEngine: () => ({
      getTablePartitions(tableName) {
        return tableName === TABLES.NODES ?
          [{partition_id: NODES_ROUTING_PARTITION_ID}] :
          [];
      },
      queryExecutor: {
        getPartitionRoutingSnapshot() {
          return {
            partitionId: NODES_ROUTING_PARTITION_ID,
            reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
            serviceRowCount: 0,
            routableServiceCount: 0,
          };
        },
      },
    }),
  });
  service.controlPlaneKernelIngress.noteSuccessfulTarget(
    'joining-node-local-routing-gap/message-group/mg-1-r1',
  );

  const deliveries = [];
  service.messageRouter.deliver = async (targetAddress) => {
    deliveries.push(targetAddress);
    return {acknowledged: true};
  };

  await service.sendControlPlaneNodeStateUpdate({
    state: STATE.READY,
    heartbeatAt: Date.now(),
  });

  t.same(deliveries, [
    'seed-node-1/message-group/mg-1-r3',
  ], 'ready heartbeats should fall back to remote authoritative ingress when local nodes routing has no service rows');
});

test('NodeJoiningService - READY heartbeats ignore a stale local ingress lease ' +
  'when local nodes routing has a canonical leader service gap', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-local-leader-gap',
    nodeAddress: 'ws://localhost:909562',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: REMOTE_CANONICAL_LEADER_NODE_ID,
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      peerAddresses: [
        `${REMOTE_CANONICAL_LEADER_NODE_ID}/message-group/mg-1-r3`,
      ],
    },
  };
  service.messageRouter = {
    getConnectionState() {
      return 'connected';
    },
  };
  service.controlPlaneKernelIngress = new ControlPlaneKernelIngress({
    nodeId: service.nodeId,
    ingressLeaseMs: 5000,
    targetSuppressionMs: 5000,
    getBootstrapResponse: () => service.bootstrapResponse,
    getMessageRouter: () => service.messageRouter,
    getMessageGroupServices: () => new Map([
      ['mg-1-r1', {
        groupId: 'mg-1',
        unifiedAddress:
          'joining-node-local-leader-gap/message-group/mg-1-r1',
        isLeaderReplica: () => false,
        isMetadataIngressReady: () => true,
      }],
    ]),
    getSqlQueryEngine: () => ({
      getTablePartitions(tableName) {
        return tableName === TABLES.NODES ?
          [{partition_id: NODES_ROUTING_PARTITION_ID}] :
          [];
      },
      queryExecutor: {
        getPartitionRoutingSnapshot() {
          return {
            partitionId: NODES_ROUTING_PARTITION_ID,
            reasonCode: 'ok',
            serviceRowCount: 1,
            activeAddressedServiceCount: 1,
            routableServiceCount: 1,
            leaderKnown: true,
            canonicalLeaderNodeId: REMOTE_CANONICAL_LEADER_NODE_ID,
            canonicalLeaderServiceCount: 0,
          };
        },
      },
    }),
  });
  service.controlPlaneKernelIngress.noteSuccessfulTarget(
    'joining-node-local-leader-gap/message-group/mg-1-r1',
  );

  const deliveries = [];
  service.messageRouter.deliver = async (targetAddress) => {
    deliveries.push(targetAddress);
    return {acknowledged: true};
  };

  await service.sendControlPlaneNodeStateUpdate({
    state: STATE.READY,
    heartbeatAt: Date.now(),
  });

  t.same(deliveries, [
    `${REMOTE_CANONICAL_LEADER_NODE_ID}/message-group/mg-1-r3`,
  ], 'ready heartbeats should fall back to remote authoritative ingress when the local nodes routing owner still has a canonical leader service gap');
});

test('NodeJoiningService - READY heartbeats retry a local ingress fallback ' +
  'when remote authoritative ingress is stale but the local nodes routing gap stays recovery-routable', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-local-leader-gap-fallback',
    nodeAddress: 'ws://localhost:9095621',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: REMOTE_CANONICAL_LEADER_NODE_ID,
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      peerAddresses: [
        `${REMOTE_CANONICAL_LEADER_NODE_ID}/message-group/mg-1-r3`,
      ],
    },
  };
  const deliveries = [];
  service.messageRouter = {
    getConnectionState() {
      return 'connected';
    },
    async deliver(targetAddress) {
      deliveries.push(targetAddress);
      if (
        targetAddress ===
          `${REMOTE_CANONICAL_LEADER_NODE_ID}/message-group/mg-1-r3`
      ) {
        return {
          acknowledged: false,
          error:
            `No handler registered for address ${targetAddress}`,
        };
      }
      return {acknowledged: true};
    },
  };
  service.controlPlaneKernelIngress = new ControlPlaneKernelIngress({
    nodeId: service.nodeId,
    ingressLeaseMs: 5000,
    targetSuppressionMs: 5000,
    getBootstrapResponse: () => service.bootstrapResponse,
    getMessageRouter: () => service.messageRouter,
    getMessageGroupServices: () => new Map([
      ['mg-1-r1', {
        groupId: 'mg-1',
        unifiedAddress:
          'joining-node-local-leader-gap-fallback/message-group/mg-1-r1',
        isLeaderReplica: () => false,
        isMetadataIngressReady: () => true,
      }],
    ]),
    getSqlQueryEngine: () => ({
      getTablePartitions(tableName) {
        return tableName === TABLES.NODES ?
          [{partition_id: NODES_ROUTING_PARTITION_ID}] :
          [];
      },
      queryExecutor: {
        getPartitionRoutingSnapshot() {
          return {
            partitionId: NODES_ROUTING_PARTITION_ID,
            reasonCode: 'ok',
            serviceRowCount: 1,
            activeAddressedServiceCount: 1,
            routableServiceCount: 1,
            leaderKnown: true,
            canonicalLeaderNodeId: REMOTE_CANONICAL_LEADER_NODE_ID,
            canonicalLeaderServiceCount: 0,
          };
        },
        resolveCanonicalLeaderGapRecoveryRoutingContract() {
          return {
            gapState: 'service_missing',
            recoveryCandidateWidening: true,
          };
        },
      },
    }),
  });

  await service.sendControlPlaneNodeStateUpdate({
    state: STATE.READY,
    heartbeatAt: Date.now(),
  });

  t.same(deliveries, [
    `${REMOTE_CANONICAL_LEADER_NODE_ID}/message-group/mg-1-r3`,
    'joining-node-local-leader-gap-fallback/message-group/mg-1-r1',
  ], 'ready heartbeats should retry the local ingress fallback after a stale remote authoritative target when the nodes routing gap remains recovery-routable');
});

test('NodeJoiningService - READY heartbeats evaluate local target routing on ' +
  'the repair-eligible dimension', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-local-repair-gap',
    nodeAddress: 'ws://localhost:909563',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: REMOTE_CANONICAL_LEADER_NODE_ID,
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      peerAddresses: [
        `${REMOTE_CANONICAL_LEADER_NODE_ID}/message-group/mg-1-r3`,
      ],
    },
  };
  service.messageRouter = {
    getConnectionState() {
      return 'connected';
    },
  };
  service.controlPlaneKernelIngress = new ControlPlaneKernelIngress({
    nodeId: service.nodeId,
    ingressLeaseMs: 5000,
    targetSuppressionMs: 5000,
    getBootstrapResponse: () => service.bootstrapResponse,
    getMessageRouter: () => service.messageRouter,
    getMessageGroupServices: () => new Map([
      ['mg-1-r1', {
        groupId: 'mg-1',
        unifiedAddress:
          'joining-node-local-repair-gap/message-group/mg-1-r1',
        isLeaderReplica: () => false,
        isMetadataIngressReady: () => true,
      }],
    ]),
    getSqlQueryEngine: () => ({
      getTablePartitions(tableName) {
        return tableName === TABLES.NODES ?
          [{partition_id: NODES_ROUTING_PARTITION_ID}] :
          [];
      },
      queryExecutor: {
        getPartitionRoutingSnapshot(_partitionId, decisionDimension) {
          if (decisionDimension ===
              CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE) {
            return {
              partitionId: NODES_ROUTING_PARTITION_ID,
              reasonCode:
                QUERY_ROUTING_DIAGNOSTIC_REASON
                  .ALL_SERVICES_FILTERED_BY_READINESS,
              serviceRowCount: 3,
              activeAddressedServiceCount: 3,
              routableServiceCount: 0,
              leaderKnown: true,
              canonicalLeaderNodeId: REMOTE_CANONICAL_LEADER_NODE_ID,
              canonicalLeaderServiceCount: 3,
            };
          }
          return {
            partitionId: NODES_ROUTING_PARTITION_ID,
            reasonCode: 'ok',
            serviceRowCount: 3,
            activeAddressedServiceCount: 3,
            routableServiceCount: 3,
            leaderKnown: true,
            canonicalLeaderNodeId: REMOTE_CANONICAL_LEADER_NODE_ID,
            canonicalLeaderServiceCount: 3,
          };
        },
      },
    }),
  });
  service.controlPlaneKernelIngress.noteSuccessfulTarget(
    'joining-node-local-repair-gap/message-group/mg-1-r1',
  );

  const deliveries = [];
  service.messageRouter.deliver = async (targetAddress) => {
    deliveries.push(targetAddress);
    return {acknowledged: true};
  };

  await service.sendControlPlaneNodeStateUpdate({
    state: STATE.READY,
    heartbeatAt: Date.now(),
  });

  t.same(deliveries, [
    `${REMOTE_CANONICAL_LEADER_NODE_ID}/message-group/mg-1-r3`,
  ], 'ready heartbeats should reject the local self target when repair-eligible routing is filtered even if recovery routing still has candidates');
});

test('NodeJoiningService - does not retry NODE_STATE_UPDATE on non-transport failures',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-no-retry',
      nodeAddress: 'ws://localhost:9096',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
      },
    };

    const deliveries = [];
    service.controlPlaneKernelIngress = {
      resolveNodeStateUpdateTargetCandidates: () => [
        'seed-node-2/message-group/mg-1-r4',
        'seed-node-1/message-group/mg-1-r3',
      ],
    };
    service.messageRouter = {
      async deliver(targetAddress) {
        deliveries.push(targetAddress);
        return {
          acknowledged: false,
          error: 'validation failed',
        };
      },
    };

    const publicationFailure = await t.rejects(
      service.sendControlPlaneNodeStateUpdate({state: STATE.READY}),
      /validation failed/,
      'should surface non-transport publication failures without fallback retry',
    );
    t.equal(
      publicationFailure?.contractState,
      OWNER_CONTRACT_STATE.FAILED,
      'non-retryable publication failures should expose the shared failed contract state',
    );
    t.equal(
      publicationFailure?.nextAction,
      OWNER_CONTRACT_NEXT_ACTION.STOP,
      'non-retryable publication failures should expose the shared stop action',
    );
    t.same(deliveries, [
      'seed-node-2/message-group/mg-1-r4',
    ], 'should stop after the first non-retryable target failure');
  });

test('NodeJoiningService - reconnects disconnected cluster peers during mesh connect',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-3',
      nodeAddress: 'ws://localhost:9092',
      seedNodeAddress: 'http://localhost:8080',
    });

    const reconnectCalls = [];
    service.bootstrapResponse = {
      systemTableSnapshots: {
        nodes: [
          {node_id: 'joining-node-3', node_address: 'localhost:9092'},
          {node_id: 'peer-disconnected', node_address: 'localhost:8081'},
          {node_id: 'peer-connected', node_address: 'localhost:8082'},
        ],
        node_endpoints: [
          {
            endpoint_id: 'ep-peer-disconnected-ws',
            node_id: 'peer-disconnected',
            transport_type: TRANSPORT_TYPE.WEBSOCKET,
            address: 'ws://peer-disconnected:8083',
            priority: 0,
            status: ENDPOINT_STATUS.ACTIVE,
          },
          {
            endpoint_id: 'ep-peer-connected-ws',
            node_id: 'peer-connected',
            transport_type: TRANSPORT_TYPE.WEBSOCKET,
            address: 'ws://peer-connected:8084',
            priority: 0,
            status: ENDPOINT_STATUS.ACTIVE,
          },
        ],
      },
    };
    service.messageRouter = {
      nodeConnections: new Map([
        ['peer-disconnected', {state: 'disconnected'}],
        ['peer-connected', {state: 'connected'}],
      ]),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        reconnectCalls.push({nodeId, wsAddress});
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      getConnectedNodes() {
        return ['peer-connected'];
      },
    };

    await service.connectToClusterNodes();

    t.equal(reconnectCalls.length, 1, 'should reconnect only disconnected peers');
    t.equal(reconnectCalls[0].nodeId, 'peer-disconnected', 'should reconnect stale entry');
    t.equal(
      reconnectCalls[0].wsAddress,
      'ws://peer-disconnected:8083',
      'should use the canonical node_endpoints websocket address',
    );
  });

test('NodeJoiningService - prefers authoritative cache nodes during mesh connect',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-4',
      nodeAddress: 'ws://localhost:9093',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      systemTableSnapshots: {
        nodes: [
          {node_id: 'joining-node-4', node_address: 'localhost:9093'},
          {node_id: 'seed-node', node_address: 'localhost:8080'},
        ],
      },
    };

    const nodeService = NodeService.getInstance();
    const systemTableCache = nodeService.getSystemTableCache();
    service.systemTableCache = systemTableCache;
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'joining-node-4',
      node_address: 'localhost:9093',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'seed-node',
      node_address: 'localhost:8080',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'late-peer',
      node_address: 'localhost:8084',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(
      TABLES.NODE_ENDPOINTS,
      CDC_OPERATION.INSERT,
      {
        endpoint_id: 'ep-late-peer-ws',
        node_id: 'late-peer',
        transport_type: TRANSPORT_TYPE.WEBSOCKET,
        address: 'ws://late-peer:8086',
        priority: 0,
        status: ENDPOINT_STATUS.ACTIVE,
      },
    );

    const connectCalls = [];
    service.messageRouter = {
      nodeConnections: new Map([
        ['seed-node', {state: 'connected'}],
      ]),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        connectCalls.push({nodeId, wsAddress});
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      getConnectedNodes() {
        return ['seed-node', 'late-peer'];
      },
    };

    await service.connectToClusterNodes();

    t.equal(connectCalls.length, 1, 'should connect only the late cache-discovered peer');
    t.equal(connectCalls[0].nodeId, 'late-peer', 'should target peer missing from bootstrap snapshot');
    t.equal(connectCalls[0].wsAddress, 'ws://late-peer:8086',
      'should use the authoritative cache-backed node_endpoints row');
  });

test('NodeJoiningService - mesh connect includes non-terminal peers once canonical endpoints are visible',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-4b',
      nodeAddress: 'ws://localhost:9098',
      seedNodeAddress: 'http://localhost:8080',
    });

    const nodeService = NodeService.getInstance();
    const systemTableCache = nodeService.getSystemTableCache();
    service.systemTableCache = systemTableCache;
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'joining-node-4b',
      node_address: 'localhost:9098',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'peer-joining',
      node_address: 'localhost:8088',
      status: 'joining',
      connection_state: 'connected',
    });
    systemTableCache.applySystemTableChange(
      TABLES.NODE_ENDPOINTS,
      CDC_OPERATION.INSERT,
      {
        endpoint_id: 'ep-peer-joining-ws',
        node_id: 'peer-joining',
        transport_type: TRANSPORT_TYPE.WEBSOCKET,
        address: 'ws://peer-joining:8088',
        priority: 0,
        status: ENDPOINT_STATUS.ACTIVE,
      },
    );

    const connectCalls = [];
    service.messageRouter = {
      nodeConnections: new Map(),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        connectCalls.push({nodeId, wsAddress});
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      getConnectedNodes() {
        return ['peer-joining'];
      },
    };

    await service.connectToClusterNodes();

    t.same(connectCalls, [
      {nodeId: 'peer-joining', wsAddress: 'ws://peer-joining:8088'},
    ], 'mesh reconciliation should connect to joining peers when node_endpoints are authoritative');
  });

test('NodeJoiningService - ready state update triggers mesh reconciliation without blocking',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-5',
      nodeAddress: 'ws://localhost:9094',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      systemTableSnapshots: {
        nodes: [
          {node_id: 'joining-node-5', node_address: 'localhost:9094'},
          {node_id: 'seed-node', node_address: 'localhost:8080'},
        ],
      },
    };

    const nodeService = NodeService.getInstance();
    const systemTableCache = nodeService.getSystemTableCache();
    service.systemTableCache = systemTableCache;
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'joining-node-5',
      node_address: 'localhost:9094',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'seed-node',
      node_address: 'localhost:8080',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'late-peer',
      node_address: 'localhost:8085',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(
      TABLES.NODE_ENDPOINTS,
      CDC_OPERATION.INSERT,
      {
        endpoint_id: 'ep-late-peer-ready-ws',
        node_id: 'late-peer',
        transport_type: TRANSPORT_TYPE.WEBSOCKET,
        address: 'ws://late-peer:8087',
        priority: 0,
        status: ENDPOINT_STATUS.ACTIVE,
      },
    );

    const callOrder = [];
    service.controlPlaneKernelIngress.resolveNodeStateUpdateTargetCandidates =
      () => [
        'seed-node/message-group/mg-1-r1',
      ];
    service.messageRouter = {
      nodeConnections: new Map([
        ['seed-node', {state: 'connected'}],
      ]),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        callOrder.push(`connect:${nodeId}:${wsAddress}`);
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      async deliver(targetAddress, message) {
        callOrder.push(`deliver:${targetAddress}:${message.state}`);
        return {acknowledged: true};
      },
      getConnectedNodes() {
        return ['seed-node', 'late-peer'];
      },
    };

    await service.sendControlPlaneNodeStateUpdate({state: 'ready'});

    t.same(callOrder, [
      'deliver:seed-node/message-group/mg-1-r1:ready',
      'connect:late-peer:ws://late-peer:8087',
    ], 'ready update should not wait on best-effort peer mesh repair');
  });

test('NodeJoiningService - canonical endpoint CDC triggers one coalesced mesh reconciliation',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-cdc-mesh',
      nodeAddress: 'ws://localhost:9101',
      seedNodeAddress: 'http://localhost:8080',
    });

    let releaseReconciliation;
    const connectCalls = [];
    service.messageRouter = {};
    service.joinReadinessEvaluator.shouldReconnectClusterMesh =
      () => true;
    service.connectToClusterNodes = async () => {
      connectCalls.push('connect');
      await new Promise((resolve) => {
        releaseReconciliation = resolve;
      });
    };

    const cdcIntegrationService = new EventEmitter();
    service.cdcIntegrationService = cdcIntegrationService;

    await service.subscribeToCDCEvents();

    cdcIntegrationService.emit(CDC_EVENT.UPSERT, {
      tableName: TABLES.NODE_ENDPOINTS,
      operation: CDC_EVENT.UPSERT,
    });
    cdcIntegrationService.emit(CDC_EVENT.UPDATE, {
      tableName: TABLES.NODE_ENDPOINTS,
      operation: CDC_EVENT.UPDATE,
    });
    cdcIntegrationService.emit(CDC_EVENT.UPDATE, {
      tableName: TABLES.SERVICES,
      operation: CDC_EVENT.UPDATE,
    });

    await new Promise((resolve) => setImmediate(resolve));

    t.same(
      connectCalls,
      ['connect'],
      'authoritative node_endpoints CDC should trigger one coalesced mesh reconciliation',
    );

    releaseReconciliation();
    await service.pendingClusterMeshReconciliation;

    cdcIntegrationService.emit(CDC_EVENT.INSERT, {
      tableName: TABLES.NODES,
      operation: CDC_EVENT.INSERT,
    });
    await new Promise((resolve) => setImmediate(resolve));

    t.same(
      connectCalls,
      ['connect', 'connect'],
      'canonical node membership CDC should re-arm reconciliation after the prior run completes',
    );

    releaseReconciliation();
    await service.pendingClusterMeshReconciliation;
  });

test('NodeJoiningService - steady ready heartbeats skip redundant mesh reconciliation',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-6',
      nodeAddress: 'ws://localhost:9095',
      seedNodeAddress: 'http://localhost:8080',
    });

    const nodeService = NodeService.getInstance();
    const systemTableCache = nodeService.getSystemTableCache();
    for (const row of [
      {
        node_id: 'joining-node-6',
        node_address: 'localhost:9095',
        status: 'active',
      },
      {
        node_id: 'seed-node',
        node_address: 'localhost:8080',
        status: 'active',
      },
      {
        node_id: 'late-peer',
        node_address: 'localhost:8085',
        status: 'active',
      },
    ]) {
      systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, row);
    }

    const callOrder = [];
    service.controlPlaneKernelIngress.resolveNodeStateUpdateTargetCandidates =
      () => [
        'seed-node/message-group/mg-1-r1',
      ];
    service.messageRouter = {
      nodeConnections: new Map([
        ['seed-node', {state: 'connected'}],
        ['late-peer', {state: 'connected'}],
      ]),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        callOrder.push(`connect:${nodeId}:${wsAddress}`);
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      async deliver(targetAddress, message) {
        callOrder.push(`deliver:${targetAddress}:${message.state}`);
        return {acknowledged: true};
      },
      getConnectedNodes() {
        return ['seed-node', 'late-peer'];
      },
    };

    await service.connectToClusterNodes();
    callOrder.length = 0;

    await service.sendControlPlaneNodeStateUpdate({state: 'ready'});

    t.same(callOrder, [
      'deliver:seed-node/message-group/mg-1-r1:ready',
    ], 'should skip mesh reconciliation when the ready heartbeat sees the same connected mesh');
  });

test('NodeJoiningService - steady ready heartbeats ignore stopped peers in mesh reconciliation',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-7',
      nodeAddress: 'ws://localhost:9096',
      seedNodeAddress: 'http://localhost:8080',
    });

    const nodeService = NodeService.getInstance();
    const systemTableCache = nodeService.getSystemTableCache();
    for (const row of [
      {
        node_id: 'joining-node-7',
        node_address: 'localhost:9096',
        status: 'active',
      },
      {
        node_id: 'seed-node',
        node_address: 'localhost:8080',
        status: 'active',
      },
      {
        node_id: 'stopped-peer',
        node_address: 'localhost:8086',
        status: 'stopped',
      },
    ]) {
      systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, row);
    }

    const callOrder = [];
    service.controlPlaneKernelIngress.resolveNodeStateUpdateTargetCandidates =
      () => [
        'seed-node/message-group/mg-1-r1',
      ];
    service.messageRouter = {
      nodeConnections: new Map([
        ['seed-node', {state: 'connected'}],
        ['stopped-peer', {state: 'disconnected'}],
      ]),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        callOrder.push(`connect:${nodeId}:${wsAddress}`);
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      async deliver(targetAddress, message) {
        callOrder.push(`deliver:${targetAddress}:${message.state}`);
        return {acknowledged: true};
      },
      getConnectedNodes() {
        return ['seed-node'];
      },
    };

    await service.connectToClusterNodes();
    t.equal(
      service.joinReadinessEvaluator.shouldReconnectClusterMesh(),
      false,
      'stopped peers should not keep mesh reconciliation armed',
    );
    callOrder.length = 0;

    await service.sendControlPlaneNodeStateUpdate({state: 'ready'});

    t.same(callOrder, [
      'deliver:seed-node/message-group/mg-1-r1:ready',
    ], 'ready heartbeats should ignore stopped peers when deciding whether to reconcile mesh');
  });

test('NodeJoiningService - shouldReconnectClusterMesh ignores peers already connecting or reconnecting',
  async (t) => {
    initializeTestEnvironment();

    for (const peerConnectionState of ['connecting', 'reconnecting']) {
      const service = new NodeJoiningService({
        nodeId: `joining-node-${peerConnectionState}`,
        nodeAddress: 'ws://localhost:9097',
        seedNodeAddress: 'http://localhost:8080',
      });

      const nodeService = NodeService.getInstance();
      const systemTableCache = nodeService.getSystemTableCache();
      systemTableCache.clear?.();
      for (const row of [
        {
          node_id: `joining-node-${peerConnectionState}`,
          node_address: 'localhost:9097',
          status: 'active',
        },
        {
          node_id: 'seed-node',
          node_address: 'localhost:8080',
          status: 'active',
        },
        {
          node_id: 'late-peer',
          node_address: 'localhost:8087',
          status: 'active',
        },
      ]) {
        systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, row);
      }

      service.messageRouter = {
        nodeConnections: new Map([
          ['seed-node', {state: 'connected'}],
          ['late-peer', {state: peerConnectionState}],
        ]),
        getConnectionState(nodeId) {
          return this.nodeConnections.get(nodeId)?.state || null;
        },
        async connectToNode() {
          throw new Error('unexpected reconnect attempt');
        },
        getConnectedNodes() {
          return ['seed-node'];
        },
      };

      await service.connectToClusterNodes();

      t.equal(
        service.joinReadinessEvaluator.shouldReconnectClusterMesh(),
        false,
        `mesh reconciliation should treat ${peerConnectionState} as already in progress`,
      );
    }
  });

test('NodeJoiningService - fails without seed node address', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    // No seedNodeAddress
  });

  const result = await service.join();

  t.equal(result.success, false);
  t.ok(result.error.includes('Seed node address'));
  t.equal(service.getPhase(), JoiningPhase.FAILED);
});

test('NodeJoiningService - submits join and durable rejoin intent through membership lifecycle controller',
  async (t) => {
    initializeTestEnvironment();

    for (const startupMode of [
      STARTUP_JOIN_MODE.FRESH_JOIN,
      STARTUP_JOIN_MODE.DURABLE_REJOIN,
    ]) {
      const intents = [];
      const service = new NodeJoiningService({
        nodeId: `test-node-${startupMode}`,
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
        startupMode,
        membershipLifecycleController: {
          async submitJoinIntent(intent) {
            intents.push(intent);
            return {
              intentType:
                startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN ?
                  MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY :
                  MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION,
            };
          },
        },
      });
      service.buildJoinCheckpointSteps = () => [];
      service.joinCoordinator.run = async () => {};

      const result = await service.join();

      t.equal(result.success, true,
        `${startupMode} should still complete the delegated join wrapper`);
      t.equal(intents.length, 1,
        `${startupMode} should submit exactly one lifecycle intent`);
      t.match(intents[0], {
        nodeId: `test-node-${startupMode}`,
        startupMode,
        joinSessionId: service.joinSessionId,
        seedNodeAddress: 'http://localhost:8080',
      });
    }
  });
