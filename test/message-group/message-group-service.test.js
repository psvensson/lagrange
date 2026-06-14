/**
 * Unit tests for MessageGroupService.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createTestTransport,
  registerMessageGroupServiceLifecycleHooks,
  setTestPortBase,
} from './message-group-service-test-support.js';
import {
  MessageGroupService,
  RaftRole,
} from '../../src/message-group/message-group-service.js';
import {
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
  MESSAGE_GROUP_CDC_ERROR_MSG,
} from '../../src/message-group/constants.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  CDC_OPERATION,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import LifeRaft from '@markwylde/liferaft';
import {
  RAFT_EVENT,
} from '../../src/raft/constants.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';

setTestPortBase(24000);
registerMessageGroupServiceLifecycleHooks();

test('MessageGroupService - constructor requires groupId', async (t) => {
  const {router, cleanup} = await createTestTransport();
  try {
    t.throws(
      () => new MessageGroupService({replicaId: 'r1', transport: router}),
      /requires groupId/,
      'Should throw without groupId',
    );
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - constructor requires replicaId', async (t) => {
  const {router, cleanup} = await createTestTransport();
  try {
    t.throws(
      () => new MessageGroupService({groupId: 'mg-1', transport: router}),
      /requires replicaId/,
      'Should throw without replicaId',
    );
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - constructor requires transport', async (t) => {
  t.throws(
    () => new MessageGroupService({groupId: 'mg-1', replicaId: 'r1'}),
    /requires transport.*WebSocket transport is mandatory/,
    'Should throw without transport',
  );
});

test('MessageGroupService - constructor requires WebSocket-based transport', async (t) => {
  // Create a transport that doesn't have WebSocket markers
  const invalidTransport = {
    deliver: async () => ({acknowledged: true}),
    initialize: async () => {},
    shutdown: async () => {},
    // Missing setMessageRouter and setServiceNodeResolver
  };

  t.throws(
    () => new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'r1',
      transport: invalidTransport,
    }),
    /requires WebSocket-based transport/,
    'Should throw with non-WebSocket transport',
  );
});

test('MessageGroupService - constructor initializes correctly', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      replicaIds: ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'],
      transport: router,
    });

    t.equal(service.groupId, 'mg-1', 'Should set groupId');
    t.equal(service.replicaId, 'mg-1-r1', 'Should set replicaId');
    t.equal(service.nodeId, nodeId, 'Should set nodeId');
    t.equal(service.replicaIds.length, 3, 'Should set replicaIds');
    t.equal(service.initialized, false, 'Should not be initialized');
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - initialize becomes leader for single replica', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    t.equal(service.initialized, true, 'Should be initialized');
    // Single replica services become leader immediately (no election needed)
    t.equal(service.getRole(), RaftRole.LEADER, 'Should become leader for single replica');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - follower demotion clears stale self leader id', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-demotion-clear',
      replicaId: 'mg-demotion-clear-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();
    t.equal(service.leaderId, service.replicaId, 'single replica should start as self leader');

    service.raft.emit(RAFT_EVENT.FOLLOWER);

    t.equal(service.isLeader, false, 'follower event should clear leader flag');
    t.equal(service.leaderId, null, 'follower event should clear stale self leader id');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test(
  'MessageGroupService - joining existing group ignores candidate churn until join completes',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-join-existing',
        replicaId: 'mg-join-existing-r2',
        nodeId,
        replicaIds: ['mg-join-existing-r1', 'mg-join-existing-r2'],
        peerAddresses: ['seed-node-1/message-group/mg-join-existing-r1'],
        transport: router,
        deferElection: true,
        isJoiningExistingGroup: true,
      });

      await service.initialize();
      t.equal(service.role, RaftRole.FOLLOWER, 'joining replica should start as follower');

      service.raft.emit(RAFT_EVENT.CANDIDATE);

      t.equal(
        service.role,
        RaftRole.FOLLOWER,
        'joining replica should ignore candidate transitions while join suppression is active',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - joining existing group rejects vote requests and stays timer-suppressed',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const deliveries = [];
    const originalDeliver = router.deliver.bind(router);
    router.deliver = async (targetAddress, payload, options) => {
      deliveries.push({targetAddress, payload, options});
      return originalDeliver(targetAddress, payload, options)
        .catch(() => ({acknowledged: true}));
    };

    try {
      const service = new MessageGroupService({
        groupId: 'mg-join-vote',
        replicaId: 'mg-join-vote-r2',
        nodeId,
        replicaIds: ['mg-join-vote-r1', 'mg-join-vote-r2'],
        peerAddresses: ['seed-node-1/message-group/mg-join-vote-r1'],
        transport: router,
        deferElection: true,
        isJoiningExistingGroup: true,
      });

      await service.initialize();
      const heartbeatActiveBefore = service.raft?.timers?.active('heartbeat');
      t.notOk(
        heartbeatActiveBefore,
        'joining replica should start without an active heartbeat timer',
      );

      await service.receiveMessage({
        type: 'vote',
        term: 1,
        address: 'seed-node-1/message-group/mg-join-vote-r1',
        leader: '',
        last: {
          index: 0,
          term: 0,
          committedIndex: 0,
        },
      });

      const voteResponse = deliveries.find((entry) => {
        return entry.payload?.type === 'voted';
      });
      t.ok(voteResponse, 'joining replica should respond to vote requests');
      t.equal(
        voteResponse?.payload?.data?.granted,
        false,
        'joining replica should deny votes until join suppression is released',
      );
      t.notOk(
        service.raft?.timers?.active('heartbeat'),
        'joining replica should keep heartbeat timers suppressed after vote traffic',
      );

      await service.shutdown();
    } finally {
      router.deliver = originalDeliver;
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - joining existing group keeps append traffic from rearming timers',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-join-append',
        replicaId: 'mg-join-append-r2',
        nodeId,
        replicaIds: ['mg-join-append-r1', 'mg-join-append-r2'],
        peerAddresses: ['seed-node-1/message-group/mg-join-append-r1'],
        transport: router,
        deferElection: true,
        isJoiningExistingGroup: true,
      });

      await service.initialize();
      await service.receiveMessage({
        type: 'append',
        term: 1,
        address: 'seed-node-1/message-group/mg-join-append-r1',
        leader: 'seed-node-1/message-group/mg-join-append-r1',
        last: {
          index: 0,
          term: 0,
          committedIndex: 0,
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));

      t.notOk(
        service.raft?.timers?.active('heartbeat'),
        'joining replica should not rearm heartbeat timers from append traffic',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - completeJoinConvergence re-enables normal raft participation for moved replicas',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-join-release',
        replicaId: 'mg-join-release-r2',
        nodeId,
        replicaIds: ['mg-join-release-r1', 'mg-join-release-r2'],
        peerAddresses: ['seed-node-1/message-group/mg-join-release-r1'],
        transport: router,
        deferElection: true,
        isJoiningExistingGroup: true,
      });

      await service.initialize();
      service.completeJoinConvergence();

      t.equal(
        service.isJoiningExistingGroup,
        false,
        'join completion should release the join suppression state',
      );
      t.equal(
        service.electionStarted,
        true,
        'join completion should start the election timer for the moved replica',
      );
      t.ok(
        service.raft?.timers?.active('heartbeat'),
        'join completion should restore heartbeat timers for normal raft participation',
      );

      service.raft.emit(RAFT_EVENT.CANDIDATE);
      t.equal(
        service.role,
        RaftRole.CANDIDATE,
        'after join completion the replica should process candidate transitions normally',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - completeJoinConvergence releases deferred self-hosted follower elections',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-self-hosted-release',
        replicaId: 'mg-self-hosted-release-r1',
        nodeId,
        replicaIds: [
          'mg-self-hosted-release-r0',
          'mg-self-hosted-release-r1',
          'mg-self-hosted-release-r2',
        ],
        peerAddresses: [
          `${nodeId}/message-group/mg-self-hosted-release-r0`,
          `${nodeId}/message-group/mg-self-hosted-release-r1`,
          `${nodeId}/message-group/mg-self-hosted-release-r2`,
        ],
        transport: router,
        deferElection: true,
        deferElectionUntilJoinConvergence: true,
      });

      await service.initialize();

      t.equal(
        service.electionStarted,
        false,
        'self-hosted follower elections should remain suppressed during join',
      );

      service.completeJoinConvergence();

      t.equal(
        service.deferElectionUntilJoinConvergence,
        false,
        'join convergence should release the self-hosted follower suppression state',
      );
      t.equal(
        service.electionStarted,
        true,
        'join convergence should start follower election timers for normal failover',
      );
      t.ok(
        service.raft?.timers?.active('heartbeat'),
        'join convergence should restore heartbeat timers for self-hosted followers',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - deferred self-hosted followers stay timer-suppressed until join convergence',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-self-hosted-suppressed',
        replicaId: 'mg-self-hosted-suppressed-r1',
        nodeId,
        replicaIds: [
          'mg-self-hosted-suppressed-r0',
          'mg-self-hosted-suppressed-r1',
          'mg-self-hosted-suppressed-r2',
        ],
        peerAddresses: [
          `${nodeId}/message-group/mg-self-hosted-suppressed-r0`,
          `${nodeId}/message-group/mg-self-hosted-suppressed-r1`,
          `${nodeId}/message-group/mg-self-hosted-suppressed-r2`,
        ],
        transport: router,
        deferElection: true,
        deferElectionUntilJoinConvergence: true,
      });

      await service.initialize();
      await service.receiveMessage({
        type: 'append',
        term: 1,
        address: `${nodeId}/message-group/mg-self-hosted-suppressed-r0`,
        leader: `${nodeId}/message-group/mg-self-hosted-suppressed-r0`,
        last: {
          index: 0,
          term: 0,
          committedIndex: 0,
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));

      t.notOk(
        service.raft?.timers?.active('heartbeat'),
        'append traffic should not rearm timers for deferred self-hosted followers',
      );

      service.raft.emit(RAFT_EVENT.CANDIDATE);
      t.equal(
        service.role,
        RaftRole.FOLLOWER,
        'suppressed self-hosted followers should ignore candidate churn until convergence',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC no-target miss triggers authoritative topology repair',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-repair',
        replicaId: 'mg-strict-repair-r3',
        nodeId,
        replicaIds: [
          'mg-strict-repair-r1',
          'mg-strict-repair-r2',
          'mg-strict-repair-r3',
        ],
        transport: router,
      });

      let repairContext = null;
      service.maybeRepairAuthoritativeForwardTopology = async (context = {}) => {
        repairContext = context;
        return true;
      };

      const readiness = service.canAcceptCDCEvent({
        tableName: TABLES.SERVICES,
        operation: CDC_OPERATION.UPSERT,
      });
      await new Promise((resolve) => setImmediate(resolve));

      t.equal(
        readiness.ready,
        false,
        'strict system-table CDC should defer when no canonical leader target is available',
      );
      t.match(
        readiness.reason,
        /leader is unknown/i,
        'strict miss should expose the typed leader-unknown reason',
      );
      t.ok(repairContext, 'strict miss should trigger bounded authoritative topology repair');
      t.equal(
        repairContext?.tableName,
        TABLES.SERVICES,
        'repair context should retain the strict system table name',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - authoritative forward-topology repair uses the ' +
    'shared control-plane workload contract',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const readCalls = [];
      const service = new MessageGroupService({
        groupId: 'mg-forward-topology-workload',
        replicaId: 'mg-forward-topology-workload-r2',
        nodeId,
        transport: router,
        controlPlaneSystemTableGateway: {
          async executeRead(intent, options) {
            readCalls.push({intent, options});
            if (intent.tableName === TABLES.MESSAGE_GROUPS) {
              return {
                success: true,
                rows: [{
                  [COLUMN.GROUP_ID]: 'mg-forward-topology-workload',
                  [COLUMN.LEADER_NODE_ID]: 'seed-node',
                }],
              };
            }
            if (intent.tableName === TABLES.SERVICES) {
              return {
                success: true,
                rows: [{
                  [COLUMN.SERVICE_ID]: 'mg-forward-topology-workload-r1',
                  [COLUMN.GROUP_ID]: 'mg-forward-topology-workload',
                  [COLUMN.NODE_ID]: 'seed-node',
                  [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
                  [COLUMN.ADDRESS]:
                    'seed-node/message-group/mg-forward-topology-workload-r1',
                  [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
                }],
              };
            }
            return {
              success: true,
              rows: [{
                [COLUMN.NODE_ID]: 'seed-node',
                [COLUMN.STATUS]: STATE.CONNECTED,
              }],
            };
          },
          setCdcIntegrationService() {},
          setSqlQueryEngine() {},
          setSystemTableCache() {},
          setMessageRouter() {},
        },
      });

      service.applyAuthoritativeForwardTopologyRows = async () => 0;
      service.reconcileAuthoritativeForwardServiceRows = async () => 0;

      const result = await service.repairAuthoritativeForwardTopology({
        errorMessage: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });

      t.equal(result.repaired, false, 'no-op repair should stay a no-op');
      t.equal(readCalls.length, 3, 'repair should read message groups, services, and nodes');
      t.equal(
        readCalls[0]?.options?.workloadClass,
        CONTROL_PLANE_WORKLOAD_CLASS.MESSAGE_GROUP_FORWARD_TOPOLOGY_REPAIR,
        'forward-topology repair should use the shared repair workload class',
      );
      t.equal(
        readCalls[0]?.options?.workClass,
        PRESSURE_WORK_CLASS.CRITICAL,
        'forward-topology repair should use the critical control-plane work class',
      );
      t.equal(
        readCalls[0]?.options?.allowPressureDegrade,
        true,
        'forward-topology repair should keep workload-owned degrade semantics explicit',
      );
      t.equal(
        readCalls[0]?.options?.allowPressureDefer,
        true,
        'forward-topology repair should keep workload-owned defer semantics explicit',
      );
      t.equal(
        readCalls[0]?.options?.preferOwnerRpcRead,
        false,
        'forward-topology repair should not prefer routed owner-rpc reads',
      );
      t.equal(
        readCalls[0]?.options?.requireOwnerRpcRead,
        false,
        'forward-topology repair should not require routed owner-rpc reads',
      );
      t.equal(
        readCalls[0]?.options?.allowOwnerRpcFallback,
        false,
        'forward-topology repair should fail closed instead of recursing through owner-rpc fallback',
      );
      t.equal(
        readCalls[0]?.options?.allowSqlFallback,
        false,
        'forward-topology repair should not fall back to sql reads',
      );
      t.equal(
        readCalls[0]?.options?.confirmEmptyLocalReadWithOwnerRpc,
        false,
        'forward-topology repair should keep empty local reads local-only',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - live leader routing uses current raft peer addresses before cache echo',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-live-leader-address',
        replicaId: 'mg-live-leader-address-r3',
        nodeId,
        replicaIds: [
          'mg-live-leader-address-r1',
          'mg-live-leader-address-r2',
          'mg-live-leader-address-r3',
        ],
        transport: router,
      });

      service.leaderId = 'peer-node-a/message-group/mg-live-leader-address-r1';
      service.raft = {
        nodes: [
          {address: 'peer-node-a/message-group/mg-live-leader-address-r1'},
        ],
      };

      const target = service.resolveLiveLeaderForwardTarget();

      t.same(target, {
        serviceId: 'mg-live-leader-address-r1',
        address: 'peer-node-a/message-group/mg-live-leader-address-r1',
      }, 'live leader routing should normalize live raft leader addresses before cache echo');
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC accepts connected live leader targets before ready lease publication',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-ready-gate',
        replicaId: 'mg-strict-ready-gate-r3',
        nodeId,
        replicaIds: [
          'mg-strict-ready-gate-r1',
          'mg-strict-ready-gate-r2',
          'mg-strict-ready-gate-r3',
        ],
        transport: router,
      });

      router.getConnectionState = (targetNodeId) => {
        return targetNodeId === 'peer-node-a' ? STATE.CONNECTED : STATE.CONNECTED;
      };
      service.leaderId = 'mg-strict-ready-gate-r1';
      service.raft = {
        nodes: [
          {address: 'peer-node-a/message-group/mg-strict-ready-gate-r1'},
        ],
      };
      service.systemTableCache.applySystemTableChange(
        TABLES.NODES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.NODE_ID]: 'peer-node-a',
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
          [COLUMN.LAST_HEARTBEAT]: Date.now(),
          [COLUMN.READY_LEASE_EXPIRES_AT]: null,
        },
      );

      const readiness = service.canAcceptCDCEvent({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });

      t.equal(
        readiness.ready,
        true,
        'strict forwarding should keep owner relay traffic routable before ready lease publication',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - metadata ingress accepts connected canonical cache leader before ready lease publication',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-cache-ready-gate',
        replicaId: 'mg-strict-cache-ready-gate-r3',
        nodeId,
        replicaIds: [
          'mg-strict-cache-ready-gate-r1',
          'mg-strict-cache-ready-gate-r2',
          'mg-strict-cache-ready-gate-r3',
        ],
        transport: router,
      });

      service.initialized = true;
      router.getConnectionState = (targetNodeId) => {
        return targetNodeId === 'peer-node-b' ? STATE.CONNECTED : STATE.CONNECTED;
      };
      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-strict-cache-ready-gate',
          [COLUMN.LEADER_NODE_ID]: 'peer-node-b',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.NODES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.NODE_ID]: 'peer-node-b',
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
          [COLUMN.LAST_HEARTBEAT]: Date.now(),
          [COLUMN.READY_LEASE_EXPIRES_AT]: null,
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-cache-ready-gate-r1',
          [COLUMN.GROUP_ID]: 'mg-strict-cache-ready-gate',
          [COLUMN.NODE_ID]: 'peer-node-b',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]:
            'peer-node-b/message-group/mg-strict-cache-ready-gate-r1',
          [COLUMN.RAFT_ROLE]: RaftRole.FOLLOWER,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );

      const readiness = service.getMetadataIngressReadiness({
        requiredTables: [TABLES.SERVICES],
      });

      t.equal(
        readiness.ready,
        true,
        'metadata ingress should accept the connected canonical leader before ready lease publication completes',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC accepts connected canonical leader during join convergence before ready lease publication',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-join-strict-connected',
        replicaId: 'mg-join-strict-connected-r1',
        nodeId,
        replicaIds: [
          'mg-join-strict-connected-r1',
          'mg-join-strict-connected-r2',
          'mg-join-strict-connected-r3',
        ],
        transport: router,
      });

      service.initialized = true;
      service.isJoiningExistingGroup = true;
      router.getConnectionState = (targetNodeId) => {
        return targetNodeId === 'seed-node' ? STATE.CONNECTED : STATE.CONNECTED;
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-join-strict-connected',
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.NODES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
          [COLUMN.LAST_HEARTBEAT]: Date.now(),
          [COLUMN.READY_LEASE_EXPIRES_AT]: null,
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-join-strict-connected-r2',
          [COLUMN.GROUP_ID]: 'mg-join-strict-connected',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]: 'seed-node/message-group/mg-join-strict-connected-r2',
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );

      const readiness = service.getMetadataIngressReadiness({
        requiredTables: [TABLES.NODES, TABLES.NODE_ENDPOINTS],
      });

      t.equal(
        readiness.ready,
        true,
        'join convergence should accept the connected canonical leader before ready lease publication completes',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC does not exclude authoritative remote target solely because the replica id matches during move',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-move-self-target',
        replicaId: 'mg-move-self-target-r1',
        nodeId,
        replicaIds: [
          'mg-move-self-target-r1',
          'mg-move-self-target-r2',
          'mg-move-self-target-r3',
        ],
        transport: router,
      });

      service.isJoiningExistingGroup = true;
      router.getConnectionState = () => STATE.CONNECTED;

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-move-self-target',
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.NODES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.CONNECTION_STATE]: STATE.READY,
          [COLUMN.LAST_HEARTBEAT]: Date.now(),
          [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() + 60_000,
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-move-self-target-r1',
          [COLUMN.GROUP_ID]: 'mg-move-self-target',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]: 'seed-node/message-group/mg-move-self-target-r1',
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );

      const selection = service.resolveCDCForwardSelection({
        tableName: TABLES.NODES,
      });

      t.equal(
        selection.targets.length,
        1,
        'move convergence should retain the authoritative remote target even when the replica id matches locally',
      );
      t.equal(
        selection.targets[0]?.address,
        'seed-node/message-group/mg-move-self-target-r1',
        'strict selection should target the authoritative remote replica rather than treating it as local',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC uses canonical bootstrap peer hints during move convergence when services cache lags',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-move-bootstrap-ingress',
        replicaId: 'mg-move-bootstrap-ingress-r1',
        nodeId,
        replicaIds: [
          'mg-move-bootstrap-ingress-r1',
          'mg-move-bootstrap-ingress-r2',
          'mg-move-bootstrap-ingress-r3',
        ],
        peerAddresses: [
          'seed-node/message-group/mg-move-bootstrap-ingress-r1',
          'seed-node/message-group/mg-move-bootstrap-ingress-r2',
          'seed-node/message-group/mg-move-bootstrap-ingress-r3',
        ],
        transport: router,
      });

      service.initialized = true;
      service.isJoiningExistingGroup = true;
      router.getConnectionState = (targetNodeId) => {
        return targetNodeId === 'seed-node' ? STATE.CONNECTED : null;
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-move-bootstrap-ingress',
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.NODES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
          [COLUMN.LAST_HEARTBEAT]: Date.now(),
          [COLUMN.READY_LEASE_EXPIRES_AT]: null,
        },
      );

      const readiness = service.getMetadataIngressReadiness({
        requiredTables: [TABLES.NODES, TABLES.NODE_ENDPOINTS],
      });
      const selection = service.resolveCDCForwardSelection({
        tableName: TABLES.NODES,
      });

      t.equal(
        readiness.ready,
        true,
        'join convergence should keep strict metadata ingress available from canonical bootstrap peer hints while services cache catches up',
      );
      t.equal(
        selection.targets[0]?.address,
        'seed-node/message-group/mg-move-bootstrap-ingress-r1',
        'strict selection should target the canonical leader-node bootstrap peer when no services row is available yet',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC uses live leader bootstrap hints during join convergence before authoritative leader rows arrive',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-join-live-hint',
        replicaId: 'mg-join-live-hint-r2',
        nodeId,
        replicaIds: [
          'mg-join-live-hint-r1',
          'mg-join-live-hint-r2',
          'mg-join-live-hint-r3',
        ],
        peerAddresses: [
          'seed-node/message-group/mg-join-live-hint-r1',
          'seed-node/message-group/mg-join-live-hint-r2',
          'seed-node/message-group/mg-join-live-hint-r3',
        ],
        transport: router,
      });

      service.initialized = true;
      service.isJoiningExistingGroup = true;
      service.raft = {state: LifeRaft.FOLLOWER};
      service.leaderId = 'mg-join-live-hint-r1';
      router.getConnectionState = (targetNodeId) => {
        return targetNodeId === 'seed-node' ? STATE.CONNECTED : null;
      };

      const readiness = service.getMetadataIngressReadiness({
        requiredTables: [TABLES.NODES, TABLES.NODE_ENDPOINTS],
      });
      const selection = service.resolveCDCForwardSelection({
        tableName: TABLES.NODES,
      });

      t.equal(
        readiness.ready,
        true,
        'join convergence should keep strict metadata ingress available when live leader identity is known but authoritative rows have not arrived yet',
      );
      t.equal(
        selection.targets[0]?.address,
        'seed-node/message-group/mg-join-live-hint-r1',
        'strict selection should resolve the live leader through canonical bootstrap hints when the services cache is still empty',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - metadata ingress forwarding reuses canonical target selection',
  async (t) => {
    const transport = {
      async deliver() {
        return {acknowledged: true};
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r2',
      nodeId: 'node-local',
      transport,
    });
    const forwarded = [];

    service.resolveMetadataIngressForwardSelection = async () => ({
      strictForwarding: true,
      strictForwardRetryAfterMs: 250,
      targets: [{address: 'seed-node/message-group/mg-1-r1'}],
      suppressedCount: 0,
    });
    service.sendMessage = async (targetAddress, payload) => {
      forwarded.push({targetAddress, payload});
    };

    await service.forwardMetadataIngressPayloadToLeader(
      {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      },
      {
        requiredTables: [TABLES.NODES],
        forwardedByNodeId: 'node-forwarder',
      },
    );

    t.same(
      forwarded,
      [{
        targetAddress: 'seed-node/message-group/mg-1-r1',
        payload: {
          [ControlPlaneField.TYPE]:
            ControlPlaneMessageType.NODE_STATE_UPDATE,
          [ControlPlaneField.FORWARDED_BY]: ['node-forwarder'],
        },
      }],
      'metadata ingress forwarding should use the canonical target selection and forwarded-by field',
    );
  },
);
