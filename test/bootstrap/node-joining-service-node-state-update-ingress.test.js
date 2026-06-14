/**
 * Tests for Node Joining Service.
 * Requirements: 7.8, 7.10, 7.11, 7.14
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
} from '../../src/bootstrap/node-joining-service.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  initializeTestEnvironment,
} from './node-joining-service-test-support.js';
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
import {
} from '../../src/bootstrap/join-promotion-state-owner.js';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';

const DEFAULT_SEED_WS_ADDRESS =
  `ws://localhost:${8080 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET}`;
const NODES_ROUTING_PARTITION_ID = 'nodes-p1';
const REMOTE_CANONICAL_LEADER_NODE_ID = 'seed-node-1';

test('NodeJoiningService - retry diagnostics include attempt, elapsed, code, and next delay',
  async (t) => {
    initializeTestEnvironment();

    const debugEvents = [];
    let attempts = 0;
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440103',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      config: {
        httpTimeoutMs: 1000,
        leadershipWaitTimeoutMs: 400,
        leadershipWaitInitialDelayMs: 20,
        leadershipWaitMaxDelayMs: 20,
        leadershipWaitBackoffMultiplier: 2,
        leadershipWaitJitterRatio: 0,
      },
      sleep: async () => {},
      httpPost: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error(
            'HTTP 503: {"success":false,"error":"Bootstrap not ready",' +
            '"code":"BOOTSTRAP_NOT_READY","phase":"registration"}',
          );
        }
        return {
          success: true,
          seedNodeId: 'seed-node-1',
          seedNodeWsAddress: DEFAULT_SEED_WS_ADDRESS,
          messageGroupAssignment: {
            strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
          },
        };
      },
    });

    service.logger = {
      debug(message, details) {
        debugEvents.push({message, details});
      },
      info() {},
      warn() {},
      error() {},
    };

    await service.phaseContactSeed();

    const retryEvent = debugEvents.find((event) =>
      event.details &&
      event.details.attempt === 1 &&
      event.details.lastCode === 'BOOTSTRAP_NOT_READY',
    );

    t.ok(retryEvent, 'should emit retry diagnostics for first retryable failure');
    t.equal(typeof retryEvent.details.elapsedMs, 'number',
      'retry diagnostics should include elapsedMs');
    t.equal(typeof retryEvent.details.nextDelayMs, 'number',
      'retry diagnostics should include nextDelayMs');
    t.equal(retryEvent.details.nextDelayMs, 20,
      'retry diagnostics should report computed delay');
  });

test('NodeJoiningService - resolves control plane target from kernel bootstrap ingress',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-1',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.controlPlaneTargetAddress = 'stale-node/message-group/mg-1-r9';
    service.seedNodeId = 'seed-node-1';
    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        replicaToMove: 'mg-1-r1',
        peerAddresses: [
          'seed-node-1/message-group/mg-1-r1',
          'seed-node-1/message-group/mg-1-r2',
        ],
      },
    };

    service.messageRouter = {
      getConnectionState: (nodeId) => {
        return nodeId === 'seed-node-1' ? 'connected' : 'disconnected';
      },
    };

    const target = service.resolveControlPlaneTargetAddress();

    t.equal(
      target,
      'seed-node-1/message-group/mg-1-r2',
      'should use kernel bootstrap ingress instead of requiring services metadata',
    );
  });

test('NodeJoiningService - uses kernel bootstrap ingress when no local target exists',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-2',
      nodeAddress: 'ws://localhost:9091',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.seedNodeId = 'seed-node-1';
    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        replicaToMove: 'mg-1-r1',
        peerAddresses: [
          'seed-node-1/message-group/mg-1-r1',
          'seed-node-1/message-group/mg-1-r3',
        ],
      },
    };

    const target = service.resolveControlPlaneTargetAddress();

    t.equal(
      target,
      'seed-node-1/message-group/mg-1-r3',
      'should use non-moved bootstrap hint when metadata is unavailable',
    );
  });

test('NodeJoiningService - does not self-target move-replica heartbeats ' +
  'when only local services metadata is present', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-3',
    nodeAddress: 'ws://localhost:9092',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.seedNodeId = 'seed-node-1';
  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r1',
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r1',
        'seed-node-1/message-group/mg-1-r3',
      ],
    },
  };

  service.messageRouter = {
    getConnectionState: (nodeId) => {
      return nodeId === 'seed-node-1' ||
        nodeId === 'joining-node-3' ?
        'connected' :
        'disconnected';
    },
  };

  const nodeService = NodeService.getInstance();
  nodeService.initialize({nodeId: 'joining-node-3'});
  const cache = nodeService.getSystemTableCache();
  cache.applySystemTableChange('services', 'INSERT', {
    service_id: 'mg-1-r1',
    group_id: 'mg-1',
    node_id: 'joining-node-3',
    service_type: 'message_group',
    address: 'joining-node-3/message-group/mg-1-r1',
    status: 'active',
    raft_role: 'leader',
  });

  t.equal(
    service.resolveControlPlaneTargetAddress({allowBootstrapHints: false}),
    null,
    'local-only resolution should refuse self-loop admission targets',
  );
  t.equal(
    service.resolveControlPlaneTargetAddress(),
    'seed-node-1/message-group/mg-1-r3',
    'move-replica admission should use seed ingress instead of self-targeting',
  );
});

test('NodeJoiningService - accepts canonical message-group leader metadata without leader service role',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-canonical-mg-leader',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.messageGroupServices.set('mg-join-r1', {groupId: 'mg-join'});

    const cache = {
      filter(tableName, predicate) {
        if (tableName === TABLES.SERVICES) {
          return [{
            [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
            [COLUMN.GROUP_ID]: 'mg-join',
            [COLUMN.NODE_ID]: 'node-canonical',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            [COLUMN.RAFT_ROLE]: 'follower',
          }].filter(predicate);
        }
        if (tableName === TABLES.MESSAGE_GROUPS) {
          return [{
            [COLUMN.GROUP_ID]: 'mg-join',
            [COLUMN.LEADER_NODE_ID]: 'node-canonical',
          }].filter(predicate);
        }
        return [];
      },
      getAll() {
        return [];
      },
    };

    t.equal(
      service.hasMessageGroupLeaderInCache(cache),
      true,
      'canonical message-group leader_node_id should satisfy join leadership visibility',
    );
  });

test('NodeJoiningService - falls back to leader-role witness when message-group metadata is absent',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-leader-role-fallback',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.messageGroupServices.set('mg-join-r1', {groupId: 'mg-join'});

    const cache = {
      filter(tableName, predicate) {
        if (tableName === TABLES.SERVICES) {
          return [{
            [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
            [COLUMN.GROUP_ID]: 'mg-join',
            [COLUMN.NODE_ID]: 'node-live-leader',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            [COLUMN.RAFT_ROLE]: 'leader',
          }].filter(predicate);
        }
        if (tableName === TABLES.MESSAGE_GROUPS) {
          return [];
        }
        return [];
      },
      getAll() {
        return [];
      },
    };

    t.equal(
      service.hasMessageGroupLeaderInCache(cache),
      true,
      'leader-role witness should still satisfy join leadership visibility when message-group metadata is absent',
    );
  });

test('NodeJoiningService - prefers local kernel ingress for NODE_STATE_UPDATE',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-local',
      nodeAddress: 'ws://localhost:9093',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.seedNodeId = 'seed-node-1';
    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        replicaToMove: 'mg-1-r1',
        peerAddresses: [
          'seed-node-1/message-group/mg-1-r1',
          'seed-node-1/message-group/mg-1-r3',
        ],
      },
    };

    const deliveries = [];
    service.messageRouter = {
      getConnectionState(nodeId) {
        return nodeId === 'joining-node-local' || nodeId === 'seed-node-1' ?
          'connected' :
          'disconnected';
      },
      async deliver(targetAddress, message) {
        deliveries.push({targetAddress, state: message.state});
        return {acknowledged: true};
      },
    };

    service.messageGroupServices.set('mg-1-r2', {
      groupId: 'mg-1',
      unifiedAddress: 'joining-node-local/message-group/mg-1-r2',
      isLeaderReplica: () => true,
      getLeaderId: () => 'mg-1-r2',
      isMetadataIngressReady: () => true,
    });

    const outcome = await service.sendControlPlaneNodeStateUpdate({
      state: 'connected',
    });

    t.same(deliveries, [
      {
        targetAddress: 'joining-node-local/message-group/mg-1-r2',
        state: 'connected',
      },
    ], 'NODE_STATE_UPDATE should use the local kernel ingress before remote routes');
    t.equal(
      outcome.contractState,
      OWNER_CONTRACT_STATE.READY,
      'successful node-state publication should expose the shared ready contract',
    );
    t.equal(
      outcome.nextAction,
      OWNER_CONTRACT_NEXT_ACTION.PROCEED,
      'successful node-state publication should expose the shared proceed action',
    );
  });

test('NodeJoiningService - resolves ordered control-plane target candidates ' +
  'for NODE_STATE_UPDATE', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-candidates',
    nodeAddress: 'ws://localhost:9094',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r1',
      peerAddresses: [
        'seed-node-2/message-group/mg-1-r4',
        'seed-node-1/message-group/mg-1-r3',
      ],
    },
  };
  service.messageRouter = {
    getConnectionState(nodeId) {
      return nodeId === 'joining-node-candidates' ||
        nodeId === 'seed-node-1' ||
        nodeId === 'seed-node-2' ?
        'connected' :
        'disconnected';
    },
  };
  service.messageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    unifiedAddress: 'joining-node-candidates/message-group/mg-1-r2',
    isLeaderReplica: () => true,
    getLeaderId: () => 'mg-1-r2',
    isMetadataIngressReady: () => true,
  });

  t.same(
    service.resolveControlPlaneTargetAddressCandidates({
      allowBootstrapHints: true,
      allowSelfTarget: true,
    }),
    [
      'joining-node-candidates/message-group/mg-1-r2',
      'seed-node-1/message-group/mg-1-r3',
      'seed-node-2/message-group/mg-1-r4',
    ],
    'candidate resolution should prefer local ingress, then seed ingress, then remote ingress',
  );
});

test('NodeJoiningService - NODE_STATE_UPDATE prefers local non-leader ingress ' +
  'for any-replica delivery', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-local-follower',
    nodeAddress: 'ws://localhost:90941',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r2',
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r1',
      ],
    },
  };
  service.messageRouter = {
    getConnectionState() {
      return 'connected';
    },
    async deliver(targetAddress, message) {
      return {
        acknowledged: true,
        targetAddress,
        state: message.state,
      };
    },
  };
  const deliveries = [];
  service.messageRouter.deliver = async (targetAddress, message) => {
    deliveries.push({targetAddress, state: message.state});
    return {acknowledged: true};
  };
  service.messageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    unifiedAddress: 'joining-node-local-follower/message-group/mg-1-r2',
    isLeaderReplica: () => false,
    getLeaderId: () => 'mg-1-r1',
    isMetadataIngressReady: () => true,
  });

  await service.sendControlPlaneNodeStateUpdate({state: 'ready'});

  t.same(deliveries, [
    {
      targetAddress: 'joining-node-local-follower/message-group/mg-1-r2',
      state: 'ready',
    },
  ], 'NODE_STATE_UPDATE should use the local ingress replica even before it becomes leader');
});

test('NodeJoiningService - READY heartbeat NODE_STATE_UPDATE prefers remote ' +
  'authoritative ingress before local self-target', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-ready-heartbeat',
    nodeAddress: 'ws://localhost:909411',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r2',
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r1',
      ],
    },
  };
  const deliveries = [];
  service.messageRouter = {
    getConnectionState() {
      return 'connected';
    },
    async deliver(targetAddress, message) {
      deliveries.push({targetAddress, state: message.state});
      return {acknowledged: true};
    },
  };
  service.messageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    unifiedAddress: 'joining-node-ready-heartbeat/message-group/mg-1-r2',
    isLeaderReplica: () => false,
    getLeaderId: () => 'mg-1-r1',
    isMetadataIngressReady: () => true,
  });

  await service.sendControlPlaneNodeStateUpdate({
    state: STATE.READY,
    heartbeatAt: Date.now(),
  });

  t.same(deliveries, [
    {
      targetAddress: 'seed-node-1/message-group/mg-1-r1',
      state: STATE.READY,
    },
  ], 'READY heartbeats should prefer remote authoritative ingress before local self-target');
});

test('NodeJoiningService - READY heartbeat NODE_STATE_UPDATE falls back to ' +
  'optimistic remote authoritative ingress even when the mesh connection is ' +
  'not yet established', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-ready-heartbeat-optimistic-remote',
    nodeAddress: 'ws://localhost:909412',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r2',
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r1',
      ],
    },
  };
  const deliveries = [];
  service.messageRouter = {
    getConnectionState(nodeId) {
      return nodeId === 'joining-node-ready-heartbeat-optimistic-remote' ?
        'connected' :
        'disconnected';
    },
    async deliver(targetAddress, message) {
      deliveries.push({targetAddress, state: message.state});
      return {acknowledged: true};
    },
  };
  service.messageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    unifiedAddress:
      'joining-node-ready-heartbeat-optimistic-remote/message-group/mg-1-r2',
    isLeaderReplica: () => false,
    getLeaderId: () => 'mg-1-r1',
    isMetadataIngressReady: () => true,
  });

  await service.sendControlPlaneNodeStateUpdate({
    state: STATE.READY,
    heartbeatAt: Date.now(),
  });

  t.same(deliveries, [
    {
      targetAddress: 'seed-node-1/message-group/mg-1-r1',
      state: STATE.READY,
    },
  ], 'READY heartbeats should still try remote authoritative ingress before local self-target when transport delivery can reconnect on demand');
});

test('NodeJoiningService - READY heartbeat NODE_STATE_UPDATE falls back to ' +
  'local ingress when optimistic remote delivery fails', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-ready-heartbeat-local-fallback',
    nodeAddress: 'ws://localhost:909412',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r2',
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r1',
      ],
    },
  };
  const deliveries = [];
  service.messageRouter = {
    getConnectionState(nodeId) {
      return nodeId === 'joining-node-ready-heartbeat-local-fallback' ?
        'connected' :
        'disconnected';
    },
    async deliver(targetAddress, message) {
      deliveries.push({targetAddress, state: message.state});
      if (targetAddress === 'seed-node-1/message-group/mg-1-r1') {
        return {
          acknowledged: false,
          error: 'No connection to node seed-node-1',
        };
      }
      return {acknowledged: true};
    },
  };
  service.messageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    unifiedAddress:
      'joining-node-ready-heartbeat-local-fallback/message-group/mg-1-r2',
    isLeaderReplica: () => false,
    getLeaderId: () => 'mg-1-r1',
    isMetadataIngressReady: () => true,
  });

  await service.sendControlPlaneNodeStateUpdate({
    state: STATE.READY,
    heartbeatAt: Date.now(),
  });

  t.same(deliveries, [
    {
      targetAddress: 'seed-node-1/message-group/mg-1-r1',
      state: STATE.READY,
    },
    {
      targetAddress:
        'joining-node-ready-heartbeat-local-fallback/message-group/mg-1-r2',
      state: STATE.READY,
    },
  ], 'READY heartbeats should retain local fallback after a retryable remote delivery failure');
});

test('NodeJoiningService - READY heartbeat NODE_STATE_UPDATE keeps local ' +
  'recovery-eligible fallback when repair routing is blocked', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-ready-heartbeat-recovery-fallback',
    nodeAddress: 'ws://localhost:909413',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: REMOTE_CANONICAL_LEADER_NODE_ID,
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r2',
      peerAddresses: [
        `${REMOTE_CANONICAL_LEADER_NODE_ID}/message-group/mg-1-r1`,
      ],
    },
  };

  const deliveries = [];
  const routingDecisionDimensions = [];
  service.messageRouter = {
    getConnectionState(nodeId) {
      return nodeId ===
        'joining-node-ready-heartbeat-recovery-fallback' ?
        'connected' :
        'disconnected';
    },
    async deliver(targetAddress, message) {
      deliveries.push({targetAddress, state: message.state});
      if (targetAddress ===
          `${REMOTE_CANONICAL_LEADER_NODE_ID}/message-group/mg-1-r1`) {
        return {
          acknowledged: false,
          error: `No connection to node ${REMOTE_CANONICAL_LEADER_NODE_ID}`,
        };
      }
      return {acknowledged: true};
    },
  };
  service.messageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    unifiedAddress:
      'joining-node-ready-heartbeat-recovery-fallback/message-group/mg-1-r2',
    isLeaderReplica: () => false,
    getLeaderId: () => 'mg-1-r1',
    isMetadataIngressReady: () => true,
  });
  service.cdcIntegrationService = {
    sqlQueryEngine: {
      getTablePartitions(tableName) {
        return tableName === TABLES.NODES ?
          [{partition_id: NODES_ROUTING_PARTITION_ID}] :
          [];
      },
      queryExecutor: {
        getPartitionRoutingSnapshot(_partitionId, decisionDimension) {
          routingDecisionDimensions.push(decisionDimension);
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
    },
  };

  await service.sendControlPlaneNodeStateUpdate({
    state: STATE.READY,
    heartbeatAt: Date.now(),
  });

  t.same(
    deliveries,
    [
      {
        targetAddress:
          `${REMOTE_CANONICAL_LEADER_NODE_ID}/message-group/mg-1-r1`,
        state: STATE.READY,
      },
      {
        targetAddress:
          'joining-node-ready-heartbeat-recovery-fallback/message-group/mg-1-r2',
        state: STATE.READY,
      },
    ],
    'ready heartbeat routing should keep the local ingress fallback when recovery-eligible routing remains open',
  );
  t.same(
    routingDecisionDimensions,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE],
    'node-state update routing should consult the recovery-eligible routing dimension',
  );
});

test('NodeJoiningService - query transport selection uses initialized local ' +
  'relay during join convergence', (t) => {
  initializeTestEnvironment();
  t.plan(3);

  const service = new NodeJoiningService({
    nodeId: 'joining-node-query-transport-relay',
    nodeAddress: 'ws://localhost:90942',
    seedNodeAddress: 'http://localhost:8080',
  });

  const relayService = {
    initialized: true,
    sendMessage: async () => ({acknowledged: true}),
    isLeaderReplica: () => false,
    getMetadataIngressReadiness: () => ({
      ready: false,
      reason: 'operational message-group ingress not ready',
      retryAfterMs: 50,
    }),
  };
  service.messageGroupServices.set('mg-1-r1', relayService);

  t.equal(
    service.resolveOperationalMessageGroupSelection().service,
    null,
    'metadata-ingress selection should continue to block the relay',
  );

  const selection = service.resolveQueryTransportMessageGroupSelection();

  t.equal(
    selection.service,
    relayService,
    'query transport selection should still bind the initialized local relay',
  );
  t.equal(
    selection.route,
    'relay',
    'query transport selection should report the relay route',
  );
});

test('NodeJoiningService - connect websocket phase wires the dedicated query ' +
  'transport selector', (t) => {
  initializeTestEnvironment();
  t.plan(3);

  const service = new NodeJoiningService({
    nodeId: 'joining-node-query-transport-phase-wiring',
    nodeAddress: 'ws://localhost:90943',
    seedNodeAddress: 'http://localhost:8080',
  });

  const relayService = {
    initialized: true,
    sendMessage: async () => ({acknowledged: true}),
    isLeaderReplica: () => false,
    getMetadataIngressReadiness: () => ({
      ready: false,
      reason: 'operational message-group ingress not ready',
      retryAfterMs: 25,
    }),
  };
  service.messageGroupServices.set('mg-1-r1', relayService);

  t.equal(
    service.connectWebSocketPhase.delegates.getLeaderMessageGroupService(),
    null,
    'operational selector should still block the relay while metadata ingress is deferred',
  );
  t.equal(
    typeof service.connectWebSocketPhase.delegates
      .resolveQueryTransportMessageGroupSelection,
    'function',
    'connect websocket phase should receive the dedicated query transport selector',
  );
  t.equal(
    service.connectWebSocketPhase.delegates
      .resolveQueryTransportMessageGroupSelection()
      ?.service,
    relayService,
    'connect websocket phase should route query transport through the dedicated relay selection',
  );
});

test('NodeJoiningService - excludes disconnected control-plane ingress candidates',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-reconnectable-target',
      nodeAddress: 'ws://localhost:90945',
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
        return 'disconnected';
      },
      async deliver(targetAddress) {
        return {
          acknowledged: true,
          targetAddress,
        };
      },
    };

    t.same(
      service.resolveControlPlaneTargetAddressCandidates({
        allowBootstrapHints: true,
        allowSelfTarget: false,
      }),
      [],
      'disconnected ingress should not be returned until connectivity is re-established',
    );

    await t.rejects(
      service.sendControlPlaneNodeStateUpdate({state: STATE.READY}),
      /No reachable control plane target address available/,
      'READY publication should fail closed when no reachable control-plane ingress exists',
    );
  });

test('NodeJoiningService - retries NODE_STATE_UPDATE on stale control-plane target',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-retry',
      nodeAddress: 'ws://localhost:9095',
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
        'stale-node/message-group/mg-1-r9',
        'seed-node-1/message-group/mg-1-r3',
      ],
    };
    service.messageRouter = {
      async deliver(targetAddress) {
        deliveries.push(targetAddress);
        if (targetAddress === 'stale-node/message-group/mg-1-r9') {
          return {
            acknowledged: false,
            error: 'No connection to node stale-node',
          };
        }
        return {acknowledged: true};
      },
    };

    await service.sendControlPlaneNodeStateUpdate({state: STATE.READY});

    t.same(deliveries, [
      'stale-node/message-group/mg-1-r9',
      'seed-node-1/message-group/mg-1-r3',
    ], 'should retry NODE_STATE_UPDATE against the fallback target');
    t.equal(
      service.controlPlaneTargetAddress,
      'seed-node-1/message-group/mg-1-r3',
      'should retain the successful control-plane target after retry',
    );
  });

test('NodeJoiningService - reuses confirmed control-plane ingress after stale-target retry',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-confirmed-ingress',
      nodeAddress: 'ws://localhost:90955',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        peerAddresses: [
          'stale-node/message-group/mg-1-r9',
          'seed-node-1/message-group/mg-1-r3',
        ],
      },
    };
    service.messageRouter = {
      getConnectionState(nodeId) {
        return nodeId === 'stale-node' ||
          nodeId === 'seed-node-1' ?
          'connected' :
          'disconnected';
      },
    };
    service.controlPlaneKernelIngress = new ControlPlaneKernelIngress({
      nodeId: service.nodeId,
      ingressLeaseMs: 5000,
      targetSuppressionMs: 5000,
      getBootstrapResponse: () => service.bootstrapResponse,
      getMessageRouter: () => service.messageRouter,
    });
    service.controlPlaneKernelIngress
      .noteSuccessfulTarget('stale-node/message-group/mg-1-r9');

    const deliveries = [];
    service.messageRouter.deliver = async (targetAddress) => {
      deliveries.push(targetAddress);
      if (targetAddress === 'stale-node/message-group/mg-1-r9') {
        return {
          acknowledged: false,
          error: 'No connection to node stale-node',
        };
      }
      return {acknowledged: true};
    };

    await service.sendControlPlaneNodeStateUpdate({state: STATE.READY});
    await service.sendControlPlaneNodeStateUpdate({state: STATE.READY});

    t.same(deliveries, [
      'stale-node/message-group/mg-1-r9',
      'seed-node-1/message-group/mg-1-r3',
      'seed-node-1/message-group/mg-1-r3',
    ], 'subsequent publications should reuse the confirmed fallback ingress');
    t.equal(
      service.controlPlaneKernelIngress.getConfirmedIngressLease()?.targetAddress,
      'seed-node-1/message-group/mg-1-r3',
      'successful retry should promote the fallback ingress into the kernel lease owner',
    );
  });

test('NodeJoiningService - retries CONNECTED NODE_STATE_UPDATE once on the same target after a deferred transport failure',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-same-target-retry',
      nodeAddress: 'ws://localhost:909551',
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
    const sleepCalls = [];
    service.sleep = async (delayMs) => {
      sleepCalls.push(delayMs);
    };
    service.controlPlaneKernelIngress = {
      resolveNodeStateUpdateTargetCandidates: () => [
        'seed-node-1/message-group/mg-1-r3',
      ],
      invalidateTarget() {},
      noteSuccessfulTarget() {},
    };
    service.messageRouter = {
      async deliver(targetAddress) {
        deliveries.push(targetAddress);
        if (deliveries.length === 1) {
          return {
            acknowledged: false,
            error: 'Connection to node seed-node-1 closed',
            errorCode: 'ROUTER_CONNECTION_CLOSED',
            deferRetry: true,
            retryAfterMs: 25,
          };
        }
        return {acknowledged: true};
      },
    };

    await service.sendControlPlaneNodeStateUpdate({state: STATE.CONNECTED});

    t.same(deliveries, [
      'seed-node-1/message-group/mg-1-r3',
      'seed-node-1/message-group/mg-1-r3',
    ], 'connected publication should retry the same authoritative target once after a deferred transport failure');
    t.same(sleepCalls, [25],
      'same-target retry should honor the deferred retry-after hint');
  });

test('NodeJoiningService - retries heartbeat-recovery NODE_STATE_UPDATE on alternate ingress before deferring',
  async (t) => {
    initializeTestEnvironment();

    let nowMs = 1000;
    const service = new NodeJoiningService({
      nodeId: 'joining-node-heartbeat-recovery',
      nodeAddress: 'ws://localhost:909552',
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
        if (deliveries.length === 1) {
          return {
            acknowledged: false,
            error: 'Distributed operation failed due to participant failures',
            errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
            retryAfterMs: 25,
          };
        }
        return {acknowledged: true};
      },
    };

    const outcome = await service.sendControlPlaneNodeStateUpdate({
      state: STATE.READY,
      heartbeatOnly: true,
      heartbeatAt: nowMs,
      nodeStatePublicationMode:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
    });

    t.equal(
      outcome.contractState,
      OWNER_CONTRACT_STATE.READY,
      'recovery heartbeats should stay ready when a fallback ingress accepts the write',
    );
    t.equal(
      outcome.publicationMode,
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
      'successful fallback publication should preserve the original recovery mode',
    );
    t.same(
      deliveries.map((delivery) => delivery.targetAddress),
      [
        'seed-node-2/message-group/mg-1-r4',
        'seed-node-1/message-group/mg-1-r3',
      ],
      'recovery heartbeats should try the fallback ingress before deferring on publication pressure',
    );

    nowMs += 10;
    const repeatedOutcome = await service.sendControlPlaneNodeStateUpdate({
      state: STATE.READY,
      heartbeatOnly: true,
      heartbeatAt: nowMs,
      nodeStatePublicationMode:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
    });

    t.equal(
      repeatedOutcome.contractState,
      OWNER_CONTRACT_STATE.READY,
      'subsequent recovery heartbeats should continue reporting ready after fallback recovery succeeds',
    );
    t.equal(
      deliveries.length,
      3,
      'subsequent recovery heartbeats should retry immediately instead of staying in a deferred slot',
    );
    t.same(
      deliveries.map((delivery) => delivery.options?.deliveryPriority),
      ['critical', 'critical', 'critical'],
      'recovery heartbeats should stay on the critical delivery lane across fallback retries',
    );
  });

test('NodeJoiningService - retries heartbeat-recovery NODE_STATE_UPDATE on stale no-handler ingress targets',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-heartbeat-no-handler-retry',
      nodeAddress: 'ws://localhost:909553',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
      },
    };

    const staleTargetAddress = 'seed-node-1/message-group/mg-1-r2';
    const fallbackTargetAddress = 'seed-node-1/message-group/mg-1-r3';
    const invalidatedTargets = [];
    const deliveries = [];

    service.controlPlaneKernelIngress = {
      resolveNodeStateUpdateTargetCandidates: () => [
        staleTargetAddress,
        fallbackTargetAddress,
      ],
      invalidateTarget(targetAddress) {
        invalidatedTargets.push(targetAddress);
      },
      noteSuccessfulTarget() {},
    };
    service.messageRouter = {
      async deliver(targetAddress, message, options) {
        deliveries.push({targetAddress, message, options});
        if (targetAddress === staleTargetAddress) {
          return {
            acknowledged: false,
            error: `No handler registered for address ${staleTargetAddress}`,
          };
        }
        return {acknowledged: true};
      },
    };

    await service.sendControlPlaneNodeStateUpdate({
      state: STATE.READY,
      heartbeatOnly: true,
      heartbeatAt: Date.now(),
      nodeStatePublicationMode:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
    });

    t.same(
      deliveries.map((delivery) => delivery.targetAddress),
      [
        staleTargetAddress,
        fallbackTargetAddress,
      ],
      'recovery heartbeats should retry the fallback ingress after a stale no-handler target',
    );
    t.same(
      invalidatedTargets,
      [staleTargetAddress],
      'stale no-handler ingress targets should be invalidated before fallback retry',
    );
    t.same(
      deliveries.map((delivery) => delivery.options?.deliveryPriority),
      ['critical', 'critical'],
      'stale-target recovery retries should remain on the critical delivery lane',
    );
  });
